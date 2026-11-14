import { ProjectLineItem, WeldJoint } from '../types/welding';
import { isJointFullyAccepted } from './readiness';

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
