import {
  LRVItem,
  WeldJoint,
} from '../types/welding';
import {
  buildUniqueLineId,
  formatDateDDMMYY,
  getLrvItemDn1,
  getLrvItemDn2,
  LrvSizeOption,
  mmToInchDiameter,
  resolveLrvFullName,
} from './weldingLogic';

export interface CreateJointContextParams {
  objectName: string;
  rdCode: string;
  lineNumber: string;
  contour?: string;
  updatedBy?: string;
}

/**
 * Создаёт полностью пустой черновик сварного стыка для режима создания,
 * сохраняя исключительно контекст объекта, шифра РД и линии.
 */
export function createBlankJointForCreateMode(
  params: CreateJointContextParams
): WeldJoint {
  const objectName = params.objectName || '';
  const rdCode = params.rdCode || '';
  const lineNumber = params.lineNumber || '';
  const contour = params.contour || '';
  const uniqueLineId =
    rdCode || lineNumber ? buildUniqueLineId(rdCode, lineNumber) : '';

  return {
    id: `j-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    objectName,
    rdCode,
    contour,
    lineNumber,
    uniqueLineId,
    testCircuitId: null,
    jointNumber: '',
    isSupplementary: false,
    jointType: 'Монтажный',
    jointKind: 'Стыковое',
    diameterMm: 0,
    diameterInch: '',
    wallThickness: 0,
    lrv1Code: '',
    elem1Name: '',
    elem1Material: '',
    elem1Ntd: '',
    elem1Manufacturer: '',
    elem1DiameterMm: 0,
    elem1WallThickness: 0,
    elem1FactoryNumber: '',
    elem1SerialNumber: '',
    elem1Length: '',
    elem1CertNumber: '',
    elem1HeatNumber: '',
    elem1BatchNumber: '',
    lrv2Code: '',
    elem2Name: '',
    elem2Material: '',
    elem2Ntd: '',
    elem2Manufacturer: '',
    elem2DiameterMm: 0,
    elem2WallThickness: 0,
    elem2FactoryNumber: '',
    elem2SerialNumber: '',
    elem2Length: '',
    elem2CertNumber: '',
    elem2HeatNumber: '',
    elem2BatchNumber: '',
    weldingType: '',
    gostJointType: '',
    weldingPosition: '',
    preheatTemp: '',
    techCardNumber: '',
    welderStamp: '',
    welderStampsList: [],
    brigadeStamp: '',
    welderFullName: '',
    welderCertNumber: '',
    weldingMaterials: '',
    ambientTemp: '',
    weldingDate: '',
    responsiblePerson: '',
    recordStatus: 'DRAFT',
    vikReportNumber: '',
    vikDate: '',
    vikResult: 'Не проводился',
    vikInspector: '',
    ndtType: 'РК',
    ndtReportNumber: '',
    ndtDate: '',
    ndtResult: 'Не проводился',
    ndtInspector: '',
    dupNdtType: 'Не требуется',
    dupNdtReportNumber: '',
    dupNdtDate: '',
    dupNdtResult: 'Не проводился',
    dupNdtInspector: '',
    repairCount: 0,
    updatedAt: new Date().toISOString(),
    updatedBy: params.updatedBy || 'engineer',
  };
}

/**
 * Сортирует стыки одной линии в соответствии с корпоративной трёхзначной нумерацией (010, 011, 020...).
 */
export function sortJointsByNumber(joints: WeldJoint[]): WeldJoint[] {
  return [...joints].sort((a, b) => {
    const numA = parseInt(a.jointNumber, 10);
    const numB = parseInt(b.jointNumber, 10);
    if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) {
      return numA - numB;
    }
    return a.jointNumber.localeCompare(b.jointNumber, undefined, {
      numeric: true,
    });
  });
}

/**
 * Возвращает список стыков текущей линии, доступных как источник копирования элементов
 * в режимах создания и редактирования.
 */
export function getCopyableLineJoints(
  allJoints: WeldJoint[],
  uniqueLineId: string,
  excludeJointId?: string
): WeldJoint[] {
  if (!uniqueLineId) return [];
  const candidates = allJoints.filter(
    (j) => j.uniqueLineId === uniqueLineId && j.id !== excludeJointId
  );
  return sortJointsByNumber(candidates);
}

/**
 * Подбирает ID стыка-донора по умолчанию: ближайший предыдущий по номеру стык
 * или последний стык линии (если текущий номер пуст либо меньше всех существующих).
 */
export function pickDefaultDonorJointId(
  copyableJoints: WeldJoint[],
  currentJointNumber?: string
): string {
  if (copyableJoints.length === 0) return '';
  const curNum = parseInt((currentJointNumber || '').trim(), 10);
  if (!Number.isNaN(curNum)) {
    let nearestPrev: WeldJoint | null = null;
    for (const j of copyableJoints) {
      const jNum = parseInt(j.jointNumber, 10);
      if (!Number.isNaN(jNum) && jNum < curNum) {
        nearestPrev = j;
      }
    }
    if (nearestPrev) return nearestPrev.id;
  }
  return copyableJoints[copyableJoints.length - 1].id;
}

/**
 * Выполняет полную копию обоих свариваемых элементов (включая зав. номера, длину и реквизиты партий)
 * из стыка-донора с синхронизацией верхнеуровневых диаметра и толщины стенки по Элементу 1.
 */
export function copyBothElementsFromJoint(
  targetForm: WeldJoint,
  sourceJoint: WeldJoint
): WeldJoint {
  const elem1Diam = sourceJoint.elem1DiameterMm ?? sourceJoint.diameterMm ?? 0;
  const elem1Wall = sourceJoint.elem1WallThickness ?? sourceJoint.wallThickness ?? 0;
  const elem2Diam = sourceJoint.elem2DiameterMm ?? sourceJoint.diameterMm ?? 0;
  const elem2Wall = sourceJoint.elem2WallThickness ?? sourceJoint.wallThickness ?? 0;

  return {
    ...targetForm,
    diameterMm: elem1Diam,
    diameterInch: elem1Diam > 0 ? mmToInchDiameter(elem1Diam) : '',
    wallThickness: elem1Wall,

    lrv1Code: sourceJoint.lrv1Code || '',
    elem1Name: sourceJoint.elem1Name || '',
    elem1Material: sourceJoint.elem1Material || '',
    elem1Ntd: sourceJoint.elem1Ntd || '',
    elem1Manufacturer: sourceJoint.elem1Manufacturer || '',
    elem1DiameterMm: elem1Diam,
    elem1WallThickness: elem1Wall,
    elem1FactoryNumber: sourceJoint.elem1FactoryNumber || '',
    elem1SerialNumber: sourceJoint.elem1SerialNumber || '',
    elem1Length: sourceJoint.elem1Length || '',
    elem1CertNumber: sourceJoint.elem1CertNumber || '',
    elem1HeatNumber: sourceJoint.elem1HeatNumber || '',
    elem1BatchNumber: sourceJoint.elem1BatchNumber || '',

    lrv2Code: sourceJoint.lrv2Code || '',
    elem2Name: sourceJoint.elem2Name || '',
    elem2Material: sourceJoint.elem2Material || '',
    elem2Ntd: sourceJoint.elem2Ntd || '',
    elem2Manufacturer: sourceJoint.elem2Manufacturer || '',
    elem2DiameterMm: elem2Diam,
    elem2WallThickness: elem2Wall,
    elem2FactoryNumber: sourceJoint.elem2FactoryNumber || '',
    elem2SerialNumber: sourceJoint.elem2SerialNumber || '',
    elem2Length: sourceJoint.elem2Length || '',
    elem2CertNumber: sourceJoint.elem2CertNumber || '',
    elem2HeatNumber: sourceJoint.elem2HeatNumber || '',
    elem2BatchNumber: sourceJoint.elem2BatchNumber || '',
  };
}

/**
 * Полностью очищает все поля выбранного свариваемого элемента (1 или 2).
 * Для Элемента 1 также сбрасывает верхнеуровневые диаметр и толщину стыка.
 */
export function clearElementFields(
  targetForm: WeldJoint,
  slot: 1 | 2
): WeldJoint {
  if (slot === 1) {
    return {
      ...targetForm,
      diameterMm: 0,
      diameterInch: '',
      wallThickness: 0,
      lrv1Code: '',
      elem1Name: '',
      elem1Material: '',
      elem1Ntd: '',
      elem1Manufacturer: '',
      elem1DiameterMm: 0,
      elem1WallThickness: 0,
      elem1FactoryNumber: '',
      elem1SerialNumber: '',
      elem1Length: '',
      elem1CertNumber: '',
      elem1HeatNumber: '',
      elem1BatchNumber: '',
    };
  }

  return {
    ...targetForm,
    lrv2Code: '',
    elem2Name: '',
    elem2Material: '',
    elem2Ntd: '',
    elem2Manufacturer: '',
    elem2DiameterMm: 0,
    elem2WallThickness: 0,
    elem2FactoryNumber: '',
    elem2SerialNumber: '',
    elem2Length: '',
    elem2CertNumber: '',
    elem2HeatNumber: '',
    elem2BatchNumber: '',
  };
}

/**
 * Нормализация строки типоразмера для живого поиска (159×8, 159х8, 159*8, Ø159 -> 159x8).
 */
function normalizeSizeSearch(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[øØ]/g, '')
    .replace(/[×хХ*]/g, 'x')
    .replace(/,/g, '.')
    .replace(/\s*x\s*/g, 'x')
    .replace(/\s+/g, ' ');
}

/**
 * Живая фильтрация списка типоразмеров по вводу пользователя (Ø, толщина, формат Ø×S).
 */
export function filterSizeOptionsLive(
  sizes: LrvSizeOption[],
  query: string
): LrvSizeOption[] {
  const normQuery = normalizeSizeSearch(query);
  if (!normQuery) return sizes;

  const compactQuery = normQuery.replace(/\s+/g, '');
  const tokens = normQuery.split(' ').filter(Boolean);

  const scored: { option: LrvSizeOption; score: number }[] = [];

  for (const sz of sizes) {
    const keyNorm = sz.key.toLowerCase();
    const labelNorm = normalizeSizeSearch(sz.label);
    const diamStr = String(sz.diameterMm);
    const wallStr = String(sz.wallThickness);
    const haystack = `${keyNorm} ${labelNorm} ${diamStr} ${wallStr}`;

    let score = 0;
    if (keyNorm === compactQuery) {
      score = 100;
    } else if (keyNorm.startsWith(compactQuery)) {
      score = 80;
    } else if (diamStr === compactQuery) {
      score = 75;
    } else if (diamStr.startsWith(compactQuery)) {
      score = 60;
    } else if (
      haystack.includes(compactQuery) ||
      tokens.every((t) => haystack.includes(t))
    ) {
      score = 40;
    }

    if (score > 0) {
      scored.push({ option: sz, score });
    }
  }

  return scored
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.option.diameterMm !== b.option.diameterMm) {
        return a.option.diameterMm - b.option.diameterMm;
      }
      return a.option.wallThickness - b.option.wallThickness;
    })
    .map((s) => s.option);
}

/**
 * Поиск и ранжирование ближайших совпадений позиций ЛРВ по введённому коду ЛРВ или атрибутам.
 */
export function searchLrvCodeSuggestions(
  items: LRVItem[],
  query: string,
  limit = 25
): LRVItem[] {
  const cleanQuery = (query || '').trim().toLowerCase();
  const activeItems = items.filter(
    (it) =>
      (it.status !== 'superseded' && it.status !== 'archived') ||
      (cleanQuery && it.lrvCode.toLowerCase().includes(cleanQuery))
  );

  if (!cleanQuery) {
    return [...activeItems]
      .sort((a, b) =>
        a.lrvCode.localeCompare(b.lrvCode, undefined, { numeric: true })
      )
      .slice(0, limit);
  }

  const tokens = cleanQuery.split(/\s+/).filter(Boolean);
  const scored: { item: LRVItem; score: number }[] = [];

  for (const item of activeItems) {
    const codeLower = (item.lrvCode || '').toLowerCase();
    const dn1 = getLrvItemDn1(item);
    const dn2 = getLrvItemDn2(item);
    const fullName = resolveLrvFullName(item).toLowerCase();
    const searchable = [
      codeLower,
      (item.shortName || '').toLowerCase(),
      fullName,
      (item.material || '').toLowerCase(),
      (item.ntd || '').toLowerCase(),
      (item.manufacturer || '').toLowerCase(),
      `${item.diameterMm}x${item.wallThickness}`,
      `${item.diameterMm}х${item.wallThickness}`,
      dn1 ? `dn${dn1}` : '',
      dn2 ? `dn${dn2}` : '',
    ].join(' ');

    let score = 0;
    if (codeLower === cleanQuery) {
      score = 100;
    } else if (codeLower.startsWith(cleanQuery)) {
      score = 85;
    } else if (codeLower.includes(cleanQuery)) {
      score = 70;
    } else if (tokens.every((tok) => searchable.includes(tok))) {
      score = 45;
    }

    if (score > 0) {
      if (item.status === 'superseded' || item.status === 'archived') {
        score -= 5;
      }
      scored.push({ item, score });
    }
  }

  return scored
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.item.lrvCode.localeCompare(b.item.lrvCode, undefined, {
        numeric: true,
      });
    })
    .slice(0, limit)
    .map((s) => s.item);
}

/**
 * Возвращает единственную подходящую позицию ЛРВ для автоподстановки в Поле 3,
 * если по критериям фильтрации найден ровно один вариант и он ещё не выбран.
 */
export function findUniqueAutoSelectableLrv(
  strictMatches: LRVItem[],
  currentLrvCode: string
): LRVItem | null {
  if (strictMatches.length !== 1) return null;
  const candidate = strictMatches[0];
  if (!candidate?.lrvCode) return null;
  if (candidate.lrvCode === currentLrvCode) return null;
  return candidate;
}

export type TraceabilityField =
  | 'factoryNumber'
  | 'certNumber'
  | 'heatNumber'
  | 'batchNumber';

export interface TraceabilityBundle {
  certNumber?: string;
  heatNumber?: string;
  batchNumber?: string;
}

export interface TraceabilitySuggestion {
  value: string;
  source: 'avk' | 'history_same_lrv' | 'history_analog';
  meta: string;
  bundle?: TraceabilityBundle;
}

export interface ElementTraceabilitySuggestions {
  factoryNumber: TraceabilitySuggestion[];
  certNumber: TraceabilitySuggestion[];
  heatNumber: TraceabilitySuggestion[];
  batchNumber: TraceabilitySuggestion[];
}

const SOURCE_PRIORITY: Record<TraceabilitySuggestion['source'], number> = {
  avk: 3,
  history_same_lrv: 2,
  history_analog: 1,
};

function mergeSuggestionList(
  rawList: TraceabilitySuggestion[]
): TraceabilitySuggestion[] {
  const map = new Map<string, TraceabilitySuggestion>();

  for (const entry of rawList) {
    const val = entry.value.trim();
    if (!val) continue;
    const key = val.toLowerCase();
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...entry, value: val });
      continue;
    }

    const existingPrio = SOURCE_PRIORITY[existing.source];
    const incomingPrio = SOURCE_PRIORITY[entry.source];
    if (incomingPrio > existingPrio) {
      map.set(key, {
        ...entry,
        value: val,
        bundle: {
          certNumber: entry.bundle?.certNumber || existing.bundle?.certNumber,
          heatNumber: entry.bundle?.heatNumber || existing.bundle?.heatNumber,
          batchNumber: entry.bundle?.batchNumber || existing.bundle?.batchNumber,
        },
      });
    } else {
      map.set(key, {
        ...existing,
        bundle: {
          certNumber: existing.bundle?.certNumber || entry.bundle?.certNumber,
          heatNumber: existing.bundle?.heatNumber || entry.bundle?.heatNumber,
          batchNumber: existing.bundle?.batchNumber || entry.bundle?.batchNumber,
        },
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const prioDiff = SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source];
    if (prioDiff !== 0) return prioDiff;
    return a.value.localeCompare(b.value, undefined, { numeric: true });
  });
}

function hasAnyBundleValue(bundle?: TraceabilityBundle): boolean {
  return Boolean(
    bundle && (bundle.certNumber || bundle.heatNumber || bundle.batchNumber)
  );
}

/**
 * Формирует подсказки реквизитов (зав. №, № сертификата, № плавки, № партии)
 * из допущенных актов входного контроля (АВК) и ранее введённых стыков.
 */
export function buildElementTraceabilitySuggestions(params: {
  selectedLrvItem?: LRVItem;
  allJoints: WeldJoint[];
  currentJointId?: string;
  elemName?: string;
  elemMaterial?: string;
  elemDiameterMm?: number;
}): ElementTraceabilitySuggestions {
  const {
    selectedLrvItem,
    allJoints,
    currentJointId,
    elemName,
    elemMaterial,
    elemDiameterMm,
  } = params;

  const factoryRaw: TraceabilitySuggestion[] = [];
  const certRaw: TraceabilitySuggestion[] = [];
  const heatRaw: TraceabilitySuggestion[] = [];
  const batchRaw: TraceabilitySuggestion[] = [];

  // 1. Акты входного контроля (АВК) выбранной позиции ЛРВ — только допущенные партии
  const acceptedBatches = (selectedLrvItem?.batches || []).filter(
    (b) => b.verdict === 'accepted'
  );

  for (const batch of acceptedBatches) {
    const certNumber = (batch.certificateNumber || '').trim();
    const heatNumber = (batch.heatNumber || '').trim();
    const batchNumber = (batch.actNumber || '').trim();
    const actDateFmt = batch.actDate ? formatDateDDMMYY(batch.actDate) : '';

    const bundle: TraceabilityBundle = {
      ...(certNumber ? { certNumber } : {}),
      ...(heatNumber ? { heatNumber } : {}),
      ...(batchNumber ? { batchNumber } : {}),
    };

    const metaParts: string[] = [];
    if (batchNumber) {
      metaParts.push(actDateFmt ? `АВК № ${batchNumber} · ${actDateFmt}` : `АВК № ${batchNumber}`);
    } else if (actDateFmt) {
      metaParts.push(`АВК · ${actDateFmt}`);
    } else {
      metaParts.push('АВК');
    }
    if (certNumber) metaParts.push(`серт. ${certNumber}`);
    if (heatNumber) metaParts.push(`пл. ${heatNumber}`);

    const meta = metaParts.join(' · ');

    if (certNumber) {
      certRaw.push({ value: certNumber, source: 'avk', meta, bundle });
    }
    if (heatNumber) {
      heatRaw.push({ value: heatNumber, source: 'avk', meta, bundle });
    }
    if (batchNumber) {
      batchRaw.push({ value: batchNumber, source: 'avk', meta, bundle });
    }

    for (const sn of batch.serialNumbers || []) {
      const cleanSn = (sn || '').trim();
      if (cleanSn) {
        factoryRaw.push({
          value: cleanSn,
          source: 'avk',
          meta,
          bundle: hasAnyBundleValue(bundle) ? bundle : undefined,
        });
      }
    }
  }

  // 2. История ранее введённых значений по тому же коду ЛРВ и аналогичным элементам
  const targetLrvCode = (selectedLrvItem?.lrvCode || '').trim().toLowerCase();
  const targetName = (elemName || selectedLrvItem?.shortName || '').trim().toLowerCase();
  const targetMaterial = (elemMaterial || selectedLrvItem?.material || '').trim().toLowerCase();
  const targetDiam = elemDiameterMm || selectedLrvItem?.diameterMm || 0;

  for (const joint of allJoints) {
    if (currentJointId && joint.id === currentJointId) continue;

    const slots = [
      {
        lrvCode: joint.lrv1Code || '',
        name: joint.elem1Name || '',
        material: joint.elem1Material || '',
        diam: joint.elem1DiameterMm ?? joint.diameterMm ?? 0,
        factoryNumber: joint.elem1FactoryNumber || '',
        certNumber: joint.elem1CertNumber || '',
        heatNumber: joint.elem1HeatNumber || '',
        batchNumber: joint.elem1BatchNumber || '',
      },
      {
        lrvCode: joint.lrv2Code || '',
        name: joint.elem2Name || '',
        material: joint.elem2Material || '',
        diam: joint.elem2DiameterMm ?? joint.diameterMm ?? 0,
        factoryNumber: joint.elem2FactoryNumber || '',
        certNumber: joint.elem2CertNumber || '',
        heatNumber: joint.elem2HeatNumber || '',
        batchNumber: joint.elem2BatchNumber || '',
      },
    ];

    for (const slot of slots) {
      const slotLrv = slot.lrvCode.trim().toLowerCase();
      const slotName = slot.name.trim().toLowerCase();
      const slotMat = slot.material.trim().toLowerCase();

      let source: 'history_same_lrv' | 'history_analog' | null = null;
      if (targetLrvCode && slotLrv && slotLrv === targetLrvCode) {
        source = 'history_same_lrv';
      } else {
        const nameMatch = Boolean(targetName && slotName && slotName === targetName);
        const geomMatMatch = Boolean(
          targetDiam > 0 &&
            slot.diam === targetDiam &&
            (!targetMaterial || !slotMat || slotMat === targetMaterial)
        );
        if (nameMatch || geomMatMatch || (!targetLrvCode && !targetName && !targetDiam)) {
          source = 'history_analog';
        }
      }

      if (!source) continue;

      const certNumber = slot.certNumber.trim();
      const heatNumber = slot.heatNumber.trim();
      const batchNumber = slot.batchNumber.trim();
      const factoryNumber = slot.factoryNumber.trim();

      if (!certNumber && !heatNumber && !batchNumber && !factoryNumber) {
        continue;
      }

      const bundle: TraceabilityBundle = {
        ...(certNumber ? { certNumber } : {}),
        ...(heatNumber ? { heatNumber } : {}),
        ...(batchNumber ? { batchNumber } : {}),
      };

      const metaParts = [`Стык ${joint.jointNumber}`];
      if (joint.lineNumber) metaParts.push(`линия ${joint.lineNumber}`);
      if (certNumber) metaParts.push(`серт. ${certNumber}`);
      if (heatNumber) metaParts.push(`пл. ${heatNumber}`);
      if (batchNumber) metaParts.push(`парт. ${batchNumber}`);
      const meta = metaParts.join(' · ');

      if (factoryNumber) {
        factoryRaw.push({
          value: factoryNumber,
          source,
          meta,
          bundle: hasAnyBundleValue(bundle) ? bundle : undefined,
        });
      }
      if (certNumber) {
        certRaw.push({
          value: certNumber,
          source,
          meta,
          bundle: hasAnyBundleValue(bundle) ? bundle : undefined,
        });
      }
      if (heatNumber) {
        heatRaw.push({
          value: heatNumber,
          source,
          meta,
          bundle: hasAnyBundleValue(bundle) ? bundle : undefined,
        });
      }
      if (batchNumber) {
        batchRaw.push({
          value: batchNumber,
          source,
          meta,
          bundle: hasAnyBundleValue(bundle) ? bundle : undefined,
        });
      }
    }
  }

  return {
    factoryNumber: mergeSuggestionList(factoryRaw),
    certNumber: mergeSuggestionList(certRaw),
    heatNumber: mergeSuggestionList(heatRaw),
    batchNumber: mergeSuggestionList(batchRaw),
  };
}

/**
 * Применяет выбранную подсказку реквизитов к Элементу 1 или 2,
 * автоматически подтягивая всю связанную тройку «сертификат / плавка / партия».
 */
export function applyTraceabilitySuggestionToElement(
  form: WeldJoint,
  slot: 1 | 2,
  field: TraceabilityField,
  suggestion: TraceabilitySuggestion
): WeldJoint {
  const bundle = suggestion.bundle;
  if (slot === 1) {
    return {
      ...form,
      ...(field === 'factoryNumber'
        ? { elem1FactoryNumber: suggestion.value }
        : {}),
      elem1CertNumber:
        field === 'certNumber'
          ? suggestion.value
          : bundle?.certNumber || form.elem1CertNumber || '',
      elem1HeatNumber:
        field === 'heatNumber'
          ? suggestion.value
          : bundle?.heatNumber || form.elem1HeatNumber || '',
      elem1BatchNumber:
        field === 'batchNumber'
          ? suggestion.value
          : bundle?.batchNumber || form.elem1BatchNumber || '',
    };
  }

  return {
    ...form,
    ...(field === 'factoryNumber'
      ? { elem2FactoryNumber: suggestion.value }
      : {}),
    elem2CertNumber:
      field === 'certNumber'
        ? suggestion.value
        : bundle?.certNumber || form.elem2CertNumber || '',
    elem2HeatNumber:
      field === 'heatNumber'
        ? suggestion.value
        : bundle?.heatNumber || form.elem2HeatNumber || '',
    elem2BatchNumber:
      field === 'batchNumber'
        ? suggestion.value
        : bundle?.batchNumber || form.elem2BatchNumber || '',
  };
}
