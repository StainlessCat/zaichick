import { useModalDismiss } from '../../hooks/useModalDismiss';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Info,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { ExecutiveDocStatus, ProjectLineItem, TestCircuit } from '../../types/welding';
import {
  buildUniqueLineId,
  formatDateDDMMYY,
  formatRangeValue,
  normalizeExecutiveDocStatus,
  parseRangeValue,
} from '../../utils/weldingLogic';

interface LineListEditModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  rowItem: ProjectLineItem | null;
  editForm: ProjectLineItem;
  setEditForm: React.Dispatch<React.SetStateAction<ProjectLineItem>>;
  selectedObjectName: string;
  availableObjectOptions: string[];
  isCustomObject: boolean;
  setIsCustomObject: React.Dispatch<React.SetStateAction<boolean>>;
  isCustomRd: boolean;
  setIsCustomRd: React.Dispatch<React.SetStateAction<boolean>>;
  rdsForCurrentObject: string[];
  onSelectExistingObject: (obj: string) => void;
  onSelectExistingRd: (rd: string) => void;
  cascadeRename: boolean;
  setCascadeRename: React.Dispatch<React.SetStateAction<boolean>>;
  lineFormError: string;
  onSave: (e: React.FormEvent) => void;
  onDelete: () => void;
  onClose: () => void;
  testCircuits?: TestCircuit[];
}

export const LineListEditModal: React.FC<LineListEditModalProps> = ({
  isOpen,
  mode,
  rowItem,
  editForm,
  setEditForm,
  selectedObjectName,
  availableObjectOptions,
  isCustomObject,
  setIsCustomObject,
  isCustomRd,
  setIsCustomRd,
  rdsForCurrentObject,
  onSelectExistingObject,
  onSelectExistingRd,
  cascadeRename,
  setCascadeRename,
  lineFormError,
  onSave,
  onDelete,
  onClose,
  testCircuits = [],
}) => {
  // Парные состояния для диапазона давления и температуры
  const [pressureFrom, setPressureFrom] = useState('');
  const [pressureTo, setPressureTo] = useState('');
  const [tempFrom, setTempFrom] = useState('');
  const [tempTo, setTempTo] = useState('');

  // Синхронизация при открытии окна / изменении редактируемой строки
  useEffect(() => {
    if (isOpen) {
      const parsedP = parseRangeValue(editForm.workingPressure);
      setPressureFrom(parsedP.from);
      setPressureTo(parsedP.to);

      const parsedT = parseRangeValue(editForm.workingTemperature);
      setTempFrom(parsedT.from);
      setTempTo(parsedT.to);
    }
  }, [isOpen, rowItem]);

  // Обработчики изменения давления
  const handlePressureFromChange = (val: string) => {
    setPressureFrom(val);
    const combined = formatRangeValue(val, pressureTo, false);
    setEditForm((prev) => ({ ...prev, workingPressure: combined }));
  };

  const handlePressureToChange = (val: string) => {
    setPressureTo(val);
    const combined = formatRangeValue(pressureFrom, val, false);
    setEditForm((prev) => ({ ...prev, workingPressure: combined }));
  };

  // Обработчики изменения температуры
  const handleTempFromChange = (val: string) => {
    setTempFrom(val);
    const combined = formatRangeValue(val, tempTo, true);
    setEditForm((prev) => ({ ...prev, workingTemperature: combined }));
  };

  const handleTempToChange = (val: string) => {
    setTempTo(val);
    const combined = formatRangeValue(tempFrom, val, true);
    setEditForm((prev) => ({ ...prev, workingTemperature: combined }));
  };

  // Фильтрация контуров испытания по текущему объекту
  const relevantCircuits = useMemo(() => {
    if (!testCircuits || testCircuits.length === 0) return [];
    if (!editForm.objectName || editForm.objectName === 'ALL') return testCircuits;
    return testCircuits.filter(
      (c) => !c.objectName || c.objectName === editForm.objectName
    );
  }, [testCircuits, editForm.objectName]);

  const initialSnapshotRef = React.useRef<string>('');
  useEffect(() => {
    if (isOpen) {
      initialSnapshotRef.current = JSON.stringify(editForm);
    }
  }, [isOpen]);

  const isDirty = useMemo(() => {
    return (
      isOpen &&
      initialSnapshotRef.current !== '' &&
      JSON.stringify(editForm) !== initialSnapshotRef.current
    );
  }, [isOpen, editForm]);

  const { handleRequestClose } = useModalDismiss({
    isOpen,
    isDirty,
    onClose,
    confirmMessage: 'В форме линии есть несохранённые изменения. Закрыть без сохранения?',
  });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={
        mode === 'create'
          ? 'Добавление строки лайнлиста'
          : 'Редактирование строки лайнлиста'
      }
    >
      <div
        className="fixed inset-0 bg-slate-900/45 backdrop-blur-[1px]"
        onClick={handleRequestClose}
      />
      <div className="relative z-10 w-full max-w-4xl bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-[#1e3799] text-white shrink-0">
          <div>
            <h2 className="font-display text-base font-bold">
              {mode === 'create'
                ? 'Добавление новой линии в раздел «Проект (лайнлист)»'
                : `Редактирование строки лайнлиста · Линия ${editForm.lineNumber} (${buildUniqueLineId(editForm.rdCode, editForm.lineNumber)})`}
            </h2>
            <p className="text-xs text-sky-200">
              Все данные по объектам, шифрам РД, контурам и названиям линий синхронизируются с остальными разделами системы
            </p>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            aria-label="Закрыть окно редактирования строки лайнлиста"
            className="p-1.5 rounded-lg text-sky-100 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSave} className="flex-1 overflow-y-auto p-6 space-y-4">
          {lineFormError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-red-800 text-xs font-semibold">
              {lineFormError}
            </div>
          )}

          {/* Поясняющая карточка архитектуры лайнлиста */}
          <div className="p-3.5 rounded-xl bg-sky-50/90 border border-sky-200/90 text-xs text-sky-950 flex items-start gap-3">
            <Info className="w-4 h-4 text-[#1e3799] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold text-[#1e3799]">
                Лайнлист — первоисточник объектов и шифров РД
              </div>
              <div className="text-slate-600 leading-relaxed">
                Выберите существующий объект и шифр РД из выпадающего списка или введите новые наименования. При сохранении строки этот объект и шифр РД автоматически появятся во всех разделах системы: в шапке программы, в паспорте стыка, в каталоге ЛРВ и отчетах.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-end">
            {/* 1. НАЗВАНИЕ ОБЪЕКТА */}
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label
                  className="block text-xs font-semibold text-slate-700 truncate whitespace-nowrap overflow-hidden"
                  title="1. Название объекта *"
                >
                  1. Название объекта *
                </label>
                {selectedObjectName === 'ALL' && availableObjectOptions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (isCustomObject) {
                        setIsCustomObject(false);
                        const firstObj = availableObjectOptions[0] || '';
                        onSelectExistingObject(firstObj);
                      } else {
                        setIsCustomObject(true);
                        setIsCustomRd(true);
                        setEditForm((prev) => ({ ...prev, objectName: '', rdCode: '' }));
                      }
                    }}
                    className="text-[11px] text-[#1e3799] hover:underline font-semibold flex items-center gap-1 cursor-pointer shrink-0 ml-1"
                  >
                    {isCustomObject ? (
                      '← Выбрать из существующих'
                    ) : (
                      <>
                        <Plus className="w-3 h-3" />
                        <span>Ввести новый объект</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {selectedObjectName !== 'ALL' ? (
                <div className="w-full h-9 px-3 bg-slate-50 border border-slate-300 rounded-md text-xs font-semibold text-[#1e3799] flex items-center justify-between">
                  <span className="truncate">{selectedObjectName}</span>
                  <span className="text-[10px] text-slate-500 font-mono shrink-0 ml-1">
                    (зафиксирован в меню)
                  </span>
                </div>
              ) : isCustomObject || availableObjectOptions.length === 0 ? (
                <input
                  type="text"
                  required
                  value={editForm.objectName}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, objectName: e.target.value }))
                  }
                  placeholder="Введите название нового объекта"
                  autoFocus
                  aria-label="Название объекта"
                  className="w-full h-9 px-3 bg-white border border-[#1e3799] rounded-md text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
                />
              ) : (
                <select
                  value={editForm.objectName}
                  onChange={(e) => {
                    if (e.target.value === '__NEW__') {
                      setIsCustomObject(true);
                      setIsCustomRd(true);
                      setEditForm((prev) => ({ ...prev, objectName: '', rdCode: '' }));
                    } else {
                      onSelectExistingObject(e.target.value);
                    }
                  }}
                  aria-label="Название объекта"
                  className="w-full h-9 px-3 bg-white border border-slate-300 rounded-md text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799] cursor-pointer"
                >
                  {availableObjectOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                  <option value="__NEW__">+ Ввести новый объект вручную...</option>
                </select>
              )}
            </div>

            {/* 2. ШИФР РД */}
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label
                  className="block text-xs font-semibold text-slate-700 truncate whitespace-nowrap overflow-hidden"
                  title="2. Шифр РД *"
                >
                  2. Шифр РД *
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (isCustomRd) {
                      setIsCustomRd(false);
                      const firstRd = rdsForCurrentObject[0] || '';
                      onSelectExistingRd(firstRd);
                    } else {
                      setIsCustomRd(true);
                      setEditForm((prev) => ({
                        ...prev,
                        rdCode: '',
                        uniqueLineId: buildUniqueLineId('', prev.lineNumber),
                      }));
                    }
                  }}
                  className="text-[11px] text-[#1e3799] hover:underline font-semibold flex items-center gap-1 cursor-pointer shrink-0 ml-1"
                >
                  {isCustomRd && !isCustomObject && rdsForCurrentObject.length > 0 ? (
                    '← Выбрать из существующих РД'
                  ) : (
                    <>
                      <Plus className="w-3 h-3" />
                      <span>Ввести новый шифр РД</span>
                    </>
                  )}
                </button>
              </div>

              {isCustomRd || isCustomObject || rdsForCurrentObject.length === 0 ? (
                <input
                  type="text"
                  required
                  value={editForm.rdCode}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      rdCode: e.target.value,
                      uniqueLineId: buildUniqueLineId(
                        e.target.value,
                        prev.lineNumber
                      ),
                    }))
                  }
                  placeholder="Введите шифр РД"
                  aria-label="Шифр РД"
                  className="w-full h-9 px-3 bg-white border border-[#1e3799] rounded-md text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
                />
              ) : (
                <select
                  value={editForm.rdCode}
                  onChange={(e) => {
                    if (e.target.value === '__NEW__') {
                      setIsCustomRd(true);
                      setEditForm((prev) => ({
                        ...prev,
                        rdCode: '',
                        uniqueLineId: buildUniqueLineId('', prev.lineNumber),
                      }));
                    } else {
                      onSelectExistingRd(e.target.value);
                    }
                  }}
                  aria-label="Шифр РД"
                  className="w-full h-9 px-3 bg-white border border-slate-300 rounded-md text-xs font-mono font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799] cursor-pointer"
                >
                  {rdsForCurrentObject.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                  <option value="__NEW__">+ Ввести новый шифр РД вручную...</option>
                </select>
              )}
            </div>

            {/* 3. НОМЕР ЛИНИИ */}
            <div>
              <label
                className="block text-xs font-semibold text-slate-700 mb-1 truncate whitespace-nowrap overflow-hidden"
                title="3. Номер линии *"
              >
                3. Номер линии *
              </label>
              <input
                type="text"
                required
                value={editForm.lineNumber}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    lineNumber: e.target.value,
                    uniqueLineId: buildUniqueLineId(prev.rdCode, e.target.value),
                  }))
                }
                placeholder="Напр.: ФП1.2/1"
                aria-label="Номер линии"
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-md text-xs font-mono font-bold text-[#1e3799] focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
              />
            </div>

            {/* 4. НАИМЕНОВАНИЕ ЛИНИИ */}
            <div className="sm:col-span-3">
              <label
                className="block text-xs font-semibold text-slate-700 mb-1 truncate whitespace-nowrap overflow-hidden"
                title="4. Наименование линии *"
              >
                4. Наименование линии *
              </label>
              <input
                type="text"
                required
                value={editForm.lineName}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, lineName: e.target.value }))
                }
                placeholder="Напр.: Газопровод сырого газа от сепараторов"
                aria-label="Наименование линии"
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-md text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
              />
            </div>

            {/* 5. ПРОДУКТ */}
            <div>
              <label
                className="block text-xs font-semibold text-slate-700 mb-1 truncate whitespace-nowrap overflow-hidden"
                title="5. Продукт"
              >
                5. Продукт
              </label>
              <input
                type="text"
                value={editForm.product}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, product: e.target.value }))
                }
                placeholder="Напр.: Природный газ"
                aria-label="Продукт"
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-md text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
              />
            </div>

            {/* 6. КОНТУР ИСПЫТАНИЯ (ТОЛЬКО ВЫБОР ИЗ СОЗДАННЫХ КОНТУРОВ) */}
            <div>
              <label
                className="block text-xs font-semibold text-slate-700 mb-1 truncate whitespace-nowrap overflow-hidden"
                title="6. Контур испытания"
              >
                6. Контур испытания
              </label>
              <select
                value={editForm.testContour || ''}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    testContour: e.target.value || '',
                  }))
                }
                aria-label="Контур испытания"
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-md text-xs font-semibold text-[#1e3799] focus:outline-none focus:ring-2 focus:ring-[#1e3799] cursor-pointer"
              >
                <option value="">— Не выбран (пусто) —</option>
                {relevantCircuits.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 7. НТД НА СВАРКУ */}
            <div>
              <label
                className="block text-xs font-semibold text-slate-700 mb-1 truncate whitespace-nowrap overflow-hidden"
                title="7. НТД на сварку"
              >
                7. НТД на сварку
              </label>
              <input
                type="text"
                value={editForm.weldingNtd}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, weldingNtd: e.target.value }))
                }
                placeholder="Напр.: СТО Газпром 15-1.1-002-2023"
                aria-label="НТД на сварку"
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-md text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
              />
            </div>

            {/* 8. НТД НА КОНТРОЛЬ */}
            <div>
              <label
                className="block text-xs font-semibold text-slate-700 mb-1 truncate whitespace-nowrap overflow-hidden"
                title="8. НТД на контроль"
              >
                8. НТД на контроль
              </label>
              <input
                type="text"
                value={editForm.controlNtd}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, controlNtd: e.target.value }))
                }
                placeholder="Напр.: СТО Газпром 15-1.3-004-2023"
                aria-label="НТД на контроль"
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-md text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
              />
            </div>

            {/* 9. УРОВЕНЬ КАЧЕСТВА */}
            <div>
              <label
                className="block text-xs font-semibold text-slate-700 mb-1 truncate whitespace-nowrap overflow-hidden"
                title="9. Уровень качества"
              >
                9. Уровень качества
              </label>
              <select
                value={editForm.qualityLevel}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    qualityLevel: e.target.value,
                  }))
                }
                aria-label="Уровень качества"
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-md text-xs font-semibold text-[#1e3799] focus:outline-none focus:ring-2 focus:ring-[#1e3799] cursor-pointer"
              >
                <option value="">— Не указан (пусто) —</option>
                <option value="Уровень А">Уровень А</option>
                <option value="Уровень В">Уровень В</option>
                <option value="Уровень С">Уровень С</option>
              </select>
            </div>

            {/* 10. КАТЕГОРИЯ ТРУБОПРОВОДА */}
            <div>
              <label
                className="block text-xs font-semibold text-slate-700 mb-1 truncate whitespace-nowrap overflow-hidden"
                title="10. Категория трубопровода"
              >
                10. Категория трубопровода
              </label>
              <input
                type="text"
                value={editForm.pipelineCategory}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    pipelineCategory: e.target.value,
                  }))
                }
                placeholder="Напр.: I (В) или пусто"
                aria-label="Категория трубопровода"
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-md text-xs font-mono font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
              />
            </div>

            {/* 11. ДАВЛЕНИЕ, МПа (ПАРНЫЕ ПОЛЯ ОТ И ДО) */}
            <div>
              <label
                className="block text-xs font-semibold text-slate-700 mb-1 truncate whitespace-nowrap overflow-hidden"
                title="11. Давление, МПа"
              >
                11. Давление, МПа
              </label>
              <div className="grid grid-cols-2 gap-1.5 items-center">
                <input
                  type="text"
                  value={pressureFrom}
                  onChange={(e) => handlePressureFromChange(e.target.value)}
                  placeholder="От (мин.)"
                  aria-label="Давление от"
                  className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-md text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
                />
                <input
                  type="text"
                  value={pressureTo}
                  onChange={(e) => handlePressureToChange(e.target.value)}
                  placeholder="До (макс.)"
                  aria-label="Давление до"
                  className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-md text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
                />
              </div>
            </div>

            {/* 12. ТЕМПЕРАТУРА, °C (ПАРНЫЕ ПОЛЯ ОТ И ДО) */}
            <div>
              <label
                className="block text-xs font-semibold text-slate-700 mb-1 truncate whitespace-nowrap overflow-hidden"
                title="12. Температура, °C"
              >
                12. Температура, °C
              </label>
              <div className="grid grid-cols-2 gap-1.5 items-center">
                <input
                  type="text"
                  value={tempFrom}
                  onChange={(e) => handleTempFromChange(e.target.value)}
                  placeholder="От (напр. -1,0)"
                  aria-label="Температура от"
                  className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-md text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
                />
                <input
                  type="text"
                  value={tempTo}
                  onChange={(e) => handleTempToChange(e.target.value)}
                  placeholder="До (напр. +21,8)"
                  aria-label="Температура до"
                  className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-md text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
                />
              </div>
            </div>

            {/* 13. ПРОЦЕНТ КОНТРОЛЯ РК */}
            <div>
              <label
                className="block text-xs font-semibold text-slate-700 mb-1 truncate whitespace-nowrap overflow-hidden"
                title="13. Процент контроля РК, %"
              >
                13. Процент контроля РК, %
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={editForm.rkPercent ?? ''}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    rkPercent: e.target.value === '' ? 0 : Number(e.target.value),
                  }))
                }
                placeholder="0"
                aria-label="Процент контроля РК"
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-md text-xs font-mono font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
              />
            </div>

            {/* 14. ПРОЦЕНТ КОНТРОЛЯ УЗК */}
            <div>
              <label
                className="block text-xs font-semibold text-slate-700 mb-1 truncate whitespace-nowrap overflow-hidden"
                title="14. Процент контроля УЗК, %"
              >
                14. Процент контроля УЗК, %
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={editForm.uzkPercent ?? ''}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    uzkPercent: e.target.value === '' ? 0 : Number(e.target.value),
                  }))
                }
                placeholder="0"
                aria-label="Процент контроля УЗК"
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-md text-xs font-mono font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
              />
            </div>

            {/* 15. ПРОЦЕНТ КОНТРОЛЯ ПВК */}
            <div>
              <label
                className="block text-xs font-semibold text-slate-700 mb-1 truncate whitespace-nowrap overflow-hidden"
                title="15. Процент контроля ПВК, %"
              >
                15. Процент контроля ПВК, %
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={editForm.pvkPercent ?? ''}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    pvkPercent: e.target.value === '' ? 0 : Number(e.target.value),
                  }))
                }
                placeholder="0"
                aria-label="Процент контроля ПВК"
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-md text-xs font-mono font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
              />
            </div>

            {/* 16. ДАТА ИСПЫТАНИЯ */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  className="text-xs font-semibold text-slate-700 truncate whitespace-nowrap overflow-hidden"
                  title="16. Дата испытания"
                >
                  16. Дата испытания
                </label>
                {editForm.testDate && (
                  <span className="text-[11px] font-mono font-bold text-[#1e3799] shrink-0 ml-1">
                    {formatDateDDMMYY(editForm.testDate)}
                  </span>
                )}
              </div>
              <input
                type="date"
                value={
                  /^\d{4}-\d{2}-\d{2}$/.test(editForm.testDate)
                    ? editForm.testDate
                    : ''
                }
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, testDate: e.target.value }))
                }
                aria-label="Дата испытания"
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-md text-xs font-mono font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
              />
            </div>

            {/* 17. СТАТУС ИД */}
            <div>
              <label
                className="block text-xs font-semibold text-slate-700 mb-1 truncate whitespace-nowrap overflow-hidden"
                title="17. Статус ИД"
              >
                17. Статус ИД
              </label>
              <select
                value={normalizeExecutiveDocStatus(editForm.idStatus)}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    idStatus: e.target.value as ExecutiveDocStatus,
                  }))
                }
                aria-label="Статус ИД"
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-md text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799] cursor-pointer"
              >
                <option value="IN_WORK">В работе</option>
                <option value="SIGNED">Подписана</option>
              </select>
            </div>

            {/* 18. ОТВЕТСТВЕННЫЙ ПТО */}
            <div className="sm:col-span-2 lg:col-span-3">
              <label
                className="block text-xs font-semibold text-slate-700 mb-1 truncate whitespace-nowrap overflow-hidden"
                title="18. Ответственный ПТО"
              >
                18. Ответственный ПТО
              </label>
              <input
                type="text"
                list="ll-pto-engineers-list"
                value={editForm.responsiblePto || ''}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    responsiblePto: e.target.value,
                  }))
                }
                placeholder="Выберите сотрудника ПТО из списка или введите ФИО"
                aria-label="Ответственный ПТО"
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-md text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
              />
            </div>
          </div>

          {mode === 'edit' && (
            <label className="flex items-start gap-2.5 p-3 rounded-lg bg-[#e8f1fc] border border-[#1e3799]/30 cursor-pointer">
              <input
                type="checkbox"
                checked={cascadeRename}
                onChange={(e) => setCascadeRename(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799]"
              />
              <div className="text-xs text-slate-800">
                <span className="font-bold text-[#1e3799]">
                  Каскадно переименовать во всей системе (1 → N):
                </span>{' '}
                если вы изменили <b>Название объекта</b>, <b>Шифр РД</b> или{' '}
                <b>Контур испытания</b>, автоматически заменить старое название во всех остальных строках лайнлиста, в реестре сварных стыков и в каталоге ЛРВ.{' '}
                <span className="text-slate-500">
                  (Снимите галочку, если нужно перенести в другой шифр/контур только эту одну линию).
                </span>
              </div>
            </label>
          )}

          <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-200">
            <div>
              {mode === 'edit' && rowItem && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Удалить эту линию</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleRequestClose}
                className="px-4 h-9 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-5 h-9 rounded-lg bg-[#1e3799] text-white text-xs font-semibold hover:bg-[#15276e] cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>
                  {mode === 'create'
                    ? 'Добавить линию в лайнлист'
                    : 'Сохранить изменения строки'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
