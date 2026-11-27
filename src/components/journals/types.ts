import {
  FacilityObject,
  LRVItem,
  ProjectLineItem,
  RecordStatus,
  WeldingMaterialCertificate,
  WeldJoint,
} from '../../types/welding';

export interface WeldingJournalsViewProps {
  joints?: WeldJoint[];
  allJoints?: WeldJoint[];
  lines?: ProjectLineItem[];
  facilities?: FacilityObject[];
  materials?: WeldingMaterialCertificate[];
  lrvCatalog?: LRVItem[];
  selectedObjectName?: string;
  selectedRdCode?: string;
  onEditJoint: (joint: WeldJoint) => void;
  onChangeJointStatus?: (
    joint: WeldJoint,
    targetStatus: RecordStatus,
    reason?: string
  ) => Promise<{ ok: boolean; message?: string }>;
  onSelectObjectName?: (name: string) => void;
  onSelectRdCode?: (rd: string) => void;
  isDbConnected?: boolean;
  pendingSyncCount?: number;
}

export interface JournalRdOption {
  rdCode: string;
  suffix: string;
  linesCount: number;
  jointsCount: number;
}

export interface JournalLineOption {
  id: string;
  lineNumber: string;
  uniqueLineId: string;
  lineName: string;
  product: string;
  objectName: string;
  rdCode: string;
  pipelineCategory: string;
  qualityLevel: string;
  weatherStationId?: string;
  jointsCount: number;
}

export interface LineWeldingAlert {
  total: number;
  welded: number;
  unweldedCount: number;
  isFullyWelded: boolean;
  unweldedJointNumbers: string[];
}

export type JournalQuickFilter = 'all' | 'incomplete' | 'in_repair' | 'accepted';

export interface JournalQuickFilterCounts {
  all: number;
  incomplete: number;
  inRepair: number;
  accepted: number;
}

export interface JournalToastState {
  message: string;
  variant: 'success' | 'warning' | 'error';
}

export interface JournalTitleMeta {
  journalNumber: string;
  customerName: string;
  contractorName: string;
  responsibleKeeper: string;
}

export interface JournalExportModalState {
  format: 'xlsx' | 'csv';
}

export interface StoSectionJumpItem {
  id: string;
  label: string;
  colKey: string;
  rangeLabel: string;
  isRepairSection?: boolean;
}

export const STO_SECTION_JUMPS: StoSectionJumpItem[] = [
  { id: 'base', label: 'Основные', colKey: 'col1', rangeLabel: '1–5' },
  { id: 'elements', label: 'Элементы', colKey: 'col6', rangeLabel: '6–10' },
  { id: 'marking', label: 'Маркировка', colKey: 'col11', rangeLabel: '11–14' },
  { id: 'tech', label: 'Технология', colKey: 'col15', rangeLabel: '15–20' },
  { id: 'control', label: 'Приёмка ВИК и НК', colKey: 'col21', rangeLabel: '21–31' },
  { id: 'repair', label: 'Ремонт', colKey: 'col32', rangeLabel: '32–37', isRepairSection: true },
  { id: 'post_repair', label: 'После ремонта', colKey: 'col38', rangeLabel: '38–48', isRepairSection: true },
  { id: 'note', label: 'Примечание', colKey: 'col49', rangeLabel: '49' },
];

/**
 * Корректное склонение русских существительных с числительными (1 стык, 2 стыка, 5 стыков, 21 стык).
 */
export function pluralizeRu(
  count: number,
  one: string,
  few: string,
  many: string
): string {
  const abs = Math.abs(Math.trunc(count));
  const mod100 = abs % 100;
  const mod10 = abs % 10;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
