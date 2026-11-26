from app.services.lab_marking import (
    LAB_DIAMETER_CODE_TABLE,
    LAB_WELDING_TYPE_CODE_TABLE,
    build_joint_lab_marking,
    build_lab_conclusion_number,
    extract_short_rd_code,
    normalize_diameter_key,
    resolve_diameter_letter_code,
    resolve_welding_type_code,
)


def test_dictionaries_size_and_uniqueness():
    assert len(LAB_DIAMETER_CODE_TABLE) == 60
    assert len(LAB_WELDING_TYPE_CODE_TABLE) == 10
    assert len({k for k, _ in LAB_DIAMETER_CODE_TABLE}) == 60
    assert len({v for _, v in LAB_DIAMETER_CODE_TABLE}) == 60


def test_extract_short_rd_code():
    assert extract_short_rd_code("1234.56-ТХ.12") == "12"
    assert (
        extract_short_rd_code("0092.049.Р.13/1 0004 УКПГ.045.0077.001-TX3")
        == "001-TX3"
    )
    assert extract_short_rd_code("  ТХ-05  ") == "ТХ-05"
    assert extract_short_rd_code("") == ""
    assert extract_short_rd_code(None) == ""


def test_diameter_lookup_without_rounding():
    assert normalize_diameter_key(159.0) == "159"
    assert normalize_diameter_key("219,10") == "219.1"
    assert resolve_diameter_letter_code(1820) == ("АБ", False)
    assert resolve_diameter_letter_code(1220) == ("Б", False)
    assert resolve_diameter_letter_code(1219) == ("БА", False)
    assert resolve_diameter_letter_code(219.1) == ("ЛВ", False)
    assert resolve_diameter_letter_code(219) == ("Л", False)
    assert resolve_diameter_letter_code(114.3) == ("П", False)
    assert resolve_diameter_letter_code(114) == ("ПА", False)
    assert resolve_diameter_letter_code(60.3) == ("У", False)
    assert resolve_diameter_letter_code(60) == ("УА", False)
    assert resolve_diameter_letter_code(12) == ("ЮА", False)
    assert resolve_diameter_letter_code(999) == (None, False)


def test_branch_joints_and_welding_types():
    assert resolve_diameter_letter_code(159, joint_kind="Угловое") == ("Я", True)
    assert resolve_diameter_letter_code(325, gost_joint_type="У5") == ("Я", True)
    assert resolve_diameter_letter_code("врезка") == ("Я", True)

    assert resolve_welding_type_code("РД") == "1"
    assert resolve_welding_type_code("РАД") == "2"
    assert resolve_welding_type_code(" рад + рд ") == "21"
    assert resolve_welding_type_code("Л") == "9"


def test_build_marking_and_conclusions():
    butt = build_joint_lab_marking(
        rd_code="0092.049.Р.13/1 0004 УКПГ.045.0077.001-TX3",
        line_number="Л1",
        diameter_mm=720,
        joint_kind="Стыковое",
        gost_joint_type="С17",
        welding_type="РАД+РД",
        joint_number="010",
    )
    assert butt.is_complete is True
    assert butt.marking == "001-TX3-Л1-Д-21-010"

    branch = build_joint_lab_marking(
        rd_code="УКПГ.001-TX3",
        line_number="Л1",
        diameter_mm=159,
        joint_kind="Угловое",
        gost_joint_type="У2",
        welding_type="РД",
        joint_number="030",
    )
    assert branch.is_complete is True
    assert branch.marking == "001-TX3-Л1-Я-1-030"

    assert (
        build_lab_conclusion_number("РК", butt.marking)
        == "РК-001-TX3-Л1-Д-21-010"
    )
    assert (
        build_lab_conclusion_number("УЗК", butt.marking, stage="repair", repair_index=1)
        == "УЗК-001-TX3-Л1-Д-21-010-Р1"
    )
    assert (
        build_lab_conclusion_number("ПВК", butt.marking, stage="duplicate")
        == "ПВК-001-TX3-Л1-Д-21-010-Д"
    )
