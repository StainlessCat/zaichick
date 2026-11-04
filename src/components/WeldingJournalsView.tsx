import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  RotateCcw,
  Search,
} from 'lucide-react';
import {
  JournalStandard,
  LRVItem,
  WeldingMaterialCertificate,
  WeldJoint,
} from '../types/welding';
import {
  formatDateDDMMYY,
  formatGost32569JournalRow,
  formatStoGazpromJournalRow,
  GOST_32569_2013_JOURNAL_COLUMNS,
  Gost32569ColumnKey,
  sortJointsChronologically,
  STO_GAZPROM_15_1_1_002_2023_COLUMNS,
  StoGazpromColumnKey,
  StoGazpromJournalColumnDef,
} from '../utils/weldingLogic';
import {
  exportWeldingJournalToExcel,
  triggerBlobDownload,
} from '../utils/excelUtils';
import { exportWeldingJournalToPdfA3 } from '../utils/pdfBookletGenerator';
import {
  applyTableColumnFiltersAndSort,
  TableColumnFilterHeader,
} from './TableColumnFilterPopover';
import { useResizableColumns } from '../utils/useResizableColumns';

interface WeldingJournalsViewProps {
  joints: WeldJoint[];
  materials?: WeldingMaterialCertificate[];
  lrvCatalog?: LRVItem[];
  selectedObjectName: string;
  selectedRdCode: string;
  onEditJoint: (joint: WeldJoint) => void;
}

const STO_COL_MAP: Record<StoGazpromColumnKey, StoGazpromJournalColumnDef> =
  Object.fromEntries(
    STO_GAZPROM_15_1_1_002_2023_COLUMNS.map((c) => [c.key, c])
  ) as Record<StoGazpromColumnKey, StoGazpromJournalColumnDef>;

export const WeldingJournalsView: React.FC<WeldingJournalsViewProps> = ({
  joints,
  materials = [],
  lrvCatalog = [],
  selectedObjectName,
  selectedRdCode,
  onEditJoint,
}) => {
  // По умолчанию открываем форму по СТО Газпром 15-1.1-002-2023 (49 граф)
  const [standard, setStandard] = useState<JournalStandard>(
    'СТО Газпром 15-1.1-002-2023'
  );
  const [onlyWelded, setOnlyWelded] = useState<boolean>(true);
  const [lineSearch, setLineSearch] = useState<string>('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>(null);
  const [actionToast, setActionToast] = useState<string>('');

  // Регулирование ширины столбцов журнала по ГОСТ 32569-2013
  const {
    columnWidths: gostColumnWidths,
    getColumnWidth: getGostColWidth,
    handleResizeStart: handleGostResizeStart,
    handleAutoFit: handleGostAutoFit,
    handleResetWidths: handleResetGostWidths,
    hasCustomWidths: hasCustomGostWidths,
  } = useResizableColumns({
    storageKey: 'zaychick_col_widths_journal_gost',
    defaultWidths: Object.fromEntries(
      GOST_32569_2013_JOURNAL_COLUMNS.map((c) => [c.key, c.minWidth])
    ),
  });

  // Регулирование ширины столбцов журнала по СТО Газпром 15-1.1-002-2023
  const {
    columnWidths: stoColumnWidths,
    getColumnWidth: getStoColWidth,
    handleResizeStart: handleStoResizeStart,
    handleAutoFit: handleStoAutoFit,
    handleResetWidths: handleResetStoWidths,
    hasCustomWidths: hasCustomStoWidths,
  } = useResizableColumns({
    storageKey: 'zaychick_col_widths_journal_sto',
    defaultWidths: Object.fromEntries(
      STO_GAZPROM_15_1_1_002_2023_COLUMNS.map((c) => [c.key, c.minWidth])
    ),
  });

  const showToast = (msg: string) => {
    setActionToast(msg);
    setTimeout(() => setActionToast(''), 4500);
  };

  const handleSwitchStandard = (nextStd: JournalStandard) => {
    setStandard(nextStd);
    setColumnFilters({});
    setSortConfig(null);
  };

  // Сортировка строго в хронологическом порядке по дате сварки
  const baseChronologicalJoints = useMemo(() => {
    const base = joints.filter((j) => {
      if (onlyWelded && !j.weldingDate) return false;
      if (lineSearch.trim()) {
        const q = lineSearch.trim().toLowerCase();
        return (
          j.lineNumber.toLowerCase().includes(q) ||
          j.jointNumber.toLowerCase().includes(q) ||
          j.welderStamp.toLowerCase().includes(q) ||
          j.welderFullName.toLowerCase().includes(q) ||
          (j.gostJointType || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
    return sortJointsChronologically(base);
  }, [joints, onlyWelded, lineSearch]);

  // Геттеры для всех 49 граф формы СТО Газпром 15-1.1-002-2023
  const stoGazpromGetters = useMemo<
    Record<StoGazpromColumnKey, (j: WeldJoint, idx: number) => string>
  >(() => {
    const map = {} as Record<
      StoGazpromColumnKey,
      (j: WeldJoint, idx: number) => string
    >;
    for (const col of STO_GAZPROM_15_1_1_002_2023_COLUMNS) {
      map[col.key] = (j: WeldJoint, idx: number) =>
        formatStoGazpromJournalRow(j, idx, lrvCatalog)[col.key];
    }
    return map;
  }, [lrvCatalog]);

  // Геттеры для всех 17 граф формы по ГОСТ 32569-2013
  const gost32569Getters = useMemo<
    Record<Gost32569ColumnKey, (j: WeldJoint, idx: number) => string>
  >(() => {
    const map = {} as Record<
      Gost32569ColumnKey,
      (j: WeldJoint, idx: number) => string
    >;
    for (const col of GOST_32569_2013_JOURNAL_COLUMNS) {
      map[col.key] = (j: WeldJoint, idx: number) =>
        formatGost32569JournalRow(j, idx, materials)[col.key];
    }
    return map;
  }, [materials]);

  const activeGetters =
    standard === 'ГОСТ 32569-2013' ? gost32569Getters : stoGazpromGetters;

  const chronologicalJoints = useMemo(
    () =>
      applyTableColumnFiltersAndSort(
        baseChronologicalJoints,
        columnFilters,
        activeGetters,
        sortConfig
      ),
    [baseChronologicalJoints, columnFilters, activeGetters, sortConfig]
  );

  const handleApplyFilter = (colKey: string, vals: string[] | undefined) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (vals === undefined) delete next[colKey];
      else next[colKey] = vals;
      return next;
    });
  };

  const handleSort = (colKey: string, direction: 'asc' | 'desc') => {
    setSortConfig({ key: colKey, direction });
  };

  const handleExportCsv = () => {
    const headers =
      standard === 'ГОСТ 32569-2013'
        ? GOST_32569_2013_JOURNAL_COLUMNS.map((c) => c.label)
        : STO_GAZPROM_15_1_1_002_2023_COLUMNS.map((c) => c.fullLabel);

    const rows = chronologicalJoints.map((j, idx) => {
      if (standard === 'ГОСТ 32569-2013') {
        return formatGost32569JournalRow(j, idx, materials).cells;
      }
      return formatStoGazpromJournalRow(j, idx, lrvCatalog).cells;
    });

    const csvContent =
      '\uFEFF' +
      [headers, ...rows]
        .map((r) =>
          r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';')
        )
        .join('\n');

    const fileName = `Журнал_сварки_${standard.replace(/\s+/g, '_')}.csv`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    triggerBlobDownload(blob, fileName);
    showToast(`Журнал (${chronologicalJoints.length} зап.) выгружен в файл «${fileName}».`);
  };

  const handleExportXlsx = () => {
    exportWeldingJournalToExcel(
      chronologicalJoints,
      standard,
      materials,
      lrvCatalog
    );
    showToast(
      `Книга Excel по форме «${standard}» (${chronologicalJoints.length} зап.) успешно сформирована и скачана.`
    );
  };

  const handlePrintOrExportPdfA3 = () => {
    const headers =
      standard === 'ГОСТ 32569-2013'
        ? GOST_32569_2013_JOURNAL_COLUMNS.map((c) => c.label)
        : STO_GAZPROM_15_1_1_002_2023_COLUMNS.map((c) => c.label);
    const colNumbers =
      standard === 'ГОСТ 32569-2013'
        ? GOST_32569_2013_JOURNAL_COLUMNS.map((c) => String(c.colNumber))
        : STO_GAZPROM_15_1_1_002_2023_COLUMNS.map((c) => String(c.colNumber));
    const rows = chronologicalJoints.map((j, idx) =>
      standard === 'ГОСТ 32569-2013'
        ? formatGost32569JournalRow(j, idx, materials).cells
        : formatStoGazpromJournalRow(j, idx, lrvCatalog).cells
    );

    exportWeldingJournalToPdfA3(
      standard,
      selectedObjectName,
      selectedRdCode,
      headers,
      colNumbers,
      rows
    );
    try {
      window.print();
    } catch {
      // ignore sandbox print restrictions
    }
    showToast(
      `Сформирован широкоформатный лист печати А3 (PDF) для журнала «${standard}» (${chronologicalJoints.length} зап.).`
    );
  };

  const currentFormationDate = formatDateDDMMYY(
    new Date().toISOString().slice(0, 10)
  );

  const renderStoHeaderCell = (
    colKey: StoGazpromColumnKey,
    rowSpan?: number,
    extraClassName = ''
  ) => {
    const col = STO_COL_MAP[colKey];
    const width = getStoColWidth(col.key, col.minWidth);
    return (
      <TableColumnFilterHeader
        key={col.key}
        columnKey={col.key}
        label={col.label}
        title={col.fullLabel}
        rows={baseChronologicalJoints}
        getValue={stoGazpromGetters[col.key]}
        activeFilters={columnFilters}
        onApplyFilter={handleApplyFilter}
        sortConfig={sortConfig}
        onSort={handleSort}
        rowSpan={rowSpan}
        width={width}
        minWidth={col.minWidth}
        onResizeStart={handleStoResizeStart}
        onAutoFit={() => handleStoAutoFit(col.key, col.minWidth)}
        className={`align-middle text-[11px] ${extraClassName}`}
      />
    );
  };

  return (
    <div className="space-y-4 print-journal-container">
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

      {/* Панель управления журналом */}
      <div className="bg-white rounded-xl border border-slate-200 px-3 py-2.5 flex flex-wrap items-center justify-between gap-3 no-print">
        {/* Переключатель формы журнала: СТО Газпром 15-1.1-002-2023 или ГОСТ 32569-2013 */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200"
            role="group"
            aria-label="Выбор нормативной формы журнала"
          >
            <button
              type="button"
              onClick={() => handleSwitchStandard('СТО Газпром 15-1.1-002-2023')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                standard === 'СТО Газпром 15-1.1-002-2023'
                  ? 'bg-[#1e3799] text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              Форма СТО Газпром 15-1.1-002-2023 (49 граф)
            </button>
            <button
              type="button"
              onClick={() => handleSwitchStandard('ГОСТ 32569-2013')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                standard === 'ГОСТ 32569-2013'
                  ? 'bg-[#1e3799] text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              Форма ГОСТ 32569-2013 (17 граф)
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportXlsx}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1e3799] text-white text-xs font-semibold hover:bg-[#15276e] transition-colors whitespace-nowrap cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Выгрузить (.XLSX)</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#1e3799]/30 bg-[#f0f5fc] text-[#1e3799] text-xs font-semibold hover:bg-sky-100 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>.CSV</span>
          </button>

          <button
            type="button"
            onClick={handlePrintOrExportPdfA3}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
            title="Скачать готовый PDF-лист формата А3 Альбомная и вызвать диалог печати"
          >
            <Printer className="w-4 h-4 text-[#1e3799]" />
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            <span>Печать / PDF (А3 Альбомная)</span>
          </button>
        </div>
      </div>

      {/* Полоса фильтрации и статуса хронологии */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1e3799] bg-[#e8f1fc] px-3 py-1.5 rounded-md border border-sky-200">
            <CalendarClock className="w-4 h-4" />
            <span>Хронологический порядок по дате сварки (ДД.ММ.ГГ)</span>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyWelded}
              onChange={(e) => setOnlyWelded(e.target.checked)}
              className="rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799]"
            />
            <span>Только сваренные стыки</span>
          </label>
          {Object.keys(columnFilters).length > 0 && (
            <button
              type="button"
              onClick={() => setColumnFilters({})}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-sky-50 border border-sky-200 text-xs font-semibold text-[#1e3799] hover:bg-sky-100"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>
                Сбросить фильтры столбцов ({Object.keys(columnFilters).length})
              </span>
            </button>
          )}
        </div>

        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={lineSearch}
            onChange={(e) => setLineSearch(e.target.value)}
            placeholder="Поиск по линии, стыку, клейму..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-[#1e3799] focus:bg-white"
          />
        </div>
      </div>

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
            <p className="text-xs text-slate-600 mt-0.5">
              Объект:{' '}
              <span className="font-medium">
                {selectedObjectName === 'ALL' ? 'Сводный реестр' : selectedObjectName}
              </span>
              {selectedRdCode !== 'ALL' && (
                <>
                  {' '}
                  · Шифр РД: <span className="font-mono">{selectedRdCode}</span>
                </>
              )}
            </p>
          </div>
          <div className="text-right text-xs text-slate-500 font-mono">
            <div>Записей в журнале: {chronologicalJoints.length}</div>
            <div>Дата формирования: {currentFormationDate}</div>
          </div>
        </div>

        <div className="overflow-x-auto min-h-[380px] print-journal-scroll">
          {standard === 'ГОСТ 32569-2013' ? (
            <div>
              <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[#1e3799] text-white text-left">
                  {GOST_32569_2013_JOURNAL_COLUMNS.map((col, idx) => {
                    const colWidth = getGostColWidth(col.key, col.minWidth);
                    return (
                      <TableColumnFilterHeader
                        key={col.key}
                        columnKey={col.key}
                        label={col.label}
                        rows={baseChronologicalJoints}
                        getValue={gost32569Getters[col.key]}
                        activeFilters={columnFilters}
                        onApplyFilter={handleApplyFilter}
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        width={colWidth}
                        minWidth={col.minWidth}
                        onResizeStart={handleGostResizeStart}
                        onAutoFit={() => handleGostAutoFit(col.key, col.minWidth)}
                        className={
                          idx === GOST_32569_2013_JOURNAL_COLUMNS.length - 1
                            ? 'border-r-0'
                            : ''
                        }
                      />
                    );
                  })}
                </tr>
                {/* Нормативная строка нумерации граф 1..17 по форме ГОСТ 32569-2013 */}
                <tr className="bg-[#15276e] text-sky-100 text-center font-mono text-[11px] font-bold border-t border-white/15">
                  {GOST_32569_2013_JOURNAL_COLUMNS.map((col, idx) => {
                    const colWidth = getGostColWidth(col.key, col.minWidth);
                    return (
                      <th
                        key={col.key}
                        style={{ width: colWidth, minWidth: colWidth }}
                        className={`py-1 px-2 border-r border-white/15 ${
                          idx === GOST_32569_2013_JOURNAL_COLUMNS.length - 1
                            ? 'border-r-0'
                            : ''
                        }`}
                      >
                        {col.colNumber}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {chronologicalJoints.map((j, index) => {
                  const row = formatGost32569JournalRow(j, index, materials);
                  const gostType = j.gostJointType?.trim() || 'С17';
                  return (
                    <tr
                      key={j.id}
                      className="hover:bg-[#e8f1fc]/60 transition-colors odd:bg-white even:bg-slate-50/60 align-top"
                    >
                      {/* Графа 1: № п/п */}
                      <td
                        style={{
                          width: getGostColWidth('col1', 55),
                          minWidth: getGostColWidth('col1', 55),
                        }}
                        className="py-2.5 px-2.5 font-mono text-center text-slate-900 border-r border-slate-200"
                      >
                        {row.col1}
                      </td>

                      {/* Графа 2: Обозначение сварного соединения по исполнительному чертежу, тип сварного соединения ГОСТ 16037 */}
                      <td
                        style={{
                          width: getGostColWidth('col2', 150),
                          minWidth: getGostColWidth('col2', 150),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 font-mono text-center text-slate-900 whitespace-nowrap"
                      >
                        <button
                          type="button"
                          onClick={() => onEditJoint(j)}
                          className="font-bold text-[#1e3799] hover:underline"
                          title="Открыть паспорт стыка"
                        >
                          {j.jointNumber}
                        </button>
                        , {gostType}
                      </td>

                      {/* Графа 3: Ф.И.О. сварщика, личное клеймо */}
                      <td
                        style={{
                          width: getGostColWidth('col3', 190),
                          minWidth: getGostColWidth('col3', 190),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 text-slate-900 whitespace-pre"
                      >
                        {row.col3}
                      </td>

                      {/* Графа 4: Марка стали (композиция марок сталей), НД, номера сертификатов */}
                      <td
                        style={{
                          width: getGostColWidth('col4', 210),
                          minWidth: getGostColWidth('col4', 210),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 text-slate-900 whitespace-pre"
                      >
                        {row.col4}
                      </td>

                      {/* Графа 5: Наружный диаметр элемента трубопровода и толщина стенки DнхS, мм */}
                      <td
                        style={{
                          width: getGostColWidth('col5', 120),
                          minWidth: getGostColWidth('col5', 120),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 font-mono text-center text-slate-900 whitespace-nowrap"
                      >
                        {row.col5}
                      </td>

                      {/* Графа 6: Дата сварки, температурные условия в рабочей зоне, °С */}
                      <td
                        style={{
                          width: getGostColWidth('col6', 130),
                          minWidth: getGostColWidth('col6', 130),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 font-mono text-slate-900 whitespace-nowrap"
                      >
                        {row.col6}
                      </td>

                      {/* Графа 7: Способ сварки */}
                      <td
                        style={{
                          width: getGostColWidth('col7', 100),
                          minWidth: getGostColWidth('col7', 100),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 font-mono text-center text-slate-900 whitespace-nowrap"
                      >
                        {row.col7}
                      </td>

                      {/* Графа 8: Сварочные материалы (марка электрода, сварочной проволоки, защитный газ, флюс), НД, №№ сертификатов */}
                      <td
                        style={{
                          width: getGostColWidth('col8', 210),
                          minWidth: getGostColWidth('col8', 210),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 text-slate-900 whitespace-pre"
                      >
                        {row.col8}
                      </td>

                      {/* Графа 9: Режим предварительного и сопутствующего подогрева */}
                      <td
                        style={{
                          width: getGostColWidth('col9', 130),
                          minWidth: getGostColWidth('col9', 130),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 font-mono text-center text-slate-900 whitespace-nowrap"
                      >
                        {row.col9}
                      </td>

                      {/* Графа 10: Отметка о контроле корня шва */}
                      <td
                        style={{
                          width: getGostColWidth('col10', 120),
                          minWidth: getGostColWidth('col10', 120),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 text-slate-900 whitespace-nowrap"
                      >
                        {row.col10}
                      </td>

                      {/* Графа 11: Стилоскопирование металла шва, N заключения, дата */}
                      <td
                        style={{
                          width: getGostColWidth('col11', 130),
                          minWidth: getGostColWidth('col11', 130),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 text-slate-900"
                      >
                        {row.col11}
                      </td>

                      {/* Графа 12: Ф.И.О. оператора термиста, личное клеймо */}
                      <td
                        style={{
                          width: getGostColWidth('col12', 120),
                          minWidth: getGostColWidth('col12', 120),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 text-slate-900 text-center"
                      >
                        {row.col12}
                      </td>

                      {/* Графа 13: № диаграммы по журналу термообработки сварных соединений */}
                      <td
                        style={{
                          width: getGostColWidth('col13', 120),
                          minWidth: getGostColWidth('col13', 120),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 font-mono text-slate-900 text-center"
                      >
                        {row.col13}
                      </td>

                      {/* Графа 14: Твердость металла шва, N заключения, дата */}
                      <td
                        style={{
                          width: getGostColWidth('col14', 130),
                          minWidth: getGostColWidth('col14', 130),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 text-slate-900"
                      >
                        {row.col14}
                      </td>

                      {/* Графа 15: Отметка о годности сварного соединения по внешнему осмотру и измерениям */}
                      <td
                        style={{
                          width: getGostColWidth('col15', 130),
                          minWidth: getGostColWidth('col15', 130),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 text-slate-900 whitespace-nowrap"
                      >
                        {row.col15}
                      </td>

                      {/* Графа 16: Способ и результаты неразрушающего контроля сварного соединения, N заключения, дата */}
                      <td
                        style={{
                          width: getGostColWidth('col16', 150),
                          minWidth: getGostColWidth('col16', 150),
                        }}
                        className="py-2.5 px-2.5 border-r border-slate-200 text-slate-900"
                      >
                        {row.col16}
                      </td>

                      {/* Графа 17: Результаты измерения ферритной фазы в металле шва, N заключения, дата */}
                      <td
                        style={{
                          width: getGostColWidth('col17', 130),
                          minWidth: getGostColWidth('col17', 130),
                        }}
                        className="py-2.5 px-2.5 text-slate-900"
                      >
                        {row.col17}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div>
                  Записей в журнале:{' '}
                  <span className="font-mono font-bold text-slate-800">
                    {chronologicalJoints.length}
                  </span>
                </div>
                {hasCustomGostWidths && (
                  <button
                    type="button"
                    onClick={handleResetGostWidths}
                    title="Сбросить ширину столбцов журнала ГОСТ 32569-2013"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-[11px] transition-colors shadow-2xs cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3 text-slate-400" />
                    <span>Сбросить ширину столбцов</span>
                  </button>
                )}
              </div>
              <div>
                Ширина столбцов регулируется перетаскиванием правой границы заголовка (двойной клик — автоподбор)
              </div>
            </div>
          </div>
        ) : (
            <div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  {/* УРОВЕНЬ 1 ШАПКИ СТО ГАЗПРОМ 15-1.1-002-2023 (49 ГРАФ) */}
                  <tr className="bg-[#1e3799] text-white text-left">
                    {/* Графы 1..10 (rowSpan=3) */}
                    {renderStoHeaderCell('col1', 3)}
                    {renderStoHeaderCell('col2', 3)}
                    {renderStoHeaderCell('col3', 3)}
                    {renderStoHeaderCell('col4', 3)}
                    {renderStoHeaderCell('col5', 3)}
                    {renderStoHeaderCell('col6', 3)}
                    {renderStoHeaderCell('col7', 3)}
                    {renderStoHeaderCell('col8', 3)}
                    {renderStoHeaderCell('col9', 3)}
                    {renderStoHeaderCell('col10', 3)}

                    {/* Группа граф 11..14: Маркировка сварного соединения */}
                    <th
                      colSpan={4}
                      className="px-2.5 py-2 text-center font-bold text-[11px] border-r border-b border-[#162a78] bg-[#1a3188]"
                    >
                      Маркировка сварного соединения
                    </th>

                    {/* Графы 15..18 (rowSpan=3) */}
                    {renderStoHeaderCell('col15', 3)}
                    {renderStoHeaderCell('col16', 3)}
                    {renderStoHeaderCell('col17', 3)}
                    {renderStoHeaderCell('col18', 3)}

                    {/* Группа граф 19..20: Соблюдение технологии */}
                    <th
                      colSpan={2}
                      className="px-2.5 py-2 text-center font-bold text-[11px] border-r border-b border-[#162a78] bg-[#1a3188]"
                    >
                      Соблюдение технологии
                    </th>

                    {/* Группа граф 21..31: Приемка сварного соединения */}
                    <th
                      colSpan={11}
                      className="px-2.5 py-2 text-center font-bold text-[11px] border-r border-b border-[#162a78] bg-[#1a3188]"
                    >
                      Приемка сварного соединения
                    </th>

                    {/* Группа граф 32..37: Сведения о проведении ремонта */}
                    <th
                      colSpan={6}
                      className="px-2.5 py-2 text-center font-bold text-[11px] border-r border-b border-[#162a78] bg-[#1a3188]"
                    >
                      Сведения о проведении ремонта
                    </th>

                    {/* Группа граф 38..48: Приемка сварного соединения после ремонта */}
                    <th
                      colSpan={11}
                      className="px-2.5 py-2 text-center font-bold text-[11px] border-r border-b border-[#162a78] bg-[#1a3188]"
                    >
                      Приемка сварного соединения после ремонта
                    </th>

                    {/* Графа 49: Примечание (rowSpan=3) */}
                    {renderStoHeaderCell('col49', 3, 'border-r-0')}
                  </tr>

                  {/* УРОВЕНЬ 2 ШАПКИ СТО ГАЗПРОМ 15-1.1-002-2023 */}
                  <tr className="bg-[#1e3799] text-white text-left">
                    {/* Графы 11..14 (rowSpan=2) */}
                    {renderStoHeaderCell('col11', 2)}
                    {renderStoHeaderCell('col12', 2)}
                    {renderStoHeaderCell('col13', 2)}
                    {renderStoHeaderCell('col14', 2)}

                    {/* Графы 19..20 (rowSpan=2) */}
                    {renderStoHeaderCell('col19', 2)}
                    {renderStoHeaderCell('col20', 2)}

                    {/* Подгруппы граф 21..31 (Приемка сварного соединения) */}
                    <th
                      colSpan={3}
                      className="px-2 py-1.5 text-center font-semibold text-[11px] border-r border-b border-[#162a78] bg-[#1b338c]"
                    >
                      по результатам контроля ВИК
                    </th>
                    <th
                      colSpan={4}
                      className="px-2 py-1.5 text-center font-semibold text-[10px] leading-snug border-r border-b border-[#162a78] bg-[#1b338c]"
                    >
                      по результатам контроля физическими методами или механическим испытаниям (заключение о годности сварного соединения, номер, дата заключения)
                    </th>
                    <th
                      colSpan={4}
                      className="px-2 py-1.5 text-center font-semibold text-[10px] leading-snug border-r border-b border-[#162a78] bg-[#1b338c]"
                    >
                      по результатам контроля физическими методами (заключение о годности сварного соединения, номер, дата заключения)
                    </th>

                    {/* Графы 32..37 (rowSpan=2 — Сведения о проведении ремонта) */}
                    {renderStoHeaderCell('col32', 2)}
                    {renderStoHeaderCell('col33', 2)}
                    {renderStoHeaderCell('col34', 2)}
                    {renderStoHeaderCell('col35', 2)}
                    {renderStoHeaderCell('col36', 2)}
                    {renderStoHeaderCell('col37', 2)}

                    {/* Подгруппы граф 38..48 (Приемка сварного соединения после ремонта) */}
                    <th
                      colSpan={3}
                      className="px-2 py-1.5 text-center font-semibold text-[11px] border-r border-b border-[#162a78] bg-[#1b338c]"
                    >
                      по результатам контроля ВИК
                    </th>
                    <th
                      colSpan={4}
                      className="px-2 py-1.5 text-center font-semibold text-[10px] leading-snug border-r border-b border-[#162a78] bg-[#1b338c]"
                    >
                      по результатам контроля физическими методами или механическим испытаниям (заключение о годности сварного соединения, номер, дата заключения)
                    </th>
                    <th
                      colSpan={4}
                      className="px-2 py-1.5 text-center font-semibold text-[10px] leading-snug border-r border-b border-[#162a78] bg-[#1b338c]"
                    >
                      по результатам контроля физическими методами (заключение о годности сварного соединения, номер, дата заключения)
                    </th>
                  </tr>

                  {/* УРОВЕНЬ 3 ШАПКИ СТО ГАЗПРОМ 15-1.1-002-2023 (листовые графы 21..31 и 38..48) */}
                  <tr className="bg-[#1e3799] text-white text-left">
                    {renderStoHeaderCell('col21')}
                    {renderStoHeaderCell('col22')}
                    {renderStoHeaderCell('col23')}
                    {renderStoHeaderCell('col24')}
                    {renderStoHeaderCell('col25')}
                    {renderStoHeaderCell('col26')}
                    {renderStoHeaderCell('col27')}
                    {renderStoHeaderCell('col28')}
                    {renderStoHeaderCell('col29')}
                    {renderStoHeaderCell('col30')}
                    {renderStoHeaderCell('col31')}

                    {renderStoHeaderCell('col38')}
                    {renderStoHeaderCell('col39')}
                    {renderStoHeaderCell('col40')}
                    {renderStoHeaderCell('col41')}
                    {renderStoHeaderCell('col42')}
                    {renderStoHeaderCell('col43')}
                    {renderStoHeaderCell('col44')}
                    {renderStoHeaderCell('col45')}
                    {renderStoHeaderCell('col46')}
                    {renderStoHeaderCell('col47')}
                    {renderStoHeaderCell('col48')}
                  </tr>

                  {/* НОРМАТИВНАЯ СТРОКА НУМЕРАЦИИ ГРАФ 1..49 ПО ФОРМЕ СТО ГАЗПРОМ 15-1.1-002-2023 */}
                  <tr className="bg-[#15276e] text-sky-100 text-center font-mono text-[11px] font-bold border-t border-white/15">
                    {STO_GAZPROM_15_1_1_002_2023_COLUMNS.map((col, idx) => {
                      const colWidth = getStoColWidth(col.key, col.minWidth);
                      return (
                        <th
                          key={col.key}
                          style={{ width: colWidth, minWidth: colWidth }}
                          className={`py-1 px-2 border-r border-white/15 ${
                            idx === STO_GAZPROM_15_1_1_002_2023_COLUMNS.length - 1
                              ? 'border-r-0'
                              : ''
                          }`}
                        >
                          {col.colNumber}
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200">
                  {chronologicalJoints.map((j, index) => {
                    const row = formatStoGazpromJournalRow(j, index, lrvCatalog);
                    return (
                      <tr
                        key={j.id}
                        className="hover:bg-[#e8f1fc]/60 transition-colors odd:bg-white even:bg-slate-50/60 align-top"
                      >
                        {STO_GAZPROM_15_1_1_002_2023_COLUMNS.map((col, cIdx) => {
                          const cellVal = row[col.key];
                          const colWidth = getStoColWidth(col.key, col.minWidth);
                          const isLast =
                            cIdx ===
                            STO_GAZPROM_15_1_1_002_2023_COLUMNS.length - 1;

                          // Графа 13: номер сварного соединения в километре (на схеме, чертеже, в подобъекте²) — кликабельная ссылка на паспорт стыка
                          if (col.key === 'col13') {
                            return (
                              <td
                                key={col.key}
                                style={{ width: colWidth, minWidth: colWidth }}
                                className="py-2.5 px-2.5 border-r border-slate-200 font-mono text-center whitespace-nowrap"
                              >
                                <button
                                  type="button"
                                  onClick={() => onEditJoint(j)}
                                  className="font-bold text-[#1e3799] hover:underline"
                                  title="Открыть паспорт стыка"
                                >
                                  {j.jointNumber}
                                </button>
                              </td>
                            );
                          }

                          // Графа 14: дополнительная маркировка сварного соединения ("Я" для углового сварного шва, "н/п" в остальных случаях)
                          if (col.key === 'col14') {
                            return (
                              <td
                                key={col.key}
                                style={{ width: colWidth, minWidth: colWidth }}
                                className="py-2.5 px-2.5 border-r border-slate-200 font-mono font-bold text-center text-slate-900 whitespace-nowrap"
                              >
                                {cellVal}
                              </td>
                            );
                          }

                          const isMultiline =
                            col.key === 'col4' ||
                            col.key === 'col5' ||
                            col.key === 'col6' ||
                            col.key === 'col8' ||
                            col.key === 'col9' ||
                            col.key === 'col10' ||
                            col.key === 'col17';

                          const isCentered =
                            col.colNumber <= 5 ||
                            col.colNumber === 7 ||
                            col.colNumber === 10 ||
                            (col.colNumber >= 11 && col.colNumber <= 15) ||
                            col.colNumber >= 20;

                          return (
                            <td
                              key={col.key}
                              style={{ width: colWidth, minWidth: colWidth }}
                              className={`py-2.5 px-2.5 text-slate-900 ${
                                isLast ? '' : 'border-r border-slate-200'
                              } ${isMultiline ? 'whitespace-pre' : 'whitespace-nowrap'} ${
                                isCentered ? 'text-center font-mono' : ''
                              }`}
                            >
                              {cellVal}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div>
                    Записей в журнале:{' '}
                    <span className="font-mono font-bold text-slate-800">
                      {chronologicalJoints.length}
                    </span>
                  </div>
                  {hasCustomStoWidths && (
                    <button
                      type="button"
                      onClick={handleResetStoWidths}
                      title="Сбросить ширину столбцов журнала СТО Газпром 15-1.1-002-2023"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-[11px] transition-colors shadow-2xs cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3 text-slate-400" />
                      <span>Сбросить ширину столбцов</span>
                    </button>
                  )}
                </div>
                <div>
                  ¹ Для разнотолщинных элементов указывается толщина стенки каждого свариваемого элемента · ² В графе 14 для угловых сварных швов (У2..У20 по ГОСТ 16037) указывается «Я», в остальных случаях — «н/п»
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

