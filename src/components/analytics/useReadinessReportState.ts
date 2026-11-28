import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ReadinessGroupCondition,
  ReadinessSummaryRow,
  WeldJoint,
} from '../../types/welding';
import type { ExecutiveDocRecord } from '../../types/executiveDocs';
import {
  calculateReadinessReport,
  isLineExecutiveDocSigned,
  isWeldingDateInRange,
  TEST_ALLOWANCE_STATUS_LABELS,
} from '../../utils/weldingLogic';
import {
  exportReadinessOfflineExcel,
  exportReadinessReportToExcel,
  triggerBlobDownload,
} from '../../utils/excelUtils';
import { applyTableColumnFiltersAndSort } from '../TableColumnFilterPopover';
import { useResizableColumns } from '../../utils/useResizableColumns';
import { useAppContext, useAuth } from '../../context';
import { listExecutiveDocsApi } from '../../api/executiveDocsApi';
import { zaychickApi } from '../../api/zaychickApi';
import {
  buildWelderAnalyticsRows,
  filterJointsAndLinesByReadinessScope,
  getContourBlockerSummary,
  matchesContourQuickFilter,
  type ContourQuickFilterId,
} from '../../utils/analyticsCharts';
import {
  CONDITION_TITLE_MAP,
  DEFAULT_READINESS_COL_WIDTHS,
  DEFAULT_VISIBLE_COLUMNS,
  readStoredExecutiveDocs,
  readStoredVisibleColumns,
  toLocalIsoDate,
  VISIBLE_COLS_STORAGE_KEY,
  type DatePresetId,
  type ToggleableColumnKey,
} from './readinessConfig';

export interface ReadinessSummaryTotals {
  total: number;
  supplementary: number;
  welded: number;
  weldingPct: number;
  totalEquivInches: number;
  weldedEquivInches: number;
  equivWeldingPct: number;
  vikOk: number;
  ndtOk: number;
  ndtNotReq: number;
  dupNdtOk: number;
  repair: number;
  ready: number;
  readyPct: number;
  totalLines: number;
  signedIdLines: number;
  idReadinessPct: number;
  totalContoursCount: number;
  allowedContoursCount: number;
}

export function useReadinessReportState(joints: WeldJoint[]) {
  const app = useAppContext();
  const auth = useAuth();
  const {
    projectLineList,
    testCircuits,
    welders,
    derivedFacilities,
    selectedObjectName,
    selectedRdCode,
    isDbConnected,
  } = app;

  const [activeTab, setActiveTab] = useState<'readiness' | 'welders'>('readiness');
  const [condition, setCondition] = useState<ReadinessGroupCondition>('objectName');
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [contourQuickFilter, setContourQuickFilter] = useState<ContourQuickFilterId>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [datePreset, setDatePreset] = useState<DatePresetId>('all');
  const [weldingDateFrom, setWeldingDateFrom] = useState<string>('');
  const [weldingDateTo, setWeldingDateTo] = useState<string>('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<ToggleableColumnKey[]>(
    readStoredVisibleColumns
  );
  const [isColumnsPopoverOpen, setIsColumnsPopoverOpen] = useState(false);
  const columnsMenuRef = useRef<HTMLDivElement>(null);

  const [exportToast, setExportToast] = useState<string>('');
  const [docByLineId, setDocByLineId] = useState<Record<string, ExecutiveDocRecord>>(
    readStoredExecutiveDocs
  );
  const [serverBaseRows, setServerBaseRows] = useState<ReadinessSummaryRow[] | null>(null);
  const [isSyncingServerReport, setIsSyncingServerReport] = useState(false);

  // Сохранение набора видимых столбцов
  useEffect(() => {
    try {
      window.localStorage.setItem(VISIBLE_COLS_STORAGE_KEY, JSON.stringify(visibleColumns));
    } catch {
      // ignore storage errors
    }
  }, [visibleColumns]);

  // Закрытие меню выбора столбцов по клику вне области
  useEffect(() => {
    if (!isColumnsPopoverOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) {
        setIsColumnsPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isColumnsPopoverOpen]);

  // Синхронизация статусов ИД с сервером
  useEffect(() => {
    if (!isDbConnected || !auth.isAuthenticated) {
      setDocByLineId(readStoredExecutiveDocs());
      return;
    }
    let cancelled = false;
    const loadDocs = async () => {
      try {
        const list = await listExecutiveDocsApi({
          objectName:
            selectedObjectName && selectedObjectName !== 'ALL'
              ? selectedObjectName
              : undefined,
        });
        if (cancelled) return;
        setDocByLineId((prev) => {
          const next = { ...prev };
          for (const rec of list) {
            next[rec.lineId] = rec;
          }
          return next;
        });
      } catch {
        // При сетевой ошибке используем кэш localStorage и поле line.idStatus
      }
    };
    void loadDocs();
    return () => {
      cancelled = true;
    };
  }, [auth.isAuthenticated, isDbConnected, selectedObjectName]);

  const activeFacilityId = useMemo(() => {
    if (!selectedObjectName || selectedObjectName === 'ALL') return undefined;
    const found = derivedFacilities.find((f) => f.name === selectedObjectName);
    if (!found?.id) return undefined;
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(found.id);
    return isUuid ? found.id : undefined;
  }, [derivedFacilities, selectedObjectName]);

  // Серверная аналитика как единый источник истины при активном подключении к БД
  useEffect(() => {
    const canQueryServer =
      isDbConnected &&
      auth.isAuthenticated &&
      (!selectedObjectName || selectedObjectName === 'ALL' || Boolean(activeFacilityId));

    if (!canQueryServer) {
      setServerBaseRows(null);
      setIsSyncingServerReport(false);
      return;
    }

    const controller = new AbortController();
    setIsSyncingServerReport(true);
    zaychickApi
      .getReadinessReport({
        condition,
        facilityId: activeFacilityId,
        rdCode: selectedRdCode !== 'ALL' ? selectedRdCode : undefined,
        dateFrom: weldingDateFrom || undefined,
        dateTo: weldingDateTo || undefined,
        signal: controller.signal,
      })
      .then((rows) => {
        if (!controller.signal.aborted) {
          setServerBaseRows(rows);
          setIsSyncingServerReport(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          // Фоллбэк на локальный расчёт при недоступности сервера
          setServerBaseRows(null);
          setIsSyncingServerReport(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [
    activeFacilityId,
    auth.isAuthenticated,
    condition,
    isDbConnected,
    joints.length,
    projectLineList.length,
    selectedObjectName,
    selectedRdCode,
    testCircuits.length,
    weldingDateFrom,
    weldingDateTo,
  ]);

  const visibleColSet = useMemo(
    () => new Set<ToggleableColumnKey>(visibleColumns),
    [visibleColumns]
  );
  const isColVisible = (key: ToggleableColumnKey) => visibleColSet.has(key);

  const toggleColumnVisibility = (colKey: ToggleableColumnKey) => {
    setVisibleColumns((prev) => {
      if (prev.includes(colKey)) {
        if (prev.length <= 1) return prev;
        return prev.filter((k) => k !== colKey);
      }
      const nextSet = new Set([...prev, colKey]);
      return DEFAULT_VISIBLE_COLUMNS.filter((k) => nextSet.has(k));
    });
  };

  const handleSelectDatePreset = (preset: DatePresetId) => {
    setDatePreset(preset);
    if (preset === 'all') {
      setWeldingDateFrom('');
      setWeldingDateTo('');
      return;
    }
    const today = new Date();
    const toStr = toLocalIsoDate(today);
    if (preset === 'today') {
      setWeldingDateFrom(toStr);
      setWeldingDateTo(toStr);
    } else if (preset === '7d') {
      const from = new Date(today);
      from.setDate(today.getDate() - 6);
      setWeldingDateFrom(toLocalIsoDate(from));
      setWeldingDateTo(toStr);
    } else if (preset === '30d') {
      const from = new Date(today);
      from.setDate(today.getDate() - 29);
      setWeldingDateFrom(toLocalIsoDate(from));
      setWeldingDateTo(toStr);
    }
  };

  const hasDateRangeFilter = Boolean(weldingDateFrom || weldingDateTo);

  const resizable = useResizableColumns({
    storageKey: 'zaychick_col_widths_readiness_v2',
    defaultWidths: DEFAULT_READINESS_COL_WIDTHS,
  });

  const periodJoints = useMemo(() => {
    if (!hasDateRangeFilter) return joints;
    return joints.filter((j) =>
      isWeldingDateInRange(j.weldingDate, weldingDateFrom, weldingDateTo)
    );
  }, [hasDateRangeFilter, joints, weldingDateFrom, weldingDateTo]);

  const scopedLines = useMemo(() => {
    return projectLineList.filter((line) => {
      const objMatch =
        !selectedObjectName ||
        selectedObjectName === 'ALL' ||
        line.objectName === selectedObjectName;
      const rdMatch =
        !selectedRdCode || selectedRdCode === 'ALL' || line.rdCode === selectedRdCode;
      return objMatch && rdMatch;
    });
  }, [projectLineList, selectedObjectName, selectedRdCode]);

  const lineMetaByUniqueId = useMemo(() => {
    const map = new Map<string, { rdCode: string; lineNumber: string }>();
    for (const ln of scopedLines) {
      if (ln.uniqueLineId) {
        map.set(ln.uniqueLineId, { rdCode: ln.rdCode, lineNumber: ln.lineNumber });
      }
    }
    for (const j of joints) {
      if (j.uniqueLineId && !map.has(j.uniqueLineId)) {
        map.set(j.uniqueLineId, { rdCode: j.rdCode, lineNumber: j.lineNumber });
      }
    }
    return map;
  }, [joints, scopedLines]);

  const scopedTestCircuits = useMemo(() => {
    const byObject = testCircuits.filter(
      (c) =>
        !selectedObjectName ||
        selectedObjectName === 'ALL' ||
        !c.objectName ||
        c.objectName === selectedObjectName
    );
    if (!selectedRdCode || selectedRdCode === 'ALL') {
      return byObject;
    }
    const allowedLineIds = new Set(scopedLines.map((l) => l.id));
    const allowedUniqueLineIds = new Set(scopedLines.map((l) => l.uniqueLineId));
    const allowedCircuitIds = new Set(
      joints.map((j) => j.testCircuitId).filter((id): id is string => Boolean(id))
    );
    return byObject.filter((c) => {
      if (allowedCircuitIds.has(c.id)) return true;
      return (c.linesSummary || []).some(
        (ls) =>
          allowedLineIds.has(ls.lineId) ||
          allowedUniqueLineIds.has(ls.uniqueLineId) ||
          ls.rdCode === selectedRdCode
      );
    });
  }, [joints, scopedLines, selectedObjectName, selectedRdCode, testCircuits]);

  const localBaseRows = useMemo(() => {
    if (serverBaseRows !== null) return [];
    return calculateReadinessReport(periodJoints, condition, {
      lines: scopedLines,
      testCircuits: scopedTestCircuits,
      docByLineId,
      excludeEmptyGroups: hasDateRangeFilter,
    });
  }, [
    serverBaseRows,
    periodJoints,
    condition,
    scopedLines,
    scopedTestCircuits,
    docByLineId,
    hasDateRangeFilter,
  ]);

  // Используем серверные строки, если они получены и синхронизированы с БД, иначе локальный расчёт
  const baseRows = serverBaseRows ?? localBaseRows;

  const rowGetters = useMemo<Record<string, (r: ReadinessSummaryRow) => string>>(
    () => ({
      groupKey: (r) => r.groupKey,
      totalJoints: (r) =>
        r.supplementaryJoints > 0
          ? `${r.totalJoints} · доп. ${r.supplementaryJoints}`
          : String(r.totalJoints),
      weldedCount: (r) => `${r.weldedCount} · ${r.weldingPct}%`,
      equivInches: (r) =>
        `${r.weldedEquivInches} / ${r.totalEquivInches} · ${r.equivWeldingPct}%`,
      vikPassedCount: (r) => String(r.vikPassedCount),
      ndtPassedCount: (r) =>
        r.ndtNotRequiredCount > 0
          ? `${r.ndtPassedCount} · без НК ${r.ndtNotRequiredCount}`
          : String(r.ndtPassedCount),
      dupNdtPassedCount: (r) => String(r.dupNdtPassedCount),
      repairCount: (r) => String(r.repairCount),
      readinessPct: (r) => `${r.readinessPct}% · ${r.fullyCompletedCount}/${r.totalJoints}`,
      idStatus: (r) => {
        if (condition === 'uniqueLineId') {
          return r.lineIdStatus === 'SIGNED' ? 'Подписана' : 'В работе';
        }
        const base = `${r.signedIdLinesCount} / ${r.totalLinesCount} · ${r.idReadinessPct}%`;
        if (condition === 'contour' && r.testAllowanceStatus) {
          return `${base} · ${TEST_ALLOWANCE_STATUS_LABELS[r.testAllowanceStatus]}`;
        }
        return base;
      },
    }),
    [condition]
  );

  const rows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const byContourQuick =
      condition === 'contour' && contourQuickFilter !== 'all'
        ? baseRows.filter((r) => matchesContourQuickFilter(r, contourQuickFilter))
        : baseRows;

    const searched = q
      ? byContourQuick.filter(
          (r) =>
            r.groupKey.toLowerCase().includes(q) ||
            r.subLabel.toLowerCase().includes(q)
        )
      : byContourQuick;

    const filtered = applyTableColumnFiltersAndSort(
      searched,
      columnFilters,
      rowGetters,
      null
    );
    if (!sortConfig) return filtered;

    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortConfig.key) {
        case 'groupKey':
          cmp = a.groupKey.localeCompare(b.groupKey, 'ru', { numeric: true });
          break;
        case 'totalJoints':
          cmp = a.totalJoints - b.totalJoints;
          break;
        case 'weldedCount':
          cmp = a.weldingPct - b.weldingPct || a.weldedCount - b.weldedCount;
          break;
        case 'equivInches':
          cmp =
            a.equivWeldingPct - b.equivWeldingPct ||
            a.weldedEquivInches - b.weldedEquivInches;
          break;
        case 'vikPassedCount':
          cmp = a.vikPassedCount - b.vikPassedCount;
          break;
        case 'ndtPassedCount':
          cmp =
            a.ndtPassedCount +
            a.ndtNotRequiredCount -
            (b.ndtPassedCount + b.ndtNotRequiredCount);
          break;
        case 'dupNdtPassedCount':
          cmp = a.dupNdtPassedCount - b.dupNdtPassedCount;
          break;
        case 'repairCount':
          cmp = a.repairCount - b.repairCount;
          break;
        case 'readinessPct':
          cmp =
            a.readinessPct - b.readinessPct ||
            a.fullyCompletedCount - b.fullyCompletedCount;
          break;
        case 'idStatus':
          if (condition === 'uniqueLineId') {
            cmp =
              (a.lineIdStatus === 'SIGNED' ? 1 : 0) -
              (b.lineIdStatus === 'SIGNED' ? 1 : 0);
          } else {
            cmp =
              a.idReadinessPct - b.idReadinessPct ||
              a.signedIdLinesCount - b.signedIdLinesCount;
          }
          break;
        default:
          cmp = (rowGetters[sortConfig.key]?.(a) ?? '').localeCompare(
            rowGetters[sortConfig.key]?.(b) ?? '',
            'ru',
            { numeric: true }
          );
      }
      return cmp * dir;
    });
  }, [baseRows, columnFilters, condition, contourQuickFilter, rowGetters, searchQuery, sortConfig]);

  const handleApplyFilter = (colKey: string, vals: string[] | undefined) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (vals === undefined) delete next[colKey];
      else next[colKey] = vals;
      return next;
    });
  };

  const handleSort = (colKey: string, direction: 'asc' | 'desc') => {
    setSortConfig({ key: colKey, direction });
  };

  // Сброс выбранного элемента при смене разреза
  useEffect(() => {
    setSelectedGroupKey(null);
  }, [condition]);

  // Актуальный выбранный элемент (если отфильтрован из таблицы — считаем невыбранным)
  const effectiveSelectedGroupKey = useMemo(() => {
    if (!selectedGroupKey) return null;
    return rows.some((r) => r.groupKey === selectedGroupKey) ? selectedGroupKey : null;
  }, [rows, selectedGroupKey]);

  const hasTableSubsetFilter =
    Object.keys(columnFilters).length > 0 ||
    searchQuery.trim().length > 0 ||
    (condition === 'contour' && contourQuickFilter !== 'all') ||
    rows.length !== baseRows.length;

  const allowedGroupKeys = useMemo(() => {
    if (!hasTableSubsetFilter && !hasDateRangeFilter) return null;
    return new Set(rows.map((r) => r.groupKey));
  }, [hasDateRangeFilter, hasTableSubsetFilter, rows]);

  const dynamicsScope = useMemo(
    () =>
      filterJointsAndLinesByReadinessScope({
        joints: periodJoints,
        lines: scopedLines,
        testCircuits: scopedTestCircuits,
        condition,
        selectedGroupKey: effectiveSelectedGroupKey,
        allowedGroupKeys,
      }),
    [
      allowedGroupKeys,
      condition,
      effectiveSelectedGroupKey,
      periodJoints,
      scopedLines,
      scopedTestCircuits,
    ]
  );

  const hasActiveFilters =
    Object.keys(columnFilters).length > 0 ||
    searchQuery.trim().length > 0 ||
    hasDateRangeFilter ||
    Boolean(effectiveSelectedGroupKey) ||
    (condition === 'contour' && contourQuickFilter !== 'all');

  const handleResetAllFilters = () => {
    setColumnFilters({});
    setSearchQuery('');
    setDatePreset('all');
    setWeldingDateFrom('');
    setWeldingDateTo('');
    setContourQuickFilter('all');
    setSelectedGroupKey(null);
  };

  const summary = useMemo<ReadinessSummaryTotals>(() => {
    const total = rows.reduce((acc, r) => acc + r.totalJoints, 0);
    const supplementary = rows.reduce((acc, r) => acc + r.supplementaryJoints, 0);
    const welded = rows.reduce((acc, r) => acc + r.weldedCount, 0);
    const vikOk = rows.reduce((acc, r) => acc + r.vikPassedCount, 0);
    const ndtOk = rows.reduce((acc, r) => acc + r.ndtPassedCount, 0);
    const ndtNotReq = rows.reduce((acc, r) => acc + r.ndtNotRequiredCount, 0);
    const dupNdtOk = rows.reduce((acc, r) => acc + r.dupNdtPassedCount, 0);
    const repair = rows.reduce((acc, r) => acc + r.repairCount, 0);
    const ready = rows.reduce((acc, r) => acc + r.fullyCompletedCount, 0);

    const totalEquivInches =
      Math.round(rows.reduce((acc, r) => acc + r.totalEquivInches, 0) * 10) / 10;
    const weldedEquivInches =
      Math.round(rows.reduce((acc, r) => acc + r.weldedEquivInches, 0) * 10) / 10;
    const equivWeldingPct =
      totalEquivInches > 0
        ? Math.round((weldedEquivInches / totalEquivInches) * 100)
        : 0;

    let totalLines = rows.reduce((acc, r) => acc + r.totalLinesCount, 0);
    let signedIdLines = rows.reduce((acc, r) => acc + r.signedIdLinesCount, 0);
    if (condition === 'contour' && !hasActiveFilters && scopedLines.length > 0) {
      totalLines = scopedLines.length;
      signedIdLines = scopedLines.filter((l) =>
        isLineExecutiveDocSigned(l, docByLineId)
      ).length;
    }

    const idReadinessPct =
      totalLines > 0 ? Math.round((signedIdLines / totalLines) * 100) : 0;

    const realContours =
      condition === 'contour'
        ? rows.filter((r) => r.groupKey !== 'Без контура')
        : [];
    const allowedContoursCount = realContours.filter(
      (r) => r.testAllowanceStatus === 'allowed'
    ).length;

    return {
      total,
      supplementary,
      welded,
      weldingPct: total > 0 ? Math.round((welded / total) * 100) : 0,
      totalEquivInches,
      weldedEquivInches,
      equivWeldingPct,
      vikOk,
      ndtOk,
      ndtNotReq,
      dupNdtOk,
      repair,
      ready,
      readyPct: total > 0 ? Math.round((ready / total) * 100) : 0,
      totalLines,
      signedIdLines,
      idReadinessPct,
      totalContoursCount: realContours.length,
      allowedContoursCount,
    };
  }, [condition, docByLineId, hasActiveFilters, rows, scopedLines]);

  const tableFooterTotals = useMemo(() => {
    const totalLines = rows.reduce((acc, r) => acc + r.totalLinesCount, 0);
    const signedIdLines = rows.reduce((acc, r) => acc + r.signedIdLinesCount, 0);
    return {
      totalLines,
      signedIdLines,
      idReadinessPct:
        totalLines > 0 ? Math.round((signedIdLines / totalLines) * 100) : 0,
    };
  }, [rows]);

  const handleExportCsv = () => {
    const headers = [
      CONDITION_TITLE_MAP[condition],
      'Привязка',
      'Всего стыков, шт.',
      'Из них доп. стыков',
      'Сварено, шт.',
      'Готовность сварки, %',
      'Всего экв. дюймов EDI',
      'Заварено экв. дюймов EDI',
      'Процент сварки по EDI, %',
      'Годен ВИК, шт.',
      'Годен НК, шт.',
      'НК не требуется, шт.',
      'Дубль НК закрыт, шт.',
      'В ремонте, шт.',
      'Полностью сдано, шт.',
      'Готовность сварки итоговая, %',
      'Всего линий',
      'Подписано ИД, линий',
      'Готовность ИД, %',
      ...(condition === 'contour'
        ? ['Допуск к испытаниям']
        : condition === 'uniqueLineId'
          ? ['Статус ИД']
          : []),
    ];

    const csvRows = rows.map((r) => [
      r.groupKey,
      r.subLabel,
      r.totalJoints,
      r.supplementaryJoints,
      r.weldedCount,
      `${r.weldingPct}%`,
      r.totalEquivInches,
      r.weldedEquivInches,
      `${r.equivWeldingPct}%`,
      r.vikPassedCount,
      r.ndtPassedCount,
      r.ndtNotRequiredCount,
      r.dupNdtPassedCount,
      r.repairCount,
      r.fullyCompletedCount,
      `${r.readinessPct}%`,
      r.totalLinesCount,
      r.signedIdLinesCount,
      `${r.idReadinessPct}%`,
      ...(condition === 'contour'
        ? [
            r.testAllowanceStatus
              ? TEST_ALLOWANCE_STATUS_LABELS[r.testAllowanceStatus]
              : '',
          ]
        : condition === 'uniqueLineId'
          ? [r.lineIdStatus === 'SIGNED' ? 'Подписана' : 'В работе']
          : []),
    ]);

    const csv =
      '\uFEFF' +
      [headers, ...csvRows]
        .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'))
        .join('\n');
    const fileName = `Отчет_готовности_${condition}.csv`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    triggerBlobDownload(blob, fileName);
    setExportToast(`Сводка готовности выгружена в файл «${fileName}».`);
    setTimeout(() => setExportToast(''), 4000);
  };

  const buildOfflineExcelPayload = () => {
    const summaryHeaders = [
      CONDITION_TITLE_MAP[condition],
      'Привязка',
      'Всего стыков',
      'Доп. стыки',
      'Сварено',
      'Готовность сварки, %',
      'Σ ЭДД, дюйм',
      'Сварено ЭДД, дюйм',
      'Сварка ЭДД, %',
      'Годен ВИК',
      'Годен НК',
      'Без НК по проекту',
      'Дубль НК',
      'В ремонте',
      'Полностью принято',
      'Итоговая готовность, %',
      'Всего линий',
      'Подписано ИД',
      'Готовность ИД, %',
      ...(condition === 'contour'
        ? ['Допуск к испытаниям']
        : condition === 'uniqueLineId'
          ? ['Статус ИД']
          : []),
    ];

    const summaryRows: Array<Array<string | number>> = rows.map((r) => [
      r.groupKey,
      r.subLabel,
      r.totalJoints,
      r.supplementaryJoints,
      r.weldedCount,
      r.weldingPct,
      r.totalEquivInches,
      r.weldedEquivInches,
      r.equivWeldingPct,
      r.vikPassedCount,
      r.ndtPassedCount,
      r.ndtNotRequiredCount,
      r.dupNdtPassedCount,
      r.repairCount,
      r.fullyCompletedCount,
      r.readinessPct,
      r.totalLinesCount,
      r.signedIdLinesCount,
      r.idReadinessPct,
      ...(condition === 'contour'
        ? [
            r.testAllowanceStatus
              ? TEST_ALLOWANCE_STATUS_LABELS[r.testAllowanceStatus]
              : '',
          ]
        : condition === 'uniqueLineId'
          ? [r.lineIdStatus === 'SIGNED' ? 'Подписана' : 'В работе']
          : []),
    ]);

    const welderRows = buildWelderAnalyticsRows(periodJoints, scopedLines, welders);
    const contourRows = calculateReadinessReport(periodJoints, 'contour', {
      lines: scopedLines,
      testCircuits: scopedTestCircuits,
      docByLineId,
      excludeEmptyGroups: hasDateRangeFilter,
    });

    const periodTag =
      weldingDateFrom || weldingDateTo
        ? `_${weldingDateFrom || 'start'}_${weldingDateTo || 'end'}`
        : '';

    return {
      fileName: `Отчет_готовности_${condition}${periodTag}.xls`,
      sheets: [
        {
          name: 'Сводка готовности',
          headers: summaryHeaders,
          rows: summaryRows,
        },
        {
          name: 'Квоты НК сварщиков',
          headers: [
            'Клеймо',
            'Ф.И.О. сварщика',
            'Сварено стыков',
            'Выработка, EDI',
            'Контроль НК',
            'Годных',
            'Брак',
            'Брак, %',
            'Факт НК, %',
            'План НК, %',
            'Штраф НК',
            'Детализация',
          ],
          rows: welderRows.map((w) => [
            w.stamp,
            w.fullName || 'Не указано',
            w.totalWelded,
            w.weldedEdi,
            w.inspectedCount,
            w.passedCount,
            w.defectCount,
            w.defectRatePct,
            w.actualNdtPct,
            w.requiredNdtPct,
            w.penaltyRequiredJoints,
            w.details,
          ]),
        },
        {
          name: 'Допуск контуров и ИД',
          headers: [
            'Контур испытаний',
            'Описание',
            'Всего стыков',
            'Готовность сварки, %',
            'Всего линий',
            'Подписано ИД',
            'Готовность ИД, %',
            'Допуск к испытаниям',
            'Не доварено стыков',
            'Дефицит НК',
            'В ремонте',
            'Линий с неподписанной ИД',
          ],
          rows: contourRows.map((c) => {
            const blk = getContourBlockerSummary(c);
            return [
              c.groupKey,
              c.subLabel,
              c.totalJoints,
              c.readinessPct,
              c.totalLinesCount,
              c.signedIdLinesCount,
              c.idReadinessPct,
              c.testAllowanceStatus
                ? TEST_ALLOWANCE_STATUS_LABELS[c.testAllowanceStatus]
                : '',
              blk.unweldedCount,
              blk.ndtDeficitCount,
              blk.repairCount,
              blk.unsignedIdLinesCount,
            ];
          }),
        },
      ],
    };
  };

  const handleExportXlsx = async () => {
    if (!isDbConnected || !auth.isAuthenticated) {
      exportReadinessOfflineExcel(buildOfflineExcelPayload());
      setExportToast('Локальный многолистовой отчёт Excel успешно сформирован.');
      setTimeout(() => setExportToast(''), 4500);
      return;
    }
    try {
      await exportReadinessReportToExcel(
        condition,
        selectedRdCode !== 'ALL' ? selectedRdCode : undefined,
        activeFacilityId,
        weldingDateFrom || undefined,
        weldingDateTo || undefined
      );
      setExportToast('Серверный отчёт готовности, квот НК и допуска контуров сформирован.');
    } catch {
      exportReadinessOfflineExcel(buildOfflineExcelPayload());
      setExportToast('Сформирована локальная выгрузка Excel по текущим фильтрам экрана.');
    }
    setTimeout(() => setExportToast(''), 4500);
  };

  return {
    activeTab,
    setActiveTab,
    condition,
    setCondition,
    contourQuickFilter,
    setContourQuickFilter,
    searchQuery,
    setSearchQuery,
    datePreset,
    setDatePreset,
    weldingDateFrom,
    setWeldingDateFrom,
    weldingDateTo,
    setWeldingDateTo,
    hasDateRangeFilter,
    handleSelectDatePreset,
    columnFilters,
    setColumnFilters,
    sortConfig,
    setSortConfig,
    visibleColumns,
    setVisibleColumns,
    isColVisible,
    toggleColumnVisibility,
    isColumnsPopoverOpen,
    setIsColumnsPopoverOpen,
    columnsMenuRef,
    exportToast,
    setExportToast,
    docByLineId,
    welders,
    periodJoints,
    scopedLines,
    selectedGroupKey: effectiveSelectedGroupKey,
    setSelectedGroupKey,
    dynamicsJoints: dynamicsScope.joints,
    dynamicsLines: dynamicsScope.lines,
    lineMetaByUniqueId,
    baseRows,
    rows,
    rowGetters,
    summary,
    tableFooterTotals,
    hasActiveFilters,
    handleApplyFilter,
    handleSort,
    handleResetAllFilters,
    handleExportCsv,
    handleExportXlsx,
    isSyncingServerReport,
    resizable,
  };
}
