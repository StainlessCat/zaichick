import type {
  LRVItem,
  ProjectLineItem,
  TestCircuit,
  WeldJoint,
} from '../types/welding';
import type {
  ExecutiveDocColumnKey,
  ExecutiveDocNdtDeficitDetail,
  ExecutiveDocNdtMethodCode,
  ExecutiveDocNdtMethodStat,
  ExecutiveDocQuickFilter,
  ExecutiveDocReadinessBlocker,
  ExecutiveDocRecord,
  ExecutiveDocRow,
  ExecutiveDocStatus,
  ExecutiveDocsSummaryStats,
  ExecutiveDocVkDeficitItem,
  GeodesyStatus,
  PhysicsStatus,
  PreStageStatus,
} from '../types/executiveDocs';
import {
  EXECUTIVE_DOC_STATUS_LABELS,
  GEODESY_STATUS_LABELS,
  PHYSICS_STATUS_LABELS,
  PRE_STAGE_STATUS_LABELS,
} from '../types/executiveDocs';
import { normalizeCorporateJointNumber } from '../api/mappers';
import { isJointWelded } from './jointDerived';
import { isJointPassedByMethod } from './laboratoryLogic';
import { hasJointUnresolvedDefect } from './testCircuitCalc';

const ROLE_PREFIX_WORDS = new Set([
  'прораб',
  'мастер',
  'смр',
  'инженер',
  'пто',
  'нач.',
  'нач',
  'начальник',
  'участка',
  'ст.',
  'ст',
  'старший',
  'ведущий',
  'вед.',
  'вед',
]);

/**
 * Извлекает чистую фамилию без должности и инициалов.
 * Примеры: "Прораб Иванов А.С." -> "Иванов", "Петров И.И." -> "Петров".
 */
export function extractPersonSurname(raw?: string | null): string {
  if (!raw) return '';
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  if (!cleaned || cleaned === '—' || cleaned === '-') return '';

  const tokens = cleaned.split(' ').filter(Boolean);
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (ROLE_PREFIX_WORDS.has(lower)) continue;
    if (/^[А-ЯЁA-Z]\.([А-ЯЁA-Z]\.)?$/i.test(token)) continue;
    return token.replace(/[,;:.]+$/, '');
  }
  return cleaned;
}

/**
 * Форматирует ISO-дату или YYYY-MM-DD в ДД.ММ.ГГГГ для даты комментария.
 */
export function formatExecutiveNoteDate(iso?: string | null): string {
  if (!iso) return '';
  const trimmed = iso.trim();
  if (!trimmed) return '';

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[3]}.${isoMatch[2]}.${isoMatch[1]}`;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const dd = String(parsed.getDate()).padStart(2, '0');
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const yyyy = parsed.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  }
  return trimmed;
}

function normalizeExecutiveStatusFromLine(raw?: string | null): ExecutiveDocStatus {
  if (!raw) return 'IN_WORK';
  const upper = raw.trim().toUpperCase();
  if (upper === 'SIGNED' || upper === 'ПОДПИСАНА') return 'SIGNED';
  return 'IN_WORK';
}

function getCorporateJointNumber(joint: WeldJoint): string {
  const normalized = normalizeCorporateJointNumber(
    joint.jointNumber,
    joint.uniqueLineId || joint.lineNumber || '',
    joint.isSupplementary
  );
  const value = (normalized.jointNumber || joint.jointNumber || '').trim();
  if (/^\d{1,2}$/.test(value)) {
    return value.padStart(3, '0');
  }
  return value;
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
 * Определяет контур(ы) испытаний для линии с приоритетом данных из раздела «Испытания».
 */
export function resolveLineTestContours(
  line: ProjectLineItem,
  lineJoints: WeldJoint[],
  testCircuits: TestCircuit[]
): string[] {
  const contours = new Set<string>();
  const circuitNameById = new Map<string, string>();

  for (const circuit of testCircuits) {
    const cleanName = (circuit.name || '').trim();
    if (!cleanName) continue;
    circuitNameById.set(circuit.id, cleanName);

    const hasLineInSummary = (circuit.linesSummary || []).some(
      (ls) =>
        ls.lineId === line.id ||
        ls.uniqueLineId === line.uniqueLineId ||
        (ls.rdCode === line.rdCode && ls.lineNumber === line.lineNumber)
    );
    if (hasLineInSummary) {
      contours.add(cleanName);
    }
  }

  for (const joint of lineJoints) {
    if (joint.testCircuitId) {
      const fromCircuit = circuitNameById.get(joint.testCircuitId);
      if (fromCircuit) {
        contours.add(fromCircuit);
        continue;
      }
    }
    const jointContour = (joint.contour || '').trim();
    if (jointContour && jointContour !== '—' && jointContour !== '-') {
      contours.add(jointContour);
    }
  }

  if (contours.size === 0) {
    const fallback = (line.testContour || '').trim();
    if (fallback && fallback !== '—' && fallback !== '-') {
      contours.add(fallback);
    }
  }

  return Array.from(contours).sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
}

/**
 * Проверяет, является ли сваренный стык незакрытым по ВИК / физическому НК или ремонту.
 * При передаче линии учитывает обязательные 100%-е методы из лайнлиста и карту labConclusions.
 */
export function isWeldedJointMissingClosedNdt(
  joint: WeldJoint,
  line?: Pick<ProjectLineItem, 'rkPercent' | 'uzkPercent' | 'pvkPercent'>
): boolean {
  if (!isJointWelded(joint)) return false;

  if (hasJointUnresolvedDefect(joint)) {
    return true;
  }

  if (!isJointVikPassed(joint)) {
    return true;
  }

  if (line) {
    if (line.rkPercent >= 100 && !isJointPassedByMethod(joint, 'РК')) return true;
    if (line.uzkPercent >= 100 && !isJointPassedByMethod(joint, 'УЗК')) return true;
    if (line.pvkPercent >= 100 && !isJointPassedByMethod(joint, 'ПВК')) return true;

    const hasAnyLineNorm =
      line.rkPercent > 0 || line.uzkPercent > 0 || line.pvkPercent > 0;
    if (hasAnyLineNorm) {
      // Если по линии заданы только выборочные проценты (<100%), отдельный стык считается
      // дефицитным только если он находится «В работе» по НК или не закрыт после ремонта
      const inWork =
        joint.ndtResult === 'В работе' ||
        (Boolean(joint.dupNdtType) &&
          joint.dupNdtType !== 'Не требуется' &&
          joint.dupNdtResult === 'В работе');
      return inWork;
    }
  }

  if (joint.ndtType === 'Не требуется') {
    return false;
  }

  const hasLabPhysicalPass =
    joint.labConclusions?.['РК']?.result === 'Годен' ||
    joint.labConclusions?.['УЗК']?.result === 'Годен' ||
    joint.labConclusions?.['ПВК']?.result === 'Годен';

  const primaryNdtPassed =
    joint.ndtResult === 'Годен' ||
    joint.repairNdtResult === 'Годен' ||
    hasLabPhysicalPass;

  const dupBlocking =
    Boolean(joint.dupNdtType) &&
    joint.dupNdtType !== 'Не требуется' &&
    joint.dupNdtResult === 'В работе';

  return !primaryNdtPassed || dupBlocking;
}

/**
 * Рассчитывает нормативный дефицит по ВИК и физическим методам НК для линии
 * синхронно с логикой разделов «Лаборатория НК» и «Испытания».
 */
export function computeLineNdtDeficit(
  line: ProjectLineItem,
  lineJoints: WeldJoint[]
): {
  deficitCount: number;
  deficitChecks: number;
  deficitJointNumbers: string[];
  deficitDetails: ExecutiveDocNdtDeficitDetail[];
  methodStats: ExecutiveDocNdtMethodStat[];
  summary: string;
} {
  const weldedJoints = lineJoints.filter(isJointWelded);
  if (weldedJoints.length === 0) {
    return {
      deficitCount: 0,
      deficitChecks: 0,
      deficitJointNumbers: [],
      deficitDetails: [],
      methodStats: [],
      summary: 'Нет сваренных стыков',
    };
  }

  const weldedCount = weldedJoints.length;
  const rkPct = Math.max(0, Math.min(100, Number(line.rkPercent) || 0));
  const uzkPct = Math.max(0, Math.min(100, Number(line.uzkPercent) || 0));
  const pvkPct = Math.max(0, Math.min(100, Number(line.pvkPercent) || 0));

  const reqVik = weldedCount;
  const reqRk = rkPct > 0 ? Math.ceil((weldedCount * rkPct) / 100) : 0;
  const reqUzk = uzkPct > 0 ? Math.ceil((weldedCount * uzkPct) / 100) : 0;
  const reqPvk = pvkPct > 0 ? Math.ceil((weldedCount * pvkPct) / 100) : 0;

  let passVik = 0;
  let passRk = 0;
  let passUzk = 0;
  let passPvk = 0;

  for (const joint of weldedJoints) {
    if (isJointVikPassed(joint)) passVik += 1;
    if (reqRk > 0 && isJointPassedByMethod(joint, 'РК')) passRk += 1;
    if (reqUzk > 0 && isJointPassedByMethod(joint, 'УЗК')) passUzk += 1;
    if (reqPvk > 0 && isJointPassedByMethod(joint, 'ПВК')) passPvk += 1;
  }

  const methodStats: ExecutiveDocNdtMethodStat[] = [
    {
      method: 'ВИК',
      planPct: 100,
      required: reqVik,
      passed: Math.min(passVik, reqVik),
      deficit: Math.max(0, reqVik - passVik),
    },
  ];
  if (reqRk > 0) {
    methodStats.push({
      method: 'РК',
      planPct: rkPct,
      required: reqRk,
      passed: Math.min(passRk, reqRk),
      deficit: Math.max(0, reqRk - passRk),
    });
  }
  if (reqUzk > 0) {
    methodStats.push({
      method: 'УЗК',
      planPct: uzkPct,
      required: reqUzk,
      passed: Math.min(passUzk, reqUzk),
      deficit: Math.max(0, reqUzk - passUzk),
    });
  }
  if (reqPvk > 0) {
    methodStats.push({
      method: 'ПВК',
      planPct: pvkPct,
      required: reqPvk,
      passed: Math.min(passPvk, reqPvk),
      deficit: Math.max(0, reqPvk - passPvk),
    });
  }

  const deficitChecks = methodStats.reduce((sum, s) => sum + s.deficit, 0);
  const rkRemaining = Math.max(0, reqRk - passRk);
  const uzkRemaining = Math.max(0, reqUzk - passUzk);
  const pvkRemaining = Math.max(0, reqPvk - passPvk);

  const deficitDetails: ExecutiveDocNdtDeficitDetail[] = [];

  for (const joint of weldedJoints) {
    const corpNum = getCorporateJointNumber(joint);
    const missingMethods: Array<ExecutiveDocNdtMethodCode | 'Ремонт'> = [];
    const unresolvedDefect = hasJointUnresolvedDefect(joint);

    if (unresolvedDefect) {
      missingMethods.push('Ремонт');
    }
    if (!isJointVikPassed(joint)) {
      missingMethods.push('ВИК');
    }
    if (rkPct >= 100 && !isJointPassedByMethod(joint, 'РК')) {
      missingMethods.push('РК');
    }
    if (uzkPct >= 100 && !isJointPassedByMethod(joint, 'УЗК')) {
      missingMethods.push('УЗК');
    }
    if (pvkPct >= 100 && !isJointPassedByMethod(joint, 'ПВК')) {
      missingMethods.push('ПВК');
    }

    // Выборочный нормативный контроль (<100%), если квота по методу ещё не закрыта
    if (rkPct > 0 && rkPct < 100 && rkRemaining > 0 && !isJointPassedByMethod(joint, 'РК')) {
      missingMethods.push('РК');
    }
    if (uzkPct > 0 && uzkPct < 100 && uzkRemaining > 0 && !isJointPassedByMethod(joint, 'УЗК')) {
      missingMethods.push('УЗК');
    }
    if (pvkPct > 0 && pvkPct < 100 && pvkRemaining > 0 && !isJointPassedByMethod(joint, 'ПВК')) {
      missingMethods.push('ПВК');
    }

    if (missingMethods.length > 0) {
      const reason = unresolvedDefect
        ? 'Незакрытый ремонт / брак'
        : `Не закрыто: ${missingMethods.join(', ')}`;
      deficitDetails.push({
        jointId: joint.id,
        jointNumber: corpNum,
        missingMethods,
        reason,
        isDefect: unresolvedDefect,
      });
    }
  }

  deficitDetails.sort((a, b) =>
    a.jointNumber.localeCompare(b.jointNumber, 'ru', { numeric: true })
  );

  // Определяем итоговое число дефицитных стыков:
  // для 100% методов, ВИК и дефектов — точное число проблемных стыков;
  // для выборочного контроля (<100%) — не завышаем сверх максимального дефицита по методам,
  // если на стыках нет обязательных 100% пробелов или дефектов.
  const strictDeficitJointsCount = deficitDetails.filter(
    (d) =>
      d.isDefect ||
      d.missingMethods.includes('ВИК') ||
      (rkPct >= 100 && d.missingMethods.includes('РК')) ||
      (uzkPct >= 100 && d.missingMethods.includes('УЗК')) ||
      (pvkPct >= 100 && d.missingMethods.includes('ПВК'))
  ).length;

  const maxSelectiveDeficit = Math.max(
    rkPct > 0 && rkPct < 100 ? rkRemaining : 0,
    uzkPct > 0 && uzkPct < 100 ? uzkRemaining : 0,
    pvkPct > 0 && pvkPct < 100 ? pvkRemaining : 0
  );

  const deficitCount = Math.max(strictDeficitJointsCount, maxSelectiveDeficit);
  const deficitJointNumbers = deficitDetails.map((d) => d.jointNumber);

  const summaryParts = methodStats
    .filter((s) => s.deficit > 0)
    .map((s) => `${s.method} −${s.deficit}`);
  const unresolvedCount = deficitDetails.filter((d) => d.isDefect).length;
  if (unresolvedCount > 0 && summaryParts.length === 0) {
    summaryParts.push(`Брак ${unresolvedCount}`);
  }
  const summary = summaryParts.length > 0 ? summaryParts.join(', ') : 'Выполнено';

  return {
    deficitCount,
    deficitChecks,
    deficitJointNumbers,
    deficitDetails,
    methodStats,
    summary,
  };
}

/**
 * Проверяет, имеет ли позиция Базы материалов утверждённый акт входного контроля.
 */
export function hasLrvItemIncomingControlAct(item: LRVItem): boolean {
  if (!item.batches || item.batches.length === 0) {
    return false;
  }
  return item.batches.some(
    (batch) =>
      batch.verdict === 'accepted' &&
      Boolean((batch.actNumber && batch.actNumber.trim()) || (batch.actDate && batch.actDate.trim()))
  );
}

/**
 * Считает «Дефицит ВК»:
 * 1) уникальные позиции Базы материалов линии без утверждённого акта входного контроля;
 * 2) уникальные материалы, указанные в стыках линии, но отсутствующие в Базе материалов.
 */
export function computeLineVkDeficit(
  line: ProjectLineItem,
  lineJoints: WeldJoint[],
  lrvCatalog: LRVItem[]
): {
  count: number;
  unlinkedCount: number;
  missingItems: ExecutiveDocVkDeficitItem[];
} {
  if (lineJoints.length === 0 || lrvCatalog.length === 0) {
    return { count: 0, unlinkedCount: 0, missingItems: [] };
  }

  const scopedItems = lrvCatalog.filter(
    (m) => !line.objectName || !m.objectName || m.objectName === line.objectName
  );
  const byCodeRd = new Map<string, LRVItem>();
  const byCode = new Map<string, LRVItem>();
  const byShortNameRd = new Map<string, LRVItem>();
  const byShortName = new Map<string, LRVItem>();

  for (const item of scopedItems) {
    const codeKey = (item.lrvCode || '').trim().toLowerCase();
    const rdKey = (item.rdCode || '').trim().toLowerCase();
    const nameKey = (item.shortName || '').trim().toLowerCase();

    if (codeKey) {
      if (rdKey) byCodeRd.set(`${rdKey}::${codeKey}`, item);
      if (!byCode.has(codeKey)) byCode.set(codeKey, item);
    }
    if (nameKey) {
      if (rdKey) byShortNameRd.set(`${rdKey}::${nameKey}`, item);
      if (!byShortName.has(nameKey)) byShortName.set(nameKey, item);
    }
  }

  const lineRdKey = (line.rdCode || '').trim().toLowerCase();
  const matchedUniqueItems = new Map<string, { item: LRVItem; joints: Set<string> }>();
  const unlinkedItems = new Map<string, { lrvCode: string; shortName: string; joints: Set<string> }>();

  const matchElement = (
    jointNum: string,
    lrvCode?: string | null,
    elemName?: string | null
  ) => {
    const rawCode = (lrvCode || '').trim();
    const rawName = (elemName || '').trim();
    const cleanCode = rawCode.toLowerCase();
    const cleanName = rawName.toLowerCase();

    if (!cleanCode && !cleanName) return;

    let found: LRVItem | undefined;
    if (cleanCode) {
      found =
        (lineRdKey ? byCodeRd.get(`${lineRdKey}::${cleanCode}`) : undefined) ||
        byCode.get(cleanCode);
    }
    if (!found && cleanName) {
      found =
        (lineRdKey ? byShortNameRd.get(`${lineRdKey}::${cleanName}`) : undefined) ||
        byShortName.get(cleanName);
    }
    if (found) {
      const dedupKey = found.id || `${found.rdCode}::${found.lrvCode}`;
      const existing = matchedUniqueItems.get(dedupKey);
      if (existing) {
        existing.joints.add(jointNum);
      } else {
        matchedUniqueItems.set(dedupKey, { item: found, joints: new Set([jointNum]) });
      }
      return;
    }

    // Позиция указана в стыке, но не найдена в Базе материалов
    const unlinkedKey = cleanCode || cleanName;
    const existingUnlinked = unlinkedItems.get(unlinkedKey);
    if (existingUnlinked) {
      existingUnlinked.joints.add(jointNum);
    } else {
      unlinkedItems.set(unlinkedKey, {
        lrvCode: rawCode || 'Без кода ЛРВ',
        shortName: rawName || rawCode,
        joints: new Set([jointNum]),
      });
    }
  };

  for (const joint of lineJoints) {
    const corpNum = getCorporateJointNumber(joint);
    matchElement(corpNum, joint.lrv1Code, joint.elem1Name);
    matchElement(corpNum, joint.lrv2Code, joint.elem2Name);
  }

  const missingItems: ExecutiveDocVkDeficitItem[] = [];
  for (const { item, joints } of matchedUniqueItems.values()) {
    if (!hasLrvItemIncomingControlAct(item)) {
      missingItems.push({
        id: item.id,
        lrvCode: item.lrvCode,
        shortName: item.shortName,
        reason: 'no_act',
        jointNumbers: Array.from(joints).sort((a, b) =>
          a.localeCompare(b, 'ru', { numeric: true })
        ),
      });
    }
  }

  let unlinkedCount = 0;
  for (const [key, entry] of unlinkedItems.entries()) {
    unlinkedCount += 1;
    missingItems.push({
      id: `unlinked::${key}`,
      lrvCode: entry.lrvCode,
      shortName: entry.shortName,
      reason: 'unlinked',
      jointNumbers: Array.from(entry.joints).sort((a, b) =>
        a.localeCompare(b, 'ru', { numeric: true })
      ),
    });
  }

  missingItems.sort((a, b) => {
    const reasonCmp = (a.reason === 'unlinked' ? 1 : 0) - (b.reason === 'unlinked' ? 1 : 0);
    if (reasonCmp !== 0) return reasonCmp;
    return a.lrvCode.localeCompare(b.lrvCode, 'ru', { numeric: true });
  });

  return {
    count: missingItems.length,
    unlinkedCount,
    missingItems,
  };
}

/**
 * Вычисляет перечень незакрытых блокеров для подписания комплекта ИД по линии.
 */
export function computeExecutiveDocReadinessBlockers(params: {
  totalJointsCount: number;
  weldedJointsCount: number;
  weldingReadinessPct: number;
  ndtDeficitCount: number;
  ndtDeficitSummary: string;
  vkDeficitCount: number;
  preStageStatus: PreStageStatus;
  physicsStatus: PhysicsStatus;
  geodesyStatus: GeodesyStatus;
}): ExecutiveDocReadinessBlocker[] {
  const blockers: ExecutiveDocReadinessBlocker[] = [];

  if (params.totalJointsCount === 0) {
    blockers.push({
      key: 'welding',
      label: 'Сварка',
      detail: 'По линии нет стыков в реестре',
    });
  } else if (params.weldingReadinessPct < 100) {
    blockers.push({
      key: 'welding',
      label: 'Сварка',
      detail: `Сварено ${params.weldedJointsCount} из ${params.totalJointsCount} стыков · ${params.weldingReadinessPct}%`,
    });
  }

  if (params.ndtDeficitCount > 0) {
    blockers.push({
      key: 'ndt',
      label: 'Контроль НК',
      detail: params.ndtDeficitSummary,
    });
  }

  if (params.vkDeficitCount > 0) {
    blockers.push({
      key: 'vk',
      label: 'Входной контроль',
      detail: `Не закрыто позиций материалов: ${params.vkDeficitCount}`,
    });
  }

  if (params.preStageStatus !== 'SIGNED') {
    blockers.push({
      key: 'preStage',
      label: 'Предэтап',
      detail: 'Предэтап не подписан',
    });
  }

  if (params.physicsStatus !== 'ACCEPTED') {
    blockers.push({
      key: 'physics',
      label: 'Физика',
      detail: 'Физика не принята',
    });
  }

  if (params.geodesyStatus === 'NOT_SIGNED') {
    blockers.push({
      key: 'geodesy',
      label: 'Геодезия',
      detail: 'Исполнительная геодезия не подписана',
    });
  }

  return blockers;
}

/**
 * Рассчитывает сводные KPI по массиву строк (со взвешенным процентом готовности по сварке).
 */
export function computeExecutiveDocsSummary(
  rows: ExecutiveDocRow[]
): ExecutiveDocsSummaryStats {
  let signedCount = 0;
  let inWorkCount = 0;
  let readyToSignCount = 0;
  let ndtDeficitLinesCount = 0;
  let vkDeficitLinesCount = 0;
  let attentionLinesCount = 0;
  let totalJoints = 0;
  let weldedJoints = 0;

  for (const r of rows) {
    if (r.idStatus === 'SIGNED') {
      signedCount += 1;
    } else {
      inWorkCount += 1;
      if (r.isReadyToSign) readyToSignCount += 1;
    }
    if (r.ndtDeficitCount > 0) ndtDeficitLinesCount += 1;
    if (r.vkDeficitCount > 0) vkDeficitLinesCount += 1;
    if (r.hasSignedAnomaly || r.ndtDeficitCount > 0 || r.vkDeficitCount > 0) {
      attentionLinesCount += 1;
    }
    totalJoints += r.totalJointsCount;
    weldedJoints += r.weldedJointsCount;
  }

  const weightedWeldingPct =
    totalJoints > 0 ? Math.round((weldedJoints / totalJoints) * 1000) / 10 : 0;

  return {
    totalLines: rows.length,
    signedCount,
    inWorkCount,
    readyToSignCount,
    ndtDeficitLinesCount,
    vkDeficitLinesCount,
    attentionLinesCount,
    totalJoints,
    weldedJoints,
    weightedWeldingPct,
  };
}

/**
 * Проверка соответствия строки быстрому фильтру KPI и текстовому поиску.
 */
export function matchesExecutiveDocQuickAndSearch(
  row: ExecutiveDocRow,
  quickFilter: ExecutiveDocQuickFilter,
  searchQuery: string
): boolean {
  if (quickFilter === 'signed' && row.idStatus !== 'SIGNED') return false;
  if (quickFilter === 'ready' && !(row.isReadyToSign && row.idStatus !== 'SIGNED')) {
    return false;
  }
  if (quickFilter === 'ndt_deficit' && row.ndtDeficitCount === 0) return false;
  if (quickFilter === 'vk_deficit' && row.vkDeficitCount === 0) return false;
  if (
    quickFilter === 'attention' &&
    !(row.hasSignedAnomaly || row.ndtDeficitCount > 0 || row.vkDeficitCount > 0)
  ) {
    return false;
  }

  const q = searchQuery.trim().toLowerCase();
  if (!q) return true;

  const haystack = [
    row.lineNumber,
    row.uniqueLineId,
    row.rdCode,
    row.testContour,
    row.workProducer,
    row.ptoEngineer,
    row.noteText,
    row.ndtDeficitSummary,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(q);
}

/**
 * Собирает готовые строки ведомости «Исполнительная документация» по линиям выбранного объекта.
 */
export function buildExecutiveDocRows(params: {
  lines: ProjectLineItem[];
  joints: WeldJoint[];
  testCircuits: TestCircuit[];
  lrvCatalog: LRVItem[];
  docByLineId: Record<string, ExecutiveDocRecord>;
  selectedObjectName: string;
}): ExecutiveDocRow[] {
  const {
    lines,
    joints,
    testCircuits,
    lrvCatalog,
    docByLineId,
    selectedObjectName,
  } = params;

  const scopedLines =
    selectedObjectName && selectedObjectName !== 'ALL'
      ? lines.filter((l) => l.objectName === selectedObjectName)
      : lines;

  const jointsByLineId = new Map<string, WeldJoint[]>();
  const jointsByUniqueId = new Map<string, WeldJoint[]>();
  const jointsByRdLine = new Map<string, WeldJoint[]>();

  for (const joint of joints) {
    if (selectedObjectName && selectedObjectName !== 'ALL' && joint.objectName !== selectedObjectName) {
      continue;
    }
    if (joint.lineId) {
      const arr = jointsByLineId.get(joint.lineId) || [];
      arr.push(joint);
      jointsByLineId.set(joint.lineId, arr);
    }
    if (joint.uniqueLineId) {
      const arr = jointsByUniqueId.get(joint.uniqueLineId) || [];
      arr.push(joint);
      jointsByUniqueId.set(joint.uniqueLineId, arr);
    }
    const rdLineKey = `${joint.rdCode}::${joint.lineNumber}`;
    const arr = jointsByRdLine.get(rdLineKey) || [];
    arr.push(joint);
    jointsByRdLine.set(rdLineKey, arr);
  }

  const rows: ExecutiveDocRow[] = scopedLines.map((line) => {
    const lineJoints =
      jointsByLineId.get(line.id) ||
      jointsByUniqueId.get(line.uniqueLineId) ||
      jointsByRdLine.get(`${line.rdCode}::${line.lineNumber}`) ||
      [];

    const totalJointsCount = lineJoints.length;
    const weldedJointsCount = lineJoints.filter(isJointWelded).length;
    const weldingReadinessPct =
      totalJointsCount > 0
        ? Math.round((weldedJointsCount / totalJointsCount) * 1000) / 10
        : 0;

    const ndtDeficit = computeLineNdtDeficit(line, lineJoints);
    const testContoursList = resolveLineTestContours(line, lineJoints, testCircuits);
    const testContour = testContoursList.length > 0 ? testContoursList.join(', ') : '—';

    const vkDeficit = computeLineVkDeficit(line, lineJoints, lrvCatalog);
    const saved = docByLineId[line.id];

    const idStatus = saved?.idStatus ?? normalizeExecutiveStatusFromLine(line.idStatus);
    const preStageStatus: PreStageStatus = saved?.preStageStatus ?? 'NOT_SIGNED';
    const physicsStatus: PhysicsStatus = saved?.physicsStatus ?? 'NOT_ACCEPTED';
    const geodesyStatus: GeodesyStatus = saved?.geodesyStatus ?? 'NOT_SIGNED';

    const readinessBlockers = computeExecutiveDocReadinessBlockers({
      totalJointsCount,
      weldedJointsCount,
      weldingReadinessPct,
      ndtDeficitCount: ndtDeficit.deficitCount,
      ndtDeficitSummary: ndtDeficit.summary,
      vkDeficitCount: vkDeficit.count,
      preStageStatus,
      physicsStatus,
      geodesyStatus,
    });

    const isReadyToSign = readinessBlockers.length === 0;
    const hasSignedAnomaly = idStatus === 'SIGNED' && readinessBlockers.length > 0;

    return {
      lineId: line.id,
      objectName: line.objectName,
      uniqueLineId: line.uniqueLineId,
      testContour,
      testContoursList,
      rdCode: line.rdCode,
      lineNumber: line.lineNumber,
      priority: saved?.priority ?? null,
      idStatus,
      weldingReadinessPct,
      weldedJointsCount,
      totalJointsCount,
      workProducer: saved?.workProducer ?? '',
      ptoEngineer: saved?.ptoEngineer ?? extractPersonSurname(line.responsiblePto),
      preStageStatus,
      physicsStatus,
      ndtDeficitCount: ndtDeficit.deficitCount,
      ndtDeficitChecks: ndtDeficit.deficitChecks,
      ndtDeficitJointNumbers: ndtDeficit.deficitJointNumbers,
      ndtDeficitDetails: ndtDeficit.deficitDetails,
      ndtMethodStats: ndtDeficit.methodStats,
      ndtDeficitSummary: ndtDeficit.summary,
      vkDeficitCount: vkDeficit.count,
      unlinkedVkCount: vkDeficit.unlinkedCount,
      vkDeficitItems: vkDeficit.missingItems,
      geodesyStatus,
      noteText: saved?.noteText ?? '',
      noteUpdatedAt: saved?.noteUpdatedAt ?? null,
      version: saved?.version ?? 1,
      readinessBlockers,
      isReadyToSign,
      hasSignedAnomaly,
    };
  });

  return rows.sort((a, b) => {
    const pa = a.priority ?? Number.MAX_SAFE_INTEGER;
    const pb = b.priority ?? Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb;
    const rdCmp = a.rdCode.localeCompare(b.rdCode, 'ru', { numeric: true });
    if (rdCmp !== 0) return rdCmp;
    return a.lineNumber.localeCompare(b.lineNumber, 'ru', { numeric: true });
  });
}

/**
 * Текстовое значение ячейки для Excel-фильтрации и сортировки столбцов.
 */
export function getExecutiveDocColumnDisplayValue(
  row: ExecutiveDocRow,
  colKey: ExecutiveDocColumnKey
): string {
  switch (colKey) {
    case 'testContour':
      return row.testContour === '—' ? '' : row.testContour;
    case 'rdCode':
      return row.rdCode;
    case 'lineNumber':
      return row.lineNumber;
    case 'priority':
      return row.priority !== null ? String(row.priority) : 'Не задан';
    case 'idStatus':
      return EXECUTIVE_DOC_STATUS_LABELS[row.idStatus];
    case 'weldingReadinessPct':
      return `${row.weldingReadinessPct}%`;
    case 'workProducer':
      return row.workProducer;
    case 'ptoEngineer':
      return row.ptoEngineer;
    case 'preStageStatus':
      return PRE_STAGE_STATUS_LABELS[row.preStageStatus];
    case 'physicsStatus':
      return PHYSICS_STATUS_LABELS[row.physicsStatus];
    case 'ndtDeficitCount':
      return String(row.ndtDeficitCount);
    case 'vkDeficitCount':
      return String(row.vkDeficitCount);
    case 'geodesyStatus':
      return GEODESY_STATUS_LABELS[row.geodesyStatus];
    case 'noteText':
      return row.noteText;
  }
}

/**
 * Сравнение строк таблицы при сортировке по столбцу.
 */
export function compareExecutiveDocRows(
  a: ExecutiveDocRow,
  b: ExecutiveDocRow,
  colKey: ExecutiveDocColumnKey,
  direction: 'asc' | 'desc'
): number {
  let cmp = 0;
  if (colKey === 'priority') {
    const pa = a.priority ?? Number.MAX_SAFE_INTEGER;
    const pb = b.priority ?? Number.MAX_SAFE_INTEGER;
    cmp = pa - pb;
  } else if (colKey === 'weldingReadinessPct') {
    cmp = a.weldingReadinessPct - b.weldingReadinessPct;
  } else if (colKey === 'ndtDeficitCount') {
    cmp = a.ndtDeficitCount - b.ndtDeficitCount;
  } else if (colKey === 'vkDeficitCount') {
    cmp = a.vkDeficitCount - b.vkDeficitCount;
  } else {
    const va = getExecutiveDocColumnDisplayValue(a, colKey);
    const vb = getExecutiveDocColumnDisplayValue(b, colKey);
    cmp = va.localeCompare(vb, 'ru', { numeric: true });
  }
  return direction === 'asc' ? cmp : -cmp;
}
