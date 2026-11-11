from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.facility import Facility
    from app.models.joint import WeldJoint


class ProjectLine(Base):
    """Pipeline Line List entry (17 domain fields + NDT quotas + row-level OCC version)."""

    __tablename__ = "project_lines"
    __table_args__ = (
        UniqueConstraint("unique_line_id", name="uq_project_lines_unique_line_id"),
        CheckConstraint("rk_percent >= 0 AND rk_percent <= 100", name="rk_percent_range"),
        CheckConstraint("uzk_percent >= 0 AND uzk_percent <= 100", name="uzk_percent_range"),
        CheckConstraint("pvk_percent >= 0 AND pvk_percent <= 100", name="pvk_percent_range"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    legacy_id: Mapped[str | None] = mapped_column(String(128), unique=True, nullable=True)
    facility_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("facilities.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    object_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    rd_code: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    line_number: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    unique_line_id: Mapped[str] = mapped_column(String(255), nullable=False)
    line_name: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    product: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    test_contour: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    welding_ntd: Mapped[str] = mapped_column(
        String(255), nullable=False, default="СТО Газпром 15-1.1-002-2023"
    )
    control_ntd: Mapped[str] = mapped_column(
        String(255), nullable=False, default="СТО Газпром 15-1.1-002-2023"
    )
    quality_level: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    pipeline_category: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    working_pressure: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    working_temperature: Mapped[str] = mapped_column(String(64), nullable=False, default="")

    rk_percent: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    uzk_percent: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    pvk_percent: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    manual_status: Mapped[str | None] = mapped_column(String(255), nullable=True)
    test_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
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

    facility: Mapped[Facility] = relationship(back_populates="lines")
    joints: Mapped[list[WeldJoint]] = relationship(back_populates="line")
