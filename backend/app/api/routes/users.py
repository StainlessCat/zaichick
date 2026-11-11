from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, require_roles
from app.core.database import get_db_session
from app.core.security import hash_password
from app.models.enums import RoleEnum
from app.models.user import User
from app.schemas.auth import CreateUserRequest, UpdateUserRequest, UserPublicSchema
from app.services.audit_service import extract_changed_fields, record_audit_log

router = APIRouter(prefix="/api/users", tags=["users"])


def _user_snapshot(user: User) -> dict[str, object]:
    return {
        "login": user.login,
        "full_name": user.full_name,
        "role": user.role.value,
        "department": user.department,
        "position_title": user.position_title,
        "is_active": user.is_active,
        "must_change_password": user.must_change_password,
        "version": user.version,
    }


@router.get("", response_model=list[UserPublicSchema])
async def list_users(
    _admin: User = Depends(require_roles(RoleEnum.ADMIN)),
    session: AsyncSession = Depends(get_db_session),
) -> list[UserPublicSchema]:
    """List all user accounts (ADMIN only)."""
    users = (
        await session.execute(select(User).order_by(User.created_at.asc(), User.login.asc()))
    ).scalars().all()
    return [UserPublicSchema.model_validate(u) for u in users]


@router.post("", response_model=UserPublicSchema, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: CreateUserRequest,
    request: Request,
    admin_user: User = Depends(require_roles(RoleEnum.ADMIN)),
    session: AsyncSession = Depends(get_db_session),
) -> UserPublicSchema:
    """Create a user with explicit RoleEnum assigned by ADMIN (transactional audit)."""
    normalized_login = payload.login.strip().lower()
    existing = (
        await session.execute(
            select(User.id).where(func.lower(func.btrim(User.login)) == normalized_login)
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Пользователь с логином «{payload.login.strip()}» уже существует.",
        )

    new_user = User(
        login=payload.login.strip(),
        password_hash=hash_password(payload.password),
        full_name=payload.full_name.strip(),
        role=payload.role,
        department=payload.department.strip(),
        position_title=payload.position_title.strip(),
        session_number=1,
        is_active=True,
        must_change_password=payload.must_change_password,
        version=1,
    )
    session.add(new_user)
    await session.flush()

    await record_audit_log(
        session,
        action="user_created",
        entity_type="user",
        entity_id=str(new_user.id),
        user=admin_user,
        new_data=_user_snapshot(new_user),
        ip_address=get_client_ip(request),
        summary=f"Создан пользователь «{new_user.login}» с ролью {new_user.role.value}",
    )
    await session.commit()
    await session.refresh(new_user)
    return UserPublicSchema.model_validate(new_user)


@router.patch("/{user_id}", response_model=UserPublicSchema)
async def update_user(
    user_id: uuid.UUID,
    payload: UpdateUserRequest,
    request: Request,
    admin_user: User = Depends(require_roles(RoleEnum.ADMIN)),
    session: AsyncSession = Depends(get_db_session),
) -> UserPublicSchema:
    """Update user role/status/profile with row-level OCC version check (ADMIN only)."""
    target = (
        await session.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден.",
        )

    if target.version != payload.version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Конфликт версий учётной записи: ожидалась v{payload.version}, "
                f"актуальная v{target.version}."
            ),
        )

    # Safety guards: prevent self-lockout or removing last active ADMIN
    is_losing_admin_power = (
        target.role == RoleEnum.ADMIN
        and target.is_active
        and (
            (payload.role is not None and payload.role != RoleEnum.ADMIN)
            or payload.is_active is False
        )
    )
    if target.id == admin_user.id and payload.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Администратор не может деактивировать собственную учётную запись.",
        )
    if is_losing_admin_power:
        other_active_admins = (
            await session.execute(
                select(func.count(User.id)).where(
                    User.role == RoleEnum.ADMIN,
                    User.is_active.is_(True),
                    User.id != target.id,
                )
            )
        ).scalar_one()
        if int(other_active_admins or 0) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Нельзя снять роль или деактивировать последнего активного администратора.",
            )

    old_snap = _user_snapshot(target)

    if payload.full_name is not None:
        target.full_name = payload.full_name.strip()
    if payload.role is not None and payload.role != target.role:
        target.role = payload.role
        target.session_number += 1
    if payload.department is not None:
        target.department = payload.department.strip()
    if payload.position_title is not None:
        target.position_title = payload.position_title.strip()
    if payload.is_active is not None and payload.is_active != target.is_active:
        target.is_active = payload.is_active
        if not payload.is_active:
            target.session_number += 1
    if payload.must_change_password is not None:
        target.must_change_password = payload.must_change_password
    if payload.new_password is not None:
        target.password_hash = hash_password(payload.new_password)
        target.session_number += 1

    target.version += 1
    new_snap = _user_snapshot(target)
    old_diff, new_diff = extract_changed_fields(old_snap, new_snap)
    if payload.new_password is not None:
        new_diff = {**(new_diff or {}), "password_reset": True}

    await record_audit_log(
        session,
        action="user_modified",
        entity_type="user",
        entity_id=str(target.id),
        user=admin_user,
        old_data=old_diff,
        new_data=new_diff,
        ip_address=get_client_ip(request),
        summary=f"Обновлена учётная запись «{target.login}» (v{target.version})",
    )
    await session.commit()
    await session.refresh(target)
    return UserPublicSchema.model_validate(target)
