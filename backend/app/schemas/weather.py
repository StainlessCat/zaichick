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
    region: str | None = None
    latitude: float
    longitude: float
    is_active: bool = True
    distance_km: float | None = None


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
