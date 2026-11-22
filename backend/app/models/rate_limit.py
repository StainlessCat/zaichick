from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class LoginRateLimit(Base):
    """
    Shared persistent rate-limiting table for authentication across multi-worker uvicorn processes.
    Tracks failed attempts by source IP and (IP, login) pairs with automatic TTL expiration.
    """

    __tablename__ = "login_rate_limits"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    first_attempt_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_attempt_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
