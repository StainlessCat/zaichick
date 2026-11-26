"""
Серверный генератор многолистового отчёта «Лаборатория НК» (.xlsx).
Изолированно использует расчёт «Маркировки стыка» из app.services.lab_marking.
"""

from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
from typing import Any

from openpyxl import Workbook
from openpyxl.utils import get_column_letter

from app.services.excel_export import (
    _configure_print_sheet,
    _ev,
    _style_header_range,
    _write_table_rows,
    _write_title_block,
)
from app.services.lab_conclusions import normalize_requested_methods
from app.services.lab_marking import build_joint_lab_marking


def _extract_method_tuple(
    joint: Any,
    method: str,
) -> tuple[str, str, str, str]:
    """Возвращает (№ заключения, дата, результат, дефектоскопист) по методу."""
    lc = getattr(joint, "lab_conclusions", None) or {}
    if isinstance(lc, dict) and isinstance(lc.get(method), dict):
        entry = lc[method]
        return (
            str(entry.get("reportNumber") or ""),
            str(entry.get("date") or ""),
            str(entry.get("result") or "Не проводился"),
            str(entry.get("inspector") or ""),
        )

    if method == "ВИК":
        return (
            str(getattr(joint, "vik_report_number", "") or ""),
            str(getattr(joint, "vik_date", "") or ""),
            _ev(getattr(joint, "vik_result", None)) or "Не проводился",
            str(getattr(joint, "vik_inspector", "") or ""),
        )

    ndt_type = _ev(getattr(joint, "ndt_type", None))
    if ndt_type == method or (method == "ПВК" and ndt_type == "МК"):
        return (
            str(getattr(joint, "ndt_report_number", "") or ""),
            str(getattr(joint, "ndt_date", "") or ""),
            _ev(getattr(joint, "ndt_result", None)) or "Не проводился",
            str(getattr(joint, "ndt_inspector", "") or ""),
        )
    return ("", "", "Не проводился", "")


def _joint_matches_search(joint: Any, marking: str, query_lower: str) -> bool:
    if not query_lower:
        return True
    if query_lower in str(getattr(joint, "joint_number", "") or "").lower():
        return True
    if query_lower in str(getattr(joint, "line_number", "") or "").lower():
        return True
    if query_lower in str(getattr(joint, "rd_code", "") or "").lower():
        return True
    if query_lower in str(getattr(joint, "welder_stamp", "") or "").lower():
        return True
    if query_lower in marking.lower():
        return True
    if query_lower in str(getattr(joint, "ndt_report_number", "") or "").lower():
        return True
    if query_lower in str(getattr(joint, "vik_report_number", "") or "").lower():
        return True
    lc = getattr(joint, "lab_conclusions", None) or {}
    if isinstance(lc, dict):
        for entry in lc.values():
            if isinstance(entry, dict) and query_lower in str(entry.get("reportNumber") or "").lower():
                return True
    return False


def _setup_sheet_table(
    ws: Any,
    *,
    title: str,
    subtitle: str,
    headers: list[str],
    widths: list[int],
    rows: list[list[Any]],
    left_align_cols: set[int],
) -> None:
    total_cols = len(headers)
    header_row = _write_title_block(ws, title=title, subtitle=subtitle, total_cols=total_cols)
    for col_idx, (hdr, width) in enumerate(zip(headers, widths), start=1):
        ws.column_dimensions[get_column_letter(col_idx)].width = width
        ws.cell(row=header_row, column=col_idx, value=hdr)
    ws.row_dimensions[header_row].height = 28
    _style_header_range(ws, min_row=header_row, max_row=header_row, max_col=total_cols)

    if rows:
        _write_table_rows(ws, start_row=header_row + 1, rows=rows, left_align_cols=left_align_cols)
    else:
        _write_table_rows(
            ws,
            start_row=header_row + 1,
            rows=[["Нет данных по заданному фильтру"] + [""] * (total_cols - 1)],
            left_align_cols={1},
        )
    _configure_print_sheet(ws, header_rows_end=header_row)


def build_laboratory_workbook_bytes(
    *,
    joints: list[Any],
    lab_requests: list[Any],
    object_name: str | None = None,
    rd_code: str | None = None,
    search_query: str | None = None,
) -> bytes:
    """Строит многолистовую книгу Excel (.xlsx) для модуля «Лаборатория НК»."""
    wb = Workbook()
    query_lower = (search_query or "").strip().lower()
    generated_at = datetime.now(timezone.utc).strftime("%d.%m.%Y %H:%M UTC")
    filter_desc = (
        f"Объект: {object_name or 'Все'} · Шифр РД: {rd_code or 'Все'}"
        + (f" · Поиск: {search_query}" if query_lower else "")
        + f" · Сформировано: {generated_at}"
    )

    joints_by_id: dict[str, Any] = {}
    marking_by_id: dict[str, str] = {}
    filtered_joints: list[tuple[Any, str]] = []

    for j in joints:
        jid = str(getattr(j, "id", ""))
        joints_by_id[jid] = j
        leg_id = getattr(j, "legacy_id", None)
        if leg_id:
            joints_by_id[str(leg_id)] = j

        m_res = build_joint_lab_marking(
            rd_code=getattr(j, "rd_code", None),
            line_number=getattr(j, "line_number", None),
            diameter_mm=getattr(j, "diameter_mm", None),
            joint_kind=_ev(getattr(j, "joint_kind", None)),
            gost_joint_type=getattr(j, "gost_joint_type", None),
            welding_type=_ev(getattr(j, "welding_type", None)),
            joint_number=getattr(j, "joint_number", None),
        )
        marking_by_id[jid] = m_res.marking
        if _joint_matches_search(j, m_res.marking, query_lower):
            filtered_joints.append((j, m_res.marking))

    # Лист 1: Дефицит и маркировка
    ws1 = wb.active
    ws1.title = "Дефицит и маркировка"
    sheet1_headers = [
        "Объект",
        "Шифр РД",
        "Линия",
        "Контур",
        "№ стыка",
        "Маркировка стыка",
        "Диаметр, мм",
        "Стенка, мм",
        "Вид сварки",
        "Дата сварки",
        "Клеймо",
        "ВИК",
        "РК",
        "УЗК",
        "ПВК",
    ]
    sheet1_widths = [24, 24, 14, 18, 10, 28, 12, 11, 12, 12, 12, 14, 14, 14, 14]
    sheet1_rows: list[list[Any]] = []
    for j, marking in filtered_joints:
        _, _, vik_res, _ = _extract_method_tuple(j, "ВИК")
        _, _, rk_res, _ = _extract_method_tuple(j, "РК")
        _, _, uzk_res, _ = _extract_method_tuple(j, "УЗК")
        _, _, pvk_res, _ = _extract_method_tuple(j, "ПВК")
        sheet1_rows.append(
            [
                getattr(j, "object_name", ""),
                getattr(j, "rd_code", ""),
                getattr(j, "line_number", ""),
                getattr(j, "contour", ""),
                getattr(j, "joint_number", ""),
                marking,
                getattr(j, "diameter_mm", ""),
                getattr(j, "wall_thickness", ""),
                _ev(getattr(j, "welding_type", "")),
                str(getattr(j, "welding_date", "") or ""),
                getattr(j, "welder_stamp", ""),
                vik_res,
                rk_res,
                uzk_res,
                pvk_res,
            ]
        )
    _setup_sheet_table(
        ws1,
        title="Лаборатория НК — Стыки и маркировка",
        subtitle=filter_desc,
        headers=sheet1_headers,
        widths=sheet1_widths,
        rows=sheet1_rows,
        left_align_cols={1, 2, 4, 6},
    )

    # Лист 2: Заявки ЛНК
    ws2 = wb.create_sheet(title="Заявки ЛНК")
    sheet2_headers = [
        "№ заявки",
        "Дата подачи",
        "Статус",
        "Этап контроля",
        "Методы пакета",
        "Объект",
        "Шифр РД",
        "Линия",
        "Контур",
        "Заявитель",
        "Принял в работу",
        "Стыков, шт.",
        "Маркировки стыков",
        "Примечание",
    ]
    sheet2_widths = [16, 13, 15, 22, 18, 22, 22, 12, 16, 20, 20, 12, 36, 28]
    sheet2_rows: list[list[Any]] = []
    for req in lab_requests:
        methods_list, methods_str = normalize_requested_methods(
            getattr(req, "requested_methods", None),
            getattr(req, "requested_method", None),
        )
        req_joint_ids = getattr(req, "joint_ids", None) or []
        req_markings: list[str] = []
        matched_joint = False
        for jid in req_joint_ids:
            j_obj = joints_by_id.get(str(jid))
            if j_obj is not None:
                m_val = marking_by_id.get(str(getattr(j_obj, "id", "")), "")
                if m_val:
                    req_markings.append(m_val)
                if query_lower and _joint_matches_search(j_obj, m_val, query_lower):
                    matched_joint = True

        if query_lower and not matched_joint:
            req_haystack = " ".join(
                [
                    str(getattr(req, "request_number", "") or ""),
                    str(getattr(req, "rd_code", "") or ""),
                    str(getattr(req, "line_number", "") or ""),
                    str(getattr(req, "created_by", "") or ""),
                    str(getattr(req, "accepted_by", "") or ""),
                    methods_str,
                ]
            ).lower()
            if query_lower not in req_haystack:
                continue

        sheet2_rows.append(
            [
                getattr(req, "request_number", ""),
                getattr(req, "created_date", ""),
                getattr(req, "status", ""),
                getattr(req, "control_stage", ""),
                ", ".join(methods_list),
                getattr(req, "object_name", ""),
                getattr(req, "rd_code", ""),
                getattr(req, "line_number", ""),
                getattr(req, "contour", ""),
                getattr(req, "created_by", ""),
                getattr(req, "accepted_by", "") or "",
                len(req_joint_ids),
                "\n".join(req_markings),
                getattr(req, "notes", "") or "",
            ]
        )
    _setup_sheet_table(
        ws2,
        title="Лаборатория НК — Реестр пакетных заявок",
        subtitle=filter_desc,
        headers=sheet2_headers,
        widths=sheet2_widths,
        rows=sheet2_rows,
        left_align_cols={1, 4, 6, 7, 13, 14},
    )

    # Лист 3: Заключения по методам
    ws3 = wb.create_sheet(title="Заключения по методам")
    sheet3_headers = [
        "№ стыка",
        "Маркировка стыка",
        "Шифр РД",
        "Линия",
        "ВИК №",
        "ВИК дата",
        "ВИК итог",
        "РК №",
        "РК дата",
        "РК итог",
        "УЗК №",
        "УЗК дата",
        "УЗК итог",
        "ПВК №",
        "ПВК дата",
        "ПВК итог",
        "Дефектоскопист",
    ]
    sheet3_widths = [10, 28, 22, 12, 26, 12, 13, 26, 12, 13, 26, 12, 13, 26, 12, 13, 20]
    sheet3_rows: list[list[Any]] = []
    for j, marking in filtered_joints:
        vik_n, vik_d, vik_r, vik_i = _extract_method_tuple(j, "ВИК")
        rk_n, rk_d, rk_r, rk_i = _extract_method_tuple(j, "РК")
        uzk_n, uzk_d, uzk_r, uzk_i = _extract_method_tuple(j, "УЗК")
        pvk_n, pvk_d, pvk_r, pvk_i = _extract_method_tuple(j, "ПВК")
        inspector = rk_i or uzk_i or pvk_i or vik_i
        sheet3_rows.append(
            [
                getattr(j, "joint_number", ""),
                marking,
                getattr(j, "rd_code", ""),
                getattr(j, "line_number", ""),
                vik_n,
                vik_d,
                vik_r,
                rk_n,
                rk_d,
                rk_r,
                uzk_n,
                uzk_d,
                uzk_r,
                pvk_n,
                pvk_d,
                pvk_r,
                inspector,
            ]
        )
    _setup_sheet_table(
        ws3,
        title="Лаборатория НК — Ведомость заключений по методам",
        subtitle=filter_desc,
        headers=sheet3_headers,
        widths=sheet3_widths,
        rows=sheet3_rows,
        left_align_cols={2, 3, 5, 8, 11, 14, 17},
    )

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()
