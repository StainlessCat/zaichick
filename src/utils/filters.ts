/**
 * ZAYCHICK — Модуль фильтрации, поиска и сортировки стыков и каталогов.
 * Изолированные чистые функции без привязки к React для тестирования и переиспользования.
 */

import { FacilityObject, LRVItem, NdtLabRequest, WeldJoint, WeldJointFieldKey } from '../types/welding';
import { ALL_COLUMNS } from './columns';
import { formatDateDDMMYY } from './formatting';
import { isDateColumnKey, isWeldingDateInRange } from './dates';
import { getJointEquivDiaInch } from './pipeCalc';
import { getJointLabRequestStatus } from './laboratoryLogic';

export interface FilterJointsOptions {
  selectedObjectName?: string;
  selectedRdCode?: string;
  globalSearch?: string;
  weldingDateFrom?: string;
  weldingDateTo?: string;
  columnFilters?: Partial<Record<WeldJointFieldKey, string[]>>;
  sortConfig?: { key: WeldJointFieldKey; direction: 'asc' | 'desc' } | null;
  labRequests?: NdtLabRequest[];
}

/**
 * Получение строкового/числового значения поля стыка с вычисляемыми полями
 */
export function getJointFieldValue(
  joint: WeldJoint,
  colKey: WeldJointFieldKey | string,
  labRequests: NdtLabRequest[] = []
): string | number {
  if (colKey === 'equivDiameterInch') {
    return getJointEquivDiaInch(joint);
  }
  if (colKey === 'labRequestStatus') {
    return getJointLabRequestStatus(joint, labRequests);
  }
  return joint[colKey as WeldJointFieldKey] ?? '';
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
  labRequests: NdtLabRequest[] = []
): WeldJoint[] {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return joints;

  return joints.filter((joint) => {
    return ALL_COLUMNS.some((col) => {
      const rawVal = getJointFieldValue(joint, col.key, labRequests);
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
  labRequests: NdtLabRequest[] = []
): WeldJoint[] {
  const activeFilters = Object.entries(columnFilters).filter(
    ([, allowed]) => allowed && allowed.length > 0
  );
  if (activeFilters.length === 0) return joints;

  return joints.filter((joint) => {
    for (const [colKey, allowedValues] of activeFilters) {
      if (!allowedValues) continue;
      const rawVal = String(getJointFieldValue(joint, colKey, labRequests));
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
  labRequests: NdtLabRequest[] = []
): WeldJoint[] {
  const { key, direction } = sortConfig;
  return [...joints].sort((a, b) => {
    const valA = getJointFieldValue(a, key, labRequests);
    const valB = getJointFieldValue(b, key, labRequests);
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
  } = options;

  let result = filterJointsByScope(joints, selectedObjectName, selectedRdCode);
  result = filterJointsByDateRange(result, weldingDateFrom, weldingDateTo);
  result = filterJointsByColumnFilters(result, columnFilters, labRequests);
  result = filterJointsByGlobalSearch(result, globalSearch, labRequests);

  if (sortConfig) {
    result = sortJoints(result, sortConfig, labRequests);
  }

  return result;
}

/**
 * Расчёт частот уникальных значений по колонке для фильтр-меню реестра
 */
export function computeColumnUniqueValues(
  joints: WeldJoint[],
  colKey: WeldJointFieldKey,
  labRequests: NdtLabRequest[] = []
): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const j of joints) {
    const raw = getJointFieldValue(j, colKey, labRequests);
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
