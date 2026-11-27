import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { JournalStandard, WeldJoint } from '../../types/welding';
import {
  extractRdSuffix,
  formatDateDDMMYY,
  formatGost32569JournalRow,
  formatStoGazpromJournalRow,
  GOST_32569_2013_JOURNAL_COLUMNS,
  Gost32569ColumnKey,
  isJointCurrentlyInRepair,
  isJointFullyAccepted,
  sortJointsChronologically,
  STO_GAZPROM_15_1_1_002_2023_COLUMNS,
  StoGazpromColumnKey,
} from '../../utils/weldingLogic';
import {
  exportWeldingJournalToExcel,
  triggerBlobDownload,
} from '../../utils/excelUtils';
import {
  isJointRepaired,
  JournalJointMissingItem,
  validateJournalCompleteness,
} from '../../utils/journals';
import { useResizableColumns } from '../../utils/useResizableColumns';
import { applyTableColumnFiltersAndSort } from '../TableColumnFilterPopover';
import { useAppContext } from '../../context';
import type {
  JournalExportModalState,
  JournalLineOption,
  JournalQuickFilter,
  JournalQuickFilterCounts,
  JournalRdOption,
  JournalTitleMeta,
  JournalToastState,
  LineWeldingAlert,
  WeldingJournalsViewProps,
} from './types';
import { pluralizeRu } from './types';

const JOURNAL_META_STORAGE_KEY = 'zaychick_journal_title_meta_v1';
const JOURNAL_HIDE_REPAIRS_KEY = 'zaychick_journal_hide_empty_repairs_v1';

const EMPTY_TITLE_META: JournalTitleMeta = {
  journalNumber: '',
  customerName: '',
  contractorName: '',
  responsibleKeeper: '',
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readStoredTitleMetaMap(): Record<string, JournalTitleMeta> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(JOURNAL_META_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredTitleMeta(scopeKey: string, meta: JournalTitleMeta): void {
  if (typeof window === 'undefined') return;
  try {
    const current = readStoredTitleMetaMap();
    current[scopeKey] = meta;
    window.localStorage.setItem(
      JOURNAL_META_STORAGE_KEY,
      JSON.stringify(current)
    );
  } catch {
    // ignore storage quota errors
  }
}

function readHideEmptyRepairsPref(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(JOURNAL_HIDE_REPAIRS_KEY) === 'true';
  } catch {
    return false;
  }
}

export function useWeldingJournals(props: WeldingJournalsViewProps) {
  const app = useAppContext();

  const joints = props.joints ?? app.joints;
  const allJoints = props.allJoints ?? app.joints;
  const lines = props.lines ?? app.projectLineList ?? [];
  const facilities = props.facilities ?? app.derivedFacilities ?? [];
  const materials = props.materials ?? app.weldingMaterials ?? [];
  const lrvCatalog = props.lrvCatalog ?? app.lrvCatalog ?? [];
  const selectedObjectName = props.selectedObjectName ?? app.selectedObjectName;
  const selectedRdCode = props.selectedRdCode ?? app.selectedRdCode ?? 'ALL';
  const onSelectRdCode = props.onSelectRdCode ?? app.setSelectedRdCode;
  const isDbConnected = props.isDbConnected ?? app.isDbConnected;
  const pendingSyncCount = props.pendingSyncCount ?? app.pendingSyncCount;

  const [standard, setStandard] = usePersistentState<JournalStandard>(
    'journals:standard',
    'СТО Газпром 15-1.1-002-2023'
  );
  const [columnFilters, setColumnFilters] = usePersistentState<Record<string, string[]>>(
    'journals:columnFilters',
    {}
  );
  const [searchQuery, setSearchQuery] = usePersistentState('journals:searchQuery', '');
  const [dateFrom, setDateFrom] = usePersistentState('journals:dateFrom', '');
  const [dateTo, setDateTo] = usePersistentState('journals:dateTo', '');
  const [quickFilter, setQuickFilter] = usePersistentState<JournalQuickFilter>(
    'journals:quickFilter',
    'all'
  );
  const [hideEmptyRepairCols, setHideEmptyRepairCols] = useState<boolean>(
    readHideEmptyRepairsPref
  );

  const [toast, setToast] = useState<JournalToastState | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const [exportModal, setExportModal] =
    useState<JournalExportModalState | null>(null);
  const [isMetaModalOpen, setIsMetaModalOpen] = useState(false);

  const metaScopeKey = selectedObjectName || 'ALL';
  const [titleMeta, setTitleMeta] = useState<JournalTitleMeta>(() => {
    const stored = readStoredTitleMetaMap();
    return stored[metaScopeKey] || EMPTY_TITLE_META;
  });

  useEffect(() => {
    const stored = readStoredTitleMetaMap();
    setTitleMeta(stored[metaScopeKey] || EMPTY_TITLE_META);
  }, [metaScopeKey]);

  const handleSaveTitleMeta = useCallback(
    (nextMeta: JournalTitleMeta) => {
      setTitleMeta(nextMeta);
      writeStoredTitleMeta(metaScopeKey, nextMeta);
      showToast('Титульные реквизиты журнала сохранены', 'success');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [metaScopeKey]
  );

  const toggleHideEmptyRepairCols = useCallback(() => {
    setHideEmptyRepairCols((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(JOURNAL_HIDE_REPAIRS_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const showToast = useCallback(
    (message: string, variant: JournalToastState['variant'] = 'success') => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      setToast({ message, variant });
      toastTimerRef.current = window.setTimeout(() => {
        setToast(null);
        toastTimerRef.current = null;
      }, 5000);
    },
    []
  );

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast(null);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // 1. Выбор шифра РД
  const [currentRdCode, setCurrentRdCode] = useState<string>(
    selectedRdCode || 'ALL'
  );

  useEffect(() => {
    if (selectedRdCode !== undefined) {
      setCurrentRdCode(selectedRdCode);
    }
  }, [selectedRdCode]);

  // 2. Выбор линии
  const [selectedLineKey, setSelectedLineKey] = useState<string>('ALL');

  // Сбрасываем выбранную линию при смене объекта строительства
  const prevObjectRef = useRef<string>(selectedObjectName);
  useEffect(() => {
    if (prevObjectRef.current !== selectedObjectName) {
      prevObjectRef.current = selectedObjectName;
      setSelectedLineKey('ALL');
    }
  }, [selectedObjectName]);

  const effectiveAllJoints = useMemo(() => {
    return allJoints && allJoints.length > 0 ? allJoints : joints;
  }, [allJoints, joints]);

  const objectScopedJoints = useMemo(() => {
    if (!selectedObjectName || selectedObjectName === 'ALL') {
      return effectiveAllJoints;
    }
    return effectiveAllJoints.filter(
      (j) => j.objectName === selectedObjectName
    );
  }, [effectiveAllJoints, selectedObjectName]);

  const objectScopedLines = useMemo(() => {
    if (!selectedObjectName || selectedObjectName === 'ALL') return lines;
    return lines.filter((l) => l.objectName === selectedObjectName);
  }, [lines, selectedObjectName]);

  // UUID выбранного объекта строительства для серверного экспорта
  const selectedFacilityId = useMemo(() => {
    if (!selectedObjectName || selectedObjectName === 'ALL') return undefined;
    const fac = facilities.find((f) => f.name === selectedObjectName);
    if (fac?.id && UUID_REGEX.test(fac.id)) {
      return fac.id;
    }
    return undefined;
  }, [facilities, selectedObjectName]);

  const rdOptions = useMemo<JournalRdOption[]>(() => {
    const map = new Map<string, JournalRdOption>();

    for (const l of objectScopedLines) {
      if (!l.rdCode) continue;
      const key = l.rdCode.trim();
      if (!key) continue;
      const ex = map.get(key);
      if (ex) {
        ex.linesCount += 1;
      } else {
        map.set(key, {
          rdCode: key,
          suffix: extractRdSuffix(key),
          linesCount: 1,
          jointsCount: 0,
        });
      }
    }

    for (const j of objectScopedJoints) {
      if (!j.rdCode) continue;
      const key = j.rdCode.trim();
      if (!key) continue;
      const ex = map.get(key);
      if (ex) {
        ex.jointsCount += 1;
      } else {
        map.set(key, {
          rdCode: key,
          suffix: extractRdSuffix(key),
          linesCount: 0,
          jointsCount: 1,
        });
      }
    }

    const allOption: JournalRdOption = {
      rdCode: 'ALL',
      suffix: '',
      linesCount: objectScopedLines.length,
      jointsCount: objectScopedJoints.length,
    };

    const sorted = Array.from(map.values()).sort((a, b) =>
      a.rdCode.localeCompare(b.rdCode, 'ru', { numeric: true })
    );

    return [allOption, ...sorted];
  }, [objectScopedLines, objectScopedJoints]);

  const availableLines = useMemo<JournalLineOption[]>(() => {
    const map = new Map<string, JournalLineOption>();

    for (const pl of objectScopedLines) {
      if (currentRdCode !== 'ALL' && pl.rdCode !== currentRdCode) continue;
      const key = pl.uniqueLineId || pl.lineNumber;
      if (!key) continue;
      map.set(key, {
        id: pl.id || key,
        lineNumber: pl.lineNumber,
        uniqueLineId: pl.uniqueLineId || pl.lineNumber,
        lineName: pl.lineName || '',
        product: pl.product || '',
        objectName: pl.objectName,
        rdCode: pl.rdCode,
        pipelineCategory: pl.pipelineCategory || '',
        qualityLevel: pl.qualityLevel || '',
        weatherStationId: pl.weatherStationId,
        jointsCount: 0,
      });
    }

    const relevantJoints =
      currentRdCode !== 'ALL'
        ? objectScopedJoints.filter((j) => j.rdCode === currentRdCode)
        : objectScopedJoints;

    for (const j of relevantJoints) {
      if (!j.lineNumber) continue;
      const key = j.uniqueLineId || j.lineNumber;
      const existing =
        map.get(key) ||
        (j.lineNumber ? map.get(j.lineNumber) : undefined) ||
        (j.uniqueLineId ? map.get(j.uniqueLineId) : undefined);
      if (existing) {
        existing.jointsCount += 1;
      } else {
        map.set(key, {
          id: key,
          lineNumber: j.lineNumber,
          uniqueLineId: j.uniqueLineId || j.lineNumber,
          lineName: '',
          product: '',
          objectName: j.objectName,
          rdCode: j.rdCode,
          pipelineCategory: '',
          qualityLevel: '',
          jointsCount: 1,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.lineNumber.localeCompare(b.lineNumber, 'ru', { numeric: true })
    );
  }, [objectScopedLines, objectScopedJoints, currentRdCode]);

  const selectedLineItem = useMemo(() => {
    if (selectedLineKey === 'ALL') return null;
    return (
      availableLines.find(
        (l) =>
          l.id === selectedLineKey ||
          l.uniqueLineId === selectedLineKey ||
          l.lineNumber === selectedLineKey
      ) || null
    );
  }, [selectedLineKey, availableLines]);

  const activeLineDisplayLabel = useMemo(() => {
    if (selectedLineKey === 'ALL') return 'Все линии';
    if (!selectedLineItem) return selectedLineKey;
    if (
      selectedLineItem.lineNumber &&
      selectedLineItem.uniqueLineId &&
      selectedLineItem.uniqueLineId !== selectedLineItem.lineNumber
    ) {
      return `${selectedLineItem.lineNumber} · ${selectedLineItem.uniqueLineId}`;
    }
    return (
      selectedLineItem.lineNumber ||
      selectedLineItem.uniqueLineId ||
      selectedLineKey
    );
  }, [selectedLineItem, selectedLineKey]);

  const lineWeldingAlert = useMemo<LineWeldingAlert | null>(() => {
    if (selectedLineKey === 'ALL') return null;

    const lineJoints = objectScopedJoints.filter((j) => {
      if (
        selectedLineItem?.uniqueLineId &&
        j.uniqueLineId &&
        j.uniqueLineId === selectedLineItem.uniqueLineId
      ) {
        return true;
      }
      if (
        selectedLineItem?.lineNumber &&
        j.lineNumber &&
        j.lineNumber === selectedLineItem.lineNumber
      ) {
        return true;
      }
      return (
        j.lineNumber === selectedLineKey || j.uniqueLineId === selectedLineKey
      );
    });

    const total = lineJoints.length;
    const weldedJoints = lineJoints.filter((j) =>
      Boolean(j.weldingDate && j.weldingDate.trim() !== '')
    );
    const welded = weldedJoints.length;
    const unweldedJoints = lineJoints.filter(
      (j) => !j.weldingDate || !j.weldingDate.trim()
    );
    const unweldedCount = unweldedJoints.length;
    const isFullyWelded = total > 0 && welded === total;

    return {
      total,
      welded,
      unweldedCount,
      isFullyWelded,
      unweldedJointNumbers: unweldedJoints
        .map((j) => j.jointNumber)
        .filter(Boolean),
    };
  }, [objectScopedJoints, selectedLineKey, selectedLineItem]);

  const handleSelectRd = (rd: string) => {
    setCurrentRdCode(rd);
    onSelectRdCode?.(rd);

    if (selectedLineKey !== 'ALL' && rd !== 'ALL') {
      const lineExistsInNewRd =
        objectScopedLines.some(
          (l) =>
            l.rdCode === rd &&
            (l.id === selectedLineKey ||
              l.uniqueLineId === selectedLineKey ||
              l.lineNumber === selectedLineKey)
        ) ||
        objectScopedJoints.some(
          (j) =>
            j.rdCode === rd &&
            (j.uniqueLineId === selectedLineKey ||
              j.lineNumber === selectedLineKey)
        );
      if (!lineExistsInNewRd) {
        setSelectedLineKey('ALL');
      }
    }
  };

  const handleSelectLine = (lineKey: string) => {
    setSelectedLineKey(lineKey);
  };

  useEffect(() => {
    if (currentRdCode !== 'ALL') {
      const rdStillValid =
        lines.some(
          (l) =>
            (selectedObjectName === 'ALL' ||
              l.objectName === selectedObjectName) &&
            l.rdCode === currentRdCode
        ) ||
        joints.some(
          (j) =>
            (selectedObjectName === 'ALL' ||
              j.objectName === selectedObjectName) &&
            j.rdCode === currentRdCode
        );
      if (!rdStillValid) {
        setCurrentRdCode('ALL');
        onSelectRdCode?.('ALL');
        setSelectedLineKey('ALL');
      }
    }
  }, [selectedObjectName, lines, joints, currentRdCode, onSelectRdCode]);

  const lineScopedJoints = useMemo(() => {
    let list = objectScopedJoints;

    if (currentRdCode !== 'ALL') {
      list = list.filter((j) => j.rdCode === currentRdCode);
    }

    if (selectedLineKey !== 'ALL') {
      if (selectedLineItem) {
        list = list.filter((j) => {
          if (
            selectedLineItem.uniqueLineId &&
            j.uniqueLineId &&
            j.uniqueLineId === selectedLineItem.uniqueLineId
          ) {
            return true;
          }
          return j.lineNumber === selectedLineItem.lineNumber;
        });
      } else {
        list = list.filter(
          (j) =>
            j.uniqueLineId === selectedLineKey ||
            j.lineNumber === selectedLineKey
        );
      }
    }

    return list;
  }, [objectScopedJoints, currentRdCode, selectedLineKey, selectedLineItem]);

  const {
    getColumnWidth: getGostColWidth,
    handleResizeStart: handleGostResizeStart,
    handleAutoFit: handleGostAutoFit,
    handleResetWidths: handleResetGostWidths,
    hasCustomWidths: hasCustomGostWidths,
  } = useResizableColumns({
    storageKey: 'zaychick_col_widths_journal_gost',
    defaultWidths: Object.fromEntries(
      GOST_32569_2013_JOURNAL_COLUMNS.map((c) => [c.key, c.minWidth])
    ),
  });

  const {
    getColumnWidth: getStoColWidth,
    handleResizeStart: handleStoResizeStart,
    handleAutoFit: handleStoAutoFit,
    handleResetWidths: handleResetStoWidths,
    hasCustomWidths: hasCustomStoWidths,
  } = useResizableColumns({
    storageKey: 'zaychick_col_widths_journal_sto',
    defaultWidths: Object.fromEntries(
      STO_GAZPROM_15_1_1_002_2023_COLUMNS.map((c) => [c.key, c.minWidth])
    ),
  });

  const handleSwitchStandard = (nextStd: JournalStandard) => {
    setStandard(nextStd);
    setColumnFilters({});
  };

  // Заваренные стыки с учётом периода сварки в строгой хронологии
  const baseChronologicalJoints = useMemo(() => {
    const welded = lineScopedJoints.filter((j) => {
      const wd = j.weldingDate?.trim();
      if (!wd) return false;
      const iso = wd.slice(0, 10);
      if (dateFrom && iso < dateFrom) return false;
      if (dateTo && iso > dateTo) return false;
      return true;
    });
    return sortJointsChronologically(welded);
  }, [lineScopedJoints, dateFrom, dateTo]);

  // Единый источник истины по полноте реквизитов для таблицы, фильтров и баннера
  const baseCompleteness = useMemo(() => {
    return validateJournalCompleteness(baseChronologicalJoints, standard);
  }, [baseChronologicalJoints, standard]);

  const missingByJointId = useMemo(() => {
    const map = new Map<string, JournalJointMissingItem>();
    for (const item of baseCompleteness.missingItems) {
      map.set(item.jointId, item);
    }
    return map;
  }, [baseCompleteness]);

  const quickFilterCounts = useMemo<JournalQuickFilterCounts>(() => {
    let inRepair = 0;
    let accepted = 0;
    for (const j of baseChronologicalJoints) {
      if (isJointCurrentlyInRepair(j)) inRepair++;
      if (isJointFullyAccepted(j)) accepted++;
    }
    return {
      all: baseChronologicalJoints.length,
      incomplete: missingByJointId.size,
      inRepair,
      accepted,
    };
  }, [baseChronologicalJoints, missingByJointId]);

  const stoGazpromGetters = useMemo<
    Record<StoGazpromColumnKey, (j: WeldJoint, idx: number) => string>
  >(() => {
    const map = {} as Record<
      StoGazpromColumnKey,
      (j: WeldJoint, idx: number) => string
    >;
    for (const col of STO_GAZPROM_15_1_1_002_2023_COLUMNS) {
      map[col.key] = (j: WeldJoint, idx: number) =>
        formatStoGazpromJournalRow(j, idx, lrvCatalog)[col.key];
    }
    return map;
  }, [lrvCatalog]);

  const gost32569Getters = useMemo<
    Record<Gost32569ColumnKey, (j: WeldJoint, idx: number) => string>
  >(() => {
    const map = {} as Record<
      Gost32569ColumnKey,
      (j: WeldJoint, idx: number) => string
    >;
    for (const col of GOST_32569_2013_JOURNAL_COLUMNS) {
      map[col.key] = (j: WeldJoint, idx: number) =>
        formatGost32569JournalRow(j, idx, materials, lrvCatalog)[col.key];
    }
    return map;
  }, [materials, lrvCatalog]);

  const activeGetters =
    standard === 'ГОСТ 32569-2013' ? gost32569Getters : stoGazpromGetters;

  // Применяем быстрый фильтр, текстовый поиск и фильтры столбцов, сохраняя хронологию
  const chronologicalJoints = useMemo(() => {
    let list = baseChronologicalJoints;

    if (quickFilter === 'incomplete') {
      list = list.filter((j) => missingByJointId.has(j.id));
    } else if (quickFilter === 'in_repair') {
      list = list.filter((j) => isJointCurrentlyInRepair(j));
    } else if (quickFilter === 'accepted') {
      list = list.filter((j) => isJointFullyAccepted(j));
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((j) => {
        const hay = [
          j.jointNumber,
          j.lineNumber,
          j.uniqueLineId,
          j.welderStamp,
          j.welderFullName,
          j.techCardNumber,
          j.responsiblePerson,
          j.vikReportNumber,
          j.ndtReportNumber,
          j.dupNdtReportNumber,
          j.repairVikNumber,
          j.repairNdtNumber,
          j.elem1Name,
          j.elem2Name,
          j.elem1FactoryNumber,
          j.elem2FactoryNumber,
          j.weldingMaterials,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }

    return applyTableColumnFiltersAndSort(
      list,
      columnFilters,
      activeGetters,
      null
    );
  }, [
    baseChronologicalJoints,
    quickFilter,
    missingByJointId,
    searchQuery,
    columnFilters,
    activeGetters,
  ]);

  const journalCompleteness = useMemo(() => {
    return validateJournalCompleteness(chronologicalJoints, standard);
  }, [chronologicalJoints, standard]);

  const jointsById = useMemo(() => {
    const map = new Map<string, WeldJoint>();
    for (const j of baseChronologicalJoints) {
      map.set(j.id, j);
    }
    return map;
  }, [baseChronologicalJoints]);

  const repairedJointsCount = useMemo(() => {
    return chronologicalJoints.filter((j) => isJointRepaired(j)).length;
  }, [chronologicalJoints]);

  const effectiveHideRepairCols =
    standard === 'СТО Газпром 15-1.1-002-2023' &&
    hideEmptyRepairCols &&
    repairedJointsCount === 0;

  const hasClientOnlyFilters = useMemo(() => {
    return Boolean(
      searchQuery.trim() ||
        quickFilter !== 'all' ||
        Object.keys(columnFilters).length > 0
    );
  }, [searchQuery, quickFilter, columnFilters]);

  const hasActiveFilters = useMemo(() => {
    return Boolean(hasClientOnlyFilters || dateFrom || dateTo);
  }, [hasClientOnlyFilters, dateFrom, dateTo]);

  const handleResetAllFilters = useCallback(() => {
    setColumnFilters({});
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
    setQuickFilter('all');
  }, []);

  const handleApplyFilter = (colKey: string, vals: string[] | undefined) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (vals === undefined) delete next[colKey];
      else next[colKey] = vals;
      return next;
    });
  };

  const isOfflineOrUnsynced = !isDbConnected || pendingSyncCount > 0;

  const executeExportCsv = useCallback(() => {
    const headers =
      standard === 'ГОСТ 32569-2013'
        ? GOST_32569_2013_JOURNAL_COLUMNS.map((c) => c.label)
        : STO_GAZPROM_15_1_1_002_2023_COLUMNS.map((c) => c.fullLabel);

    const rows = chronologicalJoints.map((j, idx) => {
      if (standard === 'ГОСТ 32569-2013') {
        return formatGost32569JournalRow(j, idx, materials, lrvCatalog).cells;
      }
      return formatStoGazpromJournalRow(j, idx, lrvCatalog).cells;
    });

    const csvContent =
      '\uFEFF' +
      [headers, ...rows]
        .map((r) =>
          r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';')
        )
        .join('\n');

    const draftPrefix = isOfflineOrUnsynced
      ? 'ЧЕРНОВИК_НЕ_СИНХРОНИЗИРОВАНО_'
      : !journalCompleteness.isFullyComplete
        ? 'ЧЕРНОВИК_НЕПОЛНЫЕ_РЕКВИЗИТЫ_'
        : '';

    const rdSuffix =
      currentRdCode !== 'ALL'
        ? `_РД_${(extractRdSuffix(currentRdCode) || currentRdCode)
            .replace(/[\\/:*?"<>|]/g, '_')
            .slice(0, 15)}`
        : '';
    const lineSuffix =
      selectedLineKey !== 'ALL' && selectedLineItem
        ? `_Линия_${selectedLineItem.lineNumber.replace(/[\\/:*?"<>|]/g, '_')}`
        : '';
    const objSuffix =
      selectedObjectName !== 'ALL'
        ? `_${selectedObjectName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 25)}`
        : '';
    const fileName = `${draftPrefix}Журнал_сварки_${standard.replace(/\s+/g, '_')}${objSuffix}${rdSuffix}${lineSuffix}.csv`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    triggerBlobDownload(blob, fileName);
    showToast(
      `Журнал выгружен в CSV: ${chronologicalJoints.length} ${pluralizeRu(
        chronologicalJoints.length,
        'запись',
        'записи',
        'записей'
      )}`,
      'success'
    );
  }, [
    standard,
    chronologicalJoints,
    materials,
    lrvCatalog,
    isOfflineOrUnsynced,
    journalCompleteness.isFullyComplete,
    currentRdCode,
    selectedLineKey,
    selectedLineItem,
    selectedObjectName,
    showToast,
  ]);

  const executeExportXlsx = useCallback(async () => {
    const isDraftIncomplete = !journalCompleteness.isFullyComplete;
    const resolvedUniqueLineId =
      selectedLineKey !== 'ALL'
        ? selectedLineItem?.uniqueLineId || selectedLineKey
        : undefined;

    try {
      const result = await exportWeldingJournalToExcel(
        chronologicalJoints,
        standard,
        materials,
        lrvCatalog,
        {
          isDraftUnsynced: isOfflineOrUnsynced,
          unsyncedCount: pendingSyncCount,
          isDraftIncomplete,
          missingCount: journalCompleteness.jointsWithMissingDataCount,
          facilityId: selectedFacilityId,
          objectName: selectedObjectName,
          rdCode: currentRdCode !== 'ALL' ? currentRdCode : undefined,
          uniqueLineId: resolvedUniqueLineId,
          lineLabel: activeLineDisplayLabel,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          strict: !isDraftIncomplete,
          preferClientExport: isOfflineOrUnsynced || hasClientOnlyFilters,
          journalNumber: titleMeta.journalNumber,
          customerName: titleMeta.customerName,
          contractorName: titleMeta.contractorName,
          responsibleKeeper: titleMeta.responsibleKeeper,
        }
      );

      if (result.mode === 'server') {
        showToast(
          `Книга Excel сформирована и скачана: ${chronologicalJoints.length} ${pluralizeRu(
            chronologicalJoints.length,
            'запись',
            'записи',
            'записей'
          )}`,
          isDraftIncomplete ? 'warning' : 'success'
        );
      } else {
        showToast(
          `Книга Excel сформирована локально по текущей выборке: ${chronologicalJoints.length} ${pluralizeRu(
            chronologicalJoints.length,
            'запись',
            'записи',
            'записей'
          )}`,
          isOfflineOrUnsynced || isDraftIncomplete ? 'warning' : 'success'
        );
      }
    } catch {
      showToast(
        'Не удалось сформировать файл Excel. Попробуйте повторить выгрузку.',
        'error'
      );
    }
  }, [
    journalCompleteness,
    selectedLineKey,
    selectedLineItem,
    chronologicalJoints,
    standard,
    materials,
    lrvCatalog,
    isOfflineOrUnsynced,
    pendingSyncCount,
    selectedFacilityId,
    selectedObjectName,
    currentRdCode,
    activeLineDisplayLabel,
    dateFrom,
    dateTo,
    hasClientOnlyFilters,
    titleMeta,
    showToast,
  ]);

  const handleRequestExport = useCallback(
    (format: 'xlsx' | 'csv') => {
      if (isOfflineOrUnsynced || !journalCompleteness.isFullyComplete) {
        setExportModal({ format });
        return;
      }
      if (format === 'xlsx') {
        void executeExportXlsx();
      } else {
        executeExportCsv();
      }
    },
    [
      isOfflineOrUnsynced,
      journalCompleteness.isFullyComplete,
      executeExportXlsx,
      executeExportCsv,
    ]
  );

  const handleConfirmModalExport = useCallback(() => {
    if (!exportModal) return;
    const fmt = exportModal.format;
    setExportModal(null);
    if (fmt === 'xlsx') {
      void executeExportXlsx();
    } else {
      executeExportCsv();
    }
  }, [exportModal, executeExportXlsx, executeExportCsv]);

  const handleExportXlsx = useCallback(
    () => handleRequestExport('xlsx'),
    [handleRequestExport]
  );

  const handleExportCsv = useCallback(
    () => handleRequestExport('csv'),
    [handleRequestExport]
  );

  const handlePrint = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  }, []);

  const currentFormationDate = formatDateDDMMYY(
    new Date().toISOString().slice(0, 10)
  );

  const relevantJointsCount = useMemo(() => {
    return (
      currentRdCode === 'ALL'
        ? objectScopedJoints
        : objectScopedJoints.filter((j) => j.rdCode === currentRdCode)
    ).length;
  }, [objectScopedJoints, currentRdCode]);

  const periodDisplayLabel = useMemo(() => {
    if (!dateFrom && !dateTo) return null;
    const fromLabel = dateFrom ? formatDateDDMMYY(dateFrom) : '...';
    const toLabel = dateTo ? formatDateDDMMYY(dateTo) : '...';
    return `${fromLabel} — ${toLabel}`;
  }, [dateFrom, dateTo]);

  return {
    standard,
    setStandard,
    columnFilters,
    setColumnFilters,
    searchQuery,
    setSearchQuery,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    quickFilter,
    setQuickFilter,
    quickFilterCounts,
    hideEmptyRepairCols,
    toggleHideEmptyRepairCols,
    effectiveHideRepairCols,
    repairedJointsCount,
    toast,
    dismissToast,
    exportModal,
    setExportModal,
    handleConfirmModalExport,
    isMetaModalOpen,
    setIsMetaModalOpen,
    titleMeta,
    handleSaveTitleMeta,
    currentRdCode,
    selectedLineKey,
    rdOptions,
    availableLines,
    activeLineDisplayLabel,
    lineWeldingAlert,
    handleSelectRd,
    handleSelectLine,
    handleSwitchStandard,
    handleApplyFilter,
    handleExportCsv,
    handleExportXlsx,
    handlePrint,
    hasActiveFilters,
    handleResetAllFilters,
    baseChronologicalJoints,
    chronologicalJoints,
    journalCompleteness,
    missingByJointId,
    jointsById,
    isOfflineOrUnsynced,
    isDbConnected,
    pendingSyncCount,
    currentFormationDate,
    relevantJointsCount,
    periodDisplayLabel,
    gost32569Getters,
    stoGazpromGetters,
    getGostColWidth,
    handleGostResizeStart,
    handleGostAutoFit,
    handleResetGostWidths,
    hasCustomGostWidths,
    getStoColWidth,
    handleStoResizeStart,
    handleStoAutoFit,
    handleResetStoWidths,
    hasCustomStoWidths,
    selectedObjectName,
    materials,
    lrvCatalog,
  };
}
