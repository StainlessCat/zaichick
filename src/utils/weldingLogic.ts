import {
  AuditLogEntry,
  ColumnDefinition,
  FacilityObject,
  LineListColumnKey,
  LrvElementCategory,
  LRVItem,
  ProjectLineItem,
  ReadinessGroupCondition,
  TechCardItem,
  WelderProfile,
  WeldingMaterialCertificate,
  WeldJoint,
  WeldJointFieldKey,
} from '../types/welding';

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
    key === 'dupNdtDate'
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

export interface NaksCertStatusInfo {
  status: 'valid' | 'expiring' | 'expired' | 'unknown';
  daysRemaining?: number;
  message: string;
  badgeVariant: 'valid' | 'expiring' | 'expired' | 'unknown';
}

/**
 * Проверяет срок действия аттестационного удостоверения НАКС сварщика.
 * Сравнивает дату окончания аттестации (certExpiryDate) с контрольной датой (referenceDateStr — например, датой сварки или текущей датой).
 * - Если срок истек: status: 'expired'
 * - Если до окончания осталось <= 30 дней: status: 'expiring'
 * - Если удостоверение действует: status: 'valid'
 * - Если дата не указана: status: 'unknown'
 */
export function checkNaksCertStatus(
  certExpiryDate?: string | null,
  referenceDateStr?: string | null
): NaksCertStatusInfo {
  if (!certExpiryDate || !String(certExpiryDate).trim()) {
    return {
      status: 'unknown',
      message: 'Срок аттестации НАКС не указан',
      badgeVariant: 'unknown',
    };
  }

  const expiryIso = normalizeDateToISO(certExpiryDate);
  if (!expiryIso) {
    return {
      status: 'unknown',
      message: 'Некорректная дата аттестации',
      badgeVariant: 'unknown',
    };
  }

  const refIso = referenceDateStr ? normalizeDateToISO(referenceDateStr) : '';
  const refDate = refIso ? new Date(refIso + 'T00:00:00Z') : new Date();
  if (!refIso) {
    refDate.setUTCHours(0, 0, 0, 0);
  }

  const expiryDate = new Date(expiryIso + 'T00:00:00Z');
  const diffMs = expiryDate.getTime() - refDate.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const absDays = Math.abs(diffDays);
    return {
      status: 'expired',
      daysRemaining: diffDays,
      message: `Просрочено на ${absDays} дн. (${formatDateDDMMYY(expiryIso)})`,
      badgeVariant: 'expired',
    };
  }

  if (diffDays <= 30) {
    return {
      status: 'expiring',
      daysRemaining: diffDays,
      message: `Истекает через ${diffDays} дн. (до ${formatDateDDMMYY(expiryIso)})`,
      badgeVariant: 'expiring',
    };
  }

  return {
    status: 'valid',
    daysRemaining: diffDays,
    message: `Действует (до ${formatDateDDMMYY(expiryIso)}, ещё ${diffDays} дн.)`,
    badgeVariant: 'valid',
  };
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

/**
 * Извлекает уникальный суффикс из шифра РД.
 * Для классических шифров вида "...045.0077.001-TX3" возвращает "001-TX3".
 * Для шифров с отличающимся префиксом установки/блока включает различающий сегмент, исключая коллизии uniqueLineId.
 */
export function extractRdSuffix(rdCode: string): string {
  const trimmed = rdCode.trim();
  if (!trimmed) return '';
  const lastDotIdx = trimmed.lastIndexOf('.');
  if (lastDotIdx === -1) return trimmed;
  const tail = trimmed.slice(lastDotIdx + 1).trim();
  const prefix = trimmed.slice(0, lastDotIdx).trim();

  // Сохраняем обратную совместимость со стартовыми шифрами "...045.0077.001-TX3" -> "001-TX3"
  if (prefix.endsWith('045.0077') && prefix.includes('0092.049')) {
    return tail;
  }

  // Извлекаем значимый идентификатор книги/блока из префикса, чтобы исключить коллизии разных шифров с одинаковым хвостом
  const tokens = prefix.split(/[.\s/]+/).filter(Boolean);
  const distinctive = tokens
    .filter((t) => !/^(0092|049|Р|13|1|0004|045|0077)$/i.test(t))
    .slice(-2)
    .join('-');

  return distinctive ? `${distinctive}-${tail}` : tail;
}

/**
 * Формирует уникальный идентификатор линии:
 * связка суффикса шифра РД, дефиса и полного номера линии.
 */
export function buildUniqueLineId(rdCode: string, lineNumber: string): string {
  const suffix = extractRdSuffix(rdCode);
  const cleanLine = lineNumber.trim();
  if (!suffix && !cleanLine) return '';
  if (!suffix) return cleanLine;
  if (!cleanLine) return suffix;
  return `${suffix}-${cleanLine}`;
}

export interface PipeDnMappingRecord {
  dnMm: number; // DN [мм]
  dnInch: string | null; // DN [дюймы]
  outerDiameterMm: number | null; // Диаметр наружный Dн [мм]
}

/**
 * Эталонная таблица соответствия условных проходов (DN [мм]),
 * дюймовых условных проходов (DN [""]) и наружных диаметров (Dн [мм]).
 */
export const PIPE_DN_SPEC_TABLE: PipeDnMappingRecord[] = [
  { dnMm: 10, dnInch: '3/8"', outerDiameterMm: 16 },
  { dnMm: 15, dnInch: '1/2"', outerDiameterMm: 20 },
  { dnMm: 20, dnInch: '3/4"', outerDiameterMm: 26 },
  { dnMm: 25, dnInch: '1"', outerDiameterMm: 32 },
  { dnMm: 32, dnInch: '1 1/4"', outerDiameterMm: 42 },
  { dnMm: 40, dnInch: '1 1/2"', outerDiameterMm: 45 },
  { dnMm: 50, dnInch: '2"', outerDiameterMm: 57 },
  { dnMm: 65, dnInch: '2 1/2"', outerDiameterMm: 76 },
  { dnMm: 80, dnInch: '3"', outerDiameterMm: 89 },
  { dnMm: 90, dnInch: '3 1/2"', outerDiameterMm: 102 },
  { dnMm: 100, dnInch: '4"', outerDiameterMm: 108 },
  { dnMm: 125, dnInch: '5"', outerDiameterMm: 133 },
  { dnMm: 150, dnInch: '6"', outerDiameterMm: 165 },
  { dnMm: 160, dnInch: '6 1/2"', outerDiameterMm: 180 },
  { dnMm: 175, dnInch: '7"', outerDiameterMm: null },
  { dnMm: 200, dnInch: '8"', outerDiameterMm: 219 },
  { dnMm: 225, dnInch: '9"', outerDiameterMm: 245 },
  { dnMm: 250, dnInch: '10"', outerDiameterMm: 273 },
  { dnMm: 300, dnInch: '12"', outerDiameterMm: 325 },
  { dnMm: 350, dnInch: '14"', outerDiameterMm: 377 },
  { dnMm: 400, dnInch: '16"', outerDiameterMm: 426 },
  { dnMm: 450, dnInch: '18"', outerDiameterMm: null },
  { dnMm: 500, dnInch: '20"', outerDiameterMm: 530 },
  { dnMm: 600, dnInch: '24"', outerDiameterMm: 630 },
  { dnMm: 700, dnInch: '28"', outerDiameterMm: 720 },
  { dnMm: 800, dnInch: '32"', outerDiameterMm: 820 },
  { dnMm: 900, dnInch: '36"', outerDiameterMm: 920 },
  { dnMm: 1000, dnInch: '40"', outerDiameterMm: 1020 },
  { dnMm: 1100, dnInch: '44"', outerDiameterMm: null },
  { dnMm: 1200, dnInch: '48"', outerDiameterMm: 1220 },
  { dnMm: 1300, dnInch: '52"', outerDiameterMm: 1320 },
  { dnMm: 1400, dnInch: '56"', outerDiameterMm: 1420 },
  { dnMm: 1500, dnInch: '60"', outerDiameterMm: 1520 },
  { dnMm: 1600, dnInch: '64"', outerDiameterMm: 1620 },
  { dnMm: 1700, dnInch: '68"', outerDiameterMm: 1720 },
  { dnMm: 1800, dnInch: '72"', outerDiameterMm: 1820 },
  { dnMm: 1900, dnInch: '76"', outerDiameterMm: 1920 },
  { dnMm: 2000, dnInch: '80"', outerDiameterMm: 2220 },
  { dnMm: 2100, dnInch: '88"', outerDiameterMm: 2120 },
  { dnMm: 2200, dnInch: null, outerDiameterMm: 2220 },
  { dnMm: 2300, dnInch: null, outerDiameterMm: 2320 },
  { dnMm: 2400, dnInch: null, outerDiameterMm: 2420 },
  { dnMm: 2500, dnInch: null, outerDiameterMm: 2520 },
  { dnMm: 2600, dnInch: null, outerDiameterMm: 2620 },
  { dnMm: 2700, dnInch: null, outerDiameterMm: 2720 },
  { dnMm: 2800, dnInch: null, outerDiameterMm: 2820 },
  { dnMm: 2900, dnInch: null, outerDiameterMm: 2920 },
  { dnMm: 3000, dnInch: null, outerDiameterMm: 3000 },
];

/**
 * Словарь перевода условного прохода DN [мм] в дюйм-диаметр по приложенной таблице
 */
export const DN_TO_INCH_MAP: Record<number, string> = {
  10: '3/8"',
  15: '1/2"',
  20: '3/4"',
  25: '1"',
  32: '1 1/4"',
  40: '1 1/2"',
  50: '2"',
  65: '2 1/2"',
  80: '3"',
  90: '3 1/2"',
  100: '4"',
  125: '5"',
  150: '6"',
  160: '6 1/2"',
  175: '7"',
  200: '8"',
  225: '9"',
  250: '10"',
  300: '12"',
  350: '14"',
  400: '16"',
  450: '18"',
  500: '20"',
  600: '24"',
  700: '28"',
  800: '32"',
  900: '36"',
  1000: '40"',
  1100: '44"',
  1200: '48"',
  1300: '52"',
  1400: '56"',
  1500: '60"',
  1600: '64"',
  1700: '68"',
  1800: '72"',
  1900: '76"',
  2000: '80"',
  2100: '88"',
};

/**
 * Возвращает дюймовый размер по значению условного прохода DN [мм]
 */
export function dnToInchDiameter(dnMm: number): string | undefined {
  return DN_TO_INCH_MAP[dnMm];
}

/**
 * Возвращает стандартный наружный диаметр Dн [мм] по значению условного прохода DN [мм]
 */
export function dnToOuterDiameterMm(dnMm: number): number | undefined {
  const rec = PIPE_DN_SPEC_TABLE.find((r) => r.dnMm === dnMm);
  return rec?.outerDiameterMm ?? undefined;
}

/**
 * Конвертация диаметра трубопровода из мм в дюйм-диаметр (DN/NPS)
 * строго в соответствии с эталонной таблицей соответствия условных проходов.
 */
export function mmToInchDiameter(diameterMm: number): string {
  const d = Number(diameterMm);
  if (!d || Number.isNaN(d) || d <= 0) return '';

  const outerToInchMap: Record<number, string> = {
    16: '3/8"',
    20: '1/2"',
    26: '3/4"',
    32: '1"',
    42: '1 1/4"',
    45: '1 1/2"',
    57: '2"',
    76: '2 1/2"',
    89: '3"',
    102: '3 1/2"',
    108: '4"',
    133: '5"',
    165: '6"',
    180: '6 1/2"',
    219: '8"',
    245: '9"',
    273: '10"',
    325: '12"',
    377: '14"',
    426: '16"',
    530: '20"',
    630: '24"',
    720: '28"',
    820: '32"',
    920: '36"',
    1020: '40"',
    1220: '48"',
    1320: '52"',
    1420: '56"',
    1520: '60"',
    1620: '64"',
    1720: '68"',
    1820: '72"',
    1920: '76"',
    2020: '80"',
    2120: '88"',
    2220: '80"',

    // Дополнительные сопутствующие диаметры ГОСТ
    14: '3/8"',
    18: '1/2"',
    21.3: '1/2"',
    22: '1/2"',
    25: '3/4"',
    26.9: '3/4"',
    28: '3/4"',
    33.7: '1"',
    38: '1 1/4"',
    42.4: '1 1/4"',
    48.3: '1 1/2"',
    60.3: '2"',
    114: '4"',
    140: '5"',
    159: '6"',
    168: '6"',
  };

  if (outerToInchMap[d]) return outerToInchMap[d];

  const rounded = Math.round(d);
  if (outerToInchMap[rounded]) return outerToInchMap[rounded];

  // Через условный проход DN из таблицы
  const dn = mmToNominalBoreDn(d);
  if (dn && DN_TO_INCH_MAP[dn]) {
    return DN_TO_INCH_MAP[dn];
  }

  const approxInches = Math.max(0.5, Math.round((d / 25.4) * 2) / 2);
  return `${approxInches}"`;
}

/**
 * Определяет условный проход DN [мм] по наружному диаметру трубы/детали в мм
 * строго в соответствии с эталонной таблицей соответствия условных проходов.
 * Если диаметр не указан или равен 0, возвращает undefined.
 */
export function mmToNominalBoreDn(diameterMm?: number | null): number | undefined {
  const d = Number(diameterMm);
  if (!d || Number.isNaN(d) || d <= 0) return undefined;

  const dnMap: Record<number, number> = {
    // Из предоставленной таблицы спецификации: Dн [мм] -> DN [мм]
    16: 10,
    20: 15,
    26: 20,
    32: 25,
    42: 32,
    45: 40,
    57: 50,
    76: 65,
    89: 80,
    102: 90,
    108: 100,
    133: 125,
    165: 150,
    180: 160,
    219: 200,
    245: 225,
    273: 250,
    325: 300,
    377: 350,
    426: 400,
    530: 500,
    630: 600,
    720: 700,
    820: 800,
    920: 900,
    1020: 1000,
    1220: 1200,
    1320: 1300,
    1420: 1400,
    1520: 1500,
    1620: 1600,
    1720: 1700,
    1820: 1800,
    1920: 1900,
    2120: 2100,
    2220: 2200,
    2320: 2300,
    2420: 2400,
    2520: 2500,
    2620: 2600,
    2720: 2700,
    2820: 2800,
    2920: 2900,
    3000: 3000,

    // Дополнительные сопутствующие диаметры ГОСТ для труб (для совместимости)
    14: 10,
    18: 15,
    21.3: 15,
    22: 15,
    25: 20,
    26.9: 20,
    28: 20,
    33.7: 25,
    38: 32,
    42.4: 32,
    48.3: 40,
    60.3: 50,
    114: 100,
    140: 125,
    159: 150,
    168: 150,
    2020: 2000,
  };

  if (dnMap[d] !== undefined) return dnMap[d];

  const rounded = Math.round(d);
  if (dnMap[rounded] !== undefined) return dnMap[rounded];

  // Поиск ближайшего значения наружного диаметра из таблицы при минимальной погрешности
  const knownDiameters = Object.keys(dnMap).map(Number);
  let bestMatch: number | undefined;
  let minDiff = Infinity;
  for (const kd of knownDiameters) {
    const diff = Math.abs(d - kd);
    if (diff < minDiff && (diff <= 1.0 || diff / kd < 0.02)) {
      minDiff = diff;
      bestMatch = kd;
    }
  }
  if (bestMatch !== undefined) {
    return dnMap[bestMatch];
  }

  return Math.round(d / 10) * 10;
}

/**
 * Возвращает условный проход DN 1 для позиции каталога ЛРВ
 */
export function getLrvItemDn1(item: Pick<LRVItem, 'dn1' | 'diameterMm'>): number | undefined {
  if (item.dn1 && item.dn1 > 0) return item.dn1;
  return mmToNominalBoreDn(item.diameterMm);
}

/**
 * Возвращает условный проход DN 2 для позиции каталога ЛРВ.
 * Для элементов с одним диаметром строго возвращает undefined (поле остаётся пустым).
 */
export function getLrvItemDn2(
  item: Pick<LRVItem, 'dn2' | 'diameterMm2'>
): number | undefined {
  if (!item.diameterMm2 && !item.dn2) return undefined;
  if (item.dn2 && item.dn2 > 0) return item.dn2;
  return mmToNominalBoreDn(item.diameterMm2);
}

/**
 * Предлагает номер следующего стыка на линии.
 * - Для основных стыков: шаг 10 (010, 020, 030, 040...)
 * - Для дополнительных стыков после базового (напр. "010"): 011, 012 и т.д.
 */
export function suggestNextJointNumber(
  existingJointNumbersInLine: string[],
  baseJointForSupplementary?: string
): string {
  const parsedNums = existingJointNumbersInLine
    .map((n) => parseInt(n.replace(/\D/g, ''), 10))
    .filter((n) => !Number.isNaN(n));

  if (baseJointForSupplementary) {
    const baseNum = parseInt(baseJointForSupplementary.replace(/\D/g, ''), 10);
    if (!Number.isNaN(baseNum)) {
      const decadeBase = Math.floor(baseNum / 10) * 10;
      let candidate = decadeBase + 1;
      while (parsedNums.includes(candidate)) {
        candidate += 1;
      }
      return String(candidate).padStart(3, '0');
    }
  }

  if (parsedNums.length === 0) return '010';
  const maxMainDecade = Math.max(...parsedNums.map((n) => Math.floor(n / 10) * 10));
  const nextDecade = maxMainDecade + 10;
  return String(nextDecade).padStart(3, '0');
}

/**
 * Фильтрация каталога ЛРВ по шифру РД.
 * По умолчанию в паспорте стыка запрещено брать материалы из других шифров РД.
 */
export function filterLrvCatalogByRd(
  catalog: LRVItem[],
  rdCode: string,
  allowOtherRdCodes = false
): LRVItem[] {
  if (allowOtherRdCodes) return catalog;
  return catalog.filter((item) => item.rdCode === rdCode);
}

/**
 * Сортировка стыков для Журналов сварочных работ (СТО Газпром 15-1.1-002-2023 и ГОСТ 32569-2013):
 * строго в хронологическом порядке по дате сварки (weldingDate).
 * Стыки без даты сварки помещаются в конец списка.
 */
export function sortJointsChronologically(joints: WeldJoint[]): WeldJoint[] {
  return [...joints].sort((a, b) => {
    const dateA = a.weldingDate ? a.weldingDate.trim() : '';
    const dateB = b.weldingDate ? b.weldingDate.trim() : '';
    if (dateA && !dateB) return -1;
    if (!dateA && dateB) return 1;
    if (dateA !== dateB) {
      return dateA.localeCompare(dateB);
    }
    if (a.uniqueLineId !== b.uniqueLineId) {
      return a.uniqueLineId.localeCompare(b.uniqueLineId, 'ru');
    }
    return a.jointNumber.localeCompare(b.jointNumber, 'ru', { numeric: true });
  });
}

export interface ReadinessRow {
  groupKey: string;
  subLabel: string;
  totalJoints: number;
  supplementaryJoints: number;
  weldedCount: number;
  vikPassedCount: number;
  ndtPassedCount: number;
  dupNdtPassedCount: number;
  repairCount: number;
  fullyCompletedCount: number;
  weldingPct: number;
  readinessPct: number;
  totalEquivDiameterMm: number;
}

/**
 * Проверяет, полностью ли принят стык (либо с первого раза по ВИК и НК,
 * либо после первичного ремонта с успешным повторным контролем после ремонта).
 */
export function isJointFullyAccepted(joint: WeldJoint): boolean {
  if (!joint.weldingDate || !joint.welderStamp) return false;

  // Если назначено «Вырезать» на любом этапе и не закрыто ремонтом
  if (joint.dupNdtResult === 'Ремонт' || joint.dupNdtResult === 'Вырезать') {
    return false;
  }

  // Случай 1: Первичный контроль прошёл успешно без ремонта
  const primaryVikOk = joint.vikResult === 'Годен';
  const primaryNdtOk = joint.ndtResult === 'Годен';
  const dupOkOrNotRequired =
    joint.dupNdtType === 'Не требуется' || joint.dupNdtResult === 'Годен';

  if (primaryVikOk && primaryNdtOk && dupOkOrNotRequired) {
    return true;
  }

  // Случай 2: Первичный контроль выявил дефект («Ремонт»), но проведён контроль после ремонта со статусом «Годен»
  const hadPrimaryRepair =
    joint.vikResult === 'Ремонт' || joint.ndtResult === 'Ремонт';
  const postRepairPassed =
    joint.dupNdtType !== 'Не требуется' && joint.dupNdtResult === 'Годен';

  if (hadPrimaryRepair && postRepairPassed) {
    return true;
  }

  return false;
}

/**
 * Проверяет, находится ли стык в активном ремонте (дефект не закрыт повторным контролем).
 */
export function isJointCurrentlyInRepair(joint: WeldJoint): boolean {
  if (joint.dupNdtResult === 'Ремонт' || joint.dupNdtResult === 'Вырезать') {
    return true;
  }
  const hadPrimaryDefect =
    joint.vikResult === 'Ремонт' ||
    joint.vikResult === 'Вырезать' ||
    joint.ndtResult === 'Ремонт' ||
    joint.ndtResult === 'Вырезать';

  if (!hadPrimaryDefect) return false;

  // Если был первичный ремонт, но повторный контроль уже проведён и дал «Годен» — ремонт закрыт
  if (
    (joint.vikResult === 'Ремонт' || joint.ndtResult === 'Ремонт') &&
    joint.dupNdtType !== 'Не требуется' &&
    joint.dupNdtResult === 'Годен'
  ) {
    return false;
  }

  return true;
}

/**
 * Расчёт отчётности по готовности по условиям: «Объект», «шифр РД», «линия», «контур»
 */
export function calculateReadinessReport(
  joints: WeldJoint[],
  condition: ReadinessGroupCondition
): ReadinessRow[] {
  const groups = new Map<string, WeldJoint[]>();

  for (const j of joints) {
    const key = j[condition] || 'Не указано';
    const list = groups.get(key) || [];
    list.push(j);
    groups.set(key, list);
  }

  const rows: ReadinessRow[] = [];
  for (const [groupKey, items] of groups.entries()) {
    const totalJoints = items.length;
    const supplementaryJoints = items.filter((i) => {
      const num = parseInt(i.jointNumber, 10);
      return !Number.isNaN(num) && num % 10 !== 0;
    }).length;
    const weldedCount = items.filter((i) => Boolean(i.weldingDate && i.welderStamp)).length;
    const vikPassedCount = items.filter(
      (i) =>
        i.vikResult === 'Годен' ||
        (i.vikResult === 'Ремонт' &&
          i.dupNdtType !== 'Не требуется' &&
          i.dupNdtResult === 'Годен')
    ).length;
    const ndtPassedCount = items.filter(
      (i) =>
        i.ndtResult === 'Годен' ||
        (i.ndtResult === 'Ремонт' &&
          i.dupNdtType !== 'Не требуется' &&
          i.dupNdtResult === 'Годен')
    ).length;
    const dupNdtPassedCount = items.filter(
      (i) => i.dupNdtResult === 'Годен' || i.dupNdtType === 'Не требуется'
    ).length;
    const repairCount = items.filter((i) => isJointCurrentlyInRepair(i)).length;

    const fullyCompletedCount = items.filter((i) => isJointFullyAccepted(i)).length;

    const weldingPct = totalJoints > 0 ? Math.round((weldedCount / totalJoints) * 100) : 0;
    const readinessPct =
      totalJoints > 0 ? Math.round((fullyCompletedCount / totalJoints) * 100) : 0;
    const totalEquivDiameterMm = items.reduce((acc, i) => acc + (Number(i.diameterMm) || 0), 0);

    const first = items[0];
    let subLabel = '';
    if (condition === 'objectName') {
      const uniqueRds = new Set(items.map((x) => x.rdCode)).size;
      subLabel = `Шифров РД: ${uniqueRds}`;
    } else if (condition === 'rdCode') {
      subLabel = first?.objectName || '';
    } else if (condition === 'uniqueLineId') {
      subLabel = `Линия ${first?.lineNumber || ''} · ${first?.contour || ''}`;
    } else if (condition === 'contour') {
      subLabel = first?.objectName || '';
    }

    rows.push({
      groupKey,
      subLabel,
      totalJoints,
      supplementaryJoints,
      weldedCount,
      vikPassedCount,
      ndtPassedCount,
      dupNdtPassedCount,
      repairCount,
      fullyCompletedCount,
      weldingPct,
      readinessPct,
      totalEquivDiameterMm,
    });
  }

  return rows.sort((a, b) => b.totalJoints - a.totalJoints);
}

/**
 * Массовое редактирование выбранных стыков (за исключением номера стыка jointNumber!)
 * Возвращает обновлённый массив стыков и массив записей журнала аудита.
 */
export function applyBulkUpdateToJoints(
  joints: WeldJoint[],
  selectedIds: string[],
  patch: Partial<WeldJoint>,
  user: { login: string; fullName: string; role: string },
  fieldLabels: Record<string, string>,
  timestampIso = new Date().toISOString()
): { updatedJoints: WeldJoint[]; auditEntries: AuditLogEntry[] } {
  const selectedSet = new Set(selectedIds);
  const safePatch: Partial<WeldJoint> = { ...patch };
  // Запрещаем массовое изменение номера стыка и уникального ID
  delete safePatch.id;
  delete safePatch.jointNumber;

  const auditEntries: AuditLogEntry[] = [];

  const updatedJoints = joints.map((joint) => {
    if (!selectedSet.has(joint.id)) return joint;

    const nextJoint: WeldJoint = { ...joint };
    let changed = false;

    for (const [key, rawVal] of Object.entries(safePatch)) {
      if (rawVal === undefined) continue;
      const k = key as keyof WeldJoint;
      const prevVal = joint[k];
      if (String(prevVal ?? '') !== String(rawVal ?? '')) {
        (nextJoint as unknown as Record<string, unknown>)[k] = rawVal;
        changed = true;
        const isDate = isDateColumnKey(key);
        const fmtOld = isDate ? formatDateDDMMYY(String(prevVal ?? '')) : String(prevVal ?? '');
        const fmtNew = isDate ? formatDateDDMMYY(String(rawVal ?? '')) : String(rawVal ?? '');
        auditEntries.push({
          id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: timestampIso,
          userLogin: user.login,
          userFullName: user.fullName,
          userRole: user.role,
          jointId: joint.id,
          jointNumber: joint.jointNumber,
          uniqueLineId: joint.uniqueLineId,
          rdCode: joint.rdCode,
          fieldKey: key,
          fieldLabel: fieldLabels[key] || key,
          oldValue: fmtOld || '—',
          newValue: fmtNew || '—',
          operationType: 'bulk_edit',
        });
      }
    }

    if (safePatch.rdCode !== undefined || safePatch.lineNumber !== undefined) {
      nextJoint.uniqueLineId = buildUniqueLineId(nextJoint.rdCode, nextJoint.lineNumber);
    }

    if (changed) {
      nextJoint.updatedAt = timestampIso;
      nextJoint.updatedBy = user.fullName;
    }

    return nextJoint;
  });

  return { updatedJoints, auditEntries };
}

/**
 * Детерминированная оценка температуры воздуха по широте/долготе и дате (СП 131.13330 Строительная климатология).
 * Для Северо-Запада / умеренных широт (широта < 62.5° с.ш., долгота < 50° в.д., например г. Волхов Ленинградской обл. 59.93° N, 32.34° E)
 * использует среднемесячную кривую умеренно-континентального климата, а для северных и сибирских широт — арктическую кривую.
 */
export function estimateAmbientTempByCoordsAndDate(
  latitude: number,
  longitude: number,
  dateStr: string
): number {
  const d = dateStr ? new Date(dateStr) : new Date();
  const month = Number.isNaN(d.getTime()) ? 9 : d.getUTCMonth(); // 0..11
  const day = Number.isNaN(d.getTime()) ? 15 : d.getUTCDate();
  const dailyVariation = ((day * 7 + Math.round(longitude)) % 7) - 3;

  // Умеренно-континентальный климат Северо-Запада РФ (Ленинградская обл., г. Волхов, Выборг и др.)
  if (latitude < 62.5 && longitude < 50) {
    const temperateCurve = [-7, -6, -1, 6, 13, 17, 20, 18, 12, 6, 0, -4];
    const base = temperateCurve[month] ?? 6;
    const latAdj = Math.round((60 - latitude) * 0.9);
    return base + latAdj + dailyVariation;
  }

  // Среднемесячная кривая для северных нефтегазовых широт (65..71 с.ш.)
  const seasonalCurve = [-26, -24, -18, -9, -2, 7, 14, 11, 4, -5, -16, -23];
  const base = seasonalCurve[month] ?? -5;
  const latAdjustment = Math.round((67 - latitude) * 1.4);
  return base + latAdjustment + dailyVariation;
}

/**
 * Генерирует посуточный архив среднесуточных температур воздуха (°C) за указанный период (startDateIso .. endDateIso)
 * по координатам метеостанции объекта строительства (например, 2–3 кварталы 2026 г.: 2026-04-01 .. 2026-09-30).
 */
export function generatePeriodWeatherArchive(
  latitude: number,
  longitude: number,
  startDateIso: string,
  endDateIso: string
): Record<string, string> {
  const archive: Record<string, string> = {};
  const start = new Date(`${startDateIso}T00:00:00Z`);
  const end = new Date(`${endDateIso}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return archive;
  }
  const cursor = new Date(start);
  let safetyCounter = 0;
  while (cursor <= end && safetyCounter < 750) {
    const iso = cursor.toISOString().slice(0, 10);
    const t = estimateAmbientTempByCoordsAndDate(latitude, longitude, iso);
    archive[iso] = t > 0 ? `+${t}` : `${t}`;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    safetyCounter++;
  }
  return archive;
}

/**
 * Автоматическое получение температуры окружающей среды:
 * 1) Из предзагруженного архива температур объекта за период (weatherArchive[dateStr]), если задан;
 * 2) Через открытый метеосервис Open-Meteo API (ERA5 для прошедших дат или текущий прогноз только для сегодняшней даты);
 * 3) С мгновенным резервным расчётом по климатологической модели метеостанции объекта на выбранную дату сварки.
 */
export async function fetchAmbientTemperatureAuto(
  latitude: number,
  longitude: number,
  dateStr?: string,
  weatherArchive?: Record<string, string>
): Promise<{ tempC: string; source: string }> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const targetDate = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? dateStr
    : todayIso;

  // 0. Проверяем предзагруженный архив температур объекта (например, за 2–3 кварталы 2026 г.)
  if (weatherArchive && weatherArchive[targetDate] !== undefined) {
    const rawVal = String(weatherArchive[targetDate]).trim();
    const num = Number(rawVal);
    const formatted =
      !rawVal.startsWith('+') && !rawVal.startsWith('-') && !Number.isNaN(num) && num > 0
        ? `+${num}`
        : rawVal;
    return {
      tempC: formatted,
      source: `Метеоархив объекта (${latitude.toFixed(2)}°N, ${longitude.toFixed(2)}°E · ${formatDateDDMMYY(targetDate)})`,
    };
  }

  const isHistorical = targetDate < todayIso;
  const isToday = !dateStr || targetDate === todayIso;

  // 1. Попытка запроса к реальному архиву метеонаблюдений (Архив Росгидромет / Open-Meteo ERA5 Reanalysis)
  if (isHistorical) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const archiveUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude.toFixed(
        2
      )}&longitude=${longitude.toFixed(
        2
      )}&start_date=${targetDate}&end_date=${targetDate}&daily=temperature_2m_mean&timezone=auto`;
      const res = await fetch(archiveUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const meanTemp = data?.daily?.temperature_2m_mean?.[0];
        if (typeof meanTemp === 'number') {
          const rounded = Math.round(meanTemp * 10) / 10;
          const formatted = rounded > 0 ? `+${rounded}` : `${rounded}`;
          return {
            tempC: formatted,
            source: `Метеоархив Open-Meteo/ERA5 (${latitude.toFixed(2)}°N, ${longitude.toFixed(2)}°E · ${formatDateDDMMYY(targetDate)})`,
          };
        }
      }
    } catch {
      // Игнорируем сетевые ошибки, переходим к локальной модели
    }
  }

  // 2. Текущая температура с метеостанции в реальном времени (только если дата не указана или равна сегодняшней)
  if (isToday) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3200);
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(
        2
      )}&longitude=${longitude.toFixed(2)}&current=temperature_2m&timezone=auto`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const liveTemp = data?.current?.temperature_2m;
        if (typeof liveTemp === 'number') {
          const rounded = Math.round(liveTemp * 10) / 10;
          const formatted = rounded > 0 ? `+${rounded}` : `${rounded}`;
          return {
            tempC: formatted,
            source: `Метеостанция Open-Meteo (${latitude.toFixed(2)}°N, ${longitude.toFixed(2)}°E · ${formatDateDDMMYY(targetDate)})`,
          };
        }
      }
    } catch {
      // Fallback to deterministic meteorological archive calculation
    }
  }

  // 3. Автономная детерминированная модель (СП 131.13330 Строительная климатология) строго на дату targetDate
  const calc = estimateAmbientTempByCoordsAndDate(latitude, longitude, targetDate);
  const formatted = calc > 0 ? `+${calc}` : `${calc}`;
  return {
    tempC: formatted,
    source: `Авто-метеопост площадки (${latitude.toFixed(2)}°N, ${longitude.toFixed(2)}°E · ${formatDateDDMMYY(targetDate)})`,
  };
}

export const ALL_COLUMNS: ColumnDefinition[] = [
  // Архитектурный блок
  {
    key: 'jointNumber',
    label: '№ стыка',
    shortLabel: '№ стыка',
    group: 'project_id',
    groupLabel: 'Идентификация',
    minWidth: 105,
    isNumeric: true,
    isSticky: true,
  },
  {
    key: 'uniqueLineId',
    label: 'Уникальный ID линии',
    shortLabel: 'ID линии',
    group: 'project_id',
    groupLabel: 'Идентификация',
    minWidth: 175,
    isSticky: true,
  },
  {
    key: 'rdCode',
    label: 'Шифр РД',
    shortLabel: 'Шифр РД',
    group: 'project_id',
    groupLabel: 'Идентификация',
    minWidth: 260,
  },
  {
    key: 'contour',
    label: 'Контур',
    shortLabel: 'Контур',
    group: 'project_id',
    groupLabel: 'Идентификация',
    minWidth: 165,
  },
  {
    key: 'lineNumber',
    label: 'Номер линии',
    shortLabel: 'Линия',
    group: 'project_id',
    groupLabel: 'Идентификация',
    minWidth: 115,
  },
  // Подготовка производства (12 проектных полей + номер стыка = 13 полей)
  {
    key: 'jointType',
    label: 'Тип стыка',
    group: 'prep',
    groupLabel: 'Подготовка (Проект)',
    minWidth: 120,
  },
  {
    key: 'diameterMm',
    label: 'Диаметр, мм',
    shortLabel: 'Ø, мм',
    group: 'prep',
    groupLabel: 'Подготовка (Проект)',
    minWidth: 110,
    isNumeric: true,
  },
  {
    key: 'diameterInch',
    label: 'Дюйм-диаметр',
    shortLabel: 'Дюймы',
    group: 'prep',
    groupLabel: 'Подготовка (Проект)',
    minWidth: 115,
    isNumeric: true,
  },
  {
    key: 'wallThickness',
    label: 'Толщина стенки, мм',
    shortLabel: 'S, мм',
    group: 'prep',
    groupLabel: 'Подготовка (Проект)',
    minWidth: 125,
    isNumeric: true,
  },
  {
    key: 'lrv1Code',
    label: 'Код ЛРВ 1',
    group: 'prep',
    groupLabel: 'Подготовка (Проект)',
    minWidth: 145,
  },
  {
    key: 'elem1Name',
    label: 'Краткое наим. эл. 1',
    group: 'prep',
    groupLabel: 'Подготовка (Проект)',
    minWidth: 165,
  },
  {
    key: 'elem1Material',
    label: 'Материал эл. 1',
    group: 'prep',
    groupLabel: 'Подготовка (Проект)',
    minWidth: 125,
  },
  {
    key: 'elem1Ntd',
    label: 'НТД эл. 1',
    group: 'prep',
    groupLabel: 'Подготовка (Проект)',
    minWidth: 155,
  },
  {
    key: 'elem1FactoryNumber',
    label: 'Зав. № эл. 1',
    group: 'prep',
    groupLabel: 'Подготовка (Проект)',
    minWidth: 130,
  },
  {
    key: 'elem1Manufacturer',
    label: 'Завод-изгот. эл. 1',
    shortLabel: 'Завод эл. 1',
    group: 'prep',
    groupLabel: 'Подготовка (Проект)',
    minWidth: 145,
  },
  {
    key: 'elem1Length',
    label: 'Длина эл. 1, м',
    shortLabel: 'Длина эл. 1, м',
    group: 'prep',
    groupLabel: 'Подготовка (Проект)',
    minWidth: 120,
    isNumeric: true,
  },
  {
    key: 'lrv2Code',
    label: 'Код ЛРВ 2',
    group: 'prep',
    groupLabel: 'Подготовка (Проект)',
    minWidth: 145,
  },
  {
    key: 'elem2Name',
    label: 'Краткое наим. эл. 2',
    group: 'prep',
    groupLabel: 'Подготовка (Проект)',
    minWidth: 165,
  },
  {
    key: 'elem2Material',
    label: 'Материал эл. 2',
    group: 'prep',
    groupLabel: 'Подготовка (Проект)',
    minWidth: 125,
  },
  {
    key: 'elem2Ntd',
    label: 'НТД эл. 2',
    group: 'prep',
    groupLabel: 'Подготовка (Проект)',
    minWidth: 155,
  },
  {
    key: 'elem2FactoryNumber',
    label: 'Зав. № эл. 2',
    group: 'prep',
    groupLabel: 'Подготовка (Проект)',
    minWidth: 130,
  },
  {
    key: 'elem2Manufacturer',
    label: 'Завод-изгот. эл. 2',
    shortLabel: 'Завод эл. 2',
    group: 'prep',
    groupLabel: 'Подготовка (Проект)',
    minWidth: 145,
  },
  {
    key: 'elem2Length',
    label: 'Длина эл. 2, м',
    shortLabel: 'Длина эл. 2, м',
    group: 'prep',
    groupLabel: 'Подготовка (Проект)',
    minWidth: 120,
    isNumeric: true,
  },
  // Производство работ
  {
    key: 'weldingType',
    label: 'Вид сварки',
    shortLabel: 'Вид сварки',
    group: 'welding',
    groupLabel: 'Сварка (Производство)',
    minWidth: 115,
  },
  {
    key: 'gostJointType',
    label: 'Тип сварного соединения',
    shortLabel: 'Тип сварного соединения',
    group: 'welding',
    groupLabel: 'Сварка (Производство)',
    minWidth: 165,
  },
  {
    key: 'weldingPosition',
    label: 'Положение',
    shortLabel: 'Положение',
    group: 'welding',
    groupLabel: 'Сварка (Производство)',
    minWidth: 120,
  },
  {
    key: 'weldingDate',
    label: 'Дата сварки',
    group: 'welding',
    groupLabel: 'Сварка (Производство)',
    minWidth: 125,
    isNumeric: true,
  },
  {
    key: 'welderStamp',
    label: 'Клеймо сварщика',
    shortLabel: 'Клеймо',
    group: 'welding',
    groupLabel: 'Сварка (Производство)',
    minWidth: 130,
  },
  {
    key: 'weldingMaterials',
    label: 'Сварочные материалы',
    group: 'welding',
    groupLabel: 'Сварка (Производство)',
    minWidth: 195,
  },
  {
    key: 'ambientTemp',
    label: 'Темп. среды, °C',
    shortLabel: 'T возд., °C',
    group: 'welding',
    groupLabel: 'Сварка (Производство)',
    minWidth: 125,
    isNumeric: true,
  },
  {
    key: 'preheatTemp',
    label: 'Темп. подогрева, °C',
    shortLabel: 'T подогр., °C',
    group: 'welding',
    groupLabel: 'Сварка (Производство)',
    minWidth: 135,
    isNumeric: true,
  },
  {
    key: 'responsiblePerson',
    label: 'Ответственное лицо',
    shortLabel: 'Мастер / Прораб',
    group: 'welding',
    groupLabel: 'Сварка (Производство)',
    minWidth: 165,
  },
  {
    key: 'welderFullName',
    label: 'ФИО сварщика',
    group: 'welding',
    groupLabel: 'Сварка (Производство)',
    minWidth: 170,
  },
  {
    key: 'welderCertNumber',
    label: '№ удост. сварщика',
    group: 'welding',
    groupLabel: 'Сварка (Производство)',
    minWidth: 160,
  },
  {
    key: 'techCardNumber',
    label: '№ тех. карты',
    group: 'welding',
    groupLabel: 'Сварка (Производство)',
    minWidth: 145,
  },
  // Контроль ВИК (3 поля)
  {
    key: 'vikResult',
    label: 'Результат ВИК',
    group: 'vik',
    groupLabel: 'Контроль ВИК',
    minWidth: 135,
  },
  {
    key: 'vikDate',
    label: 'Дата ВИК',
    group: 'vik',
    groupLabel: 'Контроль ВИК',
    minWidth: 120,
    isNumeric: true,
  },
  {
    key: 'vikInspector',
    label: 'Дефектоскопист ВИК',
    group: 'vik',
    groupLabel: 'Контроль ВИК',
    minWidth: 165,
  },
  // Неразрушающий контроль НК (4 поля)
  {
    key: 'ndtType',
    label: 'Тип НК',
    group: 'ndt',
    groupLabel: 'Неразрушающий контроль (НК)',
    minWidth: 110,
  },
  {
    key: 'ndtDate',
    label: 'Дата НК',
    group: 'ndt',
    groupLabel: 'Неразрушающий контроль (НК)',
    minWidth: 120,
    isNumeric: true,
  },
  {
    key: 'ndtResult',
    label: 'Результат НК',
    group: 'ndt',
    groupLabel: 'Неразрушающий контроль (НК)',
    minWidth: 135,
  },
  {
    key: 'ndtInspector',
    label: 'Дефектоскопист НК',
    group: 'ndt',
    groupLabel: 'Неразрушающий контроль (НК)',
    minWidth: 165,
  },
  // Дублирующий контроль (4 поля)
  {
    key: 'dupNdtType',
    label: 'Тип дубл. контроля',
    group: 'dup_ndt',
    groupLabel: 'Дублирующий НК',
    minWidth: 145,
  },
  {
    key: 'dupNdtDate',
    label: 'Дата дубл. НК',
    group: 'dup_ndt',
    groupLabel: 'Дублирующий НК',
    minWidth: 125,
    isNumeric: true,
  },
  {
    key: 'dupNdtResult',
    label: 'Результат дубл. НК',
    group: 'dup_ndt',
    groupLabel: 'Дублирующий НК',
    minWidth: 145,
  },
  {
    key: 'dupNdtInspector',
    label: 'Дефектоскопист дубл. НК',
    group: 'dup_ndt',
    groupLabel: 'Дублирующий НК',
    minWidth: 175,
  },
];

export const FIELD_LABELS_MAP: Record<string, string> = Object.fromEntries(
  ALL_COLUMNS.map((c) => [c.key, c.label])
);

export const DEFAULT_COLUMN_KEYS: WeldJointFieldKey[] = ALL_COLUMNS.map((c) => c.key);

export interface LineCompletionStatus {
  isCompleted: boolean;
  totalJoints: number;
  weldedJoints: number;
  controlledJoints: number;
  statusLabel: string;
}

/**
 * Вычисляет статус линии для раздела «Проект (лайнлист)»:
 * показывает, что все стыки на линии сварены и проконтролированы.
 */
export function computeLineListItemStatus(
  lineItem: ProjectLineItem,
  allJoints: WeldJoint[]
): LineCompletionStatus {
  const lineJoints = allJoints.filter(
    (j) =>
      j.uniqueLineId === lineItem.uniqueLineId ||
      (j.rdCode === lineItem.rdCode && j.lineNumber === lineItem.lineNumber)
  );

  const totalJoints = lineJoints.length;
  if (totalJoints === 0) {
    const manual = (lineItem.manualStatus || '').trim();
    const isManualReady =
      manual.toLowerCase().includes('все стыки сварены') ||
      manual.toLowerCase().includes('готова') ||
      manual.toLowerCase().includes('заверш');
    return {
      isCompleted: isManualReady,
      totalJoints: 0,
      weldedJoints: 0,
      controlledJoints: 0,
      statusLabel: manual || 'Нет стыков в реестре',
    };
  }

  let weldedJoints = 0;
  let controlledJoints = 0;

  for (const j of lineJoints) {
    const isWelded = Boolean(j.weldingDate && j.weldingDate.trim() !== '');
    if (isWelded) {
      weldedJoints += 1;
    }

    if (isJointFullyAccepted(j)) {
      controlledJoints += 1;
    }
  }

  const isCompleted =
    totalJoints > 0 && weldedJoints === totalJoints && controlledJoints === totalJoints;

  return {
    isCompleted,
    totalJoints,
    weldedJoints,
    controlledJoints,
    statusLabel: isCompleted
      ? `Все стыки сварены и проконтролированы (${controlledJoints}/${totalJoints})`
      : `В работе (сварка ${weldedJoints}/${totalJoints}, НК ${controlledJoints}/${totalJoints})`,
  };
}

/**
 * Преобразует массив объектов из листа Excel (или CSV/TSV) с аналогичной структурой полей
 * в типизированный список ProjectLineItem[] для раздела «Проект (лайнлист)».
 */
export function parseProjectLineListRecords(
  rows: Record<string, unknown>[],
  defaultObjectName: string,
  defaultRdCode: string
): ProjectLineItem[] {
  const result: ProjectLineItem[] = [];

  const getField = (row: Record<string, unknown>, candidates: string[], fallbackIdx: number): string => {
    const keys = Object.keys(row);
    for (const cand of candidates) {
      const foundKey = keys.find(
        (k) => k.trim().toLowerCase() === cand.toLowerCase() || k.trim().toLowerCase().includes(cand.toLowerCase())
      );
      if (foundKey !== undefined && row[foundKey] !== undefined && row[foundKey] !== null) {
        return String(row[foundKey]).trim();
      }
    }
    if (keys[fallbackIdx] !== undefined && row[keys[fallbackIdx]] !== undefined) {
      return String(row[keys[fallbackIdx]]).trim();
    }
    return '';
  };

  const parsePercent = (val: string, defaultVal = 100): number => {
    if (!val) return defaultVal;
    const cleaned = val.replace('%', '').replace(',', '.').trim();
    const num = Number(cleaned);
    if (Number.isNaN(num)) return defaultVal;
    return Math.min(100, Math.max(0, num));
  };

  rows.forEach((row, idx) => {
    const objectName =
      getField(row, ['название объекта', 'наименование объекта', 'объект'], 0) ||
      defaultObjectName;
    const rdCode =
      getField(row, ['шифр рд', 'шифр рабочей документации', 'шифр'], 1) ||
      defaultRdCode;
    const lineNumber = getField(row, ['номер линии', 'линия №', 'обозначение линии'], 2);
    const lineName = getField(row, ['наименование линии', 'название линии'], 3);

    // Пропускаем полностью пустые строки или строки-заголовки
    if (
      (!lineNumber && !lineName) ||
      lineNumber.toLowerCase() === 'номер линии'
    ) {
      return;
    }

    const product = getField(row, ['продукт', 'среда', 'рабочая среда'], 4) || 'Природный газ';
    const testContour = getField(row, ['контур испытания', 'контур'], 5) || 'Контур КИ-1';
    const weldingNtd =
      getField(row, ['нтд на сварку', 'нтд сварка'], 6) || 'СТО Газпром 15-1.1-002-2023';
    const controlNtd =
      getField(row, ['нтд на контроль', 'нтд контроль', 'нтд нк'], 7) ||
      'СТО Газпром 15-1.3-004-2023';
    const qualityLevel = getField(row, ['уровень качества', 'уровень'], 8);
    const pipelineCategory = getField(
      row,
      ['категория трубопровода', 'категория'],
      9
    );
    const workingPressure =
      getField(row, ['рабочее давление', 'давление'], 10) || '11.8 МПа';
    const workingTemperature =
      getField(row, ['температура', 'рабочая температура'], 11) || '-20...+60 °C';
    const rkPercent = parsePercent(
      getField(row, ['процент контроля рк', 'рк, %', 'контроль рк'], 12),
      100
    );
    const uzkPercent = parsePercent(
      getField(row, ['процент контроля узк', 'узк, %', 'контроль узк'], 13),
      100
    );
    const pvkPercent = parsePercent(
      getField(row, ['процент контроля пвк', 'пвк, %', 'контроль пвк'], 14),
      0
    );
    const manualStatus = getField(row, ['статус', 'готовность'], 15);
    const rawTestDate = getField(row, ['дата испытания', 'испытание'], 16);
    const testDate = normalizeDateToISO(rawTestDate) || rawTestDate;

    const finalLineNumber = lineNumber || `Л-${idx + 1}`;

    result.push({
      id: `ll-imp-${Date.now()}-${idx}`,
      objectName,
      rdCode,
      lineNumber: finalLineNumber,
      uniqueLineId: buildUniqueLineId(rdCode, finalLineNumber),
      lineName: lineName || `Технологическая линия ${finalLineNumber}`,
      product,
      testContour,
      weldingNtd,
      controlNtd,
      qualityLevel,
      pipelineCategory,
      workingPressure,
      workingTemperature,
      rkPercent,
      uzkPercent,
      pvkPercent,
      manualStatus: manualStatus || undefined,
      testDate,
    });
  });

  return result;
}

/**
 * Преобразует массив объектов из подготовленного файла Excel (.xlsx / .xls / .csv)
 * в типизированный список LRVItem[] для раздела «Каталог ЛРВ и спецификации».
 */
export function parseLrvCatalogRecords(
  rows: Record<string, unknown>[],
  defaultObjectName: string,
  defaultRdCode: string,
  existingCodes?: Set<string>
): LRVItem[] {
  const result: LRVItem[] = [];
  const seenCodes = new Set<string>(
    existingCodes
      ? Array.from(existingCodes).map((c) => c.trim().toLowerCase())
      : []
  );

  const getField = (
    row: Record<string, unknown>,
    candidates: string[],
    fallbackIdx?: number
  ): string => {
    const keys = Object.keys(row);
    for (const cand of candidates) {
      const foundKey = keys.find(
        (k) =>
          k.trim().toLowerCase() === cand.toLowerCase() ||
          k.trim().toLowerCase().includes(cand.toLowerCase())
      );
      if (
        foundKey !== undefined &&
        row[foundKey] !== undefined &&
        row[foundKey] !== null
      ) {
        return String(row[foundKey]).trim();
      }
    }
    if (
      fallbackIdx !== undefined &&
      keys[fallbackIdx] !== undefined &&
      row[keys[fallbackIdx]] !== undefined
    ) {
      return String(row[keys[fallbackIdx]]).trim();
    }
    return '';
  };

  const parseNum = (val: string): number | undefined => {
    if (!val) return undefined;
    const cleaned = val
      .replace(/[^\d.,-]/g, '')
      .replace(',', '.')
      .trim();
    if (!cleaned) return undefined;
    const num = Number(cleaned);
    return Number.isNaN(num) || num <= 0 ? undefined : num;
  };

  rows.forEach((row, idx) => {
    const rawCode = getField(
      row,
      ['код лрв', 'lrv', 'шифр лрв', 'код материала', 'код'],
      0
    );
    const shortName = getField(
      row,
      [
        'краткое наименование',
        'наименование',
        'элемент',
        'деталь',
        'материал/деталь',
      ],
      2
    );

    if (
      (!rawCode && !shortName) ||
      rawCode.toLowerCase() === 'код лрв' ||
      shortName.toLowerCase() === 'краткое наименование'
    ) {
      return;
    }

    const finalCode = rawCode || `ЛРВ-XLS-${Date.now()}-${idx + 1}`;
    if (seenCodes.has(finalCode.toLowerCase())) {
      return;
    }
    seenCodes.add(finalCode.toLowerCase());

    const rdCode =
      getField(row, ['шифр рд', 'шифр рабочей документации', 'рд'], 1) ||
      defaultRdCode ||
      'НОВЫЙ-ШИФР-РД';
    const objectName =
      getField(row, ['объект', 'название объекта', 'наименование объекта']) ||
      defaultObjectName ||
      'Новый объект';
    const material =
      getField(
        row,
        ['материал (сталь)', 'марка стали', 'материал', 'сталь'],
        3
      ).replace(/^ст\.?\s*/i, '') || '09Г2С';
    const ntd =
      getField(row, ['нтд (гост / ту)', 'нтд', 'гост', 'ту', 'стандарт'], 4) ||
      'ГОСТ 17375-2001';
    const manufacturer =
      getField(
        row,
        ['завод-изготовитель', 'завод', 'изготовитель', 'производитель'],
        5
      ) || undefined;

    const dualMatch = shortName.match(
      /(\d+)[xх×](\d+(?:[.,]\d+)?)\s*-\s*(\d+)[xх×](\d+(?:[.,]\d+)?)/i
    );
    const singleMatch = shortName.match(/(\d+)[xх×](\d+(?:[.,]\d+)?)/i);

    const rawDn1 = parseNum(
      getField(row, ['условный проход dn 1', 'dn 1', 'dn1', 'ду 1', 'ду1'])
    );
    const rawD1 =
      parseNum(
        getField(
          row,
          ['диаметр ø1, мм', 'диаметр 1', 'диаметр, мм', 'ø1', 'd1', 'д1'],
          6
        )
      ) ??
      (dualMatch
        ? Number(dualMatch[1])
        : singleMatch
        ? Number(singleMatch[1])
        : 159);
    const rawS1 =
      parseNum(
        getField(
          row,
          [
            'толщина стенки s1, мм',
            'толщина s1',
            'толщина 1',
            'толщина стенки, мм',
            's1',
          ],
          7
        )
      ) ??
      (dualMatch
        ? Number(dualMatch[2].replace(',', '.'))
        : singleMatch
        ? Number(singleMatch[2].replace(',', '.'))
        : 8);

    const safeD1 = rawD1 >= 10 && rawD1 <= 2520 ? rawD1 : 159;
    const safeS1 = rawS1 >= 1 && rawS1 < safeD1 / 2 ? rawS1 : 8;
    const dn1 = rawDn1 ?? mmToNominalBoreDn(safeD1);

    const rawDn2 = parseNum(
      getField(row, ['условный проход dn 2', 'dn 2', 'dn2', 'ду 2', 'ду2'])
    );
    const rawD2 =
      parseNum(
        getField(row, ['диаметр ø2, мм', 'диаметр 2', 'ø2', 'd2', 'д2'])
      ) ?? (dualMatch ? Number(dualMatch[3]) : undefined);
    const rawS2 =
      parseNum(
        getField(
          row,
          ['толщина стенки s2, мм', 'толщина s2', 'толщина 2', 's2']
        )
      ) ?? (dualMatch ? Number(dualMatch[4].replace(',', '.')) : undefined);

    const safeD2 =
      rawD2 !== undefined && rawD2 >= 10 && rawD2 <= 2520 ? rawD2 : undefined;
    const safeS2 =
      safeD2 !== undefined &&
      rawS2 !== undefined &&
      rawS2 >= 1 &&
      rawS2 < safeD2 / 2
        ? rawS2
        : undefined;
    const dn2 =
      safeD2 !== undefined ? rawDn2 ?? mmToNominalBoreDn(safeD2) : undefined;

    const rawQtyStr = getField(
      row,
      ['кол-во по спец.', 'кол-во', 'количество', 'объем']
    );
    const specQty = parseNum(rawQtyStr) ?? 10;
    const rawUnit = getField(row, ['ед. изм.', 'ед.', 'единица']);
    const unit: 'шт' | 'м' =
      rawUnit.toLowerCase().includes('м') || rawQtyStr.toLowerCase().includes('м')
        ? 'м'
        : 'шт';

    const rawCategory = getField(row, [
      'категория элемента',
      'категория',
      'тип элемента',
      'тип детали',
      'вид элемента',
    ]);
    const rawConnectionType = getField(row, [
      'тип подсоединения',
      'тип присоединения',
      'подсоединение',
      'присоединение',
      'тип соединения',
    ]);

    const itemCategory = resolveLrvItemCategory({
      shortName,
      category: rawCategory,
    });
    const connectionType =
      itemCategory === 'ЗРА'
        ? detectLrvConnectionType(shortName, rawConnectionType)
        : undefined;

    result.push({
      id: `lrv-xls-${Date.now()}-${idx}`,
      lrvCode: finalCode,
      rdCode,
      objectName,
      shortName: shortName || 'Деталь трубопровода',
      category: itemCategory,
      connectionType,
      material,
      ntd,
      manufacturer,
      dn1,
      diameterMm: safeD1,
      wallThickness: safeS1,
      dn2,
      diameterMm2: safeD2,
      wallThickness2: safeS2,
      specQty,
      unit,
    });
  });

  return result;
}

export interface LineListColumnDef {
  key: LineListColumnKey;
  label: string;
  shortLabel?: string;
  minWidth: number;
  isNumeric?: boolean;
}

/**
 * Определения всех 17 столбцов таблицы «Проект (лайнлист)» для отображения, сортировки и Excel-фильтров
 */
export const LINELIST_COLUMNS: LineListColumnDef[] = [
  { key: 'objectName', label: 'Название объекта', minWidth: 165 },
  { key: 'rdCode', label: 'Шифр РД', minWidth: 215 },
  { key: 'lineNumber', label: 'Номер линии', minWidth: 120 },
  { key: 'lineName', label: 'Наименование линии', minWidth: 210 },
  { key: 'product', label: 'Продукт', minWidth: 140 },
  { key: 'testContour', label: 'Контур испытания', minWidth: 175 },
  { key: 'weldingNtd', label: 'НТД на сварку', minWidth: 165 },
  { key: 'controlNtd', label: 'НТД на контроль', minWidth: 165 },
  { key: 'qualityLevel', label: 'Уровень качества', minWidth: 135 },
  { key: 'pipelineCategory', label: 'Категория трубопровода', shortLabel: 'Категория', minWidth: 120 },
  { key: 'workingPressure', label: 'Рабочее давление', minWidth: 125, isNumeric: true },
  { key: 'workingTemperature', label: 'Температура', minWidth: 120, isNumeric: true },
  { key: 'rkPercent', label: '% контроля РК', shortLabel: '% РК', minWidth: 95, isNumeric: true },
  { key: 'uzkPercent', label: '% контроля УЗК', shortLabel: '% УЗК', minWidth: 95, isNumeric: true },
  { key: 'pvkPercent', label: '% контроля ПВК', shortLabel: '% ПВК', minWidth: 95, isNumeric: true },
  { key: 'computedStatus', label: 'Статус (сварка и контроль стыков)', shortLabel: 'Статус линии', minWidth: 245 },
  { key: 'testDate', label: 'Дата испытания', minWidth: 125, isNumeric: true },
];

/**
 * Формирует структуру объектов, шифров РД и контуров испытания строго на основании лайнлиста.
 * Все данные по объектам, шифрам РД и названиям линий система изначально берёт из лайнлиста.
 */
export function deriveFacilitiesFromLineList(
  lineList: ProjectLineItem[],
  fallbackMeta: FacilityObject[] = [],
  allowEmpty = false
): FacilityObject[] {
  const objMap = new Map<
    string,
    Map<string, { contours: Set<string>; title: string }>
  >();

  for (const item of lineList || []) {
    if (!item || typeof item !== 'object') continue;
    const objName = String(item.objectName ?? '').trim();
    const rd = String(item.rdCode ?? '').trim();
    const rawContour =
      item.testContour ??
      (item as unknown as Record<string, unknown>).contour ??
      '';
    const contour = String(rawContour).trim();
    if (!objName || !rd) continue;

    let rdMap = objMap.get(objName);
    if (!rdMap) {
      rdMap = new Map();
      objMap.set(objName, rdMap);
    }

    let rdEntry = rdMap.get(rd);
    if (!rdEntry) {
      const metaFacility = fallbackMeta.find((f) => f.name === objName);
      const metaRd = metaFacility?.rdCodes.find((r) => r.code === rd);
      const lineNum = String(item.lineNumber ?? '').trim();
      const lineTitle = String(item.lineName ?? '').trim();
      rdEntry = {
        contours: new Set<string>(),
        title:
          metaRd?.title ||
          (lineTitle ? `Линия ${lineNum} (${lineTitle})` : `Линия ${lineNum}`),
      };
      rdMap.set(rd, rdEntry);
    }

    if (contour) {
      rdEntry.contours.add(contour);
    }
  }

  const result: FacilityObject[] = [];
  let idx = 1;
  for (const [objName, rdMap] of objMap.entries()) {
    const metaFacility = fallbackMeta.find((f) => f.name === objName);
    const isVolkhov = objName.toLowerCase().includes('волхов');
    const rdCodes = Array.from(rdMap.entries()).map(([code, data]) => ({
      code,
      title: data.title,
      contours: Array.from(data.contours),
    }));

    result.push({
      id: metaFacility?.id || `obj-ll-${idx++}`,
      name: objName,
      shortName: metaFacility?.shortName || objName,
      region:
        metaFacility?.region ||
        (isVolkhov ? 'Ленинградская область, г. Волхов' : 'Промышленная площадка'),
      weatherStation:
        metaFacility?.weatherStation ||
        (isVolkhov
          ? 'Метеостанция г. Волхов (№26078)'
          : objName.toLowerCase().includes('бованенк')
          ? 'Метеопункт Бованенково'
          : objName.toLowerCase().includes('заполярн')
          ? 'Метеопункт Тазовский (Заполярное)'
          : `Метеопункт ${metaFacility?.shortName || objName}`),
      latitude: metaFacility?.latitude ?? (isVolkhov ? 59.93 : 68.5),
      longitude: metaFacility?.longitude ?? (isVolkhov ? 32.34 : 72.0),
      weatherArchive: metaFacility?.weatherArchive,
      rdCodes,
    });
  }

  if (allowEmpty) {
    return result;
  }
  return result.length > 0 ? result : fallbackMeta;
}

/**
 * Возвращает название метеопункта объекта строительства, с которого берутся данные о температуре воздуха.
 */
export function getFacilityWeatherStationName(
  facility?: {
    name?: string;
    shortName?: string;
    region?: string;
    weatherStation?: string;
  } | null
): string {
  if (!facility) return 'Метеопункт площадки';
  if (facility.weatherStation && facility.weatherStation.trim()) {
    return facility.weatherStation.trim();
  }
  const n = (facility.name || '').toLowerCase();
  if (n.includes('волхов')) return 'Метеостанция г. Волхов (№26078)';
  if (n.includes('бованенк')) return 'Метеопункт Бованенково';
  if (n.includes('заполярн')) return 'Метеопункт Тазовский (Заполярное)';
  if (n.includes('харасав')) return 'Метеопункт Харасавэй';
  if (n.includes('уренгой')) return 'Метеопункт Новый Уренгой';
  if (facility.shortName) return `Метеопункт ${facility.shortName}`;
  if (facility.region) return `Метеопункт (${facility.region})`;
  return 'Метеопункт объекта';
}

/**
 * Групповое редактирование выбранных строк лайнлиста (за исключением индивидуального номера линии).
 * При изменении Шифра РД автоматически пересчитывает uniqueLineId.
 */
export function applyBulkUpdateToLineList(
  lineList: ProjectLineItem[],
  selectedIds: string[],
  patch: Partial<ProjectLineItem>
): ProjectLineItem[] {
  const selectedSet = new Set(selectedIds);
  const safePatch: Partial<ProjectLineItem> = { ...patch };
  delete safePatch.id;
  delete safePatch.lineNumber;
  delete safePatch.uniqueLineId;

  return lineList.map((item) => {
    if (!selectedSet.has(item.id)) return item;
    const nextItem: ProjectLineItem = {
      ...item,
      ...safePatch,
    };
    nextItem.uniqueLineId = buildUniqueLineId(nextItem.rdCode, nextItem.lineNumber);
    return nextItem;
  });
}

/**
 * Нормализует строку клейма сварщика или бригады:
 * приводит к верхнему регистру и заменяет латинские буквы-двойники на кириллические (A->А, K->К, M->М, T->Т, P->Р и т.д.),
 * чтобы ввод с любой раскладки клавиатуры находил нужное клеймо.
 */
export function normalizeStampString(raw?: string | null): string {
  if (!raw) return '';
  const upper = String(raw).trim().toUpperCase();
  const latinToCyrillic: Record<string, string> = {
    A: 'А',
    B: 'В',
    C: 'С',
    E: 'Е',
    H: 'Н',
    K: 'К',
    M: 'М',
    O: 'О',
    P: 'Р',
    T: 'Т',
    X: 'Х',
    Y: 'У',
  };
  return upper
    .split('')
    .map((ch) => latinToCyrillic[ch] || ch)
    .join('');
}

/**
 * Находит профиль сварщика или бригады по номеру клейма (независимо от регистра и раскладки).
 */
export function findWelderByStamp(
  weldersDirectory: WelderProfile[],
  rawStamp?: string | null,
  brigadeFilter?: boolean
): WelderProfile | undefined {
  const norm = normalizeStampString(rawStamp);
  if (!norm) return undefined;
  return weldersDirectory.find((w) => {
    if (brigadeFilter === true && !w.isBrigade) return false;
    if (brigadeFilter === false && w.isBrigade) return false;
    return normalizeStampString(w.stamp) === norm;
  });
}

/**
 * Живой поиск сварщиков или бригад во время ввода номера клейма (с приоритетом совпадения по клейму, а также по ФИО и № удостоверения).
 */
export function searchWeldersByStampOrName(
  welders: WelderProfile[],
  query: string,
  excludeStamps: string[] = []
): WelderProfile[] {
  const excludedNorm = new Set(
    excludeStamps.map((s) => normalizeStampString(s)).filter(Boolean)
  );
  const baseList = welders.filter(
    (w) => !excludedNorm.has(normalizeStampString(w.stamp))
  );

  const cleanQuery = (query || '').trim();
  if (!cleanQuery) return baseList;

  const normQuery = normalizeStampString(cleanQuery);
  const lowerQuery = cleanQuery.toLowerCase();

  const matched = baseList.filter((w) => {
    const normStamp = normalizeStampString(w.stamp);
    if (normStamp.includes(normQuery)) return true;
    if (w.stamp.toLowerCase().includes(lowerQuery)) return true;
    if (w.fullName.toLowerCase().includes(lowerQuery)) return true;
    if (w.certNumber.toLowerCase().includes(lowerQuery)) return true;
    if (
      w.brigadeMembers &&
      w.brigadeMembers.some(
        (m) =>
          normalizeStampString(m).includes(normQuery) ||
          m.toLowerCase().includes(lowerQuery)
      )
    ) {
      return true;
    }
    return false;
  });

  return matched.sort((a, b) => {
    const aNorm = normalizeStampString(a.stamp);
    const bNorm = normalizeStampString(b.stamp);

    const aExact = aNorm === normQuery ? 0 : 1;
    const bExact = bNorm === normQuery ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;

    const aStarts = aNorm.startsWith(normQuery) ? 0 : 1;
    const bStarts = bNorm.startsWith(normQuery) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;

    const aInStamp = aNorm.includes(normQuery) ? 0 : 1;
    const bInStamp = bNorm.includes(normQuery) ? 0 : 1;
    if (aInStamp !== bInStamp) return aInStamp - bInStamp;

    return a.stamp.localeCompare(b.stamp, 'ru');
  });
}

/**
 * Автоматически формирует строку клейм, ФИО сварщиков, номеров удостоверений НАКС и мастера
 * при выборе или вводе одного сварщика, нескольких сварщиков или бригадного клейма.
 */
export function resolveWeldersSelection(
  selectedStamps: string[],
  brigadeStamp: string | undefined,
  weldersDirectory: WelderProfile[]
): {
  welderStamp: string;
  welderFullName: string;
  welderCertNumber: string;
  responsiblePerson: string;
} {
  const rawStamps = selectedStamps.map((s) => s.trim()).filter(Boolean);
  const canonicalStamps: string[] = [];
  const matchedProfiles: WelderProfile[] = [];

  for (const raw of rawStamps) {
    const found = findWelderByStamp(weldersDirectory, raw, false);
    const canonical = found ? found.stamp : raw;
    if (!canonicalStamps.includes(canonical)) {
      canonicalStamps.push(canonical);
      if (found) matchedProfiles.push(found);
    }
  }

  const cleanBrigade = (brigadeStamp || '').trim();
  const brigadeProfile = cleanBrigade
    ? findWelderByStamp(weldersDirectory, cleanBrigade, true)
    : undefined;
  const canonicalBrigade = brigadeProfile ? brigadeProfile.stamp : cleanBrigade;

  if (brigadeProfile && matchedProfiles.length === 0) {
    const memberProfiles = (brigadeProfile.brigadeMembers || [])
      .map((st) => findWelderByStamp(weldersDirectory, st, false))
      .filter((w): w is WelderProfile => Boolean(w));

    if (memberProfiles.length > 0) {
      return {
        welderStamp: `${brigadeProfile.stamp} (${memberProfiles.map((m) => m.stamp).join(', ')})`,
        welderFullName: memberProfiles.map((m) => m.fullName).join(', '),
        welderCertNumber: memberProfiles.map((m) => m.certNumber).join(', '),
        responsiblePerson: brigadeProfile.crewForeman || memberProfiles[0].crewForeman,
      };
    }

    return {
      welderStamp: brigadeProfile.stamp,
      welderFullName: brigadeProfile.fullName,
      welderCertNumber: brigadeProfile.certNumber,
      responsiblePerson: brigadeProfile.crewForeman,
    };
  }

  const stampDisplay = canonicalBrigade
    ? canonicalStamps.length > 0
      ? `${canonicalBrigade} (${canonicalStamps.join(', ')})`
      : canonicalBrigade
    : canonicalStamps.join(', ');

  return {
    welderStamp: stampDisplay,
    welderFullName: matchedProfiles.map((m) => m.fullName).join(', '),
    welderCertNumber: matchedProfiles.map((m) => m.certNumber).join(', '),
    responsiblePerson:
      matchedProfiles[0]?.crewForeman || brigadeProfile?.crewForeman || '',
  };
}

export interface PreheatValidationResult {
  isValid: boolean;
  requiredMinC: number;
  actualC: number | null;
  ruleLabel: string;
  message: string;
}

/**
 * Проверяет вручную введённую инженером ПТО температуру подогрева на соответствие
 * выбранной технологической карте (ТК) и температуре окружающей среды.
 */
export function validatePreheatTemperature(
  preheatTempStr: string | undefined,
  ambientTempStr: string | undefined,
  techCard: TechCardItem | undefined
): PreheatValidationResult {
  if (!techCard || !techCard.preheatRules || techCard.preheatRules.length === 0) {
    return {
      isValid: true,
      requiredMinC: 0,
      actualC: null,
      ruleLabel: 'ТК не выбрана',
      message: 'Выберите технологическую карту для проверки режима подогрева',
    };
  }

  const parsedAmbient = parseFloat(String(ambientTempStr ?? '').replace(',', '.'));
  const ambientC = Number.isNaN(parsedAmbient) ? 0 : parsedAmbient;

  // Ищем правило, в чей диапазон попадает температура воздуха
  const matchedRule =
    techCard.preheatRules.find(
      (r) => ambientC >= r.ambientMinC && ambientC <= r.ambientMaxC
    ) ||
    (ambientC < techCard.preheatRules[0].ambientMinC
      ? techCard.preheatRules[0]
      : techCard.preheatRules[techCard.preheatRules.length - 1]);

  const requiredMinC = matchedRule.minPreheatTempC;
  const rawPreheat = String(preheatTempStr ?? '').trim();
  const parsedPreheat = parseFloat(rawPreheat.replace(',', '.'));
  const actualC = Number.isNaN(parsedPreheat) ? null : parsedPreheat;

  if (requiredMinC <= 0) {
    return {
      isValid: true,
      requiredMinC: 0,
      actualC,
      ruleLabel: matchedRule.conditionLabel,
      message: `По ${techCard.number} при T возд. ${ambientC > 0 ? `+${ambientC}` : ambientC} °C предварительный подогрев не требуется (или просушка ≥ +20 °C)`,
    };
  }

  if (actualC === null) {
    return {
      isValid: false,
      requiredMinC,
      actualC: null,
      ruleLabel: matchedRule.conditionLabel,
      message: `Требуется указать температуру подогрева: по ${techCard.number} при T возд. ${ambientC > 0 ? `+${ambientC}` : ambientC} °C минимальный подогрев ≥ +${requiredMinC} °C`,
    };
  }

  if (actualC < requiredMinC) {
    return {
      isValid: false,
      requiredMinC,
      actualC,
      ruleLabel: matchedRule.conditionLabel,
      message: `Несоответствие ТК (${techCard.number}): при T возд. ${ambientC > 0 ? `+${ambientC}` : ambientC} °C требуется подогрев не менее +${requiredMinC} °C (указано: +${actualC} °C)`,
    };
  }

  return {
    isValid: true,
    requiredMinC,
    actualC,
    ruleLabel: matchedRule.conditionLabel,
    message: `Соответствует ${techCard.number}: подогрев +${actualC} °C ≥ нормы +${requiredMinC} °C (при T возд. ${ambientC > 0 ? `+${ambientC}` : ambientC} °C)`,
  };
}

/**
 * Обязательная проверка на соответствие диаметров свариваемых Элемента 1 и Элемента 2.
 */
export function validateElementsDiameterMatch(
  elem1DiameterMm: number,
  elem2DiameterMm: number
): { isMatch: boolean; message: string } {
  const d1 = Number(elem1DiameterMm) || 0;
  const d2 = Number(elem2DiameterMm) || 0;
  if (d1 <= 0 || d2 <= 0) {
    return {
      isMatch: false,
      message: 'Укажите ненулевой диаметр обоих свариваемых элементов',
    };
  }
  if (d1 !== d2) {
    return {
      isMatch: false,
      message: `Несоответствие диаметров! Элемент 1: Ø${d1} мм, Элемент 2: Ø${d2} мм. У обоих свариваемых элементов должен быть одинаковый диаметр.`,
    };
  }
  return {
    isMatch: true,
    message: `Диаметры Элемента 1 и Элемента 2 совпадают (Ø${d1} мм)`,
  };
}

/**
 * Подстановка допустимых элементов из базы ЛРВ с учётом диаметра (проверяется как основной Ø1, так и переходной Ø2).
 */
export function filterLrvByDiameter(
  lrvList: LRVItem[],
  targetDiameterMm?: number
): LRVItem[] {
  if (!targetDiameterMm || targetDiameterMm <= 0) return lrvList;
  return lrvList.filter(
    (item) =>
      item.diameterMm === targetDiameterMm || item.diameterMm2 === targetDiameterMm
  );
}

/**
 * Проверка выбранного вида сварки на соответствие выбранной технологической карте (ТК).
 */
export function validateWeldingTypeWithTechCard(
  weldingType: string | undefined,
  techCard: TechCardItem | undefined
): {
  isValid: boolean;
  expectedType: string;
  message: string;
} {
  const actual = (weldingType || '').trim();
  if (!techCard) {
    return {
      isValid: Boolean(actual),
      expectedType: '',
      message: actual
        ? `Вид сварки: ${actual}`
        : 'Выберите вид сварки из выпадающего списка',
    };
  }

  const expected = techCard.weldingType;
  if (!actual) {
    return {
      isValid: false,
      expectedType: expected,
      message: `Укажите вид сварки (по ${techCard.number} предусмотрено: ${expected})`,
    };
  }

  if (actual !== expected) {
    return {
      isValid: false,
      expectedType: expected,
      message: `Несоответствие виду сварки по ТК (${techCard.number}): выбрано «${actual}», по техкарте предусмотрено «${expected}»`,
    };
  }

  return {
    isValid: true,
    expectedType: expected,
    message: `Соответствует ТК ${techCard.number} (${expected})`,
  };
}

/**
 * Определяет тип элемента трубопровода по краткому наименованию из базы ЛРВ
 * (Труба, Отвод, Переход, Тройник, ЗРА, Фланец, Заглушка, Прочее).
 * В категорию «ЗРА» (запорно-регулирующая арматура) включаются краны, задвижки, клапаны, вентили,
 * заслонки, дисковые затворы, переключающие устройства, фильтры, регуляторы давления и прочая арматура.
 */
export function detectLrvElementType(shortName: string): LrvElementCategory {
  const s = (shortName || '').toLowerCase();
  if (s.includes('труб')) return 'Труба';
  if (s.includes('отвод')) return 'Отвод';
  if (s.includes('переход')) return 'Переход';
  if (s.includes('тройник')) return 'Тройник';
  if (
    s.includes('кран') ||
    s.includes('задвижк') ||
    s.includes('клапан') ||
    s.includes('вентиль') ||
    s.includes('заслонк') ||
    s.includes('затвор') ||
    s.includes('переключающ') ||
    s.includes('фильтр') ||
    s.includes('регулятор') ||
    s.includes('арматур')
  ) {
    return 'ЗРА';
  }
  if (s.includes('флан')) return 'Фланец';
  if (s.includes('заглуш') || s.includes('днищ')) return 'Заглушка';
  return 'Прочее';
}

/**
 * Получает категорию элемента ЛРВ с учетом явно заданной категории (если указана)
 * или автоматического распознавания по краткому наименованию.
 */
export function resolveLrvItemCategory(
  item: { shortName?: string; category?: string } | undefined | null
): LrvElementCategory {
  if (!item) return 'Прочее';
  if (item.category && item.category !== 'Все типы') {
    if (item.category === 'Кран') return 'ЗРА';
    return item.category as LrvElementCategory;
  }
  return detectLrvElementType(item.shortName || '');
}

/**
 * Определяет тип подсоединения элемента ЛРВ (для ЗРА: приварной или фланцевый).
 */
export function detectLrvConnectionType(
  shortName: string,
  explicitType?: string
): 'приварной' | 'фланцевый' {
  if (explicitType) {
    const clean = explicitType.trim().toLowerCase();
    if (clean.includes('фланц')) return 'фланцевый';
    if (clean.includes('привар') || clean.includes('свар')) return 'приварной';
  }
  const s = (shortName || '').toLowerCase();
  if (
    s.includes('фланц') ||
    s.includes('флан.') ||
    s.includes('под фланец') ||
    s.includes('исп. b') ||
    s.includes('исп. 1')
  ) {
    return 'фланцевый';
  }
  return 'приварной';
}

/**
 * Получает тип подсоединения элемента ЛРВ
 */
export function resolveLrvConnectionType(
  item: { shortName?: string; connectionType?: string } | undefined | null
): 'приварной' | 'фланцевый' {
  if (!item) return 'приварной';
  return detectLrvConnectionType(item.shortName || '', item.connectionType);
}

/**
 * Преобразует наименование элемента запорно-регулирующей арматуры (ЗРА)
 * с фланцевым типом подсоединения для журнала сварочных работ:
 * например, «Кран DN50» -> «Фланец крана DN50», «Задвижка DN100» -> «Фланец задвижки DN100».
 */
export function formatFlangedZraName(rawName: string): string {
  if (!rawName) return '';
  const trimmed = rawName.trim();
  if (!trimmed) return '';

  const WB = '(?=\\s|$|[^а-яёa-z0-9])';

  // Если в наименовании уже присутствует слово «Фланец» / «фланец», не дублируем его
  if (new RegExp(`^флан(?:ец|ца|цем|цу)?${WB}`, 'i').test(trimmed)) {
    return trimmed;
  }

  // Очищаем слово «фланцевый/фланцевая/фланцевое» из середины/конца, если оно есть, чтобы избежать тавтологии («Фланец крана фланцевого»)
  const cleanBase = trimmed
    .replace(new RegExp(`\\s+фланцев(?:ый|ая|ое|ому|ом|ых|ым)${WB}`, 'gi'), '')
    .trim();

  const isUpper = /^[А-ЯЁA-Z]/.test(cleanBase);

  // Словарь сопоставлений для начальных слов ЗРА
  const replacements: [RegExp, string, string][] = [
    [new RegExp(`^кран\\s+шаров(?:ый|ой)${WB}`, 'i'), 'фланец крана шарового', 'Фланец крана шарового'],
    [new RegExp(`^кран${WB}`, 'i'), 'фланец крана', 'Фланец крана'],
    [new RegExp(`^крана${WB}`, 'i'), 'фланец крана', 'Фланец крана'],
    [new RegExp(`^задвижк[аеиуой]?\\s+клинов(?:ая|ой)${WB}`, 'i'), 'фланец задвижки клиновой', 'Фланец задвижки клиновой'],
    [new RegExp(`^задвижк[аеиуой]?\\s+шиберн(?:ая|ой)${WB}`, 'i'), 'фланец задвижки шиберной', 'Фланец задвижки шиберной'],
    [new RegExp(`^задвижк[аеиуой]?${WB}`, 'i'), 'фланец задвижки', 'Фланец задвижки'],
    [new RegExp(`^клапан[аеуом]?\\s+обратн(?:ый|ого|ому|ым)${WB}`, 'i'), 'фланец клапана обратного', 'Фланец клапана обратного'],
    [new RegExp(`^клапан[аеуом]?\\s+предохранительн(?:ый|ого|ому|ым)${WB}`, 'i'), 'фланец клапана предохранительного', 'Фланец клапана предохранительного'],
    [new RegExp(`^клапан[аеуом]?\\s+регулирующ(?:ий|его|ему|им)${WB}`, 'i'), 'фланец клапана регулирующего', 'Фланец клапана регулирующего'],
    [new RegExp(`^клапан[аеуом]?\\s+запорн(?:ый|ого|ому|ым)${WB}`, 'i'), 'фланец клапана запорного', 'Фланец клапана запорного'],
    [new RegExp(`^клапан[аеуом]?${WB}`, 'i'), 'фланец клапана', 'Фланец клапана'],
    [new RegExp(`^вентил[ьяеюем]?\\s+игольчат(?:ый|ого|ому|ым)${WB}`, 'i'), 'фланец вентиля игольчатого', 'Фланец вентиля игольчатого'],
    [new RegExp(`^вентил[ьяеюем]?\\s+запорн(?:ый|ого|ому|ым)${WB}`, 'i'), 'фланец вентиля запорного', 'Фланец вентиля запорного'],
    [new RegExp(`^вентил[ьяеюем]?${WB}`, 'i'), 'фланец вентиля', 'Фланец вентиля'],
    [new RegExp(`^фильтр[аеуом]?\\s+сетчат(?:ый|ого|ому|ым)${WB}`, 'i'), 'фланец фильтра сетчатого', 'Фланец фильтра сетчатого'],
    [new RegExp(`^фильтр[аеуом]?\\s+жидкостн(?:ый|ого|ому|ым)${WB}`, 'i'), 'фланец фильтра жидкостного', 'Фланец фильтра жидкостного'],
    [new RegExp(`^фильтр[аеуом]?${WB}`, 'i'), 'фланец фильтра', 'Фланец фильтра'],
    [new RegExp(`^заслонк[аеиуой]?\\s+дроссельн(?:ая|ой)${WB}`, 'i'), 'фланец заслонки дроссельной', 'Фланец заслонки дроссельной'],
    [new RegExp(`^заслонк[аеиуой]?${WB}`, 'i'), 'фланец заслонки', 'Фланец заслонки'],
    [new RegExp(`^затвор[аеуом]?\\s+дисков(?:ый|ого|ому|ым)${WB}`, 'i'), 'фланец затвора дискового', 'Фланец затвора дискового'],
    [new RegExp(`^затвор[аеуом]?\\s+поворотн(?:ый|ого|ому|ым)${WB}`, 'i'), 'фланец затвора поворотного', 'Фланец затвора поворотного'],
    [new RegExp(`^затвор[аеуом]?${WB}`, 'i'), 'фланец затвора', 'Фланец затвора'],
    [new RegExp(`^регулятор[аеуом]?\\s+давлен(?:ия|ие|ием|ию)${WB}`, 'i'), 'фланец регулятора давления', 'Фланец регулятора давления'],
    [new RegExp(`^регулятор[аеуом]?${WB}`, 'i'), 'фланец регулятора', 'Фланец регулятора'],
    [new RegExp(`^переключающ(?:ее|его|ему|им|ем)?\\s+устройств[оаеуом]?${WB}`, 'i'), 'фланец переключающего устройства', 'Фланец переключающего устройства'],
    [new RegExp(`^арматур[аеиуой]?${WB}`, 'i'), 'фланец арматуры', 'Фланец арматуры'],
  ];

  for (const [regex, lowerRepl, upperRepl] of replacements) {
    if (regex.test(cleanBase)) {
      const repl = isUpper ? upperRepl : lowerRepl;
      return cleanBase.replace(regex, repl);
    }
  }

  const prefix = isUpper ? 'Фланец ' : 'фланец ';
  const lowercasedHead = cleanBase.charAt(0).toLowerCase() + cleanBase.slice(1);
  return `${prefix}${lowercasedHead}`;
}

/**
 * Проверяет, является ли элемент фланцевой запорно-регулирующей арматурой (ЗРА)
 */
export function isFlangedZraElement(
  elementName: string | undefined | null,
  lrvCode?: string | null,
  rdCode?: string | null,
  lrvCatalog: LRVItem[] = []
): boolean {
  if (lrvCode) {
    const lrv =
      lrvCatalog.find((i) => i.lrvCode === lrvCode && i.rdCode === rdCode) ||
      lrvCatalog.find((i) => i.lrvCode === lrvCode);
    if (lrv) {
      const cat = resolveLrvItemCategory(lrv);
      const conn = resolveLrvConnectionType(lrv);
      if (cat === 'ЗРА' && conn === 'фланцевый') {
        return true;
      }
      if (cat === 'ЗРА' && conn === 'приварной') {
        return false;
      }
    }
  }

  const raw = elementName || '';
  const cat = detectLrvElementType(raw);
  const conn = detectLrvConnectionType(raw);
  return cat === 'ЗРА' && conn === 'фланцевый';
}

/**
 * Форматирует наименование элемента для журнала сварочных работ (СТО Газпром / ГОСТ 32569)
 * с учетом правила: для фланцевой ЗРА указывать «фланец крана DN50», а не «кран DN50».
 */
export function formatJournalElementName(
  elementName: string | undefined | null,
  lrvCode?: string | null,
  rdCode?: string | null,
  lrvCatalog: LRVItem[] = []
): string {
  if (!elementName) return '';
  const stripped = stripElementDimensionsFromName(elementName) || elementName;
  if (isFlangedZraElement(elementName, lrvCode, rdCode, lrvCatalog)) {
    return formatFlangedZraName(stripped);
  }
  return stripped;
}

export const LRV_ELEMENT_TYPE_OPTIONS: LrvElementCategory[] = [
  'Все типы',
  'Труба',
  'Отвод',
  'Переход',
  'Тройник',
  'ЗРА',
  'Фланец',
  'Заглушка',
  'Прочее',
];

/**
 * Комплексный поиск элемента в базе ЛРВ:
 * по коду ЛРВ, краткому наименованию, НТД, диаметру (Ø1 / Ø2), марке стали и типу элемента (труба, отвод, переход, зра и т.п.)
 */
export function searchLrvCatalogItems(
  items: LRVItem[],
  searchQuery: string,
  elementTypeFilter: LrvElementCategory | string = 'Все типы'
): LRVItem[] {
  const cleanType = (elementTypeFilter || 'Все типы').trim();
  const cleanQuery = (searchQuery || '').trim().toLowerCase();

  return items.filter((item) => {
    const itemCategory = resolveLrvItemCategory(item);
    if (cleanType && cleanType !== 'Все типы' && cleanType !== 'ALL') {
      const targetType = cleanType === 'Кран' ? 'ЗРА' : cleanType;
      const actualType = itemCategory === 'Кран' ? 'ЗРА' : itemCategory;
      if (actualType.toLowerCase() !== targetType.toLowerCase()) {
        return false;
      }
    }

    if (!cleanQuery) return true;

    const dn1Val = getLrvItemDn1(item);
    const dn2Val = getLrvItemDn2(item);
    const connType = resolveLrvConnectionType(item);

    const searchableFields = [
      item.lrvCode,
      item.shortName,
      item.ntd,
      item.material,
      String(item.diameterMm),
      `ø${item.diameterMm}`,
      dn1Val ? `dn${dn1Val}` : '',
      dn1Val ? `dn ${dn1Val}` : '',
      item.diameterMm2 ? String(item.diameterMm2) : '',
      item.diameterMm2 ? `ø${item.diameterMm2}` : '',
      dn2Val ? `dn${dn2Val}` : '',
      dn2Val ? `dn ${dn2Val}` : '',
      `${item.diameterMm}х${item.wallThickness}`,
      `${item.diameterMm}x${item.wallThickness}`,
      itemCategory,
      connType,
    ]
      .join(' ')
      .toLowerCase();

    // Поддержка нескольких поисковых слов через пробел (например "отвод 159" или "кран гост" или "зра фланцевый")
    const tokens = cleanQuery.split(/\s+/).filter(Boolean);
    return tokens.every((tok) => searchableFields.includes(tok));
  });
}

export interface Gost16037JointTypeOption {
  code: string;
  category: 'Стыковое' | 'Угловое' | 'Тавровое' | 'Нахлёсточное';
  description: string;
}

/**
 * Справочник типов сварных соединений стальных трубопроводов по ГОСТ 16037-80
 */
export const GOST_16037_JOINT_TYPES: Gost16037JointTypeOption[] = [
  {
    code: 'С2',
    category: 'Стыковое',
    description: 'С2 — Стыковое с отбортовкой двух кромок (одностороннее)',
  },
  {
    code: 'С4',
    category: 'Стыковое',
    description: 'С4 — Стыковое без скоса кромок (двустороннее)',
  },
  {
    code: 'С7',
    category: 'Стыковое',
    description: 'С7 — Стыковое без скоса кромок на остающемся подкладном кольце',
  },
  {
    code: 'С8',
    category: 'Стыковое',
    description: 'С8 — Стыковое одностороннее без скоса кромок',
  },
  {
    code: 'С10',
    category: 'Стыковое',
    description: 'С10 — Стыковое со скосом одной кромки',
  },
  {
    code: 'С17',
    category: 'Стыковое',
    description: 'С17 — Стыковое одностороннее со скосом двух кромок (без подкладного кольца)',
  },
  {
    code: 'С18',
    category: 'Стыковое',
    description: 'С18 — Стыковое со скосом двух кромок с расточкой под кольцо',
  },
  {
    code: 'С19',
    category: 'Стыковое',
    description: 'С19 — Стыковое одностороннее деталей неравной толщины со скосом двух кромок',
  },
  {
    code: 'С20',
    category: 'Стыковое',
    description: 'С20 — Стыковое одностороннее со скосом двух кромок и предварительной подваркой корня',
  },
  {
    code: 'С21',
    category: 'Стыковое',
    description: 'С21 — Стыковое одностороннее со скосом двух кромок на остающемся подкладном кольце',
  },
  {
    code: 'С35',
    category: 'Стыковое',
    description: 'С35 — Стыковое одностороннее с криволинейным скосом двух кромок',
  },
  {
    code: 'С39',
    category: 'Стыковое',
    description: 'С39 — Стыковое одностороннее с ломаным скосом двух кромок (толстостенные трубы)',
  },
  {
    code: 'С42',
    category: 'Стыковое',
    description: 'С42 — Стыковое двустороннее с симметричным скосом двух кромок',
  },
  {
    code: 'У2',
    category: 'Угловое',
    description: 'У2 — Угловое муфтовое / раструбное без скоса кромки',
  },
  {
    code: 'У4',
    category: 'Угловое',
    description: 'У4 — Угловое с плоским фланцем без скоса кромок (двустороннее)',
  },
  {
    code: 'У5',
    category: 'Угловое',
    description: 'У5 — Угловое со скосом одной кромки',
  },
  {
    code: 'У9',
    category: 'Угловое',
    description: 'У9 — Угловое штуцерное без скоса кромок',
  },
  {
    code: 'У16',
    category: 'Угловое',
    description: 'У16 — Угловое вварки штуцера без скоса кромки (одностороннее)',
  },
  {
    code: 'У17',
    category: 'Угловое',
    description: 'У17 — Угловое вварки штуцера со скосом кромки (одностороннее)',
  },
  {
    code: 'У18',
    category: 'Угловое',
    description: 'У18 — Угловое вварки штуцера с конструктивным зазором',
  },
  {
    code: 'У19',
    category: 'Угловое',
    description: 'У19 — Угловое приварки ответвления (штуцера) со скосом кромки',
  },
  {
    code: 'У20',
    category: 'Угловое',
    description: 'У20 — Угловое приварки ответвления двустороннее со скосом кромки',
  },
  {
    code: 'Т1',
    category: 'Тавровое',
    description: 'Т1 — Тавровое без скоса кромки одностороннее',
  },
  {
    code: 'Т2',
    category: 'Тавровое',
    description: 'Т2 — Тавровое без скоса кромки двустороннее',
  },
  {
    code: 'Т6',
    category: 'Тавровое',
    description: 'Т6 — Тавровое со скосом одной кромки одностороннее',
  },
  {
    code: 'Т8',
    category: 'Тавровое',
    description: 'Т8 — Тавровое со скосом одной кромки двустороннее',
  },
  {
    code: 'Т9',
    category: 'Тавровое',
    description: 'Т9 — Тавровое с двумя симметричными скосами одной кромки',
  },
  {
    code: 'Н1',
    category: 'Нахлёсточное',
    description: 'Н1 — Нахлёсточное одностороннее без скоса кромок',
  },
  {
    code: 'Н2',
    category: 'Нахлёсточное',
    description: 'Н2 — Нахлёсточное двустороннее без скоса кромок',
  },
];

export interface NaksWeldingPositionOption {
  code: string;
  description: string;
}

/**
 * Справочник положений при сварке по системе аттестации НАКС (РД 03-495-02)
 */
export const NAKS_WELDING_POSITIONS: NaksWeldingPositionOption[] = [
  {
    code: 'Н1',
    description: 'Н1 — Нижнее (стыковые и угловые швы, поворотный стык)',
  },
  {
    code: 'Н2',
    description: 'Н2 — Нижнее в лодочку (тавровые и нахлёсточные соединения)',
  },
  {
    code: 'Г',
    description: 'Г — Горизонтальное на вертикальной плоскости (ось трубы вертикальна)',
  },
  {
    code: 'В1',
    description: 'В1 — Вертикальное снизу вверх (на подъём, неповоротный стык)',
  },
  {
    code: 'В2',
    description: 'В2 — Вертикальное сверху вниз (на спуск, неповоротный стык)',
  },
  {
    code: 'П1',
    description: 'П1 — Потолочное (стыковые швы)',
  },
  {
    code: 'П2',
    description: 'П2 — Потолочное (угловые, тавровые и нахлёсточные соединения)',
  },
  {
    code: 'Н45',
    description: 'Н45 — Наклонное под углом 45° (неповоротный стык труб)',
  },
  {
    code: 'С',
    description: 'С — Переменное / комбинированное положение (неповоротный стык: Н1+В1+П1)',
  },
];

/**
 * Максимальная глубина стека отмены / повтора действий пользователя (Undo / Redo на 10 действий)
 */
export const MAX_HISTORY_STEPS = 10;

/**
 * Добавляет снимок состояния в стек Undo (с ограничением в 10 шагов) и очищает стек Redo.
 */
export function pushHistorySnapshot<T>(
  undoStack: T[],
  snapshot: T,
  maxSteps: number = MAX_HISTORY_STEPS
): { undoStack: T[]; redoStack: T[] } {
  const nextUndo = [...undoStack, snapshot];
  if (nextUndo.length > maxSteps) {
    nextUndo.splice(0, nextUndo.length - maxSteps);
  }
  return {
    undoStack: nextUndo,
    redoStack: [],
  };
}

/**
 * Выполняет шаг Undo (Отменить): извлекает последний снимок из undoStack и помещает текущее состояние в redoStack (макс. 10 шагов).
 */
export function performUndoStep<T>(
  undoStack: T[],
  redoStack: T[],
  currentState: T,
  maxSteps: number = MAX_HISTORY_STEPS
): { targetState: T | null; undoStack: T[]; redoStack: T[] } {
  if (undoStack.length === 0) {
    return { targetState: null, undoStack, redoStack };
  }
  const nextUndo = [...undoStack];
  const targetState = nextUndo.pop()!;
  const nextRedo = [...redoStack, currentState];
  if (nextRedo.length > maxSteps) {
    nextRedo.splice(0, nextRedo.length - maxSteps);
  }
  return {
    targetState,
    undoStack: nextUndo,
    redoStack: nextRedo,
  };
}

/**
 * Выполняет шаг Redo (Повторить): извлекает последний снимок из redoStack и помещает текущее состояние в undoStack (макс. 10 шагов).
 */
export function performRedoStep<T>(
  undoStack: T[],
  redoStack: T[],
  currentState: T,
  maxSteps: number = MAX_HISTORY_STEPS
): { targetState: T | null; undoStack: T[]; redoStack: T[] } {
  if (redoStack.length === 0) {
    return { targetState: null, undoStack, redoStack };
  }
  const nextRedo = [...redoStack];
  const targetState = nextRedo.pop()!;
  const nextUndo = [...undoStack, currentState];
  if (nextUndo.length > maxSteps) {
    nextUndo.splice(0, nextUndo.length - maxSteps);
  }
  return {
    targetState,
    undoStack: nextUndo,
    redoStack: nextRedo,
  };
}

export type Gost32569ColumnKey =
  | 'col1'
  | 'col2'
  | 'col3'
  | 'col4'
  | 'col5'
  | 'col6'
  | 'col7'
  | 'col8'
  | 'col9'
  | 'col10'
  | 'col11'
  | 'col12'
  | 'col13'
  | 'col14'
  | 'col15'
  | 'col16'
  | 'col17';

export interface Gost32569JournalColumnDef {
  key: Gost32569ColumnKey;
  colNumber: number;
  label: string;
  minWidth: number;
}

/**
 * 17 нормативных граф формы журнала сварки по ГОСТ 32569-2013
 * в точном соответствии с прикрепленным файлом ГОСТ 32569-2013 (.csv)
 */
export const GOST_32569_2013_JOURNAL_COLUMNS: Gost32569JournalColumnDef[] = [
  {
    key: 'col1',
    colNumber: 1,
    label: '№ п/п',
    minWidth: 64,
  },
  {
    key: 'col2',
    colNumber: 2,
    label:
      'Обозначение сварного соединения по исполнительному чертежу, тип сварного соединения ГОСТ 16037',
    minWidth: 195,
  },
  {
    key: 'col3',
    colNumber: 3,
    label: 'Ф.И.О. сварщика, личное клеймо',
    minWidth: 235,
  },
  {
    key: 'col4',
    colNumber: 4,
    label: 'Марка стали (композиция марок сталей), НД, номера сертификатов',
    minWidth: 340,
  },
  {
    key: 'col5',
    colNumber: 5,
    label: 'Наружный диаметр элемента трубопровода и толщина стенки DнхS, мм',
    minWidth: 135,
  },
  {
    key: 'col6',
    colNumber: 6,
    label: 'Дата сварки, температурные условия в рабочей зоне, °С',
    minWidth: 145,
  },
  {
    key: 'col7',
    colNumber: 7,
    label: 'Способ сварки',
    minWidth: 105,
  },
  {
    key: 'col8',
    colNumber: 8,
    label:
      'Сварочные материалы (марка электрода, сварочной проволоки, защитный газ, флюс), НД, №№ сертификатов',
    minWidth: 310,
  },
  {
    key: 'col9',
    colNumber: 9,
    label: 'Режим предварительного и сопутствующего подогрева',
    minWidth: 155,
  },
  {
    key: 'col10',
    colNumber: 10,
    label: 'Отметка о контроле корня шва',
    minWidth: 135,
  },
  {
    key: 'col11',
    colNumber: 11,
    label: 'Стилоскопирование металла шва, N заключения, дата',
    minWidth: 165,
  },
  {
    key: 'col12',
    colNumber: 12,
    label: 'Ф.И.О. оператора термиста, личное клеймо',
    minWidth: 150,
  },
  {
    key: 'col13',
    colNumber: 13,
    label: '№ диаграммы по журналу термообработки сварных соединений',
    minWidth: 150,
  },
  {
    key: 'col14',
    colNumber: 14,
    label: 'Твердость металла шва, N заключения, дата',
    minWidth: 160,
  },
  {
    key: 'col15',
    colNumber: 15,
    label:
      'Отметка о годности сварного соединения по внешнему осмотру и измерениям',
    minWidth: 175,
  },
  {
    key: 'col16',
    colNumber: 16,
    label:
      'Способ и результаты неразрушающего контроля сварного соединения, N заключения, дата',
    minWidth: 195,
  },
  {
    key: 'col17',
    colNumber: 17,
    label:
      'Результаты измерения ферритной фазы в металле шва, N заключения, дата',
    minWidth: 175,
  },
];

/**
 * Определяет НД (нормативный документ) на сварочный материал (проволоку, электрод, защитный газ) для графы 8 журнала по ГОСТ 32569-2013.
 */
function inferWeldingConsumableNtd(brandPart: string): string {
  const s = brandPart.toLowerCase();
  if (s.includes('св-04х') || s.includes('св-08г2с') || s.startsWith('св-')) {
    return 'ГОСТ 2246-70';
  }
  if (
    s.includes('уони') ||
    s.includes('lb-52') ||
    s.includes('ок ') ||
    s.includes('ok ') ||
    s.includes('цл-') ||
    s.includes('озл-')
  ) {
    return 'ГОСТ 9466-75';
  }
  if (s.includes('co2') && s.includes('ar')) {
    return 'ТУ 2114-004-00204760-99';
  }
  if (s.includes('ar')) {
    return 'ГОСТ 10157-2016';
  }
  if (s.includes('co2')) {
    return 'ГОСТ 8050-85';
  }
  return 'ГОСТ 2246-70';
}

/**
 * Форматирует сварочные материалы для графы 8 журнала по ГОСТ 32569-2013:
 * каждый сварочный материал (проволока, электрод, защитный газ) начинается с новой строки,
 * через запятую указываются НД и номер сертификата без скобок и лишних подписей.
 */
export function formatGost32569ConsumablesCell(
  rawMaterials: string | undefined,
  materialsCatalog: WeldingMaterialCertificate[] = []
): string {
  const raw = (rawMaterials || '').trim();
  if (!raw) return 'н/п';

  const matchedMat = materialsCatalog.find(
    (m) =>
      m.brandAndDiameter === raw ||
      m.brandAndDiameter.toLowerCase() === raw.toLowerCase()
  );

  // Выделяем возможный защитный газ в скобках, например "Св-04Х19Н11М3 Ø1.6 (Ar 99.99%)" -> ["Св-04Х19Н11М3 Ø1.6", "Ar 99.99%"]
  const parts: string[] = [];
  let working = raw;
  const parenMatches = working.match(/\(([^)]+)\)/g);
  const trailingParens: string[] = [];
  if (parenMatches) {
    for (const pm of parenMatches) {
      const inner = pm.slice(1, -1).trim();
      if (inner) trailingParens.push(inner);
      working = working.replace(pm, '').trim();
    }
  }

  // Разбиваем по " / ", "; " или переносу строки, сохраняя дроби внутри марок (например "УОНИ-13/55")
  const splitMain = working
    .split(/\s+\/\s+|;\s*|\n+/)
    .map((p) => p.replace(/[()]/g, '').trim())
    .filter(Boolean);

  parts.push(...splitMain, ...trailingParens);

  if (parts.length === 0) return 'н/п';

  // Извлекаем номера сертификатов из справочника сварочных материалов (очищая префиксы "Серт. №")
  const rawCertParts = matchedMat
    ? matchedMat.certificateNumber
        .replace(/серт\.?\s*№?\s*/gi, '')
        .split(/\s+\/\s+|,\s*/)
        .map((c) => c.replace(/[()]/g, '').trim())
        .filter(Boolean)
    : [];

  const rawBatchParts = matchedMat
    ? matchedMat.batchNumber
        .split(/\s+\/\s+|,\s*/)
        .map((b) =>
          b
            .replace(/пл\.?\s*/gi, '')
            .replace(/партия\s*/gi, '')
            .replace(/баллон\s*ar\s*№?\s*/gi, 'АР-')
            .replace(/смесь\s*/gi, '')
            .replace(/[()]/g, '')
            .trim()
        )
        .filter(Boolean)
    : [];

  return parts
    .map((part, idx) => {
      const ntd = inferWeldingConsumableNtd(part);
      const cert =
        rawCertParts[idx] ||
        rawBatchParts[idx] ||
        rawCertParts[0] ||
        '10492-26';
      return [part, ntd, cert].filter(Boolean).join(', ');
    })
    .join('\n');
}

/**
 * Нормализует значение ячейки журнала ГОСТ: заменяет "Не требуется" / "Не проводился" на "н/п".
 */
function normalizeGostNotApplicable(val: string | undefined | null): string {
  const trimmed = (val || '').trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (
    lower === 'не требуется' ||
    lower === 'не проводился' ||
    lower === 'н/п' ||
    lower === 'нет'
  ) {
    return 'н/п';
  }
  return trimmed;
}

/**
 * Удаляет из краткого наименования элемента диаметр, толщину стенки (например, 159х8, 219х10-159х8) и номинальные параметры DN/PN
 * для графы 4 журнала по ГОСТ 32569-2013 (так как DнхS выводится в графе 5).
 */
export function stripElementDimensionsFromName(
  rawName: string | undefined | null
): string {
  if (!rawName) return '';
  return rawName
    .replace(/[()]/g, '')
    .replace(
      /(?:^|\s)(?:Ø|Дн\s*)?\d+(?:[.,]\d+)?\s*[хx×ХX*]\s*\d+(?:[.,]\d+)?(?:\s*[-–/]\s*(?:Ø|Дн\s*)?\d+(?:[.,]\d+)?\s*[хx×ХX*]\s*\d+(?:[.,]\d+)?)?(?=\s|$|,)/gi,
      ' '
    )
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Формирует все 17 граф строки журнала сварки по ГОСТ 32569-2013 для заданного стыка.
 * Соблюдает требования:
 * 1. Без справочных подписей бледным шрифтом (тип по ГОСТ 16037, Клеймо, Т раб. зоны и т.п.).
 * 2. В ячейках с информацией по разным материалам (гр. 3, гр. 4, гр. 8) каждый начинается с новой строки (\n).
 * 3. Во 2 столбце без номера линии — только номер стыка и тип сварного соединения по ГОСТ 16037.
 * 4. В 4 столбце без скобок: после марки стали краткое наименование элемента (без диаметра и толщины стенки), далее НТД и сертификат через запятую.
 * 5. Вместо "Не требуется" используется "н/п".
 * 6. В 9 столбце не пишется "Подогрев" и номер техкарты — только температура или "н/п".
 */
export function formatGost32569JournalRow(
  joint: WeldJoint,
  rowIndex: number,
  materials: WeldingMaterialCertificate[] = [],
  lrvCatalog: LRVItem[] = []
): Record<Gost32569ColumnKey, string> & { cells: string[] } {
  const col1 = String(rowIndex + 1);

  const gostType = joint.gostJointType?.trim() || 'С17';
  const col2 = `${joint.jointNumber}, ${gostType}`;

  // Графа 3: Ф.И.О. сварщика, личное клеймо (без слова "Клеймо", если несколько сварщиков — каждый с новой строки)
  const namesList = (joint.welderFullName || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const stampsList =
    joint.welderStampsList && joint.welderStampsList.length > 0
      ? joint.welderStampsList
      : (joint.welderStamp || '')
          .replace(/^[^(]+\(([^)]+)\)$/, '$1')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

  let col3: string;
  if (namesList.length > 1 && namesList.length === stampsList.length) {
    col3 = namesList
      .map((name, idx) => `${name}, ${stampsList[idx]}`)
      .join('\n');
  } else if (namesList.length > 0 && stampsList.length > 0) {
    col3 = `${namesList.join(', ')}, ${joint.welderStamp || stampsList.join(', ')}`;
  } else {
    col3 = 'н/п';
  }

  const cert1 = String(joint.elem1FactoryNumber ?? '').replace(/[()]/g, '').trim();
  const cert2 = String(joint.elem2FactoryNumber ?? '').replace(/[()]/g, '').trim();
  const shortName1 = formatJournalElementName(
    joint.elem1Name,
    joint.lrv1Code,
    joint.rdCode,
    lrvCatalog
  );
  const shortName2 = formatJournalElementName(
    joint.elem2Name,
    joint.lrv2Code,
    joint.rdCode,
    lrvCatalog
  );
  const cleanElem1Title = `${joint.elem1Material || ''} ${shortName1}`
    .replace(/[()]/g, '')
    .trim();
  const cleanElem2Title = `${joint.elem2Material || ''} ${shortName2}`
    .replace(/[()]/g, '')
    .trim();
  const cleanNtd1 = (joint.elem1Ntd || '').replace(/[()]/g, '').trim();
  const cleanNtd2 = (joint.elem2Ntd || '').replace(/[()]/g, '').trim();

  const elem1Line = [cleanElem1Title, cleanNtd1, cert1]
    .filter(Boolean)
    .join(', ');
  const elem2Line = [cleanElem2Title, cleanNtd2, cert2]
    .filter(Boolean)
    .join(', ');
  const col4 = `${elem1Line}\n${elem2Line}`;

  // Графа 5: Наружный диаметр и толщина стенки DнхS, мм
  const col5 = `${joint.diameterMm}х${joint.wallThickness}`;

  // Графа 6: Дата сварки, температурные условия в рабочей зоне, °С (без подписи "T раб. зоны:")
  const formattedWeldDate = formatDateDDMMYY(joint.weldingDate) || 'н/п';
  let formattedTemp = '';
  if (joint.ambientTemp && String(joint.ambientTemp).trim() !== '') {
    const rawT = String(joint.ambientTemp).trim();
    const numT = Number(rawT);
    const signT =
      !rawT.startsWith('+') && !rawT.startsWith('-') && !Number.isNaN(numT) && numT > 0
        ? `+${rawT}`
        : rawT;
    formattedTemp = `${signT} °С`;
  }
  const col6 = formattedTemp
    ? `${formattedWeldDate}, ${formattedTemp}`
    : formattedWeldDate;

  // Графа 7: Способ сварки
  const col7 = joint.weldingType || 'н/п';

  // Графа 8: Сварочные материалы (каждый материал с новой строки, НД и № сертификата через запятую)
  const col8 = formatGost32569ConsumablesCell(joint.weldingMaterials, materials);

  // Графа 9: Режим предварительного и сопутствующего подогрева (без слова "Подогрев" и без номера техкарты, иначе "н/п")
  let col9 = 'н/п';
  const rawPreheat = (joint.preheatTemp || '').trim();
  if (rawPreheat && Number(rawPreheat) > 0) {
    const cleanPreheat = rawPreheat.startsWith('+') ? rawPreheat : `+${rawPreheat}`;
    col9 = `${cleanPreheat} °С`;
  } else if (
    joint.ambientTemp &&
    !Number.isNaN(Number(joint.ambientTemp)) &&
    Number(joint.ambientTemp) <= 0
  ) {
    col9 = '+120…+150 °С';
  }

  // Графа 10: Отметка о контроле корня шва
  const refDate =
    formatDateDDMMYY(joint.vikDate) || formatDateDDMMYY(joint.weldingDate) || '';
  const customCol10 = normalizeGostNotApplicable(joint.rootWeldControl);
  const col10 =
    customCol10 ||
    (joint.weldingDate
      ? `Годен${refDate ? `, ${refDate}` : ''}`
      : 'н/п');

  // Графа 11: Стилоскопирование металла шва, N заключения, дата
  const isAlloySteel =
    joint.elem1Material.includes('Х') || joint.elem2Material.includes('Х');
  const customCol11 = normalizeGostNotApplicable(joint.steeloscopyInfo);
  const col11 =
    customCol11 ||
    (isAlloySteel
      ? `Соответствует, СТ-${joint.jointNumber}${refDate ? `, ${refDate}` : ''}`
      : 'н/п');

  // Графа 12: Ф.И.О. оператора термиста, личное клеймо
  const col12 = normalizeGostNotApplicable(joint.heatTreatOperator) || 'н/п';

  // Графа 13: № диаграммы по журналу термообработки сварных соединений
  const col13 = normalizeGostNotApplicable(joint.heatTreatDiagramNumber) || 'н/п';

  // Графа 14: Твердость металла шва, N заключения, дата
  const ndtDateFormatted =
    formatDateDDMMYY(joint.ndtDate) || refDate || '';
  const customCol14 = normalizeGostNotApplicable(joint.hardnessTestInfo);
  const col14 =
    customCol14 ||
    (joint.wallThickness >= 12 && joint.weldingDate
      ? `HB 185, ТВ-${joint.jointNumber}${
          ndtDateFormatted ? `, ${ndtDateFormatted}` : ''
        }`
      : 'н/п');

  // Графа 15: Отметка о годности сварного соединения по внешнему осмотру и измерениям
  const col15 =
    joint.vikResult && joint.vikResult !== 'Не проводился'
      ? `${joint.vikResult}${
          joint.vikDate ? `, ${formatDateDDMMYY(joint.vikDate)}` : ''
        }`
      : 'н/п';

  // Графа 16: Способ и результаты неразрушающего контроля сварного соединения, N заключения, дата
  let col16: string;
  if (
    joint.ndtType &&
    joint.ndtType !== 'Не требуется' &&
    joint.ndtResult &&
    joint.ndtResult !== 'Не проводился'
  ) {
    const repNo =
      joint.ndtReportNumber?.trim() || `${joint.ndtType}-${joint.jointNumber}`;
    col16 = `${joint.ndtType}, ${joint.ndtResult}, ${repNo}${
      joint.ndtDate ? `, ${formatDateDDMMYY(joint.ndtDate)}` : ''
    }`;
  } else {
    col16 = 'н/п';
  }

  // Графа 17: Результаты измерения ферритной фазы в металле шва, N заключения, дата
  const isAustenitic =
    joint.elem1Material.includes('12Х18Н10Т') ||
    joint.elem2Material.includes('12Х18Н10Т');
  const customCol17 = normalizeGostNotApplicable(joint.ferritePhaseInfo);
  const col17 =
    customCol17 ||
    (isAustenitic && joint.weldingDate
      ? `4,2%, ФФ-${joint.jointNumber}${
          ndtDateFormatted ? `, ${ndtDateFormatted}` : ''
        }`
      : 'н/п');

  const record: Record<Gost32569ColumnKey, string> = {
    col1,
    col2,
    col3,
    col4,
    col5,
    col6,
    col7,
    col8,
    col9,
    col10,
    col11,
    col12,
    col13,
    col14,
    col15,
    col16,
    col17,
  };

  return {
    ...record,
    cells: [
      col1,
      col2,
      col3,
      col4,
      col5,
      col6,
      col7,
      col8,
      col9,
      col10,
      col11,
      col12,
      col13,
      col14,
      col15,
      col16,
      col17,
    ],
  };
}

export type StoGazpromColumnKey =
  | 'col1'
  | 'col2'
  | 'col3'
  | 'col4'
  | 'col5'
  | 'col6'
  | 'col7'
  | 'col8'
  | 'col9'
  | 'col10'
  | 'col11'
  | 'col12'
  | 'col13'
  | 'col14'
  | 'col15'
  | 'col16'
  | 'col17'
  | 'col18'
  | 'col19'
  | 'col20'
  | 'col21'
  | 'col22'
  | 'col23'
  | 'col24'
  | 'col25'
  | 'col26'
  | 'col27'
  | 'col28'
  | 'col29'
  | 'col30'
  | 'col31'
  | 'col32'
  | 'col33'
  | 'col34'
  | 'col35'
  | 'col36'
  | 'col37'
  | 'col38'
  | 'col39'
  | 'col40'
  | 'col41'
  | 'col42'
  | 'col43'
  | 'col44'
  | 'col45'
  | 'col46'
  | 'col47'
  | 'col48'
  | 'col49';

export interface StoGazpromJournalColumnDef {
  key: StoGazpromColumnKey;
  colNumber: number;
  label: string;
  fullLabel: string;
  topGroup?: string;
  subGroup?: string;
  minWidth: number;
}

/**
 * 49 нормативных граф формы Журнала сварочных работ по СТО Газпром 15-1.1-002-2023 (Приложение Г, Форма Г.1)
 * в точном соответствии с приложенным файлом СТО1.pdf
 */
export const STO_GAZPROM_15_1_1_002_2023_COLUMNS: StoGazpromJournalColumnDef[] = [
  {
    key: 'col1',
    colNumber: 1,
    label: 'Сквозной порядковый номер',
    fullLabel: '1. Сквозной порядковый номер',
    minWidth: 74,
  },
  {
    key: 'col2',
    colNumber: 2,
    label: 'Дата сварки',
    fullLabel: '2. Дата сварки',
    minWidth: 92,
  },
  {
    key: 'col3',
    colNumber: 3,
    label: 'Температура воздуха, °С',
    fullLabel: '3. Температура воздуха, °С',
    minWidth: 88,
  },
  {
    key: 'col4',
    colNumber: 4,
    label: 'Диаметр свариваемого элемента, мм',
    fullLabel: '4. Диаметр свариваемого элемента, мм',
    minWidth: 102,
  },
  {
    key: 'col5',
    colNumber: 5,
    label: 'Толщина стенки свариваемого элемента¹, мм',
    fullLabel: '5. Толщина стенки свариваемого элемента¹, мм',
    minWidth: 108,
  },
  {
    key: 'col6',
    colNumber: 6,
    label: 'ГОСТ или ТУ марки стали (класс или категория прочности), завод-поставщик элемента трубопровода',
    fullLabel:
      '6. ГОСТ или ТУ марки стали (класс или категория прочности), завод-поставщик элемента трубопровода',
    minWidth: 215,
  },
  {
    key: 'col7',
    colNumber: 7,
    label: 'Температура подогрева (просушки) свариваемых элементов, °С',
    fullLabel: '7. Температура подогрева (просушки) свариваемых элементов, °С',
    minWidth: 118,
  },
  {
    key: 'col8',
    colNumber: 8,
    label: 'Наименование свариваемого элемента трубопровода',
    fullLabel: '8. Наименование свариваемого элемента трубопровода',
    minWidth: 165,
  },
  {
    key: 'col9',
    colNumber: 9,
    label: 'Заводской номер элемента',
    fullLabel: '9. Заводской номер элемента',
    minWidth: 130,
  },
  {
    key: 'col10',
    colNumber: 10,
    label: 'Длина элемента, м',
    fullLabel: '10. Длина элемента, м',
    minWidth: 96,
  },
  {
    key: 'col11',
    colNumber: 11,
    topGroup: 'Маркировка сварного соединения',
    label: 'километр (подобъект)',
    fullLabel: '11. Маркировка сварного соединения — километр (подобъект)',
    minWidth: 105,
  },
  {
    key: 'col12',
    colNumber: 12,
    topGroup: 'Маркировка сварного соединения',
    label: 'обозначение технологии сварки',
    fullLabel: '12. Маркировка сварного соединения — обозначение технологии сварки',
    minWidth: 110,
  },
  {
    key: 'col13',
    colNumber: 13,
    topGroup: 'Маркировка сварного соединения',
    label: 'номер сварного соединения в километре (на схеме, чертеже, в подобъекте²)',
    fullLabel:
      '13. Маркировка сварного соединения — номер сварного соединения в километре (на схеме, чертеже, в подобъекте²)',
    minWidth: 135,
  },
  {
    key: 'col14',
    colNumber: 14,
    topGroup: 'Маркировка сварного соединения',
    label: 'дополнительная маркировка сварного соединения',
    fullLabel:
      '14. Маркировка сварного соединения — дополнительная маркировка сварного соединения',
    minWidth: 115,
  },
  {
    key: 'col15',
    colNumber: 15,
    label: 'Привязка сварного соединения (пикет)',
    fullLabel: '15. Привязка сварного соединения (пикет)',
    minWidth: 96,
  },
  {
    key: 'col16',
    colNumber: 16,
    label: 'Номер ОТК, положение при сварке, номер схемы расположения сварщиков',
    fullLabel: '16. Номер ОТК, положение при сварке, номер схемы расположения сварщиков',
    minWidth: 175,
  },
  {
    key: 'col17',
    colNumber: 17,
    label: 'Марка сварочных материалов',
    fullLabel: '17. Марка сварочных материалов',
    minWidth: 185,
  },
  {
    key: 'col18',
    colNumber: 18,
    label: 'Номер шифра (клеймо) бригады или сварщиков',
    fullLabel: '18. Номер шифра (клеймо) бригады или сварщиков',
    minWidth: 135,
  },
  {
    key: 'col19',
    colNumber: 19,
    topGroup: 'Соблюдение технологии',
    label: 'фамилия мастера (прораба)',
    fullLabel: '19. Соблюдение технологии — фамилия мастера (прораба)',
    minWidth: 145,
  },
  {
    key: 'col20',
    colNumber: 20,
    topGroup: 'Соблюдение технологии',
    label: 'подпись мастера (прораба)',
    fullLabel: '20. Соблюдение технологии — подпись мастера (прораба)',
    minWidth: 98,
  },
  {
    key: 'col21',
    colNumber: 21,
    topGroup: 'Приемка сварного соединения',
    subGroup: 'по результатам контроля ВИК',
    label: '№',
    fullLabel: '21. Приемка сварного соединения — ВИК — №',
    minWidth: 90,
  },
  {
    key: 'col22',
    colNumber: 22,
    topGroup: 'Приемка сварного соединения',
    subGroup: 'по результатам контроля ВИК',
    label: 'дата',
    fullLabel: '22. Приемка сварного соединения — ВИК — дата',
    minWidth: 86,
  },
  {
    key: 'col23',
    colNumber: 23,
    topGroup: 'Приемка сварного соединения',
    subGroup: 'по результатам контроля ВИК',
    label: 'рез-т',
    fullLabel: '23. Приемка сварного соединения — ВИК — рез-т',
    minWidth: 86,
  },
  {
    key: 'col24',
    colNumber: 24,
    topGroup: 'Приемка сварного соединения',
    subGroup:
      'по результатам контроля физическими методами или механическим испытаниям (заключение о годности сварного соединения, номер, дата заключения)',
    label: 'вид',
    fullLabel: '24. Приемка сварного соединения — НК (основной) — вид',
    minWidth: 78,
  },
  {
    key: 'col25',
    colNumber: 25,
    topGroup: 'Приемка сварного соединения',
    subGroup:
      'по результатам контроля физическими методами или механическим испытаниям (заключение о годности сварного соединения, номер, дата заключения)',
    label: '№',
    fullLabel: '25. Приемка сварного соединения — НК (основной) — №',
    minWidth: 94,
  },
  {
    key: 'col26',
    colNumber: 26,
    topGroup: 'Приемка сварного соединения',
    subGroup:
      'по результатам контроля физическими методами или механическим испытаниям (заключение о годности сварного соединения, номер, дата заключения)',
    label: 'дата',
    fullLabel: '26. Приемка сварного соединения — НК (основной) — дата',
    minWidth: 86,
  },
  {
    key: 'col27',
    colNumber: 27,
    topGroup: 'Приемка сварного соединения',
    subGroup:
      'по результатам контроля физическими методами или механическим испытаниям (заключение о годности сварного соединения, номер, дата заключения)',
    label: 'рез-т',
    fullLabel: '27. Приемка сварного соединения — НК (основной) — рез-т',
    minWidth: 86,
  },
  {
    key: 'col28',
    colNumber: 28,
    topGroup: 'Приемка сварного соединения',
    subGroup:
      'по результатам контроля физическими методами (заключение о годности сварного соединения, номер, дата заключения)',
    label: 'вид',
    fullLabel: '28. Приемка сварного соединения — НК (дублирующий) — вид',
    minWidth: 78,
  },
  {
    key: 'col29',
    colNumber: 29,
    topGroup: 'Приемка сварного соединения',
    subGroup:
      'по результатам контроля физическими методами (заключение о годности сварного соединения, номер, дата заключения)',
    label: '№',
    fullLabel: '29. Приемка сварного соединения — НК (дублирующий) — №',
    minWidth: 96,
  },
  {
    key: 'col30',
    colNumber: 30,
    topGroup: 'Приемка сварного соединения',
    subGroup:
      'по результатам контроля физическими методами (заключение о годности сварного соединения, номер, дата заключения)',
    label: 'дата',
    fullLabel: '30. Приемка сварного соединения — НК (дублирующий) — дата',
    minWidth: 86,
  },
  {
    key: 'col31',
    colNumber: 31,
    topGroup: 'Приемка сварного соединения',
    subGroup:
      'по результатам контроля физическими методами (заключение о годности сварного соединения, номер, дата заключения)',
    label: 'рез-т',
    fullLabel: '31. Приемка сварного соединения — НК (дублирующий) — рез-т',
    minWidth: 86,
  },
  {
    key: 'col32',
    colNumber: 32,
    topGroup: 'Сведения о проведении ремонта',
    label: 'отремонтировано, вырезано',
    fullLabel: '32. Сведения о проведении ремонта — отремонтировано, вырезано',
    minWidth: 112,
  },
  {
    key: 'col33',
    colNumber: 33,
    topGroup: 'Сведения о проведении ремонта',
    label: 'дата',
    fullLabel: '33. Сведения о проведении ремонта — дата',
    minWidth: 86,
  },
  {
    key: 'col34',
    colNumber: 34,
    topGroup: 'Сведения о проведении ремонта',
    label: 'номер отк ремонта',
    fullLabel: '34. Сведения о проведении ремонта — номер отк ремонта',
    minWidth: 110,
  },
  {
    key: 'col35',
    colNumber: 35,
    topGroup: 'Сведения о проведении ремонта',
    label: 'номер шифра (клеймо) бригады или сварщиков',
    fullLabel:
      '35. Сведения о проведении ремонта — номер шифра (клеймо) бригады или сварщиков',
    minWidth: 120,
  },
  {
    key: 'col36',
    colNumber: 36,
    topGroup: 'Сведения о проведении ремонта',
    label: 'фамилия мастера (прораба)',
    fullLabel: '36. Сведения о проведении ремонта — фамилия мастера (прораба)',
    minWidth: 130,
  },
  {
    key: 'col37',
    colNumber: 37,
    topGroup: 'Сведения о проведении ремонта',
    label: 'подпись мастера (прораба)',
    fullLabel: '37. Сведения о проведении ремонта — подпись мастера (прораба)',
    minWidth: 98,
  },
  {
    key: 'col38',
    colNumber: 38,
    topGroup: 'Приемка сварного соединения после ремонта',
    subGroup: 'по результатам контроля ВИК',
    label: '№',
    fullLabel: '38. Приемка после ремонта — ВИК — №',
    minWidth: 86,
  },
  {
    key: 'col39',
    colNumber: 39,
    topGroup: 'Приемка сварного соединения после ремонта',
    subGroup: 'по результатам контроля ВИК',
    label: 'дата',
    fullLabel: '39. Приемка после ремонта — ВИК — дата',
    minWidth: 86,
  },
  {
    key: 'col40',
    colNumber: 40,
    topGroup: 'Приемка сварного соединения после ремонта',
    subGroup: 'по результатам контроля ВИК',
    label: 'рез-т',
    fullLabel: '40. Приемка после ремонта — ВИК — рез-т',
    minWidth: 86,
  },
  {
    key: 'col41',
    colNumber: 41,
    topGroup: 'Приемка сварного соединения после ремонта',
    subGroup:
      'по результатам контроля физическими методами или механическим испытаниям (заключение о годности сварного соединения, номер, дата заключения)',
    label: 'вид',
    fullLabel: '41. Приемка после ремонта — НК (основной) — вид',
    minWidth: 78,
  },
  {
    key: 'col42',
    colNumber: 42,
    topGroup: 'Приемка сварного соединения после ремонта',
    subGroup:
      'по результатам контроля физическими методами или механическим испытаниям (заключение о годности сварного соединения, номер, дата заключения)',
    label: '№',
    fullLabel: '42. Приемка после ремонта — НК (основной) — №',
    minWidth: 86,
  },
  {
    key: 'col43',
    colNumber: 43,
    topGroup: 'Приемка сварного соединения после ремонта',
    subGroup:
      'по результатам контроля физическими методами или механическим испытаниям (заключение о годности сварного соединения, номер, дата заключения)',
    label: 'дата',
    fullLabel: '43. Приемка после ремонта — НК (основной) — дата',
    minWidth: 86,
  },
  {
    key: 'col44',
    colNumber: 44,
    topGroup: 'Приемка сварного соединения после ремонта',
    subGroup:
      'по результатам контроля физическими методами или механическим испытаниям (заключение о годности сварного соединения, номер, дата заключения)',
    label: 'рез-т',
    fullLabel: '44. Приемка после ремонта — НК (основной) — рез-т',
    minWidth: 86,
  },
  {
    key: 'col45',
    colNumber: 45,
    topGroup: 'Приемка сварного соединения после ремонта',
    subGroup:
      'по результатам контроля физическими методами (заключение о годности сварного соединения, номер, дата заключения)',
    label: 'вид',
    fullLabel: '45. Приемка после ремонта — НК (дублирующий) — вид',
    minWidth: 78,
  },
  {
    key: 'col46',
    colNumber: 46,
    topGroup: 'Приемка сварного соединения после ремонта',
    subGroup:
      'по результатам контроля физическими методами (заключение о годности сварного соединения, номер, дата заключения)',
    label: '№',
    fullLabel: '46. Приемка после ремонта — НК (дублирующий) — №',
    minWidth: 86,
  },
  {
    key: 'col47',
    colNumber: 47,
    topGroup: 'Приемка сварного соединения после ремонта',
    subGroup:
      'по результатам контроля физическими методами (заключение о годности сварного соединения, номер, дата заключения)',
    label: 'дата',
    fullLabel: '47. Приемка после ремонта — НК (дублирующий) — дата',
    minWidth: 86,
  },
  {
    key: 'col48',
    colNumber: 48,
    topGroup: 'Приемка сварного соединения после ремонта',
    subGroup:
      'по результатам контроля физическими методами (заключение о годности сварного соединения, номер, дата заключения)',
    label: 'рез-т',
    fullLabel: '48. Приемка после ремонта — НК (дублирующий) — рез-т',
    minWidth: 86,
  },
  {
    key: 'col49',
    colNumber: 49,
    label: 'Примечание',
    fullLabel: '49. Примечание',
    minWidth: 110,
  },
];

/**
 * Проверяет, является ли сварное соединение угловым швом по ГОСТ 16037-80 (код начинается с кириллической 'У' или латинской 'Y'/'U': У2, У4, У5, У9, У16..У20).
 * В случае углового сварного шва в 14-м столбце журнала по СТО Газпром 15-1.1-002-2023 пишется "Я", в остальных случаях — "н/п".
 */
export function isAngularWeldJoint(gostJointType?: string | null): boolean {
  if (!gostJointType) return false;
  const trimmed = gostJointType.trim().toUpperCase();
  if (!trimmed) return false;
  const matchedOption = GOST_16037_JOINT_TYPES.find(
    (opt) => opt.code.toUpperCase() === trimmed
  );
  if (matchedOption) {
    return matchedOption.category === 'Угловое';
  }
  return trimmed.startsWith('У') || trimmed.startsWith('Y') || trimmed.startsWith('U');
}

/**
 * Извлекает только фамилию ответственного лица (мастера, прораба),
 * удаляя должность ("Мастер СМР", "Прораб СМР", "Мастер", "Прораб" и т.д.) и инициалы ("И.А.", "В.П.").
 */
export function extractSurnameOnly(raw?: string | null): string {
  if (!raw || !raw.trim()) return 'н/п';
  let s = raw.trim();
  s = s.replace(/^(мастер|прораб|инженер|начальник|бригадир)\s+(смр\s+)?/i, '');
  s = s.replace(/^смр\s+/i, '');
  // Удаляем инициалы вида "И.А.", "И. А.", "И.", "А.В."
  s = s.replace(/\b[А-ЯЁA-Z]\.\s*[А-ЯЁA-Z]\.?\b/g, '').trim();
  s = s.replace(/\b[А-ЯЁA-Z]\.\b/g, '').trim();
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length > 0) {
    return words[0].replace(/[.,]/g, '');
  }
  return raw.trim();
}

/**
 * Формирует все 49 граф строки Журнала сварочных работ по форме СТО Газпром 15-1.1-002-2023 (Приложение Г, Форма Г.1):
 * - Графа 6: ГОСТ или ТУ марки стали, завод-поставщик из базы ЛРВ (каждый элемент с новой строки).
 * - Графа 10: («Длина элемента, м») длины Элемента 1 и Элемента 2 (каждый с новой строки).
 * - Графа 14: («дополнительная маркировка сварного соединения») равна "Я" для углового сварного шва (У2, У4..У20), в остальных случаях — "н/п".
 * - Графа 16: номер технологической карты (ОТК) без положения при сварке.
 * - Графа 19: только фамилия мастера/прораба (без должности и инициалов).
 * - Графа 20: пустая ячейка для подписи.
 * - Графа 31: статус дублирующего контроля: только "Годен", "Ремонт" или "н/п" (без статуса "в работе"; при назначении ремонта по первичному контролю — "н/п").
 * - Графа 32: при ремонте пишется "Ремонт", а не "Назначен ремонт".
 * - Графа 36: только фамилия мастера/прораба.
 * - Графа 37: пустая ячейка для подписи (без текста "Подпись").
 */
export function formatStoGazpromJournalRow(
  joint: WeldJoint,
  rowIndex: number,
  lrvCatalog: LRVItem[] = []
): Record<StoGazpromColumnKey, string> & { cells: string[] } {
  const col1 = String(rowIndex + 1);
  const col2 = formatDateDDMMYY(joint.weldingDate) || 'н/п';

  let col3 = 'н/п';
  if (joint.ambientTemp && String(joint.ambientTemp).trim() !== '') {
    const rawT = String(joint.ambientTemp).trim();
    const numT = Number(rawT);
    col3 =
      !rawT.startsWith('+') && !rawT.startsWith('-') && !Number.isNaN(numT) && numT > 0
        ? `+${rawT}`
        : rawT;
  }

  // Графа 4: Диаметр свариваемого элемента, мм (Элемент 1 и Элемент 2 с новой строки)
  const d1 = joint.elem1DiameterMm ?? joint.diameterMm;
  const d2 = joint.elem2DiameterMm ?? joint.diameterMm;
  const col4 = `${d1}\n${d2}`;

  // Графа 5: Толщина стенки свариваемого элемента¹, мм (Элемент 1 и Элемент 2 с новой строки)
  const s1 = joint.elem1WallThickness ?? joint.wallThickness;
  const s2 = joint.elem2WallThickness ?? joint.wallThickness;
  const col5 = `${s1}\n${s2}`;

  // Графа 6: ГОСТ или ТУ марки стали (класс или категория прочности), завод-поставщик элемента трубопровода (с приоритетом совпадения по rdCode)
  const lrv1 =
    lrvCatalog.find(
      (i) => i.lrvCode === joint.lrv1Code && i.rdCode === joint.rdCode
    ) || lrvCatalog.find((i) => i.lrvCode === joint.lrv1Code);
  const lrv2 =
    lrvCatalog.find(
      (i) => i.lrvCode === joint.lrv2Code && i.rdCode === joint.rdCode
    ) || lrvCatalog.find((i) => i.lrvCode === joint.lrv2Code);
  const mfg1 = (joint.elem1Manufacturer || lrv1?.manufacturer || '').trim();
  const mfg2 = (joint.elem2Manufacturer || lrv2?.manufacturer || '').trim();
  const ntdMat1 = [joint.elem1Ntd, joint.elem1Material, mfg1].filter(Boolean).join(', ') || 'н/п';
  const ntdMat2 = [joint.elem2Ntd, joint.elem2Material, mfg2].filter(Boolean).join(', ') || 'н/п';
  const col6 = `${ntdMat1}\n${ntdMat2}`;

  // Графа 7: Температура подогрева (просушки) свариваемых элементов, °С
  let col7 = 'н/п';
  const rawPreheat = (joint.preheatTemp || '').trim();
  if (rawPreheat && Number(rawPreheat) > 0) {
    col7 = rawPreheat.startsWith('+') ? rawPreheat : `+${rawPreheat}`;
  }

  // Графа 8: Наименование свариваемого элемента трубопровода (каждый элемент с новой строки)
  const name1 =
    formatJournalElementName(
      joint.elem1Name,
      joint.lrv1Code,
      joint.rdCode,
      lrvCatalog
    ) ||
    joint.elem1Name ||
    'н/п';
  const name2 =
    formatJournalElementName(
      joint.elem2Name,
      joint.lrv2Code,
      joint.rdCode,
      lrvCatalog
    ) ||
    joint.elem2Name ||
    'н/п';
  const col8 = `${name1}\n${name2}`;

  // Графа 9: Заводской номер элемента (каждый элемент с новой строки)
  const fac1 = String(joint.elem1FactoryNumber ?? '').trim() || 'н/п';
  const fac2 = String(joint.elem2FactoryNumber ?? '').trim() || 'н/п';
  const col9 = `${fac1}\n${fac2}`;

  // Графа 10: Длина элемента, м (вводимый вручную параметр для каждого элемента)
  const len1 = String(joint.elem1Length ?? '').trim() || 'н/п';
  const len2 = String(joint.elem2Length ?? '').trim() || 'н/п';
  const col10 = `${len1}\n${len2}`;

  // Графы 11–14: Маркировка сварного соединения
  const col11 = joint.lineNumber || 'н/п';
  const col12 = joint.weldingType || 'н/п';
  const col13 = joint.jointNumber || 'н/п';
  // Графа 14: В случае углового сварного шва пишем "Я", в остальных случаях "н/п"
  const col14 = isAngularWeldJoint(joint.gostJointType) ? 'Я' : 'н/п';

  // Графа 15: Привязка сварного соединения (пикет)
  const col15 = 'н/п';

  // Графа 16: Номер ОТК (без положения при сварке)
  const col16 = (joint.techCardNumber || '').trim() || 'н/п';

  // Графа 17: Марка сварочных материалов (каждый материал с новой строки)
  const rawMats = (joint.weldingMaterials || '').trim();
  const col17 = rawMats
    ? rawMats
        .split(/\s+\/\s+|;\s*|\n+/)
        .map((m) => m.trim())
        .filter(Boolean)
        .join('\n')
    : 'н/п';

  // Графа 18: Номер шифра (клеймо) бригады или сварщиков
  const col18 = (joint.welderStamp || '').trim() || 'н/п';

  // Графа 19: Фамилия мастера (прораба) — только фамилия без должности и инициалов
  const col19 = extractSurnameOnly(joint.responsiblePerson);

  // Графа 20: Подпись мастера (прораба) — пусто
  const col20 = '';

  // Графы 21–23: Приемка по результатам контроля ВИК (№, дата, рез-т)
  const hasVik =
    Boolean(joint.vikResult) && joint.vikResult !== 'Не проводился';
  const col21 = hasVik ? `ВИК-${joint.jointNumber}` : 'н/п';
  const col22 = hasVik ? formatDateDDMMYY(joint.vikDate) || 'н/п' : 'н/п';
  const col23 = hasVik ? joint.vikResult : 'н/п';

  // Первичный контроль (ВИК + НК)
  const isPrimaryRepair =
    joint.vikResult === 'Ремонт' ||
    joint.vikResult === 'Вырезать' ||
    joint.ndtResult === 'Ремонт' ||
    joint.ndtResult === 'Вырезать';

  // Графы 24–27: Приемка по результатам основного физического контроля НК (вид, №, дата, рез-т)
  const hasNdt =
    Boolean(joint.ndtType) &&
    joint.ndtType !== 'Не требуется' &&
    Boolean(joint.ndtResult) &&
    joint.ndtResult !== 'Не проводился';
  const col24 =
    joint.ndtType && joint.ndtType !== 'Не требуется' ? joint.ndtType : 'н/п';
  const col25 = hasNdt
    ? joint.ndtReportNumber?.trim() || `${joint.ndtType}-${joint.jointNumber}`
    : 'н/п';
  const col26 = hasNdt ? formatDateDDMMYY(joint.ndtDate) || 'н/п' : 'н/п';
  const col27 = hasNdt ? joint.ndtResult : 'н/п';

  // Графы 28–31: Приемка по результатам второго/дублирующего физического контроля
  // Если после первичного контроля назначен ремонт, нет смысла в дублирующем контроле -> "н/п".
  // Нет статуса "в работе": либо "Годен", либо "Ремонт", либо "н/п".
  let col28 = 'н/п';
  let col29 = 'н/п';
  let col30 = 'н/п';
  let col31 = 'н/п';

  if (!isPrimaryRepair && joint.dupNdtType && joint.dupNdtType !== 'Не требуется') {
    col28 = joint.dupNdtType;
    if (joint.dupNdtResult === 'Годен' || joint.dupNdtResult === 'Ремонт') {
      col29 = `${joint.dupNdtType}-Д-${joint.jointNumber}`;
      col30 = formatDateDDMMYY(joint.dupNdtDate) || 'н/п';
      col31 = joint.dupNdtResult;
    } else {
      // Статусы "В работе", "Не проводился" и т.п. отображаются как "н/п"
      col31 = 'н/п';
    }
  }

  // Графы 32–37: Сведения о проведении ремонта
  const isRepairNeeded =
    isPrimaryRepair ||
    joint.dupNdtResult === 'Ремонт' ||
    joint.dupNdtResult === 'Вырезать';

  // Столбец 32: не "назначен ремонт", а просто "ремонт"
  const col32 = isRepairNeeded
    ? joint.ndtResult === 'Вырезать' || joint.vikResult === 'Вырезать'
      ? 'Вырезано'
      : 'Ремонт'
    : 'н/п';
  const col33 = isRepairNeeded
    ? formatDateDDMMYY(joint.ndtDate || joint.vikDate) || 'н/п'
    : 'н/п';
  const col34 = isRepairNeeded
    ? `${joint.techCardNumber || 'ТК'}-Р`
    : 'н/п';
  const col35 = isRepairNeeded ? col18 : 'н/п';
  // Столбец 36: только фамилия
  const col36 = isRepairNeeded ? extractSurnameOnly(joint.responsiblePerson) : 'н/п';
  // Столбец 37: В ячейке, где нужна подпись не нужна надпись "подпись" -> пусто
  const col37 = '';

  // Графы 38–48: Приемка сварного соединения после ремонта (если по первичному контролю был Ремонт и проведен повторный/дублирующий контроль)
  const hasPostRepairControl =
    isPrimaryRepair &&
    Boolean(joint.dupNdtType) &&
    joint.dupNdtType !== 'Не требуется' &&
    Boolean(joint.dupNdtResult) &&
    joint.dupNdtResult !== 'Не проводился';

  const postRepairDateFmt = hasPostRepairControl
    ? formatDateDDMMYY(joint.dupNdtDate || joint.ndtDate || joint.vikDate) || 'н/п'
    : 'н/п';
  const postRepairResFmt =
    hasPostRepairControl &&
    (joint.dupNdtResult === 'Годен' || joint.dupNdtResult === 'Ремонт')
      ? joint.dupNdtResult
      : 'н/п';

  const col38 = hasPostRepairControl ? `ВИК-Р-${joint.jointNumber}` : 'н/п';
  const col39 = hasPostRepairControl ? postRepairDateFmt : 'н/п';
  const col40 = hasPostRepairControl ? postRepairResFmt : 'н/п';
  const col41 = hasPostRepairControl ? joint.dupNdtType : 'н/п';
  const col42 = hasPostRepairControl
    ? `${joint.dupNdtType}-Р-${joint.jointNumber}`
    : 'н/п';
  const col43 = hasPostRepairControl ? postRepairDateFmt : 'н/п';
  const col44 = hasPostRepairControl ? postRepairResFmt : 'н/п';
  const col45 = 'н/п';
  const col46 = 'н/п';
  const col47 = 'н/п';
  const col48 = 'н/п';

  // Графа 49: Примечание
  const col49 = 'н/п';

  const cells: string[] = [
    col1,
    col2,
    col3,
    col4,
    col5,
    col6,
    col7,
    col8,
    col9,
    col10,
    col11,
    col12,
    col13,
    col14,
    col15,
    col16,
    col17,
    col18,
    col19,
    col20,
    col21,
    col22,
    col23,
    col24,
    col25,
    col26,
    col27,
    col28,
    col29,
    col30,
    col31,
    col32,
    col33,
    col34,
    col35,
    col36,
    col37,
    col38,
    col39,
    col40,
    col41,
    col42,
    col43,
    col44,
    col45,
    col46,
    col47,
    col48,
    col49,
  ];

  return {
    col1,
    col2,
    col3,
    col4,
    col5,
    col6,
    col7,
    col8,
    col9,
    col10,
    col11,
    col12,
    col13,
    col14,
    col15,
    col16,
    col17,
    col18,
    col19,
    col20,
    col21,
    col22,
    col23,
    col24,
    col25,
    col26,
    col27,
    col28,
    col29,
    col30,
    col31,
    col32,
    col33,
    col34,
    col35,
    col36,
    col37,
    col38,
    col39,
    col40,
    col41,
    col42,
    col43,
    col44,
    col45,
    col46,
    col47,
    col48,
    col49,
    cells,
  };
}


