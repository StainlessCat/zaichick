import React, { useMemo } from 'react';
import { ExternalLink, RotateCw } from 'lucide-react';
import type {
  ExecutiveDocColumnDef,
  ExecutiveDocColumnKey,
  ExecutiveDocPatch,
  ExecutiveDocRow,
  ExecutiveDocStatus,
  GeodesyStatus,
  PhysicsStatus,
  PreStageStatus,
} from '../../types/executiveDocs';
import {
  EXECUTIVE_DOC_PRIORITY_OPTIONS,
  EXECUTIVE_DOC_STATUS_LABELS,
  GEODESY_STATUS_LABELS,
  PHYSICS_STATUS_LABELS,
  PRE_STAGE_STATUS_LABELS,
} from '../../types/executiveDocs';
import { getExecutiveDocColumnDisplayValue } from '../../utils/executiveDocsLogic';
import { TableColumnFilterHeader } from '../TableColumnFilterPopover';
import { ExecutiveDocsSurnameCell } from './ExecutiveDocsSurnameCell';
import { ExecutiveDocsNoteCell } from './ExecutiveDocsNoteCell';

export interface ExecutiveDocsTableProps {
  rows: ExecutiveDocRow[];
  baseRowsForCascade: ExecutiveDocRow[];
  activeColumnDefs: ExecutiveDocColumnDef[];
  columnFilters: Partial<Record<ExecutiveDocColumnKey, string[]>>;
  onApplyColumnFilter: (colKey: string, selectedValues: string[] | undefined) => void;
  sortConfig: { key: ExecutiveDocColumnKey; direction: 'asc' | 'desc' } | null;
  onSort: (colKey: string, direction: 'asc' | 'desc') => void;
  getColumnWidth: (key: string, fallbackWidth?: number) => number;
  onResizeStart: (
    e: React.PointerEvent,
    colKey: string,
    currentWidth: number,
    minWidth?: number
  ) => void;
  onAutoFit: (colKey: string) => void;
  canEdit: boolean;
  savingLineIds: Record<string, boolean>;
  workProducerSuggestions: string[];
  ptoEngineerSuggestions: string[];
  onSaveRowPatch: (row: ExecutiveDocRow, patch: ExecutiveDocPatch) => Promise<boolean>;
  onOpenLineInRegistry?: (uniqueLineId: string) => void;
}

function getIdStatusTextClass(status: ExecutiveDocStatus): string {
  return status === 'SIGNED' ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold';
}

function getPreStageTextClass(status: PreStageStatus): string {
  return status === 'SIGNED' ? 'text-emerald-700 font-medium' : 'text-rose-700 font-medium';
}

function getPhysicsTextClass(status: PhysicsStatus): string {
  return status === 'ACCEPTED' ? 'text-emerald-700 font-medium' : 'text-rose-700 font-medium';
}

function getGeodesyTextClass(status: GeodesyStatus): string {
  if (status === 'SIGNED') return 'text-emerald-700 font-medium';
  if (status === 'NOT_REQUIRED') return 'text-slate-500 font-medium';
  return 'text-rose-700 font-medium';
}

function getPriorityTextClass(priority: number | null): string {
  if (priority === null) return 'text-slate-400';
  if (priority <= 3) return 'text-rose-700 font-bold';
  return 'text-slate-900 font-semibold';
}

export const ExecutiveDocsTable: React.FC<ExecutiveDocsTableProps> = ({
  rows,
  baseRowsForCascade,
  activeColumnDefs,
  columnFilters,
  onApplyColumnFilter,
  sortConfig,
  onSort,
  getColumnWidth,
  onResizeStart,
  onAutoFit,
  canEdit,
  savingLineIds,
  workProducerSuggestions,
  ptoEngineerSuggestions,
  onSaveRowPatch,
  onOpenLineInRegistry,
}) => {
  const activeFiltersRecord = useMemo(() => {
    const rec: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(columnFilters)) {
      if (v !== undefined) rec[k] = v;
    }
    return rec;
  }, [columnFilters]);

  // Каскадный набор строк для каждого столбца: учитывает все фильтры КРОМЕ текущего столбца
  const cascadeRowsByColumn = useMemo(() => {
    const result: Partial<Record<ExecutiveDocColumnKey, ExecutiveDocRow[]>> = {};
    const activeEntries = Object.entries(columnFilters).filter(
      ([, vals]) => vals !== undefined
    ) as Array<[ExecutiveDocColumnKey, string[]]>;

    for (const col of activeColumnDefs) {
      const otherFilters = activeEntries.filter(([k]) => k !== col.key);
      if (otherFilters.length === 0) {
        result[col.key] = baseRowsForCascade;
      } else {
        result[col.key] = baseRowsForCascade.filter((row) =>
          otherFilters.every(([k, allowed]) => {
            const displayVal = getExecutiveDocColumnDisplayValue(row, k).trim();
            return allowed.includes(displayVal);
          })
        );
      }
    }
    return result;
  }, [activeColumnDefs, baseRowsForCascade, columnFilters]);

  const totalTableWidth = useMemo(
    () =>
      activeColumnDefs.reduce(
        (sum, col) => sum + getColumnWidth(col.key, col.defaultWidth),
        0
      ),
    [activeColumnDefs, getColumnWidth]
  );

  const renderCell = (row: ExecutiveDocRow, col: ExecutiveDocColumnDef) => {
    const isSaving = Boolean(savingLineIds[row.lineId]);

    switch (col.key) {
      case 'testContour':
        return (
          <span
            className={`block truncate text-xs ${
              row.testContour === '—' ? 'text-slate-400' : 'text-slate-800 font-medium'
            }`}
            title={row.testContour !== '—' ? row.testContour : 'Контур испытаний не назначен'}
          >
            {row.testContour}
          </span>
        );

      case 'rdCode':
        return (
          <span
            className="block truncate font-mono text-xs text-slate-800"
            title={row.rdCode}
          >
            {row.rdCode}
          </span>
        );

      case 'lineNumber':
        return onOpenLineInRegistry ? (
          <button
            type="button"
            onClick={() => onOpenLineInRegistry(row.uniqueLineId)}
            title={`Открыть стыки линии ${row.lineNumber} в реестре`}
            className="group inline-flex items-center gap-1 max-w-full font-mono text-xs font-semibold text-[#1e3799] hover:underline cursor-pointer"
          >
            <span className="truncate">{row.lineNumber}</span>
            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
          </button>
        ) : (
          <span className="block truncate font-mono text-xs font-semibold text-slate-900">
            {row.lineNumber}
          </span>
        );

      case 'priority':
        return canEdit ? (
          <select
            aria-label={`Приоритет линии ${row.lineNumber}`}
            value={row.priority !== null ? String(row.priority) : ''}
            onChange={(e) => {
              const raw = e.target.value;
              const nextVal = raw === '' ? null : Number.parseInt(raw, 10);
              void onSaveRowPatch(row, {
                priority: Number.isNaN(nextVal as number) ? null : nextVal,
              });
            }}
            className={`w-full h-7 px-1.5 bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent hover:border-slate-200 focus:border-[#1e3799] focus:outline-none rounded text-xs font-mono tabular-nums text-center cursor-pointer transition-colors ${getPriorityTextClass(
              row.priority
            )}`}
          >
            <option value="" className="text-slate-500 font-sans">
              —
            </option>
            {EXECUTIVE_DOC_PRIORITY_OPTIONS.map((num) => (
              <option key={num} value={String(num)} className="text-slate-900 font-mono">
                {num}
              </option>
            ))}
          </select>
        ) : (
          <span
            className={`block text-center font-mono tabular-nums text-xs ${getPriorityTextClass(
              row.priority
            )}`}
          >
            {row.priority !== null ? row.priority : '—'}
          </span>
        );

      case 'idStatus':
        return canEdit ? (
          <select
            aria-label={`Статус ИД линии ${row.lineNumber}`}
            value={row.idStatus}
            onChange={(e) =>
              void onSaveRowPatch(row, { idStatus: e.target.value as ExecutiveDocStatus })
            }
            className={`w-full h-7 px-1.5 bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent hover:border-slate-200 focus:border-[#1e3799] focus:outline-none rounded text-xs cursor-pointer transition-colors ${getIdStatusTextClass(
              row.idStatus
            )}`}
          >
            <option value="IN_WORK" className="text-amber-700">
              {EXECUTIVE_DOC_STATUS_LABELS.IN_WORK}
            </option>
            <option value="SIGNED" className="text-emerald-700">
              {EXECUTIVE_DOC_STATUS_LABELS.SIGNED}
            </option>
          </select>
        ) : (
          <span className={`block text-xs ${getIdStatusTextClass(row.idStatus)}`}>
            {EXECUTIVE_DOC_STATUS_LABELS[row.idStatus]}
          </span>
        );

      case 'weldingReadinessPct': {
        const pctColor =
          row.totalJointsCount === 0
            ? 'text-slate-400'
            : row.weldingReadinessPct >= 100
            ? 'text-emerald-700 font-semibold'
            : row.weldingReadinessPct > 0
            ? 'text-slate-900 font-medium'
            : 'text-slate-500';
        return (
          <div
            className="flex flex-col items-end gap-1"
            title={`Сварено стыков: ${row.weldedJointsCount} из ${row.totalJointsCount}`}
          >
            <span className={`font-mono tabular-nums text-xs ${pctColor}`}>
              {row.weldingReadinessPct}%
            </span>
            <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  row.weldingReadinessPct >= 100 ? 'bg-emerald-600' : 'bg-[#1e3799]'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, row.weldingReadinessPct))}%` }}
              />
            </div>
          </div>
        );
      }

      case 'workProducer':
        return (
          <ExecutiveDocsSurnameCell
            value={row.workProducer}
            placeholder="Фамилия"
            suggestions={workProducerSuggestions}
            disabled={!canEdit}
            onCommit={(nextVal) => void onSaveRowPatch(row, { workProducer: nextVal })}
          />
        );

      case 'ptoEngineer':
        return (
          <ExecutiveDocsSurnameCell
            value={row.ptoEngineer}
            placeholder="Фамилия"
            suggestions={ptoEngineerSuggestions}
            disabled={!canEdit}
            onCommit={(nextVal) => void onSaveRowPatch(row, { ptoEngineer: nextVal })}
          />
        );

      case 'preStageStatus':
        return canEdit ? (
          <select
            aria-label={`Предэтап линии ${row.lineNumber}`}
            value={row.preStageStatus}
            onChange={(e) =>
              void onSaveRowPatch(row, {
                preStageStatus: e.target.value as PreStageStatus,
              })
            }
            className={`w-full h-7 px-1.5 bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent hover:border-slate-200 focus:border-[#1e3799] focus:outline-none rounded text-xs cursor-pointer transition-colors ${getPreStageTextClass(
              row.preStageStatus
            )}`}
          >
            <option value="SIGNED" className="text-emerald-700">
              {PRE_STAGE_STATUS_LABELS.SIGNED}
            </option>
            <option value="NOT_SIGNED" className="text-rose-700">
              {PRE_STAGE_STATUS_LABELS.NOT_SIGNED}
            </option>
          </select>
        ) : (
          <span className={`block text-xs ${getPreStageTextClass(row.preStageStatus)}`}>
            {PRE_STAGE_STATUS_LABELS[row.preStageStatus]}
          </span>
        );

      case 'physicsStatus':
        return canEdit ? (
          <select
            aria-label={`Физика линии ${row.lineNumber}`}
            value={row.physicsStatus}
            onChange={(e) =>
              void onSaveRowPatch(row, {
                physicsStatus: e.target.value as PhysicsStatus,
              })
            }
            className={`w-full h-7 px-1.5 bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent hover:border-slate-200 focus:border-[#1e3799] focus:outline-none rounded text-xs cursor-pointer transition-colors ${getPhysicsTextClass(
              row.physicsStatus
            )}`}
          >
            <option value="ACCEPTED" className="text-emerald-700">
              {PHYSICS_STATUS_LABELS.ACCEPTED}
            </option>
            <option value="NOT_ACCEPTED" className="text-rose-700">
              {PHYSICS_STATUS_LABELS.NOT_ACCEPTED}
            </option>
          </select>
        ) : (
          <span className={`block text-xs ${getPhysicsTextClass(row.physicsStatus)}`}>
            {PHYSICS_STATUS_LABELS[row.physicsStatus]}
          </span>
        );

      case 'ndtDeficitCount': {
        const tooltip =
          row.ndtDeficitCount > 0
            ? `Сваренные стыки без закрытого НК: ${row.ndtDeficitJointNumbers.slice(0, 20).join(', ')}${
                row.ndtDeficitJointNumbers.length > 20
                  ? ` и ещё ${row.ndtDeficitJointNumbers.length - 20}`
                  : ''
              }`
            : 'Все сваренные стыки закрыты по НК';
        return (
          <span
            title={tooltip}
            className={`block text-right font-mono tabular-nums text-xs ${
              row.ndtDeficitCount > 0
                ? 'text-rose-700 font-bold'
                : 'text-emerald-700 font-medium'
            }`}
          >
            {row.ndtDeficitCount}
          </span>
        );
      }

      case 'vkDeficitCount': {
        const tooltip =
          row.vkDeficitCount > 0
            ? `Позиции Базы материалов линии без акта входного контроля:\n${row.vkDeficitItems
                .slice(0, 15)
                .map((m) => `${m.lrvCode} — ${m.shortName}`)
                .join('\n')}${
                row.vkDeficitItems.length > 15
                  ? `\nи ещё ${row.vkDeficitItems.length - 15}`
                  : ''
              }`
            : 'Все использованные позиции Базы материалов имеют акт входного контроля';
        return (
          <span
            title={tooltip}
            className={`block text-right font-mono tabular-nums text-xs ${
              row.vkDeficitCount > 0
                ? 'text-rose-700 font-bold'
                : 'text-emerald-700 font-medium'
            }`}
          >
            {row.vkDeficitCount}
          </span>
        );
      }

      case 'geodesyStatus':
        return canEdit ? (
          <select
            aria-label={`Геодезия линии ${row.lineNumber}`}
            value={row.geodesyStatus}
            onChange={(e) =>
              void onSaveRowPatch(row, {
                geodesyStatus: e.target.value as GeodesyStatus,
              })
            }
            className={`w-full h-7 px-1.5 bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent hover:border-slate-200 focus:border-[#1e3799] focus:outline-none rounded text-xs cursor-pointer transition-colors ${getGeodesyTextClass(
              row.geodesyStatus
            )}`}
          >
            <option value="SIGNED" className="text-emerald-700">
              {GEODESY_STATUS_LABELS.SIGNED}
            </option>
            <option value="NOT_SIGNED" className="text-rose-700">
              {GEODESY_STATUS_LABELS.NOT_SIGNED}
            </option>
            <option value="NOT_REQUIRED" className="text-slate-600">
              {GEODESY_STATUS_LABELS.NOT_REQUIRED}
            </option>
          </select>
        ) : (
          <span className={`block text-xs ${getGeodesyTextClass(row.geodesyStatus)}`}>
            {GEODESY_STATUS_LABELS[row.geodesyStatus]}
          </span>
        );

      case 'noteText':
        return (
          <div className="flex items-start gap-1.5 min-w-0">
            <div className="flex-1 min-w-0">
              <ExecutiveDocsNoteCell
                noteText={row.noteText}
                noteUpdatedAt={row.noteUpdatedAt}
                disabled={!canEdit}
                onSave={(nextNote) => void onSaveRowPatch(row, { noteText: nextNote })}
              />
            </div>
            {isSaving && (
              <RotateCw
                className="w-3 h-3 text-[#1e3799] animate-spin shrink-0 mt-1"
                aria-label="Сохранение"
              />
            )}
          </div>
        );
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
      <div className="overflow-x-auto min-h-[380px] max-h-[calc(100vh-280px)] overflow-y-auto table-scroll-container">
        <table
          className="w-full text-xs border-collapse table-fixed text-left"
          style={{ width: `${Math.max(totalTableWidth, 800)}px`, minWidth: '100%' }}
        >
          <colgroup>
            {activeColumnDefs.map((col) => (
              <col
                key={col.key}
                style={{ width: `${getColumnWidth(col.key, col.defaultWidth)}px` }}
              />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-20 shadow-xs">
            <tr className="bg-[#1e3799] text-white text-left select-none">
              {activeColumnDefs.map((col) => {
                const width = getColumnWidth(col.key, col.defaultWidth);
                return (
                  <TableColumnFilterHeader<ExecutiveDocRow>
                    key={col.key}
                    columnKey={col.key}
                    label={col.label}
                    rows={cascadeRowsByColumn[col.key] ?? baseRowsForCascade}
                    getValue={(r) => getExecutiveDocColumnDisplayValue(r, col.key)}
                    activeFilters={activeFiltersRecord}
                    onApplyFilter={onApplyColumnFilter}
                    sortConfig={sortConfig}
                    onSort={onSort}
                    align={col.align}
                    width={width}
                    minWidth={col.minWidth}
                    onResizeStart={onResizeStart}
                    onAutoFit={onAutoFit}
                    className="border-r border-white/15 last:border-r-0 hover:bg-[#192f85] transition-colors"
                  />
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr
                key={row.lineId}
                className="hover:bg-[#f0f5fc]/60 transition-colors align-middle"
              >
                {activeColumnDefs.map((col) => (
                  <td
                    key={col.key}
                    className="px-2.5 py-1.5 border-r border-slate-100 last:border-r-0 align-middle"
                  >
                    {renderCell(row, col)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
