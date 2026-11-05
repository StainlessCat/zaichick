/**
 * Утилиты форматирования, нормализации и валидации дат и числовых полей
 */

/**
 * Приводит любую дату (YYYY-MM-DD, ISO, DD.MM.YYYY, DD.MM.YY, серийную дату Excel) к строгому формату "ДД.ММ.ГГ".
 * Пример: "2026-10-12" -> "12.10.26"
 */
export function formatDateDDMMYY(dateStr?: string | number | null): string {
  if (dateStr === null || dateStr === undefined || dateStr === '') return '';
  const trimmed = String(dateStr).trim();
  if (!trimmed || trimmed === '—') return '';

  // Серийный номер даты Excel (напр. 46315)
  if (/^\d{5}(?:\.\d+)?$/.test(trimmed)) {
    const serial = parseFloat(trimmed);
    if (serial >= 25569 && serial <= 73050) {
      const utcDays = Math.floor(serial - 25569);
      const dateInfo = new Date(utcDays * 86400 * 1000);
      if (!Number.isNaN(dateInfo.getTime())) {
        const dd = String(dateInfo.getUTCDate()).padStart(2, '0');
        const mm = String(dateInfo.getUTCMonth() + 1).padStart(2, '0');
        const yy = String(dateInfo.getUTCFullYear()).slice(-2);
        return `${dd}.${mm}.${yy}`;
      }
    }
  }

  // Уже в формате ДД.ММ.ГГ
  if (/^\d{2}\.\d{2}\.\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // Д.М.ГГ или ДД.ММ.ГГГГ -> ДД.ММ.ГГ
  const ddmmyyyy = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (ddmmyyyy) {
    const dd = ddmmyyyy[1].padStart(2, '0');
    const mm = ddmmyyyy[2].padStart(2, '0');
    const yy = ddmmyyyy[3].slice(-2);
    return `${dd}.${mm}.${yy}`;
  }

  // YYYY-MM-DD (или начало ISO строки)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, yyyy, mm, dd] = isoMatch;
    return `${dd.padStart(2, '0')}.${mm.padStart(2, '0')}.${yyyy.slice(-2)}`;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const dd = String(parsed.getUTCDate()).padStart(2, '0');
    const mm = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const yy = String(parsed.getUTCFullYear()).slice(-2);
    return `${dd}.${mm}.${yy}`;
  }

  return trimmed;
}

/**
 * Форматирует дату-время для журнала аудита в формат "ДД.ММ.ГГ ЧЧ:ММ"
 */
export function formatTimestampDDMMYY(isoStr?: string | null): string {
  if (!isoStr) return '';
  const datePart = formatDateDDMMYY(isoStr);
  const timeMatch = String(isoStr).match(/T(\d{2}:\d{2})/);
  if (timeMatch) {
    return `${datePart} ${timeMatch[1]}`;
  }
  return datePart;
}

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
 * Приводит дату (YYYY-MM-DD, DD.MM.YY, DD.MM.YYYY, серийную дату Excel) к ISO формату YYYY-MM-DD для сравнения диапазонов
 */
export function normalizeDateToISO(dateStr?: string | number | null): string {
  if (dateStr === null || dateStr === undefined || dateStr === '') return '';
  const trimmed = String(dateStr).trim();
  if (!trimmed || trimmed === '—') return '';

  // Серийный номер даты Excel
  if (/^\d{5}(?:\.\d+)?$/.test(trimmed)) {
    const serial = parseFloat(trimmed);
    if (serial >= 25569 && serial <= 73050) {
      const utcDays = Math.floor(serial - 25569);
      const dateInfo = new Date(utcDays * 86400 * 1000);
      if (!Number.isNaN(dateInfo.getTime())) {
        const yyyy = dateInfo.getUTCFullYear();
        const mm = String(dateInfo.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(dateInfo.getUTCDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }
    }
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }

  const ddmmyy = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
  if (ddmmyy) {
    return `20${ddmmyy[3]}-${ddmmyy[2].padStart(2, '0')}-${ddmmyy[1].padStart(2, '0')}`;
  }

  const ddmmyyyy = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (ddmmyyyy) {
    return `${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2, '0')}-${ddmmyyyy[1].padStart(2, '0')}`;
  }

  return trimmed;
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

/**
 * Унификация ввода десятичных чисел: замена запятых на точки, удаление лишних пробелов.
 * Позволяет корректно вводить дробные значения (длины, диаметры, толщины, температуру) с русской клавиатуры/numpad.
 */
export function normalizeDecimalInput(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).replace(',', '.').trim();
}

/**
 * Парсит десятичное число с поддержкой запятых, возвращает number или undefined при ошибке
 */
export function parseDecimalNumber(val: unknown): number | undefined {
  if (val === null || val === undefined || val === '') return undefined;
  const normalized = String(val).replace(',', '.').trim();
  const num = parseFloat(normalized);
  return Number.isNaN(num) ? undefined : num;
}
