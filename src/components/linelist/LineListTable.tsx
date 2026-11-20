import React from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Edit3,
  ExternalLink,
  Filter,
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
  LINELIST_COLUMNS,
} from '../../utils/weldingLogic';
import { canUserMutateRecord } from '../../utils/rbac';
import { RecordStatusActions, RecordStatusBadge } from '../RecordStatusControls';
import { LineListExcelFilterPopover } from './LineListExcelFilterPopover';
import { SortConfig } from './types';

interface LineListTableProps {
  filteredAndSortedList: {
    item: ProjectLineItem;
    status: ReturnType<typeof computeLineListItemStatus>;
  }[];
  selectedLineIds: string[];
  onToggleSelectAll: () => void;
  onToggleSelectRow: (id: string) => void;
  canEdit: boolean;
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
  selectedLineIds,
  onToggleSelectAll,
  onToggleSelectRow,
  canEdit,
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
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="overflow-x-auto overflow-y-auto min-h-[420px] max-h-[calc(100vh-250px)] table-scroll-container">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-20 shadow-xs">
            <tr className="bg-[#1e3799] text-white select-none">
              {/* Чекбокс выбора всех строк лайнлиста */}
              <th className="py-2.5 px-2.5 border-r border-white/15 w-9 text-center sticky left-0 top-0 z-30 bg-[#1e3799]">
                <input
                  type="checkbox"
                  aria-label="Выбрать все линии в таблице"
                  checked={
                    filteredAndSortedList.length > 0 &&
                    filteredAndSortedList.every((r) =>
                      selectedLineIds.includes(r.item.id)
                    )
                  }
                  onChange={onToggleSelectAll}
                  className="rounded border-white/40 text-sky-400 focus:ring-sky-300 cursor-pointer"
                />
              </th>

              {LINELIST_COLUMNS.map((col) => {
                const isFiltered = columnFilters[col.key] !== undefined;
                const isSorted = sortConfig?.key === col.key;
                const isFilterOpen = openFilterColumnKey === col.key;
                const colWidth = getColumnWidth(col.key, col.minWidth);

                return (
                  <th
                    key={col.key}
                    style={{ width: colWidth, minWidth: colWidth }}
                    className={`relative py-2.5 px-2.5 border-r border-white/15 text-left font-semibold align-middle transition-colors ${
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
                        aria-label={`Фильтр Excel для столбца ${col.label}`}
                        title="Фильтр как в Excel (автофокус курсора)"
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
                  colSpan={LINELIST_COLUMNS.length + 1}
                  className="py-10 text-center text-slate-400"
                >
                  Линии по заданным условиям фильтрации не найдены
                </td>
              </tr>
            ) : (
              filteredAndSortedList.map(({ item, status }) => {
                const isSelected = selectedLineIds.includes(item.id);
                const rowEditCheck = currentUser
                  ? canUserMutateRecord(currentUser, item, ['PTO'], 'edit', false)
                  : { allowed: canEdit };
                const rowDeleteCheck = currentUser
                  ? canUserMutateRecord(currentUser, item, ['PTO'], 'delete', false)
                  : { allowed: canEdit };
                const canEditRow = canEdit && rowEditCheck.allowed;
                const canDeleteRow = canEdit && rowDeleteCheck.allowed;
                return (
                  <tr
                    key={item.id}
                    onDoubleClick={() => {
                      if (canEditRow) onOpenEditLineModal(item);
                    }}
                    className={`transition-colors ${
                      isSelected
                        ? 'bg-[#e8f1fc]'
                        : 'odd:bg-white even:bg-slate-50/70 hover:bg-sky-50/60'
                    }`}
                  >
                    <td className="py-2.5 px-2.5 border-r border-slate-200 text-center sticky left-0 z-10 bg-inherit">
                      <input
                        type="checkbox"
                        aria-label={`Выбрать линию ${item.uniqueLineId}`}
                        checked={isSelected}
                        onChange={() => onToggleSelectRow(item.id)}
                        disabled={!canEditRow}
                        className="rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799] cursor-pointer disabled:opacity-40"
                      />
                    </td>
                    <td
                      style={{
                        width: getColumnWidth('objectName'),
                        minWidth: getColumnWidth('objectName'),
                      }}
                      className="py-2.5 px-2.5 border-r border-slate-200 font-medium text-slate-800"
                    >
                      {onOpenFacilityLocation && canEdit ? (
                        <button
                          type="button"
                          onClick={() => onOpenFacilityLocation(item.objectName)}
                          title="Нажмите на объект, чтобы выбрать или изменить его географическое местоположение (координаты метеопоста)"
                          className="inline-flex items-center gap-1 text-left text-slate-800 hover:text-[#1e3799] hover:underline transition-colors cursor-pointer"
                        >
                          <MapPin className="w-3.5 h-3.5 text-[#1e3799] shrink-0" />
                          <span>{item.objectName}</span>
                        </button>
                      ) : (
                        item.objectName
                      )}
                    </td>
                    <td
                      style={{
                        width: getColumnWidth('rdCode'),
                        minWidth: getColumnWidth('rdCode'),
                      }}
                      className="py-2.5 px-2.5 border-r border-slate-200 font-mono text-[11px] text-slate-700"
                    >
                      {item.rdCode}
                    </td>
                    <td
                      style={{
                        width: getColumnWidth('lineNumber'),
                        minWidth: getColumnWidth('lineNumber'),
                      }}
                      className="py-2.5 px-2.5 border-r border-slate-200 font-mono font-bold text-[#1e3799] whitespace-nowrap"
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
                            (confirmDeleteLineId !== item.id ? (
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
                    <td
                      style={{
                        width: getColumnWidth('lineName'),
                        minWidth: getColumnWidth('lineName'),
                      }}
                      className="py-2.5 px-2.5 border-r border-slate-200 text-slate-900 font-medium"
                    >
                      {item.lineName}
                    </td>
                    <td
                      style={{
                        width: getColumnWidth('product'),
                        minWidth: getColumnWidth('product'),
                      }}
                      className="py-2.5 px-2.5 border-r border-slate-200 text-slate-700"
                    >
                      {item.product}
                    </td>
                    <td
                      style={{
                        width: getColumnWidth('testContour'),
                        minWidth: getColumnWidth('testContour'),
                      }}
                      className="py-2.5 px-2.5 border-r border-slate-200 text-slate-700"
                    >
                      {item.testContour}
                    </td>
                    <td
                      style={{
                        width: getColumnWidth('weldingNtd'),
                        minWidth: getColumnWidth('weldingNtd'),
                      }}
                      className="py-2.5 px-2.5 border-r border-slate-200 text-slate-700"
                    >
                      {item.weldingNtd}
                    </td>
                    <td
                      style={{
                        width: getColumnWidth('controlNtd'),
                        minWidth: getColumnWidth('controlNtd'),
                      }}
                      className="py-2.5 px-2.5 border-r border-slate-200 text-slate-700"
                    >
                      {item.controlNtd}
                    </td>
                    <td
                      style={{
                        width: getColumnWidth('qualityLevel'),
                        minWidth: getColumnWidth('qualityLevel'),
                      }}
                      className="py-2.5 px-2.5 border-r border-slate-200 text-center font-semibold text-[#1e3799] whitespace-nowrap"
                    >
                      {item.qualityLevel || (
                        <span className="text-slate-300 font-normal">—</span>
                      )}
                    </td>
                    <td
                      style={{
                        width: getColumnWidth('pipelineCategory'),
                        minWidth: getColumnWidth('pipelineCategory'),
                      }}
                      className="py-2.5 px-2.5 border-r border-slate-200 text-center font-mono font-semibold text-slate-800"
                    >
                      {item.pipelineCategory || (
                        <span className="text-slate-300 font-normal">—</span>
                      )}
                    </td>
                    <td
                      style={{
                        width: getColumnWidth('workingPressure'),
                        minWidth: getColumnWidth('workingPressure'),
                      }}
                      className="py-2.5 px-2.5 border-r border-slate-200 text-right font-mono text-slate-800 whitespace-nowrap"
                    >
                      {item.workingPressure}
                    </td>
                    <td
                      style={{
                        width: getColumnWidth('workingTemperature'),
                        minWidth: getColumnWidth('workingTemperature'),
                      }}
                      className="py-2.5 px-2.5 border-r border-slate-200 text-right font-mono text-slate-800 whitespace-nowrap"
                    >
                      {item.workingTemperature}
                    </td>
                    <td
                      style={{
                        width: getColumnWidth('rkPercent'),
                        minWidth: getColumnWidth('rkPercent'),
                      }}
                      className="py-2.5 px-2 border-r border-slate-200 text-right font-mono font-semibold text-slate-800"
                    >
                      {item.rkPercent}%
                    </td>
                    <td
                      style={{
                        width: getColumnWidth('uzkPercent'),
                        minWidth: getColumnWidth('uzkPercent'),
                      }}
                      className="py-2.5 px-2 border-r border-slate-200 text-right font-mono font-semibold text-slate-800"
                    >
                      {item.uzkPercent}%
                    </td>
                    <td
                      style={{
                        width: getColumnWidth('pvkPercent'),
                        minWidth: getColumnWidth('pvkPercent'),
                      }}
                      className="py-2.5 px-2 border-r border-slate-200 text-right font-mono font-semibold text-slate-800"
                    >
                      {item.pvkPercent}%
                    </td>
                    <td
                      style={{
                        width: getColumnWidth('computedStatus'),
                        minWidth: getColumnWidth('computedStatus'),
                      }}
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
                    <td
                      style={{
                        width: getColumnWidth('testDate'),
                        minWidth: getColumnWidth('testDate'),
                      }}
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
                  </tr>
                );
              })
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
          Нажмите на номер линии (или дважды на строку) для редактирования строки лайнлиста
        </div>
      </div>
    </div>
  );
};
