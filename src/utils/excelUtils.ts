import type * as XLSXType from 'xlsx';

let cachedXlsx: typeof XLSXType | null = null;
async function getXlsx(): Promise<typeof XLSXType> {
  if (cachedXlsx) return cachedXlsx;
  cachedXlsx = await import('xlsx');
  return cachedXlsx;
}

import {
  JournalStandard,
  LRVItem,
  ProjectLineItem,
  WeldingMaterialCertificate,
  WeldJoint,
} from '../types/welding';
import {
  ALL_COLUMNS,
  computeLineListItemStatus,
  formatDateDDMMYY,
  formatGost32569JournalRow,
  formatStoGazpromJournalRow,
  getJointEquivDiaInch,
  getLrvItemDn1,
  getLrvItemDn2,
  GOST_32569_2013_JOURNAL_COLUMNS,
  isDateColumnKey,
  parseLrvCatalogRecords,
  parseProjectLineListRecords,
  resolveLrvConnectionType,
  resolveLrvItemCategory,
  STO_GAZPROM_15_1_1_002_2023_COLUMNS,
} from './weldingLogic';

export function triggerBlobDownload(blob: Blob, filename: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 2500);
}

export async function saveWorkbookFile(
  workbook: any,
  filename: string
): Promise<void> {
  const XLSX = await getXlsx();
  try {
    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    triggerBlobDownload(blob, filename);
  } catch {
    XLSX.writeFile(workbook, filename);
  }
}

/**
 * Экспорт всех данных таблицы сварных стыков в формат .XLSX или .CSV (вызывается из меню-бутерброда)
 */
export async function exportAllJointsToFile(
  joints: WeldJoint[],
  format: 'xlsx' | 'csv'
): Promise<void> {
  const dateStamp = formatDateDDMMYY(new Date().toISOString().slice(0, 10));

  if (format === 'xlsx') {
    const XLSX = await getXlsx();
    const rows = joints.map((joint) => {
      const record: Record<string, string | number> = {};
      for (const col of ALL_COLUMNS) {
        const raw =
          col.key === 'equivDiameterInch'
            ? getJointEquivDiaInch(joint)
            : joint[col.key];
        const strVal = String(raw ?? '');
        record[col.label] = isDateColumnKey(col.key)
          ? formatDateDDMMYY(strVal)
          : raw ?? '';
      }
      return record;
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = ALL_COLUMNS.map((c) => ({
      wch: Math.max(14, Math.round(c.minWidth / 7)),
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Реестр стыков');
    await saveWorkbookFile(workbook, `ZAYCHICK_Reestr_Stykov_${dateStamp}.xlsx`);
    return;
  }

  // Экспорт в CSV с разделителем ";" и BOM для корректного открытия в русскоязычном Excel
  const headers = ALL_COLUMNS.map((c) => c.label);
  const csvRows = joints.map((joint) =>
    ALL_COLUMNS.map((col) => {
      const raw =
        col.key === 'equivDiameterInch'
          ? getJointEquivDiaInch(joint)
          : joint[col.key];
      const strVal = String(raw ?? '');
      const formatted = isDateColumnKey(col.key) ? formatDateDDMMYY(strVal) : strVal;
      return `"${formatted.replace(/"/g, '""')}"`;
    }).join(';')
  );

  const csvContent = '\uFEFF' + [headers.join(';'), ...csvRows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerBlobDownload(blob, `ZAYCHICK_Reestr_Stykov_${dateStamp}.csv`);
}

/**
 * Экспорт нормативных журналов сварочных работ (СТО Газпром 15-1.1-002-2023 — 49 граф, ГОСТ 32569-2013 — 17 граф) в книгу .XLSX
 */
export async function exportWeldingJournalToExcel(
  joints: WeldJoint[],
  standard: JournalStandard,
  materials: WeldingMaterialCertificate[] = [],
  lrvCatalog: LRVItem[] = []
): Promise<void> {
  const XLSX = await getXlsx();
  const dateStamp = formatDateDDMMYY(new Date().toISOString().slice(0, 10));

  const isGost = standard === 'ГОСТ 32569-2013';
  const headers = isGost
    ? GOST_32569_2013_JOURNAL_COLUMNS.map((c) => c.label)
    : STO_GAZPROM_15_1_1_002_2023_COLUMNS.map((c) => c.fullLabel);

  const colNumbers = isGost
    ? GOST_32569_2013_JOURNAL_COLUMNS.map((_, idx) => String(idx + 1))
    : STO_GAZPROM_15_1_1_002_2023_COLUMNS.map((_, idx) => String(idx + 1));

  const dataRows = joints.map((j, idx) =>
    isGost
      ? formatGost32569JournalRow(j, idx, materials, lrvCatalog).cells
      : formatStoGazpromJournalRow(j, idx, lrvCatalog).cells
  );

  const aoa: string[][] = [headers, colNumbers, ...dataRows];
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);

  worksheet['!cols'] = isGost
    ? GOST_32569_2013_JOURNAL_COLUMNS.map((c) => ({
        wch: Math.max(14, Math.round(c.minWidth / 6)),
      }))
    : STO_GAZPROM_15_1_1_002_2023_COLUMNS.map((c) => ({
        wch: Math.max(12, Math.round(c.minWidth / 6)),
      }));

  const workbook = XLSX.utils.book_new();
  const sheetName = isGost ? 'Журнал ГОСТ 32569' : 'Журнал СТО Газпром';
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  await saveWorkbookFile(
    workbook,
    `Журнал_сварки_${standard.replace(/\s+/g, '_')}_${dateStamp}.xlsx`
  );
}

/**
 * Экспорт раздела «Проект (лайнлист)» или шаблона Excel с 16 полями
 */
export async function exportProjectLineListToExcel(
  items: ProjectLineItem[],
  allJoints: WeldJoint[],
  isTemplate = false
): Promise<void> {
  const XLSX = await getXlsx();
  const dateStamp = formatDateDDMMYY(new Date().toISOString().slice(0, 10));

  const sourceItems: ProjectLineItem[] = isTemplate
    ? [
        {
          id: 'tpl-1',
          objectName: 'УКПГ-2В Бованенковское НГКМ',
          rdCode: '0092.049.Р.13/1 0004 УКПГ.045.0077.001-TX3',
          lineNumber: 'ТХ-108/1',
          uniqueLineId: '001-TX3-ТХ-108/1',
          lineName: 'Линия отвода нестабильного конденсата от С-102',
          product: 'Конденсат газовый нестабильный',
          testContour: 'Контур ВД сепарации КВД-1',
          weldingNtd: 'СТО Газпром 15-1.1-002-2023',
          controlNtd: 'СТО Газпром 15-1.3-004-2023',
          qualityLevel: 'Уровень А',
          pipelineCategory: 'I (В)',
          workingPressure: '12.5 МПа',
          workingTemperature: '-40...+50 °C',
          rkPercent: 100,
          uzkPercent: 100,
          pvkPercent: 0,
          manualStatus: 'В работе',
          testDate: '2026-11-05',
        },
        {
          id: 'tpl-2',
          objectName: 'УКПГ-2В Бованенковское НГКМ',
          rdCode: '0092.049.Р.13/1 0004 УКПГ.045.0077.002-TX1',
          lineNumber: 'ДРК-204/2',
          uniqueLineId: '002-TX1-ДРК-204/2',
          lineName: 'Коллектор закрытого дренажа разделителей Р-201',
          product: 'Газоконденсатная смесь + ВМР',
          testContour: 'Контур дренажа конденсата КДК-1',
          weldingNtd: 'ГОСТ 32569-2013',
          controlNtd: 'ГОСТ 32569-2013',
          qualityLevel: 'Уровень В',
          pipelineCategory: 'II (Б(а))',
          workingPressure: '6.3 МПа',
          workingTemperature: '-45...+40 °C',
          rkPercent: 100,
          uzkPercent: 50,
          pvkPercent: 100,
          manualStatus: 'Все стыки сварены и проконтролированы',
          testDate: '2026-11-08',
        },
      ]
    : items;

  const rows = sourceItems.map((item) => {
    const status = computeLineListItemStatus(item, allJoints);
    return {
      'Название объекта': item.objectName,
      'Шифр РД': item.rdCode,
      'Номер линии': item.lineNumber,
      'Наименование линии': item.lineName,
      Продукт: item.product,
      'Контур испытания': item.testContour,
      'НТД на сварку': item.weldingNtd,
      'НТД на контроль': item.controlNtd,
      'Уровень качества': item.qualityLevel,
      'Категория трубопровода': item.pipelineCategory,
      'Рабочее давление': item.workingPressure,
      Температура: item.workingTemperature,
      'Процент контроля РК': item.rkPercent,
      'Процент контроля УЗК': item.uzkPercent,
      'Процент контроля ПВК': item.pvkPercent,
      Статус: status.statusLabel,
      'Дата испытания': formatDateDDMMYY(item.testDate),
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 28 },
    { wch: 38 },
    { wch: 14 },
    { wch: 36 },
    { wch: 22 },
    { wch: 26 },
    { wch: 26 },
    { wch: 26 },
    { wch: 18 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 36 },
    { wch: 15 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Проект (лайнлист)');
  await saveWorkbookFile(
    workbook,
    isTemplate
      ? `ZAYCHICK_Shablon_LineList.xlsx`
      : `ZAYCHICK_Project_LineList_${dateStamp}.xlsx`
  );
}

/**
 * Чтение и парсинг загруженного файла Excel (.xlsx, .xls, .csv) с аналогичной структурой 16 полей
 */
export async function readProjectLineListFromExcelFile(
  file: File,
  defaultObjectName: string,
  defaultRdCode: string
): Promise<ProjectLineItem[]> {
  const XLSX = await getXlsx();
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const worksheet = workbook.Sheets[firstSheetName];
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: '',
  });
  return parseProjectLineListRecords(jsonRows, defaultObjectName, defaultRdCode);
}

/**
 * Экспорт каталога ЛРВ или подготовленного шаблона Excel (.xlsx)
 */
export async function exportLrvCatalogToExcel(
  items: LRVItem[],
  isTemplate = false
): Promise<void> {
  const XLSX = await getXlsx();
  const dateStamp = formatDateDDMMYY(new Date().toISOString().slice(0, 10));

  const sourceItems: LRVItem[] = isTemplate
    ? [
        {
          id: 'tpl-lrv-1',
          lrvCode: 'ЛРВ-001ТХ3-0601',
          rdCode: '0092.049.Р.13/1 0004 УКПГ.045.0077.001-ТХ3',
          objectName: 'УКПГ-2В Бованенковское НГКМ',
          shortName: 'Труба электросварная 159х8',
          material: '09Г2С',
          ntd: 'ГОСТ 10704-91',
          manufacturer: 'ПАО «ЧТПЗ»',
          dn1: 150,
          diameterMm: 159,
          wallThickness: 8,
          specQty: 120,
          unit: 'м',
        },
        {
          id: 'tpl-lrv-2',
          lrvCode: 'ЛРВ-001ТХ3-0602',
          rdCode: '0092.049.Р.13/1 0004 УКПГ.045.0077.001-ТХ3',
          objectName: 'УКПГ-2В Бованенковское НГКМ',
          shortName: 'Переход К 219х10-159х8',
          material: '09Г2С',
          ntd: 'ГОСТ 17378-2001',
          manufacturer: 'АО «Трубодеталь»',
          dn1: 200,
          diameterMm: 219,
          wallThickness: 10,
          dn2: 150,
          diameterMm2: 159,
          wallThickness2: 8,
          specQty: 14,
          unit: 'шт',
        },
      ]
    : items;

  const rows = sourceItems.map((item) => {
    const dn1Val = getLrvItemDn1(item);
    const dn2Val = getLrvItemDn2(item);
    return {
      'Код ЛРВ': item.lrvCode,
      'Шифр РД': item.rdCode,
      Объект: item.objectName,
      'Краткое наименование': item.shortName,
      Категория: item.category || resolveLrvItemCategory(item),
      'Тип подсоединения':
        item.connectionType ||
        (resolveLrvItemCategory(item) === 'ЗРА'
          ? resolveLrvConnectionType(item)
          : ''),
      'Материал (Сталь)': item.material,
      'НТД (ГОСТ / ТУ)': item.ntd,
      'Завод-изготовитель': item.manufacturer || '',
      'Условный проход DN 1': dn1Val !== undefined ? dn1Val : '',
      'Диаметр Ø1, мм': item.diameterMm,
      'Толщина стенки S1, мм': item.wallThickness,
      'Условный проход DN 2': dn2Val !== undefined ? dn2Val : '',
      'Диаметр Ø2, мм': item.diameterMm2 !== undefined ? item.diameterMm2 : '',
      'Толщина стенки S2, мм':
        item.wallThickness2 !== undefined ? item.wallThickness2 : '',
      'Кол-во по спец.': item.specQty,
      'Ед. изм.': item.unit,
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 22 },
    { wch: 38 },
    { wch: 28 },
    { wch: 34 },
    { wch: 16 },
    { wch: 22 },
    { wch: 22 },
    { wch: 18 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 16 },
    { wch: 18 },
    { wch: 14 },
    { wch: 10 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Каталог ЛРВ');
  await saveWorkbookFile(
    workbook,
    isTemplate
      ? `ZAYCHICK_Shablon_LRV.xlsx`
      : `ZAYCHICK_Katalog_LRV_${dateStamp}.xlsx`
  );
}

/**
 * Чтение и парсинг подготовленного файла Excel (.xlsx, .xls, .csv) для раздела «Каталог ЛРВ»
 */
export async function readLrvCatalogFromExcelFile(
  file: File,
  defaultObjectName: string,
  defaultRdCode: string,
  existingCodes?: Set<string>
): Promise<LRVItem[]> {
  const XLSX = await getXlsx();
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const worksheet = workbook.Sheets[firstSheetName];
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: '',
  });
  return parseLrvCatalogRecords(
    jsonRows,
    defaultObjectName,
    defaultRdCode,
    existingCodes
  );
}
