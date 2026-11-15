import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  ClipboardList,
  Database,
  FolderKanban,
  History,
  Radiation,
  ShieldAlert,
  Wrench,
  X,
} from 'lucide-react';
import {
  ANONYMOUS_USER,
  AppSection,
  ColumnTemplate,
  NdtLabRequest,
  WeldJoint,
} from './types/welding';
import { getUserRolePermissions } from './utils/rbac';
import { exportAllJointsToFile } from './utils/excelUtils';
import { HamburgerDrawer } from './components/HamburgerDrawer';
import {
  isJointConclusionCompletedForRequest,
  syncLabRequestStatusWithJoints,
} from './utils/laboratoryLogic';
import { loadKharasaveyDemoData } from './data/seedData';
import { FullSystemBackupPayload } from './components/BackupAndResetModal';
import {
  useAppState,
  useDirectoryActions,
  useJointActions,
  useServerSync,
} from './hooks';
import { useRegistryFilters } from './hooks/useRegistryFilters';
import {
  AppHeader,
  AppMainContent,
  AppModalsContainer,
} from './components/layout';
import { zaychickApi } from './api';
import { AppProvider, AuthProvider } from './context';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const App: React.FC = () => {
  const appState = useAppState();

  const {
    userAccounts,
    setUserAccounts,
    currentUser,
    setCurrentUser,
    serverFacilities,
    setServerFacilities,
    isLoginModalOpen,
    setIsLoginModalOpen,
    loginModalInitialMode,
    setLoginModalInitialMode,
    isDrawerOpen,
    setIsDrawerOpen,
    activeSection,
    setActiveSection,
    selectedObjectName,
    setSelectedObjectName,
    selectedRdCode,
    setSelectedRdCode,
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
    locationModalFacilityName,
    setLocationModalFacilityName,
    undoStack,
    setUndoStack,
    redoStack,
    setRedoStack,
    recordUndoSnapshot,
    handleUndo,
    handleRedo,
    appendSystemAuditEntry,
    templates,
    setTemplates,
    activeTemplateId,
    setActiveTemplateId,
    columnOrder,
    setColumnOrder,
    visibleColumns,
    setVisibleColumns,
    isColumnsModalOpen,
    setIsColumnsModalOpen,
    columnWidths,
    handleResetColumnWidths,
    handleColumnAutoFit,
    handleColumnResizeStart,
    siteWeather,
    derivedFacilities,
    dynamicInspectors,
    currentFacility,
    activeLocationFacility,
    activeColumnDefs,
    handleSaveFacilityLocation: handleSaveFacilityLocationLocal,
    handleBulkUpdateJointsTemperaturesFromStation,
    handleCreateStandaloneObject: handleCreateStandaloneObjectLocal,
  } = appState;

  const LAB_REQUESTS_STORAGE_KEY = 'zaychick_lab_requests_v1';
  const [labRequests, setLabRequests] = useState<NdtLabRequest[]>(() => {
    try {
      const raw = window.localStorage.getItem(LAB_REQUESTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed as NdtLabRequest[];
      }
    } catch {
      // ignore storage errors
    }
    return [];
  });

  const {
    serverDbMeta,
    bumpRevisionMeta,
    isDbConnected,
    setIsDbConnected,
    isDbSyncing,
    setIsDbSyncing,
    isAuthenticated,
    setIsAuthenticated,
    pendingSyncCount,
    setPendingSyncCount,
    lastSyncError,
    setLastSyncError,
    triggerImmediateSync,
    isServerDbModalOpen,
    setIsServerDbModalOpen,
    activeConflict,
    setActiveConflict,
    isApplyingServerStateRef,
    fetchServerDbState,
  } = useServerSync({
    currentUser,
    setCurrentUser,
    setIsLoginModalOpen,
    setServerFacilities,
    setJoints,
    setProjectLineList,
    setLrvCatalog,
    setWelders,
    setTechCards,
    setWeldingMaterials,
    setUserAccounts,
    setAuditLogs,
    setTemplates,
    setLabRequests,
    setFacilityGeoOverrides,
  });

  const [backupModalState, setBackupModalState] = useState<{
    isOpen: boolean;
    initialTab: 'backup' | 'author_reset';
  }>({
    isOpen: false,
    initialTab: 'backup',
  });

  const logoClickCountRef = useRef(0);
  const logoClickTimerRef = useRef<number | null>(null);

  const handleHeaderLogoSecretClick = useCallback(() => {
    logoClickCountRef.current += 1;
    if (logoClickTimerRef.current) {
      window.clearTimeout(logoClickTimerRef.current);
    }
    if (logoClickCountRef.current >= 5) {
      logoClickCountRef.current = 0;
      setBackupModalState({ isOpen: true, initialTab: 'author_reset' });
      return;
    }
    logoClickTimerRef.current = window.setTimeout(() => {
      logoClickCountRef.current = 0;
    }, 2500);
  }, []);

  const [confirmBulkDeleteJoints, setConfirmBulkDeleteJoints] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        LAB_REQUESTS_STORAGE_KEY,
        JSON.stringify(labRequests)
      );
    } catch {
      // ignore storage errors
    }
  }, [labRequests]);

  useEffect(() => {
    const jointsById = new Map<string, WeldJoint>(
      joints.map((j) => [j.id, j])
    );
    setLabRequests((prev) => {
      let changed = false;
      const next = prev.map((req) => {
        const synced = syncLabRequestStatusWithJoints(req, jointsById);
        if (synced !== req) changed = true;
        return synced;
      });
      return changed ? next : prev;
    });
  }, [joints]);

  // Горячие клавиши Ctrl+Z (Undo), Ctrl+Y / Ctrl+Shift+Z (Redo) и секретная консоль автора
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.altKey &&
        e.key.toLowerCase() === 'z'
      ) {
        e.preventDefault();
        setBackupModalState({ isOpen: true, initialTab: 'author_reset' });
        return;
      }

      if (isInput) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  const filters = useRegistryFilters({
    joints,
    selectedObjectName,
    selectedRdCode,
    labRequests,
    visibleColumns,
    setVisibleColumns,
    setColumnOrder,
    setIsColumnsModalOpen,
  });

  const passportBaseJointRef = useRef<WeldJoint | null>(null);
  useEffect(() => {
    if (filters.passportModal.isOpen && filters.passportModal.joint) {
      passportBaseJointRef.current = { ...filters.passportModal.joint };
    } else if (!filters.passportModal.isOpen) {
      passportBaseJointRef.current = null;
    }
  }, [filters.passportModal.isOpen, filters.passportModal.joint]);

  const handleApplyTemplate = useCallback(
    (tpl: ColumnTemplate) => {
      setColumnOrder(tpl.columnOrder);
      setVisibleColumns(tpl.visibleColumns);
      setActiveTemplateId(tpl.id);
    },
    [setActiveTemplateId, setColumnOrder, setVisibleColumns]
  );

  const dirActions = useDirectoryActions({
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
    setSelectedJointIds: filters.setSelectedJointIds,
    recordUndoSnapshot,
    appendSystemAuditEntry,
    handleApplyTemplate,
    initialColumnTemplates: templates,
    handleSaveFacilityLocationLocal,
    handleCreateStandaloneObjectLocal,
    isAuthenticated,
    setIsDbSyncing,
    setIsAuthenticated,
    setIsLoginModalOpen,
    setLastSyncError,
    bumpRevisionMeta,
  });

  const jointActions = useJointActions({
    currentUser,
    joints,
    setJoints,
    projectLineList,
    setProjectLineList,
    serverFacilities,
    setServerFacilities,
    derivedFacilities,
    filteredAndSortedJoints: filters.filteredAndSortedJoints,
    selectedJointIds: filters.selectedJointIds,
    setSelectedJointIds: filters.setSelectedJointIds,
    setConfirmBulkDeleteJoints,
    setAuditLogs,
    appendSystemAuditEntry,
    recordUndoSnapshot,
    passportModalMode: filters.passportModal.mode,
    passportBaseJointRef,
    setPassportModal: filters.setPassportModal,
    siteWeatherTempC: siteWeather.tempC,
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
  });

  const userPermissions = getUserRolePermissions(currentUser);

  const [isLoadingDemoDataset, setIsLoadingDemoDataset] = useState(false);

  const handleLoadKharasaveyDemo = useCallback(async () => {
    setIsLoadingDemoDataset(true);
    try {
      const demoData = await loadKharasaveyDemoData();
      recordUndoSnapshot('Загрузка демонстрационного массива Харасавэй (1271 стык)');
      setJoints((prev) => {
        const existingIds = new Set(prev.map((j) => j.id));
        return [...prev, ...demoData.joints.filter((j) => !existingIds.has(j.id))];
      });
      setLrvCatalog((prev) => {
        const existingCodes = new Set(prev.map((l) => l.lrvCode));
        return [...prev, ...demoData.lrvCatalog.filter((l) => !existingCodes.has(l.lrvCode))];
      });
      setProjectLineList((prev) => {
        const existingIds = new Set(prev.map((l) => l.uniqueLineId));
        return [...prev, ...demoData.projectLineList.filter((l) => !existingIds.has(l.uniqueLineId))];
      });
      appendSystemAuditEntry(
        'Загрузка демонстрационного массива УКПГ-1С',
        'УКПГ-1С:ALL',
        `${demoData.joints.length} ст.`,
        'Демонстрационные данные',
        '—',
        `Загружено ${demoData.joints.length} стыков и ${demoData.projectLineList.length} линий проекта УКПГ-1С`,
        'demo-load',
        'bulk_edit'
      );
      bumpRevisionMeta('Загружен демо-массив Харасавэй (1271 стык)', currentUser.fullName);
    } catch (err) {
      console.error('Ошибка подгрузки демо-датасета Харасавэй:', err);
    } finally {
      setIsLoadingDemoDataset(false);
    }
  }, [
    appendSystemAuditEntry,
    bumpRevisionMeta,
    currentUser.fullName,
    recordUndoSnapshot,
    setJoints,
    setLrvCatalog,
    setProjectLineList,
  ]);

  const handleRestoreFullBackup = useCallback(
    (payload: FullSystemBackupPayload) => {
      const data = payload.data;
      recordUndoSnapshot('Восстановление представления из JSON-бэкапа');
      if (Array.isArray(data.joints)) setJoints(data.joints);
      if (Array.isArray(data.projectLineList)) setProjectLineList(data.projectLineList);
      if (Array.isArray(data.lrvCatalog)) setLrvCatalog(data.lrvCatalog);
      if (Array.isArray(data.welders)) setWelders(data.welders);
      if (Array.isArray(data.techCards)) setTechCards(data.techCards);
      if (Array.isArray(data.weldingMaterials)) setWeldingMaterials(data.weldingMaterials);
      if (Array.isArray(data.auditLogs)) setAuditLogs(data.auditLogs);
      if (Array.isArray(data.labRequests)) setLabRequests(data.labRequests);
      if (Array.isArray(data.userAccounts) && data.userAccounts.length > 0) {
        setUserAccounts(data.userAccounts);
        setCurrentUser(data.userAccounts[0]);
      }
      if (data.facilityGeoOverrides && typeof data.facilityGeoOverrides === 'object') {
        setFacilityGeoOverrides(data.facilityGeoOverrides);
      }
      if (Array.isArray(data.templates) && data.templates.length > 0) {
        setTemplates(data.templates);
      }
      if (data.activeTemplateId) setActiveTemplateId(data.activeTemplateId);

      appendSystemAuditEntry(
        'Восстановление базы данных из резервной копии (JSON / WAL)',
        'СИСТЕМА',
        `${data.joints?.length || 0} ст.`,
        'Резервная копия',
        'Текущее состояние',
        `Восстановлено: ${data.joints?.length || 0} стыков, ${data.projectLineList?.length || 0} линий, ${data.lrvCatalog?.length || 0} ЛРВ`,
        'backup-restore',
        'bulk_edit'
      );
      bumpRevisionMeta('Восстановление БД из резервной копии', currentUser.fullName);
    },
    [
      appendSystemAuditEntry,
      bumpRevisionMeta,
      currentUser.fullName,
      recordUndoSnapshot,
      setActiveTemplateId,
      setAuditLogs,
      setCurrentUser,
      setFacilityGeoOverrides,
      setJoints,
      setLrvCatalog,
      setProjectLineList,
      setTechCards,
      setTemplates,
      setUserAccounts,
      setWelders,
      setWeldingMaterials,
    ]
  );

  const handleAuthorZeroReset = useCallback(
    async (backupConfirm: boolean): Promise<boolean> => {
      if (!backupConfirm) return false;
      try {
        setJoints([]);
        setProjectLineList([]);
        setLrvCatalog([]);
        setLabRequests([]);
        setAuditLogs([]);
        setUndoStack([]);
        setRedoStack([]);
        filters.setSelectedJointIds([]);

        appendSystemAuditEntry(
          'Полная нулевая очистка рабочей базы данных автором системы',
          'СИСТЕМА',
          '0',
          'Обнуление БД',
          'Все записи',
          'База данных очищена до нулевого состояния (Zero-Reset)',
          'zero-reset',
          'bulk_edit'
        );
        bumpRevisionMeta('Нулевая очистка рабочей базы данных', currentUser.fullName);
        return true;
      } catch (err) {
        console.error('Ошибка нулевой очистки БД:', err);
        return false;
      }
    },
    [
      appendSystemAuditEntry,
      bumpRevisionMeta,
      currentUser.fullName,
      filters,
      setAuditLogs,
      setJoints,
      setLrvCatalog,
      setProjectLineList,
      setRedoStack,
      setUndoStack,
    ]
  );

  const handleAuthorRestoreDemoSeed = useCallback(async (): Promise<boolean> => {
    try {
      const demoData = await import('./data/seedData');
      setJoints(demoData.INITIAL_JOINTS);
      setProjectLineList(demoData.INITIAL_PROJECT_LINELIST);
      setLrvCatalog(demoData.INITIAL_LRV_CATALOG);
      setWelders(demoData.WELDERS_DIRECTORY);
      setTechCards(demoData.INITIAL_TECH_CARDS);
      setWeldingMaterials(demoData.INITIAL_WELDING_MATERIALS);
      setAuditLogs(demoData.INITIAL_AUDIT_LOGS);
      setTemplates(demoData.INITIAL_COLUMN_TEMPLATES);
      setActiveTemplateId(demoData.INITIAL_COLUMN_TEMPLATES[0].id);
      setUndoStack([]);
      setRedoStack([]);
      filters.setSelectedJointIds([]);

      appendSystemAuditEntry(
        'Восстановление эталонного демонстрационного массива (Seed Data)',
        'СИСТЕМА',
        `${demoData.INITIAL_JOINTS.length} ст.`,
        'Эталонный Seed',
        '—',
        `Восстановлены эталонные объекты строительства, лайнлист и стыки`,
        'seed-restore',
        'bulk_edit'
      );
      bumpRevisionMeta('Восстановление эталонного демонстрационного массива', currentUser.fullName);
      return true;
    } catch (err) {
      console.error('Ошибка восстановления эталонного массива:', err);
      return false;
    }
  }, [
    appendSystemAuditEntry,
    bumpRevisionMeta,
    currentUser.fullName,
    filters,
    setActiveTemplateId,
    setAuditLogs,
    setJoints,
    setLrvCatalog,
    setProjectLineList,
    setRedoStack,
    setTechCards,
    setTemplates,
    setUndoStack,
    setWelders,
    setWeldingMaterials,
  ]);

  const handleCreateLabRequest = useCallback(
    async (newReq: NdtLabRequest) => {
      setLabRequests((prev) => [newReq, ...prev]);
      try {
        const fresh = await zaychickApi.createLabRequest(newReq);
        setLabRequests((prev) =>
          prev.map((r) =>
            r.id === newReq.id || r.requestNumber === newReq.requestNumber ? fresh : r
          )
        );
        bumpRevisionMeta(
          `Создана заявка на НК ${fresh.requestNumber}`,
          currentUser.fullName
        );
      } catch (err) {
        console.warn('Серверная регистрация заявки на НК не удалась:', err);
        if (setLastSyncError) {
          setLastSyncError(
            `Ошибка регистрации заявки на НК: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
      appendSystemAuditEntry(
        'Подача заявки на НК от ПТО в Лабораторию',
        newReq.uniqueLineId,
        `${newReq.jointIds.length} ст.`,
        'Заявка на НК',
        '—',
        `${newReq.requestNumber} (${newReq.requestedMethod}, ${newReq.controlStage}) — ${newReq.createdBy}`,
        newReq.jointIds[0] || 'lab-req',
        'bulk_edit'
      );
    },
    [appendSystemAuditEntry, bumpRevisionMeta, currentUser.fullName, setLastSyncError]
  );

  const handleAcceptLabRequest = useCallback(
    async (
      requestId: string,
      defectoscopistName: string,
      jointUpdates: Array<{ jointId: string; patch: Partial<WeldJoint> }>
    ) => {
      const targetReq = labRequests.find((r) => r.id === requestId);
      const acceptedAtIso = new Date().toISOString();
      const acceptedAtDisplay = acceptedAtIso.slice(0, 16).replace('T', ' ');

      setLabRequests((prev) =>
        prev.map((r) =>
          r.id === requestId
            ? {
                ...r,
                status: 'В работе ЛНК',
                acceptedAt: acceptedAtDisplay,
                acceptedBy: defectoscopistName,
              }
            : r
        )
      );

      try {
        const fresh = await zaychickApi.updateLabRequest(
          requestId,
          {
            status: 'В работе ЛНК',
            acceptedBy: defectoscopistName,
            acceptedAt: acceptedAtIso,
          },
          targetReq?.version
        );
        setLabRequests((prev) => prev.map((r) => (r.id === requestId ? fresh : r)));
      } catch (err) {
        console.warn('Серверное обновление статуса заявки не удалось:', err);
      }

      if (jointUpdates.length > 0) {
        await jointActions.handleBatchUpdateJointsFromLab(
          jointUpdates,
          `ЛНК: Приём заявки ${targetReq?.requestNumber || ''} в работу (${defectoscopistName})`
        );
      }

      appendSystemAuditEntry(
        'Приём заявки на НК в работу дефектоскопистом ЛНК',
        targetReq?.uniqueLineId || 'ЛНК',
        `${targetReq?.jointIds.length ?? jointUpdates.length} ст.`,
        'Статус заявки НК',
        'Подана ПТО',
        `В работе ЛНК (${defectoscopistName})`,
        targetReq?.jointIds[0] || 'lab-accept',
        'bulk_edit'
      );
      bumpRevisionMeta(
        `Заявка НК ${targetReq?.requestNumber || ''} принята в работу`,
        currentUser.fullName
      );
    },
    [
      appendSystemAuditEntry,
      bumpRevisionMeta,
      currentUser.fullName,
      jointActions,
      labRequests,
    ]
  );

  const handleSaveLabConclusions = useCallback(
    async (
      jointUpdates: Array<{ jointId: string; patch: Partial<WeldJoint> }>,
      actionSummary: string,
      relatedRequestId?: string
    ): Promise<boolean> => {
      if (jointUpdates.length === 0) return true;
      try {
        await jointActions.handleBatchUpdateJointsFromLab(jointUpdates, actionSummary);
        if (relatedRequestId) {
          const req = labRequests.find((r) => r.id === relatedRequestId);
          const acceptedBy = req?.acceptedBy || currentUser.fullName;
          const acceptedAt =
            req?.acceptedAt || new Date().toISOString().slice(0, 16).replace('T', ' ');

          const updatedJointsMap = new Map<string, WeldJoint>(
            joints.map((j) => [j.id, j])
          );
          for (const u of jointUpdates) {
            const current = updatedJointsMap.get(u.jointId);
            if (current) updatedJointsMap.set(u.jointId, { ...current, ...u.patch });
          }
          const allJointsDone = req?.jointIds.every((jId) => {
            const j = updatedJointsMap.get(jId);
            return j && isJointConclusionCompletedForRequest(j, req.controlStage);
          });

          const nextStatus = allJointsDone ? 'Выполнена' : (req?.status || 'В работе ЛНК');
          const completedAt = allJointsDone ? new Date().toISOString() : req?.completedAt;

          setLabRequests((prev) =>
            prev.map((r) =>
              r.id !== relatedRequestId
                ? r
                : { ...r, acceptedBy, acceptedAt, status: nextStatus, completedAt }
            )
          );

          try {
            const fresh = await zaychickApi.updateLabRequest(
              relatedRequestId,
              { acceptedBy, acceptedAt, status: nextStatus, completedAt },
              req?.version
            );
            setLabRequests((prev) =>
              prev.map((r) => (r.id === relatedRequestId ? fresh : r))
            );
          } catch (err) {
            console.warn('Серверное обновление заключения заявки не удалось:', err);
          }
        }
        return true;
      } catch (err) {
        console.error('Ошибка синхронизации заключений ЛНК с сервером:', err);
        return false;
      }
    },
    [currentUser.fullName, jointActions, joints, labRequests]
  );

  const handleDeleteLabRequest = useCallback(
    async (requestId: string): Promise<boolean> => {
      const targetReq = labRequests.find((r) => r.id === requestId);
      recordUndoSnapshot(`Удаление заявки на НК ${targetReq?.requestNumber || requestId}`);
      setLabRequests((prev) => prev.filter((r) => r.id !== requestId));
      try {
        if (UUID_RE.test(requestId)) {
          await zaychickApi.deleteLabRequest(requestId);
        }
        appendSystemAuditEntry(
          'Удаление заявки на НК',
          targetReq?.uniqueLineId || 'ЛНК',
          `${targetReq?.jointIds.length || 0} ст.`,
          'Заявка на НК',
          targetReq?.requestNumber || requestId,
          'Удалена',
          requestId,
          'delete_joint'
        );
        bumpRevisionMeta(
          `Удалена заявка на НК ${targetReq?.requestNumber || ''}`,
          currentUser.fullName
        );
        return true;
      } catch (err) {
        console.error('Ошибка удаления заявки на НК на сервере:', err);
        if (targetReq) {
          setLabRequests((prev) => [targetReq, ...prev]);
        }
        return false;
      }
    },
    [
      appendSystemAuditEntry,
      bumpRevisionMeta,
      currentUser.fullName,
      labRequests,
      recordUndoSnapshot,
    ]
  );

  const sectionLabels: Record<AppSection, string> = useMemo(
    () => ({
      registry: 'Реестр стыков и ввод данных',
      laboratory: 'Лаборатория НК',
      project_linelist: 'Проект (лайнлист)',
      welding_tech: 'Технология сварочного производства',
      journals: 'Журналы сварочных работ (СТО Газпром / ГОСТ)',
      readiness: 'Отчётность по готовности',
      lrv_catalog: 'Каталог ЛРВ и спецификации',
      audit_log: 'Журнал изменений (Аудит)',
      user_guide: 'Руководство пользователя (Иллюстрированный буклет PDF)',
    }),
    []
  );

  const sectionIcons: Record<AppSection, React.ReactNode> = useMemo(
    () => ({
      registry: <ClipboardList className="w-4 h-4 sm:w-5 sm:h-5 text-sky-300 shrink-0" />,
      laboratory: <Radiation className="w-4 h-4 sm:w-5 sm:h-5 text-sky-300 shrink-0" />,
      project_linelist: <FolderKanban className="w-4 h-4 sm:w-5 sm:h-5 text-sky-300 shrink-0" />,
      welding_tech: <Wrench className="w-4 h-4 sm:w-5 sm:h-5 text-sky-300 shrink-0" />,
      journals: <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-sky-300 shrink-0" />,
      readiness: <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-sky-300 shrink-0" />,
      lrv_catalog: <Database className="w-4 h-4 sm:w-5 sm:h-5 text-sky-300 shrink-0" />,
      audit_log: <History className="w-4 h-4 sm:w-5 sm:h-5 text-sky-300 shrink-0" />,
      user_guide: <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-sky-300 shrink-0" />,
    }),
    []
  );

  const handleLogout = useCallback(async () => {
    await zaychickApi.logout().catch(() => {});
    setIsAuthenticated(false);
    setCurrentUser(ANONYMOUS_USER);
    setIsDbConnected(false);
    setIsLoginModalOpen(true);
  }, [setCurrentUser, setIsAuthenticated, setIsDbConnected, setIsLoginModalOpen]);

  const handleSwitchUser = useCallback(async (login: string) => {
    const found = userAccounts.find((u) => u.login === login);
    if (found) {
      setCurrentUser(found);
      bumpRevisionMeta(`Переключение на пользователя ${found.login}`, found.fullName);
    }
  }, [userAccounts, setCurrentUser, bumpRevisionMeta]);

  return (
    <AuthProvider
      currentUser={currentUser}
      setCurrentUser={setCurrentUser}
      userAccounts={userAccounts}
      setUserAccounts={setUserAccounts}
      isLoginModalOpen={isLoginModalOpen}
      setIsLoginModalOpen={setIsLoginModalOpen}
      loginModalInitialMode={loginModalInitialMode}
      setLoginModalInitialMode={setLoginModalInitialMode}
      onLogout={handleLogout}
      onSwitchUser={handleSwitchUser}
    >
      <AppProvider
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        selectedObjectName={selectedObjectName}
        setSelectedObjectName={setSelectedObjectName}
        selectedRdCode={selectedRdCode}
        setSelectedRdCode={setSelectedRdCode}
        isDrawerOpen={isDrawerOpen}
        setIsDrawerOpen={setIsDrawerOpen}
        joints={joints}
        setJoints={setJoints}
        projectLineList={projectLineList}
        setProjectLineList={setProjectLineList}
        lrvCatalog={lrvCatalog}
        setLrvCatalog={setLrvCatalog}
        welders={welders}
        setWelders={setWelders}
        techCards={techCards}
        setTechCards={setTechCards}
        weldingMaterials={weldingMaterials}
        setWeldingMaterials={setWeldingMaterials}
        facilityGeoOverrides={facilityGeoOverrides}
        setFacilityGeoOverrides={setFacilityGeoOverrides}
        auditLogs={auditLogs}
        setAuditLogs={setAuditLogs}
        labRequests={labRequests}
        setLabRequests={setLabRequests}
        derivedFacilities={derivedFacilities}
        isDbConnected={isDbConnected}
        isDbSyncing={isDbSyncing}
        pendingSyncCount={pendingSyncCount}
        lastSyncError={lastSyncError}
        serverDbMeta={serverDbMeta}
        onTriggerSync={triggerImmediateSync}
        undoStack={undoStack}
        redoStack={redoStack}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        handleUndo={handleUndo}
        handleRedo={handleRedo}
        recordUndoSnapshot={recordUndoSnapshot}
        appendSystemAuditEntry={appendSystemAuditEntry}
      >
        <div className="min-h-screen flex flex-col bg-[#f4f7fb] text-slate-900">
      <AppHeader
        sectionIcons={sectionIcons}
        sectionLabels={sectionLabels}
        onLogoClick={handleHeaderLogoSecretClick}
        isAuthenticated={isAuthenticated}
        onOpenServerDbModal={() => setIsServerDbModalOpen(true)}
      />

      {!isAuthenticated && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-xs no-print">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-slate-950" />
            <span>
              {isDbConnected
                ? 'Режим инспекционного просмотра (гость, только чтение). Для внесения изменений и сохранения в СУБД выполните вход.'
                : 'Сервер FastAPI недоступен (порт 8000). Проверьте запуск приложения и подключение к PostgreSQL.'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setLoginModalInitialMode('login');
              setIsLoginModalOpen(true);
            }}
            className="px-3 py-1 rounded bg-slate-950 text-white hover:bg-slate-800 text-xs font-bold transition-colors cursor-pointer shrink-0 ml-4"
          >
            Войти в систему
          </button>
        </div>
      )}

      {lastSyncError && (
        <div
          role="alert"
          className="bg-rose-50 border-b border-rose-200 text-rose-900 px-4 py-2 text-xs font-semibold flex items-center justify-between gap-3 shadow-2xs no-print"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span className="truncate">{lastSyncError}</span>
          </div>
          <button
            type="button"
            onClick={() => setLastSyncError(null)}
            aria-label="Скрыть уведомление об ошибке"
            className="p-1 rounded hover:bg-rose-100 text-rose-700 hover:text-rose-950 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <HamburgerDrawer
        onExportAllJoints={(fmt) => {
          if (!isDbConnected || pendingSyncCount > 0) {
            const proceed = window.confirm(
              `ВНИМАНИЕ: Имеются несинхронизированные данные (${pendingSyncCount} изм.) или отсутствует подключение к серверу PostgreSQL.\n\nФайл будет выгружен с префиксом ЧЕРНОВИК_НЕ_СИНХРОНИЗИРОВАНО. Продолжить?`
            );
            if (!proceed) return;
          }
          void exportAllJointsToFile(joints, fmt, {
            isDraftUnsynced: !isDbConnected || pendingSyncCount > 0,
            unsyncedCount: pendingSyncCount,
            rdCode: selectedRdCode,
          });
        }}
        onOpenFacilityLocation={(objName: string) => setLocationModalFacilityName(objName)}
        onOpenBackupModal={() =>
          setBackupModalState({ isOpen: true, initialTab: 'backup' })
        }
        onOpenAuthorResetModal={() =>
          setBackupModalState({ isOpen: true, initialTab: 'author_reset' })
        }
        onDeleteObject={dirActions.handleDeleteObject}
      />

      <AppMainContent
        scopedJoints={filters.scopedJoints}
        filteredAndSortedJoints={filters.filteredAndSortedJoints}
        dynamicInspectors={dynamicInspectors}
        isLoadingDemoDataset={isLoadingDemoDataset}
        onLoadKharasaveyDemo={handleLoadKharasaveyDemo}
        selectedJointIds={filters.selectedJointIds}
        onToggleSelectRow={filters.toggleSelectRow}
        onToggleSelectAll={filters.toggleSelectAllVisible}
        onClearSelection={filters.handleClearSelection}
        weldingDateFrom={filters.weldingDateFrom}
        weldingDateTo={filters.weldingDateTo}
        onWeldingDateFromChange={filters.handleWeldingDateFromChange}
        onWeldingDateToChange={filters.handleWeldingDateToChange}
        onResetDateRange={filters.handleResetDateRange}
        confirmBulkDeleteJoints={confirmBulkDeleteJoints}
        onSetConfirmBulkDeleteJoints={setConfirmBulkDeleteJoints}
        onBulkDeleteSelectedJoints={jointActions.handleBulkDeleteSelectedJoints}
        onOpenBulkEdit={filters.handleOpenBulkEdit}
        onQuickAddSupplementaryJoint={jointActions.handleQuickAddSupplementaryJoint}
        onOpenImportExcel={filters.handleOpenImportExcel}
        onOpenCreatePassport={filters.handleOpenCreatePassport}
        onOpenEditPassport={filters.handleOpenEditPassport}
        activeTemplateId={activeTemplateId}
        templates={templates}
        onApplyTemplate={handleApplyTemplate}
        visibleColumns={visibleColumns}
        activeColumnDefs={activeColumnDefs}
        columnWidths={columnWidths}
        onOpenColumnsModal={() => setIsColumnsModalOpen(true)}
        columnFilters={filters.columnFilters}
        activeFilterKeys={filters.activeFilterKeys}
        onSetColumnFilter={filters.handleSetColumnFilter}
        onResetAllFilters={filters.handleResetAllFilters}
        sortConfig={filters.sortConfig}
        onSetSortConfig={filters.setSortConfig}
        openFilterColumnKey={filters.openFilterColumnKey}
        onSetOpenFilterColumnKey={filters.handleSetOpenFilterColumnKey}
        getUniqueValuesForColumn={filters.getUniqueValuesForColumn}
        onColumnResizeStart={handleColumnResizeStart}
        onColumnAutoFit={handleColumnAutoFit}
        onMoveColumnInline={filters.handleMoveColumnInline}
        onHideColumnInline={filters.handleHideColumnInline}
        setColumnFilters={filters.setColumnFilters}
        onCreateLabRequest={handleCreateLabRequest}
        onAcceptLabRequest={handleAcceptLabRequest}
        onSaveLabConclusions={handleSaveLabConclusions}
        onDeleteLabRequest={handleDeleteLabRequest}
        onOpenFacilityLocation={(objName: string) => setLocationModalFacilityName(objName)}
        onOpenAdminPasswordModal={() => {
          setLoginModalInitialMode('admin_password');
          setIsLoginModalOpen(true);
        }}
        onEditJointInPassport={(j: WeldJoint) => filters.handleOpenEditPassport(j)}
        dirActions={dirActions}
      />

      <AppModalsContainer
        isColumnsModalOpen={isColumnsModalOpen}
        onCloseColumnsModal={() => setIsColumnsModalOpen(false)}
        columnOrder={columnOrder}
        visibleColumns={visibleColumns}
        onSetColumnOrder={setColumnOrder}
        onSetVisibleColumns={setVisibleColumns}
        templates={templates}
        activeTemplateId={activeTemplateId}
        onApplyTemplate={handleApplyTemplate}
        onSaveNewTemplate={dirActions.handleSaveNewTemplate}
        onDeleteTemplate={dirActions.handleDeleteTemplate}
        onResetColumnWidths={handleResetColumnWidths}
        isBulkEditOpen={filters.isBulkEditOpen}
        onCloseBulkEdit={() => filters.setIsBulkEditOpen(false)}
        selectedJoints={joints.filter((j) => filters.selectedJointIds.includes(j.id))}
        dynamicInspectors={dynamicInspectors}
        currentFacility={currentFacility}
        onApplyBulkUpdate={jointActions.handleApplyBulkUpdate}
        passportModal={filters.passportModal}
        onClosePassportModal={() =>
          filters.setPassportModal({
            isOpen: false,
            mode: 'create',
            joint: null,
          })
        }
        onSaveJointFromPassport={jointActions.handleSaveJointFromPassport}
        onNavigateJoint={(target) =>
          filters.setPassportModal((prev) => ({
            ...prev,
            joint: target,
          }))
        }
        onDeleteJointFromPassport={jointActions.handleDeleteJointFromPassport}
        onOpenFacilityLocation={(objName: string) => setLocationModalFacilityName(objName)}
        isImportExcelOpen={filters.isImportExcelOpen}
        onCloseImportExcel={() => filters.setIsImportExcelOpen(false)}
        onImportJoints={jointActions.handleImportJoints}
        locationModalFacilityName={locationModalFacilityName}
        onCloseLocationModal={() => setLocationModalFacilityName(null)}
        activeLocationFacility={activeLocationFacility}
        onSaveFacilityLocation={dirActions.handleSaveFacilityLocation}
        onBulkUpdateJointsTemperaturesFromStation={handleBulkUpdateJointsTemperaturesFromStation}
        isAuthenticated={isAuthenticated}
        onChangeAdminPassword={dirActions.handleChangeAdminPassword}
        onToggleAdminRights={dirActions.handleToggleAdminRights}
        onRegisterAccount={(newAcc) => {
          setUserAccounts((prev) => [...prev, newAcc]);
          bumpRevisionMeta(`Создан пользователь ${newAcc.login}`, currentUser.fullName);
        }}
        onDeleteAccount={dirActions.handleDeleteUserAccount}
        onAuthenticate={(acc) => {
          setCurrentUser(acc);
          setIsAuthenticated(true);
          void fetchServerDbState(false);
        }}
        backupModalState={backupModalState}
        onCloseBackupModal={() => setBackupModalState((prev) => ({ ...prev, isOpen: false }))}
        currentPayload={{
          joints,
          projectLineList,
          lrvCatalog,
          auditLogs,
          labRequests,
          welders,
          techCards,
          weldingMaterials,
          userAccounts,
          facilityGeoOverrides,
          templates,
          activeTemplateId,
        }}
        onRestoreBackup={handleRestoreFullBackup}
        onAuthorZeroReset={handleAuthorZeroReset}
        onAuthorRestoreDemoSeed={handleAuthorRestoreDemoSeed}
        onLoadKharasaveyDemo={handleLoadKharasaveyDemo}
        isServerDbModalOpen={isServerDbModalOpen}
        onCloseServerDbModal={() => setIsServerDbModalOpen(false)}
        scopedJoints={filters.scopedJoints.length > 0 ? filters.scopedJoints : joints}
        onRefreshFromServer={async () => {
          await fetchServerDbState(false);
        }}
        onTriggerSimulatedConflict={jointActions.handleTriggerSimulatedConflict}
        activeConflict={activeConflict}
        onCloseConflictModal={() => setActiveConflict(null)}
        onAcceptServerVersion={jointActions.handleAcceptServerConflictVersion}
        onApplyAutoMerge={jointActions.handleApplyAutoMergeConflict}
        onForceClientOverwrite={jointActions.handleForceClientConflictOverwrite}
      />
        </div>
      </AppProvider>
    </AuthProvider>
  );
};

export default App;
