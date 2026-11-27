import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  FacilityObject,
  InspectorProfile,
  JointType,
  LrvElementCategory,
  LRVItem,
  ProjectLineItem,
  TechCardItem,
  UserAccount,
  WelderProfile,
  WeldingMaterialCertificate,
  WeldingType,
  WeldJoint,
} from '../../types/welding';
import {
  canUserMutateRecord,
  enforceFieldLevelRbacOnJointSave,
  getUserRolePermissions,
} from '../../utils/rbac';
import {
  buildUniqueLineId,
  detectLrvConnectionType,
  detectLrvElementType,
  filterLrvByDiameter,
  filterLrvCatalogByRd,
  findWelderByStamp,
  getAvailableSizesFromLrv,
  getFacilityWeatherStationName,
  isJointDefective,
  mmToInchDiameter,
  normalizeDecimalInput,
  normalizeStampString,
  resolveLrvItemCategory,
  resolveWeldersSelection,
  searchLrvCatalogItems,
  validateElementsDiameterMatch,
  validatePreheatTemperature,
  validateWeldingTypeWithTechCard,
} from '../../utils/weldingLogic';
import {
  sanitizeWeldJointRecord,
  validateWeldJointComprehensive,
} from '../../utils/dataIntegrityGuard';
import { AppContext } from '../../context/AppContext';
import {
  clearElementFields,
  copyBothElementsFromJoint,
  createBlankJointForCreateMode,
  findUniqueAutoSelectableLrv,
  getCopyableLineJoints,
  pickDefaultDonorJointId,
} from '../../utils/passportSmartInput';
import { PassportTab } from './PassportTabBar';

export type { PassportTab };

export interface UseJointPassportFormProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialJoint: WeldJoint | null;
  allJoints: WeldJoint[];
  facilities: FacilityObject[];
  projectLineList: ProjectLineItem[];
  lrvCatalog: LRVItem[];
  welders: WelderProfile[];
  techCards: TechCardItem[];
  weldingMaterialsList: WeldingMaterialCertificate[];
  defaultObjectName?: string;
  defaultRdCode?: string;
  currentUser?: UserAccount;
  onSave: (
    joint: WeldJoint,
    isSupplementary: boolean,
    crossRdAllowed: boolean
  ) => Promise<{ ok: boolean; message?: string } | void> | void;
  onClose: () => void;
}

export function useJointPassportForm({
  isOpen,
  mode,
  initialJoint,
  allJoints,
  facilities,
  projectLineList,
  lrvCatalog,
  welders,
  techCards,
  weldingMaterialsList,
  defaultObjectName,
  defaultRdCode,
  currentUser,
  onSave,
  onClose,
}: UseJointPassportFormProps) {
  const appCtx = useContext(AppContext);
  const testCircuits = appCtx?.testCircuits ?? [];

  const rbac = getUserRolePermissions(currentUser);
  const recordEditCheck =
    mode === 'edit' && initialJoint
      ? canUserMutateRecord(currentUser, initialJoint, ['PTO', 'PIL', 'SK'], 'edit', false)
      : { allowed: rbac.canCreateOrDeleteJoints };
  const recordDeleteCheck =
    mode === 'edit' && initialJoint
      ? canUserMutateRecord(currentUser, initialJoint, ['PTO'], 'delete', false)
      : { allowed: false };
  const effectiveRbac =
    mode === 'edit' && !recordEditCheck.allowed
      ? {
          ...rbac,
          canEditPrepAndWeldingFields: false,
          canEditNdtFields: false,
          canCreateOrDeleteJoints: false,
          canManageTestCircuits: false,
        }
      : {
          ...rbac,
          canCreateOrDeleteJoints:
            mode === 'edit' ? recordDeleteCheck.allowed : rbac.canCreateOrDeleteJoints,
        };
  const canSaveAnyField =
    mode === 'create'
      ? rbac.canCreateOrDeleteJoints
      : recordEditCheck.allowed &&
        (rbac.canEditPrepAndWeldingFields ||
          rbac.canEditNdtFields ||
          rbac.canManageTestCircuits);

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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [activeTab, setActiveTab] = useState<PassportTab>(() => {
    if (rbac.category === 'ndt') return 'control';
    if (initialJoint && isJointDefective(initialJoint)) return 'repair';
    return 'welding';
  });

  const [welder1Stamp, setWelder1Stamp] = useState<string>(() => {
    if (!initialJoint) return '';
    const stamps =
      initialJoint.welderStampsList ||
      (initialJoint.welderStamp ? [initialJoint.welderStamp] : []);
    return stamps[0] || '';
  });
  const [welder2Stamp, setWelder2Stamp] = useState<string>(() => {
    if (!initialJoint) return '';
    const stamps =
      initialJoint.welderStampsList ||
      (initialJoint.welderStamp ? [initialJoint.welderStamp] : []);
    return stamps[1] || '';
  });
  const [brigadeStamp, setBrigadeStamp] = useState<string>(
    () => initialJoint?.brigadeStamp || ''
  );

  const [elem1SearchQuery, setElem1SearchQuery] = useState('');
  const [elem1TypeFilter, setElem1TypeFilter] =
    useState<LrvElementCategory>('Все типы');
  const [elem1SizeFilter, setElem1SizeFilter] = useState<string>('all');
  const [elem2SearchQuery, setElem2SearchQuery] = useState('');
  const [elem2TypeFilter, setElem2TypeFilter] =
    useState<LrvElementCategory>('Все типы');
  const [elem2SizeFilter, setElem2SizeFilter] = useState<string>('all');
  const [elem1AutoSelectedCode, setElem1AutoSelectedCode] = useState<string | null>(null);
  const [elem2AutoSelectedCode, setElem2AutoSelectedCode] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const initialSnapshotRef = useRef<string>('');
  const prevWeldingDateRef = useRef<string>('');

  const [form, setForm] = useState<WeldJoint>(() => {
    if (initialJoint) return { ...initialJoint };
    return createBlankJointForCreateMode({
      objectName: firstFac.name,
      rdCode: firstRd,
      lineNumber: firstLineObj?.lineNumber || '',
      contour:
        firstLineObj?.testContour ||
        firstFac.rdCodes[0]?.contours[0] ||
        '',
      updatedBy: currentUser?.login || 'engineer',
    });
  });

  const currentFacility = useMemo(() => {
    return facilities.find((f) => f.name === form.objectName) || facilities[0] || fallbackEmptyFac;
  }, [facilities, form.objectName]);

  const currentRdObj = useMemo(() => {
    return currentFacility.rdCodes.find((r) => r.code === form.rdCode) || currentFacility.rdCodes[0];
  }, [currentFacility, form.rdCode]);

  const currentWeatherStationName = useMemo(() => {
    return getFacilityWeatherStationName(currentFacility);
  }, [currentFacility]);

  const personalWelders = useMemo(() => welders.filter((w) => !w.isBrigade), [welders]);
  const brigadeProfiles = useMemo(() => welders.filter((w) => w.isBrigade), [welders]);

  const availableLinesForRd = useMemo(() => {
    return projectLineList.filter(
      (l) => l.objectName === form.objectName && l.rdCode === form.rdCode
    );
  }, [projectLineList, form.objectName, form.rdCode]);

  const existingNumbersInLine = useMemo(() => {
    return allJoints
      .filter((j) => j.uniqueLineId === form.uniqueLineId && j.id !== form.id)
      .map((j) => j.jointNumber);
  }, [allJoints, form.uniqueLineId, form.id]);

  const duplicateJointOnLine = useMemo(() => {
    return (
      allJoints.find(
        (j) =>
          j.uniqueLineId === form.uniqueLineId &&
          j.jointNumber.toLowerCase() === form.jointNumber.trim().toLowerCase() &&
          j.id !== form.id
      ) || null
    );
  }, [allJoints, form.uniqueLineId, form.jointNumber, form.id]);

  const availableLrvItems = useMemo(
    () => filterLrvCatalogByRd(lrvCatalog, form.rdCode, allowCrossRdLrv),
    [lrvCatalog, form.rdCode, allowCrossRdLrv]
  );

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

  const baseLrvOptionsForElem2 = useMemo(() => {
    if (!filterLrvBySameDiameter || !elem1Diam) return availableLrvItems;
    const filtered = filterLrvByDiameter(availableLrvItems, elem1Diam);
    return filtered.length > 0 ? filtered : availableLrvItems;
  }, [availableLrvItems, filterLrvBySameDiameter, elem1Diam]);

  const elem1AvailableSizes = useMemo(
    () => getAvailableSizesFromLrv(availableLrvItems, elem1TypeFilter),
    [availableLrvItems, elem1TypeFilter]
  );

  const elem2AvailableSizes = useMemo(
    () => getAvailableSizesFromLrv(baseLrvOptionsForElem2, elem2TypeFilter),
    [baseLrvOptionsForElem2, elem2TypeFilter]
  );

  const elem1EffectiveSizeForSearch = useMemo(() => {
    if (!elem1SizeFilter || elem1SizeFilter === 'all') return 'all';
    const existsForType = elem1AvailableSizes.some((s) => s.key === elem1SizeFilter);
    return existsForType ? elem1SizeFilter : 'all';
  }, [elem1SizeFilter, elem1AvailableSizes]);

  const elem2EffectiveSizeForSearch = useMemo(() => {
    if (!elem2SizeFilter || elem2SizeFilter === 'all') return 'all';
    const existsForType = elem2AvailableSizes.some((s) => s.key === elem2SizeFilter);
    return existsForType ? elem2SizeFilter : 'all';
  }, [elem2SizeFilter, elem2AvailableSizes]);

  const filteredLrvOptionsElem1 = useMemo(() => {
    return searchLrvCatalogItems(
      availableLrvItems,
      elem1SearchQuery,
      elem1TypeFilter,
      elem1EffectiveSizeForSearch
    );
  }, [availableLrvItems, elem1SearchQuery, elem1TypeFilter, elem1EffectiveSizeForSearch]);

  const filteredLrvOptionsElem2 = useMemo(() => {
    return searchLrvCatalogItems(
      baseLrvOptionsForElem2,
      elem2SearchQuery,
      elem2TypeFilter,
      elem2EffectiveSizeForSearch
    );
  }, [baseLrvOptionsForElem2, elem2SearchQuery, elem2TypeFilter, elem2EffectiveSizeForSearch]);

  const resolveFiltersFromJoint = (joint: WeldJoint) => {
    const lrv1 = lrvCatalog.find((i) => i.lrvCode === joint.lrv1Code);
    const lrv2 = lrvCatalog.find((i) => i.lrvCode === joint.lrv2Code);

    const type1: LrvElementCategory = lrv1
      ? resolveLrvItemCategory(lrv1)
      : joint.elem1Name
      ? detectLrvElementType(joint.elem1Name)
      : 'Все типы';
    const d1 = joint.elem1DiameterMm ?? joint.diameterMm ?? 0;
    const w1 = joint.elem1WallThickness ?? joint.wallThickness ?? 0;
    const size1 = d1 > 0 && w1 > 0 ? `${d1}x${w1}` : 'all';

    const type2: LrvElementCategory = lrv2
      ? resolveLrvItemCategory(lrv2)
      : joint.elem2Name
      ? detectLrvElementType(joint.elem2Name)
      : 'Все типы';
    const d2 = joint.elem2DiameterMm ?? joint.diameterMm ?? 0;
    const w2 = joint.elem2WallThickness ?? joint.wallThickness ?? 0;
    const size2 = d2 > 0 && w2 > 0 ? `${d2}x${w2}` : 'all';

    return { type1, size1, type2, size2 };
  };

  // Sync & guaranteed reset when modal opens or switches joint/mode
  useEffect(() => {
    if (!isOpen) return;

    setValidationError('');
    setConfirmDeleteStep(false);
    setShowDiscardConfirm(false);
    setAllowCrossRdLrv(false);
    setFilterLrvBySameDiameter(true);
    setElem1SearchQuery('');
    setElem2SearchQuery('');
    setElem1AutoSelectedCode(null);
    setElem2AutoSelectedCode(null);

    if (mode === 'edit' && initialJoint) {
      setForm({ ...initialJoint });
      initialSnapshotRef.current = JSON.stringify(initialJoint);
      prevWeldingDateRef.current = initialJoint.weldingDate || '';
      setIsSupplementaryMode(Boolean(initialJoint.isSupplementary));
      const synced = resolveFiltersFromJoint(initialJoint);
      setElem1TypeFilter(synced.type1);
      setElem1SizeFilter(synced.size1);
      setElem2TypeFilter(synced.type2);
      setElem2SizeFilter(synced.size2);
      const stamps =
        initialJoint.welderStampsList ||
        (initialJoint.welderStamp ? [initialJoint.welderStamp] : []);
      setWelder1Stamp(stamps[0] || '');
      setWelder2Stamp(stamps[1] || '');
      setBrigadeStamp(initialJoint.brigadeStamp || '');
      if (rbac.category === 'ndt') {
        setActiveTab('control');
      } else if (isJointDefective(initialJoint)) {
        setActiveTab('repair');
      } else {
        setActiveTab('welding');
      }
      return;
    }

    // Режим создания: гарантированный полный сброс с сохранением только объекта, РД и линии
    setElem1TypeFilter('Все типы');
    setElem1SizeFilter('all');
    setElem2TypeFilter('Все типы');
    setElem2SizeFilter('all');
    setIsSupplementaryMode(false);
    setWelder1Stamp('');
    setWelder2Stamp('');
    setBrigadeStamp('');
    setActiveTab(rbac.category === 'ndt' ? 'control' : 'welding');

    const createdJoint = createBlankJointForCreateMode({
      objectName: firstFac.name,
      rdCode: firstRd,
      lineNumber: firstLineObj?.lineNumber || '',
      contour:
        firstLineObj?.testContour ||
        firstFac.rdCodes[0]?.contours[0] ||
        '',
      updatedBy: currentUser?.login || 'engineer',
    });
    initialSnapshotRef.current = JSON.stringify(createdJoint);
    prevWeldingDateRef.current = createdJoint.weldingDate || '';
    setForm(createdJoint);
  }, [isOpen, mode, initialJoint]);

  // Автоподстановка температуры из архива метеостанции объекта (работает и при создании, и при редактировании даты)
  useEffect(() => {
    if (!isOpen) return;
    const prevDate = prevWeldingDateRef.current;
    if (form.weldingDate === prevDate) return;
    prevWeldingDateRef.current = form.weldingDate;

    if (!form.weldingDate) return;
    const fac = facilities.find((f) => f.name === form.objectName) || facilities[0];
    if (!fac) return;
    const archivedVal = fac.weatherArchive?.[form.weldingDate];
    if (archivedVal !== undefined && String(archivedVal).trim() !== '') {
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
    if (mode === 'create') {
      setForm((prev) => (prev.ambientTemp === '' ? prev : { ...prev, ambientTemp: '' }));
    }
  }, [form.objectName, form.weldingDate, facilities, isOpen, mode]);

  // Navigation across line joints (edit mode)
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

  // Стыки текущей линии, доступные как источник для копирования элементов (и в create, и в edit)
  const copyableLineJoints = useMemo(
    () => getCopyableLineJoints(allJoints, form.uniqueLineId, form.id),
    [allJoints, form.uniqueLineId, form.id]
  );

  const defaultDonorJointId = useMemo(
    () => pickDefaultDonorJointId(copyableLineJoints, form.jointNumber),
    [copyableLineJoints, form.jointNumber]
  );

  const currentLineIndex = useMemo(() => {
    return lineJoints.findIndex((j) => j.id === form.id);
  }, [lineJoints, form.id]);

  const prevJoint = currentLineIndex > 0 ? lineJoints[currentLineIndex - 1] : null;
  const nextJoint =
    currentLineIndex >= 0 && currentLineIndex < lineJoints.length - 1
      ? lineJoints[currentLineIndex + 1]
      : null;

  const handleSafeClose = () => {
    const currentSnapshot = JSON.stringify(form);
    const isDirty =
      initialSnapshotRef.current !== '' && currentSnapshot !== initialSnapshotRef.current;
    if (isDirty) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  };

  const confirmDiscardAndClose = () => {
    setShowDiscardConfirm(false);
    onClose();
  };

  const cancelDiscardClose = () => {
    setShowDiscardConfirm(false);
  };

  const selectedTechCard = techCards.find((tc) => tc.number === form.techCardNumber);
  const diameterValidation = validateElementsDiameterMatch(elem1Diam, elem2Diam, form.jointKind);
  const weldingTypeValidation = validateWeldingTypeWithTechCard(form.weldingType, selectedTechCard);
  const preheatValidation = validatePreheatTemperature(form.preheatTemp, form.ambientTemp, selectedTechCard);

  const comprehensiveValidation = validateWeldJointComprehensive({
    joint: form,
    allJoints,
    projectLineList,
    lrvCatalog,
    welders,
    techCards,
    weldingMaterials: weldingMaterialsList,
  });

  const applyWeldersPair = (nextW1: string, nextW2: string, nextBrigade: string) => {
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
      canonical1 && normalizeStampString(canonical1) === normalizeStampString(welder2Stamp)
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

  const handleBrigadeStampChange = (newBrigade: string) => {
    const brigProfile = findWelderByStamp(brigadeProfiles, newBrigade, true);
    const canonicalBrig = brigProfile ? brigProfile.stamp : newBrigade;
    setBrigadeStamp(canonicalBrig);
    let nextW1 = welder1Stamp;
    let nextW2 = welder2Stamp;
    if (brigProfile && brigProfile.brigadeMembers && brigProfile.brigadeMembers.length > 0) {
      nextW1 = brigProfile.brigadeMembers[0] || '';
      nextW2 = brigProfile.brigadeMembers[1] || '';
      setWelder1Stamp(nextW1);
      setWelder2Stamp(nextW2);
    }
    applyWeldersPair(nextW1, nextW2, canonicalBrig);
  };

  const handleSelectTechCard = (tcNumber: string) => {
    const tc = techCards.find((c) => c.number === tcNumber);
    setForm((prev) => ({
      ...prev,
      techCardNumber: tcNumber,
      weldingType: tc?.weldingType || prev.weldingType,
      weldingMaterials: tc?.recommendedMaterials || prev.weldingMaterials,
    }));
  };

  const handleSelectLrv1 = (code: string, isAuto = false) => {
    if (!code) {
      setElem1AutoSelectedCode(null);
      setElem1SearchQuery('');
      setForm((prev) => ({
        ...prev,
        lrv1Code: '',
        elem1Name: '',
        elem1Material: '',
        elem1Ntd: '',
        elem1Manufacturer: '',
        elem1DiameterMm: 0,
        elem1WallThickness: 0,
        diameterMm: 0,
        diameterInch: '',
        wallThickness: 0,
      }));
      return;
    }
    const item = lrvCatalog.find((i) => i.lrvCode === code);
    setElem1AutoSelectedCode(isAuto && item ? item.lrvCode : null);
    if (!item) {
      setForm((prev) => ({ ...prev, lrv1Code: code }));
      return;
    }
    // Синхронизируем тип элемента и типоразмер по коду ЛРВ
    setElem1TypeFilter(resolveLrvItemCategory(item));
    setElem1SizeFilter(
      item.diameterMm > 0 && item.wallThickness > 0
        ? `${item.diameterMm}x${item.wallThickness}`
        : 'all'
    );
    setElem1SearchQuery('');
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

  const handleSelectLrv2 = (code: string, isAuto = false) => {
    if (!code) {
      setElem2AutoSelectedCode(null);
      setElem2SearchQuery('');
      setForm((prev) => ({
        ...prev,
        lrv2Code: '',
        elem2Name: '',
        elem2Material: '',
        elem2Ntd: '',
        elem2Manufacturer: '',
        elem2DiameterMm: 0,
        elem2WallThickness: 0,
      }));
      return;
    }
    const item = lrvCatalog.find((i) => i.lrvCode === code);
    setElem2AutoSelectedCode(isAuto && item ? item.lrvCode : null);
    if (!item) {
      setForm((prev) => ({ ...prev, lrv2Code: code }));
      return;
    }
    const useSecondEnd =
      item.diameterMm2 !== undefined && item.diameterMm !== elem1Diam && item.diameterMm2 === elem1Diam;
    const chosenDiam = useSecondEnd ? item.diameterMm2! : item.diameterMm;
    const chosenWall = useSecondEnd ? item.wallThickness2 ?? item.wallThickness : item.wallThickness;

    // Синхронизируем тип элемента и типоразмер по коду ЛРВ
    setElem2TypeFilter(resolveLrvItemCategory(item));
    setElem2SizeFilter(
      chosenDiam > 0 && chosenWall > 0 ? `${chosenDiam}x${chosenWall}` : 'all'
    );
    setElem2SearchQuery('');
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

  const handleClearElem1 = () => {
    setForm((prev) => clearElementFields(prev, 1));
    setElem1SearchQuery('');
    setElem1TypeFilter('Все типы');
    setElem1SizeFilter('all');
    setElem1AutoSelectedCode(null);
  };

  const handleClearElem2 = () => {
    setForm((prev) => clearElementFields(prev, 2));
    setElem2SearchQuery('');
    setElem2TypeFilter('Все типы');
    setElem2SizeFilter('all');
    setElem2AutoSelectedCode(null);
  };

  const tryAutoSelectElem1 = (
    itemsPool: LRVItem[],
    query: string,
    typeFilter: LrvElementCategory,
    sizeFilter: string
  ) => {
    // На заполненной карточке не перезаписываем существующий материал автоматически
    if (form.lrv1Code || form.elem1Name || elem1Diam > 0) {
      return;
    }
    const hasCriteria =
      typeFilter !== 'Все типы' || sizeFilter !== 'all' || query.trim().length > 0;
    if (!hasCriteria) {
      setElem1AutoSelectedCode(null);
      return;
    }
    const strictMatches = searchLrvCatalogItems(
      itemsPool,
      query,
      typeFilter,
      sizeFilter
    );
    const unique = findUniqueAutoSelectableLrv(strictMatches, form.lrv1Code);
    if (unique) {
      handleSelectLrv1(unique.lrvCode, true);
    } else if (strictMatches.length !== 1) {
      setElem1AutoSelectedCode(null);
    }
  };

  const tryAutoSelectElem2 = (
    itemsPool: LRVItem[],
    query: string,
    typeFilter: LrvElementCategory,
    sizeFilter: string
  ) => {
    // На заполненной карточке не перезаписываем существующий материал автоматически
    if (form.lrv2Code || form.elem2Name || elem2Diam > 0) {
      return;
    }
    const hasCriteria =
      typeFilter !== 'Все типы' || sizeFilter !== 'all' || query.trim().length > 0;
    if (!hasCriteria) {
      setElem2AutoSelectedCode(null);
      return;
    }
    const strictMatches = searchLrvCatalogItems(
      itemsPool,
      query,
      typeFilter,
      sizeFilter
    );
    const unique = findUniqueAutoSelectableLrv(strictMatches, form.lrv2Code);
    if (unique) {
      handleSelectLrv2(unique.lrvCode, true);
    } else if (strictMatches.length !== 1) {
      setElem2AutoSelectedCode(null);
    }
  };

  const handleElem1TypeFilterChange = (nextType: LrvElementCategory) => {
    setElem1TypeFilter(nextType);
    // Сохраняем текущий размер (подсветится красным при несоответствии) и не затираем заполненные данные
    const nextSizes = getAvailableSizesFromLrv(availableLrvItems, nextType);
    const effectiveSize =
      elem1SizeFilter !== 'all' && nextSizes.some((s) => s.key === elem1SizeFilter)
        ? elem1SizeFilter
        : 'all';
    tryAutoSelectElem1(availableLrvItems, elem1SearchQuery, nextType, effectiveSize);
  };

  const handleElem1SizeFilterChange = (nextSize: string) => {
    setElem1SizeFilter(nextSize);
    tryAutoSelectElem1(availableLrvItems, elem1SearchQuery, elem1TypeFilter, nextSize);
  };

  const handleElem1SearchQueryChange = (nextQuery: string) => {
    setElem1SearchQuery(nextQuery);
  };

  const handleElem2TypeFilterChange = (nextType: LrvElementCategory) => {
    setElem2TypeFilter(nextType);
    // Сохраняем текущий размер (подсветится красным при несоответствии) и не затираем заполненные данные
    const nextSizes = getAvailableSizesFromLrv(baseLrvOptionsForElem2, nextType);
    const effectiveSize =
      elem2SizeFilter !== 'all' && nextSizes.some((s) => s.key === elem2SizeFilter)
        ? elem2SizeFilter
        : 'all';
    tryAutoSelectElem2(baseLrvOptionsForElem2, elem2SearchQuery, nextType, effectiveSize);
  };

  const handleElem2SizeFilterChange = (nextSize: string) => {
    setElem2SizeFilter(nextSize);
    tryAutoSelectElem2(baseLrvOptionsForElem2, elem2SearchQuery, elem2TypeFilter, nextSize);
  };

  const handleElem2SearchQueryChange = (nextQuery: string) => {
    setElem2SearchQuery(nextQuery);
  };

  const handleToggleAllowCrossRdLrv = (nextVal: boolean) => {
    setAllowCrossRdLrv(nextVal);
    const nextAvailable = filterLrvCatalogByRd(lrvCatalog, form.rdCode, nextVal);
    tryAutoSelectElem1(nextAvailable, elem1SearchQuery, elem1TypeFilter, elem1SizeFilter);
    const nextBase2 =
      filterLrvBySameDiameter && elem1Diam
        ? (() => {
            const byDiam = filterLrvByDiameter(nextAvailable, elem1Diam);
            return byDiam.length > 0 ? byDiam : nextAvailable;
          })()
        : nextAvailable;
    tryAutoSelectElem2(nextBase2, elem2SearchQuery, elem2TypeFilter, elem2SizeFilter);
  };

  const handleToggleFilterLrvBySameDiameter = (nextVal: boolean) => {
    setFilterLrvBySameDiameter(nextVal);
    const nextBase2 =
      nextVal && elem1Diam
        ? (() => {
            const byDiam = filterLrvByDiameter(availableLrvItems, elem1Diam);
            return byDiam.length > 0 ? byDiam : availableLrvItems;
          })()
        : availableLrvItems;
    tryAutoSelectElem2(nextBase2, elem2SearchQuery, elem2TypeFilter, elem2SizeFilter);
  };

  const handleCopyElementsFromJoint = (donorJointId: string): WeldJoint | null => {
    const donor = copyableLineJoints.find((j) => j.id === donorJointId);
    if (!donor) return null;
    const nextJoint = copyBothElementsFromJoint(form, donor);
    setForm(nextJoint);
    const synced = resolveFiltersFromJoint(nextJoint);
    setElem1SearchQuery('');
    setElem1TypeFilter(synced.type1);
    setElem1SizeFilter(synced.size1);
    setElem2SearchQuery('');
    setElem2TypeFilter(synced.type2);
    setElem2SizeFilter(synced.size2);
    setElem1AutoSelectedCode(null);
    setElem2AutoSelectedCode(null);
    return donor;
  };

  const handleCopyElem1ToElem2 = () => {
    setElem2AutoSelectedCode(null);
    setElem2SearchQuery('');
    setElem2TypeFilter(elem1TypeFilter);
    setElem2SizeFilter(elem1SizeFilter);
    setForm((prev) => ({
      ...prev,
      lrv2Code: prev.lrv1Code,
      elem2Name: prev.elem1Name,
      elem2Material: prev.elem1Material,
      elem2Ntd: prev.elem1Ntd,
      elem2Manufacturer: prev.elem1Manufacturer,
      elem2DiameterMm: prev.elem1DiameterMm ?? prev.diameterMm,
      elem2WallThickness: prev.elem1WallThickness ?? prev.wallThickness,
      elem2FactoryNumber: prev.elem1FactoryNumber ? `${prev.elem1FactoryNumber}-К` : '',
      elem2Length: prev.elem1Length || '',
      elem2CertNumber: prev.elem1CertNumber || '',
      elem2HeatNumber: prev.elem1HeatNumber || '',
      elem2BatchNumber: prev.elem1BatchNumber || '',
    }));
  };

  const handleSwapElements = () => {
    setElem1AutoSelectedCode(null);
    setElem2AutoSelectedCode(null);
    setElem1SearchQuery('');
    setElem2SearchQuery('');
    const prevType1 = elem1TypeFilter;
    const prevSize1 = elem1SizeFilter;
    setElem1TypeFilter(elem2TypeFilter);
    setElem1SizeFilter(elem2SizeFilter);
    setElem2TypeFilter(prevType1);
    setElem2SizeFilter(prevSize1);
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

  const handleRdCodeChangeInCreate = (newRdCode: string) => {
    const rdEntry = currentFacility.rdCodes.find((r) => r.code === newRdCode);
    const linesForNewRd = projectLineList.filter(
      (l) => l.objectName === form.objectName && l.rdCode === newRdCode
    );
    const firstLine = linesForNewRd[0];
    const nextLineNumber = firstLine?.lineNumber || '';
    const newUid =
      newRdCode || nextLineNumber ? buildUniqueLineId(newRdCode, nextLineNumber) : '';

    setElem1SearchQuery('');
    setElem1TypeFilter('Все типы');
    setElem1SizeFilter('all');
    setElem2SearchQuery('');
    setElem2TypeFilter('Все типы');
    setElem2SizeFilter('all');
    setElem1AutoSelectedCode(null);
    setElem2AutoSelectedCode(null);

    setForm((prev) => ({
      ...prev,
      rdCode: newRdCode,
      lineNumber: nextLineNumber,
      contour: firstLine?.testContour || rdEntry?.contours[0] || '',
      uniqueLineId: newUid,
      diameterMm: 0,
      diameterInch: '',
      wallThickness: 0,
      lrv1Code: '',
      elem1Name: '',
      elem1Material: '',
      elem1Ntd: '',
      elem1Manufacturer: '',
      elem1DiameterMm: 0,
      elem1WallThickness: 0,
      elem1FactoryNumber: '',
      elem1Length: '',
      elem1CertNumber: '',
      elem1HeatNumber: '',
      elem1BatchNumber: '',
      lrv2Code: '',
      elem2Name: '',
      elem2Material: '',
      elem2Ntd: '',
      elem2Manufacturer: '',
      elem2DiameterMm: 0,
      elem2WallThickness: 0,
      elem2FactoryNumber: '',
      elem2Length: '',
      elem2CertNumber: '',
      elem2HeatNumber: '',
      elem2BatchNumber: '',
    }));
  };

  const persistCurrentJoint = async (): Promise<boolean> => {
    setValidationError('');

    const duplicateJointOnLineFound = allJoints.find(
      (j) =>
        j.uniqueLineId === form.uniqueLineId &&
        j.jointNumber.toLowerCase() === form.jointNumber.trim().toLowerCase() &&
        j.id !== form.id
    );

    if (duplicateJointOnLineFound) {
      setValidationError(
        `Стык с номером «${form.jointNumber}» уже зарегистрирован на линии ${form.uniqueLineId}. Дублирование номеров стыков на одной линии запрещено правилами нормативного учёта.`
      );
      return false;
    }

    const sanitized = sanitizeWeldJointRecord(form);
    const guardedJoint =
      mode === 'edit' && initialJoint
        ? enforceFieldLevelRbacOnJointSave(initialJoint, sanitized, currentUser)
        : sanitized;

    setIsSubmitting(true);
    try {
      const res = await onSave(guardedJoint, isSupplementaryMode, allowCrossRdLrv);
      if (res && !res.ok) {
        setValidationError(res.message || 'Ошибка сохранения данных');
        return false;
      }
      initialSnapshotRef.current = JSON.stringify(guardedJoint);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка сохранения данных';
      setValidationError(msg);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await persistCurrentJoint();
    if (ok) {
      onClose();
    }
  };

  const saveCurrentJointForNavigation = async (): Promise<boolean> => {
    if (!canSaveAnyField) return true;
    const currentSnapshot = JSON.stringify(form);
    const isDirty =
      initialSnapshotRef.current !== '' &&
      currentSnapshot !== initialSnapshotRef.current;
    if (!isDirty) return true;
    return persistCurrentJoint();
  };

  return {
    form,
    setForm,
    activeTab,
    setActiveTab,
    validationError,
    setValidationError,
    isSubmitting,
    isSupplementaryMode,
    setIsSupplementaryMode,
    allowCrossRdLrv,
    setAllowCrossRdLrv: handleToggleAllowCrossRdLrv,
    filterLrvBySameDiameter,
    setFilterLrvBySameDiameter: handleToggleFilterLrvBySameDiameter,
    confirmDeleteStep,
    setConfirmDeleteStep,
    elem1Diam,
    elem2Diam,
    currentFacility,
    currentRdObj,
    currentWeatherStationName,
    personalWelders,
    brigadeProfiles,
    availableLrvItems,
    baseLrvOptionsForElem2,
    elem1AvailableSizes,
    elem2AvailableSizes,
    filteredLrvOptionsElem1,
    filteredLrvOptionsElem2,
    elem1AutoSelectedCode,
    elem2AutoSelectedCode,
    selectedTechCard,
    diameterValidation,
    weldingTypeValidation,
    preheatValidation,
    comprehensiveValidation,
    lineJoints,
    copyableLineJoints,
    defaultDonorJointId,
    currentLineIndex,
    prevJoint,
    nextJoint,
    selectedLrv1Item,
    selectedLrv2Item,
    welder1Stamp,
    setWelder1Stamp,
    welder2Stamp,
    setWelder2Stamp,
    brigadeStamp,
    setBrigadeStamp,
    elem1SearchQuery,
    setElem1SearchQuery: handleElem1SearchQueryChange,
    elem1TypeFilter,
    setElem1TypeFilter: handleElem1TypeFilterChange,
    elem1SizeFilter,
    setElem1SizeFilter: handleElem1SizeFilterChange,
    elem2SearchQuery,
    setElem2SearchQuery: handleElem2SearchQueryChange,
    elem2TypeFilter,
    setElem2TypeFilter: handleElem2TypeFilterChange,
    elem2SizeFilter,
    setElem2SizeFilter: handleElem2SizeFilterChange,
    availableLinesForRd,
    existingNumbersInLine,
    duplicateJointOnLine,
    baseJointForSupp,
    recordEditCheck,
    recordDeleteCheck,
    effectiveRbac,
    canSaveAnyField,
    handleSelectLrv1,
    handleSelectLrv2,
    handleClearElem1,
    handleClearElem2,
    handleCopyElementsFromJoint,
    handleCopyElem1ToElem2,
    handleSwapElements,
    handleWelder1Change,
    handleWelder2Change,
    handleBrigadeStampChange,
    handleSelectTechCard,
    handleRdCodeChangeInCreate,
    handleSubmit,
    saveCurrentJointForNavigation,
    handleSafeClose,
    showDiscardConfirm,
    confirmDiscardAndClose,
    cancelDiscardClose,
  };
}
