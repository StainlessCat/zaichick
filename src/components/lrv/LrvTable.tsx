import React, { useMemo } from 'react';
import { RotateCcw } from 'lucide-react';
import { LRVItem, WeldJoint } from '../../types/welding';
import { MaterialBatchAct } from '../../types/materialControl';
import { TableColumnFilterHeader } from '../TableColumnFilterPopover';
import { getCascadingFilterRows } from '../../utils/filters';
import { ColumnResizeHandle } from '../../utils/useResizableColumns';
import { LrvTableRow } from './LrvTableRow';

const LRV_FILTER_COLUMN_KEYS = [
  'lrvCode',
  'rdCode',
  'shortName',
  'marking',
  'fullName',
  'category',
  'pnMpa',
  'connectionType',
  'material',
  'ntd',
  'manufacturer',
  'dn1',
  'diameterMm',
  'wallThickness',
  'dn2',
  'diameterMm2',
  'wallThickness2',
  'specQty',
  'controlStatus',
  'balance',
] as const;

interface LrvTableProps {
  items: LRVItem[];
  allFilteredItems: LRVItem[];
  rdScopedCatalog: LRVItem[];
  totalCatalogCount: number;
  selectedLrvIds: string[];
  onToggleSelectAll: () => void;
  onToggleSelectRow: (id: string) => void;
  expandedMaterialIds: Record<string, boolean>;
  onToggleExpand: (id: string) => void;
  canEdit: boolean;
  onEdit: (item: LRVItem) => void;
  onDeleteRequest: (item: LRVItem) => void;
  confirmDeleteId: string | null;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: () => void;
  onAddAct: (item: LRVItem) => void;
  onInitiateReplacement: (material: LRVItem, batch: MaterialBatchAct) => void;
  onDeleteLrvItems?: (ids: string[]) => void;
  joints?: WeldJoint[];
  // Resizable columns
  getColumnWidth: (key: string) => number;
  handleResizeStart: (
    e: React.PointerEvent,
    colKey: string,
    currentWidth: number,
    minWidth?: number
  ) => void;
  handleAutoFit: (colKey: string, defaultWidth?: number) => void;
  handleResetWidths: () => void;
  hasCustomWidths: boolean;
  // Filters and sorting
  columnFilters: Record<string, string[]>;
  onApplyColumnFilter: (colKey: string, vals: string[] | undefined) => void;
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  onSortColumn: (colKey: string, direction: 'asc' | 'desc') => void;
  lrvColumnGetters: Record<string, (item: LRVItem) => string>;
}

export const LrvTable: React.FC<LrvTableProps> = ({
  items,
  allFilteredItems,
  rdScopedCatalog,
  totalCatalogCount,
  selectedLrvIds,
  onToggleSelectAll,
  onToggleSelectRow,
  expandedMaterialIds,
  onToggleExpand,
  canEdit,
  onEdit,
  onDeleteRequest,
  confirmDeleteId,
  onConfirmDelete,
  onCancelDelete,
  onAddAct,
  onInitiateReplacement,
  onDeleteLrvItems,
  joints,
  getColumnWidth,
  handleResizeStart,
  handleAutoFit,
  handleResetWidths,
  hasCustomWidths,
  columnFilters,
  onApplyColumnFilter,
  sortConfig,
  onSortColumn,
  lrvColumnGetters,
}) => {
  const allSelected =
    allFilteredItems.length > 0 &&
    allFilteredItems.every((item) => selectedLrvIds.includes(item.id));

  // Каскадная кросс-фильтрация: каждый столбец показывает только значения из строк,
  // прошедших все остальные активные фильтры столбцов (как в Excel AutoFilter)
  const cascadingRowsByColumn = useMemo(() => {
    const map: Record<string, LRVItem[]> = {};
    for (const colKey of LRV_FILTER_COLUMN_KEYS) {
      map[colKey] = getCascadingFilterRows(
        rdScopedCatalog,
        columnFilters,
        colKey,
        lrvColumnGetters
      );
    }
    return map;
  }, [rdScopedCatalog, columnFilters, lrvColumnGetters]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
      <div className="overflow-x-auto overflow-y-auto min-h-[380px] max-h-[calc(100vh-250px)] table-scroll-container">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-20 shadow-xs">
            <tr className="bg-[#1e3799] text-white text-left">
              <th
                className="py-2.5 px-2 border-r border-white/15 w-8 min-w-[32px] max-w-[32px] text-center sticky left-0 top-0 z-30 bg-[#1e3799]"
                title="Раскрыть перечень актов"
              />
              {onDeleteLrvItems && (
                <th className="py-2.5 px-2.5 border-r border-white/15 w-9 min-w-[36px] max-w-[36px] text-center sticky left-8 top-0 z-30 bg-[#1e3799]">
                  <input
                    type="checkbox"
                    aria-label="Выбрать все материалы"
                    checked={allSelected}
                    onChange={onToggleSelectAll}
                    className="rounded border-white/40 text-sky-400 focus:ring-sky-300 cursor-pointer"
                  />
                </th>
              )}
              <TableColumnFilterHeader
                columnKey="lrvCode"
                label="Код ЛРВ"
                rows={cascadingRowsByColumn.lrvCode}
                getValue={lrvColumnGetters.lrvCode}
                activeFilters={columnFilters}
                onApplyFilter={onApplyColumnFilter}
                sortConfig={sortConfig}
                onSort={onSortColumn}
                width={getColumnWidth('lrvCode')}
                minWidth={90}
                onResizeStart={handleResizeStart}
                onAutoFit={() => handleAutoFit('lrvCode', 140)}
              />
              <TableColumnFilterHeader
                columnKey="rdCode"
                label="Шифр РД"
                rows={cascadingRowsByColumn.rdCode}
                getValue={lrvColumnGetters.rdCode}
                activeFilters={columnFilters}
                onApplyFilter={onApplyColumnFilter}
                sortConfig={sortConfig}
                onSort={onSortColumn}
                width={getColumnWidth('rdCode')}
                minWidth={110}
                onResizeStart={handleResizeStart}
                onAutoFit={() => handleAutoFit('rdCode', 180)}
              />
              <TableColumnFilterHeader
                columnKey="shortName"
                label="Краткое наименование"
                rows={cascadingRowsByColumn.shortName}
                getValue={lrvColumnGetters.shortName}
                activeFilters={columnFilters}
                onApplyFilter={onApplyColumnFilter}
                sortConfig={sortConfig}
                onSort={onSortColumn}
                width={getColumnWidth('shortName')}
                minWidth={130}
                onResizeStart={handleResizeStart}
                onAutoFit={() => handleAutoFit('shortName', 200)}
              />
              <TableColumnFilterHeader
                columnKey="marking"
                label="Маркировка"
                rows={cascadingRowsByColumn.marking}
                getValue={lrvColumnGetters.marking}
                activeFilters={columnFilters}
                onApplyFilter={onApplyColumnFilter}
                sortConfig={sortConfig}
                onSort={onSortColumn}
                width={getColumnWidth('marking')}
                minWidth={100}
                onResizeStart={handleResizeStart}
                onAutoFit={() => handleAutoFit('marking', 150)}
              />
              <TableColumnFilterHeader
                columnKey="fullName"
                label="Полное наименование"
                rows={cascadingRowsByColumn.fullName}
                getValue={lrvColumnGetters.fullName}
                activeFilters={columnFilters}
                onApplyFilter={onApplyColumnFilter}
                sortConfig={sortConfig}
                onSort={onSortColumn}
                width={getColumnWidth('fullName')}
                minWidth={150}
                onResizeStart={handleResizeStart}
                onAutoFit={() => handleAutoFit('fullName', 240)}
              />
              <TableColumnFilterHeader
                columnKey="category"
                label="Категория"
                rows={cascadingRowsByColumn.category}
                getValue={lrvColumnGetters.category}
                activeFilters={columnFilters}
                onApplyFilter={onApplyColumnFilter}
                sortConfig={sortConfig}
                onSort={onSortColumn}
                width={getColumnWidth('category')}
                minWidth={90}
                onResizeStart={handleResizeStart}
                onAutoFit={() => handleAutoFit('category', 110)}
              />
              <TableColumnFilterHeader
                columnKey="pnMpa"
                label="Давление PN, МПа"
                rows={cascadingRowsByColumn.pnMpa}
                getValue={lrvColumnGetters.pnMpa}
                activeFilters={columnFilters}
                onApplyFilter={onApplyColumnFilter}
                sortConfig={sortConfig}
                onSort={onSortColumn}
                width={getColumnWidth('pnMpa')}
                minWidth={90}
                onResizeStart={handleResizeStart}
                onAutoFit={() => handleAutoFit('pnMpa', 120)}
              />
              <TableColumnFilterHeader
                columnKey="connectionType"
                label="Подсоединение"
                rows={cascadingRowsByColumn.connectionType}
                getValue={lrvColumnGetters.connectionType}
                activeFilters={columnFilters}
                onApplyFilter={onApplyColumnFilter}
                sortConfig={sortConfig}
                onSort={onSortColumn}
                width={getColumnWidth('connectionType')}
                minWidth={90}
                onResizeStart={handleResizeStart}
                onAutoFit={() => handleAutoFit('connectionType', 120)}
              />
              <TableColumnFilterHeader
                columnKey="material"
                label="Материал"
                rows={cascadingRowsByColumn.material}
                getValue={lrvColumnGetters.material}
                activeFilters={columnFilters}
                onApplyFilter={onApplyColumnFilter}
                sortConfig={sortConfig}
                onSort={onSortColumn}
                width={getColumnWidth('material')}
                minWidth={90}
                onResizeStart={handleResizeStart}
                onAutoFit={() => handleAutoFit('material', 130)}
              />
              <TableColumnFilterHeader
                columnKey="ntd"
                label="НТД"
                rows={cascadingRowsByColumn.ntd}
                getValue={lrvColumnGetters.ntd}
                activeFilters={columnFilters}
                onApplyFilter={onApplyColumnFilter}
                sortConfig={sortConfig}
                onSort={onSortColumn}
                width={getColumnWidth('ntd')}
                minWidth={90}
                onResizeStart={handleResizeStart}
                onAutoFit={() => handleAutoFit('ntd', 140)}
              />
              <TableColumnFilterHeader
                columnKey="manufacturer"
                label="Завод-изготовитель"
                rows={cascadingRowsByColumn.manufacturer}
                getValue={lrvColumnGetters.manufacturer}
                activeFilters={columnFilters}
                onApplyFilter={onApplyColumnFilter}
                sortConfig={sortConfig}
                onSort={onSortColumn}
                width={getColumnWidth('manufacturer')}
                minWidth={100}
                onResizeStart={handleResizeStart}
                onAutoFit={() => handleAutoFit('manufacturer', 160)}
              />
              <TableColumnFilterHeader
                columnKey="dn1"
                label="DN 1"
                rows={cascadingRowsByColumn.dn1}
                getValue={lrvColumnGetters.dn1}
                activeFilters={columnFilters}
                onApplyFilter={onApplyColumnFilter}
                sortConfig={sortConfig}
                onSort={onSortColumn}
                align="right"
                width={getColumnWidth('dn1')}
                minWidth={70}
                onResizeStart={handleResizeStart}
                onAutoFit={() => handleAutoFit('dn1', 90)}
              />
              <TableColumnFilterHeader
                columnKey="diameterMm"
                label="Диаметр Ø1, мм"
                rows={cascadingRowsByColumn.diameterMm}
                getValue={lrvColumnGetters.diameterMm}
                activeFilters={columnFilters}
                onApplyFilter={onApplyColumnFilter}
                sortConfig={sortConfig}
                onSort={onSortColumn}
                align="right"
                width={getColumnWidth('diameterMm')}
                minWidth={80}
                onResizeStart={handleResizeStart}
                onAutoFit={() => handleAutoFit('diameterMm', 110)}
              />
              <TableColumnFilterHeader
                columnKey="wallThickness"
                label="Толщина стенки S1, мм"
                rows={cascadingRowsByColumn.wallThickness}
                getValue={lrvColumnGetters.wallThickness}
                activeFilters={columnFilters}
                onApplyFilter={onApplyColumnFilter}
                sortConfig={sortConfig}
                onSort={onSortColumn}
                align="right"
                width={getColumnWidth('wallThickness')}
                minWidth={80}
                onResizeStart={handleResizeStart}
                onAutoFit={() => handleAutoFit('wallThickness', 110)}
              />
              <TableColumnFilterHeader
                columnKey="dn2"
                label="DN 2"
                rows={cascadingRowsByColumn.dn2}
                getValue={lrvColumnGetters.dn2}
                activeFilters={columnFilters}
                onApplyFilter={onApplyColumnFilter}
                sortConfig={sortConfig}
                onSort={onSortColumn}
                align="right"
                width={getColumnWidth('dn2')}
                minWidth={70}
                onResizeStart={handleResizeStart}
                onAutoFit={() => handleAutoFit('dn2', 90)}
              />
              <TableColumnFilterHeader
                columnKey="diameterMm2"
                label="Диаметр Ø2, мм"
                rows={cascadingRowsByColumn.diameterMm2}
                getValue={lrvColumnGetters.diameterMm2}
                activeFilters={columnFilters}
                onApplyFilter={onApplyColumnFilter}
                sortConfig={sortConfig}
                onSort={onSortColumn}
                align="right"
                width={getColumnWidth('diameterMm2')}
                minWidth={80}
                onResizeStart={handleResizeStart}
                onAutoFit={() => handleAutoFit('diameterMm2', 110)}
              />
              <TableColumnFilterHeader
                columnKey="wallThickness2"
                label="Толщина стенки S2, мм"
                rows={cascadingRowsByColumn.wallThickness2}
                getValue={lrvColumnGetters.wallThickness2}
                activeFilters={columnFilters}
                onApplyFilter={onApplyColumnFilter}
                sortConfig={sortConfig}
                onSort={onSortColumn}
                align="right"
                width={getColumnWidth('wallThickness2')}
                minWidth={80}
                onResizeStart={handleResizeStart}
                onAutoFit={() => handleAutoFit('wallThickness2', 110)}
              />
              <TableColumnFilterHeader
                columnKey="specQty"
                label="Кол-во по спец."
                rows={cascadingRowsByColumn.specQty}
                getValue={lrvColumnGetters.specQty}
                activeFilters={columnFilters}
                onApplyFilter={onApplyColumnFilter}
                sortConfig={sortConfig}
                onSort={onSortColumn}
                align="right"
                width={getColumnWidth('specQty')}
                minWidth={85}
                onResizeStart={handleResizeStart}
                onAutoFit={() => handleAutoFit('specQty', 110)}
              />
              <TableColumnFilterHeader
                columnKey="controlStatus"
                label="Статус контроля"
                rows={cascadingRowsByColumn.controlStatus}
                getValue={lrvColumnGetters.controlStatus}
                activeFilters={columnFilters}
                onApplyFilter={onApplyColumnFilter}
                sortConfig={sortConfig}
                onSort={onSortColumn}
                align="center"
                width={getColumnWidth('controlStatus')}
                minWidth={110}
                onResizeStart={handleResizeStart}
                onAutoFit={() => handleAutoFit('controlStatus', 140)}
              />
              <TableColumnFilterHeader
                columnKey="balance"
                label="Баланс допуска"
                rows={cascadingRowsByColumn.balance}
                getValue={lrvColumnGetters.balance}
                activeFilters={columnFilters}
                onApplyFilter={onApplyColumnFilter}
                sortConfig={sortConfig}
                onSort={onSortColumn}
                width={getColumnWidth('balance')}
                minWidth={120}
                onResizeStart={handleResizeStart}
                onAutoFit={() => handleAutoFit('balance', 140)}
              />
              {onDeleteLrvItems && (
                <th
                  style={{
                    width: getColumnWidth('action'),
                    minWidth: getColumnWidth('action'),
                  }}
                  className="relative py-2.5 px-3 font-semibold text-center whitespace-nowrap"
                >
                  Действие
                  <ColumnResizeHandle
                    onResizeStart={handleResizeStart}
                    onAutoFit={() => handleAutoFit('action', 95)}
                    colKey="action"
                    currentWidth={getColumnWidth('action')}
                    minWidth={70}
                  />
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {items.map((item) => (
              <LrvTableRow
                key={item.id}
                item={item}
                isSelected={selectedLrvIds.includes(item.id)}
                onToggleSelect={onToggleSelectRow}
                isExpanded={Boolean(expandedMaterialIds[item.id])}
                onToggleExpand={onToggleExpand}
                canEdit={canEdit}
                onEdit={onEdit}
                onDeleteRequest={onDeleteRequest}
                confirmDeleteId={confirmDeleteId}
                onConfirmDelete={onConfirmDelete}
                onCancelDelete={onCancelDelete}
                onAddAct={onAddAct}
                onInitiateReplacement={onInitiateReplacement}
                onDeleteLrvItems={onDeleteLrvItems}
                joints={joints}
                getColumnWidth={getColumnWidth}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2.5 bg-[#f8fafd] border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <div className="flex items-center gap-3">
          <div>
            Показано позиций ЛРВ:{' '}
            <span className="font-mono font-bold text-slate-800">
              {allFilteredItems.length}
            </span>{' '}
            из <span className="font-mono">{totalCatalogCount}</span>
          </div>
          {hasCustomWidths && (
            <button
              type="button"
              onClick={handleResetWidths}
              title="Сбросить пользовательские ширины столбцов таблицы материалов"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-[11px] transition-colors shadow-2xs cursor-pointer"
            >
              <RotateCcw className="w-3 h-3 text-slate-400" />
              <span>Сбросить ширину столбцов</span>
            </button>
          )}
        </div>
        <div>
          Ширину столбцов можно регулировать перетаскиванием правой границы заголовка (двойной клик — автоподбор)
        </div>
      </div>
    </div>
  );
};
