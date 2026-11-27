import { zaychickApi } from '../api';
import {
  ColumnDefinition,
  JournalStandard,
  LRVItem,
  NdtLabRequest,
  ProjectLineItem,
  ReadinessGroupCondition,
  TestCircuit,
  WeldingMaterialCertificate,
  WeldJoint,
} from '../types/welding';
import {
  ALL_COLUMNS,
  formatDateDDMMYY,
  formatGost32569JournalRow,
  formatStoGazpromJournalRow,
  getJointEquivDiaInch,
  getJointFieldValue,
  GOST_32569_2013_JOURNAL_COLUMNS,
  isDateColumnKey,
  parseLrvCatalogRecords,
  parseProjectLineListRecords,
  STO_GAZPROM_15_1_1_002_2023_COLUMNS,
} from './weldingLogic';
import { normalizeCorporateJointNumber } from '../api/mappers';
import { buildXlsxBinary } from './xlsxBuilder';
import { buildJointLabMarking } from './labMarking';
import { getRequestMethodsList, NdtLineDeficitRow } from './laboratoryLogic';
import {
  CIRCUIT_TEST_STATUS_LABELS,
  CircuitNdtReadiness,
  computeCircuitNdtReadiness,
  formatJointControlSummaryForCircuit,
  isJointAssignedToCircuit,
  SRI_STATUS_LABELS,
} from './testCircuitCalc';
import { getJointNominalInch } from './jointDerived';
import { RECORD_STATUS_LABELS_RU } from './rbac';
import type {
  ExecutiveDocColumnKey,
  ExecutiveDocRow,
  ExecutiveDocsSummaryStats,
} from '../types/executiveDocs';
import {
  EXECUTIVE_DOC_COLUMNS,
  EXECUTIVE_DOC_STATUS_LABELS,
  GEODESY_STATUS_LABELS,
  PHYSICS_STATUS_LABELS,
  PRE_STAGE_STATUS_LABELS,
} from '../types/executiveDocs';
import { formatExecutiveNoteDate } from './executiveDocsLogic';

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
 * Клиентский экспорт отфильтрованной выборки Реестра стыков по активным столбцам текущего шаблона в .xlsx.
 * Гарантирует точное совпадение с тем, что видит инженер в таблице, и не включает закрытые поля ЛНК.
 */
export function exportFilteredRegistryToXlsx(params: {
  joints: WeldJoint[];
  columns: ColumnDefinition[];
  labRequests?: NdtLabRequest[];
  testCircuits?: TestCircuit[];
  templateName?: string;
}): void {
  const { joints, columns, labRequests = [], testCircuits, templateName } = params;
  const exportCols = columns.length > 0 ? columns : ALL_COLUMNS;
  const headers = exportCols.map((c) => c.label);
  const columnWidths = exportCols.map((c) => Math.max(12, Math.round(c.minWidth / 7)));

  const rows: Array<Array<string | number>> = joints.map((joint) =>
    exportCols.map((col) => {
      if (col.key === 'jointNumber') {
        const corp = normalizeCorporateJointNumber(
          joint.jointNumber,
          joint.uniqueLineId,
          joint.isSupplementary
        );
        return corp.jointNumber;
      }
      const raw = getJointFieldValue(joint, col.key, labRequests, testCircuits);
      if (raw === '' || raw === null || raw === undefined) return '';
      if (isDateColumnKey(col.key)) {
        return formatDateDDMMYY(String(raw));
      }
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        return raw;
      }
      return String(raw);
    })
  );

  const bytes = buildXlsxBinary([
    {
      name: templateName ? templateName.slice(0, 31) : 'Реестр стыков',
      headers,
      rows,
      columnWidths,
    },
  ]);

  const dateStamp = formatDateDDMMYY(new Date().toISOString().slice(0, 10));
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerBlobDownload(blob, `ZAYCHICK_Reestr_Stykov_${dateStamp}.xlsx`);
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

export interface WeldingJournalExportOptions {
  isDraftUnsynced?: boolean;
  unsyncedCount?: number;
  isDraftIncomplete?: boolean;
  missingCount?: number;
  facilityId?: string;
  objectName?: string;
  rdCode?: string;
  uniqueLineId?: string;
  lineLabel?: string;
  dateFrom?: string;
  dateTo?: string;
  strict?: boolean;
  preferClientExport?: boolean;
  journalNumber?: string;
  customerName?: string;
  contractorName?: string;
  responsibleKeeper?: string;
}

export interface WeldingJournalExportResult {
  mode: 'server' | 'client';
  filename: string;
}

function buildClientWeldingJournalXlsx(
  joints: WeldJoint[],
  standard: JournalStandard,
  materials: WeldingMaterialCertificate[],
  lrvCatalog: LRVItem[],
  options: WeldingJournalExportOptions | undefined,
  draftBanner: string | undefined,
  filename: string
): void {
  const isGost = standard === 'ГОСТ 32569-2013';
  const headers = isGost
    ? GOST_32569_2013_JOURNAL_COLUMNS.map((c) => `${c.colNumber}. ${c.label}`)
    : STO_GAZPROM_15_1_1_002_2023_COLUMNS.map((c) => c.fullLabel);

  const columnWidths = isGost
    ? [8, 22, 24, 34, 15, 19, 13, 30, 17, 16, 18, 18, 16, 16, 20, 22, 18]
    : STO_GAZPROM_15_1_1_002_2023_COLUMNS.map((c) =>
        Math.max(10, Math.min(34, Math.round(c.minWidth / 7)))
      );

  const rows: Array<Array<string | number>> = [];
  if (draftBanner) {
    const bannerRow: Array<string | number> = new Array(headers.length).fill('');
    bannerRow[0] = draftBanner;
    rows.push(bannerRow);
  }

  joints.forEach((j, idx) => {
    const cells = isGost
      ? formatGost32569JournalRow(j, idx, materials, lrvCatalog).cells
      : formatStoGazpromJournalRow(j, idx, lrvCatalog).cells;
    rows.push(cells);
  });

  const dateStamp = formatDateDDMMYY(new Date().toISOString().slice(0, 10));
  const metaRows: Array<Array<string | number>> = [
    ['Нормативная форма', standard],
    ['Номер журнала', options?.journalNumber?.trim() || 'Не указан'],
    [
      'Объект строительства',
      options?.objectName && options.objectName !== 'ALL'
        ? options.objectName
        : 'Все объекты',
    ],
    [
      'Шифр РД',
      options?.rdCode && options.rdCode !== 'ALL' ? options.rdCode : 'Все шифры',
    ],
    [
      'Линия',
      options?.lineLabel && options.lineLabel !== 'Все линии'
        ? options.lineLabel
        : options?.uniqueLineId && options.uniqueLineId !== 'ALL'
          ? options.uniqueLineId
          : 'Все линии',
    ],
    [
      'Период сварки',
      options?.dateFrom || options?.dateTo
        ? `${options?.dateFrom ? formatDateDDMMYY(options.dateFrom) : '—'} — ${
            options?.dateTo ? formatDateDDMMYY(options.dateTo) : '—'
          }`
        : 'Весь период',
    ],
    ['Заказчик', options?.customerName?.trim() || 'Не указан'],
    ['Подрядчик', options?.contractorName?.trim() || 'Не указан'],
    [
      'Ответственный за ведение журнала',
      options?.responsibleKeeper?.trim() || 'Не указан',
    ],
    ['Записей в журнале', joints.length],
    ['Статус выпуска', draftBanner || 'Чистовой выпуск'],
    ['Дата формирования', dateStamp],
    [
      'Подпись ответственного за ведение',
      `${options?.responsibleKeeper?.trim() || '______________________'}   Подпись: ______________`,
    ],
    [
      'Подпись строительного контроля',
      '______________________   Подпись: ______________',
    ],
  ];

  const bytes = buildXlsxBinary([
    {
      name: isGost ? 'Журнал ГОСТ 32569' : 'Журнал СТО Газпром',
      headers,
      rows,
      columnWidths,
    },
    {
      name: 'Титульные реквизиты',
      headers: ['Реквизит', 'Значение'],
      rows: metaRows,
      columnWidths: [34, 62],
    },
  ]);

  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerBlobDownload(blob, filename);
}

/**
 * Экспорт нормативных журналов сварочных работ (СТО Газпром 15-1.1-002-2023 — 49 граф, ГОСТ 32569-2013 — 17 граф).
 * Использует серверный openpyxl при полном совпадении области и автоматический клиентский фоллбэк .xlsx
 * в автономном режиме или при активных табличных фильтрах.
 */
export async function exportWeldingJournalToExcel(
  joints: WeldJoint[],
  standard: JournalStandard,
  materials: WeldingMaterialCertificate[] = [],
  lrvCatalog: LRVItem[] = [],
  options?: WeldingJournalExportOptions
): Promise<WeldingJournalExportResult> {
  const jPrefix = options?.isDraftUnsynced
    ? 'ЧЕРНОВИК_НЕ_СИНХРОНИЗИРОВАНО_'
    : options?.isDraftIncomplete
      ? 'ЧЕРНОВИК_НЕПОЛНЫЕ_РЕКВИЗИТЫ_'
      : '';

  const draftParts: string[] = [];
  if (options?.isDraftUnsynced) {
    draftParts.push(
      options.unsyncedCount && options.unsyncedCount > 0
        ? `ЧЕРНОВИК · НЕ СИНХРОНИЗИРОВАНО · ${options.unsyncedCount} изм.`
        : 'ЧЕРНОВИК · АВТОНОМНЫЙ РЕЖИМ'
    );
  }
  if (options?.isDraftIncomplete) {
    draftParts.push(
      `ЧЕРНОВИК · ТРЕБУЕТСЯ ЗАПОЛНЕНИЕ РЕКВИЗИТОВ · пропуски в ${options.missingCount ?? 0} стыках`
    );
  }
  const draftBanner = draftParts.length > 0 ? draftParts.join(' | ') : undefined;

  const tag = standard === 'ГОСТ 32569-2013' ? 'GOST_32569' : 'STO_GAZPROM';
  const dateStamp = formatDateDDMMYY(new Date().toISOString().slice(0, 10));
  const clientFilename = `${jPrefix}ZAYCHICK_Zhurnal_${tag}_${dateStamp}.xlsx`;

  if (!options?.preferClientExport) {
    try {
      const { blob, filename } = await zaychickApi.downloadJournalXlsx({
        standard,
        facilityId: options?.facilityId,
        rdCode: options?.rdCode,
        uniqueLineId: options?.uniqueLineId,
        dateFrom: options?.dateFrom,
        dateTo: options?.dateTo,
        strict: options?.strict,
        draftLabel: draftBanner,
        journalNumber: options?.journalNumber?.trim() || undefined,
        customerName: options?.customerName?.trim() || undefined,
        contractorName: options?.contractorName?.trim() || undefined,
        responsibleKeeper: options?.responsibleKeeper?.trim() || undefined,
      });
      const finalName = `${jPrefix}${filename}`;
      triggerBlobDownload(blob, finalName);
      return { mode: 'server', filename: finalName };
    } catch {
      // Безопасный переход на локальное формирование валидного .xlsx без потери данных
    }
  }

  buildClientWeldingJournalXlsx(
    joints,
    standard,
    materials,
    lrvCatalog,
    options,
    draftBanner,
    clientFilename
  );
  return { mode: 'client', filename: clientFilename };
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

/**
 * Серверный экспорт многолистового отчёта «Лаборатория НК» (.xlsx)
 */
export async function exportLaboratoryToExcel(params?: {
  objectName?: string;
  rdCode?: string;
  searchQuery?: string;
}): Promise<void> {
  const { blob, filename } = await zaychickApi.downloadLaboratoryXlsx(params);
  triggerBlobDownload(blob, filename);
}

/**
 * Клиентский многолистовой экспорт раздела «Лаборатория НК» в .xlsx по текущим фильтрам.
 * Включает 3 листа: «Дефицитная ведомость», «Заявки в ЛНК», «Заключения ЛНК» (с полем «Маркировка стыка»).
 */
export function exportLaboratoryFilteredToXlsx(params: {
  deficitLines: NdtLineDeficitRow[];
  requests: NdtLabRequest[];
  joints: WeldJoint[];
}): void {
  const { deficitLines, requests, joints } = params;

  const deficitHeaders = [
    'Объект',
    'Шифр РД',
    'Линия',
    'Контур ГИ',
    'Категория / Уровень',
    'Всего стыков',
    'Сварено',
    'В ремонте',
    'ВИК Треб.',
    'ВИК Факт',
    'ВИК Дефицит',
    'РК %',
    'РК Треб.',
    'РК Факт',
    'РК Дефицит',
    'УЗК %',
    'УЗК Треб.',
    'УЗК Факт',
    'УЗК Дефицит',
    'ПВК %',
    'ПВК Треб.',
    'ПВК Факт',
    'ПВК Дефицит',
    'Квота сварщиков',
    'Статус',
  ];

  const deficitRows: Array<Array<string | number>> = deficitLines.map((l) => [
    l.objectName,
    l.rdCode,
    l.lineNumber,
    l.contour,
    `${l.pipelineCategory || '—'} / ${l.qualityLevel || '—'}`,
    l.totalJoints,
    l.weldedCount,
    l.inRepairCount,
    l.vikRequired,
    l.vikCompleted,
    l.vikDeficit,
    l.rkPlanPct,
    l.rkRequired,
    l.rkCompleted,
    l.rkDeficit,
    l.uzkPlanPct,
    l.uzkRequired,
    l.uzkCompleted,
    l.uzkDeficit,
    l.pvkPlanPct,
    l.pvkRequired,
    l.pvkCompleted,
    l.pvkDeficit,
    l.welderDeficits.length === 0
      ? 'Квота закрыта'
      : l.welderDeficits
          .map(
            (w) =>
              `${w.stamp}: ${w.controlledCount}/${w.requiredCount}${
                w.missingMethods?.length ? ` · ${w.missingMethods.join('+')}` : ''
              }`
          )
          .join('; '),
    l.weldedCount === 0
      ? 'Нет сварки'
      : l.hasDeficit
      ? 'Требуется НК'
      : 'Норматив выполнен',
  ]);

  const requestHeaders = [
    '№ заявки',
    'Статус',
    'Этап контроля',
    'Методы НК',
    'Объект',
    'Шифр РД',
    'Линия',
    'Стыков',
    'Подал',
    'Дата подачи',
    'Принял',
    'Дата приёмки',
    'Примечание',
  ];

  const requestRows: Array<Array<string | number>> = requests.map((r) => [
    r.requestNumber,
    r.status,
    r.controlStage,
    getRequestMethodsList(r).join('+'),
    r.objectName,
    r.rdCode,
    r.lineNumber,
    r.jointIds.length,
    r.createdBy,
    r.createdAt,
    r.acceptedBy || '',
    r.acceptedAt || '',
    r.notes || '',
  ]);

  const conclusionHeaders = [
    '№ стыка',
    'Маркировка стыка',
    'Шифр РД',
    'Линия',
    'Типоразмер, мм',
    'Дата сварки',
    'Клеймо',
    'ВИК Результат',
    'ВИК № заключения',
    'ВИК Дата',
    'РК Результат',
    'РК № заключения',
    'РК Дата',
    'УЗК Результат',
    'УЗК № заключения',
    'УЗК Дата',
    'ПВК Результат',
    'ПВК № заключения',
    'ПВК Дата',
    'Дефектоскопист',
  ];

  const resolveMethodCols = (
    j: WeldJoint,
    m: 'ВИК' | 'РК' | 'УЗК' | 'ПВК'
  ): [string, string, string] => {
    const entry = j.labConclusions?.[m];
    if (entry) {
      return [
        entry.result || '',
        entry.reportNumber || '',
        entry.date ? formatDateDDMMYY(entry.date) : '',
      ];
    }
    if (m === 'ВИК') {
      return [
        j.vikResult || '',
        j.vikReportNumber || '',
        j.vikDate ? formatDateDDMMYY(j.vikDate) : '',
      ];
    }
    const matches =
      (m === 'РК' && (j.ndtType === 'РК' || j.ndtType === 'РК+УЗК')) ||
      (m === 'УЗК' && (j.ndtType === 'УЗК' || j.ndtType === 'РК+УЗК')) ||
      (m === 'ПВК' && (j.ndtType === 'ПВК' || j.ndtType === 'МК'));
    if (matches) {
      return [
        j.ndtResult || '',
        j.ndtReportNumber || '',
        j.ndtDate ? formatDateDDMMYY(j.ndtDate) : '',
      ];
    }
    return ['Не проводился', '', ''];
  };

  const conclusionRows: Array<Array<string | number>> = joints.map((j) => {
    const corp = normalizeCorporateJointNumber(
      j.jointNumber,
      j.uniqueLineId,
      j.isSupplementary
    );
    const { marking } = buildJointLabMarking(j);
    const vik = resolveMethodCols(j, 'ВИК');
    const rk = resolveMethodCols(j, 'РК');
    const uzk = resolveMethodCols(j, 'УЗК');
    const pvk = resolveMethodCols(j, 'ПВК');
    const inspector =
      j.labConclusions?.['РК']?.inspector ||
      j.labConclusions?.['УЗК']?.inspector ||
      j.labConclusions?.['ПВК']?.inspector ||
      j.labConclusions?.['ВИК']?.inspector ||
      j.ndtInspector ||
      j.vikInspector ||
      '';
    return [
      corp.jointNumber,
      marking,
      j.rdCode,
      j.lineNumber,
      `${j.diameterMm}×${j.wallThickness}`,
      formatDateDDMMYY(j.weldingDate),
      j.welderStamp,
      ...vik,
      ...rk,
      ...uzk,
      ...pvk,
      inspector,
    ];
  });

  const bytes = buildXlsxBinary([
    {
      name: 'Дефицитная ведомость',
      headers: deficitHeaders,
      rows: deficitRows,
      columnWidths: [
        18, 16, 14, 18, 14, 11, 10, 10, 10, 10, 11, 8, 10, 10, 11, 8, 10, 10,
        11, 8, 10, 10, 11, 24, 18,
      ],
    },
    {
      name: 'Заявки в ЛНК',
      headers: requestHeaders,
      rows: requestRows,
      columnWidths: [16, 15, 24, 14, 18, 16, 14, 9, 20, 16, 20, 16, 28],
    },
    {
      name: 'Заключения ЛНК',
      headers: conclusionHeaders,
      rows: conclusionRows,
      columnWidths: [
        10, 26, 16, 14, 13, 12, 12, 13, 24, 11, 13, 24, 11, 13, 24, 11, 13, 24,
        11, 18,
      ],
    },
  ]);

  const dateStamp = formatDateDDMMYY(new Date().toISOString().slice(0, 10));
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerBlobDownload(blob, `ZAYCHICK_Laboratoriya_NK_${dateStamp}.xlsx`);
}

/**
 * Нативный клиентский экспорт раздела «Испытания» в .xlsx (2 листа):
 * 1) Контуры испытаний (сводка по сварке, d-inch, EDI, готовности НК, СРИ и актам)
 * 2) Состав стыков (детализация по стыкам отфильтрованных контуров в корпоративном формате номеров)
 */
export function exportTestCircuitsFilteredToXlsx(params: {
  circuits: TestCircuit[];
  ndtByCircuitId?: Map<string, CircuitNdtReadiness>;
  allJoints: WeldJoint[];
  allLines: ProjectLineItem[];
}): void {
  const { circuits, ndtByCircuitId, allJoints, allLines } = params;

  const circuitHeaders = [
    'Контур испытаний',
    'Объект строительства',
    'СРИ',
    'Статус СРИ',
    'Включённые линии',
    'Всего стыков',
    'Сварено',
    'Сварка, %',
    'd-inch факт',
    'd-inch всего',
    'EDI факт',
    'EDI всего',
    'Готовность НК, %',
    'Дефицит НК',
    'Брак, шт.',
    'Плановая дата',
    'Номер акта',
    'Дата испытания',
    'Статус испытания',
    'Статус записи',
  ];

  const circuitRows: Array<Array<string | number>> = circuits.map((c) => {
    const ndt =
      ndtByCircuitId?.get(c.id) || computeCircuitNdtReadiness(c, allJoints, allLines);
    const linesText = c.linesSummary
      .map((l) =>
        l.isFullLine
          ? l.uniqueLineId
          : `${l.uniqueLineId} · ${l.assignedJointsCount}/${l.lineTotalJointsCount}`
      )
      .join('; ');
    return [
      c.name,
      c.objectName || '',
      c.sriName || '',
      SRI_STATUS_LABELS[c.sriStatus] || c.sriStatus,
      linesText,
      c.totalJoints,
      c.weldedJoints,
      Number(c.weldingJointsPercent.toFixed(1)),
      Number(c.weldedDInch.toFixed(2)),
      Number(c.totalDInch.toFixed(2)),
      Number(c.weldedEdi.toFixed(2)),
      Number(c.totalEdi.toFixed(2)),
      Number(ndt.ndtPercent.toFixed(1)),
      ndt.deficitDetails.length > 0 ? ndt.deficitDetails.join(', ') : 'Выполнено',
      c.defectiveJointsCount,
      c.plannedDate ? formatDateDDMMYY(c.plannedDate) : '',
      c.actNumber || '',
      c.actualTestDate ? formatDateDDMMYY(c.actualTestDate) : '',
      CIRCUIT_TEST_STATUS_LABELS[c.testStatus] || c.testStatus,
      RECORD_STATUS_LABELS_RU[c.recordStatus] || c.recordStatus,
    ];
  });

  const jointHeaders = [
    'Контур испытаний',
    'Шифр РД',
    'Линия',
    '№ стыка',
    'Типоразмер, мм',
    'd-inch',
    'EDI',
    'Дата сварки',
    'Клеймо',
    'Контроль ВИК и НК',
    'Брак',
  ];

  const jointRows: Array<Array<string | number>> = [];
  for (const c of circuits) {
    const assigned = allJoints
      .filter((j) => isJointAssignedToCircuit(j, c))
      .sort((a, b) => {
        const lc = a.uniqueLineId.localeCompare(b.uniqueLineId, 'ru');
        if (lc !== 0) return lc;
        return a.jointNumber.localeCompare(b.jointNumber, 'ru', { numeric: true });
      });
    for (const j of assigned) {
      const corp = normalizeCorporateJointNumber(
        j.jointNumber,
        j.uniqueLineId,
        j.isSupplementary
      );
      const summary = formatJointControlSummaryForCircuit(j);
      jointRows.push([
        c.name,
        j.rdCode,
        j.uniqueLineId,
        corp.jointNumber,
        `${j.diameterMm}×${j.wallThickness}`,
        Number(getJointNominalInch(j).toFixed(2)),
        Number(getJointEquivDiaInch(j).toFixed(2)),
        j.weldingDate ? formatDateDDMMYY(j.weldingDate) : 'Не сварен',
        j.welderStamp || '',
        summary.label,
        summary.status === 'defect' ? 'Да' : 'Нет',
      ]);
    }
  }

  const bytes = buildXlsxBinary([
    {
      name: 'Контуры испытаний',
      headers: circuitHeaders,
      rows: circuitRows,
      columnWidths: [
        28, 24, 24, 15, 28, 12, 11, 11, 12, 12, 12, 12, 15, 22, 10, 14, 16, 14, 14, 14,
      ],
    },
    {
      name: 'Состав стыков',
      headers: jointHeaders,
      rows: jointRows,
      columnWidths: [28, 22, 22, 10, 14, 10, 10, 13, 12, 28, 8],
    },
  ]);

  const dateStamp = formatDateDDMMYY(new Date().toISOString().slice(0, 10));
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerBlobDownload(blob, `ZAYCHICK_Ispytaniya_${dateStamp}.xlsx`);
}

/**
 * Нативный клиентский экспорт раздела «Исполнительная документация» в .xlsx (2 листа):
 * 1) Ведомость ИД — отфильтрованные строки и активные столбцы + статус готовности и строка итогов
 * 2) Дефициты НК и ВК — детализация по незакрытым стыкам и позициям материалов
 */
export function exportExecutiveDocsToXlsx(params: {
  rows: ExecutiveDocRow[];
  visibleColumns: ExecutiveDocColumnKey[];
  selectedObjectName: string;
  summary: ExecutiveDocsSummaryStats;
}): void {
  const { rows, visibleColumns, selectedObjectName, summary } = params;
  const visibleSet = new Set(visibleColumns);
  const activeCols = EXECUTIVE_DOC_COLUMNS.filter((c) => visibleSet.has(c.key));

  const mainHeaders: string[] = [
    ...activeCols.map((c) => c.label),
    'Готовность комплекта ИД',
  ];

  const mainColumnWidths: number[] = [
    ...activeCols.map((c) => {
      switch (c.key) {
        case 'lineNumber':
          return 16;
        case 'rdCode':
          return 28;
        case 'testContour':
          return 28;
        case 'priority':
          return 11;
        case 'idStatus':
          return 14;
        case 'weldingReadinessPct':
          return 14;
        case 'ndtDeficitCount':
          return 18;
        case 'vkDeficitCount':
          return 14;
        case 'preStageStatus':
        case 'physicsStatus':
        case 'geodesyStatus':
          return 15;
        case 'workProducer':
        case 'ptoEngineer':
          return 18;
        case 'noteText':
          return 34;
      }
    }),
    26,
  ];

  const getCellExportValue = (
    row: ExecutiveDocRow,
    key: ExecutiveDocColumnKey
  ): string | number => {
    switch (key) {
      case 'lineNumber':
        return row.lineNumber;
      case 'rdCode':
        return row.rdCode;
      case 'testContour':
        return row.testContour === '—' ? '' : row.testContour;
      case 'priority':
        return row.priority !== null ? row.priority : '';
      case 'idStatus':
        return EXECUTIVE_DOC_STATUS_LABELS[row.idStatus];
      case 'weldingReadinessPct':
        return Number(row.weldingReadinessPct.toFixed(1));
      case 'ndtDeficitCount':
        return row.ndtDeficitCount;
      case 'vkDeficitCount':
        return row.vkDeficitCount;
      case 'preStageStatus':
        return PRE_STAGE_STATUS_LABELS[row.preStageStatus];
      case 'physicsStatus':
        return PHYSICS_STATUS_LABELS[row.physicsStatus];
      case 'geodesyStatus':
        return GEODESY_STATUS_LABELS[row.geodesyStatus];
      case 'workProducer':
        return row.workProducer;
      case 'ptoEngineer':
        return row.ptoEngineer;
      case 'noteText': {
        const dt = formatExecutiveNoteDate(row.noteUpdatedAt);
        if (!row.noteText) return '';
        return dt ? `${row.noteText} [${dt}]` : row.noteText;
      }
    }
  };

  const mainRows: Array<Array<string | number>> = rows.map((row) => {
    const readinessLabel = row.hasSignedAnomaly
      ? `Подписана с замечаниями · ${row.readinessBlockers.map((b) => b.label).join(', ')}`
      : row.idStatus === 'SIGNED'
      ? 'Подписана'
      : row.isReadyToSign
      ? 'Готова к подписанию'
      : `Блокеры: ${row.readinessBlockers.map((b) => b.label).join(', ')}`;

    return [
      ...activeCols.map((col) => getCellExportValue(row, col.key)),
      readinessLabel,
    ];
  });

  // Строка итогов по отфильтрованной выборке
  const totalRow: Array<string | number> = activeCols.map((col, idx) => {
    if (idx === 0) {
      return `ИТОГО · линий: ${summary.totalLines}`;
    }
    if (col.key === 'idStatus') {
      return `Подписано: ${summary.signedCount}`;
    }
    if (col.key === 'weldingReadinessPct') {
      return Number(summary.weightedWeldingPct.toFixed(1));
    }
    if (col.key === 'ndtDeficitCount') {
      return rows.reduce((s, r) => s + r.ndtDeficitCount, 0);
    }
    if (col.key === 'vkDeficitCount') {
      return rows.reduce((s, r) => s + r.vkDeficitCount, 0);
    }
    return '';
  });
  totalRow.push(
    `Сварка: ${summary.weldedJoints}/${summary.totalJoints} стыков · Готово к сдаче: ${summary.readyToSignCount}`
  );
  mainRows.push(totalRow);

  // Лист 2: детализация дефицитов НК и ВК
  const deficitHeaders = [
    'Шифр РД',
    'Линия',
    'Контур испытания',
    'Тип дефицита',
    'Объект / позиция',
    'Детализация',
  ];
  const deficitRows: Array<Array<string | number>> = [];

  for (const row of rows) {
    for (const ndtItem of row.ndtDeficitDetails) {
      deficitRows.push([
        row.rdCode,
        row.lineNumber,
        row.testContour === '—' ? '' : row.testContour,
        'Дефицит НК',
        `Стык ${ndtItem.jointNumber}`,
        ndtItem.reason,
      ]);
    }
    for (const vkItem of row.vkDeficitItems) {
      const reasonText =
        vkItem.reason === 'unlinked'
          ? 'Не найдена в Базе материалов'
          : 'Отсутствует утверждённый акт входного контроля';
      const jointsSuffix =
        vkItem.jointNumbers && vkItem.jointNumbers.length > 0
          ? ` · стыки: ${vkItem.jointNumbers.join(', ')}`
          : '';
      deficitRows.push([
        row.rdCode,
        row.lineNumber,
        row.testContour === '—' ? '' : row.testContour,
        'Дефицит ВК',
        `${vkItem.lrvCode} — ${vkItem.shortName}`,
        `${reasonText}${jointsSuffix}`,
      ]);
    }
  }

  if (deficitRows.length === 0) {
    deficitRows.push([
      selectedObjectName === 'ALL' ? 'Все объекты' : selectedObjectName,
      '—',
      '—',
      'Нет дефицитов',
      '—',
      'По всем отфильтрованным линиям дефициты НК и ВК отсутствуют',
    ]);
  }

  const bytes = buildXlsxBinary([
    {
      name: 'Ведомость ИД',
      headers: mainHeaders,
      rows: mainRows,
      columnWidths: mainColumnWidths,
    },
    {
      name: 'Дефициты НК и ВК',
      headers: deficitHeaders,
      rows: deficitRows,
      columnWidths: [28, 16, 28, 16, 30, 44],
    },
  ]);

  const dateStamp = formatDateDDMMYY(new Date().toISOString().slice(0, 10));
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerBlobDownload(blob, `ZAYCHICK_Ispolnitelnaya_${dateStamp}.xlsx`);
}

/**
 * Многолистовой экспорт раздела «База материалов» в .xlsx по текущим фильтрам:
 * Лист 1 «База материалов» (включая статус контроля, баланс допуска и число стыков)
 * Лист 2 «Акты входного контроля» (детализация всех партий, сертификатов и плавок)
 */
export function exportLrvFilteredToXlsx(params: {
  items: Array<LRVItem & { linkedJointsCount?: number }>;
  statusLabels: Record<string, string>;
  verdictLabels: Record<string, string>;
  resolveCategory: (item: LRVItem) => string;
  computeBalance: (item: LRVItem) => {
    controlStatus: string;
    acceptedQty: number;
    rejectedQty: number;
    replacedQty: number;
    pendingQty: number;
  };
}): void {
  const { items, statusLabels, verdictLabels, resolveCategory, computeBalance } = params;

  const mainHeaders = [
    'Код ЛРВ',
    'Шифр РД',
    'Объект',
    'Краткое наименование',
    'Маркировка',
    'Полное наименование',
    'Категория',
    'Давление PN, МПа',
    'Подсоединение',
    'Материал',
    'НТД',
    'Завод-изготовитель',
    'DN 1',
    'Ø1, мм',
    'S1, мм',
    'DN 2',
    'Ø2, мм',
    'S2, мм',
    'Кол-во по спец.',
    'Ед. изм.',
    'Привязано стыков',
    'Статус контроля',
    'Допущено',
    'Брак',
    'Заменено',
    'Остаток',
    'Актов ВК',
  ];
  const mainWidths = [
    20, 34, 26, 30, 18, 38, 14, 16, 16, 16, 22, 22, 10, 12, 12, 10, 12, 12, 14, 10, 16, 20, 12, 10, 12, 12, 10,
  ];

  const mainRows: Array<Array<string | number>> = [];
  const actRows: Array<Array<string | number>> = [];

  for (const item of items) {
    const bal = computeBalance(item);
    const batches = item.batches || [];
    const statusLabel =
      item.status === 'superseded'
        ? 'Аннулирована'
        : statusLabels[bal.controlStatus] || bal.controlStatus;

    mainRows.push([
      item.lrvCode,
      item.rdCode,
      item.objectName || '',
      item.shortName,
      item.marking || '',
      item.fullName || '',
      resolveCategory(item),
      item.pnMpa || '',
      item.connectionType || '',
      item.material || '',
      item.ntd || '',
      item.manufacturer || '',
      item.dn1 ?? '',
      item.diameterMm ?? '',
      item.wallThickness ?? '',
      item.dn2 ?? '',
      item.diameterMm2 ?? '',
      item.wallThickness2 ?? '',
      item.totalSpecQty ?? item.specQty ?? 0,
      item.unit || 'шт',
      item.linkedJointsCount ?? 0,
      statusLabel,
      bal.acceptedQty,
      bal.rejectedQty,
      bal.replacedQty,
      bal.pendingQty,
      batches.length,
    ]);

    for (const batch of batches) {
      actRows.push([
        item.lrvCode,
        item.rdCode,
        item.shortName,
        batch.actNumber || '',
        batch.actDate ? formatDateDDMMYY(batch.actDate) : '',
        batch.certificateNumber || '',
        batch.heatNumber || '',
        (batch.serialNumbers || []).join(', '),
        batch.quantity ?? 0,
        batch.unit || item.unit || 'шт',
        verdictLabels[batch.verdict] || batch.verdict,
        batch.inspectorName || '',
        batch.rejectionReason || '',
        batch.replacementLetter || '',
        batch.notes || '',
      ]);
    }
  }

  const actHeaders = [
    'Код ЛРВ',
    'Шифр РД',
    'Наименование',
    'Номер акта ВК',
    'Дата акта',
    'Сертификаты, паспорта',
    'Плавка / партия',
    'Заводские номера',
    'Кол-во',
    'Ед. изм.',
    'Результат контроля',
    'Контролёр',
    'Причина отбраковки',
    'Письмо замены',
    'Примечания',
  ];
  const actWidths = [20, 34, 28, 16, 14, 24, 18, 26, 10, 10, 20, 20, 30, 22, 30];

  const bytes = buildXlsxBinary([
    {
      name: 'База материалов',
      headers: mainHeaders,
      rows: mainRows,
      columnWidths: mainWidths,
    },
    {
      name: 'Акты входного контроля',
      headers: actHeaders,
      rows:
        actRows.length > 0
          ? actRows
          : [['—', '—', 'По выбранным позициям акты входного контроля отсутствуют', '', '', '', '', '', '', '', '', '', '', '', '']],
      columnWidths: actWidths,
    },
  ]);

  const dateStamp = formatDateDDMMYY(new Date().toISOString().slice(0, 10));
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerBlobDownload(blob, `ZAYCHICK_Baza_Materialov_${dateStamp}.xlsx`);
}



