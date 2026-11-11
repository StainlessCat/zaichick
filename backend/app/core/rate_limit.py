from __future__ import annotations

import asyncio
import math
import time
from collections import deque

from app.core.config import get_settings


class SlidingWindowRateLimiter:
    """
    Async-safe in-memory sliding window rate limiter for /api/auth/login.
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

    async def check_allowed(self, ip_address: str, login: str) -> tuple[bool, int]:
        """Return (allowed, retry_after_seconds)."""
        now = time.monotonic()
        ip_key, pair_key = self._keys(ip_address, login)
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

    async def record_failure(self, ip_address: str, login: str) -> None:
        """Record a failed login attempt for both IP and (IP, login)."""
        now = time.monotonic()
        ip_key, pair_key = self._keys(ip_address, login)
        async with self._lock:
            for key in (pair_key, ip_key):
                bucket = self._buckets.setdefault(key, deque())
                self._prune(bucket, now)
                bucket.append(now)

    async def reset_for_login(self, ip_address: str, login: str) -> None:
        """Reset failure counters for (IP, login) after a successful authentication."""
        _, pair_key = self._keys(ip_address, login)
        async with self._lock:
            self._buckets.pop(pair_key, None)

    async def clear_all(self) -> None:
        """Reset all rate limiter state (intended for automated tests)."""
        async with self._lock:
            self._buckets.clear()


login_rate_limiter = SlidingWindowRateLimiter()
