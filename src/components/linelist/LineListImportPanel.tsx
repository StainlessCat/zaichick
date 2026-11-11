import React from 'react';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Sparkles,
  Upload,
} from 'lucide-react';
import { ProjectLineItem, WeldJoint } from '../../types/welding';
import { formatDateDDMMYY } from '../../utils/weldingLogic';
import { exportProjectLineListToExcel } from '../../utils/excelUtils';

interface LineListImportPanelProps {
  joints: WeldJoint[];
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  uploadedFileName: string;
  importError: string;
  pasteText: string;
  previewItems: ProjectLineItem[];
  onChangePasteText: (value: string) => void;
  onParsePasteText: () => void;
  onConfirmImport: () => void;
  onClose: () => void;
}

export const LineListImportPanel: React.FC<LineListImportPanelProps> = ({
  joints,
  fileInputRef,
  uploadedFileName,
  importError,
  pasteText,
  previewItems,
  onChangePasteText,
  onParsePasteText,
  onConfirmImport,
  onClose,
}) => {
  return (
    <div className="bg-white rounded-xl border-2 border-[#1e3799]/30 p-5 shadow-md space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <h3 className="font-display text-sm font-bold text-[#1e3799] flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            <span>
              Загрузка данных лайнлиста из файла Excel (.xlsx, .xls, .csv) или буфера обмена
            </span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Поддерживается прямая загрузка файла Excel с 17 столбцами: Название объекта, Шифр РД, Номер линии, Наименование линии, Продукт, Контур испытания, НТД на сварку, НТД на контроль, Уровень качества, Категория трубопровода, Рабочее давление, Температура, % РК, % УЗК, % ПВК, Статус, Дата испытания.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void exportProjectLineListToExcel([], joints, true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5 text-[#1e3799]" />
            <span>Скачать шаблон Excel (.xlsx)</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1"
          >
            Закрыть
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="p-4 rounded-xl border-2 border-dashed border-[#1e3799]/35 bg-[#f4f8fe] flex flex-col items-center justify-center text-center gap-2">
            <FileSpreadsheet className="w-8 h-8 text-[#1e3799]" />
            <div className="text-xs font-semibold text-slate-800">
              Выберите файл Excel (.xlsx, .xls, .csv) с проектной ведомостью линий
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1e3799] text-white text-xs font-semibold hover:bg-[#15276e]"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Выбрать файл Excel с диска</span>
              </button>
            </div>
            {uploadedFileName && (
              <div className="text-xs font-semibold text-emerald-700 mt-1">
                Источник: {uploadedFileName} (распознано линий: {previewItems.length})
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
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#1e3799] hover:underline"
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

        <div className="space-y-2 flex flex-col">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">
              Предпросмотр импортируемых линий ({previewItems.length} поз.)
            </span>
            {previewItems.length === 0 && (
              <button
                type="button"
                onClick={onParsePasteText}
                className="text-xs font-semibold text-[#1e3799] hover:underline"
              >
                Загрузить демо-пример для проверки
              </button>
            )}
          </div>

          <div className="flex-1 max-h-56 overflow-y-auto overflow-x-auto border border-slate-200 rounded-lg bg-slate-50 table-scroll-container">
            {previewItems.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                Выберите файл .xlsx / .csv слева или нажмите «Распознать строки из поля» для предпросмотра.
              </div>
            ) : (
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="bg-[#1e3799] text-white">
                    <th className="py-1.5 px-2 text-left">Линия</th>
                    <th className="py-1.5 px-2 text-left">Наименование</th>
                    <th className="py-1.5 px-2 text-left">Ур. кач. / Кат.</th>
                    <th className="py-1.5 px-2 text-right">РК/УЗК/ПВК</th>
                    <th className="py-1.5 px-2 text-left">Испытание</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {previewItems.map((it) => (
                    <tr key={it.id}>
                      <td className="py-1.5 px-2 font-mono font-bold text-[#1e3799]">
                        {it.lineNumber}
                      </td>
                      <td className="py-1.5 px-2 truncate max-w-[150px]">
                        {it.lineName}
                      </td>
                      <td className="py-1.5 px-2 font-mono">
                        {it.qualityLevel} · {it.pipelineCategory}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono">
                        {it.rkPercent}/{it.uzkPercent}/{it.pvkPercent}%
                      </td>
                      <td className="py-1.5 px-2 font-mono">
                        {formatDateDDMMYY(it.testDate) || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              disabled={previewItems.length === 0}
              onClick={onConfirmImport}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-semibold hover:bg-emerald-800 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Импортировать в Проект (лайнлист) ({previewItems.length} шт.)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
