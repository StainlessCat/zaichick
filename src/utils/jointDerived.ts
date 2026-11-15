/**
 * ZAYCHICK — Вычисляемые свойства сварных стыков и производные структуры проекта.
 * Модуль объединяет расчет эквивалентных параметров стыка (EDI/дюймы),
 * вывод структуры объектов строительства/РД из лайнлиста и стыков,
 * и агрегации размерных характеристик.
 */

import type { FacilityObject, ProjectLineItem, WeldJoint } from '../types/welding';
import {
  calculateEquivalentDiaInch,
  inchStringToNumeric,
  mmToNumericInchDiameter,
} from './pipeCalc';

/**
 * Извлекает или рассчитывает эквивалентный дюйм-диаметр (EDI) стыка по Методу А (СТО Газпром / отраслевой стандарт)
 */
export function getJointEquivDiaInch(
  joint: Pick<WeldJoint, 'diameterMm' | 'diameterInch' | 'wallThickness'> & {
    equivDiameterInch?: number;
  }
): number {
  if (joint.equivDiameterInch !== undefined && !Number.isNaN(joint.equivDiameterInch)) {
    return joint.equivDiameterInch;
  }
  return calculateEquivalentDiaInch(
    joint.diameterInch || joint.diameterMm,
    joint.wallThickness
  );
}

/**
 * Извлекает или рассчитывает номинальный дюйм-диаметр стыка
 */
export function getJointNominalInch(
  joint: Pick<WeldJoint, 'diameterMm' | 'diameterInch'>
): number {
  if (joint.diameterInch) {
    const parsed = inchStringToNumeric(joint.diameterInch);
    if (parsed > 0) return parsed;
  }
  return mmToNumericInchDiameter(joint.diameterMm);
}

/**
 * Формирует структуру объектов строительства, шифров РД и контуров испытаний на основании лайнлиста.
 * Все данные по объектам, шифрам РД и названиям линий система изначально берёт из лайнлиста.
 */
export function deriveFacilitiesFromLineList(
  lineList: ProjectLineItem[],
  fallbackMeta: FacilityObject[] = [],
  allowEmpty = false
): FacilityObject[] {
  const objMap = new Map<
    string,
    Map<string, { contours: Set<string>; title: string }>
  >();

  for (const item of lineList || []) {
    if (!item || typeof item !== 'object') continue;
    const objName = String(item.objectName ?? '').trim();
    const rd = String(item.rdCode ?? '').trim();
    const rawContour =
      item.testContour ??
      (item as unknown as Record<string, unknown>).contour ??
      '';
    const contour = String(rawContour).trim();
    if (!objName || !rd) continue;

    let rdMap = objMap.get(objName);
    if (!rdMap) {
      rdMap = new Map();
      objMap.set(objName, rdMap);
    }

    let rdEntry = rdMap.get(rd);
    if (!rdEntry) {
      const metaFacility = fallbackMeta.find((f) => f.name === objName);
      const metaRd = metaFacility?.rdCodes.find((r) => r.code === rd);
      const lineNum = String(item.lineNumber ?? '').trim();
      const lineTitle = String(item.lineName ?? '').trim();
      rdEntry = {
        contours: new Set<string>(),
        title:
          metaRd?.title ||
          (lineTitle ? `Линия ${lineNum} (${lineTitle})` : `Линия ${lineNum}`),
      };
      rdMap.set(rd, rdEntry);
    }

    if (contour) {
      rdEntry.contours.add(contour);
    }
  }

  const result: FacilityObject[] = [];
  let idx = 1;
  for (const [objName, rdMap] of objMap.entries()) {
    const metaFacility = fallbackMeta.find((f) => f.name === objName);
    const isVolkhov = objName.toLowerCase().includes('волхов');
    const rdCodes = Array.from(rdMap.entries()).map(([code, data]) => ({
      code,
      title: data.title,
      contours: Array.from(data.contours),
    }));

    result.push({
      id: metaFacility?.id || `obj-ll-${idx++}`,
      name: objName,
      shortName: metaFacility?.shortName || objName,
      region:
        metaFacility?.region ||
        (isVolkhov ? 'Ленинградская область, г. Волхов' : 'Промышленная площадка'),
      weatherStation:
        metaFacility?.weatherStation ||
        (isVolkhov
          ? 'Метеостанция г. Волхов (№26078)'
          : objName.toLowerCase().includes('бованенк')
          ? 'Метеопункт Бованенково'
          : objName.toLowerCase().includes('заполярн')
          ? 'Метеопункт Тазовский (Заполярное)'
          : `Метеопункт ${metaFacility?.shortName || objName}`),
      latitude: metaFacility?.latitude ?? (isVolkhov ? 59.93 : 68.5),
      longitude: metaFacility?.longitude ?? (isVolkhov ? 32.34 : 72.0),
      weatherArchive: metaFacility?.weatherArchive,
      rdCodes,
    });
  }

  if (allowEmpty) {
    return result;
  }
  return result.length > 0 ? result : fallbackMeta;
}

/**
 * Формирует уникальный перечень объектов и кодов РД на основе массива стыков (fallback при пустом лайнлисте)
 */
export function deriveFacilitiesFromJoints(
  joints: WeldJoint[],
  fallbackMeta: FacilityObject[] = []
): FacilityObject[] {
  const objMap = new Map<string, Set<string>>();

  for (const j of joints) {
    const objName = String(j.objectName ?? '').trim();
    const rd = String(j.rdCode ?? '').trim();
    if (!objName || !rd) continue;

    let rds = objMap.get(objName);
    if (!rds) {
      rds = new Set();
      objMap.set(objName, rds);
    }
    rds.add(rd);
  }

  const result: FacilityObject[] = [];
  let idx = 1;
  for (const [objName, rds] of objMap.entries()) {
    const metaFacility = fallbackMeta.find((f) => f.name === objName);
    result.push({
      id: metaFacility?.id || `obj-j-${idx++}`,
      name: objName,
      shortName: metaFacility?.shortName || objName,
      region: metaFacility?.region || 'Промышленная площадка',
      weatherStation: metaFacility?.weatherStation || `Метеопункт ${objName}`,
      latitude: metaFacility?.latitude ?? 68.5,
      longitude: metaFacility?.longitude ?? 72.0,
      weatherArchive: metaFacility?.weatherArchive,
      rdCodes: Array.from(rds).map((code) => {
        const metaRd = metaFacility?.rdCodes.find((r) => r.code === code);
        return {
          code,
          title: metaRd?.title || `РД ${code}`,
          contours: metaRd?.contours || [],
        };
      }),
    });
  }

  return result.length > 0 ? result : fallbackMeta;
}

/**
 * Проверяет, зафиксирована ли сварка стыка (наличие даты сварки)
 */
export function isJointWelded(
  joint: Pick<WeldJoint, 'weldingDate'>
): boolean {
  return Boolean(joint.weldingDate && joint.weldingDate.trim().length > 0);
}

/**
 * Формирует полное наименование стыка для отчётов и списков (например, "ГСП-1 / 01-100 / Стык 010")
 */
export function formatJointSummary(
  joint: Pick<WeldJoint, 'objectName' | 'rdCode' | 'jointNumber' | 'uniqueLineId'>
): string {
  const parts = [joint.objectName, joint.rdCode, `Стык ${joint.jointNumber}`].filter(Boolean);
  return parts.join(' / ');
}
