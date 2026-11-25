from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import ExecutiveDocStatusEnum

PreStageStatus = Literal["SIGNED", "NOT_SIGNED"]
PhysicsStatus = Literal["ACCEPTED", "NOT_ACCEPTED"]
GeodesyStatus = Literal["SIGNED", "NOT_SIGNED", "NOT_REQUIRED"]


class ExecutiveDocUpsert(BaseModel):
    """Payload for creating or updating an ExecutiveDoc record for a pipeline line."""

    priority: int | None = Field(default=None, ge=1, le=99)
    id_status: ExecutiveDocStatusEnum | None = None
    work_producer: str | None = Field(default=None, max_length=255)
    pto_engineer: str | None = Field(default=None, max_length=255)
    pre_stage_status: PreStageStatus | None = None
    physics_status: PhysicsStatus | None = None
    geodesy_status: GeodesyStatus | None = None
    note_text: str | None = Field(default=None, max_length=4000)
    version: int | None = Field(default=None, ge=1)

    @field_validator("work_producer", "pto_engineer", mode="before")
    @classmethod
    def _clean_short_str(cls, val: object) -> str | None:
        if val is None:
            return None
        text = str(val).strip()
        return text if text else None

    @field_validator("note_text", mode="before")
    @classmethod
    def _clean_note(cls, val: object) -> str | None:
        if val is None:
            return None
        text = str(val).strip()
        return text if text else None


class ExecutiveDocOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    line_id: uuid.UUID
    priority: int | None = None
    id_status: ExecutiveDocStatusEnum
    work_producer: str | None = None
    pto_engineer: str | None = None
    pre_stage_status: PreStageStatus
    physics_status: PhysicsStatus
    geodesy_status: GeodesyStatus
    note_text: str | None = None
    note_updated_at: datetime | None = None
    version: int
    updated_by_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime
