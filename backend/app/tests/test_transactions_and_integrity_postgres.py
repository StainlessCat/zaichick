from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from typing import Any

import httpx
import pytest
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.api.deps import get_current_user, get_db_session
from app.core.security import create_access_token
from app.main import app
from app.models.audit import AuditLog
from app.models.enums import RoleEnum
from app.models.facility import Facility
from app.models.joint import WeldJoint
from app.models.line import ProjectLine
from app.models.user import User
from app.services.event_bus import event_bus

TEST_DATABASE_URL = "postgresql+asyncpg://zaychick:zaychick_dev_password@127.0.0.1:5432/zaychick_test"

test_engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
db_session_factory = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def override_get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Test dependency enforcing the exact production transaction boundary."""
    async with db_session_factory() as session:
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
    """Clean all tables before each test in the isolated test DB."""
    async with db_session_factory() as session:
        await session.execute(
            text("TRUNCATE TABLE weld_joints, project_lines, facilities, audit_logs, users CASCADE")
        )
        await session.commit()
    yield
    async with db_session_factory() as session:
        await session.execute(
            text("TRUNCATE TABLE weld_joints, project_lines, facilities, audit_logs, users CASCADE")
        )
        await session.commit()


@pytest.fixture
async def admin_user() -> User:
    """Seed an admin user for auth headers."""
    async with db_session_factory() as session:
        user = User(
            id=uuid.uuid4(),
            login="test_admin",
            password_hash="argon2_fake_hash",
            full_name="Тестовый Администратор",
            role=RoleEnum.ADMIN,
            department="ОИТ",
            position_title="Администратор",
            session_number=1,
            is_active=True,
            must_change_password=False,
            version=1,
        )
        session.add(user)
        await session.commit()
        return user


@pytest.fixture
async def test_facility() -> Facility:
    """Seed a test facility for lines."""
    async with db_session_factory() as session:
        fac = Facility(
            id=uuid.uuid4(),
            name="Тестовый Завод",
            short_name="ТЗ",
            version=1,
        )
        session.add(fac)
        await session.commit()
        return fac


@pytest.fixture
async def test_client(admin_user: User) -> AsyncGenerator[httpx.AsyncClient, None]:
    app.dependency_overrides[get_db_session] = override_get_db_session
    app.dependency_overrides[get_current_user] = lambda: admin_user

    token, _ = create_access_token(
        user_id=admin_user.id,
        login=admin_user.login,
        role=admin_user.role,
        session_number=admin_user.session_number,
    )
    cookies = {"zaychick_access_token": token}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
        cookies=cookies,
    ) as client:
        yield client

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_line_creation_commits_across_separate_sessions(
    test_client: httpx.AsyncClient, test_facility: Facility
):
    """Verify that creating a line commits to PostgreSQL and can be read by a completely fresh session."""
    payload = {
        "facility_id": str(test_facility.id),
        "rd_code": "RD-TEST-01",
        "line_number": "L-001",
        "unique_line_id": "RD-TEST-01-L-001",
        "object_name": "Тестовый Объект",
        "line_name": "Трубопровод технологический",
    }
    resp = await test_client.post("/api/lines", json=payload)
    assert resp.status_code == 201, resp.text
    data = resp.json()
    line_id = uuid.UUID(data["id"])

    # Open a completely FRESH, separate session directly to PostgreSQL
    async with db_session_factory() as fresh_session:
        saved_line = (
            await fresh_session.execute(select(ProjectLine).where(ProjectLine.id == line_id))
        ).scalar_one_or_none()
        assert saved_line is not None
        assert saved_line.unique_line_id == "RD-TEST-01-L-001"
        assert saved_line.rd_code == "RD-TEST-01"
        assert saved_line.line_number == "L-001"
        assert saved_line.version == 1

        # Verify audit log is committed in the same transaction
        audit_entry = (
            await fresh_session.execute(
                select(AuditLog).where(
                    AuditLog.entity_type == "project_line",
                    AuditLog.entity_id == str(line_id),
                )
            )
        ).scalar_one_or_none()
        assert audit_entry is not None
        assert audit_entry.action == "CREATE"
        assert audit_entry.user_login == "test_admin"
        assert audit_entry.unique_line_id == "RD-TEST-01-L-001"


@pytest.mark.asyncio
async def test_joint_creation_and_audit_committed_in_single_transaction(
    test_client: httpx.AsyncClient, admin_user: User, test_facility: Facility
):
    """Verify joint and audit log commit atomically and persist after request session closes."""
    # 1. Create Line
    line_resp = await test_client.post(
        "/api/lines",
        json={
            "facility_id": str(test_facility.id),
            "rd_code": "RD-10",
            "line_number": "100",
            "unique_line_id": "RD-10-100",
            "object_name": "КС-1",
        },
    )
    assert line_resp.status_code == 201, line_resp.text
    line_data = line_resp.json()
    line_id = uuid.UUID(line_data["id"])

    # 2. Create Joint
    joint_payload = {
        "line_id": str(line_id),
        "joint_number": "001",
        "rd_code": "RD-10",
        "line_number": "100",
        "unique_line_id": "RD-10-100",
        "object_name": "КС-1",
        "diameter_mm": 530.0,
        "wall_thickness": 12.0,
        "welder_stamp": "W1",
        "welding_type": "РД",
    }
    joint_resp = await test_client.post("/api/joints", json=joint_payload)
    assert joint_resp.status_code == 201, joint_resp.text
    joint_data = joint_resp.json()
    joint_id = uuid.UUID(joint_data["id"])

    # 3. Verify in independent fresh session
    async with db_session_factory() as fresh_session:
        saved_joint = (
            await fresh_session.execute(select(WeldJoint).where(WeldJoint.id == joint_id))
        ).scalar_one_or_none()
        assert saved_joint is not None
        assert saved_joint.joint_number == "001"
        assert saved_joint.diameter_mm == 530.0
        assert saved_joint.wall_thickness == 12.0

        # Audit entry must be committed together
        audit_records = (
            await fresh_session.execute(
                select(AuditLog).where(
                    AuditLog.entity_type == "weld_joint",
                    AuditLog.entity_id == str(joint_id),
                )
            )
        ).scalars().all()
        assert len(audit_records) == 1
        assert audit_records[0].action == "CREATE"
        assert audit_records[0].joint_number == "001"
        assert audit_records[0].user_login == "test_admin"


@pytest.mark.asyncio
async def test_validation_error_rollback_leaves_no_joint_and_no_audit(
    test_client: httpx.AsyncClient, test_facility: Facility
):
    """Verify that when domain validation fails, the transaction is rolled back: no joint, no audit."""
    line_resp = await test_client.post(
        "/api/lines",
        json={
            "facility_id": str(test_facility.id),
            "rd_code": "RD-ERR",
            "line_number": "002",
            "unique_line_id": "RD-ERR-002",
            "object_name": "Объект Ошибок",
        },
    )
    assert line_resp.status_code == 201
    line_id = line_resp.json()["id"]

    # Post joint with invalid parameters that fail domain validation (diameter 9999 mm > 2520 mm max)
    invalid_joint_payload = {
        "line_id": line_id,
        "joint_number": "BAD-01",
        "rd_code": "RD-ERR",
        "line_number": "002",
        "unique_line_id": "RD-ERR-002",
        "diameter_mm": 9999.0,  # Exceeds max allowable pipe diameter (10...2520 mm)
        "wall_thickness": 10.0,
        "welder_stamp": "UNKNOWN",
    }
    resp = await test_client.post("/api/joints", json=invalid_joint_payload)
    assert resp.status_code == 422, resp.text
    err_body = resp.json()
    assert err_body["detail"]["code"] == "DOMAIN_VALIDATION_FAILED"

    # Open fresh session: check that BAD-01 does NOT exist and NO audit record exists
    async with db_session_factory() as fresh_session:
        joint_in_db = (
            await fresh_session.execute(
                select(WeldJoint).where(WeldJoint.joint_number == "BAD-01")
            )
        ).scalar_one_or_none()
        assert joint_in_db is None

        audits = (
            await fresh_session.execute(
                select(AuditLog).where(AuditLog.joint_number == "BAD-01")
            )
        ).scalars().all()
        assert len(audits) == 0


@pytest.mark.asyncio
async def test_duplicate_joint_postgres_unique_constraint_returns_409(
    test_client: httpx.AsyncClient, test_facility: Facility
):
    """Verify duplicate joint returns HTTP 409 and rolls back cleanly without phantom records."""
    line_resp = await test_client.post(
        "/api/lines",
        json={
            "facility_id": str(test_facility.id),
            "rd_code": "RD-DUP",
            "line_number": "003",
            "unique_line_id": "RD-DUP-003",
            "object_name": "КС Дубликатов",
        },
    )
    assert line_resp.status_code == 201
    line_id = line_resp.json()["id"]

    joint_payload = {
        "line_id": line_id,
        "joint_number": "DUP-100",
        "rd_code": "RD-DUP",
        "line_number": "003",
        "unique_line_id": "RD-DUP-003",
        "diameter_mm": 219.0,
        "wall_thickness": 8.0,
        "welder_stamp": "D1",
        "welding_type": "РД",
    }
    # First creation -> 201
    r1 = await test_client.post("/api/joints", json=joint_payload)
    assert r1.status_code == 201, r1.text

    # Second creation with same joint_number on same line -> 409
    r2 = await test_client.post("/api/joints", json=joint_payload)
    assert r2.status_code == 409, r2.text
    err = r2.json()
    assert err["detail"]["code"] in ("DUPLICATE_JOINT_NUMBER", "UNIQUE_CONSTRAINT_VIOLATION")

    # In PostgreSQL, verify exactly one joint exists, and only 1 audit record exists
    async with db_session_factory() as fresh_session:
        joints = (
            await fresh_session.execute(
                select(WeldJoint).where(WeldJoint.joint_number == "DUP-100")
            )
        ).scalars().all()
        assert len(joints) == 1

        audits = (
            await fresh_session.execute(
                select(AuditLog).where(
                    AuditLog.entity_type == "weld_joint",
                    AuditLog.joint_number == "DUP-100",
                )
            )
        ).scalars().all()
        assert len(audits) == 1


@pytest.mark.asyncio
async def test_post_commit_sse_delivery_and_no_phantom_events_on_rollback(
    test_client: httpx.AsyncClient, test_facility: Facility
):
    """Verify SSE events are delivered only AFTER successful commit and never on rollback."""
    queue: asyncio.Queue = asyncio.Queue()

    # Simulate subscriber
    async def sub():
        async for evt in event_bus.subscribe():
            if evt.get("event") != "connected":
                queue.put_nowait(evt)

    sub_task = asyncio.create_task(sub())
    await asyncio.sleep(0.05)

    # Successful creation
    line_resp = await test_client.post(
        "/api/lines",
        json={
            "facility_id": str(test_facility.id),
            "rd_code": "RD-SSE",
            "line_number": "777",
            "unique_line_id": "RD-SSE-777",
            "object_name": "Объект SSE",
        },
    )
    assert line_resp.status_code == 201

    # Event must arrive
    event = await asyncio.wait_for(queue.get(), timeout=2.0)
    assert event["event"] == "line.created"
    assert event["entity_type"] == "project_line"

    # Failed operation that rolls back (invalid joint)
    bad_resp = await test_client.post(
        "/api/joints",
        json={
            "line_id": line_resp.json()["id"],
            "joint_number": "BAD-SSE",
            "rd_code": "RD-SSE",
            "line_number": "777",
            "unique_line_id": "RD-SSE-777",
            "diameter_mm": -10.0,
            "wall_thickness": -1.0,
        },
    )
    assert bad_resp.status_code == 422

    # Give a moment to confirm NO phantom event was published
    await asyncio.sleep(0.1)
    assert queue.empty(), "Phantom SSE event was emitted despite rollback!"

    sub_task.cancel()


@pytest.mark.asyncio
async def test_delete_joint_persists_across_sessions_with_audit(
    test_client: httpx.AsyncClient, test_facility: Facility
):
    """Verify delete operation commits deletion and audit log across fresh sessions."""
    line_resp = await test_client.post(
        "/api/lines",
        json={
            "facility_id": str(test_facility.id),
            "rd_code": "RD-DEL",
            "line_number": "888",
            "unique_line_id": "RD-DEL-888",
            "object_name": "Объект Удаления",
        },
    )
    assert line_resp.status_code == 201
    line_id = line_resp.json()["id"]

    joint_resp = await test_client.post(
        "/api/joints",
        json={
            "line_id": line_id,
            "joint_number": "TO-DEL-01",
            "rd_code": "RD-DEL",
            "line_number": "888",
            "unique_line_id": "RD-DEL-888",
            "diameter_mm": 159.0,
            "wall_thickness": 6.0,
            "welder_stamp": "DEL1",
            "welding_type": "РД",
        },
    )
    assert joint_resp.status_code == 201
    joint_id = joint_resp.json()["id"]

    # Delete the joint
    del_resp = await test_client.delete(f"/api/joints/{joint_id}")
    assert del_resp.status_code == 204

    # Verify in a NEW session that it is truly gone from PostgreSQL
    async with db_session_factory() as fresh_session:
        deleted_joint = (
            await fresh_session.execute(
                select(WeldJoint).where(WeldJoint.id == uuid.UUID(joint_id))
            )
        ).scalar_one_or_none()
        assert deleted_joint is None

        # Verify DELETE audit log was committed
        delete_audit = (
            await fresh_session.execute(
                select(AuditLog).where(
                    AuditLog.entity_type == "weld_joint",
                    AuditLog.entity_id == joint_id,
                    AuditLog.action == "DELETE",
                )
            )
        ).scalar_one_or_none()
        assert delete_audit is not None
        assert delete_audit.joint_number == "TO-DEL-01"
