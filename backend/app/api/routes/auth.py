from __future__ import annotations

import uuid
from dataclasses import asdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, get_current_user
from app.core.config import get_settings
from app.core.database import get_db_session
from app.core.rate_limit import login_rate_limiter
from app.core.security import (
    create_access_token,
    hash_password,
    parse_device_label,
    verify_password,
)
from app.models.enums import SystemRoleEnum
from app.models.session import UserSession
from app.models.user import User
from app.schemas.auth import (
    BearerTokenResponse,
    ChangePasswordRequest,
    LoginRequest,
    RolePermissionsSchema,
    SessionResponse,
    UserPublicSchema,
    UserSessionOut,
)
from app.services.audit_service import record_audit_log
from app.services.rbac import get_role_permissions

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _append_partitioned_cookie_attr(response: Response, cookie_name: str) -> None:
    """Append CHIPS Partitioned attribute on Set-Cookie header when SameSite=None + Secure."""
    raw_headers = list(response.raw_headers)
    updated = False
    for idx, (header_key, header_val) in enumerate(raw_headers):
        if header_key.lower() == b"set-cookie":
            decoded = header_val.decode("latin-1")
            if decoded.startswith(f"{cookie_name}=") and "partitioned" not in decoded.lower():
                raw_headers[idx] = (header_key, f"{decoded}; Partitioned".encode("latin-1"))
                updated = True
    if updated:
        response.raw_headers = raw_headers


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
    if settings.cookie_partitioned and settings.cookie_secure and settings.cookie_samesite == "none":
        _append_partitioned_cookie_attr(response, settings.cookie_name)


def _clear_auth_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=settings.cookie_name,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path="/",
    )
    if settings.cookie_partitioned and settings.cookie_secure and settings.cookie_samesite == "none":
        _append_partitioned_cookie_attr(response, settings.cookie_name)


def _build_user_session(
    *,
    user: User,
    request: Request,
    session_id: uuid.UUID,
    expires_at: datetime,
) -> UserSession:
    now = datetime.now(timezone.utc)
    user_agent = (request.headers.get("User-Agent") or "")[:512]
    return UserSession(
        id=session_id,
        user_id=user.id,
        ip_address=get_client_ip(request),
        user_agent=user_agent,
        device_label=parse_device_label(user_agent),
        created_at=now,
        last_seen_at=now,
        expires_at=expires_at,
        revoked_at=None,
    )


async def _revoke_user_sessions(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    exclude_session_id: uuid.UUID | None = None,
) -> int:
    now = datetime.now(timezone.utc)
    stmt = select(UserSession).where(
        UserSession.user_id == user_id,
        UserSession.revoked_at.is_(None),
    )
    rows = (await session.execute(stmt)).scalars().all()
    revoked_count = 0
    for row in rows:
        if exclude_session_id is not None and row.id == exclude_session_id:
            continue
        row.revoked_at = now
        revoked_count += 1
    return revoked_count


async def _authenticate_user(
    *,
    payload: LoginRequest,
    request: Request,
    session: AsyncSession,
) -> tuple[User, str, datetime, uuid.UUID]:
    ip_address = get_client_ip(request)
    ip_key = ip_address or "unknown"

    allowed, retry_after = await login_rate_limiter.check_allowed(ip_key, payload.login, session=session)
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

    if user is not None and not user.is_active:
        await login_rate_limiter.record_failure(ip_key, payload.login, session=session)
        await record_audit_log(
            session,
            action="login_failed",
            entity_type="auth",
            entity_id=str(user.id),
            user=user,
            user_login_override=normalized_login,
            new_data={"reason": "user_inactive"},
            ip_address=ip_address,
            summary=f"Попытка входа в деактивированную учётную запись «{normalized_login}»",
        )
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Учётная запись деактивирована. Обратитесь к администратору.",
        )

    if user is None or not verify_password(payload.password, user.password_hash):
        await login_rate_limiter.record_failure(ip_key, payload.login, session=session)
        await record_audit_log(
            session,
            action="login_failed",
            entity_type="auth",
            entity_id=str(user.id) if user is not None else normalized_login,
            user=user,
            user_login_override=normalized_login,
            new_data={"reason": "invalid_credentials"},
            ip_address=ip_address,
            summary=f"Неудачная попытка входа под логином «{normalized_login}»",
        )
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль.",
        )

    await login_rate_limiter.reset_for_login(ip_key, payload.login, session=session)
    session_id = uuid.uuid4()
    token, expires_at = create_access_token(
        user_id=user.id,
        login=user.login,
        role=user.role.value,
        session_number=user.session_number,
        session_id=session_id,
    )
    user_session = _build_user_session(
        user=user,
        request=request,
        session_id=session_id,
        expires_at=expires_at,
    )
    session.add(user_session)
    await record_audit_log(
        session,
        action="login_success",
        entity_type="auth",
        entity_id=str(user.id),
        user=user,
        new_data={
            "role": user.role.value,
            "department": user.department.value,
            "session_number": user.session_number,
            "session_id": str(session_id),
            "device": user_session.device_label,
        },
        ip_address=ip_address,
        summary=f"Вход в систему: {user.full_name} ({user.role.value}/{user.department.value})",
    )
    await session.commit()
    return user, token, expires_at, session_id


@router.post("/login", response_model=SessionResponse)
async def login_with_cookie(
    payload: LoginRequest,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_db_session),
) -> SessionResponse:
    """Authenticate user, persist per-device UserSession, and issue HttpOnly JWT cookie."""
    user, token, expires_at, session_id = await _authenticate_user(
        payload=payload, request=request, session=session
    )
    _set_auth_cookie(response, token)
    perms = RolePermissionsSchema(**asdict(get_role_permissions(user.role, user.department)))
    return SessionResponse(
        user=UserPublicSchema.model_validate(user),
        permissions=perms,
        expires_at=expires_at,
        session_id=session_id,
    )


@router.post("/token", response_model=BearerTokenResponse)
async def login_for_bearer_token(
    payload: LoginRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> BearerTokenResponse:
    """Rate-limited endpoint issuing a Bearer JWT bound to a tracked UserSession."""
    user, token, expires_at, session_id = await _authenticate_user(
        payload=payload, request=request, session=session
    )
    perms = RolePermissionsSchema(**asdict(get_role_permissions(user.role, user.department)))
    return BearerTokenResponse(
        access_token=token,
        expires_at=expires_at,
        session_id=session_id,
        user=UserPublicSchema.model_validate(user),
        permissions=perms,
    )


@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(
    request: Request,
    response: Response,
    all_devices: bool = Query(default=False),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, str]:
    """
    Revoke only the current device session by default, or all sessions when all_devices=true
    (or for legacy tokens without a session_id).
    """
    now = datetime.now(timezone.utc)
    active_session: UserSession | None = getattr(request.state, "current_session", None)

    if all_devices or active_session is None:
        await _revoke_user_sessions(session, user_id=current_user.id)
        current_user.session_number += 1
        current_user.version += 1
        summary = f"Выход со всех устройств: {current_user.login}"
    else:
        active_session.revoked_at = now
        summary = f"Выход из системы ({active_session.device_label}): {current_user.login}"

    await record_audit_log(
        session,
        action="logout",
        entity_type="auth",
        entity_id=str(current_user.id),
        user=current_user,
        new_data={"all_devices": bool(all_devices or active_session is None)},
        ip_address=get_client_ip(request),
        summary=summary,
    )
    await session.commit()
    _clear_auth_cookie(response)
    return {"status": "ok"}


@router.get("/session", response_model=SessionResponse)
@router.get("/me", response_model=SessionResponse)
async def get_session(
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> SessionResponse:
    """Return authenticated user profile, RBAC matrix, and current session metadata."""
    active_session: UserSession | None = getattr(request.state, "current_session", None)
    if active_session is not None:
        # Persist throttled last_seen_at update when touched during session check
        await session.commit()
    perms = RolePermissionsSchema(
        **asdict(get_role_permissions(current_user.role, current_user.department))
    )
    return SessionResponse(
        user=UserPublicSchema.model_validate(current_user),
        permissions=perms,
        expires_at=active_session.expires_at if active_session is not None else None,
        session_id=active_session.id if active_session is not None else None,
    )


@router.post("/refresh", response_model=SessionResponse)
async def refresh_session(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> SessionResponse:
    """Extend active device session lifetime (sliding expiration) and reissue HttpOnly cookie."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    active_session: UserSession | None = getattr(request.state, "current_session", None)

    if active_session is not None:
        session_id = active_session.id
        token, expires_at = create_access_token(
            user_id=current_user.id,
            login=current_user.login,
            role=current_user.role.value,
            session_number=current_user.session_number,
            session_id=session_id,
        )
        active_session.last_seen_at = now
        active_session.expires_at = expires_at
        client_ip = get_client_ip(request)
        if client_ip:
            active_session.ip_address = client_ip
    else:
        session_id = uuid.uuid4()
        token, expires_at = create_access_token(
            user_id=current_user.id,
            login=current_user.login,
            role=current_user.role.value,
            session_number=current_user.session_number,
            session_id=session_id,
            expires_delta=timedelta(minutes=settings.jwt_access_token_expire_minutes),
        )
        session.add(
            _build_user_session(
                user=current_user,
                request=request,
                session_id=session_id,
                expires_at=expires_at,
            )
        )

    await session.commit()
    _set_auth_cookie(response, token)
    perms = RolePermissionsSchema(
        **asdict(get_role_permissions(current_user.role, current_user.department))
    )
    return SessionResponse(
        user=UserPublicSchema.model_validate(current_user),
        permissions=perms,
        expires_at=expires_at,
        session_id=session_id,
    )


@router.post("/change-password", response_model=SessionResponse)
async def change_own_password(
    payload: ChangePasswordRequest,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> SessionResponse:
    """Rotate user's own password, revoke all prior sessions, and issue a fresh device session."""
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Текущий пароль указан неверно.",
        )

    if payload.current_password == payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Новый пароль должен отличаться от текущего.",
        )

    current_user.password_hash = hash_password(payload.new_password)
    current_user.must_change_password = False
    current_user.session_number += 1
    current_user.version += 1

    await _revoke_user_sessions(session, user_id=current_user.id)

    new_session_id = uuid.uuid4()
    token, expires_at = create_access_token(
        user_id=current_user.id,
        login=current_user.login,
        role=current_user.role.value,
        session_number=current_user.session_number,
        session_id=new_session_id,
    )
    session.add(
        _build_user_session(
            user=current_user,
            request=request,
            session_id=new_session_id,
            expires_at=expires_at,
        )
    )

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

    _set_auth_cookie(response, token)
    perms = RolePermissionsSchema(
        **asdict(get_role_permissions(current_user.role, current_user.department))
    )
    return SessionResponse(
        user=UserPublicSchema.model_validate(current_user),
        permissions=perms,
        expires_at=expires_at,
        session_id=new_session_id,
    )


@router.get("/sessions", response_model=list[UserSessionOut])
async def list_my_sessions(
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[UserSessionOut]:
    """List active non-expired sessions for the authenticated user."""
    now = datetime.now(timezone.utc)
    current_session_id: uuid.UUID | None = getattr(request.state, "current_session_id", None)
    rows = (
        await session.execute(
            select(UserSession)
            .where(
                UserSession.user_id == current_user.id,
                UserSession.revoked_at.is_(None),
                UserSession.expires_at > now,
            )
            .order_by(UserSession.last_seen_at.desc())
        )
    ).scalars().all()
    return [
        UserSessionOut(
            id=row.id,
            device_label=row.device_label or "Браузер",
            ip_address=row.ip_address,
            created_at=row.created_at,
            last_seen_at=row.last_seen_at,
            expires_at=row.expires_at,
            is_current=current_session_id is not None and row.id == current_session_id,
        )
        for row in rows
    ]


@router.post("/sessions/revoke-others", status_code=status.HTTP_200_OK)
async def revoke_other_sessions(
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, int | str]:
    """Revoke all active sessions for the current user except the current device."""
    current_session_id: uuid.UUID | None = getattr(request.state, "current_session_id", None)
    revoked_count = await _revoke_user_sessions(
        session,
        user_id=current_user.id,
        exclude_session_id=current_session_id,
    )
    await record_audit_log(
        session,
        action="sessions_revoked_others",
        entity_type="auth",
        entity_id=str(current_user.id),
        user=current_user,
        new_data={"revoked_count": revoked_count},
        ip_address=get_client_ip(request),
        summary=f"Пользователь «{current_user.login}» завершил остальные сессии ({revoked_count})",
    )
    await session.commit()
    return {"status": "ok", "revoked_count": revoked_count}


@router.delete("/sessions/{session_id}", status_code=status.HTTP_200_OK)
async def revoke_single_session(
    session_id: uuid.UUID,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, str]:
    """Revoke a specific session owned by the current user (or any session if SUPERADMIN)."""
    target = (
        await session.execute(select(UserSession).where(UserSession.id == session_id))
    ).scalar_one_or_none()
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Сессия не найдена.",
        )
    if target.user_id != current_user.id and current_user.role != SystemRoleEnum.SUPERADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Нельзя завершить сессию другого пользователя.",
        )

    now = datetime.now(timezone.utc)
    if target.revoked_at is None:
        target.revoked_at = now
        await record_audit_log(
            session,
            action="session_revoked",
            entity_type="auth",
            entity_id=str(target.id),
            user=current_user,
            new_data={"target_user_id": str(target.user_id), "device": target.device_label},
            ip_address=get_client_ip(request),
            summary=f"Завершена сессия ({target.device_label})",
        )
        await session.commit()

    current_session_id: uuid.UUID | None = getattr(request.state, "current_session_id", None)
    if current_session_id is not None and target.id == current_session_id:
        _clear_auth_cookie(response)
    return {"status": "ok"}
