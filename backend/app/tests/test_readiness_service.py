from __future__ import annotations

import uuid
from datetime import date
from types import SimpleNamespace
from typing import Any

import pytest

from app.models.enums import ControlResultEnum, NdtMethodEnum
from app.services.readiness_service import (
    calculate_line_ndt_progress,
    calculate_welder_ndt_quotas,
    compute_line_list_item_status,
    is_joint_currently_in_repair,
    is_joint_defective,
    is_joint_fully_accepted,
    validate_journal_completeness,
)


def _make_dummy_joint(**kwargs: Any) -> SimpleNamespace:
    defaults = {
        "id": uuid.uuid4(),
        "joint_number": "1",
        "unique_line_id": "LINE-01",
        "diameter_mm": 219.0,
        "wall_thickness": 8.0,
        "welding_date": date(2026, 5, 10),
        "welder_stamp": "СВ1",
        "welder_stamps_list": ["СВ1"],
        "vik_result": ControlResultEnum.FIT,
        "vik_date": date(2026, 5, 11),
        "vik_inspector": "Иванов И.И.",
        "vik_report_number": "АКТ-ВИК-001",
        "ndt_type": NdtMethodEnum.RK,
        "ndt_result": ControlResultEnum.FIT,
        "ndt_date": date(2026, 5, 12),
        "ndt_inspector": "Петров П.П.",
        "ndt_report_number": "ЗАКЛ-РК-001",
        "dup_ndt_type": NdtMethodEnum.NOT_REQUIRED,
        "dup_ndt_result": ControlResultEnum.NOT_CONDUCTED,
        "dup_ndt_report_number": None,
        "tech_card_number": "ТК-01",
        "responsible_person": "Начальник участка Н.Н.",
        "repair_action": None,
        "repair_count": 0,
        "repair_vik_result": None,
        "repair_vik_number": None,
        "repair_ndt_type": None,
        "repair_ndt_result": None,
        "repair_ndt_number": None,
        "repair_dup_ndt_type": None,
        "repair_dup_ndt_result": None,
        "repair_dup_ndt_number": None,
        "repair_tech_card": None,
        "repair_welder_stamp": None,
        "repair_foreman": None,
        "object_name": "УКПГ-1С",
        "rd_code": "РД-001",
        "line_number": "ТХ1",
        "elem1_name": "Труба",
        "elem1_material": "09Г2С",
        "elem2_name": "Отвод",
        "elem2_material": "09Г2С",
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def _make_dummy_line(**kwargs: Any) -> SimpleNamespace:
    defaults = {
        "unique_line_id": "LINE-01",
        "rk_percent": 100.0,
        "uzk_percent": 0.0,
        "pipeline_category": "I",
        "quality_level": "B",
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def test_is_joint_defective_detection():
    # Clean joint
    j_clean = _make_dummy_joint()
    assert not is_joint_defective(j_clean)

    # Defect in primary VIK
    j_vik_bad = _make_dummy_joint(vik_result=ControlResultEnum.REPAIR)
    assert is_joint_defective(j_vik_bad)

    # Defect in primary NDT
    j_ndt_bad = _make_dummy_joint(ndt_result=ControlResultEnum.CUT_OUT)
    assert is_joint_defective(j_ndt_bad)

    # Defect signaled by repair action text
    j_repair_action = _make_dummy_joint(repair_action="Требуется ремонт")
    assert is_joint_defective(j_repair_action)


def test_is_joint_fully_accepted_lifecycle():
    # 1. Unwelded joint is never accepted
    j_unwelded = _make_dummy_joint(welding_date=None)
    assert not is_joint_fully_accepted(j_unwelded)

    # 2. Fully welded and tested clean joint
    j_ok = _make_dummy_joint()
    assert is_joint_fully_accepted(j_ok)

    # 3. Defective joint before repair is NOT accepted
    j_defective = _make_dummy_joint(
        ndt_result=ControlResultEnum.REPAIR,
        repair_action="Ремонт",
    )
    assert not is_joint_fully_accepted(j_defective)
    assert is_joint_currently_in_repair(j_defective)

    # 4. Repaired joint with successful post-repair VIK and NDT
    j_repaired_ok = _make_dummy_joint(
        ndt_result=ControlResultEnum.REPAIR,
        repair_action="Ремонт",
        repair_vik_result=ControlResultEnum.FIT,
        repair_ndt_type=NdtMethodEnum.RK,
        repair_ndt_result=ControlResultEnum.FIT,
    )
    assert is_joint_fully_accepted(j_repaired_ok)
    assert not is_joint_currently_in_repair(j_repaired_ok)


def test_calculate_line_ndt_progress_quotas():
    line = _make_dummy_line(unique_line_id="LINE-01", rk_percent=50.0, uzk_percent=0.0)

    # 2 welded joints: 1 inspected RK (FIT), 1 not inspected
    j1 = _make_dummy_joint(ndt_type=NdtMethodEnum.RK, ndt_result=ControlResultEnum.FIT)
    j2 = _make_dummy_joint(
        joint_number="2",
        ndt_type=NdtMethodEnum.RK,
        ndt_result=ControlResultEnum.NOT_CONDUCTED,
    )

    progress = calculate_line_ndt_progress([j1, j2], line)
    assert progress.total_joints == 2
    assert progress.welded_joints == 2
    assert progress.inspected_rk_count == 1
    assert progress.actual_rk_pct == 50.0
    assert progress.is_rk_fulfilled is True

    # When required is 100%, 50% is not fulfilled
    line_strict = _make_dummy_line(unique_line_id="LINE-01", rk_percent=100.0)
    progress_strict = calculate_line_ndt_progress([j1, j2], line_strict)
    assert progress_strict.is_rk_fulfilled is False


def test_calculate_welder_ndt_quotas_and_deficits():
    line = _make_dummy_line(unique_line_id="LINE-01", rk_percent=100.0)
    j1 = _make_dummy_joint(
        welder_stamp="СВ-01",
        welder_stamps_list=["СВ-01"],
        ndt_result=ControlResultEnum.FIT,
    )
    j2 = _make_dummy_joint(
        joint_number="2",
        welder_stamp="СВ-01",
        welder_stamps_list=["СВ-01"],
        ndt_result=ControlResultEnum.REPAIR,
    )

    reports = calculate_welder_ndt_quotas([j1, j2], [line])
    assert len(reports) == 1
    sv01 = reports[0]
    assert sv01.stamp == "СВ-01"
    assert sv01.total_welded == 2
    assert sv01.defect_count == 1
    assert sv01.penalty_required_joints > 0


def test_assess_line_readiness_and_completion():
    line = _make_dummy_line(unique_line_id="LINE-01", rk_percent=100.0)
    j1 = _make_dummy_joint(joint_number="1")
    j2 = _make_dummy_joint(joint_number="2")

    status = compute_line_list_item_status(line, [j1, j2])
    assert status.total_joints == 2
    assert status.welded_joints == 2
    assert status.controlled_joints == 2
    assert status.is_completed is True
    assert status.ndt_status == "sufficient"


def test_validate_journal_completeness_rules():
    j1 = _make_dummy_joint()
    summary = validate_journal_completeness([j1], standard="СТО Газпром 15-1.1-002-2023")
    assert summary.is_fully_complete is True
    assert summary.joints_with_missing_data_count == 0

    # Incomplete joint (missing welder stamp and NDT inspector)
    j_incomplete = _make_dummy_joint(
        welder_stamp="",
        welder_stamps_list=[],
        ndt_inspector="",
    )
    summary_inc = validate_journal_completeness(
        [j_incomplete], standard="СТО Газпром 15-1.1-002-2023"
    )
    assert summary_inc.is_fully_complete is False
    assert summary_inc.joints_with_missing_data_count == 1
    assert len(summary_inc.missing_items) > 0
