export type ExecutiveDocStatus = 'IN_WORK' | 'SIGNED';

export type PreStageStatus = 'SIGNED' | 'NOT_SIGNED';

export type PhysicsStatus = 'ACCEPTED' | 'NOT_ACCEPTED';

export type GeodesyStatus = 'SIGNED' | 'NOT_SIGNED' | 'NOT_REQUIRED';

export type ExecutiveDocColumnKey =
  | 'testContour'
  | 'rdCode'
  | 'lineNumber'
  | 'priority'
  | 'idStatus'
  | 'weldingReadinessPct'
  | 'workProducer'
  | 'ptoEngineer'
  | 'preStageStatus'
  | 'physicsStatus'
  | 'ndtDeficitCount'
  | 'vkDeficitCount'
  | 'geodesyStatus'
  | 'noteText';

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
  ndtDeficitJointNumbers: string[];
  vkDeficitCount: number;
  vkDeficitItems: ExecutiveDocVkDeficitItem[];
  geodesyStatus: GeodesyStatus;
  noteText: string;
  noteUpdatedAt: string | null;
  version: number;
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
    key: 'testContour',
    label: 'Контур испытания',
    defaultWidth: 160,
    minWidth: 110,
    align: 'left',
  },
  {
    key: 'rdCode',
    label: 'Шифр РД',
    defaultWidth: 155,
    minWidth: 110,
    align: 'left',
  },
  {
    key: 'lineNumber',
    label: 'Линия',
    defaultWidth: 135,
    minWidth: 95,
    align: 'left',
  },
  {
    key: 'priority',
    label: 'Приоритет',
    defaultWidth: 108,
    minWidth: 88,
    align: 'center',
  },
  {
    key: 'idStatus',
    label: 'Статус ИД',
    defaultWidth: 126,
    minWidth: 105,
    align: 'left',
  },
  {
    key: 'weldingReadinessPct',
    label: 'Готовность по сварке, %',
    defaultWidth: 138,
    minWidth: 105,
    align: 'right',
  },
  {
    key: 'workProducer',
    label: 'Производитель работ',
    defaultWidth: 158,
    minWidth: 120,
    align: 'left',
  },
  {
    key: 'ptoEngineer',
    label: 'Инженер ПТО',
    defaultWidth: 150,
    minWidth: 115,
    align: 'left',
  },
  {
    key: 'preStageStatus',
    label: 'Предэтап',
    defaultWidth: 128,
    minWidth: 108,
    align: 'left',
  },
  {
    key: 'physicsStatus',
    label: 'Физика',
    defaultWidth: 124,
    minWidth: 104,
    align: 'left',
  },
  {
    key: 'ndtDeficitCount',
    label: 'Дефицит по НК',
    defaultWidth: 118,
    minWidth: 96,
    align: 'right',
  },
  {
    key: 'vkDeficitCount',
    label: 'Дефицит ВК',
    defaultWidth: 112,
    minWidth: 92,
    align: 'right',
  },
  {
    key: 'geodesyStatus',
    label: 'Геодезия',
    defaultWidth: 138,
    minWidth: 115,
    align: 'left',
  },
  {
    key: 'noteText',
    label: 'Примечание',
    defaultWidth: 260,
    minWidth: 170,
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
