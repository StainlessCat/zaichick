from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import RoleEnum


class RolePermissionsSchema(BaseModel):
    role: RoleEnum
    label: str
    description: str
    can_manage_users: bool
    can_edit_welding_tech: bool
    can_edit_line_list: bool
    can_edit_lrv_catalog: bool
    can_create_or_delete_joints: bool
    can_edit_prep_and_welding_fields: bool
    can_edit_ndt_fields: bool
    can_export_documents: bool
    can_view_audit_logs: bool


class UserPublicSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    login: str
    full_name: str
    role: RoleEnum
    department: str
    position_title: str
    is_active: bool
    must_change_password: bool
    version: int
    created_at: datetime
    updated_at: datetime


class LoginRequest(BaseModel):
    login: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=256)

    @field_validator("login")
    @classmethod
    def strip_login(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Логин не может быть пустым.")
        return cleaned


class SessionResponse(BaseModel):
    user: UserPublicSchema
    permissions: RolePermissionsSchema
    expires_at: datetime | None = None


class BearerTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    user: UserPublicSchema
    permissions: RolePermissionsSchema


class CreateUserRequest(BaseModel):
    login: str = Field(..., min_length=2, max_length=64)
    password: str = Field(..., min_length=6, max_length=256)
    full_name: str = Field(..., min_length=2, max_length=255)
    role: RoleEnum  # Explicit assignment by ADMIN; never defaults to PTO
    department: str = Field(default="", max_length=255)
    position_title: str = Field(default="", max_length=255)
    must_change_password: bool = True

    @field_validator("login", "full_name")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Поле не может состоять только из пробелов.")
        return cleaned


class UpdateUserRequest(BaseModel):
    version: int = Field(..., ge=1)
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    role: RoleEnum | None = None
    department: str | None = Field(default=None, max_length=255)
    position_title: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None
    must_change_password: bool | None = None
    new_password: str | None = Field(default=None, min_length=6, max_length=256)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=256)
    new_password: str = Field(..., min_length=6, max_length=256)
