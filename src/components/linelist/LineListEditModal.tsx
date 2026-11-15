import React from 'react';
import {
  Check,
  Info,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { ProjectLineItem } from '../../types/welding';
import { buildUniqueLineId, formatDateDDMMYY } from '../../utils/weldingLogic';

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
}) => {
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
        onClick={onClose}
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
            onClick={onClose}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* 1. НАЗВАНИЕ ОБЪЕКТА */}
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
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
                    className="text-[11px] text-[#1e3799] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
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
                <div className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs font-semibold text-[#1e3799] flex items-center justify-between">
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
                  placeholder="Введите название нового объекта (напр.: КС «Воркутинская»)"
                  autoFocus
                  aria-label="Название объекта"
                  className="w-full px-3 py-2 bg-white border border-[#1e3799] rounded-md text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
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
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799] cursor-pointer"
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
                <label className="block text-xs font-semibold text-slate-700">
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
                  className="text-[11px] text-[#1e3799] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
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
                  placeholder="Введите шифр РД (напр.: 0092.049.Р.13/1 0004 УКПГ.045.0077.003-ТХ5)"
                  aria-label="Шифр РД"
                  className="w-full px-3 py-2 bg-white border border-[#1e3799] rounded-md text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
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
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1e3799] cursor-pointer"
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

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
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
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono font-bold text-[#1e3799]"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                4. Наименование линии *
              </label>
              <input
                type="text"
                required
                value={editForm.lineName}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, lineName: e.target.value }))
                }
                aria-label="Наименование линии"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                5. Продукт
              </label>
              <input
                type="text"
                value={editForm.product}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, product: e.target.value }))
                }
                aria-label="Продукт"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                6. Контур испытания
              </label>
              <input
                type="text"
                list="ll-contours-list"
                value={editForm.testContour}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    testContour: e.target.value,
                  }))
                }
                aria-label="Контур испытания"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                7. НТД на сварку
              </label>
              <input
                type="text"
                value={editForm.weldingNtd}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, weldingNtd: e.target.value }))
                }
                aria-label="НТД на сварку"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                8. НТД на контроль
              </label>
              <input
                type="text"
                value={editForm.controlNtd}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, controlNtd: e.target.value }))
                }
                aria-label="НТД на контроль"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                9. Уровень качества (может быть пустым)
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
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-semibold text-[#1e3799]"
              >
                <option value="">— Не указан (пусто) —</option>
                <option value="Уровень А">Уровень А</option>
                <option value="Уровень В">Уровень В</option>
                <option value="Уровень С">Уровень С</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                10. Категория трубопровода (может быть пустой)
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
                placeholder="Напр.: I (В) или оставьте пустым"
                aria-label="Категория трубопровода"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                11. Рабочее давление
              </label>
              <input
                type="text"
                value={editForm.workingPressure}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    workingPressure: e.target.value,
                  }))
                }
                aria-label="Рабочее давление"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                12. Температура
              </label>
              <input
                type="text"
                value={editForm.workingTemperature}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    workingTemperature: e.target.value,
                  }))
                }
                aria-label="Температура"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                13. Процент контроля РК, %
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={editForm.rkPercent}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    rkPercent: Number(e.target.value),
                  }))
                }
                aria-label="Процент контроля РК"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                14. Процент контроля УЗК, %
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={editForm.uzkPercent}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    uzkPercent: Number(e.target.value),
                  }))
                }
                aria-label="Процент контроля УЗК"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                15. Процент контроля ПВК, %
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={editForm.pvkPercent}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    pvkPercent: Number(e.target.value),
                  }))
                }
                aria-label="Процент контроля ПВК"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-700">
                  17. Дата испытания
                </label>
                <span className="text-xs font-mono font-bold text-[#1e3799]">
                  {formatDateDDMMYY(editForm.testDate)}
                </span>
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
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono"
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
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Удалить эту линию</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#1e3799] text-white text-xs font-semibold hover:bg-[#15276e] cursor-pointer"
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
