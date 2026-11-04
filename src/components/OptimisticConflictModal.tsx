import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  GitCompare,
  GitMerge,
  RefreshCw,
  ShieldAlert,
  UserCheck,
  X,
} from 'lucide-react';
import { OptimisticLockConflictPayload, WeldJoint } from '../types/welding';
import { formatTimestampDDMMYY } from '../utils/weldingLogic';

interface OptimisticConflictModalProps {
  conflict: OptimisticLockConflictPayload | null;
  onClose: () => void;
  onAcceptServerVersion: (serverJoint: WeldJoint) => void;
  onApplyAutoMerge: (mergedJoint: WeldJoint, serverVersion: number) => void;
  onForceClientOverwrite: (clientJoint: WeldJoint, serverVersion: number) => void;
}

export const OptimisticConflictModal: React.FC<OptimisticConflictModalProps> = ({
  conflict,
  onClose,
  onAcceptServerVersion,
  onApplyAutoMerge,
  onForceClientOverwrite,
}) => {
  if (!conflict) return null;

  const directCollisionsCount = conflict.fieldDiffs.filter(
    (d) => d.isDirectCollision
  ).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Разрешение конфликта оптимистической блокировки СУБД"
    >
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-4xl bg-white rounded-xl shadow-2xl border-2 border-amber-400 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Шапка модального окна HTTP 409 Conflict */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#1e3799] text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500 text-slate-950 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold uppercase tracking-wider">
                  Конфликт оптимистической блокировки (HTTP 409 Conflict)
                </h2>
                <span className="px-2 py-0.5 rounded bg-amber-400/20 border border-amber-300 text-amber-200 font-mono text-[11px] font-bold">
                  v{conflict.expectedVersion} ≠ v{conflict.actualServerVersion}
                </span>
              </div>
              <p className="text-xs text-sky-200 mt-0.5">
                Запись {conflict.entityTitle} была изменена в серверной СУБД другим пользователем параллельно с вашим редактированием
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно конфликта"
            className="p-1.5 rounded-lg text-sky-100 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto text-xs flex-1">
          {/* Информационная панель о версиях */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] text-slate-500 font-medium">
                Ваша базовая версия при открытии
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-800 font-mono font-bold text-sm">
                  v{conflict.expectedVersion}
                </span>
                <span className="text-slate-600">Локальный снимок формы</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300">
              <div className="text-[11px] text-amber-900 font-semibold flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-amber-700" />
                <span>Актуальная версия в серверной СУБД</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-amber-600 text-white font-mono font-bold text-sm">
                  v{conflict.actualServerVersion}
                </span>
                <span className="font-semibold text-amber-950 truncate">
                  {formatTimestampDDMMYY(conflict.serverUpdatedAt)}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#f4f8fe] border border-sky-200">
              <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-[#1e3799]" />
                <span>Кто сохранил изменения на сервере</span>
              </div>
              <div className="mt-1 font-bold text-[#1e3799] truncate" title={conflict.serverUpdatedBy}>
                {conflict.serverUpdatedBy}
              </div>
            </div>
          </div>

          {/* Таблица расхождений по полям (3-Way Diff) */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <GitCompare className="w-4 h-4 text-[#1e3799]" />
                <span>
                  Сравнение изменённых полей ({conflict.fieldDiffs.length}{' '}
                  {conflict.fieldDiffs.length === 1 ? 'поле' : 'полей'})
                </span>
              </div>
              {directCollisionsCount > 0 ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 text-red-800 font-semibold text-[11px]">
                  <AlertTriangle className="w-3 h-3 text-red-600" />
                  <span>Прямых коллизий: {directCollisionsCount}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold text-[11px]">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>Изменения в разных полях (доступно безопасное авто-слияние)</span>
                </span>
              )}
            </div>

            {conflict.fieldDiffs.length === 0 ? (
              <div className="p-6 text-center text-slate-500">
                В серверной СУБД обновился номер версии записи (v{conflict.actualServerVersion}), но значения бизнес-полей совпадают.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-64 table-scroll-container">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <th className="py-2 px-3 font-semibold">Поле паспорта стыка</th>
                      <th className="py-2 px-3 font-semibold">
                        Базовое (v{conflict.expectedVersion})
                      </th>
                      <th className="py-2 px-3 font-semibold text-amber-900 bg-amber-50/60">
                        В СУБД на сервере (v{conflict.actualServerVersion})
                      </th>
                      <th className="py-2 px-3 font-semibold text-[#1e3799] bg-sky-50/60">
                        Ваше значение
                      </th>
                      <th className="py-2 px-3 font-semibold">Тип изменения</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {conflict.fieldDiffs.map((diff) => (
                      <tr key={diff.fieldKey} className="hover:bg-slate-50/80">
                        <td className="py-2 px-3 font-semibold text-slate-900">
                          {diff.fieldLabel}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-500">
                          {diff.baseValue}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-amber-900 bg-amber-50/40">
                          {diff.serverValue}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-[#1e3799] bg-sky-50/40">
                          {diff.clientValue}
                        </td>
                        <td className="py-2 px-3">
                          {diff.isDirectCollision ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 text-red-800 font-semibold text-[10px]">
                              Коллизия правок
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold text-[10px]">
                              Разные поля (Auto-Merge)
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Варианты разрешения конфликта оптимистической блокировки */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="font-bold text-slate-900">
              Выберите стратегию разрешения конфликта транзакции:
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Вариант 1: Принять серверную версию */}
              <button
                type="button"
                onClick={() => onAcceptServerVersion(conflict.serverRecord)}
                className="p-3.5 rounded-xl bg-white border border-slate-300 hover:border-amber-500 hover:bg-amber-50/30 text-left transition-colors flex flex-col justify-between gap-2 cursor-pointer"
              >
                <div>
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    <RefreshCw className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>1. Принять версию из СУБД</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Отменить ваши несохранённые правки и загрузить актуальную серверную запись v{conflict.actualServerVersion}.
                  </p>
                </div>
                <div className="text-[11px] font-mono font-bold text-amber-800 flex items-center gap-1">
                  <span>Оставить v{conflict.actualServerVersion}</span>
                  <ArrowRight className="w-3 h-3" />
                </div>
              </button>

              {/* Вариант 2: Умное слияние (3-Way Auto-Merge) */}
              <button
                type="button"
                onClick={() =>
                  onApplyAutoMerge(
                    conflict.autoMergedRecord,
                    conflict.actualServerVersion
                  )
                }
                className="p-3.5 rounded-xl bg-[#e8f1fc] border-2 border-[#1e3799] hover:bg-sky-100/80 text-left transition-colors flex flex-col justify-between gap-2 cursor-pointer shadow-xs"
              >
                <div>
                  <div className="flex items-center gap-2 font-bold text-[#1e3799]">
                    <GitMerge className="w-4 h-4 text-[#1e3799] shrink-0" />
                    <span>2. Умное слияние (Auto-Merge)</span>
                  </div>
                  <p className="text-[11px] text-slate-700 mt-1">
                    Сохранить изменения обоих специалистов в непересекающихся полях и записать новую версию в СУБД.
                  </p>
                </div>
                <div className="text-[11px] font-mono font-bold text-[#1e3799] flex items-center gap-1">
                  <span>Сохранить как v{conflict.actualServerVersion + 1}</span>
                  <ArrowRight className="w-3 h-3" />
                </div>
              </button>

              {/* Вариант 3: Принудительная перезапись версией клиента */}
              <button
                type="button"
                onClick={() =>
                  onForceClientOverwrite(
                    conflict.clientRecord,
                    conflict.actualServerVersion
                  )
                }
                className="p-3.5 rounded-xl bg-white border border-red-300 hover:border-red-500 hover:bg-red-50/40 text-left transition-colors flex flex-col justify-between gap-2 cursor-pointer"
              >
                <div>
                  <div className="flex items-center gap-2 font-bold text-red-800">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>3. Перезаписать моей версией</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Принудительно записать ваши данные поверх серверной версии с фиксацией в Журнале аудита.
                  </p>
                </div>
                <div className="text-[11px] font-mono font-bold text-red-700 flex items-center gap-1">
                  <span>Принудительно v{conflict.actualServerVersion + 1}</span>
                  <ArrowRight className="w-3 h-3" />
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
