from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Date,
    DateTime,
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
    CircuitTestStatusEnum,
    RecordStatusEnum,
    SriStatusEnum,
    pg_enum,
)

if TYPE_CHECKING:
    from app.models.facility import Facility
    from app.models.joint import WeldJoint


class TestCircuit(Base):
    """Pipeline hydraulic / pneumatic test circuit (Испытательный контур) linked to a Facility."""

    __tablename__ = "test_circuits"
    __table_args__ = (
        UniqueConstraint("facility_id", "name", name="uq_facility_circuit_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    facility_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("facilities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sri_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sri_status: Mapped[SriStatusEnum] = mapped_column(
        pg_enum(SriStatusEnum, "sri_status_enum"),
        nullable=False,
        default=SriStatusEnum.IN_DEVELOPMENT,
        index=True,
    )
    test_status: Mapped[CircuitTestStatusEnum] = mapped_column(
        pg_enum(CircuitTestStatusEnum, "circuit_test_status_enum"),
        nullable=False,
        default=CircuitTestStatusEnum.NOT_TESTED,
        index=True,
    )
    planned_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    act_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    actual_test_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    record_status: Mapped[RecordStatusEnum] = mapped_column(
        pg_enum(RecordStatusEnum, "record_status_enum"),
        nullable=False,
        default=RecordStatusEnum.DRAFT,
        index=True,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
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

    facility: Mapped[Facility] = relationship(back_populates="test_circuits")
    joints: Mapped[list[WeldJoint]] = relationship(back_populates="test_circuit")
