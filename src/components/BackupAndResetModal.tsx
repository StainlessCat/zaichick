import React, { useRef, useState } from 'react';
import {
  ArchiveRestore,
  Check,
  CheckCircle2,
  Clock,
  Database,
  Download,
  FileJson,
  HardDriveDownload,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  AuditLogEntry,
  ColumnTemplate,
  LRVItem,
  NdtLabRequest,
  ProjectLineItem,
  TechCardItem,
  UserAccount,
  WelderProfile,
  WeldingMaterialCertificate,
  WeldJoint,
} from '../types/welding';
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
    labRequests?: NdtLabRequest[];
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
  initialMode?: 'backup' | 'author_reset';
  onClose: () => void;
  currentUser: UserAccount;
  currentPayload: FullSystemBackupPayload['data'];
  onRestoreBackup: (payload: FullSystemBackupPayload) => void;
  onAuthorRestoreDemoSeed?: () => void;
  onLoadKharasaveyDemo?: () => void;
}

const LOCAL_SNAPSHOTS_KEY = 'zaychick_local_snapshots_v1';

export const BackupAndResetModal: React.FC<BackupAndResetModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  currentPayload,
  onRestoreBackup,
  onAuthorRestoreDemoSeed,
  onLoadKharasaveyDemo,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [backupComment, setBackupComment] = useState(
    'Плановая резервная копия всех разделов системы'
  );
  const [parsedBackup, setParsedBackup] = useState<FullSystemBackupPayload | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [restoreError, setRestoreError] = useState('');
  const [statusBanner, setStatusBanner] = useState('');

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

  React.useEffect(() => {
    if (isOpen) {
      setRestoreError('');
      setStatusBanner('');
    }
  }, [isOpen]);

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
      labRequests: currentPayload.labRequests || [],
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
      `Точка сохранения ${formatTimestampDDMMYY(new Date().toISOString())}`;
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
          'Выбранный файл не является корректным бэкапом системы ZAYCHICK.'
        );
        setParsedBackup(null);
        e.target.value = '';
        return;
      }

      setParsedBackup(parsed as FullSystemBackupPayload);
    } catch {
      setRestoreError(
        'Ошибка чтения файла бэкапа. Убедитесь, что выбран неповреждённый файл.'
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
      `Система восстановлена из резервной копии от ${formatTimestampDDMMYY(
        payload.createdAt
      )}: ${payload.data.joints.length} стыков, ${payload.data.projectLineList.length} линий.`
    );
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
        <div className="flex items-center justify-between px-6 py-4 bg-[#1e3799] text-white shrink-0">
          <div className="flex items-center gap-3">
            <HardDriveDownload className="w-5 h-5 text-sky-300 shrink-0" />
            <div>
              <h2 className="font-display text-base font-bold">
                Резервное копирование и восстановление данных
              </h2>
              <p className="text-xs text-sky-200">
                Сохранение и восстановление всех разделов системы через файл резервной копии
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно резервного копирования"
            className="p-1.5 rounded-lg text-sky-100 hover:text-white hover:bg-white/10 cursor-pointer"
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
                className="text-emerald-700 hover:text-emerald-950 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Сводка текущего состояния базы данных */}
          <div className="p-4 rounded-xl bg-[#f4f8fe] border border-sky-200/90 space-y-2.5">
            <div className="font-bold text-[#1e3799] flex items-center gap-2">
              <Database className="w-4 h-4" />
              <span>Текущее состояние базы данных в рабочей сессии</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              <div className="p-2 rounded-lg bg-white border border-slate-200">
                <div className="text-[10px] text-slate-500">Объекты / РД</div>
                <div className="font-mono font-bold text-sm text-[#1e3799] tabular-nums">
                  {uniqueObjectsCount} / {uniqueRdCount}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-white border border-slate-200">
                <div className="text-[10px] text-slate-500">Линии лайнлиста</div>
                <div className="font-mono font-bold text-sm text-[#1e3799] tabular-nums">
                  {currentPayload.projectLineList.length}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-white border border-slate-200">
                <div className="text-[10px] text-slate-500">Сварные стыки</div>
                <div className="font-mono font-bold text-sm text-[#1e3799] tabular-nums">
                  {currentPayload.joints.length}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-white border border-slate-200">
                <div className="text-[10px] text-slate-500">Позиции ЛРВ</div>
                <div className="font-mono font-bold text-sm text-[#1e3799] tabular-nums">
                  {currentPayload.lrvCatalog.length}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-white border border-slate-200">
                <div className="text-[10px] text-slate-500">Сварщики НАКС</div>
                <div className="font-mono font-bold text-sm text-[#1e3799] tabular-nums">
                  {currentPayload.welders.length}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-white border border-slate-200">
                <div className="text-[10px] text-slate-500">Техкарты</div>
                <div className="font-mono font-bold text-sm text-[#1e3799] tabular-nums">
                  {currentPayload.techCards.length}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-white border border-slate-200">
                <div className="text-[10px] text-slate-500">Сварочные мат.</div>
                <div className="font-mono font-bold text-sm text-[#1e3799] tabular-nums">
                  {currentPayload.weldingMaterials.length}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-white border border-slate-200">
                <div className="text-[10px] text-slate-500">Пользователи</div>
                <div className="font-mono font-bold text-sm text-[#1e3799] tabular-nums">
                  {currentPayload.userAccounts.length}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 1. СОЗДАНИЕ И СКАЧИВАНИЕ БЭКАПА В ФАЙЛ */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3 flex flex-col justify-between">
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                  <Download className="w-4 h-4 text-[#1e3799]" />
                  <span>1. Создать файл резервной копии</span>
                </div>
                <p className="text-slate-500 leading-relaxed">
                  Выгружает полный слепок базы данных по всем разделам системы и журналу аудита в файл на компьютер.
                </p>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1 whitespace-nowrap">
                    Комментарий к резервной копии
                  </label>
                  <input
                    type="text"
                    value={backupComment}
                    onChange={(e) => setBackupComment(e.target.value)}
                    placeholder="Копия перед сдачей исполнительной документации"
                    className="w-full h-8 px-3 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleDownloadBackupJson()}
                  className="w-full h-9 inline-flex items-center justify-center gap-2 px-4 rounded-lg bg-[#1e3799] text-white font-semibold hover:bg-[#15276e] transition-colors cursor-pointer"
                >
                  <HardDriveDownload className="w-4 h-4" />
                  <span>Скачать полный бэкап данных</span>
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
                  Выберите ранее сохранённый файл резервной копии. Система проверит структуру и восстановит данные.
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
                      Автор: <b>{parsedBackup.createdByFullName}</b> · {parsedBackup.comment}
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
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 h-9 inline-flex items-center justify-center gap-2 px-4 rounded-lg border border-[#1e3799] bg-[#f4f8fe] text-[#1e3799] font-semibold hover:bg-sky-100 transition-colors cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>Выбрать файл бэкапа</span>
                </button>

                {parsedBackup && (
                  <button
                    type="button"
                    onClick={() => handleConfirmRestore(parsedBackup)}
                    className="flex-1 h-9 inline-flex items-center justify-center gap-1.5 px-4 rounded-lg bg-emerald-700 text-white font-semibold hover:bg-emerald-800 transition-colors cursor-pointer"
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
                  <span>3. Точки восстановления в браузере</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Сохранение контрольной точки перед массовым импортом или корректировками
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={snapshotTitle}
                  onChange={(e) => setSnapshotTitle(e.target.value)}
                  placeholder="Название контрольной точки"
                  className="h-8 px-3 bg-white border border-slate-300 rounded-lg text-xs w-56"
                />
                <button
                  type="button"
                  onClick={handleCreateLocalSnapshot}
                  className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-[#1e3799] text-white font-semibold hover:bg-[#15276e] cursor-pointer"
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
                        className="h-7 inline-flex items-center gap-1 px-2.5 rounded bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 font-semibold cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Восстановить</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadBackupJson(snap.payload)}
                        className="h-7 inline-flex items-center gap-1 px-2.5 rounded bg-slate-100 border border-slate-300 text-slate-700 hover:bg-slate-200 font-medium cursor-pointer"
                        title="Скачать снимок"
                      >
                        <FileJson className="w-3.5 h-3.5 text-[#1e3799]" />
                        <span>Скачать</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteLocalSnapshot(snap.id)}
                        className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
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

          {(onAuthorRestoreDemoSeed || onLoadKharasaveyDemo) && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {onAuthorRestoreDemoSeed && (
                <button
                  type="button"
                  onClick={() => {
                    onAuthorRestoreDemoSeed();
                    setStatusBanner('Эталонная демонстрационная база данных загружена.');
                  }}
                  className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-[#1e3799]" />
                  <span>Загрузить эталонную демо-базу</span>
                </button>
              )}
              {onLoadKharasaveyDemo && (
                <button
                  type="button"
                  onClick={() => {
                    onLoadKharasaveyDemo();
                    setStatusBanner('Демонстрационный массив УКПГ-1С Харасавэйское ГКМ подгружен.');
                  }}
                  className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg border border-sky-300 bg-sky-50 text-[#1e3799] font-semibold hover:bg-sky-100 cursor-pointer"
                >
                  <HardDriveDownload className="w-3.5 h-3.5" />
                  <span>Подгрузить массив Харасавэй</span>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span className="font-mono">ZAYCHICK Backup Engine v2.5</span>
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-100 cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
