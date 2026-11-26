"""
Бизнес-логика пакетных заявок ЛНК и синхронизации раздельных заключений
по методам (ВИК / РК / УЗК / ПВК) с агрегированными полями сварного стыка.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any

from app.models.enums import ControlResultEnum, NdtMethodEnum

CANONICAL_LAB_METHODS: tuple[str, ...] = ("ВИК", "РК", "УЗК", "ПВК")
PHYSICAL_LAB_METHODS: tuple[str, ...] = ("РК", "УЗК", "ПВК")

_METHOD_ALIASES: dict[str, str] = {
    "ВИК": "ВИК",
    "VIK": "ВИК",
    "VT": "ВИК",
    "РК": "РК",
    "RK": "РК",
    "RT": "РК",
    "УЗК": "УЗК",
    "UZK": "УЗК",
    "UT": "УЗК",
    "ПВК": "ПВК",
    "PVK": "ПВК",
    "PT": "ПВК",
    "МК": "ПВК",
    "МПК": "ПВК",
}

_RESULT_PRIORITY: dict[str, int] = {
    ControlResultEnum.CUT_OUT.value: 4,
    ControlResultEnum.REPAIR.value: 3,
    ControlResultEnum.IN_WORK.value: 2,
    ControlResultEnum.FIT.value: 1,
    ControlResultEnum.NOT_CONDUCTED.value: 0,
}

_VALID_RESULTS: set[str] = {r.value for r in ControlResultEnum}
_NDT_METHOD_MAP: dict[str, NdtMethodEnum] = {
    "РК": NdtMethodEnum.RK,
    "УЗК": NdtMethodEnum.UZK,
    "ПВК": NdtMethodEnum.PVK,
}


def normalize_method_token(token: str) -> str:
    cleaned = (token or "").strip().upper()
    return _METHOD_ALIASES.get(cleaned, cleaned)


def normalize_requested_methods(
    requested_methods: list[str] | None,
    requested_method: str | None,
) -> tuple[list[str], str]:
    """Нормализует список методов заявки и строковое представление requested_method."""
    raw_tokens: list[str] = []
    if requested_methods:
        for item in requested_methods:
            for part in re.split(r"[+,;/]+", str(item or "")):
                p = normalize_method_token(part)
                if p:
                    raw_tokens.append(p)
    elif requested_method:
        for part in re.split(r"[+,;/]+", str(requested_method)):
            p = normalize_method_token(part)
            if p:
                raw_tokens.append(p)

    seen: set[str] = set()
    ordered: list[str] = []
    for canonical in CANONICAL_LAB_METHODS:
        if canonical in raw_tokens and canonical not in seen:
            seen.add(canonical)
            ordered.append(canonical)
    for token in raw_tokens:
        if token not in seen:
            seen.add(token)
            ordered.append(token)

    if not ordered:
        ordered = ["РК"]

    return ordered, "+".join(ordered)


def _parse_iso_date(val: Any) -> date | None:
    if val is None or val == "":
        return None
    if isinstance(val, date) and not isinstance(val, datetime):
        return val
    if isinstance(val, datetime):
        return val.date()
    s = str(val).strip()
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        return None


def normalize_lab_conclusions(
    raw: dict[str, Any] | None,
) -> dict[str, dict[str, Any]] | None:
    if raw is None:
        return None
    if not isinstance(raw, dict):
        return None

    normalized: dict[str, dict[str, Any]] = {}
    for raw_key, entry in raw.items():
        method_key = normalize_method_token(str(raw_key))
        if method_key not in CANONICAL_LAB_METHODS or not isinstance(entry, dict):
            continue
        raw_result = str(entry.get("result") or ControlResultEnum.NOT_CONDUCTED.value).strip()
        result_val = (
            raw_result
            if raw_result in _VALID_RESULTS
            else ControlResultEnum.NOT_CONDUCTED.value
        )
        raw_date = entry.get("date")
        date_str = str(raw_date).strip()[:10] if raw_date else None
        stage = str(entry.get("stage") or "primary").strip().lower()
        if stage not in ("primary", "repair", "duplicate"):
            stage = "primary"
        normalized[method_key] = {
            "reportNumber": str(entry.get("reportNumber") or "").strip(),
            "date": date_str or None,
            "result": result_val,
            "inspector": str(entry.get("inspector") or "").strip(),
            "stage": stage,
        }
    return normalized


def sync_lab_conclusions_to_joint_patch(patch_data: dict[str, Any]) -> None:
    """
    При наличии `lab_conclusions` в patch_data нормализует их и синхронизирует
    агрегированные поля стыка (vik_*, ndt_*), сохраняя совместимость с журналами и отчётами.
    """
    if "lab_conclusions" not in patch_data:
        return

    norm = normalize_lab_conclusions(patch_data.get("lab_conclusions"))
    patch_data["lab_conclusions"] = norm
    if not norm:
        return

    if "ВИК" in norm:
        vik = norm["ВИК"]
        patch_data["vik_report_number"] = vik["reportNumber"]
        patch_data["vik_date"] = _parse_iso_date(vik["date"])
        patch_data["vik_result"] = ControlResultEnum(vik["result"])
        patch_data["vik_inspector"] = vik["inspector"]

    active_physical: list[tuple[int, int, str, dict[str, Any]]] = []
    has_any_physical_key = False
    for idx, method in enumerate(PHYSICAL_LAB_METHODS):
        if method not in norm:
            continue
        has_any_physical_key = True
        entry = norm[method]
        res_str = entry["result"]
        if (
            res_str != ControlResultEnum.NOT_CONDUCTED.value
            or entry["reportNumber"]
            or entry["date"]
        ):
            prio = _RESULT_PRIORITY.get(res_str, 0)
            active_physical.append((prio, -idx, method, entry))

    if active_physical:
        active_physical.sort(reverse=True)
        _, _, chosen_method, chosen = active_physical[0]
        patch_data["ndt_type"] = _NDT_METHOD_MAP[chosen_method]
        patch_data["ndt_report_number"] = chosen["reportNumber"]
        patch_data["ndt_date"] = _parse_iso_date(chosen["date"])
        patch_data["ndt_result"] = ControlResultEnum(chosen["result"])
        patch_data["ndt_inspector"] = chosen["inspector"]
    elif has_any_physical_key:
        patch_data["ndt_result"] = ControlResultEnum.NOT_CONDUCTED
        patch_data["ndt_report_number"] = ""
        patch_data["ndt_date"] = None
        patch_data["ndt_inspector"] = ""


def check_joint_methods_completed(joint: Any, methods: list[str]) -> list[str]:
    """
    Проверяет, что по стыку внесены подтверждённые результаты контроля
    для всех указанных методов пакета. Возвращает список недостающих методов.
    """
    conclusions = getattr(joint, "lab_conclusions", None) or {}
    missing: list[str] = []

    for method in methods:
        m = normalize_method_token(method)
        entry = conclusions.get(m) if isinstance(conclusions, dict) else None
        if isinstance(entry, dict) and entry.get("result"):
            if entry["result"] == ControlResultEnum.NOT_CONDUCTED.value:
                missing.append(f"нет {m}")
            continue

        # Обратная совместимость с legacy-полями стыка:
        # если lab_conclusions уже заполнены, отсутствие метода в словаре означает, что он не выполнен
        if m == "ВИК":
            vik_res = getattr(joint, "vik_result", None)
            if not vik_res or vik_res == ControlResultEnum.NOT_CONDUCTED:
                missing.append("нет ВИК")
        else:
            if isinstance(conclusions, dict) and len(conclusions) > 0:
                missing.append(f"нет {m}")
            else:
                ndt_res = getattr(joint, "ndt_result", None)
                if not ndt_res or ndt_res == ControlResultEnum.NOT_CONDUCTED:
                    missing.append(f"нет {m}")

    return missing
