import { useModalDismiss } from '../../hooks/useModalDismiss';
import React, { useState } from 'react';
import {
  AlertTriangle,
  FileCheck2,
  FileText,
  Package,
  RefreshCw,
  X,
} from 'lucide-react';
import { MaterialBatchAct } from '../../types/materialControl';
import { LRVItem } from '../../types/welding';
import { Button } from '../ui';

interface MaterialPartialReplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  material: LRVItem;
  batch: MaterialBatchAct;
  onConfirmReplacement: (params: {
    originalMaterial: LRVItem;
    rejectedBatchId: string;
    replacedQuantity: number;
    letterNumber: string;
    letterDate: string;
    approvedBy: string;
    reason: string;
    replacementCustomFields: {
      lrvCode: string;
      shortName: string;
      material: string;
      ntd: string;
      manufacturer?: string;
      replacementBatch: {
        actNumber: string;
        actDate: string;
        certificateNumber: string;
        serialNumbers?: string[];
        verdict: 'accepted';
        inspectorName?: string;
        notes?: string;
      };
    };
  }) => void;
}

export const MaterialPartialReplaceModal: React.FC<MaterialPartialReplaceModalProps> = ({
  isOpen,
  onClose,
  material,
  batch,
  onConfirmReplacement,
}) => {
  const isDirty = Boolean(decisionLetterNumber.trim() || (reason && reason !== 'other'));

  const { handleRequestClose } = useModalDismiss({
    isOpen,
    isDirty,
    onClose,
    confirmMessage: 'В форме замены материала есть несохранённые данные. Закрыть без сохранения?',
  });

  if (!isOpen) return null;

  // Количество на замену
  const [replaceQty, setReplaceQty] = useState<number>(batch.quantity || 1);

  // Реквизиты письма
  const [letterNumber, setLetterNumber] = useState('Письмо № 284/ГИП');
  const [letterDate, setLetterDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [approvedBy, setApprovedBy] = useState('ООО «ПроектИнжиниринг»');
  const [reason, setReason] = useState(
    batch.rejectionReason || 'Отбраковка единицы при входном контроле. Замена на аналог из складского резерва.'
  );

  // Параметры заменяющего элемента
  const defaultSuffix = '.З1';
  const [replLrvCode, setReplLrvCode] = useState(`${material.lrvCode}${defaultSuffix}`);
  const [replShortName, setReplShortName] = useState(
    `${material.shortName} — замена по письму`
  );
  const [replMaterial, setReplMaterial] = useState(material.material);
  const [replNtd, setReplNtd] = useState(material.ntd);
  const [replManufacturer, setReplManufacturer] = useState('ПАО «Пензтяжпромарматура»');

  // Входной контроль заменяющего элемента из наличия
  const [replActNumber, setReplActNumber] = useState('АВК-122');
  const [replActDate, setReplActDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [replCertNumber, setReplCertNumber] = useState('3310-Р');
  const [replSerialNumbers, setReplSerialNumbers] = useState('КШ-РЕЗЕРВ-07');
  const [replInspectorName, setReplInspectorName] = useState('Лебедев К. М.');

  const [formError, setFormError] = useState('');

  const totalSpec = material.totalSpecQty ?? material.specQty;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (replaceQty <= 0) {
      setFormError('Количество на замену должно быть больше нуля');
      return;
    }
    if (replaceQty > batch.quantity) {
      setFormError(`Количество на замену не может превышать объём партии: ${batch.quantity} ${batch.unit}`);
      return;
    }
    if (!letterNumber.trim()) {
      setFormError('Укажите номер официального письма согласования');
      return;
    }
    if (!letterDate.trim()) {
      setFormError('Укажите дату письма согласования');
      return;
    }
    if (!replActNumber.trim()) {
      setFormError('Укажите номер акта входного контроля на заменяющий элемент');
      return;
    }

    const serials = replSerialNumbers
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    onConfirmReplacement({
      originalMaterial: material,
      rejectedBatchId: batch.id,
      replacedQuantity: replaceQty,
      letterNumber: letterNumber.trim(),
      letterDate: letterDate.trim(),
      approvedBy: approvedBy.trim(),
      reason: reason.trim(),
      replacementCustomFields: {
        lrvCode: replLrvCode.trim(),
        shortName: replShortName.trim(),
        material: replMaterial.trim(),
        ntd: replNtd.trim(),
        manufacturer: replManufacturer.trim(),
        replacementBatch: {
          actNumber: replActNumber.trim(),
          actDate: replActDate.trim(),
          certificateNumber: replCertNumber.trim(),
          serialNumbers: serials.length > 0 ? serials : undefined,
          verdict: 'accepted',
          inspectorName: replInspectorName.trim(),
          notes: `Замена единицы по письму ${letterNumber.trim()}`,
        },
      },
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Шапка диалога */}
        <div className="bg-[#1e3799] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <RefreshCw className="w-5 h-5 text-blue-200" />
            <div>
              <h3 className="font-bold text-base">Согласование замены материала</h3>
              <p className="text-xs text-blue-100">
                Оформление частичной или полной замены позиции спецификации по официальному письму
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
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-800">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-rose-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Блок 1: Сведения об отбраковке */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Package className="w-4 h-4 text-[#1e3799]" />
                Исходная проектная позиция
              </span>
              <span className="font-mono font-bold text-[#1e3799]">{material.lrvCode}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-700">
              <div>
                <span className="text-slate-500 block text-[11px]">Элемент:</span>
                <span className="font-semibold">{material.shortName}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Шифр РД:</span>
                <span className="font-mono">{material.rdCode}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Забракованная партия / акт:</span>
                <span className="font-mono font-semibold text-rose-700">
                  {batch.actNumber} от {batch.actDate}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Серийные номера:</span>
                <span className="font-mono">{batch.serialNumbers?.join(', ') || '—'}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 flex items-center gap-4">
              <label htmlFor="replaceQtyInput" className="font-semibold text-slate-900">
                Количество на замену, {batch.unit}:
              </label>
              <input
                id="replaceQtyInput"
                type="number"
                min={1}
                max={batch.quantity}
                value={replaceQty}
                onChange={(e) => setReplaceQty(Number(e.target.value))}
                className="w-24 px-2.5 py-1.5 text-xs font-mono font-bold rounded border border-slate-300 focus:ring-1 focus:ring-[#1e3799] focus:border-[#1e3799]"
              />
              <span className="text-slate-500 text-[11px]">
                Остаток годных изделий по спецификации: {totalSpec - replaceQty} {material.unit}
              </span>
            </div>
          </div>

          {/* Блок 2: Официальное письмо согласования */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            <span className="font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-indigo-600" />
              Реквизиты согласования
            </span>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label htmlFor="letterNumberInput" className="block text-slate-600 text-[11px] mb-1 font-medium">
                  Номер письма:
                </label>
                <input
                  id="letterNumberInput"
                  type="text"
                  value={letterNumber}
                  onChange={(e) => setLetterNumber(e.target.value)}
                  placeholder="Письмо № 284/ГИП"
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-1 focus:ring-[#1e3799]"
                />
              </div>

              <div>
                <label htmlFor="letterDateInput" className="block text-slate-600 text-[11px] mb-1 font-medium">
                  Дата письма:
                </label>
                <input
                  id="letterDateInput"
                  type="date"
                  value={letterDate}
                  onChange={(e) => setLetterDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 focus:ring-1 focus:ring-[#1e3799]"
                />
              </div>

              <div>
                <label htmlFor="approvedByInput" className="block text-slate-600 text-[11px] mb-1 font-medium">
                  Согласующая сторона:
                </label>
                <input
                  id="approvedByInput"
                  type="text"
                  value={approvedBy}
                  onChange={(e) => setApprovedBy(e.target.value)}
                  placeholder="ООО «ПроектИнжиниринг»"
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-1 focus:ring-[#1e3799]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="reasonInput" className="block text-slate-600 text-[11px] mb-1 font-medium">
                Причина и обоснование замены:
              </label>
              <textarea
                id="reasonInput"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-1 focus:ring-[#1e3799]"
              />
            </div>
          </div>

          {/* Блок 3: Заменяющий элемент и его входной контроль */}
          <div className="bg-emerald-50/50 border border-emerald-200 rounded-lg p-4 space-y-3">
            <span className="font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
              <FileCheck2 className="w-4 h-4 text-emerald-700" />
              Заменяющий элемент из наличия и акт входного контроля
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label htmlFor="replLrvCodeInput" className="block text-slate-600 text-[11px] mb-1 font-medium">
                  Код заменяющей позиции:
                </label>
                <input
                  id="replLrvCodeInput"
                  type="text"
                  value={replLrvCode}
                  onChange={(e) => setReplLrvCode(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono font-bold text-[#1e3799] rounded border border-slate-300 focus:ring-1 focus:ring-[#1e3799]"
                />
              </div>

              <div>
                <label htmlFor="replShortNameInput" className="block text-slate-600 text-[11px] mb-1 font-medium">
                  Наименование элемента:
                </label>
                <input
                  id="replShortNameInput"
                  type="text"
                  value={replShortName}
                  onChange={(e) => setReplShortName(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-1 focus:ring-[#1e3799]"
                />
              </div>

              <div>
                <label htmlFor="replMaterialInput" className="block text-slate-600 text-[11px] mb-1 font-medium">
                  Марка стали:
                </label>
                <input
                  id="replMaterialInput"
                  type="text"
                  value={replMaterial}
                  onChange={(e) => setReplMaterial(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 focus:ring-1 focus:ring-[#1e3799]"
                />
              </div>

              <div>
                <label htmlFor="replManufacturerInput" className="block text-slate-600 text-[11px] mb-1 font-medium">
                  Завод-изготовитель:
                </label>
                <input
                  id="replManufacturerInput"
                  type="text"
                  value={replManufacturer}
                  onChange={(e) => setReplManufacturer(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-1 focus:ring-[#1e3799]"
                />
              </div>

              <div>
                <label htmlFor="replActNumberInput" className="block text-slate-600 text-[11px] mb-1 font-medium">
                  Акт входного контроля заменяющего элемента:
                </label>
                <input
                  id="replActNumberInput"
                  type="text"
                  value={replActNumber}
                  onChange={(e) => setReplActNumber(e.target.value)}
                  placeholder="АВК-122"
                  className="w-full px-2.5 py-1.5 text-xs font-mono font-bold text-emerald-800 rounded border border-slate-300 focus:ring-1 focus:ring-[#1e3799]"
                />
              </div>

              <div>
                <label htmlFor="replActDateInput" className="block text-slate-600 text-[11px] mb-1 font-medium">
                  Дата акта входного контроля:
                </label>
                <input
                  id="replActDateInput"
                  type="date"
                  value={replActDate}
                  onChange={(e) => setReplActDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 focus:ring-1 focus:ring-[#1e3799]"
                />
              </div>

              <div>
                <label htmlFor="replCertNumberInput" className="block text-slate-600 text-[11px] mb-1 font-medium">
                  Сертификат / паспорт качества:
                </label>
                <input
                  id="replCertNumberInput"
                  type="text"
                  value={replCertNumber}
                  onChange={(e) => setReplCertNumber(e.target.value)}
                  placeholder="3310-Р"
                  className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 focus:ring-1 focus:ring-[#1e3799]"
                />
              </div>

              <div>
                <label htmlFor="replSerialNumbersInput" className="block text-slate-600 text-[11px] mb-1 font-medium">
                  Заводской номер изделия:
                </label>
                <input
                  id="replSerialNumbersInput"
                  type="text"
                  value={replSerialNumbers}
                  onChange={(e) => setReplSerialNumbers(e.target.value)}
                  placeholder="КШ-РЕЗЕРВ-07"
                  className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-slate-300 focus:ring-1 focus:ring-[#1e3799]"
                />
              </div>
            </div>
          </div>

          {/* Подвал с кнопками */}
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
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Утвердить замену</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
