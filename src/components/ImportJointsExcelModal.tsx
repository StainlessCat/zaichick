import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  FileSpreadsheet,
  Info,
  Link2,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import {
  LRVItem,
  ProjectLineItem,
  TechCardItem,
  WeldJoint,
} from '../types/welding';
import {
  exportJointsExcelTemplate,
  JointImportParseResult,
  parseAndValidateJointsImport,
  readExcelFileRows,
} from '../utils/jointImportUtils';

interface ImportJointsExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectLineList: ProjectLineItem[];
  lrvCatalog: LRVItem[];
  techCards: TechCardItem[];
  existingJoints: WeldJoint[];
  defaultObjectName: string;
  defaultRdCode: string;
  onImportJoints: (jointsToImport: WeldJoint[], sourceFileName: string) => void;
}

export const ImportJointsExcelModal: React.FC<ImportJointsExcelModalProps> = ({
  isOpen,
  onClose,
  projectLineList,
  lrvCatalog,
  techCards,
  existingJoints,
  defaultObjectName,
  defaultRdCode,
  onImportJoints,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [parseResult, setParseResult] = useState<JointImportParseResult | null>(
    null
  );
  const [filterTab, setFilterTab] = useState<'all' | 'errors' | 'valid'>('all');
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState<string>('');

  // Сброс состояния при закрытии
  const handleClose = () => {
    setSelectedFile(null);
    setParseResult(null);
    setFilterTab('all');
    setFileError('');
    onClose();
  };

  const processFile = async (file: File) => {
    try {
      setIsLoading(true);
      setFileError('');
      setSelectedFile(file);
      const rows = await readExcelFileRows(file);
      const result = parseAndValidateJointsImport(
        rows,
        projectLineList,
        lrvCatalog,
        techCards,
        existingJoints,
        defaultObjectName,
        defaultRdCode
      );
      setParseResult(result);
    } catch (err) {
      console.error('Ошибка чтения Excel файла:', err);
      setFileError(
        'Не удалось прочитать файл Excel. Убедитесь, что файл не поврежден и имеет формат .xlsx, .xls или .csv.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadDemoBatch = () => {
    setFileError('');
    const sampleLine = projectLineList[0];
    const rdCode = sampleLine?.rdCode || defaultRdCode || '0092.049.Р.13/1 0004 УКПГ.045.0077.001-ТХ3';
    const lineNum = sampleLine?.lineNumber || 'ФП1.2/1';
    const lrvItems = lrvCatalog.filter((c) => c.rdCode === rdCode);
    const lrv1 = lrvItems[0] || lrvCatalog[0];
    const lrv2 = lrvItems[1] || lrv1;
    const diam = lrv1?.diameterMm || 159;
    const wall = lrv1?.wallThickness || 8;

    const existingNums = existingJoints
      .filter((j) => j.rdCode === rdCode && j.lineNumber === lineNum)
      .map((j) => parseInt(j.jointNumber, 10))
      .filter((n) => !Number.isNaN(n));
    const maxNum = existingNums.length > 0 ? Math.max(...existingNums) : 100;
    const next1 = String(Math.ceil((maxNum + 10) / 10) * 10).padStart(3, '0');
    const next2 = String(Math.ceil((maxNum + 20) / 10) * 10).padStart(3, '0');

    const demoRows: Record<string, unknown>[] = [
      {
        'Шифр РД': rdCode,
        'Номер линии': lineNum,
        'Номер стыка': next1,
        'Диаметр и толщина стенки': `${diam}х${wall}`,
        'Код ЛРВ 1': lrv1?.lrvCode || 'ЛРВ-001ТХ3-0101',
        'Код ЛРВ 2': lrv2?.lrvCode || 'ЛРВ-001ТХ3-0102',
        'Тип соединения (ГОСТ)': 'С17',
      },
      {
        'Шифр РД': rdCode,
        'Номер линии': lineNum,
        'Номер стыка': next2,
        'Диаметр и толщина стенки': `${diam}х${wall}`,
        'Код ЛРВ 1': lrv1?.lrvCode || 'ЛРВ-001ТХ3-0101',
        'Код ЛРВ 2': lrv2?.lrvCode || 'ЛРВ-001ТХ3-0102',
        'Тип соединения (ГОСТ)': 'С17',
      },
    ];

    const result = parseAndValidateJointsImport(
      demoRows,
      projectLineList,
      lrvCatalog,
      techCards,
      existingJoints,
      defaultObjectName,
      defaultRdCode
    );
    setParseResult(result);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleConfirmImport = () => {
    if (!parseResult) return;
    const jointsToSave = parseResult.rows
      .filter((r) => r.status !== 'error' && r.jointToImport)
      .map((r) => r.jointToImport!);

    if (jointsToSave.length === 0) return;

    onImportJoints(jointsToSave, selectedFile?.name || 'Демо-пакет Excel');
    handleClose();
  };

  const filteredRows = useMemo(() => {
    if (!parseResult) return [];
    if (filterTab === 'errors') {
      return parseResult.rows.filter((r) => r.status === 'error');
    }
    if (filterTab === 'valid') {
      return parseResult.rows.filter((r) => r.status !== 'error');
    }
    return parseResult.rows;
  }, [parseResult, filterTab]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Импорт стыков из файла Excel"
    >
      <div
        className="fixed inset-0 bg-slate-900/45 backdrop-blur-[1px]"
        onClick={handleClose}
      />

      <div className="relative z-10 w-full max-w-6xl bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col max-h-[94vh] overflow-hidden">
        {/* Шапка модального окна #1e3799 */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-[#1e3799] text-white shrink-0">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-5 h-5 text-emerald-300 shrink-0" />
            <div>
              <h2 className="font-display text-base font-bold">
                Загрузка данных в реестр стыков из Excel
              </h2>
              <p className="text-xs text-sky-200">
                Автоматическая привязка к лайнлисту, каталогу ЛРВ и техкартам · Контроль дубликатов и несоответствий
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => exportJointsExcelTemplate(projectLineList, lrvCatalog)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/15 hover:bg-white/25 text-white transition-colors border border-white/20 cursor-pointer"
              title="Скачать готовый образец таблицы Excel для заполнения стыков"
            >
              <ArrowDownToLine className="w-4 h-4 text-sky-300" />
              <span>Скачать шаблон Excel</span>
            </button>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Закрыть окно импорта"
              className="p-1.5 rounded-lg text-sky-100 hover:text-white hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Тело модального окна */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {fileError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-300 text-red-800 text-xs font-semibold flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{fileError}</span>
              </div>
              <button
                type="button"
                onClick={() => setFileError('')}
                className="text-red-700 hover:text-red-950 font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {/* Область выбора/перетаскивания файла */}
          {!parseResult && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-[#1e3799] bg-sky-50'
                  : 'border-slate-300 hover:border-[#1e3799] hover:bg-slate-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="w-14 h-14 rounded-full bg-[#e8f1fc] text-[#1e3799] mx-auto flex items-center justify-center mb-3">
                <Upload className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 mb-1">
                Выберите файл Excel (.xlsx, .xls, .csv) или перетащите его сюда
              </h3>
              <p className="text-xs text-slate-500 max-w-lg mx-auto">
                Файл должен содержать столбцы: <b>Шифр РД</b>, <b>Номер линии</b>, <b>Номер стыка</b>, <b>Диаметр и толщина стенки</b>, <b>Коды ЛРВ</b> и <b>Тип соединения</b> (ГОСТ 16037).
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={isLoading}
                  className="px-4 py-2 rounded-lg bg-[#1e3799] text-white text-xs font-semibold shadow-xs hover:bg-[#15276e]"
                >
                  {isLoading ? 'Чтение файла...' : 'Выбрать файл на диске'}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleLoadDemoBatch();
                  }}
                  className="px-4 py-2 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-semibold hover:bg-emerald-100"
                >
                  Проверить на демо-пакете стыков (автопривязка)
                </button>
              </div>
            </div>
          )}

          {/* Панель загруженного файла и сводной статистики */}
          {parseResult && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
                    XLS
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      {selectedFile?.name || 'Загруженный файл'}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Всего обработано строк: {parseResult.totalRows}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setParseResult(null);
                      setSelectedFile(null);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-white bg-slate-100 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                    <span>Выбрать другой файл</span>
                  </button>
                </div>
              </div>

              {/* Плашки со статистикой проверки */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div
                  onClick={() => setFilterTab('valid')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    filterTab === 'valid'
                      ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-300'
                      : 'border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-800">
                      Готовы к загрузке
                    </span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">
                    {parseResult.validCount + parseResult.warningCount}
                  </div>
                  <div className="text-[11px] text-emerald-600 mt-0.5">
                    {parseResult.warningCount > 0
                      ? `Включая ${parseResult.warningCount} с предупреждениями`
                      : 'Все обязательные данные проверены'}
                  </div>
                </div>

                <div
                  onClick={() => setFilterTab('errors')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    filterTab === 'errors'
                      ? 'border-red-500 bg-red-50 ring-2 ring-red-300'
                      : 'border-red-200 bg-red-50/60 hover:bg-red-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-red-800">
                      Строки с ошибками
                    </span>
                    <AlertCircle className="w-4 h-4 text-red-600" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-red-700 mt-1">
                    {parseResult.errorCount}
                  </div>
                  <div className="text-[11px] text-red-600 mt-0.5">
                    {parseResult.errorCount > 0
                      ? 'Не будут импортированы'
                      : 'Критических ошибок нет'}
                  </div>
                </div>

                <div
                  onClick={() => setFilterTab('all')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    filterTab === 'all'
                      ? 'border-[#1e3799] bg-[#e8f1fc] ring-2 ring-sky-300'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800">
                      Все строки таблицы
                    </span>
                    <Info className="w-4 h-4 text-[#1e3799]" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-slate-800 mt-1">
                    {parseResult.totalRows}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Показать полный список
                  </div>
                </div>
              </div>

              {/* Блок критических ошибок (если обнаружены несоответствия или дубликаты) */}
              {parseResult.errorCount > 0 && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-red-800">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>
                      Выявлены несоответствия ({parseResult.errorCount} строк содержат ошибки и будут пропущены при импорте):
                    </span>
                  </div>
                  <ul className="text-xs text-red-700 space-y-1 pl-6 list-disc max-h-36 overflow-y-auto">
                    {parseResult.rows
                      .filter((r) => r.status === 'error')
                      .map((r) => (
                        <li key={r.rowNumber}>
                          <span className="font-semibold">
                            Строка {r.rowNumber} (стык № {r.jointNumber || '—'}, линия «{r.lineNumber || '—'}»):
                          </span>{' '}
                          {r.errors.join('; ')}
                        </li>
                      ))}
                  </ul>
                </div>
              )}

              {/* Превью таблицы импортируемых стыков */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <div className="p-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-800">
                    Предварительный просмотр данных ({filteredRows.length} из {parseResult.totalRows}):
                  </div>
                  <div className="flex items-center gap-1 text-[11px]">
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold mr-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" /> Готов
                    </span>
                    <span className="inline-flex items-center gap-1 text-amber-700 font-semibold mr-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500" /> Предупреждение
                    </span>
                    <span className="inline-flex items-center gap-1 text-red-700 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-red-500" /> Ошибка
                    </span>
                  </div>
                </div>

                <div className="max-h-[380px] overflow-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-[#1e3799]/10 text-slate-800 sticky top-0 z-10 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2 w-12 text-center">№</th>
                        <th className="p-2">Шифр РД</th>
                        <th className="p-2">Линия (Лайнлист)</th>
                        <th className="p-2 text-center">Стык</th>
                        <th className="p-2 text-center">Ø × S, мм</th>
                        <th className="p-2">Коды ЛРВ (1 / 2)</th>
                        <th className="p-2 text-center">ГОСТ 16037</th>
                        <th className="p-2">Автопривязка</th>
                        <th className="p-2">Статус проверки</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {filteredRows.map((row) => (
                        <tr
                          key={row.rowNumber}
                          className={
                            row.status === 'error'
                              ? 'bg-red-50/70 hover:bg-red-50 text-red-950'
                              : row.status === 'warning'
                              ? 'bg-amber-50/50 hover:bg-amber-50 text-amber-950'
                              : 'hover:bg-sky-50/50 text-slate-800'
                          }
                        >
                          <td className="p-2 text-center text-slate-500 font-medium">
                            {row.rowNumber}
                          </td>
                          <td className="p-2 font-semibold truncate max-w-[140px]" title={row.rdCode}>
                            {row.rdCode || '—'}
                          </td>
                          <td className="p-2">
                            <div className="font-bold text-[#1e3799]">
                              {row.lineNumber || '—'}
                            </div>
                            <div className="text-[10px] text-slate-500 font-sans truncate max-w-[150px]">
                              {row.objectName}
                            </div>
                          </td>
                          <td className="p-2 text-center">
                            <span className="px-2 py-0.5 rounded bg-slate-100 font-bold text-slate-900 border border-slate-300">
                              № {row.jointNumber || '—'}
                            </span>
                          </td>
                          <td className="p-2 text-center font-bold">
                            Ø{row.diameterMm} × {row.wallThickness}
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-1 font-semibold">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] ${
                                  row.matchedLrv1
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-slate-200 text-slate-700'
                                }`}
                              >
                                {row.lrv1Code || '—'}
                              </span>
                              <span>/</span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] ${
                                  row.matchedLrv2
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-slate-200 text-slate-700'
                                }`}
                              >
                                {row.lrv2Code || '—'}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 font-sans truncate max-w-[180px] mt-0.5">
                              {row.elem1Name} + {row.elem2Name}
                            </div>
                          </td>
                          <td className="p-2 text-center font-bold text-[#1e3799]">
                            {row.gostJointType || 'С17'}
                          </td>
                          <td className="p-2 text-[10px] font-sans">
                            <div className="flex items-center gap-1 text-slate-700">
                              <Link2 className="w-3 h-3 text-[#1e3799]" />
                              <span>{row.techCardNumber}</span>
                            </div>
                            <div className="text-slate-500 truncate max-w-[140px]">
                              {row.contour}
                            </div>
                          </td>
                          <td className="p-2 font-sans">
                            {row.status === 'valid' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold text-[10px]">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Готов к импорту
                              </span>
                            )}
                            {row.status === 'warning' && (
                              <div
                                title={row.warnings.join('; ')}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold text-[10px] truncate max-w-[180px]"
                              >
                                <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                                <span className="truncate">{row.warnings[0]}</span>
                              </div>
                            )}
                            {row.status === 'error' && (
                              <div
                                title={row.errors.join('; ')}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 text-red-800 font-semibold text-[10px] truncate max-w-[180px]"
                              >
                                <AlertCircle className="w-3 h-3 text-red-600 shrink-0" />
                                <span className="truncate">{row.errors[0]}</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Подвал модального окна */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-slate-50 border-t border-slate-200 shrink-0">
          <div className="text-xs text-slate-500">
            {parseResult ? (
              <span>
                К импорту будет добавлено{' '}
                <b className="text-emerald-700">
                  {parseResult.validCount + parseResult.warningCount}
                </b>{' '}
                стыков
                {parseResult.errorCount > 0 && (
                  <span className="text-red-600 ml-1">
                    ({parseResult.errorCount} пропущено из-за ошибок)
                  </span>
                )}
              </span>
            ) : (
              <span>Поддерживаются форматы .xlsx, .xls и .csv</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition-colors"
            >
              Отмена
            </button>
            {parseResult && (
              <button
                type="button"
                disabled={parseResult.validCount + parseResult.warningCount === 0}
                onClick={handleConfirmImport}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#1e3799] text-white hover:bg-[#15276e] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold shadow-xs transition-colors"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                <span>
                  Импортировать{' '}
                  {parseResult.validCount + parseResult.warningCount > 0
                    ? `(${parseResult.validCount + parseResult.warningCount} шт.)`
                    : ''}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
