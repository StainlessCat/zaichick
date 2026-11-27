import React, { useEffect, useState } from 'react';
import { FileText, Save, X } from 'lucide-react';
import { Button } from '../ui';
import { JournalTitleMeta } from './types';

interface JournalMetaModalProps {
  initialMeta: JournalTitleMeta;
  objectLabel: string;
  onSave: (meta: JournalTitleMeta) => void;
  onClose: () => void;
}

export const JournalMetaModal: React.FC<JournalMetaModalProps> = ({
  initialMeta,
  objectLabel,
  onSave,
  onClose,
}) => {
  const [draft, setDraft] = useState<JournalTitleMeta>(initialMeta);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      journalNumber: draft.journalNumber.trim(),
      customerName: draft.customerName.trim(),
      contractorName: draft.contractorName.trim(),
      responsibleKeeper: draft.responsibleKeeper.trim(),
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[1px] p-4 no-print"
      role="dialog"
      aria-modal="true"
      aria-labelledby="journal-meta-modal-title"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 bg-[#f8fafd] border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#e8f1fc] text-[#1e3799] flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3
                id="journal-meta-modal-title"
                className="text-sm font-bold text-slate-900 truncate"
              >
                Титульные реквизиты журнала
              </h3>
              <p className="text-[11px] text-slate-500 truncate">
                Объект: {objectLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            aria-label="Закрыть окно"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs">
          <p className="text-[11px] text-slate-600 leading-relaxed">
            Реквизиты выводятся в шапке бланка, на печатной форме и на отдельном листе книги Excel. Сохраняются отдельно для каждого объекта строительства.
          </p>

          <div className="space-y-1">
            <label
              htmlFor="journal-meta-number"
              className="block font-semibold text-slate-700"
            >
              Номер журнала
            </label>
            <input
              id="journal-meta-number"
              type="text"
              value={draft.journalNumber}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, journalNumber: e.target.value }))
              }
              placeholder="Например: ЖСР-01/2026"
              maxLength={80}
              className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#1e3799] focus:ring-1 focus:ring-[#1e3799]"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="journal-meta-customer"
              className="block font-semibold text-slate-700"
            >
              Заказчик
            </label>
            <input
              id="journal-meta-customer"
              type="text"
              value={draft.customerName}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, customerName: e.target.value }))
              }
              placeholder="Наименование организации заказчика"
              maxLength={200}
              className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#1e3799] focus:ring-1 focus:ring-[#1e3799]"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="journal-meta-contractor"
              className="block font-semibold text-slate-700"
            >
              Подрядчик
            </label>
            <input
              id="journal-meta-contractor"
              type="text"
              value={draft.contractorName}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, contractorName: e.target.value }))
              }
              placeholder="Наименование строительно-монтажной организации"
              maxLength={200}
              className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#1e3799] focus:ring-1 focus:ring-[#1e3799]"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="journal-meta-keeper"
              className="block font-semibold text-slate-700"
            >
              Ответственный за ведение журнала
            </label>
            <input
              id="journal-meta-keeper"
              type="text"
              value={draft.responsibleKeeper}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  responsibleKeeper: e.target.value,
                }))
              }
              placeholder="Должность, Ф.И.О."
              maxLength={160}
              className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#1e3799] focus:ring-1 focus:ring-[#1e3799]"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" variant="primary">
              <Save className="w-3.5 h-3.5" />
              <span>Сохранить реквизиты</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
