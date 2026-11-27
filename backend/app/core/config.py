from __future__ import annotations

import os
from functools import lru_cache
from typing import Any, Literal

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
    db_pool_size: int = 3
    db_max_overflow: int = 5
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
    cookie_partitioned: bool = Field(default=False, alias="COOKIE_PARTITIONED")

    # Login brute-force protection
    login_rate_limit_attempts: int = 10
    login_rate_limit_window_seconds: int = 300

    # Production vs Demo data initialization
    seed_baseline_demo_data: bool = Field(
        default=True,
        alias="SEED_BASELINE_DEMO_DATA",
        description="Флаг авто-заполнения демонстрационных данных (стыки, лайнлист, материалы) при пустой БД",
    )

    cors_origins_raw: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173",
        alias="CORS_ORIGINS",
    )

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins_raw.split(",") if o.strip()]

    @model_validator(mode="before")
    @classmethod
    def normalize_database_url(cls, data: Any) -> Any:
        """Automatically normalize cloud DSNs or assemble from separate environment variables."""
        if isinstance(data, dict):
            raw_url = data.get("DATABASE_URL") or data.get("database_url")

            # Check for separate environment variables (DB_USER, DB_PASSWORD, DB_HOST, DB_NAME, DB_PORT)
            db_user = (
                data.get("DB_USER")
                or os.getenv("DB_USER")
                or data.get("POSTGRES_USER")
                or os.getenv("POSTGRES_USER")
            )
            db_pass = (
                data.get("DB_PASSWORD")
                or os.getenv("DB_PASSWORD")
                or data.get("POSTGRES_PASSWORD")
                or os.getenv("POSTGRES_PASSWORD")
            )
            db_host = (
                data.get("DB_HOST")
                or os.getenv("DB_HOST")
                or data.get("POSTGRES_HOST")
                or os.getenv("POSTGRES_HOST")
            )
            db_name = (
                data.get("DB_NAME")
                or os.getenv("DB_NAME")
                or data.get("POSTGRES_DB")
                or os.getenv("POSTGRES_DB")
            )
            db_port = (
                data.get("DB_PORT")
                or os.getenv("DB_PORT")
                or data.get("POSTGRES_PORT")
                or os.getenv("POSTGRES_PORT")
                or "5432"
            )

            # If raw_url looks like just a hostname (e.g. cnpg-zaychick2-rw) and separate credentials are provided:
            if raw_url and "://" not in raw_url and "@" not in raw_url:
                if not db_host:
                    db_host = raw_url.strip()

            if db_user and db_pass and db_host and db_name:
                raw_url = f"postgresql+asyncpg://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"

            if raw_url and isinstance(raw_url, str):
                normalized = raw_url.strip()
                if normalized.startswith("postgres://"):
                    normalized = "postgresql+asyncpg://" + normalized[len("postgres://"):]
                elif normalized.startswith("postgresql://") and not normalized.startswith(
                    "postgresql+asyncpg://"
                ):
                    normalized = "postgresql+asyncpg://" + normalized[len("postgresql://"):]
                normalized = normalized.replace("sslmode=require", "ssl=require")
                data["database_url"] = normalized
                data["DATABASE_URL"] = normalized
        return data

    @model_validator(mode="after")
    def validate_production_and_dsn(self) -> Settings:
        if not self.database_url.startswith("postgresql+asyncpg://"):
            hint = ""
            if "://" not in self.database_url:
                hint = (
                    f"\nВнимание: значение '{self.database_url}' похоже только на имя хоста базы данных. "
                    f"В Amvera необходимо указать полную строку подключения вида:\n"
                    f"postgresql://<пользователь>:<пароль>@{self.database_url}:5432/<имя_базы>\n"
                    f"Скопируйте пользователя, пароль и имя базы из карточки PostgreSQL в Amvera."
                )
            raise ValueError(
                f"Некорректный DATABASE_URL ('{self.database_url}'). "
                f"ZAYCHICK 2.0 требует асинхронный драйвер PostgreSQL: 'postgresql+asyncpg://user:pass@host:port/dbname'.{hint}"
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
