import { useCallback } from 'react';
import {
  AuditLogEntry,
  DepartmentCode,
  FacilityObject,
  LRVItem,
  NdtLabRequest,
  ProjectLineItem,
  RecordStatus,
  SystemRole,
  TestCircuit,
  UserAccount,
  WeldJoint,
} from '../../types/welding';
import { hashPasswordWithSalt, verifyPassword } from '../../utils/authSecurity';
import {
  canUserTransitionRecordStatus,
  DEPARTMENT_LABELS_RU,
  getUserRolePermissions,
  RECORD_STATUS_LABELS_RU,
  resolveUserDepartment,
  resolveUserSystemRole,
  SYSTEM_ROLE_LABELS_RU,
  validateRoleDepartmentPair,
} from '../../utils/rbac';
import { zaychickApi } from '../../api';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface UseAppAdminAndStatusActionsParams {
  currentUser: UserAccount;
  isDbConnected: boolean;
  isAuthenticated: boolean;
  userAccounts: UserAccount[];
  derivedFacilities: FacilityObject[];
  joints: WeldJoint[];
  projectLineList: ProjectLineItem[];
  lrvCatalog: LRVItem[];
  labRequests: NdtLabRequest[];
  testCircuits: TestCircuit[];
  selectedObjectName: string;
  setSelectedObjectName: (name: string) => void;
  setSelectedRdCode: (rd: string) => void;
  setUserAccounts: React.Dispatch<React.SetStateAction<UserAccount[]>>;
  setCurrentUser: React.Dispatch<React.SetStateAction<UserAccount>>;
  setProjectLineList: React.Dispatch<React.SetStateAction<ProjectLineItem[]>>;
  setJoints: React.Dispatch<React.SetStateAction<WeldJoint[]>>;
  setLrvCatalog: React.Dispatch<React.SetStateAction<LRVItem[]>>;
  setTestCircuits: React.Dispatch<React.SetStateAction<TestCircuit[]>>;
  setLabRequests: React.Dispatch<React.SetStateAction<NdtLabRequest[]>>;
  setAuditLogs: React.Dispatch<React.SetStateAction<AuditLogEntry[]>>;
  setIsDbSyncing: React.Dispatch<React.SetStateAction<boolean>>;
  setLastSyncError: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedJointIds: React.Dispatch<React.SetStateAction<string[]>>;
  setPassportModal: React.Dispatch<React.SetStateAction<any>>;
  appendSystemAuditEntry: (...args: any[]) => void;
  bumpRevisionMeta: (summary: string, actor: string) => void;
  fetchServerDbState: (silent?: boolean) => Promise<boolean>;
  recordUndoSnapshot: (...args: any[]) => void;
}

export function useAppAdminAndStatusActions(params: UseAppAdminAndStatusActionsParams) {
  const {
    currentUser,
    isDbConnected,
    isAuthenticated,
    userAccounts,
    derivedFacilities,
    joints,
    projectLineList,
    lrvCatalog,
    labRequests,
    testCircuits,
    selectedObjectName,
    setSelectedObjectName,
    setSelectedRdCode,
    setUserAccounts,
    setCurrentUser,
    setProjectLineList,
    setJoints,
    setLrvCatalog,
    setTestCircuits,
    setLabRequests,
    setAuditLogs,
    setIsDbSyncing,
    setLastSyncError,
    setSelectedJointIds,
    setPassportModal,
    appendSystemAuditEntry,
    bumpRevisionMeta,
    fetchServerDbState,
    recordUndoSnapshot,
  } = params;

  const filters = { setSelectedJointIds, setPassportModal };

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
      setJoints((prev: WeldJoint[]) => prev.filter((j) => j.objectName !== targetObjName));
      setProjectLineList((prev: ProjectLineItem[]) => prev.filter((l) => l.objectName !== targetObjName));
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
          setJoints((prev: WeldJoint[]) => prev.map((j) => (j.id === updated.id ? updated : j)));
          filters.setPassportModal((prev: any) =>
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
      setJoints((prev: WeldJoint[]) => prev.map((j) => (j.id === updatedLocal.id ? updatedLocal : j)));
      filters.setPassportModal((prev: any) =>
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
          setProjectLineList((prev: ProjectLineItem[]) =>
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
      setProjectLineList((prev: ProjectLineItem[]) =>
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

  return {
    handleSaveManagedUser,
    handlePurgeProject,
    handleChangeJointStatus,
    handleChangeLineStatus,
  };
}
