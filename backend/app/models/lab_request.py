from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class NdtLabRequestModel(Base):
    """NDT Laboratory Request entry (Заявка на неразрушающий контроль от ПТО в ЛНК)."""

    __tablename__ = "ndt_lab_requests"
    __table_args__ = (
        UniqueConstraint("request_number", name="uq_ndt_lab_requests_request_number"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    request_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    created_date: Mapped[str] = mapped_column(String(10), nullable=False)
    created_by: Mapped[str] = mapped_column(String(255), nullable=False)
    object_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    rd_code: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    line_number: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    unique_line_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    contour: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    control_stage: Mapped[str] = mapped_column(
        String(128), nullable=False, default="Первичный ВИК и НК"
    )
    requested_method: Mapped[str] = mapped_column(String(64), nullable=False, default="РК")
    joint_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    status: Mapped[str] = mapped_column(
        String(64), nullable=False, default="Подана ПТО", index=True
    )
    accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    accepted_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
