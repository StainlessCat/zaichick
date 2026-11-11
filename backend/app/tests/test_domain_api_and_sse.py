from __future__ import annotations

import asyncio
import json
import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from sqlalchemy.sql.elements import BindParameter, BinaryExpression, BooleanClauseList

from app.api.deps import get_db_session
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.audit import AuditLog
from app.models.enums import (
    ControlResultEnum,
    ElementCombinationEnum,
    JointKindEnum,
    JointTypeEnum,
    LrvStatusEnum,
    LrvUnitEnum,
    NdtMethodEnum,
    RoleEnum,
    WeldingMaterialStatusEnum,
    WeldingMaterialTypeEnum,
    WeldingTypeEnum,
)
from app.models.facility import Facility
from app.models.joint import WeldJoint
from app.models.line import ProjectLine
from app.models.lrv import LrvItem
from app.models.settings import ColumnTemplate
from app.models.user import User
from app.models.welding_tech import (
    Inspector,
    TechCard,
    TechCardPreheatRule,
    Welder,
    WelderNaksCert,
    WeldingMaterial,
)
from app.services.domain_validation import validate_weld_joint_comprehensive
from app.services.event_bus import event_bus
from app.services.pipe_calc import (
    calculate_equivalent_dia_inch,
    is_second_repair_forbidden,
    mm_to_inch_diameter,
    validate_preheat_temperature,
)
from app.services.readiness_service import (
    calculate_line_ndt_progress,
    is_joint_fully_accepted,
)


def _eval_clause(row: Any, clause: Any) -> bool:
    if isinstance(clause, BooleanClauseList):
        op_name = getattr(clause.operator, "__name__", "")
        if "and" in op_name:
            return all(_eval_clause(row, c) for c in clause.clauses)
        if "or" in op_name:
            return any(_eval_clause(row, c) for c in clause.clauses)
        return True

    if isinstance(clause, BinaryExpression):
        col_name = getattr(clause.left, "key", None)
        if col_name is None:
            return True
        row_val = getattr(row, col_name, None)
        if isinstance(clause.right, BindParameter):
            target_val = clause.right.value
        else:
            target_val = getattr(clause.right, "value", clause.right)
        op_name = getattr(clause.operator, "__name__", "")
        if "eq" == op_name:
            return row_val == target_val
        if "ne" == op_name:
            return row_val != target_val
        if "ilike" in op_name:
            needle = str(target_val or "").strip("%").lower()
            return needle in str(row_val or "").lower()
        return True

    return True


class _FakeExecuteResult:
    def __init__(self, *, scalar_one=None, scalars_all=None) -> None:
        self._scalar_one = scalar_one
        self._scalars_all = scalars_all or []

    def scalar_one_or_none(self):
        return self._scalar_one

    def scalar_one(self):
        return self._scalar_one

    def scalars(self):
        return SimpleNamespace(all=lambda: list(self._scalars_all))


class _DomainFakeAsyncSession:
    """In-memory SQLAlchemy-compatible AsyncSession double for Stage 3 domain API tests."""

    def __init__(self) -> None:
        self.stores: dict[type, dict[Any, Any]] = {
            User: {},
            Facility: {},
            ProjectLine: {},
            LrvItem: {},
            Welder: {},
            TechCard: {},
            WeldingMaterial: {},
            Inspector: {},
            WeldJoint: {},
            ColumnTemplate: {},
        }
        self.audit_logs: list[AuditLog] = []
        self.committed = 0

    def add(self, obj: Any) -> None:
        now = datetime.now(timezone.utc)
        if isinstance(obj, AuditLog):
            if obj.id is None:
                obj.id = uuid.uuid4()
            if obj.timestamp is None:
                obj.timestamp = now
            self.audit_logs.append(obj)
            return

        for model_cls, store in self.stores.items():
            if isinstance(obj, model_cls):
                if getattr(obj, "id", None) is None:
                    obj.id = uuid.uuid4()
                if hasattr(obj, "created_at") and getattr(obj, "created_at", None) is None:
                    obj.created_at = now
                if hasattr(obj, "updated_at") and getattr(obj, "updated_at", None) is None:
                    obj.updated_at = now
                store[obj.id] = obj
                return

    async def delete(self, obj: Any) -> None:
        for model_cls, store in self.stores.items():
            if isinstance(obj, model_cls):
                store.pop(obj.id, None)
                return

    async def flush(self) -> None:
        return None

    async def commit(self) -> None:
        self.committed += 1

    async def refresh(self, _obj: Any) -> None:
        return None

    def _model_for_sql(self, sql_text: str) -> type | None:
        table_map = {
            "FROM users": User,
            "FROM facilities": Facility,
            "FROM project_lines": ProjectLine,
            "FROM lrv_items": LrvItem,
            "FROM welders": Welder,
            "FROM tech_cards": TechCard,
            "FROM welding_materials": WeldingMaterial,
            "FROM inspectors": Inspector,
            "FROM weld_joints": WeldJoint,
            "FROM column_templates": ColumnTemplate,
        }
        for marker, cls in table_map.items():
            if marker in sql_text:
                return cls
        return None

    async def execute(self, stmt):
        sql_text = str(stmt)
        if "FROM audit_logs" in sql_text:
            if "count(" in sql_text.lower():
                return _FakeExecuteResult(scalar_one=len(self.audit_logs))
            return _FakeExecuteResult(scalars_all=list(reversed(self.audit_logs)))

        model_cls = self._model_for_sql(sql_text)
        if model_cls is None:
            return _FakeExecuteResult(scalar_one=0)

        rows = list(self.stores[model_cls].values())
        criteria = getattr(stmt, "_where_criteria", ())
        filtered = [r for r in rows if all(_eval_clause(r, c) for c in criteria)]

        if "count(" in sql_text.lower():
            return _FakeExecuteResult(scalar_one=len(filtered))

        return _FakeExecuteResult(
            scalar_one=filtered[0] if filtered else None,
            scalars_all=filtered,
        )


def _make_user(login: str, role: RoleEnum) -> User:
    now = datetime.now(timezone.utc)
    return User(
        id=uuid.uuid4(),
        login=login,
        password_hash=hash_password("Pass123!"),
        full_name=f"Тест {login}",
        role=role,
        department="ПТО",
        position_title=role.value,
        session_number=1,
        is_active=True,
        must_change_password=False,
        version=1,
        created_at=now,
        updated_at=now,
    )


def _auth_header(user: User) -> dict[str, str]:
    token, _ = create_access_token(
        user_id=user.id,
        login=user.login,
        role=user.role.value,
        session_number=user.session_number,
    )
    return {"Authorization": f"Bearer {token}"}


def _seed_domain_data(fake_db: _DomainFakeAsyncSession) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    admin = _make_user("admin", RoleEnum.ADMIN)
    pto = _make_user("pto_ivanov", RoleEnum.PTO)
    pil = _make_user("pil_smirnov", RoleEnum.PIL)
    ogs = _make_user("ogs_kozlov", RoleEnum.OGS)
    viewer = _make_user("viewer_zakaz", RoleEnum.VIEWER)
    for u in (admin, pto, pil, ogs, viewer):
        fake_db.add(u)

    fac = Facility(
        id=uuid.uuid4(),
        name="КС Новосиньковская",
        short_name="КС-Н",
        region="Московская обл.",
        weather_archive={},
        weather_observations={},
        version=1,
        rd_codes=[],
        custom_weather_stations=[],
        created_at=now,
        updated_at=now,
    )
    fake_db.add(fac)

    line = ProjectLine(
        id=uuid.uuid4(),
        facility_id=fac.id,
        object_name=fac.name,
        rd_code="0092.049-045.0077.01",
        line_number="L-101",
        unique_line_id="01-L-101",
        line_name="Трубопровод топливного газа",
        product="Газ природный",
        test_contour="Контур-1",
        welding_ntd="СТО Газпром 15-1.1-002-2023",
        control_ntd="СТО Газпром 15-1.1-002-2023",
        quality_level="A",
        pipeline_category="I",
        working_pressure="5.4",
        working_temperature="-20..+40",
        rk_percent=100.0,
        uzk_percent=0.0,
        pvk_percent=0.0,
        sort_order=1,
        version=1,
        created_at=now,
        updated_at=now,
    )
    fake_db.add(line)

    lrv_pipe = LrvItem(
        id=uuid.uuid4(),
        facility_id=fac.id,
        lrv_code="ЛРВ-001",
        rd_code=line.rd_code,
        object_name=fac.name,
        short_name="Труба 159х6",
        material="09Г2С",
        ntd="ГОСТ 8732-78",
        diameter_mm=159.0,
        wall_thickness=6.0,
        spec_qty=10.0,
        unit=LrvUnitEnum.PCS,
        status=LrvStatusEnum.ACTIVE,
        sort_order=1,
        version=1,
        created_at=now,
        updated_at=now,
    )
    fake_db.add(lrv_pipe)

    welder_valid_id = uuid.uuid4()
    welder_valid = Welder(
        id=welder_valid_id,
        stamp="А12",
        is_brigade=False,
        full_name="Иванов Иван Иванович",
        cert_number="НАКС-2026-01",
        cert_issue_date=date(2025, 1, 10),
        cert_expiry_date=date(2027, 1, 10),
        allowed_methods=["РАД", "РД"],
        crew_foreman="Мастер Петров",
        steel_groups=["M01", "M03"],
        min_diameter_mm=57.0,
        max_diameter_mm=530.0,
        min_wall_thickness_mm=3.0,
        max_wall_thickness_mm=20.0,
        sort_order=1,
        version=1,
        naks_certs=[
            WelderNaksCert(
                id=uuid.uuid4(),
                welder_id=welder_valid_id,
                welding_type=WeldingTypeEnum.RAD,
                cert_number="НАКС-РАД-01",
                issue_date=date(2025, 1, 10),
                expiry_date=date(2027, 1, 10),
                min_diameter_mm=57.0,
                max_diameter_mm=530.0,
                min_wall_thickness_mm=3.0,
                max_wall_thickness_mm=20.0,
                steel_groups=["M01", "M03"],
            )
        ],
        created_at=now,
        updated_at=now,
    )
    fake_db.add(welder_valid)

    welder_expired_id = uuid.uuid4()
    welder_expired = Welder(
        id=welder_expired_id,
        stamp="П99",
        is_brigade=False,
        full_name="Просроченный Петр",
        cert_number="НАКС-OLD-99",
        cert_issue_date=date(2023, 1, 1),
        cert_expiry_date=date(2025, 1, 1),
        allowed_methods=["РД"],
        crew_foreman="Мастер Петров",
        steel_groups=["M01"],
        min_diameter_mm=57.0,
        max_diameter_mm=325.0,
        min_wall_thickness_mm=3.0,
        max_wall_thickness_mm=16.0,
        sort_order=2,
        version=1,
        naks_certs=[],
        created_at=now,
        updated_at=now,
    )
    fake_db.add(welder_expired)

    tc_id = uuid.uuid4()
    tc = TechCard(
        id=tc_id,
        number="ТК-01-РАД",
        title="Сварка трубопроводов из 09Г2С",
        welding_type=WeldingTypeEnum.RAD,
        joint_kind=JointKindEnum.BUTT,
        element_combination=ElementCombinationEnum.PIPE_PIPE,
        ntd="СТО Газпром 15-1.1-002-2023",
        steel_group="M01, M03",
        min_diameter_mm=57.0,
        max_diameter_mm=325.0,
        min_wall_thickness_mm=3.0,
        max_wall_thickness_mm=16.0,
        recommended_materials="ER70S-6",
        sort_order=1,
        version=1,
        preheat_rules=[
            TechCardPreheatRule(
                id=uuid.uuid4(),
                tech_card_id=tc_id,
                ambient_min_c=-45.0,
                ambient_max_c=0.0,
                min_preheat_temp_c=120.0,
                condition_label="При t ≤ 0 °C подогрев не ниже +120 °C",
            )
        ],
        created_at=now,
        updated_at=now,
    )
    fake_db.add(tc)

    mat = WeldingMaterial(
        id=uuid.uuid4(),
        brand_and_diameter="ER70S-6 Ø2.4 мм",
        material_type=WeldingMaterialTypeEnum.WIRE,
        welding_method=WeldingTypeEnum.RAD,
        batch_number="П-555",
        certificate_number="С-777",
        incoming_control_act="АВК-12",
        status=WeldingMaterialStatusEnum.ADMITTED,
        sort_order=1,
        version=1,
        created_at=now,
        updated_at=now,
    )
    fake_db.add(mat)

    return {
        "admin": admin,
        "pto": pto,
        "pil": pil,
        "ogs": ogs,
        "viewer": viewer,
        "facility": fac,
        "line": line,
        "lrv_pipe": lrv_pipe,
        "welder_valid": welder_valid,
        "welder_expired": welder_expired,
        "tech_card": tc,
        "material": mat,
    }


def test_pipe_calc_and_domain_rules_unit() -> None:
    assert mm_to_inch_diameter(159) == '6"'
    assert mm_to_inch_diameter(1020) == '40"'
    assert calculate_equivalent_dia_inch(159, 6.0) == 6.0

    # Preheat validation below zero
    fake_rules = [
        SimpleNamespace(
            ambient_min_c=-40.0,
            ambient_max_c=0.0,
            min_preheat_temp_c=120.0,
            condition_label="При t <= 0°C >= 120°C",
        )
    ]
    bad_preheat = validate_preheat_temperature("н/п", -15.0, "ТК-01-РАД", fake_rules)
    assert bad_preheat.is_valid is False
    ok_preheat = validate_preheat_temperature("140", -15.0, "ТК-01-РАД", fake_rules)
    assert ok_preheat.is_valid is True

    # Rule of 1 repair
    assert is_second_repair_forbidden(SimpleNamespace(repair_count=1, repair_vik_result="Годен")) is False
    assert is_second_repair_forbidden(SimpleNamespace(repair_count=1, repair_ndt_result="Ремонт")) is True
    assert is_second_repair_forbidden(SimpleNamespace(repair_count=2, repair_action="Ремонт")) is True

    # "В работе" must NOT count as conducted/passed NDT progress
    line = SimpleNamespace(unique_line_id="01-L-101", rk_percent=100.0, uzk_percent=0.0)
    in_work_joint = SimpleNamespace(
        unique_line_id="01-L-101",
        welding_date=date(2026, 2, 1),
        welder_stamp="А12",
        vik_result=ControlResultEnum.FIT,
        ndt_type=NdtMethodEnum.RK,
        ndt_result=ControlResultEnum.IN_WORK,
        dup_ndt_type=NdtMethodEnum.NOT_REQUIRED,
        dup_ndt_result=ControlResultEnum.NOT_CONDUCTED,
        repair_ndt_type=None,
        repair_ndt_result=None,
        repair_dup_ndt_type=None,
        repair_dup_ndt_result=None,
        repair_vik_result=None,
        repair_action=None,
    )
    assert is_joint_fully_accepted(in_work_joint) is False
    prog = calculate_line_ndt_progress([in_work_joint], line)
    assert prog.inspected_rk_count == 0
    assert prog.is_rk_fulfilled is False


@pytest.mark.asyncio
async def test_joints_rbac_occ_validation_audit_and_sse() -> None:
    fake_db = _DomainFakeAsyncSession()
    seed = _seed_domain_data(fake_db)
    app.dependency_overrides[get_db_session] = lambda: fake_db

    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            # 1. Unauthenticated & ?token= rejected
            assert (await client.get("/api/joints")).status_code == 401
            assert (await client.get("/api/events/stream")).status_code == 401
            assert (
                await client.get("/api/events/stream?token=hacked")
            ).status_code == 401

            base_joint = {
                "line_id": str(seed["line"].id),
                "joint_number": "1",
                "diameter_mm": 159.0,
                "wall_thickness": 6.0,
                "lrv1_item_id": str(seed["lrv_pipe"].id),
                "lrv1_code": "ЛРВ-001",
                "elem1_name": "Труба 159х6",
                "elem1_material": "09Г2С",
                "lrv2_item_id": str(seed["lrv_pipe"].id),
                "lrv2_code": "ЛРВ-001",
                "elem2_name": "Труба 159х6",
                "elem2_material": "09Г2С",
                "welding_type": "РАД",
                "welding_date": "2026-03-10",
                "welder_stamp": "А12",
                "tech_card_id": str(seed["tech_card"].id),
                "tech_card_number": "ТК-01-РАД",
                "ambient_temp_c": 10.0,
                "preheat_temp": "н/п",
                "responsible_person": "Мастер Петров",
                "welding_materials": "ER70S-6 Ø2.4 мм",
            }

            # 2. Expired NAKS cert blocks creation (422)
            bad_naks = {**base_joint, "joint_number": "1", "welding_type": "РД", "welder_stamp": "П99"}
            res_bad_naks = await client.post(
                "/api/joints", json=bad_naks, headers=_auth_header(seed["pto"])
            )
            assert res_bad_naks.status_code == 422
            err_ids = {e["id"] for e in res_bad_naks.json()["detail"]["errors"]}
            assert any("naks-expired-" in i for i in err_ids)

            # 3. Wrong welding method for valid welder blocks creation (422)
            bad_method = {**base_joint, "joint_number": "1", "welding_type": "АФ"}
            res_bad_method = await client.post(
                "/api/joints", json=bad_method, headers=_auth_header(seed["pto"])
            )
            assert res_bad_method.status_code == 422
            assert any(
                "welder-method-" in e["id"]
                for e in res_bad_method.json()["detail"]["errors"]
            )

            # 4. Negative ambient temp without required preheat returns tech-preheat-mismatch warning on /validate
            bad_preheat = {**base_joint, "joint_number": "1", "ambient_temp_c": -12.0, "preheat_temp": "н/п"}
            res_bad_preheat = await client.post(
                "/api/joints/validate",
                json={"joint": bad_preheat},
                headers=_auth_header(seed["pto"]),
            )
            assert res_bad_preheat.status_code == 200
            assert any(
                w["id"] == "tech-preheat-mismatch"
                for w in res_bad_preheat.json()["warnings"]
            )

            # 5. Valid creation by PTO -> 201 + audit + duplicate guard
            res_j1 = await client.post(
                "/api/joints", json=base_joint, headers=_auth_header(seed["pto"])
            )
            assert res_j1.status_code == 201, res_j1.text
            j1 = res_j1.json()
            assert j1["version"] == 1
            assert j1["diameter_inch"] == '6"'

            res_j2 = await client.post(
                "/api/joints",
                json={**base_joint, "joint_number": "2"},
                headers=_auth_header(seed["pto"]),
            )
            assert res_j2.status_code == 201
            j2 = res_j2.json()

            # Duplicate joint_number on same line -> 409 DUPLICATE_JOINT_NUMBER
            res_dup = await client.post(
                "/api/joints", json=base_joint, headers=_auth_header(seed["pto"])
            )
            assert res_dup.status_code == 409
            assert res_dup.json()["detail"]["code"] == "DUPLICATE_JOINT_NUMBER"

            # 6. Field-level RBAC enforcement
            # PTO tries to change NDT field -> 403
            res_pto_ndt = await client.patch(
                f"/api/joints/{j1['id']}",
                json={"version": 1, "vik_result": "Годен"},
                headers=_auth_header(seed["pto"]),
            )
            assert res_pto_ndt.status_code == 403
            assert res_pto_ndt.json()["detail"]["code"] == "FIELD_RBAC_FORBIDDEN"

            # VIEWER and OGS cannot edit joints
            assert (
                await client.patch(
                    f"/api/joints/{j1['id']}",
                    json={"version": 1, "vik_result": "Годен"},
                    headers=_auth_header(seed["viewer"]),
                )
            ).status_code == 403
            assert (
                await client.patch(
                    f"/api/joints/{j1['id']}",
                    json={"version": 1, "responsible_person": "X"},
                    headers=_auth_header(seed["ogs"]),
                )
            ).status_code == 403

            # PIL tries to alter welding_date -> 403
            res_pil_weld = await client.patch(
                f"/api/joints/{j1['id']}",
                json={"version": 1, "welding_date": "2026-03-11"},
                headers=_auth_header(seed["pil"]),
            )
            assert res_pil_weld.status_code == 403

            # Subscribe an SSE listener queue before PIL update to verify delta emission
            sub_gen = event_bus.subscribe()
            connected_evt = await anext(sub_gen)
            assert connected_evt["event"] == "connected"

            # PIL updates VIK + RK result -> 200 & version becomes 2
            res_pil_ok = await client.patch(
                f"/api/joints/{j1['id']}",
                json={
                    "version": 1,
                    "vik_result": "Годен",
                    "vik_date": "2026-03-11",
                    "vik_report_number": "ВИК-101",
                    "vik_inspector": "Смирнов А.В.",
                    "ndt_type": "РК",
                    "ndt_result": "Ремонт",
                    "ndt_date": "2026-03-12",
                    "ndt_report_number": "РК-101",
                    "ndt_inspector": "Смирнов А.В.",
                },
                headers=_auth_header(seed["pil"]),
            )
            assert res_pil_ok.status_code == 200, res_pil_ok.text
            j1_v2 = res_pil_ok.json()
            assert j1_v2["version"] == 2

            delta_evt = await asyncio.wait_for(anext(sub_gen), timeout=1.0)
            assert delta_evt["event"] == "joint.updated"
            assert delta_evt["entity_id"] == j1["id"]
            assert delta_evt["version"] == 2
            assert delta_evt["updated_by"] == "pil_smirnov"
            await sub_gen.aclose()

            # 7. Row-level OCC conflict (409) + row isolation
            # PTO edits j1 with stale version=1 -> 409 conflict with diffs
            res_occ = await client.patch(
                f"/api/joints/{j1['id']}",
                json={"version": 1, "responsible_person": "Новый Мастер"},
                headers=_auth_header(seed["pto"]),
            )
            assert res_occ.status_code == 409
            conflict = res_occ.json()["detail"]
            assert conflict["code"] == "OPTIMISTIC_LOCK_CONFLICT"
            assert conflict["expected_version"] == 1
            assert conflict["actual_server_version"] == 2
            assert any(d["field"] == "responsible_person" for d in conflict["field_diffs"])

            # Meanwhile PTO CAN update j2 at version=1 without any conflict!
            res_j2_ok = await client.patch(
                f"/api/joints/{j2['id']}",
                json={"version": 1, "responsible_person": "Мастер Сидоров"},
                headers=_auth_header(seed["pto"]),
            )
            assert res_j2_ok.status_code == 200
            assert res_j2_ok.json()["version"] == 2

            # 8. Repair rules: length > pi*D/6 (~83.2 mm for D=159) -> 422; rule of 1 repair -> 422
            res_bad_rep_len = await client.patch(
                f"/api/joints/{j1['id']}",
                json={
                    "version": 2,
                    "repair_action": "Ремонт",
                    "repair_date": "2026-03-13",
                    "repair_tech_card": "ТК-01-РАД",
                    "repair_welder_stamp": "А12",
                    "repair_length_mm": 150.0,
                },
                headers=_auth_header(seed["pto"]),
            )
            assert res_bad_rep_len.status_code == 422
            assert any(
                e["id"] == "ndt-repair-length-limit"
                for e in res_bad_rep_len.json()["detail"]["errors"]
            )

            # Valid repair length passes -> version becomes 3
            res_rep_ok = await client.patch(
                f"/api/joints/{j1['id']}",
                json={
                    "version": 2,
                    "repair_action": "Ремонт",
                    "repair_date": "2026-03-13",
                    "repair_tech_card": "ТК-01-РАД",
                    "repair_welder_stamp": "А12",
                    "repair_length_mm": 40.0,
                },
                headers=_auth_header(seed["pto"]),
            )
            assert res_rep_ok.status_code == 200
            assert res_rep_ok.json()["version"] == 3

            # Rule of 1 repair: post-repair NDT returning Ремонт without Вырезано is blocked (422)
            res_second_rep = await client.patch(
                f"/api/joints/{j1['id']}",
                json={
                    "version": 3,
                    "repair_ndt_type": "РК",
                    "repair_ndt_result": "Ремонт",
                    "repair_ndt_number": "РК-Р1",
                    "repair_ndt_date": "2026-03-14",
                },
                headers=_auth_header(seed["pil"]),
            )
            assert res_second_rep.status_code == 422
            assert any(
                e["id"] == "ndt-second-repair-forbidden"
                for e in res_second_rep.json()["detail"]["errors"]
            )

            # Bulk-update across j1 and j2 atomically bumps versions
            res_bulk = await client.post(
                "/api/joints/bulk-update",
                json={
                    "items": [
                        {"id": j1["id"], "version": 3, "responsible_person": "Мастер Булк"},
                        {"id": j2["id"], "version": 2, "responsible_person": "Мастер Булк"},
                    ]
                },
                headers=_auth_header(seed["pto"]),
            )
            assert res_bulk.status_code == 200
            assert [item["version"] for item in res_bulk.json()] == [4, 3]

            # 9. Line OCC & Referential integrity + LRV supersede
            res_line_upd = await client.patch(
                f"/api/lines/{seed['line'].id}",
                json={"version": 1, "manual_status": "В монтаже"},
                headers=_auth_header(seed["pto"]),
            )
            assert res_line_upd.status_code == 200
            assert res_line_upd.json()["version"] == 2

            res_line_stale = await client.patch(
                f"/api/lines/{seed['line'].id}",
                json={"version": 1, "manual_status": "Другой"},
                headers=_auth_header(seed["pto"]),
            )
            assert res_line_stale.status_code == 409
            assert res_line_stale.json()["detail"]["code"] == "OPTIMISTIC_LOCK_CONFLICT"

            # Deleting referenced line or LRV -> 409 REFERENTIAL_INTEGRITY_ERROR
            res_del_line = await client.delete(
                f"/api/lines/{seed['line'].id}", headers=_auth_header(seed["pto"])
            )
            assert res_del_line.status_code == 409
            assert res_del_line.json()["detail"]["code"] == "REFERENTIAL_INTEGRITY_ERROR"

            res_del_lrv = await client.delete(
                f"/api/lrv/{seed['lrv_pipe'].id}", headers=_auth_header(seed["admin"])
            )
            assert res_del_lrv.status_code == 409

            res_sup = await client.post(
                f"/api/lrv/{seed['lrv_pipe'].id}/supersede",
                json={"version": 1, "replacement_letter": "Письмо РД-45/2026"},
                headers=_auth_header(seed["admin"]),
            )
            assert res_sup.status_code == 200
            assert res_sup.json()["status"] == "superseded"

            # 10. Quotas, Journals & Completeness, Readiness Reports, Audit Log
            res_quotas = await client.get(
                "/api/naks/welders/quotas", headers=_auth_header(seed["viewer"])
            )
            assert res_quotas.status_code == 200
            quotas = res_quotas.json()
            assert len(quotas) == 1
            assert quotas[0]["stamp"] == "А12"
            assert quotas[0]["defect_count"] == 1
            assert quotas[0]["status"] == "penalty_required"

            res_comp = await client.get(
                "/api/welding-journals/completeness",
                headers=_auth_header(seed["viewer"]),
            )
            assert res_comp.status_code == 200
            comp = res_comp.json()
            assert comp["total_joints"] == 2
            assert comp["is_fully_complete"] is False  # j1 has defect without post-repair details

            res_jpreview = await client.get(
                "/api/welding-journals",
                params={"standard": "ГОСТ 32569-2013"},
                headers=_auth_header(seed["viewer"]),
            )
            assert res_jpreview.status_code == 200
            assert res_jpreview.json()["total"] == 2
            assert len(res_jpreview.json()["rows"][0]["cells"]) == 17

            res_readiness = await client.get(
                "/api/reports/readiness",
                headers=_auth_header(seed["viewer"]),
            )
            assert res_readiness.status_code == 200
            assert res_readiness.json()[0]["total_joints"] == 2

            # Audit logs created automatically on server per transaction
            res_audit = await client.get("/api/audit-logs", headers=_auth_header(seed["viewer"]))
            assert res_audit.status_code == 200
            assert res_audit.json()["total"] >= 5

            # Remaining Stage 3 routers smoke & CRUD verification
            assert (await client.get("/api/facilities", headers=_auth_header(seed["viewer"]))).status_code == 200
            assert (await client.get("/api/wps", headers=_auth_header(seed["viewer"]))).status_code == 200
            assert (await client.get("/api/naks/welders", headers=_auth_header(seed["viewer"]))).status_code == 200
            assert (await client.get("/api/naks/materials", headers=_auth_header(seed["viewer"]))).status_code == 200
            assert (await client.get("/api/naks/inspectors", headers=_auth_header(seed["viewer"]))).status_code == 200
            assert (await client.get("/api/reports/ndt-progress", headers=_auth_header(seed["viewer"]))).status_code == 200
            assert (await client.get("/api/templates", headers=_auth_header(seed["viewer"]))).status_code == 200

            # Authenticated SSE stream receives pinpoint delta frame
            async def _push_delayed_delta() -> None:
                await asyncio.sleep(0.05)
                await event_bus.emit_delta(
                    None,
                    event="joint.updated",
                    entity_type="weld_joint",
                    entity_id=j1["id"],
                    version=99,
                    updated_by="admin",
                    data={"id": j1["id"]},
                )

            pusher = asyncio.create_task(_push_delayed_delta())
            async with client.stream(
                "GET",
                "/api/events/stream?once=true",
                headers=_auth_header(seed["viewer"]),
            ) as sse_resp:
                assert sse_resp.status_code == 200
                body = (await sse_resp.aread()).decode("utf-8")
                assert "event: connected" in body
                assert "event: joint.updated" in body
                assert '"version": 99' in body
            await pusher
    finally:
        app.dependency_overrides.clear()
