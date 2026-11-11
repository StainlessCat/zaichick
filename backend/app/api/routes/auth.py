from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, get_current_user
from app.core.config import get_settings
from app.core.database import get_db_session
from app.core.rate_limit import login_rate_limiter
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import (
    BearerTokenResponse,
    ChangePasswordRequest,
    LoginRequest,
    RolePermissionsSchema,
    SessionResponse,
    UserPublicSchema,
)
from app.services.audit_service import record_audit_log
from app.services.rbac import get_role_permissions

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_auth_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.cookie_name,
        value=token,
        max_age=settings.jwt_access_token_expire_minutes * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path="/",
    )


def _clear_auth_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=settings.cookie_name,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path="/",
    )


async def _authenticate_user(
    *,
    payload: LoginRequest,
    request: Request,
    session: AsyncSession,
) -> tuple[User, str, object]:
    ip_address = get_client_ip(request)
    ip_key = ip_address or "unknown"

    allowed, retry_after = await login_rate_limiter.check_allowed(ip_key, payload.login)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                "Превышено допустимое число попыток входа. "
                f"Повторите попытку через {retry_after} сек."
            ),
            headers={"Retry-After": str(retry_after)},
        )

    normalized_login = payload.login.strip().lower()
    user = (
        await session.execute(
            select(User).where(func.lower(func.btrim(User.login)) == normalized_login)
        )
    ).scalar_one_or_none()

    if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
        await login_rate_limiter.record_failure(ip_key, payload.login)
        await record_audit_log(
            session,
            action="login_failed",
            entity_type="auth",
            entity_id=str(user.id) if user is not None else normalized_login,
            user=user,
            user_login_override=normalized_login,
            new_data={"reason": "invalid_credentials_or_inactive"},
            ip_address=ip_address,
            summary=f"Неудачная попытка входа под логином «{normalized_login}»",
        )
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль, либо учётная запись деактивирована.",
        )

    await login_rate_limiter.reset_for_login(ip_key, payload.login)
    token, expires_at = create_access_token(
        user_id=user.id,
        login=user.login,
        role=user.role.value,
        session_number=user.session_number,
    )
    await record_audit_log(
        session,
        action="login_success",
        entity_type="auth",
        entity_id=str(user.id),
        user=user,
        new_data={"role": user.role.value, "session_number": user.session_number},
        ip_address=ip_address,
        summary=f"Вход в систему: {user.full_name} ({user.role.value})",
    )
    await session.commit()
    return user, token, expires_at


@router.post("/login", response_model=SessionResponse)
async def login_with_cookie(
    payload: LoginRequest,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_db_session),
) -> SessionResponse:
    """Authenticate user, write login_success to audit_logs, and issue HttpOnly SameSite=Lax JWT cookie."""
    user, token, expires_at = await _authenticate_user(
        payload=payload, request=request, session=session
    )
    _set_auth_cookie(response, token)
    perms = RolePermissionsSchema(**asdict(get_role_permissions(user.role)))
    return SessionResponse(
        user=UserPublicSchema.model_validate(user),
        permissions=perms,
        expires_at=expires_at,
    )


@router.post("/token", response_model=BearerTokenResponse)
async def login_for_bearer_token(
    payload: LoginRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> BearerTokenResponse:
    """Rate-limited endpoint issuing a Bearer JWT for programmatic API clients."""
    user, token, expires_at = await _authenticate_user(
        payload=payload, request=request, session=session
    )
    perms = RolePermissionsSchema(**asdict(get_role_permissions(user.role)))
    return BearerTokenResponse(
        access_token=token,
        expires_at=expires_at,
        user=UserPublicSchema.model_validate(user),
        permissions=perms,
    )


@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, str]:
    """Invalidate current user's JWTs via session_number bump, clear HttpOnly cookie, and log audit."""
    current_user.session_number += 1
    current_user.version += 1
    await record_audit_log(
        session,
        action="logout",
        entity_type="auth",
        entity_id=str(current_user.id),
        user=current_user,
        ip_address=get_client_ip(request),
        summary=f"Выход из системы: {current_user.login}",
    )
    await session.commit()
    _clear_auth_cookie(response)
    return {"status": "ok"}


@router.get("/session", response_model=SessionResponse)
async def get_session(current_user: User = Depends(get_current_user)) -> SessionResponse:
    """Return authenticated user profile and RBAC matrix (401 when unauthenticated)."""
    perms = RolePermissionsSchema(**asdict(get_role_permissions(current_user.role)))
    return SessionResponse(
        user=UserPublicSchema.model_validate(current_user),
        permissions=perms,
    )


@router.post("/change-password", response_model=SessionResponse)
async def change_own_password(
    payload: ChangePasswordRequest,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> SessionResponse:
    """Allow an authenticated user to rotate their own password and invalidate prior sessions."""
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Текущий пароль указан неверно.",
        )

    current_user.password_hash = hash_password(payload.new_password)
    current_user.must_change_password = False
    current_user.session_number += 1
    current_user.version += 1

    await record_audit_log(
        session,
        action="password_changed",
        entity_type="user",
        entity_id=str(current_user.id),
        user=current_user,
        new_data={"must_change_password": False, "session_number": current_user.session_number},
        ip_address=get_client_ip(request),
        summary=f"Пользователь «{current_user.login}» сменил пароль",
    )
    await session.commit()
    await session.refresh(current_user)

    token, expires_at = create_access_token(
        user_id=current_user.id,
        login=current_user.login,
        role=current_user.role.value,
        session_number=current_user.session_number,
    )
    _set_auth_cookie(response, token)
    perms = RolePermissionsSchema(**asdict(get_role_permissions(current_user.role)))
    return SessionResponse(
        user=UserPublicSchema.model_validate(current_user),
        permissions=perms,
        expires_at=expires_at,
    )
