from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

from app.models.enums import ControlResultEnum, NdtMethodEnum
from app.services.domain_validation import normalize_stamp, parse_stamps
from app.services.pipe_calc import calculate_equivalent_dia_inch, inch_string_to_numeric, mm_to_inch_diameter


def _s(val: Any) -> str:
    if val is None:
        return ""
    return val.value if hasattr(val, "value") else str(val)


def _has_text(val: Any) -> bool:
    return bool(val is not None and str(val).strip() != "")


def _is_conducted(val: Any) -> bool:
    return _s(val) in (
        ControlResultEnum.FIT.value,
        ControlResultEnum.REPAIR.value,
        ControlResultEnum.CUT_OUT.value,
    )


def is_joint_defective(joint: Any) -> bool:
    bad = (ControlResultEnum.REPAIR.value, ControlResultEnum.CUT_OUT.value)
    if any(
        _s(getattr(joint, attr, None)) in bad
        for attr in (
            "vik_result",
            "ndt_result",
            "dup_ndt_result",
            "repair_vik_result",
            "repair_ndt_result",
            "repair_dup_ndt_result",
        )
    ):
        return True
    if getattr(joint, "repair_action", None) in ("Ремонт", "Вырезано", "Требуется ремонт"):
        return True
    return False


def is_joint_fully_accepted(joint: Any) -> bool:
    if not getattr(joint, "welding_date", None) or not _has_text(getattr(joint, "welder_stamp", None)):
        return False

    had_defect = is_joint_defective(joint)
    fit = ControlResultEnum.FIT.value
    not_req = NdtMethodEnum.NOT_REQUIRED.value
    not_cond = ControlResultEnum.NOT_CONDUCTED.value

    if not had_defect:
        primary_vik_ok = _s(getattr(joint, "vik_result", None)) == fit
        ndt_t = _s(getattr(joint, "ndt_type", None))
        primary_ndt_ok = not ndt_t or ndt_t == not_req or _s(getattr(joint, "ndt_result", None)) == fit
        dup_t = _s(getattr(joint, "dup_ndt_type", None))
        dup_r = _s(getattr(joint, "dup_ndt_result", None))
        dup_ok = not dup_t or dup_t == not_req or not dup_r or dup_r == not_cond or dup_r == fit
        return primary_vik_ok and primary_ndt_ok and dup_ok

    has_rep_vik = _has_text(getattr(joint, "repair_vik_result", None)) and _s(getattr(joint, "repair_vik_result", None)) != not_cond
    rep_ndt_t = _s(getattr(joint, "repair_ndt_type", None))
    has_rep_ndt = bool(rep_ndt_t) and rep_ndt_t != not_req and _has_text(getattr(joint, "repair_ndt_result", None)) and _s(getattr(joint, "repair_ndt_result", None)) != not_cond
    if has_rep_vik or has_rep_ndt:
        post_vik_ok = _s(getattr(joint, "repair_vik_result", None)) == fit
        post_ndt_ok = not rep_ndt_t or rep_ndt_t == not_req or _s(getattr(joint, "repair_ndt_result", None)) == fit
        rep_dup_t = _s(getattr(joint, "repair_dup_ndt_type", None))
        rep_dup_r = _s(getattr(joint, "repair_dup_ndt_result", None))
        post_dup_ok = not rep_dup_t or rep_dup_t == not_req or not rep_dup_r or rep_dup_r == not_cond or rep_dup_r == fit
        return post_vik_ok and post_ndt_ok and post_dup_ok

    had_primary_repair = _s(getattr(joint, "vik_result", None)) == ControlResultEnum.REPAIR.value or _s(getattr(joint, "ndt_result", None)) == ControlResultEnum.REPAIR.value
    dup_t = _s(getattr(joint, "dup_ndt_type", None))
    post_repair_passed = bool(dup_t) and dup_t != not_req and _s(getattr(joint, "dup_ndt_result", None)) == fit
    return had_primary_repair and post_repair_passed


def is_joint_currently_in_repair(joint: Any) -> bool:
    if not is_joint_defective(joint):
        return False
    return not is_joint_fully_accepted(joint)


@dataclass(frozen=True, slots=True)
class LineNdtProgress:
    unique_line_id: str
    total_joints: int
    welded_joints: int
    inspected_rk_count: int
    inspected_uzk_count: int
    required_rk_pct: float
    required_uzk_pct: float
    actual_rk_pct: float
    actual_uzk_pct: float
    is_rk_fulfilled: bool
    is_uzk_fulfilled: bool


def calculate_line_ndt_progress(joints: list[Any], line: Any) -> LineNdtProgress:
    line_joints = [j for j in joints if getattr(j, "unique_line_id", None) == line.unique_line_id]
    total_joints = len(line_joints)
    welded_joints = sum(1 for j in line_joints if getattr(j, "welding_date", None) is not None)
    fit = ControlResultEnum.FIT.value

    inspected_rk = 0
    inspected_uzk = 0
    for j in line_joints:
        ndt_t, ndt_r = _s(j.ndt_type), _s(j.ndt_result)
        dup_t, dup_r = _s(j.dup_ndt_type), _s(j.dup_ndt_result)
        rep_t, rep_r = _s(j.repair_ndt_type), _s(j.repair_ndt_result)
        rdup_t, rdup_r = _s(j.repair_dup_ndt_type), _s(j.repair_dup_ndt_result)

        if (
            (ndt_t in ("РК", "РК+УЗК") and ndt_r == fit)
            or (dup_t == "РК" and dup_r == fit)
            or (rep_t == "РК" and rep_r == fit)
            or (rdup_t == "РК" and rdup_r == fit)
        ):
            inspected_rk += 1

        if (
            (ndt_t in ("УЗК", "РК+УЗК") and ndt_r == fit)
            or (dup_t == "УЗК" and dup_r == fit)
            or (rep_t == "УЗК" and rep_r == fit)
            or (rdup_t == "УЗК" and rdup_r == fit)
        ):
            inspected_uzk += 1

    req_rk = float(getattr(line, "rk_percent", 0) or 0)
    req_uzk = float(getattr(line, "uzk_percent", 0) or 0)
    actual_rk = round((inspected_rk / welded_joints) * 1000) / 10 if welded_joints > 0 else 0.0
    actual_uzk = round((inspected_uzk / welded_joints) * 1000) / 10 if welded_joints > 0 else 0.0

    return LineNdtProgress(
        unique_line_id=line.unique_line_id,
        total_joints=total_joints,
        welded_joints=welded_joints,
        inspected_rk_count=inspected_rk,
        inspected_uzk_count=inspected_uzk,
        required_rk_pct=req_rk,
        required_uzk_pct=req_uzk,
        actual_rk_pct=actual_rk,
        actual_uzk_pct=actual_uzk,
        is_rk_fulfilled=actual_rk >= req_rk,
        is_uzk_fulfilled=actual_uzk >= req_uzk,
    )


@dataclass(frozen=True, slots=True)
class WelderNdtQuotaReport:
    stamp: str
    full_name: str
    total_welded: int
    inspected_count: int
    passed_count: int
    defect_count: int
    actual_ndt_pct: float
    required_ndt_pct: float
    is_compliant: bool
    has_minimum_joint_inspected: bool
    penalty_required_joints: int
    status: str  # 'compliant' | 'warning' | 'penalty_required' | 'critical'
    details: str


def calculate_welder_ndt_quotas(
    joints: list[Any], lines: list[Any] | None = None
) -> list[WelderNdtQuotaReport]:
    line_map = {l.unique_line_id: l for l in (lines or []) if getattr(l, "unique_line_id", None)}
    stats: dict[str, dict[str, Any]] = {}
    finished_bad_excluded = {ControlResultEnum.NOT_CONDUCTED.value, ControlResultEnum.IN_WORK.value}
    bad_results = {ControlResultEnum.REPAIR.value, ControlResultEnum.CUT_OUT.value}
    fit = ControlResultEnum.FIT.value
    not_req = NdtMethodEnum.NOT_REQUIRED.value

    for j in joints:
        stamps = parse_stamps(getattr(j, "welder_stamp", None), getattr(j, "welder_stamps_list", None))
        if not stamps:
            continue

        line = line_map.get(getattr(j, "unique_line_id", ""))
        line_required_pct = 100.0
        if line is not None:
            cat = (getattr(line, "pipeline_category", "") or "").upper().strip()
            ql = (getattr(line, "quality_level", "") or "").upper().strip()
            if "III" in cat or "IV" in cat or ql in ("С", "C"):
                line_required_pct = max(
                    float(getattr(line, "rk_percent", 0) or 0),
                    float(getattr(line, "uzk_percent", 0) or 0),
                    20.0,
                )

        is_welded = getattr(j, "welding_date", None) is not None
        has_primary = (
            _s(j.ndt_result) not in finished_bad_excluded
            and _s(j.ndt_result) != ""
            and _s(j.ndt_type) != not_req
        )
        has_dup = (
            _s(j.dup_ndt_result) not in finished_bad_excluded
            and _s(j.dup_ndt_result) != ""
            and _s(j.dup_ndt_type) != not_req
        )
        has_rep = (
            _s(j.repair_ndt_result) not in finished_bad_excluded
            and _s(j.repair_ndt_result) != ""
            and _s(j.repair_ndt_type) not in ("", not_req)
        )
        is_defect = (
            _s(j.ndt_result) in bad_results
            or _s(j.vik_result) in bad_results
            or _s(j.dup_ndt_result) in bad_results
        )
        has_ndt = has_primary or has_dup or has_rep
        is_passed = is_joint_fully_accepted(j) or (
            not is_defect and (_s(j.ndt_result) == fit or _s(j.dup_ndt_result) == fit)
        )

        for stamp in stamps:
            key = normalize_stamp(stamp)
            if key not in stats:
                stats[key] = {
                    "stamp": stamp,
                    "full_name": getattr(j, "welder_full_name", "") or "",
                    "welded": 0,
                    "inspected": 0,
                    "defects": 0,
                    "passed": 0,
                    "required_pct": line_required_pct,
                }
            st = stats[key]
            if not st["full_name"] and getattr(j, "welder_full_name", None):
                st["full_name"] = j.welder_full_name
            if line_required_pct > st["required_pct"]:
                st["required_pct"] = line_required_pct
            if is_welded:
                st["welded"] += 1
            if has_ndt:
                st["inspected"] += 1
            if is_defect:
                st["defects"] += 1
            if is_passed and not is_defect:
                st["passed"] += 1

    reports: list[WelderNdtQuotaReport] = []
    for st in stats.values():
        total_w = st["welded"]
        insp = st["inspected"]
        defects = st["defects"]
        passed = st["passed"]
        req_pct = st["required_pct"]
        actual_pct = round((insp / total_w) * 1000) / 10 if total_w > 0 else 0.0
        has_min = total_w == 0 or insp >= 1

        penalty = defects * 2
        req_total_penalty = math.ceil((total_w * req_pct) / 100.0) + penalty
        penalty_ok = defects == 0 or (
            total_w >= req_total_penalty
            and insp >= req_total_penalty
            and passed >= math.ceil((total_w * req_pct) / 100.0)
        )

        is_compliant = True
        status_code = "compliant"
        details = "Нормативы неразрушающего контроля полностью выполнены."
        if total_w > 0 and insp == 0:
            is_compliant = False
            status_code = "critical"
            details = (
                f"Ни один из {total_w} сваренных стыков не проконтролирован! "
                f"Требуется не менее 1 стыка и {req_pct:g}%."
            )
        elif defects > 0 and not penalty_ok:
            is_compliant = False
            status_code = "penalty_required"
            details = (
                f"Выявлен брак ({defects} стык(ов)). По п. 5.7 СТО 15-1.3-004-2023 "
                f"назначен штрафной контроль (+{penalty} стык(ов))."
            )
        elif actual_pct < req_pct:
            is_compliant = False
            status_code = "warning"
            details = (
                f"Фактический объем контроля {actual_pct}% ниже требуемого ({req_pct:g}%). "
                f"Проконтролировано {insp} из {total_w}."
            )

        reports.append(
            WelderNdtQuotaReport(
                stamp=st["stamp"],
                full_name=st["full_name"],
                total_welded=total_w,
                inspected_count=insp,
                passed_count=passed,
                defect_count=defects,
                actual_ndt_pct=actual_pct,
                required_ndt_pct=req_pct,
                is_compliant=is_compliant,
                has_minimum_joint_inspected=has_min,
                penalty_required_joints=penalty,
                status=status_code,
                details=details,
            )
        )

    reports.sort(key=lambda r: (r.is_compliant, -r.total_welded))
    return reports


@dataclass(frozen=True, slots=True)
class LineCompletionStatus:
    is_completed: bool
    total_joints: int
    welded_joints: int
    controlled_joints: int
    status_label: str
    ndt_status: str  # 'sufficient' | 'insufficient' | 'no_welding'
    ndt_status_badge: str
    rk_required: int
    rk_controlled: int
    uzk_required: int
    uzk_controlled: int
    welder_ndt_deficits: list[str]


def compute_line_list_item_status(line: Any, all_joints: list[Any]) -> LineCompletionStatus:
    line_joints = [j for j in all_joints if getattr(j, "unique_line_id", None) == line.unique_line_id]
    rk_plan_pct = float(getattr(line, "rk_percent", 0) or 0)
    uzk_plan_pct = float(getattr(line, "uzk_percent", 0) or 0)

    if not line_joints:
        return LineCompletionStatus(
            is_completed=False,
            total_joints=0,
            welded_joints=0,
            controlled_joints=0,
            status_label=getattr(line, "manual_status", None) or "Стыки не внесены",
            ndt_status="no_welding",
            ndt_status_badge="Нет сварки",
            rk_required=0,
            rk_controlled=0,
            uzk_required=0,
            uzk_controlled=0,
            welder_ndt_deficits=[],
        )

    total_joints = len(line_joints)
    welded_joints_list = [
        j
        for j in line_joints
        if getattr(j, "welding_date", None) is not None and _has_text(getattr(j, "welder_stamp", None))
    ]
    welded_count = len(welded_joints_list)
    controlled_joints = sum(1 for j in welded_joints_list if is_joint_fully_accepted(j))

    rk_required = math.ceil((welded_count * rk_plan_pct) / 100.0) if rk_plan_pct > 0 else 0
    uzk_required = math.ceil((welded_count * uzk_plan_pct) / 100.0) if uzk_plan_pct > 0 else 0

    fit = ControlResultEnum.FIT.value
    rk_controlled = sum(
        1
        for j in welded_joints_list
        if (_s(j.ndt_type) in ("РК", "РК+УЗК") and _s(j.ndt_result) == fit)
        or (_s(j.dup_ndt_type) == "РК" and _s(j.dup_ndt_result) == fit)
        or (_s(j.repair_ndt_type) == "РК" and _s(j.repair_ndt_result) == fit)
        or (_s(j.repair_dup_ndt_type) == "РК" and _s(j.repair_dup_ndt_result) == fit)
    )
    uzk_controlled = sum(
        1
        for j in welded_joints_list
        if (_s(j.ndt_type) in ("УЗК", "РК+УЗК") and _s(j.ndt_result) == fit)
        or (_s(j.dup_ndt_type) == "УЗК" and _s(j.dup_ndt_result) == fit)
        or (_s(j.repair_ndt_type) == "УЗК" and _s(j.repair_ndt_result) == fit)
        or (_s(j.repair_dup_ndt_type) == "УЗК" and _s(j.repair_dup_ndt_result) == fit)
    )

    # Per-welder check within the line
    welder_map: dict[str, dict[str, int]] = {}
    not_req = NdtMethodEnum.NOT_REQUIRED.value
    open_bad = {ControlResultEnum.REPAIR.value, ControlResultEnum.CUT_OUT.value}
    for j in welded_joints_list:
        stamps = parse_stamps(j.welder_stamp, j.welder_stamps_list)
        if not stamps:
            stamps = ["Б/К"]
        rep_ndt_closed = _s(j.repair_ndt_type) not in ("", not_req) and _s(j.repair_ndt_result) == fit
        rep_dup_closed = _s(j.repair_dup_ndt_type) not in ("", not_req) and _s(j.repair_dup_ndt_result) == fit
        has_open_defect = (_s(j.ndt_result) in open_bad or _s(j.dup_ndt_result) in open_bad) and not (
            rep_ndt_closed or rep_dup_closed
        )
        has_any_ndt = not has_open_defect and (
            (_s(j.ndt_type) != not_req and _s(j.ndt_result) == fit)
            or (_s(j.dup_ndt_type) != not_req and _s(j.dup_ndt_result) == fit)
            or rep_ndt_closed
            or rep_dup_closed
        )
        for st in stamps:
            cur = welder_map.setdefault(st, {"welded": 0, "controlled": 0})
            cur["welded"] += 1
            if has_any_ndt:
                cur["controlled"] += 1

    req_welder_pct = max(rk_plan_pct, uzk_plan_pct)
    welder_deficits: list[str] = []
    if req_welder_pct > 0:
        for stamp, st in welder_map.items():
            req_cnt = max(1, math.ceil((st["welded"] * req_welder_pct) / 100.0))
            if st["controlled"] < req_cnt:
                welder_deficits.append(f"{stamp}: {st['controlled']}/{st['welded']} (план ≥{req_cnt})")

    is_rk_ok = rk_controlled >= rk_required
    is_uzk_ok = uzk_controlled >= uzk_required
    is_welder_ok = len(welder_deficits) == 0

    if welded_count == 0:
        return LineCompletionStatus(
            is_completed=False,
            total_joints=total_joints,
            welded_joints=0,
            controlled_joints=0,
            status_label=f"В работе (стыки добавлены: {total_joints}, сварка не начата)",
            ndt_status="no_welding",
            ndt_status_badge="Нет сварки",
            rk_required=rk_required,
            rk_controlled=0,
            uzk_required=uzk_required,
            uzk_controlled=0,
            welder_ndt_deficits=[],
        )

    is_ndt_sufficient = is_rk_ok and is_uzk_ok and is_welder_ok
    ndt_status = "sufficient" if is_ndt_sufficient else "insufficient"
    ndt_badge = "Достаточно НК" if is_ndt_sufficient else "Недостаточно НК"
    is_completed = controlled_joints == total_joints

    details: list[str] = []
    if rk_required > 0:
        details.append(f"РК {rk_controlled}/{rk_required}")
    if uzk_required > 0:
        details.append(f"УЗК {uzk_controlled}/{uzk_required}")
    detail_info = f" ({', '.join(details)})" if details else ""
    deficit_note = f" [дефицит по клеймам: {', '.join(welder_deficits)}]" if welder_deficits else ""

    if is_completed and is_ndt_sufficient:
        status_label = f"Все стыки сварены и проконтролированы ({total_joints}/{total_joints}){detail_info}"
    elif is_completed:
        status_label = (
            f"Все стыки сварены и проконтролированы ({total_joints}/{total_joints})"
            f" — {ndt_badge}{detail_info}{deficit_note}"
        )
    else:
        status_label = (
            f"{ndt_badge} — Сдано {controlled_joints}/{total_joints} "
            f"(свар. {welded_count}){detail_info}{deficit_note}"
        )

    return LineCompletionStatus(
        is_completed=is_completed,
        total_joints=total_joints,
        welded_joints=welded_count,
        controlled_joints=controlled_joints,
        status_label=status_label,
        ndt_status=ndt_status,
        ndt_status_badge=ndt_badge,
        rk_required=rk_required,
        rk_controlled=rk_controlled,
        uzk_required=uzk_required,
        uzk_controlled=uzk_controlled,
        welder_ndt_deficits=welder_deficits,
    )


@dataclass(frozen=True, slots=True)
class ReadinessRow:
    group_key: str
    sub_label: str
    total_joints: int
    supplementary_joints: int
    welded_count: int
    vik_passed_count: int
    ndt_passed_count: int
    dup_ndt_passed_count: int
    repair_count: int
    fully_completed_count: int
    welding_pct: int
    readiness_pct: int
    total_equiv_diameter_mm: float
    total_nominal_inches: float
    total_equiv_inches: float
    welded_equiv_inches: float
    equiv_welding_pct: int


def calculate_readiness_report(joints: list[Any], condition: str) -> list[ReadinessRow]:
    attr_map = {
        "objectName": "object_name",
        "rdCode": "rd_code",
        "uniqueLineId": "unique_line_id",
        "contour": "contour",
    }
    attr = attr_map.get(condition, "object_name")
    groups: dict[str, list[Any]] = {}
    for j in joints:
        key = getattr(j, attr, None) or "Не указано"
        groups.setdefault(key, []).append(j)

    fit = ControlResultEnum.FIT.value
    rep = ControlResultEnum.REPAIR.value
    not_req = NdtMethodEnum.NOT_REQUIRED.value

    rows: list[ReadinessRow] = []
    for group_key, items in groups.items():
        total = len(items)
        supp = 0
        for i in items:
            try:
                num = int(str(i.joint_number).strip())
                if num % 10 != 0:
                    supp += 1
            except ValueError:
                pass
        welded = sum(
            1 for i in items if getattr(i, "welding_date", None) is not None and _has_text(i.welder_stamp)
        )
        vik_passed = sum(
            1
            for i in items
            if _s(i.vik_result) == fit
            or (
                _s(i.vik_result) == rep
                and (
                    _s(i.repair_vik_result) == fit
                    or (_s(i.dup_ndt_type) != not_req and _s(i.dup_ndt_result) == fit)
                )
            )
        )
        ndt_passed = sum(
            1
            for i in items
            if _s(i.ndt_result) == fit
            or (
                _s(i.ndt_result) == rep
                and (
                    _s(i.repair_ndt_result) == fit
                    or (_s(i.dup_ndt_type) != not_req and _s(i.dup_ndt_result) == fit)
                )
            )
        )
        dup_passed = sum(
            1 for i in items if _s(i.dup_ndt_result) == fit or _s(i.dup_ndt_type) == not_req
        )
        repair_cnt = sum(1 for i in items if is_joint_currently_in_repair(i))
        fully_done = sum(1 for i in items if is_joint_fully_accepted(i))

        welding_pct = round((welded / total) * 100) if total > 0 else 0
        readiness_pct = round((fully_done / total) * 100) if total > 0 else 0
        total_diam_mm = sum(float(i.diameter_mm or 0) for i in items)

        def _nom_inch(j: Any) -> float:
            d_in = j.diameter_inch or mm_to_inch_diameter(j.diameter_mm)
            return inch_string_to_numeric(d_in)

        def _edi(j: Any) -> float:
            if j.equiv_diameter_inch is not None:
                return float(j.equiv_diameter_inch)
            return calculate_equivalent_dia_inch(j.diameter_inch or j.diameter_mm, j.wall_thickness)

        total_nom_in = round(sum(_nom_inch(i) for i in items) * 10) / 10
        total_eq_in = round(sum(_edi(i) for i in items) * 10) / 10
        welded_eq_in = round(
            sum(
                _edi(i)
                for i in items
                if getattr(i, "welding_date", None) is not None and _has_text(i.welder_stamp)
            )
            * 10
        ) / 10
        equiv_welding_pct = round((welded_eq_in / total_eq_in) * 100) if total_eq_in > 0 else 0

        first = items[0]
        if condition == "objectName":
            sub_label = f"Шифров РД: {len({i.rd_code for i in items})}"
        elif condition == "uniqueLineId":
            sub_label = f"Линия {first.line_number or ''} · {first.contour or ''}"
        else:
            sub_label = first.object_name or ""

        rows.append(
            ReadinessRow(
                group_key=group_key,
                sub_label=sub_label,
                total_joints=total,
                supplementary_joints=supp,
                welded_count=welded,
                vik_passed_count=vik_passed,
                ndt_passed_count=ndt_passed,
                dup_ndt_passed_count=dup_passed,
                repair_count=repair_cnt,
                fully_completed_count=fully_done,
                welding_pct=welding_pct,
                readiness_pct=readiness_pct,
                total_equiv_diameter_mm=total_diam_mm,
                total_nominal_inches=total_nom_in,
                total_equiv_inches=total_eq_in,
                welded_equiv_inches=welded_eq_in,
                equiv_welding_pct=equiv_welding_pct,
            )
        )

    rows.sort(key=lambda r: r.total_joints, reverse=True)
    return rows


@dataclass(slots=True)
class JournalCompletenessResult:
    is_fully_complete: bool
    total_joints: int
    joints_with_missing_data_count: int
    missing_summary: dict[str, int]
    missing_items: list[dict[str, Any]] = field(default_factory=list)


def validate_journal_completeness(
    joints: list[Any], standard: str = "СТО Газпром 15-1.1-002-2023"
) -> JournalCompletenessResult:
    is_sto = standard != "ГОСТ 32569-2013"
    summary = {
        "missingDates": 0,
        "missingWelders": 0,
        "missingTechCards": 0,
        "missingVikReports": 0,
        "missingNdtReports": 0,
        "missingDupNdtReports": 0,
        "missingRepairDetails": 0,
        "missingRepairVikReports": 0,
        "missingRepairNdtReports": 0,
        "missingRepairDupNdtReports": 0,
        "missingResponsiblePerson": 0,
    }
    missing_items: list[dict[str, Any]] = []
    not_req = NdtMethodEnum.NOT_REQUIRED.value
    not_cond = ControlResultEnum.NOT_CONDUCTED.value

    for j in joints:
        fields: list[dict[str, str]] = []
        if not getattr(j, "welding_date", None):
            fields.append({"field": "weldingDate", "label": "Дата сварки"})
            summary["missingDates"] += 1

        if not (getattr(j, "welder_stamps_list", None) or _has_text(getattr(j, "welder_stamp", None))):
            fields.append({"field": "welderStamp", "label": "Клеймо сварщика"})
            summary["missingWelders"] += 1

        if not _has_text(getattr(j, "tech_card_number", None)):
            fields.append({"field": "techCardNumber", "label": "Техкарта (ТК)"})
            summary["missingTechCards"] += 1

        # Primary VIK
        if _is_conducted(j.vik_result) or getattr(j, "vik_date", None) or _has_text(j.vik_report_number):
            vik_gap = False
            if not _has_text(j.vik_report_number):
                fields.append({"field": "vikReportNumber", "label": "Первичный ВИК: не указан номер заключения/акта"})
                vik_gap = True
            if not getattr(j, "vik_date", None):
                fields.append({"field": "vikDate", "label": "Первичный ВИК: не указана дата контроля"})
                vik_gap = True
            if not _s(j.vik_result) or _s(j.vik_result) == not_cond:
                fields.append({"field": "vikResult", "label": "Первичный ВИК: не указан результат контроля"})
                vik_gap = True
            if vik_gap:
                summary["missingVikReports"] += 1

        # Primary NDT
        ndt_t = _s(j.ndt_type)
        if ndt_t and ndt_t != not_req and (_is_conducted(j.ndt_result) or getattr(j, "ndt_date", None) or _has_text(j.ndt_report_number)):
            ndt_gap = False
            if not _has_text(j.ndt_report_number):
                fields.append({"field": "ndtReportNumber", "label": f"Первичный НК ({ndt_t}): не указан номер заключения"})
                ndt_gap = True
            if not getattr(j, "ndt_date", None):
                fields.append({"field": "ndtDate", "label": f"Первичный НК ({ndt_t}): не указана дата контроля"})
                ndt_gap = True
            if not _s(j.ndt_result) or _s(j.ndt_result) == not_cond:
                fields.append({"field": "ndtResult", "label": f"Первичный НК ({ndt_t}): не указан результат контроля"})
                ndt_gap = True
            if ndt_gap:
                summary["missingNdtReports"] += 1

        # Repeat/Dup NDT & Post-Repair controls for STO Gazprom
        if is_sto:
            is_primary_rep = _s(j.vik_result) in ("Ремонт", "Вырезать") or _s(j.ndt_result) in ("Ремонт", "Вырезать")
            dup_t = _s(j.dup_ndt_type)
            if not is_primary_rep and dup_t and dup_t != not_req and (_is_conducted(j.dup_ndt_result) or getattr(j, "dup_ndt_date", None) or _has_text(j.dup_ndt_report_number)):
                dup_gap = False
                if not _has_text(j.dup_ndt_report_number):
                    fields.append({"field": "dupNdtReportNumber", "label": f"Повторный/дублирующий НК ({dup_t}): не указан номер заключения"})
                    dup_gap = True
                if not getattr(j, "dup_ndt_date", None):
                    fields.append({"field": "dupNdtDate", "label": f"Повторный/дублирующий НК ({dup_t}): не указана дата контроля"})
                    dup_gap = True
                if not _is_conducted(j.dup_ndt_result):
                    fields.append({"field": "dupNdtResult", "label": f"Повторный/дублирующий НК ({dup_t}): не указан результат контроля"})
                    dup_gap = True
                if dup_gap:
                    summary["missingDupNdtReports"] += 1

            is_repair_trig = (
                is_joint_defective(j)
                or _has_text(j.repair_action)
                or getattr(j, "repair_date", None) is not None
                or _has_text(j.repair_tech_card)
                or _has_text(j.repair_welder_stamp)
            )
            if is_repair_trig:
                rep_gap = False
                is_cut = (
                    j.repair_action == "Вырезано"
                    or _s(j.vik_result) == "Вырезать"
                    or _s(j.ndt_result) == "Вырезать"
                    or _s(j.dup_ndt_result) == "Вырезать"
                )
                if not getattr(j, "repair_date", None):
                    fields.append({"field": "repairDate", "label": "Ремонт: не указана дата ремонта"})
                    rep_gap = True
                if not _has_text(j.repair_welder_stamp):
                    fields.append({"field": "repairWelderStamp", "label": "Ремонт: не указано клеймо сварщика ремонта"})
                    rep_gap = True
                if not is_cut and not _has_text(j.repair_tech_card):
                    fields.append({"field": "repairTechCard", "label": "Ремонт: не указана техкарта (ТК) на ремонт"})
                    rep_gap = True

                rep_vik_cond = _is_conducted(j.repair_vik_result) or getattr(j, "repair_vik_date", None) or _has_text(j.repair_vik_number)
                if rep_vik_cond:
                    rv_gap = False
                    if not _has_text(j.repair_vik_number):
                        fields.append({"field": "repairVikNumber", "label": "ВИК после ремонта: не указан номер заключения/акта"})
                        rv_gap = True
                    if not getattr(j, "repair_vik_date", None):
                        fields.append({"field": "repairVikDate", "label": "ВИК после ремонта: не указана дата контроля"})
                        rv_gap = True
                    if not _is_conducted(j.repair_vik_result):
                        fields.append({"field": "repairVikResult", "label": "ВИК после ремонта: не указан результат контроля"})
                        rv_gap = True
                    if rv_gap:
                        summary["missingRepairVikReports"] += 1
                        rep_gap = True

                rep_ndt_t = _s(j.repair_ndt_type)
                rep_ndt_cond = bool(rep_ndt_t) and rep_ndt_t != not_req and (_is_conducted(j.repair_ndt_result) or getattr(j, "repair_ndt_date", None) or _has_text(j.repair_ndt_number))
                if rep_ndt_cond:
                    rn_gap = False
                    if not _has_text(j.repair_ndt_number):
                        fields.append({"field": "repairNdtNumber", "label": f"НК после ремонта ({rep_ndt_t}): не указан номер заключения"})
                        rn_gap = True
                    if not getattr(j, "repair_ndt_date", None):
                        fields.append({"field": "repairNdtDate", "label": f"НК после ремонта ({rep_ndt_t}): не указана дата контроля"})
                        rn_gap = True
                    if not _is_conducted(j.repair_ndt_result):
                        fields.append({"field": "repairNdtResult", "label": f"НК после ремонта ({rep_ndt_t}): не указан результат контроля"})
                        rn_gap = True
                    if rn_gap:
                        summary["missingRepairNdtReports"] += 1
                        rep_gap = True

                rep_dup_t = _s(j.repair_dup_ndt_type)
                rep_dup_cond = bool(rep_dup_t) and rep_dup_t != not_req and (_is_conducted(j.repair_dup_ndt_result) or getattr(j, "repair_dup_ndt_date", None) or _has_text(j.repair_dup_ndt_number))
                if rep_dup_cond:
                    rd_gap = False
                    if not _has_text(j.repair_dup_ndt_number):
                        fields.append({"field": "repairDupNdtNumber", "label": f"Повторный/дублирующий НК после ремонта ({rep_dup_t}): не указан номер заключения"})
                        rd_gap = True
                    if not getattr(j, "repair_dup_ndt_date", None):
                        fields.append({"field": "repairDupNdtDate", "label": f"Повторный/дублирующий НК после ремонта ({rep_dup_t}): не указана дата контроля"})
                        rd_gap = True
                    if not _is_conducted(j.repair_dup_ndt_result):
                        fields.append({"field": "repairDupNdtResult", "label": f"Повторный/дублирующий НК после ремонта ({rep_dup_t}): не указан результат контроля"})
                        rd_gap = True
                    if rd_gap:
                        summary["missingRepairDupNdtReports"] += 1
                        rep_gap = True

                if not is_cut and not rep_vik_cond and not rep_ndt_cond and not rep_dup_cond:
                    fields.append({"field": "repairControlMissing", "label": "Контроль после ремонта: не внесены сведения о контроле после ремонта"})
                    rep_gap = True

                if rep_gap:
                    summary["missingRepairDetails"] += 1

        if not _has_text(j.responsible_person):
            fields.append({"field": "responsiblePerson", "label": "Ответственное лицо (мастер)"})
            summary["missingResponsiblePerson"] += 1

        if fields:
            missing_items.append(
                {
                    "jointId": str(j.id),
                    "jointNumber": j.joint_number,
                    "lineNumber": j.line_number,
                    "missingFields": fields,
                }
            )

    return JournalCompletenessResult(
        is_fully_complete=len(missing_items) == 0,
        total_joints=len(joints),
        joints_with_missing_data_count=len(missing_items),
        missing_summary=summary,
        missing_items=missing_items,
    )
