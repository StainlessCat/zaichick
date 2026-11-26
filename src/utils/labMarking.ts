/**
 * Изолированный модуль расчёта «Маркировки стыка» и автонумерации заключений
 * исключительно для раздела «Лаборатория НК».
 *
 * ВАЖНО: не импортировать в журналы сварки, реестр стыков, паспорт стыка,
 * реестр ИД, лайнлист или общие экспорты.
 */

export interface LabDiameterCodeEntry {
  diameterMm: string;
  code: string;
  label: string;
}

export interface LabWeldingTypeCodeEntry {
  weldingType: string;
  code: string;
  description: string;
}

/**
 * Утверждённая таблица диаметров и буквенных индексов (59 диаметров + врезка).
 */
export const LAB_DIAMETER_CODE_TABLE: readonly LabDiameterCodeEntry[] = [
  { diameterMm: '1820', code: 'АБ', label: '1820 мм' },
  { diameterMm: '1720', code: 'АА', label: '1720 мм' },
  { diameterMm: '1420', code: 'А', label: '1420 мм' },
  { diameterMm: '1220', code: 'Б', label: '1220 мм' },
  { diameterMm: '1219', code: 'БА', label: '1219 мм' },
  { diameterMm: '1020', code: 'В', label: '1020 мм' },
  { diameterMm: '820', code: 'Г', label: '820 мм' },
  { diameterMm: '812.8', code: 'ГА', label: '812.8 мм' },
  { diameterMm: '720', code: 'Д', label: '720 мм' },
  { diameterMm: '711.2', code: 'ДА', label: '711.2 мм' },
  { diameterMm: '630', code: 'Е', label: '630 мм' },
  { diameterMm: '530', code: 'Ж', label: '530 мм' },
  { diameterMm: '508', code: 'ЖА', label: '508 мм' },
  { diameterMm: '426', code: 'И', label: '426 мм' },
  { diameterMm: '406.4', code: 'ИА', label: '406.4 мм' },
  { diameterMm: '377', code: 'КА', label: '377 мм' },
  { diameterMm: '325', code: 'К', label: '325 мм' },
  { diameterMm: '323.9', code: 'КБ', label: '323.9 мм' },
  { diameterMm: '315', code: 'КВ', label: '315 мм' },
  { diameterMm: '273', code: 'ЛА', label: '273 мм' },
  { diameterMm: '225', code: 'ЛБ', label: '225 мм' },
  { diameterMm: '219.1', code: 'ЛВ', label: '219.1 мм' },
  { diameterMm: '219', code: 'Л', label: '219 мм' },
  { diameterMm: '200', code: 'ЛГ', label: '200 мм' },
  { diameterMm: '180', code: 'ЛД', label: '180 мм' },
  { diameterMm: '168.3', code: 'М', label: '168.3 мм' },
  { diameterMm: '160', code: 'МА', label: '160 мм' },
  { diameterMm: '159', code: 'Н', label: '159 мм' },
  { diameterMm: '133', code: 'НА', label: '133 мм' },
  { diameterMm: '114.3', code: 'П', label: '114.3 мм' },
  { diameterMm: '114', code: 'ПА', label: '114 мм' },
  { diameterMm: '112', code: 'ПБ', label: '112 мм' },
  { diameterMm: '110', code: 'СА', label: '110 мм' },
  { diameterMm: '108', code: 'С', label: '108 мм' },
  { diameterMm: '95', code: 'СБ', label: '95 мм' },
  { diameterMm: '89', code: 'Т', label: '89 мм' },
  { diameterMm: '76', code: 'ТА', label: '76 мм' },
  { diameterMm: '63', code: 'ТБ', label: '63 мм' },
  { diameterMm: '60.3', code: 'У', label: '60.3 мм' },
  { diameterMm: '60', code: 'УА', label: '60 мм' },
  { diameterMm: '57', code: 'Ф', label: '57 мм' },
  { diameterMm: '50', code: 'ФА', label: '50 мм' },
  { diameterMm: '45', code: 'ФБ', label: '45 мм' },
  { diameterMm: '44', code: 'ФВ', label: '44 мм' },
  { diameterMm: '43', code: 'ФГ', label: '43 мм' },
  { diameterMm: '40', code: 'ФД', label: '40 мм' },
  { diameterMm: '38', code: 'ФЕ', label: '38 мм' },
  { diameterMm: '35', code: 'ФК', label: '35 мм' },
  { diameterMm: '34', code: 'ФЛ', label: '34 мм' },
  { diameterMm: '32', code: 'Х', label: '32 мм' },
  { diameterMm: '28', code: 'ХА', label: '28 мм' },
  { diameterMm: '25', code: 'Ц', label: '25 мм' },
  { diameterMm: '22', code: 'Ч', label: '22 мм' },
  { diameterMm: '20', code: 'ЧА', label: '20 мм' },
  { diameterMm: '19', code: 'ЧБ', label: '19 мм' },
  { diameterMm: '18', code: 'Ш', label: '18 мм' },
  { diameterMm: '15', code: 'ША', label: '15 мм' },
  { diameterMm: '14', code: 'Ю', label: '14 мм' },
  { diameterMm: '12', code: 'ЮА', label: '12 мм' },
  { diameterMm: 'врезка', code: 'Я', label: 'врезка' },
] as const;

export const LAB_DIAMETER_CODE_MAP: ReadonlyMap<string, string> = new Map(
  LAB_DIAMETER_CODE_TABLE.map((entry) => [entry.diameterMm, entry.code])
);

/**
 * Утверждённая таблица цифровых кодов видов сварки (10 позиций).
 */
export const LAB_WELDING_TYPE_CODE_TABLE: readonly LabWeldingTypeCodeEntry[] = [
  { weldingType: 'РД', code: '1', description: 'Ручная дуговая сварка покрытым электродом' },
  { weldingType: 'РАД', code: '2', description: 'Ручная аргонодуговая сварка' },
  { weldingType: 'РАД+РД', code: '21', description: 'Комбинированная сварка РАД + РД' },
  { weldingType: 'МП', code: '3', description: 'Механизированная сварка в защитных газах' },
  { weldingType: 'ААД', code: '4', description: 'Автоматическая аргонодуговая сварка' },
  { weldingType: 'МПС', code: '5', description: 'Механизированная сварка самозащитной порошковой проволокой' },
  { weldingType: 'АПГ', code: '6', description: 'Автоматическая сварка порошковой проволокой в защитном газе' },
  { weldingType: 'АПИ', code: '7', description: 'Автоматическая сварка порошковой проволокой с принудительным формированием' },
  { weldingType: 'АФ', code: '8', description: 'Автоматическая сварка под флюсом' },
  { weldingType: 'Л', code: '9', description: 'Лазерная сварка' },
] as const;

export const LAB_WELDING_TYPE_CODE_MAP: ReadonlyMap<string, string> = new Map(
  LAB_WELDING_TYPE_CODE_TABLE.map((entry) => [entry.weldingType, entry.code])
);

export interface LabMarkingInput {
  rdCode?: string | null;
  lineNumber?: string | null;
  diameterMm?: number | string | null;
  jointKind?: string | null;
  gostJointType?: string | null;
  weldingType?: string | null;
  jointNumber?: string | null;
}

export interface LabMarkingResult {
  marking: string;
  isComplete: boolean;
  missingParts: string[];
  shortRdCode: string;
  lineNumber: string;
  diameterCode: string | null;
  weldingCode: string | null;
  jointNumber: string;
  isBranch: boolean;
}

/**
 * Извлекает <краткий шифр> как правую подстроку после последней точки в шифре РД.
 * Если точек нет — возвращает очищенный шифр целиком.
 */
export function extractShortRdCode(rdCode?: string | null): string {
  const trimmed = String(rdCode ?? '').trim();
  if (!trimmed) return '';
  const lastDotIdx = trimmed.lastIndexOf('.');
  if (lastDotIdx >= 0) {
    const tail = trimmed.slice(lastDotIdx + 1).trim();
    if (tail) return tail;
    return trimmed.slice(0, lastDotIdx).trim();
  }
  return trimmed;
}

/**
 * Нормализует числовое значение диаметра без искажения дробных размеров
 * (например, 159.0 -> "159", 219.10 -> "219.1", "60,3" -> "60.3").
 */
export function normalizeDiameterKey(diameterMm?: number | string | null): string | null {
  if (diameterMm === null || diameterMm === undefined) return null;
  const raw = String(diameterMm).trim().replace(',', '.');
  if (!raw) return null;
  if (raw.toLowerCase() === 'врезка') return 'врезка';
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return null;
  // Округляем до 3 знаков после запятой для защиты от float-погрешности, убирая лишние нули
  const normalized = Number(num.toFixed(3));
  return String(normalized);
}

/**
 * Определяет буквенный код диаметра по утверждённому справочнику.
 * Для угловых соединений (jointKind === 'Угловое' или ГОСТ У*) всегда возвращает «Я».
 */
export function resolveDiameterLetterCode(params: {
  diameterMm?: number | string | null;
  jointKind?: string | null;
  gostJointType?: string | null;
}): { code: string | null; isBranch: boolean; normalizedDiameter: string | null } {
  const kindNorm = String(params.jointKind ?? '').trim().toLowerCase();
  const gostNorm = String(params.gostJointType ?? '').trim().toUpperCase();
  const normalizedDiameter = normalizeDiameterKey(params.diameterMm);

  if (kindNorm === 'угловое' || gostNorm.startsWith('У')) {
    return { code: 'Я', isBranch: true, normalizedDiameter };
  }

  if (!normalizedDiameter) {
    return { code: null, isBranch: false, normalizedDiameter: null };
  }

  const code = LAB_DIAMETER_CODE_MAP.get(normalizedDiameter) ?? null;
  return {
    code,
    isBranch: normalizedDiameter === 'врезка',
    normalizedDiameter,
  };
}

/**
 * Определяет цифровой код вида сварки по утверждённому справочнику.
 */
export function resolveWeldingTypeCode(weldingType?: string | null): string | null {
  const normalized = String(weldingType ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s*\+\s*/g, '+');
  if (!normalized) return null;
  return LAB_WELDING_TYPE_CODE_MAP.get(normalized) ?? null;
}

/**
 * Форматирует номер стыка для маркировки с сохранением стандарта 010/011/1020.
 */
export function formatJointNumberForMarking(jointNumber?: string | null): string {
  const raw = String(jointNumber ?? '').trim();
  if (!raw) return '';
  if (/^\d+$/.test(raw) && raw.length < 3) {
    return raw.padStart(3, '0');
  }
  return raw;
}

/**
 * Формирует расчётную «Маркировку стыка» для модуля «Лаборатория НК».
 * Формат: <краткий шифр>-<линия>-<код диаметра>-<код сварки>-<номер стыка>
 */
export function buildJointLabMarking(input: LabMarkingInput): LabMarkingResult {
  const shortRdCode = extractShortRdCode(input.rdCode);
  const lineNumber = String(input.lineNumber ?? '').trim();
  const { code: diameterCode, isBranch } = resolveDiameterLetterCode({
    diameterMm: input.diameterMm,
    jointKind: input.jointKind,
    gostJointType: input.gostJointType,
  });
  const weldingCode = resolveWeldingTypeCode(input.weldingType);
  const jointNumber = formatJointNumberForMarking(input.jointNumber);

  const missingParts: string[] = [];
  if (!shortRdCode) missingParts.push('шифр РД');
  if (!lineNumber) missingParts.push('линия');
  if (!diameterCode) missingParts.push('код диаметра');
  if (!weldingCode) missingParts.push('код вида сварки');
  if (!jointNumber) missingParts.push('номер стыка');

  const marking = [
    shortRdCode || '?',
    lineNumber || '?',
    diameterCode || '?',
    weldingCode || '?',
    jointNumber || '?',
  ].join('-');

  return {
    marking,
    isComplete: missingParts.length === 0,
    missingParts,
    shortRdCode,
    lineNumber,
    diameterCode,
    weldingCode,
    jointNumber,
    isBranch,
  };
}

/**
 * Формирует номер заключения по шаблону «Метод-Маркировка»
 * (с суффиксами -Р1 при ремонте и -Д при дублирующем контроле).
 */
export function buildLabConclusionNumber(
  method: string,
  marking: string,
  stage: 'primary' | 'repair' | 'duplicate' = 'primary',
  repairIndex = 1
): string {
  const cleanMethod = String(method ?? '').trim().toUpperCase();
  const cleanMarking = String(marking ?? '').trim();
  if (!cleanMethod || !cleanMarking) return '';

  const base = `${cleanMethod}-${cleanMarking}`;
  if (stage === 'repair') {
    const idx = Number.isFinite(repairIndex) && repairIndex >= 1 ? Math.floor(repairIndex) : 1;
    return `${base}-Р${idx}`;
  }
  if (stage === 'duplicate') {
    return `${base}-Д`;
  }
  return base;
}
