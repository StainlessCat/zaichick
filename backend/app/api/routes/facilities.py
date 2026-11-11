from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_client_ip, get_current_user, get_db_session, require_permission
from app.models.facility import CustomWeatherStation, Facility, FacilityRdCode
from app.models.joint import WeldJoint
from app.models.line import ProjectLine
from app.models.lrv import LrvItem
from app.models.user import User
from app.schemas.domain import (
    CustomWeatherStationIn,
    CustomWeatherStationOut,
    FacilityCreate,
    FacilityOut,
    FacilityUpdate,
    PaginatedResponse,
)
from app.services.audit_service import extract_changed_fields, record_audit_log
from app.services.crud_helpers import (
    apply_patch_fields,
    enforce_optimistic_lock,
    orm_snapshot,
    raise_duplicate_error,
    raise_referential_integrity_error,
)
from app.services.event_bus import event_bus

router = APIRouter(prefix="/api/facilities", tags=["facilities"])


@router.get("", response_model=PaginatedResponse[FacilityOut])
async def list_facilities(
    search: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> PaginatedResponse[FacilityOut]:
    stmt = select(Facility).options(
        selectinload(Facility.rd_codes),
        selectinload(Facility.custom_weather_stations),
    )
    if search:
        pat = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Facility.name.ilike(pat),
                Facility.short_name.ilike(pat),
                Facility.region.ilike(pat),
            )
        )
    all_rows = list((await session.execute(stmt.order_by(Facility.name.asc()))).scalars().all())
    total = len(all_rows)
    page = all_rows[offset : offset + limit]
    return PaginatedResponse(
        items=[FacilityOut.model_validate(item) for item in page],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{facility_id}", response_model=FacilityOut)
async def get_facility(
    facility_id: uuid.UUID,
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> FacilityOut:
    facility = (
        await session.execute(
            select(Facility)
            .options(
                selectinload(Facility.rd_codes),
                selectinload(Facility.custom_weather_stations),
            )
            .where(Facility.id == facility_id)
        )
    ).scalar_one_or_none()
    if facility is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Объект не найден.")
    return FacilityOut.model_validate(facility)


@router.post("", response_model=FacilityOut, status_code=status.HTTP_201_CREATED)
async def create_facility(
    payload: FacilityCreate,
    request: Request,
    current_user: User = Depends(require_permission("can_edit_line_list")),
    session: AsyncSession = Depends(get_db_session),
) -> FacilityOut:
    existing = (
        await session.execute(select(Facility).where(Facility.name == payload.name.strip()))
    ).scalar_one_or_none()
    if existing is not None:
        raise_duplicate_error(
            "DUPLICATE_FACILITY_NAME",
            f"Объект «{payload.name.strip()}» уже существует.",
        )

    now = datetime.now(timezone.utc)
    fac_id = uuid.uuid4()
    facility = Facility(
        id=fac_id,
        external_id=payload.external_id,
        name=payload.name.strip(),
        short_name=payload.short_name.strip(),
        region=payload.region.strip(),
        latitude=payload.latitude,
        longitude=payload.longitude,
        weather_station=payload.weather_station,
        weather_station_id=payload.weather_station_id,
        weather_station_distance_km=payload.weather_station_distance_km,
        weather_station_source=payload.weather_station_source,
        weather_archive={},
        weather_observations={},
        version=1,
        created_at=now,
        updated_at=now,
    )
    facility.rd_codes = [
        FacilityRdCode(
            id=uuid.uuid4(),
            facility_id=fac_id,
            code=rd.code.strip(),
            title=rd.title.strip(),
            contours=list(rd.contours),
        )
        for rd in payload.rd_codes
    ]
    facility.custom_weather_stations = []

    session.add(facility)
    await session.flush()

    snapshot = orm_snapshot(facility, FacilityOut)
    await record_audit_log(
        session,
        action="CREATE",
        entity_type="facility",
        entity_id=str(facility.id),
        user=current_user,
        new_data=snapshot,
        ip_address=get_client_ip(request),
        summary=f"Создан объект «{facility.name}»",
    )
    await event_bus.emit_delta(
        session,
        event="facility.created",
        entity_type="facility",
        entity_id=facility.id,
        version=facility.version,
        updated_by=current_user.login,
        data=snapshot,
    )
    return FacilityOut.model_validate(facility)


@router.patch("/{facility_id}", response_model=FacilityOut)
async def update_facility(
    facility_id: uuid.UUID,
    payload: FacilityUpdate,
    request: Request,
    current_user: User = Depends(require_permission("can_edit_line_list")),
    session: AsyncSession = Depends(get_db_session),
) -> FacilityOut:
    facility = (
        await session.execute(
            select(Facility)
            .options(
                selectinload(Facility.rd_codes),
                selectinload(Facility.custom_weather_stations),
            )
            .where(Facility.id == facility_id)
        )
    ).scalar_one_or_none()
    if facility is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Объект не найден.")

    patch_data = payload.model_dump(exclude_unset=True)
    enforce_optimistic_lock(
        entity_type="facility",
        entity_obj=facility,
        expected_version=payload.version,
        patch_data=patch_data,
        schema_cls=FacilityOut,
    )

    old_snap = orm_snapshot(facility, FacilityOut)
    apply_patch_fields(facility, patch_data, skip={"rd_codes"})
    if payload.rd_codes is not None:
        facility.rd_codes = [
            FacilityRdCode(
                id=uuid.uuid4(),
                facility_id=facility.id,
                code=rd.code.strip(),
                title=rd.title.strip(),
                contours=list(rd.contours),
            )
            for rd in payload.rd_codes
        ]
    facility.updated_at = datetime.now(timezone.utc)
    await session.flush()

    new_snap = orm_snapshot(facility, FacilityOut)
    old_diff, new_diff = extract_changed_fields(old_snap, new_snap)
    await record_audit_log(
        session,
        action="UPDATE",
        entity_type="facility",
        entity_id=str(facility.id),
        user=current_user,
        old_data=old_diff,
        new_data=new_diff,
        ip_address=get_client_ip(request),
        summary=f"Обновлён объект «{facility.name}» (v{facility.version})",
    )
    await event_bus.emit_delta(
        session,
        event="facility.updated",
        entity_type="facility",
        entity_id=facility.id,
        version=facility.version,
        updated_by=current_user.login,
        data=new_snap,
    )
    return FacilityOut.model_validate(facility)


@router.post(
    "/{facility_id}/weather-stations",
    response_model=CustomWeatherStationOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_custom_weather_station(
    facility_id: uuid.UUID,
    payload: CustomWeatherStationIn,
    request: Request,
    current_user: User = Depends(require_permission("can_edit_line_list")),
    session: AsyncSession = Depends(get_db_session),
) -> CustomWeatherStationOut:
    facility = (
        await session.execute(select(Facility).where(Facility.id == facility_id))
    ).scalar_one_or_none()
    if facility is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Объект не найден.")

    station = CustomWeatherStation(
        id=uuid.uuid4(),
        facility_id=facility_id,
        station_code=payload.station_code.strip(),
        name=payload.name.strip(),
        region=payload.region.strip(),
        latitude=payload.latitude,
        longitude=payload.longitude,
        elevation_m=payload.elevation_m,
        device_model=payload.device_model,
        verification_cert_number=payload.verification_cert_number,
        verification_valid_until=payload.verification_valid_until,
        is_verified=payload.is_verified,
        source=payload.source,
        created_by_id=current_user.id,
        created_at=datetime.now(timezone.utc),
    )
    session.add(station)
    await session.flush()

    await record_audit_log(
        session,
        action="CREATE",
        entity_type="custom_weather_station",
        entity_id=str(station.id),
        user=current_user,
        new_data=orm_snapshot(station),
        ip_address=get_client_ip(request),
        summary=f"Добавлена АМК «{station.name}» для объекта «{facility.name}»",
    )
    return CustomWeatherStationOut.model_validate(station)


@router.delete("/{facility_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_facility(
    facility_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_permission("can_edit_line_list")),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    facility = (
        await session.execute(select(Facility).where(Facility.id == facility_id))
    ).scalar_one_or_none()
    if facility is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Объект не найден.")

    lines_cnt = (
        await session.execute(
            select(func.count()).select_from(ProjectLine).where(ProjectLine.facility_id == facility_id)
        )
    ).scalar_one()
    lrv_cnt = (
        await session.execute(
            select(func.count()).select_from(LrvItem).where(LrvItem.facility_id == facility_id)
        )
    ).scalar_one()
    joints_cnt = (
        await session.execute(
            select(func.count()).select_from(WeldJoint).where(WeldJoint.facility_id == facility_id)
        )
    ).scalar_one()
    total_refs = int(lines_cnt or 0) + int(lrv_cnt or 0) + int(joints_cnt or 0)
    if total_refs > 0:
        raise_referential_integrity_error(
            "facility",
            (
                f"Невозможно удалить объект «{facility.name}»: на него ссылаются "
                f"линии ({lines_cnt}), позиции ЛРВ ({lrv_cnt}) и стыки ({joints_cnt})."
            ),
            references_count=total_refs,
        )

    old_snap = orm_snapshot(facility)
    await session.delete(facility)
    await record_audit_log(
        session,
        action="DELETE",
        entity_type="facility",
        entity_id=str(facility_id),
        user=current_user,
        old_data=old_snap,
        ip_address=get_client_ip(request),
        summary=f"Удалён объект «{facility.name}»",
    )
    await event_bus.emit_delta(
        session,
        event="facility.deleted",
        entity_type="facility",
        entity_id=facility_id,
        version=facility.version,
        updated_by=current_user.login,
        data={"id": str(facility_id)},
    )
