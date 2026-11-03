import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  KeyRound,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { UserAccount } from '../types/welding';
import { getUserRolePermissions } from '../utils/rbac';
import { hashPasswordWithSalt, verifyPassword } from '../utils/authSecurity';
import { ZaychickLogo } from './ZaychickLogo';

export type LoginModalMode = 'login' | 'register' | 'admin_password';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount;
  accounts: UserAccount[];
  initialMode?: LoginModalMode;
  onAuthenticate: (account: UserAccount) => void;
  onRegisterAccount?: (account: UserAccount) => void;
  onDeleteAccount?: (login: string) => void;
  onToggleAdminRights?: (
    targetLogin: string,
    grantAdmin: boolean
  ) => { ok: boolean; message: string };
  onChangeAdminPassword?: (
    adminLogin: string,
    currentPassword: string,
    newPassword: string
  ) => { ok: boolean; message: string };
}

const ROLE_PRESETS = [
  'Системный администратор (Полный доступ)',
  'Администратор системы (Полный доступ)',
  'Главный инженер ПТО',
  'Ведущий инженер ПТО (Лайнлист / РД)',
  'Инженер ПТО (Каталог ЛРВ и входной контроль)',
  'Главный сварщик (НАКС / Техкарты)',
  'Технолог по сварке (Служба ГС)',
  'Инженер ПТО (Реестр стыков и сводка)',
  'Производитель работ СМР (Участок №1)',
  'Производитель работ СМР (Участок №2)',
  'Инженер СК / ВИК (Строительный контроль)',
  'Специалист ЛНК',
  'Дефектоскопист ЛНК (РК / УЗК / ПВК)',
  'Представитель Заказчика',
  'Инженер по комплектации ИД (Печать журналов)',
];

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  accounts,
  initialMode = 'login',
  onAuthenticate,
  onRegisterAccount,
  onDeleteAccount,
  onToggleAdminRights,
  onChangeAdminPassword,
}) => {
  const isCurrentUserAdmin = useMemo(
    () => getUserRolePermissions(currentUser).category === 'admin',
    [currentUser]
  );
  const [mode, setMode] = useState<LoginModalMode>(
    !isCurrentUserAdmin && initialMode === 'register' ? 'login' : initialMode
  );
  const [login, setLogin] = useState(currentUser.login);
  const [password, setPassword] = useState(currentUser.password || '123');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState(ROLE_PRESETS[5]);
  const [department, setDepartment] = useState('Производственно-технический отдел');
  const [registerIsAdmin, setRegisterIsAdmin] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [confirmDeleteLogin, setConfirmDeleteLogin] = useState<string | null>(null);

  // Поля формы смены пароля администратора
  const adminAccounts = useMemo(
    () =>
      accounts.filter(
        (acc) => getUserRolePermissions(acc).category === 'admin'
      ),
    [accounts]
  );

  const [targetAdminLogin, setTargetAdminLogin] = useState<string>(
    currentUser.login
  );
  const [oldAdminPassword, setOldAdminPassword] = useState<string>('');
  const [newAdminPassword, setNewAdminPassword] = useState<string>('');
  const [confirmAdminPassword, setConfirmAdminPassword] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      const allowedInitialMode =
        !isCurrentUserAdmin && initialMode === 'register' ? 'login' : initialMode;
      setMode(allowedInitialMode);
      setLogin(currentUser.login);
      setPassword(currentUser.password || '123');
      setErrorMsg('');
      setSuccessMsg('');
      setRegisterIsAdmin(false);
      const defaultAdmin =
        adminAccounts.find((a) => a.login === currentUser.login)?.login ||
        adminAccounts[0]?.login ||
        currentUser.login;
      setTargetAdminLogin(defaultAdmin);
      setOldAdminPassword('');
      setNewAdminPassword('');
      setConfirmAdminPassword('');
    }
  }, [isOpen, initialMode, currentUser.login, isCurrentUserAdmin, adminAccounts]);

  if (!isOpen) return null;

  const getNextSessionNumber = () => {
    const maxSession = accounts.reduce(
      (max, acc) => Math.max(max, acc.sessionNumber || 0),
      30
    );
    return maxSession + 1;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (mode === 'admin_password') {
      if (!onChangeAdminPassword) return;
      const cleanOld = oldAdminPassword.trim();
      const cleanNew = newAdminPassword.trim();
      const cleanConfirm = confirmAdminPassword.trim();

      if (!cleanOld) {
        setErrorMsg('Введите действующий пароль администратора');
        return;
      }
      if (cleanNew.length < 3) {
        setErrorMsg('Новый пароль администратора должен содержать не менее 3 символов');
        return;
      }
      if (cleanNew !== cleanConfirm) {
        setErrorMsg('Новый пароль и подтверждение пароля не совпадают');
        return;
      }

      const res = onChangeAdminPassword(targetAdminLogin, cleanOld, cleanNew);
      if (!res.ok) {
        setErrorMsg(res.message);
        return;
      }
      setSuccessMsg(res.message);
      setOldAdminPassword('');
      setNewAdminPassword('');
      setConfirmAdminPassword('');
      if (targetAdminLogin === currentUser.login) {
        setPassword(cleanNew);
      }
      return;
    }

    const cleanLogin = login.trim();
    const cleanPassword = password.trim();

    if (!cleanLogin || !cleanPassword) {
      setErrorMsg('Введите пару логин и пароль для входа в систему');
      return;
    }

    if (mode === 'register') {
      if (!isCurrentUserAdmin) {
        setErrorMsg('Право регистрации новых пользователей предоставлено исключительно администратору системы');
        return;
      }
      if (cleanPassword.length < 3) {
        setErrorMsg('Пароль должен содержать не менее 3 символов');
        return;
      }
      if (!fullName.trim()) {
        setErrorMsg('Укажите ФИО регистрируемого специалиста');
        return;
      }
      const existing = accounts.find(
        (a) => a.login.toLowerCase() === cleanLogin.toLowerCase()
      );
      if (existing) {
        setErrorMsg(`Логин «${cleanLogin}» уже зарегистрирован в системе`);
        return;
      }

      const assignedRole = registerIsAdmin
        ? (role.trim() || 'Администратор системы (Полный доступ)')
        : (role.trim() || 'Инженер ПТО / СМР');

      const hashed = hashPasswordWithSalt(cleanPassword);
      const newAcc: UserAccount = {
        login: cleanLogin,
        password: cleanPassword,
        passwordHash: hashed.hash,
        passwordSalt: hashed.salt,
        fullName: fullName.trim(),
        role: assignedRole,
        department:
          department.trim() ||
          (registerIsAdmin
            ? 'Администрация / Управление проектом'
            : 'Производственно-технический отдел'),
        sessionNumber: getNextSessionNumber(),
        isAdmin: registerIsAdmin,
      };

      setErrorMsg('');
      onRegisterAccount?.(newAcc);
      onAuthenticate(newAcc);
      onClose();
      return;
    }

    const existingAcc = accounts.find(
      (a) => a.login.toLowerCase() === cleanLogin.toLowerCase()
    );

    if (existingAcc) {
      const isPasswordCorrect = verifyPassword(
        cleanPassword,
        existingAcc.passwordHash || existingAcc.password,
        existingAcc.passwordSalt
      );
      if (isPasswordCorrect) {
        setErrorMsg('');
        onAuthenticate(existingAcc);
        onClose();
      } else {
        setErrorMsg(
          `Неверный пароль для учётной записи «${existingAcc.login}»`
        );
      }
      return;
    }

    // Если пользователь не найден в системе — запрещаем авторегистрацию для обычных ролей
    if (!isCurrentUserAdmin) {
      setErrorMsg(
        `Пользователь «${cleanLogin}» не найден. Регистрация новых пользователей доступна исключительно администратору системы.`
      );
      return;
    }

    // Если действующий администратор ввёл новый корпоративный логин с паролем >= 3 символов — регистрируем в пуле
    if (cleanPassword.length >= 3) {
      const autoAcc: UserAccount = {
        login: cleanLogin,
        password: cleanPassword,
        fullName: fullName.trim() || `Инженер (${cleanLogin})`,
        role: role.trim() || 'Инженер ПТО / СМР',
        department: department.trim() || 'Производственно-технический отдел',
        sessionNumber: getNextSessionNumber(),
      };
      setErrorMsg('');
      onRegisterAccount?.(autoAcc);
      onAuthenticate(autoAcc);
      onClose();
    } else {
      setErrorMsg('Неверный логин или пароль');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Авторизация, регистрация и смена пароля администратора"
    >
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 bg-[#1e3799] text-white flex items-center justify-between shrink-0">
          <ZaychickLogo variant="header" size={34} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно входа"
            className="p-1.5 rounded-lg text-sky-100 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Многопользовательский доступ «ZAYCHICK»
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Все действия протоколируются в журнале аудита под личным логином и ролью
              </p>
            </div>
          </div>

          {isCurrentUserAdmin && (
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                className={`py-1.5 px-2.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  mode === 'login'
                    ? 'bg-[#1e3799] text-white shadow-2xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                Вход по логину
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setLogin('');
                  setPassword('123');
                  setFullName('');
                  setRegisterIsAdmin(false);
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                className={`py-1.5 px-2.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  mode === 'register'
                    ? 'bg-[#1e3799] text-white shadow-2xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                Регистрация
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('admin_password');
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                className={`py-1.5 px-2.5 rounded-md text-xs font-semibold transition-colors cursor-pointer inline-flex items-center justify-center gap-1 ${
                  mode === 'admin_password'
                    ? 'bg-[#1e3799] text-white shadow-2xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <Lock className="w-3 h-3 shrink-0" />
                <span className="truncate">Пароль админа</span>
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {mode === 'admin_password' ? (
            <div className="space-y-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-2 text-xs font-bold text-[#1e3799]">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Смена пароля учётной записи администратора</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Учётная запись администратора
                </label>
                <select
                  value={targetAdminLogin}
                  onChange={(e) => setTargetAdminLogin(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
                >
                  {adminAccounts.map((adm) => (
                    <option key={adm.login} value={adm.login}>
                      {adm.fullName} ({adm.login}) — {adm.role}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Действующий пароль администратора *
                </label>
                <input
                  type="password"
                  required
                  value={oldAdminPassword}
                  onChange={(e) => setOldAdminPassword(e.target.value)}
                  placeholder="Введите текущий пароль"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Новый пароль *
                  </label>
                  <input
                    type="password"
                    required
                    value={newAdminPassword}
                    onChange={(e) => setNewAdminPassword(e.target.value)}
                    placeholder="Мин. 3 символа"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Подтвердите новый пароль *
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmAdminPassword}
                    onChange={(e) => setConfirmAdminPassword(e.target.value)}
                    placeholder="Повторите новый пароль"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
                  />
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Логин пользователя *
                  </label>
                  <input
                    type="text"
                    required
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    placeholder="Напр.: morozov_ig"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#1e3799] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Пароль *
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Введите пароль"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#1e3799] focus:bg-white"
                  />
                </div>
              </div>

              {mode === 'register' && (
                <div className="space-y-3 pt-1 border-t border-slate-200">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      ФИО специалиста (для журналов и аудита) *
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Напр.: Морозов Игорь Геннадьевич"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#1e3799] focus:bg-white"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Должность / Роль в системе
                      </label>
                      <input
                        type="text"
                        list="role-presets-list"
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        placeholder="Выберите или введите должность"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#1e3799] focus:bg-white"
                      />
                      <datalist id="role-presets-list">
                        {ROLE_PRESETS.map((r) => (
                          <option key={r} value={r} />
                        ))}
                      </datalist>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Подразделение / Служба
                      </label>
                      <input
                        type="text"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        placeholder="Напр.: Лаборатория НК (ЛНК)"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#1e3799] focus:bg-white"
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200">
                    <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-sky-50 border border-sky-200 cursor-pointer hover:bg-sky-100 transition-colors">
                      <input
                        type="checkbox"
                        checked={registerIsAdmin}
                        onChange={(e) => setRegisterIsAdmin(e.target.checked)}
                        className="w-4 h-4 mt-0.5 text-[#1e3799] rounded border-slate-300 focus:ring-[#1e3799]"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-[#1e3799] flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5 text-[#1e3799]" />
                          <span>Назначить права администратора</span>
                        </span>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          Пользователь получит неограниченный доступ ко всем разделам системы, управлению СУБД и назначению ролей
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              )}
            </>
          )}

          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#1e3799] text-white text-xs font-semibold hover:bg-[#15276e] transition-colors cursor-pointer"
          >
            {mode === 'admin_password' ? (
              <>
                <Lock className="w-4 h-4" />
                <span>Сохранить новый пароль администратора</span>
              </>
            ) : mode === 'register' ? (
              <>
                <UserPlus className="w-4 h-4" />
                <span>Зарегистрировать и войти в сессию</span>
              </>
            ) : (
              <>
                <KeyRound className="w-4 h-4" />
                <span>Войти по логину и паролю</span>
              </>
            )}
          </button>

          {/* Быстрый выбор и управление учётными записями */}
          <div className="pt-3 border-t border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
              <span>Зарегистрированные специалисты ({accounts.length} чел.):</span>
              <span className="font-mono">Базовый пароль: 123</span>
            </div>
            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {accounts.map((acc) => {
                const isCurrent = acc.login === currentUser.login;
                const isConfirming = confirmDeleteLogin === acc.login;
                const isAccAdmin =
                  getUserRolePermissions(acc).category === 'admin';
                const hasCustomPassword = acc.password !== '123';

                return (
                  <div
                    key={acc.login}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left text-xs transition-colors ${
                      isCurrent
                        ? 'bg-[#e8f1fc] border-[#1e3799] text-[#1e3799]'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (isAccAdmin && hasCustomPassword && !isCurrent) {
                          setMode('login');
                          setLogin(acc.login);
                          setPassword('');
                          setSuccessMsg('');
                          setErrorMsg(
                            `Учётная запись администратора «${acc.login}» защищена индивидуальным паролем. Введите пароль в поле выше.`
                          );
                          return;
                        }
                        setLogin(acc.login);
                        setPassword(acc.password);
                        onAuthenticate(acc);
                        onClose();
                      }}
                      className="flex-1 text-left min-w-0 pr-2 cursor-pointer"
                    >
                      <div className="font-semibold truncate flex items-center gap-1.5">
                        <span className="truncate">{acc.fullName}</span>
                        {isAccAdmin && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-indigo-100 text-[#1e3799] text-[10px] font-bold shrink-0">
                            <ShieldCheck className="w-3 h-3" />
                            <span>Админ</span>
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        Логин: <span className="font-mono">{acc.login}</span> · {acc.role}
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {!isConfirming ? (
                        <>
                          {isCurrentUserAdmin && onToggleAdminRights && (
                            acc.login !== 'admin' ? (
                              isAccAdmin ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const res = onToggleAdminRights(acc.login, false);
                                    if (res.ok) setSuccessMsg(res.message);
                                    else setErrorMsg(res.message);
                                  }}
                                  title="Отозвать права администратора"
                                  className="px-2 py-1 rounded bg-white border border-amber-300 text-amber-800 hover:bg-amber-50 text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                                >
                                  <ShieldAlert className="w-3 h-3 text-amber-600" />
                                  <span>Снять админа</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const res = onToggleAdminRights(acc.login, true);
                                    if (res.ok) setSuccessMsg(res.message);
                                    else setErrorMsg(res.message);
                                  }}
                                  title="Назначить права администратора"
                                  className="px-2 py-1 rounded bg-white border border-indigo-200 text-[#1e3799] hover:bg-indigo-50 text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                                >
                                  <ShieldCheck className="w-3 h-3 text-indigo-600" />
                                  <span>Сделать админом</span>
                                </button>
                              )
                            ) : null
                          )}
                          {isAccAdmin && isCurrentUserAdmin && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTargetAdminLogin(acc.login);
                                setMode('admin_password');
                                setErrorMsg('');
                                setSuccessMsg('');
                              }}
                              title="Изменить пароль администратора"
                              className="px-2 py-1 rounded bg-white border border-sky-200 text-[#1e3799] hover:bg-sky-50 text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <KeyRound className="w-3 h-3" />
                              <span>Пароль</span>
                            </button>
                          )}
                          <span className="font-mono text-[10px] text-slate-500">
                            #{acc.sessionNumber}
                          </span>
                          {isCurrentUserAdmin && onDeleteAccount && acc.login !== 'admin' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (accounts.length <= 1) {
                                  setErrorMsg(
                                    'Нельзя удалить единственную оставшуюся учётную запись в системе.'
                                  );
                                  return;
                                }
                                setConfirmDeleteLogin(acc.login);
                              }}
                              title={`Удалить пользователя ${acc.fullName}`}
                              aria-label={`Удалить пользователя ${acc.fullName}`}
                              className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteAccount?.(acc.login);
                              setConfirmDeleteLogin(null);
                            }}
                            className="px-2 py-1 rounded bg-red-600 text-white text-[11px] font-bold hover:bg-red-700 cursor-pointer"
                          >
                            Удалить
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteLogin(null);
                            }}
                            className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-700 text-[11px] font-semibold cursor-pointer"
                          >
                            Отмена
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[#1e3799]" />
              <span>Активных сессий в пуле: {Math.max(32, accounts.length + 28)}</span>
            </span>
            <span className="font-mono">СУБД: до 100 000 строк</span>
          </div>
        </form>
      </div>
    </div>
  );
};
