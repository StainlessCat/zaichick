import React from 'react';
import { BookOpen, RotateCcw } from 'lucide-react';
import {
  LRVItem,
  WeldingMaterialCertificate,
  WeldJoint,
} from '../../types/welding';
import {
  formatGost32569JournalRow,
  getMissingPassportFields,
  GOST_32569_2013_JOURNAL_COLUMNS,
  Gost32569ColumnKey,
} from '../../utils/weldingLogic';
import { TableColumnFilterHeader } from '../TableColumnFilterPopover';
import { RecordStatusBadge } from '../RecordStatusControls';

interface JournalGostTableProps {
  chronologicalJoints: WeldJoint[];
  baseChronologicalJoints: WeldJoint[];
  materials: WeldingMaterialCertificate[];
  lrvCatalog: LRVItem[];
  columnFilters: Record<string, string[]>;
  onApplyFilter: (colKey: string, vals: string[] | undefined) => void;
  gost32569Getters: Record<Gost32569ColumnKey, (j: WeldJoint, idx: number) => string>;
  getGostColWidth: (key: string, minWidth?: number) => number;
  handleGostResizeStart: (
    e: React.PointerEvent,
    key: string,
    startWidth: number,
    minWidth?: number
  ) => void;
  handleGostAutoFit: (key: string, minWidth?: number) => void;
  handleResetGostWidths: () => void;
  hasCustomGostWidths: boolean;
  onEditJoint: (joint: WeldJoint) => void;
  selectedLineKey: string;
  activeLineDisplayLabel: string;
}

export const JournalGostTable: React.FC<JournalGostTableProps> = ({
  chronologicalJoints,
  baseChronologicalJoints,
  materials,
  lrvCatalog,
  columnFilters,
  onApplyFilter,
  gost32569Getters,
  getGostColWidth,
  handleGostResizeStart,
  handleGostAutoFit,
  handleResetGostWidths,
  hasCustomGostWidths,
  onEditJoint,
  selectedLineKey,
  activeLineDisplayLabel,
}) => {
  return (
    <div>
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 z-20 shadow-xs">
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
                  onApplyFilter={onApplyFilter}
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
          {chronologicalJoints.length === 0 && (
            <tr>
              <td
                colSpan={17}
                className="py-14 text-center text-xs text-slate-400 bg-white"
              >
                <div className="flex flex-col items-center justify-center gap-1.5">
                  <BookOpen className="w-8 h-8 text-slate-300 stroke-1" />
                  <span className="font-semibold text-slate-700">
                    В журнале пока нет записей
                  </span>
                  <span className="text-[11px] text-slate-400 max-w-md">
                    {selectedLineKey !== 'ALL'
                      ? `По выбранной линии «${activeLineDisplayLabel}» ещё не внесены выполненные сварочные работы с датами сварки.`
                      : 'В текущей выборке отсутствуют сваренные стыки с заполненной датой сварки.'}
                  </span>
                </div>
              </td>
            </tr>
          )}
          {chronologicalJoints.map((j, index) => {
            const row = formatGost32569JournalRow(j, index, materials, lrvCatalog);
            const gostType = j.gostJointType?.trim() || 'С17';
            const missingFields = getMissingPassportFields(j);
            const isIncomplete = missingFields.length > 0;
            return (
              <tr
                key={j.id}
                title={
                  isIncomplete
                    ? `Внимание: дата сварки внесена, но не заполнены обязательные поля паспорта (${missingFields.length}): ${missingFields.join(', ')}`
                    : undefined
                }
                className={`transition-colors align-top ${
                  isIncomplete
                    ? 'bg-amber-50/80 hover:bg-amber-100/80'
                    : 'hover:bg-[#e8f1fc]/60 odd:bg-white even:bg-slate-50/60'
                }`}
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
                  <div className="inline-flex flex-col items-center gap-0.5">
                    <div>
                      <button
                        type="button"
                        onClick={() => onEditJoint(j)}
                        className="font-bold text-[#1e3799] hover:underline cursor-pointer"
                        title="Открыть паспорт стыка"
                      >
                        {j.jointNumber}
                      </button>
                      , {gostType}
                    </div>
                    {j.recordStatus && j.recordStatus !== 'DRAFT' && (
                      <span className="no-print">
                        <RecordStatusBadge status={j.recordStatus} compact />
                      </span>
                    )}
                  </div>
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
  );
};
