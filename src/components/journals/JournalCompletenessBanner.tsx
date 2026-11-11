import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { validateJournalCompleteness } from '../../utils/journals';

interface JournalCompletenessBannerProps {
  journalCompleteness: ReturnType<typeof validateJournalCompleteness>;
  totalJointsCount: number;
}

export const JournalCompletenessBanner: React.FC<
  JournalCompletenessBannerProps
> = ({ journalCompleteness, totalJointsCount }) => {
  if (journalCompleteness.isFullyComplete) return null;

  const { missingSummary, jointsWithMissingDataCount } = journalCompleteness;

  return (
    <div className="mx-6 my-3 p-3.5 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-950 flex items-start gap-3 shadow-xs">
      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
      <div className="space-y-1">
        <div className="font-bold flex items-center gap-2">
          <span>
            Контроль полноты: в {jointsWithMissingDataCount} из {totalJointsCount} стыков не заполнены обязательные реквизиты
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
              • Первичный ВИК: <strong>{missingSummary.missingVikReports}</strong>
            </span>
          )}
          {missingSummary.missingNdtReports > 0 && (
            <span>
              • Первичный НК: <strong>{missingSummary.missingNdtReports}</strong>
            </span>
          )}
          {missingSummary.missingDupNdtReports > 0 && (
            <span>
              • Повторный НК: <strong>{missingSummary.missingDupNdtReports}</strong>
            </span>
          )}
          {missingSummary.missingRepairDetails > 0 && (
            <span>
              • Реквизиты ремонта: <strong>{missingSummary.missingRepairDetails}</strong>
            </span>
          )}
          {missingSummary.missingRepairVikReports > 0 && (
            <span>
              • ВИК после ремонта: <strong>{missingSummary.missingRepairVikReports}</strong>
            </span>
          )}
          {missingSummary.missingRepairNdtReports > 0 && (
            <span>
              • НК после ремонта: <strong>{missingSummary.missingRepairNdtReports}</strong>
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
              • Без мастера: <strong>{missingSummary.missingResponsiblePerson}</strong>
            </span>
          )}
        </div>
        <p className="text-[10px] text-amber-800 leading-relaxed pt-0.5">
          Выгрузка чистового документа не заменяет проверку ответственного лица. При экспорте с пропусками файл маркируется как черновик.
        </p>
      </div>
    </div>
  );
};
