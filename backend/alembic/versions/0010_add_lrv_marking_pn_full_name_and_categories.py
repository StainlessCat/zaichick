"""Add marking, pn_mpa, full_name to lrv_items and add Штуцер and Бобышка to lrv_category_enum.

Revision ID: 0010_add_lrv_marking_pn_full_name_and_categories
Revises: 0009_fix_legacy_joint_numbers
Create Date: 2026-11-23 19:50:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0010_add_lrv_marking_pn_full_name_and_categories"
down_revision: Union[str, Sequence[str], None] = "0009_fix_legacy_joint_numbers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Update PostgreSQL enum lrv_category_enum
    op.execute(sa.text("ALTER TYPE lrv_category_enum ADD VALUE IF NOT EXISTS 'Штуцер'"))
    op.execute(sa.text("ALTER TYPE lrv_category_enum ADD VALUE IF NOT EXISTS 'Бобышка'"))

    # 2. Add columns to lrv_items
    op.add_column("lrv_items", sa.Column("marking", sa.String(length=255), nullable=True))
    op.add_column("lrv_items", sa.Column("pn_mpa", sa.String(length=64), nullable=True))
    op.add_column("lrv_items", sa.Column("full_name", sa.String(length=1024), nullable=True))


def downgrade() -> None:
    op.drop_column("lrv_items", "full_name")
    op.drop_column("lrv_items", "pn_mpa")
    op.drop_column("lrv_items", "marking")
