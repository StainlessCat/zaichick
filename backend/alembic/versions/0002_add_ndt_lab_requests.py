"""Add NDT lab requests table.

Revision ID: 0002_add_ndt_lab_requests
Revises: 0001_initial_schema
Create Date: 2026-11-14 15:30:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0002_add_ndt_lab_requests"
down_revision: Union[str, Sequence[str], None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ndt_lab_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("request_number", sa.String(64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("created_date", sa.String(10), nullable=False),
        sa.Column("created_by", sa.String(255), nullable=False),
        sa.Column("object_name", sa.String(255), nullable=False),
        sa.Column("rd_code", sa.String(255), nullable=False),
        sa.Column("line_number", sa.String(128), nullable=False, server_default=""),
        sa.Column("unique_line_id", sa.String(255), nullable=False),
        sa.Column("contour", sa.String(255), nullable=False, server_default=""),
        sa.Column(
            "control_stage",
            sa.String(128),
            nullable=False,
            server_default="Первичный ВИК и НК",
        ),
        sa.Column("requested_method", sa.String(64), nullable=False, server_default="РК"),
        sa.Column(
            "joint_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("status", sa.String(64), nullable=False, server_default="Подана ПТО"),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_by", sa.String(255), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("request_number", name="uq_ndt_lab_requests_request_number"),
    )
    op.create_index(
        "ix_ndt_lab_requests_request_number",
        "ndt_lab_requests",
        ["request_number"],
    )
    op.create_index("ix_ndt_lab_requests_object_name", "ndt_lab_requests", ["object_name"])
    op.create_index("ix_ndt_lab_requests_rd_code", "ndt_lab_requests", ["rd_code"])
    op.create_index(
        "ix_ndt_lab_requests_unique_line_id",
        "ndt_lab_requests",
        ["unique_line_id"],
    )
    op.create_index("ix_ndt_lab_requests_status", "ndt_lab_requests", ["status"])


def downgrade() -> None:
    op.drop_index("ix_ndt_lab_requests_status", table_name="ndt_lab_requests")
    op.drop_index("ix_ndt_lab_requests_unique_line_id", table_name="ndt_lab_requests")
    op.drop_index("ix_ndt_lab_requests_rd_code", table_name="ndt_lab_requests")
    op.drop_index("ix_ndt_lab_requests_object_name", table_name="ndt_lab_requests")
    op.drop_index("ix_ndt_lab_requests_request_number", table_name="ndt_lab_requests")
    op.drop_table("ndt_lab_requests")
