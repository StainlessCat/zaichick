import React, { useMemo, useState } from 'react';
import { usePersistentState } from '../hooks/usePersistentState';
import { History, Lock, RotateCcw, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { AuditLogEntry } from '../types/welding';
import { formatDateDDMMYY, formatTimestampDDMMYY, isDateColumnKey } from '../utils/weldingLogic';
import {
  applyTableColumnFiltersAndSort,
  TableColumnFilterHeader,
} from './TableColumnFilterPopover';
import { useResizableColumns } from '../utils/useResizableColumns';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { Button, Input, Select } from './ui';

interface AuditHistoryViewProps {
  logs?: AuditLogEntry[];
  isAdmin?: boolean;
  onClearAuditLog?: () => void;
  onOpenAdminPasswordModal?: () => void;
}

export const AuditHistoryView: React.FC<AuditHistoryViewProps> = ({
  logs: propLogs,
  isAdmin: propIsAdmin,
  onClearAuditLog: propOnClearAuditLog,
  onOpenAdminPasswordModal,
}) => {
  const app = useAppContext();
  const auth = useAuth();

  const logs = propLogs ?? app.auditLogs ?? [];
  const isAdmin = propIsAdmin ?? (auth.userPermissions.category === 'admin');
  const onClearAuditLog = propOnClearAuditLog ?? (() => app.setAuditLogs([]));
  const [search, setSearch] = usePersistentState('audit:search', '');
  const [opFilter, setOpFilter] = usePersistentState<string>('audit:opFilter', 'ALL');
  const [columnFilters, setColumnFilters] = usePersistentState<Record<string, string[]>>(
    'audit:columnFilters',
    {}
  );
  const [sortConfig, setSortConfig] = usePersistentState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>('audit:sortConfig', null);
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
    lrv_superseded: 'Аннулирование позиции ЛРВ',
    linelist_change: 'Изменение лайнлиста РД',
    user_created: 'Создание пользователя',
    user_modified: 'Изменение прав / пользователя',
    user_deleted: 'Удаление пользователя',
    project_purged: 'Очистка данных проекта',
    record_status_changed: 'Изменение статуса записи',
    record_unlocked: 'Разблокировка записи',
    test_circuit_change: 'Испытательный контур',
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
      <div className="bg-white rounded-xl border border-slate-200 px-3 py-2 shadow-2xs flex flex-wrap items-end justify-between gap-2.5">
        <div>
          {isAdmin && (
            <span className="inline-flex items-center gap-1.5 px-2.5 h-8 box-border rounded-md bg-indigo-50 border border-indigo-200 text-xs font-semibold text-[#1e3799]">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Режим администратора</span>
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-1.5">
          {isAdmin && onOpenAdminPasswordModal && (
            <Button
              type="button"
              variant="secondary"
              onClick={onOpenAdminPasswordModal}
              title="Изменить пароль вашей учётной записи"
            >
              <Lock className="w-3.5 h-3.5 text-[#1e3799]" />
              <span>Сменить пароль</span>
            </Button>
          )}

          {isAdmin && onClearAuditLog && (
            !confirmClear ? (
              <Button
                type="button"
                variant="danger"
                disabled={logs.length === 0}
                onClick={() => setConfirmClear(true)}
                title="Очистить журнал аудита"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Очистить ({logs.length})</span>
              </Button>
            ) : (
              <div className="flex items-center gap-1 h-8 box-border px-2 rounded-md bg-red-50 border border-red-300">
                <span className="text-xs font-semibold text-red-800 whitespace-nowrap">
                  Очистить ({logs.length})?
                </span>
                <Button
                  type="button"
                  variant="danger"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => {
                    onClearAuditLog();
                    setConfirmClear(false);
                    setColumnFilters({});
                  }}
                >
                  Да
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setConfirmClear(false)}
                >
                  Нет
                </Button>
              </div>
            )
          )}

          {Object.keys(columnFilters).length > 0 && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setColumnFilters({})}
              title="Сбросить фильтры столбцов"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Сброс ({Object.keys(columnFilters).length})</span>
            </Button>
          )}

          <Select
            value={opFilter}
            onChange={(e) => setOpFilter(e.target.value)}
            className="w-48"
          >
            <option value="ALL">Все операции ({logs.length})</option>
            <option value="single_edit">Одиночная правка</option>
            <option value="bulk_edit">Массовое редактирование</option>
            <option value="create_joint">Добавление стыков</option>
            <option value="delete_joint">Удаление стыков</option>
            <option value="lrv_superseded">Аннулирование ЛРВ</option>
            <option value="linelist_change">Изменение лайнлиста</option>
            <option value="test_circuit_change">Испытательные контуры</option>
            <option value="user_created">Создание пользователей</option>
            <option value="user_modified">Изменение прав / ролей</option>
            <option value="user_deleted">Удаление пользователей</option>
          </Select>

          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ФИО, линия, стык, поле..."
              className="w-full pl-8"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto overflow-y-auto min-h-[360px] max-h-[calc(100vh-250px)] table-scroll-container">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-20 shadow-xs">
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
