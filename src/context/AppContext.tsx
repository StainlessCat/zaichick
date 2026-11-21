import React, { createContext, useContext, useMemo } from 'react';
import {
  AppSection,
  AuditLogEntry,
  FacilityObject,
  LRVItem,
  NdtLabRequest,
  ProjectLineItem,
  ServerDbMetadata,
  TechCardItem,
  TestCircuit,
  WelderProfile,
  WeldingMaterialCertificate,
  WeldJoint,
} from '../types/welding';
import { AppDataSnapshot } from '../hooks/appState/types';
import type { FacilityGeoOverride } from '../hooks/useServerSync';

export type AuditOperationType = AuditLogEntry['operationType'];

export interface AppContextValue {
  // Navigation & Scope
  activeSection: AppSection;
  setActiveSection: (sec: AppSection) => void;
  selectedObjectName: string;
  setSelectedObjectName: (name: string) => void;
  selectedRdCode: string;
  setSelectedRdCode: (rd: string) => void;

  // Domain Entities
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
  setWeldingMaterials: React.Dispatch<React.SetStateAction<WeldingMaterialCertificate[]>>;
  facilityGeoOverrides: Record<string, FacilityGeoOverride>;
  setFacilityGeoOverrides: React.Dispatch<React.SetStateAction<Record<string, FacilityGeoOverride>>>;
  auditLogs: AuditLogEntry[];
  setAuditLogs: React.Dispatch<React.SetStateAction<AuditLogEntry[]>>;
  labRequests: NdtLabRequest[];
  setLabRequests: React.Dispatch<React.SetStateAction<NdtLabRequest[]>>;
  testCircuits: TestCircuit[];
  setTestCircuits: React.Dispatch<React.SetStateAction<TestCircuit[]>>;
  derivedFacilities: FacilityObject[];

  // Server & Sync Status
  isDbConnected: boolean;
  isDbSyncing: boolean;
  pendingSyncCount: number;
  lastSyncError: string | null;
  serverDbMeta: ServerDbMetadata | null;
  onTriggerSync: () => Promise<boolean>;

  // Undo / Redo / History
  undoStack: AppDataSnapshot[];
  redoStack: AppDataSnapshot[];
  canUndo: boolean;
  canRedo: boolean;
  handleUndo: () => void;
  handleRedo: () => void;
  recordUndoSnapshot: (label: string) => void;
  appendSystemAuditEntry: (
    actionType: string,
    uniqueLineId: string,
    jointNumber: string,
    fieldChanged: string,
    oldValue: string,
    newValue: string,
    jointId?: string,
    explicitOperationType?: AuditOperationType
  ) => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export interface AppProviderProps extends AppContextValue {
  children: React.ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({
  children,
  ...valueProps
}) => {
  const value = useMemo<AppContextValue>(
    () => valueProps,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      valueProps.activeSection,
      valueProps.selectedObjectName,
      valueProps.selectedRdCode,
      valueProps.joints,
      valueProps.projectLineList,
      valueProps.lrvCatalog,
      valueProps.welders,
      valueProps.techCards,
      valueProps.weldingMaterials,
      valueProps.facilityGeoOverrides,
      valueProps.auditLogs,
      valueProps.labRequests,
      valueProps.testCircuits,
      valueProps.derivedFacilities,
      valueProps.isDbConnected,
      valueProps.isDbSyncing,
      valueProps.pendingSyncCount,
      valueProps.lastSyncError,
      valueProps.serverDbMeta,
      valueProps.undoStack.length,
      valueProps.redoStack.length,
      valueProps.canUndo,
      valueProps.canRedo,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = (): AppContextValue => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

export const useOptionalAppContext = (): AppContextValue | null => {
  return useContext(AppContext);
};
