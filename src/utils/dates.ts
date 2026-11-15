/**
 * Утилиты форматирования, нормализации и валидации дат и числовых полей.
 * Основные функции форматирования вынесены в ./formatting.ts
 */

export {
  formatDateDDMMYY,
  formatTimestampDDMMYY,
  formatDateRuLong,
  normalizeDateToISO,
  normalizeDecimalInput,
  parseDecimalNumber,
} from './formatting';

import { normalizeDateToISO } from './formatting';

/**
 * Проверяет, является ли ключ поля датой сварки или контроля
 */
export function isDateColumnKey(key: string): boolean {
  return (
    key === 'weldingDate' ||
    key === 'vikDate' ||
    key === 'ndtDate' ||
    key === 'dupNdtDate' ||
    key === 'repairDate' ||
    key === 'repairVikDate' ||
    key === 'repairNdtDate' ||
    key === 'repairDupNdtDate'
  );
}

/**
 * Проверяет, попадает ли дата сварки стыка в заданный диапазон [dateFrom, dateTo] (включительно)
 */
export function isWeldingDateInRange(
  weldingDate?: string | null,
  dateFrom?: string | null,
  dateTo?: string | null
): boolean {
  const fromIso = normalizeDateToISO(dateFrom);
  const toIso = normalizeDateToISO(dateTo);
  if (!fromIso && !toIso) return true;

  const targetIso = normalizeDateToISO(weldingDate);
  if (!targetIso) return false;

  if (fromIso && targetIso < fromIso) return false;
  if (toIso && targetIso > toIso) return false;
  return true;
}
