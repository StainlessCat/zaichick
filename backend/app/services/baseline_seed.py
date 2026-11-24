from __future__ import annotations

import logging
import uuid
from datetime import date
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.models.enums import (
    CircuitTestStatusEnum,
    ControlResultEnum,
    ElementCombinationEnum,
    JointKindEnum,
    JointTypeEnum,
    LrvElementCategoryEnum,
    LrvUnitEnum,
    NdtMethodEnum,
    RecordStatusEnum,
    SriStatusEnum,
    WeldingMaterialStatusEnum,
    WeldingMaterialTypeEnum,
    WeldingTypeEnum,
)
from app.models.facility import Facility, FacilityRdCode
from app.models.joint import WeldJoint
from app.models.line import ProjectLine
from app.models.lrv import LrvItem
from app.models.settings import ColumnTemplate
from app.models.test_circuit import TestCircuit
from app.models.welding_tech import (
    TechCard,
    TechCardPreheatRule,
    Welder,
    WelderNaksCert,
    WeldingMaterial,
)

logger = logging.getLogger(__name__)

# Deterministic UUIDs for baseline seed
FACILITY_ID = uuid.uuid5(uuid.NAMESPACE_DNS, "facility-kharasavey")
LINE_01_ID = uuid.uuid5(uuid.NAMESPACE_DNS, "line-01-gp-1.1")
LINE_02_ID = uuid.uuid5(uuid.NAMESPACE_DNS, "line-02-shflu-2.1")
LINE_03_ID = uuid.uuid5(uuid.NAMESPACE_DNS, "line-03-mt-108")
CIRCUIT_ID = uuid.uuid5(uuid.NAMESPACE_DNS, "circuit-01-vi-gp")


async def seed_baseline_domain_data(session: AsyncSession) -> dict[str, int]:
    """Idempotently seed standard baseline domain data (Facility, Lines, Welders, WPS, Materials, LRV, Joints)."""
    # 1. Facility: УКПГ-1С Харасавэйского ГКМ
    fac = Facility(
        id=FACILITY_ID,
        external_id="fac-kharasavey",
        name="УКПГ-1С Харасавэйского ГКМ",
        short_name="УКПГ-1С",
        region="Ямало-Ненецкий АО, п-ов Ямал",
        latitude=71.09,
        longitude=66.82,
        weather_station="Харасавэй",
        weather_station_id="209460",
        weather_station_distance_km=4.2,
        weather_station_source="NOAA / GSOD",
        version=1,
    )
    session.add(fac)
    await session.flush()

    # 1.1 Facility RD codes
    rd_codes = [("01-ГП", "Газопровод сырого газа"), ("02-ШФЛУ", "Трубопровод ШФЛУ"), ("03-МТ", "Межцеховой коллектор")]
    for code, title in rd_codes:
        session.add(
            FacilityRdCode(
                facility_id=fac.id,
                code=code,
                title=title,
                contours=[],
            )
        )
    await session.flush()

    # 2. Project Lines
    line_01 = ProjectLine(
        id=LINE_01_ID,
        legacy_id="line-01-gp-1.1",
        facility_id=fac.id,
        object_name="УКПГ-1С",
        rd_code="01-ГП",
        line_number="01-ГП-1.1",
        unique_line_id="УКПГ-1С:01-ГП:01-ГП-1.1",
        line_name="Газопровод сырого газа УКПГ-1С (Ø1020х14)",
        product="Газ сырой сепарации",
        welding_ntd="СТО Газпром 15-1.1-002-2023",
        pipeline_category="I",
        rk_percent=100.0,
        uzk_percent=100.0,
        pvk_percent=0.0,
        version=1,
    )
    line_02 = ProjectLine(
        id=LINE_02_ID,
        legacy_id="line-02-shflu-2.1",
        facility_id=fac.id,
        object_name="УКПГ-1С",
        rd_code="02-ШФЛУ",
        line_number="02-ШФЛУ-2.1",
        unique_line_id="УКПГ-1С:02-ШФЛУ:02-ШФЛУ-2.1",
        line_name="Трубопровод широкой фракции углеводородов (Ø530х10)",
        product="ШФЛУ",
        welding_ntd="СТО Газпром 15-1.1-002-2023",
        pipeline_category="II",
        rk_percent=100.0,
        uzk_percent=50.0,
        pvk_percent=0.0,
        version=1,
    )
    line_03 = ProjectLine(
        id=LINE_03_ID,
        legacy_id="line-03-mt-108",
        facility_id=fac.id,
        object_name="УКПГ-1С",
        rd_code="03-МТ",
        line_number="03-МТ-108",
        unique_line_id="УКПГ-1С:03-МТ:03-МТ-108",
        line_name="Межцеховой технологический коллектор (Ø108х6)",
        product="Технологический газ",
        welding_ntd="СТО Газпром 15-1.1-002-2023",
        pipeline_category="III",
        rk_percent=20.0,
        uzk_percent=0.0,
        pvk_percent=0.0,
        version=1,
    )
    session.add_all([line_01, line_02, line_03])
    await session.flush()

    # 3. Welders (НАКС)
    welders_data = [
        ("А01", "Сидоров А.П.", [WeldingTypeEnum.RD], "ЯМР-1ГАЦ-01234", "Мастер СМР Громов И.А."),
        ("А02", "Иванов В.С.", [WeldingTypeEnum.RD], "ЯМР-1ГАЦ-01235", "Мастер СМР Громов И.А."),
        ("Б01", "Петров Н.К.", [WeldingTypeEnum.RAD, WeldingTypeEnum.RD], "ЯМР-1ГАЦ-01236", "Мастер СМР Громов И.А."),
        ("Б02", "Кузнецов М.И.", [WeldingTypeEnum.MP], "ЯМР-1ГАЦ-01237", "Мастер СМР Громов И.А."),
        ("В01", "Смирнов Д.Е.", [WeldingTypeEnum.RD], "ЯМР-1ГАЦ-01238", "Мастер СМР Громов И.А."),
    ]
    for idx, (stamp, full_name, methods, cert, foreman) in enumerate(welders_data):
        w_id = uuid.uuid5(uuid.NAMESPACE_DNS, f"welder-{stamp}")
        w = Welder(
            id=w_id,
            legacy_id=f"w-{stamp}",
            stamp=stamp,
            full_name=full_name,
            cert_number=cert,
            cert_issue_date=date(2023, 5, 10),
            cert_expiry_date=date(2027, 5, 10),
            allowed_methods=[m.value for m in methods],
            crew_foreman=foreman,
            steel_groups=["М01", "М03"],
            record_status=RecordStatusEnum.VERIFIED,
            sort_order=idx,
            version=1,
        )
        session.add(w)
        for m in methods:
            session.add(
                WelderNaksCert(
                    welder_id=w_id,
                    welding_type=m,
                    cert_number=cert,
                    issue_date=date(2023, 5, 10),
                    expiry_date=date(2027, 5, 10),
                )
            )
    await session.flush()

    # 4. Tech Cards (WPS)
    tc_01 = TechCard(
        id=uuid.uuid5(uuid.NAMESPACE_DNS, "wps-01-rd"),
        legacy_id="tc-wps-01-rd",
        number="WPS-01-РД",
        title="Ручная дуговая сварка труб Ø1020х14 стали 09Г2С",
        welding_type=WeldingTypeEnum.RD,
        joint_kind=JointKindEnum.BUTT,
        element_combination=ElementCombinationEnum.PIPE_PIPE,
        ntd="СТО Газпром 15-1.1-002-2023",
        steel_group="09Г2С",
        min_diameter_mm=1020.0,
        max_diameter_mm=1020.0,
        min_wall_thickness_mm=14.0,
        max_wall_thickness_mm=14.0,
        recommended_materials="LB-52U Ø2.6, ОК 53.70 Ø3.2/4.0",
        record_status=RecordStatusEnum.VERIFIED,
        version=1,
    )
    tc_02 = TechCard(
        id=uuid.uuid5(uuid.NAMESPACE_DNS, "wps-02-rad-rd"),
        legacy_id="tc-wps-02-rad-rd",
        number="WPS-02-РАД+РД",
        title="Комбинированная сварка РАД+РД Ø530х10 стали 09Г2С",
        welding_type=WeldingTypeEnum.RAD_RD,
        joint_kind=JointKindEnum.BUTT,
        element_combination=ElementCombinationEnum.PIPE_PIPE,
        ntd="СТО Газпром 15-1.1-002-2023",
        steel_group="09Г2С",
        min_diameter_mm=530.0,
        max_diameter_mm=530.0,
        min_wall_thickness_mm=10.0,
        max_wall_thickness_mm=10.0,
        recommended_materials="Св-08Г2С Ø2.0, ОК 53.70 Ø3.2",
        record_status=RecordStatusEnum.VERIFIED,
        version=1,
    )
    tc_03 = TechCard(
        id=uuid.uuid5(uuid.NAMESPACE_DNS, "wps-03-rd-108"),
        legacy_id="tc-wps-03-rd-108",
        number="WPS-03-РД-108",
        title="Ручная дуговая сварка труб Ø108х6 стали 20",
        welding_type=WeldingTypeEnum.RD,
        joint_kind=JointKindEnum.BUTT,
        element_combination=ElementCombinationEnum.PIPE_PIPE,
        ntd="СТО Газпром 15-1.1-002-2023",
        steel_group="20",
        min_diameter_mm=108.0,
        max_diameter_mm=108.0,
        min_wall_thickness_mm=6.0,
        max_wall_thickness_mm=6.0,
        recommended_materials="ОК 53.70 Ø2.5/3.2",
        record_status=RecordStatusEnum.VERIFIED,
        version=1,
    )
    session.add_all([tc_01, tc_02, tc_03])
    await session.flush()

    # Preheat rules for TC 01
    session.add_all(
        [
            TechCardPreheatRule(
                tech_card_id=tc_01.id,
                ambient_min_c=-50.0,
                ambient_max_c=-5.0,
                min_preheat_temp_c=120.0,
                condition_label="Т возд. от -50 °C до -5 °C (Подогрев ≥ +120 °C)",
            ),
            TechCardPreheatRule(
                tech_card_id=tc_01.id,
                ambient_min_c=-4.9,
                ambient_max_c=50.0,
                min_preheat_temp_c=100.0,
                condition_label="Т возд. выше -5 °C (Подогрев ≥ +100 °C)",
            ),
        ]
    )

    # 5. Welding Materials
    mat_01 = WeldingMaterial(
        id=uuid.uuid5(uuid.NAMESPACE_DNS, "mat-lb52u-26"),
        legacy_id="mat-lb52u-26",
        brand_and_diameter="LB-52U Ø2.6 мм",
        material_type=WeldingMaterialTypeEnum.ELECTRODES,
        welding_method=WeldingTypeEnum.RD,
        batch_number="П-8812",
        certificate_number="С-КОВ-2024-0891",
        incoming_control_act="АКТ-ВК-01/24",
        incoming_control_date=date(2024, 1, 15),
        status=WeldingMaterialStatusEnum.ADMITTED,
        record_status=RecordStatusEnum.VERIFIED,
        version=1,
    )
    mat_02 = WeldingMaterial(
        id=uuid.uuid5(uuid.NAMESPACE_DNS, "mat-ok5370-32"),
        legacy_id="mat-ok5370-32",
        brand_and_diameter="ОК 53.70 Ø3.2 мм",
        material_type=WeldingMaterialTypeEnum.ELECTRODES,
        welding_method=WeldingTypeEnum.RD,
        batch_number="П-4412",
        certificate_number="С-ЭСАБ-2024-4412",
        incoming_control_act="АКТ-ВК-02/24",
        incoming_control_date=date(2024, 1, 16),
        status=WeldingMaterialStatusEnum.ADMITTED,
        record_status=RecordStatusEnum.VERIFIED,
        version=1,
    )
    session.add_all([mat_01, mat_02])
    await session.flush()

    # 6. LRV Items (Pipes)
    lrv_01 = LrvItem(
        id=uuid.uuid5(uuid.NAMESPACE_DNS, "lrv-01-001"),
        legacy_id="lrv-01-001",
        facility_id=fac.id,
        lrv_code="LRV-01-001",
        rd_code="01-ГП",
        object_name="УКПГ-1С",
        short_name="Труба 1020х14 09Г2С",
        category=LrvElementCategoryEnum.PIPE,
        material="09Г2С",
        ntd="ТУ 14-3Р-1471-2002",
        manufacturer="ПАО «ЧТПЗ»",
        diameter_mm=1020.0,
        wall_thickness=14.0,
        spec_qty=120.0,
        unit=LrvUnitEnum.METER,
        version=1,
    )
    lrv_02 = LrvItem(
        id=uuid.uuid5(uuid.NAMESPACE_DNS, "lrv-02-001"),
        legacy_id="lrv-02-001",
        facility_id=fac.id,
        lrv_code="LRV-02-001",
        rd_code="02-ШФЛУ",
        object_name="УКПГ-1С",
        short_name="Труба 530х10 09Г2С",
        category=LrvElementCategoryEnum.PIPE,
        material="09Г2С",
        ntd="ГОСТ 20295-85",
        manufacturer="АО «ВТЗ»",
        diameter_mm=530.0,
        wall_thickness=10.0,
        spec_qty=60.0,
        unit=LrvUnitEnum.METER,
        version=1,
    )
    lrv_03 = LrvItem(
        id=uuid.uuid5(uuid.NAMESPACE_DNS, "lrv-03-001"),
        legacy_id="lrv-03-001",
        facility_id=fac.id,
        lrv_code="LRV-03-001",
        rd_code="03-МТ",
        object_name="УКПГ-1С",
        short_name="Труба 108х6 ст.20",
        category=LrvElementCategoryEnum.PIPE,
        material="20",
        ntd="ГОСТ 8732-78",
        manufacturer="ПАО «СинТЗ»",
        diameter_mm=108.0,
        wall_thickness=6.0,
        spec_qty=45.0,
        unit=LrvUnitEnum.METER,
        version=1,
    )
    session.add_all([lrv_01, lrv_02, lrv_03])
    await session.flush()

    # 7. Test Circuit
    circuit = TestCircuit(
        id=CIRCUIT_ID,
        facility_id=fac.id,
        name="01-ВИ-ГП",
        sri_name="СРИ-01-ГП-2024",
        sri_status=SriStatusEnum.APPROVED,
        test_status=CircuitTestStatusEnum.NOT_TESTED,
        planned_date=date(2024, 4, 15),
        record_status=RecordStatusEnum.VERIFIED,
        version=1,
    )
    session.add(circuit)
    await session.flush()

    # 8. Baseline Weld Joints
    joints_data = [
        # Линия 01-ГП-1.1
        {
            "line": line_01,
            "joint_number": "010",
            "date": date(2024, 3, 10),
            "stamp": "А01",
            "dia": 1020.0,
            "thick": 14.0,
            "steel": "09Г2С",
            "wps": "WPS-01-РД",
            "preheat": "120",
            "air": -12.5,
            "lrv": lrv_01,
            "vik_res": ControlResultEnum.FIT,
            "vik_num": "ВИК-01/24",
            "ndt_res": ControlResultEnum.FIT,
            "ndt_type": NdtMethodEnum.RK,
            "ndt_num": "РК-01/24",
            "dup_res": ControlResultEnum.FIT,
            "dup_type": NdtMethodEnum.UZK,
            "dup_num": "УЗК-01/24",
            "circuit": circuit,
        },
        {
            "line": line_01,
            "joint_number": "011",
            "is_supp": True,
            "date": date(2024, 3, 11),
            "stamp": "А01",
            "dia": 1020.0,
            "thick": 14.0,
            "steel": "09Г2С",
            "wps": "WPS-01-РД",
            "preheat": "120",
            "air": -10.0,
            "lrv": lrv_01,
            "vik_res": ControlResultEnum.FIT,
            "vik_num": "ВИК-02/24",
            "ndt_res": ControlResultEnum.FIT,
            "ndt_type": NdtMethodEnum.RK,
            "ndt_num": "РК-02/24",
            "dup_res": ControlResultEnum.FIT,
            "dup_type": NdtMethodEnum.UZK,
            "dup_num": "УЗК-02/24",
            "circuit": circuit,
        },
        {
            "line": line_01,
            "joint_number": "020",
            "is_supp": False,
            "date": date(2024, 3, 12),
            "stamp": "А02",
            "dia": 1020.0,
            "thick": 14.0,
            "steel": "09Г2С",
            "wps": "WPS-01-РД",
            "preheat": "120",
            "air": -8.5,
            "lrv": lrv_01,
            "vik_res": ControlResultEnum.FIT,
            "vik_num": "ВИК-03/24",
            "ndt_res": ControlResultEnum.IN_WORK,
            "ndt_type": NdtMethodEnum.RK,
            "ndt_num": None,
            "dup_res": ControlResultEnum.NOT_CONDUCTED,
            "dup_type": NdtMethodEnum.NOT_REQUIRED,
            "dup_num": None,
            "circuit": circuit,
        },
        # Линия 02-ШФЛУ-2.1
        {
            "line": line_02,
            "joint_number": "010",
            "date": date(2024, 3, 12),
            "stamp": "Б01",
            "dia": 530.0,
            "thick": 10.0,
            "steel": "09Г2С",
            "wps": "WPS-02-РАД+РД",
            "preheat": "100",
            "air": -8.0,
            "lrv": lrv_02,
            "vik_res": ControlResultEnum.FIT,
            "vik_num": "ВИК-04/24",
            "ndt_res": ControlResultEnum.FIT,
            "ndt_type": NdtMethodEnum.RK,
            "ndt_num": "РК-03/24",
            "dup_res": ControlResultEnum.FIT,
            "dup_type": NdtMethodEnum.UZK,
            "dup_num": "УЗК-03/24",
            "circuit": None,
        },
        {
            "line": line_02,
            "joint_number": "020",
            "date": date(2024, 3, 13),
            "stamp": "Б02",
            "dia": 530.0,
            "thick": 10.0,
            "steel": "09Г2С",
            "wps": "WPS-02-РАД+РД",
            "preheat": "100",
            "air": -7.5,
            "lrv": lrv_02,
            "vik_res": ControlResultEnum.FIT,
            "vik_num": "ВИК-05/24",
            "ndt_res": ControlResultEnum.FIT,
            "ndt_type": NdtMethodEnum.RK,
            "ndt_num": "РК-04/24",
            "dup_res": ControlResultEnum.NOT_CONDUCTED,
            "dup_type": NdtMethodEnum.NOT_REQUIRED,
            "dup_num": None,
            "circuit": None,
        },
        # Линия 03-МТ-108
        {
            "line": line_03,
            "joint_number": "010",
            "date": date(2024, 3, 14),
            "stamp": "В01",
            "dia": 108.0,
            "thick": 6.0,
            "steel": "20",
            "wps": "WPS-03-РД-108",
            "preheat": "0",
            "air": -5.0,
            "lrv": lrv_03,
            "vik_res": ControlResultEnum.FIT,
            "vik_num": "ВИК-06/24",
            "ndt_res": ControlResultEnum.NOT_CONDUCTED,
            "ndt_type": NdtMethodEnum.RK,
            "ndt_num": None,
            "dup_res": ControlResultEnum.NOT_CONDUCTED,
            "dup_type": NdtMethodEnum.NOT_REQUIRED,
            "dup_num": None,
            "circuit": None,
        },
    ]

    for item in joints_data:
        pline: ProjectLine = item["line"]
        j_id = uuid.uuid5(uuid.NAMESPACE_DNS, f"joint-{pline.unique_line_id}-{item['joint_number']}")
        lrv_i: LrvItem = item["lrv"]
        c: TestCircuit | None = item["circuit"]
        j = WeldJoint(
            id=j_id,
            legacy_id=f"j-{pline.line_number}-{item['joint_number']}",
            line_id=pline.id,
            facility_id=fac.id,
            test_circuit_id=c.id if c else None,
            lrv1_item_id=lrv_i.id,
            lrv2_item_id=lrv_i.id,
            object_name=pline.object_name,
            rd_code=pline.rd_code,
            line_number=pline.line_number,
            unique_line_id=pline.unique_line_id,
            joint_number=item["joint_number"],
            is_supplementary=item.get("is_supp", False),
            joint_kind=JointKindEnum.BUTT,
            joint_type=JointTypeEnum.MOUNTING,
            diameter_mm=item["dia"],
            wall_thickness=item["thick"],
            lrv1_code=lrv_i.lrv_code,
            elem1_name=lrv_i.short_name,
            elem1_material=lrv_i.material,
            elem1_ntd=lrv_i.ntd,
            elem1_factory_number=f"Т-{pline.line_number}-01",
            elem1_heat_number="ПЛ-84910",
            elem1_cert_number="ТС-2024-1102",
            lrv2_code=lrv_i.lrv_code,
            elem2_name=lrv_i.short_name,
            elem2_material=lrv_i.material,
            elem2_ntd=lrv_i.ntd,
            elem2_factory_number=f"Т-{pline.line_number}-02",
            elem2_heat_number="ПЛ-84911",
            elem2_cert_number="ТС-2024-1103",
            welding_date=item["date"],
            welder_stamp=item["stamp"],
            welder_stamps_list=[item["stamp"]],
            tech_card_number=item["wps"],
            preheat_temp=item["preheat"],
            ambient_temp_c=item["air"],
            responsible_person="Мастер СМР Громов И.А.",
            vik_result=item["vik_res"],
            vik_date=item["date"],
            vik_report_number=item["vik_num"],
            vik_inspector="Инспектор ВИК Соколов П.В.",
            ndt_type=item["ndt_type"],
            ndt_result=item["ndt_res"],
            ndt_report_number=item["ndt_num"],
            ndt_date=item["date"] if item["ndt_num"] else None,
            ndt_inspector="Дефектоскопист ЛНК Морозов К.С." if item["ndt_num"] else "",
            dup_ndt_type=item["dup_type"],
            dup_ndt_result=item["dup_res"],
            dup_ndt_report_number=item["dup_num"],
            dup_ndt_date=item["date"] if item["dup_num"] else None,
            dup_ndt_inspector="Дефектоскопист УЗК Белов В.Н." if item["dup_num"] else "",
            version=1,
        )
        session.add(j)

    # 9. Column Template
    tpl = ColumnTemplate(
        id="tpl-sto-gazprom-full",
        name="Полный вид СТО Газпром 15-1.1-002-2023",
        description="Эталонный состав колонок исполнительной документации",
        is_system=True,
        is_active_default=True,
        column_order=[],
        visible_columns=[],
    )
    session.add(tpl)

    await session.commit()
    logger.info("Successfully seeded baseline domain data (Facility, Lines, Joints, Tech, LRV).")
    return {
        "facilities": 1,
        "lines": 3,
        "welders": len(welders_data),
        "tech_cards": 3,
        "materials": 2,
        "lrv": 3,
        "joints": len(joints_data),
        "circuits": 1,
    }


async def fix_legacy_baseline_joint_numbers(session: AsyncSession) -> int:
    """Migrate legacy single-digit joint numbers (1, 2, 3...) to corporate standard (010, 011, 020...)."""
    from sqlalchemy import text
    try:
        # 1. Update line 01-ГП-1.1
        await session.execute(
            text(
                "UPDATE weld_joints SET joint_number = '010' "
                "WHERE joint_number = '1' AND (unique_line_id LIKE '%01-ГП%' OR unique_line_id LIKE '%01-GP%')"
            )
        )
        await session.execute(
            text(
                "UPDATE weld_joints SET joint_number = '011', is_supplementary = true "
                "WHERE joint_number = '2' AND (unique_line_id LIKE '%01-ГП%' OR unique_line_id LIKE '%01-GP%')"
            )
        )
        await session.execute(
            text(
                "UPDATE weld_joints SET joint_number = '020' "
                "WHERE joint_number = '3' AND (unique_line_id LIKE '%01-ГП%' OR unique_line_id LIKE '%01-GP%')"
            )
        )

        # 2. Update line 02-ШФЛУ-2.1
        await session.execute(
            text(
                "UPDATE weld_joints SET joint_number = '010' "
                "WHERE joint_number = '1' AND (unique_line_id LIKE '%02-ШФЛУ%' OR unique_line_id LIKE '%02-SFLU%')"
            )
        )
        await session.execute(
            text(
                "UPDATE weld_joints SET joint_number = '020' "
                "WHERE joint_number = '2' AND (unique_line_id LIKE '%02-ШФЛУ%' OR unique_line_id LIKE '%02-SFLU%')"
            )
        )

        # 3. Update line 03-МТ-108
        await session.execute(
            text(
                "UPDATE weld_joints SET joint_number = '010' "
                "WHERE joint_number = '1' AND (unique_line_id LIKE '%03-МТ%' OR unique_line_id LIKE '%03-MT%')"
            )
        )

        # 4. General fallback: Any remaining single-digit natural numbers (1-9) -> (010, 020, ... 090)
        res = await session.execute(
            text(
                "UPDATE weld_joints "
                "SET joint_number = '0' || (CAST(joint_number AS integer) * 10) "
                "WHERE joint_number ~ '^[1-9]$'"
            )
        )
        await session.commit()
        return res.rowcount or 0
    except Exception as exc:
        logger.warning("Could not run fix_legacy_baseline_joint_numbers: %s", exc)
        await session.rollback()
        return 0


async def ensure_baseline_domain_data_seeded() -> int:
    """Check if facilities table is empty; if so and SEED_BASELINE_DEMO_DATA is True, populate baseline reference data."""
    from app.core.config import get_settings

    settings = get_settings()
    if not settings.seed_baseline_demo_data:
        logger.info("SEED_BASELINE_DEMO_DATA is False. Skipping baseline demo data seeding for production environment.")
        return 0

    try:
        async with async_session_factory() as session:
            count = (
                await session.execute(select(func.count(Facility.id)))
            ).scalar_one()
            if count == 0:
                logger.info("facilities table is empty. Running baseline domain bootstrap seeding...")
                res = await seed_baseline_domain_data(session)
                return res.get("joints", 0)
            else:
                logger.info("facilities table already contains %d facilities.", count)
                await fix_legacy_baseline_joint_numbers(session)
                return 0
    except Exception as exc:
        logger.error("Failed to ensure baseline domain data seeded: %s", exc)
        return 0
