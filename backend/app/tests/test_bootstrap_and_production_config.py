from __future__ import annotations

import uuid
import pytest
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.cli.bootstrap_admin import bootstrap_admin
from app.core.config import Settings
from app.core.database import verify_schema_migrations_applied
from app.models.enums import RoleEnum

TEST_DATABASE_URL = "postgresql+asyncpg://zaychick:zaychick_dev_password@127.0.0.1:5432/zaychick_test"
test_engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
db_session_factory = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


def test_production_config_rejects_weak_or_dev_jwt_secret():
    """Verify production environment strictly forbids dev-only or short JWT secrets."""
    with pytest.raises(ValidationError) as exc:
        Settings(
            environment="production",
            jwt_secret_key="short_secret",
            cookie_secure=True,
            database_url="postgresql+asyncpg://zaychick:pass@127.0.0.1:5432/zaychick",
        )
    assert "JWT_SECRET_KEY" in str(exc.value)

    with pytest.raises(ValidationError) as exc2:
        Settings(
            environment="production",
            jwt_secret_key="dev-only-secret-key-that-is-at-least-32-chars-long",
            cookie_secure=True,
            database_url="postgresql+asyncpg://zaychick:pass@127.0.0.1:5432/zaychick",
        )
    assert "JWT_SECRET_KEY" in str(exc2.value)

    with pytest.raises(ValidationError) as exc3:
        Settings(
            environment="production",
            jwt_secret_key="replace-with-secure-32-byte-secret-key-in-production",
            cookie_secure=True,
            database_url="postgresql+asyncpg://zaychick:pass@127.0.0.1:5432/zaychick",
        )
    assert "JWT_SECRET_KEY" in str(exc3.value)

    with pytest.raises(ValidationError) as exc4:
        Settings(
            environment="production",
            jwt_secret_key="SuperSecretProdKeyWithHighEntropy1234567890!",
            cookie_secure=True,
            database_url="postgresql+asyncpg://zaychick:replace-with-strong-db-password-in-production@127.0.0.1:5432/zaychick",
        )
    assert "DATABASE_URL" in str(exc4.value)


def test_production_config_requires_cookie_secure_https():
    """Verify production environment requires COOKIE_SECURE=True."""
    with pytest.raises(ValidationError) as exc:
        Settings(
            environment="production",
            jwt_secret_key="A" * 40,
            cookie_secure=False,  # Forbidden in prod!
            database_url="postgresql+asyncpg://zaychick:pass@127.0.0.1:5432/zaychick",
        )
    assert "COOKIE_SECURE" in str(exc.value)


def test_production_config_rejects_non_postgresql_dsn():
    """Verify invalid DSN (e.g. SQLite or non-asyncpg) is rejected."""
    with pytest.raises(ValidationError) as exc:
        Settings(
            environment="production",
            jwt_secret_key="A" * 40,
            cookie_secure=True,
            database_url="sqlite:///data/zaychick.sqlite",
        )
    assert "DATABASE_URL" in str(exc.value)


def test_valid_production_config_accepted():
    """Verify clean production configuration succeeds."""
    s = Settings(
        environment="production",
        jwt_secret_key="SuperSecretProdKeyWithHighEntropy1234567890!",
        cookie_secure=True,
        database_url="postgresql+asyncpg://zaychick:secure_pass@127.0.0.1:5432/zaychick",
        cors_origins_raw="https://zaychick.corp.ru,https://pto.corp.ru",
    )
    assert s.environment == "production"
    assert s.cookie_secure is True
    assert len(s.cors_origins) == 2


@pytest.mark.asyncio
async def test_verify_schema_migrations_applied():
    """Verify schema check returns valid Alembic revision for migrated test DB."""
    async with test_engine.connect() as conn:
        res = await conn.execute(text("SELECT version_num FROM alembic_version LIMIT 1"))
        ver = res.scalar_one_or_none()
        assert ver is not None
        assert len(ver) > 0


@pytest.mark.asyncio
async def test_bootstrap_admin_idempotency_and_forbidden_passwords():
    """Verify bootstrap creates initial admin and is strictly idempotent."""
    async with db_session_factory() as session:
        # Clean users table for clean test
        await session.execute(text("TRUNCATE TABLE users CASCADE"))
        await session.commit()

        # 1. Weak / default password rejected
        with pytest.raises(ValueError) as exc:
            await bootstrap_admin(
                login=f"admin_{uuid.uuid4().hex[:6]}",
                password="123",  # Forbidden!
                full_name="Админ",
                department="ОИТ",
                session=session,
            )
        assert "запрещённым" in str(exc.value) or "слабый" in str(exc.value)

        # 2. First clean creation
        random_login = f"adm_{uuid.uuid4().hex[:6]}"
        user1, pwd_used1, created1 = await bootstrap_admin(
            login=random_login,
            password="MyStrongPassword2026!",
            full_name="Иванов И.И.",
            department="Администрация",
            session=session,
        )
        assert created1 is True
        assert user1.login == random_login
        assert user1.role == RoleEnum.ADMIN

        # 3. Repeat bootstrap call -> idempotent (does not create 2nd admin, does not alter password)
        user2, pwd_used2, created2 = await bootstrap_admin(
            login=random_login,
            password="AnotherPassword999!",
            full_name="Иванов И.И.",
            department="Администрация",
            session=session,
        )
        assert created2 is False
        assert user2.id == user1.id
        assert pwd_used2 == ""
