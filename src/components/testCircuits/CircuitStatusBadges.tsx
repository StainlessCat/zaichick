import React from 'react';
import { AlertTriangle, CheckCircle2, Clock, FileCheck2, FileText } from 'lucide-react';
import type { CircuitTestStatus, SriStatus } from '../../types/welding';
import { CIRCUIT_TEST_STATUS_LABELS, SRI_STATUS_LABELS } from '../../utils/testCircuitCalc';

export const SriStatusBadge: React.FC<{ status: SriStatus; compact?: boolean }> = ({
  status,
  compact = false,
}) => {
  const label = SRI_STATUS_LABELS[status] || status;
  const size = compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]';

  if (status === 'APPROVED') {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded font-semibold border bg-emerald-50 text-emerald-800 border-emerald-300 whitespace-nowrap ${size}`}
      >
        <FileCheck2 className="w-3 h-3 text-emerald-600 shrink-0" />
        <span>{label}</span>
      </span>
    );
  }

  if (status === 'DEVELOPED') {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded font-semibold border bg-sky-50 text-sky-800 border-sky-300 whitespace-nowrap ${size}`}
      >
        <FileText className="w-3 h-3 text-sky-600 shrink-0" />
        <span>{label}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-semibold border bg-slate-100 text-slate-700 border-slate-300 whitespace-nowrap ${size}`}
    >
      <Clock className="w-3 h-3 text-slate-500 shrink-0" />
      <span>{label}</span>
    </span>
  );
};

export const CircuitTestStatusBadge: React.FC<{
  status: CircuitTestStatus;
  compact?: boolean;
}> = ({ status, compact = false }) => {
  const label = CIRCUIT_TEST_STATUS_LABELS[status] || status;
  const size = compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]';

  if (status === 'TESTED') {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded font-semibold border bg-emerald-600 text-white border-emerald-700 whitespace-nowrap ${size}`}
      >
        <CheckCircle2 className="w-3 h-3 shrink-0" />
        <span>{label}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-semibold border bg-white text-slate-700 border-slate-300 whitespace-nowrap ${size}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
      <span>{label}</span>
    </span>
  );
};

export const ReadinessMiniBar: React.FC<{
  percent: number;
  primaryText: string;
  secondaryText?: string;
  defectCount?: number;
}> = ({ percent, primaryText, secondaryText, defectCount = 0 }) => {
  const clamped = Math.max(0, Math.min(100, percent));
  const barColor =
    clamped >= 100
      ? 'bg-emerald-600'
      : clamped >= 50
        ? 'bg-[#1e3799]'
        : clamped > 0
          ? 'bg-sky-500'
          : 'bg-slate-300';

  return (
    <div className="min-w-[138px] space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-[11px] font-mono tabular-nums">
        <span className="font-semibold text-slate-800 whitespace-nowrap">{primaryText}</span>
        <span
          className={`font-bold ${
            clamped >= 100 ? 'text-emerald-700' : 'text-[#1e3799]'
          }`}
        >
          {clamped.toFixed(1)}%
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {(secondaryText || defectCount > 0) && (
        <div className="flex items-center justify-between gap-1.5 text-[10px]">
          {secondaryText ? (
            <span className="text-slate-500 font-mono tabular-nums truncate">
              {secondaryText}
            </span>
          ) : (
            <span />
          )}
          {defectCount > 0 && (
            <span
              className="inline-flex items-center gap-0.5 text-red-700 font-bold whitespace-nowrap"
              title="Есть стыки с неисправленным браком"
            >
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span>Брак: {defectCount}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
};
