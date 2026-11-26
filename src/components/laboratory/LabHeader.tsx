import React, { useMemo } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  FileCheck2,
  FileSpreadsheet,
  Layers,
  Plus,
  Radiation,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { NdtDeficitStatementResult } from '../../utils/laboratoryLogic';
import { LaboratorySubTab } from './types';
import { Button, Input, Select } from '../ui';

interface LabHeaderProps {
  selectedObjectName: string;
  selectedRdCode: string;
  onSelectRdCode: (code: string) => void;
  availableRdCodes: { code: string; title: string; contours: string[] }[];
  onExportExcel: () => void;
  onOpenCodeReference: () => void;
  onOpenCreateRequest?: () => void;
  canCreateRequest?: boolean;
  deficitStatement: NdtDeficitStatementResult;
  requestCounts: {
    total: number;
    submitted: number;
    inWork: number;
    completed: number;
  };
  activeTab: LaboratorySubTab;
  setActiveTab: (tab: LaboratorySubTab) => void;
  conclusionsCount: number;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  statusBanner: { type: 'success' | 'error'; message: string } | null;
  onDismissStatusBanner: () => void;
  hasActiveFilters?: boolean;
  onResetAllFilters?: () => void;
}

export const LabHeader: React.FC<LabHeaderProps> = ({
  selectedObjectName,
  selectedRdCode,
  onSelectRdCode,
  availableRdCodes,
  onExportExcel,
  onOpenCodeReference,
  onOpenCreateRequest,
  canCreateRequest = false,
  deficitStatement,
  requestCounts,
  activeTab,
  setActiveTab,
  conclusionsCount,
  searchQuery,
  setSearchQuery,
  statusBanner,
  onDismissStatusBanner,
  hasActiveFilters = false,
  onResetAllFilters,
}) => {
  const kpiMetrics = useMemo(() => {
    let readyJoints = 0;
    let repairJoints = 0;
    let physRequired = 0;
    let physCompleted = 0;

    for (const row of deficitStatement.allLineRows) {
      readyJoints += row.fullyAcceptedCount;
      repairJoints += row.inRepairCount;
      physRequired += row.rkRequired + row.uzkRequired + row.pvkRequired;
      physCompleted += row.rkCompleted + row.uzkCompleted + row.pvkCompleted;
    }

    const coveragePct =
      physRequired > 0
        ? Math.min(100, Math.round((physCompleted / physRequired) * 1000) / 10)
        : deficitStatement.totals.totalWelded > 0
        ? 100
        : 0;

    return {
      deficit: deficitStatement.totals.totalPhysicalDeficit,
      inWork: requestCounts.inWork,
      ready: readyJoints,
      requests: requestCounts.total,
      repair: repairJoints,
      coveragePct,
    };
  }, [deficitStatement, requestCounts]);

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs space-y-2.5">
        {/* Верхняя строка: Наименование раздела и кнопка справочника кодов */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <Radiation className="w-4 h-4 text-[#1e3799] shrink-0" />
            <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate">
              Лаборатория НК
            </h2>
            <span className="text-slate-300" aria-hidden="true">
              ·
            </span>
            <span className="text-xs font-semibold text-slate-600 truncate">
              {selectedObjectName === 'ALL' ? 'Все объекты' : selectedObjectName}
            </span>
          </div>

          <Button
            type="button"
            variant="secondary"
            onClick={onOpenCodeReference}
            title="Открыть справочник кодов маркировки"
          >
            <BookOpen className="w-3.5 h-3.5 text-[#1e3799]" />
            <span>Справочник кодов</span>
          </Button>
        </div>

        {/* Компактная однострочная полоса KPI строго между заголовком и фильтром шифра РД */}
        <div className="grid grid-cols-3 sm:grid-cols-6 border border-slate-200 rounded-lg divide-x divide-y sm:divide-y-0 divide-slate-200 bg-slate-50/70 overflow-hidden">
          <div className="px-3 py-1.5 flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-medium text-slate-500 truncate">
              Дефицит
            </span>
            <span
              className={`font-mono text-sm font-bold tabular-nums ${
                kpiMetrics.deficit > 0 ? 'text-amber-700' : 'text-slate-900'
              }`}
            >
              {kpiMetrics.deficit}
            </span>
          </div>

          <div className="px-3 py-1.5 flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-medium text-slate-500 truncate">
              В работе
            </span>
            <span className="font-mono text-sm font-bold tabular-nums text-[#1e3799]">
              {kpiMetrics.inWork}
            </span>
          </div>

          <div className="px-3 py-1.5 flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-medium text-slate-500 truncate">
              Готово
            </span>
            <span className="font-mono text-sm font-bold tabular-nums text-emerald-700">
              {kpiMetrics.ready}
            </span>
          </div>

          <div className="px-3 py-1.5 flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-medium text-slate-500 truncate">
              Заявки
            </span>
            <span className="font-mono text-sm font-bold tabular-nums text-slate-900">
              {kpiMetrics.requests}
            </span>
          </div>

          <div className="px-3 py-1.5 flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-medium text-slate-500 truncate">
              Ремонт
            </span>
            <span
              className={`font-mono text-sm font-bold tabular-nums ${
                kpiMetrics.repair > 0 ? 'text-rose-700' : 'text-slate-900'
              }`}
            >
              {kpiMetrics.repair}
            </span>
          </div>

          <div className="px-3 py-1.5 flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-medium text-slate-500 truncate">
              Охват НК
            </span>
            <span className="font-mono text-sm font-bold tabular-nums text-[#1e3799]">
              {kpiMetrics.coveragePct}%
            </span>
          </div>
        </div>

        {/* Строка фильтра «Шифр РД», поиска и действий */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
            <div className="flex items-center gap-1.5">
              <label
                htmlFor="lab-rd-filter"
                className="text-xs font-semibold text-slate-600 whitespace-nowrap"
              >
                Шифр РД:
              </label>
              <Select
                id="lab-rd-filter"
                value={selectedRdCode}
                onChange={(e) => onSelectRdCode(e.target.value)}
                className="w-48 sm:w-56 h-8 text-xs font-medium text-slate-800"
              >
                <option value="ALL">Все шифры РД</option>
                {availableRdCodes.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.code}
                  </option>
                ))}
              </Select>
            </div>

            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Стык, линия, маркировка, № заключения..."
                className="w-full h-8 pl-8 pr-7 text-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {hasActiveFilters && onResetAllFilters && (
              <Button
                type="button"
                variant="secondary"
                onClick={onResetAllFilters}
                title="Сбросить все фильтры"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Сбросить все фильтры</span>
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {canCreateRequest && onOpenCreateRequest && (
              <Button
                type="button"
                variant="primary"
                onClick={onOpenCreateRequest}
                title="Создать заявку в ЛНК"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Заявка</span>
              </Button>
            )}

            <button
              type="button"
              onClick={onExportExcel}
              title="Выгрузить в Excel"
              aria-label="Выгрузить в Excel"
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-[#1e3799] transition-colors cursor-pointer shrink-0"
            >
              <FileSpreadsheet className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Переключатель 3 рабочих вкладок Лаборатории НК (без скобок) */}
        <div className="pt-2 border-t border-slate-200">
          <div
            className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg"
            role="tablist"
            aria-label="Вкладки Лаборатории НК"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'deficit'}
              onClick={() => setActiveTab('deficit')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'deficit'
                  ? 'bg-[#1e3799] text-white shadow-2xs'
                  : 'text-slate-700 hover:text-slate-950 hover:bg-white/60'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Дефицитная ведомость</span>
              <span
                className={`px-1.5 py-0.5 rounded font-mono tabular-nums text-[10px] ${
                  activeTab === 'deficit'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200/80 text-slate-700'
                }`}
              >
                {deficitStatement.totals.deficitLinesCount}/{deficitStatement.totals.totalLines}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'requests'}
              onClick={() => setActiveTab('requests')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'requests'
                  ? 'bg-[#1e3799] text-white shadow-2xs'
                  : 'text-slate-700 hover:text-slate-950 hover:bg-white/60'
              }`}
            >
              <Radiation className="w-3.5 h-3.5" />
              <span>Заявки в ЛНК</span>
              <span
                className={`px-1.5 py-0.5 rounded font-mono tabular-nums text-[10px] ${
                  activeTab === 'requests'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200/80 text-slate-700'
                }`}
              >
                {requestCounts.total}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'conclusions'}
              onClick={() => setActiveTab('conclusions')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'conclusions'
                  ? 'bg-[#1e3799] text-white shadow-2xs'
                  : 'text-slate-700 hover:text-slate-950 hover:bg-white/60'
              }`}
            >
              <FileCheck2 className="w-3.5 h-3.5" />
              <span>Заключения ЛНК</span>
              <span
                className={`px-1.5 py-0.5 rounded font-mono tabular-nums text-[10px] ${
                  activeTab === 'conclusions'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200/80 text-slate-700'
                }`}
              >
                {conclusionsCount}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Информационное уведомление о результате операции */}
      {statusBanner && (
        <div
          role="status"
          className={`px-4 py-3 rounded-xl border text-xs font-semibold flex items-center justify-between gap-3 ${
            statusBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
              : 'bg-rose-50 border-rose-300 text-rose-950'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{statusBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={onDismissStatusBanner}
            className="p-1 rounded hover:bg-black/5 text-slate-600 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </>
  );
};
