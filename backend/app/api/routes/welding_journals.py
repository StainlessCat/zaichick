from __future__ import annotations

import dataclasses
import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db_session
from app.models.joint import WeldJoint
from app.models.lrv import LrvItem
from app.models.user import User
from app.models.welding_tech import WeldingMaterial
from app.schemas.domain import (
    JournalCompletenessOut,
    JournalPreviewResponse,
    JournalPreviewRowOut,
)
from app.services.journal_formatter import (
    format_gost_32569_row,
    format_sto_gazprom_row,
)
from app.services.readiness_service import (
    is_joint_currently_in_repair,
    is_joint_fully_accepted,
    validate_journal_completeness,
)

router = APIRouter(prefix="/api/welding-journals", tags=["welding-journals"])


async def fetch_filtered_joints_and_lrv(
    session: AsyncSession,
    *,
    rd_code: str | None,
    unique_line_id: str | None,
    facility_id: uuid.UUID | None,
    date_from: date | None = None,
    date_to: date | None = None,
    welded_only: bool = True,
) -> tuple[list[WeldJoint], dict[tuple[str, str], LrvItem]]:
    stmt = select(WeldJoint)
    if welded_only:
        stmt = stmt.where(WeldJoint.welding_date.is_not(None))
    if facility_id is not None:
        stmt = stmt.where(WeldJoint.facility_id == facility_id)
    if rd_code:
        stmt = stmt.where(WeldJoint.rd_code == rd_code.strip())
    if unique_line_id:
        stmt = stmt.where(WeldJoint.unique_line_id == unique_line_id.strip())
    if date_from is not None:
        stmt = stmt.where(WeldJoint.welding_date >= date_from)
    if date_to is not None:
        stmt = stmt.where(WeldJoint.welding_date <= date_to)
    joints = list(
        (
            await session.execute(
                stmt.order_by(
                    WeldJoint.welding_date.asc().nullslast(),
                    WeldJoint.line_number.asc(),
                    WeldJoint.sort_order.asc(),
                    WeldJoint.joint_number.asc(),
                )
            )
        )
        .scalars()
        .all()
    )
    lrv_stmt = select(LrvItem)
    if facility_id is not None:
        lrv_stmt = lrv_stmt.where(LrvItem.facility_id == facility_id)
    if rd_code:
        lrv_stmt = lrv_stmt.where(LrvItem.rd_code == rd_code.strip())
    lrv_items = list((await session.execute(lrv_stmt)).scalars().all())
    lrv_map = {(item.rd_code, item.lrv_code): item for item in lrv_items}
    return joints, lrv_map


@router.get("", response_model=JournalPreviewResponse)
async def get_welding_journal_preview(
    standard: str = Query(default="СТО Газпром 15-1.1-002-2023"),
    rd_code: str | None = Query(default=None),
    unique_line_id: str | None = Query(default=None),
    facility_id: uuid.UUID | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> JournalPreviewResponse:
    joints, lrv_map = await fetch_filtered_joints_and_lrv(
        session,
        rd_code=rd_code,
        unique_line_id=unique_line_id,
        facility_id=facility_id,
        date_from=date_from,
        date_to=date_to,
        welded_only=True,
    )
    completeness = validate_journal_completeness(joints, standard=standard)
    page = joints[offset : offset + limit]
    is_gost = standard == "ГОСТ 32569-2013"
    materials = (
        list((await session.execute(select(WeldingMaterial))).scalars().all())
        if is_gost
        else []
    )

    rows = [
        JournalPreviewRowOut(
            joint_id=str(j.id),
            joint_number=j.joint_number,
            line_number=j.line_number,
            cells=(
                format_gost_32569_row(offset + idx + 1, j, lrv_map, materials)
                if is_gost
                else format_sto_gazprom_row(offset + idx + 1, j, lrv_map)
            ),
            is_fully_accepted=is_joint_fully_accepted(j),
            is_in_repair=is_joint_currently_in_repair(j),
            record_status=j.record_status,
        )
        for idx, j in enumerate(page)
    ]
    return JournalPreviewResponse(
        standard=standard,
        total=len(joints),
        rows=rows,
        completeness=JournalCompletenessOut(**dataclasses.asdict(completeness)),
    )


@router.get("/completeness", response_model=JournalCompletenessOut)
async def check_welding_journal_completeness(
    standard: str = Query(default="СТО Газпром 15-1.1-002-2023"),
    rd_code: str | None = Query(default=None),
    unique_line_id: str | None = Query(default=None),
    facility_id: uuid.UUID | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> JournalCompletenessOut:
    joints, _ = await fetch_filtered_joints_and_lrv(
        session,
        rd_code=rd_code,
        unique_line_id=unique_line_id,
        facility_id=facility_id,
        date_from=date_from,
        date_to=date_to,
        welded_only=True,
    )
    completeness = validate_journal_completeness(joints, standard=standard)
    return JournalCompletenessOut(**dataclasses.asdict(completeness))
