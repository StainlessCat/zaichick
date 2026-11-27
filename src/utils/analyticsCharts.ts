import type {
  ProjectLineItem,
  ReadinessGroupCondition,
  ReadinessSummaryRow,
  TestCircuit,
  WeldJoint,
  WelderProfile,
} from '../types/welding';
import { normalizeDateToISO } from './dates';
import { getJointEquivDiaInch } from './jointDerived';
import { calculateWelderNdtQuotas, type WelderNdtQuotaReport } from './ndtQuotas';
import {
  isJointCurrentlyInRepair,
  isJointFullyAccepted,
  isJointWeldedWithStamp,
  isLineExecutiveDocSigned,
  type ExecutiveDocStatusLike,
} from './readiness';

export type DynamicsGranularity = 'day' | 'week';
export type DynamicsChartMode = 'day' | 'week' | 'group';
export type DynamicsMetric = 'joints' | 'edi';

export interface DynamicsBucket {
  periodKey: string;
  label: string;
  fullLabel: string;
  weldedJoints: number;
  acceptedJoints: number;
  repairJoints: number;
  weldedEdi: number;
  acceptedEdi: number;
  cumWeldedJoints: number;
  cumAcceptedJoints: number;
  cumWeldedEdi: number;
  cumAcceptedEdi: number;
}

export interface WeldingDynamicsResult {
  buckets: DynamicsBucket[];
  totalWeldedJoints: number;
  totalAcceptedJoints: number;
  totalWeldedEdi: number;
  avgJointsPerPeriod: number;
  avgEdiPerPeriod: number;
  peakJointsLabel: string;
  peakJointsCount: number;
  peakEdiLabel: string;
  peakEdiValue: number;
  activePeriodsCount: number;
}

function formatShortRuDate(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}.${parts[1]}`;
}

function formatFullRuDate(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

/**
 * Возвращает понедельник ISO-недели для даты YYYY-MM-DD в формате YYYY-MM-DD
 */
function getIsoWeekStart(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
  const diffToMon = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + diffToMon);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Формирует временной ряд динамики сварки и накопительной S-кривой по дням или неделям.
 */
export function buildWeldingDynamicsSeries(
  joints: WeldJoint[],
  granularity: DynamicsGranularity = 'day'
): WeldingDynamicsResult {
  const map = new Map<
    string,
    {
      weldedJoints: number;
      acceptedJoints: number;
      repairJoints: number;
      weldedEdi: number;
      acceptedEdi: number;
    }
  >();

  for (const j of joints) {
    if (!isJointWeldedWithStamp(j)) continue;
    const iso = normalizeDateToISO(j.weldingDate);
    if (!iso) continue;
    const key = granularity === 'week' ? getIsoWeekStart(iso) : iso;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        weldedJoints: 0,
        acceptedJoints: 0,
        repairJoints: 0,
        weldedEdi: 0,
        acceptedEdi: 0,
      };
      map.set(key, entry);
    }
    const edi = getJointEquivDiaInch(j);
    entry.weldedJoints += 1;
    entry.weldedEdi += edi;
    if (isJointFullyAccepted(j)) {
      entry.acceptedJoints += 1;
      entry.acceptedEdi += edi;
    }
    if (isJointCurrentlyInRepair(j)) {
      entry.repairJoints += 1;
    }
  }

  const sortedKeys = Array.from(map.keys()).sort();
  let cumWeldedJoints = 0;
  let cumAcceptedJoints = 0;
  let cumWeldedEdi = 0;
  let cumAcceptedEdi = 0;

  let peakJointsCount = 0;
  let peakJointsLabel = '';
  let peakEdiValue = 0;
  let peakEdiLabel = '';

  const buckets: DynamicsBucket[] = sortedKeys.map((key) => {
    const raw = map.get(key)!;
    const weldedEdi = Math.round(raw.weldedEdi * 10) / 10;
    const acceptedEdi = Math.round(raw.acceptedEdi * 10) / 10;

    cumWeldedJoints += raw.weldedJoints;
    cumAcceptedJoints += raw.acceptedJoints;
    cumWeldedEdi = Math.round((cumWeldedEdi + weldedEdi) * 10) / 10;
    cumAcceptedEdi = Math.round((cumAcceptedEdi + acceptedEdi) * 10) / 10;

    const weekEnd = granularity === 'week' ? addDaysIso(key, 6) : key;
    const label =
      granularity === 'week'
        ? `${formatShortRuDate(key)}–${formatShortRuDate(weekEnd)}`
        : formatShortRuDate(key);
    const fullLabel =
      granularity === 'week'
        ? `${formatFullRuDate(key)} — ${formatFullRuDate(weekEnd)}`
        : formatFullRuDate(key);

    if (raw.weldedJoints > peakJointsCount) {
      peakJointsCount = raw.weldedJoints;
      peakJointsLabel = fullLabel;
    }
    if (weldedEdi > peakEdiValue) {
      peakEdiValue = weldedEdi;
      peakEdiLabel = fullLabel;
    }

    return {
      periodKey: key,
      label,
      fullLabel,
      weldedJoints: raw.weldedJoints,
      acceptedJoints: raw.acceptedJoints,
      repairJoints: raw.repairJoints,
      weldedEdi,
      acceptedEdi,
      cumWeldedJoints,
      cumAcceptedJoints,
      cumWeldedEdi,
      cumAcceptedEdi,
    };
  });

  const activePeriodsCount = buckets.length;
  const avgJointsPerPeriod =
    activePeriodsCount > 0
      ? Math.round((cumWeldedJoints / activePeriodsCount) * 10) / 10
      : 0;
  const avgEdiPerPeriod =
    activePeriodsCount > 0
      ? Math.round((cumWeldedEdi / activePeriodsCount) * 10) / 10
      : 0;

  return {
    buckets,
    totalWeldedJoints: cumWeldedJoints,
    totalAcceptedJoints: cumAcceptedJoints,
    totalWeldedEdi: cumWeldedEdi,
    avgJointsPerPeriod,
    avgEdiPerPeriod,
    peakJointsLabel,
    peakJointsCount,
    peakEdiLabel,
    peakEdiValue,
    activePeriodsCount,
  };
}

export interface ControlFunnelStage {
  id: 'total' | 'welded' | 'vik' | 'ndt' | 'accepted';
  label: string;
  count: number;
  pct: number;
  tone: 'slate' | 'navy' | 'sky' | 'indigo' | 'emerald';
}

export interface ControlFunnelResult {
  stages: ControlFunnelStage[];
  unweldedCount: number;
  awaitingVikCount: number;
  awaitingNdtCount: number;
  inRepairCount: number;
  ndtNotRequiredCount: number;
  totalLinesCount: number;
  signedIdLinesCount: number;
  pendingIdLinesCount: number;
  idReadinessPct: number;
}

/**
 * Рассчитывает воронку этапов контроля и узкие места («заторы») по текущей выборке.
 */
export function buildControlFunnelData(
  joints: WeldJoint[],
  lines: ProjectLineItem[],
  docByLineId?: Record<string, ExecutiveDocStatusLike>
): ControlFunnelResult {
  const total = joints.length;
  let welded = 0;
  let vikPassed = 0;
  let ndtClosed = 0;
  let ndtNotRequired = 0;
  let inRepair = 0;
  let accepted = 0;

  for (const j of joints) {
    if (isJointCurrentlyInRepair(j)) {
      inRepair += 1;
    }
    if (!isJointWeldedWithStamp(j)) continue;
    welded += 1;

    const isVikOk =
      j.vikResult === 'Годен' ||
      (j.vikResult === 'Ремонт' &&
        (j.repairVikResult === 'Годен' ||
          (j.dupNdtType !== 'Не требуется' && j.dupNdtResult === 'Годен')));
    if (isVikOk) vikPassed += 1;

    const isNdtPhysicalOk =
      j.ndtResult === 'Годен' ||
      (j.ndtResult === 'Ремонт' &&
        (j.repairNdtResult === 'Годен' ||
          (j.dupNdtType !== 'Не требуется' && j.dupNdtResult === 'Годен')));
    const isNdtNotReq =
      (!j.ndtType || j.ndtType === 'Не требуется') && !isJointCurrentlyInRepair(j);
    if (isNdtNotReq) ndtNotRequired += 1;
    if (isNdtPhysicalOk || isNdtNotReq) ndtClosed += 1;

    if (isJointFullyAccepted(j)) accepted += 1;
  }

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  const totalLinesCount = lines.length;
  const signedIdLinesCount = lines.filter((ln) =>
    isLineExecutiveDocSigned(ln, docByLineId)
  ).length;
  const pendingIdLinesCount = Math.max(0, totalLinesCount - signedIdLinesCount);
  const idReadinessPct =
    totalLinesCount > 0 ? Math.round((signedIdLinesCount / totalLinesCount) * 100) : 0;

  return {
    stages: [
      { id: 'total', label: 'Всего стыков', count: total, pct: total > 0 ? 100 : 0, tone: 'slate' },
      { id: 'welded', label: 'Сварено', count: welded, pct: pct(welded), tone: 'navy' },
      { id: 'vik', label: 'Годен ВИК', count: vikPassed, pct: pct(vikPassed), tone: 'sky' },
      { id: 'ndt', label: 'НК закрыт', count: ndtClosed, pct: pct(ndtClosed), tone: 'indigo' },
      { id: 'accepted', label: 'Полностью принято', count: accepted, pct: pct(accepted), tone: 'emerald' },
    ],
    unweldedCount: Math.max(0, total - welded),
    awaitingVikCount: Math.max(0, welded - vikPassed - inRepair),
    awaitingNdtCount: Math.max(0, welded - ndtClosed - inRepair),
    inRepairCount: inRepair,
    ndtNotRequiredCount: ndtNotRequired,
    totalLinesCount,
    signedIdLinesCount,
    pendingIdLinesCount,
    idReadinessPct,
  };
}

export interface WelderAnalyticsRow extends WelderNdtQuotaReport {
  weldedEdi: number;
  defectRatePct: number;
  acceptedCount: number;
  activeRepairCount: number;
  lastWeldingDate: string;
}

/**
 * Строит расширенную аналитику по сварщикам: выработка в стыках и EDI, % брака и квоты НК по СТО Газпром.
 */
export function buildWelderAnalyticsRows(
  joints: WeldJoint[],
  lines: ProjectLineItem[] = [],
  weldersDirectory: WelderProfile[] = []
): WelderAnalyticsRow[] {
  const baseQuotas = calculateWelderNdtQuotas(joints, lines);
  const directoryByStamp = new Map<string, string>();
  for (const w of weldersDirectory) {
    const key = String(w.stamp || '').trim().toUpperCase();
    if (key && w.fullName) {
      directoryByStamp.set(key, w.fullName);
    }
  }

  const extraByStamp = new Map<
    string,
    {
      weldedEdi: number;
      acceptedCount: number;
      activeRepairCount: number;
      lastWeldingDate: string;
    }
  >();

  for (const j of joints) {
    const stamps: string[] = [];
    if (j.welderStampsList && j.welderStampsList.length > 0) {
      stamps.push(...j.welderStampsList);
    } else if (j.welderStamp) {
      stamps.push(
        ...j.welderStamp
          .split(/[,;/+]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      );
    }
    if (stamps.length === 0) continue;

    const welded = isJointWeldedWithStamp(j);
    const edi = welded ? getJointEquivDiaInch(j) : 0;
    const accepted = isJointFullyAccepted(j);
    const activeRepair = isJointCurrentlyInRepair(j);
    const isoDate = normalizeDateToISO(j.weldingDate) || '';

    for (const stamp of stamps) {
      let ex = extraByStamp.get(stamp);
      if (!ex) {
        ex = {
          weldedEdi: 0,
          acceptedCount: 0,
          activeRepairCount: 0,
          lastWeldingDate: '',
        };
        extraByStamp.set(stamp, ex);
      }
      if (welded) {
        // При бригадной сварке (несколько клейм) учитываем долю EDI на сварщика для справедливой выработки
        ex.weldedEdi += edi / stamps.length;
      }
      if (accepted) ex.acceptedCount += 1;
      if (activeRepair) ex.activeRepairCount += 1;
      if (isoDate && (!ex.lastWeldingDate || isoDate > ex.lastWeldingDate)) {
        ex.lastWeldingDate = isoDate;
      }
    }
  }

  return baseQuotas.map((q) => {
    const ex = extraByStamp.get(q.stamp);
    const resolvedName =
      q.fullName || directoryByStamp.get(q.stamp.trim().toUpperCase()) || '';
    const defectRatePct =
      q.inspectedCount > 0
        ? Math.round((q.defectCount / q.inspectedCount) * 1000) / 10
        : 0;
    return {
      ...q,
      fullName: resolvedName,
      weldedEdi: Math.round((ex?.weldedEdi || 0) * 10) / 10,
      defectRatePct,
      acceptedCount: ex?.acceptedCount || 0,
      activeRepairCount: ex?.activeRepairCount || 0,
      lastWeldingDate: ex?.lastWeldingDate || '',
    };
  });
}

export type ContourQuickFilterId =
  | 'all'
  | 'allowed'
  | 'welding_done_id_pending'
  | 'has_repairs'
  | 'in_work';

export interface ContourBlockerSummary {
  unweldedCount: number;
  ndtDeficitCount: number;
  repairCount: number;
  unsignedIdLinesCount: number;
  hasAnyBlocker: boolean;
}

/**
 * Рассчитывает причины блокировки допуска контура к испытаниям.
 */
export function getContourBlockerSummary(
  row: Pick<
    ReadinessSummaryRow,
    | 'totalJoints'
    | 'weldedCount'
    | 'ndtPassedCount'
    | 'ndtNotRequiredCount'
    | 'repairCount'
    | 'totalLinesCount'
    | 'signedIdLinesCount'
  >
): ContourBlockerSummary {
  const unweldedCount = Math.max(0, row.totalJoints - row.weldedCount);
  const ndtDeficitCount = Math.max(
    0,
    row.weldedCount - row.ndtPassedCount - row.ndtNotRequiredCount - row.repairCount
  );
  const repairCount = Math.max(0, row.repairCount);
  const unsignedIdLinesCount = Math.max(0, row.totalLinesCount - row.signedIdLinesCount);
  const hasAnyBlocker =
    unweldedCount > 0 ||
    ndtDeficitCount > 0 ||
    repairCount > 0 ||
    unsignedIdLinesCount > 0;

  return {
    unweldedCount,
    ndtDeficitCount,
    repairCount,
    unsignedIdLinesCount,
    hasAnyBlocker,
  };
}

/**
 * Проверяет соответствие строки контура быстрому статусному фильтру.
 */
export function matchesContourQuickFilter(
  row: ReadinessSummaryRow,
  filterId: ContourQuickFilterId
): boolean {
  if (filterId === 'all') return true;
  if (filterId === 'allowed') return row.testAllowanceStatus === 'allowed';
  if (filterId === 'welding_done_id_pending') {
    return row.testAllowanceStatus === 'welding_done_id_pending';
  }
  if (filterId === 'has_repairs') return row.repairCount > 0;
  if (filterId === 'in_work') {
    return (
      row.testAllowanceStatus === 'in_work' ||
      row.testAllowanceStatus === 'id_signed_welding_pending'
    );
  }
  return true;
}

export interface FilterReadinessScopeParams {
  joints: WeldJoint[];
  lines: ProjectLineItem[];
  testCircuits?: TestCircuit[];
  condition: ReadinessGroupCondition;
  selectedGroupKey?: string | null;
  allowedGroupKeys?: ReadonlySet<string> | string[] | null;
}

export interface FilteredReadinessScopeResult {
  joints: WeldJoint[];
  lines: ProjectLineItem[];
}

function cleanScopeContourText(raw?: string | null): string {
  const trimmed = (raw || '').trim();
  if (!trimmed || trimmed === '—' || trimmed === '-') return '';
  return trimmed;
}

/**
 * Фильтрует стыки и линии для панели «Динамика и воронка» в точном соответствии с правилами
 * группировки calculateReadinessReport (объект, контур испытаний, шифр РД, линия).
 */
export function filterJointsAndLinesByReadinessScope(
  params: FilterReadinessScopeParams
): FilteredReadinessScopeResult {
  const {
    joints,
    lines,
    testCircuits = [],
    condition,
    selectedGroupKey,
    allowedGroupKeys,
  } = params;

  let targetKeys: ReadonlySet<string> | null = null;
  if (selectedGroupKey && selectedGroupKey.trim().length > 0) {
    targetKeys = new Set([selectedGroupKey]);
  } else if (allowedGroupKeys) {
    targetKeys =
      allowedGroupKeys instanceof Set
        ? allowedGroupKeys
        : new Set(allowedGroupKeys);
  }

  if (!targetKeys) {
    return { joints, lines };
  }

  if (targetKeys.size === 0) {
    return { joints: [], lines: [] };
  }

  // Быстрый путь для простых разрезов без контуров
  if (condition !== 'contour') {
    const filteredJoints = joints.filter((j) => {
      const key = j[condition] || 'Не указано';
      return targetKeys!.has(key);
    });
    const filteredLines = lines.filter((line) => {
      let key = 'Не указано';
      if (condition === 'objectName') {
        key = line.objectName || 'Не указано';
      } else if (condition === 'rdCode') {
        key = line.rdCode || 'Не указано';
      } else if (condition === 'uniqueLineId') {
        key =
          line.uniqueLineId ||
          (line.rdCode && line.lineNumber ? `${line.rdCode}::${line.lineNumber}` : '') ||
          'Не указано';
      }
      return targetKeys!.has(key);
    });
    return { joints: filteredJoints, lines: filteredLines };
  }

  // Разрез «Контур испытаний»: повторяем точные индексы calculateReadinessReport
  const circuitById = new Map<string, TestCircuit>();
  const contoursByLineId = new Map<string, Set<string>>();
  const contoursByUniqueLineId = new Map<string, Set<string>>();
  const contoursByRdLine = new Map<string, Set<string>>();

  const registerLineContour = (
    map: Map<string, Set<string>>,
    key: string | undefined | null,
    contourName: string
  ) => {
    if (!key || !contourName) return;
    let set = map.get(key);
    if (!set) {
      set = new Set<string>();
      map.set(key, set);
    }
    set.add(contourName);
  };

  for (const circuit of testCircuits) {
    const cleanName = cleanScopeContourText(circuit.name);
    if (!cleanName) continue;
    circuitById.set(circuit.id, circuit);
    for (const ls of circuit.linesSummary || []) {
      registerLineContour(contoursByLineId, ls.lineId, cleanName);
      registerLineContour(contoursByUniqueLineId, ls.uniqueLineId, cleanName);
      if (ls.rdCode && ls.lineNumber) {
        registerLineContour(contoursByRdLine, `${ls.rdCode}::${ls.lineNumber}`, cleanName);
      }
    }
  }

  const lineById = new Map<string, ProjectLineItem>();
  const lineByUniqueId = new Map<string, ProjectLineItem>();
  const lineByRdNumber = new Map<string, ProjectLineItem>();
  for (const line of lines) {
    if (line.id) lineById.set(line.id, line);
    if (line.uniqueLineId) lineByUniqueId.set(line.uniqueLineId, line);
    if (line.rdCode && line.lineNumber) {
      lineByRdNumber.set(`${line.rdCode}::${line.lineNumber}`, line);
    }
  }

  const findMatchedLine = (joint: WeldJoint): ProjectLineItem | undefined => {
    if (joint.lineId && lineById.has(joint.lineId)) {
      return lineById.get(joint.lineId);
    }
    if (joint.uniqueLineId && lineByUniqueId.has(joint.uniqueLineId)) {
      return lineByUniqueId.get(joint.uniqueLineId);
    }
    if (joint.rdCode && joint.lineNumber) {
      return lineByRdNumber.get(`${joint.rdCode}::${joint.lineNumber}`);
    }
    return undefined;
  };

  const resolveContoursForLine = (line: ProjectLineItem): string[] => {
    const result = new Set<string>();
    const fromId = contoursByLineId.get(line.id);
    if (fromId) fromId.forEach((c) => result.add(c));
    const fromUnique = contoursByUniqueLineId.get(line.uniqueLineId);
    if (fromUnique) fromUnique.forEach((c) => result.add(c));
    const fromRdNum = contoursByRdLine.get(`${line.rdCode}::${line.lineNumber}`);
    if (fromRdNum) fromRdNum.forEach((c) => result.add(c));
    if (result.size === 0) {
      const fallback = cleanScopeContourText(line.testContour);
      if (fallback) result.add(fallback);
    }
    return Array.from(result);
  };

  const resolveJointContour = (joint: WeldJoint, matchedLine?: ProjectLineItem): string => {
    if (joint.testCircuitId) {
      const circuit = circuitById.get(joint.testCircuitId);
      const cName = cleanScopeContourText(circuit?.name);
      if (cName) return cName;
    }
    const directContour = cleanScopeContourText(joint.contour);
    if (directContour) return directContour;
    if (matchedLine) {
      const lineContours = resolveContoursForLine(matchedLine);
      if (lineContours.length > 0) return lineContours[0];
    }
    return 'Без контура';
  };

  const extraContoursByLineKey = new Map<string, Set<string>>();
  const filteredJoints: WeldJoint[] = [];

  for (const j of joints) {
    const matched = findMatchedLine(j);
    const contourName = resolveJointContour(j, matched);
    if (contourName && contourName !== 'Без контура') {
      const canonicalKey = matched
        ? matched.id || matched.uniqueLineId
        : j.uniqueLineId || `${j.rdCode}::${j.lineNumber}`;
      registerLineContour(extraContoursByLineKey, canonicalKey, contourName);
    }
    if (targetKeys.has(contourName)) {
      filteredJoints.push(j);
    }
  }

  const filteredLines = lines.filter((line) => {
    const canonicalLineKey =
      line.id || line.uniqueLineId || `${line.rdCode}::${line.lineNumber}`;
    const lineContours = new Set<string>(resolveContoursForLine(line));
    const extraContours = extraContoursByLineKey.get(canonicalLineKey);
    if (extraContours) extraContours.forEach((c) => lineContours.add(c));
    const targetContours = lineContours.size > 0 ? Array.from(lineContours) : ['Без контура'];
    return targetContours.some((c) => targetKeys!.has(c));
  });

  return { joints: filteredJoints, lines: filteredLines };
}

export interface GroupComparisonItem {
  groupKey: string;
  shortLabel: string;
  subLabel: string;
  totalJoints: number;
  weldedJoints: number;
  acceptedJoints: number;
  repairJoints: number;
  totalEdi: number;
  weldedEdi: number;
  weldingPct: number;
  readinessPct: number;
  totalLinesCount: number;
  signedIdLinesCount: number;
  idReadinessPct: number;
}

function truncateAxisLabel(text: string, maxLen = 14): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

/**
 * Формирует серию столбцов для сравнительного графика по текущему разрезу
 * (контуры испытаний, шифры РД, линии).
 */
export function buildReadinessGroupComparisonSeries(
  rows: ReadinessSummaryRow[],
  maxBars = 24
): GroupComparisonItem[] {
  return rows.slice(0, maxBars).map((r) => ({
    groupKey: r.groupKey,
    shortLabel: truncateAxisLabel(r.groupKey, 14),
    subLabel: r.subLabel,
    totalJoints: r.totalJoints,
    weldedJoints: r.weldedCount,
    acceptedJoints: r.fullyCompletedCount,
    repairJoints: r.repairCount,
    totalEdi: r.totalEquivInches,
    weldedEdi: r.weldedEquivInches,
    weldingPct: r.weldingPct,
    readinessPct: r.readinessPct,
    totalLinesCount: r.totalLinesCount,
    signedIdLinesCount: r.signedIdLinesCount,
    idReadinessPct: r.idReadinessPct,
  }));
}

