from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.weather import SiteWeatherDaily, WeatherDaily, WeatherStation, WeatherStationAlias
from app.services.weather.geo import haversine_distance_km
from app.services.weather.gsod_loader import fetch_gsod_for_station
from app.services.weather.open_meteo_loader import (
    fetch_open_meteo_archive,
    fetch_open_meteo_recent,
)
from app.services.weather.reference_stations import get_deterministic_station_uuid
from app.services.weather.synop_parser import fetch_synop_daily

logger = logging.getLogger(__name__)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_USER_AGENT = "ZAYCHICK-Welding-QC/2.0 (contact: pto-support@zaychick.app)"


async def geocode_settlement_nominatim(
    search_query: str,
    timeout: float = 6.0,
) -> tuple[float, float, str] | None:
    """Geocode settlement in Russia using OpenStreetMap Nominatim."""
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(
                NOMINATIM_URL,
                params={
                    "q": search_query.strip(),
                    "countrycodes": "ru",
                    "format": "json",
                    "limit": 1,
                },
                headers={
                    "User-Agent": NOMINATIM_USER_AGENT,
                    "Accept-Language": "ru",
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list) and len(data) > 0:
                    first = data[0]
                    lat = float(first["lat"])
                    lon = float(first["lon"])
                    display_name = first.get("display_name", search_query.strip())
                    return lat, lon, display_name
    except Exception as exc:
        logger.warning("Nominatim geocoding failed for %r: %s", search_query, exc)
    return None


async def get_station_by_id(
    session: AsyncSession, station_id: uuid.UUID | str
) -> WeatherStation | None:
    """Retrieve weather station by primary key UUID, deterministic UUID5, or WMO ID / pseudo-ID."""
    if isinstance(station_id, str):
        station_id_str = station_id.strip()
        # 1. Direct UUID
        try:
            parsed_uuid = uuid.UUID(station_id_str)
            stmt = select(WeatherStation).where(WeatherStation.id == parsed_uuid)
            res = await session.execute(stmt)
            found = res.scalar_one_or_none()
            if found:
                return found
        except (ValueError, AttributeError):
            pass

        # 2. WMO code (strip 'st-' if present, e.g. 'st-30528' -> '30528')
        clean_wmo = station_id_str[3:] if station_id_str.startswith("st-") else station_id_str
        stmt = select(WeatherStation).where(
            (WeatherStation.wmo_id == clean_wmo) | (WeatherStation.usaf == clean_wmo)
        )
        res = await session.execute(stmt)
        found = res.scalar_one_or_none()
        if found:
            return found

        # 3. Deterministic UUID5
        uuid5_id = get_deterministic_station_uuid(clean_wmo)
        stmt = select(WeatherStation).where(WeatherStation.id == uuid5_id)
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    stmt = select(WeatherStation).where(WeatherStation.id == station_id)
    res = await session.execute(stmt)
    return res.scalar_one_or_none()


async def save_or_update_station_alias(
    session: AsyncSession,
    settlement_name: str,
    station_id: uuid.UUID,
    distance_km: float | None = None,
) -> WeatherStationAlias:
    """Save or update settlement alias link to a weather station."""
    clean_name = settlement_name.strip()
    stmt = select(WeatherStationAlias).where(
        WeatherStationAlias.settlement_name == clean_name,
        WeatherStationAlias.station_id == station_id,
    )
    res = await session.execute(stmt)
    existing = res.scalar_one_or_none()
    if existing:
        if distance_km is not None:
            existing.distance_km = distance_km
        await session.commit()
        await session.refresh(existing)
        return existing

    new_alias = WeatherStationAlias(
        id=uuid.uuid4(),
        settlement_name=clean_name,
        station_id=station_id,
        distance_km=distance_km,
    )
    session.add(new_alias)
    await session.commit()
    await session.refresh(new_alias)
    return new_alias


async def search_weather_stations(
    session: AsyncSession,
    *,
    search: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Search stations by text query or find nearest by geographic coordinates.

    Supports:
    1. Local search across weather_stations (name, name_en, wmo_id, region, usaf)
       and weather_station_aliases (settlement_name).
    2. Fallback to OpenStreetMap Nominatim when local search yields 0 results and len(search) >= 3,
       returning the 3 nearest stations by haversine distance.
    """
    clean_search = search.strip() if search and search.strip() else None

    # --- Phase 1: Local DB search ---
    matched_stations_dict: dict[uuid.UUID, dict[str, Any]] = {}

    if clean_search:
        term = f"%{clean_search}%"

        # 1a. Search in weather_station_aliases
        alias_stmt = (
            select(WeatherStationAlias, WeatherStation)
            .join(WeatherStation, WeatherStationAlias.station_id == WeatherStation.id)
            .where(
                WeatherStation.is_active.is_(True),
                WeatherStationAlias.settlement_name.ilike(term),
            )
        )
        alias_res = await session.execute(alias_stmt)
        alias_rows = alias_res.all() if hasattr(alias_res, "all") else []
        for alias, st in alias_rows:
            dist_km = alias.distance_km
            if dist_km is None and lat is not None and lon is not None:
                dist_km = haversine_distance_km(lat, lon, st.latitude, st.longitude)
            matched_stations_dict[st.id] = {
                "id": st.id,
                "wmo_id": st.wmo_id,
                "usaf": st.usaf,
                "wban": st.wban,
                "name": st.name,
                "name_en": st.name_en,
                "region": st.region,
                "latitude": st.latitude,
                "longitude": st.longitude,
                "is_active": st.is_active,
                "distance_km": dist_km,
                "matched_settlement": alias.settlement_name,
            }

        # 1b. Search directly in weather_stations
        st_stmt = select(WeatherStation).where(
            WeatherStation.is_active.is_(True),
            or_(
                WeatherStation.name.ilike(term),
                WeatherStation.name_en.ilike(term),
                WeatherStation.wmo_id.ilike(term),
                WeatherStation.region.ilike(term),
                WeatherStation.usaf.ilike(term),
            ),
        )
        st_res = await session.execute(st_stmt)
        for st in st_res.scalars().all():
            if st.id not in matched_stations_dict:
                dist_km = None
                if lat is not None and lon is not None:
                    dist_km = haversine_distance_km(lat, lon, st.latitude, st.longitude)
                matched_stations_dict[st.id] = {
                    "id": st.id,
                    "wmo_id": st.wmo_id,
                    "usaf": st.usaf,
                    "wban": st.wban,
                    "name": st.name,
                    "name_en": st.name_en,
                    "region": st.region,
                    "latitude": st.latitude,
                    "longitude": st.longitude,
                    "is_active": st.is_active,
                    "distance_km": dist_km,
                    "matched_settlement": None,
                }
    elif lat is not None and lon is not None:
        # Geographic query without search text
        all_st_stmt = select(WeatherStation).where(WeatherStation.is_active.is_(True))
        all_res = await session.execute(all_st_stmt)
        for st in all_res.scalars().all():
            dist_km = haversine_distance_km(lat, lon, st.latitude, st.longitude)
            matched_stations_dict[st.id] = {
                "id": st.id,
                "wmo_id": st.wmo_id,
                "usaf": st.usaf,
                "wban": st.wban,
                "name": st.name,
                "name_en": st.name_en,
                "region": st.region,
                "latitude": st.latitude,
                "longitude": st.longitude,
                "is_active": st.is_active,
                "distance_km": dist_km,
                "matched_settlement": None,
            }
    else:
        # Default list
        all_st_stmt = select(WeatherStation).where(WeatherStation.is_active.is_(True))
        all_res = await session.execute(all_st_stmt)
        for st in all_res.scalars().all():
            matched_stations_dict[st.id] = {
                "id": st.id,
                "wmo_id": st.wmo_id,
                "usaf": st.usaf,
                "wban": st.wban,
                "name": st.name,
                "name_en": st.name_en,
                "region": st.region,
                "latitude": st.latitude,
                "longitude": st.longitude,
                "is_active": st.is_active,
                "distance_km": None,
                "matched_settlement": None,
            }

    # --- Phase 2: If 0 results and search >= 3 chars, query OpenStreetMap Nominatim ---
    if not matched_stations_dict and clean_search and len(clean_search) >= 3:
        geo = await geocode_settlement_nominatim(clean_search)
        if geo:
            geo_lat, geo_lon, _ = geo
            all_st_stmt = select(WeatherStation).where(WeatherStation.is_active.is_(True))
            all_res = await session.execute(all_st_stmt)
            stations_with_dist: list[dict[str, Any]] = []
            for st in all_res.scalars().all():
                dist_km = haversine_distance_km(geo_lat, geo_lon, st.latitude, st.longitude)
                stations_with_dist.append({
                    "id": st.id,
                    "wmo_id": st.wmo_id,
                    "usaf": st.usaf,
                    "wban": st.wban,
                    "name": st.name,
                    "name_en": st.name_en,
                    "region": st.region,
                    "latitude": st.latitude,
                    "longitude": st.longitude,
                    "is_active": st.is_active,
                    "distance_km": dist_km,
                    "matched_settlement": clean_search,
                })
            stations_with_dist.sort(key=lambda s: s["distance_km"])
            return stations_with_dist[:3]

    results = list(matched_stations_dict.values())
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
    station_id: uuid.UUID | str,
    date_from: date,
    date_to: date,
) -> list[WeatherDaily]:
    """Retrieve daily temperatures from cache, automatically backfilling missing dates."""
    station = await get_station_by_id(session, station_id)
    if not station:
        return []

    canonical_id = station.id

    # 1. Fetch existing cached records
    stmt = (
        select(WeatherDaily)
        .where(
            WeatherDaily.station_id == canonical_id,
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
        await upsert_weather_daily_records(session, canonical_id, new_records)

    # 6. Re-query full sorted series
    res_final = await session.execute(stmt)
    return list(res_final.scalars().all())


async def refresh_station_weather(
    session: AsyncSession,
    station_id: uuid.UUID | str,
    days: int = 3,
) -> dict[str, Any]:
    """Force refresh of current / recent temperatures for a station via SYNOP."""
    station = await get_station_by_id(session, station_id)
    if not station:
        raise ValueError(f"Метеостанция с ID '{station_id}' не найдена.")

    today = date.today()
    date_from = today - timedelta(days=days)

    synop_records = await fetch_synop_daily(station.wmo_id, date_from, today)
    saved_count = await upsert_weather_daily_records(session, station.id, synop_records)

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


def make_coord_key(latitude: float, longitude: float) -> str:
    """Round coordinates to 0.05 deg (~5 km grid) for shared site weather caching."""
    lat_r = round(round(latitude / 0.05) * 0.05, 2)
    lon_r = round(round(longitude / 0.05) * 0.05, 2)
    return f"{lat_r:.2f}_{lon_r:.2f}"


async def upsert_site_weather_records(
    session: AsyncSession,
    coord_key: str,
    latitude: float,
    longitude: float,
    records: list[dict[str, Any]],
) -> int:
    """Upsert coordinate-based daily temperature records into site_weather_daily."""
    if not records:
        return 0

    now_utc = datetime.now(timezone.utc)
    count = 0
    for rec in records:
        obs_date = rec.get("obs_date")
        if not obs_date:
            continue
        stmt = pg_insert(SiteWeatherDaily).values(
            id=uuid.uuid4(),
            coord_key=coord_key,
            latitude=round(latitude, 4),
            longitude=round(longitude, 4),
            obs_date=obs_date,
            t_min=rec.get("t_min"),
            t_max=rec.get("t_max"),
            t_mean=rec.get("t_mean"),
            source=rec.get("source", "OPEN_METEO_LIVE"),
            updated_at=now_utc,
        )
        stmt = stmt.on_conflict_do_update(
            constraint="uq_site_weather_coord_date",
            set_={
                "t_min": stmt.excluded.t_min,
                "t_max": stmt.excluded.t_max,
                "t_mean": stmt.excluded.t_mean,
                "source": stmt.excluded.source,
                "updated_at": now_utc,
            },
        )
        await session.execute(stmt)
        count += 1

    await session.commit()
    return count


async def get_or_fetch_site_weather(
    session: AsyncSession,
    latitude: float,
    longitude: float,
    date_from: date,
    date_to: date,
) -> list[SiteWeatherDaily]:
    """Retrieve site daily temperatures from own DB archive, backfilling via Open-Meteo."""
    coord_key = make_coord_key(latitude, longitude)
    today = date.today()
    effective_to = min(date_to, today)
    if date_from > effective_to:
        return []

    stmt = (
        select(SiteWeatherDaily)
        .where(
            SiteWeatherDaily.coord_key == coord_key,
            SiteWeatherDaily.obs_date >= date_from,
            SiteWeatherDaily.obs_date <= effective_to,
        )
        .order_by(SiteWeatherDaily.obs_date.asc())
    )
    res = await session.execute(stmt)
    cached_records = {r.obs_date: r for r in res.scalars().all()}

    all_dates: list[date] = []
    curr = date_from
    while curr <= effective_to:
        all_dates.append(curr)
        curr += timedelta(days=1)

    recent_threshold = today - timedelta(days=7)
    missing_recent = [d for d in all_dates if d >= recent_threshold and d not in cached_records]

    if today in cached_records and today >= date_from:
        cached_today = cached_records[today]
        if cached_today.updated_at:
            age = (datetime.now(timezone.utc) - cached_today.updated_at).total_seconds()
            if age > 10800:
                missing_recent.append(today)

    missing_archive = [d for d in all_dates if d < recent_threshold and d not in cached_records]

    new_records: list[dict[str, Any]] = []
    if missing_recent:
        recent_data = await fetch_open_meteo_recent(latitude, longitude, past_days=7)
        wanted_recent = set(missing_recent)
        for item in recent_data:
            if item["obs_date"] in wanted_recent:
                new_records.append(item)

    if missing_archive:
        archive_data = await fetch_open_meteo_archive(
            latitude,
            longitude,
            min(missing_archive),
            max(missing_archive),
        )
        wanted_archive = set(missing_archive)
        for item in archive_data:
            if item["obs_date"] in wanted_archive:
                new_records.append(item)

    if new_records:
        await upsert_site_weather_records(
            session,
            coord_key,
            latitude,
            longitude,
            new_records,
        )

    res_final = await session.execute(stmt)
    return list(res_final.scalars().all())


async def refresh_site_weather(
    session: AsyncSession,
    latitude: float,
    longitude: float,
    *,
    past_days: int = 2,
) -> dict[str, Any]:
    """Force refresh of current and recent temperatures for exact site coordinates."""
    coord_key = make_coord_key(latitude, longitude)
    recent_records = await fetch_open_meteo_recent(latitude, longitude, past_days=past_days)
    saved_count = await upsert_site_weather_records(
        session,
        coord_key,
        latitude,
        longitude,
        recent_records,
    )

    latest_date: date | None = None
    latest_t_mean: float | None = None
    if recent_records:
        latest = sorted(recent_records, key=lambda r: r["obs_date"])[-1]
        latest_date = latest["obs_date"]
        latest_t_mean = latest["t_mean"]

    return {
        "coord_key": coord_key,
        "status": "ok",
        "refreshed_count": saved_count,
        "latest_date": latest_date,
        "latest_t_mean": latest_t_mean,
        "updated_at": datetime.now(timezone.utc),
    }
