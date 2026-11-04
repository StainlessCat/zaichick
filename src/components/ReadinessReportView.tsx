import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  Download,
  Filter,
  RotateCcw,
} from 'lucide-react';
import { ReadinessGroupCondition, ReadinessSummaryRow, WeldJoint } from '../types/welding';
import {
  calculateReadinessReport,
  isJointCurrentlyInRepair,
  isJointFullyAccepted,
} from '../utils/weldingLogic';
import { triggerBlobDownload } from '../utils/excelUtils';
import {
  applyTableColumnFiltersAndSort,
  TableColumnFilterHeader,
} from './TableColumnFilterPopover';
import {
  useResizableColumns,
  ColumnResizeHandle,
} from '../utils/useResizableColumns';

interface ReadinessReportViewProps {
  joints: WeldJoint[];
  onFilterRegistryByCondition: (condition: ReadinessGroupCondition, value: string) => void;
}

export const ReadinessReportView: React.FC<ReadinessReportViewProps> = ({
  joints,
  onFilterRegistryByCondition,
}) => {
  const [condition, setCondition] = useState<ReadinessGroupCondition>('rdCode');
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>(null);
  const [exportToast, setExportToast] = useState<string>('');

  // Регулирование ширины столбцов сводного отчёта готовности
  const {
    columnWidths,
    getColumnWidth,
    handleResizeStart,
    handleAutoFit,
    handleResetWidths,
    hasCustomWidths,
  } = useResizableColumns({
    storageKey: 'zaychick_col_widths_readiness',
    defaultWidths: {
      groupKey: 230,
      totalJoints: 130,
      weldedCount: 130,
      vikPassedCount: 110,
      ndtPassedCount: 110,
      dupNdtPassedCount: 120,
      repairCount: 120,
      readinessPct: 220,
      action: 95,
    },
  });

  const baseRows = useMemo(
    () => calculateReadinessReport(joints, condition),
    [joints, condition]
  );

  const rowGetters = useMemo<Record<string, (r: ReadinessSummaryRow) => string>>(
    () => ({
      groupKey: (r) => r.groupKey,
      totalJoints: (r) =>
        r.supplementaryJoints > 0
          ? `${r.totalJoints} (доп: ${r.supplementaryJoints})`
          : String(r.totalJoints),
      weldedCount: (r) => `${r.weldedCount} (${r.weldingPct}%)`,
      vikPassedCount: (r) => String(r.vikPassedCount),
      ndtPassedCount: (r) => String(r.ndtPassedCount),
      dupNdtPassedCount: (r) => String(r.dupNdtPassedCount),
      repairCount: (r) => (r.repairCount > 0 ? `${r.repairCount} (ремонт)` : '0'),
      readinessPct: (r) => `${r.readinessPct}% (${r.fullyCompletedCount}/${r.totalJoints})`,
    }),
    []
  );

  const rows = useMemo(
    () =>
      applyTableColumnFiltersAndSort(
        baseRows,
        columnFilters,
        rowGetters,
        sortConfig
      ),
    [baseRows, columnFilters, rowGetters, sortConfig]
  );

  const handleApplyFilter = (colKey: string, vals: string[] | undefined) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (vals === undefined) delete next[colKey];
      else next[colKey] = vals;
      return next;
    });
  };

  const handleSort = (colKey: string, direction: 'asc' | 'desc') => {
    setSortConfig({ key: colKey, direction });
  };

  const summary = useMemo(() => {
    const total = joints.length;
    const welded = joints.filter((j) => Boolean(j.weldingDate && j.welderStamp)).length;
    const vikOk = joints.filter(
      (j) =>
        j.vikResult === 'Годен' ||
        (j.vikResult === 'Ремонт' &&
          j.dupNdtType !== 'Не требуется' &&
          j.dupNdtResult === 'Годен')
    ).length;
    const ndtOk = joints.filter(
      (j) =>
        j.ndtResult === 'Годен' ||
        (j.ndtResult === 'Ремонт' &&
          j.dupNdtType !== 'Не требуется' &&
          j.dupNdtResult === 'Годен')
    ).length;
    const repair = joints.filter((j) => isJointCurrentlyInRepair(j)).length;
    const ready = joints.filter((j) => isJointFullyAccepted(j)).length;

    return {
      total,
      welded,
      vikOk,
      ndtOk,
      repair,
      ready,
      readyPct: total > 0 ? Math.round((ready / total) * 100) : 0,
    };
  }, [joints]);

  const conditionOptions: { id: ReadinessGroupCondition; label: string }[] = [
    { id: 'objectName', label: 'По условию «Объект»' },
    { id: 'rdCode', label: 'По условию «Шифр РД»' },
    { id: 'uniqueLineId', label: 'По условию «Линия»' },
    { id: 'contour', label: 'По условию «Контур»' },
  ];

  const conditionTitleMap: Record<ReadinessGroupCondition, string> = {
    objectName: 'Объект строительства',
    rdCode: 'Шифр рабочей документации (РД)',
    uniqueLineId: 'Уникальный идентификатор линии',
    contour: 'Технологический контур',
  };

  const handleExportReport = () => {
    const headers = [
      conditionTitleMap[condition],
      'Примечание / Привязка',
      'Всего стыков (шт.)',
      'Из них доп. стыков',
      'Сварено (шт.)',
      'Готовность сварки (%)',
      'Годен ВИК (шт.)',
      'Годен НК (шт.)',
      'Дубл. контроль закрыт (шт.)',
      'Требует ремонта (шт.)',
      'Полностью сдано (шт.)',
      'Итоговая готовность (%)',
    ];
    const csvRows = rows.map((r) => [
      r.groupKey,
      r.subLabel,
      r.totalJoints,
      r.supplementaryJoints,
      r.weldedCount,
      `${r.weldingPct}%`,
      r.vikPassedCount,
      r.ndtPassedCount,
      r.dupNdtPassedCount,
      r.repairCount,
      r.fullyCompletedCount,
      `${r.readinessPct}%`,
    ]);
    const csv =
      '\uFEFF' +
      [headers, ...csvRows]
        .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'))
        .join('\n');
    const fileName = `Отчет_готовности_${condition}.csv`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    triggerBlobDownload(blob, fileName);
    setExportToast(`Сводка готовности (${rows.length} поз.) выгружена в файл «${fileName}».`);
    setTimeout(() => setExportToast(''), 4000);
  };

  return (
    <div className="space-y-4">
      {exportToast && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold flex items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{exportToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setExportToast('')}
            className="text-emerald-700 hover:text-emerald-950 font-bold"
          >
            ✕
          </button>
        </div>
      )}
      {/* Шапка отчёта и переключатель условий группировки */}
      <div className="bg-white rounded-xl border border-slate-200 px-3 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200"
          role="group"
          aria-label="Условия формирования отчётности"
        >
          {conditionOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                setCondition(opt.id);
                setColumnFilters({});
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                condition === opt.id
                  ? 'bg-[#1e3799] text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {Object.keys(columnFilters).length > 0 && (
            <button
              type="button"
              onClick={() => setColumnFilters({})}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-xs font-semibold text-[#1e3799] hover:bg-sky-100"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Сбросить фильтры ({Object.keys(columnFilters).length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportReport}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1e3799] text-white text-xs font-semibold hover:bg-[#15276e] whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>Выгрузить сводку (.CSV)</span>
          </button>
        </div>
      </div>

      {/* Сводные показатели по выборке */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-3.5">
          <div className="text-xs text-slate-500">Всего стыков по базе</div>
          <div className="font-mono text-2xl font-bold text-slate-900 mt-1">{summary.total}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3.5">
          <div className="text-xs text-slate-500">Сварено стыков</div>
          <div className="font-mono text-2xl font-bold text-[#1e3799] mt-1">{summary.welded}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3.5">
          <div className="text-xs text-slate-500">Принято по ВИК</div>
          <div className="font-mono text-2xl font-bold text-slate-900 mt-1">{summary.vikOk}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3.5">
          <div className="text-xs text-slate-500">Принято по НК (РК/УЗК)</div>
          <div className="font-mono text-2xl font-bold text-slate-900 mt-1">{summary.ndtOk}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3.5">
          <div className="text-xs text-slate-500">В ремонте / брак</div>
          <div className="font-mono text-2xl font-bold text-amber-700 mt-1">{summary.repair}</div>
        </div>
        <div className="bg-[#e8f1fc] rounded-xl border border-sky-200 p-3.5">
          <div className="text-xs font-medium text-[#1e3799]">Полная готовность</div>
          <div className="font-mono text-2xl font-bold text-[#1e3799] mt-1">
            {summary.readyPct}% ({summary.ready})
          </div>
        </div>
      </div>

      {/* Таблица отчёта готовности с шапкой #1e3799 и Excel-фильтрами */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto overflow-y-auto min-h-[340px] max-h-[calc(100vh-250px)] table-scroll-container">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-20 shadow-xs">
              <tr className="bg-[#1e3799] text-white text-left">
                <TableColumnFilterHeader
                  columnKey="groupKey"
                  label={conditionTitleMap[condition]}
                  rows={baseRows}
                  getValue={rowGetters.groupKey}
                  activeFilters={columnFilters}
                  onApplyFilter={handleApplyFilter}
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  width={getColumnWidth('groupKey')}
                  minWidth={140}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('groupKey', 230)}
                />
                <TableColumnFilterHeader
                  columnKey="totalJoints"
                  label="Всего стыков (доп.)"
                  rows={baseRows}
                  getValue={rowGetters.totalJoints}
                  activeFilters={columnFilters}
                  onApplyFilter={handleApplyFilter}
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  align="right"
                  width={getColumnWidth('totalJoints')}
                  minWidth={95}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('totalJoints', 130)}
                />
                <TableColumnFilterHeader
                  columnKey="weldedCount"
                  label="Сварено, шт. (%)"
                  rows={baseRows}
                  getValue={rowGetters.weldedCount}
                  activeFilters={columnFilters}
                  onApplyFilter={handleApplyFilter}
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  align="right"
                  width={getColumnWidth('weldedCount')}
                  minWidth={95}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('weldedCount', 130)}
                />
                <TableColumnFilterHeader
                  columnKey="vikPassedCount"
                  label="Годен ВИК"
                  rows={baseRows}
                  getValue={rowGetters.vikPassedCount}
                  activeFilters={columnFilters}
                  onApplyFilter={handleApplyFilter}
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  align="right"
                  width={getColumnWidth('vikPassedCount')}
                  minWidth={85}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('vikPassedCount', 110)}
                />
                <TableColumnFilterHeader
                  columnKey="ndtPassedCount"
                  label="Годен НК"
                  rows={baseRows}
                  getValue={rowGetters.ndtPassedCount}
                  activeFilters={columnFilters}
                  onApplyFilter={handleApplyFilter}
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  align="right"
                  width={getColumnWidth('ndtPassedCount')}
                  minWidth={85}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('ndtPassedCount', 110)}
                />
                <TableColumnFilterHeader
                  columnKey="dupNdtPassedCount"
                  label="Дубль НК закрыт"
                  rows={baseRows}
                  getValue={rowGetters.dupNdtPassedCount}
                  activeFilters={columnFilters}
                  onApplyFilter={handleApplyFilter}
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  align="right"
                  width={getColumnWidth('dupNdtPassedCount')}
                  minWidth={95}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('dupNdtPassedCount', 120)}
                />
                <TableColumnFilterHeader
                  columnKey="repairCount"
                  label="Ремонт / Вырезка"
                  rows={baseRows}
                  getValue={rowGetters.repairCount}
                  activeFilters={columnFilters}
                  onApplyFilter={handleApplyFilter}
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  align="right"
                  width={getColumnWidth('repairCount')}
                  minWidth={95}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('repairCount', 120)}
                />
                <TableColumnFilterHeader
                  columnKey="readinessPct"
                  label="Шкала комплексной готовности"
                  rows={baseRows}
                  getValue={rowGetters.readinessPct}
                  activeFilters={columnFilters}
                  onApplyFilter={handleApplyFilter}
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  width={getColumnWidth('readinessPct')}
                  minWidth={140}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('readinessPct', 220)}
                />
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
              {rows.map((row) => (
                <tr
                  key={row.groupKey}
                  className="hover:bg-[#e8f1fc]/50 transition-colors odd:bg-white even:bg-slate-50/60"
                >
                  <td
                    style={{
                      width: getColumnWidth('groupKey'),
                      minWidth: getColumnWidth('groupKey'),
                    }}
                    className="py-3 px-4 border-r border-slate-200"
                  >
                    <div className="font-mono font-bold text-slate-900">{row.groupKey}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{row.subLabel}</div>
                  </td>
                  <td
                    style={{
                      width: getColumnWidth('totalJoints'),
                      minWidth: getColumnWidth('totalJoints'),
                    }}
                    className="py-3 px-3 border-r border-slate-200 font-mono text-right"
                  >
                    <span className="font-bold text-slate-900">{row.totalJoints}</span>
                    {row.supplementaryJoints > 0 && (
                      <span className="text-slate-500 ml-1">
                        (доп: {row.supplementaryJoints})
                      </span>
                    )}
                  </td>
                  <td
                    style={{
                      width: getColumnWidth('weldedCount'),
                      minWidth: getColumnWidth('weldedCount'),
                    }}
                    className="py-3 px-3 border-r border-slate-200 font-mono text-right"
                  >
                    <span className="font-semibold text-slate-900">{row.weldedCount}</span>{' '}
                    <span className="text-slate-500">({row.weldingPct}%)</span>
                  </td>
                  <td
                    style={{
                      width: getColumnWidth('vikPassedCount'),
                      minWidth: getColumnWidth('vikPassedCount'),
                    }}
                    className="py-3 px-3 border-r border-slate-200 font-mono text-right"
                  >
                    {row.vikPassedCount}
                  </td>
                  <td
                    style={{
                      width: getColumnWidth('ndtPassedCount'),
                      minWidth: getColumnWidth('ndtPassedCount'),
                    }}
                    className="py-3 px-3 border-r border-slate-200 font-mono text-right"
                  >
                    {row.ndtPassedCount}
                  </td>
                  <td
                    style={{
                      width: getColumnWidth('dupNdtPassedCount'),
                      minWidth: getColumnWidth('dupNdtPassedCount'),
                    }}
                    className="py-3 px-3 border-r border-slate-200 font-mono text-right"
                  >
                    {row.dupNdtPassedCount}
                  </td>
                  <td
                    style={{
                      width: getColumnWidth('repairCount'),
                      minWidth: getColumnWidth('repairCount'),
                    }}
                    className="py-3 px-3 border-r border-slate-200 font-mono text-right"
                  >
                    {row.repairCount > 0 ? (
                      <span className="font-bold text-amber-700">{row.repairCount} (ремонт)</span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td
                    style={{
                      width: getColumnWidth('readinessPct'),
                      minWidth: getColumnWidth('readinessPct'),
                    }}
                    className="py-3 px-4 border-r border-slate-200"
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                      <span className="font-bold text-[#1e3799]">{row.readinessPct}% сдано</span>
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
                  <td
                    style={{
                      width: getColumnWidth('action'),
                      minWidth: getColumnWidth('action'),
                    }}
                    className="py-3 px-3 text-center"
                  >
                    <button
                      type="button"
                      onClick={() => onFilterRegistryByCondition(condition, row.groupKey)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#e8f1fc] text-[#1e3799] hover:bg-[#1e3799] hover:text-white font-semibold transition-colors"
                    >
                      <Filter className="w-3 h-3" />
                      <span>К стыкам</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
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
                title="Сбросить ширину столбцов отчёта готовности к заводской"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-[11px] transition-colors shadow-2xs cursor-pointer"
              >
                <RotateCcw className="w-3 h-3 text-slate-400" />
                <span>Сбросить ширину столбцов</span>
              </button>
            )}
          </div>
          <div>
            Ширина столбцов регулируется перетаскиванием правой границы заголовка (двойной клик — автоподбор)
          </div>
        </div>
      </div>
    </div>
  );
};
