from __future__ import annotations

import asyncio
import uuid
from datetime import date
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_client_ip, get_db_session, require_permission
from app.api.routes.reports import (
    READINESS_EXEC_DOC_PROJECTION,
    READINESS_JOINT_PROJECTION,
    READINESS_LINE_PROJECTION,
)
from app.api.routes.welding_journals import fetch_filtered_joints_and_lrv
from app.models.executive_doc import ExecutiveDoc
from app.models.facility import Facility
from app.models.joint import WeldJoint
from app.models.lab_request import NdtLabRequestModel
from app.models.line import ProjectLine
from app.models.lrv import LrvItem
from app.models.test_circuit import TestCircuit
from app.models.user import User
from app.models.welding_tech import WeldingMaterial
from app.services.audit_service import record_audit_log
from app.services.excel_export import (
    build_joints_registry_workbook_bytes,
    build_joints_template_workbook_bytes,
    build_linelist_workbook_bytes,
    build_lrv_workbook_bytes,
    build_readiness_and_quotas_workbook_bytes,
    build_welding_journal_workbook_bytes,
)
from app.services.lab_excel_export import build_laboratory_workbook_bytes
from app.services.readiness_service import validate_journal_completeness

router = APIRouter(prefix="/api/exports", tags=["exports"])

_XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _xlsx_response(
    content: bytes,
    filename: str,
    *,
    extra_headers: dict[str, str] | None = None,
) -> Response:
    encoded = quote(filename)
    headers = {
        "Content-Disposition": f"attachment; filename=\"export.xlsx\"; filename*=UTF-8''{encoded}",
        "X-Content-Type-Options": "nosniff",
    }
    if extra_headers:
        headers.update(extra_headers)
    return Response(content=content, media_type=_XLSX_MEDIA_TYPE, headers=headers)


@router.get("/journal.xlsx")
async def export_welding_journal_xlsx(
    request: Request,
    standard: str = Query(default="СТО Газпром 15-1.1-002-2023"),
    rd_code: str | None = Query(default=None),
    unique_line_id: str | None = Query(default=None),
    facility_id: uuid.UUID | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    strict: bool = Query(default=False),
    draft_label: str | None = Query(default=None, max_length=240),
    journal_number: str | None = Query(default=None, max_length=80),
    customer_name: str | None = Query(default=None, max_length=200),
    contractor_name: str | None = Query(default=None, max_length=200),
    responsible_keeper: str | None = Query(default=None, max_length=160),
    current_user: User = Depends(require_permission("can_export_documents")),
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    joints, lrv_map = await fetch_filtered_joints_and_lrv(
        session,
        rd_code=rd_code,
        unique_line_id=unique_line_id,
        facility_id=facility_id,
        date_from=date_from,
        date_to=date_to,
        welded_only=True,
    )
    completeness = validate_journal_completeness(joints, standard=standard)
    if strict and not completeness.is_fully_complete:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "JOURNAL_INCOMPLETE",
                "message": "Выгрузка заблокирована в строгом режиме: не заполнены обязательные реквизиты журнала.",
                "joints_with_missing_data_count": completeness.joints_with_missing_data_count,
                "missing_summary": completeness.missing_summary,
                "missing_items": completeness.missing_items,
            },
        )

    object_title = joints[0].object_name if joints else ""
    if not object_title and facility_id is not None:
        fac = (
            await session.execute(select(Facility).where(Facility.id == facility_id))
        ).scalar_one_or_none()
        if fac is not None:
            object_title = fac.name

    is_gost = standard == "ГОСТ 32569-2013"
    materials = (
        list((await session.execute(select(WeldingMaterial))).scalars().all())
        if is_gost
        else []
    )

    effective_draft_banner: str | None = None
    if draft_label and draft_label.strip():
        effective_draft_banner = draft_label.strip()
    elif not completeness.is_fully_complete:
        effective_draft_banner = (
            f"ЧЕРНОВИК · ТРЕБУЕТСЯ ЗАПОЛНЕНИЕ РЕКВИЗИТОВ · "
            f"пропуски в {completeness.joints_with_missing_data_count} из {len(joints)} стыков"
        )

    payload = await asyncio.to_thread(
        build_welding_journal_workbook_bytes,
        joints,
        standard=standard,
        lrv_items=list(lrv_map.values()),
        materials=materials,
        object_title=object_title,
        rd_code=rd_code or "",
        line_label=unique_line_id or "",
        date_from=date_from.isoformat() if date_from else None,
        date_to=date_to.isoformat() if date_to else None,
        draft_banner=effective_draft_banner,
        journal_number=journal_number,
        customer_name=customer_name,
        contractor_name=contractor_name,
        responsible_keeper=responsible_keeper,
    )
    await record_audit_log(
        session,
        action="EXPORT",
        entity_type="welding_journal_xlsx",
        entity_id=unique_line_id or rd_code or "all",
        user=current_user,
        new_data={
            "standard": standard,
            "rows": len(joints),
            "is_complete": completeness.is_fully_complete,
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
        },
        ip_address=get_client_ip(request),
        unique_line_id=unique_line_id,
        rd_code=rd_code,
        summary=f"Экспорт журнала ({standard}, {len(joints)} стыков)",
    )
    tag = "GOST_32569" if is_gost else "STO_GAZPROM"
    return _xlsx_response(
        payload,
        f"welding_journal_{tag}.xlsx",
        extra_headers={
            "X-Journal-Complete": "true" if completeness.is_fully_complete else "false",
            "X-Journal-Missing-Count": str(completeness.joints_with_missing_data_count),
        },
    )


@router.get("/readiness.xlsx")
async def export_readiness_xlsx(
    request: Request,
    condition: Literal["objectName", "contour", "rdCode", "uniqueLineId"] = Query(
        default="objectName"
    ),
    facility_id: uuid.UUID | None = Query(default=None),
    rd_code: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    current_user: User = Depends(require_permission("can_export_documents")),
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    j_stmt = select(WeldJoint).options(READINESS_JOINT_PROJECTION)
    l_stmt = select(ProjectLine).options(READINESS_LINE_PROJECTION)
    c_stmt = select(TestCircuit).options(selectinload(TestCircuit.facility))
    if facility_id is not None:
        j_stmt = j_stmt.where(WeldJoint.facility_id == facility_id)
        l_stmt = l_stmt.where(ProjectLine.facility_id == facility_id)
        c_stmt = c_stmt.where(TestCircuit.facility_id == facility_id)
    if rd_code:
        cleaned_rd = rd_code.strip()
        j_stmt = j_stmt.where(WeldJoint.rd_code == cleaned_rd)
        l_stmt = l_stmt.where(ProjectLine.rd_code == cleaned_rd)
    if date_from is not None:
        j_stmt = j_stmt.where(WeldJoint.welding_date >= date_from)
    if date_to is not None:
        j_stmt = j_stmt.where(WeldJoint.welding_date <= date_to)

    joints = list((await session.execute(j_stmt)).scalars().all())
    lines = list((await session.execute(l_stmt.order_by(ProjectLine.sort_order.asc()))).scalars().all())
    circuits = list((await session.execute(c_stmt)).scalars().all())
    line_ids = [ln.id for ln in lines]
    exec_docs = (
        list(
            (
                await session.execute(
                    select(ExecutiveDoc)
                    .options(READINESS_EXEC_DOC_PROJECTION)
                    .where(ExecutiveDoc.line_id.in_(line_ids))
                )
            )
            .scalars()
            .all()
        )
        if line_ids
        else []
    )

    has_period = bool(date_from or date_to)
    payload = await asyncio.to_thread(
        build_readiness_and_quotas_workbook_bytes,
        joints,
        lines,
        condition=condition,
        test_circuits=circuits,
        executive_docs=exec_docs,
        date_from=date_from.isoformat() if date_from else None,
        date_to=date_to.isoformat() if date_to else None,
        exclude_empty_groups=has_period,
    )
    await record_audit_log(
        session,
        action="EXPORT",
        entity_type="readiness_report_xlsx",
        entity_id=rd_code or "all",
        user=current_user,
        new_data={
            "condition": condition,
            "joints": len(joints),
            "lines": len(lines),
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
        },
        ip_address=get_client_ip(request),
        rd_code=rd_code,
        summary=f"Экспорт отчёта готовности и квот НК ({len(joints)} стыков)",
    )
    return _xlsx_response(payload, "readiness_and_ndt_quotas.xlsx")


@router.get("/joints.xlsx")
async def export_joints_registry_xlsx(
    request: Request,
    line_id: uuid.UUID | None = Query(default=None),
    unique_line_id: str | None = Query(default=None),
    facility_id: uuid.UUID | None = Query(default=None),
    rd_code: str | None = Query(default=None),
    current_user: User = Depends(require_permission("can_export_documents")),
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    stmt = select(WeldJoint)
    if line_id is not None:
        stmt = stmt.where(WeldJoint.line_id == line_id)
    if facility_id is not None:
        stmt = stmt.where(WeldJoint.facility_id == facility_id)
    if unique_line_id:
        stmt = stmt.where(WeldJoint.unique_line_id == unique_line_id.strip())
    if rd_code:
        stmt = stmt.where(WeldJoint.rd_code == rd_code.strip())

    joints = list(
        (await session.execute(stmt.order_by(WeldJoint.sort_order.asc(), WeldJoint.joint_number.asc())))
        .scalars()
        .all()
    )
    payload = await asyncio.to_thread(build_joints_registry_workbook_bytes, joints)
    await record_audit_log(
        session,
        action="EXPORT",
        entity_type="joints_registry_xlsx",
        entity_id=unique_line_id or rd_code or "all",
        user=current_user,
        new_data={"rows": len(joints)},
        ip_address=get_client_ip(request),
        unique_line_id=unique_line_id,
        rd_code=rd_code,
        summary=f"Экспорт реестра стыков ({len(joints)} записей)",
    )
    return _xlsx_response(payload, "weld_joints_registry.xlsx")


@router.get("/joints-template.xlsx")
async def export_joints_template_xlsx(
    rd_code: str | None = Query(default=None),
    line_number: str | None = Query(default=None),
    _current_user: User = Depends(require_permission("can_export_documents")),
) -> Response:
    payload = await asyncio.to_thread(
        build_joints_template_workbook_bytes,
        rd_code=rd_code or "0092.049.Р.13/1 0004 УКПГ.045.0077.001-ТХ3",
        line_number=line_number or "ФП1.2/1",
    )
    return _xlsx_response(payload, "ZAYCHICK_Shablon_Import_Stykov.xlsx")


@router.get("/linelist.xlsx")
async def export_linelist_xlsx(
    request: Request,
    template: bool = Query(default=False),
    facility_id: uuid.UUID | None = Query(default=None),
    rd_code: str | None = Query(default=None),
    current_user: User = Depends(require_permission("can_export_documents")),
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    lines: list[ProjectLine] = []
    line_joints: list[WeldJoint] = []
    if not template:
        stmt = select(ProjectLine)
        if facility_id is not None:
            stmt = stmt.where(ProjectLine.facility_id == facility_id)
        if rd_code:
            stmt = stmt.where(ProjectLine.rd_code == rd_code.strip())
        lines = list((await session.execute(stmt.order_by(ProjectLine.sort_order.asc()))).scalars().all())
        if lines:
            line_ids = [line.id for line in lines]
            line_uids = [line.unique_line_id for line in lines if line.unique_line_id]
            j_filters = [WeldJoint.line_id.in_(line_ids)]
            if line_uids:
                j_filters.append(WeldJoint.unique_line_id.in_(line_uids))
            line_joints = list(
                (await session.execute(select(WeldJoint).where(or_(*j_filters)))).scalars().all()
            )
        await record_audit_log(
            session,
            action="EXPORT",
            entity_type="linelist_xlsx",
            entity_id=rd_code or "all",
            user=current_user,
            new_data={"rows": len(lines)},
            ip_address=get_client_ip(request),
            rd_code=rd_code,
            summary=f"Экспорт проектного лайнлиста ({len(lines)} линий)",
        )
    payload = await asyncio.to_thread(
        build_linelist_workbook_bytes,
        lines,
        joints=line_joints,
        is_template=template,
    )
    filename = "ZAYCHICK_Shablon_LineList.xlsx" if template else "ZAYCHICK_Project_LineList.xlsx"
    return _xlsx_response(payload, filename)


@router.get("/lrv.xlsx")
async def export_lrv_xlsx(
    request: Request,
    template: bool = Query(default=False),
    facility_id: uuid.UUID | None = Query(default=None),
    rd_code: str | None = Query(default=None),
    current_user: User = Depends(require_permission("can_export_documents")),
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    items: list[LrvItem] = []
    if not template:
        stmt = select(LrvItem)
        if facility_id is not None:
            stmt = stmt.where(LrvItem.facility_id == facility_id)
        if rd_code:
            stmt = stmt.where(LrvItem.rd_code == rd_code.strip())
        items = list((await session.execute(stmt.order_by(LrvItem.sort_order.asc()))).scalars().all())
        await record_audit_log(
            session,
            action="EXPORT",
            entity_type="lrv_catalog_xlsx",
            entity_id=rd_code or "all",
            user=current_user,
            new_data={"rows": len(items)},
            ip_address=get_client_ip(request),
            rd_code=rd_code,
            summary=f"Экспорт каталога ЛРВ ({len(items)} позиций)",
        )
    payload = await asyncio.to_thread(build_lrv_workbook_bytes, items, is_template=template)
    filename = "ZAYCHICK_Shablon_LRV.xlsx" if template else "ZAYCHICK_Katalog_LRV.xlsx"
    return _xlsx_response(payload, filename)


@router.get("/laboratory.xlsx")
async def export_laboratory_xlsx(
    request: Request,
    object_name: str | None = Query(default=None),
    rd_code: str | None = Query(default=None),
    search_query: str | None = Query(default=None),
    current_user: User = Depends(require_permission("can_export_documents")),
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    obj_clean = object_name.strip() if object_name and object_name.strip().upper() != "ALL" else None
    rd_clean = rd_code.strip() if rd_code and rd_code.strip().upper() != "ALL" else None

    j_stmt = select(WeldJoint)
    r_stmt = select(NdtLabRequestModel)
    if obj_clean:
        j_stmt = j_stmt.where(WeldJoint.object_name == obj_clean)
        r_stmt = r_stmt.where(NdtLabRequestModel.object_name == obj_clean)
    if rd_clean:
        j_stmt = j_stmt.where(WeldJoint.rd_code == rd_clean)
        r_stmt = r_stmt.where(NdtLabRequestModel.rd_code == rd_clean)

    joints = list(
        (await session.execute(j_stmt.order_by(WeldJoint.rd_code.asc(), WeldJoint.line_number.asc(), WeldJoint.joint_number.asc())))
        .scalars()
        .all()
    )
    lab_requests = list(
        (await session.execute(r_stmt.order_by(NdtLabRequestModel.created_at.desc())))
        .scalars()
        .all()
    )

    await record_audit_log(
        session,
        action="EXPORT",
        entity_type="laboratory_xlsx",
        entity_id=rd_clean or obj_clean or "all",
        user=current_user,
        new_data={"joints": len(joints), "requests": len(lab_requests)},
        ip_address=get_client_ip(request),
        rd_code=rd_clean,
        summary=f"Экспорт отчёта Лаборатории НК ({len(joints)} ст., {len(lab_requests)} заявок)",
    )

    payload = await asyncio.to_thread(
        build_laboratory_workbook_bytes,
        joints=joints,
        lab_requests=lab_requests,
        object_name=obj_clean,
        rd_code=rd_clean,
        search_query=search_query,
    )
    filename = f"ZAYCHICK_Laboratory_NK_{date.today().isoformat()}.xlsx"
    return _xlsx_response(payload, filename)
