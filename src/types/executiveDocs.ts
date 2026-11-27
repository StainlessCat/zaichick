export type ExecutiveDocStatus = 'IN_WORK' | 'SIGNED';

export type PreStageStatus = 'SIGNED' | 'NOT_SIGNED';

export type PhysicsStatus = 'ACCEPTED' | 'NOT_ACCEPTED';

export type GeodesyStatus = 'SIGNED' | 'NOT_SIGNED' | 'NOT_REQUIRED';

export type ExecutiveDocColumnKey =
  | 'lineNumber'
  | 'rdCode'
  | 'testContour'
  | 'priority'
  | 'idStatus'
  | 'weldingReadinessPct'
  | 'ndtDeficitCount'
  | 'vkDeficitCount'
  | 'preStageStatus'
  | 'physicsStatus'
  | 'geodesyStatus'
  | 'workProducer'
  | 'ptoEngineer'
  | 'noteText';

export type ExecutiveDocQuickFilter =
  | 'all'
  | 'signed'
  | 'ready'
  | 'ndt_deficit'
  | 'vk_deficit'
  | 'attention';

export type ExecutiveDocNdtMethodCode = 'ВИК' | 'РК' | 'УЗК' | 'ПВК';

export interface ExecutiveDocNdtMethodStat {
  method: ExecutiveDocNdtMethodCode;
  planPct: number;
  required: number;
  passed: number;
  deficit: number;
}

export interface ExecutiveDocNdtDeficitDetail {
  jointId: string;
  jointNumber: string;
  missingMethods: Array<ExecutiveDocNdtMethodCode | 'Ремонт'>;
  reason: string;
  isDefect: boolean;
}

export interface ExecutiveDocRecord {
  id?: string;
  lineId: string;
  priority: number | null;
  idStatus: ExecutiveDocStatus;
  workProducer: string | null;
  ptoEngineer: string | null;
  preStageStatus: PreStageStatus;
  physicsStatus: PhysicsStatus;
  geodesyStatus: GeodesyStatus;
  noteText: string | null;
  noteUpdatedAt: string | null;
  version: number;
  updatedAt?: string | null;
}

export interface ExecutiveDocPatch {
  priority?: number | null;
  idStatus?: ExecutiveDocStatus;
  workProducer?: string | null;
  ptoEngineer?: string | null;
  preStageStatus?: PreStageStatus;
  physicsStatus?: PhysicsStatus;
  geodesyStatus?: GeodesyStatus;
  noteText?: string | null;
}

export interface ExecutiveDocVkDeficitItem {
  id: string;
  lrvCode: string;
  shortName: string;
  reason?: 'no_act' | 'unlinked';
  jointNumbers?: string[];
}

export interface ExecutiveDocReadinessBlocker {
  key: 'welding' | 'ndt' | 'vk' | 'preStage' | 'physics' | 'geodesy';
  label: string;
  detail: string;
}

export interface ExecutiveDocsSummaryStats {
  totalLines: number;
  signedCount: number;
  inWorkCount: number;
  readyToSignCount: number;
  ndtDeficitLinesCount: number;
  vkDeficitLinesCount: number;
  attentionLinesCount: number;
  totalJoints: number;
  weldedJoints: number;
  weightedWeldingPct: number;
}

export interface ExecutiveDocRow {
  lineId: string;
  objectName: string;
  uniqueLineId: string;
  testContour: string;
  testContoursList: string[];
  rdCode: string;
  lineNumber: string;
  priority: number | null;
  idStatus: ExecutiveDocStatus;
  weldingReadinessPct: number;
  weldedJointsCount: number;
  totalJointsCount: number;
  workProducer: string;
  ptoEngineer: string;
  preStageStatus: PreStageStatus;
  physicsStatus: PhysicsStatus;
  ndtDeficitCount: number;
  ndtDeficitChecks: number;
  ndtDeficitJointNumbers: string[];
  ndtDeficitDetails: ExecutiveDocNdtDeficitDetail[];
  ndtMethodStats: ExecutiveDocNdtMethodStat[];
  ndtDeficitSummary: string;
  vkDeficitCount: number;
  unlinkedVkCount: number;
  vkDeficitItems: ExecutiveDocVkDeficitItem[];
  geodesyStatus: GeodesyStatus;
  noteText: string;
  noteUpdatedAt: string | null;
  version: number;
  readinessBlockers: ExecutiveDocReadinessBlocker[];
  isReadyToSign: boolean;
  hasSignedAnomaly: boolean;
}

export interface ExecutiveDocColumnDef {
  key: ExecutiveDocColumnKey;
  label: string;
  defaultWidth: number;
  minWidth: number;
  align: 'left' | 'center' | 'right';
}

export const EXECUTIVE_DOC_COLUMNS: ExecutiveDocColumnDef[] = [
  {
    key: 'lineNumber',
    label: 'Линия',
    defaultWidth: 124,
    minWidth: 96,
    align: 'left',
  },
  {
    key: 'rdCode',
    label: 'Шифр РД',
    defaultWidth: 150,
    minWidth: 110,
    align: 'left',
  },
  {
    key: 'testContour',
    label: 'Контур испытания',
    defaultWidth: 156,
    minWidth: 110,
    align: 'left',
  },
  {
    key: 'priority',
    label: 'Приоритет',
    defaultWidth: 88,
    minWidth: 76,
    align: 'center',
  },
  {
    key: 'idStatus',
    label: 'Статус ИД',
    defaultWidth: 124,
    minWidth: 106,
    align: 'left',
  },
  {
    key: 'weldingReadinessPct',
    label: 'Сварка, %',
    defaultWidth: 110,
    minWidth: 92,
    align: 'right',
  },
  {
    key: 'ndtDeficitCount',
    label: 'Дефицит по НК',
    defaultWidth: 112,
    minWidth: 92,
    align: 'right',
  },
  {
    key: 'vkDeficitCount',
    label: 'Дефицит ВК',
    defaultWidth: 102,
    minWidth: 86,
    align: 'right',
  },
  {
    key: 'preStageStatus',
    label: 'Предэтап',
    defaultWidth: 118,
    minWidth: 102,
    align: 'left',
  },
  {
    key: 'physicsStatus',
    label: 'Физика',
    defaultWidth: 114,
    minWidth: 98,
    align: 'left',
  },
  {
    key: 'geodesyStatus',
    label: 'Геодезия',
    defaultWidth: 124,
    minWidth: 106,
    align: 'left',
  },
  {
    key: 'workProducer',
    label: 'Производитель работ',
    defaultWidth: 142,
    minWidth: 115,
    align: 'left',
  },
  {
    key: 'ptoEngineer',
    label: 'Инженер ПТО',
    defaultWidth: 136,
    minWidth: 110,
    align: 'left',
  },
  {
    key: 'noteText',
    label: 'Примечание',
    defaultWidth: 230,
    minWidth: 160,
    align: 'left',
  },
];

export const DEFAULT_EXECUTIVE_DOC_VISIBLE_COLUMNS: ExecutiveDocColumnKey[] =
  EXECUTIVE_DOC_COLUMNS.map((c) => c.key);

export const DEFAULT_EXECUTIVE_DOC_COLUMN_WIDTHS: Record<string, number> =
  EXECUTIVE_DOC_COLUMNS.reduce<Record<string, number>>((acc, col) => {
    acc[col.key] = col.defaultWidth;
    return acc;
  }, {});

export const EXECUTIVE_DOC_PRIORITY_OPTIONS: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export const EXECUTIVE_DOC_STATUS_LABELS: Record<ExecutiveDocStatus, string> = {
  IN_WORK: 'В работе',
  SIGNED: 'Подписана',
};

export const PRE_STAGE_STATUS_LABELS: Record<PreStageStatus, string> = {
  SIGNED: 'Подписан',
  NOT_SIGNED: 'Не подписан',
};

export const PHYSICS_STATUS_LABELS: Record<PhysicsStatus, string> = {
  ACCEPTED: 'Принята',
  NOT_ACCEPTED: 'Не принята',
};

export const GEODESY_STATUS_LABELS: Record<GeodesyStatus, string> = {
  SIGNED: 'Подписана',
  NOT_SIGNED: 'Не подписана',
  NOT_REQUIRED: 'Не требуется',
};
