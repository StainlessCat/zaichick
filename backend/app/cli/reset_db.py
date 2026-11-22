"""Server-only CLI for full database reset with mandatory pre-reset pg_dump backup.

Usage:
    python -m app.cli.reset_db --confirm
"""
from __future__ import annotations

import argparse
import asyncio
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import async_session_factory, verify_postgres_connection

RESET_TABLES: tuple[str, ...] = (
    "weld_joints",
    "ndt_lab_requests",
    "project_lines",
    "lrv_items",
    "facility_rd_codes",
    "custom_weather_stations",
    "facilities",
    "welder_naks_certs",
    "welders",
    "tech_card_preheat_rules",
    "tech_cards",
    "welding_materials",
    "inspectors",
    "column_templates",
    "app_settings",
)


def normalize_pg_dump_url(database_url: str) -> str:
    """Convert SQLAlchemy asyncpg URL (postgresql+asyncpg://) to libpq URL (postgresql://)."""
    cleaned = database_url.strip()
    if cleaned.startswith("postgresql+asyncpg://"):
        return "postgresql://" + cleaned[len("postgresql+asyncpg://") :]
    if cleaned.startswith("postgresql+psycopg://"):
        return "postgresql://" + cleaned[len("postgresql+psycopg://") :]
    if cleaned.startswith("postgres+asyncpg://"):
        return "postgresql://" + cleaned[len("postgres+asyncpg://") :]
    return cleaned


def run_pg_dump_backup(
    database_url: str,
    backups_dir: Path | None = None,
    *,
    now: datetime | None = None,
) -> Path:
    """
    Execute pg_dump into backups/ with UTC timestamp.
    Raises RuntimeError if pg_dump fails or produces an empty/missing file.
    """
    ts = (now or datetime.now(timezone.utc)).strftime("%Y%m%d_%H%M%S")
    target_dir = backups_dir or Path("backups")
    target_dir.mkdir(parents=True, exist_ok=True)
    dump_path = target_dir / f"zaychick_pre_reset_{ts}.sql"

    pg_url = normalize_pg_dump_url(database_url)
    parsed = urlparse(pg_url)
    env = os.environ.copy()
    if parsed.password:
        env["PGPASSWORD"] = parsed.password

    cmd = [
        "pg_dump",
        "--dbname",
        pg_url,
        "--format=plain",
        "--no-owner",
        "--no-privileges",
        "--file",
        str(dump_path),
    ]

    try:
        completed = subprocess.run(
            cmd,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(
            "Утилита pg_dump не найдена в PATH. Сброс базы отменён для предотвращения потери данных."
        ) from exc

    if completed.returncode != 0:
        if dump_path.exists():
            try:
                dump_path.unlink()
            except OSError:
                pass
        stderr_msg = (completed.stderr or completed.stdout or "").strip()
        raise RuntimeError(
            f"Ошибка pg_dump (код {completed.returncode}): {stderr_msg or 'неизвестная ошибка'}. "
            "Очистка базы данных отменена."
        )

    if not dump_path.exists() or dump_path.stat().st_size == 0:
        raise RuntimeError(
            f"Файл дампа {dump_path} не создан или пуст. Очистка базы данных отменена."
        )

    return dump_path


def create_mandatory_pg_dump_backup(
    backups_dir: Path | None = None,
    database_url: str | None = None,
) -> Path:
    """Wrapper alias for run_pg_dump_backup using application settings."""
    db_url = database_url or get_settings().database_url
    return run_pg_dump_backup(db_url, backups_dir=backups_dir)


async def truncate_domain_tables(
    session: AsyncSession,
    *,
    include_users: bool = False,
) -> list[str]:
    """Truncate operational domain tables in PostgreSQL (preserving audit_logs immutability)."""
    tables = list(RESET_TABLES)
    if include_users:
        tables.append("users")
    sql = f"TRUNCATE TABLE {', '.join(tables)} RESTART IDENTITY CASCADE"
    await session.execute(text(sql))
    await session.commit()
    return tables


async def execute_reset_db(
    *,
    confirm: bool,
    database_url: str | None = None,
    backups_dir: Path | None = None,
    include_users: bool = False,
    session: AsyncSession | None = None,
) -> dict[str, object]:
    """
    Safe full-instance reset:
    1. Requires explicit confirm=True (--confirm).
    2. Runs pg_dump into backups/ and verifies the dump file exists and is non-empty.
    3. Only after backup succeeds, truncates domain tables.
    """
    if not confirm:
        raise ValueError(
            "Операция сброса требует явного флага --confirm. База данных не изменена."
        )

    db_url = database_url or get_settings().database_url
    dump_path = run_pg_dump_backup(db_url, backups_dir=backups_dir)

    if session is not None:
        cleared = await truncate_domain_tables(session, include_users=include_users)
    else:
        await verify_postgres_connection()
        async with async_session_factory() as own_session:
            cleared = await truncate_domain_tables(own_session, include_users=include_users)

    return {
        "status": "ok",
        "backup_file": str(dump_path),
        "backup_bytes": dump_path.stat().st_size,
        "cleared_tables": cleared,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m app.cli.reset_db",
        description="Безопасный серверный сброс базы данных ZAYCHICK 2.0 с обязательным pg_dump.",
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Обязательное подтверждение выполнения сброса после создания резервного дампа.",
    )
    parser.add_argument(
        "--backups-dir",
        type=Path,
        default=Path("backups"),
        help="Каталог для сохранения дампа pg_dump (по умолчанию: backups/).",
    )
    parser.add_argument(
        "--include-users",
        action="store_true",
        help="Также очистить таблицу users (по умолчанию учётные записи сохраняются).",
    )
    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not args.confirm:
        print(
            "[ОТМЕНА] Укажите флаг --confirm для выполнения сброса БД. "
            "Перед очисткой автоматически будет снят дамп pg_dump в backups/.",
            file=sys.stderr,
        )
        raise SystemExit(2)

    try:
        result = asyncio.run(
            execute_reset_db(
                confirm=True,
                backups_dir=args.backups_dir,
                include_users=args.include_users,
            )
        )
        print(f"[OK] Резервный дамп создан: {result['backup_file']} ({result['backup_bytes']} байт)")
        print(f"[OK] Очищены таблицы: {', '.join(result['cleared_tables'])}")
    except Exception as exc:
        print(f"[ОШИБКА] {exc}", file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
