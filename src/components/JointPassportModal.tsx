import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CloudSun,
  Copy,
  FileCheck2,
  Flame,
  History,
  Lock,
  MapPin,
  Search,
  ShieldCheck,
  Trash2,
  Unlock,
  Users,
  X,
} from 'lucide-react';
import {
  AuditLogEntry,
  ControlResult,
  FacilityObject,
  InspectorProfile,
  JointType,
  LrvElementCategory,
  LRVItem,
  NdtMethod,
  ProjectLineItem,
  TechCardItem,
  UserAccount,
  WelderProfile,
  WeldingMaterialCertificate,
  WeldingType,
  WeldJoint,
} from '../types/welding';
import {
  enforceFieldLevelRbacOnJointSave,
  formatInspectorShortName,
  getUserRolePermissions,
} from '../utils/rbac';
import {
  buildUniqueLineId,
  checkNaksCertStatus,
  detectLrvElementType,
  estimateAmbientTempByCoordsAndDate,
  filterLrvByDiameter,
  filterLrvCatalogByRd,
  findWelderByStamp,
  formatDateDDMMYY,
  formatTimestampDDMMYY,
  getFacilityWeatherStationName,
  GOST_16037_JOINT_TYPES,
  LRV_ELEMENT_TYPE_OPTIONS,
  mmToInchDiameter,
  NAKS_WELDING_POSITIONS,
  normalizeDecimalInput,
  normalizeStampString,
  resolveWeldersSelection,
  searchLrvCatalogItems,
  searchWeldersByStampOrName,
  suggestNextJointNumber,
  validateElementsDiameterMatch,
  validatePreheatTemperature,
  validateWeldingTypeWithTechCard,
} from '../utils/weldingLogic';
import {
  sanitizeWeldJointRecord,
  validateWeldJointComprehensive,
} from '../utils/dataIntegrityGuard';

const WELDING_TYPE_OPTIONS: WeldingType[] = [
  'РАД',
  'РД',
  'РАД+РД',
  'МП',
  'АФ',
  'АПГ',
];

interface WelderStampComboboxProps {
  label: string;
  ariaLabel: string;
  placeholder: string;
  emptyOptionLabel: string;
  value: string;
  options: WelderProfile[];
  excludeStamps?: string[];
  isPrimary?: boolean;
  isBrigade?: boolean;
  referenceDate?: string;
  onChange: (newStamp: string) => void;
}

const WelderStampCombobox: React.FC<WelderStampComboboxProps> = ({
  label,
  ariaLabel,
  placeholder,
  emptyOptionLabel,
  value,
  options,
  excludeStamps = [],
  isPrimary = false,
  isBrigade = false,
  referenceDate,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputText(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (ev: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(ev.target as Node)
      ) {
        setIsOpen(false);
        const matched = findWelderByStamp(options, inputText, isBrigade);
        if (matched) {
          setInputText(matched.stamp);
          if (matched.stamp !== value) {
            onChange(matched.stamp);
          }
        } else if (!inputText.trim()) {
          setInputText('');
          if (value) onChange('');
        } else {
          setInputText(value);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [inputText, value, options, isBrigade, onChange]);

  const filteredOptions = useMemo(() => {
    // Если пользователь просто открыл список и текст в поле точно равен уже выбранному клейму,
    // показываем весь список (а при вводе или редактировании фильтруем по введённым символам)
    const exactCurrent =
      value &&
      normalizeStampString(inputText) === normalizeStampString(value) &&
      options.some(
        (o) => normalizeStampString(o.stamp) === normalizeStampString(value)
      );
    const queryToUse = exactCurrent ? '' : inputText;
    return searchWeldersByStampOrName(options, queryToUse, excludeStamps);
  }, [options, inputText, value, excludeStamps]);

  const matchedProfile = useMemo(
    () => findWelderByStamp(options, inputText || value, isBrigade),
    [options, value, inputText, isBrigade]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = e.target.value;
    setInputText(nextVal);
    setIsOpen(true);

    const trimmed = nextVal.trim();
    if (!trimmed) {
      onChange('');
      return;
    }

    // Если при вводе введённое клеймо совпало со справочником — сразу подставляем данные сварщика/бригады
    const exactMatch = findWelderByStamp(options, trimmed, isBrigade);
    if (exactMatch) {
      onChange(exactMatch.stamp);
    }
  };

  const handleSelectOption = (stamp: string) => {
    setInputText(stamp);
    onChange(stamp);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && isOpen) {
      e.preventDefault();
      if (filteredOptions.length > 0) {
        handleSelectOption(filteredOptions[0].stamp);
      } else {
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'ArrowDown' && !isOpen) {
      setIsOpen(true);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="flex items-center justify-between gap-1.5 text-xs font-bold text-slate-800 mb-1">
        <span className="inline-flex items-center gap-1.5">
          <Users
            className={`w-3.5 h-3.5 ${
              isPrimary ? 'text-[#1e3799]' : 'text-slate-600'
            }`}
          />
          <span>{label}</span>
        </span>
        {matchedProfile && (
          <div className="flex items-center gap-1">
            <span className="font-mono text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
              {matchedProfile.stamp}
            </span>
            {matchedProfile.certExpiryDate && (() => {
              const status = checkNaksCertStatus(matchedProfile.certExpiryDate, referenceDate);
              if (status.badgeVariant === 'expired') {
                return (
                  <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-300 px-1.5 py-0.5 rounded animate-pulse">
                    НАКС просрочен!
                  </span>
                );
              }
              if (status.badgeVariant === 'expiring') {
                return (
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-300 px-1.5 py-0.5 rounded">
                    НАКС ≤{status.daysRemaining}дн
                  </span>
                );
              }
              return (
                <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                  НАКС ок
                </span>
              );
            })()}
          </div>
        )}
      </label>

      <div className="relative flex items-center">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
        <input
          type="text"
          value={inputText}
          onFocus={() => setIsOpen(true)}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label={ariaLabel}
          autoComplete="off"
          className={`w-full pl-8 pr-14 py-2 bg-white border rounded-lg text-xs font-mono font-bold transition-colors ${
            matchedProfile
              ? 'border-[#1e3799] text-[#1e3799]'
              : inputText.trim()
              ? 'border-amber-400 text-slate-900'
              : isPrimary
              ? 'border-[#1e3799]/70 text-slate-900'
              : 'border-slate-300 text-slate-800'
          }`}
        />

        <div className="absolute right-1.5 flex items-center gap-0.5">
          {inputText && (
            <button
              type="button"
              onClick={() => handleSelectOption('')}
              aria-label={`Очистить ${ariaLabel}`}
              title="Очистить клеймо"
              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            aria-label={`Открыть список: ${ariaLabel}`}
            title="Показать список клейм"
            className="p-1 rounded text-slate-500 hover:text-[#1e3799] hover:bg-sky-50"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Подпись найденного по клейму сварщика / бригады */}
      <div className="mt-1 min-h-[16px] text-[10px] truncate">
        {matchedProfile ? (
          <span className="text-slate-600 font-medium">
            {isBrigade
              ? `Состав бригады: ${(matchedProfile.brigadeMembers || []).join(', ')}`
              : `${matchedProfile.fullName} · ${matchedProfile.certNumber}`}
          </span>
        ) : inputText.trim() ? (
          <span className="text-amber-700 font-medium">
            Поиск клейма «{inputText.trim()}» (совпадений: {filteredOptions.length})
          </span>
        ) : null}
      </div>

      {/* Выпадающий список с результатами живого поиска по клейму */}
      {isOpen && (
        <div
          role="listbox"
          aria-label={`Результаты поиска: ${ariaLabel}`}
          className="absolute z-30 left-0 right-0 mt-1 max-h-52 overflow-y-auto rounded-lg bg-white border border-slate-200 shadow-xl divide-y divide-slate-100"
        >
          <button
            type="button"
            onClick={() => handleSelectOption('')}
            className="w-full px-3 py-1.5 text-left text-[11px] text-slate-500 hover:bg-slate-50 flex items-center justify-between"
          >
            <span>{emptyOptionLabel}</span>
            {!value && <Check className="w-3.5 h-3.5 text-[#1e3799]" />}
          </button>

          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2.5 text-xs text-slate-500">
              Клеймо «{inputText}» не найдено в справочнике сварщиков
            </div>
          ) : (
            filteredOptions.map((item) => {
              const isSelected =
                normalizeStampString(item.stamp) ===
                normalizeStampString(value);
              return (
                <button
                  key={item.stamp}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelectOption(item.stamp)}
                  className={`w-full px-3 py-2 text-left text-xs transition-colors flex items-start justify-between gap-2 ${
                    isSelected
                      ? 'bg-[#e8f1fc] text-[#1e3799]'
                      : 'hover:bg-sky-50/70 text-slate-800'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-[#1e3799] text-white font-mono text-[11px] font-bold shrink-0">
                        {item.stamp}
                      </span>
                      <span className="font-semibold truncate">
                        {item.isBrigade
                          ? `Бригада (${(item.brigadeMembers || []).join(', ')})`
                          : item.fullName}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate flex items-center gap-1.5 flex-wrap">
                      <span>НАКС: {item.certNumber || '—'}</span>
                      {item.certExpiryDate && (() => {
                        const status = checkNaksCertStatus(item.certExpiryDate, referenceDate);
                        if (status.badgeVariant === 'expired') {
                          return (
                            <span className="font-bold text-rose-600">
                              (просрочен: {formatDateDDMMYY(item.certExpiryDate)})
                            </span>
                          );
                        }
                        if (status.badgeVariant === 'expiring') {
                          return (
                            <span className="font-bold text-amber-600">
                              (истекает: {formatDateDDMMYY(item.certExpiryDate)})
                            </span>
                          );
                        }
                        return (
                          <span className="text-emerald-700">
                            (до {formatDateDDMMYY(item.certExpiryDate)})
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  {isSelected && (
                    <Check className="w-3.5 h-3.5 text-[#1e3799] shrink-0 mt-1" />
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

interface JointPassportModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialJoint: WeldJoint | null;
  allJoints: WeldJoint[];
  facilities: FacilityObject[];
  projectLineList: ProjectLineItem[];
  lrvCatalog: LRVItem[];
  welders: WelderProfile[];
  techCards: TechCardItem[];
  weldingMaterials?: WeldingMaterialCertificate[];
  weldingMaterialsList?: WeldingMaterialCertificate[];
  inspectors: InspectorProfile[];
  auditLogsForJoint: AuditLogEntry[];
  defaultObjectName: string;
  defaultRdCode: string;
  currentUser?: UserAccount;
  onSave: (joint: WeldJoint, isSupplementary: boolean, usedCrossRdLrv: boolean) => void;
  onNavigateJoint?: (targetJoint: WeldJoint) => void;
  onDeleteJoint?: (joint: WeldJoint) => void;
  onOpenFacilityLocation?: (objectName: string) => void;
  onClose: () => void;
}

export const JointPassportModal: React.FC<JointPassportModalProps> = ({
  isOpen,
  mode,
  initialJoint,
  allJoints,
  facilities,
  projectLineList,
  lrvCatalog,
  welders,
  techCards,
  weldingMaterials,
  weldingMaterialsList: weldingMaterialsListProp,
  inspectors,
  auditLogsForJoint,
  defaultObjectName,
  defaultRdCode,
  currentUser,
  onSave,
  onNavigateJoint,
  onDeleteJoint,
  onOpenFacilityLocation,
  onClose,
}) => {
  const rbac = getUserRolePermissions(currentUser);
  const canSaveAnyField =
    mode === 'create'
      ? rbac.canCreateOrDeleteJoints
      : rbac.canEditPrepAndWeldingFields || rbac.canEditNdtFields;
  const weldingMaterialsList = weldingMaterials || weldingMaterialsListProp || [];
  const fallbackEmptyFac: FacilityObject = {
    id: 'fac-empty',
    name: defaultObjectName || 'Новый объект',
    shortName: defaultObjectName || 'Новый объект',
    region: 'ЯНАО',
    weatherStation: 'Метеостанция объекта',
    latitude: 66.53,
    longitude: 66.6,
    rdCodes: [
      {
        code: defaultRdCode || 'НОВЫЙ-ШИФР-РД',
        title: 'Рабочая документация',
        contours: ['Основной контур'],
      },
    ],
  };
  const firstFac =
    facilities.find((f) => f.name === defaultObjectName) ||
    facilities[0] ||
    fallbackEmptyFac;
  const firstRd =
    firstFac.rdCodes.find((r) => r.code === defaultRdCode)?.code ||
    firstFac.rdCodes[0]?.code ||
    defaultRdCode ||
    'НОВЫЙ-ШИФР-РД';
  const firstLineObj =
    projectLineList.find(
      (l) => l.objectName === firstFac.name && l.rdCode === firstRd
    ) ||
    projectLineList.find((l) => l.rdCode === firstRd) ||
    projectLineList[0];

  const [isSupplementaryMode, setIsSupplementaryMode] = useState(false);
  const [baseJointForSupp] = useState('010');
  const [allowCrossRdLrv, setAllowCrossRdLrv] = useState(false);
  const [filterLrvBySameDiameter, setFilterLrvBySameDiameter] = useState(true);
  const [confirmDeleteStep, setConfirmDeleteStep] = useState(false);
  const [validationError, setValidationError] = useState('');

  // Выбор сварщиков через выпадающее меню: 2 поля «Сварщик 1» и «Сварщик 2» + опционально бригадное клеймо
  const [welder1Stamp, setWelder1Stamp] = useState<string>(
    () => welders.find((w) => !w.isBrigade)?.stamp || ''
  );
  const [welder2Stamp, setWelder2Stamp] = useState<string>('');
  const [brigadeStamp, setBrigadeStamp] = useState<string>('');

  // Поиск и фильтрация элементов 1 и 2 по базе ЛРВ (код ЛРВ, краткое наименование, НТД, диаметр, тип элемента)
  const [elem1SearchQuery, setElem1SearchQuery] = useState('');
  const [elem1TypeFilter, setElem1TypeFilter] =
    useState<LrvElementCategory>('Все типы');
  const [elem2SearchQuery, setElem2SearchQuery] = useState('');
  const [elem2TypeFilter, setElem2TypeFilter] =
    useState<LrvElementCategory>('Все типы');

  const [form, setForm] = useState<WeldJoint>(() => {
    if (initialJoint) return { ...initialJoint };
    const initLineNum = firstLineObj?.lineNumber || 'ФП1.2/1';
    const initDate = '2026-06-15';
    const archivedTemp = firstFac.weatherArchive?.[initDate];
    const autoTemp = estimateAmbientTempByCoordsAndDate(
      firstFac.latitude,
      firstFac.longitude,
      initDate
    );
    const defaultPersonalWelder = welders.find((w) => !w.isBrigade);
    return {
      id: `j-${Date.now()}`,
      objectName: firstFac.name,
      rdCode: firstRd,
      contour:
        firstLineObj?.testContour ||
        firstFac.rdCodes[0]?.contours[0] ||
        'Контур испытания КИ-1',
      lineNumber: initLineNum,
      uniqueLineId: buildUniqueLineId(firstRd, initLineNum),
      jointNumber: '010',
      jointType: 'Монтажный',
      diameterMm: 159,
      diameterInch: '6"',
      wallThickness: 8.0,
      lrv1Code: '',
      elem1Name: '',
      elem1Material: '09Г2С',
      elem1Ntd: 'ГОСТ 8732-78',
      elem1DiameterMm: 159,
      elem1WallThickness: 8.0,
      elem1FactoryNumber: '',
      elem1Length: '',
      lrv2Code: '',
      elem2Name: '',
      elem2Material: '09Г2С',
      elem2Ntd: 'ГОСТ 17375-2001',
      elem2DiameterMm: 159,
      elem2WallThickness: 8.0,
      elem2FactoryNumber: '',
      elem2Length: '',
      weldingType: techCards[0]?.weldingType || 'РАД+РД',
      gostJointType: 'С17',
      weldingPosition: 'В1',
      weldingDate: initDate,
      welderStamp: defaultPersonalWelder?.stamp || '',
      welderStampsList: defaultPersonalWelder ? [defaultPersonalWelder.stamp] : [],
      brigadeStamp: '',
      weldingMaterials:
        techCards[0]?.recommendedMaterials ||
        weldingMaterialsList[0]?.brandAndDiameter ||
        'Св-08Г2С Ø2.0 / УОНИ-13/55 Ø3.0',
      ambientTemp: archivedTemp || (autoTemp > 0 ? `+${autoTemp}` : `${autoTemp}`),
      preheatTemp: '130',
      responsiblePerson:
        defaultPersonalWelder?.crewForeman || 'Мастер СМР Громов И.А.',
      welderFullName: defaultPersonalWelder?.fullName || '',
      welderCertNumber: defaultPersonalWelder?.certNumber || '',
      techCardNumber: techCards[0]?.number || '',
      vikResult: 'Не проводился',
      vikDate: '',
      vikInspector: '',
      ndtType: 'РК',
      ndtDate: '',
      ndtResult: 'Не проводился',
      ndtInspector: '',
      dupNdtType: 'Не требуется',
      dupNdtDate: '',
      dupNdtResult: 'Не проводился',
      dupNdtInspector: '',
      updatedAt: new Date().toISOString(),
      updatedBy: '',
    };
  });

  const currentFacility =
    facilities.find((f) => f.name === form.objectName) ||
    facilities[0] ||
    fallbackEmptyFac;
  const currentRdObj =
    currentFacility.rdCodes.find((r) => r.code === form.rdCode) ||
    currentFacility.rdCodes[0] ||
    fallbackEmptyFac.rdCodes[0];
  const currentWeatherStationName =
    getFacilityWeatherStationName(currentFacility);

  const personalWelders = useMemo(
    () => welders.filter((w) => !w.isBrigade),
    [welders]
  );
  const brigadeProfiles = useMemo(
    () => welders.filter((w) => Boolean(w.isBrigade)),
    [welders]
  );

  // Доступные материалы ЛРВ строго по текущему шифру РД (или по всем РД при снятии блокировки)
  const availableLrvItems = useMemo(
    () => filterLrvCatalogByRd(lrvCatalog, form.rdCode, allowCrossRdLrv),
    [lrvCatalog, form.rdCode, allowCrossRdLrv]
  );

  // Выбранные записи ЛРВ из базы
  const selectedLrv1Item = useMemo(
    () => lrvCatalog.find((i) => i.lrvCode === form.lrv1Code),
    [lrvCatalog, form.lrv1Code]
  );
  const selectedLrv2Item = useMemo(
    () => lrvCatalog.find((i) => i.lrvCode === form.lrv2Code),
    [lrvCatalog, form.lrv2Code]
  );

  const elem1Diam = form.elem1DiameterMm ?? form.diameterMm;
  const elem2Diam = form.elem2DiameterMm ?? form.diameterMm;

  // Базовый список для Элемента 2 с учётом фильтра по диаметру Элемента 1
  const baseLrvOptionsForElem2 = useMemo(() => {
    if (!filterLrvBySameDiameter || !elem1Diam) return availableLrvItems;
    const filtered = filterLrvByDiameter(availableLrvItems, elem1Diam);
    return filtered.length > 0 ? filtered : availableLrvItems;
  }, [availableLrvItems, filterLrvBySameDiameter, elem1Diam]);

  // Отфильтрованные списки ЛРВ для Элемента 1 и Элемента 2 по поисковому запросу и типу элемента
  const filteredLrvOptionsElem1 = useMemo(() => {
    const matches = searchLrvCatalogItems(
      availableLrvItems,
      elem1SearchQuery,
      elem1TypeFilter
    );
    if (
      selectedLrv1Item &&
      !matches.some((m) => m.lrvCode === selectedLrv1Item.lrvCode)
    ) {
      return [selectedLrv1Item, ...matches];
    }
    return matches;
  }, [availableLrvItems, elem1SearchQuery, elem1TypeFilter, selectedLrv1Item]);

  const filteredLrvOptionsElem2 = useMemo(() => {
    const matches = searchLrvCatalogItems(
      baseLrvOptionsForElem2,
      elem2SearchQuery,
      elem2TypeFilter
    );
    if (
      selectedLrv2Item &&
      !matches.some((m) => m.lrvCode === selectedLrv2Item.lrvCode)
    ) {
      return [selectedLrv2Item, ...matches];
    }
    return matches;
  }, [
    baseLrvOptionsForElem2,
    elem2SearchQuery,
    elem2TypeFilter,
    selectedLrv2Item,
  ]);

  // Доступные линии из лайнлиста для режима создания нового стыка
  const availableLinesForRd = useMemo(() => {
    const matched = projectLineList.filter(
      (l) => l.objectName === form.objectName && l.rdCode === form.rdCode
    );
    if (matched.length > 0) return matched;
    const byRd = projectLineList.filter((l) => l.rdCode === form.rdCode);
    return byRd.length > 0 ? byRd : projectLineList;
  }, [projectLineList, form.objectName, form.rdCode]);

  const existingNumbersInLine = useMemo(() => {
    const uid = buildUniqueLineId(form.rdCode, form.lineNumber);
    return allJoints
      .filter((j) => j.uniqueLineId === uid && j.id !== form.id)
      .map((j) => j.jointNumber);
  }, [allJoints, form.rdCode, form.lineNumber, form.id]);

  // Инициализация состояния при открытии модального окна
  useEffect(() => {
    if (!isOpen) return;
    setAllowCrossRdLrv(false);
    setConfirmDeleteStep(false);
    setValidationError('');
    setElem1SearchQuery('');
    setElem1TypeFilter('Все типы');
    setElem2SearchQuery('');
    setElem2TypeFilter('Все типы');

    if (initialJoint) {
      const fac =
        facilities.find((f) => f.name === initialJoint.objectName) ||
        facilities[0] ||
        fallbackEmptyFac;
      const computedAutoTemp = initialJoint.weldingDate
        ? estimateAmbientTempByCoordsAndDate(
            fac.latitude,
            fac.longitude,
            initialJoint.weldingDate
          )
        : null;
      const autoTempFormatted =
        computedAutoTemp !== null
          ? computedAutoTemp > 0
            ? `+${computedAutoTemp}`
            : `${computedAutoTemp}`
          : initialJoint.ambientTemp;

      const parsedStamps =
        initialJoint.welderStampsList && initialJoint.welderStampsList.length > 0
          ? initialJoint.welderStampsList
          : initialJoint.welderStamp
          ? initialJoint.welderStamp
              .replace(/^БР-\d+\s*\(/, '')
              .replace(/\)$/, '')
              .split(',')
              .map((s) => s.trim())
              .filter((s) => personalWelders.some((pw) => pw.stamp === s))
          : [];

      const initBrigade =
        initialJoint.brigadeStamp ||
        (initialJoint.welderStamp.startsWith('БР-')
          ? initialJoint.welderStamp.split(' ')[0]
          : '');

      setWelder1Stamp(parsedStamps[0] || '');
      setWelder2Stamp(parsedStamps[1] || '');
      setBrigadeStamp(initBrigade);

      // Подтягиваем характеристики элементов строго из базы ЛРВ при наличии кода ЛРВ
      const initLrv1 = lrvCatalog.find(
        (i) => i.lrvCode === initialJoint.lrv1Code
      );
      const initLrv2 = lrvCatalog.find(
        (i) => i.lrvCode === initialJoint.lrv2Code
      );

      setForm({
        ...initialJoint,
        ambientTemp: initialJoint.ambientTemp || autoTempFormatted,
        elem1Name: initLrv1?.shortName || initialJoint.elem1Name,
        elem1Material: initLrv1?.material || initialJoint.elem1Material,
        elem1Ntd: initLrv1?.ntd || initialJoint.elem1Ntd,
        elem1DiameterMm:
          initialJoint.elem1DiameterMm ??
          initLrv1?.diameterMm ??
          initialJoint.diameterMm,
        elem1WallThickness:
          initialJoint.elem1WallThickness ??
          initLrv1?.wallThickness ??
          initialJoint.wallThickness,
        elem1FactoryNumber: initialJoint.elem1FactoryNumber ?? '',
        elem1Manufacturer:
          initialJoint.elem1Manufacturer || initLrv1?.manufacturer || '',
        elem1Length: initialJoint.elem1Length ?? '',
        elem2Name: initLrv2?.shortName || initialJoint.elem2Name,
        elem2Material: initLrv2?.material || initialJoint.elem2Material,
        elem2Ntd: initLrv2?.ntd || initialJoint.elem2Ntd,
        elem2DiameterMm:
          initialJoint.elem2DiameterMm ??
          initLrv2?.diameterMm ??
          initialJoint.diameterMm,
        elem2WallThickness:
          initialJoint.elem2WallThickness ??
          initLrv2?.wallThickness ??
          initialJoint.wallThickness,
        elem2FactoryNumber: initialJoint.elem2FactoryNumber ?? '',
        elem2Manufacturer:
          initialJoint.elem2Manufacturer || initLrv2?.manufacturer || '',
        elem2Length: initialJoint.elem2Length ?? '',
        gostJointType: initialJoint.gostJointType || 'С17',
        weldingPosition: initialJoint.weldingPosition || 'В1',
        preheatTemp: initialJoint.preheatTemp ?? '130',
      });
      const num = parseInt(initialJoint.jointNumber, 10);
      setIsSupplementaryMode(
        Boolean(initialJoint.isSupplementary) ||
          (!Number.isNaN(num) && num % 10 !== 0)
      );
      return;
    }

    // Режим создания нового стыка
    const rdsForFac =
      facilities.find((f) => f.name === firstFac.name)?.rdCodes ||
      firstFac.rdCodes;
    const activeRdObj =
      rdsForFac.find((r) => r.code === firstRd) || rdsForFac[0];
    const linesForRd = projectLineList.filter(
      (l) => l.objectName === firstFac.name && l.rdCode === activeRdObj.code
    );
    const activeLine = linesForRd[0] || firstLineObj;
    const lineNum = activeLine?.lineNumber || 'ФП1.2/1';
    const uid = buildUniqueLineId(activeRdObj.code, lineNum);
    const lineJoints = allJoints
      .filter((j) => j.uniqueLineId === uid)
      .map((j) => j.jointNumber);
    const nextNum = suggestNextJointNumber(lineJoints);
    const rdLrvs = filterLrvCatalogByRd(lrvCatalog, activeRdObj.code, false);
    const lrv1 = rdLrvs[0];
    const sameDiamLrvs = lrv1
      ? filterLrvByDiameter(rdLrvs, lrv1.diameterMm)
      : rdLrvs;
    const lrv2 = sameDiamLrvs[1] || sameDiamLrvs[0] || lrv1;

    const initDate = '2026-06-15';
    const archivedTemp = firstFac.weatherArchive?.[initDate];
    const autoTemp = estimateAmbientTempByCoordsAndDate(
      firstFac.latitude,
      firstFac.longitude,
      initDate
    );
    const defaultWelder = personalWelders[0];

    setWelder1Stamp(defaultWelder ? defaultWelder.stamp : '');
    setWelder2Stamp('');
    setBrigadeStamp('');

    setForm((prev) => ({
      ...prev,
      id: `j-${Date.now()}`,
      objectName: firstFac.name,
      rdCode: activeRdObj.code,
      contour:
        activeLine?.testContour || activeRdObj.contours[0] || prev.contour,
      lineNumber: lineNum,
      uniqueLineId: uid,
      jointNumber: nextNum,
      diameterMm: lrv1?.diameterMm || 159,
      diameterInch: mmToInchDiameter(lrv1?.diameterMm || 159),
      wallThickness: lrv1?.wallThickness || 8.0,
      lrv1Code: lrv1?.lrvCode || '',
      elem1Name: lrv1?.shortName || '',
      elem1Material: lrv1?.material || '09Г2С',
      elem1Ntd: lrv1?.ntd || 'ГОСТ 8732-78',
      elem1DiameterMm: lrv1?.diameterMm || 159,
      elem1WallThickness: lrv1?.wallThickness || 8.0,
      elem1Manufacturer: lrv1?.manufacturer || '',
      elem1FactoryNumber: 'Пл.40812-01',
      elem1Length:
        lrv1 && detectLrvElementType(lrv1.shortName) !== 'Труба' ? '0.35' : '11.8',
      lrv2Code: lrv2?.lrvCode || '',
      elem2Name: lrv2?.shortName || '',
      elem2Material: lrv2?.material || '09Г2С',
      elem2Ntd: lrv2?.ntd || 'ГОСТ 17375-2001',
      elem2DiameterMm: lrv1?.diameterMm || 159,
      elem2WallThickness: lrv1?.wallThickness || 8.0,
      elem2Manufacturer: lrv2?.manufacturer || '',
      elem2FactoryNumber: 'ОТВ-26-01',
      elem2Length:
        lrv2 && detectLrvElementType(lrv2.shortName) === 'Труба' ? '11.8' : '0.35',
      weldingDate: initDate,
      ambientTemp: archivedTemp || (autoTemp > 0 ? `+${autoTemp}` : `${autoTemp}`),
      preheatTemp: '130',
      weldingType: techCards[0]?.weldingType || 'РАД+РД',
      gostJointType: 'С17',
      weldingPosition: 'В1',
      welderStamp: defaultWelder?.stamp || '',
      welderStampsList: defaultWelder ? [defaultWelder.stamp] : [],
      welderFullName: defaultWelder?.fullName || '',
      welderCertNumber: defaultWelder?.certNumber || '',
      responsiblePerson: defaultWelder?.crewForeman || 'Мастер СМР Громов И.А.',
      techCardNumber: techCards[0]?.number || '',
      vikResult: 'Не проводился',
      vikDate: '',
      vikInspector: '',
      ndtType: 'РК',
      ndtDate: '',
      ndtResult: 'Не проводился',
      ndtInspector: '',
      dupNdtType: 'Не требуется',
      dupNdtDate: '',
      dupNdtResult: 'Не проводился',
      dupNdtInspector: '',
    }));
  }, [isOpen, mode, initialJoint]);

  // Автоматический пересчёт температуры воздуха при изменении объекта или даты сварки (с приоритетом метеоархива объекта)
  useEffect(() => {
    if (!isOpen || !form.weldingDate) return;
    const fac =
      facilities.find((f) => f.name === form.objectName) || facilities[0];
    if (!fac) return;
    const archivedVal = fac.weatherArchive?.[form.weldingDate];
    if (archivedVal !== undefined) {
      const raw = String(archivedVal).trim();
      const num = Number(raw);
      const fmt =
        !raw.startsWith('+') && !raw.startsWith('-') && !Number.isNaN(num) && num > 0
          ? `+${num}`
          : raw;
      setForm((prev) =>
        prev.ambientTemp === fmt ? prev : { ...prev, ambientTemp: fmt }
      );
      return;
    }
    const calc = estimateAmbientTempByCoordsAndDate(
      fac.latitude,
      fac.longitude,
      form.weldingDate
    );
    const formatted = calc > 0 ? `+${calc}` : `${calc}`;
    setForm((prev) =>
      prev.ambientTemp === formatted ? prev : { ...prev, ambientTemp: formatted }
    );
  }, [form.objectName, form.weldingDate, facilities, isOpen]);

  // Быстрая навигация по стыкам на текущей линии без закрытия паспорта
  const lineJoints = useMemo(() => {
    if (mode !== 'edit' || !form.uniqueLineId) return [];
    return allJoints
      .filter((j) => j.uniqueLineId === form.uniqueLineId)
      .sort((a, b) => {
        const numA = parseInt(a.jointNumber, 10);
        const numB = parseInt(b.jointNumber, 10);
        if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
          return numA - numB;
        }
        return a.jointNumber.localeCompare(b.jointNumber, undefined, { numeric: true });
      });
  }, [allJoints, form.uniqueLineId, mode]);

  const currentLineIndex = useMemo(() => {
    return lineJoints.findIndex((j) => j.id === form.id);
  }, [lineJoints, form.id]);

  const prevJoint = currentLineIndex > 0 ? lineJoints[currentLineIndex - 1] : null;
  const nextJoint =
    currentLineIndex >= 0 && currentLineIndex < lineJoints.length - 1
      ? lineJoints[currentLineIndex + 1]
      : null;

  if (!isOpen) return null;

  const selectedTechCard = techCards.find(
    (tc) => tc.number === form.techCardNumber
  );

  // Проверка совпадения диаметров Элемента 1 и Элемента 2
  const diameterValidation = validateElementsDiameterMatch(elem1Diam, elem2Diam);

  // Проверка вида сварки по выбранной технологической карте (ТК)
  const weldingTypeValidation = validateWeldingTypeWithTechCard(
    form.weldingType,
    selectedTechCard
  );

  // Проверка температуры подогрева по выбранной ТК и автоматической T окружающей среды
  const preheatValidation = validatePreheatTemperature(
    form.preheatTemp,
    form.ambientTemp,
    selectedTechCard
  );

  // Полный комплекс 5 блоков проверок (хронология, технология, логика НК, ссылочная целостность, экстремальные границы)
  const comprehensiveValidation = validateWeldJointComprehensive({
    joint: form,
    allJoints,
    projectLineList,
    lrvCatalog,
    welders,
    techCards,
    weldingMaterials: weldingMaterialsList,
  });

  // Обновление сварщиков при выборе из выпадающих списков «Сварщик 1» и «Сварщик 2»
  const applyWeldersPair = (
    nextW1: string,
    nextW2: string,
    nextBrigade: string
  ) => {
    const stamps = [nextW1, nextW2].filter(Boolean);
    const resolved = resolveWeldersSelection(stamps, nextBrigade, welders);
    setForm((prev) => ({
      ...prev,
      welderStamp: resolved.welderStamp,
      welderStampsList: stamps,
      brigadeStamp: nextBrigade,
      welderFullName: resolved.welderFullName,
      welderCertNumber: resolved.welderCertNumber,
      responsiblePerson: resolved.responsiblePerson || prev.responsiblePerson,
    }));
  };

  const handleWelder1Change = (newStamp1: string) => {
    const matched1 = findWelderByStamp(personalWelders, newStamp1, false);
    const canonical1 = matched1 ? matched1.stamp : newStamp1;
    setWelder1Stamp(canonical1);
    const adjustedW2 =
      canonical1 &&
      normalizeStampString(canonical1) === normalizeStampString(welder2Stamp)
        ? ''
        : welder2Stamp;
    if (adjustedW2 !== welder2Stamp) {
      setWelder2Stamp(adjustedW2);
    }
    applyWeldersPair(canonical1, adjustedW2, brigadeStamp);
  };

  const handleWelder2Change = (newStamp2: string) => {
    const matched2 = findWelderByStamp(personalWelders, newStamp2, false);
    const canonical2 = matched2 ? matched2.stamp : newStamp2;
    setWelder2Stamp(canonical2);
    applyWeldersPair(welder1Stamp, canonical2, brigadeStamp);
  };

  // Выбор или ввод бригадного клейма с живым поиском
  const handleBrigadeStampChange = (newBrigade: string) => {
    const brigProfile = findWelderByStamp(brigadeProfiles, newBrigade, true);
    const canonicalBrig = brigProfile ? brigProfile.stamp : newBrigade;
    setBrigadeStamp(canonicalBrig);
    let nextW1 = welder1Stamp;
    let nextW2 = welder2Stamp;
    if (
      brigProfile &&
      brigProfile.brigadeMembers &&
      brigProfile.brigadeMembers.length > 0
    ) {
      nextW1 = brigProfile.brigadeMembers[0] || '';
      nextW2 = brigProfile.brigadeMembers[1] || '';
      setWelder1Stamp(nextW1);
      setWelder2Stamp(nextW2);
    }
    applyWeldersPair(nextW1, nextW2, canonicalBrig);
  };

  // Выбор технологической карты из выпадающего списка
  const handleSelectTechCard = (tcNumber: string) => {
    const tc = techCards.find((c) => c.number === tcNumber);
    setForm((prev) => ({
      ...prev,
      techCardNumber: tcNumber,
      weldingType: tc?.weldingType || prev.weldingType,
      weldingMaterials: tc?.recommendedMaterials || prev.weldingMaterials,
    }));
  };

  // Обработчики для Элемента 1 и Элемента 2 (все характеристики строго из базы ЛРВ)
  const handleSelectLrv1 = (code: string) => {
    const item = lrvCatalog.find((i) => i.lrvCode === code);
    if (!item) {
      setForm((prev) => ({ ...prev, lrv1Code: code }));
      return;
    }
    setForm((prev) => ({
      ...prev,
      lrv1Code: item.lrvCode,
      elem1Name: item.shortName,
      elem1Material: item.material,
      elem1Ntd: item.ntd,
      elem1Manufacturer: item.manufacturer || '',
      elem1DiameterMm: item.diameterMm,
      elem1WallThickness: item.wallThickness,
      diameterMm: item.diameterMm,
      diameterInch: mmToInchDiameter(item.diameterMm),
      wallThickness: item.wallThickness,
    }));
  };

  const handleSelectLrv2 = (code: string) => {
    const item = lrvCatalog.find((i) => i.lrvCode === code);
    if (!item) {
      setForm((prev) => ({ ...prev, lrv2Code: code }));
      return;
    }
    // Если у детали 2 есть второй диаметр, совпадающий с диаметром Элемента 1, автоматически подставляем этот торец
    const useSecondEnd =
      item.diameterMm2 !== undefined &&
      item.diameterMm !== elem1Diam &&
      item.diameterMm2 === elem1Diam;
    const chosenDiam = useSecondEnd ? item.diameterMm2! : item.diameterMm;
    const chosenWall = useSecondEnd
      ? item.wallThickness2 ?? item.wallThickness
      : item.wallThickness;

    setForm((prev) => ({
      ...prev,
      lrv2Code: item.lrvCode,
      elem2Name: item.shortName,
      elem2Material: item.material,
      elem2Ntd: item.ntd,
      elem2Manufacturer: item.manufacturer || '',
      elem2DiameterMm: chosenDiam,
      elem2WallThickness: chosenWall,
    }));
  };

  // Копирование данных из Элемента 1 в Элемент 2 (иконка между блоками)
  const handleCopyElem1ToElem2 = () => {
    setForm((prev) => ({
      ...prev,
      lrv2Code: prev.lrv1Code,
      elem2Name: prev.elem1Name,
      elem2Material: prev.elem1Material,
      elem2Ntd: prev.elem1Ntd,
      elem2Manufacturer: prev.elem1Manufacturer,
      elem2DiameterMm: prev.elem1DiameterMm ?? prev.diameterMm,
      elem2WallThickness: prev.elem1WallThickness ?? prev.wallThickness,
      elem2FactoryNumber: prev.elem1FactoryNumber
        ? `${prev.elem1FactoryNumber}-К`
        : '',
      elem2Length: prev.elem1Length || '',
    }));
  };

  // Поменять местами Элемент 1 и Элемент 2 (иконка между блоками)
  const handleSwapElements = () => {
    setForm((prev) => ({
      ...prev,
      lrv1Code: prev.lrv2Code,
      elem1Name: prev.elem2Name,
      elem1Material: prev.elem2Material,
      elem1Ntd: prev.elem2Ntd,
      elem1Manufacturer: prev.elem2Manufacturer,
      elem1DiameterMm: prev.elem2DiameterMm ?? prev.diameterMm,
      elem1WallThickness: prev.elem2WallThickness ?? prev.wallThickness,
      elem1FactoryNumber: prev.elem2FactoryNumber,
      elem1Length: prev.elem2Length,
      lrv2Code: prev.lrv1Code,
      elem2Name: prev.elem1Name,
      elem2Material: prev.elem1Material,
      elem2Ntd: prev.elem1Ntd,
      elem2Manufacturer: prev.elem1Manufacturer,
      elem2DiameterMm: prev.elem1DiameterMm ?? prev.diameterMm,
      elem2WallThickness: prev.elem1WallThickness ?? prev.wallThickness,
      elem2FactoryNumber: prev.elem1FactoryNumber,
      elem2Length: prev.elem1Length,
    }));
  };

  // Только для режима создания нового стыка
  const handleRdCodeChangeInCreate = (newRdCode: string) => {
    const rdEntry = currentFacility.rdCodes.find((r) => r.code === newRdCode);
    const linesForNewRd = projectLineList.filter(
      (l) => l.objectName === form.objectName && l.rdCode === newRdCode
    );
    const firstLine = linesForNewRd[0];
    const nextLineNumber = firstLine?.lineNumber || form.lineNumber;
    const newUid = buildUniqueLineId(newRdCode, nextLineNumber);
    const strictLrvs = filterLrvCatalogByRd(lrvCatalog, newRdCode, false);
    const firstLrv = strictLrvs[0];
    const secondLrv = strictLrvs[1] || strictLrvs[0];

    setForm((prev) => ({
      ...prev,
      rdCode: newRdCode,
      lineNumber: nextLineNumber,
      contour: firstLine?.testContour || rdEntry?.contours[0] || prev.contour,
      uniqueLineId: newUid,
      diameterMm: firstLrv?.diameterMm || prev.diameterMm,
      diameterInch: mmToInchDiameter(firstLrv?.diameterMm || prev.diameterMm),
      wallThickness: firstLrv?.wallThickness || prev.wallThickness,
      lrv1Code: firstLrv?.lrvCode || '',
      elem1Name: firstLrv?.shortName || prev.elem1Name,
      elem1Material: firstLrv?.material || prev.elem1Material,
      elem1Ntd: firstLrv?.ntd || prev.elem1Ntd,
      elem1Manufacturer: firstLrv?.manufacturer || '',
      elem1DiameterMm: firstLrv?.diameterMm || prev.diameterMm,
      elem1WallThickness: firstLrv?.wallThickness || prev.wallThickness,
      lrv2Code: secondLrv?.lrvCode || '',
      elem2Name: secondLrv?.shortName || prev.elem2Name,
      elem2Material: secondLrv?.material || prev.elem2Material,
      elem2Ntd: secondLrv?.ntd || prev.elem2Ntd,
      elem2Manufacturer: secondLrv?.manufacturer || '',
      elem2DiameterMm: firstLrv?.diameterMm || prev.diameterMm,
      elem2WallThickness: firstLrv?.wallThickness || prev.wallThickness,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');

    if (!canSaveAnyField) {
      setValidationError(
        `Ограничение доступа (Field-Level RBAC): роль «${rbac.categoryLabel}» не имеет прав на редактирование полей паспорта стыка.`
      );
      return;
    }

    if (rbac.canEditPrepAndWeldingFields) {
      if (!diameterValidation.isMatch) {
        setValidationError(diameterValidation.message);
        return;
      }

      if (form.weldingDate && !weldingTypeValidation.isValid) {
        setValidationError(weldingTypeValidation.message);
        return;
      }

      if (form.weldingDate && !preheatValidation.isValid) {
        setValidationError(preheatValidation.message);
        return;
      }
    }

    if (!comprehensiveValidation.isValidToSave) {
      setValidationError(
        comprehensiveValidation.errors.map((err) => err.message).join(' | ')
      );
      return;
    }

    const computedUid = buildUniqueLineId(form.rdCode, form.lineNumber);
    const num = parseInt(form.jointNumber, 10);
    const isSupp = !Number.isNaN(num) && num % 10 !== 0;

    const rawSanitized = sanitizeWeldJointRecord({
      ...form,
      diameterMm: elem1Diam,
      diameterInch: mmToInchDiameter(elem1Diam),
      wallThickness: form.elem1WallThickness ?? form.wallThickness,
      uniqueLineId: computedUid,
      isSupplementary: isSupp,
    });

    const sanitized = currentUser
      ? enforceFieldLevelRbacOnJointSave(
          mode === 'edit' ? initialJoint : null,
          rawSanitized,
          currentUser
        )
      : rawSanitized;

    onSave(sanitized, isSupp, allowCrossRdLrv);
    onClose();
  };

  const handleNavigateToJoint = (targetJoint: WeldJoint) => {
    if (canSaveAnyField) {
      // Автосохранение текущих разрешённых по RBAC данных перед переходом (с санитизацией)
      const computedUid = buildUniqueLineId(form.rdCode, form.lineNumber);
      const num = parseInt(form.jointNumber, 10);
      const isSupp = !Number.isNaN(num) && num % 10 !== 0;
      const rawSanitized = sanitizeWeldJointRecord({
        ...form,
        diameterMm: elem1Diam,
        diameterInch: mmToInchDiameter(elem1Diam),
        wallThickness: form.elem1WallThickness ?? form.wallThickness,
        uniqueLineId: computedUid,
        isSupplementary: isSupp,
      });
      const sanitized =
        mode === 'edit' && initialJoint && currentUser
          ? enforceFieldLevelRbacOnJointSave(
              initialJoint,
              rawSanitized,
              currentUser
            )
          : rawSanitized;
      onSave(sanitized, isSupp, allowCrossRdLrv);
    }

    if (onNavigateJoint) {
      onNavigateJoint(targetJoint);
    }
  };

  const formatLrvOptionLabel = (item: LRVItem) => {
    const dims = item.diameterMm2
      ? `Ø1:${item.diameterMm}×${item.wallThickness} / Ø2:${item.diameterMm2}×${item.wallThickness2 ?? item.wallThickness}`
      : `Ø${item.diameterMm}×${item.wallThickness}`;
    const typeLabel = detectLrvElementType(item.shortName);
    return `${item.lrvCode} · [${typeLabel}] ${item.shortName} (${dims}, ${item.material}, ${item.ntd})`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={
        mode === 'create'
          ? 'Добавление нового сварного стыка'
          : 'Паспорт сварного стыка'
      }
    >
      <div
        className="fixed inset-0 bg-slate-900/45 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-6xl bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col max-h-[94vh] overflow-hidden">
        {/* Шапка паспорта цвета #1e3799 */}
        <div className="flex items-center justify-between px-6 py-3 bg-[#1e3799] text-white shrink-0">
          <div className="flex items-center gap-3">
            <FileCheck2 className="w-5 h-5 text-sky-300 shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base font-bold">
                  {mode === 'create'
                    ? 'Добавление нового сварного стыка'
                    : `Паспорт сварного стыка № ${form.jointNumber}`}
                </h2>
                {mode === 'edit' && lineJoints.length > 0 && (
                  <span className="hidden sm:inline-flex px-2 py-0.5 rounded text-[11px] font-mono bg-white/15 text-sky-100 border border-white/20">
                    Линия {form.lineNumber} ({currentLineIndex >= 0 ? currentLineIndex + 1 : 1}/{lineJoints.length})
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Быстрая навигация по стыкам на линии */}
            {mode === 'edit' && lineJoints.length > 1 && (
              <div className="flex items-center gap-1 bg-white/10 p-1 rounded-lg border border-white/20">
                <button
                  type="button"
                  disabled={!prevJoint}
                  onClick={() => prevJoint && handleNavigateToJoint(prevJoint)}
                  title={
                    prevJoint
                      ? `Предыдущий стык № ${prevJoint.jointNumber} (с автосохранением текущего)`
                      : 'Это первый стык на линии'
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-white/15 hover:bg-white/30 disabled:opacity-35 disabled:hover:bg-white/15 disabled:cursor-not-allowed text-white transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Стык</span> № {prevJoint ? prevJoint.jointNumber : '—'}
                </button>

                <span className="text-[11px] text-sky-200 font-mono px-1.5 hidden md:inline">
                  {currentLineIndex >= 0 ? `${currentLineIndex + 1} из ${lineJoints.length}` : ''}
                </span>

                <button
                  type="button"
                  disabled={!nextJoint}
                  onClick={() => nextJoint && handleNavigateToJoint(nextJoint)}
                  title={
                    nextJoint
                      ? `Следующий стык № ${nextJoint.jointNumber} (с автосохранением текущего)`
                      : 'Это последний стык на линии'
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-white/15 hover:bg-white/30 disabled:opacity-35 disabled:hover:bg-white/15 disabled:cursor-not-allowed text-white transition-colors"
                >
                  <span className="hidden sm:inline">Стык</span> № {nextJoint ? nextJoint.jointNumber : '—'}
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть паспорт стыка"
              className="p-1.5 rounded-lg text-sky-100 hover:text-white hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5">

          {validationError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-300 text-red-800 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Блок автоматической комплексной проверки корректности данных паспорта (5 уровней защиты) */}
          {comprehensiveValidation.allIssues.length > 0 && (
            <div
              className={`mb-4 p-3.5 rounded-xl border space-y-2 ${
                comprehensiveValidation.errors.length > 0
                  ? 'bg-red-50/90 border-red-300 text-red-900'
                  : 'bg-amber-50/90 border-amber-300 text-amber-900'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold">
                  <AlertTriangle
                    className={`w-4 h-4 shrink-0 ${
                      comprehensiveValidation.errors.length > 0
                        ? 'text-red-600'
                        : 'text-amber-600'
                    }`}
                  />
                  <span>
                    Автоматический контроль качества данных паспорта (
                    {comprehensiveValidation.errors.length > 0
                      ? `критических ошибок: ${comprehensiveValidation.errors.length}, предупреждений: ${comprehensiveValidation.warnings.length}`
                      : `предупреждений: ${comprehensiveValidation.warnings.length}`}
                    )
                  </span>
                </div>
                <span className="text-[10px] font-medium opacity-80">
                  {comprehensiveValidation.errors.length > 0
                    ? 'Исправьте критические ошибки перед сохранением'
                    : 'Рекомендации технадзора (сохранение разрешено)'}
                </span>
              </div>
              <ul className="space-y-1 text-[11px] pl-5 list-disc">
                {comprehensiveValidation.allIssues.map((iss) => (
                  <li
                    key={iss.id}
                    className={
                      iss.severity === 'error'
                        ? 'text-red-800 font-semibold'
                        : 'text-amber-900'
                    }
                  >
                    <span className="font-bold">{iss.title}:</span> {iss.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* ЛЕВАЯ БОКОВАЯ КОЛОНКА: СПРАВОЧНЫЙ БЛОК БЕЗ НАЗВАНИЯ (ОБЪЕКТ, ШИФР РД, ЛИНИЯ, КОНТУР, НОМЕР СТЫКА) */}
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
                /* В РЕЖИМЕ СОЗДАНИЯ НОВОГО СТЫКА: ВЫБОР ИЗ ЛАЙНЛИСТА И НАЗНАЧЕНИЕ НОМЕРА (БЕЗ ЗАГОЛОВКА БЛОКА) */
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
                        className="w-full px-3 py-1.5 bg-white border border-[#1e3799] rounded font-mono font-bold text-sm text-[#1e3799]"
                      />
                      <div className="text-[10px] text-slate-500 mt-1">
                        После добавления стыка его номер не подлежит переименованию
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </aside>

            {/* ПРАВАЯ ОСНОВНАЯ КОЛОНКА (9 колонок) */}
            <div className="lg:col-span-9 space-y-5">
              {/* БЛОК 1 И БЛОК 2: ПОДГОТОВКА И СВАРОЧНЫЕ РАБОТЫ (ДОСТУПНО ИНЖЕНЕРУ ПТО / СМР) */}
              <fieldset
                disabled={!rbac.canEditPrepAndWeldingFields}
                className={`space-y-5 border-0 p-0 m-0 min-w-0 ${
                  !rbac.canEditPrepAndWeldingFields
                    ? 'opacity-75 pointer-events-none select-none'
                    : ''
                }`}
              >
              {/* БЛОК 1: СВАРОЧНЫЕ РАБОТЫ */}
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
                          setForm((prev) => ({
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-start">
                  <div className="lg:col-span-3">
                    <label className="flex items-center justify-between text-xs font-bold text-slate-800 mb-1">
                      <span>Дата сварки *</span>
                      <span className="font-mono text-[#1e3799]">
                        {formatDateDDMMYY(form.weldingDate) || 'ДД.ММ.ГГ'}
                      </span>
                    </label>
                    <input
                      type="date"
                      value={form.weldingDate}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          weldingDate: e.target.value,
                        }))
                      }
                      aria-label="Дата сварки"
                      className="w-full px-2.5 py-2 bg-white border border-[#1e3799] rounded-md text-xs font-mono font-semibold"
                    />
                  </div>

                  <div className="lg:col-span-4">
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Технологическая карта на сварку (ТК) *
                    </label>
                    <select
                      value={form.techCardNumber}
                      onChange={(e) => handleSelectTechCard(e.target.value)}
                      aria-label="Технологическая карта на сварку"
                      className="w-full px-2.5 py-2 bg-white border border-[#1e3799] rounded-md text-xs font-mono font-bold text-[#1e3799]"
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
                    </select>
                  </div>

                  <div className="lg:col-span-3">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-1">
                      <span>Вид сварки *</span>
                      {selectedTechCard && !weldingTypeValidation.isValid && (
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              weldingType: selectedTechCard.weldingType,
                            }))
                          }
                          className="text-[10px] font-mono text-[#1e3799] hover:underline"
                          title="Установить вид сварки по выбранной техкарте"
                        >
                          По ТК: {selectedTechCard.weldingType}
                        </button>
                      )}
                    </div>
                    <select
                      value={form.weldingType}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          weldingType: e.target.value as WeldingType,
                        }))
                      }
                      aria-label="Вид сварки"
                      className={`w-full px-2.5 py-2 bg-white border rounded-md text-xs font-mono font-bold ${
                        weldingTypeValidation.isValid
                          ? 'border-emerald-400 text-emerald-900'
                          : 'border-red-400 text-red-900 bg-red-50/40'
                      }`}
                    >
                      {WELDING_TYPE_OPTIONS.map((wt) => (
                        <option key={wt} value={wt}>
                          {wt}
                        </option>
                      ))}
                    </select>
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
                    <div className="flex items-center justify-between text-xs font-medium text-slate-600 mb-1">
                      <span>T возд., °C</span>
                    </div>
                    <div
                      title={`Источник: ${currentWeatherStationName}`}
                      className="px-2.5 py-2 rounded-md bg-[#f4f8fe] border border-sky-200 flex items-center justify-between text-xs font-mono font-bold text-[#1e3799]"
                    >
                      <span className="inline-flex items-center gap-1">
                        <CloudSun className="w-3.5 h-3.5 shrink-0" />
                        <span>{form.ambientTemp || '—'} °C</span>
                      </span>
                    </div>
                    <div
                      className="mt-1 text-[10px] text-slate-500 truncate"
                      title={currentWeatherStationName}
                    >
                      {currentWeatherStationName}
                    </div>
                  </div>
                </div>

                {/* Строка 2: Поиск и выбор сварщиков по номеру клейма во время ввода («Сварщик 1», «Сварщик 2» и «Бригадное клеймо») */}
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

                    return null;
                  })()}
                </div>

                {/* Строка 3: Температура подогрева и Сварочные материалы */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
                  <div className="lg:col-span-5">
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Температура подогрева, °C *
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={form.preheatTemp ?? ''}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            preheatTemp: normalizeDecimalInput(e.target.value),
                          }))
                        }
                        placeholder="Напр.: 150"
                        aria-label="Температура подогрева"
                        className={`w-full px-3 py-2 bg-white border rounded-md text-xs font-mono font-bold ${
                          preheatValidation.isValid
                            ? 'border-emerald-400 text-emerald-900'
                            : 'border-red-400 text-red-900 bg-red-50/40'
                        }`}
                      />
                      {preheatValidation.requiredMinC > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              preheatTemp: String(preheatValidation.requiredMinC),
                            }))
                          }
                          className="px-2.5 py-2 rounded-md bg-sky-50 border border-sky-200 text-[#1e3799] text-[11px] font-mono font-semibold whitespace-nowrap hover:bg-sky-100"
                          title="Подставить минимальную температуру подогрева по ТК"
                        >
                          Норма ≥ +{preheatValidation.requiredMinC} °C
                        </button>
                      )}
                    </div>
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
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Сварочные материалы
                    </label>
                    <select
                      value={form.weldingMaterials}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          weldingMaterials: e.target.value,
                        }))
                      }
                      aria-label="Сварочные материалы"
                      className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono"
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
                    </select>
                  </div>

                  <div className="lg:col-span-3">
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Ответственное лицо
                    </label>
                    <input
                      type="text"
                      value={form.responsiblePerson}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          responsiblePerson: e.target.value,
                        }))
                      }
                      aria-label="Ответственное лицо"
                      className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-md text-xs"
                    />
                  </div>
                </div>

                {/* Строка 4: Тип сварного соединения по ГОСТ 16037-80 и Положение при сварке по системе НАКС */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Тип сварного соединения (по ГОСТ 16037-80) *
                    </label>
                    <select
                      value={form.gostJointType || 'С17'}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          gostJointType: e.target.value,
                        }))
                      }
                      aria-label="Тип сварного соединения"
                      className="w-full px-2.5 py-2 bg-white border border-[#1e3799] rounded-md text-xs font-mono font-semibold text-[#1e3799]"
                    >
                      {GOST_16037_JOINT_TYPES.map((gost) => (
                        <option key={gost.code} value={gost.code}>
                          {gost.description}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Положение при сварке (по системе НАКС) *
                    </label>
                    <select
                      value={form.weldingPosition || 'В1'}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          weldingPosition: e.target.value,
                        }))
                      }
                      aria-label="Положение"
                      className="w-full px-2.5 py-2 bg-white border border-[#1e3799] rounded-md text-xs font-mono font-semibold text-[#1e3799]"
                    >
                      {NAKS_WELDING_POSITIONS.map((pos) => (
                        <option key={pos.code} value={pos.code}>
                          {pos.description}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* БЛОК 2: СВАРИВАЕМЫЕ ЭЛЕМЕНТЫ («ЭЛЕМЕНТ 1» И «ЭЛЕМЕНТ 2», ПОИСК ПО ЛРВ/НАИМЕНОВАНИЮ/НТД/ДИАМЕТРУ/ТИПУ, ВСЕ ХАРАКТЕРИСТИКИ СТРОГО ИЗ БАЗЫ ЛРВ) */}
              <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-3">
                    <h3 className="text-xs font-bold text-slate-900">
                      Свариваемые элементы («Элемент 1» и «Элемент 2»)
                    </h3>
                    <select
                      value={form.jointType}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          jointType: e.target.value as JointType,
                        }))
                      }
                      aria-label="Тип стыка"
                      className="px-2.5 py-1 bg-slate-50 border border-slate-300 rounded text-xs font-semibold text-[#1e3799]"
                    >
                      <option value="Монтажный">Тип стыка: Монтажный</option>
                      <option value="Цеховой">Тип стыка: Цеховой</option>
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filterLrvBySameDiameter}
                        onChange={(e) => setFilterLrvBySameDiameter(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-[#1e3799]"
                      />
                      <span>Подбирать Элемент 2 по диаметру Элемента 1 (Ø{elem1Diam} мм)</span>
                    </label>

                    {!allowCrossRdLrv ? (
                      <button
                        type="button"
                        onClick={() => setAllowCrossRdLrv(true)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#e8f1fc] text-[#1e3799] text-[11px] font-medium border border-sky-200"
                      >
                        <Lock className="w-3 h-3" />
                        <span>ЛРВ по РД ({availableLrvItems.length}) · Снять блок</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAllowCrossRdLrv(false)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-50 text-amber-800 text-[11px] font-semibold border border-amber-300"
                      >
                        <Unlock className="w-3 h-3" />
                        <span>ЛРВ из всех РД · Вернуть запрет</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Индикатор проверки совпадения диаметров обоих элементов */}
                <div
                  className={`px-3 py-2 rounded-lg text-xs flex items-center justify-between gap-2 ${
                    diameterValidation.isMatch
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                      : 'bg-red-50 border border-red-300 text-red-900 font-bold'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {diameterValidation.isMatch ? (
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    )}
                    <span>{diameterValidation.message}</span>
                  </div>
                  <span className="font-mono text-xs font-bold">
                    Эл.1: Ø{elem1Diam}×{form.elem1WallThickness ?? form.wallThickness} мм · Эл.2: Ø{elem2Diam}×{form.elem2WallThickness ?? form.wallThickness} мм
                  </span>
                </div>

                {/* Карточки «Элемент 1» — [Иконки Копировать и Поменять местами] — «Элемент 2» */}
                <div className="grid grid-cols-1 lg:grid-cols-11 gap-3 items-stretch">
                  {/* ЭЛЕМЕНТ 1 (5 колонок) */}
                  <div className="lg:col-span-5 p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 flex flex-col justify-between">
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#1e3799]">
                          Элемент 1
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-slate-200 font-mono text-[11px] font-bold text-[#1e3799]">
                          <Lock className="w-3 h-3 text-slate-400" />
                          <span>Из базы ЛРВ · Ø{elem1Diam}×{form.elem1WallThickness ?? form.wallThickness} мм</span>
                        </span>
                      </div>

                      {/* Поиск элемента 1 по ЛРВ, краткому наименованию, НТД, диаметру и типу элемента */}
                      <div className="p-2 rounded-lg bg-white border border-slate-200/90 space-y-1.5">
                        <div className="grid grid-cols-12 gap-1.5">
                          <div className="col-span-5">
                            <select
                              value={elem1TypeFilter}
                              onChange={(e) =>
                                setElem1TypeFilter(
                                  e.target.value as LrvElementCategory
                                )
                              }
                              aria-label="Тип элемента 1"
                              className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded text-[11px] font-semibold text-[#1e3799]"
                            >
                              {LRV_ELEMENT_TYPE_OPTIONS.map((t) => (
                                <option key={t} value={t}>
                                  {t === 'Все типы' ? 'Тип: Все' : t}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-7 relative">
                            <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              type="text"
                              value={elem1SearchQuery}
                              onChange={(e) => setElem1SearchQuery(e.target.value)}
                              placeholder="Поиск: ЛРВ, наимен., НТД, Ø..."
                              aria-label="Поиск Элемента 1 по базе ЛРВ"
                              className="w-full pl-6 pr-2 py-1 bg-white border border-slate-300 rounded text-[11px]"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                            Выбор элемента из базы ЛРВ (найдено: {filteredLrvOptionsElem1.length})
                          </label>
                          <select
                            value={form.lrv1Code}
                            onChange={(e) => handleSelectLrv1(e.target.value)}
                            aria-label="Код ЛРВ Элемент 1"
                            className="w-full px-2.5 py-1.5 bg-white border border-[#1e3799] rounded text-xs font-mono font-semibold text-[#1e3799]"
                          >
                            <option value="">— Выберите элемент из базы ЛРВ —</option>
                            {filteredLrvOptionsElem1.map((item) => (
                              <option key={item.id} value={item.lrvCode}>
                                {formatLrvOptionLabel(item)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {selectedLrv1Item?.diameterMm2 && (
                        <div className="flex items-center justify-between gap-1 px-2 py-1 rounded bg-[#e8f1fc] border border-sky-200 text-[11px]">
                          <span className="text-[#1e3799] font-medium">Торец детали (из ЛРВ):</span>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                setForm((prev) => ({
                                  ...prev,
                                  elem1DiameterMm: selectedLrv1Item.diameterMm,
                                  elem1WallThickness: selectedLrv1Item.wallThickness,
                                  diameterMm: selectedLrv1Item.diameterMm,
                                  diameterInch: mmToInchDiameter(selectedLrv1Item.diameterMm),
                                  wallThickness: selectedLrv1Item.wallThickness,
                                }))
                              }
                              className={`px-2 py-0.5 rounded font-mono border ${
                                elem1Diam === selectedLrv1Item.diameterMm
                                  ? 'bg-[#1e3799] text-white border-[#1e3799]'
                                  : 'bg-white text-[#1e3799] border-sky-300'
                              }`}
                            >
                              Ø1: {selectedLrv1Item.diameterMm}×{selectedLrv1Item.wallThickness}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setForm((prev) => ({
                                  ...prev,
                                  elem1DiameterMm: selectedLrv1Item.diameterMm2!,
                                  elem1WallThickness:
                                    selectedLrv1Item.wallThickness2 ??
                                    selectedLrv1Item.wallThickness,
                                  diameterMm: selectedLrv1Item.diameterMm2!,
                                  diameterInch: mmToInchDiameter(
                                    selectedLrv1Item.diameterMm2!
                                  ),
                                  wallThickness:
                                    selectedLrv1Item.wallThickness2 ??
                                    selectedLrv1Item.wallThickness,
                                }))
                              }
                              className={`px-2 py-0.5 rounded font-mono border ${
                                elem1Diam === selectedLrv1Item.diameterMm2
                                  ? 'bg-[#1e3799] text-white border-[#1e3799]'
                                  : 'bg-white text-[#1e3799] border-sky-300'
                              }`}
                            >
                              Ø2: {selectedLrv1Item.diameterMm2}×
                              {selectedLrv1Item.wallThickness2 ?? selectedLrv1Item.wallThickness}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Характеристики Элемента 1 строго из базы ЛРВ (без возможности переименования) */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2">
                          <div className="flex items-center justify-between text-[11px] text-slate-500 mb-0.5">
                            <span>Краткое наименование (из ЛРВ)</span>
                            <span className="font-mono text-[10px] text-[#1e3799] font-semibold">
                              {detectLrvElementType(form.elem1Name)}
                            </span>
                          </div>
                          <div
                            aria-label="Наименование Элемента 1 из базы ЛРВ"
                            className="w-full px-2.5 py-1.5 bg-slate-100/90 border border-slate-200 rounded text-xs font-semibold text-slate-800 select-all"
                          >
                            {form.elem1Name || '—'}
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-0.5">
                            Диаметр Ø, мм
                          </label>
                          <div
                            aria-label="Диаметр Элемента 1"
                            className="w-full px-2.5 py-1.5 bg-slate-100/90 border border-slate-200 rounded text-xs font-mono font-bold text-[#1e3799]"
                          >
                            {elem1Diam}
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-0.5">
                            Толщина S, мм
                          </label>
                          <div className="w-full px-2.5 py-1.5 bg-slate-100/90 border border-slate-200 rounded text-xs font-mono text-slate-800">
                            {form.elem1WallThickness ?? form.wallThickness}
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-0.5">
                            Материал
                          </label>
                          <div className="w-full px-2.5 py-1.5 bg-slate-100/90 border border-slate-200 rounded text-xs font-mono text-slate-800">
                            {form.elem1Material || '—'}
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-0.5">
                            НТД
                          </label>
                          <div className="w-full px-2.5 py-1.5 bg-slate-100/90 border border-slate-200 rounded text-xs text-slate-800 truncate">
                            {form.elem1Ntd || '—'}
                          </div>
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[11px] text-slate-500 mb-0.5">
                            Завод-поставщик (из ЛРВ)
                          </label>
                          <div
                            aria-label="Завод-поставщик Элемента 1"
                            className="w-full px-2.5 py-1.5 bg-slate-100/90 border border-slate-200 rounded text-xs text-slate-800 truncate"
                            title={form.elem1Manufacturer || selectedLrv1Item?.manufacturer || ''}
                          >
                            {form.elem1Manufacturer || selectedLrv1Item?.manufacturer || '—'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200 grid grid-cols-12 gap-2">
                      <div className="col-span-7">
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Заводской номер
                        </label>
                        <input
                          type="text"
                          value={form.elem1FactoryNumber || ''}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              elem1FactoryNumber: e.target.value,
                            }))
                          }
                          placeholder="Зав. № детали 1"
                          aria-label="Заводской номер Элемента 1"
                          className="w-full px-2.5 py-1.5 bg-white border border-[#1e3799]/50 rounded text-xs font-mono font-semibold text-slate-900"
                        />
                      </div>
                      <div className="col-span-5">
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Длина, м
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={form.elem1Length || ''}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              elem1Length: normalizeDecimalInput(e.target.value),
                            }))
                          }
                          placeholder="Напр.: 11.8"
                          aria-label="Длина Элемента 1"
                          className="w-full px-2.5 py-1.5 bg-white border border-[#1e3799]/50 rounded text-xs font-mono font-semibold text-slate-900"
                        />
                      </div>
                    </div>
                  </div>

                  {/* ЦЕНТРАЛЬНАЯ КОЛОНКА МЕЖДУ БЛОКАМИ: ИКОНКА КОПИРОВАНИЯ 1->2 И ИКОНКА ЗАМЕНЫ МЕСТАМИ 1<->2 */}
                  <div className="lg:col-span-1 flex lg:flex-col items-center justify-center gap-2 py-1">
                    <button
                      type="button"
                      onClick={handleCopyElem1ToElem2}
                      aria-label="Скопировать данные из Элемента 1 в Элемент 2"
                      title="Скопировать данные из Элемента 1 в Элемент 2"
                      className="p-2.5 rounded-xl bg-[#e8f1fc] border border-[#1e3799]/30 text-[#1e3799] hover:bg-[#1e3799] hover:text-white transition-colors shadow-2xs"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleSwapElements}
                      aria-label="Поменять местами Элемент 1 и Элемент 2"
                      title="Поменять местами Элемент 1 и Элемент 2"
                      className="p-2.5 rounded-xl bg-[#e8f1fc] border border-[#1e3799]/30 text-[#1e3799] hover:bg-[#1e3799] hover:text-white transition-colors shadow-2xs"
                    >
                      <ArrowLeftRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* ЭЛЕМЕНТ 2 (5 колонок) */}
                  <div className="lg:col-span-5 p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 flex flex-col justify-between">
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#1e3799]">
                          Элемент 2
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-mono text-[11px] font-bold ${
                            diameterValidation.isMatch
                              ? 'bg-white border-slate-200 text-[#1e3799]'
                              : 'bg-red-100 border-red-300 text-red-800'
                          }`}
                        >
                          <Lock className="w-3 h-3 text-slate-400" />
                          <span>Из базы ЛРВ · Ø{elem2Diam}×{form.elem2WallThickness ?? form.wallThickness} мм</span>
                        </span>
                      </div>

                      {/* Поиск элемента 2 по ЛРВ, краткому наименованию, НТД, диаметру и типу элемента */}
                      <div className="p-2 rounded-lg bg-white border border-slate-200/90 space-y-1.5">
                        <div className="grid grid-cols-12 gap-1.5">
                          <div className="col-span-5">
                            <select
                              value={elem2TypeFilter}
                              onChange={(e) =>
                                setElem2TypeFilter(
                                  e.target.value as LrvElementCategory
                                )
                              }
                              aria-label="Тип элемента 2"
                              className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded text-[11px] font-semibold text-[#1e3799]"
                            >
                              {LRV_ELEMENT_TYPE_OPTIONS.map((t) => (
                                <option key={t} value={t}>
                                  {t === 'Все типы' ? 'Тип: Все' : t}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-7 relative">
                            <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              type="text"
                              value={elem2SearchQuery}
                              onChange={(e) => setElem2SearchQuery(e.target.value)}
                              placeholder="Поиск: ЛРВ, наимен., НТД, Ø..."
                              aria-label="Поиск Элемента 2 по базе ЛРВ"
                              className="w-full pl-6 pr-2 py-1 bg-white border border-slate-300 rounded text-[11px]"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                            Выбор элемента из базы ЛРВ (найдено: {filteredLrvOptionsElem2.length})
                          </label>
                          <select
                            value={form.lrv2Code}
                            onChange={(e) => handleSelectLrv2(e.target.value)}
                            aria-label="Код ЛРВ Элемент 2"
                            className="w-full px-2.5 py-1.5 bg-white border border-[#1e3799] rounded text-xs font-mono font-semibold text-[#1e3799]"
                          >
                            <option value="">— Выберите элемент из базы ЛРВ —</option>
                            {filteredLrvOptionsElem2.map((item) => (
                              <option key={item.id} value={item.lrvCode}>
                                {formatLrvOptionLabel(item)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {selectedLrv2Item?.diameterMm2 && (
                        <div className="flex items-center justify-between gap-1 px-2 py-1 rounded bg-[#e8f1fc] border border-sky-200 text-[11px]">
                          <span className="text-[#1e3799] font-medium">Торец детали (из ЛРВ):</span>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                setForm((prev) => ({
                                  ...prev,
                                  elem2DiameterMm: selectedLrv2Item.diameterMm,
                                  elem2WallThickness: selectedLrv2Item.wallThickness,
                                }))
                              }
                              className={`px-2 py-0.5 rounded font-mono border ${
                                elem2Diam === selectedLrv2Item.diameterMm
                                  ? 'bg-[#1e3799] text-white border-[#1e3799]'
                                  : 'bg-white text-[#1e3799] border-sky-300'
                              }`}
                            >
                              Ø1: {selectedLrv2Item.diameterMm}×{selectedLrv2Item.wallThickness}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setForm((prev) => ({
                                  ...prev,
                                  elem2DiameterMm: selectedLrv2Item.diameterMm2!,
                                  elem2WallThickness:
                                    selectedLrv2Item.wallThickness2 ??
                                    selectedLrv2Item.wallThickness,
                                }))
                              }
                              className={`px-2 py-0.5 rounded font-mono border ${
                                elem2Diam === selectedLrv2Item.diameterMm2
                                  ? 'bg-[#1e3799] text-white border-[#1e3799]'
                                  : 'bg-white text-[#1e3799] border-sky-300'
                              }`}
                            >
                              Ø2: {selectedLrv2Item.diameterMm2}×
                              {selectedLrv2Item.wallThickness2 ?? selectedLrv2Item.wallThickness}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Характеристики Элемента 2 строго из базы ЛРВ (без возможности переименования) */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2">
                          <div className="flex items-center justify-between text-[11px] text-slate-500 mb-0.5">
                            <span>Краткое наименование (из ЛРВ)</span>
                            <span className="font-mono text-[10px] text-[#1e3799] font-semibold">
                              {detectLrvElementType(form.elem2Name)}
                            </span>
                          </div>
                          <div
                            aria-label="Наименование Элемента 2 из базы ЛРВ"
                            className="w-full px-2.5 py-1.5 bg-slate-100/90 border border-slate-200 rounded text-xs font-semibold text-slate-800 select-all"
                          >
                            {form.elem2Name || '—'}
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-0.5">
                            Диаметр Ø, мм
                          </label>
                          <div
                            aria-label="Диаметр Элемента 2"
                            className={`w-full px-2.5 py-1.5 border rounded text-xs font-mono font-bold ${
                              diameterValidation.isMatch
                                ? 'bg-slate-100/90 border-slate-200 text-[#1e3799]'
                                : 'bg-red-50 border-red-400 text-red-700'
                            }`}
                          >
                            {elem2Diam}
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-0.5">
                            Толщина S, мм
                          </label>
                          <div className="w-full px-2.5 py-1.5 bg-slate-100/90 border border-slate-200 rounded text-xs font-mono text-slate-800">
                            {form.elem2WallThickness ?? form.wallThickness}
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-0.5">
                            Материал
                          </label>
                          <div className="w-full px-2.5 py-1.5 bg-slate-100/90 border border-slate-200 rounded text-xs font-mono text-slate-800">
                            {form.elem2Material || '—'}
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-0.5">
                            НТД
                          </label>
                          <div className="w-full px-2.5 py-1.5 bg-slate-100/90 border border-slate-200 rounded text-xs text-slate-800 truncate">
                            {form.elem2Ntd || '—'}
                          </div>
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[11px] text-slate-500 mb-0.5">
                            Завод-поставщик (из ЛРВ)
                          </label>
                          <div
                            aria-label="Завод-поставщик Элемента 2"
                            className="w-full px-2.5 py-1.5 bg-slate-100/90 border border-slate-200 rounded text-xs text-slate-800 truncate"
                            title={form.elem2Manufacturer || selectedLrv2Item?.manufacturer || ''}
                          >
                            {form.elem2Manufacturer || selectedLrv2Item?.manufacturer || '—'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200 grid grid-cols-12 gap-2">
                      <div className="col-span-7">
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Заводской номер
                        </label>
                        <input
                          type="text"
                          value={form.elem2FactoryNumber || ''}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              elem2FactoryNumber: e.target.value,
                            }))
                          }
                          placeholder="Зав. № детали 2"
                          aria-label="Заводской номер Элемента 2"
                          className="w-full px-2.5 py-1.5 bg-white border border-[#1e3799]/50 rounded text-xs font-mono font-semibold text-slate-900"
                        />
                      </div>
                      <div className="col-span-5">
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Длина, м
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={form.elem2Length || ''}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              elem2Length: normalizeDecimalInput(e.target.value),
                            }))
                          }
                          placeholder="Напр.: 0.35"
                          aria-label="Длина Элемента 2"
                          className="w-full px-2.5 py-1.5 bg-white border border-[#1e3799]/50 rounded text-xs font-mono font-semibold text-slate-900"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              </fieldset>

              {/* БЛОК 3: ВИК, НК И ДУБЛИРУЮЩИЙ КОНТРОЛЬ (ДОСТУПНО СПЕЦИАЛИСТУ ЛНК) */}
              <fieldset
                disabled={!rbac.canEditNdtFields}
                className={`border-0 p-0 m-0 min-w-0 space-y-2 ${
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
                    Контроль ВИК (3 поля)
                  </h4>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-0.5">
                      Результат ВИК
                    </label>
                    <select
                      value={form.vikResult}
                      onChange={(e) => {
                        const nextVik = e.target.value as ControlResult;
                        setForm((prev) => ({
                          ...prev,
                          vikResult: nextVik,
                          vikDate: nextVik === 'Не проводился' ? '' : prev.vikDate,
                          vikInspector:
                            nextVik === 'Не проводился' ? '' : prev.vikInspector,
                          dupNdtType:
                            nextVik === 'Ремонт' && prev.dupNdtType === 'Не требуется'
                              ? prev.ndtType !== 'Не требуется'
                                ? prev.ndtType
                                : 'РК'
                              : prev.dupNdtType,
                        }));
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
                    Неразрушающий контроль НК (4 поля)
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
                          setForm((prev) => ({
                            ...prev,
                            ndtResult: nextRes,
                            ndtDate: nextRes === 'Не проводился' ? '' : prev.ndtDate,
                            ndtInspector:
                              nextRes === 'Не проводился' ? '' : prev.ndtInspector,
                            dupNdtType:
                              nextRes === 'Ремонт' && prev.dupNdtType === 'Не требуется'
                                ? prev.ndtType !== 'Не требуется'
                                  ? prev.ndtType
                                  : 'РК'
                                : prev.dupNdtType,
                          }));
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
                  <h4 className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-1.5">
                    Дублирующий контроль (4 поля)
                  </h4>
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
                          setForm((prev) => ({
                            ...prev,
                            dupNdtResult: nextDupRes,
                            dupNdtDate:
                              nextDupRes === 'Не проводился' ? '' : prev.dupNdtDate,
                            dupNdtInspector:
                              nextDupRes === 'Не проводился'
                                ? ''
                                : prev.dupNdtInspector,
                          }));
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
                </div>
              </div>
              </fieldset>

              {/* ДОПОЛНИТЕЛЬНЫЕ ДАННЫЕ ДЛЯ ФОРМЫ ЖУРНАЛА ПО ГОСТ 32569-2013 (ГРАФЫ 10–14, 16, 17) */}
              <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <div className="text-xs font-bold text-slate-900">
                    Специальные графы журнала сварки по ГОСТ 32569-2013 (графы 10–14, 16, 17)
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Гр. 10–14: Инженер ПТО · Гр. 16–17: Специалист ЛНК
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-0.5">
                      Гр. 10: Отметка о контроле корня шва
                    </label>
                    <input
                      type="text"
                      disabled={!rbac.canEditPrepAndWeldingFields}
                      value={form.rootWeldControl || ''}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, rootWeldControl: e.target.value }))
                      }
                      placeholder="Авто: Годен, дата ВИК"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-0.5">
                      Гр. 11: Стилоскопирование шва (№ закл., дата)
                    </label>
                    <input
                      type="text"
                      disabled={!rbac.canEditPrepAndWeldingFields}
                      value={form.steeloscopyInfo || ''}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, steeloscopyInfo: e.target.value }))
                      }
                      placeholder="н/п / Соответствует, СТ-..."
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-0.5">
                      Гр. 12: Ф.И.О. оператора термиста, клеймо
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
                    <label className="block text-[11px] text-slate-600 mb-0.5">
                      Гр. 13: № диаграммы термообработки
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
                    <label className="block text-[11px] text-slate-600 mb-0.5">
                      Гр. 14: Твердость металла шва (№ закл., дата)
                    </label>
                    <input
                      type="text"
                      disabled={!rbac.canEditPrepAndWeldingFields}
                      value={form.hardnessTestInfo || ''}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, hardnessTestInfo: e.target.value }))
                      }
                      placeholder="н/п / HB 185, ТВ-..."
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-0.5">
                      Гр. 16: № заключения НК
                    </label>
                    <input
                      type="text"
                      disabled={!rbac.canEditNdtFields}
                      value={form.ndtReportNumber || ''}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, ndtReportNumber: e.target.value }))
                      }
                      placeholder={`Авто: ${form.ndtType}-${form.jointNumber}`}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-600 mb-0.5">
                      Гр. 17: Измерение ферритной фазы в металле шва (№ закл., дата)
                    </label>
                    <input
                      type="text"
                      disabled={!rbac.canEditNdtFields}
                      value={form.ferritePhaseInfo || ''}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, ferritePhaseInfo: e.target.value }))
                      }
                      placeholder="н/п / 4,2%, ФФ-..."
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>
                </div>
              </div>

              {/* ИСТОРИЯ ИЗМЕНЕНИЙ ЭТОГО СТЫКА */}
              {mode === 'edit' && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                    <History className="w-3.5 h-3.5 text-[#1e3799]" />
                    <span>
                      История изменений паспорта стыка № {form.jointNumber} (записей:{' '}
                      {auditLogsForJoint.length})
                    </span>
                  </div>
                  {auditLogsForJoint.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      По данному стыку изменений после первичного ввода не зафиксировано.
                    </p>
                  ) : (
                    <div className="max-h-28 overflow-y-auto divide-y divide-slate-200/80 text-xs">
                      {auditLogsForJoint.map((log) => (
                        <div
                          key={log.id}
                          className="py-1.5 flex flex-wrap items-center justify-between gap-2"
                        >
                          <div>
                            <span className="font-semibold text-slate-800">
                              {log.fieldLabel}:
                            </span>{' '}
                            <span className="line-through text-slate-400 font-mono">
                              {log.oldValue}
                            </span>{' '}
                            →{' '}
                            <span className="font-mono font-semibold text-[#1e3799]">
                              {log.newValue}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {log.userFullName} · {formatTimestampDDMMYY(log.timestamp)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Футер паспорта стыка */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 mt-5 border-t border-slate-200">
            <div className="text-xs text-slate-500">
              Все изменения фиксируются в журнале аудита с указанием пользователя и времени (ДД.ММ.ГГ)
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
              >
                Отмена
              </button>
              {mode === 'edit' && nextJoint && (
                <button
                  type="button"
                  onClick={() => handleNavigateToJoint(nextJoint)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#1e3799] bg-[#e8f1fc] text-[#1e3799] text-xs font-semibold hover:bg-sky-100 transition-colors"
                  title={`Сохранить текущий стык и сразу перейти к следующему стыку № ${nextJoint.jointNumber}`}
                >
                  <span>Сохранить и след. (№ {nextJoint.jointNumber})</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
              <button
                type="submit"
                disabled={!canSaveAnyField}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#1e3799] text-white text-xs font-semibold hover:bg-[#15276e] disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed shadow-xs"
              >
                {canSaveAnyField ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Lock className="w-4 h-4" />
                )}
                <span>
                  {!canSaveAnyField
                    ? `Только чтение (${rbac.categoryLabel})`
                    : mode === 'create'
                    ? 'Добавить стык в реестр'
                    : 'Сохранить паспорт стыка'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
