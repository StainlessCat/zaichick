"""Add site_weather_daily table for coordinate-based daily temperature archive.

Revision ID: 0017_add_site_weather_daily
Revises: 0016_add_user_sessions
Create Date: 2026-11-28 11:08:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0017_add_site_weather_daily"
down_revision = "0016_add_user_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "site_weather_daily",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("coord_key", sa.String(length=32), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("obs_date", sa.Date(), nullable=False),
        sa.Column("t_min", sa.Float(), nullable=True),
        sa.Column("t_max", sa.Float(), nullable=True),
        sa.Column("t_mean", sa.Float(), nullable=True),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("coord_key", "obs_date", name="uq_site_weather_coord_date"),
    )
    op.create_index("ix_site_weather_daily_coord_key", "site_weather_daily", ["coord_key"])
    op.create_index("ix_site_weather_daily_obs_date", "site_weather_daily", ["obs_date"])


def downgrade() -> None:
    op.drop_index("ix_site_weather_daily_obs_date", table_name="site_weather_daily")
    op.drop_index("ix_site_weather_daily_coord_key", table_name="site_weather_daily")
    op.drop_table("site_weather_daily")
