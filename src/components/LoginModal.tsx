import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { ApiError, zaychickApi } from '../api';
import { markGuestModeDismissed } from '../hooks/useServerSync';
import { UserAccount } from '../types/welding';
import { useModalDismiss } from '../hooks/useModalDismiss';
import {
  DEPARTMENT_LABELS_RU,
  resolveUserDepartment,
  resolveUserSystemRole,
  SYSTEM_ROLE_LABELS_RU,
} from '../utils/rbac';

export type LoginModalMode = 'login' | 'change_password' | 'force_change_password';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount;
  initialMode?: LoginModalMode;
  isAuthenticated?: boolean;
  sessionExpiredNotice?: string | null;
  onClearSessionNotice?: () => void;
  onAuthenticate: (account: UserAccount) => void;
  onLogout?: () => Promise<void>;
}

const MIN_PASSWORD_LENGTH = 8;

function formatUserFriendlyAuthError(err: unknown): { message: string; retryAfter?: number } {
  if (err instanceof ApiError) {
    if (err.status === 429) {
      return {
        message: 'Превышено число попыток входа. Подождите перед следующей попыткой.',
        retryAfter: err.retryAfterSeconds ?? 60,
      };
    }
    if (err.status === 401) {
      return { message: err.message || 'Неверный логин или пароль.' };
    }
    if (err.status === 403) {
      return { message: err.message || 'Учётная запись деактивирована. Обратитесь к администратору.' };
    }
    if (err.status >= 500) {
      return { message: 'Сервер временно недоступен. Попробуйте повторить вход позже.' };
    }
    return { message: err.message || 'Не удалось выполнить запрос.' };
  }
  if (err instanceof Error) {
    const lower = err.message.toLowerCase();
    if (lower.includes('fetch') || lower.includes('network') || lower.includes('failed')) {
      return { message: 'Нет связи с сервером. Проверьте подключение и повторите попытку.' };
    }
    return { message: err.message };
  }
  return { message: 'Не удалось выполнить вход. Повторите попытку.' };
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  initialMode = 'login',
  isAuthenticated = false,
  sessionExpiredNotice = null,
  onClearSessionNotice,
  onAuthenticate,
  onLogout,
}) => {
  const [mode, setMode] = useState<LoginModalMode>(initialMode);
  const [loginInput, setLoginInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [retryCountdown, setRetryCountdown] = useState<number>(0);

  const isForcedRotation = mode === 'force_change_password';

  const handleRequestClose = () => {
    if (isForcedRotation) return;
    if (!isAuthenticated) {
      markGuestModeDismissed();
    }
    onClearSessionNotice?.();
    onClose();
  };

  useModalDismiss({
    isOpen: isOpen && !isForcedRotation,
    onClose: handleRequestClose,
  });

  useEffect(() => {
    if (!isOpen) return;
    const resolvedMode: LoginModalMode =
      initialMode === 'force_change_password'
        ? 'force_change_password'
        : initialMode === 'change_password' && isAuthenticated
          ? 'change_password'
          : 'login';

    setMode(resolvedMode);
    setLoginInput('');
    setPasswordInput('');
    setShowPassword(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setShowCurrentPwd(false);
    setShowNewPwd(false);
    setErrorMsg('');
    setInfoMsg('');
    setIsSubmitting(false);
  }, [isOpen, initialMode, isAuthenticated]);

  useEffect(() => {
    if (retryCountdown <= 0) return;
    const timer = window.setInterval(() => {
      setRetryCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryCountdown]);

  if (!isOpen) return null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || retryCountdown > 0) return;

    const cleanLogin = loginInput.trim();
    if (!cleanLogin || !passwordInput) {
      setErrorMsg('Введите логин и пароль.');
      return;
    }

    setErrorMsg('');
    setInfoMsg('');
    setIsSubmitting(true);
    try {
      const session = await zaychickApi.login(cleanLogin, passwordInput);
      onClearSessionNotice?.();
      onAuthenticate(session.user);

      if (session.user.mustChangePassword) {
        setCurrentPassword(passwordInput);
        setPasswordInput('');
        setMode('force_change_password');
        setInfoMsg('');
      } else {
        setPasswordInput('');
        onClose();
      }
    } catch (err: unknown) {
      const parsed = formatUserFriendlyAuthError(err);
      setErrorMsg(parsed.message);
      if (parsed.retryAfter && parsed.retryAfter > 0) {
        setRetryCountdown(parsed.retryAfter);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const cleanCurrent = currentPassword;
    const cleanNew = newPassword.trim();
    const cleanConfirm = confirmNewPassword.trim();

    if (!cleanCurrent) {
      setErrorMsg('Введите текущий пароль.');
      return;
    }
    if (cleanNew.length < MIN_PASSWORD_LENGTH) {
      setErrorMsg(`Новый пароль должен содержать не менее ${MIN_PASSWORD_LENGTH} символов.`);
      return;
    }
    if (cleanNew === cleanCurrent.trim()) {
      setErrorMsg('Новый пароль должен отличаться от текущего.');
      return;
    }
    if (cleanNew !== cleanConfirm) {
      setErrorMsg('Новый пароль и подтверждение не совпадают.');
      return;
    }

    setErrorMsg('');
    setInfoMsg('');
    setIsSubmitting(true);
    try {
      const session = await zaychickApi.changeOwnPassword(cleanCurrent, cleanNew);
      onAuthenticate(session.user);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      if (isForcedRotation) {
        onClose();
      } else {
        setInfoMsg('Пароль успешно обновлён. Остальные сессии завершены.');
      }
    } catch (err: unknown) {
      const parsed = formatUserFriendlyAuthError(err);
      setErrorMsg(parsed.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const userRoleLabel = SYSTEM_ROLE_LABELS_RU[resolveUserSystemRole(currentUser)];
  const userDeptLabel = DEPARTMENT_LABELS_RU[resolveUserDepartment(currentUser)];

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isForcedRotation) {
          handleRequestClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col"
      >
        {/* Заголовок */}
        <div className="px-5 py-4 bg-[#1e3799] text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
              {mode === 'login' ? (
                <KeyRound className="w-4 h-4 text-sky-200" />
              ) : (
                <Lock className="w-4 h-4 text-sky-200" />
              )}
            </div>
            <div className="min-w-0">
              <h2 id="auth-modal-title" className="text-sm font-bold tracking-tight truncate">
                {mode === 'login'
                  ? 'Вход в систему'
                  : isForcedRotation
                    ? 'Требуется смена пароля'
                    : 'Смена пароля'}
              </h2>
              <p className="text-[11px] text-sky-200 truncate">
                {mode === 'login'
                  ? 'Авторизация сотрудника для работы с проектом'
                  : 'Обновление пароля вашей учётной записи'}
              </p>
            </div>
          </div>

          {!isForcedRotation && (
            <button
              type="button"
              onClick={handleRequestClose}
              aria-label="Закрыть окно"
              className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Переключатель режимов только для уже авторизованного пользователя */}
        {isAuthenticated && !isForcedRotation && (
          <div className="px-5 pt-3 bg-slate-50 border-b border-slate-200 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg('');
                setInfoMsg('');
              }}
              className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'border-[#1e3799] text-[#1e3799]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Сменить пользователя
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('change_password');
                setErrorMsg('');
                setInfoMsg('');
              }}
              className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                mode === 'change_password'
                  ? 'border-[#1e3799] text-[#1e3799]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Смена пароля
            </button>
          </div>
        )}

        {/* Тело модального окна */}
        <div className="p-5 space-y-4">
          {/* Уведомление об истечении сессии */}
          {mode === 'login' && sessionExpiredNotice && (
            <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{sessionExpiredNotice}</span>
            </div>
          )}

          {/* Уведомление об обязательной смене временного пароля */}
          {isForcedRotation && (
            <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
              <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Для продолжения работы установите постоянный пароль длиной не менее{' '}
                {MIN_PASSWORD_LENGTH} символов.
              </span>
            </div>
          )}

          {/* Таймер блокировки при 429 */}
          {retryCountdown > 0 && (
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
              <Clock className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="tabular-nums">
                Повторная попытка входа доступна через {retryCountdown} сек.
              </span>
            </div>
          )}

          {errorMsg && retryCountdown === 0 && (
            <div
              role="alert"
              className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {infoMsg && (
            <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{infoMsg}</span>
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-3.5">
              <div className="space-y-1">
                <label
                  htmlFor="auth-login-input"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Логин
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="auth-login-input"
                    type="text"
                    required
                    autoFocus
                    autoComplete="username"
                    value={loginInput}
                    onChange={(e) => setLoginInput(e.target.value)}
                    placeholder="Введите логин учётной записи"
                    className="w-full h-10 pl-9 pr-3 bg-white border border-slate-300 focus:border-[#1e3799] focus:ring-2 focus:ring-[#1e3799]/15 focus:outline-none rounded-lg text-sm font-medium text-slate-900"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="auth-password-input"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Пароль
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="auth-password-input"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Введите пароль"
                    className="w-full h-10 pl-9 pr-10 bg-white border border-slate-300 focus:border-[#1e3799] focus:ring-2 focus:ring-[#1e3799]/15 focus:outline-none rounded-lg text-sm font-medium text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                    tabIndex={-1}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="pt-1 flex flex-col gap-2">
                <button
                  type="submit"
                  disabled={isSubmitting || retryCountdown > 0}
                  className="w-full h-10 px-4 rounded-lg bg-[#1e3799] hover:bg-[#15276e] disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Проверка учётных данных...</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>Войти в систему</span>
                    </>
                  )}
                </button>

                {!isAuthenticated && (
                  <button
                    type="button"
                    onClick={handleRequestClose}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium transition-colors cursor-pointer"
                  >
                    Продолжить в режиме просмотра
                  </button>
                )}
              </div>
            </form>
          ) : (
            <form onSubmit={handlePasswordChangeSubmit} className="space-y-3.5">
              {/* Карточка текущего пользователя */}
              <div className="px-3.5 py-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">
                    {currentUser.fullName}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {currentUser.login} · {userRoleLabel} · {userDeptLabel}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="auth-cur-password"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Текущий пароль
                </label>
                <div className="relative">
                  <input
                    id="auth-cur-password"
                    type={showCurrentPwd ? 'text' : 'password'}
                    required
                    autoFocus={!currentPassword}
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Введите действующий пароль"
                    className="w-full h-10 pl-3 pr-10 bg-white border border-slate-300 focus:border-[#1e3799] focus:ring-2 focus:ring-[#1e3799]/15 focus:outline-none rounded-lg text-sm font-medium text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPwd((prev) => !prev)}
                    aria-label={showCurrentPwd ? 'Скрыть пароль' : 'Показать пароль'}
                    tabIndex={-1}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showCurrentPwd ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="auth-new-password"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Новый пароль
                </label>
                <div className="relative">
                  <input
                    id="auth-new-password"
                    type={showNewPwd ? 'text' : 'password'}
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    autoFocus={Boolean(currentPassword)}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={`Минимум ${MIN_PASSWORD_LENGTH} символов`}
                    className="w-full h-10 pl-3 pr-10 bg-white border border-slate-300 focus:border-[#1e3799] focus:ring-2 focus:ring-[#1e3799]/15 focus:outline-none rounded-lg text-sm font-medium text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPwd((prev) => !prev)}
                    aria-label={showNewPwd ? 'Скрыть пароль' : 'Показать пароль'}
                    tabIndex={-1}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showNewPwd ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="auth-confirm-password"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Подтверждение нового пароля
                </label>
                <input
                  id="auth-confirm-password"
                  type={showNewPwd ? 'text' : 'password'}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Повторите новый пароль"
                  className="w-full h-10 px-3 bg-white border border-slate-300 focus:border-[#1e3799] focus:ring-2 focus:ring-[#1e3799]/15 focus:outline-none rounded-lg text-sm font-medium text-slate-900"
                />
              </div>

              <div className="pt-1 flex flex-col gap-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-10 px-4 rounded-lg bg-[#1e3799] hover:bg-[#15276e] disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Сохранение...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Сохранить новый пароль</span>
                    </>
                  )}
                </button>

                {isForcedRotation && onLogout && (
                  <button
                    type="button"
                    onClick={() => {
                      void onLogout();
                    }}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Выйти из учётной записи</span>
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
