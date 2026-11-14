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
  Layers,
  Lock,
  MapPin,
  Search,
  ShieldCheck,
  Trash2,
  Unlock,
  Users,
  Wrench,
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
  calculateEquivalentDiaInch,
  checkNaksCertStatus,
  detectLrvConnectionType,
  detectLrvElementType,
  filterLrvByDiameter,
  filterLrvCatalogByRd,
  findWelderByStamp,
  formatDateDDMMYY,
  formatTimestampDDMMYY,
  getEpcWallThicknessFactor,
  getFacilityWeatherStationName,
  GOST_16037_JOINT_TYPES,
  isJointDefective,
  isJointFullyAccepted,
  getAvailableSizesFromLrv,
  LrvSizeOption,
  LRV_ELEMENT_TYPE_OPTIONS,
  mmToInchDiameter,
  NAKS_WELDING_POSITIONS,
  normalizeDecimalInput,
  normalizeStampString,
  resolveLrvConnectionType,
  resolveLrvItemCategory,
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

import {
  WelderStampCombobox,
  PassportHeader,
  PassportValidationBanner,
  PassportTabBar,
  PassportRequisitesSidebar,
  PassportWeldingTab,
  PassportElementsTab,
  PassportControlTab,
  PassportRepairTab,
  PassportHistoryTab,
} from './passport';

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

export type PassportTab =
  | 'welding'
  | 'elements'
  | 'control'
  | 'repair'
  | 'history';

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

  // Активная вкладка формы паспорта (Этап 2: модульная эргономика)
  const [activeTab, setActiveTab] = useState<PassportTab>(() => {
    if (rbac.category === 'ndt') return 'control';
    if (initialJoint && isJointDefective(initialJoint)) return 'repair';
    return 'welding';
  });

  // Выбор сварщиков через выпадающее меню: 2 поля «Сварщик 1» и «Сварщик 2» + опционально бригадное клеймо
  const [welder1Stamp, setWelder1Stamp] = useState<string>(
    () => welders.find((w) => !w.isBrigade)?.stamp || ''
  );
  const [welder2Stamp, setWelder2Stamp] = useState<string>('');
  const [brigadeStamp, setBrigadeStamp] = useState<string>('');

  // Поиск и каскадная фильтрация элементов 1 и 2 по базе ЛРВ (тип, типоразмер, код, наименование)
  const [elem1SearchQuery, setElem1SearchQuery] = useState('');
  const [elem1TypeFilter, setElem1TypeFilter] =
    useState<LrvElementCategory>('Все типы');
  const [elem1SizeFilter, setElem1SizeFilter] = useState<string>('all');
  const [elem2SearchQuery, setElem2SearchQuery] = useState('');
  const [elem2TypeFilter, setElem2TypeFilter] =
    useState<LrvElementCategory>('Все типы');
  const [elem2SizeFilter, setElem2SizeFilter] = useState<string>('all');

  const [form, setForm] = useState<WeldJoint>(() => {
    if (initialJoint) return { ...initialJoint };
    const initLineNum = firstLineObj?.lineNumber || 'ФП1.2/1';
    const initDate = '2026-06-15';
    const archivedTemp = firstFac.weatherArchive?.[initDate] || '';
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
      weldingDate: '',
      welderStamp: '',
      welderStampsList: [],
      brigadeStamp: '',
      weldingMaterials:
        techCards[0]?.recommendedMaterials ||
        weldingMaterialsList[0]?.brandAndDiameter ||
        'Св-08Г2С Ø2.0 / УОНИ-13/55 Ø3.0',
      ambientTemp: '',
      preheatTemp: '',
      responsiblePerson: '',
      welderFullName: '',
      welderCertNumber: '',
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
      repairAction: '',
      repairDate: '',
      repairTechCard: '',
      repairWelderStamp: '',
      repairForeman: '',
      repairVikNumber: '',
      repairVikDate: '',
      repairVikResult: 'Не проводился',
      repairVikInspector: '',
      repairNdtType: 'Не требуется',
      repairNdtNumber: '',
      repairNdtDate: '',
      repairNdtResult: 'Не проводился',
      repairNdtInspector: '',
      repairDupNdtType: 'Не требуется',
      repairDupNdtNumber: '',
      repairDupNdtDate: '',
      repairDupNdtResult: 'Не проводился',
      repairDupNdtInspector: '',
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

  // Доступные уникальные типоразмеры (Ø×S) для Элемента 1 и Элемента 2
  const elem1AvailableSizes = useMemo(
    () => getAvailableSizesFromLrv(availableLrvItems, elem1TypeFilter),
    [availableLrvItems, elem1TypeFilter]
  );

  const elem2AvailableSizes = useMemo(
    () => getAvailableSizesFromLrv(baseLrvOptionsForElem2, elem2TypeFilter),
    [baseLrvOptionsForElem2, elem2TypeFilter]
  );

  // Отфильтрованные списки ЛРВ для Элемента 1 и Элемента 2 по поисковому запросу, типу и типоразмеру
  const filteredLrvOptionsElem1 = useMemo(() => {
    const matches = searchLrvCatalogItems(
      availableLrvItems,
      elem1SearchQuery,
      elem1TypeFilter,
      elem1SizeFilter
    );
    if (
      selectedLrv1Item &&
      !matches.some((m) => m.lrvCode === selectedLrv1Item.lrvCode)
    ) {
      return [selectedLrv1Item, ...matches];
    }
    return matches;
  }, [
    availableLrvItems,
    elem1SearchQuery,
    elem1TypeFilter,
    elem1SizeFilter,
    selectedLrv1Item,
  ]);

  const filteredLrvOptionsElem2 = useMemo(() => {
    const matches = searchLrvCatalogItems(
      baseLrvOptionsForElem2,
      elem2SearchQuery,
      elem2TypeFilter,
      elem2SizeFilter
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
    elem2SizeFilter,
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

  const duplicateJointOnLine = useMemo(() => {
    const candidateNumber = (form.jointNumber || '').trim().toLowerCase();
    if (!candidateNumber) return null;
    const currentLineKey = (
      form.uniqueLineId ||
      buildUniqueLineId(form.rdCode, form.lineNumber) ||
      `${form.rdCode || ''}__${form.lineNumber || ''}`
    ).trim().toLowerCase();

    return (
      allJoints.find((j) => {
        if (j.id === form.id) return false;
        const jLineKey = (
          j.uniqueLineId ||
          buildUniqueLineId(j.rdCode, j.lineNumber) ||
          `${j.rdCode || ''}__${j.lineNumber || ''}`
        ).trim().toLowerCase();
        if (jLineKey !== currentLineKey) return false;
        return (j.jointNumber || '').trim().toLowerCase() === candidateNumber;
      }) || null
    );
  }, [allJoints, form.id, form.jointNumber, form.uniqueLineId, form.rdCode, form.lineNumber]);

  // Инициализация состояния при открытии модального окна
  useEffect(() => {
    if (!isOpen) return;
    setAllowCrossRdLrv(false);
    setConfirmDeleteStep(false);
    setValidationError('');
    setElem1SearchQuery('');
    setElem1TypeFilter('Все типы');
    setElem1SizeFilter('all');
    setElem2SearchQuery('');
    setElem2TypeFilter('Все типы');
    setElem2SizeFilter('all');

    if (rbac.category === 'ndt') {
      setActiveTab('control');
    } else if (initialJoint && isJointDefective(initialJoint)) {
      setActiveTab('repair');
    } else {
      setActiveTab('welding');
    }

    if (initialJoint) {
      const fac =
        facilities.find((f) => f.name === initialJoint.objectName) ||
        facilities[0] ||
        fallbackEmptyFac;
      const archivedTemp = initialJoint.weldingDate
        ? fac.weatherArchive?.[initialJoint.weldingDate]
        : undefined;
      const autoTempFormatted =
        archivedTemp !== undefined && archivedTemp.trim() !== ''
          ? archivedTemp
          : initialJoint.ambientTemp || '';

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
        ambientTemp: initialJoint.ambientTemp ?? '',
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
        preheatTemp: initialJoint.preheatTemp ?? '',
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

    setWelder1Stamp('');
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
      elem1FactoryNumber: '',
      elem1Length: '',
      lrv2Code: lrv2?.lrvCode || '',
      elem2Name: lrv2?.shortName || '',
      elem2Material: lrv2?.material || '09Г2С',
      elem2Ntd: lrv2?.ntd || 'ГОСТ 17375-2001',
      elem2DiameterMm: lrv1?.diameterMm || 159,
      elem2WallThickness: lrv1?.wallThickness || 8.0,
      elem2Manufacturer: lrv2?.manufacturer || '',
      elem2FactoryNumber: '',
      elem2Length: '',
      weldingDate: '',
      ambientTemp: '',
      preheatTemp: '',
      weldingType: techCards[0]?.weldingType || 'РАД+РД',
      gostJointType: 'С17',
      weldingPosition: 'В1',
      welderStamp: '',
      welderStampsList: [],
      welderFullName: '',
      welderCertNumber: '',
      responsiblePerson: '',
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
      repairAction: '',
      repairDate: '',
      repairTechCard: '',
      repairWelderStamp: '',
      repairForeman: '',
      repairVikNumber: '',
      repairVikDate: '',
      repairVikResult: 'Не проводился',
      repairVikInspector: '',
      repairNdtType: 'Не требуется',
      repairNdtNumber: '',
      repairNdtDate: '',
      repairNdtResult: 'Не проводился',
      repairNdtInspector: '',
      repairDupNdtType: 'Не требуется',
      repairDupNdtNumber: '',
      repairDupNdtDate: '',
      repairDupNdtResult: 'Не проводился',
      repairDupNdtInspector: '',
    }));
  }, [isOpen, mode, initialJoint]);

  // Автоматический пересчёт температуры воздуха при изменении объекта или даты сварки (с приоритетом метеоархива объекта)
  useEffect(() => {
    if (!isOpen || !form.weldingDate) return;
    // В режиме редактирования существующего стыка сохранённая температура никогда не затирается и не перезаписывается автоматически!
    if (mode === 'edit') return;
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
    // Если фактических наблюдений в архиве станции нет — оставляем поле пустым (статус «нет данных»).
    // Запрещено незаметно подставлять климатическую расчетную температуру!
    setForm((prev) =>
      prev.ambientTemp === '' ? prev : { ...prev, ambientTemp: '' }
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

  // Проверка совпадения диаметров Элемента 1 и Элемента 2 (для углового соединения допускаются разные Ø)
  const diameterValidation = validateElementsDiameterMatch(elem1Diam, elem2Diam, form.jointKind);

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
    const resolved = resolveWeldersSelection(stamps, nextBrigade, welders, form.weldingType);
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
      elem2CertNumber: prev.elem1CertNumber || '',
      elem2HeatNumber: prev.elem1HeatNumber || '',
      elem2BatchNumber: prev.elem1BatchNumber || '',
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
      elem1CertNumber: prev.elem2CertNumber,
      elem1HeatNumber: prev.elem2HeatNumber,
      elem1BatchNumber: prev.elem2BatchNumber,
      lrv2Code: prev.lrv1Code,
      elem2Name: prev.elem1Name,
      elem2Material: prev.elem1Material,
      elem2Ntd: prev.elem1Ntd,
      elem2Manufacturer: prev.elem1Manufacturer,
      elem2DiameterMm: prev.elem1DiameterMm ?? prev.diameterMm,
      elem2WallThickness: prev.elem1WallThickness ?? prev.wallThickness,
      elem2FactoryNumber: prev.elem1FactoryNumber,
      elem2Length: prev.elem1Length,
      elem2CertNumber: prev.elem1CertNumber,
      elem2HeatNumber: prev.elem1HeatNumber,
      elem2BatchNumber: prev.elem1BatchNumber,
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

    if (duplicateJointOnLine) {
      setValidationError(
        `Стык с номером «${form.jointNumber}» уже зарегистрирован на линии «${form.lineNumber || form.uniqueLineId}» (ID: ${duplicateJointOnLine.id}). Дублирование номеров стыков на одной линии категорически запрещено.`
      );
      return;
    }

    if (!canSaveAnyField) {
      setValidationError(
        `Ограничение доступа (Field-Level RBAC): роль «${rbac.categoryLabel}» не имеет прав на редактирование полей паспорта стыка.`
      );
      return;
    }

    if (rbac.canEditPrepAndWeldingFields) {
      if (!diameterValidation.isMatch) {
        setActiveTab('elements');
        setValidationError(diameterValidation.message);
        return;
      }

      if (form.weldingDate && !weldingTypeValidation.isValid) {
        setActiveTab('welding');
        setValidationError(weldingTypeValidation.message);
        return;
      }

      if (form.weldingDate && !preheatValidation.isValid) {
        setActiveTab('welding');
        setValidationError(preheatValidation.message);
        return;
      }
    }

    if (!comprehensiveValidation.isValidToSave) {
      setValidationError(
        comprehensiveValidation.errors.map((err) => err.message).join(' | ')
      );
      const firstErr = comprehensiveValidation.errors[0];
      if (firstErr) {
        if (firstErr.category === 'ndt') {
          setActiveTab('control');
        } else if (firstErr.category === 'tech' || firstErr.category === 'chronology') {
          setActiveTab('welding');
        } else if (firstErr.category === 'referential' || firstErr.category === 'boundary') {
          setActiveTab('elements');
        }
      }
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
      equivDiameterInch: calculateEquivalentDiaInch(
        elem1Diam,
        form.elem1WallThickness ?? form.wallThickness
      ),
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
        equivDiameterInch: calculateEquivalentDiaInch(
          elem1Diam,
          form.elem1WallThickness ?? form.wallThickness
        ),
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
      ? `Ø1: ${item.diameterMm}×${item.wallThickness} / Ø2: ${item.diameterMm2}×${item.wallThickness2 ?? item.wallThickness}`
      : `Ø${item.diameterMm}×${item.wallThickness}`;
    const mfg = item.manufacturer ? ` · ${item.manufacturer}` : '';
    const ntd = item.ntd ? ` [${item.ntd}]` : '';
    const statusNote =
      item.status === 'superseded' || item.status === 'archived'
        ? ` [АННУЛИРОВАНА: ${item.replacementLetter || 'заменена'}]`
        : '';
    return `${item.shortName} · ст.${item.material}${mfg} · ${dims}${ntd}${statusNote} (ЛРВ: ${item.lrvCode})`;
  };

  const isPrimaryDefective =
    form.vikResult === 'Ремонт' ||
    form.vikResult === 'Вырезать' ||
    form.ndtResult === 'Ремонт' ||
    form.ndtResult === 'Вырезать';

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
        <PassportHeader
          mode={mode}
          form={form}
          lineJoints={lineJoints}
          currentLineIndex={currentLineIndex}
          prevJoint={prevJoint}
          nextJoint={nextJoint}
          onNavigateToJoint={handleNavigateToJoint}
          onClose={onClose}
        />

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Прокручиваемое содержимое формы */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">

          <PassportValidationBanner
            validationError={validationError}
            comprehensiveValidation={comprehensiveValidation}
          />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <PassportRequisitesSidebar
              mode={mode}
              form={form}
              setForm={setForm}
              rbac={rbac}
              facilities={facilities}
              currentFacility={currentFacility}
              projectLineList={projectLineList}
              availableLinesForRd={availableLinesForRd}
              currentWeatherStationName={currentWeatherStationName}
              elem1Diam={elem1Diam}
              isSupplementaryMode={isSupplementaryMode}
              setIsSupplementaryMode={setIsSupplementaryMode}
              confirmDeleteStep={confirmDeleteStep}
              setConfirmDeleteStep={setConfirmDeleteStep}
              duplicateJointOnLine={duplicateJointOnLine}
              existingNumbersInLine={existingNumbersInLine}
              baseJointForSupp={baseJointForSupp}
              onOpenFacilityLocation={onOpenFacilityLocation}
              onDeleteJoint={onDeleteJoint}
              onClose={onClose}
              handleRdCodeChangeInCreate={handleRdCodeChangeInCreate}
            />

            {/* ПРАВАЯ ОСНОВНАЯ КОЛОНКА (9 колонок) */}
            <div className="lg:col-span-9 space-y-4">
              <PassportTabBar
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                form={form}
                mode={mode}
                rbac={rbac}
                auditLogsCount={auditLogsForJoint.length}
              />

              {/* ВКЛАДКА 1: СВАРОЧНЫЕ РАБОТЫ */}
              {activeTab === 'welding' && (
                <PassportWeldingTab
                  form={form}
                  setForm={setForm}
                  rbac={rbac}
                  techCards={techCards}
                  weldingMaterialsList={weldingMaterialsList}
                  welder1Stamp={welder1Stamp}
                  setWelder1Stamp={setWelder1Stamp}
                  welder2Stamp={welder2Stamp}
                  setWelder2Stamp={setWelder2Stamp}
                  brigadeStamp={brigadeStamp}
                  setBrigadeStamp={setBrigadeStamp}
                  personalWelders={personalWelders}
                  brigadeProfiles={brigadeProfiles}
                  currentWeatherStationName={currentWeatherStationName}
                  archivedStationTemp={form.weldingDate ? currentFacility.weatherArchive?.[form.weldingDate] : undefined}
                  selectedTechCard={selectedTechCard}
                  weldingTypeValidation={weldingTypeValidation}
                  preheatValidation={preheatValidation}
                  handleSelectTechCard={handleSelectTechCard}
                  handleWelder1Change={handleWelder1Change}
                  handleWelder2Change={handleWelder2Change}
                  handleBrigadeStampChange={handleBrigadeStampChange}
                />
              )}

              {/* ВКЛАДКА 2: СВАРИВАЕМЫЕ ЭЛЕМЕНТЫ */}
              {activeTab === 'elements' && (
                <PassportElementsTab
                  form={form}
                  setForm={setForm}
                  rbac={rbac}
                  filterLrvBySameDiameter={filterLrvBySameDiameter}
                  setFilterLrvBySameDiameter={setFilterLrvBySameDiameter}
                  allowCrossRdLrv={allowCrossRdLrv}
                  setAllowCrossRdLrv={setAllowCrossRdLrv}
                  availableLrvItems={availableLrvItems}
                  elem1Diam={elem1Diam}
                  elem2Diam={elem2Diam}
                  diameterValidation={diameterValidation}
                  elem1TypeFilter={elem1TypeFilter}
                  setElem1TypeFilter={setElem1TypeFilter}
                  elem1SizeFilter={elem1SizeFilter}
                  setElem1SizeFilter={setElem1SizeFilter}
                  elem1AvailableSizes={elem1AvailableSizes}
                  elem1SearchQuery={elem1SearchQuery}
                  setElem1SearchQuery={setElem1SearchQuery}
                  elem2TypeFilter={elem2TypeFilter}
                  setElem2TypeFilter={setElem2TypeFilter}
                  elem2SizeFilter={elem2SizeFilter}
                  setElem2SizeFilter={setElem2SizeFilter}
                  elem2AvailableSizes={elem2AvailableSizes}
                  elem2SearchQuery={elem2SearchQuery}
                  setElem2SearchQuery={setElem2SearchQuery}
                  filteredLrvOptionsElem1={filteredLrvOptionsElem1}
                  filteredLrvOptionsElem2={filteredLrvOptionsElem2}
                  selectedLrv1Item={selectedLrv1Item}
                  selectedLrv2Item={selectedLrv2Item}
                  handleSelectLrv1={handleSelectLrv1}
                  handleSelectLrv2={handleSelectLrv2}
                  handleCopyElem1ToElem2={handleCopyElem1ToElem2}
                  handleSwapElements={handleSwapElements}
                  formatLrvOptionLabel={formatLrvOptionLabel}
                />
              )}

              {/* ВКЛАДКА 3: ВИК, НК И ДУБЛИРУЮЩИЙ КОНТРОЛЬ */}
              {activeTab === 'control' && (
                <PassportControlTab
                  form={form}
                  setForm={setForm}
                  rbac={rbac}
                  currentUser={currentUser}
                  inspectors={inspectors}
                />
              )}

              {/* ВКЛАДКА 4: СВЕДЕНИЯ О РЕМОНТЕ И КОНТРОЛЬ ПОСЛЕ РЕМОНТА */}
              {activeTab === 'repair' && (
                <PassportRepairTab
                  form={form}
                  setForm={setForm}
                  rbac={rbac}
                  inspectors={inspectors}
                  welders={welders}
                  techCards={techCards}
                />
              )}

              {/* ВКЛАДКА 5: ИСТОРИЯ ИЗМЕНЕНИЙ ЭТОГО СТЫКА (только для Администратора) */}
              {activeTab === 'history' && mode === 'edit' && rbac.category === 'admin' && (
                <PassportHistoryTab
                  jointNumber={form.jointNumber}
                  auditLogsForJoint={auditLogsForJoint}
                />
              )}
            </div>
          </div>
          </div>

          {/* Фиксированный футер паспорта стыка (всегда закреплён внизу окна, не скроллится) */}
          <div className="shrink-0 bg-white border-t border-slate-200 px-6 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] z-20 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span>Все изменения фиксируются в журнале аудита с указанием автора и времени</span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer transition-colors"
              >
                Отмена
              </button>
              {mode === 'edit' && nextJoint && (
                <button
                  type="button"
                  onClick={() => handleNavigateToJoint(nextJoint)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#1e3799] bg-[#e8f1fc] text-[#1e3799] text-xs font-semibold hover:bg-sky-100 transition-colors cursor-pointer"
                  title={`Сохранить текущий стык и сразу перейти к следующему стыку № ${nextJoint.jointNumber}`}
                >
                  <span>Сохранить и след. (№ {nextJoint.jointNumber})</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
              <button
                type="submit"
                disabled={!canSaveAnyField || Boolean(duplicateJointOnLine)}
                title={Boolean(duplicateJointOnLine) ? `Сохранение заблокировано: номер стыка «${form.jointNumber}» уже занят на этой линии` : undefined}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-[#1e3799] text-white text-xs font-semibold hover:bg-[#15276e] disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed shadow-xs cursor-pointer transition-colors"
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
