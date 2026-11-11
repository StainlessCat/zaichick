from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from app.core.database import async_session_factory, verify_postgres_connection
from app.services.sqlite_migrator import migrate_sqlite_to_postgres


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="migrate_sqlite",
        description="Idempotent read-only migration from legacy zaychick.sqlite to PostgreSQL.",
    )
    parser.add_argument(
        "--sqlite-path",
        type=Path,
        default=Path("../data/zaychick.sqlite"),
        help="Path to legacy SQLite file (opened strictly read-only).",
    )
    parser.add_argument(
        "--quarantine-report",
        type=Path,
        default=Path("migration_quarantine_report.json"),
        help="Output JSON report path containing quarantined duplicate joints and stats.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run migration logic against DB and roll back transaction without committing.",
    )
    parser.add_argument(
        "--default-password",
        type=str,
        default=None,
        help="Optional fallback password for legacy users missing reversible password entries.",
    )
    return parser


async def _run(args: argparse.Namespace) -> int:
    await verify_postgres_connection()
    async with async_session_factory() as session:
        report = await migrate_sqlite_to_postgres(
            args.sqlite_path,
            session,
            quarantine_report_path=args.quarantine_report,
            dry_run=args.dry_run,
            default_password=args.default_password,
        )
    print(json.dumps(report.to_dict(), ensure_ascii=False, indent=2, default=str))
    return 0


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    raise SystemExit(asyncio.run(_run(args)))


if __name__ == "__main__":
    main()
