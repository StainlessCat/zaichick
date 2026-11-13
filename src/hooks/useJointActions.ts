import { useCallback } from 'react';
import {
  ApiError,
  computeJointDiffPatch,
  mapConflictDtoToUi,
  zaychickApi,
} from '../api';
import {
  AuditLogEntry,
  FacilityObject,
  OptimisticLockConflictPayload,
  ProjectLineItem,
  UserAccount,
  WeldJoint,
} from '../types/welding';
import {
  ALL_COLUMNS,
  applyBulkUpdateToJoints,
  buildUniqueLineId,
  FIELD_LABELS_MAP,
  formatDateDDMMYY,
  suggestNextJointNumber,
} from '../utils/weldingLogic';
import {
  enforceFieldLevelRbacOnJointSave,
  filterBulkPatchByRole,
  getUserRolePermissions,
} from '../utils/rbac';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface UseJointActionsParams {
  currentUser: UserAccount;
  joints: WeldJoint[];
  setJoints: React.Dispatch<React.SetStateAction<WeldJoint[]>>;
  projectLineList: ProjectLineItem[];
  setProjectLineList: React.Dispatch<React.SetStateAction<ProjectLineItem[]>>;
  serverFacilities: FacilityObject[];
  setServerFacilities: React.Dispatch<React.SetStateAction<FacilityObject[]>>;
  derivedFacilities: FacilityObject[];
  filteredAndSortedJoints: WeldJoint[];
  selectedJointIds: string[];
  setSelectedJointIds: React.Dispatch<React.SetStateAction<string[]>>;
  setConfirmBulkDeleteJoints: React.Dispatch<React.SetStateAction<boolean>>;
  setAuditLogs: React.Dispatch<React.SetStateAction<AuditLogEntry[]>>;
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
  recordUndoSnapshot: (actionLabel: string) => void;
  passportModalMode: 'create' | 'edit';
  passportBaseJointRef: React.MutableRefObject<WeldJoint | null>;
  setPassportModal: React.Dispatch<
    React.SetStateAction<{
      isOpen: boolean;
      mode: 'create' | 'edit';
      joint: WeldJoint | null;
    }>
  >;
  siteWeatherTempC: string;
  activeConflict: OptimisticLockConflictPayload | null;
  setActiveConflict: React.Dispatch<
    React.SetStateAction<OptimisticLockConflictPayload | null>
  >;
  isAuthenticated: boolean;
  setIsDbConnected: React.Dispatch<React.SetStateAction<boolean>>;
  setIsDbSyncing: React.Dispatch<React.SetStateAction<boolean>>;
  setIsAuthenticated: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLoginModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingSyncCount: React.Dispatch<React.SetStateAction<number>>;
  setLastSyncError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsServerDbModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isApplyingServerStateRef: React.MutableRefObject<boolean>;
  bumpRevisionMeta: (actionLabel: string, byUser?: string) => void;
}

export function useJointActions(params: UseJointActionsParams) {
  const {
    currentUser,
    joints,
    setJoints,
    projectLineList,
    setProjectLineList,
    serverFacilities,
    setServerFacilities,
    derivedFacilities,
    filteredAndSortedJoints,
    selectedJointIds,
    setSelectedJointIds,
    setConfirmBulkDeleteJoints,
    setAuditLogs,
    appendSystemAuditEntry,
    recordUndoSnapshot,
    passportModalMode,
    passportBaseJointRef,
    setPassportModal,
    siteWeatherTempC,
    activeConflict,
    setActiveConflict,
    isAuthenticated,
    setIsDbConnected,
    setIsDbSyncing,
    setIsAuthenticated,
    setIsLoginModalOpen,
    setPendingSyncCount,
    setLastSyncError,
    setIsServerDbModalOpen,
    isApplyingServerStateRef,
    bumpRevisionMeta,
  } = params;

  const userPermissions = getUserRolePermissions(currentUser);

  const ensureLineIdForJoint = useCallback(
    async (joint: WeldJoint): Promise<string> => {
      if (joint.lineId && UUID_RE.test(joint.lineId)) {
        return joint.lineId;
      }
      const existingLine = projectLineList.find(
        (l) =>
          (joint.uniqueLineId && l.uniqueLineId === joint.uniqueLineId) ||
          (l.rdCode === joint.rdCode && l.lineNumber === joint.lineNumber)
      );
      if (existingLine && UUID_RE.test(existingLine.id)) {
        return existingLine.id;
      }

      const objectName =
        joint.objectName ||
        existingLine?.objectName ||
        derivedFacilities[0]?.name ||
        'Объект строительства';
      let facilityId = existingLine?.facilityId;
      if (!facilityId || !UUID_RE.test(facilityId)) {
        const matchedFac =
          serverFacilities.find((f) => f.name === objectName && UUID_RE.test(f.id)) ||
          derivedFacilities.find((f) => f.name === objectName && UUID_RE.test(f.id));
        if (matchedFac) {
          facilityId = matchedFac.id;
        } else {
          const createdFac = await zaychickApi.createFacility({ name: objectName });
          setServerFacilities((prev) =>
            prev.some((f) => f.id === createdFac.id) ? prev : [...prev, createdFac]
          );
          facilityId = createdFac.id;
        }
      }

      const linePayload: ProjectLineItem = existingLine || {
        id: `line-auto-${Date.now()}`,
        facilityId,
        objectName,
        rdCode: joint.rdCode || 'РД-01',
        lineNumber: joint.lineNumber || '1',
        uniqueLineId:
          joint.uniqueLineId ||
          buildUniqueLineId(joint.rdCode || 'РД-01', joint.lineNumber || '1'),
        lineName: joint.lineNumber || '1',
        product: '',
        testContour: joint.contour || '',
        weldingNtd: 'СТО Газпром 15-1.1-002-2023',
        controlNtd: 'СТО Газпром 15-1.1-002-2023',
        qualityLevel: 'B',
        pipelineCategory: 'II',
        workingPressure: '',
        workingTemperature: '',
        rkPercent: 100,
        uzkPercent: 0,
        pvkPercent: 0,
        testDate: '',
      };
      const createdLine = await zaychickApi.createLine(linePayload, facilityId);
      setProjectLineList((prev) =>
        prev.some((l) => l.id === createdLine.id) ? prev : [createdLine, ...prev]
      );
      return createdLine.id;
    },
    [
      derivedFacilities,
      projectLineList,
      serverFacilities,
      setProjectLineList,
      setServerFacilities,
    ]
  );

  const handleApiFailure = useCallback(
    (
      err: unknown,
      fallbackJoint?: WeldJoint,
      baseSnapshot?: WeldJoint | null
    ): void => {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setIsAuthenticated(false);
          setIsLoginModalOpen(true);
          alert('[Срок действия сессии истёк]\nСессия не активна или завершена. Выполните повторный вход в систему.');
          return;
        }
        if (err.status === 409 && err.conflict && fallbackJoint) {
          setActiveConflict(
            mapConflictDtoToUi(err.conflict, fallbackJoint, baseSnapshot)
          );
          return;
        }
        if (err.status === 409) {
          alert(`[Ошибка уникальности / конфликта версий]\n${err.message}`);
          return;
        }
        if (err.status === 403) {
          alert(`[Недостаточно прав (RBAC)]\nУ вашей учётной записи нет прав для выполнения этой операции: ${err.message}`);
          return;
        }
        if (err.status === 422) {
          alert(`[Отказ сервера: нарушение доменных правил]\n\n${err.message}`);
          return;
        }
        alert(`[Ошибка сервера PostgreSQL HTTP ${err.status}]\n${err.message}`);
        return;
      }

      const msg =
        err instanceof Error ? err.message : 'Сетевой сбой при обращении к серверу';
      setIsDbConnected(false);
      setPendingSyncCount((c) => c + 1);
      setLastSyncError('Сервер FastAPI недоступен (порт 8000)');
      alert(
        `[Сервер FastAPI недоступен]\n${msg}\n\nПроверьте, что backend запущен на порту 8000 и СУБД PostgreSQL доступна. Изменение не сохранено.`
      );
    },
    [
      setActiveConflict,
      setIsAuthenticated,
      setIsDbConnected,
      setIsLoginModalOpen,
      setLastSyncError,
      setPendingSyncCount,
    ]
  );

  const commitServerJointToState = useCallback(
    (committed: WeldJoint, actionLabel: string) => {
      isApplyingServerStateRef.current = true;
      setJoints((prev) =>
        prev.some((j) => j.id === committed.id)
          ? prev.map((j) => (j.id === committed.id ? committed : j))
          : [committed, ...prev]
      );
      setIsDbConnected(true);
      setPendingSyncCount(0);
      setLastSyncError(null);
      bumpRevisionMeta(actionLabel, currentUser.fullName);
      window.setTimeout(() => {
        isApplyingServerStateRef.current = false;
      }, 60);
    },
    [
      bumpRevisionMeta,
      currentUser.fullName,
      isApplyingServerStateRef,
      setIsDbConnected,
      setJoints,
      setLastSyncError,
      setPendingSyncCount,
    ]
  );

  const handleSaveJointFromPassport = useCallback(
    async (
      rawSavedJoint: WeldJoint,
      isSupplementary: boolean,
      usedCrossRdLrv: boolean
    ) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        alert('[Ошибка доступа]\nСохранение невозможно: требуется авторизация на сервере FastAPI.');
        return;
      }
      const existing = joints.find((j) => j.id === rawSavedJoint.id);
      if (!existing && !userPermissions.canCreateOrDeleteJoints) {
        return;
      }
      const savedJoint = enforceFieldLevelRbacOnJointSave(
        existing,
        rawSavedJoint,
        currentUser
      );
      recordUndoSnapshot(
        `Сохранение паспорта стыка № ${savedJoint.jointNumber}`
      );
      const baseSnapshot = passportBaseJointRef.current || existing || null;
      const expectedVersion =
        passportModalMode === 'create' || !existing
          ? null
          : baseSnapshot?.version ?? existing.version ?? 1;

      try {
        setIsDbSyncing(true);
        let committed: WeldJoint;
        if (!existing || !UUID_RE.test(savedJoint.id)) {
          const lineId = await ensureLineIdForJoint(savedJoint);
          committed = await zaychickApi.createJoint(
            { ...savedJoint, isSupplementary },
            lineId
          );
        } else {
          const patch = computeJointDiffPatch(existing, {
            ...savedJoint,
            isSupplementary,
          });
          const keysToSend =
            Object.keys(patch).length > 0
              ? patch
              : ({ weldingDate: savedJoint.weldingDate } as Partial<WeldJoint>);
          committed = await zaychickApi.updateJoint(
            savedJoint.id,
            keysToSend,
            expectedVersion ?? 1
          );
        }

        commitServerJointToState(
          committed,
          `Сохранение стыка № ${committed.jointNumber}`
        );

        const logs = await zaychickApi.listAuditLogs(1, 150).catch(() => null);
        if (logs) {
          setAuditLogs(logs);
        } else if (!existing && usedCrossRdLrv) {
          appendSystemAuditEntry(
            'Создание стыка',
            committed.uniqueLineId,
            committed.jointNumber,
            'Заимствование ЛРВ из другого шифра РД',
            committed.rdCode,
            `ЛРВ ${committed.lrv1Code} / ${committed.lrv2Code}`,
            committed.id
          );
        }
      } catch (err) {
        handleApiFailure(err, { ...savedJoint, isSupplementary }, baseSnapshot);
      } finally {
        setIsDbSyncing(false);
      }
    },
    [
      appendSystemAuditEntry,
      commitServerJointToState,
      currentUser,
      ensureLineIdForJoint,
      handleApiFailure,
      joints,
      passportBaseJointRef,
      passportModalMode,
      recordUndoSnapshot,
      setAuditLogs,
      setIsDbSyncing,
      userPermissions.canCreateOrDeleteJoints,
    ]
  );

  const handleAcceptServerConflictVersion = useCallback(
    (serverJoint: WeldJoint) => {
      isApplyingServerStateRef.current = true;
      setJoints((prev) =>
        prev.map((j) => (j.id === serverJoint.id ? serverJoint : j))
      );
      appendSystemAuditEntry(
        'Редактирование',
        serverJoint.uniqueLineId,
        serverJoint.jointNumber,
        'Разрешение конфликта блокировки (OCC): принята версия PostgreSQL',
        `Локальная правка v${activeConflict?.expectedVersion ?? 1}`,
        `Серверная версия v${
          serverJoint.version ?? activeConflict?.actualServerVersion ?? 2
        } (${serverJoint.updatedBy})`,
        serverJoint.id
      );
      setActiveConflict(null);
      window.setTimeout(() => {
        isApplyingServerStateRef.current = false;
      }, 60);
    },
    [
      activeConflict?.actualServerVersion,
      activeConflict?.expectedVersion,
      appendSystemAuditEntry,
      isApplyingServerStateRef,
      setActiveConflict,
      setJoints,
    ]
  );

  const handleApplyAutoMergeConflict = useCallback(
    async (mergedJoint: WeldJoint) => {
      const conflictSnap = activeConflict;
      if (!conflictSnap) return;
      try {
        setIsDbSyncing(true);
        const patch = computeJointDiffPatch(
          conflictSnap.serverRecord as WeldJoint,
          mergedJoint
        );
        const committed = await zaychickApi.updateJoint(
          mergedJoint.id,
          patch,
          conflictSnap.actualServerVersion
        );
        commitServerJointToState(
          committed,
          `Auto-Merge OCC стыка № ${committed.jointNumber}`
        );
        setActiveConflict(null);
      } catch (err) {
        handleApiFailure(err, mergedJoint, conflictSnap.serverRecord as WeldJoint);
      } finally {
        setIsDbSyncing(false);
      }
    },
    [
      activeConflict,
      commitServerJointToState,
      handleApiFailure,
      setActiveConflict,
      setIsDbSyncing,
    ]
  );

  const handleForceClientConflictOverwrite = useCallback(
    async (clientJoint: WeldJoint) => {
      const conflictSnap = activeConflict;
      if (!conflictSnap) return;
      try {
        setIsDbSyncing(true);
        const patch = computeJointDiffPatch(
          conflictSnap.serverRecord as WeldJoint,
          clientJoint
        );
        const committed = await zaychickApi.updateJoint(
          clientJoint.id,
          patch,
          conflictSnap.actualServerVersion
        );
        commitServerJointToState(
          committed,
          `Перезапись OCC стыка № ${committed.jointNumber}`
        );
        setActiveConflict(null);
      } catch (err) {
        handleApiFailure(err, clientJoint, conflictSnap.serverRecord as WeldJoint);
      } finally {
        setIsDbSyncing(false);
      }
    },
    [
      activeConflict,
      commitServerJointToState,
      handleApiFailure,
      setActiveConflict,
      setIsDbSyncing,
    ]
  );

  const handleTriggerSimulatedConflict = useCallback(
    async (jointId: string) => {
      const targetJoint = joints.find((j) => j.id === jointId) || joints[0];
      if (!targetJoint) return;

      const baseSnapshot: WeldJoint = {
        ...targetJoint,
        version: targetJoint.version ?? 1,
      };
      const staleVersion = baseSnapshot.version ?? 1;

      if (!UUID_RE.test(baseSnapshot.id)) {
        alert(
          'Стенд OCC 409 работает с записями, сохранёнными в PostgreSQL. Войдите в систему и выберите серверный стык.'
        );
        return;
      }

      try {
        setIsDbSyncing(true);
        // 1. Фиксируем фоновую правку на сервере, чтобы увеличить version до staleVersion + 1
        const backgroundPatch: Partial<WeldJoint> = {
          vikResult: baseSnapshot.vikResult === 'Годен' ? 'Ремонт' : 'Годен',
          ndtReportNumber: `УЗК-OCC-${new Date().toISOString().slice(11, 19)}`,
        };
        const updatedServerJoint = await zaychickApi.updateJoint(
          baseSnapshot.id,
          backgroundPatch,
          staleVersion
        );
        commitServerJointToState(
          updatedServerJoint,
          `OCC-тест: фоновая правка стыка № ${updatedServerJoint.jointNumber}`
        );

        // 2. Отправляем конкурирующую правку со старым version -> сервер гарантированно вернёт HTTP 409 Conflict
        const competingClientJoint: WeldJoint = {
          ...baseSnapshot,
          preheatTemp: baseSnapshot.preheatTemp === '150' ? '180' : '150',
          updatedBy: currentUser.fullName,
          updatedAt: new Date().toISOString(),
        };
        try {
          await zaychickApi.updateJoint(
            baseSnapshot.id,
            { preheatTemp: competingClientJoint.preheatTemp },
            staleVersion
          );
        } catch (err) {
          if (err instanceof ApiError && err.status === 409 && err.conflict) {
            setIsServerDbModalOpen(false);
            setActiveConflict(
              mapConflictDtoToUi(err.conflict, competingClientJoint, baseSnapshot)
            );
            return;
          }
          throw err;
        }
      } catch (err) {
        handleApiFailure(err);
      } finally {
        setIsDbSyncing(false);
      }
    },
    [
      commitServerJointToState,
      currentUser.fullName,
      handleApiFailure,
      joints,
      setActiveConflict,
      setIsDbSyncing,
      setIsServerDbModalOpen,
    ]
  );

  const handleDeleteJointFromPassport = useCallback(
    async (jointToDelete: WeldJoint) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        alert('[Ошибка доступа]\nУдаление невозможно: требуется авторизация на сервере FastAPI.');
        return;
      }
      recordUndoSnapshot(`Удаление стыка № ${jointToDelete.jointNumber}`);
      try {
        if (UUID_RE.test(jointToDelete.id)) {
          setIsDbSyncing(true);
          await zaychickApi.deleteJoint(jointToDelete.id);
        }
        setJoints((prev) => prev.filter((j) => j.id !== jointToDelete.id));
        setSelectedJointIds((prev) =>
          prev.filter((id) => id !== jointToDelete.id)
        );
        bumpRevisionMeta(`Удалён стык № ${jointToDelete.jointNumber}`);
      } catch (err) {
        handleApiFailure(err);
      } finally {
        setIsDbSyncing(false);
      }
    },
    [
      bumpRevisionMeta,
      handleApiFailure,
      recordUndoSnapshot,
      setIsDbSyncing,
      setJoints,
      setSelectedJointIds,
    ]
  );

  const handleImportJoints = useCallback(
    async (newJoints: WeldJoint[], sourceFileName: string) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        alert('[Ошибка доступа]\nИмпорт невозможен: требуется авторизация на сервере FastAPI.');
        return;
      }
      recordUndoSnapshot(`Импорт стыков из Excel (${newJoints.length} шт.)`);
      const createdJoints: WeldJoint[] = [];
      const errors: string[] = [];
      try {
        setIsDbSyncing(true);
        for (const item of newJoints) {
          try {
            const lineId = await ensureLineIdForJoint(item);
            const created = await zaychickApi.createJoint(item, lineId);
            createdJoints.push(created);
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Ошибка импорта';
            errors.push(`Стык № ${item.jointNumber} (${item.uniqueLineId}): ${msg}`);
          }
        }
        if (createdJoints.length > 0) {
          isApplyingServerStateRef.current = true;
          setJoints((prev) => [...createdJoints, ...prev]);
          bumpRevisionMeta(
            `Импорт из «${sourceFileName}» (${createdJoints.length} шт.)`,
            currentUser.fullName
          );
          const logs = await zaychickApi.listAuditLogs(1, 150).catch(() => null);
          if (logs) setAuditLogs(logs);
          window.setTimeout(() => {
            isApplyingServerStateRef.current = false;
          }, 60);
        }
        if (errors.length > 0) {
          alert(
            `Импортировано ${createdJoints.length} из ${newJoints.length} стыков.\nОшибки валидации сервера:\n• ${errors
              .slice(0, 8)
              .join('\n• ')}`
          );
        }
      } finally {
        setIsDbSyncing(false);
      }
    },
    [
      bumpRevisionMeta,
      currentUser.fullName,
      ensureLineIdForJoint,
      isApplyingServerStateRef,
      recordUndoSnapshot,
      setAuditLogs,
      setIsDbSyncing,
      setJoints,
    ]
  );

  const handleQuickAddSupplementaryJoint = useCallback(
    (baseJoint?: WeldJoint) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        alert('[Ошибка доступа]\nСоздание стыков невозможно: требуется авторизация на сервере FastAPI.');
        return;
      }
      const refJoint = baseJoint || filteredAndSortedJoints[0] || joints[0];
      if (!refJoint) return;

      const lineJointNumbers = joints
        .filter((j) => j.uniqueLineId === refJoint.uniqueLineId)
        .map((j) => j.jointNumber);

      const nextSuppNumber = suggestNextJointNumber(
        lineJointNumbers,
        refJoint.jointNumber
      );

      const draftSupp: WeldJoint = {
        ...refJoint,
        id: `j-supp-${Date.now()}`,
        jointNumber: nextSuppNumber,
        isSupplementary: true,
        weldingDate: new Date().toISOString().slice(0, 10),
        ambientTemp: siteWeatherTempC,
        vikResult: 'В работе',
        ndtResult: 'Не проводился',
        dupNdtResult: 'Не проводился',
      };

      setPassportModal({
        isOpen: true,
        mode: 'create',
        joint: draftSupp,
      });
    },
    [filteredAndSortedJoints, joints, setPassportModal, siteWeatherTempC]
  );

  const handleApplyBulkUpdate = useCallback(
    async (rawPatch: Partial<WeldJoint>) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        alert('[Ошибка доступа]\nМассовое редактирование невозможно: требуется авторизация на сервере FastAPI.');
        return;
      }
      const patch = filterBulkPatchByRole(rawPatch, currentUser);
      if (Object.keys(patch).length === 0 || selectedJointIds.length === 0) return;

      const selectedRecords = joints.filter((j) => selectedJointIds.includes(j.id));
      recordUndoSnapshot(
        `Массовое редактирование (${selectedRecords.length} ст.)`
      );

      const serverItems = selectedRecords.filter((j) => UUID_RE.test(j.id));
      if (serverItems.length > 0) {
        try {
          setIsDbSyncing(true);
          const updatedFromServer = await zaychickApi.bulkUpdateJoints(
            serverItems.map((j) => ({
              id: j.id,
              patch,
              version: j.version ?? 1,
            }))
          );
          const updatedMap = new Map(updatedFromServer.map((u) => [u.id, u]));
          isApplyingServerStateRef.current = true;
          setJoints((prev) => prev.map((j) => updatedMap.get(j.id) || j));
          setSelectedJointIds([]);
          bumpRevisionMeta(`Массовое редактирование (${updatedFromServer.length} ст.)`);
          const logs = await zaychickApi.listAuditLogs(1, 150).catch(() => null);
          if (logs) setAuditLogs(logs);
          window.setTimeout(() => {
            isApplyingServerStateRef.current = false;
          }, 60);
        } catch (err) {
          handleApiFailure(err);
        } finally {
          setIsDbSyncing(false);
        }
        return;
      }

      const { updatedJoints, auditEntries } = applyBulkUpdateToJoints(
        joints,
        selectedJointIds,
        patch,
        currentUser,
        FIELD_LABELS_MAP
      );
      setJoints(updatedJoints);
      if (auditEntries.length > 0) {
        setAuditLogs((prev) => [...auditEntries, ...prev]);
      }
      setSelectedJointIds([]);
    },
    [
      bumpRevisionMeta,
      currentUser,
      handleApiFailure,
      isApplyingServerStateRef,
      joints,
      recordUndoSnapshot,
      selectedJointIds,
      setAuditLogs,
      setIsDbSyncing,
      setJoints,
      setSelectedJointIds,
    ]
  );

  const handleBulkDeleteSelectedJoints = useCallback(async () => {
    if (!isAuthenticated || !currentUser.login) {
      setIsLoginModalOpen(true);
      alert('[Ошибка доступа]\nМассовое удаление невозможно: требуется авторизация на сервере FastAPI.');
      return;
    }
    if (selectedJointIds.length === 0) return;
    const idSet = new Set(selectedJointIds);
    const removedJoints = joints.filter((j) => idSet.has(j.id));
    if (removedJoints.length === 0) return;

    recordUndoSnapshot(`Массовое удаление стыков (${removedJoints.length} шт.)`);
    try {
      setIsDbSyncing(true);
      for (const j of removedJoints) {
        if (UUID_RE.test(j.id)) {
          await zaychickApi.deleteJoint(j.id);
        }
      }
      setJoints((prev) => prev.filter((j) => !idSet.has(j.id)));
      setSelectedJointIds([]);
      setConfirmBulkDeleteJoints(false);
      bumpRevisionMeta(`Удалено стыков: ${removedJoints.length}`);
      const logs = await zaychickApi.listAuditLogs(1, 150).catch(() => null);
      if (logs) setAuditLogs(logs);
    } catch (err) {
      handleApiFailure(err);
    } finally {
      setIsDbSyncing(false);
    }
  }, [
    bumpRevisionMeta,
    handleApiFailure,
    joints,
    recordUndoSnapshot,
    selectedJointIds,
    setAuditLogs,
    setConfirmBulkDeleteJoints,
    setIsDbSyncing,
    setJoints,
    setSelectedJointIds,
  ]);

  // Unused imports guard for helpers available if callers inspect formatted audit fields
  void ALL_COLUMNS;
  void formatDateDDMMYY;

  return {
    handleSaveJointFromPassport,
    handleAcceptServerConflictVersion,
    handleApplyAutoMergeConflict,
    handleForceClientConflictOverwrite,
    handleTriggerSimulatedConflict,
    handleDeleteJointFromPassport,
    handleImportJoints,
    handleQuickAddSupplementaryJoint,
    handleApplyBulkUpdate,
    handleBulkDeleteSelectedJoints,
  };
}
