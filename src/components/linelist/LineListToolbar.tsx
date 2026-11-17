import React from 'react';
import {
  Download,
  Layers,
  Lock,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { Button, FormField, Select } from '../ui';

export interface LineListToolbarProps {
  canEdit: boolean;
  currentUserRoleLabel: string;
  showStructureManager: boolean;
  onToggleStructureManager: () => void;
  selectedLineIds: string[];
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

  // Фильтр по шифру РД в рамках выбранного в меню объекта
  selectedRdCode?: string;
  availableRdCodes?: string[];
  onSelectRdCode?: (code: string) => void;
}

export const LineListToolbar: React.FC<LineListToolbarProps> = ({
  canEdit,
  currentUserRoleLabel,
  showStructureManager,
  onToggleStructureManager,
  selectedLineIds,
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
  selectedRdCode,
  availableRdCodes,
  onSelectRdCode,
}) => {
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

      {/* Скрытый input для загрузки файла Excel (.xlsx, .xls, .csv) */}
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
              Ролевое ограничение: Текущая роль — «{currentUserRoleLabel}». Режим чтения (выгрузка в Excel доступна).
            </span>
          </div>
          <span className="px-2 py-0.5 rounded bg-amber-200/70 text-amber-900 font-mono text-[11px] shrink-0">
            Только чтение
          </span>
        </div>
      )}

      {/* Верхняя панель управления разделом «Проект (лайнлист)» (strict-industrial-ui) */}
      <div className="bg-white rounded-xl border border-slate-200 px-3 py-2 shadow-2xs flex flex-wrap items-end justify-between gap-2.5">
        {/* Левая группа: Шифр РД и метеостанция */}
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
                title="Удалить выделенные линии проекта"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Удалить · {selectedLineIds.length}</span>
              </Button>
            ) : (
              <div className="flex items-center gap-1 h-8 box-border px-2 bg-red-50 border border-red-300 rounded-md">
                <span className="text-[11px] font-bold text-red-800 whitespace-nowrap">
                  Удалить {selectedLineIds.length} лин.?
                </span>
                <Button
                  type="button"
                  variant="danger"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => {
                    onDeleteLineItems(selectedLineIds);
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

          {canEdit && (
            <Button
              type="button"
              variant={selectedLineIds.length > 0 ? 'primary' : 'secondary'}
              onClick={onOpenBulkModal}
              title="Групповое редактирование параметров выбранных линий"
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
