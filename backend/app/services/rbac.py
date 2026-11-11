from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.models.enums import RoleEnum


@dataclass(frozen=True, slots=True)
class RolePermissions:
    """Explicit permission matrix derived strictly from RoleEnum (no substring heuristics)."""

    role: RoleEnum
    label: str
    description: str
    can_manage_users: bool
    can_edit_welding_tech: bool
    can_edit_line_list: bool
    can_edit_lrv_catalog: bool
    can_create_or_delete_joints: bool
    can_edit_prep_and_welding_fields: bool
    can_edit_ndt_fields: bool
    can_export_documents: bool
    can_view_audit_logs: bool


ROLE_PERMISSIONS: dict[RoleEnum, RolePermissions] = {
    RoleEnum.ADMIN: RolePermissions(
        role=RoleEnum.ADMIN,
        label="Администратор",
        description=(
            "Полный доступ: управление пользователями и ролями, редактирование всех "
            "справочников («Технология сварки», «Лайнлист», «Каталог ЛРВ») и всех полей стыков."
        ),
        can_manage_users=True,
        can_edit_welding_tech=True,
        can_edit_line_list=True,
        can_edit_lrv_catalog=True,
        can_create_or_delete_joints=True,
        can_edit_prep_and_welding_fields=True,
        can_edit_ndt_fields=True,
        can_export_documents=True,
        can_view_audit_logs=True,
    ),
    RoleEnum.PTO: RolePermissions(
        role=RoleEnum.PTO,
        label="Инженер ПТО",
        description=(
            "Редактирование раздела «Проект (лайнлист)», создание/удаление стыков, "
            "редактирование полей подготовки, сварки и ремонта сваркой."
        ),
        can_manage_users=False,
        can_edit_welding_tech=False,
        can_edit_line_list=True,
        can_edit_lrv_catalog=False,
        can_create_or_delete_joints=True,
        can_edit_prep_and_welding_fields=True,
        can_edit_ndt_fields=False,
        can_export_documents=True,
        can_view_audit_logs=True,
    ),
    RoleEnum.OGS: RolePermissions(
        role=RoleEnum.OGS,
        label="Технолог по сварке (ОГС)",
        description=(
            "Редактирование вкладки «Технология сварки» (сварщики, НАКС, техкарты, "
            "сварочные материалы). Стыки и лайнлист — только чтение."
        ),
        can_manage_users=False,
        can_edit_welding_tech=True,
        can_edit_line_list=False,
        can_edit_lrv_catalog=False,
        can_create_or_delete_joints=False,
        can_edit_prep_and_welding_fields=False,
        can_edit_ndt_fields=False,
        can_export_documents=True,
        can_view_audit_logs=True,
    ),
    RoleEnum.PIL: RolePermissions(
        role=RoleEnum.PIL,
        label="Специалист ЛНК / ПИЛ",
        description=(
            "Редактирование только полей ВИК, первичного НК (РК/УЗК/ПВК), дублирующего НК "
            "и послеремонтного контроля стыков."
        ),
        can_manage_users=False,
        can_edit_welding_tech=False,
        can_edit_line_list=False,
        can_edit_lrv_catalog=False,
        can_create_or_delete_joints=False,
        can_edit_prep_and_welding_fields=False,
        can_edit_ndt_fields=True,
        can_export_documents=True,
        can_view_audit_logs=True,
    ),
    RoleEnum.VIEWER: RolePermissions(
        role=RoleEnum.VIEWER,
        label="Представитель Заказчика / Наблюдатель",
        description=(
            "Режим инспекционного просмотра: просмотр реестра, журналов, аудита и выгрузка "
            "исполнительной документации без права внесения изменений."
        ),
        can_manage_users=False,
        can_edit_welding_tech=False,
        can_edit_line_list=False,
        can_edit_lrv_catalog=False,
        can_create_or_delete_joints=False,
        can_edit_prep_and_welding_fields=False,
        can_edit_ndt_fields=False,
        can_export_documents=True,
        can_view_audit_logs=True,
    ),
}

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


def get_role_permissions(role: RoleEnum) -> RolePermissions:
    """Return strict permissions for the given RoleEnum; never defaults to PTO."""
    if role not in ROLE_PERMISSIONS:
        raise ValueError(f"Неизвестная роль пользователя: {role!r}")
    return ROLE_PERMISSIONS[role]


def can_edit_joint_field(role: RoleEnum, field_name: str, *, is_create: bool = False) -> bool:
    """Check whether a role may modify a specific WeldJoint field."""
    if field_name == "joint_number" and not is_create:
        return False
    if role == RoleEnum.ADMIN:
        return True
    if role in (RoleEnum.OGS, RoleEnum.VIEWER):
        return False
    if role == RoleEnum.PIL:
        return field_name in PIL_EDITABLE_JOINT_FIELDS
    if role == RoleEnum.PTO:
        if is_create and field_name == "joint_number":
            return True
        return field_name in PTO_EDITABLE_JOINT_FIELDS
    return False


def find_forbidden_joint_fields(
    role: RoleEnum,
    patch_fields: dict[str, Any],
    existing_values: dict[str, Any] | None = None,
    *,
    is_create: bool = False,
) -> list[str]:
    """Return list of field names in patch that the role is not allowed to change."""
    forbidden: list[str] = []
    for field_name, new_val in patch_fields.items():
        if field_name in ("id", "version", "created_at", "updated_at", "updated_by", "updated_by_id"):
            continue
        if not is_create and existing_values is not None:
            if field_name in existing_values and existing_values[field_name] == new_val:
                continue
        if not can_edit_joint_field(role, field_name, is_create=is_create):
            forbidden.append(field_name)
    return sorted(forbidden)
