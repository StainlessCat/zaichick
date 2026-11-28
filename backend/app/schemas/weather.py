from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class WeatherStationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    wmo_id: str
    usaf: str | None = None
    wban: str | None = None
    name: str
    name_en: str | None = None
    region: str | None = None
    latitude: float
    longitude: float
    is_active: bool = True
    distance_km: float | None = None
    matched_settlement: str | None = None


class WeatherStationAliasCreate(BaseModel):
    settlement_name: str = Field(..., min_length=2, max_length=255)
    station_id: uuid.UUID
    distance_km: float | None = None


class WeatherStationAliasOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    settlement_name: str
    station_id: uuid.UUID
    distance_km: float | None = None
    created_at: datetime


class WeatherDailyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    station_id: uuid.UUID
    obs_date: date
    t_min: float | None = None
    t_max: float | None = None
    t_mean: float | None = None
    source: str
    updated_at: datetime | None = None


class WeatherStationRefreshResponse(BaseModel):
    station_id: uuid.UUID
    status: str
    refreshed_count: int
    latest_date: date | None = None
    latest_t_mean: float | None = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class SiteWeatherDailyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    coord_key: str
    latitude: float
    longitude: float
    obs_date: date
    t_min: float | None = None
    t_max: float | None = None
    t_mean: float | None = None
    source: str
    updated_at: datetime | None = None


class SiteWeatherRefreshResponse(BaseModel):
    coord_key: str
    status: str
    refreshed_count: int
    latest_date: date | None = None
    latest_t_mean: float | None = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class WeatherHealthOut(BaseModel):
    status: str
    source: str
    response_time_ms: int | None = None
    error_message: str | None = None
