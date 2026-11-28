import React from 'react';
import { Check, FileSpreadsheet, FileText, X } from 'lucide-react';
import type { UgmsImportResult } from '../../utils/weatherService';

export interface UgmsFormState {
  docNumber: string;
  docDate: string;
  issuer: string;
  csvText: string;
}

export interface FacilityUgmsImportPanelProps {
  isOpen: boolean;
  ugmsForm: UgmsFormState;
  setUgmsForm: React.Dispatch<React.SetStateAction<UgmsFormState>>;
  ugmsParseResult: UgmsImportResult | null;
  onClose: () => void;
  onParseText: () => void;
  onApplyCertificate: () => void;
}

export const FacilityUgmsImportPanel: React.FC<FacilityUgmsImportPanelProps> = ({
  isOpen,
  ugmsForm,
  setUgmsForm,
  ugmsParseResult,
  onClose,
  onParseText: handleParseUgmsText,
  onApplyCertificate: handleApplyUgmsCertificate,
}) => {
  if (!isOpen) return null;
  const setShowUgmsModal = (val: boolean) => {
    if (!val) onClose();
  };
  return (
  <div className="p-3 bg-indigo-50/90 rounded-xl border border-indigo-300 space-y-2.5 animate-in fade-in zoom-in-95">
    <div className="flex items-center justify-between">
      <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
        <FileText className="w-4 h-4 text-indigo-700" />
        <span>Импорт ведомости температур по справке УГМС Росгидромета</span>
      </span>
      <button
        type="button"
        onClick={() => setShowUgmsModal(false)}
        className="text-slate-400 hover:text-slate-700 cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
      <div>
        <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
          № справки УГМС:
        </label>
        <input
          type="text"
          value={ugmsForm.docNumber}
          onChange={(e) => setUgmsForm({ ...ugmsForm, docNumber: e.target.value })}
          placeholder="напр. 412-С"
          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
        />
      </div>
      <div>
        <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
          Дата справки:
        </label>
        <input
          type="date"
          value={ugmsForm.docDate}
          onChange={(e) => setUgmsForm({ ...ugmsForm, docDate: e.target.value })}
          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
        />
      </div>
      <div>
        <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
          Кем выдана:
        </label>
        <input
          type="text"
          value={ugmsForm.issuer}
          onChange={(e) => setUgmsForm({ ...ugmsForm, issuer: e.target.value })}
          placeholder="ФГБУ Северное УГМС"
          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
        />
      </div>
    </div>
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] font-bold text-slate-700">
          Строки ведомости (Дата; Температура):
        </label>
        <span className="text-[10px] text-slate-500 font-mono">
          ГГГГ-ММ-ДД; +18.2 или ДД.ММ.ГГГГ; 18,2
        </span>
      </div>
      <textarea
        rows={3}
        value={ugmsForm.csvText}
        onChange={(e) => setUgmsForm({ ...ugmsForm, csvText: e.target.value })}
        placeholder={`2026-06-15; +18.2\n2026-06-16; +19.4\n2026-06-17; +17.8`}
        className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono"
      />
    </div>
    <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
      <button
        type="button"
        onClick={handleParseUgmsText}
        className="px-3 py-1 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold cursor-pointer"
      >
        Распознать ведомость
      </button>

      {ugmsParseResult && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded border border-emerald-300">
            Распознано: {ugmsParseResult.parsedCount} дат
          </span>
          {ugmsParseResult.parsedCount > 0 && (
            <button
              type="button"
              onClick={handleApplyUgmsCertificate}
              className="px-3 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Применить к объекту и архиву</span>
            </button>
          )}
        </div>
      )}
    </div>
  </div>
  );
};
