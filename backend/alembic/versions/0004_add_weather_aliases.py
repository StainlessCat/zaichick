"""Add weather_stations.name_en and weather_station_aliases table.

Revision ID: 0004_add_weather_aliases
Revises: 0003_add_weather_module
Create Date: 2026-11-15 13:30:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0004_add_weather_aliases"
down_revision: Union[str, Sequence[str], None] = "0003_add_weather_module"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add name_en to weather_stations
    op.add_column(
        "weather_stations",
        sa.Column("name_en", sa.String(255), nullable=True),
    )

    # 2. Create weather_station_aliases
    op.create_table(
        "weather_station_aliases",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("settlement_name", sa.String(255), nullable=False),
        sa.Column(
            "station_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("weather_stations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("distance_km", sa.Float(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("settlement_name", "station_id", name="uq_settlement_station"),
    )
    op.create_index(
        "ix_weather_station_aliases_settlement_name",
        "weather_station_aliases",
        ["settlement_name"],
        unique=False,
    )
    op.create_index(
        "ix_weather_station_aliases_station_id",
        "weather_station_aliases",
        ["station_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_weather_station_aliases_station_id", table_name="weather_station_aliases")
    op.drop_index("ix_weather_station_aliases_settlement_name", table_name="weather_station_aliases")
    op.drop_table("weather_station_aliases")
    op.drop_column("weather_stations", "name_en")
