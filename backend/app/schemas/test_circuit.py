from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import (
    CircuitTestStatusEnum,
    ControlResultEnum,
    RecordStatusEnum,
    SriStatusEnum,
)


class CircuitLineSummaryOut(BaseModel):
    line_id: uuid.UUID
    unique_line_id: str
    line_number: str
    rd_code: str
    assigned_joints_count: int
    line_total_joints_count: int
    is_full_line: bool


class CircuitJointBriefOut(BaseModel):
    id: uuid.UUID
    line_id: uuid.UUID
    unique_line_id: str
    line_number: str
    rd_code: str
    joint_number: str
    diameter_mm: float
    diameter_inch: str
    nominal_d_inch: float
    equiv_diameter_inch: float
    wall_thickness: float
    welding_date: date | None = None
    is_welded: bool
    is_defective: bool
    vik_result: ControlResultEnum
    ndt_result: ControlResultEnum
    record_status: RecordStatusEnum
    version: int


class TestCircuitCreate(BaseModel):
    facility_id: uuid.UUID | None = None
    object_name: str | None = Field(default=None, max_length=255)
    name: str = Field(min_length=1, max_length=255)
    sri_name: str | None = Field(default=None, max_length=255)
    sri_status: SriStatusEnum = SriStatusEnum.IN_DEVELOPMENT
    planned_date: date | None = None
    act_number: str | None = Field(default=None, max_length=100)
    actual_test_date: date | None = None


class TestCircuitUpdate(BaseModel):
    version: int = Field(ge=1)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    sri_name: str | None = Field(default=None, max_length=255)
    sri_status: SriStatusEnum | None = None
    test_status: CircuitTestStatusEnum | None = None
    planned_date: date | None = None
    act_number: str | None = Field(default=None, max_length=100)
    actual_test_date: date | None = None
    force: bool = False


class TestCircuitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    facility_id: uuid.UUID
    facility_name: str = ""
    name: str
    sri_name: str | None = None
    sri_status: SriStatusEnum
    test_status: CircuitTestStatusEnum
    planned_date: date | None = None
    act_number: str | None = None
    actual_test_date: date | None = None
    record_status: RecordStatusEnum = RecordStatusEnum.DRAFT
    version: int = 1
    created_by_id: uuid.UUID | None = None
    updated_by_id: uuid.UUID | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    # Aggregated readiness metrics (joints, normative DN d-inch, Method A EDI, defects)
    total_joints: int = 0
    welded_joints: int = 0
    welding_joints_percent: float = 0.0
    total_d_inch: float = 0.0
    welded_d_inch: float = 0.0
    welding_d_inch_percent: float = 0.0
    total_edi: float = 0.0
    welded_edi: float = 0.0
    welding_edi_percent: float = 0.0
    defective_joints_count: int = 0
    lines_summary: list[CircuitLineSummaryOut] = Field(default_factory=list)


class TestCircuitDetailOut(TestCircuitOut):
    joints: list[CircuitJointBriefOut] = Field(default_factory=list)


class AssignLinesRequest(BaseModel):
    line_ids: list[uuid.UUID] = Field(min_length=1, max_length=500)
    overwrite_existing: bool = False


class AssignJointsRequest(BaseModel):
    joint_ids: list[uuid.UUID] = Field(min_length=1, max_length=2000)
    overwrite_existing: bool = True


class UnassignJointsRequest(BaseModel):
    joint_ids: list[uuid.UUID] = Field(min_length=1, max_length=2000)


class CircuitAssignmentResultOut(BaseModel):
    circuit: TestCircuitDetailOut
    affected_joints_count: int
