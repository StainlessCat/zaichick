"""Add weather stations, weather daily, and line weather station link.

Revision ID: 0003_add_weather_module
Revises: 0002_add_ndt_lab_requests
Create Date: 2026-11-15 11:20:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0003_add_weather_module"
down_revision: Union[str, Sequence[str], None] = "0002_add_ndt_lab_requests"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. weather_stations
    op.create_table(
        "weather_stations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("wmo_id", sa.String(10), nullable=False),
        sa.Column("usaf", sa.String(10), nullable=True),
        sa.Column("wban", sa.String(10), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("region", sa.String(255), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("wmo_id", name="uq_weather_stations_wmo_id"),
    )
    op.create_index(
        "ix_weather_stations_wmo_id",
        "weather_stations",
        ["wmo_id"],
        unique=True,
    )
    op.create_index(
        "ix_weather_stations_name",
        "weather_stations",
        ["name"],
        unique=False,
    )

    # 2. weather_daily
    op.create_table(
        "weather_daily",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "station_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("weather_stations.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("obs_date", sa.Date(), nullable=False),
        sa.Column("t_min", sa.Float(), nullable=True),
        sa.Column("t_max", sa.Float(), nullable=True),
        sa.Column("t_mean", sa.Float(), nullable=True),
        sa.Column("source", sa.String(30), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("station_id", "obs_date", name="uq_station_obs_date"),
    )
    op.create_index(
        "ix_weather_daily_station_id",
        "weather_daily",
        ["station_id"],
        unique=False,
    )
    op.create_index(
        "ix_weather_daily_obs_date",
        "weather_daily",
        ["obs_date"],
        unique=False,
    )

    # 3. project_lines link
    op.add_column(
        "project_lines",
        sa.Column(
            "weather_station_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("weather_stations.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_project_lines_weather_station_id",
        "project_lines",
        ["weather_station_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_project_lines_weather_station_id", table_name="project_lines")
    op.drop_column("project_lines", "weather_station_id")

    op.drop_index("ix_weather_daily_obs_date", table_name="weather_daily")
    op.drop_index("ix_weather_daily_station_id", table_name="weather_daily")
    op.drop_table("weather_daily")

    op.drop_index("ix_weather_stations_name", table_name="weather_stations")
    op.drop_index("ix_weather_stations_wmo_id", table_name="weather_stations")
    op.drop_table("weather_stations")
