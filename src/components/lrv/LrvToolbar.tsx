import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Columns3,
  Download,
  FileSpreadsheet,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  LRV_COLUMN_DEFINITIONS,
  LRV_FULL_COLUMNS,
  LRV_OPERATIONAL_COLUMNS,
  LrvColumnKey,
  LrvColumnPreset,
  detectLrvColumnPreset,
} from './lrvColumns';

export type LrvStatusFilter =
  | 'all'
  | 'accepted'
  | 'partial'
  | 'rejected'
  | 'pending'
  | 'superseded';

export interface LrvStatusCounts {
  all: number;
  accepted: number;
  partial: number;
  rejected: number;
  pending: number;
  superseded: number;
  totalActs: number;
}

export interface LrvToolbarProps {
  canEdit: boolean;
  statusFilter: LrvStatusFilter;
  onStatusFilterChange: (filter: LrvStatusFilter) => void;
  statusCounts: LrvStatusCounts;
  searchQuery: string;
  onSearchQueryChange: (val: string) => void;
  rdFilter: string;
  onRdFilterChange: (val: string) => void;
  allRds: { objectName: string; code: string; title: string }[];
  visibleColumns: LrvColumnKey[];
  onVisibleColumnsChange: (cols: LrvColumnKey[]) => void;
  onApplyPreset: (preset: LrvColumnPreset) => void;
  selectedCount: number;
  hasActiveFilters: boolean;
  onResetAllFilters: () => void;
  onBulkDelete: () => void;
  onOpenAddForm: () => void;
  onDownloadTemplate: () => void;
  onExportExcel: () => void;
  onExcelFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export const LrvToolbar: React.FC<LrvToolbarProps> = ({
  canEdit,
  statusFilter,
  onStatusFilterChange,
  statusCounts,
  searchQuery,
  onSearchQueryChange,
  rdFilter,
  onRdFilterChange,
  allRds,
  visibleColumns,
  onVisibleColumnsChange,
  onApplyPreset,
  selectedCount,
  hasActiveFilters,
  onResetAllFilters,
  onBulkDelete,
  onOpenAddForm,
  onDownloadTemplate,
  onExportExcel,
  onExcelFileChange,
  fileInputRef,
}) => {
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);
  const columnsMenuRef = useRef<HTMLDivElement | null>(null);
  const activePreset = detectLrvColumnPreset(visibleColumns);

  useEffect(() => {
    if (!showColumnsMenu) return;
    const handleOutside = (e: MouseEvent) => {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) {
        setShowColumnsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showColumnsMenu]);

  const toggleColumn = (key: LrvColumnKey) => {
    const def = LRV_COLUMN_DEFINITIONS.find((c) => c.key === key);
    if (def?.alwaysVisible) return;
    if (visibleColumns.includes(key)) {
      onVisibleColumnsChange(visibleColumns.filter((k) => k !== key));
    } else {
      const nextSet = new Set([...visibleColumns, key]);
      const ordered = LRV_COLUMN_DEFINITIONS.map((c) => c.key).filter((k) => nextSet.has(k));
      onVisibleColumnsChange(ordered);
    }
  };

  const kpiCards: Array<{
    key: LrvStatusFilter | 'acts';
    label: string;
    value: number;
    accent: string;
    activeRing: string;
    clickable: boolean;
  }> = [
    {
      key: 'all',
      label: 'Всего позиций',
      value: statusCounts.all,
      accent: 'text-slate-900',
      activeRing: 'border-[#1e3799] bg-blue-50/40',
      clickable: true,
    },
    {
      key: 'accepted',
      label: 'Годны к монтажу',
      value: statusCounts.accepted,
      accent: 'text-emerald-700',
      activeRing: 'border-emerald-500 bg-emerald-50/40',
      clickable: true,
    },
    {
      key: 'partial',
      label: 'Частичный допуск',
      value: statusCounts.partial,
      accent: 'text-amber-700',
      activeRing: 'border-amber-500 bg-amber-50/40',
      clickable: true,
    },
    {
      key: 'rejected',
      label: 'Выявлен брак',
      value: statusCounts.rejected,
      accent: 'text-rose-700',
      activeRing: 'border-rose-500 bg-rose-50/40',
      clickable: true,
    },
    {
      key: 'pending',
      label: 'Ожидают контроля',
      value: statusCounts.pending,
      accent: 'text-slate-700',
      activeRing: 'border-slate-500 bg-slate-100/70',
      clickable: true,
    },
    {
      key: 'acts',
      label: 'Актов входного контроля',
      value: statusCounts.totalActs,
      accent: 'text-[#1e3799]',
      activeRing: '',
      clickable: false,
    },
  ];

  const statusTabs: Array<{
    key: LrvStatusFilter;
    label: string;
    count: number;
    activeClass: string;
    inactiveClass: string;
  }> = [
    {
      key: 'all',
      label: 'Все',
      count: statusCounts.all,
      activeClass: 'bg-white text-[#1e3799] shadow-2xs border-slate-200',
      inactiveClass: 'text-slate-600 hover:text-slate-900 border-transparent',
    },
    {
      key: 'accepted',
      label: 'Годны',
      count: statusCounts.accepted,
      activeClass: 'bg-emerald-600 text-white shadow-2xs border-emerald-600',
      inactiveClass: 'text-emerald-700 hover:bg-white/70 border-transparent',
    },
    {
      key: 'partial',
      label: 'Частичный допуск',
      count: statusCounts.partial,
      activeClass: 'bg-amber-600 text-white shadow-2xs border-amber-600',
      inactiveClass: 'text-amber-700 hover:bg-white/70 border-transparent',
    },
    {
      key: 'rejected',
      label: 'Выявлен брак',
      count: statusCounts.rejected,
      activeClass: 'bg-rose-600 text-white shadow-2xs border-rose-600',
      inactiveClass: 'text-rose-700 hover:bg-white/70 border-transparent',
    },
    {
      key: 'pending',
      label: 'Ожидают контроля',
      count: statusCounts.pending,
      activeClass: 'bg-slate-700 text-white shadow-2xs border-slate-700',
      inactiveClass: 'text-slate-600 hover:bg-white/70 border-transparent',
    },
    {
      key: 'superseded',
      label: 'Аннулированные',
      count: statusCounts.superseded,
      activeClass: 'bg-indigo-600 text-white shadow-2xs border-indigo-600',
      inactiveClass: 'text-indigo-700 hover:bg-white/70 border-transparent',
    },
  ];

  return (
    <div className="space-y-3">
      {/* Сводная KPI-лента */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {kpiCards.map((card) => {
          const isActive = card.clickable && statusFilter === card.key;
          const baseClasses = `rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
            isActive
              ? card.activeRing
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`;
          if (!card.clickable) {
            return (
              <div key={card.key} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
                <div className="text-[11px] text-slate-500 font-medium truncate">{card.label}</div>
                <div className={`text-xl font-bold tabular-nums mt-0.5 ${card.accent}`}>
                  {card.value}
                </div>
              </div>
            );
          }
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => onStatusFilterChange(card.key as LrvStatusFilter)}
              className={`${baseClasses} cursor-pointer`}
            >
              <div className="text-[11px] text-slate-500 font-medium truncate">{card.label}</div>
              <div className={`text-xl font-bold tabular-nums mt-0.5 ${card.accent}`}>
                {card.value}
              </div>
            </button>
          );
        })}
      </div>

      {/* Единая компактная панель фильтров, пресетов и действий */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 space-y-2.5">
        {/* Строка 1: поиск + шифр РД + пресет граф + сброс */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="Поиск по коду ЛРВ, наименованию, стали, НТД, акту ВК, сертификату, плавке"
              className="w-full pl-9 pr-8 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50/40 focus:bg-white focus:border-[#1e3799] focus:ring-2 focus:ring-[#1e3799]/20 outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchQueryChange('')}
                aria-label="Очистить поиск"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            aria-label="Фильтр по шифру РД"
            value={rdFilter}
            onChange={(e) => onRdFilterChange(e.target.value)}
            className="px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg bg-white text-slate-800 max-w-[300px] truncate focus:border-[#1e3799] focus:ring-2 focus:ring-[#1e3799]/20 outline-none"
          >
            <option value="ALL">Все шифры РД</option>
            {allRds.map((r) => (
              <option key={r.code} value={r.code}>
                {r.code}
              </option>
            ))}
          </select>

          {/* Переключатель режима колонок */}
          <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => onApplyPreset('operational')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activePreset === 'operational'
                  ? 'bg-white text-[#1e3799] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Оперативный
            </button>
            <button
              type="button"
              onClick={() => onApplyPreset('full')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activePreset === 'full'
                  ? 'bg-white text-[#1e3799] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Все графы
            </button>
          </div>

          {/* Настройка граф */}
          <div className="relative" ref={columnsMenuRef}>
            <button
              type="button"
              onClick={() => setShowColumnsMenu((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                showColumnsMenu
                  ? 'border-[#1e3799] bg-blue-50 text-[#1e3799]'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span>Графы</span>
              <span className="text-[11px] text-slate-400 tabular-nums">
                {visibleColumns.length}/{LRV_COLUMN_DEFINITIONS.length}
              </span>
            </button>

            {showColumnsMenu && (
              <div className="absolute right-0 mt-1.5 w-64 bg-white rounded-xl shadow-xl border border-slate-200 z-40 py-2">
                <div className="px-3 pb-2 mb-1.5 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Отображаемые графы</span>
                  <button
                    type="button"
                    onClick={() => onVisibleColumnsChange(LRV_OPERATIONAL_COLUMNS)}
                    className="text-[11px] text-[#1e3799] hover:underline font-semibold cursor-pointer"
                  >
                    По умолчанию
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto px-1.5 space-y-0.5">
                  {LRV_COLUMN_DEFINITIONS.map((col) => {
                    const checked = visibleColumns.includes(col.key);
                    return (
                      <button
                        key={col.key}
                        type="button"
                        disabled={col.alwaysVisible}
                        onClick={() => toggleColumn(col.key)}
                        className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs text-left hover:bg-slate-50 disabled:opacity-60 cursor-pointer disabled:cursor-default"
                      >
                        <span className="text-slate-700 truncate">{col.label}</span>
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            checked
                              ? 'bg-[#1e3799] border-[#1e3799] text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {checked && <Check className="w-3 h-3" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="px-3 pt-2 mt-1.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                  <button
                    type="button"
                    onClick={() => onVisibleColumnsChange(LRV_OPERATIONAL_COLUMNS)}
                    className="text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
                  >
                    Оперативный
                  </button>
                  <button
                    type="button"
                    onClick={() => onVisibleColumnsChange(LRV_FULL_COLUMNS)}
                    className="text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
                  >
                    Выбрать все
                  </button>
                </div>
              </div>
            )}
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={onResetAllFilters}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Сбросить фильтры</span>
            </button>
          )}
        </div>

        {/* Строка 2: статусные вкладки со счётчиками + кнопки действий */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-1 bg-slate-100/80 p-1 rounded-lg border border-slate-200/80">
            {statusTabs.map((tab) => {
              const isActive = statusFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => onStatusFilterChange(tab.key)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors whitespace-nowrap cursor-pointer ${
                    isActive ? tab.activeClass : tab.inactiveClass
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[11px] tabular-nums ${
                      isActive ? 'opacity-90' : 'opacity-65'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canEdit && selectedCount > 0 && (
              <button
                type="button"
                onClick={onBulkDelete}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="tabular-nums">Удалить выбранные: {selectedCount}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onExportExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Выгрузить в Excel</span>
            </button>

            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={onDownloadTemplate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Шаблон Excel</span>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={onExcelFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Импорт Excel</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenAddForm}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#1e3799] text-white hover:bg-[#15286e] transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Добавить позицию</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
