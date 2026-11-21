import { describe, expect, test } from 'vitest';
import {
  canUserEditJointField,
  canUserMutateRecord,
  canUserTransitionRecordStatus,
  detectRbacRoleCategory,
  enforceFieldLevelRbacOnJointSave,
  filterBulkPatchByRole,
  formatInspectorShortName,
  getUserRolePermissions,
  mergeDynamicInspectors,
  NDT_EDITABLE_JOINT_FIELDS,
  PTO_EDITABLE_JOINT_FIELDS,
  RbacUserPayload,
  resolveUserDepartment,
  resolveUserSystemRole,
  validateRoleDepartmentPair,
} from './rbac';
import { InspectorProfile, UserAccount, WeldJoint } from '../types/welding';

describe('RBAC & Role-Based Permissions (src/utils/rbac.ts)', () => {
  const adminUser: RbacUserPayload = {
    login: 'admin',
    fullName: 'Администратор Системы',
    isAdmin: true,
  };

  const ptoUser: RbacUserPayload = {
    login: 'pto_volkhov',
    fullName: 'Волхов Алексей Сергеевич',
    role: 'Инженер ПТО',
    department: 'Производственно-технический отдел',
  };

  const ndtUser: RbacUserPayload = {
    login: 'ndt_volkhov',
    fullName: 'Смирнов Игорь Викторович',
    role: 'Специалист ЛНК II уровня',
    department: 'Лаборатория неразрушающего контроля',
  };

  const techUser: RbacUserPayload = {
    login: 'tech_volkhov',
    fullName: 'Егоров Денис Владимирович',
    role: 'Главный сварщик / Технолог',
    department: 'Отдел главного сварщика',
  };

  const customerUser: RbacUserPayload = {
    login: 'cust_gazprom',
    fullName: 'Петров Сергей Николаевич',
    role: 'Инспектор строительного контроля',
    department: 'Строительный контроль Заказчика',
  };

  const anonymousUser: RbacUserPayload = {
    login: 'anonymous',
    fullName: 'Неавторизованный гость',
  };

  test('1. detectRbacRoleCategory правильно распознает все 5 ролевых категорий', () => {
    expect(detectRbacRoleCategory(adminUser)).toBe('admin');
    expect(detectRbacRoleCategory({ backendRole: 'ADMIN', login: 'root' })).toBe('admin');
    expect(detectRbacRoleCategory({ role: 'Системный администратор', login: 'u1' })).toBe('admin');

    expect(detectRbacRoleCategory(ptoUser)).toBe('pto');
    expect(detectRbacRoleCategory({ backendRole: 'PTO', login: 'pto_user' })).toBe('pto');

    expect(detectRbacRoleCategory(ndtUser)).toBe('ndt');
    expect(detectRbacRoleCategory({ backendRole: 'PIL', login: 'pil_user' })).toBe('ndt');
    expect(detectRbacRoleCategory({ role: 'Дефектоскопист РК и УЗК', login: 'def1' })).toBe('ndt');

    expect(detectRbacRoleCategory(techUser)).toBe('technologist');
    expect(detectRbacRoleCategory({ backendRole: 'OGS', login: 'ogs_user' })).toBe('technologist');

    expect(detectRbacRoleCategory(customerUser)).toBe('customer');
    expect(detectRbacRoleCategory({ backendRole: 'VIEWER', login: 'view_user' })).toBe('customer');
    expect(detectRbacRoleCategory(anonymousUser)).toBe('customer');
    expect(detectRbacRoleCategory(null)).toBe('customer');
    expect(detectRbacRoleCategory(undefined)).toBe('customer');
  });

  test('2. getUserRolePermissions выдаёт точную матрицу прав для каждой роли', () => {
    const adminPerms = getUserRolePermissions(adminUser);
    expect(adminPerms.canEditWeldingTech).toBe(true);
    expect(adminPerms.canEditLineList).toBe(true);
    expect(adminPerms.canEditLrvCatalog).toBe(true);
    expect(adminPerms.canCreateOrDeleteJoints).toBe(true);
    expect(adminPerms.canEditPrepAndWeldingFields).toBe(true);
    expect(adminPerms.canEditNdtFields).toBe(true);
    expect(adminPerms.canViewAuditLogs).toBe(true);

    const ptoPerms = getUserRolePermissions(ptoUser);
    expect(ptoPerms.canEditWeldingTech).toBe(false);
    expect(ptoPerms.canEditLineList).toBe(false);
    expect(ptoPerms.canEditLrvCatalog).toBe(false);
    expect(ptoPerms.canCreateOrDeleteJoints).toBe(true);
    expect(ptoPerms.canEditPrepAndWeldingFields).toBe(true);
    expect(ptoPerms.canEditNdtFields).toBe(false);
    expect(ptoPerms.canViewAuditLogs).toBe(false);

    const ndtPerms = getUserRolePermissions(ndtUser);
    expect(ndtPerms.canEditWeldingTech).toBe(false);
    expect(ndtPerms.canEditLineList).toBe(false);
    expect(ndtPerms.canEditLrvCatalog).toBe(false);
    expect(ndtPerms.canCreateOrDeleteJoints).toBe(false);
    expect(ndtPerms.canEditPrepAndWeldingFields).toBe(false);
    expect(ndtPerms.canEditNdtFields).toBe(true);
    expect(ndtPerms.canViewAuditLogs).toBe(false);

    const techPerms = getUserRolePermissions(techUser);
    expect(techPerms.canEditWeldingTech).toBe(true);
    expect(techPerms.canEditLineList).toBe(false);
    expect(techPerms.canEditLrvCatalog).toBe(false);
    expect(techPerms.canCreateOrDeleteJoints).toBe(false);
    expect(techPerms.canEditPrepAndWeldingFields).toBe(false);
    expect(techPerms.canEditNdtFields).toBe(false);
    expect(techPerms.canViewAuditLogs).toBe(true);

    const custPerms = getUserRolePermissions(customerUser);
    expect(custPerms.canEditWeldingTech).toBe(false);
    expect(custPerms.canEditLineList).toBe(false);
    expect(custPerms.canEditLrvCatalog).toBe(false);
    expect(custPerms.canCreateOrDeleteJoints).toBe(false);
    expect(custPerms.canEditPrepAndWeldingFields).toBe(false);
    expect(custPerms.canEditNdtFields).toBe(false);
    expect(custPerms.canViewAuditLogs).toBe(false);
  });

  test('3. canUserEditJointField строго разграничивает доступ к отдельным полям стыка', () => {
    // Номер стыка jointNumber иммутабелен для всех без исключения
    expect(canUserEditJointField(adminUser, 'jointNumber')).toBe(false);
    expect(canUserEditJointField(ptoUser, 'jointNumber')).toBe(false);
    expect(canUserEditJointField(ndtUser, 'jointNumber')).toBe(false);

    // Администратор может менять и технологические поля, и поля контроля
    expect(canUserEditJointField(adminUser, 'welderStamp')).toBe(true);
    expect(canUserEditJointField(adminUser, 'vikResult')).toBe(true);
    expect(canUserEditJointField(adminUser, 'ndtResult')).toBe(true);

    // ПТО / Мастер может менять параметры сварки и подготовки, но НЕ результаты НК
    expect(canUserEditJointField(ptoUser, 'welderStamp')).toBe(true);
    expect(canUserEditJointField(ptoUser, 'weldingDate')).toBe(true);
    expect(canUserEditJointField(ptoUser, 'preheatTemp')).toBe(true);
    expect(canUserEditJointField(ptoUser, 'techCardNumber')).toBe(true);
    expect(canUserEditJointField(ptoUser, 'vikResult')).toBe(false);
    expect(canUserEditJointField(ptoUser, 'ndtResult')).toBe(false);
    expect(canUserEditJointField(ptoUser, 'repairNdtResult')).toBe(false);

    // Специалист ЛНК может менять поля ВИК/НК, но НЕ технологические параметры
    expect(canUserEditJointField(ndtUser, 'vikResult')).toBe(true);
    expect(canUserEditJointField(ndtUser, 'ndtResult')).toBe(true);
    expect(canUserEditJointField(ndtUser, 'ndtReportNumber')).toBe(true);
    expect(canUserEditJointField(ndtUser, 'repairVikResult')).toBe(true);
    expect(canUserEditJointField(ndtUser, 'welderStamp')).toBe(false);
    expect(canUserEditJointField(ndtUser, 'diameterMm')).toBe(false);
    expect(canUserEditJointField(ndtUser, 'ambientTemp')).toBe(false);

    // Заказчик и Технолог не могут менять поля стыка в паспорте
    expect(canUserEditJointField(customerUser, 'vikResult')).toBe(false);
    expect(canUserEditJointField(customerUser, 'welderStamp')).toBe(false);
    expect(canUserEditJointField(techUser, 'welderStamp')).toBe(false);
  });

  test('4. filterBulkPatchByRole отфильтровывает несанкционированные поля в пакетном обновлении', () => {
    const rawPatch: Partial<WeldJoint> = {
      welderStamp: 'СВ01',
      preheatTemp: '120',
      vikResult: 'Годен',
      ndtResult: 'Годен',
    };

    // ПТО получит только сварку
    const ptoFiltered = filterBulkPatchByRole(rawPatch, ptoUser);
    expect(ptoFiltered).toEqual({
      welderStamp: 'СВ01',
      preheatTemp: '120',
    });

    // ЛНК получит только контроль
    const ndtFiltered = filterBulkPatchByRole(rawPatch, ndtUser);
    expect(ndtFiltered).toEqual({
      vikResult: 'Годен',
      ndtResult: 'Годен',
    });

    // Администратор получит всё
    const adminFiltered = filterBulkPatchByRole(rawPatch, adminUser);
    expect(adminFiltered).toEqual(rawPatch);

    // Заказчик не получит ничего
    const custFiltered = filterBulkPatchByRole(rawPatch, customerUser);
    expect(custFiltered).toEqual({});
  });

  test('5. enforceFieldLevelRbacOnJointSave предотвращает подделку НК при создании и редактировании стыка', () => {
    const mockJoint = {
      id: 'j-1',
      jointNumber: 'С-101',
      objectName: 'УКПГ-1С',
      rdCode: '01-2024',
      uniqueLineId: 'L-01',
      welderStamp: 'СВ01',
      vikResult: 'Не проводился',
      ndtResult: 'Не проводился',
    } as WeldJoint;

    // 1) ПТО пытается создать новый стык сразу со статусом «Годен» по ВИК и НК
    const attemptedNewJoint: WeldJoint = {
      ...mockJoint,
      id: 'j-2',
      jointNumber: 'С-102',
      vikResult: 'Годен',
      ndtResult: 'Годен',
      ndtReportNumber: 'АКТ-999',
    };
    const securedNewJoint = enforceFieldLevelRbacOnJointSave(null, attemptedNewJoint, ptoUser);
    expect(securedNewJoint.vikResult).toBe('Не проводился');
    expect(securedNewJoint.ndtResult).toBe('Не проводился');
    expect(securedNewJoint.ndtReportNumber).toBe('');

    // 2) ПТО пытается подменить существующий результат НК в существующем стыке
    const existingJointWithNdt: WeldJoint = {
      ...mockJoint,
      vikResult: 'Годен',
      ndtResult: 'Ремонт',
      ndtReportNumber: 'АКТ-001',
    };
    const ptoTamperedJoint: WeldJoint = {
      ...existingJointWithNdt,
      welderStamp: 'СВ02', // Разрешено для ПТО
      ndtResult: 'Годен',   // Запрещено для ПТО (попытка скрыть брак)
    };
    const securedEdit = enforceFieldLevelRbacOnJointSave(existingJointWithNdt, ptoTamperedJoint, ptoUser);
    expect(securedEdit.welderStamp).toBe('СВ02');
    expect(securedEdit.ndtResult).toBe('Ремонт'); // Поле НК защищено и осталось 'Ремонт'!

    // 3) ЛНК вносит результаты контроля, но пытается изменить диаметр трубы или клеймо
    const ndtTamperedJoint: WeldJoint = {
      ...existingJointWithNdt,
      ndtResult: 'Годен', // Разрешено для ЛНК
      welderStamp: 'СВ99', // Запрещено для ЛНК
    };
    const securedNdtEdit = enforceFieldLevelRbacOnJointSave(existingJointWithNdt, ndtTamperedJoint, ndtUser);
    expect(securedNdtEdit.ndtResult).toBe('Годен');
    expect(securedNdtEdit.welderStamp).toBe('СВ01'); // Клеймо сварщика осталось исходным!
  });

  test('6. formatInspectorShortName корректно форматирует фамилию и инициалы специалистов', () => {
    expect(formatInspectorShortName('Орлова Елена Викторовна')).toBe('Орлова Е.В.');
    expect(formatInspectorShortName('Иванов Иван Иванович (ВИК, РК)')).toBe('Иванов И.И.');
    expect(formatInspectorShortName('Сидоров А.Б.')).toBe('Сидоров А.Б.');
    expect(formatInspectorShortName('Ковалев')).toBe('Ковалев');
    expect(formatInspectorShortName('')).toBe('');
    expect(formatInspectorShortName(null)).toBe('');
  });

  test('7. mergeDynamicInspectors динамически добавляет пользователей ЛНК в выпадающие списки инспекторов', () => {
    const staticInspectors: InspectorProfile[] = [
      { fullName: 'Орлова Е.В.', certLevel: 'II уровень', labName: 'ЛНК' },
    ];

    const users: UserAccount[] = [
      {
        id: 'u1',
        login: 'ndt_petrov',
        fullName: 'Петров Петр Петрович',
        role: 'Дефектоскопист',
        department: 'Лаборатория НК',
        sessionNumber: 1,
      },
      {
        id: 'u2',
        login: 'pto_ivanov',
        fullName: 'Иванов Иван Иванович',
        role: 'Инженер ПТО',
        department: 'ПТО',
        sessionNumber: 2,
      },
    ];

    const merged = mergeDynamicInspectors(staticInspectors, users);
    // Дефектоскопист Петров П.П. должен быть добавлен, а Инженер ПТО Иванов не должен попадать в список инспекторов ЛНК
    expect(merged.some((i) => i.fullName === 'Петров П.П.')).toBe(true);
    expect(merged.some((i) => i.fullName === 'Иванов И.И.')).toBe(false);
  });

  test('8. Гостевой профиль (anonymous / customer) строго заблокирован от создания заявок и выдачи заключений', () => {
    const perms = getUserRolePermissions(anonymousUser);
    expect(perms.category).toBe('customer');
    expect(perms.canEditNdtFields).toBe(false);
    expect(perms.canEditLineList).toBe(false);
    expect(perms.canCreateOrDeleteJoints).toBe(false);
    expect(perms.canEditPrepAndWeldingFields).toBe(false);
    expect(perms.canEditWeldingTech).toBe(false);
    expect(perms.canViewAuditLogs).toBe(false);
  });
});

describe('Stage 1: Hierarchical RBAC (SystemRole × Department) & Record Locking', () => {
  const superAdmin: RbacUserPayload = {
    id: 'u-super',
    login: 'admin',
    fullName: 'Суперадминистратор',
    systemRole: 'SUPERADMIN',
    departmentCode: 'ALL',
    isActive: true,
  };

  const ptoDeptAdmin: RbacUserPayload = {
    id: 'u-pto-adm',
    login: 'sokolov_av',
    fullName: 'Соколов А.В.',
    systemRole: 'DEPT_ADMIN',
    departmentCode: 'PTO',
    isActive: true,
  };

  const ogsDeptAdmin: RbacUserPayload = {
    id: 'u-ogs-adm',
    login: 'morozov_iv',
    fullName: 'Морозов И.В.',
    systemRole: 'DEPT_ADMIN',
    departmentCode: 'OGS',
    isActive: true,
  };

  const ptoOperatorA: RbacUserPayload = {
    id: 'u-pto-op-a',
    login: 'gromov_ia',
    fullName: 'Громов И.А.',
    systemRole: 'OPERATOR',
    departmentCode: 'PTO',
    isActive: true,
  };

  const ptoOperatorB: RbacUserPayload = {
    id: 'u-pto-op-b',
    login: 'petrov_aa',
    fullName: 'Петров А.А.',
    systemRole: 'OPERATOR',
    departmentCode: 'PTO',
    isActive: true,
  };

  const ogsOperator: RbacUserPayload = {
    id: 'u-ogs-op',
    login: 'ogs_eng',
    fullName: 'Инженер ОГС',
    systemRole: 'OPERATOR',
    departmentCode: 'OGS',
    isActive: true,
  };

  const inactiveAdmin: RbacUserPayload = {
    id: 'u-disabled',
    login: 'old_admin',
    fullName: 'Отключённый админ',
    systemRole: 'SUPERADMIN',
    departmentCode: 'ALL',
    isActive: false,
  };

  test('9. validateRoleDepartmentPair запрещает отдел ALL для любых ролей кроме SUPERADMIN', () => {
    expect(validateRoleDepartmentPair('SUPERADMIN', 'ALL')).toBeNull();
    expect(validateRoleDepartmentPair('DEPT_ADMIN', 'ALL')).toBeTruthy();
    expect(validateRoleDepartmentPair('OPERATOR', 'ALL')).toBeTruthy();
    expect(validateRoleDepartmentPair('VIEWER', 'ALL')).toBeTruthy();
    expect(validateRoleDepartmentPair('DEPT_ADMIN', 'PTO')).toBeNull();
    expect(validateRoleDepartmentPair('OPERATOR', 'PIL')).toBeNull();
  });

  test('10. Иерархические права отделов: OPERATOR не может редактировать справочники и управлять пользователями', () => {
    const superPerms = getUserRolePermissions(superAdmin);
    expect(superPerms.isSuperAdmin).toBe(true);
    expect(superPerms.canManageAllUsers).toBe(true);
    expect(superPerms.canPurgeProject).toBe(true);
    expect(superPerms.canUnlockRecords).toBe(true);
    expect(superPerms.canEditLineList).toBe(true);
    expect(superPerms.canViewAuditLogs).toBe(true);

    const ptoAdmPerms = getUserRolePermissions(ptoDeptAdmin);
    expect(ptoAdmPerms.isDeptAdmin).toBe(true);
    expect(ptoAdmPerms.canManageUsers).toBe(true);
    expect(ptoAdmPerms.canManageAllUsers).toBe(false);
    expect(ptoAdmPerms.canPurgeProject).toBe(false);
    expect(ptoAdmPerms.canApproveRecords).toBe(true);
    expect(ptoAdmPerms.canUnlockRecords).toBe(false);
    expect(ptoAdmPerms.canEditLineList).toBe(true);
    expect(ptoAdmPerms.canEditLrvCatalog).toBe(true);
    expect(ptoAdmPerms.canEditWeldingTech).toBe(false);
    expect(ptoAdmPerms.canViewAuditLogs).toBe(true);

    const ogsAdmPerms = getUserRolePermissions(ogsDeptAdmin);
    expect(ogsAdmPerms.canEditWeldingTech).toBe(true);
    expect(ogsAdmPerms.canEditLineList).toBe(false);
    expect(ogsAdmPerms.canEditLrvCatalog).toBe(false);
    expect(ogsAdmPerms.canViewAuditLogs).toBe(true);

    const ogsOpPerms = getUserRolePermissions(ogsOperator);
    expect(ogsOpPerms.canEditWeldingTech).toBe(false);
    expect(ogsOpPerms.canEditDirectories).toBe(false);
    expect(ogsOpPerms.canManageUsers).toBe(false);
    expect(ogsOpPerms.canViewAuditLogs).toBe(false);

    const ptoOpPerms = getUserRolePermissions(ptoOperatorA);
    expect(ptoOpPerms.canEditLrvCatalog).toBe(false);
    expect(ptoOpPerms.canEditLineList).toBe(false);
    expect(ptoOpPerms.canApproveRecords).toBe(false);
    expect(ptoOpPerms.canCreateOrDeleteJoints).toBe(true);
    expect(ptoOpPerms.canViewAuditLogs).toBe(false);

    // Деактивированный пользователь полностью лишён прав
    expect(resolveUserSystemRole(inactiveAdmin)).toBe('VIEWER');
    expect(resolveUserDepartment(inactiveAdmin)).toBe('SK');
    const disabledPerms = getUserRolePermissions(inactiveAdmin);
    expect(disabledPerms.isActive).toBe(false);
    expect(disabledPerms.canManageUsers).toBe(false);
    expect(disabledPerms.canEditPrepAndWeldingFields).toBe(false);
    expect(disabledPerms.canViewAuditLogs).toBe(false);
  });

  test('11. canUserMutateRecord: защита DRAFT/VERIFIED/LOCKED, авторство при удалении и справочники', () => {
    const draftByA = { recordStatus: 'DRAFT' as const, createdById: 'u-pto-op-a' };
    const verifiedByA = { recordStatus: 'VERIFIED' as const, createdById: 'u-pto-op-a' };
    const lockedByA = { recordStatus: 'LOCKED' as const, createdById: 'u-pto-op-a' };

    // OPERATOR A может редактировать и удалять свой DRAFT
    expect(canUserMutateRecord(ptoOperatorA, draftByA, ['PTO'], 'edit').allowed).toBe(true);
    expect(canUserMutateRecord(ptoOperatorA, draftByA, ['PTO'], 'delete').allowed).toBe(true);

    // OPERATOR B НЕ может удалять чужой DRAFT
    expect(canUserMutateRecord(ptoOperatorB, draftByA, ['PTO'], 'delete').allowed).toBe(false);

    // OPERATOR A НЕ может редактировать или удалять VERIFIED и LOCKED
    expect(canUserMutateRecord(ptoOperatorA, verifiedByA, ['PTO'], 'edit').allowed).toBe(false);
    expect(canUserMutateRecord(ptoOperatorA, verifiedByA, ['PTO'], 'delete').allowed).toBe(false);
    expect(canUserMutateRecord(ptoOperatorA, lockedByA, ['PTO'], 'edit').allowed).toBe(false);

    // OPERATOR НЕ может изменять справочники
    expect(canUserMutateRecord(ptoOperatorA, draftByA, ['PTO'], 'edit', true).allowed).toBe(false);

    // DEPT_ADMIN ПТО может редактировать и удалять DRAFT и VERIFIED, но НЕ LOCKED и НЕ чужой отдел
    expect(canUserMutateRecord(ptoDeptAdmin, verifiedByA, ['PTO'], 'edit').allowed).toBe(true);
    expect(canUserMutateRecord(ptoDeptAdmin, verifiedByA, ['PTO'], 'delete').allowed).toBe(true);
    expect(canUserMutateRecord(ptoDeptAdmin, lockedByA, ['PTO'], 'edit').allowed).toBe(false);
    expect(canUserMutateRecord(ogsDeptAdmin, draftByA, ['PTO'], 'edit').allowed).toBe(false);

    // SUPERADMIN также не может редактировать LOCKED запись до её явной разблокировки
    expect(canUserMutateRecord(superAdmin, lockedByA, ['PTO'], 'edit').allowed).toBe(false);
    expect(canUserMutateRecord(superAdmin, verifiedByA, ['PTO'], 'edit').allowed).toBe(true);
  });

  test('12. canUserTransitionRecordStatus: матрица переходов DRAFT ↔ VERIFIED → LOCKED и разблокировка SUPERADMIN', () => {
    // OPERATOR не может менять статусы
    expect(canUserTransitionRecordStatus(ptoOperatorA, 'DRAFT', 'VERIFIED', ['PTO']).allowed).toBe(false);
    expect(canUserTransitionRecordStatus(ptoOperatorA, 'VERIFIED', 'LOCKED', ['PTO']).allowed).toBe(false);

    // DEPT_ADMIN своего отдела может DRAFT <-> VERIFIED -> LOCKED, но не может разблокировать LOCKED
    expect(canUserTransitionRecordStatus(ptoDeptAdmin, 'DRAFT', 'VERIFIED', ['PTO']).allowed).toBe(true);
    expect(canUserTransitionRecordStatus(ptoDeptAdmin, 'VERIFIED', 'DRAFT', ['PTO']).allowed).toBe(true);
    expect(canUserTransitionRecordStatus(ptoDeptAdmin, 'VERIFIED', 'LOCKED', ['PTO']).allowed).toBe(true);
    expect(canUserTransitionRecordStatus(ptoDeptAdmin, 'DRAFT', 'LOCKED', ['PTO']).allowed).toBe(false);
    expect(canUserTransitionRecordStatus(ptoDeptAdmin, 'LOCKED', 'VERIFIED', ['PTO']).allowed).toBe(false);

    // DEPT_ADMIN чужого отдела не может утверждать записи ПТО
    expect(canUserTransitionRecordStatus(ogsDeptAdmin, 'DRAFT', 'VERIFIED', ['PTO']).allowed).toBe(false);

    // SUPERADMIN может разблокировать LOCKED с обязательным указанием причины
    const unlockCheck = canUserTransitionRecordStatus(superAdmin, 'LOCKED', 'VERIFIED', ['PTO']);
    expect(unlockCheck.allowed).toBe(true);
    expect(unlockCheck.requiresReason).toBe(true);
  });

  test('13. canUserEditJointField учитывает статус записи LOCKED и VERIFIED', () => {
    const lockedJoint = { recordStatus: 'LOCKED' } as WeldJoint;
    const verifiedJoint = { recordStatus: 'VERIFIED' } as WeldJoint;

    expect(canUserEditJointField(superAdmin, 'welderStamp', lockedJoint)).toBe(false);
    expect(canUserEditJointField(ptoDeptAdmin, 'welderStamp', lockedJoint)).toBe(false);
    expect(canUserEditJointField(ptoOperatorA, 'welderStamp', verifiedJoint)).toBe(false);
    expect(canUserEditJointField(ptoDeptAdmin, 'welderStamp', verifiedJoint)).toBe(true);
  });
});

