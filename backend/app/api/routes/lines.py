from __future__ import annotations

import dataclasses
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, get_current_user, get_db_session, require_permission
from app.models.joint import WeldJoint
from app.models.line import ProjectLine
from app.models.user import User
from app.schemas.domain import (
    LineCompletionStatusOut,
    LineNdtProgressOut,
    PaginatedResponse,
    ProjectLineCreate,
    ProjectLineOut,
    ProjectLineUpdate,
)
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
from app.services.readiness_service import (
    calculate_line_ndt_progress,
    compute_line_list_item_status,
)

router = APIRouter(prefix="/api/lines", tags=["lines"])


def _line_to_out(line: ProjectLine, line_joints: list[WeldJoint]) -> ProjectLineOut:
    status_dc = compute_line_list_item_status(line, line_joints)
    out = ProjectLineOut.model_validate(line)
    out.computed_status = LineCompletionStatusOut(
        is_completed=status_dc.is_completed,
        total_joints=status_dc.total_joints,
        welded_joints=status_dc.welded_joints,
        controlled_joints=status_dc.controlled_joints,
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
            )
        )
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await session.execute(count_stmt)).scalar_one()

    paged_stmt = (
        stmt.order_by(ProjectLine.sort_order.asc(), ProjectLine.line_number.asc())
        .limit(limit)
        .offset(offset)
    )
    page = list((await session.execute(paged_stmt)).scalars().all())

    if page:
        page_line_ids = [line.id for line in page]
        page_uids = [line.unique_line_id for line in page if line.unique_line_id]
        joint_filters = [WeldJoint.line_id.in_(page_line_ids)]
        if page_uids:
            joint_filters.append(WeldJoint.unique_line_id.in_(page_uids))
        page_joints = list(
            (await session.execute(select(WeldJoint).where(or_(*joint_filters)))).scalars().all()
        )
    else:
        page_joints = []

    return PaginatedResponse(
        items=[_line_to_out(line, page_joints) for line in page],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{line_id}", response_model=ProjectLineOut)
async def get_line(
    line_id: uuid.UUID,
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ProjectLineOut:
    line = (
        await session.execute(select(ProjectLine).where(ProjectLine.id == line_id))
    ).scalar_one_or_none()
    if line is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Линия не найдена.")
    line_joints = list(
        (
            await session.execute(
                select(WeldJoint).where(
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
        await session.execute(select(ProjectLine).where(ProjectLine.id == line_id))
    ).scalar_one_or_none()
    if line is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Линия не найдена.")
    line_joints = list(
        (
            await session.execute(
                select(WeldJoint).where(
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
    current_user: User = Depends(require_permission("can_edit_line_list")),
    session: AsyncSession = Depends(get_db_session),
) -> ProjectLineOut:
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
        sort_order=payload.sort_order,
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
    current_user: User = Depends(require_permission("can_edit_line_list")),
    session: AsyncSession = Depends(get_db_session),
) -> ProjectLineOut:
    line = (
        await session.execute(select(ProjectLine).where(ProjectLine.id == line_id))
    ).scalar_one_or_none()
    if line is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Линия не найдена.")

    patch_data = payload.model_dump(exclude_unset=True)
    enforce_optimistic_lock(
        entity_type="project_line",
        entity_obj=line,
        expected_version=payload.version,
        patch_data=patch_data,
        schema_cls=ProjectLineOut,
    )

    old_snap = orm_snapshot(line, ProjectLineOut)
    apply_patch_fields(line, patch_data)
    if (
        ("rd_code" in patch_data or "line_number" in patch_data)
        and "unique_line_id" not in patch_data
    ):
        line.unique_line_id = build_unique_line_id(line.rd_code, line.line_number)
    line.updated_by_id = current_user.id
    line.updated_at = datetime.now(timezone.utc)
    await session.flush()

    all_joints = list(
        (
            await session.execute(
                select(WeldJoint).where(
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


@router.delete("/{line_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_line(
    line_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_permission("can_edit_line_list")),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    line = (
        await session.execute(select(ProjectLine).where(ProjectLine.id == line_id))
    ).scalar_one_or_none()
    if line is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Линия не найдена.")

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
