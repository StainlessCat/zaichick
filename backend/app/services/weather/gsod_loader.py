from __future__ import annotations

import csv
import io
import logging
from datetime import date, datetime
from typing import Any

import httpx

logger = logging.getLogger(__name__)

NOAA_GSOD_URL_TEMPLATE = (
    "https://www.ncei.noaa.gov/data/global-summary-of-the-day/access/{year}/{usaf}{wban}.csv"
)


def fahrenheit_to_celsius(f_val: float) -> float:
    """Convert temperature from Fahrenheit to Celsius rounded to 1 decimal place."""
    c_val = (f_val - 32.0) * 5.0 / 9.0
    return 0.0 if abs(c_val) < 0.001 else round(c_val, 1)


def parse_gsod_csv(csv_text: str) -> list[dict[str, Any]]:
    """Parse NOAA GSOD daily summary CSV into Celsius records."""
    records: list[dict[str, Any]] = []
    reader = csv.DictReader(io.StringIO(csv_text))

    for row in reader:
        date_str = (row.get("DATE") or "").strip()
        if not date_str:
            continue
        try:
            obs_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            continue

        def _parse_temp_val(key: str) -> float | None:
            raw = (row.get(key) or "").strip().replace("*", "").strip()
            if not raw:
                return None
            try:
                val = float(raw)
                if val >= 9990.0:
                    return None
                return fahrenheit_to_celsius(val)
            except ValueError:
                return None

        t_mean = _parse_temp_val("TEMP")
        t_max = _parse_temp_val("MAX")
        t_min = _parse_temp_val("MIN")

        # Skip rows where no temperature is available
        if t_mean is None and t_max is None and t_min is None:
            continue

        records.append({
            "obs_date": obs_date,
            "t_min": t_min,
            "t_max": t_max,
            "t_mean": t_mean,
            "source": "NOAA_GSOD",
        })

    return records


async def fetch_gsod_for_station(
    usaf: str,
    wban: str,
    year: int,
    client: httpx.AsyncClient | None = None,
    timeout_seconds: float = 15.0,
) -> list[dict[str, Any]]:
    """Download and parse historical daily records from NOAA GSOD for a given year."""
    clean_usaf = usaf.strip()
    clean_wban = (wban or "99999").strip()
    url = NOAA_GSOD_URL_TEMPLATE.format(year=year, usaf=clean_usaf, wban=clean_wban)

    should_close_client = False
    if client is None:
        client = httpx.AsyncClient(timeout=timeout_seconds)
        should_close_client = True

    try:
        resp = await client.get(url)
        if resp.status_code == 404:
            logger.info("NOAA GSOD file not found for %s%s year %s", clean_usaf, clean_wban, year)
            return []
        resp.raise_for_status()
        csv_text = resp.text
    except Exception as exc:
        logger.warning(
            "Failed to fetch NOAA GSOD for %s%s year %s: %s",
            clean_usaf,
            clean_wban,
            year,
            exc,
        )
        return []
    finally:
        if should_close_client:
            await client.aclose()

    return parse_gsod_csv(csv_text)
