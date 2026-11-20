from __future__ import annotations

import ipaddress
import uuid
from collections.abc import Callable, Sequence

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.security import (
    QueryTokenForbiddenError,
    TokenError,
    decode_access_token,
    extract_token_from_request,
)
from app.models.enums import DepartmentEnum, SystemRoleEnum
from app.models.user import User
from app.services.rbac import (
    DEPARTMENT_LABELS_RU,
    ROLE_RANK,
    RolePermissions,
    get_role_permissions,
)


def get_client_ip(request: Request) -> str | None:
    """Safely parse client IP (for PostgreSQL INET column and rate limiting)."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    candidate = forwarded_for.split(",")[0].strip() if forwarded_for else ""
    if not candidate and request.client:
        candidate = request.client.host
    if not candidate:
        return None
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return None


async def get_current_user(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> User:
    """Authenticate caller strictly via HttpOnly Cookie or Authorization: Bearer header."""
    try:
        token = extract_token_from_request(request)
        payload = decode_access_token(token)
        user_id = uuid.UUID(payload["sub"])
        token_session_number = int(payload["session_number"])
    except (QueryTokenForbiddenError, TokenError, ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Учётная запись не найдена.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Deactivated user immediately loses API access with 403 Forbidden
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Учётная запись деактивирована. Доступ к API запрещён.",
        )

    if user.session_number != token_session_number:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Сессия устарела или была завершена. Выполните вход повторно.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def get_current_permissions(
    current_user: User = Depends(get_current_user),
) -> RolePermissions:
    return get_role_permissions(current_user.role, current_user.department)


def require_superadmin() -> Callable[[User], User]:
    """Dependency allowing strictly SUPERADMIN."""

    async def _superadmin_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role != SystemRoleEnum.SUPERADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Операция доступна исключительно суперадмину (SUPERADMIN).",
            )
        return current_user

    return _superadmin_checker


def require_dept_access(
    allowed_departments: Sequence[DepartmentEnum],
    min_role: SystemRoleEnum = SystemRoleEnum.OPERATOR,
) -> Callable[[User], User]:
    """
    Dependency enforcing hierarchical role level and department membership:
    - SUPERADMIN passes always.
    - DEPT_ADMIN passes if user.department in allowed_departments (and min_role <= DEPT_ADMIN).
    - OPERATOR passes if min_role <= OPERATOR and user.department in allowed_departments.
    - VIEWER fails any write dependency where min_role > VIEWER.
    """
    allowed_dept_set = frozenset(allowed_departments)
    min_rank = ROLE_RANK[min_role]

    async def _dept_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role == SystemRoleEnum.SUPERADMIN:
            return current_user

        if ROLE_RANK.get(current_user.role, -1) < min_rank:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Недостаточно прав для роли {current_user.role.value}. "
                    f"Требуется уровень не ниже {min_role.value}."
                ),
            )

        if current_user.department not in allowed_dept_set:
            dept_names = ", ".join(
                DEPARTMENT_LABELS_RU.get(d, d.value) for d in allowed_departments
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Доступ разрешён только для отделов: {dept_names}. "
                    f"Ваш отдел: {DEPARTMENT_LABELS_RU.get(current_user.department, current_user.department.value)}."
                ),
            )

        return current_user

    return _dept_checker


def require_roles(*allowed_roles: SystemRoleEnum) -> Callable[[User], User]:
    """Dependency enforcing membership in an explicit set of SystemRoleEnum roles."""
    allowed_set = frozenset(allowed_roles)

    async def _role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_set:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Недостаточно прав для роли {current_user.role.value}. "
                    f"Требуется одна из ролей: {', '.join(r.value for r in allowed_roles)}."
                ),
            )
        return current_user

    return _role_checker


def require_permission(permission_attr: str) -> Callable[[User], User]:
    """Dependency enforcing a boolean capability flag on RolePermissions."""

    async def _permission_checker(current_user: User = Depends(get_current_user)) -> User:
        perms = get_role_permissions(current_user.role, current_user.department)
        if not bool(getattr(perms, permission_attr, False)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Операция запрещена для роли {perms.label} "
                    f"({current_user.role.value}/{current_user.department.value})."
                ),
            )
        return current_user

    return _permission_checker
