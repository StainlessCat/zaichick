import {
  ControlResult,
  LRVItem,
  NdtMethod,
  ProjectLineItem,
  TechCardItem,
  WelderProfile,
  WeldingMaterialCertificate,
  WeldJoint,
} from '../types/welding';
import {
  buildUniqueLineId,
  calculateEquivalentDiaInch,
  detectLrvElementType,
  formatDateDDMMYY,
  mmToInchDiameter,
  normalizeDateToISO,
  normalizeDecimalInput,
  normalizeStampString,
  parseDecimalNumber,
} from './weldingLogic';

export interface ValidationIssue {
  id: string;
  category: 'chronology' | 'tech' | 'ndt' | 'referential' | 'boundary';
  severity: 'error' | 'warning';
  field?: string;
  title: string;
  message: string;
}

export interface JointValidationSummary {
  isValidToSave: boolean; // false если есть блокирующие критические ошибки (severity === 'error')
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  allIssues: ValidationIssue[];
}

/**
 * 1. Конвертирует дату из любого представления (включая серийный номер даты Excel, напр. 46315)
 * в ISO строку YYYY-MM-DD с проверкой реальности календарной даты (исключает 31.02.26 и т.п.).
 */
export function sanitizeAndParseDateISO(raw: unknown): {
  isoDate: string;
  isValid: boolean;
  errorMessage?: string;
} {
  if (raw === null || raw === undefined || raw === '') {
    return { isoDate: '', isValid: true };
  }

  // Если передано число или строка из цифр — проверяем, не серийная ли это дата Excel (напр. 40000..60000)
  if (typeof raw === 'number' || /^\d{5}(?:\.\d+)?$/.test(String(raw).trim())) {
    const serial = typeof raw === 'number' ? raw : parseFloat(String(raw).trim());
    if (serial >= 25569 && serial <= 73050) {
      // 25569 = 1970-01-01 в Excel
      const utcDays = Math.floor(serial - 25569);
      const utcValue = utcDays * 86400 * 1000;
      const dateInfo = new Date(utcValue);
      if (!Number.isNaN(dateInfo.getTime())) {
        const yyyy = dateInfo.getUTCFullYear();
        const mm = String(dateInfo.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(dateInfo.getUTCDate()).padStart(2, '0');
        return { isoDate: `${yyyy}-${mm}-${dd}`, isValid: true };
      }
    }
  }

  const str = String(raw).trim();
  if (!str || str === '—' || str.toLowerCase() === 'н/п') {
    return { isoDate: '', isValid: true };
  }

  let yyyy = 0;
  let mm = 0;
  let dd = 0;

  // YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    yyyy = parseInt(isoMatch[1], 10);
    mm = parseInt(isoMatch[2], 10);
    dd = parseInt(isoMatch[3], 10);
  } else {
    // DD.MM.YY или DD.MM.YYYY или DD/MM/YYYY
    const dmyMatch = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
    if (dmyMatch) {
      dd = parseInt(dmyMatch[1], 10);
      mm = parseInt(dmyMatch[2], 10);
      const rawYear = dmyMatch[3];
      yyyy =
        rawYear.length === 2
          ? 2000 + parseInt(rawYear, 10)
          : parseInt(rawYear, 10);
    } else {
      return {
        isoDate: str,
        isValid: false,
        errorMessage: `Некорректный формат даты «${str}» (ожидается ДД.ММ.ГГ или ГГГГ-ММ-ДД)`,
      };
    }
  }

  // Проверка границ года, месяца и дня
  if (yyyy < 2000 || yyyy > 2100) {
    return {
      isoDate: str,
      isValid: false,
      errorMessage: `Недопустимый год «${yyyy}» в дате «${str}»`,
    };
  }
  if (mm < 1 || mm > 12) {
    return {
      isoDate: str,
      isValid: false,
      errorMessage: `Несуществующий месяц «${mm}» в дате «${str}»`,
    };
  }

  const daysInMonths = [
    31,
    (yyyy % 4 === 0 && yyyy % 100 !== 0) || yyyy % 400 === 0 ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  if (dd < 1 || dd > daysInMonths[mm - 1]) {
    return {
      isoDate: str,
      isValid: false,
      errorMessage: `Несуществующая календарная дата «${str}» (в месяце ${mm} не может быть ${dd} дней)`,
    };
  }

  const formattedIso = `${yyyy}-${String(mm).padStart(2, '0')}-${String(
    dd
  ).padStart(2, '0')}`;
  return { isoDate: formattedIso, isValid: true };
}

/**
 * 2. Глобальный санитайзер строки (удаление невидимых символов, управляющих кодов, лишних пробелов)
 */
export function sanitizeCleanString(val: unknown, fallback = ''): string {
  if (val === null || val === undefined) return fallback;
  return String(val)
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 3. Глобальный санитайзер объекта WeldJoint (Runtime Schema Sanitizer)
 * Гарантирует отсутствие NaN, null и некорректных типов при чтении из Excel, JSON или формы.
 */
export function sanitizeWeldJointRecord(joint: Partial<WeldJoint>): WeldJoint {
  const diam = parseDecimalNumber(joint.diameterMm) ?? 159;
  const safeDiam = diam > 0 ? diam : 159;

  const wall = parseDecimalNumber(joint.wallThickness) ?? 8.0;
  const safeWall = wall > 0 ? wall : 8.0;

  const elem1Diam = parseDecimalNumber(joint.elem1DiameterMm) ?? safeDiam;
  const elem1Wall = parseDecimalNumber(joint.elem1WallThickness) ?? safeWall;
  const elem2Diam = parseDecimalNumber(joint.elem2DiameterMm) ?? safeDiam;
  const elem2Wall = parseDecimalNumber(joint.elem2WallThickness) ?? safeWall;

  const rdCode = sanitizeCleanString(joint.rdCode);
  const lineNumber = sanitizeCleanString(joint.lineNumber);
  const uniqueLineId =
    sanitizeCleanString(joint.uniqueLineId) ||
    buildUniqueLineId(rdCode, lineNumber);

  // Очистка висящих дат и фамилий при статусе "Не проводился" / "Не требуется"
  const vikRes = (joint.vikResult || 'Годен') as ControlResult;
  const cleanVikDate =
    vikRes === 'Не проводился'
      ? ''
      : sanitizeAndParseDateISO(joint.vikDate).isoDate ||
        sanitizeCleanString(joint.vikDate);
  const cleanVikInsp =
    vikRes === 'Не проводился' ? '' : sanitizeCleanString(joint.vikInspector);

  const ndtType = (joint.ndtType || 'РК') as NdtMethod;
  const ndtRes = (
    ndtType === 'Не требуется' ? 'Не проводился' : joint.ndtResult || 'В работе'
  ) as ControlResult;
  const cleanNdtDate =
    ndtType === 'Не требуется' || ndtRes === 'Не проводился'
      ? ''
      : sanitizeAndParseDateISO(joint.ndtDate).isoDate ||
        sanitizeCleanString(joint.ndtDate);
  const cleanNdtInsp =
    ndtType === 'Не требуется' || ndtRes === 'Не проводился'
      ? ''
      : sanitizeCleanString(joint.ndtInspector);

  const dupNdtType = (joint.dupNdtType || 'Не требуется') as NdtMethod;
  const dupNdtRes = (
    dupNdtType === 'Не требуется'
      ? 'Не проводился'
      : joint.dupNdtResult || 'Не проводился'
  ) as ControlResult;
  const cleanDupDate =
    dupNdtType === 'Не требуется' || dupNdtRes === 'Не проводился'
      ? ''
      : sanitizeAndParseDateISO(joint.dupNdtDate).isoDate ||
        sanitizeCleanString(joint.dupNdtDate);
  const cleanDupInsp =
    dupNdtType === 'Не требуется' || dupNdtRes === 'Не проводился'
      ? ''
      : sanitizeCleanString(joint.dupNdtInspector);

  return {
    id: sanitizeCleanString(joint.id) || `j-${Date.now()}`,
    objectName: sanitizeCleanString(joint.objectName),
    rdCode,
    contour: sanitizeCleanString(joint.contour),
    lineNumber,
    uniqueLineId,
    jointNumber: sanitizeCleanString(joint.jointNumber, '010'),
    isSupplementary: Boolean(joint.isSupplementary),
    jointType: joint.jointType === 'Цеховой' ? 'Цеховой' : 'Монтажный',
    diameterMm: safeDiam,
    diameterInch:
      sanitizeCleanString(joint.diameterInch) || mmToInchDiameter(safeDiam),
    equivDiameterInch:
      typeof joint.equivDiameterInch === 'number' && !Number.isNaN(joint.equivDiameterInch)
        ? joint.equivDiameterInch
        : calculateEquivalentDiaInch(
            sanitizeCleanString(joint.diameterInch) || safeDiam,
            safeWall
          ),
    wallThickness: safeWall,

    lrv1Code: sanitizeCleanString(joint.lrv1Code),
    elem1Name: sanitizeCleanString(joint.elem1Name),
    elem1Material: sanitizeCleanString(joint.elem1Material, '09Г2С'),
    elem1Ntd: sanitizeCleanString(joint.elem1Ntd, 'ГОСТ 8732-78'),
    elem1Manufacturer: sanitizeCleanString(joint.elem1Manufacturer),
    elem1DiameterMm: elem1Diam,
    elem1WallThickness: elem1Wall,
    elem1FactoryNumber: sanitizeCleanString(joint.elem1FactoryNumber),
    elem1Length: normalizeDecimalInput(joint.elem1Length),

    lrv2Code: sanitizeCleanString(joint.lrv2Code),
    elem2Name: sanitizeCleanString(joint.elem2Name),
    elem2Material: sanitizeCleanString(joint.elem2Material, '09Г2С'),
    elem2Ntd: sanitizeCleanString(joint.elem2Ntd, 'ГОСТ 17375-2001'),
    elem2Manufacturer: sanitizeCleanString(joint.elem2Manufacturer),
    elem2DiameterMm: elem2Diam,
    elem2WallThickness: elem2Wall,
    elem2FactoryNumber: sanitizeCleanString(joint.elem2FactoryNumber),
    elem2Length: normalizeDecimalInput(joint.elem2Length),

    weldingType: joint.weldingType || 'РАД+РД',
    gostJointType: sanitizeCleanString(joint.gostJointType, 'С17'),
    weldingPosition: sanitizeCleanString(joint.weldingPosition, 'В1'),
    weldingDate:
      sanitizeAndParseDateISO(joint.weldingDate).isoDate ||
      sanitizeCleanString(joint.weldingDate),
    welderStamp: sanitizeCleanString(joint.welderStamp),
    welderStampsList: Array.isArray(joint.welderStampsList)
      ? joint.welderStampsList.map((s) => sanitizeCleanString(s)).filter(Boolean)
      : [],
    brigadeStamp: sanitizeCleanString(joint.brigadeStamp),
    weldingMaterials: sanitizeCleanString(joint.weldingMaterials),
    ambientTemp: normalizeDecimalInput(joint.ambientTemp),
    preheatTemp: normalizeDecimalInput(joint.preheatTemp),
    responsiblePerson: sanitizeCleanString(joint.responsiblePerson),
    welderFullName: sanitizeCleanString(joint.welderFullName),
    welderCertNumber: sanitizeCleanString(joint.welderCertNumber),
    techCardNumber: sanitizeCleanString(joint.techCardNumber),

    vikResult: vikRes,
    vikDate: cleanVikDate,
    vikInspector: cleanVikInsp,

    ndtType,
    ndtDate: cleanNdtDate,
    ndtResult: ndtRes,
    ndtInspector: cleanNdtInsp,

    dupNdtType,
    dupNdtDate: cleanDupDate,
    dupNdtResult: dupNdtRes,
    dupNdtInspector: cleanDupInsp,

    updatedAt: joint.updatedAt || new Date().toISOString(),
    updatedBy: sanitizeCleanString(joint.updatedBy),
  };
}

/**
 * Определяет максимальное число приварных торцов у одной детали по её типу
 */
export function getMaxWeldEndsForElement(elementName: string): number {
  const cat = detectLrvElementType(elementName);
  switch (cat) {
    case 'Фланец':
    case 'Заглушка':
      return 1;
    case 'Тройник':
      return 3;
    case 'Отвод':
    case 'Переход':
    case 'ЗРА':
    case 'Кран':
    case 'Труба':
    default:
      return 2;
  }
}

/**
 * Определяет класс стали (углеродистая/низколегированная vs коррозионностойкая/нержавеющая)
 */
function getSteelClass(grade: string): 'carbon_low_alloy' | 'stainless' | 'other' {
  const s = (grade || '').toUpperCase().trim();
  if (
    s.includes('Х18') ||
    s.includes('Х17') ||
    s.includes('12Х18Н10Т') ||
    s.includes('08Х18Н10Т') ||
    s.includes('10Х17Н13М2Т') ||
    s.includes('AISI')
  ) {
    return 'stainless';
  }
  if (
    s.includes('09Г2С') ||
    s.includes('20') ||
    s.includes('17Г1С') ||
    s.includes('10Г2ФБЮ') ||
    s.includes('13ХФА') ||
    s.includes('СТ3')
  ) {
    return 'carbon_low_alloy';
  }
  return 'other';
}

/**
 * Полный комплекс проверок паспорта стыка по 5 блокам:
 * - Блок 1: Хронология дат, НАКС, входной контроль СМ, запрет будущих дат
 * - Блок 2: Технология (диапазон Ø и S по ТК, допуск сварщика к методу, разнородные стали, разнотолщинность, остатки по спецификации ЛРВ, длины фасонных деталей)
 * - Блок 3: Логика ВИК, НК, ремонта и проектного % контроля по лайнлисту
 * - Блок 4: Ссылочная целостность и уникальность заводских номеров деталей (количество торцов)
 * - Блок 5: Экстремальные границы значений (D, S < D/2, длина, температуры)
 */
export function validateWeldJointComprehensive(params: {
  joint: WeldJoint;
  allJoints: WeldJoint[];
  projectLineList: ProjectLineItem[];
  lrvCatalog: LRVItem[];
  welders: WelderProfile[];
  techCards: TechCardItem[];
  weldingMaterials: WeldingMaterialCertificate[];
  maxAllowedYear?: number;
}): JointValidationSummary {
  const {
    joint,
    allJoints,
    projectLineList,
    lrvCatalog,
    welders,
    techCards,
    weldingMaterials,
    maxAllowedYear = 2027,
  } = params;

  const issues: ValidationIssue[] = [];

  const elem1Diam = joint.elem1DiameterMm ?? joint.diameterMm;
  const elem2Diam = joint.elem2DiameterMm ?? joint.diameterMm;
  const elem1Wall = joint.elem1WallThickness ?? joint.wallThickness;
  const elem2Wall = joint.elem2WallThickness ?? joint.wallThickness;

  // =========================================================================
  // БЛОК 5: ОГРАНИЧЕНИЕ ЭКСТРЕМАЛЬНЫХ ЗНАЧЕНИЙ (BOUNDARY CHECKS)
  // =========================================================================
  if (!joint.diameterMm || joint.diameterMm < 10 || joint.diameterMm > 2520) {
    issues.push({
      id: 'bnd-diam-range',
      category: 'boundary',
      severity: 'error',
      field: 'diameterMm',
      title: 'Недопустимый диаметр стыка',
      message: `Диаметр стыка (${joint.diameterMm} мм) выходит за допустимые пределы (10…2520 мм).`,
    });
  }

  if (
    !joint.wallThickness ||
    joint.wallThickness < 1.0 ||
    joint.wallThickness > 150.0
  ) {
    issues.push({
      id: 'bnd-wall-range',
      category: 'boundary',
      severity: 'error',
      field: 'wallThickness',
      title: 'Недопустимая толщина стенки',
      message: `Толщина стенки (${joint.wallThickness} мм) должна быть в диапазоне от 1.0 до 150.0 мм.`,
    });
  } else if (joint.wallThickness >= joint.diameterMm / 2) {
    issues.push({
      id: 'bnd-wall-vs-diam',
      category: 'boundary',
      severity: 'error',
      field: 'wallThickness',
      title: 'Физически невозможная геометрия трубы',
      message: `Толщина стенки (${joint.wallThickness} мм) не может быть больше или равна половине наружного диаметра (${joint.diameterMm / 2} мм).`,
    });
  }

  // Проверка длин элементов 1 и 2
  const len1Num = parseDecimalNumber(joint.elem1Length);
  if (joint.elem1Length && String(joint.elem1Length).trim() !== '') {
    if (len1Num === undefined || len1Num <= 0 || len1Num > 36.0) {
      issues.push({
        id: 'bnd-len1',
        category: 'boundary',
        severity: 'error',
        field: 'elem1Length',
        title: 'Некорректная длина Элемента 1',
        message: `Длина Элемента 1 («${joint.elem1Length}» м) должна быть числом от 0.01 до 36.0 м.`,
      });
    }
  }

  const len2Num = parseDecimalNumber(joint.elem2Length);
  if (joint.elem2Length && String(joint.elem2Length).trim() !== '') {
    if (len2Num === undefined || len2Num <= 0 || len2Num > 36.0) {
      issues.push({
        id: 'bnd-len2',
        category: 'boundary',
        severity: 'error',
        field: 'elem2Length',
        title: 'Некорректная длина Элемента 2',
        message: `Длина Элемента 2 («${joint.elem2Length}» м) должна быть числом от 0.01 до 36.0 м.`,
      });
    }
  }

  // Проверка температуры воздуха и подогрева
  const ambNum = parseDecimalNumber(joint.ambientTemp);
  if (
    joint.ambientTemp &&
    ambNum !== undefined &&
    (ambNum < -65 || ambNum > 60)
  ) {
    issues.push({
      id: 'bnd-amb-temp',
      category: 'boundary',
      severity: 'error',
      field: 'ambientTemp',
      title: 'Экстремальная температура воздуха',
      message: `Температура окружающего воздуха (${ambNum} °C) выходит за пределы климатических норм (-65…+60 °C).`,
    });
  }

  const preheatNum = parseDecimalNumber(joint.preheatTemp);
  if (
    joint.preheatTemp &&
    String(joint.preheatTemp).trim() !== '' &&
    String(joint.preheatTemp).toLowerCase() !== 'н/п'
  ) {
    if (preheatNum === undefined || preheatNum < 0 || preheatNum > 450) {
      issues.push({
        id: 'bnd-preheat-temp',
        category: 'boundary',
        severity: 'error',
        field: 'preheatTemp',
        title: 'Недопустимая температура подогрева',
        message: `Температура подогрева («${joint.preheatTemp}» °C) должна находиться в пределах от 0 до +450 °C.`,
      });
    }
  }

  // =========================================================================
  // БЛОК 1: ХРОНОЛОГИЯ ДАТ, УДОСТОВЕРЕНИЯ НАКС И ВХОДНОЙ КОНТРОЛЬ СМ
  // =========================================================================
  const weldDateInfo = sanitizeAndParseDateISO(joint.weldingDate);
  const vikDateInfo = sanitizeAndParseDateISO(joint.vikDate);
  const ndtDateInfo = sanitizeAndParseDateISO(joint.ndtDate);
  const dupDateInfo = sanitizeAndParseDateISO(joint.dupNdtDate);

  if (!weldDateInfo.isValid && weldDateInfo.errorMessage) {
    issues.push({
      id: 'chr-invalid-weld-date',
      category: 'chronology',
      severity: 'error',
      field: 'weldingDate',
      title: 'Ошибка в дате сварки',
      message: weldDateInfo.errorMessage,
    });
  }
  if (!vikDateInfo.isValid && vikDateInfo.errorMessage) {
    issues.push({
      id: 'chr-invalid-vik-date',
      category: 'chronology',
      severity: 'error',
      field: 'vikDate',
      title: 'Ошибка в дате ВИК',
      message: vikDateInfo.errorMessage,
    });
  }
  if (!ndtDateInfo.isValid && ndtDateInfo.errorMessage) {
    issues.push({
      id: 'chr-invalid-ndt-date',
      category: 'chronology',
      severity: 'error',
      field: 'ndtDate',
      title: 'Ошибка в дате НК',
      message: ndtDateInfo.errorMessage,
    });
  }

  const wIso = weldDateInfo.isoDate;
  const vIso = vikDateInfo.isoDate;
  const nIso = ndtDateInfo.isoDate;
  const dIso = dupDateInfo.isoDate;

  // Запрет дат из далекого будущего
  for (const [label, iso] of [
    ['Дата сварки', wIso],
    ['Дата ВИК', vIso],
    ['Дата НК', nIso],
    ['Дата дублирующего НК', dIso],
  ]) {
    if (iso && parseInt(iso.slice(0, 4), 10) > maxAllowedYear) {
      issues.push({
        id: `chr-future-${label}`,
        category: 'chronology',
        severity: 'warning',
        title: 'Подозрительная дата из будущего',
        message: `${label} (${formatDateDDMMYY(iso)}) превышает допустимый горизонт планирования (${maxAllowedYear} г.). Проверьте на опечатку.`,
      });
    }
  }

  // Последовательность: Сварка <= ВИК <= НК <= Дублирующий НК
  if (wIso && vIso && joint.vikResult !== 'Не проводился' && vIso < wIso) {
    issues.push({
      id: 'chr-vik-before-weld',
      category: 'chronology',
      severity: 'warning',
      field: 'vikDate',
      title: 'Нарушение хронологии: ВИК раньше сварки',
      message: `Дата ВИК (${formatDateDDMMYY(vIso)}) не может быть раньше даты сварки стыка (${formatDateDDMMYY(wIso)}).`,
    });
  }

  if (
    vIso &&
    nIso &&
    joint.ndtType !== 'Не требуется' &&
    joint.ndtResult !== 'Не проводился' &&
    nIso < vIso
  ) {
    issues.push({
      id: 'chr-ndt-before-vik',
      category: 'chronology',
      severity: 'warning',
      field: 'ndtDate',
      title: 'Нарушение хронологии: НК раньше ВИК',
      message: `Дата проведения НК (${formatDateDDMMYY(nIso)}) раньше даты визуально-измерительного контроля ВИК (${formatDateDDMMYY(vIso)}).`,
    });
  } else if (
    wIso &&
    nIso &&
    joint.ndtType !== 'Не требуется' &&
    joint.ndtResult !== 'Не проводился' &&
    nIso < wIso
  ) {
    issues.push({
      id: 'chr-ndt-before-weld',
      category: 'chronology',
      severity: 'warning',
      field: 'ndtDate',
      title: 'Нарушение хронологии: НК раньше сварки',
      message: `Дата проведения НК (${formatDateDDMMYY(nIso)}) раньше даты сварки (${formatDateDDMMYY(wIso)}).`,
    });
  }

  if (
    nIso &&
    dIso &&
    joint.dupNdtType !== 'Не требуется' &&
    joint.dupNdtResult !== 'Не проводился' &&
    dIso < nIso
  ) {
    issues.push({
      id: 'chr-dup-before-ndt',
      category: 'chronology',
      severity: 'warning',
      field: 'dupNdtDate',
      title: 'Нарушение хронологии: Дублирующий НК раньше первичного НК',
      message: `Дата дублирующего контроля (${formatDateDDMMYY(dIso)}) не может быть раньше первичного контроля (${formatDateDDMMYY(nIso)}).`,
    });
  }

  // Проверка удостоверений НАКС и допускных листов сварщиков на дату сварки
  const activeStamps =
    joint.welderStampsList && joint.welderStampsList.length > 0
      ? joint.welderStampsList
      : joint.welderStamp
      ? joint.welderStamp
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  for (const stamp of activeStamps) {
    const welder = welders.find(
      (w) => normalizeStampString(w.stamp) === normalizeStampString(stamp)
    );
    if (!welder) continue;

    if (wIso && welder.certExpiryDate) {
      const expIso = normalizeDateToISO(welder.certExpiryDate);
      if (expIso && wIso > expIso) {
        issues.push({
          id: `chr-naks-expired-${stamp}`,
          category: 'chronology',
          severity: 'warning',
          field: 'welderStamp',
          title: `Истек срок удостоверения НАКС (${welder.stamp})`,
          message: `На дату сварки (${formatDateDDMMYY(wIso)}) срок действия удостоверения НАКС № ${welder.certNumber} у сварщика ${welder.fullName} истек (${formatDateDDMMYY(expIso)}).`,
        });
      }
    }

    if (wIso && welder.certIssueDate) {
      const issIso = normalizeDateToISO(welder.certIssueDate);
      if (issIso && wIso < issIso) {
        issues.push({
          id: `chr-naks-not-issued-${stamp}`,
          category: 'chronology',
          severity: 'warning',
          field: 'welderStamp',
          title: `Дата сварки раньше выдачи НАКС (${welder.stamp})`,
          message: `Дата сварки (${formatDateDDMMYY(wIso)}) раньше даты выдачи удостоверения НАКС № ${welder.certNumber} (${formatDateDDMMYY(issIso)}).`,
        });
      }
    }

    if (wIso && welder.admissionSheetDate) {
      const admIso = normalizeDateToISO(welder.admissionSheetDate);
      if (admIso && wIso < admIso) {
        issues.push({
          id: `chr-admission-sheet-${stamp}`,
          category: 'chronology',
          severity: 'warning',
          field: 'welderStamp',
          title: `Сварка раньше даты допускного листа (${welder.stamp})`,
          message: `Дата сварки (${formatDateDDMMYY(wIso)}) раньше оформления допускного листа № ${welder.admissionSheetNumber || 'б/н'} от ${formatDateDDMMYY(admIso)}.`,
        });
      }
    }

    // Блок 2.2: Проверка допуска сварщика к способу сварки
    if (
      welder.allowedMethods &&
      welder.allowedMethods.length > 0 &&
      joint.weldingType &&
      !(welder.allowedMethods as string[]).includes(joint.weldingType)
    ) {
      issues.push({
        id: `tech-welder-method-${stamp}`,
        category: 'tech',
        severity: 'warning',
        field: 'weldingType',
        title: `Способ сварки не входит в допуск НАКС (${welder.stamp})`,
        message: `Сварщик ${welder.fullName} (${welder.stamp}) аттестован на [${welder.allowedMethods.join(', ')}], но для стыка указан вид сварки «${joint.weldingType}».`,
      });
    }
  }

  // Проверка даты входного контроля (ВК) и статуса сварочных материалов
  const matchedMaterial = weldingMaterials.find(
    (m) => m.brandAndDiameter === joint.weldingMaterials
  );
  if (matchedMaterial) {
    if (matchedMaterial.status === 'На испытании') {
      issues.push({
        id: 'chr-mat-testing',
        category: 'chronology',
        severity: 'warning',
        field: 'weldingMaterials',
        title: 'Сварочный материал находится «На испытании»',
        message: `Партия сварочных материалов «${matchedMaterial.brandAndDiameter}» (серт. ${matchedMaterial.certificateNumber}) имеет статус «На испытании» и еще не допущена в производство.`,
      });
    }
    if (wIso && matchedMaterial.incomingControlDate) {
      const vkIso = normalizeDateToISO(matchedMaterial.incomingControlDate);
      if (vkIso && wIso < vkIso) {
        issues.push({
          id: 'chr-mat-vk-date',
          category: 'chronology',
          severity: 'warning',
          field: 'weldingMaterials',
          title: 'Сварка раньше даты входного контроля СМ',
          message: `Дата сварки стыка (${formatDateDDMMYY(wIso)}) раньше даты акта входного контроля сварочных материалов № ${matchedMaterial.incomingControlAct} от ${formatDateDDMMYY(vkIso)}.`,
        });
      }
    }
  }

  // =========================================================================
  // БЛОК 2: ТЕХНОЛОГИЧЕСКИЙ И НОРМАТИВНЫЙ КОНТРОЛЬ (ТК, ЛРВ, СТАЛИ, ГЕОМЕТРИЯ)
  // =========================================================================
  const selectedTc = techCards.find((tc) => tc.number === joint.techCardNumber);
  if (selectedTc) {
    // 2.1 Попадание диаметра в диапазон ТК
    if (
      joint.diameterMm < selectedTc.minDiameterMm ||
      joint.diameterMm > selectedTc.maxDiameterMm
    ) {
      issues.push({
        id: 'tech-tc-diam-range',
        category: 'tech',
        severity: 'warning',
        field: 'techCardNumber',
        title: 'Диаметр стыка не соответствует техкарте (ТК)',
        message: `Диаметр стыка Ø${joint.diameterMm} мм выходит за рабочий диапазон техкарты ${selectedTc.number} (Ø${selectedTc.minDiameterMm}…${selectedTc.maxDiameterMm} мм).`,
      });
    }

    // Попадание толщины стенки в диапазон ТК
    if (
      joint.wallThickness < selectedTc.minWallThicknessMm ||
      joint.wallThickness > selectedTc.maxWallThicknessMm
    ) {
      issues.push({
        id: 'tech-tc-wall-range',
        category: 'tech',
        severity: 'warning',
        field: 'techCardNumber',
        title: 'Толщина стенки не соответствует техкарте (ТК)',
        message: `Толщина стенки S=${joint.wallThickness} мм выходит за диапазон техкарты ${selectedTc.number} (${selectedTc.minWallThicknessMm}…${selectedTc.maxWallThicknessMm} мм).`,
      });
    }

    // Соответствие марки стали элемента группе сталей ТК
    const tcSteelUpper = selectedTc.steelGroup.toUpperCase();
    const mat1Upper = (joint.elem1Material || '').toUpperCase().trim();
    const mat2Upper = (joint.elem2Material || '').toUpperCase().trim();
    if (
      mat1Upper &&
      !tcSteelUpper.includes(mat1Upper) &&
      getSteelClass(mat1Upper) === 'stainless' &&
      !tcSteelUpper.includes('12Х18') &&
      !tcSteelUpper.includes('М11')
    ) {
      issues.push({
        id: 'tech-tc-steel-mismatch',
        category: 'tech',
        severity: 'warning',
        field: 'techCardNumber',
        title: 'Марка стали не соответствует группе сталей ТК',
        message: `Сталь элемента (${joint.elem1Material} / ${joint.elem2Material}) не входит в область применения техкарты ${selectedTc.number} (${selectedTc.steelGroup}).`,
      });
    }
  }

  // 2.3 Контроль свариваемости разнородных сталей
  const class1 = getSteelClass(joint.elem1Material);
  const class2 = getSteelClass(joint.elem2Material);
  if (
    class1 !== 'other' &&
    class2 !== 'other' &&
    class1 !== class2
  ) {
    issues.push({
      id: 'tech-dissimilar-steels',
      category: 'tech',
      severity: 'warning',
      field: 'elem2Material',
      title: 'Сварка разнородных сталей (углеродистая + нержавеющая)',
      message: `Элемент 1 (${joint.elem1Material}) и Элемент 2 (${joint.elem2Material}) относятся к разным структурным классам сталей. Требуется специальная ТК и переходные аустенитные сварочные материалы (напр. ЦЛ-11 / ОЗЛ-6).`,
    });
  }

  // 2.4 Проверка разнотолщинности свариваемых элементов
  const wallDiff = Math.abs(elem1Wall - elem2Wall);
  if (wallDiff > 1.5) {
    issues.push({
      id: 'tech-wall-diff',
      category: 'tech',
      severity: 'warning',
      field: 'elem2WallThickness',
      title: `Разнотолщинность элементов (ΔS = ${wallDiff.toFixed(1)} мм)`,
      message: `Толщины стенок Элемента 1 (${elem1Wall} мм) и Элемента 2 (${elem2Wall} мм) отличаются на ${wallDiff.toFixed(1)} мм. По ГОСТ 16037-80 и СТО Газпром требуется специальная коническая разделка/проточка более толстой кромки под углом ≤ 15°.`,
    });
  }

  // 2.5 Контроль остатков материалов по спецификации ЛРВ (с приоритетом по шифру РД стыка)
  for (const [elemIdx, code, lenNum] of [
    [1, joint.lrv1Code, len1Num] as const,
    [2, joint.lrv2Code, len2Num] as const,
  ]) {
    if (!code) continue;
    const lrvItem =
      lrvCatalog.find(
        (i) => i.lrvCode === code && i.rdCode === joint.rdCode
      ) || lrvCatalog.find((i) => i.lrvCode === code);
    if (!lrvItem) continue;

    if (lrvItem.unit === 'м' && lenNum !== undefined && lenNum > 0) {
      // Считаем суммарный расход метров по данному коду ЛРВ во всех остальных стыках этого же шифра РД
      let usedMeters = lenNum;
      for (const other of allJoints) {
        if (other.id === joint.id) continue;
        if (lrvItem.rdCode && other.rdCode && other.rdCode !== lrvItem.rdCode) {
          continue;
        }
        if (other.lrv1Code === code) {
          usedMeters += parseDecimalNumber(other.elem1Length) || 0;
        }
        if (other.lrv2Code === code) {
          usedMeters += parseDecimalNumber(other.elem2Length) || 0;
        }
      }
      if (usedMeters > lrvItem.specQty) {
        issues.push({
          id: `tech-lrv-overuse-m-${elemIdx}`,
          category: 'tech',
          severity: 'warning',
          field: elemIdx === 1 ? 'elem1Length' : 'elem2Length',
          title: `Превышение лимита по спецификации ЛРВ (${code})`,
          message: `Суммарная длина труб по коду ${code} во всех стыках (${lrvItem.rdCode}) составляет ${usedMeters.toFixed(2)} м, что превышает объем по спецификации (${lrvItem.specQty} м).`,
        });
      }
    }
  }

  // 2.6 Проверка корректности длин для фасонных деталей (отводы, фланцы, тройники, заглушки)
  for (const [elemIdx, name, lenNum] of [
    [1, joint.elem1Name, len1Num] as const,
    [2, joint.elem2Name, len2Num] as const,
  ]) {
    if (!name || lenNum === undefined) continue;
    const cat = detectLrvElementType(name);
    if (
      (cat === 'Отвод' ||
        cat === 'Фланец' ||
        cat === 'Заглушка' ||
        cat === 'Тройник' ||
        cat === 'Переход') &&
      lenNum > 2.5
    ) {
      issues.push({
        id: `tech-fitting-length-${elemIdx}`,
        category: 'tech',
        severity: 'warning',
        field: elemIdx === 1 ? 'elem1Length' : 'elem2Length',
        title: `Нетипично большая длина для фасонной детали (${cat})`,
        message: `Для Элемента ${elemIdx} «${name}» указана длина ${lenNum} м (как для трубы). Проверьте, нет ли опечатки в строительной длине детали.`,
      });
    }
  }

  // =========================================================================
  // БЛОК 3: КОНТРОЛЬ ЛОГИКИ НК, ВИК И РЕМОНТА
  // =========================================================================
  // 3.1 Запрет положительного НК при браке или отсутствии ВИК
  if (
    joint.ndtType !== 'Не требуется' &&
    joint.ndtResult === 'Годен' &&
    joint.vikResult !== 'Годен'
  ) {
    issues.push({
      id: 'ndt-valid-without-vik',
      category: 'ndt',
      severity: 'warning',
      field: 'ndtResult',
      title: 'Положительный НК без годного ВИК',
      message: `По физическому контролю (${joint.ndtType}) выставлено заключение «Годен», однако по ВИК статус «${joint.vikResult}». По нормам НК допускается только после успешного ВИК.`,
    });
  }

  // 3.2 Обязательность дублирующего контроля после ремонта
  if (
    (joint.vikResult === 'Ремонт' || joint.ndtResult === 'Ремонт') &&
    (joint.dupNdtType === 'Не требуется' || joint.dupNdtResult === 'Не проводился')
  ) {
    issues.push({
      id: 'ndt-repair-needs-dup',
      category: 'ndt',
      severity: 'warning',
      field: 'dupNdtResult',
      title: 'Требуется дублирующий контроль после ремонта',
      message: `По стыку назначен «Ремонт». Для закрытия стыка необходимо указать вид и результат дублирующего контроля в объеме 100%.`,
    });
  }

  // 3.4 Контроль проектного процента НК по лайнлисту
  const matchedLine = projectLineList.find(
    (l) => l.uniqueLineId === joint.uniqueLineId
  );
  if (matchedLine) {
    const requires100Pct =
      matchedLine.rkPercent === 100 ||
      matchedLine.uzkPercent === 100 ||
      matchedLine.pvkPercent === 100;
    if (requires100Pct && joint.ndtType === 'Не требуется') {
      issues.push({
        id: 'ndt-linelist-100pct',
        category: 'ndt',
        severity: 'warning',
        field: 'ndtType',
        title: 'Нарушение проектного объема НК по лайнлисту',
        message: `По лайнлисту для линии «${matchedLine.lineNumber}» предусмотрен 100% неразрушающий контроль (РК: ${matchedLine.rkPercent}%, УЗК: ${matchedLine.uzkPercent}%), но в паспорте стыка выбрано «Не требуется».`,
      });
    }
  }

  // =========================================================================
  // БЛОК 4: ССЫЛОЧНАЯ ЦЕЛОСТНОСТЬ И УНИКАЛЬНОСТЬ ЗАВОДСКИХ НОМЕРОВ ДЕТАЛЕЙ
  // =========================================================================
  for (const [elemIdx, facNum, elemName] of [
    [1, joint.elem1FactoryNumber, joint.elem1Name] as const,
    [2, joint.elem2FactoryNumber, joint.elem2Name] as const,
  ]) {
    const cleanFac = sanitizeCleanString(facNum);
    if (!cleanFac || cleanFac === '—' || cleanFac.toLowerCase() === 'б/н') {
      continue;
    }

    const maxEnds = getMaxWeldEndsForElement(elemName);
    const usedInJoints: string[] = [];

    // Проверяем сколько раз этот заводской номер уже приварен в других стыках
    for (const other of allJoints) {
      if (other.id === joint.id) continue;
      const f1 = sanitizeCleanString(other.elem1FactoryNumber);
      const f2 = sanitizeCleanString(other.elem2FactoryNumber);
      if (
        f1.toLowerCase() === cleanFac.toLowerCase() ||
        f2.toLowerCase() === cleanFac.toLowerCase()
      ) {
        usedInJoints.push(`№${other.jointNumber} (${other.lineNumber})`);
      }
    }

    if (usedInJoints.length >= maxEnds) {
      const cat = detectLrvElementType(elemName);
      issues.push({
        id: `ref-factory-num-ends-${elemIdx}`,
        category: 'referential',
        severity: 'warning',
        field: elemIdx === 1 ? 'elem1FactoryNumber' : 'elem2FactoryNumber',
        title: `Исчерпано число свариваемых торцов детали (${cleanFac})`,
        message: `Деталь «${elemName}» (${cat}, макс. торцов: ${maxEnds}) с заводским № «${cleanFac}» уже приварена в стыках: ${usedInJoints.join(', ')}.`,
      });
    }
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  return {
    isValidToSave: errors.length === 0,
    errors,
    warnings,
    allIssues: issues,
  };
}

/**
 * Блок 4.1: Проверка ссылочной целостности перед удалением записей из справочников
 * (Лайнлист, Каталог ЛРВ, Сварщики, Техкарты)
 */
export function checkReferentialIntegrityBeforeDelete(params: {
  entityType: 'line' | 'lrv' | 'welder' | 'techCard' | 'material';
  identifier: string;
  allJoints: WeldJoint[];
}): { canDelete: boolean; dependentJointsCount: number; message: string } {
  const { entityType, identifier, allJoints } = params;
  const cleanId = sanitizeCleanString(identifier).toLowerCase();

  let matched: WeldJoint[] = [];

  if (entityType === 'line') {
    matched = allJoints.filter(
      (j) =>
        j.uniqueLineId.toLowerCase() === cleanId ||
        j.lineNumber.toLowerCase() === cleanId
    );
  } else if (entityType === 'lrv') {
    matched = allJoints.filter(
      (j) =>
        j.lrv1Code.toLowerCase() === cleanId ||
        j.lrv2Code.toLowerCase() === cleanId
    );
  } else if (entityType === 'welder') {
    matched = allJoints.filter(
      (j) =>
        normalizeStampString(j.welderStamp) === normalizeStampString(identifier) ||
        (j.welderStampsList || []).some(
          (s) => normalizeStampString(s) === normalizeStampString(identifier)
        )
    );
  } else if (entityType === 'techCard') {
    matched = allJoints.filter(
      (j) => j.techCardNumber.toLowerCase() === cleanId
    );
  } else if (entityType === 'material') {
    matched = allJoints.filter(
      (j) => j.weldingMaterials.toLowerCase() === cleanId
    );
  }

  if (matched.length === 0) {
    return {
      canDelete: true,
      dependentJointsCount: 0,
      message: 'Запись не используется в реестре стыков и может быть безопасно удалена.',
    };
  }

  const sampleList = matched
    .slice(0, 5)
    .map((j) => `№${j.jointNumber} (${j.lineNumber})`)
    .join(', ');

  return {
    canDelete: false,
    dependentJointsCount: matched.length,
    message: `Запись «${identifier}» используется в ${matched.length} стыках реестра (${sampleList}${
      matched.length > 5 ? ' и др.' : ''
    }). Удаление заблокировано для сохранения целостности журналов.`,
  };
}
