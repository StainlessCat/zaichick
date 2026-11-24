import { useModalDismiss } from '../../hooks/useModalDismiss';
import React, { useState } from 'react';
import { FilePlus2, X, AlertTriangle } from 'lucide-react';
import { MaterialBatchAct } from '../../types/materialControl';
import { LRVItem } from '../../types/welding';
import { Button } from '../ui';

interface AddIncomingControlActModalProps {
  isOpen: boolean;
  onClose: () => void;
  material: LRVItem;
  onAddAct: (material: LRVItem, newBatch: MaterialBatchAct) => void;
}

export const AddIncomingControlActModal: React.FC<AddIncomingControlActModalProps> = ({
  isOpen,
  onClose,
  material,
  onAddAct,
}) => {
  if (!isOpen) return null;

  const totalSpec = material.totalSpecQty ?? material.specQty;
  const currentAccepted = material.acceptedQty ?? 0;
  const currentRejected = material.rejectedQty ?? 0;
  const currentReplaced = material.replacedQty ?? 0;
  const remainingQty = Math.max(0, totalSpec - (currentAccepted + currentRejected + currentReplaced));

  const [actNumber, setActNumber] = useState(`АВК-${Math.floor(100 + Math.random() * 900)}`);
  const [actDate, setActDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [certificateNumber, setCertificateNumber] = useState('');
  const [heatNumber, setHeatNumber] = useState('');
  const [quantity, setQuantity] = useState<number>(remainingQty > 0 ? remainingQty : 1);
  const [unit, setUnit] = useState<'шт' | 'м'>(() => (material.unit === 'м' ? 'м' : 'шт'));
  const [serialNumbers, setSerialNumbers] = useState('');
  const [verdict, setVerdict] = useState<'accepted' | 'rejected'>('accepted');
  const [inspectorName, setInspectorName] = useState('Орлова Е. В.');
  const [rejectionReason, setRejectionReason] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  const isDirty = Boolean(certificateNumber.trim() || heatNumber.trim() || serialNumbers.trim() || notes.trim());

  const { handleRequestClose } = useModalDismiss({
    isOpen,
    isDirty,
    onClose,
    confirmMessage: 'В форме акта входного контроля есть несохранённые данные. Закрыть без сохранения?',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!actNumber.trim()) {
      setFormError('Укажите номер акта входного контроля');
      return;
    }
    if (!actDate.trim()) {
      setFormError('Укажите дату подписания акта входного контроля');
      return;
    }
    if (quantity <= 0) {
      setFormError('Количество в партии должно быть больше нуля');
      return;
    }
    if (verdict === 'rejected' && !rejectionReason.trim()) {
      setFormError('При отбраковке укажите причину в поле «Причина отбраковки»');
      return;
    }

    const serials = serialNumbers
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const certs = certificateNumber
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
      .join(', ');

    const newBatch: MaterialBatchAct = {
      id: `batch-${Date.now()}`,
      materialId: material.id,
      actNumber: actNumber.trim(),
      actDate: actDate.trim(),
      certificateNumber: certs || certificateNumber.trim(),
      heatNumber: heatNumber.trim() || undefined,
      serialNumbers: serials.length > 0 ? serials : undefined,
      quantity,
      unit,
      verdict,
      inspectorName: inspectorName.trim() || undefined,
      rejectionReason: verdict === 'rejected' ? rejectionReason.trim() : undefined,
      notes: notes.trim() || undefined,
    };

    onAddAct(material, newBatch);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Шапка */}
        <div className="bg-[#1e3799] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FilePlus2 className="w-5 h-5 text-blue-200" />
            <div>
              <h3 className="font-bold text-base">Внесение акта входного контроля</h3>
              <p className="text-xs text-blue-100">
                {material.lrvCode} — {material.shortName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Форма */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs text-slate-800">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-rose-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label htmlFor="modalActNumberInput" className="block text-slate-600 text-[11px] mb-1 font-semibold">
                Номер акта входного контроля:
              </label>
              <input
                id="modalActNumberInput"
                type="text"
                value={actNumber}
                onChange={(e) => setActNumber(e.target.value)}
                placeholder="АВК-105"
                className="w-full px-2.5 py-1.5 text-xs font-mono font-bold text-[#1e3799] rounded border border-slate-300 focus:ring-1 focus:ring-[#1e3799]"
              />
            </div>

            <div>
              <label htmlFor="modalActDateInput" className="block text-slate-600 text-[11px] mb-1 font-semibold">
                Дата подписания акта:
              </label>
              <input
                id="modalActDateInput"
                type="date"
                value={actDate}
                onChange={(e) => setActDate(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 focus:ring-1 focus:ring-[#1e3799]"
              />
            </div>

            <div>
              <label htmlFor="modalCertNumberInput" className="block text-slate-600 text-[11px] mb-1 font-medium">
                Сертификаты и паспорта через запятую:
              </label>
              <input
                id="modalCertNumberInput"
                type="text"
                value={certificateNumber}
                onChange={(e) => setCertificateNumber(e.target.value)}
                placeholder="4511/ТПА, 4512/ТПА"
                className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 focus:ring-1 focus:ring-[#1e3799]"
              />
            </div>

            <div>
              <label htmlFor="modalHeatNumberInput" className="block text-slate-600 text-[11px] mb-1 font-medium">
                Номер плавки / партии:
              </label>
              <input
                id="modalHeatNumberInput"
                type="text"
                value={heatNumber}
                onChange={(e) => setHeatNumber(e.target.value)}
                placeholder="Пл. 45802"
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-1 focus:ring-[#1e3799]"
              />
            </div>

            <div>
              <label htmlFor="modalQuantityInput" className="block text-slate-600 text-[11px] mb-1 font-semibold">
                Количество в партии:
              </label>
              <div className="flex gap-2">
                <input
                  id="modalQuantityInput"
                  type="number"
                  min={0.01}
                  step="any"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="flex-1 px-2.5 py-1.5 text-xs font-mono font-bold rounded border border-slate-300 focus:ring-1 focus:ring-[#1e3799]"
                />
                <select
                  id="modalUnitSelect"
                  aria-label="Единица измерения количества"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as 'шт' | 'м')}
                  className="w-20 px-2.5 py-1.5 text-xs font-semibold rounded border border-slate-300 bg-white focus:ring-1 focus:ring-[#1e3799]"
                >
                  <option value="шт">шт</option>
                  <option value="м">м</option>
                </select>
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Не закрыто актами по проекту: {remainingQty} {unit}
              </span>
            </div>

            <div>
              <label htmlFor="modalVerdictSelect" className="block text-slate-600 text-[11px] mb-1 font-semibold">
                Результат контроля:
              </label>
              <select
                id="modalVerdictSelect"
                value={verdict}
                onChange={(e) => setVerdict(e.target.value as 'accepted' | 'rejected')}
                className="w-full px-2.5 py-1.5 text-xs font-semibold rounded border border-slate-300 bg-white focus:ring-1 focus:ring-[#1e3799]"
              >
                <option value="accepted">Пройден</option>
                <option value="rejected">Не пройден</option>
              </select>
            </div>

            <div className="col-span-1 md:col-span-2">
              <label htmlFor="modalSerialNumbersInput" className="block text-slate-600 text-[11px] mb-1 font-medium">
                Заводские серийные номера (через запятую):
              </label>
              <input
                id="modalSerialNumbersInput"
                type="text"
                value={serialNumbers}
                onChange={(e) => setSerialNumbers(e.target.value)}
                placeholder="КШ-001, КШ-002, КШ-003"
                className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 focus:ring-1 focus:ring-[#1e3799]"
              />
            </div>

            <div>
              <label htmlFor="modalInspectorNameInput" className="block text-slate-600 text-[11px] mb-1 font-medium">
                Контролёр / дефектоскопист:
              </label>
              <input
                id="modalInspectorNameInput"
                type="text"
                value={inspectorName}
                onChange={(e) => setInspectorName(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-1 focus:ring-[#1e3799]"
              />
            </div>

            <div>
              <label htmlFor="modalNotesInput" className="block text-slate-600 text-[11px] mb-1 font-medium">
                Примечания:
              </label>
              <input
                id="modalNotesInput"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Визуальный и измерительный контроль пройден"
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-1 focus:ring-[#1e3799]"
              />
            </div>

            {verdict === 'rejected' && (
              <div className="col-span-1 md:col-span-2">
                <label htmlFor="modalRejectionReasonInput" className="block text-rose-700 text-[11px] mb-1 font-semibold">
                  Причина отбраковки:
                </label>
                <textarea
                  id="modalRejectionReasonInput"
                  rows={2}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Негерметичность уплотнения затвора при гидравлических испытаниях"
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-rose-300 bg-rose-50/50 focus:ring-1 focus:ring-rose-500"
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <Button
              type="button"
              variant="secondary"
              onClick={handleRequestClose}
              className="text-xs text-slate-700"
            >
              Отмена
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="text-xs bg-[#1e3799] hover:bg-[#15286e] text-white flex items-center gap-1.5"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              <span>Сохранить акт</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
