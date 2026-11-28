import React from 'react';
import {
  CheckCircle2,
  Edit3,
  Lock,
  Plus,
  Search,
  ShieldAlert,
  UserCheck,
  UserX,
  Users,
  X,
} from 'lucide-react';
import { DepartmentCode, SystemRole, UserAccount } from '../../types/welding';
import { usePermissions } from '../../hooks/usePermissions';
import {
  DEPARTMENT_LABELS_RU,
  resolveUserDepartment,
  resolveUserSystemRole,
  SYSTEM_ROLE_LABELS_RU,
  validateRoleDepartmentPair,
} from '../../utils/rbac';

export interface AdminUsersTabProps {
  displayedUsers: UserAccount[];
  loadingUsers: boolean;
  userSearch: string;
  setUserSearch: React.Dispatch<React.SetStateAction<string>>;
  roleFilter: string;
  setRoleFilter: React.Dispatch<React.SetStateAction<string>>;
  deptFilter: string;
  setDeptFilter: React.Dispatch<React.SetStateAction<string>>;
  availableRoleOptions: SystemRole[];
  availableDeptOptions: DepartmentCode[];
  allRoles: SystemRole[];
  allDepartments: DepartmentCode[];
  userBanner: { type: 'ok' | 'err'; text: string } | null;
  setUserBanner: React.Dispatch<React.SetStateAction<{ type: 'ok' | 'err'; text: string } | null>>;
  perms: ReturnType<typeof usePermissions>;
  currentUser?: UserAccount;
  userFormOpen: boolean;
  setUserFormOpen: React.Dispatch<React.SetStateAction<boolean>>;
  userFormMode: 'create' | 'edit';
  formFullName: string;
  setFormFullName: React.Dispatch<React.SetStateAction<string>>;
  formLogin: string;
  setFormLogin: React.Dispatch<React.SetStateAction<string>>;
  formPassword: string;
  setFormPassword: React.Dispatch<React.SetStateAction<string>>;
  formRole: SystemRole;
  setFormRole: React.Dispatch<React.SetStateAction<SystemRole>>;
  formDept: DepartmentCode;
  setFormDept: React.Dispatch<React.SetStateAction<DepartmentCode>>;
  formPosition: string;
  setFormPosition: React.Dispatch<React.SetStateAction<string>>;
  formActive: boolean;
  setFormActive: React.Dispatch<React.SetStateAction<boolean>>;
  savingUser: boolean;
  canCurrentActorEditTarget: (target: UserAccount) => boolean;
  onOpenCreateUserForm: () => void;
  onOpenEditUserForm: (u: UserAccount) => void;
  onSubmitUserForm: (e: React.FormEvent) => void;
  onToggleUserActive: (u: UserAccount) => void;
}

export const AdminUsersTab: React.FC<AdminUsersTabProps> = ({
  displayedUsers,
  loadingUsers,
  userSearch,
  setUserSearch,
  roleFilter,
  setRoleFilter,
  deptFilter,
  setDeptFilter,
  availableRoleOptions,
  availableDeptOptions,
  allRoles: ALL_ROLES,
  allDepartments: ALL_DEPARTMENTS,
  userBanner,
  setUserBanner,
  perms,
  currentUser,
  userFormOpen,
  setUserFormOpen,
  userFormMode,
  formFullName,
  setFormFullName,
  formLogin,
  setFormLogin,
  formPassword,
  setFormPassword,
  formRole,
  setFormRole,
  formDept,
  setFormDept,
  formPosition,
  setFormPosition,
  formActive,
  setFormActive,
  savingUser,
  canCurrentActorEditTarget,
  onOpenCreateUserForm: openCreateUserForm,
  onOpenEditUserForm: openEditUserForm,
  onSubmitUserForm: handleSubmitUserForm,
  onToggleUserActive: handleToggleUserActive,
}) => {
  return (
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
  );
};
