from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

import httpx
import pytest
from sqlalchemy import select

from app.api.deps import get_current_user
from app.core.database import async_session_factory
from app.main import app
from app.models.enums import ControlResultEnum, JointKindEnum, JointTypeEnum, NdtMethodEnum, RoleEnum
from app.models.facility import Facility
from app.models.joint import WeldJoint
from app.models.line import ProjectLine
from app.models.user import User


def _make_test_user(role: RoleEnum, username: str = "testuser") -> User:
    return User(
        id=uuid.uuid4(),
        login=username,
        full_name=f"Test {role.value}",
        password_hash="fakehash",
        department="Департамент контроля",
        position_title="Специалист",
        role=role,
        is_active=True,
    )


@pytest.mark.asyncio
async def test_lab_request_crud_and_permissions() -> None:
    """Test full CRUD lifecycle, RBAC enforcement, joint validation, and FSM for NDT lab requests."""
    admin_user = _make_test_user(RoleEnum.ADMIN, f"adm_{uuid.uuid4().hex[:6]}")
    pto_user = _make_test_user(RoleEnum.PTO, f"pto_{uuid.uuid4().hex[:6]}")
    pil_user = _make_test_user(RoleEnum.PIL, f"pil_{uuid.uuid4().hex[:6]}")
    viewer_user = _make_test_user(RoleEnum.VIEWER, f"viw_{uuid.uuid4().hex[:6]}")

    fac_id = uuid.uuid4()
    line_id = uuid.uuid4()
    unique_line_id = f"РД-TEST-{uuid.uuid4().hex[:4]}:101"
    other_line_id = uuid.uuid4()
    other_unique_line_id = f"РД-OTHER-{uuid.uuid4().hex[:4]}:202"

    joint1_id = uuid.uuid4()
    joint2_id = uuid.uuid4()
    foreign_joint_id = uuid.uuid4()

    async with async_session_factory() as s:
        s.add_all([admin_user, pto_user, pil_user, viewer_user])

        # Create facility
        fac_name = f"УКПГ-1С Тестовый {uuid.uuid4().hex[:6]}"
        fac = Facility(
            id=fac_id,
            name=fac_name,
            short_name="УКПГ",
            region="ЯНАО",
        )
        s.add(fac)

        # Create project lines
        line = ProjectLine(
            id=line_id,
            facility_id=fac_id,
            object_name=fac_name,
            rd_code="РД-ТЕСТ-01",
            line_number="101",
            unique_line_id=unique_line_id,
        )
        other_line = ProjectLine(
            id=other_line_id,
            facility_id=fac_id,
            object_name=fac_name,
            rd_code="РД-ДРУГАЯ-02",
            line_number="202",
            unique_line_id=other_unique_line_id,
        )
        s.add_all([line, other_line])

        # Create joints
        j1 = WeldJoint(
            id=joint1_id,
            line_id=line_id,
            object_name=fac_name,
            rd_code="РД-ТЕСТ-01",
            line_number="101",
            unique_line_id=unique_line_id,
            joint_number="С-01",
            joint_kind=JointKindEnum.BUTT,
            joint_type=JointTypeEnum.MOUNTING,
            diameter_mm=219.0,
            wall_thickness=8.0,
            welding_date=date(2026, 11, 14),
            welder_stamp="W01",
            ndt_type=NdtMethodEnum.RK,
            ndt_result=ControlResultEnum.NOT_CONDUCTED,
            vik_result=ControlResultEnum.FIT,
            vik_inspector="Инспектор ВИК",
        )
        j2 = WeldJoint(
            id=joint2_id,
            line_id=line_id,
            object_name=fac_name,
            rd_code="РД-ТЕСТ-01",
            line_number="101",
            unique_line_id=unique_line_id,
            joint_number="С-02",
            joint_kind=JointKindEnum.BUTT,
            joint_type=JointTypeEnum.MOUNTING,
            diameter_mm=219.0,
            wall_thickness=8.0,
            welding_date=date(2026, 11, 14),
            welder_stamp="W01",
            ndt_type=NdtMethodEnum.RK,
            ndt_result=ControlResultEnum.NOT_CONDUCTED,
            vik_result=ControlResultEnum.FIT,
            vik_inspector="Инспектор ВИК",
        )
        j_foreign = WeldJoint(
            id=foreign_joint_id,
            line_id=other_line_id,
            object_name=fac_name,
            rd_code="РД-ДРУГАЯ-02",
            line_number="202",
            unique_line_id=other_unique_line_id,
            joint_number="С-99",
            joint_kind=JointKindEnum.BUTT,
            joint_type=JointTypeEnum.MOUNTING,
            diameter_mm=159.0,
            wall_thickness=6.0,
            welding_date=date(2026, 11, 14),
            welder_stamp="W02",
            ndt_type=NdtMethodEnum.RK,
            ndt_result=ControlResultEnum.NOT_CONDUCTED,
            vik_result=ControlResultEnum.FIT,
            vik_inspector="Инспектор ВИК",
        )
        s.add_all([j1, j2, j_foreign])
        await s.commit()

    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            unique_num = f"ЗНК-TEST-{uuid.uuid4().hex[:6]}"
            payload = {
                "request_number": unique_num,
                "created_date": "2026-11-14",
                "created_by": "Инженер ПТО Тестов",
                "object_name": fac_name,
                "rd_code": "РД-ТЕСТ-01",
                "line_number": "101",
                "unique_line_id": unique_line_id,
                "contour": "Контур А",
                "control_stage": "Первичный ВИК и НК",
                "requested_method": "РК",
                "joint_ids": [str(joint1_id), str(joint2_id)],
                "status": "Выполнена",  # Attempt to force completed status on creation
            }

            # 1. Viewer cannot create a lab request (403)
            app.dependency_overrides[get_current_user] = lambda: viewer_user
            res = await client.post("/api/lab-requests", json=payload)
            assert res.status_code == 403

            # 2. Validation: Non-existent joints rejected (400)
            app.dependency_overrides[get_current_user] = lambda: pto_user
            bad_payload = dict(payload, joint_ids=[str(uuid.uuid4())])
            res_bad = await client.post("/api/lab-requests", json=bad_payload)
            assert res_bad.status_code == 400

            # 3. Validation: Foreign line joints rejected (400)
            bad_line_payload = dict(payload, joint_ids=[str(joint1_id), str(foreign_joint_id)])
            res_foreign = await client.post("/api/lab-requests", json=bad_line_payload)
            assert res_foreign.status_code == 400

            # 4. PTO creates a lab request (201) - status forced to "Подана ПТО"
            res = await client.post("/api/lab-requests", json=payload)
            assert res.status_code == 201, res.text
            created = res.json()
            assert created["request_number"] == unique_num
            assert created["status"] == "Подана ПТО"  # Forced initial status
            assert created["completed_at"] is None
            assert len(created["joint_ids"]) == 2
            req_id = created["id"]
            version = created["version"]

            # 5. Duplicate request_number fails (409)
            res_dup = await client.post("/api/lab-requests", json=payload)
            assert res_dup.status_code == 409

            # 6. Duplicate active request for same joints & method fails (409)
            dup_active_payload = dict(
                payload,
                request_number=f"ЗНК-DUP-{uuid.uuid4().hex[:6]}",
                joint_ids=[str(joint1_id)],
            )
            res_overlap = await client.post("/api/lab-requests", json=dup_active_payload)
            assert res_overlap.status_code == 409

            # 7. Read list of lab requests
            app.dependency_overrides[get_current_user] = lambda: viewer_user
            res_list = await client.get("/api/lab-requests", params={"status": "Подана ПТО"})
            assert res_list.status_code == 200
            data_list = res_list.json()
            assert any(item["id"] == req_id for item in data_list["items"])

            # 8. Read single lab request
            res_single = await client.get(f"/api/lab-requests/{req_id}")
            assert res_single.status_code == 200
            assert res_single.json()["request_number"] == unique_num

            # 9. FSM: Invalid direct transition from "Подана ПТО" to "Выполнена" (400)
            app.dependency_overrides[get_current_user] = lambda: pil_user
            res_invalid_fsm = await client.patch(
                f"/api/lab-requests/{req_id}",
                params={"version": version},
                json={"status": "Выполнена"},
            )
            assert res_invalid_fsm.status_code == 400

            # 10. PTO cannot accept into work (403)
            app.dependency_overrides[get_current_user] = lambda: pto_user
            res_pto_accept = await client.patch(
                f"/api/lab-requests/{req_id}",
                params={"version": version},
                json={"status": "В работе ЛНК"},
            )
            assert res_pto_accept.status_code == 403

            # 11. PIL accepts request into work (PATCH) -> 200
            app.dependency_overrides[get_current_user] = lambda: pil_user
            patch_payload = {
                "status": "В работе ЛНК",
                "accepted_by": "Дефектоскопист Сидоров",
            }
            res_patch = await client.patch(
                f"/api/lab-requests/{req_id}",
                params={"version": version},
                json=patch_payload,
            )
            assert res_patch.status_code == 200
            updated = res_patch.json()
            assert updated["status"] == "В работе ЛНК"
            assert updated["accepted_by"] == "Дефектоскопист Сидоров"
            assert updated["accepted_at"] is not None
            v2 = updated["version"]

            # 12. Cannot complete without confirmed NDT results in DB (400)
            res_premature = await client.patch(
                f"/api/lab-requests/{req_id}",
                params={"version": v2},
                json={"status": "Выполнена"},
            )
            assert res_premature.status_code == 400

            # 13. Update joints in DB to PASSED
            async with async_session_factory() as s:
                j_db1 = (await s.execute(select(WeldJoint).where(WeldJoint.id == joint1_id))).scalar_one()
                j_db2 = (await s.execute(select(WeldJoint).where(WeldJoint.id == joint2_id))).scalar_one()
                j_db1.ndt_result = ControlResultEnum.FIT
                j_db1.ndt_date = date(2026, 11, 15)
                j_db1.ndt_inspector = "Инспектор РК"
                j_db2.ndt_result = ControlResultEnum.FIT
                j_db2.ndt_date = date(2026, 11, 15)
                j_db2.ndt_inspector = "Инспектор РК"
                await s.commit()

            # 14. Now PIL completes request -> 200
            res_complete = await client.patch(
                f"/api/lab-requests/{req_id}",
                params={"version": v2},
                json={"status": "Выполнена"},
            )
            assert res_complete.status_code == 200
            completed_data = res_complete.json()
            assert completed_data["status"] == "Выполнена"
            assert completed_data["completed_at"] is not None
            v3 = completed_data["version"]

            # 15. Optimistic concurrency conflict (stale version 409)
            res_conflict = await client.patch(
                f"/api/lab-requests/{req_id}",
                params={"version": v2},
                json={"notes": "Конфликтная правка"},
            )
            assert res_conflict.status_code == 409

            # 16. Viewer cannot delete request (403)
            app.dependency_overrides[get_current_user] = lambda: viewer_user
            res_del_forbidden = await client.delete(f"/api/lab-requests/{req_id}")
            assert res_del_forbidden.status_code == 403

            # 17. Admin deletes request (204)
            app.dependency_overrides[get_current_user] = lambda: admin_user
            res_del = await client.delete(f"/api/lab-requests/{req_id}")
            assert res_del.status_code == 204

            # 18. Verify 404 after deletion
            res_after = await client.get(f"/api/lab-requests/{req_id}")
            assert res_after.status_code == 404

    finally:
        app.dependency_overrides.clear()
