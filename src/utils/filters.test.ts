import { test, assert } from 'vitest';
import {
  computeColumnUniqueValues,
  filterAndSortJoints,
  filterJointsByColumnFilters,
  filterJointsByDateRange,
  filterJointsByGlobalSearch,
  filterJointsByScope,
  filterLrvCatalogByObject,
  filterLrvCatalogByRd,
  getCascadingFilterRows,
  getJointFieldValue,
  normalizeFilterSearchText,
  resolveColumnFilterApplySelection,
  sortJoints,
  sortJointsChronologically,
} from './filters';
import { resolveLrvFullName } from './pipeCalc';
import { normalizeLrvItem } from './entityNormalizers';
import { FacilityObject, LRVItem, NdtLabRequest, WeldJoint } from '../types/welding';

const mockJoints: WeldJoint[] = [
  {
    id: 'j1',
    objectName: 'ГСП-1',
    rdCode: '01-100',
    uniqueLineId: '01-100.01',
    jointNumber: '002',
    weldingDate: '2026-10-15',
    welderStamp: 'С01',
    diameterMm: 219,
    wallThickness: 8,
    manualStatus: 'Сварен',
  } as unknown as WeldJoint,
  {
    id: 'j2',
    objectName: 'ГСП-1',
    rdCode: '01-100',
    uniqueLineId: '01-100.01',
    jointNumber: '010',
    weldingDate: '2026-10-12',
    welderStamp: 'С02',
    diameterMm: 219,
    wallThickness: 8,
    manualStatus: 'Контроль',
  } as unknown as WeldJoint,
  {
    id: 'j3',
    objectName: 'ГСП-2',
    rdCode: '02-200',
    uniqueLineId: '02-200.01',
    jointNumber: '001',
    weldingDate: '',
    welderStamp: 'С01',
    diameterMm: 57,
    wallThickness: 4,
    manualStatus: 'В работе',
  } as unknown as WeldJoint,
];

test('filters: filterJointsByScope restricts by object and RD correctly', () => {
  assert.equal(filterJointsByScope(mockJoints, 'ALL', 'ALL').length, 3);
  assert.equal(filterJointsByScope(mockJoints, 'ГСП-1', 'ALL').length, 2);
  assert.equal(filterJointsByScope(mockJoints, 'ALL', '02-200').length, 1);
  assert.equal(filterJointsByScope(mockJoints, 'ГСП-1', '01-100').length, 2);
  assert.equal(filterJointsByScope(mockJoints, 'ГСП-2', '01-100').length, 0);
});

test('filters: filterJointsByDateRange respects boundaries', () => {
  const inRange = filterJointsByDateRange(mockJoints, '2026-10-10', '2026-10-13');
  assert.equal(inRange.length, 1);
  assert.equal(inRange[0].id, 'j2');

  const allWithEmpty = filterJointsByDateRange(mockJoints, '', '');
  assert.equal(allWithEmpty.length, 3);
});

test('filters: filterJointsByGlobalSearch matches raw and formatted dates and case-insensitively', () => {
  // Поиск по номеру клейма
  assert.equal(filterJointsByGlobalSearch(mockJoints, 'с02').length, 1);
  // Поиск по номеру стыка
  assert.equal(filterJointsByGlobalSearch(mockJoints, '010').length, 1);
  // Поиск по форматированной дате 12.10.26
  assert.equal(filterJointsByGlobalSearch(mockJoints, '12.10.26').length, 1);
  assert.equal(filterJointsByGlobalSearch(mockJoints, '12.10.26')[0].id, 'j2');
  // Пустой запрос возвращает все
  assert.equal(filterJointsByGlobalSearch(mockJoints, '   ').length, 3);
});

test('filters: filterJointsByColumnFilters works with multiple columns and computed values', () => {
  const byWelder = filterJointsByColumnFilters(mockJoints, {
    welderStamp: ['С01'],
  });
  assert.equal(byWelder.length, 2);

  const combined = filterJointsByColumnFilters(mockJoints, {
    welderStamp: ['С01'],
    jointNumber: ['002'],
  });
  assert.equal(combined.length, 1);
  assert.equal(combined[0].id, 'j1');
});

test('filters: sortJoints handles numeric order and descending', () => {
  const sortedAsc = sortJoints(mockJoints, {
    key: 'jointNumber',
    direction: 'asc',
  });
  assert.equal(sortedAsc[0].jointNumber, '001');
  assert.equal(sortedAsc[1].jointNumber, '002');
  assert.equal(sortedAsc[2].jointNumber, '010');

  const sortedDesc = sortJoints(mockJoints, {
    key: 'jointNumber',
    direction: 'desc',
  });
  assert.equal(sortedDesc[0].jointNumber, '010');
  assert.equal(sortedDesc[1].jointNumber, '002');
  assert.equal(sortedDesc[2].jointNumber, '001');
});

test('filters: sortJointsChronologically places joints with empty dates last', () => {
  const sorted = sortJointsChronologically(mockJoints);
  assert.equal(sorted[0].weldingDate, '2026-10-12');
  assert.equal(sorted[1].weldingDate, '2026-10-15');
  assert.equal(sorted[2].weldingDate, '');
});

test('filters: filterAndSortJoints full pipeline works', () => {
  const result = filterAndSortJoints(mockJoints, {
    selectedObjectName: 'ГСП-1',
    selectedRdCode: '01-100',
    globalSearch: '219',
    sortConfig: { key: 'jointNumber', direction: 'asc' },
  });
  assert.equal(result.length, 2);
  assert.equal(result[0].id, 'j1'); // 002 < 010
  assert.equal(result[1].id, 'j2');
});

test('filters: computeColumnUniqueValues counts frequencies and sorts in Russian locale', () => {
  const uniqueStamps = computeColumnUniqueValues(mockJoints, 'welderStamp');
  assert.deepEqual(uniqueStamps, [
    { value: 'С01', count: 2 },
    { value: 'С02', count: 1 },
  ]);
});

test('filters: filterLrvCatalogByRd correctly restricts or bypasses', () => {
  const sampleLrv: LRVItem[] = [
    { id: '1', rdCode: 'RD-01', name: 'Труба 219х8' } as unknown as LRVItem,
    { id: '2', rdCode: 'RD-02', name: 'Отвод 90 219х8' } as unknown as LRVItem,
  ];
  assert.equal(filterLrvCatalogByRd(sampleLrv, 'RD-01').length, 1);
  assert.equal(filterLrvCatalogByRd(sampleLrv, 'RD-01', true).length, 2);
});

test('tech card matching: findMatchingTechCard and classifyJointElements filter by joint kind, elements and diameter', async () => {
  const { classifyJointElements, findMatchingTechCard } = await import('./pipeCalc');

  // Классификация элементов
  assert.equal(classifyJointElements('Труба', 'Труба 219х10', 'Труба', 'Труба 219х10'), 'Труба+Труба');
  assert.equal(classifyJointElements('Труба', 'Труба 219х10', 'СДТ', 'Отвод ОК 90-219'), 'Труба+СДТ');
  assert.equal(classifyJointElements('СДТ', 'Отвод ОК', 'СДТ', 'Переход ПК'), 'СДТ+СДТ');
  assert.equal(classifyJointElements('Труба', 'Труба 219х10', 'ЗРА', 'Кран шаровой DN200'), 'Труба+ЗРА');
  assert.equal(classifyJointElements('СДТ', 'Переход ПК', 'ЗРА', 'Кран шаровой'), 'СДТ+ЗРА');

  // Подбор ТК
  const mockCards = [
    {
      id: 'tc1',
      number: 'ТК-01',
      title: 'Стыковые швы Труба-Труба',
      weldingType: 'РАД+РД' as const,
      jointKind: 'Стыковое' as const,
      elementCombination: 'Труба+Труба' as const,
      minDiameterMm: 57,
      maxDiameterMm: 325,
      minWallThicknessMm: 4,
      maxWallThicknessMm: 16,
      ntd: 'СТО Газпром',
      steelGroup: '09Г2С',
      recommendedMaterials: 'Св-08Г2С',
      preheatRules: [],
    },
    {
      id: 'tc2',
      number: 'ТК-02',
      title: 'Угловые швы штуцеров Труба-СДТ',
      weldingType: 'РАД+РД' as const,
      jointKind: 'Угловое' as const,
      elementCombination: 'Труба+СДТ' as const,
      minDiameterMm: 14,
      maxDiameterMm: 89,
      minWallThicknessMm: 2,
      maxWallThicknessMm: 8,
      ntd: 'СТО Газпром',
      steelGroup: '09Г2С',
      recommendedMaterials: 'Св-08Г2С',
      preheatRules: [],
    },
  ];

  // Точный подбор по диаметру и типу соединения
  const match1 = findMatchingTechCard(mockCards, {
    diameterMm: 219,
    wallThicknessMm: 8,
    jointKind: 'Стыковое',
    elementCombination: 'Труба+Труба',
  });
  assert.equal(match1?.number, 'ТК-01');

  const match2 = findMatchingTechCard(mockCards, {
    diameterMm: 57,
    wallThicknessMm: 4,
    jointKind: 'Угловое',
    elementCombination: 'Труба+СДТ',
  });
  assert.equal(match2?.number, 'ТК-02');

  // Несоответствие по диаметру (выход из диапазона)
  const matchFailDiameter = findMatchingTechCard(mockCards, {
    diameterMm: 530,
    wallThicknessMm: 12,
    jointKind: 'Стыковое',
  });
  assert.equal(matchFailDiameter, null);

  // Несоответствие по типу соединения
  const matchFailKind = findMatchingTechCard(mockCards, {
    diameterMm: 219,
    wallThicknessMm: 8,
    jointKind: 'Угловое',
  });
  assert.equal(matchFailKind, null);
});

test('filters: filterLrvCatalogByObject restricts materials strictly to selected facility', () => {
  const facilities: FacilityObject[] = [
    {
      id: 'fac-1',
      name: 'Объект А',
      rdCodes: [{ code: 'RD-A1', title: 'Технология А' }],
    } as unknown as FacilityObject,
    {
      id: 'fac-2',
      name: 'Объект Б',
      rdCodes: [{ code: 'RD-B1', title: 'Технология Б' }],
    } as unknown as FacilityObject,
  ];

  const items: LRVItem[] = [
    { id: '1', objectName: 'Объект А', rdCode: 'RD-A1', lrvCode: 'A-1' } as unknown as LRVItem,
    { id: '2', objectName: 'Объект Б', rdCode: 'RD-B1', lrvCode: 'B-1' } as unknown as LRVItem,
    { id: '3', objectName: '', facilityId: 'fac-1', rdCode: 'RD-X', lrvCode: 'A-LEGACY-ID' } as unknown as LRVItem,
    { id: '4', objectName: '', rdCode: 'RD-A1', lrvCode: 'A-LEGACY-RD' } as unknown as LRVItem,
    { id: '5', objectName: 'Объект Б', facilityId: 'fac-1', rdCode: 'RD-A1', lrvCode: 'B-EXPLICIT' } as unknown as LRVItem,
  ];

  assert.equal(filterLrvCatalogByObject(items, 'ALL', facilities).length, 5);

  const onlyA = filterLrvCatalogByObject(items, 'Объект А', facilities);
  assert.deepEqual(
    onlyA.map((i) => i.id),
    ['1', '3', '4']
  );

  const onlyB = filterLrvCatalogByObject(items, 'Объект Б', facilities);
  assert.deepEqual(
    onlyB.map((i) => i.id),
    ['2', '5']
  );
});

test('filters: normalizeFilterSearchText and resolveColumnFilterApplySelection apply search matches accurately', () => {
  assert.equal(normalizeFilterSearchText('  ТрубА  ёлочка '), 'труба елочка');

  const allValues = ['Кран DN50', 'Кран DN100', 'Отвод 90°', 'Труба 159'];
  const filteredValues = ['Кран DN50', 'Кран DN100'];

  // Режим поиска: даже если пользователь ничего не снимал, применяются только найденные значения
  const appliedFromSearch = resolveColumnFilterApplySelection({
    allValues,
    filteredValues,
    activeSelection: new Set(filteredValues),
    searchQuery: 'кран',
  });
  assert.deepEqual(appliedFromSearch, ['Кран DN50', 'Кран DN100']);

  // Режим поиска со снятой одной галочкой: остаётся только отмеченное найденное значение
  const appliedPartialSearch = resolveColumnFilterApplySelection({
    allValues,
    filteredValues,
    activeSelection: new Set(['Кран DN100']),
    searchQuery: 'кран',
  });
  assert.deepEqual(appliedPartialSearch, ['Кран DN100']);

  // Обычный режим без поиска: выделены все -> фильтр снимается (undefined)
  const clearedAll = resolveColumnFilterApplySelection({
    allValues,
    filteredValues: allValues,
    activeSelection: new Set(allValues),
    searchQuery: '',
  });
  assert.equal(clearedAll, undefined);

  // Обычный режим без поиска: выделена часть -> возвращается выбранное подмножество
  const appliedSubset = resolveColumnFilterApplySelection({
    allValues,
    filteredValues: allValues,
    activeSelection: new Set(['Отвод 90°']),
    searchQuery: '',
  });
  assert.deepEqual(appliedSubset, ['Отвод 90°']);
});

test('filters: getCascadingFilterRows excludes rows filtered out by other columns while keeping own column options', () => {
  const rows = [
    { id: '1', category: 'Труба', material: '09Г2С', diameter: '159.0' },
    { id: '2', category: 'Труба', material: 'К60', diameter: '530.0' },
    { id: '3', category: 'ЗРА', material: '12Х18Н10Т', diameter: '219.0' },
    { id: '4', category: 'Отвод', material: '09Г2С', diameter: '159.0' },
  ];

  const getters = {
    category: (r: (typeof rows)[number]) => r.category,
    material: (r: (typeof rows)[number]) => r.material,
    diameter: (r: (typeof rows)[number]) => r.diameter,
  };

  // Фильтр по category = ['Труба'] -> в списке material должны остаться только 09Г2С и К60 (без 12Х18Н10Т)
  const materialRows = getCascadingFilterRows(
    rows,
    { category: ['Труба'] },
    'material',
    getters
  );
  assert.deepEqual(
    materialRows.map((r) => r.material),
    ['09Г2С', 'К60']
  );

  // В собственном столбце category остаются все строки, чтобы пользователь мог расширить выбор
  const categoryRows = getCascadingFilterRows(
    rows,
    { category: ['Труба'] },
    'category',
    getters
  );
  assert.equal(categoryRows.length, 4);

  // При двух фильтрах (category = Труба и material = 09Г2С) в diameter остаётся только 159.0
  const diameterRows = getCascadingFilterRows(
    rows,
    { category: ['Труба'], material: ['09Г2С'] },
    'diameter',
    getters
  );
  assert.deepEqual(
    diameterRows.map((r) => r.diameter),
    ['159.0']
  );
});

test('lrv: resolveLrvFullName generates full name when missing and normalizeLrvItem preserves fullName/marking/pnMpa', () => {
  const pipeWithoutFullName: LRVItem = {
    id: 'lrv-1',
    lrvCode: 'ЛРВ-001',
    rdCode: '01-ГП',
    objectName: 'УКПГ-1С',
    shortName: 'Труба БШ 159х8',
    category: 'Труба',
    material: '09Г2С',
    ntd: 'ГОСТ 8732-78',
    diameterMm: 159,
    wallThickness: 8,
    specQty: 100,
    unit: 'м',
  };

  assert.equal(
    resolveLrvFullName(pipeWithoutFullName),
    'Труба БШ 159х8, 09Г2С, ГОСТ 8732-78'
  );

  // ЗРА с DN и PN в кратком наименовании не дублирует DN и PN
  const valveWithoutFullName: LRVItem = {
    id: 'lrv-2',
    lrvCode: 'ЛРВ-002',
    rdCode: '01-ГП',
    objectName: 'УКПГ-1С',
    shortName: 'Кран шаровой фланцевый DN200 PN6.3',
    category: 'ЗРА',
    dn1: 200,
    pnMpa: '6.3',
    material: '09Г2С',
    ntd: 'ТУ 3742-001-12345678',
    diameterMm: 219,
    wallThickness: 10,
    specQty: 4,
    unit: 'шт',
  };

  assert.equal(
    resolveLrvFullName(valveWithoutFullName),
    'Кран шаровой фланцевый DN200 PN6.3, 09Г2С, ТУ 3742-001-12345678'
  );

  // Явно заданное полное наименование сохраняется при нормализации
  const normalized = normalizeLrvItem({
    ...valveWithoutFullName,
    marking: 'КШ-200-6,3',
    fullName: 'Кран шаровой DN 200, PN 6,3 МПа, КШ-200-6,3, 09Г2С',
  });
  assert.equal(normalized.marking, 'КШ-200-6,3');
  assert.equal(normalized.pnMpa, '6.3');
  assert.equal(
    normalized.fullName,
    'Кран шаровой DN 200, PN 6,3 МПа, КШ-200-6,3, 09Г2С'
  );
  assert.equal(
    resolveLrvFullName(normalized),
    'Кран шаровой DN 200, PN 6,3 МПа, КШ-200-6,3, 09Г2С'
  );
});
