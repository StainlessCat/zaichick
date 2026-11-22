import { LRVItem } from '../types/welding';
import {
  MaterialBatchAct,
  MaterialControlStatus,
  MaterialItemWithControl,
  MaterialReplacementNotice,
  MaterialWeldingCheckResult,
} from '../types/materialControl';

/**
 * Нормализация даты к формату YYYY-MM-DD
 */
export function normalizeDate(dateStr: string): string {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // Обработка ДД.ММ.ГГГГ или ДД.ММ.ГГ
  const parts = trimmed.split('.');
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    let year = parts[2];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }
  return trimmed;
}

/**
 * Форматирование даты в стандартный вид ДД.ММ.ГГГГ
 */
export function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return '—';
  const iso = normalizeDate(dateStr);
  const parts = iso.split('-');
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return dateStr;
}

/**
 * Пересчёт баланса объёма и сводного статуса входного контроля позиции
 */
export function calculateMaterialControlBalance(
  totalSpecQty: number,
  batches: MaterialBatchAct[]
): {
  controlStatus: MaterialControlStatus;
  acceptedQty: number;
  rejectedQty: number;
  replacedQty: number;
  pendingQty: number;
} {
  let acceptedQty = 0;
  let rejectedQty = 0;
  let replacedQty = 0;

  for (const batch of batches) {
    if (batch.verdict === 'accepted') {
      acceptedQty += batch.quantity;
    } else if (batch.verdict === 'rejected') {
      rejectedQty += batch.quantity;
    } else if (batch.verdict === 'replaced') {
      replacedQty += batch.quantity;
    }
  }

  const processedQty = acceptedQty + rejectedQty + replacedQty;
  const pendingQty = Math.max(0, totalSpecQty - processedQty);

  let controlStatus: MaterialControlStatus = 'pending';

  if (batches.length === 0 || (acceptedQty === 0 && rejectedQty === 0 && replacedQty === 0)) {
    controlStatus = 'pending';
  } else if (rejectedQty > 0 && replacedQty === 0) {
    controlStatus = 'rejected';
  } else if (acceptedQty >= totalSpecQty && rejectedQty === 0) {
    controlStatus = 'accepted';
  } else if (replacedQty >= totalSpecQty) {
    controlStatus = 'replaced';
  } else {
    controlStatus = 'partial';
  }

  return {
    controlStatus,
    acceptedQty,
    rejectedQty,
    replacedQty,
    pendingQty,
  };
}

/**
 * Проверка возможности вовлечения материала в сварку стыка на указанную дату
 */
export function verifyMaterialForWelding(
  material: MaterialItemWithControl,
  batchId?: string,
  weldDate?: string
): MaterialWeldingCheckResult {
  // 1. Проверка общего наличия актов
  if (!material.batches || material.batches.length === 0) {
    return {
      isAllowed: false,
      blockReason: 'Материал не имеет утверждённых актов входного контроля',
      availableQuantity: 0,
    };
  }

  // 2. Поиск партии
  const targetBatch = batchId
    ? material.batches.find((b) => b.id === batchId)
    : material.batches.find((b) => b.verdict === 'accepted');

  if (!targetBatch) {
    return {
      isAllowed: false,
      blockReason: 'Не найдена допущенная к монтажу партия материала',
      availableQuantity: 0,
    };
  }

  if (targetBatch.verdict !== 'accepted') {
    const reason =
      targetBatch.verdict === 'rejected'
        ? 'Выбранная партия забракована на входном контроле'
        : 'Партия ожидает входного контроля';
    return {
      isAllowed: false,
      blockReason: reason,
      availableQuantity: 0,
    };
  }

  // 3. Хронологический контроль: дата сварки >= дата акта входного контроля
  if (weldDate && targetBatch.actDate) {
    const normWeld = normalizeDate(weldDate);
    const normAct = normalizeDate(targetBatch.actDate);
    if (normWeld < normAct) {
      return {
        isAllowed: false,
        blockReason: `Дата сварки (${formatDateDisplay(normWeld)}) предшествует дате акта входного контроля № ${targetBatch.actNumber} от ${formatDateDisplay(normAct)}`,
        earliestAllowedDate: targetBatch.actDate,
        availableQuantity: targetBatch.quantity,
      };
    }
  }

  return {
    isAllowed: true,
    earliestAllowedDate: targetBatch.actDate,
    availableQuantity: targetBatch.quantity,
  };
}

/**
 * Расщепление позиции спецификации при частичной отбраковке и согласовании замены
 * Пример: из 20 кранов 1 забракован и заменён на аналог по письму.
 */
export function splitMaterialForPartialReplacement(params: {
  originalMaterial: LRVItem | MaterialItemWithControl;
  rejectedBatchId: string;
  replacedQuantity: number;
  replacementNotice: Omit<MaterialReplacementNotice, 'originalMaterialId' | 'originalMaterialCode' | 'replacedQuantity'>;
  replacementCustomFields: {
    lrvCode: string;
    shortName: string;
    material: string;
    ntd: string;
    manufacturer?: string;
    replacementBatch: Omit<MaterialBatchAct, 'id' | 'materialId' | 'quantity' | 'unit'>;
  };
}): {
  updatedOriginal: MaterialItemWithControl;
  replacementItem: MaterialItemWithControl;
} {
  const { originalMaterial, rejectedBatchId, replacedQuantity, replacementNotice, replacementCustomFields } = params;

  // 1. Обновляем исходную партию: помечаем статус replaced
  const updatedBatches = (originalMaterial.batches || []).map((batch) => {
    if (batch.id === rejectedBatchId) {
      return {
        ...batch,
        verdict: 'replaced' as const,
        replacementLetter: replacementNotice.letterNumber,
        replacementDate: replacementNotice.letterDate,
      };
    }
    return batch;
  });

  const originalBalance = calculateMaterialControlBalance(
    (originalMaterial.totalSpecQty ?? originalMaterial.specQty),
    updatedBatches
  );

  const updatedOriginal: MaterialItemWithControl = {
    ...originalMaterial,

    totalSpecQty: originalMaterial.totalSpecQty ?? originalMaterial.specQty,
    batches: updatedBatches,
    ...originalBalance,
  };

  // 2. Создаем новую дочернюю позицию-аналог для замененного количества
  const replacementItemId = `mat-repl-${Date.now()}`;
  const replacementBatchId = `batch-repl-${Date.now()}`;

  const replacementBatch: MaterialBatchAct = {
    id: replacementBatchId,
    materialId: replacementItemId,
    ...replacementCustomFields.replacementBatch,
    quantity: replacedQuantity,
    unit: originalMaterial.unit,
  };

  const replacementBalance = calculateMaterialControlBalance(replacedQuantity, [replacementBatch]);

  const replacementItem: MaterialItemWithControl = {
    ...originalMaterial,

    id: replacementItemId,
    lrvCode: replacementCustomFields.lrvCode,
    shortName: replacementCustomFields.shortName,
    material: replacementCustomFields.material,
    ntd: replacementCustomFields.ntd,
    manufacturer: replacementCustomFields.manufacturer || originalMaterial.manufacturer,
    specQty: replacedQuantity,
    totalSpecQty: replacedQuantity,
    parentMaterialId: originalMaterial.id,
    batches: [replacementBatch],
    replacementNotice: {
      ...replacementNotice,
      originalMaterialId: originalMaterial.id,
      originalMaterialCode: originalMaterial.lrvCode,
      replacedQuantity,
    },
    ...replacementBalance,
  };

  return {
    updatedOriginal,
    replacementItem,
  };
}
