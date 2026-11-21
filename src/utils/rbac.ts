import {
  DepartmentCode,
  InspectorProfile,
  RecordStatus,
  SystemRole,
  UserAccount,
  WeldJoint,
  WeldJointFieldKey,
} from '../types/welding';

export type RbacRoleCategory = 'admin' | 'technologist' | 'pto' | 'ndt' | 'customer';

export const ROLE_RANK: Record<SystemRole, number> = {
  VIEWER: 0,
  OPERATOR: 1,
  DEPT_ADMIN: 2,
  SUPERADMIN: 3,
};

export const SYSTEM_ROLE_LABELS_RU: Record<SystemRole, string> = {
  SUPERADMIN: 'Суперадмин',
  DEPT_ADMIN: 'Администратор отдела',
  OPERATOR: 'Пользователь',
  VIEWER: 'Наблюдатель',
};

export const DEPARTMENT_LABELS_RU: Record<DepartmentCode, string> = {
  PTO: 'ПТО',
  OGS: 'ОГС',
  PIL: 'ПИЛ',
  SK: 'СК',
  ALL: 'Все отделы',
};

export const RECORD_STATUS_LABELS_RU: Record<RecordStatus, string> = {
  DRAFT: 'Черновик',
  VERIFIED: 'Проверено',
  LOCKED: 'Закрыто',
};

export type RbacUserPayload = {
  id?: string;
  role?: string;
  systemRole?: SystemRole;
  departmentCode?: DepartmentCode;
  backendRole?: SystemRole | 'ADMIN' | 'PTO' | 'OGS' | 'PIL' | 'VIEWER';
  department?: string;
  login?: string;
  fullName?: string;
  isAdmin?: boolean;
  isActive?: boolean;
};

export interface LockableRecordLike {
  recordStatus?: RecordStatus;
  createdById?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export interface RolePermissions {
  category: RbacRoleCategory;
  categoryLabel: string;
  systemRole: SystemRole;
  department: DepartmentCode;
  isActive: boolean;
  isSuperAdmin: boolean;
  isDeptAdmin: boolean;
  canManageUsers: boolean;
  canManageAllUsers: boolean;
  canPurgeProject: boolean;
  canApproveRecords: boolean;
  canUnlockRecords: boolean;
  canEditDirectories: boolean;
  allowedScopeSummary: string;
  roleDescription: string;
  canEditWeldingTech: boolean;
  canEditLineList: boolean;
  canEditLrvCatalog: boolean;
  canCreateOrDeleteJoints: boolean;
  canEditPrepAndWeldingFields: boolean;
  canEditNdtFields: boolean;
  canManageTestCircuits: boolean;
  canForceCloseTestCircuit: boolean;
  canViewAuditLogs: boolean;
}

/**
 * Поля сварного стыка, относящиеся к зоне ответственности Специалиста ЛНК / ПИЛ
 * (ВИК, первичный НК, дублирующий НК и контроль ВИК/ФМК после ремонта).
 */
export const NDT_EDITABLE_JOINT_FIELDS = new Set<keyof WeldJoint>([
  'vikResult',
  'vikDate',
  'vikInspector',
  'vikReportNumber',
  'ndtType',
  'ndtResult',
  'ndtDate',
  'ndtInspector',
  'ndtReportNumber',
  'rootWeldControl',
  'steeloscopyInfo',
  'hardnessTestInfo',
  'ferritePhaseInfo',
  'dupNdtType',
  'dupNdtResult',
  'dupNdtDate',
  'dupNdtInspector',
  'dupNdtReportNumber',
  'repairVikNumber',
  'repairVikDate',
  'repairVikResult',
  'repairVikInspector',
  'repairNdtType',
  'repairNdtNumber',
  'repairNdtDate',
  'repairNdtResult',
  'repairNdtInspector',
  'repairDupNdtType',
  'repairDupNdtNumber',
  'repairDupNdtDate',
  'repairDupNdtResult',
  'repairDupNdtInspector',
]);

/**
 * Поля сварного стыка, относящиеся к зоне ответственности Инженера ПТО / Мастера СМР.
 */
export const PTO_EDITABLE_JOINT_FIELDS = new Set<keyof WeldJoint>([
  'jointNumber',
  'isSupplementary',
  'objectName',
  'rdCode',
  'contour',
  'testCircuitId',
  'lineNumber',
  'uniqueLineId',
  'jointType',
  'diameterMm',
  'diameterInch',
  'equivDiameterInch',
  'wallThickness',
  'lrv1Code',
  'elem1Name',
  'elem1Material',
  'elem1Ntd',
  'elem1DiameterMm',
  'elem1WallThickness',
  'elem1Manufacturer',
  'elem1FactoryNumber',
  'elem1Length',
  'elem1CertNumber',
  'elem1HeatNumber',
  'elem1BatchNumber',
  'lrv2Code',
  'elem2Name',
  'elem2Material',
  'elem2Ntd',
  'elem2DiameterMm',
  'elem2WallThickness',
  'elem2Manufacturer',
  'elem2FactoryNumber',
  'elem2Length',
  'elem2CertNumber',
  'elem2HeatNumber',
  'elem2BatchNumber',
  'weldingType',
  'gostJointType',
  'weldingPosition',
  'weldingDate',
  'welderStamp',
  'brigadeStamp',
  'welderStampsList',
  'welderFullName',
  'welderCertNumber',
  'ambientTemp',
  'weatherSource',
  'preheatTemp',
  'weldingMaterials',
  'techCardNumber',
  'responsiblePerson',
  'rootWeldControl',
  'steeloscopyInfo',
  'heatTreatOperator',
  'heatTreatDiagramNumber',
  'hardnessTestInfo',
  'repairAction',
  'repairDate',
  'repairTechCard',
  'repairWelderStamp',
  'repairForeman',
  'repairLengthMm',
  'repairDefectType',
  'repairCount',
]);

export const SK_EDITABLE_JOINT_FIELDS = new Set<keyof WeldJoint>([
  'contour',
  'testCircuitId',
]);

export function validateRoleDepartmentPair(
  role: SystemRole,
  department: DepartmentCode
): string | null {
  if (department === 'ALL' && role !== 'SUPERADMIN') {
    return 'Отдел «Все отделы» доступен только для роли Суперадмин';
  }
  return null;
}

/**
 * Определяет иерархическую системную роль (SUPERADMIN / DEPT_ADMIN / OPERATOR / VIEWER)
 * с обратной совместимостью для старых аккаунтов.
 */
export function resolveUserSystemRole(
  user: RbacUserPayload | null | undefined
): SystemRole {
  if (!user || !user.login || user.login === 'anonymous' || user.isActive === false) {
    return 'VIEWER';
  }
  if (
    user.systemRole === 'SUPERADMIN' ||
    user.systemRole === 'DEPT_ADMIN' ||
    user.systemRole === 'OPERATOR' ||
    user.systemRole === 'VIEWER'
  ) {
    return user.systemRole;
  }
  const br = String(user.backendRole || '').toUpperCase();
  if (br === 'SUPERADMIN' || br === 'ADMIN' || user.isAdmin === true) {
    return 'SUPERADMIN';
  }
  if (br === 'DEPT_ADMIN') return 'DEPT_ADMIN';
  if (br === 'OPERATOR') return 'OPERATOR';
  if (br === 'VIEWER') return 'VIEWER';
  if (br === 'PTO' || br === 'OGS' || br === 'PIL') return 'OPERATOR';

  const combined = `${user.role || ''} ${user.department || ''} ${user.login || ''}`.toLowerCase();
  if (
    combined.includes('гость') ||
    combined.includes('неавторизован') ||
    combined.includes('только чтение') ||
    combined.includes('заказчик') ||
    combined.includes('стройконтрол') ||
    combined.includes('строительного контроля') ||
    combined.includes('viewer') ||
    combined.startsWith('cust_')
  ) {
    return 'VIEWER';
  }
  if (
    combined.includes('суперадмин') ||
    combined.includes('системный администратор') ||
    combined.includes('администратор системы') ||
    combined.includes('суперпользователь') ||
    combined.includes('полный доступ') ||
    user.login.toLowerCase() === 'admin'
  ) {
    return 'SUPERADMIN';
  }
  if (
    combined.includes('администратор отдела') ||
    combined.includes('начальник') ||
    combined.includes('главный сварщик')
  ) {
    return 'DEPT_ADMIN';
  }
  return 'OPERATOR';
}

/**
 * Определяет производственный отдел пользователя (PTO / OGS / PIL / SK / ALL).
 */
export function resolveUserDepartment(
  user: RbacUserPayload | null | undefined
): DepartmentCode {
  if (!user || !user.login || user.login === 'anonymous' || user.isActive === false) {
    return 'SK';
  }
  const sysRole = resolveUserSystemRole(user);
  if (
    user.departmentCode === 'PTO' ||
    user.departmentCode === 'OGS' ||
    user.departmentCode === 'PIL' ||
    user.departmentCode === 'SK' ||
    user.departmentCode === 'ALL'
  ) {
    if (user.departmentCode === 'ALL' && sysRole !== 'SUPERADMIN') {
      return 'PTO';
    }
    return user.departmentCode;
  }

  const rawDept = String(user.department || '').trim().toUpperCase();
  if (rawDept === 'PTO' || rawDept === 'OGS' || rawDept === 'PIL' || rawDept === 'SK') {
    return rawDept;
  }
  if (rawDept === 'ALL' && sysRole === 'SUPERADMIN') {
    return 'ALL';
  }

  const br = String(user.backendRole || '').toUpperCase();
  if (sysRole === 'SUPERADMIN' || br === 'ADMIN' || user.isAdmin === true) {
    return 'ALL';
  }
  if (br === 'OGS') return 'OGS';
  if (br === 'PIL') return 'PIL';
  if (br === 'PTO') return 'PTO';
  if (br === 'VIEWER') return 'SK';

  const combined = `${user.role || ''} ${user.department || ''} ${user.login || ''}`.toLowerCase();
  if (
    combined.includes('заказчик') ||
    combined.includes('стройконтрол') ||
    combined.includes('строительного контроля') ||
    /(?:^|[\s(/.,-])ск(?:$|[\s)/.,-])/.test(combined)
  ) {
    return 'SK';
  }
  if (
    combined.includes('технолог') ||
    combined.includes('главный сварщик') ||
    combined.includes('техкарт') ||
    combined.includes('отдел главного сварщика') ||
    combined.includes('огс') ||
    combined.startsWith('tech_')
  ) {
    return 'OGS';
  }
  if (
    combined.includes('лнк') ||
    combined.includes('дефектоскоп') ||
    combined.includes('неразрушающ') ||
    combined.includes('пил') ||
    combined.includes('инженер вик') ||
    combined.startsWith('lnk_') ||
    combined.startsWith('ndt_')
  ) {
    return 'PIL';
  }
  return 'PTO';
}

export function detectRbacRoleCategory(
  user: RbacUserPayload | null | undefined
): RbacRoleCategory {
  if (!user || !user.login || user.login === 'anonymous' || user.isActive === false) {
    return 'customer';
  }
  const sysRole = resolveUserSystemRole(user);
  const dept = resolveUserDepartment(user);

  if (sysRole === 'SUPERADMIN') return 'admin';
  if (sysRole === 'VIEWER' || dept === 'SK') return 'customer';
  if (dept === 'OGS') return 'technologist';
  if (dept === 'PIL') return 'ndt';
  return 'pto';
}

/**
 * Возвращает полный набор прав доступа (Иерархическая RBAC + Отделы + Field-Level RBAC).
 */
export function getUserRolePermissions(
  user: RbacUserPayload | null | undefined
): RolePermissions {
  const isActive = user?.isActive !== false;
  const sysRole = resolveUserSystemRole(user);
  const dept = resolveUserDepartment(user);
  const category = detectRbacRoleCategory(user);
  const isSuperAdmin = isActive && sysRole === 'SUPERADMIN';
  const isDeptAdmin = isActive && sysRole === 'DEPT_ADMIN';

  if (isSuperAdmin) {
    const desc =
      'Суперадмин · Все отделы: полный доступ ко всем разделам, управлению пользователями, разблокировке записей и очистке проектов.';
    return {
      category: 'admin',
      categoryLabel: 'Суперадмин',
      systemRole: 'SUPERADMIN',
      department: 'ALL',
      isActive: true,
      isSuperAdmin: true,
      isDeptAdmin: false,
      canManageUsers: true,
      canManageAllUsers: true,
      canPurgeProject: true,
      canApproveRecords: true,
      canUnlockRecords: true,
      canEditDirectories: true,
      allowedScopeSummary: desc,
      roleDescription: desc,
      canEditWeldingTech: true,
      canEditLineList: true,
      canEditLrvCatalog: true,
      canCreateOrDeleteJoints: true,
      canEditPrepAndWeldingFields: true,
      canEditNdtFields: true,
      canManageTestCircuits: true,
      canForceCloseTestCircuit: true,
      canViewAuditLogs: true,
    };
  }

  if (!isActive || sysRole === 'VIEWER') {
    const desc =
      'Режим наблюдения: просмотр реестров, журналов и экспорт исполнительной документации без права внесения изменений.';
    return {
      category: 'customer',
      categoryLabel: `${SYSTEM_ROLE_LABELS_RU.VIEWER} · ${DEPARTMENT_LABELS_RU[dept]}`,
      systemRole: 'VIEWER',
      department: dept,
      isActive,
      isSuperAdmin: false,
      isDeptAdmin: false,
      canManageUsers: false,
      canManageAllUsers: false,
      canPurgeProject: false,
      canApproveRecords: false,
      canUnlockRecords: false,
      canEditDirectories: false,
      allowedScopeSummary: desc,
      roleDescription: desc,
      canEditWeldingTech: false,
      canEditLineList: false,
      canEditLrvCatalog: false,
      canCreateOrDeleteJoints: false,
      canEditPrepAndWeldingFields: false,
      canEditNdtFields: false,
      canManageTestCircuits: false,
      canForceCloseTestCircuit: false,
      canViewAuditLogs: false,
    };
  }

  if (dept === 'SK') {
    const desc = isDeptAdmin
      ? 'Администратор отдела СК: управление контурами испытаний, утверждение актов, принудительное закрытие и администрирование пользователей СК.'
      : 'Пользователь отдела СК: формирование и сопровождение контуров испытаний, контроль статусов СРИ и готовности.';
    return {
      category: 'customer',
      categoryLabel: `${SYSTEM_ROLE_LABELS_RU[sysRole]} · СК`,
      systemRole: sysRole,
      department: 'SK',
      isActive: true,
      isSuperAdmin: false,
      isDeptAdmin,
      canManageUsers: isDeptAdmin,
      canManageAllUsers: false,
      canPurgeProject: false,
      canApproveRecords: isDeptAdmin,
      canUnlockRecords: false,
      canEditDirectories: false,
      allowedScopeSummary: desc,
      roleDescription: desc,
      canEditWeldingTech: false,
      canEditLineList: false,
      canEditLrvCatalog: false,
      canCreateOrDeleteJoints: false,
      canEditPrepAndWeldingFields: false,
      canEditNdtFields: false,
      canManageTestCircuits: true,
      canForceCloseTestCircuit: isDeptAdmin,
      canViewAuditLogs: isDeptAdmin,
    };
  }

  if (dept === 'OGS') {
    const desc = isDeptAdmin
      ? 'Администратор отдела ОГС: управление справочниками технологии сварки, утверждение записей и администрирование пользователей ОГС.'
      : 'Пользователь отдела ОГС: просмотр справочников технологии сварки без права изменения справочников и чужих записей.';
    return {
      category: 'technologist',
      categoryLabel: `${SYSTEM_ROLE_LABELS_RU[sysRole]} · ОГС`,
      systemRole: sysRole,
      department: 'OGS',
      isActive: true,
      isSuperAdmin: false,
      isDeptAdmin,
      canManageUsers: isDeptAdmin,
      canManageAllUsers: false,
      canPurgeProject: false,
      canApproveRecords: isDeptAdmin,
      canUnlockRecords: false,
      canEditDirectories: isDeptAdmin,
      allowedScopeSummary: desc,
      roleDescription: desc,
      canEditWeldingTech: isDeptAdmin,
      canEditLineList: false,
      canEditLrvCatalog: false,
      canCreateOrDeleteJoints: false,
      canEditPrepAndWeldingFields: false,
      canEditNdtFields: false,
      canManageTestCircuits: false,
      canForceCloseTestCircuit: false,
      canViewAuditLogs: isDeptAdmin,
    };
  }

  if (dept === 'PIL') {
    const desc = isDeptAdmin
      ? 'Администратор отдела ПИЛ: редактирование полей ВИК/НК, управление заявками, утверждение записей и пользователей ПИЛ.'
      : 'Пользователь отдела ПИЛ: редактирование полей ВИК/НК для черновиков стыков и работа с заявками лаборатории.';
    return {
      category: 'ndt',
      categoryLabel: `${SYSTEM_ROLE_LABELS_RU[sysRole]} · ПИЛ`,
      systemRole: sysRole,
      department: 'PIL',
      isActive: true,
      isSuperAdmin: false,
      isDeptAdmin,
      canManageUsers: isDeptAdmin,
      canManageAllUsers: false,
      canPurgeProject: false,
      canApproveRecords: isDeptAdmin,
      canUnlockRecords: false,
      canEditDirectories: false,
      allowedScopeSummary: desc,
      roleDescription: desc,
      canEditWeldingTech: false,
      canEditLineList: false,
      canEditLrvCatalog: false,
      canCreateOrDeleteJoints: false,
      canEditPrepAndWeldingFields: false,
      canEditNdtFields: true,
      canManageTestCircuits: false,
      canForceCloseTestCircuit: false,
      canViewAuditLogs: isDeptAdmin,
    };
  }

  // PTO (DEPT_ADMIN or OPERATOR)
  const desc = isDeptAdmin
    ? 'Администратор отдела ПТО: управление объектами, шифрами РД, лайнлистом, стыками, контурами испытаний и каталогом ЛРВ, утверждение записей и управление пользователями ПТО.'
    : 'Пользователь отдела ПТО: создание и редактирование черновиков стыков, заявок НК и контуров испытаний; изменение объектов, шифров РД, лайнлиста и справочников доступно только администратору отдела ПТО.';
  return {
    category: 'pto',
    categoryLabel: `${SYSTEM_ROLE_LABELS_RU[sysRole]} · ПТО`,
    systemRole: sysRole,
    department: 'PTO',
    isActive: true,
    isSuperAdmin: false,
    isDeptAdmin,
    canManageUsers: isDeptAdmin,
    canManageAllUsers: false,
    canPurgeProject: false,
    canApproveRecords: isDeptAdmin,
    canUnlockRecords: false,
    canEditDirectories: isDeptAdmin,
    allowedScopeSummary: desc,
    roleDescription: desc,
    canEditWeldingTech: false,
    canEditLineList: isDeptAdmin,
    canEditLrvCatalog: isDeptAdmin,
    canCreateOrDeleteJoints: true,
    canEditPrepAndWeldingFields: true,
    canEditNdtFields: false,
    canManageTestCircuits: true,
    canForceCloseTestCircuit: isDeptAdmin,
    canViewAuditLogs: isDeptAdmin,
  };
}

/**
 * Проверяет право пользователя на управление испытательными контурами
 * (создание, редактирование, привязка линий/стыков): PTO / SK (OPERATOR, DEPT_ADMIN) и SUPERADMIN.
 */
export function canManageTestCircuits(
  user: RbacUserPayload | null | undefined
): boolean {
  return getUserRolePermissions(user).canManageTestCircuits;
}

/**
 * Проверяет право пользователя на принудительное закрытие контура в статус «Испытано» (force=true):
 * только SUPERADMIN или DEPT_ADMIN отделов ПТО / СК.
 */
export function canForceCloseTestCircuit(
  user: RbacUserPayload | null | undefined
): boolean {
  return getUserRolePermissions(user).canForceCloseTestCircuit;
}

/**
 * Проверяет право пользователя на редактирование или удаление конкретной записи с учётом:
 * 1) Системной роли и отдела
 * 2) Защиты справочников от OPERATOR
 * 3) Статуса жизненного цикла записи (DRAFT / VERIFIED / LOCKED)
 * 4) Владения записью при удалении для OPERATOR
 */
export function canUserMutateRecord(
  user: RbacUserPayload | null | undefined,
  record: LockableRecordLike | null | undefined,
  allowedDepartments: DepartmentCode[],
  action: 'edit' | 'delete' = 'edit',
  isDirectory = false
): { allowed: boolean; reason?: string } {
  if (!user || !user.login || user.login === 'anonymous') {
    return { allowed: false, reason: 'Требуется авторизация' };
  }
  if (user.isActive === false) {
    return { allowed: false, reason: 'Учётная запись заблокирована' };
  }

  const sysRole = resolveUserSystemRole(user);
  const dept = resolveUserDepartment(user);
  const status: RecordStatus = record?.recordStatus || 'DRAFT';

  if (sysRole === 'VIEWER') {
    return { allowed: false, reason: 'Роль наблюдателя не позволяет изменять данные' };
  }

  if (status === 'LOCKED') {
    return {
      allowed: false,
      reason: 'Запись закрыта для изменений. Требуется разблокировка суперадмином',
    };
  }

  if (sysRole === 'SUPERADMIN') {
    return { allowed: true };
  }

  if (dept !== 'ALL' && !allowedDepartments.includes(dept)) {
    return {
      allowed: false,
      reason: `Нет прав доступа для отдела ${DEPARTMENT_LABELS_RU[dept]}`,
    };
  }

  if (sysRole === 'DEPT_ADMIN') {
    return { allowed: true };
  }

  // OPERATOR
  if (isDirectory) {
    return { allowed: false, reason: 'Пользователю запрещено изменять справочники' };
  }

  if (status !== 'DRAFT') {
    return {
      allowed: false,
      reason: 'Редактирование и удаление проверенных записей доступно только администратору отдела',
    };
  }

  if (action === 'delete' && record) {
    const ownerId = record.createdById;
    const ownerName = record.createdBy;
    const isOwnerById = Boolean(ownerId && user.id && ownerId === user.id);
    const isOwnerByLogin = Boolean(
      ownerId && user.login && ownerId.toLowerCase() === user.login.toLowerCase()
    );
    const isOwnerByName = Boolean(
      !ownerId && ownerName && user.fullName && ownerName === user.fullName
    );
    if (!isOwnerById && !isOwnerByLogin && !isOwnerByName) {
      return {
        allowed: false,
        reason: 'Пользователю запрещено удалять чужие записи',
      };
    }
  }

  return { allowed: true };
}

/**
 * Проверяет допустимость смены статуса записи (DRAFT / VERIFIED / LOCKED).
 */
export function canUserTransitionRecordStatus(
  user: RbacUserPayload | null | undefined,
  currentStatus: RecordStatus,
  targetStatus: RecordStatus,
  allowedDepartments: DepartmentCode[]
): { allowed: boolean; requiresReason?: boolean; reason?: string } {
  if (!user || !user.login || user.login === 'anonymous' || user.isActive === false) {
    return { allowed: false, reason: 'Недостаточно прав для изменения статуса записи' };
  }

  const sysRole = resolveUserSystemRole(user);
  const dept = resolveUserDepartment(user);

  if (currentStatus === targetStatus) {
    return { allowed: false, reason: 'Запись уже находится в этом статусе' };
  }

  // Снятие блокировки LOCKED — строго SUPERADMIN с обязательной причиной
  if (currentStatus === 'LOCKED') {
    if (sysRole !== 'SUPERADMIN') {
      return {
        allowed: false,
        reason: 'Снятие блокировки закрытой записи доступно только суперадмину',
      };
    }
    if (targetStatus === 'DRAFT' || targetStatus === 'VERIFIED') {
      return { allowed: true, requiresReason: true };
    }
    return { allowed: false, reason: 'Недопустимый переход статуса' };
  }

  if (ROLE_RANK[sysRole] < ROLE_RANK.DEPT_ADMIN) {
    return {
      allowed: false,
      reason: 'Утверждение и фиксация записей доступны только администратору отдела или суперадмину',
    };
  }

  if (sysRole !== 'SUPERADMIN' && !allowedDepartments.includes(dept)) {
    return {
      allowed: false,
      reason: `Изменение статуса запрещено для отдела ${DEPARTMENT_LABELS_RU[dept]}`,
    };
  }

  if (
    (currentStatus === 'DRAFT' && targetStatus === 'VERIFIED') ||
    (currentStatus === 'VERIFIED' && targetStatus === 'DRAFT') ||
    (currentStatus === 'VERIFIED' && targetStatus === 'LOCKED')
  ) {
    return { allowed: true, requiresReason: false };
  }

  // SUPERADMIN может перевести напрямую DRAFT -> LOCKED
  if (sysRole === 'SUPERADMIN' && currentStatus === 'DRAFT' && targetStatus === 'LOCKED') {
    return { allowed: true, requiresReason: false };
  }

  return { allowed: false, reason: 'Недопустимый переход статуса записи' };
}

/**
 * Проверяет, имеет ли пользователь право редактировать конкретное поле сварного стыка.
 */
export function canUserEditJointField(
  user: RbacUserPayload | null | undefined,
  fieldKey: keyof WeldJoint | WeldJointFieldKey,
  joint?: LockableRecordLike | null
): boolean {
  if (!user || !user.login || user.login === 'anonymous' || user.isActive === false) {
    return false;
  }
  if (fieldKey === 'jointNumber' || fieldKey === 'recordStatus' || fieldKey === 'createdById') {
    return false;
  }
  const perms = getUserRolePermissions(user);
  const status: RecordStatus = joint?.recordStatus || 'DRAFT';
  if (status === 'LOCKED') {
    return false;
  }
  if (status === 'VERIFIED' && !perms.isSuperAdmin && !perms.isDeptAdmin) {
    return false;
  }
  if (perms.isSuperAdmin) {
    return true;
  }
  if (perms.department === 'SK' && perms.systemRole !== 'VIEWER') {
    return SK_EDITABLE_JOINT_FIELDS.has(fieldKey as keyof WeldJoint);
  }
  if (perms.category === 'technologist' || perms.category === 'customer') {
    return false;
  }
  if (perms.category === 'ndt') {
    return NDT_EDITABLE_JOINT_FIELDS.has(fieldKey as keyof WeldJoint);
  }
  return PTO_EDITABLE_JOINT_FIELDS.has(fieldKey as keyof WeldJoint);
}

/**
 * Фильтрует групповой патч (Bulk Update) по правам текущего пользователя (Field-Level RBAC).
 */
export function filterBulkPatchByRole(
  patch: Partial<WeldJoint>,
  user: RbacUserPayload | null | undefined,
  joint?: LockableRecordLike | null
): Partial<WeldJoint> {
  const filtered: Partial<WeldJoint> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (canUserEditJointField(user, k as keyof WeldJoint, joint)) {
      (filtered as Record<string, unknown>)[k] = v;
    }
  }
  return filtered;
}

/**
 * Технически применяет Field-Level RBAC при сохранении сварного стыка.
 */
export function enforceFieldLevelRbacOnJointSave(
  existingJoint: WeldJoint | null | undefined,
  incomingJoint: WeldJoint,
  user: RbacUserPayload | null | undefined
): WeldJoint {
  const perms = getUserRolePermissions(user);

  if (!existingJoint) {
    const base: WeldJoint = {
      ...incomingJoint,
      recordStatus: incomingJoint.recordStatus || 'DRAFT',
      createdById: incomingJoint.createdById ?? user?.id ?? user?.login ?? null,
    };
    if (perms.canEditNdtFields) {
      return base;
    }
    return {
      ...base,
      vikResult: 'Не проводился',
      vikDate: '',
      vikInspector: '',
      ndtResult: 'Не проводился',
      ndtDate: '',
      ndtInspector: '',
      ndtReportNumber: '',
      ferritePhaseInfo: '',
      dupNdtType: 'Не требуется',
      dupNdtResult: 'Не проводился',
      dupNdtDate: '',
      dupNdtInspector: '',
    };
  }

  // Защита закрытых записей и проверенных записей для OPERATOR
  const status: RecordStatus = existingJoint.recordStatus || 'DRAFT';
  if (status === 'LOCKED' || (status === 'VERIFIED' && !perms.isSuperAdmin && !perms.isDeptAdmin)) {
    return { ...existingJoint };
  }

  const result: WeldJoint = { ...existingJoint };
  const allKeys = new Set<string>([
    ...Object.keys(existingJoint),
    ...Object.keys(incomingJoint),
  ]);

  for (const key of allKeys) {
    if (
      key === 'id' ||
      key === 'jointNumber' ||
      key === 'version' ||
      key === 'recordStatus' ||
      key === 'createdById'
    ) {
      continue;
    }
    if (key === 'updatedAt' || key === 'updatedBy') {
      (result as unknown as Record<string, unknown>)[key] =
        (incomingJoint as unknown as Record<string, unknown>)[key];
      continue;
    }

    const oldVal = (existingJoint as unknown as Record<string, unknown>)[key];
    const newVal = (incomingJoint as unknown as Record<string, unknown>)[key];

    const isSame = JSON.stringify(oldVal ?? '') === JSON.stringify(newVal ?? '');
    if (isSame) continue;

    if (canUserEditJointField(user, key as keyof WeldJoint, existingJoint)) {
      (result as unknown as Record<string, unknown>)[key] = newVal;
    } else {
      (result as unknown as Record<string, unknown>)[key] = oldVal;
    }
  }

  return result;
}

/**
 * Форматирует полное ФИО специалиста в краткую форму с инициалами («Орлова Е.В.»).
 */
export function formatInspectorShortName(fullName?: string | null): string {
  if (!fullName || !fullName.trim()) return '';
  const clean = fullName.replace(/\([^)]*\)/g, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts[1].includes('.')) {
    return parts.slice(0, 2).join(' ');
  }
  const surname = parts[0];
  const initials = parts
    .slice(1, 3)
    .map((p) => `${p.charAt(0).toUpperCase()}.`)
    .join('');
  return `${surname} ${initials}`;
}

/**
 * Объединяет базовый справочник инспекторов с учётными записями специалистов ЛНК / Суперадминов.
 */
export function mergeDynamicInspectors(
  staticInspectors: InspectorProfile[],
  userAccounts: UserAccount[]
): InspectorProfile[] {
  const result: InspectorProfile[] = [...staticInspectors];
  const seenNames = new Set(
    staticInspectors.map((i) => i.fullName.trim().toLowerCase())
  );

  userAccounts.forEach((acc) => {
    if (acc.isActive === false) return;
    const cat = detectRbacRoleCategory(acc);
    if (cat !== 'ndt' && cat !== 'admin') return;
    const shortName = formatInspectorShortName(acc.fullName);
    if (!shortName) return;
    if (
      seenNames.has(shortName.toLowerCase()) ||
      seenNames.has(acc.fullName.trim().toLowerCase())
    ) {
      return;
    }
    seenNames.add(shortName.toLowerCase());
    result.unshift({
      fullName: shortName,
      certLevel: cat === 'ndt' ? 'II уровень ВИК, РК, УЗК' : 'Инженер ЛНК',
      labName: acc.department || 'Лаборатория неразрушающего контроля',
    });
  });

  return result;
}
