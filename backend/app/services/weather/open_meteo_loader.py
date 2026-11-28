from __future__ import annotations

import logging
import time
from datetime import date, datetime
from typing import Any

import httpx

logger = logging.getLogger(__name__)

OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"


def _parse_open_meteo_daily_payload(
    payload: dict[str, Any],
    *,
    source_label: str,
    max_date: date | None = None,
) -> list[dict[str, Any]]:
    """Parse Open-Meteo daily JSON payload into normalized temperature records."""
    daily = payload.get("daily")
    if not isinstance(daily, dict):
        return []

    dates = daily.get("time") or []
    t_means = daily.get("temperature_2m_mean") or []
    t_mins = daily.get("temperature_2m_min") or []
    t_maxs = daily.get("temperature_2m_max") or []

    records: list[dict[str, Any]] = []
    for idx, raw_date in enumerate(dates):
        try:
            obs_date = datetime.strptime(str(raw_date), "%Y-%m-%d").date()
        except ValueError:
            continue

        if max_date is not None and obs_date > max_date:
            continue

        def _num(arr: list[Any]) -> float | None:
            if idx >= len(arr) or arr[idx] is None:
                return None
            try:
                return round(float(arr[idx]), 1)
            except (TypeError, ValueError):
                return None

        t_mean = _num(t_means)
        t_min = _num(t_mins)
        t_max = _num(t_maxs)

        if t_mean is None and t_min is not None and t_max is not None:
            t_mean = round((t_min + t_max) / 2.0, 1)

        if t_mean is None and t_min is None and t_max is None:
            continue

        records.append({
            "obs_date": obs_date,
            "t_min": t_min,
            "t_max": t_max,
            "t_mean": t_mean,
            "source": source_label,
        })

    return records


async def fetch_open_meteo_recent(
    latitude: float,
    longitude: float,
    *,
    past_days: int = 7,
    client: httpx.AsyncClient | None = None,
    timeout_seconds: float = 10.0,
) -> list[dict[str, Any]]:
    """Fetch today and recent days (up to past_days) from Open-Meteo Forecast API."""
    params = {
        "latitude": round(latitude, 4),
        "longitude": round(longitude, 4),
        "past_days": max(0, min(past_days, 92)),
        "forecast_days": 1,
        "daily": "temperature_2m_mean,temperature_2m_min,temperature_2m_max",
        "timezone": "auto",
    }

    should_close = False
    if client is None:
        client = httpx.AsyncClient(timeout=timeout_seconds)
        should_close = True

    try:
        resp = await client.get(OPEN_METEO_FORECAST_URL, params=params)
        resp.raise_for_status()
        payload = resp.json()
    except Exception as exc:
        logger.warning(
            "Open-Meteo Forecast failed for (%.4f, %.4f): %s",
            latitude,
            longitude,
            exc,
        )
        return []
    finally:
        if should_close:
            await client.aclose()

    return _parse_open_meteo_daily_payload(
        payload,
        source_label="OPEN_METEO_LIVE",
        max_date=date.today(),
    )


async def fetch_open_meteo_archive(
    latitude: float,
    longitude: float,
    date_from: date,
    date_to: date,
    *,
    client: httpx.AsyncClient | None = None,
    timeout_seconds: float = 12.0,
) -> list[dict[str, Any]]:
    """Fetch historical daily temperatures from Open-Meteo ERA5-Land Archive API."""
    if date_from > date_to:
        return []

    params = {
        "latitude": round(latitude, 4),
        "longitude": round(longitude, 4),
        "start_date": date_from.strftime("%Y-%m-%d"),
        "end_date": date_to.strftime("%Y-%m-%d"),
        "daily": "temperature_2m_mean,temperature_2m_min,temperature_2m_max",
        "timezone": "auto",
    }

    should_close = False
    if client is None:
        client = httpx.AsyncClient(timeout=timeout_seconds)
        should_close = True

    try:
        resp = await client.get(OPEN_METEO_ARCHIVE_URL, params=params)
        resp.raise_for_status()
        payload = resp.json()
    except Exception as exc:
        logger.warning(
            "Open-Meteo Archive failed for (%.4f, %.4f) %s..%s: %s",
            latitude,
            longitude,
            date_from,
            date_to,
            exc,
        )
        return []
    finally:
        if should_close:
            await client.aclose()

    return _parse_open_meteo_daily_payload(
        payload,
        source_label="OPEN_METEO_ERA5",
        max_date=date.today(),
    )


async def check_open_meteo_health(
    timeout_seconds: float = 4.0,
) -> tuple[bool, int | None, str | None]:
    """Verify server-side connectivity to Open-Meteo API."""
    started = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            resp = await client.get(
                OPEN_METEO_FORECAST_URL,
                params={
                    "latitude": 55.75,
                    "longitude": 37.62,
                    "daily": "temperature_2m_mean",
                    "forecast_days": 1,
                },
            )
            elapsed_ms = int((time.monotonic() - started) * 1000)
            if resp.status_code == 200:
                return True, elapsed_ms, None
            return False, elapsed_ms, f"HTTP {resp.status_code}"
    except Exception as exc:
        elapsed_ms = int((time.monotonic() - started) * 1000)
        return False, elapsed_ms, str(exc) or "Open-Meteo недоступен"
