from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, require_roles, require_superadmin
from app.core.database import get_db_session
from app.core.security import hash_password, verify_password
from app.models.enums import DepartmentEnum, SystemRoleEnum
from app.models.facility import Facility
from app.models.joint import WeldJoint
from app.models.lab_request import NdtLabRequestModel
from app.models.line import ProjectLine
from app.models.lrv import LrvItem
from app.models.user import User
from app.schemas.auth import (
    CreateUserRequest,
    ProjectPurgeRequest,
    ProjectPurgeResponse,
    UpdateUserRequest,
    UserPublicSchema,
)
from app.services.audit_service import extract_changed_fields, record_audit_log
from app.services.event_bus import publish_domain_event
from app.services.rbac import validate_role_department_pair

router = APIRouter(prefix="/api/admin", tags=["admin"])

_DEPT_ADMIN_MANAGED_ROLES = frozenset({SystemRoleEnum.OPERATOR, SystemRoleEnum.VIEWER})


def user_snapshot(user: User) -> dict[str, object]:
    return {
        "login": user.login,
        "full_name": user.full_name,
        "role": user.role.value,
        "department": user.department.value,
        "position_title": user.position_title,
        "is_active": user.is_active,
        "must_change_password": user.must_change_password,
        "version": user.version,
    }


async def list_managed_users(
    actor: User,
    session: AsyncSession,
) -> list[UserPublicSchema]:
    stmt = select(User)
    if actor.role == SystemRoleEnum.DEPT_ADMIN:
        stmt = stmt.where(User.department == actor.department)
    elif actor.role != SystemRoleEnum.SUPERADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Просмотр списка пользователей доступен только администратору отдела или суперадмину.",
        )

    users = (
        await session.execute(stmt.order_by(User.created_at.asc(), User.login.asc()))
    ).scalars().all()
    return [UserPublicSchema.model_validate(u) for u in users]


async def create_managed_user(
    payload: CreateUserRequest,
    request: Request,
    actor: User,
    session: AsyncSession,
) -> UserPublicSchema:
    try:
        validate_role_department_pair(payload.role, payload.department)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    if actor.role == SystemRoleEnum.DEPT_ADMIN:
        if payload.department != actor.department:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Администратор отдела может создавать пользователей только внутри своего отдела.",
            )
        if payload.role not in _DEPT_ADMIN_MANAGED_ROLES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Администратор отдела может назначать только роли OPERATOR и VIEWER.",
            )
    elif actor.role != SystemRoleEnum.SUPERADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для создания пользователей.",
        )

    normalized_login = payload.login.strip().lower()
    existing = (
        await session.execute(
            select(User.id).where(func.lower(func.btrim(User.login)) == normalized_login)
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Пользователь с логином «{payload.login.strip()}» уже существует.",
        )

    now = datetime.now(timezone.utc)
    new_user = User(
        login=payload.login.strip(),
        password_hash=hash_password(payload.password),
        full_name=payload.full_name.strip(),
        role=payload.role,
        department=payload.department,
        position_title=payload.position_title.strip(),
        session_number=1,
        is_active=payload.is_active,
        must_change_password=payload.must_change_password,
        version=1,
        created_at=now,
        updated_at=now,
    )
    session.add(new_user)
    await session.flush()

    await record_audit_log(
        session,
        action="USER_CREATED",
        entity_type="user",
        entity_id=str(new_user.id),
        user=actor,
        new_data=user_snapshot(new_user),
        ip_address=get_client_ip(request),
        summary=(
            f"Создан пользователь «{new_user.login}» "
            f"({new_user.role.value} / {new_user.department.value})"
        ),
    )
    await session.commit()
    await session.refresh(new_user)
    return UserPublicSchema.model_validate(new_user)


async def update_managed_user(
    user_id: uuid.UUID,
    payload: UpdateUserRequest,
    request: Request,
    actor: User,
    session: AsyncSession,
) -> UserPublicSchema:
    target = (
        await session.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден.",
        )

    if payload.version is not None and target.version != payload.version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Конфликт версий учётной записи: ожидалась v{payload.version}, "
                f"актуальная v{target.version}."
            ),
        )

    next_role = payload.role if payload.role is not None else target.role
    next_department = payload.department if payload.department is not None else target.department

    try:
        validate_role_department_pair(next_role, next_department)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    if actor.role == SystemRoleEnum.DEPT_ADMIN:
        if target.department != actor.department:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Администратор отдела может редактировать только сотрудников своего отдела.",
            )
        if target.role not in _DEPT_ADMIN_MANAGED_ROLES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Администратор отдела может управлять только ролями OPERATOR и VIEWER.",
            )
        if next_department != actor.department:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Администратор отдела не может переводить сотрудников в другой отдел.",
            )
        if next_role not in _DEPT_ADMIN_MANAGED_ROLES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Администратор отдела не может повышать роль выше OPERATOR.",
            )
    elif actor.role != SystemRoleEnum.SUPERADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для редактирования пользователей.",
        )

    if target.id == actor.id and payload.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя деактивировать собственную учётную запись.",
        )

    is_losing_superadmin = (
        target.role == SystemRoleEnum.SUPERADMIN
        and target.is_active
        and (
            (payload.role is not None and payload.role != SystemRoleEnum.SUPERADMIN)
            or payload.is_active is False
        )
    )
    if is_losing_superadmin:
        other_active_superadmins = (
            await session.execute(
                select(func.count(User.id)).where(
                    User.role == SystemRoleEnum.SUPERADMIN,
                    User.is_active.is_(True),
                    User.id != target.id,
                )
            )
        ).scalar_one()
        if int(other_active_superadmins or 0) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Нельзя понизить или деактивировать последнего активного суперадмина.",
            )

    old_snap = user_snapshot(target)
    should_bump_session = False

    if payload.full_name is not None:
        target.full_name = payload.full_name.strip()
    if payload.role is not None and payload.role != target.role:
        target.role = payload.role
        should_bump_session = True
    if payload.department is not None and payload.department != target.department:
        target.department = payload.department
        should_bump_session = True
    if payload.position_title is not None:
        target.position_title = payload.position_title.strip()
    if payload.is_active is not None and payload.is_active != target.is_active:
        target.is_active = payload.is_active
        if not payload.is_active:
            should_bump_session = True
    if payload.must_change_password is not None:
        target.must_change_password = payload.must_change_password
    resolved_pwd = payload.resolved_password
    if resolved_pwd is not None:
        target.password_hash = hash_password(resolved_pwd)
        should_bump_session = True

    if should_bump_session:
        target.session_number += 1

    target.version += 1
    target.updated_at = datetime.now(timezone.utc)
    new_snap = user_snapshot(target)
    old_diff, new_diff = extract_changed_fields(old_snap, new_snap)
    if resolved_pwd is not None:
        new_diff = {**(new_diff or {}), "password_reset": True}

    await record_audit_log(
        session,
        action="USER_MODIFIED",
        entity_type="user",
        entity_id=str(target.id),
        user=actor,
        old_data=old_diff,
        new_data=new_diff,
        ip_address=get_client_ip(request),
        summary=f"Обновлена учётная запись «{target.login}» (v{target.version})",
    )
    await session.commit()
    await session.refresh(target)
    return UserPublicSchema.model_validate(target)


@router.get("/users", response_model=list[UserPublicSchema])
async def admin_list_users(
    current_user: User = Depends(
        require_roles(SystemRoleEnum.SUPERADMIN, SystemRoleEnum.DEPT_ADMIN)
    ),
    session: AsyncSession = Depends(get_db_session),
) -> list[UserPublicSchema]:
    """List users: SUPERADMIN sees all, DEPT_ADMIN sees only their own department."""
    return await list_managed_users(current_user, session)


@router.post("/users", response_model=UserPublicSchema, status_code=status.HTTP_201_CREATED)
async def admin_create_user(
    payload: CreateUserRequest,
    request: Request,
    current_user: User = Depends(
        require_roles(SystemRoleEnum.SUPERADMIN, SystemRoleEnum.DEPT_ADMIN)
    ),
    session: AsyncSession = Depends(get_db_session),
) -> UserPublicSchema:
    """Create user with strict SUPERADMIN / DEPT_ADMIN boundary checks."""
    return await create_managed_user(payload, request, current_user, session)


@router.patch("/users/{user_id}", response_model=UserPublicSchema)
async def admin_update_user(
    user_id: uuid.UUID,
    payload: UpdateUserRequest,
    request: Request,
    current_user: User = Depends(
        require_roles(SystemRoleEnum.SUPERADMIN, SystemRoleEnum.DEPT_ADMIN)
    ),
    session: AsyncSession = Depends(get_db_session),
) -> UserPublicSchema:
    """Update user role/department/status/password with strict hierarchy checks."""
    return await update_managed_user(user_id, payload, request, current_user, session)


@router.post("/projects/{project_id}/purge", response_model=ProjectPurgeResponse)
async def purge_project_data(
    project_id: str,
    payload: ProjectPurgeRequest,
    request: Request,
    current_user: User = Depends(require_superadmin()),
    session: AsyncSession = Depends(get_db_session),
) -> ProjectPurgeResponse:
    """
    Purge operational data of a single project (Facility) strictly by SUPERADMIN.
    Requires double confirmation: valid superadmin password + exact project name or short code.
    """
    if not verify_password(payload.password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Неверный пароль суперадмина. Очистка данных проекта отменена.",
        )

    facility: Facility | None = None
    try:
        fac_uuid = uuid.UUID(project_id.strip())
        facility = (
            await session.execute(select(Facility).where(Facility.id == fac_uuid))
        ).scalar_one_or_none()
    except (ValueError, TypeError):
        facility = None

    if facility is None:
        facility = (
            await session.execute(
                select(Facility).where(
                    or_(
                        Facility.external_id == project_id.strip(),
                        Facility.name == project_id.strip(),
                    )
                )
            )
        ).scalar_one_or_none()

    if facility is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Проект (объект) «{project_id}» не найден.",
        )

    expected_confirm_values = {
        v.strip()
        for v in (facility.name, facility.short_name, facility.external_id or "")
        if v and v.strip()
    }
    if payload.confirm_name.strip() not in expected_confirm_values:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Подтверждающее название не совпадает с названием или кодом проекта "
                f"«{facility.name}»."
            ),
        )

    line_rows = (
        await session.execute(
            select(ProjectLine.id, ProjectLine.unique_line_id).where(
                or_(
                    ProjectLine.facility_id == facility.id,
                    ProjectLine.object_name == facility.name,
                )
            )
        )
    ).all()
    line_ids = [row[0] for row in line_rows]
    line_uids = [row[1] for row in line_rows if row[1]]

    joint_conditions = [
        WeldJoint.facility_id == facility.id,
        WeldJoint.object_name == facility.name,
    ]
    if line_ids:
        joint_conditions.append(WeldJoint.line_id.in_(line_ids))
    if line_uids:
        joint_conditions.append(WeldJoint.unique_line_id.in_(line_uids))

    lab_conditions = [NdtLabRequestModel.object_name == facility.name]
    if line_uids:
        lab_conditions.append(NdtLabRequestModel.unique_line_id.in_(line_uids))

    lrv_conditions = [
        LrvItem.facility_id == facility.id,
        LrvItem.object_name == facility.name,
    ]
    line_conditions = [
        ProjectLine.facility_id == facility.id,
        ProjectLine.object_name == facility.name,
    ]

    deleted_joints = int(
        (await session.execute(delete(WeldJoint).where(or_(*joint_conditions)))).rowcount or 0
    )
    deleted_lab_requests = int(
        (await session.execute(delete(NdtLabRequestModel).where(or_(*lab_conditions)))).rowcount
        or 0
    )
    deleted_lines = int(
        (await session.execute(delete(ProjectLine).where(or_(*line_conditions)))).rowcount or 0
    )
    deleted_lrv = int(
        (await session.execute(delete(LrvItem).where(or_(*lrv_conditions)))).rowcount or 0
    )

    deleted_counts = {
        "weld_joints": deleted_joints,
        "ndt_lab_requests": deleted_lab_requests,
        "project_lines": deleted_lines,
        "lrv_items": deleted_lrv,
    }
    total_deleted = sum(deleted_counts.values())
    client_ip = get_client_ip(request)

    await record_audit_log(
        session,
        action="PROJECT_PURGED",
        entity_type="facility",
        entity_id=str(facility.id),
        user=current_user,
        new_data={
            "project_id": str(facility.id),
            "project_name": facility.name,
            "deleted_counts": deleted_counts,
            "total_deleted": total_deleted,
            "ip_address": client_ip,
        },
        ip_address=client_ip,
        summary=(
            f"Очищены производственные данные проекта «{facility.name}»: "
            f"стыков {deleted_joints}, линий {deleted_lines}, ЛРВ {deleted_lrv}, заявок НК {deleted_lab_requests}"
        ),
    )
    await publish_domain_event(
        session,
        event="project.purged",
        entity_type="facility",
        entity_id=str(facility.id),
        version=facility.version,
        updated_by=current_user.login,
        data={"project_id": str(facility.id), "deleted_counts": deleted_counts},
    )
    await session.commit()

    return ProjectPurgeResponse(
        status="ok",
        project_id=str(facility.id),
        project_name=facility.name,
        deleted_counts=deleted_counts,
        total_deleted=total_deleted,
    )
