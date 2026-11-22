from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import and_, case, func, literal, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import (
    CircuitTestStatusEnum,
    ControlResultEnum,
    DepartmentEnum,
    NdtMethodEnum,
    RecordStatusEnum,
    SriStatusEnum,
    SystemRoleEnum,
)
from app.models.facility import Facility
from app.models.joint import WeldJoint
from app.models.line import ProjectLine
from app.models.test_circuit import TestCircuit
from app.models.user import User
from app.schemas.test_circuit import (
    AssignJointsRequest,
    AssignLinesRequest,
    CircuitJointBriefOut,
    CircuitLineSummaryOut,
    TestCircuitCreate,
    TestCircuitDetailOut,
    TestCircuitOut,
    TestCircuitUpdate,
    UnassignJointsRequest,
)
from app.services.audit_service import extract_changed_fields, record_audit_log
from app.services.crud_helpers import enforce_optimistic_lock
from app.services.event_bus import publish_domain_event
from app.services.pipe_calc import (
    _OUTER_TO_INCH_MAP,
    calculate_equivalent_dia_inch,
    inch_string_to_numeric,
    mm_to_inch_diameter,
)
from app.services.rbac import (
    assert_can_mutate_record,
    assert_can_transition_record_status,
)
from app.services.readiness_service import is_joint_currently_in_repair

CIRCUIT_ALLOWED_DEPTS: tuple[DepartmentEnum, ...] = (
    DepartmentEnum.PTO,
    DepartmentEnum.SK,
)

# Precomputed exact outer-diameter (mm) -> normative DN numeric inches map matching pipe_calc.py
_SQL_OUTER_DIAMETER_TO_DINCH: dict[float, float] = {
    outer_mm: inch_string_to_numeric(inch_str)
    for outer_mm, inch_str in _OUTER_TO_INCH_MAP.items()
}


@dataclass(slots=True)
class CircuitMetrics:
    total_joints: int = 0
    welded_joints: int = 0
    welding_joints_percent: float = 0.0
    total_d_inch: float = 0.0
    welded_d_inch: float = 0.0
    welding_d_inch_percent: float = 0.0
    total_edi: float = 0.0
    welded_edi: float = 0.0
    welding_edi_percent: float = 0.0
    defective_joints_count: int = 0
    lines_summary: list[CircuitLineSummaryOut] = field(default_factory=list)


def get_joint_nominal_d_inch(joint: Any) -> float:
    """Normative DN diameter in inches using project pipe_calc table (fallback diameter_mm / 25.4)."""
    raw_inch = getattr(joint, "diameter_inch", None)
    if raw_inch:
        parsed = inch_string_to_numeric(raw_inch)
        if parsed > 0:
            return round(parsed, 3)
    d_mm = float(getattr(joint, "diameter_mm", 0.0) or 0.0)
    if d_mm <= 0:
        return 0.0
    inch_str = mm_to_inch_diameter(d_mm)
    parsed = inch_string_to_numeric(inch_str)
    if parsed > 0:
        return round(parsed, 3)
    return round(d_mm / 25.4, 3)


def get_joint_edi(joint: Any) -> float:
    """Equivalent Dia-Inch (Method A / EDI = D_inch * K_wall(S)) matching readiness_service."""
    stored = getattr(joint, "equiv_diameter_inch", None)
    if stored is not None and float(stored) > 0:
        return round(float(stored), 2)
    d_inch_str = getattr(joint, "diameter_inch", None)
    d_mm = float(getattr(joint, "diameter_mm", 0.0) or 0.0)
    wall = float(getattr(joint, "wall_thickness", 0.0) or 0.0)
    if d_inch_str:
        return calculate_equivalent_dia_inch(d_inch_str, wall)
    if d_mm > 0:
        return calculate_equivalent_dia_inch(d_mm, wall)
    return 0.0


def _build_sql_nominal_d_inch_expr():
    """
    PostgreSQL SQL expression computing normative DN inches per joint:
    matches _OUTER_TO_INCH_MAP (pipe_calc.py) on exact/rounded diameter_mm,
    falling back to diameter_mm / 25.4 for non-standard diameters.
    """
    whens = [
        (WeldJoint.diameter_mm == outer_mm, literal(d_inch))
        for outer_mm, d_inch in _SQL_OUTER_DIAMETER_TO_DINCH.items()
    ]
    rounded_whens = [
        (func.round(WeldJoint.diameter_mm) == outer_mm, literal(d_inch))
        for outer_mm, d_inch in _SQL_OUTER_DIAMETER_TO_DINCH.items()
        if outer_mm == int(outer_mm)
    ]
    fallback_expr = case(
        (WeldJoint.diameter_mm > 0, WeldJoint.diameter_mm / literal(25.4)),
        else_=literal(0.0),
    )
    return case(*whens, *rounded_whens, else_=fallback_expr)


def _build_sql_k_wall_expr():
    """PostgreSQL SQL CASE expression for EPC Method A wall thickness factor K_wall(S)."""
    s = func.coalesce(WeldJoint.wall_thickness, literal(0.0))
    return case(
        (s <= 10.0, literal(1.0)),
        (s <= 15.0, literal(1.35)),
        (s <= 20.0, literal(1.75)),
        (s <= 26.0, literal(2.3)),
        (s <= 35.0, literal(2.8)),
        (s <= 50.0, literal(3.5)),
        else_=literal(4.5),
    )


def _build_sql_edi_expr(d_inch_expr):
    """PostgreSQL SQL expression for joint EDI (preferring stored equiv_diameter_inch)."""
    return case(
        (
            and_(
                WeldJoint.equiv_diameter_inch.is_not(None),
                WeldJoint.equiv_diameter_inch > 0,
            ),
            WeldJoint.equiv_diameter_inch,
        ),
        else_=d_inch_expr * _build_sql_k_wall_expr(),
    )


def _build_sql_unresolved_defect_cond():
    """
    PostgreSQL SQL boolean predicate matching readiness_service.is_joint_currently_in_repair():
    True when a joint has a REPAIR/CUT_OUT result or repair_action and is NOT yet accepted after repair.
    """
    bad = (ControlResultEnum.REPAIR, ControlResultEnum.CUT_OUT)
    fit = ControlResultEnum.FIT
    not_req = NdtMethodEnum.NOT_REQUIRED
    not_cond = ControlResultEnum.NOT_CONDUCTED

    had_defect = or_(
        WeldJoint.vik_result.in_(bad),
        WeldJoint.ndt_result.in_(bad),
        WeldJoint.dup_ndt_result.in_(bad),
        WeldJoint.repair_vik_result.in_(bad),
        WeldJoint.repair_ndt_result.in_(bad),
        WeldJoint.repair_dup_ndt_result.in_(bad),
        WeldJoint.repair_action.in_(("Ремонт", "Вырезано", "Требуется ремонт")),
    )

    has_post_repair_records = or_(
        and_(
            WeldJoint.repair_vik_result.is_not(None),
            WeldJoint.repair_vik_result != not_cond,
        ),
        and_(
            WeldJoint.repair_ndt_type.is_not(None),
            WeldJoint.repair_ndt_type != not_req,
            WeldJoint.repair_ndt_result.is_not(None),
            WeldJoint.repair_ndt_result != not_cond,
        ),
    )

    post_repair_accepted = and_(
        WeldJoint.welding_date.is_not(None),
        func.btrim(func.coalesce(WeldJoint.welder_stamp, "")) != "",
        has_post_repair_records,
        WeldJoint.repair_vik_result == fit,
        or_(
            WeldJoint.repair_ndt_type.is_(None),
            WeldJoint.repair_ndt_type == not_req,
            WeldJoint.repair_ndt_result == fit,
        ),
        or_(
            WeldJoint.repair_dup_ndt_type.is_(None),
            WeldJoint.repair_dup_ndt_type == not_req,
            WeldJoint.repair_dup_ndt_result.is_(None),
            WeldJoint.repair_dup_ndt_result == not_cond,
            WeldJoint.repair_dup_ndt_result == fit,
        ),
    )

    legacy_dup_accepted = and_(
        WeldJoint.welding_date.is_not(None),
        func.btrim(func.coalesce(WeldJoint.welder_stamp, "")) != "",
        ~has_post_repair_records,
        or_(
            WeldJoint.vik_result == ControlResultEnum.REPAIR,
            WeldJoint.ndt_result == ControlResultEnum.REPAIR,
        ),
        WeldJoint.dup_ndt_type != not_req,
        WeldJoint.dup_ndt_result == fit,
    )

    return and_(had_defect, ~or_(post_repair_accepted, legacy_dup_accepted))


def calculate_circuit_metrics_from_joints(
    joints: list[Any],
    line_totals_map: dict[uuid.UUID, int] | None = None,
    lines_meta_map: dict[uuid.UUID, Any] | None = None,
) -> CircuitMetrics:
    """Pure Python equivalent of SQL aggregation for deterministic unit testing and detail views."""
    total_joints = len(joints)
    welded_joints = 0
    total_d_inch = 0.0
    welded_d_inch = 0.0
    total_edi = 0.0
    welded_edi = 0.0
    defective_count = 0

    line_counts: dict[uuid.UUID, int] = {}
    line_fallback_info: dict[uuid.UUID, tuple[str, str, str]] = {}

    for j in joints:
        d_inch = get_joint_nominal_d_inch(j)
        edi = get_joint_edi(j)
        is_welded = getattr(j, "welding_date", None) is not None
        total_d_inch += d_inch
        total_edi += edi
        if is_welded:
            welded_joints += 1
            welded_d_inch += d_inch
            welded_edi += edi
        if is_joint_currently_in_repair(j):
            defective_count += 1

        lid = getattr(j, "line_id", None)
        if lid is not None:
            line_counts[lid] = line_counts.get(lid, 0) + 1
            if lid not in line_fallback_info:
                line_fallback_info[lid] = (
                    getattr(j, "unique_line_id", "") or "",
                    getattr(j, "line_number", "") or "",
                    getattr(j, "rd_code", "") or "",
                )

    lines_summary: list[CircuitLineSummaryOut] = []
    for lid, assigned_cnt in line_counts.items():
        meta = (lines_meta_map or {}).get(lid)
        uid, lnum, rd = line_fallback_info.get(lid, ("", "", ""))
        if meta is not None:
            uid = getattr(meta, "unique_line_id", uid) or uid
            lnum = getattr(meta, "line_number", lnum) or lnum
            rd = getattr(meta, "rd_code", rd) or rd
        line_total = (line_totals_map or {}).get(lid, assigned_cnt)
        lines_summary.append(
            CircuitLineSummaryOut(
                line_id=lid,
                unique_line_id=uid,
                line_number=lnum,
                rd_code=rd,
                assigned_joints_count=assigned_cnt,
                line_total_joints_count=line_total,
                is_full_line=(line_total > 0 and assigned_cnt >= line_total),
            )
        )
    lines_summary.sort(key=lambda item: (item.rd_code, item.line_number, item.unique_line_id))

    return CircuitMetrics(
        total_joints=total_joints,
        welded_joints=welded_joints,
        welding_joints_percent=round(welded_joints / total_joints * 100.0, 1)
        if total_joints > 0
        else 0.0,
        total_d_inch=round(total_d_inch, 2),
        welded_d_inch=round(welded_d_inch, 2),
        welding_d_inch_percent=round(welded_d_inch / total_d_inch * 100.0, 1)
        if total_d_inch > 0
        else 0.0,
        total_edi=round(total_edi, 2),
        welded_edi=round(welded_edi, 2),
        welding_edi_percent=round(welded_edi / total_edi * 100.0, 1)
        if total_edi > 0
        else 0.0,
        defective_joints_count=defective_count,
        lines_summary=lines_summary,
    )


async def compute_circuits_metrics_sql(
    session: AsyncSession,
    circuit_ids: list[uuid.UUID],
) -> dict[uuid.UUID, CircuitMetrics]:
    """
    Aggregate readiness metrics directly in PostgreSQL via SQL GROUP BY on weld_joints.
    Zero N+1 queries for listing dozens of circuits across thousands of joints.
    """
    if not circuit_ids:
        return {}

    d_inch_expr = _build_sql_nominal_d_inch_expr()
    edi_expr = _build_sql_edi_expr(d_inch_expr)
    is_welded_cond = WeldJoint.welding_date.is_not(None)
    is_defective_cond = _build_sql_unresolved_defect_cond()

    agg_stmt = (
        select(
            WeldJoint.test_circuit_id.label("circuit_id"),
            func.count(WeldJoint.id).label("total_joints"),
            func.coalesce(
                func.sum(case((is_welded_cond, 1), else_=0)), 0
            ).label("welded_joints"),
            func.coalesce(func.sum(d_inch_expr), 0.0).label("total_d_inch"),
            func.coalesce(
                func.sum(case((is_welded_cond, d_inch_expr), else_=0.0)), 0.0
            ).label("welded_d_inch"),
            func.coalesce(func.sum(edi_expr), 0.0).label("total_edi"),
            func.coalesce(
                func.sum(case((is_welded_cond, edi_expr), else_=0.0)), 0.0
            ).label("welded_edi"),
            func.coalesce(
                func.sum(case((is_defective_cond, 1), else_=0)), 0
            ).label("defective_joints_count"),
        )
        .where(WeldJoint.test_circuit_id.in_(circuit_ids))
        .group_by(WeldJoint.test_circuit_id)
    )
    agg_rows = (await session.execute(agg_stmt)).all()

    metrics_map: dict[uuid.UUID, CircuitMetrics] = {cid: CircuitMetrics() for cid in circuit_ids}
    for row in agg_rows:
        cid = row.circuit_id
        total_j = int(row.total_joints or 0)
        welded_j = int(row.welded_joints or 0)
        total_di = float(row.total_d_inch or 0.0)
        welded_di = float(row.welded_d_inch or 0.0)
        total_e = float(row.total_edi or 0.0)
        welded_e = float(row.welded_edi or 0.0)
        defective_j = int(row.defective_joints_count or 0)

        metrics_map[cid] = CircuitMetrics(
            total_joints=total_j,
            welded_joints=welded_j,
            welding_joints_percent=round(welded_j / total_j * 100.0, 1) if total_j > 0 else 0.0,
            total_d_inch=round(total_di, 2),
            welded_d_inch=round(welded_di, 2),
            welding_d_inch_percent=round(welded_di / total_di * 100.0, 1) if total_di > 0 else 0.0,
            total_edi=round(total_e, 2),
            welded_edi=round(welded_e, 2),
            welding_edi_percent=round(welded_e / total_e * 100.0, 1) if total_e > 0 else 0.0,
            defective_joints_count=defective_j,
        )

    # Lines summary via a single SQL query joining project_lines + line total counts
    line_totals_subq = (
        select(
            WeldJoint.line_id.label("line_id"),
            func.count(WeldJoint.id).label("line_total"),
        )
        .group_by(WeldJoint.line_id)
        .subquery()
    )
    lines_stmt = (
        select(
            WeldJoint.test_circuit_id.label("circuit_id"),
            WeldJoint.line_id.label("line_id"),
            ProjectLine.unique_line_id.label("unique_line_id"),
            ProjectLine.line_number.label("line_number"),
            ProjectLine.rd_code.label("rd_code"),
            func.count(WeldJoint.id).label("assigned_count"),
            func.coalesce(line_totals_subq.c.line_total, 0).label("line_total"),
        )
        .join(ProjectLine, ProjectLine.id == WeldJoint.line_id)
        .outerjoin(line_totals_subq, line_totals_subq.c.line_id == WeldJoint.line_id)
        .where(WeldJoint.test_circuit_id.in_(circuit_ids))
        .group_by(
            WeldJoint.test_circuit_id,
            WeldJoint.line_id,
            ProjectLine.unique_line_id,
            ProjectLine.line_number,
            ProjectLine.rd_code,
            line_totals_subq.c.line_total,
        )
        .order_by(ProjectLine.rd_code.asc(), ProjectLine.line_number.asc())
    )
    line_rows = (await session.execute(lines_stmt)).all()
    for lrow in line_rows:
        m = metrics_map.get(lrow.circuit_id)
        if m is None:
            continue
        assigned_cnt = int(lrow.assigned_count or 0)
        line_tot = int(lrow.line_total or assigned_cnt)
        m.lines_summary.append(
            CircuitLineSummaryOut(
                line_id=lrow.line_id,
                unique_line_id=lrow.unique_line_id,
                line_number=lrow.line_number,
                rd_code=lrow.rd_code,
                assigned_joints_count=assigned_cnt,
                line_total_joints_count=line_tot,
                is_full_line=(line_tot > 0 and assigned_cnt >= line_tot),
            )
        )

    return metrics_map


def validate_circuit_test_readiness(
    *,
    circuit_sri_status: SriStatusEnum,
    act_number: str | None,
    actual_test_date: Any,
    metrics: CircuitMetrics,
    user: User,
    force: bool = False,
    force_reason: str | None = None,
) -> list[str]:
    """
    Validate guardrails before setting test_status = TESTED.
    Returns list of overridden warnings (non-empty only when force=True is authorized and valid force_reason is provided).
    Raises 400/403 HTTPException when blocked.
    """
    missing_fields: list[str] = []
    if not act_number or not str(act_number).strip():
        missing_fields.append("номер акта испытания")
    if actual_test_date is None:
        missing_fields.append("фактическая дата испытания")
    if missing_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "CIRCUIT_ACT_FIELDS_REQUIRED",
                "message": (
                    "Для перевода контура в статус «Испытано» обязательно заполните: "
                    + ", ".join(missing_fields)
                    + "."
                ),
                "reasons": missing_fields,
                "can_force": False,
            },
        )

    # Critical safety invariants that CANNOT be bypassed under ANY circumstances (even with force=True)
    critical_violations: list[str] = []
    if metrics.total_joints == 0:
        critical_violations.append("В контур не привязан ни один стык")
    if metrics.defective_joints_count > 0:
        critical_violations.append(
            f"Имеются стыки с неисправленным браком ({metrics.defective_joints_count} шт.)"
        )
    if critical_violations:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "CIRCUIT_CRITICAL_DEFECTS_BLOCK",
                "message": (
                    "Перевод контура в статус «Испытано» категорически запрещён правилами промышленной безопасности: "
                    + "; ".join(critical_violations)
                    + ". Наличие неисправленного брака или отсутствие стыков не может быть обойдено принудительно (force)."
                ),
                "reasons": critical_violations,
                "can_force": False,
            },
        )

    # Non-critical administrative warnings that may be overridden by authorized roles with justification
    warnings: list[str] = []
    if metrics.welded_joints < metrics.total_joints:
        warnings.append(
            f"Не завершена сварка ({metrics.welded_joints} из {metrics.total_joints} стыков)"
        )
    if circuit_sri_status != SriStatusEnum.APPROVED:
        warnings.append("СРИ не согласована")

    if not warnings:
        return []

    can_force = user.role == SystemRoleEnum.SUPERADMIN or (
        user.role == SystemRoleEnum.DEPT_ADMIN and user.department in CIRCUIT_ALLOWED_DEPTS
    )
    if not force:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "CIRCUIT_TEST_GUARDRAIL_FAILED",
                "message": "Невозможно перевести контур в статус «Испытано»: " + "; ".join(warnings) + ".",
                "reasons": warnings,
                "can_force": can_force,
            },
        )

    if not can_force:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Принудительное закрытие испытания (force) разрешено только администратору "
                "отдела ПТО/СК или суперадмину."
            ),
        )

    clean_reason = (force_reason or "").strip()
    if len(clean_reason) < 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "CIRCUIT_FORCE_REASON_REQUIRED",
                "message": (
                    "Для принудительного перевода контура в статус «Испытано» "
                    "необходимо обязательно указать обоснование (force_reason, не менее 5 символов)."
                ),
                "reasons": warnings,
                "can_force": True,
            },
        )

    return warnings


def _circuit_snapshot(circuit: TestCircuit) -> dict[str, Any]:
    return {
        "id": str(circuit.id),
        "facility_id": str(circuit.facility_id),
        "name": circuit.name,
        "sri_name": circuit.sri_name,
        "sri_status": circuit.sri_status.value,
        "test_status": circuit.test_status.value,
        "planned_date": circuit.planned_date.isoformat() if circuit.planned_date else None,
        "act_number": circuit.act_number,
        "actual_test_date": (
            circuit.actual_test_date.isoformat() if circuit.actual_test_date else None
        ),
        "record_status": circuit.record_status.value,
        "version": circuit.version,
    }


def _build_circuit_out(
    circuit: TestCircuit,
    metrics: CircuitMetrics,
    facility_name: str = "",
) -> TestCircuitOut:
    return TestCircuitOut(
        id=circuit.id,
        facility_id=circuit.facility_id,
        facility_name=facility_name,
        name=circuit.name,
        sri_name=circuit.sri_name,
        sri_status=circuit.sri_status,
        test_status=circuit.test_status,
        planned_date=circuit.planned_date,
        act_number=circuit.act_number,
        actual_test_date=circuit.actual_test_date,
        record_status=circuit.record_status,
        version=circuit.version,
        created_by_id=circuit.created_by_id,
        updated_by_id=circuit.updated_by_id,
        created_at=circuit.created_at,
        updated_at=circuit.updated_at,
        total_joints=metrics.total_joints,
        welded_joints=metrics.welded_joints,
        welding_joints_percent=metrics.welding_joints_percent,
        total_d_inch=metrics.total_d_inch,
        welded_d_inch=metrics.welded_d_inch,
        welding_d_inch_percent=metrics.welding_d_inch_percent,
        total_edi=metrics.total_edi,
        welded_edi=metrics.welded_edi,
        welding_edi_percent=metrics.welding_edi_percent,
        defective_joints_count=metrics.defective_joints_count,
        lines_summary=metrics.lines_summary,
    )


def _joint_to_brief(joint: WeldJoint) -> CircuitJointBriefOut:
    return CircuitJointBriefOut(
        id=joint.id,
        line_id=joint.line_id,
        unique_line_id=joint.unique_line_id,
        line_number=joint.line_number,
        rd_code=joint.rd_code,
        joint_number=joint.joint_number,
        diameter_mm=joint.diameter_mm,
        diameter_inch=joint.diameter_inch,
        nominal_d_inch=get_joint_nominal_d_inch(joint),
        equiv_diameter_inch=get_joint_edi(joint),
        wall_thickness=joint.wall_thickness,
        welding_date=joint.welding_date,
        is_welded=joint.welding_date is not None,
        is_defective=is_joint_currently_in_repair(joint),
        vik_result=joint.vik_result,
        ndt_result=joint.ndt_result,
        record_status=joint.record_status,
        version=joint.version,
    )


async def _resolve_facility(
    session: AsyncSession,
    facility_id: uuid.UUID | None,
    object_name: str | None,
) -> Facility:
    facility: Facility | None = None
    if facility_id is not None:
        facility = (
            await session.execute(select(Facility).where(Facility.id == facility_id))
        ).scalar_one_or_none()
    elif object_name and object_name.strip():
        facility = (
            await session.execute(
                select(Facility).where(Facility.name == object_name.strip())
            )
        ).scalar_one_or_none()
    if facility is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Объект строительства для испытательного контура не найден.",
        )
    return facility


async def list_test_circuits(
    session: AsyncSession,
    *,
    facility_id: uuid.UUID | None = None,
    object_name: str | None = None,
    test_status: CircuitTestStatusEnum | None = None,
    sri_status: SriStatusEnum | None = None,
    search: str | None = None,
) -> list[TestCircuitOut]:
    stmt = select(TestCircuit, Facility.name).join(
        Facility, Facility.id == TestCircuit.facility_id
    )
    if facility_id is not None:
        stmt = stmt.where(TestCircuit.facility_id == facility_id)
    if object_name and object_name.strip() and object_name.strip().upper() != "ALL":
        stmt = stmt.where(Facility.name == object_name.strip())
    if test_status is not None:
        stmt = stmt.where(TestCircuit.test_status == test_status)
    if sri_status is not None:
        stmt = stmt.where(TestCircuit.sri_status == sri_status)
    if search and search.strip():
        pattern = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(TestCircuit.name).like(pattern),
                func.lower(func.coalesce(TestCircuit.sri_name, "")).like(pattern),
                func.lower(func.coalesce(TestCircuit.act_number, "")).like(pattern),
            )
        )

    stmt = stmt.order_by(TestCircuit.created_at.desc(), TestCircuit.name.asc())
    rows = (await session.execute(stmt)).all()
    circuit_ids = [row[0].id for row in rows]
    metrics_map = await compute_circuits_metrics_sql(session, circuit_ids)

    return [
        _build_circuit_out(circuit, metrics_map.get(circuit.id, CircuitMetrics()), fac_name)
        for circuit, fac_name in rows
    ]


async def get_test_circuit_detail(
    session: AsyncSession,
    circuit_id: uuid.UUID,
) -> TestCircuitDetailOut:
    row = (
        await session.execute(
            select(TestCircuit, Facility.name)
            .join(Facility, Facility.id == TestCircuit.facility_id)
            .where(TestCircuit.id == circuit_id)
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Испытательный контур не найден.",
        )
    circuit, fac_name = row
    metrics_map = await compute_circuits_metrics_sql(session, [circuit.id])
    joints = list(
        (
            await session.execute(
                select(WeldJoint)
                .where(WeldJoint.test_circuit_id == circuit.id)
                .order_by(
                    WeldJoint.unique_line_id.asc(),
                    WeldJoint.sort_order.asc(),
                    WeldJoint.joint_number.asc(),
                )
            )
        )
        .scalars()
        .all()
    )
    base = _build_circuit_out(circuit, metrics_map.get(circuit.id, CircuitMetrics()), fac_name)
    return TestCircuitDetailOut(
        **base.model_dump(),
        joints=[_joint_to_brief(j) for j in joints],
    )


async def create_test_circuit(
    session: AsyncSession,
    payload: TestCircuitCreate,
    *,
    user: User,
    ip_address: str | None = None,
) -> TestCircuitOut:
    assert_can_mutate_record(
        user=user,
        record=None,
        allowed_departments=CIRCUIT_ALLOWED_DEPTS,
        operation="create",
    )
    facility = await _resolve_facility(session, payload.facility_id, payload.object_name)
    clean_name = payload.name.strip()

    duplicate = (
        await session.execute(
            select(TestCircuit.id).where(
                TestCircuit.facility_id == facility.id,
                func.lower(func.btrim(TestCircuit.name)) == clean_name.lower(),
            )
        )
    ).scalar_one_or_none()
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Испытательный контур «{clean_name}» уже существует на объекте «{facility.name}».",
        )

    now = datetime.now(timezone.utc)
    circuit = TestCircuit(
        facility_id=facility.id,
        name=clean_name,
        sri_name=payload.sri_name.strip() if payload.sri_name and payload.sri_name.strip() else None,
        sri_status=payload.sri_status,
        test_status=CircuitTestStatusEnum.NOT_TESTED,
        planned_date=payload.planned_date,
        act_number=payload.act_number.strip() if payload.act_number and payload.act_number.strip() else None,
        actual_test_date=payload.actual_test_date,
        record_status=RecordStatusEnum.DRAFT,
        version=1,
        created_by_id=user.id,
        updated_by_id=user.id,
        created_at=now,
        updated_at=now,
    )
    session.add(circuit)
    await session.flush()

    snap = _circuit_snapshot(circuit)
    await record_audit_log(
        session,
        action="CREATE",
        entity_type="test_circuit",
        entity_id=str(circuit.id),
        user=user,
        new_data=snap,
        ip_address=ip_address,
        summary=f"Создан испытательный контур «{circuit.name}» ({facility.name})",
    )
    await publish_domain_event(
        session,
        event="circuit_updated",
        entity_type="test_circuit",
        entity_id=circuit.id,
        version=circuit.version,
        updated_by=user.login,
        data={"action": "created", "facility_id": str(facility.id), "circuit_id": str(circuit.id)},
    )
    return _build_circuit_out(circuit, CircuitMetrics(), facility.name)


async def update_test_circuit(
    session: AsyncSession,
    circuit_id: uuid.UUID,
    payload: TestCircuitUpdate,
    *,
    user: User,
    ip_address: str | None = None,
) -> TestCircuitDetailOut:
    row = (
        await session.execute(
            select(TestCircuit, Facility.name)
            .join(Facility, Facility.id == TestCircuit.facility_id)
            .where(TestCircuit.id == circuit_id)
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Испытательный контур не найден.",
        )
    circuit, fac_name = row

    assert_can_mutate_record(
        user=user,
        record=circuit,
        allowed_departments=CIRCUIT_ALLOWED_DEPTS,
        operation="update",
    )

    patch_data = payload.model_dump(exclude_unset=True)
    force_flag = bool(patch_data.pop("force", False))
    force_reason = patch_data.pop("force_reason", None)
    expected_version = int(patch_data.pop("version"))

    enforce_optimistic_lock(
        entity_type="test_circuit",
        entity_obj=circuit,
        expected_version=expected_version,
        patch_data=patch_data,
        schema_cls=TestCircuitOut,
    )

    old_snap = _circuit_snapshot(circuit)
    old_name = circuit.name
    old_test_status = circuit.test_status

    if (
        old_test_status == CircuitTestStatusEnum.TESTED
        and patch_data.get("test_status") == CircuitTestStatusEnum.TESTED
        and force_flag
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Контур уже находится в статусе «Испытано». Повторный принудительный перевод не допускается.",
        )

    next_name = (
        patch_data["name"].strip()
        if "name" in patch_data and patch_data["name"] is not None
        else circuit.name
    )
    if next_name.lower() != old_name.lower():
        dup = (
            await session.execute(
                select(TestCircuit.id).where(
                    TestCircuit.facility_id == circuit.facility_id,
                    TestCircuit.id != circuit.id,
                    func.lower(func.btrim(TestCircuit.name)) == next_name.lower(),
                )
            )
        ).scalar_one_or_none()
        if dup is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Контур «{next_name}» уже существует на объекте «{fac_name}».",
            )

    next_sri_status = patch_data.get("sri_status") or circuit.sri_status
    next_test_status = patch_data.get("test_status") or circuit.test_status
    next_act_number = (
        patch_data["act_number"].strip() if patch_data.get("act_number") else None
        if "act_number" in patch_data
        else circuit.act_number
    )
    next_actual_test_date = (
        patch_data["actual_test_date"]
        if "actual_test_date" in patch_data
        else circuit.actual_test_date
    )

    metrics_map = await compute_circuits_metrics_sql(session, [circuit.id])
    current_metrics = metrics_map.get(circuit.id, CircuitMetrics())

    forced_warnings: list[str] = []
    if next_test_status == CircuitTestStatusEnum.TESTED:
        forced_warnings = validate_circuit_test_readiness(
            circuit_sri_status=next_sri_status,
            act_number=next_act_number,
            actual_test_date=next_actual_test_date,
            metrics=current_metrics,
            user=user,
            force=force_flag,
            force_reason=force_reason,
        )

    circuit.name = next_name
    if "sri_name" in patch_data:
        raw_sri = patch_data["sri_name"]
        circuit.sri_name = raw_sri.strip() if raw_sri and raw_sri.strip() else None
    circuit.sri_status = next_sri_status
    circuit.test_status = next_test_status
    if "planned_date" in patch_data:
        circuit.planned_date = patch_data["planned_date"]
    circuit.act_number = next_act_number
    circuit.actual_test_date = next_actual_test_date

    # Auto-lock into VERIFIED when transitioning into TESTED
    if (
        next_test_status == CircuitTestStatusEnum.TESTED
        and circuit.record_status == RecordStatusEnum.DRAFT
    ):
        circuit.record_status = RecordStatusEnum.VERIFIED

    circuit.version += 1
    circuit.updated_by_id = user.id
    circuit.updated_at = datetime.now(timezone.utc)

    # Keep weld_joints.contour string snapshot synced if circuit was renamed
    if next_name != old_name:
        await session.execute(
            update(WeldJoint)
            .where(WeldJoint.test_circuit_id == circuit.id)
            .values(contour=next_name)
        )

    await session.flush()

    new_snap = _circuit_snapshot(circuit)
    old_diff, new_diff = extract_changed_fields(old_snap, new_snap)
    if forced_warnings:
        new_diff = {
            **(new_diff or {}),
            "force_warnings": forced_warnings,
            "force_reason": (force_reason or "").strip(),
            "forced_by_user": user.login,
            "forced_by_role": user.role.value if hasattr(user.role, "value") else str(user.role),
        }
    summary = f"Обновлён испытательный контур «{circuit.name}» (v{circuit.version})"
    action_code = "UPDATE"
    if forced_warnings:
        action_code = "CIRCUIT_FORCE_TESTED"
        summary = (
            f"Принудительно закрыт акт испытания контура «{circuit.name}» "
            f"(Акт {circuit.act_number}). Обоснование: {(force_reason or '').strip()}. "
            f"Предупреждения: " + "; ".join(forced_warnings)
        )
    elif old_test_status != CircuitTestStatusEnum.TESTED and next_test_status == CircuitTestStatusEnum.TESTED:
        action_code = "CIRCUIT_TESTED"
        summary = (
            f"Контур «{circuit.name}» переведён в статус «Испытано» "
            f"(Акт № {circuit.act_number} от {circuit.actual_test_date}); статус записи зафиксирован (VERIFIED)"
        )

    await record_audit_log(
        session,
        action=action_code,
        entity_type="test_circuit",
        entity_id=str(circuit.id),
        user=user,
        old_data=old_diff,
        new_data=new_diff,
        ip_address=ip_address,
        summary=summary,
    )
    await publish_domain_event(
        session,
        event="circuit_updated",
        entity_type="test_circuit",
        entity_id=circuit.id,
        version=circuit.version,
        updated_by=user.login,
        data={"action": "updated", "facility_id": str(circuit.facility_id), "circuit_id": str(circuit.id)},
    )
    return await get_test_circuit_detail(session, circuit.id)


async def change_test_circuit_record_status(
    session: AsyncSession,
    circuit_id: uuid.UUID,
    *,
    target_status: RecordStatusEnum,
    expected_version: int | None,
    reason: str | None,
    user: User,
    ip_address: str | None = None,
) -> TestCircuitDetailOut:
    circuit = (
        await session.execute(select(TestCircuit).where(TestCircuit.id == circuit_id))
    ).scalar_one_or_none()
    if circuit is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Испытательный контур не найден.",
        )

    assert_can_transition_record_status(
        user=user,
        record=circuit,
        target_status=target_status,
        allowed_departments=CIRCUIT_ALLOWED_DEPTS,
        reason=reason,
    )
    if expected_version is not None:
        enforce_optimistic_lock(
            entity_type="test_circuit",
            entity_obj=circuit,
            expected_version=expected_version,
            patch_data={"record_status": target_status.value},
            schema_cls=TestCircuitOut,
        )

    old_status = circuit.record_status.value
    is_unlock = (
        circuit.record_status == RecordStatusEnum.LOCKED
        and target_status != RecordStatusEnum.LOCKED
    )
    circuit.record_status = target_status
    circuit.version += 1
    circuit.updated_by_id = user.id
    circuit.updated_at = datetime.now(timezone.utc)
    await session.flush()

    await record_audit_log(
        session,
        action="RECORD_UNLOCKED" if is_unlock else "RECORD_STATUS_CHANGED",
        entity_type="test_circuit",
        entity_id=str(circuit.id),
        user=user,
        old_data={"record_status": old_status},
        new_data={
            "record_status": target_status.value,
            **({"reason": reason.strip()} if reason and reason.strip() else {}),
        },
        ip_address=ip_address,
        summary=(
            f"Снята блокировка контура «{circuit.name}» ({old_status} -> {target_status.value}): {reason}"
            if is_unlock
            else f"Изменён статус фиксации контура «{circuit.name}»: {old_status} -> {target_status.value}"
        ),
    )
    await publish_domain_event(
        session,
        event="circuit_updated",
        entity_type="test_circuit",
        entity_id=circuit.id,
        version=circuit.version,
        updated_by=user.login,
        data={"action": "status_changed", "facility_id": str(circuit.facility_id), "circuit_id": str(circuit.id)},
    )
    return await get_test_circuit_detail(session, circuit.id)


async def delete_test_circuit(
    session: AsyncSession,
    circuit_id: uuid.UUID,
    *,
    expected_version: int | None,
    user: User,
    ip_address: str | None = None,
) -> None:
    circuit = (
        await session.execute(select(TestCircuit).where(TestCircuit.id == circuit_id))
    ).scalar_one_or_none()
    if circuit is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Испытательный контур не найден.",
        )

    assert_can_mutate_record(
        user=user,
        record=circuit,
        allowed_departments=CIRCUIT_ALLOWED_DEPTS,
        operation="delete",
    )
    if expected_version is not None:
        enforce_optimistic_lock(
            entity_type="test_circuit",
            entity_obj=circuit,
            expected_version=expected_version,
            patch_data={},
            schema_cls=TestCircuitOut,
        )

    old_snap = _circuit_snapshot(circuit)
    fac_id = circuit.facility_id
    circuit_name = circuit.name
    ver = circuit.version

    # Clear test_circuit_id and string contour snapshot on previously bound joints
    await session.execute(
        update(WeldJoint)
        .where(WeldJoint.test_circuit_id == circuit.id)
        .values(test_circuit_id=None, contour="")
    )
    await session.delete(circuit)
    await session.flush()

    await record_audit_log(
        session,
        action="DELETE",
        entity_type="test_circuit",
        entity_id=str(circuit_id),
        user=user,
        old_data=old_snap,
        ip_address=ip_address,
        summary=f"Удалён испытательный контур «{circuit_name}»",
    )
    await publish_domain_event(
        session,
        event="circuit_updated",
        entity_type="test_circuit",
        entity_id=circuit_id,
        version=ver,
        updated_by=user.login,
        data={"action": "deleted", "facility_id": str(fac_id), "circuit_id": str(circuit_id)},
    )


async def _assert_source_circuits_mutable(
    session: AsyncSession,
    source_circuit_ids: set[uuid.UUID],
    user: User,
) -> dict[uuid.UUID, TestCircuit]:
    if not source_circuit_ids:
        return {}
    sources = list(
        (
            await session.execute(
                select(TestCircuit).where(TestCircuit.id.in_(source_circuit_ids))
            )
        )
        .scalars()
        .all()
    )
    source_map = {c.id: c for c in sources}
    for src in sources:
        assert_can_mutate_record(
            user=user,
            record=src,
            allowed_departments=CIRCUIT_ALLOWED_DEPTS,
            operation="update",
        )
    return source_map


async def assign_lines_to_circuit(
    session: AsyncSession,
    circuit_id: uuid.UUID,
    payload: AssignLinesRequest,
    *,
    user: User,
    ip_address: str | None = None,
) -> tuple[TestCircuitDetailOut, int]:
    circuit = (
        await session.execute(select(TestCircuit).where(TestCircuit.id == circuit_id))
    ).scalar_one_or_none()
    if circuit is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Испытательный контур не найден.",
        )

    assert_can_mutate_record(
        user=user,
        record=circuit,
        allowed_departments=CIRCUIT_ALLOWED_DEPTS,
        operation="update",
    )

    lines = list(
        (
            await session.execute(
                select(ProjectLine).where(ProjectLine.id.in_(payload.line_ids))
            )
        )
        .scalars()
        .all()
    )
    if len(lines) != len(set(payload.line_ids)):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Одна или несколько выбранных линий не найдены.",
        )
    for line in lines:
        if line.facility_id != circuit.facility_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Линия «{line.unique_line_id}» относится к другому объекту строительства "
                    f"и не может быть привязана к контуру «{circuit.name}»."
                ),
            )

    joints = list(
        (
            await session.execute(
                select(WeldJoint).where(WeldJoint.line_id.in_(payload.line_ids))
            )
        )
        .scalars()
        .all()
    )

    conflicting_joints = [
        j for j in joints if j.test_circuit_id is not None and j.test_circuit_id != circuit.id
    ]
    other_circuit_ids = {j.test_circuit_id for j in conflicting_joints if j.test_circuit_id is not None}

    if conflicting_joints and not payload.overwrite_existing:
        other_circuits = {
            c.id: c.name
            for c in (
                await session.execute(
                    select(TestCircuit).where(TestCircuit.id.in_(other_circuit_ids))
                )
            )
            .scalars()
            .all()
        }
        conflict_items = [
            {
                "joint_id": str(j.id),
                "joint_number": j.joint_number,
                "unique_line_id": j.unique_line_id,
                "line_number": j.line_number,
                "current_circuit_id": str(j.test_circuit_id),
                "current_circuit_name": other_circuits.get(j.test_circuit_id, ""),
            }
            for j in conflicting_joints
        ]
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "CIRCUIT_ASSIGNMENT_CONFLICT",
                "message": (
                    f"Обнаружено {len(conflict_items)} стыков, уже привязанных к другим контурам. "
                    "Подтвердите переназначение (overwrite_existing=true), чтобы перенести их."
                ),
                "conflicts": conflict_items,
            },
        )

    # Protect source circuits if reassigning existing joints
    await _assert_source_circuits_mutable(session, other_circuit_ids, user)

    affected_count = 0
    now = datetime.now(timezone.utc)
    for j in joints:
        if j.test_circuit_id != circuit.id or j.contour != circuit.name:
            j.test_circuit_id = circuit.id
            j.contour = circuit.name
            j.version += 1
            j.updated_by = user.login
            j.updated_by_id = user.id
            j.updated_at = now
            affected_count += 1

    circuit.version += 1
    circuit.updated_by_id = user.id
    circuit.updated_at = now
    await session.flush()

    line_labels = [line_obj.unique_line_id for line_obj in lines]
    await record_audit_log(
        session,
        action="CIRCUIT_ASSIGN_LINES",
        entity_type="test_circuit",
        entity_id=str(circuit.id),
        user=user,
        new_data={
            "circuit_name": circuit.name,
            "line_ids": [str(lid) for lid in payload.line_ids],
            "lines": line_labels,
            "affected_joints_count": affected_count,
            "overwrite_existing": payload.overwrite_existing,
        },
        ip_address=ip_address,
        summary=(
            f"Назначены линии ({len(lines)} шт., стыков: {affected_count}) "
            f"в испытательный контур «{circuit.name}»"
        ),
    )

    for affected_cid in {circuit.id, *other_circuit_ids}:
        await publish_domain_event(
            session,
            event="circuit_updated",
            entity_type="test_circuit",
            entity_id=affected_cid,
            version=circuit.version if affected_cid == circuit.id else None,
            updated_by=user.login,
            data={"action": "assign_lines", "facility_id": str(circuit.facility_id), "circuit_id": str(affected_cid)},
        )

    detail = await get_test_circuit_detail(session, circuit.id)
    return detail, affected_count


async def assign_joints_to_circuit(
    session: AsyncSession,
    circuit_id: uuid.UUID,
    payload: AssignJointsRequest,
    *,
    user: User,
    ip_address: str | None = None,
) -> tuple[TestCircuitDetailOut, int]:
    circuit = (
        await session.execute(select(TestCircuit).where(TestCircuit.id == circuit_id))
    ).scalar_one_or_none()
    if circuit is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Испытательный контур не найден.",
        )

    assert_can_mutate_record(
        user=user,
        record=circuit,
        allowed_departments=CIRCUIT_ALLOWED_DEPTS,
        operation="update",
    )

    unique_ids = list(dict.fromkeys(payload.joint_ids))
    joints = list(
        (
            await session.execute(
                select(WeldJoint).where(WeldJoint.id.in_(unique_ids))
            )
        )
        .scalars()
        .all()
    )
    if len(joints) != len(unique_ids):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Один или несколько выбранных стыков не найдены.",
        )

    for j in joints:
        if j.facility_id is not None and j.facility_id != circuit.facility_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Стык № {j.joint_number} ({j.unique_line_id}) относится к другому объекту строительства."
                ),
            )

    conflicting_joints = [
        j for j in joints if j.test_circuit_id is not None and j.test_circuit_id != circuit.id
    ]
    other_circuit_ids = {j.test_circuit_id for j in conflicting_joints if j.test_circuit_id is not None}

    if conflicting_joints and not payload.overwrite_existing:
        other_circuits = {
            c.id: c.name
            for c in (
                await session.execute(
                    select(TestCircuit).where(TestCircuit.id.in_(other_circuit_ids))
                )
            )
            .scalars()
            .all()
        }
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "CIRCUIT_ASSIGNMENT_CONFLICT",
                "message": f"Обнаружено {len(conflicting_joints)} стыков в других контурах.",
                "conflicts": [
                    {
                        "joint_id": str(j.id),
                        "joint_number": j.joint_number,
                        "unique_line_id": j.unique_line_id,
                        "current_circuit_id": str(j.test_circuit_id),
                        "current_circuit_name": other_circuits.get(j.test_circuit_id, ""),
                    }
                    for j in conflicting_joints
                ],
            },
        )

    await _assert_source_circuits_mutable(session, other_circuit_ids, user)

    affected_count = 0
    now = datetime.now(timezone.utc)
    for j in joints:
        if j.test_circuit_id != circuit.id or j.contour != circuit.name:
            j.test_circuit_id = circuit.id
            j.contour = circuit.name
            j.version += 1
            j.updated_by = user.login
            j.updated_by_id = user.id
            j.updated_at = now
            affected_count += 1

    circuit.version += 1
    circuit.updated_by_id = user.id
    circuit.updated_at = now
    await session.flush()

    await record_audit_log(
        session,
        action="CIRCUIT_ASSIGN_JOINTS",
        entity_type="test_circuit",
        entity_id=str(circuit.id),
        user=user,
        new_data={
            "circuit_name": circuit.name,
            "joint_ids": [str(jid) for jid in unique_ids],
            "affected_joints_count": affected_count,
        },
        ip_address=ip_address,
        summary=f"Точечно привязано стыков ({affected_count} шт.) в испытательный контур «{circuit.name}»",
    )

    for affected_cid in {circuit.id, *other_circuit_ids}:
        await publish_domain_event(
            session,
            event="circuit_updated",
            entity_type="test_circuit",
            entity_id=affected_cid,
            version=circuit.version if affected_cid == circuit.id else None,
            updated_by=user.login,
            data={"action": "assign_joints", "facility_id": str(circuit.facility_id), "circuit_id": str(affected_cid)},
        )

    detail = await get_test_circuit_detail(session, circuit.id)
    return detail, affected_count


async def unassign_joints_from_circuit(
    session: AsyncSession,
    circuit_id: uuid.UUID,
    payload: UnassignJointsRequest,
    *,
    user: User,
    ip_address: str | None = None,
) -> tuple[TestCircuitDetailOut, int]:
    circuit = (
        await session.execute(select(TestCircuit).where(TestCircuit.id == circuit_id))
    ).scalar_one_or_none()
    if circuit is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Испытательный контур не найден.",
        )

    assert_can_mutate_record(
        user=user,
        record=circuit,
        allowed_departments=CIRCUIT_ALLOWED_DEPTS,
        operation="update",
    )

    unique_ids = list(dict.fromkeys(payload.joint_ids))
    joints = list(
        (
            await session.execute(
                select(WeldJoint).where(
                    WeldJoint.id.in_(unique_ids),
                    WeldJoint.test_circuit_id == circuit.id,
                )
            )
        )
        .scalars()
        .all()
    )

    affected_count = 0
    now = datetime.now(timezone.utc)
    for j in joints:
        j.test_circuit_id = None
        if j.contour == circuit.name:
            j.contour = ""
        j.version += 1
        j.updated_by = user.login
        j.updated_by_id = user.id
        j.updated_at = now
        affected_count += 1

    circuit.version += 1
    circuit.updated_by_id = user.id
    circuit.updated_at = now
    await session.flush()

    await record_audit_log(
        session,
        action="CIRCUIT_UNASSIGN_JOINTS",
        entity_type="test_circuit",
        entity_id=str(circuit.id),
        user=user,
        new_data={
            "circuit_name": circuit.name,
            "joint_ids": [str(j.id) for j in joints],
            "affected_joints_count": affected_count,
        },
        ip_address=ip_address,
        summary=f"Исключено стыков ({affected_count} шт.) из испытательного контура «{circuit.name}»",
    )
    await publish_domain_event(
        session,
        event="circuit_updated",
        entity_type="test_circuit",
        entity_id=circuit.id,
        version=circuit.version,
        updated_by=user.login,
        data={"action": "unassign_joints", "facility_id": str(circuit.facility_id), "circuit_id": str(circuit.id)},
    )

    detail = await get_test_circuit_detail(session, circuit.id)
    return detail, affected_count


async def validate_and_sync_joint_circuit_change(
    session: AsyncSession,
    *,
    joint: WeldJoint,
    new_circuit_id: uuid.UUID | None,
    user: User,
) -> tuple[str | None, set[uuid.UUID]]:
    """
    Guardrail invoked from PATCH /api/joints/{id} when test_circuit_id is modified.
    Protects VERIFIED/LOCKED circuits from indirect mutation via joint edits and
    returns (synced_contour_name_or_None, affected_circuit_ids).
    """
    old_circuit_id = joint.test_circuit_id
    if old_circuit_id == new_circuit_id:
        return None, set()

    affected: set[uuid.UUID] = set()
    if old_circuit_id is not None:
        old_circuit = (
            await session.execute(select(TestCircuit).where(TestCircuit.id == old_circuit_id))
        ).scalar_one_or_none()
        if old_circuit is not None:
            assert_can_mutate_record(
                user=user,
                record=old_circuit,
                allowed_departments=CIRCUIT_ALLOWED_DEPTS,
                operation="update",
            )
            affected.add(old_circuit.id)

    synced_contour: str | None = ""
    if new_circuit_id is not None:
        new_circuit = (
            await session.execute(select(TestCircuit).where(TestCircuit.id == new_circuit_id))
        ).scalar_one_or_none()
        if new_circuit is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Указанный испытательный контур не найден.",
            )
        if joint.facility_id is not None and new_circuit.facility_id != joint.facility_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Испытательный контур относится к другому объекту строительства.",
            )
        assert_can_mutate_record(
            user=user,
            record=new_circuit,
            allowed_departments=CIRCUIT_ALLOWED_DEPTS,
            operation="update",
        )
        synced_contour = new_circuit.name
        affected.add(new_circuit.id)

    return synced_contour, affected
