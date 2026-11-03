import React, { useState } from 'react';
import {
  BookOpen,
  Building2,
  ClipboardList,
  Database,
  Download,
  FileSpreadsheet,
  HardDriveDownload,
  History,
  PieChart,
  Trash2,
  X,
  CheckCircle2,
  FolderKanban,
  UserCheck,
  KeyRound,
  Flame,
  MapPin,
  ChevronDown,
  Plus,
  Lock,
} from 'lucide-react';
import { AppSection, FacilityObject, UserAccount } from '../types/welding';
import { getUserRolePermissions } from '../utils/rbac';
import { ZaychickLogo } from './ZaychickLogo';

interface HamburgerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeSection: AppSection;
  onSelectSection: (section: AppSection) => void;
  facilities: FacilityObject[];
  selectedObjectName: string; // 'ALL' or facility.name
  onSelectObjectName: (name: string) => void;
  selectedRdCode: string; // 'ALL' or rdCode
  onSelectRdCode: (rd: string) => void;
  totalJointsCount: number;
  projectLineListCount: number;
  auditLogsCount: number;
  lrvCatalogCount: number;
  weldingTechCount?: string;
  currentUser: UserAccount;
  onOpenLoginModal: () => void;
  onOpenAdminPasswordModal?: () => void;
  onExportAllJoints: (format: 'xlsx' | 'csv') => void;
  onOpenFacilityLocation: (objectName: string) => void;
  onOpenBackupModal: () => void;
  onOpenAuthorResetModal: () => void;
  onDeleteObject: (objectName: string) => void;
  onCreateObject?: (objectName: string) => void;
  onDeleteRdCode?: (rdCode: string) => void;
  dbRevision?: number;
  isDbConnected?: boolean;
  onOpenServerDbModal?: () => void;
}

export const HamburgerDrawer: React.FC<HamburgerDrawerProps> = ({
  isOpen,
  onClose,
  activeSection,
  onSelectSection,
  facilities,
  selectedObjectName,
  onSelectObjectName,
  selectedRdCode,
  onSelectRdCode,
  totalJointsCount,
  projectLineListCount,
  auditLogsCount,
  lrvCatalogCount,
  weldingTechCount,
  currentUser,
  onOpenLoginModal,
  onOpenAdminPasswordModal,
  onExportAllJoints,
  onOpenFacilityLocation,
  onOpenBackupModal,
  onOpenAuthorResetModal,
  onDeleteObject,
  onCreateObject,
  dbRevision = 1,
  isDbConnected = true,
  onOpenServerDbModal,
}) => {
  const [confirmDeleteObj, setConfirmDeleteObj] = useState<string | null>(null);
  const [isCreatingObj, setIsCreatingObj] = useState(false);
  const [newObjName, setNewObjName] = useState('');

  if (!isOpen) return null;

  const navItems: {
    id: AppSection;
    title: string;
    badge?: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'registry',
      title: 'Реестр стыков и ввод данных',
      badge: `${totalJointsCount}`,
      icon: <ClipboardList className="w-4 h-4" />,
    },
    {
      id: 'project_linelist',
      title: 'Проект (лайнлист)',
      badge: `${projectLineListCount}`,
      icon: <FolderKanban className="w-4 h-4" />,
    },
    {
      id: 'welding_tech',
      title: 'Технология сварочного производства',
      badge: weldingTechCount || 'ТК / НАКС',
      icon: <Flame className="w-4 h-4" />,
    },
    {
      id: 'journals',
      title: 'Журналы сварочных работ',
      badge: '2 формы',
      icon: <BookOpen className="w-4 h-4" />,
    },
    {
      id: 'readiness',
      title: 'Отчётность по готовности',
      icon: <PieChart className="w-4 h-4" />,
    },
    {
      id: 'lrv_catalog',
      title: 'Каталог ЛРВ и спецификации',
      badge: `${lrvCatalogCount}`,
      icon: <Database className="w-4 h-4" />,
    },
    {
      id: 'audit_log',
      title: 'Журнал изменений (Аудит)',
      badge: `${auditLogsCount}`,
      icon: <History className="w-4 h-4" />,
    },
    {
      id: 'user_guide',
      title: 'Руководство пользователя (Буклет PDF)',
      badge: '6 стр. А4',
      icon: <BookOpen className="w-4 h-4" />,
    },
  ];

  const currentFacility = facilities.find((f) => f.name === selectedObjectName);

  const handleFacilityChange = (newName: string) => {
    onSelectObjectName(newName);
    onSelectRdCode('ALL');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Навигация, профиль пользователя и выбор объекта"
    >
      {/* Затемнение фона */}
      <div
        className="fixed inset-0 bg-slate-900/45 backdrop-blur-[1px] transition-opacity"
        onClick={onClose}
      />

      {/* Боковая панель справа */}
      <div className="relative z-10 flex flex-col w-full max-w-md bg-white text-slate-900 shadow-2xl border-l border-slate-200 h-full overflow-hidden">
        {/* Шапка панели цвета #1e3799 */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#1e3799] text-white shrink-0 shadow-xs">
          <ZaychickLogo variant="header" size={32} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть меню навигации"
            className="p-1.5 rounded-lg text-sky-100 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Блок 1: Профиль пользователя */}
          <div className="p-3 rounded-xl bg-[#f4f8fe] border border-sky-200/80 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#1e3799] text-white flex items-center justify-center shrink-0">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">
                    {currentUser.fullName}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    <span className="font-mono text-[#1e3799]">{currentUser.login}</span> ·{' '}
                    {currentUser.role}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenLoginModal();
                }}
                aria-label="Сменить пользователя или войти по логину и паролю"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 hover:border-[#1e3799] text-xs font-semibold text-[#1e3799] transition-colors shrink-0 cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Сменить</span>
              </button>
            </div>

            {getUserRolePermissions(currentUser).category === 'admin' &&
              onOpenAdminPasswordModal && (
                <div className="pt-2 border-t border-sky-200/70 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-slate-600">
                    Защита учётной записи администратора:
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAdminPasswordModal();
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-indigo-200 hover:bg-indigo-50 text-[11px] font-semibold text-[#1e3799] transition-colors shrink-0 cursor-pointer"
                  >
                    <Lock className="w-3 h-3" />
                    <span>Сменить пароль админа</span>
                  </button>
                </div>
              )}
          </div>

          {/* Блок 2: Навигация по разделам программы */}
          <div>
            <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-200">
              <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                Разделы системы
              </span>
              <span className="text-[10px] font-mono text-slate-400">8 модулей</span>
            </div>

            <nav className="space-y-1" aria-label="Разделы системы">
              {navItems.map((item) => {
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectSection(item.id);
                      onClose();
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors border ${
                      isActive
                        ? 'bg-[#e8f1fc] border-[#1e3799]/30 text-[#1e3799] font-bold'
                        : 'bg-white border-transparent text-slate-700 hover:bg-slate-50 hover:border-slate-200 font-medium'
                    }`}
                  >
                    <div
                      className={`p-1.5 rounded-md shrink-0 ${
                        isActive ? 'bg-[#1e3799] text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {item.icon}
                    </div>
                    <span className="text-xs sm:text-sm truncate flex-1 min-w-0">
                      {item.title}
                    </span>
                    {item.badge && (
                      <span className="text-[11px] font-mono text-slate-500 shrink-0 px-1.5 py-0.5 rounded bg-slate-100">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Блок 3: Выбор объекта строительства через выпадающий список */}
          <div>
            <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-200">
              <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                Объект строительства
              </span>
              <div className="flex items-center gap-2">
                {onCreateObject && (
                  <button
                    type="button"
                    onClick={() => setIsCreatingObj((prev) => !prev)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1e3799] hover:underline cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Новый объект</span>
                  </button>
                )}
                {selectedObjectName !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => handleFacilityChange('ALL')}
                    className="text-[11px] font-semibold text-slate-500 hover:text-[#1e3799] hover:underline"
                  >
                    Все объекты
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {isCreatingObj && onCreateObject && (
                <div className="p-2.5 rounded-lg bg-[#f4f8fe] border border-sky-200 flex items-center gap-1.5">
                  <input
                    type="text"
                    value={newObjName}
                    onChange={(e) => setNewObjName(e.target.value)}
                    placeholder="Название объекта (напр., КС Волховская)"
                    className="flex-1 min-w-0 px-2.5 py-1.5 bg-white border border-sky-300 rounded text-xs font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const clean = newObjName.trim();
                      if (!clean) return;
                      onCreateObject(clean);
                      setNewObjName('');
                      setIsCreatingObj(false);
                    }}
                    className="px-2.5 py-1.5 rounded bg-[#1e3799] text-white text-xs font-semibold hover:bg-[#15276e] shrink-0 cursor-pointer"
                  >
                    Создать
                  </button>
                </div>
              )}

              <div className="relative">
                <select
                  value={selectedObjectName}
                  onChange={(e) => handleFacilityChange(e.target.value)}
                  aria-label="Выбор объекта строительства"
                  className="w-full pl-3 pr-8 py-2.5 bg-white border border-[#1e3799] rounded-lg text-xs font-semibold text-slate-900 appearance-none focus:outline-none focus:ring-2 focus:ring-[#1e3799]/20 shadow-2xs cursor-pointer"
                >
                  <option value="ALL">Все объекты (сводный режим)</option>
                  {facilities.map((fac) => (
                    <option key={fac.id} value={fac.name}>
                      {fac.name} ({fac.region})
                    </option>
                  ))}
                </select>
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>

              {/* Карточка статуса активного объекта с фиксацией и гео-настройкой */}
              {selectedObjectName !== 'ALL' && currentFacility ? (
                <div className="p-3 rounded-lg bg-[#f4f8fe] border border-sky-200 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        {currentFacility.name}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {currentFacility.region} · {currentFacility.weatherStation || 'Метеопункт площадки'}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {confirmDeleteObj !== currentFacility.name ? (
                        <>
                          <button
                            type="button"
                            onClick={() => onOpenFacilityLocation(currentFacility.name)}
                            title="Выбрать метеопункт и координаты объекта для авто-температуры"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white border border-sky-300 text-[#1e3799] text-[11px] font-semibold hover:bg-sky-50 transition-colors shadow-2xs"
                          >
                            <MapPin className="w-3 h-3" />
                            <span>Гео / Метео</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteObj(currentFacility.name)}
                            title="Удалить объект"
                            className="p-1 rounded bg-white border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-300 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteObject(currentFacility.name);
                              setConfirmDeleteObj(null);
                            }}
                            className="px-2 py-1 rounded bg-red-600 text-white text-[10px] font-bold hover:bg-red-700"
                          >
                            Удалить
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteObj(null)}
                            className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-700 text-[10px] font-semibold"
                          >
                            Отмена
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-800 bg-emerald-50 px-2 py-1 rounded border border-emerald-200 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Работа ограничена данным объектом во всех разделах программы</span>
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded border border-slate-200 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Сводный режим: отображаются данные по всем объектам строительства</span>
                </div>
              )}
            </div>
          </div>

          {/* Блок 4 и 5: Скачивание данных, бэкап и управление СУБД (доступны исключительно администраторам) */}
          {getUserRolePermissions(currentUser).category === 'admin' && (
            <div className="pt-2">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <Download className="w-3.5 h-3.5 text-[#1e3799]" />
                    <span>Скачать все данные таблицы ({totalJointsCount} ст.)</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">37 полей</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onExportAllJoints('xlsx')}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#1e3799] text-white hover:bg-[#15276e] text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Скачать .XLSX</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onExportAllJoints('csv')}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 hover:border-[#1e3799] hover:text-[#1e3799] text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Скачать .CSV</span>
                  </button>
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenBackupModal();
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#e8f1fc] border border-[#1e3799]/40 text-[#1e3799] hover:bg-sky-100 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <HardDriveDownload className="w-3.5 h-3.5" />
                    <span>Бэкап и восстановление базы (.JSON)</span>
                  </button>
                </div>
              </div>

              {/* Управление единой серверной СУБД и оптимистической блокировкой (OCC) */}
              {onOpenServerDbModal && (
                <div className="mt-2.5 p-3.5 rounded-xl bg-[#f4f8fe] border border-sky-200 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                      <Database className="w-4 h-4 text-[#1e3799] shrink-0" />
                      <span>Единая серверная СУБД</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                          isDbConnected
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                        }`}
                      >
                        {isDbConnected ? 'SQLite WAL' : 'КЭШ'}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-[#1e3799] text-white font-mono text-[10px] font-bold">
                        rev #{dbRevision}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenServerDbModal();
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white border border-sky-300 text-[#1e3799] hover:bg-sky-50 text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
                  >
                    <Database className="w-3.5 h-3.5 text-[#1e3799]" />
                    <span>Управление СУБД и блокировками (OCC)</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Подвал бокового меню */}
        <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between shrink-0 select-none">
          <span>Локальный сервер · Open-Source стек</span>
          <span className="font-mono">До 100 000 строк · 30+ сессий</span>
        </div>
      </div>
    </div>
  );
};
