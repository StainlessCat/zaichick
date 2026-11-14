import {
  AuditLogEntry,
  ColumnTemplate,
  FacilityObject,
  LRVItem,
  ProjectLineItem,
  TechCardItem,
  UserAccount,
  WelderProfile,
  WeldingMaterialCertificate,
  WeldJoint,
  WeldJointFieldKey,
} from '../types/welding';
import type { FacilityGeoOverride } from './useServerSync';
import {
  useDirectoryErrorHandlers,
  useEnsureFacilityId,
  useLineListActions,
  useLrvActions,
  useMaterialsActions,
  useSystemDirectoryActions,
  useTechCardsActions,
  useWeldersActions,
} from './directories';

export interface UseDirectoryActionsParams {
  currentUser: UserAccount;
  setCurrentUser: React.Dispatch<React.SetStateAction<UserAccount>>;
  userAccounts: UserAccount[];
  setUserAccounts: React.Dispatch<React.SetStateAction<UserAccount[]>>;
  joints: WeldJoint[];
  setJoints: React.Dispatch<React.SetStateAction<WeldJoint[]>>;
  projectLineList: ProjectLineItem[];
  setProjectLineList: React.Dispatch<React.SetStateAction<ProjectLineItem[]>>;
  lrvCatalog: LRVItem[];
  setLrvCatalog: React.Dispatch<React.SetStateAction<LRVItem[]>>;
  welders: WelderProfile[];
  setWelders: React.Dispatch<React.SetStateAction<WelderProfile[]>>;
  techCards: TechCardItem[];
  setTechCards: React.Dispatch<React.SetStateAction<TechCardItem[]>>;
  weldingMaterials: WeldingMaterialCertificate[];
  setWeldingMaterials: React.Dispatch<
    React.SetStateAction<WeldingMaterialCertificate[]>
  >;
  serverFacilities: FacilityObject[];
  setServerFacilities: React.Dispatch<React.SetStateAction<FacilityObject[]>>;
  derivedFacilities: FacilityObject[];
  auditLogs: AuditLogEntry[];
  setAuditLogs: React.Dispatch<React.SetStateAction<AuditLogEntry[]>>;
  templates: ColumnTemplate[];
  setTemplates: React.Dispatch<React.SetStateAction<ColumnTemplate[]>>;
  activeTemplateId: string;
  setActiveTemplateId: React.Dispatch<React.SetStateAction<string>>;
  columnOrder: WeldJointFieldKey[];
  visibleColumns: WeldJointFieldKey[];
  columnWidths: Record<string, number>;
  selectedObjectName: string;
  setSelectedObjectName: React.Dispatch<React.SetStateAction<string>>;
  selectedRdCode: string;
  setSelectedRdCode: React.Dispatch<React.SetStateAction<string>>;
  setSelectedJointIds: React.Dispatch<React.SetStateAction<string[]>>;
  recordUndoSnapshot: (actionLabel: string) => void;
  appendSystemAuditEntry: (
    operationLabel: string,
    lineId: string,
    jointNum: string,
    fieldLabel: string,
    oldVal: string,
    newVal: string,
    jointId?: string,
    opType?: AuditLogEntry['operationType']
  ) => void;
  handleApplyTemplate: (tpl: ColumnTemplate) => void;
  initialColumnTemplates: ColumnTemplate[];
  handleSaveFacilityLocationLocal: (
    facilityName: string,
    loc: FacilityGeoOverride
  ) => void;
  handleCreateStandaloneObjectLocal: (objectName: string) => void;
  isAuthenticated: boolean;
  setIsDbSyncing: React.Dispatch<React.SetStateAction<boolean>>;
  setIsAuthenticated: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLoginModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setLastSyncError?: React.Dispatch<React.SetStateAction<string | null>>;
  bumpRevisionMeta: (actionLabel: string, byUser?: string) => void;
}

export function useDirectoryActions(params: UseDirectoryActionsParams) {
  const {
    currentUser,
    setCurrentUser,
    userAccounts,
    setUserAccounts,
    joints,
    setJoints,
    projectLineList,
    setProjectLineList,
    lrvCatalog,
    setLrvCatalog,
    welders,
    setWelders,
    techCards,
    setTechCards,
    weldingMaterials,
    setWeldingMaterials,
    serverFacilities,
    setServerFacilities,
    derivedFacilities,
    auditLogs,
    setAuditLogs,
    templates,
    setTemplates,
    activeTemplateId,
    setActiveTemplateId,
    columnOrder,
    visibleColumns,
    columnWidths,
    selectedObjectName,
    setSelectedObjectName,
    selectedRdCode,
    setSelectedRdCode,
    setSelectedJointIds,
    recordUndoSnapshot,
    appendSystemAuditEntry,
    handleApplyTemplate,
    initialColumnTemplates,
    handleSaveFacilityLocationLocal,
    handleCreateStandaloneObjectLocal,
    isAuthenticated,
    setIsDbSyncing,
    setIsAuthenticated,
    setIsLoginModalOpen,
    setLastSyncError,
    bumpRevisionMeta,
  } = params;

  const { notifyError, reportError } = useDirectoryErrorHandlers(
    setIsAuthenticated,
    setIsLoginModalOpen,
    setLastSyncError
  );

  const ensureFacilityId = useEnsureFacilityId(
    serverFacilities,
    derivedFacilities,
    setServerFacilities
  );

  const lineListActions = useLineListActions({
    currentUser,
    projectLineList,
    setProjectLineList,
    joints,
    setJoints,
    lrvCatalog,
    setLrvCatalog,
    serverFacilities,
    setServerFacilities,
    selectedObjectName,
    setSelectedObjectName,
    selectedRdCode,
    setSelectedRdCode,
    setSelectedJointIds,
    recordUndoSnapshot,
    bumpRevisionMeta,
    isAuthenticated,
    setIsDbSyncing,
    setIsLoginModalOpen,
    notifyError,
    reportError,
    ensureFacilityId,
    handleSaveFacilityLocationLocal,
    handleCreateStandaloneObjectLocal,
  });

  const weldersActions = useWeldersActions({
    currentUser,
    welders,
    setWelders,
    recordUndoSnapshot,
    bumpRevisionMeta,
    isAuthenticated,
    setIsDbSyncing,
    setIsLoginModalOpen,
    notifyError,
    reportError,
  });

  const techCardsActions = useTechCardsActions({
    currentUser,
    techCards,
    setTechCards,
    recordUndoSnapshot,
    bumpRevisionMeta,
    isAuthenticated,
    setIsDbSyncing,
    setIsLoginModalOpen,
    notifyError,
    reportError,
  });

  const materialsActions = useMaterialsActions({
    currentUser,
    weldingMaterials,
    setWeldingMaterials,
    recordUndoSnapshot,
    bumpRevisionMeta,
    isAuthenticated,
    setIsDbSyncing,
    setIsLoginModalOpen,
    notifyError,
    reportError,
  });

  const lrvActions = useLrvActions({
    currentUser,
    lrvCatalog,
    setLrvCatalog,
    selectedObjectName,
    derivedFacilities,
    ensureFacilityId,
    recordUndoSnapshot,
    bumpRevisionMeta,
    isAuthenticated,
    setIsDbSyncing,
    setIsLoginModalOpen,
    notifyError,
    reportError,
  });

  const systemActions = useSystemDirectoryActions({
    currentUser,
    setCurrentUser,
    userAccounts,
    setUserAccounts,
    auditLogs,
    setAuditLogs,
    templates,
    setTemplates,
    activeTemplateId,
    setActiveTemplateId,
    columnOrder,
    visibleColumns,
    columnWidths,
    initialColumnTemplates,
    handleApplyTemplate,
    recordUndoSnapshot,
    appendSystemAuditEntry,
    isAuthenticated,
    setIsLoginModalOpen,
    notifyError,
    reportError,
  });

  return {
    ...lineListActions,
    ...weldersActions,
    ...techCardsActions,
    ...materialsActions,
    ...lrvActions,
    ...systemActions,
  };
}
