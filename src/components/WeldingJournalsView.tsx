import React, { useCallback, useRef } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Compass,
  RotateCcw,
} from 'lucide-react';
import {
  JournalCompletenessBanner,
  JournalExportConfirmModal,
  JournalGostTable,
  JournalMetaModal,
  JournalStoTable,
  JournalToolbar,
  pluralizeRu,
  STO_SECTION_JUMPS,
  STO_STICKY_COL_WIDTH,
  useWeldingJournals,
  WeldingJournalsViewProps,
} from './journals';

export const WeldingJournalsView: React.FC<WeldingJournalsViewProps> = (
  props
) => {
  const { onEditJoint } = props;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const {
    standard,
    columnFilters,
    setColumnFilters,
    searchQuery,
    setSearchQuery,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    quickFilter,
    setQuickFilter,
    quickFilterCounts,
    hideEmptyRepairCols,
    toggleHideEmptyRepairCols,
    effectiveHideRepairCols,
    repairedJointsCount,
    toast,
    dismissToast,
    exportModal,
    setExportModal,
    handleConfirmModalExport,
    isMetaModalOpen,
    setIsMetaModalOpen,
    titleMeta,
    handleSaveTitleMeta,
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
    handlePrint,
    hasActiveFilters,
    handleResetAllFilters,
    baseChronologicalJoints,
    chronologicalJoints,
    journalCompleteness,
    missingByJointId,
    jointsById,
    isOfflineOrUnsynced,
    isDbConnected,
    pendingSyncCount,
    currentFormationDate,
    relevantJointsCount,
    periodDisplayLabel,
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
    materials,
    lrvCatalog,
  } = useWeldingJournals(props);

  const objectDisplayLabel =
    selectedObjectName === 'ALL' ? 'Сводный реестр по всем объектам' : selectedObjectName;
  const rdDisplayLabel = currentRdCode === 'ALL' ? 'Все шифры' : currentRdCode;
  const lineDisplayLabel =
    selectedLineKey === 'ALL' ? 'Все линии' : activeLineDisplayLabel;

  const hasTitleMetaFilled = Boolean(
    titleMeta.journalNumber ||
      titleMeta.customerName ||
      titleMeta.contractorName ||
      titleMeta.responsibleKeeper
  );

  const handleJumpToStoSection = useCallback((colKey: string) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (colKey === 'col1') {
      container.scrollTo({ left: 0, behavior: 'smooth' });
      return;
    }
    const targetCell = container.querySelector<HTMLElement>(
      `th[data-sto-col="${colKey}"]`
    );
    if (!targetCell) return;
    const containerRect = container.getBoundingClientRect();
    const cellRect = targetCell.getBoundingClientRect();
    const targetLeft =
      cellRect.left -
      containerRect.left +
      container.scrollLeft -
      STO_STICKY_COL_WIDTH -
      4;
    container.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
  }, []);

  const visibleStoJumps = effectiveHideRepairCols
    ? STO_SECTION_JUMPS.filter((item) => !item.isRepairSection)
    : STO_SECTION_JUMPS;

  const toastStyles =
    toast?.variant === 'error'
      ? {
          wrap: 'bg-rose-50 border-rose-300 text-rose-950',
          icon: <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />,
          close: 'text-rose-700 hover:text-rose-950',
        }
      : toast?.variant === 'warning'
        ? {
            wrap: 'bg-amber-50 border-amber-300 text-amber-950',
            icon: <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />,
            close: 'text-amber-700 hover:text-amber-950',
          }
        : {
            wrap: 'bg-emerald-50 border-emerald-300 text-emerald-950',
            icon: <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />,
            close: 'text-emerald-700 hover:text-emerald-950',
          };

  return (
    <div className="space-y-4 print-journal-container">
      {isOfflineOrUnsynced && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-3 no-print shadow-xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">
              {!isDbConnected
                ? 'Нет подключения к серверу базы данных'
                : `Ожидают синхронизации ${pendingSyncCount} ${pluralizeRu(
                    pendingSyncCount,
                    'изменение',
                    'изменения',
                    'изменений'
                  )}`}
            </span>
            <p className="mt-0.5 text-amber-800 text-[11px]">
              Данные журнала не подтверждены сервером базы данных. Выгрузка доступна в виде локального черновика с пометкой в шапке и имени файла.
            </p>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 no-print shadow-xs ${toastStyles.wrap}`}
        >
          <div className="flex items-center gap-2">
            {toastStyles.icon}
            <span>{toast.message}</span>
          </div>
          <button
            type="button"
            onClick={dismissToast}
            className={`font-bold cursor-pointer ${toastStyles.close}`}
            aria-label="Скрыть уведомление"
          >
            ✕
          </button>
        </div>
      )}

      {/* Панель управления журналом */}
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
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        quickFilter={quickFilter}
        quickFilterCounts={quickFilterCounts}
        onQuickFilterChange={setQuickFilter}
        hideEmptyRepairCols={hideEmptyRepairCols}
        effectiveHideRepairCols={effectiveHideRepairCols}
        repairedJointsCount={repairedJointsCount}
        onToggleHideEmptyRepairCols={toggleHideEmptyRepairCols}
        hasTitleMetaFilled={hasTitleMetaFilled}
        onOpenMetaModal={() => setIsMetaModalOpen(true)}
        onPrint={handlePrint}
        onExportXlsx={handleExportXlsx}
        onExportCsv={handleExportCsv}
        hasActiveFilters={hasActiveFilters}
        onResetAllFilters={handleResetAllFilters}
      />

      {/* Официальный нормативный бланк выбранного журнала */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="px-6 py-4 bg-[#f8fafd] border-b border-slate-200 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="text-xs font-mono text-[#1e3799] font-semibold flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>
                {standard === 'ГОСТ 32569-2013'
                  ? 'ГОСТ 32569-2013 · 17 нормативных граф'
                  : 'СТО Газпром 15-1.1-002-2023 · 49 нормативных граф'}
              </span>
              {titleMeta.journalNumber && (
                <>
                  <span className="text-slate-300">|</span>
                  <span>Журнал № {titleMeta.journalNumber}</span>
                </>
              )}
            </div>
            <h3 className="font-display text-sm font-bold text-slate-900">
              {standard === 'ГОСТ 32569-2013'
                ? 'ЖУРНАЛ СВАРКИ ТЕХНОЛОГИЧЕСКИХ СТАЛЬНЫХ ТРУБОПРОВОДОВ'
                : 'ЖУРНАЛ СВАРОЧНЫХ РАБОТ'}
            </h3>
            <p className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                Объект:{' '}
                <span className="font-medium text-slate-900">
                  {objectDisplayLabel}
                </span>
              </span>
              <span>·</span>
              <span>
                Шифр РД:{' '}
                <span className="font-mono font-medium text-[#1e3799]">
                  {rdDisplayLabel}
                </span>
              </span>
              <span>·</span>
              <span>
                Линия:{' '}
                <span className="font-mono font-medium text-[#1e3799]">
                  {lineDisplayLabel}
                </span>
              </span>
              {periodDisplayLabel && (
                <>
                  <span>·</span>
                  <span>
                    Период сварки:{' '}
                    <span className="font-mono font-medium text-slate-900">
                      {periodDisplayLabel}
                    </span>
                  </span>
                </>
              )}
            </p>
            {(titleMeta.customerName ||
              titleMeta.contractorName ||
              titleMeta.responsibleKeeper) && (
              <p className="text-[11px] text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                {titleMeta.customerName && (
                  <span>
                    Заказчик:{' '}
                    <span className="font-medium text-slate-800">
                      {titleMeta.customerName}
                    </span>
                  </span>
                )}
                {titleMeta.contractorName && (
                  <span>
                    Подрядчик:{' '}
                    <span className="font-medium text-slate-800">
                      {titleMeta.contractorName}
                    </span>
                  </span>
                )}
                {titleMeta.responsibleKeeper && (
                  <span>
                    Ответственный за ведение:{' '}
                    <span className="font-medium text-slate-800">
                      {titleMeta.responsibleKeeper}
                    </span>
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="text-right text-xs text-slate-500 font-mono flex flex-col sm:items-end gap-1 shrink-0">
            <div className="flex items-center gap-2">
              {Object.keys(columnFilters).length > 0 && (
                <button
                  type="button"
                  onClick={() => setColumnFilters({})}
                  className="no-print inline-flex items-center gap-1 px-2.5 py-1 rounded bg-sky-50 border border-sky-200 text-xs font-semibold text-[#1e3799] hover:bg-sky-100 cursor-pointer font-sans"
                  title="Сбросить все фильтры столбцов"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>
                    Фильтры столбцов · {Object.keys(columnFilters).length}
                  </span>
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
          quickFilter={quickFilter}
          onToggleIncompleteFilter={() =>
            setQuickFilter(quickFilter === 'incomplete' ? 'all' : 'incomplete')
          }
          jointsById={jointsById}
          onEditJoint={onEditJoint}
        />

        {/* Панель быстрого перехода по разделам 49-графного журнала СТО Газпром */}
        {standard === 'СТО Газпром 15-1.1-002-2023' && (
          <div className="px-4 py-1.5 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center gap-1.5 text-[11px] no-print">
            <span className="inline-flex items-center gap-1 text-slate-500 font-semibold mr-1">
              <Compass className="w-3.5 h-3.5 text-[#1e3799]" />
              <span>Разделы:</span>
            </span>
            {visibleStoJumps.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => handleJumpToStoSection(section.colKey)}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white border border-slate-200 hover:border-[#1e3799]/50 hover:bg-[#f0f5fc] text-slate-700 hover:text-[#1e3799] font-medium transition-colors cursor-pointer"
                title={`Перейти к графам ${section.rangeLabel}`}
              >
                <span>{section.label}</span>
                <span className="font-mono text-[10px] text-slate-400">
                  {section.rangeLabel}
                </span>
              </button>
            ))}
          </div>
        )}

        <div
          ref={scrollContainerRef}
          className="overflow-x-auto overflow-y-auto min-h-[380px] max-h-[calc(100vh-235px)] print-journal-scroll table-scroll-container"
        >
          {standard === 'ГОСТ 32569-2013' ? (
            <JournalGostTable
              chronologicalJoints={chronologicalJoints}
              baseChronologicalJoints={baseChronologicalJoints}
              materials={materials}
              lrvCatalog={lrvCatalog}
              missingByJointId={missingByJointId}
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
              missingByJointId={missingByJointId}
              hideRepairCols={effectiveHideRepairCols}
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

        {/* Подписной лист для печатной формы */}
        <div className="print-only px-6 py-4 border-t border-slate-300 text-[10px] text-slate-800">
          <div className="grid grid-cols-2 gap-8 mt-2">
            <div>
              <div className="font-semibold">
                Ответственный за ведение журнала сварочных работ:
              </div>
              <div className="mt-4 border-b border-slate-500 pb-0.5 flex items-end justify-between">
                <span>{titleMeta.responsibleKeeper || '\u00A0'}</span>
                <span className="text-[9px] text-slate-500">
                  подпись / Ф.И.О.
                </span>
              </div>
            </div>
            <div>
              <div className="font-semibold">
                Представитель строительного контроля заказчика:
              </div>
              <div className="mt-4 border-b border-slate-500 pb-0.5 flex items-end justify-between">
                <span>{'\u00A0'}</span>
                <span className="text-[9px] text-slate-500">
                  подпись / Ф.И.О.
                </span>
              </div>
            </div>
          </div>
          <div className="mt-3 text-[9px] text-slate-500 flex items-center justify-between">
            <span>Дата формирования: {currentFormationDate}</span>
            <span>Записей в журнале: {chronologicalJoints.length}</span>
          </div>
        </div>
      </div>

      {exportModal && (
        <JournalExportConfirmModal
          format={exportModal.format}
          standard={standard}
          objectLabel={objectDisplayLabel}
          rdLabel={rdDisplayLabel}
          lineLabel={lineDisplayLabel}
          periodLabel={periodDisplayLabel}
          totalRows={chronologicalJoints.length}
          isOfflineOrUnsynced={isOfflineOrUnsynced}
          isDbConnected={isDbConnected}
          pendingSyncCount={pendingSyncCount}
          completeness={journalCompleteness}
          jointsById={jointsById}
          onClose={() => setExportModal(null)}
          onConfirmExport={handleConfirmModalExport}
          onEditJoint={onEditJoint}
          onFilterIncomplete={() => setQuickFilter('incomplete')}
        />
      )}

      {isMetaModalOpen && (
        <JournalMetaModal
          initialMeta={titleMeta}
          objectLabel={objectDisplayLabel}
          onSave={handleSaveTitleMeta}
          onClose={() => setIsMetaModalOpen(false)}
        />
      )}
    </div>
  );
};
