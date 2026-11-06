import {
  InspectorProfile,
  UserAccount,
  WeldJoint,
  WeldJointFieldKey,
} from '../types/welding';

export type RbacRoleCategory = 'admin' | 'technologist' | 'pto' | 'ndt' | 'customer';

export type RbacUserPayload = {
  role?: string;
  department?: string;
  login?: string;
  fullName?: string;
  isAdmin?: boolean;
};

export interface RolePermissions {
  category: RbacRoleCategory;
  categoryLabel: string;
  allowedScopeSummary: string;
  roleDescription: string;
  canEditWeldingTech: boolean;
  canEditLineList: boolean;
  canEditLrvCatalog: boolean;
  canCreateOrDeleteJoints: boolean;
  canEditPrepAndWeldingFields: boolean;
  canEditNdtFields: boolean;
}

/**
 * Поля сварного стыка, относящиеся к зоне ответственности Специалиста ЛНК
 * (ВИК, первичный НК, дублирующий НК и контроль ВИК/ФМК после ремонта).
 */
export const NDT_EDITABLE_JOINT_FIELDS = new Set<keyof WeldJoint>([
  // Первичный ВИК
  'vikResult',
  'vikDate',
  'vikInspector',
  // Первичный НК (РК / УЗК / ПВК)
  'ndtType',
  'ndtResult',
  'ndtDate',
  'ndtInspector',
  'ndtReportNumber',
  'rootWeldControl',
  'steeloscopyInfo',
  'hardnessTestInfo',
  'ferritePhaseInfo',
  // Дублирующий НК
  'dupNdtType',
  'dupNdtResult',
  'dupNdtDate',
  'dupNdtInspector',
  // Контроль после ремонта (СТО Газпром графы 38–48)
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
 * Поля сварного стыка, относящиеся к зоне ответственности Инженера ПТО / Мастера СМР
 * (подготовка производства, элементы ЛРВ1/ЛРВ2, сварочные работы, термообработка и ремонт сваркой).
 */
export const PTO_EDITABLE_JOINT_FIELDS = new Set<keyof WeldJoint>([
  'jointNumber',
  'isSupplementary',
  'objectName',
  'rdCode',
  'contour',
  'lineNumber',
  'uniqueLineId',
  'jointType',
  'diameterMm',
  'diameterInch',
  'equivDiameterInch',
  'wallThickness',
  // Элемент 1 и Элемент 2 (Каталог ЛРВ)
  'lrv1Code',
  'elem1Name',
  'elem1Material',
  'elem1Ntd',
  'elem1DiameterMm',
  'elem1WallThickness',
  'elem1Manufacturer',
  'elem1FactoryNumber',
  'elem1Length',
  'lrv2Code',
  'elem2Name',
  'elem2Material',
  'elem2Ntd',
  'elem2DiameterMm',
  'elem2WallThickness',
  'elem2Manufacturer',
  'elem2FactoryNumber',
  'elem2Length',
  // Сварочные работы
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
  'preheatTemp',
  'weldingMaterials',
  'techCardNumber',
  'responsiblePerson',
  'rootWeldControl',
  'steeloscopyInfo',
  'heatTreatOperator',
  'heatTreatDiagramNumber',
  'hardnessTestInfo',
  // Сведения о проведении ремонта (СТО Газпром графы 32–37, ГОСТ 32569 графа 15)
  'repairAction',
  'repairDate',
  'repairTechCard',
  'repairWelderStamp',
  'repairForeman',
]);

/**
 * Фильтрует групповой патч (Bulk Update) по правам текущего пользователя (Field-Level RBAC).
 */
export function filterBulkPatchByRole(
  patch: Partial<WeldJoint>,
  user: RbacUserPayload | null | undefined
): Partial<WeldJoint> {
  const filtered: Partial<WeldJoint> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (canUserEditJointField(user, k as keyof WeldJoint)) {
      (filtered as Record<string, unknown>)[k] = v;
    }
  }
  return filtered;
}

/**
 * Определяет ролевую категорию RBAC на основе должности, отдела и логина учётной записи.
 * 0) 'admin' — Администратор системы / Полный доступ ко всем разделам и полям
 * 1) 'technologist' — Технолог по сварке / Главный сварщик / НАКС / Техкарты
 * 2) 'ndt' — Специалист ЛНК / Дефектоскопист / Начальник ЛНК / ПИЛ / Инженер ВИК
 * 3) 'customer' — Представитель Заказчика / Строительный контроль (режим чтения и аудита)
 * 4) 'pto' — Инженер ПТО / Производитель работ СМР / Мастер СМР
 */
export function detectRbacRoleCategory(
  user: RbacUserPayload | null | undefined
): RbacRoleCategory {
  if (!user) return 'pto';
  if (user.isAdmin === true) {
    return 'admin';
  }
  const combined = `${user.role || ''} ${user.department || ''} ${user.login || ''}`.toLowerCase();

  if (
    combined.includes('администратор') ||
    combined.includes('админ') ||
    combined.includes('admin') ||
    combined.includes('суперпользователь') ||
    combined.includes('полный доступ')
  ) {
    return 'admin';
  }

  if (
    combined.includes('заказчик') ||
    combined.includes('стройконтрол') ||
    combined.includes('строительного контроля') ||
    combined.startsWith('cust_')
  ) {
    return 'customer';
  }

  if (
    combined.includes('технолог') ||
    combined.includes('главный сварщик') ||
    combined.includes('техкарт') ||
    combined.includes('отдел главного сварщика') ||
    combined.includes('огс') ||
    combined.startsWith('tech_')
  ) {
    return 'technologist';
  }

  if (
    combined.includes('лнк') ||
    combined.includes('дефектоскоп') ||
    combined.includes('неразрушающ') ||
    combined.includes('пил') ||
    combined.includes('инженер ск') ||
    combined.includes('инженер вик') ||
    combined.startsWith('lnk_') ||
    combined.startsWith('ndt_')
  ) {
    return 'ndt';
  }

  return 'pto';
}

/**
 * Возвращает полный набор прав доступа (Field-Level RBAC) для текущего пользователя.
 */
export function getUserRolePermissions(
  user: RbacUserPayload | null | undefined
): RolePermissions {
  const category = detectRbacRoleCategory(user);

  if (category === 'admin') {
    const desc =
      'Неограниченный доступ (Администратор): полное редактирование всех разделов («Технология сварки», «Лайнлист», «Каталог ЛРВ») и всех полей паспорта стыка.';
    return {
      category: 'admin',
      categoryLabel: 'Администратор',
      allowedScopeSummary: desc,
      roleDescription: desc,
      canEditWeldingTech: true,
      canEditLineList: true,
      canEditLrvCatalog: true,
      canCreateOrDeleteJoints: true,
      canEditPrepAndWeldingFields: true,
      canEditNdtFields: true,
    };
  }

  if (category === 'customer') {
    const desc =
      'Режим инспекционного просмотра и аудита (Представитель Заказчика / Стройконтроль): просмотр всех разделов, журналов и экспорт исполнительной документации без права внесения изменений.';
    return {
      category: 'customer',
      categoryLabel: 'Представитель Заказчика',
      allowedScopeSummary: desc,
      roleDescription: desc,
      canEditWeldingTech: false,
      canEditLineList: false,
      canEditLrvCatalog: false,
      canCreateOrDeleteJoints: false,
      canEditPrepAndWeldingFields: false,
      canEditNdtFields: false,
    };
  }

  if (category === 'technologist') {
    const desc =
      'Редактирование вкладки «Технология сварки» (НАКС, ТК, СМ). Остальные разделы и поля стыков — просмотр.';
    return {
      category: 'technologist',
      categoryLabel: 'Технолог по сварке',
      allowedScopeSummary: desc,
      roleDescription: desc,
      canEditWeldingTech: true,
      canEditLineList: false,
      canEditLrvCatalog: false,
      canCreateOrDeleteJoints: false,
      canEditPrepAndWeldingFields: false,
      canEditNdtFields: false,
    };
  }

  if (category === 'ndt') {
    const desc =
      'Редактирование только полей ВИК, первичного НК (РК/УЗК/ПВК) и дублирующего НК в паспорте и реестре стыков.';
    return {
      category: 'ndt',
      categoryLabel: 'Специалист ЛНК',
      allowedScopeSummary: desc,
      roleDescription: desc,
      canEditWeldingTech: false,
      canEditLineList: false,
      canEditLrvCatalog: false,
      canCreateOrDeleteJoints: false,
      canEditPrepAndWeldingFields: false,
      canEditNdtFields: true,
    };
  }

  const desc =
    'Редактирование раздела «Проект (лайнлист)» и полей подготовки/сварки в паспорте стыка. Раздел «Каталог ЛРВ» доступен в режиме чтения (редактирование закреплено за Администратором).';
  return {
    category: 'pto',
    categoryLabel: 'Инженер ПТО',
    allowedScopeSummary: desc,
    roleDescription: desc,
    canEditWeldingTech: false,
    canEditLineList: true,
    canEditLrvCatalog: false,
    canCreateOrDeleteJoints: true,
    canEditPrepAndWeldingFields: true,
    canEditNdtFields: false,
  };
}

/**
 * Проверяет, имеет ли пользователь право редактировать конкретное поле сварного стыка.
 */
export function canUserEditJointField(
  user: RbacUserPayload | null | undefined,
  fieldKey: keyof WeldJoint | WeldJointFieldKey
): boolean {
  if (fieldKey === 'jointNumber') return false; // Номер существующего стыка никогда не переименовывается
  const perms = getUserRolePermissions(user);
  if (perms.category === 'admin') {
    return true;
  }
  if (perms.category === 'technologist' || perms.category === 'customer') {
    return false;
  }
  if (perms.category === 'ndt') {
    return NDT_EDITABLE_JOINT_FIELDS.has(fieldKey as keyof WeldJoint);
  }
  // Инженер ПТО
  return PTO_EDITABLE_JOINT_FIELDS.has(fieldKey as keyof WeldJoint);
}

/**
 * Технически применяет Field-Level RBAC при сохранении сварного стыка:
 * 1) При создании нового стыка (!existingJoint): если у пользователя нет права canEditNdtFields (например, Инженер ПТО),
 *    все поля ВИК, первичного НК и дублирующего НК принудительно очищаются до статуса «Не проводился» / «Не требуется».
 * 2) При редактировании существующего стыка: все поля, которые не входят в зону ответственности роли пользователя,
 *    остаются неизменными (берутся из исходной записи existingJoint).
 */
export function enforceFieldLevelRbacOnJointSave(
  existingJoint: WeldJoint | null | undefined,
  incomingJoint: WeldJoint,
  user: RbacUserPayload | null | undefined
): WeldJoint {
  const perms = getUserRolePermissions(user);

  // Если стык создаётся впервые
  if (!existingJoint) {
    if (perms.canEditNdtFields) {
      return incomingJoint;
    }
    return {
      ...incomingJoint,
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

  // Для существующего стыка проверяем каждое поле
  const result: WeldJoint = { ...existingJoint };
  const allKeys = new Set<string>([
    ...Object.keys(existingJoint),
    ...Object.keys(incomingJoint),
  ]);

  for (const key of allKeys) {
    if (key === 'id' || key === 'jointNumber' || key === 'version') {
      continue;
    }
    if (key === 'updatedAt' || key === 'updatedBy') {
      (result as unknown as Record<string, unknown>)[key] =
        (incomingJoint as unknown as Record<string, unknown>)[key];
      continue;
    }

    const oldVal = (existingJoint as unknown as Record<string, unknown>)[key];
    const newVal = (incomingJoint as unknown as Record<string, unknown>)[key];

    const isSame =
      JSON.stringify(oldVal ?? '') === JSON.stringify(newVal ?? '');
    if (isSame) continue;

    if (canUserEditJointField(user, key as keyof WeldJoint)) {
      (result as unknown as Record<string, unknown>)[key] = newVal;
    } else {
      // Сохраняем исходное значение поля из БД
      (result as unknown as Record<string, unknown>)[key] = oldVal;
    }
  }

  return result;
}

/**
 * Форматирует полное ФИО специалиста (например, «Орлова Елена Викторовна») в краткую форму с инициалами («Орлова Е.В.»).
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
 * Объединяет базовый справочник инспекторов с учётными записями специалистов ЛНК / Администраторов из базы пользователей,
 * чтобы созданные в системе дефектоскописты автоматически появлялись в выпадающих списках ВИК и НК.
 */
export function mergeDynamicInspectors(
  staticInspectors: InspectorProfile[],
  userAccounts: UserAccount[]
): InspectorProfile[] {
  const result: InspectorProfile[] = [...staticInspectors];
  const seenNames = new Set(
    staticInspectors.map((i) => i.fullName.trim().toLowerCase())
  );

  userAccounts.forEach((acc, idx) => {
    const cat = detectRbacRoleCategory(acc);
    if (cat !== 'ndt' && cat !== 'admin') return;
    const shortName = formatInspectorShortName(acc.fullName);
    if (!shortName) return;
    if (seenNames.has(shortName.toLowerCase()) || seenNames.has(acc.fullName.trim().toLowerCase())) {
      return;
    }
    seenNames.add(shortName.toLowerCase());
    result.unshift({
      fullName: shortName,
      certLevel: cat === 'ndt' ? 'II уровень ВИК, РК, УЗК' : 'Инженер ЛНК',
      labName: acc.department || 'Лаборатория неразрушающего контроля (ЛНК)',
    });
  });

  return result;
}
