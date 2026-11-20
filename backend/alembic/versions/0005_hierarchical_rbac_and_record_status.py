"""Hierarchical RBAC (SystemRoleEnum + DepartmentEnum) and RecordStatusEnum locking.

Revision ID: 0005_hierarchical_rbac_and_record_status
Revises: 0004_add_weather_aliases
Create Date: 2026-11-19 22:40:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0005_hierarchical_rbac_and_record_status"
down_revision: Union[str, Sequence[str], None] = "0004_add_weather_aliases"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DOMAIN_TABLES_WITH_RECORD_STATUS: tuple[str, ...] = (
    "project_lines",
    "weld_joints",
    "lrv_items",
    "ndt_lab_requests",
    "welders",
    "tech_cards",
    "welding_materials",
)


def upgrade() -> None:
    # 1. Create new PostgreSQL ENUM types
    system_role_enum = postgresql.ENUM(
        "SUPERADMIN",
        "DEPT_ADMIN",
        "OPERATOR",
        "VIEWER",
        name="system_role_enum",
        create_type=False,
    )
    department_enum = postgresql.ENUM(
        "PTO",
        "OGS",
        "PIL",
        "SK",
        "ALL",
        name="department_enum",
        create_type=False,
    )
    record_status_enum = postgresql.ENUM(
        "DRAFT",
        "VERIFIED",
        "LOCKED",
        name="record_status_enum",
        create_type=False,
    )

    system_role_enum.create(op.get_bind(), checkfirst=True)
    department_enum.create(op.get_bind(), checkfirst=True)
    record_status_enum.create(op.get_bind(), checkfirst=True)

    # 2. Migrate users table to SystemRoleEnum + DepartmentEnum
    op.add_column(
        "users",
        sa.Column(
            "role_new",
            system_role_enum,
            nullable=True,
            server_default="OPERATOR",
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "department_new",
            department_enum,
            nullable=True,
            server_default="PTO",
        ),
    )

    # Preserve legacy free-text department label into position_title if position_title is blank
    op.execute(
        sa.text(
            """
            UPDATE users
            SET position_title = department
            WHERE COALESCE(btrim(position_title), '') = ''
              AND COALESCE(btrim(department), '') <> ''
            """
        )
    )

    # Deterministic migration of existing roles:
    # ADMIN -> SUPERADMIN + ALL; PTO/OGS/PIL -> OPERATOR + dept; VIEWER -> VIEWER + SK
    op.execute(
        sa.text(
            """
            UPDATE users
            SET
                role_new = CASE role::text
                    WHEN 'ADMIN' THEN 'SUPERADMIN'::system_role_enum
                    WHEN 'VIEWER' THEN 'VIEWER'::system_role_enum
                    WHEN 'PTO' THEN 'OPERATOR'::system_role_enum
                    WHEN 'OGS' THEN 'OPERATOR'::system_role_enum
                    WHEN 'PIL' THEN 'OPERATOR'::system_role_enum
                    ELSE 'OPERATOR'::system_role_enum
                END,
                department_new = CASE role::text
                    WHEN 'ADMIN' THEN 'ALL'::department_enum
                    WHEN 'PTO' THEN 'PTO'::department_enum
                    WHEN 'OGS' THEN 'OGS'::department_enum
                    WHEN 'PIL' THEN 'PIL'::department_enum
                    WHEN 'VIEWER' THEN 'SK'::department_enum
                    ELSE 'PTO'::department_enum
                END
            """
        )
    )

    op.drop_column("users", "role")
    op.drop_column("users", "department")

    op.alter_column(
        "users",
        "role_new",
        new_column_name="role",
        nullable=False,
        server_default="OPERATOR",
    )
    op.alter_column(
        "users",
        "department_new",
        new_column_name="department",
        nullable=False,
        server_default="PTO",
    )

    op.create_check_constraint(
        "ck_users_department_all_superadmin_only",
        "users",
        "(role = 'SUPERADMIN') OR (department != 'ALL')",
    )

    # Drop legacy enum if unused
    op.execute(sa.text("DROP TYPE IF EXISTS user_role_enum"))

    # 3. Add record_status and created_by_id to all key domain tables
    for table_name in DOMAIN_TABLES_WITH_RECORD_STATUS:
        op.add_column(
            table_name,
            sa.Column(
                "record_status",
                record_status_enum,
                nullable=False,
                server_default="DRAFT",
            ),
        )
        op.create_index(
            f"ix_{table_name}_record_status",
            table_name,
            ["record_status"],
            unique=False,
        )
        op.add_column(
            table_name,
            sa.Column(
                "created_by_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
        op.create_index(
            f"ix_{table_name}_created_by_id",
            table_name,
            ["created_by_id"],
            unique=False,
        )


def downgrade() -> None:
    # 1. Remove record_status and created_by_id from domain tables
    for table_name in reversed(DOMAIN_TABLES_WITH_RECORD_STATUS):
        op.drop_index(f"ix_{table_name}_created_by_id", table_name=table_name)
        op.drop_column(table_name, "created_by_id")
        op.drop_index(f"ix_{table_name}_record_status", table_name=table_name)
        op.drop_column(table_name, "record_status")

    # 2. Restore legacy user_role_enum and free-text department
    legacy_role_enum = postgresql.ENUM(
        "ADMIN",
        "PTO",
        "OGS",
        "PIL",
        "VIEWER",
        name="user_role_enum",
        create_type=False,
    )
    legacy_role_enum.create(op.get_bind(), checkfirst=True)

    op.drop_constraint(
        "ck_users_department_all_superadmin_only",
        "users",
        type_="check",
    )

    op.add_column(
        "users",
        sa.Column("role_old", legacy_role_enum, nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("department_old", sa.String(255), nullable=True, server_default=""),
    )

    op.execute(
        sa.text(
            """
            UPDATE users
            SET
                role_old = CASE
                    WHEN role::text = 'SUPERADMIN' THEN 'ADMIN'::user_role_enum
                    WHEN role::text = 'VIEWER' THEN 'VIEWER'::user_role_enum
                    WHEN department::text = 'OGS' THEN 'OGS'::user_role_enum
                    WHEN department::text = 'PIL' THEN 'PIL'::user_role_enum
                    WHEN department::text = 'PTO' THEN 'PTO'::user_role_enum
                    ELSE 'VIEWER'::user_role_enum
                END,
                department_old = department::text
            """
        )
    )

    op.drop_column("users", "role")
    op.drop_column("users", "department")

    op.alter_column("users", "role_old", new_column_name="role", nullable=False)
    op.alter_column(
        "users",
        "department_old",
        new_column_name="department",
        nullable=False,
        server_default="",
    )

    op.execute(sa.text("DROP TYPE IF EXISTS record_status_enum"))
    op.execute(sa.text("DROP TYPE IF EXISTS department_enum"))
    op.execute(sa.text("DROP TYPE IF EXISTS system_role_enum"))
