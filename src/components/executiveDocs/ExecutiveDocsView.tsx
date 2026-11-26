import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileCheck2, RefreshCw, RotateCcw } from 'lucide-react';
import { useAppContext, useAuth } from '../../context';
import type { ExecutiveDocColumnKey } from '../../types/executiveDocs';
import {
  DEFAULT_EXECUTIVE_DOC_COLUMN_WIDTHS,
  EXECUTIVE_DOC_COLUMNS,
} from '../../types/executiveDocs';
import {
  buildExecutiveDocRows,
  compareExecutiveDocRows,
  extractPersonSurname,
  getExecutiveDocColumnDisplayValue,
} from '../../utils/executiveDocsLogic';
import { useResizableColumns } from '../../utils/useResizableColumns';
import {
  ExecutiveDocsFilterBar,
  NO_CONTOUR_FILTER_VALUE,
} from './ExecutiveDocsFilterBar';
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
  initialFilterPreset?: ExecutiveDocsFilterPreset | null;
  onConsumeFilterPreset?: () => void;
}

export const ExecutiveDocsView: React.FC<ExecutiveDocsViewProps> = ({
  onOpenLineInRegistry,
  onOpenLineList,
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

  // Права на редактирование: ПТО, СК (с уровнем не ниже OPERATOR), админы и суперадмин
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

  const {
    docByLineId,
    visibleColumns,
    toggleColumnVisibility,
    showAllColumns,
    isLoading,
    savingLineIds,
    errorMessage,
    setErrorMessage,
    conflictLineId,
    reloadFromServer,
    saveRowPatch,
  } = useExecutiveDocsState({
    selectedObjectName,
    isDbConnected,
    isAuthenticated,
  });

  // Верхние фильтры перед таблицей
  const [rdFilter, setRdFilter] = useState<string>('ALL');
  const [lineFilter, setLineFilter] = useState<string>('ALL');
  const [contourFilter, setContourFilter] = useState<string>('ALL');

  // Табличные Excel-фильтры и сортировка
  const [columnFilters, setColumnFilters] = useState<
    Partial<Record<ExecutiveDocColumnKey, string[]>>
  >({});
  const [sortConfig, setSortConfig] = useState<{
    key: ExecutiveDocColumnKey;
    direction: 'asc' | 'desc';
  } | null>(null);

  // Сброс верхних фильтров при смене объекта строительства
  useEffect(() => {
    setRdFilter('ALL');
    setLineFilter('ALL');
    setContourFilter('ALL');
    setColumnFilters({});
  }, [selectedObjectName]);

  // Применение предустановленного фильтра при переходе из раздела «Аналитика»
  useEffect(() => {
    if (!initialFilterPreset) return;
    setRdFilter(initialFilterPreset.rdCode || 'ALL');
    setLineFilter(initialFilterPreset.lineNumber || 'ALL');
    setContourFilter(initialFilterPreset.contour || 'ALL');
    setColumnFilters({});
    onConsumeFilterPreset?.();
  }, [initialFilterPreset, onConsumeFilterPreset]);

  const {
    getColumnWidth,
    handleResizeStart,
    handleAutoFit,
    handleResetWidths,
    hasCustomWidths,
  } = useResizableColumns({
    storageKey: 'zaychick_executive_docs_col_widths_v1',
    defaultWidths: DEFAULT_EXECUTIVE_DOC_COLUMN_WIDTHS,
    minColumnWidth: 80,
  });

  // Полный набор вычисленных строк для выбранного объекта строительства
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

  // Опции для блока верхних фильтров
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

  // Автосброс фильтра «Линия», если при смене «Шифра РД» линия больше не входит в список
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

  // Применение верхнего блока фильтров
  const topFilteredRows = useMemo(() => {
    return allRows.filter((row) => {
      if (rdFilter !== 'ALL' && row.rdCode !== rdFilter) return false;
      if (lineFilter !== 'ALL' && row.lineNumber !== lineFilter) return false;
      if (contourFilter === NO_CONTOUR_FILTER_VALUE) {
        if (row.testContoursList.length > 0) return false;
      } else if (contourFilter !== 'ALL') {
        if (!row.testContoursList.includes(contourFilter)) return false;
      }
      return true;
    });
  }, [allRows, contourFilter, lineFilter, rdFilter]);

  // Применение табличных фильтров и сортировки
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

  // Подсказки фамилий для «Производитель работ» и «Инженер ПТО»
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
    rdFilter !== 'ALL' ||
    lineFilter !== 'ALL' ||
    contourFilter !== 'ALL' ||
    Object.values(columnFilters).some((v) => v !== undefined) ||
    sortConfig !== null;

  const handleResetAllFilters = useCallback(() => {
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

  // Сводные показатели по отфильтрованным строкам
  const summaryStats = useMemo(() => {
    let signed = 0;
    let inWork = 0;
    let pctSum = 0;
    for (const r of finalRows) {
      if (r.idStatus === 'SIGNED') signed += 1;
      else inWork += 1;
      pctSum += r.weldingReadinessPct;
    }
    const avgWeldingPct =
      finalRows.length > 0 ? Math.round((pctSum / finalRows.length) * 10) / 10 : 0;
    return { signed, inWork, avgWeldingPct };
  }, [finalRows]);

  return (
    <section className="space-y-3" aria-label="Исполнительная документация">
      {/* Заголовок раздела */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1
            className="text-lg font-bold text-slate-900 tracking-tight"
            style={{ fontFamily: "'Jost', 'Century Gothic', sans-serif" }}
          >
            Исполнительная документация
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Статус подготовки исполнительной документации по монтажу технологических трубопроводов
          </p>
        </div>

        {isDbConnected && isAuthenticated && (
          <button
            type="button"
            onClick={() => void reloadFromServer()}
            disabled={isLoading}
            className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 disabled:opacity-50 cursor-pointer transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Обновить</span>
          </button>
        )}
      </div>

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

      {/* Блок фильтров перед таблицей */}
      <ExecutiveDocsFilterBar
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
        totalRowsCount={allRows.length}
        filteredRowsCount={finalRows.length}
        signedCount={summaryStats.signed}
        inWorkCount={summaryStats.inWork}
        avgWeldingPct={summaryStats.avgWeldingPct}
      />

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
          workProducerSuggestions={workProducerSuggestions}
          ptoEngineerSuggestions={ptoEngineerSuggestions}
          onSaveRowPatch={saveRowPatch}
          onOpenLineInRegistry={onOpenLineInRegistry}
        />
      )}
    </section>
  );
};
