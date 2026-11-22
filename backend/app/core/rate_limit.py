from __future__ import annotations

import asyncio
from collections import deque
from datetime import datetime, timedelta, timezone
import math
import time

from sqlalchemy import case, delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.rate_limit import LoginRateLimit


class SlidingWindowRateLimiter:
    """
    Distributed multi-worker rate limiter for /api/auth/login.
    Persists attempt counters in PostgreSQL (shared across all uvicorn worker processes)
    with automatic sliding TTL expiration, paired with in-memory fallback for isolated testing.
    Tracks failed login attempts both by source IP and by (IP, normalized login).
    """

    def __init__(self, max_attempts: int | None = None, window_seconds: int | None = None) -> None:
        settings = get_settings()
        self.max_attempts = (
            max_attempts if max_attempts is not None else settings.login_rate_limit_attempts
        )
        self.window_seconds = (
            window_seconds
            if window_seconds is not None
            else settings.login_rate_limit_window_seconds
        )
        self._buckets: dict[str, deque[float]] = {}
        self._lock = asyncio.Lock()

    def _prune(self, bucket: deque[float], now: float) -> None:
        cutoff = now - self.window_seconds
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()

    @staticmethod
    def _keys(ip_address: str, login: str) -> tuple[str, str]:
        ip_key = f"ip:{ip_address or 'unknown'}"
        pair_key = f"ip_login:{ip_address or 'unknown'}:{login.strip().lower()}"
        return ip_key, pair_key

    async def check_allowed(
        self,
        ip_address: str,
        login: str,
        session: AsyncSession | None = None,
    ) -> tuple[bool, int]:
        """
        Return (allowed, retry_after_seconds).
        Checks shared PostgreSQL state across workers and also evaluates local in-memory window.
        """
        ip_key, pair_key = self._keys(ip_address, login)

        # 1. Check persistent PostgreSQL state (synchronizes across all workers)
        if session is not None:
            try:
                now_utc = datetime.now(timezone.utc)
                stmt = select(LoginRateLimit).where(
                    LoginRateLimit.key.in_([pair_key, ip_key]),
                    LoginRateLimit.expires_at > now_utc,
                )
                res = await session.execute(stmt)
                scalars_fn = getattr(res, "scalars", None)
                if callable(scalars_fn):
                    rows = {r.key: r for r in scalars_fn().all() if hasattr(r, "attempts")}
                    for key in (pair_key, ip_key):
                        record = rows.get(key)
                        if record and record.attempts >= self.max_attempts:
                            remaining = (record.expires_at - now_utc).total_seconds()
                            retry_after = max(1, math.ceil(remaining))
                            return False, retry_after
            except Exception:
                pass

        # 2. Check local in-memory sliding window
        now = time.monotonic()
        async with self._lock:
            for key in (pair_key, ip_key):
                bucket = self._buckets.get(key)
                if not bucket:
                    continue
                self._prune(bucket, now)
                if not bucket:
                    self._buckets.pop(key, None)
                    continue
                if len(bucket) >= self.max_attempts:
                    retry_after = max(1, math.ceil(self.window_seconds - (now - bucket[0])))
                    return False, retry_after
            return True, 0

    async def record_failure(
        self,
        ip_address: str,
        login: str,
        session: AsyncSession | None = None,
    ) -> None:
        """
        Record a failed login attempt for both IP and (IP, login).
        Updates shared PostgreSQL table across workers and maintains in-memory fallback.
        """
        ip_key, pair_key = self._keys(ip_address, login)

        # 1. Persist failure to PostgreSQL for multi-worker synchronization
        if session is not None:
            try:
                now_utc = datetime.now(timezone.utc)
                expires_at = now_utc + timedelta(seconds=self.window_seconds)
                for key in (pair_key, ip_key):
                    stmt = (
                        insert(LoginRateLimit)
                        .values(
                            key=key,
                            attempts=1,
                            first_attempt_at=now_utc,
                            last_attempt_at=now_utc,
                            expires_at=expires_at,
                        )
                        .on_conflict_do_update(
                            index_elements=["key"],
                            set_={
                                "attempts": case(
                                    (LoginRateLimit.expires_at <= now_utc, 1),
                                    else_=LoginRateLimit.attempts + 1,
                                ),
                                "first_attempt_at": case(
                                    (LoginRateLimit.expires_at <= now_utc, now_utc),
                                    else_=LoginRateLimit.first_attempt_at,
                                ),
                                "last_attempt_at": now_utc,
                                "expires_at": case(
                                    (LoginRateLimit.expires_at <= now_utc, expires_at),
                                    else_=LoginRateLimit.expires_at,
                                ),
                            },
                        )
                    )
                    await session.execute(stmt)
                # Opportunistic cleanup of expired records
                await session.execute(
                    delete(LoginRateLimit).where(LoginRateLimit.expires_at < now_utc)
                )
            except Exception:
                pass

        # 2. Update local in-memory bucket
        now = time.monotonic()
        async with self._lock:
            for key in (pair_key, ip_key):
                bucket = self._buckets.setdefault(key, deque())
                self._prune(bucket, now)
                bucket.append(now)

    async def reset_for_login(
        self,
        ip_address: str,
        login: str,
        session: AsyncSession | None = None,
    ) -> None:
        """Reset failure counters for (IP, login) after a successful authentication."""
        _, pair_key = self._keys(ip_address, login)

        if session is not None:
            try:
                await session.execute(
                    delete(LoginRateLimit).where(LoginRateLimit.key == pair_key)
                )
            except Exception:
                pass

        async with self._lock:
            self._buckets.pop(pair_key, None)

    async def clear_all(self, session: AsyncSession | None = None) -> None:
        """Reset all rate limiter state (intended for automated tests)."""
        if session is not None:
            try:
                await session.execute(delete(LoginRateLimit))
            except Exception:
                pass

        async with self._lock:
            self._buckets.clear()


login_rate_limiter = SlidingWindowRateLimiter()
