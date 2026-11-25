import React, { useEffect, useRef, useState } from 'react';
import { Check, Columns3, RotateCcw } from 'lucide-react';
import type { ExecutiveDocColumnKey } from '../../types/executiveDocs';
import { EXECUTIVE_DOC_COLUMNS } from '../../types/executiveDocs';

export interface ExecutiveDocsFilterBarProps {
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
  totalRowsCount: number;
  filteredRowsCount: number;
  signedCount: number;
  inWorkCount: number;
  avgWeldingPct: number;
}

export const NO_CONTOUR_FILTER_VALUE = '__NO_CONTOUR__';

export const ExecutiveDocsFilterBar: React.FC<ExecutiveDocsFilterBarProps> = ({
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
  totalRowsCount,
  filteredRowsCount,
  signedCount,
  inWorkCount,
  avgWeldingPct,
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

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      {/* Панель фильтров перед таблицей */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3 flex-1 min-w-0">
          {/* Фильтр по шифру РД */}
          <div className="flex flex-col gap-1 min-w-[180px] sm:min-w-[210px]">
            <label
              htmlFor="exec-docs-filter-rd"
              className="text-[11px] font-semibold text-slate-600"
            >
              Шифр РД
            </label>
            <select
              id="exec-docs-filter-rd"
              value={rdFilter}
              onChange={(e) => onRdFilterChange(e.target.value)}
              className="h-9 px-2.5 bg-white border border-slate-300 focus:border-[#1e3799] focus:outline-none rounded-lg text-xs font-mono text-slate-900 cursor-pointer"
            >
              <option value="ALL">Все шифры РД</option>
              {rdOptions.map((rd) => (
                <option key={rd} value={rd}>
                  {rd}
                </option>
              ))}
            </select>
          </div>

          {/* Фильтр по линии */}
          <div className="flex flex-col gap-1 min-w-[160px] sm:min-w-[190px]">
            <label
              htmlFor="exec-docs-filter-line"
              className="text-[11px] font-semibold text-slate-600"
            >
              Линия
            </label>
            <select
              id="exec-docs-filter-line"
              value={lineFilter}
              onChange={(e) => onLineFilterChange(e.target.value)}
              className="h-9 px-2.5 bg-white border border-slate-300 focus:border-[#1e3799] focus:outline-none rounded-lg text-xs font-mono text-slate-900 cursor-pointer"
            >
              <option value="ALL">Все линии</option>
              {lineOptions.map((lineNum) => (
                <option key={lineNum} value={lineNum}>
                  {lineNum}
                </option>
              ))}
            </select>
          </div>

          {/* Фильтр по контуру испытаний */}
          <div className="flex flex-col gap-1 min-w-[180px] sm:min-w-[210px]">
            <label
              htmlFor="exec-docs-filter-contour"
              className="text-[11px] font-semibold text-slate-600"
            >
              Контур испытаний
            </label>
            <select
              id="exec-docs-filter-contour"
              value={contourFilter}
              onChange={(e) => onContourFilterChange(e.target.value)}
              className="h-9 px-2.5 bg-white border border-slate-300 focus:border-[#1e3799] focus:outline-none rounded-lg text-xs font-medium text-slate-900 cursor-pointer"
            >
              <option value="ALL">Все контуры</option>
              <option value={NO_CONTOUR_FILTER_VALUE}>Без контура</option>
              {contourOptions.map((contour) => (
                <option key={contour} value={contour}>
                  {contour}
                </option>
              ))}
            </select>
          </div>

          {/* Кнопка сброса фильтров */}
          <button
            type="button"
            onClick={onResetAllFilters}
            disabled={!hasAnyActiveFilter}
            className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 hover:border-slate-400 text-xs font-semibold text-slate-700 disabled:opacity-45 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span>Сбросить фильтры</span>
          </button>
        </div>

        {/* Управление видимыми столбцами */}
        <div className="relative shrink-0" ref={columnsMenuRef}>
          <button
            type="button"
            onClick={() => setIsColumnsOpen((prev) => !prev)}
            aria-expanded={isColumnsOpen}
            aria-haspopup="menu"
            className={`h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
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
      </div>

      {/* Спокойная типографическая сводка без пилюль и вложенных карточек */}
      <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
        <span>
          Показано линий:{' '}
          <strong className="font-mono tabular-nums text-slate-900">{filteredRowsCount}</strong>
          {filteredRowsCount !== totalRowsCount && (
            <span className="font-mono tabular-nums text-slate-400"> из {totalRowsCount}</span>
          )}
        </span>
        <span aria-hidden="true">·</span>
        <span>
          Подписано ИД:{' '}
          <strong className="font-mono tabular-nums text-emerald-700">{signedCount}</strong>
        </span>
        <span aria-hidden="true">·</span>
        <span>
          В работе:{' '}
          <strong className="font-mono tabular-nums text-amber-700">{inWorkCount}</strong>
        </span>
        <span aria-hidden="true">·</span>
        <span>
          Средняя готовность по сварке:{' '}
          <strong className="font-mono tabular-nums text-slate-900">{avgWeldingPct}%</strong>
        </span>
      </div>
    </div>
  );
};
