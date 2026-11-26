import React, { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Edit3,
  ExternalLink,
  Filter,
  Gauge,
  MapPin,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  LineListColumnKey,
  ProjectLineItem,
  RecordStatus,
  UserAccount,
} from '../../types/welding';
import {
  computeLineListItemStatus,
  formatDateDDMMYY,
  formatExecutiveDocStatusLabel,
  LINELIST_COLUMNS,
  normalizeExecutiveDocStatus,
} from '../../utils/weldingLogic';
import { canUserMutateRecord } from '../../utils/rbac';
import { RecordStatusActions, RecordStatusBadge } from '../RecordStatusControls';
import { LineListExcelFilterPopover } from './LineListExcelFilterPopover';
import { SortConfig } from './types';

export interface LineCircuitBindingSummary {
  circuitId: string;
  circuitName: string;
  assigned: number;
  total: number;
  isFull: boolean;
}

interface LineListTableProps {
  filteredAndSortedList: {
    item: ProjectLineItem;
    status: ReturnType<typeof computeLineListItemStatus>;
  }[];
  visibleColumns: LineListColumnKey[];
  selectedLineIds: string[];
  onToggleSelectAll: () => void;
  onToggleSelectRow: (id: string) => void;
  canEdit: boolean;
  canSelectForCircuit?: boolean;
  lineCircuitsMap?: Map<string, LineCircuitBindingSummary[]>;
  onOpenTestingCircuits?: () => void;
  columnFilters: Partial<Record<LineListColumnKey, string[]>>;
  setColumnFilters: React.Dispatch<
    React.SetStateAction<Partial<Record<LineListColumnKey, string[]>>>
  >;
  openFilterColumnKey: LineListColumnKey | null;
  setOpenFilterColumnKey: (key: LineListColumnKey | null) => void;
  sortConfig: SortConfig | null;
  setSortConfig: React.Dispatch<React.SetStateAction<SortConfig | null>>;
  getColumnWidth: (key: string, minWidth?: number) => number;
  handleResizeStart: (
    e: React.PointerEvent,
    key: string,
    startWidth: number,
    minWidth?: number
  ) => void;
  handleAutoFit: (key: string, width: number) => void;
  getUniqueValuesForColumn: (
    key: LineListColumnKey
  ) => { value: string; count: number }[];
  onOpenFacilityLocation?: (objName: string) => void;
  onOpenLineInRegistry?: (uniqueLineId: string) => void;
  onOpenEditLineModal: (item: ProjectLineItem) => void;
  onDeleteLineItems: (ids: string[]) => void;
  confirmDeleteLineId: string | null;
  setConfirmDeleteLineId: (id: string | null) => void;
  totalLinesCount: number;
  hasCustomWidths: boolean;
  onResetWidths: () => void;
  currentUser?: UserAccount;
  onChangeLineStatus?: (
    line: ProjectLineItem,
    targetStatus: RecordStatus,
    reason?: string
  ) => Promise<{ ok: boolean; message?: string }>;
}

export const LineListTable: React.FC<LineListTableProps> = ({
  filteredAndSortedList,
  visibleColumns,
  selectedLineIds,
  onToggleSelectAll,
  onToggleSelectRow,
  canEdit,
  canSelectForCircuit = false,
  lineCircuitsMap,
  onOpenTestingCircuits,
  columnFilters,
  setColumnFilters,
  openFilterColumnKey,
  setOpenFilterColumnKey,
  sortConfig,
  setSortConfig,
  getColumnWidth,
  handleResizeStart,
  handleAutoFit,
  getUniqueValuesForColumn,
  onOpenFacilityLocation,
  onOpenLineInRegistry,
  onOpenEditLineModal,
  onDeleteLineItems,
  confirmDeleteLineId,
  setConfirmDeleteLineId,
  totalLinesCount,
  hasCustomWidths,
  onResetWidths,
  currentUser,
  onChangeLineStatus,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const activeColumns = useMemo(() => {
    const visibleSet = new Set<LineListColumnKey>(visibleColumns);
    visibleSet.add('lineNumber');
    return LINELIST_COLUMNS.filter((col) => visibleSet.has(col.key));
  }, [visibleColumns]);

  const selectedSet = useMemo(() => new Set(selectedLineIds), [selectedLineIds]);

  const rowVirtualizer = useVirtualizer({
    count: filteredAndSortedList.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 56,
    overscan: 12,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0]?.start || 0 : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? Math.max(0, totalHeight - (virtualRows[virtualRows.length - 1]?.end || 0))
      : 0;

  const renderCell = (
    colKey: LineListColumnKey,
    item: ProjectLineItem,
    status: ReturnType<typeof computeLineListItemStatus>,
    canEditRow: boolean,
    canDeleteRow: boolean,
    rowBgClass: string
  ) => {
    const width = getColumnWidth(colKey);
    const widthStyle = { width, minWidth: width };

    switch (colKey) {
      case 'objectName':
        return (
          <td
            key={colKey}
            style={widthStyle}
            className="py-2.5 px-2.5 border-r border-slate-200 font-medium text-slate-800"
          >
            {onOpenFacilityLocation && canEdit ? (
              <button
                type="button"
                onClick={() => onOpenFacilityLocation(item.objectName)}
                title="Открыть карточку объекта строительства"
                className="inline-flex items-center gap-1 text-left text-slate-800 hover:text-[#1e3799] hover:underline transition-colors cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5 text-[#1e3799] shrink-0" />
                <span>{item.objectName}</span>
              </button>
            ) : (
              item.objectName
            )}
          </td>
        );

      case 'rdCode':
        return (
          <td
            key={colKey}
            style={widthStyle}
            className="py-2.5 px-2.5 border-r border-slate-200 font-mono text-[11px] text-slate-700"
          >
            {item.rdCode}
          </td>
        );

      case 'lineNumber':
        return (
          <td
            key={colKey}
            style={widthStyle}
            className={`py-2.5 px-2.5 border-r border-slate-200 font-mono font-bold text-[#1e3799] whitespace-nowrap sticky left-9 z-10 shadow-[2px_0_4px_-2px_rgba(15,23,42,0.12)] ${rowBgClass}`}
          >
            <div className="flex items-center justify-between gap-1">
              {canEditRow ? (
                <button
                  type="button"
                  onClick={() => onOpenEditLineModal(item)}
                  aria-label={`Редактировать линию ${item.uniqueLineId}`}
                  title="Нажмите для редактирования строки лайнлиста"
                  className="text-left hover:underline cursor-pointer flex items-center gap-1 text-[#1e3799]"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span>{item.lineNumber}</span>
                      <Edit3 className="w-3 h-3 text-slate-400" />
                      {item.recordStatus && item.recordStatus !== 'DRAFT' && (
                        <RecordStatusBadge status={item.recordStatus} compact />
                      )}
                    </div>
                    <div className="text-[10px] font-normal text-slate-400">
                      {item.uniqueLineId}
                    </div>
                  </div>
                </button>
              ) : (
                <div>
                  <div className="flex items-center gap-1.5">
                    <span>{item.lineNumber}</span>
                    {item.recordStatus && item.recordStatus !== 'DRAFT' && (
                      <RecordStatusBadge status={item.recordStatus} compact />
                    )}
                  </div>
                  <div className="text-[10px] font-normal text-slate-400">
                    {item.uniqueLineId}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-0.5">
                {onOpenLineInRegistry && (
                  <button
                    type="button"
                    onClick={() => onOpenLineInRegistry(item.uniqueLineId)}
                    aria-label={`Открыть стыки линии ${item.uniqueLineId} в реестре`}
                    title={`Перейти к стыкам линии ${item.uniqueLineId} в реестре`}
                    className="p-1 rounded hover:bg-sky-100 text-slate-400 hover:text-[#1e3799] cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
                {canDeleteRow &&
                  (status.totalJoints > 0 ? (
                    <span
                      title={`Удаление недоступно: к линии привязано стыков — ${status.totalJoints}`}
                      className="p-1 rounded text-slate-300 cursor-not-allowed inline-flex items-center"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </span>
                  ) : confirmDeleteLineId !== item.id ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteLineId(item.id);
                      }}
                      aria-label={`Удалить линию ${item.lineNumber}`}
                      title={`Удалить линию ${item.lineNumber}`}
                      className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteLineItems([item.id]);
                          setConfirmDeleteLineId(null);
                        }}
                        className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold hover:bg-red-700 cursor-pointer"
                      >
                        Удалить
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteLineId(null);
                        }}
                        className="px-1.5 py-0.5 rounded bg-white border border-slate-300 text-slate-600 text-[10px] cursor-pointer"
                      >
                        Отмена
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </td>
        );

      case 'lineName':
        return (
          <td
            key={colKey}
            style={widthStyle}
            className="py-2.5 px-2.5 border-r border-slate-200 text-slate-900 font-medium"
          >
            {item.lineName || <span className="text-slate-300">—</span>}
          </td>
        );

      case 'product':
        return (
          <td
            key={colKey}
            style={widthStyle}
            className="py-2.5 px-2.5 border-r border-slate-200 text-slate-700"
          >
            {item.product || <span className="text-slate-300">—</span>}
          </td>
        );

      case 'testContour':
        return (
          <td
            key={colKey}
            style={widthStyle}
            className="py-2.5 px-2.5 border-r border-slate-200 text-slate-700"
          >
            {(() => {
              const bindings = lineCircuitsMap?.get(item.uniqueLineId);
              if (!bindings || bindings.length === 0) {
                return item.testContour || (
                  <span className="text-slate-400">—</span>
                );
              }
              return (
                <div className="flex flex-wrap gap-1">
                  {bindings.map((b) => (
                    <button
                      key={b.circuitId}
                      type="button"
                      onClick={() => onOpenTestingCircuits?.()}
                      title={
                        b.isFull
                          ? `${b.circuitName}: назначена вся линия, ${b.assigned} из ${b.total} ст.`
                          : `${b.circuitName}: частичное назначение, ${b.assigned} из ${b.total} ст.`
                      }
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold border transition-colors ${
                        onOpenTestingCircuits ? 'cursor-pointer hover:brightness-95' : ''
                      } ${
                        b.isFull
                          ? 'bg-[#eef4fc] text-[#1e3799] border-[#1e3799]/25'
                          : 'bg-amber-50 text-amber-900 border-amber-300'
                      }`}
                    >
                      <Gauge className="w-3 h-3 shrink-0" />
                      <span className="truncate max-w-[140px]">{b.circuitName}</span>
                      {!b.isFull && (
                        <span className="font-mono text-[10px] opacity-80">
                          {b.assigned}/{b.total}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              );
            })()}
          </td>
        );

      case 'weldingNtd':
        return (
          <td
            key={colKey}
            style={widthStyle}
            className="py-2.5 px-2.5 border-r border-slate-200 text-slate-700"
          >
            {item.weldingNtd || <span className="text-slate-300">—</span>}
          </td>
        );

      case 'controlNtd':
        return (
          <td
            key={colKey}
            style={widthStyle}
            className="py-2.5 px-2.5 border-r border-slate-200 text-slate-700"
          >
            {item.controlNtd || <span className="text-slate-300">—</span>}
          </td>
        );

      case 'qualityLevel':
        return (
          <td
            key={colKey}
            style={widthStyle}
            className="py-2.5 px-2.5 border-r border-slate-200 text-center font-semibold text-[#1e3799] whitespace-nowrap"
          >
            {item.qualityLevel || (
              <span className="text-slate-300 font-normal">—</span>
            )}
          </td>
        );

      case 'pipelineCategory':
        return (
          <td
            key={colKey}
            style={widthStyle}
            className="py-2.5 px-2.5 border-r border-slate-200 text-center font-mono font-semibold text-slate-800"
          >
            {item.pipelineCategory || (
              <span className="text-slate-300 font-normal">—</span>
            )}
          </td>
        );

      case 'workingPressure':
        return (
          <td
            key={colKey}
            style={widthStyle}
            className="py-2.5 px-2.5 border-r border-slate-200 text-right font-mono text-slate-800 whitespace-nowrap"
          >
            {item.workingPressure || <span className="text-slate-300">—</span>}
          </td>
        );

      case 'workingTemperature':
        return (
          <td
            key={colKey}
            style={widthStyle}
            className="py-2.5 px-2.5 border-r border-slate-200 text-right font-mono text-slate-800 whitespace-nowrap"
          >
            {item.workingTemperature || <span className="text-slate-300">—</span>}
          </td>
        );

      case 'rkPercent':
        return (
          <td
            key={colKey}
            style={widthStyle}
            className="py-2.5 px-2 border-r border-slate-200 text-right font-mono font-semibold text-slate-800"
          >
            {item.rkPercent}%
          </td>
        );

      case 'uzkPercent':
        return (
          <td
            key={colKey}
            style={widthStyle}
            className="py-2.5 px-2 border-r border-slate-200 text-right font-mono font-semibold text-slate-800"
          >
            {item.uzkPercent}%
          </td>
        );

      case 'pvkPercent':
        return (
          <td
            key={colKey}
            style={widthStyle}
            className="py-2.5 px-2 border-r border-slate-200 text-right font-mono font-semibold text-slate-800"
          >
            {item.pvkPercent}%
          </td>
        );

      case 'readinessProgress':
        return (
          <td
            key={colKey}
            style={widthStyle}
            className="py-2 px-2.5 border-r border-slate-200"
          >
            {status.totalJoints === 0 ? (
              <span
                className="text-slate-400 font-mono text-[11px]"
                title="Стыки не внесены"
              >
                —
              </span>
            ) : (
              <div
                className="space-y-1"
                title={`Стыки: ${status.weldedJoints} из ${status.totalJoints}, ${status.jointsReadinessPct}% · EDI: ${status.weldedEdi} из ${status.totalEdi}, ${status.ediReadinessPct}%`}
              >
                <div className="flex items-center justify-between gap-2 text-[11px] leading-tight">
                  <span className="font-mono font-bold text-[#1e3799]">
                    {status.jointsReadinessPct}%
                  </span>
                  <span className="font-mono text-[10px] text-slate-500 whitespace-nowrap">
                    {status.weldedJoints}/{status.totalJoints} ст.
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      status.jointsReadinessPct >= 100
                        ? 'bg-emerald-500'
                        : 'bg-[#1e3799]'
                    }`}
                    style={{
                      width: `${Math.min(100, Math.max(0, status.jointsReadinessPct))}%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 text-[10px] leading-tight">
                  <span className="font-mono font-semibold text-slate-700">
                    {status.ediReadinessPct}%
                  </span>
                  <span className="font-mono text-slate-500 whitespace-nowrap">
                    {status.weldedEdi}/{status.totalEdi} EDI
                  </span>
                </div>
              </div>
            )}
          </td>
        );

      case 'computedStatus':
        return (
          <td
            key={colKey}
            style={widthStyle}
            className="py-2.5 px-3 border-r border-slate-200"
          >
            <div className="flex flex-col gap-1">
              <div>
                {status.ndtStatus === 'sufficient' ? (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs"
                    title={status.statusLabel}
                  >
                    <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-700" />
                    <span>НК ✓</span>
                  </span>
                ) : status.ndtStatus === 'insufficient' ? (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs"
                    title={status.statusLabel}
                  >
                    <AlertTriangle className="w-3 h-3 shrink-0 text-amber-700" />
                    <span>НК !</span>
                  </span>
                ) : (
                  <span
                    className="text-slate-400 font-mono text-[11px] px-2"
                    title={status.statusLabel}
                  >
                    —
                  </span>
                )}
              </div>
              {onChangeLineStatus && (
                <RecordStatusActions
                  status={item.recordStatus}
                  recordLabel={`Линия ${item.uniqueLineId}`}
                  allowedDepartments={['PTO']}
                  compact
                  onChangeStatus={async (targetStatus, reason) => {
                    await onChangeLineStatus(item, targetStatus, reason);
                  }}
                />
              )}
            </div>
          </td>
        );

      case 'idStatus':
        return (
          <td
            key={colKey}
            style={widthStyle}
            className="py-2.5 px-2.5 border-r border-slate-200 whitespace-nowrap"
          >
            {normalizeExecutiveDocStatus(item.idStatus) === 'SIGNED' ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-700" />
                <span>{formatExecutiveDocStatusLabel(item.idStatus)}</span>
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-300">
                {formatExecutiveDocStatusLabel(item.idStatus)}
              </span>
            )}
          </td>
        );

      case 'responsiblePto':
        return (
          <td
            key={colKey}
            style={widthStyle}
            className="py-2.5 px-2.5 border-r border-slate-200 text-slate-700"
          >
            {item.responsiblePto?.trim() ? (
              <span className="font-medium text-slate-800">
                {item.responsiblePto.trim()}
              </span>
            ) : (
              <span className="text-slate-300">—</span>
            )}
          </td>
        );

      case 'testDate':
        return (
          <td
            key={colKey}
            style={widthStyle}
            className="py-2.5 px-2.5 text-center font-mono font-semibold text-slate-800 whitespace-nowrap"
          >
            {canEditRow ? (
              <button
                type="button"
                onClick={() => onOpenEditLineModal(item)}
                className="hover:text-[#1e3799] hover:underline cursor-pointer"
                title="Нажмите для редактирования строки лайнлиста"
              >
                {formatDateDDMMYY(item.testDate) || '—'}
              </button>
            ) : (
              <span>{formatDateDDMMYY(item.testDate) || '—'}</span>
            )}
          </td>
        );

      default:
        return null;
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      <div
        ref={scrollContainerRef}
        className="overflow-x-auto overflow-y-auto min-h-[420px] max-h-[calc(100vh-290px)] table-scroll-container"
      >
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-20 shadow-xs">
            <tr className="bg-[#1e3799] text-white select-none">
              {/* Чекбокс выбора всех строк лайнлиста */}
              <th className="py-2.5 px-2.5 border-r border-white/15 w-9 min-w-9 text-center sticky left-0 top-0 z-30 bg-[#1e3799]">
                <input
                  type="checkbox"
                  aria-label="Выбрать все линии в таблице"
                  checked={
                    filteredAndSortedList.length > 0 &&
                    filteredAndSortedList.every((r) => selectedSet.has(r.item.id))
                  }
                  onChange={onToggleSelectAll}
                  className="rounded border-white/40 text-sky-400 focus:ring-sky-300 cursor-pointer"
                />
              </th>

              {activeColumns.map((col) => {
                const isFiltered = columnFilters[col.key] !== undefined;
                const isSorted = sortConfig?.key === col.key;
                const isFilterOpen = openFilterColumnKey === col.key;
                const colWidth = getColumnWidth(col.key, col.minWidth);
                const isPinnedLineNumber = col.key === 'lineNumber';

                return (
                  <th
                    key={col.key}
                    style={{ width: colWidth, minWidth: colWidth }}
                    className={`py-2.5 px-2.5 border-r border-white/15 text-left font-semibold align-middle transition-colors ${
                      isPinnedLineNumber
                        ? 'sticky left-9 top-0 z-30 shadow-[2px_0_4px_-2px_rgba(15,23,42,0.3)]'
                        : 'relative'
                    } ${
                      isFiltered || isFilterOpen
                        ? 'bg-[#15276e]'
                        : 'bg-[#1e3799] hover:bg-[#192f85]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5 pr-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setSortConfig((prev) =>
                            prev?.key === col.key && prev.direction === 'asc'
                              ? { key: col.key, direction: 'desc' }
                              : { key: col.key, direction: 'asc' }
                          )
                        }
                        className="text-left font-semibold text-white hover:text-sky-200 truncate flex items-center gap-1 min-w-0 cursor-pointer"
                        title={`Сортировать по столбцу «${col.label}»`}
                      >
                        <span className="truncate">{col.shortLabel || col.label}</span>
                        {isSorted &&
                          (sortConfig.direction === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-sky-300 shrink-0" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-sky-300 shrink-0" />
                          ))}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenFilterColumnKey(
                            openFilterColumnKey === col.key ? null : col.key
                          );
                        }}
                        aria-label={`Фильтр для столбца ${col.label}`}
                        title="Фильтр по значениям столбца"
                        className={`p-1 rounded transition-colors shrink-0 cursor-pointer ${
                          isFiltered
                            ? 'bg-sky-400 text-[#1e3799] font-bold'
                            : 'text-sky-200 hover:bg-white/15 hover:text-white'
                        }`}
                      >
                        <Filter className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Интерактивная ручка изменения ширины столбца */}
                    <div
                      onPointerDown={(e) =>
                        handleResizeStart(e, col.key, colWidth, col.minWidth)
                      }
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        handleAutoFit(
                          col.key,
                          Math.max(col.minWidth, (col.shortLabel || col.label).length * 10 + 65)
                        );
                      }}
                      title="Потяните для изменения ширины. Двойной клик — автоподбор"
                      className="absolute top-0 right-0 bottom-0 w-2.5 cursor-col-resize select-none z-10"
                    />

                    {isFilterOpen && (
                      <LineListExcelFilterPopover
                        column={col}
                        uniqueValues={getUniqueValuesForColumn(col.key)}
                        selectedValues={columnFilters[col.key]}
                        onApplyFilter={(k, vals) =>
                          setColumnFilters((prev) => ({ ...prev, [k]: vals }))
                        }
                        sortConfig={sortConfig}
                        onSort={(k, dir) => setSortConfig({ key: k, direction: dir })}
                        onClose={() => setOpenFilterColumnKey(null)}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredAndSortedList.length === 0 ? (
              <tr>
                <td
                  colSpan={activeColumns.length + 1}
                  className="py-10 text-center text-slate-400"
                >
                  Линии по заданным условиям фильтрации не найдены
                </td>
              </tr>
            ) : (
              <>
                {paddingTop > 0 && (
                  <tr aria-hidden="true">
                    <td
                      colSpan={activeColumns.length + 1}
                      style={{ height: `${paddingTop}px`, padding: 0, border: 0 }}
                    />
                  </tr>
                )}
                {virtualRows.map((virtualRow) => {
                  const rowIdx = virtualRow.index;
                  const { item, status } = filteredAndSortedList[rowIdx];
                  const isSelected = selectedSet.has(item.id);
                  const rowEditCheck = currentUser
                    ? canUserMutateRecord(currentUser, item, ['PTO'], 'edit', true)
                    : { allowed: canEdit };
                  const rowDeleteCheck = currentUser
                    ? canUserMutateRecord(currentUser, item, ['PTO'], 'delete', true)
                    : { allowed: canEdit };
                  const canEditRow = canEdit && rowEditCheck.allowed;
                  const canDeleteRow = canEdit && rowDeleteCheck.allowed;
                  const rowBgClass = isSelected
                    ? 'bg-[#e8f1fc]'
                    : rowIdx % 2 === 0
                      ? 'bg-white'
                      : 'bg-slate-50';
                  return (
                    <tr
                      key={item.id}
                      data-index={rowIdx}
                      ref={rowVirtualizer.measureElement}
                      onDoubleClick={() => {
                        if (canEditRow) onOpenEditLineModal(item);
                      }}
                      className={`transition-colors ${rowBgClass} hover:bg-sky-50`}
                    >
                      <td
                        className={`py-2.5 px-2.5 border-r border-slate-200 w-9 min-w-9 text-center sticky left-0 z-10 ${rowBgClass}`}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Выбрать линию ${item.uniqueLineId}`}
                          checked={isSelected}
                          onChange={() => onToggleSelectRow(item.id)}
                          disabled={!canEditRow && !canSelectForCircuit}
                          className="rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799] cursor-pointer disabled:opacity-40"
                        />
                      </td>
                      {activeColumns.map((col) =>
                        renderCell(
                          col.key,
                          item,
                          status,
                          canEditRow,
                          canDeleteRow,
                          rowBgClass
                        )
                      )}
                    </tr>
                  );
                })}
                {paddingBottom > 0 && (
                  <tr aria-hidden="true">
                    <td
                      colSpan={activeColumns.length + 1}
                      style={{ height: `${paddingBottom}px`, padding: 0, border: 0 }}
                    />
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2.5 bg-[#f8fafd] border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <div className="flex items-center gap-3">
          <div>
            Отображено технологических линий:{' '}
            <span className="font-mono font-bold text-slate-800">
              {filteredAndSortedList.length}
            </span>{' '}
            из <span className="font-mono">{totalLinesCount}</span>
          </div>
          {hasCustomWidths && (
            <button
              type="button"
              onClick={onResetWidths}
              title="Сбросить пользовательские ширины столбцов лайнлиста к исходным"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-[11px] transition-colors shadow-2xs cursor-pointer"
            >
              <RotateCcw className="w-3 h-3 text-slate-400" />
              <span>Сбросить ширину столбцов</span>
            </button>
          )}
        </div>
        <div>
          Нажмите на номер линии или дважды на строку для редактирования
        </div>
      </div>
    </div>
  );
};
