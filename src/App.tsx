import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ShieldAlert, X } from 'lucide-react';
import {
  ANONYMOUS_USER,
  AppSection,
  ColumnTemplate,
  DepartmentCode,
  FacilityObject,
  NdtLabRequest,
  ProjectLineItem,
  RecordStatus,
  SystemRole,
  UserAccount,
  WeldJoint,
} from './types/welding';
import {
  canUserTransitionRecordStatus,
  DEPARTMENT_LABELS_RU,
  getUserRolePermissions,
  RECORD_STATUS_LABELS_RU,
  resolveUserDepartment,
  resolveUserSystemRole,
  SYSTEM_ROLE_LABELS_RU,
  validateRoleDepartmentPair,
} from './utils/rbac';
import { hashPasswordWithSalt, verifyPassword } from './utils/authSecurity';
import { exportAllJointsToFile } from './utils/excelUtils';
import {
  isJointConclusionCompletedForRequest,
  syncLabRequestStatusWithJoints,
} from './utils/laboratoryLogic';
import { FullSystemBackupPayload } from './components/BackupAndResetModal';
import {
  useAppState,
  useDirectoryActions,
  useJointActions,
  useServerSync,
  useTestCircuitActions,
  useLabRequestActions,
} from './hooks';
import { buildSeedTestCircuitsFromJoints } from './utils/testCircuitCalc';
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
    testCircuits,
    setTestCircuits,
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
    sessionExpiredNotice,
    clearSessionExpiredNotice,
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
    setLoginModalInitialMode,
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
    setTestCircuits,
  });

  const [backupModalState, setBackupModalState] = useState<{
    isOpen: boolean;
    initialTab: 'backup';
  }>({
    isOpen: false,
    initialTab: 'backup',
  });

  const handleHeaderLogoClick = useCallback(() => {
    setActiveSection('readiness');
  }, [setActiveSection]);

  useEffect(() => {
    const canViewAudit =
      isAuthenticated && getUserRolePermissions(currentUser).canViewAuditLogs;
    if (activeSection === 'audit_log' && !canViewAudit) {
      setActiveSection('readiness');
    }
  }, [activeSection, currentUser, isAuthenticated, setActiveSection]);

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
    testCircuits,
    welders,
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
    selectedJointIds: filters.selectedJointIds,
    setSelectedJointIds: filters.setSelectedJointIds,
    setConfirmBulkDeleteJoints,
    setAuditLogs,
    appendSystemAuditEntry,
    recordUndoSnapshot,
    passportModalMode: filters.passportModal.mode,
    passportBaseJointRef,
    setPassportModal: filters.setPassportModal,
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

  const testCircuitActions = useTestCircuitActions({
    currentUser,
    isDbConnected,
    isAuthenticated,
    serverFacilities,
    testCircuits,
    setTestCircuits,
    joints,
    setJoints,
    projectLineList,
    bumpRevisionMeta,
    appendSystemAuditEntry,
  });

  const userPermissions = getUserRolePermissions(currentUser);

  const [isLoadingDemoDataset, setIsLoadingDemoDataset] = useState(false);

  const handleLoadKharasaveyDemo = useCallback(async () => {
    setIsLoadingDemoDataset(true);
    try {
      const { loadKharasaveyDemoData } = await import('./data/seedData');
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

  const handleSaveManagedUser = useCallback(
    async (payload: {
      mode: 'create' | 'edit';
      userId?: string;
      login: string;
      fullName: string;
      password?: string;
      systemRole: SystemRole;
      departmentCode: DepartmentCode;
      positionTitle?: string;
      isActive: boolean;
      version?: number;
    }): Promise<{ ok: boolean; message?: string }> => {
      const actorPerms = getUserRolePermissions(currentUser);
      if (!actorPerms.canManageUsers) {
        return { ok: false, message: 'Недостаточно прав для управления пользователями.' };
      }

      const pairError = validateRoleDepartmentPair(payload.systemRole, payload.departmentCode);
      if (pairError) {
        return { ok: false, message: pairError };
      }

      if (actorPerms.isDeptAdmin && !actorPerms.isSuperAdmin) {
        if (payload.departmentCode !== actorPerms.department) {
          return {
            ok: false,
            message: 'Администратор отдела может управлять пользователями только своего отдела.',
          };
        }
        if (payload.systemRole !== 'OPERATOR' && payload.systemRole !== 'VIEWER') {
          return {
            ok: false,
            message: 'Администратор отдела может назначать только роли Инженер и Наблюдатель.',
          };
        }
      }

      const trimmedLogin = payload.login.trim();
      const trimmedName = payload.fullName.trim();
      if (!trimmedLogin || !trimmedName) {
        return { ok: false, message: 'Заполните логин и ФИО пользователя.' };
      }

      const roleDisplay =
        payload.positionTitle?.trim() ||
        `${SYSTEM_ROLE_LABELS_RU[payload.systemRole]} · ${DEPARTMENT_LABELS_RU[payload.departmentCode]}`;

      if (isDbConnected && isAuthenticated) {
        try {
          let savedAccount: UserAccount;
          if (payload.mode === 'create') {
            if (!payload.password || payload.password.length < 8) {
              return { ok: false, message: 'Укажите пароль длиной не менее 8 символов.' };
            }
            savedAccount = await zaychickApi.createAdminUser({
              login: trimmedLogin,
              fullName: trimmedName,
              password: payload.password,
              role: payload.systemRole,
              department: payload.departmentCode,
              positionTitle: payload.positionTitle?.trim() || undefined,
            });
            setUserAccounts((prev) => [
              ...prev.filter((u) => u.login !== savedAccount.login),
              savedAccount,
            ]);
          } else {
            if (payload.password && payload.password.trim().length > 0 && payload.password.trim().length < 8) {
              return { ok: false, message: 'Новый пароль должен содержать не менее 8 символов.' };
            }
            const targetId = payload.userId;
            if (!targetId) {
              return { ok: false, message: 'Не указан идентификатор пользователя.' };
            }
            savedAccount = await zaychickApi.updateAdminUser(targetId, {
              version: payload.version ?? 1,
              fullName: trimmedName,
              role: payload.systemRole,
              department: payload.departmentCode,
              positionTitle: payload.positionTitle?.trim() || undefined,
              isActive: payload.isActive,
              newPassword: payload.password?.trim() || undefined,
            });
            setUserAccounts((prev) =>
              prev.map((u) =>
                u.id === savedAccount.id || u.login === savedAccount.login
                  ? savedAccount
                  : u
              )
            );
            if (currentUser.login === savedAccount.login) {
              setCurrentUser(savedAccount);
            }
          }
          bumpRevisionMeta(
            `${payload.mode === 'create' ? 'Создан' : 'Обновлён'} пользователь ${savedAccount.login}`,
            currentUser.fullName
          );
          return { ok: true };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Ошибка сохранения пользователя';
          return { ok: false, message: msg };
        }
      }

      // Локальный режим (без подключения к серверу)
      if (payload.mode === 'create') {
        if (userAccounts.some((u) => u.login.toLowerCase() === trimmedLogin.toLowerCase())) {
          return { ok: false, message: 'Пользователь с таким логином уже существует.' };
        }
        if (!payload.password || payload.password.length < 8) {
          return { ok: false, message: 'Укажите пароль длиной не менее 8 символов.' };
        }
        const hashed = hashPasswordWithSalt(payload.password);
        const newAccount: UserAccount = {
          id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          login: trimmedLogin,
          password: hashed.hash,
          passwordSalt: hashed.salt,
          fullName: trimmedName,
          role: roleDisplay,
          department: DEPARTMENT_LABELS_RU[payload.departmentCode],
          systemRole: payload.systemRole,
          departmentCode: payload.departmentCode,
          isActive: payload.isActive,
          isAdmin: payload.systemRole === 'SUPERADMIN',
          sessionNumber: userAccounts.length + 1,
          version: 1,
        };
        setUserAccounts((prev) => [...prev, newAccount]);
        appendSystemAuditEntry(
          `Создание пользователя ${newAccount.login}`,
          'RBAC',
          newAccount.login,
          'Учётная запись',
          '—',
          `${SYSTEM_ROLE_LABELS_RU[payload.systemRole]} / ${DEPARTMENT_LABELS_RU[payload.departmentCode]}`,
          newAccount.id,
          'user_created'
        );
        bumpRevisionMeta(`Создан пользователь ${newAccount.login}`, currentUser.fullName);
        return { ok: true };
      }

      const existing = userAccounts.find(
        (u) => (payload.userId && u.id === payload.userId) || u.login === trimmedLogin
      );
      if (!existing) {
        return { ok: false, message: 'Пользователь не найден.' };
      }
      if (
        actorPerms.isDeptAdmin &&
        !actorPerms.isSuperAdmin &&
        (resolveUserSystemRole(existing) === 'SUPERADMIN' ||
          resolveUserSystemRole(existing) === 'DEPT_ADMIN' ||
          resolveUserDepartment(existing) !== actorPerms.department)
      ) {
        return {
          ok: false,
          message: 'Администратор отдела не может редактировать этого пользователя.',
        };
      }

      if (payload.password && payload.password.trim().length > 0 && payload.password.trim().length < 8) {
        return { ok: false, message: 'Новый пароль должен содержать не менее 8 символов.' };
      }
      const nextPasswordData =
        payload.password && payload.password.trim().length >= 8
          ? hashPasswordWithSalt(payload.password.trim())
          : null;

      const updated: UserAccount = {
        ...existing,
        fullName: trimmedName,
        role: roleDisplay,
        department: DEPARTMENT_LABELS_RU[payload.departmentCode],
        systemRole: payload.systemRole,
        departmentCode: payload.departmentCode,
        isActive: payload.isActive,
        isAdmin: payload.systemRole === 'SUPERADMIN',
        ...(nextPasswordData
          ? { password: nextPasswordData.hash, passwordSalt: nextPasswordData.salt }
          : {}),
        version: (existing.version ?? 1) + 1,
      };
      setUserAccounts((prev) =>
        prev.map((u) => (u.login === existing.login ? updated : u))
      );
      if (currentUser.login === updated.login) {
        setCurrentUser(updated);
      }
      appendSystemAuditEntry(
        `Обновление пользователя ${updated.login}`,
        'RBAC',
        updated.login,
        'Права и статус',
        `${SYSTEM_ROLE_LABELS_RU[resolveUserSystemRole(existing)]} / ${existing.isActive !== false ? 'Активен' : 'Отключён'}`,
        `${SYSTEM_ROLE_LABELS_RU[payload.systemRole]} / ${payload.isActive ? 'Активен' : 'Отключён'}`,
        updated.id,
        'user_modified'
      );
      bumpRevisionMeta(`Обновлён пользователь ${updated.login}`, currentUser.fullName);
      return { ok: true };
    },
    [
      appendSystemAuditEntry,
      bumpRevisionMeta,
      currentUser,
      isAuthenticated,
      isDbConnected,
      setCurrentUser,
      setUserAccounts,
      userAccounts,
    ]
  );

  const handlePurgeProject = useCallback(
    async (params: {
      facility: FacilityObject;
      confirmProjectName: string;
      password: string;
    }): Promise<{
      ok: boolean;
      message: string;
      deletedCounts?: Record<string, number>;
    }> => {
      const actorPerms = getUserRolePermissions(currentUser);
      if (!actorPerms.canPurgeProject) {
        return {
          ok: false,
          message: 'Очистка данных проекта доступна только Суперадминистратору.',
        };
      }

      const entered = params.confirmProjectName.trim();
      const validNames = [params.facility.name, params.facility.shortName]
        .filter(Boolean)
        .map((s) => s.trim());
      if (!validNames.includes(entered)) {
        return {
          ok: false,
          message: `Название не совпадает. Введите точно: «${params.facility.name}».`,
        };
      }

      if (!params.password.trim()) {
        return { ok: false, message: 'Введите пароль суперадминистратора.' };
      }

      if (isDbConnected && isAuthenticated && UUID_RE.test(params.facility.id)) {
        try {
          const result = await zaychickApi.purgeProject(
            params.facility.id,
            entered,
            params.password
          );
          await fetchServerDbState(false);
          filters.setSelectedJointIds([]);
          bumpRevisionMeta(
            `Очищены данные проекта «${params.facility.name}»`,
            currentUser.fullName
          );
          return {
            ok: true,
            message: `Данные проекта «${params.facility.name}» очищены. Объект, справочники и учётные записи сохранены.`,
            deletedCounts: result.deleted_counts,
          };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Ошибка очистки проекта на сервере';
          return { ok: false, message: msg };
        }
      }

      // Локальный режим: сверяем пароль текущего суперадмина
      const storedAcc = userAccounts.find((u) => u.login === currentUser.login) || currentUser;
      const pwdValid =
        storedAcc.password
          ? verifyPassword(params.password, storedAcc.password, storedAcc.passwordSalt)
          : false;
      if (!pwdValid) {
        return { ok: false, message: 'Неверный пароль суперадминистратора.' };
      }

      const targetObjName = params.facility.name;
      const jointsToDelete = joints.filter((j) => j.objectName === targetObjName).length;
      const linesToDelete = projectLineList.filter((l) => l.objectName === targetObjName).length;
      const lrvToDelete = lrvCatalog.filter((l) => l.objectName === targetObjName).length;
      const labToDelete = labRequests.filter((r) => r.objectName === targetObjName).length;
      const circuitsToDelete = testCircuits.filter((c) => c.objectName === targetObjName).length;

      recordUndoSnapshot(`Очистка данных проекта «${targetObjName}»`);
      setJoints((prev) => prev.filter((j) => j.objectName !== targetObjName));
      setProjectLineList((prev) => prev.filter((l) => l.objectName !== targetObjName));
      setTestCircuits((prev) => prev.filter((c) => c.objectName !== targetObjName));
      setLrvCatalog((prev) => prev.filter((l) => l.objectName !== targetObjName));
      setLabRequests((prev) => prev.filter((r) => r.objectName !== targetObjName));
      filters.setSelectedJointIds([]);

      const deletedCounts = {
        joints: jointsToDelete,
        lines: linesToDelete,
        test_circuits: circuitsToDelete,
        lrv_items: lrvToDelete,
        lab_requests: labToDelete,
      };

      appendSystemAuditEntry(
        `Очистка данных проекта «${targetObjName}»`,
        targetObjName,
        `${jointsToDelete} ст.`,
        'Очистка проекта',
        `Стыки: ${jointsToDelete}, Линии: ${linesToDelete}, Контуры: ${circuitsToDelete}, ЛРВ: ${lrvToDelete}, Заявки НК: ${labToDelete}`,
        'Данные проекта очищены (справочники и пользователи сохранены)',
        params.facility.id,
        'project_purged'
      );
      bumpRevisionMeta(`Очищены данные проекта «${targetObjName}»`, currentUser.fullName);

      return {
        ok: true,
        message: `Данные проекта «${targetObjName}» очищены. Объект, справочники и учётные записи сохранены.`,
        deletedCounts,
      };
    },
    [
      appendSystemAuditEntry,
      bumpRevisionMeta,
      currentUser,
      fetchServerDbState,
      filters,
      isAuthenticated,
      isDbConnected,
      joints,
      labRequests,
      lrvCatalog,
      projectLineList,
      recordUndoSnapshot,
      setJoints,
      setLrvCatalog,
      setProjectLineList,
      setTestCircuits,
      testCircuits,
      userAccounts,
    ]
  );

  const handleChangeJointStatus = useCallback(
    async (
      joint: WeldJoint,
      targetStatus: RecordStatus,
      reason?: string
    ): Promise<{ ok: boolean; message?: string }> => {
      const prevStatus: RecordStatus = joint.recordStatus || 'DRAFT';
      const check = canUserTransitionRecordStatus(
        currentUser,
        prevStatus,
        targetStatus,
        ['PTO', 'PIL']
      );
      if (!check.allowed) {
        const msg = check.reason || 'Переход статуса запрещён.';
        setLastSyncError(msg);
        return { ok: false, message: msg };
      }
      if (check.requiresReason && (!reason || reason.trim().length < 5)) {
        return { ok: false, message: 'Укажите причину разблокировки (минимум 5 символов).' };
      }

      const isUnlock = prevStatus === 'LOCKED' && targetStatus !== 'LOCKED';

      if (isDbConnected && isAuthenticated && UUID_RE.test(joint.id)) {
        try {
          setIsDbSyncing(true);
          const updated = await zaychickApi.changeJointStatus(
            joint.id,
            targetStatus,
            joint.version ?? 1,
            reason?.trim()
          );
          setJoints((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
          filters.setPassportModal((prev) =>
            prev.isOpen && prev.joint?.id === updated.id
              ? { ...prev, joint: updated }
              : prev
          );
          if (getUserRolePermissions(currentUser).canViewAuditLogs) {
            const logs = await zaychickApi.listAuditLogs(1, 150).catch(() => null);
            if (logs) setAuditLogs(logs);
          }
          bumpRevisionMeta(
            `Статус стыка № ${updated.jointNumber}: ${RECORD_STATUS_LABELS_RU[targetStatus]}`,
            currentUser.fullName
          );
          setLastSyncError(null);
          return { ok: true };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Ошибка смены статуса стыка';
          setLastSyncError(msg);
          return { ok: false, message: msg };
        } finally {
          setIsDbSyncing(false);
        }
      }

      // Локальный режим
      const updatedLocal: WeldJoint = {
        ...joint,
        recordStatus: targetStatus,
        version: (joint.version ?? 1) + 1,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.fullName,
      };
      setJoints((prev) => prev.map((j) => (j.id === updatedLocal.id ? updatedLocal : j)));
      filters.setPassportModal((prev) =>
        prev.isOpen && prev.joint?.id === updatedLocal.id
          ? { ...prev, joint: updatedLocal }
          : prev
      );
      appendSystemAuditEntry(
        isUnlock
          ? `Разблокировка стыка № ${joint.jointNumber}`
          : `Смена статуса стыка № ${joint.jointNumber}`,
        joint.uniqueLineId,
        joint.jointNumber,
        'Статус записи',
        RECORD_STATUS_LABELS_RU[prevStatus],
        reason?.trim()
          ? `${RECORD_STATUS_LABELS_RU[targetStatus]} · Причина: ${reason.trim()}`
          : RECORD_STATUS_LABELS_RU[targetStatus],
        joint.id,
        isUnlock ? 'record_unlocked' : 'record_status_changed'
      );
      bumpRevisionMeta(
        `Статус стыка № ${joint.jointNumber}: ${RECORD_STATUS_LABELS_RU[targetStatus]}`,
        currentUser.fullName
      );
      return { ok: true };
    },
    [
      appendSystemAuditEntry,
      bumpRevisionMeta,
      currentUser,
      filters,
      isAuthenticated,
      isDbConnected,
      setAuditLogs,
      setIsDbSyncing,
      setJoints,
      setLastSyncError,
    ]
  );

  const handleChangeLineStatus = useCallback(
    async (
      line: ProjectLineItem,
      targetStatus: RecordStatus,
      reason?: string
    ): Promise<{ ok: boolean; message?: string }> => {
      const prevStatus: RecordStatus = line.recordStatus || 'DRAFT';
      const check = canUserTransitionRecordStatus(
        currentUser,
        prevStatus,
        targetStatus,
        ['PTO']
      );
      if (!check.allowed) {
        const msg = check.reason || 'Переход статуса линии запрещён.';
        setLastSyncError(msg);
        return { ok: false, message: msg };
      }
      if (check.requiresReason && (!reason || reason.trim().length < 5)) {
        return { ok: false, message: 'Укажите причину разблокировки (минимум 5 символов).' };
      }

      const isUnlock = prevStatus === 'LOCKED' && targetStatus !== 'LOCKED';

      if (isDbConnected && isAuthenticated && UUID_RE.test(line.id)) {
        try {
          setIsDbSyncing(true);
          const updated = await zaychickApi.changeLineStatus(
            line.id,
            targetStatus,
            line.version ?? 1,
            reason?.trim()
          );
          setProjectLineList((prev) =>
            prev.map((l) => (l.id === updated.id ? updated : l))
          );
          if (getUserRolePermissions(currentUser).canViewAuditLogs) {
            const logs = await zaychickApi.listAuditLogs(1, 150).catch(() => null);
            if (logs) setAuditLogs(logs);
          }
          bumpRevisionMeta(
            `Статус линии ${updated.uniqueLineId}: ${RECORD_STATUS_LABELS_RU[targetStatus]}`,
            currentUser.fullName
          );
          setLastSyncError(null);
          return { ok: true };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Ошибка смены статуса линии';
          setLastSyncError(msg);
          return { ok: false, message: msg };
        } finally {
          setIsDbSyncing(false);
        }
      }

      const updatedLocal: ProjectLineItem = {
        ...line,
        recordStatus: targetStatus,
        version: (line.version ?? 1) + 1,
      };
      setProjectLineList((prev) =>
        prev.map((l) => (l.id === updatedLocal.id ? updatedLocal : l))
      );
      appendSystemAuditEntry(
        isUnlock
          ? `Разблокировка линии ${line.uniqueLineId}`
          : `Смена статуса линии ${line.uniqueLineId}`,
        line.uniqueLineId,
        line.lineNumber,
        'Статус записи',
        RECORD_STATUS_LABELS_RU[prevStatus],
        reason?.trim()
          ? `${RECORD_STATUS_LABELS_RU[targetStatus]} · Причина: ${reason.trim()}`
          : RECORD_STATUS_LABELS_RU[targetStatus],
        line.id,
        isUnlock ? 'record_unlocked' : 'record_status_changed'
      );
      bumpRevisionMeta(
        `Статус линии ${line.uniqueLineId}: ${RECORD_STATUS_LABELS_RU[targetStatus]}`,
        currentUser.fullName
      );
      return { ok: true };
    },
    [
      appendSystemAuditEntry,
      bumpRevisionMeta,
      currentUser,
      isAuthenticated,
      isDbConnected,
      setAuditLogs,
      setIsDbSyncing,
      setLastSyncError,
      setProjectLineList,
    ]
  );

  const handleAuthorRestoreDemoSeed = useCallback(async (): Promise<boolean> => {
    try {
      if (isAuthenticated) {
        try {
          await zaychickApi.restoreBaselineSeed();
          await fetchServerDbState(false);
          return true;
        } catch (serverErr) {
          console.warn('Серверный сброс не удался, применяем локальный fallback:', serverErr);
        }
      }
      const demoData = await import('./data/seedData');
      setJoints(demoData.INITIAL_JOINTS);
      setProjectLineList(demoData.INITIAL_PROJECT_LINELIST);
      setTestCircuits(
        buildSeedTestCircuitsFromJoints(
          demoData.INITIAL_JOINTS,
          demoData.INITIAL_PROJECT_LINELIST
        )
      );
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
    setTestCircuits,
    setRedoStack,
    setTechCards,
    setTemplates,
    setUndoStack,
    setWelders,
    setWeldingMaterials,
  ]);

  const {
    handleCreateLabRequest,
    handleAcceptLabRequest,
    handleSaveLabConclusions,
    handleDeleteLabRequest,
  } = useLabRequestActions({
    isAuthenticated,
    currentUser,
    labRequests,
    setLabRequests,
    joints,
    jointActions,
    setLastSyncError,
    appendSystemAuditEntry,
    bumpRevisionMeta,
    recordUndoSnapshot,
  });

  const [isSessionsModalOpen, setIsSessionsModalOpen] = useState(false);

  const handleLogout = useCallback(async () => {
    await zaychickApi.logout(false).catch(() => {});
    setIsSessionsModalOpen(false);
    setIsAuthenticated(false);
    setCurrentUser(ANONYMOUS_USER);
    setLoginModalInitialMode('login');
    setIsLoginModalOpen(true);
  }, [setCurrentUser, setIsAuthenticated, setIsLoginModalOpen, setLoginModalInitialMode]);

  const handleLogoutAllDevices = useCallback(async () => {
    await zaychickApi.logout(true).catch(() => {});
    setIsSessionsModalOpen(false);
    setIsAuthenticated(false);
    setCurrentUser(ANONYMOUS_USER);
    setLoginModalInitialMode('login');
    setIsLoginModalOpen(true);
  }, [setCurrentUser, setIsAuthenticated, setIsLoginModalOpen, setLoginModalInitialMode]);

  return (
    <AuthProvider
      currentUser={currentUser}
      setCurrentUser={setCurrentUser}
      userAccounts={userAccounts}
      setUserAccounts={setUserAccounts}
      isAuthenticated={isAuthenticated}
      isLoginModalOpen={isLoginModalOpen}
      setIsLoginModalOpen={setIsLoginModalOpen}
      loginModalInitialMode={loginModalInitialMode}
      setLoginModalInitialMode={setLoginModalInitialMode}
      sessionExpiredNotice={sessionExpiredNotice}
      clearSessionExpiredNotice={clearSessionExpiredNotice}
      isSessionsModalOpen={isSessionsModalOpen}
      setIsSessionsModalOpen={setIsSessionsModalOpen}
      onLogout={handleLogout}
      onLogoutAllDevices={handleLogoutAllDevices}
    >
      <AppProvider
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        selectedObjectName={selectedObjectName}
        setSelectedObjectName={setSelectedObjectName}
        selectedRdCode={selectedRdCode}
        setSelectedRdCode={setSelectedRdCode}
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
        testCircuits={testCircuits}
        setTestCircuits={setTestCircuits}
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
        onLogoClick={handleHeaderLogoClick}
        isAuthenticated={isAuthenticated}
        onOpenServerDbModal={() => setIsServerDbModalOpen(true)}
        onOpenPasswordChangeModal={() => {
          setLoginModalInitialMode('change_password');
          setIsLoginModalOpen(true);
        }}
        onOpenSessionsModal={() => setIsSessionsModalOpen(true)}
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
        onDeleteObject={dirActions.handleDeleteObject}
        onCreateObject={(objName: string) => {
          void dirActions.handleCreateStandaloneObject(objName);
        }}
      />

      {!isAuthenticated && (
        <div className="bg-slate-100 border-b border-slate-200 text-slate-800 px-4 py-2 text-xs font-medium flex items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldAlert className="w-4 h-4 shrink-0 text-[#1e3799]" />
            <span className="truncate sm:whitespace-normal">
              {isDbConnected
                ? 'Режим просмотра: только чтение. Для внесения изменений и сохранения в базу выполните вход.'
                : 'Нет подключения к серверу. Работа доступна в автономном режиме просмотра.'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setLoginModalInitialMode('login');
              setIsLoginModalOpen(true);
            }}
            className="h-7 px-3 rounded-md bg-[#1e3799] text-white hover:bg-[#15276e] text-xs font-semibold transition-colors cursor-pointer shrink-0 whitespace-nowrap"
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

      <AppMainContent
        scopedJoints={filters.scopedJoints}
        filteredAndSortedJoints={filters.filteredAndSortedJoints}
        dynamicInspectors={dynamicInspectors}
        isLoadingDemoDataset={isLoadingDemoDataset}
        onLoadKharasaveyDemo={handleLoadKharasaveyDemo}
        globalSearch={filters.globalSearch}
        onGlobalSearchChange={filters.setGlobalSearch}
        quickFilter={filters.quickFilter}
        onQuickFilterChange={filters.setQuickFilter}
        quickFilterCounts={filters.quickFilterCounts}
        duplicateJointIds={filters.duplicateJointIds}
        selectedJointIds={filters.selectedJointIds}
        onToggleSelectRow={filters.toggleSelectRow}
        onToggleSelectAll={filters.toggleSelectAllVisible}
        onClearSelection={filters.handleClearSelection}
        weldingDateFrom={filters.weldingDateFrom}
        weldingDateTo={filters.weldingDateTo}
        onWeldingDateFromChange={filters.handleWeldingDateFromChange}
        onWeldingDateToChange={filters.handleWeldingDateToChange}
        onResetDateRange={filters.handleResetDateRange}
        onlyActiveRepairs={filters.onlyActiveRepairs}
        setOnlyActiveRepairs={filters.setOnlyActiveRepairs}
        confirmBulkDeleteJoints={confirmBulkDeleteJoints}
        onSetConfirmBulkDeleteJoints={setConfirmBulkDeleteJoints}
        onBulkDeleteSelectedJoints={jointActions.handleBulkDeleteSelectedJoints}
        onOpenBulkEdit={filters.handleOpenBulkEdit}
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
          setLoginModalInitialMode('change_password');
          setIsLoginModalOpen(true);
        }}
        onEditJointInPassport={(j: WeldJoint) => filters.handleOpenEditPassport(j)}
        onChangeJointStatus={handleChangeJointStatus}
        onChangeLineStatus={handleChangeLineStatus}
        dirActions={dirActions}
        testCircuitActions={testCircuitActions}
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
        onChangeJointStatus={handleChangeJointStatus}
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
        sessionExpiredNotice={sessionExpiredNotice}
        onClearSessionNotice={clearSessionExpiredNotice}
        onLogout={handleLogout}
        onAuthenticate={(acc) => {
          setCurrentUser(acc);
          setIsAuthenticated(true);
          if (!acc.mustChangePassword) {
            void fetchServerDbState(false);
          }
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
        onAuthorRestoreDemoSeed={handleAuthorRestoreDemoSeed}
        onLoadKharasaveyDemo={handleLoadKharasaveyDemo}
        isServerDbModalOpen={isServerDbModalOpen}
        onCloseServerDbModal={() => setIsServerDbModalOpen(false)}
        scopedJoints={filters.scopedJoints.length > 0 ? filters.scopedJoints : joints}
        labRequests={labRequests}
        onRefreshFromServer={async () => {
          await fetchServerDbState(false);
        }}
        onTriggerSimulatedConflict={jointActions.handleTriggerSimulatedConflict}
        onSaveManagedUser={handleSaveManagedUser}
        onPurgeProject={handlePurgeProject}
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
