import React, { useMemo } from 'react';
import {
  Flame,
  Lock,
  CheckCircle2,
  AlertTriangle,
  CloudSun,
  Sparkles,
} from 'lucide-react';
import type {
  WeldJoint,
  TechCardItem,
  WeldingMaterialCertificate,
  WelderProfile,
  WeldingType,
  JointType,
} from '../../types/welding';
import type { RolePermissions } from '../../utils/rbac';
import {
  formatDateDDMMYY,
  normalizeDecimalInput,
  findWelderByStamp,
  checkNaksCertStatus,
  findMatchingTechCard,
  classifyJointElements,
  getWelderCertForMethod,
  validateWelderNaksAttestation,
  GOST_16037_JOINT_TYPES,
  NAKS_WELDING_POSITIONS,
} from '../../utils/weldingLogic';
import { Button, FormField, Input, Select } from '../ui';
import { WelderStampCombobox } from './WelderStampCombobox';

export const WELDING_TYPE_OPTIONS: WeldingType[] = [
  'РАД',
  'РД',
  'РАД+РД',
  'МП',
  'АФ',
  'АПГ',
];

export interface PassportWeldingTabProps {
  form: WeldJoint;
  setForm: React.Dispatch<React.SetStateAction<WeldJoint>>;
  rbac: RolePermissions;
  techCards: TechCardItem[];
  weldingMaterialsList: WeldingMaterialCertificate[];
  welder1Stamp: string;
  setWelder1Stamp: (val: string) => void;
  welder2Stamp: string;
  setWelder2Stamp: (val: string) => void;
  brigadeStamp: string;
  setBrigadeStamp: (val: string) => void;
  personalWelders: WelderProfile[];
  brigadeProfiles: WelderProfile[];
  currentWeatherStationName: string;
  archivedStationTemp?: string;
  selectedTechCard?: TechCardItem;
  weldingTypeValidation: { isValid: boolean; message: string };
  preheatValidation: { isValid: boolean; message: string; requiredMinC: number };
  handleSelectTechCard: (tcNumber: string) => void;
  handleWelder1Change: (newStamp: string) => void;
  handleWelder2Change: (newStamp: string) => void;
  handleBrigadeStampChange: (newStamp: string) => void;
}

export const PassportWeldingTab: React.FC<PassportWeldingTabProps> = ({
  form,
  setForm,
  rbac,
  techCards,
  weldingMaterialsList,
  welder1Stamp,
  setWelder1Stamp,
  welder2Stamp,
  setWelder2Stamp,
  brigadeStamp,
  setBrigadeStamp,
  personalWelders,
  brigadeProfiles,
  currentWeatherStationName,
  archivedStationTemp,
  selectedTechCard,
  weldingTypeValidation,
  preheatValidation,
  handleSelectTechCard,
  handleWelder1Change,
  handleWelder2Change,
  handleBrigadeStampChange,
}) => {
  const currentJointDiam = form.elem1DiameterMm ?? form.diameterMm;
  const currentJointWall = form.elem1WallThickness ?? form.wallThickness;
  const autoMatchedTechCard = useMemo(() => {
    const combination = classifyJointElements(
      undefined,
      form.elem1Name,
      undefined,
      form.elem2Name
    );
    const jointKind =
      form.jointKind ||
      (form.gostJointType?.startsWith('У') || form.gostJointType?.startsWith('Т')
        ? 'Угловое'
        : 'Стыковое');
    return findMatchingTechCard(techCards, {
      diameterMm: currentJointDiam,
      wallThicknessMm: currentJointWall,
      weldingType: form.weldingType,
      steelGrade: form.elem1Material,
      jointKind,
      elementCombination: combination,
    });
  }, [
    techCards,
    currentJointDiam,
    currentJointWall,
    form.weldingType,
    form.elem1Material,
    form.jointKind,
    form.gostJointType,
    form.elem1Name,
    form.elem2Name,
  ]);

  const filteredGostOptions = useMemo(() => {
    const isAng = form.jointKind === 'Угловое';
    return GOST_16037_JOINT_TYPES.filter((g) =>
      isAng ? g.category === 'Угловое' : g.category === 'Стыковое'
    );
  }, [form.jointKind]);
  return (
    <fieldset
      disabled={!rbac.canEditPrepAndWeldingFields}
      className={`space-y-4 border-0 p-0 m-0 min-w-0 ${
        !rbac.canEditPrepAndWeldingFields
          ? 'opacity-75 pointer-events-none select-none'
          : ''
      }`}
    >
      <div className="p-4 rounded-xl bg-white border-2 border-[#1e3799]/25 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-[#1e3799]" />
            <h3 className="text-xs font-bold text-[#1e3799]">
              Сварочные работы
            </h3>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                !form.weldingDate
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : form.ndtResult === 'Годен'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-sky-50 text-[#1e3799] border-sky-200'
              }`}
            >
              {!form.weldingDate
                ? 'Черновик сборки (до сварки)'
                : form.ndtResult === 'Годен'
                ? 'Сварен и принят по НК'
                : 'Сварка выполнена'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {rbac.canEditPrepAndWeldingFields && form.weldingDate && (
              <button
                type="button"
                onClick={() => {
                  setWelder1Stamp('');
                  setWelder2Stamp('');
                  setBrigadeStamp('');
                  setForm((prev: WeldJoint) => ({
                    ...prev,
                    weldingDate: '',
                    welderStamp: '',
                    welderStampsList: [],
                    brigadeStamp: '',
                    welderFullName: '',
                    welderCertNumber: '',
                    ambientTemp: '',
                    preheatTemp: '',
                  }));
                }}
                title="Очистить поля сварки для сохранения стыка на этапе сборки (до выполнения сварочных работ)"
                className="px-2.5 py-1 rounded bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100 text-[11px] font-semibold transition-colors cursor-pointer"
              >
                Черновик сборки (до сварки)
              </button>
            )}
            {!rbac.canEditPrepAndWeldingFields && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 border border-slate-300 text-slate-600 text-xs font-semibold">
                <Lock className="w-3.5 h-3.5" />
                <span>только чтение</span>
              </span>
            )}
          </div>
        </div>

        {/* Строка 1: Дата сварки, Технологическая карта, Вид сварки (с проверкой по ТК), Авто-температура воздуха */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-3">
            <FormField label="Дата сварки *">
              <Input
                type="date"
                value={form.weldingDate}
                onChange={(e) =>
                  setForm((prev: WeldJoint) => ({
                    ...prev,
                    weldingDate: e.target.value,
                  }))
                }
                aria-label="Дата сварки"
                className="w-full font-mono font-semibold"
              />
            </FormField>
          </div>

          <div className="lg:col-span-4">
            <FormField label="Техкарта (ТК) *">
              <Select
                value={form.techCardNumber}
                onChange={(e) => handleSelectTechCard(e.target.value)}
                aria-label="Технологическая карта на сварку"
                className="w-full font-mono font-bold"
              >
                {techCards.map((tc) => (
                  <option key={tc.id} value={tc.number}>
                    {tc.number} · {tc.weldingType} (Ø{tc.minDiameterMm}–{tc.maxDiameterMm} мм)
                  </option>
                ))}
                {!techCards.some((tc) => tc.number === form.techCardNumber) &&
                  form.techCardNumber && (
                    <option value={form.techCardNumber}>
                      {form.techCardNumber}
                    </option>
                  )}
              </Select>
            </FormField>
          </div>

          <div className="lg:col-span-3">
            <FormField label="Вид сварки *">
              <Select
                value={form.weldingType}
                onChange={(e) => {
                  const newMethod = e.target.value as WeldingType;
                  setForm((prev: WeldJoint) => {
                    const firstStamp = prev.welderStamp.split(/[\s,]+/)[0];
                    const w1 = findWelderByStamp(personalWelders, firstStamp, false);
                    const newCert = w1
                      ? getWelderCertForMethod(w1, newMethod).certNumber || prev.welderCertNumber
                      : prev.welderCertNumber;
                    return {
                      ...prev,
                      weldingType: newMethod,
                      welderCertNumber: newCert,
                    };
                  });
                }}
                aria-label="Вид сварки"
                className={`w-full font-mono font-bold ${
                  weldingTypeValidation.isValid
                    ? 'border-emerald-400 text-emerald-900'
                    : 'border-red-400 text-red-900 bg-red-50/40'
                }`}
              >
                {WELDING_TYPE_OPTIONS.map((wt: WeldingType) => (
                  <option key={wt} value={wt}>
                    {wt}
                  </option>
                ))}
              </Select>
            </FormField>
            <div
              className={`mt-1 px-2 py-1 rounded text-[10px] flex items-center gap-1 ${
                weldingTypeValidation.isValid
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-800 border border-red-300 font-semibold'
              }`}
            >
              {weldingTypeValidation.isValid ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-3 h-3 text-red-600 shrink-0" />
              )}
              <span className="truncate" title={weldingTypeValidation.message}>
                {weldingTypeValidation.message}
              </span>
            </div>
          </div>

          <div className="lg:col-span-2">
            <FormField label="T возд., °C">
              {rbac.canEditPrepAndWeldingFields ? (
                <div className="relative">
                  <Input
                    type="text"
                    value={form.ambientTemp || ''}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        ambientTemp: normalizeDecimalInput(e.target.value),
                      }))
                    }
                    placeholder="нет данных"
                    title="Температура воздуха"
                    className="w-full pl-7 pr-2 font-mono font-bold"
                  />
                  <CloudSun
                    className="w-3.5 h-3.5 absolute left-2 top-2 text-sky-600 pointer-events-none"
                  />
                </div>
              ) : (
                <div
                  className="h-8 px-2 border border-slate-300 rounded-md bg-slate-50 flex items-center text-xs font-mono font-bold text-slate-700"
                >
                  {form.ambientTemp ? `${form.ambientTemp} °C` : 'нет данных'}
                </div>
              )}
            </FormField>

            <div className="mt-1 flex items-center justify-between text-[10px]">
              <span
                className="truncate text-slate-500"
                title={currentWeatherStationName}
              >
                {currentWeatherStationName}
              </span>
              {archivedStationTemp && form.ambientTemp !== archivedStationTemp && form.ambientTemp !== '+' + archivedStationTemp && rbac.canEditPrepAndWeldingFields && (
                <button
                  type="button"
                  onClick={() => {
                    const raw = String(archivedStationTemp).trim();
                    const num = Number(raw);
                    const fmt =
                      !raw.startsWith('+') && !raw.startsWith('-') && !Number.isNaN(num) && num > 0
                        ? `+${num}`
                        : raw;
                    setForm((prev) => ({ ...prev, ambientTemp: fmt }));
                  }}
                  className="text-sky-700 hover:text-sky-900 font-semibold underline shrink-0 cursor-pointer ml-1"
                  title={`Подставить значение метеостанции (${archivedStationTemp} °C)`}
                >
                  Из архива (${archivedStationTemp}°)
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Строка 2: Поиск и выбор сварщиков по номеру клейма во время ввода */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
            <WelderStampCombobox
              label="Сварщик 1 *"
              ariaLabel="Сварщик 1"
              placeholder="Введите клеймо (напр. А142)..."
              emptyOptionLabel="— Не выбран —"
              value={welder1Stamp}
              options={personalWelders}
              isPrimary
              requiredWeldingMethod={
                form.weldingType === 'РАД+РД' ? 'РАД' : form.weldingType
              }
              referenceDate={form.weldingDate}
              onChange={handleWelder1Change}
            />

            <WelderStampCombobox
              label="Сварщик 2"
              ariaLabel="Сварщик 2"
              placeholder="Введите клеймо (напр. К089)..."
              emptyOptionLabel="— Без второго сварщика —"
              value={welder2Stamp}
              options={personalWelders}
              excludeStamps={welder1Stamp ? [welder1Stamp] : []}
              requiredWeldingMethod={
                form.weldingType === 'РАД+РД' ? 'РД' : form.weldingType
              }
              referenceDate={form.weldingDate}
              onChange={handleWelder2Change}
            />

            <WelderStampCombobox
              label="Бригадное клеймо"
              ariaLabel="Бригадное клеймо"
              placeholder="Введите клеймо (напр. БР-01)..."
              emptyOptionLabel="— Без бригадного клейма —"
              value={brigadeStamp}
              options={brigadeProfiles}
              isBrigade
              requiredWeldingMethod={form.weldingType}
              referenceDate={form.weldingDate}
              onChange={handleBrigadeStampChange}
            />
          </div>

          {/* Автоматически подтянутые ФИО сварщиков и № удостоверений НАКС */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200/80">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-0.5">
                Итоговое клеймо в журнале
              </label>
              <div className="px-2.5 py-1.5 rounded bg-white border border-slate-200 font-mono text-xs font-bold text-[#1e3799]">
                {form.welderStamp || '—'}
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-0.5">
                ФИО сварщика(ов)
              </label>
              <div
                aria-label="ФИО сварщика автоподстановка"
                className="px-2.5 py-1.5 rounded bg-white border border-slate-200 text-xs font-semibold text-slate-900"
              >
                {form.welderFullName || '—'}
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-0.5">
                № удостоверения НАКС
              </label>
              <div
                aria-label="Номер удостоверения сварщика автоподстановка"
                className="px-2.5 py-1.5 rounded bg-white border border-slate-200 font-mono text-xs text-slate-800"
              >
                {form.welderCertNumber || '—'}
              </div>
            </div>
          </div>

          {/* Предупреждение о просроченной или истекающей аттестации НАКС */}
          {(() => {
            const selectedProfiles = [
              findWelderByStamp(personalWelders, welder1Stamp, false),
              findWelderByStamp(personalWelders, welder2Stamp, false),
              findWelderByStamp(brigadeProfiles, brigadeStamp, true),
            ].filter(Boolean) as WelderProfile[];

            const expiredWelders = selectedProfiles.filter((wp) => {
              const s = checkNaksCertStatus(wp.certExpiryDate, form.weldingDate);
              return s.badgeVariant === 'expired';
            });

            const expiringWelders = selectedProfiles.filter((wp) => {
              const s = checkNaksCertStatus(wp.certExpiryDate, form.weldingDate);
              return s.badgeVariant === 'expiring';
            });

            if (expiredWelders.length > 0) {
              return (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-300 text-rose-800 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <div>
                    <span className="font-bold">Внимание! Истек срок аттестации НАКС на дату сварки:</span>{' '}
                    {expiredWelders
                      .map(
                        (w) =>
                          `${w.stamp} (${w.fullName}) — до ${formatDateDDMMYY(w.certExpiryDate)}`
                      )
                      .join('; ')}
                    . Сварка просроченным специалистом является грубым нарушением НТД!
                  </div>
                </div>
              );
            }

            if (expiringWelders.length > 0) {
              return (
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <div>
                    <span className="font-bold">Предупреждение:</span> Срок аттестации НАКС сварщика{' '}
                    {expiringWelders
                      .map(
                        (w) =>
                          `${w.stamp} (${w.fullName}) истекает ${formatDateDDMMYY(
                            w.certExpiryDate
                          )}`
                      )
                      .join('; ')}
                    .
                  </div>
                </div>
              );
            }

            // Проверка соответствия области аттестации НАКС параметрам стыка (диаметр, толщина, способ)
            const naksIssues = selectedProfiles.flatMap((wp) => {
              const res = validateWelderNaksAttestation(wp, {
                diameterMm: form.diameterMm,
                wallThickness: form.wallThickness,
                steelGroup: form.elem1Material,
                weldingType: form.weldingType,
              });
              return res.warnings.map((w) => `${wp.stamp} (${wp.fullName}): ${w}`);
            });

            if (naksIssues.length > 0) {
              return (
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2 shadow-2xs">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-bold">Предупреждение по аттестации НАКС:</span>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800">
                      {naksIssues.map((issue, idx) => (
                        <li key={idx}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            }

            return null;
          })()}
        </div>

        {/* Строка 3: Температура подогрева и Сварочные материалы */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-5">
            <FormField label="Температура подогрева, °C *">
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.preheatTemp ?? ''}
                  onChange={(e) =>
                    setForm((prev: WeldJoint) => ({
                      ...prev,
                      preheatTemp: normalizeDecimalInput(e.target.value),
                    }))
                  }
                  placeholder="Напр.: 150"
                  aria-label="Температура подогрева"
                  className={`w-full font-mono font-bold ${
                    preheatValidation.isValid
                      ? 'border-emerald-400 text-emerald-900'
                      : 'border-red-400 text-red-900 bg-red-50/40'
                  }`}
                />
                {preheatValidation.requiredMinC > 0 && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setForm((prev: WeldJoint) => ({
                        ...prev,
                        preheatTemp: String(preheatValidation.requiredMinC),
                      }))
                    }
                    className="shrink-0 text-[11px] font-mono font-semibold"
                    title="Подставить минимальную температуру подогрева по ТК"
                  >
                    ≥ +{preheatValidation.requiredMinC} °C
                  </Button>
                )}
              </div>
            </FormField>
            <div
              className={`mt-1.5 px-2.5 py-1.5 rounded text-[11px] flex items-start gap-1.5 ${
                preheatValidation.isValid
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-800 border border-red-300 font-semibold'
              }`}
            >
              {preheatValidation.isValid ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
              )}
              <span>{preheatValidation.message}</span>
            </div>
          </div>

          <div className="lg:col-span-4">
            <FormField label="Сварочные материалы">
              <Select
                value={form.weldingMaterials}
                onChange={(e) =>
                  setForm((prev: WeldJoint) => ({
                    ...prev,
                    weldingMaterials: e.target.value,
                  }))
                }
                aria-label="Сварочные материалы"
                className="w-full font-mono"
              >
                {weldingMaterialsList.map((wm) => (
                  <option key={wm.id} value={wm.brandAndDiameter}>
                    {wm.brandAndDiameter} ({wm.certificateNumber} · ВК{' '}
                    {formatDateDDMMYY(wm.incomingControlDate)})
                  </option>
                ))}
                {!weldingMaterialsList.some(
                  (wm) => wm.brandAndDiameter === form.weldingMaterials
                ) &&
                  form.weldingMaterials && (
                    <option value={form.weldingMaterials}>
                      {form.weldingMaterials}
                    </option>
                  )}
              </Select>
            </FormField>
          </div>

          <div className="lg:col-span-3">
            <FormField label="Ответственное лицо">
              <Input
                type="text"
                value={form.responsiblePerson}
                onChange={(e) =>
                  setForm((prev: WeldJoint) => ({
                    ...prev,
                    responsiblePerson: e.target.value,
                  }))
                }
                aria-label="Ответственное лицо"
                className="w-full"
              />
            </FormField>
          </div>
        </div>

        {/* Строка 4: Радиопереключатель «Стыковое / Угловое», Место сварки, Тип сварного соединения по ГОСТ 16037, Положение при сварке */}
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-xs font-bold text-slate-800">
              Вид сварного соединения:
            </span>
            <div className="flex items-center gap-4">
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="jointKind"
                  value="Стыковое"
                  checked={form.jointKind !== 'Угловое'}
                  onChange={() =>
                    setForm((prev: WeldJoint) => ({
                      ...prev,
                      jointKind: 'Стыковое',
                      gostJointType: prev.gostJointType?.startsWith('У') ? 'С17' : prev.gostJointType || 'С17',
                    }))
                  }
                  className="w-4 h-4 text-[#1e3799] focus:ring-[#1e3799]"
                />
                <span>Стыковое</span>
              </label>

              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="jointKind"
                  value="Угловое"
                  checked={form.jointKind === 'Угловое'}
                  onChange={() =>
                    setForm((prev: WeldJoint) => ({
                      ...prev,
                      jointKind: 'Угловое',
                      gostJointType: prev.gostJointType?.startsWith('С') ? 'У16' : prev.gostJointType || 'У16',
                    }))
                  }
                  className="w-4 h-4 text-[#1e3799] focus:ring-[#1e3799]"
                />
                <span>Угловое (врезка / штуцер)</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <FormField label="Тип стыка (место) *">
              <Select
                value={form.jointType || 'Монтажный'}
                onChange={(e) =>
                  setForm((prev: WeldJoint) => ({
                    ...prev,
                    jointType: e.target.value as JointType,
                  }))
                }
                aria-label="Тип стыка"
                className="w-full text-xs font-semibold"
              >
                <option value="Монтажный">Монтажный (площадка)</option>
                <option value="Цеховой">Цеховой (цех / база)</option>
              </Select>
            </FormField>

            <FormField label="Тип соединения по ГОСТ 16037 *">
              <Select
                value={form.gostJointType || (form.jointKind === 'Угловое' ? 'У16' : 'С17')}
                onChange={(e) =>
                  setForm((prev: WeldJoint) => ({
                    ...prev,
                    gostJointType: e.target.value,
                  }))
                }
                aria-label="Тип сварного соединения"
                className="w-full text-xs font-semibold"
              >
                {filteredGostOptions.map((gost) => (
                  <option key={gost.code} value={gost.code}>
                    {gost.description}
                  </option>
                ))}
                {!filteredGostOptions.some((g) => g.code === form.gostJointType) && form.gostJointType && (
                  <option value={form.gostJointType}>
                    {form.gostJointType}
                  </option>
                )}
              </Select>
            </FormField>

            <FormField label="Положение при сварке *">
              <Select
                value={form.weldingPosition || 'В1'}
                onChange={(e) =>
                  setForm((prev: WeldJoint) => ({
                    ...prev,
                    weldingPosition: e.target.value,
                  }))
                }
                aria-label="Положение"
                className="w-full text-xs font-semibold"
              >
                {NAKS_WELDING_POSITIONS.map((pos) => (
                  <option key={pos.code} value={pos.code}>
                    {pos.description}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        </div>
      </div>
    </fieldset>
  );
};
