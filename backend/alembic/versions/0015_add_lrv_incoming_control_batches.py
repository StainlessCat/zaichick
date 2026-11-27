"""Add incoming control batches and replacement metadata to lrv_items.

Revision ID: 0015_add_lrv_incoming_control_batches
Revises: 0014_add_lab_batch_methods_and_conclusions
Create Date: 2026-11-27 02:25:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0015_add_lrv_incoming_control_batches"
down_revision = "0014_add_lab_batch_methods_and_conclusions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "lrv_items",
        sa.Column(
            "batches",
            JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "lrv_items",
        sa.Column("parent_material_id", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "lrv_items",
        sa.Column("replacement_notice", JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("lrv_items", "replacement_notice")
    op.drop_column("lrv_items", "parent_material_id")
    op.drop_column("lrv_items", "batches")
