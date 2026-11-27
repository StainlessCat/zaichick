import React, { useMemo } from 'react';
import { BookOpen, RotateCcw } from 'lucide-react';
import { LRVItem, WeldJoint } from '../../types/welding';
import {
  formatStoGazpromJournalRow,
  STO_GAZPROM_15_1_1_002_2023_COLUMNS,
  StoGazpromColumnKey,
  StoGazpromJournalColumnDef,
} from '../../utils/weldingLogic';
import { isJointRepaired, JournalJointMissingItem } from '../../utils/journals';
import { TableColumnFilterHeader } from '../TableColumnFilterPopover';
import { RecordStatusBadge } from '../RecordStatusControls';

interface JournalStoTableProps {
  chronologicalJoints: WeldJoint[];
  baseChronologicalJoints: WeldJoint[];
  lrvCatalog: LRVItem[];
  missingByJointId: Map<string, JournalJointMissingItem>;
  hideRepairCols: boolean;
  columnFilters: Record<string, string[]>;
  onApplyFilter: (colKey: string, vals: string[] | undefined) => void;
  stoGazpromGetters: Record<
    StoGazpromColumnKey,
    (j: WeldJoint, idx: number) => string
  >;
  getStoColWidth: (key: string, minWidth?: number) => number;
  handleStoResizeStart: (
    e: React.PointerEvent,
    key: string,
    startWidth: number,
    minWidth?: number
  ) => void;
  handleStoAutoFit: (key: string, minWidth?: number) => void;
  handleResetStoWidths: () => void;
  hasCustomStoWidths: boolean;
  onEditJoint: (joint: WeldJoint) => void;
  selectedLineKey: string;
  activeLineDisplayLabel: string;
}

const STO_COL_MAP: Record<StoGazpromColumnKey, StoGazpromJournalColumnDef> =
  Object.fromEntries(
    STO_GAZPROM_15_1_1_002_2023_COLUMNS.map((c) => [c.key, c])
  ) as Record<StoGazpromColumnKey, StoGazpromJournalColumnDef>;

export const STO_STICKY_COL_WIDTH = 112;

export const JournalStoTable: React.FC<JournalStoTableProps> = ({
  chronologicalJoints,
  baseChronologicalJoints,
  lrvCatalog,
  missingByJointId,
  hideRepairCols,
  columnFilters,
  onApplyFilter,
  stoGazpromGetters,
  getStoColWidth,
  handleStoResizeStart,
  handleStoAutoFit,
  handleResetStoWidths,
  hasCustomStoWidths,
  onEditJoint,
  selectedLineKey,
  activeLineDisplayLabel,
}) => {
  const visibleColumns = useMemo(() => {
    if (!hideRepairCols) return STO_GAZPROM_15_1_1_002_2023_COLUMNS;
    return STO_GAZPROM_15_1_1_002_2023_COLUMNS.filter(
      (c) => c.colNumber < 32 || c.colNumber === 49
    );
  }, [hideRepairCols]);

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
        onApplyFilter={onApplyFilter}
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
    <div>
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 z-20 shadow-xs">
          {/* УРОВЕНЬ 1 ШАПКИ СТО ГАЗПРОМ 15-1.1-002-2023 */}
          <tr className="bg-[#1e3799] text-white text-left">
            {/* Закреплённый экранный идентификатор строки (скрывается при печати) */}
            <th
              rowSpan={3}
              style={{
                position: 'sticky',
                left: 0,
                zIndex: 35,
                width: STO_STICKY_COL_WIDTH,
                minWidth: STO_STICKY_COL_WIDTH,
              }}
              className="no-print journal-sticky-col bg-[#162a78] text-white text-center font-bold text-[11px] px-2 py-2 border-r border-b border-[#0f1f5c] shadow-[2px_0_5px_-1px_rgba(15,23,42,0.3)] align-middle"
              title="Закреплённый идентификатор стыка для удобной прокрутки 49 граф"
            >
              № · Стык
            </th>

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

            {!hideRepairCols && (
              <>
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
              </>
            )}

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

            {!hideRepairCols && (
              <>
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
              </>
            )}
          </tr>

          {/* УРОВЕНЬ 3 ШАПКИ СТО ГАЗПРОМ 15-1.1-002-2023 */}
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

            {!hideRepairCols && (
              <>
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
              </>
            )}
          </tr>

          {/* НОРМАТИВНАЯ СТРОКА НУМЕРАЦИИ ГРАФ 1..49 ПО ФОРМЕ СТО ГАЗПРОМ 15-1.1-002-2023 */}
          <tr className="bg-[#15276e] text-sky-100 text-center font-mono text-[11px] font-bold border-t border-white/15">
            <th
              style={{
                position: 'sticky',
                left: 0,
                zIndex: 35,
                width: STO_STICKY_COL_WIDTH,
                minWidth: STO_STICKY_COL_WIDTH,
              }}
              className="no-print journal-sticky-col py-1 px-2 border-r border-white/15 bg-[#101f59] text-sky-200 shadow-[2px_0_5px_-1px_rgba(15,23,42,0.3)]"
            >
              №
            </th>
            {visibleColumns.map((col, idx) => {
              const colWidth = getStoColWidth(col.key, col.minWidth);
              return (
                <th
                  key={col.key}
                  data-sto-col={col.key}
                  style={{ width: colWidth, minWidth: colWidth }}
                  className={`py-1 px-2 border-r border-white/15 ${
                    idx === visibleColumns.length - 1 ? 'border-r-0' : ''
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
                colSpan={visibleColumns.length + 1}
                className="py-14 text-center text-xs text-slate-400 bg-white"
              >
                <div className="flex flex-col items-center justify-center gap-1.5">
                  <BookOpen className="w-8 h-8 text-slate-300 stroke-1" />
                  <span className="font-semibold text-slate-700">
                    В журнале нет записей по заданным условиям
                  </span>
                  <span className="text-[11px] text-slate-400 max-w-md">
                    {selectedLineKey !== 'ALL'
                      ? `По выбранной линии «${activeLineDisplayLabel}» отсутствуют сваренные стыки, соответствующие активным фильтрам.`
                      : 'В текущей выборке отсутствуют сваренные стыки с заполненной датой сварки.'}
                  </span>
                </div>
              </td>
            </tr>
          )}
          {chronologicalJoints.map((j, index) => {
            const row = formatStoGazpromJournalRow(j, index, lrvCatalog);
            const missingItem = missingByJointId.get(j.id);
            const missingLabels = missingItem
              ? missingItem.missingFields.map((f) => f.label)
              : [];
            const isIncomplete = missingLabels.length > 0;
            const repaired = isJointRepaired(j);
            const stickyBgClass = isIncomplete
              ? 'bg-amber-50 group-hover:bg-amber-100'
              : index % 2 === 0
                ? 'bg-white group-hover:bg-[#e8f1fc]'
                : 'bg-slate-50 group-hover:bg-[#e8f1fc]';

            return (
              <tr
                key={j.id}
                onDoubleClick={() => onEditJoint(j)}
                title={
                  isIncomplete
                    ? `Не заполнены обязательные реквизиты: ${missingLabels.join('; ')}`
                    : 'Двойной клик открывает паспорт стыка'
                }
                className={`group transition-colors align-top ${
                  isIncomplete
                    ? 'bg-amber-50/80 hover:bg-amber-100/80'
                    : 'hover:bg-[#e8f1fc]/60 odd:bg-white even:bg-slate-50/60'
                }`}
              >
                {/* Закреплённая экранная ячейка идентификации строки */}
                <td
                  style={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 10,
                    width: STO_STICKY_COL_WIDTH,
                    minWidth: STO_STICKY_COL_WIDTH,
                  }}
                  className={`no-print journal-sticky-col py-2 px-2 border-r border-slate-200 shadow-[2px_0_5px_-1px_rgba(15,23,42,0.12)] ${stickyBgClass}`}
                >
                  <div className="flex flex-col items-start gap-0.5 leading-tight">
                    <div className="flex items-center gap-1.5 w-full">
                      <span className="font-mono text-[10px] text-slate-400 shrink-0">
                        {index + 1}.
                      </span>
                      <button
                        type="button"
                        onClick={() => onEditJoint(j)}
                        className="font-mono font-bold text-[#1e3799] hover:underline cursor-pointer truncate"
                        title="Открыть паспорт стыка"
                      >
                        {j.jointNumber}
                        {repaired ? 'Р' : ''}
                      </button>
                      {isIncomplete && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 ml-auto"
                          title="Есть незаполненные обязательные реквизиты"
                        />
                      )}
                    </div>
                    {selectedLineKey === 'ALL' && j.lineNumber && (
                      <span className="font-mono text-[10px] text-slate-500 truncate max-w-[96px]">
                        {j.lineNumber}
                      </span>
                    )}
                  </div>
                </td>

                {visibleColumns.map((col, cIdx) => {
                  const cellVal = row[col.key];
                  const colWidth = getStoColWidth(col.key, col.minWidth);
                  const isLast = cIdx === visibleColumns.length - 1;

                  // Графа 13: номер сварного соединения — кликабельная ссылка на паспорт стыка
                  if (col.key === 'col13') {
                    return (
                      <td
                        key={col.key}
                        style={{ width: colWidth, minWidth: colWidth }}
                        className="py-2.5 px-2.5 border-r border-slate-200 font-mono text-center whitespace-nowrap"
                      >
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => onEditJoint(j)}
                            className="font-bold text-[#1e3799] hover:underline cursor-pointer"
                            title="Открыть паспорт стыка"
                          >
                            {j.jointNumber}
                          </button>
                          {j.recordStatus && j.recordStatus !== 'DRAFT' && (
                            <span className="no-print">
                              <RecordStatusBadge
                                status={j.recordStatus}
                                compact
                              />
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  }

                  // Графа 14: дополнительная маркировка ("Я" для углового шва, "н/п" в остальных случаях)
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

      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2 no-print">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            Записей в журнале:{' '}
            <span className="font-mono font-bold text-slate-800">
              {chronologicalJoints.length}
            </span>
          </div>
          {hideRepairCols && (
            <span className="text-[11px] text-[#1e3799] font-medium">
              На экране скрыты пустые графы ремонта 32–48 · в выгрузку Excel попадают все 49 граф
            </span>
          )}
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
          ¹ Для разнотолщинных элементов указывается толщина стенки каждого свариваемого элемента · ² В графе 14 для угловых швов У2–У20 по ГОСТ 16037-80 указывается «Я», в остальных случаях — «н/п»
        </div>
      </div>
    </div>
  );
};
