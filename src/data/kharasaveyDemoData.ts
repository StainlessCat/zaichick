/**
 * Демонстрационный датасет Харасавэя (1271 стык).
 * ВНИМАНИЕ: Основные данные вынесены в статический JSON-ассет /data/kharasaveyDemoData.json,
 * что позволило убрать 3.3 МБ из JS-бандла приложения и в разы ускорить компиляцию TypeScript.
 * Для загрузки используйте асинхронную функцию loadKharasaveyDemoData() из src/data/seedData.ts.
 */
import { FacilityObject, LRVItem, ProjectLineItem, WeldJoint } from '../types/welding';
import { KHARASAVEY_FACILITY } from './seedData';

export { KHARASAVEY_FACILITY };
export const KHARASAVEY_LINES: ProjectLineItem[] = [];
export const KHARASAVEY_LRV: LRVItem[] = [];
export const KHARASAVEY_JOINTS: WeldJoint[] = [];
