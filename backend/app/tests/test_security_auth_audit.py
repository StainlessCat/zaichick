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
from app.models.enums import DepartmentEnum, RoleEnum, SystemRoleEnum
from app.models.session import UserSession
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
    department: DepartmentEnum | None = None,
    password: str = "Secret123!",
    is_active: bool = True,
    session_number: int = 1,
    version: int = 1,
) -> User:
    now = datetime.now(timezone.utc)
    dep = department or (DepartmentEnum.ALL if role in (RoleEnum.ADMIN, SystemRoleEnum.SUPERADMIN) else DepartmentEnum.PTO)
    return User(
        id=uuid.uuid4(),
        login=login,
        password_hash=hash_password(password),
        full_name=f"Пользователь {login}",
        role=role,
        department=dep,
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
        self.user_sessions: dict[uuid.UUID, UserSession] = {}
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
        elif isinstance(obj, UserSession):
            if obj.id is None:
                obj.id = uuid.uuid4()
            self.user_sessions[obj.id] = obj
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

        if "FROM user_sessions" in sql_text:
            uuids = [v for v in params.values() if isinstance(v, uuid.UUID)]
            # Lookup by (id, user_id)
            if len(uuids) >= 2:
                sid, uid = uuids[0], uuids[1]
                found = self.user_sessions.get(sid)
                if found and found.user_id == uid:
                    return _FakeExecuteResult(scalar_one=found)
                return _FakeExecuteResult(scalar_one=None)
            # Lookup by single id or user_id
            if len(uuids) == 1:
                val = uuids[0]
                if "user_sessions.id =" in sql_text:
                    return _FakeExecuteResult(scalar_one=self.user_sessions.get(val))
                now = datetime.now(timezone.utc)
                matching = [
                    s
                    for s in self.user_sessions.values()
                    if s.user_id == val and s.revoked_at is None and s.expires_at > now
                ]
                return _FakeExecuteResult(scalars_all=matching)
            return _FakeExecuteResult(scalars_all=list(self.user_sessions.values()))

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
    assert payload["role"] in ("PTO", "OPERATOR")
    assert payload["session_number"] == 3


def test_strict_rbac_matrix_and_field_level_guards() -> None:
    assert get_role_permissions(SystemRoleEnum.SUPERADMIN, DepartmentEnum.ALL).can_manage_users is True
    assert get_role_permissions(SystemRoleEnum.OPERATOR, DepartmentEnum.PTO).can_create_or_delete_joints is True
    assert get_role_permissions(SystemRoleEnum.OPERATOR, DepartmentEnum.PTO).can_edit_ndt_fields is False
    assert get_role_permissions(SystemRoleEnum.DEPT_ADMIN, DepartmentEnum.OGS).can_edit_welding_tech is True
    assert get_role_permissions(SystemRoleEnum.OPERATOR, DepartmentEnum.OGS).can_edit_prep_and_welding_fields is False
    assert get_role_permissions(SystemRoleEnum.OPERATOR, DepartmentEnum.PIL).can_edit_ndt_fields is True
    assert get_role_permissions(SystemRoleEnum.OPERATOR, DepartmentEnum.PIL).can_create_or_delete_joints is False
    assert get_role_permissions(SystemRoleEnum.VIEWER, DepartmentEnum.SK).can_export_documents is True
    assert get_role_permissions(SystemRoleEnum.VIEWER, DepartmentEnum.SK).can_edit_ndt_fields is False

    with pytest.raises(ValueError):
        get_role_permissions("unknown_role")  # type: ignore[arg-type]

    # Joint number cannot be renamed after creation
    assert can_edit_joint_field(SystemRoleEnum.OPERATOR, DepartmentEnum.PTO, "joint_number", is_create=True) is True
    assert can_edit_joint_field(SystemRoleEnum.OPERATOR, DepartmentEnum.PTO, "joint_number", is_create=False) is False
    assert can_edit_joint_field(SystemRoleEnum.SUPERADMIN, DepartmentEnum.ALL, "joint_number", is_create=False) is False

    # PTO trying to tamper with NDT field gets rejected; unchanged NDT field is allowed
    forbidden = find_forbidden_joint_fields(
        SystemRoleEnum.OPERATOR,
        DepartmentEnum.PTO,
        {"welding_date": "2026-03-01", "ndt_result": "Годен"},
        existing_values={"welding_date": "2026-02-28", "ndt_result": "Не проводился"},
    )
    assert forbidden == ["ndt_result"]

    # PIL can update NDT & repair verification fields, but not welding_date
    assert (
        find_forbidden_joint_fields(
            SystemRoleEnum.OPERATOR,
            DepartmentEnum.PIL,
            {"ndt_result": "Годен", "repair_vik_result": "Годен"},
            existing_values={"ndt_result": "В работе", "repair_vik_result": None},
        )
        == []
    )
    assert (
        find_forbidden_joint_fields(
            SystemRoleEnum.OPERATOR,
            DepartmentEnum.PIL,
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
            assert login_resp.json()["user"]["role"] in ("PTO", "OPERATOR")
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

            # 6. Audit logs cannot be inserted/updated/deleted by client and are admin-only to read
            assert (await client.post("/api/audit-logs", json={})).status_code == 405
            assert (await client.get("/api/audit-logs")).status_code == 403

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

                admin_audit_resp = await admin_client.get(
                    "/api/audit-logs",
                    headers={"Authorization": f"Bearer {admin_jwt}"},
                )
                assert admin_audit_resp.status_code == 200

                admin_create = await admin_client.post(
                    "/api/users",
                    headers={"Authorization": f"Bearer {admin_jwt}"},
                    json={
                        "login": "pil_master",
                        "password": "PilPassword1!",
                        "full_name": "Дефектоскопист ЛНК",
                        "role": "OPERATOR",
                        "department": "PIL",
                    },
                )
                assert admin_create.status_code == 201
                assert admin_create.json()["role"] in ("PIL", "OPERATOR")
                assert admin_create.json()["department"] == "PIL"
                assert any(a.action.lower() == "user_created" for a in fake_db.audit_logs)

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

            # 8. Refresh session extends expiry and lists active sessions; cross-origin cookie POST rejected
            refresh_resp = await client.post("/api/auth/refresh")
            assert refresh_resp.status_code == 200
            assert refresh_resp.json()["session_id"] is not None

            sessions_resp = await client.get("/api/auth/sessions")
            assert sessions_resp.status_code == 200
            assert len(sessions_resp.json()) >= 1
            assert any(s["is_current"] is True for s in sessions_resp.json())

            csrf_bad = await client.post(
                "/api/auth/refresh",
                headers={"Origin": "https://evil.example.com"},
            )
            assert csrf_bad.status_code == 403

            # 9. Change password rotates session_number & updates cookie on PTO client
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


@pytest.mark.asyncio
async def test_multi_worker_shared_rate_limiting_across_sessions() -> None:
    """
    Verify that login rate limits are synchronized across independent worker processes
    via PostgreSQL shared storage, preventing distributed brute-force attacks.
    """
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from sqlalchemy.pool import NullPool

    test_url = "postgresql+asyncpg://zaychick:zaychick_dev_password@127.0.0.1:5432/zaychick_test"
    engine = create_async_engine(test_url, poolclass=NullPool)
    session_factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session1, session_factory() as session2:
        # Worker 1 has its own limiter instance
        worker1_limiter = SlidingWindowRateLimiter(max_attempts=3, window_seconds=60)
        # Worker 2 has a completely separate limiter instance with EMPTY in-memory state
        worker2_limiter = SlidingWindowRateLimiter(max_attempts=3, window_seconds=60)

        # Clear state
        await worker1_limiter.clear_all(session=session1)
        await session1.commit()

        test_ip = "192.168.10.99"
        test_login = "worker_bruteforce_target"

        # Initially allowed on both workers
        assert (await worker1_limiter.check_allowed(test_ip, test_login, session=session1))[0] is True
        assert (await worker2_limiter.check_allowed(test_ip, test_login, session=session2))[0] is True

        # Worker 1 receives 3 failed login attempts and persists them to PostgreSQL
        for _ in range(3):
            await worker1_limiter.record_failure(test_ip, test_login, session=session1)
        await session1.commit()

        # Worker 2 has NEVER seen any attempts in memory, but MUST immediately block because of PostgreSQL shared state!
        allowed_w2, retry_after_w2 = await worker2_limiter.check_allowed(test_ip, test_login, session=session2)
        assert allowed_w2 is False
        assert retry_after_w2 >= 1

        # Worker 2 resets after successful login
        await worker2_limiter.reset_for_login(test_ip, test_login, session=session2)
        await session2.commit()

        # Clean up
        await worker1_limiter.clear_all(session=session1)
        await session1.commit()

    await engine.dispose()
