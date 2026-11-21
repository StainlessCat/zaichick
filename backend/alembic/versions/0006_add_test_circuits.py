"""Add test_circuits table and weld_joints.test_circuit_id FK.

Revision ID: 0006_add_test_circuits
Revises: 0005_hierarchical_rbac_and_record_status
Create Date: 2026-11-20 03:25:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0006_add_test_circuits"
down_revision: Union[str, Sequence[str], None] = "0005_hierarchical_rbac_and_record_status"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    sri_status_enum = postgresql.ENUM(
        "IN_DEVELOPMENT",
        "DEVELOPED",
        "APPROVED",
        name="sri_status_enum",
        create_type=False,
    )
    circuit_test_status_enum = postgresql.ENUM(
        "NOT_TESTED",
        "TESTED",
        name="circuit_test_status_enum",
        create_type=False,
    )
    record_status_enum = postgresql.ENUM(
        "DRAFT",
        "VERIFIED",
        "LOCKED",
        name="record_status_enum",
        create_type=False,
    )

    sri_status_enum.create(op.get_bind(), checkfirst=True)
    circuit_test_status_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "test_circuits",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "facility_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("facilities.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("sri_name", sa.String(length=255), nullable=True),
        sa.Column(
            "sri_status",
            sri_status_enum,
            nullable=False,
            server_default="IN_DEVELOPMENT",
        ),
        sa.Column(
            "test_status",
            circuit_test_status_enum,
            nullable=False,
            server_default="NOT_TESTED",
        ),
        sa.Column("planned_date", sa.Date(), nullable=True),
        sa.Column("act_number", sa.String(length=100), nullable=True),
        sa.Column("actual_test_date", sa.Date(), nullable=True),
        sa.Column(
            "record_status",
            record_status_enum,
            nullable=False,
            server_default="DRAFT",
        ),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "created_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "updated_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("facility_id", "name", name="uq_facility_circuit_name"),
    )

    op.create_index("ix_test_circuits_facility_id", "test_circuits", ["facility_id"], unique=False)
    op.create_index("ix_test_circuits_sri_status", "test_circuits", ["sri_status"], unique=False)
    op.create_index("ix_test_circuits_test_status", "test_circuits", ["test_status"], unique=False)
    op.create_index("ix_test_circuits_record_status", "test_circuits", ["record_status"], unique=False)
    op.create_index("ix_test_circuits_created_by_id", "test_circuits", ["created_by_id"], unique=False)

    op.add_column(
        "weld_joints",
        sa.Column(
            "test_circuit_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("test_circuits.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_weld_joints_test_circuit_id", "weld_joints", ["test_circuit_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_weld_joints_test_circuit_id", table_name="weld_joints")
    op.drop_column("weld_joints", "test_circuit_id")

    op.drop_index("ix_test_circuits_created_by_id", table_name="test_circuits")
    op.drop_index("ix_test_circuits_record_status", table_name="test_circuits")
    op.drop_index("ix_test_circuits_test_status", table_name="test_circuits")
    op.drop_index("ix_test_circuits_sri_status", table_name="test_circuits")
    op.drop_index("ix_test_circuits_facility_id", table_name="test_circuits")
    op.drop_table("test_circuits")

    op.execute(sa.text("DROP TYPE IF EXISTS circuit_test_status_enum"))
    op.execute(sa.text("DROP TYPE IF EXISTS sri_status_enum"))
