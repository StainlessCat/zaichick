import type {
  CircuitJointBrief,
  CircuitLineSummary,
  CircuitTestStatus,
  ProjectLineItem,
  SriStatus,
  TestCircuit,
  TestCircuitDetail,
  WeldJoint,
} from '../types/welding';
import { getJointEquivDiaInch, getJointNominalInch, isJointWelded } from './jointDerived';
import { isJointPassedByMethod } from './laboratoryLogic';
import { isJointDefective } from './readiness';

export const SRI_STATUS_LABELS: Record<SriStatus, string> = {
  IN_DEVELOPMENT: 'В разработке',
  DEVELOPED: 'Разработана',
  APPROVED: 'Согласована',
};

export const CIRCUIT_TEST_STATUS_LABELS: Record<CircuitTestStatus, string> = {
  NOT_TESTED: 'Не испытано',
  TESTED: 'Испытано',
};

export const SRI_STATUS_OPTIONS: { value: SriStatus; label: string }[] = [
  { value: 'IN_DEVELOPMENT', label: 'В разработке' },
  { value: 'DEVELOPED', label: 'Разработана' },
  { value: 'APPROVED', label: 'Согласована' },
];

export const CIRCUIT_TEST_STATUS_OPTIONS: { value: CircuitTestStatus; label: string }[] = [
  { value: 'NOT_TESTED', label: 'Не испытано' },
  { value: 'TESTED', label: 'Испытано' },
];

const DEFECT_RESULTS = new Set(['Ремонт', 'Вырезать']);
const DEFECT_REPAIR_ACTIONS = new Set(['Ремонт', 'Вырезано', 'Требуется ремонт']);

function isDefectResult(value?: string | null): boolean {
  return Boolean(value) && DEFECT_RESULTS.has(value!);
}

export interface CircuitNdtReadiness {
  totalJoints: number;
  requiredChecks: number;
  passedChecks: number;
  deficitChecks: number;
  ndtPercent: number;
  deficitDetails: string[];
  vikRequired: number;
  vikPassed: number;
  rkRequired: number;
  rkPassed: number;
  uzkRequired: number;
  uzkPassed: number;
  pvkRequired: number;
  pvkPassed: number;
  isNdtComplete: boolean;
}

export interface CircuitJointControlSummary {
  status: 'defect' | 'repaired' | 'passed' | 'in_work' | 'pending';
  label: string;
  detail: string;
}

/**
 * Определяет, принадлежит ли стык указанному испытательному контуру
 * (по UUID testCircuitId либо по совпадению объекта и текстового поля contour).
 */
export function isJointAssignedToCircuit(
  joint: WeldJoint,
  circuit: Pick<TestCircuit, 'id' | 'name' | 'objectName'>
): boolean {
  if (joint.testCircuitId) {
    return joint.testCircuitId === circuit.id;
  }
  return Boolean(
    circuit.objectName &&
      joint.objectName === circuit.objectName &&
      joint.contour &&
      joint.contour.trim() === circuit.name.trim()
  );
}

/**
 * Единая проверка неисправленного брака стыка для модуля «Испытания».
 * Учитывает плоские поля первичного/дублирующего/ремонтного контроля,
 * поле repairAction и многометодную карту labConclusions из «Лаборатории НК».
 */
export function hasJointUnresolvedDefect(joint: WeldJoint): boolean {
  const labEntries = joint.labConclusions ? Object.values(joint.labConclusions) : [];
  const hasLabRepairDefect = labEntries.some(
    (e) => e && e.stage === 'repair' && DEFECT_RESULTS.has(e.result)
  );
  if (hasLabRepairDefect) return true;

  const hasRepairFieldDefect =
    isDefectResult(joint.repairVikResult) ||
    isDefectResult(joint.repairNdtResult) ||
    isDefectResult(joint.repairDupNdtResult);
  if (hasRepairFieldDefect) return true;

  const hasLabPrimaryOrDupDefect = labEntries.some(
    (e) => e && e.stage !== 'repair' && DEFECT_RESULTS.has(e.result)
  );
  const repairAction = (joint.repairAction || '').trim();
  const primaryDefect =
    DEFECT_RESULTS.has(joint.vikResult) ||
    DEFECT_RESULTS.has(joint.ndtResult) ||
    (Boolean(joint.dupNdtType) &&
      joint.dupNdtType !== 'Не требуется' &&
      DEFECT_RESULTS.has(joint.dupNdtResult)) ||
    hasLabPrimaryOrDupDefect ||
    DEFECT_REPAIR_ACTIONS.has(repairAction);

  if (!primaryDefect) return false;

  const hasRepairVik =
    Boolean(joint.repairVikResult) && joint.repairVikResult !== 'Не проводился';
  const hasRepairNdt =
    Boolean(joint.repairNdtType) &&
    joint.repairNdtType !== 'Не требуется' &&
    Boolean(joint.repairNdtResult) &&
    joint.repairNdtResult !== 'Не проводился';

  if (hasRepairVik || hasRepairNdt) {
    if (joint.repairVikResult !== 'Годен') return true;
    if (joint.repairNdtType && joint.repairNdtType !== 'Не требуется') {
      if (joint.repairNdtResult !== 'Годен') return true;
    }
    if (joint.repairDupNdtType && joint.repairDupNdtType !== 'Не требуется') {
      if (
        joint.repairDupNdtResult &&
        joint.repairDupNdtResult !== 'Не проводился' &&
        joint.repairDupNdtResult !== 'Годен'
      ) {
        return true;
      }
      if (!joint.repairDupNdtResult || joint.repairDupNdtResult === 'Не проводился') {
        return true;
      }
    }
    return false;
  }

  // Обратная совместимость с legacy-записями, закрытыми через дублирующий НК
  const hadPrimaryRepair =
    joint.vikResult === 'Ремонт' || joint.ndtResult === 'Ремонт';
  const legacyDupAccepted =
    hadPrimaryRepair &&
    !hasLabPrimaryOrDupDefect &&
    Boolean(joint.dupNdtType) &&
    joint.dupNdtType !== 'Не требуется' &&
    joint.dupNdtResult === 'Годен';

  return !legacyDupAccepted;
}

function isJointVikPassed(joint: WeldJoint): boolean {
  if (hasJointUnresolvedDefect(joint)) {
    return (
      joint.repairVikResult === 'Годен' ||
      (joint.labConclusions?.['ВИК']?.stage === 'repair' &&
        joint.labConclusions['ВИК'].result === 'Годен')
    );
  }
  return (
    joint.labConclusions?.['ВИК']?.result === 'Годен' ||
    joint.vikResult === 'Годен' ||
    joint.repairVikResult === 'Годен'
  );
}

/**
 * Рассчитывает честную готовность испытательного контура по ВИК и физическим методам НК (РК, УЗК, ПВК)
 * на основании норм контроля по линиям из Лайнлиста — синхронно с логикой «Лаборатории НК».
 */
export function computeCircuitNdtReadiness(
  circuit: Pick<TestCircuit, 'id' | 'name' | 'objectName'>,
  allJoints: WeldJoint[],
  allLines: ProjectLineItem[]
): CircuitNdtReadiness {
  const lineById = new Map<string, ProjectLineItem>();
  const lineByUnique = new Map<string, ProjectLineItem>();
  for (const l of allLines) {
    lineById.set(l.id, l);
    if (l.uniqueLineId) lineByUnique.set(l.uniqueLineId, l);
  }

  const assigned = allJoints.filter((j) => isJointAssignedToCircuit(j, circuit));
  if (assigned.length === 0) {
    return {
      totalJoints: 0,
      requiredChecks: 0,
      passedChecks: 0,
      deficitChecks: 0,
      ndtPercent: 0,
      deficitDetails: [],
      vikRequired: 0,
      vikPassed: 0,
      rkRequired: 0,
      rkPassed: 0,
      uzkRequired: 0,
      uzkPassed: 0,
      pvkRequired: 0,
      pvkPassed: 0,
      isNdtComplete: false,
    };
  }

  const byLine = new Map<string, { line?: ProjectLineItem; joints: WeldJoint[] }>();
  for (const j of assigned) {
    const lineKey = j.lineId || j.uniqueLineId;
    const existing = byLine.get(lineKey);
    if (existing) {
      existing.joints.push(j);
    } else {
      const matchedLine =
        (j.lineId && lineById.get(j.lineId)) || lineByUnique.get(j.uniqueLineId);
      byLine.set(lineKey, { line: matchedLine, joints: [j] });
    }
  }

  let vikRequired = 0;
  let vikPassed = 0;
  let rkRequired = 0;
  let rkPassed = 0;
  let uzkRequired = 0;
  let uzkPassed = 0;
  let pvkRequired = 0;
  let pvkPassed = 0;

  for (const { line, joints: lineJoints } of byLine.values()) {
    const count = lineJoints.length;
    const reqVik = count;
    const reqRk = line && line.rkPercent > 0 ? Math.ceil((count * line.rkPercent) / 100) : 0;
    const reqUzk = line && line.uzkPercent > 0 ? Math.ceil((count * line.uzkPercent) / 100) : 0;
    const reqPvk = line && line.pvkPercent > 0 ? Math.ceil((count * line.pvkPercent) / 100) : 0;

    let passVik = 0;
    let passRk = 0;
    let passUzk = 0;
    let passPvk = 0;

    for (const j of lineJoints) {
      if (!isJointWelded(j)) continue;
      if (isJointVikPassed(j)) passVik += 1;
      if (reqRk > 0 && isJointPassedByMethod(j, 'РК')) passRk += 1;
      if (reqUzk > 0 && isJointPassedByMethod(j, 'УЗК')) passUzk += 1;
      if (reqPvk > 0 && isJointPassedByMethod(j, 'ПВК')) passPvk += 1;
    }

    vikRequired += reqVik;
    vikPassed += Math.min(passVik, reqVik);
    rkRequired += reqRk;
    rkPassed += Math.min(passRk, reqRk);
    uzkRequired += reqUzk;
    uzkPassed += Math.min(passUzk, reqUzk);
    pvkRequired += reqPvk;
    pvkPassed += Math.min(passPvk, reqPvk);
  }

  const requiredChecks = vikRequired + rkRequired + uzkRequired + pvkRequired;
  const passedChecks = vikPassed + rkPassed + uzkPassed + pvkPassed;
  const deficitChecks = Math.max(0, requiredChecks - passedChecks);
  const ndtPercent =
    requiredChecks > 0 ? Math.round((passedChecks / requiredChecks) * 1000) / 10 : 0;

  const deficitDetails: string[] = [];
  if (vikRequired > vikPassed) deficitDetails.push(`ВИК −${vikRequired - vikPassed}`);
  if (rkRequired > rkPassed) deficitDetails.push(`РК −${rkRequired - rkPassed}`);
  if (uzkRequired > uzkPassed) deficitDetails.push(`УЗК −${uzkRequired - uzkPassed}`);
  if (pvkRequired > pvkPassed) deficitDetails.push(`ПВК −${pvkRequired - pvkPassed}`);

  return {
    totalJoints: assigned.length,
    requiredChecks,
    passedChecks,
    deficitChecks,
    ndtPercent,
    deficitDetails,
    vikRequired,
    vikPassed,
    rkRequired,
    rkPassed,
    uzkRequired,
    uzkPassed,
    pvkRequired,
    pvkPassed,
    isNdtComplete: requiredChecks > 0 && deficitChecks === 0,
  };
}

/**
 * Формирует достоверный статус контроля стыка для таблицы состава контура:
 * исключает противоречие «Годен / Ремонт» у стыков с закрытым ремонтом и отражает многометодный НК.
 */
export function formatJointControlSummaryForCircuit(
  joint: WeldJoint
): CircuitJointControlSummary {
  const unresolved = hasJointUnresolvedDefect(joint);
  if (unresolved) {
    const badParts: string[] = [];
    if (isDefectResult(joint.vikResult) || isDefectResult(joint.repairVikResult)) {
      badParts.push(`ВИК: ${isDefectResult(joint.repairVikResult) ? joint.repairVikResult : joint.vikResult}`);
    }
    const lc = joint.labConclusions;
    if (lc) {
      for (const m of ['РК', 'УЗК', 'ПВК'] as const) {
        if (lc[m] && isDefectResult(lc[m]!.result)) {
          badParts.push(`${m}: ${lc[m]!.result}`);
        }
      }
    }
    if (badParts.length === 0 && isDefectResult(joint.ndtResult)) {
      badParts.push(`${joint.ndtType && joint.ndtType !== 'Не требуется' ? joint.ndtType : 'НК'}: ${joint.ndtResult}`);
    }
    if (badParts.length === 0 && isDefectResult(joint.repairNdtResult)) {
      badParts.push(`Ремонт НК: ${joint.repairNdtResult}`);
    }
    return {
      status: 'defect',
      label: 'Брак',
      detail: badParts.join(' · ') || 'Требуется ремонт',
    };
  }

  const hadRepair =
    isJointDefective(joint) ||
    DEFECT_RESULTS.has(joint.vikResult) ||
    DEFECT_RESULTS.has(joint.ndtResult) ||
    DEFECT_REPAIR_ACTIONS.has((joint.repairAction || '').trim());

  if (hadRepair) {
    const methods: string[] = ['ВИК: Годен'];
    if (joint.repairNdtType && joint.repairNdtType !== 'Не требуется' && joint.repairNdtResult === 'Годен') {
      methods.push(`${joint.repairNdtType}: Годен`);
    } else if (joint.dupNdtType && joint.dupNdtType !== 'Не требуется' && joint.dupNdtResult === 'Годен') {
      methods.push(`${joint.dupNdtType}: Годен`);
    }
    return {
      status: 'repaired',
      label: 'Годен · после ремонта',
      detail: methods.join(' · '),
    };
  }

  const parts: string[] = [];
  const vikOk = isJointVikPassed(joint);
  if (vikOk) {
    parts.push('ВИК: Годен');
  } else if (joint.vikResult === 'В работе' || joint.labConclusions?.['ВИК']?.result === 'В работе') {
    parts.push('ВИК: В работе');
  }

  const physPassed: string[] = [];
  const physInWork: string[] = [];
  for (const m of ['РК', 'УЗК', 'ПВК'] as const) {
    if (isJointPassedByMethod(joint, m)) {
      physPassed.push(m);
    } else if (joint.labConclusions?.[m]?.result === 'В работе') {
      physInWork.push(m);
    }
  }
  if (physPassed.length > 0) {
    parts.push(`${physPassed.join('+')}: Годен`);
  }
  if (physInWork.length > 0) {
    parts.push(`${physInWork.join('+')}: В работе`);
  } else if (physPassed.length === 0 && joint.ndtResult === 'В работе') {
    parts.push(`${joint.ndtType && joint.ndtType !== 'Не требуется' ? joint.ndtType : 'НК'}: В работе`);
  }

  if (parts.length === 0) {
    return {
      status: 'pending',
      label: 'Не проводился',
      detail: 'Контроль не выполнен',
    };
  }

  const hasInWork =
    physInWork.length > 0 ||
    joint.vikResult === 'В работе' ||
    joint.ndtResult === 'В работе' ||
    joint.labConclusions?.['ВИК']?.result === 'В работе';

  return {
    status: hasInWork ? 'in_work' : 'passed',
    label: parts.join(' · '),
    detail: parts.join(' · '),
  };
}

/**
 * Возвращает различимую подпись линии для бейджа в таблице контуров:
 * если в контуре есть несколько линий с одинаковым коротким номером (из разных шифров РД),
 * показывает уникальный код линии, иначе — компактный номер линии.
 */
export function getCircuitUniqueLineLabel(
  line: CircuitLineSummary,
  allLinesInCircuit: CircuitLineSummary[]
): string {
  const shortName = (line.lineNumber || '').trim();
  if (!shortName) return line.uniqueLineId;
  const duplicatesCount = allLinesInCircuit.filter(
    (other) => (other.lineNumber || '').trim() === shortName
  ).length;
  return duplicatesCount > 1 ? line.uniqueLineId : shortName;
}

export function computeCircuitMetricsLocal(
  circuit: TestCircuit,
  allJoints: WeldJoint[],
  allLines: ProjectLineItem[]
): TestCircuitDetail {
  const lineById = new Map<string, ProjectLineItem>();
  const lineByUnique = new Map<string, ProjectLineItem>();
  for (const l of allLines) {
    lineById.set(l.id, l);
    if (l.uniqueLineId) lineByUnique.set(l.uniqueLineId, l);
  }

  // Count total joints per line across entire project
  const lineTotals = new Map<string, number>();
  for (const j of allJoints) {
    const key = j.lineId || j.uniqueLineId;
    lineTotals.set(key, (lineTotals.get(key) || 0) + 1);
  }

  const assigned = allJoints.filter((j) => isJointAssignedToCircuit(j, circuit));

  let totalJoints = 0;
  let weldedJoints = 0;
  let totalDInch = 0;
  let weldedDInch = 0;
  let totalEdi = 0;
  let weldedEdi = 0;
  let defectiveJointsCount = 0;

  const lineGroups = new Map<
    string,
    {
      lineId: string;
      lineNumber: string;
      uniqueLineId: string;
      rdCode: string;
      assignedCount: number;
    }
  >();

  const jointBriefs: CircuitJointBrief[] = [];

  for (const j of assigned) {
    totalJoints += 1;
    const welded = isJointWelded(j);
    const dInch = getJointNominalInch(j);
    const edi = getJointEquivDiaInch(j);
    const hasDefect = hasJointUnresolvedDefect(j);

    totalDInch += dInch;
    totalEdi += edi;
    if (welded) {
      weldedJoints += 1;
      weldedDInch += dInch;
      weldedEdi += edi;
    }
    if (hasDefect) {
      defectiveJointsCount += 1;
    }

    const lineKey = j.lineId || j.uniqueLineId;
    const matchedLine = (j.lineId && lineById.get(j.lineId)) || lineByUnique.get(j.uniqueLineId);
    const grp = lineGroups.get(lineKey) || {
      lineId: matchedLine?.id || j.lineId || lineKey,
      lineNumber: matchedLine?.lineNumber || j.lineNumber,
      uniqueLineId: matchedLine?.uniqueLineId || j.uniqueLineId,
      rdCode: matchedLine?.rdCode || j.rdCode,
      assignedCount: 0,
    };
    grp.assignedCount += 1;
    lineGroups.set(lineKey, grp);

    jointBriefs.push({
      id: j.id,
      lineId: grp.lineId,
      jointNumber: j.jointNumber,
      uniqueLineId: j.uniqueLineId,
      lineNumber: j.lineNumber,
      rdCode: j.rdCode,
      diameterMm: j.diameterMm,
      diameterInch: j.diameterInch,
      wallThickness: j.wallThickness,
      dInch: Math.round(dInch * 100) / 100,
      edi: Math.round(edi * 100) / 100,
      weldingDate: j.weldingDate || null,
      welderStamp: j.welderStamp || '',
      isWelded: welded,
      vikResult: j.vikResult,
      ndtType: j.ndtType,
      ndtResult: j.ndtResult,
      hasUnresolvedDefect: hasDefect,
      recordStatus: j.recordStatus || 'DRAFT',
      version: j.version ?? 1,
    });
  }

  const linesSummary: CircuitLineSummary[] = Array.from(lineGroups.entries())
    .map(([lineKey, g]) => {
      const lineTotal = lineTotals.get(lineKey) ?? g.assignedCount;
      return {
        lineId: g.lineId,
        lineNumber: g.lineNumber,
        uniqueLineId: g.uniqueLineId,
        rdCode: g.rdCode,
        assignedJointsCount: g.assignedCount,
        lineTotalJointsCount: lineTotal,
        isFullLine: lineTotal > 0 && g.assignedCount >= lineTotal,
      };
    })
    .sort((a, b) => a.uniqueLineId.localeCompare(b.uniqueLineId, 'ru'));

  const weldingJointsPercent =
    totalJoints > 0 ? Math.round((weldedJoints / totalJoints) * 1000) / 10 : 0;
  const weldingDInchPercent =
    totalDInch > 0 ? Math.round((weldedDInch / totalDInch) * 1000) / 10 : 0;
  const weldingEdiPercent =
    totalEdi > 0 ? Math.round((weldedEdi / totalEdi) * 1000) / 10 : 0;

  return {
    ...circuit,
    totalJoints,
    weldedJoints,
    weldingJointsPercent,
    totalDInch: Math.round(totalDInch * 100) / 100,
    weldedDInch: Math.round(weldedDInch * 100) / 100,
    weldingDInchPercent,
    totalEdi: Math.round(totalEdi * 100) / 100,
    weldedEdi: Math.round(weldedEdi * 100) / 100,
    weldingEdiPercent,
    defectiveJointsCount,
    linesSummary,
    joints: jointBriefs.sort((a, b) => {
      const lineCmp = a.uniqueLineId.localeCompare(b.uniqueLineId, 'ru');
      if (lineCmp !== 0) return lineCmp;
      return a.jointNumber.localeCompare(b.jointNumber, 'ru', { numeric: true });
    }),
  };
}

export function buildSeedTestCircuitsFromJoints(
  joints: WeldJoint[],
  lines: ProjectLineItem[],
  facilityIdByObjectName: Record<string, string> = {}
): TestCircuit[] {
  const seen = new Map<string, { objectName: string; name: string }>();
  for (const j of joints) {
    const name = (j.contour || '').trim();
    if (!name || name === '—' || name === '-') continue;
    const key = `${j.objectName}::${name}`;
    if (!seen.has(key)) {
      seen.set(key, { objectName: j.objectName, name });
    }
  }
  const circuits: TestCircuit[] = [];
  let idx = 1;
  for (const [, info] of seen.entries()) {
    const base: TestCircuit = {
      id: `local-circuit-${idx++}`,
      facilityId: facilityIdByObjectName[info.objectName] || 'fac-local',
      objectName: info.objectName,
      name: info.name,
      sriName: `СРИ-${info.name}`,
      sriStatus: 'DEVELOPED',
      testStatus: 'NOT_TESTED',
      plannedDate: null,
      actualTestDate: null,
      actNumber: null,
      recordStatus: 'DRAFT',
      version: 1,
      totalJoints: 0,
      weldedJoints: 0,
      weldingJointsPercent: 0,
      totalDInch: 0,
      weldedDInch: 0,
      weldingDInchPercent: 0,
      totalEdi: 0,
      weldedEdi: 0,
      weldingEdiPercent: 0,
      defectiveJointsCount: 0,
      linesSummary: [],
    };
    const computed = computeCircuitMetricsLocal(base, joints, lines);
    const { joints: _unused, ...summary } = computed;
    void _unused;
    circuits.push(summary);
  }
  return circuits;
}
