from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ColumnTemplate(Base):
    """Saved registry column visibility/ordering preset."""

    __tablename__ = "column_templates"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    column_order: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    visible_columns: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    custom_widths: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    is_active_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class AppSetting(Base):
    """Key-value persistent system settings (e.g. active_template_id)."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
