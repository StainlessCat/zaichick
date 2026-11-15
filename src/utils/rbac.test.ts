import { describe, expect, test } from 'vitest';
import {
  canUserEditJointField,
  detectRbacRoleCategory,
  enforceFieldLevelRbacOnJointSave,
  filterBulkPatchByRole,
  formatInspectorShortName,
  getUserRolePermissions,
  mergeDynamicInspectors,
  NDT_EDITABLE_JOINT_FIELDS,
  PTO_EDITABLE_JOINT_FIELDS,
  RbacUserPayload,
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

    const ptoPerms = getUserRolePermissions(ptoUser);
    expect(ptoPerms.canEditWeldingTech).toBe(false);
    expect(ptoPerms.canEditLineList).toBe(true);
    expect(ptoPerms.canEditLrvCatalog).toBe(false);
    expect(ptoPerms.canCreateOrDeleteJoints).toBe(true);
    expect(ptoPerms.canEditPrepAndWeldingFields).toBe(true);
    expect(ptoPerms.canEditNdtFields).toBe(false);

    const ndtPerms = getUserRolePermissions(ndtUser);
    expect(ndtPerms.canEditWeldingTech).toBe(false);
    expect(ndtPerms.canEditLineList).toBe(false);
    expect(ndtPerms.canEditLrvCatalog).toBe(false);
    expect(ndtPerms.canCreateOrDeleteJoints).toBe(false);
    expect(ndtPerms.canEditPrepAndWeldingFields).toBe(false);
    expect(ndtPerms.canEditNdtFields).toBe(true);

    const techPerms = getUserRolePermissions(techUser);
    expect(techPerms.canEditWeldingTech).toBe(true);
    expect(techPerms.canEditLineList).toBe(false);
    expect(techPerms.canEditLrvCatalog).toBe(false);
    expect(techPerms.canCreateOrDeleteJoints).toBe(false);
    expect(techPerms.canEditPrepAndWeldingFields).toBe(false);
    expect(techPerms.canEditNdtFields).toBe(false);

    const custPerms = getUserRolePermissions(customerUser);
    expect(custPerms.canEditWeldingTech).toBe(false);
    expect(custPerms.canEditLineList).toBe(false);
    expect(custPerms.canEditLrvCatalog).toBe(false);
    expect(custPerms.canCreateOrDeleteJoints).toBe(false);
    expect(custPerms.canEditPrepAndWeldingFields).toBe(false);
    expect(custPerms.canEditNdtFields).toBe(false);
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
    const mockJoint: WeldJoint = {
      id: 'j-1',
      jointNumber: 'С-101',
      objectName: 'УКПГ-1С',
      rdCode: '01-2024',
      uniqueLineId: 'L-01',
      welderStamp: 'СВ01',
      vikResult: 'Не проводился',
      ndtResult: 'Не проводился',
    };

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
      },
      {
        id: 'u2',
        login: 'pto_ivanov',
        fullName: 'Иванов Иван Иванович',
        role: 'Инженер ПТО',
        department: 'ПТО',
      },
    ];

    const merged = mergeDynamicInspectors(staticInspectors, users);
    // Дефектоскопист Петров П.П. должен быть добавлен, а Инженер ПТО Иванов не должен попадать в список инспекторов ЛНК
    expect(merged.some((i) => i.fullName === 'Петров П.П.')).toBe(true);
    expect(merged.some((i) => i.fullName === 'Иванов И.И.')).toBe(false);
  });
});
