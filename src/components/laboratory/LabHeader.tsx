import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCheck2,
  Layers,
  Radiation,
  Search,
  X,
} from 'lucide-react';
import { NdtDeficitStatementResult } from '../../utils/laboratoryLogic';
import { LaboratorySubTab } from './types';

interface LabHeaderProps {
  selectedObjectName: string;
  selectedRdCode: string;
  onSelectRdCode: (code: string) => void;
  availableRdCodes: { code: string; title: string; contours: string[] }[];
  onExportDeficitCsv: () => void;
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
}

export const LabHeader: React.FC<LabHeaderProps> = ({
  selectedObjectName,
  selectedRdCode,
  onSelectRdCode,
  availableRdCodes,
  onExportDeficitCsv,
  deficitStatement,
  requestCounts,
  activeTab,
  setActiveTab,
  conclusionsCount,
  searchQuery,
  setSearchQuery,
  statusBanner,
  onDismissStatusBanner,
}) => {
  return (
    <>
      {/* Шапка раздела «Лаборатория НК» и сквозная панель KPI */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Radiation className="w-3.5 h-3.5 text-[#1e3799] shrink-0" />
              <span>Лаборатория НК</span>
              <span aria-hidden="true">·</span>
              <span>
                {selectedObjectName === 'ALL'
                  ? 'Все объекты строительства'
                  : selectedObjectName}
              </span>
              <span aria-hidden="true">·</span>
              <span>СТО Газпром 15-1.1-002-2023 / ГОСТ 32569-2013</span>
            </div>
            <h2
              className="text-lg sm:text-xl font-bold text-slate-900"
              style={{ fontFamily: '"Jost", sans-serif' }}
            >
              Заявки на НК от ПТО, дефицитная ведомость по квотам и выпуск заключений
            </h2>
          </div>

          {/* Селектор Шифра РД и экспорт дефицитной ведомости */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedRdCode}
              onChange={(e) => onSelectRdCode(e.target.value)}
              aria-label="Фильтр по шифру РД"
              className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#1e3799] cursor-pointer"
            >
              <option value="ALL">Все шифры РД</option>
              {availableRdCodes.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.code}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={onExportDeficitCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-300 hover:border-[#1e3799] text-slate-700 hover:text-[#1e3799] text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Выгрузить ведомость (.CSV)</span>
            </button>
          </div>
        </div>

        {/* Сводная полоса производственных показателей Лаборатории (tabular-nums) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2 border-t border-slate-100">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
            <div className="text-[11px] text-slate-500 font-medium">
              Сварено стыков в контуре
            </div>
            <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
              {deficitStatement.totals.totalWelded}
              <span className="text-xs font-normal text-slate-500 ml-1">
                шт. ({deficitStatement.totals.totalLines} лин.)
              </span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200">
            <div className="text-[11px] text-amber-900 font-medium">
              Дефицит РК (по квоте %)
            </div>
            <div className="mt-1 text-xl font-bold font-mono tabular-nums text-amber-800">
              {deficitStatement.totals.rkDeficit}
              <span className="text-xs font-normal text-amber-700 ml-1">ст.</span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-sky-50/70 border border-sky-200">
            <div className="text-[11px] text-sky-900 font-medium">
              Дефицит УЗК / ПВК
            </div>
            <div className="mt-1 text-xl font-bold font-mono tabular-nums text-sky-900">
              {deficitStatement.totals.uzkDeficit}
              <span className="text-xs font-normal text-sky-700 mx-1">/</span>
              {deficitStatement.totals.pvkDeficit}
              <span className="text-xs font-normal text-sky-700 ml-1">ст.</span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-indigo-50/70 border border-indigo-200">
            <div className="text-[11px] text-indigo-900 font-medium">
              Новые заявки от ПТО
            </div>
            <div className="mt-1 text-xl font-bold font-mono tabular-nums text-[#1e3799]">
              {requestCounts.submitted}
              <span className="text-xs font-normal text-slate-600 ml-1">
                ожидают приёмки
              </span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-amber-50/50 border border-amber-200">
            <div className="text-[11px] text-slate-700 font-medium">
              Принято в работу ЛНК
            </div>
            <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
              {requestCounts.inWork}
              <span className="text-xs font-normal text-slate-500 ml-1">
                заявок в контроле
              </span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200">
            <div className="text-[11px] text-emerald-900 font-medium">
              Выполнено заявок (с заключениями)
            </div>
            <div className="mt-1 text-xl font-bold font-mono tabular-nums text-emerald-800">
              {requestCounts.completed}
              <span className="text-xs font-normal text-emerald-700 ml-1">
                закрыто ЛНК
              </span>
            </div>
          </div>
        </div>

        {/* Переключатель 3 рабочих контуров раздела Лаборатории + Поиск */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
          <div
            className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg"
            role="tablist"
            aria-label="Рабочие вкладки раздела Лаборатория"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'deficit'}
              onClick={() => setActiveTab('deficit')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'deficit'
                  ? 'bg-[#1e3799] text-white shadow-2xs'
                  : 'text-slate-700 hover:text-slate-950 hover:bg-white/60'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>1. Дефицитная ведомость (по шифрам РД и линиям)</span>
              <span className="font-mono tabular-nums text-[11px] opacity-85">
                ({deficitStatement.totals.deficitLinesCount}/
                {deficitStatement.totals.totalLines})
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'requests'}
              onClick={() => setActiveTab('requests')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'requests'
                  ? 'bg-[#1e3799] text-white shadow-2xs'
                  : 'text-slate-700 hover:text-slate-950 hover:bg-white/60'
              }`}
            >
              <Radiation className="w-3.5 h-3.5" />
              <span>2. Заявки на НК от ПТО и приёмка в работу</span>
              <span className="font-mono tabular-nums text-[11px] opacity-85">
                ({requestCounts.total})
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'conclusions'}
              onClick={() => setActiveTab('conclusions')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'conclusions'
                  ? 'bg-[#1e3799] text-white shadow-2xs'
                  : 'text-slate-700 hover:text-slate-950 hover:bg-white/60'
              }`}
            >
              <FileCheck2 className="w-3.5 h-3.5" />
              <span>3. Выдача заключений НК и ведомость результатов</span>
              <span className="font-mono tabular-nums text-[11px] opacity-85">
                ({conclusionsCount} ст.)
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-md min-w-[240px]">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по шифру РД, линии, № стыка, клейму или № заключения..."
                className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-[#1e3799]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
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
