from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, get_current_user, get_db_session, require_permission
from app.models.enums import LrvStatusEnum
from app.models.joint import WeldJoint
from app.models.lrv import LrvItem
from app.models.user import User
from app.schemas.domain import (
    LrvItemCreate,
    LrvItemOut,
    LrvItemUpdate,
    LrvSupersedeRequest,
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

router = APIRouter(prefix="/api/lrv", tags=["lrv"])


def _build_lrv_item(payload: LrvItemCreate) -> LrvItem:
    now = datetime.now(timezone.utc)
    return LrvItem(
        id=uuid.uuid4(),
        legacy_id=payload.legacy_id,
        facility_id=payload.facility_id,
        lrv_code=payload.lrv_code.strip(),
        rd_code=payload.rd_code.strip(),
        object_name=payload.object_name.strip(),
        short_name=payload.short_name.strip(),
        category=payload.category,
        connection_type=payload.connection_type,
        material=payload.material.strip(),
        ntd=payload.ntd.strip(),
        manufacturer=payload.manufacturer,
        dn1=payload.dn1,
        diameter_mm=payload.diameter_mm,
        wall_thickness=payload.wall_thickness,
        dn2=payload.dn2,
        diameter_mm2=payload.diameter_mm2,
        wall_thickness2=payload.wall_thickness2,
        spec_qty=payload.spec_qty,
        unit=payload.unit,
        status=payload.status,
        replacement_letter=payload.replacement_letter,
        replacement_date=payload.replacement_date,
        sort_order=payload.sort_order,
        version=1,
        created_at=now,
        updated_at=now,
    )


@router.get("", response_model=PaginatedResponse[LrvItemOut])
async def list_lrv_items(
    facility_id: uuid.UUID | None = Query(default=None),
    rd_code: str | None = Query(default=None),
    status_filter: LrvStatusEnum | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> PaginatedResponse[LrvItemOut]:
    stmt = select(LrvItem)
    if facility_id is not None:
        stmt = stmt.where(LrvItem.facility_id == facility_id)
    if rd_code:
        stmt = stmt.where(LrvItem.rd_code == rd_code.strip())
    if status_filter is not None:
        stmt = stmt.where(LrvItem.status == status_filter)
    if search:
        pat = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                LrvItem.lrv_code.ilike(pat),
                LrvItem.short_name.ilike(pat),
                LrvItem.material.ilike(pat),
                LrvItem.rd_code.ilike(pat),
            )
        )
    all_rows = list(
        (await session.execute(stmt.order_by(LrvItem.sort_order.asc(), LrvItem.lrv_code.asc())))
        .scalars()
        .all()
    )
    total = len(all_rows)
    page = all_rows[offset : offset + limit]
    return PaginatedResponse(
        items=[LrvItemOut.model_validate(r) for r in page],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=LrvItemOut, status_code=status.HTTP_201_CREATED)
async def create_lrv_item(
    payload: LrvItemCreate,
    request: Request,
    current_user: User = Depends(require_permission("can_edit_lrv_catalog")),
    session: AsyncSession = Depends(get_db_session),
) -> LrvItemOut:
    existing = (
        await session.execute(
            select(LrvItem).where(
                and_(
                    LrvItem.rd_code == payload.rd_code.strip(),
                    LrvItem.lrv_code == payload.lrv_code.strip(),
                )
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise_duplicate_error(
            "DUPLICATE_LRV_CODE",
            f"Позиция ЛРВ «{payload.lrv_code.strip()}» уже зарегистрирована в шифре РД «{payload.rd_code.strip()}».",
        )

    item = _build_lrv_item(payload)
    session.add(item)
    await session.flush()

    snapshot = orm_snapshot(item, LrvItemOut)
    await record_audit_log(
        session,
        action="CREATE",
        entity_type="lrv_item",
        entity_id=str(item.id),
        user=current_user,
        new_data=snapshot,
        ip_address=get_client_ip(request),
        rd_code=item.rd_code,
        summary=f"Добавлена позиция ЛРВ «{item.lrv_code}» ({item.short_name})",
    )
    await event_bus.emit_delta(
        session,
        event="lrv.created",
        entity_type="lrv_item",
        entity_id=item.id,
        version=item.version,
        updated_by=current_user.login,
        data=snapshot,
    )
    return LrvItemOut.model_validate(item)


@router.patch("/{item_id}", response_model=LrvItemOut)
async def update_lrv_item(
    item_id: uuid.UUID,
    payload: LrvItemUpdate,
    request: Request,
    current_user: User = Depends(require_permission("can_edit_lrv_catalog")),
    session: AsyncSession = Depends(get_db_session),
) -> LrvItemOut:
    item = (await session.execute(select(LrvItem).where(LrvItem.id == item_id))).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Позиция ЛРВ не найдена.")

    patch_data = payload.model_dump(exclude_unset=True)
    enforce_optimistic_lock(
        entity_type="lrv_item",
        entity_obj=item,
        expected_version=payload.version,
        patch_data=patch_data,
        schema_cls=LrvItemOut,
    )

    old_snap = orm_snapshot(item, LrvItemOut)
    apply_patch_fields(item, patch_data)
    item.updated_at = datetime.now(timezone.utc)
    await session.flush()

    new_snap = orm_snapshot(item, LrvItemOut)
    old_diff, new_diff = extract_changed_fields(old_snap, new_snap)
    await record_audit_log(
        session,
        action="UPDATE",
        entity_type="lrv_item",
        entity_id=str(item.id),
        user=current_user,
        old_data=old_diff,
        new_data=new_diff,
        ip_address=get_client_ip(request),
        rd_code=item.rd_code,
        summary=f"Обновлена позиция ЛРВ «{item.lrv_code}» (v{item.version})",
    )
    await event_bus.emit_delta(
        session,
        event="lrv.updated",
        entity_type="lrv_item",
        entity_id=item.id,
        version=item.version,
        updated_by=current_user.login,
        data=new_snap,
    )
    return LrvItemOut.model_validate(item)


@router.post("/{item_id}/supersede", response_model=LrvItemOut)
async def supersede_lrv_item(
    item_id: uuid.UUID,
    payload: LrvSupersedeRequest,
    request: Request,
    current_user: User = Depends(require_permission("can_edit_lrv_catalog")),
    session: AsyncSession = Depends(get_db_session),
) -> LrvItemOut:
    """Mark an LRV catalog item as superseded (РД/письмо об изменении) and optionally create replacement."""
    item = (await session.execute(select(LrvItem).where(LrvItem.id == item_id))).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Позиция ЛРВ не найдена.")

    patch_data = payload.model_dump(exclude_unset=True)
    enforce_optimistic_lock(
        entity_type="lrv_item",
        entity_obj=item,
        expected_version=payload.version,
        patch_data=patch_data,
        schema_cls=LrvItemOut,
    )

    old_snap = orm_snapshot(item, LrvItemOut)
    item.status = LrvStatusEnum.SUPERSEDED
    item.replacement_letter = payload.replacement_letter.strip()
    item.replacement_date = payload.replacement_date
    item.version += 1
    item.updated_at = datetime.now(timezone.utc)

    replacement_created: LrvItem | None = None
    if payload.new_item is not None:
        replacement_created = _build_lrv_item(payload.new_item)
        session.add(replacement_created)

    await session.flush()

    new_snap = orm_snapshot(item, LrvItemOut)
    await record_audit_log(
        session,
        action="UPDATE",
        entity_type="lrv_item",
        entity_id=str(item.id),
        user=current_user,
        old_data={"status": old_snap.get("status")},
        new_data={
            "status": item.status.value,
            "replacement_letter": item.replacement_letter,
            "replacement_id": str(replacement_created.id) if replacement_created else None,
        },
        ip_address=get_client_ip(request),
        rd_code=item.rd_code,
        summary=f"Позиция ЛРВ «{item.lrv_code}» переведена в superseded ({item.replacement_letter})",
    )
    await event_bus.emit_delta(
        session,
        event="lrv.superseded",
        entity_type="lrv_item",
        entity_id=item.id,
        version=item.version,
        updated_by=current_user.login,
        data=new_snap,
    )
    return LrvItemOut.model_validate(item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lrv_item(
    item_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_permission("can_edit_lrv_catalog")),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    item = (await session.execute(select(LrvItem).where(LrvItem.id == item_id))).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Позиция ЛРВ не найдена.")

    linked_joints = list(
        (
            await session.execute(
                select(WeldJoint).where(
                    or_(
                        WeldJoint.lrv1_item_id == item.id,
                        WeldJoint.lrv2_item_id == item.id,
                        and_(
                            WeldJoint.rd_code == item.rd_code,
                            or_(
                                WeldJoint.lrv1_code == item.lrv_code,
                                WeldJoint.lrv2_code == item.lrv_code,
                            ),
                        ),
                    )
                )
            )
        )
        .scalars()
        .all()
    )
    if linked_joints:
        raise_referential_integrity_error(
            "lrv_item",
            (
                f"Невозможно удалить позицию ЛРВ «{item.lrv_code}»: она использована "
                f"в {len(linked_joints)} стыках. Используйте supersede (перевод в заменённые)."
            ),
            references_count=len(linked_joints),
        )

    old_snap = orm_snapshot(item, LrvItemOut)
    await session.delete(item)
    await record_audit_log(
        session,
        action="DELETE",
        entity_type="lrv_item",
        entity_id=str(item_id),
        user=current_user,
        old_data=old_snap,
        ip_address=get_client_ip(request),
        rd_code=item.rd_code,
        summary=f"Удалена позиция ЛРВ «{item.lrv_code}»",
    )
    await event_bus.emit_delta(
        session,
        event="lrv.deleted",
        entity_type="lrv_item",
        entity_id=item_id,
        version=item.version,
        updated_by=current_user.login,
        data={"id": str(item_id)},
    )
