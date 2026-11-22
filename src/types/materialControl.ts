import { LRVItem } from './welding';

/**
 * Заключение входного контроля по конкретной поступившей партии
 */
export type IncomingControlVerdict =
  | 'accepted'   // Годен к монтажу
  | 'rejected'   // Выявлен брак
  | 'replaced'   // Заменен по согласованию
  | 'pending';    // Ожидает проверки

/**
 * Сводный статус позиции материала в спецификации
 */
export type MaterialControlStatus =
  | 'accepted'   // Годен к монтажу (весь объем допущен)
  | 'partial'    // Частичный допуск (часть объема допущена, остаток в пути/ожидает контроля)
  | 'pending'    // Ожидает контроля (актов нет, в сварку запрещено)
  | 'rejected'   // Выявлен брак (есть забракованные единицы)
  | 'replaced';  // Согласована замена (полная замена по письму)

/**
 * Партия или акт входного контроля
 * К одной позиции спецификации может относиться несколько актов
 */
export interface MaterialBatchAct {
  id: string;
  materialId: string;
  actNumber: string;               // Номер акта входного контроля
  actDate: string;                 // Дата подписания акта (ГГГГ-ММ-ДД)
  certificateNumber: string;       // Номер заводского сертификата или паспорта
  heatNumber?: string;             // Номер плавки / партии металла
  serialNumbers?: string[];        // Заводские серийные номера изделий (для ЗРА, кранов)
  quantity: number;                // Количество в данной партии
  unit: 'шт' | 'м';
  verdict: IncomingControlVerdict; // Заключение входного контроля
  inspectorName?: string;          // ФИО контролера / дефектоскописта
  rejectionReason?: string;        // Причина отбраковки
  replacementLetter?: string;      // Номер письма-согласования замены
  replacementDate?: string;        // Дата письма-согласования
  replacedByBatchId?: string;       // Идентификатор партии-заменителя
  notes?: string;                  // Примечания
}

/**
 * Сведения о согласовании замены материала
 */
export interface MaterialReplacementNotice {
  letterNumber: string;            // Номер официального письма согласования
  letterDate: string;              // Дата письма (ГГГГ-ММ-ДД)
  approvedBy: string;              // Организация (Проектный институт, Заказчик)
  originalMaterialId: string;      // ID исходной проектной позиции
  originalMaterialCode: string;    // Код исходной позиции
  replacedQuantity: number;        // Количество единиц на замену
  reason: string;                  // Обоснование замены (отбраковка при гидроиспытаниях, срыв сроков поставки)
}

/**
 * Позиция базы материалов с поддержкой партионного входного контроля
 */
export interface MaterialItemWithControl extends LRVItem {
  controlStatus: MaterialControlStatus;
  totalSpecQty: number;            // Общее количество по проектной спецификации
  acceptedQty: number;             // Фактически допущено к монтажу по актам
  rejectedQty: number;             // Забраковано по актам
  replacedQty: number;             // Согласовано к замене
  pendingQty: number;              // Не охвачено актами (ожидает приёмки)
  batches: MaterialBatchAct[];     // Перечень актов входного контроля
  parentMaterialId?: string;       // Ссылка на исходную позицию при расщеплении/замене
  replacementNotice?: MaterialReplacementNotice;
}

/**
 * Результат проверки допуска материала к сварке
 */
export interface MaterialWeldingCheckResult {
  isAllowed: boolean;
  blockReason?: string;
  earliestAllowedDate?: string;
  availableQuantity: number;
}
