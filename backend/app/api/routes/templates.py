from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, get_current_user, get_db_session
from app.models.enums import RoleEnum
from app.models.settings import ColumnTemplate
from app.models.user import User
from app.schemas.domain import ColumnTemplateCreate, ColumnTemplateOut, ColumnTemplateUpdate
from app.services.audit_service import record_audit_log
from app.services.crud_helpers import orm_snapshot

router = APIRouter(prefix="/api/templates", tags=["templates"])


@router.get("", response_model=list[ColumnTemplateOut])
async def list_templates(
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[ColumnTemplateOut]:
    rows = list((await session.execute(select(ColumnTemplate))).scalars().all())
    return [ColumnTemplateOut.model_validate(r) for r in rows]


@router.post("", response_model=ColumnTemplateOut, status_code=status.HTTP_201_CREATED)
async def create_template(
    payload: ColumnTemplateCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ColumnTemplateOut:
    if current_user.role == RoleEnum.VIEWER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Наблюдатель не может создавать шаблоны.",
        )

    tpl_id = (payload.id or f"tpl-{uuid.uuid4().hex[:12]}").strip()
    now = datetime.now(timezone.utc)
    tpl = ColumnTemplate(
        id=tpl_id,
        name=payload.name.strip(),
        description=payload.description.strip(),
        is_system=payload.is_system and current_user.role == RoleEnum.ADMIN,
        column_order=list(payload.column_order),
        visible_columns=list(payload.visible_columns),
        custom_widths=dict(payload.custom_widths) if payload.custom_widths is not None else None,
        is_active_default=payload.is_active_default,
        owner_id=current_user.id,
        created_at=now,
        updated_at=now,
    )
    session.add(tpl)
    await session.flush()

    await record_audit_log(
        session,
        action="CREATE",
        entity_type="column_template",
        entity_id=tpl.id,
        user=current_user,
        new_data=orm_snapshot(tpl, ColumnTemplateOut),
        ip_address=get_client_ip(request),
        summary=f"Создан шаблон отображения «{tpl.name}»",
    )
    return ColumnTemplateOut.model_validate(tpl)


@router.patch("/{template_id}", response_model=ColumnTemplateOut)
async def update_template(
    template_id: str,
    payload: ColumnTemplateUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ColumnTemplateOut:
    if current_user.role == RoleEnum.VIEWER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Наблюдатель не может изменять шаблоны.",
        )

    tpl = (
        await session.execute(select(ColumnTemplate).where(ColumnTemplate.id == template_id))
    ).scalar_one_or_none()
    if tpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Шаблон не найден.")

    if tpl.is_system and current_user.role != RoleEnum.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Системные шаблоны может изменять только администратор.",
        )

    old_snap = orm_snapshot(tpl, ColumnTemplateOut)
    patch_data = payload.model_dump(exclude_unset=True)
    for k, v in patch_data.items():
        if hasattr(tpl, k):
            setattr(tpl, k, v)
    tpl.updated_at = datetime.now(timezone.utc)
    await session.flush()

    await record_audit_log(
        session,
        action="UPDATE",
        entity_type="column_template",
        entity_id=tpl.id,
        user=current_user,
        old_data=old_snap,
        new_data=orm_snapshot(tpl, ColumnTemplateOut),
        ip_address=get_client_ip(request),
        summary=f"Обновлён шаблон «{tpl.name}»",
    )
    return ColumnTemplateOut.model_validate(tpl)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    if current_user.role == RoleEnum.VIEWER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Наблюдатель не может удалять шаблоны.",
        )

    tpl = (
        await session.execute(select(ColumnTemplate).where(ColumnTemplate.id == template_id))
    ).scalar_one_or_none()
    if tpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Шаблон не найден.")

    if tpl.is_system and current_user.role != RoleEnum.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Системные шаблоны может удалять только администратор.",
        )

    old_snap = orm_snapshot(tpl, ColumnTemplateOut)
    await session.delete(tpl)
    await record_audit_log(
        session,
        action="DELETE",
        entity_type="column_template",
        entity_id=template_id,
        user=current_user,
        old_data=old_snap,
        ip_address=get_client_ip(request),
        summary=f"Удалён шаблон «{tpl.name}»",
    )
