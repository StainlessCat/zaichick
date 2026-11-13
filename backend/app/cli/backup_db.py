from __future__ import annotations

import argparse
import asyncio
import enum
import gzip
import hashlib
import json
import logging
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import async_session_factory, verify_postgres_connection
from app.models.audit import AuditLog
from app.models.facility import CustomWeatherStation, Facility, FacilityRdCode
from app.models.joint import WeldJoint
from app.models.line import ProjectLine
from app.models.lrv import LrvItem
from app.models.settings import AppSetting, ColumnTemplate
from app.models.user import User
from app.models.welding_tech import (
    TechCard,
    TechCardPreheatRule,
    Welder,
    WelderNaksCert,
    WeldingMaterial,
)

logger = logging.getLogger(__name__)

# Topological order respecting foreign-key constraints
TABLE_MODELS = [
    User,
    Facility,
    FacilityRdCode,
    CustomWeatherStation,
    ProjectLine,
    LrvItem,
    TechCard,
    TechCardPreheatRule,
    Welder,
    WelderNaksCert,
    WeldingMaterial,
    WeldJoint,
    ColumnTemplate,
    AppSetting,
    AuditLog,
]


def _row_to_dict(obj: Any) -> dict[str, Any]:
    res: dict[str, Any] = {}
    for col in obj.__class__.__mapper__.column_attrs:
        val = getattr(obj, col.key)
        if hasattr(val, "value"):  # Enum
            res[col.key] = val.value
        elif isinstance(val, (datetime, )):
            res[col.key] = val.isoformat()
        elif hasattr(val, "isoformat"):  # date
            res[col.key] = val.isoformat()
        elif hasattr(val, "hex"):  # UUID
            res[col.key] = str(val)
        elif hasattr(val, "exploded"):  # ipaddress IPv4/IPv6
            res[col.key] = str(val)
        else:
            res[col.key] = val
    return res


def compute_sha256(filepath: Path) -> str:
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


async def create_backup(
    session: AsyncSession,
    output_path: Path | None = None,
) -> tuple[Path, Path, dict[str, Any]]:
    now = datetime.now(timezone.utc)
    settings = get_settings()

    if output_path is None:
        backup_dir = Path("backups")
        backup_dir.mkdir(parents=True, exist_ok=True)
        filename = f"zaychick_backup_{now.strftime('%Y%m%d_%H%M%S')}.json.gz"
        output_path = backup_dir / filename
    else:
        output_path.parent.mkdir(parents=True, exist_ok=True)

    backup_data: dict[str, list[dict[str, Any]]] = {}
    stats: dict[str, int] = {}

    for model_cls in TABLE_MODELS:
        table_name = model_cls.__tablename__
        stmt = select(model_cls)
        # Order by id or primary key
        if hasattr(model_cls, "id"):
            stmt = stmt.order_by(model_cls.id)
        rows = list((await session.execute(stmt)).scalars().all())
        backup_data[table_name] = [_row_to_dict(r) for r in rows]
        stats[table_name] = len(rows)

    manifest = {
        "app_name": settings.app_name,
        "app_version": settings.app_version,
        "created_at": now.isoformat(),
        "total_records": sum(stats.values()),
        "tables": stats,
    }

    payload = {
        "manifest": manifest,
        "data": backup_data,
    }

    serialized = json.dumps(payload, ensure_ascii=False, indent=2)
    with gzip.open(output_path, "wt", encoding="utf-8") as gz_file:
        gz_file.write(serialized)

    checksum = compute_sha256(output_path)
    checksum_path = output_path.with_name(f"{output_path.name}.sha256")
    checksum_path.write_text(f"{checksum}  {output_path.name}\n", encoding="utf-8")

    return output_path, checksum_path, manifest


def verify_backup(backup_path: Path) -> dict[str, Any]:
    if not backup_path.exists():
        raise FileNotFoundError(f"Backup file not found: {backup_path}")

    checksum_path = backup_path.with_name(f"{backup_path.name}.sha256")
    if checksum_path.exists():
        expected = checksum_path.read_text(encoding="utf-8").split()[0].strip()
        actual = compute_sha256(backup_path)
        if expected.lower() != actual.lower():
            raise ValueError(
                f"Checksum mismatch! Expected: {expected}, Actual: {actual}. Archive may be corrupted."
            )

    with gzip.open(backup_path, "rt", encoding="utf-8") as gz_file:
        payload = json.load(gz_file)

    manifest = payload.get("manifest", {})
    data = payload.get("data", {})

    for tbl, count in manifest.get("tables", {}).items():
        actual_count = len(data.get(tbl, []))
        if count != actual_count:
            raise ValueError(f"Table '{tbl}' record count mismatch: {actual_count} vs {count}")

    return manifest


def _coerce_record_types(model_cls: Any, raw: dict[str, Any]) -> dict[str, Any]:
    coerced: dict[str, Any] = {}
    col_map = {col.key: col for col in model_cls.__mapper__.column_attrs}
    for k, v in raw.items():
        col = col_map.get(k)
        if col is None or v is None:
            coerced[k] = v
            continue
        col_type = col.columns[0].type if getattr(col, "columns", None) else None
        try:
            py_type = getattr(col_type, "python_type", None)
        except (NotImplementedError, AttributeError, Exception):
            py_type = None
        if py_type is None:
            coerced[k] = v
            continue
        try:
            if issubclass(py_type, datetime) and isinstance(v, str):
                coerced[k] = datetime.fromisoformat(v)
            elif issubclass(py_type, date) and isinstance(v, str):
                coerced[k] = date.fromisoformat(v)
            elif issubclass(py_type, uuid.UUID) and isinstance(v, str):
                coerced[k] = uuid.UUID(v)
            elif issubclass(py_type, enum.Enum) and isinstance(v, str):
                coerced[k] = py_type(v)
            elif issubclass(py_type, float) and not isinstance(v, float):
                coerced[k] = float(v)
            elif issubclass(py_type, int) and not isinstance(v, int):
                coerced[k] = int(v)
            elif issubclass(py_type, bool) and not isinstance(v, bool):
                coerced[k] = bool(v)
            else:
                coerced[k] = v
        except Exception:
            coerced[k] = v
    return coerced


async def restore_backup(
    session: AsyncSession,
    backup_path: Path,
    *,
    verify_checksum: bool = True,
) -> dict[str, Any]:
    manifest = verify_backup(backup_path) if verify_checksum else {}

    with gzip.open(backup_path, "rt", encoding="utf-8") as gz_file:
        payload = json.load(gz_file)

    manifest = payload.get("manifest", manifest)
    data = payload.get("data", {})

    # Truncate tables in reverse topological order
    reverse_tables = [m.__tablename__ for m in reversed(TABLE_MODELS)]
    truncate_sql = f"TRUNCATE TABLE {', '.join(reverse_tables)} CASCADE"
    await session.execute(text(truncate_sql))

    inserted_stats: dict[str, int] = {}
    for model_cls in TABLE_MODELS:
        table_name = model_cls.__tablename__
        records = data.get(table_name, [])
        for rec in records:
            coerced = _coerce_record_types(model_cls, rec)
            session.add(model_cls(**coerced))
        await session.flush()
        inserted_stats[table_name] = len(records)

    await session.commit()
    return {
        "restored_at": datetime.now(timezone.utc).isoformat(),
        "manifest": manifest,
        "inserted": inserted_stats,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="backup_db",
        description="ZAYCHICK 2.0 PostgreSQL Backup & Restore Utility.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    create_p = subparsers.add_parser("create", help="Create a gzip-compressed backup with SHA-256.")
    create_p.add_argument("--output", type=Path, default=None, help="Output .json.gz file path.")

    verify_p = subparsers.add_parser("verify", help="Verify backup integrity and checksum.")
    verify_p.add_argument("--input", type=Path, required=True, help="Path to .json.gz backup file.")

    restore_p = subparsers.add_parser("restore", help="Restore PostgreSQL from a verified backup.")
    restore_p.add_argument("--input", type=Path, required=True, help="Path to .json.gz backup file.")
    restore_p.add_argument("--no-verify", action="store_true", help="Skip SHA-256 verification.")

    return parser


async def _run(args: argparse.Namespace) -> int:
    await verify_postgres_connection()
    if args.command == "create":
        async with async_session_factory() as session:
            out_file, sum_file, manifest = await create_backup(session, args.output)
            print(f"[OK] Backup created: {out_file} ({out_file.stat().st_size} bytes)")
            print(f"[OK] Checksum file: {sum_file}")
            print(f"[INFO] Total records: {manifest['total_records']}")
            return 0
    elif args.command == "verify":
        manifest = verify_backup(args.input)
        print(f"[OK] Backup verification succeeded: {args.input}")
        print(json.dumps(manifest, ensure_ascii=False, indent=2))
        return 0
    elif args.command == "restore":
        async with async_session_factory() as session:
            res = await restore_backup(
                session, args.input, verify_checksum=not args.no_verify
            )
            print(f"[OK] Database restored successfully from: {args.input}")
            print(json.dumps(res["inserted"], ensure_ascii=False, indent=2))
            return 0
    return 1


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    raise SystemExit(asyncio.run(_run(args)))


if __name__ == "__main__":
    main()
