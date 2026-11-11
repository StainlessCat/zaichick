from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.user import User

SENSITIVE_AUDIT_KEYS = frozenset({"password", "password_hash", "password_salt", "token"})


def _json_safe_value(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (uuid.UUID,)):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, list):
        return [_json_safe_value(item) for item in value]
    if isinstance(value, dict):
        return {
            str(k): _json_safe_value(v)
            for k, v in value.items()
            if str(k) not in SENSITIVE_AUDIT_KEYS
        }
    if hasattr(value, "value"):
        return value.value
    return str(value)


def sanitize_audit_snapshot(data: dict[str, Any] | None) -> dict[str, Any] | None:
    """Convert snapshot dictionary to JSONB-safe structure stripping sensitive keys."""
    if data is None:
        return None
    return {
        str(k): _json_safe_value(v)
        for k, v in data.items()
        if str(k) not in SENSITIVE_AUDIT_KEYS
    }


def extract_changed_fields(
    old_snapshot: dict[str, Any] | None,
    new_snapshot: dict[str, Any] | None,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """Return minimal (old_diff, new_diff) containing only modified keys."""
    old_clean = sanitize_audit_snapshot(old_snapshot) or {}
    new_clean = sanitize_audit_snapshot(new_snapshot) or {}
    if not old_snapshot and new_snapshot is not None:
        return None, new_clean
    if old_snapshot is not None and not new_snapshot:
        return old_clean, None

    old_diff: dict[str, Any] = {}
    new_diff: dict[str, Any] = {}
    for key in sorted(set(old_clean.keys()) | set(new_clean.keys())):
        old_val = old_clean.get(key)
        new_val = new_clean.get(key)
        if old_val != new_val:
            old_diff[key] = old_val
            new_diff[key] = new_val
    return (old_diff or None), (new_diff or None)


async def record_audit_log(
    session: AsyncSession,
    *,
    action: str,
    entity_type: str,
    entity_id: str | uuid.UUID,
    user: User | None = None,
    user_login_override: str | None = None,
    old_data: dict[str, Any] | None = None,
    new_data: dict[str, Any] | None = None,
    ip_address: str | None = None,
    joint_number: str | None = None,
    unique_line_id: str | None = None,
    rd_code: str | None = None,
    summary: str | None = None,
) -> AuditLog:
    """
    Append an immutable AuditLog entry inside the caller's active SQLAlchemy transaction.
    Client code cannot submit, edit, or delete audit entries directly.
    """
    entry = AuditLog(
        user_id=user.id if user is not None else None,
        user_login=user.login if user is not None else (user_login_override or "anonymous"),
        user_full_name=user.full_name if user is not None else (user_login_override or "Аноним"),
        user_role=user.role.value if user is not None else "ANONYMOUS",
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        old_data=sanitize_audit_snapshot(old_data),
        new_data=sanitize_audit_snapshot(new_data),
        ip_address=ip_address,
        joint_number=joint_number,
        unique_line_id=unique_line_id,
        rd_code=rd_code,
        summary=summary,
    )
    session.add(entry)
    await session.flush()
    return entry


async def list_audit_logs(
    session: AsyncSession,
    *,
    page: int = 1,
    page_size: int = 50,
    action: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    user_login: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> tuple[list[AuditLog], int]:
    """Read-only paginated query against audit_logs (SELECT only)."""
    stmt = select(AuditLog)
    count_stmt = select(func.count(AuditLog.id))

    if action:
        stmt = stmt.where(AuditLog.action == action)
        count_stmt = count_stmt.where(AuditLog.action == action)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
        count_stmt = count_stmt.where(AuditLog.entity_type == entity_type)
    if entity_id:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
        count_stmt = count_stmt.where(AuditLog.entity_id == entity_id)
    if user_login:
        stmt = stmt.where(func.lower(AuditLog.user_login) == user_login.strip().lower())
        count_stmt = count_stmt.where(func.lower(AuditLog.user_login) == user_login.strip().lower())
    if date_from:
        stmt = stmt.where(AuditLog.timestamp >= date_from)
        count_stmt = count_stmt.where(AuditLog.timestamp >= date_from)
    if date_to:
        stmt = stmt.where(AuditLog.timestamp <= date_to)
        count_stmt = count_stmt.where(AuditLog.timestamp <= date_to)

    total = int((await session.execute(count_stmt)).scalar_one() or 0)
    offset = (max(1, page) - 1) * page_size
    rows = (
        await session.execute(
            stmt.order_by(AuditLog.timestamp.desc(), AuditLog.id.desc())
            .offset(offset)
            .limit(page_size)
        )
    ).scalars().all()

    return list(rows), total
