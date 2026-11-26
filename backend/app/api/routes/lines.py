from __future__ import annotations

import dataclasses
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only, selectinload

from app.api.deps import (
    get_client_ip,
    get_current_user,
    get_db_session,
    require_dept_access,
)
from app.models.enums import DepartmentEnum, RecordStatusEnum, SystemRoleEnum
from app.models.executive_doc import ExecutiveDoc
from app.models.joint import WeldJoint
from app.models.line import ProjectLine
from app.models.user import User
from app.schemas.auth import RecordStatusChangeRequest
from app.schemas.domain import (
    LineCompletionStatusOut,
    LineNdtProgressOut,
    PaginatedResponse,
    ProjectLineBatchDeleteRequest,
    ProjectLineBatchDeleteResponse,
    ProjectLineBatchImportRequest,
    ProjectLineBatchImportResponse,
    ProjectLineBatchUpdateRequest,
    ProjectLineBatchUpdateResponse,
    ProjectLineCreate,
    ProjectLineOut,
    ProjectLineUpdate,
)
from app.schemas.executive_doc import ExecutiveDocOut
from app.services.audit_service import extract_changed_fields, record_audit_log
from app.services.crud_helpers import (
    apply_patch_fields,
    enforce_optimistic_lock,
    orm_snapshot,
    raise_duplicate_error,
    raise_referential_integrity_error,
)
from app.services.domain_validation import build_unique_line_id
from app.services.event_bus import event_bus
from app.services.rbac import (
    assert_can_mutate_record,
    assert_can_transition_record_status,
)
from app.services.readiness_service import (
    calculate_line_ndt_progress,
    compute_line_list_item_status,
)

router = APIRouter(prefix="/api/lines", tags=["lines"])
LINE_ALLOWED_DEPTS = (DepartmentEnum.PTO,)

# Облегчённая проекция колонок WeldJoint для расчёта статуса готовности и квот НК линии:
# исключает ~50 тяжёлых текстовых полей материалов, сертификатов, температур и журналов.
LINE_STATUS_JOINT_PROJECTION = load_only(
    WeldJoint.id,
    WeldJoint.line_id,
    WeldJoint.unique_line_id,
    WeldJoint.diameter_mm,
    WeldJoint.diameter_inch,
    WeldJoint.equiv_diameter_inch,
    WeldJoint.wall_thickness,
    WeldJoint.welding_date,
    WeldJoint.welder_stamp,
    WeldJoint.welder_stamps_list,
    WeldJoint.vik_result,
    WeldJoint.ndt_type,
    WeldJoint.ndt_result,
    WeldJoint.dup_ndt_type,
    WeldJoint.dup_ndt_result,
    WeldJoint.repair_action,
    WeldJoint.repair_vik_result,
    WeldJoint.repair_ndt_type,
    WeldJoint.repair_ndt_result,
    WeldJoint.repair_dup_ndt_type,
    WeldJoint.repair_dup_ndt_result,
)


def _line_to_out(line: ProjectLine, line_joints: list[WeldJoint]) -> ProjectLineOut:
    status_dc = compute_line_list_item_status(line, line_joints)
    out = ProjectLineOut.model_validate(line)
    out.computed_status = LineCompletionStatusOut(
        is_completed=status_dc.is_completed,
        total_joints=status_dc.total_joints,
        welded_joints=status_dc.welded_joints,
        controlled_joints=status_dc.controlled_joints,
        joints_readiness_pct=status_dc.joints_readiness_pct,
        total_edi=status_dc.total_edi,
        welded_edi=status_dc.welded_edi,
        edi_readiness_pct=status_dc.edi_readiness_pct,
        status_label=status_dc.status_label,
        ndt_status=status_dc.ndt_status,
        ndt_status_badge=status_dc.ndt_status_badge,
        rk_required=status_dc.rk_required,
        rk_controlled=status_dc.rk_controlled,
        uzk_required=status_dc.uzk_required,
        uzk_controlled=status_dc.uzk_controlled,
        welder_ndt_deficits=list(status_dc.welder_ndt_deficits),
    )
    return out


@router.get("", response_model=PaginatedResponse[ProjectLineOut])
async def list_lines(
    facility_id: uuid.UUID | None = Query(default=None),
    rd_code: str | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> PaginatedResponse[ProjectLineOut]:
    stmt = select(ProjectLine)
    if facility_id is not None:
        stmt = stmt.where(ProjectLine.facility_id == facility_id)
    if rd_code:
        stmt = stmt.where(ProjectLine.rd_code == rd_code.strip())
    if search:
        pat = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                ProjectLine.line_number.ilike(pat),
                ProjectLine.unique_line_id.ilike(pat),
                ProjectLine.line_name.ilike(pat),
                ProjectLine.rd_code.ilike(pat),
                ProjectLine.responsible_pto.ilike(pat),
            )
        )
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await session.execute(count_stmt)).scalar_one()

    paged_stmt = (
        stmt.options(selectinload(ProjectLine.joints).options(LINE_STATUS_JOINT_PROJECTION))
        .order_by(ProjectLine.sort_order.asc(), ProjectLine.line_number.asc())
        .limit(limit)
        .offset(offset)
    )
    page = list((await session.execute(paged_stmt)).scalars().all())

    page_joints_map: dict[uuid.UUID, list[WeldJoint]] = {}
    missing_line_ids: list[uuid.UUID] = []
    for line in page:
        loaded = getattr(line, "joints", None)
        if loaded is not None:
            page_joints_map[line.id] = list(loaded)
        else:
            missing_line_ids.append(line.id)

    if missing_line_ids:
        missing_joints = list(
            (
                await session.execute(
                    select(WeldJoint)
                    .options(LINE_STATUS_JOINT_PROJECTION)
                    .where(WeldJoint.line_id.in_(missing_line_ids))
                )
            )
            .scalars()
            .all()
        )
        for j in missing_joints:
            page_joints_map.setdefault(j.line_id, []).append(j)

    return PaginatedResponse(
        items=[_line_to_out(line, page_joints_map.get(line.id, [])) for line in page],
        total=total,
        limit=limit,
        offset=offset,
    )


async def _sync_executive_doc_from_line(
    session: AsyncSession,
    line: ProjectLine,
    *,
    current_user: User,
    now: datetime,
) -> None:
    existing_doc = (
        await session.execute(
            select(ExecutiveDoc).where(ExecutiveDoc.line_id == line.id)
        )
    ).scalar_one_or_none()
    if existing_doc is None:
        return
    doc_changed = False
    if existing_doc.id_status != line.id_status:
        existing_doc.id_status = line.id_status
        doc_changed = True
    next_pto = (line.responsible_pto or "").strip() or None
    if ((existing_doc.pto_engineer or "").strip() or None) != next_pto:
        existing_doc.pto_engineer = next_pto
        doc_changed = True
    if not doc_changed:
        return
    existing_doc.version = int(existing_doc.version) + 1
    existing_doc.updated_by_id = current_user.id
    existing_doc.updated_at = now
    await session.flush()
    doc_snap = orm_snapshot(existing_doc, ExecutiveDocOut)
    await event_bus.emit_delta(
        session,
        event="executive_doc.updated",
        entity_type="executive_doc",
        entity_id=existing_doc.line_id,
        version=existing_doc.version,
        updated_by=current_user.login,
        data=doc_snap,
    )


@router.post(
    "/batch",
    response_model=ProjectLineBatchImportResponse,
    status_code=status.HTTP_200_OK,
)
async def batch_import_lines(
    payload: ProjectLineBatchImportRequest,
    request: Request,
    current_user: User = Depends(
        require_dept_access(LINE_ALLOWED_DEPTS, SystemRoleEnum.DEPT_ADMIN)
    ),
    session: AsyncSession = Depends(get_db_session),
) -> ProjectLineBatchImportResponse:
    assert_can_mutate_record(
        user=current_user,
        record=None,
        allowed_departments=LINE_ALLOWED_DEPTS,
        operation="create",
        is_directory=True,
    )

    normalized_items: list[tuple[str, ProjectLineCreate]] = []
    for item in payload.items:
        uid_str = (
            item.unique_line_id.strip()
            if item.unique_line_id and item.unique_line_id.strip()
            else build_unique_line_id(item.rd_code, item.line_number)
        )
        normalized_items.append((uid_str, item))

    all_uids = list({uid for uid, _ in normalized_items})
    existing_rows = list(
        (
            await session.execute(
                select(ProjectLine).where(ProjectLine.unique_line_id.in_(all_uids))
            )
        )
        .scalars()
        .all()
    )
    existing_by_uid: dict[str, ProjectLine] = {
        row.unique_line_id: row for row in existing_rows
    }

    if payload.duplicate_mode == "error":
        seen_in_batch: set[str] = set()
        conflicts: list[str] = []
        for uid_str, _ in normalized_items:
            if uid_str in existing_by_uid or uid_str in seen_in_batch:
                conflicts.append(uid_str)
            seen_in_batch.add(uid_str)
        if conflicts:
            raise_duplicate_error(
                "DUPLICATE_UNIQUE_LINE_ID",
                f"Обнаружены дубликаты линий ({len(conflicts)} шт.): {', '.join(conflicts[:5])}",
                details={"duplicates": conflicts[:50]},
            )

    now = datetime.now(timezone.utc)
    created_lines: list[ProjectLine] = []
    updated_lines: list[ProjectLine] = []
    skipped_uids: list[str] = []
    errors: list[str] = []
    seen_in_batch_map: dict[str, ProjectLine] = {}

    for uid_str, item in normalized_items:
        existing_line = existing_by_uid.get(uid_str) or seen_in_batch_map.get(uid_str)
        if existing_line is not None:
            if payload.duplicate_mode == "skip":
                skipped_uids.append(uid_str)
                continue

            # mode == "update"
            try:
                assert_can_mutate_record(
                    user=current_user,
                    record=existing_line,
                    allowed_departments=LINE_ALLOWED_DEPTS,
                    operation="update",
                    is_directory=True,
                )
            except HTTPException as exc:
                skipped_uids.append(uid_str)
                errors.append(f"{uid_str}: {exc.detail}")
                continue

            old_snap = orm_snapshot(existing_line, ProjectLineOut)
            existing_line.facility_id = item.facility_id
            existing_line.object_name = item.object_name.strip()
            existing_line.rd_code = item.rd_code.strip()
            existing_line.line_number = item.line_number.strip()
            existing_line.line_name = item.line_name.strip()
            existing_line.product = item.product.strip()
            existing_line.test_contour = item.test_contour.strip()
            existing_line.welding_ntd = item.welding_ntd.strip()
            existing_line.control_ntd = item.control_ntd.strip()
            existing_line.quality_level = item.quality_level.strip()
            existing_line.pipeline_category = item.pipeline_category.strip()
            existing_line.working_pressure = item.working_pressure.strip()
            existing_line.working_temperature = item.working_temperature.strip()
            existing_line.rk_percent = item.rk_percent
            existing_line.uzk_percent = item.uzk_percent
            existing_line.pvk_percent = item.pvk_percent
            existing_line.manual_status = item.manual_status
            existing_line.test_date = item.test_date
            existing_line.id_status = item.id_status
            existing_line.responsible_pto = (
                item.responsible_pto.strip()
                if item.responsible_pto and item.responsible_pto.strip()
                else None
            )
            existing_line.version = int(existing_line.version) + 1
            existing_line.updated_by_id = current_user.id
            existing_line.updated_at = now
            await session.flush()

            await _sync_executive_doc_from_line(
                session, existing_line, current_user=current_user, now=now
            )

            new_snap = orm_snapshot(existing_line, ProjectLineOut)
            old_diff, new_diff = extract_changed_fields(old_snap, new_snap)
            await record_audit_log(
                session,
                action="UPDATE",
                entity_type="project_line",
                entity_id=str(existing_line.id),
                user=current_user,
                old_data=old_diff,
                new_data=new_diff,
                ip_address=get_client_ip(request),
                unique_line_id=existing_line.unique_line_id,
                rd_code=existing_line.rd_code,
                summary=f"Импорт-обновление линии «{existing_line.unique_line_id}»",
            )
            await event_bus.emit_delta(
                session,
                event="line.updated",
                entity_type="project_line",
                entity_id=existing_line.id,
                version=existing_line.version,
                updated_by=current_user.login,
                data=new_snap,
            )
            if existing_line not in updated_lines and existing_line not in created_lines:
                updated_lines.append(existing_line)
            continue

        new_line = ProjectLine(
            id=uuid.uuid4(),
            legacy_id=item.legacy_id,
            facility_id=item.facility_id,
            object_name=item.object_name.strip(),
            rd_code=item.rd_code.strip(),
            line_number=item.line_number.strip(),
            unique_line_id=uid_str,
            line_name=item.line_name.strip(),
            product=item.product.strip(),
            test_contour=item.test_contour.strip(),
            welding_ntd=item.welding_ntd.strip(),
            control_ntd=item.control_ntd.strip(),
            quality_level=item.quality_level.strip(),
            pipeline_category=item.pipeline_category.strip(),
            working_pressure=item.working_pressure.strip(),
            working_temperature=item.working_temperature.strip(),
            rk_percent=item.rk_percent,
            uzk_percent=item.uzk_percent,
            pvk_percent=item.pvk_percent,
            manual_status=item.manual_status,
            test_date=item.test_date,
            id_status=item.id_status,
            responsible_pto=(
                item.responsible_pto.strip()
                if item.responsible_pto and item.responsible_pto.strip()
                else None
            ),
            sort_order=item.sort_order,
            record_status=RecordStatusEnum.DRAFT,
            created_by_id=current_user.id,
            version=1,
            updated_by_id=current_user.id,
            created_at=now,
            updated_at=now,
        )
        session.add(new_line)
        await session.flush()
        seen_in_batch_map[uid_str] = new_line

        snapshot = orm_snapshot(new_line, ProjectLineOut)
        await record_audit_log(
            session,
            action="CREATE",
            entity_type="project_line",
            entity_id=str(new_line.id),
            user=current_user,
            new_data=snapshot,
            ip_address=get_client_ip(request),
            unique_line_id=new_line.unique_line_id,
            rd_code=new_line.rd_code,
            summary=f"Импорт линии «{new_line.unique_line_id}»",
        )
        await event_bus.emit_delta(
            session,
            event="line.created",
            entity_type="project_line",
            entity_id=new_line.id,
            version=new_line.version,
            updated_by=current_user.login,
            data=snapshot,
        )
        created_lines.append(new_line)

    updated_joints_map: dict[uuid.UUID, list[WeldJoint]] = {}
    if updated_lines:
        upd_ids = [ln.id for ln in updated_lines]
        upd_joints = list(
            (
                await session.execute(
                    select(WeldJoint)
                    .options(LINE_STATUS_JOINT_PROJECTION)
                    .where(WeldJoint.line_id.in_(upd_ids))
                )
            )
            .scalars()
            .all()
        )
        for j in upd_joints:
            if j.line_id is not None:
                updated_joints_map.setdefault(j.line_id, []).append(j)

    return ProjectLineBatchImportResponse(
        created=[_line_to_out(ln, []) for ln in created_lines],
        updated=[
            _line_to_out(ln, updated_joints_map.get(ln.id, []))
            for ln in updated_lines
        ],
        skipped=skipped_uids,
        errors=errors,
    )


@router.patch(
    "/batch",
    response_model=ProjectLineBatchUpdateResponse,
    status_code=status.HTTP_200_OK,
)
async def batch_update_lines(
    payload: ProjectLineBatchUpdateRequest,
    request: Request,
    current_user: User = Depends(
        require_dept_access(LINE_ALLOWED_DEPTS, SystemRoleEnum.DEPT_ADMIN)
    ),
    session: AsyncSession = Depends(get_db_session),
) -> ProjectLineBatchUpdateResponse:
    target_ids = [item.id for item in payload.items]
    existing_rows = list(
        (
            await session.execute(
                select(ProjectLine).where(ProjectLine.id.in_(target_ids))
            )
        )
        .scalars()
        .all()
    )
    lines_by_id = {row.id: row for row in existing_rows}

    missing_ids = [str(tid) for tid in target_ids if tid not in lines_by_id]
    if missing_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Не найдены линии для обновления ({len(missing_ids)} шт.).",
        )

    # 1. Pre-validate permissions, OCC versions, and unique_line_id collisions atomically
    candidate_uids: dict[uuid.UUID, str] = {}
    for item in payload.items:
        line = lines_by_id[item.id]
        assert_can_mutate_record(
            user=current_user,
            record=line,
            allowed_departments=LINE_ALLOWED_DEPTS,
            operation="update",
            is_directory=True,
        )
        patch_data = item.model_dump(exclude_unset=True)
        patch_data.pop("id", None)
        enforce_optimistic_lock(
            entity_type="project_line",
            entity_obj=line,
            expected_version=item.version,
            patch_data=patch_data,
            schema_cls=ProjectLineOut,
        )
        next_rd = patch_data.get("rd_code", line.rd_code)
        next_num = patch_data.get("line_number", line.line_number)
        next_uid = patch_data.get("unique_line_id") or build_unique_line_id(
            next_rd, next_num
        )
        candidate_uids[line.id] = next_uid

    if len(set(candidate_uids.values())) != len(candidate_uids):
        raise_duplicate_error(
            "DUPLICATE_UNIQUE_LINE_ID",
            "Групповое обновление создаёт дублирующиеся идентификаторы линий в одном шифре РД.",
        )

    colliding = list(
        (
            await session.execute(
                select(ProjectLine).where(
                    ProjectLine.unique_line_id.in_(list(candidate_uids.values())),
                    ~ProjectLine.id.in_(target_ids),
                )
            )
        )
        .scalars()
        .all()
    )
    if colliding:
        raise_duplicate_error(
            "DUPLICATE_UNIQUE_LINE_ID",
            f"Конфликт уникальности линий: {', '.join(c.unique_line_id for c in colliding[:5])}",
            details={"duplicates": [c.unique_line_id for c in colliding[:50]]},
        )

    now = datetime.now(timezone.utc)
    updated_lines: list[ProjectLine] = []
    updated_joints_count = 0

    for item in payload.items:
        line = lines_by_id[item.id]
        old_uid = line.unique_line_id
        old_obj = line.object_name
        old_rd = line.rd_code
        old_num = line.line_number
        old_contour = line.test_contour

        patch_data = item.model_dump(exclude_unset=True)
        patch_data.pop("id", None)
        if "responsible_pto" in patch_data and isinstance(
            patch_data["responsible_pto"], str
        ):
            stripped_pto = patch_data["responsible_pto"].strip()
            patch_data["responsible_pto"] = stripped_pto or None

        old_snap = orm_snapshot(line, ProjectLineOut)
        apply_patch_fields(line, patch_data)
        if (
            ("rd_code" in patch_data or "line_number" in patch_data)
            and "unique_line_id" not in patch_data
        ):
            line.unique_line_id = build_unique_line_id(line.rd_code, line.line_number)
        line.updated_by_id = current_user.id
        line.updated_at = now
        await session.flush()

        if "id_status" in patch_data or "responsible_pto" in patch_data:
            await _sync_executive_doc_from_line(
                session, line, current_user=current_user, now=now
            )

        if payload.cascade_joints and (
            line.object_name != old_obj
            or line.rd_code != old_rd
            or line.line_number != old_num
            or line.unique_line_id != old_uid
            or line.test_contour != old_contour
        ):
            linked_joints = list(
                (
                    await session.execute(
                        select(WeldJoint).where(
                            or_(
                                WeldJoint.line_id == line.id,
                                WeldJoint.unique_line_id == old_uid,
                            )
                        )
                    )
                )
                .scalars()
                .all()
            )
            for j in linked_joints:
                j.line_id = line.id
                j.object_name = line.object_name
                j.rd_code = line.rd_code
                j.line_number = line.line_number
                j.unique_line_id = line.unique_line_id
                if line.test_contour != old_contour and not j.test_circuit_id:
                    j.contour = line.test_contour
                j.version = int(j.version) + 1
                j.updated_by_id = current_user.id
                j.updated_at = now
                updated_joints_count += 1
            if linked_joints:
                await session.flush()

        new_snap = orm_snapshot(line, ProjectLineOut)
        old_diff, new_diff = extract_changed_fields(old_snap, new_snap)
        await record_audit_log(
            session,
            action="UPDATE",
            entity_type="project_line",
            entity_id=str(line.id),
            user=current_user,
            old_data=old_diff,
            new_data=new_diff,
            ip_address=get_client_ip(request),
            unique_line_id=line.unique_line_id,
            rd_code=line.rd_code,
            summary=f"Групповое обновление линии «{line.unique_line_id}» (v{line.version})",
        )
        await event_bus.emit_delta(
            session,
            event="line.updated",
            entity_type="project_line",
            entity_id=line.id,
            version=line.version,
            updated_by=current_user.login,
            data=new_snap,
        )
        updated_lines.append(line)

    joints_by_line: dict[uuid.UUID, list[WeldJoint]] = {}
    all_page_joints = list(
        (
            await session.execute(
                select(WeldJoint)
                .options(LINE_STATUS_JOINT_PROJECTION)
                .where(WeldJoint.line_id.in_(target_ids))
            )
        )
        .scalars()
        .all()
    )
    for j in all_page_joints:
        if j.line_id is not None:
            joints_by_line.setdefault(j.line_id, []).append(j)

    return ProjectLineBatchUpdateResponse(
        items=[
            _line_to_out(ln, joints_by_line.get(ln.id, []))
            for ln in updated_lines
        ],
        updated_joints_count=updated_joints_count,
    )


@router.post(
    "/batch-delete",
    response_model=ProjectLineBatchDeleteResponse,
    status_code=status.HTTP_200_OK,
)
async def batch_delete_lines(
    payload: ProjectLineBatchDeleteRequest,
    request: Request,
    current_user: User = Depends(
        require_dept_access(LINE_ALLOWED_DEPTS, SystemRoleEnum.DEPT_ADMIN)
    ),
    session: AsyncSession = Depends(get_db_session),
) -> ProjectLineBatchDeleteResponse:
    unique_ids = list(dict.fromkeys(payload.ids))
    lines = list(
        (
            await session.execute(
                select(ProjectLine).where(ProjectLine.id.in_(unique_ids))
            )
        )
        .scalars()
        .all()
    )
    if not lines:
        return ProjectLineBatchDeleteResponse(deleted_ids=[])

    for line in lines:
        assert_can_mutate_record(
            user=current_user,
            record=line,
            allowed_departments=LINE_ALLOWED_DEPTS,
            operation="delete",
            is_directory=True,
        )

    line_ids = [ln.id for ln in lines]
    line_uids = [ln.unique_line_id for ln in lines]
    linked_rows = (
        await session.execute(
            select(
                WeldJoint.line_id,
                WeldJoint.unique_line_id,
                func.count(WeldJoint.id),
            )
            .where(
                or_(
                    WeldJoint.line_id.in_(line_ids),
                    WeldJoint.unique_line_id.in_(line_uids),
                )
            )
            .group_by(WeldJoint.line_id, WeldJoint.unique_line_id)
        )
    ).all()

    if linked_rows:
        total_refs = sum(int(r[2] or 0) for r in linked_rows)
        blocking_uids = sorted({str(r[1]) for r in linked_rows if r[1]})
        raise_referential_integrity_error(
            "project_line",
            (
                f"Невозможно удалить выбранные линии: к ним привязаны сварные стыки "
                f"({total_refs} шт., линии: {', '.join(blocking_uids[:5])})."
            ),
            references_count=total_refs,
        )

    deleted_ids: list[uuid.UUID] = []
    for line in lines:
        old_snap = orm_snapshot(line, ProjectLineOut)
        line_id = line.id
        line_uid = line.unique_line_id
        line_rd = line.rd_code
        line_ver = line.version
        await session.delete(line)
        await record_audit_log(
            session,
            action="DELETE",
            entity_type="project_line",
            entity_id=str(line_id),
            user=current_user,
            old_data=old_snap,
            ip_address=get_client_ip(request),
            unique_line_id=line_uid,
            rd_code=line_rd,
            summary=f"Удалена линия «{line_uid}»",
        )
        await event_bus.emit_delta(
            session,
            event="line.deleted",
            entity_type="project_line",
            entity_id=line_id,
            version=line_ver,
            updated_by=current_user.login,
            data={"id": str(line_id)},
        )
        deleted_ids.append(line_id)

    return ProjectLineBatchDeleteResponse(deleted_ids=deleted_ids)


@router.get("/{line_id}", response_model=ProjectLineOut)
async def get_line(
    line_id: uuid.UUID,
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ProjectLineOut:
    line = (
        await session.execute(
            select(ProjectLine)
            .options(selectinload(ProjectLine.joints).options(LINE_STATUS_JOINT_PROJECTION))
            .where(ProjectLine.id == line_id)
        )
    ).scalar_one_or_none()
    if line is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Линия не найдена.")
    line_joints = list(getattr(line, "joints", None) or [])
    if not line_joints:
        line_joints = list(
            (
                await session.execute(
                    select(WeldJoint)
                    .options(LINE_STATUS_JOINT_PROJECTION)
                    .where(
                        or_(
                            WeldJoint.line_id == line.id,
                            WeldJoint.unique_line_id == line.unique_line_id,
                        )
                    )
                )
            )
            .scalars()
            .all()
        )
    return _line_to_out(line, line_joints)


@router.get("/{line_id}/ndt-progress", response_model=LineNdtProgressOut)
async def get_line_ndt_progress(
    line_id: uuid.UUID,
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> LineNdtProgressOut:
    line = (
        await session.execute(
            select(ProjectLine)
            .options(selectinload(ProjectLine.joints).options(LINE_STATUS_JOINT_PROJECTION))
            .where(ProjectLine.id == line_id)
        )
    ).scalar_one_or_none()
    if line is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Линия не найдена.")
    line_joints = list(getattr(line, "joints", None) or [])
    if not line_joints:
        line_joints = list(
            (
                await session.execute(
                    select(WeldJoint)
                    .options(LINE_STATUS_JOINT_PROJECTION)
                    .where(
                        or_(
                            WeldJoint.line_id == line.id,
                            WeldJoint.unique_line_id == line.unique_line_id,
                        )
                    )
                )
            )
            .scalars()
            .all()
        )
    prog = calculate_line_ndt_progress(line_joints, line)
    return LineNdtProgressOut(**dataclasses.asdict(prog))


@router.post("", response_model=ProjectLineOut, status_code=status.HTTP_201_CREATED)
async def create_line(
    payload: ProjectLineCreate,
    request: Request,
    current_user: User = Depends(require_dept_access(LINE_ALLOWED_DEPTS, SystemRoleEnum.DEPT_ADMIN)),
    session: AsyncSession = Depends(get_db_session),
) -> ProjectLineOut:
    assert_can_mutate_record(
        user=current_user,
        record=None,
        allowed_departments=LINE_ALLOWED_DEPTS,
        operation="create",
        is_directory=True,
    )
    uid_str = (
        payload.unique_line_id.strip()
        if payload.unique_line_id and payload.unique_line_id.strip()
        else build_unique_line_id(payload.rd_code, payload.line_number)
    )
    existing = (
        await session.execute(select(ProjectLine).where(ProjectLine.unique_line_id == uid_str))
    ).scalar_one_or_none()
    if existing is not None:
        raise_duplicate_error(
            "DUPLICATE_UNIQUE_LINE_ID",
            f"Линия с идентификатором «{uid_str}» уже существует в лайнлисте.",
            details={"unique_line_id": uid_str},
        )

    now = datetime.now(timezone.utc)
    line = ProjectLine(
        id=uuid.uuid4(),
        legacy_id=payload.legacy_id,
        facility_id=payload.facility_id,
        object_name=payload.object_name.strip(),
        rd_code=payload.rd_code.strip(),
        line_number=payload.line_number.strip(),
        unique_line_id=uid_str,
        line_name=payload.line_name.strip(),
        product=payload.product.strip(),
        test_contour=payload.test_contour.strip(),
        welding_ntd=payload.welding_ntd.strip(),
        control_ntd=payload.control_ntd.strip(),
        quality_level=payload.quality_level.strip(),
        pipeline_category=payload.pipeline_category.strip(),
        working_pressure=payload.working_pressure.strip(),
        working_temperature=payload.working_temperature.strip(),
        rk_percent=payload.rk_percent,
        uzk_percent=payload.uzk_percent,
        pvk_percent=payload.pvk_percent,
        manual_status=payload.manual_status,
        test_date=payload.test_date,
        id_status=payload.id_status,
        responsible_pto=payload.responsible_pto.strip() if payload.responsible_pto and payload.responsible_pto.strip() else None,
        sort_order=payload.sort_order,
        record_status=RecordStatusEnum.DRAFT,
        created_by_id=current_user.id,
        version=1,
        updated_by_id=current_user.id,
        created_at=now,
        updated_at=now,
    )
    session.add(line)
    await session.flush()

    snapshot = orm_snapshot(line, ProjectLineOut)
    await record_audit_log(
        session,
        action="CREATE",
        entity_type="project_line",
        entity_id=str(line.id),
        user=current_user,
        new_data=snapshot,
        ip_address=get_client_ip(request),
        unique_line_id=line.unique_line_id,
        rd_code=line.rd_code,
        summary=f"Добавлена линия «{line.unique_line_id}»",
    )
    await event_bus.emit_delta(
        session,
        event="line.created",
        entity_type="project_line",
        entity_id=line.id,
        version=line.version,
        updated_by=current_user.login,
        data=snapshot,
    )
    return _line_to_out(line, [])


@router.patch("/{line_id}", response_model=ProjectLineOut)
async def update_line(
    line_id: uuid.UUID,
    payload: ProjectLineUpdate,
    request: Request,
    current_user: User = Depends(require_dept_access(LINE_ALLOWED_DEPTS, SystemRoleEnum.DEPT_ADMIN)),
    session: AsyncSession = Depends(get_db_session),
) -> ProjectLineOut:
    line = (
        await session.execute(select(ProjectLine).where(ProjectLine.id == line_id))
    ).scalar_one_or_none()
    if line is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Линия не найдена.")

    assert_can_mutate_record(
        user=current_user,
        record=line,
        allowed_departments=LINE_ALLOWED_DEPTS,
        operation="update",
        is_directory=True,
    )

    patch_data = payload.model_dump(exclude_unset=True)
    enforce_optimistic_lock(
        entity_type="project_line",
        entity_obj=line,
        expected_version=payload.version,
        patch_data=patch_data,
        schema_cls=ProjectLineOut,
    )

    if "responsible_pto" in patch_data and isinstance(patch_data["responsible_pto"], str):
        stripped_pto = patch_data["responsible_pto"].strip()
        patch_data["responsible_pto"] = stripped_pto or None

    old_snap = orm_snapshot(line, ProjectLineOut)
    apply_patch_fields(line, patch_data)
    if (
        ("rd_code" in patch_data or "line_number" in patch_data)
        and "unique_line_id" not in patch_data
    ):
        line.unique_line_id = build_unique_line_id(line.rd_code, line.line_number)
    now = datetime.now(timezone.utc)
    line.updated_by_id = current_user.id
    line.updated_at = now
    await session.flush()

    if "id_status" in patch_data or "responsible_pto" in patch_data:
        await _sync_executive_doc_from_line(
            session, line, current_user=current_user, now=now
        )

    all_joints = list(
        (
            await session.execute(
                select(WeldJoint)
                .options(LINE_STATUS_JOINT_PROJECTION)
                .where(
                    or_(
                        WeldJoint.line_id == line.id,
                        WeldJoint.unique_line_id == line.unique_line_id,
                    )
                )
            )
        )
        .scalars()
        .all()
    )
    new_snap = orm_snapshot(line, ProjectLineOut)
    old_diff, new_diff = extract_changed_fields(old_snap, new_snap)
    await record_audit_log(
        session,
        action="UPDATE",
        entity_type="project_line",
        entity_id=str(line.id),
        user=current_user,
        old_data=old_diff,
        new_data=new_diff,
        ip_address=get_client_ip(request),
        unique_line_id=line.unique_line_id,
        rd_code=line.rd_code,
        summary=f"Обновлена линия «{line.unique_line_id}» (v{line.version})",
    )
    await event_bus.emit_delta(
        session,
        event="line.updated",
        entity_type="project_line",
        entity_id=line.id,
        version=line.version,
        updated_by=current_user.login,
        data=new_snap,
    )
    return _line_to_out(line, all_joints)


@router.patch("/{line_id}/status", response_model=ProjectLineOut)
async def change_line_record_status(
    line_id: uuid.UUID,
    payload: RecordStatusChangeRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ProjectLineOut:
    line = (
        await session.execute(select(ProjectLine).where(ProjectLine.id == line_id))
    ).scalar_one_or_none()
    if line is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Линия не найдена.")

    assert_can_transition_record_status(
        user=current_user,
        record=line,
        target_status=payload.record_status,
        allowed_departments=LINE_ALLOWED_DEPTS,
        reason=payload.reason,
    )
    if payload.version is not None:
        enforce_optimistic_lock(
            entity_type="project_line",
            entity_obj=line,
            expected_version=payload.version,
            patch_data={"record_status": payload.record_status.value},
            schema_cls=ProjectLineOut,
        )

    old_status = line.record_status.value
    is_unlock = line.record_status == RecordStatusEnum.LOCKED and payload.record_status != RecordStatusEnum.LOCKED
    line.record_status = payload.record_status
    line.version += 1
    line.updated_by_id = current_user.id
    line.updated_at = datetime.now(timezone.utc)
    await session.flush()

    all_joints = list(
        (
            await session.execute(
                select(WeldJoint)
                .options(LINE_STATUS_JOINT_PROJECTION)
                .where(
                    or_(
                        WeldJoint.line_id == line.id,
                        WeldJoint.unique_line_id == line.unique_line_id,
                    )
                )
            )
        )
        .scalars()
        .all()
    )
    new_snap = orm_snapshot(line, ProjectLineOut)
    await record_audit_log(
        session,
        action="RECORD_UNLOCKED" if is_unlock else "RECORD_STATUS_CHANGED",
        entity_type="project_line",
        entity_id=str(line.id),
        user=current_user,
        old_data={"record_status": old_status},
        new_data={
            "record_status": line.record_status.value,
            **({"reason": payload.reason.strip()} if payload.reason and payload.reason.strip() else {}),
        },
        ip_address=get_client_ip(request),
        unique_line_id=line.unique_line_id,
        rd_code=line.rd_code,
        summary=(
            f"Снята блокировка линии «{line.unique_line_id}» ({old_status} -> {line.record_status.value}): {payload.reason}"
            if is_unlock
            else f"Изменён статус линии «{line.unique_line_id}»: {old_status} -> {line.record_status.value}"
        ),
    )
    await event_bus.emit_delta(
        session,
        event="line.updated",
        entity_type="project_line",
        entity_id=line.id,
        version=line.version,
        updated_by=current_user.login,
        data=new_snap,
    )
    return _line_to_out(line, all_joints)


@router.delete("/{line_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_line(
    line_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_dept_access(LINE_ALLOWED_DEPTS, SystemRoleEnum.DEPT_ADMIN)),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    line = (
        await session.execute(select(ProjectLine).where(ProjectLine.id == line_id))
    ).scalar_one_or_none()
    if line is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Линия не найдена.")

    assert_can_mutate_record(
        user=current_user,
        record=line,
        allowed_departments=LINE_ALLOWED_DEPTS,
        operation="delete",
        is_directory=True,
    )

    linked_count = int(
        (
            await session.execute(
                select(func.count(WeldJoint.id)).where(
                    or_(
                        WeldJoint.line_id == line.id,
                        WeldJoint.unique_line_id == line.unique_line_id,
                    )
                )
            )
        ).scalar_one()
        or 0
    )
    if linked_count > 0:
        raise_referential_integrity_error(
            "project_line",
            (
                f"Невозможно удалить линию «{line.unique_line_id}»: "
                f"к ней привязаны сварные стыки ({linked_count} шт.)."
            ),
            references_count=linked_count,
        )

    old_snap = orm_snapshot(line, ProjectLineOut)
    await session.delete(line)
    await record_audit_log(
        session,
        action="DELETE",
        entity_type="project_line",
        entity_id=str(line_id),
        user=current_user,
        old_data=old_snap,
        ip_address=get_client_ip(request),
        unique_line_id=line.unique_line_id,
        rd_code=line.rd_code,
        summary=f"Удалена линия «{line.unique_line_id}»",
    )
    await event_bus.emit_delta(
        session,
        event="line.deleted",
        entity_type="project_line",
        entity_id=line_id,
        version=line.version,
        updated_by=current_user.login,
        data={"id": str(line_id)},
    )
