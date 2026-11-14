import React from 'react';
import { AlertTriangle, Lock, MapPin, Trash2 } from 'lucide-react';
import type {
  FacilityObject,
  ProjectLineItem,
  WeldJoint,
} from '../../types/welding';
import type { RolePermissions } from '../../utils/rbac';
import {
  buildUniqueLineId,
  calculateEquivalentDiaInch,
  getEpcWallThicknessFactor,
  mmToInchDiameter,
  suggestNextJointNumber,
} from '../../utils/weldingLogic';

export interface PassportRequisitesSidebarProps {
  mode: 'create' | 'edit';
  form: WeldJoint;
  setForm: React.Dispatch<React.SetStateAction<WeldJoint>>;
  rbac: RolePermissions;
  facilities: FacilityObject[];
  currentFacility: FacilityObject;
  projectLineList: ProjectLineItem[];
  availableLinesForRd: ProjectLineItem[];
  currentWeatherStationName: string;
  elem1Diam: number;
  isSupplementaryMode: boolean;
  setIsSupplementaryMode: (val: boolean) => void;
  confirmDeleteStep: boolean;
  setConfirmDeleteStep: (val: boolean) => void;
  duplicateJointOnLine: WeldJoint | null;
  existingNumbersInLine: string[];
  baseJointForSupp: string | undefined;
  onOpenFacilityLocation?: (facilityName: string) => void;
  onDeleteJoint?: (joint: WeldJoint) => void;
  onClose: () => void;
  handleRdCodeChangeInCreate: (newRd: string) => void;
}

export const PassportRequisitesSidebar: React.FC<PassportRequisitesSidebarProps> = ({
  mode,
  form,
  setForm,
  rbac,
  facilities,
  currentFacility,
  projectLineList,
  availableLinesForRd,
  currentWeatherStationName,
  elem1Diam,
  isSupplementaryMode,
  setIsSupplementaryMode,
  confirmDeleteStep,
  setConfirmDeleteStep,
  duplicateJointOnLine,
  existingNumbersInLine,
  baseJointForSupp,
  onOpenFacilityLocation,
  onDeleteJoint,
  onClose,
  handleRdCodeChangeInCreate,
}) => {
  return (
    <aside
      aria-label="Справочные реквизиты стыка"
      className="lg:col-span-3 p-4 rounded-xl bg-[#f4f8fe] border border-sky-200/90 space-y-3.5 lg:sticky lg:top-0"
    >
      {mode === 'edit' ? (
        /* В РЕЖИМЕ РЕДАКТИРОВАНИЯ СТЫКА ВСЕ 5 РЕКВИЗИТОВ СТРОГО НЕРЕДАКТИРУЕМЫЕ */
        <>
          <div className="p-3 rounded-lg bg-[#1e3799] text-white flex items-center justify-between">
            <div>
              <div className="text-[10px] text-sky-200 flex items-center gap-1.5">
                <span>Номер стыка</span>
                <span
                  className="px-1.5 py-0.2 rounded bg-white/15 text-sky-100 font-mono font-bold text-[10px]"
                  title="Версия записи для контроля оптимистической блокировки (OCC)"
                >
                  v{form.version ?? 1}
                </span>
              </div>
              <div className="font-mono text-xl font-bold tracking-tight">
                № {form.jointNumber}
              </div>
            </div>
            <div className="text-right">
              <span
                title="Номер стыка не подлежит переименованию · Защищено оптимистической блокировкой"
                aria-label="Номер стыка защищён от переименования"
                className="inline-flex items-center justify-center p-1.5 rounded bg-white/15 text-sky-100"
              >
                <Lock className="w-3.5 h-3.5" />
              </span>
              {isSupplementaryMode && (
                <div className="text-[10px] text-amber-300 font-semibold mt-1">
                  Доп. стык
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="p-2.5 rounded-lg bg-white border border-slate-200/90">
              <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400 mb-0.5">
                <span>Объект</span>
                <span
                  className="font-medium text-[#1e3799] text-right truncate max-w-[155px]"
                  title={`Данные о температуре берутся с: ${currentWeatherStationName}`}
                >
                  {currentWeatherStationName}
                </span>
              </div>
              {onOpenFacilityLocation ? (
                <button
                  type="button"
                  onClick={() => onOpenFacilityLocation(form.objectName)}
                  aria-label={`Выбрать метеопункт объекта ${form.objectName}`}
                  title="Нажмите на объект для выбора метеопункта и расчёта авто-температуры воздуха"
                  className="w-full text-left font-semibold text-slate-900 hover:text-[#1e3799] hover:underline flex items-center justify-between gap-1 transition-colors cursor-pointer"
                >
                  <span className="break-words">{form.objectName}</span>
                  <MapPin className="w-3.5 h-3.5 text-[#1e3799] shrink-0" />
                </button>
              ) : (
                <div className="font-semibold text-slate-900 break-words">
                  {form.objectName}
                </div>
              )}
            </div>

            <div className="p-2.5 rounded-lg bg-white border border-slate-200/90">
              <div className="text-[10px] text-slate-400 mb-0.5">Шифр РД</div>
              <div className="font-mono font-semibold text-slate-900 text-[11px] break-all">
                {form.rdCode}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-white border border-slate-200/90">
              <div className="text-[10px] text-slate-400 mb-0.5">Линия</div>
              <div className="font-mono font-bold text-[#1e3799]">
                {form.lineNumber}
              </div>
              <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                ID: {form.uniqueLineId}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-white border border-slate-200/90">
              <div className="text-[10px] text-slate-400 mb-0.5">Контур</div>
              <div className="font-medium text-slate-800 break-words">
                {form.contour}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-white border border-slate-200/90">
              <div className="text-[10px] text-slate-400 mb-0.5">Диаметр и толщина стенки</div>
              <div className="font-mono font-bold text-slate-900">
                Ø{elem1Diam}×{form.elem1WallThickness ?? form.wallThickness} мм ({mmToInchDiameter(elem1Diam)})
              </div>
              <div className="text-[11px] font-mono text-[#1e3799] font-semibold mt-1 flex items-center justify-between">
                <span>Экв. дюймы (EDI):</span>
                <span title="Метод А: отраслевая шкала EPC по толщине стенки">
                  {calculateEquivalentDiaInch(elem1Diam, form.elem1WallThickness ?? form.wallThickness)}" (K={getEpcWallThicknessFactor(form.elem1WallThickness ?? form.wallThickness)})
                </span>
              </div>
            </div>
          </div>

          {/* Удаление стыка (разрешено только Инженеру ПТО по RBAC) */}
          {onDeleteJoint && rbac.canCreateOrDeleteJoints && (
            <div className="pt-2 border-t border-sky-200/80">
              {!confirmDeleteStep ? (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteStep(true)}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50 text-xs font-semibold transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Удалить стык № {form.jointNumber}</span>
                </button>
              ) : (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-300 space-y-2">
                  <div className="text-[11px] font-bold text-red-800">
                    Удалить стык № {form.jointNumber} из реестра?
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteJoint(form);
                        onClose();
                      }}
                      className="flex-1 py-1.5 px-2 rounded bg-red-600 text-white text-xs font-bold hover:bg-red-700"
                    >
                      Подтвердить удаление
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteStep(false)}
                      className="py-1.5 px-2 rounded bg-white border border-slate-300 text-slate-700 text-xs font-medium"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        /* В РЕЖИМЕ СОЗДАНИЯ НОВОГО СТЫКА: ВЫБОР ИЗ ЛАЙНЛИСТА И НАЗНАЧЕНИЕ НОМЕРА */
        <div className="space-y-3 text-xs">
          <div>
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-600 mb-1">
              <span>Объект (из лайнлиста)</span>
              <span className="text-[10px] text-[#1e3799] font-semibold">
                {currentWeatherStationName}
              </span>
            </div>
            {facilities.length > 0 ? (
              <select
                value={form.objectName}
                onChange={(e) => {
                  const nextFac =
                    facilities.find((f) => f.name === e.target.value) ||
                    facilities[0];
                  const nextRd = nextFac.rdCodes[0]?.code || '';
                  const firstLineForNext =
                    projectLineList.find(
                      (l) =>
                        l.objectName === nextFac.name && l.rdCode === nextRd
                    ) || projectLineList.find((l) => l.rdCode === nextRd);
                  const nextLineNum =
                    firstLineForNext?.lineNumber || form.lineNumber;
                  setForm((prev) => ({
                    ...prev,
                    objectName: nextFac.name,
                    rdCode: nextRd,
                    lineNumber: nextLineNum,
                    contour:
                      firstLineForNext?.testContour ||
                      nextFac.rdCodes[0]?.contours[0] ||
                      prev.contour,
                    uniqueLineId: buildUniqueLineId(nextRd, nextLineNum),
                  }));
                }}
                aria-label="Объект строительства (из лайнлиста)"
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-medium"
              >
                {facilities.map((f) => (
                  <option key={f.id} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={form.objectName}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, objectName: e.target.value }))
                }
                aria-label="Объект строительства"
                placeholder="Введите название объекта..."
                className="w-full px-2.5 py-1.5 bg-white border border-[#1e3799] rounded text-xs font-medium"
              />
            )}
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Шифр РД (из лайнлиста)
            </label>
            {currentFacility.rdCodes.length > 0 && facilities.length > 0 ? (
              <select
                value={form.rdCode}
                onChange={(e) => handleRdCodeChangeInCreate(e.target.value)}
                aria-label="Шифр РД (из лайнлиста)"
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-[11px] font-mono"
              >
                {currentFacility.rdCodes.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.code}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={form.rdCode}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    rdCode: e.target.value,
                    uniqueLineId: buildUniqueLineId(
                      e.target.value,
                      prev.lineNumber
                    ),
                  }))
                }
                aria-label="Шифр РД"
                placeholder="Введите шифр РД..."
                className="w-full px-2.5 py-1.5 bg-white border border-[#1e3799] rounded text-[11px] font-mono"
              />
            )}
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Линия (из лайнлиста)
            </label>
            {availableLinesForRd.length > 0 ? (
              <select
                value={form.lineNumber}
                onChange={(e) => {
                  const newLine = e.target.value;
                  const matchedLine = availableLinesForRd.find(
                    (l) => l.lineNumber === newLine
                  );
                  setForm((prev) => ({
                    ...prev,
                    lineNumber: newLine,
                    contour: matchedLine?.testContour || prev.contour,
                    uniqueLineId: buildUniqueLineId(prev.rdCode, newLine),
                  }));
                }}
                aria-label="Номер и наименование линии (из лайнлиста)"
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono font-bold text-[#1e3799]"
              >
                {availableLinesForRd.map((line) => (
                  <option key={line.id} value={line.lineNumber}>
                    {line.lineNumber} — {line.lineName}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={form.lineNumber}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    lineNumber: e.target.value,
                    uniqueLineId: buildUniqueLineId(
                      prev.rdCode,
                      e.target.value
                    ),
                  }))
                }
                aria-label="Номер линии"
                placeholder="Напр.: ТХ-101/1"
                className="w-full px-2.5 py-1.5 bg-white border border-[#1e3799] rounded text-xs font-mono font-bold text-[#1e3799]"
              />
            )}
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Контур (из лайнлиста)
            </label>
            <input
              type="text"
              value={form.contour}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, contour: e.target.value }))
              }
              aria-label="Контур испытания (из лайнлиста)"
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
            />
          </div>

          <div className="p-2.5 rounded-lg bg-white border border-slate-200/90">
            <div className="text-[10px] text-slate-400 mb-0.5">Диаметр и толщина стенки</div>
            <div className="font-mono font-bold text-slate-900">
              Ø{elem1Diam}×{form.elem1WallThickness ?? form.wallThickness} мм ({mmToInchDiameter(elem1Diam)})
            </div>
            <div className="text-[11px] font-mono text-[#1e3799] font-semibold mt-1 flex items-center justify-between">
              <span>Экв. дюймы (EDI):</span>
              <span title="Метод А: отраслевая шкала EPC по толщине стенки">
                {calculateEquivalentDiaInch(elem1Diam, form.elem1WallThickness ?? form.wallThickness)}" (K={getEpcWallThicknessFactor(form.elem1WallThickness ?? form.wallThickness)})
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-sky-200 space-y-2">
            <div className="flex gap-1 p-1 bg-white border border-slate-300 rounded">
              <button
                type="button"
                onClick={() => {
                  setIsSupplementaryMode(false);
                  setForm((prev) => ({
                    ...prev,
                    jointNumber: suggestNextJointNumber(existingNumbersInLine),
                    isSupplementary: false,
                  }));
                }}
                className={`flex-1 py-1 rounded text-[11px] font-semibold ${
                  !isSupplementaryMode
                    ? 'bg-[#1e3799] text-white'
                    : 'text-slate-600'
                }`}
              >
                Основной (010...)
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSupplementaryMode(true);
                  setForm((prev) => ({
                    ...prev,
                    jointNumber: suggestNextJointNumber(
                      existingNumbersInLine,
                      baseJointForSupp
                    ),
                    isSupplementary: true,
                  }));
                }}
                className={`flex-1 py-1 rounded text-[11px] font-semibold ${
                  isSupplementaryMode
                    ? 'bg-[#1e3799] text-white'
                    : 'text-slate-600'
                }`}
              >
                Доп. (011...)
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#1e3799] mb-1">
                Номер создаваемого стыка *
              </label>
              <input
                type="text"
                required
                value={form.jointNumber}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    jointNumber: e.target.value,
                  }))
                }
                aria-label="Номер стыка"
                className={`w-full px-3 py-1.5 rounded font-mono font-bold text-sm transition-colors ${
                  duplicateJointOnLine
                    ? 'bg-red-50 border-2 border-red-500 text-red-900 focus:outline-none focus:ring-2 focus:ring-red-400'
                    : 'bg-white border border-[#1e3799] text-[#1e3799]'
                }`}
              />
              {duplicateJointOnLine ? (
                <div className="mt-1.5 p-2 rounded-lg bg-red-50 border border-red-300 text-red-900 text-[11px] flex items-start gap-1.5 font-medium shadow-xs">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                  <span>
                    Стык с номером «{form.jointNumber}» уже существует на этой линии (ID: {duplicateJointOnLine.id}). Дублирование номеров стыков запрещено.
                  </span>
                </div>
              ) : (
                <div className="text-[10px] text-slate-500 mt-1">
                  После добавления стыка его номер не подлежит переименованию
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
