from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, get_current_user, get_db_session, require_permission
from app.models.enums import RoleEnum
from app.models.lab_request import NdtLabRequestModel
from app.models.user import User
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

router = APIRouter(prefix="/api/lab-requests", tags=["lab-requests"])


def _build_lab_request(payload: NdtLabRequestCreate) -> NdtLabRequestModel:
    now = datetime.now(timezone.utc)
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
        requested_method=payload.requested_method.strip(),
        joint_ids=payload.joint_ids,
        status=payload.status.strip(),
        accepted_at=payload.accepted_at,
        accepted_by=payload.accepted_by.strip() if payload.accepted_by else None,
        completed_at=payload.completed_at,
        notes=payload.notes.strip() if payload.notes else None,
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
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> NdtLabRequestOut:
    """
    Create a new NDT laboratory request (PTO or PIL or ADMIN).
    Dispatches SSE event `lab_request.created`.
    """
    if current_user.role not in (RoleEnum.ADMIN, RoleEnum.PTO, RoleEnum.PIL):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для создания заявки на НК.",
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

    lab_req = _build_lab_request(payload)
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
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> NdtLabRequestOut:
    """
    Update an NDT lab request (status update, accept, conclusion, notes).
    Guarded with row-level OCC versioning.
    Dispatches SSE event `lab_request.updated`.
    """
    if current_user.role not in (RoleEnum.ADMIN, RoleEnum.PTO, RoleEnum.PIL):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для изменения заявки на НК.",
        )

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

    patch_data = payload.model_dump(exclude_unset=True)
    enforce_optimistic_lock(
        entity_type="lab_request",
        entity_obj=lab_req,
        expected_version=expected_version,
        patch_data=patch_data,
        schema_cls=NdtLabRequestOut,
    )

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


@router.delete("/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lab_request(
    request_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_permission("can_manage_users")),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    """
    Delete an NDT lab request. Strictly restricted to ADMIN.
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
