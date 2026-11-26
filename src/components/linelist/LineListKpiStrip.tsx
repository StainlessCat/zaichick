import React from 'react';
import { CheckCircle2, FileCheck2, Layers, Wrench } from 'lucide-react';

export interface LineListKpiSummary {
  visibleLines: number;
  totalLines: number;
  weldedJoints: number;
  totalJoints: number;
  jointsReadinessPct: number;
  weldedEdi: number;
  totalEdi: number;
  ediReadinessPct: number;
  ndtSufficientLines: number;
  ndtInsufficientLines: number;
  signedIdLines: number;
}

interface LineListKpiStripProps {
  summary: LineListKpiSummary;
}

export const LineListKpiStrip: React.FC<LineListKpiStripProps> = ({ summary }) => {
  const signedPct =
    summary.visibleLines > 0
      ? Math.round((summary.signedIdLines / summary.visibleLines) * 100)
      : 0;
  const ndtPct =
    summary.visibleLines > 0
      ? Math.round((summary.ndtSufficientLines / summary.visibleLines) * 100)
      : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      <div className="bg-white rounded-xl border border-slate-200 px-3 py-2 shadow-2xs flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-slate-500 truncate">
            Линий в выборке
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="font-mono text-base font-bold text-[#1e3799]">
              {summary.visibleLines}
            </span>
            {summary.visibleLines !== summary.totalLines && (
              <span className="font-mono text-[11px] text-slate-400">
                из {summary.totalLines}
              </span>
            )}
          </div>
        </div>
        <Layers className="w-4 h-4 text-[#1e3799]/70 shrink-0" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 px-3 py-2 shadow-2xs flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-slate-500 truncate">
            Сварка стыков · EDI
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="font-mono text-base font-bold text-slate-900">
              {summary.jointsReadinessPct}%
            </span>
            <span className="font-mono text-[11px] text-slate-500 truncate">
              {summary.weldedJoints}/{summary.totalJoints} ст. · {summary.ediReadinessPct}% EDI
            </span>
          </div>
        </div>
        <Wrench className="w-4 h-4 text-[#1e3799]/70 shrink-0" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 px-3 py-2 shadow-2xs flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-slate-500 truncate">
            НК выполнен по норме
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="font-mono text-base font-bold text-emerald-700">
              {summary.ndtSufficientLines}
            </span>
            <span className="font-mono text-[11px] text-slate-500">
              {ndtPct}%
              {summary.ndtInsufficientLines > 0
                ? ` · дефицит: ${summary.ndtInsufficientLines}`
                : ''}
            </span>
          </div>
        </div>
        <CheckCircle2 className="w-4 h-4 text-emerald-600/80 shrink-0" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 px-3 py-2 shadow-2xs flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-slate-500 truncate">
            ИД подписана
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="font-mono text-base font-bold text-emerald-700">
              {summary.signedIdLines}
            </span>
            <span className="font-mono text-[11px] text-slate-500">
              из {summary.visibleLines} · {signedPct}%
            </span>
          </div>
        </div>
        <FileCheck2 className="w-4 h-4 text-emerald-600/80 shrink-0" />
      </div>
    </div>
  );
};
