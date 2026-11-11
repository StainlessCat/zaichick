import {
  ProjectLineItem,
  ReadinessGroupCondition,
  WeldJoint,
} from '../types/welding';
import { getJointEquivDiaInch, getJointNominalInch } from './pipeCalc';

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
  totalNominalInches: number;
  totalEquivInches: number;
  weldedEquivInches: number;
  equivWeldingPct: number;
}

/**
 * Проверяет, является ли стык дефектным (назначен «Ремонт» или «Вырезать» на любом этапе контроля
 * либо начаты ремонтные работы).
 */
export function isJointDefective(
  joint: Partial<
    Pick<
      WeldJoint,
      | 'vikResult'
      | 'ndtResult'
      | 'dupNdtResult'
      | 'repairAction'
      | 'repairVikResult'
      | 'repairNdtResult'
      | 'repairDupNdtResult'
    >
  >
): boolean {
  if (
    joint.vikResult === 'Ремонт' ||
    joint.vikResult === 'Вырезать' ||
    joint.ndtResult === 'Ремонт' ||
    joint.ndtResult === 'Вырезать' ||
    joint.dupNdtResult === 'Ремонт' ||
    joint.dupNdtResult === 'Вырезать' ||
    joint.repairVikResult === 'Ремонт' ||
    joint.repairVikResult === 'Вырезать' ||
    joint.repairNdtResult === 'Ремонт' ||
    joint.repairNdtResult === 'Вырезать' ||
    joint.repairDupNdtResult === 'Ремонт' ||
    joint.repairDupNdtResult === 'Вырезать'
  ) {
    return true;
  }
  if (
    joint.repairAction === 'Ремонт' ||
    joint.repairAction === 'Вырезано' ||
    joint.repairAction === 'Требуется ремонт'
  ) {
    return true;
  }
  return false;
}

/**
 * Проверяет, полностью ли принят стык (либо с первого раза по ВИК и НК,
 * либо после первичного ремонта с успешным повторным контролем после ремонта).
 */
export function isJointFullyAccepted(joint: WeldJoint): boolean {
  if (!joint.weldingDate || !joint.welderStamp) return false;

  const hadDefect = isJointDefective(joint);

  if (!hadDefect) {
    // Случай 1: Первичный контроль прошёл успешно без ремонта
    const primaryVikOk = joint.vikResult === 'Годен';
    const primaryNdtOk =
      !joint.ndtType ||
      joint.ndtType === 'Не требуется' ||
      joint.ndtResult === 'Годен';

    // Дублирующий контроль (графы 28–31 СТО Газпром): выборочный контроль (10–20%).
    // Стык принят, если дублирование не требуется, либо стык не вошел в выборку («Не проводился»),
    // либо вошел в выборку и успешно сдан («Годен»). Статус «В работе» блокирует приёмку.
    const dupOkOrNotRequired =
      !joint.dupNdtType ||
      joint.dupNdtType === 'Не требуется' ||
      !joint.dupNdtResult ||
      joint.dupNdtResult === 'Не проводился' ||
      joint.dupNdtResult === 'Годен';

    return primaryVikOk && primaryNdtOk && dupOkOrNotRequired;
  }

  // Случай 2: Стык с дефектом — проверяем специализированный контроль после ремонта (СТО Газпром 38–48)
  const hasRepairVik =
    Boolean(joint.repairVikResult) && joint.repairVikResult !== 'Не проводился';
  const hasRepairNdt =
    Boolean(joint.repairNdtType) &&
    joint.repairNdtType !== 'Не требуется' &&
    Boolean(joint.repairNdtResult) &&
    joint.repairNdtResult !== 'Не проводился';

  if (hasRepairVik || hasRepairNdt) {
    const postVikOk = joint.repairVikResult === 'Годен';
    const postNdtOk =
      !joint.repairNdtType ||
      joint.repairNdtType === 'Не требуется' ||
      joint.repairNdtResult === 'Годен';
    const postDupOk =
      !joint.repairDupNdtType ||
      joint.repairDupNdtType === 'Не требуется' ||
      !joint.repairDupNdtResult ||
      joint.repairDupNdtResult === 'Не проводился' ||
      joint.repairDupNdtResult === 'Годен';

    return postVikOk && postNdtOk && postDupOk;
  }

  // 3. Обратная совместимость с legacy-записями
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
  if (!isJointDefective(joint)) {
    return false;
  }
  // Если дефект зафиксирован, но стык уже успешно принят после переконтроля — ремонт закрыт
  return !isJointFullyAccepted(joint);
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
          (i.repairVikResult === 'Годен' ||
            (i.dupNdtType !== 'Не требуется' && i.dupNdtResult === 'Годен')))
    ).length;
    const ndtPassedCount = items.filter(
      (i) =>
        i.ndtResult === 'Годен' ||
        (i.ndtResult === 'Ремонт' &&
          (i.repairNdtResult === 'Годен' ||
            (i.dupNdtType !== 'Не требуется' && i.dupNdtResult === 'Годен')))
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

    const totalNominalInches =
      Math.round(items.reduce((acc, j) => acc + getJointNominalInch(j), 0) * 10) / 10;
    const totalEquivInches =
      Math.round(items.reduce((acc, j) => acc + getJointEquivDiaInch(j), 0) * 10) / 10;
    const weldedEquivInches =
      Math.round(
        items
          .filter((j) => Boolean(j.weldingDate && j.welderStamp))
          .reduce((acc, j) => acc + getJointEquivDiaInch(j), 0) * 10
      ) / 10;
    const equivWeldingPct =
      totalEquivInches > 0
        ? Math.round((weldedEquivInches / totalEquivInches) * 100)
        : 0;

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
      totalNominalInches,
      totalEquivInches,
      weldedEquivInches,
      equivWeldingPct,
    });
  }

  return rows.sort((a, b) => b.totalJoints - a.totalJoints);
}

export interface LineCompletionStatus {
  isCompleted: boolean;
  totalJoints: number;
  weldedJoints: number;
  controlledJoints: number;
  statusLabel: string;
  ndtStatus: 'sufficient' | 'insufficient' | 'no_welding';
  ndtStatusBadge: 'Достаточно НК' | 'Недостаточно НК' | 'Нет сварки';
  rkRequired: number;
  rkControlled: number;
  uzkRequired: number;
  uzkControlled: number;
  welderNdtDeficits?: string[]; // Список сварщиков с дефицитом контроля на данной линии
}

/**
 * Вычисляет статус линии для раздела «Проект (лайнлист)»:
 * проверяет выполнение объемов неразрушающего контроля (РК / УЗК) по линии
 * и готовность всех стыков на линии.
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
      ndtStatus: 'no_welding',
      ndtStatusBadge: 'Нет сварки',
      rkRequired: 0,
      rkControlled: 0,
      uzkRequired: 0,
      uzkControlled: 0,
    };
  }

  let weldedJoints = 0;
  let controlledJoints = 0;
  let rkControlled = 0;
  let uzkControlled = 0;

  for (const j of lineJoints) {
    const isWelded = Boolean(j.weldingDate && j.weldingDate.trim() !== '');
    if (isWelded) {
      weldedJoints += 1;

      // Проверка фактического выполнения РК (исключаем «В работе», «Не проводился» и открытый «Ремонт»)
      const hasRk =
        ((j.ndtType === 'РК' || j.ndtType === 'РК+УЗК') && j.ndtResult === 'Годен') ||
        (j.dupNdtType === 'РК' && j.dupNdtResult === 'Годен') ||
        (j.repairNdtType === 'РК' && j.repairNdtResult === 'Годен') ||
        (j.repairDupNdtType === 'РК' && j.repairDupNdtResult === 'Годен');
      if (hasRk) {
        rkControlled += 1;
      }

      // Проверка фактического выполнения УЗК (исключаем «В работе», «Не проводился» и открытый «Ремонт»)
      const hasUzk =
        ((j.ndtType === 'УЗК' || j.ndtType === 'РК+УЗК') && j.ndtResult === 'Годен') ||
        (j.dupNdtType === 'УЗК' && j.dupNdtResult === 'Годен') ||
        (j.repairNdtType === 'УЗК' && j.repairNdtResult === 'Годен') ||
        (j.repairDupNdtType === 'УЗК' && j.repairDupNdtResult === 'Годен');
      if (hasUzk) {
        uzkControlled += 1;
      }
    }

    if (isJointFullyAccepted(j)) {
      controlledJoints += 1;
    }
  }

  // Расчет планового норматива контроля по лайнлисту
  const rkPlanPct =
    typeof lineItem.rkPercent === 'number'
      ? lineItem.rkPercent
      : parseFloat(String(lineItem.rkPercent || '0')) || 0;
  const uzkPlanPct =
    typeof lineItem.uzkPercent === 'number'
      ? lineItem.uzkPercent
      : parseFloat(String(lineItem.uzkPercent || '0')) || 0;

  const rkRequired = Math.ceil(weldedJoints * (rkPlanPct / 100));
  const uzkRequired = Math.ceil(weldedJoints * (uzkPlanPct / 100));

  // Анализ квотирования НК по каждому сварщику на данной конкретной линии (СТО Газпром 15-1.3-004-2023)
  const welderStats = new Map<string, { welded: number; controlled: number }>();
  for (const j of lineJoints) {
    const isWelded = Boolean(j.weldingDate && j.weldingDate.trim() !== '');
    if (!isWelded) continue;

    const stamps = new Set<string>();
    if (j.welderStampsList && j.welderStampsList.length > 0) {
      j.welderStampsList.forEach((s) => {
        const clean = s.trim();
        if (clean) stamps.add(clean);
      });
    } else if (j.welderStamp?.trim()) {
      j.welderStamp.split(/[,;/+]+/).forEach((s) => {
        const clean = s.trim();
        if (clean) stamps.add(clean);
      });
    }

    const hasPrimaryPassedNdt =
      Boolean(j.ndtType) &&
      j.ndtType !== 'Не требуется' &&
      j.ndtResult === 'Годен';
    const hasDupPassedNdt =
      Boolean(j.dupNdtType) &&
      j.dupNdtType !== 'Не требуется' &&
      j.dupNdtResult === 'Годен';
    const hasRepairPassedNdt =
      (j.repairNdtResult === 'Годен' && j.repairNdtType !== 'Не требуется') ||
      (j.repairDupNdtResult === 'Годен' && j.repairDupNdtType !== 'Не требуется');
    const hasOpenNdtDefect =
      j.ndtResult === 'Ремонт' ||
      j.ndtResult === 'Вырезать' ||
      j.dupNdtResult === 'Ремонт' ||
      j.dupNdtResult === 'Вырезать';

    const hasAnyNdt =
      hasRepairPassedNdt ||
      (!hasOpenNdtDefect && (hasPrimaryPassedNdt || hasDupPassedNdt));

    stamps.forEach((s) => {
      const cur = welderStats.get(s) || { welded: 0, controlled: 0 };
      cur.welded += 1;
      if (hasAnyNdt) {
        cur.controlled += 1;
      }
      welderStats.set(s, cur);
    });
  }

  const welderNdtDeficits: string[] = [];
  const planPct = Math.max(rkPlanPct, uzkPlanPct);
  if (planPct > 0) {
    for (const [stamp, stats] of welderStats.entries()) {
      const requiredForWelder = Math.max(1, Math.ceil(stats.welded * (planPct / 100)));
      if (stats.controlled < requiredForWelder) {
        welderNdtDeficits.push(`${stamp} (${stats.controlled}/${requiredForWelder})`);
      }
    }
  }

  let ndtStatus: 'sufficient' | 'insufficient' | 'no_welding' = 'no_welding';
  let ndtStatusBadge: 'Достаточно НК' | 'Недостаточно НК' | 'Нет сварки' = 'Нет сварки';

  if (weldedJoints > 0) {
    const isRkSufficient = rkRequired === 0 || rkControlled >= rkRequired;
    const isUzkSufficient = uzkRequired === 0 || uzkControlled >= uzkRequired;
    const areWeldersSufficient = welderNdtDeficits.length === 0;

    if (isRkSufficient && isUzkSufficient && areWeldersSufficient) {
      ndtStatus = 'sufficient';
      ndtStatusBadge = 'Достаточно НК';
    } else {
      ndtStatus = 'insufficient';
      ndtStatusBadge = 'Недостаточно НК';
    }
  }

  const isCompleted =
    totalJoints > 0 && weldedJoints === totalJoints && controlledJoints === totalJoints;

  const detailInfo = `(РК: ${rkControlled}/${rkRequired}, УЗК: ${uzkControlled}/${uzkRequired})`;
  const welderDeficitNote = welderNdtDeficits.length > 0
    ? ` [Дефицит НК по сварщикам: ${welderNdtDeficits.join(', ')}]`
    : '';
  const statusLabel = isCompleted
    ? ndtStatus === 'insufficient'
      ? `Все стыки сварены и проконтролированы (${controlledJoints}/${totalJoints}) — ${ndtStatusBadge} ${detailInfo}${welderDeficitNote}`
      : `Все стыки сварены и проконтролированы (${controlledJoints}/${totalJoints})`
    : weldedJoints === 0
    ? 'Нет сварки'
    : `${ndtStatusBadge} ${detailInfo}${welderDeficitNote}`;

  return {
    isCompleted,
    totalJoints,
    weldedJoints,
    controlledJoints,
    statusLabel,
    ndtStatus,
    ndtStatusBadge,
    rkRequired,
    rkControlled,
    uzkRequired,
    uzkControlled,
    welderNdtDeficits,
  };
}
