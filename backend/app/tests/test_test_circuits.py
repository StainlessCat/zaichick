from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_current_user
from app.core.database import get_db_session
from app.core.security import hash_password
from app.main import app
from app.models.enums import (
    CircuitTestStatusEnum,
    ControlResultEnum,
    DepartmentEnum,
    NdtMethodEnum,
    RecordStatusEnum,
    SriStatusEnum,
    SystemRoleEnum,
)
from app.models.joint import WeldJoint
from app.models.line import ProjectLine
from app.models.test_circuit import TestCircuit
from app.models.user import User
from app.schemas.test_circuit import AssignLinesRequest
from app.services.rbac import can_edit_joint_field, get_role_permissions
from app.services.test_circuit_service import (
    CircuitMetrics,
    assign_lines_to_circuit,
    calculate_circuit_metrics_from_joints,
    validate_and_sync_joint_circuit_change,
    validate_circuit_test_readiness,
)


def _make_user(
    *,
    login: str,
    role: SystemRoleEnum,
    department: DepartmentEnum,
) -> User:
    now = datetime.now(timezone.utc)
    return User(
        id=uuid.uuid4(),
        login=login,
        password_hash=hash_password("StrongPass1!"),
        full_name=f"Тест {login}",
        role=role,
        department=department,
        position_title="Инженер",
        session_number=1,
        is_active=True,
        must_change_password=False,
        version=1,
        created_at=now,
        updated_at=now,
    )


def _make_joint(
    *,
    line_id: uuid.UUID,
    facility_id: uuid.UUID,
    joint_number: str,
    diameter_mm: float = 219.0,
    diameter_inch: str = '8"',
    wall_thickness: float = 8.0,
    welding_date: date | None = date(2026, 5, 10),
    welder_stamp: str = "W-01",
    vik_result: ControlResultEnum = ControlResultEnum.FIT,
    ndt_result: ControlResultEnum = ControlResultEnum.FIT,
    ndt_type: NdtMethodEnum = NdtMethodEnum.RT,
    dup_ndt_type: NdtMethodEnum = NdtMethodEnum.NOT_REQUIRED,
    dup_ndt_result: ControlResultEnum = ControlResultEnum.NOT_CONDUCTED,
    repair_action: str | None = None,
    repair_vik_result: ControlResultEnum | None = None,
    repair_ndt_type: NdtMethodEnum | None = None,
    repair_ndt_result: ControlResultEnum | None = None,
    repair_dup_ndt_type: NdtMethodEnum | None = None,
    repair_dup_ndt_result: ControlResultEnum | None = None,
    test_circuit_id: uuid.UUID | None = None,
    unique_line_id: str = "РД-01::L-100",
    line_number: str = "L-100",
    rd_code: str = "РД-01",
) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        line_id=line_id,
        facility_id=facility_id,
        test_circuit_id=test_circuit_id,
        contour="",
        joint_number=joint_number,
        unique_line_id=unique_line_id,
        line_number=line_number,
        rd_code=rd_code,
        diameter_mm=diameter_mm,
        diameter_inch=diameter_inch,
        equiv_diameter_inch=None,
        wall_thickness=wall_thickness,
        welding_date=welding_date,
        welder_stamp=welder_stamp,
        vik_result=vik_result,
        ndt_type=ndt_type,
        ndt_result=ndt_result,
        dup_ndt_type=dup_ndt_type,
        dup_ndt_result=dup_ndt_result,
        repair_action=repair_action,
        repair_vik_result=repair_vik_result,
        repair_ndt_type=repair_ndt_type,
        repair_ndt_result=repair_ndt_result,
        repair_dup_ndt_type=repair_dup_ndt_type,
        repair_dup_ndt_result=repair_dup_ndt_result,
        record_status=RecordStatusEnum.DRAFT,
        version=1,
    )


class _FakeResult:
    def __init__(self, rows=None, scalar=None, one=None):
        self._rows = list(rows or [])
        self._scalar = scalar
        self._one = one

    def scalar_one_or_none(self):
        return self._scalar if self._scalar is not None else (self._rows[0] if self._rows else None)

    def one_or_none(self):
        return self._one

    def scalars(self):
        return self

    def all(self):
        return list(self._rows)


# ---------------------------------------------------------------------------
# 1. Metrics: Normative DN d-inch + Method A EDI + Partial vs Full line
# ---------------------------------------------------------------------------
def test_circuit_metrics_normative_dinch_edi_and_partial_line():
    fac_id = uuid.uuid4()
    line1_id = uuid.uuid4()
    line2_id = uuid.uuid4()

    # Line 1 has 3 joints total, but only 2 assigned (tie-in joint #3 excluded)
    # 219 mm -> 8" (K_wall(8mm)=1.0 => EDI=8.0)
    # 325 mm -> 12" (K_wall(14mm)=1.35 => EDI=16.2)
    j1 = _make_joint(
        line_id=line1_id,
        facility_id=fac_id,
        joint_number="1",
        diameter_mm=219.0,
        diameter_inch='8"',
        wall_thickness=8.0,
        welding_date=date(2026, 5, 10),
    )
    j2 = _make_joint(
        line_id=line1_id,
        facility_id=fac_id,
        joint_number="2",
        diameter_mm=325.0,
        diameter_inch='12"',
        wall_thickness=14.0,
        welding_date=None,
        welder_stamp="",
    )
    # Line 2 has 1 joint total, fully assigned, with unresolved NDT defect
    # 159 mm -> 6" (K_wall(6mm)=1.0 => EDI=6.0)
    j3 = _make_joint(
        line_id=line2_id,
        facility_id=fac_id,
        joint_number="1",
        diameter_mm=159.0,
        diameter_inch='6"',
        wall_thickness=6.0,
        welding_date=date(2026, 5, 11),
        ndt_result=ControlResultEnum.REPAIR,
        unique_line_id="РД-01::L-200",
        line_number="L-200",
    )

    metrics = calculate_circuit_metrics_from_joints(
        [j1, j2, j3],
        line_totals_map={line1_id: 3, line2_id: 1},
    )

    assert metrics.total_joints == 3
    assert metrics.welded_joints == 2
    assert metrics.welding_joints_percent == 66.7

    # Total d-inch = 8 + 12 + 6 = 26.0; welded = 8 + 6 = 14.0
    assert metrics.total_d_inch == 26.0
    assert metrics.welded_d_inch == 14.0
    assert metrics.welding_d_inch_percent == round(14.0 / 26.0 * 100.0, 1)

    # Total EDI = 8.0 + 16.2 + 6.0 = 30.2; welded EDI = 8.0 + 6.0 = 14.0
    assert metrics.total_edi == 30.2
    assert metrics.welded_edi == 14.0
    assert metrics.welding_edi_percent == round(14.0 / 30.2 * 100.0, 1)

    assert metrics.defective_joints_count == 1
    assert len(metrics.lines_summary) == 2

    l1_sum = next(x for x in metrics.lines_summary if x.line_id == line1_id)
    l2_sum = next(x for x in metrics.lines_summary if x.line_id == line2_id)
    assert l1_sum.assigned_joints_count == 2
    assert l1_sum.line_total_joints_count == 3
    assert l1_sum.is_full_line is False
    assert l2_sum.is_full_line is True


# ---------------------------------------------------------------------------
# 2. TESTED status guardrails & authorized force-close
# ---------------------------------------------------------------------------
def test_validate_circuit_test_readiness_guardrails_and_force():
    op_pto = _make_user(login="op_pto", role=SystemRoleEnum.OPERATOR, department=DepartmentEnum.PTO)
    adm_sk = _make_user(login="adm_sk", role=SystemRoleEnum.DEPT_ADMIN, department=DepartmentEnum.SK)
    sa = _make_user(login="sa", role=SystemRoleEnum.SUPERADMIN, department=DepartmentEnum.ALL)

    ready_metrics = CircuitMetrics(
        total_joints=10,
        welded_joints=10,
        welding_joints_percent=100.0,
        defective_joints_count=0,
    )

    # Missing act_number / actual_test_date -> always blocked even with force=True
    with pytest.raises(HTTPException) as exc:
        validate_circuit_test_readiness(
            circuit_sri_status=SriStatusEnum.APPROVED,
            act_number=None,
            actual_test_date=date(2026, 5, 20),
            metrics=ready_metrics,
            user=sa,
            force=True,
        )
    assert exc.value.status_code == 400
    assert exc.value.detail["code"] == "CIRCUIT_ACT_FIELDS_REQUIRED"

    # Unready metrics: incomplete welding + unapproved SRI + unresolved defect
    bad_metrics = CircuitMetrics(
        total_joints=10,
        welded_joints=8,
        welding_joints_percent=80.0,
        defective_joints_count=2,
    )
    with pytest.raises(HTTPException) as exc:
        validate_circuit_test_readiness(
            circuit_sri_status=SriStatusEnum.DEVELOPED,
            act_number="АКТ-01",
            actual_test_date=date(2026, 5, 20),
            metrics=bad_metrics,
            user=op_pto,
            force=False,
        )
    assert exc.value.status_code == 400
    assert len(exc.value.detail["reasons"]) == 3
    assert exc.value.detail["can_force"] is False

    # OPERATOR cannot use force=True -> 403
    with pytest.raises(HTTPException) as exc:
        validate_circuit_test_readiness(
            circuit_sri_status=SriStatusEnum.DEVELOPED,
            act_number="АКТ-01",
            actual_test_date=date(2026, 5, 20),
            metrics=bad_metrics,
            user=op_pto,
            force=True,
        )
    assert exc.value.status_code == 403

    # SK DEPT_ADMIN can use force=True -> returns warning reasons for audit log
    warnings = validate_circuit_test_readiness(
        circuit_sri_status=SriStatusEnum.DEVELOPED,
        act_number="АКТ-01",
        actual_test_date=date(2026, 5, 20),
        metrics=bad_metrics,
        user=adm_sk,
        force=True,
    )
    assert len(warnings) == 3

    # Clean readiness -> passes with empty warnings
    ok_warnings = validate_circuit_test_readiness(
        circuit_sri_status=SriStatusEnum.APPROVED,
        act_number="АКТ-02",
        actual_test_date=date(2026, 5, 20),
        metrics=ready_metrics,
        user=op_pto,
        force=False,
    )
    assert ok_warnings == []


# ---------------------------------------------------------------------------
# 3. Assign lines conflict (409) & VERIFIED/LOCKED protection via joints PATCH
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_assign_lines_returns_409_conflict_when_joints_in_other_circuit():
    op_pto = _make_user(login="op_pto", role=SystemRoleEnum.OPERATOR, department=DepartmentEnum.PTO)
    fac_id = uuid.uuid4()
    line_id = uuid.uuid4()
    target_circuit = TestCircuit(
        id=uuid.uuid4(),
        facility_id=fac_id,
        name="К-02",
        sri_status=SriStatusEnum.IN_DEVELOPMENT,
        test_status=CircuitTestStatusEnum.NOT_TESTED,
        record_status=RecordStatusEnum.DRAFT,
        version=1,
    )
    other_circuit = TestCircuit(
        id=uuid.uuid4(),
        facility_id=fac_id,
        name="К-01",
        sri_status=SriStatusEnum.APPROVED,
        test_status=CircuitTestStatusEnum.NOT_TESTED,
        record_status=RecordStatusEnum.DRAFT,
        version=1,
    )
    line = ProjectLine(
        id=line_id,
        facility_id=fac_id,
        object_name="КС Портовая",
        rd_code="РД-01",
        line_number="L-100",
        unique_line_id="РД-01::L-100",
    )
    j1 = _make_joint(
        line_id=line_id,
        facility_id=fac_id,
        joint_number="1",
        test_circuit_id=other_circuit.id,
    )

    fake_session = AsyncMock()
    fake_session.execute = AsyncMock(
        side_effect=[
            _FakeResult(scalar=target_circuit),
            _FakeResult(rows=[line]),
            _FakeResult(rows=[j1]),
            _FakeResult(rows=[other_circuit]),
        ]
    )

    with pytest.raises(HTTPException) as exc:
        await assign_lines_to_circuit(
            fake_session,
            target_circuit.id,
            AssignLinesRequest(line_ids=[line_id], overwrite_existing=False),
            user=op_pto,
        )
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "CIRCUIT_ASSIGNMENT_CONFLICT"
    assert len(exc.value.detail["conflicts"]) == 1
    assert exc.value.detail["conflicts"][0]["current_circuit_name"] == "К-01"


@pytest.mark.asyncio
async def test_operator_cannot_detach_joint_from_verified_circuit():
    op_pto = _make_user(login="op_pto", role=SystemRoleEnum.OPERATOR, department=DepartmentEnum.PTO)
    fac_id = uuid.uuid4()
    verified_circuit = TestCircuit(
        id=uuid.uuid4(),
        facility_id=fac_id,
        name="К-01",
        sri_status=SriStatusEnum.APPROVED,
        test_status=CircuitTestStatusEnum.TESTED,
        record_status=RecordStatusEnum.VERIFIED,
        version=2,
    )
    joint = _make_joint(
        line_id=uuid.uuid4(),
        facility_id=fac_id,
        joint_number="5",
        test_circuit_id=verified_circuit.id,
    )

    fake_session = AsyncMock()
    fake_session.execute = AsyncMock(return_value=_FakeResult(scalar=verified_circuit))

    with pytest.raises(HTTPException) as exc:
        await validate_and_sync_joint_circuit_change(
            fake_session,
            joint=joint,  # type: ignore[arg-type]
            new_circuit_id=None,
            user=op_pto,
        )
    assert exc.value.status_code == 403


def test_rbac_permissions_for_test_circuits_and_sk_joint_field():
    assert get_role_permissions(SystemRoleEnum.OPERATOR, DepartmentEnum.PTO).can_manage_test_circuits is True
    assert get_role_permissions(SystemRoleEnum.OPERATOR, DepartmentEnum.SK).can_manage_test_circuits is True
    assert get_role_permissions(SystemRoleEnum.OPERATOR, DepartmentEnum.PIL).can_manage_test_circuits is False
    assert get_role_permissions(SystemRoleEnum.VIEWER, DepartmentEnum.PTO).can_manage_test_circuits is False

    # SK can edit test_circuit_id / contour on joints, but not welding_date or ndt_result
    assert can_edit_joint_field(SystemRoleEnum.OPERATOR, DepartmentEnum.SK, "test_circuit_id") is True
    assert can_edit_joint_field(SystemRoleEnum.OPERATOR, DepartmentEnum.SK, "welding_date") is False
    assert can_edit_joint_field(SystemRoleEnum.OPERATOR, DepartmentEnum.SK, "ndt_result") is False


@pytest.mark.asyncio
async def test_pil_operator_forbidden_to_create_test_circuit():
    op_pil = _make_user(login="op_pil", role=SystemRoleEnum.OPERATOR, department=DepartmentEnum.PIL)
    fake_session = AsyncMock()

    async def _override_db():
        yield fake_session

    app.dependency_overrides[get_db_session] = _override_db
    app.dependency_overrides[get_current_user] = lambda: op_pil
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/test-circuits",
                json={"facility_id": str(uuid.uuid4()), "name": "К-01"},
            )
        assert resp.status_code == 403
    finally:
        app.dependency_overrides.clear()
