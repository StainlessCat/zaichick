import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CalendarRange,
  CheckCircle2,
  CloudSun,
  Download,
  Loader2,
  Lock,
  RefreshCw,
} from 'lucide-react';
import type { WeldJoint } from '../../types/welding';

export interface DateCheckStatusState {
  status: 'idle' | 'checking' | 'available' | 'pending' | 'not_found';
  tempC?: string;
  source?: string;
  message?: string;
}

export interface FacilityArchiveActionsPanelProps {
  weatherStation: string;
  weatherStationId: string;
  region: string;
  selectedObjName: string;
  archiveDaysCount: number;
  testDate: string;
  setTestDate: React.Dispatch<React.SetStateAction<string>>;
  dateCheckStatus: DateCheckStatusState;
  onCheckDateObservations: () => void;
  periodStart: string;
  setPeriodStart: React.Dispatch<React.SetStateAction<string>>;
  periodEnd: string;
  setPeriodEnd: React.Dispatch<React.SetStateAction<string>>;
  isLoadingArchive: boolean;
  onLoadDailyObservationsArchive: () => void;
  archiveLoadMessage: string | null;
  facilityJoints: WeldJoint[];
  isConfirmingBulkUpdate: boolean;
  setIsConfirmingBulkUpdate: React.Dispatch<React.SetStateAction<boolean>>;
  onConfirmBulkUpdate: () => void;
  bulkUpdateResult: string | null;
}

export const FacilityArchiveActionsPanel: React.FC<FacilityArchiveActionsPanelProps> = ({
  weatherStation,
  weatherStationId,
  region,
  selectedObjName,
  archiveDaysCount,
  testDate,
  setTestDate,
  dateCheckStatus,
  onCheckDateObservations: handleCheckDateObservations,
  periodStart,
  setPeriodStart,
  periodEnd,
  setPeriodEnd,
  isLoadingArchive,
  onLoadDailyObservationsArchive: handleLoadDailyObservationsArchive,
  archiveLoadMessage,
  facilityJoints,
  isConfirmingBulkUpdate,
  setIsConfirmingBulkUpdate,
  onConfirmBulkUpdate: handleConfirmBulkUpdate,
  bulkUpdateResult,
}) => {
  return (
    <>
<div className="p-4 rounded-xl bg-gradient-to-r from-sky-50 to-indigo-50 border border-sky-200 space-y-3">
  <div className="flex items-start justify-between gap-3">
    <div className="min-w-0">
      <span className="text-[10px] font-bold uppercase tracking-wider text-sky-800">
        Подтверждённая метеостанция для объекта
      </span>
      <div className="font-bold text-sm text-[#1e3799] truncate">
        {weatherStation || 'Метеостанция не привязана'}
      </div>
      <div className="text-[11px] text-slate-600 mt-0.5">
        {weatherStationId ? (
          <>
            WMO ID: <span className="font-mono font-bold">{weatherStationId}</span> · {region}
          </>
        ) : (
          <span className="text-amber-800 font-bold bg-amber-100 px-2 py-0.5 rounded">
            Станция не выбрана · Выберите реальную метеостанцию из реестра выше
          </span>
        )}
      </div>
    </div>
    <div className="shrink-0 text-right">
      <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-[#1e3799] bg-white px-2 py-1 rounded-md border border-sky-200 shadow-2xs">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
        <span>{archiveDaysCount} сут. в архиве</span>
      </span>
    </div>
  </div>

  {/* Проверка наблюдений на дату */}
  <div className="pt-2.5 border-t border-sky-200/60">
    <div className="flex items-center gap-2 flex-wrap mb-2">
      <span className="text-xs font-bold text-slate-800">
        Проверка фактических данных станции на дату сварки:
      </span>
      <input
        type="date"
        value={testDate}
        onChange={(e) => setTestDate(e.target.value)}
        aria-label="Дата для проверки наблюдений"
        className="px-2 py-1 bg-white border border-slate-300 rounded-md font-mono text-xs"
      />
      <button
        type="button"
        onClick={handleCheckDateObservations}
        className="px-3 py-1 bg-[#1e3799] hover:bg-[#152a77] text-white rounded-md text-xs font-semibold transition-colors cursor-pointer"
      >
        Проверить наблюдения
      </button>
    </div>

    {/* Статус наличия данных */}
    {dateCheckStatus.status !== 'idle' && (
      <div
        className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-3 ${
          dateCheckStatus.status === 'available'
            ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
            : dateCheckStatus.status === 'pending'
            ? 'bg-sky-50 border-sky-300 text-sky-900'
            : 'bg-amber-50 border-amber-300 text-amber-900'
        }`}
      >
        <div className="flex items-center gap-2">
          {dateCheckStatus.status === 'available' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          )}
          <span>{dateCheckStatus.message}</span>
        </div>
        {dateCheckStatus.status === 'available' && dateCheckStatus.tempC && (
          <span className="font-mono font-bold text-sm bg-white px-2 py-0.5 rounded border border-emerald-300 text-emerald-800 shrink-0">
            {dateCheckStatus.tempC} °C
          </span>
        )}
      </div>
    )}
  </div>
</div>

{/* 6. ПЕРИОД НАБЛЮДЕНИЙ И ЗАГРУЗКА АРХИВА */}
<div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
  <div className="flex items-center justify-between">
    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
      <CalendarRange className="w-3.5 h-3.5 text-[#1e3799]" />
      <span>Загрузка дневного архива наблюдений за период:</span>
    </span>
  </div>
  <div className="flex items-center gap-2 flex-wrap">
    <input
      type="date"
      value={periodStart}
      onChange={(e) => setPeriodStart(e.target.value)}
      aria-label="Начало периода"
      className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-xs"
    />
    <span className="text-slate-400">—</span>
    <input
      type="date"
      value={periodEnd}
      onChange={(e) => setPeriodEnd(e.target.value)}
      aria-label="Конец периода"
      className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-xs"
    />
    <button
      type="button"
      onClick={handleLoadDailyObservationsArchive}
      disabled={isLoadingArchive}
      className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
    >
      {isLoadingArchive ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <CloudSun className="w-3.5 h-3.5" />
      )}
      <span>Загрузить дневной архив</span>
    </button>
  </div>

  {archiveLoadMessage && (
    <div className="text-[11px] font-medium text-slate-600 bg-white p-2 rounded-lg border border-slate-200">
      {archiveLoadMessage}
    </div>
  )}
</div>

{/* 7. ЗАЩИТА СТЫКОВ: СМЕНА СТАНЦИИ НЕ МЕНЯЕТ ЗАПИСАННЫЕ ТЕМПЕРАТУРЫ МОЛЧА */}
<div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2">
  <div className="flex items-start justify-between gap-3">
    <div>
      <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
        <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
        <span>Изоляция температур сваренных стыков</span>
      </span>
      <p className="text-[11px] text-amber-900 mt-0.5">
        Смена метеостанции не изменяет уже зафиксированные температуры в паспортах стыков.
        Для обновления температур требуется отдельная команда с подтверждением.
      </p>
    </div>
    <div className="shrink-0 text-right">
      <span className="text-xs font-mono font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-amber-200">
        Стыков объекта: {facilityJoints.length}
      </span>
    </div>
  </div>

  {/* Кнопка отдельной команды с подтверждением */}
  <div className="pt-2 flex items-center gap-2 flex-wrap">
    {!isConfirmingBulkUpdate ? (
      <button
        type="button"
        onClick={() => setIsConfirmingBulkUpdate(true)}
        disabled={facilityJoints.length === 0 || archiveDaysCount === 0}
        className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        <span>Обновить температуры стыков по выбранной метеостанции</span>
      </button>
    ) : (
      <div className="w-full p-3 rounded-lg bg-white border border-amber-300 space-y-2">
        <p className="text-xs font-bold text-amber-950">
          Подтвердите обновление температур для {facilityJoints.length} стыков объекта «{selectedObjName}» по наблюдениям станции «{weatherStation}»?
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleConfirmBulkUpdate}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold cursor-pointer"
          >
            Да, обновить
          </button>
          <button
            type="button"
            onClick={() => setIsConfirmingBulkUpdate(false)}
            className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-xs font-medium cursor-pointer"
          >
            Отмена
          </button>
        </div>
      </div>
    )}

    {bulkUpdateResult && (
      <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-300">
        {bulkUpdateResult}
      </span>
    )}
  </div>
</div>
    </>
  );
};
