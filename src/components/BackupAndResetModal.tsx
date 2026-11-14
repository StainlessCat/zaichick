import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  ArchiveRestore,
  Check,
  CheckCircle2,
  Clock,
  Database,
  Download,
  FileJson,
  HardDriveDownload,
  KeyRound,
  Lock,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  AuditLogEntry,
  ColumnTemplate,
  LRVItem,
  ProjectLineItem,
  TechCardItem,
  UserAccount,
  WelderProfile,
  WeldingMaterialCertificate,
  WeldJoint,
} from '../types/welding';
import { zaychickApi } from '../api';
import { getUserRolePermissions } from '../utils/rbac';
import { formatTimestampDDMMYY } from '../utils/weldingLogic';

export interface FullSystemBackupPayload {
  backupFormat: 'ZAYCHICK_FULL_BACKUP_V1';
  appVersion: string;
  createdAt: string;
  createdByLogin: string;
  createdByFullName: string;
  comment: string;
  data: {
    joints: WeldJoint[];
    projectLineList: ProjectLineItem[];
    lrvCatalog: LRVItem[];
    welders: WelderProfile[];
    techCards: TechCardItem[];
    weldingMaterials: WeldingMaterialCertificate[];
    userAccounts: UserAccount[];
    auditLogs: AuditLogEntry[];
    facilityGeoOverrides: Record<
      string,
      {
        region: string;
        weatherStation: string;
        latitude: number;
        longitude: number;
        weatherArchive?: Record<string, string>;
      }
    >;
    templates: ColumnTemplate[];
    activeTemplateId: string;
  };
}

interface LocalSnapshotItem {
  id: string;
  title: string;
  createdAt: string;
  payload: FullSystemBackupPayload;
}

interface BackupAndResetModalProps {
  isOpen: boolean;
  initialMode: 'backup' | 'author_reset';
  onClose: () => void;
  currentUser: UserAccount;
  currentPayload: FullSystemBackupPayload['data'];
  onRestoreBackup: (payload: FullSystemBackupPayload) => void;
  onAuthorZeroReset: (keepOnlyAdminAccount: boolean) => void;
  onAuthorRestoreDemoSeed: () => void;
  onLoadKharasaveyDemo?: () => void;
}

const LOCAL_SNAPSHOTS_KEY = 'zaychick_local_snapshots_v1';

export const BackupAndResetModal: React.FC<BackupAndResetModalProps> = ({
  isOpen,
  initialMode,
  onClose,
  currentUser,
  currentPayload,
  onRestoreBackup,
  onAuthorZeroReset,
  onAuthorRestoreDemoSeed,
  onLoadKharasaveyDemo,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [backupComment, setBackupComment] = useState(
    'Плановая резервная копия всех разделов системы'
  );
  const [parsedBackup, setParsedBackup] = useState<FullSystemBackupPayload | null>(
    null
  );
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [restoreError, setRestoreError] = useState('');
  const [statusBanner, setStatusBanner] = useState('');

  // Локальные быстрые снимки в браузере
  const [snapshots, setSnapshots] = useState<LocalSnapshotItem[]>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_SNAPSHOTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [snapshotTitle, setSnapshotTitle] = useState('');

  // Скрытый режим Автора («Чистый лист»)
  const [showAuthorPanel, setShowAuthorPanel] = useState(
    initialMode === 'author_reset'
  );
  const [authorKeyInput, setAuthorKeyInput] = useState('');
  const [isAuthorUnlocked, setIsAuthorUnlocked] = useState(false);
  const [authorError, setAuthorError] = useState('');
  const [keepOnlyAdmin, setKeepOnlyAdmin] = useState(true);
  const [confirmZeroStep, setConfirmZeroStep] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setShowAuthorPanel(initialMode === 'author_reset');
      setRestoreError('');
      setStatusBanner('');
      setConfirmZeroStep(false);
      setAuthorError('');
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const buildBackupObject = (commentText: string): FullSystemBackupPayload => ({
    backupFormat: 'ZAYCHICK_FULL_BACKUP_V1',
    appVersion: '2.5.0',
    createdAt: new Date().toISOString(),
    createdByLogin: currentUser.login,
    createdByFullName: currentUser.fullName,
    comment: commentText.trim() || 'Полная резервная копия системы ZAYCHICK',
    data: {
      joints: currentPayload.joints,
      projectLineList: currentPayload.projectLineList,
      lrvCatalog: currentPayload.lrvCatalog,
      welders: currentPayload.welders,
      techCards: currentPayload.techCards,
      weldingMaterials: currentPayload.weldingMaterials,
      userAccounts: currentPayload.userAccounts,
      auditLogs: currentPayload.auditLogs,
      facilityGeoOverrides: currentPayload.facilityGeoOverrides,
      templates: currentPayload.templates,
      activeTemplateId: currentPayload.activeTemplateId,
    },
  });

  const handleDownloadBackupJson = (customPayload?: FullSystemBackupPayload) => {
    const payload = customPayload || buildBackupObject(backupComment);
    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const fileName = `ZAYCHICK_Backup_${now.getFullYear()}-${pad(
      now.getMonth() + 1
    )}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.json`;

    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2500);

    setStatusBanner(`Файл резервной копии «${fileName}» успешно сформирован и скачан.`);
  };

  const handleCreateLocalSnapshot = () => {
    const title =
      snapshotTitle.trim() ||
      `Точка сохранения (${formatTimestampDDMMYY(new Date().toISOString())})`;
    const payload = buildBackupObject(title);
    const item: LocalSnapshotItem = {
      id: `snap-${Date.now()}`,
      title,
      createdAt: payload.createdAt,
      payload,
    };
    const next = [item, ...snapshots].slice(0, 8);
    setSnapshots(next);
    try {
      localStorage.setItem(LOCAL_SNAPSHOTS_KEY, JSON.stringify(next));
    } catch {
      // ignore quota errors
    }
    setSnapshotTitle('');
    setStatusBanner(`Локальная точка восстановления «${title}» сохранена в памяти браузера.`);
  };

  const handleDeleteLocalSnapshot = (id: string) => {
    const next = snapshots.filter((s) => s.id !== id);
    setSnapshots(next);
    try {
      localStorage.setItem(LOCAL_SNAPSHOTS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreError('');
    setStatusBanner('');
    setUploadedFileName(file.name);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<FullSystemBackupPayload>;

      if (
        !parsed ||
        parsed.backupFormat !== 'ZAYCHICK_FULL_BACKUP_V1' ||
        !parsed.data ||
        !Array.isArray(parsed.data.joints) ||
        !Array.isArray(parsed.data.projectLineList)
      ) {
        setRestoreError(
          'Выбранный файл не является корректным бэкапом системы ZAYCHICK (ожидается формат ZAYCHICK_FULL_BACKUP_V1).'
        );
        setParsedBackup(null);
        e.target.value = '';
        return;
      }

      setParsedBackup(parsed as FullSystemBackupPayload);
    } catch {
      setRestoreError(
        'Ошибка чтения файла бэкапа. Убедитесь, что выбран неповреждённый файл .json.'
      );
      setParsedBackup(null);
    }
    e.target.value = '';
  };

  const handleConfirmRestore = (payload: FullSystemBackupPayload) => {
    onRestoreBackup(payload);
    setParsedBackup(null);
    setUploadedFileName('');
    setStatusBanner(
      `Система полностью восстановлена из бэкапа от ${formatTimestampDDMMYY(
        payload.createdAt
      )} (${payload.data.joints.length} стыков, ${
        payload.data.projectLineList.length
      } линий).`
    );
  };

  const handleUnlockAuthorConsole = async (e: React.FormEvent) => {
    e.preventDefault();
    const isAdmin = getUserRolePermissions(currentUser).category === 'admin';
    if (!isAdmin || !currentUser.login) {
      setAuthorError('Доступ разрешён только авторизованному администратору системы.');
      return;
    }
    const clean = authorKeyInput.trim();
    if (!clean) {
      setAuthorError('Введите действующий пароль администратора для подтверждения.');
      return;
    }
    try {
      await zaychickApi.login(currentUser.login, clean);
      setIsAuthorUnlocked(true);
      setAuthorError('');
    } catch {
      setAuthorError('Неверный пароль администратора или сервер авторизации недоступен.');
    }
  };

  const uniqueObjectsCount = new Set(
    currentPayload.projectLineList.map((l) => l.objectName.trim()).filter(Boolean)
  ).size;
  const uniqueRdCount = new Set(
    currentPayload.projectLineList.map((l) => l.rdCode.trim()).filter(Boolean)
  ).size;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Резервное копирование и восстановление системы"
    >
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-4xl bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Шапка строго #1e3799 */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#1e3799] text-white shrink-0">
          <div className="flex items-center gap-3">
            <HardDriveDownload className="w-5 h-5 text-sky-300 shrink-0" />
            <div>
              <h2 className="font-display text-base font-bold">
                {showAuthorPanel
                  ? 'Секретная консоль Автора — Управление жизненным циклом и обнуление базы'
                  : 'Резервное копирование (Бэкап) и полное восстановление данных'}
              </h2>
              <p className="text-xs text-sky-200">
                Сохранение и восстановление 100% данных и настроек всех разделов системы в один файл .JSON
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно резервного копирования"
            className="p-1.5 rounded-lg text-sky-100 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileUpload}
          className="hidden"
        />

        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {statusBanner && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 flex items-center justify-between gap-3 font-semibold">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>{statusBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setStatusBanner('')}
                className="text-emerald-700 hover:text-emerald-950 font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {/* Сводка текущего состояния базы данных */}
          <div className="p-4 rounded-xl bg-[#f4f8fe] border border-sky-200/90 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-bold text-[#1e3799] flex items-center gap-2">
                <Database className="w-4 h-4" />
                <span>Текущее состояние базы данных в рабочей сессии:</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowAuthorPanel(false)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                    !showAuthorPanel
                      ? 'bg-[#1e3799] text-white'
                      : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Бэкап и восстановление (.JSON)
                </button>
                <button
                  type="button"
                  onClick={() => setShowAuthorPanel(true)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                    showAuthorPanel
                      ? 'bg-red-700 text-white'
                      : 'bg-white border border-slate-300 text-slate-700 hover:border-red-300 hover:text-red-700'
                  }`}
                >
                  <Lock className="w-3 h-3" />
                  <span>Чистый лист (Консоль Автора)</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              <div className="p-2 rounded-lg bg-white border border-slate-200">
                <div className="text-[10px] text-slate-500">Объекты / РД</div>
                <div className="font-mono font-bold text-sm text-[#1e3799]">
                  {uniqueObjectsCount} / {uniqueRdCount}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-white border border-slate-200">
                <div className="text-[10px] text-slate-500">Линии (лайнлист)</div>
                <div className="font-mono font-bold text-sm text-[#1e3799]">
                  {currentPayload.projectLineList.length}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-white border border-slate-200">
                <div className="text-[10px] text-slate-500">Сварные стыки</div>
                <div className="font-mono font-bold text-sm text-[#1e3799]">
                  {currentPayload.joints.length}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-white border border-slate-200">
                <div className="text-[10px] text-slate-500">Позиции ЛРВ</div>
                <div className="font-mono font-bold text-sm text-[#1e3799]">
                  {currentPayload.lrvCatalog.length}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-white border border-slate-200">
                <div className="text-[10px] text-slate-500">Сварщики НАКС</div>
                <div className="font-mono font-bold text-sm text-[#1e3799]">
                  {currentPayload.welders.length}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-white border border-slate-200">
                <div className="text-[10px] text-slate-500">Техкарты (ТК)</div>
                <div className="font-mono font-bold text-sm text-[#1e3799]">
                  {currentPayload.techCards.length}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-white border border-slate-200">
                <div className="text-[10px] text-slate-500">Сварочные мат.</div>
                <div className="font-mono font-bold text-sm text-[#1e3799]">
                  {currentPayload.weldingMaterials.length}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-white border border-slate-200">
                <div className="text-[10px] text-slate-500">Пользователи</div>
                <div className="font-mono font-bold text-sm text-[#1e3799]">
                  {currentPayload.userAccounts.length}
                </div>
              </div>
            </div>
          </div>

          {!showAuthorPanel ? (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* 1. СОЗДАНИЕ И СКАЧИВАНИЕ БЭКАПА В ФАЙЛ */}
                <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                      <Download className="w-4 h-4 text-[#1e3799]" />
                      <span>1. Создать файл резервной копии (.JSON)</span>
                    </div>
                    <p className="text-slate-500 leading-relaxed">
                      Выгружает полный слепок базы данных (все стыки, лайнлист, объекты, шифры РД, каталог ЛРВ, сварщиков, техкарты, сварочные материалы, пользователей, шаблоны столбцов и журнал аудита) в единый файл на ваш компьютер.
                    </p>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Комментарий к резервной копии:
                      </label>
                      <input
                        type="text"
                        value={backupComment}
                        onChange={(e) => setBackupComment(e.target.value)}
                        placeholder="Например: Копия перед сдачей исполнительной документации"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadBackupJson()}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#1e3799] text-white font-semibold hover:bg-[#15276e] transition-colors shadow-xs"
                    >
                      <HardDriveDownload className="w-4 h-4" />
                      <span>Скачать полный бэкап данных (.JSON)</span>
                    </button>
                  </div>
                </div>

                {/* 2. ВОССТАНОВЛЕНИЕ ИЗ ФАЙЛА БЭКАПА */}
                <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                      <ArchiveRestore className="w-4 h-4 text-emerald-700" />
                      <span>2. Восстановить данные из файла бэкапа</span>
                    </div>
                    <p className="text-slate-500 leading-relaxed">
                      Выберите ранее сохранённый файл <code className="font-mono text-[#1e3799]">.json</code>. Система проверит целостность структуры, покажет сводку содержимого и восстановит 100% функционала и записей.
                    </p>

                    {restoreError && (
                      <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 font-semibold">
                        {restoreError}
                      </div>
                    )}

                    {parsedBackup && (
                      <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-300 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-emerald-900">
                            Файл проверен: {uploadedFileName}
                          </span>
                          <span className="font-mono text-[11px] text-emerald-800">
                            {formatTimestampDDMMYY(parsedBackup.createdAt)}
                          </span>
                        </div>
                        <div className="text-[11px] text-emerald-800">
                          Автор: <b>{parsedBackup.createdByFullName}</b> · Комментарий:{' '}
                          <i>{parsedBackup.comment}</i>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5 pt-1 text-[11px] font-mono text-slate-800">
                          <div className="bg-white/90 px-2 py-1 rounded border border-emerald-200">
                            Стыков: <b>{parsedBackup.data.joints.length}</b>
                          </div>
                          <div className="bg-white/90 px-2 py-1 rounded border border-emerald-200">
                            Линий: <b>{parsedBackup.data.projectLineList.length}</b>
                          </div>
                          <div className="bg-white/90 px-2 py-1 rounded border border-emerald-200">
                            ЛРВ: <b>{parsedBackup.data.lrvCatalog.length}</b>
                          </div>
                          <div className="bg-white/90 px-2 py-1 rounded border border-emerald-200">
                            НАКС: <b>{parsedBackup.data.welders.length}</b>
                          </div>
                          <div className="bg-white/90 px-2 py-1 rounded border border-emerald-200">
                            ТК: <b>{parsedBackup.data.techCards.length}</b>
                          </div>
                          <div className="bg-white/90 px-2 py-1 rounded border border-emerald-200">
                            Польз.: <b>{parsedBackup.data.userAccounts.length}</b>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-[#1e3799] bg-[#f4f8fe] text-[#1e3799] font-semibold hover:bg-sky-100 transition-colors"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Выбрать файл бэкапа (.JSON)</span>
                    </button>

                    {parsedBackup && (
                      <button
                        type="button"
                        onClick={() => handleConfirmRestore(parsedBackup)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold hover:bg-emerald-800 transition-colors shadow-xs"
                      >
                        <Check className="w-4 h-4" />
                        <span>Подтвердить восстановление</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 3. БЫСТРЫЕ ТОЧКИ ВОССТАНОВЛЕНИЯ В БРАУЗЕРЕ */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-slate-900 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-[#1e3799]" />
                      <span>3. Быстрые точки восстановления в памяти браузера (до 8 снимков)</span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Мгновенное сохранение контрольной точки перед массовым импортом или удалением данных
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={snapshotTitle}
                      onChange={(e) => setSnapshotTitle(e.target.value)}
                      placeholder="Название контрольной точки..."
                      className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs w-56"
                    />
                    <button
                      type="button"
                      onClick={handleCreateLocalSnapshot}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1e3799] text-white font-semibold hover:bg-[#15276e]"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Создать снимок</span>
                    </button>
                  </div>
                </div>

                {snapshots.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 bg-white rounded-lg border border-slate-200">
                    Сохранённых контрольных точек в браузере пока нет.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 bg-white rounded-lg border border-slate-200 overflow-hidden">
                    {snapshots.map((snap) => (
                      <div
                        key={snap.id}
                        className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 hover:bg-sky-50/40"
                      >
                        <div>
                          <div className="font-semibold text-slate-900">{snap.title}</div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {formatTimestampDDMMYY(snap.createdAt)} · Стыков:{' '}
                            {snap.payload.data.joints.length} · Линий:{' '}
                            {snap.payload.data.projectLineList.length} · ЛРВ:{' '}
                            {snap.payload.data.lrvCatalog.length}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleConfirmRestore(snap.payload)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 font-semibold"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Восстановить</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadBackupJson(snap.payload)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 border border-slate-300 text-slate-700 hover:bg-slate-200 font-medium"
                            title="Скачать этот снимок как файл .JSON"
                          >
                            <FileJson className="w-3.5 h-3.5 text-[#1e3799]" />
                            <span>.JSON</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteLocalSnapshot(snap.id)}
                            className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                            title="Удалить контрольную точку"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* СКРЫТАЯ КОНСОЛЬ АВТОРА: ПОЛНОЕ ОБНУЛЕНИЕ («ЧИСТЫЙ ЛИСТ») */
            <div className="p-5 rounded-xl border-2 border-red-300 bg-red-50/40 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-lg bg-red-600 text-white shrink-0">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-red-950">
                      Служебный режим Автора системы «ZAYCHICK»
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Полная очистка всех таблиц, справочников, объектов, шифров РД, стыков и истории аудита для старта нового проекта с чистого листа.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAuthorPanel(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-50"
                >
                  ← К обычному бэкапу
                </button>
              </div>

              {!isAuthorUnlocked ? (
                <form
                  onSubmit={handleUnlockAuthorConsole}
                  className="p-4 rounded-xl bg-white border border-slate-200 space-y-3 max-w-md"
                >
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    <Lock className="w-4 h-4 text-[#1e3799]" />
                    <span>Подтверждение прав Администратора</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Введите действующий пароль администратора ({currentUser.login || 'admin'}) для разблокировки функции полного обнуления рабочей сессии:
                  </p>
                  {authorError && (
                    <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-700 font-semibold">
                      {authorError}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      value={authorKeyInput}
                      onChange={(e) => setAuthorKeyInput(e.target.value)}
                      placeholder="Пароль администратора..."
                      autoFocus
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1e3799] text-white font-semibold hover:bg-[#15276e]"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Разблокировать</span>
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4 bg-white p-4 rounded-xl border border-red-200">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-100 text-emerald-900 font-bold text-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                      <span>Доступ Автора подтверждён</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDownloadBackupJson()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1e3799] text-[#1e3799] hover:bg-sky-50 font-semibold"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Скачать страховочный бэкап перед обнулением</span>
                    </button>
                  </div>

                  <label className="flex items-center gap-2.5 cursor-pointer p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <input
                      type="checkbox"
                      checked={keepOnlyAdmin}
                      onChange={(e) => setKeepOnlyAdmin(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-[#1e3799]"
                    />
                    <span className="font-medium text-slate-800">
                      Очистить список демонстрационных пользователей (оставить только 1 чистую учётную запись Администратора/Автора)
                    </span>
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {!confirmZeroStep ? (
                      <button
                        type="button"
                        onClick={() => setConfirmZeroStep(true)}
                        className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 transition-colors shadow-xs"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Обнулить программу («Чистый лист»)</span>
                      </button>
                    ) : (
                      <div className="p-3 rounded-xl bg-red-50 border-2 border-red-500 flex flex-col gap-2">
                        <div className="flex items-center gap-1.5 font-bold text-red-900">
                          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                          <span>Удалить ВСЕ записи и начать с нуля?</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              onAuthorZeroReset(keepOnlyAdmin);
                              setConfirmZeroStep(false);
                              setStatusBanner(
                                'Программа полностью обнулена («Чистый лист»). Все демонстрационные записи удалены.'
                              );
                            }}
                            className="flex-1 py-2 px-3 rounded-lg bg-red-700 text-white font-bold hover:bg-red-800"
                          >
                            Да, обнулить всё
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmZeroStep(false)}
                            className="py-2 px-3 rounded-lg bg-white border border-slate-300 text-slate-700 font-semibold"
                          >
                            Отмена
                          </button>
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        onAuthorRestoreDemoSeed();
                        setStatusBanner(
                          'Эталонная демонстрационная база данных успешно загружена.'
                        );
                      }}
                      className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 font-semibold hover:bg-slate-100 transition-colors"
                    >
                      <RotateCcw className="w-4 h-4 text-[#1e3799]" />
                      <span>Загрузить эталонную демо-базу (для презентации)</span>
                    </button>

                    {onLoadKharasaveyDemo && (
                      <button
                        type="button"
                        onClick={() => {
                          onLoadKharasaveyDemo();
                          setStatusBanner(
                            'Демонстрационный датасет УКПГ-1С Харасавэйское ГКМ (1271 стык) успешно подгружен.'
                          );
                        }}
                        className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-sky-300 bg-sky-50 text-[#1e3799] font-bold hover:bg-sky-100 transition-colors cursor-pointer"
                      >
                        <HardDriveDownload className="w-4 h-4 text-[#1e3799]" />
                        <span>Подгрузить массив Харасавэй (1271 стык)</span>
                      </button>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-200">
                    <a
                      href="/ZAYCHICK_Install_Package.zip"
                      download="ZAYCHICK_Install_Package.zip"
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 text-white hover:bg-emerald-800 font-semibold transition-colors shadow-2xs"
                    >
                      <Download className="w-4 h-4" />
                      <span>Скачать автономный дистрибутив программы (.ZIP)</span>
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Подвал модального окна со скрытым триггером Автора (двойной клик по версии сборки) */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span
            onDoubleClick={() => setShowAuthorPanel((v) => !v)}
            title="Двойной клик — служебная консоль Автора"
            className="font-mono select-none cursor-default"
          >
            ZAYCHICK Backup Engine v2.5 · Формат: ZAYCHICK_FULL_BACKUP_V1
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-100"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
