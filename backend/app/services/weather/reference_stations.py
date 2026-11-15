from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.models.weather import WeatherStation

logger = logging.getLogger(__name__)

# Key Russian reference weather stations covering primary oil & gas pipeline corridors:
# Power of Siberia (Irkutsk, Yakutia, Amur), Yamal-Nenets (Bovanenkovo, Urengoy, Salekhard),
# Leningrad region (Volkhov, Baltic), West/East Siberia (Tyumen, Surgut, Chita).
BASELINE_RUSSIAN_STATIONS: list[dict[str, Any]] = [
    {
        "wmo_id": "30528",
        "usaf": "305280",
        "wban": "99999",
        "name": "Казачинское",
        "name_en": "KAZACINSKOE",
        "region": "Иркутская область",
        "latitude": 55.85,
        "longitude": 107.60,
        "is_active": True,
    },
    {
        "wmo_id": "30536",
        "usaf": "305360",
        "wban": "99999",
        "name": "Жигалово",
        "name_en": "ZIGALOVO",
        "region": "Иркутская область",
        "latitude": 54.80,
        "longitude": 105.15,
        "is_active": True,
    },
    {
        "wmo_id": "30433",
        "usaf": "304330",
        "wban": "99999",
        "name": "Киренск",
        "name_en": "KIRENSK",
        "region": "Иркутская область",
        "latitude": 57.77,
        "longitude": 108.07,
        "is_active": True,
    },
    {
        "wmo_id": "30309",
        "usaf": "303090",
        "wban": "99999",
        "name": "Усть-Кут",
        "name_en": "UST-KUT",
        "region": "Иркутская область",
        "latitude": 56.80,
        "longitude": 105.70,
        "is_active": True,
    },
    {
        "wmo_id": "23330",
        "usaf": "233300",
        "wban": "99999",
        "name": "Салехард (ЯНАО)",
        "name_en": "SALEHARD",
        "region": "Ямало-Ненецкий АО",
        "latitude": 66.533,
        "longitude": 66.533,
        "is_active": True,
    },
    {
        "wmo_id": "26078",
        "usaf": "260780",
        "wban": "99999",
        "name": "Волхов (Ленинградская обл.)",
        "name_en": "VOLKHOV",
        "region": "Ленинградская область",
        "latitude": 59.93,
        "longitude": 32.34,
        "is_active": True,
    },
    {
        "wmo_id": "20946",
        "usaf": "209460",
        "wban": "99999",
        "name": "Бованенково (Ямал)",
        "name_en": "BOVANENKOVO",
        "region": "Ямало-Ненецкий АО",
        "latitude": 70.37,
        "longitude": 68.88,
        "is_active": True,
    },
    {
        "wmo_id": "23274",
        "usaf": "232740",
        "wban": "99999",
        "name": "Новый Уренгой",
        "name_en": "NOVY URENGOY",
        "region": "Ямало-Ненецкий АО",
        "latitude": 66.08,
        "longitude": 76.51,
        "is_active": True,
    },
    {
        "wmo_id": "24959",
        "usaf": "249590",
        "wban": "99999",
        "name": "Якутск",
        "name_en": "YAKUTSK",
        "region": "Республика Саха (Якутия)",
        "latitude": 62.03,
        "longitude": 129.73,
        "is_active": True,
    },
    {
        "wmo_id": "30758",
        "usaf": "307580",
        "wban": "99999",
        "name": "Чита",
        "name_en": "CHITA",
        "region": "Забайкальский край",
        "latitude": 52.03,
        "longitude": 113.50,
        "is_active": True,
    },
    {
        "wmo_id": "28367",
        "usaf": "283670",
        "wban": "99999",
        "name": "Тюмень",
        "name_en": "TYUMEN",
        "region": "Тюменская область",
        "latitude": 57.15,
        "longitude": 65.53,
        "is_active": True,
    },
    {
        "wmo_id": "23849",
        "usaf": "238490",
        "wban": "99999",
        "name": "Сургут",
        "name_en": "SURGUT",
        "region": "Ханты-Мансийский АО",
        "latitude": 61.25,
        "longitude": 73.42,
        "is_active": True,
    },
]


def get_deterministic_station_uuid(wmo_id: str) -> uuid.UUID:
    """Generate a deterministic, immutable UUID5 based on WMO station ID."""
    clean = wmo_id.strip()
    return uuid.uuid5(uuid.NAMESPACE_DNS, f"station-{clean}")


async def seed_baseline_stations(session: AsyncSession) -> int:
    """Seed baseline stations with deterministic UUIDs."""
    count = 0
    for st in BASELINE_RUSSIAN_STATIONS:
        station_uuid = get_deterministic_station_uuid(st["wmo_id"])
        stmt = (
            pg_insert(WeatherStation)
            .values(
                id=station_uuid,
                wmo_id=st["wmo_id"],
                usaf=st["usaf"],
                wban=st["wban"],
                name=st["name"],
                name_en=st["name_en"],
                region=st["region"],
                latitude=st["latitude"],
                longitude=st["longitude"],
                is_active=st["is_active"],
            )
            .on_conflict_do_update(
                index_elements=[WeatherStation.wmo_id],
                set_={
                    "name": st["name"],
                    "name_en": st["name_en"],
                    "region": st["region"],
                    "latitude": st["latitude"],
                    "longitude": st["longitude"],
                    "is_active": st["is_active"],
                },
            )
        )
        await session.execute(stmt)
        count += 1
    await session.commit()
    logger.info("Seeded %d baseline Russian weather stations.", count)
    return count


async def ensure_baseline_weather_stations_seeded() -> int:
    """Check if weather_stations table has records; if empty, seed baseline stations."""
    try:
        async with async_session_factory() as session:
            count = (
                await session.execute(select(func.count(WeatherStation.id)))
            ).scalar_one()
            if count == 0:
                logger.info("weather_stations table is empty. Running baseline bootstrap seeding...")
                seeded = await seed_baseline_stations(session)
                return seeded
            else:
                logger.info("weather_stations table already contains %d stations.", count)
                return count
    except Exception as exc:
        logger.error("Failed to ensure baseline weather stations seeded: %s", exc)
        return 0
