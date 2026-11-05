import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bookmark,
  Calendar,
  CheckCircle2,
  Clock,
  Columns,
  FilePlus2,
  FileSpreadsheet,
  Filter,
  Layers,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  ColumnDefinition,
  ColumnTemplate,
  WeldJoint,
  WeldJointFieldKey,
} from '../types/welding';
import {
  ALL_COLUMNS,
  FIELD_LABELS_MAP,
  formatDateDDMMYY,
  getJointEquivDiaInch,
  isDateColumnKey,
} from '../utils/weldingLogic';
import { getUserRolePermissions } from '../utils/rbac';
import { ExcelColumnFilter } from './ExcelColumnFilter';

type UserRolePermissions = ReturnType<typeof getUserRolePermissions>;

export interface JointsRegistryViewProps {
  joints: WeldJoint[];
  filteredAndSortedJoints: WeldJoint[];
  selectedJointIds: string[];
  onToggleSelectRow: (jointId: string) => void;
  onToggleSelectAll: () => void;
  onClearSelection: () => void;

  // Диапазон дат сварки
  weldingDateFrom: string;
  weldingDateTo: string;
  onWeldingDateFromChange: (val: string) => void;
  onWeldingDateToChange: (val: string) => void;
  onResetDateRange: () => void;

  // Действия и разграничение прав (Field-Level RBAC)
  userPermissions: UserRolePermissions;
  confirmBulkDeleteJoints: boolean;
  onSetConfirmBulkDeleteJoints: (val: boolean) => void;
  onBulkDeleteSelectedJoints: () => void;
  onOpenBulkEdit: () => void;
  onQuickAddSupplementaryJoint: () => void;
  onOpenImportExcel: () => void;
  onOpenCreatePassport: () => void;
  onOpenEditPassport: (joint: WeldJoint) => void;

  // Шаблоны и настройка столбцов
  activeTemplateId: string;
  templates: ColumnTemplate[];
  onApplyTemplate: (template: ColumnTemplate) => void;
  visibleColumns: WeldJointFieldKey[];
  activeColumnDefs: ColumnDefinition[];
  columnWidths: Record<string, number>;
  onOpenColumnsModal: () => void;

  // Excel-фильтры и сортировка
  columnFilters: Record<string, string[] | undefined>;
  activeFilterKeys: string[];
  onSetColumnFilter: (key: WeldJointFieldKey, values: string[] | undefined) => void;
  onResetAllFilters: () => void;
  sortConfig: { key: WeldJointFieldKey; direction: 'asc' | 'desc' } | null;
  onSetSortConfig: React.Dispatch<
    React.SetStateAction<{ key: WeldJointFieldKey; direction: 'asc' | 'desc' } | null>
  >;
  openFilterColumnKey: WeldJointFieldKey | null;
  onSetOpenFilterColumnKey: (key: WeldJointFieldKey | null) => void;
  getUniqueValuesForColumn: (
    key: WeldJointFieldKey
  ) => { value: string; count: number }[];
  onColumnResizeStart: (
    e: React.PointerEvent,
    colKey: WeldJointFieldKey,
    currentWidth: number
  ) => void;
  onColumnAutoFit: (colKey: WeldJointFieldKey) => void;
  onMoveColumnInline: (key: WeldJointFieldKey, dir: 'left' | 'right') => void;
  onHideColumnInline: (key: WeldJointFieldKey) => void;
}

export const JointsRegistryView: React.FC<JointsRegistryViewProps> = ({
  joints,
  filteredAndSortedJoints,
  selectedJointIds,
  onToggleSelectRow,
  onToggleSelectAll,
  onClearSelection,
  weldingDateFrom,
  weldingDateTo,
  onWeldingDateFromChange,
  onWeldingDateToChange,
  onResetDateRange,
  userPermissions,
  confirmBulkDeleteJoints,
  onSetConfirmBulkDeleteJoints,
  onBulkDeleteSelectedJoints,
  onOpenBulkEdit,
  onQuickAddSupplementaryJoint,
  onOpenImportExcel,
  onOpenCreatePassport,
  onOpenEditPassport,
  activeTemplateId,
  templates,
  onApplyTemplate,
  visibleColumns,
  activeColumnDefs,
  columnWidths,
  onOpenColumnsModal,
  columnFilters,
  activeFilterKeys,
  onSetColumnFilter,
  onResetAllFilters,
  sortConfig,
  onSetSortConfig,
  openFilterColumnKey,
  onSetOpenFilterColumnKey,
  getUniqueValuesForColumn,
  onColumnResizeStart,
  onColumnAutoFit,
  onMoveColumnInline,
  onHideColumnInline,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);

  // Виртуализация таблицы с помощью @tanstack/react-virtual
  // Позволяет легко рендерить 10 000+ стыков с плавным 60 FPS скроллом
  const rowVirtualizer = useVirtualizer({
    count: filteredAndSortedJoints.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 38,
    overscan: 12,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();

  const paddingTop = virtualRows.length > 0 ? virtualRows[0]?.start || 0 : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? totalHeight - (virtualRows[virtualRows.length - 1]?.end || 0)
      : 0;

  const renderStatusText = (val: string) => {
    if (val === 'Годен' || val === 'Отремонтировано') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
          <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
          <span>{val}</span>
        </span>
      );
    }
    if (val === 'Ремонт' || val === 'Вырезать' || val === 'Требуется ремонт' || val === 'Не годен' || val === 'Брак') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-50 text-red-800 border border-red-200 shadow-2xs">
          <AlertTriangle className="w-3 h-3 text-red-600 shrink-0" />
          <span>{val}</span>
        </span>
      );
    }
    if (val === 'В работе' || val === 'В процессе устранения' || val === 'В ремонте') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-900 border border-amber-200 shadow-2xs">
          <Clock className="w-3 h-3 text-amber-600 shrink-0" />
          <span>{val}</span>
        </span>
      );
    }
    return <span className="text-slate-400 font-mono">{val || '—'}</span>;
  };

  return (
    <div className="space-y-3">
      {/* Верхняя полоса: Диапазон дат сварки, действия и выбор шаблона таблицы */}
      <div className="flex flex-wrap xl:flex-nowrap items-center gap-2.5">
        {/* Блок 1: Диапазон дат сварки и основные действия */}
        <div className="bg-white rounded-xl border border-slate-200 px-3.5 py-2.5 flex flex-wrap xl:flex-nowrap items-center justify-between gap-2.5 shadow-2xs flex-1 min-w-0">
          <div className="flex flex-wrap md:flex-nowrap items-center gap-2 flex-1 min-w-0">
            {/* Поле диапазона дат сварки, фильтрующее таблицу */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#f4f8fe] border border-sky-200 rounded-lg text-xs whitespace-nowrap shrink-0">
              <Calendar className="w-4 h-4 text-[#1e3799] shrink-0" />
              <span className="font-semibold text-[#1e3799]">Дата сварки:</span>
              <label className="flex items-center gap-1 text-slate-600">
                <span>с</span>
                <input
                  type="date"
                  value={weldingDateFrom}
                  onChange={(e) => onWeldingDateFromChange(e.target.value)}
                  aria-label="Дата сварки с"
                  className="px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#1e3799]"
                />
              </label>
              <label className="flex items-center gap-1 text-slate-600">
                <span>по</span>
                <input
                  type="date"
                  value={weldingDateTo}
                  onChange={(e) => onWeldingDateToChange(e.target.value)}
                  aria-label="Дата сварки по"
                  className="px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#1e3799]"
                />
              </label>
              {(weldingDateFrom || weldingDateTo) && (
                <button
                  type="button"
                  onClick={onResetDateRange}
                  title="Сбросить диапазон дат сварки"
                  aria-label="Сбросить диапазон дат сварки"
                  className="ml-0.5 px-2 py-1 rounded bg-sky-100 text-[#1e3799] hover:bg-red-100 hover:text-red-700 font-bold text-xs transition-colors cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Кнопки действий: Массовое удаление, Массовое редактирование, Доп. стык, Новый стык */}
          <div className="flex items-center gap-2 shrink-0">
            {userPermissions.canCreateOrDeleteJoints &&
              selectedJointIds.length > 0 &&
              (confirmBulkDeleteJoints ? (
                <div className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-300 bg-red-50 text-xs">
                  <span className="font-bold text-red-800">
                    Удалить {selectedJointIds.length} ст.?
                  </span>
                  <button
                    type="button"
                    onClick={onBulkDeleteSelectedJoints}
                    className="px-2.5 py-1 rounded bg-red-600 text-white font-bold hover:bg-red-700 cursor-pointer"
                  >
                    Да
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetConfirmBulkDeleteJoints(false)}
                    className="px-2.5 py-1 rounded bg-white border border-slate-300 text-slate-700 cursor-pointer"
                  >
                    Отмена
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onSetConfirmBulkDeleteJoints(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
                  title="Удалить выделенные сварные стыки"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Удалить ({selectedJointIds.length})</span>
                </button>
              ))}

            {(userPermissions.canEditPrepAndWeldingFields ||
              userPermissions.canEditNdtFields) && (
              <button
                type="button"
                onClick={onOpenBulkEdit}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap border cursor-pointer shadow-2xs ${
                  selectedJointIds.length > 0
                    ? 'bg-[#e8f1fc] border-[#1e3799] text-[#1e3799] hover:bg-sky-100'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-[#1e3799]" />
                <span>
                  Массовое ред.
                  {selectedJointIds.length > 0
                    ? ` (${selectedJointIds.length})`
                    : ''}
                </span>
              </button>
            )}

            {userPermissions.canCreateOrDeleteJoints && (
              <>
                <button
                  type="button"
                  onClick={onQuickAddSupplementaryJoint}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#1e3799]/30 bg-[#f0f5fc] text-[#1e3799] hover:bg-sky-100 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
                  title="Добавить дополнительный стык с нумерацией 011, 012..."
                >
                  <FilePlus2 className="w-3.5 h-3.5" />
                  <span>Доп. стык</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenImportExcel}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-emerald-600/50 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-semibold transition-colors whitespace-nowrap shadow-2xs cursor-pointer"
                  title="Загрузка стыков из файла Excel (.xlsx, .xls) с автоматической привязкой"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Загрузить из Excel</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenCreatePassport}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1e3799] text-white hover:bg-[#15276e] text-xs font-semibold shadow-xs transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Добавить стык</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Блок 2: Отдельный блок справа (выбор шаблона таблицы и иконка "Столбцы") */}
        <div className="bg-white rounded-xl border border-slate-200 px-3.5 py-2.5 flex items-center gap-2 shadow-2xs shrink-0">
          <Bookmark className="w-4 h-4 text-[#1e3799] shrink-0" />
          <select
            value={activeTemplateId}
            onChange={(e) => {
              const found = templates.find((t) => t.id === e.target.value);
              if (found) onApplyTemplate(found);
            }}
            aria-label="Шаблон отображения столбцов"
            className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3799] cursor-pointer"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                Шаблон: {t.name}
              </option>
            ))}
          </select>

          <div className="relative group">
            <button
              type="button"
              onClick={onOpenColumnsModal}
              aria-label={`Настройка столбцов (${visibleColumns.length} из ${ALL_COLUMNS.length})`}
              title={`Настройка столбцов (${visibleColumns.length} из ${ALL_COLUMNS.length})`}
              className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-[#f0f5fc] hover:border-[#1e3799] text-[#1e3799] transition-colors flex items-center justify-center cursor-pointer shadow-2xs"
            >
              <Columns className="w-4 h-4" />
            </button>
            <div
              role="tooltip"
              className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute right-0 top-full mt-1.5 z-40 px-2.5 py-1 rounded bg-slate-900 text-white text-[11px] font-medium whitespace-nowrap shadow-lg"
            >
              Настройка столбцов ({visibleColumns.length}/{ALL_COLUMNS.length})
            </div>
          </div>
        </div>
      </div>

      {/* Индикатор активных фильтров, диапазона дат или выделенных строк */}
      {(activeFilterKeys.length > 0 ||
        Boolean(weldingDateFrom || weldingDateTo) ||
        selectedJointIds.length > 0) && (
        <div className="bg-[#e8f1fc] rounded-xl border border-sky-200 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {selectedJointIds.length > 0 && (
              <span className="font-bold text-[#1e3799]">
                Выделено стыков: {selectedJointIds.length} шт. (номер стыка защищён от массовой замены)
              </span>
            )}
            {(weldingDateFrom || weldingDateTo) && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-white border border-sky-300 text-[#1e3799] font-medium">
                <Calendar className="w-3 h-3" />
                <span>
                  Дата сварки:{' '}
                  {weldingDateFrom
                    ? `с ${formatDateDDMMYY(weldingDateFrom)}`
                    : ''}{' '}
                  {weldingDateTo
                    ? `по ${formatDateDDMMYY(weldingDateTo)}`
                    : ''}
                </span>
                <button
                  type="button"
                  onClick={onResetDateRange}
                  className="text-slate-400 hover:text-red-600 font-bold"
                >
                  ✕
                </button>
              </span>
            )}
            {activeFilterKeys.map((k) => (
              <span
                key={k}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-white border border-sky-300 text-[#1e3799] font-medium"
              >
                <Filter className="w-3 h-3" />
                <span>
                  {FIELD_LABELS_MAP[k]}: {columnFilters[k]?.length} знач.
                </span>
                <button
                  type="button"
                  onClick={() => onSetColumnFilter(k as WeldJointFieldKey, undefined)}
                  className="text-slate-400 hover:text-red-600 font-bold"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {selectedJointIds.length > 0 && (
              <button
                type="button"
                onClick={onClearSelection}
                className="text-slate-600 hover:text-slate-900 underline font-medium cursor-pointer"
              >
                Снять выделение
              </button>
            )}
            {(activeFilterKeys.length > 0 ||
              weldingDateFrom ||
              weldingDateTo) && (
              <button
                type="button"
                onClick={onResetAllFilters}
                className="inline-flex items-center gap-1 text-[#1e3799] hover:underline font-semibold cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Сбросить все фильтры</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ОСНОВНАЯ ТАБЛИЦА СВАРНЫХ СТЫКОВ С ШАПКОЙ #1e3799 И ВИРТУАЛИЗАЦИЕЙ СТРОК */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div
          ref={parentRef}
          className="overflow-x-auto min-h-[460px] max-h-[calc(100vh-270px)] overflow-y-auto table-scroll-container"
        >
          <table className="w-full text-xs border-collapse">
            <thead>
              {/* Строка заголовков столбцов строго цвета #1e3799, липкая при вертикальном скролле */}
              <tr className="bg-[#1e3799] text-white select-none sticky top-0 z-20 shadow-xs">
                {/* Чекбокс массового выбора */}
                <th className="py-3 px-2.5 border-r border-white/15 w-9 text-center sticky left-0 z-30 bg-[#1e3799]">
                  <input
                    type="checkbox"
                    aria-label="Выбрать все стыки в таблице"
                    checked={
                      filteredAndSortedJoints.length > 0 &&
                      filteredAndSortedJoints.every((j) =>
                        selectedJointIds.includes(j.id)
                      )
                    }
                    onChange={onToggleSelectAll}
                    className="rounded border-white/40 text-sky-400 focus:ring-sky-300 cursor-pointer"
                  />
                </th>

                {activeColumnDefs.map((col) => {
                  const isFiltered = columnFilters[col.key] !== undefined;
                  const isSorted = sortConfig?.key === col.key;
                  const isFilterOpen = openFilterColumnKey === col.key;
                  const colWidth = columnWidths[col.key] ?? col.minWidth;

                  return (
                    <th
                      key={col.key}
                      style={{
                        width: colWidth,
                        minWidth: colWidth,
                      }}
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
                            onSetSortConfig((prev) =>
                              prev?.key === col.key && prev.direction === 'asc'
                                ? { key: col.key, direction: 'desc' }
                                : { key: col.key, direction: 'asc' }
                            )
                          }
                          className="text-left font-semibold text-white hover:text-sky-200 truncate flex items-center gap-1 min-w-0 cursor-pointer"
                          title={`Сортировать по столбцу «${col.label}»`}
                        >
                          <span className="truncate">
                            {col.shortLabel || col.label}
                          </span>
                          {isSorted &&
                            (sortConfig?.direction === 'asc' ? (
                              <ArrowUp className="w-3 h-3 text-sky-300 shrink-0" />
                            ) : (
                              <ArrowDown className="w-3 h-3 text-sky-300 shrink-0" />
                            ))}
                        </button>

                        {/* Кнопка Excel-фильтра */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSetOpenFilterColumnKey(
                              isFilterOpen ? null : col.key
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

                      {/* Интерактивная область изменения ширины столбца */}
                      <div
                        onPointerDown={(e) =>
                          onColumnResizeStart(e, col.key, colWidth)
                        }
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          onColumnAutoFit(col.key);
                        }}
                        title="Потяните для изменения ширины. Двойной клик — автоподбор"
                        className="absolute top-0 right-0 bottom-0 w-2.5 cursor-col-resize select-none z-10"
                      />

                      {/* Выпадающее окно фильтра Excel */}
                      {isFilterOpen && (
                        <ExcelColumnFilter
                          column={col}
                          uniqueValues={getUniqueValuesForColumn(col.key)}
                          selectedValues={columnFilters[col.key]}
                          onApplyFilter={(k, vals) =>
                            onSetColumnFilter(k, vals)
                          }
                          sortConfig={sortConfig}
                          onSort={(k, dir) =>
                            onSetSortConfig({ key: k, direction: dir })
                          }
                          onMoveColumn={onMoveColumnInline}
                          onHideColumn={onHideColumnInline}
                          onClose={() => onSetOpenFilterColumnKey(null)}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {filteredAndSortedJoints.length === 0 ? (
                <tr>
                  <td
                    colSpan={activeColumnDefs.length + 1}
                    className="py-12 px-4 text-center text-slate-500"
                  >
                    <div className="max-w-md mx-auto space-y-2">
                      <div className="font-semibold text-slate-800 text-sm">
                        По заданным условиям фильтрации стыков не найдено
                      </div>
                      <p className="text-xs text-slate-500">
                        Сбросьте активные фильтры столбцов или добавьте новый сварной стык в базу.
                      </p>
                      <button
                        type="button"
                        onClick={onResetAllFilters}
                        className="px-3.5 py-1.5 rounded-lg bg-[#1e3799] text-white text-xs font-semibold hover:bg-[#15276e] cursor-pointer"
                      >
                        Сбросить фильтры
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <>
                  {/* Верхняя распорка виртуализатора для сохранения естественного скроллбара */}
                  {paddingTop > 0 && (
                    <tr style={{ height: `${paddingTop}px` }}>
                      <td colSpan={activeColumnDefs.length + 1} className="p-0 border-0" />
                    </tr>
                  )}

                  {/* Виртуализированный срез отображаемых строк */}
                  {virtualRows.map((virtualRow) => {
                    const joint = filteredAndSortedJoints[virtualRow.index];
                    if (!joint) return null;
                    const isSelected = selectedJointIds.includes(joint.id);
                    const numVal = parseInt(joint.jointNumber, 10);
                    const isSupp =
                      joint.isSupplementary ||
                      (!Number.isNaN(numVal) && numVal % 10 !== 0);

                    return (
                      <tr
                        key={joint.id}
                        data-index={virtualRow.index}
                        onDoubleClick={() => onOpenEditPassport(joint)}
                        className={`transition-colors ${
                          isSelected
                            ? 'bg-[#e8f1fc]'
                            : 'odd:bg-white even:bg-[#f8fafd] hover:bg-sky-50/70'
                        }`}
                      >
                        {/* Чекбокс выбора строки */}
                        <td className="py-2 px-2.5 border-r border-slate-200 text-center sticky left-0 z-10 bg-inherit">
                          <input
                            type="checkbox"
                            aria-label={`Выбрать стык ${joint.jointNumber} линии ${joint.uniqueLineId}`}
                            checked={isSelected}
                            onChange={() => onToggleSelectRow(joint.id)}
                            className="rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799] cursor-pointer"
                          />
                        </td>

                        {/* Ячейки данных по активному шаблону столбцов */}
                        {activeColumnDefs.map((col) => {
                          const raw =
                            col.key === 'equivDiameterInch'
                              ? getJointEquivDiaInch(joint)
                              : joint[col.key];
                          const strVal = String(raw ?? '');
                          const colWidth =
                            columnWidths[col.key] ?? col.minWidth;
                          const cellStyle = {
                            width: colWidth,
                            minWidth: colWidth,
                          };

                          if (col.key === 'jointNumber') {
                            return (
                              <td
                                key={col.key}
                                style={cellStyle}
                                className="py-2 px-2.5 border-r border-slate-200 font-mono font-bold text-slate-900 whitespace-nowrap overflow-hidden text-ellipsis"
                              >
                                <button
                                  type="button"
                                  onClick={() => onOpenEditPassport(joint)}
                                  aria-label={`Открыть паспорт стыка ${joint.jointNumber}`}
                                  title="Нажмите на номер стыка, чтобы открыть паспорт стыка"
                                  className="inline-flex items-center font-mono font-bold text-[#1e3799] hover:text-[#15276e] underline decoration-[#1e3799]/40 hover:decoration-[#1e3799] underline-offset-2 transition-colors cursor-pointer truncate max-w-full"
                                >
                                  <span className="truncate">
                                    {joint.jointNumber}
                                  </span>
                                  {isSupp && (
                                    <span
                                      className="ml-1.5 text-[10px] font-normal text-[#1e3799] shrink-0"
                                      title="Дополнительный стык"
                                    >
                                      (доп.)
                                    </span>
                                  )}
                                </button>
                              </td>
                            );
                          }

                          if (col.key === 'uniqueLineId') {
                            return (
                              <td
                                key={col.key}
                                style={cellStyle}
                                className="py-2 px-2.5 border-r border-slate-200 font-mono font-semibold text-[#1e3799] whitespace-nowrap overflow-hidden text-ellipsis"
                                title={joint.uniqueLineId}
                              >
                                {joint.uniqueLineId}
                              </td>
                            );
                          }

                          if (
                            col.key === 'lrv1Code' ||
                            col.key === 'lrv2Code'
                          ) {
                            return (
                              <td
                                key={col.key}
                                style={cellStyle}
                                className="py-2 px-2.5 border-r border-slate-200 font-mono text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis"
                                title={strVal || '—'}
                              >
                                {strVal || '—'}
                              </td>
                            );
                          }

                          if (
                            col.key === 'vikResult' ||
                            col.key === 'ndtResult' ||
                            col.key === 'dupNdtResult' ||
                            col.key === 'repairVikResult' ||
                            col.key === 'repairNdtResult' ||
                            col.key === 'repairDupNdtResult' ||
                            col.key === 'repairAction'
                          ) {
                            return (
                              <td
                                key={col.key}
                                style={cellStyle}
                                className="py-2 px-2.5 border-r border-slate-200 whitespace-nowrap overflow-hidden text-ellipsis"
                              >
                                {renderStatusText(strVal)}
                              </td>
                            );
                          }

                          if (isDateColumnKey(col.key)) {
                            return (
                              <td
                                key={col.key}
                                style={cellStyle}
                                className="py-2 px-2.5 border-r border-slate-200 font-mono text-slate-700 whitespace-nowrap overflow-hidden text-ellipsis"
                              >
                                {strVal ? (
                                  formatDateDDMMYY(strVal)
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                            );
                          }

                          return (
                            <td
                              key={col.key}
                              style={cellStyle}
                              className={`py-2 px-2.5 border-r border-slate-200 whitespace-nowrap overflow-hidden text-ellipsis ${
                                col.isNumeric
                                  ? 'font-mono text-right'
                                  : 'text-slate-700'
                              }`}
                              title={strVal}
                            >
                              {strVal || (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}

                  {/* Нижняя распорка виртуализатора */}
                  {paddingBottom > 0 && (
                    <tr style={{ height: `${paddingBottom}px` }}>
                      <td colSpan={activeColumnDefs.length + 1} className="p-0 border-0" />
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Подвал таблицы со статистикой и подсказками */}
        <div className="px-4 py-2.5 bg-[#f8fafd] border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <div>
            Отображено стыков:{' '}
            <span className="font-mono font-bold text-slate-800">
              {filteredAndSortedJoints.length}
            </span>{' '}
            из <span className="font-mono">{joints.length}</span> · Активный шаблон:{' '}
            <span className="font-semibold text-[#1e3799]">
              {templates.find((t) => t.id === activeTemplateId)?.name ||
                'Пользовательский'}
            </span>
          </div>
          <div>
            Нажатие на номер стыка открывает Паспорт стыка · Все изменения записываются в Аудит
          </div>
        </div>
      </div>
    </div>
  );
};
