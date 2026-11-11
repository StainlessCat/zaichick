from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "ZAYCHICK 2.0 API"
    app_version: str = "2.0.0"
    environment: Literal["development", "staging", "production"] = "development"

    # Fail-fast PostgreSQL DSN (no SQLite / JSON fallback)
    database_url: str = Field(
        default="postgresql+asyncpg://zaychick:zaychick_dev_password@127.0.0.1:5432/zaychick",
        alias="DATABASE_URL",
    )
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_echo: bool = False

    # JWT & Cookie Auth
    jwt_secret_key: str = Field(
        default="dev-only-secret-change-in-production-32bytes",
        alias="JWT_SECRET_KEY",
    )
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    jwt_access_token_expire_minutes: int = Field(
        default=1440, alias="JWT_ACCESS_TOKEN_EXPIRE_MINUTES"
    )
    cookie_name: str = Field(default="zaychick_access_token", alias="COOKIE_NAME")
    cookie_secure: bool = Field(default=False, alias="COOKIE_SECURE")
    cookie_samesite: Literal["lax", "strict", "none"] = Field(
        default="lax", alias="COOKIE_SAMESITE"
    )

    # Login brute-force protection
    login_rate_limit_attempts: int = 10
    login_rate_limit_window_seconds: int = 300

    cors_origins_raw: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173",
        alias="CORS_ORIGINS",
    )

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins_raw.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
