import { useModalDismiss } from '../../hooks/useModalDismiss';
import React, { useState } from 'react';
import { Check, Layers, Lock, X } from 'lucide-react';
import { ExecutiveDocStatus, ProjectLineItem } from '../../types/welding';
import { formatDateDDMMYY } from '../../utils/weldingLogic';

interface LineListBulkEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLineIds: string[];
  lineList: ProjectLineItem[];
  onApplyBulk: (patch: Partial<ProjectLineItem>) => void;
}

export const LineListBulkEditModal: React.FC<LineListBulkEditModalProps> = ({
  isOpen,
  onClose,
  selectedLineIds,
  lineList,
  onApplyBulk,
}) => {
  const [bulkEnableQuality, setBulkEnableQuality] = useState(false);
  const [bulkQualityLevel, setBulkQualityLevel] = useState('Уровень А');

  const [bulkEnableCategory, setBulkEnableCategory] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('I (В)');

  const [bulkEnableObject, setBulkEnableObject] = useState(false);
  const [bulkObjectName, setBulkObjectName] = useState('');

  const [bulkEnableRd, setBulkEnableRd] = useState(false);
  const [bulkRdCode, setBulkRdCode] = useState('');

  const [bulkEnableContour, setBulkEnableContour] = useState(false);
  const [bulkTestContour, setBulkTestContour] = useState('');

  const [bulkEnableProduct, setBulkEnableProduct] = useState(false);
  const [bulkProduct, setBulkProduct] = useState('');

  const [bulkEnableNtd, setBulkEnableNtd] = useState(false);
  const [bulkWeldingNtd, setBulkWeldingNtd] = useState('СТО Газпром 15-1.1-002-2023');
  const [bulkControlNtd, setBulkControlNtd] = useState('СТО Газпром 15-1.3-004-2023');

  const [bulkEnableParams, setBulkEnableParams] = useState(false);
  const [bulkPressure, setBulkPressure] = useState('11.8 МПа');
  const [bulkTemperature, setBulkTemperature] = useState('-40...+60 °C');

  const [bulkEnableNdtPct, setBulkEnableNdtPct] = useState(false);
  const [bulkRkPct, setBulkRkPct] = useState(100);
  const [bulkUzkPct, setBulkUzkPct] = useState(100);
  const [bulkPvkPct, setBulkPvkPct] = useState(0);

  const [bulkEnableTestDate, setBulkEnableTestDate] = useState(false);
  const [bulkTestDate, setBulkTestDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  const [bulkEnableIdStatus, setBulkEnableIdStatus] = useState(false);
  const [bulkIdStatus, setBulkIdStatus] = useState<ExecutiveDocStatus>('IN_WORK');

  const [bulkEnableResponsiblePto, setBulkEnableResponsiblePto] = useState(false);
  const [bulkResponsiblePto, setBulkResponsiblePto] = useState('');

  const isDirty = Boolean(
    bulkEnableQuality ||
    bulkEnableCategory ||
    bulkEnableObject ||
    bulkEnableRd ||
    bulkEnableContour ||
    bulkEnableProduct ||
    bulkEnableNtd ||
    bulkEnableParams ||
    bulkEnableNdtPct ||
    bulkEnableTestDate ||
    bulkEnableIdStatus ||
    bulkEnableResponsiblePto
  );

  const { handleRequestClose } = useModalDismiss({
    isOpen,
    isDirty,
    onClose,
    confirmMessage: 'В форме массового редактирования есть не применённые параметры. Закрыть?',
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const patch: Partial<ProjectLineItem> = {};

    if (bulkEnableQuality) patch.qualityLevel = bulkQualityLevel;
    if (bulkEnableCategory) patch.pipelineCategory = bulkCategory.trim();
    if (bulkEnableObject && bulkObjectName.trim()) patch.objectName = bulkObjectName.trim();
    if (bulkEnableRd && bulkRdCode.trim()) patch.rdCode = bulkRdCode.trim();
    if (bulkEnableContour && bulkTestContour.trim()) patch.testContour = bulkTestContour.trim();
    if (bulkEnableProduct && bulkProduct.trim()) patch.product = bulkProduct.trim();
    if (bulkEnableNtd) {
      if (bulkWeldingNtd.trim()) patch.weldingNtd = bulkWeldingNtd.trim();
      if (bulkControlNtd.trim()) patch.controlNtd = bulkControlNtd.trim();
    }
    if (bulkEnableParams) {
      if (bulkPressure.trim()) patch.workingPressure = bulkPressure.trim();
      if (bulkTemperature.trim()) patch.workingTemperature = bulkTemperature.trim();
    }
    if (bulkEnableNdtPct) {
      patch.rkPercent = Number(bulkRkPct);
      patch.uzkPercent = Number(bulkUzkPct);
      patch.pvkPercent = Number(bulkPvkPct);
    }
    if (bulkEnableTestDate) {
      patch.testDate = bulkTestDate;
    }
    if (bulkEnableIdStatus) {
      patch.idStatus = bulkIdStatus;
    }
    if (bulkEnableResponsiblePto) {
      patch.responsiblePto = bulkResponsiblePto.trim();
    }

    onApplyBulk(patch);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Групповое редактирование строк лайнлиста"
    >
      <div
        className="fixed inset-0 bg-slate-900/45 backdrop-blur-[1px]"
        onClick={handleRequestClose}
      />
      <div className="relative z-10 w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-[#1e3799] text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-sky-300" />
            <div>
              <h2 className="font-display text-base font-bold">
                Групповое редактирование строк лайнлиста ({selectedLineIds.length} лин.)
              </h2>
              <p className="text-xs text-sky-200">
                Массовое обновление параметров выбранных линий трубопроводов
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            aria-label="Закрыть групповое редактирование лайнлиста"
            className="p-1.5 rounded-lg text-sky-100 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-6 space-y-4"
        >
          <div className="flex items-start gap-3 p-3 rounded-lg bg-[#e8f1fc] border border-[#1e3799]/25 text-xs text-slate-800">
            <Lock className="w-4 h-4 text-[#1e3799] shrink-0 mt-0.5" />
            <div>
              Индивидуальные номера линий защищены от массовой перезаписи. Выбрано линий:{' '}
              <span className="font-mono font-bold text-[#1e3799]">
                {lineList
                  .filter((l) => selectedLineIds.includes(l.id))
                  .map((l) => l.lineNumber)
                  .join(', ')}
              </span>
            </div>
          </div>

          {/* 1. Уровень качества и Категория трубопровода */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkEnableQuality}
                  onChange={(e) => setBulkEnableQuality(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#1e3799]"
                />
                <span className="text-xs font-bold text-slate-900">
                  Изменить Уровень качества
                </span>
              </label>
              {bulkEnableQuality && (
                <select
                  value={bulkQualityLevel}
                  onChange={(e) => setBulkQualityLevel(e.target.value)}
                  aria-label="Уровень качества для группового изменения"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-semibold text-[#1e3799]"
                >
                  <option value="">— Не указан (пусто) —</option>
                  <option value="Уровень А">Уровень А</option>
                  <option value="Уровень В">Уровень В</option>
                  <option value="Уровень С">Уровень С</option>
                </select>
              )}
            </div>

            <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkEnableCategory}
                  onChange={(e) => setBulkEnableCategory(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#1e3799]"
                />
                <span className="text-xs font-bold text-slate-900">
                  Изменить Категорию трубопровода
                </span>
              </label>
              {bulkEnableCategory && (
                <input
                  type="text"
                  value={bulkCategory}
                  onChange={(e) => setBulkCategory(e.target.value)}
                  placeholder="Оставьте пустым для очистки"
                  aria-label="Категория трубопровода для группового изменения"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                />
              )}
            </div>
          </div>

          {/* 2. Объект, Шифр РД и Контур испытания */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkEnableObject}
                  onChange={(e) => setBulkEnableObject(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#1e3799]"
                />
                <span className="text-xs font-bold text-slate-900">Название объекта</span>
              </label>
              {bulkEnableObject && (
                <input
                  type="text"
                  list="ll-objects-list"
                  value={bulkObjectName}
                  onChange={(e) => setBulkObjectName(e.target.value)}
                  placeholder="Введите или выберите объект"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
                />
              )}
            </div>

            <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkEnableRd}
                  onChange={(e) => setBulkEnableRd(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#1e3799]"
                />
                <span className="text-xs font-bold text-slate-900">Шифр РД</span>
              </label>
              {bulkEnableRd && (
                <input
                  type="text"
                  list="ll-rds-list"
                  value={bulkRdCode}
                  onChange={(e) => setBulkRdCode(e.target.value)}
                  placeholder="Введите или выберите шифр РД"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                />
              )}
            </div>

            <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkEnableContour}
                  onChange={(e) => setBulkEnableContour(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#1e3799]"
                />
                <span className="text-xs font-bold text-slate-900">Контур испытания</span>
              </label>
              {bulkEnableContour && (
                <input
                  type="text"
                  list="ll-contours-list"
                  value={bulkTestContour}
                  onChange={(e) => setBulkTestContour(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
                />
              )}
            </div>
          </div>

          {/* 3. Продукт, НТД и Рабочие параметры */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkEnableProduct}
                  onChange={(e) => setBulkEnableProduct(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#1e3799]"
                />
                <span className="text-xs font-bold text-slate-900">Изменить Продукт</span>
              </label>
              {bulkEnableProduct && (
                <input
                  type="text"
                  value={bulkProduct}
                  onChange={(e) => setBulkProduct(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
                />
              )}
            </div>

            <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkEnableNtd}
                  onChange={(e) => setBulkEnableNtd(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#1e3799]"
                />
                <span className="text-xs font-bold text-slate-900">
                  НТД на сварку и контроль
                </span>
              </label>
              {bulkEnableNtd && (
                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={bulkWeldingNtd}
                    onChange={(e) => setBulkWeldingNtd(e.target.value)}
                    placeholder="НТД на сварку"
                    className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded text-xs"
                  />
                  <input
                    type="text"
                    value={bulkControlNtd}
                    onChange={(e) => setBulkControlNtd(e.target.value)}
                    placeholder="НТД на контроль"
                    className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded text-xs"
                  />
                </div>
              )}
            </div>
          </div>

          {/* 4. Давление/Температура, Проценты НК и Дата испытания */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkEnableParams}
                  onChange={(e) => setBulkEnableParams(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#1e3799]"
                />
                <span className="text-xs font-bold text-slate-900">
                  Давление и Температура
                </span>
              </label>
              {bulkEnableParams && (
                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={bulkPressure}
                    onChange={(e) => setBulkPressure(e.target.value)}
                    placeholder="Давление"
                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
                  />
                  <input
                    type="text"
                    value={bulkTemperature}
                    onChange={(e) => setBulkTemperature(e.target.value)}
                    placeholder="Температура"
                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
                  />
                </div>
              )}
            </div>

            <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkEnableNdtPct}
                  onChange={(e) => setBulkEnableNdtPct(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#1e3799]"
                />
                <span className="text-xs font-bold text-slate-900">
                  % РК / % УЗК / % ПВК
                </span>
              </label>
              {bulkEnableNdtPct && (
                <div className="grid grid-cols-3 gap-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={bulkRkPct}
                    onChange={(e) => setBulkRkPct(Number(e.target.value))}
                    className="px-1.5 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={bulkUzkPct}
                    onChange={(e) => setBulkUzkPct(Number(e.target.value))}
                    className="px-1.5 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={bulkPvkPct}
                    onChange={(e) => setBulkPvkPct(Number(e.target.value))}
                    className="px-1.5 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
                  />
                </div>
              )}
            </div>

            <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkEnableTestDate}
                  onChange={(e) => setBulkEnableTestDate(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#1e3799]"
                />
                <span className="text-xs font-bold text-slate-900">Дата испытания</span>
              </label>
              {bulkEnableTestDate && (
                <div className="space-y-1">
                  <div className="text-[11px] font-mono font-bold text-[#1e3799]">
                    ДД.ММ.ГГ: {formatDateDDMMYY(bulkTestDate)}
                  </div>
                  <input
                    type="date"
                    value={bulkTestDate}
                    onChange={(e) => setBulkTestDate(e.target.value)}
                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono"
                  />
                </div>
              )}
            </div>
          </div>

          {/* 5. Статус ИД и Ответственный инженер ПТО */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkEnableIdStatus}
                  onChange={(e) => setBulkEnableIdStatus(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#1e3799]"
                />
                <span className="text-xs font-bold text-slate-900">
                  Статус ИД
                </span>
              </label>
              {bulkEnableIdStatus && (
                <select
                  value={bulkIdStatus}
                  onChange={(e) => setBulkIdStatus(e.target.value as ExecutiveDocStatus)}
                  aria-label="Статус ИД для группового изменения"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-900 cursor-pointer"
                >
                  <option value="IN_WORK">В работе</option>
                  <option value="SIGNED">Подписана</option>
                </select>
              )}
            </div>

            <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkEnableResponsiblePto}
                  onChange={(e) => setBulkEnableResponsiblePto(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#1e3799]"
                />
                <span className="text-xs font-bold text-slate-900">
                  Ответственный ПТО
                </span>
              </label>
              {bulkEnableResponsiblePto && (
                <input
                  type="text"
                  list="ll-pto-engineers-list"
                  value={bulkResponsiblePto}
                  onChange={(e) => setBulkResponsiblePto(e.target.value)}
                  placeholder="Выберите из ПТО, введите ФИО или оставьте пустым"
                  aria-label="Ответственный ПТО для группового изменения"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs"
                />
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={handleRequestClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#1e3799] text-white text-xs font-semibold hover:bg-[#15276e] cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Применить к выбранным ({selectedLineIds.length} лин.)</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
