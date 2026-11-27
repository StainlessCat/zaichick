export type LrvColumnKey =
  | 'lrvCode'
  | 'rdCode'
  | 'shortName'
  | 'marking'
  | 'fullName'
  | 'category'
  | 'pnMpa'
  | 'connectionType'
  | 'material'
  | 'ntd'
  | 'manufacturer'
  | 'sizeSummary'
  | 'dn1'
  | 'diameterMm'
  | 'wallThickness'
  | 'dn2'
  | 'diameterMm2'
  | 'wallThickness2'
  | 'specQty'
  | 'linkedJoints'
  | 'controlStatus'
  | 'balance';

export type LrvColumnPreset = 'operational' | 'full';

export interface LrvColumnDefinition {
  key: LrvColumnKey;
  label: string;
  defaultWidth: number;
  minWidth: number;
  align?: 'left' | 'center' | 'right';
  stickyLeft?: boolean;
  alwaysVisible?: boolean;
  sortable?: boolean;
  filterable?: boolean;
}

export const LRV_COLUMN_DEFINITIONS: LrvColumnDefinition[] = [
  {
    key: 'lrvCode',
    label: 'Код ЛРВ',
    defaultWidth: 142,
    minWidth: 120,
    align: 'left',
    stickyLeft: true,
    alwaysVisible: true,
    sortable: true,
    filterable: true,
  },
  {
    key: 'rdCode',
    label: 'Шифр РД',
    defaultWidth: 220,
    minWidth: 140,
    align: 'left',
    sortable: true,
    filterable: true,
  },
  {
    key: 'shortName',
    label: 'Краткое наименование',
    defaultWidth: 210,
    minWidth: 150,
    align: 'left',
    alwaysVisible: true,
    sortable: true,
    filterable: true,
  },
  {
    key: 'marking',
    label: 'Маркировка',
    defaultWidth: 140,
    minWidth: 100,
    align: 'left',
    sortable: true,
    filterable: true,
  },
  {
    key: 'fullName',
    label: 'Полное наименование',
    defaultWidth: 240,
    minWidth: 160,
    align: 'left',
    sortable: true,
    filterable: true,
  },
  {
    key: 'category',
    label: 'Категория',
    defaultWidth: 92,
    minWidth: 80,
    align: 'center',
    sortable: true,
    filterable: true,
  },
  {
    key: 'pnMpa',
    label: 'PN, МПа',
    defaultWidth: 94,
    minWidth: 78,
    align: 'center',
    sortable: true,
    filterable: true,
  },
  {
    key: 'connectionType',
    label: 'Подсоединение',
    defaultWidth: 120,
    minWidth: 96,
    align: 'center',
    sortable: true,
    filterable: true,
  },
  {
    key: 'material',
    label: 'Материал',
    defaultWidth: 98,
    minWidth: 84,
    align: 'left',
    sortable: true,
    filterable: true,
  },
  {
    key: 'ntd',
    label: 'НТД',
    defaultWidth: 148,
    minWidth: 110,
    align: 'left',
    sortable: true,
    filterable: true,
  },
  {
    key: 'manufacturer',
    label: 'Изготовитель',
    defaultWidth: 156,
    minWidth: 115,
    align: 'left',
    sortable: true,
    filterable: true,
  },
  {
    key: 'sizeSummary',
    label: 'DN / Ø×S, мм',
    defaultWidth: 128,
    minWidth: 108,
    align: 'center',
    sortable: true,
    filterable: true,
  },
  {
    key: 'dn1',
    label: 'DN 1',
    defaultWidth: 74,
    minWidth: 64,
    align: 'center',
    sortable: true,
    filterable: true,
  },
  {
    key: 'diameterMm',
    label: 'Ø1, мм',
    defaultWidth: 84,
    minWidth: 70,
    align: 'center',
    sortable: true,
    filterable: true,
  },
  {
    key: 'wallThickness',
    label: 'S1, мм',
    defaultWidth: 82,
    minWidth: 68,
    align: 'center',
    sortable: true,
    filterable: true,
  },
  {
    key: 'dn2',
    label: 'DN 2',
    defaultWidth: 74,
    minWidth: 64,
    align: 'center',
    sortable: true,
    filterable: true,
  },
  {
    key: 'diameterMm2',
    label: 'Ø2, мм',
    defaultWidth: 84,
    minWidth: 70,
    align: 'center',
    sortable: true,
    filterable: true,
  },
  {
    key: 'wallThickness2',
    label: 'S2, мм',
    defaultWidth: 82,
    minWidth: 68,
    align: 'center',
    sortable: true,
    filterable: true,
  },
  {
    key: 'specQty',
    label: 'По спец.',
    defaultWidth: 86,
    minWidth: 76,
    align: 'right',
    sortable: true,
    filterable: true,
  },
  {
    key: 'linkedJoints',
    label: 'Стыки',
    defaultWidth: 76,
    minWidth: 66,
    align: 'center',
    sortable: true,
    filterable: false,
  },
  {
    key: 'controlStatus',
    label: 'Статус контроля',
    defaultWidth: 146,
    minWidth: 128,
    align: 'left',
    sortable: true,
    filterable: true,
  },
  {
    key: 'balance',
    label: 'Баланс допуска',
    defaultWidth: 126,
    minWidth: 112,
    align: 'left',
    sortable: false,
    filterable: false,
  },
];

export const LRV_OPERATIONAL_COLUMNS: LrvColumnKey[] = [
  'lrvCode',
  'shortName',
  'category',
  'material',
  'ntd',
  'sizeSummary',
  'specQty',
  'linkedJoints',
  'controlStatus',
  'balance',
];

export const LRV_FULL_COLUMNS: LrvColumnKey[] = [
  'lrvCode',
  'rdCode',
  'shortName',
  'marking',
  'fullName',
  'category',
  'pnMpa',
  'connectionType',
  'material',
  'ntd',
  'manufacturer',
  'dn1',
  'diameterMm',
  'wallThickness',
  'dn2',
  'diameterMm2',
  'wallThickness2',
  'specQty',
  'linkedJoints',
  'controlStatus',
  'balance',
];

const LRV_COLUMNS_STORAGE_KEY = 'zaychick_lrv_visible_columns_v1';

export function loadSavedLrvColumns(): LrvColumnKey[] {
  try {
    const raw = window.localStorage.getItem(LRV_COLUMNS_STORAGE_KEY);
    if (!raw) return LRV_OPERATIONAL_COLUMNS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return LRV_OPERATIONAL_COLUMNS;
    const validSet = new Set(LRV_COLUMN_DEFINITIONS.map((c) => c.key));
    const cleaned = parsed.filter((k): k is LrvColumnKey => validSet.has(k));
    if (!cleaned.includes('lrvCode')) cleaned.unshift('lrvCode');
    if (!cleaned.includes('shortName')) cleaned.splice(1, 0, 'shortName');
    return cleaned;
  } catch {
    return LRV_OPERATIONAL_COLUMNS;
  }
}

export function saveLrvColumns(columns: LrvColumnKey[]): void {
  try {
    window.localStorage.setItem(LRV_COLUMNS_STORAGE_KEY, JSON.stringify(columns));
  } catch {
    // ignore storage errors
  }
}

export function detectLrvColumnPreset(columns: LrvColumnKey[]): LrvColumnPreset | 'custom' {
  const opMatch =
    columns.length === LRV_OPERATIONAL_COLUMNS.length &&
    LRV_OPERATIONAL_COLUMNS.every((k) => columns.includes(k));
  if (opMatch) return 'operational';
  const fullMatch =
    columns.length === LRV_FULL_COLUMNS.length &&
    LRV_FULL_COLUMNS.every((k) => columns.includes(k));
  if (fullMatch) return 'full';
  return 'custom';
}
