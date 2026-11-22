import { WeldJoint, LRVItem } from '../types/welding';
import { MaterialItemWithControl, MaterialBatchAct } from '../types/materialControl';
import { normalizeDate, formatDateDisplay } from './materialControlLogic';
import { ValidationIssue } from './dataIntegrityGuard';

/**
 * Находит подходящую партию материала по коду ЛРВ, наименованию или серийному номеру
 */
export function findMatchingBatchForElement(
  lrvCodeOrName: string,
  serialNumber: string | undefined,
  materials: (MaterialItemWithControl | LRVItem)[]
): {
  material?: MaterialItemWithControl | LRVItem;
  batch?: MaterialBatchAct;
} {
  if (!lrvCodeOrName) return {};

  const cleanQuery = lrvCodeOrName.trim().toLowerCase();

  // 1. Поиск материала
  const material = materials.find((m) => {
    return (
      m.lrvCode.toLowerCase() === cleanQuery ||
      m.shortName.toLowerCase() === cleanQuery ||
      cleanQuery.includes(m.lrvCode.toLowerCase())
    );
  });

  if (!material || !material.batches || material.batches.length === 0) {
    return { material };
  }

  // 2. Если передан серийный номер, ищем конкретную партию
  if (serialNumber) {
    const cleanSerial = serialNumber.trim().toLowerCase();
    const batchWithSerial = material.batches.find((b) =>
      b.serialNumbers?.some((s) => s.toLowerCase() === cleanSerial)
    );
    if (batchWithSerial) {
      return { material, batch: batchWithSerial };
    }
  }

  // 3. По умолчанию берем первую допущенную партию, либо первую имеющуюся
  const acceptedBatch = material.batches.find((b) => b.verdict === 'accepted');
  return { material, batch: acceptedBatch || material.batches[0] };
}

/**
 * Валидация входного контроля элементов стыка (Элемент 1 и Элемент 2)
 * Проверяет:
 * 1. Наличие заключения лаборатории входного контроля (предупреждение при отсутствии акта для обратной совместимости с историческими записями).
 * 2. Категорический запрет использования забракованных партий (блокирующая ошибка severity: 'error').
 * 3. Хронологический инвариант: Дата сварки >= Даты подписания акта входного контроля (блокирующая ошибка severity: 'error').
 */
export function validateJointMaterialIncomingControl(
  joint: Partial<WeldJoint>,
  materials: (MaterialItemWithControl | LRVItem)[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const weldDate = joint.weldingDate ? normalizeDate(joint.weldingDate) : '';

  // Проверка Элемента 1
  if (joint.lrv1Code || joint.elem1Material || joint.elem1Name) {
    const query = joint.lrv1Code || joint.elem1Name || joint.elem1Material || '';
    const { material, batch } = findMatchingBatchForElement(
      query,
      joint.elem1SerialNumber || joint.elem1FactoryNumber,
      materials
    );

    if (material) {
      if (!batch || !material.batches || material.batches.length === 0 || material.controlStatus === 'pending') {
        issues.push({
          id: 'mat-elem1-no-vk',
          category: 'chronology',
          severity: 'warning',
          field: 'elem1Material',
          title: 'Элемент 1 не имеет акта входного контроля',
          message: `Элемент 1 стыка (${material.shortName}) не имеет утверждённого акта входного контроля в Базе материалов.`,
        });
      } else if (batch.verdict === 'rejected') {
        issues.push({
          id: 'mat-elem1-rejected',
          category: 'chronology',
          severity: 'error',
          field: 'elem1Material',
          title: 'Элемент 1 забракован лабораторией',
          message: `Партия Элемента 1 стыка (${material.shortName}) забракована по акту № ${batch.actNumber}. Монтаж и сварка запрещены.`,
        });
      } else if (batch.verdict === 'accepted' && weldDate && batch.actDate) {
        const actDate = normalizeDate(batch.actDate);
        if (weldDate < actDate) {
          issues.push({
            id: 'chr-elem1-vk-date',
            category: 'chronology',
            severity: 'error',
            field: 'weldingDate',
            title: 'Сварка раньше входного контроля Элемента 1',
            message: `Дата сварки стыка (${formatDateDisplay(weldDate)}) предшествует дате подписания акта входного контроля Элемента 1 № ${batch.actNumber} от ${formatDateDisplay(actDate)}.`,
          });
        }
      }
    }
  }

  // Проверка Элемента 2
  if (joint.lrv2Code || joint.elem2Material || joint.elem2Name) {
    const query = joint.lrv2Code || joint.elem2Name || joint.elem2Material || '';
    const { material, batch } = findMatchingBatchForElement(
      query,
      joint.elem2SerialNumber || joint.elem2FactoryNumber,
      materials
    );

    if (material) {
      if (!batch || !material.batches || material.batches.length === 0 || material.controlStatus === 'pending') {
        issues.push({
          id: 'mat-elem2-no-vk',
          category: 'chronology',
          severity: 'warning',
          field: 'elem2Material',
          title: 'Элемент 2 не имеет акта входного контроля',
          message: `Элемент 2 стыка (${material.shortName}) не имеет утверждённого акта входного контроля в Базе материалов.`,
        });
      } else if (batch.verdict === 'rejected') {
        issues.push({
          id: 'mat-elem2-rejected',
          category: 'chronology',
          severity: 'error',
          field: 'elem2Material',
          title: 'Элемент 2 забракован лабораторией',
          message: `Партия Элемента 2 стыка (${material.shortName}) забракована по акту № ${batch.actNumber}. Монтаж и сварка запрещены.`,
        });
      } else if (batch.verdict === 'accepted' && weldDate && batch.actDate) {
        const actDate = normalizeDate(batch.actDate);
        if (weldDate < actDate) {
          issues.push({
            id: 'chr-elem2-vk-date',
            category: 'chronology',
            severity: 'error',
            field: 'weldingDate',
            title: 'Сварка раньше входного контроля Элемента 2',
            message: `Дата сварки стыка (${formatDateDisplay(weldDate)}) предшествует дате подписания акта входного контроля Элемента 2 № ${batch.actNumber} от ${formatDateDisplay(actDate)}.`,
          });
        }
      }
    }
  }

  return issues;
}
