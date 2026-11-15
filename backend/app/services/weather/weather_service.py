from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import delete, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.weather import WeatherDaily, WeatherStation
from app.services.weather.geo import haversine_distance_km
from app.services.weather.gsod_loader import fetch_gsod_for_station
from app.services.weather.synop_parser import fetch_synop_daily

logger = logging.getLogger(__name__)


async def get_station_by_id(session: AsyncSession, station_id: uuid.UUID) -> WeatherStation | None:
    """Retrieve weather station by primary key UUID."""
    stmt = select(WeatherStation).where(WeatherStation.id == station_id)
    res = await session.execute(stmt)
    return res.scalar_one_or_none()


async def search_weather_stations(
    session: AsyncSession,
    *,
    search: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Search stations by text query or find nearest by geographic coordinates."""
    stmt = select(WeatherStation).where(WeatherStation.is_active.is_(True))

    if search and search.strip():
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                WeatherStation.name.ilike(term),
                WeatherStation.wmo_id.ilike(term),
                WeatherStation.region.ilike(term),
                WeatherStation.usaf.ilike(term),
            )
        )

    res = await session.execute(stmt)
    stations = list(res.scalars().all())

    results: list[dict[str, Any]] = []
    for st in stations:
        dist_km: float | None = None
        if lat is not None and lon is not None:
            dist_km = haversine_distance_km(lat, lon, st.latitude, st.longitude)

        results.append({
            "id": st.id,
            "wmo_id": st.wmo_id,
            "usaf": st.usaf,
            "wban": st.wban,
            "name": st.name,
            "region": st.region,
            "latitude": st.latitude,
            "longitude": st.longitude,
            "is_active": st.is_active,
            "distance_km": dist_km,
        })

    if lat is not None and lon is not None:
        results.sort(key=lambda s: s["distance_km"] if s["distance_km"] is not None else 999999.0)
    else:
        results.sort(key=lambda s: s["name"])

    return results[:limit]


async def upsert_weather_daily_records(
    session: AsyncSession,
    station_id: uuid.UUID,
    records: list[dict[str, Any]],
) -> int:
    """Upsert temperature records into weather_daily on conflict (station_id, obs_date)."""
    if not records:
        return 0

    now = datetime.now(timezone.utc)
    count = 0
    for r in records:
        stmt = pg_insert(WeatherDaily).values(
            id=uuid.uuid4(),
            station_id=station_id,
            obs_date=r["obs_date"],
            t_min=r.get("t_min"),
            t_max=r.get("t_max"),
            t_mean=r.get("t_mean"),
            source=r.get("source", "SYNOP_LIVE"),
            updated_at=now,
        ).on_conflict_do_update(
            constraint="uq_station_obs_date",
            set_={
                "t_min": r.get("t_min"),
                "t_max": r.get("t_max"),
                "t_mean": r.get("t_mean"),
                "source": r.get("source", "SYNOP_LIVE"),
                "updated_at": now,
            },
        )
        await session.execute(stmt)
        count += 1

    await session.commit()
    return count


async def get_or_fetch_daily_weather(
    session: AsyncSession,
    station_id: uuid.UUID,
    date_from: date,
    date_to: date,
) -> list[WeatherDaily]:
    """Retrieve daily temperatures from cache, automatically backfilling missing dates."""
    station = await get_station_by_id(session, station_id)
    if not station:
        return []

    # 1. Fetch existing cached records
    stmt = (
        select(WeatherDaily)
        .where(
            WeatherDaily.station_id == station_id,
            WeatherDaily.obs_date >= date_from,
            WeatherDaily.obs_date <= date_to,
        )
        .order_by(WeatherDaily.obs_date.asc())
    )
    res = await session.execute(stmt)
    cached_records = {r.obs_date: r for r in res.scalars().all()}

    # 2. Check missing dates
    all_dates: list[date] = []
    curr = date_from
    while curr <= date_to:
        all_dates.append(curr)
        curr += timedelta(days=1)

    today = date.today()
    synop_threshold = today - timedelta(days=3)

    missing_synop_dates = [d for d in all_dates if d >= synop_threshold and d not in cached_records]
    # For today, always try to refresh if cached more than 3 hours ago or if only few readings
    if today in cached_records and today >= date_from:
        cached_today = cached_records[today]
        if cached_today.updated_at:
            age = (datetime.now(timezone.utc) - cached_today.updated_at).total_seconds()
            if age > 10800:  # 3 hours
                missing_synop_dates.append(today)
    elif today in all_dates and today not in missing_synop_dates:
        missing_synop_dates.append(today)

    missing_archive_dates = [d for d in all_dates if d < synop_threshold and d not in cached_records]

    new_records: list[dict[str, Any]] = []

    # 3. Backfill via SYNOP for recent / today dates
    if missing_synop_dates and station.wmo_id:
        synop_from = min(missing_synop_dates)
        synop_to = max(missing_synop_dates)
        synop_data = await fetch_synop_daily(station.wmo_id, synop_from, synop_to)
        new_records.extend(synop_data)

    # 4. Backfill via NOAA GSOD for historical dates
    if missing_archive_dates:
        years = {d.year for d in missing_archive_dates}
        usaf_code = station.usaf or (station.wmo_id + "0" if len(station.wmo_id) == 5 else station.wmo_id)
        wban_code = station.wban or "99999"
        for yr in years:
            gsod_data = await fetch_gsod_for_station(usaf_code, wban_code, yr)
            wanted_dates = set(missing_archive_dates)
            for item in gsod_data:
                if item["obs_date"] in wanted_dates:
                    new_records.append(item)

    # 5. Persist fetched records into database
    if new_records:
        await upsert_weather_daily_records(session, station_id, new_records)

    # 6. Re-query full sorted series
    res_final = await session.execute(stmt)
    return list(res_final.scalars().all())


async def refresh_station_weather(
    session: AsyncSession,
    station_id: uuid.UUID,
    days: int = 3,
) -> dict[str, Any]:
    """Force refresh of current / recent temperatures for a station via SYNOP."""
    station = await get_station_by_id(session, station_id)
    if not station:
        raise ValueError(f"Метеостанция с ID '{station_id}' не найдена.")

    today = date.today()
    date_from = today - timedelta(days=days)

    synop_records = await fetch_synop_daily(station.wmo_id, date_from, today)
    saved_count = await upsert_weather_daily_records(session, station_id, synop_records)

    latest_date: date | None = None
    latest_t_mean: float | None = None
    if synop_records:
        latest = sorted(synop_records, key=lambda r: r["obs_date"])[-1]
        latest_date = latest["obs_date"]
        latest_t_mean = latest["t_mean"]

    return {
        "station_id": station_id,
        "status": "ok",
        "refreshed_count": saved_count,
        "latest_date": latest_date,
        "latest_t_mean": latest_t_mean,
        "updated_at": datetime.now(timezone.utc),
    }
