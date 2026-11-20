from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Index, Integer, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.enums import DepartmentEnum, SystemRoleEnum, pg_enum


class User(Base):
    """System user account with hierarchical SystemRoleEnum and DepartmentEnum."""

    __tablename__ = "users"
    __table_args__ = (
        Index("ix_users_login_lower", text("lower(btrim(login))"), unique=True),
        CheckConstraint(
            "(role = 'SUPERADMIN') OR (department != 'ALL')",
            name="ck_users_department_all_superadmin_only",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    login: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[SystemRoleEnum] = mapped_column(
        pg_enum(SystemRoleEnum, "system_role_enum"),
        nullable=False,
        default=SystemRoleEnum.OPERATOR,
    )
    department: Mapped[DepartmentEnum] = mapped_column(
        pg_enum(DepartmentEnum, "department_enum"),
        nullable=False,
        default=DepartmentEnum.PTO,
    )
    position_title: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    session_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
