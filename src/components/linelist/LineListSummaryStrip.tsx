import React from 'react';
import { CheckCircle2, FileCheck2, Layers, ShieldCheck } from 'lucide-react';

export interface LineListSummaryStats {
  visibleLines: number;
  totalLines: number;
  totalJoints: number;
  weldedJoints: number;
  jointsReadinessPct: number;
  totalEdi: number;
  weldedEdi: number;
  ediReadinessPct: number;
  ndtSufficientLines: number;
  ndtInsufficientLines: number;
  signedIdLines: number;
}

interface LineListSummaryStripProps {
  stats: LineListSummaryStats;
}

export const LineListSummaryStrip: React.FC<LineListSummaryStripProps> = ({ stats }) => {
  const signedPct =
    stats.visibleLines > 0
      ? Math.round((stats.signedIdLines / stats.visibleLines) * 100)
      : 0;
  const ndtTrackedLines = stats.ndtSufficientLines + stats.ndtInsufficientLines;
  const ndtPct =
    ndtTrackedLines > 0
      ? Math.round((stats.ndtSufficientLines / ndtTrackedLines) * 100)
      : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      <div className="bg-white rounded-xl border border-slate-200 px-3 py-2 shadow-2xs flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-slate-500 truncate">
            Линии в выборке
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-base font-bold font-mono text-[#1e3799]">
              {stats.visibleLines}
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              из {stats.totalLines}
            </span>
          </div>
        </div>
        <div className="p-1.5 rounded-lg bg-[#eef4fc] text-[#1e3799] shrink-0">
          <Layers className="w-4 h-4" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 px-3 py-2 shadow-2xs flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-slate-500 truncate">
            Готовность сварки
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5 flex-wrap">
            <span className="text-base font-bold font-mono text-[#1e3799]">
              {stats.jointsReadinessPct}%
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              {stats.weldedJoints}/{stats.totalJoints} ст.
            </span>
            {stats.totalEdi > 0 && (
              <span className="text-[10px] font-mono text-slate-400">
                · {stats.ediReadinessPct}% EDI
              </span>
            )}
          </div>
        </div>
        <div className="p-1.5 rounded-lg bg-sky-50 text-[#1e3799] shrink-0">
          <CheckCircle2 className="w-4 h-4" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 px-3 py-2 shadow-2xs flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-slate-500 truncate">
            Объём НК выполнен
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-base font-bold font-mono text-emerald-700">
              {stats.ndtSufficientLines}
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              из {ndtTrackedLines}
            </span>
            {ndtTrackedLines > 0 && (
              <span className="text-[10px] font-mono text-slate-400">
                · {ndtPct}%
              </span>
            )}
          </div>
        </div>
        <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 shrink-0">
          <ShieldCheck className="w-4 h-4" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 px-3 py-2 shadow-2xs flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-slate-500 truncate">
            ИД подписана
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-base font-bold font-mono text-emerald-700">
              {stats.signedIdLines}
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              из {stats.visibleLines}
            </span>
            {stats.visibleLines > 0 && (
              <span className="text-[10px] font-mono text-slate-400">
                · {signedPct}%
              </span>
            )}
          </div>
        </div>
        <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 shrink-0">
          <FileCheck2 className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
};
