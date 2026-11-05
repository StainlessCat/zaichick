import {
  LrvElementCategory,
  LRVItem,
  TechCardItem,
  WeldJoint,
} from '../types/welding';

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
 * Отраслевая ступенчатая шкала EPC (Метод А) коэффициента трудоёмкости K_толщ по толщине стенки S [мм]:
 * - S <= 10.0 мм: K = 1.00 (базовый диапазон стандартных толщин)
 * - 10.1 <= S <= 15.0 мм: K = 1.35
 * - 15.1 <= S <= 20.0 мм: K = 1.75
 * - 20.1 <= S <= 26.0 мм: K = 2.30
 * - 26.1 <= S <= 35.0 мм: K = 2.80
 * - 35.1 <= S <= 50.0 мм: K = 3.50
 * - S > 50.0 мм: K = 4.50
 */
export function getEpcWallThicknessFactor(wallThicknessMm?: number | null): number {
  const s = Number(wallThicknessMm) || 0;
  if (s <= 10.0) return 1.0;
  if (s <= 15.0) return 1.35;
  if (s <= 20.0) return 1.75;
  if (s <= 26.0) return 2.3;
  if (s <= 35.0) return 2.8;
  if (s <= 50.0) return 3.5;
  return 4.5;
}

/**
 * Конвертирует строковое обозначение дюйм-диаметра в числовое значение.
 */
export function inchStringToNumeric(inchStr?: string | number | null): number {
  if (inchStr === null || inchStr === undefined || inchStr === '') return 0;
  if (typeof inchStr === 'number') return Number.isNaN(inchStr) ? 0 : inchStr;
  const clean = String(inchStr).replace(/"/g, '').trim();
  if (!clean) return 0;

  // Смешанная дробь (напр. "2 1/2", "1 1/4", "6 1/2")
  const mixedMatch = clean.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const whole = parseFloat(mixedMatch[1]);
    const num = parseFloat(mixedMatch[2]);
    const den = parseFloat(mixedMatch[3]);
    if (den !== 0) {
      return Math.round((whole + num / den) * 1000) / 1000;
    }
  }

  // Простая дробь (напр. "3/8", "1/2", "3/4")
  const fracMatch = clean.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    const num = parseFloat(fracMatch[1]);
    const den = parseFloat(fracMatch[2]);
    if (den !== 0) {
      return Math.round((num / den) * 1000) / 1000;
    }
  }

  // Десятичное или целое число (напр. "6", "2.5")
  const parsed = parseFloat(clean.replace(',', '.'));
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Возвращает числовой номинальный диаметр в дюймах (D_inch) по наружному диаметру / DN в мм
 * строго в соответствии с эталонной таблицей соответствия условных проходов.
 */
export function mmToNumericInchDiameter(diameterMm: number): number {
  const inchStr = mmToInchDiameter(diameterMm);
  return inchStringToNumeric(inchStr);
}

/**
 * Расчёт эквивалентных дюймов (Equivalent Dia-Inch / EDI) по Методу А:
 * EDI = D_inch * K_толщ(S)
 * где D_inch — числовое значение номинального диаметра в дюймах,
 * K_толщ(S) — ступенчатый отраслевой коэффициент EPC по толщине стенки.
 * Результат округляется до 2 десятичных знаков.
 */
export function calculateEquivalentDiaInch(
  diameterMmOrInches: number | string,
  wallThicknessMm: number
): number {
  const dInch =
    typeof diameterMmOrInches === 'number'
      ? mmToNumericInchDiameter(diameterMmOrInches)
      : inchStringToNumeric(diameterMmOrInches);
  const k = getEpcWallThicknessFactor(wallThicknessMm);
  return Math.round(dInch * k * 100) / 100;
}

/**
 * Извлекает или рассчитывает эквивалентный дюйм-диаметр (EDI) стыка по Методу А
 */
export function getJointEquivDiaInch(
  joint: Pick<WeldJoint, 'diameterMm' | 'diameterInch' | 'wallThickness'> & {
    equivDiameterInch?: number;
  }
): number {
  if (joint.equivDiameterInch !== undefined && !Number.isNaN(joint.equivDiameterInch)) {
    return joint.equivDiameterInch;
  }
  return calculateEquivalentDiaInch(
    joint.diameterInch || joint.diameterMm,
    joint.wallThickness
  );
}

/**
 * Извлекает или рассчитывает номинальный дюйм-диаметр стыка
 */
export function getJointNominalInch(
  joint: Pick<WeldJoint, 'diameterMm' | 'diameterInch'>
): number {
  if (joint.diameterInch) {
    const parsed = inchStringToNumeric(joint.diameterInch);
    if (parsed > 0) return parsed;
  }
  return mmToNumericInchDiameter(joint.diameterMm);
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
 * Удаляет из краткого наименования элемента диаметр, толщину стенки и номинальные параметры DN/PN
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

  // Очищаем слово «фланцевый/фланцевая/фланцевое» из середины/конца, если оно есть, чтобы избежать тавтологии
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
 * Комплексный поиск элемента в базе ЛРВ
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
