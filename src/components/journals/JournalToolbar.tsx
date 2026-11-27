import React from 'react';
import {
  AlertTriangle,
  Calendar,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Printer,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { JournalStandard } from '../../types/welding';
import { Button, FormField } from '../ui';
import { JournalLineSelector } from './JournalLineSelector';
import { JournalRdSelector } from './JournalRdSelector';
import {
  JournalLineOption,
  JournalQuickFilter,
  JournalQuickFilterCounts,
  JournalRdOption,
  LineWeldingAlert,
} from './types';

interface JournalToolbarProps {
  currentRdCode: string;
  rdOptions: JournalRdOption[];
  selectedObjectName: string;
  onSelectRd: (rdCode: string) => void;
  selectedLineKey: string;
  activeLineDisplayLabel: string;
  availableLines: JournalLineOption[];
  relevantJointsCount: number;
  onSelectLine: (lineKey: string) => void;
  lineWeldingAlert: LineWeldingAlert | null;
  standard: JournalStandard;
  onSwitchStandard: (standard: JournalStandard) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  quickFilter: JournalQuickFilter;
  quickFilterCounts: JournalQuickFilterCounts;
  onQuickFilterChange: (next: JournalQuickFilter) => void;
  hideEmptyRepairCols: boolean;
  effectiveHideRepairCols: boolean;
  repairedJointsCount: number;
  onToggleHideEmptyRepairCols: () => void;
  hasTitleMetaFilled: boolean;
  onOpenMetaModal: () => void;
  onPrint: () => void;
  onExportXlsx: () => void;
  onExportCsv: () => void;
  hasActiveFilters: boolean;
  onResetAllFilters: () => void;
}

export const JournalToolbar: React.FC<JournalToolbarProps> = ({
  currentRdCode,
  rdOptions,
  selectedObjectName,
  onSelectRd,
  selectedLineKey,
  activeLineDisplayLabel,
  availableLines,
  relevantJointsCount,
  onSelectLine,
  lineWeldingAlert,
  standard,
  onSwitchStandard,
  searchQuery,
  onSearchChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  quickFilter,
  quickFilterCounts,
  onQuickFilterChange,
  hideEmptyRepairCols,
  effectiveHideRepairCols,
  repairedJointsCount,
  onToggleHideEmptyRepairCols,
  hasTitleMetaFilled,
  onOpenMetaModal,
  onPrint,
  onExportXlsx,
  onExportCsv,
  hasActiveFilters,
  onResetAllFilters,
}) => {
  const quickFilterTabs: Array<{
    key: JournalQuickFilter;
    label: string;
    count: number;
    accent?: 'amber' | 'rose' | 'emerald';
  }> = [
    { key: 'all', label: 'Все', count: quickFilterCounts.all },
    {
      key: 'incomplete',
      label: 'С пропусками',
      count: quickFilterCounts.incomplete,
      accent: 'amber',
    },
    {
      key: 'in_repair',
      label: 'В ремонте',
      count: quickFilterCounts.inRepair,
      accent: 'rose',
    },
    {
      key: 'accepted',
      label: 'Принято',
      count: quickFilterCounts.accepted,
      accent: 'emerald',
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 px-3 py-2.5 shadow-2xs space-y-2.5 no-print">
      {/* Строка 1: область документа, стандарт и действия */}
      <div className="flex flex-wrap items-end justify-between gap-2.5">
        <div className="flex flex-wrap items-end gap-2">
          <FormField label="Шифр РД">
            <JournalRdSelector
              currentRdCode={currentRdCode}
              rdOptions={rdOptions}
              selectedObjectName={selectedObjectName}
              onSelectRd={onSelectRd}
            />
          </FormField>

          <FormField label="Линия">
            <JournalLineSelector
              selectedLineKey={selectedLineKey}
              activeLineDisplayLabel={activeLineDisplayLabel}
              availableLines={availableLines}
              currentRdCode={currentRdCode}
              selectedObjectName={selectedObjectName}
              relevantJointsCount={relevantJointsCount}
              onSelectLine={onSelectLine}
            />
          </FormField>

          {lineWeldingAlert && !lineWeldingAlert.isFullyWelded && (
            <div
              className="h-8 box-border inline-flex items-center gap-1.5 px-2.5 rounded-md bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold select-none shrink-0"
              title={`Линия заварена не полностью: ${lineWeldingAlert.welded} из ${lineWeldingAlert.total} стыков`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="whitespace-nowrap font-medium text-[11px]">
                Сварено {lineWeldingAlert.welded} из {lineWeldingAlert.total}
              </span>
            </div>
          )}

          <div className="h-5 w-px bg-slate-200 hidden lg:block mx-0.5" />

          <FormField label="Форма журнала">
            <div
              className="h-8 box-border flex items-center p-0.5 bg-slate-100 rounded-md border border-slate-300"
              role="group"
              aria-label="Выбор нормативной формы журнала"
            >
              <button
                type="button"
                onClick={() => onSwitchStandard('СТО Газпром 15-1.1-002-2023')}
                className={`h-full box-border px-2.5 rounded text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  standard === 'СТО Газпром 15-1.1-002-2023'
                    ? 'bg-[#1e3799] text-white shadow-2xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                СТО Газпром
              </button>
              <button
                type="button"
                onClick={() => onSwitchStandard('ГОСТ 32569-2013')}
                className={`h-full box-border px-2.5 rounded text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  standard === 'ГОСТ 32569-2013'
                    ? 'bg-[#1e3799] text-white shadow-2xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                ГОСТ 32569
              </button>
            </div>
          </FormField>
        </div>

        <div className="flex flex-wrap items-end gap-1.5">
          <Button
            type="button"
            variant="secondary"
            onClick={onOpenMetaModal}
            title="Заполнить титульные реквизиты журнала"
            className={
              hasTitleMetaFilled
                ? 'border-[#1e3799]/40 bg-[#f0f5fc] text-[#1e3799]'
                : ''
            }
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Реквизиты</span>
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={onPrint}
            title="Печать журнала сварочных работ"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Печать</span>
          </Button>

          <Button
            type="button"
            variant="primary"
            onClick={onExportXlsx}
            title="Выгрузить журнал сварочных работ в Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Выгрузить в Excel</span>
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={onExportCsv}
            title="Выгрузить журнал в CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </Button>
        </div>
      </div>

      {/* Строка 2: поиск, период дат, быстрые фильтры и компактный вид СТО */}
      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          {/* Быстрый поиск */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Поиск по стыку, клейму, № заключения..."
              className="w-full h-8 pl-8 pr-7 rounded-md border border-slate-300 bg-white text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1e3799] focus:ring-1 focus:ring-[#1e3799]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                aria-label="Очистить поиск"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Период дат сварки */}
          <div className="inline-flex items-center gap-1 h-8 px-2 rounded-md border border-slate-300 bg-white text-xs text-slate-600">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-[11px] text-slate-500">С</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              aria-label="Дата сварки с"
              className="h-6 bg-transparent text-[11px] font-mono text-slate-800 focus:outline-none cursor-pointer"
            />
            <span className="text-[11px] text-slate-400">—</span>
            <span className="text-[11px] text-slate-500">по</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
              aria-label="Дата сварки по"
              className="h-6 bg-transparent text-[11px] font-mono text-slate-800 focus:outline-none cursor-pointer"
            />
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => {
                  onDateFromChange('');
                  onDateToChange('');
                }}
                className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                title="Сбросить период дат"
                aria-label="Сбросить период дат"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Быстрые фильтры состояния */}
          <div
            className="inline-flex items-center p-0.5 bg-slate-100 rounded-md border border-slate-200 gap-0.5"
            role="group"
            aria-label="Быстрый фильтр записей журнала"
          >
            {quickFilterTabs.map((tab) => {
              const isActive = quickFilter === tab.key;
              const badgeClass = isActive
                ? 'bg-white/20 text-white'
                : tab.accent === 'amber' && tab.count > 0
                  ? 'bg-amber-100 text-amber-800'
                  : tab.accent === 'rose' && tab.count > 0
                    ? 'bg-rose-100 text-rose-800'
                    : tab.accent === 'emerald' && tab.count > 0
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-200/80 text-slate-600';

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => onQuickFilterChange(tab.key)}
                  className={`h-7 px-2 rounded text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-[#1e3799] text-white shadow-2xs'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-white/70'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded font-mono text-[10px] font-bold ${badgeClass}`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Правая часть строки 2: компактный вид СТО и сброс фильтров */}
        <div className="flex flex-wrap items-center gap-1.5">
          {standard === 'СТО Газпром 15-1.1-002-2023' && (
            <button
              type="button"
              onClick={onToggleHideEmptyRepairCols}
              title={
                repairedJointsCount > 0
                  ? 'В текущей выборке есть ремонтные стыки — графы 32–48 отображаются автоматически'
                  : 'Скрыть на экране пустые графы ремонта 32–48'
              }
              className={`h-8 px-2.5 rounded-md border text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                effectiveHideRepairCols
                  ? 'border-[#1e3799] bg-[#e8f1fc] text-[#1e3799]'
                  : hideEmptyRepairCols && repairedJointsCount > 0
                    ? 'border-slate-200 bg-slate-50 text-slate-500'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {effectiveHideRepairCols ? (
                <Eye className="w-3.5 h-3.5" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-slate-500" />
              )}
              <span>
                {effectiveHideRepairCols
                  ? 'Показать графы ремонта'
                  : 'Скрыть пустые графы ремонта'}
              </span>
            </button>
          )}

          {hasActiveFilters && (
            <Button
              type="button"
              variant="secondary"
              onClick={onResetAllFilters}
              className="h-8 px-2.5 text-xs font-semibold text-slate-700 hover:text-slate-900 border-slate-300"
              title="Сбросить все активные фильтры журнала"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#1e3799]" />
              <span>Сбросить фильтры</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
