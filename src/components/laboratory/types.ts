import {
  ControlResult,
  LabConclusionMethodKey,
  NdtLabControlStage,
  NdtMethod,
  WeldJoint,
} from '../../types/welding';
import { buildJointLabMarking, buildLabConclusionNumber } from '../../utils/labMarking';
import { NdtLineDeficitRow } from '../../utils/laboratoryLogic';

export type LaboratorySubTab = 'deficit' | 'requests' | 'conclusions';

export interface LabMethodDraft {
  reportNumber: string;
  date: string;
  result: ControlResult;
  inspector: string;
}

export interface LabJointDraftRow {
  stage: NdtLabControlStage;
  includeVik: boolean;
  vikReportNumber: string;
  vikDate: string;
  vikResult: ControlResult;
  vikInspector: string;
  ndtMethod: NdtMethod;
  ndtReportNumber: string;
  ndtDate: string;
  ndtResult: ControlResult;
  ndtInspector: string;
  methods: Record<LabConclusionMethodKey, LabMethodDraft>;
  isDirty: boolean;
}

export interface RequestModalState {
  isOpen: boolean;
  lineRow: NdtLineDeficitRow | null;
  selectedJointIds: string[];
  controlStage: NdtLabControlStage;
  requestedMethod: NdtMethod;
  requestedMethods: LabConclusionMethodKey[];
  ptoEngineerName: string;
  notes: string;
}

export const NDT_METHODS_LIST: NdtMethod[] = ['РК', 'УЗК', 'ПВК', 'МК', 'РК+УЗК'];

export const CONTROL_STAGES_LIST: NdtLabControlStage[] = [
  'Первичный ВИК и НК',
  'Физический НК (РК/УЗК/ПВК)',
  'Повторный НК после ремонта',
  'Дублирующий контроль',
];

export const CONCLUSION_RESULTS_LIST: ControlResult[] = [
  'Не проводился',
  'Годен',
  'Ремонт',
  'Вырезать',
  'В работе',
];

export function createDraftFromJoint(
  joint: WeldJoint,
  defaultStage: NdtLabControlStage,
  defaultInspector: string
): LabJointDraftRow {
  const todayIso = new Date().toISOString().slice(0, 10);
  const safeDate =
    joint.weldingDate && joint.weldingDate > todayIso ? joint.weldingDate : todayIso;
  const { marking, isComplete } = buildJointLabMarking(joint);
  const stageMode: 'primary' | 'repair' | 'duplicate' =
    defaultStage === 'Повторный НК после ремонта'
      ? 'repair'
      : defaultStage === 'Дублирующий контроль'
      ? 'duplicate'
      : 'primary';

  const autoNum = (m: LabConclusionMethodKey) =>
    isComplete
      ? buildLabConclusionNumber(m, marking, stageMode, (joint.repairCount ?? 0) + 1)
      : '';

  const lc = joint.labConclusions || {};

  const buildMethodDraft = (
    m: LabConclusionMethodKey,
    fallbackNumber: string,
    fallbackDate: string,
    fallbackResult: ControlResult,
    fallbackInspector: string
  ): LabMethodDraft => {
    const existing = lc[m];
    if (existing) {
      return {
        reportNumber: existing.reportNumber || (existing.result !== 'Не проводился' ? autoNum(m) : ''),
        date: existing.date || safeDate,
        result: existing.result || 'Не проводился',
        inspector: existing.inspector || defaultInspector,
      };
    }
    const res = fallbackResult || 'Не проводился';
    return {
      reportNumber: fallbackNumber || (res !== 'Не проводился' ? autoNum(m) : ''),
      date: fallbackDate || safeDate,
      result: res,
      inspector: fallbackInspector || defaultInspector,
    };
  };

  if (defaultStage === 'Повторный НК после ремонта') {
    const repNdtMethod =
      joint.repairNdtType && joint.repairNdtType !== 'Не требуется'
        ? joint.repairNdtType
        : joint.ndtType && joint.ndtType !== 'Не требуется'
        ? joint.ndtType
        : 'РК';
    const repVikRes = joint.repairVikResult || 'Не проводился';
    const repNdtRes = joint.repairNdtResult || 'Не проводился';

    return {
      stage: defaultStage,
      includeVik: true,
      vikReportNumber: joint.repairVikNumber || '',
      vikDate: joint.repairVikDate || safeDate,
      vikResult: repVikRes !== 'Не проводился' ? repVikRes : 'Годен',
      vikInspector: joint.repairVikInspector || defaultInspector,
      ndtMethod: repNdtMethod,
      ndtReportNumber: joint.repairNdtNumber || '',
      ndtDate: joint.repairNdtDate || safeDate,
      ndtResult:
        repNdtRes !== 'Не проводился' && repNdtRes !== 'В работе' ? repNdtRes : 'Годен',
      ndtInspector: joint.repairNdtInspector || defaultInspector,
      methods: {
        ВИК: {
          reportNumber: joint.repairVikNumber || autoNum('ВИК'),
          date: joint.repairVikDate || safeDate,
          result: repVikRes,
          inspector: joint.repairVikInspector || defaultInspector,
        },
        РК: {
          reportNumber: repNdtMethod === 'РК' ? joint.repairNdtNumber || '' : '',
          date: joint.repairNdtDate || safeDate,
          result: repNdtMethod === 'РК' ? repNdtRes : 'Не проводился',
          inspector: joint.repairNdtInspector || defaultInspector,
        },
        УЗК: {
          reportNumber: repNdtMethod === 'УЗК' ? joint.repairNdtNumber || '' : '',
          date: joint.repairNdtDate || safeDate,
          result: repNdtMethod === 'УЗК' ? repNdtRes : 'Не проводился',
          inspector: joint.repairNdtInspector || defaultInspector,
        },
        ПВК: {
          reportNumber: repNdtMethod === 'ПВК' ? joint.repairNdtNumber || '' : '',
          date: joint.repairNdtDate || safeDate,
          result: repNdtMethod === 'ПВК' ? repNdtRes : 'Не проводился',
          inspector: joint.repairNdtInspector || defaultInspector,
        },
      },
      isDirty: false,
    };
  }

  if (defaultStage === 'Дублирующий контроль') {
    const dupMethod =
      joint.dupNdtType && joint.dupNdtType !== 'Не требуется'
        ? joint.dupNdtType
        : joint.ndtType && joint.ndtType !== 'Не требуется'
        ? joint.ndtType
        : 'УЗК';
    const dupRes = joint.dupNdtResult || 'Не проводился';

    return {
      stage: defaultStage,
      includeVik: false,
      vikReportNumber: joint.vikReportNumber || '',
      vikDate: joint.vikDate || safeDate,
      vikResult: joint.vikResult || 'Годен',
      vikInspector: joint.vikInspector || defaultInspector,
      ndtMethod: dupMethod,
      ndtReportNumber: joint.dupNdtReportNumber || '',
      ndtDate: joint.dupNdtDate || safeDate,
      ndtResult: dupRes !== 'Не проводился' && dupRes !== 'В работе' ? dupRes : 'Годен',
      ndtInspector: joint.dupNdtInspector || defaultInspector,
      methods: {
        ВИК: buildMethodDraft('ВИК', joint.vikReportNumber || '', joint.vikDate || safeDate, joint.vikResult || 'Не проводился', joint.vikInspector || defaultInspector),
        РК: {
          reportNumber: dupMethod === 'РК' ? joint.dupNdtReportNumber || '' : '',
          date: joint.dupNdtDate || safeDate,
          result: dupMethod === 'РК' ? dupRes : 'Не проводился',
          inspector: joint.dupNdtInspector || defaultInspector,
        },
        УЗК: {
          reportNumber: dupMethod === 'УЗК' ? joint.dupNdtReportNumber || '' : '',
          date: joint.dupNdtDate || safeDate,
          result: dupMethod === 'УЗК' ? dupRes : 'Не проводился',
          inspector: joint.dupNdtInspector || defaultInspector,
        },
        ПВК: {
          reportNumber: dupMethod === 'ПВК' ? joint.dupNdtReportNumber || '' : '',
          date: joint.dupNdtDate || safeDate,
          result: dupMethod === 'ПВК' ? dupRes : 'Не проводился',
          inspector: joint.dupNdtInspector || defaultInspector,
        },
      },
      isDirty: false,
    };
  }

  const primaryPhysType =
    joint.ndtType && joint.ndtType !== 'Не требуется' ? joint.ndtType : 'РК';
  const primaryPhysRes = joint.ndtResult || 'Не проводился';

  return {
    stage: defaultStage,
    includeVik: defaultStage === 'Первичный ВИК и НК',
    vikReportNumber: joint.vikReportNumber || '',
    vikDate: joint.vikDate || safeDate,
    vikResult:
      joint.vikResult &&
      joint.vikResult !== 'Не проводился' &&
      joint.vikResult !== 'В работе'
        ? joint.vikResult
        : 'Годен',
    vikInspector: joint.vikInspector || defaultInspector,
    ndtMethod: primaryPhysType,
    ndtReportNumber: joint.ndtReportNumber || '',
    ndtDate: joint.ndtDate || safeDate,
    ndtResult:
      primaryPhysRes !== 'Не проводился' && primaryPhysRes !== 'В работе'
        ? primaryPhysRes
        : 'Годен',
    ndtInspector: joint.ndtInspector || defaultInspector,
    methods: {
      ВИК: buildMethodDraft(
        'ВИК',
        joint.vikReportNumber || '',
        joint.vikDate || safeDate,
        joint.vikResult || 'Не проводился',
        joint.vikInspector || defaultInspector
      ),
      РК: buildMethodDraft(
        'РК',
        primaryPhysType === 'РК' ? joint.ndtReportNumber || '' : '',
        joint.ndtDate || safeDate,
        primaryPhysType === 'РК' ? primaryPhysRes : 'Не проводился',
        joint.ndtInspector || defaultInspector
      ),
      УЗК: buildMethodDraft(
        'УЗК',
        primaryPhysType === 'УЗК' ? joint.ndtReportNumber || '' : '',
        joint.ndtDate || safeDate,
        primaryPhysType === 'УЗК' ? primaryPhysRes : 'Не проводился',
        joint.ndtInspector || defaultInspector
      ),
      ПВК: buildMethodDraft(
        'ПВК',
        primaryPhysType === 'ПВК' || primaryPhysType === 'МК'
          ? joint.ndtReportNumber || ''
          : '',
        joint.ndtDate || safeDate,
        primaryPhysType === 'ПВК' || primaryPhysType === 'МК'
          ? primaryPhysRes
          : 'Не проводился',
        joint.ndtInspector || defaultInspector
      ),
    },
    isDirty: false,
  };
}
