from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import (
    ControlResultEnum,
    JointKindEnum,
    JointTypeEnum,
    NdtMethodEnum,
    pg_enum,
)

if TYPE_CHECKING:
    from app.models.line import ProjectLine


class WeldJoint(Base):
    """Normalized relational model for a pipeline weld joint (no payload_json)."""

    __tablename__ = "weld_joints"
    __table_args__ = (
        UniqueConstraint("line_id", "joint_number", name="uq_line_joint_number"),
        Index(
            "ix_weld_joints_line_joint_norm",
            "line_id",
            text("lower(btrim(joint_number))"),
            unique=True,
        ),
        CheckConstraint("diameter_mm >= 0", name="diameter_non_negative"),
        CheckConstraint("wall_thickness >= 0", name="wall_thickness_non_negative"),
        CheckConstraint("repair_count >= 0", name="repair_count_non_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    legacy_id: Mapped[str | None] = mapped_column(String(128), unique=True, nullable=True)

    # Relational links
    line_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_lines.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    facility_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("facilities.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    lrv1_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lrv_items.id", ondelete="SET NULL"),
        nullable=True,
    )
    lrv2_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lrv_items.id", ondelete="SET NULL"),
        nullable=True,
    )
    tech_card_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tech_cards.id", ondelete="SET NULL"),
        nullable=True,
    )
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Architectural binding snapshots
    object_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    rd_code: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    contour: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    line_number: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    unique_line_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    # 1. Production preparation
    joint_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    is_supplementary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    joint_kind: Mapped[JointKindEnum] = mapped_column(
        pg_enum(JointKindEnum, "joint_kind_enum"),
        nullable=False,
        default=JointKindEnum.BUTT,
    )
    joint_type: Mapped[JointTypeEnum] = mapped_column(
        pg_enum(JointTypeEnum, "joint_type_enum"),
        nullable=False,
        default=JointTypeEnum.MOUNTING,
    )
    diameter_mm: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    diameter_inch: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    equiv_diameter_inch: Mapped[float | None] = mapped_column(Float, nullable=True)
    wall_thickness: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Element 1 (LRV 1)
    lrv1_code: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    elem1_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    elem1_material: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    elem1_ntd: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    elem1_diameter_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    elem1_wall_thickness: Mapped[float | None] = mapped_column(Float, nullable=True)
    elem1_factory_number: Mapped[str | None] = mapped_column(String(128), nullable=True)
    elem1_manufacturer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    elem1_length: Mapped[str | None] = mapped_column(String(64), nullable=True)
    elem1_cert_number: Mapped[str | None] = mapped_column(String(128), nullable=True)
    elem1_heat_number: Mapped[str | None] = mapped_column(String(128), nullable=True)
    elem1_batch_number: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # Element 2 (LRV 2)
    lrv2_code: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    elem2_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    elem2_material: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    elem2_ntd: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    elem2_diameter_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    elem2_wall_thickness: Mapped[float | None] = mapped_column(Float, nullable=True)
    elem2_factory_number: Mapped[str | None] = mapped_column(String(128), nullable=True)
    elem2_manufacturer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    elem2_length: Mapped[str | None] = mapped_column(String(64), nullable=True)
    elem2_cert_number: Mapped[str | None] = mapped_column(String(128), nullable=True)
    elem2_heat_number: Mapped[str | None] = mapped_column(String(128), nullable=True)
    elem2_batch_number: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # 2. Welding execution
    welding_type: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    gost_joint_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    welding_position: Mapped[str | None] = mapped_column(String(32), nullable=True)
    welding_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    welder_stamp: Mapped[str] = mapped_column(String(128), nullable=False, default="", index=True)
    welder_stamps_list: Mapped[list[str] | None] = mapped_column(ARRAY(String(64)), nullable=True)
    brigade_stamp: Mapped[str | None] = mapped_column(String(64), nullable=True)
    welding_materials: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    ambient_temp_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    weather_source: Mapped[str | None] = mapped_column(String(255), nullable=True)
    preheat_temp: Mapped[str | None] = mapped_column(String(32), nullable=True)
    responsible_person: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    welder_full_name: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    welder_cert_number: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    tech_card_number: Mapped[str] = mapped_column(String(128), nullable=False, default="")

    # 3. Primary VIK
    vik_result: Mapped[ControlResultEnum] = mapped_column(
        pg_enum(ControlResultEnum, "control_result_enum"),
        nullable=False,
        default=ControlResultEnum.NOT_CONDUCTED,
    )
    vik_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    vik_inspector: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    vik_report_number: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # 4. Primary NDT
    ndt_type: Mapped[NdtMethodEnum] = mapped_column(
        pg_enum(NdtMethodEnum, "ndt_method_enum"),
        nullable=False,
        default=NdtMethodEnum.NOT_REQUIRED,
    )
    ndt_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    ndt_result: Mapped[ControlResultEnum] = mapped_column(
        pg_enum(ControlResultEnum, "control_result_enum"),
        nullable=False,
        default=ControlResultEnum.NOT_CONDUCTED,
    )
    ndt_inspector: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    ndt_report_number: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # 5. Duplicate / Repeat NDT
    dup_ndt_type: Mapped[NdtMethodEnum] = mapped_column(
        pg_enum(NdtMethodEnum, "ndt_method_enum"),
        nullable=False,
        default=NdtMethodEnum.NOT_REQUIRED,
    )
    dup_ndt_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    dup_ndt_result: Mapped[ControlResultEnum] = mapped_column(
        pg_enum(ControlResultEnum, "control_result_enum"),
        nullable=False,
        default=ControlResultEnum.NOT_CONDUCTED,
    )
    dup_ndt_inspector: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    dup_ndt_report_number: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # 6. GOST 32569-2013 specific fields
    root_weld_control: Mapped[str | None] = mapped_column(String(255), nullable=True)
    steeloscopy_info: Mapped[str | None] = mapped_column(String(255), nullable=True)
    heat_treat_operator: Mapped[str | None] = mapped_column(String(255), nullable=True)
    heat_treat_diagram_number: Mapped[str | None] = mapped_column(String(128), nullable=True)
    hardness_test_info: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ferrite_phase_info: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # 7. Repair records (STO Gazprom cols 32-37, GOST 32569 col 15)
    repair_action: Mapped[str | None] = mapped_column(String(64), nullable=True)
    repair_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    repair_tech_card: Mapped[str | None] = mapped_column(String(128), nullable=True)
    repair_welder_stamp: Mapped[str | None] = mapped_column(String(128), nullable=True)
    repair_foreman: Mapped[str | None] = mapped_column(String(255), nullable=True)
    repair_length_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    repair_defect_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    repair_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # 8. Post-repair inspection (STO Gazprom cols 38-48)
    repair_vik_number: Mapped[str | None] = mapped_column(String(128), nullable=True)
    repair_vik_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    repair_vik_result: Mapped[ControlResultEnum | None] = mapped_column(
        pg_enum(ControlResultEnum, "control_result_enum"), nullable=True
    )
    repair_vik_inspector: Mapped[str | None] = mapped_column(String(255), nullable=True)

    repair_ndt_type: Mapped[NdtMethodEnum | None] = mapped_column(
        pg_enum(NdtMethodEnum, "ndt_method_enum"), nullable=True
    )
    repair_ndt_number: Mapped[str | None] = mapped_column(String(128), nullable=True)
    repair_ndt_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    repair_ndt_result: Mapped[ControlResultEnum | None] = mapped_column(
        pg_enum(ControlResultEnum, "control_result_enum"), nullable=True
    )
    repair_ndt_inspector: Mapped[str | None] = mapped_column(String(255), nullable=True)

    repair_dup_ndt_type: Mapped[NdtMethodEnum | None] = mapped_column(
        pg_enum(NdtMethodEnum, "ndt_method_enum"), nullable=True
    )
    repair_dup_ndt_number: Mapped[str | None] = mapped_column(String(128), nullable=True)
    repair_dup_ndt_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    repair_dup_ndt_result: Mapped[ControlResultEnum | None] = mapped_column(
        pg_enum(ControlResultEnum, "control_result_enum"), nullable=True
    )
    repair_dup_ndt_inspector: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # 9. Metadata & Row-Level Optimistic Locking
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    updated_by: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    line: Mapped[ProjectLine] = relationship(back_populates="joints")
