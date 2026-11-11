from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_permission
from app.core.database import get_db_session
from app.models.user import User
from app.schemas.audit import AuditLogItemSchema, AuditLogPageSchema
from app.services.audit_service import list_audit_logs

router = APIRouter(prefix="/api/audit-logs", tags=["audit"])


@router.get("", response_model=AuditLogPageSchema)
async def get_audit_logs(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    action: str | None = Query(default=None),
    entity_type: str | None = Query(default=None),
    entity_id: str | None = Query(default=None),
    user_login: str | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    _user: User = Depends(require_permission("can_view_audit_logs")),
    session: AsyncSession = Depends(get_db_session),
) -> AuditLogPageSchema:
    """Read-only paginated Audit Trail view (server-generated records only; no write API)."""
    rows, total = await list_audit_logs(
        session,
        page=page,
        page_size=page_size,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        user_login=user_login,
        date_from=date_from,
        date_to=date_to,
    )
    return AuditLogPageSchema(
        items=[AuditLogItemSchema.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )
