"""Initial PostgreSQL relational schema for ZAYCHICK 2.0.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-11-11 20:30:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001_initial_schema"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Shared PostgreSQL Enum types
user_role_enum = postgresql.ENUM(
    "ADMIN", "PTO", "OGS", "PIL", "VIEWER", name="user_role_enum", create_type=False
)
joint_type_enum = postgresql.ENUM(
    "Монтажный", "Цеховой", name="joint_type_enum", create_type=False
)
joint_kind_enum = postgresql.ENUM(
    "Стыковое", "Угловое", name="joint_kind_enum", create_type=False
)
welding_type_enum = postgresql.ENUM(
    "РАД", "РД", "РАД+РД", "МП", "АФ", "АПГ", name="welding_type_enum", create_type=False
)
element_combination_enum = postgresql.ENUM(
    "Труба+Труба",
    "Труба+СДТ",
    "СДТ+СДТ",
    "Труба+ЗРА",
    "СДТ+ЗРА",
    name="element_combination_enum",
    create_type=False,
)
control_result_enum = postgresql.ENUM(
    "Годен",
    "Ремонт",
    "Вырезать",
    "В работе",
    "Не проводился",
    name="control_result_enum",
    create_type=False,
)
ndt_method_enum = postgresql.ENUM(
    "РК", "УЗК", "ПВК", "МК", "РК+УЗК", "Не требуется", name="ndt_method_enum", create_type=False
)
lrv_category_enum = postgresql.ENUM(
    "Все типы",
    "Труба",
    "Отвод",
    "Переход",
    "Тройник",
    "ЗРА",
    "Кран",
    "Фланец",
    "Заглушка",
    "Прочее",
    name="lrv_category_enum",
    create_type=False,
)
lrv_unit_enum = postgresql.ENUM("шт", "м", name="lrv_unit_enum", create_type=False)
lrv_status_enum = postgresql.ENUM(
    "active", "superseded", "archived", name="lrv_status_enum", create_type=False
)
welding_material_type_enum = postgresql.ENUM(
    "Проволока сварочная",
    "Электроды покрытые",
    "Защитный газ",
    "Комбинированный комплект (РАД+РД)",
    name="welding_material_type_enum",
    create_type=False,
)
welding_material_status_enum = postgresql.ENUM(
    "Допущен в производство",
    "На испытании",
    name="welding_material_status_enum",
    create_type=False,
)

ALL_ENUMS = (
    user_role_enum,
    joint_type_enum,
    joint_kind_enum,
    welding_type_enum,
    element_combination_enum,
    control_result_enum,
    ndt_method_enum,
    lrv_category_enum,
    lrv_unit_enum,
    lrv_status_enum,
    welding_material_type_enum,
    welding_material_status_enum,
)


def upgrade() -> None:
    bind = op.get_bind()
    for pg_enum_type in ALL_ENUMS:
        pg_enum_type.create(bind, checkfirst=True)

    # 1. users
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("login", sa.String(length=64), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("role", user_role_enum, nullable=False),
        sa.Column("department", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("position_title", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("session_number", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "must_change_password", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("login", name="uq_users_login"),
    )
    op.create_index("ix_users_login", "users", ["login"], unique=False)
    op.create_index(
        "ix_users_login_lower", "users", [sa.text("lower(btrim(login))")], unique=True
    )

    # 2. facilities + facility_rd_codes + custom_weather_stations
    op.create_table(
        "facilities",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("external_id", sa.String(length=64), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("short_name", sa.String(length=128), nullable=False, server_default=""),
        sa.Column("region", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("weather_station", sa.String(length=255), nullable=True),
        sa.Column("weather_station_id", sa.String(length=64), nullable=True),
        sa.Column("weather_station_distance_km", sa.Float(), nullable=True),
        sa.Column("weather_station_source", sa.String(length=64), nullable=True),
        sa.Column("weather_last_check_status", sa.String(length=32), nullable=True),
        sa.Column("weather_last_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("weather_last_error_message", sa.Text(), nullable=True),
        sa.Column(
            "weather_archive",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "weather_observations",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_facilities"),
        sa.UniqueConstraint("external_id", name="uq_facilities_external_id"),
        sa.UniqueConstraint("name", name="uq_facilities_name"),
    )
    op.create_index("ix_facilities_name", "facilities", ["name"], unique=False)

    op.create_table(
        "facility_rd_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("facility_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=255), nullable=False),
        sa.Column("title", sa.String(length=512), nullable=False, server_default=""),
        sa.Column(
            "contours",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.ForeignKeyConstraint(
            ["facility_id"],
            ["facilities.id"],
            name="fk_facility_rd_codes_facility_id_facilities",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_facility_rd_codes"),
        sa.UniqueConstraint("facility_id", "code", name="uq_facility_rd_code"),
    )
    op.create_index("ix_facility_rd_codes_facility_id", "facility_rd_codes", ["facility_id"])
    op.create_index("ix_facility_rd_codes_code", "facility_rd_codes", ["code"])

    op.create_table(
        "custom_weather_stations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("facility_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("station_code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("region", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("elevation_m", sa.Float(), nullable=True),
        sa.Column("device_model", sa.String(length=255), nullable=True),
        sa.Column("verification_cert_number", sa.String(length=255), nullable=True),
        sa.Column("verification_valid_until", sa.Date(), nullable=True),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("source", sa.String(length=32), nullable=False, server_default="custom"),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["facility_id"],
            ["facilities.id"],
            name="fk_custom_weather_stations_facility_id_facilities",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["users.id"],
            name="fk_custom_weather_stations_created_by_id_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_custom_weather_stations"),
        sa.UniqueConstraint("facility_id", "station_code", name="uq_facility_custom_station"),
    )
    op.create_index(
        "ix_custom_weather_stations_facility_id", "custom_weather_stations", ["facility_id"]
    )

    # 3. project_lines
    op.create_table(
        "project_lines",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("legacy_id", sa.String(length=128), nullable=True),
        sa.Column("facility_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("object_name", sa.String(length=255), nullable=False),
        sa.Column("rd_code", sa.String(length=255), nullable=False),
        sa.Column("line_number", sa.String(length=128), nullable=False),
        sa.Column("unique_line_id", sa.String(length=255), nullable=False),
        sa.Column("line_name", sa.String(length=512), nullable=False, server_default=""),
        sa.Column("product", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("test_contour", sa.String(length=255), nullable=False, server_default=""),
        sa.Column(
            "welding_ntd",
            sa.String(length=255),
            nullable=False,
            server_default="СТО Газпром 15-1.1-002-2023",
        ),
        sa.Column(
            "control_ntd",
            sa.String(length=255),
            nullable=False,
            server_default="СТО Газпром 15-1.1-002-2023",
        ),
        sa.Column("quality_level", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("pipeline_category", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("working_pressure", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("working_temperature", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("rk_percent", sa.Float(), nullable=False, server_default="0"),
        sa.Column("uzk_percent", sa.Float(), nullable=False, server_default="0"),
        sa.Column("pvk_percent", sa.Float(), nullable=False, server_default="0"),
        sa.Column("manual_status", sa.String(length=255), nullable=True),
        sa.Column("test_date", sa.Date(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("updated_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint("rk_percent >= 0 AND rk_percent <= 100", name="ck_project_lines_rk_percent_range"),
        sa.CheckConstraint("uzk_percent >= 0 AND uzk_percent <= 100", name="ck_project_lines_uzk_percent_range"),
        sa.CheckConstraint("pvk_percent >= 0 AND pvk_percent <= 100", name="ck_project_lines_pvk_percent_range"),
        sa.ForeignKeyConstraint(
            ["facility_id"],
            ["facilities.id"],
            name="fk_project_lines_facility_id_facilities",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_id"],
            ["users.id"],
            name="fk_project_lines_updated_by_id_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_project_lines"),
        sa.UniqueConstraint("legacy_id", name="uq_project_lines_legacy_id"),
        sa.UniqueConstraint("unique_line_id", name="uq_project_lines_unique_line_id"),
    )
    op.create_index("ix_project_lines_facility_id", "project_lines", ["facility_id"])
    op.create_index("ix_project_lines_object_name", "project_lines", ["object_name"])
    op.create_index("ix_project_lines_rd_code", "project_lines", ["rd_code"])
    op.create_index("ix_project_lines_line_number", "project_lines", ["line_number"])

    # 4. lrv_items
    op.create_table(
        "lrv_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("legacy_id", sa.String(length=128), nullable=True),
        sa.Column("facility_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("lrv_code", sa.String(length=128), nullable=False),
        sa.Column("rd_code", sa.String(length=255), nullable=False),
        sa.Column("object_name", sa.String(length=255), nullable=False),
        sa.Column("short_name", sa.String(length=255), nullable=False),
        sa.Column("category", lrv_category_enum, nullable=True),
        sa.Column("connection_type", sa.String(length=64), nullable=True),
        sa.Column("material", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("ntd", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("manufacturer", sa.String(length=255), nullable=True),
        sa.Column("dn1", sa.Integer(), nullable=True),
        sa.Column("diameter_mm", sa.Float(), nullable=False, server_default="0"),
        sa.Column("wall_thickness", sa.Float(), nullable=False, server_default="0"),
        sa.Column("dn2", sa.Integer(), nullable=True),
        sa.Column("diameter_mm2", sa.Float(), nullable=True),
        sa.Column("wall_thickness2", sa.Float(), nullable=True),
        sa.Column("spec_qty", sa.Float(), nullable=False, server_default="0"),
        sa.Column("unit", lrv_unit_enum, nullable=False, server_default="шт"),
        sa.Column("status", lrv_status_enum, nullable=False, server_default="active"),
        sa.Column("replacement_letter", sa.String(length=512), nullable=True),
        sa.Column("replacement_date", sa.Date(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint("diameter_mm >= 0", name="ck_lrv_items_diameter_non_negative"),
        sa.CheckConstraint("wall_thickness >= 0", name="ck_lrv_items_wall_thickness_non_negative"),
        sa.CheckConstraint("spec_qty >= 0", name="ck_lrv_items_spec_qty_non_negative"),
        sa.ForeignKeyConstraint(
            ["facility_id"],
            ["facilities.id"],
            name="fk_lrv_items_facility_id_facilities",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_lrv_items"),
        sa.UniqueConstraint("legacy_id", name="uq_lrv_items_legacy_id"),
        sa.UniqueConstraint("rd_code", "lrv_code", name="uq_lrv_rd_code_lrv_code"),
    )
    op.create_index("ix_lrv_items_facility_id", "lrv_items", ["facility_id"])
    op.create_index("ix_lrv_items_lrv_code", "lrv_items", ["lrv_code"])
    op.create_index("ix_lrv_items_rd_code", "lrv_items", ["rd_code"])
    op.create_index("ix_lrv_items_status", "lrv_items", ["status"])

    # 5. welders + welder_naks_certs + tech_cards + tech_card_preheat_rules + welding_materials + inspectors
    op.create_table(
        "welders",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("legacy_id", sa.String(length=128), nullable=True),
        sa.Column("stamp", sa.String(length=64), nullable=False),
        sa.Column("is_brigade", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("brigade_members", postgresql.ARRAY(sa.String(length=64)), nullable=True),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("cert_number", sa.String(length=128), nullable=False, server_default=""),
        sa.Column("cert_issue_date", sa.Date(), nullable=True),
        sa.Column("cert_expiry_date", sa.Date(), nullable=True),
        sa.Column("attestation_area", sa.Text(), nullable=True),
        sa.Column("admission_sheet_number", sa.String(length=128), nullable=True),
        sa.Column("admission_sheet_date", sa.Date(), nullable=True),
        sa.Column(
            "allowed_methods",
            postgresql.ARRAY(sa.String(length=32)),
            nullable=False,
            server_default=sa.text("'{}'::varchar[]"),
        ),
        sa.Column("crew_foreman", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("steel_groups", postgresql.ARRAY(sa.String(length=32)), nullable=True),
        sa.Column("min_diameter_mm", sa.Float(), nullable=True),
        sa.Column("max_diameter_mm", sa.Float(), nullable=True),
        sa.Column("min_wall_thickness_mm", sa.Float(), nullable=True),
        sa.Column("max_wall_thickness_mm", sa.Float(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_welders"),
        sa.UniqueConstraint("legacy_id", name="uq_welders_legacy_id"),
        sa.UniqueConstraint("stamp", name="uq_welders_stamp"),
    )
    op.create_index("ix_welders_stamp", "welders", ["stamp"])

    op.create_table(
        "welder_naks_certs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("welder_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("welding_type", welding_type_enum, nullable=False),
        sa.Column("cert_number", sa.String(length=128), nullable=False),
        sa.Column("issue_date", sa.Date(), nullable=True),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column("admission_sheet_number", sa.String(length=128), nullable=True),
        sa.Column("admission_sheet_date", sa.Date(), nullable=True),
        sa.Column("min_diameter_mm", sa.Float(), nullable=True),
        sa.Column("max_diameter_mm", sa.Float(), nullable=True),
        sa.Column("min_wall_thickness_mm", sa.Float(), nullable=True),
        sa.Column("max_wall_thickness_mm", sa.Float(), nullable=True),
        sa.Column("steel_groups", postgresql.ARRAY(sa.String(length=32)), nullable=True),
        sa.ForeignKeyConstraint(
            ["welder_id"],
            ["welders.id"],
            name="fk_welder_naks_certs_welder_id_welders",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_welder_naks_certs"),
    )
    op.create_index("ix_welder_naks_certs_welder_id", "welder_naks_certs", ["welder_id"])

    op.create_table(
        "tech_cards",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("legacy_id", sa.String(length=128), nullable=True),
        sa.Column("number", sa.String(length=128), nullable=False),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("welding_type", welding_type_enum, nullable=False),
        sa.Column("joint_kind", joint_kind_enum, nullable=False),
        sa.Column("element_combination", element_combination_enum, nullable=False),
        sa.Column("ntd", sa.String(length=255), nullable=False),
        sa.Column("steel_group", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("min_diameter_mm", sa.Float(), nullable=False, server_default="0"),
        sa.Column("max_diameter_mm", sa.Float(), nullable=False, server_default="9999"),
        sa.Column("min_wall_thickness_mm", sa.Float(), nullable=False, server_default="0"),
        sa.Column("max_wall_thickness_mm", sa.Float(), nullable=False, server_default="999"),
        sa.Column("recommended_materials", sa.Text(), nullable=False, server_default=""),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint("min_diameter_mm >= 0", name="ck_tech_cards_min_diameter_non_negative"),
        sa.CheckConstraint(
            "max_diameter_mm >= min_diameter_mm", name="ck_tech_cards_max_ge_min_diameter"
        ),
        sa.CheckConstraint(
            "min_wall_thickness_mm >= 0", name="ck_tech_cards_min_wall_non_negative"
        ),
        sa.CheckConstraint(
            "max_wall_thickness_mm >= min_wall_thickness_mm", name="ck_tech_cards_max_ge_min_wall"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_tech_cards"),
        sa.UniqueConstraint("legacy_id", name="uq_tech_cards_legacy_id"),
        sa.UniqueConstraint("number", name="uq_tech_cards_number"),
    )
    op.create_index("ix_tech_cards_number", "tech_cards", ["number"])

    op.create_table(
        "tech_card_preheat_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tech_card_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("ambient_min_c", sa.Float(), nullable=False),
        sa.Column("ambient_max_c", sa.Float(), nullable=False),
        sa.Column("min_preheat_temp_c", sa.Float(), nullable=False),
        sa.Column("condition_label", sa.String(length=255), nullable=False),
        sa.CheckConstraint(
            "ambient_max_c >= ambient_min_c", name="ck_tech_card_preheat_rules_ambient_range_valid"
        ),
        sa.ForeignKeyConstraint(
            ["tech_card_id"],
            ["tech_cards.id"],
            name="fk_tech_card_preheat_rules_tech_card_id_tech_cards",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_tech_card_preheat_rules"),
    )
    op.create_index(
        "ix_tech_card_preheat_rules_tech_card_id", "tech_card_preheat_rules", ["tech_card_id"]
    )

    op.create_table(
        "welding_materials",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("legacy_id", sa.String(length=128), nullable=True),
        sa.Column("brand_and_diameter", sa.String(length=255), nullable=False),
        sa.Column("material_type", welding_material_type_enum, nullable=False),
        sa.Column("welding_method", welding_type_enum, nullable=False),
        sa.Column("batch_number", sa.String(length=128), nullable=False, server_default=""),
        sa.Column("certificate_number", sa.String(length=128), nullable=False, server_default=""),
        sa.Column("incoming_control_act", sa.String(length=128), nullable=False, server_default=""),
        sa.Column("incoming_control_date", sa.Date(), nullable=True),
        sa.Column(
            "status",
            welding_material_status_enum,
            nullable=False,
            server_default="Допущен в производство",
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_welding_materials"),
        sa.UniqueConstraint("legacy_id", name="uq_welding_materials_legacy_id"),
    )
    op.create_index(
        "ix_welding_materials_brand_and_diameter", "welding_materials", ["brand_and_diameter"]
    )

    op.create_table(
        "inspectors",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("cert_level", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("lab_name", sa.String(length=255), nullable=False, server_default=""),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_inspectors"),
        sa.UniqueConstraint("full_name", name="uq_inspectors_full_name"),
    )

    # 6. weld_joints (fully normalized, zero payload_json, strict UniqueConstraint line_id + joint_number)
    op.create_table(
        "weld_joints",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("legacy_id", sa.String(length=128), nullable=True),
        sa.Column("line_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("facility_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("lrv1_item_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("lrv2_item_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("tech_card_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("updated_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("object_name", sa.String(length=255), nullable=False),
        sa.Column("rd_code", sa.String(length=255), nullable=False),
        sa.Column("contour", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("line_number", sa.String(length=128), nullable=False, server_default=""),
        sa.Column("unique_line_id", sa.String(length=255), nullable=False),
        sa.Column("joint_number", sa.String(length=64), nullable=False),
        sa.Column(
            "is_supplementary", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column("joint_kind", joint_kind_enum, nullable=False, server_default="Стыковое"),
        sa.Column("joint_type", joint_type_enum, nullable=False, server_default="Монтажный"),
        sa.Column("diameter_mm", sa.Float(), nullable=False, server_default="0"),
        sa.Column("diameter_inch", sa.String(length=32), nullable=False, server_default=""),
        sa.Column("equiv_diameter_inch", sa.Float(), nullable=True),
        sa.Column("wall_thickness", sa.Float(), nullable=False, server_default="0"),
        sa.Column("lrv1_code", sa.String(length=128), nullable=False, server_default=""),
        sa.Column("elem1_name", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("elem1_material", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("elem1_ntd", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("elem1_diameter_mm", sa.Float(), nullable=True),
        sa.Column("elem1_wall_thickness", sa.Float(), nullable=True),
        sa.Column("elem1_factory_number", sa.String(length=128), nullable=True),
        sa.Column("elem1_manufacturer", sa.String(length=255), nullable=True),
        sa.Column("elem1_length", sa.String(length=64), nullable=True),
        sa.Column("elem1_cert_number", sa.String(length=128), nullable=True),
        sa.Column("elem1_heat_number", sa.String(length=128), nullable=True),
        sa.Column("elem1_batch_number", sa.String(length=128), nullable=True),
        sa.Column("lrv2_code", sa.String(length=128), nullable=False, server_default=""),
        sa.Column("elem2_name", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("elem2_material", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("elem2_ntd", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("elem2_diameter_mm", sa.Float(), nullable=True),
        sa.Column("elem2_wall_thickness", sa.Float(), nullable=True),
        sa.Column("elem2_factory_number", sa.String(length=128), nullable=True),
        sa.Column("elem2_manufacturer", sa.String(length=255), nullable=True),
        sa.Column("elem2_length", sa.String(length=64), nullable=True),
        sa.Column("elem2_cert_number", sa.String(length=128), nullable=True),
        sa.Column("elem2_heat_number", sa.String(length=128), nullable=True),
        sa.Column("elem2_batch_number", sa.String(length=128), nullable=True),
        sa.Column("welding_type", sa.String(length=32), nullable=False, server_default=""),
        sa.Column("gost_joint_type", sa.String(length=32), nullable=True),
        sa.Column("welding_position", sa.String(length=32), nullable=True),
        sa.Column("welding_date", sa.Date(), nullable=True),
        sa.Column("welder_stamp", sa.String(length=128), nullable=False, server_default=""),
        sa.Column("welder_stamps_list", postgresql.ARRAY(sa.String(length=64)), nullable=True),
        sa.Column("brigade_stamp", sa.String(length=64), nullable=True),
        sa.Column("welding_materials", sa.String(length=512), nullable=False, server_default=""),
        sa.Column("ambient_temp_c", sa.Float(), nullable=True),
        sa.Column("weather_source", sa.String(length=255), nullable=True),
        sa.Column("preheat_temp", sa.String(length=32), nullable=True),
        sa.Column("responsible_person", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("welder_full_name", sa.String(length=512), nullable=False, server_default=""),
        sa.Column("welder_cert_number", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("tech_card_number", sa.String(length=128), nullable=False, server_default=""),
        sa.Column(
            "vik_result", control_result_enum, nullable=False, server_default="Не проводился"
        ),
        sa.Column("vik_date", sa.Date(), nullable=True),
        sa.Column("vik_inspector", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("vik_report_number", sa.String(length=128), nullable=True),
        sa.Column("ndt_type", ndt_method_enum, nullable=False, server_default="Не требуется"),
        sa.Column("ndt_date", sa.Date(), nullable=True),
        sa.Column(
            "ndt_result", control_result_enum, nullable=False, server_default="Не проводился"
        ),
        sa.Column("ndt_inspector", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("ndt_report_number", sa.String(length=128), nullable=True),
        sa.Column("dup_ndt_type", ndt_method_enum, nullable=False, server_default="Не требуется"),
        sa.Column("dup_ndt_date", sa.Date(), nullable=True),
        sa.Column(
            "dup_ndt_result", control_result_enum, nullable=False, server_default="Не проводился"
        ),
        sa.Column("dup_ndt_inspector", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("dup_ndt_report_number", sa.String(length=128), nullable=True),
        sa.Column("root_weld_control", sa.String(length=255), nullable=True),
        sa.Column("steeloscopy_info", sa.String(length=255), nullable=True),
        sa.Column("heat_treat_operator", sa.String(length=255), nullable=True),
        sa.Column("heat_treat_diagram_number", sa.String(length=128), nullable=True),
        sa.Column("hardness_test_info", sa.String(length=255), nullable=True),
        sa.Column("ferrite_phase_info", sa.String(length=255), nullable=True),
        sa.Column("repair_action", sa.String(length=64), nullable=True),
        sa.Column("repair_date", sa.Date(), nullable=True),
        sa.Column("repair_tech_card", sa.String(length=128), nullable=True),
        sa.Column("repair_welder_stamp", sa.String(length=128), nullable=True),
        sa.Column("repair_foreman", sa.String(length=255), nullable=True),
        sa.Column("repair_length_mm", sa.Float(), nullable=True),
        sa.Column("repair_defect_type", sa.String(length=255), nullable=True),
        sa.Column("repair_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("repair_vik_number", sa.String(length=128), nullable=True),
        sa.Column("repair_vik_date", sa.Date(), nullable=True),
        sa.Column("repair_vik_result", control_result_enum, nullable=True),
        sa.Column("repair_vik_inspector", sa.String(length=255), nullable=True),
        sa.Column("repair_ndt_type", ndt_method_enum, nullable=True),
        sa.Column("repair_ndt_number", sa.String(length=128), nullable=True),
        sa.Column("repair_ndt_date", sa.Date(), nullable=True),
        sa.Column("repair_ndt_result", control_result_enum, nullable=True),
        sa.Column("repair_ndt_inspector", sa.String(length=255), nullable=True),
        sa.Column("repair_dup_ndt_type", ndt_method_enum, nullable=True),
        sa.Column("repair_dup_ndt_number", sa.String(length=128), nullable=True),
        sa.Column("repair_dup_ndt_date", sa.Date(), nullable=True),
        sa.Column("repair_dup_ndt_result", control_result_enum, nullable=True),
        sa.Column("repair_dup_ndt_inspector", sa.String(length=255), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("updated_by", sa.String(length=255), nullable=False, server_default=""),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint("diameter_mm >= 0", name="ck_weld_joints_diameter_non_negative"),
        sa.CheckConstraint(
            "wall_thickness >= 0", name="ck_weld_joints_wall_thickness_non_negative"
        ),
        sa.CheckConstraint("repair_count >= 0", name="ck_weld_joints_repair_count_non_negative"),
        sa.ForeignKeyConstraint(
            ["line_id"],
            ["project_lines.id"],
            name="fk_weld_joints_line_id_project_lines",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["facility_id"],
            ["facilities.id"],
            name="fk_weld_joints_facility_id_facilities",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["lrv1_item_id"],
            ["lrv_items.id"],
            name="fk_weld_joints_lrv1_item_id_lrv_items",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["lrv2_item_id"],
            ["lrv_items.id"],
            name="fk_weld_joints_lrv2_item_id_lrv_items",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["tech_card_id"],
            ["tech_cards.id"],
            name="fk_weld_joints_tech_card_id_tech_cards",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_id"],
            ["users.id"],
            name="fk_weld_joints_updated_by_id_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_weld_joints"),
        sa.UniqueConstraint("legacy_id", name="uq_weld_joints_legacy_id"),
        sa.UniqueConstraint("line_id", "joint_number", name="uq_line_joint_number"),
    )
    op.create_index("ix_weld_joints_line_id", "weld_joints", ["line_id"])
    op.create_index("ix_weld_joints_facility_id", "weld_joints", ["facility_id"])
    op.create_index("ix_weld_joints_object_name", "weld_joints", ["object_name"])
    op.create_index("ix_weld_joints_rd_code", "weld_joints", ["rd_code"])
    op.create_index("ix_weld_joints_unique_line_id", "weld_joints", ["unique_line_id"])
    op.create_index("ix_weld_joints_joint_number", "weld_joints", ["joint_number"])
    op.create_index("ix_weld_joints_welding_date", "weld_joints", ["welding_date"])
    op.create_index("ix_weld_joints_welder_stamp", "weld_joints", ["welder_stamp"])
    op.create_index(
        "ix_weld_joints_line_joint_norm",
        "weld_joints",
        ["line_id", sa.text("lower(btrim(joint_number))")],
        unique=True,
    )

    # 7. audit_logs (append-only)
    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "timestamp",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("user_login", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("user_full_name", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("user_role", sa.String(length=32), nullable=False, server_default=""),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("entity_type", sa.String(length=64), nullable=False),
        sa.Column("entity_id", sa.String(length=128), nullable=False),
        sa.Column("old_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("new_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("ip_address", postgresql.INET(), nullable=True),
        sa.Column("joint_number", sa.String(length=64), nullable=True),
        sa.Column("unique_line_id", sa.String(length=255), nullable=True),
        sa.Column("rd_code", sa.String(length=255), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_audit_logs_user_id_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_audit_logs"),
    )
    op.create_index("ix_audit_logs_timestamp", "audit_logs", ["timestamp"])
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_entity_type", "audit_logs", ["entity_type"])
    op.create_index("ix_audit_logs_entity_id", "audit_logs", ["entity_id"])
    op.create_index(
        "ix_audit_logs_entity_lookup",
        "audit_logs",
        ["entity_type", "entity_id", "timestamp"],
    )

    # DB-level trigger forbidding UPDATE/DELETE on audit_logs (tamper-proof append-only log)
    op.execute(
        """
        CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
        RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'audit_logs table is append-only: % is forbidden', TG_OP;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_audit_logs_immutable
        BEFORE UPDATE OR DELETE ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
        """
    )

    # 8. column_templates & app_settings
    op.create_table(
        "column_templates",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "column_order",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "visible_columns",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("custom_widths", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "is_active_default", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["users.id"],
            name="fk_column_templates_owner_id_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_column_templates"),
    )

    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(length=128), nullable=False),
        sa.Column(
            "value_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("key", name="pk_app_settings"),
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;")
    op.execute("DROP FUNCTION IF EXISTS prevent_audit_log_mutation();")
    op.drop_table("app_settings")
    op.drop_table("column_templates")
    op.drop_table("audit_logs")
    op.drop_table("weld_joints")
    op.drop_table("inspectors")
    op.drop_table("welding_materials")
    op.drop_table("tech_card_preheat_rules")
    op.drop_table("tech_cards")
    op.drop_table("welder_naks_certs")
    op.drop_table("welders")
    op.drop_table("lrv_items")
    op.drop_table("project_lines")
    op.drop_table("custom_weather_stations")
    op.drop_table("facility_rd_codes")
    op.drop_table("facilities")
    op.drop_table("users")

    bind = op.get_bind()
    for pg_enum_type in reversed(ALL_ENUMS):
        pg_enum_type.drop(bind, checkfirst=True)
