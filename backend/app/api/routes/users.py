from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_roles
from app.api.routes.admin import (
    create_managed_user,
    list_managed_users,
    update_managed_user,
)
from app.core.database import get_db_session
from app.models.enums import SystemRoleEnum
from app.models.user import User
from app.schemas.auth import CreateUserRequest, UpdateUserRequest, UserPublicSchema

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[UserPublicSchema])
async def list_users(
    current_user: User = Depends(
        require_roles(SystemRoleEnum.SUPERADMIN, SystemRoleEnum.DEPT_ADMIN)
    ),
    session: AsyncSession = Depends(get_db_session),
) -> list[UserPublicSchema]:
    """List users visible to SUPERADMIN or DEPT_ADMIN."""
    return await list_managed_users(current_user, session)


@router.post("", response_model=UserPublicSchema, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: CreateUserRequest,
    request: Request,
    current_user: User = Depends(
        require_roles(SystemRoleEnum.SUPERADMIN, SystemRoleEnum.DEPT_ADMIN)
    ),
    session: AsyncSession = Depends(get_db_session),
) -> UserPublicSchema:
    """Create a user enforcing hierarchical RBAC and department boundaries."""
    return await create_managed_user(payload, request, current_user, session)


@router.patch("/{user_id}", response_model=UserPublicSchema)
async def update_user(
    user_id: uuid.UUID,
    payload: UpdateUserRequest,
    request: Request,
    current_user: User = Depends(
        require_roles(SystemRoleEnum.SUPERADMIN, SystemRoleEnum.DEPT_ADMIN)
    ),
    session: AsyncSession = Depends(get_db_session),
) -> UserPublicSchema:
    """Update user role/department/status/profile enforcing hierarchical RBAC."""
    return await update_managed_user(user_id, payload, request, current_user, session)
