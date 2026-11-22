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
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300 select-none ${className}`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>Годен к монтажу</span>
        </span>
      );
    case 'partial':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300 select-none ${className}`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>Частичный допуск</span>
        </span>
      );
    case 'rejected':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-300 select-none ${className}`}
        >
          <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
          <span>Выявлен брак</span>
        </span>
      );
    case 'replaced':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-300 select-none ${className}`}
        >
          <RefreshCw className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          <span>Согласована замена</span>
        </span>
      );
    case 'pending':
    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300 select-none ${className}`}
        >
          <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
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
}

export const MaterialBalanceIndicator: React.FC<MaterialBalanceIndicatorProps> = ({
  acceptedQty,
  totalSpecQty,
  unit,
  rejectedQty = 0,
}) => {
  const percent = totalSpecQty > 0 ? Math.min(100, Math.round((acceptedQty / totalSpecQty) * 100)) : 0;
  const isFull = acceptedQty >= totalSpecQty && rejectedQty === 0;
  const hasRejection = rejectedQty > 0;

  return (
    <div className="flex flex-col gap-1 min-w-[130px]">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-700">
          {acceptedQty} из {totalSpecQty} {unit}
        </span>
        <span
          className={`font-semibold ${
            isFull
              ? 'text-emerald-700'
              : hasRejection
              ? 'text-rose-700'
              : 'text-slate-500'
          }`}
        >
          {percent}%
        </span>
      </div>
      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden flex">
        <div
          className={`h-full transition-all duration-300 ${
            isFull
              ? 'bg-emerald-500'
              : hasRejection
              ? 'bg-amber-500'
              : 'bg-blue-600'
          }`}
          style={{ width: `${percent}%` }}
        />
        {hasRejection && (
          <div
            className="h-full bg-rose-500"
            style={{
              width: `${Math.min(100 - percent, Math.round((rejectedQty / totalSpecQty) * 100))}%`,
            }}
          />
        )}
      </div>
    </div>
  );
};
