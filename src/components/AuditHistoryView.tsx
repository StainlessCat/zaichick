import React, { useMemo, useState } from 'react';
import { History, Lock, RotateCcw, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { AuditLogEntry } from '../types/welding';
import { formatDateDDMMYY, formatTimestampDDMMYY, isDateColumnKey } from '../utils/weldingLogic';
import {
  applyTableColumnFiltersAndSort,
  TableColumnFilterHeader,
} from './TableColumnFilterPopover';
import { useResizableColumns } from '../utils/useResizableColumns';

interface AuditHistoryViewProps {
  logs: AuditLogEntry[];
  isAdmin?: boolean;
  onClearAuditLog?: () => void;
  onOpenAdminPasswordModal?: () => void;
}

export const AuditHistoryView: React.FC<AuditHistoryViewProps> = ({
  logs,
  isAdmin = false,
  onClearAuditLog,
  onOpenAdminPasswordModal,
}) => {
  const [search, setSearch] = useState('');
  const [opFilter, setOpFilter] = useState<string>('ALL');
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // Регулирование ширины столбцов журнала аудита с сохранением в localStorage
  const {
    columnWidths,
    getColumnWidth,
    handleResizeStart,
    handleAutoFit,
    handleResetWidths,
    hasCustomWidths,
  } = useResizableColumns({
    storageKey: 'zaychick_col_widths_audit',
    defaultWidths: {
      timestamp: 150,
      user: 230,
      joint: 190,
      fieldLabel: 170,
      oldValue: 180,
      newValue: 180,
      operationType: 140,
    },
  });

  const opLabelMap: Record<AuditLogEntry['operationType'], string> = {
    single_edit: 'Редактирование паспорта / ячейки',
    bulk_edit: 'Массовое редактирование стыков',
    create_joint: 'Создание стыка',
    delete_joint: 'Удаление стыка',
    cross_rd_lrv: 'Применение ЛРВ из другого шифра РД',
    batch_upload: 'Импорт стыков из Excel',
  };

  const baseFiltered = useMemo(() => {
    return logs.filter((l) => {
      if (opFilter !== 'ALL' && l.operationType !== opFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return (
          l.userFullName.toLowerCase().includes(q) ||
          l.userLogin.toLowerCase().includes(q) ||
          l.uniqueLineId.toLowerCase().includes(q) ||
          l.jointNumber.toLowerCase().includes(q) ||
          l.fieldLabel.toLowerCase().includes(q) ||
          l.oldValue.toLowerCase().includes(q) ||
          l.newValue.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [logs, opFilter, search]);

  const auditGetters = useMemo<Record<string, (entry: AuditLogEntry) => string>>(
    () => ({
      timestamp: (entry) => formatTimestampDDMMYY(entry.timestamp),
      user: (entry) => `${entry.userFullName} (${entry.userLogin})`,
      joint: (entry) => `${entry.uniqueLineId} · ст. ${entry.jointNumber}`,
      fieldLabel: (entry) => entry.fieldLabel,
      oldValue: (entry) =>
        isDateColumnKey(entry.fieldKey)
          ? formatDateDDMMYY(entry.oldValue) || entry.oldValue
          : entry.oldValue,
      newValue: (entry) =>
        isDateColumnKey(entry.fieldKey)
          ? formatDateDDMMYY(entry.newValue) || entry.newValue
          : entry.newValue,
      operationType: (entry) => opLabelMap[entry.operationType],
    }),
    []
  );

  const filtered = useMemo(
    () =>
      applyTableColumnFiltersAndSort(
        baseFiltered,
        columnFilters,
        auditGetters,
        sortConfig
      ),
    [baseFiltered, columnFilters, auditGetters, sortConfig]
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

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-[#1e3799]" />
            <h2 className="font-display text-base font-bold text-slate-900">
              Журнал изменений и аудита действий пользователей
            </h2>
            {isAdmin && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-[11px] font-semibold text-[#1e3799]">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Режим администратора</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Полное протоколирование корректировок данных подготовки производства и сварки (формат дат: ДД.ММ.ГГ · Фильтрация как в Excel)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Кнопки смены пароля администратора и очистки журнала аудита отображаются СТРОГО только при входе в качестве администратора */}
          {isAdmin && onOpenAdminPasswordModal && (
            <button
              type="button"
              onClick={onOpenAdminPasswordModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-50 border border-indigo-200 text-xs font-semibold text-[#1e3799] hover:bg-indigo-100 transition-colors cursor-pointer"
              title="Изменить пароль учётной записи администратора"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Сменить пароль админа</span>
            </button>
          )}
          {isAdmin && onClearAuditLog && (
            !confirmClear ? (
              <button
                type="button"
                disabled={logs.length === 0}
                onClick={() => setConfirmClear(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-50 border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-45 disabled:pointer-events-none transition-colors cursor-pointer"
                title="Полная очистка журнала аудита (доступно только администратору)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Очистить журнал аудита ({logs.length})</span>
              </button>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-50 border border-red-300">
                <span className="text-xs font-semibold text-red-800">
                  Очистить все записи ({logs.length})?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onClearAuditLog();
                    setConfirmClear(false);
                    setColumnFilters({});
                  }}
                  className="px-2.5 py-1 rounded bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors cursor-pointer"
                >
                  Да, очистить
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Отмена
                </button>
              </div>
            )
          )}

          {Object.keys(columnFilters).length > 0 && (
            <button
              type="button"
              onClick={() => setColumnFilters({})}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-sky-50 border border-sky-200 text-xs font-semibold text-[#1e3799] hover:bg-sky-100"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Сбросить фильтры столбцов ({Object.keys(columnFilters).length})</span>
            </button>
          )}

          <select
            value={opFilter}
            onChange={(e) => setOpFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-md text-xs"
          >
            <option value="ALL">Все типы операций ({logs.length})</option>
            <option value="single_edit">Одиночная правка</option>
            <option value="bulk_edit">Массовое редактирование</option>
            <option value="create_joint">Добавление стыков</option>
            <option value="delete_joint">Удаление стыков</option>
          </select>

          <div className="relative w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по ФИО, линии, стыку, полю..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto min-h-[360px]">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-[#1e3799] text-white text-left">
                <TableColumnFilterHeader
                  columnKey="timestamp"
                  label="Дата и время (ДД.ММ.ГГ)"
                  rows={baseFiltered}
                  getValue={auditGetters.timestamp}
                  activeFilters={columnFilters}
                  onApplyFilter={handleApplyFilter}
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  width={getColumnWidth('timestamp')}
                  minWidth={110}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('timestamp', 150)}
                />
                <TableColumnFilterHeader
                  columnKey="user"
                  label="Пользователь (Логин / ФИО / Должность)"
                  rows={baseFiltered}
                  getValue={auditGetters.user}
                  activeFilters={columnFilters}
                  onApplyFilter={handleApplyFilter}
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  width={getColumnWidth('user')}
                  minWidth={140}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('user', 230)}
                />
                <TableColumnFilterHeader
                  columnKey="joint"
                  label="Линия (Уник. ID) · № стыка"
                  rows={baseFiltered}
                  getValue={auditGetters.joint}
                  activeFilters={columnFilters}
                  onApplyFilter={handleApplyFilter}
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  width={getColumnWidth('joint')}
                  minWidth={130}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('joint', 190)}
                />
                <TableColumnFilterHeader
                  columnKey="fieldLabel"
                  label="Изменённое поле"
                  rows={baseFiltered}
                  getValue={auditGetters.fieldLabel}
                  activeFilters={columnFilters}
                  onApplyFilter={handleApplyFilter}
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  width={getColumnWidth('fieldLabel')}
                  minWidth={120}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('fieldLabel', 170)}
                />
                <TableColumnFilterHeader
                  columnKey="oldValue"
                  label="Прежнее значение (Было)"
                  rows={baseFiltered}
                  getValue={auditGetters.oldValue}
                  activeFilters={columnFilters}
                  onApplyFilter={handleApplyFilter}
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  width={getColumnWidth('oldValue')}
                  minWidth={120}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('oldValue', 180)}
                />
                <TableColumnFilterHeader
                  columnKey="newValue"
                  label="Новое значение (Стало)"
                  rows={baseFiltered}
                  getValue={auditGetters.newValue}
                  activeFilters={columnFilters}
                  onApplyFilter={handleApplyFilter}
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  width={getColumnWidth('newValue')}
                  minWidth={120}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('newValue', 180)}
                />
                <TableColumnFilterHeader
                  columnKey="operationType"
                  label="Вид операции"
                  rows={baseFiltered}
                  getValue={auditGetters.operationType}
                  activeFilters={columnFilters}
                  onApplyFilter={handleApplyFilter}
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  width={getColumnWidth('operationType')}
                  minWidth={100}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('operationType', 140)}
                  className="border-r-0"
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.map((entry) => {
                const isDateField = isDateColumnKey(entry.fieldKey);
                const oldValFormatted = isDateField
                  ? formatDateDDMMYY(entry.oldValue) || entry.oldValue
                  : entry.oldValue;
                const newValFormatted = isDateField
                  ? formatDateDDMMYY(entry.newValue) || entry.newValue
                  : entry.newValue;

                return (
                  <tr
                    key={entry.id}
                    className="hover:bg-[#e8f1fc]/50 transition-colors odd:bg-white even:bg-slate-50/60"
                  >
                    <td
                      style={{
                        width: getColumnWidth('timestamp'),
                        minWidth: getColumnWidth('timestamp'),
                      }}
                      className="py-2.5 px-4 border-r border-slate-200 font-mono text-slate-700 whitespace-nowrap"
                    >
                      {formatTimestampDDMMYY(entry.timestamp)}
                    </td>
                    <td
                      style={{
                        width: getColumnWidth('user'),
                        minWidth: getColumnWidth('user'),
                      }}
                      className="py-2.5 px-4 border-r border-slate-200"
                    >
                      <div className="font-semibold text-slate-900">{entry.userFullName}</div>
                      <div className="text-[11px] text-slate-500">
                        <span className="font-mono text-[#1e3799]">{entry.userLogin}</span> ·{' '}
                        {entry.userRole}
                      </div>
                    </td>
                    <td
                      style={{
                        width: getColumnWidth('joint'),
                        minWidth: getColumnWidth('joint'),
                      }}
                      className="py-2.5 px-4 border-r border-slate-200"
                    >
                      <div className="font-mono font-bold text-slate-900">
                        {entry.uniqueLineId} · ст. {entry.jointNumber}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500">{entry.rdCode}</div>
                    </td>
                    <td
                      style={{
                        width: getColumnWidth('fieldLabel'),
                        minWidth: getColumnWidth('fieldLabel'),
                      }}
                      className="py-2.5 px-4 border-r border-slate-200 font-semibold text-slate-800"
                    >
                      {entry.fieldLabel}
                    </td>
                    <td
                      style={{
                        width: getColumnWidth('oldValue'),
                        minWidth: getColumnWidth('oldValue'),
                      }}
                      className="py-2.5 px-4 border-r border-slate-200 font-mono text-slate-500 line-through"
                    >
                      {oldValFormatted || '—'}
                    </td>
                    <td
                      style={{
                        width: getColumnWidth('newValue'),
                        minWidth: getColumnWidth('newValue'),
                      }}
                      className="py-2.5 px-4 border-r border-slate-200 font-mono font-semibold text-[#1e3799]"
                    >
                      {newValFormatted || '—'}
                    </td>
                    <td
                      style={{
                        width: getColumnWidth('operationType'),
                        minWidth: getColumnWidth('operationType'),
                      }}
                      className="py-2.5 px-4 text-slate-600"
                    >
                      {opLabelMap[entry.operationType]}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-2.5 bg-[#f8fafd] border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <div>
              Отображено записей аудита:{' '}
              <span className="font-mono font-bold text-slate-800">
                {filtered.length}
              </span>{' '}
              из <span className="font-mono">{logs.length}</span>
            </div>
            {hasCustomWidths && (
              <button
                type="button"
                onClick={handleResetWidths}
                title="Сбросить ширину столбцов журнала аудита к заводской"
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
