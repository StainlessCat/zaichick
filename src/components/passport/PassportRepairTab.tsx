import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import {
  ControlResult,
  InspectorProfile,
  NdtMethod,
  TechCardItem,
  WelderProfile,
  WeldJoint,
} from '../../types/welding';
import { formatDateDDMMYY, isJointDefective } from '../../utils/weldingLogic';

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

  return (
    <div className="space-y-4">
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
                  disabled={!rbac.canEditPrepAndWeldingFields}
                  value={form.repairAction || 'Ремонт'}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, repairAction: e.target.value }))
                  }
                  className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-semibold"
                >
                  <option value="Ремонт">Ремонт</option>
                  <option value="Вырезано">Вырезано</option>
                  <option value="Требуется ремонт">Требуется ремонт</option>
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
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      repairVikResult: e.target.value as ControlResult,
                    }))
                  }
                  className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-bold"
                >
                  <option value="Не проводился">Не проводился</option>
                  <option value="Годен">Годен</option>
                  <option value="Ремонт">Ремонт</option>
                  <option value="Вырезать">Вырезать</option>
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
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      repairNdtResult: e.target.value as ControlResult,
                    }))
                  }
                  className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-bold"
                >
                  <option value="Не проводился">Не проводился</option>
                  <option value="Годен">Годен</option>
                  <option value="Ремонт">Ремонт</option>
                  <option value="Вырезать">Вырезать</option>
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
