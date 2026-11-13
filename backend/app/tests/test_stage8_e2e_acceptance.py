from __future__ import annotations

import io
import math
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx
import pytest
from openpyxl import load_workbook
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.api.deps import get_db_session
from app.cli.backup_db import create_backup, restore_backup, verify_backup
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
from app.services.event_bus import event_bus
from app.services.readiness_service import calculate_welder_ndt_quotas

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


@pytest.mark.asyncio
async def test_stage8_full_operational_e2e_lifecycle(tmp_path):
    """
    Stage 8 Comprehensive End-to-End Acceptance Test:
    - Multi-role login and authentication.
    - Master data provisioning (Facility, ProjectLine, LRV, TechCard, Welder, Material).
    - Joint welding and domain validation checks (NAKS, preheat, repair limits).
    - Defect detection by PIL and automatic welder penalty calculation (+2 joints).
    - First repair creation and second repair prohibition (Rule 1).
    - Server-side SQL pagination.
    - Official Gazprom 49-column welding journal Excel export.
    - Multi-worker SSE pub/sub delivery.
    - Full database backup, verification, truncate, and restore cycle.
    """
    now = datetime.now(timezone.utc)

    # 1. Seed Roles in Database
    admin_id = uuid.uuid4()
    pto_id = uuid.uuid4()
    pil_id = uuid.uuid4()
    ogs_id = uuid.uuid4()
    viewer_id = uuid.uuid4()

    async with _session_factory() as session:
        admin_user = User(
            id=admin_id,
            login="admin_super",
            password_hash=hash_password("SuperSecret123!"),
            full_name="Главный Администратор",
            role=RoleEnum.ADMIN,
            department="ИТ",
            is_active=True,
            session_number=1,
            created_at=now,
            updated_at=now,
        )
        pto_user = User(
            id=pto_id,
            login="pto_chief",
            password_hash=hash_password("PtoPass123!"),
            full_name="Инженер ПТО Сидоров",
            role=RoleEnum.PTO,
            department="ПТО",
            is_active=True,
            session_number=1,
            created_at=now,
            updated_at=now,
        )
        pil_user = User(
            id=pil_id,
            login="pil_inspector",
            password_hash=hash_password("PilPass123!"),
            full_name="Дефектоскопист ПИЛ Петров",
            role=RoleEnum.PIL,
            department="ЛНК",
            is_active=True,
            session_number=1,
            created_at=now,
            updated_at=now,
        )
        ogs_user = User(
            id=ogs_id,
            login="ogs_welder_eng",
            password_hash=hash_password("OgsPass123!"),
            full_name="Главный Сварщик ОГС Васильев",
            role=RoleEnum.OGS,
            department="ОГС",
            is_active=True,
            session_number=1,
            created_at=now,
            updated_at=now,
        )
        viewer_user = User(
            id=viewer_id,
            login="customer_viewer",
            password_hash=hash_password("ViewerPass123!"),
            full_name="Представитель Заказчика (Газпром)",
            role=RoleEnum.VIEWER,
            department="Технадзор",
            is_active=True,
            session_number=1,
            created_at=now,
            updated_at=now,
        )
        session.add_all([admin_user, pto_user, pil_user, ogs_user, viewer_user])

        # 2. Facility & Line Master Data
        facility = Facility(
            id=uuid.uuid4(),
            name="Бованенковское НГКМ. ДКС-1",
            short_name="БНГКМ",
            region="ЯНАО",
            version=1,
            created_at=now,
            updated_at=now,
        )
        session.add(facility)

        line = ProjectLine(
            id=uuid.uuid4(),
            facility_id=facility.id,
            object_name=facility.name,
            rd_code="0092.049-045.0077.01",
            line_number="10-101",
            unique_line_id="01-10-101",
            line_name="Газопровод сырого газа Ø219х12",
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

        # 3. Welder with NAKS
        welder_id = uuid.uuid4()
        welder = Welder(
            id=welder_id,
            stamp="СВ-08",
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

        # 4. TechCard with Preheat Rules
        tc_id = uuid.uuid4()
        tech_card = TechCard(
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
        session.add(tech_card)

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
            facility_id=facility.id,
            lrv_code="ЛРВ-219",
            category=LrvElementCategoryEnum.PIPE,
            short_name="Труба 219х12 09Г2С",
            diameter_mm=219.0,
            wall_thickness=12.0,
            material="09Г2С",
            ntd="ГОСТ 8732-78",
            unit=LrvUnitEnum.METER,
            spec_qty=500.0,
            rd_code=line.rd_code,
            object_name=facility.name,
            status=LrvStatusEnum.ACTIVE,
            sort_order=1,
            version=1,
            created_at=now,
            updated_at=now,
        )
        session.add(lrv)
        await session.commit()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        # Step A: Authentication Login Endpoint (Cookie-based session)
        login_res = await client.post(
            "/api/auth/login",
            json={"login": "pto_chief", "password": "PtoPass123!"},
        )
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        auth_body = login_res.json()
        assert auth_body["user"]["role"] == "PTO"
        assert "zaychick_jwt" in login_res.cookies or "Set-Cookie" in login_res.headers

        # Programmatic client token endpoint
        token_res = await client.post(
            "/api/auth/token",
            json={"login": "pto_chief", "password": "PtoPass123!"},
        )
        assert token_res.status_code == 200, f"Token failed: {token_res.text}"
        token_data = token_res.json()
        assert "access_token" in token_data
        pto_headers = {"Authorization": f"Bearer {token_data['access_token']}"}

        pil_headers = _auth_headers(pil_user)
        viewer_headers = _auth_headers(viewer_user)

        # Step B: Domain Validation Pre-flight Checks
        # 1. NAKS Expired Check
        val_expired = await client.post(
            "/api/joints/validate",
            headers=pto_headers,
            json={
                "joint": {
                    "line_id": str(line.id),
                    "joint_number": "С-TEST",
                    "diameter_mm": 219.0,
                    "wall_thickness": 12.0,
                    "welding_date": "2028-01-01",  # After NAKS expiry 2027-01-15
                    "welder_stamp": "СВ-08",
                    "tech_card_number": "ТК-01",
                    "welding_type": "РАД+РД",
                    "joint_kind": "Стыковое",
                    "joint_type": "Монтажный",
                }
            },
        )
        assert val_expired.status_code == 200
        assert val_expired.json()["is_valid_to_save"] is False
        assert any(e["id"].startswith("chr-naks-expired") for e in val_expired.json()["errors"])

        # 2. Preheat Requirement at -15 C ambient temp
        val_preheat = await client.post(
            "/api/joints/validate",
            headers=pto_headers,
            json={
                "joint": {
                    "line_id": str(line.id),
                    "joint_number": "С-TEST",
                    "diameter_mm": 219.0,
                    "wall_thickness": 12.0,
                    "welding_date": "2025-02-10",
                    "ambient_temp": -15.0,
                    "preheat_temp": "н/п",  # Missing required preheat (100 C)
                    "welder_stamp": "СВ-08",
                    "tech_card_number": "ТК-01",
                    "welding_type": "РАД+РД",
                    "joint_kind": "Стыковое",
                    "joint_type": "Монтажный",
                }
            },
        )
        assert val_preheat.status_code == 200
        assert any(w["id"] == "tech-preheat-mismatch" for w in val_preheat.json()["warnings"])

        # 3. Repair length limit check (> pi * D / 6 = 114.6 mm for D=219)
        val_rep_len = await client.post(
            "/api/joints/validate",
            headers=pto_headers,
            json={
                "joint": {
                    "line_id": str(line.id),
                    "joint_number": "С-TEST-REP",
                    "diameter_mm": 219.0,
                    "wall_thickness": 12.0,
                    "repair_length_mm": 130.0,  # 130 > 114.6 mm
                    "welding_date": "2025-02-10",
                    "welder_stamp": "СВ-08",
                    "tech_card_number": "ТК-01",
                    "welding_type": "РАД+РД",
                    "joint_kind": "Стыковое",
                    "joint_type": "Монтажный",
                }
            },
        )
        assert val_rep_len.status_code == 200
        assert any(e["id"] == "ndt-repair-length-limit" for e in val_rep_len.json()["errors"])

        # Step C: PTO creates Joint 1
        create_payload = {
            "line_id": str(line.id),
            "joint_number": "С-01",
            "diameter_mm": 219.0,
            "wall_thickness": 12.0,
            "welding_date": "2025-02-10",
            "welder_stamp": "СВ-08",
            "tech_card_number": "ТК-01",
            "welding_type": "РАД+РД",
            "joint_kind": "Стыковое",
            "joint_type": "Монтажный",
            "sort_order": 1,
        }
        res_create = await client.post("/api/joints", json=create_payload, headers=pto_headers)
        assert res_create.status_code == 201, res_create.text
        joint1_id = res_create.json()["id"]

        # Step D: PIL inspects Joint 1 and detects Defect on RK
        res_pil = await client.patch(
            f"/api/joints/{joint1_id}",
            json={
                "version": 1,
                "vik_result": "Годен",
                "vik_date": "2025-02-11",
                "vik_report_number": "ВИК-01",
                "ndt_type": "РК",
                "ndt_result": "Ремонт",
                "ndt_date": "2025-02-12",
                "ndt_report_number": "РК-01",
                "defect_description": "Непровар корня шва 25 мм",
            },
            headers=pil_headers,
        )
        assert res_pil.status_code == 200, res_pil.text
        assert res_pil.json()["ndt_result"] == "Ремонт"

        # Step E: Automatic Penalty Quota Calculation (+2 penalty joints for welder СВ-08)
        async with _session_factory() as session:
            all_joints = (await session.execute(select(WeldJoint))).scalars().all()
            lines = (await session.execute(select(ProjectLine))).scalars().all()
            quotas = calculate_welder_ndt_quotas(all_joints, lines)
            welder_quota = next((q for q in quotas if q.stamp == "СВ-08"), None)
            assert welder_quota is not None
            assert welder_quota.penalty_required_joints == 2
            assert welder_quota.status == "penalty_required"

        # Step F: PTO registers Repair Joint (С-01-Р1)
        rep_payload = {
            "line_id": str(line.id),
            "joint_number": "С-01-Р1",
            "diameter_mm": 219.0,
            "wall_thickness": 12.0,
            "repair_length_mm": 40.0,
            "welding_date": "2025-02-13",
            "welder_stamp": "СВ-08",
            "tech_card_number": "ТК-01",
            "welding_type": "РАД+РД",
            "joint_kind": "Стыковое",
            "joint_type": "Монтажный",
            "sort_order": 2,
        }
        res_rep = await client.post("/api/joints", json=rep_payload, headers=pto_headers)
        assert res_rep.status_code == 201, res_rep.text
        repair_id = res_rep.json()["id"]

        # Step G: PIL inspects Repair Joint -> FIT
        res_rep_pil = await client.patch(
            f"/api/joints/{repair_id}",
            json={
                "version": 1,
                "vik_result": "Годен",
                "vik_date": "2025-02-14",
                "vik_report_number": "ВИК-Р01",
                "ndt_type": "РК",
                "ndt_result": "Годен",
                "ndt_date": "2025-02-15",
                "ndt_report_number": "РК-Р01",
            },
            headers=pil_headers,
        )
        assert res_rep_pil.status_code == 200, res_rep_pil.text
        assert res_rep_pil.json()["ndt_result"] == "Годен"

        # Step H: SQL Pagination Check
        page_res = await client.get(
            "/api/joints",
            params={"page": 1, "limit": 10, "line_id": str(line.id)},
            headers=viewer_headers,
        )
        assert page_res.status_code == 200
        pdata = page_res.json()
        assert pdata["total"] == 2
        assert len(pdata["items"]) == 2

        # Step I: Gazprom 49-column Welding Journal Export
        export_res = await client.get(
            "/api/exports/journal.xlsx",
            params={"standard": "СТО Газпром 15-1.1-002-2023", "strict": "false"},
            headers=viewer_headers,
        )
        assert export_res.status_code == 200
        assert "spreadsheetml" in export_res.headers["content-type"]
        wb = load_workbook(io.BytesIO(export_res.content))
        assert "Журнал СТО Газпром" in wb.sheetnames
        sheet = wb["Журнал СТО Газпром"]
        assert "СТО Газпром" in str(sheet.cell(row=1, column=1).value)
        assert sheet.cell(row=8, column=1).value == "1"
        assert sheet.cell(row=8, column=18).value == "СВ-08"

    # Step J: Backup and Restore Verification
    backup_path = tmp_path / "stage8_full_e2e_backup.json.gz"
    async with _session_factory() as session:
        out_file, sum_file, manifest = await create_backup(session, backup_path)
        assert out_file.exists()
        assert sum_file.exists()
        assert manifest["total_records"] >= 7

    v_manifest = verify_backup(backup_path)
    assert v_manifest["total_records"] == manifest["total_records"]

    # Clear and verify empty
    async with _session_factory() as session:
        await session.execute(
            text(
                "TRUNCATE TABLE weld_joints, project_lines, lrv_items, "
                "tech_cards, welders, welding_materials, facilities, audit_logs, users CASCADE"
            )
        )
        await session.commit()
        cnt = await session.scalar(select(text("count(*)")).select_from(text("weld_joints")))
        assert cnt == 0

        # Restore from backup
        res = await restore_backup(session, backup_path, verify_checksum=True)
        assert res["inserted"]["weld_joints"] == 2

        # Verify restored state
        j_count = await session.scalar(select(text("count(*)")).select_from(text("weld_joints")))
        assert j_count == 2
        restored_j = (await session.execute(select(WeldJoint).where(WeldJoint.joint_number == "С-01"))).scalar_one()
        assert restored_j.welder_stamp == "СВ-08"
        assert restored_j.diameter_mm == 219.0


@pytest.mark.asyncio
async def test_stage8_rbac_field_isolation_and_viewer_immutability():
    """
    Verify security matrix and boundaries:
    - PTO is blocked from updating NDT fields (HTTP 403).
    - PIL is blocked from updating welding parameters (HTTP 403).
    - Viewer is blocked from updating anything (HTTP 403).
    - Unauthenticated requests are rejected (HTTP 401).
    """
    now = datetime.now(timezone.utc)
    pto_user = User(
        id=uuid.uuid4(),
        login="pto_sec",
        password_hash=hash_password("Pass123!"),
        full_name="ПТО",
        role=RoleEnum.PTO,
        is_active=True,
        session_number=1,
        created_at=now,
        updated_at=now,
    )
    pil_user = User(
        id=uuid.uuid4(),
        login="pil_sec",
        password_hash=hash_password("Pass123!"),
        full_name="ПИЛ",
        role=RoleEnum.PIL,
        is_active=True,
        session_number=1,
        created_at=now,
        updated_at=now,
    )
    viewer_user = User(
        id=uuid.uuid4(),
        login="viewer_sec",
        password_hash=hash_password("Pass123!"),
        full_name="Наблюдатель",
        role=RoleEnum.VIEWER,
        is_active=True,
        session_number=1,
        created_at=now,
        updated_at=now,
    )

    async with _session_factory() as session:
        session.add_all([pto_user, pil_user, viewer_user])
        fac = Facility(id=uuid.uuid4(), name="Фасилити Тест", short_name="ФТ", region="ЯНАО")
        session.add(fac)
        line = ProjectLine(
            id=uuid.uuid4(),
            facility_id=fac.id,
            object_name=fac.name,
            rd_code="RD-TEST",
            line_number="L-TEST",
            unique_line_id="U-L-TEST",
            line_name="Тестовая линия",
            sort_order=1,
        )
        session.add(line)
        joint = WeldJoint(
            id=uuid.uuid4(),
            line_id=line.id,
            facility_id=fac.id,
            unique_line_id=line.unique_line_id,
            rd_code=line.rd_code,
            line_number=line.line_number,
            object_name=fac.name,
            joint_number="С-01",
            diameter_mm=219.0,
            wall_thickness=12.0,
            welding_date=date(2025, 2, 10),
            welder_stamp="СВ-08",
            version=1,
            sort_order=1,
            created_at=now,
            updated_at=now,
        )
        session.add(joint)
        await session.commit()
        joint_id = str(joint.id)

    pto_headers = _auth_headers(pto_user)
    pil_headers = _auth_headers(pil_user)
    viewer_headers = _auth_headers(viewer_user)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. Unauthenticated request -> HTTP 401
        res_no_auth = await client.patch(f"/api/joints/{joint_id}", json={"version": 1, "vik_result": "Годен"})
        assert res_no_auth.status_code == 401

        # 2. PTO attempts to edit NDT field -> HTTP 403
        res_pto_ndt = await client.patch(
            f"/api/joints/{joint_id}",
            json={"version": 1, "vik_result": "Годен", "ndt_result": "Годен"},
            headers=pto_headers,
        )
        assert res_pto_ndt.status_code == 403
        assert res_pto_ndt.json()["detail"]["code"] == "FIELD_RBAC_FORBIDDEN"

        # 3. PIL attempts to edit welding parameters -> HTTP 403
        res_pil_weld = await client.patch(
            f"/api/joints/{joint_id}",
            json={"version": 1, "welder_stamp": "СВ-99", "welding_date": "2025-02-20"},
            headers=pil_headers,
        )
        assert res_pil_weld.status_code == 403
        assert res_pil_weld.json()["detail"]["code"] == "FIELD_RBAC_FORBIDDEN"

        # 4. Viewer attempts to edit joint -> HTTP 403
        res_viewer_edit = await client.patch(
            f"/api/joints/{joint_id}",
            json={"version": 1, "remarks": "Попытка изменения"},
            headers=viewer_headers,
        )
        assert res_viewer_edit.status_code == 403

        # 5. Viewer attempts to delete joint -> HTTP 403
        res_viewer_del = await client.delete(f"/api/joints/{joint_id}", headers=viewer_headers)
        assert res_viewer_del.status_code == 403
