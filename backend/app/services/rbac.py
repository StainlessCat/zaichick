from __future__ import annotations

from collections.abc import Collection
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, status

from app.models.enums import DepartmentEnum, RecordStatusEnum, SystemRoleEnum

ROLE_RANK: dict[SystemRoleEnum, int] = {
    SystemRoleEnum.VIEWER: 0,
    SystemRoleEnum.OPERATOR: 1,
    SystemRoleEnum.DEPT_ADMIN: 2,
    SystemRoleEnum.SUPERADMIN: 3,
}

ROLE_LABELS_RU: dict[SystemRoleEnum, str] = {
    SystemRoleEnum.SUPERADMIN: "Суперадмин",
    SystemRoleEnum.DEPT_ADMIN: "Админ отдела",
    SystemRoleEnum.OPERATOR: "Пользователь",
    SystemRoleEnum.VIEWER: "Наблюдатель",
}

DEPARTMENT_LABELS_RU: dict[DepartmentEnum, str] = {
    DepartmentEnum.PTO: "ПТО",
    DepartmentEnum.OGS: "ОГС",
    DepartmentEnum.PIL: "ПИЛ",
    DepartmentEnum.SK: "СК",
    DepartmentEnum.ALL: "Все отделы",
}


@dataclass(frozen=True, slots=True)
class RolePermissions:
    """Explicit permission matrix derived from (SystemRoleEnum, DepartmentEnum)."""

    role: SystemRoleEnum
    department: DepartmentEnum
    label: str
    description: str
    can_manage_users: bool
    can_manage_all_users: bool
    can_purge_project: bool
    can_approve_records: bool
    can_unlock_records: bool
    can_edit_welding_tech: bool
    can_edit_line_list: bool
    can_edit_lrv_catalog: bool
    can_create_or_delete_joints: bool
    can_edit_prep_and_welding_fields: bool
    can_edit_ndt_fields: bool
    can_manage_test_circuits: bool
    can_export_documents: bool
    can_view_audit_logs: bool


# Field-level RBAC sets on WeldJoint (snake_case DB/API column names)
PIL_EDITABLE_JOINT_FIELDS: frozenset[str] = frozenset(
    {
        # Primary VIK
        "vik_result",
        "vik_date",
        "vik_inspector",
        "vik_report_number",
        # Primary NDT
        "ndt_type",
        "ndt_result",
        "ndt_date",
        "ndt_inspector",
        "ndt_report_number",
        "root_weld_control",
        "steeloscopy_info",
        "hardness_test_info",
        "ferrite_phase_info",
        # Duplicate NDT
        "dup_ndt_type",
        "dup_ndt_result",
        "dup_ndt_date",
        "dup_ndt_inspector",
        "dup_ndt_report_number",
        # Post-repair controls (STO Gazprom cols 38-48)
        "repair_vik_number",
        "repair_vik_date",
        "repair_vik_result",
        "repair_vik_inspector",
        "repair_ndt_type",
        "repair_ndt_number",
        "repair_ndt_date",
        "repair_ndt_result",
        "repair_ndt_inspector",
        "repair_dup_ndt_type",
        "repair_dup_ndt_number",
        "repair_dup_ndt_date",
        "repair_dup_ndt_result",
        "repair_dup_ndt_inspector",
    }
)

PTO_EDITABLE_JOINT_FIELDS: frozenset[str] = frozenset(
    {
        "is_supplementary",
        "object_name",
        "rd_code",
        "contour",
        "test_circuit_id",
        "line_number",
        "unique_line_id",
        "joint_kind",
        "joint_type",
        "diameter_mm",
        "diameter_inch",
        "equiv_diameter_inch",
        "wall_thickness",
        # Element 1 (LRV 1)
        "lrv1_item_id",
        "lrv1_code",
        "elem1_name",
        "elem1_material",
        "elem1_ntd",
        "elem1_diameter_mm",
        "elem1_wall_thickness",
        "elem1_factory_number",
        "elem1_manufacturer",
        "elem1_length",
        "elem1_cert_number",
        "elem1_heat_number",
        "elem1_batch_number",
        # Element 2 (LRV 2)
        "lrv2_item_id",
        "lrv2_code",
        "elem2_name",
        "elem2_material",
        "elem2_ntd",
        "elem2_diameter_mm",
        "elem2_wall_thickness",
        "elem2_factory_number",
        "elem2_manufacturer",
        "elem2_length",
        "elem2_cert_number",
        "elem2_heat_number",
        "elem2_batch_number",
        # Welding execution
        "tech_card_id",
        "welding_type",
        "gost_joint_type",
        "welding_position",
        "welding_date",
        "welder_stamp",
        "brigade_stamp",
        "welder_stamps_list",
        "welder_full_name",
        "welder_cert_number",
        "ambient_temp_c",
        "weather_source",
        "preheat_temp",
        "welding_materials",
        "tech_card_number",
        "responsible_person",
        "root_weld_control",
        "steeloscopy_info",
        "heat_treat_operator",
        "heat_treat_diagram_number",
        "hardness_test_info",
        # Repair execution (STO Gazprom cols 32-37)
        "repair_action",
        "repair_date",
        "repair_tech_card",
        "repair_welder_stamp",
        "repair_foreman",
        "repair_length_mm",
        "repair_defect_type",
    }
)

SK_EDITABLE_JOINT_FIELDS: frozenset[str] = frozenset(
    {
        "test_circuit_id",
        "contour",
    }
)


def validate_role_department_pair(role: SystemRoleEnum, department: DepartmentEnum) -> None:
    """Enforce invariant: DepartmentEnum.ALL is strictly reserved for SUPERADMIN."""
    if role != SystemRoleEnum.SUPERADMIN and department == DepartmentEnum.ALL:
        raise ValueError(
            "Отдел ALL допустим исключительно для роли SUPERADMIN. "
            "Для остальных ролей укажите конкретный отдел (PTO, OGS, PIL, SK)."
        )


def get_role_permissions(
    role: SystemRoleEnum,
    department: DepartmentEnum = DepartmentEnum.PTO,
) -> RolePermissions:
    """Compute strict permission matrix from (SystemRoleEnum, DepartmentEnum)."""
    if role not in ROLE_RANK:
        raise ValueError(f"Неизвестная роль пользователя: {role!r}")

    if role == SystemRoleEnum.SUPERADMIN:
        return RolePermissions(
            role=role,
            department=department,
            label="Суперадмин",
            description=(
                "Полный доступ ко всем проектам, отделам, системным настройкам, "
                "управлению пользователями, разблокировке записей и очистке данных проекта."
            ),
            can_manage_users=True,
            can_manage_all_users=True,
            can_purge_project=True,
            can_approve_records=True,
            can_unlock_records=True,
            can_edit_welding_tech=True,
            can_edit_line_list=True,
            can_edit_lrv_catalog=True,
            can_create_or_delete_joints=True,
            can_edit_prep_and_welding_fields=True,
            can_edit_ndt_fields=True,
            can_manage_test_circuits=True,
            can_export_documents=True,
            can_view_audit_logs=True,
        )

    if role == SystemRoleEnum.VIEWER:
        dept_label = DEPARTMENT_LABELS_RU.get(department, department.value)
        return RolePermissions(
            role=role,
            department=department,
            label=f"Наблюдатель · {dept_label}",
            description=(
                "Режим инспекционного просмотра: просмотр реестров, журналов и выгрузка "
                "исполнительной документации без права внесения изменений."
            ),
            can_manage_users=False,
            can_manage_all_users=False,
            can_purge_project=False,
            can_approve_records=False,
            can_unlock_records=False,
            can_edit_welding_tech=False,
            can_edit_line_list=False,
            can_edit_lrv_catalog=False,
            can_create_or_delete_joints=False,
            can_edit_prep_and_welding_fields=False,
            can_edit_ndt_fields=False,
            can_manage_test_circuits=False,
            can_export_documents=True,
            can_view_audit_logs=False,
        )

    is_dept_admin = role == SystemRoleEnum.DEPT_ADMIN
    role_label = ROLE_LABELS_RU[role]
    dept_label = DEPARTMENT_LABELS_RU.get(department, department.value)

    can_edit_line_list = department == DepartmentEnum.PTO and is_dept_admin
    can_edit_lrv_catalog = department == DepartmentEnum.PTO and is_dept_admin
    can_create_or_delete_joints = department == DepartmentEnum.PTO
    can_edit_prep_and_welding = department == DepartmentEnum.PTO
    can_edit_welding_tech = department == DepartmentEnum.OGS and is_dept_admin
    can_edit_ndt = department == DepartmentEnum.PIL
    can_manage_test_circuits = department in (DepartmentEnum.PTO, DepartmentEnum.SK)

    if is_dept_admin:
        description = (
            f"Администратор отдела {dept_label}: полный доступ в своём домене, "
            "утверждение и фиксация записей, управление справочниками отдела и учётными записями сотрудников."
        )
    else:
        description = (
            f"Пользователь отдела {dept_label}: создание и редактирование черновиков в своём домене. "
            "Редактирование объектов, шифров РД, лайнлиста, справочников, чужих записей при удалении и проверенных/закрытых записей запрещено."
        )

    return RolePermissions(
        role=role,
        department=department,
        label=f"{role_label} · {dept_label}",
        description=description,
        can_manage_users=is_dept_admin,
        can_manage_all_users=False,
        can_purge_project=False,
        can_approve_records=is_dept_admin,
        can_unlock_records=False,
        can_edit_welding_tech=can_edit_welding_tech,
        can_edit_line_list=can_edit_line_list,
        can_edit_lrv_catalog=can_edit_lrv_catalog,
        can_create_or_delete_joints=can_create_or_delete_joints,
        can_edit_prep_and_welding_fields=can_edit_prep_and_welding,
        can_edit_ndt_fields=can_edit_ndt,
        can_manage_test_circuits=can_manage_test_circuits,
        can_export_documents=True,
        can_view_audit_logs=is_dept_admin,
    )


def can_edit_joint_field(
    role: SystemRoleEnum,
    department: DepartmentEnum,
    field_name: str,
    *,
    is_create: bool = False,
) -> bool:
    """Check whether (role, department) may modify a specific WeldJoint field."""
    if field_name == "joint_number" and not is_create:
        return False
    if role == SystemRoleEnum.SUPERADMIN:
        return True
    if role == SystemRoleEnum.VIEWER:
        return False
    if department == DepartmentEnum.PIL:
        return field_name in PIL_EDITABLE_JOINT_FIELDS
    if department == DepartmentEnum.PTO:
        if is_create and field_name == "joint_number":
            return True
        return field_name in PTO_EDITABLE_JOINT_FIELDS
    if department == DepartmentEnum.SK:
        return field_name in SK_EDITABLE_JOINT_FIELDS
    return False


def find_forbidden_joint_fields(
    role: SystemRoleEnum,
    department: DepartmentEnum,
    patch_fields: dict[str, Any],
    existing_values: dict[str, Any] | None = None,
    *,
    is_create: bool = False,
) -> list[str]:
    """Return list of field names in patch that (role, department) is not allowed to change."""
    forbidden: list[str] = []
    for field_name, new_val in patch_fields.items():
        if field_name in (
            "id",
            "version",
            "created_at",
            "updated_at",
            "updated_by",
            "updated_by_id",
            "created_by_id",
        ):
            continue
        if not is_create and existing_values is not None:
            if field_name in existing_values and existing_values[field_name] == new_val:
                continue
        if not can_edit_joint_field(role, department, field_name, is_create=is_create):
            forbidden.append(field_name)
    return sorted(forbidden)


def _get_record_status(record: Any) -> RecordStatusEnum:
    raw = getattr(record, "record_status", RecordStatusEnum.DRAFT)
    if isinstance(raw, RecordStatusEnum):
        return raw
    try:
        return RecordStatusEnum(str(raw))
    except ValueError:
        return RecordStatusEnum.DRAFT


def assert_can_mutate_record(
    *,
    user: Any,
    record: Any | None,
    allowed_departments: Collection[DepartmentEnum],
    operation: str,
    is_directory: bool = False,
) -> None:
    """
    Enforce department + role + record_status + ownership policy for create/update/delete.

    Rules:
    - VIEWER: always 403.
    - SUPERADMIN: allowed for create; for update/delete on LOCKED records, must unlock first!
    - DEPT_ADMIN: allowed if user.department in allowed_departments; forbidden on LOCKED records.
    - OPERATOR:
      * Forbidden on reference directories (is_directory=True).
      * Allowed in own department for create and update ONLY when record_status == DRAFT.
      * Forbidden to edit/delete VERIFIED or LOCKED records.
      * Allowed to delete ONLY own records (created_by_id == user.id) in DRAFT status.
    """
    role: SystemRoleEnum = user.role
    department: DepartmentEnum = user.department

    if role == SystemRoleEnum.VIEWER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Наблюдателю (VIEWER) запрещено вносить изменения.",
        )

    if record is not None:
        rec_status = _get_record_status(record)
        if rec_status == RecordStatusEnum.LOCKED:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Запись закрыта (LOCKED) в составе подписанного акта. "
                    "Изменение и удаление запрещены до снятия блокировки суперадмином."
                ),
            )

    if role == SystemRoleEnum.SUPERADMIN:
        return

    if department not in allowed_departments:
        allowed_labels = ", ".join(DEPARTMENT_LABELS_RU.get(d, d.value) for d in allowed_departments)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Операция доступна только для отделов: {allowed_labels}. "
                f"Ваш отдел: {DEPARTMENT_LABELS_RU.get(department, department.value)}."
            ),
        )

    if role == SystemRoleEnum.DEPT_ADMIN:
        return

    # OPERATOR rules
    if is_directory:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Пользователю с ролью OPERATOR запрещено изменять справочники. Обратитесь к администратору отдела.",
        )

    if operation == "create":
        return

    if record is not None:
        rec_status = _get_record_status(record)
        if rec_status != RecordStatusEnum.DRAFT:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Запись находится в статусе {rec_status.value}. "
                    "Пользователь (OPERATOR) может изменять и удалять только записи в статусе DRAFT."
                ),
            )

        if operation == "delete":
            created_by_id = getattr(record, "created_by_id", None)
            if created_by_id is None or str(created_by_id) != str(user.id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Пользователь (OPERATOR) не может удалять чужие записи.",
                )


def assert_can_transition_record_status(
    *,
    user: Any,
    record: Any,
    target_status: RecordStatusEnum,
    allowed_departments: Collection[DepartmentEnum],
    reason: str | None = None,
) -> None:
    """
    Validate status transition DRAFT <-> VERIFIED <-> LOCKED:
    - Unlocking from LOCKED -> DRAFT/VERIFIED: strictly SUPERADMIN with non-empty reason.
    - Locking/verifying/reverting between DRAFT/VERIFIED/LOCKED: SUPERADMIN or DEPT_ADMIN in allowed_departments.
    - OPERATOR and VIEWER cannot change record_status.
    """
    role: SystemRoleEnum = user.role
    department: DepartmentEnum = user.department
    current_status = _get_record_status(record)

    if current_status == target_status:
        return

    if current_status == RecordStatusEnum.LOCKED:
        if role != SystemRoleEnum.SUPERADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Снять блокировку закрытой записи (LOCKED) может только SUPERADMIN.",
            )
        if not reason or not reason.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Для снятия блокировки закрытой записи (LOCKED) обязательно укажите причину.",
            )
        return

    if role == SystemRoleEnum.SUPERADMIN:
        return

    if role == SystemRoleEnum.DEPT_ADMIN and department in allowed_departments:
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=(
            "Изменять статус фиксации записи (Черновик / Проверено / Закрыто) "
            "может только администратор профильного отдела или суперадмин."
        ),
    )
