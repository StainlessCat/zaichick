from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Any

from app.models.enums import ControlResultEnum, NdtMethodEnum
from app.services.readiness_service import is_joint_defective

GOST_32569_HEADERS: list[str] = [
    "№ п/п",
    "Обозначение сварного соединения по исполнительному чертежу, тип сварного соединения ГОСТ 16037",
    "Ф.И.О. сварщика, личное клеймо",
    "Марка стали (композиция марок сталей), НД, номера сертификатов",
    "Наружный диаметр элемента трубопровода и толщина стенки DнхS, мм",
    "Дата сварки, температурные условия в рабочей зоне, °С",
    "Способ сварки",
    "Сварочные материалы (марка электрода, сварочной проволоки, защитный газ, флюс), НД, №№ сертификатов",
    "Режим предварительного и сопутствующего подогрева",
    "Отметка о контроле корня шва",
    "Стилоскопирование металла шва, N заключения, дата",
    "Ф.И.О. оператора термиста, личное клеймо",
    "№ диаграммы по журналу термообработки сварных соединений",
    "Твердость металла шва, N заключения, дата",
    "Отметка о годности сварного соединения по внешнему осмотру и измерениям",
    "Способ и результаты неразрушающего контроля сварного соединения, N заключения, дата",
    "Результаты измерения ферритной фазы в металле шва, N заключения, дата",
]


@dataclass(frozen=True, slots=True)
class StoColumnMeta:
    col_number: int
    top_group: str | None
    sub_group: str | None
    label: str
    width: int


STO_GAZPROM_COLUMNS: list[StoColumnMeta] = [
    StoColumnMeta(1, None, None, "Сквозной порядковый номер", 9),
    StoColumnMeta(2, None, None, "Дата сварки", 12),
    StoColumnMeta(3, None, None, "Температура воздуха, °С", 11),
    StoColumnMeta(4, None, None, "Диаметр свариваемого элемента, мм", 13),
    StoColumnMeta(5, None, None, "Толщина стенки свариваемого элемента, мм", 13),
    StoColumnMeta(6, None, None, "ГОСТ или ТУ марки стали, завод-поставщик элемента трубопровода", 28),
    StoColumnMeta(7, None, None, "Температура подогрева (просушки) элементов, °С", 14),
    StoColumnMeta(8, None, None, "Наименование свариваемого элемента трубопровода", 22),
    StoColumnMeta(9, None, None, "Заводской номер элемента", 18),
    StoColumnMeta(10, None, None, "Длина элемента, м", 12),
    StoColumnMeta(11, "Маркировка сварного соединения", None, "километр (подобъект)", 14),
    StoColumnMeta(12, "Маркировка сварного соединения", None, "обозначение технологии сварки", 14),
    StoColumnMeta(13, "Маркировка сварного соединения", None, "номер сварного соединения", 15),
    StoColumnMeta(14, "Маркировка сварного соединения", None, "дополнительная маркировка", 14),
    StoColumnMeta(15, None, None, "Привязка сварного соединения (пикет)", 12),
    StoColumnMeta(16, None, None, "Номер ОТК, положение при сварке", 20),
    StoColumnMeta(17, None, None, "Марка сварочных материалов", 24),
    StoColumnMeta(18, None, None, "Номер шифра (клеймо) бригады или сварщиков", 16),
    StoColumnMeta(19, "Соблюдение технологии", None, "фамилия мастера (прораба)", 18),
    StoColumnMeta(20, "Соблюдение технологии", None, "подпись мастера (прораба)", 12),
    StoColumnMeta(21, "Приемка сварного соединения", "по результатам контроля ВИК", "№", 12),
    StoColumnMeta(22, "Приемка сварного соединения", "по результатам контроля ВИК", "дата", 11),
    StoColumnMeta(23, "Приемка сварного соединения", "по результатам контроля ВИК", "рез-т", 11),
    StoColumnMeta(24, "Приемка сварного соединения", "по результатам контроля физическими методами (основной)", "вид", 10),
    StoColumnMeta(25, "Приемка сварного соединения", "по результатам контроля физическими методами (основной)", "№", 12),
    StoColumnMeta(26, "Приемка сварного соединения", "по результатам контроля физическими методами (основной)", "дата", 11),
    StoColumnMeta(27, "Приемка сварного соединения", "по результатам контроля физическими методами (основной)", "рез-т", 11),
    StoColumnMeta(28, "Приемка сварного соединения", "по результатам контроля физическими методами (дублирующий)", "вид", 10),
    StoColumnMeta(29, "Приемка сварного соединения", "по результатам контроля физическими методами (дублирующий)", "№", 12),
    StoColumnMeta(30, "Приемка сварного соединения", "по результатам контроля физическими методами (дублирующий)", "дата", 11),
    StoColumnMeta(31, "Приемка сварного соединения", "по результатам контроля физическими методами (дублирующий)", "рез-т", 11),
    StoColumnMeta(32, "Сведения о проведении ремонта", None, "отремонтировано, вырезано", 14),
    StoColumnMeta(33, "Сведения о проведении ремонта", None, "дата", 11),
    StoColumnMeta(34, "Сведения о проведении ремонта", None, "номер отк ремонта", 14),
    StoColumnMeta(35, "Сведения о проведении ремонта", None, "клеймо бригады или сварщиков", 15),
    StoColumnMeta(36, "Сведения о проведении ремонта", None, "фамилия мастера (прораба)", 16),
    StoColumnMeta(37, "Сведения о проведении ремонта", None, "подпись мастера (прораба)", 12),
    StoColumnMeta(38, "Приемка сварного соединения после ремонта", "по результатам контроля ВИК", "№", 11),
    StoColumnMeta(39, "Приемка сварного соединения после ремонта", "по результатам контроля ВИК", "дата", 11),
    StoColumnMeta(40, "Приемка сварного соединения после ремонта", "по результатам контроля ВИК", "рез-т", 11),
    StoColumnMeta(41, "Приемка сварного соединения после ремонта", "по результатам контроля физическими методами (основной)", "вид", 10),
    StoColumnMeta(42, "Приемка сварного соединения после ремонта", "по результатам контроля физическими методами (основной)", "№", 11),
    StoColumnMeta(43, "Приемка сварного соединения после ремонта", "по результатам контроля физическими методами (основной)", "дата", 11),
    StoColumnMeta(44, "Приемка сварного соединения после ремонта", "по результатам контроля физическими методами (основной)", "рез-т", 11),
    StoColumnMeta(45, "Приемка сварного соединения после ремонта", "по результатам контроля физическими методами (дублирующий)", "вид", 10),
    StoColumnMeta(46, "Приемка сварного соединения после ремонта", "по результатам контроля физическими методами (дублирующий)", "№", 11),
    StoColumnMeta(47, "Приемка сварного соединения после ремонта", "по результатам контроля физическими методами (дублирующий)", "дата", 11),
    StoColumnMeta(48, "Приемка сварного соединения после ремонта", "по результатам контроля физическими методами (дублирующий)", "рез-т", 11),
    StoColumnMeta(49, None, None, "Примечание", 14),
]

ANGULAR_GOST_CODES = {"У1", "У2", "У3", "У4", "У5", "У6", "У7", "У8", "У9", "У10", "Т1", "Т2", "Т3", "Т6"}


def _ev(v: Any) -> str:
    if v is None:
        return ""
    return v.value if hasattr(v, "value") else str(v)


def _fmt_date(d: date | str | None) -> str:
    if d is None:
        return ""
    if isinstance(d, date):
        return d.strftime("%d.%m.%y")
    s = str(d).strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}", s):
        y, m, day = s[:10].split("-")
        return f"{day}.{m}.{y[2:]}"
    return s


def _fmt_temp(t: float | None) -> str:
    if t is None:
        return ""
    return f"+{t:g}" if t > 0 else f"{t:g}"


def _extract_surname_only(full_name: str | None) -> str:
    s = (full_name or "").strip()
    if not s or s.lower() == "н/п":
        return "н/п"
    tokens = re.split(r"\s+", s)
    return tokens[0] if tokens else "н/п"


def _norm_gost_np(value: str | None) -> str:
    s = (value or "").strip()
    if not s or s.lower() in {"не проводилось", "не требуется", "нет", "-", "—", "н/д"}:
        return ""
    return s


def _is_angular_joint(joint: Any) -> bool:
    if _ev(getattr(joint, "joint_kind", None)) == "Угловое":
        return True
    gost = (getattr(joint, "gost_joint_type", None) or "").strip().upper()
    return gost in ANGULAR_GOST_CODES


def _format_elem_line(
    joint: Any,
    idx: int,
    lrv_map: dict[tuple[str, str], Any],
) -> str:
    name = (getattr(joint, f"elem{idx}_name", None) or "").strip()
    lrv_code = (getattr(joint, f"lrv{idx}_code", None) or "").strip()
    rd_code = (getattr(joint, "rd_code", None) or "").strip()
    lrv = lrv_map.get((rd_code, lrv_code))
    short = (getattr(lrv, "short_name", None) or name or "").strip()
    mat = (getattr(joint, f"elem{idx}_material", None) or "").strip()
    ntd = (getattr(joint, f"elem{idx}_ntd", None) or "").strip()
    cert_parts = [
        p
        for p in (
            f"зав. № {getattr(joint, f'elem{idx}_factory_number', None)}".strip()
            if (getattr(joint, f"elem{idx}_factory_number", None) or "").strip()
            else "",
            f"серт. {getattr(joint, f'elem{idx}_cert_number', None)}".strip()
            if (getattr(joint, f"elem{idx}_cert_number", None) or "").strip()
            else "",
            f"пл. {getattr(joint, f'elem{idx}_heat_number', None)}".strip()
            if (getattr(joint, f"elem{idx}_heat_number", None) or "").strip()
            else "",
        )
        if p
    ]
    title = f"{mat} {short}".replace("(", "").replace(")", "").strip()
    return ", ".join([x for x in (title, ntd.replace("(", "").replace(")", "").strip(), ", ".join(cert_parts)) if x])


def format_gost_32569_row(
    seq_no: int,
    joint: Any,
    lrv_map: dict[tuple[str, str], Any] | None = None,
) -> list[str]:
    """Format 17 normative columns per GOST 32569-2013 without fabricating report numbers."""
    lrv_lookup = lrv_map or {}
    col1 = str(seq_no)
    gost_t = (getattr(joint, "gost_joint_type", None) or "").strip()
    j_num = (getattr(joint, "joint_number", None) or "").strip()
    col2 = f"ст. №{j_num}, {gost_t}" if j_num and gost_t else (f"ст. №{j_num}" if j_num else "н/п")

    stamp = (getattr(joint, "welder_stamp", None) or "").strip()
    fio = (getattr(joint, "welder_full_name", None) or "").strip()
    col3 = f"{fio}, {stamp}" if fio and stamp else (fio or stamp or "н/п")

    e1 = _format_elem_line(joint, 1, lrv_lookup)
    e2 = _format_elem_line(joint, 2, lrv_lookup)
    col4 = f"{e1}\n{e2}".strip() or "н/п"

    d_mm = float(getattr(joint, "diameter_mm", 0) or 0)
    w_mm = float(getattr(joint, "wall_thickness", 0) or 0)
    col5 = f"{d_mm:g}х{w_mm:g}"

    w_date = _fmt_date(getattr(joint, "welding_date", None)) or "н/п"
    amb = getattr(joint, "ambient_temp_c", None)
    col6 = f"{w_date}, {_fmt_temp(amb)} °С" if amb is not None else w_date
    col7 = (getattr(joint, "welding_type", None) or "").strip() or "н/п"
    col8 = (getattr(joint, "welding_materials", None) or "").strip() or "н/п"

    raw_preheat = (getattr(joint, "preheat_temp", None) or "").strip()
    try:
        ph_val = float(raw_preheat.replace(",", ".")) if raw_preheat else 0.0
    except ValueError:
        ph_val = 0.0
    if raw_preheat and ph_val > 0:
        clean_ph = raw_preheat if raw_preheat.startswith("+") else f"+{raw_preheat}"
        col9 = f"{clean_ph} °С"
    elif amb is not None and float(amb) <= 0:
        col9 = "+120…+150 °С"
    else:
        col9 = "н/п"

    col10 = _norm_gost_np(getattr(joint, "root_weld_control", None)) or "н/п"
    col11 = _norm_gost_np(getattr(joint, "steeloscopy_info", None)) or "н/п"
    col12 = _norm_gost_np(getattr(joint, "heat_treat_operator", None)) or "н/п"
    col13 = _norm_gost_np(getattr(joint, "heat_treat_diagram_number", None)) or "н/п"
    col14 = _norm_gost_np(getattr(joint, "hardness_test_info", None)) or "н/п"

    vik_res = _ev(getattr(joint, "vik_result", None))
    if vik_res and vik_res != ControlResultEnum.NOT_CONDUCTED.value:
        vik_rep = (getattr(joint, "vik_report_number", None) or "").strip()
        vik_d = _fmt_date(getattr(joint, "vik_date", None))
        col15 = f"{vik_res}{f', № {vik_rep}' if vik_rep else ''}{f', {vik_d}' if vik_d else ''}"
    else:
        col15 = "н/п"

    ndt_t = _ev(getattr(joint, "ndt_type", None))
    ndt_res = _ev(getattr(joint, "ndt_result", None))
    if (
        ndt_t
        and ndt_t != NdtMethodEnum.NOT_REQUIRED.value
        and ndt_res
        and ndt_res != ControlResultEnum.NOT_CONDUCTED.value
    ):
        ndt_rep = (getattr(joint, "ndt_report_number", None) or "").strip()
        ndt_d = _fmt_date(getattr(joint, "ndt_date", None))
        col16 = f"{ndt_t}, {ndt_res}{f', № {ndt_rep}' if ndt_rep else ''}{f', {ndt_d}' if ndt_d else ''}"
    else:
        col16 = "н/п"

    col17 = _norm_gost_np(getattr(joint, "ferrite_phase_info", None)) or "н/п"
    return [col1, col2, col3, col4, col5, col6, col7, col8, col9, col10, col11, col12, col13, col14, col15, col16, col17]


def format_sto_gazprom_row(
    seq_no: int,
    joint: Any,
    lrv_map: dict[tuple[str, str], Any] | None = None,
) -> list[str]:
    """Format all 49 normative columns per STO Gazprom 15-1.1-002-2023 Form G.1."""
    lrv_lookup = lrv_map or {}
    col1 = str(seq_no)
    col2 = _fmt_date(getattr(joint, "welding_date", None)) or "н/п"
    amb = getattr(joint, "ambient_temp_c", None)
    col3 = _fmt_temp(amb) or "н/п"

    d1 = getattr(joint, "elem1_diameter_mm", None) or getattr(joint, "diameter_mm", 0) or 0
    d2 = getattr(joint, "elem2_diameter_mm", None) or getattr(joint, "diameter_mm", 0) or 0
    col4 = f"{d1:g}\n{d2:g}"

    s1 = getattr(joint, "elem1_wall_thickness", None) or getattr(joint, "wall_thickness", 0) or 0
    s2 = getattr(joint, "elem2_wall_thickness", None) or getattr(joint, "wall_thickness", 0) or 0
    col5 = f"{s1:g}\n{s2:g}"

    rd_code = (getattr(joint, "rd_code", None) or "").strip()
    lrv1 = lrv_lookup.get((rd_code, (getattr(joint, "lrv1_code", None) or "").strip()))
    lrv2 = lrv_lookup.get((rd_code, (getattr(joint, "lrv2_code", None) or "").strip()))

    mfg1 = (getattr(joint, "elem1_manufacturer", None) or getattr(lrv1, "manufacturer", None) or "").strip()
    mfg2 = (getattr(joint, "elem2_manufacturer", None) or getattr(lrv2, "manufacturer", None) or "").strip()
    c6_1 = ", ".join([x for x in (getattr(joint, "elem1_ntd", ""), getattr(joint, "elem1_material", ""), mfg1) if x]) or "н/п"
    c6_2 = ", ".join([x for x in (getattr(joint, "elem2_ntd", ""), getattr(joint, "elem2_material", ""), mfg2) if x]) or "н/п"
    col6 = f"{c6_1}\n{c6_2}"

    raw_ph = (getattr(joint, "preheat_temp", None) or "").strip()
    try:
        ph_n = float(raw_ph.replace(",", ".")) if raw_ph else 0.0
    except ValueError:
        ph_n = 0.0
    col7 = (raw_ph if raw_ph.startswith("+") else f"+{raw_ph}") if raw_ph and ph_n > 0 else "н/п"

    name1 = (getattr(lrv1, "short_name", None) or getattr(joint, "elem1_name", None) or "н/п").strip()
    name2 = (getattr(lrv2, "short_name", None) or getattr(joint, "elem2_name", None) or "н/п").strip()
    col8 = f"{name1}\n{name2}"

    fac1 = (getattr(joint, "elem1_factory_number", None) or "").strip() or "н/п"
    fac2 = (getattr(joint, "elem2_factory_number", None) or "").strip() or "н/п"
    col9 = f"{fac1}\n{fac2}"

    len1 = (getattr(joint, "elem1_length", None) or "").strip() or "н/п"
    len2 = (getattr(joint, "elem2_length", None) or "").strip() or "н/п"
    col10 = f"{len1}\n{len2}"

    col11 = (getattr(joint, "line_number", None) or "").strip() or "н/п"
    col12 = (getattr(joint, "welding_type", None) or "").strip() or "н/п"
    col13 = (getattr(joint, "joint_number", None) or "").strip() or "н/п"

    is_ang = _is_angular_joint(joint)
    is_rep = bool(
        is_joint_defective(joint)
        or (getattr(joint, "repair_action", None) or "").strip() == "Ремонт"
        or getattr(joint, "repair_date", None) is not None
    )
    col14 = "Я / Р" if (is_ang and is_rep) else ("Я" if is_ang else ("Р" if is_rep else "н/п"))
    col15 = "н/п"
    col16 = (getattr(joint, "tech_card_number", None) or "").strip() or "н/п"

    raw_mats = (getattr(joint, "welding_materials", None) or "").strip()
    col17 = "\n".join(p.strip() for p in re.split(r"\s+/\s+|;\s*|\n+", raw_mats) if p.strip()) if raw_mats else "н/п"
    col18 = (getattr(joint, "welder_stamp", None) or "").strip() or "н/п"
    col19 = _extract_surname_only(getattr(joint, "responsible_person", None))
    col20 = ""

    not_cond = ControlResultEnum.NOT_CONDUCTED.value
    not_req = NdtMethodEnum.NOT_REQUIRED.value

    vik_res = _ev(getattr(joint, "vik_result", None))
    has_vik = bool(vik_res) and vik_res != not_cond
    col21 = (getattr(joint, "vik_report_number", None) or "").strip() if has_vik else "н/п"
    col22 = (_fmt_date(getattr(joint, "vik_date", None)) or "н/п") if has_vik else "н/п"
    col23 = vik_res if has_vik else "н/п"

    ndt_t = _ev(getattr(joint, "ndt_type", None))
    ndt_res = _ev(getattr(joint, "ndt_result", None))
    is_primary_rep = vik_res in ("Ремонт", "Вырезать") or ndt_res in ("Ремонт", "Вырезать")
    has_ndt = bool(ndt_t) and ndt_t != not_req and bool(ndt_res) and ndt_res != not_cond
    col24 = ndt_t if (ndt_t and ndt_t != not_req) else "н/п"
    col25 = (getattr(joint, "ndt_report_number", None) or "").strip() if has_ndt else "н/п"
    col26 = (_fmt_date(getattr(joint, "ndt_date", None)) or "н/п") if has_ndt else "н/п"
    col27 = ndt_res if has_ndt else "н/п"

    col28 = col29 = col30 = col31 = "н/п"
    dup_t = _ev(getattr(joint, "dup_ndt_type", None))
    dup_res = _ev(getattr(joint, "dup_ndt_result", None))
    if not is_primary_rep and dup_t and dup_t != not_req:
        col28 = dup_t
        if dup_res in ("Годен", "Ремонт", "Вырезать"):
            col29 = (getattr(joint, "dup_ndt_report_number", None) or "").strip()
            col30 = _fmt_date(getattr(joint, "dup_ndt_date", None)) or "н/п"
            col31 = "Ремонт" if dup_res == "Вырезать" else dup_res

    is_defect = is_joint_defective(joint)
    col32 = col33 = col34 = col35 = col36 = "н/п"
    col37 = ""
    if is_defect or getattr(joint, "repair_action", None) or getattr(joint, "repair_date", None):
        col32 = (getattr(joint, "repair_action", None) or "").strip() or (
            "Вырезано" if "Вырезать" in (ndt_res, vik_res, dup_res) else "Ремонт"
        )
        col33 = _fmt_date(getattr(joint, "repair_date", None) or getattr(joint, "ndt_date", None) or getattr(joint, "vik_date", None)) or "н/п"
        col34 = (getattr(joint, "repair_tech_card", None) or "").strip() or "н/п"
        col35 = (getattr(joint, "repair_welder_stamp", None) or col18 or "").strip() or "н/п"
        col36 = _extract_surname_only(getattr(joint, "repair_foreman", None) or getattr(joint, "responsible_person", None))

    col38 = col39 = col40 = col41 = col42 = col43 = col44 = col45 = col46 = col47 = col48 = "н/п"
    if is_defect or getattr(joint, "repair_action", None):
        rep_vik_r = _ev(getattr(joint, "repair_vik_result", None))
        if rep_vik_r and rep_vik_r != not_cond:
            col38 = (getattr(joint, "repair_vik_number", None) or "").strip()
            col39 = _fmt_date(getattr(joint, "repair_vik_date", None)) or "н/п"
            col40 = rep_vik_r if rep_vik_r in ("Годен", "Ремонт") else "н/п"

        rep_ndt_t = _ev(getattr(joint, "repair_ndt_type", None))
        rep_ndt_r = _ev(getattr(joint, "repair_ndt_result", None))
        if rep_ndt_t and rep_ndt_t != not_req and rep_ndt_r and rep_ndt_r != not_cond:
            col41 = rep_ndt_t
            col42 = (getattr(joint, "repair_ndt_number", None) or "").strip()
            col43 = _fmt_date(getattr(joint, "repair_ndt_date", None)) or "н/п"
            col44 = rep_ndt_r if rep_ndt_r in ("Годен", "Ремонт") else "н/п"

        rep_dup_t = _ev(getattr(joint, "repair_dup_ndt_type", None))
        rep_dup_r = _ev(getattr(joint, "repair_dup_ndt_result", None))
        if rep_dup_t and rep_dup_t != not_req and rep_dup_r and rep_dup_r != not_cond:
            col45 = rep_dup_t
            col46 = (getattr(joint, "repair_dup_ndt_number", None) or "").strip()
            col47 = _fmt_date(getattr(joint, "repair_dup_ndt_date", None)) or "н/п"
            col48 = rep_dup_r if rep_dup_r in ("Годен", "Ремонт") else "н/п"

    col49 = "н/п"
    return [
        col1, col2, col3, col4, col5, col6, col7, col8, col9, col10,
        col11, col12, col13, col14, col15, col16, col17, col18, col19, col20,
        col21, col22, col23, col24, col25, col26, col27, col28, col29, col30,
        col31, col32, col33, col34, col35, col36, col37, col38, col39, col40,
        col41, col42, col43, col44, col45, col46, col47, col48, col49,
    ]
