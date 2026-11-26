from __future__ import annotations

import uuid
from datetime import date

import httpx
import pytest

from app.api.deps import get_current_user
from app.core.database import async_session_factory, engine
from app.main import app
from app.models.enums import (
    ControlResultEnum,
    DepartmentEnum,
    JointKindEnum,
    JointTypeEnum,
    NdtMethodEnum,
    SystemRoleEnum,
)
from app.models.facility import Facility
from app.models.joint import WeldJoint
from app.models.line import ProjectLine
from app.models.user import User
from app.services.lab_conclusions import (
    check_joint_methods_completed,
    normalize_requested_methods,
    sync_lab_conclusions_to_joint_patch,
)


def _make_user(role: SystemRoleEnum, dept: DepartmentEnum, prefix: str) -> User:
    return User(
        id=uuid.uuid4(),
        login=f"{prefix}_{uuid.uuid4().hex[:6]}",
        full_name=f"Test {prefix}",
        password_hash="fakehash",
        department=dept,
        position_title="Инженер",
        role=role,
        is_active=True,
    )


def test_normalize_requested_methods_and_priority_sync() -> None:
    methods, combined = normalize_requested_methods(["УЗК", "ВИК", "рк", "uzk"], None)
    assert methods == ["ВИК", "РК", "УЗК"]
    assert combined == "ВИК+РК+УЗК"

    patch = {
        "lab_conclusions": {
            "ВИК": {
                "reportNumber": "ВИК-001-Л1-Д-21-010",
                "date": "2026-11-26",
                "result": "Годен",
                "inspector": "Иванов И.И.",
                "stage": "primary",
            },
            "РК": {
                "reportNumber": "РК-001-Л1-Д-21-010",
                "date": "2026-11-26",
                "result": "Годен",
                "inspector": "Петров П.П.",
                "stage": "primary",
            },
            "УЗК": {
                "reportNumber": "УЗК-001-Л1-Д-21-010",
                "date": "2026-11-26",
                "result": "Ремонт",
                "inspector": "Сидоров С.С.",
                "stage": "primary",
            },
        }
    }
    sync_lab_conclusions_to_joint_patch(patch)

    assert patch["vik_result"] == ControlResultEnum.FIT
    assert patch["vik_report_number"] == "ВИК-001-Л1-Д-21-010"
    assert patch["vik_date"] == date(2026, 11, 26)
    # Приоритет статусов: «Ремонт» важнее «Годен» -> агрегат берёт УЗК
    assert patch["ndt_type"] == NdtMethodEnum.UZK
    assert patch["ndt_result"] == ControlResultEnum.REPAIR
    assert patch["ndt_report_number"] == "УЗК-001-Л1-Д-21-010"


def test_check_joint_methods_completed() -> None:
    class DummyJoint:
        vik_result = ControlResultEnum.FIT
        ndt_result = ControlResultEnum.NOT_CONDUCTED
        lab_conclusions = {
            "ВИК": {"result": "Годен"},
            "РК": {"result": "Годен"},
            "УЗК": {"result": "Не проводился"},
        }

    missing = check_joint_methods_completed(DummyJoint(), ["ВИК", "РК", "УЗК"])
    assert missing == ["нет УЗК"]

    DummyJoint.lab_conclusions["УЗК"] = {"result": "Годен"}
    assert check_joint_methods_completed(DummyJoint(), ["ВИК", "РК", "УЗК"]) == []


@pytest.mark.asyncio
async def test_batch_lab_request_and_conclusions_api() -> None:
    pto_user = _make_user(SystemRoleEnum.OPERATOR, DepartmentEnum.PTO, "pto_b")
    pil_user = _make_user(SystemRoleEnum.OPERATOR, DepartmentEnum.PIL, "pil_b")

    fac_id = uuid.uuid4()
    line_id = uuid.uuid4()
    joint_id = uuid.uuid4()
    fac_name = f"Объект ЛНК Тест {uuid.uuid4().hex[:6]}"
    unique_line_id = f"РД-ЛНК-{uuid.uuid4().hex[:4]}:Л1"

    async with async_session_factory() as s:
        s.add_all([pto_user, pil_user])
        s.add(Facility(id=fac_id, name=fac_name, short_name="ЛНК", region="ЯНАО"))
        s.add(
            ProjectLine(
                id=line_id,
                facility_id=fac_id,
                object_name=fac_name,
                rd_code="0092.001-TX3",
                line_number="Л1",
                unique_line_id=unique_line_id,
            )
        )
        s.add(
            WeldJoint(
                id=joint_id,
                line_id=line_id,
                facility_id=fac_id,
                object_name=fac_name,
                rd_code="0092.001-TX3",
                line_number="Л1",
                unique_line_id=unique_line_id,
                joint_number="010",
                joint_kind=JointKindEnum.BUTT,
                joint_type=JointTypeEnum.MOUNTING,
                diameter_mm=720.0,
                wall_thickness=10.0,
                welding_type="РАД+РД",
                welding_date=date(2026, 11, 20),
                welder_stamp="W01",
                ndt_type=NdtMethodEnum.RK,
                ndt_result=ControlResultEnum.NOT_CONDUCTED,
                vik_result=ControlResultEnum.NOT_CONDUCTED,
            )
        )
        await s.commit()

    current_actor = {"user": pto_user}
    app.dependency_overrides[get_current_user] = lambda: current_actor["user"]

    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. ПТО создаёт единую пакетную заявку на ВИК + РК + УЗК
            req_num = f"ЗНК-ПАК-{uuid.uuid4().hex[:6]}"
            resp = await client.post(
                "/api/lab-requests",
                json={
                    "request_number": req_num,
                    "created_date": "2026-11-26",
                    "created_by": "Инженер ПТО",
                    "object_name": fac_name,
                    "rd_code": "0092.001-TX3",
                    "line_number": "Л1",
                    "unique_line_id": unique_line_id,
                    "contour": "КИ-1",
                    "control_stage": "Первичный ВИК и НК",
                    "requested_methods": ["ВИК", "РК", "УЗК"],
                    "joint_ids": [str(joint_id)],
                },
            )
            assert resp.status_code == 201, resp.text
            created_req = resp.json()
            assert created_req["requested_methods"] == ["ВИК", "РК", "УЗК"]
            assert created_req["requested_method"] == "ВИК+РК+УЗК"
            req_id = created_req["id"]
            req_ver = created_req["version"]

            # 2. Защита от пересечения методов: новая заявка на УЗК+ПВК по тому же стыку -> 409
            resp_dup = await client.post(
                "/api/lab-requests",
                json={
                    "request_number": f"ЗНК-ДУБ-{uuid.uuid4().hex[:6]}",
                    "created_date": "2026-11-26",
                    "created_by": "Инженер ПТО",
                    "object_name": fac_name,
                    "rd_code": "0092.001-TX3",
                    "line_number": "Л1",
                    "unique_line_id": unique_line_id,
                    "contour": "КИ-1",
                    "control_stage": "Первичный ВИК и НК",
                    "requested_methods": ["УЗК", "ПВК"],
                    "joint_ids": [str(joint_id)],
                },
            )
            assert resp_dup.status_code == 409

            # 3. ПТО не может редактировать lab_conclusions (RBAC 403)
            resp_pto_edit = await client.patch(
                f"/api/joints/{joint_id}",
                json={
                    "version": 1,
                    "lab_conclusions": {
                        "ВИК": {"reportNumber": "ВИК-1", "result": "Годен", "date": "2026-11-26", "inspector": "А"}
                    },
                },
            )
            assert resp_pto_edit.status_code == 403

            # 4. ПИЛ принимает заявку в работу
            current_actor["user"] = pil_user
            resp_accept = await client.patch(
                f"/api/lab-requests/{req_id}?version={req_ver}",
                json={"status": "В работе ЛНК"},
            )
            assert resp_accept.status_code == 200
            req_ver = resp_accept.json()["version"]

            # 5. Попытка закрыть пакетную заявку без УЗК -> 400
            resp_j_partial = await client.patch(
                f"/api/joints/{joint_id}",
                json={
                    "version": 1,
                    "lab_conclusions": {
                        "ВИК": {"reportNumber": "ВИК-001-TX3-Л1-Д-21-010", "result": "Годен", "date": "2026-11-26", "inspector": "Лаб"},
                        "РК": {"reportNumber": "РК-001-TX3-Л1-Д-21-010", "result": "Годен", "date": "2026-11-26", "inspector": "Лаб"},
                    },
                },
            )
            assert resp_j_partial.status_code == 200, resp_j_partial.text
            j_ver = resp_j_partial.json()["version"]

            resp_complete_fail = await client.patch(
                f"/api/lab-requests/{req_id}?version={req_ver}",
                json={"status": "Выполнена"},
            )
            assert resp_complete_fail.status_code == 400
            assert "нет УЗК" in resp_complete_fail.text

            # 6. ПИЛ дозаполняет УЗК -> теперь заявка закрывается успешно
            resp_j_full = await client.patch(
                f"/api/joints/{joint_id}",
                json={
                    "version": j_ver,
                    "lab_conclusions": {
                        "ВИК": {"reportNumber": "ВИК-001-TX3-Л1-Д-21-010", "result": "Годен", "date": "2026-11-26", "inspector": "Лаб"},
                        "РК": {"reportNumber": "РК-001-TX3-Л1-Д-21-010", "result": "Годен", "date": "2026-11-26", "inspector": "Лаб"},
                        "УЗК": {"reportNumber": "УЗК-001-TX3-Л1-Д-21-010", "result": "Годен", "date": "2026-11-26", "inspector": "Лаб"},
                    },
                },
            )
            assert resp_j_full.status_code == 200, resp_j_full.text
            j_out = resp_j_full.json()
            assert j_out["vik_result"] == "Годен"
            assert j_out["ndt_result"] == "Годен"
            assert j_out["lab_conclusions"]["УЗК"]["reportNumber"] == "УЗК-001-TX3-Л1-Д-21-010"

            resp_complete_ok = await client.patch(
                f"/api/lab-requests/{req_id}?version={req_ver}",
                json={"status": "Выполнена"},
            )
            assert resp_complete_ok.status_code == 200, resp_complete_ok.text
            assert resp_complete_ok.json()["status"] == "Выполнена"
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()
