from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from typing import Any

from fastapi import HTTPException, status
from pydantic import BaseModel

from app.services.domain_validation import JointValidationSummary, ValidationIssue


def _serialize_value(val: Any) -> Any:
    if isinstance(val, enum.Enum):
        return val.value
    if isinstance(val, (uuid.UUID, date, datetime)):
        return str(val)
    if isinstance(val, list):
        return [_serialize_value(v) for v in val]
    if isinstance(val, dict):
        return {k: _serialize_value(v) for k, v in val.items()}
    return val


def orm_snapshot(obj: Any, schema_cls: type[BaseModel] | None = None) -> dict[str, Any]:
    """Produce a JSON-serializable snapshot of a SQLAlchemy entity (excluding relationships unless schema_cls specified)."""
    if schema_cls is not None:
        dumped = schema_cls.model_validate(obj).model_dump(mode="json")
        dumped.pop("warnings", None)
        dumped.pop("computed_status", None)
        return dumped

    data: dict[str, Any] = {}
    mapper = getattr(obj.__class__, "__mapper__", None)
    if mapper is None:
        return {}
    for col in mapper.column_attrs:
        data[col.key] = _serialize_value(getattr(obj, col.key, None))
    return data


def compute_field_diffs(
    patch_data: dict[str, Any],
    server_snapshot: dict[str, Any],
) -> list[dict[str, Any]]:
    """Compare incoming client patch values against current server snapshot."""
    diffs: list[dict[str, Any]] = []
    for key, client_val in patch_data.items():
        if key in ("version", "id", "updated_at", "created_at", "updated_by", "updated_by_id"):
            continue
        ser_client = _serialize_value(client_val)
        ser_server = server_snapshot.get(key)
        if ser_client != ser_server:
            diffs.append(
                {
                    "field": key,
                    "client_value": ser_client,
                    "server_value": ser_server,
                }
            )
    return diffs


def enforce_optimistic_lock(
    *,
    entity_type: str,
    entity_obj: Any,
    expected_version: int,
    patch_data: dict[str, Any],
    schema_cls: type[BaseModel] | None = None,
) -> None:
    """Verify row-level version matches; otherwise raise 409 Conflict with diff payload."""
    actual_version = int(getattr(entity_obj, "version", 1))
    if expected_version == actual_version:
        return

    snapshot = orm_snapshot(entity_obj, schema_cls=schema_cls)
    diffs = compute_field_diffs(patch_data, snapshot)
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": "OPTIMISTIC_LOCK_CONFLICT",
            "message": (
                f"Запись {entity_type} была изменена другим пользователем "
                f"(ваша версия: {expected_version}, текущая версия на сервере: {actual_version})."
            ),
            "entity_type": entity_type,
            "entity_id": str(getattr(entity_obj, "id", "")),
            "expected_version": expected_version,
            "actual_server_version": actual_version,
            "server_record": snapshot,
            "field_diffs": diffs,
        },
    )


def apply_patch_fields(obj: Any, patch_data: dict[str, Any], *, skip: set[str] | None = None) -> None:
    """Apply partial update fields onto an ORM object and increment version safely."""
    ignored = {"id", "version", "created_at", "updated_at", "updated_by_id", "updated_by"}
    if skip:
        ignored |= skip
    for field_name, value in patch_data.items():
        if field_name in ignored:
            continue
        if hasattr(obj, field_name):
            setattr(obj, field_name, value)
    obj.version = int(getattr(obj, "version", 1)) + 1


def raise_duplicate_error(code: str, message: str, *, details: dict[str, Any] | None = None) -> None:
    payload: dict[str, Any] = {"code": code, "message": message}
    if details:
        payload.update(details)
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=payload)


def raise_referential_integrity_error(
    entity_type: str,
    message: str,
    *,
    references_count: int,
) -> None:
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": "REFERENTIAL_INTEGRITY_ERROR",
            "entity_type": entity_type,
            "references_count": references_count,
            "message": message,
        },
    )


def issue_to_dict(issue: ValidationIssue) -> dict[str, Any]:
    return {
        "id": issue.id,
        "category": issue.category,
        "severity": issue.severity,
        "field": issue.field,
        "title": issue.title,
        "message": issue.message,
    }


def raise_domain_validation_error(summary: JointValidationSummary) -> None:
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail={
            "code": "DOMAIN_VALIDATION_FAILED",
            "message": "Сохранение заблокировано: обнаружены критические ошибки доменной валидации.",
            "errors": [issue_to_dict(i) for i in summary.errors],
            "warnings": [issue_to_dict(i) for i in summary.warnings],
        },
    )
