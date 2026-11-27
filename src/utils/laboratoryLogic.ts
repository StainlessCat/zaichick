import {
  ControlResult,
  JointLabRequestStatus,
  LabConclusionMethodKey,
  LabConclusionsMap,
  NdtLabControlStage,
  NdtLabRequest,
  NdtLabRequestStatus,
  NdtMethod,
  ProjectLineItem,
  WelderProfile,
  WeldJoint,
} from '../types/welding';
import { isJointCurrentlyInRepair, isJointFullyAccepted } from './readiness';
import {
  checkNaksCertStatus,
  findWelderByStamp,
  getWelderCertForMethod,
  validateWelderNaksAttestation,
} from './weldingLogic';

export interface WelderQuotaDeficitItem {
  stamp: string;
  weldedCount: number;
  controlledCount: number;
  requiredCount: number;
  deficitCount: number;
  missingMethods?: ('РК' | 'УЗК' | 'ПВК')[];
}

export interface NdtLineDeficitRow {
  uniqueLineId: string;
  rdCode: string;
  objectName: string;
  lineNumber: string;
  lineName: string;
  contour: string;
  controlNtd: string;
  pipelineCategory: string;
  qualityLevel: string;
  totalJoints: number;
  weldedCount: number;
  fullyAcceptedCount: number;
  inRepairCount: number;
  jointsInWorkCount: number;

  // ВИК (100% обязательный контроль сваренных стыков)
  vikPlanPct: number;
  vikRequired: number;
  vikCompleted: number;
  vikInWork: number;
  vikDeficit: number;
  vikActualPct: number;

  // РК (Радиографический контроль)
  rkPlanPct: number;
  rkRequired: number;
  rkCompleted: number;
  rkInWork: number;
  rkDeficit: number;
  rkActualPct: number;

  // УЗК (Ультразвуковой контроль)
  uzkPlanPct: number;
  uzkRequired: number;
  uzkCompleted: number;
  uzkInWork: number;
  uzkDeficit: number;
  uzkActualPct: number;

  // ПВК / МК (Капиллярный / Магнитопорошковый контроль)
  pvkPlanPct: number;
  pvkRequired: number;
  pvkCompleted: number;
  pvkInWork: number;
  pvkDeficit: number;
  pvkActualPct: number;

  // Суммарный дефицит физических методов НК по линии
  totalPhysicalDeficit: number;
  recommendedMethod: NdtMethod;
  welderDeficits: WelderQuotaDeficitItem[];
  candidateJoints: WeldJoint[];
  allWeldedJoints: WeldJoint[];
  hasDeficit: boolean;
}

export interface NdtRdDeficitGroup {
  rdCode: string;
  objectName: string;
  lines: NdtLineDeficitRow[];
  totalLines: number;
  deficitLinesCount: number;
  totalJoints: number;
  weldedCount: number;
  vikRequired: number;
  vikCompleted: number;
  vikDeficit: number;
  rkRequired: number;
  rkCompleted: number;
  rkDeficit: number;
  uzkRequired: number;
  uzkCompleted: number;
  uzkDeficit: number;
  pvkRequired: number;
  pvkCompleted: number;
  pvkDeficit: number;
  totalPhysicalDeficit: number;
}

export interface NdtDeficitStatementResult {
  rdGroups: NdtRdDeficitGroup[];
  allLineRows: NdtLineDeficitRow[];
  totals: {
    totalRdCodes: number;
    totalLines: number;
    deficitLinesCount: number;
    totalWelded: number;
    jointsInWorkCount: number;
    vikDeficit: number;
    rkDeficit: number;
    uzkDeficit: number;
    pvkDeficit: number;
    totalPhysicalDeficit: number;
  };
}

export interface LabConclusionFormInput {
  stage: NdtLabControlStage;
  // Поля ВИК (для первичного ВИК и НК или после ремонта)
  includeVik?: boolean;
  vikReportNumber?: string;
  vikDate?: string;
  vikResult?: ControlResult;
  vikInspector?: string;
  // Поля физического НК (основного, повторного после ремонта или дублирующего)
  ndtMethod: NdtMethod;
  ndtReportNumber: string;
  ndtDate: string;
  ndtResult: ControlResult;
  ndtInspector: string;
}

export function derivePrimaryNdtMethod(methods: LabConclusionMethodKey[]): NdtMethod {
  const hasRk = methods.includes('РК');
  const hasUzk = methods.includes('УЗК');
  const hasPvk = methods.includes('ПВК');
  if (hasRk && hasUzk) return 'РК+УЗК';
  if (hasRk) return 'РК';
  if (hasUzk) return 'УЗК';
  if (hasPvk) return 'ПВК';
  return 'Не требуется';
}

function matchesPhysicalMethod(
  methodValue: NdtMethod | string | undefined,
  targetMethod: 'РК' | 'УЗК' | 'ПВК'
): boolean {
  if (!methodValue) return false;
  if (targetMethod === 'РК') return methodValue === 'РК' || methodValue === 'РК+УЗК';
  if (targetMethod === 'УЗК') return methodValue === 'УЗК' || methodValue === 'РК+УЗК';
  if (targetMethod === 'ПВК') return methodValue === 'ПВК' || methodValue === 'МК';
  return false;
}

/**
 * Проверяет, засчитан ли стык по методу РК / УЗК / ПВК
 * (с учётом раздельной карты labConclusions и плоских полей первичного/дублирующего/ремонтного контроля).
 */
export function isJointPassedByMethod(
  joint: WeldJoint,
  targetMethod: 'РК' | 'УЗК' | 'ПВК'
): boolean {
  const lcEntry = joint.labConclusions?.[targetMethod];

  // Если стык в открытом ремонте, первичное заключение не засчитывается до закрытия ремонта
  const inOpenRepair = isJointCurrentlyInRepair(joint);
  if (inOpenRepair) {
    return (
      (lcEntry?.stage === 'repair' && lcEntry.result === 'Годен') ||
      (matchesPhysicalMethod(joint.repairNdtType, targetMethod) && joint.repairNdtResult === 'Годен') ||
      (matchesPhysicalMethod(joint.repairDupNdtType, targetMethod) && joint.repairDupNdtResult === 'Годен')
    );
  }

  return (
    lcEntry?.result === 'Годен' ||
    (matchesPhysicalMethod(joint.ndtType, targetMethod) && joint.ndtResult === 'Годен') ||
    (matchesPhysicalMethod(joint.dupNdtType, targetMethod) && joint.dupNdtResult === 'Годен') ||
    (matchesPhysicalMethod(joint.repairNdtType, targetMethod) && joint.repairNdtResult === 'Годен') ||
    (matchesPhysicalMethod(joint.repairDupNdtType, targetMethod) && joint.repairDupNdtResult === 'Годен')
  );
}

/**
 * Проверяет, находится ли стык «В работе» у лаборатории НК по указанному методу.
 */
export function isJointInWorkByMethod(
  joint: WeldJoint,
  targetMethod: 'РК' | 'УЗК' | 'ПВК'
): boolean {
  const lcEntry = joint.labConclusions?.[targetMethod];
  return (
    lcEntry?.result === 'В работе' ||
    (matchesPhysicalMethod(joint.ndtType, targetMethod) && joint.ndtResult === 'В работе') ||
    (matchesPhysicalMethod(joint.dupNdtType, targetMethod) && joint.dupNdtResult === 'В работе') ||
    (matchesPhysicalMethod(joint.repairNdtType, targetMethod) && joint.repairNdtResult === 'В работе')
  );
}

/**
 * Проверяет, включен ли стык в активную заявку на НК («Подана ПТО» или «В работе ЛНК»).
 * Если указан requestedMethod, проверяет конфликтность по запрашиваемому методу контроля.
 */
export function getActiveLabRequestForJoint(
  jointId: string,
  labRequests: NdtLabRequest[],
  requestedMethod?: string
): NdtLabRequest | undefined {
  if (!labRequests || labRequests.length === 0) return undefined;
  return labRequests.find((r) => {
    if (r.status !== 'Подана ПТО' && r.status !== 'В работе ЛНК') {
      return false;
    }
    if (!r.jointIds || !r.jointIds.includes(jointId)) {
      return false;
    }
    if (requestedMethod && r.requestedMethod) {
      const rmNorm = requestedMethod.trim().toUpperCase();
      const reqNorm = r.requestedMethod.trim().toUpperCase();
      if (rmNorm !== reqNorm && !reqNorm.includes(rmNorm) && !rmNorm.includes(reqNorm)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Вычисляет полную дефицитную ведомость неразрушающего контроля с группировкой по шифрам РД и линиям
 * и учётом нормативного процента контроля (РК %, УЗК %, ПВК %, ВИК 100%) и квот по сварщикам.
 */
export function calculateLaboratoryDeficitStatement(
  joints: WeldJoint[],
  lineList: ProjectLineItem[],
  selectedObjectName = 'ALL',
  selectedRdCode = 'ALL',
  labRequests: NdtLabRequest[] = []
): NdtDeficitStatementResult {
  const scopedJoints = joints.filter((j) => {
    if (selectedObjectName !== 'ALL' && j.objectName !== selectedObjectName) return false;
    if (selectedRdCode !== 'ALL' && j.rdCode !== selectedRdCode) return false;
    return true;
  });

  const scopedLines = lineList.filter((l) => {
    if (selectedObjectName !== 'ALL' && l.objectName !== selectedObjectName) return false;
    if (selectedRdCode !== 'ALL' && l.rdCode !== selectedRdCode) return false;
    return true;
  });

  const lineMap = new Map<string, ProjectLineItem>();
  for (const l of scopedLines) {
    lineMap.set(l.uniqueLineId, l);
    lineMap.set(`${l.rdCode}::${l.lineNumber}`, l);
  }

  // Собираем все уникальные ключи линий (из лайнлиста + из фактических стыков)
  const lineKeys = new Set<string>();
  const jointsByLineKey = new Map<string, WeldJoint[]>();

  for (const l of scopedLines) {
    const key = l.uniqueLineId || `${l.rdCode}-${l.lineNumber}`;
    lineKeys.add(key);
    jointsByLineKey.set(key, []);
  }

  for (const j of scopedJoints) {
    const matchedLine =
      lineMap.get(j.uniqueLineId) || lineMap.get(`${j.rdCode}::${j.lineNumber}`);
    const key = matchedLine?.uniqueLineId || j.uniqueLineId || `${j.rdCode}-${j.lineNumber}`;
    lineKeys.add(key);
    const arr = jointsByLineKey.get(key) || [];
    arr.push(j);
    jointsByLineKey.set(key, arr);
  }

  const allLineRows: NdtLineDeficitRow[] = [];

  for (const key of lineKeys) {
    const lineJoints = jointsByLineKey.get(key) || [];
    const sampleJoint = lineJoints[0];
    const lineItem =
      lineMap.get(key) ||
      (sampleJoint
        ? lineMap.get(`${sampleJoint.rdCode}::${sampleJoint.lineNumber}`)
        : undefined);

    if (!lineItem && lineJoints.length === 0) continue;

    const rdCode = lineItem?.rdCode || sampleJoint?.rdCode || 'БЕЗ-ШИФРА';
    const objectName = lineItem?.objectName || sampleJoint?.objectName || 'Объект';
    const lineNumber = lineItem?.lineNumber || sampleJoint?.lineNumber || key;
    const uniqueLineId = lineItem?.uniqueLineId || sampleJoint?.uniqueLineId || key;
    const lineName = lineItem?.lineName || `Линия ${lineNumber}`;
    const contour = lineItem?.testContour || sampleJoint?.contour || 'Основной контур';
    const controlNtd = lineItem?.controlNtd || 'СТО Газпром 15-1.1-002-2023';
    const pipelineCategory = lineItem?.pipelineCategory || 'II';
    const qualityLevel = lineItem?.qualityLevel || 'B';

    const rkPlanPct = Number(lineItem?.rkPercent ?? 100);
    const uzkPlanPct = Number(lineItem?.uzkPercent ?? 0);
    const pvkPlanPct = Number(lineItem?.pvkPercent ?? 0);

    const totalJoints = lineJoints.length;
    const allWeldedJoints = lineJoints.filter((j) =>
      Boolean(j.weldingDate && j.weldingDate.trim() !== '')
    );
    const weldedCount = allWeldedJoints.length;
    const fullyAcceptedCount = lineJoints.filter((j) => isJointFullyAccepted(j)).length;
    const inRepairCount = lineJoints.filter((j) => isJointCurrentlyInRepair(j)).length;

    // 1. ВИК (100% от сваренных стыков)
    const vikPlanPct = 100;
    const vikRequired = weldedCount;
    const isVikPassed = (j: WeldJoint): boolean => {
      const inRep = isJointCurrentlyInRepair(j);
      const lcVik = j.labConclusions?.['ВИК'];
      if (inRep) {
        return (
          j.repairVikResult === 'Годен' ||
          (lcVik?.stage === 'repair' && lcVik.result === 'Годен')
        );
      }
      return (
        j.vikResult === 'Годен' ||
        (j.vikResult === 'Ремонт' && j.repairVikResult === 'Годен') ||
        lcVik?.result === 'Годен'
      );
    };
    const isVikInWork = (j: WeldJoint): boolean =>
      j.vikResult === 'В работе' ||
      j.repairVikResult === 'В работе' ||
      j.labConclusions?.['ВИК']?.result === 'В работе';

    const vikCompleted = allWeldedJoints.filter(isVikPassed).length;
    const vikInWork = allWeldedJoints.filter(isVikInWork).length;
    const vikDeficit = Math.max(0, vikRequired - vikCompleted);
    const vikActualPct =
      weldedCount > 0 ? Math.min(100, Math.round((vikCompleted / weldedCount) * 100)) : 0;

    // 2. РК
    const rkRequired = Math.ceil(weldedCount * (rkPlanPct / 100));
    const rkCompleted = allWeldedJoints.filter((j) => isJointPassedByMethod(j, 'РК')).length;
    const rkInWork = allWeldedJoints.filter((j) => isJointInWorkByMethod(j, 'РК')).length;
    const rkDeficit = Math.max(0, rkRequired - rkCompleted);
    const rkActualPct =
      weldedCount > 0 ? Math.min(100, Math.round((rkCompleted / weldedCount) * 100)) : 0;

    // 3. УЗК
    const uzkRequired = Math.ceil(weldedCount * (uzkPlanPct / 100));
    const uzkCompleted = allWeldedJoints.filter((j) => isJointPassedByMethod(j, 'УЗК')).length;
    const uzkInWork = allWeldedJoints.filter((j) => isJointInWorkByMethod(j, 'УЗК')).length;
    const uzkDeficit = Math.max(0, uzkRequired - uzkCompleted);
    const uzkActualPct =
      weldedCount > 0 ? Math.min(100, Math.round((uzkCompleted / weldedCount) * 100)) : 0;

    // 4. ПВК / МК
    const pvkRequired = Math.ceil(weldedCount * (pvkPlanPct / 100));
    const pvkCompleted = allWeldedJoints.filter((j) => isJointPassedByMethod(j, 'ПВК')).length;
    const pvkInWork = allWeldedJoints.filter((j) => isJointInWorkByMethod(j, 'ПВК')).length;
    const pvkDeficit = Math.max(0, pvkRequired - pvkCompleted);
    const pvkActualPct =
      weldedCount > 0 ? Math.min(100, Math.round((pvkCompleted / weldedCount) * 100)) : 0;

    // Уникальные стыки линии, находящиеся в работе ЛНК хотя бы по одному методу
    const jointsInWorkCount = allWeldedJoints.filter(
      (j) =>
        isVikInWork(j) ||
        isJointInWorkByMethod(j, 'РК') ||
        isJointInWorkByMethod(j, 'УЗК') ||
        isJointInWorkByMethod(j, 'ПВК')
    ).length;

    // 5. Анализ квот по каждому сварщику на линии раздельно по каждому требуемому физическому методу НК
    const welderStats = new Map<
      string,
      { welded: number; rk: number; uzk: number; pvk: number }
    >();
    for (const j of allWeldedJoints) {
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
      const passedRk = isJointPassedByMethod(j, 'РК');
      const passedUzk = isJointPassedByMethod(j, 'УЗК');
      const passedPvk = isJointPassedByMethod(j, 'ПВК');
      stamps.forEach((stamp) => {
        const cur = welderStats.get(stamp) || { welded: 0, rk: 0, uzk: 0, pvk: 0 };
        cur.welded += 1;
        if (passedRk) cur.rk += 1;
        if (passedUzk) cur.uzk += 1;
        if (passedPvk) cur.pvk += 1;
        welderStats.set(stamp, cur);
      });
    }

    const requiredPhysicalSpecs: Array<{
      method: 'РК' | 'УЗК' | 'ПВК';
      planPct: number;
      key: 'rk' | 'uzk' | 'pvk';
    }> = [];
    if (rkPlanPct > 0) requiredPhysicalSpecs.push({ method: 'РК', planPct: rkPlanPct, key: 'rk' });
    if (uzkPlanPct > 0) requiredPhysicalSpecs.push({ method: 'УЗК', planPct: uzkPlanPct, key: 'uzk' });
    if (pvkPlanPct > 0) requiredPhysicalSpecs.push({ method: 'ПВК', planPct: pvkPlanPct, key: 'pvk' });

    const welderDeficits: WelderQuotaDeficitItem[] = [];
    if (requiredPhysicalSpecs.length > 0) {
      for (const [stamp, st] of welderStats.entries()) {
        const missingMethods: ('РК' | 'УЗК' | 'ПВК')[] = [];
        let worstDeficit = 0;
        let worstControlled = 0;
        let worstRequired = 0;

        for (const spec of requiredPhysicalSpecs) {
          const req = Math.max(1, Math.ceil(st.welded * (spec.planPct / 100)));
          const controlled = st[spec.key];
          if (controlled < req) {
            missingMethods.push(spec.method);
            const deficit = req - controlled;
            if (deficit > worstDeficit) {
              worstDeficit = deficit;
              worstControlled = controlled;
              worstRequired = req;
            }
          }
        }

        if (missingMethods.length > 0) {
          welderDeficits.push({
            stamp,
            weldedCount: st.welded,
            controlledCount: worstControlled,
            requiredCount: worstRequired,
            deficitCount: worstDeficit,
            missingMethods,
          });
        }
      }
    }

    const totalPhysicalDeficit = rkDeficit + uzkDeficit + pvkDeficit;
    let recommendedMethod: NdtMethod = 'РК';
    if (rkDeficit > 0 && uzkDeficit > 0) {
      recommendedMethod = 'РК+УЗК';
    } else if (uzkDeficit > 0 && rkDeficit === 0) {
      recommendedMethod = 'УЗК';
    } else if (pvkDeficit > 0 && rkDeficit === 0 && uzkDeficit === 0) {
      recommendedMethod = 'ПВК';
    } else if (uzkPlanPct > rkPlanPct && rkPlanPct === 0) {
      recommendedMethod = 'УЗК';
    }

    // Кандидаты на включение в заявку НК: сваренные стыки, у которых не завершён хотя бы один
    // обязательный метод или открыт ремонт, и которые ещё не находятся в активной заявке ЛНК
    const candidateJoints = allWeldedJoints.filter((j) => {
      if (
        getActiveLabRequestForJoint(j.id, labRequests, recommendedMethod) &&
        !isJointCurrentlyInRepair(j)
      ) {
        return false;
      }
      if (isJointCurrentlyInRepair(j)) return true;
      if (!isVikPassed(j)) return true;
      if (rkPlanPct > 0 && !isJointPassedByMethod(j, 'РК')) return true;
      if (uzkPlanPct > 0 && !isJointPassedByMethod(j, 'УЗК')) return true;
      if (pvkPlanPct > 0 && !isJointPassedByMethod(j, 'ПВК')) return true;
      if (
        requiredPhysicalSpecs.length === 0 &&
        (!j.ndtResult ||
          j.ndtResult === 'Не проводился' ||
          j.ndtResult === 'В работе' ||
          !j.ndtReportNumber?.trim())
      ) {
        return true;
      }
      return false;
    });

    const hasDeficit =
      vikDeficit > 0 ||
      totalPhysicalDeficit > 0 ||
      welderDeficits.length > 0 ||
      inRepairCount > 0;

    allLineRows.push({
      uniqueLineId,
      rdCode,
      objectName,
      lineNumber,
      lineName,
      contour,
      controlNtd,
      pipelineCategory,
      qualityLevel,
      totalJoints,
      weldedCount,
      fullyAcceptedCount,
      inRepairCount,
      jointsInWorkCount,
      vikPlanPct,
      vikRequired,
      vikCompleted,
      vikInWork,
      vikDeficit,
      vikActualPct,
      rkPlanPct,
      rkRequired,
      rkCompleted,
      rkInWork,
      rkDeficit,
      rkActualPct,
      uzkPlanPct,
      uzkRequired,
      uzkCompleted,
      uzkInWork,
      uzkDeficit,
      uzkActualPct,
      pvkPlanPct,
      pvkRequired,
      pvkCompleted,
      pvkInWork,
      pvkDeficit,
      pvkActualPct,
      totalPhysicalDeficit,
      recommendedMethod,
      welderDeficits,
      candidateJoints,
      allWeldedJoints,
      hasDeficit,
    });
  }

  // Сортируем линии: сначала с дефицитом, затем по номеру линии
  allLineRows.sort((a, b) => {
    if (a.hasDeficit !== b.hasDeficit) return a.hasDeficit ? -1 : 1;
    if (a.rdCode !== b.rdCode) return a.rdCode.localeCompare(b.rdCode, 'ru');
    return a.lineNumber.localeCompare(b.lineNumber, 'ru', { numeric: true });
  });

  // Группируем по Шифрам РД
  const groupsMap = new Map<string, NdtLineDeficitRow[]>();
  for (const row of allLineRows) {
    const list = groupsMap.get(row.rdCode) || [];
    list.push(row);
    groupsMap.set(row.rdCode, list);
  }

  const rdGroups: NdtRdDeficitGroup[] = [];
  for (const [rdCode, lines] of groupsMap.entries()) {
    const objectName = lines[0]?.objectName || '';
    rdGroups.push({
      rdCode,
      objectName,
      lines,
      totalLines: lines.length,
      deficitLinesCount: lines.filter((l) => l.hasDeficit).length,
      totalJoints: lines.reduce((acc, l) => acc + l.totalJoints, 0),
      weldedCount: lines.reduce((acc, l) => acc + l.weldedCount, 0),
      vikRequired: lines.reduce((acc, l) => acc + l.vikRequired, 0),
      vikCompleted: lines.reduce((acc, l) => acc + l.vikCompleted, 0),
      vikDeficit: lines.reduce((acc, l) => acc + l.vikDeficit, 0),
      rkRequired: lines.reduce((acc, l) => acc + l.rkRequired, 0),
      rkCompleted: lines.reduce((acc, l) => acc + l.rkCompleted, 0),
      rkDeficit: lines.reduce((acc, l) => acc + l.rkDeficit, 0),
      uzkRequired: lines.reduce((acc, l) => acc + l.uzkRequired, 0),
      uzkCompleted: lines.reduce((acc, l) => acc + l.uzkCompleted, 0),
      uzkDeficit: lines.reduce((acc, l) => acc + l.uzkDeficit, 0),
      pvkRequired: lines.reduce((acc, l) => acc + l.pvkRequired, 0),
      pvkCompleted: lines.reduce((acc, l) => acc + l.pvkCompleted, 0),
      pvkDeficit: lines.reduce((acc, l) => acc + l.pvkDeficit, 0),
      totalPhysicalDeficit: lines.reduce((acc, l) => acc + l.totalPhysicalDeficit, 0),
    });
  }

  rdGroups.sort((a, b) => b.totalPhysicalDeficit - a.totalPhysicalDeficit);

  const totals = {
    totalRdCodes: rdGroups.length,
    totalLines: allLineRows.length,
    deficitLinesCount: allLineRows.filter((l) => l.hasDeficit).length,
    totalWelded: allLineRows.reduce((acc, l) => acc + l.weldedCount, 0),
    jointsInWorkCount: allLineRows.reduce((acc, l) => acc + l.jointsInWorkCount, 0),
    vikDeficit: allLineRows.reduce((acc, l) => acc + l.vikDeficit, 0),
    rkDeficit: allLineRows.reduce((acc, l) => acc + l.rkDeficit, 0),
    uzkDeficit: allLineRows.reduce((acc, l) => acc + l.uzkDeficit, 0),
    pvkDeficit: allLineRows.reduce((acc, l) => acc + l.pvkDeficit, 0),
    totalPhysicalDeficit: allLineRows.reduce((acc, l) => acc + l.totalPhysicalDeficit, 0),
  };

  return { rdGroups, allLineRows, totals };
}

/**
 * Генерирует следующий порядковый номер заявки на НК (напр., ЗНК-2026-004).
 */
export function suggestNextLabRequestNumber(existingRequests: NdtLabRequest[]): string {
  const year = new Date().getFullYear();
  let maxNum = 0;
  for (const r of existingRequests) {
    const match = r.requestNumber.match(/(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (!Number.isNaN(n) && n > maxNum) maxNum = n;
    }
  }
  return `ЗНК-${year}-${String(maxNum + 1).padStart(3, '0')}`;
}

/**
 * Генерирует следующий порядковый номер заключения НК / ВИК (напр. РК-2026/025).
 */
export function suggestNextConclusionNumber(
  joints: WeldJoint[],
  prefix: string = 'РК'
): string {
  const cleanPrefix = prefix.replace('+УЗК', '').trim() || 'НК';
  let maxSeq = 0;
  for (const j of joints) {
    const candidates = [
      j.vikReportNumber,
      j.ndtReportNumber,
      j.dupNdtReportNumber,
      j.repairVikNumber,
      j.repairNdtNumber,
      j.repairDupNdtNumber,
    ];
    for (const c of candidates) {
      if (!c) continue;
      if (c.toUpperCase().includes(cleanPrefix.toUpperCase())) {
        const m = c.match(/(\d+)\s*$/);
        if (m) {
          const val = parseInt(m[1], 10);
          if (!Number.isNaN(val) && val < 99999 && val > maxSeq) {
            maxSeq = val;
          }
        }
      }
    }
  }
  return `${cleanPrefix}-26/${String(maxSeq + 1).padStart(3, '0')}`;
}

/**
 * Формирует патч обновления стыка при приёмке заявки дефектоскопистом в работу.
 */
export function buildAcceptIntoWorkJointPatch(
  joint: WeldJoint,
  request: Pick<NdtLabRequest, 'controlStage' | 'requestedMethod' | 'requestedMethods'>,
  inspectorShortName: string
): Partial<WeldJoint> {
  const patch: Partial<WeldJoint> = {};
  const reqMethods = getRequestMethodsList(request);
  const physMethods = reqMethods.filter(
    (m): m is 'РК' | 'УЗК' | 'ПВК' => m !== 'ВИК'
  );
  const primaryPhysNdt = derivePrimaryNdtMethod(reqMethods);

  const stageTag: 'primary' | 'repair' | 'duplicate' =
    request.controlStage === 'Повторный НК после ремонта' || isJointCurrentlyInRepair(joint)
      ? 'repair'
      : request.controlStage === 'Дублирующий контроль'
      ? 'duplicate'
      : 'primary';

  // Обновляем карту labConclusions только для запрошенных методов, не стирая существующие заключения
  const mergedConclusions: LabConclusionsMap = { ...(joint.labConclusions || {}) };
  let lcChanged = false;
  for (const m of reqMethods) {
    const existing = mergedConclusions[m];
    const alreadyDoneForStage =
      existing &&
      existing.result === 'Годен' &&
      (stageTag === 'primary' || existing.stage === stageTag);
    if (!alreadyDoneForStage) {
      mergedConclusions[m] = {
        reportNumber: existing?.stage === stageTag ? existing.reportNumber || '' : '',
        date: existing?.stage === stageTag ? existing.date || '' : '',
        result: 'В работе',
        inspector: inspectorShortName,
        stage: stageTag,
      };
      lcChanged = true;
    }
  }
  if (lcChanged) {
    patch.labConclusions = mergedConclusions;
  }

  if (stageTag === 'repair') {
    if (
      (reqMethods.includes('ВИК') || request.controlStage === 'Повторный НК после ремонта') &&
      joint.repairVikResult !== 'Годен'
    ) {
      patch.repairVikResult = 'В работе';
      patch.repairVikInspector = inspectorShortName;
    }
    if (physMethods.length > 0 && primaryPhysNdt !== 'Не требуется') {
      patch.repairNdtType = primaryPhysNdt;
      if (joint.repairNdtResult !== 'Годен') {
        patch.repairNdtResult = 'В работе';
      }
      patch.repairNdtInspector = inspectorShortName;
    }
    return patch;
  }

  if (stageTag === 'duplicate') {
    if (physMethods.length > 0 && primaryPhysNdt !== 'Не требуется') {
      patch.dupNdtType = primaryPhysNdt;
      if (joint.dupNdtResult !== 'Годен') {
        patch.dupNdtResult = 'В работе';
      }
      patch.dupNdtInspector = inspectorShortName;
    }
    return patch;
  }

  if (
    (reqMethods.includes('ВИК') || request.controlStage === 'Первичный ВИК и НК') &&
    joint.vikResult !== 'Годен'
  ) {
    patch.vikResult = 'В работе';
    patch.vikInspector = inspectorShortName;
  }

  if (physMethods.length > 0 && primaryPhysNdt !== 'Не требуется') {
    patch.ndtType = primaryPhysNdt;
    if (joint.ndtResult !== 'Годен') {
      patch.ndtResult = 'В работе';
    }
    patch.ndtInspector = inspectorShortName;
  }
  return patch;
}

/**
 * Проверяет и формирует патч сохранения заключения лаборатории по конкретному стыку.
 * Возвращает { ok, error?, patch }.
 */
export function buildLabConclusionPatch(
  joint: WeldJoint,
  input: LabConclusionFormInput
): { ok: boolean; error?: string; patch: Partial<WeldJoint> } {
  const reportNum = input.ndtReportNumber.trim();
  const reportDate = input.ndtDate.trim();
  const inspector = input.ndtInspector.trim();

  if (
    (input.ndtResult === 'Годен' ||
      input.ndtResult === 'Ремонт' ||
      input.ndtResult === 'Вырезать') &&
    !reportNum
  ) {
    return {
      ok: false,
      error: `Для стыка № ${joint.jointNumber} необходимо указать номер заключения НК.`,
      patch: {},
    };
  }

  if (
    (input.ndtResult === 'Годен' ||
      input.ndtResult === 'Ремонт' ||
      input.ndtResult === 'Вырезать') &&
    !reportDate
  ) {
    return {
      ok: false,
      error: `Для стыка № ${joint.jointNumber} необходимо указать дату заключения НК.`,
      patch: {},
    };
  }

  if (reportDate && joint.weldingDate && reportDate < joint.weldingDate) {
    return {
      ok: false,
      error: `Стык № ${joint.jointNumber}: дата заключения НК (${reportDate}) не может быть раньше даты сварки (${joint.weldingDate}).`,
      patch: {},
    };
  }

  if (
    input.includeVik &&
    input.vikDate &&
    joint.weldingDate &&
    input.vikDate < joint.weldingDate
  ) {
    return {
      ok: false,
      error: `Стык № ${joint.jointNumber}: дата акта ВИК (${input.vikDate}) не может быть раньше даты сварки (${joint.weldingDate}).`,
      patch: {},
    };
  }

  const patch: Partial<WeldJoint> = {};
  const stageTag: 'primary' | 'repair' | 'duplicate' =
    input.stage === 'Повторный НК после ремонта'
      ? 'repair'
      : input.stage === 'Дублирующий контроль'
      ? 'duplicate'
      : 'primary';

  const syncedConclusions: LabConclusionsMap = { ...(joint.labConclusions || {}) };
  const targetPhysMethods: ('РК' | 'УЗК' | 'ПВК')[] = [];
  if (matchesPhysicalMethod(input.ndtMethod, 'РК')) targetPhysMethods.push('РК');
  if (matchesPhysicalMethod(input.ndtMethod, 'УЗК')) targetPhysMethods.push('УЗК');
  if (matchesPhysicalMethod(input.ndtMethod, 'ПВК')) targetPhysMethods.push('ПВК');
  for (const pm of targetPhysMethods) {
    syncedConclusions[pm] = {
      reportNumber: reportNum,
      date: reportDate,
      result: input.ndtResult,
      inspector,
      stage: stageTag,
    };
  }
  if (input.includeVik) {
    syncedConclusions['ВИК'] = {
      reportNumber: input.vikReportNumber?.trim() || '',
      date: input.vikDate?.trim() || reportDate,
      result: input.vikResult || (input.ndtResult === 'Годен' ? 'Годен' : input.ndtResult),
      inspector: input.vikInspector?.trim() || inspector,
      stage: stageTag,
    };
  }
  if (Object.keys(syncedConclusions).length > 0) {
    patch.labConclusions = syncedConclusions;
  }

  if (input.stage === 'Повторный НК после ремонта') {
    if (input.includeVik) {
      patch.repairVikNumber = input.vikReportNumber?.trim() || '';
      patch.repairVikDate = input.vikDate?.trim() || reportDate;
      patch.repairVikResult = input.vikResult || input.ndtResult;
      patch.repairVikInspector = input.vikInspector?.trim() || inspector;
    }
    patch.repairNdtType = input.ndtMethod;
    patch.repairNdtNumber = reportNum;
    patch.repairNdtDate = reportDate;
    patch.repairNdtResult = input.ndtResult;
    if (inspector) patch.repairNdtInspector = inspector;
    return { ok: true, patch };
  }

  if (input.stage === 'Дублирующий контроль') {
    patch.dupNdtType = input.ndtMethod;
    patch.dupNdtReportNumber = reportNum;
    patch.dupNdtDate = reportDate;
    patch.dupNdtResult = input.ndtResult;
    if (inspector) patch.dupNdtInspector = inspector;
    return { ok: true, patch };
  }

  // Первичный ВИК и НК / Физический НК
  if (input.includeVik) {
    patch.vikReportNumber = input.vikReportNumber?.trim() || '';
    patch.vikDate = input.vikDate?.trim() || reportDate;
    patch.vikResult = input.vikResult || (input.ndtResult === 'Годен' ? 'Годен' : input.ndtResult);
    if (input.vikInspector?.trim() || inspector) {
      patch.vikInspector = input.vikInspector?.trim() || inspector;
    }
  }

  patch.ndtType = input.ndtMethod;
  patch.ndtReportNumber = reportNum;
  patch.ndtDate = reportDate;
  patch.ndtResult = input.ndtResult;
  if (inspector) {
    patch.ndtInspector = inspector;
  }

  return { ok: true, patch };
}

/**
 * Проверяет, оформлено ли итоговое заключение по стыку в рамках заявки.
 */
export const CANONICAL_LAB_METHODS: readonly LabConclusionMethodKey[] = [
  'ВИК',
  'РК',
  'УЗК',
  'ПВК',
];

const METHOD_ALIASES_MAP: Record<string, LabConclusionMethodKey> = {
  ВИК: 'ВИК',
  VIK: 'ВИК',
  VT: 'ВИК',
  РК: 'РК',
  RK: 'РК',
  RT: 'РК',
  УЗК: 'УЗК',
  UZK: 'УЗК',
  UT: 'УЗК',
  ПВК: 'ПВК',
  PVK: 'ПВК',
  PT: 'ПВК',
  МК: 'ПВК',
  МПК: 'ПВК',
};

export function normalizeLabMethodKey(token?: string | null): LabConclusionMethodKey | null {
  const clean = String(token ?? '').trim().toUpperCase();
  return METHOD_ALIASES_MAP[clean] ?? null;
}

export function getRequestMethodsList(
  req?: Pick<NdtLabRequest, 'requestedMethods' | 'requestedMethod'> | null
): LabConclusionMethodKey[] {
  if (!req) return ['РК'];
  const tokens: LabConclusionMethodKey[] = [];
  const source =
    Array.isArray(req.requestedMethods) && req.requestedMethods.length > 0
      ? req.requestedMethods
      : String(req.requestedMethod || '').split(/[+,;/]+/);

  for (const item of source) {
    for (const part of String(item || '').split(/[+,;/]+/)) {
      const m = normalizeLabMethodKey(part);
      if (m && !tokens.includes(m)) {
        tokens.push(m);
      }
    }
  }
  const ordered = CANONICAL_LAB_METHODS.filter((m) => tokens.includes(m));
  return ordered.length > 0 ? ordered : ['РК'];
}

export interface LineMethodAvailability {
  method: LabConclusionMethodKey;
  planPct: number;
  required: boolean;
  disabled: boolean;
}

export interface LineLabNormsEvaluation {
  hasLineNorms: boolean;
  warningMessage?: string;
  methods: Record<LabConclusionMethodKey, LineMethodAvailability>;
  requiredMethods: LabConclusionMethodKey[];
}

export function resolveLineLabMethodAvailability(
  lineRow?: Pick<NdtLineDeficitRow, 'rkPlanPct' | 'uzkPlanPct' | 'pvkPlanPct'> | Pick<ProjectLineItem, 'rkPercent' | 'uzkPercent' | 'pvkPercent'> | null,
  activeRequestMethods?: LabConclusionMethodKey[]
): LineLabNormsEvaluation {
  const activeSet = new Set(activeRequestMethods ?? []);

  if (!lineRow) {
    const methods: Record<LabConclusionMethodKey, LineMethodAvailability> = {
      ВИК: { method: 'ВИК', planPct: 100, required: true, disabled: false },
      РК: { method: 'РК', planPct: 0, required: activeSet.has('РК'), disabled: false },
      УЗК: { method: 'УЗК', planPct: 0, required: activeSet.has('УЗК'), disabled: false },
      ПВК: { method: 'ПВК', planPct: 0, required: activeSet.has('ПВК'), disabled: false },
    };
    return {
      hasLineNorms: false,
      warningMessage: 'Линия не привязана к Лайнлисту — методы контроля оставлены доступными',
      methods,
      requiredMethods: CANONICAL_LAB_METHODS.filter((m) => methods[m].required),
    };
  }

  const rkPct = 'rkPlanPct' in lineRow ? lineRow.rkPlanPct : Number(lineRow.rkPercent ?? 0);
  const uzkPct = 'uzkPlanPct' in lineRow ? lineRow.uzkPlanPct : Number(lineRow.uzkPercent ?? 0);
  const pvkPct = 'pvkPlanPct' in lineRow ? lineRow.pvkPlanPct : Number(lineRow.pvkPercent ?? 0);

  const hasLineNorms = rkPct > 0 || uzkPct > 0 || pvkPct > 0;

  if (!hasLineNorms) {
    const methods: Record<LabConclusionMethodKey, LineMethodAvailability> = {
      ВИК: { method: 'ВИК', planPct: 100, required: true, disabled: false },
      РК: { method: 'РК', planPct: 0, required: activeSet.has('РК'), disabled: false },
      УЗК: { method: 'УЗК', planPct: 0, required: activeSet.has('УЗК'), disabled: false },
      ПВК: { method: 'ПВК', planPct: 0, required: activeSet.has('ПВК'), disabled: false },
    };
    return {
      hasLineNorms: false,
      warningMessage: 'В Лайнлисте не заполнены проценты НК — методы оставлены доступными',
      methods,
      requiredMethods: CANONICAL_LAB_METHODS.filter((m) => methods[m].required),
    };
  }

  const methods: Record<LabConclusionMethodKey, LineMethodAvailability> = {
    ВИК: { method: 'ВИК', planPct: 100, required: true, disabled: false },
    РК: {
      method: 'РК',
      planPct: rkPct,
      required: rkPct > 0 || activeSet.has('РК'),
      disabled: rkPct <= 0 && !activeSet.has('РК'),
    },
    УЗК: {
      method: 'УЗК',
      planPct: uzkPct,
      required: uzkPct > 0 || activeSet.has('УЗК'),
      disabled: uzkPct <= 0 && !activeSet.has('УЗК'),
    },
    ПВК: {
      method: 'ПВК',
      planPct: pvkPct,
      required: pvkPct > 0 || activeSet.has('ПВК'),
      disabled: pvkPct <= 0 && !activeSet.has('ПВК'),
    },
  };

  return {
    hasLineNorms: true,
    methods,
    requiredMethods: CANONICAL_LAB_METHODS.filter((m) => methods[m].required),
  };
}

export function isJointConclusionCompletedForRequest(
  joint: WeldJoint | undefined,
  stage: NdtLabControlStage,
  requestedMethods?: LabConclusionMethodKey[]
): boolean {
  if (!joint) return false;
  const isFinalResult = (res?: ControlResult) =>
    res === 'Годен' || res === 'Ремонт' || res === 'Вырезать';

  const methods = requestedMethods && requestedMethods.length > 0 ? requestedMethods : null;
  const lc = joint.labConclusions;

  if (stage === 'Повторный НК после ремонта') {
    if (methods) {
      return methods.every((m) => {
        const entry = lc?.[m];
        if (
          entry &&
          entry.stage === 'repair' &&
          Boolean(entry.reportNumber?.trim()) &&
          Boolean(entry.date?.trim()) &&
          isFinalResult(entry.result)
        ) {
          return true;
        }
        if (m === 'ВИК') {
          return Boolean(joint.repairVikNumber?.trim()) && isFinalResult(joint.repairVikResult);
        }
        return (
          matchesPhysicalMethod(joint.repairNdtType, m) &&
          Boolean(joint.repairNdtNumber?.trim()) &&
          Boolean(joint.repairNdtDate?.trim()) &&
          isFinalResult(joint.repairNdtResult)
        );
      });
    }
    return (
      Boolean(joint.repairNdtNumber?.trim()) &&
      Boolean(joint.repairNdtDate?.trim()) &&
      isFinalResult(joint.repairNdtResult)
    );
  }

  if (stage === 'Дублирующий контроль') {
    if (methods) {
      return methods.every((m) => {
        const entry = lc?.[m];
        if (
          entry &&
          entry.stage === 'duplicate' &&
          Boolean(entry.reportNumber?.trim()) &&
          Boolean(entry.date?.trim()) &&
          isFinalResult(entry.result)
        ) {
          return true;
        }
        if (m === 'ВИК') {
          return Boolean(joint.vikReportNumber?.trim()) && isFinalResult(joint.vikResult);
        }
        return (
          matchesPhysicalMethod(joint.dupNdtType, m) &&
          Boolean(joint.dupNdtReportNumber?.trim()) &&
          Boolean(joint.dupNdtDate?.trim()) &&
          isFinalResult(joint.dupNdtResult)
        );
      });
    }
    return (
      Boolean(joint.dupNdtReportNumber?.trim()) &&
      Boolean(joint.dupNdtDate?.trim()) &&
      isFinalResult(joint.dupNdtResult)
    );
  }

  if (methods) {
    return methods.every((m) => {
      const entry = lc?.[m];
      if (
        entry &&
        (!entry.stage || entry.stage === 'primary') &&
        Boolean(entry.reportNumber?.trim()) &&
        Boolean(entry.date?.trim()) &&
        isFinalResult(entry.result)
      ) {
        return true;
      }
      if (m === 'ВИК') {
        return Boolean(joint.vikReportNumber?.trim()) && isFinalResult(joint.vikResult);
      }
      return (
        matchesPhysicalMethod(joint.ndtType, m) &&
        Boolean(joint.ndtReportNumber?.trim()) &&
        Boolean(joint.ndtDate?.trim()) &&
        isFinalResult(joint.ndtResult)
      );
    });
  }

  return (
    Boolean(joint.ndtReportNumber?.trim()) &&
    Boolean(joint.ndtDate?.trim()) &&
    isFinalResult(joint.ndtResult)
  );
}

/**
 * Собирает патч обновления стыка из раздельных заключений по методам (ВИК/РК/УЗК/ПВК)
 * с одновременной синхронизацией агрегированных полей для журналов и готовности.
 */
export function buildMultiMethodLabConclusionPatch(
  joint: WeldJoint,
  stage: NdtLabControlStage,
  conclusions: LabConclusionsMap
): { ok: boolean; error?: string; patch: Partial<WeldJoint> } {
  const isFinalResult = (res?: ControlResult) =>
    res === 'Годен' || res === 'Ремонт' || res === 'Вырезать';

  const resultPriority: Record<string, number> = {
    Вырезать: 4,
    Ремонт: 3,
    'В работе': 2,
    Годен: 1,
    'Не проводился': 0,
  };

  for (const m of CANONICAL_LAB_METHODS) {
    const entry = conclusions[m];
    if (!entry) continue;
    if (isFinalResult(entry.result) && !entry.reportNumber?.trim()) {
      return {
        ok: false,
        error: `Стык № ${joint.jointNumber}: укажите номер заключения для метода ${m}.`,
        patch: {},
      };
    }
    if (entry.date && joint.weldingDate && entry.date < joint.weldingDate) {
      return {
        ok: false,
        error: `Стык № ${joint.jointNumber}: дата заключения ${m} не может быть раньше даты сварки (${joint.weldingDate}).`,
        patch: {},
      };
    }
  }

  const normalizedMap: LabConclusionsMap = {};
  const stageTag: 'primary' | 'repair' | 'duplicate' =
    stage === 'Повторный НК после ремонта'
      ? 'repair'
      : stage === 'Дублирующий контроль'
      ? 'duplicate'
      : 'primary';

  for (const m of CANONICAL_LAB_METHODS) {
    const entry = conclusions[m];
    if (!entry) continue;
    normalizedMap[m] = {
      reportNumber: entry.reportNumber.trim(),
      date: entry.date.trim(),
      result: entry.result,
      inspector: entry.inspector.trim(),
      stage: stageTag,
    };
  }

  // Сохраняем существующие записи labConclusions для незатронутых методов;
  // для этапов ремонта и дублирующего контроля не перетираем первичные записи пустыми значениями.
  const mergedMap: LabConclusionsMap = { ...(joint.labConclusions || {}) };
  for (const m of CANONICAL_LAB_METHODS) {
    const entry = normalizedMap[m];
    if (!entry) continue;
    if (
      stageTag !== 'primary' &&
      entry.result === 'Не проводился' &&
      !entry.reportNumber
    ) {
      continue;
    }
    mergedMap[m] = entry;
  }

  const patch: Partial<WeldJoint> = {
    labConclusions: mergedMap,
  };

  const vikEntry = normalizedMap['ВИК'];
  const physEntries = (['РК', 'УЗК', 'ПВК'] as const)
    .map((m) => ({ method: m, entry: normalizedMap[m] }))
    .filter(
      (item): item is { method: 'РК' | 'УЗК' | 'ПВК'; entry: NonNullable<LabConclusionsMap['РК']> } =>
        Boolean(item.entry) &&
        (item.entry!.result !== 'Не проводился' ||
          Boolean(item.entry!.reportNumber) ||
          Boolean(item.entry!.date))
    )
    .sort((a, b) => (resultPriority[b.entry.result] ?? 0) - (resultPriority[a.entry.result] ?? 0));

  const primaryPhys = physEntries[0];
  const resolveAggregatedPhysType = (): NdtMethod => {
    if (!primaryPhys) return 'Не требуется';
    const topPriority = resultPriority[primaryPhys.entry.result] ?? 0;
    const topMethods = physEntries
      .filter((item) => (resultPriority[item.entry.result] ?? 0) === topPriority)
      .map((item) => item.method);
    if (topMethods.includes('РК') && topMethods.includes('УЗК')) {
      return 'РК+УЗК';
    }
    return primaryPhys.method;
  };

  if (stage === 'Повторный НК после ремонта') {
    if (vikEntry && vikEntry.result !== 'Не проводился') {
      patch.repairVikNumber = vikEntry.reportNumber;
      patch.repairVikDate = vikEntry.date;
      patch.repairVikResult = vikEntry.result;
      patch.repairVikInspector = vikEntry.inspector;
    }
    if (primaryPhys) {
      patch.repairNdtType = resolveAggregatedPhysType();
      patch.repairNdtNumber = primaryPhys.entry.reportNumber;
      patch.repairNdtDate = primaryPhys.entry.date;
      patch.repairNdtResult = primaryPhys.entry.result;
      patch.repairNdtInspector = primaryPhys.entry.inspector;
    }
    return { ok: true, patch };
  }

  if (stage === 'Дублирующий контроль') {
    if (primaryPhys) {
      patch.dupNdtType = resolveAggregatedPhysType();
      patch.dupNdtReportNumber = primaryPhys.entry.reportNumber;
      patch.dupNdtDate = primaryPhys.entry.date;
      patch.dupNdtResult = primaryPhys.entry.result;
      patch.dupNdtInspector = primaryPhys.entry.inspector;
    }
    return { ok: true, patch };
  }

  if (vikEntry) {
    patch.vikReportNumber = vikEntry.reportNumber;
    patch.vikDate = vikEntry.date;
    patch.vikResult = vikEntry.result;
    patch.vikInspector = vikEntry.inspector;
  }

  if (primaryPhys) {
    patch.ndtType = resolveAggregatedPhysType();
    patch.ndtReportNumber = primaryPhys.entry.reportNumber;
    patch.ndtDate = primaryPhys.entry.date;
    patch.ndtResult = primaryPhys.entry.result;
    patch.ndtInspector = primaryPhys.entry.inspector;
  }

  return { ok: true, patch };
}

/**
 * Пересчитывает статус заявки на НК на основании текущего состояния стыков.
 */
export function syncLabRequestStatusWithJoints(
  request: NdtLabRequest,
  jointsById: Map<string, WeldJoint>
): NdtLabRequest {
  if (request.jointIds.length === 0) return request;
  const reqMethods = getRequestMethodsList(request);
  const allCompleted = request.jointIds.every((id) =>
    isJointConclusionCompletedForRequest(jointsById.get(id), request.controlStage, reqMethods)
  );
  if (allCompleted && request.status !== 'Выполнена') {
    return {
      ...request,
      status: 'Выполнена',
      completedAt: new Date().toISOString().slice(0, 10),
    };
  }
  return request;
}

/**
 * Определяет статус заявки на НК для конкретного стыка в разделе «Реестр стыков»:
 * - «Заявка не подана»
 * - «Заявка подана»
 * - «Заявка в работе»
 * - «Заявка исполнена»
 */
export function getJointLabRequestStatus(
  joint: WeldJoint,
  labRequests: NdtLabRequest[] = []
): JointLabRequestStatus {
  // 1. Проверяем актуальные заявки в журнале заявок ЛНК (от новых к старым)
  for (const req of labRequests) {
    if (req.jointIds.includes(joint.id)) {
      const reqMethods = getRequestMethodsList(req);
      if (
        req.status === 'Выполнена' ||
        isJointConclusionCompletedForRequest(joint, req.controlStage, reqMethods)
      ) {
        return 'Заявка исполнена';
      }
      if (req.status === 'В работе ЛНК') {
        return 'Заявка в работе';
      }
      if (req.status === 'Подана ПТО') {
        return 'Заявка подана';
      }
    }
  }

  // 2. Проверяем фактическое состояние полей контроля самого стыка
  const isFinalResult = (res?: ControlResult) =>
    res === 'Годен' || res === 'Ремонт' || res === 'Вырезать';

  if (isJointCurrentlyInRepair(joint)) {
    if (
      Boolean(joint.repairNdtNumber?.trim()) &&
      Boolean(joint.repairNdtDate?.trim()) &&
      isFinalResult(joint.repairNdtResult)
    ) {
      return 'Заявка исполнена';
    }
    if (joint.repairNdtResult === 'В работе' || joint.repairVikResult === 'В работе') {
      return 'Заявка в работе';
    }
    return 'Заявка не подана';
  }

  if (
    Boolean(joint.ndtReportNumber?.trim()) &&
    Boolean(joint.ndtDate?.trim()) &&
    isFinalResult(joint.ndtResult)
  ) {
    return 'Заявка исполнена';
  }

  const hasAnyLabConclusionInWork = Object.values(joint.labConclusions || {}).some(
    (c) => c?.result === 'В работе'
  );
  if (
    joint.ndtResult === 'В работе' ||
    joint.vikResult === 'В работе' ||
    joint.dupNdtResult === 'В работе' ||
    hasAnyLabConclusionInWork
  ) {
    return 'Заявка в работе';
  }

  return 'Заявка не подана';
}

/**
 * Проверяет допустимость подачи заявки на НК по стыку из раздела «Реестр стыков».
 * Правило: Допускается подача заявки, если заполнена дата сварки и клеймо сварщика без замечаний.
 */
export function validateJointForLabRequestSubmission(
  joint: WeldJoint,
  welders: WelderProfile[] = []
): { canSubmit: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (!joint.weldingDate || !joint.weldingDate.trim()) {
    reasons.push('Не заполнена дата сварки');
  }

  const rawStamp = (joint.welderStamp || '').trim();
  if (!rawStamp) {
    reasons.push('Не заполнено клеймо сварщика');
  }

  if (rawStamp && welders.length > 0) {
    // Извлекаем индивидуальные клейма или бригадное клеймо
    const stampsToCheck: string[] = [];
    if (joint.welderStampsList && joint.welderStampsList.length > 0) {
      stampsToCheck.push(
        ...joint.welderStampsList.map((s) => s.trim()).filter(Boolean)
      );
    } else {
      // Если формат вида "БР-01 (А142, К089)" — извлекаем клейма внутри скобок или само клеймо
      const parenMatch = rawStamp.match(/\(([^)]+)\)/);
      if (parenMatch) {
        stampsToCheck.push(
          ...parenMatch[1]
            .split(/[,;/+]+/)
            .map((s) => s.trim())
            .filter(Boolean)
        );
      } else {
        stampsToCheck.push(
          ...rawStamp
            .split(/[,;/+]+/)
            .map((s) => s.trim())
            .filter(Boolean)
        );
      }
    }

    for (const st of stampsToCheck) {
      const profile =
        findWelderByStamp(welders, st, false) ||
        findWelderByStamp(welders, st, true);

      if (!profile) {
        reasons.push(`Клеймо сварщика «${st}» отсутствует в справочнике НАКС`);
        continue;
      }

      const certInfo = getWelderCertForMethod(profile, joint.weldingType);
      const certStatus = checkNaksCertStatus(
        certInfo.expiryDate,
        joint.weldingDate || undefined
      );
      if (certStatus.status === 'expired') {
        reasons.push(`Клеймо «${profile.stamp}»: удостоверение НАКС просрочено (${certStatus.message})`);
      }

      const naksCheck = validateWelderNaksAttestation(profile, {
        diameterMm: joint.diameterMm,
        wallThickness: joint.wallThickness,
        weldingType: joint.weldingType,
      });
      if (!naksCheck.isValid || naksCheck.errors.length > 0 || naksCheck.warnings.length > 0) {
        for (const err of naksCheck.errors) {
          reasons.push(`Клеймо «${profile.stamp}»: ${err}`);
        }
        for (const warn of naksCheck.warnings) {
          reasons.push(`Клеймо «${profile.stamp}»: ${warn}`);
        }
      }
    }
  }

  return {
    canSubmit: reasons.length === 0,
    reasons,
  };
}

/**
 * Формирует стартовый набор реалистичных производственных заявок на НК
 * на основе фактических сваренных стыков в базе данных.
 */
export function buildInitialSeedLabRequests(
  joints: WeldJoint[],
  lineList: ProjectLineItem[]
): NdtLabRequest[] {
  const statement = calculateLaboratoryDeficitStatement(joints, lineList, 'ALL', 'ALL');
  const requests: NdtLabRequest[] = [];

  const deficitLines = statement.allLineRows.filter(
    (l) => l.candidateJoints.length > 0
  );

  // 1. Заявка в статусе «Подана ПТО» (ожидает приёмки дефектоскопистом в работу)
  if (deficitLines[0]) {
    const row = deficitLines[0];
    const targetJoints = row.candidateJoints.slice(0, 4);
    if (targetJoints.length > 0) {
      requests.push({
        id: 'lab-req-seed-1',
        requestNumber: 'ЗНК-2026-001',
        createdAt: '2026-06-16 09:15',
        createdDate: '2026-06-16',
        createdBy: 'Смирнов А.В. (Инженер ПТО)',
        objectName: row.objectName,
        rdCode: row.rdCode,
        lineNumber: row.lineNumber,
        uniqueLineId: row.uniqueLineId,
        contour: row.contour,
        controlStage: 'Первичный ВИК и НК',
        requestedMethod: row.recommendedMethod,
        jointIds: targetJoints.map((j) => j.id),
        status: 'Подана ПТО',
        notes: `Добор нормативного объёма контроля (норма РК ${row.rkPlanPct}%, УЗК ${row.uzkPlanPct}%) по дефицитной ведомости линии ${row.lineNumber}`,
      });
    }
  }

  // 2. Заявка в статусе «В работе ЛНК» (принята дефектоскопистом, ожидает внесения номеров заключений)
  const inWorkJoints = joints.filter(
    (j) =>
      Boolean(j.weldingDate) &&
      (j.ndtResult === 'В работе' || j.vikResult === 'В работе' || isJointCurrentlyInRepair(j))
  );
  const secondRow = deficitLines[1] || deficitLines[0];
  if (secondRow) {
    const pool =
      inWorkJoints.filter((j) => j.uniqueLineId === secondRow.uniqueLineId).length > 0
        ? inWorkJoints.filter((j) => j.uniqueLineId === secondRow.uniqueLineId)
        : secondRow.allWeldedJoints.slice(0, 3);
    if (pool.length > 0) {
      requests.push({
        id: 'lab-req-seed-2',
        requestNumber: 'ЗНК-2026-002',
        createdAt: '2026-06-15 14:20',
        createdDate: '2026-06-15',
        createdBy: 'Смирнов А.В. (Инженер ПТО)',
        objectName: secondRow.objectName,
        rdCode: secondRow.rdCode,
        lineNumber: secondRow.lineNumber,
        uniqueLineId: secondRow.uniqueLineId,
        contour: secondRow.contour,
        controlStage: 'Физический НК (РК/УЗК/ПВК)',
        requestedMethod: secondRow.recommendedMethod,
        jointIds: pool.map((j) => j.id),
        status: 'В работе ЛНК',
        acceptedAt: '2026-06-15 15:05',
        acceptedBy: 'Орлова Е.В.',
        notes: `Оперативный контроль сваренных монтажных стыков контура ${secondRow.contour}`,
      });
    }
  }

  // 3. Выполненная заявка (с уже оформленными заключениями)
  const completedJoints = joints.filter(
    (j) =>
      Boolean(j.weldingDate) &&
      Boolean(j.ndtReportNumber?.trim()) &&
      j.ndtResult === 'Годен'
  );
  if (completedJoints.length > 0) {
    const sample = completedJoints[0];
    const sameLineCompleted = completedJoints
      .filter((j) => j.uniqueLineId === sample.uniqueLineId)
      .slice(0, 4);
    requests.push({
      id: 'lab-req-seed-3',
      requestNumber: 'ЗНК-2026-003',
      createdAt: '2026-06-12 10:00',
      createdDate: '2026-06-12',
      createdBy: 'Смирнов А.В. (Инженер ПТО)',
      objectName: sample.objectName,
      rdCode: sample.rdCode,
      lineNumber: sample.lineNumber,
      uniqueLineId: sample.uniqueLineId,
      contour: sample.contour,
      controlStage: 'Первичный ВИК и НК',
      requestedMethod: sample.ndtType && sample.ndtType !== 'Не требуется' ? sample.ndtType : 'РК',
      jointIds: sameLineCompleted.map((j) => j.id),
      status: 'Выполнена',
      acceptedAt: '2026-06-12 11:30',
      acceptedBy: sample.ndtInspector || 'Орлова Е.В.',
      completedAt: sample.ndtDate || '2026-06-13',
      notes: 'Первичная партия стыков принята по ВИК и РК без замечаний',
    });
  }

  return requests;
}
