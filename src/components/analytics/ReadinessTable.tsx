import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  CheckCircle2,
  Filter,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import type {
  ReadinessGroupCondition,
  ReadinessSummaryRow,
} from '../../types/welding';
import { TEST_ALLOWANCE_STATUS_LABELS } from '../../utils/weldingLogic';
import { getContourBlockerSummary } from '../../utils/analyticsCharts';
import { TableColumnFilterHeader } from '../TableColumnFilterPopover';
import { ColumnResizeHandle } from '../../utils/useResizableColumns';
import {
  CONDITION_TITLE_MAP,
  TEST_ALLOWANCE_BADGE_STYLES,
  type ToggleableColumnKey,
} from './readinessConfig';
import type { ReadinessSummaryTotals } from './useReadinessReportState';

interface ReadinessTableProps {
  condition: ReadinessGroupCondition;
  baseRows: ReadinessSummaryRow[];
  rows: ReadinessSummaryRow[];
  rowGetters: Record<string, (r: ReadinessSummaryRow) => string>;
  columnFilters: Record<string, string[]>;
  onApplyFilter: (colKey: string, vals: string[] | undefined) => void;
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  onSort: (colKey: string, direction: 'asc' | 'desc') => void;
  visibleColumns: ToggleableColumnKey[];
  isColVisible: (key: ToggleableColumnKey) => boolean;
  getColumnWidth: (key: string) => number;
  handleResizeStart: (e: React.PointerEvent, colKey: string, currentWidth: number) => void;
  handleAutoFit: (colKey: string, defaultWidth: number) => void;
  handleResetWidths: () => void;
  hasCustomWidths: boolean;
  summary: ReadinessSummaryTotals;
  tableFooterTotals: {
    totalLines: number;
    signedIdLines: number;
    idReadinessPct: number;
  };
  canOpenExecutiveDocs: boolean;
  onDrillDownRegistry: (groupKey: string, onlyActiveRepairs?: boolean) => void;
  onDrillDownExecutiveDocs: (row: ReadinessSummaryRow) => void;
}

export const ReadinessTable: React.FC<ReadinessTableProps> = ({
  condition,
  baseRows,
  rows,
  rowGetters,
  columnFilters,
  onApplyFilter,
  sortConfig,
  onSort,
  visibleColumns,
  isColVisible,
  getColumnWidth,
  handleResizeStart,
  handleAutoFit,
  handleResetWidths,
  hasCustomWidths,
  summary,
  tableFooterTotals,
  canOpenExecutiveDocs,
  onDrillDownRegistry,
  onDrillDownExecutiveDocs,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => (condition === 'contour' ? 78 : 54),
    overscan: 10,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0]?.start || 0 : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? Math.max(0, totalHeight - (virtualRows[virtualRows.length - 1]?.end || 0))
      : 0;

  const totalVisibleColsCount = 2 + visibleColumns.length;
  const idColumnHeaderLabel =
    condition === 'contour'
      ? 'ИД и допуск к испытаниям'
      : condition === 'uniqueLineId'
        ? 'Статус ИД'
        : 'ИД по линиям';

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
      <div
        ref={scrollContainerRef}
        className="overflow-x-auto overflow-y-auto min-h-[340px] max-h-[calc(100vh-340px)] table-scroll-container"
      >
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-20 shadow-xs">
            <tr className="bg-[#1e3799] text-white text-left">
              <TableColumnFilterHeader
                columnKey="groupKey"
                label={CONDITION_TITLE_MAP[condition]}
                rows={baseRows}
                getValue={rowGetters.groupKey}
                activeFilters={columnFilters}
                onApplyFilter={onApplyFilter}
                sortConfig={sortConfig}
                onSort={onSort}
                width={getColumnWidth('groupKey')}
                minWidth={150}
                onResizeStart={handleResizeStart}
                onAutoFit={() => handleAutoFit('groupKey', 230)}
              />
              {isColVisible('totalJoints') && (
                <TableColumnFilterHeader
                  columnKey="totalJoints"
                  label="Всего стыков"
                  rows={baseRows}
                  getValue={rowGetters.totalJoints}
                  activeFilters={columnFilters}
                  onApplyFilter={onApplyFilter}
                  sortConfig={sortConfig}
                  onSort={onSort}
                  align="right"
                  width={getColumnWidth('totalJoints')}
                  minWidth={80}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('totalJoints', 115)}
                />
              )}
              {isColVisible('weldedCount') && (
                <TableColumnFilterHeader
                  columnKey="weldedCount"
                  label="Сварено"
                  rows={baseRows}
                  getValue={rowGetters.weldedCount}
                  activeFilters={columnFilters}
                  onApplyFilter={onApplyFilter}
                  sortConfig={sortConfig}
                  onSort={onSort}
                  align="right"
                  width={getColumnWidth('weldedCount')}
                  minWidth={85}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('weldedCount', 120)}
                />
              )}
              {isColVisible('equivInches') && (
                <TableColumnFilterHeader
                  columnKey="equivInches"
                  label="Эквив. дюймы EDI"
                  rows={baseRows}
                  getValue={rowGetters.equivInches}
                  activeFilters={columnFilters}
                  onApplyFilter={onApplyFilter}
                  sortConfig={sortConfig}
                  onSort={onSort}
                  align="right"
                  width={getColumnWidth('equivInches')}
                  minWidth={120}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('equivInches', 170)}
                />
              )}
              {isColVisible('vikPassedCount') && (
                <TableColumnFilterHeader
                  columnKey="vikPassedCount"
                  label="Годен ВИК"
                  rows={baseRows}
                  getValue={rowGetters.vikPassedCount}
                  activeFilters={columnFilters}
                  onApplyFilter={onApplyFilter}
                  sortConfig={sortConfig}
                  onSort={onSort}
                  align="right"
                  width={getColumnWidth('vikPassedCount')}
                  minWidth={75}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('vikPassedCount', 95)}
                />
              )}
              {isColVisible('ndtPassedCount') && (
                <TableColumnFilterHeader
                  columnKey="ndtPassedCount"
                  label="Годен НК"
                  rows={baseRows}
                  getValue={rowGetters.ndtPassedCount}
                  activeFilters={columnFilters}
                  onApplyFilter={onApplyFilter}
                  sortConfig={sortConfig}
                  onSort={onSort}
                  align="right"
                  width={getColumnWidth('ndtPassedCount')}
                  minWidth={75}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('ndtPassedCount', 105)}
                />
              )}
              {isColVisible('dupNdtPassedCount') && (
                <TableColumnFilterHeader
                  columnKey="dupNdtPassedCount"
                  label="Дубль НК"
                  rows={baseRows}
                  getValue={rowGetters.dupNdtPassedCount}
                  activeFilters={columnFilters}
                  onApplyFilter={onApplyFilter}
                  sortConfig={sortConfig}
                  onSort={onSort}
                  align="right"
                  width={getColumnWidth('dupNdtPassedCount')}
                  minWidth={75}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('dupNdtPassedCount', 95)}
                />
              )}
              {isColVisible('repairCount') && (
                <TableColumnFilterHeader
                  columnKey="repairCount"
                  label="Ремонт"
                  rows={baseRows}
                  getValue={rowGetters.repairCount}
                  activeFilters={columnFilters}
                  onApplyFilter={onApplyFilter}
                  sortConfig={sortConfig}
                  onSort={onSort}
                  align="right"
                  width={getColumnWidth('repairCount')}
                  minWidth={75}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('repairCount', 95)}
                />
              )}
              {isColVisible('readinessPct') && (
                <TableColumnFilterHeader
                  columnKey="readinessPct"
                  label="Готовность сварки"
                  rows={baseRows}
                  getValue={rowGetters.readinessPct}
                  activeFilters={columnFilters}
                  onApplyFilter={onApplyFilter}
                  sortConfig={sortConfig}
                  onSort={onSort}
                  width={getColumnWidth('readinessPct')}
                  minWidth={150}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('readinessPct', 190)}
                />
              )}
              {isColVisible('idStatus') && (
                <TableColumnFilterHeader
                  columnKey="idStatus"
                  label={idColumnHeaderLabel}
                  rows={baseRows}
                  getValue={rowGetters.idStatus}
                  activeFilters={columnFilters}
                  onApplyFilter={onApplyFilter}
                  sortConfig={sortConfig}
                  onSort={onSort}
                  width={getColumnWidth('idStatus')}
                  minWidth={160}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('idStatus', 215)}
                />
              )}
              <th
                style={{
                  width: getColumnWidth('action'),
                  minWidth: getColumnWidth('action'),
                }}
                className="relative py-3 px-3 font-semibold text-center whitespace-nowrap"
              >
                Переход
                <ColumnResizeHandle
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('action', 95)}
                  colKey="action"
                  currentWidth={getColumnWidth('action')}
                  minWidth={70}
                />
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={totalVisibleColsCount}
                  className="py-10 text-center text-slate-500 text-xs"
                >
                  Нет данных для выбранного разреза, периода и фильтров.
                </td>
              </tr>
            ) : (
              <>
                {paddingTop > 0 && (
                  <tr aria-hidden="true">
                    <td
                      colSpan={totalVisibleColsCount}
                      style={{ height: `${paddingTop}px`, padding: 0, border: 0 }}
                    />
                  </tr>
                )}
                {virtualRows.map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  const canOpenId = canOpenExecutiveDocs && row.totalLinesCount > 0;
                  const isEven = virtualRow.index % 2 === 1;
                  return (
                    <tr
                      key={row.groupKey}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      className={`hover:bg-[#e8f1fc]/50 transition-colors ${
                        isEven ? 'bg-slate-50/60' : 'bg-white'
                      }`}
                    >
                      <td
                        style={{
                          width: getColumnWidth('groupKey'),
                          minWidth: getColumnWidth('groupKey'),
                        }}
                        className="py-3 px-4 border-r border-slate-200"
                      >
                        <div className="font-mono font-bold text-slate-900">
                          {row.groupKey}
                        </div>
                        {row.subLabel && (
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {row.subLabel}
                          </div>
                        )}
                      </td>
                      {isColVisible('totalJoints') && (
                        <td
                          style={{
                            width: getColumnWidth('totalJoints'),
                            minWidth: getColumnWidth('totalJoints'),
                          }}
                          className="py-3 px-3 border-r border-slate-200 font-mono text-right"
                        >
                          <div className="font-bold text-slate-900">{row.totalJoints}</div>
                          {row.supplementaryJoints > 0 && (
                            <div className="text-[10px] text-slate-500">
                              доп. {row.supplementaryJoints}
                            </div>
                          )}
                        </td>
                      )}
                      {isColVisible('weldedCount') && (
                        <td
                          style={{
                            width: getColumnWidth('weldedCount'),
                            minWidth: getColumnWidth('weldedCount'),
                          }}
                          className="py-3 px-3 border-r border-slate-200 font-mono text-right"
                        >
                          <span className="font-semibold text-slate-900">
                            {row.weldedCount}
                          </span>
                          <span className="text-slate-500 ml-1.5">{row.weldingPct}%</span>
                        </td>
                      )}
                      {isColVisible('equivInches') && (
                        <td
                          style={{
                            width: getColumnWidth('equivInches'),
                            minWidth: getColumnWidth('equivInches'),
                          }}
                          className="py-3 px-3 border-r border-slate-200 font-mono text-right"
                        >
                          <span className="font-semibold text-[#1e3799]">
                            {row.weldedEquivInches}
                          </span>{' '}
                          <span className="text-slate-500">/ {row.totalEquivInches}</span>
                          <span className="text-slate-700 font-bold ml-1.5">
                            {row.equivWeldingPct}%
                          </span>
                        </td>
                      )}
                      {isColVisible('vikPassedCount') && (
                        <td
                          style={{
                            width: getColumnWidth('vikPassedCount'),
                            minWidth: getColumnWidth('vikPassedCount'),
                          }}
                          className="py-3 px-3 border-r border-slate-200 font-mono text-right"
                        >
                          {row.vikPassedCount}
                        </td>
                      )}
                      {isColVisible('ndtPassedCount') && (
                        <td
                          style={{
                            width: getColumnWidth('ndtPassedCount'),
                            minWidth: getColumnWidth('ndtPassedCount'),
                          }}
                          title={
                            row.ndtNotRequiredCount > 0
                              ? `Физический НК годен: ${row.ndtPassedCount}, без НК по проекту: ${row.ndtNotRequiredCount}`
                              : undefined
                          }
                          className="py-3 px-3 border-r border-slate-200 font-mono text-right"
                        >
                          <div>{row.ndtPassedCount}</div>
                          {row.ndtNotRequiredCount > 0 && (
                            <div className="text-[10px] text-slate-500">
                              без НК {row.ndtNotRequiredCount}
                            </div>
                          )}
                        </td>
                      )}
                      {isColVisible('dupNdtPassedCount') && (
                        <td
                          style={{
                            width: getColumnWidth('dupNdtPassedCount'),
                            minWidth: getColumnWidth('dupNdtPassedCount'),
                          }}
                          className="py-3 px-3 border-r border-slate-200 font-mono text-right"
                        >
                          {row.dupNdtPassedCount}
                        </td>
                      )}
                      {isColVisible('repairCount') && (
                        <td
                          style={{
                            width: getColumnWidth('repairCount'),
                            minWidth: getColumnWidth('repairCount'),
                          }}
                          className="py-3 px-3 border-r border-slate-200 font-mono text-right"
                        >
                          {row.repairCount > 0 ? (
                            <button
                              type="button"
                              onClick={() => onDrillDownRegistry(row.groupKey, true)}
                              title="Открыть стыки в ремонте в Реестре"
                              className="inline-flex items-center justify-end px-2 py-0.5 rounded bg-amber-50 border border-amber-200 font-bold text-amber-800 hover:bg-amber-600 hover:text-white hover:border-amber-600 transition-colors cursor-pointer"
                            >
                              {row.repairCount}
                            </button>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                      )}
                      {isColVisible('readinessPct') && (
                        <td
                          style={{
                            width: getColumnWidth('readinessPct'),
                            minWidth: getColumnWidth('readinessPct'),
                          }}
                          className="py-3 px-4 border-r border-slate-200"
                        >
                          <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                            <span className="font-bold text-[#1e3799]">
                              {row.readinessPct}%
                            </span>
                            <span className="text-slate-500">
                              {row.fullyCompletedCount} из {row.totalJoints}
                            </span>
                          </div>
                          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#1e3799] rounded-full transition-all"
                              style={{ width: `${row.readinessPct}%` }}
                            />
                          </div>
                        </td>
                      )}
                      {isColVisible('idStatus') && (
                        <td
                          style={{
                            width: getColumnWidth('idStatus'),
                            minWidth: getColumnWidth('idStatus'),
                          }}
                          className="py-2.5 px-3.5 border-r border-slate-200"
                        >
                          {condition === 'uniqueLineId' ? (
                            <button
                              type="button"
                              disabled={!canOpenId}
                              onClick={() => onDrillDownExecutiveDocs(row)}
                              title={
                                canOpenId
                                  ? 'Открыть линию в разделе Исполнительная документация'
                                  : undefined
                              }
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-semibold transition-colors ${
                                row.lineIdStatus === 'SIGNED'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              } ${canOpenId ? 'hover:ring-1 hover:ring-[#1e3799]/40 cursor-pointer' : ''}`}
                            >
                              {row.lineIdStatus === 'SIGNED' ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  <span>Подписана</span>
                                </>
                              ) : (
                                <span>В работе</span>
                              )}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={!canOpenId}
                              onClick={() => onDrillDownExecutiveDocs(row)}
                              title={
                                canOpenId
                                  ? 'Открыть в разделе Исполнительная документация'
                                  : undefined
                              }
                              className={`w-full text-left space-y-1 rounded-md p-1 -m-1 transition-colors ${
                                canOpenId
                                  ? 'hover:bg-emerald-50/70 cursor-pointer'
                                  : 'cursor-default'
                              }`}
                            >
                              <div className="flex items-center justify-between text-[11px] font-mono">
                                <span className="font-bold text-emerald-800">
                                  {row.signedIdLinesCount} / {row.totalLinesCount}
                                </span>
                                <span className="text-slate-500">
                                  {row.idReadinessPct}%
                                </span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-600 rounded-full transition-all"
                                  style={{ width: `${row.idReadinessPct}%` }}
                                />
                              </div>
                              {condition === 'contour' &&
                                row.testAllowanceStatus &&
                                (() => {
                                  const blockers = getContourBlockerSummary(row);
                                  return (
                                    <div className="pt-0.5 space-y-1">
                                      <span
                                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold whitespace-nowrap ${
                                          TEST_ALLOWANCE_BADGE_STYLES[
                                            row.testAllowanceStatus
                                          ]
                                        }`}
                                      >
                                        {row.testAllowanceStatus === 'allowed' && (
                                          <ShieldCheck className="w-3 h-3 text-emerald-700 shrink-0" />
                                        )}
                                        {row.testAllowanceStatus ===
                                          'welding_done_id_pending' && (
                                          <ShieldAlert className="w-3 h-3 text-amber-700 shrink-0" />
                                        )}
                                        <span>
                                          {
                                            TEST_ALLOWANCE_STATUS_LABELS[
                                              row.testAllowanceStatus
                                            ]
                                          }
                                        </span>
                                      </span>
                                      {row.testAllowanceStatus !== 'allowed' &&
                                        blockers.hasAnyBlocker && (
                                          <div className="flex flex-wrap gap-1 text-[10px] font-medium">
                                            {blockers.unweldedCount > 0 && (
                                              <span className="px-1 py-0 rounded bg-slate-100 text-slate-600">
                                                Не доварено: {blockers.unweldedCount}
                                              </span>
                                            )}
                                            {blockers.ndtDeficitCount > 0 && (
                                              <span className="px-1 py-0 rounded bg-sky-50 text-sky-800">
                                                Без НК: {blockers.ndtDeficitCount}
                                              </span>
                                            )}
                                            {blockers.repairCount > 0 && (
                                              <span className="px-1 py-0 rounded bg-rose-50 text-rose-700">
                                                Ремонт: {blockers.repairCount}
                                              </span>
                                            )}
                                            {blockers.unsignedIdLinesCount > 0 && (
                                              <span className="px-1 py-0 rounded bg-amber-50 text-amber-800">
                                                ИД: {blockers.unsignedIdLinesCount} л.
                                              </span>
                                            )}
                                          </div>
                                        )}
                                    </div>
                                  );
                                })()}
                            </button>
                          )}
                        </td>
                      )}
                      <td
                        style={{
                          width: getColumnWidth('action'),
                          minWidth: getColumnWidth('action'),
                        }}
                        className="py-3 px-3 text-center"
                      >
                        <button
                          type="button"
                          disabled={row.totalJoints === 0}
                          onClick={() => onDrillDownRegistry(row.groupKey, false)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded font-semibold transition-colors ${
                            row.totalJoints === 0
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              : 'bg-[#e8f1fc] text-[#1e3799] hover:bg-[#1e3799] hover:text-white cursor-pointer'
                          }`}
                        >
                          <Filter className="w-3 h-3" />
                          <span>К стыкам</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {paddingBottom > 0 && (
                  <tr aria-hidden="true">
                    <td
                      colSpan={totalVisibleColsCount}
                      style={{ height: `${paddingBottom}px`, padding: 0, border: 0 }}
                    />
                  </tr>
                )}
              </>
            )}
          </tbody>

          {rows.length > 0 && (
            <tfoot className="sticky bottom-0 z-10 bg-slate-100 border-t-2 border-slate-300 font-semibold text-slate-900">
              <tr>
                <td className="py-2.5 px-4 border-r border-slate-200">
                  Итого по таблице
                </td>
                {isColVisible('totalJoints') && (
                  <td className="py-2.5 px-3 border-r border-slate-200 font-mono text-right">
                    {summary.total}
                  </td>
                )}
                {isColVisible('weldedCount') && (
                  <td className="py-2.5 px-3 border-r border-slate-200 font-mono text-right">
                    {summary.welded}{' '}
                    <span className="text-slate-500 ml-1">{summary.weldingPct}%</span>
                  </td>
                )}
                {isColVisible('equivInches') && (
                  <td className="py-2.5 px-3 border-r border-slate-200 font-mono text-right">
                    <span className="text-[#1e3799]">{summary.weldedEquivInches}</span> /{' '}
                    {summary.totalEquivInches}{' '}
                    <span className="ml-1">{summary.equivWeldingPct}%</span>
                  </td>
                )}
                {isColVisible('vikPassedCount') && (
                  <td className="py-2.5 px-3 border-r border-slate-200 font-mono text-right">
                    {summary.vikOk}
                  </td>
                )}
                {isColVisible('ndtPassedCount') && (
                  <td className="py-2.5 px-3 border-r border-slate-200 font-mono text-right">
                    <div>{summary.ndtOk}</div>
                    {summary.ndtNotReq > 0 && (
                      <div className="text-[10px] font-normal text-slate-500">
                        без НК {summary.ndtNotReq}
                      </div>
                    )}
                  </td>
                )}
                {isColVisible('dupNdtPassedCount') && (
                  <td className="py-2.5 px-3 border-r border-slate-200 font-mono text-right">
                    {summary.dupNdtOk}
                  </td>
                )}
                {isColVisible('repairCount') && (
                  <td className="py-2.5 px-3 border-r border-slate-200 font-mono text-right text-amber-700">
                    {summary.repair}
                  </td>
                )}
                {isColVisible('readinessPct') && (
                  <td className="py-2.5 px-4 border-r border-slate-200 font-mono">
                    <span className="text-[#1e3799]">{summary.readyPct}%</span>
                    <span className="text-slate-500 ml-2">
                      {summary.ready} из {summary.total}
                    </span>
                  </td>
                )}
                {isColVisible('idStatus') && (
                  <td className="py-2.5 px-3.5 border-r border-slate-200 font-mono">
                    <span className="text-emerald-800">
                      {tableFooterTotals.signedIdLines} / {tableFooterTotals.totalLines}
                    </span>
                    <span className="text-slate-600 ml-1.5">
                      {tableFooterTotals.idReadinessPct}%
                    </span>
                  </td>
                )}
                <td className="py-2.5 px-3 text-center text-slate-400">—</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="px-4 py-2.5 bg-[#f8fafd] border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <div className="flex items-center gap-3">
          <div>
            Строк в сводном отчёте:{' '}
            <span className="font-mono font-bold text-slate-800">{rows.length}</span>
          </div>
          {hasCustomWidths && (
            <button
              type="button"
              onClick={handleResetWidths}
              title="Сбросить ширину столбцов отчёта готовности к исходной"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-[11px] transition-colors shadow-2xs cursor-pointer"
            >
              <RotateCcw className="w-3 h-3 text-slate-400" />
              <span>Сбросить ширину столбцов</span>
            </button>
          )}
        </div>
        <div>
          Ширина столбцов регулируется перетаскиванием правой границы заголовка, двойной клик — автоподбор
        </div>
      </div>
    </div>
  );
};
