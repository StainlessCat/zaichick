import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  Edit3,
  GitCompare,
  HardDrive,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Trash2,
  UserCheck,
  UserX,
  Users,
  X,
} from 'lucide-react';
import {
  AdminUserSessionInfo,
  DepartmentCode,
  FacilityObject,
  LRVItem,
  NdtLabRequest,
  ProjectLineItem,
  ServerDbMetadata,
  SystemRole,
  UserAccount,
  WeldJoint,
} from '../types/welding';
import {
  DEPARTMENT_LABELS_RU,
  resolveUserDepartment,
  resolveUserSystemRole,
  SYSTEM_ROLE_LABELS_RU,
  validateRoleDepartmentPair,
} from '../utils/rbac';
import { formatTimestampDDMMYY } from '../utils/weldingLogic';
import { usePermissions } from '../hooks/usePermissions';
import { zaychickApi } from '../api';

export type AdminConsoleTab = 'users' | 'data' | 'db';

interface ServerDbStatusModalProps {
  isOpen: boolean;
  initialTab?: AdminConsoleTab;
  onClose: () => void;
  dbMeta: ServerDbMetadata | null;
  isConnected: boolean;
  isSyncing: boolean;
  joints?: WeldJoint[];
  sampleJoints?: WeldJoint[];
  projectLineList?: ProjectLineItem[];
  lrvCatalog?: LRVItem[];
  labRequests?: NdtLabRequest[];
  facilities?: FacilityObject[];
  userAccounts?: UserAccount[];
  currentUser?: UserAccount;
  onRefreshFromServer?: () => Promise<void>;
  onForceSyncFromServer?: () => Promise<void>;
  onTriggerSimulatedConflict: (jointId: string) => Promise<void>;
  onSaveManagedUser?: (payload: {
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
  }) => Promise<{ ok: boolean; message?: string }>;
  onPurgeProject?: (params: {
    facility: FacilityObject;
    confirmProjectName: string;
    password: string;
  }) => Promise<{ ok: boolean; message: string; deletedCounts?: Record<string, number> }>;
  pendingSyncCount?: number;
  lastSyncError?: string | null;
  onRetrySync?: () => Promise<boolean>;
}

const ALL_DEPARTMENTS: DepartmentCode[] = ['PTO', 'OGS', 'PIL', 'SK', 'ALL'];
const NON_ALL_DEPARTMENTS: DepartmentCode[] = ['PTO', 'OGS', 'PIL', 'SK'];
const ALL_ROLES: SystemRole[] = ['SUPERADMIN', 'DEPT_ADMIN', 'OPERATOR', 'VIEWER'];
const DEPT_ADMIN_ROLES: SystemRole[] = ['OPERATOR', 'VIEWER'];

export const ServerDbStatusModal: React.FC<ServerDbStatusModalProps> = ({
  isOpen,
  initialTab,
  onClose,
  dbMeta,
  isConnected,
  isSyncing,
  joints: jointsProp,
  sampleJoints,
  projectLineList = [],
  lrvCatalog = [],
  labRequests = [],
  facilities = [],
  userAccounts = [],
  currentUser,
  onRefreshFromServer: onRefreshProp,
  onForceSyncFromServer,
  onTriggerSimulatedConflict,
  onSaveManagedUser,
  onPurgeProject,
}) => {
  const perms = usePermissions();
  const joints = jointsProp || sampleJoints || [];
  const onRefreshFromServer = onRefreshProp || onForceSyncFromServer || (async () => {});

  const defaultTab: AdminConsoleTab =
    initialTab || (perms.canManageUsers ? 'users' : 'db');
  const [activeTab, setActiveTab] = useState<AdminConsoleTab>(defaultTab);

  // --- Tab 1: Users & RBAC ---
  const [remoteUsers, setRemoteUsers] = useState<UserAccount[] | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>(
    perms.isSuperAdmin ? 'ALL_FILTER' : perms.department
  );
  const [roleFilter, setRoleFilter] = useState<string>('ALL_FILTER');
  const [userBanner, setUserBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [userFormOpen, setUserFormOpen] = useState(false);
  const [userFormMode, setUserFormMode] = useState<'create' | 'edit'>('create');
  const [editingUserId, setEditingUserId] = useState<string | undefined>(undefined);
  const [editingUserVersion, setEditingUserVersion] = useState<number>(1);
  const [formLogin, setFormLogin] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formPosition, setFormPosition] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<SystemRole>('OPERATOR');
  const [formDept, setFormDept] = useState<DepartmentCode>(
    perms.isSuperAdmin ? 'PTO' : perms.department
  );
  const [formActive, setFormActive] = useState(true);
  const [savingUser, setSavingUser] = useState(false);

  // --- Tab 2: Project Data Purge (SUPERADMIN only) ---
  const [selectedPurgeFacilityId, setSelectedPurgeFacilityId] = useState<string>(
    facilities[0]?.id || ''
  );
  const [purgeConfirmName, setPurgeConfirmName] = useState('');
  const [purgePassword, setPurgePassword] = useState('');
  const [purgeLoading, setPurgeLoading] = useState(false);
  const [purgeResult, setPurgeResult] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  // --- Tab 3: DB & OCC ---
  const [selectedTestJointId, setSelectedTestJointId] = useState<string>(joints[0]?.id || '');
  const [isSimulating, setIsSimulating] = useState(false);
  const [remoteSessions, setRemoteSessions] = useState<AdminUserSessionInfo[] | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab || (perms.canManageUsers ? 'users' : 'db'));
    setUserBanner(null);
    setPurgeResult(null);
    setPurgeConfirmName('');
    setPurgePassword('');
    if (!perms.isSuperAdmin) {
      setDeptFilter(perms.department);
    }
    if (facilities.length > 0 && !facilities.some((f) => f.id === selectedPurgeFacilityId)) {
      setSelectedPurgeFacilityId(facilities[0].id);
    }
  }, [isOpen, initialTab, perms.canManageUsers, perms.isSuperAdmin, perms.department, facilities, selectedPurgeFacilityId]);

  const loadRemoteUsers = async () => {
    if (!isConnected || !perms.canManageUsers) return;
    setLoadingUsers(true);
    try {
      const list = await zaychickApi.listAdminUsers();
      setRemoteUsers(list);
    } catch {
      setRemoteUsers(null);
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadRemoteSessions = async () => {
    if (!isConnected || !perms.canManageUsers) return;
    setLoadingSessions(true);
    try {
      const list = await zaychickApi.listAdminSessions();
      setRemoteSessions(list);
    } catch {
      setRemoteSessions(null);
    } finally {
      setLoadingSessions(false);
    }
  };

  const handleRevokeAdminSession = async (sessionId: string) => {
    setRevokingSessionId(sessionId);
    try {
      await zaychickApi.revokeAdminSession(sessionId);
      setRemoteSessions((prev) => (prev ? prev.filter((s) => s.id !== sessionId) : prev));
    } catch {
      // ignore or keep row intact
    } finally {
      setRevokingSessionId(null);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'users' && isConnected && perms.canManageUsers) {
      void loadRemoteUsers();
    }
    if (isOpen && activeTab === 'db' && isConnected && perms.canManageUsers) {
      void loadRemoteSessions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeTab, isConnected, perms.canManageUsers]);

  const displayedUsers = useMemo(() => {
    const source = remoteUsers ?? userAccounts;
    return source
      .filter((u) => {
        if (!u.login) return false;
        const uDept = resolveUserDepartment(u);
        const uRole = resolveUserSystemRole(u);
        if (!perms.isSuperAdmin && uDept !== perms.department) {
          return false;
        }
        if (deptFilter !== 'ALL_FILTER' && uDept !== deptFilter) {
          return false;
        }
        if (roleFilter !== 'ALL_FILTER' && uRole !== roleFilter) {
          return false;
        }
        if (userSearch.trim()) {
          const q = userSearch.trim().toLowerCase();
          return (
            u.fullName.toLowerCase().includes(q) ||
            u.login.toLowerCase().includes(q) ||
            (u.positionTitle || '').toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));
  }, [remoteUsers, userAccounts, perms.isSuperAdmin, perms.department, deptFilter, roleFilter, userSearch]);

  const selectedPurgeFacility = useMemo(
    () => facilities.find((f) => f.id === selectedPurgeFacilityId) || facilities[0] || null,
    [facilities, selectedPurgeFacilityId]
  );

  const purgePreviewCounts = useMemo(() => {
    if (!selectedPurgeFacility) {
      return { joints: 0, lines: 0, lrv: 0, labRequests: 0 };
    }
    const name = selectedPurgeFacility.name;
    return {
      joints: joints.filter((j) => j.objectName === name).length,
      lines: projectLineList.filter((l) => l.objectName === name).length,
      lrv: lrvCatalog.filter((i) => i.objectName === name).length,
      labRequests: labRequests.filter((r) => r.objectName === name).length,
    };
  }, [selectedPurgeFacility, joints, projectLineList, lrvCatalog, labRequests]);

  if (!isOpen) return null;

  const targetJointId = selectedTestJointId || joints[0]?.id || '';

  const openCreateUserForm = () => {
    setUserFormMode('create');
    setEditingUserId(undefined);
    setEditingUserVersion(1);
    setFormLogin('');
    setFormFullName('');
    setFormPosition('');
    setFormPassword('');
    setFormRole('OPERATOR');
    setFormDept(perms.isSuperAdmin ? 'PTO' : perms.department);
    setFormActive(true);
    setUserBanner(null);
    setUserFormOpen(true);
  };

  const openEditUserForm = (u: UserAccount) => {
    const uRole = resolveUserSystemRole(u);
    const uDept = resolveUserDepartment(u);
    setUserFormMode('edit');
    setEditingUserId(u.id || u.login);
    setEditingUserVersion(u.version ?? 1);
    setFormLogin(u.login);
    setFormFullName(u.fullName);
    setFormPosition(u.positionTitle || '');
    setFormPassword('');
    setFormRole(uRole);
    setFormDept(uDept);
    setFormActive(u.isActive !== false);
    setUserBanner(null);
    setUserFormOpen(true);
  };

  const canCurrentActorEditTarget = (target: UserAccount): boolean => {
    if (perms.isSuperAdmin) return true;
    const targetRole = resolveUserSystemRole(target);
    const targetDept = resolveUserDepartment(target);
    return (
      targetDept === perms.department &&
      (targetRole === 'OPERATOR' || targetRole === 'VIEWER')
    );
  };

  const handleSubmitUserForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveDept: DepartmentCode =
      formRole === 'SUPERADMIN' ? 'ALL' : perms.isSuperAdmin ? formDept : perms.department;
    const pairErr = validateRoleDepartmentPair(formRole, effectiveDept);
    if (pairErr) {
      setUserBanner({ type: 'err', text: pairErr });
      return;
    }
    if (!formLogin.trim() || !formFullName.trim()) {
      setUserBanner({ type: 'err', text: 'Заполните логин и ФИО пользователя' });
      return;
    }
    if (userFormMode === 'create' && formPassword.trim().length < 8) {
      setUserBanner({ type: 'err', text: 'Пароль должен содержать не менее 8 символов' });
      return;
    }
    if (userFormMode === 'edit' && formPassword.trim().length > 0 && formPassword.trim().length < 8) {
      setUserBanner({ type: 'err', text: 'Новый пароль должен содержать не менее 8 символов' });
      return;
    }
    if (!onSaveManagedUser) return;

    setSavingUser(true);
    setUserBanner(null);
    try {
      const res = await onSaveManagedUser({
        mode: userFormMode,
        userId: editingUserId,
        login: formLogin.trim(),
        fullName: formFullName.trim(),
        password: formPassword.trim() || undefined,
        systemRole: formRole,
        departmentCode: effectiveDept,
        positionTitle: formPosition.trim(),
        isActive: formActive,
        version: editingUserVersion,
      });
      if (!res.ok) {
        setUserBanner({ type: 'err', text: res.message || 'Ошибка сохранения пользователя' });
        return;
      }
      setUserBanner({
        type: 'ok',
        text:
          res.message ||
          (userFormMode === 'create'
            ? `Пользователь ${formLogin.trim()} создан`
            : `Изменения для ${formLogin.trim()} сохранены`),
      });
      setUserFormOpen(false);
      if (isConnected) {
        await loadRemoteUsers();
      }
    } finally {
      setSavingUser(false);
    }
  };

  const handleToggleUserActive = async (target: UserAccount) => {
    if (!onSaveManagedUser || !canCurrentActorEditTarget(target)) return;
    if (currentUser?.login && target.login.toLowerCase() === currentUser.login.toLowerCase()) {
      setUserBanner({ type: 'err', text: 'Нельзя заблокировать собственную учётную запись' });
      return;
    }
    const nextActive = target.isActive === false;
    const res = await onSaveManagedUser({
      mode: 'edit',
      userId: target.id || target.login,
      login: target.login,
      fullName: target.fullName,
      systemRole: resolveUserSystemRole(target),
      departmentCode: resolveUserDepartment(target),
      positionTitle: target.positionTitle || '',
      isActive: nextActive,
      version: target.version ?? 1,
    });
    if (!res.ok) {
      setUserBanner({ type: 'err', text: res.message || 'Не удалось изменить статус пользователя' });
      return;
    }
    setUserBanner({
      type: 'ok',
      text: nextActive
        ? `Пользователь ${target.login} разблокирован`
        : `Пользователь ${target.login} заблокирован`,
    });
    if (isConnected) {
      await loadRemoteUsers();
    }
  };

  const handlePurgeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPurgeFacility || !onPurgeProject) return;
    setPurgeLoading(true);
    setPurgeResult(null);
    try {
      const res = await onPurgeProject({
        facility: selectedPurgeFacility,
        confirmProjectName: purgeConfirmName.trim(),
        password: purgePassword,
      });
      setPurgeResult({ type: res.ok ? 'ok' : 'err', text: res.message });
      if (res.ok) {
        setPurgeConfirmName('');
        setPurgePassword('');
      }
    } finally {
      setPurgeLoading(false);
    }
  };

  const handleRunConflictDemo = async () => {
    if (!targetJointId) return;
    setIsSimulating(true);
    try {
      await onTriggerSimulatedConflict(targetJointId);
    } finally {
      setIsSimulating(false);
    }
  };

  const availableRoleOptions = perms.isSuperAdmin ? ALL_ROLES : DEPT_ADMIN_ROLES;
  const availableDeptOptions = perms.isSuperAdmin
    ? formRole === 'SUPERADMIN'
      ? (['ALL'] as DepartmentCode[])
      : NON_ALL_DEPARTMENTS
    : [perms.department];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Администрирование и статус СУБД"
    >
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-4xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Шапка модального окна */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#1e3799] text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-white/15 text-sky-200">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold uppercase tracking-wider">
                  Администрирование и статус СУБД
                </h2>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                    isConnected
                      ? 'bg-emerald-400/20 text-emerald-200 border border-emerald-400/40'
                      : 'bg-white/15 text-sky-100 border border-white/25'
                  }`}
                >
                  {isConnected ? 'ONLINE · POSTGRESQL' : 'ЛОКАЛЬНЫЙ РЕЖИМ'}
                </span>
              </div>
              <p className="text-xs text-sky-200 mt-0.5">
                Управление пользователями по отделам, безопасная очистка проекта и диагностика блокировок
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно администрирования"
            className="p-1.5 rounded-lg text-sky-100 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Навигация по вкладкам */}
        <div className="px-6 pt-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2 overflow-x-auto shrink-0">
          {perms.canManageUsers && (
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'users'
                  ? 'border-[#1e3799] text-[#1e3799] bg-white rounded-t-lg'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Пользователи и права</span>
            </button>
          )}

          {perms.canPurgeProject && (
            <button
              type="button"
              onClick={() => setActiveTab('data')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'data'
                  ? 'border-red-700 text-red-700 bg-white rounded-t-lg'
                  : 'border-transparent text-slate-600 hover:text-red-700'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Управление данными проекта</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('db')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'db'
                ? 'border-[#1e3799] text-[#1e3799] bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Статус СУБД и блокировки</span>
          </button>
        </div>

        {/* Контент активной вкладки */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto text-xs flex-1">
          {activeTab === 'users' && perms.canManageUsers && (
            <div className="space-y-4">
              {userBanner && (
                <div
                  className={`p-3 rounded-lg border font-semibold flex items-center justify-between gap-2 ${
                    userBanner.type === 'ok'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}
                >
                  <span>{userBanner.text}</span>
                  <button
                    type="button"
                    onClick={() => setUserBanner(null)}
                    className="text-current opacity-70 hover:opacity-100 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Фильтры и кнопка добавления */}
              <div className="flex flex-wrap items-end justify-between gap-2.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex flex-wrap items-end gap-2.5 flex-1">
                  <div className="min-w-[180px] flex-1 max-w-xs space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-600 whitespace-nowrap">
                      Поиск по ФИО или логину
                    </label>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="ФИО или логин"
                        className="w-full h-8 pl-8 pr-2.5 bg-white border border-slate-300 rounded-md text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3799]/30"
                      />
                    </div>
                  </div>

                  <div className="w-36 space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-600 whitespace-nowrap">
                      Отдел
                    </label>
                    <select
                      value={deptFilter}
                      disabled={!perms.isSuperAdmin}
                      onChange={(e) => setDeptFilter(e.target.value)}
                      className="w-full h-8 px-2 bg-white border border-slate-300 rounded-md text-xs font-medium text-slate-800 disabled:bg-slate-100"
                    >
                      {perms.isSuperAdmin && <option value="ALL_FILTER">Все отделы</option>}
                      {ALL_DEPARTMENTS.map((d) => (
                        <option key={d} value={d}>
                          {DEPARTMENT_LABELS_RU[d]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="w-40 space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-600 whitespace-nowrap">
                      Роль
                    </label>
                    <select
                      value={roleFilter}
                      onChange={(e) => setRoleFilter(e.target.value)}
                      className="w-full h-8 px-2 bg-white border border-slate-300 rounded-md text-xs font-medium text-slate-800"
                    >
                      <option value="ALL_FILTER">Все роли</option>
                      {ALL_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {SYSTEM_ROLE_LABELS_RU[r]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={openCreateUserForm}
                  className="h-8 px-3.5 rounded-md bg-[#1e3799] text-white hover:bg-[#15276e] font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Добавить пользователя</span>
                </button>
              </div>

              {/* Форма создания / редактирования пользователя */}
              {userFormOpen && (
                <form
                  onSubmit={handleSubmitUserForm}
                  className="p-4 rounded-xl bg-[#f4f8fe] border border-sky-200 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-[#1e3799]">
                      {userFormMode === 'create'
                        ? 'Создание учётной записи'
                        : `Редактирование пользователя ${formLogin}`}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setUserFormOpen(false)}
                      className="text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-700 whitespace-nowrap">
                        Логин
                      </label>
                      <input
                        type="text"
                        required
                        disabled={userFormMode === 'edit'}
                        value={formLogin}
                        onChange={(e) => setFormLogin(e.target.value)}
                        placeholder="ivanov_ii"
                        className="w-full h-8 px-2.5 bg-white border border-slate-300 rounded-md text-xs font-mono disabled:bg-slate-100"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-700 whitespace-nowrap">
                        ФИО
                      </label>
                      <input
                        type="text"
                        required
                        value={formFullName}
                        onChange={(e) => setFormFullName(e.target.value)}
                        placeholder="Иванов Иван Иванович"
                        className="w-full h-8 px-2.5 bg-white border border-slate-300 rounded-md text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-700 whitespace-nowrap">
                        Должность
                      </label>
                      <input
                        type="text"
                        value={formPosition}
                        onChange={(e) => setFormPosition(e.target.value)}
                        placeholder="Инженер ПТО"
                        className="w-full h-8 px-2.5 bg-white border border-slate-300 rounded-md text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-700 whitespace-nowrap">
                        Системная роль
                      </label>
                      <select
                        value={formRole}
                        onChange={(e) => {
                          const nextRole = e.target.value as SystemRole;
                          setFormRole(nextRole);
                          if (nextRole === 'SUPERADMIN') {
                            setFormDept('ALL');
                          } else if (formDept === 'ALL') {
                            setFormDept(perms.isSuperAdmin ? 'PTO' : perms.department);
                          }
                        }}
                        className="w-full h-8 px-2 bg-white border border-slate-300 rounded-md text-xs font-medium"
                      >
                        {availableRoleOptions.map((r) => (
                          <option key={r} value={r}>
                            {SYSTEM_ROLE_LABELS_RU[r]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-700 whitespace-nowrap">
                        Отдел
                      </label>
                      <select
                        value={formRole === 'SUPERADMIN' ? 'ALL' : formDept}
                        disabled={!perms.isSuperAdmin || formRole === 'SUPERADMIN'}
                        onChange={(e) => setFormDept(e.target.value as DepartmentCode)}
                        className="w-full h-8 px-2 bg-white border border-slate-300 rounded-md text-xs font-medium disabled:bg-slate-100"
                      >
                        {availableDeptOptions.map((d) => (
                          <option key={d} value={d}>
                            {DEPARTMENT_LABELS_RU[d]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-700 whitespace-nowrap">
                        {userFormMode === 'create' ? 'Пароль' : 'Новый пароль'}
                      </label>
                      <input
                        type="password"
                        required={userFormMode === 'create'}
                        minLength={8}
                        value={formPassword}
                        onChange={(e) => setFormPassword(e.target.value)}
                        placeholder={userFormMode === 'create' ? 'Минимум 8 символов' : 'Оставьте пустым'}
                        className="w-full h-8 px-2.5 bg-white border border-slate-300 rounded-md text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formActive}
                        onChange={(e) => setFormActive(e.target.checked)}
                        className="rounded border-slate-300 text-[#1e3799]"
                      />
                      <span>Учётная запись активна</span>
                    </label>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setUserFormOpen(false)}
                        className="h-8 px-3 rounded-md border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                      >
                        Отмена
                      </button>
                      <button
                        type="submit"
                        disabled={savingUser}
                        className="h-8 px-4 rounded-md bg-[#1e3799] text-white font-semibold hover:bg-[#15276e] cursor-pointer disabled:opacity-50"
                      >
                        {savingUser ? 'Сохранение...' : 'Сохранить'}
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* Таблица пользователей */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 text-left">
                        <th className="py-2.5 px-3 font-bold">ФИО и логин</th>
                        <th className="py-2.5 px-3 font-bold">Отдел</th>
                        <th className="py-2.5 px-3 font-bold">Роль</th>
                        <th className="py-2.5 px-3 font-bold">Статус</th>
                        <th className="py-2.5 px-3 font-bold text-right">Действия</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loadingUsers ? (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-slate-400">
                            Загрузка списка пользователей...
                          </td>
                        </tr>
                      ) : displayedUsers.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-slate-400">
                            Пользователи по заданному фильтру не найдены
                          </td>
                        </tr>
                      ) : (
                        displayedUsers.map((u) => {
                          const uRole = resolveUserSystemRole(u);
                          const uDept = resolveUserDepartment(u);
                          const isActive = u.isActive !== false;
                          const canEditRow = canCurrentActorEditTarget(u);
                          const isSelf =
                            Boolean(currentUser?.login) &&
                            u.login.toLowerCase() === currentUser?.login.toLowerCase();

                          return (
                            <tr key={u.id || u.login} className="hover:bg-slate-50/80">
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-slate-900">{u.fullName}</div>
                                <div className="text-[11px] font-mono text-slate-500">
                                  {u.login}
                                  {u.positionTitle ? ` · ${u.positionTitle}` : ''}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-slate-700 whitespace-nowrap">
                                {DEPARTMENT_LABELS_RU[uDept]}
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded font-semibold border text-[11px] ${
                                    uRole === 'SUPERADMIN'
                                      ? 'bg-indigo-50 text-[#1e3799] border-indigo-200'
                                      : uRole === 'DEPT_ADMIN'
                                        ? 'bg-sky-50 text-sky-900 border-sky-200'
                                        : uRole === 'OPERATOR'
                                          ? 'bg-slate-100 text-slate-700 border-slate-200'
                                          : 'bg-amber-50 text-amber-900 border-amber-200'
                                  }`}
                                >
                                  {SYSTEM_ROLE_LABELS_RU[uRole]}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold border text-[11px] ${
                                    isActive
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      : 'bg-red-50 text-red-700 border-red-200'
                                  }`}
                                >
                                  {isActive ? (
                                    <UserCheck className="w-3 h-3" />
                                  ) : (
                                    <UserX className="w-3 h-3" />
                                  )}
                                  <span>{isActive ? 'Активен' : 'Заблокирован'}</span>
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-1.5">
                                  {canEditRow && (
                                    <button
                                      type="button"
                                      onClick={() => openEditUserForm(u)}
                                      className="h-7 px-2 rounded border border-slate-300 bg-white text-slate-700 hover:border-[#1e3799] hover:text-[#1e3799] font-semibold inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                      <span>Изменить</span>
                                    </button>
                                  )}
                                  {canEditRow && !isSelf && (
                                    <button
                                      type="button"
                                      onClick={() => void handleToggleUserActive(u)}
                                      className={`h-7 px-2 rounded border font-semibold cursor-pointer ${
                                        isActive
                                          ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                                          : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                      }`}
                                    >
                                      {isActive ? 'Заблокировать' : 'Активировать'}
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'data' && perms.canPurgeProject && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-red-50/70 border border-red-200 space-y-2">
                <div className="flex items-center gap-2 font-bold text-red-900 text-sm">
                  <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                  <span>Очистка оперативных данных выбранного проекта</span>
                </div>
                <p className="text-slate-700 leading-relaxed">
                  Удаляет сварные стыки, лайнлист, позиции ЛРВ и заявки НК только по выбранному объекту строительства. Учётные записи пользователей, справочники НАКС и техкарты, журнал аудита и остальные проекты сохраняются.
                </p>
              </div>

              {purgeResult && (
                <div
                  className={`p-3 rounded-lg border font-semibold ${
                    purgeResult.type === 'ok'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}
                >
                  {purgeResult.text}
                </div>
              )}

              <form
                onSubmit={handlePurgeSubmit}
                className="p-4 rounded-xl bg-white border border-slate-200 space-y-4"
              >
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-slate-700 whitespace-nowrap">
                    Выберите проект для очистки
                  </label>
                  <select
                    value={selectedPurgeFacility?.id || ''}
                    onChange={(e) => setSelectedPurgeFacilityId(e.target.value)}
                    className="w-full h-8 px-2.5 bg-white border border-slate-300 rounded-md text-xs font-semibold text-slate-900"
                  >
                    {facilities.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedPurgeFacility && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[10px] text-slate-500">Сварные стыки</div>
                      <div className="font-mono font-bold text-sm text-red-700 tabular-nums">
                        {purgePreviewCounts.joints}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[10px] text-slate-500">Линии лайнлиста</div>
                      <div className="font-mono font-bold text-sm text-red-700 tabular-nums">
                        {purgePreviewCounts.lines}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[10px] text-slate-500">Позиции ЛРВ</div>
                      <div className="font-mono font-bold text-sm text-red-700 tabular-nums">
                        {purgePreviewCounts.lrv}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[10px] text-slate-500">Заявки НК</div>
                      <div className="font-mono font-bold text-sm text-red-700 tabular-nums">
                        {purgePreviewCounts.labRequests}
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-700 whitespace-nowrap">
                      Введите точное название проекта
                    </label>
                    <input
                      type="text"
                      required
                      value={purgeConfirmName}
                      onChange={(e) => setPurgeConfirmName(e.target.value)}
                      placeholder={selectedPurgeFacility?.name || 'Название объекта'}
                      className="w-full h-8 px-2.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-700 whitespace-nowrap">
                      Пароль суперадмина
                    </label>
                    <input
                      type="password"
                      required
                      value={purgePassword}
                      onChange={(e) => setPurgePassword(e.target.value)}
                      placeholder="Подтверждение паролем"
                      className="w-full h-8 px-2.5 bg-white border border-slate-300 rounded-md text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Событие будет записано в неизменяемый журнал аудита</span>
                  </div>
                  <button
                    type="submit"
                    disabled={purgeLoading || !selectedPurgeFacility}
                    className="h-8 px-4 rounded-md bg-red-600 hover:bg-red-700 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{purgeLoading ? 'Очистка...' : 'Очистить данные проекта'}</span>
                  </button>
                </div>
              </form>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2.5">
                <Terminal className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
                <div className="text-[11px] text-slate-600 leading-relaxed">
                  Полный сброс всей базы данных через веб-интерфейс отключён в целях безопасности. Для полного переинициализирования стенда используйте CLI-утилиту на сервере с обязательным авто-дампом:{' '}
                  <code className="font-mono font-semibold text-slate-900">
                    python -m app.cli.reset_db --confirm
                  </code>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'db' && (
            <div className="space-y-4">
              {/* 1. Статус движка СУБД и глобальной ревизии */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-[#f4f8fe] border border-sky-200">
                  <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                    <Server className="w-3.5 h-3.5 text-[#1e3799]" />
                    <span>Ядро серверной СУБД</span>
                  </div>
                  <div className="mt-1 font-bold text-slate-900 text-sm">
                    {dbMeta?.engine || 'PostgreSQL 16'}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 mt-0.5 truncate">
                    {dbMeta?.dbFilePath || '/api/* · SSE /api/events/stream'}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#f4f8fe] border border-sky-200">
                  <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                    <Activity className="w-3.5 h-3.5 text-[#1e3799]" />
                    <span>Глобальная ревизия БД</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-[#1e3799] text-white font-mono font-bold text-sm tabular-nums">
                      rev #{dbMeta?.globalRevision ?? 1}
                    </span>
                    <button
                      type="button"
                      onClick={onRefreshFromServer}
                      disabled={isSyncing}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white border border-sky-300 text-[#1e3799] hover:bg-sky-50 font-semibold text-[11px] cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                      <span>Обновить</span>
                    </button>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 truncate">
                    {dbMeta?.lastUpdatedAt
                      ? `Изм.: ${formatTimestampDDMMYY(dbMeta.lastUpdatedAt)}`
                      : 'Синхронизировано'}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#f4f8fe] border border-sky-200">
                  <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Последняя транзакция</span>
                  </div>
                  <div className="mt-1 font-bold text-slate-900 truncate" title={dbMeta?.lastAction}>
                    {dbMeta?.lastAction || 'Готов к работе'}
                  </div>
                  <div className="text-[11px] text-[#1e3799] font-medium mt-0.5 truncate">
                    {dbMeta?.lastUpdatedBy || 'Система'}
                  </div>
                </div>
              </div>

              {/* 2. Таблицы серверной СУБД */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-slate-800">
                    <HardDrive className="w-4 h-4 text-[#1e3799]" />
                    <span>Реляционные таблицы в единой серверной базе данных</span>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-700 font-semibold">
                    PostgreSQL 16 · OCC
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                    <div className="text-[10px] font-mono text-slate-400">weld_joints</div>
                    <div className="font-bold text-slate-900 mt-0.5">Сварные стыки</div>
                    <div className="font-mono font-bold text-sm text-[#1e3799] tabular-nums">
                      {dbMeta?.counts.joints ?? joints.length} зап.
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                    <div className="text-[10px] font-mono text-slate-400">project_linelist</div>
                    <div className="font-bold text-slate-900 mt-0.5">Лайнлист</div>
                    <div className="font-mono font-bold text-sm text-[#1e3799] tabular-nums">
                      {dbMeta?.counts.projectLineList ?? projectLineList.length} зап.
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                    <div className="text-[10px] font-mono text-slate-400">lrv_catalog</div>
                    <div className="font-bold text-slate-900 mt-0.5">База материалов</div>
                    <div className="font-mono font-bold text-sm text-[#1e3799] tabular-nums">
                      {dbMeta?.counts.lrvCatalog ?? lrvCatalog.length} зап.
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                    <div className="text-[10px] font-mono text-slate-400">welders / tech_cards</div>
                    <div className="font-bold text-slate-900 mt-0.5">НАКС и ТК</div>
                    <div className="font-mono font-bold text-sm text-[#1e3799] tabular-nums">
                      {(dbMeta?.counts.welders ?? 0) + (dbMeta?.counts.techCards ?? 0)} зап.
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Интерактивный стенд проверки OCC */}
              <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-300 space-y-3">
                <div className="flex items-start gap-2.5">
                  <div className="p-2 rounded-lg bg-amber-500 text-slate-950 shrink-0 mt-0.5">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-xs sm:text-sm">
                      Проверка оптимистической блокировки при параллельном редактировании
                    </h3>
                    <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                      При сохранении стыка сервер сверяет счётчик версий <code className="font-mono font-bold text-[#1e3799]">version</code>. Если запись изменилась параллельно, возвращается HTTP 409 Conflict и открывается окно трёхстороннего слияния.
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-white border border-amber-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                    <label className="font-semibold text-slate-700 shrink-0 whitespace-nowrap">
                      Стык для теста
                    </label>
                    <select
                      value={targetJointId}
                      onChange={(e) => setSelectedTestJointId(e.target.value)}
                      className="flex-1 h-8 px-2.5 bg-slate-50 border border-slate-300 rounded font-mono text-xs font-semibold text-[#1e3799]"
                    >
                      {joints.slice(0, 25).map((j) => (
                        <option key={j.id} value={j.id}>
                          Стык №{j.jointNumber} · {j.uniqueLineId} · v{j.version ?? 1}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handleRunConflictDemo}
                    disabled={isSimulating || joints.length === 0}
                    className="h-8 px-3.5 rounded-lg bg-[#1e3799] text-white hover:bg-[#15276e] font-semibold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <GitCompare className="w-4 h-4 text-sky-200" />
                    <span>
                      {isSimulating ? 'Моделирование...' : 'Смоделировать конфликт версий'}
                    </span>
                  </button>
                </div>
              </div>

              {/* 4. Активные пользовательские сессии */}
              <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-bold text-slate-800">
                    <Users className="w-4 h-4 text-[#1e3799]" />
                    <span>
                      Активные сессии:{' '}
                      {remoteSessions
                        ? remoteSessions.length
                        : dbMeta?.activeSessions?.length ?? 0}
                    </span>
                  </div>
                  {isConnected && perms.canManageUsers && (
                    <button
                      type="button"
                      onClick={() => void loadRemoteSessions()}
                      disabled={loadingSessions}
                      className="h-7 px-2.5 rounded-md border border-slate-200 hover:bg-slate-50 text-[11px] font-semibold text-slate-600 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${loadingSessions ? 'animate-spin' : ''}`} />
                      <span>Обновить</span>
                    </button>
                  )}
                </div>

                {remoteSessions && remoteSessions.length > 0 ? (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                    {remoteSessions.map((sess) => (
                      <div
                        key={sess.id}
                        className="px-3 py-2 flex items-center justify-between gap-2 text-[11px] bg-white hover:bg-slate-50"
                      >
                        <div className="min-w-0 flex items-center gap-2 flex-wrap">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="font-bold text-slate-900 truncate">
                            {sess.userFullName}
                          </span>
                          <span className="font-mono text-[#1e3799]">{sess.userLogin}</span>
                          <span className="text-slate-500">· {sess.deviceLabel}</span>
                          {sess.ipAddress && (
                            <span className="font-mono text-slate-400">· {sess.ipAddress}</span>
                          )}
                          <span className="text-slate-400 tabular-nums">
                            · {formatTimestampDDMMYY(sess.lastSeenAt)}
                          </span>
                          {sess.isCurrent && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                              Текущая
                            </span>
                          )}
                        </div>
                        {!sess.isCurrent && (
                          <button
                            type="button"
                            disabled={revokingSessionId === sess.id}
                            onClick={() => void handleRevokeAdminSession(sess.id)}
                            className="h-6 px-2 rounded border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-semibold text-[11px] cursor-pointer disabled:opacity-50 shrink-0"
                          >
                            {revokingSessionId === sess.id ? '...' : 'Завершить'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : dbMeta?.activeSessions && dbMeta.activeSessions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {dbMeta.activeSessions.map((sess) => (
                      <div
                        key={sess.sessionId}
                        className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#f4f8fe] border border-sky-200 text-[11px]"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="font-bold text-slate-900">{sess.fullName}</span>
                        <span className="text-slate-500">{sess.role}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400">Нет данных об активных сессиях.</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>
            Роль: <strong className="text-slate-800">{SYSTEM_ROLE_LABELS_RU[perms.role]}</strong> · Отдел:{' '}
            <strong className="text-slate-800">{DEPARTMENT_LABELS_RU[perms.department]}</strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 rounded-lg bg-[#1e3799] text-white font-semibold hover:bg-[#15276e] cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
