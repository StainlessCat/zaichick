import {
  FacilityObject,
  JournalStandard,
  LRVItem,
  ProjectLineItem,
  WeldingMaterialCertificate,
  WeldJoint,
} from '../../types/welding';

export interface WeldingJournalsViewProps {
  joints: WeldJoint[];
  allJoints?: WeldJoint[];
  lines?: ProjectLineItem[];
  facilities?: FacilityObject[];
  materials?: WeldingMaterialCertificate[];
  lrvCatalog?: LRVItem[];
  selectedObjectName: string;
  selectedRdCode?: string;
  onEditJoint: (joint: WeldJoint) => void;
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
  jointsCount: number;
}

export interface LineWeldingAlert {
  total: number;
  welded: number;
  unweldedCount: number;
  isFullyWelded: boolean;
  unweldedJointNumbers: string[];
}
