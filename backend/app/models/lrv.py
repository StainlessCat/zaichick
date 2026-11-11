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
from app.models.enums import (
    LrvElementCategoryEnum,
    LrvStatusEnum,
    LrvUnitEnum,
    pg_enum,
)

if TYPE_CHECKING:
    from app.models.facility import Facility


class LrvItem(Base):
    """LRV Catalog specification item scoped strictly to RD code (Шифр РД)."""

    __tablename__ = "lrv_items"
    __table_args__ = (
        UniqueConstraint("rd_code", "lrv_code", name="uq_lrv_rd_code_lrv_code"),
        CheckConstraint("diameter_mm >= 0", name="diameter_non_negative"),
        CheckConstraint("wall_thickness >= 0", name="wall_thickness_non_negative"),
        CheckConstraint("spec_qty >= 0", name="spec_qty_non_negative"),
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

    lrv_code: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    rd_code: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    object_name: Mapped[str] = mapped_column(String(255), nullable=False)
    short_name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[LrvElementCategoryEnum | None] = mapped_column(
        pg_enum(LrvElementCategoryEnum, "lrv_category_enum"), nullable=True
    )
    connection_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    material: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    ntd: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    manufacturer: Mapped[str | None] = mapped_column(String(255), nullable=True)

    dn1: Mapped[int | None] = mapped_column(Integer, nullable=True)
    diameter_mm: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    wall_thickness: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    dn2: Mapped[int | None] = mapped_column(Integer, nullable=True)
    diameter_mm2: Mapped[float | None] = mapped_column(Float, nullable=True)
    wall_thickness2: Mapped[float | None] = mapped_column(Float, nullable=True)

    spec_qty: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    unit: Mapped[LrvUnitEnum] = mapped_column(
        pg_enum(LrvUnitEnum, "lrv_unit_enum"), nullable=False, default=LrvUnitEnum.PCS
    )
    status: Mapped[LrvStatusEnum] = mapped_column(
        pg_enum(LrvStatusEnum, "lrv_status_enum"),
        nullable=False,
        default=LrvStatusEnum.ACTIVE,
        index=True,
    )
    replacement_letter: Mapped[str | None] = mapped_column(String(512), nullable=True)
    replacement_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    facility: Mapped[Facility] = relationship(back_populates="lrv_items")
