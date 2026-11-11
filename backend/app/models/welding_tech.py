from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import (
    ElementCombinationEnum,
    JointKindEnum,
    WeldingMaterialStatusEnum,
    WeldingMaterialTypeEnum,
    WeldingTypeEnum,
    pg_enum,
)


class Welder(Base):
    """Welder or welding brigade profile with primary NAKS attestation scope."""

    __tablename__ = "welders"
    __table_args__ = (UniqueConstraint("stamp", name="uq_welders_stamp"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    legacy_id: Mapped[str | None] = mapped_column(String(128), unique=True, nullable=True)
    stamp: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    is_brigade: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    brigade_members: Mapped[list[str] | None] = mapped_column(ARRAY(String(64)), nullable=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)

    cert_number: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    cert_issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    cert_expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    attestation_area: Mapped[str | None] = mapped_column(Text, nullable=True)
    admission_sheet_number: Mapped[str | None] = mapped_column(String(128), nullable=True)
    admission_sheet_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    allowed_methods: Mapped[list[str]] = mapped_column(
        ARRAY(String(32)), nullable=False, default=list
    )
    crew_foreman: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    steel_groups: Mapped[list[str] | None] = mapped_column(ARRAY(String(32)), nullable=True)
    min_diameter_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_diameter_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    min_wall_thickness_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_wall_thickness_mm: Mapped[float | None] = mapped_column(Float, nullable=True)

    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    naks_certs: Mapped[list[WelderNaksCert]] = relationship(
        back_populates="welder", cascade="all, delete-orphan"
    )


class WelderNaksCert(Base):
    """Per-welding-method NAKS attestation certificate for a Welder."""

    __tablename__ = "welder_naks_certs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    welder_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("welders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    welding_type: Mapped[WeldingTypeEnum] = mapped_column(
        pg_enum(WeldingTypeEnum, "welding_type_enum"), nullable=False
    )
    cert_number: Mapped[str] = mapped_column(String(128), nullable=False)
    issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    admission_sheet_number: Mapped[str | None] = mapped_column(String(128), nullable=True)
    admission_sheet_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    min_diameter_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_diameter_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    min_wall_thickness_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_wall_thickness_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    steel_groups: Mapped[list[str] | None] = mapped_column(ARRAY(String(32)), nullable=True)

    welder: Mapped[Welder] = relationship(back_populates="naks_certs")


class TechCard(Base):
    """Welding Procedure Specification / Tech Card (ТК / WPS)."""

    __tablename__ = "tech_cards"
    __table_args__ = (
        UniqueConstraint("number", name="uq_tech_cards_number"),
        CheckConstraint("min_diameter_mm >= 0", name="min_diameter_non_negative"),
        CheckConstraint("max_diameter_mm >= min_diameter_mm", name="max_ge_min_diameter"),
        CheckConstraint("min_wall_thickness_mm >= 0", name="min_wall_non_negative"),
        CheckConstraint("max_wall_thickness_mm >= min_wall_thickness_mm", name="max_ge_min_wall"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    legacy_id: Mapped[str | None] = mapped_column(String(128), unique=True, nullable=True)
    number: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    welding_type: Mapped[WeldingTypeEnum] = mapped_column(
        pg_enum(WeldingTypeEnum, "welding_type_enum"), nullable=False
    )
    joint_kind: Mapped[JointKindEnum] = mapped_column(
        pg_enum(JointKindEnum, "joint_kind_enum"), nullable=False
    )
    element_combination: Mapped[ElementCombinationEnum] = mapped_column(
        pg_enum(ElementCombinationEnum, "element_combination_enum"), nullable=False
    )
    ntd: Mapped[str] = mapped_column(String(255), nullable=False)
    steel_group: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    min_diameter_mm: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    max_diameter_mm: Mapped[float] = mapped_column(Float, nullable=False, default=9999.0)
    min_wall_thickness_mm: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    max_wall_thickness_mm: Mapped[float] = mapped_column(Float, nullable=False, default=999.0)
    recommended_materials: Mapped[str] = mapped_column(Text, nullable=False, default="")

    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    preheat_rules: Mapped[list[TechCardPreheatRule]] = relationship(
        back_populates="tech_card", cascade="all, delete-orphan"
    )


class TechCardPreheatRule(Base):
    """Ambient temperature dependent preheat requirement rule belonging to a TechCard."""

    __tablename__ = "tech_card_preheat_rules"
    __table_args__ = (
        CheckConstraint("ambient_max_c >= ambient_min_c", name="ambient_range_valid"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tech_card_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tech_cards.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    ambient_min_c: Mapped[float] = mapped_column(Float, nullable=False)
    ambient_max_c: Mapped[float] = mapped_column(Float, nullable=False)
    min_preheat_temp_c: Mapped[float] = mapped_column(Float, nullable=False)
    condition_label: Mapped[str] = mapped_column(String(255), nullable=False)

    tech_card: Mapped[TechCard] = relationship(back_populates="preheat_rules")


class WeldingMaterial(Base):
    """Welding consumable certificate with incoming quality control act."""

    __tablename__ = "welding_materials"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    legacy_id: Mapped[str | None] = mapped_column(String(128), unique=True, nullable=True)
    brand_and_diameter: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    material_type: Mapped[WeldingMaterialTypeEnum] = mapped_column(
        pg_enum(WeldingMaterialTypeEnum, "welding_material_type_enum"), nullable=False
    )
    welding_method: Mapped[WeldingTypeEnum] = mapped_column(
        pg_enum(WeldingTypeEnum, "welding_type_enum"), nullable=False
    )
    batch_number: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    certificate_number: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    incoming_control_act: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    incoming_control_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[WeldingMaterialStatusEnum] = mapped_column(
        pg_enum(WeldingMaterialStatusEnum, "welding_material_status_enum"),
        nullable=False,
        default=WeldingMaterialStatusEnum.ADMITTED,
    )

    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class Inspector(Base):
    """NDT / VIK laboratory inspector reference directory."""

    __tablename__ = "inspectors"
    __table_args__ = (UniqueConstraint("full_name", name="uq_inspectors_full_name"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    cert_level: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    lab_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
