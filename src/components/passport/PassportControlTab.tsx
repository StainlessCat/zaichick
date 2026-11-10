import React from 'react';
import { Lock } from 'lucide-react';
import {
  ControlResult,
  InspectorProfile,
  NdtMethod,
  UserAccount,
  WeldJoint,
} from '../../types/welding';
import { formatDateDDMMYY } from '../../utils/weldingLogic';
import { formatInspectorShortName } from '../../utils/rbac';

export interface PassportControlTabProps {
  form: WeldJoint;
  setForm: React.Dispatch<React.SetStateAction<WeldJoint>>;
  rbac: {
    canEditNdtFields: boolean;
    canEditPrepAndWeldingFields: boolean;
    categoryLabel: string;
  };
  currentUser?: UserAccount;
  inspectors: InspectorProfile[];
}

export const PassportControlTab: React.FC<PassportControlTabProps> = ({
  form,
  setForm,
  rbac,
  currentUser,
  inspectors,
}) => {
  const isPrimaryDefective =
    form.vikResult === 'Ремонт' ||
    form.vikResult === 'Вырезать' ||
    form.ndtResult === 'Ремонт' ||
    form.ndtResult === 'Вырезать';

  return (
    <fieldset
      disabled={!rbac.canEditNdtFields}
      className={`border-0 p-0 m-0 min-w-0 space-y-4 ${
        !rbac.canEditNdtFields
          ? 'opacity-75 pointer-events-none select-none'
          : ''
      }`}
    >
      {!rbac.canEditNdtFields && (
        <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-[11px] text-slate-600 font-medium">
          <span className="inline-flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-slate-500" />
            <span>
              Поля ВИК, первичного и дублирующего НК заблокированы для роли «{rbac.categoryLabel}» (редактируются только Специалистом ЛНК)
            </span>
          </span>
        </div>
      )}
      {rbac.canEditNdtFields && currentUser && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[#e8f1fc] border border-sky-200 text-[11px] text-[#1e3799] font-medium">
          <span>
            Выполняется приёмка по ВИК и НК под учётной записью:{' '}
            <strong>{currentUser.fullName}</strong>
          </span>
          <button
            type="button"
            onClick={() => {
              const mySign =
                formatInspectorShortName(currentUser.fullName) ||
                currentUser.fullName;
              const defaultCtrlDate =
                form.weldingDate || new Date().toISOString().slice(0, 10);
              setForm((prev) => ({
                ...prev,
                vikResult:
                  prev.vikResult === 'Не проводился'
                    ? 'Годен'
                    : prev.vikResult,
                vikDate: prev.vikDate || defaultCtrlDate,
                vikInspector: mySign,
                ndtResult:
                  prev.ndtType !== 'Не требуется' &&
                  prev.ndtResult === 'Не проводился'
                    ? 'Годен'
                    : prev.ndtResult,
                ndtDate:
                  prev.ndtType !== 'Не требуется'
                    ? prev.ndtDate || defaultCtrlDate
                    : prev.ndtDate,
                ndtInspector:
                  prev.ndtType !== 'Не требуется'
                    ? mySign
                    : prev.ndtInspector,
              }));
            }}
            className="px-2.5 py-1 rounded bg-[#1e3799] text-white hover:bg-[#15276e] font-semibold text-[11px] cursor-pointer"
          >
            Подписать ВИК и НК моим именем (
            {formatInspectorShortName(currentUser.fullName)})
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
        {/* Контроль ВИК */}
        <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2.5">
          <h4 className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-1.5">
            Контроль ВИК
          </h4>
          <div>
            <label className="block text-[11px] text-slate-600 mb-0.5">
              Результат ВИК
            </label>
            <select
              value={form.vikResult}
              onChange={(e) => {
                const nextVik = e.target.value as ControlResult;
                setForm((prev) => {
                  const isDef = nextVik === 'Ремонт' || nextVik === 'Вырезать';
                  return {
                    ...prev,
                    vikResult: nextVik,
                    vikReportNumber:
                      nextVik === 'Не проводился' ? '' : prev.vikReportNumber,
                    vikDate: nextVik === 'Не проводился' ? '' : prev.vikDate,
                    vikInspector:
                      nextVik === 'Не проводился' ? '' : prev.vikInspector,
                    dupNdtType: isDef ? 'Не требуется' : prev.dupNdtType,
                    dupNdtResult: isDef ? 'Не проводился' : prev.dupNdtResult,
                    dupNdtDate: isDef ? '' : prev.dupNdtDate,
                    dupNdtInspector: isDef ? '' : prev.dupNdtInspector,
                    repairAction:
                      isDef && !prev.repairAction
                        ? nextVik === 'Вырезать'
                          ? 'Вырезано'
                          : 'Ремонт'
                        : prev.repairAction,
                    repairTechCard:
                      isDef && !prev.repairTechCard
                        ? prev.techCardNumber
                          ? `${prev.techCardNumber}-Р`
                          : 'ТК-Р'
                        : prev.repairTechCard,
                    repairWelderStamp:
                      isDef && !prev.repairWelderStamp
                        ? prev.welderStamp
                        : prev.repairWelderStamp,
                    repairForeman:
                      isDef && !prev.repairForeman
                        ? prev.responsiblePerson
                        : prev.repairForeman,
                  };
                });
              }}
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-medium"
            >
              <option value="Годен">Годен</option>
              <option value="Ремонт">Ремонт</option>
              <option value="Вырезать">Вырезать</option>
              <option value="В работе">В работе</option>
              <option value="Не проводился">Не проводился</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-slate-600 mb-0.5">
              № заключения ВИК
            </label>
            <input
              type="text"
              value={form.vikReportNumber || ''}
              disabled={form.vikResult === 'Не проводился'}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, vikReportNumber: e.target.value }))
              }
              placeholder="Напр.: ЗАК-ВИК-102-26"
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>
          <div>
            <label className="flex items-center justify-between text-[11px] text-slate-600 mb-0.5">
              <span>Дата ВИК</span>
              <span className="font-mono text-[#1e3799] font-semibold">
                {formatDateDDMMYY(form.vikDate) || '—'}
              </span>
            </label>
            <input
              type="date"
              value={form.vikDate}
              disabled={form.vikResult === 'Не проводился'}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, vikDate: e.target.value }))
              }
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-600 mb-0.5">
              Дефектоскопист ВИК
            </label>
            <select
              value={form.vikInspector}
              disabled={form.vikResult === 'Не проводился'}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, vikInspector: e.target.value }))
              }
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs disabled:bg-slate-100 disabled:text-slate-400"
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

        {/* Неразрушающий контроль НК */}
        <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2.5">
          <h4 className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-1.5">
            Неразрушающий контроль НК
          </h4>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-slate-600 mb-0.5">
                Тип НК
              </label>
              <select
                value={form.ndtType}
                onChange={(e) => {
                  const nextType = e.target.value as NdtMethod;
                  setForm((prev) => ({
                    ...prev,
                    ndtType: nextType,
                    ndtReportNumber:
                      nextType === 'Не требуется' ? '' : prev.ndtReportNumber,
                    ndtResult:
                      nextType === 'Не требуется'
                        ? 'Не проводился'
                        : prev.ndtResult === 'Не проводился'
                        ? 'В работе'
                        : prev.ndtResult,
                    ndtDate: nextType === 'Не требуется' ? '' : prev.ndtDate,
                    ndtInspector:
                      nextType === 'Не требуется' ? '' : prev.ndtInspector,
                  }));
                }}
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
                Результат НК
              </label>
              <select
                value={form.ndtResult}
                disabled={form.ndtType === 'Не требуется'}
                onChange={(e) => {
                  const nextRes = e.target.value as ControlResult;
                  setForm((prev) => {
                    const isDef = nextRes === 'Ремонт' || nextRes === 'Вырезать';
                    return {
                      ...prev,
                      ndtResult: nextRes,
                      ndtReportNumber:
                        nextRes === 'Не проводился' ? '' : prev.ndtReportNumber,
                      ndtDate: nextRes === 'Не проводился' ? '' : prev.ndtDate,
                      ndtInspector:
                        nextRes === 'Не проводился' ? '' : prev.ndtInspector,
                      dupNdtType: isDef ? 'Не требуется' : prev.dupNdtType,
                      dupNdtResult: isDef ? 'Не проводился' : prev.dupNdtResult,
                      dupNdtDate: isDef ? '' : prev.dupNdtDate,
                      dupNdtInspector: isDef ? '' : prev.dupNdtInspector,
                      repairAction:
                        isDef && !prev.repairAction
                          ? nextRes === 'Вырезать'
                            ? 'Вырезано'
                            : 'Ремонт'
                          : prev.repairAction,
                      repairTechCard:
                        isDef && !prev.repairTechCard
                          ? prev.techCardNumber
                            ? `${prev.techCardNumber}-Р`
                            : 'ТК-Р'
                          : prev.repairTechCard,
                      repairWelderStamp:
                        isDef && !prev.repairWelderStamp
                          ? prev.welderStamp
                          : prev.repairWelderStamp,
                      repairForeman:
                        isDef && !prev.repairForeman
                          ? prev.responsiblePerson
                          : prev.repairForeman,
                      repairNdtType:
                        isDef &&
                        (!prev.repairNdtType ||
                          prev.repairNdtType === 'Не требуется')
                          ? prev.ndtType !== 'Не требуется'
                            ? prev.ndtType
                            : 'РК'
                          : prev.repairNdtType,
                    };
                  });
                }}
                className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-medium disabled:bg-slate-100 disabled:text-slate-400"
              >
                <option value="Годен">Годен</option>
                <option value="Ремонт">Ремонт</option>
                <option value="Вырезать">Вырезать</option>
                <option value="В работе">В работе</option>
                <option value="Не проводился">Не проводился</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-slate-600 mb-0.5">
              № заключения НК
            </label>
            <input
              type="text"
              value={form.ndtReportNumber || ''}
              disabled={
                form.ndtType === 'Не требуется' ||
                form.ndtResult === 'Не проводился'
              }
              onChange={(e) =>
                setForm((prev) => ({ ...prev, ndtReportNumber: e.target.value }))
              }
              placeholder="Напр.: ЗАК-РК-104-26"
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>
          <div>
            <label className="flex items-center justify-between text-[11px] text-slate-600 mb-0.5">
              <span>Дата НК</span>
              <span className="font-mono text-[#1e3799] font-semibold">
                {formatDateDDMMYY(form.ndtDate) || '—'}
              </span>
            </label>
            <input
              type="date"
              value={form.ndtDate}
              disabled={
                form.ndtType === 'Не требуется' ||
                form.ndtResult === 'Не проводился'
              }
              onChange={(e) =>
                setForm((prev) => ({ ...prev, ndtDate: e.target.value }))
              }
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-600 mb-0.5">
              Дефектоскопист НК
            </label>
            <select
              value={form.ndtInspector}
              disabled={
                form.ndtType === 'Не требуется' ||
                form.ndtResult === 'Не проводился'
              }
              onChange={(e) =>
                setForm((prev) => ({ ...prev, ndtInspector: e.target.value }))
              }
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs disabled:bg-slate-100 disabled:text-slate-400"
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

        {/* Дублирующий контроль */}
        <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2.5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <h4 className="text-xs font-bold text-slate-900">
              Дублирующий контроль
            </h4>
            {isPrimaryDefective && (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                Не требуется (первичный дефект)
              </span>
            )}
          </div>

          {isPrimaryDefective ? (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-900 space-y-1.5">
              <div className="font-semibold flex items-center gap-1.5 text-amber-800">
                <span>ℹ️</span> Дублирующий контроль не проводится
              </div>
              <p className="text-[11px] leading-relaxed text-amber-700">
                По результатам первичного контроля зафиксирован неудовлетворительный результат (
                <span className="font-bold">
                  {form.ndtResult === 'Ремонт' || form.ndtResult === 'Вырезать'
                    ? `НК (${form.ndtType}): ${form.ndtResult}`
                    : `ВИК: ${form.vikResult}`}
                </span>
                ). Согласно регламенту контроль дефектного шва не дублируется — соединение направлено на исправление (ремонт/вырезку). Приемка будет выполнена после устранения дефекта во вкладке «Ремонт».
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-600 mb-0.5">
                    Тип дубл. НК
                  </label>
                  <select
                    value={form.dupNdtType}
                    onChange={(e) => {
                      const nextDupType = e.target.value as NdtMethod;
                      setForm((prev) => ({
                        ...prev,
                        dupNdtType: nextDupType,
                        dupNdtReportNumber:
                          nextDupType === 'Не требуется'
                            ? ''
                            : prev.dupNdtReportNumber,
                        dupNdtResult:
                          nextDupType === 'Не требуется'
                            ? 'Не проводился'
                            : prev.dupNdtResult === 'Не проводился'
                            ? 'В работе'
                            : prev.dupNdtResult,
                        dupNdtDate:
                          nextDupType === 'Не требуется' ? '' : prev.dupNdtDate,
                        dupNdtInspector:
                          nextDupType === 'Не требуется'
                            ? ''
                            : prev.dupNdtInspector,
                      }));
                    }}
                    className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                  >
                    <option value="Не требуется">Не требуется</option>
                    <option value="УЗК">УЗК</option>
                    <option value="РК">РК</option>
                    <option value="ПВК">ПВК</option>
                    <option value="МК">МК</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-0.5">
                    Результат дубл.
                  </label>
                  <select
                    value={form.dupNdtResult}
                    disabled={form.dupNdtType === 'Не требуется'}
                    onChange={(e) => {
                      const nextDupRes = e.target.value as ControlResult;
                      setForm((prev) => {
                        const isDef =
                          nextDupRes === 'Ремонт' || nextDupRes === 'Вырезать';
                        return {
                          ...prev,
                          dupNdtResult: nextDupRes,
                          dupNdtReportNumber:
                            nextDupRes === 'Не проводился'
                              ? ''
                              : prev.dupNdtReportNumber,
                          dupNdtDate:
                            nextDupRes === 'Не проводился' ? '' : prev.dupNdtDate,
                          dupNdtInspector:
                            nextDupRes === 'Не проводился'
                              ? ''
                              : prev.dupNdtInspector,
                          repairAction:
                            isDef && !prev.repairAction
                              ? nextDupRes === 'Вырезать'
                                ? 'Вырезано'
                                : 'Ремонт'
                              : prev.repairAction,
                          repairTechCard:
                            isDef && !prev.repairTechCard
                              ? prev.techCardNumber
                                ? `${prev.techCardNumber}-Р`
                                : 'ТК-Р'
                              : prev.repairTechCard,
                          repairWelderStamp:
                            isDef && !prev.repairWelderStamp
                              ? prev.welderStamp
                              : prev.repairWelderStamp,
                          repairForeman:
                            isDef && !prev.repairForeman
                              ? prev.responsiblePerson
                              : prev.repairForeman,
                        };
                      });
                    }}
                    className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-medium disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="Не проводился">Не проводился</option>
                    <option value="Годен">Годен</option>
                    <option value="Ремонт">Ремонт</option>
                    <option value="Вырезать">Вырезать</option>
                    <option value="В работе">В работе</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-0.5">
                  № заключения дубл. НК
                </label>
                <input
                  type="text"
                  value={form.dupNdtReportNumber || ''}
                  disabled={
                    form.dupNdtType === 'Не требуется' ||
                    form.dupNdtResult === 'Не проводился'
                  }
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      dupNdtReportNumber: e.target.value,
                    }))
                  }
                  placeholder="Напр.: ЗАК-УЗК-089-26"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>
              <div>
                <label className="flex items-center justify-between text-[11px] text-slate-600 mb-0.5">
                  <span>Дата дубл. НК</span>
                  <span className="font-mono text-[#1e3799] font-semibold">
                    {formatDateDDMMYY(form.dupNdtDate) || '—'}
                  </span>
                </label>
                <input
                  type="date"
                  value={form.dupNdtDate}
                  disabled={
                    form.dupNdtType === 'Не требуется' ||
                    form.dupNdtResult === 'Не проводился'
                  }
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, dupNdtDate: e.target.value }))
                  }
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-0.5">
                  Дефектоскопист дубл. НК
                </label>
                <select
                  value={form.dupNdtInspector}
                  disabled={
                    form.dupNdtType === 'Не требуется' ||
                    form.dupNdtResult === 'Не проводился'
                  }
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      dupNdtInspector: e.target.value,
                    }))
                  }
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="">— Не указан —</option>
                  {inspectors.map((ins) => (
                    <option key={ins.fullName} value={ins.fullName}>
                      {ins.fullName}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ДОПОЛНИТЕЛЬНЫЕ ДАННЫЕ ДЛЯ ФОРМЫ ЖУРНАЛА ПО ГОСТ 32569-2013 */}
      <div className="w-full p-3.5 rounded-xl bg-white border border-slate-200 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <div className="text-xs font-bold text-slate-900">
            Специальные графы журнала сварки по ГОСТ 32569-2013
          </div>
          <span className="text-[11px] text-slate-500">
            Инженер ПТО · Специалист ЛНК
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div>
            <label
              title="Отметка о контроле корня шва"
              className="block text-[11px] font-medium text-slate-600 mb-1 h-4 leading-4 whitespace-nowrap truncate"
            >
              Контроль корня шва
            </label>
            <input
              type="text"
              disabled={!rbac.canEditPrepAndWeldingFields}
              value={form.rootWeldControl || ''}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, rootWeldControl: e.target.value }))
              }
              placeholder="н/п / Годен"
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>
          <div>
            <label
              title="Стилоскопирование шва (№ заключения, дата)"
              className="block text-[11px] font-medium text-slate-600 mb-1 h-4 leading-4 whitespace-nowrap truncate"
            >
              Стилоскопирование
            </label>
            <input
              type="text"
              disabled={!rbac.canEditPrepAndWeldingFields}
              value={form.steeloscopyInfo || ''}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, steeloscopyInfo: e.target.value }))
              }
              placeholder="н/п / Соответствует, акт №..."
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>
          <div>
            <label
              title="Ф.И.О. оператора термиста, клеймо"
              className="block text-[11px] font-medium text-slate-600 mb-1 h-4 leading-4 whitespace-nowrap truncate"
            >
              Термист и клеймо
            </label>
            <input
              type="text"
              disabled={!rbac.canEditPrepAndWeldingFields}
              value={form.heatTreatOperator || ''}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, heatTreatOperator: e.target.value }))
              }
              placeholder="н/п"
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>
          <div>
            <label
              title="№ диаграммы термообработки"
              className="block text-[11px] font-medium text-slate-600 mb-1 h-4 leading-4 whitespace-nowrap truncate"
            >
              № диаграммы ТО
            </label>
            <input
              type="text"
              disabled={!rbac.canEditPrepAndWeldingFields}
              value={form.heatTreatDiagramNumber || ''}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  heatTreatDiagramNumber: e.target.value,
                }))
              }
              placeholder="н/п"
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>
          <div>
            <label
              title="Твердость металла шва (№ заключения, дата)"
              className="block text-[11px] font-medium text-slate-600 mb-1 h-4 leading-4 whitespace-nowrap truncate"
            >
              Твердость металла
            </label>
            <input
              type="text"
              disabled={!rbac.canEditPrepAndWeldingFields}
              value={form.hardnessTestInfo || ''}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, hardnessTestInfo: e.target.value }))
              }
              placeholder="н/п / HB 185, акт №..."
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>
          <div>
            <label
              title="№ заключения неразрушающего контроля"
              className="block text-[11px] font-medium text-slate-600 mb-1 h-4 leading-4 whitespace-nowrap truncate"
            >
              № заключения НК
            </label>
            <input
              type="text"
              disabled={!rbac.canEditNdtFields}
              value={form.ndtReportNumber || ''}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, ndtReportNumber: e.target.value }))
              }
              placeholder="Напр.: ЗАК-РК-104-26"
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>
          <div className="sm:col-span-2">
            <label
              title="Измерение ферритной фазы (№ заключения, дата)"
              className="block text-[11px] font-medium text-slate-600 mb-1 h-4 leading-4 whitespace-nowrap truncate"
            >
              Ферритная фаза
            </label>
            <input
              type="text"
              disabled={!rbac.canEditNdtFields}
              value={form.ferritePhaseInfo || ''}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, ferritePhaseInfo: e.target.value }))
              }
              placeholder="н/п / 4,2%, акт №..."
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>
        </div>
      </div>
    </fieldset>
  );
};
