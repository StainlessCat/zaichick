/**
 * ZAYCHICK — Модульная система доменной логики сварочно-монтажного производства.
 * Центральный фасад (barrel export) для обеспечения 100% обратной совместимости:
 * - dates.ts: Форматирование дат, времени, проверка диапазонов
 * - pipeCalc.ts: Расчёты геометрии труб (DN, наружные диаметры, эквивалентные дюймы, классификация элементов)
 * - history.ts: Стек отмены/повтора (Undo/Redo)
 * - columns.ts: Метаданные граф, столбцов, ширин и определений таблиц
 * - readiness.ts: Расчёт готовности, процентов выполнения и статусов линий/стыков
 * - journals.ts: Форматирование строк журналов по СТО Газпром и ГОСТ 32569, валидация полноты
 * - weatherService.ts: Интеграция с метеопостами Росгидромета, Meteostat и Open-Meteo ERA5
 * - weldersDirectory.ts: Поиск, нормализация клейм сварщиков и НАКС-допуски по способам
 * - normativeValidation.ts: Проверки аттестации НАКС, разнотолщинности, лимита ремонта и обязательных реквизитов
 * - ndtQuotas.ts: Персональные квоты НК сварщиков, правило удвоения при браке и прогресс по линиям
 * - linelistUtils.ts: Парсинг, генерация номеров стыков, суффиксы РД, каскадные обновления и ЛРВ
 * - weatherArchiveUtils.ts: Посуточный архив температур и автоподбор фактических наблюдений
 */

export * from './formatting';
export * from './dates';
export * from './pipeCalc';
export * from './history';
export * from './columns';
export * from './readiness';
export * from './journals';
export * from './weatherService';
export * from './weldersDirectory';
export * from './normativeValidation';
export * from './ndtQuotas';
export * from './linelistUtils';
export * from './weatherArchiveUtils';
export { ROSGIDROMET_STATIONS, ROSHIDROMET_STATIONS } from '../data/rosgidrometStations';
