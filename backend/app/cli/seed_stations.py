from __future__ import annotations

import argparse
import asyncio
import csv
import io
import logging
import sys
import uuid
from typing import Any

import httpx
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.models.weather import WeatherStation
from app.services.weather.translit import transliterate_station_name

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

NOAA_ISD_HISTORY_URL = "https://www.ncei.noaa.gov/pub/data/noaa/isd-history.csv"


def extract_rs_stations_from_csv(
    csv_text: str,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    """Parse isd-history.csv, filter by CTRY == 'RS' with valid WMO and coordinates."""
    reader = csv.DictReader(io.StringIO(csv_text))
    stations: list[dict[str, Any]] = []
    seen_wmo: set[str] = set()

    for row in reader:
        ctry = (row.get("CTRY") or "").strip()
        if ctry != "RS":
            continue

        usaf = (row.get("USAF") or "").strip()
        wban = (row.get("WBAN") or "").strip()
        name = (row.get("STATION NAME") or "").strip()
        lat_str = (row.get("LAT") or "").strip()
        lon_str = (row.get("LON") or "").strip()
        region = (row.get("STATE") or "").strip() or None

        if not usaf or not name or not lat_str or not lon_str:
            continue

        # USAF typically has 6 digits ending in '0' for WMO stations, e.g. '233300' -> WMO '23330'
        # or 5 digits for standard WMO blocks
        wmo_id: str | None = None
        if len(usaf) == 6 and usaf.isdigit() and usaf.endswith("0"):
            wmo_id = usaf[:5]
        elif len(usaf) == 5 and usaf.isdigit():
            wmo_id = usaf
        elif usaf.isdigit() and len(usaf) >= 5:
            wmo_id = usaf[:5]

        if not wmo_id or wmo_id in seen_wmo:
            continue

        try:
            latitude = float(lat_str)
            longitude = float(lon_str)
        except ValueError:
            continue

        # Filter out 0.0 coordinates placeholder
        if abs(latitude) < 0.0001 and abs(longitude) < 0.0001:
            continue

        seen_wmo.add(wmo_id)
        name_en = name
        name_ru = transliterate_station_name(name)
        stations.append({
            "wmo_id": wmo_id,
            "usaf": usaf,
            "wban": wban or "99999",
            "name": name_ru,
            "name_en": name_en,
            "region": region,
            "latitude": latitude,
            "longitude": longitude,
            "is_active": True,
        })

        if limit and len(stations) >= limit:
            break

    return stations


async def seed_stations_to_db(stations: list[dict[str, Any]], batch_size: int = 500) -> int:
    """UPSERT weather stations into PostgreSQL database."""
    if not stations:
        logger.warning("No stations to seed.")
        return 0

    inserted_or_updated = 0
    async with async_session_factory() as session:
        for i in range(0, len(stations), batch_size):
            batch = stations[i : i + batch_size]
            for st in batch:
                stmt = pg_insert(WeatherStation).values(
                    id=uuid.uuid4(),
                    wmo_id=st["wmo_id"],
                    usaf=st["usaf"],
                    wban=st["wban"],
                    name=st["name"],
                    name_en=st.get("name_en"),
                    region=st["region"],
                    latitude=st["latitude"],
                    longitude=st["longitude"],
                    is_active=st["is_active"],
                ).on_conflict_do_update(
                    index_elements=[WeatherStation.wmo_id],
                    set_={
                        "usaf": st["usaf"],
                        "wban": st["wban"],
                        "name": st["name"],
                        "name_en": st.get("name_en"),
                        "region": st["region"],
                        "latitude": st["latitude"],
                        "longitude": st["longitude"],
                        "is_active": st["is_active"],
                    },
                )
                await session.execute(stmt)
                inserted_or_updated += 1
            await session.commit()
            logger.info("Upserted batch: %s / %s stations", inserted_or_updated, len(stations))

    return inserted_or_updated


async def main_async(args: argparse.Namespace) -> None:
    if args.file:
        logger.info("Loading stations from local file: %s", args.file)
        with open(args.file, "r", encoding="utf-8", errors="replace") as f:
            csv_text = f.read()
    else:
        logger.info("Downloading isd-history.csv from NOAA (%s)...", NOAA_ISD_HISTORY_URL)
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(NOAA_ISD_HISTORY_URL)
            resp.raise_for_status()
            csv_text = resp.text

    stations = extract_rs_stations_from_csv(csv_text, limit=args.limit)
    logger.info("Extracted %s valid Russian weather stations with WMO IDs.", len(stations))

    if args.dry_run:
        logger.info("Dry-run enabled. Skipping database write.")
        for s in stations[:5]:
            logger.info("Sample station: %s", s)
        return

    count = await seed_stations_to_db(stations)
    logger.info("Successfully seeded %s weather stations into the database.", count)


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Russian weather stations from NOAA isd-history.csv")
    parser.add_argument("--file", help="Path to local isd-history.csv file instead of downloading")
    parser.add_argument("--limit", type=int, default=None, help="Maximum number of stations to seed")
    parser.add_argument("--dry-run", action="store_true", help="Parse without inserting into database")

    args = parser.parse_args()
    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
