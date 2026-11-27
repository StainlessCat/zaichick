import React from 'react';
import { Package } from 'lucide-react';
import { LRVItem } from '../../types/welding';
import { MaterialBatchAct } from '../../types/materialControl';
import { getCascadingFilterRows } from '../../utils/filters';
import { TableColumnFilterHeader } from '../TableColumnFilterPopover';
import { LrvTableRow } from './LrvTableRow';
import { LRV_COLUMN_DEFINITIONS, LrvColumnKey } from './lrvColumns';

export interface LrvSortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

export interface LrvTableProps {
  items: LRVItem[];
  baseItems: LRVItem[];
  allFilteredCount: number;
  totalCatalogCount: number;
  totalActsCount: number;
  canEditCatalog: boolean;
  canManageIncomingControl: boolean;
  visibleColumns: LrvColumnKey[];
  linkedJointsCountById: Map<string, number>;
  selectedLrvIds: string[];
  expandedMaterialIds: Record<string, boolean>;
  confirmDeleteLrvId: string | null;
  columnFilters: Record<string, string[]>;
  sortConfig: LrvSortConfig | null;
  columnValueGetters: Record<string, (row: LRVItem, index: number) => string>;
  getColumnWidth: (key: string, fallbackWidth?: number) => number;
  onResizeStart: (
    e: React.PointerEvent,
    colKey: string,
    currentWidth: number,
    minWidth?: number
  ) => void;
  onAutoFitCol: (colKey: string) => void;
  onApplyColumnFilter: (colKey: string, values: string[] | undefined) => void;
  onApplySort: (colKey: string, direction: 'asc' | 'desc') => void;
  onToggleSelectAll: () => void;
  onToggleSelectRow: (id: string) => void;
  onToggleExpandRow: (id: string) => void;
  onStartEdit: (item: LRVItem) => void;
  onOpenAddAct: (item: LRVItem) => void;
  onOpenEditAct: (item: LRVItem, batch: MaterialBatchAct) => void;
  onDeleteAct: (item: LRVItem, batchId: string) => void;
  onOpenReplaceBatch: (item: LRVItem, batch: MaterialBatchAct) => void;
  onOpenJointsByLrvCode?: (lrvCode: string, rdCode?: string) => void;
  onRequestDeleteOrSupersede: (item: LRVItem) => void;
  onConfirmDeleteSingle: (id: string) => void;
  onCancelConfirmDelete: () => void;
  hasDeleteHandler: boolean;
}

export const LrvTable: React.FC<LrvTableProps> = ({
  items,
  baseItems,
  allFilteredCount,
  totalCatalogCount,
  totalActsCount,
  canEditCatalog,
  canManageIncomingControl,
  visibleColumns,
  linkedJointsCountById,
  selectedLrvIds,
  expandedMaterialIds,
  confirmDeleteLrvId,
  columnFilters,
  sortConfig,
  columnValueGetters,
  getColumnWidth,
  onResizeStart,
  onAutoFitCol,
  onApplyColumnFilter,
  onApplySort,
  onToggleSelectAll,
  onToggleSelectRow,
  onToggleExpandRow,
  onStartEdit,
  onOpenAddAct,
  onOpenEditAct,
  onDeleteAct,
  onOpenReplaceBatch,
  onOpenJointsByLrvCode,
  onRequestDeleteOrSupersede,
  onConfirmDeleteSingle,
  onCancelConfirmDelete,
  hasDeleteHandler,
}) => {
  const showCheckboxes = canEditCatalog && hasDeleteHandler;
  const showActionsCol = canEditCatalog || canManageIncomingControl;

  const activeColumns = LRV_COLUMN_DEFINITIONS.filter((def) => visibleColumns.includes(def.key));
  const totalColSpan = 1 + (showCheckboxes ? 1 : 0) + activeColumns.length + (showActionsCol ? 1 : 0);
  const lrvCodeLeftOffset = showCheckboxes ? 72 : 36;

  const allSelected =
    items.length > 0 && items.every((item) => selectedLrvIds.includes(item.id));

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto max-h-[68vh] overflow-y-auto">
        <table className="w-full text-left border-collapse table-fixed">
          <thead className="sticky top-0 z-20">
            <tr className="bg-[#1e3799] text-white text-[11px] font-semibold select-none">
              <th
                style={{ width: 36, minWidth: 36 }}
                className="px-2 py-2.5 border-r border-white/15 sticky left-0 z-30 bg-[#1e3799]"
                aria-label="Раскрыть акты"
              />

              {showCheckboxes && (
                <th
                  style={{ width: 36, minWidth: 36, left: 36 }}
                  className="px-2 py-2.5 text-center border-r border-white/15 sticky z-30 bg-[#1e3799]"
                >
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={onToggleSelectAll}
                    aria-label="Выбрать все видимые позиции"
                    className="w-3.5 h-3.5 rounded border-white/40 cursor-pointer accent-blue-400"
                  />
                </th>
              )}

              {activeColumns.map((col) => {
                const width = getColumnWidth(col.key, col.defaultWidth);
                const isStickyLrv = col.key === 'lrvCode';
                const getter = columnValueGetters[col.key] || (() => '');

                if (col.filterable !== false) {
                  const cascadingRows = getCascadingFilterRows(
                    baseItems,
                    columnFilters,
                    col.key,
                    columnValueGetters
                  );
                  return (
                    <TableColumnFilterHeader
                      key={col.key}
                      columnKey={col.key}
                      label={col.label}
                      rows={cascadingRows}
                      getValue={getter}
                      activeFilters={columnFilters}
                      onApplyFilter={onApplyColumnFilter}
                      sortConfig={sortConfig}
                      onSort={onApplySort}
                      align={col.align || 'left'}
                      width={width}
                      minWidth={col.minWidth}
                      onResizeStart={onResizeStart}
                      onAutoFit={onAutoFitCol}
                      className={
                        isStickyLrv
                          ? 'px-2.5 py-2.5 border-r border-white/15 sticky z-30 bg-[#1e3799] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.28)]'
                          : 'px-2.5 py-2.5 border-r border-white/15 bg-[#1e3799]'
                      }
                      style={isStickyLrv ? { left: lrvCodeLeftOffset } : undefined}
                    />
                  );
                }

                return (
                  <th
                    key={col.key}
                    style={{ width, minWidth: col.minWidth }}
                    className={`px-2.5 py-2.5 border-r border-white/15 whitespace-nowrap bg-[#1e3799] ${
                      col.align === 'center'
                        ? 'text-center'
                        : col.align === 'right'
                        ? 'text-right'
                        : 'text-left'
                    }`}
                  >
                    {col.label}
                  </th>
                );
              })}

              {showActionsCol && (
                <th
                  style={{ width: canEditCatalog ? 112 : 74, minWidth: canEditCatalog ? 112 : 74 }}
                  className="px-2.5 py-2.5 text-center whitespace-nowrap bg-[#1e3799]"
                >
                  Действия
                </th>
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200 text-xs">
            {items.length === 0 ? (
              <tr>
                <td colSpan={totalColSpan} className="px-6 py-12 text-center text-slate-500">
                  <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold text-slate-700">
                    По текущим фильтрам позиции материалов не найдены
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Измените параметры поиска или сбросьте активные фильтры
                  </p>
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <LrvTableRow
                  key={item.id}
                  item={item}
                  activeColumns={activeColumns}
                  totalColSpan={totalColSpan}
                  showCheckboxes={showCheckboxes}
                  showActionsCol={showActionsCol}
                  canEditCatalog={canEditCatalog}
                  canManageIncomingControl={canManageIncomingControl}
                  lrvCodeLeftOffset={lrvCodeLeftOffset}
                  linkedJointsCount={linkedJointsCountById.get(item.id) ?? 0}
                  isSelected={selectedLrvIds.includes(item.id)}
                  isExpanded={Boolean(expandedMaterialIds[item.id])}
                  isConfirmingDelete={confirmDeleteLrvId === item.id}
                  onToggleSelect={() => onToggleSelectRow(item.id)}
                  onToggleExpand={() => onToggleExpandRow(item.id)}
                  onStartEdit={() => onStartEdit(item)}
                  onOpenAddAct={() => onOpenAddAct(item)}
                  onOpenEditAct={(batch) => onOpenEditAct(item, batch)}
                  onDeleteAct={(batchId) => onDeleteAct(item, batchId)}
                  onOpenReplaceBatch={(batch) => onOpenReplaceBatch(item, batch)}
                  onOpenJointsByLrvCode={onOpenJointsByLrvCode}
                  onRequestDeleteOrSupersede={() => onRequestDeleteOrSupersede(item)}
                  onConfirmDeleteSingle={() => onConfirmDeleteSingle(item.id)}
                  onCancelConfirmDelete={onCancelConfirmDelete}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 tabular-nums">
        <div>
          Показано позиций: <span className="font-semibold text-slate-700">{allFilteredCount}</span> из{' '}
          <span className="font-semibold text-slate-700">{totalCatalogCount}</span>
          <span className="mx-2 text-slate-300">·</span>
          Актов входного контроля: <span className="font-semibold text-slate-700">{totalActsCount}</span>
        </div>
        <div>Нажмите на стрелку слева для просмотра партий и актов входного контроля</div>
      </div>
    </div>
  );
};
