import React from 'react';
import { Check, ShieldCheck, X } from 'lucide-react';

export interface CustomStationDraft {
  name: string;
  deviceModel: string;
  verificationCertNumber: string;
  verificationValidUntil: string;
  region: string;
}

export interface FacilityCustomStationFormProps {
  isOpen: boolean;
  newCustomStation: CustomStationDraft;
  setNewCustomStation: React.Dispatch<React.SetStateAction<CustomStationDraft>>;
  onClose: () => void;
  onSave: (e: React.FormEvent) => void;
}

export const FacilityCustomStationForm: React.FC<FacilityCustomStationFormProps> = ({
  isOpen,
  newCustomStation,
  setNewCustomStation,
  onClose,
  onSave: handleSaveCustomStation,
}) => {
  if (!isOpen) return null;
  const setShowAddCustomModal = (val: boolean) => {
    if (!val) onClose();
  };
  return (
  <form
    onSubmit={handleSaveCustomStation}
    className="p-3 bg-emerald-50/90 rounded-xl border border-emerald-300 space-y-2.5 animate-in fade-in zoom-in-95"
  >
    <div className="flex items-center justify-between">
      <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
        <ShieldCheck className="w-4 h-4 text-emerald-700" />
        <span>Регистрация ведомственного метеопоста площадки</span>
      </span>
      <button
        type="button"
        onClick={() => setShowAddCustomModal(false)}
        className="text-slate-400 hover:text-slate-700 cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
      <div>
        <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
          Наименование поста:
        </label>
        <input
          type="text"
          value={newCustomStation.name}
          onChange={(e) =>
            setNewCustomStation({ ...newCustomStation, name: e.target.value })
          }
          placeholder="напр. АМК КС-4 Воркутинская"
          required
          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
        />
      </div>
      <div>
        <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
          Модель средства измерений:
        </label>
        <input
          type="text"
          value={newCustomStation.deviceModel}
          onChange={(e) =>
            setNewCustomStation({ ...newCustomStation, deviceModel: e.target.value })
          }
          placeholder="Метеокомплекс АМК-03"
          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
        />
      </div>
      <div>
        <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
          № свидетельства о поверке:
        </label>
        <input
          type="text"
          value={newCustomStation.verificationCertNumber}
          onChange={(e) =>
            setNewCustomStation({
              ...newCustomStation,
              verificationCertNumber: e.target.value,
            })
          }
          placeholder="№ СП-2026/8841 (ФГИС АРШИН)"
          required
          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
        />
      </div>
      <div>
        <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
          Поверка действительна до:
        </label>
        <input
          type="date"
          value={newCustomStation.verificationValidUntil}
          onChange={(e) =>
            setNewCustomStation({
              ...newCustomStation,
              verificationValidUntil: e.target.value,
            })
          }
          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
        />
      </div>
    </div>
    <div className="flex items-center justify-end gap-2 pt-1">
      <button
        type="button"
        onClick={() => setShowAddCustomModal(false)}
        className="px-3 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-medium cursor-pointer"
      >
        Отмена
      </button>
      <button
        type="submit"
        className="px-3 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer flex items-center gap-1"
      >
        <Check className="w-3.5 h-3.5" />
        <span>Зарегистрировать и привязать к объекту</span>
      </button>
    </div>
  </form>
  );
};
