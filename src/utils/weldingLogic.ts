/**
 * Единый фасад бизнес-логики учета сварочных работ и неразрушающего контроля (НК).
 * Реэкспортирует доменные модули (dates, pipeCalc, history, columns, readiness, journals)
 * и содержит платформенные сервисы импорта/синхронизации и справочников.
 */

import {
  AuditLogEntry,
  FacilityObject,
  LRVItem,
  ProjectLineItem,
  WelderNaksCert,
  WelderProfile,
  WeldJoint,
} from '../types/welding';
import {
  formatDateDDMMYY,
  isDateColumnKey,
  normalizeDateToISO,
} from './dates';
import {
  detectLrvConnectionType,
  mmToNominalBoreDn,
  resolveLrvItemCategory,
} from './pipeCalc';
import { isJointFullyAccepted } from './readiness';
import { determineDateObservationStatus } from './weatherService';

// Реэкспорт всех специализированных доменных модулей (100% обратная совместимость)
export * from './dates';
export * from './pipeCalc';
export * from './history';
export * from './columns';
export * from './readiness';
export * from './journals';
export * from './weatherService';
export { ROSGIDROMET_STATIONS, ROSHIDROMET_STATIONS } from '../data/rosgidrometStations';

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
 * Результат проверки соединения на разнотолщинность по п. 14.3 СТО Газпром 15-1.1-002-2023
 */
export interface WallThicknessTransitionCheck {
  isDifferentThickness: boolean;
  diffMm: number;
  ratio: number;
  requiresBevel: boolean; // |S1 - S2| > 2 мм -> требуется расточка/скос кромок
  isDirectWeldingForbidden: boolean; // Smax / Smin > 1.5 -> прямая сварка запрещена
  warning?: string;
  error?: string;
}

/**
 * Проверка разнотолщинности свариваемых элементов по п. 14.3 СТО Газпром 15-1.1-002-2023.
 * - При разности толщин стенок более 2.0 мм соединение считается разнотолщинным
 *   и требует специальной разделки/расточки кромок с уклоном не круче 1:4.
 * - При отношении толщин стенок Smax / Smin > 1.5 прямая сварка элементов запрещена!
 *   Требуется применение переходного кольца длиной не менее 250 мм или калиброванной переходной детали.
 */
export function checkWallThicknessTransition(
  s1: number | string | undefined | null,
  s2: number | string | undefined | null
): WallThicknessTransitionCheck {
  const numS1 = typeof s1 === 'number' ? s1 : parseFloat(String(s1 || '').replace(',', '.'));
  const numS2 = typeof s2 === 'number' ? s2 : parseFloat(String(s2 || '').replace(',', '.'));

  if (Number.isNaN(numS1) || Number.isNaN(numS2) || numS1 <= 0 || numS2 <= 0) {
    return {
      isDifferentThickness: false,
      diffMm: 0,
      ratio: 1,
      requiresBevel: false,
      isDirectWeldingForbidden: false,
    };
  }

  const minS = Math.min(numS1, numS2);
  const maxS = Math.max(numS1, numS2);
  const diffMm = Math.round(Math.abs(numS1 - numS2) * 100) / 100;
  const ratio = Math.round((maxS / minS) * 100) / 100;

  const requiresBevel = diffMm > 2.0;
  const isDirectWeldingForbidden = ratio > 1.5;

  let warning: string | undefined;
  let error: string | undefined;

  if (isDirectWeldingForbidden) {
    error = `Отношение толщин стенок ${ratio} > 1.5 (${maxS} / ${minS} мм). Прямая сварка разнотолщинных элементов категорически запрещена п. 14.3 СТО Газпром 15-1.1-002-2023. Требуется переходное кольцо длиной ≥ 250 мм или переходная деталь.`;
  } else if (requiresBevel) {
    warning = `Разнотолщинное соединение: разность стенок ΔS = ${diffMm} мм (> 2.0 мм). По п. 14.3 СТО Газпром 15-1.1-002-2023 требуется внутренняя или наружная механическая обработка (расточка) кромок с уклоном не круче 1:4.`;
  }

  return {
    isDifferentThickness: diffMm > 0.05,
    diffMm,
    ratio,
    requiresBevel,
    isDirectWeldingForbidden,
    warning,
    error,
  };
}

/**
 * Результат проверки допустимости ремонта шва по СТО Газпром 15-1.1-002-2023 (раздел 19)
 */
export interface RepairEligibilityCheck {
  isValid: boolean;
  perimeterMm: number;
  maxAllowableLengthMm: number;
  ratioFactor: 6 | 8;
  isExceeded: boolean;
  isCracksForbidden: boolean;
  isSecondRepairForbidden: boolean;
  forcedAction?: 'Вырезано';
  message: string;
}

/**
 * Проверка допустимости проведения ремонта сварного шва:
 * 1. Запрет повторного ремонта (п. 19.3): повторный ремонт запрещен стандартом -> только вырезка катушки.
 * 2. Запрет ремонта трещин (п. 19.1): трещины любого типа и размера ремонту не подлежат -> только вырезка катушки.
 * 3. Лимит длины выборки (п. 19.4): суммарная длина участков ремонта не должна превышать 1/6 длины периметра
 *    (для сейсмоопасных зон >= 6 баллов и зон тектонических разломов — не более 1/8). При превышении -> только вырезка катушки.
 */
export function checkRepairEligibility(
  diameterMm: number | string | undefined | null,
  repairLengthMm: number | string | undefined | null,
  defectType?: string | null,
  previousRepairCount = 0,
  isSeismicOrFault = false
): RepairEligibilityCheck {
  const d = typeof diameterMm === 'number' ? diameterMm : parseFloat(String(diameterMm || '').replace(',', '.'));
  const validD = !Number.isNaN(d) && d > 0 ? d : 0;
  const perimeterMm = Math.round(Math.PI * validD * 10) / 10;
  const ratioFactor: 6 | 8 = isSeismicOrFault ? 8 : 6;
  const maxAllowableLengthMm = Math.round((perimeterMm / ratioFactor) * 10) / 10;

  const len = typeof repairLengthMm === 'number' ? repairLengthMm : parseFloat(String(repairLengthMm || '').replace(',', '.'));
  const validLen = !Number.isNaN(len) && len > 0 ? len : 0;

  // 1. Повторный ремонт
  if (previousRepairCount >= 1) {
    return {
      isValid: false,
      perimeterMm,
      maxAllowableLengthMm,
      ratioFactor,
      isExceeded: false,
      isCracksForbidden: false,
      isSecondRepairForbidden: true,
      forcedAction: 'Вырезано',
      message: 'Повторный ремонт сварного соединения запрещен п. 19.3 СТО Газпром 15-1.1-002-2023. Стык подлежит только вырезке катушки.',
    };
  }

  // 2. Трещины
  const cleanDefect = String(defectType || '').trim().toLowerCase();
  if (cleanDefect.includes('трещин') || cleanDefect === 'трещина') {
    return {
      isValid: false,
      perimeterMm,
      maxAllowableLengthMm,
      ratioFactor,
      isExceeded: false,
      isCracksForbidden: true,
      isSecondRepairForbidden: false,
      forcedAction: 'Вырезано',
      message: 'Сварные соединения с трещинами любого вида ремонту не подлежат согласно п. 19.1 СТО Газпром 15-1.1-002-2023. Стык подлежит только вырезке катушки.',
    };
  }

  // 3. Превышение длины выборки
  if (validLen > maxAllowableLengthMm && maxAllowableLengthMm > 0) {
    return {
      isValid: false,
      perimeterMm,
      maxAllowableLengthMm,
      ratioFactor,
      isExceeded: true,
      isCracksForbidden: false,
      isSecondRepairForbidden: false,
      forcedAction: 'Вырезано',
      message: `Суммарная длина выборки (${validLen} мм) превышает допустимый предел 1/${ratioFactor} периметра стыка (${maxAllowableLengthMm} мм при Ø${validD} мм). Согласно п. 19.4 СТО Газпром 15-1.1-002-2023 стык подлежит только вырезке катушки.`,
    };
  }

  return {
    isValid: true,
    perimeterMm,
    maxAllowableLengthMm,
    ratioFactor,
    isExceeded: false,
    isCracksForbidden: false,
    isSecondRepairForbidden: false,
    message: `Допустимо. Суммарная длина выборки: ${validLen} мм (макс. предел: ${maxAllowableLengthMm} мм, 1/${ratioFactor} периметра).`,
  };
}

/**
 * Проверяет, аттестован ли сварщик на требуемый способ сварки.
 * Если у сварщика есть удостоверение НАКС на указанный способ (или комбинированный допуск),
 * возвращает isAllowed: true. В противном случае isAllowed: false с понятной причиной.
 */
export function checkWelderMethodCompliance(
  welder: WelderProfile | undefined | null,
  requiredMethod?: string
): { isAllowed: boolean; reason?: string } {
  if (!welder || !requiredMethod || !requiredMethod.trim()) {
    return { isAllowed: true };
  }

  const req = requiredMethod.trim();

  // Для бригадного клейма проверяем состав бригады и общие допуски
  if (welder.isBrigade) {
    const methods = welder.allowedMethods || [];
    const hasMatch = methods.some(
      (m) => m === req || m.includes(req) || req.includes(m)
    );
    if (hasMatch) return { isAllowed: true };
    return {
      isAllowed: false,
      reason: `Бригада не аттестована на ${req}`,
    };
  }

  // 1. Проверяем индивидуальные удостоверения НАКС по способам (naksCerts)
  if (welder.naksCerts && welder.naksCerts.length > 0) {
    const hasCert = welder.naksCerts.some((c) => {
      if (c.weldingType === req) return true;
      if (req === 'РАД' && (c.weldingType === 'РАД' || c.weldingType === 'РАД+РД')) return true;
      if (req === 'РД' && (c.weldingType === 'РД' || c.weldingType === 'РАД+РД')) return true;
      if (req === 'РАД+РД' && c.weldingType === 'РАД+РД') return true;
      return false;
    });
    if (hasCert) return { isAllowed: true };

    // Если требуется РАД+РД, но у сварщика есть раздельные удостоверения и на РАД, и на РД
    if (req === 'РАД+РД') {
      const hasRad = welder.naksCerts.some((c) => c.weldingType === 'РАД');
      const hasRd = welder.naksCerts.some((c) => c.weldingType === 'РД');
      if (hasRad && hasRd) return { isAllowed: true };
    }
  }

  // 2. Проверяем список разрешенных методов (allowedMethods)
  const methods = welder.allowedMethods || [];
  const hasMethod = methods.some((m) => {
    if (m === req) return true;
    if (req === 'РАД' && (m === 'РАД' || m === 'РАД+РД')) return true;
    if (req === 'РД' && (m === 'РД' || m === 'РАД+РД')) return true;
    if (req === 'РАД+РД' && m === 'РАД+РД') return true;
    return false;
  });
  if (hasMethod) return { isAllowed: true };

  if (req === 'РАД+РД' && methods.includes('РАД') && methods.includes('РД')) {
    return { isAllowed: true };
  }

  // 3. Фолбэк по текстовой области аттестации
  const area = welder.attestationArea || '';
  if (
    area.includes(req) ||
    (req === 'РАД' && area.includes('РАД')) ||
    (req === 'РД' && area.includes('РД'))
  ) {
    return { isAllowed: true };
  }

  return {
    isAllowed: false,
    reason: `Нет аттестации на ${req}`,
  };
}

/**
 * Валидация соответствия аттестации НАКС сварщика свариваемому соединению
 */
export interface WelderNaksComplianceCheck {
  isValid: boolean;
  isDiameterValid: boolean;
  isThicknessValid: boolean;
  isSteelGroupValid: boolean;
  isMethodValid: boolean;
  warnings: string[];
  errors: string[];
}

export function validateWelderNaksAttestation(
  welder: WelderProfile | undefined | null,
  joint: {
    diameterMm: number;
    wallThickness: number;
    steelGroup?: string;
    weldingType?: string;
  }
): WelderNaksComplianceCheck {
  if (!welder) {
    return {
      isValid: false,
      isDiameterValid: false,
      isThicknessValid: false,
      isSteelGroupValid: false,
      isMethodValid: false,
      warnings: [],
      errors: ['Сварщик не найден или не выбран'],
    };
  }

  const warnings: string[] = [];
  const errors: string[] = [];

  // Парсинг параметров из attestationArea, если структурированные поля не заполнены
  const area = welder.attestationArea || '';

  // Если указан способ сварки, находим конкретное удостоверение НАКС на этот способ
  const specificCert: WelderNaksCert | undefined = joint.weldingType && welder.naksCerts
    ? welder.naksCerts.find(
        (c) =>
          c.weldingType === joint.weldingType ||
          (joint.weldingType === 'РАД' && c.weldingType === 'РАД+РД') ||
          (joint.weldingType === 'РД' && c.weldingType === 'РАД+РД')
      )
    : undefined;

  // 1. Диаметр (приоритет: поля конкретного удостоверения НАКС на способ)
  let minD = specificCert?.minDiameterMm ?? welder.minDiameterMm;
  let maxD = specificCert?.maxDiameterMm ?? welder.maxDiameterMm;
  if (minD === undefined || maxD === undefined) {
    const dMatch = area.match(/Ø\s*(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)/i);
    if (dMatch) {
      minD = parseFloat(dMatch[1]);
      maxD = parseFloat(dMatch[2]);
    }
  }

  let isDiameterValid = true;
  if (minD !== undefined && maxD !== undefined && joint.diameterMm > 0) {
    if (joint.diameterMm < minD || joint.diameterMm > maxD) {
      isDiameterValid = false;
      const certHint = specificCert ? ` по удостоверению ${specificCert.certNumber} (${specificCert.weldingType})` : '';
      warnings.push(`Диаметр стыка Ø${joint.diameterMm} мм выходит за границы аттестации НАКС сварщика (Ø${minD}–${maxD} мм)${certHint}.`);
    }
  }

  // 2. Толщина стенки (приоритет: поля конкретного удостоверения НАКС на способ)
  let minS = specificCert?.minWallThicknessMm ?? welder.minWallThicknessMm;
  let maxS = specificCert?.maxWallThicknessMm ?? welder.maxWallThicknessMm;
  if (minS === undefined || maxS === undefined) {
    const sMatch = area.match(/S\s*(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)/i);
    if (sMatch) {
      minS = parseFloat(sMatch[1]);
      maxS = parseFloat(sMatch[2]);
    }
  }

  let isThicknessValid = true;
  if (minS !== undefined && maxS !== undefined && joint.wallThickness > 0) {
    if (joint.wallThickness < minS || joint.wallThickness > maxS) {
      isThicknessValid = false;
      const certHint = specificCert ? ` по удостоверению ${specificCert.certNumber} (${specificCert.weldingType})` : '';
      warnings.push(`Толщина стенки S${joint.wallThickness} мм выходит за границы аттестации НАКС сварщика (S${minS}–${maxS} мм)${certHint}.`);
    }
  }

  // 3. Группа стали (приоритет: поля конкретного удостоверения НАКС)
  let isSteelGroupValid = true;
  const jointSteel = (joint.steelGroup || '').toUpperCase().trim();
  if (jointSteel) {
    const rawGroups = (specificCert?.steelGroups && specificCert.steelGroups.length > 0)
      ? specificCert.steelGroups
      : (welder.steelGroups && welder.steelGroups.length > 0)
      ? welder.steelGroups
      : (area.match(/М\d{2}|M\d{2}/gi) || []);
    const allowedGroups = rawGroups.map((g: string) => g.toUpperCase().trim());

    if (allowedGroups.length > 0) {
      const match = allowedGroups.some((g: string) => jointSteel.includes(g) || g.includes(jointSteel));
      if (!match) {
        isSteelGroupValid = false;
        const certHint = specificCert ? ` по удостоверению ${specificCert.certNumber}` : '';
        warnings.push(`Группа стали стыка (${joint.steelGroup}) не входит в аттестованные группы сварщика (${allowedGroups.join(', ')})${certHint}.`);
      }
    }
  }

  // 4. Способ сварки
  let isMethodValid = true;
  const weldMethod = (joint.weldingType || '').trim();
  if (weldMethod) {
    const methodCheck = checkWelderMethodCompliance(welder, weldMethod);
    if (!methodCheck.isAllowed) {
      isMethodValid = false;
      warnings.push(
        `Способ сварки "${weldMethod}" не разрешен в удостоверении НАКС (допущены: ${(welder.allowedMethods || []).join(', ') || '—'}).`
      );
    }
  }

  const isValid = isDiameterValid && isThicknessValid && isSteelGroupValid && isMethodValid;

  return {
    isValid,
    isDiameterValid,
    isThicknessValid,
    isSteelGroupValid,
    isMethodValid,
    warnings,
    errors,
  };
}

/**
 * Персональный расчет выполнения квот неразрушающего контроля (НК) по сварщикам
 * в соответствии с СТО Газпром 15-1.3-004-2023, СП 86.13330.2022 и ГОСТ 32569-2013
 */
export interface WelderNdtQuotaReport {
  stamp: string;
  fullName: string;
  totalWelded: number;
  inspectedCount: number;
  passedCount: number;
  defectCount: number;
  actualNdtPct: number;
  requiredNdtPct: number;
  isCompliant: boolean;
  hasMinimumJointInspected: boolean;
  penaltyRequiredJoints: number; // Требуемое количество дополнительных стыков на контроль из-за брака (удвоение)
  status: 'compliant' | 'warning' | 'penalty_required' | 'critical';
  details: string;
}

export function calculateWelderNdtQuotas(
  joints: WeldJoint[],
  lines: ProjectLineItem[] = []
): WelderNdtQuotaReport[] {
  const lineMap = new Map<string, ProjectLineItem>();
  for (const l of lines) {
    if (l.uniqueLineId) lineMap.set(l.uniqueLineId, l);
  }

  // Группировка стыков по клеймам сварщиков
  const welderStats = new Map<
    string,
    {
      stamp: string;
      fullName: string;
      weldedJoints: WeldJoint[];
      inspectedJoints: WeldJoint[];
      defectJoints: WeldJoint[];
      passedJoints: WeldJoint[];
      highestRequiredPct: number;
    }
  >();

  for (const j of joints) {
    const stamps: string[] = [];
    if (j.welderStampsList && j.welderStampsList.length > 0) {
      stamps.push(...j.welderStampsList);
    } else if (j.welderStamp) {
      stamps.push(...j.welderStamp.split(/[,;/+]+/).map((s) => s.trim()).filter(Boolean));
    }

    if (stamps.length === 0) continue;

    // Определяем требование НК для линии данного стыка
    const line = lineMap.get(j.uniqueLineId);
    let lineRequiredPct = 100;
    if (line) {
      const cat = (line.pipelineCategory || '').toUpperCase().trim();
      const ql = (line.qualityLevel || '').toUpperCase().trim();
      if (cat.includes('III') || cat.includes('IV') || ql === 'С' || ql === 'C') {
        lineRequiredPct = Math.max(line.rkPercent || 0, line.uzkPercent || 0, 20);
      } else {
        lineRequiredPct = 100;
      }
    }

    const isWelded = Boolean(j.weldingDate);
    // Контроль завершен лабораторией с финальным результатом (исключаем «В работе» и «Не проводился»)
    const hasPrimaryNdtFinished =
      Boolean(j.ndtResult) &&
      j.ndtResult !== 'Не проводился' &&
      j.ndtResult !== 'В работе' &&
      j.ndtType !== 'Не требуется';
    const hasDupNdtFinished =
      Boolean(j.dupNdtResult) &&
      j.dupNdtResult !== 'Не проводился' &&
      j.dupNdtResult !== 'В работе' &&
      j.dupNdtType !== 'Не требуется';
    const hasRepairNdtFinished =
      Boolean(j.repairNdtResult) &&
      j.repairNdtResult !== 'Не проводился' &&
      j.repairNdtResult !== 'В работе' &&
      j.repairNdtType !== 'Не требуется';

    const isDefect =
      j.ndtResult === 'Ремонт' ||
      j.ndtResult === 'Вырезать' ||
      j.vikResult === 'Ремонт' ||
      j.vikResult === 'Вырезать' ||
      j.dupNdtResult === 'Ремонт' ||
      j.dupNdtResult === 'Вырезать';

    // Стык фактически проконтролирован, если получен вердикт лаборатории
    const hasNdt = hasPrimaryNdtFinished || hasDupNdtFinished || hasRepairNdtFinished;

    // Стык принят по НК: полностью принят (в т.ч. после ремонта) либо первично годен без дефектов
    const isPassed =
      isJointFullyAccepted(j) ||
      (!isDefect && (j.ndtResult === 'Годен' || j.dupNdtResult === 'Годен'));

    for (const stamp of stamps) {
      if (!welderStats.has(stamp)) {
        welderStats.set(stamp, {
          stamp,
          fullName: j.welderFullName || '',
          weldedJoints: [],
          inspectedJoints: [],
          defectJoints: [],
          passedJoints: [],
          highestRequiredPct: lineRequiredPct,
        });
      }

      const stat = welderStats.get(stamp)!;
      if (!stat.fullName && j.welderFullName) stat.fullName = j.welderFullName;
      if (lineRequiredPct > stat.highestRequiredPct) stat.highestRequiredPct = lineRequiredPct;

      if (isWelded) stat.weldedJoints.push(j);
      if (hasNdt) stat.inspectedJoints.push(j);
      if (isDefect) stat.defectJoints.push(j);
      if (isPassed && !isDefect) stat.passedJoints.push(j);
    }
  }

  const reports: WelderNdtQuotaReport[] = [];

  for (const [, stat] of welderStats) {
    const totalWelded = stat.weldedJoints.length;
    const inspectedCount = stat.inspectedJoints.length;
    const defectCount = stat.defectJoints.length;
    const passedCount = stat.passedJoints.length;

    const actualNdtPct = totalWelded > 0 ? Math.round((inspectedCount / totalWelded) * 1000) / 10 : 0;
    const requiredNdtPct = stat.highestRequiredPct;
    const hasMinimumJointInspected = totalWelded === 0 || inspectedCount >= 1;

    // Правило удвоения при браке: +2 стыка на каждый дефектный стык (п. 5.7 СТО Газпром 15-1.3-004-2023)
    const penaltyRequiredJoints = defectCount * 2;
    const requiredTotalWithPenalty =
      Math.ceil((totalWelded * requiredNdtPct) / 100) + penaltyRequiredJoints;
    const hasPenaltyFulfilled =
      defectCount === 0 ||
      (totalWelded >= requiredTotalWithPenalty &&
        inspectedCount >= requiredTotalWithPenalty &&
        passedCount >= Math.ceil((totalWelded * requiredNdtPct) / 100));

    let isCompliant = true;
    let status: 'compliant' | 'warning' | 'penalty_required' | 'critical' = 'compliant';
    let details = 'Нормативы неразрушающего контроля полностью выполнены.';

    if (totalWelded > 0 && inspectedCount === 0) {
      isCompliant = false;
      status = 'critical';
      details = `Ни один из ${totalWelded} сваренных стыков не проконтролирован! Требуется не менее 1 стыка и ${requiredNdtPct}%.`;
    } else if (defectCount > 0 && !hasPenaltyFulfilled) {
      isCompliant = false;
      status = 'penalty_required';
      details = `Выявлен брак (${defectCount} стык(ов)). По п. 5.7 СТО 15-1.3-004-2023 назначен штрафной контроль удвоенного количества (+${penaltyRequiredJoints} стык(ов)) того же сварщика.`;
    } else if (actualNdtPct < requiredNdtPct) {
      isCompliant = false;
      status = 'warning';
      details = `Фактический объем контроля ${actualNdtPct}% ниже требуемого нормативом (${requiredNdtPct}%). Проконтролировано ${inspectedCount} из ${totalWelded} стыков.`;
    }

    reports.push({
      stamp: stat.stamp,
      fullName: stat.fullName,
      totalWelded,
      inspectedCount,
      passedCount,
      defectCount,
      actualNdtPct,
      requiredNdtPct,
      isCompliant,
      hasMinimumJointInspected,
      penaltyRequiredJoints,
      status,
      details,
    });
  }

  return reports.sort((a, b) => {
    if (a.isCompliant !== b.isCompliant) return a.isCompliant ? 1 : -1;
    return b.totalWelded - a.totalWelded;
  });
}

/**
 * Прогресс выполнения плана неразрушающего контроля по конкретной технологической линии
 */
export interface LineNdtProgress {
  uniqueLineId: string;
  totalJoints: number;
  weldedJoints: number;
  inspectedRkCount: number;
  inspectedUzkCount: number;
  requiredRkPct: number;
  requiredUzkPct: number;
  actualRkPct: number;
  actualUzkPct: number;
  isRkFulfilled: boolean;
  isUzkFulfilled: boolean;
}

export function calculateLineNdtProgress(
  joints: WeldJoint[],
  line: ProjectLineItem
): LineNdtProgress {
  const lineJoints = joints.filter((j) => j.uniqueLineId === line.uniqueLineId);
  const totalJoints = lineJoints.length;
  const weldedJoints = lineJoints.filter((j) => Boolean(j.weldingDate)).length;

  const inspectedRkCount = lineJoints.filter((j) => {
    const isPrimaryRk =
      (j.ndtType === 'РК' || j.ndtType === 'РК+УЗК') && j.ndtResult === 'Годен';
    const isDupRk = j.dupNdtType === 'РК' && j.dupNdtResult === 'Годен';
    const isRepairRk =
      (j.repairNdtType === 'РК' && j.repairNdtResult === 'Годен') ||
      (j.repairDupNdtType === 'РК' && j.repairDupNdtResult === 'Годен');
    return isPrimaryRk || isDupRk || isRepairRk;
  }).length;

  const inspectedUzkCount = lineJoints.filter((j) => {
    const isPrimaryUzk =
      (j.ndtType === 'УЗК' || j.ndtType === 'РК+УЗК') && j.ndtResult === 'Годен';
    const isDupUzk = j.dupNdtType === 'УЗК' && j.dupNdtResult === 'Годен';
    const isRepairUzk =
      (j.repairNdtType === 'УЗК' && j.repairNdtResult === 'Годен') ||
      (j.repairDupNdtType === 'УЗК' && j.repairDupNdtResult === 'Годен');
    return isPrimaryUzk || isDupUzk || isRepairUzk;
  }).length;

  const requiredRkPct = line.rkPercent || 0;
  const requiredUzkPct = line.uzkPercent || 0;

  const actualRkPct = weldedJoints > 0 ? Math.round((inspectedRkCount / weldedJoints) * 1000) / 10 : 0;
  const actualUzkPct = weldedJoints > 0 ? Math.round((inspectedUzkCount / weldedJoints) * 1000) / 10 : 0;

  return {
    uniqueLineId: line.uniqueLineId,
    totalJoints,
    weldedJoints,
    inspectedRkCount,
    inspectedUzkCount,
    requiredRkPct,
    requiredUzkPct,
    actualRkPct,
    actualUzkPct,
    isRkFulfilled: actualRkPct >= requiredRkPct,
    isUzkFulfilled: actualUzkPct >= requiredUzkPct,
  };
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
 * Формирует посуточный архив температур воздуха (°C) за период (startDateIso .. endDateIso)
 * строго на основе фактических наблюдений реальной метеостанции.
 * КАТЕГОРИЧЕСКИЙ ЗАПРЕТ: климатические формулы исключены из роли источника архива.
 * Если фактических наблюдений станции за дату нет — поле остаётся пустым (статус «нет данных»).
 */
export function generatePeriodWeatherArchive(
  latitude: number,
  longitude: number,
  startDateIso: string,
  endDateIso: string,
  knownArchive?: Record<string, string>
): Record<string, string> {
  const archive: Record<string, string> = {};
  if (knownArchive) {
    Object.assign(archive, knownArchive);
  }
  return archive;
}

/**
 * Получение температуры окружающей среды на дату сварки:
 * 1) Из предзагруженного архива фактических наблюдений метеостанции объекта (weatherArchive[dateStr]);
 * 2) Если выбрана явная отдельная опция Open-Meteo ERA5 («реанализ, не наблюдения метеостанции»);
 * 3) Если наблюдений нет — значение остаётся НЕЗАПОЛНЕННЫМ (пустая строка) со статусом «За дату данных нет»
 *    или «Данные ещё не поступили».
 * 
 * ВНИМАНИЕ: Подстановка расчётных формул/климатических оценок в архив или паспорт стыка ЗАПРЕЩЕНА.
 */
export async function fetchAmbientTemperatureAuto(
  latitude: number,
  longitude: number,
  dateStr?: string,
  weatherArchive?: Record<string, string>,
  options?: {
    sourceType?: 'meteostat' | 'open-meteo-era5';
    stationName?: string;
  }
): Promise<{ tempC: string; source: string; status?: string }> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const targetDate =
    dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : todayIso;

  // 1. Проверяем предзагруженный архив фактических наблюдений метеостанции объекта
  if (weatherArchive && weatherArchive[targetDate] !== undefined && weatherArchive[targetDate].trim() !== '') {
    const rawVal = String(weatherArchive[targetDate]).trim();
    const num = Number(rawVal);
    const formatted =
      !rawVal.startsWith('+') && !rawVal.startsWith('-') && !Number.isNaN(num) && num > 0
        ? `+${num}`
        : rawVal;
    const stLabel = options?.stationName || 'Метеостанция объекта';
    return {
      tempC: formatted,
      source: `Фактические наблюдения: ${stLabel} (${formatDateDDMMYY(targetDate)})`,
      status: 'available',
    };
  }

  const sourceType = options?.sourceType || 'meteostat';
  const { isPending, isHistorical } = determineDateObservationStatus(targetDate, todayIso);

  // 2. Если дата за последние 1–7 дней или будущая — архив ещё не поступил
  if (isPending) {
    return {
      tempC: '',
      source: 'Данные ещё не поступили (задержка обновления архива метеостанции)',
      status: 'pending',
    };
  }

  // 3. Отдельная маркированная опция Open-Meteo ERA5 (Строго «реанализ, не наблюдения метеостанции»)
  if (sourceType === 'open-meteo-era5' && isHistorical) {
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
            source: `Open-Meteo ERA5 (${latitude.toFixed(2)}°N, ${longitude.toFixed(2)}°E · ${formatDateDDMMYY(targetDate)}) · реанализ, не наблюдения метеостанции`,
            status: 'available',
          };
        }
      }
    } catch {
      // Сетевая ошибка — не подменять архив климатической оценкой незаметно!
    }
  }

  // 4. Если наблюдений нет — КАТЕГОРИЧЕСКИЙ ЗАПРЕТ НА ПОДМЕНУ РАСЧЁТНОЙ ФОРМУЛОЙ.
  // Поле остаётся пустым, статус «За дату данных нет».
  return {
    tempC: '',
    source: 'За дату данных нет (наблюдения на метеостанции отсутствуют)',
    status: 'not_found',
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

export interface WelderCertMethodInfo {
  certNumber: string;
  issueDate?: string;
  expiryDate?: string;
  admissionSheetNumber?: string;
  admissionSheetDate?: string;
}

/**
 * Получает реквизиты удостоверения НАКС сварщика для конкретного способа сварки (РАД, РД, МП, АФ).
 * На разные области аттестации сварщик получает отдельные удостоверения НАКС.
 */
export function getWelderCertForMethod(
  welder: WelderProfile,
  weldingType?: string
): WelderCertMethodInfo {
  const method = (weldingType || '').trim();

  if (welder.naksCerts && welder.naksCerts.length > 0) {
    if (method) {
      // 1. Прямое совпадение способа сварки
      const exact = welder.naksCerts.find(
        (c) => c.weldingType.toLowerCase() === method.toLowerCase()
      );
      if (exact && exact.certNumber) {
        return {
          certNumber: exact.certNumber,
          issueDate: exact.issueDate || welder.certIssueDate,
          expiryDate: exact.expiryDate || welder.certExpiryDate,
          admissionSheetNumber: exact.admissionSheetNumber || welder.admissionSheetNumber,
          admissionSheetDate: exact.admissionSheetDate || welder.admissionSheetDate,
        };
      }

      // 2. Если комбинированный способ (РАД+РД), а у сварщика отдельные удостоверения на РАД и РД
      if (method.includes('+')) {
        const parts = method.split('+').map((p) => p.trim().toLowerCase());
        const matched = welder.naksCerts.filter((c) =>
          parts.includes(c.weldingType.toLowerCase())
        );
        if (matched.length > 0) {
          return {
            certNumber: matched.map((m) => `${m.weldingType}: ${m.certNumber}`).join('; '),
            issueDate: matched[0].issueDate || welder.certIssueDate,
            expiryDate: matched[0].expiryDate || welder.certExpiryDate,
            admissionSheetNumber:
              matched.map((m) => m.admissionSheetNumber).filter(Boolean).join('; ') ||
              welder.admissionSheetNumber,
            admissionSheetDate: matched[0].admissionSheetDate || welder.admissionSheetDate,
          };
        }
      }
    }

    // 3. Если способ не совпал или не передан, берем первое удостоверение из списка
    const first = welder.naksCerts[0];
    if (first && first.certNumber) {
      return {
        certNumber: first.certNumber,
        issueDate: first.issueDate || welder.certIssueDate,
        expiryDate: first.expiryDate || welder.certExpiryDate,
        admissionSheetNumber: first.admissionSheetNumber || welder.admissionSheetNumber,
        admissionSheetDate: first.admissionSheetDate || welder.admissionSheetDate,
      };
    }
  }

  // Fallback: основное удостоверение профиля
  return {
    certNumber: welder.certNumber || '',
    issueDate: welder.certIssueDate,
    expiryDate: welder.certExpiryDate,
    admissionSheetNumber: welder.admissionSheetNumber,
    admissionSheetDate: welder.admissionSheetDate,
  };
}

/**
 * Возвращает список незаполненных обязательных полей паспорта стыка.
 * Если дата сварки введена (стык сварен в металле), обязательными являются:
 * - Клеймо сварщика
 * - Технологическая карта
 * - Сварочные материалы
 * - Ответственное лицо (мастер, прораб)
 * - Заводские номера свариваемых элементов 1 и 2
 * - Длины элементов 1 и 2
 */
export function getMissingPassportFields(joint: WeldJoint): string[] {
  if (!joint.weldingDate || joint.weldingDate.trim() === '') {
    return [];
  }
  const missing: string[] = [];
  if (!joint.welderStamp || joint.welderStamp.trim() === '') {
    missing.push('Клеймо сварщика');
  }
  if (!joint.techCardNumber || joint.techCardNumber.trim() === '') {
    missing.push('Техкарта (ТК)');
  }
  if (!joint.weldingMaterials || joint.weldingMaterials.trim() === '') {
    missing.push('Сварочные материалы');
  }
  if (!joint.responsiblePerson || joint.responsiblePerson.trim() === '') {
    missing.push('Ответственное лицо');
  }
  if (!joint.elem1FactoryNumber || joint.elem1FactoryNumber.trim() === '') {
    missing.push('Зав. № элемента 1');
  }
  if (!joint.elem2FactoryNumber || joint.elem2FactoryNumber.trim() === '') {
    missing.push('Зав. № элемента 2');
  }
  if (!joint.elem1Length || joint.elem1Length.trim() === '') {
    missing.push('Длина элемента 1');
  }
  if (!joint.elem2Length || joint.elem2Length.trim() === '') {
    missing.push('Длина элемента 2');
  }
  return missing;
}

/**
 * Проверяет, является ли паспорт стыка незаполненным при наличии даты сварки.
 */
export function isPassportIncomplete(joint: WeldJoint): boolean {
  return getMissingPassportFields(joint).length > 0;
}

/**
 * Автоматически формирует строку клейм, ФИО сварщиков, номеров удостоверений НАКС и мастера
 * при выборе или вводе одного сварщика, нескольких сварщиков или бригадного клейма
 * с учетом выбранного способа сварки.
 */
export function resolveWeldersSelection(
  selectedStamps: string[],
  brigadeStamp: string | undefined,
  weldersDirectory: WelderProfile[],
  weldingType?: string
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
      const certs = memberProfiles.map(
        (m) => getWelderCertForMethod(m, weldingType).certNumber
      );
      return {
        welderStamp: `${brigadeProfile.stamp} (${memberProfiles.map((m) => m.stamp).join(', ')})`,
        welderFullName: memberProfiles.map((m) => m.fullName).join(', '),
        welderCertNumber: certs.join(', '),
        responsiblePerson: brigadeProfile.crewForeman || memberProfiles[0].crewForeman,
      };
    }

    return {
      welderStamp: brigadeProfile.stamp,
      welderFullName: brigadeProfile.fullName,
      welderCertNumber: getWelderCertForMethod(brigadeProfile, weldingType).certNumber,
      responsiblePerson: brigadeProfile.crewForeman,
    };
  }

  const stampDisplay = canonicalBrigade
    ? canonicalStamps.length > 0
      ? `${canonicalBrigade} (${canonicalStamps.join(', ')})`
      : canonicalBrigade
    : canonicalStamps.join(', ');

  const certs = matchedProfiles.map(
    (m) => getWelderCertForMethod(m, weldingType).certNumber
  );

  return {
    welderStamp: stampDisplay,
    welderFullName: matchedProfiles.map((m) => m.fullName).join(', '),
    welderCertNumber: certs.join(', '),
    responsiblePerson:
      matchedProfiles[0]?.crewForeman || brigadeProfile?.crewForeman || '',
  };
}
