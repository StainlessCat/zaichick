import React from 'react';
import {
  Calendar,
  Columns3,
  Download,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import type { ReadinessGroupCondition } from '../../types/welding';
import { Button } from '../ui';
import {
  ALL_TOGGLEABLE_COLUMNS,
  CONDITION_OPTIONS,
  CONDITION_TITLE_MAP,
  DEFAULT_VISIBLE_COLUMNS,
  type DatePresetId,
  type ToggleableColumnKey,
} from './readinessConfig';

interface ReadinessToolbarProps {
  activeTab: 'readiness' | 'welders';
  condition: ReadinessGroupCondition;
  onSelectCondition: (next: ReadinessGroupCondition) => void;
  onSelectWeldersTab: () => void;
  searchQuery: string;
  onSearchQueryChange: (val: string) => void;
  datePreset: DatePresetId;
  weldingDateFrom: string;
  weldingDateTo: string;
  hasDateRangeFilter: boolean;
  onSelectDatePreset: (preset: DatePresetId) => void;
  onWeldingDateFromChange: (val: string) => void;
  onWeldingDateToChange: (val: string) => void;
  visibleColumns: ToggleableColumnKey[];
  isColVisible: (key: ToggleableColumnKey) => boolean;
  onToggleColumn: (key: ToggleableColumnKey) => void;
  onShowAllColumns: () => void;
  isColumnsPopoverOpen: boolean;
  onToggleColumnsPopover: () => void;
  columnsMenuRef: React.RefObject<HTMLDivElement | null>;
  hasActiveFilters: boolean;
  onResetAllFilters: () => void;
  onExportXlsx: () => void;
  onExportCsv: () => void;
}

export const ReadinessToolbar: React.FC<ReadinessToolbarProps> = ({
  activeTab,
  condition,
  onSelectCondition,
  onSelectWeldersTab,
  searchQuery,
  onSearchQueryChange,
  datePreset,
  weldingDateFrom,
  weldingDateTo,
  hasDateRangeFilter,
  onSelectDatePreset,
  onWeldingDateFromChange,
  onWeldingDateToChange,
  visibleColumns,
  isColVisible,
  onToggleColumn,
  onShowAllColumns,
  isColumnsPopoverOpen,
  onToggleColumnsPopover,
  columnsMenuRef,
  hasActiveFilters,
  onResetAllFilters,
  onExportXlsx,
  onExportCsv,
}) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-3 py-2.5 shadow-2xs space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div
          className="h-8 box-border flex items-center p-0.5 bg-slate-100 rounded-md border border-slate-300"
          role="group"
          aria-label="Разрезы отчётности"
        >
          {CONDITION_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSelectCondition(opt.id)}
              className={`h-full box-border px-3 rounded text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'readiness' && condition === opt.id
                  ? 'bg-[#1e3799] text-white shadow-2xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
          <div className="w-px h-4 bg-slate-300 mx-0.5" />
          <button
            type="button"
            onClick={onSelectWeldersTab}
            className={`h-full box-border px-3 rounded text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'welders'
                ? 'bg-[#1e3799] text-white shadow-2xs'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            Сварщики и НК
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {activeTab === 'readiness' && (
            <div className="relative" ref={columnsMenuRef}>
              <Button
                type="button"
                variant="secondary"
                onClick={onToggleColumnsPopover}
                title="Выбрать отображаемые столбцы таблицы"
              >
                <Columns3 className="w-3.5 h-3.5 text-slate-600" />
                <span>Столбцы</span>
              </Button>
              {isColumnsPopoverOpen && (
                <div className="absolute right-0 mt-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-lg p-2.5 z-40">
                  <div className="flex items-center justify-between pb-2 mb-1.5 border-b border-slate-100">
                    <span className="text-[11px] font-bold text-slate-700">
                      Видимые столбцы
                    </span>
                    <button
                      type="button"
                      onClick={onShowAllColumns}
                      className="text-[11px] font-semibold text-[#1e3799] hover:underline cursor-pointer"
                    >
                      Показать все
                    </button>
                  </div>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {ALL_TOGGLEABLE_COLUMNS.map((col) => {
                      const checked = isColVisible(col.key);
                      const disabled =
                        checked &&
                        visibleColumns.length <= 1 &&
                        DEFAULT_VISIBLE_COLUMNS.length > 0;
                      return (
                        <label
                          key={col.key}
                          className={`flex items-center gap-2 px-1.5 py-1 rounded text-xs select-none ${
                            disabled
                              ? 'text-slate-400 cursor-not-allowed'
                              : 'text-slate-700 hover:bg-slate-50 cursor-pointer'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => onToggleColumn(col.key)}
                            className="rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799]"
                          />
                          <span>{col.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {hasActiveFilters && (
            <Button
              type="button"
              variant="secondary"
              onClick={onResetAllFilters}
              title="Сбросить поиск, период дат и фильтры таблицы"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Сбросить фильтры</span>
            </Button>
          )}

          <Button
            type="button"
            variant="secondary"
            onClick={onExportXlsx}
            title="Выгрузить отчёт готовности в Excel"
          >
            <Download className="w-3.5 h-3.5 text-[#1e3799]" />
            <span>Выгрузить в Excel</span>
          </Button>

          <Button
            type="button"
            variant="primary"
            onClick={onExportCsv}
            title="Выгрузить сводку готовности в CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Выгрузить в CSV</span>
          </Button>
        </div>
      </div>

      {/* Строка быстрого поиска и фильтра по периоду дат сварки */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
        {activeTab === 'readiness' ? (
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder={`Поиск: ${CONDITION_TITLE_MAP[condition].toLowerCase()} или привязка...`}
              className="w-full h-8 pl-8 pr-7 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:bg-white focus:border-[#1e3799] transition-colors"
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
        ) : (
          <div className="text-xs font-medium text-slate-600">
            Выработка и нормативные квоты НК по СТО Газпром 15-1.3-004-2023
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 mr-0.5">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span>Период сварки:</span>
          </span>
          <div className="h-8 box-border flex items-center p-0.5 bg-slate-100 rounded-md border border-slate-200">
            {(
              [
                { id: 'all', label: 'Весь период' },
                { id: 'today', label: 'Сегодня' },
                { id: '7d', label: '7 дней' },
                { id: '30d', label: '30 дней' },
              ] as { id: DatePresetId; label: string }[]
            ).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectDatePreset(preset.id)}
                className={`h-full px-2 rounded text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  datePreset === preset.id
                    ? 'bg-white text-[#1e3799] font-semibold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <input
              type="date"
              value={weldingDateFrom}
              onChange={(e) => onWeldingDateFromChange(e.target.value)}
              aria-label="Дата сварки от"
              className="h-8 px-2 text-xs font-mono bg-white border border-slate-200 rounded-md focus:outline-none focus:border-[#1e3799]"
            />
            <span className="text-slate-400 text-xs">—</span>
            <input
              type="date"
              value={weldingDateTo}
              onChange={(e) => onWeldingDateToChange(e.target.value)}
              aria-label="Дата сварки до"
              className="h-8 px-2 text-xs font-mono bg-white border border-slate-200 rounded-md focus:outline-none focus:border-[#1e3799]"
            />
            {hasDateRangeFilter && (
              <button
                type="button"
                onClick={() => onSelectDatePreset('all')}
                title="Сбросить период сварки"
                className="h-8 px-2 rounded-md border border-slate-200 bg-white text-slate-500 hover:text-red-600 hover:border-red-200 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
