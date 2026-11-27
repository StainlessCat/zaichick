import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { ExecutiveDocRow } from '../../types/executiveDocs';

export interface ExecutiveDocsSignConfirmModalProps {
  row: ExecutiveDocRow | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ExecutiveDocsSignConfirmModal: React.FC<ExecutiveDocsSignConfirmModalProps> = ({
  row,
  onCancel,
  onConfirm,
}) => {
  useEffect(() => {
    if (!row) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [row, onCancel]);

  if (!row) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={`Подтверждение подписания ИД линии ${row.lineNumber}`}
    >
      <div
        className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 bg-amber-50 border-b border-amber-200 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900">
                Обнаружены незакрытые требования
              </h2>
              <p className="text-xs text-slate-600 mt-0.5 truncate">
                Линия <span className="font-mono font-semibold text-slate-900">{row.lineNumber}</span>
                <span className="mx-1.5" aria-hidden="true">·</span>
                <span className="font-mono">{row.rdCode}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Закрыть"
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-slate-800 hover:bg-amber-100 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-600 leading-relaxed">
            По данной линии ещё не выполнены обязательные условия готовности комплекта исполнительной документации:
          </p>

          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
            {row.readinessBlockers.map((blocker) => (
              <li
                key={blocker.key}
                className="px-3.5 py-2 flex items-center justify-between gap-3 text-xs bg-white"
              >
                <span className="font-semibold text-slate-800 shrink-0">{blocker.label}</span>
                <span className="text-rose-700 text-right font-mono tabular-nums">
                  {blocker.detail}
                </span>
              </li>
            ))}
          </ul>

          <p className="text-[11px] text-slate-500">
            Если комплект всё же подписан с замечаниями, строка получит предупреждающую отметку до полного закрытия блокеров.
          </p>
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-8 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer transition-colors whitespace-nowrap"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-8 px-3.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-xs font-semibold text-white cursor-pointer transition-colors whitespace-nowrap"
          >
            Подписать с замечаниями
          </button>
        </div>
      </div>
    </div>
  );
};
