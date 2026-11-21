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

export function hasJointUnresolvedDefect(joint: WeldJoint): boolean {
  const defectResults = new Set(['Ремонт', 'Вырезать']);
  const primaryDefect =
    defectResults.has(joint.vikResult) ||
    defectResults.has(joint.ndtResult) ||
    (joint.dupNdtType &&
      joint.dupNdtType !== 'Не требуется' &&
      defectResults.has(joint.dupNdtResult));

  if (!primaryDefect) return false;

  const repairAction = (joint.repairAction || '').trim();
  if (!repairAction) return true;

  if (joint.repairVikResult !== 'Годен') return true;
  if (joint.repairNdtType && joint.repairNdtType !== 'Не требуется') {
    if (joint.repairNdtResult !== 'Годен') return true;
  }
  if (joint.repairDupNdtType && joint.repairDupNdtType !== 'Не требуется') {
    if (joint.repairDupNdtResult !== 'Годен') return true;
  }
  return false;
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

  const assigned = allJoints.filter(
    (j) =>
      j.testCircuitId === circuit.id ||
      (!j.testCircuitId &&
        circuit.objectName &&
        j.objectName === circuit.objectName &&
        j.contour &&
        j.contour.trim() === circuit.name.trim())
  );

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
