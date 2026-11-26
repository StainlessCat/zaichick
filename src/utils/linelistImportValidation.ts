import { ProjectLineItem } from '../types/welding';
import { buildUniqueLineId } from './linelistUtils';

export type LineImportDuplicateMode = 'skip' | 'update';

export type LineImportRowStatus =
  | 'new'
  | 'duplicate_db'
  | 'duplicate_file'
  | 'invalid';

export interface LineImportValidationRow {
  item: ProjectLineItem;
  normalizedUniqueId: string;
  status: LineImportRowStatus;
  reasons: string[];
  existingLine?: ProjectLineItem;
  isExistingLocked?: boolean;
}

export interface LineImportValidationSummary {
  rows: LineImportValidationRow[];
  totalCount: number;
  newCount: number;
  duplicateDbCount: number;
  duplicateLockedCount: number;
  duplicateFileCount: number;
  invalidCount: number;
}

export interface LineBatchImportSummary {
  ok: boolean;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errors: string[];
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Валидирует строки импорта лайнлиста и классифицирует их относительно текущей БД
 * и дубликатов внутри самого загружаемого файла.
 */
export function validateLineListImportPreview(
  previewItems: ProjectLineItem[],
  existingLineList: ProjectLineItem[]
): LineImportValidationSummary {
  const existingByUid = new Map<string, ProjectLineItem>();
  for (const line of existingLineList) {
    const uid = (
      line.uniqueLineId?.trim() || buildUniqueLineId(line.rdCode, line.lineNumber)
    ).toLowerCase();
    if (uid) existingByUid.set(uid, line);
  }

  const seenInFile = new Set<string>();
  const rows: LineImportValidationRow[] = [];

  let newCount = 0;
  let duplicateDbCount = 0;
  let duplicateLockedCount = 0;
  let duplicateFileCount = 0;
  let invalidCount = 0;

  for (const item of previewItems) {
    const reasons: string[] = [];
    const cleanObj = (item.objectName || '').trim();
    const cleanRd = (item.rdCode || '').trim();
    const cleanNum = (item.lineNumber || '').trim();
    const normalizedUniqueId =
      (item.uniqueLineId || '').trim() || buildUniqueLineId(cleanRd, cleanNum);
    const uidKey = normalizedUniqueId.toLowerCase();

    if (!cleanObj) reasons.push('Не указан объект строительства');
    if (!cleanRd) reasons.push('Не указан шифр РД');
    if (!cleanNum) reasons.push('Не указан номер линии');
    if (item.testDate && item.testDate.trim() && !ISO_DATE_RE.test(item.testDate.trim())) {
      reasons.push(`Некорректная дата испытания: «${item.testDate}»`);
    }
    if (
      item.rkPercent < 0 ||
      item.rkPercent > 100 ||
      item.uzkPercent < 0 ||
      item.uzkPercent > 100 ||
      item.pvkPercent < 0 ||
      item.pvkPercent > 100
    ) {
      reasons.push('Процент НК должен быть в диапазоне 0–100');
    }

    if (reasons.length > 0) {
      invalidCount += 1;
      rows.push({
        item,
        normalizedUniqueId,
        status: 'invalid',
        reasons,
      });
      continue;
    }

    if (seenInFile.has(uidKey)) {
      duplicateFileCount += 1;
      rows.push({
        item,
        normalizedUniqueId,
        status: 'duplicate_file',
        reasons: [`Дубликат линии «${normalizedUniqueId}» внутри загружаемого файла`],
      });
      continue;
    }
    seenInFile.add(uidKey);

    const existingLine = existingByUid.get(uidKey);
    if (existingLine) {
      duplicateDbCount += 1;
      const isLocked = existingLine.recordStatus === 'LOCKED';
      if (isLocked) duplicateLockedCount += 1;
      rows.push({
        item,
        normalizedUniqueId,
        status: 'duplicate_db',
        reasons: [
          isLocked
            ? 'Линия уже есть в базе и заблокирована — обновление невозможно'
            : 'Линия уже существует в лайнлисте',
        ],
        existingLine,
        isExistingLocked: isLocked,
      });
      continue;
    }

    newCount += 1;
    rows.push({
      item,
      normalizedUniqueId,
      status: 'new',
      reasons: [],
    });
  }

  return {
    rows,
    totalCount: previewItems.length,
    newCount,
    duplicateDbCount,
    duplicateLockedCount,
    duplicateFileCount,
    invalidCount,
  };
}

/**
 * Возвращает список валидных строк для отправки в пакетный импорт с учётом выбранного режима.
 */
export function selectActionableImportItems(
  summary: LineImportValidationSummary,
  duplicateMode: LineImportDuplicateMode
): ProjectLineItem[] {
  const result: ProjectLineItem[] = [];
  for (const row of summary.rows) {
    if (row.status === 'new') {
      result.push(row.item);
    } else if (
      row.status === 'duplicate_db' &&
      duplicateMode === 'update' &&
      !row.isExistingLocked
    ) {
      result.push(row.item);
    }
  }
  return result;
}
