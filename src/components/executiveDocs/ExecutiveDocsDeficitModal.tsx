import React, { useEffect } from 'react';
import { AlertTriangle, ExternalLink, FlaskConical, PackageSearch, X } from 'lucide-react';
import type { ExecutiveDocRow } from '../../types/executiveDocs';

export type ExecutiveDocDeficitModalKind = 'ndt' | 'vk';

export interface ExecutiveDocsDeficitModalProps {
  row: ExecutiveDocRow | null;
  kind: ExecutiveDocDeficitModalKind;
  onClose: () => void;
  onOpenLineInRegistry?: (uniqueLineId: string) => void;
  onOpenLaboratory?: () => void;
  onOpenLrvCatalog?: () => void;
}

export const ExecutiveDocsDeficitModal: React.FC<ExecutiveDocsDeficitModalProps> = ({
  row,
  kind,
  onClose,
  onOpenLineInRegistry,
  onOpenLaboratory,
  onOpenLrvCatalog,
}) => {
  useEffect(() => {
    if (!row) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [row, onClose]);

  if (!row) return null;

  const isNdt = kind === 'ndt';

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={
        isNdt
          ? `Дефицит по НК линии ${row.lineNumber}`
          : `Дефицит ВК линии ${row.lineNumber}`
      }
    >
      <div
        className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900">
              {isNdt ? 'Дефицит по контролю НК' : 'Дефицит входного контроля материалов'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              Линия <span className="font-mono font-semibold text-slate-800">{row.lineNumber}</span>
              <span className="mx-1.5" aria-hidden="true">·</span>
              <span className="font-mono">{row.rdCode}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
          {isNdt ? (
            <>
              {row.ndtMethodStats.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {row.ndtMethodStats.map((stat) => (
                    <div
                      key={stat.method}
                      className="border border-slate-200 rounded-lg px-3 py-2 bg-slate-50/70"
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span className="font-semibold text-slate-800">{stat.method}</span>
                        <span className="font-mono tabular-nums">{stat.planPct}%</span>
                      </div>
                      <div className="mt-1 flex items-baseline justify-between gap-2">
                        <span className="font-mono tabular-nums text-xs font-semibold text-slate-900">
                          {stat.passed} / {stat.required}
                        </span>
                        <span
                          className={`font-mono tabular-nums text-[11px] font-semibold ${
                            stat.deficit > 0 ? 'text-rose-700' : 'text-emerald-700'
                          }`}
                        >
                          {stat.deficit > 0 ? `−${stat.deficit}` : 'ОК'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {row.ndtDeficitDetails.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  По сваренным стыкам линии дефицит НК отсутствует.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-left">
                        <th className="px-3 py-2 font-semibold w-24">№ стыка</th>
                        <th className="px-3 py-2 font-semibold w-36">Незакрытые методы</th>
                        <th className="px-3 py-2 font-semibold">Причина</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {row.ndtDeficitDetails.map((item) => (
                        <tr key={item.jointId} className="hover:bg-slate-50/70">
                          <td className="px-3 py-2 font-mono tabular-nums font-semibold text-slate-900">
                            {item.jointNumber}
                          </td>
                          <td className="px-3 py-2 font-mono text-rose-700 font-semibold">
                            {item.missingMethods.join(', ')}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            <span className="inline-flex items-center gap-1.5">
                              {item.isDefect && (
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                              )}
                              <span>{item.reason}</span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                <span>
                  Всего проблемных позиций:{' '}
                  <strong className="font-mono tabular-nums text-rose-700">
                    {row.vkDeficitCount}
                  </strong>
                </span>
                {row.unlinkedVkCount > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>
                      Не привязаны к Базе материалов:{' '}
                      <strong className="font-mono tabular-nums text-amber-700">
                        {row.unlinkedVkCount}
                      </strong>
                    </span>
                  </>
                )}
              </div>

              {row.vkDeficitItems.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  Все использованные позиции имеют утверждённый акт входного контроля.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-left">
                        <th className="px-3 py-2 font-semibold w-36">Код ЛРВ</th>
                        <th className="px-3 py-2 font-semibold">Наименование</th>
                        <th className="px-3 py-2 font-semibold w-44">Статус</th>
                        <th className="px-3 py-2 font-semibold w-28">Стыки</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {row.vkDeficitItems.map((item) => {
                        const isUnlinked = item.reason === 'unlinked';
                        return (
                          <tr key={item.id} className="hover:bg-slate-50/70">
                            <td className="px-3 py-2 font-mono text-slate-900 font-medium">
                              {item.lrvCode}
                            </td>
                            <td className="px-3 py-2 text-slate-800">{item.shortName}</td>
                            <td
                              className={`px-3 py-2 font-medium ${
                                isUnlinked ? 'text-amber-700' : 'text-rose-700'
                              }`}
                            >
                              {isUnlinked ? 'Не найдена в базе' : 'Нет акта ВК'}
                            </td>
                            <td className="px-3 py-2 font-mono tabular-nums text-slate-600">
                              {item.jointNumbers && item.jointNumbers.length > 0
                                ? item.jointNumbers.slice(0, 6).join(', ') +
                                  (item.jointNumbers.length > 6
                                    ? ` +${item.jointNumbers.length - 6}`
                                    : '')
                                : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {onOpenLineInRegistry && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenLineInRegistry(row.uniqueLineId);
                }}
                className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer transition-colors whitespace-nowrap"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Открыть в реестре стыков</span>
              </button>
            )}
            {isNdt && onOpenLaboratory && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenLaboratory();
                }}
                className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-[#1e3799] hover:bg-[#15276e] text-xs font-semibold text-white cursor-pointer transition-colors whitespace-nowrap"
              >
                <FlaskConical className="w-3.5 h-3.5" />
                <span>Перейти в лабораторию НК</span>
              </button>
            )}
            {!isNdt && onOpenLrvCatalog && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenLrvCatalog();
                }}
                className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-[#1e3799] hover:bg-[#15276e] text-xs font-semibold text-white cursor-pointer transition-colors whitespace-nowrap"
              >
                <PackageSearch className="w-3.5 h-3.5" />
                <span>Перейти в базу материалов</span>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer transition-colors whitespace-nowrap"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
