import {
  ControlResult,
  NdtLabControlStage,
  NdtMethod,
  WeldJoint,
} from '../../types/welding';
import { NdtLineDeficitRow } from '../../utils/laboratoryLogic';

export type LaboratorySubTab = 'deficit' | 'requests' | 'conclusions';

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
  isDirty: boolean;
}

export interface RequestModalState {
  isOpen: boolean;
  lineRow: NdtLineDeficitRow | null;
  selectedJointIds: string[];
  controlStage: NdtLabControlStage;
  requestedMethod: NdtMethod;
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

  if (defaultStage === 'Повторный НК после ремонта') {
    return {
      stage: defaultStage,
      includeVik: true,
      vikReportNumber: joint.repairVikNumber || '',
      vikDate: joint.repairVikDate || safeDate,
      vikResult:
        joint.repairVikResult && joint.repairVikResult !== 'Не проводился'
          ? joint.repairVikResult
          : 'Годен',
      vikInspector: joint.repairVikInspector || defaultInspector,
      ndtMethod:
        joint.repairNdtType && joint.repairNdtType !== 'Не требуется'
          ? joint.repairNdtType
          : joint.ndtType && joint.ndtType !== 'Не требуется'
          ? joint.ndtType
          : 'РК',
      ndtReportNumber: joint.repairNdtNumber || '',
      ndtDate: joint.repairNdtDate || safeDate,
      ndtResult:
        joint.repairNdtResult &&
        joint.repairNdtResult !== 'Не проводился' &&
        joint.repairNdtResult !== 'В работе'
          ? joint.repairNdtResult
          : 'Годен',
      ndtInspector: joint.repairNdtInspector || defaultInspector,
      isDirty: false,
    };
  }

  if (defaultStage === 'Дублирующий контроль') {
    return {
      stage: defaultStage,
      includeVik: false,
      vikReportNumber: joint.vikReportNumber || '',
      vikDate: joint.vikDate || safeDate,
      vikResult: joint.vikResult || 'Годен',
      vikInspector: joint.vikInspector || defaultInspector,
      ndtMethod:
        joint.dupNdtType && joint.dupNdtType !== 'Не требуется'
          ? joint.dupNdtType
          : joint.ndtType && joint.ndtType !== 'Не требуется'
          ? joint.ndtType
          : 'УЗК',
      ndtReportNumber: joint.dupNdtReportNumber || '',
      ndtDate: joint.dupNdtDate || safeDate,
      ndtResult:
        joint.dupNdtResult &&
        joint.dupNdtResult !== 'Не проводился' &&
        joint.dupNdtResult !== 'В работе'
          ? joint.dupNdtResult
          : 'Годен',
      ndtInspector: joint.dupNdtInspector || defaultInspector,
      isDirty: false,
    };
  }

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
    ndtMethod:
      joint.ndtType && joint.ndtType !== 'Не требуется' ? joint.ndtType : 'РК',
    ndtReportNumber: joint.ndtReportNumber || '',
    ndtDate: joint.ndtDate || safeDate,
    ndtResult:
      joint.ndtResult &&
      joint.ndtResult !== 'Не проводился' &&
      joint.ndtResult !== 'В работе'
        ? joint.ndtResult
        : 'Годен',
    ndtInspector: joint.ndtInspector || defaultInspector,
    isDirty: false,
  };
}
