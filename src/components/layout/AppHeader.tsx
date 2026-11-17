import React from 'react';
import {
  AlertTriangle,
  BookOpen,
  Building2,
  ClipboardList,
  Database,
  Flame,
  FolderKanban,
  History,
  LogIn,
  LogOut,
  Menu,
  PieChart,
  Radiation,
  Redo2,
  RotateCw,
  Undo2,
  UserCheck,
} from 'lucide-react';
import { AppSection, ServerDbMetadata, UserAccount } from '../../types/welding';
import { ZaychickLogo } from '../ZaychickLogo';
import { useAuth, useAppContext } from '../../context';

export interface AppHeaderProps {
  activeSection?: AppSection;
  sectionIcons: Record<AppSection, React.ReactNode>;
  sectionLabels: Record<AppSection, string>;
  onLogoClick: () => void;
  isDbConnected?: boolean;
  isDbSyncing?: boolean;
  isAuthenticated?: boolean;
  pendingSyncCount?: number;
  lastSyncError?: string | null;
  serverDbMeta?: ServerDbMetadata | null;
  currentUser?: UserAccount;
  onOpenServerDbModal: () => void;
  onTriggerSync?: () => Promise<boolean>;
  onOpenLoginModal?: () => void;
  onLogout?: () => Promise<void>;
  undoCount?: number;
  redoCount?: number;
  lastUndoLabel?: string;
  lastRedoLabel?: string;
  onUndo?: () => void;
  onRedo?: () => void;
  onOpenDrawer?: () => void;
}

interface MainNavItem {
  id: AppSection;
  shortLabel: string;
  title: string;
  icon: React.ReactElement<{ className?: string }>;
}

const MAIN_NAV_ITEMS: MainNavItem[] = [
  {
    id: 'project_linelist',
    shortLabel: 'Лайнлист',
    title: 'Лайнлист технологических линий',
    icon: <FolderKanban className="w-3.5 h-3.5" />,
  },
  {
    id: 'registry',
    shortLabel: 'Реестр стыков',
    title: 'Реестр сварных стыков и ввод данных',
    icon: <ClipboardList className="w-3.5 h-3.5" />,
  },
  {
    id: 'journals',
    shortLabel: 'Журналы сварки',
    title: 'Журналы сварочных работ',
    icon: <BookOpen className="w-3.5 h-3.5" />,
  },
  {
    id: 'laboratory',
    shortLabel: 'Контроль НК',
    title: 'Лаборатория неразрушающего контроля',
    icon: <Radiation className="w-3.5 h-3.5" />,
  },
  {
    id: 'lrv_catalog',
    shortLabel: 'База материалов',
    title: 'База материалов и комплектующих',
    icon: <Database className="w-3.5 h-3.5" />,
  },
  {
    id: 'welding_tech',
    shortLabel: 'Технология',
    title: 'Технология сварочного производства',
    icon: <Flame className="w-3.5 h-3.5" />,
  },
  {
    id: 'readiness',
    shortLabel: 'Аналитика',
    title: 'Отчётность по готовности',
    icon: <PieChart className="w-3.5 h-3.5" />,
  },
  {
    id: 'audit_log',
    shortLabel: 'Аудит',
    title: 'Журнал аудита операций',
    icon: <History className="w-3.5 h-3.5" />,
  },
  {
    id: 'user_guide',
    shortLabel: 'Руководство',
    title: 'Руководство пользователя',
    icon: <BookOpen className="w-3.5 h-3.5" />,
  },
];

export const AppHeader: React.FC<AppHeaderProps> = (props) => {
  const auth = useAuth();
  const app = useAppContext();

  const activeSection = props.activeSection ?? app.activeSection;
  const sectionIcons = props.sectionIcons;
  const sectionLabels = props.sectionLabels;
  const onLogoClick = props.onLogoClick;
  const isDbConnected = props.isDbConnected ?? app.isDbConnected;
  const isDbSyncing = props.isDbSyncing ?? app.isDbSyncing;
  const isAuthenticated = props.isAuthenticated ?? (auth.currentUser.login !== '');
  const pendingSyncCount = props.pendingSyncCount ?? app.pendingSyncCount;
  const serverDbMeta = props.serverDbMeta ?? app.serverDbMeta;
  const currentUser = props.currentUser ?? auth.currentUser;
  const onOpenServerDbModal = props.onOpenServerDbModal;
  const onTriggerSync = props.onTriggerSync ?? app.onTriggerSync;
  const onOpenLoginModal =
    props.onOpenLoginModal ??
    (() => {
      auth.setLoginModalInitialMode('login');
      auth.setIsLoginModalOpen(true);
    });
  const onLogout = props.onLogout ?? auth.onLogout;
  const undoCount = props.undoCount ?? app.undoStack.length;
  const redoCount = props.redoCount ?? app.redoStack.length;
  const lastUndoLabel =
    props.lastUndoLabel ?? app.undoStack[app.undoStack.length - 1]?.actionLabel;
  const lastRedoLabel =
    props.lastRedoLabel ?? app.redoStack[app.redoStack.length - 1]?.actionLabel;
  const onUndo = props.onUndo ?? app.handleUndo;
  const onRedo = props.onRedo ?? app.handleRedo;
  const onOpenDrawer = props.onOpenDrawer ?? (() => app.setIsDrawerOpen(true));

  return (
    <header className="sticky top-0 z-30 bg-[#1e3799] text-white border-b border-sky-400/20 shadow-md no-print">
      <div className="max-w-[1920px] mx-auto px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div
            onClick={onLogoClick}
            className="flex items-center min-w-0 shrink-0 cursor-pointer select-none"
            title="zaychick"
          >
            <ZaychickLogo variant="header" size={38} />
          </div>

          <div
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/15 border border-sky-300/30 rounded-lg px-2 sm:px-2.5 py-1 text-xs text-white transition-colors"
            title="Объект строительства (быстрая фильтрация данных)"
          >
            <Building2 className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <select
              value={app.selectedObjectName || 'ALL'}
              onChange={(e) => {
                const val = e.target.value;
                app.setSelectedObjectName(val === 'ALL' ? '' : val);
                app.setSelectedRdCode('ALL');
              }}
              className="bg-transparent text-white font-medium text-xs focus:outline-none cursor-pointer pr-1 max-w-[120px] sm:max-w-[180px] md:max-w-[240px] truncate"
              aria-label="Выбор объекта строительства"
            >
              <option value="ALL" className="text-slate-900 bg-white">
                Все объекты
              </option>
              {app.derivedFacilities.map((f) => (
                <option key={f.id} value={f.name} className="text-slate-900 bg-white">
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="hidden lg:flex items-center justify-center flex-1 min-w-0 px-2 text-center">
          <div className="inline-flex items-center justify-center gap-2 max-w-full">
            {sectionIcons[activeSection]}
            <h1
              className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider truncate font-century-gothic"
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
              title="Серверная СУБД PostgreSQL 16 онлайн (REST API + SSE)"
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
            <div className="hidden sm:inline-flex items-center gap-1 bg-white/10 border border-sky-300/30 rounded-lg px-2 py-1 text-xs">
              <button
                type="button"
                onClick={onOpenLoginModal}
                title={`Пользователь: ${currentUser.fullName} (${currentUser.role})`}
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
                title="Завершить сессию"
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
            aria-label="Отмена и повтор действий"
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

      {/* Горизонтальный Top Sub-Nav Bar: быстрый переход в 1 клик */}
      <nav
        className="border-t border-sky-400/20 bg-[#162a75] px-2 sm:px-4 py-1 flex items-center gap-1 overflow-x-auto scroll-smooth"
        aria-label="Основная навигация по разделам программы"
      >
        <div className="max-w-[1920px] mx-auto w-full flex items-center gap-1">
          {MAIN_NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => app.setActiveSection(item.id)}
                className={`h-7 px-2.5 sm:px-3 rounded-md text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                  isActive
                    ? 'bg-white text-[#1e3799] font-bold shadow-xs'
                    : 'text-sky-100 hover:text-white hover:bg-white/10 font-medium'
                }`}
                title={item.title}
              >
                {React.cloneElement(item.icon, {
                  className: `w-3.5 h-3.5 shrink-0 ${
                    isActive ? 'text-[#1e3799]' : 'text-sky-300'
                  }`,
                })}
                <span>{item.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </header>
  );
};
