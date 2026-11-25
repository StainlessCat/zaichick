import type {
  LRVItem,
  ProjectLineItem,
  TestCircuit,
  WeldJoint,
} from '../types/welding';
import type {
  ExecutiveDocColumnKey,
  ExecutiveDocRecord,
  ExecutiveDocRow,
  ExecutiveDocStatus,
  ExecutiveDocVkDeficitItem,
} from '../types/executiveDocs';
import {
  EXECUTIVE_DOC_STATUS_LABELS,
  GEODESY_STATUS_LABELS,
  PHYSICS_STATUS_LABELS,
  PRE_STAGE_STATUS_LABELS,
} from '../types/executiveDocs';
import { isJointDefective } from './readiness';

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
    // Пропускаем инициалы формата "А.С." или "А."
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
 * Проверяет, является ли стык сваренным без закрытого физического контроля НК.
 * Учитывает первичный НК, а для дефектных стыков — обязательное закрытие НК после ремонта.
 */
export function isWeldedJointMissingClosedNdt(joint: WeldJoint): boolean {
  const isWelded = Boolean(joint.weldingDate && joint.weldingDate.trim() !== '');
  if (!isWelded) return false;

  const hadDefect = isJointDefective(joint);

  if (!hadDefect) {
    // Если физический НК по стыку не требуется — дефицита по НК нет
    if (joint.ndtType === 'Не требуется') {
      return false;
    }
    const primaryNdtPassed = joint.ndtResult === 'Годен';
    const dupBlocking =
      Boolean(joint.dupNdtType) &&
      joint.dupNdtType !== 'Не требуется' &&
      joint.dupNdtResult === 'В работе';
    return !primaryNdtPassed || dupBlocking;
  }

  // Стык с дефектом: требуется закрытие повторного контроля после ремонта
  const hasRepairNdtRequired =
    !joint.repairNdtType || joint.repairNdtType !== 'Не требуется';
  const postRepairNdtPassed = !hasRepairNdtRequired || joint.repairNdtResult === 'Годен';
  const postRepairDupBlocking =
    Boolean(joint.repairDupNdtType) &&
    joint.repairDupNdtType !== 'Не требуется' &&
    Boolean(joint.repairDupNdtResult) &&
    joint.repairDupNdtResult !== 'Не проводился' &&
    joint.repairDupNdtResult !== 'Годен';

  // Поддержка legacy-записей ремонта через dupNdtResult === 'Годен'
  const legacyRepairClosed =
    !joint.repairNdtResult &&
    joint.dupNdtType !== 'Не требуется' &&
    joint.dupNdtResult === 'Годен';

  if (legacyRepairClosed) {
    return false;
  }

  return !postRepairNdtPassed || postRepairDupBlocking;
}

/**
 * Проверяет, имеет ли позиция Базы материалов (ЛРВ) утверждённый акт входного контроля.
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
 * Считает «Дефицит ВК» по утверждённому правилу:
 * количество уникальных позиций Базы материалов, используемых в стыках данной линии
 * и не имеющих акта входного контроля.
 */
export function computeLineVkDeficit(
  line: ProjectLineItem,
  lineJoints: WeldJoint[],
  lrvCatalog: LRVItem[]
): {
  count: number;
  missingItems: ExecutiveDocVkDeficitItem[];
} {
  if (lineJoints.length === 0 || lrvCatalog.length === 0) {
    return { count: 0, missingItems: [] };
  }

  // Индекс позиций ЛРВ с приоритетом позиций того же объекта и шифра РД
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
  const matchedUniqueItems = new Map<string, LRVItem>();

  const matchElement = (lrvCode?: string | null, elemName?: string | null) => {
    const cleanCode = (lrvCode || '').trim().toLowerCase();
    const cleanName = (elemName || '').trim().toLowerCase();

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
      if (!matchedUniqueItems.has(dedupKey)) {
        matchedUniqueItems.set(dedupKey, found);
      }
    }
  };

  for (const joint of lineJoints) {
    matchElement(joint.lrv1Code, joint.elem1Name);
    matchElement(joint.lrv2Code, joint.elem2Name);
  }

  const missingItems: ExecutiveDocVkDeficitItem[] = [];
  for (const item of matchedUniqueItems.values()) {
    if (!hasLrvItemIncomingControlAct(item)) {
      missingItems.push({
        id: item.id,
        lrvCode: item.lrvCode,
        shortName: item.shortName,
      });
    }
  }

  missingItems.sort((a, b) =>
    a.lrvCode.localeCompare(b.lrvCode, 'ru', { numeric: true })
  );

  return {
    count: missingItems.length,
    missingItems,
  };
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

  // Группировка стыков по линиям за один проход O(N)
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
    let weldedJointsCount = 0;
    const ndtDeficitJointNumbers: string[] = [];

    for (const joint of lineJoints) {
      if (joint.weldingDate && joint.weldingDate.trim() !== '') {
        weldedJointsCount += 1;
        if (isWeldedJointMissingClosedNdt(joint)) {
          ndtDeficitJointNumbers.push(joint.jointNumber);
        }
      }
    }

    ndtDeficitJointNumbers.sort((a, b) =>
      a.localeCompare(b, 'ru', { numeric: true })
    );

    const weldingReadinessPct =
      totalJointsCount > 0
        ? Math.round((weldedJointsCount / totalJointsCount) * 1000) / 10
        : 0;

    const testContoursList = resolveLineTestContours(line, lineJoints, testCircuits);
    const testContour = testContoursList.length > 0 ? testContoursList.join(', ') : '—';

    const vkDeficit = computeLineVkDeficit(line, lineJoints, lrvCatalog);
    const saved = docByLineId[line.id];

    return {
      lineId: line.id,
      objectName: line.objectName,
      uniqueLineId: line.uniqueLineId,
      testContour,
      testContoursList,
      rdCode: line.rdCode,
      lineNumber: line.lineNumber,
      priority: saved?.priority ?? null,
      idStatus: saved?.idStatus ?? normalizeExecutiveStatusFromLine(line.idStatus),
      weldingReadinessPct,
      weldedJointsCount,
      totalJointsCount,
      workProducer: saved?.workProducer ?? '',
      ptoEngineer: saved?.ptoEngineer ?? extractPersonSurname(line.responsiblePto),
      preStageStatus: saved?.preStageStatus ?? 'NOT_SIGNED',
      physicsStatus: saved?.physicsStatus ?? 'NOT_ACCEPTED',
      ndtDeficitCount: ndtDeficitJointNumbers.length,
      ndtDeficitJointNumbers,
      vkDeficitCount: vkDeficit.count,
      vkDeficitItems: vkDeficit.missingItems,
      geodesyStatus: saved?.geodesyStatus ?? 'NOT_SIGNED',
      noteText: saved?.noteText ?? '',
      noteUpdatedAt: saved?.noteUpdatedAt ?? null,
      version: saved?.version ?? 1,
    };
  });

  // Сортировка по умолчанию: приоритетные сверху, затем шифр РД и номер линии
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
