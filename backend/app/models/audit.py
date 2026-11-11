from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AuditLog(Base):
    """Append-only server-side Audit Trail (INSERT & SELECT only; immutable at DB trigger level)."""

    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_entity_lookup", "entity_type", "entity_id", "timestamp"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    user_login: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    user_full_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    user_role: Mapped[str] = mapped_column(String(32), nullable=False, default="")

    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)

    old_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    new_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(INET, nullable=True)

    # Display/filter context for UI compatibility
    joint_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    unique_line_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rd_code: Mapped[str | None] = mapped_column(String(255), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
