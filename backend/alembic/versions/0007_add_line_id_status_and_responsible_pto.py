"""Add id_status and responsible_pto to project_lines.

Revision ID: 0007_add_line_id_status_and_responsible_pto
Revises: 0006_add_test_circuits
Create Date: 2026-11-20 05:30:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0007_add_line_id_status_and_responsible_pto"
down_revision: Union[str, Sequence[str], None] = "0006_add_test_circuits"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    executive_doc_status_enum = postgresql.ENUM(
        "IN_WORK",
        "SIGNED",
        name="executive_doc_status_enum",
        create_type=False,
    )
    executive_doc_status_enum.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "project_lines",
        sa.Column(
            "id_status",
            executive_doc_status_enum,
            nullable=False,
            server_default="IN_WORK",
        ),
    )
    op.add_column(
        "project_lines",
        sa.Column(
            "responsible_pto",
            sa.String(length=255),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("project_lines", "responsible_pto")
    op.drop_column("project_lines", "id_status")

    executive_doc_status_enum = postgresql.ENUM(
        "IN_WORK",
        "SIGNED",
        name="executive_doc_status_enum",
        create_type=False,
    )
    executive_doc_status_enum.drop(op.get_bind(), checkfirst=True)
