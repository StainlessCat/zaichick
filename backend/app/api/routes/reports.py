from __future__ import annotations

import dataclasses
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db_session
from app.models.joint import WeldJoint
from app.models.line import ProjectLine
from app.models.user import User
from app.schemas.domain import LineNdtProgressOut, ReadinessRowOut
from app.services.readiness_service import (
    calculate_line_ndt_progress,
    calculate_readiness_report,
)

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/readiness", response_model=list[ReadinessRowOut])
async def get_readiness_report(
    condition: Literal["objectName", "rdCode", "uniqueLineId"] = Query(default="uniqueLineId"),
    facility_id: uuid.UUID | None = Query(default=None),
    rd_code: str | None = Query(default=None),
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[ReadinessRowOut]:
    stmt = select(WeldJoint)
    if facility_id is not None:
        stmt = stmt.where(WeldJoint.facility_id == facility_id)
    if rd_code:
        stmt = stmt.where(WeldJoint.rd_code == rd_code.strip())
    joints = list((await session.execute(stmt)).scalars().all())
    rows = calculate_readiness_report(joints, condition)
    return [ReadinessRowOut(**dataclasses.asdict(r)) for r in rows]


@router.get("/ndt-progress", response_model=list[LineNdtProgressOut])
async def get_lines_ndt_progress_report(
    facility_id: uuid.UUID | None = Query(default=None),
    rd_code: str | None = Query(default=None),
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[LineNdtProgressOut]:
    line_stmt = select(ProjectLine)
    if facility_id is not None:
        line_stmt = line_stmt.where(ProjectLine.facility_id == facility_id)
    if rd_code:
        line_stmt = line_stmt.where(ProjectLine.rd_code == rd_code.strip())
    lines = list(
        (await session.execute(line_stmt.order_by(ProjectLine.sort_order.asc())))
        .scalars()
        .all()
    )
    all_joints = list((await session.execute(select(WeldJoint))).scalars().all())
    return [
        LineNdtProgressOut(**dataclasses.asdict(calculate_line_ndt_progress(all_joints, line)))
        for line in lines
    ]
