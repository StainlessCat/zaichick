/**
 * ZAYCHICK 2.0 — Модуль форматирования данных (даты, время, геометрия труб, длины, персоналии).
 * Обеспечивает единообразное отображение в интерфейсе, отчётах и реестрах.
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
 * Форматирует дату в текстовый формат на русском языке: "12 октября 2026 г."
 */
export function formatDateRuLong(dateStr?: string | null): string {
  if (!dateStr) return '';
  const iso = normalizeDateToISO(dateStr);
  if (!iso) return String(dateStr);
  const [yyyy, mm, dd] = iso.split('-');
  const months = [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря',
  ];
  const mIndex = parseInt(mm, 10) - 1;
  const monthName = months[mIndex] || mm;
  return `${parseInt(dd, 10)} ${monthName} ${yyyy} г.`;
}

/**
 * Приводит дату к ISO-формату YYYY-MM-DD для сортировки и сравнения диапазонов
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
 * Унификация ввода десятичных чисел: замена запятых на точки, удаление лишних пробелов.
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

/**
 * Форматирует число с разделителями тысяч и русской запятой (напр. "1 271" или "14 250,5")
 */
export function formatNumberRu(num: number | string | null | undefined, decimals?: number): string {
  if (num === null || num === undefined || num === '') return '';
  const parsed = typeof num === 'number' ? num : parseDecimalNumber(num);
  if (parsed === undefined || Number.isNaN(parsed)) return String(num);

  const options: Intl.NumberFormatOptions = {
    useGrouping: true,
  };
  if (decimals !== undefined) {
    options.minimumFractionDigits = decimals;
    options.maximumFractionDigits = decimals;
  }
  return parsed.toLocaleString('ru-RU', options);
}

/**
 * Форматирует длину трубы/элемента:
 * - Если передано число > 50 -> считается в миллиметрах ("11 800 мм") или переводится в метры ("11.8 м")
 * - Поддерживает единицы измерения 'm' и 'mm'
 */
export function formatLength(
  val: unknown,
  options: { unit?: 'm' | 'mm' | 'auto'; precision?: number } = {}
): string {
  const num = parseDecimalNumber(val);
  if (num === undefined) return val ? String(val) : '';

  const unit = options.unit || 'auto';
  const precision = options.precision ?? 2;

  if (unit === 'mm') {
    return `${Math.round(num)} мм`;
  }
  if (unit === 'm') {
    return `${Number(num.toFixed(precision))} м`;
  }

  // Режим 'auto': если значение больше 50, считаем миллиметрами и показываем метры
  if (num >= 50) {
    const inMeters = num / 1000;
    return `${Number(inMeters.toFixed(precision))} м`;
  }
  return `${Number(num.toFixed(precision))} м`;
}

/**
 * Форматирует условный проход DN:
 * - formatDN(50, '2"') -> 'DN 50 (2")'
 * - formatDN(50) -> 'DN 50'
 */
export function formatDN(dnMm?: number | string | null, dnInch?: string | null): string {
  if (!dnMm) return '';
  const mm = typeof dnMm === 'number' ? dnMm : parseInt(String(dnMm), 10);
  if (Number.isNaN(mm)) return String(dnMm);

  if (dnInch && dnInch.trim()) {
    return `DN ${mm} (${dnInch.trim()})`;
  }
  return `DN ${mm}`;
}

/**
 * Форматирует типоразмер трубы/стыка: Ø 219 × 8.0 мм
 */
export function formatDiameterWall(
  diameter?: number | string | null,
  wall?: number | string | null
): string {
  if (!diameter) return '';
  const d = normalizeDecimalInput(diameter);
  const w = wall ? normalizeDecimalInput(wall) : null;
  if (!d) return '';

  if (w) {
    return `Ø ${d} × ${w} мм`;
  }
  return `Ø ${d} мм`;
}

/**
 * Форматирует температуру окружающего воздуха: "-15 °C" или "+22 °C"
 */
export function formatTemperature(temp?: number | string | null): string {
  if (temp === null || temp === undefined || temp === '' || temp === '—') return '—';
  const num = typeof temp === 'number' ? temp : parseDecimalNumber(temp);
  if (num === undefined) return String(temp);
  const sign = num > 0 ? '+' : '';
  return `${sign}${Math.round(num)} °C`;
}

/**
 * Форматирует ФИО инспектора или специалиста в сокращенную форму «Фамилия И.О.».
 * Пример: "Иванов Иван Иванович" -> "Иванов И.И."
 */
export function formatInspectorShortName(fullName?: string | null): string {
  if (!fullName) return '';
  const trimmed = fullName.trim();
  if (!trimmed || trimmed === '—') return '';

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];

  const surname = parts[0];
  const initials = parts
    .slice(1)
    .map((p) => `${p[0].toUpperCase()}.`)
    .join('');

  return `${surname} ${initials}`;
}

/**
 * Форматирует отображение сварщика: «С01 (Иванов И.И.)»
 */
export function formatWelderDisplay(stamp?: string | null, fullName?: string | null): string {
  const s = stamp?.trim() || '';
  const n = formatInspectorShortName(fullName);
  if (s && n) return `${s} (${n})`;
  if (s) return s;
  return n;
}
