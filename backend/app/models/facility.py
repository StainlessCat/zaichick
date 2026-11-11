from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.line import ProjectLine
    from app.models.lrv import LrvItem


class Facility(Base):
    """Construction facility / industrial site with geospatial and weather station metadata."""

    __tablename__ = "facilities"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    external_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    short_name: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    region: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)

    weather_station: Mapped[str | None] = mapped_column(String(255), nullable=True)
    weather_station_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    weather_station_distance_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    weather_station_source: Mapped[str | None] = mapped_column(String(64), nullable=True)
    weather_last_check_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    weather_last_checked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    weather_last_error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    weather_archive: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    weather_observations: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

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

    rd_codes: Mapped[list[FacilityRdCode]] = relationship(
        back_populates="facility", cascade="all, delete-orphan"
    )
    custom_weather_stations: Mapped[list[CustomWeatherStation]] = relationship(
        back_populates="facility", cascade="all, delete-orphan"
    )
    lines: Mapped[list[ProjectLine]] = relationship(back_populates="facility")
    lrv_items: Mapped[list[LrvItem]] = relationship(back_populates="facility")


class FacilityRdCode(Base):
    """Design documentation code (Шифр РД) and test contours linked to a Facility."""

    __tablename__ = "facility_rd_codes"
    __table_args__ = (
        UniqueConstraint("facility_id", "code", name="uq_facility_rd_code"),
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
    code: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    contours: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)

    facility: Mapped[Facility] = relationship(back_populates="rd_codes")


class CustomWeatherStation(Base):
    """Departmental / site automatic weather station (AMK) attached to a Facility."""

    __tablename__ = "custom_weather_stations"
    __table_args__ = (
        UniqueConstraint("facility_id", "station_code", name="uq_facility_custom_station"),
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
    station_code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    region: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    elevation_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    device_model: Mapped[str | None] = mapped_column(String(255), nullable=True)
    verification_cert_number: Mapped[str | None] = mapped_column(String(255), nullable=True)
    verification_valid_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="custom")
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    facility: Mapped[Facility] = relationship(back_populates="custom_weather_stations")
