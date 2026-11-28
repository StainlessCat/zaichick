import React from 'react';
import { AlertTriangle, ShieldAlert, Terminal, Trash2 } from 'lucide-react';
import { FacilityObject } from '../../types/welding';

export interface AdminProjectPurgeTabProps {
  facilities: FacilityObject[];
  selectedPurgeFacility: FacilityObject | undefined;
  setSelectedPurgeFacilityId: React.Dispatch<React.SetStateAction<string>>;
  purgePreviewCounts: {
    joints: number;
    lines: number;
    lrv: number;
    labRequests: number;
  };
  purgeConfirmName: string;
  setPurgeConfirmName: React.Dispatch<React.SetStateAction<string>>;
  purgePassword: string;
  setPurgePassword: React.Dispatch<React.SetStateAction<string>>;
  purgeLoading: boolean;
  purgeResult: { type: 'ok' | 'err'; text: string } | null;
  onPurgeSubmit: (e: React.FormEvent) => void;
}

export const AdminProjectPurgeTab: React.FC<AdminProjectPurgeTabProps> = ({
  facilities,
  selectedPurgeFacility,
  setSelectedPurgeFacilityId,
  purgePreviewCounts,
  purgeConfirmName,
  setPurgeConfirmName,
  purgePassword,
  setPurgePassword,
  purgeLoading,
  purgeResult,
  onPurgeSubmit: handlePurgeSubmit,
}) => {
  return (
<div className="space-y-4">
  <div className="p-4 rounded-xl bg-red-50/70 border border-red-200 space-y-2">
    <div className="flex items-center gap-2 font-bold text-red-900 text-sm">
      <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
      <span>Очистка оперативных данных выбранного проекта</span>
    </div>
    <p className="text-slate-700 leading-relaxed">
      Удаляет сварные стыки, лайнлист, позиции ЛРВ и заявки НК только по выбранному объекту строительства. Учётные записи пользователей, справочники НАКС и техкарты, журнал аудита и остальные проекты сохраняются.
    </p>
  </div>

  {purgeResult && (
    <div
      className={`p-3 rounded-lg border font-semibold ${
        purgeResult.type === 'ok'
          ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
          : 'bg-red-50 border-red-200 text-red-800'
      }`}
    >
      {purgeResult.text}
    </div>
  )}

  <form
    onSubmit={handlePurgeSubmit}
    className="p-4 rounded-xl bg-white border border-slate-200 space-y-4"
  >
    <div className="space-y-1">
      <label className="block text-[11px] font-semibold text-slate-700 whitespace-nowrap">
        Выберите проект для очистки
      </label>
      <select
        value={selectedPurgeFacility?.id || ''}
        onChange={(e) => setSelectedPurgeFacilityId(e.target.value)}
        className="w-full h-8 px-2.5 bg-white border border-slate-300 rounded-md text-xs font-semibold text-slate-900"
      >
        {facilities.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </div>

    {selectedPurgeFacility && (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
          <div className="text-[10px] text-slate-500">Сварные стыки</div>
          <div className="font-mono font-bold text-sm text-red-700 tabular-nums">
            {purgePreviewCounts.joints}
          </div>
        </div>
        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
          <div className="text-[10px] text-slate-500">Линии лайнлиста</div>
          <div className="font-mono font-bold text-sm text-red-700 tabular-nums">
            {purgePreviewCounts.lines}
          </div>
        </div>
        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
          <div className="text-[10px] text-slate-500">Позиции ЛРВ</div>
          <div className="font-mono font-bold text-sm text-red-700 tabular-nums">
            {purgePreviewCounts.lrv}
          </div>
        </div>
        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
          <div className="text-[10px] text-slate-500">Заявки НК</div>
          <div className="font-mono font-bold text-sm text-red-700 tabular-nums">
            {purgePreviewCounts.labRequests}
          </div>
        </div>
      </div>
    )}

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
      <div className="space-y-1">
        <label className="block text-[11px] font-semibold text-slate-700 whitespace-nowrap">
          Введите точное название проекта
        </label>
        <input
          type="text"
          required
          value={purgeConfirmName}
          onChange={(e) => setPurgeConfirmName(e.target.value)}
          placeholder={selectedPurgeFacility?.name || 'Название объекта'}
          className="w-full h-8 px-2.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-[11px] font-semibold text-slate-700 whitespace-nowrap">
          Пароль суперадмина
        </label>
        <input
          type="password"
          required
          value={purgePassword}
          onChange={(e) => setPurgePassword(e.target.value)}
          placeholder="Подтверждение паролем"
          className="w-full h-8 px-2.5 bg-white border border-slate-300 rounded-md text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
        />
      </div>
    </div>

    <div className="flex items-center justify-between gap-3 pt-1">
      <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
        <span>Событие будет записано в неизменяемый журнал аудита</span>
      </div>
      <button
        type="submit"
        disabled={purgeLoading || !selectedPurgeFacility}
        className="h-8 px-4 rounded-md bg-red-600 hover:bg-red-700 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
      >
        <Trash2 className="w-3.5 h-3.5" />
        <span>{purgeLoading ? 'Очистка...' : 'Очистить данные проекта'}</span>
      </button>
    </div>
  </form>

  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2.5">
    <Terminal className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
    <div className="text-[11px] text-slate-600 leading-relaxed">
      Полный сброс всей базы данных через веб-интерфейс отключён в целях безопасности. Для полного переинициализирования стенда используйте CLI-утилиту на сервере с обязательным авто-дампом:{' '}
      <code className="font-mono font-semibold text-slate-900">
        python -m app.cli.reset_db --confirm
      </code>
    </div>
  </div>
</div>
  );
};
