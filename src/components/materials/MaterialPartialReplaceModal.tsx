import React, { useEffect, useState } from 'react';
import { X, ArrowRightLeft, FileCheck2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import { MaterialBatchAct, MaterialItemWithControl } from '../../types/materialControl';
import { LRVItem } from '../../types/welding';
import { splitMaterialForPartialReplacement } from '../../utils/materialControlLogic';

interface MaterialPartialReplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalMaterial: LRVItem | MaterialItemWithControl;
  rejectedBatch: MaterialBatchAct;
  defaultInspectorName?: string;
  onConfirmReplacement: (result: {
    updatedOriginal: MaterialItemWithControl;
    replacementItem: MaterialItemWithControl;
  }) => void;
}

export const MaterialPartialReplaceModal: React.FC<MaterialPartialReplaceModalProps> = ({
  isOpen,
  onClose,
  originalMaterial,
  rejectedBatch,
  defaultInspectorName = '',
  onConfirmReplacement,
}) => {
  const [letterNumber, setLetterNumber] = useState('');
  const [letterDate, setLetterDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [approvedBy, setApprovedBy] = useState('');
  const [reason, setReason] = useState('');

  const [newLrvCode, setNewLrvCode] = useState('');
  const [newShortName, setNewShortName] = useState('');
  const [newMaterial, setNewMaterial] = useState('');
  const [newNtd, setNewNtd] = useState('');
  const [newManufacturer, setNewManufacturer] = useState('');

  const [newActNumber, setNewActNumber] = useState('');
  const [newActDate, setNewActDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newCertNumber, setNewCertNumber] = useState('');
  const [newSerialNumber, setNewSerialNumber] = useState('');
  const [inspectorName, setInspectorName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);
    setLetterNumber('');
    setLetterDate(new Date().toISOString().slice(0, 10));
    setApprovedBy('');
    setReason(rejectedBatch.rejectionReason || '');
    setNewLrvCode(`${originalMaterial.lrvCode}.З1`);
    setNewShortName(`${originalMaterial.shortName} — замена`);
    setNewMaterial(originalMaterial.material || '');
    setNewNtd(originalMaterial.ntd || '');
    setNewManufacturer(originalMaterial.manufacturer || '');
    setNewActNumber('');
    setNewActDate(new Date().toISOString().slice(0, 10));
    setNewCertNumber('');
    setNewSerialNumber('');
    setInspectorName(defaultInspectorName);
  }, [isOpen, originalMaterial, rejectedBatch, defaultInspectorName]);

  const isDirty = Boolean(
    letterNumber.trim() ||
      approvedBy.trim() ||
      newActNumber.trim() ||
      newCertNumber.trim() ||
      newSerialNumber.trim()
  );

  const { handleRequestClose } = useModalDismiss({
    isOpen,
    isDirty,
    onClose,
    confirmMessage: 'В форме оформления замены есть несохранённые данные. Закрыть окно?',
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!letterNumber.trim()) {
      setErrorMessage('Укажите номер письма или акта пересогласования замены.');
      return;
    }
    if (!newLrvCode.trim()) {
      setErrorMessage('Укажите новый код ЛРВ для заменяемой позиции.');
      return;
    }
    if (!newShortName.trim()) {
      setErrorMessage('Укажите наименование нового элемента.');
      return;
    }
    if (!newActNumber.trim()) {
      setErrorMessage('Укажите номер акта входного контроля новой партии.');
      return;
    }

    const result = splitMaterialForPartialReplacement({
      originalMaterial,
      rejectedBatchId: rejectedBatch.id,
      replacedQuantity: rejectedBatch.quantity,
      replacementNotice: {
        letterNumber: letterNumber.trim(),
        letterDate,
        approvedBy: approvedBy.trim() || 'Проектная организация',
        reason: reason.trim() || 'Отбраковка на входном контроле',
      },
      replacementCustomFields: {
        lrvCode: newLrvCode.trim(),
        shortName: newShortName.trim(),
        material: newMaterial.trim() || originalMaterial.material,
        ntd: newNtd.trim() || originalMaterial.ntd,
        manufacturer: newManufacturer.trim() || originalMaterial.manufacturer,
        replacementBatch: {
          actNumber: newActNumber.trim(),
          actDate: newActDate,
          certificateNumber: newCertNumber.trim(),
          serialNumbers: newSerialNumber
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          verdict: 'accepted',
          inspectorName: inspectorName.trim() || undefined,
          notes: `Поставлено взамен забракованной партии по акту ${rejectedBatch.actNumber}`,
        },
      },
    });

    onConfirmReplacement(result);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Оформление частичной замены материала"
    >
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 bg-[#1e3799] text-white flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-white/15 shrink-0">
              <ArrowRightLeft className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold leading-tight">
                Оформление частичной замены забракованной партии
              </h3>
              <p className="text-xs text-blue-100 mt-0.5 truncate">
                {originalMaterial.lrvCode} — {originalMaterial.shortName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            aria-label="Закрыть окно"
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-3.5 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1 text-rose-900">
              <div className="font-bold">
                Забракованная партия: акт {rejectedBatch.actNumber} · объём {rejectedBatch.quantity}{' '}
                {rejectedBatch.unit}
              </div>
              {rejectedBatch.serialNumbers && rejectedBatch.serialNumbers.length > 0 && (
                <div>
                  Заводские номера:{' '}
                  <span className="font-mono font-semibold">
                    {rejectedBatch.serialNumbers.join(', ')}
                  </span>
                </div>
              )}
              {rejectedBatch.rejectionReason && (
                <div>Причина: {rejectedBatch.rejectionReason}</div>
              )}
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-rose-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="space-y-3">
            <h4 className="font-bold text-slate-800 border-b border-slate-200 pb-1.5">
              1. Основание для замены
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Номер письма согласования
                </label>
                <input
                  type="text"
                  required
                  value={letterNumber}
                  onChange={(e) => setLetterNumber(e.target.value)}
                  placeholder="Письмо 284/ПТО"
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Дата согласования
                </label>
                <input
                  type="date"
                  required
                  value={letterDate}
                  onChange={(e) => setLetterDate(e.target.value)}
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Кем согласовано
                </label>
                <input
                  type="text"
                  value={approvedBy}
                  onChange={(e) => setApprovedBy(e.target.value)}
                  placeholder="Проектный институт / Заказчик"
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799]"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Обоснование замены
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Отбраковка при входном контроле, замена на аналог"
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799]"
              />
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-bold text-slate-800 border-b border-slate-200 pb-1.5">
              2. Новая позиция спецификации
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Новый код ЛРВ
                </label>
                <input
                  type="text"
                  required
                  value={newLrvCode}
                  onChange={(e) => setNewLrvCode(e.target.value)}
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono font-bold text-[#1e3799] focus:outline-none focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799]"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Краткое наименование
                </label>
                <input
                  type="text"
                  required
                  value={newShortName}
                  onChange={(e) => setNewShortName(e.target.value)}
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Марка стали
                </label>
                <input
                  type="text"
                  value={newMaterial}
                  onChange={(e) => setNewMaterial(e.target.value)}
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  НТД
                </label>
                <input
                  type="text"
                  value={newNtd}
                  onChange={(e) => setNewNtd(e.target.value)}
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Завод-изготовитель
                </label>
                <input
                  type="text"
                  value={newManufacturer}
                  onChange={(e) => setNewManufacturer(e.target.value)}
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799]"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-bold text-slate-800 border-b border-slate-200 pb-1.5 flex items-center gap-1.5">
              <FileCheck2 className="w-4 h-4 text-emerald-600" />
              <span>3. Акт входного контроля на заменяющую партию</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Номер акта ВК
                </label>
                <input
                  type="text"
                  required
                  value={newActNumber}
                  onChange={(e) => setNewActNumber(e.target.value)}
                  placeholder="АВК-122"
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Дата акта ВК
                </label>
                <input
                  type="date"
                  required
                  value={newActDate}
                  onChange={(e) => setNewActDate(e.target.value)}
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Сертификат / паспорт
                </label>
                <input
                  type="text"
                  value={newCertNumber}
                  onChange={(e) => setNewCertNumber(e.target.value)}
                  placeholder="3310-П"
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Заводской серийный номер
                </label>
                <input
                  type="text"
                  value={newSerialNumber}
                  onChange={(e) => setNewSerialNumber(e.target.value)}
                  placeholder="КШ-РЕЗЕРВ-07"
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799]"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Контролёр входного контроля
                </label>
                <input
                  type="text"
                  value={inspectorName}
                  onChange={(e) => setInspectorName(e.target.value)}
                  placeholder="Фамилия И. О."
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799]"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={handleRequestClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-[#1e3799] hover:bg-[#15286e] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Оформить замену</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
