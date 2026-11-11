from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.worksheet import Worksheet

from app.services.journal_formatter import (
    GOST_32569_HEADERS,
    STO_GAZPROM_COLUMNS,
    format_gost_32569_row,
    format_sto_gazprom_row,
)
from app.services.readiness_service import (
    calculate_line_ndt_progress,
    calculate_readiness_report,
    calculate_welder_ndt_quotas,
)

_THIN_SIDE = Side(style="thin", color="475569")
_CELL_BORDER = Border(left=_THIN_SIDE, right=_THIN_SIDE, top=_THIN_SIDE, bottom=_THIN_SIDE)
_HEADER_FILL = PatternFill(start_color="E2E8F0", end_color="E2E8F0", fill_type="solid")
_NUM_FILL = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
_ALERT_RED_FILL = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
_ALERT_AMBER_FILL = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
_ALERT_GREEN_FILL = PatternFill(start_color="DCFCE7", end_color="DCFCE7", fill_type="solid")

_FONT_TITLE = Font(name="Calibri", size=13, bold=True, color="0F172A")
_FONT_META = Font(name="Calibri", size=10, italic=True, color="334155")
_FONT_HEADER = Font(name="Calibri", size=9, bold=True, color="0F172A")
_FONT_BODY = Font(name="Calibri", size=9, color="0F172A")

_ALIGN_HEADER = Alignment(horizontal="center", vertical="center", wrap_text=True)
_ALIGN_BODY = Alignment(horizontal="center", vertical="center", wrap_text=True)
_ALIGN_LEFT = Alignment(horizontal="left", vertical="center", wrap_text=True)


def _ev(val: Any) -> str:
    if val is None:
        return ""
    return val.value if hasattr(val, "value") else str(val)


def _configure_print_sheet(ws: Worksheet, *, header_rows_end: int) -> None:
    ws.views.sheetView[0].showGridLines = True
    ws.page_setup.orientation = ws.ORIENTATION_LANDSCAPE
    ws.page_setup.paperSize = ws.PAPERSIZE_A3
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_title_rows = f"1:{header_rows_end}"


def _write_title_block(
    ws: Worksheet,
    *,
    title: str,
    subtitle: str,
    total_cols: int,
) -> int:
    end_col = get_column_letter(total_cols)
    ws.merge_cells(f"A1:{end_col}1")
    ws["A1"] = title
    ws["A1"].font = _FONT_TITLE
    ws["A1"].alignment = _ALIGN_LEFT
    ws.row_dimensions[1].height = 24

    ws.merge_cells(f"A2:{end_col}2")
    ws["A2"] = subtitle
    ws["A2"].font = _FONT_META
    ws["A2"].alignment = _ALIGN_LEFT
    ws.row_dimensions[2].height = 18
    return 4


def _write_table_rows(
    ws: Worksheet,
    *,
    start_row: int,
    rows: list[list[Any]],
    left_align_cols: set[int] | None = None,
) -> None:
    left_cols = left_align_cols or set()
    for r_offset, row_vals in enumerate(rows):
        row_idx = start_row + r_offset
        max_lines = 1
        for c_idx, val in enumerate(row_vals, start=1):
            cell = ws.cell(row=row_idx, column=c_idx, value=val)
            cell.font = _FONT_BODY
            cell.border = _CELL_BORDER
            cell.alignment = _ALIGN_LEFT if c_idx in left_cols else _ALIGN_BODY
            if isinstance(val, str):
                max_lines = max(max_lines, val.count("\n") + 1)
        ws.row_dimensions[row_idx].height = max(20, min(90, max_lines * 14 + 6))


def _style_header_range(ws: Worksheet, *, min_row: int, max_row: int, max_col: int) -> None:
    for r in range(min_row, max_row + 1):
        for c in range(1, max_col + 1):
            cell = ws.cell(row=r, column=c)
            cell.font = _FONT_HEADER
            cell.fill = _HEADER_FILL if r < max_row else _NUM_FILL
            cell.alignment = _ALIGN_HEADER
            cell.border = _CELL_BORDER


def _build_sto_header(ws: Worksheet, *, start_row: int) -> int:
    r_top = start_row
    r_sub = start_row + 1
    r_lbl = start_row + 2
    r_num = start_row + 3

    for meta in STO_GAZPROM_COLUMNS:
        col = meta.col_number
        ws.column_dimensions[get_column_letter(col)].width = max(9, meta.width)
        ws.cell(row=r_top, column=col, value=meta.top_group or meta.label)
        ws.cell(row=r_sub, column=col, value=meta.sub_group or meta.label)
        ws.cell(row=r_lbl, column=col, value=meta.label)
        ws.cell(row=r_num, column=col, value=col)

    _style_header_range(ws, min_row=r_top, max_row=r_num, max_col=len(STO_GAZPROM_COLUMNS))

    # Horizontal merges on topGroup / subGroup rows and vertical merges for standalone columns
    col = 1
    total = len(STO_GAZPROM_COLUMNS)
    while col <= total:
        meta = STO_GAZPROM_COLUMNS[col - 1]
        if meta.top_group is None and meta.sub_group is None:
            ws.merge_cells(start_row=r_top, start_column=col, end_row=r_lbl, end_column=col)
            col += 1
            continue

        top_end = col
        while top_end < total and STO_GAZPROM_COLUMNS[top_end].top_group == meta.top_group:
            top_end += 1
        if top_end > col:
            ws.merge_cells(start_row=r_top, start_column=col, end_row=r_top, end_column=top_end)

        sub_c = col
        while sub_c <= top_end:
            sub_meta = STO_GAZPROM_COLUMNS[sub_c - 1]
            if sub_meta.sub_group is None:
                ws.merge_cells(start_row=r_sub, start_column=sub_c, end_row=r_lbl, end_column=sub_c)
                sub_c += 1
            else:
                sub_end = sub_c
                while sub_end < top_end and STO_GAZPROM_COLUMNS[sub_end].sub_group == sub_meta.sub_group:
                    sub_end += 1
                if sub_end > sub_c:
                    ws.merge_cells(start_row=r_sub, start_column=sub_c, end_row=r_sub, end_column=sub_end)
                sub_c = sub_end + 1

        col = top_end + 1

    ws.row_dimensions[r_top].height = 24
    ws.row_dimensions[r_sub].height = 36
    ws.row_dimensions[r_lbl].height = 42
    ws.row_dimensions[r_num].height = 18
    return r_num + 1


def _workbook_to_bytes(wb: Workbook) -> bytes:
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def build_welding_journal_workbook_bytes(
    joints: list[Any],
    *,
    standard: str = "СТО Газпром 15-1.1-002-2023",
    lrv_items: list[Any] | None = None,
    object_title: str = "",
    rd_code: str = "",
) -> bytes:
    """Generate normative XLSX Welding Journal (GOST 32569-2013 or STO Gazprom 15-1.1-002-2023)."""
    wb = Workbook()
    ws = wb.active
    is_gost = standard == "ГОСТ 32569-2013"
    ws.title = "Журнал ГОСТ 32569" if is_gost else "Журнал СТО Газпром"
    lrv_map = {(item.rd_code, item.lrv_code): item for item in (lrv_items or [])}

    ts_label = datetime.now(timezone.utc).strftime("%d.%m.%Y %H:%M UTC")
    meta_parts = [
        f"Стандарт: {standard}",
        f"Объект: {object_title or 'Все объекты'}",
        f"Шифр РД: {rd_code or 'Все шифры'}",
        f"Сформировано: {ts_label}",
    ]
    subtitle = " | ".join(meta_parts)

    if is_gost:
        total_cols = len(GOST_32569_HEADERS)
        hdr_row = _write_title_block(
            ws,
            title="ЖУРНАЛ СВАРОЧНЫХ РАБОТ (ГОСТ 32569-2013)",
            subtitle=subtitle,
            total_cols=total_cols,
        )
        widths = [7, 24, 24, 34, 16, 20, 13, 30, 18, 18, 20, 20, 18, 18, 22, 24, 22]
        for idx, (label, width) in enumerate(zip(GOST_32569_HEADERS, widths), start=1):
            ws.column_dimensions[get_column_letter(idx)].width = width
            ws.cell(row=hdr_row, column=idx, value=label)
            ws.cell(row=hdr_row + 1, column=idx, value=idx)
        ws.row_dimensions[hdr_row].height = 48
        ws.row_dimensions[hdr_row + 1].height = 18
        _style_header_range(ws, min_row=hdr_row, max_row=hdr_row + 1, max_col=total_cols)

        data_rows = [format_gost_32569_row(i + 1, j, lrv_map) for i, j in enumerate(joints)]
        _write_table_rows(ws, start_row=hdr_row + 2, rows=data_rows, left_align_cols={4, 8})
        _configure_print_sheet(ws, header_rows_end=hdr_row + 1)
    else:
        total_cols = len(STO_GAZPROM_COLUMNS)
        hdr_row = _write_title_block(
            ws,
            title="ЖУРНАЛ СВАРОЧНЫХ РАБОТ (СТО Газпром 15-1.1-002-2023, Форма Г.1)",
            subtitle=subtitle,
            total_cols=total_cols,
        )
        data_start = _build_sto_header(ws, start_row=hdr_row)
        data_rows = [format_sto_gazprom_row(i + 1, j, lrv_map) for i, j in enumerate(joints)]
        _write_table_rows(ws, start_row=data_start, rows=data_rows, left_align_cols={6, 8, 17})
        _configure_print_sheet(ws, header_rows_end=data_start - 1)

    return _workbook_to_bytes(wb)


def build_readiness_and_quotas_workbook_bytes(
    joints: list[Any],
    lines: list[Any],
    *,
    condition: str = "uniqueLineId",
) -> bytes:
    """Generate multi-sheet Executive Readiness & Welder NDT Quotas XLSX report."""
    wb = Workbook()

    # Sheet 1: Readiness summary
    ws_ready = wb.active
    ws_ready.title = "Сводка готовности"
    headers_r = [
        "Группа",
        "Описание",
        "Всего стыков",
        "Доп. стыки",
        "Сварено",
        "ВИК годен",
        "НК годен",
        "Дубл. НК годен",
        "В ремонте",
        "Полностью принято",
        "% сварки",
        "% готовности",
        "Σ ЭДД (дюйм)",
        "Сварено ЭДД (дюйм)",
        "% по ЭДД",
    ]
    start_r = _write_title_block(
        ws_ready,
        title="СВОДНЫЙ ОТЧЁТ О ГОТОВНОСТИ И ПРИЁМКЕ СВАРНЫХ СОЕДИНЕНИЙ",
        subtitle=f"Группировка: {condition} | Стыков в выборке: {len(joints)}",
        total_cols=len(headers_r),
    )
    for col, h in enumerate(headers_r, start=1):
        ws_ready.cell(row=start_r, column=col, value=h)
        ws_ready.column_dimensions[get_column_letter(col)].width = 18 if col <= 2 else 14
    ws_ready.row_dimensions[start_r].height = 30
    _style_header_range(ws_ready, min_row=start_r, max_row=start_r, max_col=len(headers_r))

    readiness_rows = calculate_readiness_report(joints, condition)
    table_r = [
        [
            r.group_key,
            r.sub_label,
            r.total_joints,
            r.supplementary_joints,
            r.welded_count,
            r.vik_passed_count,
            r.ndt_passed_count,
            r.dup_ndt_passed_count,
            r.repair_count,
            r.fully_completed_count,
            r.welding_pct,
            r.readiness_pct,
            r.total_equiv_inches,
            r.welded_equiv_inches,
            r.equiv_welding_pct,
        ]
        for r in readiness_rows
    ]
    _write_table_rows(ws_ready, start_row=start_r + 1, rows=table_r, left_align_cols={1, 2})
    _configure_print_sheet(ws_ready, header_rows_end=start_r)

    # Sheet 2: Welder NDT Quotas
    ws_q = wb.create_sheet("Квоты НК (сварщики)")
    headers_q = [
        "Клеймо",
        "Ф.И.О. сварщика",
        "Сварено стыков",
        "Проконтролировано НК",
        "Годных",
        "Брак (ремонт/вырезка)",
        "Факт НК, %",
        "План НК, %",
        "Штраф. контроль (+стыков)",
        "Статус",
        "Заключение / Детализация",
    ]
    start_q = _write_title_block(
        ws_q,
        title="ВЫПОЛНЕНИЕ НОРМАТИВНЫХ КВОТ НК ПО СВАРЩИКАМ (п. 5.7 СТО 15-1.3-004-2023)",
        subtitle=f"Статус «В работе» не засчитывается в выполненный контроль | Сварщиков: {len(joints) and 'активных' or '0'}",
        total_cols=len(headers_q),
    )
    for col, h in enumerate(headers_q, start=1):
        ws_q.cell(row=start_q, column=col, value=h)
        ws_q.column_dimensions[get_column_letter(col)].width = 38 if col == 11 else (24 if col == 2 else 15)
    ws_q.row_dimensions[start_q].height = 30
    _style_header_range(ws_q, min_row=start_q, max_row=start_q, max_col=len(headers_q))

    quotas = calculate_welder_ndt_quotas(joints, lines)
    table_q = [
        [
            q.stamp,
            q.full_name,
            q.total_welded,
            q.inspected_count,
            q.passed_count,
            q.defect_count,
            q.actual_ndt_pct,
            q.required_ndt_pct,
            q.penalty_required_joints,
            q.status,
            q.details,
        ]
        for q in quotas
    ]
    _write_table_rows(ws_q, start_row=start_q + 1, rows=table_q, left_align_cols={2, 11})
    for idx, q in enumerate(quotas):
        r_idx = start_q + 1 + idx
        fill = (
            _ALERT_GREEN_FILL
            if q.status == "compliant"
            else (_ALERT_AMBER_FILL if q.status == "warning" else _ALERT_RED_FILL)
        )
        ws_q.cell(row=r_idx, column=10).fill = fill
    _configure_print_sheet(ws_q, header_rows_end=start_q)

    # Sheet 3: Line NDT progress
    ws_l = wb.create_sheet("Прогресс НК по линиям")
    headers_l = [
        "Уникальный ID линии",
        "Линия",
        "Шифр РД",
        "Всего стыков",
        "Сварено",
        "План РК, %",
        "Факт РК, %",
        "РК выполнено",
        "План УЗК, %",
        "Факт УЗК, %",
        "УЗК выполнено",
    ]
    start_l = _write_title_block(
        ws_l,
        title="ВЫПОЛНЕНИЕ ПРОЕКТНОГО ОБЪЁМА НК ПО ЛИНИЯМ ЛАЙНЛИСТА",
        subtitle=f"Линий в лайнлисте: {len(lines)}",
        total_cols=len(headers_l),
    )
    for col, h in enumerate(headers_l, start=1):
        ws_l.cell(row=start_l, column=col, value=h)
        ws_l.column_dimensions[get_column_letter(col)].width = 22 if col in (1, 3) else 14
    ws_l.row_dimensions[start_l].height = 28
    _style_header_range(ws_l, min_row=start_l, max_row=start_l, max_col=len(headers_l))

    table_l = []
    for line in lines:
        p = calculate_line_ndt_progress(joints, line)
        table_l.append(
            [
                p.unique_line_id,
                line.line_number,
                line.rd_code,
                p.total_joints,
                p.welded_joints,
                p.required_rk_pct,
                p.actual_rk_pct,
                "Да" if p.is_rk_fulfilled else "Нет",
                p.required_uzk_pct,
                p.actual_uzk_pct,
                "Да" if p.is_uzk_fulfilled else "Нет",
            ]
        )
    _write_table_rows(ws_l, start_row=start_l + 1, rows=table_l, left_align_cols={1, 3})
    _configure_print_sheet(ws_l, header_rows_end=start_l)

    return _workbook_to_bytes(wb)


def build_joints_registry_workbook_bytes(joints: list[Any]) -> bytes:
    """Export normalized WeldJoint registry table cleanly to XLSX."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Реестр стыков"
    headers = [
        "№ п/п",
        "Объект",
        "Шифр РД",
        "Линия",
        "№ стыка",
        "Диаметр, мм",
        "Стенка, мм",
        "Способ сварки",
        "Дата сварки",
        "Клеймо сварщика",
        "ТК",
        "ВИК рез-т",
        "ВИК акт №",
        "ВИК дата",
        "НК метод",
        "НК рез-т",
        "НК закл. №",
        "НК дата",
        "Ремонт",
        "Версия",
    ]
    start_row = _write_title_block(
        ws,
        title="РЕЕСТР СВАРНЫХ СОЕДИНЕНИЙ",
        subtitle=f"Всего записей: {len(joints)}",
        total_cols=len(headers),
    )
    for col, h in enumerate(headers, start=1):
        ws.cell(row=start_row, column=col, value=h)
        ws.column_dimensions[get_column_letter(col)].width = 20 if col in (2, 3) else 14
    ws.row_dimensions[start_row].height = 28
    _style_header_range(ws, min_row=start_row, max_row=start_row, max_col=len(headers))

    rows = [
        [
            idx,
            j.object_name,
            j.rd_code,
            j.line_number,
            j.joint_number,
            j.diameter_mm,
            j.wall_thickness,
            j.welding_type,
            j.welding_date.strftime("%d.%m.%Y") if j.welding_date else "",
            j.welder_stamp,
            j.tech_card_number,
            _ev(j.vik_result),
            j.vik_report_number or "",
            j.vik_date.strftime("%d.%m.%Y") if j.vik_date else "",
            _ev(j.ndt_type),
            _ev(j.ndt_result),
            j.ndt_report_number or "",
            j.ndt_date.strftime("%d.%m.%Y") if j.ndt_date else "",
            j.repair_action or "",
            j.version,
        ]
        for idx, j in enumerate(joints, start=1)
    ]
    _write_table_rows(ws, start_row=start_row + 1, rows=rows, left_align_cols={2, 3})
    _configure_print_sheet(ws, header_rows_end=start_row)
    return _workbook_to_bytes(wb)


def build_joints_template_workbook_bytes(
    *,
    rd_code: str = "0092.049.Р.13/1 0004 УКПГ.045.0077.001-ТХ3",
    line_number: str = "ФП1.2/1",
    lrv1_code: str = "ЛРВ-001ТХ3-0412",
    lrv2_code: str = "ЛРВ-001ТХ3-0415",
) -> bytes:
    """Generate clean XLSX import template for WeldJoint batch upload."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Шаблон импорта стыков"
    headers = [
        "Шифр РД",
        "Номер линии",
        "Номер стыка",
        "Диаметр, мм",
        "Толщина стенки, мм",
        "Код ЛРВ 1",
        "Код ЛРВ 2",
        "Тип соединения (ГОСТ 16037-80)",
    ]
    widths = [40, 18, 16, 16, 20, 18, 18, 28]
    for col, (h, w) in enumerate(zip(headers, widths), start=1):
        ws.cell(row=1, column=col, value=h)
        ws.column_dimensions[get_column_letter(col)].width = w
    _style_header_range(ws, min_row=1, max_row=1, max_col=len(headers))
    ws.row_dimensions[1].height = 28

    sample_rows = [
        [rd_code, line_number, "010", 159, 8.0, lrv1_code, lrv2_code, "С17"],
        [rd_code, line_number, "020", 159, 8.0, lrv2_code, lrv1_code, "С17"],
    ]
    _write_table_rows(ws, start_row=2, rows=sample_rows, left_align_cols={1, 2, 6, 7})
    return _workbook_to_bytes(wb)


def build_linelist_workbook_bytes(lines: list[Any], *, is_template: bool = False) -> bytes:
    """Export ProjectLine list or Excel template to XLSX."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Проект (лайнлист)"
    headers = [
        "Объект",
        "Шифр РД",
        "Номер линии",
        "Наименование линии",
        "Продукт",
        "Испытательный контур",
        "НТД на сварку",
        "НТД на контроль",
        "Уровень качества",
        "Категория трубопровода",
        "Рабочее давление",
        "Рабочая температура",
        "РК (%)",
        "УЗК (%)",
        "ПВК (%)",
    ]
    widths = [26, 36, 16, 28, 18, 20, 24, 24, 16, 18, 16, 18, 10, 10, 10]
    for col, (h, w) in enumerate(zip(headers, widths), start=1):
        ws.cell(row=1, column=col, value=h)
        ws.column_dimensions[get_column_letter(col)].width = w
    _style_header_range(ws, min_row=1, max_row=1, max_col=len(headers))
    ws.row_dimensions[1].height = 28

    if is_template:
        rows = [
            [
                "УКПГ-2В Бованенковское НГКМ",
                "0092.049.Р.13/1 0004 УКПГ.045.0077.001-ТХ3",
                "ФП1.2/1",
                "Факельная линия высокого давления",
                "Газ природный",
                "Контур №1",
                "СТО Газпром 15-1.1-002-2023",
                "СТО Газпром 15-1.1-002-2023",
                "A",
                "I",
                "4.0 МПа",
                "-45..+50 °C",
                100,
                100,
                0,
            ]
        ]
    else:
        rows = [
            [
                l.object_name,
                l.rd_code,
                l.line_number,
                l.line_name,
                l.product,
                l.test_contour,
                l.welding_ntd,
                l.control_ntd,
                l.quality_level,
                l.pipeline_category,
                l.working_pressure,
                l.working_temperature,
                l.rk_percent,
                l.uzk_percent,
                l.pvk_percent,
            ]
            for l in lines
        ]
    _write_table_rows(ws, start_row=2, rows=rows, left_align_cols={1, 2, 4, 7, 8})
    return _workbook_to_bytes(wb)


def build_lrv_workbook_bytes(items: list[Any], *, is_template: bool = False) -> bytes:
    """Export LRV catalog or Excel template to XLSX."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Каталог ЛРВ"
    headers = [
        "Код ЛРВ",
        "Шифр РД",
        "Объект",
        "Краткое наименование",
        "Категория",
        "Тип подсоединения",
        "Материал (Сталь)",
        "НТД (ГОСТ / ТУ)",
        "Завод-изготовитель",
        "Условный проход DN 1",
        "Диаметр Ø1, мм",
        "Толщина стенки S1, мм",
        "Условный проход DN 2",
        "Диаметр Ø2, мм",
        "Толщина стенки S2, мм",
        "Кол-во по спец.",
        "Ед. изм.",
    ]
    widths = [22, 36, 26, 32, 16, 18, 18, 20, 22, 16, 16, 18, 16, 16, 18, 14, 10]
    for col, (h, w) in enumerate(zip(headers, widths), start=1):
        ws.cell(row=1, column=col, value=h)
        ws.column_dimensions[get_column_letter(col)].width = w
    _style_header_range(ws, min_row=1, max_row=1, max_col=len(headers))
    ws.row_dimensions[1].height = 28

    if is_template:
        rows = [
            [
                "ЛРВ-001ТХ3-0601",
                "0092.049.Р.13/1 0004 УКПГ.045.0077.001-ТХ3",
                "УКПГ-2В Бованенковское НГКМ",
                "Труба электросварная 159х8",
                "Труба",
                "",
                "09Г2С",
                "ГОСТ 10704-91",
                "ПАО «ЧТПЗ»",
                150,
                159,
                8.0,
                "",
                "",
                "",
                120,
                "м",
            ]
        ]
    else:
        rows = [
            [
                it.lrv_code,
                it.rd_code,
                it.object_name,
                it.short_name,
                _ev(it.category),
                it.connection_type or "",
                it.material,
                it.ntd,
                it.manufacturer or "",
                it.dn1 if it.dn1 is not None else "",
                it.diameter_mm,
                it.wall_thickness,
                it.dn2 if it.dn2 is not None else "",
                it.diameter_mm2 if it.diameter_mm2 is not None else "",
                it.wall_thickness2 if it.wall_thickness2 is not None else "",
                it.spec_qty,
                _ev(it.unit),
            ]
            for it in items
        ]
    _write_table_rows(ws, start_row=2, rows=rows, left_align_cols={1, 2, 3, 4, 8, 9})
    return _workbook_to_bytes(wb)
