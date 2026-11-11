from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_client_ip, get_current_user, get_db_session, require_permission
from app.models.joint import WeldJoint
from app.models.user import User
from app.models.welding_tech import TechCard, TechCardPreheatRule
from app.schemas.domain import PaginatedResponse, TechCardCreate, TechCardOut, TechCardUpdate
from app.services.audit_service import extract_changed_fields, record_audit_log
from app.services.crud_helpers import (
    apply_patch_fields,
    enforce_optimistic_lock,
    orm_snapshot,
    raise_duplicate_error,
    raise_referential_integrity_error,
)
from app.services.event_bus import event_bus

router = APIRouter(prefix="/api/wps", tags=["wps"])


@router.get("", response_model=PaginatedResponse[TechCardOut])
async def list_tech_cards(
    search: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> PaginatedResponse[TechCardOut]:
    stmt = select(TechCard).options(selectinload(TechCard.preheat_rules))
    if search:
        pat = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                TechCard.number.ilike(pat),
                TechCard.title.ilike(pat),
                TechCard.ntd.ilike(pat),
            )
        )
    all_rows = list(
        (await session.execute(stmt.order_by(TechCard.sort_order.asc(), TechCard.number.asc())))
        .scalars()
        .all()
    )
    total = len(all_rows)
    page = all_rows[offset : offset + limit]
    return PaginatedResponse(
        items=[TechCardOut.model_validate(tc) for tc in page],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=TechCardOut, status_code=status.HTTP_201_CREATED)
async def create_tech_card(
    payload: TechCardCreate,
    request: Request,
    current_user: User = Depends(require_permission("can_edit_welding_tech")),
    session: AsyncSession = Depends(get_db_session),
) -> TechCardOut:
    existing = (
        await session.execute(select(TechCard).where(TechCard.number == payload.number.strip()))
    ).scalar_one_or_none()
    if existing is not None:
        raise_duplicate_error(
            "DUPLICATE_TECH_CARD",
            f"Техкарта «{payload.number.strip()}» уже существует.",
        )

    now = datetime.now(timezone.utc)
    tc_id = uuid.uuid4()
    tc = TechCard(
        id=tc_id,
        legacy_id=payload.legacy_id,
        number=payload.number.strip(),
        title=payload.title.strip(),
        welding_type=payload.welding_type,
        joint_kind=payload.joint_kind,
        element_combination=payload.element_combination,
        ntd=payload.ntd.strip(),
        steel_group=payload.steel_group.strip(),
        min_diameter_mm=payload.min_diameter_mm,
        max_diameter_mm=payload.max_diameter_mm,
        min_wall_thickness_mm=payload.min_wall_thickness_mm,
        max_wall_thickness_mm=payload.max_wall_thickness_mm,
        recommended_materials=payload.recommended_materials,
        sort_order=payload.sort_order,
        version=1,
        created_at=now,
        updated_at=now,
    )
    tc.preheat_rules = [
        TechCardPreheatRule(
            id=uuid.uuid4(),
            tech_card_id=tc_id,
            ambient_min_c=rule.ambient_min_c,
            ambient_max_c=rule.ambient_max_c,
            min_preheat_temp_c=rule.min_preheat_temp_c,
            condition_label=rule.condition_label.strip(),
        )
        for rule in payload.preheat_rules
    ]
    session.add(tc)
    await session.flush()

    snapshot = orm_snapshot(tc, TechCardOut)
    await record_audit_log(
        session,
        action="CREATE",
        entity_type="tech_card",
        entity_id=str(tc.id),
        user=current_user,
        new_data=snapshot,
        ip_address=get_client_ip(request),
        summary=f"Добавлена техкарта (WPS) «{tc.number}»",
    )
    await event_bus.emit_delta(
        session,
        event="wps.created",
        entity_type="tech_card",
        entity_id=tc.id,
        version=tc.version,
        updated_by=current_user.login,
        data=snapshot,
    )
    return TechCardOut.model_validate(tc)


@router.patch("/{tech_card_id}", response_model=TechCardOut)
async def update_tech_card(
    tech_card_id: uuid.UUID,
    payload: TechCardUpdate,
    request: Request,
    current_user: User = Depends(require_permission("can_edit_welding_tech")),
    session: AsyncSession = Depends(get_db_session),
) -> TechCardOut:
    tc = (
        await session.execute(
            select(TechCard)
            .options(selectinload(TechCard.preheat_rules))
            .where(TechCard.id == tech_card_id)
        )
    ).scalar_one_or_none()
    if tc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Техкарта не найдена.")

    patch_data = payload.model_dump(exclude_unset=True)
    enforce_optimistic_lock(
        entity_type="tech_card",
        entity_obj=tc,
        expected_version=payload.version,
        patch_data=patch_data,
        schema_cls=TechCardOut,
    )

    old_snap = orm_snapshot(tc, TechCardOut)
    apply_patch_fields(tc, patch_data, skip={"preheat_rules"})
    if payload.preheat_rules is not None:
        tc.preheat_rules = [
            TechCardPreheatRule(
                id=uuid.uuid4(),
                tech_card_id=tc.id,
                ambient_min_c=rule.ambient_min_c,
                ambient_max_c=rule.ambient_max_c,
                min_preheat_temp_c=rule.min_preheat_temp_c,
                condition_label=rule.condition_label.strip(),
            )
            for rule in payload.preheat_rules
        ]
    tc.updated_at = datetime.now(timezone.utc)
    await session.flush()

    new_snap = orm_snapshot(tc, TechCardOut)
    old_diff, new_diff = extract_changed_fields(old_snap, new_snap)
    await record_audit_log(
        session,
        action="UPDATE",
        entity_type="tech_card",
        entity_id=str(tc.id),
        user=current_user,
        old_data=old_diff,
        new_data=new_diff,
        ip_address=get_client_ip(request),
        summary=f"Обновлена техкарта (WPS) «{tc.number}» (v{tc.version})",
    )
    await event_bus.emit_delta(
        session,
        event="wps.updated",
        entity_type="tech_card",
        entity_id=tc.id,
        version=tc.version,
        updated_by=current_user.login,
        data=new_snap,
    )
    return TechCardOut.model_validate(tc)


@router.delete("/{tech_card_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tech_card(
    tech_card_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_permission("can_edit_welding_tech")),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    tc = (
        await session.execute(select(TechCard).where(TechCard.id == tech_card_id))
    ).scalar_one_or_none()
    if tc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Техкарта не найдена.")

    linked_joints = list(
        (
            await session.execute(
                select(WeldJoint).where(
                    or_(
                        WeldJoint.tech_card_id == tc.id,
                        WeldJoint.tech_card_number == tc.number,
                        WeldJoint.repair_tech_card == tc.number,
                    )
                )
            )
        )
        .scalars()
        .all()
    )
    if linked_joints:
        raise_referential_integrity_error(
            "tech_card",
            f"Невозможно удалить техкарту «{tc.number}»: она указана в {len(linked_joints)} стыках.",
            references_count=len(linked_joints),
        )

    old_snap = orm_snapshot(tc)
    await session.delete(tc)
    await record_audit_log(
        session,
        action="DELETE",
        entity_type="tech_card",
        entity_id=str(tech_card_id),
        user=current_user,
        old_data=old_snap,
        ip_address=get_client_ip(request),
        summary=f"Удалена техкарта «{tc.number}»",
    )
    await event_bus.emit_delta(
        session,
        event="wps.deleted",
        entity_type="tech_card",
        entity_id=tech_card_id,
        version=tc.version,
        updated_by=current_user.login,
        data={"id": str(tech_card_id)},
    )
