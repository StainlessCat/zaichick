import React from 'react';
import { AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';
import {
  JournalCompletenessBanner,
  JournalGostTable,
  JournalStoTable,
  JournalToolbar,
  useWeldingJournals,
  WeldingJournalsViewProps,
} from './journals';

export const WeldingJournalsView: React.FC<WeldingJournalsViewProps> = (props) => {
  const { onEditJoint, pendingSyncCount = 0 } = props;
  const {
    standard,
    columnFilters,
    setColumnFilters,
    actionToast,
    setActionToast,
    currentRdCode,
    selectedLineKey,
    rdOptions,
    availableLines,
    activeLineDisplayLabel,
    lineWeldingAlert,
    handleSelectRd,
    handleSelectLine,
    handleSwitchStandard,
    handleApplyFilter,
    handleExportCsv,
    handleExportXlsx,
    baseChronologicalJoints,
    chronologicalJoints,
    journalCompleteness,
    isOfflineOrUnsynced,
    currentFormationDate,
    relevantJointsCount,
    gost32569Getters,
    stoGazpromGetters,
    getGostColWidth,
    handleGostResizeStart,
    handleGostAutoFit,
    handleResetGostWidths,
    hasCustomGostWidths,
    getStoColWidth,
    handleStoResizeStart,
    handleStoAutoFit,
    handleResetStoWidths,
    hasCustomStoWidths,
    selectedObjectName,
  } = useWeldingJournals(props);

  const materials = props.materials ?? [];
  const lrvCatalog = props.lrvCatalog ?? [];

  return (
    <div className="space-y-4 print-journal-container">
      {isOfflineOrUnsynced && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-3 no-print shadow-xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">
              ВНИМАНИЕ: Автономный режим (ожидает синхронизации {pendingSyncCount} изм.)
            </span>
            <p className="mt-0.5 text-amber-800 text-[11px]">
              Данные журнала в данный момент не подтверждены сервером СУБД PostgreSQL. Официальная печать и сдача журнала технадзору заблокированы до восстановления связи с сервером. Выгрузка доступна исключительно в виде черновика с водяным знаком.
            </p>
          </div>
        </div>
      )}

      {actionToast && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold flex items-center justify-between gap-2 no-print shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{actionToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionToast('')}
            className="text-emerald-700 hover:text-emerald-950 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Панель управления журналом (Блок 1: селекторы, форма стандарта, экспорт) */}
      <JournalToolbar
        currentRdCode={currentRdCode}
        rdOptions={rdOptions}
        selectedObjectName={selectedObjectName}
        onSelectRd={handleSelectRd}
        selectedLineKey={selectedLineKey}
        activeLineDisplayLabel={activeLineDisplayLabel}
        availableLines={availableLines}
        relevantJointsCount={relevantJointsCount}
        onSelectLine={handleSelectLine}
        lineWeldingAlert={lineWeldingAlert}
        standard={standard}
        onSwitchStandard={handleSwitchStandard}
        onExportXlsx={handleExportXlsx}
        onExportCsv={handleExportCsv}
      />

      {/* Официальный нормативный бланк выбранного журнала */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="px-6 py-4 bg-[#f8fafd] border-b border-slate-200 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-mono text-[#1e3799] font-semibold">
              {standard === 'ГОСТ 32569-2013'
                ? 'ГОСТ 32569-2013 (Форма журнала сварочных работ — 17 нормативных граф)'
                : 'СТО Газпром 15-1.1-002-2023 (Форма журнала сварочных работ — 49 нормативных граф)'}
            </div>
            <h3 className="font-display text-sm font-bold text-slate-900 mt-0.5">
              {standard === 'ГОСТ 32569-2013'
                ? 'ЖУРНАЛ СВАРКИ ТЕХНОЛОГИЧЕСКИХ СТАЛЬНЫХ ТРУБОПРОВОДОВ (ПО ГОСТ 32569-2013)'
                : 'ЖУРНАЛ СВАРОЧНЫХ РАБОТ (ПО ФОРМЕ СТО ГАЗПРОМ 15-1.1-002-2023)'}
            </h3>
            <p className="text-xs text-slate-600 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                Объект:{' '}
                <span className="font-medium text-slate-900">
                  {selectedObjectName === 'ALL' ? 'Сводный реестр (все объекты)' : selectedObjectName}
                </span>
              </span>
              <span>·</span>
              <span>
                Шифр РД:{' '}
                <span className="font-mono font-medium text-[#1e3799]">
                  {currentRdCode === 'ALL' ? 'Все шифры' : currentRdCode}
                </span>
              </span>
              <span>·</span>
              <span>
                Линия:{' '}
                <span className="font-mono font-medium text-[#1e3799]">
                  {selectedLineKey === 'ALL' ? 'Все линии' : activeLineDisplayLabel}
                </span>
              </span>
            </p>
          </div>
          <div className="text-right text-xs text-slate-500 font-mono flex flex-col sm:items-end gap-1">
            <div className="flex items-center gap-2">
              {Object.keys(columnFilters).length > 0 && (
                <button
                  type="button"
                  onClick={() => setColumnFilters({})}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-sky-50 border border-sky-200 text-xs font-semibold text-[#1e3799] hover:bg-sky-100 cursor-pointer font-sans"
                  title="Сбросить все фильтры столбцов"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Сбросить фильтры ({Object.keys(columnFilters).length})</span>
                </button>
              )}
              <span>
                Записей в журнале:{' '}
                <strong className="text-slate-800 font-bold">
                  {chronologicalJoints.length}
                </strong>
              </span>
            </div>
            <div>Дата формирования: {currentFormationDate}</div>
          </div>
        </div>

        <JournalCompletenessBanner
          journalCompleteness={journalCompleteness}
          totalJointsCount={chronologicalJoints.length}
        />

        <div className="overflow-x-auto overflow-y-auto min-h-[380px] max-h-[calc(100vh-235px)] print-journal-scroll table-scroll-container">
          {standard === 'ГОСТ 32569-2013' ? (
            <JournalGostTable
              chronologicalJoints={chronologicalJoints}
              baseChronologicalJoints={baseChronologicalJoints}
              materials={materials}
              lrvCatalog={lrvCatalog}
              columnFilters={columnFilters}
              onApplyFilter={handleApplyFilter}
              gost32569Getters={gost32569Getters}
              getGostColWidth={getGostColWidth}
              handleGostResizeStart={handleGostResizeStart}
              handleGostAutoFit={handleGostAutoFit}
              handleResetGostWidths={handleResetGostWidths}
              hasCustomGostWidths={hasCustomGostWidths}
              onEditJoint={onEditJoint}
              selectedLineKey={selectedLineKey}
              activeLineDisplayLabel={activeLineDisplayLabel}
            />
          ) : (
            <JournalStoTable
              chronologicalJoints={chronologicalJoints}
              baseChronologicalJoints={baseChronologicalJoints}
              lrvCatalog={lrvCatalog}
              columnFilters={columnFilters}
              onApplyFilter={handleApplyFilter}
              stoGazpromGetters={stoGazpromGetters}
              getStoColWidth={getStoColWidth}
              handleStoResizeStart={handleStoResizeStart}
              handleStoAutoFit={handleStoAutoFit}
              handleResetStoWidths={handleResetStoWidths}
              hasCustomStoWidths={hasCustomStoWidths}
              onEditJoint={onEditJoint}
              selectedLineKey={selectedLineKey}
              activeLineDisplayLabel={activeLineDisplayLabel}
            />
          )}
        </div>
      </div>
    </div>
  );
};
