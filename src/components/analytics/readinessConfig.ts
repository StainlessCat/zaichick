import type {
  ReadinessGroupCondition,
  ReadinessTestAllowanceStatus,
} from '../../types/welding';
import type { ExecutiveDocRecord } from '../../types/executiveDocs';

export const EXEC_DOCS_STORAGE_KEY = 'zaychick_executive_docs_v1';
export const VISIBLE_COLS_STORAGE_KEY = 'zaychick_readiness_visible_cols_v1';

export type ToggleableColumnKey =
  | 'totalJoints'
  | 'weldedCount'
  | 'equivInches'
  | 'vikPassedCount'
  | 'ndtPassedCount'
  | 'dupNdtPassedCount'
  | 'repairCount'
  | 'readinessPct'
  | 'idStatus';

export const ALL_TOGGLEABLE_COLUMNS: { key: ToggleableColumnKey; label: string }[] = [
  { key: 'totalJoints', label: 'Всего стыков' },
  { key: 'weldedCount', label: 'Сварено' },
  { key: 'equivInches', label: 'Эквив. дюймы EDI' },
  { key: 'vikPassedCount', label: 'Годен ВИК' },
  { key: 'ndtPassedCount', label: 'Годен НК' },
  { key: 'dupNdtPassedCount', label: 'Дубль НК' },
  { key: 'repairCount', label: 'Ремонт' },
  { key: 'readinessPct', label: 'Готовность сварки' },
  { key: 'idStatus', label: 'Исполнительная документация' },
];

export const DEFAULT_VISIBLE_COLUMNS: ToggleableColumnKey[] =
  ALL_TOGGLEABLE_COLUMNS.map((c) => c.key);

export type DatePresetId = 'all' | 'today' | '7d' | '30d' | 'custom';

export const CONDITION_OPTIONS: { id: ReadinessGroupCondition; label: string }[] = [
  { id: 'objectName', label: 'Объект' },
  { id: 'contour', label: 'Контур испытаний' },
  { id: 'rdCode', label: 'Шифр РД' },
  { id: 'uniqueLineId', label: 'Линия' },
];

export const CONDITION_TITLE_MAP: Record<ReadinessGroupCondition, string> = {
  objectName: 'Объект строительства',
  contour: 'Контур испытаний',
  rdCode: 'Шифр РД',
  uniqueLineId: 'Линия',
};

export const TEST_ALLOWANCE_BADGE_STYLES: Record<ReadinessTestAllowanceStatus, string> = {
  allowed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  welding_done_id_pending: 'bg-amber-50 text-amber-800 border-amber-200',
  id_signed_welding_pending: 'bg-sky-50 text-[#1e3799] border-sky-200',
  in_work: 'bg-slate-100 text-slate-700 border-slate-200',
  no_lines: 'bg-slate-50 text-slate-400 border-slate-200',
};

export const DEFAULT_READINESS_COL_WIDTHS: Record<string, number> = {
  groupKey: 230,
  totalJoints: 115,
  weldedCount: 120,
  equivInches: 170,
  vikPassedCount: 95,
  ndtPassedCount: 105,
  dupNdtPassedCount: 95,
  repairCount: 95,
  readinessPct: 190,
  idStatus: 215,
  action: 95,
};

export function toLocalIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function readStoredExecutiveDocs(): Record<string, ExecutiveDocRecord> {
  try {
    const raw = window.localStorage.getItem(EXEC_DOCS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, ExecutiveDocRecord>;
    }
  } catch {
    // ignore storage errors
  }
  return {};
}

export function readStoredVisibleColumns(): ToggleableColumnKey[] {
  try {
    const raw = window.localStorage.getItem(VISIBLE_COLS_STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE_COLUMNS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const valid = new Set<string>(DEFAULT_VISIBLE_COLUMNS);
      const filtered = parsed.filter(
        (k): k is ToggleableColumnKey => typeof k === 'string' && valid.has(k)
      );
      if (filtered.length > 0) return filtered;
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_VISIBLE_COLUMNS;
}
