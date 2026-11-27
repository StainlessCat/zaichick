import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileCheck2, RotateCcw } from 'lucide-react';
import { useAppContext, useAuth } from '../../context';
import type {
  ExecutiveDocColumnKey,
  ExecutiveDocPatch,
  ExecutiveDocQuickFilter,
  ExecutiveDocRow,
  ExecutiveDocStatus,
} from '../../types/executiveDocs';
import {
  DEFAULT_EXECUTIVE_DOC_COLUMN_WIDTHS,
  EXECUTIVE_DOC_COLUMNS,
} from '../../types/executiveDocs';
import {
  buildExecutiveDocRows,
  compareExecutiveDocRows,
  computeExecutiveDocsSummary,
  extractPersonSurname,
  getExecutiveDocColumnDisplayValue,
  matchesExecutiveDocQuickAndSearch,
} from '../../utils/executiveDocsLogic';
import { exportExecutiveDocsToXlsx } from '../../utils/excelUtils';
import { useResizableColumns } from '../../utils/useResizableColumns';
import { ExecutiveDocsBulkBar } from './ExecutiveDocsBulkBar';
import {
  ExecutiveDocsDeficitModal,
  type ExecutiveDocDeficitModalKind,
} from './ExecutiveDocsDeficitModal';
import {
  ExecutiveDocsFilterBar,
  NO_CONTOUR_FILTER_VALUE,
} from './ExecutiveDocsFilterBar';
import { ExecutiveDocsSignConfirmModal } from './ExecutiveDocsSignConfirmModal';
import { ExecutiveDocsTable } from './ExecutiveDocsTable';
import { useExecutiveDocsState } from './useExecutiveDocsState';

export interface ExecutiveDocsFilterPreset {
  rdCode?: string;
  lineNumber?: string;
  contour?: string;
  token: number;
}

export interface ExecutiveDocsViewProps {
  onOpenLineInRegistry?: (uniqueLineId: string) => void;
  onOpenLineList?: () => void;
  onOpenLaboratory?: () => void;
  onOpenTestingCircuits?: () => void;
  onOpenLrvCatalog?: () => void;
  initialFilterPreset?: ExecutiveDocsFilterPreset | null;
  onConsumeFilterPreset?: () => void;
}

export const ExecutiveDocsView: React.FC<ExecutiveDocsViewProps> = ({
  onOpenLineInRegistry,
  onOpenLineList,
  onOpenLaboratory,
  onOpenTestingCircuits,
  onOpenLrvCatalog,
  initialFilterPreset,
  onConsumeFilterPreset,
}) => {
  const app = useAppContext();
  const auth = useAuth();

  const {
    projectLineList,
    joints,
    testCircuits,
    lrvCatalog,
    selectedObjectName,
    isDbConnected,
  } = app;

  const { currentUser, userAccounts, userPermissions, isAuthenticated } = auth;

  const canEdit = useMemo(() => {
    if (!isAuthenticated) return false;
    if (userPermissions.isSuperAdmin) return true;
    if (userPermissions.systemRole === 'VIEWER') return false;
    return (
      userPermissions.canEditLineList ||
      userPermissions.department === 'PTO' ||
      userPermissions.department === 'SK'
    );
  }, [isAuthenticated, userPermissions]);

  const scopedLineIds = useMemo(() => {
    const scoped =
      selectedObjectName && selectedObjectName !== 'ALL'
        ? projectLineList.filter((l) => l.objectName === selectedObjectName)
        : projectLineList;
    return scoped.map((l) => l.id);
  }, [projectLineList, selectedObjectName]);

  const handleSyncLineFields = useCallback(
    (
      lineId: string,
      patch: { idStatus?: 'IN_WORK' | 'SIGNED'; responsiblePto?: string }
    ) => {
      app.setProjectLineList((prev) =>
        prev.map((line) => {
          if (line.id !== lineId) return line;
          const nextIdStatus = patch.idStatus ?? line.idStatus;
          const nextPto =
            patch.responsiblePto !== undefined
              ? patch.responsiblePto || undefined
              : line.responsiblePto;
          if (line.idStatus === nextIdStatus && line.responsiblePto === nextPto) {
            return line;
          }
          return {
            ...line,
            idStatus: nextIdStatus,
            responsiblePto: nextPto,
          };
        })
      );
    },
    [app]
  );

  const {
    docByLineId,
    visibleColumns,
    toggleColumnVisibility,
    showAllColumns,
    isLoading,
    isBulkSaving,
    savingLineIds,
    errorMessage,
    setErrorMessage,
    conflictLineId,
    reloadFromServer,
    saveRowPatch,
    saveBulkPatch,
  } = useExecutiveDocsState({
    selectedObjectName,
    scopedLineIds,
    isDbConnected,
    isAuthenticated,
    onSyncLineFields: handleSyncLineFields,
  });

  // Фильтры и поиск
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [quickFilter, setQuickFilter] = useState<ExecutiveDocQuickFilter>('all');
  const [rdFilter, setRdFilter] = useState<string>('ALL');
  const [lineFilter, setLineFilter] = useState<string>('ALL');
  const [contourFilter, setContourFilter] = useState<string>('ALL');

  const [columnFilters, setColumnFilters] = useState<
    Partial<Record<ExecutiveDocColumnKey, string[]>>
  >({});
  const [sortConfig, setSortConfig] = useState<{
    key: ExecutiveDocColumnKey;
    direction: 'asc' | 'desc';
  } | null>(null);

  // Выбор строк для массового редактирования
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(() => new Set());

  // Модальные окна детализации дефицитов и подтверждения подписания
  const [deficitModal, setDeficitModal] = useState<{
    lineId: string;
    kind: ExecutiveDocDeficitModalKind;
  } | null>(null);
  const [pendingSignLineId, setPendingSignLineId] = useState<string | null>(null);

  useEffect(() => {
    setSearchQuery('');
    setQuickFilter('all');
    setRdFilter('ALL');
    setLineFilter('ALL');
    setContourFilter('ALL');
    setColumnFilters({});
    setSelectedLineIds(new Set());
  }, [selectedObjectName]);

  useEffect(() => {
    if (!initialFilterPreset) return;
    setSearchQuery('');
    setQuickFilter('all');
    setRdFilter(initialFilterPreset.rdCode || 'ALL');
    setLineFilter(initialFilterPreset.lineNumber || 'ALL');
    setContourFilter(initialFilterPreset.contour || 'ALL');
    setColumnFilters({});
    setSelectedLineIds(new Set());
    onConsumeFilterPreset?.();
  }, [initialFilterPreset, onConsumeFilterPreset]);

  const {
    getColumnWidth,
    handleResizeStart,
    handleAutoFit,
    handleResetWidths,
    hasCustomWidths,
  } = useResizableColumns({
    storageKey: 'zaychick_executive_docs_col_widths_v2',
    defaultWidths: DEFAULT_EXECUTIVE_DOC_COLUMN_WIDTHS,
    minColumnWidth: 76,
  });

  const allRows = useMemo(
    () =>
      buildExecutiveDocRows({
        lines: projectLineList,
        joints,
        testCircuits,
        lrvCatalog,
        docByLineId,
        selectedObjectName,
      }),
    [docByLineId, joints, lrvCatalog, projectLineList, selectedObjectName, testCircuits]
  );

  const rdOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRows) {
      if (r.rdCode) set.add(r.rdCode);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
  }, [allRows]);

  const lineOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRows) {
      if (rdFilter !== 'ALL' && r.rdCode !== rdFilter) continue;
      if (r.lineNumber) set.add(r.lineNumber);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
  }, [allRows, rdFilter]);

  const contourOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRows) {
      for (const c of r.testContoursList) {
        if (c) set.add(c);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
  }, [allRows]);

  const handleRdFilterChange = useCallback(
    (nextRd: string) => {
      setRdFilter(nextRd);
      if (lineFilter !== 'ALL') {
        const stillValid = allRows.some(
          (r) => (nextRd === 'ALL' || r.rdCode === nextRd) && r.lineNumber === lineFilter
        );
        if (!stillValid) {
          setLineFilter('ALL');
        }
      }
    },
    [allRows, lineFilter]
  );

  // Строки после основных выпадающих фильтров и поиска (база для счётчиков KPI)
  const dropdownAndSearchRows = useMemo(() => {
    return allRows.filter((row) => {
      if (rdFilter !== 'ALL' && row.rdCode !== rdFilter) return false;
      if (lineFilter !== 'ALL' && row.lineNumber !== lineFilter) return false;
      if (contourFilter === NO_CONTOUR_FILTER_VALUE) {
        if (row.testContoursList.length > 0) return false;
      } else if (contourFilter !== 'ALL') {
        if (!row.testContoursList.includes(contourFilter)) return false;
      }
      return matchesExecutiveDocQuickAndSearch(row, 'all', searchQuery);
    });
  }, [allRows, contourFilter, lineFilter, rdFilter, searchQuery]);

  // Строки после быстрого KPI-фильтра (база для каскадных табличных фильтров)
  const topFilteredRows = useMemo(() => {
    if (quickFilter === 'all') return dropdownAndSearchRows;
    return dropdownAndSearchRows.filter((row) =>
      matchesExecutiveDocQuickAndSearch(row, quickFilter, '')
    );
  }, [dropdownAndSearchRows, quickFilter]);

  const finalRows = useMemo(() => {
    const activeEntries = Object.entries(columnFilters).filter(
      ([, vals]) => vals !== undefined
    ) as Array<[ExecutiveDocColumnKey, string[]]>;

    const filtered =
      activeEntries.length === 0
        ? topFilteredRows
        : topFilteredRows.filter((row) =>
            activeEntries.every(([colKey, allowed]) => {
              const val = getExecutiveDocColumnDisplayValue(row, colKey).trim();
              return allowed.includes(val);
            })
          );

    if (!sortConfig) return filtered;
    return [...filtered].sort((a, b) =>
      compareExecutiveDocRows(a, b, sortConfig.key, sortConfig.direction)
    );
  }, [columnFilters, sortConfig, topFilteredRows]);

  const baseSummary = useMemo(
    () => computeExecutiveDocsSummary(dropdownAndSearchRows),
    [dropdownAndSearchRows]
  );

  const filteredSummary = useMemo(
    () => computeExecutiveDocsSummary(finalRows),
    [finalRows]
  );

  const workProducerSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const row of allRows) {
      if (row.workProducer) set.add(row.workProducer);
    }
    for (const j of joints) {
      if (
        selectedObjectName &&
        selectedObjectName !== 'ALL' &&
        j.objectName !== selectedObjectName
      ) {
        continue;
      }
      const s = extractPersonSurname(j.responsiblePerson);
      if (s) set.add(s);
      const rf = extractPersonSurname(j.repairForeman);
      if (rf) set.add(rf);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [allRows, joints, selectedObjectName]);

  const ptoEngineerSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const row of allRows) {
      if (row.ptoEngineer) set.add(row.ptoEngineer);
    }
    for (const acc of userAccounts) {
      if (acc.isActive === false) continue;
      if (acc.departmentCode === 'PTO' || acc.department?.toUpperCase().includes('ПТО')) {
        const s = extractPersonSurname(acc.fullName);
        if (s) set.add(s);
      }
    }
    const curSurname = extractPersonSurname(currentUser.fullName);
    if (curSurname && userPermissions.department === 'PTO') {
      set.add(curSurname);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [allRows, currentUser.fullName, userAccounts, userPermissions.department]);

  const activeColumnDefs = useMemo(() => {
    const visibleSet = new Set(visibleColumns);
    return EXECUTIVE_DOC_COLUMNS.filter((c) => visibleSet.has(c.key));
  }, [visibleColumns]);

  const hasAnyActiveFilter =
    searchQuery.trim() !== '' ||
    quickFilter !== 'all' ||
    rdFilter !== 'ALL' ||
    lineFilter !== 'ALL' ||
    contourFilter !== 'ALL' ||
    Object.values(columnFilters).some((v) => v !== undefined) ||
    sortConfig !== null;

  const handleResetAllFilters = useCallback(() => {
    setSearchQuery('');
    setQuickFilter('all');
    setRdFilter('ALL');
    setLineFilter('ALL');
    setContourFilter('ALL');
    setColumnFilters({});
    setSortConfig(null);
  }, []);

  const handleApplyColumnFilter = useCallback(
    (colKey: string, selectedValues: string[] | undefined) => {
      const typedKey = colKey as ExecutiveDocColumnKey;
      setColumnFilters((prev) => {
        const next = { ...prev };
        if (selectedValues === undefined) {
          delete next[typedKey];
        } else {
          next[typedKey] = selectedValues;
        }
        return next;
      });
    },
    []
  );

  const handleSort = useCallback((colKey: string, direction: 'asc' | 'desc') => {
    setSortConfig({ key: colKey as ExecutiveDocColumnKey, direction });
  }, []);

  const handleColumnAutoFit = useCallback(
    (colKey: string) => {
      const def = EXECUTIVE_DOC_COLUMNS.find((c) => c.key === colKey);
      if (!def) return;
      let maxLen = def.label.length;
      for (const row of finalRows.slice(0, 200)) {
        const val = getExecutiveDocColumnDisplayValue(row, def.key);
        if (val.length > maxLen) maxLen = val.length;
      }
      const estimated = Math.min(360, Math.max(def.minWidth, maxLen * 8 + 44));
      handleAutoFit(colKey, estimated);
    },
    [finalRows, handleAutoFit]
  );

  // Выбор строк
  const handleToggleSelectRow = useCallback((lineId: string) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    setSelectedLineIds((prev) => {
      const allInViewSelected =
        finalRows.length > 0 && finalRows.every((r) => prev.has(r.lineId));
      if (allInViewSelected) {
        const next = new Set(prev);
        for (const r of finalRows) next.delete(r.lineId);
        return next;
      }
      const next = new Set(prev);
      for (const r of finalRows) next.add(r.lineId);
      return next;
    });
  }, [finalRows]);

  const selectedRows = useMemo(
    () => finalRows.filter((r) => selectedLineIds.has(r.lineId)),
    [finalRows, selectedLineIds]
  );

  const handleBulkApply = useCallback(
    async (patch: ExecutiveDocPatch) => {
      if (selectedRows.length === 0) return;
      const result = await saveBulkPatch(selectedRows, patch);
      if (result.failedCount === 0) {
        setSelectedLineIds(new Set());
      }
    },
    [saveBulkPatch, selectedRows]
  );

  // Защищённое переключение статуса ИД
  const handleRequestStatusChange = useCallback(
    (row: ExecutiveDocRow, nextStatus: ExecutiveDocStatus) => {
      if (nextStatus === 'SIGNED' && row.readinessBlockers.length > 0) {
        setPendingSignLineId(row.lineId);
        return;
      }
      void saveRowPatch(row, { idStatus: nextStatus });
    },
    [saveRowPatch]
  );

  const pendingSignRow = useMemo(
    () => (pendingSignLineId ? allRows.find((r) => r.lineId === pendingSignLineId) ?? null : null),
    [allRows, pendingSignLineId]
  );

  const activeDeficitRow = useMemo(
    () => (deficitModal ? allRows.find((r) => r.lineId === deficitModal.lineId) ?? null : null),
    [allRows, deficitModal]
  );

  const handleExportExcel = useCallback(() => {
    exportExecutiveDocsToXlsx({
      rows: finalRows,
      visibleColumns,
      selectedObjectName,
      summary: filteredSummary,
    });
  }, [filteredSummary, finalRows, selectedObjectName, visibleColumns]);

  return (
    <section className="space-y-2.5" aria-label="Исполнительная документация">
      {/* Уведомление об ошибке или конфликте версий */}
      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-rose-800">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {conflictLineId && (
              <button
                type="button"
                onClick={() => void reloadFromServer()}
                className="h-7 px-3 rounded-md bg-[#1e3799] hover:bg-[#15276e] text-white text-xs font-semibold cursor-pointer"
              >
                Загрузить актуальные данные
              </button>
            )}
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="h-7 px-2.5 rounded-md border border-rose-200 bg-white hover:bg-rose-100 text-rose-700 text-xs font-medium cursor-pointer"
            >
              Скрыть
            </button>
          </div>
        </div>
      )}

      {/* Единая KPI-панель и панель фильтров */}
      <ExecutiveDocsFilterBar
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        quickFilter={quickFilter}
        onQuickFilterChange={setQuickFilter}
        rdFilter={rdFilter}
        onRdFilterChange={handleRdFilterChange}
        rdOptions={rdOptions}
        lineFilter={lineFilter}
        onLineFilterChange={setLineFilter}
        lineOptions={lineOptions}
        contourFilter={contourFilter}
        onContourFilterChange={setContourFilter}
        contourOptions={contourOptions}
        hasAnyActiveFilter={hasAnyActiveFilter}
        onResetAllFilters={handleResetAllFilters}
        visibleColumns={visibleColumns}
        onToggleColumn={toggleColumnVisibility}
        onShowAllColumns={showAllColumns}
        hasCustomWidths={hasCustomWidths}
        onResetWidths={handleResetWidths}
        onExportExcel={handleExportExcel}
        canExport={finalRows.length > 0}
        canRefresh={isDbConnected && isAuthenticated}
        isLoading={isLoading}
        onRefresh={() => void reloadFromServer()}
        baseSummary={baseSummary}
        filteredSummary={filteredSummary}
        totalRowsCount={allRows.length}
        filteredRowsCount={finalRows.length}
      />

      {/* Панель массового назначения для выбранных строк */}
      {canEdit && (
        <ExecutiveDocsBulkBar
          selectedCount={selectedRows.length}
          isSaving={isBulkSaving}
          workProducerSuggestions={workProducerSuggestions}
          ptoEngineerSuggestions={ptoEngineerSuggestions}
          onApply={handleBulkApply}
          onClearSelection={() => setSelectedLineIds(new Set())}
        />
      )}

      {/* Состояние загрузки / Пустые состояния / Таблица */}
      {isLoading && allRows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="h-9 bg-slate-100 rounded animate-pulse" />
          ))}
        </div>
      ) : allRows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <FileCheck2 className="w-8 h-8 text-slate-300 mx-auto" />
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-slate-900">
              По выбранному объекту нет технологических линий
            </h2>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Строки ведомости исполнительной документации формируются автоматически из раздела «Лайнлист». Добавьте линии в лайнлист или выберите другой объект строительства.
            </p>
          </div>
          {onOpenLineList && (
            <button
              type="button"
              onClick={onOpenLineList}
              className="h-9 inline-flex items-center gap-1.5 px-4 rounded-lg bg-[#1e3799] hover:bg-[#15276e] text-white text-xs font-semibold cursor-pointer transition-colors"
            >
              <span>Перейти в лайнлист</span>
            </button>
          )}
        </div>
      ) : finalRows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-slate-900">
              По заданным фильтрам линии не найдены
            </h2>
            <p className="text-xs text-slate-500">
              Измените параметры отбора или сбросьте все активные фильтры.
            </p>
          </div>
          <button
            type="button"
            onClick={handleResetAllFilters}
            className="h-9 inline-flex items-center gap-1.5 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Сбросить фильтры</span>
          </button>
        </div>
      ) : (
        <ExecutiveDocsTable
          rows={finalRows}
          baseRowsForCascade={topFilteredRows}
          activeColumnDefs={activeColumnDefs}
          columnFilters={columnFilters}
          onApplyColumnFilter={handleApplyColumnFilter}
          sortConfig={sortConfig}
          onSort={handleSort}
          getColumnWidth={getColumnWidth}
          onResizeStart={handleResizeStart}
          onAutoFit={handleColumnAutoFit}
          canEdit={canEdit}
          savingLineIds={savingLineIds}
          selectedLineIds={selectedLineIds}
          onToggleSelectRow={handleToggleSelectRow}
          onToggleSelectAll={handleToggleSelectAll}
          workProducerSuggestions={workProducerSuggestions}
          ptoEngineerSuggestions={ptoEngineerSuggestions}
          onSaveRowPatch={saveRowPatch}
          onRequestStatusChange={handleRequestStatusChange}
          onOpenNdtDeficit={(row) => setDeficitModal({ lineId: row.lineId, kind: 'ndt' })}
          onOpenVkDeficit={(row) => setDeficitModal({ lineId: row.lineId, kind: 'vk' })}
          onOpenLineInRegistry={onOpenLineInRegistry}
          onOpenTestingCircuits={onOpenTestingCircuits}
        />
      )}

      {/* Детализация дефицита НК / ВК */}
      <ExecutiveDocsDeficitModal
        row={activeDeficitRow}
        kind={deficitModal?.kind ?? 'ndt'}
        onClose={() => setDeficitModal(null)}
        onOpenLineInRegistry={onOpenLineInRegistry}
        onOpenLaboratory={onOpenLaboratory}
        onOpenLrvCatalog={onOpenLrvCatalog}
      />

      {/* Подтверждение подписания ИД при наличии блокеров */}
      <ExecutiveDocsSignConfirmModal
        row={pendingSignRow}
        onCancel={() => setPendingSignLineId(null)}
        onConfirm={() => {
          if (pendingSignRow) {
            void saveRowPatch(pendingSignRow, { idStatus: 'SIGNED' });
          }
          setPendingSignLineId(null);
        }}
      />
    </section>
  );
};
