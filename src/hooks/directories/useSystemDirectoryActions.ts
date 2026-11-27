import { useCallback } from 'react';
import { ApiError, zaychickApi } from '../../api';
import {
  AuditLogEntry,
  ColumnTemplate,
  UserAccount,
  WeldJointFieldKey,
} from '../../types/welding';
import { getUserRolePermissions } from '../../utils/rbac';
import { UUID_RE } from './common';

export interface UseSystemDirectoryActionsParams {
  currentUser: UserAccount;
  setCurrentUser: React.Dispatch<React.SetStateAction<UserAccount>>;
  userAccounts: UserAccount[];
  setUserAccounts: React.Dispatch<React.SetStateAction<UserAccount[]>>;
  auditLogs: AuditLogEntry[];
  setAuditLogs: React.Dispatch<React.SetStateAction<AuditLogEntry[]>>;
  templates: ColumnTemplate[];
  setTemplates: React.Dispatch<React.SetStateAction<ColumnTemplate[]>>;
  activeTemplateId: string;
  setActiveTemplateId: React.Dispatch<React.SetStateAction<string>>;
  columnOrder: WeldJointFieldKey[];
  visibleColumns: WeldJointFieldKey[];
  columnWidths: Record<string, number>;
  initialColumnTemplates: ColumnTemplate[];
  handleApplyTemplate: (tpl: ColumnTemplate) => void;
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
  isAuthenticated: boolean;
  setIsLoginModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  notifyError: (msg: string) => void;
  reportError: (err: unknown, contextLabel: string) => void;
}

export function useSystemDirectoryActions(
  params: UseSystemDirectoryActionsParams
) {
  const {
    currentUser,
    setCurrentUser,
    userAccounts,
    setUserAccounts,
    auditLogs,
    setAuditLogs,
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
  } = params;

  const userPermissions = getUserRolePermissions(currentUser);

  const handleSaveNewTemplate = useCallback(
    async (name: string, description: string) => {
      const draft: ColumnTemplate = {
        id: `tpl-user-${Date.now()}`,
        name: name.trim(),
        description: description.trim() || 'Пользовательский шаблон',
        columnOrder: [...columnOrder],
        visibleColumns: [...visibleColumns],
        customWidths: { ...columnWidths },
      };
      try {
        const saved = await zaychickApi.createTemplate(draft);
        setTemplates((prev) => [...prev, saved]);
        setActiveTemplateId(saved.id);
      } catch {
        setTemplates((prev) => [...prev, draft]);
        setActiveTemplateId(draft.id);
      }
    },
    [columnOrder, columnWidths, setActiveTemplateId, setTemplates, visibleColumns]
  );

  const handleDeleteTemplate = useCallback(
    async (id: string) => {
      try {
        await zaychickApi.deleteTemplate(id);
      } catch {
        // fallback removal if local-only template
      }
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      if (activeTemplateId === id) {
        handleApplyTemplate(initialColumnTemplates[0]);
      }
    },
    [activeTemplateId, handleApplyTemplate, initialColumnTemplates, setTemplates]
  );

  const handleDeleteUserAccount = useCallback(
    async (loginToDelete: string) => {
      if (!isAuthenticated || !currentUser.login || userPermissions.category !== 'admin') {
        setIsLoginModalOpen(true);
        notifyError('[Ошибка доступа] Действие запрещено: требуется авторизация с правами администратора.');
        return;
      }
      if (userAccounts.length <= 1) return;
      const targetAcc = userAccounts.find((a) => a.login === loginToDelete);
      if (!targetAcc) return;

      if (targetAcc.login.toLowerCase() === currentUser.login.toLowerCase()) {
        notifyError('Нельзя отключить собственную учётную запись.');
        return;
      }

      try {
        if (targetAcc.id && UUID_RE.test(targetAcc.id)) {
          await zaychickApi.updateUser(targetAcc.id, {
            version: targetAcc.version ?? 1,
            isActive: false,
          });
        }
        const nextAccounts = userAccounts.filter((a) => a.login !== loginToDelete);
        setUserAccounts(nextAccounts);
      } catch (err) {
        reportError(err, 'Ошибка отключения пользователя');
      }
    },
    [
      currentUser.login,
      isAuthenticated,
      notifyError,
      reportError,
      setCurrentUser,
      setIsLoginModalOpen,
      setUserAccounts,
      userAccounts,
      userPermissions.category,
    ]
  );

  const handleToggleAdminRights = useCallback(
    async (
      targetLogin: string,
      grantAdmin: boolean
    ): Promise<{ ok: boolean; message: string }> => {
      if (!isAuthenticated || !currentUser.login || userPermissions.category !== 'admin') {
        setIsLoginModalOpen(true);
        return {
          ok: false,
          message: 'Только действующий авторизованный администратор имеет право изменять полномочия',
        };
      }
      const targetAcc = userAccounts.find(
        (a) => a.login.toLowerCase() === targetLogin.trim().toLowerCase()
      );
      if (!targetAcc) {
        return { ok: false, message: `Учётная запись «${targetLogin}» не найдена` };
      }
      if (!grantAdmin) {
        const remainingAdmins = userAccounts.filter(
          (a) =>
            a.login.toLowerCase() !== targetLogin.trim().toLowerCase() &&
            getUserRolePermissions(a).category === 'admin'
          );
        if (remainingAdmins.length === 0) {
          return {
            ok: false,
            message: 'Нельзя отозвать права у единственного администратора системы',
          };
        }
      }

      const nextBackendRole = grantAdmin ? 'ADMIN' : 'PTO';
      if (targetAcc.id && UUID_RE.test(targetAcc.id)) {
        try {
          const saved = await zaychickApi.updateUser(targetAcc.id, {
            version: targetAcc.version ?? 1,
            role: nextBackendRole,
          });
          setUserAccounts((prev) =>
            prev.map((a) => (a.id === saved.id ? saved : a))
          );
          if (currentUser.login === saved.login) setCurrentUser(saved);
        } catch (err) {
          reportError(err, 'Ошибка смены прав доступа');
          const msg =
            err instanceof ApiError
              ? err.message
              : err instanceof Error
              ? err.message
              : 'Ошибка смены прав доступа на сервере FastAPI';
          return { ok: false, message: msg };
        }
      } else {
        const nextRoleLabel = grantAdmin
          ? 'Администратор системы (Полный доступ)'
          : 'Инженер ПТО / СМР';
        setUserAccounts((prev) =>
          prev.map((a) =>
            a.login.toLowerCase() === targetLogin.trim().toLowerCase()
              ? { ...a, backendRole: nextBackendRole, role: nextRoleLabel }
              : a
          )
        );
      }

      return {
        ok: true,
        message: grantAdmin
          ? `Пользователю «${targetAcc.fullName}» назначена роль ADMIN`
          : `Роль пользователя «${targetAcc.fullName}» изменена на PTO`,
      };
    },
    [
      currentUser.login,
      isAuthenticated,
      reportError,
      setCurrentUser,
      setIsLoginModalOpen,
      setUserAccounts,
      userAccounts,
      userPermissions.category,
    ]
  );

  const handleChangeAdminPassword = useCallback(
    async (
      adminLogin: string,
      currentPassword: string,
      newPassword: string
    ): Promise<{ ok: boolean; message: string }> => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        return { ok: false, message: 'Требуется авторизация в системе' };
      }
      const targetAcc = userAccounts.find(
        (a) => a.login.toLowerCase() === adminLogin.trim().toLowerCase()
      );
      if (!targetAcc) {
        return {
          ok: false,
          message: `Учётная запись администратора «${adminLogin}» не найдена`,
        };
      }
      if (newPassword.trim().length < 8) {
        return { ok: false, message: 'Новый пароль должен содержать не менее 8 символов' };
      }

      try {
        if (adminLogin.toLowerCase() === currentUser.login.toLowerCase()) {
          await zaychickApi.changeOwnPassword(currentPassword, newPassword.trim());
        } else if (targetAcc.id && UUID_RE.test(targetAcc.id)) {
          const saved = await zaychickApi.updateUser(targetAcc.id, {
            version: targetAcc.version ?? 1,
            newPassword: newPassword.trim(),
          });
          setUserAccounts((prev) =>
            prev.map((a) => (a.id === saved.id ? saved : a))
          );
        }
        return {
          ok: true,
          message: `Пароль учётной записи «${targetAcc.login}» успешно обновлён на сервере`,
        };
      } catch (err) {
        reportError(err, 'Ошибка смены пароля администратора');
        const msg =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
            ? err.message
            : 'Ошибка смены пароля на сервере FastAPI';
        return { ok: false, message: msg };
      }
    },
    [
      currentUser.login,
      isAuthenticated,
      reportError,
      setIsLoginModalOpen,
      setUserAccounts,
      userAccounts,
    ]
  );

  const handleClearAuditLogs = useCallback(() => {
    if (userPermissions.category !== 'admin') return;
    recordUndoSnapshot(`Очистка представления аудита (${auditLogs.length} зап.)`);
    setAuditLogs([]);
    appendSystemAuditEntry(
      'Аудит',
      'СИСТЕМА',
      '—',
      'Очищена лента просмотра аудита в интерфейсе (PostgreSQL audit_logs неизменяем)',
      '—',
      'Применено'
    );
  }, [
    appendSystemAuditEntry,
    auditLogs.length,
    recordUndoSnapshot,
    setAuditLogs,
    userPermissions.category,
  ]);

  return {
    handleSaveNewTemplate,
    handleDeleteTemplate,
    handleDeleteUserAccount,
    handleToggleAdminRights,
    handleChangeAdminPassword,
    handleClearAuditLogs,
  };
}
