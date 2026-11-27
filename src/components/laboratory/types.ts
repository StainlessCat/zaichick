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

export const CONTROL_STAGE_LABELS: Record<NdtLabControlStage, string> = {
  'Первичный ВИК и НК': 'Первичный ВИК и НК',
  'Физический НК (РК/УЗК/ПВК)': 'Физический НК',
  'Повторный НК после ремонта': 'Повторный НК после ремонта',
  'Дублирующий контроль': 'Дублирующий контроль',
};

export const CONCLUSION_RESULTS_LIST: ControlResult[] = [
  'Не проводился',
  'Годен',
  'Ремонт',
  'Вырезать',
  'В работе',
];

function matchesNdtMethod(
  ndtType: NdtMethod | string | undefined,
  method: 'РК' | 'УЗК' | 'ПВК'
): boolean {
  if (!ndtType) return false;
  if (method === 'РК') return ndtType === 'РК' || ndtType === 'РК+УЗК';
  if (method === 'УЗК') return ndtType === 'УЗК' || ndtType === 'РК+УЗК';
  if (method === 'ПВК') return ndtType === 'ПВК' || ndtType === 'МК';
  return false;
}

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
    const stageMatches =
      existing &&
      (stageMode === 'primary'
        ? !existing.stage || existing.stage === 'primary'
        : existing.stage === stageMode);

    if (existing && stageMatches) {
      return {
        reportNumber:
          existing.reportNumber || (existing.result !== 'Не проводился' ? autoNum(m) : ''),
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
        ВИК: buildMethodDraft(
          'ВИК',
          joint.repairVikNumber || '',
          joint.repairVikDate || safeDate,
          repVikRes,
          joint.repairVikInspector || defaultInspector
        ),
        РК: buildMethodDraft(
          'РК',
          matchesNdtMethod(repNdtMethod, 'РК') ? joint.repairNdtNumber || '' : '',
          joint.repairNdtDate || safeDate,
          matchesNdtMethod(repNdtMethod, 'РК') ? repNdtRes : 'Не проводился',
          joint.repairNdtInspector || defaultInspector
        ),
        УЗК: buildMethodDraft(
          'УЗК',
          matchesNdtMethod(repNdtMethod, 'УЗК') ? joint.repairNdtNumber || '' : '',
          joint.repairNdtDate || safeDate,
          matchesNdtMethod(repNdtMethod, 'УЗК') ? repNdtRes : 'Не проводился',
          joint.repairNdtInspector || defaultInspector
        ),
        ПВК: buildMethodDraft(
          'ПВК',
          matchesNdtMethod(repNdtMethod, 'ПВК') ? joint.repairNdtNumber || '' : '',
          joint.repairNdtDate || safeDate,
          matchesNdtMethod(repNdtMethod, 'ПВК') ? repNdtRes : 'Не проводился',
          joint.repairNdtInspector || defaultInspector
        ),
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
        ВИК: buildMethodDraft(
          'ВИК',
          joint.vikReportNumber || '',
          joint.vikDate || safeDate,
          joint.vikResult || 'Не проводился',
          joint.vikInspector || defaultInspector
        ),
        РК: buildMethodDraft(
          'РК',
          matchesNdtMethod(dupMethod, 'РК') ? joint.dupNdtReportNumber || '' : '',
          joint.dupNdtDate || safeDate,
          matchesNdtMethod(dupMethod, 'РК') ? dupRes : 'Не проводился',
          joint.dupNdtInspector || defaultInspector
        ),
        УЗК: buildMethodDraft(
          'УЗК',
          matchesNdtMethod(dupMethod, 'УЗК') ? joint.dupNdtReportNumber || '' : '',
          joint.dupNdtDate || safeDate,
          matchesNdtMethod(dupMethod, 'УЗК') ? dupRes : 'Не проводился',
          joint.dupNdtInspector || defaultInspector
        ),
        ПВК: buildMethodDraft(
          'ПВК',
          matchesNdtMethod(dupMethod, 'ПВК') ? joint.dupNdtReportNumber || '' : '',
          joint.dupNdtDate || safeDate,
          matchesNdtMethod(dupMethod, 'ПВК') ? dupRes : 'Не проводился',
          joint.dupNdtInspector || defaultInspector
        ),
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
        matchesNdtMethod(primaryPhysType, 'РК') ? joint.ndtReportNumber || '' : '',
        joint.ndtDate || safeDate,
        matchesNdtMethod(primaryPhysType, 'РК') ? primaryPhysRes : 'Не проводился',
        joint.ndtInspector || defaultInspector
      ),
      УЗК: buildMethodDraft(
        'УЗК',
        matchesNdtMethod(primaryPhysType, 'УЗК') ? joint.ndtReportNumber || '' : '',
        joint.ndtDate || safeDate,
        matchesNdtMethod(primaryPhysType, 'УЗК') ? primaryPhysRes : 'Не проводился',
        joint.ndtInspector || defaultInspector
      ),
      ПВК: buildMethodDraft(
        'ПВК',
        matchesNdtMethod(primaryPhysType, 'ПВК') ? joint.ndtReportNumber || '' : '',
        joint.ndtDate || safeDate,
        matchesNdtMethod(primaryPhysType, 'ПВК') ? primaryPhysRes : 'Не проводился',
        joint.ndtInspector || defaultInspector
      ),
    },
    isDirty: false,
  };
}
