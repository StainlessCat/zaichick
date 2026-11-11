from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from fastapi import Request
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher

from app.core.config import get_settings

_password_hasher = PasswordHash((Argon2Hasher(),))


class TokenError(Exception):
    """Raised when authentication credentials are missing, malformed, or disallowed."""


class QueryTokenForbiddenError(TokenError):
    """Raised when client attempts to pass an access token via URL query parameter."""


def hash_password(plain_password: str) -> str:
    """Hash a plaintext password using Argon2id (via pwdlib)."""
    return _password_hasher.hash(plain_password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Verify a plaintext password against a stored Argon2 hash."""
    if not plain_password or not password_hash:
        return False
    try:
        return _password_hasher.verify(plain_password, password_hash)
    except Exception:
        return False


def create_access_token(
    *,
    user_id: uuid.UUID,
    login: str,
    role: str,
    session_number: int,
    expires_delta: timedelta | None = None,
) -> tuple[str, datetime]:
    """Create a signed JWT access token and return (token, expires_at)."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    delta = expires_delta or timedelta(minutes=settings.jwt_access_token_expire_minutes)
    expires_at = now + delta
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "login": login,
        "role": role,
        "session_number": session_number,
        "jti": str(uuid.uuid4()),
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return token, expires_at


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate JWT signature, expiration, and required claims."""
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["sub", "role", "session_number", "exp"]},
        )
    except jwt.PyJWTError as exc:
        raise TokenError("Недействительный или просроченный токен авторизации.") from exc

    if not isinstance(payload.get("sub"), str) or not payload.get("sub"):
        raise TokenError("Токен не содержит идентификатор пользователя.")
    return payload


def extract_token_from_request(request: Request) -> str:
    """
    Extract JWT strictly from Authorization: Bearer header or HttpOnly Cookie.
    Explicitly rejects ?token= in URL query parameters to avoid proxy/log leaks.
    """
    if "token" in request.query_params or "access_token" in request.query_params:
        raise QueryTokenForbiddenError(
            "Передача токена авторизации в URL (?token=) запрещена. "
            "Используйте HttpOnly Cookie или заголовок Authorization: Bearer."
        )

    auth_header = request.headers.get("Authorization", "")
    if auth_header:
        scheme, _, credentials = auth_header.partition(" ")
        if scheme.lower() == "bearer" and credentials.strip():
            return credentials.strip()
        raise TokenError("Некорректный формат заголовка Authorization (ожидается Bearer <token>).")

    settings = get_settings()
    cookie_token = request.cookies.get(settings.cookie_name)
    if cookie_token and cookie_token.strip():
        return cookie_token.strip()

    raise TokenError("Требуется авторизация.")
