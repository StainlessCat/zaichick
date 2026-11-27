import React, { useEffect } from 'react';
import {
  AlertTriangle,
  Download,
  ExternalLink,
  FileSpreadsheet,
  ShieldAlert,
  X,
} from 'lucide-react';
import { JournalStandard, WeldJoint } from '../../types/welding';
import { JournalCompletenessSummary } from '../../utils/journals';
import { Button } from '../ui';
import { pluralizeRu } from './types';

interface JournalExportConfirmModalProps {
  format: 'xlsx' | 'csv';
  standard: JournalStandard;
  objectLabel: string;
  rdLabel: string;
  lineLabel: string;
  periodLabel: string | null;
  totalRows: number;
  isOfflineOrUnsynced: boolean;
  isDbConnected: boolean;
  pendingSyncCount: number;
  completeness: JournalCompletenessSummary;
  jointsById: Map<string, WeldJoint>;
  onClose: () => void;
  onConfirmExport: () => void;
  onEditJoint: (joint: WeldJoint) => void;
  onFilterIncomplete: () => void;
}

export const JournalExportConfirmModal: React.FC<
  JournalExportConfirmModalProps
> = ({
  format,
  standard,
  objectLabel,
  rdLabel,
  lineLabel,
  periodLabel,
  totalRows,
  isOfflineOrUnsynced,
  isDbConnected,
  pendingSyncCount,
  completeness,
  jointsById,
  onClose,
  onConfirmExport,
  onEditJoint,
  onFilterIncomplete,
}) => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const { missingSummary, jointsWithMissingDataCount, missingItems } = completeness;
  const isDraft = isOfflineOrUnsynced || !completeness.isFullyComplete;

  const breakdown: Array<{ label: string; count: number }> = [
    { label: 'Без даты сварки', count: missingSummary.missingDates },
    { label: 'Без клейма сварщика', count: missingSummary.missingWelders },
    { label: 'Без техкарты', count: missingSummary.missingTechCards },
    { label: 'Первичный ВИК', count: missingSummary.missingVikReports },
    { label: 'Первичный НК', count: missingSummary.missingNdtReports },
    { label: 'Дублирующий НК', count: missingSummary.missingDupNdtReports },
    { label: 'Сведения о ремонте', count: missingSummary.missingRepairDetails },
    { label: 'ВИК после ремонта', count: missingSummary.missingRepairVikReports },
    { label: 'НК после ремонта', count: missingSummary.missingRepairNdtReports },
    { label: 'Дубл. НК после ремонта', count: missingSummary.missingRepairDupNdtReports },
    { label: 'Без ответственного мастера', count: missingSummary.missingResponsiblePerson },
  ].filter((item) => item.count > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[1px] p-4 no-print"
      role="dialog"
      aria-modal="true"
      aria-labelledby="journal-export-modal-title"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 bg-[#f8fafd] border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3
                id="journal-export-modal-title"
                className="text-sm font-bold text-slate-900 truncate"
              >
                Предпроверка перед выгрузкой журнала
              </h3>
              <p className="text-[11px] text-slate-500 truncate">
                {standard} · {format === 'xlsx' ? 'Excel' : 'CSV'} · {totalRows}{' '}
                {pluralizeRu(totalRows, 'запись', 'записи', 'записей')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            aria-label="Закрыть окно"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3.5 overflow-y-auto text-xs text-slate-700">
          {/* Область выгрузки */}
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2.5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
            <div>
              <span className="text-slate-500">Объект:</span>{' '}
              <span className="font-semibold text-slate-900">{objectLabel}</span>
            </div>
            <div>
              <span className="text-slate-500">Шифр РД:</span>{' '}
              <span className="font-mono font-semibold text-slate-900">{rdLabel}</span>
            </div>
            <div>
              <span className="text-slate-500">Линия:</span>{' '}
              <span className="font-mono font-semibold text-slate-900">{lineLabel}</span>
            </div>
            {periodLabel && (
              <div>
                <span className="text-slate-500">Период сварки:</span>{' '}
                <span className="font-mono font-semibold text-slate-900">{periodLabel}</span>
              </div>
            )}
          </div>

          {isOfflineOrUnsynced && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-950 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-bold">
                  {!isDbConnected
                    ? 'Нет подключения к серверу базы данных'
                    : `Ожидают синхронизации ${pendingSyncCount} ${pluralizeRu(
                        pendingSyncCount,
                        'изменение',
                        'изменения',
                        'изменений'
                      )}`}
                </div>
                <p className="text-[11px] text-amber-900">
                  Файл будет сформирован локально в браузере с пометкой черновика. Для официальной сдачи восстановите подключение к серверу.
                </p>
              </div>
            </div>
          )}

          {!completeness.isFullyComplete && (
            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-950 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="font-bold">
                  Обнаружены пропуски реквизитов в {jointsWithMissingDataCount} из{' '}
                  {totalRows} {pluralizeRu(totalRows, 'стыка', 'стыков', 'стыков')}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onFilterIncomplete();
                    onClose();
                  }}
                  className="text-[11px] font-semibold text-[#1e3799] hover:underline shrink-0 cursor-pointer"
                >
                  Отфильтровать в таблице
                </button>
              </div>

              {breakdown.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {breakdown.map((b) => (
                    <span
                      key={b.label}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/80 border border-amber-200 text-[11px] text-amber-950"
                    >
                      <span>{b.label}:</span>
                      <strong>{b.count}</strong>
                    </span>
                  ))}
                </div>
              )}

              {missingItems.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-amber-200/80">
                  <div className="text-[11px] font-semibold text-amber-900">
                    Стыки с пропусками — нажмите, чтобы открыть паспорт:
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                    {missingItems.slice(0, 12).map((item) => {
                      const joint = jointsById.get(item.jointId);
                      return (
                        <button
                          key={item.jointId}
                          type="button"
                          disabled={!joint}
                          onClick={() => {
                            if (joint) {
                              onClose();
                              onEditJoint(joint);
                            }
                          }}
                          className="w-full text-left px-2.5 py-1.5 rounded-md bg-white/90 hover:bg-white border border-amber-200/90 flex items-start justify-between gap-2 transition-colors cursor-pointer disabled:cursor-default"
                        >
                          <div className="min-w-0">
                            <span className="font-mono font-bold text-[#1e3799]">
                              Стык №{item.jointNumber}
                            </span>
                            {item.lineNumber && (
                              <span className="text-slate-500 ml-1.5 font-mono text-[10px]">
                                {item.lineNumber}
                              </span>
                            )}
                            <div className="text-[11px] text-slate-700 mt-0.5">
                              {item.missingFields.map((f) => f.label).join('; ')}
                            </div>
                          </div>
                          {joint && (
                            <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                          )}
                        </button>
                      );
                    })}
                    {missingItems.length > 12 && (
                      <div className="text-[11px] text-amber-800 px-1 pt-0.5">
                        И ещё {missingItems.length - 12}{' '}
                        {pluralizeRu(
                          missingItems.length - 12,
                          'стык',
                          'стыка',
                          'стыков'
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <p className="text-[11px] text-amber-900 leading-relaxed">
                Документ будет выгружен с отметкой «ЧЕРНОВИК» в шапке листа и имени файла. Выгрузка не заменяет проверку ответственного лица.
              </p>
            </div>
          )}
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Вернуться к заполнению
          </Button>
          <Button type="button" variant="primary" onClick={onConfirmExport}>
            {format === 'xlsx' ? (
              <FileSpreadsheet className="w-3.5 h-3.5" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>{isDraft ? 'Выгрузить черновик' : 'Выгрузить файл'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
