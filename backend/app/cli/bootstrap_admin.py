from __future__ import annotations

import argparse
import asyncio
import getpass
import os
import secrets
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import async_session_factory, verify_postgres_connection
from app.core.security import hash_password
from app.models.enums import RoleEnum
from app.models.user import User

FORBIDDEN_PASSWORDS = frozenset(
    {"123", "123456", "admin", "password", "zaychick", "qwerty", "root"}
)


def run_alembic_upgrade() -> None:
    """Run Alembic migrations head programmatically."""
    from alembic import command
    from alembic.config import Config

    backend_dir = Path(__file__).resolve().parent.parent.parent
    alembic_ini = backend_dir / "alembic.ini"
    if not alembic_ini.exists():
        raise FileNotFoundError(f"alembic.ini not found at {alembic_ini}")
    cfg = Config(str(alembic_ini))
    cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    command.upgrade(cfg, "head")
    print("[OK] Миграции Alembic успешно применены (head).")


async def _execute_bootstrap(
    session: AsyncSession,
    *,
    login: str,
    password: str | None,
    full_name: str,
    department: str,
    interactive: bool = False,
) -> tuple[User, str, bool]:
    # 1. Idempotency check: see if an ADMIN user or matching login already exists
    existing_admin = (
        await session.execute(
            select(User).where(User.role == RoleEnum.ADMIN)
        )
    ).scalars().first()

    existing_login = (
        await session.execute(
            select(User).where(User.login == login.strip().lower())
        )
    ).scalar_one_or_none()

    if existing_admin is not None:
        print(
            f"[INFO] Администратор уже существует в системе: login='{existing_admin.login}', "
            f"id={existing_admin.id}. Пароль существующего пользователя не изменяется (идемпотентность)."
        )
        return existing_admin, "", False

    if existing_login is not None:
        print(
            f"[INFO] Пользователь с логином '{login}' уже существует (id={existing_login.id}). "
            "Пропуск создания."
        )
        return existing_login, "", False

    # 2. Determine password
    final_password = (password or "").strip()
    is_generated = False
    if not final_password:
        env_pwd = os.getenv("INITIAL_ADMIN_PASSWORD", "").strip()
        if env_pwd:
            final_password = env_pwd
        elif interactive and sys.stdin.isatty():
            entered = getpass.getpass(f"Введите надёжный пароль для администратора '{login}': ")
            final_password = entered.strip()
        else:
            final_password = secrets.token_urlsafe(16)
            is_generated = True

    if final_password.lower() in FORBIDDEN_PASSWORDS or len(final_password) < 6:
        raise ValueError(
            f"Пароль '{final_password}' слишком слабый или является запрещённым значением по умолчанию. "
            "Укажите стойкий пароль не короче 6 символов."
        )

    now = datetime.now(timezone.utc)
    admin = User(
        id=uuid.uuid4(),
        login=login.strip().lower(),
        password_hash=hash_password(final_password),
        full_name=full_name.strip(),
        role=RoleEnum.ADMIN,
        department=department.strip(),
        position_title="Администратор системы",
        session_number=1,
        is_active=True,
        must_change_password=False,
        version=1,
        created_at=now,
        updated_at=now,
    )
    session.add(admin)
    await session.commit()
    await session.refresh(admin)

    print("=================================================================")
    print(f"[OK] Создан первичный администратор ZAYCHICK 2.0 (id={admin.id}):")
    print(f"  • Логин:     {admin.login}")
    print(f"  • ФИО:       {admin.full_name}")
    print(f"  • Роль:      {admin.role.value}")
    if is_generated:
        print(f"  • Пароль:    {final_password} (сгенерирован безопасно, сохраните его!)")
    else:
        print("  • Пароль:    [задан пользователем / из переменной окружения]")
    print("=================================================================")

    return admin, final_password, True


async def bootstrap_admin(
    *,
    login: str,
    password: str | None,
    full_name: str,
    department: str,
    interactive: bool = False,
    session: AsyncSession | None = None,
) -> tuple[User, str, bool]:
    """
    Idempotent bootstrap of the initial Administrator account.
    Returns (user, password_used, was_created).
    If an administrator already exists, returns (existing_user, "", False) without altering passwords.
    """
    if session is not None:
        return await _execute_bootstrap(
            session,
            login=login,
            password=password,
            full_name=full_name,
            department=department,
            interactive=interactive,
        )

    await verify_postgres_connection()
    async with async_session_factory() as sess:
        return await _execute_bootstrap(
            sess,
            login=login,
            password=password,
            full_name=full_name,
            department=department,
            interactive=interactive,
        )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="ZAYCHICK 2.0 — Идемпотентный bootstrap первого администратора и миграций"
    )
    parser.add_argument(
        "--apply-migrations",
        action="store_true",
        help="Применить миграции схемы Alembic перед созданием администратора",
    )
    parser.add_argument(
        "--login",
        default="admin",
        help="Логин первого администратора (по умолчанию: admin)",
    )
    parser.add_argument(
        "--password",
        default=None,
        help="Пароль администратора (если не указан, берётся из INITIAL_ADMIN_PASSWORD, запрашивается или генерируется)",
    )
    parser.add_argument(
        "--full-name",
        default="Главный Администратор",
        help="Полное имя администратора",
    )
    parser.add_argument(
        "--department",
        default="Администрация",
        help="Отдел / подразделение",
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Запросить ввод пароля интерактивно через скрытый ввод терминала",
    )

    args = parser.parse_args()

    if args.apply_migrations:
        run_alembic_upgrade()

    try:
        asyncio.run(
            bootstrap_admin(
                login=args.login,
                password=args.password,
                full_name=args.full_name,
                department=args.department,
                interactive=args.interactive,
            )
        )
    except Exception as exc:
        print(f"[ОШИБКА] Сбой первичной инициализации: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
