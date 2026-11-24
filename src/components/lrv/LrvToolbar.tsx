import React from 'react';
import { Download, FileSpreadsheet, Plus, Trash2, Upload, RotateCcw } from 'lucide-react';
import { Button } from '../ui';
import { LRVItem, WeldJoint } from '../../types/welding';
import { isLrvItemUsedInJoints } from '../../utils/weldingLogic';

export type LrvStatusFilter =
  | 'all'
  | 'accepted'
  | 'partial'
  | 'rejected'
  | 'pending'
  | 'superseded';

interface LrvToolbarProps {
  statusFilter: LrvStatusFilter;
  onStatusFilterChange: (status: LrvStatusFilter) => void;
  canEdit: boolean;
  onExportExcel: () => void;
  onDownloadTemplate: () => void;
  onImportClick: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleAddForm: () => void;
  selectedLrvIds: string[];
  onClearSelection: () => void;
  onDeleteSelected?: (ids: string[]) => void;
  catalog: LRVItem[];
  joints?: WeldJoint[];
  onBlockMessage: (msg: string) => void;
  hasActiveFilters?: boolean;
  onResetAllFilters?: () => void;
}

export const LrvToolbar: React.FC<LrvToolbarProps> = ({
  statusFilter,
  onStatusFilterChange,
  canEdit,
  onExportExcel,
  onDownloadTemplate,
  onImportClick,
  fileInputRef,
  onFileUpload,
  onToggleAddForm,
  selectedLrvIds,
  onDeleteSelected,
  catalog,
  joints,
  onBlockMessage,
  hasActiveFilters,
  onResetAllFilters,
}) => {
  const [confirmBulkDelete, setConfirmBulkDelete] = React.useState(false);

  const handleConfirmDelete = () => {
    if (!onDeleteSelected) return;
    const itemsToDelete = catalog.filter((i) => selectedLrvIds.includes(i.id));
    const usedItems = itemsToDelete.filter(
      (i) => joints && isLrvItemUsedInJoints(i, joints)
    );
    if (usedItems.length > 0) {
      onBlockMessage(
        `Из ${itemsToDelete.length} выбранных позиций ${usedItems.length} поз. уже привязаны к сварным стыкам. Физическое удаление запрещено.`
      );
      setConfirmBulkDelete(false);
      return;
    }
    onDeleteSelected(selectedLrvIds);
    setConfirmBulkDelete(false);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 px-3 py-2 shadow-2xs flex flex-wrap items-end justify-between gap-2.5">
      {/* Переключатель фильтрации по статусу входного контроля и спецификации */}
      <div className="h-8 box-border flex items-center p-0.5 bg-slate-100 rounded-md border border-slate-300 overflow-x-auto">
        <button
          type="button"
          onClick={() => onStatusFilterChange('all')}
          className={`h-full box-border px-2.5 rounded text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            statusFilter === 'all'
              ? 'bg-white text-[#1e3799] shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Все
        </button>
        <button
          type="button"
          onClick={() => onStatusFilterChange('accepted')}
          className={`h-full box-border px-2.5 rounded text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            statusFilter === 'accepted'
              ? 'bg-white text-emerald-800 shadow-2xs font-bold'
              : 'text-emerald-700 hover:text-emerald-900'
          }`}
        >
          Годны к монтажу
        </button>
        <button
          type="button"
          onClick={() => onStatusFilterChange('partial')}
          className={`h-full box-border px-2.5 rounded text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            statusFilter === 'partial'
              ? 'bg-white text-amber-800 shadow-2xs font-bold'
              : 'text-amber-700 hover:text-amber-900'
          }`}
        >
          Частичный допуск
        </button>
        <button
          type="button"
          onClick={() => onStatusFilterChange('rejected')}
          className={`h-full box-border px-2.5 rounded text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            statusFilter === 'rejected'
              ? 'bg-white text-rose-800 shadow-2xs font-bold'
              : 'text-rose-700 hover:text-rose-900'
          }`}
        >
          Выявлен брак
        </button>
        <button
          type="button"
          onClick={() => onStatusFilterChange('pending')}
          className={`h-full box-border px-2.5 rounded text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            statusFilter === 'pending'
              ? 'bg-white text-slate-800 shadow-2xs font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Ожидают контроля
        </button>
        <button
          type="button"
          onClick={() => onStatusFilterChange('superseded')}
          className={`h-full box-border px-2.5 rounded text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            statusFilter === 'superseded'
              ? 'bg-white text-indigo-800 shadow-2xs font-bold'
              : 'text-indigo-700 hover:text-indigo-900'
          }`}
        >
          Аннулированные
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-1.5 justify-end">
        <Button
          type="button"
          variant="secondary"
          onClick={onExportExcel}
          title="Выгрузить базу материалов в Excel"
        >
          <Download className="w-3.5 h-3.5 text-[#1e3799]" />
          <span>Выгрузить в Excel</span>
        </Button>

        {canEdit && (
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={onDownloadTemplate}
              title="Скачать пустой шаблон для заполнения"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              <span>Шаблон Excel</span>
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={onFileUpload}
              className="hidden"
              aria-label="Загрузить из Excel"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={onImportClick}
              title="Импорт позиций ЛРВ из файла Excel"
            >
              <Upload className="w-3.5 h-3.5 text-[#1e3799]" />
              <span>Импорт Excel</span>
            </Button>

            {onDeleteSelected &&
              selectedLrvIds.length > 0 &&
              (confirmBulkDelete ? (
                <div className="flex items-center gap-1 h-8 box-border px-2 rounded-md border border-red-300 bg-red-50 text-xs">
                  <span className="font-bold text-red-800 text-[11px] whitespace-nowrap">
                    Удалить {selectedLrvIds.length} поз.?
                  </span>
                  <Button
                    type="button"
                    variant="danger"
                    className="h-6 px-2 text-[11px]"
                    onClick={handleConfirmDelete}
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
              ) : (
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => setConfirmBulkDelete(true)}
                  title="Удалить выбранные позиции каталога ЛРВ"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Удалить: {selectedLrvIds.length}</span>
                </Button>
              ))}

            <Button
              type="button"
              variant="primary"
              onClick={onToggleAddForm}
              title="Добавить позицию детали трубопровода"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Добавить позицию</span>
            </Button>
          </>
        )}
      </div>
    </div>
  );
};
