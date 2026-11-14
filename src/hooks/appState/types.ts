import type {
  AuditLogEntry,
  FacilityObject,
  LRVItem,
  ProjectLineItem,
  TechCardItem,
  WelderProfile,
  WeldingMaterialCertificate,
  WeldJoint,
} from '../../types/welding';
import type { FacilityGeoOverride } from '../useServerSync';

export interface AppDataSnapshot {
  actionLabel: string;
  joints: WeldJoint[];
  projectLineList: ProjectLineItem[];
  lrvCatalog: LRVItem[];
  auditLogs: AuditLogEntry[];
  welders: WelderProfile[];
  techCards: TechCardItem[];
  weldingMaterials: WeldingMaterialCertificate[];
  facilityGeoOverrides: Record<string, FacilityGeoOverride>;
}
