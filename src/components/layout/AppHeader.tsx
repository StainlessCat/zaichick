import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronDown,
  Database,
  Download,
  FileSpreadsheet,
  HardDriveDownload,
  KeyRound,
  Lock,
  LogIn,
  LogOut,
  MapPin,
  Plus,
  Redo2,
  RotateCw,
  Trash2,
  Undo2,
  UserCheck,
} from 'lucide-react';
import { AppSection, ServerDbMetadata, UserAccount } from '../../types/welding';
import {
  DEPARTMENT_LABELS_RU,
  getUserRolePermissions,
  resolveUserDepartment,
  resolveUserSystemRole,
  SYSTEM_ROLE_LABELS_RU,
} from '../../utils/rbac';
import { ZaychickLogo } from '../ZaychickLogo';
import { useAuth, useAppContext } from '../../context';

export interface AppHeaderProps {
  activeSection?: AppSection;
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
  onOpenAdminPasswordModal?: () => void;
  onLogout?: () => Promise<void>;
  onExportAllJoints?: (format: 'xlsx' | 'csv') => void;
  onOpenFacilityLocation?: (objectName: string) => void;
  onOpenBackupModal?: () => void;
  onDeleteObject?: (objectName: string) => void;
  onCreateObject?: (objectName: string) => void;
  undoCount?: number;
  redoCount?: number;
  lastUndoLabel?: string;
  lastRedoLabel?: string;
  onUndo?: () => void;
  onRedo?: () => void;
}

interface MainNavItem {
  id: AppSection;
  shortLabel: string;
  title: string;
}

const MAIN_NAV_ITEMS: MainNavItem[] = [
  {
    id: 'readiness',
    shortLabel: 'Аналитика',
    title: 'Отчётность по готовности',
  },
  {
    id: 'project_linelist',
    shortLabel: 'Лайнлист',
    title: 'Лайнлист технологических линий',
  },
  {
    id: 'registry',
    shortLabel: 'Реестр стыков',
    title: 'Реестр сварных стыков и ввод данных',
  },
  {
    id: 'laboratory',
    shortLabel: 'Контроль НК',
    title: 'Лаборатория неразрушающего контроля',
  },
  {
    id: 'testing_circuits',
    shortLabel: 'Испытания',
    title: 'Испытательные контуры и готовность к испытаниям',
  },
  {
    id: 'executive_docs',
    shortLabel: 'Исп. документация',
    title: 'Исполнительная документация',
  },
  {
    id: 'lrv_catalog',
    shortLabel: 'База материалов',
    title: 'База материалов и комплектующих',
  },
  {
    id: 'welding_tech',
    shortLabel: 'Технология',
    title: 'Технология сварочного производства',
  },
  {
    id: 'journals',
    shortLabel: 'Журналы сварки',
    title: 'Журналы сварочных работ',
  },
  {
    id: 'audit_log',
    shortLabel: 'Аудит',
    title: 'Журнал аудита операций',
  },
  {
    id: 'user_guide',
    shortLabel: 'Справка',
    title: 'Справка',
  },
];

export const AppHeader: React.FC<AppHeaderProps> = (props) => {
  const auth = useAuth();
  const app = useAppContext();

  const activeSection = props.activeSection ?? app.activeSection;
  const onLogoClick = props.onLogoClick;
  const isDbConnected = props.isDbConnected ?? app.isDbConnected;
  const isDbSyncing = props.isDbSyncing ?? app.isDbSyncing;
  const isAuthenticated = props.isAuthenticated ?? auth.currentUser.login !== '';
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
  const onOpenAdminPasswordModal =
    props.onOpenAdminPasswordModal ??
    (() => {
      auth.setLoginModalInitialMode('admin_password');
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

  const [isFacilityMenuOpen, setIsFacilityMenuOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isCreatingObj, setIsCreatingObj] = useState(false);
  const [newObjName, setNewObjName] = useState('');
  const [confirmDeleteObj, setConfirmDeleteObj] = useState<string | null>(null);

  const facilityMenuRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const facilities = app.derivedFacilities;
  const selectedObjectName = app.selectedObjectName || 'ALL';
  const currentFacility = facilities.find((f) => f.name === selectedObjectName);
  const perms = getUserRolePermissions(currentUser);
  const userSystemRole = resolveUserSystemRole(currentUser);
  const userDepartment = resolveUserDepartment(currentUser);

  const canManageObjects = isAuthenticated && (perms.isSuperAdmin || perms.canEditLineList);
  const canViewAudit = isAuthenticated && perms.canViewAuditLogs;
  const visibleNavItems = MAIN_NAV_ITEMS.filter(
    (item) => item.id !== 'audit_log' || canViewAudit
  );

  useEffect(() => {
    if (!isFacilityMenuOpen && !isAccountMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        isFacilityMenuOpen &&
        facilityMenuRef.current &&
        !facilityMenuRef.current.contains(target)
      ) {
        setIsFacilityMenuOpen(false);
        setConfirmDeleteObj(null);
      }
      if (
        isAccountMenuOpen &&
        accountMenuRef.current &&
        !accountMenuRef.current.contains(target)
      ) {
        setIsAccountMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsFacilityMenuOpen(false);
        setIsAccountMenuOpen(false);
        setConfirmDeleteObj(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFacilityMenuOpen, isAccountMenuOpen]);

  const handleSelectFacility = (name: string) => {
    app.setSelectedObjectName(name === 'ALL' ? '' : name);
    app.setSelectedRdCode('ALL');
    setConfirmDeleteObj(null);
    setIsFacilityMenuOpen(false);
  };

  const handleCreateObjectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newObjName.trim();
    if (!clean || !props.onCreateObject) return;
    props.onCreateObject(clean);
    setNewObjName('');
    setIsCreatingObj(false);
    setIsFacilityMenuOpen(false);
  };

  const dbRevision = serverDbMeta?.globalRevision ?? 1;

  return (
    <header className="sticky top-0 z-30 bg-[#1e3799] text-white border-b border-white/15 shadow-md no-print">
      {/* Верхняя строка: бренд, объект строительства, статус СУБД и аккаунт */}
      <div className="max-w-[1920px] mx-auto px-4 h-12 flex items-center justify-between gap-3">
        {/* Левая зона: логотип + контекстное меню объекта */}
        <div className="flex items-center gap-3 min-w-0">
          <div
            onClick={onLogoClick}
            className="flex items-center shrink-0 cursor-pointer select-none"
            title="zaychick"
          >
            <ZaychickLogo variant="header" size={34} />
          </div>

          <span className="hidden sm:block h-5 w-px bg-white/15 shrink-0" aria-hidden="true" />

          {/* Выпадающее меню объекта строительства */}
          <div className="relative min-w-0" ref={facilityMenuRef}>
            <button
              type="button"
              onClick={() => {
                setIsAccountMenuOpen(false);
                setIsFacilityMenuOpen((prev) => !prev);
                setConfirmDeleteObj(null);
              }}
              aria-expanded={isFacilityMenuOpen}
              aria-haspopup="menu"
              aria-label="Выбор и настройка объекта строительства"
              title="Выбор объекта строительства и настройка метеопункта"
              className={`h-8 inline-flex items-center gap-2 px-2.5 rounded-md border text-xs font-medium transition-colors cursor-pointer max-w-[200px] sm:max-w-[260px] md:max-w-[320px] ${
                isFacilityMenuOpen
                  ? 'bg-white/20 border-white/40 text-white'
                  : 'bg-white/10 hover:bg-white/15 border-white/20 text-white'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 text-sky-200 shrink-0" />
              <span className="truncate">
                {selectedObjectName === 'ALL' ? 'Все объекты' : selectedObjectName}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-white/70 shrink-0 transition-transform ${
                  isFacilityMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isFacilityMenuOpen && (
              <div
                role="menu"
                className="absolute left-0 top-full mt-1.5 w-80 sm:w-96 bg-white text-slate-900 rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50"
              >
                <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    Объект строительства
                  </span>
                  {canManageObjects && props.onCreateObject && (
                    <button
                      type="button"
                      onClick={() => setIsCreatingObj((prev) => !prev)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1e3799] hover:text-[#15276e] cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Новый объект</span>
                    </button>
                  )}
                </div>

                {isCreatingObj && canManageObjects && props.onCreateObject && (
                  <form
                    onSubmit={handleCreateObjectSubmit}
                    className="p-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-1.5"
                  >
                    <input
                      type="text"
                      value={newObjName}
                      onChange={(e) => setNewObjName(e.target.value)}
                      placeholder="Название объекта, например КС Волховская"
                      autoFocus
                      className="flex-1 min-w-0 h-8 px-2.5 bg-white border border-slate-300 focus:border-[#1e3799] focus:outline-none rounded-md text-xs font-medium"
                    />
                    <button
                      type="submit"
                      disabled={!newObjName.trim()}
                      className="h-8 px-3 rounded-md bg-[#1e3799] text-white text-xs font-semibold hover:bg-[#15276e] disabled:opacity-45 shrink-0 cursor-pointer"
                    >
                      Создать
                    </button>
                  </form>
                )}

                <div className="max-h-64 overflow-y-auto py-1 divide-y divide-slate-100">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleSelectFacility('ALL')}
                    className={`w-full px-3.5 py-2 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      selectedObjectName === 'ALL'
                        ? 'bg-[#f0f5fc] text-[#1e3799]'
                        : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">Все объекты</div>
                      <div className="text-[11px] text-slate-500">
                        Сводное отображение всех площадок
                      </div>
                    </div>
                    {selectedObjectName === 'ALL' && (
                      <Check className="w-4 h-4 text-[#1e3799] shrink-0" />
                    )}
                  </button>

                  {facilities.map((fac) => {
                    const isSelected = selectedObjectName === fac.name;
                    return (
                      <button
                        key={fac.id}
                        type="button"
                        role="menuitem"
                        onClick={() => handleSelectFacility(fac.name)}
                        className={`w-full px-3.5 py-2 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#f0f5fc] text-[#1e3799]'
                            : 'hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate">{fac.name}</div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {fac.region} · {fac.weatherStation || 'Метеопункт площадки'}
                          </div>
                        </div>
                        {isSelected && (
                          <Check className="w-4 h-4 text-[#1e3799] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {selectedObjectName !== 'ALL' && currentFacility && (
                  <div className="p-3 bg-slate-50 border-t border-slate-200 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-slate-700 truncate">
                          Метеостанция: {currentFacility.weatherStation || 'Не назначена'}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {currentFacility.region}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {confirmDeleteObj !== currentFacility.name ? (
                          <>
                            {props.onOpenFacilityLocation && (
                              <button
                                type="button"
                                onClick={() => {
                                  setIsFacilityMenuOpen(false);
                                  props.onOpenFacilityLocation?.(currentFacility.name);
                                }}
                                className="h-7 inline-flex items-center gap-1.5 px-2.5 rounded-md bg-white border border-slate-300 hover:border-[#1e3799] text-[#1e3799] text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap"
                              >
                                <MapPin className="w-3.5 h-3.5 shrink-0" />
                                <span>Гео и метео</span>
                              </button>
                            )}
                            {canManageObjects && props.onDeleteObject && (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteObj(currentFacility.name)}
                                title="Удалить объект"
                                aria-label="Удалить объект"
                                className="h-7 w-7 inline-flex items-center justify-center rounded-md bg-white border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-300 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                props.onDeleteObject?.(currentFacility.name);
                                setConfirmDeleteObj(null);
                                setIsFacilityMenuOpen(false);
                              }}
                              className="h-7 px-2.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold cursor-pointer"
                            >
                              Удалить
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteObj(null)}
                              className="h-7 px-2 rounded-md bg-white border border-slate-300 text-slate-700 text-[11px] font-medium cursor-pointer"
                            >
                              Отмена
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Правая зона: статус СУБД, история Undo/Redo, профиль и инструменты */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Статус СУБД и синхронизации */}
          {isDbConnected && pendingSyncCount === 0 ? (
            <button
              type="button"
              onClick={onOpenServerDbModal}
              title="Серверная СУБД PostgreSQL 16 онлайн"
              className="hidden md:inline-flex h-8 items-center gap-2 px-2.5 rounded-md bg-white/10 hover:bg-white/15 border border-white/20 text-white text-xs font-mono tabular-nums transition-colors cursor-pointer whitespace-nowrap"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <span>PostgreSQL · rev #{dbRevision}</span>
            </button>
          ) : isDbSyncing ? (
            <div className="h-8 inline-flex items-center gap-1.5 px-2.5 rounded-md bg-white/10 border border-white/20 text-sky-100 text-xs font-mono whitespace-nowrap">
              <RotateCw className="w-3.5 h-3.5 animate-spin text-sky-200 shrink-0" />
              <span className="hidden sm:inline">Синхронизация</span>
            </div>
          ) : (
            <div className="h-8 inline-flex items-center gap-1.5 px-2.5 rounded-md bg-white/10 border border-white/25 text-white text-xs font-medium whitespace-nowrap">
              {!isAuthenticated ? (
                <Lock className="w-3.5 h-3.5 text-sky-200 shrink-0" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-sky-200 shrink-0" />
              )}
              <button
                type="button"
                onClick={() => {
                  if (isAuthenticated) {
                    onOpenServerDbModal();
                  } else {
                    onOpenLoginModal();
                  }
                }}
                className="hover:underline cursor-pointer"
              >
                {!isAuthenticated
                  ? 'Только просмотр'
                  : `Не синхронизировано: ${pendingSyncCount}`}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok = await onTriggerSync();
                  if (!ok && isAuthenticated) {
                    onOpenServerDbModal();
                  }
                }}
                title="Обновить данные с сервера PostgreSQL"
                aria-label="Синхронизировать с сервером"
                className="ml-0.5 p-1 rounded hover:bg-white/15 text-sky-200 hover:text-white transition-colors cursor-pointer"
              >
                <RotateCw className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Отмена / Повтор */}
          <div
            className="h-8 inline-flex items-center gap-0.5 bg-white/10 border border-white/20 rounded-md px-0.5"
            role="group"
            aria-label="Отмена и повтор действий"
          >
            <button
              type="button"
              onClick={onUndo}
              disabled={undoCount === 0}
              aria-label="Отменить действие"
              title={
                undoCount > 0
                  ? `Отменить: ${lastUndoLabel || ''}`
                  : 'Нет действий для отмены'
              }
              className="h-7 w-7 inline-flex items-center justify-center rounded text-white/90 hover:text-white hover:bg-white/15 disabled:opacity-35 disabled:hover:bg-transparent transition-colors cursor-pointer"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={onRedo}
              disabled={redoCount === 0}
              aria-label="Повторить действие"
              title={
                redoCount > 0
                  ? `Повторить: ${lastRedoLabel || ''}`
                  : 'Нет действий для повтора'
              }
              className="h-7 w-7 inline-flex items-center justify-center rounded text-white/90 hover:text-white hover:bg-white/15 disabled:opacity-35 disabled:hover:bg-transparent transition-colors cursor-pointer"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Профиль и меню управления / Кнопка входа */}
          {isAuthenticated ? (
            <div className="relative" ref={accountMenuRef}>
              <button
                type="button"
                onClick={() => {
                  setIsFacilityMenuOpen(false);
                  setIsAccountMenuOpen((prev) => !prev);
                }}
                aria-expanded={isAccountMenuOpen}
                aria-haspopup="menu"
                title={`${currentUser.fullName} · ${currentUser.role}`}
                className={`h-8 inline-flex items-center gap-2 px-2.5 rounded-md border text-xs transition-colors cursor-pointer ${
                  isAccountMenuOpen
                    ? 'bg-white/20 border-white/40 text-white'
                    : 'bg-white/10 hover:bg-white/15 border-white/20 text-white'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5 text-sky-200 shrink-0" />
                <span className="hidden sm:inline max-w-[130px] truncate font-medium">
                  {currentUser.login}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-white/70 shrink-0 transition-transform ${
                    isAccountMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isAccountMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-1.5 w-72 bg-white text-slate-900 rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50"
                >
                  {/* Карточка пользователя */}
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 space-y-1">
                    <div className="text-xs font-bold text-slate-900 truncate">
                      {currentUser.fullName}
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono font-semibold text-[#1e3799]">
                        {currentUser.login}
                      </span>
                      <span>·</span>
                      <span>{SYSTEM_ROLE_LABELS_RU[userSystemRole]}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {DEPARTMENT_LABELS_RU[userDepartment]}
                    </div>
                  </div>

                  {/* Инструменты администрирования и выгрузки */}
                  {perms.canManageUsers && (
                    <div className="py-1.5 border-b border-slate-200">
                      <div className="px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Администрирование
                      </div>

                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setIsAccountMenuOpen(false);
                          onOpenServerDbModal();
                        }}
                        className="w-full px-4 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-[#1e3799] flex items-center justify-between gap-2 transition-colors cursor-pointer"
                      >
                        <span className="inline-flex items-center gap-2.5">
                          <Database className="w-3.5 h-3.5 text-[#1e3799]" />
                          <span>Администрирование и СУБД</span>
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 tabular-nums">
                          rev #{dbRevision}
                        </span>
                      </button>

                      {perms.isSuperAdmin && props.onExportAllJoints && (
                        <>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setIsAccountMenuOpen(false);
                              props.onExportAllJoints?.('xlsx');
                            }}
                            className="w-full px-4 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-[#1e3799] flex items-center gap-2.5 transition-colors cursor-pointer"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5 text-[#1e3799]" />
                            <span>Выгрузить в Excel</span>
                          </button>

                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setIsAccountMenuOpen(false);
                              props.onExportAllJoints?.('csv');
                            }}
                            className="w-full px-4 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-[#1e3799] flex items-center gap-2.5 transition-colors cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5 text-slate-500" />
                            <span>Выгрузить в CSV</span>
                          </button>
                        </>
                      )}

                      {perms.isSuperAdmin && props.onOpenBackupModal && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setIsAccountMenuOpen(false);
                            props.onOpenBackupModal?.();
                          }}
                          className="w-full px-4 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-[#1e3799] flex items-center gap-2.5 transition-colors cursor-pointer"
                        >
                          <HardDriveDownload className="w-3.5 h-3.5 text-[#1e3799]" />
                          <span>Бэкап и восстановление базы</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Действия учётной записи */}
                  <div className="py-1.5">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsAccountMenuOpen(false);
                        onOpenLoginModal();
                      }}
                      className="w-full px-4 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-[#1e3799] flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                      <span>Сменить пользователя</span>
                    </button>

                    {perms.category === 'admin' && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setIsAccountMenuOpen(false);
                          onOpenAdminPasswordModal();
                        }}
                        className="w-full px-4 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-[#1e3799] flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <Lock className="w-3.5 h-3.5 text-slate-500" />
                        <span>Сменить пароль администратора</span>
                      </button>
                    )}

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsAccountMenuOpen(false);
                        void onLogout();
                      }}
                      className="w-full px-4 py-2 text-left text-xs font-medium text-red-700 hover:bg-red-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5 text-red-600" />
                      <span>Выйти из системы</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenLoginModal}
              className="h-8 inline-flex items-center gap-1.5 px-3 rounded-md bg-white hover:bg-slate-100 text-[#1e3799] text-xs font-bold transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Войти</span>
            </button>
          )}
        </div>
      </div>

      {/* Нижняя строка: центрированная десктопная навигация прописными без иконок с белой линией снизу */}
      <nav
        className="border-t border-white/10 bg-[#162a75] overflow-x-auto scroll-smooth"
        aria-label="Основная навигация по разделам программы"
      >
        <div className="max-w-[1920px] mx-auto px-3 sm:px-4 flex items-center justify-start lg:justify-center gap-1 sm:gap-2">
          {visibleNavItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => app.setActiveSection(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative h-10 px-2.5 xl:px-3.5 inline-flex items-center whitespace-nowrap shrink-0 uppercase text-[11px] tracking-[0.08em] transition-colors cursor-pointer ${
                  isActive
                    ? 'text-white font-bold after:content-[""] after:absolute after:inset-x-0 after:bottom-0 after:h-[2.5px] after:bg-white'
                    : 'text-sky-100/75 hover:text-white font-semibold after:content-[""] after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-transparent hover:after:bg-white/30 after:transition-colors'
                }`}
                title={item.title}
              >
                {item.shortLabel}
              </button>
            );
          })}
        </div>
      </nav>
    </header>
  );
};
