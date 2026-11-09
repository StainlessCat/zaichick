import React, { useEffect, useState } from 'react';
import {
  Check,
  CloudSun,
  Layers,
  Lock,
  ShieldCheck,
  Unlock,
  X,
} from 'lucide-react';
import {
  ControlResult,
  InspectorProfile,
  JointType,
  NdtMethod,
  UserAccount,
  WelderProfile,
  WeldJoint,
} from '../types/welding';
import {
  calculateEquivalentDiaInch,
  fetchAmbientTemperatureAuto,
  formatDateDDMMYY,
  getEpcWallThicknessFactor,
  GOST_16037_JOINT_TYPES,
  mmToInchDiameter,
  NAKS_WELDING_POSITIONS,
} from '../utils/weldingLogic';
import {
  filterBulkPatchByRole,
  getUserRolePermissions,
} from '../utils/rbac';

interface BulkEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedJoints: WeldJoint[];
  welders: WelderProfile[];
  inspectors: InspectorProfile[];
  facilityCoords: {
    latitude: number;
    longitude: number;
    weatherArchive?: Record<string, string>;
    weatherStation?: string;
  };
  currentUser?: UserAccount;
  onApplyBulkUpdate: (patch: Partial<WeldJoint>) => void;
}

export const BulkEditModal: React.FC<BulkEditModalProps> = ({
  isOpen,
  onClose,
  selectedJoints,
  welders,
  inspectors,
  facilityCoords,
  currentUser,
  onApplyBulkUpdate,
}) => {
  const rbac = getUserRolePermissions(currentUser);
  const canSaveAnyBulk =
    rbac.canEditPrepAndWeldingFields || rbac.canEditNdtFields;

  // Флаги включения конкретных полей для массовой замены
  const [enableDiameter, setEnableDiameter] = useState(false);
  const [diameterMm, setDiameterMm] = useState<number>(159);
  const [wallThickness, setWallThickness] = useState<number>(8.0);

  const [enableJointType, setEnableJointType] = useState(false);
  const [jointType, setJointType] = useState<JointType>('Монтажный');

  const [enableWelder, setEnableWelder] = useState(
    rbac.canEditPrepAndWeldingFields
  );
  const [selectedStamp, setSelectedStamp] = useState<string>(
    welders[0]?.stamp || 'А142'
  );

  const [enableWeldingDate, setEnableWeldingDate] = useState(false);
  const [weldingDate, setWeldingDate] = useState<string>('2026-10-28');
  const [ambientTemp, setAmbientTemp] = useState<string>('-6');
  const [weatherSource, setWeatherSource] = useState<string>('');
  const [loadingWeather, setLoadingWeather] = useState(false);

  const [enableWeldingSpecs, setEnableWeldingSpecs] = useState(false);
  const [weldingType, setWeldingType] = useState<string>('РАД+РД');
  const [gostJointType, setGostJointType] = useState<string>('С17');
  const [weldingPosition, setWeldingPosition] = useState<string>('В1');
  const [weldingMaterials, setWeldingMaterials] = useState<string>(
    'Св-08Г2С Ø2.0 / УОНИ-13/55 Ø3.0'
  );
  const [techCardNumber, setTechCardNumber] = useState<string>('ТК-045-РАД/РД-01');

  const [enableVik, setEnableVik] = useState(
    !rbac.canEditPrepAndWeldingFields && rbac.canEditNdtFields
  );
  const [vikResult, setVikResult] = useState<ControlResult>('Годен');
  const [vikDate, setVikDate] = useState<string>('2026-10-28');
  const [vikInspector, setVikInspector] = useState<string>(
    inspectors[0]?.fullName || 'Лебедев К.М.'
  );

  const [enableNdt, setEnableNdt] = useState(false);
  const [ndtType, setNdtType] = useState<NdtMethod>('РК');
  const [ndtResult, setNdtResult] = useState<ControlResult>('Годен');
  const [ndtDate, setNdtDate] = useState<string>('2026-10-28');
  const [ndtInspector, setNdtInspector] = useState<string>(
    inspectors[0]?.fullName || 'Лебедев К.М.'
  );

  useEffect(() => {
    if (!isOpen) return;
    if (!rbac.canEditPrepAndWeldingFields) {
      setEnableDiameter(false);
      setEnableJointType(false);
      setEnableWelder(false);
      setEnableWeldingDate(false);
      setEnableWeldingSpecs(false);
      if (rbac.canEditNdtFields) {
        setEnableVik(true);
      }
    }
    if (!rbac.canEditNdtFields) {
      setEnableVik(false);
      setEnableNdt(false);
    }
  }, [isOpen, rbac.canEditPrepAndWeldingFields, rbac.canEditNdtFields]);

  if (!isOpen) return null;

  const activeWelder = welders.find((w) => w.stamp === selectedStamp);

  const handleAutoWeather = async () => {
    setLoadingWeather(true);
    const res = await fetchAmbientTemperatureAuto(
      facilityCoords.latitude,
      facilityCoords.longitude,
      weldingDate,
      facilityCoords.weatherArchive,
      { stationName: facilityCoords.weatherStation }
    );
    setAmbientTemp(res.tempC);
    setWeatherSource(res.source);
    setLoadingWeather(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSaveAnyBulk) return;
    const rawPatch: Partial<WeldJoint> = {};

    if (rbac.canEditPrepAndWeldingFields) {
      if (enableDiameter) {
        rawPatch.diameterMm = Number(diameterMm);
        rawPatch.diameterInch = mmToInchDiameter(Number(diameterMm));
        rawPatch.equivDiameterInch = calculateEquivalentDiaInch(
          Number(diameterMm),
          Number(wallThickness)
        );
        rawPatch.wallThickness = Number(wallThickness);
      }

      if (enableJointType) {
        rawPatch.jointType = jointType;
      }

      if (enableWelder && activeWelder) {
        rawPatch.welderStamp = activeWelder.stamp;
        rawPatch.welderStampsList = activeWelder.isBrigade
          ? activeWelder.brigadeMembers && activeWelder.brigadeMembers.length > 0
            ? activeWelder.brigadeMembers
            : [activeWelder.stamp]
          : [activeWelder.stamp];
        rawPatch.brigadeStamp = activeWelder.isBrigade ? activeWelder.stamp : '';
        rawPatch.welderFullName = activeWelder.fullName;
        rawPatch.welderCertNumber = activeWelder.certNumber;
        rawPatch.responsiblePerson = activeWelder.crewForeman;
      }

      if (enableWeldingDate) {
        rawPatch.weldingDate = weldingDate;
        rawPatch.ambientTemp = ambientTemp;
        if (weatherSource) {
          rawPatch.weatherSource = weatherSource;
        }
      }

      if (enableWeldingSpecs) {
        rawPatch.weldingType = weldingType;
        rawPatch.gostJointType = gostJointType;
        rawPatch.weldingPosition = weldingPosition;
        rawPatch.weldingMaterials = weldingMaterials;
        rawPatch.techCardNumber = techCardNumber;
      }
    }

    if (rbac.canEditNdtFields) {
      if (enableVik) {
        rawPatch.vikResult = vikResult;
        rawPatch.vikDate = vikDate;
        rawPatch.vikInspector = vikInspector;
      }

      if (enableNdt) {
        rawPatch.ndtType = ndtType;
        rawPatch.ndtResult = ndtResult;
        rawPatch.ndtDate = ndtDate;
        rawPatch.ndtInspector = ndtInspector;
      }
    }

    const patch = currentUser
      ? filterBulkPatchByRole(rawPatch, currentUser)
      : rawPatch;

    onApplyBulkUpdate(patch);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Массовое редактирование стыков"
    >
      <div
        className="fixed inset-0 bg-slate-900/45 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Шапка цвета #1e3799 */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#1e3799] text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-sky-300" />
            <div>
              <h2 className="font-display text-base font-bold">
                Массовое редактирование стыков ({selectedJoints.length} шт.)
              </h2>
              <p className="text-xs text-sky-200">
                Групповое изменение полей с учётом Field-Level RBAC ({rbac.categoryLabel})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть массовое редактирование"
            className="p-1.5 rounded-lg text-sky-100 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Предупреждение о защите номера стыка и статус Field-Level RBAC */}
          <div className="flex flex-col gap-2 p-3.5 rounded-lg bg-[#e8f1fc] border border-[#1e3799]/25 text-xs text-slate-800">
            <div className="flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-[#1e3799] shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-[#1e3799]">
                  Номер стыка заблокирован от группового изменения.
                </span>{' '}
                Выбрано стыков:{' '}
                <span className="font-mono font-semibold">
                  {selectedJoints.map((j) => `${j.uniqueLineId} [ст.${j.jointNumber}]`).join(', ')}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-sky-200/80">
              <span className="inline-flex items-center gap-1 font-semibold text-[#1e3799]">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Роль: {rbac.categoryLabel}</span>
              </span>
              <div className="flex items-center gap-1.5 text-[11px] font-mono">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border ${
                    rbac.canEditPrepAndWeldingFields
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold'
                      : 'bg-white/80 border-slate-200 text-slate-500'
                  }`}
                >
                  {rbac.canEditPrepAndWeldingFields ? (
                    <Unlock className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <Lock className="w-3 h-3 text-slate-400" />
                  )}
                  <span>Подготовка/Сварка</span>
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border ${
                    rbac.canEditNdtFields
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold'
                      : 'bg-white/80 border-slate-200 text-slate-500'
                  }`}
                >
                  {rbac.canEditNdtFields ? (
                    <Unlock className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <Lock className="w-3 h-3 text-slate-400" />
                  )}
                  <span>ВИК / НК</span>
                </span>
              </div>
            </div>
          </div>

          {/* Блок полей подготовки и сварки (доступно Инженеру ПТО) */}
          <fieldset
            disabled={!rbac.canEditPrepAndWeldingFields}
            className={`space-y-5 border-0 p-0 m-0 min-w-0 ${
              !rbac.canEditPrepAndWeldingFields
                ? 'opacity-65 pointer-events-none select-none'
                : ''
            }`}
          >
          {/* 1. Назначение клейма сварщика */}
          <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/60 space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={enableWelder}
                onChange={(e) => setEnableWelder(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799]"
              />
              <span className="text-sm font-bold text-slate-900">
                Присвоить клеймо сварщика, ФИО, № удостоверения НАКС и ответственного мастера
              </span>
            </label>

            {enableWelder && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 pl-6">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Выберите клеймо сварщика
                  </label>
                  <select
                    value={selectedStamp}
                    onChange={(e) => setSelectedStamp(e.target.value)}
                    aria-label="Выберите клеймо сварщика для массового назначения"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
                  >
                    {welders.map((w) => (
                      <option key={w.stamp} value={w.stamp}>
                        {w.stamp} — {w.fullName} ({w.certNumber})
                      </option>
                    ))}
                  </select>
                </div>
                {activeWelder && (
                  <div className="p-2.5 rounded bg-white border border-slate-200 text-xs space-y-1">
                    <div className="text-slate-500">
                      ФИО: <span className="font-semibold text-slate-800">{activeWelder.fullName}</span>
                    </div>
                    <div className="text-slate-500">
                      НАКС: <span className="font-mono text-slate-800">{activeWelder.certNumber}</span>
                    </div>
                    <div className="text-slate-500">
                      Ответственный: <span className="text-slate-800">{activeWelder.crewForeman}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. Изменение диаметра и толщины стенки */}
          <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/60 space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={enableDiameter}
                onChange={(e) => setEnableDiameter(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799]"
              />
              <span className="text-sm font-bold text-slate-900">
                Изменить диаметр (мм / дюймы) и толщину стенки
              </span>
            </label>

            {enableDiameter && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1 pl-6">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Диаметр, мм
                  </label>
                  <select
                    value={diameterMm}
                    onChange={(e) => setDiameterMm(Number(e.target.value))}
                    aria-label="Диаметр в мм"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
                  >
                    {[57, 89, 108, 159, 219, 273, 325, 426, 530, 720, 1020, 1420].map((d) => (
                      <option key={d} value={d}>
                        {d} мм ({mmToInchDiameter(d)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Дюйм-диаметр (авто)
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={mmToInchDiameter(diameterMm)}
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-md text-xs font-mono text-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Толщина стенки, мм
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="2"
                    max="60"
                    value={wallThickness}
                    onChange={(e) => setWallThickness(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Экв. дюйм EDI (Метод А)
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={`${calculateEquivalentDiaInch(diameterMm, wallThickness)}" (K=${getEpcWallThicknessFactor(wallThickness)})`}
                    title="Эквивалентный дюйм-диаметр по отраслевой шкале EPC с учетом толщины стенки"
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-md text-xs font-mono font-semibold text-[#1e3799]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 3. Дата сварки и автоматическая температура воздуха */}
          <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/60 space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={enableWeldingDate}
                onChange={(e) => setEnableWeldingDate(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799]"
              />
              <span className="text-sm font-bold text-slate-900">
                Установить дату сварки и температуру окружающей среды
              </span>
            </label>

            {enableWeldingDate && (
              <div className="space-y-2 pt-1 pl-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Дата сварки (ДД.ММ.ГГ:{' '}
                      <span className="font-mono font-bold text-[#1e3799]">
                        {formatDateDDMMYY(weldingDate)}
                      </span>
                      )
                    </label>
                    <input
                      type="date"
                      value={weldingDate}
                      onChange={(e) => setWeldingDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Температура среды, °C
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={ambientTemp}
                        onChange={(e) => setAmbientTemp(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
                      />
                      <button
                        type="button"
                        onClick={handleAutoWeather}
                        disabled={loadingWeather}
                        className="inline-flex items-center gap-1 px-2.5 py-2 rounded-md bg-[#1e3799] text-white text-xs font-medium hover:bg-[#15276e] whitespace-nowrap shrink-0"
                      >
                        <CloudSun className="w-3.5 h-3.5" />
                        <span>{loadingWeather ? '...' : 'Авто-метео'}</span>
                      </button>
                    </div>
                  </div>
                </div>
                {weatherSource && (
                  <div className="text-[11px] text-[#1e3799] font-medium">
                    Получено: {weatherSource}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 4. Тип стыка и параметры технологии сварки */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableJointType}
                  onChange={(e) => setEnableJointType(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#1e3799]"
                />
                <span className="text-xs font-bold text-slate-900">Изменить тип стыка</span>
              </label>
              {enableJointType && (
                <select
                  value={jointType}
                  onChange={(e) => setJointType(e.target.value as JointType)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs"
                >
                  <option value="Монтажный">Монтажный</option>
                  <option value="Цеховой">Цеховой</option>
                </select>
              )}
            </div>

            <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableWeldingSpecs}
                  onChange={(e) => setEnableWeldingSpecs(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#1e3799]"
                />
                <span className="text-xs font-bold text-slate-900">
                  Вид сварки, ГОСТ 16037-80, Положение НАКС и ТК
                </span>
              </label>
              {enableWeldingSpecs && (
                <div className="space-y-2">
                  <select
                    value={weldingType}
                    onChange={(e) => setWeldingType(e.target.value)}
                    aria-label="Вид сварки (массовое ред.)"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
                  >
                    <option value="РАД+РД">РАД+РД (комбинированная)</option>
                    <option value="РАД">РАД (аргонодуговая)</option>
                    <option value="РД">РД (ручная дуговая)</option>
                    <option value="МП">МП (механизированная)</option>
                  </select>
                  <select
                    value={gostJointType}
                    onChange={(e) => setGostJointType(e.target.value)}
                    aria-label="Тип сварного соединения по ГОСТ 16037-80 (массовое ред.)"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                  >
                    {GOST_16037_JOINT_TYPES.map((g) => (
                      <option key={g.code} value={g.code}>
                        {g.description}
                      </option>
                    ))}
                  </select>
                  <select
                    value={weldingPosition}
                    onChange={(e) => setWeldingPosition(e.target.value)}
                    aria-label="Положение по НАКС (массовое ред.)"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                  >
                    {NAKS_WELDING_POSITIONS.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.description}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={techCardNumber}
                    onChange={(e) => setTechCardNumber(e.target.value)}
                    placeholder="№ тех. карты"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
                  />
                </div>
              )}
            </div>
          </div>
          </fieldset>

          {/* 5. Массовое проставление результатов ВИК и НК */}
          <fieldset
            disabled={!rbac.canEditNdtFields}
            className={
              !rbac.canEditNdtFields
                ? 'opacity-70 pointer-events-none select-none'
                : ''
            }
          >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableVik}
                  onChange={(e) => setEnableVik(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#1e3799]"
                />
                <span className="text-xs font-bold text-slate-900">Проставить контроль ВИК</span>
              </label>
              {enableVik && (
                <div className="space-y-2">
                  <select
                    value={vikResult}
                    onChange={(e) => setVikResult(e.target.value as ControlResult)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
                  >
                    <option value="Годен">Годен</option>
                    <option value="Ремонт">Ремонт</option>
                    <option value="Вырезать">Вырезать</option>
                    <option value="В работе">В работе</option>
                  </select>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Дата ВИК:</span>
                    <span className="font-mono font-semibold text-[#1e3799]">
                      {formatDateDDMMYY(vikDate)}
                    </span>
                  </div>
                  <input
                    type="date"
                    value={vikDate}
                    onChange={(e) => setVikDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                  />
                </div>
              )}
            </div>

            <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableNdt}
                  onChange={(e) => setEnableNdt(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#1e3799]"
                />
                <span className="text-xs font-bold text-slate-900">Проставить контроль НК</span>
              </label>
              {enableNdt && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    <select
                      value={ndtType}
                      onChange={(e) => setNdtType(e.target.value as NdtMethod)}
                      className="px-2 py-1.5 bg-white border border-slate-300 rounded text-xs"
                    >
                      <option value="РК">РК</option>
                      <option value="УЗК">УЗК</option>
                      <option value="РК+УЗК">РК+УЗК</option>
                      <option value="ПВК">ПВК</option>
                    </select>
                    <select
                      value={ndtResult}
                      onChange={(e) => setNdtResult(e.target.value as ControlResult)}
                      className="px-2 py-1.5 bg-white border border-slate-300 rounded text-xs"
                    >
                      <option value="Годен">Годен</option>
                      <option value="Ремонт">Ремонт</option>
                      <option value="Вырезать">Вырезать</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Дата НК:</span>
                    <span className="font-mono font-semibold text-[#1e3799]">
                      {formatDateDDMMYY(ndtDate)}
                    </span>
                  </div>
                  <input
                    type="date"
                    value={ndtDate}
                    onChange={(e) => setNdtDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                  />
                </div>
              )}
            </div>
          </div>
          </fieldset>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={!canSaveAnyBulk}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#1e3799] text-white text-xs font-semibold hover:bg-[#15276e] disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4" />
              <span>
                {canSaveAnyBulk
                  ? `Применить ко всем (${selectedJoints.length} ст.)`
                  : 'Редактирование недоступно для вашей роли'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
