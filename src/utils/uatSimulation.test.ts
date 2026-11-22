import { describe, expect, test } from 'vitest';
import {
  FacilityObject,
  LRVItem,
  NdtLabRequest,
  ProjectLineItem,
  TechCardItem,
  WelderProfile,
  WeldJoint,
} from '../types/welding';
import {
  canUserEditJointField,
  enforceFieldLevelRbacOnJointSave,
  getUserRolePermissions,
  RbacUserPayload,
} from './rbac';
import {
  formatStoGazpromJournalRow,
  STO_GAZPROM_15_1_1_002_2023_COLUMNS,
} from './journals';
import { isJointFullyAccepted } from './readiness';
import { calculateWelderNdtQuotas } from './ndtQuotas';
import { getJointEquivDiaInch, isJointWelded } from './jointDerived';

describe('Сквозной ролевой симуляционный UAT-тест системы ZAYCHICK (5 этапов)', () => {
  // Актёры и роли
  const ptoAdminUser: RbacUserPayload = {
    login: 'pto_admin_volkhov',
    fullName: 'Волхов Алексей Сергеевич',
    role: 'Начальник ПТО',
    systemRole: 'DEPT_ADMIN',
    departmentCode: 'PTO',
    department: 'Производственно-технический отдел',
  };

  const ptoUser: RbacUserPayload = {
    login: 'pto_volkhov',
    fullName: 'Волхов Алексей Сергеевич',
    role: 'Ведущий инженер ПТО',
    department: 'Производственно-технический отдел',
  };

  const techUser: RbacUserPayload = {
    login: 'tech_volkhov',
    fullName: 'Морозов Илья Викторович',
    role: 'Главный сварщик / Технолог',
    department: 'Отдел главного сварщика',
  };

  const ndtUser: RbacUserPayload = {
    login: 'ndt_volkhov',
    fullName: 'Лебедев Константин Михайлович',
    role: 'Начальник лаборатории НК (ПИЛ)',
    department: 'Лаборатория неразрушающего контроля',
  };

  // Контекст объекта
  const facility: FacilityObject = {
    id: 'fac-1',
    name: 'УКПГ-1С Харасавэйское ГКМ',
    shortName: 'УКПГ-1С',
    region: 'ЯНАО',
    latitude: 71.1,
    longitude: 66.9,
    rdCodes: [
      {
        code: '0092.049.Р.13/1 0004 УКПГ.045.0077.001-ТХ3',
        title: 'Технологические трубопроводы установки сепарации',
        contours: ['Контур 1'],
      },
    ],
  };

  const rdCode = facility.rdCodes[0].code;
  const lineId = `${rdCode}:10-ГП-101`;

  // Переменные состояния для передачи между этапами сквозного сценария
  let createdLine: ProjectLineItem;
  let techCard: TechCardItem;
  let welderProfile: WelderProfile;
  let joint1: WeldJoint;
  let joint2: WeldJoint;
  let labRequest: NdtLabRequest;

  // =========================================================================
  // ЭТАП 1: РОЛЬ «ИНЖЕНЕР ПТО» — СОЗДАНИЕ НОВОЙ ТЕХНОЛОГИЧЕСКОЙ ЛИНИИ
  // =========================================================================
  test('Этап 1: Администратор отдела ПТО создаёт технологическую линию с требованием РК 100%', () => {
    const ptoAdminPerms = getUserRolePermissions(ptoAdminUser);
    expect(ptoAdminPerms.canEditLineList).toBe(true);
    expect(ptoAdminPerms.canEditWeldingTech).toBe(false);

    const ptoPerms = getUserRolePermissions(ptoUser);
    expect(ptoPerms.canEditLineList).toBe(false);
    expect(ptoPerms.canEditWeldingTech).toBe(false);

    createdLine = {
      id: 'line-uat-01',
      objectName: facility.name,
      rdCode,
      uniqueLineId: lineId,
      lineNumber: '10-ГП-101',
      lineName: 'Газопровод дренажа сепаратора С-101',
      product: 'Природный газ',
      testContour: 'Контур 1',
      weldingNtd: 'ГОСТ 16037-80',
      controlNtd: 'СТО Газпром 15-1.3-004-2023',
      qualityLevel: 'B',
      pipelineCategory: 'I',
      workingPressure: '9.8 МПа',
      workingTemperature: '+45°C',
      testDate: '2026-12-01',
      rkPercent: 100,
      uzkPercent: 0,
      pvkPercent: 0,
    };

    expect(createdLine.uniqueLineId).toBe(lineId);
    expect(createdLine.rkPercent).toBe(100);
  });

  // =========================================================================
  // ЭТАП 2: РОЛЬ «ТЕХНОЛОГ ПО СВАРКЕ» — РАЗРАБОТКА ТК И АТТЕСТАЦИЯ НАКС
  // =========================================================================
  test('Этап 2: Технолог по сварке разрабатывает ТК и регистрирует сварщика НАКС', () => {
    const techPerms = getUserRolePermissions(techUser);
    expect(techPerms.canEditWeldingTech).toBe(true);
    expect(techPerms.canEditLineList).toBe(false);
    expect(techPerms.canCreateOrDeleteJoints).toBe(false);

    techCard = {
      id: 'tc-uat-01',
      number: 'ТК-UAT-РАД/РД',
      title: 'Сварка технологических трубопроводов сепарации УКПГ',
      weldingType: 'РАД+РД',
      jointKind: 'Стыковое',
      elementCombination: 'Труба+Труба',
      ntd: 'СТО Газпром 15-1.1-002-2023',
      minDiameterMm: 57,
      maxDiameterMm: 325,
      minWallThicknessMm: 4.0,
      maxWallThicknessMm: 20.0,
      steelGroup: '09Г2С',
      recommendedMaterials: 'Св-08Г2С (ГОСТ 2246-70), УОНИ-13/55 (ГОСТ 9466-75)',
      preheatRules: [],
    };

    welderProfile = {
      id: 'w-uat-01',
      stamp: 'СВ-UAT-01',
      fullName: 'Ковалев Михаил Сергеевич',
      certNumber: 'АЦСТ-87-04921',
      certExpiryDate: '2027-12-31',
      allowedMethods: ['РАД', 'РД'],
      crewForeman: 'Мастер СМР Громов И.А.',
      steelGroups: ['М01 (ст.20, 09Г2С)'],
      minDiameterMm: 57,
      maxDiameterMm: 325,
      minWallThicknessMm: 4.0,
      maxWallThicknessMm: 20.0,
    };

    expect(techCard.number).toBe('ТК-UAT-РАД/РД');
    expect(welderProfile.stamp).toBe('СВ-UAT-01');
  });

  // =========================================================================
  // ЭТАП 3: РОЛЬ «МАСТЕР СМР / ПТО» — СБОРКА И СВАРКА СТЫКОВ
  // =========================================================================
  test('Этап 3: Мастер СМР регистрирует сварку 2 стыков с защитой от фальсификации НК', () => {
    const ptoPerms = getUserRolePermissions(ptoUser);
    expect(ptoPerms.canCreateOrDeleteJoints).toBe(true);
    expect(ptoPerms.canEditPrepAndWeldingFields).toBe(true);
    expect(ptoPerms.canEditNdtFields).toBe(false);

    const lrvItemPipe: LRVItem = {
      id: 'lrv-pipe-01',
      objectName: facility.name,
      rdCode,
      lrvCode: 'ТРУБА-219-12',
      shortName: 'Труба 219х12 09Г2С',
      ntd: 'ГОСТ 8732-78',
      material: '09Г2С',
      diameterMm: 219,
      wallThickness: 12,
      specQty: 100,
      unit: 'м',
      manufacturer: 'ЧТПЗ',
    };

    const lrvItemElbow: LRVItem = {
      id: 'lrv-elbow-01',
      objectName: facility.name,
      rdCode,
      lrvCode: 'ОТВОД-90-219-12',
      shortName: 'Отвод 90° 219х12 09Г2С',
      ntd: 'ГОСТ 17375-2001',
      material: '09Г2С',
      diameterMm: 219,
      wallThickness: 12,
      specQty: 10,
      unit: 'шт',
      manufacturer: 'Трубодеталь',
    };

    // 3.1 Создание стыка № 1 (труба + отвод)
    const rawJoint1 = {
      id: 'joint-uat-01',
      objectName: facility.name,
      rdCode,
      contour: 'Контур 1',
      uniqueLineId: lineId,
      lineNumber: createdLine.lineNumber,
      jointNumber: '010',
      jointType: 'Монтажный',
      diameterMm: 219,
      diameterInch: '8"',
      wallThickness: 12,
      weldingDate: '2026-11-14',
      welderStamp: welderProfile.stamp,
      welderFullName: welderProfile.fullName,
      welderCertNumber: welderProfile.certNumber,
      techCardNumber: techCard.number,
      preheatTemp: '150',
      ambientTemp: '-18',
      weatherSource: 'СП 131.13330 (Харасавэй)',
      weldingMaterials: techCard.recommendedMaterials,
      lrv1Code: lrvItemPipe.lrvCode,
      elem1Name: lrvItemPipe.shortName,
      elem1Material: lrvItemPipe.material,
      elem1Ntd: lrvItemPipe.ntd,
      elem1Manufacturer: lrvItemPipe.manufacturer,
      lrv2Code: lrvItemElbow.lrvCode,
      elem2Name: lrvItemElbow.shortName,
      elem2Material: lrvItemElbow.material,
      elem2Ntd: lrvItemElbow.ntd,
      elem2Manufacturer: lrvItemElbow.manufacturer,
      // Попытка ПТО сразу установить статус «Годен» по ВИК и РК
      vikResult: 'Годен',
      ndtResult: 'Годен',
      ndtReportNumber: 'ФЕЙК-АКТ-001',
    } as WeldJoint;

    // Применяем RBAC валидацию: ПТО не имеет права визировать НК
    joint1 = enforceFieldLevelRbacOnJointSave(null, rawJoint1, ptoUser);
    expect(joint1.vikResult).toBe('Не проводился');
    expect(joint1.ndtResult).toBe('Не проводился');
    expect(joint1.ndtReportNumber).toBe('');
    expect(isJointWelded(joint1)).toBe(true);

    // 3.2 Создание стыка № 2 (труба + труба)
    const rawJoint2 = {
      ...rawJoint1,
      id: 'joint-uat-02',
      jointNumber: '020',
      lrv2Code: lrvItemPipe.lrvCode,
      elem2Name: lrvItemPipe.shortName,
      elem2Material: lrvItemPipe.material,
      elem2Ntd: lrvItemPipe.ntd,
      elem2Manufacturer: lrvItemPipe.manufacturer,
      vikResult: 'Не проводился',
      ndtResult: 'Не проводился',
    } as WeldJoint;
    joint2 = enforceFieldLevelRbacOnJointSave(null, rawJoint2, ptoUser);

    // Проверяем эквивалентный диаметр (EDI) в дюймах: для Dn219 с толщиной 12 мм EDI = 10.8 дюймов
    const edi = getJointEquivDiaInch(joint1);
    expect(edi).toBe(10.8);

    // 3.3 Проверка готовности стыков и квот сварщика до проведения НК
    expect(isJointFullyAccepted(joint1)).toBe(false);
    expect(isJointFullyAccepted(joint2)).toBe(false);

    const quotasBeforeNdt = calculateWelderNdtQuotas([joint1, joint2], [createdLine]);
    expect(quotasBeforeNdt.length).toBe(1);
    expect(quotasBeforeNdt[0].stamp).toBe(welderProfile.stamp);
    expect(quotasBeforeNdt[0].totalWelded).toBe(2);
    expect(quotasBeforeNdt[0].inspectedCount).toBe(0);
    expect(quotasBeforeNdt[0].isCompliant).toBe(false);
  });

  // =========================================================================
  // ЭТАП 4: РОЛЬ «СПЕЦИАЛИСТ ЛНК» — КОНТРОЛЬ ВИК, РК И ОТРАБОТКА РЕМОНТА
  // =========================================================================
  test('Этап 4: Специалист ЛНК оформляет заявку, проводит ВИК/РК и фиксирует брак с ремонтом', () => {
    const ndtPerms = getUserRolePermissions(ndtUser);
    expect(ndtPerms.canEditNdtFields).toBe(true);
    expect(ndtPerms.canEditPrepAndWeldingFields).toBe(false);

    // 4.1 Формирование заявки ЛНК
    labRequest = {
      id: 'req-uat-01',
      requestNumber: 'ЗЛНК-2026/11-049',
      createdAt: '2026-11-15 10:00',
      createdDate: '2026-11-15',
      createdBy: ptoUser.fullName || '',
      objectName: facility.name,
      rdCode,
      lineNumber: createdLine.lineNumber,
      uniqueLineId: lineId,
      contour: 'Контур 1',
      controlStage: 'Первичный ВИК и НК',
      requestedMethod: 'РК',
      status: 'В работе ЛНК',
      acceptedBy: ndtUser.fullName || '',
      jointIds: [joint1.id, joint2.id],
    };
    expect(labRequest.jointIds.length).toBe(2);

    // 4.2 Контроль стыка № 1 (Полностью годен)
    const joint1NdtPatch: Partial<WeldJoint> = {
      vikResult: 'Годен',
      vikDate: '2026-11-15',
      vikInspector: 'Лебедев К.М.',
      vikReportNumber: 'ВИК-UAT-101',
      ndtType: 'РК',
      ndtResult: 'Годен',
      ndtDate: '2026-11-15',
      ndtInspector: 'Лебедев К.М.',
      ndtReportNumber: 'РК-UAT-201',
    };
    joint1 = { ...joint1, ...joint1NdtPatch };
    expect(joint1.vikResult).toBe('Годен');
    expect(joint1.ndtResult).toBe('Годен');

    // 4.3 Контроль стыка № 2 (Обнаружен дефект: непровар -> Ремонт)
    const joint2DefectPatch: Partial<WeldJoint> = {
      vikResult: 'Годен',
      vikDate: '2026-11-15',
      vikInspector: 'Лебедев К.М.',
      vikReportNumber: 'ВИК-UAT-102',
      ndtType: 'РК',
      ndtResult: 'Ремонт',
      ndtDate: '2026-11-15',
      ndtInspector: 'Лебедев К.М.',
      ndtReportNumber: 'РК-UAT-202',
    };
    joint2 = { ...joint2, ...joint2DefectPatch };
    expect(joint2.ndtResult).toBe('Ремонт');

    // 4.4 Проведение ремонта и повторный контроль (СТО Газпром графы 32–48)
    const joint2RepairPatch: Partial<WeldJoint> = {
      // Сведения о проведении ремонта (графы 32–37)
      repairAction: 'Вышлифовка непровара корня шва, повторная заварка',
      repairDate: '2026-11-16',
      repairTechCard: techCard.number,
      repairWelderStamp: welderProfile.stamp,
      repairForeman: 'Мастер СМР Громов И.А.',
      // Контроль после ремонта (графы 38–48)
      repairVikNumber: 'РЕМ-ВИК-102',
      repairVikDate: '2026-11-16',
      repairVikResult: 'Годен',
      repairVikInspector: 'Лебедев К.М.',
      repairNdtType: 'РК',
      repairNdtNumber: 'РЕМ-РК-202',
      repairNdtDate: '2026-11-16',
      repairNdtResult: 'Годен',
      repairNdtInspector: 'Лебедев К.М.',
    };
    joint2 = { ...joint2, ...joint2RepairPatch };

    expect(joint2.repairNdtResult).toBe('Годен');
    expect(joint2.repairWelderStamp).toBe('СВ-UAT-01');
  });

  // =========================================================================
  // ЭТАП 5: РОЛЬ «ИНЖЕНЕР ПТО» — ВЕРИФИКАЦИЯ НОРМАТИВНОГО ЖУРНАЛА СТО ГАЗПРОМ
  // =========================================================================
  test('Этап 5: Формирование и аудит нормативного журнала СТО Газпром 15-1.1-002-2023 (49 граф)', () => {
    expect(STO_GAZPROM_15_1_1_002_2023_COLUMNS.length).toBe(49);

    const mockLrvCatalog: LRVItem[] = [
      {
        id: 'lrv-1',
        objectName: facility.name,
        rdCode,
        lrvCode: 'ТРУБА-219-12',
        shortName: 'Труба 219х12 09Г2С',
        ntd: 'ГОСТ 8732-78',
        material: '09Г2С',
        diameterMm: 219,
        wallThickness: 12,
        specQty: 100,
        unit: 'м',
        manufacturer: 'ЧТПЗ',
      },
      {
        id: 'lrv-2',
        objectName: facility.name,
        rdCode,
        lrvCode: 'ОТВОД-90-219-12',
        shortName: 'Отвод 90° 219х12 09Г2С',
        ntd: 'ГОСТ 17375-2001',
        material: '09Г2С',
        diameterMm: 219,
        wallThickness: 12,
        specQty: 10,
        unit: 'шт',
        manufacturer: 'Трубодеталь',
      },
    ];

    // Формируем 49 граф для стыка № 1 (без ремонта)
    const rowJoint1 = formatStoGazpromJournalRow(joint1, 0, mockLrvCatalog);
    expect(rowJoint1.cells.length).toBe(49);
    expect(rowJoint1.col1).toBe('1');
    expect(rowJoint1.col3).toBe('-18'); // Температура окружающего воздуха
    expect(rowJoint1.col4).toContain('219'); // Диаметр
    expect(rowJoint1.col5).toContain('12');  // Толщина стенки
    expect(rowJoint1.col7).toBe('+150');     // Подогрев
    expect(rowJoint1.col18).toBe(welderProfile.stamp); // Клеймо сварщика (графа 18)
    expect(rowJoint1.col23).toBe('Годен');   // ВИК первичный (графа 23)
    expect(rowJoint1.col24).toBe('РК');      // Метод НК (графа 24)
    expect(rowJoint1.col27).toBe('Годен');   // РК первичный (графа 27)
    expect(rowJoint1.col32).toBe('н/п');     // Ремонт не проводился

    // Формируем 49 граф для стыка № 2 (с зафиксированным браком и ремонтом)
    const rowJoint2 = formatStoGazpromJournalRow(joint2, 1, mockLrvCatalog);
    expect(rowJoint2.cells.length).toBe(49);
    expect(rowJoint2.col1).toBe('2');
    expect(rowJoint2.col27).toBe('Ремонт'); // Первичный РК зафиксировал брак (графа 27)
    expect(rowJoint2.col32).toContain('Вышлифовка непровара'); // Графа 32: Описание ремонта
    expect(rowJoint2.col35).toBe(welderProfile.stamp); // Графа 35: Клеймо сварщика ремонта
    expect(rowJoint2.col38).toContain('РЕМ-ВИК-102');  // Графа 38: Заключение ВИК ремонта
    expect(rowJoint2.col40).toBe('Годен');            // Графа 40: Результат ВИК ремонта
    expect(rowJoint2.col42).toContain('РЕМ-РК-202');   // Графа 42: Заключение РК ремонта
    expect(rowJoint2.col44).toBe('Годен');            // Графа 44: Результат РК ремонта

    // Проверяем полную готовность стыков после выполнения ремонта и повторного контроля
    expect(isJointFullyAccepted(joint1)).toBe(true);
    expect(isJointFullyAccepted(joint2)).toBe(true);

    // Проверяем персональные квоты сварщика НАКС по п. 5.7 СТО Газпром 15-1.3-004-2023:
    // При первичном браке назначается штрафное удвоение объёма контроля (+2 стыка на каждый брак)
    const finalQuotas = calculateWelderNdtQuotas([joint1, joint2], [createdLine]);
    expect(finalQuotas.length).toBe(1);
    expect(finalQuotas[0].stamp).toBe(welderProfile.stamp);
    expect(finalQuotas[0].totalWelded).toBe(2);
    expect(finalQuotas[0].inspectedCount).toBe(2); // Проконтролировано 100% стыков
    expect(finalQuotas[0].passedCount).toBe(1);    // 1 стык сдан с 1-го предъявления без замечаний
    expect(finalQuotas[0].defectCount).toBe(1);    // 1 стык имел первичный брак с последующим исправлением
    expect(finalQuotas[0].actualNdtPct).toBe(100);
    expect(finalQuotas[0].penaltyRequiredJoints).toBe(2); // +2 стыка штрафного контроля по п. 5.7 СТО Газпром
    expect(finalQuotas[0].status).toBe('penalty_required');
    expect(finalQuotas[0].details).toContain('назначен штрафной контроль удвоенного количества (+2 стык(ов))');
  });
});
