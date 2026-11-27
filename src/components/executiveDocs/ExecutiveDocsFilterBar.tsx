import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Columns3,
  Download,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import type {
  ExecutiveDocColumnKey,
  ExecutiveDocQuickFilter,
  ExecutiveDocsSummaryStats,
} from '../../types/executiveDocs';
import { EXECUTIVE_DOC_COLUMNS } from '../../types/executiveDocs';

export interface ExecutiveDocsFilterBarProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  quickFilter: ExecutiveDocQuickFilter;
  onQuickFilterChange: (value: ExecutiveDocQuickFilter) => void;
  rdFilter: string;
  onRdFilterChange: (value: string) => void;
  rdOptions: string[];
  lineFilter: string;
  onLineFilterChange: (value: string) => void;
  lineOptions: string[];
  contourFilter: string;
  onContourFilterChange: (value: string) => void;
  contourOptions: string[];
  hasAnyActiveFilter: boolean;
  onResetAllFilters: () => void;
  visibleColumns: ExecutiveDocColumnKey[];
  onToggleColumn: (key: ExecutiveDocColumnKey) => void;
  onShowAllColumns: () => void;
  hasCustomWidths: boolean;
  onResetWidths: () => void;
  onExportExcel: () => void;
  canExport: boolean;
  canRefresh: boolean;
  isLoading: boolean;
  onRefresh: () => void;
  baseSummary: ExecutiveDocsSummaryStats;
  filteredSummary: ExecutiveDocsSummaryStats;
  totalRowsCount: number;
  filteredRowsCount: number;
}

export const NO_CONTOUR_FILTER_VALUE = '__NO_CONTOUR__';

export const ExecutiveDocsFilterBar: React.FC<ExecutiveDocsFilterBarProps> = ({
  searchQuery,
  onSearchQueryChange,
  quickFilter,
  onQuickFilterChange,
  rdFilter,
  onRdFilterChange,
  rdOptions,
  lineFilter,
  onLineFilterChange,
  lineOptions,
  contourFilter,
  onContourFilterChange,
  contourOptions,
  hasAnyActiveFilter,
  onResetAllFilters,
  visibleColumns,
  onToggleColumn,
  onShowAllColumns,
  hasCustomWidths,
  onResetWidths,
  onExportExcel,
  canExport,
  canRefresh,
  isLoading,
  onRefresh,
  baseSummary,
  filteredSummary,
  totalRowsCount,
  filteredRowsCount,
}) => {
  const [isColumnsOpen, setIsColumnsOpen] = useState(false);
  const columnsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isColumnsOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) {
        setIsColumnsOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsColumnsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isColumnsOpen]);

  const visibleSet = new Set(visibleColumns);
  const allColumnsSelected = visibleColumns.length === EXECUTIVE_DOC_COLUMNS.length;

  const toggleQuickFilter = (target: ExecutiveDocQuickFilter) => {
    onQuickFilterChange(quickFilter === target ? 'all' : target);
  };

  return (
    <div className="space-y-2.5">
      {/* Компактная KPI-панель с быстрой фильтрацией по клику */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <button
          type="button"
          onClick={() => onQuickFilterChange('all')}
          className={`text-left px-3.5 py-2.5 rounded-xl border transition-colors cursor-pointer ${
            quickFilter === 'all'
              ? 'bg-[#f0f5fc] border-[#1e3799] text-slate-900'
              : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800'
          }`}
        >
          <div className="text-[11px] font-medium text-slate-500">Всего линий</div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
              {baseSummary.totalLines}
            </span>
            <span className="text-[11px] font-mono tabular-nums text-slate-500">
              в работе: {baseSummary.inWorkCount}
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => toggleQuickFilter('signed')}
          className={`text-left px-3.5 py-2.5 rounded-xl border transition-colors cursor-pointer ${
            quickFilter === 'signed'
              ? 'bg-emerald-50 border-emerald-600 text-slate-900'
              : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800'
          }`}
        >
          <div className="text-[11px] font-medium text-slate-500">Подписано ИД</div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-lg font-bold font-mono tabular-nums text-emerald-700">
              {baseSummary.signedCount}
            </span>
            <span className="text-[11px] font-mono tabular-nums text-slate-500">
              из {baseSummary.totalLines}
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => toggleQuickFilter('ready')}
          className={`text-left px-3.5 py-2.5 rounded-xl border transition-colors cursor-pointer ${
            quickFilter === 'ready'
              ? 'bg-sky-50 border-[#1e3799] text-slate-900'
              : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800'
          }`}
        >
          <div className="text-[11px] font-medium text-slate-500">Готовы к сдаче</div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-lg font-bold font-mono tabular-nums text-[#1e3799]">
              {baseSummary.readyToSignCount}
            </span>
            <span className="text-[11px] text-slate-500">без блокеров</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => toggleQuickFilter('ndt_deficit')}
          className={`text-left px-3.5 py-2.5 rounded-xl border transition-colors cursor-pointer ${
            quickFilter === 'ndt_deficit'
              ? 'bg-rose-50 border-rose-600 text-slate-900'
              : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800'
          }`}
        >
          <div className="text-[11px] font-medium text-slate-500">Дефицит по НК</div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span
              className={`text-lg font-bold font-mono tabular-nums ${
                baseSummary.ndtDeficitLinesCount > 0 ? 'text-rose-700' : 'text-emerald-700'
              }`}
            >
              {baseSummary.ndtDeficitLinesCount}
            </span>
            <span className="text-[11px] text-slate-500">линий</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => toggleQuickFilter('vk_deficit')}
          className={`text-left px-3.5 py-2.5 rounded-xl border transition-colors cursor-pointer ${
            quickFilter === 'vk_deficit'
              ? 'bg-amber-50 border-amber-600 text-slate-900'
              : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800'
          }`}
        >
          <div className="text-[11px] font-medium text-slate-500">Дефицит ВК</div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span
              className={`text-lg font-bold font-mono tabular-nums ${
                baseSummary.vkDeficitLinesCount > 0 ? 'text-amber-700' : 'text-emerald-700'
              }`}
            >
              {baseSummary.vkDeficitLinesCount}
            </span>
            <span className="text-[11px] text-slate-500">линий</span>
          </div>
        </button>

        <div className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white">
          <div className="text-[11px] font-medium text-slate-500">Готовность по сварке</div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
              {filteredSummary.weightedWeldingPct}%
            </span>
            <span className="text-[11px] font-mono tabular-nums text-slate-500">
              {filteredSummary.weldedJoints}/{filteredSummary.totalJoints} ст.
            </span>
          </div>
        </div>
      </div>

      {/* Панель поиска, фильтров и действий */}
      <div className="bg-white border border-slate-200 rounded-xl px-3.5 py-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          {/* Текстовый поиск */}
          <div className="relative flex-1 min-w-[210px] max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="Поиск по линии, РД, контуру, фамилии..."
              aria-label="Поиск по ведомости исполнительной документации"
              className="w-full h-9 pl-8 pr-7 bg-white border border-slate-300 focus:border-[#1e3799] focus:outline-none rounded-lg text-xs text-slate-900 placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchQueryChange('')}
                aria-label="Очистить поиск"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            id="exec-docs-filter-rd"
            aria-label="Фильтр по шифру РД"
            value={rdFilter}
            onChange={(e) => onRdFilterChange(e.target.value)}
            className="h-9 px-2.5 min-w-[165px] max-w-[230px] bg-white border border-slate-300 focus:border-[#1e3799] focus:outline-none rounded-lg text-xs font-mono text-slate-900 cursor-pointer"
          >
            <option value="ALL">Все шифры РД</option>
            {rdOptions.map((rd) => (
              <option key={rd} value={rd}>
                {rd}
              </option>
            ))}
          </select>

          <select
            id="exec-docs-filter-line"
            aria-label="Фильтр по линии"
            value={lineFilter}
            onChange={(e) => onLineFilterChange(e.target.value)}
            className="h-9 px-2.5 min-w-[130px] max-w-[180px] bg-white border border-slate-300 focus:border-[#1e3799] focus:outline-none rounded-lg text-xs font-mono text-slate-900 cursor-pointer"
          >
            <option value="ALL">Все линии</option>
            {lineOptions.map((lineNum) => (
              <option key={lineNum} value={lineNum}>
                {lineNum}
              </option>
            ))}
          </select>

          <select
            id="exec-docs-filter-contour"
            aria-label="Фильтр по контуру испытаний"
            value={contourFilter}
            onChange={(e) => onContourFilterChange(e.target.value)}
            className="h-9 px-2.5 min-w-[160px] max-w-[220px] bg-white border border-slate-300 focus:border-[#1e3799] focus:outline-none rounded-lg text-xs font-medium text-slate-900 cursor-pointer"
          >
            <option value="ALL">Все контуры</option>
            <option value={NO_CONTOUR_FILTER_VALUE}>Без контура</option>
            {contourOptions.map((contour) => (
              <option key={contour} value={contour}>
                {contour}
              </option>
            ))}
          </select>

          {hasAnyActiveFilter && (
            <button
              type="button"
              onClick={onResetAllFilters}
              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>Сбросить</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {filteredRowsCount !== totalRowsCount && (
            <span className="text-xs text-slate-500 whitespace-nowrap mr-1">
              Показано:{' '}
              <strong className="font-mono tabular-nums text-slate-900">
                {filteredRowsCount}
              </strong>{' '}
              из <span className="font-mono tabular-nums">{totalRowsCount}</span>
            </span>
          )}

          {/* Столбцы */}
          <div className="relative shrink-0" ref={columnsMenuRef}>
            <button
              type="button"
              onClick={() => setIsColumnsOpen((prev) => !prev)}
              aria-expanded={isColumnsOpen}
              aria-haspopup="menu"
              className={`h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                isColumnsOpen || !allColumnsSelected
                  ? 'border-[#1e3799] bg-[#f0f5fc] text-[#1e3799]'
                  : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
              }`}
            >
              <Columns3 className="w-3.5 h-3.5 shrink-0" />
              <span>Столбцы</span>
              <span className="font-mono tabular-nums text-[11px] opacity-80">
                {visibleColumns.length}/{EXECUTIVE_DOC_COLUMNS.length}
              </span>
            </button>

            {isColumnsOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1.5 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-40 overflow-hidden"
              >
                <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800">Отображаемые столбцы</span>
                  <button
                    type="button"
                    onClick={onShowAllColumns}
                    disabled={allColumnsSelected}
                    className="text-[11px] font-semibold text-[#1e3799] hover:underline disabled:opacity-40 cursor-pointer"
                  >
                    Показать все
                  </button>
                </div>

                <div className="max-h-72 overflow-y-auto py-1.5 px-1.5 space-y-0.5">
                  {EXECUTIVE_DOC_COLUMNS.map((col) => {
                    const checked = visibleSet.has(col.key);
                    const isLastVisible = checked && visibleColumns.length === 1;
                    return (
                      <button
                        key={col.key}
                        type="button"
                        disabled={isLastVisible}
                        onClick={() => onToggleColumn(col.key)}
                        className="w-full px-2.5 py-1.5 rounded-md text-left text-xs flex items-center justify-between gap-2 hover:bg-slate-50 text-slate-800 disabled:opacity-50 cursor-pointer transition-colors"
                      >
                        <span className="truncate">{col.label}</span>
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                            checked
                              ? 'bg-[#1e3799] border-[#1e3799] text-white'
                              : 'bg-white border-slate-300'
                          }`}
                        >
                          {checked && <Check className="w-3 h-3" />}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {hasCustomWidths && (
                  <div className="px-3 py-2 bg-slate-50 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        onResetWidths();
                        setIsColumnsOpen(false);
                      }}
                      className="w-full h-8 inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-xs font-medium text-slate-700 cursor-pointer transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Сбросить ширину столбцов</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Экспорт в Excel */}
          <button
            type="button"
            onClick={onExportExcel}
            disabled={!canExport}
            className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span>Выгрузить в Excel</span>
          </button>

          {canRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              title="Обновить данные с сервера"
              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 disabled:opacity-50 cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Обновить</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
