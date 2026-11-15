from __future__ import annotations

import logging
from collections import defaultdict
from datetime import date, datetime
from typing import Any

import httpx

logger = logging.getLogger(__name__)

OGIMET_BASE_URL = "https://www.ogimet.com/cgi-bin/getsynop"


def parse_section1_air_temp(telegram: str) -> float | None:
    """Parse instant air temperature (group 1sTTT) strictly from Section 1 of SYNOP telegram.

    Section 1 ends at Section 3 indicator ('333') or Section 5 ('555') or end indicator ('==').
    Extracting only before '333' ensures we never confuse instant temperature with 12h/24h extremes
    like 1s_n T_x T_x T_x or 2s_n T_n T_n T_n present in Section 3.
    """
    clean_text = telegram.replace("==", " ").strip()
    tokens = clean_text.split()

    section1_tokens: list[str] = []
    for token in tokens:
        clean_token = token.strip()
        # Indicator 333 (Section 3) or 555 (Section 5) signals the end of Section 1
        if clean_token in ("333", "555") or clean_token.startswith("333") or clean_token.startswith("555"):
            break
        section1_tokens.append(clean_token)

    n = len(section1_tokens)

    # First pass: find group 1sTTT followed by dew point (2sTTT), pressure (3PPPP, 4PPPP), or tendency (5appp)
    for i, token in enumerate(section1_tokens):
        if len(token) == 5 and token[0] == "1" and token[1] in ("0", "1") and token[2:].isdigit():
            if i + 1 < n:
                next_tok = section1_tokens[i + 1]
                if next_tok and next_tok[0] in ("2", "3", "4", "5"):
                    sign = 1.0 if token[1] == "0" else -1.0
                    raw_val = int(token[2:]) / 10.0
                    temp = sign * raw_val
                    return 0.0 if temp == 0.0 else round(temp, 1)

    # Second pass: if following groups are absent or non-standard, pick 1sTTT occurring after header & wind group
    for i, token in enumerate(section1_tokens):
        if i >= 4 and len(token) == 5 and token[0] == "1" and token[1] in ("0", "1") and token[2:].isdigit():
            sign = 1.0 if token[1] == "0" else -1.0
            raw_val = int(token[2:]) / 10.0
            temp = sign * raw_val
            return 0.0 if temp == 0.0 else round(temp, 1)

    return None


def parse_ogimet_data(raw_text: str) -> dict[date, list[float]]:
    """Parse Ogimet getsynop plain text into observations grouped by date."""
    daily_readings: dict[date, list[float]] = defaultdict(list)

    for line in raw_text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue

        # Ogimet CSV-like format:
        # 23330,2026,11,14,00,00,AAXX 14001 23330 ...
        parts = line.split(",", 6)
        if len(parts) >= 7:
            try:
                obs_year = int(parts[1])
                obs_month = int(parts[2])
                obs_day = int(parts[3])
                obs_date = date(obs_year, obs_month, obs_day)
                telegram_part = parts[6]
            except (ValueError, IndexError):
                continue
        else:
            # Fallback if line is pure telegram text starting with YYMMDD or similar
            tokens = line.split()
            if not tokens:
                continue
            # Try to infer date if format starts with YYYYMMDDHHMM
            if len(tokens[0]) == 12 and tokens[0].isdigit():
                try:
                    dt = datetime.strptime(tokens[0][:8], "%Y%m%d")
                    obs_date = dt.date()
                    telegram_part = " ".join(tokens[1:])
                except ValueError:
                    continue
            else:
                continue

        temp = parse_section1_air_temp(telegram_part)
        if temp is not None:
            daily_readings[obs_date].append(temp)

    return dict(daily_readings)


def calculate_daily_stats(temps: list[float]) -> dict[str, float | None]:
    """Calculate t_min, t_max, t_mean from all valid observations of the day."""
    if not temps:
        return {"t_min": None, "t_max": None, "t_mean": None}

    t_min = round(min(temps), 1)
    t_max = round(max(temps), 1)
    t_mean = round(sum(temps) / len(temps), 1)
    return {
        "t_min": t_min,
        "t_max": t_max,
        "t_mean": t_mean,
    }


async def fetch_synop_daily(
    wmo_id: str,
    date_from: date,
    date_to: date,
    client: httpx.AsyncClient | None = None,
    timeout_seconds: float = 12.0,
) -> list[dict[str, Any]]:
    """Fetch and aggregate daily SYNOP observations via Ogimet gateway."""
    begin_str = f"{date_from.strftime('%Y%m%d')}0000"
    end_str = f"{date_to.strftime('%Y%m%d')}2359"
    url = f"{OGIMET_BASE_URL}?block={wmo_id}&begin={begin_str}&end={end_str}"

    should_close_client = False
    if client is None:
        client = httpx.AsyncClient(timeout=timeout_seconds)
        should_close_client = True

    try:
        resp = await client.get(url)
        resp.raise_for_status()
        raw_text = resp.text
    except Exception as exc:
        logger.warning("Failed to fetch SYNOP from Ogimet for WMO %s (%s - %s): %s", wmo_id, date_from, date_to, exc)
        return []
    finally:
        if should_close_client:
            await client.aclose()

    daily_readings = parse_ogimet_data(raw_text)
    records: list[dict[str, Any]] = []

    for obs_date, temps in sorted(daily_readings.items()):
        stats = calculate_daily_stats(temps)
        records.append({
            "obs_date": obs_date,
            "t_min": stats["t_min"],
            "t_max": stats["t_max"],
            "t_mean": stats["t_mean"],
            "source": "SYNOP_LIVE",
        })

    return records
