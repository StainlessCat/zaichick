from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import ExecutiveDocStatusEnum, pg_enum

if TYPE_CHECKING:
    from app.models.line import ProjectLine


class ExecutiveDoc(Base):
    """Executive documentation (Исполнительная документация) tracking record 1:1 with ProjectLine."""

    __tablename__ = "executive_docs"
    __table_args__ = (
        CheckConstraint(
            "priority IS NULL OR (priority >= 1 AND priority <= 99)",
            name="ck_executive_docs_priority_range",
        ),
        CheckConstraint(
            "pre_stage_status IN ('SIGNED', 'NOT_SIGNED')",
            name="ck_executive_docs_pre_stage_status",
        ),
        CheckConstraint(
            "physics_status IN ('ACCEPTED', 'NOT_ACCEPTED')",
            name="ck_executive_docs_physics_status",
        ),
        CheckConstraint(
            "geodesy_status IN ('SIGNED', 'NOT_SIGNED', 'NOT_REQUIRED')",
            name="ck_executive_docs_geodesy_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    line_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_lines.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    priority: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    id_status: Mapped[ExecutiveDocStatusEnum] = mapped_column(
        pg_enum(ExecutiveDocStatusEnum, "executive_doc_status_enum"),
        nullable=False,
        default=ExecutiveDocStatusEnum.IN_WORK,
        server_default=ExecutiveDocStatusEnum.IN_WORK.value,
    )
    work_producer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pto_engineer: Mapped[str | None] = mapped_column(String(255), nullable=True)

    pre_stage_status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="NOT_SIGNED", server_default="NOT_SIGNED"
    )
    physics_status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="NOT_ACCEPTED", server_default="NOT_ACCEPTED"
    )
    geodesy_status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="NOT_SIGNED", server_default="NOT_SIGNED"
    )

    note_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    note_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
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

    line: Mapped[ProjectLine] = relationship()
