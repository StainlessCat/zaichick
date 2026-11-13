from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy import MetaData, event, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Session

from app.core.config import get_settings

POSTGRES_INDEXES_NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Declarative base for all ZAYCHICK PostgreSQL ORM models."""

    metadata = MetaData(naming_convention=POSTGRES_INDEXES_NAMING_CONVENTION)


settings = get_settings()

engine: AsyncEngine = create_async_engine(
    settings.database_url,
    echo=settings.db_echo,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_pre_ping=True,
)

async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def verify_postgres_connection() -> None:
    """Fail-fast startup probe verifying PostgreSQL availability (no file/SQLite fallback)."""
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))


async def verify_schema_migrations_applied() -> str:
    """
    Verify that Alembic schema migrations have been applied to PostgreSQL.
    Raises RuntimeError with clear actionable instruction if unmigrated.
    Returns the current Alembic revision string.
    """
    async with engine.connect() as conn:
        try:
            res = await conn.execute(text("SELECT version_num FROM alembic_version LIMIT 1"))
            version_num = res.scalar_one_or_none()
        except Exception as exc:
            raise RuntimeError(
                "База данных не инициализирована: таблица миграций 'alembic_version' отсутствует. "
                "Перед запуском приложения примените миграции: 'alembic upgrade head' "
                "или 'python -m app.cli.bootstrap_admin --apply-migrations'."
            ) from exc

        if not version_num:
            raise RuntimeError(
                "База данных не содержит применённых версий миграций Alembic. "
                "Выполните команду развёртывания: 'alembic upgrade head'."
            )
        return str(version_num)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency providing a scoped AsyncSession with automatic transaction management.
    - If the handler completes without exception, automatically commits any active transaction.
    - Dispatches post-commit SSE events only after successful commit.
    - If an exception occurs, rolls back the transaction and discards buffered events.
    """
    from app.services.event_bus import event_bus

    async with async_session_factory() as session:
        session.info["pending_sse_events"] = []
        try:
            yield session
            if session.is_active and session.in_transaction():
                await session.commit()
            await event_bus.dispatch_pending_session_events(session)
        except Exception:
            event_bus.clear_pending_session_events(session)
            if session.is_active and session.in_transaction():
                await session.rollback()
            raise


@event.listens_for(Session, "before_flush")
def _enforce_immutable_audit_logs(session: Session, _flush_context, _instances) -> None:
    """Block ORM-level UPDATE or DELETE operations on AuditLog entities."""
    from app.models.audit import AuditLog

    for obj in session.dirty:
        if isinstance(obj, AuditLog):
            raise RuntimeError("audit_logs является append-only таблицей: UPDATE запрещён.")
    for obj in session.deleted:
        if isinstance(obj, AuditLog):
            raise RuntimeError("audit_logs является append-only таблицей: DELETE запрещён.")
