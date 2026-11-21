from __future__ import annotations

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from app.api.deps import get_current_user
from app.cli import reset_db
from app.core.database import get_db_session
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.audit import AuditLog
from app.models.enums import DepartmentEnum, RecordStatusEnum, SystemRoleEnum
from app.models.facility import Facility
from app.models.user import User
from app.schemas.auth import CreateUserRequest
from app.services.rbac import (
    assert_can_mutate_record,
    assert_can_transition_record_status,
    can_edit_joint_field,
    find_forbidden_joint_fields,
    get_role_permissions,
    validate_role_department_pair,
)


def _make_user(
    *,
    login: str,
    role: SystemRoleEnum,
    department: DepartmentEnum,
    password: str = "StrongPass1!",
    is_active: bool = True,
) -> User:
    now = datetime.now(timezone.utc)
    return User(
        id=uuid.uuid4(),
        login=login,
        password_hash=hash_password(password),
        full_name=f"Тест {login}",
        role=role,
        department=department,
        position_title="Инженер",
        session_number=1,
        is_active=is_active,
        must_change_password=False,
        version=1,
        created_at=now,
        updated_at=now,
    )


def _make_record(
    *,
    record_status: RecordStatusEnum = RecordStatusEnum.DRAFT,
    created_by_id: uuid.UUID | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        record_status=record_status,
        created_by_id=created_by_id,
    )


# ---------------------------------------------------------------------------
# 1. Role × Department RBAC Matrix & Invariants
# ---------------------------------------------------------------------------
def test_department_all_invariant_reserved_for_superadmin():
    validate_role_department_pair(SystemRoleEnum.SUPERADMIN, DepartmentEnum.ALL)
    for role in (SystemRoleEnum.DEPT_ADMIN, SystemRoleEnum.OPERATOR, SystemRoleEnum.VIEWER):
        with pytest.raises(ValueError):
            validate_role_department_pair(role, DepartmentEnum.ALL)

    with pytest.raises(ValidationError):
        CreateUserRequest(
            login="bad_admin",
            password="Password123!",
            full_name="Нарушитель",
            role=SystemRoleEnum.DEPT_ADMIN,
            department=DepartmentEnum.ALL,
        )


def test_role_permissions_matrix_hierarchical():
    sa = get_role_permissions(SystemRoleEnum.SUPERADMIN, DepartmentEnum.ALL)
    assert sa.can_manage_users is True
    assert sa.can_manage_all_users is True
    assert sa.can_purge_project is True
    assert sa.can_unlock_records is True
    assert sa.can_approve_records is True

    pto_admin = get_role_permissions(SystemRoleEnum.DEPT_ADMIN, DepartmentEnum.PTO)
    assert pto_admin.can_manage_users is True
    assert pto_admin.can_manage_all_users is False
    assert pto_admin.can_purge_project is False
    assert pto_admin.can_approve_records is True
    assert pto_admin.can_unlock_records is False
    assert pto_admin.can_edit_lrv_catalog is True
    assert pto_admin.can_edit_welding_tech is False
    assert pto_admin.can_edit_ndt_fields is False

    pto_op = get_role_permissions(SystemRoleEnum.OPERATOR, DepartmentEnum.PTO)
    assert pto_op.can_manage_users is False
    assert pto_op.can_approve_records is False
    assert pto_op.can_edit_lrv_catalog is False  # Directories forbidden for OPERATOR
    assert pto_op.can_create_or_delete_joints is True
    assert pto_op.can_edit_prep_and_welding_fields is True

    ogs_op = get_role_permissions(SystemRoleEnum.OPERATOR, DepartmentEnum.OGS)
    assert ogs_op.can_edit_welding_tech is False  # Directories forbidden for OPERATOR
    ogs_admin = get_role_permissions(SystemRoleEnum.DEPT_ADMIN, DepartmentEnum.OGS)
    assert ogs_admin.can_edit_welding_tech is True

    pil_op = get_role_permissions(SystemRoleEnum.OPERATOR, DepartmentEnum.PIL)
    assert pil_op.can_edit_ndt_fields is True
    assert pil_op.can_create_or_delete_joints is False

    viewer = get_role_permissions(SystemRoleEnum.VIEWER, DepartmentEnum.SK)
    assert viewer.can_edit_prep_and_welding_fields is False
    assert viewer.can_edit_ndt_fields is False
    assert viewer.can_export_documents is True


def test_field_level_joint_rbac_uses_department():
    assert can_edit_joint_field(SystemRoleEnum.OPERATOR, DepartmentEnum.PTO, "welder_stamp") is True
    assert can_edit_joint_field(SystemRoleEnum.OPERATOR, DepartmentEnum.PTO, "ndt_result") is False
    assert can_edit_joint_field(SystemRoleEnum.OPERATOR, DepartmentEnum.PIL, "ndt_result") is True
    assert can_edit_joint_field(SystemRoleEnum.OPERATOR, DepartmentEnum.PIL, "welder_stamp") is False
    assert can_edit_joint_field(SystemRoleEnum.DEPT_ADMIN, DepartmentEnum.OGS, "welder_stamp") is False
    assert can_edit_joint_field(SystemRoleEnum.SUPERADMIN, DepartmentEnum.ALL, "ndt_result") is True
    assert can_edit_joint_field(SystemRoleEnum.SUPERADMIN, DepartmentEnum.ALL, "joint_number", is_create=False) is False

    forbidden = find_forbidden_joint_fields(
        SystemRoleEnum.OPERATOR,
        DepartmentEnum.PTO,
        {"welder_stamp": "W-01", "ndt_result": "Годен"},
    )
    assert forbidden == ["ndt_result"]


# ---------------------------------------------------------------------------
# 2. Record Lifecycle Locking & Ownership Protection
# ---------------------------------------------------------------------------
def test_operator_cannot_edit_or_delete_verified_or_locked_or_foreign_or_directory():
    op_pto = _make_user(login="op_pto", role=SystemRoleEnum.OPERATOR, department=DepartmentEnum.PTO)
    other_user_id = uuid.uuid4()

    own_draft = _make_record(record_status=RecordStatusEnum.DRAFT, created_by_id=op_pto.id)
    foreign_draft = _make_record(record_status=RecordStatusEnum.DRAFT, created_by_id=other_user_id)
    verified_rec = _make_record(record_status=RecordStatusEnum.VERIFIED, created_by_id=op_pto.id)
    locked_rec = _make_record(record_status=RecordStatusEnum.LOCKED, created_by_id=op_pto.id)

    # Allowed: own DRAFT update & delete in PTO
    assert_can_mutate_record(user=op_pto, record=own_draft, allowed_departments=(DepartmentEnum.PTO,), operation="update")
    assert_can_mutate_record(user=op_pto, record=own_draft, allowed_departments=(DepartmentEnum.PTO,), operation="delete")

    # Forbidden: foreign DRAFT delete
    with pytest.raises(HTTPException) as exc:
        assert_can_mutate_record(user=op_pto, record=foreign_draft, allowed_departments=(DepartmentEnum.PTO,), operation="delete")
    assert exc.value.status_code == 403

    # Forbidden: VERIFIED edit & delete
    for op in ("update", "delete"):
        with pytest.raises(HTTPException) as exc:
            assert_can_mutate_record(user=op_pto, record=verified_rec, allowed_departments=(DepartmentEnum.PTO,), operation=op)
        assert exc.value.status_code == 403

    # Forbidden: LOCKED edit & delete
    with pytest.raises(HTTPException) as exc:
        assert_can_mutate_record(user=op_pto, record=locked_rec, allowed_departments=(DepartmentEnum.PTO,), operation="update")
    assert exc.value.status_code == 403

    # Forbidden: directory modification for OPERATOR
    with pytest.raises(HTTPException) as exc:
        assert_can_mutate_record(
            user=op_pto,
            record=own_draft,
            allowed_departments=(DepartmentEnum.PTO,),
            operation="create",
            is_directory=True,
        )
    assert exc.value.status_code == 403

    # Forbidden: cross-department write (PIL operator into PTO)
    op_pil = _make_user(login="op_pil", role=SystemRoleEnum.OPERATOR, department=DepartmentEnum.PIL)
    with pytest.raises(HTTPException) as exc:
        assert_can_mutate_record(user=op_pil, record=own_draft, allowed_departments=(DepartmentEnum.PTO,), operation="update")
    assert exc.value.status_code == 403


def test_dept_admin_and_superadmin_status_transitions_and_unlock():
    sa = _make_user(login="sa", role=SystemRoleEnum.SUPERADMIN, department=DepartmentEnum.ALL)
    pto_admin = _make_user(login="pto_adm", role=SystemRoleEnum.DEPT_ADMIN, department=DepartmentEnum.PTO)
    pil_admin = _make_user(login="pil_adm", role=SystemRoleEnum.DEPT_ADMIN, department=DepartmentEnum.PIL)
    op_pto = _make_user(login="op_pto", role=SystemRoleEnum.OPERATOR, department=DepartmentEnum.PTO)

    draft = _make_record(record_status=RecordStatusEnum.DRAFT)
    verified = _make_record(record_status=RecordStatusEnum.VERIFIED)
    locked = _make_record(record_status=RecordStatusEnum.LOCKED)

    # OPERATOR cannot transition status
    with pytest.raises(HTTPException) as exc:
        assert_can_transition_record_status(
            user=op_pto, record=draft, target_status=RecordStatusEnum.VERIFIED, allowed_departments=(DepartmentEnum.PTO,)
        )
    assert exc.value.status_code == 403

    # DEPT_ADMIN of another department cannot transition PTO record
    with pytest.raises(HTTPException) as exc:
        assert_can_transition_record_status(
            user=pil_admin, record=draft, target_status=RecordStatusEnum.VERIFIED, allowed_departments=(DepartmentEnum.PTO,)
        )
    assert exc.value.status_code == 403

    # PTO DEPT_ADMIN can DRAFT -> VERIFIED -> LOCKED and VERIFIED -> DRAFT
    assert_can_transition_record_status(
        user=pto_admin, record=draft, target_status=RecordStatusEnum.VERIFIED, allowed_departments=(DepartmentEnum.PTO,)
    )
    assert_can_transition_record_status(
        user=pto_admin, record=verified, target_status=RecordStatusEnum.LOCKED, allowed_departments=(DepartmentEnum.PTO,)
    )
    assert_can_transition_record_status(
        user=pto_admin, record=verified, target_status=RecordStatusEnum.DRAFT, allowed_departments=(DepartmentEnum.PTO,)
    )

    # PTO DEPT_ADMIN cannot edit or unlock LOCKED record
    with pytest.raises(HTTPException) as exc:
        assert_can_mutate_record(user=pto_admin, record=locked, allowed_departments=(DepartmentEnum.PTO,), operation="update")
    assert exc.value.status_code == 403

    with pytest.raises(HTTPException) as exc:
        assert_can_transition_record_status(
            user=pto_admin,
            record=locked,
            target_status=RecordStatusEnum.DRAFT,
            allowed_departments=(DepartmentEnum.PTO,),
            reason="Попытка админа отдела",
        )
    assert exc.value.status_code == 403

    # SUPERADMIN unlock without reason -> 400
    with pytest.raises(HTTPException) as exc:
        assert_can_transition_record_status(
            user=sa,
            record=locked,
            target_status=RecordStatusEnum.DRAFT,
            allowed_departments=(DepartmentEnum.PTO,),
            reason="   ",
        )
    assert exc.value.status_code == 400

    # SUPERADMIN unlock with explicit reason -> OK
    assert_can_transition_record_status(
        user=sa,
        record=locked,
        target_status=RecordStatusEnum.DRAFT,
        allowed_departments=(DepartmentEnum.PTO,),
        reason="Исправление номера заключения по письму №42",
    )


# ---------------------------------------------------------------------------
# 3. API Tests: /api/auth/me, Inactive 403, /api/admin/users, Project Purge, No Zero-Reset
# ---------------------------------------------------------------------------
class _FakeResult:
    def __init__(self, rows=None, scalar=None, rowcount: int = 0):
        self._rows = list(rows or [])
        self._scalar = scalar
        self.rowcount = rowcount

    def scalar_one_or_none(self):
        return self._scalar if self._scalar is not None else (self._rows[0] if self._rows else None)

    def scalar_one(self):
        return self._scalar

    def scalars(self):
        return self

    def all(self):
        return list(self._rows)


@pytest.mark.asyncio
async def test_inactive_user_gets_403_on_api_me():
    inactive_user = _make_user(
        login="blocked_op",
        role=SystemRoleEnum.OPERATOR,
        department=DepartmentEnum.PTO,
        is_active=False,
    )
    token, _ = create_access_token(
        user_id=inactive_user.id,
        login=inactive_user.login,
        role=inactive_user.role.value,
        session_number=inactive_user.session_number,
    )

    fake_session = AsyncMock()
    fake_session.execute = AsyncMock(return_value=_FakeResult(scalar=inactive_user))

    async def _override_db():
        yield fake_session

    app.dependency_overrides[get_db_session] = _override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_zero_reset_http_endpoint_removed():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/imports/zero-reset", json={})
    assert resp.status_code in (404, 405)


@pytest.mark.asyncio
async def test_dept_admin_cannot_create_user_in_other_department_or_elevated_role():
    pto_admin = _make_user(login="pto_admin", role=SystemRoleEnum.DEPT_ADMIN, department=DepartmentEnum.PTO)
    fake_session = AsyncMock()

    async def _override_db():
        yield fake_session

    app.dependency_overrides[get_db_session] = _override_db
    app.dependency_overrides[get_current_user] = lambda: pto_admin
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # Cross-department forbidden
            r1 = await client.post(
                "/api/admin/users",
                json={
                    "login": "new_pil",
                    "password": "StrongPassword1!",
                    "full_name": "Сотрудник ПИЛ",
                    "role": "OPERATOR",
                    "department": "PIL",
                },
            )
            assert r1.status_code == 403

            # Role escalation to DEPT_ADMIN forbidden
            r2 = await client.post(
                "/api/admin/users",
                json={
                    "login": "new_pto_adm",
                    "password": "StrongPassword1!",
                    "full_name": "Второй админ",
                    "role": "DEPT_ADMIN",
                    "department": "PTO",
                },
            )
            assert r2.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_project_purge_requires_superadmin_password_and_confirm_name_and_logs_audit():
    sa = _make_user(
        login="root_sa",
        role=SystemRoleEnum.SUPERADMIN,
        department=DepartmentEnum.ALL,
        password="SuperSecretPassword1!",
    )
    pto_admin = _make_user(login="pto_adm", role=SystemRoleEnum.DEPT_ADMIN, department=DepartmentEnum.PTO)
    fac = Facility(
        id=uuid.uuid4(),
        external_id="fac-01",
        name="КС Портовая",
        short_name="КСП-1",
        region="Ленинградская обл.",
        version=1,
    )

    added_objects: list[object] = []

    def _capture_add(obj):
        added_objects.append(obj)

    fake_session = AsyncMock()
    fake_session.add = MagicMock(side_effect=_capture_add)

    # 1) Non-superadmin -> 403
    async def _override_db():
        yield fake_session

    app.dependency_overrides[get_db_session] = _override_db
    app.dependency_overrides[get_current_user] = lambda: pto_admin
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r_forbidden = await client.post(
                f"/api/admin/projects/{fac.id}/purge",
                json={"password": "SuperSecretPassword1!", "confirm_name": "КС Портовая"},
            )
        assert r_forbidden.status_code == 403
    finally:
        app.dependency_overrides.clear()

    # 2) Wrong password -> 403
    app.dependency_overrides[get_db_session] = _override_db
    app.dependency_overrides[get_current_user] = lambda: sa
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r_bad_pwd = await client.post(
                f"/api/admin/projects/{fac.id}/purge",
                json={"password": "WrongPassword!", "confirm_name": "КС Портовая"},
            )
        assert r_bad_pwd.status_code == 403

        # 3) Wrong confirm_name -> 400
        fake_session.execute = AsyncMock(return_value=_FakeResult(scalar=fac))
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r_bad_name = await client.post(
                f"/api/admin/projects/{fac.id}/purge",
                json={"password": "SuperSecretPassword1!", "confirm_name": "Другой объект"},
            )
        assert r_bad_name.status_code == 400

        # 4) Valid double confirmation -> 200 + PROJECT_PURGED audit log
        execute_results = [
            _FakeResult(scalar=fac),  # select Facility
            _FakeResult(rows=[]),  # select ProjectLine ids
            _FakeResult(rowcount=5),  # delete WeldJoint
            _FakeResult(rowcount=1),  # delete TestCircuit
            _FakeResult(rowcount=2),  # delete NdtLabRequestModel
            _FakeResult(rowcount=3),  # delete ProjectLine
            _FakeResult(rowcount=4),  # delete LrvItem
        ]
        fake_session.execute = AsyncMock(side_effect=execute_results)
        with patch("app.api.routes.admin.publish_domain_event", new=AsyncMock()):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                r_ok = await client.post(
                    f"/api/admin/projects/{fac.id}/purge",
                    json={"password": "SuperSecretPassword1!", "confirm_name": "КС Портовая"},
                )
        assert r_ok.status_code == 200
        body = r_ok.json()
        assert body["deleted_counts"]["weld_joints"] == 5
        assert body["deleted_counts"]["test_circuits"] == 1
        assert body["total_deleted"] == 15
        audit_entries = [obj for obj in added_objects if isinstance(obj, AuditLog)]
        assert any(a.action == "PROJECT_PURGED" for a in audit_entries)
    finally:
        app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# 4. CLI reset_db safety tests
# ---------------------------------------------------------------------------
def test_cli_reset_db_requires_confirm_flag():
    with pytest.raises(SystemExit) as exc:
        reset_db.main([])
    assert exc.value.code == 2


def test_cli_reset_db_aborts_if_pg_dump_fails(tmp_path):
    mock_proc = MagicMock(returncode=1, stderr="pg_dump: connection refused")
    with patch("app.cli.reset_db.subprocess.run", return_value=mock_proc):
        with pytest.raises(RuntimeError, match="pg_dump"):
            reset_db.create_mandatory_pg_dump_backup(tmp_path)
