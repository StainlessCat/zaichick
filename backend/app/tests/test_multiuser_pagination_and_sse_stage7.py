from __future__ import annotations

import asyncio
import json
import uuid
from datetime import date, datetime, timezone
from pathlib import Path

import httpx
import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.api.deps import get_db_session
from app.cli.backup_db import compute_sha256, create_backup, restore_backup, verify_backup
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.enums import ControlResultEnum, JointKindEnum, JointTypeEnum, RoleEnum
from app.models.facility import Facility
from app.models.joint import WeldJoint
from app.models.line import ProjectLine
from app.models.user import User
from app.services.event_bus import SseEventBus, event_bus

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
                await event_bus.flush_pg_notifications(session)
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
async def test_sql_level_server_pagination():
    """Verify that /api/joints utilizes SQL count and offset/limit pagination correctly."""
    now = datetime.now(timezone.utc)
    async with _session_factory() as session:
        viewer = User(
            id=uuid.uuid4(),
            login="viewer_paged",
            password_hash=hash_password("Pass123!"),
            full_name="Наблюдатель",
            role=RoleEnum.VIEWER,
            department="СКК",
            position_title="Инспектор",
            session_number=1,
            is_active=True,
            must_change_password=False,
            version=1,
            created_at=now,
            updated_at=now,
        )
        session.add(viewer)

        fac = Facility(
            id=uuid.uuid4(),
            name="КС Таёжная",
            short_name="КСТ",
            region="ХМАО",
            version=1,
            created_at=now,
            updated_at=now,
        )
        session.add(fac)

        line1 = ProjectLine(
            id=uuid.uuid4(),
            facility_id=fac.id,
            object_name=fac.name,
            rd_code="0092.049-045.0077.01",
            line_number="L-101",
            unique_line_id="01-L-101",
            line_name="Линия 101",
            product="Газ",
            test_contour="К-1",
            welding_ntd="СТО Газпром 15-1.1-002-2023",
            control_ntd="СТО Газпром 15-1.3-004-2023",
            quality_level="B",
            pipeline_category="I",
            working_pressure="7.4",
            working_temperature="20",
            rk_percent=100.0,
            uzk_percent=20.0,
            pvk_percent=0.0,
            sort_order=1,
            version=1,
            created_at=now,
            updated_at=now,
        )
        session.add(line1)

        # Create 25 joints with sequential numbers J-01 .. J-25
        for i in range(1, 26):
            num_str = f"J-{i:02d}"
            j = WeldJoint(
                id=uuid.uuid4(),
                line_id=line1.id,
                facility_id=fac.id,
                unique_line_id=line1.unique_line_id,
                rd_code=line1.rd_code,
                line_number=line1.line_number,
                object_name=fac.name,
                joint_number=num_str,
                diameter_mm=219.0,
                diameter_inch='8"',
                equiv_diameter_inch=8.0,
                wall_thickness=8.0,
                welding_date=date(2025, 2, 10),
                welder_stamp="СВ-01",
                vik_result=ControlResultEnum.FIT if i % 2 == 0 else ControlResultEnum.NOT_CONDUCTED,
                sort_order=i,
                version=1,
                created_at=now,
                updated_at=now,
            )
            session.add(j)
        await session.commit()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        headers = _auth_headers(viewer)

        # Page 1: limit=10, offset=0
        res1 = await client.get("/api/joints", params={"limit": 10, "offset": 0}, headers=headers)
        assert res1.status_code == 200
        p1 = res1.json()
        assert p1["total"] == 25
        assert len(p1["items"]) == 10
        page1_numbers = [item["joint_number"] for item in p1["items"]]
        assert page1_numbers == [f"J-{i:02d}" for i in range(1, 11)]

        # Page 2: limit=10, offset=10
        res2 = await client.get("/api/joints", params={"limit": 10, "offset": 10}, headers=headers)
        assert res2.status_code == 200
        p2 = res2.json()
        assert p2["total"] == 25
        assert len(p2["items"]) == 10
        page2_numbers = [item["joint_number"] for item in p2["items"]]
        assert page2_numbers == [f"J-{i:02d}" for i in range(11, 21)]
        assert set(page1_numbers).isdisjoint(set(page2_numbers))

        # Page 3: limit=10, offset=20 -> remaining 5 items
        res3 = await client.get("/api/joints", params={"limit": 10, "offset": 20}, headers=headers)
        assert res3.status_code == 200
        p3 = res3.json()
        assert p3["total"] == 25
        assert len(p3["items"]) == 5
        assert [item["joint_number"] for item in p3["items"]] == [f"J-{i:02d}" for i in range(21, 26)]

        # Filtered pagination: vik_result=Годен (even numbers: 2, 4, ..., 24 -> 12 items)
        res_flt = await client.get(
            "/api/joints",
            params={"vik_result": "Годен", "limit": 10, "offset": 0},
            headers=headers,
        )
        assert res_flt.status_code == 200
        p_flt = res_flt.json()
        assert p_flt["total"] == 12
        assert len(p_flt["items"]) == 10


@pytest.mark.asyncio
async def test_event_bus_deduplication_and_multi_worker_pubsub():
    """Verify event bus deduplication preventing dual delivery across workers."""
    bus = SseEventBus(max_recent_ids=100)

    # 1. First emission delivers to subscriber queue
    q = asyncio.Queue()
    bus._subscribers.add(q)
    try:
        e1 = {
            "event_id": "test-uuid-1",
            "event": "joint.created",
            "entity_type": "weld_joint",
            "entity_id": "j-101",
            "data": {"joint_number": "01"},
        }
        delivered1 = await bus.publish_local(e1, deduplicate=True)
        assert delivered1 is True
        assert q.qsize() == 1

        # 2. Second emission with same event_id is rejected by deduplication
        delivered2 = await bus.publish_local(e1, deduplicate=True)
        assert delivered2 is False
        assert q.qsize() == 1  # Queue size unchanged
    finally:
        bus._subscribers.discard(q)


@pytest.mark.asyncio
async def test_pg_notify_committed_and_not_left_uncommitted():
    """Verify that pg_notify is flushed inside the transaction or explicitly committed post-commit."""
    bus = SseEventBus(max_recent_ids=100)
    q = asyncio.Queue()
    bus._subscribers.add(q)
    try:
        # Case A: Pre-commit flush + commit leaves session clean (not in dangling transaction)
        async with _session_factory() as session:
            session.info["pending_sse_events"] = []
            await bus.emit_delta(
                session,
                event="joint_created",
                entity_type="joint",
                entity_id="j-tx-1",
                version=1,
            )
            await bus.flush_pg_notifications(session)
            await session.commit()
            dispatched = await bus.dispatch_pending_session_events(session)
            assert len(dispatched) == 1
            assert session.in_transaction() is False
            assert q.qsize() == 1

        # Case B: Post-commit dispatch without prior flush commits the pg_notify statement
        async with _session_factory() as session:
            session.info["pending_sse_events"] = []
            await bus.emit_delta(
                session,
                event="joint_updated",
                entity_type="joint",
                entity_id="j-tx-2",
                version=2,
            )
            dispatched2 = await bus.dispatch_pending_session_events(session)
            assert len(dispatched2) == 1
            assert session.in_transaction() is False
            assert q.qsize() == 2
    finally:
        bus._subscribers.discard(q)


@pytest.mark.asyncio
async def test_backup_create_verify_and_restore(tmp_path: Path):
    """Verify end-to-end backup creation with checksum verification and database restoration."""
    now = datetime.now(timezone.utc)
    backup_file = tmp_path / "test_backup.json.gz"

    async with _session_factory() as session:
        # Seed test data
        u = User(
            id=uuid.uuid4(),
            login="backup_admin",
            password_hash=hash_password("Pass123!"),
            full_name="Админ Бэкапа",
            role=RoleEnum.ADMIN,
            department="IT",
            position_title="Системный администратор",
            session_number=1,
            is_active=True,
            must_change_password=False,
            version=1,
            created_at=now,
            updated_at=now,
        )
        fac = Facility(
            id=uuid.uuid4(),
            name="КС Северная",
            short_name="КСС",
            region="ЯНАО",
            version=1,
            created_at=now,
            updated_at=now,
        )
        session.add_all([u, fac])
        await session.commit()

        # 1. Create backup
        out_file, sum_file, manifest = await create_backup(session, backup_file)
        assert out_file.exists()
        assert sum_file.exists()
        assert manifest["total_records"] >= 2
        assert manifest["tables"]["users"] >= 1
        assert manifest["tables"]["facilities"] >= 1

    # 2. Verify backup
    verified_manifest = verify_backup(backup_file)
    assert verified_manifest["total_records"] == manifest["total_records"]

    # 3. Modify database (wipe or alter)
    async with _session_factory() as session:
        await session.execute(text("TRUNCATE TABLE facilities, users CASCADE"))
        await session.commit()
        cnt_users = (await session.execute(select(func.count(User.id)))).scalar_one()
        assert cnt_users == 0

        # 4. Restore backup
        res = await restore_backup(session, backup_file, verify_checksum=True)
        assert res["inserted"]["users"] >= 1
        assert res["inserted"]["facilities"] >= 1

        restored_users = (await session.execute(select(func.count(User.id)))).scalar_one()
        assert restored_users >= 1
        restored_fac = (await session.execute(select(Facility).where(Facility.name == "КС Северная"))).scalar_one_or_none()
        assert restored_fac is not None
        assert restored_fac.short_name == "КСС"
