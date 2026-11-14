import { WelderNaksCert, WelderProfile, WeldJoint } from '../types/welding';
import { formatDateDDMMYY, normalizeDateToISO } from './dates';
import { findWelderByStamp, getWelderCertForMethod } from './weldersDirectory';

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
  const diffMm = Math.round((maxS - minS) * 100) / 100;
  const ratio = Math.round((maxS / minS) * 100) / 100;

  const requiresBevel = diffMm > 2.0;
  const isDirectWeldingForbidden = ratio > 1.5;

  let warning: string | undefined;
  let error: string | undefined;

  if (isDirectWeldingForbidden) {
    error = `Отношение толщин стенок Smax/Smin = ${ratio} > 1.5 (S1=${numS1} мм, S2=${numS2} мм). Согласно п. 14.3 СТО Газпром 15-1.1-002-2023 прямая сварка элементов категорически запрещена! Требуется переходное кольцо длиной не менее 250 мм или переходная деталь.`;
  } else if (requiresBevel) {
    warning = `Разность толщин стенок ΔS = ${diffMm} мм > 2.0 мм (S1=${numS1} мм, S2=${numS2} мм). Согласно п. 14.3 СТО Газпром 15-1.1-002-2023 соединение разнотолщинное: требуется механическая расточка/скос кромок с уклоном не круче 1:4.`;
  }

  return {
    isDifferentThickness: diffMm > 0,
    diffMm,
    ratio,
    requiresBevel,
    isDirectWeldingForbidden,
    warning,
    error,
  };
}

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
