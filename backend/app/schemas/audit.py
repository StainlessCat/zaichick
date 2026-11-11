from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, field_validator


class AuditLogItemSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    timestamp: datetime
    user_id: uuid.UUID | None
    user_login: str
    user_full_name: str
    user_role: str
    action: str
    entity_type: str
    entity_id: str
    old_data: dict[str, Any] | None
    new_data: dict[str, Any] | None
    ip_address: str | None
    joint_number: str | None
    unique_line_id: str | None
    rd_code: str | None
    summary: str | None

    @field_validator("ip_address", mode="before")
    @classmethod
    def coerce_inet_to_str(cls, value: Any) -> str | None:
        return str(value) if value is not None else None


class AuditLogPageSchema(BaseModel):
    items: list[AuditLogItemSchema]
    total: int
    page: int
    page_size: int
