import React from 'react';
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
} from 'lucide-react';
import { JournalStandard } from '../../types/welding';
import { JournalLineSelector } from './JournalLineSelector';
import { JournalRdSelector } from './JournalRdSelector';
import { JournalLineOption, JournalRdOption, LineWeldingAlert } from './types';

interface JournalToolbarProps {
  currentRdCode: string;
  rdOptions: JournalRdOption[];
  selectedObjectName: string;
  onSelectRd: (rdCode: string) => void;
  selectedLineKey: string;
  activeLineDisplayLabel: string;
  availableLines: JournalLineOption[];
  relevantJointsCount: number;
  onSelectLine: (lineKey: string) => void;
  lineWeldingAlert: LineWeldingAlert | null;
  standard: JournalStandard;
  onSwitchStandard: (standard: JournalStandard) => void;
  onExportXlsx: () => void;
  onExportCsv: () => void;
  onPrintOrExportPdfA3: () => void;
}

export const JournalToolbar: React.FC<JournalToolbarProps> = ({
  currentRdCode,
  rdOptions,
  selectedObjectName,
  onSelectRd,
  selectedLineKey,
  activeLineDisplayLabel,
  availableLines,
  relevantJointsCount,
  onSelectLine,
  lineWeldingAlert,
  standard,
  onSwitchStandard,
  onExportXlsx,
  onExportCsv,
  onPrintOrExportPdfA3,
}) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2.5 no-print">
      {/* Селекторы шифра РД и линии, и переключатель нормативной формы */}
      <div className="flex flex-wrap items-center gap-2">
        {/* 1. Выбор шифра РД */}
        <JournalRdSelector
          currentRdCode={currentRdCode}
          rdOptions={rdOptions}
          selectedObjectName={selectedObjectName}
          onSelectRd={onSelectRd}
        />

        {/* 2. Выбор линии */}
        <JournalLineSelector
          selectedLineKey={selectedLineKey}
          activeLineDisplayLabel={activeLineDisplayLabel}
          availableLines={availableLines}
          currentRdCode={currentRdCode}
          selectedObjectName={selectedObjectName}
          relevantJointsCount={relevantJointsCount}
          onSelectLine={onSelectLine}
        />

        {/* Оповещение: выбранная линия заварена не полностью (иконка в первом блоке) */}
        {lineWeldingAlert && !lineWeldingAlert.isFullyWelded && (
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold shadow-2xs select-none"
            title={`Внимание: выбранная линия заварена не полностью!\n• Всего стыков на линии: ${lineWeldingAlert.total}\n• Сварено: ${lineWeldingAlert.welded}\n• Не заварено: ${lineWeldingAlert.unweldedCount}${
              lineWeldingAlert.unweldedJointNumbers.length > 0
                ? ` (№: ${lineWeldingAlert.unweldedJointNumbers.slice(0, 10).join(', ')}${lineWeldingAlert.unweldedJointNumbers.length > 10 ? '...' : ''})`
                : ''
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="whitespace-nowrap font-medium">
              Линия не заварена ({lineWeldingAlert.welded}/{lineWeldingAlert.total})
            </span>
          </div>
        )}

        <div className="h-5 w-px bg-slate-200 hidden sm:block mx-0.5" />

        {/* 3. Переключатель нормативной формы журнала */}
        <div
          className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200"
          role="group"
          aria-label="Выбор нормативной формы журнала"
        >
          <button
            type="button"
            onClick={() => onSwitchStandard('СТО Газпром 15-1.1-002-2023')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              standard === 'СТО Газпром 15-1.1-002-2023'
                ? 'bg-[#1e3799] text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            Форма СТО Газпром 15-1.1-002-2023 (49 граф)
          </button>
          <button
            type="button"
            onClick={() => onSwitchStandard('ГОСТ 32569-2013')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              standard === 'ГОСТ 32569-2013'
                ? 'bg-[#1e3799] text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            Форма ГОСТ 32569-2013 (17 граф)
          </button>
        </div>
      </div>

      {/* Экспорт и печать */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onExportXlsx}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#1e3799] text-white text-xs font-semibold hover:bg-[#15276e] transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Выгрузить (.XLSX)</span>
        </button>

        <button
          type="button"
          onClick={onExportCsv}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1e3799]/30 bg-[#f0f5fc] text-[#1e3799] text-xs font-semibold hover:bg-sky-100 transition-colors whitespace-nowrap cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>.CSV</span>
        </button>

        <button
          type="button"
          onClick={onPrintOrExportPdfA3}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
          title="Скачать готовый PDF-лист формата А3 Альбомная и вызвать диалог печати"
        >
          <Printer className="w-4 h-4 text-[#1e3799]" />
          <FileText className="w-3.5 h-3.5 text-slate-500" />
          <span>Печать / PDF (А3 Альбомная)</span>
        </button>
      </div>
    </div>
  );
};
