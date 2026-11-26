from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_client_ip,
    get_current_user,
    get_db_session,
    require_dept_access,
)
from app.models.enums import ControlResultEnum, DepartmentEnum, RecordStatusEnum, SystemRoleEnum
from app.models.joint import WeldJoint
from app.models.lab_request import NdtLabRequestModel
from app.models.user import User
from app.schemas.auth import RecordStatusChangeRequest
from app.schemas.domain import (
    NdtLabRequestCreate,
    NdtLabRequestOut,
    NdtLabRequestUpdate,
    PaginatedResponse,
)
from app.services.audit_service import extract_changed_fields, record_audit_log
from app.services.crud_helpers import (
    apply_patch_fields,
    enforce_optimistic_lock,
    orm_snapshot,
    raise_duplicate_error,
)
from app.services.event_bus import event_bus
from app.services.lab_conclusions import (
    check_joint_methods_completed,
    normalize_requested_methods,
)
from app.services.rbac import (
    assert_can_mutate_record,
    assert_can_transition_record_status,
)

router = APIRouter(prefix="/api/lab-requests", tags=["lab-requests"])
LAB_REQ_ALLOWED_DEPTS = (DepartmentEnum.PTO, DepartmentEnum.PIL)

VALID_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "Подана ПТО": {"Подана ПТО", "В работе ЛНК", "Отклонена"},
    "Новая": {"Новая", "В работе ЛНК", "Отклонена"},
    "В работе ЛНК": {"В работе ЛНК", "Выполнена", "Отклонена", "Подана ПТО"},
    "Отклонена": {"Отклонена", "Подана ПТО"},
    "Выполнена": {"Выполнена"},  # Terminal status; reopen requires SUPERADMIN
}


def _build_lab_request(
    payload: NdtLabRequestCreate,
    created_by_id: uuid.UUID | None = None,
) -> NdtLabRequestModel:
    now = datetime.now(timezone.utc)
    methods_list, method_str = normalize_requested_methods(
        payload.requested_methods, payload.requested_method
    )
    return NdtLabRequestModel(
        id=payload.id or uuid.uuid4(),
        request_number=payload.request_number.strip(),
        created_at=payload.created_at or now,
        created_date=payload.created_date.strip(),
        created_by=payload.created_by.strip(),
        object_name=payload.object_name.strip(),
        rd_code=payload.rd_code.strip(),
        line_number=payload.line_number.strip(),
        unique_line_id=payload.unique_line_id.strip(),
        contour=payload.contour.strip(),
        control_stage=payload.control_stage.strip(),
        requested_method=method_str[:64],
        requested_methods=methods_list,
        joint_ids=payload.joint_ids,
        status="Подана ПТО",
        accepted_at=None,
        accepted_by=None,
        completed_at=None,
        notes=payload.notes.strip() if payload.notes else None,
        record_status=RecordStatusEnum.DRAFT,
        created_by_id=created_by_id,
        version=1,
        updated_at=now,
    )


@router.get("", response_model=PaginatedResponse[NdtLabRequestOut])
async def list_lab_requests(
    status_filter: str | None = Query(default=None, alias="status"),
    object_name: str | None = Query(default=None),
    rd_code: str | None = Query(default=None),
    unique_line_id: str | None = Query(default=None),
    limit: int = Query(default=1000, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> PaginatedResponse[NdtLabRequestOut]:
    """Retrieve paginated list of NDT lab requests."""
    stmt = select(NdtLabRequestModel)
    if status_filter:
        stmt = stmt.where(NdtLabRequestModel.status == status_filter.strip())
    if object_name:
        stmt = stmt.where(NdtLabRequestModel.object_name == object_name.strip())
    if rd_code:
        stmt = stmt.where(NdtLabRequestModel.rd_code == rd_code.strip())
    if unique_line_id:
        stmt = stmt.where(NdtLabRequestModel.unique_line_id == unique_line_id.strip())

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_res = await session.execute(count_stmt)
    total = total_res.scalar_one()

    stmt = stmt.order_by(NdtLabRequestModel.created_at.desc()).offset(offset).limit(limit)
    res = await session.execute(stmt)
    items = [NdtLabRequestOut.model_validate(item) for item in res.scalars().all()]

    return PaginatedResponse(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{request_id}", response_model=NdtLabRequestOut)
async def get_lab_request(
    request_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> NdtLabRequestOut:
    """Retrieve a single NDT lab request by UUID."""
    req = (
        await session.execute(
            select(NdtLabRequestModel).where(NdtLabRequestModel.id == request_id)
        )
    ).scalar_one_or_none()
    if req is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Заявка на НК {request_id} не найдена.",
        )
    return NdtLabRequestOut.model_validate(req)


@router.post("", response_model=NdtLabRequestOut, status_code=status.HTTP_201_CREATED)
async def create_lab_request(
    payload: NdtLabRequestCreate,
    request: Request,
    current_user: User = Depends(require_dept_access(LAB_REQ_ALLOWED_DEPTS, SystemRoleEnum.OPERATOR)),
    session: AsyncSession = Depends(get_db_session),
) -> NdtLabRequestOut:
    """
    Create a new NDT laboratory request (PTO or PIL or SUPERADMIN).
    Validates joint existence, line attribution, prevents duplicates,
    and initializes status to 'Подана ПТО'.
    Dispatches SSE event `lab_request.created`.
    """
    assert_can_mutate_record(
        user=current_user,
        record=None,
        allowed_departments=LAB_REQ_ALLOWED_DEPTS,
        operation="create",
    )

    req_num = payload.request_number.strip()
    existing = (
        await session.execute(
            select(NdtLabRequestModel).where(NdtLabRequestModel.request_number == req_num)
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise_duplicate_error(
            "DUPLICATE_REQUEST_NUMBER",
            f"Заявка с номером «{req_num}» уже зарегистрирована в системе.",
            details={"request_number": req_num},
        )

    # 1. Joint list must not be empty
    if not payload.joint_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Заявка на НК должна содержать хотя бы один стык.",
        )

    # 2. Validate existence and line attribution of all joints
    joint_uuids: list[uuid.UUID] = []
    joint_str_ids: list[str] = []
    for jid in payload.joint_ids:
        try:
            joint_uuids.append(uuid.UUID(str(jid)))
        except (ValueError, TypeError):
            joint_str_ids.append(str(jid))

    conditions = []
    if joint_uuids:
        conditions.append(WeldJoint.id.in_(joint_uuids))
    if joint_str_ids:
        conditions.append(WeldJoint.legacy_id.in_(joint_str_ids))

    joints_res = await session.execute(select(WeldJoint).where(or_(*conditions)))
    found_joints = joints_res.scalars().all()

    found_keys: set[str] = set()
    for j in found_joints:
        found_keys.add(str(j.id))
        if j.legacy_id:
            found_keys.add(j.legacy_id)

    missing_keys = [str(jid) for jid in payload.joint_ids if str(jid) not in found_keys]
    if missing_keys:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Стыки с идентификаторами {missing_keys} не найдены в базе данных.",
        )

    req_line_id = payload.unique_line_id.strip()
    foreign_joints = [
        j.joint_number
        for j in found_joints
        if j.unique_line_id and j.unique_line_id.strip() != req_line_id
    ]
    if foreign_joints:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Стыки [{', '.join(foreign_joints[:5])}] не принадлежат указанной линии «{req_line_id}»."
            ),
        )

    # 3. Guard against duplicate active requests for the same joints with the same method
    active_reqs_res = await session.execute(
        select(NdtLabRequestModel).where(
            NdtLabRequestModel.unique_line_id == req_line_id,
            NdtLabRequestModel.status.in_(["Подана ПТО", "Новая", "В работе ЛНК"]),
        )
    )
    active_requests = active_reqs_res.scalars().all()
    req_methods, _ = normalize_requested_methods(
        payload.requested_methods, payload.requested_method
    )
    req_methods_set = set(req_methods)
    req_stage_norm = payload.control_stage.strip().upper()
    payload_joint_set = {str(jid) for jid in payload.joint_ids}

    for act_req in active_requests:
        act_methods, _ = normalize_requested_methods(
            getattr(act_req, "requested_methods", None), act_req.requested_method
        )
        method_overlap = req_methods_set & set(act_methods)
        act_stage_norm = act_req.control_stage.strip().upper()
        if method_overlap and act_stage_norm == req_stage_norm:
            act_joints = {str(x) for x in (act_req.joint_ids or [])}
            overlap = payload_joint_set & act_joints
            if overlap:
                overlap_methods_str = ', '.join(sorted(method_overlap))
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"Стыки {list(overlap)} уже включены в активную заявку "
                        f"№{act_req.request_number} (статус «{act_req.status}») по методам: {overlap_methods_str}."
                    ),
                )

    lab_req = _build_lab_request(payload, created_by_id=current_user.id)
    session.add(lab_req)
    await session.flush()
    await session.refresh(lab_req)

    await record_audit_log(
        session,
        user=current_user,
        entity_type="lab_request",
        entity_id=lab_req.id,
        action="CREATE",
        old_data=None,
        new_data=orm_snapshot(lab_req),
        ip_address=get_client_ip(request),
        unique_line_id=lab_req.unique_line_id,
        rd_code=lab_req.rd_code,
        summary=f"Создание заявки на НК {lab_req.request_number}",
    )

    out = NdtLabRequestOut.model_validate(lab_req)
    await event_bus.emit_delta(
        session,
        event="lab_request.created",
        entity_type="lab_request",
        entity_id=str(lab_req.id),
        version=lab_req.version,
        updated_by=current_user.full_name or current_user.login,
        data=out.model_dump(mode="json"),
    )
    return out


@router.patch("/{request_id}", response_model=NdtLabRequestOut)
async def update_lab_request(
    request_id: uuid.UUID,
    payload: NdtLabRequestUpdate,
    request: Request,
    expected_version: int | None = Query(default=None, alias="version"),
    current_user: User = Depends(require_dept_access(LAB_REQ_ALLOWED_DEPTS, SystemRoleEnum.OPERATOR)),
    session: AsyncSession = Depends(get_db_session),
) -> NdtLabRequestOut:
    """
    Update an NDT lab request (status update, accept, conclusion, notes).
    Guarded with row-level OCC versioning, record_status lock, and FSM transitions.
    Dispatches SSE event `lab_request.updated`.
    """
    lab_req = (
        await session.execute(
            select(NdtLabRequestModel).where(NdtLabRequestModel.id == request_id)
        )
    ).scalar_one_or_none()
    if lab_req is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Заявка на НК {request_id} не найдена.",
        )

    assert_can_mutate_record(
        user=current_user,
        record=lab_req,
        allowed_departments=LAB_REQ_ALLOWED_DEPTS,
        operation="update",
    )

    is_superadmin = current_user.role == SystemRoleEnum.SUPERADMIN
    is_pil_or_superadmin = is_superadmin or current_user.department == DepartmentEnum.PIL
    patch_data = payload.model_dump(exclude_unset=True)

    # 1. Protection against changing joint_ids in in-progress or completed requests
    if "joint_ids" in patch_data and patch_data["joint_ids"] != lab_req.joint_ids:
        if lab_req.status in ("В работе ЛНК", "Выполнена") and not is_superadmin:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Изменение состава стыков в заявке, находящейся в работе или выполненной, запрещено.",
            )

    # 2. Status FSM and Role Transitions
    if "status" in patch_data and patch_data["status"] != lab_req.status:
        new_status = patch_data["status"]
        allowed = VALID_STATUS_TRANSITIONS.get(lab_req.status, set())
        if new_status not in allowed and not is_superadmin:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Недопустимый переход статуса заявки: из «{lab_req.status}» в «{new_status}».",
            )

        now = datetime.now(timezone.utc)
        if new_status == "В работе ЛНК":
            if not is_pil_or_superadmin:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Принять заявку в работу может только сотрудник ЛНК (PIL) или Суперадмин.",
                )
            patch_data.setdefault("accepted_at", now)
            patch_data.setdefault("accepted_by", current_user.full_name or current_user.login)

        elif new_status == "Выполнена":
            if not is_pil_or_superadmin:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Завершить заявку может только сотрудник ЛНК (PIL) или Суперадмин.",
                )

            # Check joints completion in database
            joint_ids_to_check = patch_data.get("joint_ids", lab_req.joint_ids) or []
            if joint_ids_to_check:
                joint_uuids: list[uuid.UUID] = []
                joint_str_ids: list[str] = []
                for jid in joint_ids_to_check:
                    try:
                        joint_uuids.append(uuid.UUID(str(jid)))
                    except (ValueError, TypeError):
                        joint_str_ids.append(str(jid))

                conditions = []
                if joint_uuids:
                    conditions.append(WeldJoint.id.in_(joint_uuids))
                if joint_str_ids:
                    conditions.append(WeldJoint.legacy_id.in_(joint_str_ids))

                if conditions:
                    joints_res = await session.execute(select(WeldJoint).where(or_(*conditions)))
                    joints = joints_res.scalars().all()

                    unverified: list[str] = []
                    methods_to_check, _ = normalize_requested_methods(
                        patch_data.get("requested_methods") or getattr(lab_req, "requested_methods", None),
                        patch_data.get("requested_method") or lab_req.requested_method,
                    )
                    for j in joints:
                        missing_for_j = check_joint_methods_completed(j, methods_to_check)
                        if missing_for_j:
                            unverified.append(f"{j.joint_number} ({', '.join(missing_for_j)})")

                    if unverified and not is_superadmin:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=(
                                f"Невозможно перевести заявку в «Выполнена»: для стыков "
                                f"[{', '.join(unverified[:5])}] отсутствуют подтверждённые результаты контроля."
                            ),
                        )
            patch_data.setdefault("completed_at", now)

    enforce_optimistic_lock(
        entity_type="lab_request",
        entity_obj=lab_req,
        expected_version=expected_version,
        patch_data=patch_data,
        schema_cls=NdtLabRequestOut,
    )

    if "requested_methods" in patch_data or "requested_method" in patch_data:
        norm_methods, norm_str = normalize_requested_methods(
            patch_data.get("requested_methods") if "requested_methods" in patch_data else getattr(lab_req, "requested_methods", None),
            patch_data.get("requested_method") if "requested_method" in patch_data else lab_req.requested_method,
        )
        patch_data["requested_methods"] = norm_methods
        patch_data["requested_method"] = norm_str[:64]

    old_snap = orm_snapshot(lab_req)
    apply_patch_fields(lab_req, patch_data)
    lab_req.updated_at = datetime.now(timezone.utc)

    await session.flush()
    await session.refresh(lab_req)

    diff_old, diff_new = extract_changed_fields(old_snap, orm_snapshot(lab_req))
    if diff_old or diff_new:
        await record_audit_log(
            session,
            user=current_user,
            entity_type="lab_request",
            entity_id=lab_req.id,
            action="UPDATE",
            old_data=diff_old,
            new_data=diff_new,
            ip_address=get_client_ip(request),
            unique_line_id=lab_req.unique_line_id,
            rd_code=lab_req.rd_code,
            summary=f"Обновление заявки на НК {lab_req.request_number}",
        )

    out = NdtLabRequestOut.model_validate(lab_req)
    await event_bus.emit_delta(
        session,
        event="lab_request.updated",
        entity_type="lab_request",
        entity_id=str(lab_req.id),
        version=lab_req.version,
        updated_by=current_user.full_name or current_user.login,
        data=out.model_dump(mode="json"),
    )
    return out


@router.patch("/{request_id}/status", response_model=NdtLabRequestOut)
async def change_lab_request_record_status(
    request_id: uuid.UUID,
    payload: RecordStatusChangeRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> NdtLabRequestOut:
    lab_req = (
        await session.execute(
            select(NdtLabRequestModel).where(NdtLabRequestModel.id == request_id)
        )
    ).scalar_one_or_none()
    if lab_req is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Заявка на НК {request_id} не найдена.",
        )

    assert_can_transition_record_status(
        user=current_user,
        record=lab_req,
        target_status=payload.record_status,
        allowed_departments=LAB_REQ_ALLOWED_DEPTS,
        reason=payload.reason,
    )
    if payload.version is not None:
        enforce_optimistic_lock(
            entity_type="lab_request",
            entity_obj=lab_req,
            expected_version=payload.version,
            patch_data={"record_status": payload.record_status.value},
            schema_cls=NdtLabRequestOut,
        )

    old_status = lab_req.record_status.value
    is_unlock = (
        lab_req.record_status == RecordStatusEnum.LOCKED
        and payload.record_status != RecordStatusEnum.LOCKED
    )
    lab_req.record_status = payload.record_status
    lab_req.version += 1
    lab_req.updated_at = datetime.now(timezone.utc)
    await session.flush()
    await session.refresh(lab_req)

    await record_audit_log(
        session,
        user=current_user,
        entity_type="lab_request",
        entity_id=lab_req.id,
        action="RECORD_UNLOCKED" if is_unlock else "RECORD_STATUS_CHANGED",
        old_data={"record_status": old_status},
        new_data={
            "record_status": lab_req.record_status.value,
            **({"reason": payload.reason.strip()} if payload.reason and payload.reason.strip() else {}),
        },
        ip_address=get_client_ip(request),
        unique_line_id=lab_req.unique_line_id,
        rd_code=lab_req.rd_code,
        summary=(
            f"Снята блокировка заявки НК {lab_req.request_number} ({old_status} -> {lab_req.record_status.value}): {payload.reason}"
            if is_unlock
            else f"Изменён статус заявки НК {lab_req.request_number}: {old_status} -> {lab_req.record_status.value}"
        ),
    )

    out = NdtLabRequestOut.model_validate(lab_req)
    await event_bus.emit_delta(
        session,
        event="lab_request.updated",
        entity_type="lab_request",
        entity_id=str(lab_req.id),
        version=lab_req.version,
        updated_by=current_user.full_name or current_user.login,
        data=out.model_dump(mode="json"),
    )
    return out


@router.delete("/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lab_request(
    request_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_dept_access(LAB_REQ_ALLOWED_DEPTS, SystemRoleEnum.DEPT_ADMIN)),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    """
    Delete an NDT lab request (DEPT_ADMIN of PTO/PIL or SUPERADMIN; blocked if LOCKED).
    Dispatches SSE event `lab_request.deleted`.
    """
    lab_req = (
        await session.execute(
            select(NdtLabRequestModel).where(NdtLabRequestModel.id == request_id)
        )
    ).scalar_one_or_none()
    if lab_req is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Заявка на НК {request_id} не найдена.",
        )

    assert_can_mutate_record(
        user=current_user,
        record=lab_req,
        allowed_departments=LAB_REQ_ALLOWED_DEPTS,
        operation="delete",
    )

    old_snap = orm_snapshot(lab_req)
    await session.delete(lab_req)
    await session.flush()

    await record_audit_log(
        session,
        user=current_user,
        entity_type="lab_request",
        entity_id=request_id,
        action="DELETE",
        old_data=old_snap,
        new_data=None,
        ip_address=get_client_ip(request),
        unique_line_id=lab_req.unique_line_id,
        rd_code=lab_req.rd_code,
        summary=f"Удаление заявки на НК {lab_req.request_number}",
    )

    await event_bus.emit_delta(
        session,
        event="lab_request.deleted",
        entity_type="lab_request",
        entity_id=str(request_id),
        version=lab_req.version,
        updated_by=current_user.full_name or current_user.login,
        data={"deleted": True},
    )
