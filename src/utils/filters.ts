/**
 * ZAYCHICK — Модуль фильтрации, поиска и сортировки стыков и каталогов.
 * Изолированные чистые функции без привязки к React для тестирования и переиспользования.
 */

import { FacilityObject, LRVItem, NdtLabRequest, TestCircuit, WelderProfile, WeldJoint, WeldJointFieldKey } from '../types/welding';
import { ALL_COLUMNS } from './columns';
import { formatDateDDMMYY } from './formatting';
import { isDateColumnKey, isWeldingDateInRange } from './dates';
import { getJointEquivDiaInch } from './pipeCalc';
import {
  getJointLabRequestStatus,
  validateJointForLabRequestSubmission,
} from './laboratoryLogic';
import { isJointCurrentlyInRepair, isJointFullyAccepted } from './readiness';
import { getMissingPassportFields } from './normativeValidation';

export type RegistryQuickFilter =
  | 'all'
  | 'unwelded'
  | 'ready_for_lab'
  | 'incomplete'
  | 'in_repair'
  | 'duplicates';

export interface RegistryQuickFilterCounts {
  all: number;
  unwelded: number;
  ready_for_lab: number;
  incomplete: number;
  in_repair: number;
  duplicates: number;
}

export interface FilterJointsOptions {
  selectedObjectName?: string;
  selectedRdCode?: string;
  globalSearch?: string;
  weldingDateFrom?: string;
  weldingDateTo?: string;
  columnFilters?: Partial<Record<WeldJointFieldKey, string[]>>;
  sortConfig?: { key: WeldJointFieldKey; direction: 'asc' | 'desc' } | null;
  labRequests?: NdtLabRequest[];
  testCircuits?: TestCircuit[];
  onlyActiveRepairs?: boolean;
  quickFilter?: RegistryQuickFilter;
  welders?: WelderProfile[];
  duplicateJointIds?: Set<string>;
}

/**
 * Получение строкового/числового значения поля стыка с вычисляемыми полями
 */
export function getJointFieldValue(
  joint: WeldJoint,
  colKey: WeldJointFieldKey | string,
  labRequests: NdtLabRequest[] = [],
  testCircuits?: TestCircuit[]
): string | number {
  if (colKey === 'equivDiameterInch') {
    return getJointEquivDiaInch(joint);
  }
  if (colKey === 'labRequestStatus') {
    return getJointLabRequestStatus(joint, labRequests);
  }
  if (colKey === 'contour' && joint.testCircuitId && testCircuits && testCircuits.length > 0) {
    const found = testCircuits.find((c) => c.id === joint.testCircuitId);
    if (found?.name?.trim()) {
      return found.name.trim();
    }
  }
  const raw = joint[colKey as WeldJointFieldKey];
  if (typeof raw === 'number' || typeof raw === 'string') return raw;
  return '';
}

/**
 * Ограничение выборки стыков по объекту строительства и коду РД
 */
export function filterJointsByScope(
  joints: WeldJoint[],
  selectedObjectName = 'ALL',
  selectedRdCode = 'ALL'
): WeldJoint[] {
  if (selectedObjectName === 'ALL' && selectedRdCode === 'ALL') {
    return joints;
  }
  return joints.filter((j) => {
    if (selectedObjectName !== 'ALL' && j.objectName !== selectedObjectName) {
      return false;
    }
    if (selectedRdCode !== 'ALL' && j.rdCode !== selectedRdCode) {
      return false;
    }
    return true;
  });
}

/**
 * Фильтрация стыков по диапазону дат сварки
 */
export function filterJointsByDateRange(
  joints: WeldJoint[],
  dateFrom?: string,
  dateTo?: string
): WeldJoint[] {
  if (!dateFrom && !dateTo) return joints;
  return joints.filter((j) => isWeldingDateInRange(j.weldingDate, dateFrom, dateTo));
}

/**
 * Полнотекстовый глобальный поиск по всем графам (с учётом дат в формате ДД.ММ.ГГ)
 */
export function filterJointsByGlobalSearch(
  joints: WeldJoint[],
  searchQuery: string,
  labRequests: NdtLabRequest[] = [],
  testCircuits?: TestCircuit[]
): WeldJoint[] {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return joints;

  return joints.filter((joint) => {
    return ALL_COLUMNS.some((col) => {
      const rawVal = getJointFieldValue(joint, col.key, labRequests, testCircuits);
      const rawStr = String(rawVal);
      const formattedStr = isDateColumnKey(col.key) ? formatDateDDMMYY(rawStr) : rawStr;
      return (
        rawStr.toLowerCase().includes(q) ||
        formattedStr.toLowerCase().includes(q)
      );
    });
  });
}

/**
 * Фильтрация по столбцам (чекбоксы уникальных значений)
 */
export function filterJointsByColumnFilters(
  joints: WeldJoint[],
  columnFilters: Partial<Record<WeldJointFieldKey, string[]>>,
  labRequests: NdtLabRequest[] = [],
  testCircuits?: TestCircuit[]
): WeldJoint[] {
  const activeFilters = Object.entries(columnFilters).filter(
    ([, allowed]) => allowed && allowed.length > 0
  );
  if (activeFilters.length === 0) return joints;

  return joints.filter((joint) => {
    for (const [colKey, allowedValues] of activeFilters) {
      if (!allowedValues) continue;
      const rawVal = String(getJointFieldValue(joint, colKey, labRequests, testCircuits));
      if (!allowedValues.includes(rawVal)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Сортировка стыков по выбранной колонке (с поддержкой локали и числовых суффиксов)
 */
export function sortJoints(
  joints: WeldJoint[],
  sortConfig: { key: WeldJointFieldKey; direction: 'asc' | 'desc' },
  labRequests: NdtLabRequest[] = [],
  testCircuits?: TestCircuit[]
): WeldJoint[] {
  const { key, direction } = sortConfig;
  return [...joints].sort((a, b) => {
    const valA = getJointFieldValue(a, key, labRequests, testCircuits);
    const valB = getJointFieldValue(b, key, labRequests, testCircuits);
    const cmp = String(valA).localeCompare(String(valB), 'ru', {
      numeric: true,
    });
    return direction === 'asc' ? cmp : -cmp;
  });
}

/**
 * Сортировка стыков для Журналов сварочных работ (СТО Газпром и ГОСТ 32569):
 * строго в хронологическом порядке по дате сварки (weldingDate).
 * Стыки без даты помещаются в конец.
 */
export function sortJointsChronologically(joints: WeldJoint[]): WeldJoint[] {
  return [...joints].sort((a, b) => {
    const dateA = a.weldingDate ? a.weldingDate.trim() : '';
    const dateB = b.weldingDate ? b.weldingDate.trim() : '';
    if (dateA && !dateB) return -1;
    if (!dateA && dateB) return 1;
    if (dateA !== dateB) {
      return dateA.localeCompare(dateB);
    }
    if (a.uniqueLineId !== b.uniqueLineId) {
      return a.uniqueLineId.localeCompare(b.uniqueLineId, 'ru');
    }
    return a.jointNumber.localeCompare(b.jointNumber, 'ru', { numeric: true });
  });
}

/**
 * Строит множество ID стыков, у которых совпадает пара (uniqueLineId + jointNumber)
 */
export function buildDuplicateJointIdsSet(joints: WeldJoint[]): Set<string> {
  const keyToIds = new Map<string, string[]>();
  for (const j of joints) {
    const lineKey = (j.uniqueLineId || '').trim().toLowerCase();
    const numKey = (j.jointNumber || '').trim().toLowerCase();
    if (!lineKey || !numKey) continue;
    const composite = `${lineKey}::${numKey}`;
    const list = keyToIds.get(composite);
    if (list) {
      list.push(j.id);
    } else {
      keyToIds.set(composite, [j.id]);
    }
  }
  const dupes = new Set<string>();
  for (const ids of keyToIds.values()) {
    if (ids.length > 1) {
      for (const id of ids) dupes.add(id);
    }
  }
  return dupes;
}

export interface QuickFilterContext {
  labRequests?: NdtLabRequest[];
  welders?: WelderProfile[];
  duplicateJointIds?: Set<string>;
}

/**
 * Проверка соответствия стыка выбранному быстрому срезу реестра
 */
export function matchesRegistryQuickFilter(
  joint: WeldJoint,
  quickFilter: RegistryQuickFilter,
  ctx: QuickFilterContext = {}
): boolean {
  if (quickFilter === 'all') return true;

  if (quickFilter === 'unwelded') {
    return !joint.weldingDate || !joint.weldingDate.trim();
  }

  if (quickFilter === 'in_repair') {
    return isJointCurrentlyInRepair(joint);
  }

  if (quickFilter === 'incomplete') {
    return getMissingPassportFields(joint).length > 0;
  }

  if (quickFilter === 'duplicates') {
    return Boolean(ctx.duplicateJointIds && ctx.duplicateJointIds.has(joint.id));
  }

  if (quickFilter === 'ready_for_lab') {
    if (isJointFullyAccepted(joint)) return false;
    const validation = validateJointForLabRequestSubmission(joint, ctx.welders ?? []);
    if (!validation.canSubmit) return false;
    const labStatus = getJointLabRequestStatus(joint, ctx.labRequests ?? []);
    return labStatus === 'Заявка не подана';
  }

  return true;
}

/**
 * Расчёт счётчиков быстрых фильтров реестра стыков
 */
export function computeRegistryQuickFilterCounts(
  joints: WeldJoint[],
  ctx: QuickFilterContext = {}
): RegistryQuickFilterCounts {
  const duplicateJointIds = ctx.duplicateJointIds ?? buildDuplicateJointIdsSet(joints);
  const effectiveCtx: QuickFilterContext = {
    labRequests: ctx.labRequests ?? [],
    welders: ctx.welders ?? [],
    duplicateJointIds,
  };

  let unwelded = 0;
  let ready_for_lab = 0;
  let incomplete = 0;
  let in_repair = 0;
  let duplicates = 0;

  for (const joint of joints) {
    if (!joint.weldingDate || !joint.weldingDate.trim()) {
      unwelded += 1;
    }
    if (isJointCurrentlyInRepair(joint)) {
      in_repair += 1;
    }
    if (getMissingPassportFields(joint).length > 0) {
      incomplete += 1;
    }
    if (duplicateJointIds.has(joint.id)) {
      duplicates += 1;
    }
    if (matchesRegistryQuickFilter(joint, 'ready_for_lab', effectiveCtx)) {
      ready_for_lab += 1;
    }
  }

  return {
    all: joints.length,
    unwelded,
    ready_for_lab,
    incomplete,
    in_repair,
    duplicates,
  };
}

/**
 * Сводный пайплайн фильтрации и сортировки стыков
 */
export function filterAndSortJoints(
  joints: WeldJoint[],
  options: FilterJointsOptions
): WeldJoint[] {
  const {
    selectedObjectName = 'ALL',
    selectedRdCode = 'ALL',
    globalSearch = '',
    weldingDateFrom = '',
    weldingDateTo = '',
    columnFilters = {},
    sortConfig = null,
    labRequests = [],
    testCircuits,
    onlyActiveRepairs = false,
    quickFilter = 'all',
    welders = [],
    duplicateJointIds,
  } = options;

  let result = filterJointsByScope(joints, selectedObjectName, selectedRdCode);
  const resolvedDupes =
    quickFilter === 'duplicates'
      ? duplicateJointIds ?? buildDuplicateJointIdsSet(result)
      : duplicateJointIds;

  result = filterJointsByDateRange(result, weldingDateFrom, weldingDateTo);
  result = filterJointsByColumnFilters(result, columnFilters, labRequests, testCircuits);
  if (onlyActiveRepairs) {
    result = result.filter((j) => isJointCurrentlyInRepair(j));
  }
  if (quickFilter && quickFilter !== 'all') {
    result = result.filter((j) =>
      matchesRegistryQuickFilter(j, quickFilter, {
        labRequests,
        welders,
        duplicateJointIds: resolvedDupes,
      })
    );
  }
  result = filterJointsByGlobalSearch(result, globalSearch, labRequests, testCircuits);

  if (sortConfig) {
    result = sortJoints(result, sortConfig, labRequests, testCircuits);
  }

  return result;
}

/**
 * Расчёт частот уникальных значений по колонке для фильтр-меню реестра
 */
export function computeColumnUniqueValues(
  joints: WeldJoint[],
  colKey: WeldJointFieldKey,
  labRequests: NdtLabRequest[] = [],
  testCircuits?: TestCircuit[]
): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const j of joints) {
    const raw = getJointFieldValue(j, colKey, labRequests, testCircuits);
    const val = String(raw ?? '');
    counts.set(val, (counts.get(val) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value, 'ru', { numeric: true }));
}

/**
 * Фильтрация элементов каталога ЛРВ по шифру РД
 */
export function filterLrvCatalogByRd(
  catalog: LRVItem[],
  rdCode: string,
  allowOtherRdCodes = false
): LRVItem[] {
  if (allowOtherRdCodes) return catalog;
  return catalog.filter((item) => item.rdCode === rdCode);
}

/**
 * Строгая фильтрация каталога материалов ЛРВ по выбранному объекту строительства.
 * В режиме 'ALL' возвращает весь каталог. Для конкретного объекта допускает позиции
 * с совпадающим objectName, а для старых записей без objectName — по facilityId или шифру РД объекта.
 */
export function filterLrvCatalogByObject(
  catalog: LRVItem[],
  selectedObjectName = 'ALL',
  facilities: FacilityObject[] = []
): LRVItem[] {
  if (!selectedObjectName || selectedObjectName === 'ALL') {
    return catalog;
  }

  const targetName = selectedObjectName.trim();
  const matchedFacility = facilities.find((f) => f.name.trim() === targetName);
  const facilityId = matchedFacility?.id;
  const facilityRdCodes = new Set(
    (matchedFacility?.rdCodes || []).map((r) => r.code.trim()).filter(Boolean)
  );

  return catalog.filter((item) => {
    const itemObj = (item.objectName || '').trim();
    if (itemObj) {
      return itemObj === targetName;
    }
    if (facilityId && item.facilityId && item.facilityId === facilityId) {
      return true;
    }
    if (item.rdCode && facilityRdCodes.has(item.rdCode.trim())) {
      return true;
    }
    return false;
  });
}

/**
 * Нормализация строки для поиска в фильтре столбцов (регистр, лишние пробелы, е/ё)
 */
export function normalizeFilterSearchText(text: string): string {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

/**
 * Вычисление итогового массива разрешённых значений при нажатии «ОК» в окне фильтра столбца.
 * В режиме непустого поиска применяются только отмеченные результаты поиска (как в Excel).
 * Возвращает undefined, если выбраны абсолютно все уникальные значения столбца (фильтр снимается).
 */
export function resolveColumnFilterApplySelection(params: {
  allValues: string[];
  filteredValues: string[];
  activeSelection: Set<string>;
  searchQuery: string;
}): string[] | undefined {
  const { allValues, filteredValues, activeSelection, searchQuery } = params;
  const hasSearch = searchQuery.trim().length > 0;
  const effectiveValues = hasSearch
    ? filteredValues.filter((v) => activeSelection.has(v))
    : allValues.filter((v) => activeSelection.has(v));

  if (
    allValues.length > 0 &&
    effectiveValues.length === allValues.length &&
    allValues.every((v) => activeSelection.has(v))
  ) {
    return undefined;
  }

  return effectiveValues;
}

/**
 * Каскадная кросс-фильтрация строк для меню фильтра конкретного столбца (как в Excel).
 * Применяет все активные фильтры других столбцов, исключая сам целевой столбец targetColumnKey,
 * чтобы в списке выбора отображались только актуальные позиции, не отсечённые другими фильтрами.
 */
export function getCascadingFilterRows<T>(
  rows: T[],
  activeFilters: Record<string, string[]>,
  targetColumnKey: string,
  valueGetters: Record<string, (row: T, index: number) => string>
): T[] {
  const otherFilterEntries = Object.entries(activeFilters).filter(
    ([colKey]) => colKey !== targetColumnKey
  );
  if (otherFilterEntries.length === 0) {
    return rows;
  }

  return rows.filter((row, idx) => {
    for (const [colKey, allowedValues] of otherFilterEntries) {
      const getter = valueGetters[colKey];
      if (!getter) continue;
      const val = String(getter(row, idx) ?? '').trim();
      if (!allowedValues.includes(val)) {
        return false;
      }
    }
    return true;
  });
}
