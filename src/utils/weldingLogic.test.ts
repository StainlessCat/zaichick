import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_COLUMNS,
  applyBulkUpdateToJoints,
  applyBulkUpdateToLineList,
  buildUniqueLineId,
  calculateEquivalentDiaInch,
  calculateReadinessReport,
  checkNaksCertStatus,
  computeLineListItemStatus,
  deriveFacilitiesFromLineList,
  detectLrvConnectionType,
  detectLrvElementType,
  DN_TO_INCH_MAP,
  dnToInchDiameter,
  dnToOuterDiameterMm,
  estimateAmbientTempByCoordsAndDate,
  extractRdSuffix,
  extractSurnameOnly,
  filterLrvByDiameter,
  filterLrvCatalogByRd,
  findWelderByStamp,
  formatDateDDMMYY,
  findMatchingTechCard,
  classifyJointElements,
  getWelderCertForMethod,
  getMissingPassportFields,
  isPassportIncomplete,
  formatFlangedZraName,
  formatGost32569JournalRow,
  formatJournalElementName,
  formatStoGazpromJournalRow,
  formatTimestampDDMMYY,
  getAvailableSizesFromLrv,
  getEpcWallThicknessFactor,
  getFacilityWeatherStationName,
  getJointEquivDiaInch,
  getJointNominalInch,
  getLrvItemDn1,
  getLrvItemDn2,
  GOST_16037_JOINT_TYPES,
  GOST_32569_2013_JOURNAL_COLUMNS,
  inchStringToNumeric,
  isAngularWeldJoint,
  isFlangedZraElement,
  isWeldingDateInRange,
  MAX_HISTORY_STEPS,
  mmToInchDiameter,
  mmToNominalBoreDn,
  mmToNumericInchDiameter,
  NAKS_WELDING_POSITIONS,
  normalizeStampString,
  parseLrvCatalogRecords,
  parseProjectLineListRecords,
  performRedoStep,
  performUndoStep,
  PIPE_DN_SPEC_TABLE,
  pushHistorySnapshot,
  resolveLrvConnectionType,
  resolveLrvItemCategory,
  resolveWeldersSelection,
  searchLrvCatalogItems,
  searchWeldersByStampOrName,
  sortJointsChronologically,
  STO_GAZPROM_15_1_1_002_2023_COLUMNS,
  suggestNextJointNumber,
  validateElementsDiameterMatch,
  validatePreheatTemperature,
  validateWeldingTypeWithTechCard,
  isJointCurrentlyInRepair,
  isJointDefective,
  isJointFullyAccepted,
  isJointRepaired,
  isLrvItemUsedInJoints,
  getJointsUsingLrvItem,
  isSecondRepairForbidden,
  FIELD_LABELS_MAP,
} from './weldingLogic';
import {
  sanitizeWeldJointRecord,
  validateWeldJointComprehensive,
} from './dataIntegrityGuard';
import {
  AuditLogEntry,
  LRVItem,
  ProjectLineItem,
  TechCardItem,
  UserAccount,
  WelderProfile,
  WeldingMaterialCertificate,
  WeldJoint,
} from '../types/welding';
import {
  canUserEditJointField,
  detectRbacRoleCategory,
  enforceFieldLevelRbacOnJointSave,
  filterBulkPatchByRole,
  getUserRolePermissions,
} from './rbac';
import {
  createAuthenticatedSession,
  generateSessionToken,
  hashPasswordWithSalt,
  isSessionActive,
  verifyPassword,
} from './authSecurity';
import {
  applyOptimisticJointSave,
  computeJointOptimisticConflict,
  verifyOptimisticVersion,
} from './optimisticLocking';
import {
  INITIAL_JOINTS,
  INITIAL_LRV_CATALOG,
  INITIAL_WELDING_MATERIALS,
} from '../data/seedData';
import { parseAndValidateJointsImport } from './jointImportUtils';
import type { FullSystemBackupPayload } from '../components/BackupAndResetModal';

test('formatDateDDMMYY, formatTimestampDDMMYY, and isWeldingDateInRange work accurately', () => {
  assert.equal(formatDateDDMMYY('2026-10-12'), '12.10.26');
  assert.equal(formatDateDDMMYY('15.04.2026'), '15.04.26');
  assert.equal(formatDateDDMMYY('18.10.26'), '18.10.26');
  assert.equal(formatTimestampDDMMYY('2026-10-21T09:15:12Z'), '21.10.26 09:15');

  // Без границ диапазона проходят даже пустые даты сварки
  assert.equal(isWeldingDateInRange('', '', ''), true);
  assert.equal(isWeldingDateInRange('2026-10-15', '', ''), true);

  // С активным диапазоном пустая дата сварки отсекается
  assert.equal(isWeldingDateInRange('', '2026-10-10', '2026-10-20'), false);
  assert.equal(isWeldingDateInRange('2026-10-15', '2026-10-10', '2026-10-20'), true);
  assert.equal(isWeldingDateInRange('15.10.26', '2026-10-10', '2026-10-20'), true);
  assert.equal(isWeldingDateInRange('2026-10-09', '2026-10-10', '2026-10-20'), false);
  assert.equal(isWeldingDateInRange('2026-10-21', '2026-10-10', '2026-10-20'), false);
});

test('extractRdSuffix and buildUniqueLineId follow exact specification after last dot', () => {
  const rd = '0092.049.Р.13/1 0004 УКПГ.045.0077.001-ТХ3';
  assert.equal(extractRdSuffix(rd), '001-ТХ3');
  assert.equal(buildUniqueLineId(rd, 'ФП1.2/1'), '001-ТХ3-ФП1.2/1');

  const rdLatin = '0092.049.Р.13/1 0004 УКПГ.045.0077.001-TX3';
  assert.equal(buildUniqueLineId(rdLatin, 'ФП1.2/1'), '001-TX3-ФП1.2/1');
});

test('suggestNextJointNumber generates main joints by 10s (010, 020) and supplementary joints (011, 012)', () => {
  assert.equal(suggestNextJointNumber([]), '010');
  assert.equal(suggestNextJointNumber(['010', '020', '030']), '040');
  assert.equal(suggestNextJointNumber(['010', '020'], '010'), '011');
  assert.equal(suggestNextJointNumber(['010', '011', '020'], '010'), '012');
});

test('filterLrvCatalogByRd strictly isolates LRV items by RD code unless overridden', () => {
  const sampleCatalog: LRVItem[] = [
    {
      id: '1',
      lrvCode: 'ЛРВ-TX3-0041',
      rdCode: '0092.049.Р.13/1 0004 УКПГ.045.0077.001-TX3',
      objectName: 'УКПГ-2В',
      shortName: 'Отвод 90°',
      material: '09Г2С',
      ntd: 'ГОСТ 17375-2001',
      diameterMm: 159,
      wallThickness: 8,
      specQty: 31,
      unit: 'шт',
    },
    {
      id: '2',
      lrvCode: 'ЛРВ-TX1-0098',
      rdCode: '0092.049.Р.13/1 0004 УКПГ.045.0077.002-TX1',
      objectName: 'УКПГ-2В',
      shortName: 'Отвод 90°',
      material: '09Г2С',
      ntd: 'ГОСТ 17375-2001',
      diameterMm: 159,
      wallThickness: 8,
      specQty: 18,
      unit: 'шт',
    },
  ];

  const strictFiltered = filterLrvCatalogByRd(
    sampleCatalog,
    '0092.049.Р.13/1 0004 УКПГ.045.0077.001-TX3',
    false
  );
  assert.equal(strictFiltered.length, 1);
  assert.equal(strictFiltered[0].lrvCode, 'ЛРВ-TX3-0041');

  const unlocked = filterLrvCatalogByRd(
    sampleCatalog,
    '0092.049.Р.13/1 0004 УКПГ.045.0077.001-TX3',
    true
  );
  assert.equal(unlocked.length, 2);
});

test('sortJointsChronologically orders joints strictly by weldingDate ascending', () => {
  const baseJoint = {
    id: 'j1',
    objectName: 'УКПГ-2В',
    rdCode: '0092.049.Р.13/1 0004 УКПГ.045.0077.001-TX3',
    contour: 'КВД-1',
    lineNumber: 'ФП1.2/1',
    uniqueLineId: '001-TX3-ФП1.2/1',
    jointNumber: '020',
    jointType: 'Монтажный',
    diameterMm: 159,
    diameterInch: '6"',
    wallThickness: 8,
    lrv1Code: 'ЛРВ-1',
    elem1Name: 'Труба',
    elem1Material: '09Г2С',
    elem1Ntd: 'ГОСТ 8732-78',
    lrv2Code: 'ЛРВ-2',
    elem2Name: 'Отвод 90°',
    elem2Material: '09Г2С',
    elem2Ntd: 'ГОСТ 17375-2001',
    weldingType: 'РАД+РД',
    weldingDate: '2026-10-18',
    welderStamp: 'А142',
    weldingMaterials: 'Св-08Г2С',
    ambientTemp: '-6',
    responsiblePerson: 'Иванов И.И.',
    welderFullName: 'Петров П.П.',
    welderCertNumber: 'НАКС-01',
    techCardNumber: 'ТК-01',
    vikResult: 'Годен',
    vikDate: '2026-10-18',
    vikInspector: 'Сидоров С.С.',
    ndtType: 'РК',
    ndtDate: '2026-10-19',
    ndtResult: 'Годен',
    ndtInspector: 'Сидоров С.С.',
    dupNdtType: 'Не требуется',
    dupNdtDate: '',
    dupNdtResult: 'Не проводился',
    dupNdtInspector: '',
    updatedAt: '2026-10-19',
    updatedBy: 'Инженер ПТО',
  } satisfies WeldJoint;

  const joints: WeldJoint[] = [
    { ...baseJoint, id: '1', jointNumber: '030', weldingDate: '2026-10-25' },
    { ...baseJoint, id: '2', jointNumber: '010', weldingDate: '2026-10-12' },
    { ...baseJoint, id: '3', jointNumber: '020', weldingDate: '2026-10-19' },
  ];

  const sorted = sortJointsChronologically(joints);
  assert.deepEqual(
    sorted.map((j) => j.weldingDate),
    ['2026-10-12', '2026-10-19', '2026-10-25']
  );
});

test('applyBulkUpdateToJoints updates selected joints, ignores jointNumber, and creates audit entries', () => {
  const j1: WeldJoint = {
    id: 'j1',
    objectName: 'УКПГ-2В',
    rdCode: '0092.049.Р.13/1 0004 УКПГ.045.0077.001-TX3',
    contour: 'КВД-1',
    lineNumber: 'ФП1.2/1',
    uniqueLineId: '001-TX3-ФП1.2/1',
    jointNumber: '010',
    jointType: 'Монтажный',
    diameterMm: 159,
    diameterInch: '6"',
    wallThickness: 8,
    lrv1Code: 'ЛРВ-1',
    elem1Name: 'Труба',
    elem1Material: '09Г2С',
    elem1Ntd: 'ГОСТ 8732-78',
    lrv2Code: 'ЛРВ-2',
    elem2Name: 'Отвод 90°',
    elem2Material: '09Г2С',
    elem2Ntd: 'ГОСТ 17375-2001',
    weldingType: 'РАД',
    weldingDate: '2026-10-15',
    welderStamp: 'А142',
    weldingMaterials: 'Св-08Г2С',
    ambientTemp: '-4',
    responsiblePerson: 'Иванов И.И.',
    welderFullName: 'Петров П.П.',
    welderCertNumber: 'НАКС-01',
    techCardNumber: 'ТК-01',
    vikResult: 'Годен',
    vikDate: '2026-10-15',
    vikInspector: 'Сидоров С.С.',
    ndtType: 'РК',
    ndtDate: '2026-10-16',
    ndtResult: 'Годен',
    ndtInspector: 'Сидоров С.С.',
    dupNdtType: 'Не требуется',
    dupNdtDate: '',
    dupNdtResult: 'Не проводился',
    dupNdtInspector: '',
    updatedAt: '2026-10-16',
    updatedBy: 'Инженер ПТО',
  };
  const j2: WeldJoint = { ...j1, id: 'j2', jointNumber: '020' };

  const { updatedJoints, auditEntries } = applyBulkUpdateToJoints(
    [j1, j2],
    ['j1', 'j2'],
    {
      jointNumber: '999', // must be ignored!
      diameterMm: 219,
      diameterInch: mmToInchDiameter(219),
      welderStamp: 'К089',
    },
    { login: 'pto_lead', fullName: 'Соколов А.В.', role: 'Ведущий инженер ПТО' },
    FIELD_LABELS_MAP
  );

  assert.equal(updatedJoints[0].jointNumber, '010');
  assert.equal(updatedJoints[1].jointNumber, '020');
  assert.equal(updatedJoints[0].diameterMm, 219);
  assert.equal(updatedJoints[1].welderStamp, 'К089');
  assert.equal(auditEntries.length, 6); // 3 changed fields * 2 joints
});

test('calculateReadinessReport computes completion percentages and estimateAmbientTempByCoordsAndDate works', () => {
  const temp = estimateAmbientTempByCoordsAndDate(70.37, 68.43, '2026-10-20');
  assert.equal(typeof temp, 'number');

  const rows = calculateReadinessReport([], 'objectName');
  assert.equal(rows.length, 0);
});

test('computeLineListItemStatus, parseProjectLineListRecords, deriveFacilitiesFromLineList, and applyBulkUpdateToLineList work for Project Line List', () => {
  const parsed = parseProjectLineListRecords(
    [
      {
        'Название объекта': 'УКПГ-2В Бованенковское НГКМ',
        'Шифр РД': '0092.049.Р.13/1 0004 УКПГ.045.0077.001-TX3',
        'Номер линии': 'МТ-09/1',
        'Наименование линии': 'Линия подачи ингибитора метанола',
        Продукт: 'Метанол',
        'Контур испытания': 'Контур подачи метанола КМ-1',
        'НТД на сварку': 'СТО Газпром 15-1.1-002-2023',
        'НТД на контроль': 'СТО Газпром 15-1.3-004-2023',
        'Уровень качества': 'Уровень А',
        'Категория трубопровода': 'I (В)',
        'Рабочее давление': '16.0 МПа',
        Температура: '-40...+50 °C',
        'Процент контроля РК': '100%',
        'Процент контроля УЗК': '100%',
        'Процент контроля ПВК': '100%',
        Статус: '',
        'Дата испытания': '26.10.26',
      },
    ],
    'УКПГ-2В Бованенковское НГКМ',
    '0092.049.Р.13/1 0004 УКПГ.045.0077.001-TX3'
  );

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].uniqueLineId, '001-TX3-МТ-09/1');
  assert.equal(parsed[0].qualityLevel, 'Уровень А');
  assert.equal(parsed[0].rkPercent, 100);
  assert.equal(parsed[0].pvkPercent, 100);
  assert.equal(parsed[0].testDate, '2026-10-26');

  const derived = deriveFacilitiesFromLineList(parsed);
  assert.equal(derived.length, 1);
  assert.equal(derived[0].name, 'УКПГ-2В Бованенковское НГКМ');
  assert.equal(derived[0].rdCodes.length, 1);
  assert.equal(derived[0].rdCodes[0].code, '0092.049.Р.13/1 0004 УКПГ.045.0077.001-TX3');
  assert.deepEqual(derived[0].rdCodes[0].contours, ['Контур подачи метанола КМ-1']);

  const bulkUpdated = applyBulkUpdateToLineList(parsed, [parsed[0].id], {
    qualityLevel: 'Уровень В',
    workingPressure: '14.5 МПа',
    lineNumber: 'ИГНОР', // should be ignored by bulk update
  });
  assert.equal(bulkUpdated[0].qualityLevel, 'Уровень В');
  assert.equal(bulkUpdated[0].workingPressure, '14.5 МПа');
  assert.equal(bulkUpdated[0].lineNumber, 'МТ-09/1');

  const sampleJoint: WeldJoint = {
    id: 'j-mt-1',
    objectName: 'УКПГ-2В Бованенковское НГКМ',
    rdCode: '0092.049.Р.13/1 0004 УКПГ.045.0077.001-TX3',
    contour: 'Контур подачи метанола КМ-1',
    lineNumber: 'МТ-09/1',
    uniqueLineId: '001-TX3-МТ-09/1',
    jointNumber: '010',
    jointType: 'Цеховой',
    diameterMm: 57,
    diameterInch: '2"',
    wallThickness: 5,
    lrv1Code: 'ЛРВ-1',
    elem1Name: 'Труба',
    elem1Material: '12Х18Н10Т',
    elem1Ntd: 'ГОСТ 9941-81',
    lrv2Code: 'ЛРВ-2',
    elem2Name: 'Отвод',
    elem2Material: '12Х18Н10Т',
    elem2Ntd: 'ГОСТ 17375-2001',
    weldingType: 'РАД',
    weldingDate: '2026-10-10',
    welderStamp: 'Т304',
    weldingMaterials: 'Св-04Х19Н11М3',
    ambientTemp: '+16',
    responsiblePerson: 'Тимофеев В.П.',
    welderFullName: 'Захаров М.О.',
    welderCertNumber: 'НАКС-2',
    techCardNumber: 'ТК-2',
    vikResult: 'Годен',
    vikDate: '2026-10-10',
    vikInspector: 'Воронов А.С.',
    ndtType: 'РК',
    ndtDate: '2026-10-11',
    ndtResult: 'Годен',
    ndtInspector: 'Воронов А.С.',
    dupNdtType: 'ПВК',
    dupNdtDate: '2026-10-11',
    dupNdtResult: 'Годен',
    dupNdtInspector: 'Кузнецова Е.В.',
    updatedAt: '2026-10-11',
    updatedBy: 'Инженер ПТО',
  };

  const statusReady = computeLineListItemStatus(parsed[0], [sampleJoint]);
  assert.equal(statusReady.isCompleted, true);
  assert.equal(statusReady.weldedJoints, 1);
  assert.equal(statusReady.controlledJoints, 1);

  const inWorkJoint: WeldJoint = { ...sampleJoint, id: 'j-mt-2', jointNumber: '020', weldingDate: '' };
  const statusInWork = computeLineListItemStatus(parsed[0], [sampleJoint, inWorkJoint]);
  assert.equal(statusInWork.isCompleted, false);
  assert.equal(statusInWork.weldedJoints, 1);
  assert.equal(statusInWork.totalJoints, 2);

  // Проверка допустимости пустых значений для Уровня качества и Категории трубопровода
  const parsedEmptyQualityAndCat = parseProjectLineListRecords(
    [
      {
        'Название объекта': 'УКПГ-2В Бованенковское НГКМ',
        'Шифр РД': '0092.049.Р.13/1 0004 УКПГ.045.0077.001-TX3',
        'Номер линии': 'ДР-99/1',
        'Наименование линии': 'Дренаж безнапорный',
        'Уровень качества': '',
        'Категория трубопровода': '',
      },
    ],
    'УКПГ-2В Бованенковское НГКМ',
    '0092.049.Р.13/1 0004 УКПГ.045.0077.001-TX3'
  );
  assert.equal(parsedEmptyQualityAndCat[0].qualityLevel, '');
  assert.equal(parsedEmptyQualityAndCat[0].pipelineCategory, '');
});

test('resolveWeldersSelection, validatePreheatTemperature, validateElementsDiameterMatch, and filterLrvByDiameter work accurately', () => {
  const sampleWelders: WelderProfile[] = [
    {
      stamp: 'А142',
      fullName: 'Коваленко Д.С.',
      certNumber: 'НАКС-ЗСР-I-104928',
      certIssueDate: '12.03.25',
      certExpiryDate: '12.03.27',
      attestationArea: 'РАД, РД (НГДО п.3, ОХНВП п.16)',
      admissionSheetNumber: 'ДЛ-2026/014',
      admissionSheetDate: '15.01.26',
      allowedMethods: ['РАД', 'РД'],
      crewForeman: 'Тимофеев В.П.',
    },
    {
      stamp: 'К089',
      fullName: 'Сафин Р.М.',
      certNumber: 'НАКС-ЗСР-I-108311',
      certIssueDate: '20.05.25',
      certExpiryDate: '20.05.27',
      attestationArea: 'РАД, РД, МП (НГДО п.3, СК п.1)',
      admissionSheetNumber: 'ДЛ-2026/019',
      admissionSheetDate: '18.01.26',
      allowedMethods: ['РАД', 'РД', 'МП'],
      crewForeman: 'Тимофеев В.П.',
    },
    {
      stamp: 'БР-01',
      fullName: 'Бригада №1 (Коваленко Д.С. / Сафин Р.М.)',
      certNumber: 'НАКС-ЗСР-I-104928 / НАКС-ЗСР-I-108311',
      certIssueDate: '12.03.25',
      certExpiryDate: '12.03.27',
      attestationArea: 'Комбинированная сварка РАД+РД Ø159–1420 мм',
      admissionSheetNumber: 'ДЛ-БР-2026/01',
      admissionSheetDate: '20.01.26',
      allowedMethods: ['РАД+РД'],
      crewForeman: 'Тимофеев В.П.',
      isBrigade: true,
      brigadeMembers: ['А142', 'К089'],
    },
  ];

  // Сварка двумя сварщиками с бригадным клеймом
  const resolved = resolveWeldersSelection(['А142', 'К089'], 'БР-01', sampleWelders);
  assert.equal(resolved.welderStamp, 'БР-01 (А142, К089)');
  assert.equal(resolved.welderFullName, 'Коваленко Д.С., Сафин Р.М.');
  assert.equal(
    resolved.welderCertNumber,
    'НАКС-ЗСР-I-104928, НАКС-ЗСР-I-108311'
  );

  // Контроль температуры подогрева по ТК и температуре воздуха
  const sampleTc: TechCardItem = {
    id: 'tc-1',
    number: 'ТК-159-09Г2С-01',
    title: 'РАД+РД труб 09Г2С',
    weldingType: 'РАД+РД',
    ntd: 'СТО Газпром 15-1.1-002-2023',
    steelGroup: 'М01 (09Г2С)',
    minDiameterMm: 57,
    maxDiameterMm: 325,
    minWallThicknessMm: 4,
    maxWallThicknessMm: 16,
    recommendedMaterials: 'Св-08Г2С + УОНИ-13/55',
    preheatRules: [
      {
        ambientMinC: 5,
        ambientMaxC: 45,
        minPreheatTempC: 0,
        conditionLabel: 'При T возд. ≥ +5 °C',
      },
      {
        ambientMinC: -15,
        ambientMaxC: 4,
        minPreheatTempC: 120,
        conditionLabel: 'При T возд. от -15 до +4 °C',
      },
    ],
  };

  const validPreheat = validatePreheatTemperature('+140', '-6', sampleTc);
  assert.equal(validPreheat.isValid, true);
  assert.equal(validPreheat.requiredMinC, 120);

  const invalidLowPreheat = validatePreheatTemperature('+80', '-6', sampleTc);
  assert.equal(invalidLowPreheat.isValid, false);
  assert.equal(invalidLowPreheat.requiredMinC, 120);

  // Проверка обязательного равенства диаметров Элемента 1 и Элемента 2
  assert.equal(validateElementsDiameterMatch(159, 159).isMatch, true);
  assert.equal(validateElementsDiameterMatch(159, 219).isMatch, false);

  // Фильтрация ЛРВ с учётом второго диаметра переходов и тройников
  const reducerLrv: LRVItem = {
    id: 'lrv-red',
    lrvCode: 'ЛРВ-TX3-0046',
    rdCode: '0092.049.Р.13/1 0004 УКПГ.045.0077.001-TX3',
    objectName: 'УКПГ-2В',
    shortName: 'Переход К 219×10-159×8',
    material: '09Г2С',
    ntd: 'ГОСТ 17378-2001',
    diameterMm: 219,
    wallThickness: 10,
    diameterMm2: 159,
    wallThickness2: 8,
    specQty: 14,
    unit: 'шт',
  };
  assert.equal(filterLrvByDiameter([reducerLrv], 159).length, 1);
  assert.equal(filterLrvByDiameter([reducerLrv], 219).length, 1);
  assert.equal(filterLrvByDiameter([reducerLrv], 325).length, 0);

  // Проверка названия метеопункта объекта
  assert.equal(
    getFacilityWeatherStationName({ name: 'УКПГ-2В Бованенковское НГКМ' }),
    'Метеопункт Бованенково'
  );
  assert.equal(
    getFacilityWeatherStationName({
      name: 'УКПГ-2В Бованенковское НГКМ',
      weatherStation: 'Метеостанция Ямал-Север',
    }),
    'Метеостанция Ямал-Север'
  );

  // Проверка вида сварки по технологической карте
  const wtMatch = validateWeldingTypeWithTechCard('РАД+РД', sampleTc);
  assert.equal(wtMatch.isValid, true);
  const wtMismatch = validateWeldingTypeWithTechCard('МП', sampleTc);
  assert.equal(wtMismatch.isValid, false);
  assert.equal(wtMismatch.expectedType, 'РАД+РД');

  // Проверка определения типа элемента и многокритериального поиска в базе ЛРВ
  const valveLrv: LRVItem = {
    id: 'lrv-valve',
    lrvCode: 'ЛРВ-001ТХ3-0501',
    rdCode: '0092.049.Р.13/1 0004 УКПГ.045.0077.001-TX3',
    objectName: 'УКПГ-2В',
    shortName: 'Кран шаровый DN150 159х8',
    material: '09Г2С',
    ntd: 'ГОСТ 21345-2005',
    diameterMm: 159,
    wallThickness: 8,
    specQty: 6,
    unit: 'шт',
  };
  const pipeLrv: LRVItem = {
    id: 'lrv-pipe',
    lrvCode: 'ЛРВ-001ТХ3-0415',
    rdCode: '0092.049.Р.13/1 0004 УКПГ.045.0077.001-TX3',
    objectName: 'УКПГ-2В',
    shortName: 'Труба БШ 159х8',
    material: '09Г2С',
    ntd: 'ГОСТ 8732-78',
    diameterMm: 159,
    wallThickness: 8,
    specQty: 148,
    unit: 'м',
  };
  const catalogList = [reducerLrv, valveLrv, pipeLrv];

  assert.equal(detectLrvElementType(valveLrv.shortName), 'ЗРА');
  assert.equal(detectLrvElementType(reducerLrv.shortName), 'Переход');
  assert.equal(detectLrvElementType(pipeLrv.shortName), 'Труба');

  // Поиск по типу элемента "ЗРА" и поддержка алиаса "Кран"
  assert.equal(searchLrvCatalogItems(catalogList, '', 'ЗРА').length, 1);
  assert.equal(searchLrvCatalogItems(catalogList, '', 'Кран').length, 1);
  // Поиск по НТД "21345"
  assert.equal(searchLrvCatalogItems(catalogList, '21345', 'Все типы').length, 1);
  // Поиск по диаметру "219"
  assert.equal(searchLrvCatalogItems(catalogList, '219', 'Все типы').length, 1);
  // Поиск по краткому наименованию и диаметру "труба 159"
  assert.equal(searchLrvCatalogItems(catalogList, 'труба 159', 'Все типы').length, 1);

  // Проверка живого поиска сварщиков и бригад по номеру клейма (включая латиницу/кириллицу и регистр)
  assert.equal(normalizeStampString('a142'), 'А142');
  assert.equal(normalizeStampString('k089'), 'К089');
  assert.equal(findWelderByStamp(sampleWelders, 'a142', false)?.stamp, 'А142');
  assert.equal(findWelderByStamp(sampleWelders, 'бр-01', true)?.stamp, 'БР-01');

  const searchByDigits = searchWeldersByStampOrName(sampleWelders, '089');
  assert.equal(searchByDigits.length, 2); // К089 и БР-01 (в составе которой К089)
  assert.equal(searchByDigits[0].stamp, 'К089');

  const searchWithExclude = searchWeldersByStampOrName(
    sampleWelders.filter((w) => !w.isBrigade),
    '',
    ['А142']
  );
  assert.equal(searchWithExclude.length, 1);
  assert.equal(searchWithExclude[0].stamp, 'К089');
});

test('nominal bore DN1/DN2, ГОСТ 16037-80 joint types, НАКС positions, and 10-step Undo/Redo work accurately', () => {
  assert.equal(mmToNominalBoreDn(159), 150);
  assert.equal(mmToNominalBoreDn(219), 200);
  assert.equal(mmToNominalBoreDn(57), 50);
  assert.equal(mmToNominalBoreDn(undefined), undefined);

  const singleDiamItem: LRVItem = {
    id: 'lrv-single',
    lrvCode: 'ЛРВ-1',
    rdCode: 'РД-1',
    objectName: 'УКПГ',
    shortName: 'Труба 159х8',
    material: '09Г2С',
    ntd: 'ГОСТ 8732-78',
    diameterMm: 159,
    wallThickness: 8,
    specQty: 10,
    unit: 'м',
  };
  assert.equal(getLrvItemDn1(singleDiamItem), 150);
  assert.equal(getLrvItemDn2(singleDiamItem), undefined); // strictly undefined for 1-diameter items

  const dualDiamItem: LRVItem = {
    ...singleDiamItem,
    id: 'lrv-dual',
    shortName: 'Переход 219х10-159х8',
    diameterMm: 219,
    wallThickness: 10,
    diameterMm2: 159,
    wallThickness2: 8,
  };
  assert.equal(getLrvItemDn1(dualDiamItem), 200);
  assert.equal(getLrvItemDn2(dualDiamItem), 150);

  // Проверка наличия столбцов Длина эл. 1/2, Вид сварки, Тип сварного соединения и Положение в ALL_COLUMNS
  assert.equal(
    ALL_COLUMNS.find((c) => c.key === 'elem1Length')?.label,
    'Длина эл. 1, м'
  );
  assert.equal(
    ALL_COLUMNS.find((c) => c.key === 'elem2Length')?.label,
    'Длина эл. 2, м'
  );
  assert.equal(
    ALL_COLUMNS.find((c) => c.key === 'weldingType')?.label,
    'Вид сварки'
  );
  assert.equal(
    ALL_COLUMNS.find((c) => c.key === 'gostJointType')?.label,
    'Тип сварного соединения'
  );
  assert.equal(
    ALL_COLUMNS.find((c) => c.key === 'weldingPosition')?.label,
    'Положение'
  );

  // Проверка справочников ГОСТ 16037-80 и НАКС
  assert.equal(
    GOST_16037_JOINT_TYPES.some((g) => g.code === 'С17'),
    true
  );
  assert.equal(
    NAKS_WELDING_POSITIONS.some((p) => p.code === 'В1'),
    true
  );

  // Проверка стека Undo / Redo на 10 действий
  assert.equal(MAX_HISTORY_STEPS, 10);
  let undoStack: number[] = [];
  for (let i = 1; i <= 15; i++) {
    undoStack = pushHistorySnapshot(undoStack, i, MAX_HISTORY_STEPS).undoStack;
  }
  assert.equal(undoStack.length, 10);
  assert.deepEqual(undoStack, [6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);

  let redoStack: number[] = [];
  let current = 16;
  const undoRes1 = performUndoStep(undoStack, redoStack, current, MAX_HISTORY_STEPS);
  assert.equal(undoRes1.targetState, 15);
  assert.equal(undoRes1.undoStack.length, 9);
  assert.deepEqual(undoRes1.redoStack, [16]);

  const redoRes1 = performRedoStep(
    undoRes1.undoStack,
    undoRes1.redoStack,
    undoRes1.targetState!,
    MAX_HISTORY_STEPS
  );
  assert.equal(redoRes1.targetState, 16);
  assert.equal(redoRes1.undoStack.length, 10);
  assert.equal(redoRes1.redoStack.length, 0);

  // Проверка 17 граф журнала по ГОСТ 32569-2013 на соответствие прикрепленному файлу
  assert.equal(GOST_32569_2013_JOURNAL_COLUMNS.length, 17);
  assert.equal(GOST_32569_2013_JOURNAL_COLUMNS[0].label, '№ п/п');
  assert.equal(
    GOST_32569_2013_JOURNAL_COLUMNS[1].label,
    'Обозначение сварного соединения по исполнительному чертежу, тип сварного соединения ГОСТ 16037'
  );
  assert.equal(
    GOST_32569_2013_JOURNAL_COLUMNS[16].label,
    'Результаты измерения ферритной фазы в металле шва, N заключения, дата'
  );

  const sampleJoint = INITIAL_JOINTS[0];
  const gostRow = formatGost32569JournalRow(
    sampleJoint,
    0,
    INITIAL_WELDING_MATERIALS
  );
  assert.equal(gostRow.cells.length, 17);
  assert.equal(gostRow.col1, '1');
  // Во 2 столбце без номера линии и без справочных подписей ("010, С17")
  assert.equal(gostRow.col2, '010, С17');
  assert.equal(gostRow.col3.includes('Клеймо'), false);
  assert.equal(gostRow.col6.includes('T раб. зоны'), false);
  // В 4 столбце без скобок, у наименования элемента убраны диаметр и толщина стенки, НТД и сертификат через запятую, каждый элемент с новой строки
  assert.equal(gostRow.col4.includes('('), false);
  assert.equal(gostRow.col4.includes(')'), false);
  assert.equal(gostRow.col4.includes('159х8'), false);
  assert.equal(
    gostRow.col4,
    '09Г2С Труба БШ, ГОСТ 8732-78, Пл.40812-Т01\n09Г2С Отвод 90°, ГОСТ 17375-2001, ОТВ-26-089'
  );
  assert.equal(gostRow.col5, `${sampleJoint.diameterMm}х${sampleJoint.wallThickness}`);
  // 2. В 8 столбце каждый сварочный материал с новой строки
  assert.equal(
    gostRow.col8,
    'Св-08Г2С Ø2.0, ГОСТ 2246-70, 10492-26\nУОНИ-13/55 Ø3.0, ГОСТ 9466-75, НАКС-СМ-8841'
  );
  // 5. В 9 столбце без слова "Подогрев" и без номера техкарты
  assert.equal(gostRow.col9, '+130 °С');
  assert.equal(gostRow.col9.toLowerCase().includes('подогрев'), false);
  // 4. Вместо "Не требуется" пишется "н/п"
  assert.equal(gostRow.col11, 'н/п');
  assert.equal(gostRow.col12, 'н/п');
  assert.equal(gostRow.col13, 'н/п');
  assert.equal(gostRow.col14, 'н/п');
  assert.equal(gostRow.col17, 'н/п');
  assert.equal(
    gostRow.cells.some((c) => c.toLowerCase().includes('не требуется')),
    false
  );
});

test('49-column СТО Газпром 15-1.1-002-2023 journal form, element length (col 10), and angular weld "Я" / "н/п" (col 14) work accurately', () => {
  assert.equal(STO_GAZPROM_15_1_1_002_2023_COLUMNS.length, 49);
  assert.equal(STO_GAZPROM_15_1_1_002_2023_COLUMNS[0].label, 'Сквозной порядковый номер');
  assert.equal(STO_GAZPROM_15_1_1_002_2023_COLUMNS[9].label, 'Длина элемента, м');
  assert.equal(
    STO_GAZPROM_15_1_1_002_2023_COLUMNS[13].label,
    'дополнительная маркировка сварного соединения'
  );
  assert.equal(STO_GAZPROM_15_1_1_002_2023_COLUMNS[48].label, 'Примечание');

  // Проверка определения углового сварного шва
  assert.equal(isAngularWeldJoint('У4'), true);
  assert.equal(isAngularWeldJoint('У17'), true);
  assert.equal(isAngularWeldJoint('У19'), true);
  assert.equal(isAngularWeldJoint('С17'), false);
  assert.equal(isAngularWeldJoint('С21'), false);
  assert.equal(isAngularWeldJoint('Т8'), false);
  assert.equal(isAngularWeldJoint('Н1'), false);

  // Стыковой шов (j-101, С17) -> графа 10 = "11.8\n0.35", графа 14 = "н/п"
  const buttJoint = INITIAL_JOINTS[0];
  assert.equal(buttJoint.gostJointType, 'С17');
  const stoButtRow = formatStoGazpromJournalRow(buttJoint, 0, INITIAL_LRV_CATALOG);
  assert.equal(stoButtRow.cells.length, 49);
  assert.equal(stoButtRow.col1, '1');
  assert.equal(stoButtRow.col10, '11.8\n0.35');
  assert.equal(stoButtRow.col14, 'н/п');

  // Угловой шов (j-103, У4) -> графа 10 = "4.2\n0.18", графа 14 = "Я"
  const angularJoint = INITIAL_JOINTS.find((j) => j.id === 'j-103')!;
  assert.equal(angularJoint.gostJointType, 'У4');
  const stoAngularRow = formatStoGazpromJournalRow(angularJoint, 2, INITIAL_LRV_CATALOG);
  assert.equal(stoAngularRow.col10, '4.2\n0.18');
  assert.equal(stoAngularRow.col14, 'Я');
});

test('STO Gazprom rules: extractSurnameOnly, col 6 manufacturer, col 16 no position, cols 19/36 surname only, cols 20/37 blank, cols 31/32 repair logic', () => {
  // 1. extractSurnameOnly
  assert.equal(extractSurnameOnly('Мастер СМР Громов И.А.'), 'Громов');
  assert.equal(extractSurnameOnly('Прораб СМР Тимофеев В.П.'), 'Тимофеев');
  assert.equal(extractSurnameOnly('Громов И.А.'), 'Громов');
  assert.equal(extractSurnameOnly('Иванов И.И.'), 'Иванов');
  assert.equal(extractSurnameOnly('Сидоров'), 'Сидоров');
  assert.equal(extractSurnameOnly(''), 'н/п');
  assert.equal(extractSurnameOnly(undefined), 'н/п');

  const sampleJoint = INITIAL_JOINTS[0]; // j-101, responsiblePerson: 'Мастер СМР Громов И.А.'
  const row = formatStoGazpromJournalRow(sampleJoint, 0, INITIAL_LRV_CATALOG);

  // Столбец 6: ГОСТ, марка стали, завод-изготовитель
  assert.ok(row.col6.includes('ПАО «ЧТПЗ»') || row.col6.includes('АО «СОТ»'));
  assert.ok(row.col6.includes('09Г2С'));

  // Столбец 16: Без положения при сварке (только номер ТК)
  assert.equal(row.col16, sampleJoint.techCardNumber);
  assert.equal(row.col16.includes('В1'), false);
  assert.equal(row.col16.includes(','), false);

  // Столбец 19: Только фамилия ответственного лица
  assert.equal(row.col19, 'Громов');

  // Столбец 20: Пусто
  assert.equal(row.col20, '');

  // Столбец 31: Либо "Годен", либо "Ремонт", либо "н/п". Никаких "в работе".
  assert.ok(['Годен', 'Ремонт', 'н/п'].includes(row.col31));
  assert.equal(row.col31.toLowerCase().includes('в работе'), false);

  // Столбец 36: Только фамилия мастера/прораба при ремонте, либо 'н/п' при отсутствии ремонта
  assert.equal(row.col36, 'н/п');

  // Столбец 37: Пусто
  assert.equal(row.col37, '');

  // Проверка логики брака/ремонта: если первичный контроль "Ремонт" -> дублирующий контроль "н/п", столбец 32 "Ремонт"
  const repairJoint: WeldJoint = {
    ...sampleJoint,
    id: 'j-repair-test',
    jointNumber: '099',
    ndtResult: 'Ремонт',
    dupNdtResult: 'Годен', // дублирующий контроль не должен иметь смысла при браке первичного
    responsiblePerson: 'Прораб СМР Тимофеев В.П.',
  };
  const repairRow = formatStoGazpromJournalRow(repairJoint, 1, INITIAL_LRV_CATALOG);

  // Столбец 28-31: Дублирующий контроль отменяется, так как первичный выявил дефект -> "н/п"
  assert.equal(repairRow.col28, 'н/п');
  assert.equal(repairRow.col29, 'н/п');
  assert.equal(repairRow.col30, 'н/п');
  assert.equal(repairRow.col31, 'н/п');

  // Столбец 32: Не "Назначен ремонт", а просто "Ремонт"
  assert.equal(repairRow.col32, 'Ремонт');

  // Фамилия в столбце 19 и 36
  assert.equal(repairRow.col19, 'Тимофеев');
  assert.equal(repairRow.col36, 'Тимофеев');
});

test('COMPREHENSIVE 10-USER SIMULATION: registration of 10 users, collaborative workflow across roles, adding & deleting all 9 entity types, backup/restore, author zero-reset, and journal printing', () => {
  // =========================================================================
  // ЭТАП 1. Сброс в «Чистый лист» (Author Zero-Reset) и регистрация 10 пользователей
  // =========================================================================
  let userAccounts: UserAccount[] = [];
  let projectLineList: ProjectLineItem[] = [];
  let lrvCatalog: LRVItem[] = [];
  let welders: WelderProfile[] = [];
  let techCards: TechCardItem[] = [];
  let weldingMaterials: WeldingMaterialCertificate[] = [];
  let joints: WeldJoint[] = [];
  let auditLogs: AuditLogEntry[] = [];

  const tenSpecialists: Omit<UserAccount, 'sessionNumber'>[] = [
    {
      login: 'ilchenko.vlad@gmail.com',
      password: '123',
      fullName: 'Ильченко В. (Автор / Главный администратор)',
      role: 'Администратор ИТ / Руководитель проекта',
      department: 'Дирекция проекта',
    },
    {
      login: 'pto_smirnov',
      password: '123',
      fullName: 'Смирнов Алексей Викторович',
      role: 'Ведущий инженер ПТО',
      department: 'ПТО УКПГ-2В',
    },
    {
      login: 'pto_kuznetsova',
      password: '123',
      fullName: 'Кузнецова Елена Сергеевна',
      role: 'Инженер ПТО (комплектация и ЛРВ)',
      department: 'ПТО УКПГ-2В',
    },
    {
      login: 'pto_volkov',
      password: '123',
      fullName: 'Волков Дмитрий Игоревич',
      role: 'Инженер ПТО (исполнительная документация)',
      department: 'ПТО КС Воркутинская',
    },
    {
      login: 'tech_morozov',
      password: '123',
      fullName: 'Морозов Павел Николаевич',
      role: 'Главный сварщик / Инженер-технолог',
      department: 'Служба главного сварщика',
    },
    {
      login: 'tech_sokolov',
      password: '123',
      fullName: 'Соколов Андрей Олегович',
      role: 'Инженер-технолог по сварке (НАКС и СМ)',
      department: 'Служба главного сварщика',
    },
    {
      login: 'lnk_lebedev',
      password: '123',
      fullName: 'Лебедев Сергей Анатольевич',
      role: 'Начальник ЛНК / Дефектоскопист II ур.',
      department: 'Лаборатория НК',
    },
    {
      login: 'lnk_popov',
      password: '123',
      fullName: 'Попов Максим Валерьевич',
      role: 'Дефектоскопист РК/УЗК',
      department: 'Лаборатория НК',
    },
    {
      login: 'lnk_novikova',
      password: '123',
      fullName: 'Новикова Ольга Андреевна',
      role: 'Инженер ВИК и ПВК',
      department: 'Лаборатория НК',
    },
    {
      login: 'temp_intern',
      password: '123',
      fullName: 'Стажёров Стажёр Стажёрович',
      role: 'Стажёр ПТО (временный доступ)',
      department: 'ПТО',
    },
  ];

  tenSpecialists.forEach((spec, idx) => {
    const newAcc: UserAccount = {
      ...spec,
      sessionNumber: idx + 1,
    };
    userAccounts.push(newAcc);
    auditLogs.unshift({
      id: `aud-reg-${idx + 1}`,
      timestamp: new Date().toISOString(),
      userLogin: newAcc.login,
      userFullName: newAcc.fullName,
      userRole: newAcc.role,
      jointId: 'sys-auth',
      uniqueLineId: 'Регистрация пользователя',
      jointNumber: `Сессия #${newAcc.sessionNumber}`,
      rdCode: newAcc.department,
      fieldKey: 'auth_register',
      fieldLabel: 'Регистрация новой учётной записи',
      oldValue: '—',
      newValue: `${newAcc.fullName} (${newAcc.login})`,
      operationType: 'create_joint',
    });
  });

  assert.equal(userAccounts.length, 10, 'Должны быть зарегистрированы все 10 пользователей');

  // Удаление 10-го временного пользователя (проверка функции удаления пользователя)
  userAccounts = userAccounts.filter((u) => u.login !== 'temp_intern');
  assert.equal(userAccounts.length, 9, 'Временный пользователь должен быть успешно удалён');

  // =========================================================================
  // ЭТАП 2. Работа Технологов по сварке (tech_morozov и tech_sokolov):
  // Добавление и удаление сварщиков, бригады, техкарт и сварочных материалов
  // =========================================================================
  welders = [
    {
      id: 'w-sim-1',
      stamp: normalizeStampString('A701'), // латинская A -> кириллическая А
      fullName: 'Ковалёв Руслан Викторович',
      certNumber: 'НАКС-ЯМЛ-2026-0701',
      certIssueDate: '2025-05-10',
      certExpiryDate: '2027-05-10',
      allowedMethods: ['РАД', 'РД', 'РАД+РД'],
      admissionSheetNumber: 'ДЛ-701/26',
      admissionSheetDate: '2026-01-15',
      crewForeman: 'Мастер СМР Громов И.А.',
    },
    {
      id: 'w-sim-2',
      stamp: normalizeStampString('В702'),
      fullName: 'Захаров Артём Игоревич',
      certNumber: 'НАКС-ЯМЛ-2026-0702',
      certIssueDate: '2025-06-01',
      certExpiryDate: '2027-06-01',
      allowedMethods: ['РАД', 'РД', 'РАД+РД'],
      admissionSheetNumber: 'ДЛ-702/26',
      admissionSheetDate: '2026-01-20',
      crewForeman: 'Мастер СМР Громов И.А.',
    },
    {
      id: 'w-sim-brigade',
      stamp: 'БР-70',
      fullName: 'Ковалёв Руслан Викторович, Захаров Артём Игоревич',
      certNumber: 'НАКС-ЯМЛ-2026-0701, НАКС-ЯМЛ-2026-0702',
      certIssueDate: '2025-05-10',
      certExpiryDate: '2027-05-10',
      allowedMethods: ['РАД+РД', 'РД'],
      admissionSheetNumber: 'ДЛ-БР70/26',
      admissionSheetDate: '2026-01-25',
      crewForeman: 'Прораб СМР Тимофеев В.П.',
      isBrigade: true,
      brigadeMembers: ['А701', 'В702'],
    },
    {
      id: 'w-sim-err',
      stamp: 'Х999',
      fullName: 'Ошибочный Сварщик (на удаление)',
      certNumber: 'НАКС-000',
      certIssueDate: '2024-01-01',
      certExpiryDate: '2025-01-01',
      allowedMethods: ['РД'],
      admissionSheetNumber: 'ДЛ-000',
      admissionSheetDate: '2024-01-02',
      crewForeman: 'Мастер СМР Громов И.А.',
    },
  ];
  assert.equal(welders[0].stamp, 'А701', 'Клеймо должно быть нормализовано в кириллицу');

  // Удаление ошибочного сварщика Х999
  welders = welders.filter((w) => w.id !== 'w-sim-err');
  assert.equal(welders.length, 3);

  // Редактирование клейма существующего сварщика по ID (проверка исправления бага дублирования)
  const updatedWelder2: WelderProfile = {
    ...welders[1],
    stamp: 'В702М',
  };
  welders = welders.some((x) => (updatedWelder2.id && x.id === updatedWelder2.id) || x.stamp === updatedWelder2.stamp)
    ? welders.map((x) =>
        (updatedWelder2.id && x.id === updatedWelder2.id) || x.stamp === updatedWelder2.stamp
          ? updatedWelder2
          : x
      )
    : [updatedWelder2, ...welders];
  assert.equal(welders.length, 3, 'Изменение клейма у существующего сварщика должно обновлять карточку, а не создавать дубликат');
  // Возвращаем клеймо В702 для бригады
  welders = welders.map((x) => (x.id === 'w-sim-2' ? { ...x, stamp: 'В702' } : x));

  // Добавление и удаление Техкарт (WPS)
  techCards = [
    {
      id: 'tc-sim-1',
      number: 'ТК-SIM-09Г2С-01',
      title: 'Сварка трубопроводов из стали 09Г2С',
      weldingType: 'РАД+РД',
      steelGroup: '09Г2С',
      minDiameterMm: 57,
      maxDiameterMm: 530,
      minWallThicknessMm: 4,
      maxWallThicknessMm: 20,
      recommendedMaterials: 'Св-08Г2С Ø2.0 / УОНИ-13/55 Ø3.0',
      ntd: 'СТО Газпром 15-1.3-004-2023',
      preheatRules: [
        {
          ambientMinC: 5,
          ambientMaxC: 45,
          minPreheatTempC: 0,
          conditionLabel: 'При T возд. ≥ +5 °C',
        },
        {
          ambientMinC: -40,
          ambientMaxC: 4,
          minPreheatTempC: 120,
          conditionLabel: 'При T возд. от -40 до +4 °C',
        },
      ],
    },
    {
      id: 'tc-sim-del',
      number: 'ТК-УДАЛИТЬ-99',
      title: 'Временная ТК на удаление',
      weldingType: 'РД',
      steelGroup: '20',
      minDiameterMm: 57,
      maxDiameterMm: 108,
      minWallThicknessMm: 4,
      maxWallThicknessMm: 8,
      recommendedMaterials: 'УОНИ-13/55',
      ntd: 'ГОСТ 32569-2013',
      preheatRules: [],
    },
  ];
  techCards = techCards.filter((tc) => tc.id !== 'tc-sim-del');
  assert.equal(techCards.length, 1);

  // Добавление и удаление Сертификатов СМ
  weldingMaterials = [
    {
      id: 'mat-sim-1',
      brandAndDiameter: 'Св-08Г2С Ø2.0',
      materialType: 'Проволока сварочная',
      weldingMethod: 'РАД',
      batchNumber: 'П-2026-901',
      certificateNumber: 'СЕРТ-СВ-901',
      incomingControlAct: 'АВК-901 от 10.09.26',
      incomingControlDate: '2026-09-10',
      status: 'Допущен в производство',
    },
    {
      id: 'mat-sim-2',
      brandAndDiameter: 'УОНИ-13/55 Ø3.0',
      materialType: 'Электроды покрытые',
      weldingMethod: 'РД',
      batchNumber: 'П-2026-902',
      certificateNumber: 'СЕРТ-ЭЛ-902',
      incomingControlAct: 'АВК-902 от 10.09.26',
      incomingControlDate: '2026-09-10',
      status: 'Допущен в производство',
    },
    {
      id: 'mat-sim-del',
      brandAndDiameter: 'МР-3 Ø4.0 (брак)',
      materialType: 'Электроды покрытые',
      weldingMethod: 'РД',
      batchNumber: 'БРАК-01',
      certificateNumber: 'БРАК-01',
      incomingControlAct: 'Не прошёл ВК',
      incomingControlDate: '2026-09-10',
      status: 'На испытании',
    },
  ];
  weldingMaterials = weldingMaterials.filter((m) => m.id !== 'mat-sim-del');
  assert.equal(weldingMaterials.length, 2);

  // =========================================================================
  // ЭТАП 3. Работа Инженеров ПТО (pto_smirnov, pto_kuznetsova, pto_volkov):
  // Создание Объектов, Шифров РД, Линий в лайнлисте, Каталога ЛРВ и каскадное удаление
  // =========================================================================
  const rawLinesToImport: Record<string, unknown>[] = [
    {
      'Название объекта': 'УКПГ-2В Бованенковское НГКМ',
      'Шифр РД': '0092.049.Р.13/1 0004 УКПГ.045.0077.001-ТХ3',
      'Номер линии': 'ГС-201/1',
      'Наименование линии': 'Линия подачи сырого газа',
      Продукт: 'Природный газ',
      'Контур испытания': 'Контур КВД-201',
      'НТД на сварку': 'СТО Газпром 15-1.1-002-2023',
      'НТД на контроль': 'СТО Газпром 15-1.3-004-2023',
      'Категория трубопровода': 'I',
      'Процент контроля РК': '100%',
      'Процент контроля УЗК': '100%',
      'Процент контроля ПВК': '0%',
    },
    {
      'Название объекта': 'УКПГ-2В Бованенковское НГКМ',
      'Шифр РД': '0092.049.Р.13/1 0004 УКПГ.045.0077.001-ТХ3',
      'Номер линии': 'ГС-201/2',
      'Наименование линии': 'Резервная линия сепарации',
      Продукт: 'Природный газ',
      'Контур испытания': 'Контур КВД-201',
      'НТД на сварку': 'СТО Газпром 15-1.1-002-2023',
      'НТД на контроль': 'СТО Газпром 15-1.3-004-2023',
      'Категория трубопровода': 'I',
      'Процент контроля РК': '100%',
      'Процент контроля УЗК': '100%',
      'Процент контроля ПВК': '0%',
    },
    {
      'Название объекта': 'УКПГ-2В Бованенковское НГКМ',
      'Шифр РД': '0092.049.Р.13/1 0004 УКПГ.045.0077.002-ТХ4',
      'Номер линии': 'ДР-999',
      'Наименование линии': 'Временная дренажная линия (на удаление РД)',
      Продукт: 'Конденсат',
      'Контур испытания': 'Контур ДР-1',
    },
    {
      'Название объекта': 'КС «Воркутинская» (Объект на удаление)',
      'Шифр РД': '0092.049.Р.99-ТХ9',
      'Номер линии': 'ВР-101',
      'Наименование линии': 'Временный коллектор',
      Продукт: 'Газ',
      'Контур испытания': 'Контур ВР',
    },
  ];
  projectLineList = parseProjectLineListRecords(
    rawLinesToImport,
    'УКПГ-2В Бованенковское НГКМ',
    '0092.049.Р.13/1 0004 УКПГ.045.0077.001-ТХ3'
  );
  assert.equal(projectLineList.length, 4);

  let derivedFacs = deriveFacilitiesFromLineList(projectLineList);
  assert.equal(derivedFacs.length, 2, 'Должны автоматически появиться 2 объекта');

  // Удаление целого Объекта «КС «Воркутинская» (Объект на удаление)»
  projectLineList = projectLineList.filter(
    (l) => l.objectName !== 'КС «Воркутинская» (Объект на удаление)'
  );
  derivedFacs = deriveFacilitiesFromLineList(projectLineList);
  assert.equal(derivedFacs.length, 1, 'После удаления объекта должен остаться 1 объект');

  // Удаление Шифра РД «0092.049.Р.13/1 0004 УКПГ.045.0077.002-ТХ4»
  projectLineList = projectLineList.filter(
    (l) => l.rdCode !== '0092.049.Р.13/1 0004 УКПГ.045.0077.002-ТХ4'
  );
  derivedFacs = deriveFacilitiesFromLineList(projectLineList);
  assert.equal(derivedFacs[0].rdCodes.length, 1, 'Должен остаться 1 рабочий шифр РД');

  // Добавление ещё одной линии и удаление одной линии
  projectLineList.push({
    id: 'pl-del-line',
    objectName: 'УКПГ-2В Бованенковское НГКМ',
    rdCode: '0092.049.Р.13/1 0004 УКПГ.045.0077.001-ТХ3',
    lineNumber: 'ЛИНИЯ-УДАЛИТЬ',
    uniqueLineId: buildUniqueLineId(
      '0092.049.Р.13/1 0004 УКПГ.045.0077.001-ТХ3',
      'ЛИНИЯ-УДАЛИТЬ'
    ),
    lineName: 'Линия на удаление',
    product: 'Вода',
    testContour: 'Контур КВД-201',
    weldingNtd: 'СТО Газпром',
    controlNtd: 'СТО Газпром',
    qualityLevel: 'Уровень В',
    pipelineCategory: 'II',
    workingPressure: '10 МПа',
    workingTemperature: '+20 °C',
    rkPercent: 100,
    uzkPercent: 0,
    pvkPercent: 0,
    testDate: '',
  });
  assert.equal(projectLineList.length, 3);
  projectLineList = projectLineList.filter((l) => l.id !== 'pl-del-line');
  assert.equal(projectLineList.length, 2, 'Линия должна быть успешно удалена');

  // Заполнение Каталога ЛРВ (Инженер ПТО Кузнецова Е.С.) + редактирование и удаление позиции ЛРВ
  const activeRd = '0092.049.Р.13/1 0004 УКПГ.045.0077.001-ТХ3';
  lrvCatalog = [
    {
      id: 'lrv-sim-1',
      lrvCode: 'ЛРВ-СИМ-001',
      rdCode: activeRd,
      objectName: 'УКПГ-2В Бованенковское НГКМ',
      shortName: 'Труба БШ 219х12',
      material: '09Г2С',
      ntd: 'ГОСТ 8732-78',
      manufacturer: 'ПАО «ЧТПЗ»',
      dn1: 200,
      diameterMm: 219,
      wallThickness: 12,
      specQty: 120,
      unit: 'м',
    },
    {
      id: 'lrv-sim-2',
      lrvCode: 'ЛРВ-СИМ-002',
      rdCode: activeRd,
      objectName: 'УКПГ-2В Бованенковское НГКМ',
      shortName: 'Отвод 90° 219х12',
      material: '09Г2С',
      ntd: 'ГОСТ 17375-2001',
      manufacturer: 'АО «СОТ»',
      dn1: 200,
      diameterMm: 219,
      wallThickness: 12,
      specQty: 24,
      unit: 'шт',
    },
    {
      id: 'lrv-sim-3',
      lrvCode: 'ЛРВ-СИМ-003',
      rdCode: activeRd,
      objectName: 'УКПГ-2В Бованенковское НГКМ',
      shortName: 'Переход К 219х12-159х8',
      material: '09Г2С',
      ntd: 'ГОСТ 17378-2001',
      manufacturer: 'АО «СОТ»',
      dn1: 200,
      diameterMm: 219,
      wallThickness: 12,
      dn2: 150,
      diameterMm2: 159,
      wallThickness2: 8,
      specQty: 10,
      unit: 'шт',
    },
    {
      id: 'lrv-sim-del',
      lrvCode: 'ЛРВ-УДАЛИТЬ-99',
      rdCode: activeRd,
      objectName: 'УКПГ-2В Бованенковское НГКМ',
      shortName: 'Заглушка (ошибочная)',
      material: '09Г2С',
      ntd: 'ГОСТ 17379-2001',
      diameterMm: 219,
      wallThickness: 12,
      specQty: 1,
      unit: 'шт',
    },
  ];
  lrvCatalog = lrvCatalog.filter((c) => c.id !== 'lrv-sim-del');
  assert.equal(lrvCatalog.length, 3, 'Ошибочная позиция ЛРВ должна быть удалена');

  // Редактирование позиции ЛРВ (проверка новой кнопки редактирования в ЛРВ)
  lrvCatalog = lrvCatalog.map((c) =>
    c.id === 'lrv-sim-1' ? { ...c, specQty: 150 } : c
  );
  assert.equal(lrvCatalog[0].specQty, 150, 'Количество по спецификации в ЛРВ должно обновиться');

  // =========================================================================
  // ЭТАП 4. Пакетный импорт стыков из Excel с автопривязкой + добавление доп. стыков 011, 012 + удаление стыка
  // =========================================================================
  const excelRowsToImport = [
    {
      'Шифр РД': activeRd,
      'Номер линии': 'ГС-201/1',
      'Номер стыка': '010',
      'Диаметр и толщина стенки': '219х12',
      'Код ЛРВ 1': 'ЛРВ-СИМ-001',
      'Код ЛРВ 2': 'ЛРВ-СИМ-002',
      'Тип соединения (ГОСТ)': 'С17',
    },
    {
      'Шифр РД': activeRd,
      'Номер линии': 'ГС-201/1',
      'Номер стыка': '020',
      'Диаметр и толщина стенки': '219х12',
      'Код ЛРВ 1': 'ЛРВ-СИМ-002',
      'Код ЛРВ 2': 'ЛРВ-СИМ-003',
      'Тип соединения (ГОСТ)': 'С17',
    },
    {
      'Шифр РД': activeRd,
      'Номер линии': 'ГС-201/1',
      'Номер стыка': '030',
      'Диаметр и толщина стенки': '219х12',
      'Код ЛРВ 1': 'ЛРВ-СИМ-001',
      'Код ЛРВ 2': 'ЛРВ-СИМ-001',
      'Тип соединения (ГОСТ)': 'У4',
    },
    {
      'Шифр РД': activeRd,
      'Номер линии': 'ГС-201/2',
      'Номер стыка': '010',
      'Диаметр и толщина стенки': '219х12',
      'Код ЛРВ 1': 'ЛРВ-СИМ-001',
      'Код ЛРВ 2': 'ЛРВ-СИМ-002',
      'Тип соединения (ГОСТ)': 'С17',
    },
  ];

  const importResult = parseAndValidateJointsImport(
    excelRowsToImport,
    projectLineList,
    lrvCatalog,
    techCards,
    joints,
    'УКПГ-2В Бованенковское НГКМ',
    activeRd
  );
  assert.equal(importResult.errorCount, 0, 'Все 4 проектных стыка должны пройти валидацию без ошибок');
  joints = importResult.rows.map((r) => r.jointToImport!);
  assert.equal(joints.length, 4);
  assert.equal(joints[0].techCardNumber, 'ТК-SIM-09Г2С-01', 'Техкарта должна автоматически привязаться по диаметру и толщине');
  assert.equal(joints[0].elem1Manufacturer, 'ПАО «ЧТПЗ»', 'Завод-изготовитель элемента 1 должен подтянуться из ЛРВ');
  assert.equal(joints[0].elem2Manufacturer, 'АО «СОТ»', 'Завод-изготовитель элемента 2 должен подтянуться из ЛРВ');

  // Добавление дополнительного (ремонтного/монтажного) стыка 011 и временного 012 (на удаление)
  const line1Nums = joints
    .filter((j) => j.lineNumber === 'ГС-201/1')
    .map((j) => j.jointNumber);
  const suppNum1 = suggestNextJointNumber(line1Nums, '010');
  assert.equal(suppNum1, '011');
  const suppJoint011: WeldJoint = {
    ...joints[0],
    id: 'j-sim-011',
    jointNumber: suppNum1,
  };
  joints.push(suppJoint011);

  const suppJoint012ToDel: WeldJoint = {
    ...joints[0],
    id: 'j-sim-012-del',
    jointNumber: '012',
  };
  joints.push(suppJoint012ToDel);
  assert.equal(joints.length, 6);

  // Удаление ошибочного стыка 012
  joints = joints.filter((j) => j.id !== 'j-sim-012-del');
  assert.equal(joints.length, 5, 'Ошибочный стык 012 должен быть удалён');

  // =========================================================================
  // ЭТАП 5. Разноска сварки по рапортам (Инженер ПТО Волков Д.И.) и контроль (ЛНК Лебедев С.А., Попов М.В., Новикова О.А.)
  // Включая сценарий «Ремонт» -> Повторный контроль «Годен» и стек Undo/Redo
  // =========================================================================
  let undoStack: WeldJoint[][] = [];
  let redoStack: WeldJoint[][] = [];

  undoStack = pushHistorySnapshot(undoStack, joints, MAX_HISTORY_STEPS).undoStack;

  // Массовое редактирование сварки для стыков 010, 011, 020 на линии ГС-201/1 (клеймо А701)
  const resolvedSingle = resolveWeldersSelection(['А701'], undefined, welders);
  const bulkWeldingRes = applyBulkUpdateToJoints(
    joints,
    [joints[0].id, suppJoint011.id, joints[1].id],
    {
      weldingDate: '2026-10-14',
      ambientTemp: String(estimateAmbientTempByCoordsAndDate(70.37, 68.44, '2026-10-14')),
      welderStamp: resolvedSingle.welderStamp,
      welderFullName: resolvedSingle.welderFullName,
      welderCertNumber: resolvedSingle.welderCertNumber,
      responsiblePerson: resolvedSingle.responsiblePerson,
      preheatTemp: '+140',
      elem1Length: '11.5',
      elem2Length: '0.45',
      elem1FactoryNumber: 'СЕРТ-ТР-101',
      elem2FactoryNumber: 'СЕРТ-ОТВ-202',
      weldingMaterials: 'Св-08Г2С Ø2.0 / УОНИ-13/55 Ø3.0',
    },
    {
      login: 'pto_volkov',
      fullName: 'Волков Дмитрий Игоревич',
      role: 'Инженер ПТО',
    },
    FIELD_LABELS_MAP
  );
  joints = bulkWeldingRes.updatedJoints;
  auditLogs = [...bulkWeldingRes.auditEntries, ...auditLogs];

  // Сварка стыка 030 (угловой У4) и стыка 010 на ГС-201/2 бригадой БР-70
  const resolvedBrigade = resolveWeldersSelection([], 'БР-70', welders);
  assert.equal(resolvedBrigade.welderStamp, 'БР-70 (А701, В702)', 'Бригада БР-70 должна раскрываться в личные клейма членов бригады');
  const bulkBrigadeRes = applyBulkUpdateToJoints(
    joints,
    [joints[2].id, joints[3].id],
    {
      weldingDate: '2026-10-15',
      ambientTemp: '-8',
      welderStamp: resolvedBrigade.welderStamp,
      welderFullName: resolvedBrigade.welderFullName,
      welderCertNumber: resolvedBrigade.welderCertNumber,
      responsiblePerson: resolvedBrigade.responsiblePerson,
      preheatTemp: '+140',
      elem1Length: '6.2',
      elem2Length: '5.8',
      elem1FactoryNumber: 'СЕРТ-ТР-103',
      elem2FactoryNumber: 'СЕРТ-ТР-104',
      weldingMaterials: 'Св-08Г2С Ø2.0 / УОНИ-13/55 Ø3.0',
    },
    {
      login: 'pto_volkov',
      fullName: 'Волков Дмитрий Игоревич',
      role: 'Инженер ПТО',
    },
    FIELD_LABELS_MAP
  );
  joints = bulkBrigadeRes.updatedJoints;

  // Проверка Undo / Redo
  const undoStep = performUndoStep(undoStack, redoStack, joints, MAX_HISTORY_STEPS);
  assert.equal(Boolean(undoStep.targetState), true);
  assert.equal(undoStep.targetState![0].weldingDate, '', 'После Undo дата сварки должна откатиться');
  const redoStep = performRedoStep(
    undoStep.undoStack,
    undoStep.redoStack,
    undoStep.targetState!,
    MAX_HISTORY_STEPS
  );
  joints = redoStep.targetState!;
  assert.equal(joints[0].weldingDate, '2026-10-14', 'После Redo дата сварки должна восстановиться');

  // Внесение ВИК и Первичного НК (Дефектоскописты Новикова О.А. и Попов М.В.):
  // 4 стыка -> Годен, а стык 020 (joints[1]) -> Ремонт при первичном РК!
  const goodIds = [joints[0].id, suppJoint011.id, joints[2].id, joints[3].id];
  joints = applyBulkUpdateToJoints(
    joints,
    goodIds,
    {
      vikResult: 'Годен',
      vikDate: '2026-10-16',
      vikInspector: 'Новикова О.А.',
      ndtType: 'РК',
      ndtResult: 'Годен',
      ndtDate: '2026-10-17',
      ndtInspector: 'Попов М.В.',
      dupNdtType: 'Не требуется',
      dupNdtResult: 'Не проводился',
    },
    {
      login: 'lnk_popov',
      fullName: 'Попов Максим Валерьевич',
      role: 'Дефектоскопист РК/УЗК',
    },
    FIELD_LABELS_MAP
  ).updatedJoints;

  // Стык 020 получает заключение «Ремонт» при первичном РК
  joints = applyBulkUpdateToJoints(
    joints,
    [joints[1].id],
    {
      vikResult: 'Годен',
      vikDate: '2026-10-16',
      vikInspector: 'Новикова О.А.',
      ndtType: 'РК',
      ndtResult: 'Ремонт',
      ndtDate: '2026-10-17',
      ndtInspector: 'Лебедев С.А.',
    },
    {
      login: 'lnk_lebedev',
      fullName: 'Лебедев Сергей Анатольевич',
      role: 'Начальник ЛНК',
    },
    FIELD_LABELS_MAP
  ).updatedJoints;

  assert.equal(isJointCurrentlyInRepair(joints[1]), true, 'Стык 020 должен числиться в активном ремонте');
  assert.equal(isJointFullyAccepted(joints[1]), false);

  // Закрытие ремонта стыка 020 повторным контролем «РК» -> «Годен»
  joints = applyBulkUpdateToJoints(
    joints,
    [joints[1].id],
    {
      dupNdtType: 'РК',
      dupNdtResult: 'Годен',
      dupNdtDate: '2026-10-19',
      dupNdtInspector: 'Лебедев С.А.',
    },
    {
      login: 'lnk_lebedev',
      fullName: 'Лебедев Сергей Анатольевич',
      role: 'Начальник ЛНК',
    },
    FIELD_LABELS_MAP
  ).updatedJoints;

  assert.equal(isJointCurrentlyInRepair(joints[1]), false, 'После Годен по повторному НК стык снимается с ремонта');
  assert.equal(isJointFullyAccepted(joints[1]), true, 'Стык 020 должен перейти в 100% принятые стыки');

  // Комплексная проверка всех 5 паспортов стыков по диаметрам, подогреву и виду сварки
  joints.forEach((j) => {
    const diamCheck = validateElementsDiameterMatch(
      j.elem1DiameterMm ?? j.diameterMm,
      j.elem2DiameterMm ?? j.diameterMm
    );
    assert.equal(diamCheck.isMatch, true, `Диаметры элементов стыка ${j.jointNumber} должны совпадать`);
    const preheatCheck = validatePreheatTemperature(j.preheatTemp, j.ambientTemp, techCards[0]);
    assert.equal(preheatCheck.isValid, true, `Подогрев стыка ${j.jointNumber} должен соответствовать ТК`);
    const wtCheck = validateWeldingTypeWithTechCard(j.weldingType, techCards[0]);
    assert.equal(wtCheck.isValid, true, `Вид сварки стыка ${j.jointNumber} должен соответствовать ТК`);
  });

  // Проверка сводки готовности (Readiness Report) и расчёта статуса линий лайнлиста
  const readinessByLine = calculateReadinessReport(joints, 'uniqueLineId');
  assert.equal(readinessByLine.length, 2);
  assert.equal(readinessByLine.every((r) => r.readinessPct === 100), true, 'Обе линии должны иметь 100% готовность');
  const line1Status = computeLineListItemStatus(projectLineList[0], joints);
  assert.equal(line1Status.isCompleted, true, 'Линия 1 в лайнлисте должна получить статус 100% готовности');
  assert.ok(line1Status.statusLabel.includes('Все стыки сварены и проконтролированы'));

  // =========================================================================
  // ЭТАП 6. Полный Бэкап (.JSON), Обнуление Автором («Чистый лист») и Восстановление из Бэкапа
  // =========================================================================
  const backupPayload: FullSystemBackupPayload = {
    backupFormat: 'ZAYCHICK_FULL_BACKUP_V1',
    appVersion: '2.5.0',
    createdAt: new Date().toISOString(),
    createdByLogin: 'ilchenko.vlad@gmail.com',
    createdByFullName: 'Ильченко В.',
    comment: 'Полный бэкап симуляции 10 пользователей',
    data: {
      joints: JSON.parse(JSON.stringify(joints)),
      projectLineList: JSON.parse(JSON.stringify(projectLineList)),
      lrvCatalog: JSON.parse(JSON.stringify(lrvCatalog)),
      welders: JSON.parse(JSON.stringify(welders)),
      techCards: JSON.parse(JSON.stringify(techCards)),
      weldingMaterials: JSON.parse(JSON.stringify(weldingMaterials)),
      userAccounts: JSON.parse(JSON.stringify(userAccounts)),
      auditLogs: JSON.parse(JSON.stringify(auditLogs)),
      facilityGeoOverrides: {},
      templates: [],
      activeTemplateId: 'tpl-full-all',
    },
  };

  // Скрытый сброс Автора («Чистый лист»)
  joints = [];
  projectLineList = [];
  lrvCatalog = [];
  welders = [];
  techCards = [];
  weldingMaterials = [];
  assert.equal(joints.length, 0);
  assert.equal(projectLineList.length, 0);

  // Восстановление 100% функционала и данных из бэкапа
  joints = backupPayload.data.joints;
  projectLineList = backupPayload.data.projectLineList;
  lrvCatalog = backupPayload.data.lrvCatalog;
  welders = backupPayload.data.welders;
  techCards = backupPayload.data.techCards;
  weldingMaterials = backupPayload.data.weldingMaterials;
  userAccounts = backupPayload.data.userAccounts;
  assert.equal(joints.length, 5, 'Все 5 стыков должны восстановиться из бэкапа');
  assert.equal(userAccounts.length, 9, 'Все 9 активных пользователей должны восстановиться из бэкапа');

  // =========================================================================
  // ЭТАП 7. Формирование и проверка печати журналов СТО Газпром 15-1.1-002-2023 (49 граф) и ГОСТ 32569-2013 (17 граф)
  // =========================================================================
  const sortedForJournal = sortJointsChronologically(joints);
  assert.equal(sortedForJournal.length, 5);

  sortedForJournal.forEach((j, idx) => {
    const stoRow = formatStoGazpromJournalRow(j, idx, lrvCatalog);
    const gostRow = formatGost32569JournalRow(j, idx, weldingMaterials);

    assert.equal(stoRow.cells.length, 49, 'Строка журнала СТО Газпром должна содержать ровно 49 граф');
    assert.equal(gostRow.cells.length, 17, 'Строка журнала ГОСТ 32569-2013 должна содержать ровно 17 граф');

    // Проверка строгих нормативов СТО Газпром 15-1.1-002-2023:
    assert.ok(stoRow.col6.includes('ПАО «ЧТПЗ»') || stoRow.col6.includes('АО «СОТ»'), 'В графе 6 должен быть завод-изготовитель');
    assert.equal(stoRow.col16, 'ТК-SIM-09Г2С-01', 'В графе 16 должен быть только номер ТК без положения сварки');
    assert.ok(['Громов', 'Тимофеев'].includes(stoRow.col19), 'В графе 19 должна быть только фамилия руководителя работ');
    assert.equal(stoRow.col20, '', 'Графа 20 под живую подпись должна быть пустой');
    assert.equal(stoRow.col37, '', 'Графа 37 под живую подпись должна быть пустой');

    if (j.gostJointType === 'У4') {
      assert.equal(stoRow.col14, 'Я', 'Для углового шва У4 в графе 14 ставится Я');
    } else if (j.jointNumber === '020') {
      assert.equal(stoRow.col14, 'Р', 'Для отремонтированного стыкового шва в графе 14 ставится Р');
    } else {
      assert.equal(stoRow.col14, 'н/п', 'Для стыкового шва С17 в графе 14 ставится н/п');
    }

    // Проверка отремонтированного стыка 020 в журнале СТО Газпром:
    if (j.jointNumber === '020') {
      assert.equal(stoRow.col27, 'Ремонт', 'В графе 27 первичного НК фиксируется Ремонт');
      assert.equal(stoRow.col31, 'н/п', 'При браке первичного контроля дублирующий контроль (гр. 31) равен н/п');
      assert.equal(stoRow.col32, 'Ремонт', 'В графе 32 указывается Ремонт');
      assert.equal(stoRow.col36, 'Громов', 'В графе 36 указывается только фамилия мастера');
      assert.equal(stoRow.col40, 'Годен', 'В графе 40 ВИК после ремонта — Годен');
      assert.equal(stoRow.col44, 'Годен', 'В графе 44 ФМК после ремонта — Годен');
    }
  });
});

// ============================================================================
// ТЕСТ ЕДИНОЙ СЕРВЕРНОЙ СУБД И ОПТИМИСТИЧЕСКОЙ БЛОКИРОВКИ (OCC / HTTP 409)
// ============================================================================
test('Единая серверная СУБД: Оптимистическая блокировка (OCC), перехват конфликта версий (HTTP 409) и 3-стороннее слияние (Auto-Merge)', () => {
  // Проверка базового предиката версий
  assert.equal(verifyOptimisticVersion(2, 2), true);
  assert.equal(verifyOptimisticVersion(1, 2), false);

  // Исходный стык в СУБД (версия v1)
  const baseJointV1: WeldJoint = {
    id: 'j-occ-010',
    version: 1,
    jointNumber: '010',
    isSupplementary: false,
    objectName: 'УКПГ-2В Бованенковское НГКМ',
    rdCode: '0092.049.Р.13/1 0004 УКПГ.045.0077.001-ТХ3',
    contour: 'Контур КВД-1',
    lineNumber: 'ФП1.2/1',
    uniqueLineId: '001-ТХ3-ФП1.2/1',
    diameterMm: 159,
    diameterInch: '6"',
    wallThickness: 8,
    lrv1Code: 'ЛРВ-010-1',
    elem1Name: 'Труба БШ',
    elem1Material: '09Г2С',
    elem1Ntd: 'ГОСТ 8732-78',
    lrv2Code: 'ЛРВ-010-2',
    elem2Name: 'Отвод 90°',
    elem2Material: '09Г2С',
    elem2Ntd: 'ГОСТ 17375-2001',
    jointType: 'Монтажный',
    gostJointType: 'С17',
    weldingPosition: 'В1',
    weldingDate: '2026-10-15',
    ambientTemp: '-8',
    weldingType: 'РАД+РД',
    welderStamp: 'А142',
    welderFullName: 'Королёв Денис Викторович',
    welderCertNumber: 'ЗС-1ГАЦ-I-10482',
    techCardNumber: 'ТК-045-РАД/РД-01',
    preheatTemp: '+120',
    weldingMaterials: 'Св-08Г2С Ø2.0 / УОНИ-13/55 Ø3.0',
    responsiblePerson: 'Громов И.А.',
    vikResult: 'Годен',
    vikDate: '',
    vikInspector: '',
    ndtType: 'РК',
    ndtResult: 'Не проводился',
    ndtReportNumber: '',
    ndtDate: '',
    ndtInspector: '',
    dupNdtType: 'Не требуется',
    dupNdtResult: 'Не проводился',
    dupNdtDate: '',
    dupNdtInspector: '',
    updatedAt: '2026-10-15T08:00:00.000Z',
    updatedBy: 'Смирнов А.В.',
  };

  let serverJoints: WeldJoint[] = [baseJointV1];

  // 1. Пользователь №1 (Дефектоскопист ЛНК Лебедев С.А.) открыл стык v1 и сохранил результат ВИК и НК.
  // Так как expectedVersion = 1 совпадает с версией в СУБД (1), запись успешно сохраняется и получает версию v2.
  const user1Edit: WeldJoint = {
    ...baseJointV1,
    vikResult: 'Годен',
    ndtResult: 'Годен',
    ndtReportNumber: 'УЗК-101/26',
  };

  const save1 = applyOptimisticJointSave({
    currentJoints: serverJoints,
    incomingJoint: user1Edit,
    expectedVersion: 1,
    baseJoint: baseJointV1,
    user: {
      login: 'lnk_lebedev',
      fullName: 'Лебедев С.А. (ЛНК)',
      role: 'Начальник ЛНК',
    },
    fieldLabels: FIELD_LABELS_MAP,
    timestampIso: '2026-10-15T09:10:00.000Z',
  });

  assert.equal(save1.status, 'ok', 'Первое сохранение с актуальной версией v1 должно пройти успешно');
  if (save1.status === 'ok') {
    assert.equal(save1.savedJoint.version, 2, 'Версия стыка в СУБД должна увеличиться до v2');
    serverJoints = save1.updatedJoints;
  }

  // 2. Пользователь №2 (Инженер ПТО Кузнецова Е.И.) одновременно держала открытым тот же стык ещё с версией v1
  // и изменила температуру подогрева (preheatTemp: +150) и сварочные материалы.
  // При попытке сохранения с expectedVersion = 1 серверная СУБД обнаруживает, что на сервере уже v2 -> HTTP 409 Conflict!
  const user2CompetingEdit: WeldJoint = {
    ...baseJointV1,
    preheatTemp: '+150',
    weldingMaterials: 'Св-08Г2С Ø2.0 / LB-52U Ø3.2',
  };

  const save2Conflict = applyOptimisticJointSave({
    currentJoints: serverJoints,
    incomingJoint: user2CompetingEdit,
    expectedVersion: 1,
    baseJoint: baseJointV1,
    user: {
      login: 'pto_kuznetsova',
      fullName: 'Кузнецова Е.И. (ПТО)',
      role: 'Инженер ПТО',
    },
    fieldLabels: FIELD_LABELS_MAP,
    timestampIso: '2026-10-15T09:12:00.000Z',
  });

  assert.equal(
    save2Conflict.status,
    'conflict',
    'Попытка перезаписать стык со старой версией v1 поверх v2 должна вернуть статус conflict (HTTP 409)'
  );

  if (save2Conflict.status === 'conflict') {
    const conflict = save2Conflict.conflict;
    assert.equal(conflict.expectedVersion, 1);
    assert.equal(conflict.actualServerVersion, 2);
    assert.equal(conflict.serverUpdatedBy, 'Лебедев С.А. (ЛНК)');
    assert.equal(
      conflict.fieldDiffs.some((d) => d.isDirectCollision),
      false,
      'Поля не пересекаются: ЛНК менял ВИК/НК, а ПТО менял подогрев и сварочные материалы'
    );

    // Проверяем 3-Way Auto-Merge: в слитой записи должны сохраниться И правки ЛНК (ВИК/НК = Годен), И правки ПТО (подогрев = +150)
    assert.equal(conflict.autoMergedRecord.vikResult, 'Годен');
    assert.equal(conflict.autoMergedRecord.ndtReportNumber, 'УЗК-101/26');
    assert.equal(conflict.autoMergedRecord.preheatTemp, '+150');
    assert.equal(conflict.autoMergedRecord.weldingMaterials, 'Св-08Г2С Ø2.0 / LB-52U Ø3.2');

    // 3. Применяем результат 3-стороннего слияния (Auto-Merge) с базовой версией сервера v2 -> получаем v3
    const save3Merged = applyOptimisticJointSave({
      currentJoints: serverJoints,
      incomingJoint: conflict.autoMergedRecord,
      expectedVersion: conflict.actualServerVersion,
      baseJoint: conflict.serverRecord,
      user: {
        login: 'pto_kuznetsova',
        fullName: 'Кузнецова Е.И. (Auto-Merge)',
        role: 'Инженер ПТО',
      },
      fieldLabels: FIELD_LABELS_MAP,
      timestampIso: '2026-10-15T09:13:00.000Z',
      forceOverwrite: true,
    });

    assert.equal(save3Merged.status, 'ok');
    if (save3Merged.status === 'ok') {
      assert.equal(save3Merged.savedJoint.version, 3, 'После разрешения конфликта версия становится v3');
      assert.equal(save3Merged.savedJoint.vikResult, 'Годен');
      assert.equal(save3Merged.savedJoint.preheatTemp, '+150');
    }
  }

  // 4. Проверка прямого столкновения (Hard Collision) в одном и том же поле (например, оба поменяли vikResult по-разному)
  const hardConflict = computeJointOptimisticConflict(
    { ...baseJointV1, vikResult: 'В работе' },
    { ...baseJointV1, version: 1, vikResult: 'Годен', updatedBy: 'Инженер 2' },
    { ...baseJointV1, version: 2, vikResult: 'Ремонт', updatedBy: 'Инженер 1' },
    FIELD_LABELS_MAP
  );
  assert.equal(
    hardConflict.fieldDiffs.some((d) => d.isDirectCollision),
    true,
    'При одновременном изменении одного и того же поля должен фиксироваться флаг прямого столкновения'
  );
});

test('Field-Level RBAC: ролевое разграничение прав Технолога, Инженера ПТО и Специалиста ЛНК', () => {
  const technologistUser = {
    login: 'morozov_iv',
    fullName: 'Морозов Игорь Валентинович',
    role: 'Главный сварщик / Инженер-технолог по сварке',
    department: 'Отдел главного сварщика (ОГС)',
  };
  const ptoUser = {
    login: 'sokolov_av',
    fullName: 'Соколов Алексей Викторович',
    role: 'Ведущий инженер ПТО',
    department: 'Производственно-технический отдел (ПТО)',
  };
  const ndtUser = {
    login: 'lebedev_km',
    fullName: 'Лебедев Константин Михайлович',
    role: 'Начальник лаборатории НК (ПИЛ)',
    department: 'Производственная испытательная лаборатория (ЛНК)',
  };

  // 1. Классификация ролей и права на разделы
  assert.equal(detectRbacRoleCategory(technologistUser), 'technologist');
  assert.equal(detectRbacRoleCategory(ptoUser), 'pto');
  assert.equal(detectRbacRoleCategory(ndtUser), 'ndt');

  const techPerms = getUserRolePermissions(technologistUser);
  assert.equal(techPerms.canEditWeldingTech, true);
  assert.equal(techPerms.canEditLineList, false);
  assert.equal(techPerms.canEditLrvCatalog, false);
  assert.equal(techPerms.canCreateOrDeleteJoints, false);
  assert.equal(techPerms.canEditPrepAndWeldingFields, false);
  assert.equal(techPerms.canEditNdtFields, false);

  const ptoPerms = getUserRolePermissions(ptoUser);
  assert.equal(ptoPerms.canEditWeldingTech, false);
  assert.equal(ptoPerms.canEditLineList, true);
  assert.equal(ptoPerms.canEditLrvCatalog, false);
  assert.equal(ptoPerms.canCreateOrDeleteJoints, true);
  assert.equal(ptoPerms.canEditPrepAndWeldingFields, true);
  assert.equal(ptoPerms.canEditNdtFields, false);

  const ndtPerms = getUserRolePermissions(ndtUser);
  assert.equal(ndtPerms.canEditWeldingTech, false);
  assert.equal(ndtPerms.canEditLineList, false);
  assert.equal(ndtPerms.canEditLrvCatalog, false);
  assert.equal(ndtPerms.canCreateOrDeleteJoints, false);
  assert.equal(ndtPerms.canEditPrepAndWeldingFields, false);
  assert.equal(ndtPerms.canEditNdtFields, true);

  // 2. Полевое разграничение (canUserEditJointField)
  assert.equal(canUserEditJointField(ptoUser, 'welderStamp'), true);
  assert.equal(canUserEditJointField(ptoUser, 'preheatTemp'), true);
  assert.equal(canUserEditJointField(ptoUser, 'lrv1Code'), true);
  assert.equal(canUserEditJointField(ptoUser, 'vikResult'), false);
  assert.equal(canUserEditJointField(ptoUser, 'ndtResult'), false);
  assert.equal(canUserEditJointField(ptoUser, 'dupNdtResult'), false);

  assert.equal(canUserEditJointField(ndtUser, 'welderStamp'), false);
  assert.equal(canUserEditJointField(ndtUser, 'preheatTemp'), false);
  assert.equal(canUserEditJointField(ndtUser, 'lrv1Code'), false);
  assert.equal(canUserEditJointField(ndtUser, 'vikResult'), true);
  assert.equal(canUserEditJointField(ndtUser, 'ndtResult'), true);
  assert.equal(canUserEditJointField(ndtUser, 'dupNdtResult'), true);

  // 3. Техническая защита при сохранении стыка (enforceFieldLevelRbacOnJointSave)
  const existingJoint = INITIAL_JOINTS[0];
  const attemptedFullEdit: WeldJoint = {
    ...existingJoint,
    welderStamp: 'B999',
    preheatTemp: '220',
    lrv1Code: 'ЛРВ-НОВАЯ-01',
    vikResult: 'Ремонт',
    ndtResult: 'Вырезать',
    ndtReportNumber: 'УЗК-999',
    dupNdtResult: 'Годен',
  };

  // Инженер ПТО меняет всё -> сохраняются только поля подготовки/сварки/ЛРВ, а поля ВИК и НК остаются исходными
  const ptoSanitized = enforceFieldLevelRbacOnJointSave(
    existingJoint,
    attemptedFullEdit,
    ptoUser
  );
  assert.equal(ptoSanitized.welderStamp, 'B999');
  assert.equal(ptoSanitized.preheatTemp, '220');
  assert.equal(ptoSanitized.lrv1Code, 'ЛРВ-НОВАЯ-01');
  assert.equal(ptoSanitized.vikResult, existingJoint.vikResult);
  assert.equal(ptoSanitized.ndtResult, existingJoint.ndtResult);
  assert.equal(ptoSanitized.ndtReportNumber, existingJoint.ndtReportNumber);
  assert.equal(ptoSanitized.dupNdtResult, existingJoint.dupNdtResult);

  // Специалист ЛНК меняет всё -> сохраняются только поля ВИК/НК/Дубль НК, а поля подготовки/сварки/ЛРВ остаются исходными
  const ndtSanitized = enforceFieldLevelRbacOnJointSave(
    existingJoint,
    attemptedFullEdit,
    ndtUser
  );
  assert.equal(ndtSanitized.welderStamp, existingJoint.welderStamp);
  assert.equal(ndtSanitized.preheatTemp, existingJoint.preheatTemp);
  assert.equal(ndtSanitized.lrv1Code, existingJoint.lrv1Code);
  assert.equal(ndtSanitized.vikResult, 'Ремонт');
  assert.equal(ndtSanitized.ndtResult, 'Вырезать');
  assert.equal(ndtSanitized.ndtReportNumber, 'УЗК-999');
  assert.equal(ndtSanitized.dupNdtResult, 'Годен');

  // Технолог по сварке пытается изменить стык -> стык защищён полностью (режим чтения)
  const techSanitized = enforceFieldLevelRbacOnJointSave(
    existingJoint,
    attemptedFullEdit,
    technologistUser
  );
  assert.equal(techSanitized.welderStamp, existingJoint.welderStamp);
  assert.equal(techSanitized.vikResult, existingJoint.vikResult);

  // 4. Фильтрация пакета массового редактирования (filterBulkPatchByRole)
  const mixedBulkPatch: Partial<WeldJoint> = {
    welderStamp: 'A777',
    weldingDate: '2026-11-01',
    vikResult: 'Годен',
    ndtResult: 'Годен',
  };
  const ptoBulk = filterBulkPatchByRole(mixedBulkPatch, ptoUser);
  assert.equal(ptoBulk.welderStamp, 'A777');
  assert.equal(ptoBulk.weldingDate, '2026-11-01');
  assert.equal(ptoBulk.vikResult, undefined);
  assert.equal(ptoBulk.ndtResult, undefined);

  const ndtBulk = filterBulkPatchByRole(mixedBulkPatch, ndtUser);
  assert.equal(ndtBulk.welderStamp, undefined);
  assert.equal(ndtBulk.weldingDate, undefined);
  assert.equal(ndtBulk.vikResult, 'Годен');
  assert.equal(ndtBulk.ndtResult, 'Годен');

  // 5. Администратор системы — полный неограниченный доступ ко всем разделам и всем полям стыка
  const adminUser: UserAccount = {
    login: 'admin',
    password: '123',
    fullName: 'Администратор Системы',
    role: 'Администратор системы',
    department: 'Администрация / Управление проектом',
    sessionNumber: 99,
  };
  assert.equal(detectRbacRoleCategory(adminUser), 'admin');
  const adminPerms = getUserRolePermissions(adminUser);
  assert.equal(adminPerms.canEditWeldingTech, true);
  assert.equal(adminPerms.canEditLineList, true);
  assert.equal(adminPerms.canEditLrvCatalog, true);
  assert.equal(adminPerms.canCreateOrDeleteJoints, true);
  assert.equal(adminPerms.canEditPrepAndWeldingFields, true);
  assert.equal(adminPerms.canEditNdtFields, true);

  assert.equal(canUserEditJointField(adminUser, 'welderStamp'), true);
  assert.equal(canUserEditJointField(adminUser, 'vikResult'), true);
  assert.equal(canUserEditJointField(adminUser, 'ndtResult'), true);
  assert.equal(canUserEditJointField(adminUser, 'dupNdtResult'), true);

  const adminSanitized = enforceFieldLevelRbacOnJointSave(
    existingJoint,
    attemptedFullEdit,
    adminUser
  );
  assert.equal(adminSanitized.welderStamp, 'B999');
  assert.equal(adminSanitized.vikResult, 'Ремонт');
  assert.equal(adminSanitized.ndtResult, 'Вырезать');
  assert.equal(adminSanitized.dupNdtResult, 'Годен');

  // Проверка назначения прав администратора отдельному пользователю (isAdmin: true)
  const promotedUser: UserAccount = {
    login: 'engineer_pto',
    password: '123',
    fullName: 'Инженер ПТО Делегированный',
    role: 'Инженер ПТО / Администратор',
    department: 'ПТО',
    sessionNumber: 55,
    isAdmin: true,
  };
  assert.equal(detectRbacRoleCategory(promotedUser), 'admin');
  const promotedPerms = getUserRolePermissions(promotedUser);
  assert.equal(promotedPerms.category, 'admin');
  assert.equal(promotedPerms.canEditWeldingTech, true);
  assert.equal(promotedPerms.canCreateOrDeleteJoints, true);
  assert.equal(canUserEditJointField(promotedUser, 'vikResult'), true);
  assert.equal(canUserEditJointField(promotedUser, 'welderStamp'), true);

  // 6. Проверка парсинга подготовленного Excel-файла для каталога ЛРВ (parseLrvCatalogRecords)
  const excelLrvRows = [
    {
      'Код ЛРВ': 'ЛРВ-XLS-101',
      'Шифр РД': '0092.049.Р.13/1 0004 УКПГ.045.0077.001-ТХ3',
      'Краткое наименование': 'Труба электросварная 159х8',
      'Материал (Сталь)': 'ст. 09Г2С',
      'НТД (ГОСТ / ТУ)': 'ГОСТ 10704-91',
      'Завод-изготовитель': 'ПАО «ЧТПЗ»',
      'Диаметр Ø1, мм': 159,
      'Толщина стенки S1, мм': 8,
      'Кол-во по спец.': 125,
      'Ед. изм.': 'м',
    },
    {
      'Код ЛРВ': 'ЛРВ-XLS-102',
      'Шифр РД': '0092.049.Р.13/1 0004 УКПГ.045.0077.001-ТХ3',
      'Краткое наименование': 'Переход К 219х10-159х8',
      'Материал (Сталь)': '09Г2С',
      'НТД (ГОСТ / ТУ)': 'ГОСТ 17378-2001',
      'Диаметр Ø1, мм': 219,
      'Толщина стенки S1, мм': 10,
      'Диаметр Ø2, мм': 159,
      'Толщина стенки S2, мм': 8,
      'Кол-во по спец.': 12,
      'Ед. изм.': 'шт',
    },
  ];
  const parsedLrv = parseLrvCatalogRecords(
    excelLrvRows,
    'УКПГ-2В Бованенковское НГКМ',
    '0092.049.Р.13/1 0004 УКПГ.045.0077.001-ТХ3'
  );
  assert.equal(parsedLrv.length, 2);
  assert.equal(parsedLrv[0].lrvCode, 'ЛРВ-XLS-101');
  assert.equal(parsedLrv[0].material, '09Г2С');
  assert.equal(parsedLrv[0].dn1, 150);
  assert.equal(parsedLrv[0].diameterMm2, undefined);
  assert.equal(parsedLrv[0].unit, 'м');
  assert.equal(parsedLrv[1].lrvCode, 'ЛРВ-XLS-102');
  assert.equal(parsedLrv[1].dn1, 200);
  assert.equal(parsedLrv[1].dn2, 150);
  assert.equal(parsedLrv[1].diameterMm2, 159);
  assert.equal(parsedLrv[1].wallThickness2, 8);
});

test('checkNaksCertStatus: корректный расчет статуса аттестации НАКС сварщиков', () => {
  // 1. Не указан срок
  const unknownRes = checkNaksCertStatus(undefined);
  assert.equal(unknownRes.status, 'unknown');
  assert.equal(unknownRes.badgeVariant, 'unknown');

  // 2. Просрочено относительно даты сварки
  const expiredRes = checkNaksCertStatus('2026-04-10', '2026-05-15');
  assert.equal(expiredRes.status, 'expired');
  assert.equal(expiredRes.badgeVariant, 'expired');
  assert.ok((expiredRes.daysRemaining ?? 0) < 0);
  assert.ok(expiredRes.message.includes('Просрочено'));

  // 3. Истекает (осталось <= 30 дней)
  const expiringRes = checkNaksCertStatus('2026-05-20', '2026-05-01');
  assert.equal(expiringRes.status, 'expiring');
  assert.equal(expiringRes.badgeVariant, 'expiring');
  assert.equal(expiringRes.daysRemaining, 19);
  assert.ok(expiringRes.message.includes('Истекает'));

  // 4. Действует (осталось > 30 дней)
  const validRes = checkNaksCertStatus('2027-05-20', '2026-05-01');
  assert.equal(validRes.status, 'valid');
  assert.equal(validRes.badgeVariant, 'valid');
  assert.ok((validRes.daysRemaining ?? 0) > 300);
  assert.ok(validRes.message.includes('Действует'));

  // 5. Проверка формата даты ДД.ММ.ГГ
  const ddmmyyRes = checkNaksCertStatus('20.05.27', '2026-05-01');
  assert.equal(ddmmyyRes.status, 'valid');
});

test('authSecurity: соленое хеширование паролей, криптостойкие сессии и RBAC защита', () => {
  // 1. Хеширование с солью
  const p1 = hashPasswordWithSalt('AdminPass123!');
  assert.ok(p1.hash.length === 64);
  assert.ok(p1.salt.length === 32);

  // 2. Уникальность соли для одинаковых паролей
  const p2 = hashPasswordWithSalt('AdminPass123!');
  assert.notEqual(p1.salt, p2.salt);
  assert.notEqual(p1.hash, p2.hash);

  // 3. Верификация корректного пароля
  assert.equal(verifyPassword('AdminPass123!', p1.hash, p1.salt), true);
  assert.equal(verifyPassword('WrongPass', p1.hash, p1.salt), false);

  // 4. Обратная совместимость с открытыми паролями (миграция со старых версий)
  assert.equal(verifyPassword('123', '123'), true);
  assert.equal(verifyPassword('other', '123'), false);

  // 5. Генерация криптостойких токенов сессий
  const token1 = generateSessionToken();
  const token2 = generateSessionToken();
  assert.ok(token1.startsWith('zsess_'));
  assert.notEqual(token1, token2);

  // 6. Создание и валидация сессии
  const userAcc: UserAccount = {
    login: 'test_admin',
    password: '123',
    fullName: 'Тестовый Администратор',
    role: 'Системный администратор (Полный доступ)',
    department: 'ИТ',
    sessionNumber: 42,
    isAdmin: true,
  };
  const session = createAuthenticatedSession(userAcc, 2);
  assert.equal(session.login, 'test_admin');
  assert.equal(session.isAdmin, true);
  assert.equal(isSessionActive(session), true);

  // Истекшая сессия
  const expiredSession = {
    ...session,
    expiresAt: new Date(Date.now() - 1000).toISOString(),
  };
  assert.equal(isSessionActive(expiredSession), false);
});

test('Категория ЗРА, типы подсоединения (фланцевый/приварной) и форматирование фланцевой ЗРА в журналах', () => {
  // 1. Авто-определение категории «ЗРА» по ключевым словам арматуры
  assert.equal(detectLrvElementType('Кран шаровый DN150 159х8'), 'ЗРА');
  assert.equal(detectLrvElementType('кран DN50'), 'ЗРА');
  assert.equal(detectLrvElementType('Задвижка клиновая DN100'), 'ЗРА');
  assert.equal(detectLrvElementType('Клапан обратный DN50'), 'ЗРА');
  assert.equal(detectLrvElementType('Вентиль запорный игольчатый DN25'), 'ЗРА');
  assert.equal(detectLrvElementType('Фильтр сетчатый фланцевый DN80'), 'ЗРА');
  assert.equal(detectLrvElementType('Переключающее устройство DN50'), 'ЗРА');
  assert.equal(detectLrvElementType('Заслонка поворотная DN150'), 'ЗРА');
  assert.equal(detectLrvElementType('Дисковый затвор DN200'), 'ЗРА');
  assert.equal(detectLrvElementType('Регулятор давления газа DN50'), 'ЗРА');
  assert.equal(detectLrvElementType('Арматура предохранительная'), 'ЗРА');

  // Другие категории не должны классифицироваться как ЗРА
  assert.equal(detectLrvElementType('Труба БШ 159х8'), 'Труба');
  assert.equal(detectLrvElementType('Отвод 90° 159х8'), 'Отвод');
  assert.equal(detectLrvElementType('Фланец воротниковый 159х8'), 'Фланец');
  assert.equal(detectLrvElementType('Заглушка эллиптическая 159х8'), 'Заглушка');

  // 2. Ручное переопределение категории (resolveLrvItemCategory)
  const customItem: LRVItem = {
    id: 'lrv-custom',
    lrvCode: 'ЛРВ-CUSTOM-01',
    rdCode: '0092-TX3',
    objectName: 'Объект-1',
    shortName: 'Нетипичный регулирующий узел',
    category: 'ЗРА',
    connectionType: 'фланцевый',
    material: '09Г2С',
    ntd: 'ТУ 3742-001',
    diameterMm: 57,
    wallThickness: 3.5,
    specQty: 2,
    unit: 'шт',
  };
  assert.equal(resolveLrvItemCategory(customItem), 'ЗРА');
  assert.equal(resolveLrvConnectionType(customItem), 'фланцевый');

  // 3. Авто-определение типа подсоединения ЗРА (фланцевый vs приварной)
  assert.equal(detectLrvConnectionType('Кран шаровый фланцевый DN50'), 'фланцевый');
  assert.equal(detectLrvConnectionType('Задвижка под фланец DN100'), 'фланцевый');
  assert.equal(detectLrvConnectionType('Кран шаровый под приварку DN50'), 'приварной');
  assert.equal(detectLrvConnectionType('Кран шаровый сварной DN50'), 'приварной');
  assert.equal(detectLrvConnectionType('Кран DN50'), 'приварной'); // по умолчанию приварной

  // 4. Форматирование наименования фланцевой ЗРА (formatFlangedZraName)
  assert.equal(formatFlangedZraName('Кран DN50'), 'Фланец крана DN50');
  assert.equal(formatFlangedZraName('кран DN50'), 'фланец крана DN50');
  assert.equal(formatFlangedZraName('Кран шаровый DN50'), 'Фланец крана шарового DN50');
  assert.equal(formatFlangedZraName('Кран шаровый фланцевый DN50'), 'Фланец крана шарового DN50');
  assert.equal(formatFlangedZraName('Задвижка клиновая DN100'), 'Фланец задвижки клиновой DN100');
  assert.equal(formatFlangedZraName('Задвижка DN100'), 'Фланец задвижки DN100');
  assert.equal(formatFlangedZraName('Клапан обратный DN50'), 'Фланец клапана обратного DN50');
  assert.equal(formatFlangedZraName('Клапан DN50'), 'Фланец клапана DN50');
  assert.equal(formatFlangedZraName('Фильтр сетчатый DN80'), 'Фланец фильтра сетчатого DN80');
  assert.equal(formatFlangedZraName('Фильтр DN80'), 'Фланец фильтра DN80');
  assert.equal(
    formatFlangedZraName('Переключающее устройство DN50'),
    'Фланец переключающего устройства DN50'
  );
  // Если слово «Фланец» уже присутствует, не должно быть дублирования
  assert.equal(formatFlangedZraName('Фланец крана DN50'), 'Фланец крана DN50');
  assert.equal(formatFlangedZraName('Фланец воротниковый DN50'), 'Фланец воротниковый DN50');

  // 5. Проверка стыка с фланцевой ЗРА в Журнале сварочных работ СТО Газпром 15-1.1-002-2023 (Графа 8)
  const lrvCatalogWithZra: LRVItem[] = [
    {
      id: 'lrv-flanged-valve',
      lrvCode: 'ЛРВ-ЗРА-01',
      rdCode: '0092.049.Р.13/1 0004 УКПГ.045.0077.001-TX3',
      objectName: 'УКПГ-2В',
      shortName: 'Кран DN50',
      category: 'ЗРА',
      connectionType: 'фланцевый',
      material: '09Г2С',
      ntd: 'ГОСТ 21345-2005',
      manufacturer: 'АО «Тяжпромарматура»',
      dn1: 50,
      diameterMm: 57,
      wallThickness: 3.5,
      specQty: 4,
      unit: 'шт',
    },
    {
      id: 'lrv-welded-valve',
      lrvCode: 'ЛРВ-ЗРА-02',
      rdCode: '0092.049.Р.13/1 0004 УКПГ.045.0077.001-TX3',
      objectName: 'УКПГ-2В',
      shortName: 'Кран DN50',
      category: 'ЗРА',
      connectionType: 'приварной',
      material: '09Г2С',
      ntd: 'ГОСТ 21345-2005',
      manufacturer: 'АО «Тяжпромарматура»',
      dn1: 50,
      diameterMm: 57,
      wallThickness: 3.5,
      specQty: 4,
      unit: 'шт',
    },
  ];

  // Стык с фланцевой ЗРА -> в журнале выводится «Фланец крана DN50»
  const flangedJoint: WeldJoint = {
    ...INITIAL_JOINTS[0],
    id: 'j-flanged-zra',
    jointNumber: '050',
    elem1Name: 'Кран DN50',
    lrv1Code: 'ЛРВ-ЗРА-01',
    elem2Name: 'Труба БШ 57х3.5',
    elem2Material: '09Г2С',
  };

  const stoFlangedRow = formatStoGazpromJournalRow(flangedJoint, 0, lrvCatalogWithZra);
  assert.ok(
    stoFlangedRow.col8.includes('Фланец крана DN50'),
    `Ожидалось «Фланец крана DN50» в графе 8 СТО Газпром, получено: «${stoFlangedRow.col8}»`
  );

  // Стык с приварной ЗРА -> в журнале сохраняется «Кран DN50»
  const weldedJoint: WeldJoint = {
    ...INITIAL_JOINTS[0],
    id: 'j-welded-zra',
    jointNumber: '060',
    elem1Name: 'Кран DN50',
    lrv1Code: 'ЛРВ-ЗРА-02',
    elem2Name: 'Труба БШ 57х3.5',
  };
  const stoWeldedRow = formatStoGazpromJournalRow(weldedJoint, 0, lrvCatalogWithZra);
  assert.ok(
    stoWeldedRow.col8.includes('Кран DN50'),
    `Ожидалось «Кран DN50» в графе 8 СТО Газпром для приварной ЗРА, получено: «${stoWeldedRow.col8}»`
  );
  assert.equal(stoWeldedRow.col8.includes('Фланец крана'), false);

  // 6. Проверка стыка с фланцевой ЗРА в Журнале сварочных работ ГОСТ 32569-2013 (Графа 4)
  const gostFlangedRow = formatGost32569JournalRow(flangedJoint, 0, [], lrvCatalogWithZra);
  assert.ok(
    gostFlangedRow.col4.includes('Фланец крана DN50'),
    `Ожидалось «Фланец крана DN50» в графе 4 ГОСТ 32569, получено: «${gostFlangedRow.col4}»`
  );
});

test('Расчет условных проходов DN [мм], DN [дюймы] и наружных диаметров строго по приложенной таблице', () => {
  // 1. Проверка структуры PIPE_DN_SPEC_TABLE (48 позиций)
  assert.equal(PIPE_DN_SPEC_TABLE.length, 48);

  // 2. Сплошная проверка соответствия Dн [мм] -> DN [мм]
  assert.equal(mmToNominalBoreDn(16), 10);
  assert.equal(mmToNominalBoreDn(20), 15);
  assert.equal(mmToNominalBoreDn(26), 20);
  assert.equal(mmToNominalBoreDn(32), 25);
  assert.equal(mmToNominalBoreDn(42), 32);
  assert.equal(mmToNominalBoreDn(45), 40);
  assert.equal(mmToNominalBoreDn(57), 50);
  assert.equal(mmToNominalBoreDn(76), 65);
  assert.equal(mmToNominalBoreDn(89), 80);
  assert.equal(mmToNominalBoreDn(102), 90);
  assert.equal(mmToNominalBoreDn(108), 100);
  assert.equal(mmToNominalBoreDn(133), 125);
  assert.equal(mmToNominalBoreDn(165), 150);
  assert.equal(mmToNominalBoreDn(180), 160);
  assert.equal(mmToNominalBoreDn(219), 200);
  assert.equal(mmToNominalBoreDn(245), 225);
  assert.equal(mmToNominalBoreDn(273), 250);
  assert.equal(mmToNominalBoreDn(325), 300);
  assert.equal(mmToNominalBoreDn(377), 350);
  assert.equal(mmToNominalBoreDn(426), 400);
  assert.equal(mmToNominalBoreDn(530), 500);
  assert.equal(mmToNominalBoreDn(630), 600);
  assert.equal(mmToNominalBoreDn(720), 700);
  assert.equal(mmToNominalBoreDn(820), 800);
  assert.equal(mmToNominalBoreDn(920), 900);
  assert.equal(mmToNominalBoreDn(1020), 1000);
  assert.equal(mmToNominalBoreDn(1220), 1200);
  assert.equal(mmToNominalBoreDn(1320), 1300);
  assert.equal(mmToNominalBoreDn(1420), 1400);
  assert.equal(mmToNominalBoreDn(1520), 1500);
  assert.equal(mmToNominalBoreDn(1620), 1600);
  assert.equal(mmToNominalBoreDn(1720), 1700);
  assert.equal(mmToNominalBoreDn(1820), 1800);
  assert.equal(mmToNominalBoreDn(1920), 1900);
  assert.equal(mmToNominalBoreDn(2120), 2100);
  assert.equal(mmToNominalBoreDn(2220), 2200);
  assert.equal(mmToNominalBoreDn(2320), 2300);
  assert.equal(mmToNominalBoreDn(2420), 2400);
  assert.equal(mmToNominalBoreDn(2520), 2500);
  assert.equal(mmToNominalBoreDn(2620), 2600);
  assert.equal(mmToNominalBoreDn(2720), 2700);
  assert.equal(mmToNominalBoreDn(2820), 2800);
  assert.equal(mmToNominalBoreDn(2920), 2900);
  assert.equal(mmToNominalBoreDn(3000), 3000);

  // Сохранение поддержки стандартных стальных труб ГОСТ
  assert.equal(mmToNominalBoreDn(159), 150);
  assert.equal(mmToNominalBoreDn(114), 100);
  assert.equal(mmToNominalBoreDn(48.3), 40);

  // 3. Проверка конвертации наружного диаметра в дюйм-диаметр (mmToInchDiameter)
  assert.equal(mmToInchDiameter(16), '3/8"');
  assert.equal(mmToInchDiameter(20), '1/2"');
  assert.equal(mmToInchDiameter(26), '3/4"');
  assert.equal(mmToInchDiameter(32), '1"');
  assert.equal(mmToInchDiameter(42), '1 1/4"');
  assert.equal(mmToInchDiameter(45), '1 1/2"');
  assert.equal(mmToInchDiameter(57), '2"');
  assert.equal(mmToInchDiameter(76), '2 1/2"');
  assert.equal(mmToInchDiameter(89), '3"');
  assert.equal(mmToInchDiameter(102), '3 1/2"');
  assert.equal(mmToInchDiameter(108), '4"');
  assert.equal(mmToInchDiameter(133), '5"');
  assert.equal(mmToInchDiameter(165), '6"');
  assert.equal(mmToInchDiameter(180), '6 1/2"');
  assert.equal(mmToInchDiameter(219), '8"');
  assert.equal(mmToInchDiameter(245), '9"');
  assert.equal(mmToInchDiameter(273), '10"');
  assert.equal(mmToInchDiameter(325), '12"');
  assert.equal(mmToInchDiameter(377), '14"');
  assert.equal(mmToInchDiameter(426), '16"');
  assert.equal(mmToInchDiameter(530), '20"');
  assert.equal(mmToInchDiameter(630), '24"');
  assert.equal(mmToInchDiameter(720), '28"');
  assert.equal(mmToInchDiameter(820), '32"');
  assert.equal(mmToInchDiameter(920), '36"');
  assert.equal(mmToInchDiameter(1020), '40"');
  assert.equal(mmToInchDiameter(1220), '48"');
  assert.equal(mmToInchDiameter(1320), '52"');
  assert.equal(mmToInchDiameter(1420), '56"');
  assert.equal(mmToInchDiameter(1520), '60"');
  assert.equal(mmToInchDiameter(1620), '64"');
  assert.equal(mmToInchDiameter(1720), '68"');
  assert.equal(mmToInchDiameter(1820), '72"');
  assert.equal(mmToInchDiameter(1920), '76"');
  assert.equal(mmToInchDiameter(2120), '88"');
  assert.equal(mmToInchDiameter(159), '6"');

  // 4. Проверка прямого перевода DN [мм] в дюйм-диаметр (dnToInchDiameter)
  assert.equal(dnToInchDiameter(10), '3/8"');
  assert.equal(dnToInchDiameter(15), '1/2"');
  assert.equal(dnToInchDiameter(20), '3/4"');
  assert.equal(dnToInchDiameter(25), '1"');
  assert.equal(dnToInchDiameter(32), '1 1/4"');
  assert.equal(dnToInchDiameter(40), '1 1/2"');
  assert.equal(dnToInchDiameter(50), '2"');
  assert.equal(dnToInchDiameter(65), '2 1/2"');
  assert.equal(dnToInchDiameter(80), '3"');
  assert.equal(dnToInchDiameter(90), '3 1/2"');
  assert.equal(dnToInchDiameter(100), '4"');
  assert.equal(dnToInchDiameter(125), '5"');
  assert.equal(dnToInchDiameter(150), '6"');
  assert.equal(dnToInchDiameter(160), '6 1/2"');
  assert.equal(dnToInchDiameter(175), '7"');
  assert.equal(dnToInchDiameter(200), '8"');
  assert.equal(dnToInchDiameter(225), '9"');
  assert.equal(dnToInchDiameter(250), '10"');
  assert.equal(dnToInchDiameter(300), '12"');
  assert.equal(dnToInchDiameter(350), '14"');
  assert.equal(dnToInchDiameter(400), '16"');
  assert.equal(dnToInchDiameter(450), '18"');
  assert.equal(dnToInchDiameter(500), '20"');
  assert.equal(dnToInchDiameter(600), '24"');
  assert.equal(dnToInchDiameter(700), '28"');
  assert.equal(dnToInchDiameter(800), '32"');
  assert.equal(dnToInchDiameter(900), '36"');
  assert.equal(dnToInchDiameter(1000), '40"');
  assert.equal(dnToInchDiameter(1100), '44"');
  assert.equal(dnToInchDiameter(1200), '48"');
  assert.equal(dnToInchDiameter(1300), '52"');
  assert.equal(dnToInchDiameter(1400), '56"');
  assert.equal(dnToInchDiameter(1500), '60"');
  assert.equal(dnToInchDiameter(1600), '64"');
  assert.equal(dnToInchDiameter(1700), '68"');
  assert.equal(dnToInchDiameter(1800), '72"');
  assert.equal(dnToInchDiameter(1900), '76"');
  assert.equal(dnToInchDiameter(2000), '80"');
  assert.equal(dnToInchDiameter(2100), '88"');

  // 5. Проверка dnToOuterDiameterMm
  assert.equal(dnToOuterDiameterMm(10), 16);
  assert.equal(dnToOuterDiameterMm(50), 57);
  assert.equal(dnToOuterDiameterMm(150), 165);
  assert.equal(dnToOuterDiameterMm(300), 325);
  assert.equal(dnToOuterDiameterMm(175), undefined);
});

test('Эквивалентные дюймы (Метод А / EDI): расчет коэффициента Ктолщ, дюйм-диаметров и сводной готовности по эквивалентным дюймам', () => {
  // 1. Проверка ступенчатой шкалы Ктолщ по Методу А
  assert.equal(getEpcWallThicknessFactor(6.0), 1.0);
  assert.equal(getEpcWallThicknessFactor(10.0), 1.0);
  assert.equal(getEpcWallThicknessFactor(10.1), 1.35);
  assert.equal(getEpcWallThicknessFactor(12.0), 1.35);
  assert.equal(getEpcWallThicknessFactor(15.0), 1.35);
  assert.equal(getEpcWallThicknessFactor(15.1), 1.75);
  assert.equal(getEpcWallThicknessFactor(18.0), 1.75);
  assert.equal(getEpcWallThicknessFactor(20.0), 1.75);
  assert.equal(getEpcWallThicknessFactor(20.1), 2.3);
  assert.equal(getEpcWallThicknessFactor(24.0), 2.3);
  assert.equal(getEpcWallThicknessFactor(26.0), 2.3);
  assert.equal(getEpcWallThicknessFactor(26.1), 2.8);
  assert.equal(getEpcWallThicknessFactor(32.0), 2.8);
  assert.equal(getEpcWallThicknessFactor(35.0), 2.8);
  assert.equal(getEpcWallThicknessFactor(35.1), 3.5);
  assert.equal(getEpcWallThicknessFactor(45.0), 3.5);
  assert.equal(getEpcWallThicknessFactor(50.0), 3.5);
  assert.equal(getEpcWallThicknessFactor(50.1), 4.5);
  assert.equal(getEpcWallThicknessFactor(65.0), 4.5);

  // 2. Проверка парсинга строковых дюймов (inchStringToNumeric)
  assert.equal(inchStringToNumeric('3/8"'), 0.375);
  assert.equal(inchStringToNumeric('1/2"'), 0.5);
  assert.equal(inchStringToNumeric('3/4"'), 0.75);
  assert.equal(inchStringToNumeric('1"'), 1.0);
  assert.equal(inchStringToNumeric('1 1/4"'), 1.25);
  assert.equal(inchStringToNumeric('1 1/2"'), 1.5);
  assert.equal(inchStringToNumeric('2"'), 2.0);
  assert.equal(inchStringToNumeric('2 1/2"'), 2.5);
  assert.equal(inchStringToNumeric('3"'), 3.0);
  assert.equal(inchStringToNumeric('3 1/2"'), 3.5);
  assert.equal(inchStringToNumeric('4"'), 4.0);
  assert.equal(inchStringToNumeric('6"'), 6.0);
  assert.equal(inchStringToNumeric('6 1/2"'), 6.5);
  assert.equal(inchStringToNumeric('8"'), 8.0);
  assert.equal(inchStringToNumeric('12"'), 12.0);
  assert.equal(inchStringToNumeric('24"'), 24.0);
  assert.equal(inchStringToNumeric('56"'), 56.0);
  assert.equal(inchStringToNumeric('88"'), 88.0);

  // 3. Проверка mmToNumericInchDiameter
  assert.equal(mmToNumericInchDiameter(16), 0.375); // DN 10
  assert.equal(mmToNumericInchDiameter(20), 0.5);   // DN 15
  assert.equal(mmToNumericInchDiameter(26), 0.75);  // DN 20
  assert.equal(mmToNumericInchDiameter(32), 1.0);   // DN 25
  assert.equal(mmToNumericInchDiameter(42), 1.25);  // DN 32
  assert.equal(mmToNumericInchDiameter(45), 1.5);   // DN 40
  assert.equal(mmToNumericInchDiameter(57), 2.0);   // DN 50
  assert.equal(mmToNumericInchDiameter(76), 2.5);   // DN 65
  assert.equal(mmToNumericInchDiameter(89), 3.0);   // DN 80
  assert.equal(mmToNumericInchDiameter(102), 3.5);  // DN 90
  assert.equal(mmToNumericInchDiameter(108), 4.0);  // DN 100
  assert.equal(mmToNumericInchDiameter(133), 5.0);  // DN 125
  assert.equal(mmToNumericInchDiameter(159), 6.0);  // DN 150
  assert.equal(mmToNumericInchDiameter(165), 6.0);  // DN 150
  assert.equal(mmToNumericInchDiameter(180), 6.5);  // DN 160
  assert.equal(mmToNumericInchDiameter(219), 8.0);  // DN 200
  assert.equal(mmToNumericInchDiameter(325), 12.0); // DN 300
  assert.equal(mmToNumericInchDiameter(530), 20.0); // DN 500
  assert.equal(mmToNumericInchDiameter(1420), 56.0);// DN 1400

  // 4. Проверка точного расчета эквивалентных дюймов по формуле Метод А: EDI = D_inch * Ктолщ(S)
  // Ø159x8 (6" * 1.0) -> 6.0 EDI
  assert.equal(calculateEquivalentDiaInch(159, 8.0), 6.0);
  // Ø159x12 (6" * 1.35) -> 8.1 EDI
  assert.equal(calculateEquivalentDiaInch(159, 12.0), 8.1);
  // Ø219x18 (8" * 1.75) -> 14.0 EDI
  assert.equal(calculateEquivalentDiaInch(219, 18.0), 14.0);
  // Ø325x22 (12" * 2.30) -> 27.6 EDI
  assert.equal(calculateEquivalentDiaInch(325, 22.0), 27.6);
  // Ø530x28 (20" * 2.80) -> 56.0 EDI
  assert.equal(calculateEquivalentDiaInch(530, 28.0), 56.0);
  // Ø1020x40 (40" * 3.50) -> 140.0 EDI
  assert.equal(calculateEquivalentDiaInch(1020, 40.0), 140.0);
  // Ø1420x52 (56" * 4.50) -> 252.0 EDI
  assert.equal(calculateEquivalentDiaInch(1420, 52.0), 252.0);

  // Передача строки в calculateEquivalentDiaInch
  assert.equal(calculateEquivalentDiaInch('6"', 12.0), 8.1);
  assert.equal(calculateEquivalentDiaInch('2 1/2"', 14.0), 3.38); // 2.5 * 1.35 = 3.375 -> 3.38

  // 5. Проверка наличия столбца equivDiameterInch в ALL_COLUMNS
  const ediCol = ALL_COLUMNS.find((c) => c.key === 'equivDiameterInch');
  assert.ok(ediCol, 'Столбец equivDiameterInch должен присутствовать в ALL_COLUMNS');
  assert.equal(ediCol?.label, 'Экв. дюйм (EDI)');
  assert.equal(ediCol?.isNumeric, true);

  // 6. Проверка расчета готовности по эквивалентным дюймам в calculateReadinessReport
  const sampleJoints: WeldJoint[] = [
    {
      ...INITIAL_JOINTS[0],
      id: 'test-j-edi-1',
      jointNumber: '010',
      diameterMm: 159,
      diameterInch: '6"',
      wallThickness: 12.0, // 6" * 1.35 = 8.1 EDI
      weldingDate: '2026-10-12',
      welderStamp: 'А142',
    },
    {
      ...INITIAL_JOINTS[0],
      id: 'test-j-edi-2',
      jointNumber: '020',
      diameterMm: 219,
      diameterInch: '8"',
      wallThickness: 8.0, // 8" * 1.0 = 8.0 EDI
      weldingDate: '', // не заварен
      welderStamp: '',
    },
  ];

  const report = calculateReadinessReport(sampleJoints, 'rdCode');
  assert.equal(report.length, 1);
  const row = report[0];
  // Всего: 8.1 + 8.0 = 16.1 EDI
  assert.equal(row.totalEquivInches, 16.1);
  // Заварено: 8.1 EDI
  assert.equal(row.weldedEquivInches, 8.1);
  // Процент сварки по EDI: 8.1 / 16.1 * 100 = 50.31% -> 50%
  assert.equal(row.equivWeldingPct, 50);
  // Номинальные дюймы: 6 + 8 = 14
  assert.equal(row.totalNominalInches, 14);
});

test('Специализированные графы контроля после ремонта дефектных стыков (СТО Газпром графы 32–48, ALL_COLUMNS, RBAC)', () => {
  // 1. Проверка наличия специализированных колонок ремонта в ALL_COLUMNS
  const repairActionCol = ALL_COLUMNS.find((c) => c.key === 'repairAction');
  const repairDateCol = ALL_COLUMNS.find((c) => c.key === 'repairDate');
  const repairTechCardCol = ALL_COLUMNS.find((c) => c.key === 'repairTechCard');
  const repairWelderCol = ALL_COLUMNS.find((c) => c.key === 'repairWelderStamp');
  const repairForemanCol = ALL_COLUMNS.find((c) => c.key === 'repairForeman');
  const repairVikResultCol = ALL_COLUMNS.find((c) => c.key === 'repairVikResult');
  const repairVikDateCol = ALL_COLUMNS.find((c) => c.key === 'repairVikDate');
  const repairNdtTypeCol = ALL_COLUMNS.find((c) => c.key === 'repairNdtType');
  const repairNdtResultCol = ALL_COLUMNS.find((c) => c.key === 'repairNdtResult');
  const repairNdtDateCol = ALL_COLUMNS.find((c) => c.key === 'repairNdtDate');

  assert.ok(repairActionCol, 'Столбец repairAction должен быть в ALL_COLUMNS');
  assert.equal(repairActionCol?.group, 'repair');
  assert.ok(repairDateCol?.isNumeric, 'Столбец repairDate должен быть numeric');
  assert.ok(repairTechCardCol, 'Столбец repairTechCard должен быть в ALL_COLUMNS');
  assert.ok(repairWelderCol, 'Столбец repairWelderStamp должен быть в ALL_COLUMNS');
  assert.ok(repairForemanCol, 'Столбец repairForeman должен быть в ALL_COLUMNS');

  assert.ok(repairVikResultCol, 'Столбец repairVikResult должен быть в ALL_COLUMNS');
  assert.equal(repairVikResultCol?.group, 'repair_ndt');
  assert.ok(repairNdtTypeCol, 'Столбец repairNdtType должен быть в ALL_COLUMNS');
  assert.ok(repairNdtResultCol, 'Столбец repairNdtResult должен быть в ALL_COLUMNS');
  assert.ok(repairNdtDateCol, 'Столбец repairNdtDate должен быть в ALL_COLUMNS');

  // 2. Тестовый стык с дефектом по РК и последующим устранением и переконтролем
  const defectiveAndRepairedJoint: WeldJoint = {
    ...INITIAL_JOINTS[0],
    id: 'j-defect-repair-spec',
    jointNumber: '088',
    weldingDate: '2026-10-10',
    welderStamp: 'А142',
    responsiblePerson: 'Мастер СМР Громов И.А.',
    techCardNumber: 'ТК-045-РАД/РД-01',
    // Первичный контроль
    vikResult: 'Годен',
    vikDate: '2026-10-11',
    vikInspector: 'Кузнецова Е.В.',
    ndtType: 'РК',
    ndtResult: 'Ремонт', // Дефект!
    ndtDate: '2026-10-12',
    ndtInspector: 'Лебедев С.А.',
    // Первичный контроль: РК выявил брак (Ремонт).
    // По отраслевому регламенту при первичном браке дублирующий контроль первичного шва не проводится!
    dupNdtType: 'Не требуется',
    dupNdtDate: '',
    dupNdtResult: 'Не проводился',
    dupNdtInspector: '',
    // Специализированные графы устранения дефекта (графы 32–37)
    repairAction: 'Ремонт',
    repairDate: '2026-10-14',
    repairTechCard: 'ТК-045-РАД/РД-01-Р',
    repairWelderStamp: 'Б105',
    repairForeman: 'Тимофеев В.П.',
    // Специализированные графы контроля после ремонта (графы 38–48)
    repairVikNumber: 'ВИК-Р-088',
    repairVikDate: '2026-10-15',
    repairVikResult: 'Годен',
    repairVikInspector: 'Кузнецова Е.В.',
    repairNdtType: 'РК',
    repairNdtNumber: 'РК-Р-088',
    repairNdtDate: '2026-10-16',
    repairNdtResult: 'Годен',
    repairNdtInspector: 'Лебедев С.А.',
    repairDupNdtType: 'УЗК',
    repairDupNdtNumber: 'УЗК-РД-088',
    repairDupNdtDate: '2026-10-16',
    repairDupNdtResult: 'Годен',
    repairDupNdtInspector: 'Лебедев С.А.',
  };

  // Проверка предикатов дефектности и готовности
  assert.equal(isJointDefective(defectiveAndRepairedJoint), true, 'Стык должен квалифицироваться как дефектный');
  assert.equal(isJointFullyAccepted(defectiveAndRepairedJoint), true, 'После успешного переконтроля стык должен быть полностью принят');
  assert.equal(isJointCurrentlyInRepair(defectiveAndRepairedJoint), false, 'Ремонт должен быть закрыт');

  // Если убрать положительный переконтроль, стык снова должен стать незакрытым ремонтом
  const pendingRepairJoint: WeldJoint = {
    ...defectiveAndRepairedJoint,
    repairVikResult: 'В работе',
    repairNdtResult: 'Не проводился',
  };
  assert.equal(isJointCurrentlyInRepair(pendingRepairJoint), true, 'Стык с незавершенным переконтролем должен быть в ремонте');
  assert.equal(isJointFullyAccepted(pendingRepairJoint), false);

  // 3. Формирование строки СТО Газпром (49 граф)
  const stoRow = formatStoGazpromJournalRow(defectiveAndRepairedJoint, 0, INITIAL_LRV_CATALOG);

  // Графы 24–27: Первичный НК (РК, Ремонт)
  assert.equal(stoRow.col24, 'РК');
  assert.equal(stoRow.col27, 'Ремонт');

  // Графы 28–31: Первичный дублирующий контроль при браке первичного контроля НЕ проводится ("н/п")
  assert.equal(stoRow.col28, 'н/п');
  assert.equal(stoRow.col29, 'н/п');
  assert.equal(stoRow.col30, 'н/п');
  assert.equal(stoRow.col31, 'н/п');

  // Графы 32–37: Сведения о проведении ремонта
  assert.equal(stoRow.col32, 'Ремонт');
  assert.equal(stoRow.col33, '14.10.26');
  assert.equal(stoRow.col34, 'ТК-045-РАД/РД-01-Р');
  assert.equal(stoRow.col35, 'Б105');
  assert.equal(stoRow.col36, 'Тимофеев');
  assert.equal(stoRow.col37, ''); // пустая ячейка под роспись

  // Графы 38–40: ВИК после ремонта
  assert.equal(stoRow.col38, 'ВИК-Р-088');
  assert.equal(stoRow.col39, '15.10.26');
  assert.equal(stoRow.col40, 'Годен');

  // Графы 41–44: НК (основной) после ремонта
  assert.equal(stoRow.col41, 'РК');
  assert.equal(stoRow.col42, 'РК-Р-088');
  assert.equal(stoRow.col43, '16.10.26');
  assert.equal(stoRow.col44, 'Годен');

  // Графы 45–48: НК (дублирующий) после ремонта
  assert.equal(stoRow.col45, 'УЗК');
  assert.equal(stoRow.col46, 'УЗК-РД-088');
  assert.equal(stoRow.col47, '16.10.26');
  assert.equal(stoRow.col48, 'Годен');

  // 4. Проверка ролевой изоляции RBAC
  const ptoUser: UserAccount = {
    login: 'pto_ivanov',
    fullName: 'Иванов Иван Иванович',
    role: 'Инженер ПТО',
    department: 'ПТО',
    password: '',
    passwordHash: '',
    sessionNumber: 1,
  };
  const ndtUser: UserAccount = {
    login: 'ndt_petrov',
    fullName: 'Петров Петр Петрович',
    role: 'Специалист ЛНК',
    department: 'ЛНК',
    password: '',
    passwordHash: '',
    sessionNumber: 1,
  };

  // ПТО может вносить сведения о ремонте (32–37)
  assert.equal(canUserEditJointField(ptoUser, 'repairAction'), true);
  assert.equal(canUserEditJointField(ptoUser, 'repairDate'), true);
  assert.equal(canUserEditJointField(ptoUser, 'repairTechCard'), true);
  assert.equal(canUserEditJointField(ptoUser, 'repairWelderStamp'), true);
  assert.equal(canUserEditJointField(ptoUser, 'repairForeman'), true);

  // ПТО ЗАБЛОКИРОВАН от внесения результатов контроля после ремонта (38–48)
  assert.equal(canUserEditJointField(ptoUser, 'repairVikResult'), false);
  assert.equal(canUserEditJointField(ptoUser, 'repairNdtResult'), false);
  assert.equal(canUserEditJointField(ptoUser, 'repairDupNdtResult'), false);

  // ЛНК МОЖЕТ вносить результаты контроля после ремонта (38–48)
  assert.equal(canUserEditJointField(ndtUser, 'repairVikResult'), true);
  assert.equal(canUserEditJointField(ndtUser, 'repairNdtResult'), true);
  assert.equal(canUserEditJointField(ndtUser, 'repairDupNdtResult'), true);

  // ЛНК ЗАБЛОКИРОВАН от внесения сведений о ремонте (32–37)
  assert.equal(canUserEditJointField(ndtUser, 'repairAction'), false);
  assert.equal(canUserEditJointField(ndtUser, 'repairTechCard'), false);

  // 5. Проверка санитизации через sanitizeWeldJointRecord
  const sanitized = sanitizeWeldJointRecord(defectiveAndRepairedJoint);
  assert.equal(sanitized.repairAction, 'Ремонт');
  assert.equal(sanitized.repairDate, '2026-10-14');
  assert.equal(sanitized.repairTechCard, 'ТК-045-РАД/РД-01-Р');
  assert.equal(sanitized.repairVikResult, 'Годен');
  assert.equal(sanitized.repairNdtResult, 'Годен');
});

test('Отраслевые постулаты сварочно-монтажного производства: каскадный подбор ЛРВ, права admin на ЛРВ, индекс Р только в журналах, угловые врезки и автоподбор ТК', () => {
  // 1. Каскадный подбор элементов ЛРВ (Тип -> Типоразмер Ø×S -> Изделие ЛРВ)
  const sampleLrv: LRVItem[] = [
    {
      id: 'lrv-1',
      lrvCode: '101',
      objectName: 'УКПГ-1',
      rdCode: '001/2026-ТХ',
      shortName: 'Труба 219х8 09Г2С',
      material: '09Г2С',
      diameterMm: 219,
      wallThickness: 8,
      ntd: 'ГОСТ 8732-78',
      manufacturer: 'ПАО ЧТПЗ',
      specQty: 100,
      unit: 'м',
    },
    {
      id: 'lrv-2',
      lrvCode: '102',
      objectName: 'УКПГ-1',
      rdCode: '001/2026-ТХ',
      shortName: 'Труба 219х8 20',
      material: '20',
      diameterMm: 219,
      wallThickness: 8,
      ntd: 'ГОСТ 8732-78',
      manufacturer: 'ПНТЗ',
      specQty: 100,
      unit: 'м',
    },
    {
      id: 'lrv-3',
      lrvCode: '103',
      objectName: 'УКПГ-1',
      rdCode: '001/2026-ТХ',
      shortName: 'Отвод 90° 219х8 09Г2С',
      material: '09Г2С',
      diameterMm: 219,
      wallThickness: 8,
      ntd: 'ГОСТ 17375-2001',
      manufacturer: 'АО СОТ',
      specQty: 10,
      unit: 'шт',
    },
    {
      id: 'lrv-4',
      lrvCode: '104',
      objectName: 'УКПГ-1',
      rdCode: '001/2026-ТХ',
      shortName: 'Труба 57х3.5 20',
      material: '20',
      diameterMm: 57,
      wallThickness: 3.5,
      ntd: 'ГОСТ 8734-75',
      manufacturer: 'ПНТЗ',
      specQty: 50,
      unit: 'м',
    },
  ];

  // Шаг 1: Получение доступных типоразмеров для типа 'Труба'
  const pipeSizes = getAvailableSizesFromLrv(sampleLrv, 'Труба');
  assert.equal(pipeSizes.length, 2);
  assert.equal(pipeSizes[0].label, 'Ø57 × 3.5 мм');
  assert.equal(pipeSizes[1].label, 'Ø219 × 8 мм');

  // Шаг 2: Фильтрация по типу 'Труба' и типоразмеру '219x8'
  const filteredPipes = searchLrvCatalogItems(sampleLrv, '', 'Труба', '219x8');
  assert.equal(filteredPipes.length, 2);
  assert.ok(filteredPipes.every((p) => p.diameterMm === 219 && p.wallThickness === 8));

  // Шаг 3: Прямой поиск по коду ЛРВ
  const directMatch = searchLrvCatalogItems(sampleLrv, '103', 'Все типы');
  assert.equal(directMatch.length, 1);
  assert.equal(directMatch[0].lrvCode, '103');

  // 2. Ролевое разграничение: редактирование ЛРВ строго для admin (ПТО - только чтение)
  const adminUser: UserAccount = {
    login: 'admin',
    password: '123',
    fullName: 'Главный Администратор',
    role: 'Администратор системы',
    department: 'Администрация',
    sessionNumber: 1,
  };
  const ptoUser: UserAccount = {
    login: 'pto',
    password: '123',
    fullName: 'Инженер ПТО',
    role: 'Инженер ПТО',
    department: 'ПТО',
    sessionNumber: 1,
  };
  assert.equal(getUserRolePermissions(adminUser).canEditLrvCatalog, true);
  assert.equal(getUserRolePermissions(ptoUser).canEditLrvCatalog, false);

  // 3. Индекс «Р» для ремонта: добавляется ТОЛЬКО в граф. 2 ГОСТ и граф. 14 СТО Газпром.
  // В базе/паспорте номер стыка остаётся базовым (напр. 010).
  const repairedJoint: WeldJoint = {
    ...INITIAL_JOINTS[0],
    id: 'wj-rep-1',
    objectName: 'УКПГ-1',
    rdCode: '001/2026-ТХ',
    lineNumber: 'ФП1.2/1',
    jointNumber: '010',
    jointKind: 'Стыковое',
    gostJointType: 'С17',
    diameterMm: 219,
    wallThickness: 8,
    weldingType: 'РАД+РД',
    welderStamp: '01',
    weldingDate: '2026-06-15',
    elem1Name: 'Труба 219х8',
    elem1Material: '09Г2С',
    elem2Name: 'Отвод 219х8',
    elem2Material: '09Г2С',
    repairAction: 'Ремонт',
    repairDate: '2026-06-18',
    repairVikResult: 'Годен',
    repairNdtResult: 'Годен',
  };

  assert.equal(repairedJoint.jointNumber, '010', 'В паспорте и реестре номер стыка чистый (010)');
  assert.equal(isJointRepaired(repairedJoint), true);

  const gostRow = formatGost32569JournalRow(repairedJoint, 0, []);
  assert.equal(gostRow.col2, '010Р, С17', 'В графе 2 ГОСТ 32569-2013 номер стыка получает суффикс Р');

  const stoRow = formatStoGazpromJournalRow(repairedJoint, 0, sampleLrv);
  assert.equal(stoRow.col13, '010', 'В графе 13 СТО Газпром номер стыка остаётся базовым (010)');
  assert.equal(stoRow.col14, 'Р', 'В графе 14 СТО Газпром проставляется индекс Р для отремонтированного шва');

  // 4. Радиопереключатель «Стыковое / Угловое»:
  // Для 'Стыковое' разные диаметры недопустимы
  const buttMatch = validateElementsDiameterMatch(219, 57, 'Стыковое');
  assert.equal(buttMatch.isMatch, false);

  // Для 'Угловое' разные диаметры допустимы (врезка)
  const angularMatch = validateElementsDiameterMatch(219, 57, 'Угловое');
  assert.equal(angularMatch.isMatch, true);
  assert.ok(angularMatch.message.includes('Угловое соединение (врезка)'));

  // 5. Автоматический подбор технологической карты
  const sampleTechCards: TechCardItem[] = [
    {
      id: 'tc-1',
      number: 'ТК-01-219',
      title: 'Сварка 219',
      ntd: 'ГОСТ 16037-80',
      weldingType: 'РАД+РД',
      steelGroup: '09Г2С',
      minDiameterMm: 159,
      maxDiameterMm: 325,
      minWallThicknessMm: 6,
      maxWallThicknessMm: 12,
      recommendedMaterials: 'Св-08Г2С, УОНИ-13/55',
      preheatRules: [],
    },
    {
      id: 'tc-2',
      number: 'ТК-02-57',
      title: 'Сварка 57',
      ntd: 'ГОСТ 16037-80',
      weldingType: 'РАД',
      steelGroup: '20',
      minDiameterMm: 32,
      maxDiameterMm: 89,
      minWallThicknessMm: 2,
      maxWallThicknessMm: 5,
      recommendedMaterials: 'Св-08Г2С',
      preheatRules: [],
    },
  ];

  const matchedTc = findMatchingTechCard(sampleTechCards, {
    diameterMm: 219,
    wallThicknessMm: 8,
    weldingType: 'РАД+РД',
    steelGrade: '09Г2С',
  });
  assert.ok(matchedTc);
  assert.equal(matchedTc?.number, 'ТК-01-219');
});

test('Отраслевые правила п.1 и п.2: мягкое аннулирование ЛРВ (soft-delete) и запрет второго ремонта (Правило 1 ремонта)', () => {
  // 1. Проверка мягкого аннулирования позиций ЛРВ
  const lrv1: LRVItem = {
    id: 'lrv-pipe-01',
    lrvCode: 'P-01',
    objectName: 'УКПГ-1',
    rdCode: '001/2026-ТХ',
    shortName: 'Труба 219х8 09Г2С',
    material: '09Г2С',
    diameterMm: 219,
    wallThickness: 8,
    ntd: 'ГОСТ 8732-78',
    specQty: 100,
    unit: 'м',
  };
  const lrv2Unused: LRVItem = {
    id: 'lrv-pipe-02',
    lrvCode: 'P-02',
    objectName: 'УКПГ-1',
    rdCode: '001/2026-ТХ',
    shortName: 'Труба 57х3.5 20',
    material: '20',
    diameterMm: 57,
    wallThickness: 3.5,
    ntd: 'ГОСТ 8734-75',
    specQty: 50,
    unit: 'м',
  };

  const activeJoint: WeldJoint = {
    ...INITIAL_JOINTS[0],
    id: 'wj-100',
    objectName: 'УКПГ-1',
    rdCode: '001/2026-ТХ',
    lineNumber: 'ФП1.2/1',
    jointNumber: '010',
    lrv1Code: 'P-01',
    lrv2Code: 'P-01',
    diameterMm: 219,
    wallThickness: 8,
    weldingType: 'РАД+РД',
    welderStamp: '01',
    weldingDate: '2026-06-15',
    elem1Name: 'Труба 219х8',
    elem1Material: '09Г2С',
    elem2Name: 'Труба 219х8',
    elem2Material: '09Г2С',
    updatedAt: new Date().toISOString(),
    updatedBy: 'Инженер',
  };

  const testJoints = [activeJoint];

  // P-01 привязана к стыку wj-100
  assert.equal(isLrvItemUsedInJoints(lrv1, testJoints), true);
  assert.equal(getJointsUsingLrvItem(lrv1, testJoints).length, 1);
  assert.equal(getJointsUsingLrvItem(lrv1, testJoints)[0].id, 'wj-100');

  // P-02 НЕ привязана ни к одному стыку
  assert.equal(isLrvItemUsedInJoints(lrv2Unused, testJoints), false);
  assert.equal(getJointsUsingLrvItem(lrv2Unused, testJoints).length, 0);

  // Аннулирование позиции ЛРВ (пересогласование материала)
  const supersededLrv: LRVItem = {
    ...lrv1,
    status: 'superseded',
    replacementLetter: 'Письмо № 142/ПТО от 15.08.2026',
    replacementDate: '2026-08-15',
  };

  // По умолчанию searchLrvCatalogItems исключает аннулированные позиции
  const catalogList = [supersededLrv, lrv2Unused];
  const activeSearchResults = searchLrvCatalogItems(catalogList, '', 'Все типы', 'all', false);
  assert.equal(activeSearchResults.length, 1);
  assert.equal(activeSearchResults[0].lrvCode, 'P-02');

  // Если явно запросить со статусом superseded, она находится
  const allSearchResults = searchLrvCatalogItems(catalogList, '', 'Все типы', 'all', true);
  assert.equal(allSearchResults.length, 2);

  // 2. Правило 1 ремонта: запрет второго ремонта (СТО Газпром, ГОСТ 32569)
  const firstRepairedJoint: WeldJoint = {
    ...INITIAL_JOINTS[0],
    id: 'wj-200',
    objectName: 'УКПГ-1',
    rdCode: '001/2026-ТХ',
    lineNumber: 'ФП1.2/1',
    jointNumber: '020',
    diameterMm: 219,
    wallThickness: 8,
    weldingType: 'РАД+РД',
    welderStamp: '01',
    weldingDate: '2026-06-15',
    elem1Name: 'Труба 219х8',
    elem1Material: '09Г2С',
    elem2Name: 'Труба 219х8',
    elem2Material: '09Г2С',
    vikResult: 'Годен',
    ndtResult: 'Ремонт',
    repairAction: 'Ремонт',
    repairDate: '2026-06-18',
    repairTechCard: 'ТК-01-Р',
    repairWelderStamp: '01',
    repairForeman: 'Громов',
    repairVikResult: 'Годен',
    repairNdtResult: 'Годен',
    updatedAt: new Date().toISOString(),
    updatedBy: 'ЛНК',
  };

  // После первого успешного ремонта второй ремонт не запрещен, т.к. дефекта нет
  assert.equal(isSecondRepairForbidden(firstRepairedJoint), false);

  // Если контроль после ремонта выявил дефект (Брак / Вырезать)
  const failedSecondJoint: WeldJoint = {
    ...firstRepairedJoint,
    repairNdtResult: 'Вырезать',
  };

  // Повторный ремонт категорически запрещён!
  assert.equal(isSecondRepairForbidden(failedSecondJoint), true);

  // Валидатор целостности должен выдать ошибку, если стык не переведен в «Вырезать»
  const invalidValidation = validateWeldJointComprehensive({
    joint: { ...failedSecondJoint, repairAction: 'Ремонт' },
    allJoints: [],
    projectLineList: [],
    lrvCatalog: [],
    welders: [],
    techCards: [],
    weldingMaterials: [],
  });
  assert.ok(
    invalidValidation.errors.some(
      (err) => err.id === 'ndt-second-repair-forbidden'
    ),
    'Должна быть ошибка ndt-second-repair-forbidden при попытке оставить статус Ремонт'
  );

  // Если статус переведен в «Вырезать» / «Вырезано», валидация правила 1 ремонта проходит
  const validCutValidation = validateWeldJointComprehensive({
    joint: { ...failedSecondJoint, repairAction: 'Вырезано' },
    allJoints: [],
    projectLineList: [],
    lrvCatalog: [],
    welders: [],
    techCards: [],
    weldingMaterials: [],
  });
  assert.ok(
    !validCutValidation.errors.some(
      (err) => err.id === 'ndt-second-repair-forbidden'
    ),
    'Ошибка ndt-second-repair-forbidden должна отсутствовать при статусе Вырезать'
  );
});

test('Sprint 1: Серверная безопасность, криптостойкие сессии, UPSERT и расширенный аудит-лог', async () => {
  const {
    hashPasswordWithSalt: serverHash,
    verifyPassword: serverVerify,
    timingSafeCompare,
    createAuthenticatedSession: serverCreateSession,
    isSessionActive: serverIsActive,
  } = await import('../server/serverAuth');

  // 1. Серверное соленое хеширование и timing-safe сравнение через node:crypto
  const serverP1 = serverHash('Gazprom2026!');
  assert.equal(serverP1.hash.length, 64);
  assert.equal(serverP1.salt.length, 32);
  assert.equal(serverVerify('Gazprom2026!', serverP1.hash, serverP1.salt), true);
  assert.equal(serverVerify('WrongPassword', serverP1.hash, serverP1.salt), false);
  assert.equal(timingSafeCompare('hash_abc', 'hash_abc'), true);
  assert.equal(timingSafeCompare('hash_abc', 'hash_xyz'), false);

  // 2. Серверная сессия и время жизни
  const testUser: UserAccount = {
    login: 'pto_lead',
    password: '123',
    fullName: 'Ведущий инженер ПТО',
    role: 'Ведущий инженер ПТО',
    department: 'ПТО',
    sessionNumber: 10,
    isAdmin: false,
  };
  const session = serverCreateSession(testUser, 1); // 1 час
  assert.ok(session.token.startsWith('zsess_'));
  assert.equal(serverIsActive(session), true);

  // 3. Расширенный журнал аудита: новые operationType
  const auditEntries: AuditLogEntry[] = [
    {
      id: 'aud-lrv-1',
      timestamp: new Date().toISOString(),
      userLogin: 'admin',
      userFullName: 'Администратор',
      userRole: 'Администратор системы',
      jointId: 'lrv-001',
      jointNumber: 'ЛРВ-001',
      uniqueLineId: 'Каталог ЛРВ',
      rdCode: '01.02.03-ТХ',
      fieldKey: 'status',
      fieldLabel: 'Аннулирование (замена) позиции ЛРВ',
      oldValue: 'Активна',
      newValue: 'Аннулирована. Письмо № 123-ГП от 01.11.2026',
      operationType: 'lrv_superseded',
    },
    {
      id: 'aud-line-1',
      timestamp: new Date().toISOString(),
      userLogin: 'pto_lead',
      userFullName: 'Ведущий инженер ПТО',
      userRole: 'Ведущий инженер ПТО',
      jointId: 'line-001',
      jointNumber: '—',
      uniqueLineId: '01.02.03-ТХ-Линия1',
      rdCode: '01.02.03-ТХ',
      fieldKey: 'rkPercent',
      fieldLabel: 'Изменение проектного процента РК',
      oldValue: '25%',
      newValue: '50%',
      operationType: 'linelist_change',
    },
    {
      id: 'aud-user-1',
      timestamp: new Date().toISOString(),
      userLogin: 'admin',
      userFullName: 'Администратор',
      userRole: 'Администратор системы',
      jointId: 'user-001',
      jointNumber: 'Сессия #15',
      uniqueLineId: 'Учётные записи',
      rdCode: 'ИТ',
      fieldKey: 'auth_register',
      fieldLabel: 'Создание пользователя',
      oldValue: '—',
      newValue: 'Иванов И.И. (ivanov_ii)',
      operationType: 'user_created',
    },
  ];

  assert.equal(auditEntries[0].operationType, 'lrv_superseded');
  assert.equal(auditEntries[1].operationType, 'linelist_change');
  assert.equal(auditEntries[2].operationType, 'user_created');
});

test('weldingLogic: Sprint 2: Трассируемость материалов, разнотолщинность, лимиты ремонта, квоты НК по сварщикам и НАКС-валидация', async () => {
  const {
    checkWallThicknessTransition,
    checkRepairEligibility,
    validateWelderNaksAttestation,
    calculateWelderNdtQuotas,
    calculateLineNdtProgress,
    formatStoGazpromJournalRow,
    formatGost32569JournalRow,
  } = await import('./weldingLogic');

  // 1. Проверка разнотолщинности по п. 14.3 СТО Газпром 15-1.1-002-2023
  // Одинаковая толщина
  const eqRes = checkWallThicknessTransition(10, 10);
  assert.equal(eqRes.isDifferentThickness, false);
  assert.equal(eqRes.requiresBevel, false);
  assert.equal(eqRes.isDirectWeldingForbidden, false);

  // Разность <= 2 мм (напр. 10 и 11 мм) -> bevel не требуется
  const smallDiff = checkWallThicknessTransition(10, 11);
  assert.equal(smallDiff.isDifferentThickness, true);
  assert.equal(smallDiff.diffMm, 1);
  assert.equal(smallDiff.requiresBevel, false);
  assert.equal(smallDiff.isDirectWeldingForbidden, false);

  // Разность > 2 мм (напр. 10 и 13 мм) -> требуется расточка/скос
  const bevelDiff = checkWallThicknessTransition(10, 13);
  assert.equal(bevelDiff.isDifferentThickness, true);
  assert.equal(bevelDiff.diffMm, 3);
  assert.equal(bevelDiff.requiresBevel, true);
  assert.equal(bevelDiff.isDirectWeldingForbidden, false);
  assert.ok(bevelDiff.warning?.includes('СТО Газпром 15-1.1-002-2023'));

  // Отношение толщин > 1.5 (напр. 10 и 16 мм, 1.6) -> прямая сварка запрещена
  const forbiddenDiff = checkWallThicknessTransition(10, 16);
  assert.equal(forbiddenDiff.isDirectWeldingForbidden, true);
  assert.ok(forbiddenDiff.error?.includes('категорически запрещена'));
  assert.ok(forbiddenDiff.error?.includes('переходное кольцо'));

  // 2. Лимиты выборки ремонта и запреты по разделу 19 СТО 15-1.1-002-2023
  // Диаметр 219 мм -> Периметр Pi*219 = 688 мм -> Лимит 1/6 = 114.6 мм
  const normalRepair = checkRepairEligibility(219, 50, 'Поры', 0);
  assert.equal(normalRepair.isValid, true);
  assert.equal(normalRepair.isExceeded, false);

  // Превышение лимита длины выборки (150 мм > 114.6 мм)
  const exceededRepair = checkRepairEligibility(219, 150, 'Поры', 0);
  assert.equal(exceededRepair.isValid, false);
  assert.equal(exceededRepair.isExceeded, true);
  assert.equal(exceededRepair.forcedAction, 'Вырезано');

  // Запрет ремонта трещин (п. 19.1)
  const crackRepair = checkRepairEligibility(219, 20, 'Продольная трещина', 0);
  assert.equal(crackRepair.isValid, false);
  assert.equal(crackRepair.isCracksForbidden, true);
  assert.equal(crackRepair.forcedAction, 'Вырезано');

  // Запрет повторного ремонта (п. 19.3)
  const secondRepair = checkRepairEligibility(219, 30, 'Поры', 1);
  assert.equal(secondRepair.isValid, false);
  assert.equal(secondRepair.isSecondRepairForbidden, true);
  assert.equal(secondRepair.forcedAction, 'Вырезано');

  // Сейсмоопасные условия (коэффициент 1/8)
  const seismicRepair = checkRepairEligibility(219, 90, 'Шлак', 0, true);
  // Лимит 1/8 от 688 = 86 мм -> 90 мм превышает
  assert.equal(seismicRepair.isValid, false);
  assert.equal(seismicRepair.ratioFactor, 8);

  // 3. Валидация соответствия аттестации НАКС
  const welder: WelderProfile = {
    stamp: 'А142',
    fullName: 'Воронов А.П.',
    certNumber: 'НАКС-ЗСР-I-104928',
    allowedMethods: ['РАД', 'РД'],
    crewForeman: 'Мастер СМР Громов И.А.',
    minDiameterMm: 57,
    maxDiameterMm: 325,
    minWallThicknessMm: 4,
    maxWallThicknessMm: 16,
    steelGroups: ['М01'],
  };

  const validJointNaks = validateWelderNaksAttestation(welder, {
    diameterMm: 159,
    wallThickness: 8,
    steelGroup: 'М01',
    weldingType: 'РД',
  });
  assert.equal(validJointNaks.isValid, true);
  assert.equal(validJointNaks.warnings.length, 0);

  // Диаметр вне диапазона
  const invalidDNaks = validateWelderNaksAttestation(welder, {
    diameterMm: 426,
    wallThickness: 8,
    steelGroup: 'М01',
    weldingType: 'РД',
  });
  assert.equal(invalidDNaks.isDiameterValid, false);
  assert.equal(invalidDNaks.isValid, false);

  // Способ сварки не разрешен
  const invalidMethodNaks = validateWelderNaksAttestation(welder, {
    diameterMm: 159,
    wallThickness: 8,
    steelGroup: 'М01',
    weldingType: 'АФ',
  });
  assert.equal(invalidMethodNaks.isMethodValid, false);
  assert.equal(invalidMethodNaks.isValid, false);

  // 4. Расчет соблюдения квот неразрушающего контроля по сварщикам
  const lines: ProjectLineItem[] = [
    {
      id: 'l-1',
      objectName: 'УКПГ-2В',
      rdCode: '0092.049.Р.13/1-TX3',
      lineNumber: '101',
      uniqueLineId: 'TX3-101',
      lineName: 'Линия пластового газа',
      product: 'Газ',
      testContour: 'К-1',
      weldingNtd: 'СТО Газпром 15-1.1-002-2023',
      controlNtd: 'СТО Газпром 15-1.3-004-2023',
      qualityLevel: 'А',
      pipelineCategory: 'I',
      workingPressure: '7.5',
      workingTemperature: '+20',
      rkPercent: 100,
      uzkPercent: 100,
      pvkPercent: 0,
      testDate: '2026-10-01',
    },
    {
      id: 'l-2',
      objectName: 'УКПГ-2В',
      rdCode: '0092.049.Р.13/1-TX3',
      lineNumber: '102',
      uniqueLineId: 'TX3-102',
      lineName: 'Линия рядовая',
      product: 'Конденсат',
      testContour: 'К-2',
      weldingNtd: 'СТО Газпром 15-1.1-002-2023',
      controlNtd: 'СТО Газпром 15-1.3-004-2023',
      qualityLevel: 'С',
      pipelineCategory: 'III',
      workingPressure: '2.5',
      workingTemperature: '+10',
      rkPercent: 100,
      uzkPercent: 20,
      pvkPercent: 0,
      testDate: '2026-10-01',
    },
  ];

  const joints: WeldJoint[] = [
    // Сварщик А142 на линии 1 (категория I, требует 100%): 2 стыка, оба проконтролированы
    {
      id: 'j-1',
      jointNumber: '010',
      uniqueLineId: 'TX3-101',
      rdCode: '0092.049.Р.13/1-TX3',
      objectName: 'УКПГ-2В',
      contour: 'К-1',
      lineNumber: '101',
      jointType: 'Монтажный',
      diameterMm: 219,
      diameterInch: '8"',
      wallThickness: 10,
      lrv1Code: 'ЛРВ-1',
      elem1Name: 'Труба',
      elem1Material: '09Г2С',
      elem1Ntd: 'ГОСТ 8732',
      elem1FactoryNumber: 'ЗАВ-001',
      elem1CertNumber: 'СЕРТ-Т-0981',
      elem1HeatNumber: 'ПЛ-4421',
      lrv2Code: 'ЛРВ-2',
      elem2Name: 'Отвод',
      elem2Material: '09Г2С',
      elem2Ntd: 'ГОСТ 17375',
      elem2FactoryNumber: 'ЗАВ-002',
      elem2CertNumber: 'СЕРТ-О-1102',
      elem2HeatNumber: 'ПЛ-8890',
      weldingType: 'РД',
      weldingDate: '2026-05-10',
      welderStamp: 'А142',
      welderFullName: 'Воронов А.П.',
      welderCertNumber: 'НАКС-01',
      responsiblePerson: 'Громов',
      techCardNumber: 'ТК-01',
      weldingMaterials: 'УОНИ',
      ambientTemp: '+15',
      vikResult: 'Годен',
      vikDate: '2026-05-11',
      vikInspector: 'Петров',
      ndtType: 'РК',
      ndtDate: '2026-05-12',
      ndtResult: 'Годен',
      ndtInspector: 'Сидоров',
      dupNdtType: 'Не требуется',
      dupNdtDate: '',
      dupNdtResult: 'Не проводился',
      dupNdtInspector: '',
      updatedAt: '2026-05-12',
      updatedBy: 'Инженер',
    },
    {
      id: 'j-2',
      jointNumber: '020',
      uniqueLineId: 'TX3-101',
      rdCode: '0092.049.Р.13/1-TX3',
      objectName: 'УКПГ-2В',
      contour: 'К-1',
      lineNumber: '101',
      jointType: 'Монтажный',
      diameterMm: 219,
      diameterInch: '8"',
      wallThickness: 10,
      lrv1Code: 'ЛРВ-1',
      elem1Name: 'Труба',
      elem1Material: '09Г2С',
      elem1Ntd: 'ГОСТ 8732',
      lrv2Code: 'ЛРВ-2',
      elem2Name: 'Труба',
      elem2Material: '09Г2С',
      elem2Ntd: 'ГОСТ 8732',
      weldingType: 'РД',
      weldingDate: '2026-05-11',
      welderStamp: 'А142',
      welderFullName: 'Воронов А.П.',
      welderCertNumber: 'НАКС-01',
      responsiblePerson: 'Громов',
      techCardNumber: 'ТК-01',
      weldingMaterials: 'УОНИ',
      ambientTemp: '+15',
      vikResult: 'Годен',
      vikDate: '2026-05-12',
      vikInspector: 'Петров',
      ndtType: 'РК',
      ndtDate: '2026-05-13',
      ndtResult: 'Годен',
      ndtInspector: 'Сидоров',
      dupNdtType: 'Не требуется',
      dupNdtDate: '',
      dupNdtResult: 'Не проводился',
      dupNdtInspector: '',
      updatedAt: '2026-05-13',
      updatedBy: 'Инженер',
    },
    // Сварщик Б015 на линии 2 (категория III, 20%): 1 стык, 0 проконтролировано -> critical
    {
      id: 'j-3',
      jointNumber: '010',
      uniqueLineId: 'TX3-102',
      rdCode: '0092.049.Р.13/1-TX3',
      objectName: 'УКПГ-2В',
      contour: 'К-2',
      lineNumber: '102',
      jointType: 'Монтажный',
      diameterMm: 159,
      diameterInch: '6"',
      wallThickness: 8,
      lrv1Code: 'ЛРВ-3',
      elem1Name: 'Труба',
      elem1Material: '09Г2С',
      elem1Ntd: 'ГОСТ 8732',
      lrv2Code: 'ЛРВ-3',
      elem2Name: 'Труба',
      elem2Material: '09Г2С',
      elem2Ntd: 'ГОСТ 8732',
      weldingType: 'РД',
      weldingDate: '2026-05-12',
      welderStamp: 'Б015',
      welderFullName: 'Белов С.В.',
      welderCertNumber: 'НАКС-02',
      responsiblePerson: 'Громов',
      techCardNumber: 'ТК-01',
      weldingMaterials: 'УОНИ',
      ambientTemp: '+15',
      vikResult: 'Годен',
      vikDate: '2026-05-13',
      vikInspector: 'Петров',
      ndtType: 'РК',
      ndtDate: '',
      ndtResult: 'Не проводился',
      ndtInspector: '',
      dupNdtType: 'Не требуется',
      dupNdtDate: '',
      dupNdtResult: 'Не проводился',
      dupNdtInspector: '',
      updatedAt: '2026-05-13',
      updatedBy: 'Инженер',
    },
  ];

  const quotas = calculateWelderNdtQuotas(joints, lines);
  const a142Quota = quotas.find((q) => q.stamp === 'А142');
  assert.ok(a142Quota);
  assert.equal(a142Quota.totalWelded, 2);
  assert.equal(a142Quota.inspectedCount, 2);
  assert.equal(a142Quota.actualNdtPct, 100);
  assert.equal(a142Quota.isCompliant, true);
  assert.equal(a142Quota.status, 'compliant');

  const b015Quota = quotas.find((q) => q.stamp === 'Б015');
  assert.ok(b015Quota);
  assert.equal(b015Quota.totalWelded, 1);
  assert.equal(b015Quota.inspectedCount, 0);
  assert.equal(b015Quota.isCompliant, false);
  assert.equal(b015Quota.status, 'critical');

  // 5. Прогресс выполнения плана НК по линии
  const lineProgress101 = calculateLineNdtProgress(joints, lines[0]);
  assert.equal(lineProgress101.weldedJoints, 2);
  assert.equal(lineProgress101.inspectedRkCount, 2);
  assert.equal(lineProgress101.actualRkPct, 100);
  assert.equal(lineProgress101.isRkFulfilled, true);

  // 6. Прослеживаемость материалов: попадание заводских номеров в СТО (столбец 9) и номеров сертификатов в ГОСТ (столбец 4)
  const stoRow = formatStoGazpromJournalRow(joints[0], 0);
  assert.equal(stoRow.col9, 'ЗАВ-001\nЗАВ-002');

  const gostRow = formatGost32569JournalRow(joints[0], 0);
  assert.ok(gostRow.col4.includes('СЕРТ-Т-0981'));
  assert.ok(gostRow.col4.includes('СЕРТ-О-1102'));
  // Заводские номера не должны попадать в столбец 4 ГОСТ, если указаны сертификаты
  assert.equal(gostRow.col4.includes('ЗАВ-001'), false);
  assert.equal(gostRow.col4.includes('ЗАВ-002'), false);
});

test('Sprint 3: classifyJointElements, findMatchingTechCard with jointKind and elementCombination', () => {
  assert.equal(classifyJointElements('Труба', 'Труба БШ 219х8', 'Труба', 'Труба 219х8'), 'Труба+Труба');
  assert.equal(classifyJointElements('Труба', 'Труба 219х8', 'Отвод', 'Отвод 90 219х8'), 'Труба+СДТ');
  assert.equal(classifyJointElements('Отвод', 'Отвод 90', 'Переход', 'Переход К 219х159'), 'СДТ+СДТ');
  assert.equal(classifyJointElements('Труба', 'Труба 219', 'ЗРА', 'Кран шаровой КШ 200'), 'Труба+ЗРА');
  assert.equal(classifyJointElements('Отвод', 'Отвод 90', 'Фланец', 'Фланец воротниковый 200'), 'СДТ+ЗРА');

  const tcList: TechCardItem[] = [
    {
      id: 'tc-pipe',
      number: 'ТК-ТРУБА',
      title: 'Труба+Труба',
      weldingType: 'РАД+РД',
      jointKind: 'Стыковое',
      elementCombination: 'Труба+Труба',
      ntd: 'СТО',
      steelGroup: 'М01',
      minDiameterMm: 57,
      maxDiameterMm: 325,
      minWallThicknessMm: 4,
      maxWallThicknessMm: 16,
      recommendedMaterials: 'Св-08Г2С',
      preheatRules: [],
    },
    {
      id: 'tc-ang',
      number: 'ТК-УГЛ',
      title: 'Угловое патрубок',
      weldingType: 'РАД+РД',
      jointKind: 'Угловое',
      elementCombination: 'Труба+СДТ',
      ntd: 'СТО',
      steelGroup: 'М01',
      minDiameterMm: 15,
      maxDiameterMm: 159,
      minWallThicknessMm: 3,
      maxWallThicknessMm: 12,
      recommendedMaterials: 'Св-08Г2С',
      preheatRules: [],
    },
  ];

  const matchedPipe = findMatchingTechCard(tcList, {
    diameterMm: 219,
    wallThicknessMm: 8,
    jointKind: 'Стыковое',
    elementCombination: 'Труба+Труба',
  });
  assert.equal(matchedPipe?.number, 'ТК-ТРУБА');

  const matchedAng = findMatchingTechCard(tcList, {
    diameterMm: 57,
    wallThicknessMm: 4,
    jointKind: 'Угловое',
    elementCombination: 'Труба+СДТ',
  });
  assert.equal(matchedAng?.number, 'ТК-УГЛ');
});

test('Sprint 3: getWelderCertForMethod gets specific cert for method and resolves correctly', () => {
  const welderWithMethods: WelderProfile = {
    stamp: 'А142',
    fullName: 'Королев Д.В.',
    certNumber: 'ЗС-ОСНОВНОЙ',
    allowedMethods: ['РАД', 'РД', 'РАД+РД'],
    crewForeman: 'Громов И.А.',
    naksCerts: [
      {
        weldingType: 'РАД',
        certNumber: 'НАКС-РАД-001',
        issueDate: '2025-01-01',
        expiryDate: '2027-01-01',
      },
      {
        weldingType: 'РД',
        certNumber: 'НАКС-РД-002',
        issueDate: '2025-01-01',
        expiryDate: '2027-01-01',
      },
    ],
  };

  const radCert = getWelderCertForMethod(welderWithMethods, 'РАД');
  assert.equal(radCert.certNumber, 'НАКС-РАД-001');

  const rdCert = getWelderCertForMethod(welderWithMethods, 'РД');
  assert.equal(rdCert.certNumber, 'НАКС-РД-002');

  const combCert = getWelderCertForMethod(welderWithMethods, 'РАД+РД');
  assert.ok(combCert.certNumber.includes('НАКС-РАД-001') && combCert.certNumber.includes('НАКС-РД-002'));

  const resolved = resolveWeldersSelection(['А142'], undefined, [welderWithMethods], 'РД');
  assert.equal(resolved.welderCertNumber, 'НАКС-РД-002');
});

test('Sprint 3: getMissingPassportFields and isPassportIncomplete validate welded joints', () => {
  const baseMockJoint: WeldJoint = {
    id: 'test-j-1',
    objectName: 'Объект 1',
    rdCode: 'РД-001',
    contour: 'Контур 1',
    lineNumber: '001',
    uniqueLineId: '001-РД-001',
    jointNumber: '010',
    jointType: 'Монтажный',
    diameterMm: 219,
    diameterInch: '8"',
    wallThickness: 8,
    lrv1Code: 'LRV-1',
    elem1Name: 'Труба 219',
    elem1Material: '09Г2С',
    elem1Ntd: 'ГОСТ 8732',
    lrv2Code: 'LRV-2',
    elem2Name: 'Труба 219',
    elem2Material: '09Г2С',
    elem2Ntd: 'ГОСТ 8732',
    weldingType: 'РАД+РД',
    weldingDate: '',
    welderStamp: '',
    weldingMaterials: '',
    ambientTemp: '+15',
    responsiblePerson: '',
    welderFullName: '',
    welderCertNumber: '',
    techCardNumber: '',
    vikResult: '',
    vikDate: '',
    vikInspector: '',
    ndtResult: '',
    ndtDate: '',
    ndtProtocolNumber: '',
    ndtInspector: '',
    dupNdtResult: '',
    dupNdtDate: '',
    dupNdtProtocolNumber: '',
    dupNdtInspector: '',
    updatedAt: '',
    updatedBy: '',
  };

  const draftJoint: WeldJoint = { ...baseMockJoint, weldingDate: '', welderStamp: '' };
  assert.equal(isPassportIncomplete(draftJoint), false, 'Несваренный стык не считается незаполненным');

  const weldedJointWithoutFields: WeldJoint = {
    ...baseMockJoint,
    weldingDate: '2026-10-15',
    welderStamp: '',
    techCardNumber: '',
    weldingMaterials: '',
    responsiblePerson: '',
    elem1FactoryNumber: '',
    elem2FactoryNumber: '',
    elem1Length: '',
    elem2Length: '',
  };
  assert.equal(isPassportIncomplete(weldedJointWithoutFields), true);
  const missing = getMissingPassportFields(weldedJointWithoutFields);
  assert.equal(missing.length, 8);

  const completeWeldedJoint: WeldJoint = {
    ...baseMockJoint,
    weldingDate: '2026-10-15',
    welderStamp: 'А142',
    techCardNumber: 'ТК-01',
    weldingMaterials: 'Св-08Г2С',
    responsiblePerson: 'Громов',
    elem1FactoryNumber: 'Т-01',
    elem2FactoryNumber: 'Т-02',
    elem1Length: '11.5',
    elem2Length: '11.8',
  };
  assert.equal(isPassportIncomplete(completeWeldedJoint), false);
  assert.equal(getMissingPassportFields(completeWeldedJoint).length, 0);
});
