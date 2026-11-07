import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  ControlResult,
  InspectorProfile,
  NdtMethod,
  TechCardItem,
  WelderProfile,
  WeldJoint,
} from '../../types/welding';
import {
  checkRepairEligibility,
  formatDateDDMMYY,
  isJointDefective,
  isSecondRepairForbidden,
  normalizeDecimalInput,
} from '../../utils/weldingLogic';

export interface PassportRepairTabProps {
  form: WeldJoint;
  setForm: React.Dispatch<React.SetStateAction<WeldJoint>>;
  rbac: {
    canEditPrepAndWeldingFields: boolean;
    canEditNdtFields: boolean;
  };
  inspectors: InspectorProfile[];
  welders?: WelderProfile[];
  techCards?: TechCardItem[];
}

export const PassportRepairTab: React.FC<PassportRepairTabProps> = ({
  form,
  setForm,
  rbac,
  inspectors,
  welders,
  techCards,
}) => {
  const isDefectiveOrHasRepair =
    isJointDefective(form) ||
    Boolean(form.repairAction) ||
    Boolean(form.repairDate) ||
    Boolean(form.repairVikResult && form.repairVikResult !== 'Не проводился') ||
    Boolean(form.repairNdtResult && form.repairNdtResult !== 'Не проводился');

  const repairEligibility = checkRepairEligibility(
    form.diameterMm,
    form.repairLengthMm,
    form.repairDefectType,
    (form.repairCount || 0) + (isSecondRepairForbidden(form) ? 1 : 0)
  );

  const secondRepairBlocked =
    isSecondRepairForbidden(form) ||
    !repairEligibility.isValid ||
    form.repairAction === 'Вырезано' ||
    form.repairVikResult === 'Вырезать' ||
    form.repairNdtResult === 'Вырезать' ||
    form.repairDupNdtResult === 'Вырезать';

  return (
    <div className="space-y-4">
      {/* Предупреждение о запрете ремонта при нарушении требований СТО */}
      {!repairEligibility.isValid && (
        <div className="p-3.5 rounded-xl bg-red-100 border-2 border-red-400 text-red-950 text-xs flex items-start gap-3 shadow-xs">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-red-900 text-sm">
              Ремонт шва недопустим по СТО Газпром 15-1.1-002-2023 · Стык подлежит вырезке катушки
            </div>
            <p className="leading-relaxed text-red-800">
              {repairEligibility.message}
            </p>
          </div>
        </div>
      )}

      {secondRepairBlocked && repairEligibility.isValid && (
        <div className="p-3.5 rounded-xl bg-red-50 border-2 border-red-300 text-red-950 text-xs flex items-start gap-3 shadow-xs">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-red-900 text-sm">
              Повторный ремонт шва категорически запрещён (Правило 1 ремонта)
            </div>
            <p className="leading-relaxed text-red-800">
              Согласно нормативным требованиям (СТО Газпром 15-1.1-002-2023 п. 19.3, ГОСТ 32569-2013 п. 12.5.3, СП 86.13330) повторный ремонт одного и того же сварного соединения не допускается. В случае обнаружения дефектов после выполненного ремонта разрешается только <strong>вырез катушки</strong> с последующей вваркой двух новых монтажных стыков.
            </p>
          </div>
        </div>
      )}

      {isDefectiveOrHasRepair ? (
        <div className="p-4 rounded-xl bg-amber-50/70 border-2 border-amber-300 space-y-3.5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
              <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                Устранение дефекта и контроль после ремонта
              </h4>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-200/80 text-amber-900 border border-amber-300">
                Дефектный стык
              </span>
            </div>
            <div className="text-[11px] text-amber-800 font-medium">
              Инженер ПТО / Мастер СМР · Специалист ЛНК
            </div>
          </div>

          {/* Блок 1: Сведения о проведении ремонта */}
          <div className="p-3 bg-white rounded-lg border border-amber-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                1. Сведения о проведении ремонта
              </span>
              <span className="text-[10px] text-slate-500">
                Заполняет: Инженер ПТО / Мастер СМР
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              <div>
                <label className="block text-[11px] text-slate-600 mb-0.5">
                  Статус ремонта
                </label>
                <select
                  disabled={!rbac.canEditPrepAndWeldingFields || secondRepairBlocked}
                  value={secondRepairBlocked ? 'Вырезано' : form.repairAction || 'Ремонт'}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      repairAction: e.target.value,
                    }))
                  }
                  className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-semibold disabled:bg-slate-100 disabled:text-slate-500"
                >
                  {!secondRepairBlocked && <option value="Ремонт">Ремонт (1-й ремонт)</option>}
                  <option value="Вырезано">Вырезано (вырез катушки)</option>
                  {!secondRepairBlocked && <option value="Требуется ремонт">Требуется ремонт</option>}
                </select>
              </div>
              <div>
                <label className="flex items-center justify-between text-[11px] text-slate-600 mb-0.5">
                  <span>Дата ремонта</span>
                  <span className="font-mono text-[#1e3799] font-semibold">
                    {formatDateDDMMYY(form.repairDate) || '—'}
                  </span>
                </label>
                <input
                  type="date"
                  disabled={!rbac.canEditPrepAndWeldingFields}
                  value={form.repairDate || ''}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, repairDate: e.target.value }))
                  }
                  className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-0.5">
                  ТК ремонта (ОТК)
                </label>
                <input
                  type="text"
                  disabled={!rbac.canEditPrepAndWeldingFields}
                  value={form.repairTechCard || ''}
                  placeholder={`${form.techCardNumber || 'ТК'}-Р`}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      repairTechCard: e.target.value,
                    }))
                  }
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-0.5">
                  Клеймо сварщика ремонта
                </label>
                <input
                  type="text"
                  disabled={!rbac.canEditPrepAndWeldingFields}
                  value={form.repairWelderStamp || ''}
                  placeholder={form.welderStamp || 'Клеймо'}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      repairWelderStamp: e.target.value,
                    }))
                  }
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono font-bold text-[#1e3799] disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-0.5">
                  Мастер / производитель работ
                </label>
                <input
                  type="text"
                  disabled={!rbac.canEditPrepAndWeldingFields}
                  value={form.repairForeman || ''}
                  placeholder={form.responsiblePerson || 'Мастер СМР'}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      repairForeman: e.target.value,
                    }))
                  }
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs disabled:bg-slate-100"
                />
              </div>
            </div>

            {/* Параметры выборки дефекта по СТО 15-1.1-002-2023 */}
            <div className="pt-2 border-t border-dashed border-amber-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-end">
              <div className="lg:col-span-4">
                <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                  Характер устраняемого дефекта
                </label>
                <select
                  disabled={!rbac.canEditPrepAndWeldingFields}
                  value={form.repairDefectType || 'Поры'}
                  onChange={(e) => {
                    const defect = e.target.value;
                    setForm((prev) => ({
                      ...prev,
                      repairDefectType: defect,
                      ...(defect.toLowerCase().includes('трещин') ? { repairAction: 'Вырезано' } : {}),
                    }));
                  }}
                  className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-medium"
                >
                  <option value="Поры">Поры / пористость</option>
                  <option value="Шлаковые включения">Шлаковые включения</option>
                  <option value="Непровар">Непровар</option>
                  <option value="Подрез">Подрез</option>
                  <option value="Наплыв">Наплыв / чешуйчатость</option>
                  <option value="Трещина (запрещено п. 19.1 СТО)">Трещина (ремонт запрещен)</option>
                  <option value="Прочее">Прочий допустимый дефект</option>
                </select>
              </div>

              <div className="lg:col-span-4">
                <label className="flex items-center justify-between text-[11px] font-bold text-slate-700 mb-0.5">
                  <span>Длина выборки, мм</span>
                  <span className="font-mono text-slate-500 font-normal">
                    макс. {repairEligibility.maxAllowableLengthMm} мм (1/{repairEligibility.ratioFactor} L)
                  </span>
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  disabled={!rbac.canEditPrepAndWeldingFields || secondRepairBlocked}
                  value={form.repairLengthMm ?? ''}
                  onChange={(e) => {
                    const raw = normalizeDecimalInput(e.target.value);
                    const val = raw ? parseFloat(raw) : undefined;
                    setForm((prev) => ({
                      ...prev,
                      repairLengthMm: val,
                      ...(val && val > repairEligibility.maxAllowableLengthMm ? { repairAction: 'Вырезано' } : {}),
                    }));
                  }}
                  placeholder={`≤ ${repairEligibility.maxAllowableLengthMm} мм`}
                  className={`w-full px-2.5 py-1.5 bg-white border rounded text-xs font-mono font-bold ${
                    repairEligibility.isExceeded
                      ? 'border-red-500 text-red-900 bg-red-50'
                      : 'border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div className="lg:col-span-4 pb-0.5">
                <div
                  className={`px-2.5 py-1.5 rounded text-[11px] font-medium border flex items-center justify-between ${
                    repairEligibility.isValid
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}
                >
                  <span>Периметр: {repairEligibility.perimeterMm} мм</span>
                  <span className="font-bold">
                    {repairEligibility.isValid ? 'В пределах нормы' : 'Превышение лимита!'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Блок 2: Контроль ВИК после ремонта */}
          <div className="p-3 bg-white rounded-lg border border-amber-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                2. Приемка после ремонта — Контроль ВИК
              </span>
              <span className="text-[10px] text-slate-500">
                Заполняет: Специалист ЛНК
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-[11px] text-slate-600 mb-0.5">
                  Результат ВИК ремонта
                </label>
                <select
                  disabled={!rbac.canEditNdtFields}
                  value={form.repairVikResult || 'Не проводился'}
                  onChange={(e) => {
                    const nextVal = e.target.value as ControlResult;
                    setForm((prev) => ({
                      ...prev,
                      repairVikResult: nextVal,
                      ...(nextVal === 'Вырезать' || nextVal === 'Ремонт'
                        ? {
                            repairAction: 'Вырезано',
                          }
                        : {}),
                    }));
                  }}
                  className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-bold"
                >
                  <option value="Не проводился">Не проводился</option>
                  <option value="Годен">Годен</option>
                  <option value="Вырезать">Брак — Вырезать катушку</option>
                  <option value="В работе">В работе</option>
                </select>
              </div>
              <div>
                <label className="flex items-center justify-between text-[11px] text-slate-600 mb-0.5">
                  <span>Дата ВИК ремонта</span>
                  <span className="font-mono text-[#1e3799] font-semibold">
                    {formatDateDDMMYY(form.repairVikDate) || '—'}
                  </span>
                </label>
                <input
                  type="date"
                  disabled={
                    !rbac.canEditNdtFields ||
                    form.repairVikResult === 'Не проводился'
                  }
                  value={form.repairVikDate || ''}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      repairVikDate: e.target.value,
                    }))
                  }
                  className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-0.5">
                  № заключения ВИК
                </label>
                <input
                  type="text"
                  disabled={
                    !rbac.canEditNdtFields ||
                    form.repairVikResult === 'Не проводился'
                  }
                  value={form.repairVikNumber || ''}
                  placeholder={`ВИК-Р-${form.jointNumber}`}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      repairVikNumber: e.target.value,
                    }))
                  }
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-0.5">
                  Дефектоскопист ВИК
                </label>
                <select
                  disabled={
                    !rbac.canEditNdtFields ||
                    form.repairVikResult === 'Не проводился'
                  }
                  value={form.repairVikInspector || ''}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      repairVikInspector: e.target.value,
                    }))
                  }
                  className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs disabled:bg-slate-100"
                >
                  <option value="">— Не указан —</option>
                  {inspectors.map((ins) => (
                    <option key={ins.fullName} value={ins.fullName}>
                      {ins.fullName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Блок 3: Контроль физическими методами НК после ремонта */}
          <div className="p-3 bg-white rounded-lg border border-amber-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                3. Приемка после ремонта — Неразрушающий контроль НК
              </span>
              <span className="text-[10px] text-slate-500">
                Заполняет: Специалист ЛНК
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              <div>
                <label className="block text-[11px] text-slate-600 mb-0.5">
                  Метод НК ремонта
                </label>
                <select
                  disabled={!rbac.canEditNdtFields}
                  value={form.repairNdtType || 'Не требуется'}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      repairNdtType: e.target.value as NdtMethod,
                    }))
                  }
                  className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                >
                  <option value="РК">РК</option>
                  <option value="УЗК">УЗК</option>
                  <option value="РК+УЗК">РК+УЗК</option>
                  <option value="ПВК">ПВК</option>
                  <option value="МК">МК</option>
                  <option value="Не требуется">Не требуется</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-0.5">
                  Результат НК ремонта
                </label>
                <select
                  disabled={
                    !rbac.canEditNdtFields ||
                    form.repairNdtType === 'Не требуется'
                  }
                  value={form.repairNdtResult || 'Не проводился'}
                  onChange={(e) => {
                    const nextVal = e.target.value as ControlResult;
                    setForm((prev) => ({
                      ...prev,
                      repairNdtResult: nextVal,
                      ...(nextVal === 'Вырезать' || nextVal === 'Ремонт'
                        ? {
                            repairAction: 'Вырезано',
                          }
                        : {}),
                    }));
                  }}
                  className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-bold"
                >
                  <option value="Не проводился">Не проводился</option>
                  <option value="Годен">Годен</option>
                  <option value="Вырезать">Брак — Вырезать катушку</option>
                  <option value="В работе">В работе</option>
                </select>
              </div>
              <div>
                <label className="flex items-center justify-between text-[11px] text-slate-600 mb-0.5">
                  <span>Дата НК ремонта</span>
                  <span className="font-mono text-[#1e3799] font-semibold">
                    {formatDateDDMMYY(form.repairNdtDate) || '—'}
                  </span>
                </label>
                <input
                  type="date"
                  disabled={
                    !rbac.canEditNdtFields ||
                    form.repairNdtType === 'Не требуется' ||
                    form.repairNdtResult === 'Не проводился'
                  }
                  value={form.repairNdtDate || ''}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      repairNdtDate: e.target.value,
                    }))
                  }
                  className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-0.5">
                  № заключения НК
                </label>
                <input
                  type="text"
                  disabled={
                    !rbac.canEditNdtFields ||
                    form.repairNdtType === 'Не требуется' ||
                    form.repairNdtResult === 'Не проводился'
                  }
                  value={form.repairNdtNumber || ''}
                  placeholder={`${form.repairNdtType || 'НК'}-Р-${form.jointNumber}`}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      repairNdtNumber: e.target.value,
                    }))
                  }
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-0.5">
                  Дефектоскопист НК
                </label>
                <select
                  disabled={
                    !rbac.canEditNdtFields ||
                    form.repairNdtType === 'Не требуется' ||
                    form.repairNdtResult === 'Не проводился'
                  }
                  value={form.repairNdtInspector || ''}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      repairNdtInspector: e.target.value,
                    }))
                  }
                  className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs disabled:bg-slate-100"
                >
                  <option value="">— Не указан —</option>
                  {inspectors.map((ins) => (
                    <option key={ins.fullName} value={ins.fullName}>
                      {ins.fullName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-8 rounded-xl bg-white border border-slate-200 text-center space-y-3 shadow-2xs">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-800">
            Сварной стык не требует ремонта
          </h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            По результатам первичного контроля (ВИК и НК) дефектов не зафиксировано. Специализированные графы ремонта и повторного контроля активируются автоматически при переводе стыка в статус «Ремонт» или «Вырезать».
          </p>
        </div>
      )}
    </div>
  );
};
