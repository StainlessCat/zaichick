import React, { useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Filter,
} from 'lucide-react';
import { WeldJoint } from '../../types/welding';
import { validateJournalCompleteness } from '../../utils/journals';
import { JournalQuickFilter, pluralizeRu } from './types';

interface JournalCompletenessBannerProps {
  journalCompleteness: ReturnType<typeof validateJournalCompleteness>;
  totalJointsCount: number;
  quickFilter: JournalQuickFilter;
  onToggleIncompleteFilter: () => void;
  jointsById: Map<string, WeldJoint>;
  onEditJoint: (joint: WeldJoint) => void;
}

export const JournalCompletenessBanner: React.FC<
  JournalCompletenessBannerProps
> = ({
  journalCompleteness,
  totalJointsCount,
  quickFilter,
  onToggleIncompleteFilter,
  jointsById,
  onEditJoint,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (journalCompleteness.isFullyComplete) return null;

  const { missingSummary, jointsWithMissingDataCount, missingItems } =
    journalCompleteness;
  const isFilteringIncomplete = quickFilter === 'incomplete';

  return (
    <div className="mx-4 sm:mx-6 my-3 p-3.5 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-2.5 shadow-2xs no-print">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1 min-w-0">
            <div className="font-bold flex flex-wrap items-center gap-2">
              <span>
                Контроль полноты: в {jointsWithMissingDataCount} из{' '}
                {totalJointsCount}{' '}
                {pluralizeRu(totalJointsCount, 'стыка', 'стыков', 'стыков')} не
                заполнены обязательные реквизиты
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200/70 text-amber-900 font-semibold">
                Требуется заполнение
              </span>
            </div>
            <div className="text-[11px] text-amber-900 flex flex-wrap gap-x-3 gap-y-1">
              {missingSummary.missingDates > 0 && (
                <span>
                  • Без даты: <strong>{missingSummary.missingDates}</strong>
                </span>
              )}
              {missingSummary.missingWelders > 0 && (
                <span>
                  • Без клейма: <strong>{missingSummary.missingWelders}</strong>
                </span>
              )}
              {missingSummary.missingTechCards > 0 && (
                <span>
                  • Без ТК: <strong>{missingSummary.missingTechCards}</strong>
                </span>
              )}
              {missingSummary.missingVikReports > 0 && (
                <span>
                  • Первичный ВИК:{' '}
                  <strong>{missingSummary.missingVikReports}</strong>
                </span>
              )}
              {missingSummary.missingNdtReports > 0 && (
                <span>
                  • Первичный НК:{' '}
                  <strong>{missingSummary.missingNdtReports}</strong>
                </span>
              )}
              {missingSummary.missingDupNdtReports > 0 && (
                <span>
                  • Повторный НК:{' '}
                  <strong>{missingSummary.missingDupNdtReports}</strong>
                </span>
              )}
              {missingSummary.missingRepairDetails > 0 && (
                <span>
                  • Реквизиты ремонта:{' '}
                  <strong>{missingSummary.missingRepairDetails}</strong>
                </span>
              )}
              {missingSummary.missingRepairVikReports > 0 && (
                <span>
                  • ВИК после ремонта:{' '}
                  <strong>{missingSummary.missingRepairVikReports}</strong>
                </span>
              )}
              {missingSummary.missingRepairNdtReports > 0 && (
                <span>
                  • НК после ремонта:{' '}
                  <strong>{missingSummary.missingRepairNdtReports}</strong>
                </span>
              )}
              {missingSummary.missingRepairDupNdtReports > 0 && (
                <span>
                  • Повторный НК после ремонта:{' '}
                  <strong>{missingSummary.missingRepairDupNdtReports}</strong>
                </span>
              )}
              {missingSummary.missingResponsiblePerson > 0 && (
                <span>
                  • Без мастера:{' '}
                  <strong>{missingSummary.missingResponsiblePerson}</strong>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onToggleIncompleteFilter}
            className={`h-7 px-2.5 rounded-md border text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              isFilteringIncomplete
                ? 'bg-[#1e3799] text-white border-[#1e3799]'
                : 'bg-white text-amber-950 border-amber-300 hover:bg-amber-100/80'
            }`}
          >
            <Filter className="w-3 h-3" />
            <span>
              {isFilteringIncomplete
                ? 'Показать все стыки'
                : 'Только с пропусками'}
            </span>
          </button>

          {missingItems.length > 0 && (
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="h-7 px-2.5 rounded-md border border-amber-300 bg-white hover:bg-amber-100/80 text-amber-950 text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>Список пропусков</span>
              {isExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>

      {isExpanded && missingItems.length > 0 && (
        <div className="pt-2 border-t border-amber-200/90 space-y-1.5">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5 max-h-52 overflow-y-auto pr-1">
            {missingItems.slice(0, 60).map((item) => {
              const joint = jointsById.get(item.jointId);
              return (
                <button
                  key={item.jointId}
                  type="button"
                  disabled={!joint}
                  onClick={() => {
                    if (joint) onEditJoint(joint);
                  }}
                  className="text-left px-2.5 py-1.5 rounded-md bg-white/95 hover:bg-white border border-amber-200 hover:border-[#1e3799]/40 flex items-start justify-between gap-2 transition-colors cursor-pointer disabled:cursor-default"
                  title="Открыть паспорт стыка для заполнения"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-[#1e3799]">
                        №{item.jointNumber}
                      </span>
                      {item.lineNumber && (
                        <span className="font-mono text-[10px] text-slate-500 truncate">
                          {item.lineNumber}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-700 leading-snug mt-0.5 line-clamp-2">
                      {item.missingFields.map((f) => f.label).join('; ')}
                    </div>
                  </div>
                  {joint && (
                    <ExternalLink className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                  )}
                </button>
              );
            })}
          </div>
          {missingItems.length > 60 && (
            <div className="text-[11px] text-amber-800">
              Показаны первые 60 из {missingItems.length} проблемных стыков. Используйте фильтр «Только с пропусками» для просмотра всех записей в таблице.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
