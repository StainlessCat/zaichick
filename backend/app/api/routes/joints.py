from __future__ import annotations

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_client_ip, get_current_user, get_db_session, require_permission
from app.models.enums import ControlResultEnum, NdtMethodEnum, RoleEnum
from app.models.joint import WeldJoint
from app.models.line import ProjectLine
from app.models.lrv import LrvItem
from app.models.user import User
from app.models.welding_tech import TechCard, Welder, WeldingMaterial
from app.schemas.domain import (
    JointValidationResultOut,
    PaginatedResponse,
    ValidationIssueOut,
    WeldJointBulkUpdateRequest,
    WeldJointCreate,
    WeldJointOut,
    WeldJointUpdate,
    WeldJointValidateRequest,
)
from app.services.audit_service import extract_changed_fields, record_audit_log
from app.services.crud_helpers import (
    apply_patch_fields,
    enforce_optimistic_lock,
    issue_to_dict,
    orm_snapshot,
    raise_domain_validation_error,
    raise_duplicate_error,
)
from app.services.domain_validation import (
    JointValidationSummary,
    build_unique_line_id,
    validate_weld_joint_comprehensive,
)
from app.services.event_bus import event_bus
from app.services.pipe_calc import calculate_equivalent_dia_inch, mm_to_inch_diameter
from app.services.rbac import find_forbidden_joint_fields

router = APIRouter(prefix="/api/joints", tags=["joints"])

JOINT_EDIT_ROLES = {RoleEnum.ADMIN, RoleEnum.PTO, RoleEnum.PIL}


async def _load_validation_context(session: AsyncSession) -> dict[str, Any]:
    all_joints = list((await session.execute(select(WeldJoint))).scalars().all())
    lines = list((await session.execute(select(ProjectLine))).scalars().all())
    lrv_catalog = list((await session.execute(select(LrvItem))).scalars().all())
    welders = list(
        (await session.execute(select(Welder).options(selectinload(Welder.naks_certs))))
        .scalars()
        .all()
    )
    tech_cards = list(
        (await session.execute(select(TechCard).options(selectinload(TechCard.preheat_rules))))
        .scalars()
        .all()
    )
    welding_materials = list((await session.execute(select(WeldingMaterial))).scalars().all())
    return {
        "all_joints": all_joints,
        "lines": lines,
        "lrv_catalog": lrv_catalog,
        "welders": welders,
        "tech_cards": tech_cards,
        "welding_materials": welding_materials,
    }


def _find_matching_line(
    joint_like: Any,
    lines: list[ProjectLine],
) -> ProjectLine | None:
    line_id = getattr(joint_like, "line_id", None)
    if line_id is not None:
        for line in lines:
            if line.id == line_id:
                return line
    uid = (getattr(joint_like, "unique_line_id", "") or "").strip()
    if uid:
        for line in lines:
            if line.unique_line_id == uid:
                return line
    return None


def _build_joint_orm(
    payload: WeldJointCreate,
    matched_line: ProjectLine,
    user: User,
) -> WeldJoint:
    now = datetime.now(timezone.utc)
    rd_code = payload.rd_code.strip() or matched_line.rd_code
    line_number = payload.line_number.strip() or matched_line.line_number
    unique_line_id = (
        payload.unique_line_id.strip()
        or matched_line.unique_line_id
        or build_unique_line_id(rd_code, line_number)
    )
    diameter_inch = payload.diameter_inch.strip() or mm_to_inch_diameter(payload.diameter_mm)
    equiv_dia = payload.equiv_diameter_inch
    if equiv_dia is None and payload.diameter_mm > 0:
        equiv_dia = calculate_equivalent_dia_inch(diameter_inch or payload.diameter_mm, payload.wall_thickness)

    return WeldJoint(
        id=uuid.uuid4(),
        legacy_id=payload.legacy_id,
        line_id=matched_line.id,
        facility_id=payload.facility_id or matched_line.facility_id,
        lrv1_item_id=payload.lrv1_item_id,
        lrv2_item_id=payload.lrv2_item_id,
        tech_card_id=payload.tech_card_id,
        updated_by_id=user.id,
        object_name=payload.object_name.strip() or matched_line.object_name,
        rd_code=rd_code,
        contour=payload.contour.strip() or matched_line.test_contour,
        line_number=line_number,
        unique_line_id=unique_line_id,
        joint_number=payload.joint_number.strip(),
        is_supplementary=payload.is_supplementary,
        joint_kind=payload.joint_kind,
        joint_type=payload.joint_type,
        diameter_mm=payload.diameter_mm,
        diameter_inch=diameter_inch,
        equiv_diameter_inch=equiv_dia,
        wall_thickness=payload.wall_thickness,
        lrv1_code=payload.lrv1_code.strip(),
        elem1_name=payload.elem1_name,
        elem1_material=payload.elem1_material,
        elem1_ntd=payload.elem1_ntd,
        elem1_diameter_mm=payload.elem1_diameter_mm,
        elem1_wall_thickness=payload.elem1_wall_thickness,
        elem1_factory_number=payload.elem1_factory_number,
        elem1_manufacturer=payload.elem1_manufacturer,
        elem1_length=payload.elem1_length,
        elem1_cert_number=payload.elem1_cert_number,
        elem1_heat_number=payload.elem1_heat_number,
        elem1_batch_number=payload.elem1_batch_number,
        lrv2_code=payload.lrv2_code.strip(),
        elem2_name=payload.elem2_name,
        elem2_material=payload.elem2_material,
        elem2_ntd=payload.elem2_ntd,
        elem2_diameter_mm=payload.elem2_diameter_mm,
        elem2_wall_thickness=payload.elem2_wall_thickness,
        elem2_factory_number=payload.elem2_factory_number,
        elem2_manufacturer=payload.elem2_manufacturer,
        elem2_length=payload.elem2_length,
        elem2_cert_number=payload.elem2_cert_number,
        elem2_heat_number=payload.elem2_heat_number,
        elem2_batch_number=payload.elem2_batch_number,
        welding_type=payload.welding_type.strip(),
        gost_joint_type=payload.gost_joint_type,
        welding_position=payload.welding_position,
        welding_date=payload.welding_date,
        welder_stamp=payload.welder_stamp.strip(),
        welder_stamps_list=list(payload.welder_stamps_list) if payload.welder_stamps_list is not None else None,
        brigade_stamp=payload.brigade_stamp,
        welding_materials=payload.welding_materials,
        ambient_temp_c=payload.ambient_temp_c,
        weather_source=payload.weather_source,
        preheat_temp=payload.preheat_temp,
        responsible_person=payload.responsible_person,
        welder_full_name=payload.welder_full_name,
        welder_cert_number=payload.welder_cert_number,
        tech_card_number=payload.tech_card_number.strip(),
        vik_result=payload.vik_result,
        vik_date=payload.vik_date,
        vik_inspector=payload.vik_inspector,
        vik_report_number=payload.vik_report_number,
        ndt_type=payload.ndt_type,
        ndt_date=payload.ndt_date,
        ndt_result=payload.ndt_result,
        ndt_inspector=payload.ndt_inspector,
        ndt_report_number=payload.ndt_report_number,
        dup_ndt_type=payload.dup_ndt_type,
        dup_ndt_date=payload.dup_ndt_date,
        dup_ndt_result=payload.dup_ndt_result,
        dup_ndt_inspector=payload.dup_ndt_inspector,
        dup_ndt_report_number=payload.dup_ndt_report_number,
        root_weld_control=payload.root_weld_control,
        steeloscopy_info=payload.steeloscopy_info,
        heat_treat_operator=payload.heat_treat_operator,
        heat_treat_diagram_number=payload.heat_treat_diagram_number,
        hardness_test_info=payload.hardness_test_info,
        ferrite_phase_info=payload.ferrite_phase_info,
        repair_action=payload.repair_action,
        repair_date=payload.repair_date,
        repair_tech_card=payload.repair_tech_card,
        repair_welder_stamp=payload.repair_welder_stamp,
        repair_foreman=payload.repair_foreman,
        repair_length_mm=payload.repair_length_mm,
        repair_defect_type=payload.repair_defect_type,
        repair_count=payload.repair_count,
        repair_vik_number=payload.repair_vik_number,
        repair_vik_date=payload.repair_vik_date,
        repair_vik_result=payload.repair_vik_result,
        repair_vik_inspector=payload.repair_vik_inspector,
        repair_ndt_type=payload.repair_ndt_type,
        repair_ndt_number=payload.repair_ndt_number,
        repair_ndt_date=payload.repair_ndt_date,
        repair_ndt_result=payload.repair_ndt_result,
        repair_ndt_inspector=payload.repair_ndt_inspector,
        repair_dup_ndt_type=payload.repair_dup_ndt_type,
        repair_dup_ndt_number=payload.repair_dup_ndt_number,
        repair_dup_ndt_date=payload.repair_dup_ndt_date,
        repair_dup_ndt_result=payload.repair_dup_ndt_result,
        repair_dup_ndt_inspector=payload.repair_dup_ndt_inspector,
        sort_order=payload.sort_order,
        version=1,
        updated_by=user.login,
        created_at=now,
        updated_at=now,
    )


def _make_candidate_namespace(joint: WeldJoint, patch_data: dict[str, Any]) -> SimpleNamespace:
    snap = {
        col.key: getattr(joint, col.key)
        for col in joint.__class__.__mapper__.column_attrs
    }
    for k, v in patch_data.items():
        if k in ("id", "version", "created_at", "updated_at", "updated_by", "updated_by_id"):
            continue
        if k in snap:
            snap[k] = v
    return SimpleNamespace(**snap)


def _check_duplicate_joint_number(
    *,
    line_id: uuid.UUID,
    joint_number: str,
    all_joints: list[WeldJoint],
    exclude_id: uuid.UUID | None = None,
) -> None:
    norm = joint_number.strip().lower()
    if not norm:
        return
    for other in all_joints:
        if exclude_id is not None and other.id == exclude_id:
            continue
        if other.line_id == line_id and (other.joint_number or "").strip().lower() == norm:
            raise_duplicate_error(
                "DUPLICATE_JOINT_NUMBER",
                f"Стык № «{joint_number.strip()}» уже существует на данной линии.",
                details={
                    "line_id": str(line_id),
                    "joint_number": joint_number.strip(),
                    "existing_joint_id": str(other.id),
                },
            )


def _run_validation_for_joint(
    joint_like: Any,
    ctx: dict[str, Any],
) -> JointValidationSummary:
    matched_line = _find_matching_line(joint_like, ctx["lines"])
    return validate_weld_joint_comprehensive(
        joint=joint_like,
        all_joints=ctx["all_joints"],
        matched_line=matched_line,
        lrv_catalog=ctx["lrv_catalog"],
        welders=ctx["welders"],
        tech_cards=ctx["tech_cards"],
        welding_materials=ctx["welding_materials"],
    )


def _to_joint_out(joint: WeldJoint, summary: JointValidationSummary | None = None) -> WeldJointOut:
    out = WeldJointOut.model_validate(joint)
    if summary is not None:
        out.warnings = [ValidationIssueOut(**issue_to_dict(w)) for w in summary.warnings]
    return out


@router.get("", response_model=PaginatedResponse[WeldJointOut])
async def list_joints(
    line_id: uuid.UUID | None = Query(default=None),
    facility_id: uuid.UUID | None = Query(default=None),
    unique_line_id: str | None = Query(default=None),
    rd_code: str | None = Query(default=None),
    welder_stamp: str | None = Query(default=None),
    vik_result: ControlResultEnum | None = Query(default=None),
    ndt_result: ControlResultEnum | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> PaginatedResponse[WeldJointOut]:
    stmt = select(WeldJoint)
    if line_id is not None:
        stmt = stmt.where(WeldJoint.line_id == line_id)
    if facility_id is not None:
        stmt = stmt.where(WeldJoint.facility_id == facility_id)
    if unique_line_id:
        stmt = stmt.where(WeldJoint.unique_line_id == unique_line_id.strip())
    if rd_code:
        stmt = stmt.where(WeldJoint.rd_code == rd_code.strip())
    if welder_stamp:
        stmt = stmt.where(WeldJoint.welder_stamp.ilike(f"%{welder_stamp.strip()}%"))
    if vik_result is not None:
        stmt = stmt.where(WeldJoint.vik_result == vik_result)
    if ndt_result is not None:
        stmt = stmt.where(WeldJoint.ndt_result == ndt_result)
    if search:
        pat = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                WeldJoint.joint_number.ilike(pat),
                WeldJoint.line_number.ilike(pat),
                WeldJoint.welder_stamp.ilike(pat),
                WeldJoint.tech_card_number.ilike(pat),
                WeldJoint.elem1_factory_number.ilike(pat),
                WeldJoint.elem2_factory_number.ilike(pat),
            )
        )
    all_rows = list(
        (await session.execute(stmt.order_by(WeldJoint.sort_order.asc(), WeldJoint.joint_number.asc())))
        .scalars()
        .all()
    )
    total = len(all_rows)
    page = all_rows[offset : offset + limit]
    return PaginatedResponse(
        items=[WeldJointOut.model_validate(j) for j in page],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{joint_id}", response_model=WeldJointOut)
async def get_joint(
    joint_id: uuid.UUID,
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> WeldJointOut:
    joint = (await session.execute(select(WeldJoint).where(WeldJoint.id == joint_id))).scalar_one_or_none()
    if joint is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Стык не найден.")
    return WeldJointOut.model_validate(joint)


@router.post("/validate", response_model=JointValidationResultOut)
async def validate_joint_payload(
    payload: WeldJointValidateRequest,
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> JointValidationResultOut:
    ctx = await _load_validation_context(session)
    matched_line = _find_matching_line(payload.joint, ctx["lines"])
    if matched_line is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Линия лайнлиста (line_id) не найдена.",
        )
    dummy_user = SimpleNamespace(id=uuid.uuid4(), login="validator")
    candidate = _build_joint_orm(payload.joint, matched_line, dummy_user)  # type: ignore[arg-type]
    if payload.joint_id is not None:
        candidate.id = payload.joint_id
    summary = validate_weld_joint_comprehensive(
        joint=candidate,
        all_joints=ctx["all_joints"],
        matched_line=matched_line,
        lrv_catalog=ctx["lrv_catalog"],
        welders=ctx["welders"],
        tech_cards=ctx["tech_cards"],
        welding_materials=ctx["welding_materials"],
    )
    return JointValidationResultOut(
        is_valid_to_save=summary.is_valid_to_save,
        errors=[ValidationIssueOut(**issue_to_dict(e)) for e in summary.errors],
        warnings=[ValidationIssueOut(**issue_to_dict(w)) for w in summary.warnings],
    )


@router.post("", response_model=WeldJointOut, status_code=status.HTTP_201_CREATED)
async def create_joint(
    payload: WeldJointCreate,
    request: Request,
    current_user: User = Depends(require_permission("can_create_or_delete_joints")),
    session: AsyncSession = Depends(get_db_session),
) -> WeldJointOut:
    ctx = await _load_validation_context(session)
    matched_line = _find_matching_line(payload, ctx["lines"])
    if matched_line is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Указанная линия лайнлиста не найдена.",
        )

    _check_duplicate_joint_number(
        line_id=matched_line.id,
        joint_number=payload.joint_number,
        all_joints=ctx["all_joints"],
    )

    candidate = _build_joint_orm(payload, matched_line, current_user)
    summary = validate_weld_joint_comprehensive(
        joint=candidate,
        all_joints=ctx["all_joints"],
        matched_line=matched_line,
        lrv_catalog=ctx["lrv_catalog"],
        welders=ctx["welders"],
        tech_cards=ctx["tech_cards"],
        welding_materials=ctx["welding_materials"],
    )
    if not summary.is_valid_to_save:
        raise_domain_validation_error(summary)

    session.add(candidate)
    await session.flush()

    snapshot = orm_snapshot(candidate, WeldJointOut)
    await record_audit_log(
        session,
        action="CREATE",
        entity_type="weld_joint",
        entity_id=str(candidate.id),
        user=current_user,
        new_data=snapshot,
        ip_address=get_client_ip(request),
        joint_number=candidate.joint_number,
        unique_line_id=candidate.unique_line_id,
        rd_code=candidate.rd_code,
        summary=f"Создан стык № {candidate.joint_number} на линии {candidate.unique_line_id}",
    )
    await event_bus.emit_delta(
        session,
        event="joint.created",
        entity_type="weld_joint",
        entity_id=candidate.id,
        version=candidate.version,
        updated_by=current_user.login,
        data=snapshot,
    )
    return _to_joint_out(candidate, summary)


def _apply_joint_patch_and_validate(
    *,
    joint: WeldJoint,
    patch_data: dict[str, Any],
    expected_version: int,
    user: User,
    ctx: dict[str, Any],
) -> tuple[dict[str, Any], JointValidationSummary]:
    existing_raw = {
        col.key: getattr(joint, col.key)
        for col in joint.__class__.__mapper__.column_attrs
    }
    forbidden = find_forbidden_joint_fields(
        user.role,
        patch_data,
        existing_values=existing_raw,
        is_create=False,
    )
    if forbidden:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "FIELD_RBAC_FORBIDDEN",
                "message": (
                    f"Роль {user.role.value} не имеет права изменять поля: {', '.join(forbidden)}."
                ),
                "forbidden_fields": forbidden,
            },
        )

    enforce_optimistic_lock(
        entity_type="weld_joint",
        entity_obj=joint,
        expected_version=expected_version,
        patch_data=patch_data,
        schema_cls=WeldJointOut,
    )

    if "joint_number" in patch_data and patch_data["joint_number"] is not None:
        _check_duplicate_joint_number(
            line_id=joint.line_id,
            joint_number=patch_data["joint_number"],
            all_joints=ctx["all_joints"],
            exclude_id=joint.id,
        )

    old_snap = orm_snapshot(joint, WeldJointOut)
    candidate = _make_candidate_namespace(joint, patch_data)
    if ("diameter_mm" in patch_data or "wall_thickness" in patch_data) and "equiv_diameter_inch" not in patch_data:
        if "diameter_mm" in patch_data and "diameter_inch" not in patch_data:
            candidate.diameter_inch = mm_to_inch_diameter(candidate.diameter_mm)
        if candidate.diameter_mm and candidate.diameter_mm > 0:
            candidate.equiv_diameter_inch = calculate_equivalent_dia_inch(
                candidate.diameter_inch or candidate.diameter_mm,
                candidate.wall_thickness or 0.0,
            )

    summary = _run_validation_for_joint(candidate, ctx)
    if not summary.is_valid_to_save:
        raise_domain_validation_error(summary)

    apply_patch_fields(joint, patch_data)
    if "diameter_mm" in patch_data and "diameter_inch" not in patch_data:
        joint.diameter_inch = candidate.diameter_inch
    if ("diameter_mm" in patch_data or "wall_thickness" in patch_data) and "equiv_diameter_inch" not in patch_data:
        joint.equiv_diameter_inch = candidate.equiv_diameter_inch
    joint.updated_by = user.login
    joint.updated_by_id = user.id
    joint.updated_at = datetime.now(timezone.utc)
    return old_snap, summary


@router.patch("/{joint_id}", response_model=WeldJointOut)
async def update_joint(
    joint_id: uuid.UUID,
    payload: WeldJointUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> WeldJointOut:
    if current_user.role not in JOINT_EDIT_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Роль {current_user.role.value} не имеет права редактировать стыки.",
        )

    joint = (await session.execute(select(WeldJoint).where(WeldJoint.id == joint_id))).scalar_one_or_none()
    if joint is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Стык не найден.")

    ctx = await _load_validation_context(session)
    patch_data = payload.model_dump(exclude_unset=True)
    old_snap, summary = _apply_joint_patch_and_validate(
        joint=joint,
        patch_data=patch_data,
        expected_version=payload.version,
        user=current_user,
        ctx=ctx,
    )
    await session.flush()

    new_snap = orm_snapshot(joint, WeldJointOut)
    old_diff, new_diff = extract_changed_fields(old_snap, new_snap)
    await record_audit_log(
        session,
        action="UPDATE",
        entity_type="weld_joint",
        entity_id=str(joint.id),
        user=current_user,
        old_data=old_diff,
        new_data=new_diff,
        ip_address=get_client_ip(request),
        joint_number=joint.joint_number,
        unique_line_id=joint.unique_line_id,
        rd_code=joint.rd_code,
        summary=f"Обновлён стык № {joint.joint_number} (v{joint.version})",
    )
    await event_bus.emit_delta(
        session,
        event="joint.updated",
        entity_type="weld_joint",
        entity_id=joint.id,
        version=joint.version,
        updated_by=current_user.login,
        data=new_snap,
    )
    return _to_joint_out(joint, summary)


@router.post("/bulk-update", response_model=list[WeldJointOut])
async def bulk_update_joints(
    payload: WeldJointBulkUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[WeldJointOut]:
    if current_user.role not in JOINT_EDIT_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Роль {current_user.role.value} не имеет права массово редактировать стыки.",
        )

    ctx = await _load_validation_context(session)
    joints_by_id: dict[uuid.UUID, WeldJoint] = {j.id: j for j in ctx["all_joints"]}
    updated_results: list[tuple[WeldJoint, dict[str, Any], JointValidationSummary]] = []

    for item in payload.items:
        joint = joints_by_id.get(item.id)
        if joint is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Стык {item.id} не найден.",
            )
        patch_data = item.model_dump(exclude_unset=True)
        patch_data.pop("id", None)
        old_snap, summary = _apply_joint_patch_and_validate(
            joint=joint,
            patch_data=patch_data,
            expected_version=item.version,
            user=current_user,
            ctx=ctx,
        )
        updated_results.append((joint, old_snap, summary))

    await session.flush()

    out_items: list[WeldJointOut] = []
    client_ip = get_client_ip(request)
    for joint, old_snap, summary in updated_results:
        new_snap = orm_snapshot(joint, WeldJointOut)
        old_diff, new_diff = extract_changed_fields(old_snap, new_snap)
        await record_audit_log(
            session,
            action="UPDATE",
            entity_type="weld_joint",
            entity_id=str(joint.id),
            user=current_user,
            old_data=old_diff,
            new_data=new_diff,
            ip_address=client_ip,
            joint_number=joint.joint_number,
            unique_line_id=joint.unique_line_id,
            rd_code=joint.rd_code,
            summary=f"Массовое обновление стыка № {joint.joint_number} (v{joint.version})",
        )
        await event_bus.emit_delta(
            session,
            event="joint.updated",
            entity_type="weld_joint",
            entity_id=joint.id,
            version=joint.version,
            updated_by=current_user.login,
            data=new_snap,
        )
        out_items.append(_to_joint_out(joint, summary))

    return out_items


@router.delete("/{joint_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_joint(
    joint_id: uuid.UUID,
    request: Request,
    expected_version: int | None = Query(default=None, alias="version"),
    current_user: User = Depends(require_permission("can_create_or_delete_joints")),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    joint = (await session.execute(select(WeldJoint).where(WeldJoint.id == joint_id))).scalar_one_or_none()
    if joint is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Стык не найден.")

    if expected_version is not None:
        enforce_optimistic_lock(
            entity_type="weld_joint",
            entity_obj=joint,
            expected_version=expected_version,
            patch_data={},
            schema_cls=WeldJointOut,
        )

    old_snap = orm_snapshot(joint, WeldJointOut)
    await session.delete(joint)
    await record_audit_log(
        session,
        action="DELETE",
        entity_type="weld_joint",
        entity_id=str(joint_id),
        user=current_user,
        old_data=old_snap,
        ip_address=get_client_ip(request),
        joint_number=joint.joint_number,
        unique_line_id=joint.unique_line_id,
        rd_code=joint.rd_code,
        summary=f"Удалён стык № {joint.joint_number} с линии {joint.unique_line_id}",
    )
    await event_bus.emit_delta(
        session,
        event="joint.deleted",
        entity_type="weld_joint",
        entity_id=joint_id,
        version=joint.version,
        updated_by=current_user.login,
        data={"id": str(joint_id)},
    )
