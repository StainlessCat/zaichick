import {
  PreheatRegimeRule,
  TechCardItem,
  WelderProfile,
  WeldingMaterialCertificate,
  WeldJoint,
} from '../types/welding';
import { normalizeStampString } from './weldersDirectory';

export const DEFAULT_PREHEAT_RULES: PreheatRegimeRule[] = [
  {
    ambientMinC: -60,
    ambientMaxC: -5,
    minPreheatTempC: 150,
    conditionLabel: 'При T возд. от -60 °C до -5 °C: подогрев ≥ +150 °C',
  },
  {
    ambientMinC: -4.9,
    ambientMaxC: 5,
    minPreheatTempC: 100,
    conditionLabel: 'При T возд. от -4.9 °C до +5 °C: подогрев ≥ +100 °C',
  },
  {
    ambientMinC: 5.1,
    ambientMaxC: 50,
    minPreheatTempC: 0,
    conditionLabel: 'При T возд. от +5.1 °C до +50 °C: подогрев не требуется',
  },
];

export function formatPreheatConditionLabel(
  rule: Pick<PreheatRegimeRule, 'ambientMinC' | 'ambientMaxC' | 'minPreheatTempC'>
): string {
  const minStr = rule.ambientMinC > 0 ? `+${rule.ambientMinC}` : `${rule.ambientMinC}`;
  const maxStr = rule.ambientMaxC > 0 ? `+${rule.ambientMaxC}` : `${rule.ambientMaxC}`;
  if (rule.minPreheatTempC > 0) {
    return `При T возд. от ${minStr} °C до ${maxStr} °C: подогрев ≥ +${rule.minPreheatTempC} °C`;
  }
  return `При T возд. от ${minStr} °C до ${maxStr} °C: подогрев не требуется`;
}

/**
 * Создаёт чистую заготовку новой технологической карты без зашитого конфликтующего шифра.
 */
export function createEmptyTechCardDraft(): TechCardItem {
  return {
    id: `tc-${Date.now()}`,
    number: '',
    title: '',
    weldingType: 'РАД+РД',
    jointKind: 'Стыковое',
    elementCombination: 'Труба+Труба',
    ntd: 'СТО Газпром 15-1.1-002-2023',
    steelGroup: '',
    minDiameterMm: 57,
    maxDiameterMm: 325,
    minWallThicknessMm: 4,
    maxWallThicknessMm: 16,
    recommendedMaterials: '',
    preheatRules: DEFAULT_PREHEAT_RULES.map((r) => ({ ...r })),
  };
}

/**
 * Подбирает уникальный шифр ТК на основе исходного шифра:
 * если оканчивается на числовой суффикс (например «ТК-045-РАД/РД-01»), увеличивает его с сохранением ведущих нулей;
 * иначе добавляет «-копия» / «-копия 2» и т.д.
 */
export function suggestUniqueTechCardNumber(
  sourceNumber: string,
  existingTechCards: TechCardItem[]
): string {
  const existingSet = new Set(
    existingTechCards.map((tc) => tc.number.trim().toLowerCase())
  );
  const base = sourceNumber.trim();
  if (!base) return '';

  const trailingMatch = base.match(/^(.*?)(\d+)$/);
  if (trailingMatch) {
    const prefix = trailingMatch[1];
    const digits = trailingMatch[2];
    const padLen = digits.length;
    let num = parseInt(digits, 10) + 1;
    for (let attempt = 0; attempt < 500; attempt++) {
      const candidate = `${prefix}${String(num).padStart(padLen, '0')}`;
      if (!existingSet.has(candidate.toLowerCase())) {
        return candidate;
      }
      num += 1;
    }
  }

  let candidate = `${base}-копия`;
  let counter = 2;
  while (existingSet.has(candidate.toLowerCase()) && counter < 500) {
    candidate = `${base}-копия-${counter}`;
    counter += 1;
  }
  return candidate;
}

/**
 * Копирует все технологические параметры из существующей ТК в черновик новой ТК,
 * подбирая свободный шифр и очищая серверные метаданные (id, version, recordStatus).
 */
export function buildTechCardCopyDraft(
  source: TechCardItem,
  existingTechCards: TechCardItem[]
): TechCardItem {
  return {
    id: `tc-${Date.now()}`,
    number: suggestUniqueTechCardNumber(source.number, existingTechCards),
    title: source.title || '',
    weldingType: source.weldingType || 'РАД+РД',
    jointKind: source.jointKind || 'Стыковое',
    elementCombination: source.elementCombination || 'Труба+Труба',
    ntd: source.ntd || 'СТО Газпром 15-1.1-002-2023',
    steelGroup: source.steelGroup || '',
    minDiameterMm: source.minDiameterMm ?? 57,
    maxDiameterMm: source.maxDiameterMm ?? 325,
    minWallThicknessMm: source.minWallThicknessMm ?? 4,
    maxWallThicknessMm: source.maxWallThicknessMm ?? 16,
    recommendedMaterials: source.recommendedMaterials || '',
    preheatRules: (source.preheatRules && source.preheatRules.length > 0
      ? source.preheatRules
      : DEFAULT_PREHEAT_RULES
    ).map((r) => ({ ...r })),
  };
}

/**
 * Комплексная валидация формы технологической карты перед отправкой на сервер.
 */
export function validateTechCardDraft(
  draft: TechCardItem,
  existingTechCards: TechCardItem[],
  editingId: string | null
): string | null {
  const cleanNum = draft.number.trim();
  if (!cleanNum) {
    return 'Укажите шифр технологической карты.';
  }

  const isDuplicate = existingTechCards.some(
    (tc) =>
      tc.id !== editingId &&
      tc.number.trim().toLowerCase() === cleanNum.toLowerCase()
  );
  if (isDuplicate) {
    return `Технологическая карта с шифром «${cleanNum}» уже существует.`;
  }

  if (!draft.title.trim()) {
    return 'Укажите наименование технологической карты.';
  }

  if (!draft.ntd.trim()) {
    return 'Укажите нормативный документ (НТД / регламент).';
  }

  if (
    Number.isNaN(draft.minDiameterMm) ||
    Number.isNaN(draft.maxDiameterMm) ||
    draft.minDiameterMm < 10 ||
    draft.maxDiameterMm > 2520 ||
    draft.minDiameterMm > draft.maxDiameterMm
  ) {
    return 'Минимальный диаметр должен быть от 10 мм и не превышать максимальный диаметр (до 2520 мм).';
  }

  if (
    Number.isNaN(draft.minWallThicknessMm) ||
    Number.isNaN(draft.maxWallThicknessMm) ||
    draft.minWallThicknessMm < 1 ||
    draft.maxWallThicknessMm > 150 ||
    draft.minWallThicknessMm > draft.maxWallThicknessMm
  ) {
    return 'Минимальная толщина стенки должна быть от 1 мм и не превышать максимальную толщину (до 150 мм).';
  }

  for (let i = 0; i < draft.preheatRules.length; i++) {
    const r = draft.preheatRules[i];
    if (
      Number.isNaN(r.ambientMinC) ||
      Number.isNaN(r.ambientMaxC) ||
      Number.isNaN(r.minPreheatTempC)
    ) {
      return `Заполните числовые значения в строке режима подогрева №${i + 1}.`;
    }
    if (r.ambientMinC > r.ambientMaxC) {
      return `В строке режима подогрева №${i + 1} нижний предел температуры воздуха (${r.ambientMinC} °C) превышает верхний (${r.ambientMaxC} °C).`;
    }
    if (r.minPreheatTempC < 0 || r.minPreheatTempC > 600) {
      return `В строке режима подогрева №${i + 1} укажите температуру подогрева от 0 до 600 °C.`;
    }
  }

  return null;
}

/**
 * Аккуратно добавляет марку сварочного материала в поле рекомендуемых материалов ТК без дублирования.
 */
export function appendMaterialToRecommendedList(
  current: string,
  brandAndDiameter: string
): string {
  const cleanAdd = brandAndDiameter.trim();
  if (!cleanAdd) return current;
  const trimmed = current.trim();
  if (!trimmed) return cleanAdd;

  const existingParts = trimmed
    .split(/\s*\/\s*|\s*;\s*/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (
    existingParts.includes(cleanAdd.toLowerCase()) ||
    trimmed.toLowerCase().includes(cleanAdd.toLowerCase())
  ) {
    return trimmed;
  }

  return `${trimmed} / ${cleanAdd}`;
}

export interface TechUsageCounts {
  techCardCounts: Map<string, number>;
  welderCounts: Map<string, number>;
  materialCounts: Map<string, number>;
}

/**
 * Подсчитывает применяемость техкарт, сварщиков и сварочных материалов в реестре стыков.
 */
export function computeTechUsageCounts(
  joints: WeldJoint[],
  techCards: TechCardItem[],
  welders: WelderProfile[],
  materials: WeldingMaterialCertificate[]
): TechUsageCounts {
  const techCardCounts = new Map<string, number>();
  const welderCounts = new Map<string, number>();
  const materialCounts = new Map<string, number>();

  const tcByNumberLower = new Map<string, string>();
  for (const tc of techCards) {
    techCardCounts.set(tc.id, 0);
    const key = tc.number.trim().toLowerCase();
    if (key) tcByNumberLower.set(key, tc.id);
  }

  const welderByStampNorm = new Map<string, string>();
  for (const w of welders) {
    welderCounts.set(w.stamp, 0);
    const norm = normalizeStampString(w.stamp);
    if (norm) welderByStampNorm.set(norm, w.stamp);
  }

  const matEntries = materials.map((m) => {
    materialCounts.set(m.id, 0);
    return { id: m.id, brandLower: m.brandAndDiameter.trim().toLowerCase() };
  });

  for (const j of joints) {
    // 1. Техкарты (основная и ремонтная — без двойного счёта на одном стыке)
    const matchedTcIds = new Set<string>();
    const mainTc = (j.techCardNumber || '').trim().toLowerCase();
    const repTc = (j.repairTechCard || '').trim().toLowerCase();
    if (mainTc && tcByNumberLower.has(mainTc)) {
      matchedTcIds.add(tcByNumberLower.get(mainTc)!);
    }
    if (repTc && tcByNumberLower.has(repTc)) {
      matchedTcIds.add(tcByNumberLower.get(repTc)!);
    }
    for (const tcId of matchedTcIds) {
      techCardCounts.set(tcId, (techCardCounts.get(tcId) || 0) + 1);
    }

    // 2. Сварщики и бригадные клейма
    const matchedWelderStamps = new Set<string>();
    const rawStamps: string[] = [];
    if (j.welderStamp) {
      rawStamps.push(...j.welderStamp.split(/[,;/\s]+/));
    }
    if (Array.isArray(j.welderStampsList)) {
      rawStamps.push(...j.welderStampsList);
    }
    if (j.brigadeStamp) {
      rawStamps.push(j.brigadeStamp);
    }
    if (j.repairWelderStamp) {
      rawStamps.push(...j.repairWelderStamp.split(/[,;/\s]+/));
    }
    for (const raw of rawStamps) {
      const norm = normalizeStampString(raw);
      if (norm && welderByStampNorm.has(norm)) {
        matchedWelderStamps.add(welderByStampNorm.get(norm)!);
      }
    }
    for (const stamp of matchedWelderStamps) {
      welderCounts.set(stamp, (welderCounts.get(stamp) || 0) + 1);
    }

    // 3. Сварочные материалы
    const jointMatsLower = (j.weldingMaterials || '').toLowerCase();
    if (jointMatsLower) {
      for (const m of matEntries) {
        if (m.brandLower && jointMatsLower.includes(m.brandLower)) {
          materialCounts.set(m.id, (materialCounts.get(m.id) || 0) + 1);
        }
      }
    }
  }

  return { techCardCounts, welderCounts, materialCounts };
}
