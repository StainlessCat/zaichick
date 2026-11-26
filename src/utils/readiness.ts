import {
  ProjectLineItem,
  ReadinessGroupCondition,
  ReadinessTestAllowanceStatus,
  TestCircuit,
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
  ndtNotRequiredCount: number;
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
  totalLinesCount: number;
  signedIdLinesCount: number;
  idReadinessPct: number;
  lineIdStatus?: 'SIGNED' | 'IN_WORK' | null;
  testAllowanceStatus?: ReadinessTestAllowanceStatus | null;
  testStatusLabel?: string | null;
}

export interface ExecutiveDocStatusLike {
  idStatus?: string | null;
}

export interface ReadinessReportOptions {
  lines?: ProjectLineItem[];
  testCircuits?: TestCircuit[];
  docByLineId?: Record<string, ExecutiveDocStatusLike>;
  /** Исключить группы с 0 стыков (например, при активном фильтре по периоду дат сварки) */
  excludeEmptyGroups?: boolean;
}

export const TEST_ALLOWANCE_STATUS_LABELS: Record<ReadinessTestAllowanceStatus, string> = {
  allowed: 'Допуск к испытаниям',
  welding_done_id_pending: 'Ждёт подписи ИД',
  id_signed_welding_pending: 'ИД подписана',
  in_work: 'В работе',
  no_lines: 'Нет линий',
};

/**
 * Определяет, подписана ли исполнительная документация по линии
 * (приоритет — запись из раздела «Исполнительная документация», затем поле линии).
 */
export function isLineExecutiveDocSigned(
  line: Pick<ProjectLineItem, 'id' | 'idStatus'>,
  docByLineId?: Record<string, ExecutiveDocStatusLike>
): boolean {
  const fromDoc = docByLineId?.[line.id]?.idStatus;
  if (fromDoc) {
    const upper = fromDoc.trim().toUpperCase();
    return upper === 'SIGNED' || upper === 'ПОДПИСАНА';
  }
  const fromLine = line.idStatus;
  if (fromLine) {
    const upper = fromLine.trim().toUpperCase();
    return upper === 'SIGNED' || upper === 'ПОДПИСАНА';
  }
  return false;
}

function cleanContourText(raw?: string | null): string {
  const trimmed = (raw || '').trim();
  if (!trimmed || trimmed === '—' || trimmed === '-') return '';
  return trimmed;
}

/**
 * Определяет статус допуска контура к испытаниям на основе состояния сварки/НК и подписания ИД.
 */
export function resolveTestAllowanceStatus(params: {
  totalJoints: number;
  fullyCompletedCount: number;
  repairCount: number;
  totalLinesCount: number;
  signedIdLinesCount: number;
}): ReadinessTestAllowanceStatus {
  const {
    totalJoints,
    fullyCompletedCount,
    repairCount,
    totalLinesCount,
    signedIdLinesCount,
  } = params;

  if (totalLinesCount === 0 && totalJoints === 0) {
    return 'no_lines';
  }

  const allIdSigned = totalLinesCount > 0 && signedIdLinesCount === totalLinesCount;
  const weldingCompleted =
    totalJoints > 0 && fullyCompletedCount === totalJoints && repairCount === 0;

  if (allIdSigned && weldingCompleted) {
    return 'allowed';
  }
  if (!allIdSigned && weldingCompleted) {
    return 'welding_done_id_pending';
  }
  if (allIdSigned && !weldingCompleted) {
    return 'id_signed_welding_pending';
  }
  return 'in_work';
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
 * Единый критерий сваренного стыка для аналитики, лайнлиста и приёмки:
 * заполнена дата сварки и указано хотя бы одно клеймо сварщика.
 */
export function isJointWeldedWithStamp(
  joint: Pick<WeldJoint, 'weldingDate' | 'welderStamp' | 'welderStampsList'>
): boolean {
  const hasDate = Boolean(joint.weldingDate && joint.weldingDate.trim() !== '');
  if (!hasDate) return false;
  const hasStamp = Boolean(joint.welderStamp && joint.welderStamp.trim() !== '');
  const hasStampsList = Boolean(
    joint.welderStampsList && joint.welderStampsList.some((s) => Boolean(s && s.trim()))
  );
  return hasStamp || hasStampsList;
}

/**
 * Проверяет, полностью ли принят стык (либо с первого раза по ВИК и НК,
 * либо после первичного ремонта с успешным повторным контролем после ремонта).
 */
export function isJointFullyAccepted(joint: WeldJoint): boolean {
  if (!isJointWeldedWithStamp(joint)) return false;

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
 * Расчёт отчётности по готовности по условиям: «Объект», «Контур испытаний», «Шифр РД», «Линия»
 * с учётом количества линий и состояния исполнительной документации (ИД).
 */
export function calculateReadinessReport(
  joints: WeldJoint[],
  condition: ReadinessGroupCondition,
  options?: ReadinessReportOptions
): ReadinessRow[] {
  const lines = options?.lines ?? [];
  const testCircuits = options?.testCircuits ?? [];
  const docByLineId = options?.docByLineId;

  // Индексы контуров испытаний и линий для быстрого O(1) сопоставления
  const circuitById = new Map<string, TestCircuit>();
  const circuitByName = new Map<string, TestCircuit>();
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
    const cleanName = cleanContourText(circuit.name);
    if (!cleanName) continue;
    circuitById.set(circuit.id, circuit);
    if (!circuitByName.has(cleanName)) {
      circuitByName.set(cleanName, circuit);
    }
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
      const fallback = cleanContourText(line.testContour);
      if (fallback) result.add(fallback);
    }
    return Array.from(result);
  };

  const resolveJointContour = (joint: WeldJoint, matchedLine?: ProjectLineItem): string => {
    if (joint.testCircuitId) {
      const circuit = circuitById.get(joint.testCircuitId);
      const cName = cleanContourText(circuit?.name);
      if (cName) return cName;
    }
    const directContour = cleanContourText(joint.contour);
    if (directContour) return directContour;
    if (matchedLine) {
      const lineContours = resolveContoursForLine(matchedLine);
      if (lineContours.length > 0) return lineContours[0];
    }
    return 'Без контура';
  };

  // Привязка дополнительных контуров из стыков к линиям (на случай если linesSummary не заполнен)
  const extraContoursByLineKey = new Map<string, Set<string>>();
  for (const j of joints) {
    const matched = findMatchedLine(j);
    const contourName = resolveJointContour(j, matched);
    if (contourName && contourName !== 'Без контура') {
      const canonicalKey = matched
        ? matched.id || matched.uniqueLineId
        : j.uniqueLineId || `${j.rdCode}::${j.lineNumber}`;
      registerLineContour(extraContoursByLineKey, canonicalKey, contourName);
    }
  }

  interface GroupBucket {
    joints: WeldJoint[];
    linesMap: Map<string, { isSigned: boolean; rdCode?: string; objectName?: string; lineNumber?: string; contour?: string }>;
    rdCodes: Set<string>;
    contours: Set<string>;
    objectNames: Set<string>;
    circuit?: TestCircuit;
  }

  const buckets = new Map<string, GroupBucket>();
  const getOrCreateBucket = (key: string): GroupBucket => {
    let b = buckets.get(key);
    if (!b) {
      b = {
        joints: [],
        linesMap: new Map(),
        rdCodes: new Set(),
        contours: new Set(),
        objectNames: new Set(),
      };
      buckets.set(key, b);
    }
    return b;
  };

  // 1. Предзаполняем контуры испытаний (чтобы созданные контуры были видны даже без стыков)
  if (condition === 'contour') {
    for (const circuit of testCircuits) {
      const cName = cleanContourText(circuit.name);
      if (!cName) continue;
      const b = getOrCreateBucket(cName);
      b.circuit = circuit;
      if (circuit.objectName) b.objectNames.add(circuit.objectName);
    }
  } else if (condition === 'objectName') {
    for (const circuit of testCircuits) {
      const cName = cleanContourText(circuit.name);
      if (circuit.objectName && cName) {
        const b = getOrCreateBucket(circuit.objectName);
        b.contours.add(cName);
      }
    }
  }

  // 2. Распределяем линии из Лайнлиста (с учётом статуса ИД)
  for (const line of lines) {
    const canonicalLineKey = line.id || line.uniqueLineId || `${line.rdCode}::${line.lineNumber}`;
    const isSigned = isLineExecutiveDocSigned(line, docByLineId);
    const lineContours = new Set<string>(resolveContoursForLine(line));
    const extraContours = extraContoursByLineKey.get(canonicalLineKey);
    if (extraContours) extraContours.forEach((c) => lineContours.add(c));
    const resolvedContours = Array.from(lineContours);
    const primaryContour = resolvedContours[0] || '';

    const lineMeta = {
      isSigned,
      rdCode: line.rdCode,
      objectName: line.objectName,
      lineNumber: line.lineNumber,
      contour: primaryContour,
    };

    if (condition === 'objectName') {
      const key = line.objectName || 'Не указано';
      const b = getOrCreateBucket(key);
      b.linesMap.set(canonicalLineKey, lineMeta);
      if (line.rdCode) b.rdCodes.add(line.rdCode);
      resolvedContours.forEach((c) => b.contours.add(c));
    } else if (condition === 'rdCode') {
      const key = line.rdCode || 'Не указано';
      const b = getOrCreateBucket(key);
      b.linesMap.set(canonicalLineKey, lineMeta);
      if (line.objectName) b.objectNames.add(line.objectName);
      resolvedContours.forEach((c) => b.contours.add(c));
    } else if (condition === 'uniqueLineId') {
      const key = line.uniqueLineId || `${line.rdCode}::${line.lineNumber}` || 'Не указано';
      const b = getOrCreateBucket(key);
      b.linesMap.set(canonicalLineKey, lineMeta);
      if (line.rdCode) b.rdCodes.add(line.rdCode);
      if (line.objectName) b.objectNames.add(line.objectName);
      resolvedContours.forEach((c) => b.contours.add(c));
    } else if (condition === 'contour') {
      const targetContours = resolvedContours.length > 0 ? resolvedContours : ['Без контура'];
      for (const cName of targetContours) {
        const b = getOrCreateBucket(cName);
        if (!b.circuit && circuitByName.has(cName)) {
          b.circuit = circuitByName.get(cName);
        }
        b.linesMap.set(canonicalLineKey, lineMeta);
        if (line.rdCode) b.rdCodes.add(line.rdCode);
        if (line.objectName) b.objectNames.add(line.objectName);
      }
    }
  }

  // 3. Распределяем стыки
  for (const j of joints) {
    const matchedLine = findMatchedLine(j);
    const contourName = resolveJointContour(j, matchedLine);

    let key = 'Не указано';
    if (condition === 'contour') {
      key = contourName;
    } else {
      key = j[condition] || 'Не указано';
    }

    const b = getOrCreateBucket(key);
    b.joints.push(j);

    if (condition === 'contour' && !b.circuit && circuitByName.has(key)) {
      b.circuit = circuitByName.get(key);
    }

    if (j.rdCode) b.rdCodes.add(j.rdCode);
    if (j.objectName) b.objectNames.add(j.objectName);
    if (contourName && contourName !== 'Без контура') {
      b.contours.add(contourName);
    }

    const canonicalLineKey = matchedLine
      ? matchedLine.id || matchedLine.uniqueLineId
      : j.uniqueLineId || (j.rdCode && j.lineNumber ? `${j.rdCode}::${j.lineNumber}` : '');

    if (canonicalLineKey && !b.linesMap.has(canonicalLineKey)) {
      const isSigned = matchedLine ? isLineExecutiveDocSigned(matchedLine, docByLineId) : false;
      b.linesMap.set(canonicalLineKey, {
        isSigned,
        rdCode: matchedLine?.rdCode || j.rdCode,
        objectName: matchedLine?.objectName || j.objectName,
        lineNumber: matchedLine?.lineNumber || j.lineNumber,
        contour: contourName === 'Без контура' ? '' : contourName,
      });
    }
  }

  const rows: ReadinessRow[] = [];
  for (const [groupKey, bucket] of buckets.entries()) {
    const items = bucket.joints;
    const totalJoints = items.length;
    if (options?.excludeEmptyGroups && totalJoints === 0) {
      continue;
    }
    const supplementaryJoints = items.filter((i) => {
      const num = parseInt(i.jointNumber, 10);
      return !Number.isNaN(num) && num % 10 !== 0;
    }).length;
    const weldedCount = items.filter((i) => isJointWeldedWithStamp(i)).length;
    const vikPassedCount = items.filter(
      (i) =>
        isJointWeldedWithStamp(i) &&
        (i.vikResult === 'Годен' ||
          (i.vikResult === 'Ремонт' &&
            (i.repairVikResult === 'Годен' ||
              (i.dupNdtType !== 'Не требуется' && i.dupNdtResult === 'Годен'))))
    ).length;
    const ndtPassedCount = items.filter(
      (i) =>
        isJointWeldedWithStamp(i) &&
        (i.ndtResult === 'Годен' ||
          (i.ndtResult === 'Ремонт' &&
            (i.repairNdtResult === 'Годен' ||
              (i.dupNdtType !== 'Не требуется' && i.dupNdtResult === 'Годен'))))
    ).length;
    const ndtNotRequiredCount = items.filter(
      (i) =>
        isJointWeldedWithStamp(i) &&
        (!i.ndtType || i.ndtType === 'Не требуется') &&
        !isJointCurrentlyInRepair(i)
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
          .filter((j) => isJointWeldedWithStamp(j))
          .reduce((acc, j) => acc + getJointEquivDiaInch(j), 0) * 10
      ) / 10;
    const equivWeldingPct =
      totalEquivInches > 0
        ? Math.round((weldedEquivInches / totalEquivInches) * 100)
        : 0;

    // Статистика линий и исполнительной документации (ИД)
    const totalLinesCount = bucket.linesMap.size;
    let signedIdLinesCount = 0;
    for (const meta of bucket.linesMap.values()) {
      if (meta.isSigned) signedIdLinesCount += 1;
    }
    const idReadinessPct =
      totalLinesCount > 0 ? Math.round((signedIdLinesCount / totalLinesCount) * 100) : 0;

    const lineIdStatus: 'SIGNED' | 'IN_WORK' | null =
      condition === 'uniqueLineId'
        ? signedIdLinesCount > 0
          ? 'SIGNED'
          : 'IN_WORK'
        : null;

    const testAllowanceStatus: ReadinessTestAllowanceStatus | null =
      condition === 'contour'
        ? resolveTestAllowanceStatus({
            totalJoints,
            fullyCompletedCount,
            repairCount,
            totalLinesCount,
            signedIdLinesCount,
          })
        : null;

    const testStatusLabel: string | null =
      condition === 'contour' && bucket.circuit
        ? bucket.circuit.testStatus === 'TESTED'
          ? 'Испытан'
          : 'Не испытан'
        : null;

    const first = items[0];
    const firstLineMeta = bucket.linesMap.values().next().value;
    let subLabel = '';
    if (condition === 'objectName') {
      const rdCount = bucket.rdCodes.size;
      const contoursCount = bucket.contours.size;
      subLabel =
        contoursCount > 0
          ? `Шифров РД: ${rdCount} · Контуров: ${contoursCount}`
          : `Шифров РД: ${rdCount}`;
    } else if (condition === 'contour') {
      const obj = Array.from(bucket.objectNames)[0] || first?.objectName || '';
      const parts = [obj, testStatusLabel].filter(Boolean);
      subLabel = parts.join(' · ');
    } else if (condition === 'rdCode') {
      subLabel = Array.from(bucket.objectNames)[0] || first?.objectName || '';
    } else if (condition === 'uniqueLineId') {
      const ln = firstLineMeta?.lineNumber || first?.lineNumber || '';
      const contour = Array.from(bucket.contours)[0] || firstLineMeta?.contour || first?.contour || '';
      const parts = [ln ? `Линия ${ln}` : '', contour].filter(Boolean);
      subLabel = parts.join(' · ');
    }

    rows.push({
      groupKey,
      subLabel,
      totalJoints,
      supplementaryJoints,
      weldedCount,
      vikPassedCount,
      ndtPassedCount,
      ndtNotRequiredCount,
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
      totalLinesCount,
      signedIdLinesCount,
      idReadinessPct,
      lineIdStatus,
      testAllowanceStatus,
      testStatusLabel,
    });
  }

  return rows.sort((a, b) => {
    // «Без контура» всегда внизу списка контуров
    if (condition === 'contour') {
      if (a.groupKey === 'Без контура' && b.groupKey !== 'Без контура') return 1;
      if (b.groupKey === 'Без контура' && a.groupKey !== 'Без контура') return -1;
    }
    if (b.totalJoints !== a.totalJoints) return b.totalJoints - a.totalJoints;
    if (b.totalLinesCount !== a.totalLinesCount) return b.totalLinesCount - a.totalLinesCount;
    return a.groupKey.localeCompare(b.groupKey, 'ru', { numeric: true });
  });
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
  jointsReadinessPct: number;
  totalEdi: number;
  weldedEdi: number;
  ediReadinessPct: number;
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
      jointsReadinessPct: 0,
      totalEdi: 0,
      weldedEdi: 0,
      ediReadinessPct: 0,
    };
  }

  let weldedJoints = 0;
  let controlledJoints = 0;
  let rkControlled = 0;
  let uzkControlled = 0;
  let totalEdiRaw = 0;
  let weldedEdiRaw = 0;

  for (const j of lineJoints) {
    const jointEdi = getJointEquivDiaInch(j);
    totalEdiRaw += jointEdi;

    const isWelded = isJointWeldedWithStamp(j);
    if (isWelded) {
      weldedJoints += 1;
      weldedEdiRaw += jointEdi;

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

  const totalEdi = Math.round(totalEdiRaw * 100) / 100;
  const weldedEdi = Math.round(weldedEdiRaw * 100) / 100;
  const jointsReadinessPct =
    totalJoints > 0 ? Math.round((weldedJoints / totalJoints) * 1000) / 10 : 0;
  const ediReadinessPct =
    totalEdiRaw > 0 ? Math.round((weldedEdiRaw / totalEdiRaw) * 1000) / 10 : 0;

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
    const isWelded = isJointWeldedWithStamp(j);
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
    jointsReadinessPct,
    totalEdi,
    weldedEdi,
    ediReadinessPct,
  };
}
