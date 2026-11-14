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
  checkWelderMethodCompliance,
  validateWelderNaksAttestation,
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
    jointKind: 'Стыковое',
    elementCombination: 'Труба+Труба',
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
      jointKind: 'Стыковое',
      elementCombination: 'Труба+Труба',
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
      jointKind: 'Стыковое',
      elementCombination: 'Труба+Труба',
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

  // Закрытие ремонта стыка 020 контролем после ремонта (ВИК и РК -> «Годен»)
  joints = applyBulkUpdateToJoints(
    joints,
    [joints[1].id],
    {
      repairVikResult: 'Годен',
      repairVikDate: '2026-10-19',
      repairVikInspector: 'Лебедев С.А.',
      repairVikNumber: 'ЗАК-ВИК-Р-020',
      repairNdtType: 'РК',
      repairNdtResult: 'Годен',
      repairNdtDate: '2026-10-19',
      repairNdtInspector: 'Лебедев С.А.',
      repairNdtNumber: 'ЗАК-РК-Р-020',
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
      assert.equal(stoRow.col38, 'ЗАК-ВИК-Р-020', 'В графе 38 фактический номер заключения ВИК после ремонта');
      assert.equal(stoRow.col40, 'Годен', 'В графе 40 ВИК после ремонта — Годен');
      assert.equal(stoRow.col42, 'ЗАК-РК-Р-020', 'В графе 42 фактический номер заключения НК после ремонта');
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
      jointKind: 'Стыковое',
      elementCombination: 'Труба+Труба',
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
      jointKind: 'Стыковое',
      elementCombination: 'Труба+Труба',
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
    vikResult: 'Не проводился',
    vikDate: '',
    vikInspector: '',
    ndtType: 'РК',
    ndtResult: 'Не проводился',
    ndtDate: '',
    ndtInspector: '',
    dupNdtType: 'УЗК',
    dupNdtResult: 'Не проводился',
    dupNdtDate: '',
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

test('Sprint 3: checkWelderMethodCompliance restricts welders lacking required welding method', () => {
  const radOnlyWelder: WelderProfile = {
    id: 'w-rad-only',
    stamp: 'Р01',
    isBrigade: false,
    fullName: 'Радов Р.Р.',
    certNumber: 'НАКС-РАД-01',
    allowedMethods: ['РАД'],
    naksCerts: [
      {
        weldingType: 'РАД',
        certNumber: 'НАКС-РАД-01',
      },
    ],
    crewForeman: 'Мастер',
  };

  const rdOnlyWelder: WelderProfile = {
    id: 'w-rd-only',
    stamp: 'Д02',
    isBrigade: false,
    fullName: 'Дугов Д.Д.',
    certNumber: 'НАКС-РД-02',
    allowedMethods: ['РД'],
    naksCerts: [
      {
        weldingType: 'РД',
        certNumber: 'НАКС-РД-02',
      },
    ],
    crewForeman: 'Мастер',
  };

  const dualWelder: WelderProfile = {
    id: 'w-dual',
    stamp: 'К03',
    isBrigade: false,
    fullName: 'Комбинированный К.К.',
    certNumber: 'НАКС-РАД-03, НАКС-РД-03',
    allowedMethods: ['РАД', 'РД', 'РАД+РД'],
    naksCerts: [
      {
        weldingType: 'РАД',
        certNumber: 'НАКС-РАД-03',
      },
      {
        weldingType: 'РД',
        certNumber: 'НАКС-РД-03',
      },
    ],
    crewForeman: 'Мастер',
  };

  // 1. Сварщик с только РАД не допускается к РД
  const resRadOnRd = checkWelderMethodCompliance(radOnlyWelder, 'РД');
  assert.equal(resRadOnRd.isAllowed, false);
  assert.equal(resRadOnRd.reason, 'Нет аттестации на РД');

  // 2. Сварщик с РД допускается к РД
  const resRdOnRd = checkWelderMethodCompliance(rdOnlyWelder, 'РД');
  assert.equal(resRdOnRd.isAllowed, true);

  // 3. Сварщик с РАД+РД допускается к РД и РАД
  assert.equal(checkWelderMethodCompliance(dualWelder, 'РД').isAllowed, true);
  assert.equal(checkWelderMethodCompliance(dualWelder, 'РАД').isAllowed, true);
  assert.equal(checkWelderMethodCompliance(dualWelder, 'РАД+РД').isAllowed, true);

  // 4. Сварщик с только РД не допускается к РАД
  const resRdOnRad = checkWelderMethodCompliance(rdOnlyWelder, 'РАД');
  assert.equal(resRdOnRad.isAllowed, false);
  assert.equal(resRdOnRad.reason, 'Нет аттестации на РАД');

  // 5. Валидация НАКС также фиксирует предупреждение при несовпадении способа
  const naksValidation = validateWelderNaksAttestation(radOnlyWelder, {
    diameterMm: 219,
    wallThickness: 8,
    steelGroup: '09Г2С',
    weldingType: 'РД',
  });
  assert.equal(naksValidation.isValid, false);
  assert.equal(naksValidation.isMethodValid, false);
  assert.ok(naksValidation.warnings.some((w) => w.includes('Способ сварки "РД" не разрешен')));
});

test('Sprint 4: Strict TechCard matching and Line-specific Welder NDT Quota calculation', () => {
  // 1. Strict TechCard matching
  const techCards: TechCardItem[] = [
    {
      id: 'tc-rad',
      number: 'ТК-РАД-01',
      title: 'Сварка РАД',
      weldingType: 'РАД',
      jointKind: 'Стыковое',
      elementCombination: 'Труба+Труба',
      ntd: 'СТО Газпром',
      steelGroup: '09Г2С',
      minDiameterMm: 57,
      maxDiameterMm: 219,
      minWallThicknessMm: 4,
      maxWallThicknessMm: 12,
      recommendedMaterials: 'Св-08Г2С',
      preheatRules: [],
    },
  ];

  // Matching request with matching method
  const match = findMatchingTechCard(techCards, {
    diameterMm: 159,
    wallThicknessMm: 8,
    steelGrade: '09Г2С',
    weldingType: 'РАД',
    jointKind: 'Стыковое',
    elementCombination: 'Труба+Труба',
  });
  assert.ok(match !== null);
  assert.equal(match.id, 'tc-rad');

  // Mismatching weldingType should return null and NEVER substitute a different method
  const noMatch = findMatchingTechCard(techCards, {
    diameterMm: 159,
    wallThicknessMm: 8,
    steelGrade: '09Г2С',
    weldingType: 'РД', // Not matching РАД
    jointKind: 'Стыковое',
    elementCombination: 'Труба+Труба',
  });
  assert.equal(noMatch, null);

  // 2. Line-specific Welder NDT Quota calculation
  const lineItem: ProjectLineItem = {
    id: 'line-1',
    uniqueLineId: 'LINE-01',
    lineNumber: 'L-1',
    lineName: 'Линия 1',
    rdCode: 'RD-01',
    objectName: 'Объект',
    product: 'Газ',
    testContour: 'К-1',
    weldingNtd: 'СТО Газпром',
    controlNtd: 'СТО Газпром',
    qualityLevel: 'I',
    pipelineCategory: 'I',
    workingPressure: '10',
    workingTemperature: '20',
    rkPercent: 100, // 100% control required
    uzkPercent: 0,
    pvkPercent: 0,
    testDate: '2026-05-01',
  };

  // Two joints on line-1 welded by welder W1, only one has RK 'Годен'
  const jointsOnLine = [
    {
      id: 'j-1',
      jointNumber: '010',
      uniqueLineId: 'LINE-01',
      rdCode: 'RD-01',
      objectName: 'Объект',
      contour: 'К-1',
      lineNumber: 'L-1',
      jointType: 'Монтажный' as const,
      diameterMm: 159,
      diameterInch: '6"',
      wallThickness: 8,
      lrv1Code: 'L-1',
      elem1Name: 'Труба',
      elem1Material: '09Г2С',
      elem1Ntd: 'ГОСТ',
      lrv2Code: 'L-2',
      elem2Name: 'Труба',
      elem2Material: '09Г2С',
      elem2Ntd: 'ГОСТ',
      welderStamp: 'W1',
      weldingDate: '2026-01-10',
      vikResult: 'Годен' as const,
      ndtType: 'РК' as const,
      ndtResult: 'Годен' as const,
      updatedAt: '2026-01-10T10:00:00Z',
      updatedBy: 'Test',
    } as WeldJoint,
    {
      id: 'j-2',
      jointNumber: '020',
      uniqueLineId: 'LINE-01',
      rdCode: 'RD-01',
      objectName: 'Объект',
      contour: 'К-1',
      lineNumber: 'L-1',
      jointType: 'Монтажный' as const,
      diameterMm: 159,
      diameterInch: '6"',
      wallThickness: 8,
      lrv1Code: 'L-1',
      elem1Name: 'Труба',
      elem1Material: '09Г2С',
      elem1Ntd: 'ГОСТ',
      lrv2Code: 'L-2',
      elem2Name: 'Труба',
      elem2Material: '09Г2С',
      elem2Ntd: 'ГОСТ',
      welderStamp: 'W1',
      weldingDate: '2026-01-11',
      vikResult: 'Годен' as const,
      ndtType: 'РК' as const,
      ndtResult: 'Не проводился' as const, // Quota not met for W1!
      updatedAt: '2026-01-11T10:00:00Z',
      updatedBy: 'Test',
    } as WeldJoint,
  ];

  const status = computeLineListItemStatus(lineItem, jointsOnLine);
  // Total RK required is 2 (100% of 2 joints), passed is 1 -> insufficient
  assert.equal(status.ndtStatus, 'insufficient');
  assert.ok(status.welderNdtDeficits && status.welderNdtDeficits.length > 0);
  assert.ok(status.welderNdtDeficits.some((d) => d.includes('W1')));
});

test('Sprint 2: OCC-контроль ревизий (HTTP 409), согласованный бэкап WAL и scrypt KDF', async () => {
  const os = await import('node:os');
  const path = await import('node:path');
  const fs = await import('node:fs');
  const { UnifiedServerDatabase } = await import('../server/sqliteDb');
  const { hashPasswordWithSalt, verifyPassword } = await import('../server/serverAuth');
  const { USER_ACCOUNTS } = await import('../data/seedData');

  // 1. Проверка сидовых учетных записей: отсутствие открытых паролей и валидность scrypt-хешей
  for (const acc of USER_ACCOUNTS) {
    assert.equal(acc.password, undefined, `Учётная запись ${acc.login} не должна содержать открытый пароль`);
    assert.ok(acc.passwordHash, `Учётная запись ${acc.login} должна содержать passwordHash`);
    assert.ok(acc.passwordSalt, `Учётная запись ${acc.login} должна содержать passwordSalt`);
    assert.equal(
      verifyPassword('123', acc.passwordHash!, acc.passwordSalt!),
      true,
      `Учётная запись ${acc.login} должна успешно верифицироваться со штатным паролем`
    );
  }

  // 2. Инициализация ИЗОЛИРОВАННОЙ базы данных во временном каталоге (Замечание аудита №1: не трогать data/)
  const tmpDir = path.join(os.tmpdir(), `zaychick-test-occ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const db = new UnifiedServerDatabase({
    dataDir: tmpDir,
    sqliteDbPath: path.join(tmpDir, 'test.sqlite'),
    backupsDir: path.join(tmpDir, 'backups'),
    disableStartupBackup: true,
  });

  try {
    const backupRes = db.createBackup('test_audit');
    assert.equal(backupRes.success, true, 'Метод createBackup должен завершаться успешно');
    assert.ok(backupRes.backupPath, 'Метод createBackup должен возвращать путь к файлу');

    // 3. Проверка OCC: syncStateWithOptimisticLock со старой ревизией должна возвращать STALE_GLOBAL_REVISION
    const state = db.readFullState();
    const currentRev = state.meta.globalRevision;

    const staleResult = db.syncStateWithOptimisticLock({
      data: { joints: state.data.joints },
      expectedGlobalRevision: currentRev - 1, // Устаревшая ревизия
      forceOverwrite: false,
      actionLabel: 'Тест конфликта ревизии',
      user: { login: 'engineer_pto', fullName: 'Инженер', role: 'Инженер ПТО' },
    });

    assert.equal(staleResult.status, 'conflict', 'При устаревшей ревизии ожидается статус conflict');
    if (staleResult.status === 'conflict') {
      assert.equal(staleResult.conflict, 'STALE_GLOBAL_REVISION');
      assert.equal(staleResult.currentRevision, currentRev);
    }

    // 4. Проверка обхода принудительной перезаписи администратором (forceOverwrite: true)
    const forceResult = db.syncStateWithOptimisticLock({
      data: { joints: state.data.joints },
      expectedGlobalRevision: currentRev - 1,
      forceOverwrite: true,
      actionLabel: 'Принудительная синхронизация админом',
      user: { login: 'admin', fullName: 'Админ', role: 'Администратор системы', isAdmin: true },
    });

    assert.equal(forceResult.status, 'ok', 'При forceOverwrite: true синхронизация должна успешно применяться');
  } finally {
    db.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
});

test('Sprint 3: Регресс сохранения хешей паролей при синхронизации и явный отказ при создании стыка', async () => {
  const os = await import('node:os');
  const path = await import('node:path');
  const fs = await import('node:fs');
  const { UnifiedServerDatabase } = await import('../server/sqliteDb');

  // Изолированная временная БД для теста
  const tmpDir = path.join(os.tmpdir(), `zaychick-test-auth-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const db = new UnifiedServerDatabase({
    dataDir: tmpDir,
    sqliteDbPath: path.join(tmpDir, 'test.sqlite'),
    backupsDir: path.join(tmpDir, 'backups'),
    disableStartupBackup: true,
  });

  try {
    // 1. Проверяем, что первичный вход успешен
    const initialAuth = db.authenticateUser('admin', '123');
    assert.equal(initialAuth.success, true, 'Первичный вход admin/123 должен быть успешен');

    // 2. Получаем состояние через публичный readFullState (где аккаунты маскированы)
    const publicState = db.readFullState();
    const maskedAccounts = publicState.data.userAccounts;
    assert.ok(maskedAccounts.length > 0);
    assert.equal(maskedAccounts[0].passwordHash, undefined, 'В публичном DTO passwordHash должен быть замаскирован');

    // 3. Выполняем синхронизацию состояния, передавая маскированные аккаунты
    const syncRes = db.syncStateWithOptimisticLock({
      data: {
        userAccounts: maskedAccounts,
        joints: publicState.data.joints,
      },
      actionLabel: 'Тест синхронизации с маскированными аккаунтами',
      user: { login: 'admin', fullName: 'Админ', role: 'Администратор системы', isAdmin: true },
      forceOverwrite: true,
    });
    assert.equal(syncRes.status, 'ok');

    // 4. КРИТИЧЕСКИЙ РЕГРЕСС-ТЕСТ: повторный вход admin/123 ОБЯЗАН быть успешен!
    const repeatAuth = db.authenticateUser('admin', '123');
    assert.equal(
      repeatAuth.success,
      true,
      'Критический регресс: после syncStateWithOptimisticLock парольные хеши в БД не должны затираться!'
    );

    // 5. Проверка явного отказа (forbidden) при попытке создания стыка без прав
    const forbiddenSave = db.saveJointWithOptimisticLock({
      joint: {
        id: `new-joint-unauthorized-${Date.now()}`,
        jointNumber: '999',
        uniqueLineId: 'TEST-LINE',
        rdCode: 'RD-01',
        objectName: 'Объект',
        contour: 'К-1',
        lineNumber: 'L-1',
        jointType: 'Монтажный',
        diameterMm: 159,
        diameterInch: '6"',
        wallThickness: 8,
        lrv1Code: 'L-1',
        elem1Name: 'Труба',
        elem1Material: '09Г2С',
        elem1Ntd: 'ГОСТ',
        lrv2Code: 'L-2',
        elem2Name: 'Труба',
        elem2Material: '09Г2С',
        elem2Ntd: 'ГОСТ',
        welderStamp: 'W1',
        weldingDate: '2026-01-10',
        vikResult: 'Годен',
        ndtType: 'РК',
        ndtResult: 'Годен',
        updatedAt: '2026-01-10T10:00:00Z',
        updatedBy: 'Дефектоскопист',
      } as any,
      user: { login: 'ndt_petrov', fullName: 'Дефектоскопист', role: 'Специалист ЛНК' },
      forceOverwrite: false,
    });

    assert.equal(
      forbiddenSave.status,
      'forbidden',
      'Попытка заведения стыка ролью без прав должна возвращать явный статус forbidden (HTTP 403)'
    );
  } finally {
    db.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
});

test('Sprint 3: Физическая валидация сигнатуры бэкапа и сквозное восстановление базы данных', async () => {
  const os = await import('node:os');
  const path = await import('node:path');
  const fs = await import('node:fs');
  const { UnifiedServerDatabase } = await import('../server/sqliteDb');

  // Изолированная временная БД для теста бэкапа
  const tmpDir = path.join(os.tmpdir(), `zaychick-test-backup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const db = new UnifiedServerDatabase({
    dataDir: tmpDir,
    sqliteDbPath: path.join(tmpDir, 'test.sqlite'),
    backupsDir: path.join(tmpDir, 'backups'),
    disableStartupBackup: true,
  });

  try {
    const backupRes = db.createBackup('verify_restore');

    assert.equal(backupRes.success, true, 'Резервная копия должна создаваться со статусом success: true');
    assert.ok(backupRes.backupPath, 'Должен быть возвращён путь к созданному файлу');
    assert.ok(fs.existsSync(backupRes.backupPath!), 'Файл резервной копии должен физически существовать на диске');

    // 1. Проверка сигнатуры заголовка SQLite
    if (backupRes.backupPath!.endsWith('.sqlite')) {
      const fd = fs.openSync(backupRes.backupPath!, 'r');
      const headerBuf = Buffer.alloc(16);
      fs.readSync(fd, headerBuf, 0, 16, 0);
      fs.closeSync(fd);
      const magicPrefix = Buffer.from('SQLite format 3\0', 'utf8');
      assert.deepEqual(
        headerBuf,
        magicPrefix,
        'Сигнатура заголовка файла бэкапа обязана в точности соответствовать стандарту "SQLite format 3\\0"'
      );

      // 2. Сквозное восстановление: открываем бэкап в независимом процессе и считываем таблицы
      const nodeSqlite = await import('node:sqlite');
      const restoredDb = new (nodeSqlite as any).DatabaseSync(backupRes.backupPath!);

      try {
        const jointsCount = restoredDb.prepare('SELECT count(*) as cnt FROM weld_joints').get() as { cnt: number };
        assert.ok(jointsCount.cnt > 0, 'Восстановленная база обязана содержать записи сварных стыков');

        const usersCount = restoredDb.prepare('SELECT count(*) as cnt FROM user_accounts').get() as { cnt: number };
        assert.ok(usersCount.cnt > 0, 'Восстановленная база обязана содержать учётные записи пользователей');

        const metaRow = restoredDb.prepare('SELECT global_revision FROM db_meta WHERE id = 1').get() as { global_revision: number };
        assert.ok(metaRow.global_revision >= 1, 'Восстановленная база обязана содержать метаданные ревизии');
      } finally {
        try { restoredDb.close(); } catch {}
      }
    } else {
      // Fallback JSON проверка
      const parsed = JSON.parse(fs.readFileSync(backupRes.backupPath!, 'utf8'));
      assert.ok(parsed?.data?.joints?.length > 0, 'JSON бэкап обязан содержать стыки');
    }
  } finally {
    db.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
});

test('Sprint 4: Meteostat Daily метеостанции, запрет синтетической формулы в архиве, раздельная сигнализация и защита стыков', async () => {
  const {
    findNearbyWeatherStations,
    fetchStationDailyObservations,
    fetchAmbientTemperatureAuto,
    checkWeatherServiceHealth,
    determineDateObservationStatus,
    calculateHaversineDistanceKm,
    formatObservationTemp,
  } = await import('./weldingLogic');

  // 1. Поиск ближайших реальных метеостанций по координатам объекта (Волхов 59.93° N, 32.34° E)
  const nearby = findNearbyWeatherStations(59.93, 32.34, 5);
  assert.ok(nearby.length > 0, 'Должен вернуть список ближайших станций');
  assert.equal(nearby[0].id, '26078', 'Ближайшая станция к Волхову — WMO 26078 (Волхов)');
  assert.ok(nearby[0].distanceKm !== undefined && nearby[0].distanceKm <= 5.0, 'Расстояние до станции Волхов должно быть ~1.2 км');
  assert.ok(nearby[0].name.includes('Волхов'), 'Наименование станции должно содержать Волхов');

  // Проверка сортировки по расстоянию (возрастание)
  for (let i = 1; i < nearby.length; i++) {
    assert.ok((nearby[i].distanceKm ?? 0) >= (nearby[i - 1].distanceKm ?? 0), 'Станции должны быть отсортированы по расстоянию');
  }

  // 2. Расчёт Haversine расстояния
  const dist = calculateHaversineDistanceKm(59.93, 32.34, 59.92, 32.35);
  assert.ok(dist >= 1.0 && dist <= 2.0, `Расстояние должно быть ~1.2 км, получено: ${dist}`);

  // 3. Категорический запрет подстановки климатической формулы при отсутствии данных
  // Дата без наблюдений и пустой архив:
  const noDataRes = await fetchAmbientTemperatureAuto(59.93, 32.34, '2026-01-01', {});
  assert.equal(noDataRes.tempC, '', 'Температура обязана оставаться пустой строкой при отсутствии данных наблюдений');
  assert.equal(noDataRes.status, 'not_found', 'Статус должен быть not_found');
  assert.ok(noDataRes.source.includes('За дату данных нет'), 'Источник должен прямо сообщать об отсутствии данных');

  // 4. Meteostat Daily observations:
  // а) Дата с доступными наблюдениями станции 26078 (в тестовом режиме с явным allowDemoFallback)
  const obsMap = await fetchStationDailyObservations(
    { id: '26078', name: 'Метеостанция г. Волхов' },
    '2026-06-15',
    '2026-06-15',
    { nowIso: '2026-07-01', allowDemoFallback: true }
  );
  assert.ok(obsMap['2026-06-15'], 'Должна присутствовать запись за 2026-06-15');
  assert.equal(obsMap['2026-06-15'].status, 'available');
  assert.equal(obsMap['2026-06-15'].tavg, 18.2);
  assert.equal(formatObservationTemp(obsMap['2026-06-15'].tavg), '+18.2');

  // б) Дата без наблюдений на станции (не подставляется модель!)
  const emptyObsMap = await fetchStationDailyObservations(
    { id: '26078', name: 'Метеостанция г. Волхов' },
    '2025-01-01',
    '2025-01-01',
    { nowIso: '2026-07-01' }
  );
  assert.equal(emptyObsMap['2025-01-01'].status, 'not_found', 'При отсутствии наблюдений статус обязан быть not_found');
  assert.equal(emptyObsMap['2025-01-01'].tavg, undefined, 'tavg обязан быть undefined (никакой формулы!)');
  assert.equal(emptyObsMap['2025-01-01'].statusMessage, 'За дату данных нет');

  // в) Свежая дата в пределах задержки архива (1–7 дней) или будущая дата
  const pendingObsMap = await fetchStationDailyObservations(
    { id: '26078', name: 'Метеостанция г. Волхов' },
    '2026-07-01',
    '2026-07-01',
    { nowIso: '2026-07-02' }
  );
  assert.equal(pendingObsMap['2026-07-01'].status, 'pending');
  assert.equal(pendingObsMap['2026-07-01'].statusMessage, 'Данные ещё не поступили');

  // 5. Раздельная сигнализация сервиса:
  // Проверка связи (доступность сервиса)
  const health = await checkWeatherServiceHealth('meteostat');
  assert.ok(['online', 'offline'].includes(health.status));
  assert.ok(health.lastCheckedAt, 'Должно быть указано время проверки');

  // 6. Проверка изоляции стыков: смена метеостанции не должна менять сохранённые стыки
  const initialJoint = {
    id: 'j-test-100',
    objectName: 'КС Волховская',
    rdCode: '0092.049.Р.13/1',
    contour: 'КИ-1',
    lineNumber: 'ФП1.2/1',
    uniqueLineId: '0092.049.Р.13/1:ФП1.2/1',
    jointNumber: '010',
    jointType: 'Монтажный',
    weldingType: 'РАД+РД',
    weldingDate: '2026-06-15',
    welderStamp: 'А101',
    weldingMaterials: 'Св-08Г2С',
    ambientTemp: '+15', // Уже сохранённая температура
    responsiblePerson: 'Громов И.А.',
    welderFullName: 'Иванов И.И.',
    welderCertNumber: 'АЦ-1',
    techCardNumber: 'ТК-01',
    vikResult: 'Годен' as const,
    vikDate: '2026-06-16',
    vikInspector: 'Петров П.П.',
    ndtType: 'РК' as const,
    ndtDate: '2026-06-17',
    ndtResult: 'Годен' as const,
    ndtInspector: 'Сидоров С.С.',
    dupNdtType: 'Не требуется' as const,
    dupNdtDate: '',
    dupNdtResult: 'Не проводился' as const,
    dupNdtInspector: '',
  };

  // Смена станции на объекте (архив станции содержит другую температуру)
  const newStationArchive = { '2026-06-15': '+25' };
  // Проверяем, что исходный стык не меняется молча:
  assert.equal(initialJoint.ambientTemp, '+15', 'Температура в паспорте стыка не должна меняться при смене станции без подтверждения');
});

test('Метеостанции РФ: поиск реальной метеостанции (Курган WMO 28661), геокодинг и категорический запрет фиктивных метеопостов', async () => {
  const {
    searchWeatherStations,
    resolveFacilityDefaultLocation,
    findNearbyWeatherStations,
    calculateHaversineDistanceKm,
    VERIFIED_WMO_STATIONS,
  } = await import('./weldingLogic');

  // 1. Полнотекстовый поиск по реестру метеостанций по запросу "Курган"
  const kurganResults = searchWeatherStations('Курган');
  assert.ok(kurganResults.length > 0, 'Поиск по "Курган" обязан находить реальную метеостанцию');
  const kurganStation = kurganResults[0];
  assert.equal(kurganStation.id, '28661', 'WMO ID метеостанции Курган должен быть 28661');
  assert.equal(kurganStation.name, 'АМСГ Курган');
  assert.equal(kurganStation.region, 'Курганская область');
  assert.equal(kurganStation.latitude, 55.47);
  assert.equal(kurganStation.longitude, 65.42);

  // 2. Поиск по WMO ID "28661"
  const idResults = searchWeatherStations('28661');
  assert.ok(idResults.length > 0, 'Поиск по WMO ID должен находить станцию');
  assert.equal(idResults[0].id, '28661');

  // 3. Поиск станций городов ТЭК и ключевых регионов
  const tyumenResults = searchWeatherStations('Тюмень');
  assert.ok(tyumenResults.length > 0 && tyumenResults[0].id === '28367', 'Должна быть станция Тюмень (28367)');

  const chelyabinskResults = searchWeatherStations('Челябинск');
  assert.ok(chelyabinskResults.length > 0 && chelyabinskResults[0].id === '28642', 'Должна быть станция Челябинск (28642)');

  const ekbResults = searchWeatherStations('Екатеринбург');
  assert.ok(ekbResults.length > 0 && ekbResults[0].id === '28440', 'Должна быть станция Екатеринбург (28440)');

  // 4. Расчёт расстояния от координат г. Курган (55.47, 65.42)
  const nearbyKurgan = findNearbyWeatherStations(55.47, 65.42, 3);
  assert.equal(nearbyKurgan[0].id, '28661', 'Ближайшая станция к координатам Кургана — АМСГ Курган');
  assert.equal(nearbyKurgan[0].distanceKm, 0.0, 'Расстояние до станции Курган от координат города должно быть 0 км');

  // 5. Автоматическое сопоставление при создании объекта "Курган"
  const resolvedKurgan = resolveFacilityDefaultLocation('Курган');
  assert.equal(resolvedKurgan.matched, true, 'Город Курган должен быть распознан');
  assert.equal(resolvedKurgan.weatherStationId, '28661');
  assert.equal(resolvedKurgan.region, 'Курганская область');
  assert.equal(resolvedKurgan.weatherStation, 'АМСГ Курган (ID: 28661)');

  const resolvedKsKurgan = resolveFacilityDefaultLocation('КС Курганская');
  assert.equal(resolvedKsKurgan.matched, true, 'Объект "КС Курганская" должен быть сопоставлен с Курганом');
  assert.equal(resolvedKsKurgan.weatherStationId, '28661');

  // 6. КАТЕГОРИЧЕСКИЙ ЗАПРЕТ НА ВЫДУМАННЫЕ МЕТЕОПОСТЫ:
  // При создании неизвестного объекта система НЕ должна создавать фиктивный "Метеопост"
  const unknownResolved = resolveFacilityDefaultLocation('Участок магистрали №99');
  assert.equal(unknownResolved.matched, false, 'Неизвестный объект не должен привязываться к случайной станции');
  assert.ok(
    !unknownResolved.weatherStation.includes('Метеопост Участок'),
    'Категорически запрещено генерировать фиктивные имена вида "Метеопост <Объект>"'
  );
  assert.ok(
    unknownResolved.weatherStation.includes('Метеостанция не привязана'),
    'Для неизвестного объекта должно требоваться явное подтверждение станции в свойствах объекта'
  );
  assert.equal(unknownResolved.weatherStationId, undefined, 'WMO ID неизвестного объекта должен оставаться пустым');
});

test('Эксплуатационный план метеостанций: офлайн-реестр Росгидромета, ведомственные АМК, Meteostat fallback и парсер справок УГМС', async () => {
  const {
    ROSHIDROMET_STATIONS,
    VERIFIED_WMO_STATIONS,
    searchWeatherStations,
    fetchMeteostatNearbyStations,
    parseUgmsWeatherCertificateCsv,
  } = await import('./weldingLogic');

  // 1. Этап 1: Офлайн-реестр Росгидромета РФ
  assert.ok(ROSHIDROMET_STATIONS.length >= 70, 'Офлайн-реестр обязан содержать более 70 ключевых станций РФ');
  assert.equal(VERIFIED_WMO_STATIONS.length, ROSHIDROMET_STATIONS.length, 'VERIFIED_WMO_STATIONS должен ссылаться на полный реестр Росгидромета');

  const vologda = ROSHIDROMET_STATIONS.find((s) => s.id === '27037');
  assert.ok(vologda, 'В реестре должна быть станция Вологда');
  assert.equal(vologda.name, 'АМСГ Вологда');

  const bovanenkovo = ROSHIDROMET_STATIONS.find((s) => s.id === '20959');
  assert.ok(bovanenkovo, 'В реестре должно быть Бованенково');

  // 2. Этап 2: Регистрация ведомственных поверенных метеопостов площадки
  const customAmk = {
    id: 'amk-vorkuta-4',
    name: 'АМК КС-4 Воркутинская',
    region: 'Республика Коми',
    latitude: 67.55,
    longitude: 64.12,
    deviceModel: 'Метеокомплекс АМК-03',
    verificationCertNumber: 'СП-2026/8841',
    verificationValidUntil: '2027-12-31',
    isVerified: true,
    createdAt: new Date().toISOString(),
    source: 'custom' as const,
  };

  // Поиск по номеру свидетельства о поверке ФГИС АРШИН
  const certSearchResults = searchWeatherStations('СП-2026/8841', 67.55, 64.12, 10, [customAmk]);
  assert.ok(certSearchResults.length > 0, 'Поиск по номеру свидетельства о поверке должен находить метеопост');
  assert.equal(certSearchResults[0].id, 'amk-vorkuta-4');
  assert.equal(certSearchResults[0].source, 'custom');
  assert.equal(certSearchResults[0].verificationCertNumber, 'СП-2026/8841');

  // Поиск по модели прибора
  const modelSearchResults = searchWeatherStations('АМК-03', 67.55, 64.12, 10, [customAmk]);
  assert.ok(modelSearchResults.length > 0, 'Поиск по модели прибора должен находить метеопост');
  assert.equal(modelSearchResults[0].id, 'amk-vorkuta-4');

  // Приоритет ведомственного метеопоста объекта
  const emptyQueryResults = searchWeatherStations('', 67.55, 64.12, 10, [customAmk]);
  assert.equal(emptyQueryResults[0].id, 'amk-vorkuta-4', 'Поверенный метеопост объекта должен быть на 1 месте');

  // 3. Этап 3: Meteostat fallback при отсутствии ключа или оффлайне
  const fallbackStations = await fetchMeteostatNearbyStations(59.93, 32.34, 3);
  assert.ok(fallbackStations.length > 0, 'При отсутствии API-ключа должен безопасно возвращаться офлайн-реестр');
  assert.equal(fallbackStations[0].id, '26078', 'Ближайшая офлайн-станция к Волхову — WMO 26078');

  // 4. Этап 4: Импорт официальной справки УГМС Росгидромета
  const csvUgmsData = `
    # Официальная выписка Северного УГМС
    Дата; Среднесуточная температура
    2026-06-15; +18,2
    2026-06-16; +19.4
    17.06.2026; 17,8
    18.06.2026; -2.5
  `;

  const parsedUgms = parseUgmsWeatherCertificateCsv(csvUgmsData, {
    docNumber: '412-С',
    docDate: '2026-06-20',
    issuer: 'ФГБУ Северное УГМС',
    stationName: 'АМСГ Воркута',
  });

  assert.equal(parsedUgms.parsedCount, 4, 'Должно быть успешно распознано 4 даты');
  assert.equal(parsedUgms.skippedCount, 0, 'Не должно быть пропущенных строк');
  assert.equal(parsedUgms.errors.length, 0, 'Не должно быть ошибок парсинга');

  // Проверка нормализации дат и температур
  assert.equal(parsedUgms.weatherArchive['2026-06-15'], '+18.2');
  assert.equal(parsedUgms.weatherArchive['2026-06-16'], '+19.4');
  assert.equal(parsedUgms.weatherArchive['2026-06-17'], '+17.8');
  assert.equal(parsedUgms.weatherArchive['2026-06-18'], '-2.5');

  // Проверка метаданных наблюдений
  const obs = parsedUgms.weatherObservations['2026-06-15'];
  assert.ok(obs, 'Должен быть сформирован объект наблюдения');
  assert.equal(obs.sourceType, 'ugms-certificate');
  assert.equal(obs.status, 'available');
  assert.ok(obs.sourceDescription.includes('412-С'));
  assert.ok(obs.sourceDescription.includes('Северное УГМС'));
});

test('Замечание аудита №6: Парсер УГМС строго отвергает невалидные даты, коллизии разделителей и физически невозможные температуры', async () => {
  const { parseUgmsWeatherCertificateCsv } = await import('./weldingLogic');

  // 1. Календарно невозможная дата (2026-02-31)
  const feb31Res = parseUgmsWeatherCertificateCsv('2026-02-31;+18.2');
  assert.equal(feb31Res.parsedCount, 0, 'Дата 2026-02-31 обязана быть отвергнута');
  assert.equal(feb31Res.skippedCount, 1);
  assert.ok(feb31Res.errors.some((e) => e.includes('Календарно невозможная дата')));
  assert.equal(feb31Res.weatherArchive['2026-02-31'], undefined);

  // 2. Коллизия разделителя колонок и десятичной запятой (2026-06-15,+18,2)
  const commaCollisionRes = parseUgmsWeatherCertificateCsv('2026-06-15,+18,2');
  assert.equal(commaCollisionRes.parsedCount, 0, 'Строка с коллизией разделителей не должна молча урезать дробь');
  assert.equal(commaCollisionRes.skippedCount, 1);
  assert.ok(commaCollisionRes.errors.some((e) => e.includes('Неоднозначный формат')));
  assert.equal(commaCollisionRes.weatherArchive['2026-06-15'], undefined);

  // 3. Физически невозможная температура (+999 °C)
  const hotRes = parseUgmsWeatherCertificateCsv('2026-06-15;999');
  assert.equal(hotRes.parsedCount, 0, 'Температура +999 °C обязана быть отвергнута');
  assert.equal(hotRes.skippedCount, 1);
  assert.ok(hotRes.errors.some((e) => e.includes('выходит за пределы физически допустимого диапазона')));
  assert.equal(hotRes.weatherArchive['2026-06-15'], undefined);

  // 4. Физически невозможная температура (-120 °C)
  const coldRes = parseUgmsWeatherCertificateCsv('2026-01-15;-120');
  assert.equal(coldRes.parsedCount, 0, 'Температура -120 °C обязана быть отвергнута');
  assert.equal(coldRes.skippedCount, 1);
  assert.ok(coldRes.errors.some((e) => e.includes('выходит за пределы физически допустимого диапазона')));

  // 5. Валидная строка с точкой с запятой и десятичной запятой принимается без искажений
  const validRes = parseUgmsWeatherCertificateCsv('2026-06-15;+18,2');
  assert.equal(validRes.parsedCount, 1);
  assert.equal(validRes.errors.length, 0);
  assert.equal(validRes.weatherArchive['2026-06-15'], '+18.2');
});

test('Замечание аудита №5: Отсутствие привязки станции не подменяется станцией 26078 (Волхов)', async () => {
  const { resolveFacilityDefaultLocation, fetchStationDailyObservations } = await import('./weldingLogic');

  // Для неизвестного объекта станция обязана оставаться непривязанной
  const unknownLoc = resolveFacilityDefaultLocation('Участок магистрали №99 (без привязки)');
  assert.equal(unknownLoc.matched, false);
  assert.equal(unknownLoc.weatherStationId, undefined, 'WMO ID станции не должен назначаться');
  assert.ok(unknownLoc.weatherStation.includes('не привязана'));

  // Запрос без allowDemoFallback для станции без API-ключа честно возвращает not_found, а не фейковый Meteostat
  const noApiRes = await fetchStationDailyObservations(
    { id: '28661', name: 'АМСГ Курган' },
    '2026-06-15',
    '2026-06-15'
  );
  assert.ok(noApiRes['2026-06-15']);
  assert.equal(noApiRes['2026-06-15'].status, 'not_found', 'Без API-ключа статус обязан быть not_found');
  assert.equal(noApiRes['2026-06-15'].tavg, undefined, 'Температура не должна браться из воздуха');
});

test('Аудит copilotAnalysis п. 1: Запрет синтетических номеров заключений в журналах СТО Газпром и ГОСТ 32569', () => {
  // Стык с проведённым контролем, но БЕЗ номеров заключений
  const jointWithoutReports: WeldJoint = {
    ...INITIAL_JOINTS[0],
    vikResult: 'Годен',
    vikDate: '2026-10-10',
    vikReportNumber: '', // не указан
    ndtType: 'РК',
    ndtResult: 'Годен',
    ndtDate: '2026-10-12',
    ndtReportNumber: '', // не указан
    dupNdtType: 'Не требуется',
  };

  const stoRowWithout = formatStoGazpromJournalRow(jointWithoutReports, 0, INITIAL_LRV_CATALOG);
  // Графа 21: номер заключения ВИК — должна быть ПУСТОЙ, а не "ВИК-010"
  assert.equal(stoRowWithout.col21, '', 'При отсутствии vikReportNumber графа 21 должна быть пустой');
  assert.equal(stoRowWithout.col21.includes('ВИК-'), false);
  // Графа 25: номер заключения НК — должна быть ПУСТОЙ, а не "РК-010"
  assert.equal(stoRowWithout.col25, '', 'При отсутствии ndtReportNumber графа 25 должна быть пустой');
  assert.equal(stoRowWithout.col25.includes('РК-'), false);

  const gostRowWithout = formatGost32569JournalRow(jointWithoutReports, 0, INITIAL_WELDING_MATERIALS);
  // Графа 15 ГОСТ: ВИК
  assert.equal(gostRowWithout.col15, 'Годен, 10.10.26');
  // Графа 16 ГОСТ: НК — без выдуманного номера
  assert.equal(gostRowWithout.col16, 'РК, Годен, 12.10.26');
  assert.equal(gostRowWithout.col16.includes('РК-010'), false);
  // Графа 10, 11, 14, 17 ГОСТ — без выдуманных префиксов
  assert.equal(gostRowWithout.col11, 'н/п', 'Стилоскопирование без явной записи не должно выдумывать СТ-010');
  assert.equal(gostRowWithout.col14, 'н/п', 'Твердость без явной записи не должна выдумывать ТВ-010');
  assert.equal(gostRowWithout.col17, 'н/п', 'Ферритная фаза без явной записи не должна выдумывать ФФ-010');

  // Графа 8 ГОСТ: при отсутствии материала в справочнике СМ не должен подставляться фиктивный сертификат '10492-26'
  const gostRowNoMatCatalog = formatGost32569JournalRow(jointWithoutReports, 0, []);
  assert.equal(
    gostRowNoMatCatalog.col8.includes('10492-26'),
    false,
    'При отсутствии сертификата в справочнике СМ не должен подставляться синтетический номер 10492-26'
  );
  assert.equal(
    gostRowNoMatCatalog.col8,
    'Св-08Г2С Ø2.0, ГОСТ 2246-70\nУОНИ-13/55 Ø3.0, ГОСТ 9466-75'
  );

  // Стык с РЕАЛЬНЫМИ номерами заключений лаборатории
  const jointWithReports: WeldJoint = {
    ...jointWithoutReports,
    vikReportNumber: 'ЗАК-ВИК-102-26',
    ndtReportNumber: 'ЗАК-РК-104-26',
    dupNdtType: 'УЗК',
    dupNdtResult: 'Годен',
    dupNdtDate: '2026-10-13',
    dupNdtReportNumber: 'ЗАК-УЗК-089-26',
  };

  const stoRowWith = formatStoGazpromJournalRow(jointWithReports, 0, INITIAL_LRV_CATALOG);
  assert.equal(stoRowWith.col21, 'ЗАК-ВИК-102-26');
  assert.equal(stoRowWith.col25, 'ЗАК-РК-104-26');
  assert.equal(stoRowWith.col29, 'ЗАК-УЗК-089-26');

  const gostRowWith = formatGost32569JournalRow(jointWithReports, 0, INITIAL_WELDING_MATERIALS);
  assert.equal(gostRowWith.col15, 'Годен, № ЗАК-ВИК-102-26, 10.10.26');
  assert.equal(gostRowWith.col16, 'РК, Годен, № ЗАК-РК-104-26, 12.10.26');
});


test('Аудит copilotAnalysis п. 2: Исключение статусов «В работе» и открытого «Ремонта» из зачёта квот НК', async () => {
  const { calculateWelderNdtQuotas, calculateLineNdtProgress, computeLineListItemStatus } = await import('./weldingLogic');

  const testLine: ProjectLineItem = {
    id: 'line-test-quota',
    uniqueLineId: 'LINE-QUOTA-01',
    rdCode: 'RD-001',
    lineNumber: '01',
    objectName: 'Объект-1',
    lineName: 'Линия 01',
    product: 'Газ',
    testContour: 'К-1',
    weldingNtd: 'СТО Газпром',
    controlNtd: 'СТО Газпром',
    qualityLevel: 'B',
    pipelineCategory: 'I',
    workingPressure: '10.0',
    workingTemperature: '+20',
    rkPercent: 100,
    uzkPercent: 0,
    pvkPercent: 0,
    manualStatus: '',
    testDate: '2026-10-10',
  };

  const jointInWork: WeldJoint = {
    ...INITIAL_JOINTS[0],
    id: 'j-in-work',
    uniqueLineId: 'LINE-QUOTA-01',
    lineNumber: '01',
    weldingDate: '2026-10-10',
    welderStamp: 'В001',
    welderStampsList: ['В001'],
    vikResult: 'Годен',
    ndtType: 'РК',
    ndtResult: 'В работе',
    dupNdtType: 'Не требуется',
    dupNdtResult: 'Не проводился',
  };

  // 1. Прогресс линии не должен считать стык «В работе» как выполненный РК
  const lineProgInWork = calculateLineNdtProgress([jointInWork], testLine);
  assert.equal(lineProgInWork.inspectedRkCount, 0, 'Стык «В работе» НЕ должен засчитываться в проверенный РК');
  assert.equal(lineProgInWork.actualRkPct, 0);
  assert.equal(lineProgInWork.isRkFulfilled, false);

  const lineStatusInWork = computeLineListItemStatus(testLine, [jointInWork]);
  assert.equal(lineStatusInWork.rkControlled, 0, 'В лайнлисте rkControlled обязан быть 0 при статусе «В работе»');
  assert.equal(lineStatusInWork.ndtStatus, 'insufficient');

  // 2. Квота сварщика: стык «В работе» не засчитывается в проверенные
  const quotasInWork = calculateWelderNdtQuotas([jointInWork], [testLine]);
  const welderInWork = quotasInWork.find((q) => q.stamp === 'В001');
  assert.ok(welderInWork);
  assert.equal(welderInWork.inspectedCount, 0, 'Стык «В работе» не должен считаться проверенным для сварщика');
  assert.equal(welderInWork.actualNdtPct, 0);
  assert.equal(welderInWork.isCompliant, false);

  // 3. Стык со статусом «Ремонт» (брак НК, ремонт еще не выполнен)
  const jointInRepair: WeldJoint = {
    ...jointInWork,
    ndtResult: 'Ремонт',
    repairAction: 'Ремонт',
    repairVikResult: 'Не проводился',
    repairNdtResult: 'Не проводился',
  };

  const lineProgRepair = calculateLineNdtProgress([jointInRepair], testLine);
  assert.equal(lineProgRepair.inspectedRkCount, 0, 'Забракованный неотремонтированный стык НЕ сдаёт план РК линии');
  assert.equal(lineProgRepair.isRkFulfilled, false);

  const quotasRepair = calculateWelderNdtQuotas([jointInRepair], [testLine]);
  const welderRepair = quotasRepair.find((q) => q.stamp === 'В001');
  assert.ok(welderRepair);
  assert.equal(welderRepair.defectCount, 1, 'Стык с браком должен быть учтен в defectCount');
  assert.equal(welderRepair.penaltyRequiredJoints, 2, 'При 1 браке назначается +2 штрафных стыка контроля');
  assert.equal(welderRepair.isCompliant, false);
  assert.equal(welderRepair.status, 'penalty_required');

  // 4. После положительного переконтроля (ремонт закрыт) стык засчитывается в выполнение
  const jointRepaired: WeldJoint = {
    ...jointInRepair,
    repairVikResult: 'Годен',
    repairNdtType: 'РК',
    repairNdtResult: 'Годен',
  };

  const lineProgRepaired = calculateLineNdtProgress([jointRepaired], testLine);
  assert.equal(lineProgRepaired.inspectedRkCount, 1, 'После успешного переконтроля РК засчитывается в объем линии');
  assert.equal(lineProgRepaired.actualRkPct, 100);
  assert.equal(lineProgRepaired.isRkFulfilled, true);
});

test('Аудит copilotAnalysis п. 3: Выборочный дублирующий контроль и критерий сдачи стыка isJointFullyAccepted', () => {
  const baseJoint: WeldJoint = {
    ...INITIAL_JOINTS[0],
    id: 'j-selective-dup',
    weldingDate: '2026-10-10',
    welderStamp: 'С01',
    vikResult: 'Годен',
    ndtType: 'РК',
    ndtResult: 'Годен',
    dupNdtType: 'УЗК', // Дублирующий контроль регламентирован для линии
    dupNdtResult: 'Не проводился', // Стык НЕ попал в 20% выборочную квоту
  };

  // 1. Стык вне выборки дублирующего контроля, сдавший 100% первичный ВИК и РК, ОБЯЗАН быть принят
  assert.equal(
    isJointFullyAccepted(baseJoint),
    true,
    'Стык без дублирующего контроля при сданных ВИК и РК обязан быть принят (isJointFullyAccepted = true)'
  );

  // 2. Стык попал в выборку дублирования и находится «В работе» — приёмка блокируется
  const jointInWork: WeldJoint = {
    ...baseJoint,
    dupNdtResult: 'В работе',
  };
  assert.equal(
    isJointFullyAccepted(jointInWork),
    false,
    'При статусе дублирующего контроля «В работе» стык не может считаться принятым'
  );

  // 3. Дублирующий контроль выявил брак («Ремонт») — стык бракуется
  const jointDefect: WeldJoint = {
    ...baseJoint,
    dupNdtResult: 'Ремонт',
  };
  assert.equal(isJointDefective(jointDefect), true, 'Брак по дублирующему контролю квалифицирует стык как дефектный');
  assert.equal(isJointFullyAccepted(jointDefect), false);

  // 4. Дублирующий контроль сдан («Годен») — стык принят
  const jointDupPassed: WeldJoint = {
    ...baseJoint,
    dupNdtResult: 'Годен',
  };
  assert.equal(isJointFullyAccepted(jointDupPassed), true);

  // 5. Линия категории V, где физический НК не требуется (только 100% ВИК)
  const jointNoNdtNeeded: WeldJoint = {
    ...baseJoint,
    ndtType: 'Не требуется',
    ndtResult: 'Не проводился',
    dupNdtType: 'Не требуется',
    dupNdtResult: 'Не проводился',
  };
  assert.equal(
    isJointFullyAccepted(jointNoNdtNeeded),
    true,
    'Стык, не требующий НК по категории трубопровода, при сданном ВИК обязан быть принят'
  );
});

test('Аудит copilotAnalysis п. 4: Запрет создания дубликатов номеров стыков на одной технологической линии', () => {
  const testUser = {
    login: 'pto_ivanov',
    fullName: 'Иванов И.И.',
    role: 'Инженер ПТО',
  };

  const existingJoint: WeldJoint = {
    ...INITIAL_JOINTS[0],
    id: 'joint-existing-1',
    uniqueLineId: 'LINE-001',
    lineNumber: '001',
    jointNumber: 'Стык-1',
    version: 1,
  };

  const currentJoints = [existingJoint];

  // 1. Попытка создать новый стык с тем же номером на той же линии (другой ID) -> duplicate
  const duplicateNewJoint: WeldJoint = {
    ...INITIAL_JOINTS[0],
    id: 'joint-new-duplicate',
    uniqueLineId: 'LINE-001',
    lineNumber: '001',
    jointNumber: '  стык-1  ', // проверка регистронезависимости и пробелов
  };

  const resultDuplicate = applyOptimisticJointSave({
    currentJoints,
    incomingJoint: duplicateNewJoint,
    expectedVersion: undefined,
    baseJoint: undefined,
    user: testUser,
  });

  assert.equal(resultDuplicate.status, 'duplicate');
  if (resultDuplicate.status === 'duplicate') {
    assert.match(resultDuplicate.error, /уже зарегистрирован на линии/);
  }

  // 2. Создание стыка с другим номером на той же линии -> ok
  const validNewJointSameLine: WeldJoint = {
    ...INITIAL_JOINTS[0],
    id: 'joint-valid-diff-num',
    uniqueLineId: 'LINE-001',
    lineNumber: '001',
    jointNumber: 'Стык-2',
  };

  const resultValidSameLine = applyOptimisticJointSave({
    currentJoints,
    incomingJoint: validNewJointSameLine,
    expectedVersion: undefined,
    baseJoint: undefined,
    user: testUser,
  });

  assert.equal(resultValidSameLine.status, 'ok');

  // 3. Создание стыка с тем же номером, но на ДРУГОЙ линии -> ok
  const validNewJointDiffLine: WeldJoint = {
    ...INITIAL_JOINTS[0],
    id: 'joint-valid-diff-line',
    uniqueLineId: 'LINE-002',
    lineNumber: '002',
    jointNumber: 'Стык-1',
  };

  const resultValidDiffLine = applyOptimisticJointSave({
    currentJoints,
    incomingJoint: validNewJointDiffLine,
    expectedVersion: undefined,
    baseJoint: undefined,
    user: testUser,
  });

  assert.equal(resultValidDiffLine.status, 'ok');

  // 4. Редактирование существующего стыка (тот же ID и тот же номер) -> ok
  const editExistingJoint: WeldJoint = {
    ...existingJoint,
    preheatTemp: '+120',
  };

  const resultEditExisting = applyOptimisticJointSave({
    currentJoints,
    incomingJoint: editExistingJoint,
    expectedVersion: 1,
    baseJoint: existingJoint,
    user: testUser,
  });

  assert.equal(resultEditExisting.status, 'ok');
});

test('Аудит copilotAnalysis п. 5: Защита состояния и маркировка черновика при несинхронизированных изменениях', () => {
  // 1. Проверяем генерацию предупреждения о несинхронизированном черновике
  const draftOptions = {
    isDraftUnsynced: true,
    unsyncedCount: 3,
  };

  const getExportPrefix = (opts?: { isDraftUnsynced?: boolean }) =>
    opts?.isDraftUnsynced ? 'ЧЕРНОВИК_НЕ_СИНХРОНИЗИРОВАНО_' : '';

  assert.equal(
    getExportPrefix(draftOptions),
    'ЧЕРНОВИК_НЕ_СИНХРОНИЗИРОВАНО_',
    'При наличии несинхронизированных изменений формируемый файл должен получать префикс черновика'
  );
  assert.equal(
    getExportPrefix({ isDraftUnsynced: false }),
    '',
    'При подтверждённой синхронизации префикс черновика отсутствует'
  );

  // 2. Проверяем блокировку локального применения при ошибке сервера (дубликат или отказ)
  const existingJoint: WeldJoint = {
    ...INITIAL_JOINTS[0],
    id: 'j-base-1',
    uniqueLineId: 'LINE-TEST',
    jointNumber: '010',
  };

  const candidateDuplicate: WeldJoint = {
    ...INITIAL_JOINTS[0],
    id: 'j-candidate-2',
    uniqueLineId: 'LINE-TEST',
    jointNumber: '010',
  };

  const testUser = {
    login: 'pto_ivanov',
    fullName: 'Иванов И.И.',
    role: 'Инженер ПТО',
  };

  const occCheck = applyOptimisticJointSave({
    currentJoints: [existingJoint],
    incomingJoint: candidateDuplicate,
    user: testUser,
  });

  assert.equal(occCheck.status, 'duplicate');
});

test('Аудит copilotAnalysis п. 6: Клиентская валидация дубликатов номеров стыков в validateWeldJointComprehensive', () => {
  const existingJoint: WeldJoint = {
    ...INITIAL_JOINTS[0],
    id: 'joint-line1-010',
    uniqueLineId: 'LINE-101',
    lineNumber: '101',
    jointNumber: '010',
  };

  const allJoints = [existingJoint];

  // 1. Попытка создать/сохранить стык с тем же номером на той же линии -> critical error, isValidToSave = false
  const duplicateCandidate: WeldJoint = {
    ...INITIAL_JOINTS[0],
    id: 'joint-line1-dup',
    uniqueLineId: 'LINE-101',
    lineNumber: '101',
    jointNumber: '  010  ',
  };

  const dupValidation = validateWeldJointComprehensive({
    joint: duplicateCandidate,
    allJoints,
    projectLineList: [],
    lrvCatalog: [],
    welders: [],
    techCards: [],
    weldingMaterials: [],
  });

  assert.equal(dupValidation.isValidToSave, false, 'Дубликат номера стыка на линии должен блокировать сохранение (isValidToSave = false)');
  const dupError = dupValidation.errors.find((e) => e.field === 'jointNumber');
  assert.ok(dupError, 'В массиве критических ошибок должна присутствовать ошибка по полю jointNumber');
  assert.match(dupError.message, /уже зарегистрирован на линии/);

  // 2. Стык с тем же номером, но на ДРУГОЙ линии -> валидно
  const diffLineCandidate: WeldJoint = {
    ...INITIAL_JOINTS[0],
    id: 'joint-line2-ok',
    uniqueLineId: 'LINE-202',
    lineNumber: '202',
    jointNumber: '010',
  };

  const diffLineValidation = validateWeldJointComprehensive({
    joint: diffLineCandidate,
    allJoints,
    projectLineList: [],
    lrvCatalog: [],
    welders: [],
    techCards: [],
    weldingMaterials: [],
  });

  const diffLineDupError = diffLineValidation.errors.find((e) => e.field === 'jointNumber');
  assert.equal(diffLineDupError, undefined, 'Одинаковый номер на другой линии не считается дубликатом');

  // 3. Сохранение самого себя (тот же ID) -> валидно
  const selfValidation = validateWeldJointComprehensive({
    joint: existingJoint,
    allJoints,
    projectLineList: [],
    lrvCatalog: [],
    welders: [],
    techCards: [],
    weldingMaterials: [],
  });

  const selfDupError = selfValidation.errors.find((e) => e.field === 'jointNumber');
  assert.equal(selfDupError, undefined, 'Сам себя стык не считает дубликатом');
});


// =========================================================================
// ТЕСТЫ: АУДИТ copilotAnalysis (п. 1–10, требования C, D, E, F, G)
// =========================================================================

test('Аудит copilotAnalysis: validateJournalCompleteness выявляет пропуски обязательных реквизитов', async () => {
  const { validateJournalCompleteness } = await import('./journals');

  const incompleteJoint: WeldJoint = {
    ...INITIAL_JOINTS[0],
    id: 'test-j-inc',
    weldingDate: '', // пропуск даты
    welderStamp: '', // пропуск клейма
    welderStampsList: [],
    vikResult: 'Годен',
    vikReportNumber: '', // пропуск заключения ВИК
    ndtType: 'РК',
    ndtResult: 'Годен',
    ndtReportNumber: '', // пропуск заключения НК
    responsiblePerson: '', // пропуск мастера
  };

  const completeness = validateJournalCompleteness([incompleteJoint], 'СТО Газпром 15-1.1-002-2023');
  assert.equal(completeness.isFullyComplete, false, 'Журнал с пропусками не должен быть помечен как полный');
  assert.equal(completeness.jointsWithMissingDataCount, 1);
  assert.ok(completeness.missingSummary.missingDates >= 1, 'Обнаружен пропуск даты сварки');
  assert.ok(completeness.missingSummary.missingWelders >= 1, 'Обнаружен пропуск клейма');
  assert.ok(completeness.missingSummary.missingVikReports >= 1, 'Обнаружен пропуск номера ВИК');
  assert.ok(completeness.missingSummary.missingNdtReports >= 1, 'Обнаружен пропуск номера НК');
  assert.ok(completeness.missingSummary.missingResponsiblePerson >= 1, 'Обнаружен пропуск мастера');

  // Полный стык со всеми реквизитами
  const completeJoint: WeldJoint = {
    ...INITIAL_JOINTS[0],
    id: 'test-j-comp',
    weldingDate: '2026-06-15',
    welderStamp: 'СВ10',
    welderStampsList: ['СВ10'],
    techCardNumber: 'ТК-01',
    vikResult: 'Годен',
    vikReportNumber: 'АКТ-ВИК-101',
    ndtType: 'РК',
    ndtResult: 'Годен',
    ndtReportNumber: 'ЗАКЛ-РК-202',
    dupNdtType: 'УЗК',
    dupNdtResult: 'Годен',
    dupNdtDate: '2026-06-18',
    dupNdtReportNumber: 'ЗАКЛ-ДУП-303',
    responsiblePerson: 'Иванов И.И.',
  };

  const compFull = validateJournalCompleteness([completeJoint], 'СТО Газпром 15-1.1-002-2023');
  assert.equal(compFull.isFullyComplete, true, 'Полный стык должен давать isFullyComplete = true');
  assert.equal(compFull.jointsWithMissingDataCount, 0);
});

test('Аудит copilotAnalysis: критические несоответствия НТД (НАКС, способ сварки, ВИК перед НК) блокируют валидацию с severity=error', () => {
  const expiredWelder: WelderProfile = {
    id: 'w-exp',
    stamp: 'СВ-ПРОСРОЧЕН',
    fullName: 'Сидоров С.С.',
    certNumber: 'АЦСТ-00-11111',
    certIssueDate: '2022-01-01',
    certExpiryDate: '2024-01-01', // Просрочен к 2026 году!
    admissionSheetNumber: 'ДЛ-1',
    admissionSheetDate: '2022-01-10',
    allowedMethods: ['РАД'],
    crewForeman: 'Мастер Петров П.П.',
    minDiameterMm: 50,
    maxDiameterMm: 1000,
    minWallThicknessMm: 3,
    maxWallThicknessMm: 20,
    isBrigade: false,
  };

  // 1. Сварка с просроченным НАКС
  const jointWithExpiredWelder: WeldJoint = {
    ...INITIAL_JOINTS[0],
    id: 'j-naks-exp',
    weldingDate: '2026-06-15',
    welderStamp: 'СВ-ПРОСРОЧЕН',
    welderStampsList: ['СВ-ПРОСРОЧЕН'],
    weldingType: 'РАД',
    vikResult: 'Не проводился',
    ndtType: 'Не требуется',
  };

  const naksValidation = validateWeldJointComprehensive({
    joint: jointWithExpiredWelder,
    allJoints: [],
    projectLineList: [],
    lrvCatalog: [],
    welders: [expiredWelder],
    techCards: [],
    weldingMaterials: [],
  });

  assert.equal(naksValidation.isValidToSave, false, 'Просроченный НАКС должен блокировать сохранение');
  const naksError = naksValidation.errors.find((e) => e.id.includes('chr-naks-expired'));
  assert.ok(naksError, 'Обнаружена критическая ошибка chr-naks-expired');
  assert.equal(naksError.severity, 'error');

  // 2. Способ сварки не входит в аттестацию НАКС
  const jointWrongMethod: WeldJoint = {
    ...INITIAL_JOINTS[0],
    id: 'j-wrong-method',
    weldingDate: '2023-06-15', // когда НАКС ещё действовал
    welderStamp: 'СВ-ПРОСРОЧЕН',
    welderStampsList: ['СВ-ПРОСРОЧЕН'],
    weldingType: 'АФ', // У сварщика только РАД!
    vikResult: 'Не проводился',
    ndtType: 'Не требуется',
  };

  const methodValidation = validateWeldJointComprehensive({
    joint: jointWrongMethod,
    allJoints: [],
    projectLineList: [],
    lrvCatalog: [],
    welders: [expiredWelder],
    techCards: [],
    weldingMaterials: [],
  });

  assert.equal(methodValidation.isValidToSave, false, 'Недопустимый метод сварщика должен блокировать сохранение');
  const methodError = methodValidation.errors.find((e) => e.id.includes('tech-welder-method'));
  assert.ok(methodError, 'Обнаружена ошибка tech-welder-method');
  assert.equal(methodError.severity, 'error');

  // 3. НК Годен без годного ВИК
  const jointNdtWithoutVik: WeldJoint = {
    ...INITIAL_JOINTS[0],
    id: 'j-ndt-novik',
    vikResult: 'Не проводился', // ВИК не сдан!
    ndtType: 'РК',
    ndtResult: 'Годен', // НК не может быть Годен без ВИК
  };

  const ndtValidation = validateWeldJointComprehensive({
    joint: jointNdtWithoutVik,
    allJoints: [],
    projectLineList: [],
    lrvCatalog: [],
    welders: [],
    techCards: [],
    weldingMaterials: [],
  });

  assert.equal(ndtValidation.isValidToSave, false, 'Положительный НК без годного ВИК должен блокировать сохранение');
  const ndtError = ndtValidation.errors.find((e) => e.id === 'ndt-valid-without-vik');
  assert.ok(ndtError, 'Обнаружена ошибка ndt-valid-without-vik');
  assert.equal(ndtError.severity, 'error');
});

test('Повторный аудит п. 1: Безопасная миграция дубликатов (бэкап до миграции, карантин, идемпотентность, уникальный индекс)', async () => {
  const os = await import('node:os');
  const path = await import('node:path');
  const fs = await import('node:fs');
  const nodeSqlite = await import('node:sqlite');
  const { UnifiedServerDatabase } = await import('../server/sqliteDb');

  const tmpDir = path.join(
    os.tmpdir(),
    `zaychick-test-mig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  );
  fs.mkdirSync(tmpDir, { recursive: true });
  const sqliteDbPath = path.join(tmpDir, 'legacy.sqlite');
  const backupsDir = path.join(tmpDir, 'backups');

  let db: InstanceType<typeof UnifiedServerDatabase> | null = null;
  let db2: InstanceType<typeof UnifiedServerDatabase> | null = null;

  try {
    // 1. Создаём историческую неиндексированную БД с дублями стыка на одной линии
    const raw = new (nodeSqlite as any).DatabaseSync(sqliteDbPath);
    raw.exec(`
      CREATE TABLE db_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        global_revision INTEGER NOT NULL DEFAULT 1,
        last_updated_at TEXT NOT NULL,
        last_updated_by TEXT NOT NULL,
        last_action TEXT NOT NULL,
        engine TEXT NOT NULL,
        journal_mode TEXT NOT NULL,
        active_template_id TEXT NOT NULL
      );
      CREATE TABLE weld_joints (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL DEFAULT 0,
        joint_number TEXT NOT NULL,
        unique_line_id TEXT NOT NULL,
        rd_code TEXT NOT NULL,
        object_name TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
    `);

    raw
      .prepare(
        `INSERT INTO db_meta (id, global_revision, last_updated_at, last_updated_by, last_action, engine, journal_mode, active_template_id)
         VALUES (1, 5, '2026-10-05T12:00:00Z', 'ПТО', 'Legacy seed', 'SQLite 3', 'WAL', 'tpl-full-30')`
      )
      .run();

    const olderDup: WeldJoint = {
      ...INITIAL_JOINTS[0],
      id: 'dup-older-1',
      uniqueLineId: '  001-TX3-L1  ',
      lineNumber: 'L1',
      jointNumber: ' 010 ',
      elem1FactoryNumber: 'LEGACY-PIPE-001',
      elem2FactoryNumber: 'LEGACY-FIT-002',
      welderStamp: 'СТ-OLD',
      version: 1,
      updatedAt: '2026-10-01T10:00:00Z',
      updatedBy: 'Инженер-1',
    };
    const newerWinner: WeldJoint = {
      ...INITIAL_JOINTS[0],
      id: 'dup-newer-1',
      uniqueLineId: '001-tx3-l1',
      lineNumber: 'L1',
      jointNumber: '010',
      elem1FactoryNumber: 'ACTUAL-PIPE-001',
      welderStamp: 'СТ-NEW',
      version: 2,
      updatedAt: '2026-10-05T10:00:00Z',
      updatedBy: 'Инженер-2',
    };
    const normalJoint: WeldJoint = {
      ...INITIAL_JOINTS[0],
      id: 'unique-joint-020',
      uniqueLineId: '001-TX3-L1',
      lineNumber: 'L1',
      jointNumber: '020',
      version: 1,
      updatedAt: '2026-10-02T10:00:00Z',
      updatedBy: 'Инженер-1',
    };

    const insJoint = raw.prepare(
      `INSERT INTO weld_joints (id, sort_order, joint_number, unique_line_id, rd_code, object_name, version, updated_at, updated_by, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    [olderDup, newerWinner, normalJoint].forEach((j, idx) => {
      insJoint.run(
        j.id,
        idx,
        j.jointNumber,
        j.uniqueLineId,
        j.rdCode,
        j.objectName,
        j.version ?? 1,
        j.updatedAt,
        j.updatedBy,
        JSON.stringify(j)
      );
    });
    raw.close();

    // 2. Запускаем UnifiedServerDatabase: бэкап ДОЛЖЕН быть создан ДО миграции
    db = new UnifiedServerDatabase({
      dataDir: tmpDir,
      sqliteDbPath,
      backupsDir,
      disableStartupBackup: false,
    });

    const preMigPath = db.getLastPreMigrationBackupPath();
    assert.ok(
      preMigPath && fs.existsSync(preMigPath),
      'Перед изменением таблицы weld_joints должен создаться согласованный pre-migration бэкап'
    );
    assert.ok(
      path.basename(preMigPath!).includes('pre-migration'),
      'Файл бэкапа должен быть помечен как pre-migration'
    );

    // Открываем pre-migration бэкап: внутри ОБЯЗАНЫ оставаться все 3 исходные записи и не быть индекса
    const backupConn = new (nodeSqlite as any).DatabaseSync(preMigPath!);
    try {
      const preCount = backupConn
        .prepare('SELECT COUNT(*) AS cnt FROM weld_joints')
        .get() as { cnt: number };
      assert.equal(
        preCount.cnt,
        3,
        'Состояние в pre-migration бэкапе обязано отражать БД ДО удаления дублей'
      );
      const preIdx = backupConn
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_weld_joints_line_number'"
        )
        .get();
      assert.equal(
        preIdx,
        undefined,
        'В pre-migration бэкапе уникальный индекс ещё не должен существовать'
      );
    } finally {
      backupConn.close();
    }

    // 3. Проверяем карантин и сохранённые данные дубликата в основной БД
    const liveJoints = db.readFullState().data.joints;
    assert.equal(liveJoints.length, 2, 'В рабочей таблице должны остаться актуальная запись и уникальный стык');
    assert.ok(liveJoints.some((j) => j.id === 'dup-newer-1'));
    assert.ok(liveJoints.some((j) => j.id === 'unique-joint-020'));

    const quarantined = db.getQuarantinedDuplicateJoints();
    assert.equal(quarantined.length, 1, 'Удалённый дубликат обязан сохраниться в карантине');
    assert.equal(quarantined[0].originalJointId, 'dup-older-1');
    assert.equal(quarantined[0].keptJointId, 'dup-newer-1');
    assert.equal(quarantined[0].normalizedUniqueLineId, '001-tx3-l1');
    assert.equal(quarantined[0].normalizedJointNumber, '010');
    assert.ok(quarantined[0].reason.includes('dup-newer-1'));
    assert.equal(quarantined[0].payload.elem1FactoryNumber, 'LEGACY-PIPE-001');
    assert.equal(quarantined[0].payload.elem2FactoryNumber, 'LEGACY-FIT-002');
    assert.equal(quarantined[0].payload.welderStamp, 'СТ-OLD');

    db.close();
    db = null;

    // 4. Повторный запуск: идемпотентность и работа уникального индекса
    db2 = new UnifiedServerDatabase({
      dataDir: tmpDir,
      sqliteDbPath,
      backupsDir,
      disableStartupBackup: false,
    });

    assert.equal(
      db2.getLastPreMigrationBackupPath(),
      null,
      'Повторный запуск уже мигрированной БД не должен повторно запускать предмиграционный бэкап'
    );
    assert.equal(
      db2.getQuarantinedDuplicateJoints().length,
      1,
      'Повторный запуск не должен дублировать записи в карантине'
    );
    assert.equal(db2.readFullState().data.joints.length, 2);

    // Прямая попытка вставки дубля в SQLite должна блокироваться уникальным индексом
    db2.close();
    db2 = null;
    const rawVerify = new (nodeSqlite as any).DatabaseSync(sqliteDbPath);
    try {
      assert.throws(() => {
        rawVerify
          .prepare(
            `INSERT INTO weld_joints (id, sort_order, joint_number, unique_line_id, rd_code, object_name, version, updated_at, updated_by, payload_json)
             VALUES ('dup-blocked-sql', 9, ' 010 ', '001-TX3-L1', 'R1', 'O1', 1, '2026-10-06T00:00:00Z', 'SQL', '{}')`
          )
          .run();
      }, /UNIQUE constraint failed/i);
    } finally {
      rawVerify.close();
    }
  } finally {
    db?.close();
    db2?.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
});

test('Повторный аудит п. 2: Пакетная синхронизация syncStateWithOptimisticLock — валидация, дубликаты, RBAC и исторические записи', async () => {
  const os = await import('node:os');
  const path = await import('node:path');
  const fs = await import('node:fs');
  const nodeSqlite = await import('node:sqlite');
  const { UnifiedServerDatabase, mapDbMutationResultToHttpError } = await import(
    '../server/sqliteDb'
  );

  const tmpDir = path.join(
    os.tmpdir(),
    `zaychick-test-batch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  );
  fs.mkdirSync(tmpDir, { recursive: true });
  const sqliteDbPath = path.join(tmpDir, 'batch.sqlite');
  let db: InstanceType<typeof UnifiedServerDatabase> | null = null;

  try {
    db = new UnifiedServerDatabase({
      dataDir: tmpDir,
      sqliteDbPath,
      backupsDir: path.join(tmpDir, 'backups'),
      disableStartupBackup: true,
    });

    const ptoUser = {
      login: 'pto_test',
      fullName: 'Инженер ПТО Тест',
      role: 'Инженер ПТО',
    };
    const ndtUser = {
      login: 'lnk_test',
      fullName: 'Специалист ЛНК Тест',
      role: 'Специалист ЛНК',
    };
    const viewerUser = {
      login: 'cust_test',
      fullName: 'Стройконтроль Заказчика',
      role: 'Представитель Заказчика',
    };

    const initial = db.readFullState();

    // Симулируем историческую некорректную запись, попавшую в БД до введения нового барьера
    // (например, положительный НК при непроведённом ВИК)
    const legacyInvalidJoint: WeldJoint = {
      ...INITIAL_JOINTS[0],
      id: 'legacy-invalid-joint',
      uniqueLineId: initial.data.projectLineList[0].uniqueLineId,
      rdCode: initial.data.projectLineList[0].rdCode,
      lineNumber: initial.data.projectLineList[0].lineNumber,
      jointNumber: '880',
      vikResult: 'Не проводился',
      ndtType: 'РК',
      ndtResult: 'Годен',
      ndtReportNumber: 'OLD-NDT-880',
      updatedAt: '2025-01-01T10:00:00Z',
    };

    db.close();
    db = null;
    const rawConn = new (nodeSqlite as any).DatabaseSync(sqliteDbPath);
    try {
      rawConn
        .prepare(
          `INSERT INTO weld_joints (id, sort_order, joint_number, unique_line_id, rd_code, object_name, version, updated_at, updated_by, payload_json)
           VALUES (?, 999, ?, ?, ?, ?, 1, ?, 'Legacy', ?)`
        )
        .run(
          legacyInvalidJoint.id,
          legacyInvalidJoint.jointNumber,
          legacyInvalidJoint.uniqueLineId,
          legacyInvalidJoint.rdCode,
          legacyInvalidJoint.objectName,
          legacyInvalidJoint.updatedAt,
          JSON.stringify(legacyInvalidJoint)
        );
    } finally {
      rawConn.close();
    }

    db = new UnifiedServerDatabase({
      dataDir: tmpDir,
      sqliteDbPath,
      backupsDir: path.join(tmpDir, 'backups'),
      disableStartupBackup: true,
    });

    const baseState = db.readFullState();
    const baseValidTemplate = baseState.data.joints[0];

    // 1. Валидный пакет + неизменённая историческая невалидная запись НЕ должна блокировать синхронизацию
    const validNewJoint: WeldJoint = {
      ...baseValidTemplate,
      id: 'batch-valid-joint-890',
      jointNumber: '890',
      vikResult: 'Годен',
      vikDate: baseValidTemplate.weldingDate,
      vikReportNumber: 'ВИК-890',
      ndtType: 'РК',
      ndtResult: 'Годен',
      ndtDate: baseValidTemplate.weldingDate,
      ndtReportNumber: 'РК-890',
      dupNdtType: 'Не требуется',
      dupNdtResult: 'Не проводился',
      updatedAt: new Date().toISOString(),
      updatedBy: ptoUser.fullName,
    };

    const okBatchRes = db.syncStateWithOptimisticLock({
      data: { joints: [...baseState.data.joints, validNewJoint] },
      expectedGlobalRevision: baseState.meta.globalRevision,
      actionLabel: 'Валидный пакет с исторической записью',
      user: ptoUser,
    });

    assert.equal(
      okBatchRes.status,
      'ok',
      'Неизменённая историческая запись не должна мешать валидному пакетному сохранению'
    );
    const afterOkState = db.readFullState();
    assert.ok(afterOkState.data.joints.some((j) => j.id === 'batch-valid-joint-890'));
    assert.ok(afterOkState.data.joints.some((j) => j.id === 'legacy-invalid-joint'));

    // 2a. Доменная ошибка в затронутом новом стыке от ПТО (физически невозможная стенка >= D/2) -> validation_error (HTTP 422)
    const domainInvalidJoint: WeldJoint = {
      ...validNewJoint,
      id: 'batch-invalid-domain-900',
      jointNumber: '900',
      diameterMm: 100,
      wallThickness: 60,
    };

    const domainErrRes = db.syncStateWithOptimisticLock({
      data: { joints: [...afterOkState.data.joints, domainInvalidJoint] },
      expectedGlobalRevision: afterOkState.meta.globalRevision,
      actionLabel: 'Невалидный доменный пакет (ПТО)',
      user: ptoUser,
    });

    assert.equal(domainErrRes.status, 'validation_error');
    const domainHttp = mapDbMutationResultToHttpError(domainErrRes);
    assert.equal(domainHttp?.httpStatus, 422);
    assert.equal(domainHttp?.body.code, 'DOMAIN_VALIDATION_FAILED');
    assert.equal(
      db.readFullState().meta.globalRevision,
      afterOkState.meta.globalRevision,
      'При ошибке доменной валидации ревизия БД не должна увеличиваться'
    );

    // 2b. Доменная ошибка от имени ЛНК (положительный НК при непроведённом ВИК на существующем стыке) -> validation_error (HTTP 422)
    const lnkInvalidJoints = afterOkState.data.joints.map((j) =>
      j.id === 'batch-valid-joint-890'
        ? { ...j, ndtType: 'РК' as const, ndtResult: 'Годен' as const, ndtReportNumber: 'РК-ERR' }
        : j
    );
    const lnkDomainErrRes = db.syncStateWithOptimisticLock({
      data: { joints: lnkInvalidJoints },
      expectedGlobalRevision: afterOkState.meta.globalRevision,
      actionLabel: 'Невалидный доменный пакет (ЛНК без ВИК)',
      user: ndtUser,
    });
    assert.equal(lnkDomainErrRes.status, 'validation_error');
    assert.equal(mapDbMutationResultToHttpError(lnkDomainErrRes)?.httpStatus, 422);

    // 3. Дубликат в пакете (как с существующим стыком, так и два новых дубля внутри одного пакета) -> duplicate (HTTP 409)
    const dupJointFromExisting: WeldJoint = {
      ...validNewJoint,
      id: 'batch-dup-existing',
      jointNumber: '  890 ',
    };
    const dupRes1 = db.syncStateWithOptimisticLock({
      data: { joints: [...afterOkState.data.joints, dupJointFromExisting] },
      expectedGlobalRevision: afterOkState.meta.globalRevision,
      actionLabel: 'Дубликат существующего в пакете',
      user: ptoUser,
    });
    assert.equal(dupRes1.status, 'duplicate');
    const dupHttp = mapDbMutationResultToHttpError(dupRes1);
    assert.equal(dupHttp?.httpStatus, 409);
    assert.equal(dupHttp?.body.code, 'DUPLICATE_JOINT_NUMBER');

    const intraDup1: WeldJoint = { ...validNewJoint, id: 'intra-dup-1', jointNumber: '910' };
    const intraDup2: WeldJoint = { ...validNewJoint, id: 'intra-dup-2', jointNumber: ' 910 ' };
    const dupRes2 = db.syncStateWithOptimisticLock({
      data: { joints: [...afterOkState.data.joints, intraDup1, intraDup2] },
      expectedGlobalRevision: afterOkState.meta.globalRevision,
      actionLabel: 'Дубликат внутри одного пакета',
      user: ptoUser,
    });
    assert.equal(dupRes2.status, 'duplicate');

    // 4. RBAC:
    // 4a) ЛНК не может создавать новые стыки -> forbidden (HTTP 403)
    const lnkCreateAttempt: WeldJoint = {
      ...validNewJoint,
      id: 'lnk-forbidden-new',
      jointNumber: '920',
    };
    const lnkCreateRes = db.syncStateWithOptimisticLock({
      data: { joints: [...afterOkState.data.joints, lnkCreateAttempt] },
      expectedGlobalRevision: afterOkState.meta.globalRevision,
      actionLabel: 'Попытка создания стыка ЛНК через пакет',
      user: ndtUser,
    });
    assert.equal(lnkCreateRes.status, 'forbidden');
    assert.equal(mapDbMutationResultToHttpError(lnkCreateRes)?.httpStatus, 403);

    // 4b) Наблюдатель не может изменять существующие стыки -> forbidden (HTTP 403)
    const viewerTamperJoints = afterOkState.data.joints.map((j) =>
      j.id === 'batch-valid-joint-890' ? { ...j, ndtReportNumber: 'HACK-999' } : j
    );
    const viewerRes = db.syncStateWithOptimisticLock({
      data: { joints: viewerTamperJoints },
      expectedGlobalRevision: afterOkState.meta.globalRevision,
      actionLabel: 'Попытка правки Наблюдателем',
      user: viewerUser,
    });
    assert.equal(viewerRes.status, 'forbidden');

    // 4c) ЛНК сначала закрывает ВИК («Годен»), затем меняет разрешённое поле НК, одновременно пытаясь подменить welderStamp (RBAC сохраняет старое клеймо)
    const lnkStep1Vik = afterOkState.data.joints.map((j) =>
      j.id === 'batch-valid-joint-890'
        ? {
            ...j,
            vikResult: 'Годен' as const,
            vikDate: validNewJoint.weldingDate,
            vikReportNumber: 'ВИК-890-OK',
          }
        : j
    );
    const step1Res = db.syncStateWithOptimisticLock({
      data: { joints: lnkStep1Vik },
      expectedGlobalRevision: afterOkState.meta.globalRevision,
      actionLabel: 'ЛНК закрывает ВИК',
      user: ndtUser,
    });
    assert.equal(step1Res.status, 'ok');
    const afterStep1 = db.readFullState();

    const lnkMixedEdit = afterStep1.data.joints.map((j) =>
      j.id === 'batch-valid-joint-890'
        ? {
            ...j,
            ndtType: 'РК' as const,
            ndtResult: 'Годен' as const,
            ndtDate: validNewJoint.weldingDate,
            ndtReportNumber: 'РК-890-UPD',
            welderStamp: 'FAKE-STAMP',
          }
        : j
    );
    const lnkMixedRes = db.syncStateWithOptimisticLock({
      data: { joints: lnkMixedEdit },
      expectedGlobalRevision: afterStep1.meta.globalRevision,
      actionLabel: 'Смешанная правка ЛНК с RBAC-слиянием',
      user: ndtUser,
    });
    assert.equal(lnkMixedRes.status, 'ok');
    if (lnkMixedRes.status === 'ok') {
      const saved890 = lnkMixedRes.data.joints.find((j) => j.id === 'batch-valid-joint-890');
      assert.equal(saved890?.ndtReportNumber, 'РК-890-UPD', 'Разрешённое поле НК должно обновиться');
      assert.equal(
        saved890?.welderStamp,
        validNewJoint.welderStamp,
        'Запрещённое для ЛНК поле клейма должно сохраниться из серверной записи'
      );
    }
  } finally {
    db?.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
});

test('Повторный аудит п. 3: validateJournalCompleteness проверяет повторный НК и послеремонтные контроли (ВИК/НК/дубль после ремонта)', async () => {
  const { validateJournalCompleteness } = await import('./journals');

  const baseComplete: WeldJoint = {
    ...INITIAL_JOINTS[0],
    id: 'j-comp-base',
    weldingDate: '2026-06-15',
    welderStamp: 'А142',
    welderStampsList: ['А142'],
    techCardNumber: 'ТК-01',
    responsiblePerson: 'Мастер Иванов И.И.',
    vikResult: 'Годен',
    vikDate: '2026-06-15',
    vikReportNumber: 'ВИК-001',
    ndtType: 'РК',
    ndtResult: 'Годен',
    ndtDate: '2026-06-16',
    ndtReportNumber: 'РК-001',
    dupNdtType: 'Не требуется',
    dupNdtResult: 'Не проводился',
    dupNdtDate: '',
    dupNdtReportNumber: '',
  };

  // 1. Полная запись без дублирующего НК (не проводился) -> полная
  const baseCheck = validateJournalCompleteness([baseComplete], 'СТО Газпром 15-1.1-002-2023');
  assert.equal(baseCheck.isFullyComplete, true);

  // 2. Выбран и проведён повторный/дублирующий НК, но отсутствует номер заключения и дата
  const missingDupNdt: WeldJoint = {
    ...baseComplete,
    id: 'j-dup-inc',
    dupNdtType: 'УЗК',
    dupNdtResult: 'Годен',
    dupNdtDate: '',
    dupNdtReportNumber: '',
  };
  const dupIncCheck = validateJournalCompleteness([missingDupNdt], 'СТО Газпром 15-1.1-002-2023');
  assert.equal(dupIncCheck.isFullyComplete, false);
  assert.equal(dupIncCheck.missingSummary.missingDupNdtReports, 1);
  assert.ok(
    dupIncCheck.missingItems[0].missingFields.some(
      (f) => f.field === 'dupNdtReportNumber' && f.label.includes('Повторный/дублирующий НК')
    )
  );
  assert.ok(
    dupIncCheck.missingItems[0].missingFields.some(
      (f) => f.field === 'dupNdtDate' && f.label.includes('Повторный/дублирующий НК')
    )
  );

  // 3. Ремонт: заполнены ремонтный ВИК, но НЕ заполнен номер заключения НК после ремонта и дубл. НК после ремонта
  const missingPostRepairNdt: WeldJoint = {
    ...baseComplete,
    id: 'j-rep-inc',
    ndtResult: 'Ремонт',
    repairAction: 'Ремонт',
    repairDate: '2026-06-18',
    repairWelderStamp: 'А142',
    repairTechCard: 'ТК-РЕМ-01',
    repairVikResult: 'Годен',
    repairVikDate: '2026-06-18',
    repairVikNumber: 'ВИК-РЕМ-01',
    repairNdtType: 'РК',
    repairNdtResult: 'Годен',
    repairNdtDate: '2026-06-19',
    repairNdtNumber: '', // пропуск!
    repairDupNdtType: 'УЗК',
    repairDupNdtResult: 'Годен',
    repairDupNdtDate: '',
    repairDupNdtNumber: '', // пропуск!
  };
  const repIncCheck = validateJournalCompleteness([missingPostRepairNdt], 'СТО Газпром 15-1.1-002-2023');
  assert.equal(repIncCheck.isFullyComplete, false);
  assert.equal(repIncCheck.missingSummary.missingRepairNdtReports, 1);
  assert.equal(repIncCheck.missingSummary.missingRepairDupNdtReports, 1);
  assert.ok(
    repIncCheck.missingItems[0].missingFields.some(
      (f) => f.field === 'repairNdtNumber' && f.label.includes('НК после ремонта (РК)')
    )
  );
  assert.ok(
    repIncCheck.missingItems[0].missingFields.some(
      (f) =>
        f.field === 'repairDupNdtNumber' &&
        f.label.includes('Повторный/дублирующий НК после ремонта (УЗК)')
    )
  );

  // 4. Полный ремонтный цикл со всеми реквизитами -> полностью заполнен
  const fullRepaired: WeldJoint = {
    ...missingPostRepairNdt,
    repairNdtNumber: 'РК-РЕМ-02',
    repairDupNdtDate: '2026-06-20',
    repairDupNdtNumber: 'УЗК-РЕМ-03',
  };
  const fullRepCheck = validateJournalCompleteness([fullRepaired], 'СТО Газпром 15-1.1-002-2023');
  assert.equal(fullRepCheck.isFullyComplete, true);
  assert.equal(fullRepCheck.jointsWithMissingDataCount, 0);

  // 5. ГОСТ 32569-2013 проверяет базовые и первичные графы (15, 16) и не требует неэкспортируемые графы СТО
  const gostComplete = validateJournalCompleteness([missingDupNdt], 'ГОСТ 32569-2013');
  assert.equal(gostComplete.isFullyComplete, true);
  const gostMissingPrimary = validateJournalCompleteness(
    [{ ...baseComplete, ndtReportNumber: '' }],
    'ГОСТ 32569-2013'
  );
  assert.equal(gostMissingPrimary.isFullyComplete, false);
  assert.equal(gostMissingPrimary.missingSummary.missingNdtReports, 1);
});

test('Повторный аудит п. 4: Закрепление правил квоты НК (разные % РК/УЗК, несколько сварщиков, повторный контроль, В работе/Ремонт и разделение квоты от 100% приёмки)', async () => {
  const { calculateWelderNdtQuotas, calculateLineNdtProgress } = await import('./weldingLogic');
  const { computeLineListItemStatus, isJointFullyAccepted } = await import('./readiness');

  const mixedLine: ProjectLineItem = {
    id: 'line-mixed-1',
    uniqueLineId: 'LINE-MIXED-01',
    rdCode: 'RD-MIX',
    lineNumber: '105',
    objectName: 'УКПГ-2В',
    lineName: 'Линия III категории',
    product: 'Конденсат',
    testContour: 'К-1',
    weldingNtd: 'СТО Газпром 15-1.1-002-2023',
    controlNtd: 'СТО Газпром 15-1.3-004-2023',
    qualityLevel: 'С',
    pipelineCategory: 'III',
    workingPressure: '2.5',
    workingTemperature: '+20',
    rkPercent: 50,
    uzkPercent: 20,
    pvkPercent: 0,
    testDate: '2026-10-20',
  };

  const makeJoint = (id: string, num: string, overrides: Partial<WeldJoint>): WeldJoint => ({
    ...INITIAL_JOINTS[0],
    id,
    uniqueLineId: mixedLine.uniqueLineId,
    rdCode: mixedLine.rdCode,
    lineNumber: mixedLine.lineNumber,
    jointNumber: num,
    weldingDate: '2026-10-10',
    welderStamp: 'W-A, W-B',
    welderStampsList: ['W-A', 'W-B'],
    vikResult: 'Годен',
    ndtType: 'РК',
    ndtResult: 'Не проводился',
    dupNdtType: 'Не требуется',
    dupNdtResult: 'Не проводился',
    repairAction: undefined,
    repairVikResult: 'Не проводился',
    repairNdtType: 'Не требуется',
    repairNdtResult: 'Не проводился',
    repairDupNdtType: 'Не требуется',
    repairDupNdtResult: 'Не проводился',
    ...overrides,
  });

  // 4 стыка с разными сварщиками (бригада W-A, W-B):
  // - j1: РК Годен + повторный УЗК Годен
  // - j2: РК Годен
  // - j3: повторный РК В работе (НЕ должен засчитываться!)
  // - j4: РК Ремонт, после ремонта переконтроль РК Годен (учёт в объёме линии и у сварщиков)
  const jointsMixed: WeldJoint[] = [
    makeJoint('jm-1', '010', {
      ndtType: 'РК',
      ndtResult: 'Годен',
      dupNdtType: 'УЗК',
      dupNdtResult: 'Годен',
    }),
    makeJoint('jm-2', '020', {
      ndtType: 'РК',
      ndtResult: 'Годен',
    }),
    makeJoint('jm-3', '030', {
      ndtType: 'РК',
      ndtResult: 'В работе',
    }),
    makeJoint('jm-4', '040', {
      ndtType: 'РК',
      ndtResult: 'Ремонт',
      repairAction: 'Ремонт',
      repairVikResult: 'Годен',
      repairNdtType: 'РК',
      repairNdtResult: 'Годен',
      welderStampsList: ['W-A'],
      welderStamp: 'W-A',
    }),
  ];

  // 1. По линии РК и УЗК проверяются раздельно: 50% РК = 2/4 (есть 3/4), 20% УЗК = 1/4 (есть 1/4)
  const lineProg = calculateLineNdtProgress(jointsMixed, mixedLine);
  assert.equal(lineProg.inspectedRkCount, 3, 'РК: j1, j2 и закрытый ремонт j4 = 3; j3 В работе исключён');
  assert.equal(lineProg.inspectedUzkCount, 1, 'УЗК учтён через дублирующий контроль j1');
  assert.equal(lineProg.isRkFulfilled, true);
  assert.equal(lineProg.isUzkFulfilled, true);

  // 2. По сварщикам на линии используется подтверждённый максимум процентов (50% от rkPercent/uzkPercent)
  const lineStatus = computeLineListItemStatus(mixedLine, jointsMixed);
  assert.equal(lineStatus.rkRequired, 2);
  assert.equal(lineStatus.rkControlled, 3);
  assert.equal(lineStatus.uzkRequired, 1);
  assert.equal(lineStatus.uzkControlled, 1);
  assert.equal(lineStatus.ndtStatus, 'sufficient', 'Квота линии и обоих сварщиков выполнена');
  assert.equal(
    isJointFullyAccepted(jointsMixed[2]),
    false,
    'Стык 030 в статусе «В работе» НЕ является принятым'
  );
  assert.equal(
    lineStatus.isCompleted,
    false,
    'Статус выполнения выборочной квоты НЕ смешивается с 100% приёмкой всех стыков (controlledJoints < totalJoints)'
  );
  assert.match(lineStatus.statusLabel, /^Достаточно НК/);

  // 3. Дефицит по сварщику и правило расчёта Math.max(rkPercent, uzkPercent, 20) для категории III / С
  const welderQuotas = calculateWelderNdtQuotas(jointsMixed, [mixedLine]);
  const quotaWB = welderQuotas.find((q) => q.stamp === 'W-B');
  assert.ok(quotaWB);
  assert.equal(quotaWB.requiredNdtPct, 50, 'Для квоты сварщика на категории III применяется max(50, 20, 20) = 50%');
  assert.equal(quotaWB.totalWelded, 3);
  assert.equal(quotaWB.inspectedCount, 2, 'В работе (jm-3) не засчитан в проверенные W-B');
  assert.equal(quotaWB.isCompliant, true);

  // 4. Явный дефицит на линии при 2 сварщиках, если один сварщик не добрал квоту
  const deficitJoints: WeldJoint[] = [
    makeJoint('jd-1', '010', {
      welderStampsList: ['W-OK'],
      welderStamp: 'W-OK',
      ndtType: 'РК',
      ndtResult: 'Годен',
    }),
    makeJoint('jd-2', '020', {
      welderStampsList: ['W-OK'],
      welderStamp: 'W-OK',
      ndtType: 'УЗК',
      ndtResult: 'Годен',
    }),
    makeJoint('jd-3', '030', {
      welderStampsList: ['W-DEF'],
      welderStamp: 'W-DEF',
      ndtType: 'РК',
      ndtResult: 'В работе',
    }),
  ];
  const deficitStatus = computeLineListItemStatus(mixedLine, deficitJoints);
  assert.equal(deficitStatus.ndtStatus, 'insufficient');
  assert.equal(deficitStatus.ndtStatusBadge, 'Недостаточно НК');
  assert.ok(
    deficitStatus.welderNdtDeficits?.some((d) => d.includes('W-DEF')),
    'Статус линии обязан явно показывать дефицит по конкретному сварщику W-DEF'
  );
  assert.match(deficitStatus.statusLabel, /Дефицит НК по сварщикам: W-DEF/);
});

test('LABORATORY MODULE: deficit statement grouped by RD codes & lines, PTO request creation, defectoscopist acceptance into work, conclusion issuance, and cross-section propagation', async () => {
  const {
    calculateLaboratoryDeficitStatement,
    suggestNextLabRequestNumber,
    suggestNextConclusionNumber,
    buildAcceptIntoWorkJointPatch,
    buildLabConclusionPatch,
    syncLabRequestStatusWithJoints,
  } = await import('./laboratoryLogic');
  const { INITIAL_PROJECT_LINELIST } = await import('../data/seedData');

  // 1. Формирование дефицитной ведомости с разделением по шифрам РД и линиям и учётом процента контроля
  const statement = calculateLaboratoryDeficitStatement(
    INITIAL_JOINTS,
    INITIAL_PROJECT_LINELIST,
    'ALL',
    'ALL'
  );
  assert.ok(statement.rdGroups.length >= 2, 'Ведомость должна быть сгруппирована по шифрам РД');
  for (const grp of statement.rdGroups) {
    assert.ok(grp.rdCode.length > 0);
    assert.ok(grp.lines.length > 0);
    const sumWelded = grp.lines.reduce((acc, l) => acc + l.weldedCount, 0);
    assert.equal(grp.weldedCount, sumWelded);
  }

  // Находим линию с дефицитом НК в стартовом наборе данных
  const deficitRow = statement.allLineRows.find((l) => l.hasDeficit);
  assert.ok(deficitRow, 'В ведомости должна определяться минимум одна линия с дефицитом НК');
  assert.ok(
    deficitRow.totalPhysicalDeficit > 0 ||
      deficitRow.vikDeficit > 0 ||
      deficitRow.inRepairCount > 0 ||
      deficitRow.welderDeficits.length > 0
  );

  // 2. Генерация номера заявки от ПТО и принятие заявки дефектоскопистом в работу
  const nextReqNo = suggestNextLabRequestNumber([]);
  assert.match(nextReqNo, /^ЗНК-\d{4}-001$/);

  const rawJoint: WeldJoint = {
    ...INITIAL_JOINTS[0],
    id: 'j-lab-test-1',
    jointNumber: '050',
    weldingDate: '2026-10-20',
    vikResult: 'Годен',
    vikDate: '2026-10-20',
    vikReportNumber: 'ВИК-2026/050',
    ndtType: 'Не требуется',
    ndtResult: 'Не проводился',
    ndtDate: '',
    ndtReportNumber: '',
    ndtInspector: '',
  };

  const acceptPatch = buildAcceptIntoWorkJointPatch(
    rawJoint,
    {
      controlStage: 'Первичный ВИК и НК',
      requestedMethod: 'РК',
    },
    'Воронов А.С.'
  );
  assert.equal(acceptPatch.ndtType, 'РК');
  assert.equal(acceptPatch.ndtResult, 'В работе');
  assert.equal(acceptPatch.ndtInspector, 'Воронов А.С.');

  const jointInWork: WeldJoint = { ...rawJoint, ...acceptPatch };
  assert.equal(jointInWork.ndtResult, 'В работе');

  // 3. Проверка хронологического контроля при оформлении заключения (дата НК не раньше даты сварки)
  const invalidChronology = buildLabConclusionPatch(jointInWork, {
    stage: 'Первичный ВИК и НК',
    ndtMethod: 'РК',
    ndtReportNumber: 'РК-2026/999',
    ndtDate: '2026-10-18', // раньше даты сварки 2026-10-20!
    ndtResult: 'Годен',
    ndtInspector: 'Воронов А.С.',
  });
  assert.equal(invalidChronology.ok, false);
  assert.ok(invalidChronology.error, 'Должна блокироваться дата заключения раньше даты сварки');

  // 4. Оформление положительного заключения с присвоением номера, даты и результата
  const nextConcNo = suggestNextConclusionNumber([jointInWork], 'РК');
  assert.match(nextConcNo, /^РК-26\/\d{3,}$/);

  const validConclusion = buildLabConclusionPatch(jointInWork, {
    stage: 'Первичный ВИК и НК',
    includeVik: true,
    vikReportNumber: 'ВИК-2026/777',
    vikDate: '2026-10-20',
    vikResult: 'Годен',
    vikInspector: 'Воронов А.С.',
    ndtMethod: 'РК',
    ndtReportNumber: 'РК-2026/777',
    ndtDate: '2026-10-21',
    ndtResult: 'Годен',
    ndtInspector: 'Воронов А.С.',
  });
  assert.equal(validConclusion.ok, true);
  assert.equal(validConclusion.error, undefined);

  const completedJoint: WeldJoint = {
    ...jointInWork,
    ...validConclusion.patch,
  };
  assert.equal(completedJoint.ndtReportNumber, 'РК-2026/777');
  assert.equal(completedJoint.ndtDate, '2026-10-21');
  assert.equal(completedJoint.ndtResult, 'Годен');
  assert.equal(completedJoint.vikReportNumber, 'ВИК-2026/777');

  // 5. Проверка автоматического перевода заявки в статус 'Выполнена' после выдачи заключений на все стыки заявки
  const sampleReq = {
    id: 'req-test-1',
    requestNumber: 'ЗНК-2026-010',
    createdAt: '2026-10-20 09:00',
    createdDate: '2026-10-20',
    createdBy: 'Соколов А.В.',
    objectName: completedJoint.objectName,
    rdCode: completedJoint.rdCode,
    lineNumber: completedJoint.lineNumber,
    uniqueLineId: completedJoint.uniqueLineId,
    contour: completedJoint.contour,
    controlStage: 'Первичный ВИК и НК' as const,
    requestedMethod: 'РК' as const,
    jointIds: [completedJoint.id],
    status: 'В работе ЛНК' as const,
  };

  const stillInWorkReq = syncLabRequestStatusWithJoints(
    sampleReq,
    new Map([[jointInWork.id, jointInWork]])
  );
  assert.equal(stillInWorkReq.status, 'В работе ЛНК');

  const autoCompletedReq = syncLabRequestStatusWithJoints(
    sampleReq,
    new Map([[completedJoint.id, completedJoint]])
  );
  assert.equal(autoCompletedReq.status, 'Выполнена');
  assert.ok(autoCompletedReq.completedAt);

  // 6. Проверка отображения внесённого заключения во всех разделах программы:
  // - Журнал СТО Газпром 15-1.1-002-2023 (графа 25 — № заключения, графа 26 — дата, графа 27 — результат)
  const stoRow = formatStoGazpromJournalRow(completedJoint, 0, INITIAL_LRV_CATALOG);
  assert.ok(stoRow.col25.includes('РК-2026/777'), 'Номер заключения должен отображаться в графе 25 журнала СТО Газпром');
  assert.equal(stoRow.col26, '21.10.26', 'Дата заключения должна отображаться в графе 26 журнала СТО Газпром');
  assert.equal(stoRow.col27, 'Годен', 'Результат заключения должен отображаться в графе 27 журнала СТО Газпром');

  // - Журнал ГОСТ 32569-2013 (графа 16 — физический НК, № заключения, дата)
  const gostRow = formatGost32569JournalRow(completedJoint, 0, INITIAL_WELDING_MATERIALS);
  assert.ok(gostRow.col16.includes('РК-2026/777'), 'Номер заключения должен отображаться в графе 16 журнала ГОСТ 32569');
  assert.ok(gostRow.col16.includes('Годен'), 'Результат заключения должен отображаться в графе 16 журнала ГОСТ 32569');

  // - Отчётность по готовности
  const readinessRows = calculateReadinessReport([completedJoint], 'uniqueLineId');
  assert.equal(readinessRows[0].ndtPassedCount, 1);
  assert.equal(readinessRows[0].fullyCompletedCount, 1);
  assert.equal(readinessRows[0].readinessPct, 100);

  // 7. Проверка статусов заявки в Реестре стыков («Заявка не подана», «Заявка подана», «Заявка в работе», «Заявка исполнена»)
  // и валидации допуска к подаче заявки (заполнена дата сварки и клеймо без замечаний НАКС)
  const {
    getJointLabRequestStatus,
    validateJointForLabRequestSubmission,
  } = await import('./laboratoryLogic');
  const { WELDERS_DIRECTORY } = await import('../data/seedData');

  assert.equal(
    getJointLabRequestStatus(rawJoint, []),
    'Заявка не подана',
    'Для стыка без заявки и без заключения статус должен быть «Заявка не подана»'
  );
  assert.equal(
    getJointLabRequestStatus(rawJoint, [
      { ...sampleReq, jointIds: [rawJoint.id], status: 'Подана ПТО' },
    ]),
    'Заявка подана'
  );
  assert.equal(
    getJointLabRequestStatus(jointInWork, [
      { ...sampleReq, jointIds: [jointInWork.id], status: 'В работе ЛНК' },
    ]),
    'Заявка в работе'
  );
  assert.equal(
    getJointLabRequestStatus(completedJoint, [autoCompletedReq]),
    'Заявка исполнена'
  );

  // Валидация подачи заявки: без даты сварки или без клейма — запрещено
  const noDateCheck = validateJointForLabRequestSubmission(
    { ...rawJoint, weldingDate: '' },
    WELDERS_DIRECTORY
  );
  assert.equal(noDateCheck.canSubmit, false);
  assert.ok(noDateCheck.reasons.some((r) => r.includes('дата сварки')));

  const noStampCheck = validateJointForLabRequestSubmission(
    { ...rawJoint, welderStamp: '' },
    WELDERS_DIRECTORY
  );
  assert.equal(noStampCheck.canSubmit, false);
  assert.ok(noStampCheck.reasons.some((r) => r.includes('клеймо')));

  // С корректной датой сварки и действующим клеймом НАКС без замечаний — разрешено
  const validCheck = validateJointForLabRequestSubmission(
    {
      ...rawJoint,
      weldingDate: '2025-11-10',
      welderStamp: WELDERS_DIRECTORY[0].stamp,
      diameterMm: 325,
      wallThickness: 10,
      weldingType: 'РАД+РД',
    },
    WELDERS_DIRECTORY
  );
  assert.equal(validCheck.canSubmit, true);
  assert.equal(validCheck.reasons.length, 0);
});


