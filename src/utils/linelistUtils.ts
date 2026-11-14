import {
  AuditLogEntry,
  FacilityObject,
  LRVItem,
  ProjectLineItem,
  WeldJoint,
} from '../types/welding';
import { formatDateDDMMYY, isDateColumnKey, normalizeDateToISO } from './dates';
import {
  detectLrvConnectionType,
  mmToNominalBoreDn,
  resolveLrvItemCategory,
} from './pipeCalc';

/**
 * Извлекает уникальный суффикс из шифра РД.
 * Для классических шифров вида "...045.0077.001-TX3" возвращает "001-TX3".
 * Для шифров с отличающимся префиксом установки/блока включает различающий сегмент, исключая коллизии uniqueLineId.
 */
export function extractRdSuffix(rdCode: string): string {
  const trimmed = rdCode.trim();
  if (!trimmed) return '';
  const lastDotIdx = trimmed.lastIndexOf('.');
  if (lastDotIdx === -1) return trimmed;
  const tail = trimmed.slice(lastDotIdx + 1).trim();
  const prefix = trimmed.slice(0, lastDotIdx).trim();

  // Сохраняем обратную совместимость со стартовыми шифрами "...045.0077.001-TX3" -> "001-TX3"
  if (prefix.endsWith('045.0077') && prefix.includes('0092.049')) {
    return tail;
  }

  // Извлекаем значимый идентификатор книги/блока из префикса, чтобы исключить коллизии разных шифров с одинаковым хвостом
  const tokens = prefix.split(/[.\s/]+/).filter(Boolean);
  const distinctive = tokens
    .filter((t) => !/^(0092|049|Р|13|1|0004|045|0077)$/i.test(t))
    .slice(-2)
    .join('-');

  return distinctive ? `${distinctive}-${tail}` : tail;
}

/**
 * Формирует уникальный идентификатор линии:
 * связка суффикса шифра РД, дефиса и полного номера линии.
 */
export function buildUniqueLineId(rdCode: string, lineNumber: string): string {
  const suffix = extractRdSuffix(rdCode);
  const cleanLine = lineNumber.trim();
  if (!suffix && !cleanLine) return '';
  if (!suffix) return cleanLine;
  if (!cleanLine) return suffix;
  return `${suffix}-${cleanLine}`;
}

/**
 * Предлагает номер следующего стыка на линии.
 * - Для основных стыков: шаг 10 (010, 020, 030, 040...)
 * - Для дополнительных стыков после базового (напр. "010"): 011, 012 и т.д.
 */
export function suggestNextJointNumber(
  existingJointNumbersInLine: string[],
  baseJointForSupplementary?: string
): string {
  const parsedNums = existingJointNumbersInLine
    .map((n) => parseInt(n.replace(/\D/g, ''), 10))
    .filter((n) => !Number.isNaN(n));

  if (baseJointForSupplementary) {
    const baseNum = parseInt(baseJointForSupplementary.replace(/\D/g, ''), 10);
    if (!Number.isNaN(baseNum)) {
      const decadeBase = Math.floor(baseNum / 10) * 10;
      let candidate = decadeBase + 1;
      while (parsedNums.includes(candidate)) {
        candidate += 1;
      }
      return String(candidate).padStart(3, '0');
    }
  }

  if (parsedNums.length === 0) return '010';
  const maxMainDecade = Math.max(...parsedNums.map((n) => Math.floor(n / 10) * 10));
  const nextDecade = maxMainDecade + 10;
  return String(nextDecade).padStart(3, '0');
}

/**
 * Фильтрация каталога ЛРВ по шифру РД.
 * По умолчанию в паспорте стыка запрещено брать материалы из других шифров РД.
 */
export function filterLrvCatalogByRd(
  catalog: LRVItem[],
  rdCode: string,
  allowOtherRdCodes = false
): LRVItem[] {
  if (allowOtherRdCodes) return catalog;
  return catalog.filter((item) => item.rdCode === rdCode);
}

/**
 * Сортировка стыков для Журналов сварочных работ (СТО Газпром 15-1.1-002-2023 и ГОСТ 32569-2013):
 * строго в хронологическом порядке по дате сварки (weldingDate).
 * Стыки без даты сварки помещаются в конец списка.
 */
export function sortJointsChronologically(joints: WeldJoint[]): WeldJoint[] {
  return [...joints].sort((a, b) => {
    const dateA = a.weldingDate ? a.weldingDate.trim() : '';
    const dateB = b.weldingDate ? b.weldingDate.trim() : '';
    if (dateA && !dateB) return -1;
    if (!dateA && dateB) return 1;
    if (dateA !== dateB) {
      return dateA.localeCompare(dateB);
    }
    if (a.uniqueLineId !== b.uniqueLineId) {
      return a.uniqueLineId.localeCompare(b.uniqueLineId, 'ru');
    }
    return a.jointNumber.localeCompare(b.jointNumber, 'ru', { numeric: true });
  });
}

/**
 * Массовое редактирование выбранных стыков (за исключением номера стыка jointNumber!)
 * Возвращает обновлённый массив стыков и массив записей журнала аудита.
 */
export function applyBulkUpdateToJoints(
  joints: WeldJoint[],
  selectedIds: string[],
  patch: Partial<WeldJoint>,
  user: { login: string; fullName: string; role: string },
  fieldLabels: Record<string, string>,
  timestampIso = new Date().toISOString()
): { updatedJoints: WeldJoint[]; auditEntries: AuditLogEntry[] } {
  const selectedSet = new Set(selectedIds);
  const safePatch: Partial<WeldJoint> = { ...patch };
  // Запрещаем массовое изменение номера стыка и уникального ID
  delete safePatch.id;
  delete safePatch.jointNumber;

  const auditEntries: AuditLogEntry[] = [];

  const updatedJoints = joints.map((joint) => {
    if (!selectedSet.has(joint.id)) return joint;

    const nextJoint: WeldJoint = { ...joint };
    let changed = false;

    for (const [key, rawVal] of Object.entries(safePatch)) {
      if (rawVal === undefined) continue;
      const k = key as keyof WeldJoint;
      const prevVal = joint[k];
      if (String(prevVal ?? '') !== String(rawVal ?? '')) {
        (nextJoint as unknown as Record<string, unknown>)[k] = rawVal;
        changed = true;
        const isDate = isDateColumnKey(key);
        const fmtOld = isDate ? formatDateDDMMYY(String(prevVal ?? '')) : String(prevVal ?? '');
        const fmtNew = isDate ? formatDateDDMMYY(String(rawVal ?? '')) : String(rawVal ?? '');
        auditEntries.push({
          id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: timestampIso,
          userLogin: user.login,
          userFullName: user.fullName,
          userRole: user.role,
          jointId: joint.id,
          jointNumber: joint.jointNumber,
          uniqueLineId: joint.uniqueLineId,
          rdCode: joint.rdCode,
          fieldKey: key,
          fieldLabel: fieldLabels[key] || key,
          oldValue: fmtOld || '—',
          newValue: fmtNew || '—',
          operationType: 'bulk_edit',
        });
      }
    }

    if (safePatch.rdCode !== undefined || safePatch.lineNumber !== undefined) {
      nextJoint.uniqueLineId = buildUniqueLineId(nextJoint.rdCode, nextJoint.lineNumber);
    }

    if (changed) {
      nextJoint.updatedAt = timestampIso;
      nextJoint.updatedBy = user.fullName;
    }

    return nextJoint;
  });

  return { updatedJoints, auditEntries };
}

/**
 * Преобразует массив объектов из листа Excel (или CSV/TSV) с аналогичной структурой полей
 * в типизированный список ProjectLineItem[] для раздела «Проект (лайнлист)».
 */
export function parseProjectLineListRecords(
  rows: Record<string, unknown>[],
  defaultObjectName: string,
  defaultRdCode: string
): ProjectLineItem[] {
  const result: ProjectLineItem[] = [];

  const getField = (row: Record<string, unknown>, candidates: string[], fallbackIdx: number): string => {
    const keys = Object.keys(row);
    for (const cand of candidates) {
      const foundKey = keys.find(
        (k) => k.trim().toLowerCase() === cand.toLowerCase() || k.trim().toLowerCase().includes(cand.toLowerCase())
      );
      if (foundKey !== undefined && row[foundKey] !== undefined && row[foundKey] !== null) {
        return String(row[foundKey]).trim();
      }
    }
    if (keys[fallbackIdx] !== undefined && row[keys[fallbackIdx]] !== undefined) {
      return String(row[keys[fallbackIdx]]).trim();
    }
    return '';
  };

  const parsePercent = (val: string, defaultVal = 100): number => {
    if (!val) return defaultVal;
    const cleaned = val.replace('%', '').replace(',', '.').trim();
    const num = Number(cleaned);
    if (Number.isNaN(num)) return defaultVal;
    return Math.min(100, Math.max(0, num));
  };

  rows.forEach((row, idx) => {
    const objectName =
      getField(row, ['название объекта', 'наименование объекта', 'объект'], 0) ||
      defaultObjectName;
    const rdCode =
      getField(row, ['шифр рд', 'шифр рабочей документации', 'шифр'], 1) ||
      defaultRdCode;
    const lineNumber = getField(row, ['номер линии', 'линия №', 'обозначение линии'], 2);
    const lineName = getField(row, ['наименование линии', 'название линии'], 3);

    // Пропускаем полностью пустые строки или строки-заголовки
    if (
      (!lineNumber && !lineName) ||
      lineNumber.toLowerCase() === 'номер линии'
    ) {
      return;
    }

    const product = getField(row, ['продукт', 'среда', 'рабочая среда'], 4) || 'Природный газ';
    const testContour = getField(row, ['контур испытания', 'контур'], 5) || 'Контур КИ-1';
    const weldingNtd =
      getField(row, ['нтд на сварку', 'нтд сварка'], 6) || 'СТО Газпром 15-1.1-002-2023';
    const controlNtd =
      getField(row, ['нтд на контроль', 'нтд контроль', 'нтд нк'], 7) ||
      'СТО Газпром 15-1.3-004-2023';
    const qualityLevel = getField(row, ['уровень качества', 'уровень'], 8);
    const pipelineCategory = getField(
      row,
      ['категория трубопровода', 'категория'],
      9
    );
    const workingPressure =
      getField(row, ['рабочее давление', 'давление'], 10) || '11.8 МПа';
    const workingTemperature =
      getField(row, ['температура', 'рабочая температура'], 11) || '-20...+60 °C';
    const rkPercent = parsePercent(
      getField(row, ['процент контроля рк', 'рк, %', 'контроль рк'], 12),
      100
    );
    const uzkPercent = parsePercent(
      getField(row, ['процент контроля узк', 'узк, %', 'контроль узк'], 13),
      100
    );
    const pvkPercent = parsePercent(
      getField(row, ['процент контроля пвк', 'пвк, %', 'контроль пвк'], 14),
      0
    );
    const manualStatus = getField(row, ['статус', 'готовность'], 15);
    const rawTestDate = getField(row, ['дата испытания', 'испытание'], 16);
    const testDate = normalizeDateToISO(rawTestDate) || rawTestDate;

    const finalLineNumber = lineNumber || `Л-${idx + 1}`;

    result.push({
      id: `ll-imp-${Date.now()}-${idx}`,
      objectName,
      rdCode,
      lineNumber: finalLineNumber,
      uniqueLineId: buildUniqueLineId(rdCode, finalLineNumber),
      lineName: lineName || `Технологическая линия ${finalLineNumber}`,
      product,
      testContour,
      weldingNtd,
      controlNtd,
      qualityLevel,
      pipelineCategory,
      workingPressure,
      workingTemperature,
      rkPercent,
      uzkPercent,
      pvkPercent,
      manualStatus: manualStatus || undefined,
      testDate,
    });
  });

  return result;
}

/**
 * Преобразует массив объектов из подготовленного файла Excel (.xlsx / .xls / .csv)
 * в типизированный список LRVItem[] для раздела «Каталог ЛРВ и спецификации».
 */
export function parseLrvCatalogRecords(
  rows: Record<string, unknown>[],
  defaultObjectName: string,
  defaultRdCode: string,
  existingCodes?: Set<string>
): LRVItem[] {
  const result: LRVItem[] = [];
  const seenCodes = new Set<string>(
    existingCodes
      ? Array.from(existingCodes).map((c) => c.trim().toLowerCase())
      : []
  );

  const getField = (
    row: Record<string, unknown>,
    candidates: string[],
    fallbackIdx?: number
  ): string => {
    const keys = Object.keys(row);
    for (const cand of candidates) {
      const foundKey = keys.find(
        (k) =>
          k.trim().toLowerCase() === cand.toLowerCase() ||
          k.trim().toLowerCase().includes(cand.toLowerCase())
      );
      if (
        foundKey !== undefined &&
        row[foundKey] !== undefined &&
        row[foundKey] !== null
      ) {
        return String(row[foundKey]).trim();
      }
    }
    if (
      fallbackIdx !== undefined &&
      keys[fallbackIdx] !== undefined &&
      row[keys[fallbackIdx]] !== undefined
    ) {
      return String(row[keys[fallbackIdx]]).trim();
    }
    return '';
  };

  const parseNum = (val: string): number | undefined => {
    if (!val) return undefined;
    const cleaned = val
      .replace(/[^\d.,-]/g, '')
      .replace(',', '.')
      .trim();
    if (!cleaned) return undefined;
    const num = Number(cleaned);
    return Number.isNaN(num) || num <= 0 ? undefined : num;
  };

  rows.forEach((row, idx) => {
    const rawCode = getField(
      row,
      ['код лрв', 'lrv', 'шифр лрв', 'код материала', 'код'],
      0
    );
    const shortName = getField(
      row,
      [
        'краткое наименование',
        'наименование',
        'элемент',
        'деталь',
        'материал/деталь',
      ],
      2
    );

    if (
      (!rawCode && !shortName) ||
      rawCode.toLowerCase() === 'код лрв' ||
      shortName.toLowerCase() === 'краткое наименование'
    ) {
      return;
    }

    const finalCode = rawCode || `ЛРВ-XLS-${Date.now()}-${idx + 1}`;
    if (seenCodes.has(finalCode.toLowerCase())) {
      return;
    }
    seenCodes.add(finalCode.toLowerCase());

    const rdCode =
      getField(row, ['шифр рд', 'шифр рабочей документации', 'рд'], 1) ||
      defaultRdCode ||
      'НОВЫЙ-ШИФР-РД';
    const objectName =
      getField(row, ['объект', 'название объекта', 'наименование объекта']) ||
      defaultObjectName ||
      'Новый объект';
    const material =
      getField(
        row,
        ['материал (сталь)', 'марка стали', 'материал', 'сталь'],
        3
      ).replace(/^ст\.?\s*/i, '') || '09Г2С';
    const ntd =
      getField(row, ['нтд (гост / ту)', 'нтд', 'гост', 'ту', 'стандарт'], 4) ||
      'ГОСТ 17375-2001';
    const manufacturer =
      getField(
        row,
        ['завод-изготовитель', 'завод', 'изготовитель', 'производитель'],
        5
      ) || undefined;

    const dualMatch = shortName.match(
      /(\d+)[xх×](\d+(?:[.,]\d+)?)\s*-\s*(\d+)[xх×](\d+(?:[.,]\d+)?)/i
    );
    const singleMatch = shortName.match(/(\d+)[xх×](\d+(?:[.,]\d+)?)/i);

    const rawDn1 = parseNum(
      getField(row, ['условный проход dn 1', 'dn 1', 'dn1', 'ду 1', 'ду1'])
    );
    const rawD1 =
      parseNum(
        getField(
          row,
          ['диаметр ø1, мм', 'диаметр 1', 'диаметр, мм', 'ø1', 'd1', 'д1'],
          6
        )
      ) ??
      (dualMatch
        ? Number(dualMatch[1])
        : singleMatch
        ? Number(singleMatch[1])
        : 159);
    const rawS1 =
      parseNum(
        getField(
          row,
          [
            'толщина стенки s1, мм',
            'толщина s1',
            'толщина 1',
            'толщина стенки, мм',
            's1',
          ],
          7
        )
      ) ??
      (dualMatch
        ? Number(dualMatch[2].replace(',', '.'))
        : singleMatch
        ? Number(singleMatch[2].replace(',', '.'))
        : 8);

    const safeD1 = rawD1 >= 10 && rawD1 <= 2520 ? rawD1 : 159;
    const safeS1 = rawS1 >= 1 && rawS1 < safeD1 / 2 ? rawS1 : 8;
    const dn1 = rawDn1 ?? mmToNominalBoreDn(safeD1);

    const rawDn2 = parseNum(
      getField(row, ['условный проход dn 2', 'dn 2', 'dn2', 'ду 2', 'ду2'])
    );
    const rawD2 =
      parseNum(
        getField(row, ['диаметр ø2, мм', 'диаметр 2', 'ø2', 'd2', 'д2'])
      ) ?? (dualMatch ? Number(dualMatch[3]) : undefined);
    const rawS2 =
      parseNum(
        getField(
          row,
          ['толщина стенки s2, мм', 'толщина s2', 'толщина 2', 's2']
        )
      ) ?? (dualMatch ? Number(dualMatch[4].replace(',', '.')) : undefined);

    const safeD2 =
      rawD2 !== undefined && rawD2 >= 10 && rawD2 <= 2520 ? rawD2 : undefined;
    const safeS2 =
      safeD2 !== undefined &&
      rawS2 !== undefined &&
      rawS2 >= 1 &&
      rawS2 < safeD2 / 2
        ? rawS2
        : undefined;
    const dn2 =
      safeD2 !== undefined ? rawDn2 ?? mmToNominalBoreDn(safeD2) : undefined;

    const rawQtyStr = getField(
      row,
      ['кол-во по спец.', 'кол-во', 'количество', 'объем']
    );
    const specQty = parseNum(rawQtyStr) ?? 10;
    const rawUnit = getField(row, ['ед. изм.', 'ед.', 'единица']);
    const unit: 'шт' | 'м' =
      rawUnit.toLowerCase().includes('м') || rawQtyStr.toLowerCase().includes('м')
        ? 'м'
        : 'шт';

    const rawCategory = getField(row, [
      'категория элемента',
      'категория',
      'тип элемента',
      'тип детали',
      'вид элемента',
    ]);
    const rawConnectionType = getField(row, [
      'тип подсоединения',
      'тип присоединения',
      'подсоединение',
      'присоединение',
      'тип соединения',
    ]);

    const itemCategory = resolveLrvItemCategory({
      shortName,
      category: rawCategory,
    });
    const connectionType =
      itemCategory === 'ЗРА'
        ? detectLrvConnectionType(shortName, rawConnectionType)
        : undefined;

    result.push({
      id: `lrv-xls-${Date.now()}-${idx}`,
      lrvCode: finalCode,
      rdCode,
      objectName,
      shortName: shortName || 'Деталь трубопровода',
      category: itemCategory,
      connectionType,
      material,
      ntd,
      manufacturer,
      dn1,
      diameterMm: safeD1,
      wallThickness: safeS1,
      dn2,
      diameterMm2: safeD2,
      wallThickness2: safeS2,
      specQty,
      unit,
    });
  });

  return result;
}

/**
 * Формирует структуру объектов, шифров РД и контуров испытания строго на основании лайнлиста.
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
 * Групповое редактирование выбранных строк лайнлиста (за исключением индивидуального номера линии).
 * При изменении Шифра РД автоматически пересчитывает uniqueLineId.
 */
export function applyBulkUpdateToLineList(
  lineList: ProjectLineItem[],
  selectedIds: string[],
  patch: Partial<ProjectLineItem>
): ProjectLineItem[] {
  const selectedSet = new Set(selectedIds);
  const safePatch: Partial<ProjectLineItem> = { ...patch };
  delete safePatch.id;
  delete safePatch.lineNumber;
  delete safePatch.uniqueLineId;

  return lineList.map((item) => {
    if (!selectedSet.has(item.id)) return item;
    const nextItem: ProjectLineItem = {
      ...item,
      ...safePatch,
    };
    nextItem.uniqueLineId = buildUniqueLineId(nextItem.rdCode, nextItem.lineNumber);
    return nextItem;
  });
}
