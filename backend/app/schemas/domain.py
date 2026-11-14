from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import (
    ControlResultEnum,
    ElementCombinationEnum,
    JointKindEnum,
    JointTypeEnum,
    LrvElementCategoryEnum,
    LrvStatusEnum,
    LrvUnitEnum,
    NdtMethodEnum,
    WeldingMaterialStatusEnum,
    WeldingMaterialTypeEnum,
    WeldingTypeEnum,
)

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    """Standard paginated list envelope returned by list endpoints."""

    items: list[T]
    total: int
    limit: int
    offset: int


class ValidationIssueOut(BaseModel):
    id: str
    category: str
    severity: str
    field: str | None = None
    title: str
    message: str


class JointValidationResultOut(BaseModel):
    is_valid_to_save: bool
    errors: list[ValidationIssueOut]
    warnings: list[ValidationIssueOut]


class FieldDiffOut(BaseModel):
    field: str
    client_value: Any
    server_value: Any


class OptimisticConflictOut(BaseModel):
    code: str = "OPTIMISTIC_LOCK_CONFLICT"
    message: str
    entity_type: str
    entity_id: str
    expected_version: int
    actual_server_version: int
    server_record: dict[str, Any]
    field_diffs: list[FieldDiffOut]


# ---------------------------------------------------------------------------
# Facilities & Weather
# ---------------------------------------------------------------------------
class FacilityRdCodeIn(BaseModel):
    code: str = Field(min_length=1, max_length=255)
    title: str = Field(default="", max_length=512)
    contours: list[str] = Field(default_factory=list)


class FacilityRdCodeOut(FacilityRdCodeIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    facility_id: uuid.UUID


class CustomWeatherStationIn(BaseModel):
    station_code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=255)
    region: str = Field(default="", max_length=255)
    latitude: float
    longitude: float
    elevation_m: float | None = None
    device_model: str | None = None
    verification_cert_number: str | None = None
    verification_valid_until: date | None = None
    is_verified: bool = False
    source: str = "custom"


class CustomWeatherStationOut(CustomWeatherStationIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    facility_id: uuid.UUID
    created_by_id: uuid.UUID | None = None
    created_at: datetime | None = None


class FacilityCreate(BaseModel):
    external_id: str | None = None
    name: str = Field(min_length=1, max_length=255)
    short_name: str = Field(default="", max_length=128)
    region: str = Field(default="", max_length=255)
    latitude: float | None = None
    longitude: float | None = None
    weather_station: str | None = None
    weather_station_id: str | None = None
    weather_station_distance_km: float | None = None
    weather_station_source: str | None = None
    rd_codes: list[FacilityRdCodeIn] = Field(default_factory=list)


class FacilityUpdate(BaseModel):
    version: int = Field(ge=1)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    short_name: str | None = None
    region: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    weather_station: str | None = None
    weather_station_id: str | None = None
    weather_station_distance_km: float | None = None
    weather_station_source: str | None = None
    rd_codes: list[FacilityRdCodeIn] | None = None


class FacilityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    external_id: str | None = None
    name: str
    short_name: str
    region: str
    latitude: float | None = None
    longitude: float | None = None
    weather_station: str | None = None
    weather_station_id: str | None = None
    weather_station_distance_km: float | None = None
    weather_station_source: str | None = None
    weather_last_check_status: str | None = None
    weather_last_checked_at: datetime | None = None
    weather_last_error_message: str | None = None
    version: int
    rd_codes: list[FacilityRdCodeOut] = Field(default_factory=list)
    custom_weather_stations: list[CustomWeatherStationOut] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None


# ---------------------------------------------------------------------------
# Project Lines (Line List)
# ---------------------------------------------------------------------------
class LineCompletionStatusOut(BaseModel):
    is_completed: bool
    total_joints: int
    welded_joints: int
    controlled_joints: int
    status_label: str
    ndt_status: str
    ndt_status_badge: str
    rk_required: int
    rk_controlled: int
    uzk_required: int
    uzk_controlled: int
    welder_ndt_deficits: list[str] = Field(default_factory=list)


class ProjectLineCreate(BaseModel):
    legacy_id: str | None = None
    facility_id: uuid.UUID
    object_name: str = Field(min_length=1, max_length=255)
    rd_code: str = Field(min_length=1, max_length=255)
    line_number: str = Field(min_length=1, max_length=128)
    unique_line_id: str | None = None
    line_name: str = ""
    product: str = ""
    test_contour: str = ""
    welding_ntd: str = "СТО Газпром 15-1.1-002-2023"
    control_ntd: str = "СТО Газпром 15-1.1-002-2023"
    quality_level: str = ""
    pipeline_category: str = ""
    working_pressure: str = ""
    working_temperature: str = ""
    rk_percent: float = Field(default=0.0, ge=0.0, le=100.0)
    uzk_percent: float = Field(default=0.0, ge=0.0, le=100.0)
    pvk_percent: float = Field(default=0.0, ge=0.0, le=100.0)
    manual_status: str | None = None
    test_date: date | None = None
    sort_order: int = 0


class ProjectLineUpdate(BaseModel):
    version: int = Field(ge=1)
    object_name: str | None = None
    rd_code: str | None = None
    line_number: str | None = None
    unique_line_id: str | None = None
    line_name: str | None = None
    product: str | None = None
    test_contour: str | None = None
    welding_ntd: str | None = None
    control_ntd: str | None = None
    quality_level: str | None = None
    pipeline_category: str | None = None
    working_pressure: str | None = None
    working_temperature: str | None = None
    rk_percent: float | None = Field(default=None, ge=0.0, le=100.0)
    uzk_percent: float | None = Field(default=None, ge=0.0, le=100.0)
    pvk_percent: float | None = Field(default=None, ge=0.0, le=100.0)
    manual_status: str | None = None
    test_date: date | None = None
    sort_order: int | None = None


class ProjectLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    legacy_id: str | None = None
    facility_id: uuid.UUID
    object_name: str
    rd_code: str
    line_number: str
    unique_line_id: str
    line_name: str
    product: str
    test_contour: str
    welding_ntd: str
    control_ntd: str
    quality_level: str
    pipeline_category: str
    working_pressure: str
    working_temperature: str
    rk_percent: float
    uzk_percent: float
    pvk_percent: float
    manual_status: str | None = None
    test_date: date | None = None
    sort_order: int
    version: int
    updated_by_id: uuid.UUID | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    computed_status: LineCompletionStatusOut | None = None


class LineNdtProgressOut(BaseModel):
    unique_line_id: str
    total_joints: int
    welded_joints: int
    inspected_rk_count: int
    inspected_uzk_count: int
    required_rk_pct: float
    required_uzk_pct: float
    actual_rk_pct: float
    actual_uzk_pct: float
    is_rk_fulfilled: bool
    is_uzk_fulfilled: bool


# ---------------------------------------------------------------------------
# LRV Catalog
# ---------------------------------------------------------------------------
class LrvItemCreate(BaseModel):
    legacy_id: str | None = None
    facility_id: uuid.UUID
    lrv_code: str = Field(min_length=1, max_length=128)
    rd_code: str = Field(min_length=1, max_length=255)
    object_name: str = Field(min_length=1, max_length=255)
    short_name: str = Field(min_length=1, max_length=255)
    category: LrvElementCategoryEnum | None = None
    connection_type: str | None = None
    material: str = ""
    ntd: str = ""
    manufacturer: str | None = None
    dn1: int | None = None
    diameter_mm: float = Field(default=0.0, ge=0.0)
    wall_thickness: float = Field(default=0.0, ge=0.0)
    dn2: int | None = None
    diameter_mm2: float | None = Field(default=None, ge=0.0)
    wall_thickness2: float | None = Field(default=None, ge=0.0)
    spec_qty: float = Field(default=0.0, ge=0.0)
    unit: LrvUnitEnum = LrvUnitEnum.PCS
    status: LrvStatusEnum = LrvStatusEnum.ACTIVE
    replacement_letter: str | None = None
    replacement_date: date | None = None
    sort_order: int = 0


class LrvItemUpdate(BaseModel):
    version: int = Field(ge=1)
    lrv_code: str | None = None
    rd_code: str | None = None
    object_name: str | None = None
    short_name: str | None = None
    category: LrvElementCategoryEnum | None = None
    connection_type: str | None = None
    material: str | None = None
    ntd: str | None = None
    manufacturer: str | None = None
    dn1: int | None = None
    diameter_mm: float | None = Field(default=None, ge=0.0)
    wall_thickness: float | None = Field(default=None, ge=0.0)
    dn2: int | None = None
    diameter_mm2: float | None = Field(default=None, ge=0.0)
    wall_thickness2: float | None = Field(default=None, ge=0.0)
    spec_qty: float | None = Field(default=None, ge=0.0)
    unit: LrvUnitEnum | None = None
    status: LrvStatusEnum | None = None
    replacement_letter: str | None = None
    replacement_date: date | None = None
    sort_order: int | None = None


class LrvSupersedeRequest(BaseModel):
    version: int = Field(ge=1)
    replacement_letter: str = Field(min_length=1, max_length=512)
    replacement_date: date | None = None
    new_item: LrvItemCreate | None = None


class LrvItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    legacy_id: str | None = None
    facility_id: uuid.UUID
    lrv_code: str
    rd_code: str
    object_name: str
    short_name: str
    category: LrvElementCategoryEnum | None = None
    connection_type: str | None = None
    material: str
    ntd: str
    manufacturer: str | None = None
    dn1: int | None = None
    diameter_mm: float
    wall_thickness: float
    dn2: int | None = None
    diameter_mm2: float | None = None
    wall_thickness2: float | None = None
    spec_qty: float
    unit: LrvUnitEnum
    status: LrvStatusEnum
    replacement_letter: str | None = None
    replacement_date: date | None = None
    sort_order: int
    version: int
    created_at: datetime | None = None
    updated_at: datetime | None = None


# ---------------------------------------------------------------------------
# Welding Tech (Welders, NAKS, WPS / TechCards, Materials, Inspectors)
# ---------------------------------------------------------------------------
class WelderNaksCertIn(BaseModel):
    welding_type: WeldingTypeEnum
    cert_number: str = Field(min_length=1, max_length=128)
    issue_date: date | None = None
    expiry_date: date | None = None
    admission_sheet_number: str | None = None
    admission_sheet_date: date | None = None
    min_diameter_mm: float | None = None
    max_diameter_mm: float | None = None
    min_wall_thickness_mm: float | None = None
    max_wall_thickness_mm: float | None = None
    steel_groups: list[str] | None = None


class WelderNaksCertOut(WelderNaksCertIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    welder_id: uuid.UUID


class WelderCreate(BaseModel):
    legacy_id: str | None = None
    stamp: str = Field(min_length=1, max_length=64)
    is_brigade: bool = False
    brigade_members: list[str] | None = None
    full_name: str = Field(min_length=1, max_length=255)
    cert_number: str = ""
    cert_issue_date: date | None = None
    cert_expiry_date: date | None = None
    attestation_area: str | None = None
    admission_sheet_number: str | None = None
    admission_sheet_date: date | None = None
    allowed_methods: list[str] = Field(default_factory=list)
    crew_foreman: str = ""
    steel_groups: list[str] | None = None
    min_diameter_mm: float | None = None
    max_diameter_mm: float | None = None
    min_wall_thickness_mm: float | None = None
    max_wall_thickness_mm: float | None = None
    sort_order: int = 0
    naks_certs: list[WelderNaksCertIn] = Field(default_factory=list)


class WelderUpdate(BaseModel):
    version: int = Field(ge=1)
    stamp: str | None = None
    is_brigade: bool | None = None
    brigade_members: list[str] | None = None
    full_name: str | None = None
    cert_number: str | None = None
    cert_issue_date: date | None = None
    cert_expiry_date: date | None = None
    attestation_area: str | None = None
    admission_sheet_number: str | None = None
    admission_sheet_date: date | None = None
    allowed_methods: list[str] | None = None
    crew_foreman: str | None = None
    steel_groups: list[str] | None = None
    min_diameter_mm: float | None = None
    max_diameter_mm: float | None = None
    min_wall_thickness_mm: float | None = None
    max_wall_thickness_mm: float | None = None
    sort_order: int | None = None
    naks_certs: list[WelderNaksCertIn] | None = None


class WelderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    legacy_id: str | None = None
    stamp: str
    is_brigade: bool
    brigade_members: list[str] | None = None
    full_name: str
    cert_number: str
    cert_issue_date: date | None = None
    cert_expiry_date: date | None = None
    attestation_area: str | None = None
    admission_sheet_number: str | None = None
    admission_sheet_date: date | None = None
    allowed_methods: list[str] = Field(default_factory=list)
    crew_foreman: str
    steel_groups: list[str] | None = None
    min_diameter_mm: float | None = None
    max_diameter_mm: float | None = None
    min_wall_thickness_mm: float | None = None
    max_wall_thickness_mm: float | None = None
    sort_order: int
    version: int
    naks_certs: list[WelderNaksCertOut] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class WelderNdtQuotaOut(BaseModel):
    stamp: str
    full_name: str
    total_welded: int
    inspected_count: int
    passed_count: int
    defect_count: int
    actual_ndt_pct: float
    required_ndt_pct: float
    is_compliant: bool
    has_minimum_joint_inspected: bool
    penalty_required_joints: int
    status: str
    details: str


class PreheatRuleIn(BaseModel):
    ambient_min_c: float
    ambient_max_c: float
    min_preheat_temp_c: float
    condition_label: str = Field(min_length=1, max_length=255)


class PreheatRuleOut(PreheatRuleIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    tech_card_id: uuid.UUID


class TechCardCreate(BaseModel):
    legacy_id: str | None = None
    number: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=1, max_length=512)
    welding_type: WeldingTypeEnum
    joint_kind: JointKindEnum
    element_combination: ElementCombinationEnum
    ntd: str = Field(min_length=1, max_length=255)
    steel_group: str = ""
    min_diameter_mm: float = Field(default=0.0, ge=0.0)
    max_diameter_mm: float = Field(default=9999.0, ge=0.0)
    min_wall_thickness_mm: float = Field(default=0.0, ge=0.0)
    max_wall_thickness_mm: float = Field(default=999.0, ge=0.0)
    recommended_materials: str = ""
    sort_order: int = 0
    preheat_rules: list[PreheatRuleIn] = Field(default_factory=list)


class TechCardUpdate(BaseModel):
    version: int = Field(ge=1)
    number: str | None = None
    title: str | None = None
    welding_type: WeldingTypeEnum | None = None
    joint_kind: JointKindEnum | None = None
    element_combination: ElementCombinationEnum | None = None
    ntd: str | None = None
    steel_group: str | None = None
    min_diameter_mm: float | None = Field(default=None, ge=0.0)
    max_diameter_mm: float | None = Field(default=None, ge=0.0)
    min_wall_thickness_mm: float | None = Field(default=None, ge=0.0)
    max_wall_thickness_mm: float | None = Field(default=None, ge=0.0)
    recommended_materials: str | None = None
    sort_order: int | None = None
    preheat_rules: list[PreheatRuleIn] | None = None


class TechCardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    legacy_id: str | None = None
    number: str
    title: str
    welding_type: WeldingTypeEnum
    joint_kind: JointKindEnum
    element_combination: ElementCombinationEnum
    ntd: str
    steel_group: str
    min_diameter_mm: float
    max_diameter_mm: float
    min_wall_thickness_mm: float
    max_wall_thickness_mm: float
    recommended_materials: str
    sort_order: int
    version: int
    preheat_rules: list[PreheatRuleOut] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class WeldingMaterialCreate(BaseModel):
    legacy_id: str | None = None
    brand_and_diameter: str = Field(min_length=1, max_length=255)
    material_type: WeldingMaterialTypeEnum
    welding_method: WeldingTypeEnum
    batch_number: str = ""
    certificate_number: str = ""
    incoming_control_act: str = ""
    incoming_control_date: date | None = None
    status: WeldingMaterialStatusEnum = WeldingMaterialStatusEnum.ADMITTED
    sort_order: int = 0


class WeldingMaterialUpdate(BaseModel):
    version: int = Field(ge=1)
    brand_and_diameter: str | None = None
    material_type: WeldingMaterialTypeEnum | None = None
    welding_method: WeldingTypeEnum | None = None
    batch_number: str | None = None
    certificate_number: str | None = None
    incoming_control_act: str | None = None
    incoming_control_date: date | None = None
    status: WeldingMaterialStatusEnum | None = None
    sort_order: int | None = None


class WeldingMaterialOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    legacy_id: str | None = None
    brand_and_diameter: str
    material_type: WeldingMaterialTypeEnum
    welding_method: WeldingTypeEnum
    batch_number: str
    certificate_number: str
    incoming_control_act: str
    incoming_control_date: date | None = None
    status: WeldingMaterialStatusEnum
    sort_order: int
    version: int
    created_at: datetime | None = None
    updated_at: datetime | None = None


class InspectorCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    cert_level: str = ""
    lab_name: str = ""


class InspectorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    full_name: str
    cert_level: str
    lab_name: str
    created_at: datetime | None = None


# ---------------------------------------------------------------------------
# Weld Joints (Normalized, Row-Level OCC + Domain Validation + Field RBAC)
# ---------------------------------------------------------------------------
class WeldJointCreate(BaseModel):
    legacy_id: str | None = None
    line_id: uuid.UUID
    facility_id: uuid.UUID | None = None
    lrv1_item_id: uuid.UUID | None = None
    lrv2_item_id: uuid.UUID | None = None
    tech_card_id: uuid.UUID | None = None

    object_name: str = Field(default="", max_length=255)
    rd_code: str = Field(default="", max_length=255)
    contour: str = ""
    line_number: str = ""
    unique_line_id: str = ""

    joint_number: str = Field(min_length=1, max_length=64)
    is_supplementary: bool = False
    joint_kind: JointKindEnum = JointKindEnum.BUTT
    joint_type: JointTypeEnum = JointTypeEnum.MOUNTING
    diameter_mm: float = Field(default=0.0, ge=0.0)
    diameter_inch: str = ""
    equiv_diameter_inch: float | None = None
    wall_thickness: float = Field(default=0.0, ge=0.0)

    lrv1_code: str = ""
    elem1_name: str = ""
    elem1_material: str = ""
    elem1_ntd: str = ""
    elem1_diameter_mm: float | None = None
    elem1_wall_thickness: float | None = None
    elem1_factory_number: str | None = None
    elem1_manufacturer: str | None = None
    elem1_length: str | None = None
    elem1_cert_number: str | None = None
    elem1_heat_number: str | None = None
    elem1_batch_number: str | None = None

    lrv2_code: str = ""
    elem2_name: str = ""
    elem2_material: str = ""
    elem2_ntd: str = ""
    elem2_diameter_mm: float | None = None
    elem2_wall_thickness: float | None = None
    elem2_factory_number: str | None = None
    elem2_manufacturer: str | None = None
    elem2_length: str | None = None
    elem2_cert_number: str | None = None
    elem2_heat_number: str | None = None
    elem2_batch_number: str | None = None

    welding_type: str = ""
    gost_joint_type: str | None = None
    welding_position: str | None = None
    welding_date: date | None = None
    welder_stamp: str = ""
    welder_stamps_list: list[str] | None = None
    brigade_stamp: str | None = None
    welding_materials: str = ""
    ambient_temp_c: float | None = None
    weather_source: str | None = None
    preheat_temp: str | None = None
    responsible_person: str = ""
    welder_full_name: str = ""
    welder_cert_number: str = ""
    tech_card_number: str = ""

    vik_result: ControlResultEnum = ControlResultEnum.NOT_CONDUCTED
    vik_date: date | None = None
    vik_inspector: str = ""
    vik_report_number: str | None = None

    ndt_type: NdtMethodEnum = NdtMethodEnum.NOT_REQUIRED
    ndt_date: date | None = None
    ndt_result: ControlResultEnum = ControlResultEnum.NOT_CONDUCTED
    ndt_inspector: str = ""
    ndt_report_number: str | None = None

    dup_ndt_type: NdtMethodEnum = NdtMethodEnum.NOT_REQUIRED
    dup_ndt_date: date | None = None
    dup_ndt_result: ControlResultEnum = ControlResultEnum.NOT_CONDUCTED
    dup_ndt_inspector: str = ""
    dup_ndt_report_number: str | None = None

    root_weld_control: str | None = None
    steeloscopy_info: str | None = None
    heat_treat_operator: str | None = None
    heat_treat_diagram_number: str | None = None
    hardness_test_info: str | None = None
    ferrite_phase_info: str | None = None

    repair_action: str | None = None
    repair_date: date | None = None
    repair_tech_card: str | None = None
    repair_welder_stamp: str | None = None
    repair_foreman: str | None = None
    repair_length_mm: float | None = None
    repair_defect_type: str | None = None
    repair_count: int = Field(default=0, ge=0)

    repair_vik_number: str | None = None
    repair_vik_date: date | None = None
    repair_vik_result: ControlResultEnum | None = None
    repair_vik_inspector: str | None = None

    repair_ndt_type: NdtMethodEnum | None = None
    repair_ndt_number: str | None = None
    repair_ndt_date: date | None = None
    repair_ndt_result: ControlResultEnum | None = None
    repair_ndt_inspector: str | None = None

    repair_dup_ndt_type: NdtMethodEnum | None = None
    repair_dup_ndt_number: str | None = None
    repair_dup_ndt_date: date | None = None
    repair_dup_ndt_result: ControlResultEnum | None = None
    repair_dup_ndt_inspector: str | None = None

    sort_order: int = 0


class WeldJointUpdate(BaseModel):
    version: int = Field(ge=1)
    facility_id: uuid.UUID | None = None
    lrv1_item_id: uuid.UUID | None = None
    lrv2_item_id: uuid.UUID | None = None
    tech_card_id: uuid.UUID | None = None

    object_name: str | None = None
    rd_code: str | None = None
    contour: str | None = None
    line_number: str | None = None
    unique_line_id: str | None = None

    joint_number: str | None = None
    is_supplementary: bool | None = None
    joint_kind: JointKindEnum | None = None
    joint_type: JointTypeEnum | None = None
    diameter_mm: float | None = Field(default=None, ge=0.0)
    diameter_inch: str | None = None
    equiv_diameter_inch: float | None = None
    wall_thickness: float | None = Field(default=None, ge=0.0)

    lrv1_code: str | None = None
    elem1_name: str | None = None
    elem1_material: str | None = None
    elem1_ntd: str | None = None
    elem1_diameter_mm: float | None = None
    elem1_wall_thickness: float | None = None
    elem1_factory_number: str | None = None
    elem1_manufacturer: str | None = None
    elem1_length: str | None = None
    elem1_cert_number: str | None = None
    elem1_heat_number: str | None = None
    elem1_batch_number: str | None = None

    lrv2_code: str | None = None
    elem2_name: str | None = None
    elem2_material: str | None = None
    elem2_ntd: str | None = None
    elem2_diameter_mm: float | None = None
    elem2_wall_thickness: float | None = None
    elem2_factory_number: str | None = None
    elem2_manufacturer: str | None = None
    elem2_length: str | None = None
    elem2_cert_number: str | None = None
    elem2_heat_number: str | None = None
    elem2_batch_number: str | None = None

    welding_type: str | None = None
    gost_joint_type: str | None = None
    welding_position: str | None = None
    welding_date: date | None = None
    welder_stamp: str | None = None
    welder_stamps_list: list[str] | None = None
    brigade_stamp: str | None = None
    welding_materials: str | None = None
    ambient_temp_c: float | None = None
    weather_source: str | None = None
    preheat_temp: str | None = None
    responsible_person: str | None = None
    welder_full_name: str | None = None
    welder_cert_number: str | None = None
    tech_card_number: str | None = None

    vik_result: ControlResultEnum | None = None
    vik_date: date | None = None
    vik_inspector: str | None = None
    vik_report_number: str | None = None

    ndt_type: NdtMethodEnum | None = None
    ndt_date: date | None = None
    ndt_result: ControlResultEnum | None = None
    ndt_inspector: str | None = None
    ndt_report_number: str | None = None

    dup_ndt_type: NdtMethodEnum | None = None
    dup_ndt_date: date | None = None
    dup_ndt_result: ControlResultEnum | None = None
    dup_ndt_inspector: str | None = None
    dup_ndt_report_number: str | None = None

    root_weld_control: str | None = None
    steeloscopy_info: str | None = None
    heat_treat_operator: str | None = None
    heat_treat_diagram_number: str | None = None
    hardness_test_info: str | None = None
    ferrite_phase_info: str | None = None

    repair_action: str | None = None
    repair_date: date | None = None
    repair_tech_card: str | None = None
    repair_welder_stamp: str | None = None
    repair_foreman: str | None = None
    repair_length_mm: float | None = None
    repair_defect_type: str | None = None
    repair_count: int | None = Field(default=None, ge=0)

    repair_vik_number: str | None = None
    repair_vik_date: date | None = None
    repair_vik_result: ControlResultEnum | None = None
    repair_vik_inspector: str | None = None

    repair_ndt_type: NdtMethodEnum | None = None
    repair_ndt_number: str | None = None
    repair_ndt_date: date | None = None
    repair_ndt_result: ControlResultEnum | None = None
    repair_ndt_inspector: str | None = None

    repair_dup_ndt_type: NdtMethodEnum | None = None
    repair_dup_ndt_number: str | None = None
    repair_dup_ndt_date: date | None = None
    repair_dup_ndt_result: ControlResultEnum | None = None
    repair_dup_ndt_inspector: str | None = None

    sort_order: int | None = None


class WeldJointBulkUpdateItem(WeldJointUpdate):
    id: uuid.UUID


class WeldJointBulkUpdateRequest(BaseModel):
    items: list[WeldJointBulkUpdateItem] = Field(min_length=1, max_length=200)


class WeldJointValidateRequest(BaseModel):
    joint_id: uuid.UUID | None = None
    joint: WeldJointCreate


class WeldJointOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    legacy_id: str | None = None
    line_id: uuid.UUID
    facility_id: uuid.UUID | None = None
    lrv1_item_id: uuid.UUID | None = None
    lrv2_item_id: uuid.UUID | None = None
    tech_card_id: uuid.UUID | None = None
    updated_by_id: uuid.UUID | None = None

    object_name: str
    rd_code: str
    contour: str
    line_number: str
    unique_line_id: str

    joint_number: str
    is_supplementary: bool
    joint_kind: JointKindEnum
    joint_type: JointTypeEnum
    diameter_mm: float
    diameter_inch: str
    equiv_diameter_inch: float | None = None
    wall_thickness: float

    lrv1_code: str
    elem1_name: str
    elem1_material: str
    elem1_ntd: str
    elem1_diameter_mm: float | None = None
    elem1_wall_thickness: float | None = None
    elem1_factory_number: str | None = None
    elem1_manufacturer: str | None = None
    elem1_length: str | None = None
    elem1_cert_number: str | None = None
    elem1_heat_number: str | None = None
    elem1_batch_number: str | None = None

    lrv2_code: str
    elem2_name: str
    elem2_material: str
    elem2_ntd: str
    elem2_diameter_mm: float | None = None
    elem2_wall_thickness: float | None = None
    elem2_factory_number: str | None = None
    elem2_manufacturer: str | None = None
    elem2_length: str | None = None
    elem2_cert_number: str | None = None
    elem2_heat_number: str | None = None
    elem2_batch_number: str | None = None

    welding_type: str
    gost_joint_type: str | None = None
    welding_position: str | None = None
    welding_date: date | None = None
    welder_stamp: str
    welder_stamps_list: list[str] | None = None
    brigade_stamp: str | None = None
    welding_materials: str
    ambient_temp_c: float | None = None
    weather_source: str | None = None
    preheat_temp: str | None = None
    responsible_person: str
    welder_full_name: str
    welder_cert_number: str
    tech_card_number: str

    vik_result: ControlResultEnum
    vik_date: date | None = None
    vik_inspector: str
    vik_report_number: str | None = None

    ndt_type: NdtMethodEnum
    ndt_date: date | None = None
    ndt_result: ControlResultEnum
    ndt_inspector: str
    ndt_report_number: str | None = None

    dup_ndt_type: NdtMethodEnum
    dup_ndt_date: date | None = None
    dup_ndt_result: ControlResultEnum
    dup_ndt_inspector: str
    dup_ndt_report_number: str | None = None

    root_weld_control: str | None = None
    steeloscopy_info: str | None = None
    heat_treat_operator: str | None = None
    heat_treat_diagram_number: str | None = None
    hardness_test_info: str | None = None
    ferrite_phase_info: str | None = None

    repair_action: str | None = None
    repair_date: date | None = None
    repair_tech_card: str | None = None
    repair_welder_stamp: str | None = None
    repair_foreman: str | None = None
    repair_length_mm: float | None = None
    repair_defect_type: str | None = None
    repair_count: int

    repair_vik_number: str | None = None
    repair_vik_date: date | None = None
    repair_vik_result: ControlResultEnum | None = None
    repair_vik_inspector: str | None = None

    repair_ndt_type: NdtMethodEnum | None = None
    repair_ndt_number: str | None = None
    repair_ndt_date: date | None = None
    repair_ndt_result: ControlResultEnum | None = None
    repair_ndt_inspector: str | None = None

    repair_dup_ndt_type: NdtMethodEnum | None = None
    repair_dup_ndt_number: str | None = None
    repair_dup_ndt_date: date | None = None
    repair_dup_ndt_result: ControlResultEnum | None = None
    repair_dup_ndt_inspector: str | None = None

    sort_order: int
    version: int
    updated_by: str
    created_at: datetime | None = None
    updated_at: datetime | None = None
    warnings: list[ValidationIssueOut] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Readiness, Journals, Templates
# ---------------------------------------------------------------------------
class ReadinessRowOut(BaseModel):
    group_key: str
    sub_label: str
    total_joints: int
    supplementary_joints: int
    welded_count: int
    vik_passed_count: int
    ndt_passed_count: int
    dup_ndt_passed_count: int
    repair_count: int
    fully_completed_count: int
    welding_pct: int
    readiness_pct: int
    total_equiv_diameter_mm: float
    total_nominal_inches: float
    total_equiv_inches: float
    welded_equiv_inches: float
    equiv_welding_pct: int


class JournalCompletenessOut(BaseModel):
    is_fully_complete: bool
    total_joints: int
    joints_with_missing_data_count: int
    missing_summary: dict[str, int]
    missing_items: list[dict[str, Any]]


class JournalPreviewRowOut(BaseModel):
    joint_id: str
    joint_number: str
    line_number: str
    cells: list[str]
    is_fully_accepted: bool
    is_in_repair: bool


class JournalPreviewResponse(BaseModel):
    standard: str
    total: int
    rows: list[JournalPreviewRowOut]
    completeness: JournalCompletenessOut


class ColumnTemplateCreate(BaseModel):
    id: str | None = None
    name: str = Field(min_length=1, max_length=255)
    description: str = ""
    is_system: bool = False
    column_order: list[str] = Field(default_factory=list)
    visible_columns: list[str] = Field(default_factory=list)
    custom_widths: dict[str, Any] | None = None
    is_active_default: bool = False


class ColumnTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    column_order: list[str] | None = None
    visible_columns: list[str] | None = None
    custom_widths: dict[str, Any] | None = None
    is_active_default: bool | None = None


class ColumnTemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    description: str
    is_system: bool
    column_order: list[str]
    visible_columns: list[str]
    custom_widths: dict[str, Any] | None = None
    is_active_default: bool
    owner_id: uuid.UUID | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class NdtLabRequestCreate(BaseModel):
    id: uuid.UUID | None = None
    request_number: str = Field(min_length=1, max_length=64)
    created_at: datetime | None = None
    created_date: str = Field(min_length=1, max_length=10)
    created_by: str = Field(min_length=1, max_length=255)
    object_name: str = Field(min_length=1, max_length=255)
    rd_code: str = Field(min_length=1, max_length=255)
    line_number: str = Field(default="", max_length=128)
    unique_line_id: str = Field(min_length=1, max_length=255)
    contour: str = Field(default="", max_length=255)
    control_stage: str = Field(default="Первичный ВИК и НК", max_length=128)
    requested_method: str = Field(default="РК", max_length=64)
    joint_ids: list[str] = Field(default_factory=list)
    status: str = Field(default="Подана ПТО", max_length=64)
    accepted_at: datetime | None = None
    accepted_by: str | None = None
    completed_at: datetime | None = None
    notes: str | None = None


class NdtLabRequestUpdate(BaseModel):
    request_number: str | None = None
    created_date: str | None = None
    created_by: str | None = None
    object_name: str | None = None
    rd_code: str | None = None
    line_number: str | None = None
    unique_line_id: str | None = None
    contour: str | None = None
    control_stage: str | None = None
    requested_method: str | None = None
    joint_ids: list[str] | None = None
    status: str | None = None
    accepted_at: datetime | None = None
    accepted_by: str | None = None
    completed_at: datetime | None = None
    notes: str | None = None


class NdtLabRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    request_number: str
    created_at: datetime
    created_date: str
    created_by: str
    object_name: str
    rd_code: str
    line_number: str
    unique_line_id: str
    contour: str
    control_stage: str
    requested_method: str
    joint_ids: list[str]
    status: str
    accepted_at: datetime | None = None
    accepted_by: str | None = None
    completed_at: datetime | None = None
    notes: str | None = None
    version: int
    updated_at: datetime

