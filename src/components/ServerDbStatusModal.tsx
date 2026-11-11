import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Database,
  GitCompare,
  HardDrive,
  Lock,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { ServerDbMetadata, WeldJoint } from '../types/welding';
import { formatTimestampDDMMYY } from '../utils/weldingLogic';

interface ServerDbStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  dbMeta: ServerDbMetadata | null;
  isConnected: boolean;
  isSyncing: boolean;
  joints?: WeldJoint[];
  sampleJoints?: WeldJoint[];
  onRefreshFromServer?: () => Promise<void>;
  onForceSyncFromServer?: () => Promise<void>;
  onTriggerSimulatedConflict: (jointId: string) => Promise<void>;
  pendingSyncCount?: number;
  lastSyncError?: string | null;
  onRetrySync?: () => Promise<boolean>;
}

export const ServerDbStatusModal: React.FC<ServerDbStatusModalProps> = ({
  isOpen,
  onClose,
  dbMeta,
  isConnected,
  isSyncing,
  joints: jointsProp,
  sampleJoints,
  onRefreshFromServer: onRefreshProp,
  onForceSyncFromServer,
  onTriggerSimulatedConflict,
  pendingSyncCount = 0,
  lastSyncError = null,
  onRetrySync,
}) => {
  const joints = jointsProp || sampleJoints || [];
  const onRefreshFromServer = onRefreshProp || onForceSyncFromServer || (async () => {});

  const [selectedTestJointId, setSelectedTestJointId] = useState<string>(
    joints[0]?.id || ''
  );
  const [isSimulating, setIsSimulating] = useState(false);

  if (!isOpen) return null;

  const targetJointId = selectedTestJointId || joints[0]?.id || '';

  const handleRunConflictDemo = async () => {
    if (!targetJointId) return;
    setIsSimulating(true);
    try {
      await onTriggerSimulatedConflict(targetJointId);
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Мониторинг единой серверной СУБД и оптимистической блокировки"
    >
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-3xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Шапка модального окна */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#1e3799] text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-white/15 text-sky-200">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold uppercase tracking-wider">
                  Единая серверная СУБД с оптимистической блокировкой
                </h2>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                    isConnected
                      ? 'bg-emerald-400/20 text-emerald-200 border border-emerald-400/40'
                      : 'bg-amber-400/20 text-amber-200 border border-amber-400/40'
                  }`}
                >
                  {isConnected ? 'ONLINE · POSTGRESQL' : 'НЕТ СВЯЗИ С СЕРВЕРОМ'}
                </span>
              </div>
              <p className="text-xs text-sky-200 mt-0.5">
                Многопользовательское транзакционное ядро PostgreSQL 16 + контроль версий записей (OCC HTTP 409)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно СУБД"
            className="p-1.5 rounded-lg text-sky-100 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto text-xs flex-1">
          {/* 1. Статус движка СУБД и глобальной ревизии */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-[#f4f8fe] border border-sky-200">
              <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                <Server className="w-3.5 h-3.5 text-[#1e3799]" />
                <span>Ядро серверной СУБД</span>
              </div>
              <div className="mt-1 font-bold text-slate-900 text-sm">
                {dbMeta?.engine || 'PostgreSQL 16 (Asyncpg)'}
              </div>
              <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                Endpoint: {dbMeta?.dbFilePath || 'PostgreSQL /api/* + SSE /api/events/stream'}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#f4f8fe] border border-sky-200">
              <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                <Activity className="w-3.5 h-3.5 text-[#1e3799]" />
                <span>Глобальная ревизия БД</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-[#1e3799] text-white font-mono font-bold text-sm">
                  rev #{dbMeta?.globalRevision ?? 1}
                </span>
                <button
                  type="button"
                  onClick={onRefreshFromServer}
                  disabled={isSyncing}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white border border-sky-300 text-[#1e3799] hover:bg-sky-50 font-semibold text-[11px] cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>Обновить</span>
                </button>
              </div>
              <div className="text-[11px] text-slate-500 mt-1 truncate">
                {dbMeta?.lastUpdatedAt
                  ? `Изм.: ${formatTimestampDDMMYY(dbMeta.lastUpdatedAt)}`
                  : 'Синхронизировано'}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#f4f8fe] border border-sky-200">
              <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Последняя транзакция</span>
              </div>
              <div className="mt-1 font-bold text-slate-900 truncate" title={dbMeta?.lastAction}>
                {dbMeta?.lastAction || 'Готов к работе'}
              </div>
              <div className="text-[11px] text-[#1e3799] font-medium mt-0.5 truncate">
                {dbMeta?.lastUpdatedBy || 'Система'}
              </div>
            </div>
          </div>

          {/* 2. Таблицы серверной СУБД */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <HardDrive className="w-4 h-4 text-[#1e3799]" />
                <span>Реляционные таблицы в единой серверной базе данных:</span>
              </div>
              <span className="text-[11px] font-mono text-emerald-700 font-semibold">
                PostgreSQL 16 (MVCC + OCC)
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                <div className="text-[10px] font-mono text-slate-400">weld_joints</div>
                <div className="font-bold text-slate-900 mt-0.5">Сварные стыки</div>
                <div className="font-mono font-bold text-sm text-[#1e3799]">
                  {dbMeta?.counts.joints ?? joints.length} зап.
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                <div className="text-[10px] font-mono text-slate-400">project_linelist</div>
                <div className="font-bold text-slate-900 mt-0.5">Проект (лайнлист)</div>
                <div className="font-mono font-bold text-sm text-[#1e3799]">
                  {dbMeta?.counts.projectLineList ?? 0} зап.
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                <div className="text-[10px] font-mono text-slate-400">lrv_catalog</div>
                <div className="font-bold text-slate-900 mt-0.5">Каталог ЛРВ</div>
                <div className="font-mono font-bold text-sm text-[#1e3799]">
                  {dbMeta?.counts.lrvCatalog ?? 0} зап.
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                <div className="text-[10px] font-mono text-slate-400">welders / tech_cards</div>
                <div className="font-bold text-slate-900 mt-0.5">НАКС и ТК</div>
                <div className="font-mono font-bold text-sm text-[#1e3799]">
                  {(dbMeta?.counts.welders ?? 0) + (dbMeta?.counts.techCards ?? 0)} зап.
                </div>
              </div>
            </div>
          </div>

          {/* 3. Как работает оптимистическая блокировка (OCC) + Интерактивный стенд проверки */}
          <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-300 space-y-3">
            <div className="flex items-start gap-2.5">
              <div className="p-2 rounded-lg bg-amber-500 text-slate-950 shrink-0 mt-0.5">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-xs sm:text-sm">
                  Интерактивная проверка оптимистической блокировки (OCC HTTP 409 Conflict)
                </h3>
                <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                  Каждая запись стыка имеет монотонный счётчик версий <code className="font-mono font-bold text-[#1e3799]">version (v1, v2, v3...)</code>. При сохранении паспорта сервер проверяет условие <code className="font-mono font-bold">WHERE id = ? AND version = expectedVersion</code>. Если другой инженер успел изменить этот стык раньше вас, сервер отклоняет перезапись с кодом <strong>409 Conflict</strong> и открывает окно трёхстороннего слияния (3-Way Merge).
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-white border border-amber-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                <label className="font-semibold text-slate-700 shrink-0">
                  Стык для теста:
                </label>
                <select
                  value={targetJointId}
                  onChange={(e) => setSelectedTestJointId(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded font-mono text-xs font-semibold text-[#1e3799]"
                >
                  {joints.slice(0, 25).map((j) => (
                    <option key={j.id} value={j.id}>
                      Стык №{j.jointNumber} · {j.uniqueLineId} (текущая v{j.version ?? 1})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleRunConflictDemo}
                disabled={isSimulating || joints.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1e3799] text-white hover:bg-[#15276e] font-semibold text-xs transition-colors shadow-xs cursor-pointer"
              >
                <GitCompare className="w-4 h-4 text-amber-300" />
                <span>
                  {isSimulating
                    ? 'Моделирование коллизии...'
                    : 'Смоделировать параллельную правку и конфликт (409)'}
                </span>
              </button>
            </div>
          </div>

          {/* 4. Активные пользовательские сессии */}
          {dbMeta?.activeSessions && dbMeta.activeSessions.length > 0 && (
            <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <Users className="w-4 h-4 text-[#1e3799]" />
                <span>Активные сессии, подключённые к серверной СУБД ({dbMeta.activeSessions.length}):</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {dbMeta.activeSessions.map((sess) => (
                  <div
                    key={sess.sessionId}
                    className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#f4f8fe] border border-sky-200 text-[11px]"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="font-bold text-slate-900">{sess.fullName}</span>
                    <span className="text-slate-500">({sess.role})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#1e3799]" />
            <span>Поддержка Real-Time синхронизации между вкладками и ПК через Server-Sent Events (SSE)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#1e3799] text-white font-semibold hover:bg-[#15276e] cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
