from __future__ import annotations

import ipaddress
import uuid
from collections.abc import Callable, Sequence
from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db_session
from app.core.security import (
    QueryTokenForbiddenError,
    TokenError,
    decode_access_token,
    extract_token_with_source,
)
from app.models.enums import DepartmentEnum, SystemRoleEnum
from app.models.session import UserSession
from app.models.user import User
from app.services.rbac import (
    DEPARTMENT_LABELS_RU,
    ROLE_RANK,
    RolePermissions,
    get_role_permissions,
)

_MUTATING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def _normalize_origin(raw_url: str) -> str | None:
    parsed = urlparse(raw_url.strip())
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"


def _is_trusted_proxy(request: Request) -> bool:
    settings = get_settings()
    if settings.trust_all_proxies:
        return True
    peer_host = request.client.host if request.client else None
    if not peer_host:
        return False
    try:
        peer_ip = ipaddress.ip_address(peer_host)
    except ValueError:
        return False
    return any(peer_ip in net for net in settings.trusted_proxy_networks)


def _is_trusted_origin(origin: str, request: Request) -> bool:
    settings = get_settings()
    allowed = {o.rstrip("/").lower() for o in settings.cors_origins}
    if origin in allowed:
        return True
    host_candidates = {
        (request.headers.get("Host") or "").strip().lower(),
    }
    if _is_trusted_proxy(request):
        forwarded_host = (request.headers.get("X-Forwarded-Host") or "").split(",")[0].strip().lower()
        if forwarded_host:
            host_candidates.add(forwarded_host)
    host_candidates.discard("")
    for host in host_candidates:
        if origin in {f"http://{host}", f"https://{host}"}:
            return True
    return False


def verify_cookie_csrf(request: Request) -> None:
    """Reject cross-site mutating requests authenticated via HttpOnly cookies."""
    if request.method.upper() not in _MUTATING_METHODS:
        return

    origin_header = request.headers.get("Origin")
    if origin_header:
        normalized = _normalize_origin(origin_header)
        if not normalized or not _is_trusted_origin(normalized, request):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Запрос отклонён политикой безопасности (недоверенный источник Origin).",
            )
        return

    referer_header = request.headers.get("Referer")
    if referer_header:
        normalized_ref = _normalize_origin(referer_header)
        if not normalized_ref or not _is_trusted_origin(normalized_ref, request):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Запрос отклонён политикой безопасности (недоверенный Referer).",
            )
        return

    if request.headers.get("X-Requested-With", "").strip().lower() != "xmlhttprequest":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="X-Requested-With header is required for cookie-authenticated requests without Origin/Referer.",
        )

def get_client_ip(request: Request) -> str | None:
    """Safely parse client IP, trusting X-Forwarded-For only from configured proxies."""
    candidate = ""
    if _is_trusted_proxy(request):
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            candidate = forwarded_for.split(",")[0].strip()
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
        token, token_source = extract_token_with_source(request)
        if token_source == "cookie":
            verify_cookie_csrf(request)
        payload = decode_access_token(token)
        user_id = uuid.UUID(payload["sub"])
        token_session_number = int(payload["session_number"])
        raw_sid = payload.get("sid")
        session_id = uuid.UUID(raw_sid) if isinstance(raw_sid, str) and raw_sid else None
    except HTTPException:
        raise
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

    active_session: UserSession | None = None
    if session_id is not None:
        active_session = (
            await session.execute(
                select(UserSession).where(
                    UserSession.id == session_id,
                    UserSession.user_id == user.id,
                )
            )
        ).scalar_one_or_none()
        now = datetime.now(timezone.utc)
        if (
            active_session is None
            or active_session.revoked_at is not None
            or active_session.expires_at <= now
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Сессия на этом устройстве была завершена или истекла. Выполните вход повторно.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if (now - active_session.last_seen_at).total_seconds() >= 60:
            active_session.last_seen_at = now

    request.state.current_session_id = session_id
    request.state.current_session = active_session
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
