import React from 'react';
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
} from 'lucide-react';
import { JournalStandard } from '../../types/welding';
import { Button, FormField } from '../ui';
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
}) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-3 py-2 shadow-2xs flex flex-wrap items-end justify-between gap-2.5 no-print">
      {/* Левая группа: селекторы РД, линии, форма стандарта и метеомодуль */}
      <div className="flex flex-wrap items-end gap-2">
        {/* 1. Выбор шифра РД */}
        <FormField label="Шифр РД">
          <JournalRdSelector
            currentRdCode={currentRdCode}
            rdOptions={rdOptions}
            selectedObjectName={selectedObjectName}
            onSelectRd={onSelectRd}
          />
        </FormField>

        {/* 2. Выбор линии */}
        <FormField label="Линия">
          <JournalLineSelector
            selectedLineKey={selectedLineKey}
            activeLineDisplayLabel={activeLineDisplayLabel}
            availableLines={availableLines}
            currentRdCode={currentRdCode}
            selectedObjectName={selectedObjectName}
            relevantJointsCount={relevantJointsCount}
            onSelectLine={onSelectLine}
          />
        </FormField>

        {/* Оповещение: выбранная линия заварена не полностью */}
        {lineWeldingAlert && !lineWeldingAlert.isFullyWelded && (
          <div
            className="h-8 box-border inline-flex items-center gap-1.5 px-2.5 rounded-md bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold select-none shrink-0"
            title={`Линия заварена не полностью: ${lineWeldingAlert.welded} из ${lineWeldingAlert.total} стыков`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="whitespace-nowrap font-medium text-[11px]">
              Не заварено ({lineWeldingAlert.welded}/{lineWeldingAlert.total})
            </span>
          </div>
        )}

        <div className="h-5 w-px bg-slate-200 hidden lg:block mx-0.5" />

        {/* 3. Переключатель нормативной формы журнала */}
        <FormField label="Форма журнала">
          <div
            className="h-8 box-border flex items-center p-0.5 bg-slate-100 rounded-md border border-slate-300"
            role="group"
            aria-label="Выбор нормативной формы журнала"
          >
            <button
              type="button"
              onClick={() => onSwitchStandard('СТО Газпром 15-1.1-002-2023')}
              className={`h-full box-border px-2.5 rounded text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                standard === 'СТО Газпром 15-1.1-002-2023'
                  ? 'bg-[#1e3799] text-white shadow-2xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              СТО Газпром (49 граф)
            </button>
            <button
              type="button"
              onClick={() => onSwitchStandard('ГОСТ 32569-2013')}
              className={`h-full box-border px-2.5 rounded text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                standard === 'ГОСТ 32569-2013'
                  ? 'bg-[#1e3799] text-white shadow-2xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              ГОСТ 32569 (17 граф)
            </button>
          </div>
        </FormField>
      </div>

      {/* Правая группа: Экспорт */}
      <div className="flex flex-wrap items-end gap-1.5">
        <Button
          type="button"
          variant="primary"
          onClick={onExportXlsx}
          title="Выгрузить журнал сварочных работ в Excel"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Выгрузить в Excel</span>
        </Button>

        <Button
          type="button"
          variant="secondary"
          onClick={onExportCsv}
          title="Экспорт в CSV"
        >
          <Download className="w-3.5 h-3.5" />
          <span>CSV</span>
        </Button>
      </div>
    </div>
  );
};
