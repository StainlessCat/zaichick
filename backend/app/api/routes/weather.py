from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, get_current_user, get_db_session
from app.models.user import User
from app.schemas.weather import (
    WeatherDailyOut,
    WeatherStationAliasCreate,
    WeatherStationAliasOut,
    WeatherStationOut,
    WeatherStationRefreshResponse,
)
from app.services.audit_service import record_audit_log
from app.services.weather.weather_service import (
    get_or_fetch_daily_weather,
    get_station_by_id,
    refresh_station_weather,
    save_or_update_station_alias,
    search_weather_stations,
)

router = APIRouter(prefix="/api/weather", tags=["weather"])


@router.get("/stations", response_model=list[WeatherStationOut])
async def list_weather_stations(
    search: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[WeatherStationOut]:
    """Search Russian weather stations by name/WMO ID, aliases or find closest by coordinates."""
    results = await search_weather_stations(
        session,
        search=search,
        lat=lat,
        lon=lon,
        limit=limit,
    )
    return [WeatherStationOut.model_validate(st) for st in results]


@router.post("/aliases", response_model=WeatherStationAliasOut, status_code=status.HTTP_201_CREATED)
async def create_or_update_station_alias(
    payload: WeatherStationAliasCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> WeatherStationAliasOut:
    """Save or update settlement alias link to a weather station."""
    station = await get_station_by_id(session, payload.station_id)
    if not station:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Метеостанция с ID '{payload.station_id}' не найдена.",
        )

    alias = await save_or_update_station_alias(
        session,
        settlement_name=payload.settlement_name,
        station_id=payload.station_id,
        distance_km=payload.distance_km,
    )

    await record_audit_log(
        session,
        action="WEATHER_ALIAS_CREATE",
        entity_type="weather_station_alias",
        entity_id=str(alias.id),
        user=current_user,
        ip_address=get_client_ip(request),
        summary=f"Привязка населённого пункта «{payload.settlement_name}» к станции «{station.name}» ({payload.distance_km or 0:.1f} км)",
        new_data={
            "settlement_name": payload.settlement_name,
            "station_id": str(payload.station_id),
            "distance_km": payload.distance_km,
        },
    )

    return WeatherStationAliasOut.model_validate(alias)


@router.get("/daily", response_model=list[WeatherDailyOut])
async def get_weather_daily(
    station_id: str,
    date_from: date | None = None,
    date_to: date | None = None,
    date: date | None = Query(default=None, alias="date"),
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[WeatherDailyOut]:
    """Retrieve daily temperature series, backfilling missing dates from SYNOP and NOAA GSOD."""
    if date is not None:
        if date_from is None:
            date_from = date
        if date_to is None:
            date_to = date

    if date_from is None or date_to is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Необходимо указать диапазон дат date_from и date_to (или дату date).",
        )

    if date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Дата начала (date_from) не может быть позже даты окончания (date_to).",
        )

    delta_days = (date_to - date_from).days
    if delta_days > 730:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Максимальный диапазон запроса метеоданных составляет 730 дней (2 года).",
        )

    records = await get_or_fetch_daily_weather(session, station_id, date_from, date_to)
    return [WeatherDailyOut.model_validate(r) for r in records]


@router.post("/stations/{station_id}/refresh", response_model=WeatherStationRefreshResponse)
async def refresh_weather_for_station(
    station_id: str,
    request: Request,
    days: int = Query(default=3, ge=1, le=14),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> WeatherStationRefreshResponse:
    """Forced refresh of recent temperatures via SYNOP with audit logging."""
    station = await get_station_by_id(session, station_id)
    if not station:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Метеостанция с ID '{station_id}' не найдена.",
        )

    try:
        result = await refresh_station_weather(session, station.id, days=days)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Не удалось обновить метеоданные с внешнего шлюза: {exc}",
        ) from exc

    await record_audit_log(
        session,
        action="WEATHER_STATION_REFRESH",
        entity_type="weather_station",
        entity_id=str(station.id),
        user=current_user,
        ip_address=get_client_ip(request),
        summary=f"Принудительное обновление погоды для станции «{station.name}» (WMO: {station.wmo_id})",
        new_data={
            "refreshed_count": result["refreshed_count"],
            "latest_date": str(result["latest_date"]) if result["latest_date"] else None,
            "latest_t_mean": result["latest_t_mean"],
        },
    )

    return WeatherStationRefreshResponse.model_validate(result)
