import React from 'react';
import { CheckCircle2, AlertTriangle, Clock, XCircle, RefreshCw } from 'lucide-react';
import { MaterialControlStatus } from '../../types/materialControl';

interface MaterialControlBadgeProps {
  status: MaterialControlStatus;
  className?: string;
}

export const MaterialControlBadge: React.FC<MaterialControlBadgeProps> = ({
  status,
  className = '',
}) => {
  switch (status) {
    case 'accepted':
      return (
        <span
          className={`inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 whitespace-nowrap select-none ${className}`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>Годен к монтажу</span>
        </span>
      );
    case 'partial':
      return (
        <span
          className={`inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 whitespace-nowrap select-none ${className}`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>Частичный допуск</span>
        </span>
      );
    case 'rejected':
      return (
        <span
          className={`inline-flex items-center gap-1.5 text-[11px] font-semibold text-rose-700 whitespace-nowrap select-none ${className}`}
        >
          <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
          <span>Выявлен брак</span>
        </span>
      );
    case 'replaced':
      return (
        <span
          className={`inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700 whitespace-nowrap select-none ${className}`}
        >
          <RefreshCw className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          <span>Заменена по письму</span>
        </span>
      );
    case 'pending':
    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 whitespace-nowrap select-none ${className}`}
        >
          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>Ожидает контроля</span>
        </span>
      );
  }
};

interface MaterialBalanceIndicatorProps {
  acceptedQty: number;
  totalSpecQty: number;
  unit: string;
  rejectedQty?: number;
  replacedQty?: number;
}

export const MaterialBalanceIndicator: React.FC<MaterialBalanceIndicatorProps> = ({
  acceptedQty,
  totalSpecQty,
  unit,
  rejectedQty = 0,
  replacedQty = 0,
}) => {
  const coveredQty = acceptedQty + replacedQty;
  const acceptedPct =
    totalSpecQty > 0 ? Math.min(100, Math.round((acceptedQty / totalSpecQty) * 100)) : 0;
  const replacedPct =
    totalSpecQty > 0
      ? Math.min(100 - acceptedPct, Math.round((replacedQty / totalSpecQty) * 100))
      : 0;
  const rejectedPct =
    totalSpecQty > 0
      ? Math.min(100 - acceptedPct - replacedPct, Math.round((rejectedQty / totalSpecQty) * 100))
      : 0;
  const totalCoveredPct = Math.min(100, acceptedPct + replacedPct);
  const isFull = totalSpecQty > 0 && coveredQty >= totalSpecQty && rejectedQty === 0;
  const hasRejection = rejectedQty > 0;

  return (
    <div className="flex flex-col gap-1 min-w-[116px]">
      <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums">
        <span className="font-medium text-slate-700 whitespace-nowrap">
          {coveredQty} / {totalSpecQty} {unit}
        </span>
        <span
          className={`font-semibold whitespace-nowrap ${
            isFull
              ? 'text-emerald-700'
              : hasRejection
              ? 'text-rose-700'
              : totalCoveredPct > 0
              ? 'text-amber-700'
              : 'text-slate-400'
          }`}
        >
          {totalCoveredPct}%
        </span>
      </div>
      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden flex">
        {acceptedPct > 0 && (
          <div
            className={`h-full transition-all duration-200 ${
              isFull
                ? 'bg-emerald-500'
                : hasRejection
                ? 'bg-amber-500'
                : 'bg-[#1e3799]'
            }`}
            style={{ width: `${acceptedPct}%` }}
          />
        )}
        {replacedPct > 0 && (
          <div
            className="h-full bg-indigo-500 transition-all duration-200"
            style={{ width: `${replacedPct}%` }}
          />
        )}
        {rejectedPct > 0 && (
          <div
            className="h-full bg-rose-500 transition-all duration-200"
            style={{ width: `${rejectedPct}%` }}
          />
        )}
      </div>
    </div>
  );
};
