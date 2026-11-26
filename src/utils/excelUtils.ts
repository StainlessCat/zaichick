import { zaychickApi } from '../api';
import {
  JournalStandard,
  LRVItem,
  ProjectLineItem,
  ReadinessGroupCondition,
  WeldingMaterialCertificate,
  WeldJoint,
} from '../types/welding';
import {
  ALL_COLUMNS,
  formatDateDDMMYY,
  getJointEquivDiaInch,
  isDateColumnKey,
  parseLrvCatalogRecords,
  parseProjectLineListRecords,
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

/**
 * Экспорт всех данных таблицы сварных стыков в формат .XLSX (серверный openpyxl) или .CSV
 */
export async function exportAllJointsToFile(
  joints: WeldJoint[],
  format: 'xlsx' | 'csv',
  options?: {
    isDraftUnsynced?: boolean;
    unsyncedCount?: number;
    isDraftIncomplete?: boolean;
    missingCount?: number;
    rdCode?: string;
    uniqueLineId?: string;
  }
): Promise<void> {
  const dateStamp = formatDateDDMMYY(new Date().toISOString().slice(0, 10));

  if (format === 'xlsx') {
    const { blob, filename } = await zaychickApi.downloadJointsXlsx({
      rdCode: options?.rdCode,
      uniqueLineId: options?.uniqueLineId,
    });
    const prefix = options?.isDraftUnsynced ? 'ЧЕРНОВИК_НЕ_СИНХРОНИЗИРОВАНО_' : '';
    triggerBlobDownload(blob, `${prefix}${filename}`);
    return;
  }

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
  const csvPrefix = options?.isDraftUnsynced ? 'ЧЕРНОВИК_НЕ_СИНХРОНИЗИРОВАНО_' : '';
  triggerBlobDownload(blob, `${csvPrefix}ZAYCHICK_Reestr_Stykov_${dateStamp}.csv`);
}

/**
 * Экспорт нормативных журналов сварочных работ через серверный openpyxl
 * (СТО Газпром 15-1.1-002-2023 — 49 граф, ГОСТ 32569-2013 — 17 граф)
 */
export async function exportWeldingJournalToExcel(
  _joints: WeldJoint[],
  standard: JournalStandard,
  _materials: WeldingMaterialCertificate[] = [],
  _lrvCatalog: LRVItem[] = [],
  options?: {
    isDraftUnsynced?: boolean;
    unsyncedCount?: number;
    isDraftIncomplete?: boolean;
    missingCount?: number;
    rdCode?: string;
    uniqueLineId?: string;
    strict?: boolean;
  }
): Promise<void> {
  const { blob, filename } = await zaychickApi.downloadJournalXlsx({
    standard,
    rdCode: options?.rdCode,
    uniqueLineId: options?.uniqueLineId,
    strict: options?.strict,
  });
  const jPrefix = options?.isDraftUnsynced
    ? 'ЧЕРНОВИК_НЕ_СИНХРОНИЗИРОВАНО_'
    : options?.isDraftIncomplete
      ? 'ЧЕРНОВИК_НЕПОЛНЫЕ_РЕКВИЗИТЫ_'
      : '';
  triggerBlobDownload(blob, `${jPrefix}${filename}`);
}

export async function exportReadinessReportToExcel(
  condition: ReadinessGroupCondition,
  rdCode?: string,
  facilityId?: string,
  dateFrom?: string,
  dateTo?: string
): Promise<void> {
  const { blob, filename } = await zaychickApi.downloadReadinessXlsx({
    condition,
    rdCode,
    facilityId,
    dateFrom,
    dateTo,
  });
  triggerBlobDownload(blob, filename);
}

function escapeXml(val: unknown): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildSpreadsheetMlSheet(
  name: string,
  headers: string[],
  rows: Array<Array<string | number>>
): string {
  const safeName = escapeXml(name.slice(0, 31));
  const headerXml = `<Row>${headers
    .map(
      (h) =>
        `<Cell ss:StyleID="hdr"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`
    )
    .join('')}</Row>`;
  const rowsXml = rows
    .map(
      (row) =>
        `<Row>${row
          .map((cell) => {
            const isNum = typeof cell === 'number' && Number.isFinite(cell);
            return `<Cell><Data ss:Type="${isNum ? 'Number' : 'String'}">${escapeXml(cell)}</Data></Cell>`;
          })
          .join('')}</Row>`
    )
    .join('');
  return `<Worksheet ss:Name="${safeName}"><Table>${headerXml}${rowsXml}</Table></Worksheet>`;
}

/**
 * Локальная многолистовая выгрузка в Excel (SpreadsheetML .xls) при работе без подключения к серверу.
 */
export function exportReadinessOfflineExcel(params: {
  fileName: string;
  sheets: Array<{
    name: string;
    headers: string[];
    rows: Array<Array<string | number>>;
  }>;
}): void {
  const sheetsXml = params.sheets
    .map((s) => buildSpreadsheetMlSheet(s.name, s.headers, s.rows))
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="hdr">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1E3799" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 ${sheetsXml}
</Workbook>`;
  const blob = new Blob([xml], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  });
  triggerBlobDownload(blob, params.fileName);
}

/**
 * Экспорт раздела «Проект (лайнлист)» или шаблона Excel через серверный openpyxl
 */
export async function exportProjectLineListToExcel(
  _items: ProjectLineItem[],
  _allJoints: WeldJoint[],
  isTemplate = false,
  rdCode?: string
): Promise<void> {
  const { blob, filename } = await zaychickApi.downloadLineListXlsx(isTemplate, rdCode);
  triggerBlobDownload(blob, filename);
}

export function parseCsvTextToRows(text: string): Record<string, unknown>[] {
  const cleaned = text.replace(/^\uFEFF/, '');
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const delimiter = lines[0].includes(';') ? ';' : ',';
  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };
  const headers = splitLine(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = splitLine(line);
    const rec: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      if (h) rec[h] = vals[idx] ?? '';
    });
    return rec;
  });
}

export async function parseSpreadsheetFile(file: File): Promise<Record<string, unknown>[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.csv')) {
    try {
      return await zaychickApi.parseSpreadsheet(file);
    } catch {
      const text = await file.text();
      return parseCsvTextToRows(text);
    }
  }
  return zaychickApi.parseSpreadsheet(file);
}

/**
 * Чтение и парсинг загруженного файла Excel (.xlsx, .csv) для раздела «Проект (лайнлист)»
 */
export async function readProjectLineListFromExcelFile(
  file: File,
  defaultObjectName: string,
  defaultRdCode: string
): Promise<ProjectLineItem[]> {
  const jsonRows = await parseSpreadsheetFile(file);
  return parseProjectLineListRecords(jsonRows, defaultObjectName, defaultRdCode);
}

/**
 * Экспорт каталога ЛРВ или подготовленного шаблона Excel (.xlsx) через серверный openpyxl
 */
export async function exportLrvCatalogToExcel(
  _items: LRVItem[],
  isTemplate = false,
  rdCode?: string
): Promise<void> {
  const { blob, filename } = await zaychickApi.downloadLrvXlsx(isTemplate, rdCode);
  triggerBlobDownload(blob, filename);
}

/**
 * Чтение и парсинг подготовленного файла Excel (.xlsx, .csv) для раздела «Каталог ЛРВ»
 */
export async function readLrvCatalogFromExcelFile(
  file: File,
  defaultObjectName: string,
  defaultRdCode: string,
  existingCodes?: Set<string>
): Promise<LRVItem[]> {
  const jsonRows = await parseSpreadsheetFile(file);
  return parseLrvCatalogRecords(
    jsonRows,
    defaultObjectName,
    defaultRdCode,
    existingCodes
  );
}
