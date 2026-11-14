from __future__ import annotations

import uuid
from datetime import datetime, timezone

import httpx
import pytest
from sqlalchemy import delete

from app.api.deps import get_current_user
from app.core.database import async_session_factory
from app.main import app
from app.models.enums import RoleEnum
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
    """Test full CRUD lifecycle, RBAC enforcement, and OCC for NDT lab requests."""
    admin_user = _make_test_user(RoleEnum.ADMIN, f"adm_{uuid.uuid4().hex[:6]}")
    pto_user = _make_test_user(RoleEnum.PTO, f"pto_{uuid.uuid4().hex[:6]}")
    pil_user = _make_test_user(RoleEnum.PIL, f"pil_{uuid.uuid4().hex[:6]}")
    viewer_user = _make_test_user(RoleEnum.VIEWER, f"viw_{uuid.uuid4().hex[:6]}")

    async with async_session_factory() as s:
        s.add_all([admin_user, pto_user, pil_user, viewer_user])
        await s.commit()

    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            # 1. Viewer cannot create a lab request (403)
            app.dependency_overrides[get_current_user] = lambda: viewer_user
            unique_num = f"ЗНК-TEST-{uuid.uuid4().hex[:6]}"
            payload = {
                "request_number": unique_num,
                "created_date": "2026-11-14",
                "created_by": "Инженер ПТО Тестов",
                "object_name": "УКПГ-1С Тестовый",
                "rd_code": "РД-ТЕСТ-01",
                "line_number": "101",
                "unique_line_id": "РД-ТЕСТ-01:101",
                "contour": "Контур А",
                "control_stage": "Первичный ВИК и НК",
                "requested_method": "РК",
                "joint_ids": ["joint-uuid-1", "joint-uuid-2"],
                "status": "Подана ПТО",
            }
            res = await client.post("/api/lab-requests", json=payload)
            assert res.status_code == 403

            # 2. PTO creates a lab request (201)
            app.dependency_overrides[get_current_user] = lambda: pto_user
            res = await client.post("/api/lab-requests", json=payload)
            assert res.status_code == 201, res.text
            created = res.json()
            assert created["request_number"] == unique_num
            assert created["status"] == "Подана ПТО"
            assert len(created["joint_ids"]) == 2
            req_id = created["id"]
            version = created["version"]

            # 3. Duplicate request_number fails (409)
            res_dup = await client.post("/api/lab-requests", json=payload)
            assert res_dup.status_code == 409

            # 4. Read list of lab requests
            app.dependency_overrides[get_current_user] = lambda: viewer_user
            res_list = await client.get("/api/lab-requests", params={"status": "Подана ПТО"})
            assert res_list.status_code == 200
            data_list = res_list.json()
            assert any(item["id"] == req_id for item in data_list["items"])

            # 5. Read single lab request
            res_single = await client.get(f"/api/lab-requests/{req_id}")
            assert res_single.status_code == 200
            assert res_single.json()["request_number"] == unique_num

            # 6. PIL accepts request into work (PATCH)
            app.dependency_overrides[get_current_user] = lambda: pil_user
            patch_payload = {
                "status": "В работе ЛНК",
                "accepted_by": "Дефектоскопист Сидоров",
                "accepted_at": datetime.now(timezone.utc).isoformat(),
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
            new_version = updated["version"]
            assert new_version == version + 1

            # 7. Optimistic concurrency conflict (stale version 409)
            res_conflict = await client.patch(
                f"/api/lab-requests/{req_id}",
                params={"version": version},
                json={"notes": "Конфликтная правка"},
            )
            assert res_conflict.status_code == 409

            # 8. Viewer cannot delete request (403)
            app.dependency_overrides[get_current_user] = lambda: viewer_user
            res_del_forbidden = await client.delete(f"/api/lab-requests/{req_id}")
            assert res_del_forbidden.status_code == 403

            # 9. Admin deletes request (204)
            app.dependency_overrides[get_current_user] = lambda: admin_user
            res_del = await client.delete(f"/api/lab-requests/{req_id}")
            assert res_del.status_code == 204

            # 10. Verify 404 after deletion
            res_after = await client.get(f"/api/lab-requests/{req_id}")
            assert res_after.status_code == 404

    finally:
        app.dependency_overrides.clear()
