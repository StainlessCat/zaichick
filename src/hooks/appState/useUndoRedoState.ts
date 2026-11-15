import { useCallback, useState } from 'react';
import type {
  AuditLogEntry,
  LRVItem,
  ProjectLineItem,
  TechCardItem,
  UserAccount,
  WelderProfile,
  WeldingMaterialCertificate,
  WeldJoint,
} from '../../types/welding';
import {
  createSystemAuditEntry,
  getRedoActionLabel,
  getUndoActionLabel,
  MAX_HISTORY_STEPS,
  performRedoStep,
  performUndoStep,
  pushHistorySnapshot,
} from '../../utils/undoRedo';
import type { FacilityGeoOverride } from '../useServerSync';
import type { AppDataSnapshot } from './types';

export interface UseUndoRedoStateParams {
  currentUser: UserAccount;
  selectedRdCode: string;
  joints: WeldJoint[];
  setJoints: React.Dispatch<React.SetStateAction<WeldJoint[]>>;
  projectLineList: ProjectLineItem[];
  setProjectLineList: React.Dispatch<React.SetStateAction<ProjectLineItem[]>>;
  lrvCatalog: LRVItem[];
  setLrvCatalog: React.Dispatch<React.SetStateAction<LRVItem[]>>;
  auditLogs: AuditLogEntry[];
  setAuditLogs: React.Dispatch<React.SetStateAction<AuditLogEntry[]>>;
  welders: WelderProfile[];
  setWelders: React.Dispatch<React.SetStateAction<WelderProfile[]>>;
  techCards: TechCardItem[];
  setTechCards: React.Dispatch<React.SetStateAction<TechCardItem[]>>;
  weldingMaterials: WeldingMaterialCertificate[];
  setWeldingMaterials: React.Dispatch<
    React.SetStateAction<WeldingMaterialCertificate[]>
  >;
  facilityGeoOverrides: Record<string, FacilityGeoOverride>;
  setFacilityGeoOverrides: React.Dispatch<
    React.SetStateAction<Record<string, FacilityGeoOverride>>
  >;
}

export function useUndoRedoState({
  currentUser,
  selectedRdCode,
  joints,
  setJoints,
  projectLineList,
  setProjectLineList,
  lrvCatalog,
  setLrvCatalog,
  auditLogs,
  setAuditLogs,
  welders,
  setWelders,
  techCards,
  setTechCards,
  weldingMaterials,
  setWeldingMaterials,
  facilityGeoOverrides,
  setFacilityGeoOverrides,
}: UseUndoRedoStateParams) {
  const [undoStack, setUndoStack] = useState<AppDataSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<AppDataSnapshot[]>([]);

  const appendSystemAuditEntry = useCallback(
    (
      actionType: string,
      uniqueLineId: string,
      jointNumber: string,
      fieldChanged: string,
      oldValue: string,
      newValue: string,
      jointId = 'sys-dict',
      explicitOperationType?: AuditLogEntry['operationType']
    ) => {
      const entry = createSystemAuditEntry({
        currentUser,
        actionType,
        uniqueLineId,
        jointNumber,
        fieldChanged,
        oldValue,
        newValue,
        jointId,
        selectedRdCode,
        explicitOperationType,
      });
      setAuditLogs((prev) => [entry, ...prev]);
    },
    [currentUser, selectedRdCode, setAuditLogs]
  );

  const buildCurrentSnapshot = useCallback(
    (actionLabel: string): AppDataSnapshot => ({
      actionLabel,
      joints,
      projectLineList,
      lrvCatalog,
      auditLogs,
      welders,
      techCards,
      weldingMaterials,
      facilityGeoOverrides,
    }),
    [
      joints,
      projectLineList,
      lrvCatalog,
      auditLogs,
      welders,
      techCards,
      weldingMaterials,
      facilityGeoOverrides,
    ]
  );

  const recordUndoSnapshot = useCallback(
    (actionLabel: string) => {
      const snap = buildCurrentSnapshot(actionLabel);
      setUndoStack((prev) => pushHistorySnapshot(prev, snap, MAX_HISTORY_STEPS).undoStack);
      setRedoStack([]);
    },
    [buildCurrentSnapshot]
  );

  const applySnapshotState = useCallback(
    (snap: AppDataSnapshot) => {
      setJoints(snap.joints);
      setProjectLineList(snap.projectLineList);
      setLrvCatalog(snap.lrvCatalog);
      setWelders(snap.welders);
      setTechCards(snap.techCards);
      setWeldingMaterials(snap.weldingMaterials);
      setFacilityGeoOverrides(snap.facilityGeoOverrides);
    },
    [
      setFacilityGeoOverrides,
      setJoints,
      setLrvCatalog,
      setProjectLineList,
      setTechCards,
      setWelders,
      setWeldingMaterials,
    ]
  );

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const lastAction = getUndoActionLabel(undoStack);
    const currentSnap = buildCurrentSnapshot(lastAction);
    const res = performUndoStep(
      undoStack,
      redoStack,
      currentSnap,
      MAX_HISTORY_STEPS
    );
    if (res.targetState) {
      setUndoStack(res.undoStack);
      setRedoStack(res.redoStack);
      applySnapshotState(res.targetState);
      appendSystemAuditEntry(
        'Редактирование',
        'СИСТЕМА (UNDO)',
        '—',
        'Отмена действия (Undo)',
        lastAction,
        'Состояние восстановлено'
      );
    }
  }, [
    undoStack,
    redoStack,
    buildCurrentSnapshot,
    applySnapshotState,
    appendSystemAuditEntry,
  ]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const nextAction = getRedoActionLabel(redoStack);
    const currentSnap = buildCurrentSnapshot(nextAction);
    const res = performRedoStep(
      undoStack,
      redoStack,
      currentSnap,
      MAX_HISTORY_STEPS
    );
    if (res.targetState) {
      setUndoStack(res.undoStack);
      setRedoStack(res.redoStack);
      applySnapshotState(res.targetState);
      appendSystemAuditEntry(
        'Редактирование',
        'СИСТЕМА (REDO)',
        '—',
        'Повтор действия (Redo)',
        'Отменённое состояние',
        nextAction
      );
    }
  }, [
    undoStack,
    redoStack,
    buildCurrentSnapshot,
    applySnapshotState,
    appendSystemAuditEntry,
  ]);

  return {
    undoStack,
    setUndoStack,
    redoStack,
    setRedoStack,
    recordUndoSnapshot,
    handleUndo,
    handleRedo,
    appendSystemAuditEntry,
  };
}
