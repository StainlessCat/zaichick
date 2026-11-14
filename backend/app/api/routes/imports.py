from __future__ import annotations

import csv
import io
from typing import Any

from fastapi import APIRouter, Body, Depends, File, HTTPException, Request, UploadFile, status
from openpyxl import load_workbook
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, get_current_user, get_db_session, require_roles
from app.models.enums import RoleEnum
from app.models.user import User
from app.services.audit_service import record_audit_log
from app.services.event_bus import publish_domain_event
from app.services.sqlite_migrator import (
    restore_backup_payload_to_postgres,
    zero_reset_postgres,
)

router = APIRouter(prefix="/api/imports", tags=["imports"])

_MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB


def _normalize_cell(val: Any) -> Any:
    if val is None:
        return ""
    if hasattr(val, "strftime"):
        return val.strftime("%Y-%m-%d")
    return val


def parse_spreadsheet_bytes(raw: bytes, filename: str) -> list[dict[str, Any]]:
    """Safely parse .xlsx (via openpyxl read-only) or .csv into row dicts."""
    lower = (filename or "").strip().lower()
    if lower.endswith(".xls") and not lower.endswith(".xlsx"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Устаревший бинарный формат .xls не поддерживается. Пересохраните файл в .xlsx или .csv.",
        )

    if lower.endswith(".csv"):
        text = raw.decode("utf-8-sig", errors="replace")
        sample = text[:4096]
        delimiter = ";" if sample.count(";") >= sample.count(",") else ","
        reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
        rows: list[dict[str, Any]] = []
        for r in reader:
            cleaned = {str(k).strip(): (v if v is not None else "") for k, v in r.items() if k is not None}
            if any(str(v).strip() != "" for v in cleaned.values()):
                rows.append(cleaned)
        return rows

    try:
        wb = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Не удалось прочитать файл Excel (.xlsx): {exc}",
        ) from exc

    try:
        if not wb.sheetnames:
            return []
        ws = wb[wb.sheetnames[0]]
        iterator = ws.iter_rows(values_only=True)
        header_row = next(iterator, None)
        if not header_row:
            return []
        headers = [
            str(cell).strip() if cell is not None and str(cell).strip() else f"Column_{idx + 1}"
            for idx, cell in enumerate(header_row)
        ]
        result: list[dict[str, Any]] = []
        for row_vals in iterator:
            row_dict = {
                headers[idx]: _normalize_cell(row_vals[idx]) if idx < len(row_vals) else ""
                for idx in range(len(headers))
            }
            if any(str(v).strip() != "" for v in row_dict.values()):
                result.append(row_dict)
        return result
    finally:
        wb.close()


async def _read_file_with_size_limit(file: UploadFile, max_bytes: int = _MAX_UPLOAD_BYTES) -> bytes:
    """
    Safely read an uploaded file in 64 KB chunks, aborting early if max_bytes is exceeded.
    Prevents memory exhaustion (OOM DoS) from reading unbounded file payloads into RAM.
    """
    if file.size is not None and file.size > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"Размер файла превышает допустимый лимит {max_bytes // (1024 * 1024)} МБ.",
        )

    chunks: list[bytes] = []
    total_bytes = 0
    chunk_size = 64 * 1024  # 64 KB chunks

    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        total_bytes += len(chunk)
        if total_bytes > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"Размер файла превышает допустимый лимит {max_bytes // (1024 * 1024)} МБ.",
            )
        chunks.append(chunk)

    return b"".join(chunks)


@router.post("/parse-spreadsheet")
async def parse_uploaded_spreadsheet(
    file: UploadFile = File(...),
    _current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Server-side Excel/CSV parser replacing vulnerable client-side SheetJS (xlsx@0.18.5)."""
    raw = await _read_file_with_size_limit(file, _MAX_UPLOAD_BYTES)
    rows = parse_spreadsheet_bytes(raw, file.filename or "upload.xlsx")
    return {
        "filename": file.filename or "upload.xlsx",
        "rows": rows,
        "count": len(rows),
    }


@router.post("/restore-backup")
async def restore_full_backup_endpoint(
    request: Request,
    payload: dict[str, Any] = Body(...),
    current_user: User = Depends(require_roles(RoleEnum.ADMIN)),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """Full database restoration from a ZAYCHICK_FULL_BACKUP_V1 JSON archive (ADMIN only)."""
    try:
        report = await restore_backup_payload_to_postgres(payload, session)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    await record_audit_log(
        session,
        action="RESTORE_BACKUP",
        entity_type="system",
        entity_id="full_backup",
        user=current_user,
        new_data={
            "joints_inserted": report.get("joints", {}).get("inserted", 0),
            "lines_inserted": report.get("lines", {}).get("inserted", 0),
            "lrv_inserted": report.get("lrv", {}).get("inserted", 0),
        },
        ip_address=get_client_ip(request),
        summary=(
            f"Полное восстановление СУБД из JSON-бэкапа "
            f"(стыков: {report.get('joints', {}).get('inserted', 0)}, "
            f"линий: {report.get('lines', {}).get('inserted', 0)})"
        ),
    )
    await publish_domain_event(
        session,
        event="system.restored",
        entity_type="system",
        entity_id="full_backup",
        version=1,
        updated_by=current_user.login,
    )
    return {"status": "ok", "report": report}


@router.post("/zero-reset")
async def zero_reset_database_endpoint(
    request: Request,
    payload: dict[str, Any] = Body(default_factory=dict),
    current_user: User = Depends(require_roles(RoleEnum.ADMIN)),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """Full database wipe («Чистый лист») preserving administrator access (ADMIN only)."""
    keep_only_admin = bool(payload.get("keep_only_admin", True))
    result = await zero_reset_postgres(
        session,
        keep_only_admin=keep_only_admin,
        current_user=current_user,
    )
    await record_audit_log(
        session,
        action="ZERO_RESET",
        entity_type="system",
        entity_id="zero_reset",
        user=current_user,
        new_data=result,
        ip_address=get_client_ip(request),
        summary="Полное обнуление таблиц СУБД («Чистый лист»)",
    )
    await publish_domain_event(
        session,
        event="system.zero_reset",
        entity_type="system",
        entity_id="zero_reset",
        version=1,
        updated_by=current_user.login,
    )
    return result

