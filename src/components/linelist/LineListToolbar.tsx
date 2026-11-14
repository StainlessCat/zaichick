import React from 'react';
import {
  Download,
  Layers,
  Lock,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';

interface LineListToolbarProps {
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

      {/* Скрытый input для загрузки реального файла Excel (.xlsx, .xls, .csv) */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={onFileChange}
        className="hidden"
        aria-label="Выбрать файл Excel для загрузки лайнлиста"
      />

      {!canEdit && (
        <div className="px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold">
            <Lock className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              Ролевое ограничение (RBAC): Текущая роль — «{currentUserRoleLabel}». Редактирование вкладки «Проект (лайнлист)» доступно только роли «Инженер ПТО». Включён режим чтения (выгрузка в Excel и переход к стыкам доступны).
            </span>
          </div>
          <span className="px-2 py-0.5 rounded bg-amber-200/70 text-amber-900 font-mono text-[11px] shrink-0">
            Только чтение
          </span>
        </div>
      )}

      {/* Верхняя панель управления разделом «Проект (лайнлист)» */}
      <div className="bg-white rounded-xl border border-slate-200 px-3 py-2.5 shadow-2xs flex flex-wrap items-center justify-end gap-2">
        <div className="flex flex-wrap items-center gap-2 w-full justify-end">
          {canEdit && (
            <button
              type="button"
              onClick={onToggleStructureManager}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors border cursor-pointer ${
                showStructureManager
                  ? 'bg-red-50 border-red-300 text-red-700'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
              title="Удаление объектов строительства, шифров РД и линий"
            >
              <Trash2 className="w-4 h-4 text-red-600" />
              <span>Объекты / Шифры РД (Удаление)</span>
            </button>
          )}

          {canEdit && selectedLineIds.length > 0 && (
            !confirmBulkDelete ? (
              <button
                type="button"
                onClick={() => setConfirmBulkDelete(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 border border-red-300 text-red-700 hover:bg-red-100 text-xs font-semibold transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Удалить линии ({selectedLineIds.length})</span>
              </button>
            ) : (
              <div className="inline-flex items-center gap-1 bg-red-50 border border-red-400 rounded-lg px-2.5 py-1">
                <span className="text-xs font-bold text-red-800">
                  Удалить {selectedLineIds.length} лин.?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteLineItems(selectedLineIds);
                    onClearSelection();
                    setConfirmBulkDelete(false);
                  }}
                  className="px-2 py-1 rounded bg-red-600 text-white text-xs font-bold hover:bg-red-700 cursor-pointer"
                >
                  Да
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmBulkDelete(false)}
                  className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Нет
                </button>
              </div>
            )
          )}

          {canEdit && (
            <button
              type="button"
              onClick={onOpenBulkModal}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors border cursor-pointer ${
                selectedLineIds.length > 0
                  ? 'bg-[#e8f1fc] border-[#1e3799] text-[#1e3799] hover:bg-sky-100'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Layers className="w-4 h-4 text-[#1e3799]" />
              <span>
                Групповое ред.
                {selectedLineIds.length > 0 ? ` (${selectedLineIds.length})` : ''}
              </span>
            </button>
          )}

          {canEdit && (
            <button
              type="button"
              onClick={onToggleImportPanel}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#1e3799] text-[#1e3799] bg-sky-50/70 hover:bg-sky-100 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Загрузить из Excel (.xlsx / .csv)</span>
            </button>
          )}

          <button
            type="button"
            onClick={onExportExcel}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 text-xs font-semibold transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-[#1e3799]" />
            <span>Выгрузить лайнлист (.xlsx)</span>
          </button>

          {canEdit && (
            <button
              type="button"
              onClick={onOpenCreateLineModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1e3799] text-white hover:bg-[#15276e] text-xs font-semibold transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Добавить линию</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
};
