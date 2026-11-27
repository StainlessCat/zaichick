import { normalizeCorporateJointNumber } from '../../api/mappers';
import React, { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
  Filter,
  Send,
} from 'lucide-react';
import {
  JointLabRequestStatus,
  WeldJoint,
  WeldJointFieldKey,
} from '../../types/welding';
import {
  formatDateDDMMYY,
  getJointEquivDiaInch,
  getJointFieldValue,
  isDateColumnKey,
  getMissingPassportFields,
} from '../../utils/weldingLogic';
import {
  getJointLabRequestStatus,
  validateJointForLabRequestSubmission,
} from '../../utils/laboratoryLogic';
import { ExcelColumnFilter } from '../ExcelColumnFilter';
import { RecordStatusBadge } from '../RecordStatusControls';
import { RegistryTableProps } from './types';

const CHECKBOX_COL_WIDTH = 40;

export const RegistryTable: React.FC<RegistryTableProps> = ({
  filteredAndSortedJoints,
  selectedJointIds,
  onToggleSelectRow,
  onToggleSelectAll,
  activeColumnDefs,
  columnWidths,
  columnFilters,
  sortConfig,
  onSetSortConfig,
  openFilterColumnKey,
  onSetOpenFilterColumnKey,
  getUniqueValuesForColumn,
  onSetColumnFilter,
  onMoveColumnInline,
  onHideColumnInline,
  onColumnResizeStart,
  onColumnAutoFit,
  onResetAllFilters,
  onOpenEditPassport,
  onOpenSubmitLabRequestForJoint,
  labRequests,
  testCircuits,
  welders,
  duplicateJointIds,
  canCreateLabRequest,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const selectedSet = useMemo(() => new Set(selectedJointIds), [selectedJointIds]);

  const allVisibleSelected = useMemo(
    () =>
      filteredAndSortedJoints.length > 0 &&
      filteredAndSortedJoints.every((j) => selectedSet.has(j.id)),
    [filteredAndSortedJoints, selectedSet]
  );

  // Динамический расчёт точных left-координат всех закреплённых столбцов (№ стыка, ID линии и т.д.)
  const stickyLayout = useMemo(() => {
    const leftMap = new Map<WeldJointFieldKey, number>();
    let offset = CHECKBOX_COL_WIDTH;
    let lastStickyKey: WeldJointFieldKey | null = null;

    for (const col of activeColumnDefs) {
      if (col.isSticky) {
        leftMap.set(col.key, offset);
        const w = columnWidths[col.key] ?? col.minWidth;
        offset += w;
        lastStickyKey = col.key;
      }
    }

    return { leftMap, lastStickyKey };
  }, [activeColumnDefs, columnWidths]);

  // Мемоизация тяжёлых вычислений статусов и проверки паспортов, чтобы клик по чекбоксу не пересчитывал таблицу
  const rowMetaMap = useMemo(() => {
    const map = new Map<
      string,
      {
        missingFields: string[];
        labStatus: JointLabRequestStatus;
        labValidation: { canSubmit: boolean; reasons: string[] };
      }
    >();
    for (const joint of filteredAndSortedJoints) {
      map.set(joint.id, {
        missingFields: getMissingPassportFields(joint),
        labStatus: getJointLabRequestStatus(joint, labRequests),
        labValidation: validateJointForLabRequestSubmission(joint, welders),
      });
    }
    return map;
  }, [filteredAndSortedJoints, labRequests, welders]);

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
    if (
      val === 'Ремонт' ||
      val === 'Вырезать' ||
      val === 'Требуется ремонт' ||
      val === 'Не годен' ||
      val === 'Брак'
    ) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-50 text-red-800 border border-red-200 shadow-2xs">
          <AlertTriangle className="w-3 h-3 text-red-600 shrink-0" />
          <span>{val}</span>
        </span>
      );
    }
    if (
      val === 'В работе' ||
      val === 'В процессе устранения' ||
      val === 'В ремонте'
    ) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-900 border border-amber-200 shadow-2xs">
          <Clock className="w-3 h-3 text-amber-600 shrink-0" />
          <span>{val}</span>
        </span>
      );
    }
    return <span className="text-slate-400 font-mono">{val || '—'}</span>;
  };

  const renderLabRequestStatusCell = (
    joint: WeldJoint,
    status: JointLabRequestStatus,
    validation: { canSubmit: boolean; reasons: string[] }
  ) => {
    if (status === 'Заявка исполнена') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs">
          <CheckCircle2 className="w-3 h-3 text-emerald-700 shrink-0" />
          <span>Заявка исполнена</span>
        </span>
      );
    }

    if (status === 'Заявка в работе') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
          <Clock className="w-3 h-3 text-amber-700 shrink-0" />
          <span>Заявка в работе</span>
        </span>
      );
    }

    if (status === 'Заявка подана') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 text-sky-900 border border-sky-300 shadow-2xs">
          <Send className="w-3 h-3 text-sky-700 shrink-0" />
          <span>Заявка подана</span>
        </span>
      );
    }

    return (
      <div className="inline-flex items-center gap-1.5 flex-wrap">
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs"
          title={
            validation.canSubmit
              ? 'Дата сварки и клеймо заполнены без замечаний — стык готов к подаче заявки в ЛНК'
              : `Подача заявки недоступна: ${validation.reasons.join('; ')}`
          }
        >
          <span>Заявка не подана</span>
        </span>
        {canCreateLabRequest &&
          (validation.canSubmit ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenSubmitLabRequestForJoint(joint.id);
              }}
              title="Направить заявку в Лабораторию НК по данному стыку"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#1e3799] hover:bg-[#15276e] text-white text-[10px] font-bold transition-colors cursor-pointer shadow-2xs"
            >
              <Send className="w-2.5 h-2.5" />
              <span>Подать</span>
            </button>
          ) : (
            <span
              className="text-[10px] text-amber-700 font-medium cursor-help"
              title={`Подача заявки заблокирована: ${validation.reasons.join('; ')}`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 inline" />
            </span>
          ))}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      <div
        ref={parentRef}
        className="overflow-x-auto min-h-[340px] max-h-[calc(100vh-315px)] overflow-y-auto table-scroll-container"
      >
        <table className="w-max min-w-full text-xs border-separate border-spacing-0">
          <thead>
            {/* Строка заголовков столбцов строго цвета #1e3799, липкая при вертикальном скролле */}
            <tr className="bg-[#1e3799] text-white select-none">
              {/* Чекбокс массового выбора */}
              <th
                style={{
                  width: `${CHECKBOX_COL_WIDTH}px`,
                  minWidth: `${CHECKBOX_COL_WIDTH}px`,
                  maxWidth: `${CHECKBOX_COL_WIDTH}px`,
                  left: '0px',
                }}
                className="box-border py-3 px-2 border-r border-b border-white/15 text-center sticky top-0 z-30 bg-[#1e3799]"
              >
                <input
                  type="checkbox"
                  aria-label="Выбрать все стыки в таблице"
                  checked={allVisibleSelected}
                  onChange={onToggleSelectAll}
                  className="rounded border-white/40 text-sky-400 focus:ring-sky-300 cursor-pointer"
                />
              </th>

              {activeColumnDefs.map((col) => {
                const isFiltered = columnFilters[col.key] !== undefined;
                const isSorted = sortConfig?.key === col.key;
                const isFilterOpen = openFilterColumnKey === col.key;
                const colWidth = columnWidths[col.key] ?? col.minWidth;
                const stickyLeft = stickyLayout.leftMap.get(col.key);
                const isSticky = stickyLeft !== undefined;
                const isLastSticky = stickyLayout.lastStickyKey === col.key;

                return (
                  <th
                    key={col.key}
                    style={{
                      width: `${colWidth}px`,
                      minWidth: `${colWidth}px`,
                      maxWidth: `${colWidth}px`,
                      ...(isSticky ? { left: `${stickyLeft}px` } : {}),
                    }}
                    className={`box-border py-3 px-2.5 font-bold text-left whitespace-nowrap select-none sticky top-0 bg-[#1e3799] border-b border-white/15 ${
                      isSticky
                        ? isLastSticky
                          ? 'z-30 border-r-2 border-r-sky-400/60 shadow-[2px_0_6px_rgba(0,0,0,0.22)]'
                          : 'z-30 border-r border-r-white/20'
                        : 'z-20 border-r border-r-white/15'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const nextDir =
                            isSorted && sortConfig?.direction === 'asc'
                              ? 'desc'
                              : 'asc';
                          onSetSortConfig({ key: col.key, direction: nextDir });
                        }}
                        className="inline-flex items-center gap-1 hover:text-sky-200 transition-colors text-left font-bold cursor-pointer truncate"
                      >
                        <span className="truncate">{col.label}</span>
                        {isSorted && (
                          <span className="text-sky-300 shrink-0">
                            {sortConfig?.direction === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 inline" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 inline" />
                            )}
                          </span>
                        )}
                      </button>

                      {/* Кнопка открытия фильтра Excel */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSetOpenFilterColumnKey(
                            isFilterOpen ? null : col.key
                          );
                        }}
                        aria-label={`Фильтр по столбцу ${col.label}`}
                        className={`p-1 rounded transition-colors cursor-pointer shrink-0 ${
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

          <tbody>
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
                      Сбросьте активные фильтры или добавьте новый сварной стык в базу.
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
                {/* Верхняя распорка виртуализатора */}
                {paddingTop > 0 && (
                  <tr style={{ height: `${paddingTop}px` }}>
                    <td colSpan={activeColumnDefs.length + 1} className="p-0 border-0" />
                  </tr>
                )}

                {/* Виртуализированный срез отображаемых строк */}
                {virtualRows.map((virtualRow) => {
                  const joint = filteredAndSortedJoints[virtualRow.index];
                  if (!joint) return null;
                  const isSelected = selectedSet.has(joint.id);
                  const isSupp = joint.isSupplementary;
                  const meta = rowMetaMap.get(joint.id);
                  const missingFields = meta?.missingFields ?? [];
                  const labStatus = meta?.labStatus ?? 'Заявка не подана';
                  const labValidation = meta?.labValidation ?? {
                    canSubmit: false,
                    reasons: [],
                  };
                  const isIncomplete =
                    Boolean(joint.weldingDate) && missingFields.length > 0;
                  const stickyCellBgClass = isSelected
                    ? 'bg-[#eaf2fd] group-hover:bg-[#dce9fb]'
                    : virtualRow.index % 2 === 0
                    ? 'bg-white group-hover:bg-slate-50'
                    : 'bg-[#fafcff] group-hover:bg-slate-100';

                  return (
                    <tr
                      key={joint.id}
                      onClick={() => onToggleSelectRow(joint.id)}
                      className={`group transition-colors cursor-pointer select-none ${
                        isSelected
                          ? 'bg-[#eaf2fd] hover:bg-[#dce9fb]'
                          : virtualRow.index % 2 === 0
                          ? 'bg-white hover:bg-slate-50'
                          : 'bg-[#fafcff] hover:bg-slate-100'
                      }`}
                    >
                      {/* Чекбокс строки (липкий) */}
                      <td
                        style={{
                          width: `${CHECKBOX_COL_WIDTH}px`,
                          minWidth: `${CHECKBOX_COL_WIDTH}px`,
                          maxWidth: `${CHECKBOX_COL_WIDTH}px`,
                          left: '0px',
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className={`box-border py-2 px-2 border-r border-b border-slate-200 text-center sticky z-10 ${stickyCellBgClass}`}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Выбрать стык ${normalizeCorporateJointNumber(joint.jointNumber, joint.uniqueLineId, joint.isSupplementary).jointNumber}`}
                          checked={isSelected}
                          onChange={() => onToggleSelectRow(joint.id)}
                          className="rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799] cursor-pointer"
                        />
                      </td>

                      {/* Ячейки строки */}
                      {activeColumnDefs.map((col) => {
                        const colWidth = columnWidths[col.key] ?? col.minWidth;
                        const stickyLeft = stickyLayout.leftMap.get(col.key);
                        const isSticky = stickyLeft !== undefined;
                        const isLastSticky = stickyLayout.lastStickyKey === col.key;

                        const cellStyle: React.CSSProperties = {
                          width: `${colWidth}px`,
                          minWidth: `${colWidth}px`,
                          maxWidth: `${colWidth}px`,
                          ...(isSticky ? { left: `${stickyLeft}px` } : {}),
                        };

                        const stickyBorderClass = isSticky
                          ? isLastSticky
                            ? `sticky z-10 border-r-2 border-r-slate-300 shadow-[2px_0_6px_rgba(15,23,42,0.09)] ${stickyCellBgClass}`
                            : `sticky z-10 border-r border-r-slate-200 ${stickyCellBgClass}`
                          : 'border-r border-r-slate-200';

                        if (col.key === 'labRequestStatus') {
                          return (
                            <td
                              key={col.key}
                              style={cellStyle}
                              className={`box-border py-1.5 px-2.5 border-b border-slate-200 whitespace-nowrap ${stickyBorderClass}`}
                            >
                              {renderLabRequestStatusCell(
                                joint,
                                labStatus,
                                labValidation
                              )}
                            </td>
                          );
                        }

                        if (col.key === 'jointNumber') {
                          const corp = normalizeCorporateJointNumber(
                            joint.jointNumber,
                            joint.uniqueLineId,
                            joint.isSupplementary
                          );
                          return (
                            <td
                              key={col.key}
                              style={cellStyle}
                              className={`box-border py-2 px-2.5 border-b border-slate-200 font-mono font-bold text-slate-900 whitespace-nowrap overflow-hidden text-ellipsis ${stickyBorderClass}`}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenEditPassport(joint);
                                }}
                                aria-label={`Открыть паспорт стыка ${corp.jointNumber}`}
                                title="Нажмите на номер стыка, чтобы открыть паспорт стыка"
                                className="inline-flex items-center font-mono font-bold text-[#1e3799] hover:text-[#15276e] underline decoration-[#1e3799]/40 hover:decoration-[#1e3799] underline-offset-2 transition-colors cursor-pointer truncate max-w-full"
                              >
                                <span className="truncate">{corp.jointNumber}</span>
                                {(isSupp || corp.isSupplementary) && (
                                  <span
                                    className="ml-1.5 px-1 py-0.2 rounded text-[10px] font-semibold bg-sky-100 text-[#1e3799] shrink-0"
                                    title="Доборный стык"
                                  >
                                    доб.
                                  </span>
                                )}
                                {duplicateJointIds.has(joint.id) && (
                                  <span
                                    className="ml-1.5 px-1.5 py-0.5 rounded bg-red-100 text-red-800 text-[10px] font-bold border border-red-300 shrink-0"
                                    title="Критическая ошибка: номер этого стыка дублируется на данной линии!"
                                  >
                                    ДУБЛЬ
                                  </span>
                                )}
                                {joint.recordStatus && joint.recordStatus !== 'DRAFT' && (
                                  <span className="ml-1.5 shrink-0">
                                    <RecordStatusBadge status={joint.recordStatus} compact />
                                  </span>
                                )}
                                {isIncomplete && (
                                  <span
                                    className="ml-1.5 p-0.5 rounded text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 shrink-0 inline-flex items-center justify-center cursor-help transition-colors"
                                    title={`Не заполнен: введена дата сварки (${formatDateDDMMYY(joint.weldingDate)}), но не заполнены обязательные поля паспорта (${missingFields.length}): ${missingFields.join(', ')}`}
                                    aria-label={`Не заполнен: не заполнены обязательные поля паспорта (${missingFields.length}): ${missingFields.join(', ')}`}
                                  >
                                    <AlertTriangle className="w-3 h-3 text-amber-600" />
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
                              className={`box-border py-2 px-2.5 border-b border-slate-200 font-mono font-semibold text-[#1e3799] whitespace-nowrap overflow-hidden text-ellipsis ${stickyBorderClass}`}
                              title={joint.uniqueLineId}
                            >
                              {joint.uniqueLineId}
                            </td>
                          );
                        }

                        if (col.key === 'equivDiameterInch') {
                          const edi = getJointEquivDiaInch(joint);
                          const formatted =
                            edi > 0 ? Number(edi.toFixed(2)).toString() : '';
                          return (
                            <td
                              key={col.key}
                              style={cellStyle}
                              className={`box-border py-2 px-2.5 border-b border-slate-200 font-mono tabular-nums text-right text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis ${stickyBorderClass}`}
                              title={formatted || '—'}
                            >
                              {formatted || <span className="text-slate-300">—</span>}
                            </td>
                          );
                        }

                        if (col.key === 'contour') {
                          const contourVal = String(
                            getJointFieldValue(joint, 'contour', labRequests, testCircuits) ||
                              ''
                          );
                          return (
                            <td
                              key={col.key}
                              style={cellStyle}
                              className={`box-border py-2 px-2.5 border-b border-slate-200 text-slate-700 whitespace-nowrap overflow-hidden text-ellipsis ${stickyBorderClass}`}
                              title={contourVal}
                            >
                              {contourVal || <span className="text-slate-300">—</span>}
                            </td>
                          );
                        }

                        const rawVal = joint[col.key];
                        const strVal = String(rawVal ?? '');

                        if (
                          col.key === 'lrv1Code' ||
                          col.key === 'lrv2Code'
                        ) {
                          return (
                            <td
                              key={col.key}
                              style={cellStyle}
                              className={`box-border py-2 px-2.5 border-b border-slate-200 font-mono text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis ${stickyBorderClass}`}
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
                              className={`box-border py-2 px-2.5 border-b border-slate-200 whitespace-nowrap overflow-hidden text-ellipsis ${stickyBorderClass}`}
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
                              className={`box-border py-2 px-2.5 border-b border-slate-200 font-mono tabular-nums text-slate-700 whitespace-nowrap overflow-hidden text-ellipsis ${stickyBorderClass}`}
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
                            className={`box-border py-2 px-2.5 border-b border-slate-200 whitespace-nowrap overflow-hidden text-ellipsis ${stickyBorderClass} ${
                              col.isNumeric
                                ? 'font-mono tabular-nums text-right text-slate-800'
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
    </div>
  );
};
