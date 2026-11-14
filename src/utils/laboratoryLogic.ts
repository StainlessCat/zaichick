import {
  ControlResult,
  JointLabRequestStatus,
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

/**
 * Проверяет, засчитан ли стык по методу РК (основной, дублирующий или после ремонта со статусом «Годен»).
 */
export function isJointPassedByMethod(
  joint: WeldJoint,
  targetMethod: 'РК' | 'УЗК' | 'ПВК'
): boolean {
  const matchesMethod = (m?: NdtMethod | string): boolean => {
    if (!m) return false;
    if (targetMethod === 'РК') return m === 'РК' || m === 'РК+УЗК';
    if (targetMethod === 'УЗК') return m === 'УЗК' || m === 'РК+УЗК';
    if (targetMethod === 'ПВК') return m === 'ПВК' || m === 'МК';
    return false;
  };

  // Если стык в открытом ремонте, первичное заключение не засчитывается до закрытия ремонта
  const inOpenRepair = isJointCurrentlyInRepair(joint);
  if (inOpenRepair) {
    return (
      (matchesMethod(joint.repairNdtType) && joint.repairNdtResult === 'Годен') ||
      (matchesMethod(joint.repairDupNdtType) && joint.repairDupNdtResult === 'Годен')
    );
  }

  return (
    (matchesMethod(joint.ndtType) && joint.ndtResult === 'Годен') ||
    (matchesMethod(joint.dupNdtType) && joint.dupNdtResult === 'Годен') ||
    (matchesMethod(joint.repairNdtType) && joint.repairNdtResult === 'Годен') ||
    (matchesMethod(joint.repairDupNdtType) && joint.repairDupNdtResult === 'Годен')
  );
}

/**
 * Проверяет, находится ли стык «В работе» у лаборатории НК по указанному методу.
 */
export function isJointInWorkByMethod(
  joint: WeldJoint,
  targetMethod: 'РК' | 'УЗК' | 'ПВК'
): boolean {
  const matchesMethod = (m?: NdtMethod | string): boolean => {
    if (!m) return false;
    if (targetMethod === 'РК') return m === 'РК' || m === 'РК+УЗК';
    if (targetMethod === 'УЗК') return m === 'УЗК' || m === 'РК+УЗК';
    if (targetMethod === 'ПВК') return m === 'ПВК' || m === 'МК';
    return false;
  };

  return (
    (matchesMethod(joint.ndtType) && joint.ndtResult === 'В работе') ||
    (matchesMethod(joint.dupNdtType) && joint.dupNdtResult === 'В работе') ||
    (matchesMethod(joint.repairNdtType) && joint.repairNdtResult === 'В работе')
  );
}

/**
 * Вычисляет полную дефицитную ведомость неразрушающего контроля с группировкой по шифрам РД и линиям
 * и учётом нормативного процента контроля (РК %, УЗК %, ПВК %, ВИК 100%) и квот по сварщикам.
 */
export function calculateLaboratoryDeficitStatement(
  joints: WeldJoint[],
  lineList: ProjectLineItem[],
  selectedObjectName = 'ALL',
  selectedRdCode = 'ALL'
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
    const vikCompleted = allWeldedJoints.filter(
      (j) =>
        j.vikResult === 'Годен' ||
        (j.vikResult === 'Ремонт' && j.repairVikResult === 'Годен')
    ).length;
    const vikInWork = allWeldedJoints.filter(
      (j) => j.vikResult === 'В работе' || j.repairVikResult === 'В работе'
    ).length;
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

    // 5. Анализ квот по каждому сварщику на линии
    const welderStats = new Map<string, { welded: number; controlled: number }>();
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
      const hasAnyPhysicalNdt =
        isJointPassedByMethod(j, 'РК') ||
        isJointPassedByMethod(j, 'УЗК') ||
        isJointPassedByMethod(j, 'ПВК');
      stamps.forEach((stamp) => {
        const cur = welderStats.get(stamp) || { welded: 0, controlled: 0 };
        cur.welded += 1;
        if (hasAnyPhysicalNdt) cur.controlled += 1;
        welderStats.set(stamp, cur);
      });
    }

    const welderDeficits: WelderQuotaDeficitItem[] = [];
    const maxPlanPct = Math.max(rkPlanPct, uzkPlanPct, pvkPlanPct);
    if (maxPlanPct > 0) {
      for (const [stamp, st] of welderStats.entries()) {
        const req = Math.max(1, Math.ceil(st.welded * (maxPlanPct / 100)));
        if (st.controlled < req) {
          welderDeficits.push({
            stamp,
            weldedCount: st.welded,
            controlledCount: st.controlled,
            requiredCount: req,
            deficitCount: req - st.controlled,
          });
        }
      }
    }

    // Кандидаты на включение в заявку НК: сваренные стыки, у которых не завершён контроль или открыт ремонт
    const candidateJoints = allWeldedJoints.filter((j) => {
      if (isJointCurrentlyInRepair(j)) return true;
      if (j.vikResult !== 'Годен') return true;
      if (
        !j.ndtResult ||
        j.ndtResult === 'Не проводился' ||
        j.ndtResult === 'В работе' ||
        !j.ndtReportNumber?.trim()
      ) {
        return true;
      }
      return false;
    });

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
  request: Pick<NdtLabRequest, 'controlStage' | 'requestedMethod'>,
  inspectorShortName: string
): Partial<WeldJoint> {
  const patch: Partial<WeldJoint> = {};

  if (request.controlStage === 'Повторный НК после ремонта' || isJointCurrentlyInRepair(joint)) {
    if (joint.repairVikResult !== 'Годен') {
      patch.repairVikResult = 'В работе';
      patch.repairVikInspector = inspectorShortName;
    }
    patch.repairNdtType = request.requestedMethod;
    if (joint.repairNdtResult !== 'Годен') {
      patch.repairNdtResult = 'В работе';
    }
    patch.repairNdtInspector = inspectorShortName;
    return patch;
  }

  if (request.controlStage === 'Дублирующий контроль') {
    patch.dupNdtType = request.requestedMethod;
    if (joint.dupNdtResult !== 'Годен') {
      patch.dupNdtResult = 'В работе';
    }
    patch.dupNdtInspector = inspectorShortName;
    return patch;
  }

  if (request.controlStage === 'Первичный ВИК и НК') {
    if (joint.vikResult !== 'Годен') {
      patch.vikResult = 'В работе';
      patch.vikInspector = inspectorShortName;
    }
  }

  patch.ndtType = request.requestedMethod;
  if (joint.ndtResult !== 'Годен') {
    patch.ndtResult = 'В работе';
  }
  patch.ndtInspector = inspectorShortName;
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
export function isJointConclusionCompletedForRequest(
  joint: WeldJoint | undefined,
  stage: NdtLabControlStage
): boolean {
  if (!joint) return false;
  const isFinalResult = (res?: ControlResult) =>
    res === 'Годен' || res === 'Ремонт' || res === 'Вырезать';

  if (stage === 'Повторный НК после ремонта') {
    return (
      Boolean(joint.repairNdtNumber?.trim()) &&
      Boolean(joint.repairNdtDate?.trim()) &&
      isFinalResult(joint.repairNdtResult)
    );
  }
  if (stage === 'Дублирующий контроль') {
    return (
      Boolean(joint.dupNdtReportNumber?.trim()) &&
      Boolean(joint.dupNdtDate?.trim()) &&
      isFinalResult(joint.dupNdtResult)
    );
  }
  return (
    Boolean(joint.ndtReportNumber?.trim()) &&
    Boolean(joint.ndtDate?.trim()) &&
    isFinalResult(joint.ndtResult)
  );
}

/**
 * Пересчитывает статус заявки на НК на основании текущего состояния стыков.
 */
export function syncLabRequestStatusWithJoints(
  request: NdtLabRequest,
  jointsById: Map<string, WeldJoint>
): NdtLabRequest {
  if (request.jointIds.length === 0) return request;
  const allCompleted = request.jointIds.every((id) =>
    isJointConclusionCompletedForRequest(jointsById.get(id), request.controlStage)
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
      if (
        req.status === 'Выполнена' ||
        isJointConclusionCompletedForRequest(joint, req.controlStage)
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

  if (
    joint.ndtResult === 'В работе' ||
    joint.vikResult === 'В работе' ||
    joint.dupNdtResult === 'В работе'
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
