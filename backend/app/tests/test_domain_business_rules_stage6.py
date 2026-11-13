from __future__ import annotations

import io
import math
import uuid
from datetime import date, datetime, timezone
from typing import Any

import httpx
import pytest
from openpyxl import load_workbook
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.api.deps import get_db_session
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.enums import (
    ControlResultEnum,
    ElementCombinationEnum,
    JointKindEnum,
    JointTypeEnum,
    LrvElementCategoryEnum,
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
from app.models.user import User
from app.models.welding_tech import (
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
    get_epc_wall_thickness_factor,
    inch_string_to_numeric,
    is_second_repair_forbidden,
    mm_to_inch_diameter,
    validate_preheat_temperature,
)
from app.services.readiness_service import (
    calculate_line_ndt_progress,
    calculate_welder_ndt_quotas,
    is_joint_fully_accepted,
)

TEST_DATABASE_URL = "postgresql+asyncpg://zaychick:zaychick_dev_password@127.0.0.1:5432/zaychick_test"

_engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
_session_factory = async_sessionmaker(
    bind=_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def _override_get_db_session():
    async with _session_factory() as session:
        session.info["pending_sse_events"] = []
        try:
            yield session
            if session.is_active and session.in_transaction():
                await session.commit()
            await event_bus.dispatch_pending_session_events(session)
        except Exception:
            event_bus.clear_pending_session_events(session)
            if session.is_active and session.in_transaction():
                await session.rollback()
            raise


@pytest.fixture(autouse=True)
async def clean_test_database():
    app.dependency_overrides[get_db_session] = _override_get_db_session
    async with _session_factory() as session:
        await session.execute(
            text(
                "TRUNCATE TABLE weld_joints, project_lines, lrv_items, "
                "tech_cards, welders, welding_materials, facilities, audit_logs, users CASCADE"
            )
        )
        await session.commit()
    yield
    app.dependency_overrides.clear()


def _auth_headers(user: User) -> dict[str, str]:
    token, _ = create_access_token(
        user_id=user.id,
        login=user.login,
        role=user.role.value,
        session_number=user.session_number,
    )
    return {"Authorization": f"Bearer {token}"}


async def _seed_domain_fixtures(session: AsyncSession) -> dict[str, Any]:
    now = datetime.now(timezone.utc)

    # 1. Users with distinct roles
    pto_user = User(
        id=uuid.uuid4(),
        login="pto_engineer",
        password_hash=hash_password("Pass123!"),
        full_name="Инженер ПТО",
        role=RoleEnum.PTO,
        department="ПТО",
        position_title="Ведущий инженер ПТО",
        session_number=1,
        is_active=True,
        must_change_password=False,
        version=1,
        created_at=now,
        updated_at=now,
    )
    pil_user = User(
        id=uuid.uuid4(),
        login="pil_specialist",
        password_hash=hash_password("Pass123!"),
        full_name="Дефектоскопист ЛНК",
        role=RoleEnum.PIL,
        department="ЛНК",
        position_title="Специалист НК II уровня",
        session_number=1,
        is_active=True,
        must_change_password=False,
        version=1,
        created_at=now,
        updated_at=now,
    )
    ogs_user = User(
        id=uuid.uuid4(),
        login="ogs_technologist",
        password_hash=hash_password("Pass123!"),
        full_name="Главный сварщик (ОГС)",
        role=RoleEnum.OGS,
        department="ОГС",
        position_title="Технолог по сварке",
        session_number=1,
        is_active=True,
        must_change_password=False,
        version=1,
        created_at=now,
        updated_at=now,
    )
    viewer_user = User(
        id=uuid.uuid4(),
        login="customer_rep",
        password_hash=hash_password("Pass123!"),
        full_name="Представитель Газпром",
        role=RoleEnum.VIEWER,
        department="СКК",
        position_title="Инспектор строительного контроля",
        session_number=1,
        is_active=True,
        must_change_password=False,
        version=1,
        created_at=now,
        updated_at=now,
    )
    session.add_all([pto_user, pil_user, ogs_user, viewer_user])

    # 2. Facility & Line
    fac = Facility(
        id=uuid.uuid4(),
        name="КС Русская",
        short_name="КСР",
        region="Краснодарский край",
        version=1,
        created_at=now,
        updated_at=now,
    )
    session.add(fac)

    line = ProjectLine(
        id=uuid.uuid4(),
        facility_id=fac.id,
        object_name=fac.name,
        rd_code="0092.049-045.0077.01",
        line_number="10-101",
        unique_line_id="01-10-101",
        line_name="Узел подключения компрессора",
        product="Газ горючий природный",
        test_contour="К-1",
        welding_ntd="СТО Газпром 15-1.1-002-2023",
        control_ntd="СТО Газпром 15-1.3-004-2023",
        quality_level="B",
        pipeline_category="I",
        working_pressure="9.8",
        working_temperature="40",
        rk_percent=100.0,
        uzk_percent=20.0,
        pvk_percent=0.0,
        sort_order=1,
        version=1,
        created_at=now,
        updated_at=now,
    )
    session.add(line)

    # 3. Welder with NAKS certifications
    welder_id = uuid.uuid4()
    welder = Welder(
        id=welder_id,
        stamp="СВ-01",
        full_name="Иванов Иван Иванович",
        cert_number="АЦСТ-87-01234",
        cert_issue_date=date(2025, 1, 15),
        cert_expiry_date=date(2027, 1, 15),
        admission_sheet_number="ДЛ-01",
        admission_sheet_date=date(2025, 2, 1),
        attestation_area="СТО Газпром (Ø57-426, S=4-20 мм)",
        min_diameter_mm=57.0,
        max_diameter_mm=426.0,
        min_wall_thickness_mm=4.0,
        max_wall_thickness_mm=20.0,
        allowed_methods=["РАД", "РД", "РАД+РД"],
        naks_certs=[
            WelderNaksCert(
                id=uuid.uuid4(),
                welder_id=welder_id,
                cert_number="АЦСТ-87-01234/1",
                welding_type=WeldingTypeEnum.RAD_RD,
                min_diameter_mm=57.0,
                max_diameter_mm=426.0,
                min_wall_thickness_mm=4.0,
                max_wall_thickness_mm=20.0,
            )
        ],
        sort_order=1,
        version=1,
        created_at=now,
        updated_at=now,
    )
    session.add(welder)

    # 4. Tech card with ambient-temperature preheat rules
    tc_id = uuid.uuid4()
    tc = TechCard(
        id=tc_id,
        number="ТК-01",
        title="Технологическая карта сварки газопровода Ø219",
        welding_type=WeldingTypeEnum.RAD_RD,
        joint_kind=JointKindEnum.BUTT,
        element_combination=ElementCombinationEnum.PIPE_PIPE,
        steel_group="09Г2С",
        ntd="СТО Газпром 15-1.1-002-2023",
        min_diameter_mm=100.0,
        max_diameter_mm=325.0,
        min_wall_thickness_mm=6.0,
        max_wall_thickness_mm=16.0,
        preheat_rules=[
            TechCardPreheatRule(
                id=uuid.uuid4(),
                tech_card_id=tc_id,
                ambient_min_c=-40.0,
                ambient_max_c=0.0,
                min_preheat_temp_c=100.0,
                condition_label="≤ 0 °C",
            ),
            TechCardPreheatRule(
                id=uuid.uuid4(),
                tech_card_id=tc_id,
                ambient_min_c=0.1,
                ambient_max_c=45.0,
                min_preheat_temp_c=0.0,
                condition_label="> 0 °C",
            ),
        ],
        sort_order=1,
        version=1,
        created_at=now,
        updated_at=now,
    )
    session.add(tc)

    # 5. Welding Material
    mat = WeldingMaterial(
        id=uuid.uuid4(),
        brand_and_diameter="Св-08Г2С Ø2.0 мм",
        batch_number="П-994",
        certificate_number="СЕРТ-2025/11",
        incoming_control_act="АКТ-ВК-01",
        incoming_control_date=date(2025, 2, 1),
        material_type=WeldingMaterialTypeEnum.WIRE,
        welding_method=WeldingTypeEnum.RAD,
        status=WeldingMaterialStatusEnum.ADMITTED,
        sort_order=1,
        version=1,
        created_at=now,
        updated_at=now,
    )
    session.add(mat)

    # 6. LRV item
    lrv = LrvItem(
        id=uuid.uuid4(),
        facility_id=fac.id,
        lrv_code="ЛРВ-219",
        category=LrvElementCategoryEnum.PIPE,
        short_name="Труба 219х8 09Г2С",
        diameter_mm=219.0,
        wall_thickness=8.0,
        material="09Г2С",
        ntd="ГОСТ 8732-78",
        unit=LrvUnitEnum.METER,
        spec_qty=500.0,
        rd_code=line.rd_code,
        object_name=fac.name,
        status=LrvStatusEnum.ACTIVE,
        sort_order=1,
        version=1,
        created_at=now,
        updated_at=now,
    )
    session.add(lrv)

    await session.commit()
    return {
        "pto": pto_user,
        "pil": pil_user,
        "ogs": ogs_user,
        "viewer": viewer_user,
        "facility": fac,
        "line": line,
        "welder": welder,
        "tc": tc,
        "material": mat,
        "lrv": lrv,
    }


# ==============================================================================
# 1. Pipe and Equivalent Inch Diameter (EDI) Calculations
# ==============================================================================

def test_equivalent_diameter_calculations():
    # 219 mm -> 8", wall 8 mm (K_wall = 1.0 for s <= 10 mm)
    edi_8 = calculate_equivalent_dia_inch(219.0, 8.0)
    assert edi_8 == 8.0

    # 530 mm -> 20", wall 14 mm (K_wall = 1.35 for 10 < s <= 15)
    k_14 = get_epc_wall_thickness_factor(14.0)
    assert k_14 == 1.35
    edi_20 = calculate_equivalent_dia_inch(530.0, 14.0)
    assert edi_20 == round(20.0 * 1.35 * 100) / 100

    # Fraction conversions
    assert inch_string_to_numeric('1 1/4"') == 1.25
    assert inch_string_to_numeric('3/8"') == 0.375
    assert mm_to_inch_diameter(219.0) == '8"'
    assert mm_to_inch_diameter(426.0) == '16"'


# ==============================================================================
# 2. RBAC Field-Level Isolation between PTO, PIL, OGS and Viewer
# ==============================================================================

@pytest.mark.asyncio
async def test_rbac_field_boundaries_pto_cannot_edit_ndt():
    async with _session_factory() as session:
        f = await _seed_domain_fixtures(session)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. PTO creates a joint (Allowed)
        pto_headers = _auth_headers(f["pto"])
        create_payload = {
            "line_id": str(f["line"].id),
            "joint_number": "С-01",
            "diameter_mm": 219.0,
            "wall_thickness": 8.0,
            "welding_date": "2025-02-10",
            "welder_stamp": "СВ-01",
            "tech_card_number": "ТК-01",
            "welding_type": "РАД+РД",
            "joint_kind": "Стыковое",
            "joint_type": "Монтажный",
            "sort_order": 1,
        }
        res_create = await client.post("/api/joints", json=create_payload, headers=pto_headers)
        assert res_create.status_code == 201, res_create.text
        joint_id = res_create.json()["id"]

        # 2. PTO tries to modify NDT result (Forbidden -> 403)
        res_pto_ndt = await client.patch(
            f"/api/joints/{joint_id}",
            json={
                "version": 1,
                "vik_result": "Годен",
                "ndt_result": "Годен",
            },
            headers=pto_headers,
        )
        assert res_pto_ndt.status_code == 403
        assert res_pto_ndt.json()["detail"]["code"] == "FIELD_RBAC_FORBIDDEN"

        # 3. PIL edits NDT result (Allowed -> 200)
        pil_headers = _auth_headers(f["pil"])
        res_pil = await client.patch(
            f"/api/joints/{joint_id}",
            json={
                "version": 1,
                "vik_result": "Годен",
                "vik_date": "2025-02-11",
                "ndt_type": "РК",
                "ndt_result": "Годен",
                "ndt_date": "2025-02-12",
            },
            headers=pil_headers,
        )
        assert res_pil.status_code == 200, res_pil.text
        assert res_pil.json()["vik_result"] == "Годен"

        # 4. PIL tries to modify welding parameters (Forbidden -> 403)
        res_pil_weld = await client.patch(
            f"/api/joints/{joint_id}",
            json={
                "version": 2,
                "welding_date": "2025-02-15",
                "welder_stamp": "СВ-99",
            },
            headers=pil_headers,
        )
        assert res_pil_weld.status_code == 403
        assert res_pil_weld.json()["detail"]["code"] == "FIELD_RBAC_FORBIDDEN"

        # 5. Viewer / Guest tries to patch joint (Forbidden -> 403)
        viewer_headers = _auth_headers(f["viewer"])
        res_viewer = await client.patch(
            f"/api/joints/{joint_id}",
            json={"version": 2, "vik_result": "Годен"},
            headers=viewer_headers,
        )
        assert res_viewer.status_code == 403


# ==============================================================================
# 3. Domain Chronology, NAKS, Tech Card Preheat & Repeat Repair Checks
# ==============================================================================

@pytest.mark.asyncio
async def test_domain_validation_rules_and_repeat_repair_prohibition():
    async with _session_factory() as session:
        f = await _seed_domain_fixtures(session)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        pto_headers = _auth_headers(f["pto"])

        # Rule A: Welding date after NAKS cert expiry (2027-01-15) -> Error
        res_expired = await client.post(
            "/api/joints/validate",
            json={
                "joint": {
                    "line_id": str(f["line"].id),
                    "joint_number": "С-02",
                    "diameter_mm": 219.0,
                    "wall_thickness": 8.0,
                    "welding_date": "2027-06-01",  # AFTER NAKS EXPIRY
                    "welder_stamp": "СВ-01",
                    "tech_card_number": "ТК-01",
                    "welding_type": "РАД+РД",
                    "joint_kind": "Стыковое",
                    "joint_type": "Монтажный",
                }
            },
            headers=pto_headers,
        )
        assert res_expired.status_code == 200
        val_data = res_expired.json()
        assert val_data["is_valid_to_save"] is False
        assert any(e["id"].startswith("chr-naks-expired") for e in val_data["errors"])

        # Rule B: Preheat required at negative temperature: ambient = -10 C, preheat = "н/п" -> Warning
        res_preheat = await client.post(
            "/api/joints/validate",
            json={
                "joint": {
                    "line_id": str(f["line"].id),
                    "joint_number": "С-03",
                    "diameter_mm": 219.0,
                    "wall_thickness": 8.0,
                    "welding_date": "2025-02-10",
                    "ambient_temp": -10.0,
                    "preheat_temp": "н/п",
                    "welder_stamp": "СВ-01",
                    "tech_card_number": "ТК-01",
                    "welding_type": "РАД+РД",
                    "joint_kind": "Стыковое",
                    "joint_type": "Монтажный",
                }
            },
            headers=pto_headers,
        )
        assert res_preheat.status_code == 200
        val_preheat = res_preheat.json()
        assert any(w["id"] == "tech-preheat-mismatch" for w in val_preheat["warnings"])

        # Rule C: Repair sampling length exceeding pi * D / 6 (for D=219, pi*219/6 = 114.6 mm)
        res_rep_len = await client.post(
            "/api/joints/validate",
            json={
                "joint": {
                    "line_id": str(f["line"].id),
                    "joint_number": "С-04",
                    "diameter_mm": 219.0,
                    "wall_thickness": 8.0,
                    "repair_length_mm": 150.0,  # 150 > 114.6 mm
                    "welding_date": "2025-02-10",
                    "welder_stamp": "СВ-01",
                    "tech_card_number": "ТК-01",
                    "welding_type": "РАД+РД",
                    "joint_kind": "Стыковое",
                    "joint_type": "Монтажный",
                }
            },
            headers=pto_headers,
        )
        assert res_rep_len.status_code == 200
        val_rep_len = res_rep_len.json()
        assert any(e["id"] == "ndt-repair-length-limit" for e in val_rep_len["errors"])

        # Rule D: Second repair forbidden (Rule 1 repair: defect after first repair requires "Вырезано")
        res_sec_rep = await client.post(
            "/api/joints/validate",
            json={
                "joint": {
                    "line_id": str(f["line"].id),
                    "joint_number": "С-05",
                    "diameter_mm": 219.0,
                    "wall_thickness": 8.0,
                    "repair_count": 1,
                    "repair_date": "2025-02-12",
                    "repair_vik_result": "Ремонт",  # Defect after repair
                    "repair_action": "Ремонт",      # Attempting second repair
                    "welding_date": "2025-02-10",
                    "welder_stamp": "СВ-01",
                    "tech_card_number": "ТК-01",
                    "welding_type": "РАД+РД",
                    "joint_kind": "Стыковое",
                    "joint_type": "Монтажный",
                }
            },
            headers=pto_headers,
        )
        assert res_sec_rep.status_code == 200
        val_sec = res_sec_rep.json()
        assert any(e["id"] == "ndt-second-repair-forbidden" for e in val_sec["errors"])


# ==============================================================================
# 4. NDT Quota Progress, Penalty Joints and Reports
# ==============================================================================

@pytest.mark.asyncio
async def test_ndt_progress_welder_quotas_and_penalty_calculation():
    async with _session_factory() as session:
        f = await _seed_domain_fixtures(session)
        now = datetime.now(timezone.utc)

        # Create 3 welded joints for welder "СВ-01" on line 01-10-101 (rk_percent=100%, uzk_percent=20%)
        # Joint 1: Inspected RK + UZK FIT
        j1 = WeldJoint(
            id=uuid.uuid4(),
            line_id=f["line"].id,
            facility_id=f["facility"].id,
            unique_line_id=f["line"].unique_line_id,
            rd_code=f["line"].rd_code,
            line_number=f["line"].line_number,
            object_name=f["facility"].name,
            joint_number="1",
            diameter_mm=219.0,
            wall_thickness=8.0,
            welding_date=date(2025, 2, 10),
            welder_stamp="СВ-01",
            welder_full_name="Иванов И.И.",
            vik_result=ControlResultEnum.FIT,
            ndt_type=NdtMethodEnum.RK,
            ndt_result=ControlResultEnum.FIT,
            dup_ndt_type=NdtMethodEnum.UZK,
            dup_ndt_result=ControlResultEnum.FIT,
            sort_order=1,
            version=1,
            created_at=now,
            updated_at=now,
        )
        # Joint 2: Welded, pending NDT
        j2 = WeldJoint(
            id=uuid.uuid4(),
            line_id=f["line"].id,
            facility_id=f["facility"].id,
            unique_line_id=f["line"].unique_line_id,
            rd_code=f["line"].rd_code,
            line_number=f["line"].line_number,
            object_name=f["facility"].name,
            joint_number="2",
            diameter_mm=219.0,
            wall_thickness=8.0,
            welding_date=date(2025, 2, 11),
            welder_stamp="СВ-01",
            welder_full_name="Иванов И.И.",
            vik_result=ControlResultEnum.FIT,
            sort_order=2,
            version=1,
            created_at=now,
            updated_at=now,
        )
        # Joint 3: Defective (REPAIR) -> triggers 2x penalty joint rule
        j3 = WeldJoint(
            id=uuid.uuid4(),
            line_id=f["line"].id,
            facility_id=f["facility"].id,
            unique_line_id=f["line"].unique_line_id,
            rd_code=f["line"].rd_code,
            line_number=f["line"].line_number,
            object_name=f["facility"].name,
            joint_number="3",
            diameter_mm=219.0,
            wall_thickness=8.0,
            welding_date=date(2025, 2, 12),
            welder_stamp="СВ-01",
            welder_full_name="Иванов И.И.",
            vik_result=ControlResultEnum.FIT,
            ndt_type=NdtMethodEnum.RK,
            ndt_result=ControlResultEnum.REPAIR,  # DEFECT!
            sort_order=3,
            version=1,
            created_at=now,
            updated_at=now,
        )
        session.add_all([j1, j2, j3])
        await session.commit()

        # Check line NDT progress: 3 welded, 1 passed RK (33.3%), 1 passed UZK (33.3%)
        # Line requires 100% RK -> RK not fulfilled; requires 20% UZK -> UZK fulfilled
        all_j = [j1, j2, j3]
        line_prog = calculate_line_ndt_progress(all_j, f["line"])
        assert line_prog.welded_joints == 3
        assert line_prog.inspected_rk_count == 1
        assert line_prog.is_rk_fulfilled is False
        assert line_prog.is_uzk_fulfilled is True

        # Check welder quotas & penalty: 1 defect -> 2 penalty joints assigned
        welder_reports = calculate_welder_ndt_quotas(all_j, [f["line"]])
        assert len(welder_reports) == 1
        w_rep = welder_reports[0]
        assert w_rep.stamp == "СВ-01"
        assert w_rep.defect_count == 1
        assert w_rep.penalty_required_joints == 2
        assert w_rep.status == "penalty_required"
        assert "штрафной контроль (+2 стык(ов))" in w_rep.details

    # Test API endpoints for reports
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        viewer_headers = _auth_headers(f["viewer"])

        res_ndt = await client.get("/api/reports/ndt-progress", headers=viewer_headers)
        assert res_ndt.status_code == 200
        ndt_list = res_ndt.json()
        assert len(ndt_list) == 1
        assert ndt_list[0]["unique_line_id"] == "01-10-101"

        res_readiness = await client.get(
            "/api/reports/readiness",
            params={"condition": "uniqueLineId"},
            headers=viewer_headers,
        )
        assert res_readiness.status_code == 200
        readiness_list = res_readiness.json()
        assert len(readiness_list) == 1
        assert readiness_list[0]["total_joints"] == 3


# ==============================================================================
# 5. Regulatory Gazprom Welding Journal Generation & Completeness Export
# ==============================================================================

@pytest.mark.asyncio
async def test_gazprom_welding_journal_export_and_completeness_validation():
    async with _session_factory() as session:
        f = await _seed_domain_fixtures(session)
        now = datetime.now(timezone.utc)

        # Complete joint meeting all Gazprom journal requirements
        full_joint = WeldJoint(
            id=uuid.uuid4(),
            line_id=f["line"].id,
            facility_id=f["facility"].id,
            unique_line_id=f["line"].unique_line_id,
            rd_code=f["line"].rd_code,
            line_number=f["line"].line_number,
            object_name=f["facility"].name,
            joint_number="10",
            diameter_mm=219.0,
            diameter_inch='8"',
            equiv_diameter_inch=8.0,
            wall_thickness=8.0,
            elem1_name="Труба 219х8",
            elem1_material="09Г2С",
            elem1_factory_number="З-1001",
            elem2_name="Труба 219х8",
            elem2_material="09Г2С",
            elem2_factory_number="З-1002",
            welding_date=date(2025, 2, 10),
            ambient_temp_c=15.0,
            preheat_temp="н/п",
            welding_type="РАД+РД",
            tech_card_number="ТК-01",
            welding_materials="Св-08Г2С Ø2.0 мм",
            welder_stamp="СВ-01",
            welder_full_name="Иванов И.И.",
            responsible_person="Прораб Сидоров С.С.",
            vik_report_number="ВИК-101",
            vik_date=date(2025, 2, 11),
            vik_result=ControlResultEnum.FIT,
            ndt_type=NdtMethodEnum.RK,
            ndt_report_number="РК-202",
            ndt_date=date(2025, 2, 12),
            ndt_result=ControlResultEnum.FIT,
            sort_order=10,
            version=1,
            created_at=now,
            updated_at=now,
        )
        session.add(full_joint)
        await session.commit()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        viewer_headers = _auth_headers(f["viewer"])

        # 1. Preview endpoint returns 49-column cells
        res_prev = await client.get(
            "/api/welding-journals",
            params={"standard": "СТО Газпром 15-1.1-002-2023"},
            headers=viewer_headers,
        )
        assert res_prev.status_code == 200
        prev_data = res_prev.json()
        assert prev_data["total"] == 1
        assert len(prev_data["rows"][0]["cells"]) == 49
        assert prev_data["rows"][0]["is_fully_accepted"] is True

        # 2. Strict export succeeds when data is fully complete
        res_strict = await client.get(
            "/api/exports/journal.xlsx",
            params={"standard": "СТО Газпром 15-1.1-002-2023", "strict": "true"},
            headers=viewer_headers,
        )
        assert res_strict.status_code == 200
        wb = load_workbook(io.BytesIO(res_strict.content))
        assert "Журнал СТО Газпром" in wb.sheetnames
        sheet = wb["Журнал СТО Газпром"]
        # Verify title and table presence
        assert "ЖУРНАЛ СВАРОЧНЫХ РАБОТ" in str(sheet.cell(row=1, column=1).value)
        # Row 8 contains data row 1
        assert sheet.cell(row=8, column=1).value == "1"  # No p/p
        assert sheet.cell(row=8, column=13).value == "10"  # Номер стыка
        assert sheet.cell(row=8, column=18).value == "СВ-01"  # Клеймо
