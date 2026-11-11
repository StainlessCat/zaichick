from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Any

from app.models.enums import ControlResultEnum


@dataclass(frozen=True, slots=True)
class PipeDnSpec:
    dn_mm: int
    dn_inch: str | None
    outer_diameter_mm: float | None


PIPE_DN_SPEC_TABLE: tuple[PipeDnSpec, ...] = (
    PipeDnSpec(10, '3/8"', 16),
    PipeDnSpec(15, '1/2"', 20),
    PipeDnSpec(20, '3/4"', 26),
    PipeDnSpec(25, '1"', 32),
    PipeDnSpec(32, '1 1/4"', 42),
    PipeDnSpec(40, '1 1/2"', 45),
    PipeDnSpec(50, '2"', 57),
    PipeDnSpec(65, '2 1/2"', 76),
    PipeDnSpec(80, '3"', 89),
    PipeDnSpec(90, '3 1/2"', 102),
    PipeDnSpec(100, '4"', 108),
    PipeDnSpec(125, '5"', 133),
    PipeDnSpec(150, '6"', 165),
    PipeDnSpec(160, '6 1/2"', 180),
    PipeDnSpec(175, '7"', None),
    PipeDnSpec(200, '8"', 219),
    PipeDnSpec(225, '9"', 245),
    PipeDnSpec(250, '10"', 273),
    PipeDnSpec(300, '12"', 325),
    PipeDnSpec(350, '14"', 377),
    PipeDnSpec(400, '16"', 426),
    PipeDnSpec(450, '18"', None),
    PipeDnSpec(500, '20"', 530),
    PipeDnSpec(600, '24"', 630),
    PipeDnSpec(700, '28"', 720),
    PipeDnSpec(800, '32"', 820),
    PipeDnSpec(900, '36"', 920),
    PipeDnSpec(1000, '40"', 1020),
    PipeDnSpec(1100, '44"', None),
    PipeDnSpec(1200, '48"', 1220),
    PipeDnSpec(1300, '52"', 1320),
    PipeDnSpec(1400, '56"', 1420),
    PipeDnSpec(1500, '60"', 1520),
    PipeDnSpec(1600, '64"', 1620),
    PipeDnSpec(1700, '68"', 1720),
    PipeDnSpec(1800, '72"', 1820),
    PipeDnSpec(1900, '76"', 1920),
    PipeDnSpec(2000, '80"', 2220),
    PipeDnSpec(2100, '88"', 2120),
    PipeDnSpec(2200, None, 2220),
    PipeDnSpec(2300, None, 2320),
    PipeDnSpec(2400, None, 2420),
    PipeDnSpec(2500, None, 2520),
    PipeDnSpec(2600, None, 2620),
    PipeDnSpec(2700, None, 2720),
    PipeDnSpec(2800, None, 2820),
    PipeDnSpec(2900, None, 2920),
    PipeDnSpec(3000, None, 3000),
)

DN_TO_INCH_MAP: dict[int, str] = {
    rec.dn_mm: rec.dn_inch for rec in PIPE_DN_SPEC_TABLE if rec.dn_inch is not None
}

_OUTER_TO_INCH_MAP: dict[float, str] = {
    16: '3/8"',
    20: '1/2"',
    26: '3/4"',
    32: '1"',
    42: '1 1/4"',
    45: '1 1/2"',
    57: '2"',
    76: '2 1/2"',
    89: '3"',
    102: '3 1/2"',
    108: '4"',
    133: '5"',
    165: '6"',
    180: '6 1/2"',
    219: '8"',
    245: '9"',
    273: '10"',
    325: '12"',
    377: '14"',
    426: '16"',
    530: '20"',
    630: '24"',
    720: '28"',
    820: '32"',
    920: '36"',
    1020: '40"',
    1220: '48"',
    1320: '52"',
    1420: '56"',
    1520: '60"',
    1620: '64"',
    1720: '68"',
    1820: '72"',
    1920: '76"',
    2020: '80"',
    2120: '88"',
    2220: '80"',
    14: '3/8"',
    18: '1/2"',
    21.3: '1/2"',
    22: '1/2"',
    25: '3/4"',
    26.9: '3/4"',
    28: '3/4"',
    33.7: '1"',
    38: '1 1/4"',
    42.4: '1 1/4"',
    48.3: '1 1/2"',
    60.3: '2"',
    114: '4"',
    140: '5"',
    159: '6"',
    168: '6"',
}

_LEGACY_OUTER_TO_DN: dict[float, int] = {
    14: 10,
    18: 15,
    21.3: 15,
    22: 15,
    25: 20,
    26.9: 20,
    28: 20,
    33.7: 25,
    38: 32,
    42.4: 32,
    48.3: 40,
    60.3: 50,
    114: 100,
    140: 125,
    159: 150,
    168: 150,
    2020: 2000,
}


def mm_to_nominal_bore_dn(diameter_mm: float | None) -> int | None:
    if not diameter_mm or diameter_mm <= 0:
        return None
    d = float(diameter_mm)
    for rec in PIPE_DN_SPEC_TABLE:
        if rec.outer_diameter_mm is not None and abs(rec.outer_diameter_mm - d) < 1.5:
            return rec.dn_mm
    for outer, dn in _LEGACY_OUTER_TO_DN.items():
        if abs(outer - d) < 1.5:
            return dn
    candidates = [r for r in PIPE_DN_SPEC_TABLE if r.outer_diameter_mm is not None]
    best = min(candidates, key=lambda r: abs((r.outer_diameter_mm or 0.0) - d))
    return best.dn_mm


def mm_to_inch_diameter(diameter_mm: float | None) -> str:
    if not diameter_mm or diameter_mm <= 0 or math.isnan(diameter_mm):
        return ""
    d = float(diameter_mm)
    if d in _OUTER_TO_INCH_MAP:
        return _OUTER_TO_INCH_MAP[d]
    rounded = round(d)
    if float(rounded) in _OUTER_TO_INCH_MAP:
        return _OUTER_TO_INCH_MAP[float(rounded)]
    dn = mm_to_nominal_bore_dn(d)
    if dn and dn in DN_TO_INCH_MAP:
        return DN_TO_INCH_MAP[dn]
    approx = max(0.5, round((d / 25.4) * 2) / 2)
    return f'{approx}"'


def get_epc_wall_thickness_factor(wall_thickness_mm: float | None) -> float:
    """EPC Method A K_wall factor matching src/utils/pipeCalc.ts."""
    s = float(wall_thickness_mm or 0.0)
    if s <= 10.0:
        return 1.0
    if s <= 15.0:
        return 1.35
    if s <= 20.0:
        return 1.75
    if s <= 26.0:
        return 2.3
    if s <= 35.0:
        return 2.8
    if s <= 50.0:
        return 3.5
    return 4.5


def inch_string_to_numeric(inch_str: str | float | int | None) -> float:
    if inch_str is None or inch_str == "":
        return 0.0
    if isinstance(inch_str, (int, float)):
        return 0.0 if math.isnan(float(inch_str)) else float(inch_str)
    clean = str(inch_str).replace('"', "").strip()
    if not clean:
        return 0.0

    mixed = re.match(r"^(\d+)\s+(\d+)/(\d+)$", clean)
    if mixed:
        whole, num, den = int(mixed.group(1)), int(mixed.group(2)), int(mixed.group(3))
        if den != 0:
            return round((whole + num / den) * 1000) / 1000

    frac = re.match(r"^(\d+)/(\d+)$", clean)
    if frac:
        num, den = int(frac.group(1)), int(frac.group(2))
        if den != 0:
            return round((num / den) * 1000) / 1000

    try:
        return float(clean.replace(",", "."))
    except ValueError:
        return 0.0


def calculate_equivalent_dia_inch(
    diameter_mm_or_inches: float | str, wall_thickness_mm: float
) -> float:
    """Equivalent Dia-Inch (Method A / EDI): EDI = D_inch * K_wall(S)."""
    if isinstance(diameter_mm_or_inches, (int, float)):
        d_inch = inch_string_to_numeric(mm_to_inch_diameter(float(diameter_mm_or_inches)))
    else:
        d_inch = inch_string_to_numeric(diameter_mm_or_inches)
    k = get_epc_wall_thickness_factor(wall_thickness_mm)
    return round(d_inch * k * 100) / 100


def detect_lrv_element_type(short_name: str | None) -> str:
    s = (short_name or "").lower()
    if "труб" in s:
        return "Труба"
    if "отвод" in s:
        return "Отвод"
    if "переход" in s:
        return "Переход"
    if "тройник" in s:
        return "Тройник"
    if any(
        kw in s
        for kw in (
            "кран",
            "задвижк",
            "клапан",
            "вентиль",
            "заслонк",
            "затвор",
            "переключающ",
            "фильтр",
            "регулятор",
            "арматур",
        )
    ):
        return "ЗРА"
    if "флан" in s:
        return "Фланец"
    if "заглуш" in s or "днищ" in s:
        return "Заглушка"
    return "Прочее"


def get_max_weld_ends_for_element(element_name: str | None) -> int:
    cat = detect_lrv_element_type(element_name)
    if cat in ("Фланец", "Заглушка"):
        return 1
    if cat == "Тройник":
        return 3
    return 2


def get_steel_class(grade: str | None) -> str:
    s = (grade or "").upper().strip()
    if any(k in s for k in ("Х18", "Х17", "12Х18Н10Т", "08Х18Н10Т", "10Х17Н13М2Т", "AISI")):
        return "stainless"
    if any(k in s for k in ("09Г2С", "20", "17Г1С", "10Г2ФБЮ", "13ХФА", "СТ3")):
        return "carbon_low_alloy"
    return "other"


@dataclass(frozen=True, slots=True)
class PreheatValidationResult:
    is_valid: bool
    required_min_c: float
    actual_c: float | None
    rule_label: str
    message: str


def validate_preheat_temperature(
    preheat_temp_str: str | None,
    ambient_temp_c: float | None,
    tech_card_number: str | None,
    preheat_rules: list[Any] | None,
) -> PreheatValidationResult:
    if not preheat_rules:
        return PreheatValidationResult(
            is_valid=True,
            required_min_c=0.0,
            actual_c=None,
            rule_label="ТК не выбрана",
            message="Выберите технологическую карту для проверки режима подогрева",
        )

    ambient_c = float(ambient_temp_c) if ambient_temp_c is not None else 0.0
    matched_rule = None
    for r in preheat_rules:
        r_min = float(r.ambient_min_c)
        r_max = float(r.ambient_max_c)
        if r_min <= ambient_c <= r_max:
            matched_rule = r
            break
    if matched_rule is None:
        matched_rule = (
            preheat_rules[0]
            if ambient_c < float(preheat_rules[0].ambient_min_c)
            else preheat_rules[-1]
        )

    required_min = float(matched_rule.min_preheat_temp_c)
    raw = (preheat_temp_str or "").strip()
    actual_c: float | None = None
    if raw and raw.lower() != "н/п":
        try:
            actual_c = float(raw.replace(",", "."))
        except ValueError:
            actual_c = None

    amb_label = f"+{ambient_c:g}" if ambient_c > 0 else f"{ambient_c:g}"
    tc_label = tech_card_number or "ТК"

    if required_min <= 0:
        return PreheatValidationResult(
            is_valid=True,
            required_min_c=0.0,
            actual_c=actual_c,
            rule_label=matched_rule.condition_label,
            message=(
                f"По {tc_label} при T возд. {amb_label} °C предварительный подогрев не требуется."
            ),
        )

    if actual_c is None:
        return PreheatValidationResult(
            is_valid=False,
            required_min_c=required_min,
            actual_c=None,
            rule_label=matched_rule.condition_label,
            message=(
                f"Требуется указать температуру подогрева: по {tc_label} при T возд. "
                f"{amb_label} °C минимальный подогрев ≥ +{required_min:g} °C."
            ),
        )

    if actual_c < required_min:
        return PreheatValidationResult(
            is_valid=False,
            required_min_c=required_min,
            actual_c=actual_c,
            rule_label=matched_rule.condition_label,
            message=(
                f"Несоответствие ТК ({tc_label}): при T возд. {amb_label} °C требуется подогрев "
                f"не менее +{required_min:g} °C (указано: +{actual_c:g} °C)."
            ),
        )

    return PreheatValidationResult(
        is_valid=True,
        required_min_c=required_min,
        actual_c=actual_c,
        rule_label=matched_rule.condition_label,
        message=(
            f"Соответствует {tc_label}: подогрев +{actual_c:g} °C ≥ нормы +{required_min:g} °C."
        ),
    )


def _result_val(value: ControlResultEnum | str | None) -> str:
    if value is None:
        return ""
    return value.value if isinstance(value, ControlResultEnum) else str(value)


def is_second_repair_forbidden(joint: Any) -> bool:
    """STO Gazprom 15-1.1-002-2023 p. 11.4 / GOST 32569-2013: forbid repeat repair after defect."""
    repair_count = getattr(joint, "repair_count", 0) or 0
    if repair_count >= 2:
        return True
    had_first_repair = bool(
        getattr(joint, "repair_date", None)
        or getattr(joint, "repair_tech_card", None)
        or getattr(joint, "repair_welder_stamp", None)
        or getattr(joint, "repair_action", None) == "Ремонт"
        or repair_count >= 1
    )
    if not had_first_repair:
        return False

    bad_outcomes = {ControlResultEnum.REPAIR.value, ControlResultEnum.CUT_OUT.value}
    return any(
        _result_val(getattr(joint, attr, None)) in bad_outcomes
        for attr in ("repair_vik_result", "repair_ndt_result", "repair_dup_ndt_result")
    )
