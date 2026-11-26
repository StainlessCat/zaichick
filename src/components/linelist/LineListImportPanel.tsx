import React, { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Info,
  Lock,
  Sparkles,
  Upload,
} from 'lucide-react';
import { ProjectLineItem, WeldJoint } from '../../types/welding';
import {
  formatDateDDMMYY,
  formatExecutiveDocStatusLabel,
} from '../../utils/weldingLogic';
import { exportProjectLineListToExcel } from '../../utils/excelUtils';
import {
  LineBatchImportSummary,
  LineImportDuplicateMode,
  selectActionableImportItems,
  validateLineListImportPreview,
} from '../../utils/linelistImportValidation';

interface LineListImportPanelProps {
  existingLineList: ProjectLineItem[];
  joints: WeldJoint[];
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  uploadedFileName: string;
  importError: string;
  pasteText: string;
  previewItems: ProjectLineItem[];
  duplicateMode: LineImportDuplicateMode;
  isImporting: boolean;
  importResult: LineBatchImportSummary | null;
  onChangeDuplicateMode: (mode: LineImportDuplicateMode) => void;
  onChangePasteText: (value: string) => void;
  onParsePasteText: () => void;
  onConfirmImport: (
    actionableItems: ProjectLineItem[],
    mode: LineImportDuplicateMode
  ) => void;
  onClose: () => void;
}

export const LineListImportPanel: React.FC<LineListImportPanelProps> = ({
  existingLineList,
  joints,
  fileInputRef,
  uploadedFileName,
  importError,
  pasteText,
  previewItems,
  duplicateMode,
  isImporting,
  importResult,
  onChangeDuplicateMode,
  onChangePasteText,
  onParsePasteText,
  onConfirmImport,
  onClose,
}) => {
  const validation = useMemo(
    () => validateLineListImportPreview(previewItems, existingLineList),
    [previewItems, existingLineList]
  );

  const actionableItems = useMemo(
    () => selectActionableImportItems(validation, duplicateMode),
    [validation, duplicateMode]
  );

  const willUpdateCount =
    duplicateMode === 'update'
      ? Math.max(0, validation.duplicateDbCount - validation.duplicateLockedCount)
      : 0;

  return (
    <div className="bg-white rounded-xl border-2 border-[#1e3799]/30 p-5 shadow-md space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <h3 className="font-display text-sm font-bold text-[#1e3799] flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            <span>
              Загрузка данных лайнлиста из файла Excel или буфера обмена
            </span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Автоматическая проверка обязательных полей, формата дат и дубликатов перед записью в базу.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void exportProjectLineListToExcel([], joints, true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#1e3799]" />
            <span>Скачать шаблон Excel</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1 cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>

      {importResult && (
        <div
          className={`p-3 rounded-lg border text-xs flex flex-wrap items-center justify-between gap-2 ${
            importResult.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2 font-semibold">
            {importResult.ok ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>
              {importResult.ok
                ? `Импорт завершён: создано ${importResult.createdCount}, обновлено ${importResult.updatedCount}, пропущено ${importResult.skippedCount}`
                : `Ошибка импорта: ${importResult.errors[0] || 'не удалось сохранить данные'}`}
            </span>
          </div>
          {importResult.ok && importResult.errors.length > 0 && (
            <div className="text-[11px] text-amber-800 font-medium">
              Предупреждений: {importResult.errors.length}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="p-4 rounded-xl border-2 border-dashed border-[#1e3799]/35 bg-[#f4f8fe] flex flex-col items-center justify-center text-center gap-2">
            <FileSpreadsheet className="w-8 h-8 text-[#1e3799]" />
            <div className="text-xs font-semibold text-slate-800">
              Выберите файл Excel с проектной ведомостью линий
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1e3799] text-white text-xs font-semibold hover:bg-[#15276e] cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Выбрать файл Excel с диска</span>
              </button>
            </div>
            {uploadedFileName && (
              <div className="text-xs font-semibold text-emerald-700 mt-1">
                Источник: {uploadedFileName} · распознано линий: {previewItems.length}
              </div>
            )}
            {importError && (
              <div className="text-xs font-semibold text-red-600 mt-1">
                {importError}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700">
                Или вставьте скопированные строки напрямую из листа Excel:
              </label>
              <button
                type="button"
                onClick={onParsePasteText}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#1e3799] hover:underline cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Распознать строки из поля</span>
              </button>
            </div>
            <textarea
              rows={4}
              value={pasteText}
              onChange={(e) => onChangePasteText(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
            />
          </div>
        </div>

        <div className="space-y-2.5 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700">
              Предпросмотр импортируемых линий · {previewItems.length} поз.
            </span>
            {previewItems.length === 0 && (
              <button
                type="button"
                onClick={onParsePasteText}
                className="text-xs font-semibold text-[#1e3799] hover:underline cursor-pointer"
              >
                Загрузить демо-пример для проверки
              </button>
            )}
          </div>

          {previewItems.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px]">
              <div className="flex flex-wrap items-center gap-1.5 font-semibold">
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Новых: {validation.newCount}
                </span>
                {validation.duplicateDbCount > 0 && (
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                    Уже в базе: {validation.duplicateDbCount}
                  </span>
                )}
                {validation.duplicateFileCount > 0 && (
                  <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-900 border border-orange-300">
                    Дубли в файле: {validation.duplicateFileCount}
                  </span>
                )}
                {validation.invalidCount > 0 && (
                  <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300">
                    Ошибок: {validation.invalidCount}
                  </span>
                )}
              </div>

              {validation.duplicateDbCount > 0 && (
                <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
                  <button
                    type="button"
                    onClick={() => onChangeDuplicateMode('skip')}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                      duplicateMode === 'skip'
                        ? 'bg-[#1e3799] text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Пропустить дубликаты
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeDuplicateMode('update')}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                      duplicateMode === 'update'
                        ? 'bg-[#1e3799] text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Обновить существующие
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex-1 max-h-56 overflow-y-auto overflow-x-auto border border-slate-200 rounded-lg bg-slate-50 table-scroll-container">
            {previewItems.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                Выберите файл Excel слева или нажмите «Распознать строки из поля» для предпросмотра.
              </div>
            ) : (
              <table className="w-full text-[11px] border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[#1e3799] text-white">
                    <th className="py-1.5 px-2 text-left">Проверка</th>
                    <th className="py-1.5 px-2 text-left">Линия</th>
                    <th className="py-1.5 px-2 text-left">Наименование</th>
                    <th className="py-1.5 px-2 text-left">Ур. кач. / Кат.</th>
                    <th className="py-1.5 px-2 text-right">РК/УЗК/ПВК</th>
                    <th className="py-1.5 px-2 text-left">Статус ИД</th>
                    <th className="py-1.5 px-2 text-left">Испытание</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {validation.rows.map((row) => {
                    const it = row.item;
                    const rowTint =
                      row.status === 'invalid'
                        ? 'bg-rose-50/70'
                        : row.status === 'duplicate_file'
                          ? 'bg-orange-50/70'
                          : row.status === 'duplicate_db'
                            ? 'bg-amber-50/60'
                            : '';

                    return (
                      <tr key={it.id} className={rowTint}>
                        <td className="py-1.5 px-2 whitespace-nowrap">
                          {row.status === 'new' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold text-[10px]">
                              Новая
                            </span>
                          )}
                          {row.status === 'duplicate_db' && (
                            <span
                              title={row.reasons.join('; ')}
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-semibold text-[10px] ${
                                row.isExistingLocked
                                  ? 'bg-slate-200 text-slate-700'
                                  : duplicateMode === 'update'
                                    ? 'bg-sky-100 text-[#1e3799]'
                                    : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {row.isExistingLocked && <Lock className="w-2.5 h-2.5" />}
                              <span>
                                {row.isExistingLocked
                                  ? 'Заблокирована'
                                  : duplicateMode === 'update'
                                    ? 'Обновится'
                                    : 'Пропуск'}
                              </span>
                            </span>
                          )}
                          {row.status === 'duplicate_file' && (
                            <span
                              title={row.reasons.join('; ')}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-100 text-orange-900 font-semibold text-[10px]"
                            >
                              <Info className="w-2.5 h-2.5" />
                              <span>Дубль</span>
                            </span>
                          )}
                          {row.status === 'invalid' && (
                            <span
                              title={row.reasons.join('; ')}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-semibold text-[10px]"
                            >
                              <AlertTriangle className="w-2.5 h-2.5" />
                              <span>Ошибка</span>
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 px-2 font-mono font-bold text-[#1e3799]">
                          {it.lineNumber || '—'}
                        </td>
                        <td
                          className="py-1.5 px-2 truncate max-w-[150px]"
                          title={row.reasons.length > 0 ? row.reasons.join('; ') : it.lineName}
                        >
                          {it.lineName || '—'}
                        </td>
                        <td className="py-1.5 px-2 font-mono">
                          {[it.qualityLevel, it.pipelineCategory].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono">
                          {it.rkPercent}/{it.uzkPercent}/{it.pvkPercent}%
                        </td>
                        <td className="py-1.5 px-2 whitespace-nowrap">
                          {formatExecutiveDocStatusLabel(it.idStatus)}
                        </td>
                        <td className="py-1.5 px-2 font-mono">
                          {formatDateDDMMYY(it.testDate) || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="text-[11px] text-slate-500">
              {previewItems.length > 0 && (
                <span>
                  К записи: <b>{validation.newCount}</b> нов.
                  {willUpdateCount > 0 ? ` · ${willUpdateCount} обн.` : ''}
                </span>
              )}
            </div>
            <button
              type="button"
              disabled={actionableItems.length === 0 || isImporting}
              onClick={() => onConfirmImport(actionableItems, duplicateMode)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-semibold hover:bg-emerald-800 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isImporting
                  ? 'Импорт в базу…'
                  : `Импортировать в лайнлист · ${actionableItems.length} шт.`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
