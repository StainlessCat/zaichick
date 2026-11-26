from __future__ import annotations

import dataclasses
import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only, selectinload

from app.api.deps import get_current_user, get_db_session
from app.models.executive_doc import ExecutiveDoc
from app.models.joint import WeldJoint
from app.models.line import ProjectLine
from app.models.test_circuit import TestCircuit
from app.models.user import User
from app.schemas.domain import LineNdtProgressOut, ReadinessRowOut
from app.services.readiness_service import (
    calculate_line_ndt_progress,
    calculate_readiness_report,
)

router = APIRouter(prefix="/api/reports", tags=["reports"])

# Облегчённая проекция колонок ORM для отчётов готовности и квот НК:
# исключает ~45 тяжёлых текстовых полей материалов, сертификатов и журналов.
READINESS_JOINT_PROJECTION = load_only(
    WeldJoint.id,
    WeldJoint.line_id,
    WeldJoint.facility_id,
    WeldJoint.test_circuit_id,
    WeldJoint.object_name,
    WeldJoint.rd_code,
    WeldJoint.contour,
    WeldJoint.line_number,
    WeldJoint.unique_line_id,
    WeldJoint.joint_number,
    WeldJoint.diameter_mm,
    WeldJoint.diameter_inch,
    WeldJoint.equiv_diameter_inch,
    WeldJoint.wall_thickness,
    WeldJoint.welding_date,
    WeldJoint.welder_stamp,
    WeldJoint.welder_stamps_list,
    WeldJoint.welder_full_name,
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

READINESS_LINE_PROJECTION = load_only(
    ProjectLine.id,
    ProjectLine.facility_id,
    ProjectLine.object_name,
    ProjectLine.rd_code,
    ProjectLine.line_number,
    ProjectLine.unique_line_id,
    ProjectLine.test_contour,
    ProjectLine.pipeline_category,
    ProjectLine.quality_level,
    ProjectLine.rk_percent,
    ProjectLine.uzk_percent,
    ProjectLine.id_status,
    ProjectLine.sort_order,
)

READINESS_EXEC_DOC_PROJECTION = load_only(
    ExecutiveDoc.id,
    ExecutiveDoc.line_id,
    ExecutiveDoc.id_status,
)


@router.get("/readiness", response_model=list[ReadinessRowOut])
async def get_readiness_report(
    condition: Literal["objectName", "contour", "rdCode", "uniqueLineId"] = Query(
        default="objectName"
    ),
    facility_id: uuid.UUID | None = Query(default=None),
    rd_code: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[ReadinessRowOut]:
    j_stmt = select(WeldJoint).options(READINESS_JOINT_PROJECTION)
    l_stmt = select(ProjectLine).options(READINESS_LINE_PROJECTION)
    c_stmt = select(TestCircuit).options(selectinload(TestCircuit.facility))
    if facility_id is not None:
        j_stmt = j_stmt.where(WeldJoint.facility_id == facility_id)
        l_stmt = l_stmt.where(ProjectLine.facility_id == facility_id)
        c_stmt = c_stmt.where(TestCircuit.facility_id == facility_id)
    if rd_code:
        cleaned_rd = rd_code.strip()
        j_stmt = j_stmt.where(WeldJoint.rd_code == cleaned_rd)
        l_stmt = l_stmt.where(ProjectLine.rd_code == cleaned_rd)
    if date_from is not None:
        j_stmt = j_stmt.where(WeldJoint.welding_date >= date_from)
    if date_to is not None:
        j_stmt = j_stmt.where(WeldJoint.welding_date <= date_to)
    joints = list((await session.execute(j_stmt)).scalars().all())
    lines = list((await session.execute(l_stmt)).scalars().all())
    circuits = list((await session.execute(c_stmt)).scalars().all())
    line_ids = [ln.id for ln in lines]
    exec_docs = (
        list(
            (
                await session.execute(
                    select(ExecutiveDoc)
                    .options(READINESS_EXEC_DOC_PROJECTION)
                    .where(ExecutiveDoc.line_id.in_(line_ids))
                )
            )
            .scalars()
            .all()
        )
        if line_ids
        else []
    )
    rows = calculate_readiness_report(
        joints,
        condition,
        lines=lines,
        test_circuits=circuits,
        executive_docs=exec_docs,
        exclude_empty_groups=bool(date_from or date_to),
    )
    return [ReadinessRowOut(**dataclasses.asdict(r)) for r in rows]


@router.get("/ndt-progress", response_model=list[LineNdtProgressOut])
async def get_lines_ndt_progress_report(
    facility_id: uuid.UUID | None = Query(default=None),
    rd_code: str | None = Query(default=None),
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[LineNdtProgressOut]:
    line_stmt = select(ProjectLine).options(READINESS_LINE_PROJECTION)
    joint_stmt = select(WeldJoint).options(READINESS_JOINT_PROJECTION)
    if facility_id is not None:
        line_stmt = line_stmt.where(ProjectLine.facility_id == facility_id)
        joint_stmt = joint_stmt.where(WeldJoint.facility_id == facility_id)
    if rd_code:
        cleaned_rd = rd_code.strip()
        line_stmt = line_stmt.where(ProjectLine.rd_code == cleaned_rd)
        joint_stmt = joint_stmt.where(WeldJoint.rd_code == cleaned_rd)
    lines = list(
        (await session.execute(line_stmt.order_by(ProjectLine.sort_order.asc())))
        .scalars()
        .all()
    )
    if not lines:
        return []
    line_ids = [ln.id for ln in lines]
    scoped_joints = list(
        (
            await session.execute(
                joint_stmt.where(WeldJoint.line_id.in_(line_ids))
            )
        )
        .scalars()
        .all()
    )
    return [
        LineNdtProgressOut(**dataclasses.asdict(calculate_line_ndt_progress(scoped_joints, line)))
        for line in lines
    ]
