from __future__ import annotations

import dataclasses
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db_session
from app.models.joint import WeldJoint
from app.models.lrv import LrvItem
from app.models.user import User
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
) -> tuple[list[WeldJoint], dict[tuple[str, str], LrvItem]]:
    stmt = select(WeldJoint)
    if facility_id is not None:
        stmt = stmt.where(WeldJoint.facility_id == facility_id)
    if rd_code:
        stmt = stmt.where(WeldJoint.rd_code == rd_code.strip())
    if unique_line_id:
        stmt = stmt.where(WeldJoint.unique_line_id == unique_line_id.strip())
    joints = list(
        (await session.execute(stmt.order_by(WeldJoint.sort_order.asc(), WeldJoint.joint_number.asc())))
        .scalars()
        .all()
    )
    lrv_items = list((await session.execute(select(LrvItem))).scalars().all())
    lrv_map = {(item.rd_code, item.lrv_code): item for item in lrv_items}
    return joints, lrv_map


@router.get("", response_model=JournalPreviewResponse)
async def get_welding_journal_preview(
    standard: str = Query(default="СТО Газпром 15-1.1-002-2023"),
    rd_code: str | None = Query(default=None),
    unique_line_id: str | None = Query(default=None),
    facility_id: uuid.UUID | None = Query(default=None),
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
    )
    completeness = validate_journal_completeness(joints, standard=standard)
    page = joints[offset : offset + limit]
    is_gost = standard == "ГОСТ 32569-2013"

    rows = [
        JournalPreviewRowOut(
            joint_id=str(j.id),
            joint_number=j.joint_number,
            line_number=j.line_number,
            cells=(
                format_gost_32569_row(offset + idx + 1, j, lrv_map)
                if is_gost
                else format_sto_gazprom_row(offset + idx + 1, j, lrv_map)
            ),
            is_fully_accepted=is_joint_fully_accepted(j),
            is_in_repair=is_joint_currently_in_repair(j),
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
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> JournalCompletenessOut:
    joints, _ = await fetch_filtered_joints_and_lrv(
        session,
        rd_code=rd_code,
        unique_line_id=unique_line_id,
        facility_id=facility_id,
    )
    completeness = validate_journal_completeness(joints, standard=standard)
    return JournalCompletenessOut(**dataclasses.asdict(completeness))
