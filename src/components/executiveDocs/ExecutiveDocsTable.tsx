import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, RotateCw } from 'lucide-react';
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
  selectedLineIds: Set<string>;
  onToggleSelectRow: (lineId: string) => void;
  onToggleSelectAll: () => void;
  workProducerSuggestions: string[];
  ptoEngineerSuggestions: string[];
  onSaveRowPatch: (row: ExecutiveDocRow, patch: ExecutiveDocPatch) => Promise<boolean>;
  onRequestStatusChange: (row: ExecutiveDocRow, nextStatus: ExecutiveDocStatus) => void;
  onOpenNdtDeficit: (row: ExecutiveDocRow) => void;
  onOpenVkDeficit: (row: ExecutiveDocRow) => void;
  onOpenLineInRegistry?: (uniqueLineId: string) => void;
  onOpenTestingCircuits?: () => void;
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
  selectedLineIds,
  onToggleSelectRow,
  onToggleSelectAll,
  workProducerSuggestions,
  ptoEngineerSuggestions,
  onSaveRowPatch,
  onRequestStatusChange,
  onOpenNdtDeficit,
  onOpenVkDeficit,
  onOpenLineInRegistry,
  onOpenTestingCircuits,
}) => {
  const activeFiltersRecord = useMemo(() => {
    const rec: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(columnFilters)) {
      if (v !== undefined) rec[k] = v;
    }
    return rec;
  }, [columnFilters]);

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

  const checkboxColWidth = canEdit ? 40 : 0;

  const totalTableWidth = useMemo(
    () =>
      checkboxColWidth +
      activeColumnDefs.reduce(
        (sum, col) => sum + getColumnWidth(col.key, col.defaultWidth),
        0
      ),
    [activeColumnDefs, checkboxColWidth, getColumnWidth]
  );

  // Закрепляем слева первый столбец таблицы (как правило «Линия»)
  const stickyFirstColKey = activeColumnDefs[0]?.key ?? null;

  const allSelected =
    rows.length > 0 && rows.every((r) => selectedLineIds.has(r.lineId));
  const someSelected =
    !allSelected && rows.some((r) => selectedLineIds.has(r.lineId));

  const renderCell = (row: ExecutiveDocRow, col: ExecutiveDocColumnDef) => {
    const isSaving = Boolean(savingLineIds[row.lineId]);

    switch (col.key) {
      case 'testContour':
        if (row.testContour === '—') {
          return (
            <span className="block truncate text-xs text-slate-400" title="Контур испытаний не назначен">
              —
            </span>
          );
        }
        return onOpenTestingCircuits ? (
          <button
            type="button"
            onClick={onOpenTestingCircuits}
            title={`Перейти к контуру «${row.testContour}» в разделе «Испытания»`}
            className="group inline-flex items-center gap-1 max-w-full text-left text-xs font-medium text-slate-800 hover:text-[#1e3799] hover:underline cursor-pointer"
          >
            <span className="truncate">{row.testContour}</span>
          </button>
        ) : (
          <span className="block truncate text-xs text-slate-800 font-medium" title={row.testContour}>
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
            className={`w-full h-7 px-1 bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent hover:border-slate-200 focus:border-[#1e3799] focus:outline-none rounded text-xs font-mono tabular-nums text-center cursor-pointer transition-colors ${getPriorityTextClass(
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

      case 'idStatus': {
        const anomalyTitle = row.hasSignedAnomaly
          ? `Подписана с незакрытыми требованиями: ${row.readinessBlockers
              .map((b) => `${b.label} — ${b.detail}`)
              .join('; ')}`
          : undefined;
        return (
          <div className="flex items-center gap-1 min-w-0">
            {canEdit ? (
              <select
                aria-label={`Статус ИД линии ${row.lineNumber}`}
                value={row.idStatus}
                onChange={(e) =>
                  onRequestStatusChange(row, e.target.value as ExecutiveDocStatus)
                }
                className={`flex-1 min-w-0 h-7 px-1 bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent hover:border-slate-200 focus:border-[#1e3799] focus:outline-none rounded text-xs cursor-pointer transition-colors ${getIdStatusTextClass(
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
              <span className={`truncate text-xs ${getIdStatusTextClass(row.idStatus)}`}>
                {EXECUTIVE_DOC_STATUS_LABELS[row.idStatus]}
              </span>
            )}
            {row.hasSignedAnomaly && (
              <span title={anomalyTitle} className="shrink-0 text-amber-600">
                <AlertTriangle className="w-3.5 h-3.5" aria-label="Есть замечания" />
              </span>
            )}
            {!row.hasSignedAnomaly && row.isReadyToSign && row.idStatus === 'IN_WORK' && (
              <span
                title="Все требования выполнены — комплект готов к подписанию"
                className="shrink-0 text-emerald-600"
              >
                <CheckCircle2 className="w-3.5 h-3.5" aria-label="Готова к подписанию" />
              </span>
            )}
          </div>
        );
      }

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
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono tabular-nums text-[10px] text-slate-400">
                {row.weldedJointsCount}/{row.totalJointsCount}
              </span>
              <span className={`font-mono tabular-nums text-xs ${pctColor}`}>
                {row.weldingReadinessPct}%
              </span>
            </div>
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
            className={`w-full h-7 px-1 bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent hover:border-slate-200 focus:border-[#1e3799] focus:outline-none rounded text-xs cursor-pointer transition-colors ${getPreStageTextClass(
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
            className={`w-full h-7 px-1 bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent hover:border-slate-200 focus:border-[#1e3799] focus:outline-none rounded text-xs cursor-pointer transition-colors ${getPhysicsTextClass(
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
        if (row.ndtDeficitCount === 0) {
          return (
            <span
              title={row.ndtDeficitSummary}
              className="block text-right font-mono tabular-nums text-xs text-emerald-700 font-medium"
            >
              0
            </span>
          );
        }
        return (
          <button
            type="button"
            onClick={() => onOpenNdtDeficit(row)}
            title={`Открыть расшифровку дефицита НК: ${row.ndtDeficitSummary}`}
            className="w-full text-right cursor-pointer group"
          >
            <div className="font-mono tabular-nums text-xs text-rose-700 font-bold group-hover:underline">
              {row.ndtDeficitCount}
            </div>
            <div className="truncate font-mono text-[10px] text-rose-600/90">
              {row.ndtDeficitSummary}
            </div>
          </button>
        );
      }

      case 'vkDeficitCount': {
        if (row.vkDeficitCount === 0) {
          return (
            <span
              title="Все использованные позиции Базы материалов имеют акт входного контроля"
              className="block text-right font-mono tabular-nums text-xs text-emerald-700 font-medium"
            >
              0
            </span>
          );
        }
        return (
          <button
            type="button"
            onClick={() => onOpenVkDeficit(row)}
            title="Открыть перечень позиций без акта входного контроля"
            className="w-full text-right cursor-pointer group"
          >
            <div className="font-mono tabular-nums text-xs text-rose-700 font-bold group-hover:underline">
              {row.vkDeficitCount}
            </div>
            {row.unlinkedVkCount > 0 && (
              <div className="font-mono text-[10px] text-amber-700">
                без прив.: {row.unlinkedVkCount}
              </div>
            )}
          </button>
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
            className={`w-full h-7 px-1 bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent hover:border-slate-200 focus:border-[#1e3799] focus:outline-none rounded text-xs cursor-pointer transition-colors ${getGeodesyTextClass(
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
      <div className="overflow-x-auto min-h-[360px] max-h-[calc(100vh-300px)] overflow-y-auto table-scroll-container">
        <table
          className="w-full text-xs border-collapse table-fixed text-left"
          style={{ width: `${Math.max(totalTableWidth, 800)}px`, minWidth: '100%' }}
        >
          <colgroup>
            {canEdit && <col style={{ width: '40px' }} />}
            {activeColumnDefs.map((col) => (
              <col
                key={col.key}
                style={{ width: `${getColumnWidth(col.key, col.defaultWidth)}px` }}
              />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-20 shadow-xs">
            <tr className="bg-[#1e3799] text-white text-left select-none">
              {canEdit && (
                <th className="sticky left-0 z-30 bg-[#1e3799] px-2 py-2.5 border-r border-white/15 text-center w-10">
                  <input
                    type="checkbox"
                    aria-label="Выбрать все отфильтрованные линии"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={onToggleSelectAll}
                    className="w-3.5 h-3.5 accent-white cursor-pointer align-middle"
                  />
                </th>
              )}
              {activeColumnDefs.map((col) => {
                const width = getColumnWidth(col.key, col.defaultWidth);
                const isStickyFirst = col.key === stickyFirstColKey;
                const stickyHeaderClasses = isStickyFirst
                  ? `sticky ${canEdit ? 'left-10' : 'left-0'} z-30 bg-[#1e3799] shadow-[2px_0_4px_-2px_rgba(15,23,42,0.28)]`
                  : '';
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
                    className={`border-r border-white/15 last:border-r-0 hover:bg-[#192f85] transition-colors ${stickyHeaderClasses}`}
                  />
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const isSelected = selectedLineIds.has(row.lineId);
              const rowBgClass = isSelected
                ? 'bg-[#f0f5fc]'
                : row.hasSignedAnomaly
                ? 'bg-amber-50/40'
                : 'bg-white';
              return (
                <tr
                  key={row.lineId}
                  className={`group ${rowBgClass} hover:bg-[#f0f5fc]/80 transition-colors align-middle`}
                >
                  {canEdit && (
                    <td
                      className={`sticky left-0 z-10 px-2 py-1.5 border-r border-slate-100 text-center align-middle transition-colors ${rowBgClass} group-hover:bg-[#f0f5fc]`}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Выбрать линию ${row.lineNumber}`}
                        checked={isSelected}
                        onChange={() => onToggleSelectRow(row.lineId)}
                        className="w-3.5 h-3.5 accent-[#1e3799] cursor-pointer align-middle"
                      />
                    </td>
                  )}
                  {activeColumnDefs.map((col) => {
                    const isStickyFirst = col.key === stickyFirstColKey;
                    const stickyCellClasses = isStickyFirst
                      ? `sticky ${canEdit ? 'left-10' : 'left-0'} z-10 ${rowBgClass} group-hover:bg-[#f0f5fc] shadow-[2px_0_4px_-2px_rgba(15,23,42,0.12)]`
                      : '';
                    return (
                      <td
                        key={col.key}
                        className={`px-2.5 py-1.5 border-r border-slate-100 last:border-r-0 align-middle transition-colors ${stickyCellClasses}`}
                      >
                        {renderCell(row, col)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
