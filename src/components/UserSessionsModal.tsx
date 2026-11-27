import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Globe,
  Loader2,
  LogOut,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import { zaychickApi } from '../api';
import { UserSessionInfo } from '../types/welding';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { formatTimestampDDMMYY } from '../utils/weldingLogic';

interface UserSessionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogoutAllDevices: () => Promise<void>;
}

function isMobileLabel(label: string): boolean {
  const lower = label.toLowerCase();
  return lower.includes('ios') || lower.includes('android');
}

export const UserSessionsModal: React.FC<UserSessionsModalProps> = ({
  isOpen,
  onClose,
  onLogoutAllDevices,
}) => {
  const [sessions, setSessions] = useState<UserSessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [noticeMsg, setNoticeMsg] = useState('');

  useModalDismiss({ isOpen, onClose });

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const list = await zaychickApi.listMySessions();
      setSessions(list);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Не удалось загрузить список активных сессий.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setNoticeMsg('');
    void loadSessions();
  }, [isOpen, loadSessions]);

  if (!isOpen) return null;

  const otherSessionsCount = sessions.filter((s) => !s.isCurrent).length;

  const handleRevokeOne = async (sessionId: string) => {
    setBusyId(sessionId);
    setErrorMsg('');
    setNoticeMsg('');
    try {
      await zaychickApi.revokeMySession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setNoticeMsg('Сессия на выбранном устройстве завершена.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Не удалось завершить сессию.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRevokeOthers = async () => {
    setBusyId('others');
    setErrorMsg('');
    setNoticeMsg('');
    try {
      const res = await zaychickApi.revokeOtherSessions();
      setSessions((prev) => prev.filter((s) => s.isCurrent));
      setNoticeMsg(
        res.revoked_count > 0
          ? `Завершено других сессий: ${res.revoked_count}.`
          : 'Других активных сессий нет.'
      );
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Не удалось завершить остальные сессии.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleLogoutEverywhere = async () => {
    setBusyId('all');
    try {
      onClose();
      await onLogoutAllDevices();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-sessions-modal-title"
        className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col"
      >
        {/* Заголовок */}
        <div className="px-5 py-4 bg-[#1e3799] text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-sky-200" />
            </div>
            <div className="min-w-0">
              <h2
                id="user-sessions-modal-title"
                className="text-sm font-bold tracking-tight truncate"
              >
                Активные сессии
              </h2>
              <p className="text-[11px] text-sky-200 truncate">
                Устройства, на которых выполнен вход в вашу учётную запись
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => void loadSessions()}
              disabled={loading}
              aria-label="Обновить список сессий"
              title="Обновить список"
              className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть окно"
              className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Содержимое */}
        <div className="p-5 overflow-y-auto flex-1 space-y-3">
          {errorMsg && (
            <div
              role="alert"
              className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {noticeMsg && (
            <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{noticeMsg}</span>
            </div>
          )}

          {loading && sessions.length === 0 ? (
            <div className="py-10 flex items-center justify-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin text-[#1e3799]" />
              <span>Загрузка активных сессий...</span>
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Активные сессии не найдены.
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((sess) => {
                const mobile = isMobileLabel(sess.deviceLabel);
                return (
                  <div
                    key={sess.id}
                    className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                      sess.isCurrent
                        ? 'bg-[#f4f8fe] border-sky-200'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                          sess.isCurrent
                            ? 'bg-[#1e3799] text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {mobile ? (
                          <Smartphone className="w-4 h-4" />
                        ) : (
                          <Monitor className="w-4 h-4" />
                        )}
                      </div>

                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-900">
                            {sess.deviceLabel || 'Браузер'}
                          </span>
                          {sess.isCurrent && (
                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                              Текущая сессия
                            </span>
                          )}
                        </div>

                        <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                          {sess.ipAddress && (
                            <span className="inline-flex items-center gap-1 font-mono">
                              <Globe className="w-3 h-3 text-slate-400" />
                              {sess.ipAddress}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <Clock className="w-3 h-3 text-slate-400" />
                            Активность: {formatTimestampDDMMYY(sess.lastSeenAt)}
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-400 tabular-nums">
                          Вход: {formatTimestampDDMMYY(sess.createdAt)} · Действует до:{' '}
                          {formatTimestampDDMMYY(sess.expiresAt)}
                        </div>
                      </div>
                    </div>

                    {!sess.isCurrent && (
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => void handleRevokeOne(sess.id)}
                        className="h-8 px-2.5 rounded-lg border border-slate-200 hover:border-red-300 hover:bg-red-50 text-slate-600 hover:text-red-700 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {busyId === sess.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        <span>Завершить</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Подвал */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busyId !== null || otherSessionsCount === 0}
              onClick={() => void handleRevokeOthers()}
              className="h-8 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-45 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              Завершить остальные
            </button>

            <button
              type="button"
              disabled={busyId !== null}
              onClick={() => void handleLogoutEverywhere()}
              className="h-8 px-3 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 disabled:opacity-45 text-red-700 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Выйти со всех устройств</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 rounded-lg bg-[#1e3799] text-white text-xs font-semibold hover:bg-[#15276e] cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
