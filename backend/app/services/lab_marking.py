"""
Изолированный расчёт «Маркировки стыка» и автонумерации заключений
исключительно для модуля «Лаборатория НК» и серверного экспорта ЛНК.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

LAB_DIAMETER_CODE_TABLE: tuple[tuple[str, str], ...] = (
    ("1820", "АБ"),
    ("1720", "АА"),
    ("1420", "А"),
    ("1220", "Б"),
    ("1219", "БА"),
    ("1020", "В"),
    ("820", "Г"),
    ("812.8", "ГА"),
    ("720", "Д"),
    ("711.2", "ДА"),
    ("630", "Е"),
    ("530", "Ж"),
    ("508", "ЖА"),
    ("426", "И"),
    ("406.4", "ИА"),
    ("377", "КА"),
    ("325", "К"),
    ("323.9", "КБ"),
    ("315", "КВ"),
    ("273", "ЛА"),
    ("225", "ЛБ"),
    ("219.1", "ЛВ"),
    ("219", "Л"),
    ("200", "ЛГ"),
    ("180", "ЛД"),
    ("168.3", "М"),
    ("160", "МА"),
    ("159", "Н"),
    ("133", "НА"),
    ("114.3", "П"),
    ("114", "ПА"),
    ("112", "ПБ"),
    ("110", "СА"),
    ("108", "С"),
    ("95", "СБ"),
    ("89", "Т"),
    ("76", "ТА"),
    ("63", "ТБ"),
    ("60.3", "У"),
    ("60", "УА"),
    ("57", "Ф"),
    ("50", "ФА"),
    ("45", "ФБ"),
    ("44", "ФВ"),
    ("43", "ФГ"),
    ("40", "ФД"),
    ("38", "ФЕ"),
    ("35", "ФК"),
    ("34", "ФЛ"),
    ("32", "Х"),
    ("28", "ХА"),
    ("25", "Ц"),
    ("22", "Ч"),
    ("20", "ЧА"),
    ("19", "ЧБ"),
    ("18", "Ш"),
    ("15", "ША"),
    ("14", "Ю"),
    ("12", "ЮА"),
    ("врезка", "Я"),
)

LAB_DIAMETER_CODE_MAP: dict[str, str] = dict(LAB_DIAMETER_CODE_TABLE)

LAB_WELDING_TYPE_CODE_TABLE: tuple[tuple[str, str], ...] = (
    ("РД", "1"),
    ("РАД", "2"),
    ("РАД+РД", "21"),
    ("МП", "3"),
    ("ААД", "4"),
    ("МПС", "5"),
    ("АПГ", "6"),
    ("АПИ", "7"),
    ("АФ", "8"),
    ("Л", "9"),
)

LAB_WELDING_TYPE_CODE_MAP: dict[str, str] = dict(LAB_WELDING_TYPE_CODE_TABLE)


@dataclass(frozen=True)
class LabMarkingResult:
    marking: str
    is_complete: bool
    missing_parts: tuple[str, ...]
    short_rd_code: str
    line_number: str
    diameter_code: Optional[str]
    welding_code: Optional[str]
    joint_number: str
    is_branch: bool


def extract_short_rd_code(rd_code: Optional[str]) -> str:
    """Извлекает правую подстроку после последней точки в шифре РД."""
    trimmed = (rd_code or "").strip()
    if not trimmed:
        return ""
    last_dot = trimmed.rfind(".")
    if last_dot >= 0:
        tail = trimmed[last_dot + 1 :].strip()
        if tail:
            return tail
        return trimmed[:last_dot].strip()
    return trimmed


def normalize_diameter_key(diameter_mm: Optional[object]) -> Optional[str]:
    """Нормализует диаметр без искажения дробных значений (159.0 -> '159', '219,10' -> '219.1')."""
    if diameter_mm is None:
        return None
    raw = str(diameter_mm).strip().replace(",", ".")
    if not raw:
        return None
    if raw.lower() == "врезка":
        return "врезка"
    try:
        num = float(raw)
    except ValueError:
        return None
    if num <= 0:
        return None
    rounded = round(num, 3)
    if rounded.is_integer():
        return str(int(rounded))
    return format(rounded, "g")


def resolve_diameter_letter_code(
    diameter_mm: Optional[object] = None,
    joint_kind: Optional[str] = None,
    gost_joint_type: Optional[str] = None,
) -> tuple[Optional[str], bool]:
    """Возвращает (код диаметра, признак врезки/углового)."""
    kind_norm = (joint_kind or "").strip().lower()
    gost_norm = (gost_joint_type or "").strip().upper()
    if kind_norm == "угловое" or gost_norm.startswith("У"):
        return ("Я", True)

    key = normalize_diameter_key(diameter_mm)
    if not key:
        return (None, False)
    return (LAB_DIAMETER_CODE_MAP.get(key), key == "врезка")


def resolve_welding_type_code(welding_type: Optional[str]) -> Optional[str]:
    """Возвращает цифровой код вида сварки с нормализацией пробелов вокруг '+'."""
    normalized = re.sub(r"\s*\+\s*", "+", (welding_type or "").strip().upper())
    if not normalized:
        return None
    return LAB_WELDING_TYPE_CODE_MAP.get(normalized)


def format_joint_number_for_marking(joint_number: Optional[str]) -> str:
    raw = (joint_number or "").strip()
    if not raw:
        return ""
    if raw.isdigit() and len(raw) < 3:
        return raw.zfill(3)
    return raw


def build_joint_lab_marking(
    *,
    rd_code: Optional[str],
    line_number: Optional[str],
    diameter_mm: Optional[object],
    joint_kind: Optional[str] = None,
    gost_joint_type: Optional[str] = None,
    welding_type: Optional[str] = None,
    joint_number: Optional[str] = None,
) -> LabMarkingResult:
    short_rd = extract_short_rd_code(rd_code)
    clean_line = (line_number or "").strip()
    diam_code, is_branch = resolve_diameter_letter_code(
        diameter_mm=diameter_mm,
        joint_kind=joint_kind,
        gost_joint_type=gost_joint_type,
    )
    weld_code = resolve_welding_type_code(welding_type)
    clean_joint = format_joint_number_for_marking(joint_number)

    missing: list[str] = []
    if not short_rd:
        missing.append("шифр РД")
    if not clean_line:
        missing.append("линия")
    if not diam_code:
        missing.append("код диаметра")
    if not weld_code:
        missing.append("код вида сварки")
    if not clean_joint:
        missing.append("номер стыка")

    marking = "-".join(
        [
            short_rd or "?",
            clean_line or "?",
            diam_code or "?",
            weld_code or "?",
            clean_joint or "?",
        ]
    )
    return LabMarkingResult(
        marking=marking,
        is_complete=len(missing) == 0,
        missing_parts=tuple(missing),
        short_rd_code=short_rd,
        line_number=clean_line,
        diameter_code=diam_code,
        welding_code=weld_code,
        joint_number=clean_joint,
        is_branch=is_branch,
    )


def build_lab_conclusion_number(
    method: str,
    marking: str,
    stage: str = "primary",
    repair_index: int = 1,
) -> str:
    clean_method = (method or "").strip().upper()
    clean_marking = (marking or "").strip()
    if not clean_method or not clean_marking:
        return ""
    base = f"{clean_method}-{clean_marking}"
    if stage == "repair":
        idx = repair_index if repair_index >= 1 else 1
        return f"{base}-Р{idx}"
    if stage == "duplicate":
        return f"{base}-Д"
    return base
