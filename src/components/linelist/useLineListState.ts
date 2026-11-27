import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePersistentState } from '../../hooks/usePersistentState';
import {
  FacilityObject,
  LineListColumnKey,
  ProjectLineItem,
  TestCircuit,
  UserAccount,
  WeldJoint,
} from '../../types/welding';
import {
  computeLineListItemStatusFromLineJoints,
  formatExecutiveDocStatusLabel,
  getJointsForLine,
  indexJointsByLine,
  LINELIST_COLUMNS,
  normalizeExecutiveDocStatus,
} from '../../utils/weldingLogic';
import type { LineCircuitBindingSummary } from './LineListTable';
import type { LineListKpiSummary } from './LineListKpiStrip';
import type { SortConfig } from './types';

const LINELIST_VISIBLE_COLS_STORAGE_KEY = 'zaychick_linelist_visible_cols_v1';
const ALL_LINELIST_COLUMN_KEYS: LineListColumnKey[] = LINELIST_COLUMNS.map((c) => c.key);

function readStoredLineListVisibleColumns(): LineListColumnKey[] {
  if (typeof window === 'undefined') return ALL_LINELIST_COLUMN_KEYS;
  try {
    const raw = window.localStorage.getItem(LINELIST_VISIBLE_COLS_STORAGE_KEY);
    if (!raw) return ALL_LINELIST_COLUMN_KEYS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const valid = new Set<string>(ALL_LINELIST_COLUMN_KEYS);
      const filtered = parsed.filter(
        (k): k is LineListColumnKey => typeof k === 'string' && valid.has(k)
      );
      if (filtered.length > 0) {
        if (!filtered.includes('lineNumber')) {
          filtered.push('lineNumber');
        }
        return ALL_LINELIST_COLUMN_KEYS.filter((k) => filtered.includes(k));
      }
    }
  } catch {
    // ignore storage errors
  }
  return ALL_LINELIST_COLUMN_KEYS;
}

export interface UseLineListStateParams {
  lineList: ProjectLineItem[];
  joints: WeldJoint[];
  facilities: FacilityObject[];
  testCircuits: TestCircuit[];
  userAccounts: UserAccount[];
  selectedObjectName: string;
  selectedRdCode: string;
}

export function useLineListState({
  lineList,
  joints,
  facilities,
  testCircuits,
  userAccounts,
  selectedObjectName,
  selectedRdCode,
}: UseLineListStateParams) {
  const [columnFilters, setColumnFilters] = usePersistentState<
    Partial<Record<LineListColumnKey, string[]>>
  >('linelist:columnFilters', {});
  const [searchQuery, setSearchQuery] = usePersistentState('linelist:searchQuery', '');
  const [visibleColumns, setVisibleColumns] = useState<LineListColumnKey[]>(
    readStoredLineListVisibleColumns
  );
  const [openFilterColumnKey, setOpenFilterColumnKey] =
    useState<LineListColumnKey | null>(null);
  const [sortConfig, setSortConfig] = usePersistentState<SortConfig | null>(
    'linelist:sortConfig',
    null
  );
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        LINELIST_VISIBLE_COLS_STORAGE_KEY,
        JSON.stringify(visibleColumns)
      );
    } catch {
      // ignore storage errors
    }
  }, [visibleColumns]);

  const handleToggleColumnVisibility = useCallback((colKey: LineListColumnKey) => {
    if (colKey === 'lineNumber') return;
    setVisibleColumns((prev) => {
      if (prev.includes(colKey)) {
        const next = prev.filter((k) => k !== colKey);
        return next.length > 0 ? next : ['lineNumber'];
      }
      const nextSet = new Set<LineListColumnKey>([...prev, colKey, 'lineNumber']);
      return ALL_LINELIST_COLUMN_KEYS.filter((k) => nextSet.has(k));
    });
  }, []);

  const handleShowAllColumns = useCallback(() => {
    setVisibleColumns(ALL_LINELIST_COLUMN_KEYS);
  }, []);

  // Единая O(M) индексация стыков по линиям — переиспользуется и для статусов готовности, и для контуров
  const jointsIndex = useMemo(() => indexJointsByLine(joints), [joints]);

  // Сводка фактической привязки стыков каждой линии к испытательным контурам
  const lineCircuitsMap = useMemo(() => {
    const map = new Map<string, LineCircuitBindingSummary[]>();
    if (testCircuits.length === 0) return map;

    const circuitsById = new Map(testCircuits.map((c) => [c.id, c]));
    const circuitsByObjAndName = new Map(
      testCircuits.map((c) => [`${c.objectName || ''}::${c.name}`, c])
    );

    for (const [uid, lineJoints] of jointsIndex.byUniqueLineId.entries()) {
      const total = lineJoints.length;
      if (total === 0) continue;
      const counts = new Map<string, { circuitName: string; count: number }>();
      for (const j of lineJoints) {
        const matched =
          (j.testCircuitId ? circuitsById.get(j.testCircuitId) : undefined) ||
          (j.contour
            ? circuitsByObjAndName.get(`${j.objectName || ''}::${j.contour}`)
            : undefined);
        if (!matched) continue;
        const prev = counts.get(matched.id);
        if (prev) prev.count += 1;
        else counts.set(matched.id, { circuitName: matched.name, count: 1 });
      }
      if (counts.size > 0) {
        map.set(
          uid,
          Array.from(counts.entries())
            .map(([circuitId, info]) => ({
              circuitId,
              circuitName: info.circuitName,
              assigned: info.count,
              total,
              isFull: info.count === total,
            }))
            .sort((a, b) => a.circuitName.localeCompare(b.circuitName, 'ru'))
        );
      }
    }
    return map;
  }, [jointsIndex, testCircuits]);

  // O(N + M) расчёт статуса готовности для каждой строки выбранного объекта и РД
  const scopedList = useMemo(() => {
    const result: {
      item: ProjectLineItem;
      status: ReturnType<typeof computeLineListItemStatusFromLineJoints>;
    }[] = [];

    for (const item of lineList) {
      if (selectedObjectName !== 'ALL' && item.objectName !== selectedObjectName) {
        continue;
      }
      if (selectedRdCode !== 'ALL' && item.rdCode !== selectedRdCode) {
        continue;
      }
      const lineJoints = getJointsForLine(item, jointsIndex);
      result.push({
        item,
        status: computeLineListItemStatusFromLineJoints(item, lineJoints),
      });
    }
    return result;
  }, [lineList, jointsIndex, selectedObjectName, selectedRdCode]);

  // Сбрасываем скрытое выделение при смене объекта, шифра РД или удалении строк
  useEffect(() => {
    const scopedIdSet = new Set(scopedList.map((r) => r.item.id));
    setSelectedLineIds((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.filter((id) => scopedIdSet.has(id));
      return next.length === prev.length ? prev : next;
    });
    setConfirmBulkDelete(false);
  }, [scopedList]);

  const getCellRawValue = useCallback(
    (
      row: {
        item: ProjectLineItem;
        status: ReturnType<typeof computeLineListItemStatusFromLineJoints>;
      },
      colKey: LineListColumnKey
    ): string => {
      if (colKey === 'testContour') {
        const bindings = lineCircuitsMap.get(row.item.uniqueLineId);
        if (bindings && bindings.length > 0) {
          return bindings.map((b) => b.circuitName).join(', ');
        }
        return row.item.testContour?.trim() || '';
      }
      if (colKey === 'readinessProgress') {
        if (row.status.totalJoints === 0) return 'Нет стыков';
        if (row.status.jointsReadinessPct >= 100) return '100%';
        if (row.status.jointsReadinessPct <= 0) return '0%';
        return 'Частично';
      }
      if (colKey === 'computedStatus') {
        return row.status.ndtStatusBadge;
      }
      if (colKey === 'idStatus') {
        return formatExecutiveDocStatusLabel(row.item.idStatus);
      }
      if (colKey === 'responsiblePto') {
        return row.item.responsiblePto?.trim() || 'Не назначен';
      }
      return String(row.item[colKey] ?? '');
    },
    [lineCircuitsMap]
  );

  // Применение быстрого поиска, Excel-фильтров по столбцам и сортировки
  const filteredAndSortedList = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const filterEntries = Object.entries(columnFilters).filter(
      ([, allowed]) => allowed !== undefined
    ) as [LineListColumnKey, string[]][];
    const filterSets = filterEntries.map(([k, vals]) => [k, new Set(vals)] as const);

    const filtered = scopedList.filter((row) => {
      if (normalizedQuery) {
        const contourDisplay = getCellRawValue(row, 'testContour');
        const haystack = [
          row.item.lineNumber,
          row.item.uniqueLineId,
          row.item.lineName,
          row.item.rdCode,
          row.item.objectName,
          row.item.product,
          contourDisplay,
          row.item.responsiblePto || '',
          row.item.pipelineCategory,
          row.item.qualityLevel,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(normalizedQuery)) {
          return false;
        }
      }

      for (const [colKey, allowedSet] of filterSets) {
        const rawVal = getCellRawValue(row, colKey);
        if (!allowedSet.has(rawVal)) {
          return false;
        }
      }
      return true;
    });

    if (!sortConfig) return filtered;
    const { key, direction } = sortConfig;
    return [...filtered].sort((a, b) => {
      if (key === 'readinessProgress') {
        const scoreA = a.status.totalJoints === 0 ? -1 : a.status.jointsReadinessPct;
        const scoreB = b.status.totalJoints === 0 ? -1 : b.status.jointsReadinessPct;
        const cmp =
          scoreA !== scoreB
            ? scoreA - scoreB
            : a.status.ediReadinessPct !== b.status.ediReadinessPct
              ? a.status.ediReadinessPct - b.status.ediReadinessPct
              : a.status.totalJoints - b.status.totalJoints;
        return direction === 'asc' ? cmp : -cmp;
      }
      const valA = getCellRawValue(a, key);
      const valB = getCellRawValue(b, key);
      const cmp = valA.localeCompare(valB, 'ru', { numeric: true });
      return direction === 'asc' ? cmp : -cmp;
    });
  }, [scopedList, searchQuery, columnFilters, sortConfig, getCellRawValue]);

  const kpiSummary = useMemo<LineListKpiSummary>(() => {
    let weldedJoints = 0;
    let totalJoints = 0;
    let weldedEdi = 0;
    let totalEdi = 0;
    let ndtSufficientLines = 0;
    let ndtInsufficientLines = 0;
    let signedIdLines = 0;

    for (const { item, status } of filteredAndSortedList) {
      weldedJoints += status.weldedJoints;
      totalJoints += status.totalJoints;
      weldedEdi += status.weldedEdi;
      totalEdi += status.totalEdi;
      if (status.ndtStatus === 'sufficient') ndtSufficientLines += 1;
      else if (status.ndtStatus === 'insufficient') ndtInsufficientLines += 1;
      if (normalizeExecutiveDocStatus(item.idStatus) === 'SIGNED') {
        signedIdLines += 1;
      }
    }

    return {
      visibleLines: filteredAndSortedList.length,
      totalLines: scopedList.length,
      weldedJoints,
      totalJoints,
      jointsReadinessPct:
        totalJoints > 0 ? Math.round((weldedJoints / totalJoints) * 1000) / 10 : 0,
      weldedEdi: Math.round(weldedEdi * 100) / 100,
      totalEdi: Math.round(totalEdi * 100) / 100,
      ediReadinessPct:
        totalEdi > 0 ? Math.round((weldedEdi / totalEdi) * 1000) / 10 : 0,
      ndtSufficientLines,
      ndtInsufficientLines,
      signedIdLines,
    };
  }, [filteredAndSortedList, scopedList.length]);

  const getUniqueValuesForColumn = useCallback(
    (colKey: LineListColumnKey) => {
      const counts = new Map<string, number>();
      for (const row of scopedList) {
        const val = getCellRawValue(row, colKey);
        counts.set(val, (counts.get(val) || 0) + 1);
      }
      return Array.from(counts.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => a.value.localeCompare(b.value, 'ru', { numeric: true }));
    },
    [scopedList, getCellRawValue]
  );

  const toggleSelectAllVisible = useCallback(() => {
    const visibleIds = filteredAndSortedList.map((r) => r.item.id);
    const visibleSet = new Set(visibleIds);
    setSelectedLineIds((prev) => {
      const prevSet = new Set(prev);
      const allSelected =
        visibleIds.length > 0 && visibleIds.every((id) => prevSet.has(id));
      if (allSelected) {
        return prev.filter((id) => !visibleSet.has(id));
      }
      return Array.from(new Set([...prev, ...visibleIds]));
    });
  }, [filteredAndSortedList]);

  const toggleSelectRow = useCallback((id: string) => {
    setSelectedLineIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const { selectedDeletableLineIds, selectedBlockedByJointsCount } = useMemo(() => {
    const selectedSet = new Set(selectedLineIds);
    const deletable: string[] = [];
    let blocked = 0;
    for (const row of scopedList) {
      if (!selectedSet.has(row.item.id)) continue;
      if (row.status.totalJoints > 0) blocked += 1;
      else deletable.push(row.item.id);
    }
    return {
      selectedDeletableLineIds: deletable,
      selectedBlockedByJointsCount: blocked,
    };
  }, [scopedList, selectedLineIds]);

  const activeFilterKeys = useMemo(
    () =>
      (Object.keys(columnFilters) as LineListColumnKey[]).filter(
        (k) => (columnFilters[k]?.length ?? 0) > 0
      ),
    [columnFilters]
  );

  const columnLabelMap = useMemo(
    () => Object.fromEntries(LINELIST_COLUMNS.map((c) => [c.key, c.label])),
    []
  );

  // Справочные списки для фильтров и datalist-подсказок (один O(N) проход по lineList)
  const {
    uniqueObjectNames,
    uniqueRdCodes,
    uniqueContours,
    availableObjectOptions,
    availableFilterRdCodes,
    ptoEngineerOptions,
  } = useMemo(() => {
    const objSet = new Set<string>();
    const rdSet = new Set<string>();
    const contourSet = new Set<string>();
    const scopedRdSet = new Set<string>();
    const ptoSet = new Set<string>();

    for (const item of lineList) {
      const obj = item.objectName.trim();
      const rd = item.rdCode.trim();
      if (obj) objSet.add(obj);
      if (rd) rdSet.add(rd);
      if (item.testContour) contourSet.add(item.testContour);
      if (selectedObjectName === 'ALL' || item.objectName === selectedObjectName) {
        if (rd) scopedRdSet.add(rd);
      }
      const pto = item.responsiblePto?.trim();
      if (pto) ptoSet.add(pto);
    }

    const availObjs = new Set<string>();
    for (const f of facilities) {
      const name = f.name.trim();
      if (name) availObjs.add(name);
      if (f.name === selectedObjectName) {
        for (const r of f.rdCodes) {
          const code = r.code.trim();
          if (code) scopedRdSet.add(code);
        }
      }
    }
    for (const obj of objSet) availObjs.add(obj);

    for (const acc of userAccounts) {
      if (acc.isActive === false) continue;
      if (acc.department === 'PTO' || acc.role === 'ПТО') {
        const clean = acc.fullName?.trim();
        if (clean) ptoSet.add(clean);
      }
    }

    return {
      uniqueObjectNames: Array.from(objSet),
      uniqueRdCodes: Array.from(rdSet),
      uniqueContours: Array.from(contourSet),
      availableObjectOptions: Array.from(availObjs),
      availableFilterRdCodes: Array.from(scopedRdSet),
      ptoEngineerOptions: Array.from(ptoSet).sort((a, b) => a.localeCompare(b, 'ru')),
    };
  }, [lineList, facilities, userAccounts, selectedObjectName]);

  return {
    columnFilters,
    setColumnFilters,
    searchQuery,
    setSearchQuery,
    visibleColumns,
    handleToggleColumnVisibility,
    handleShowAllColumns,
    openFilterColumnKey,
    setOpenFilterColumnKey,
    sortConfig,
    setSortConfig,
    selectedLineIds,
    setSelectedLineIds,
    confirmBulkDelete,
    setConfirmBulkDelete,
    lineCircuitsMap,
    scopedList,
    filteredAndSortedList,
    kpiSummary,
    getUniqueValuesForColumn,
    toggleSelectAllVisible,
    toggleSelectRow,
    selectedDeletableLineIds,
    selectedBlockedByJointsCount,
    activeFilterKeys,
    columnLabelMap,
    uniqueObjectNames,
    uniqueRdCodes,
    uniqueContours,
    availableObjectOptions,
    availableFilterRdCodes,
    ptoEngineerOptions,
  };
}
