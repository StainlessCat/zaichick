from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import DepartmentEnum, ExecutiveDocStatusEnum
from app.models.executive_doc import ExecutiveDoc
from app.models.line import ProjectLine
from app.models.user import User
from app.schemas.domain import ProjectLineOut
from app.schemas.executive_doc import ExecutiveDocOut, ExecutiveDocUpsert
from app.services.audit_service import extract_changed_fields, record_audit_log
from app.services.crud_helpers import enforce_optimistic_lock, orm_snapshot
from app.services.event_bus import publish_domain_event

EXECUTIVE_DOC_ALLOWED_DEPTS: tuple[DepartmentEnum, ...] = (
    DepartmentEnum.PTO,
    DepartmentEnum.SK,
)


async def _sync_line_from_executive_doc(
    session: AsyncSession,
    line: ProjectLine,
    record: ExecutiveDoc,
    *,
    user: User,
    now: datetime,
) -> None:
    """Keep ProjectLine.id_status and responsible_pto synchronized with ExecutiveDoc."""
    next_pto = (record.pto_engineer or "").strip() or None
    current_pto = (line.responsible_pto or "").strip() or None
    line_changed = False

    if line.id_status != record.id_status:
        line.id_status = record.id_status
        line_changed = True
    if current_pto != next_pto:
        line.responsible_pto = next_pto
        line_changed = True

    if not line_changed:
        return

    line.version = int(line.version) + 1
    line.updated_by_id = user.id
    line.updated_at = now
    await session.flush()

    line_snap = orm_snapshot(line, schema_cls=ProjectLineOut)
    await publish_domain_event(
        session,
        event="line.updated",
        entity_type="project_line",
        entity_id=line.id,
        data=line_snap,
        version=line.version,
        updated_by=user.login,
    )


async def list_executive_docs(
    session: AsyncSession,
    *,
    facility_id: uuid.UUID | None = None,
    object_name: str | None = None,
) -> list[ExecutiveDocOut]:
    stmt = select(ExecutiveDoc)
    if facility_id is not None or (object_name and object_name.strip() and object_name != "ALL"):
        stmt = stmt.join(ProjectLine, ExecutiveDoc.line_id == ProjectLine.id)
        if facility_id is not None:
            stmt = stmt.where(ProjectLine.facility_id == facility_id)
        if object_name and object_name.strip() and object_name != "ALL":
            stmt = stmt.where(ProjectLine.object_name == object_name.strip())

    stmt = stmt.order_by(ExecutiveDoc.updated_at.desc())
    rows = (await session.execute(stmt)).scalars().all()
    return [ExecutiveDocOut.model_validate(row) for row in rows]


async def upsert_executive_doc(
    session: AsyncSession,
    line_id: uuid.UUID,
    payload: ExecutiveDocUpsert,
    *,
    user: User,
    ip_address: str | None = None,
) -> ExecutiveDocOut:
    line = (
        await session.execute(select(ProjectLine).where(ProjectLine.id == line_id))
    ).scalar_one_or_none()
    if line is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Линия лайнлиста не найдена.",
        )

    existing = (
        await session.execute(select(ExecutiveDoc).where(ExecutiveDoc.line_id == line_id))
    ).scalar_one_or_none()

    patch_fields = payload.model_dump(exclude_unset=True)
    expected_version = patch_fields.pop("version", None)
    now = datetime.now(timezone.utc)

    if existing is None:
        initial_note = patch_fields.get("note_text")
        record = ExecutiveDoc(
            line_id=line.id,
            priority=patch_fields.get("priority"),
            id_status=patch_fields.get(
                "id_status",
                line.id_status or ExecutiveDocStatusEnum.IN_WORK,
            ),
            work_producer=patch_fields.get("work_producer"),
            pto_engineer=patch_fields.get("pto_engineer", line.responsible_pto),
            pre_stage_status=patch_fields.get("pre_stage_status", "NOT_SIGNED"),
            physics_status=patch_fields.get("physics_status", "NOT_ACCEPTED"),
            geodesy_status=patch_fields.get("geodesy_status", "NOT_SIGNED"),
            note_text=initial_note,
            note_updated_at=now if initial_note else None,
            version=1,
            updated_by_id=user.id,
        )
        session.add(record)
        await session.flush()

        new_snap = orm_snapshot(record, schema_cls=ExecutiveDocOut)
        await record_audit_log(
            session,
            action="executive_doc_created",
            entity_type="executive_doc",
            entity_id=record.id,
            user=user,
            old_data=None,
            new_data=new_snap,
            ip_address=ip_address,
            unique_line_id=line.unique_line_id,
            rd_code=line.rd_code,
            summary=f"Заполнены данные ИД по линии {line.unique_line_id}",
        )
        out = ExecutiveDocOut.model_validate(record)
        await publish_domain_event(
            session,
            event="executive_doc.updated",
            entity_type="executive_doc",
            entity_id=record.line_id,
            data=out.model_dump(mode="json"),
            version=record.version,
            updated_by=user.full_name,
        )
        await _sync_line_from_executive_doc(session, line, record, user=user, now=now)
        await session.commit()
        return out

    if expected_version is not None:
        enforce_optimistic_lock(
            entity_type="executive_doc",
            entity_obj=existing,
            expected_version=expected_version,
            patch_data=patch_fields,
            schema_cls=ExecutiveDocOut,
        )

    old_snap = orm_snapshot(existing, schema_cls=ExecutiveDocOut)
    changed_any = False

    if "priority" in patch_fields and existing.priority != patch_fields["priority"]:
        existing.priority = patch_fields["priority"]
        changed_any = True

    if (
        "id_status" in patch_fields
        and patch_fields["id_status"] is not None
        and existing.id_status != patch_fields["id_status"]
    ):
        existing.id_status = patch_fields["id_status"]
        changed_any = True

    if "work_producer" in patch_fields and existing.work_producer != patch_fields["work_producer"]:
        existing.work_producer = patch_fields["work_producer"]
        changed_any = True

    if "pto_engineer" in patch_fields and existing.pto_engineer != patch_fields["pto_engineer"]:
        existing.pto_engineer = patch_fields["pto_engineer"]
        changed_any = True

    if (
        "pre_stage_status" in patch_fields
        and patch_fields["pre_stage_status"] is not None
        and existing.pre_stage_status != patch_fields["pre_stage_status"]
    ):
        existing.pre_stage_status = patch_fields["pre_stage_status"]
        changed_any = True

    if (
        "physics_status" in patch_fields
        and patch_fields["physics_status"] is not None
        and existing.physics_status != patch_fields["physics_status"]
    ):
        existing.physics_status = patch_fields["physics_status"]
        changed_any = True

    if (
        "geodesy_status" in patch_fields
        and patch_fields["geodesy_status"] is not None
        and existing.geodesy_status != patch_fields["geodesy_status"]
    ):
        existing.geodesy_status = patch_fields["geodesy_status"]
        changed_any = True

    if "note_text" in patch_fields:
        next_note = patch_fields["note_text"]
        if (existing.note_text or None) != (next_note or None):
            existing.note_text = next_note
            existing.note_updated_at = now if next_note else None
            changed_any = True

    if not changed_any:
        return ExecutiveDocOut.model_validate(existing)

    existing.version = int(existing.version) + 1
    existing.updated_by_id = user.id
    existing.updated_at = now
    await session.flush()

    new_snap = orm_snapshot(existing, schema_cls=ExecutiveDocOut)
    old_diff, new_diff = extract_changed_fields(old_snap, new_snap)
    await record_audit_log(
        session,
        action="executive_doc_updated",
        entity_type="executive_doc",
        entity_id=existing.id,
        user=user,
        old_data=old_diff,
        new_data=new_diff,
        ip_address=ip_address,
        unique_line_id=line.unique_line_id,
        rd_code=line.rd_code,
        summary=f"Обновлены данные ИД по линии {line.unique_line_id}",
    )

    out = ExecutiveDocOut.model_validate(existing)
    await publish_domain_event(
        session,
        event="executive_doc.updated",
        entity_type="executive_doc",
        entity_id=existing.line_id,
        data=out.model_dump(mode="json"),
        version=existing.version,
        updated_by=user.full_name,
    )
    await _sync_line_from_executive_doc(session, line, existing, user=user, now=now)
    await session.commit()
    return out
