from __future__ import annotations

import uuid
from datetime import date
from io import BytesIO

import httpx
import pytest
from openpyxl import load_workbook

from app.api.deps import get_current_user
from app.core.database import async_session_factory, engine
from app.main import app
from app.models.enums import (
    ControlResultEnum,
    DepartmentEnum,
    JointKindEnum,
    JointTypeEnum,
    NdtMethodEnum,
    SystemRoleEnum,
)
from app.models.facility import Facility
from app.models.joint import WeldJoint
from app.models.lab_request import NdtLabRequestModel
from app.models.line import ProjectLine
from app.models.user import User


@pytest.mark.asyncio
async def test_laboratory_xlsx_export_three_sheets_and_marking() -> None:
    pil_user = User(
        id=uuid.uuid4(),
        login=f"pil_exp_{uuid.uuid4().hex[:6]}",
        full_name="Лаборант Экспорт",
        password_hash="fakehash",
        department=DepartmentEnum.PIL,
        position_title="Инженер ЛНК",
        role=SystemRoleEnum.OPERATOR,
        is_active=True,
    )

    fac_id = uuid.uuid4()
    line_id = uuid.uuid4()
    joint_id = uuid.uuid4()
    req_id = uuid.uuid4()
    fac_name = f"Объект Экспорт ЛНК {uuid.uuid4().hex[:6]}"
    unique_line_id = f"0092.001-{uuid.uuid4().hex[:6]}-TX3:Л1"

    async with async_session_factory() as s:
        s.add(pil_user)
        s.add(Facility(id=fac_id, name=fac_name, short_name="ЛНК", region="ЯНАО"))
        s.add(
            ProjectLine(
                id=line_id,
                facility_id=fac_id,
                object_name=fac_name,
                rd_code="0092.045.001-TX3",
                line_number="Л1",
                unique_line_id=unique_line_id,
            )
        )
        s.add(
            WeldJoint(
                id=joint_id,
                line_id=line_id,
                facility_id=fac_id,
                object_name=fac_name,
                rd_code="0092.045.001-TX3",
                line_number="Л1",
                unique_line_id=unique_line_id,
                joint_number="010",
                joint_kind=JointKindEnum.BUTT,
                joint_type=JointTypeEnum.MOUNTING,
                diameter_mm=720.0,
                wall_thickness=10.0,
                welding_type="РАД+РД",
                welding_date=date(2026, 11, 20),
                welder_stamp="W01",
                ndt_type=NdtMethodEnum.RK,
                ndt_result=ControlResultEnum.FIT,
                vik_result=ControlResultEnum.FIT,
                lab_conclusions={
                    "ВИК": {
                        "reportNumber": "ВИК-001-TX3-Л1-Д-21-010",
                        "date": "2026-11-21",
                        "result": "Годен",
                        "inspector": "Орлова Е.В.",
                        "stage": "primary",
                    },
                    "РК": {
                        "reportNumber": "РК-001-TX3-Л1-Д-21-010",
                        "date": "2026-11-21",
                        "result": "Годен",
                        "inspector": "Орлова Е.В.",
                        "stage": "primary",
                    },
                },
            )
        )
        s.add(
            NdtLabRequestModel(
                id=req_id,
                request_number=f"ЗНК-ЭКС-{uuid.uuid4().hex[:6]}",
                created_date="2026-11-21",
                created_by="Инженер ПТО",
                object_name=fac_name,
                rd_code="0092.045.001-TX3",
                line_number="Л1",
                unique_line_id=unique_line_id,
                contour="КИ-1",
                control_stage="Первичный ВИК и НК",
                requested_method="ВИК+РК",
                requested_methods=["ВИК", "РК"],
                joint_ids=[str(joint_id)],
                status="Выполнена",
            )
        )
        await s.commit()

    app.dependency_overrides[get_current_user] = lambda: pil_user
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/exports/laboratory.xlsx",
                params={"object_name": fac_name},
            )
            assert resp.status_code == 200, resp.text
            assert (
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                in resp.headers.get("content-type", "")
            )

            wb = load_workbook(BytesIO(resp.content))
            assert wb.sheetnames == [
                "Дефицит и маркировка",
                "Заявки ЛНК",
                "Заключения по методам",
            ]

            ws1_vals = [
                cell.value
                for row in wb["Дефицит и маркировка"].iter_rows()
                for cell in row
                if cell.value is not None
            ]
            assert "001-TX3-Л1-Д-21-010" in ws1_vals

            ws2_vals = [
                cell.value
                for row in wb["Заявки ЛНК"].iter_rows()
                for cell in row
                if cell.value is not None
            ]
            assert "ВИК, РК" in ws2_vals

            ws3_vals = [
                cell.value
                for row in wb["Заключения по методам"].iter_rows()
                for cell in row
                if cell.value is not None
            ]
            assert "ВИК-001-TX3-Л1-Д-21-010" in ws3_vals
            assert "РК-001-TX3-Л1-Д-21-010" in ws3_vals
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()
