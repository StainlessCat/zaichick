"""Add login_rate_limits table for multi-worker distributed rate limiting.

Revision ID: 0008_add_login_rate_limits
Revises: 0007_add_line_id_status_and_responsible_pto
Create Date: 2026-11-21 20:40:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0008_add_login_rate_limits"
down_revision: Union[str, Sequence[str], None] = "0007_add_line_id_status_and_responsible_pto"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "login_rate_limits",
        sa.Column("key", sa.String(length=128), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("first_attempt_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_attempt_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("key", name="pk_login_rate_limits"),
    )
    op.create_index(
        "ix_login_rate_limits_expires_at",
        "login_rate_limits",
        ["expires_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_login_rate_limits_expires_at", table_name="login_rate_limits")
    op.drop_table("login_rate_limits")
