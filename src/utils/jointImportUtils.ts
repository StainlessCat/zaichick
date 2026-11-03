import * as XLSX from 'xlsx';
import {
  LRVItem,
  ProjectLineItem,
  TechCardItem,
  WeldJoint,
} from '../types/welding';
import {
  buildUniqueLineId,
  extractRdSuffix,
  formatDateDDMMYY,
  mmToInchDiameter,
  parseDecimalNumber,
} from './weldingLogic';

export interface ParsedJointImportRow {
  rowNumber: number;
  raw: Record<string, unknown>;

  // Извлеченные данные
  rdCode: string;
  lineNumber: string;
  jointNumber: string;
  diameterMm?: number;
  wallThickness?: number;
  lrv1Code: string;
  lrv2Code: string;
  gostJointType: string;

  // Автоматически привязанные данные из других разделов
  uniqueLineId: string;
  objectName: string;
  contour: string;
  matchedLine?: ProjectLineItem;

  matchedLrv1?: LRVItem;
  matchedLrv2?: LRVItem;

  elem1Name: string;
  elem1Material: string;
  elem1Ntd: string;
  elem1Manufacturer: string;
  elem1DiameterMm?: number;
  elem1WallThickness?: number;

  elem2Name: string;
  elem2Material: string;
  elem2Ntd: string;
  elem2Manufacturer: string;
  elem2DiameterMm?: number;
  elem2WallThickness?: number;

  techCardNumber: string;
  weldingType: string;
  weldingMaterials: string;

  // Результаты валидации
  status: 'valid' | 'warning' | 'error';
  errors: string[];
  warnings: string[];

  // Сформированный объект стыка для сохранения в реестр
  jointToImport?: WeldJoint;
}

export interface JointImportParseResult {
  totalRows: number;
  validCount: number;
  warningCount: number;
  errorCount: number;
  rows: ParsedJointImportRow[];
}

/**
 * Нормализует строковые ключи колонок Excel для поиска синонимов
 */
function cleanKey(str: string): string {
  return str.toLowerCase().replace(/[^a-zа-я0-9]/gi, '');
}

/**
 * Извлекает диаметр и толщину стенки (из раздельных или объединенных колонок вроде "219х10" или "159*8.0")
 */
export function extractDiameterAndThickness(
  diamRaw: unknown,
  thickRaw: unknown
): { diameter?: number; thickness?: number } {
  const dStr = String(diamRaw ?? '').replace(',', '.').trim();
  const tStr = String(thickRaw ?? '').replace(',', '.').trim();

  const explicitThick = parseDecimalNumber(tStr);

  if (explicitThick !== undefined) {
    const explicitDiam = parseDecimalNumber(dStr);
    return { diameter: explicitDiam, thickness: explicitThick };
  }

  // Проверяем комбинированное значение в поле диаметра: "219х10", "219x10", "159*8", "89/5", "159 x 8"
  const comboMatch = dStr.match(
    /(\d+(?:\.\d+)?)\s*(?:[хxX*×/]|[\s]+)\s*(\d+(?:\.\d+)?)/
  );
  if (comboMatch) {
    return {
      diameter: parseFloat(comboMatch[1]),
      thickness: parseFloat(comboMatch[2]),
    };
  }

  const singleDiam = parseDecimalNumber(dStr);
  return { diameter: singleDiam, thickness: undefined };
}

/**
 * Нормализует тип сварного соединения по ГОСТ 16037-80 (заменяет латиницу 'C'/'Y' на кириллицу)
 */
export function normalizeGostJointType(rawType: unknown): string {
  if (!rawType) return 'С17';
  let str = String(rawType).trim().toUpperCase();
  // Замена латинских символов на кириллицу
  str = str.replace(/^C/i, 'С').replace(/^Y/i, 'У').replace(/^T/i, 'Т');
  return str || 'С17';
}

/**
 * Парсит массив строк из Excel и осуществляет автопривязку и валидацию
 */
export function parseAndValidateJointsImport(
  rawRows: Record<string, unknown>[],
  projectLineList: ProjectLineItem[],
  lrvCatalog: LRVItem[],
  techCards: TechCardItem[],
  existingJoints: WeldJoint[],
  defaultObjectName = 'УКПГ-2В Бованенковское НГКМ',
  defaultRdCode = ''
): JointImportParseResult {
  const parsedRows: ParsedJointImportRow[] = [];
  const seenLineJointKeys = new Map<string, number>(); // track duplicates in file

  rawRows.forEach((row, idx) => {
    const rowNumber = idx + 2; // Excel row number (1-based, header is row 1)
    const errors: string[] = [];
    const warnings: string[] = [];

    // Поиск значений колонок по синонимам
    let rdCodeVal = '';
    let lineNumVal = '';
    let jointNumVal = '';
    let diamVal: unknown = '';
    let thickVal: unknown = '';
    let lrv1Val = '';
    let lrv2Val = '';
    let lrvComboVal = '';
    let gostTypeVal = '';

    for (const [key, val] of Object.entries(row)) {
      const k = cleanKey(key);
      const strVal = String(val ?? '').trim();

      // Шифр РД
      if (
        k === 'шифррд' ||
        k === 'шифр' ||
        k === 'рд' ||
        k === 'rdcode' ||
        k === 'проект'
      ) {
        rdCodeVal = strVal;
      }
      // Номер линии
      else if (
        k === 'номерлинии' ||
        k === 'линия' ||
        k === 'технологическаялиния' ||
        k === 'linenumber' ||
        k === 'линии'
      ) {
        lineNumVal = strVal;
      }
      // Номер стыка
      else if (
        k === 'номерстыка' ||
        k === 'стык' ||
        k === 'стыка' ||
        k === 'jointnumber' ||
        k === 'номершва' ||
        k === 'шва' ||
        k === 'joint'
      ) {
        jointNumVal = strVal;
      }
      // Диаметр и толщина стенки
      else if (
        k === 'диаметритолщинастенки' ||
        k === 'диаметритолщина' ||
        k === 'типоразмер' ||
        k === 'размер'
      ) {
        diamVal = val;
      } else if (
        k === 'диаметр' ||
        k === 'диаметрмм' ||
        k === 'dn' ||
        k === 'diametermm' ||
        k === 'диам'
      ) {
        diamVal = val;
      } else if (
        k === 'толщинастенки' ||
        k === 'толщина' ||
        k === 'стенка' ||
        k === 'wallthickness' ||
        k === 's' ||
        k === 'толщинастенкимм'
      ) {
        thickVal = val;
      }
      // Коды ЛРВ
      else if (
        k === 'кодлрвэлемент1' ||
        k === 'кодлрв1' ||
        k === 'лрв1' ||
        k === 'элемент1код' ||
        k === 'деталь1' ||
        k === 'lrv1code'
      ) {
        lrv1Val = strVal;
      } else if (
        k === 'кодлрвэлемент2' ||
        k === 'кодлрв2' ||
        k === 'лрв2' ||
        k === 'элемент2код' ||
        k === 'деталь2' ||
        k === 'lrv2code'
      ) {
        lrv2Val = strVal;
      } else if (
        k === 'кодылрв' ||
        k === 'лрв' ||
        k === 'кодлрв' ||
        k === 'элементылрв'
      ) {
        lrvComboVal = strVal;
      }
      // Тип соединения по ГОСТ 16037-80
      else if (
        k === 'типсоединения' ||
        k === 'типпогост16037' ||
        k === 'типгост1603780' ||
        k === 'типгост16037' ||
        k === 'gostjointtype' ||
        k === 'типшва' ||
        k === 'тип'
      ) {
        gostTypeVal = strVal;
      }
    }

    // Если шифр РД не был указан в строке, используем выбранный по умолчанию
    const rdCode = rdCodeVal || defaultRdCode;
    const lineNumber = lineNumVal;
    let jointNumber = jointNumVal;

    // Автоматическое форматирование номера стыка (например 10 -> 010)
    if (jointNumber && /^\d+$/.test(jointNumber)) {
      jointNumber = jointNumber.padStart(3, '0');
    }

    // Разбор ЛРВ при комбинированном поле
    let lrv1Code = lrv1Val;
    let lrv2Code = lrv2Val;
    if (!lrv1Code && !lrv2Code && lrvComboVal) {
      const parts = lrvComboVal
        .split(/[/;,+]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length >= 2) {
        lrv1Code = parts[0];
        lrv2Code = parts[1];
      } else if (parts.length === 1) {
        lrv1Code = parts[0];
        lrv2Code = parts[0];
      }
    }

    // Извлечение диаметров и толщины
    const { diameter, thickness } = extractDiameterAndThickness(
      diamVal,
      thickVal
    );
    const gostJointType = normalizeGostJointType(gostTypeVal);

    // 1. ВАЛИДАЦИЯ ОБЯЗАТЕЛЬНЫХ ПОЛЕЙ
    if (!rdCode) {
      errors.push('Не указан шифр РД');
    }
    if (!lineNumber) {
      errors.push('Не указан номер линии');
    }
    if (!jointNumber) {
      errors.push('Не указан номер стыка');
    }

    // 2. АВТОПРИВЯЗКА К ЛАЙНЛИСТУ
    const uniqueLineId = buildUniqueLineId(rdCode, lineNumber);
    let objectName = defaultObjectName;
    let contour = 'Контур испытаний';
    let matchedLine: ProjectLineItem | undefined;

    if (rdCode && lineNumber) {
      const targetRdSuffix = extractRdSuffix(rdCode).toLowerCase();
      matchedLine = projectLineList.find((l) => {
        const matchesRd =
          l.rdCode.trim().toLowerCase() === rdCode.toLowerCase() ||
          extractRdSuffix(l.rdCode).toLowerCase() === targetRdSuffix;
        const matchesLine =
          l.lineNumber.trim().toLowerCase() === lineNumber.toLowerCase();
        return matchesRd && matchesLine;
      });

      if (matchedLine) {
        objectName = matchedLine.objectName;
        contour = matchedLine.testContour;
      } else {
        errors.push(
          `Линия «${lineNumber}» не найдена в лайнлисте проекта для шифра «${rdCode}». Добавьте линию в раздел «Проект (лайнлист)».`
        );
      }
    }

    // 3. ПРОВЕРКА НА ДУБЛИКАТЫ
    if (rdCode && lineNumber && jointNumber) {
      const lineJointKey = `${uniqueLineId}___${jointNumber.toLowerCase()}`;
      if (seenLineJointKeys.has(lineJointKey)) {
        const prevRow = seenLineJointKeys.get(lineJointKey)!;
        errors.push(
          `Дубликат стыка в файле: стык № ${jointNumber} на линии «${lineNumber}» уже указан в строке ${prevRow}.`
        );
      } else {
        seenLineJointKeys.set(lineJointKey, rowNumber);
      }

      // Проверка на дубликат в существующей базе стыков
      const existsInDb = existingJoints.some(
        (j) =>
          j.uniqueLineId === uniqueLineId &&
          j.jointNumber.toLowerCase() === jointNumber.toLowerCase()
      );
      if (existsInDb) {
        errors.push(
          `Дубликат в базе данных: стык № ${jointNumber} на линии «${lineNumber}» уже зарегистрирован в системе.`
        );
      }
    }

    // 4. АВТОПРИВЯЗКА К КАТАЛОГУ ЛРВ
    let matchedLrv1: LRVItem | undefined;
    let matchedLrv2: LRVItem | undefined;

    let elem1Name = 'Труба бесшовная';
    let elem1Material = '09Г2С';
    let elem1Ntd = 'ГОСТ 8732-78';
    let elem1Manufacturer = '';
    let elem1DiameterMm = diameter || 159;
    let elem1WallThickness = thickness || 8.0;

    let elem2Name = 'Отвод крутоизогнутый 90°';
    let elem2Material = '09Г2С';
    let elem2Ntd = 'ГОСТ 17375-2001';
    let elem2Manufacturer = '';
    let elem2DiameterMm = diameter || 159;
    let elem2WallThickness = thickness || 8.0;

    if (lrv1Code) {
      matchedLrv1 =
        lrvCatalog.find(
          (item) =>
            item.lrvCode.trim().toLowerCase() === lrv1Code.toLowerCase() &&
            (item.rdCode === rdCode ||
              extractRdSuffix(item.rdCode).toLowerCase() ===
                extractRdSuffix(rdCode).toLowerCase())
        ) ||
        lrvCatalog.find(
          (item) => item.lrvCode.trim().toLowerCase() === lrv1Code.toLowerCase()
        );
      if (matchedLrv1) {
        elem1Name = matchedLrv1.shortName;
        elem1Material = matchedLrv1.material;
        elem1Ntd = matchedLrv1.ntd;
        elem1Manufacturer = matchedLrv1.manufacturer || '';
        elem1DiameterMm = matchedLrv1.diameterMm;
        elem1WallThickness = matchedLrv1.wallThickness;
        if (!diameter) elem1DiameterMm = matchedLrv1.diameterMm;
        if (!thickness) elem1WallThickness = matchedLrv1.wallThickness;

        if (
          matchedLrv1.rdCode &&
          rdCode &&
          extractRdSuffix(matchedLrv1.rdCode).toLowerCase() !==
            extractRdSuffix(rdCode).toLowerCase()
        ) {
          warnings.push(
            `Код ЛРВ 1 «${lrv1Code}» принадлежит другому шифру РД (${matchedLrv1.rdCode}).`
          );
        }
      } else {
        warnings.push(`Код ЛРВ 1 «${lrv1Code}» не найден в каталоге ЛРВ.`);
      }
    } else {
      warnings.push('Код ЛРВ для Элемента 1 не указан.');
    }

    if (lrv2Code) {
      matchedLrv2 =
        lrvCatalog.find(
          (item) =>
            item.lrvCode.trim().toLowerCase() === lrv2Code.toLowerCase() &&
            (item.rdCode === rdCode ||
              extractRdSuffix(item.rdCode).toLowerCase() ===
                extractRdSuffix(rdCode).toLowerCase())
        ) ||
        lrvCatalog.find(
          (item) => item.lrvCode.trim().toLowerCase() === lrv2Code.toLowerCase()
        );
      if (matchedLrv2) {
        elem2Name = matchedLrv2.shortName;
        elem2Material = matchedLrv2.material;
        elem2Ntd = matchedLrv2.ntd;
        elem2Manufacturer = matchedLrv2.manufacturer || '';

        // Проверяем второй конец для переходов / тройников
        const useSecondEnd =
          matchedLrv2.diameterMm2 !== undefined &&
          matchedLrv2.diameterMm !== elem1DiameterMm &&
          matchedLrv2.diameterMm2 === elem1DiameterMm;

        elem2DiameterMm = useSecondEnd
          ? matchedLrv2.diameterMm2!
          : matchedLrv2.diameterMm;
        elem2WallThickness = useSecondEnd
          ? matchedLrv2.wallThickness2 ?? matchedLrv2.wallThickness
          : matchedLrv2.wallThickness;

        if (
          matchedLrv2.rdCode &&
          rdCode &&
          extractRdSuffix(matchedLrv2.rdCode).toLowerCase() !==
            extractRdSuffix(rdCode).toLowerCase()
        ) {
          warnings.push(
            `Код ЛРВ 2 «${lrv2Code}» принадлежит другому шифру РД (${matchedLrv2.rdCode}).`
          );
        }
      } else {
        warnings.push(`Код ЛРВ 2 «${lrv2Code}» не найден в каталоге ЛРВ.`);
      }
    } else {
      warnings.push('Код ЛРВ для Элемента 2 не указан.');
    }

    // Проверка соответствия диаметров свариваемых элементов
    if (elem1DiameterMm && elem2DiameterMm && elem1DiameterMm !== elem2DiameterMm) {
      warnings.push(
        `Несовпадение диаметров элементов: Элемент 1 (Ø${elem1DiameterMm} мм) и Элемент 2 (Ø${elem2DiameterMm} мм).`
      );
    }

    // Проверка разнотолщинности свариваемых элементов
    if (
      elem1WallThickness &&
      elem2WallThickness &&
      Math.abs(elem1WallThickness - elem2WallThickness) > 1.5
    ) {
      warnings.push(
        `Разнотолщинность элементов ΔS=${Math.abs(
          elem1WallThickness - elem2WallThickness
        ).toFixed(1)} мм (${elem1WallThickness} и ${elem2WallThickness} мм). Требуется разделка кромок по ГОСТ 16037.`
      );
    }

    // Итоговый диаметр и толщина стыка
    const finalDiameter = diameter || elem1DiameterMm || 159;
    const finalThickness = thickness || elem1WallThickness || 8.0;

    // 5. ПРОВЕРКА ЭКСТРЕМАЛЬНЫХ ГРАНИЦ ГЕОМЕТРИИ (BOUNDARY CHECKS)
    if (finalDiameter < 10 || finalDiameter > 2520) {
      errors.push(
        `Недопустимый диаметр стыка (${finalDiameter} мм). Допустимый диапазон: 10…2520 мм.`
      );
    }
    if (finalThickness < 1.0 || finalThickness > 150.0) {
      errors.push(
        `Недопустимая толщина стенки (${finalThickness} мм). Допустимый диапазон: 1.0…150.0 мм.`
      );
    } else if (finalThickness >= finalDiameter / 2) {
      errors.push(
        `Физически невозможная геометрия трубы: толщина стенки (${finalThickness} мм) ≥ половины наружного диаметра (${
          finalDiameter / 2
        } мм).`
      );
    }

    // 6. АВТОПРИВЯЗКА К ТЕХКАРТЕ (с учетом марки стали, диаметра и толщины)
    const matchedTc =
      techCards.find(
        (tc) =>
          (tc.steelGroup.includes(elem1Material) ||
            tc.title.includes(elem1Material)) &&
          finalDiameter >= tc.minDiameterMm &&
          finalDiameter <= tc.maxDiameterMm &&
          finalThickness >= tc.minWallThicknessMm &&
          finalThickness <= tc.maxWallThicknessMm
      ) ||
      techCards.find(
        (tc) =>
          tc.steelGroup.includes(elem1Material) ||
          tc.title.includes(elem1Material) ||
          tc.number.includes(elem1Material)
      ) ||
      techCards[0];

    if (
      matchedTc &&
      (finalDiameter < matchedTc.minDiameterMm ||
        finalDiameter > matchedTc.maxDiameterMm ||
        finalThickness < matchedTc.minWallThicknessMm ||
        finalThickness > matchedTc.maxWallThicknessMm)
    ) {
      warnings.push(
        `Параметры стыка Ø${finalDiameter}×${finalThickness} мм выходят за диапазон подобранной техкарты ${matchedTc.number} (Ø${matchedTc.minDiameterMm}…${matchedTc.maxDiameterMm} мм, S=${matchedTc.minWallThicknessMm}…${matchedTc.maxWallThicknessMm} мм).`
      );
    }

    const techCardNumber = matchedTc?.number || 'ТК-045-РАД/РД-01';
    const weldingType = matchedTc?.weldingType || 'РАД+РД';
    const weldingMaterials =
      matchedTc?.recommendedMaterials || 'Св-08Г2С Ø2.0 / УОНИ-13/55 Ø3.0';

    // Определение статуса строки
    const status: 'valid' | 'warning' | 'error' =
      errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'valid';

    // Сборка объекта WeldJoint для импорта
    let jointToImport: WeldJoint | undefined;
    if (status !== 'error') {
      const numVal = parseInt(jointNumber, 10);
      const isSupp = !Number.isNaN(numVal) && numVal % 10 !== 0;

      jointToImport = {
        id: `j-imp-${Date.now()}-${rowNumber}-${Math.random()
          .toString(36)
          .slice(2, 7)}`,
        objectName,
        rdCode,
        contour,
        lineNumber,
        uniqueLineId,
        jointNumber,
        jointType: 'Монтажный',
        diameterMm: finalDiameter,
        diameterInch: mmToInchDiameter(finalDiameter),
        wallThickness: finalThickness,
        lrv1Code: lrv1Code || '',
        elem1Name,
        elem1Material,
        elem1Ntd,
        elem1Manufacturer,
        elem1DiameterMm,
        elem1WallThickness,
        elem1FactoryNumber: '',
        elem1Length: '',
        lrv2Code: lrv2Code || '',
        elem2Name,
        elem2Material,
        elem2Ntd,
        elem2Manufacturer,
        elem2DiameterMm,
        elem2WallThickness,
        elem2FactoryNumber: '',
        elem2Length: '',
        weldingType,
        gostJointType,
        weldingPosition: 'В1',
        weldingDate: '',
        welderStamp: '',
        welderStampsList: [],
        brigadeStamp: '',
        weldingMaterials,
        ambientTemp: '',
        preheatTemp: '',
        responsiblePerson: '',
        welderFullName: '',
        welderCertNumber: '',
        techCardNumber,
        vikResult: 'Не проводился',
        vikDate: '',
        vikInspector: '',
        ndtType: 'РК',
        ndtDate: '',
        ndtResult: 'Не проводился',
        ndtInspector: '',
        dupNdtType: 'Не требуется',
        dupNdtDate: '',
        dupNdtResult: 'Не проводился',
        dupNdtInspector: '',
        isSupplementary: isSupp,
        updatedAt: new Date().toISOString(),
        updatedBy: 'Импорт из Excel',
      };
    }

    parsedRows.push({
      rowNumber,
      raw: row,
      rdCode,
      lineNumber,
      jointNumber,
      diameterMm: finalDiameter,
      wallThickness: finalThickness,
      lrv1Code,
      lrv2Code,
      gostJointType,
      uniqueLineId,
      objectName,
      contour,
      matchedLine,
      matchedLrv1,
      matchedLrv2,
      elem1Name,
      elem1Material,
      elem1Ntd,
      elem1Manufacturer,
      elem1DiameterMm,
      elem1WallThickness,
      elem2Name,
      elem2Material,
      elem2Ntd,
      elem2Manufacturer,
      elem2DiameterMm,
      elem2WallThickness,
      techCardNumber,
      weldingType,
      weldingMaterials,
      status,
      errors,
      warnings,
      jointToImport,
    });
  });

  const validCount = parsedRows.filter((r) => r.status === 'valid').length;
  const warningCount = parsedRows.filter((r) => r.status === 'warning').length;
  const errorCount = parsedRows.filter((r) => r.status === 'error').length;

  return {
    totalRows: parsedRows.length,
    validCount,
    warningCount,
    errorCount,
    rows: parsedRows,
  };
}

/**
 * Генерирует и скачивает шаблон Excel (.xlsx) для импорта стыков с образцами данных
 */
export function exportJointsExcelTemplate(
  projectLineList: ProjectLineItem[],
  lrvCatalog: LRVItem[]
): void {
  const line1 = projectLineList[0] || {
    rdCode: '0092.049.Р.13/1 0004 УКПГ.045.0077.001-TX3',
    lineNumber: 'ФП1.2/1',
  };
  const line2 = projectLineList[1] || projectLineList[0] || {
    rdCode: '0092.049.Р.13/1 0004 УКПГ.045.0077.001-TX3',
    lineNumber: 'ГС-104/2',
  };

  const lrv1 = lrvCatalog[0]?.lrvCode || 'ЛРВ-001ТХ3-0412';
  const lrv2 = lrvCatalog[1]?.lrvCode || 'ЛРВ-001ТХ3-0415';
  const lrv3 = lrvCatalog[2]?.lrvCode || 'ЛРВ-001ТХ3-0428';

  const rows = [
    {
      'Шифр РД': line1.rdCode,
      'Номер линии': line1.lineNumber,
      'Номер стыка': '010',
      'Диаметр, мм': 159,
      'Толщина стенки, мм': 8.0,
      'Код ЛРВ 1': lrv1,
      'Код ЛРВ 2': lrv2,
      'Тип соединения (ГОСТ 16037-80)': 'С17',
    },
    {
      'Шифр РД': line1.rdCode,
      'Номер линии': line1.lineNumber,
      'Номер стыка': '020',
      'Диаметр, мм': 159,
      'Толщина стенки, мм': 8.0,
      'Код ЛРВ 1': lrv2,
      'Код ЛРВ 2': lrv3,
      'Тип соединения (ГОСТ 16037-80)': 'С17',
    },
    {
      'Шифр РД': line1.rdCode,
      'Номер линии': line1.lineNumber,
      'Номер стыка': '011',
      'Диаметр, мм': 159,
      'Толщина стенки, мм': 8.0,
      'Код ЛРВ 1': lrv1,
      'Код ЛРВ 2': lrv2,
      'Тип соединения (ГОСТ 16037-80)': 'С17',
    },
    {
      'Шифр РД': line2.rdCode,
      'Номер линии': line2.lineNumber,
      'Номер стыка': '010',
      'Диаметр, мм': 89,
      'Толщина стенки, мм': 5.0,
      'Код ЛРВ 1': lrvCatalog[3]?.lrvCode || '001-TX3-04',
      'Код ЛРВ 2': lrvCatalog[4]?.lrvCode || '001-TX3-05',
      'Тип соединения (ГОСТ 16037-80)': 'У4',
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 38 }, // Шифр РД
    { wch: 16 }, // Номер линии
    { wch: 14 }, // Номер стыка
    { wch: 14 }, // Диаметр, мм
    { wch: 20 }, // Толщина стенки, мм
    { wch: 16 }, // Код ЛРВ 1
    { wch: 16 }, // Код ЛРВ 2
    { wch: 28 }, // Тип соединения
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Шаблон импорта стыков');
  try {
    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ZAYCHICK_Shablon_Import_Stykov.xlsx';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 2500);
  } catch {
    XLSX.writeFile(workbook, 'ZAYCHICK_Shablon_Import_Stykov.xlsx');
  }
}

/**
 * Читает файл Excel (.xlsx, .xls) или CSV в массив JSON объектов
 */
export async function readExcelFileRows(
  file: File
): Promise<Record<string, unknown>[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const worksheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: '',
  });
}
