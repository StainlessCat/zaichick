"""Add composite indexes on project_lines for scalable filtering, sorting, and ID status lookups.

Revision ID: 0013_add_project_lines_indexes
Revises: 0012_add_readiness_analytics_indexes
Create Date: 2026-11-26 02:30:00
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0013_add_project_lines_indexes"
down_revision: Union[str, Sequence[str], None] = "0012_add_readiness_analytics_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_project_lines_facility_rd_sort_line",
        "project_lines",
        ["facility_id", "rd_code", "sort_order", "line_number"],
        unique=False,
        if_not_exists=True,
    )
    op.create_index(
        "ix_project_lines_facility_sort_line",
        "project_lines",
        ["facility_id", "sort_order", "line_number"],
        unique=False,
        if_not_exists=True,
    )
    op.create_index(
        "ix_project_lines_facility_id_status",
        "project_lines",
        ["facility_id", "id_status"],
        unique=False,
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_project_lines_facility_id_status",
        table_name="project_lines",
        if_exists=True,
    )
    op.drop_index(
        "ix_project_lines_facility_sort_line",
        table_name="project_lines",
        if_exists=True,
    )
    op.drop_index(
        "ix_project_lines_facility_rd_sort_line",
        table_name="project_lines",
        if_exists=True,
    )
