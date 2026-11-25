"""Add executive_docs table for Executive Documentation module.

Revision ID: 0011_add_executive_docs
Revises: 0010_add_lrv_marking_pn_full_name_and_categories
Create Date: 2026-11-25 12:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0011_add_executive_docs"
down_revision: Union[str, Sequence[str], None] = (
    "0010_add_lrv_marking_pn_full_name_and_categories"
)
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

    op.create_table(
        "executive_docs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("line_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=True),
        sa.Column(
            "id_status",
            executive_doc_status_enum,
            nullable=False,
            server_default="IN_WORK",
        ),
        sa.Column("work_producer", sa.String(length=255), nullable=True),
        sa.Column("pto_engineer", sa.String(length=255), nullable=True),
        sa.Column(
            "pre_stage_status",
            sa.String(length=32),
            nullable=False,
            server_default="NOT_SIGNED",
        ),
        sa.Column(
            "physics_status",
            sa.String(length=32),
            nullable=False,
            server_default="NOT_ACCEPTED",
        ),
        sa.Column(
            "geodesy_status",
            sa.String(length=32),
            nullable=False,
            server_default="NOT_SIGNED",
        ),
        sa.Column("note_text", sa.Text(), nullable=True),
        sa.Column("note_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("updated_by_id", postgresql.UUID(as_uuid=True), nullable=True),
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
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["line_id"], ["project_lines.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["updated_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("line_id", name="uq_executive_docs_line_id"),
        sa.CheckConstraint(
            "priority IS NULL OR (priority >= 1 AND priority <= 99)",
            name="ck_executive_docs_priority_range",
        ),
        sa.CheckConstraint(
            "pre_stage_status IN ('SIGNED', 'NOT_SIGNED')",
            name="ck_executive_docs_pre_stage_status",
        ),
        sa.CheckConstraint(
            "physics_status IN ('ACCEPTED', 'NOT_ACCEPTED')",
            name="ck_executive_docs_physics_status",
        ),
        sa.CheckConstraint(
            "geodesy_status IN ('SIGNED', 'NOT_SIGNED', 'NOT_REQUIRED')",
            name="ck_executive_docs_geodesy_status",
        ),
    )
    op.create_index("ix_executive_docs_line_id", "executive_docs", ["line_id"], unique=True)
    op.create_index("ix_executive_docs_priority", "executive_docs", ["priority"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_executive_docs_priority", table_name="executive_docs")
    op.drop_index("ix_executive_docs_line_id", table_name="executive_docs")
    op.drop_table("executive_docs")
