from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import date
from typing import Any

from app.models.enums import ControlResultEnum, NdtMethodEnum
from app.services.pipe_calc import (
    detect_lrv_element_type,
    get_max_weld_ends_for_element,
    get_steel_class,
    is_second_repair_forbidden,
    validate_preheat_temperature,
)


@dataclass(frozen=True, slots=True)
class ValidationIssue:
    id: str
    category: str  # 'chronology' | 'tech' | 'ndt' | 'referential' | 'boundary'
    severity: str  # 'error' | 'warning'
    field: str | None
    title: str
    message: str


@dataclass(frozen=True, slots=True)
class JointValidationSummary:
    is_valid_to_save: bool
    errors: list[ValidationIssue]
    warnings: list[ValidationIssue]
    all_issues: list[ValidationIssue]


def normalize_stamp(stamp: str | None) -> str:
    return re.sub(r"\s+", "", (stamp or "")).upper()


def parse_stamps(welder_stamp: str | None, welder_stamps_list: list[str] | None) -> list[str]:
    if welder_stamps_list:
        return [s.strip() for s in welder_stamps_list if s and s.strip()]
    if welder_stamp:
        return [s.strip() for s in re.split(r"[,;/+]+", welder_stamp) if s and s.strip()]
    return []


def _parse_decimal(val: Any) -> float | None:
    if val is None or val == "":
        return None
    if isinstance(val, (int, float)):
        f = float(val)
        return None if math.isnan(f) else f
    clean = str(val).strip().replace(",", ".")
    if not clean:
        return None
    try:
        return float(clean)
    except ValueError:
        return None


def _enum_str(val: Any) -> str:
    if val is None:
        return ""
    return val.value if hasattr(val, "value") else str(val)


def _fmt_date(d: date | None) -> str:
    return d.strftime("%d.%m.%y") if d else ""


def extract_rd_suffix(rd_code: str) -> str:
    trimmed = (rd_code or "").strip()
    if not trimmed:
        return ""
    last_dot = trimmed.rfind(".")
    if last_dot == -1:
        return trimmed
    tail = trimmed[last_dot + 1 :].strip()
    prefix = trimmed[:last_dot].strip()
    if prefix.endswith("045.0077") and "0092.049" in prefix:
        return tail
    tokens = [t for t in re.split(r"[.\s/]+", prefix) if t]
    ignored = {"0092", "049", "р", "13", "1", "0004", "045", "0077"}
    distinctive = "-".join([t for t in tokens if t.lower() not in ignored][-2:])
    return f"{distinctive}-{tail}" if distinctive else tail


def build_unique_line_id(rd_code: str, line_number: str) -> str:
    suffix = extract_rd_suffix(rd_code)
    clean_line = (line_number or "").strip()
    if not suffix and not clean_line:
        return ""
    if not suffix:
        return clean_line
    if not clean_line:
        return suffix
    return f"{suffix}-{clean_line}"


def check_welder_method_compliance(welder: Any, welding_type: str | None) -> bool:
    weld_method = (welding_type or "").strip()
    if not weld_method:
        return True
    allowed = list(getattr(welder, "allowed_methods", None) or [])
    if not allowed:
        return True
    if weld_method in allowed:
        return True
    if weld_method == "РАД+РД":
        return "РАД+РД" in allowed or ("РАД" in allowed and "РД" in allowed)
    if weld_method in ("РАД", "РД") and "РАД+РД" in allowed:
        return True
    return False


def validate_welder_naks_attestation(
    welder: Any,
    *,
    diameter_mm: float,
    wall_thickness: float,
    welding_type: str | None = None,
    steel_group: str | None = None,
) -> list[ValidationIssue]:
    """Validate NAKS scope (diameter, wall thickness, steel group, welding method)."""
    issues: list[ValidationIssue] = []
    if welder is None:
        return issues

    area = getattr(welder, "attestation_area", "") or ""
    naks_certs = list(getattr(welder, "naks_certs", None) or [])
    weld_method = (welding_type or "").strip()

    specific_cert = None
    if weld_method and naks_certs:
        for cert in naks_certs:
            cw = _enum_str(getattr(cert, "welding_type", None))
            if cw == weld_method or (weld_method in ("РАД", "РД") and cw == "РАД+РД"):
                specific_cert = cert
                break

    stamp = getattr(welder, "stamp", "")

    # 1. Diameter bounds
    min_d = (
        getattr(specific_cert, "min_diameter_mm", None)
        if specific_cert and getattr(specific_cert, "min_diameter_mm", None) is not None
        else getattr(welder, "min_diameter_mm", None)
    )
    max_d = (
        getattr(specific_cert, "max_diameter_mm", None)
        if specific_cert and getattr(specific_cert, "max_diameter_mm", None) is not None
        else getattr(welder, "max_diameter_mm", None)
    )
    if min_d is None or max_d is None:
        d_match = re.search(r"Ø\s*(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)", area, re.IGNORECASE)
        if d_match:
            min_d, max_d = float(d_match.group(1)), float(d_match.group(2))

    if min_d is not None and max_d is not None and diameter_mm > 0:
        if diameter_mm < float(min_d) or diameter_mm > float(max_d):
            issues.append(
                ValidationIssue(
                    id=f"naks-diam-{stamp}",
                    category="tech",
                    severity="warning",
                    field="welder_stamp",
                    title=f"Диаметр вне области аттестации НАКС ({stamp})",
                    message=(
                        f"Диаметр стыка Ø{diameter_mm:g} мм выходит за границы аттестации "
                        f"НАКС сварщика {stamp} (Ø{min_d:g}–{max_d:g} мм)."
                    ),
                )
            )

    # 2. Wall thickness bounds
    min_s = (
        getattr(specific_cert, "min_wall_thickness_mm", None)
        if specific_cert and getattr(specific_cert, "min_wall_thickness_mm", None) is not None
        else getattr(welder, "min_wall_thickness_mm", None)
    )
    max_s = (
        getattr(specific_cert, "max_wall_thickness_mm", None)
        if specific_cert and getattr(specific_cert, "max_wall_thickness_mm", None) is not None
        else getattr(welder, "max_wall_thickness_mm", None)
    )
    if min_s is None or max_s is None:
        s_match = re.search(r"S\s*(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)", area, re.IGNORECASE)
        if s_match:
            min_s, max_s = float(s_match.group(1)), float(s_match.group(2))

    if min_s is not None and max_s is not None and wall_thickness > 0:
        if wall_thickness < float(min_s) or wall_thickness > float(max_s):
            issues.append(
                ValidationIssue(
                    id=f"naks-wall-{stamp}",
                    category="tech",
                    severity="warning",
                    field="welder_stamp",
                    title=f"Толщина стенки вне области аттестации НАКС ({stamp})",
                    message=(
                        f"Толщина стенки S{wall_thickness:g} мм выходит за границы аттестации "
                        f"НАКС сварщика {stamp} (S{min_s:g}–{max_s:g} мм)."
                    ),
                )
            )

    # 3. Steel group scope
    joint_steel = (steel_group or "").upper().strip()
    if joint_steel:
        raw_groups = (
            getattr(specific_cert, "steel_groups", None)
            if specific_cert and getattr(specific_cert, "steel_groups", None)
            else getattr(welder, "steel_groups", None)
            or re.findall(r"[МM]\d{2}", area, re.IGNORECASE)
        )
        allowed_groups = [str(g).upper().strip() for g in raw_groups if g]
        if allowed_groups:
            if not any(g in joint_steel or joint_steel in g for g in allowed_groups):
                issues.append(
                    ValidationIssue(
                        id=f"naks-steel-{stamp}",
                        category="tech",
                        severity="warning",
                        field="welder_stamp",
                        title=f"Группа стали вне области НАКС ({stamp})",
                        message=(
                            f"Группа стали стыка ({steel_group}) не входит в аттестованные "
                            f"группы сварщика {stamp} ({', '.join(allowed_groups)})."
                        ),
                    )
                )

    return issues


def validate_weld_joint_comprehensive(
    *,
    joint: Any,
    all_joints: list[Any],
    matched_line: Any | None = None,
    lrv_catalog: list[Any] | None = None,
    welders: list[Any] | None = None,
    tech_cards: list[Any] | None = None,
    welding_materials: list[Any] | None = None,
    max_allowed_year: int = 2027,
) -> JointValidationSummary:
    """
    Python port of validateWeldJointComprehensive (Blocks 1-5):
    chronology, NAKS certs/methods/scope, WPS & preheat, LRV quotas, STO repair rules,
    NDT/VIK rules, duplicate number check, factory ends, and geometric/physical boundaries.
    """
    issues: list[ValidationIssue] = []
    lrv_catalog = lrv_catalog or []
    welders = welders or []
    tech_cards = tech_cards or []
    welding_materials = welding_materials or []

    diam = float(getattr(joint, "diameter_mm", 0) or 0)
    wall = float(getattr(joint, "wall_thickness", 0) or 0)
    elem1_wall = float(getattr(joint, "elem1_wall_thickness", None) or wall)
    elem2_wall = float(getattr(joint, "elem2_wall_thickness", None) or wall)

    # BLOCK 5: Boundary checks
    if diam < 10 or diam > 2520:
        issues.append(
            ValidationIssue(
                id="bnd-diam-range",
                category="boundary",
                severity="error",
                field="diameter_mm",
                title="Недопустимый диаметр стыка",
                message=f"Диаметр стыка ({diam:g} мм) выходит за допустимые пределы (10…2520 мм).",
            )
        )

    if wall < 1.0 or wall > 150.0:
        issues.append(
            ValidationIssue(
                id="bnd-wall-range",
                category="boundary",
                severity="error",
                field="wall_thickness",
                title="Недопустимая толщина стенки",
                message=f"Толщина стенки ({wall:g} мм) должна быть в диапазоне от 1.0 до 150.0 мм.",
            )
        )
    elif diam > 0 and wall >= diam / 2:
        issues.append(
            ValidationIssue(
                id="bnd-wall-vs-diam",
                category="boundary",
                severity="error",
                field="wall_thickness",
                title="Физически невозможная геометрия трубы",
                message=(
                    f"Толщина стенки ({wall:g} мм) не может быть больше или равна половине "
                    f"наружного диаметра ({diam / 2:g} мм)."
                ),
            )
        )

    len1_raw = getattr(joint, "elem1_length", None)
    len1_num = _parse_decimal(len1_raw)
    if len1_raw and str(len1_raw).strip() != "":
        if len1_num is None or len1_num <= 0 or len1_num > 36.0:
            issues.append(
                ValidationIssue(
                    id="bnd-len1",
                    category="boundary",
                    severity="error",
                    field="elem1_length",
                    title="Некорректная длина Элемента 1",
                    message=f"Длина Элемента 1 («{len1_raw}» м) должна быть числом от 0.01 до 36.0 м.",
                )
            )

    len2_raw = getattr(joint, "elem2_length", None)
    len2_num = _parse_decimal(len2_raw)
    if len2_raw and str(len2_raw).strip() != "":
        if len2_num is None or len2_num <= 0 or len2_num > 36.0:
            issues.append(
                ValidationIssue(
                    id="bnd-len2",
                    category="boundary",
                    severity="error",
                    field="elem2_length",
                    title="Некорректная длина Элемента 2",
                    message=f"Длина Элемента 2 («{len2_raw}» м) должна быть числом от 0.01 до 36.0 м.",
                )
            )

    amb_num = getattr(joint, "ambient_temp_c", None)
    if amb_num is not None and (float(amb_num) < -65 or float(amb_num) > 60):
        issues.append(
            ValidationIssue(
                id="bnd-amb-temp",
                category="boundary",
                severity="error",
                field="ambient_temp_c",
                title="Экстремальная температура воздуха",
                message=(
                    f"Температура окружающего воздуха ({amb_num} °C) выходит за пределы "
                    "климатических норм (-65…+60 °C)."
                ),
            )
        )

    preheat_raw = getattr(joint, "preheat_temp", None)
    if preheat_raw and str(preheat_raw).strip() != "" and str(preheat_raw).strip().lower() != "н/п":
        preheat_num = _parse_decimal(preheat_raw)
        if preheat_num is None or preheat_num < 0 or preheat_num > 450:
            issues.append(
                ValidationIssue(
                    id="bnd-preheat-temp",
                    category="boundary",
                    severity="error",
                    field="preheat_temp",
                    title="Недопустимая температура подогрева",
                    message=(
                        f"Температура подогрева («{preheat_raw}» °C) должна находиться "
                        "в пределах от 0 до +450 °C или 'н/п'."
                    ),
                )
            )

    # BLOCK 1: Chronology, NAKS expiry/method/scope, materials QC
    w_date: date | None = getattr(joint, "welding_date", None)
    v_date: date | None = getattr(joint, "vik_date", None)
    n_date: date | None = getattr(joint, "ndt_date", None)
    d_date: date | None = getattr(joint, "dup_ndt_date", None)

    for label, dt in (
        ("Дата сварки", w_date),
        ("Дата ВИК", v_date),
        ("Дата НК", n_date),
        ("Дата дублирующего НК", d_date),
    ):
        if dt and dt.year > max_allowed_year:
            issues.append(
                ValidationIssue(
                    id=f"chr-future-{label}",
                    category="chronology",
                    severity="warning",
                    field=None,
                    title="Подозрительная дата из будущего",
                    message=f"{label} ({_fmt_date(dt)}) превышает горизонт {max_allowed_year} г.",
                )
            )

    vik_res = _enum_str(getattr(joint, "vik_result", ControlResultEnum.NOT_CONDUCTED))
    ndt_type = _enum_str(getattr(joint, "ndt_type", NdtMethodEnum.NOT_REQUIRED))
    ndt_res = _enum_str(getattr(joint, "ndt_result", ControlResultEnum.NOT_CONDUCTED))
    dup_type = _enum_str(getattr(joint, "dup_ndt_type", NdtMethodEnum.NOT_REQUIRED))
    dup_res = _enum_str(getattr(joint, "dup_ndt_result", ControlResultEnum.NOT_CONDUCTED))

    if w_date and v_date and vik_res != ControlResultEnum.NOT_CONDUCTED.value and v_date < w_date:
        issues.append(
            ValidationIssue(
                id="chr-vik-before-weld",
                category="chronology",
                severity="warning",
                field="vik_date",
                title="Нарушение хронологии: ВИК раньше сварки",
                message=f"Дата ВИК ({_fmt_date(v_date)}) раньше даты сварки ({_fmt_date(w_date)}).",
            )
        )

    if (
        v_date
        and n_date
        and ndt_type != NdtMethodEnum.NOT_REQUIRED.value
        and ndt_res != ControlResultEnum.NOT_CONDUCTED.value
        and n_date < v_date
    ):
        issues.append(
            ValidationIssue(
                id="chr-ndt-before-vik",
                category="chronology",
                severity="warning",
                field="ndt_date",
                title="Нарушение хронологии: НК раньше ВИК",
                message=f"Дата НК ({_fmt_date(n_date)}) раньше даты ВИК ({_fmt_date(v_date)}).",
            )
        )
    elif (
        w_date
        and n_date
        and ndt_type != NdtMethodEnum.NOT_REQUIRED.value
        and ndt_res != ControlResultEnum.NOT_CONDUCTED.value
        and n_date < w_date
    ):
        issues.append(
            ValidationIssue(
                id="chr-ndt-before-weld",
                category="chronology",
                severity="warning",
                field="ndt_date",
                title="Нарушение хронологии: НК раньше сварки",
                message=f"Дата НК ({_fmt_date(n_date)}) раньше даты сварки ({_fmt_date(w_date)}).",
            )
        )

    if (
        n_date
        and d_date
        and dup_type != NdtMethodEnum.NOT_REQUIRED.value
        and dup_res != ControlResultEnum.NOT_CONDUCTED.value
        and d_date < n_date
    ):
        issues.append(
            ValidationIssue(
                id="chr-dup-before-ndt",
                category="chronology",
                severity="warning",
                field="dup_ndt_date",
                title="Нарушение хронологии: Дублирующий НК раньше первичного НК",
                message=(
                    f"Дата дублирующего контроля ({_fmt_date(d_date)}) раньше даты "
                    f"первичного НК ({_fmt_date(n_date)})."
                ),
            )
        )

    welding_type = (getattr(joint, "welding_type", "") or "").strip()
    active_stamps = parse_stamps(
        getattr(joint, "welder_stamp", None), getattr(joint, "welder_stamps_list", None)
    )
    selected_tc = next(
        (tc for tc in tech_cards if tc.number == getattr(joint, "tech_card_number", "")),
        None,
    )

    for stamp in active_stamps:
        welder = next(
            (w for w in welders if normalize_stamp(w.stamp) == normalize_stamp(stamp)),
            None,
        )
        if welder is None:
            continue

        exp_date = getattr(welder, "cert_expiry_date", None)
        if w_date and exp_date and w_date > exp_date:
            issues.append(
                ValidationIssue(
                    id=f"chr-naks-expired-{stamp}",
                    category="chronology",
                    severity="error",
                    field="welder_stamp",
                    title=f"Истек срок удостоверения НАКС ({welder.stamp})",
                    message=(
                        f"На дату сварки ({_fmt_date(w_date)}) срок действия НАКС № "
                        f"{welder.cert_number} сварщика {welder.full_name} истёк ({_fmt_date(exp_date)})."
                    ),
                )
            )

        iss_date = getattr(welder, "cert_issue_date", None)
        if w_date and iss_date and w_date < iss_date:
            issues.append(
                ValidationIssue(
                    id=f"chr-naks-not-issued-{stamp}",
                    category="chronology",
                    severity="error",
                    field="welder_stamp",
                    title=f"Дата сварки раньше выдачи НАКС ({welder.stamp})",
                    message=(
                        f"Дата сварки ({_fmt_date(w_date)}) раньше даты выдачи НАКС № "
                        f"{welder.cert_number} ({_fmt_date(iss_date)})."
                    ),
                )
            )

        adm_date = getattr(welder, "admission_sheet_date", None)
        if w_date and adm_date and w_date < adm_date:
            issues.append(
                ValidationIssue(
                    id=f"chr-admission-sheet-{stamp}",
                    category="chronology",
                    severity="error",
                    field="welder_stamp",
                    title=f"Сварка раньше даты допускного листа ({welder.stamp})",
                    message=(
                        f"Дата сварки ({_fmt_date(w_date)}) раньше оформления допускного листа № "
                        f"{getattr(welder, 'admission_sheet_number', None) or 'б/н'} ({_fmt_date(adm_date)})."
                    ),
                )
            )

        if welding_type and not check_welder_method_compliance(welder, welding_type):
            allowed = ", ".join(getattr(welder, "allowed_methods", []) or [])
            issues.append(
                ValidationIssue(
                    id=f"tech-welder-method-{stamp}",
                    category="tech",
                    severity="error",
                    field="welding_type",
                    title=f"Способ сварки не входит в допуск НАКС ({welder.stamp})",
                    message=(
                        f"Сварщик {welder.full_name} ({welder.stamp}) аттестован на [{allowed}], "
                        f"но для стыка указан способ «{welding_type}»."
                    ),
                )
            )

        issues.extend(
            validate_welder_naks_attestation(
                welder,
                diameter_mm=diam,
                wall_thickness=wall,
                welding_type=welding_type,
                steel_group=getattr(selected_tc, "steel_group", None),
            )
        )

    # Welding material certificate check
    wm_name = getattr(joint, "welding_materials", "") or ""
    matched_mat = next((m for m in welding_materials if m.brand_and_diameter == wm_name), None)
    if matched_mat is not None:
        if _enum_str(matched_mat.status) == "На испытании":
            issues.append(
                ValidationIssue(
                    id="chr-mat-testing",
                    category="chronology",
                    severity="warning",
                    field="welding_materials",
                    title="Сварочный материал находится «На испытании»",
                    message=(
                        f"Партия «{matched_mat.brand_and_diameter}» (серт. "
                        f"{matched_mat.certificate_number}) еще не допущена в производство."
                    ),
                )
            )
        vk_date = getattr(matched_mat, "incoming_control_date", None)
        if w_date and vk_date and w_date < vk_date:
            issues.append(
                ValidationIssue(
                    id="chr-mat-vk-date",
                    category="chronology",
                    severity="warning",
                    field="welding_materials",
                    title="Сварка раньше даты входного контроля СМ",
                    message=(
                        f"Дата сварки ({_fmt_date(w_date)}) раньше даты акта ВК № "
                        f"{matched_mat.incoming_control_act} ({_fmt_date(vk_date)})."
                    ),
                )
            )

    # BLOCK 2: WPS / TechCard & preheat
    if selected_tc is not None:
        if diam < float(selected_tc.min_diameter_mm) or diam > float(selected_tc.max_diameter_mm):
            issues.append(
                ValidationIssue(
                    id="tech-tc-diam-range",
                    category="tech",
                    severity="warning",
                    field="tech_card_number",
                    title="Диаметр стыка не соответствует техкарте (ТК)",
                    message=(
                        f"Диаметр Ø{diam:g} мм вне диапазона ТК {selected_tc.number} "
                        f"(Ø{selected_tc.min_diameter_mm:g}…{selected_tc.max_diameter_mm:g} мм)."
                    ),
                )
            )
        if wall < float(selected_tc.min_wall_thickness_mm) or wall > float(selected_tc.max_wall_thickness_mm):
            issues.append(
                ValidationIssue(
                    id="tech-tc-wall-range",
                    category="tech",
                    severity="warning",
                    field="tech_card_number",
                    title="Толщина стенки не соответствует техкарте (ТК)",
                    message=(
                        f"Толщина S={wall:g} мм вне диапазона ТК {selected_tc.number} "
                        f"({selected_tc.min_wall_thickness_mm:g}…{selected_tc.max_wall_thickness_mm:g} мм)."
                    ),
                )
            )

        preheat_res = validate_preheat_temperature(
            preheat_raw,
            amb_num,
            selected_tc.number,
            getattr(selected_tc, "preheat_rules", None),
        )
        if not preheat_res.is_valid and w_date is not None:
            issues.append(
                ValidationIssue(
                    id="tech-preheat-mismatch",
                    category="tech",
                    severity="warning",
                    field="preheat_temp",
                    title="Несоблюдение режима подогрева по ТК",
                    message=preheat_res.message,
                )
            )

    mat1 = getattr(joint, "elem1_material", "") or ""
    mat2 = getattr(joint, "elem2_material", "") or ""
    cls1, cls2 = get_steel_class(mat1), get_steel_class(mat2)
    if cls1 != "other" and cls2 != "other" and cls1 != cls2:
        issues.append(
            ValidationIssue(
                id="tech-dissimilar-steels",
                category="tech",
                severity="warning",
                field="elem2_material",
                title="Сварка разнородных сталей",
                message=f"Элемент 1 ({mat1}) и Элемент 2 ({mat2}) относятся к разным классам сталей.",
            )
        )

    wall_diff = abs(elem1_wall - elem2_wall)
    if wall_diff > 1.5:
        issues.append(
            ValidationIssue(
                id="tech-wall-diff",
                category="tech",
                severity="warning",
                field="elem2_wall_thickness",
                title=f"Разнотолщинность элементов (ΔS = {wall_diff:.1f} мм)",
                message=(
                    f"Толщины стенок Элемента 1 ({elem1_wall:g} мм) и Элемента 2 "
                    f"({elem2_wall:g} мм) отличаются на {wall_diff:.1f} мм."
                ),
            )
        )

    # LRV spec consumption in meters
    rd_code = getattr(joint, "rd_code", "") or ""
    joint_id = getattr(joint, "id", None)
    for elem_idx, lrv_code, len_num in (
        (1, getattr(joint, "lrv1_code", ""), len1_num),
        (2, getattr(joint, "lrv2_code", ""), len2_num),
    ):
        if not lrv_code:
            continue
        lrv_item = next(
            (i for i in lrv_catalog if i.lrv_code == lrv_code and i.rd_code == rd_code),
            None,
        ) or next((i for i in lrv_catalog if i.lrv_code == lrv_code), None)
        if lrv_item is None:
            continue
        if _enum_str(lrv_item.unit) == "м" and len_num is not None and len_num > 0:
            used_m = len_num
            for other in all_joints:
                if joint_id and getattr(other, "id", None) == joint_id:
                    continue
                if lrv_item.rd_code and getattr(other, "rd_code", None) and other.rd_code != lrv_item.rd_code:
                    continue
                if getattr(other, "lrv1_code", None) == lrv_code:
                    used_m += _parse_decimal(getattr(other, "elem1_length", None)) or 0.0
                if getattr(other, "lrv2_code", None) == lrv_code:
                    used_m += _parse_decimal(getattr(other, "elem2_length", None)) or 0.0
            if used_m > float(lrv_item.spec_qty):
                issues.append(
                    ValidationIssue(
                        id=f"tech-lrv-overuse-m-{elem_idx}",
                        category="tech",
                        severity="warning",
                        field=f"elem{elem_idx}_length",
                        title=f"Превышение лимита по спецификации ЛРВ ({lrv_code})",
                        message=(
                            f"Расход труб по коду {lrv_code} ({used_m:.2f} м) превышает "
                            f"спецификацию ({lrv_item.spec_qty:g} м)."
                        ),
                    )
                )

    for elem_idx, elem_name, len_num in (
        (1, getattr(joint, "elem1_name", ""), len1_num),
        (2, getattr(joint, "elem2_name", ""), len2_num),
    ):
        if not elem_name or len_num is None:
            continue
        cat = detect_lrv_element_type(elem_name)
        if cat in ("Отвод", "Фланец", "Заглушка", "Тройник", "Переход") and len_num > 2.5:
            issues.append(
                ValidationIssue(
                    id=f"tech-fitting-length-{elem_idx}",
                    category="tech",
                    severity="warning",
                    field=f"elem{elem_idx}_length",
                    title=f"Нетипично большая длина для фасонной детали ({cat})",
                    message=f"Для Элемента {elem_idx} «{elem_name}» указана длина {len_num:g} м.",
                )
            )

    # BLOCK 3: VIK / NDT / STO repair rules
    if (
        ndt_type != NdtMethodEnum.NOT_REQUIRED.value
        and ndt_res == ControlResultEnum.FIT.value
        and vik_res != ControlResultEnum.FIT.value
    ):
        issues.append(
            ValidationIssue(
                id="ndt-valid-without-vik",
                category="ndt",
                severity="error",
                field="ndt_result",
                title="Положительный НК без годного ВИК",
                message=(
                    f"По физическому контролю ({ndt_type}) выставлено «Годен», "
                    f"но по ВИК статус «{vik_res}»."
                ),
            )
        )

    if (
        vik_res == ControlResultEnum.REPAIR.value or ndt_res == ControlResultEnum.REPAIR.value
    ) and (
        dup_type == NdtMethodEnum.NOT_REQUIRED.value
        or dup_res == ControlResultEnum.NOT_CONDUCTED.value
    ):
        issues.append(
            ValidationIssue(
                id="ndt-repair-needs-dup",
                category="ndt",
                severity="warning",
                field="dup_ndt_result",
                title="Требуется дублирующий контроль после ремонта",
                message="По стыку назначен «Ремонт»; необходимо указать дублирующий/повторный контроль.",
            )
        )

    # Repair sampling length check: <= pi * D / 6 per p. 19.4 STO 15-1.1-002
    repair_len = getattr(joint, "repair_length_mm", None)
    if repair_len is not None and float(repair_len) > 0 and diam > 0:
        max_repair_len = math.pi * diam / 6.0
        if float(repair_len) > max_repair_len:
            issues.append(
                ValidationIssue(
                    id="ndt-repair-length-limit",
                    category="ndt",
                    severity="error",
                    field="repair_length_mm",
                    title="Превышена допустимая длина выборки дефекта (п. 19.4 СТО)",
                    message=(
                        f"Длина выборки при ремонте ({float(repair_len):.1f} мм) превышает "
                        f"допустимые 1/6 периметра шва (π·D/6 = {max_repair_len:.1f} мм). Требуется вырезка стыка."
                    ),
                )
            )

    if is_second_repair_forbidden(joint) and getattr(joint, "repair_action", None) != "Вырезано":
        issues.append(
            ValidationIssue(
                id="ndt-second-repair-forbidden",
                category="ndt",
                severity="error",
                field="repair_action",
                title="Запрет повторного ремонта сварного соединения (Правило 1 ремонта)",
                message=(
                    "Стык уже подвергался ремонту и не прошёл повторный контроль качества. "
                    "По СТО Газпром 15-1.1-002-2023 п. 11.4 и ГОСТ 32569-2013 повторный ремонт запрещён — "
                    "допускается только вырезка («Вырезано»)."
                ),
            )
        )

    if matched_line is not None:
        requires_100 = (
            float(getattr(matched_line, "rk_percent", 0) or 0) == 100
            or float(getattr(matched_line, "uzk_percent", 0) or 0) == 100
            or float(getattr(matched_line, "pvk_percent", 0) or 0) == 100
        )
        if requires_100 and ndt_type == NdtMethodEnum.NOT_REQUIRED.value:
            issues.append(
                ValidationIssue(
                    id="ndt-linelist-100pct",
                    category="ndt",
                    severity="warning",
                    field="ndt_type",
                    title="Нарушение проектного объема НК по лайнлисту",
                    message=(
                        f"По лайнлисту линии «{matched_line.line_number}» требуется 100% НК, "
                        "но выбрано «Не требуется»."
                    ),
                )
            )

    # BLOCK 4: Referential uniqueness (duplicate joint_number on same line & factory ends)
    target_line_id = getattr(joint, "line_id", None)
    target_unique_line = (getattr(joint, "unique_line_id", "") or "").strip().lower()
    cand_num_norm = (getattr(joint, "joint_number", "") or "").strip().lower()
    if cand_num_norm:
        for other in all_joints:
            if joint_id and getattr(other, "id", None) == joint_id:
                continue
            same_line = (
                target_line_id is not None and getattr(other, "line_id", None) == target_line_id
            ) or (
                target_unique_line
                and (getattr(other, "unique_line_id", "") or "").strip().lower() == target_unique_line
            )
            if same_line and (getattr(other, "joint_number", "") or "").strip().lower() == cand_num_norm:
                issues.append(
                    ValidationIssue(
                        id=f"ref-duplicate-joint-number-{getattr(other, 'id', '')}",
                        category="referential",
                        severity="error",
                        field="joint_number",
                        title="Дубликат номера стыка на линии",
                        message=(
                            f"Стык № «{getattr(joint, 'joint_number', '')}» уже зарегистрирован "
                            f"на линии «{getattr(joint, 'line_number', '') or getattr(joint, 'unique_line_id', '')}»."
                        ),
                    )
                )
                break

    for elem_idx, fac_num, elem_name in (
        (1, getattr(joint, "elem1_factory_number", None), getattr(joint, "elem1_name", "")),
        (2, getattr(joint, "elem2_factory_number", None), getattr(joint, "elem2_name", "")),
    ):
        clean_fac = (fac_num or "").strip()
        if not clean_fac or clean_fac == "—" or clean_fac.lower() == "б/н":
            continue
        max_ends = get_max_weld_ends_for_element(elem_name)
        used_in: list[str] = []
        for other in all_joints:
            if joint_id and getattr(other, "id", None) == joint_id:
                continue
            f1 = (getattr(other, "elem1_factory_number", None) or "").strip()
            f2 = (getattr(other, "elem2_factory_number", None) or "").strip()
            if f1.lower() == clean_fac.lower() or f2.lower() == clean_fac.lower():
                used_in.append(f"№{getattr(other, 'joint_number', '')}")
        if len(used_in) >= max_ends:
            cat = detect_lrv_element_type(elem_name)
            issues.append(
                ValidationIssue(
                    id=f"ref-factory-num-ends-{elem_idx}",
                    category="referential",
                    severity="warning",
                    field=f"elem{elem_idx}_factory_number",
                    title=f"Исчерпано число свариваемых торцов детали ({clean_fac})",
                    message=(
                        f"Деталь «{elem_name}» ({cat}, макс. торцов: {max_ends}) с № «{clean_fac}» "
                        f"уже использована в стыках: {', '.join(used_in)}."
                    ),
                )
            )

    errors = [i for i in issues if i.severity == "error"]
    warnings = [i for i in issues if i.severity == "warning"]
    return JointValidationSummary(
        is_valid_to_save=len(errors) == 0,
        errors=errors,
        warnings=warnings,
        all_issues=issues,
    )
