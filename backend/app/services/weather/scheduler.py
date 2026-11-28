from __future__ import annotations

import asyncio
import logging
from typing import Any

from sqlalchemy import select

from app.core.database import async_session_factory
from app.models.facility import Facility
from app.models.line import ProjectLine
from app.services.weather.weather_service import (
    make_coord_key,
    refresh_site_weather,
    refresh_station_weather,
)

logger = logging.getLogger(__name__)

REFRESH_INTERVAL_SECONDS = 3 * 3600  # 3 hours


async def refresh_active_stations_weather() -> dict[str, Any]:
    """Find all weather stations linked to project lines and refresh current weather."""
    async with async_session_factory() as session:
        stmt = (
            select(ProjectLine.weather_station_id)
            .where(ProjectLine.weather_station_id.is_not(None))
            .distinct()
        )
        res = await session.execute(stmt)
        station_ids = [sid for sid in res.scalars().all() if sid]

        refreshed_stations: list[dict[str, Any]] = []
        for sid in station_ids:
            try:
                info = await refresh_station_weather(session, sid, days=1)
                refreshed_stations.append(info)
            except Exception as exc:
                logger.warning("Error auto-refreshing weather for station %s: %s", sid, exc)

        # Refresh coordinate-based archive for all facilities with valid coordinates
        fac_stmt = select(Facility.latitude, Facility.longitude).where(
            Facility.latitude.is_not(None),
            Facility.longitude.is_not(None),
        )
        fac_res = await session.execute(fac_stmt)
        seen_coord_keys: set[str] = set()
        refreshed_sites: list[dict[str, Any]] = []
        for lat, lon in fac_res.all():
            if lat is None or lon is None:
                continue
            ck = make_coord_key(float(lat), float(lon))
            if ck in seen_coord_keys:
                continue
            seen_coord_keys.add(ck)
            try:
                site_info = await refresh_site_weather(session, float(lat), float(lon), past_days=2)
                refreshed_sites.append(site_info)
            except Exception as exc:
                logger.warning("Error auto-refreshing site weather for %s: %s", ck, exc)

        return {
            "status": "ok",
            "active_stations_count": len(station_ids),
            "refreshed_count": len(refreshed_stations),
            "active_sites_count": len(seen_coord_keys),
            "refreshed_sites_count": len(refreshed_sites),
        }


async def weather_scheduler_loop() -> None:
    """Background task loop refreshing active weather stations every 3 hours."""
    logger.info("Starting background weather scheduler (interval: %s sec)...", REFRESH_INTERVAL_SECONDS)
    while True:
        try:
            await refresh_active_stations_weather()
        except asyncio.CancelledError:
            logger.info("Weather scheduler loop cancelled.")
            break
        except Exception as exc:
            logger.error("Weather scheduler loop error: %s", exc)

        try:
            await asyncio.sleep(REFRESH_INTERVAL_SECONDS)
        except asyncio.CancelledError:
            break
