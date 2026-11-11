from __future__ import annotations

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest

from app.api.deps import get_db_session
from app.core.rate_limit import SlidingWindowRateLimiter
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.main import app
from app.models.audit import AuditLog
from app.models.enums import RoleEnum
from app.models.user import User
from app.services.audit_service import extract_changed_fields, sanitize_audit_snapshot
from app.services.rbac import (
    can_edit_joint_field,
    find_forbidden_joint_fields,
    get_role_permissions,
)


def _make_user(
    *,
    login: str,
    role: RoleEnum,
    password: str = "Secret123!",
    is_active: bool = True,
    session_number: int = 1,
    version: int = 1,
) -> User:
    now = datetime.now(timezone.utc)
    return User(
        id=uuid.uuid4(),
        login=login,
        password_hash=hash_password(password),
        full_name=f"Пользователь {login}",
        role=role,
        department="Тест",
        position_title=role.value,
        session_number=session_number,
        is_active=is_active,
        must_change_password=False,
        version=version,
        created_at=now,
        updated_at=now,
    )


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


class _FakeAsyncSession:
    """Minimal AsyncSession double tracking users & audit_logs in memory for ASGI auth/RBAC tests."""

    def __init__(self, users: list[User] | None = None) -> None:
        self.users: dict[uuid.UUID, User] = {u.id: u for u in (users or [])}
        self.audit_logs: list[AuditLog] = []
        self.committed = 0

    def add(self, obj: object) -> None:
        if isinstance(obj, User):
            if obj.id is None:
                obj.id = uuid.uuid4()
            now = datetime.now(timezone.utc)
            if obj.created_at is None:
                obj.created_at = now
            if obj.updated_at is None:
                obj.updated_at = now
            if obj.version is None:
                obj.version = 1
            if obj.session_number is None:
                obj.session_number = 1
            self.users[obj.id] = obj
        elif isinstance(obj, AuditLog):
            if obj.id is None:
                obj.id = uuid.uuid4()
            if obj.timestamp is None:
                obj.timestamp = datetime.now(timezone.utc)
            self.audit_logs.append(obj)

    async def flush(self) -> None:
        return None

    async def commit(self) -> None:
        self.committed += 1

    async def refresh(self, _obj: object) -> None:
        return None

    async def execute(self, stmt):
        sql_text = str(stmt)
        params = stmt.compile().params

        if "FROM users" in sql_text:
            # Count query
            if "count(" in sql_text.lower():
                exclude_id = next(
                    (v for k, v in params.items() if "id_" in k and isinstance(v, uuid.UUID)),
                    None,
                )
                count = sum(
                    1
                    for u in self.users.values()
                    if u.role == RoleEnum.ADMIN and u.is_active and u.id != exclude_id
                )
                return _FakeExecuteResult(scalar_one=count)

            # Lookup by ID
            for val in params.values():
                if isinstance(val, uuid.UUID):
                    return _FakeExecuteResult(scalar_one=self.users.get(val))

            # Lookup by normalized login
            for val in params.values():
                if isinstance(val, str):
                    target_login = val.strip().lower()
                    found = next(
                        (u for u in self.users.values() if u.login.strip().lower() == target_login),
                        None,
                    )
                    return _FakeExecuteResult(scalar_one=found)

            return _FakeExecuteResult(scalars_all=list(self.users.values()))

        if "FROM audit_logs" in sql_text:
            if "count(" in sql_text.lower():
                return _FakeExecuteResult(scalar_one=len(self.audit_logs))
            ordered = list(reversed(self.audit_logs))
            return _FakeExecuteResult(scalars_all=ordered)

        return _FakeExecuteResult()


def test_argon2_password_hashing_and_jwt_roundtrip() -> None:
    pw_hash = hash_password("StrongPass#2026")
    assert pw_hash.startswith("$argon2")
    assert verify_password("StrongPass#2026", pw_hash) is True
    assert verify_password("WrongPass", pw_hash) is False

    uid = uuid.uuid4()
    token, _ = create_access_token(
        user_id=uid,
        login="pto_ivanov",
        role=RoleEnum.PTO.value,
        session_number=3,
    )
    payload = decode_access_token(token)
    assert payload["sub"] == str(uid)
    assert payload["role"] == "PTO"
    assert payload["session_number"] == 3


def test_strict_rbac_matrix_and_field_level_guards() -> None:
    assert get_role_permissions(RoleEnum.ADMIN).can_manage_users is True
    assert get_role_permissions(RoleEnum.PTO).can_create_or_delete_joints is True
    assert get_role_permissions(RoleEnum.PTO).can_edit_ndt_fields is False
    assert get_role_permissions(RoleEnum.OGS).can_edit_welding_tech is True
    assert get_role_permissions(RoleEnum.OGS).can_edit_prep_and_welding_fields is False
    assert get_role_permissions(RoleEnum.PIL).can_edit_ndt_fields is True
    assert get_role_permissions(RoleEnum.PIL).can_create_or_delete_joints is False
    assert get_role_permissions(RoleEnum.VIEWER).can_export_documents is True
    assert get_role_permissions(RoleEnum.VIEWER).can_edit_ndt_fields is False

    with pytest.raises(ValueError):
        get_role_permissions("unknown_role")  # type: ignore[arg-type]

    # Joint number cannot be renamed after creation
    assert can_edit_joint_field(RoleEnum.PTO, "joint_number", is_create=True) is True
    assert can_edit_joint_field(RoleEnum.PTO, "joint_number", is_create=False) is False
    assert can_edit_joint_field(RoleEnum.ADMIN, "joint_number", is_create=False) is False

    # PTO trying to tamper with NDT field gets rejected; unchanged NDT field is allowed
    forbidden = find_forbidden_joint_fields(
        RoleEnum.PTO,
        {"welding_date": "2026-03-01", "ndt_result": "Годен"},
        existing_values={"welding_date": "2026-02-28", "ndt_result": "Не проводился"},
    )
    assert forbidden == ["ndt_result"]

    # PIL can update NDT & repair verification fields, but not welding_date
    assert (
        find_forbidden_joint_fields(
            RoleEnum.PIL,
            {"ndt_result": "Годен", "repair_vik_result": "Годен"},
            existing_values={"ndt_result": "В работе", "repair_vik_result": None},
        )
        == []
    )
    assert (
        find_forbidden_joint_fields(
            RoleEnum.PIL,
            {"welding_date": "2026-03-05"},
            existing_values={"welding_date": "2026-03-01"},
        )
        == ["welding_date"]
    )


def test_audit_sanitization_strips_secrets() -> None:
    snap = sanitize_audit_snapshot(
        {"login": "admin", "password_hash": "$argon2...", "role": "ADMIN"}
    )
    assert snap == {"login": "admin", "role": "ADMIN"}
    old_diff, new_diff = extract_changed_fields(
        {"role": "VIEWER", "department": "СК"},
        {"role": "PTO", "department": "СК"},
    )
    assert old_diff == {"role": "VIEWER"}
    assert new_diff == {"role": "PTO"}


@pytest.mark.asyncio
async def test_login_rate_limiter_blocks_and_resets() -> None:
    limiter = SlidingWindowRateLimiter(max_attempts=3, window_seconds=60)
    for _ in range(3):
        allowed, _ = await limiter.check_allowed("10.0.0.5", "pto_user")
        assert allowed is True
        await limiter.record_failure("10.0.0.5", "pto_user")

    blocked, retry_after = await limiter.check_allowed("10.0.0.5", "pto_user")
    assert blocked is False
    assert retry_after >= 1

    await limiter.reset_for_login("10.0.0.5", "pto_user")
    allowed_after_reset, _ = await limiter.check_allowed("10.0.0.5", "pto_user")
    assert allowed_after_reset is False  # IP bucket still exhausted until window expires

    await limiter.clear_all()
    assert (await limiter.check_allowed("10.0.0.5", "pto_user")) == (True, 0)


@pytest.mark.asyncio
async def test_http_auth_cookie_query_token_ban_rbac_rate_limit_and_audit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.api.routes import auth as auth_route

    admin_user = _make_user(login="admin", role=RoleEnum.ADMIN, password="AdminPassword1!")
    pto_user = _make_user(login="pto_1", role=RoleEnum.PTO, password="PtoPassword1!")
    fake_db = _FakeAsyncSession([admin_user, pto_user])

    test_limiter = SlidingWindowRateLimiter(max_attempts=3, window_seconds=120)
    monkeypatch.setattr(auth_route, "login_rate_limiter", test_limiter)

    async def _override_db():
        yield fake_db

    app.dependency_overrides[get_db_session] = _override_db
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            # 1. Protected routes reject anonymous calls with 401
            unauth_resp = await client.get("/api/auth/session")
            assert unauth_resp.status_code == 401
            assert (await client.get("/api/users")).status_code == 401
            assert (await client.get("/api/audit-logs")).status_code == 401

            # 2. Login issues HttpOnly + SameSite=Lax cookie and logs login_success on server
            login_resp = await client.post(
                "/api/auth/login",
                json={"login": "pto_1", "password": "PtoPassword1!"},
            )
            assert login_resp.status_code == 200
            cookie_header = login_resp.headers.get("set-cookie", "").lower()
            assert "zaychick_access_token=" in cookie_header
            assert "httponly" in cookie_header
            assert "samesite=lax" in cookie_header
            assert "access_token" not in login_resp.json()
            assert login_resp.json()["user"]["role"] == "PTO"
            assert any(
                a.action == "login_success" and a.user_login == "pto_1"
                for a in fake_db.audit_logs
            )

            # 3. Authenticated PTO session works via HttpOnly cookie
            sess_resp = await client.get("/api/auth/session")
            assert sess_resp.status_code == 200
            assert sess_resp.json()["user"]["login"] == "pto_1"

            # 4. ?token= in URL is strictly forbidden (401)
            q_resp = await client.get("/api/auth/session?token=anything")
            assert q_resp.status_code == 401

            # 5. PTO cannot access /api/users (403 Forbidden)
            assert (await client.get("/api/users")).status_code == 403
            assert (
                await client.post(
                    "/api/users",
                    json={
                        "login": "new_u",
                        "password": "Password123!",
                        "full_name": "Новый",
                        "role": "VIEWER",
                    },
                )
            ).status_code == 403

            # 6. Audit logs cannot be inserted/updated/deleted by client
            assert (await client.post("/api/audit-logs", json={})).status_code == 405
            assert (await client.get("/api/audit-logs")).status_code == 200

            # 7. Admin Bearer token flow + logout invalidates replayed token
            async with httpx.AsyncClient(
                transport=transport, base_url="http://testserver"
            ) as admin_client:
                token_resp = await admin_client.post(
                    "/api/auth/token",
                    json={"login": "admin", "password": "AdminPassword1!"},
                )
                assert token_resp.status_code == 200
                admin_jwt = token_resp.json()["access_token"]

                admin_create = await admin_client.post(
                    "/api/users",
                    headers={"Authorization": f"Bearer {admin_jwt}"},
                    json={
                        "login": "pil_master",
                        "password": "PilPassword1!",
                        "full_name": "Дефектоскопист ЛНК",
                        "role": "PIL",
                    },
                )
                assert admin_create.status_code == 201
                assert admin_create.json()["role"] == "PIL"
                assert any(a.action == "user_created" for a in fake_db.audit_logs)

                # Logout increments session_number -> old Bearer token stops working
                await admin_client.post(
                    "/api/auth/logout",
                    headers={"Authorization": f"Bearer {admin_jwt}"},
                )
                replay_resp = await admin_client.get(
                    "/api/users",
                    headers={"Authorization": f"Bearer {admin_jwt}"},
                )
                assert replay_resp.status_code == 401

            # 8. Change password rotates session_number & updates cookie on PTO client
            cp_resp = await client.post(
                "/api/auth/change-password",
                json={"current_password": "PtoPassword1!", "new_password": "PtoNewPassword2!"},
            )
            assert cp_resp.status_code == 200
            assert pto_user.session_number == 2
            assert any(a.action == "password_changed" for a in fake_db.audit_logs)

            # Old password stops working, failed attempt is audited, and rate limiter triggers 429
            for _ in range(3):
                bad = await client.post(
                    "/api/auth/login",
                    json={"login": "admin", "password": "WrongPassword!"},
                )
                assert bad.status_code == 401
            assert any(
                a.action == "login_failed" and a.user_login == "admin"
                for a in fake_db.audit_logs
            )
            rate_limited = await client.post(
                "/api/auth/login",
                json={"login": "admin", "password": "WrongPassword!"},
            )
            assert rate_limited.status_code == 429
            assert "retry-after" in {k.lower() for k in rate_limited.headers.keys()}
    finally:
        app.dependency_overrides.clear()


def test_orm_blocks_audit_log_mutation() -> None:
    """Ensure SQLAlchemy before_flush listener blocks UPDATE and DELETE on AuditLog."""
    from sqlalchemy.orm import Session

    from app.core.database import _enforce_immutable_audit_logs

    entry = AuditLog(
        action="login_success",
        entity_type="auth",
        entity_id="u1",
    )
    mock_session = AsyncMock(spec=Session)
    mock_session.dirty = {entry}
    mock_session.deleted = set()
    with pytest.raises(RuntimeError, match="UPDATE"):
        _enforce_immutable_audit_logs(mock_session, None, None)

    mock_session.dirty = set()
    mock_session.deleted = {entry}
    with pytest.raises(RuntimeError, match="DELETE"):
        _enforce_immutable_audit_logs(mock_session, None, None)
