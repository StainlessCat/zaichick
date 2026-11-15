from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.api.deps import get_current_user, get_db_session
from app.cli.seed_stations import extract_rs_stations_from_csv
from app.main import app
from app.models.enums import RoleEnum
from app.models.user import User
from app.models.weather import WeatherDaily, WeatherStation
from app.services.weather.geo import haversine_distance_km
from app.services.weather.gsod_loader import fahrenheit_to_celsius, parse_gsod_csv
from app.services.weather.synop_parser import (
    calculate_daily_stats,
    parse_ogimet_data,
    parse_section1_air_temp,
)
from app.services.weather.weather_service import search_weather_stations


def _make_test_user(role: RoleEnum = RoleEnum.PTO) -> User:
    return User(
        id=uuid.uuid4(),
        login=f"user_{uuid.uuid4().hex[:6]}",
        full_name="Тестовый Инженер",
        password_hash="fakehash",
        department="ПТО",
        position_title="Инженер",
        role=role,
        is_active=True,
    )


def test_synop_parser_section1_positive_and_negative():
    """Verify group 1sTTT decoding for positive, negative, and zero temperatures."""
    # Positive +15.6 °C (10156)
    t1 = parse_section1_air_temp("AAXX 15121 23330 11460 82705 10156 20084 39985")
    assert t1 == 15.6

    # Negative -5.2 °C (11052)
    t2 = parse_section1_air_temp("AAXX 15121 23330 11460 82705 11052 21100 39985")
    assert t2 == -5.2

    # Zero +0.0 / -0.0
    assert parse_section1_air_temp("AAXX 15121 23330 10000 20000") == 0.0
    assert parse_section1_air_temp("AAXX 15121 23330 11000 20000") == 0.0

    # No temperature group
    assert parse_section1_air_temp("AAXX 15121 23330 40177 52005") is None


def test_synop_parser_strictly_cuts_off_at_section3_indicator_333():
    """Verify that Section 3 (indicator 333) is strictly ignored.

    In this telegram:
    Section 1 contains instant temperature 11101 (-10.1 °C).
    Section 3 contains maximum 12-hour temperature 11074 (-7.4 °C).
    The parser MUST extract -10.1 °C and MUST NOT extract -7.4 °C.
    """
    telegram = (
        "AAXX 14151 23330 12260 80000 11101 21121 30176 40198 57004 69902 886// "
        "333 11074 88704=="
    )
    result = parse_section1_air_temp(telegram)
    assert result == -10.1


def test_parse_ogimet_data_and_daily_stats():
    """Verify multi-line Ogimet response parsing and daily aggregation."""
    raw_ogimet = """# Ogimet test data
23330,2026,11,14,00,00,AAXX 14001 23330 41140 80000 11091 21110 30156 333 88703==
23330,2026,11,14,06,00,AAXX 14061 23330 41110 80000 11076 21094 30169 333 88703==
23330,2026,11,14,12,00,AAXX 14121 23330 41110 80000 11101 21120 30180 333 88703==
23330,2026,11,14,18,00,AAXX 14181 23330 41240 80000 11089 21107 30155 333 88705==
"""
    parsed = parse_ogimet_data(raw_ogimet)
    d = date(2026, 11, 14)
    assert d in parsed
    # Temperatures: -9.1, -7.6, -10.1, -8.9
    assert parsed[d] == [-9.1, -7.6, -10.1, -8.9]

    stats = calculate_daily_stats(parsed[d])
    assert stats["t_min"] == -10.1
    assert stats["t_max"] == -7.6
    # mean: (-9.1 + -7.6 + -10.1 + -8.9) / 4 = -35.7 / 4 = -8.925 -> -8.9
    assert stats["t_mean"] == -8.9


def test_gsod_csv_parsing_and_fahrenheit_to_celsius():
    """Verify NOAA GSOD Fahrenheit to Celsius conversion and 9999.9 missing values."""
    assert fahrenheit_to_celsius(32.0) == 0.0
    assert fahrenheit_to_celsius(14.0) == -10.0
    assert fahrenheit_to_celsius(68.0) == 20.0

    sample_csv = """"STATION","DATE","LATITUDE","LONGITUDE","ELEVATION","NAME","TEMP","MAX","MIN"
"23330099999","2024-01-01","66.533","66.667","16.0","SALEHARD"," -17.0","  -9.8"," -28.8*"
"23330099999","2024-01-02","66.533","66.667","16.0","SALEHARD","9999.9","  32.0"," 14.0"
"23330099999","2024-01-03","66.533","66.667","16.0","SALEHARD","9999.9","9999.9","9999.9"
"""
    records = parse_gsod_csv(sample_csv)
    assert len(records) == 2  # Row 3 with all 9999.9 is skipped

    # Row 1: TEMP = -17.0 F -> (-17 - 32) * 5 / 9 = -49 * 5 / 9 = -27.22 -> -27.2 C
    # MAX = -9.8 F -> (-9.8 - 32) * 5 / 9 = -23.2 C
    # MIN = -28.8 F -> (-28.8 - 32) * 5 / 9 = -33.8 C
    assert records[0]["obs_date"] == date(2024, 1, 1)
    assert records[0]["t_mean"] == -27.2
    assert records[0]["t_max"] == -23.2
    assert records[0]["t_min"] == -33.8
    assert records[0]["source"] == "NOAA_GSOD"

    # Row 2: TEMP is missing, MAX = 32.0 F (0.0 C), MIN = 14.0 F (-10.0 C)
    assert records[1]["obs_date"] == date(2024, 1, 2)
    assert records[1]["t_mean"] is None
    assert records[1]["t_max"] == 0.0
    assert records[1]["t_min"] == -10.0


def test_haversine_distance_calculation():
    """Verify haversine formula for geodesic distance."""
    # Moscow (55.7558, 37.6173) to St. Petersburg (59.9343, 30.3351) ~ 634 km
    dist = haversine_distance_km(55.7558, 37.6173, 59.9343, 30.3351)
    assert 620.0 < dist < 650.0

    # Same location
    assert haversine_distance_km(55.0, 60.0, 55.0, 60.0) == 0.0


def test_extract_rs_stations_from_isd_history_csv():
    """Verify filtering and extraction of Russian stations from isd-history.csv."""
    sample_csv = """"USAF","WBAN","STATION NAME","CTRY","STATE","ICAO","LAT","LON","ELEV(M)","BEGIN","END"
"010010","99999","JAN MAYEN","NO","","ENJA","+70.933","-008.667","+0009.0","19310101","20250824"
"233300","99999","SALEHARD","RS","","USDD","+66.533","+066.667","+0016.0","19320101","20250617"
"233300","99999","SALEHARD DUPLICATE","RS","","USDD","+66.533","+066.667","+0016.0","19320101","20250617"
"286610","99999","KURGAN","RS","","USUU","+55.470","+065.420","+0075.0","19360101","20250824"
"999999","99999","INVALID COORDS","RS","","","+00.000","+000.000","+0000.0","20100101","20200101"
"""
    stations = extract_rs_stations_from_csv(sample_csv)
    assert len(stations) == 2  # Norway skipped, duplicate 23330 skipped, 0,0 coords skipped

    assert stations[0]["wmo_id"] == "23330"
    assert stations[0]["name"] == "SALEHARD"
    assert stations[0]["latitude"] == 66.533
    assert stations[0]["longitude"] == 66.667

    assert stations[1]["wmo_id"] == "28661"
    assert stations[1]["name"] == "KURGAN"


@pytest.mark.asyncio
async def test_weather_endpoints_validation_and_auth():
    """Verify REST API behavior, bad date range rejection (400), and endpoint structure."""
    user = _make_test_user()
    mock_session = AsyncMock()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db_session] = lambda: mock_session

    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            # 1. Invalid date range (date_from > date_to) should return 400
            st_id = uuid.uuid4()
            resp = await client.get(
                f"/api/weather/daily?station_id={st_id}&date_from=2026-11-20&date_to=2026-11-10"
            )
            assert resp.status_code == 400
            assert "не может быть позже" in resp.json()["detail"]

            # 2. Date range > 730 days should return 400
            resp_long = await client.get(
                f"/api/weather/daily?station_id={st_id}&date_from=2020-01-01&date_to=2025-01-01"
            )
            assert resp_long.status_code == 400
            assert "730 дней" in resp_long.json()["detail"]

            # 3. Refresh non-existent station should return 404
            with patch("app.api.routes.weather.get_station_by_id", return_value=None):
                resp_404 = await client.post(f"/api/weather/stations/{st_id}/refresh")
                assert resp_404.status_code == 404

            # 4. Successful refresh with audit log
            mock_st = WeatherStation(
                id=st_id,
                wmo_id="23330",
                usaf="233300",
                wban="99999",
                name="САЛЕХАРД",
                latitude=66.53,
                longitude=66.67,
                is_active=True,
            )
            mock_refresh_res = {
                "station_id": st_id,
                "status": "ok",
                "refreshed_count": 3,
                "latest_date": date(2026, 11, 15),
                "latest_t_mean": -8.5,
                "updated_at": datetime.now(timezone.utc),
            }
            with patch("app.api.routes.weather.get_station_by_id", return_value=mock_st), \
                 patch("app.api.routes.weather.refresh_station_weather", return_value=mock_refresh_res), \
                 patch("app.api.routes.weather.record_audit_log", new_callable=AsyncMock) as mock_audit:
                resp_ok = await client.post(f"/api/weather/stations/{st_id}/refresh?days=3")
                assert resp_ok.status_code == 200
                data = resp_ok.json()
                assert data["status"] == "ok"
                assert data["refreshed_count"] == 3
                assert data["latest_t_mean"] == -8.5
                assert mock_audit.await_count == 1
                assert mock_audit.call_args[1]["action"] == "WEATHER_STATION_REFRESH"
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db_session, None)


@pytest.mark.asyncio
async def test_search_weather_stations_nearest_sorting():
    """Verify search_weather_stations calculates distance and sorts closest station first."""
    mock_session = AsyncMock()

    st1 = WeatherStation(
        id=uuid.uuid4(),
        wmo_id="27612",
        usaf="276120",
        wban="99999",
        name="МОСКВА ВДНХ",
        region="Московская область",
        latitude=55.83,
        longitude=37.62,
        is_active=True,
    )
    st2 = WeatherStation(
        id=uuid.uuid4(),
        wmo_id="26063",
        usaf="260630",
        wban="99999",
        name="САНКТ-ПЕТЕРБУРГ",
        region="Ленинградская область",
        latitude=59.97,
        longitude=30.30,
        is_active=True,
    )

    class _ScalarsMock:
        def all(self):
            return [st2, st1]

    class _ResultMock:
        def scalars(self):
            return _ScalarsMock()

    mock_session.execute = AsyncMock(return_value=_ResultMock())

    # Coordinates near Moscow (55.75, 37.61)
    results = await search_weather_stations(
        mock_session,
        search="МОСКВА",
        lat=55.75,
        lon=37.61,
        limit=10,
    )
    assert len(results) == 2
    # Moscow should be first because distance is ~9 km vs ~630 km for SPb
    assert results[0]["name"] == "МОСКВА ВДНХ"
    assert results[0]["distance_km"] < 20.0
    assert results[1]["name"] == "САНКТ-ПЕТЕРБУРГ"
    assert results[1]["distance_km"] > 600.0

