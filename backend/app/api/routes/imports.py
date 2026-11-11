from __future__ import annotations

import csv
import io
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from openpyxl import load_workbook

from app.api.deps import get_current_user
from app.models.user import User

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


@router.post("/parse-spreadsheet")
async def parse_uploaded_spreadsheet(
    file: UploadFile = File(...),
    _current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Server-side Excel/CSV parser replacing vulnerable client-side SheetJS (xlsx@0.18.5)."""
    raw = await file.read()
    if len(raw) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Размер файла превышает допустимый лимит 20 МБ.",
        )
    rows = parse_spreadsheet_bytes(raw, file.filename or "upload.xlsx")
    return {
        "filename": file.filename or "upload.xlsx",
        "rows": rows,
        "count": len(rows),
    }
