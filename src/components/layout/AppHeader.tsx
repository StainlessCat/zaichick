import React from 'react';
import {
  AlertTriangle,
  LogIn,
  LogOut,
  Menu,
  Redo2,
  RotateCw,
  Undo2,
  UserCheck,
} from 'lucide-react';
import { AppSection, ServerDbMetadata, UserAccount } from '../../types/welding';
import { ZaychickLogo } from '../ZaychickLogo';

interface AppHeaderProps {
  activeSection: AppSection;
  sectionIcons: Record<AppSection, React.ReactNode>;
  sectionLabels: Record<AppSection, string>;
  onLogoClick: () => void;
  isDbConnected: boolean;
  isDbSyncing: boolean;
  isAuthenticated: boolean;
  pendingSyncCount: number;
  lastSyncError: string | null;
  serverDbMeta: ServerDbMetadata | null;
  currentUser: UserAccount;
  onOpenServerDbModal: () => void;
  onTriggerSync: () => Promise<boolean>;
  onOpenLoginModal: () => void;
  onLogout: () => Promise<void>;
  undoCount: number;
  redoCount: number;
  lastUndoLabel?: string;
  lastRedoLabel?: string;
  onUndo: () => void;
  onRedo: () => void;
  onOpenDrawer: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  activeSection,
  sectionIcons,
  sectionLabels,
  onLogoClick,
  isDbConnected,
  isDbSyncing,
  isAuthenticated,
  pendingSyncCount,
  lastSyncError,
  serverDbMeta,
  currentUser,
  onOpenServerDbModal,
  onTriggerSync,
  onOpenLoginModal,
  onLogout,
  undoCount,
  redoCount,
  lastUndoLabel,
  lastRedoLabel,
  onUndo,
  onRedo,
  onOpenDrawer,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-[#1e3799] text-white border-b border-sky-400/20 shadow-md no-print">
      <div className="max-w-[1920px] mx-auto px-4 py-2 flex items-center justify-between gap-4">
        <div
          onClick={onLogoClick}
          className="flex items-center min-w-0 shrink-0 cursor-pointer select-none"
          title="zaychick"
        >
          <ZaychickLogo variant="header" size={38} />
        </div>

        <div className="flex items-center justify-center flex-1 min-w-0 px-2 text-center">
          <div className="inline-flex items-center justify-center gap-2 max-w-full">
            {sectionIcons[activeSection]}
            <h1
              className="text-xs sm:text-sm md:text-base font-bold text-white uppercase tracking-wider truncate font-century-gothic"
              style={{
                fontFamily:
                  '"Jost", "Century Gothic", CenturyGothic, AppleGothic, sans-serif',
              }}
            >
              {sectionLabels[activeSection]?.toUpperCase()}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isDbConnected && pendingSyncCount === 0 ? (
            <button
              type="button"
              onClick={onOpenServerDbModal}
              title="Серверная СУБД PostgreSQL 16 онлайн (REST API + SSE). Все изменения зафиксированы."
              className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-100 text-xs font-mono transition-colors cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span>PostgreSQL · rev #{serverDbMeta?.globalRevision ?? 1}</span>
            </button>
          ) : isDbSyncing ? (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/20 border border-sky-400/40 text-sky-100 text-xs font-mono">
              <RotateCw className="w-3.5 h-3.5 animate-spin text-sky-300 shrink-0" />
              <span>Синхронизация...</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/25 border border-amber-400/50 text-amber-100 text-xs font-semibold">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span>
                {!isAuthenticated
                  ? 'Требуется вход'
                  : `Нет синхронизации (${pendingSyncCount})`}
              </span>
              <button
                type="button"
                onClick={async () => {
                  const ok = await onTriggerSync();
                  if (!ok && isAuthenticated) {
                    onOpenServerDbModal();
                  }
                }}
                title="Обновить данные с сервера PostgreSQL"
                className="ml-1 p-0.5 rounded hover:bg-amber-400/20 text-amber-200 transition-colors cursor-pointer"
              >
                <RotateCw className="w-3 h-3 text-amber-300" />
              </button>
            </div>
          )}

          {isAuthenticated ? (
            <div className="hidden lg:inline-flex items-center gap-1 bg-white/10 border border-sky-300/30 rounded-lg px-2 py-1 text-xs">
              <button
                type="button"
                onClick={onOpenLoginModal}
                title={`Текущий пользователь: ${currentUser.fullName} (${currentUser.role})`}
                className="inline-flex items-center gap-1.5 text-white hover:text-sky-200 transition-colors cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                <span className="max-w-[130px] truncate font-medium">
                  {currentUser.login}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void onLogout()}
                title="Завершить текущую сессию (HttpOnly Cookie)"
                className="p-1 rounded hover:bg-white/20 text-sky-200 hover:text-white transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenLoginModal}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold transition-colors cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Войти</span>
            </button>
          )}

          <div
            className="flex items-center gap-1 bg-white/10 border border-sky-300/30 rounded-lg p-1"
            role="group"
            aria-label="Отмена и повтор действий (до 10 шагов)"
          >
            <button
              type="button"
              onClick={onUndo}
              disabled={undoCount === 0}
              aria-label="Отменить действие (Undo)"
              title={
                undoCount > 0
                  ? `Отменить: ${lastUndoLabel || ''} (Ctrl+Z)`
                  : 'Нет действий для отмены (Ctrl+Z)'
              }
              className="p-1.5 rounded text-white hover:bg-white/20 disabled:opacity-35 disabled:hover:bg-transparent transition-colors cursor-pointer"
            >
              <Undo2 className="w-4 h-4 text-sky-200" />
            </button>

            <button
              type="button"
              onClick={onRedo}
              disabled={redoCount === 0}
              aria-label="Повторить действие (Redo)"
              title={
                redoCount > 0
                  ? `Повторить: ${lastRedoLabel || ''} (Ctrl+Y)`
                  : 'Нет действий для повтора (Ctrl+Y)'
              }
              className="p-1.5 rounded text-white hover:bg-white/20 disabled:opacity-35 disabled:hover:bg-transparent transition-colors cursor-pointer"
            >
              <Redo2 className="w-4 h-4 text-sky-200" />
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenDrawer}
            aria-label="Открыть меню выбора объекта и раздела программы"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-sky-300/30 text-white text-xs font-semibold transition-colors shrink-0 cursor-pointer"
          >
            <Menu className="w-5 h-5 text-sky-300" />
            <span className="hidden sm:inline">Меню</span>
          </button>
        </div>
      </div>
    </header>
  );
};
