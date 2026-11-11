from __future__ import annotations

import dataclasses
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_client_ip, get_current_user, get_db_session, require_permission
from app.models.joint import WeldJoint
from app.models.line import ProjectLine
from app.models.user import User
from app.models.welding_tech import (
    Inspector,
    Welder,
    WelderNaksCert,
    WeldingMaterial,
)
from app.schemas.domain import (
    InspectorCreate,
    InspectorOut,
    PaginatedResponse,
    WelderCreate,
    WelderNdtQuotaOut,
    WelderOut,
    WelderUpdate,
    WeldingMaterialCreate,
    WeldingMaterialOut,
    WeldingMaterialUpdate,
)
from app.services.audit_service import extract_changed_fields, record_audit_log
from app.services.crud_helpers import (
    apply_patch_fields,
    enforce_optimistic_lock,
    orm_snapshot,
    raise_duplicate_error,
    raise_referential_integrity_error,
)
from app.services.domain_validation import normalize_stamp, parse_stamps
from app.services.event_bus import event_bus
from app.services.readiness_service import calculate_welder_ndt_quotas

router = APIRouter(prefix="/api/naks", tags=["naks"])


# ---------------------------------------------------------------------------
# Welders & NAKS Certifications + Quotas
# ---------------------------------------------------------------------------
@router.get("/welders", response_model=PaginatedResponse[WelderOut])
async def list_welders(
    search: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> PaginatedResponse[WelderOut]:
    stmt = select(Welder).options(selectinload(Welder.naks_certs))
    if search:
        pat = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Welder.stamp.ilike(pat),
                Welder.full_name.ilike(pat),
                Welder.cert_number.ilike(pat),
            )
        )
    all_rows = list(
        (await session.execute(stmt.order_by(Welder.sort_order.asc(), Welder.stamp.asc())))
        .scalars()
        .all()
    )
    total = len(all_rows)
    page = all_rows[offset : offset + limit]
    return PaginatedResponse(
        items=[WelderOut.model_validate(w) for w in page],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/welders/quotas", response_model=list[WelderNdtQuotaOut])
async def get_welder_ndt_quotas(
    unique_line_id: str | None = Query(default=None),
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[WelderNdtQuotaOut]:
    joint_stmt = select(WeldJoint)
    if unique_line_id:
        joint_stmt = joint_stmt.where(WeldJoint.unique_line_id == unique_line_id.strip())
    joints = list((await session.execute(joint_stmt)).scalars().all())
    lines = list((await session.execute(select(ProjectLine))).scalars().all())
    reports = calculate_welder_ndt_quotas(joints, lines)
    return [WelderNdtQuotaOut(**dataclasses.asdict(r)) for r in reports]


@router.post("/welders", response_model=WelderOut, status_code=status.HTTP_201_CREATED)
async def create_welder(
    payload: WelderCreate,
    request: Request,
    current_user: User = Depends(require_permission("can_edit_welding_tech")),
    session: AsyncSession = Depends(get_db_session),
) -> WelderOut:
    existing = (
        await session.execute(select(Welder).where(Welder.stamp == payload.stamp.strip()))
    ).scalar_one_or_none()
    if existing is not None:
        raise_duplicate_error(
            "DUPLICATE_WELDER_STAMP",
            f"Сварщик/бригада с клеймом «{payload.stamp.strip()}» уже существует.",
        )

    now = datetime.now(timezone.utc)
    welder_id = uuid.uuid4()
    welder = Welder(
        id=welder_id,
        legacy_id=payload.legacy_id,
        stamp=payload.stamp.strip(),
        is_brigade=payload.is_brigade,
        brigade_members=list(payload.brigade_members) if payload.brigade_members is not None else None,
        full_name=payload.full_name.strip(),
        cert_number=payload.cert_number.strip(),
        cert_issue_date=payload.cert_issue_date,
        cert_expiry_date=payload.cert_expiry_date,
        attestation_area=payload.attestation_area,
        admission_sheet_number=payload.admission_sheet_number,
        admission_sheet_date=payload.admission_sheet_date,
        allowed_methods=list(payload.allowed_methods),
        crew_foreman=payload.crew_foreman.strip(),
        steel_groups=list(payload.steel_groups) if payload.steel_groups is not None else None,
        min_diameter_mm=payload.min_diameter_mm,
        max_diameter_mm=payload.max_diameter_mm,
        min_wall_thickness_mm=payload.min_wall_thickness_mm,
        max_wall_thickness_mm=payload.max_wall_thickness_mm,
        sort_order=payload.sort_order,
        version=1,
        created_at=now,
        updated_at=now,
    )
    welder.naks_certs = [
        WelderNaksCert(
            id=uuid.uuid4(),
            welder_id=welder_id,
            welding_type=c.welding_type,
            cert_number=c.cert_number.strip(),
            issue_date=c.issue_date,
            expiry_date=c.expiry_date,
            admission_sheet_number=c.admission_sheet_number,
            admission_sheet_date=c.admission_sheet_date,
            min_diameter_mm=c.min_diameter_mm,
            max_diameter_mm=c.max_diameter_mm,
            min_wall_thickness_mm=c.min_wall_thickness_mm,
            max_wall_thickness_mm=c.max_wall_thickness_mm,
            steel_groups=list(c.steel_groups) if c.steel_groups is not None else None,
        )
        for c in payload.naks_certs
    ]
    session.add(welder)
    await session.flush()

    snapshot = orm_snapshot(welder, WelderOut)
    await record_audit_log(
        session,
        action="CREATE",
        entity_type="welder",
        entity_id=str(welder.id),
        user=current_user,
        new_data=snapshot,
        ip_address=get_client_ip(request),
        summary=f"Добавлен сварщик «{welder.stamp}» ({welder.full_name})",
    )
    await event_bus.emit_delta(
        session,
        event="naks.welder.created",
        entity_type="welder",
        entity_id=welder.id,
        version=welder.version,
        updated_by=current_user.login,
        data=snapshot,
    )
    return WelderOut.model_validate(welder)


@router.patch("/welders/{welder_id}", response_model=WelderOut)
async def update_welder(
    welder_id: uuid.UUID,
    payload: WelderUpdate,
    request: Request,
    current_user: User = Depends(require_permission("can_edit_welding_tech")),
    session: AsyncSession = Depends(get_db_session),
) -> WelderOut:
    welder = (
        await session.execute(
            select(Welder).options(selectinload(Welder.naks_certs)).where(Welder.id == welder_id)
        )
    ).scalar_one_or_none()
    if welder is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сварщик не найден.")

    patch_data = payload.model_dump(exclude_unset=True)
    enforce_optimistic_lock(
        entity_type="welder",
        entity_obj=welder,
        expected_version=payload.version,
        patch_data=patch_data,
        schema_cls=WelderOut,
    )

    old_snap = orm_snapshot(welder, WelderOut)
    apply_patch_fields(welder, patch_data, skip={"naks_certs"})
    if payload.naks_certs is not None:
        welder.naks_certs = [
            WelderNaksCert(
                id=uuid.uuid4(),
                welder_id=welder.id,
                welding_type=c.welding_type,
                cert_number=c.cert_number.strip(),
                issue_date=c.issue_date,
                expiry_date=c.expiry_date,
                admission_sheet_number=c.admission_sheet_number,
                admission_sheet_date=c.admission_sheet_date,
                min_diameter_mm=c.min_diameter_mm,
                max_diameter_mm=c.max_diameter_mm,
                min_wall_thickness_mm=c.min_wall_thickness_mm,
                max_wall_thickness_mm=c.max_wall_thickness_mm,
                steel_groups=list(c.steel_groups) if c.steel_groups is not None else None,
            )
            for c in payload.naks_certs
        ]
    welder.updated_at = datetime.now(timezone.utc)
    await session.flush()

    new_snap = orm_snapshot(welder, WelderOut)
    old_diff, new_diff = extract_changed_fields(old_snap, new_snap)
    await record_audit_log(
        session,
        action="UPDATE",
        entity_type="welder",
        entity_id=str(welder.id),
        user=current_user,
        old_data=old_diff,
        new_data=new_diff,
        ip_address=get_client_ip(request),
        summary=f"Обновлены данные сварщика «{welder.stamp}» (v{welder.version})",
    )
    await event_bus.emit_delta(
        session,
        event="naks.welder.updated",
        entity_type="welder",
        entity_id=welder.id,
        version=welder.version,
        updated_by=current_user.login,
        data=new_snap,
    )
    return WelderOut.model_validate(welder)


@router.delete("/welders/{welder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_welder(
    welder_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_permission("can_edit_welding_tech")),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    welder = (await session.execute(select(Welder).where(Welder.id == welder_id))).scalar_one_or_none()
    if welder is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сварщик не найден.")

    target_norm = normalize_stamp(welder.stamp)
    all_joints = list((await session.execute(select(WeldJoint))).scalars().all())
    refs = 0
    for j in all_joints:
        stamps = [normalize_stamp(s) for s in parse_stamps(j.welder_stamp, j.welder_stamps_list)]
        rep_stamp = normalize_stamp(j.repair_welder_stamp)
        if target_norm in stamps or rep_stamp == target_norm:
            refs += 1
    if refs > 0:
        raise_referential_integrity_error(
            "welder",
            f"Невозможно удалить сварщика «{welder.stamp}»: клеймо используется в {refs} стыках.",
            references_count=refs,
        )

    old_snap = orm_snapshot(welder)
    await session.delete(welder)
    await record_audit_log(
        session,
        action="DELETE",
        entity_type="welder",
        entity_id=str(welder_id),
        user=current_user,
        old_data=old_snap,
        ip_address=get_client_ip(request),
        summary=f"Удалён сварщик «{welder.stamp}»",
    )
    await event_bus.emit_delta(
        session,
        event="naks.welder.deleted",
        entity_type="welder",
        entity_id=welder_id,
        version=welder.version,
        updated_by=current_user.login,
        data={"id": str(welder_id)},
    )


# ---------------------------------------------------------------------------
# Welding Consumables (Materials)
# ---------------------------------------------------------------------------
@router.get("/materials", response_model=PaginatedResponse[WeldingMaterialOut])
async def list_materials(
    search: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> PaginatedResponse[WeldingMaterialOut]:
    stmt = select(WeldingMaterial)
    if search:
        pat = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                WeldingMaterial.brand_and_diameter.ilike(pat),
                WeldingMaterial.batch_number.ilike(pat),
                WeldingMaterial.certificate_number.ilike(pat),
            )
        )
    all_rows = list(
        (await session.execute(stmt.order_by(WeldingMaterial.sort_order.asc())))
        .scalars()
        .all()
    )
    total = len(all_rows)
    page = all_rows[offset : offset + limit]
    return PaginatedResponse(
        items=[WeldingMaterialOut.model_validate(m) for m in page],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("/materials", response_model=WeldingMaterialOut, status_code=status.HTTP_201_CREATED)
async def create_material(
    payload: WeldingMaterialCreate,
    request: Request,
    current_user: User = Depends(require_permission("can_edit_welding_tech")),
    session: AsyncSession = Depends(get_db_session),
) -> WeldingMaterialOut:
    now = datetime.now(timezone.utc)
    mat = WeldingMaterial(
        id=uuid.uuid4(),
        legacy_id=payload.legacy_id,
        brand_and_diameter=payload.brand_and_diameter.strip(),
        material_type=payload.material_type,
        welding_method=payload.welding_method,
        batch_number=payload.batch_number.strip(),
        certificate_number=payload.certificate_number.strip(),
        incoming_control_act=payload.incoming_control_act.strip(),
        incoming_control_date=payload.incoming_control_date,
        status=payload.status,
        sort_order=payload.sort_order,
        version=1,
        created_at=now,
        updated_at=now,
    )
    session.add(mat)
    await session.flush()

    snapshot = orm_snapshot(mat, WeldingMaterialOut)
    await record_audit_log(
        session,
        action="CREATE",
        entity_type="welding_material",
        entity_id=str(mat.id),
        user=current_user,
        new_data=snapshot,
        ip_address=get_client_ip(request),
        summary=f"Добавлен сварочный материал «{mat.brand_and_diameter}»",
    )
    await event_bus.emit_delta(
        session,
        event="naks.material.created",
        entity_type="welding_material",
        entity_id=mat.id,
        version=mat.version,
        updated_by=current_user.login,
        data=snapshot,
    )
    return WeldingMaterialOut.model_validate(mat)


@router.patch("/materials/{material_id}", response_model=WeldingMaterialOut)
async def update_material(
    material_id: uuid.UUID,
    payload: WeldingMaterialUpdate,
    request: Request,
    current_user: User = Depends(require_permission("can_edit_welding_tech")),
    session: AsyncSession = Depends(get_db_session),
) -> WeldingMaterialOut:
    mat = (
        await session.execute(select(WeldingMaterial).where(WeldingMaterial.id == material_id))
    ).scalar_one_or_none()
    if mat is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сварочный материал не найден.")

    patch_data = payload.model_dump(exclude_unset=True)
    enforce_optimistic_lock(
        entity_type="welding_material",
        entity_obj=mat,
        expected_version=payload.version,
        patch_data=patch_data,
        schema_cls=WeldingMaterialOut,
    )

    old_snap = orm_snapshot(mat, WeldingMaterialOut)
    apply_patch_fields(mat, patch_data)
    mat.updated_at = datetime.now(timezone.utc)
    await session.flush()

    new_snap = orm_snapshot(mat, WeldingMaterialOut)
    old_diff, new_diff = extract_changed_fields(old_snap, new_snap)
    await record_audit_log(
        session,
        action="UPDATE",
        entity_type="welding_material",
        entity_id=str(mat.id),
        user=current_user,
        old_data=old_diff,
        new_data=new_diff,
        ip_address=get_client_ip(request),
        summary=f"Обновлён сварочный материал «{mat.brand_and_diameter}» (v{mat.version})",
    )
    await event_bus.emit_delta(
        session,
        event="naks.material.updated",
        entity_type="welding_material",
        entity_id=mat.id,
        version=mat.version,
        updated_by=current_user.login,
        data=new_snap,
    )
    return WeldingMaterialOut.model_validate(mat)


@router.delete("/materials/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_material(
    material_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_permission("can_edit_welding_tech")),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    mat = (
        await session.execute(select(WeldingMaterial).where(WeldingMaterial.id == material_id))
    ).scalar_one_or_none()
    if mat is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сварочный материал не найден.")

    all_joints = list((await session.execute(select(WeldJoint))).scalars().all())
    brand_lower = mat.brand_and_diameter.strip().lower()
    refs = sum(1 for j in all_joints if brand_lower and brand_lower in (j.welding_materials or "").lower())
    if refs > 0:
        raise_referential_integrity_error(
            "welding_material",
            f"Невозможно удалить материал «{mat.brand_and_diameter}»: он указан в {refs} стыках.",
            references_count=refs,
        )

    old_snap = orm_snapshot(mat)
    await session.delete(mat)
    await record_audit_log(
        session,
        action="DELETE",
        entity_type="welding_material",
        entity_id=str(material_id),
        user=current_user,
        old_data=old_snap,
        ip_address=get_client_ip(request),
        summary=f"Удалён сварочный материал «{mat.brand_and_diameter}»",
    )


# ---------------------------------------------------------------------------
# Inspectors directory
# ---------------------------------------------------------------------------
@router.get("/inspectors", response_model=list[InspectorOut])
async def list_inspectors(
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[InspectorOut]:
    rows = list((await session.execute(select(Inspector).order_by(Inspector.full_name.asc()))).scalars().all())
    return [InspectorOut.model_validate(r) for r in rows]


@router.post("/inspectors", response_model=InspectorOut, status_code=status.HTTP_201_CREATED)
async def create_inspector(
    payload: InspectorCreate,
    request: Request,
    current_user: User = Depends(require_permission("can_edit_welding_tech")),
    session: AsyncSession = Depends(get_db_session),
) -> InspectorOut:
    existing = (
        await session.execute(select(Inspector).where(Inspector.full_name == payload.full_name.strip()))
    ).scalar_one_or_none()
    if existing is not None:
        raise_duplicate_error(
            "DUPLICATE_INSPECTOR",
            f"Дефектоскопист «{payload.full_name.strip()}» уже есть в справочнике.",
        )
    insp = Inspector(
        id=uuid.uuid4(),
        full_name=payload.full_name.strip(),
        cert_level=payload.cert_level.strip(),
        lab_name=payload.lab_name.strip(),
        created_at=datetime.now(timezone.utc),
    )
    session.add(insp)
    await session.flush()
    await record_audit_log(
        session,
        action="CREATE",
        entity_type="inspector",
        entity_id=str(insp.id),
        user=current_user,
        new_data=orm_snapshot(insp),
        ip_address=get_client_ip(request),
        summary=f"Добавлен специалист НК «{insp.full_name}»",
    )
    return InspectorOut.model_validate(insp)
