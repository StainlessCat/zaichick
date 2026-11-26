import React, { useEffect, useRef, useState } from 'react';
import {
  Columns3,
  Download,
  Gauge,
  Layers,
  Lock,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { LineListColumnKey } from '../../types/welding';
import { LINELIST_COLUMNS } from '../../utils/weldingLogic';
import { Button, FormField, Select } from '../ui';

export interface LineListToolbarProps {
  canEdit: boolean;
  currentUserRoleLabel: string;
  showStructureManager: boolean;
  onToggleStructureManager: () => void;
  selectedLineIds: string[];
  selectedDeletableLineIds: string[];
  selectedBlockedByJointsCount: number;
  onClearSelection: () => void;
  confirmBulkDelete: boolean;
  setConfirmBulkDelete: (v: boolean) => void;
  onDeleteLineItems: (ids: string[]) => void;
  onOpenBulkModal: () => void;
  onToggleImportPanel: () => void;
  onExportExcel: () => void;
  onOpenCreateLineModal: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uniqueObjectNames: string[];
  uniqueRdCodes: string[];
  uniqueContours: string[];
  ptoEngineerOptions: string[];

  // Фильтр по шифру РД в рамках выбранного в меню объекта
  selectedRdCode?: string;
  availableRdCodes?: string[];
  onSelectRdCode?: (code: string) => void;
  // Быстрый текстовый поиск по лайнлисту
  searchQuery: string;
  onChangeSearchQuery: (q: string) => void;
  // Управление видимыми столбцами
  visibleColumns: LineListColumnKey[];
  onToggleColumnVisibility: (key: LineListColumnKey) => void;
  onShowAllColumns: () => void;

  canManageCircuits?: boolean;
  onOpenAssignCircuitModal?: () => void;
  hasActiveFilters?: boolean;
  onResetAllFilters?: () => void;
}

export const LineListToolbar: React.FC<LineListToolbarProps> = ({
  canEdit,
  currentUserRoleLabel,
  showStructureManager,
  onToggleStructureManager,
  selectedLineIds,
  selectedDeletableLineIds,
  selectedBlockedByJointsCount,
  onClearSelection,
  confirmBulkDelete,
  setConfirmBulkDelete,
  onDeleteLineItems,
  onOpenBulkModal,
  onToggleImportPanel,
  onExportExcel,
  onOpenCreateLineModal,
  fileInputRef,
  onFileChange,
  uniqueObjectNames,
  uniqueRdCodes,
  uniqueContours,
  ptoEngineerOptions,
  selectedRdCode,
  availableRdCodes,
  onSelectRdCode,
  searchQuery,
  onChangeSearchQuery,
  visibleColumns,
  onToggleColumnVisibility,
  onShowAllColumns,
  canManageCircuits,
  onOpenAssignCircuitModal,
}) => {
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);
  const columnsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showColumnsMenu) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        columnsMenuRef.current &&
        !columnsMenuRef.current.contains(e.target as Node)
      ) {
        setShowColumnsMenu(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowColumnsMenu(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [showColumnsMenu]);

  const hiddenColsCount = LINELIST_COLUMNS.length - visibleColumns.length;

  return (
    <>
      <datalist id="ll-objects-list">
        {uniqueObjectNames.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
      <datalist id="ll-rds-list">
        {uniqueRdCodes.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      <datalist id="ll-contours-list">
        {uniqueContours.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="ll-pto-engineers-list">
        {ptoEngineerOptions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {/* Скрытый input для загрузки файла Excel */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={onFileChange}
        className="hidden"
        aria-label="Выбрать файл Excel для загрузки лайнлиста"
      />

      {!canEdit && (
        <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold min-w-0">
            <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
            <span className="truncate">
              Ролевое ограничение: текущая роль — «{currentUserRoleLabel}». Режим чтения, выгрузка в Excel доступна.
            </span>
          </div>
          <span className="px-2 py-0.5 rounded bg-amber-200/70 text-amber-900 font-mono text-[11px] shrink-0">
            Только чтение
          </span>
        </div>
      )}

      {/* Верхняя панель управления разделом «Лайнлист» */}
      <div className="bg-white rounded-xl border border-slate-200 px-3 py-2 shadow-2xs flex flex-wrap items-end justify-between gap-2.5">
        {/* Левая группа: Шифр РД и быстрый поиск */}
        <div className="flex flex-wrap items-end gap-2">
          {availableRdCodes && onSelectRdCode && (
            <FormField label="Шифр РД" className="w-48 sm:w-56">
              <Select
                value={selectedRdCode || 'ALL'}
                onChange={(e) => onSelectRdCode(e.target.value)}
                className="w-full truncate font-medium text-slate-800"
              >
                <option value="ALL">Все шифры РД</option>
                {availableRdCodes.map((rd) => (
                  <option key={rd} value={rd}>
                    {rd}
                  </option>
                ))}
              </Select>
            </FormField>
          )}

          <FormField label="Поиск" className="w-52 sm:w-64">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onChangeSearchQuery(e.target.value)}
                placeholder="Линия, наименование, контур, ПТО…"
                aria-label="Поиск по лайнлисту"
                className="w-full h-8 pl-8 pr-7 bg-white border border-slate-300 rounded-md text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onChangeSearchQuery('')}
                  aria-label="Очистить поиск"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </FormField>

          {/* Переключатель видимых столбцов */}
          <div className="relative" ref={columnsMenuRef}>
            <Button
              type="button"
              variant={hiddenColsCount > 0 ? 'primary' : 'secondary'}
              onClick={() => setShowColumnsMenu((prev) => !prev)}
              title="Выбрать отображаемые столбцы таблицы"
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span>
                Столбцы
                {hiddenColsCount > 0 ? ` · ${visibleColumns.length}/${LINELIST_COLUMNS.length}` : ''}
              </span>
            </Button>

            {showColumnsMenu && (
              <div
                role="dialog"
                aria-label="Видимые столбцы лайнлиста"
                className="absolute left-0 top-full mt-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-40 overflow-hidden text-xs"
              >
                <div className="flex items-center justify-between px-3 py-2 bg-[#f0f5fc] border-b border-slate-200">
                  <span className="font-semibold text-[#1e3799]">Видимые столбцы</span>
                  {hiddenColsCount > 0 && (
                    <button
                      type="button"
                      onClick={onShowAllColumns}
                      className="text-[11px] font-semibold text-[#1e3799] hover:underline cursor-pointer"
                    >
                      Показать все
                    </button>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto p-1.5 space-y-0.5">
                  {LINELIST_COLUMNS.map((col) => {
                    const isPinned = col.key === 'lineNumber';
                    const isChecked = isPinned || visibleColumns.includes(col.key);
                    return (
                      <label
                        key={col.key}
                        className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-slate-50 ${
                          isPinned ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isPinned}
                            onChange={() => onToggleColumnVisibility(col.key)}
                            className="rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799]"
                          />
                          <span className="truncate text-slate-700">{col.label}</span>
                        </span>
                        {isPinned && (
                          <span className="text-[10px] text-slate-400 shrink-0">Закреплён</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Правая группа: Действия со строками лайнлиста */}
        <div className="flex flex-wrap items-end gap-1.5">
          {canEdit && (
            <Button
              type="button"
              variant={showStructureManager ? 'danger' : 'secondary'}
              onClick={onToggleStructureManager}
              title="Удаление объектов строительства, шифров РД и линий"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-600" />
              <span>Объекты / РД</span>
            </Button>
          )}

          {canEdit && selectedLineIds.length > 0 && (
            !confirmBulkDelete ? (
              <Button
                type="button"
                variant="danger"
                onClick={() => setConfirmBulkDelete(true)}
                title={
                  selectedBlockedByJointsCount > 0
                    ? `Из ${selectedLineIds.length} выбранных линий со стыками: ${selectedBlockedByJointsCount}`
                    : 'Удалить выделенные линии проекта'
                }
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Удалить · {selectedLineIds.length}</span>
              </Button>
            ) : selectedDeletableLineIds.length === 0 ? (
              <div className="flex items-center gap-1.5 h-8 box-border px-2.5 bg-amber-50 border border-amber-300 rounded-md">
                <span className="text-[11px] font-semibold text-amber-900 whitespace-nowrap">
                  Нельзя удалить: у всех {selectedBlockedByJointsCount} лин. есть стыки
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setConfirmBulkDelete(false)}
                >
                  Понятно
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1 h-8 box-border px-2 bg-red-50 border border-red-300 rounded-md">
                <span className="text-[11px] font-bold text-red-800 whitespace-nowrap">
                  {selectedBlockedByJointsCount > 0
                    ? `Удалить ${selectedDeletableLineIds.length} пуст. из ${selectedLineIds.length}?`
                    : `Удалить ${selectedDeletableLineIds.length} лин.?`}
                </span>
                <Button
                  type="button"
                  variant="danger"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => {
                    onDeleteLineItems(selectedDeletableLineIds);
                    onClearSelection();
                    setConfirmBulkDelete(false);
                  }}
                >
                  Да
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setConfirmBulkDelete(false)}
                >
                  Нет
                </Button>
              </div>
            )
          )}

          {canManageCircuits &&
            onOpenAssignCircuitModal &&
            selectedLineIds.length > 0 && (
              <Button
                type="button"
                variant="primary"
                onClick={onOpenAssignCircuitModal}
                title="Назначить все стыки выбранных линий в испытательный контур"
              >
                <Gauge className="w-3.5 h-3.5" />
                <span>В контур · {selectedLineIds.length}</span>
              </Button>
            )}

          {canEdit && (
            <Button
              type="button"
              variant={selectedLineIds.length > 0 ? 'primary' : 'secondary'}
              disabled={selectedLineIds.length === 0}
              onClick={onOpenBulkModal}
              title={
                selectedLineIds.length > 0
                  ? 'Групповое редактирование параметров выбранных линий'
                  : 'Отметьте галочками одну или несколько линий в таблице'
              }
            >
              <Layers className="w-3.5 h-3.5" />
              <span>
                Групповое редактирование
                {selectedLineIds.length > 0 ? ` · ${selectedLineIds.length}` : ''}
              </span>
            </Button>
          )}

          {canEdit && (
            <Button
              type="button"
              variant="secondary"
              onClick={onToggleImportPanel}
              title="Импорт линий из файла Excel или буфера обмена"
            >
              <Upload className="w-3.5 h-3.5 text-[#1e3799]" />
              <span>Импорт Excel</span>
            </Button>
          )}

          <Button
            type="button"
            variant="secondary"
            onClick={onExportExcel}
            title="Выгрузить строки лайнлиста в файл Excel"
          >
            <Download className="w-3.5 h-3.5 text-[#1e3799]" />
            <span>Выгрузить в Excel</span>
          </Button>

          {canEdit && (
            <Button
              type="button"
              variant="primary"
              onClick={onOpenCreateLineModal}
              title="Добавить новую технологическую линию"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Добавить линию</span>
            </Button>
          )}
        </div>
      </div>
    </>
  );
};
