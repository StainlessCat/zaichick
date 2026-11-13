from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.models.audit import AuditLog
from app.models.joint import WeldJoint
from app.models.line import ProjectLine
from app.models.user import User
from app.services.sqlite_migrator import migrate_sqlite_to_postgres

TEST_DATABASE_URL = "postgresql+asyncpg://zaychick:zaychick_dev_password@127.0.0.1:5432/zaychick_test"

_engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
_session_factory = async_sessionmaker(
    bind=_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


@pytest.fixture(autouse=True)
async def clean_test_database():
    async with _session_factory() as session:
        await session.execute(
            text("TRUNCATE TABLE weld_joints, project_lines, facilities, audit_logs, users CASCADE")
        )
        await session.commit()


def _create_sample_legacy_sqlite(db_path: Path) -> None:
    conn = sqlite3.connect(db_path)
    conn.executescript(
        """
        CREATE TABLE db_meta (
          id INTEGER PRIMARY KEY,
          global_revision INTEGER,
          last_updated_at TEXT,
          last_updated_by TEXT,
          last_action TEXT,
          templates_json TEXT,
          active_template_id TEXT
        );
        CREATE TABLE user_accounts (
          login TEXT PRIMARY KEY,
          sort_order INTEGER,
          version INTEGER,
          payload_json TEXT
        );
        CREATE TABLE facility_geo (
          object_name TEXT PRIMARY KEY,
          version INTEGER,
          payload_json TEXT
        );
        CREATE TABLE project_linelist (
          id TEXT PRIMARY KEY,
          sort_order INTEGER,
          unique_line_id TEXT,
          rd_code TEXT,
          object_name TEXT,
          version INTEGER,
          payload_json TEXT
        );
        CREATE TABLE lrv_catalog (
          id TEXT PRIMARY KEY,
          sort_order INTEGER,
          lrv_code TEXT,
          rd_code TEXT,
          object_name TEXT,
          version INTEGER,
          payload_json TEXT
        );
        CREATE TABLE welders (
          stamp TEXT PRIMARY KEY,
          sort_order INTEGER,
          version INTEGER,
          payload_json TEXT
        );
        CREATE TABLE tech_cards (
          id TEXT PRIMARY KEY,
          sort_order INTEGER,
          number TEXT,
          version INTEGER,
          payload_json TEXT
        );
        CREATE TABLE welding_materials (
          id TEXT PRIMARY KEY,
          sort_order INTEGER,
          version INTEGER,
          payload_json TEXT
        );
        CREATE TABLE weld_joints (
          id TEXT PRIMARY KEY,
          sort_order INTEGER,
          joint_number TEXT,
          unique_line_id TEXT,
          rd_code TEXT,
          object_name TEXT,
          version INTEGER,
          updated_at TEXT,
          updated_by TEXT,
          payload_json TEXT
        );
        CREATE TABLE duplicate_joints_quarantine (
          quarantine_id TEXT PRIMARY KEY,
          original_joint_id TEXT,
          kept_joint_id TEXT,
          normalized_unique_line_id TEXT,
          normalized_joint_number TEXT,
          reason TEXT,
          quarantined_at TEXT,
          sort_order INTEGER,
          joint_number TEXT,
          unique_line_id TEXT,
          rd_code TEXT,
          object_name TEXT,
          version INTEGER,
          updated_at TEXT,
          updated_by TEXT,
          payload_json TEXT
        );
        CREATE TABLE audit_logs (
          id TEXT PRIMARY KEY,
          sort_order INTEGER,
          timestamp TEXT,
          user_login TEXT,
          operation_type TEXT,
          payload_json TEXT
        );
        """
    )

    # Legacy users: one with legacy sha256 hash, one with plaintext password
    conn.execute(
        "INSERT INTO user_accounts VALUES ('legacy_engineer', 1, 1, ?)",
        (json.dumps({
            "login": "legacy_engineer",
            "fullName": "Инженер Старой Системы",
            "role": "ПТО",
            "passwordHash": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",  # sha256
        }),),
    )
    conn.execute(
        "INSERT INTO user_accounts VALUES ('legacy_welder_chief', 2, 1, ?)",
        (json.dumps({
            "login": "legacy_welder_chief",
            "fullName": "Главный Сварщик",
            "role": "ОГС",
            "password": "OldPlainPassword456!",
        }),),
    )

    # Facility
    conn.execute(
        "INSERT INTO facility_geo VALUES ('КС Южная', 1, ?)",
        (json.dumps({
            "id": "fac-south",
            "shortName": "КС-Ю",
            "region": "Ленинградская обл.",
            "rdCodes": [{"code": "РД-200", "title": "Участок компримирования", "contours": ["К2"]}],
        }),),
    )

    # Line
    conn.execute(
        "INSERT INTO project_linelist VALUES ('line-south-1', 1, '200-L1', 'РД-200', 'КС Южная', 1, ?)",
        (json.dumps({
            "lineNumber": "L1",
            "rdCode": "РД-200",
            "objectName": "КС Южная",
            "rkPercent": 100,
            "uzkPercent": 10,
        }),),
    )

    # Weld joints: duplicate number 'J-01' on line '200-L1'
    conn.execute(
        "INSERT INTO weld_joints VALUES ('joint-v1', 1, 'J-01', '200-L1', 'РД-200', 'КС Южная', 1, '2026-03-01T08:00:00Z', 'pto', ?)",
        (json.dumps({"jointNumber": "J-01", "diameterMm": 159, "wallThickness": 6, "vikResult": "В работе"}),),
    )
    conn.execute(
        "INSERT INTO weld_joints VALUES ('joint-v2', 2, ' J-01 ', '200-L1', 'РД-200', 'КС Южная', 2, '2026-03-02T10:00:00Z', 'pto', ?)",
        (json.dumps({"jointNumber": "J-01", "diameterMm": 159, "wallThickness": 6, "vikResult": "Годен"}),),
    )

    conn.commit()
    conn.close()


@pytest.mark.asyncio
async def test_migration_dry_run_leaves_postgres_untouched(tmp_path: Path):
    sqlite_path = tmp_path / "test_dry_run.sqlite"
    quarantine_path = tmp_path / "quarantine.json"
    creds_export_path = tmp_path / "creds.json"
    _create_sample_legacy_sqlite(sqlite_path)

    async with _session_factory() as session:
        # Check initial count of users/lines/joints
        init_users = (await session.execute(select(func.count(User.id)))).scalar_one()
        init_lines = (await session.execute(select(func.count(ProjectLine.id)))).scalar_one()
        init_joints = (await session.execute(select(func.count(WeldJoint.id)))).scalar_one()

        report = await migrate_sqlite_to_postgres(
            sqlite_path=sqlite_path,
            session=session,
            quarantine_report_path=quarantine_path,
            credentials_export_path=creds_export_path,
            dry_run=True,
        )

        assert report.dry_run is True
        assert report.users_inserted == 2
        assert report.lines_inserted == 1
        assert report.joints_inserted == 1
        assert len(report.quarantined_duplicates) == 1

        # Check PostgreSQL after rollback in dry-run mode
        post_users = (await session.execute(select(func.count(User.id)))).scalar_one()
        post_lines = (await session.execute(select(func.count(ProjectLine.id)))).scalar_one()
        post_joints = (await session.execute(select(func.count(WeldJoint.id)))).scalar_one()

        assert post_users == init_users
        assert post_lines == init_lines
        assert post_joints == init_joints


@pytest.mark.asyncio
async def test_migration_safe_password_generation_and_export_isolation(tmp_path: Path):
    sqlite_path = tmp_path / "test_creds.sqlite"
    quarantine_path = tmp_path / "quarantine.json"
    creds_export_path = tmp_path / "creds.json"
    _create_sample_legacy_sqlite(sqlite_path)

    async with _session_factory() as session:
        report = await migrate_sqlite_to_postgres(
            sqlite_path=sqlite_path,
            session=session,
            quarantine_report_path=quarantine_path,
            credentials_export_path=creds_export_path,
            dry_run=True,
        )

        # 1. Verify report accounts have must_change_password=True and no passwords leaked
        assert len(report.migrated_users_info) == 2
        for user_info in report.migrated_users_info:
            assert user_info["must_change_password"] is True
            assert "password" not in user_info
            assert "temporary_password" not in user_info

        # 2. Verify quarantine json file does NOT contain any temporary passwords
        assert quarantine_path.exists()
        quarantine_content = quarantine_path.read_text(encoding="utf-8")
        assert "OldPlainPassword456!" not in quarantine_content
        assert "temporary_password" not in quarantine_content

        # 3. Verify credentials export file DOES contain temporary passwords
        assert creds_export_path.exists()
        creds_json = json.loads(creds_export_path.read_text(encoding="utf-8"))
        assert "users" in creds_json
        assert len(creds_json["users"]) == 2
        for u in creds_json["users"]:
            assert len(u["temporary_password"]) >= 16
            assert u["must_change_password"] is True


@pytest.mark.asyncio
async def test_migration_duplicate_quarantine_identification(tmp_path: Path):
    sqlite_path = tmp_path / "test_dups.sqlite"
    quarantine_path = tmp_path / "quarantine.json"
    _create_sample_legacy_sqlite(sqlite_path)

    async with _session_factory() as session:
        report = await migrate_sqlite_to_postgres(
            sqlite_path=sqlite_path,
            session=session,
            quarantine_report_path=quarantine_path,
            dry_run=True,
        )

        assert len(report.quarantined_duplicates) == 1
        quarantined = report.quarantined_duplicates[0]
        assert quarantined["joint_number"] == "J-01"
        assert quarantined["unique_line_id"] == "200-L1"
        assert quarantined["original_joint_id"] == "joint-v1"
        assert quarantined["kept_joint_id"] == "joint-v2"
        assert "Дубликат" in quarantined["reason"]
