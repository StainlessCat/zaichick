"""Add composite indexes on weld_joints for scalable period-filtered readiness analytics.

Revision ID: 0012_add_readiness_analytics_indexes
Revises: 0011_add_executive_docs
Create Date: 2026-11-25 22:10:00
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0012_add_readiness_analytics_indexes"
down_revision: Union[str, Sequence[str], None] = "0011_add_executive_docs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_weld_joints_facility_welding_date",
        "weld_joints",
        ["facility_id", "welding_date"],
        unique=False,
        if_not_exists=True,
    )
    op.create_index(
        "ix_weld_joints_facility_rd_welding_date",
        "weld_joints",
        ["facility_id", "rd_code", "welding_date"],
        unique=False,
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_weld_joints_facility_rd_welding_date",
        table_name="weld_joints",
        if_exists=True,
    )
    op.drop_index(
        "ix_weld_joints_facility_welding_date",
        table_name="weld_joints",
        if_exists=True,
    )
