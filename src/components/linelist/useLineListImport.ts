import React, { useCallback, useRef, useState } from 'react';
import { ProjectLineItem } from '../../types/welding';
import { parseProjectLineListRecords } from '../../utils/weldingLogic';
import { readProjectLineListFromExcelFile } from '../../utils/excelUtils';
import type {
  LineBatchImportSummary,
  LineImportDuplicateMode,
} from '../../utils/linelistImportValidation';
import { DEMO_EXCEL_TSV } from './types';

const DEFAULT_PASTE_HEADERS = [
  'Название объекта',
  'Шифр РД',
  'Номер линии',
  'Наименование линии',
  'Продукт',
  'Контур испытания',
  'НТД на сварку',
  'НТД на контроль',
  'Уровень качества',
  'Категория трубопровода',
  'Рабочее давление',
  'Температура',
  'Процент контроля РК',
  'Процент контроля УЗК',
  'Процент контроля ПВК',
  'Статус',
  'Дата испытания',
  'Статус ИД',
  'Ответственный ПТО',
];

export interface UseLineListImportParams {
  defaultObj: string;
  defaultRd: string;
  onAddLineItems: (
    items: ProjectLineItem[],
    duplicateMode?: LineImportDuplicateMode
  ) => Promise<LineBatchImportSummary | void> | void;
}

export function useLineListImport({
  defaultObj,
  defaultRd,
  onAddLineItems,
}: UseLineListImportParams) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [previewItems, setPreviewItems] = useState<ProjectLineItem[]>([]);
  const [pasteText, setPasteText] = useState<string>(DEMO_EXCEL_TSV);
  const [importError, setImportError] = useState<string>('');
  const [importDuplicateMode, setImportDuplicateMode] =
    useState<LineImportDuplicateMode>('skip');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<LineBatchImportSummary | null>(
    null
  );

  const toggleImportPanel = useCallback(() => {
    setImportResult(null);
    setShowImportPanel((prev) => !prev);
  }, []);

  const closeImportPanel = useCallback(() => {
    setShowImportPanel(false);
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setImportError('');
      setImportResult(null);
      setUploadedFileName(file.name);
      try {
        const parsed = await readProjectLineListFromExcelFile(
          file,
          defaultObj,
          defaultRd
        );
        if (parsed.length === 0) {
          setImportError(
            'В выбранном файле не найдено строк с данными линий. Проверьте заголовки столбцов.'
          );
        }
        setPreviewItems(parsed);
      } catch {
        setImportError(
          'Ошибка чтения файла Excel. Убедитесь, что файл имеет формат .xlsx, .xls или .csv.'
        );
      }
      e.target.value = '';
    },
    [defaultObj, defaultRd]
  );

  const handleParsePasteText = useCallback(() => {
    setImportError('');
    setImportResult(null);
    const lines = pasteText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      setPreviewItems([]);
      return;
    }

    const splitRow = (line: string) =>
      line.includes('\t')
        ? line.split('\t').map((c) => c.trim())
        : line.split(';').map((c) => c.trim());

    const firstRowCols = splitRow(lines[0]);
    const hasHeader =
      firstRowCols.some((c) => c.toLowerCase().includes('линии')) ||
      firstRowCols.some((c) => c.toLowerCase().includes('шифр'));

    const headers = hasHeader ? firstRowCols : DEFAULT_PASTE_HEADERS;
    const dataLines = hasHeader ? lines.slice(1) : lines;
    const records: Record<string, unknown>[] = dataLines.map((line) => {
      const cols = splitRow(line);
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        obj[h] = cols[i] ?? '';
      });
      return obj;
    });

    const parsed = parseProjectLineListRecords(records, defaultObj, defaultRd);
    setUploadedFileName('Данные из буфера обмена Excel');
    setPreviewItems(parsed);
  }, [pasteText, defaultObj, defaultRd]);

  const handleConfirmImport = useCallback(
    async (actionableItems: ProjectLineItem[], mode: LineImportDuplicateMode) => {
      if (actionableItems.length === 0 || isImporting) return;
      setIsImporting(true);
      setImportResult(null);
      try {
        const outcome = await onAddLineItems(actionableItems, mode);
        if (outcome && typeof outcome === 'object') {
          setImportResult(outcome);
          if (outcome.ok) {
            setPreviewItems([]);
            setUploadedFileName('');
          }
        } else {
          setPreviewItems([]);
          setUploadedFileName('');
          setShowImportPanel(false);
        }
      } finally {
        setIsImporting(false);
      }
    },
    [isImporting, onAddLineItems]
  );

  return {
    fileInputRef,
    showImportPanel,
    toggleImportPanel,
    closeImportPanel,
    uploadedFileName,
    previewItems,
    pasteText,
    setPasteText,
    importError,
    importDuplicateMode,
    setImportDuplicateMode,
    isImporting,
    importResult,
    handleFileChange,
    handleParsePasteText,
    handleConfirmImport,
  };
}
