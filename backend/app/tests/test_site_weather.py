from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.api.deps import get_current_user, get_db_session
from app.main import app
from app.models.enums import DepartmentEnum, RoleEnum
from app.models.user import User
from app.models.weather import SiteWeatherDaily
from app.services.weather.open_meteo_loader import (
    _parse_open_meteo_daily_payload,
    fetch_open_meteo_archive,
    fetch_open_meteo_recent,
)
from app.services.weather.weather_service import (
    get_or_fetch_site_weather,
    make_coord_key,
)


def _make_test_user() -> User:
    return User(
        id=uuid.uuid4(),
        login=f"weather_{uuid.uuid4().hex[:6]}",
        full_name="Инженер ПТО",
        password_hash="fakehash",
        department=DepartmentEnum.PTO,
        position_title="Инженер",
        role=RoleEnum.PTO,
        is_active=True,
    )


def test_make_coord_key_rounding():
    assert make_coord_key(59.9312, 32.3418) == "59.95_32.35"
    assert make_coord_key(70.251, 68.419) == "70.25_68.40"


def test_parse_open_meteo_daily_payload():
    today = date.today()
    yesterday = today - timedelta(days=1)
    future = today + timedelta(days=1)
    payload = {
        "daily": {
            "time": [yesterday.isoformat(), today.isoformat(), future.isoformat()],
            "temperature_2m_mean": [-12.34, None, 5.0],
            "temperature_2m_min": [-15.0, -10.0, 2.0],
            "temperature_2m_max": [-9.0, -4.0, 8.0],
        }
    }
    records = _parse_open_meteo_daily_payload(
        payload, source_label="OPEN_METEO_LIVE", max_date=today
    )
    assert len(records) == 2
    assert records[0]["obs_date"] == yesterday
    assert records[0]["t_mean"] == -12.3
    assert records[1]["obs_date"] == today
    assert records[1]["t_mean"] == -7.0


@pytest.mark.asyncio
async def test_fetch_open_meteo_recent_and_archive_mocked():
    today = date.today().isoformat()
    sample_payload = {
        "daily": {
            "time": [today],
            "temperature_2m_mean": [4.2],
            "temperature_2m_min": [1.0],
            "temperature_2m_max": [7.4],
        }
    }

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = sample_payload
    mock_resp.raise_for_status.return_value = None
    mock_client.get.return_value = mock_resp

    recent = await fetch_open_meteo_recent(59.93, 32.34, client=mock_client)
    assert len(recent) == 1
    assert recent[0]["source"] == "OPEN_METEO_LIVE"
    assert recent[0]["t_mean"] == 4.2

    arch = await fetch_open_meteo_archive(
        59.93, 32.34, date.today() - timedelta(days=10), date.today() - timedelta(days=10), client=mock_client
    )
    assert len(arch) == 1
    assert arch[0]["source"] == "OPEN_METEO_ERA5"


@pytest.mark.asyncio
async def test_get_or_fetch_site_weather_backfills_recent_and_archive():
    today = date.today()
    old_date = today - timedelta(days=15)
    coord_key = make_coord_key(59.93, 32.34)

    cached_rows = [
        SiteWeatherDaily(
            id=uuid.uuid4(),
            coord_key=coord_key,
            latitude=59.93,
            longitude=32.34,
            obs_date=old_date,
            t_min=1.0,
            t_max=5.0,
            t_mean=3.0,
            source="OPEN_METEO_ERA5",
            updated_at=datetime.now(timezone.utc),
        ),
        SiteWeatherDaily(
            id=uuid.uuid4(),
            coord_key=coord_key,
            latitude=59.93,
            longitude=32.34,
            obs_date=today,
            t_min=-2.0,
            t_max=2.0,
            t_mean=0.0,
            source="OPEN_METEO_LIVE",
            updated_at=datetime.now(timezone.utc),
        ),
    ]

    mock_session = AsyncMock()
    empty_res = MagicMock()
    empty_res.scalars.return_value.all.return_value = []
    final_res = MagicMock()
    final_res.scalars.return_value.all.return_value = cached_rows
    mock_session.execute.side_effect = [empty_res, final_res]

    with (
        patch(
            "app.services.weather.weather_service.fetch_open_meteo_recent",
            new_callable=AsyncMock,
            return_value=[{
                "obs_date": today,
                "t_min": -2.0,
                "t_max": 2.0,
                "t_mean": 0.0,
                "source": "OPEN_METEO_LIVE",
            }],
        ) as mock_recent,
        patch(
            "app.services.weather.weather_service.fetch_open_meteo_archive",
            new_callable=AsyncMock,
            return_value=[{
                "obs_date": old_date,
                "t_min": 1.0,
                "t_max": 5.0,
                "t_mean": 3.0,
                "source": "OPEN_METEO_ERA5",
            }],
        ) as mock_archive,
        patch(
            "app.services.weather.weather_service.upsert_site_weather_records",
            new_callable=AsyncMock,
            return_value=2,
        ) as mock_upsert,
    ):
        rows = await get_or_fetch_site_weather(mock_session, 59.93, 32.34, old_date, today)
        assert len(rows) == 2
        mock_recent.assert_awaited_once()
        mock_archive.assert_awaited_once()
        mock_upsert.assert_awaited_once()


@pytest.mark.asyncio
async def test_api_site_weather_daily_and_health():
    test_user = _make_test_user()
    mock_session = AsyncMock()
    today = date.today()
    sample_row = SiteWeatherDaily(
        id=uuid.uuid4(),
        coord_key="59.95_32.35",
        latitude=59.93,
        longitude=32.34,
        obs_date=today,
        t_min=-3.0,
        t_max=1.0,
        t_mean=-1.0,
        source="OPEN_METEO_LIVE",
        updated_at=datetime.now(timezone.utc),
    )

    app.dependency_overrides[get_current_user] = lambda: test_user
    app.dependency_overrides[get_db_session] = lambda: mock_session
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            with patch(
                "app.api.routes.weather.get_or_fetch_site_weather",
                new_callable=AsyncMock,
                return_value=[sample_row],
            ):
                resp = await client.get(
                    f"/api/weather/site-daily?lat=59.93&lon=32.34&date={today.isoformat()}"
                )
                assert resp.status_code == 200
                data = resp.json()
                assert len(data) == 1
                assert data[0]["t_mean"] == -1.0
                assert data[0]["source"] == "OPEN_METEO_LIVE"

            with patch(
                "app.api.routes.weather.check_open_meteo_health",
                new_callable=AsyncMock,
                return_value=(True, 45, None),
            ):
                h_resp = await client.get("/api/weather/health")
                assert h_resp.status_code == 200
                assert h_resp.json()["status"] == "online"
                assert h_resp.json()["response_time_ms"] == 45
    finally:
        app.dependency_overrides.clear()
