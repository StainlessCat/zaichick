import React from 'react';
import { FileCheck2 } from 'lucide-react';
import type { ReadinessGroupCondition } from '../../types/welding';
import type { ReadinessSummaryTotals } from './useReadinessReportState';

interface ReadinessKpiGridProps {
  condition: ReadinessGroupCondition;
  hasDateRangeFilter: boolean;
  summary: ReadinessSummaryTotals;
}

export const ReadinessKpiGrid: React.FC<ReadinessKpiGridProps> = ({
  condition,
  hasDateRangeFilter,
  summary,
}) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="bg-white rounded-xl border border-slate-200 p-3.5">
        <div className="text-xs text-slate-500">
          {hasDateRangeFilter ? 'Стыков за период' : 'Всего стыков'}
        </div>
        <div className="font-mono text-2xl font-bold text-slate-900 mt-1">
          {summary.total}
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">
          {summary.supplementary > 0
            ? `Дополнительных: ${summary.supplementary}`
            : 'По текущей выборке'}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-3.5">
        <div className="text-xs text-slate-500">Сварено стыков</div>
        <div className="font-mono text-2xl font-bold text-[#1e3799] mt-1">
          {summary.welded}
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">
          Выполнение:{' '}
          <span className="font-semibold text-slate-700">{summary.weldingPct}%</span>
        </div>
      </div>

      <div className="bg-sky-50/40 rounded-xl border border-sky-300 p-3.5">
        <div className="text-xs text-[#1e3799] font-medium flex items-center justify-between">
          <span>Объём сварки EDI</span>
          <span className="text-[10px] text-slate-500 font-mono">Метод А</span>
        </div>
        <div className="font-mono text-lg font-bold text-[#1e3799] mt-1 truncate">
          {summary.weldedEquivInches} / {summary.totalEquivInches} дюйм
        </div>
        <div className="text-[11px] text-slate-600 font-semibold mt-0.5">
          Прогресс:{' '}
          <span className="text-[#1e3799] font-bold">{summary.equivWeldingPct}%</span>
        </div>
      </div>

      <div className="bg-emerald-50/50 rounded-xl border border-emerald-200 p-3.5">
        <div className="text-xs text-emerald-900 font-medium flex items-center justify-between">
          <span>ИД по линиям</span>
          <FileCheck2 className="w-3.5 h-3.5 text-emerald-700" />
        </div>
        <div className="font-mono text-xl font-bold text-emerald-900 mt-1">
          {summary.signedIdLines} / {summary.totalLines}
          <span className="text-sm font-semibold text-emerald-700 ml-1.5">
            {summary.idReadinessPct}%
          </span>
        </div>
        <div className="text-[11px] text-emerald-800 mt-0.5 truncate">
          {condition === 'contour' && summary.totalContoursCount > 0
            ? `Допуск к испытаниям: ${summary.allowedContoursCount} из ${summary.totalContoursCount}`
            : 'Подписано из общего числа линий'}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-3.5">
        <div className="text-xs text-slate-500">Принято по ВИК</div>
        <div className="font-mono text-2xl font-bold text-slate-900 mt-1">
          {summary.vikOk}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-3.5">
        <div className="text-xs text-slate-500">Принято по НК</div>
        <div className="font-mono text-2xl font-bold text-slate-900 mt-1">
          {summary.ndtOk}
        </div>
        {summary.ndtNotReq > 0 && (
          <div className="text-[11px] text-slate-500 mt-0.5">
            Без НК по проекту:{' '}
            <span className="font-semibold text-slate-700">{summary.ndtNotReq}</span>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-3.5">
        <div className="text-xs text-slate-500">В ремонте и брак</div>
        <div className="font-mono text-2xl font-bold text-amber-700 mt-1">
          {summary.repair}
        </div>
      </div>

      <div className="bg-[#e8f1fc] rounded-xl border border-sky-200 p-3.5">
        <div className="text-xs font-medium text-[#1e3799]">
          Полная готовность сварки
        </div>
        <div className="font-mono text-2xl font-bold text-[#1e3799] mt-1">
          {summary.readyPct}%
          <span className="text-sm font-semibold text-slate-600 ml-2">
            {summary.ready} из {summary.total}
          </span>
        </div>
      </div>
    </div>
  );
};
