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
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.line import ProjectLine


class WeatherStation(Base):
    """Reference directory of weather stations in Russia (WMO / NOAA GSOD)."""

    __tablename__ = "weather_stations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    wmo_id: Mapped[str] = mapped_column(
        String(10), unique=True, index=True, nullable=False
    )
    usaf: Mapped[str | None] = mapped_column(String(10), nullable=True)
    wban: Mapped[str | None] = mapped_column(String(10), nullable=True)
    name: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    name_en: Mapped[str | None] = mapped_column(String(255), nullable=True)
    region: Mapped[str | None] = mapped_column(String(255), nullable=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    daily_records: Mapped[list[WeatherDaily]] = relationship(
        back_populates="station", cascade="all, delete-orphan"
    )
    aliases: Mapped[list[WeatherStationAlias]] = relationship(
        back_populates="station", cascade="all, delete-orphan"
    )
    lines: Mapped[list[ProjectLine]] = relationship(back_populates="weather_station_rel")


class WeatherStationAlias(Base):
    """Alias linking small settlements (e.g. villages, towns) to nearby weather stations."""

    __tablename__ = "weather_station_aliases"
    __table_args__ = (
        UniqueConstraint("settlement_name", "station_id", name="uq_settlement_station"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    settlement_name: Mapped[str] = mapped_column(
        String(255), index=True, nullable=False
    )
    station_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("weather_stations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    distance_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    station: Mapped[WeatherStation] = relationship(back_populates="aliases")


class WeatherDaily(Base):
    """Daily temperature cache (t_min, t_max, t_mean in Celsius) by weather station."""

    __tablename__ = "weather_daily"
    __table_args__ = (
        UniqueConstraint("station_id", "obs_date", name="uq_station_obs_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    station_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("weather_stations.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    obs_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    t_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    t_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    t_mean: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(30), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    station: Mapped[WeatherStation] = relationship(back_populates="daily_records")


class SiteWeatherDaily(Base):
    """Daily temperature archive by rounded site coordinates (~5 km grid, Open-Meteo / local)."""

    __tablename__ = "site_weather_daily"
    __table_args__ = (
        UniqueConstraint("coord_key", "obs_date", name="uq_site_weather_coord_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    coord_key: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    obs_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    t_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    t_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    t_mean: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
