from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
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

    @model_validator(mode="after")
    def validate_production_and_dsn(self) -> Settings:
        if not self.database_url.startswith("postgresql+asyncpg://"):
            raise ValueError(
                f"Некорректный DATABASE_URL ('{self.database_url}'). "
                "ZAYCHICK 2.0 требует асинхронный драйвер PostgreSQL: 'postgresql+asyncpg://user:pass@host:port/dbname'."
            )

        if self.environment == "production":
            lower_dsn = self.database_url.lower()
            if (
                ":@" in self.database_url
                or "zaychick_dev_password" in lower_dsn
                or "zaychick_secure_dev_password" in lower_dsn
                or "replace-with-" in lower_dsn
            ):
                raise ValueError(
                    "В production-окружении запрещён пустой, шаблонный или демонстрационный пароль БД в DATABASE_URL."
                )
            lower_jwt = self.jwt_secret_key.lower()
            if (
                len(self.jwt_secret_key) < 32
                or "dev-" in lower_jwt
                or "change" in lower_jwt
                or "replace-with-" in lower_jwt
            ):
                raise ValueError(
                    "В production-окружении запрещён стандартный, шаблонный или короткий JWT_SECRET_KEY "
                    "(требуется криптографически стойкий секрет длиной не менее 32 символов)."
                )
            if not self.cookie_secure:
                raise ValueError(
                    "В production-окружении флаг COOKIE_SECURE обязан быть True "
                    "для обеспечения передачи авторизационных cookie только через защищённый канал HTTPS."
                )
            for origin in self.cors_origins:
                if origin == "*":
                    raise ValueError(
                        "В production-окружении CORS_ORIGINS не может содержать '*' при авторизации через cookies."
                    )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
