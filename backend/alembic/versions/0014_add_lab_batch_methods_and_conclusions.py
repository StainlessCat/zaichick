"""Add requested_methods JSONB to ndt_lab_requests and lab_conclusions JSONB to weld_joints.

Revision ID: 0014_add_lab_batch_methods_and_conclusions
Revises: 0013_add_project_lines_indexes
Create Date: 2026-11-26 19:38:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0014_add_lab_batch_methods_and_conclusions"
down_revision = "0013_add_project_lines_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ndt_lab_requests",
        sa.Column(
            "requested_methods",
            JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    # Заполняем requested_methods из legacy requested_method (например, 'ВИК+РК' -> ['ВИК', 'РК'])
    op.execute(
        """
        UPDATE ndt_lab_requests
        SET requested_methods = COALESCE(
            (
                SELECT jsonb_agg(trim(part))
                FROM unnest(regexp_split_to_array(COALESCE(requested_method, ''), '[+,]+')) AS part
                WHERE trim(part) <> ''
            ),
            '[]'::jsonb
        )
        """
    )

    op.add_column(
        "weld_joints",
        sa.Column("lab_conclusions", JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("weld_joints", "lab_conclusions")
    op.drop_column("ndt_lab_requests", "requested_methods")
