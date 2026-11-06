import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppSection,
  AuditLogEntry,
  ColumnDefinition,
  ColumnTemplate,
  FacilityObject,
  LRVItem,
  ProjectLineItem,
  TechCardItem,
  UserAccount,
  WelderProfile,
  WeldingMaterialCertificate,
  WeldJoint,
  WeldJointFieldKey,
} from '../types/welding';
import {
  ALL_COLUMNS,
  DEFAULT_COLUMN_KEYS,
  deriveFacilitiesFromLineList,
  estimateAmbientTempByCoordsAndDate,
  fetchAmbientTemperatureAuto,
  generatePeriodWeatherArchive,
  MAX_HISTORY_STEPS,
  performRedoStep,
  performUndoStep,
  pushHistorySnapshot,
} from '../utils/weldingLogic';
import {
  FACILITY_OBJECTS,
  INITIAL_AUDIT_LOGS,
  INITIAL_COLUMN_TEMPLATES,
  INITIAL_JOINTS,
  INITIAL_LRV_CATALOG,
  INITIAL_PROJECT_LINELIST,
  INITIAL_TECH_CARDS,
  INITIAL_WELDING_MATERIALS,
  INSPECTORS_DIRECTORY,
  USER_ACCOUNTS,
  WELDERS_DIRECTORY,
} from '../data/seedData';
import { mergeDynamicInspectors } from '../utils/rbac';
import type { FullSystemBackupPayload } from '../components/BackupAndResetModal';
import type { LoginModalMode } from '../components/LoginModal';

export const STORAGE_KEYS = {
  TEMPLATES: 'zaychick_column_templates_v2',
  ACTIVE_TPL: 'zaychick_active_template_id_v2',
  FULL_STATE: 'zaychick_app_full_state_v1',
};

export const EMPTY_FACILITY_FALLBACK: FacilityObject = {
  id: 'fac-empty-default',
  name: 'Новый объект',
  shortName: 'Новый объект',
  region: 'ЯНАО',
  weatherStation: 'Метеостанция объекта',
  latitude: 66.53,
  longitude: 66.6,
  rdCodes: [
    {
      code: 'НОВЫЙ-ШИФР-РД',
      title: 'Рабочая документация',
      contours: ['Основной контур'],
    },
  ],
};

export interface AppDataSnapshot {
  actionLabel: string;
  joints: WeldJoint[];
  projectLineList: ProjectLineItem[];
  lrvCatalog: LRVItem[];
  auditLogs: AuditLogEntry[];
  welders: WelderProfile[];
  techCards: TechCardItem[];
  weldingMaterials: WeldingMaterialCertificate[];
  facilityGeoOverrides: Record<
    string,
    {
      region: string;
      weatherStation: string;
      latitude: number;
      longitude: number;
      weatherArchive?: Record<string, string>;
    }
  >;
}

export type PersistedAppState = FullSystemBackupPayload['data'] & {
  selectedObjectName?: string;
  selectedRdCode?: string;
};

export function loadSavedFullState(): Partial<PersistedAppState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.FULL_STATE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    // ignore storage read errors
  }
  return null;
}

export function useAppState() {
  const initialSavedState = useMemo(() => loadSavedFullState(), []);

  // Авторизованный пользователь и пул учётных записей
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>(() =>
    Array.isArray(initialSavedState?.userAccounts) &&
    initialSavedState.userAccounts.length > 0
      ? initialSavedState.userAccounts
      : USER_ACCOUNTS
  );
  const [currentUser, setCurrentUser] = useState<UserAccount>(() =>
    Array.isArray(initialSavedState?.userAccounts) &&
    initialSavedState.userAccounts.length > 0
      ? initialSavedState.userAccounts[0]
      : USER_ACCOUNTS[0]
  );
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem('zaychick_session_token');
    } catch {
      return null;
    }
  });
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginModalInitialMode, setLoginModalInitialMode] =
    useState<LoginModalMode>('login');

  // Выбор объекта и раздела программы
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<AppSection>('registry');
  const [selectedObjectName, setSelectedObjectName] = useState<string>(() =>
    typeof initialSavedState?.selectedObjectName === 'string'
      ? initialSavedState.selectedObjectName
      : FACILITY_OBJECTS[0].name
  );
  const [selectedRdCode, setSelectedRdCode] = useState<string>(() =>
    typeof initialSavedState?.selectedRdCode === 'string'
      ? initialSavedState.selectedRdCode
      : 'ALL'
  );

  // Основные коллекции системы
  const [joints, setJoints] = useState<WeldJoint[]>(() =>
    Array.isArray(initialSavedState?.joints)
      ? initialSavedState.joints
      : INITIAL_JOINTS
  );
  const [projectLineList, setProjectLineList] = useState<ProjectLineItem[]>(() =>
    Array.isArray(initialSavedState?.projectLineList)
      ? initialSavedState.projectLineList
      : INITIAL_PROJECT_LINELIST
  );
  const [lrvCatalog, setLrvCatalog] = useState<LRVItem[]>(() =>
    Array.isArray(initialSavedState?.lrvCatalog)
      ? initialSavedState.lrvCatalog
      : INITIAL_LRV_CATALOG
  );
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() =>
    Array.isArray(initialSavedState?.auditLogs)
      ? initialSavedState.auditLogs
      : INITIAL_AUDIT_LOGS
  );

  // Справочники сварки
  const [welders, setWelders] = useState<WelderProfile[]>(() =>
    Array.isArray(initialSavedState?.welders)
      ? initialSavedState.welders
      : WELDERS_DIRECTORY
  );
  const [techCards, setTechCards] = useState<TechCardItem[]>(() =>
    Array.isArray(initialSavedState?.techCards)
      ? initialSavedState.techCards
      : INITIAL_TECH_CARDS
  );
  const [weldingMaterials, setWeldingMaterials] = useState<
    WeldingMaterialCertificate[]
  >(() =>
    Array.isArray(initialSavedState?.weldingMaterials)
      ? initialSavedState.weldingMaterials
      : INITIAL_WELDING_MATERIALS
  );

  // Геокоординаты и метеопосты
  const [facilityGeoOverrides, setFacilityGeoOverrides] = useState<
    Record<
      string,
      {
        region: string;
        weatherStation: string;
        latitude: number;
        longitude: number;
        weatherArchive?: Record<string, string>;
      }
    >
  >(() =>
    initialSavedState?.facilityGeoOverrides &&
    typeof initialSavedState.facilityGeoOverrides === 'object'
      ? initialSavedState.facilityGeoOverrides
      : {}
  );
  const [locationModalFacilityName, setLocationModalFacilityName] = useState<
    string | null
  >(null);

  // Стек отмены/повтора (Undo / Redo)
  const [undoStack, setUndoStack] = useState<AppDataSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<AppDataSnapshot[]>([]);

  // Шаблоны столбцов
  const [templates, setTemplates] = useState<ColumnTemplate[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.TEMPLATES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return INITIAL_COLUMN_TEMPLATES;
  });

  const [activeTemplateId, setActiveTemplateId] = useState<string>('tpl-full-30');
  const [columnOrder, setColumnOrder] = useState<WeldJointFieldKey[]>([
    ...DEFAULT_COLUMN_KEYS,
  ]);
  const [visibleColumns, setVisibleColumns] = useState<WeldJointFieldKey[]>([
    ...DEFAULT_COLUMN_KEYS,
  ]);
  const [isColumnsModalOpen, setIsColumnsModalOpen] = useState(false);

  // Пользовательские ширины столбцов
  const [columnWidths, setColumnWidths] = useState<
    Partial<Record<WeldJointFieldKey, number>>
  >(() => {
    try {
      const raw = localStorage.getItem('zaychick_column_widths_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {
      // ignore
    }
    return {};
  });

  const resizingRef = useRef<{
    colKey: WeldJointFieldKey;
    startX: number;
    startWidth: number;
  } | null>(null);

  const [activeResizingKey, setActiveResizingKey] =
    useState<WeldJointFieldKey | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('zaychick_column_widths_v1', JSON.stringify(columnWidths));
    } catch {
      // ignore
    }
  }, [columnWidths]);

  const handleResetColumnWidths = useCallback(() => {
    setColumnWidths({});
    try {
      localStorage.removeItem('zaychick_column_widths_v1');
    } catch {
      // ignore
    }
  }, []);

  const handleColumnAutoFit = useCallback((colKey: WeldJointFieldKey) => {
    const colDef = ALL_COLUMNS.find((c) => c.key === colKey);
    if (!colDef) return;
    const label = colDef.shortLabel || colDef.label;
    const estimatedWidth = Math.max(
      colDef.minWidth,
      Math.min(450, label.length * 10 + 65)
    );
    setColumnWidths((prev) => ({
      ...prev,
      [colKey]: estimatedWidth,
    }));
  }, []);

  const handleColumnResizeStart = useCallback(
    (e: React.PointerEvent, colKey: WeldJointFieldKey, currentWidth: number) => {
      e.preventDefault();
      e.stopPropagation();
      resizingRef.current = {
        colKey,
        startX: e.clientX,
        startWidth: currentWidth,
      };
      setActiveResizingKey(colKey);
    },
    []
  );

  useEffect(() => {
    if (!activeResizingKey) return;

    const onPointerMove = (e: PointerEvent) => {
      if (!resizingRef.current) return;
      const { colKey, startX, startWidth } = resizingRef.current;
      const deltaX = e.clientX - startX;
      const colDef = ALL_COLUMNS.find((c) => c.key === colKey);
      const minW = Math.max(65, colDef?.minWidth ? Math.min(colDef.minWidth, 80) : 65);
      const newWidth = Math.max(minW, Math.round(startWidth + deltaX));
      setColumnWidths((prev) => ({
        ...prev,
        [colKey]: newWidth,
      }));
    };

    const onPointerUp = () => {
      resizingRef.current = null;
      setActiveResizingKey(null);
      document.body.style.removeProperty('user-select');
      document.body.style.removeProperty('cursor');
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      document.body.style.removeProperty('user-select');
      document.body.style.removeProperty('cursor');
    };
  }, [activeResizingKey]);

  // Метеосводка объекта
  const [siteWeather, setSiteWeather] = useState<{
    tempC: string;
    source: string;
    loading: boolean;
  }>({
    tempC: '-6',
    source: 'Метеопост УКПГ-2В (70.37°N, 68.43°E)',
    loading: false,
  });

  // Производные списки объектов
  const derivedFacilities = useMemo(() => {
    const base = deriveFacilitiesFromLineList(
      projectLineList,
      FACILITY_OBJECTS,
      true
    );
    const merged = base.map((fac) => {
      const over = facilityGeoOverrides[fac.name];
      if (!over) return fac;
      return {
        ...fac,
        region: over.region,
        weatherStation: over.weatherStation || fac.weatherStation,
        latitude: over.latitude,
        longitude: over.longitude,
        weatherArchive: over.weatherArchive || fac.weatherArchive,
      };
    });

    const existingNames = new Set(merged.map((f) => f.name));
    Object.entries(facilityGeoOverrides).forEach(([objName, over], idx) => {
      if (!existingNames.has(objName)) {
        merged.push({
          id: `fac-standalone-${idx}-${objName}`,
          name: objName,
          shortName: objName,
          region: over.region || 'Не указан',
          weatherStation: over.weatherStation || `Метеопост ${objName}`,
          latitude: over.latitude,
          longitude: over.longitude,
          weatherArchive: over.weatherArchive,
          rdCodes: [],
        });
      }
    });

    return merged;
  }, [projectLineList, facilityGeoOverrides]);

  const dynamicInspectors = useMemo(
    () => mergeDynamicInspectors(INSPECTORS_DIRECTORY, userAccounts),
    [userAccounts]
  );

  const currentFacility = useMemo(
    () =>
      derivedFacilities.find((f) => f.name === selectedObjectName) ||
      derivedFacilities[0] ||
      EMPTY_FACILITY_FALLBACK,
    [derivedFacilities, selectedObjectName]
  );

  // Автосохранение полного состояния в localStorage
  useEffect(() => {
    try {
      const stateToPersist: Partial<PersistedAppState> = {
        joints,
        projectLineList,
        lrvCatalog,
        auditLogs,
        welders,
        techCards,
        weldingMaterials,
        userAccounts,
        facilityGeoOverrides,
        selectedObjectName,
        selectedRdCode,
      };
      localStorage.setItem(
        STORAGE_KEYS.FULL_STATE,
        JSON.stringify(stateToPersist)
      );
    } catch {
      // ignore quota
    }
  }, [
    joints,
    projectLineList,
    lrvCatalog,
    auditLogs,
    welders,
    techCards,
    weldingMaterials,
    userAccounts,
    facilityGeoOverrides,
    selectedObjectName,
    selectedRdCode,
  ]);

  // Сохранение шаблонов колонок
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(templates));
    } catch {
      // ignore
    }
  }, [templates]);

  const refreshSiteWeather = useCallback(async () => {
    setSiteWeather((prev) => ({ ...prev, loading: true }));
    const res = await fetchAmbientTemperatureAuto(
      currentFacility.latitude,
      currentFacility.longitude
    );
    setSiteWeather({
      tempC: res.tempC,
      source: res.source,
      loading: false,
    });
  }, [currentFacility.latitude, currentFacility.longitude]);

  useEffect(() => {
    refreshSiteWeather();
  }, [refreshSiteWeather, currentFacility.id]);

  const appendSystemAuditEntry = useCallback(
    (
      actionType: string,
      uniqueLineId: string,
      jointNumber: string,
      fieldChanged: string,
      oldValue: string,
      newValue: string,
      jointId = 'sys-dict'
    ) => {
      const entry: AuditLogEntry = {
        id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        userLogin: currentUser.login,
        userFullName: currentUser.fullName,
        userRole: currentUser.role,
        jointId,
        jointNumber,
        uniqueLineId,
        rdCode: selectedRdCode === 'ALL' ? 'СИСТЕМА' : selectedRdCode,
        fieldKey: 'system',
        fieldLabel: fieldChanged,
        oldValue,
        newValue,
        operationType:
          actionType === 'Создание стыка' ? 'create_joint' : 'single_edit',
      };
      setAuditLogs((prev) => [entry, ...prev]);
    },
    [currentUser.login, currentUser.fullName, currentUser.role, selectedRdCode]
  );

  const buildCurrentSnapshot = useCallback(
    (actionLabel: string): AppDataSnapshot => ({
      actionLabel,
      joints,
      projectLineList,
      lrvCatalog,
      auditLogs,
      welders,
      techCards,
      weldingMaterials,
      facilityGeoOverrides,
    }),
    [
      joints,
      projectLineList,
      lrvCatalog,
      auditLogs,
      welders,
      techCards,
      weldingMaterials,
      facilityGeoOverrides,
    ]
  );

  const recordUndoSnapshot = useCallback(
    (actionLabel: string) => {
      const snap = buildCurrentSnapshot(actionLabel);
      setUndoStack((prev) => pushHistorySnapshot(prev, snap, MAX_HISTORY_STEPS).undoStack);
      setRedoStack([]);
    },
    [buildCurrentSnapshot]
  );

  const applySnapshotState = useCallback((snap: AppDataSnapshot) => {
    setJoints(snap.joints);
    setProjectLineList(snap.projectLineList);
    setLrvCatalog(snap.lrvCatalog);
    setWelders(snap.welders);
    setTechCards(snap.techCards);
    setWeldingMaterials(snap.weldingMaterials);
    setFacilityGeoOverrides(snap.facilityGeoOverrides);
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const lastAction = undoStack[undoStack.length - 1]?.actionLabel || 'действие';
    const currentSnap = buildCurrentSnapshot(lastAction);
    const res = performUndoStep(undoStack, redoStack, currentSnap, MAX_HISTORY_STEPS);
    if (res.targetState) {
      setUndoStack(res.undoStack);
      setRedoStack(res.redoStack);
      applySnapshotState(res.targetState);
      appendSystemAuditEntry(
        'Редактирование',
        'СИСТЕМА (UNDO)',
        '—',
        'Отмена действия (Undo)',
        lastAction,
        'Состояние восстановлено'
      );
    }
  }, [undoStack, redoStack, buildCurrentSnapshot, applySnapshotState, appendSystemAuditEntry]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const nextAction = redoStack[redoStack.length - 1]?.actionLabel || 'действие';
    const currentSnap = buildCurrentSnapshot(nextAction);
    const res = performRedoStep(undoStack, redoStack, currentSnap, MAX_HISTORY_STEPS);
    if (res.targetState) {
      setUndoStack(res.undoStack);
      setRedoStack(res.redoStack);
      applySnapshotState(res.targetState);
      appendSystemAuditEntry(
        'Редактирование',
        'СИСТЕМА (REDO)',
        '—',
        'Повтор действия (Redo)',
        'Отменённое состояние',
        nextAction
      );
    }
  }, [undoStack, redoStack, buildCurrentSnapshot, applySnapshotState, appendSystemAuditEntry]);

  const activeColumnDefs: ColumnDefinition[] = useMemo(() => {
    const visSet = new Set(visibleColumns);
    return columnOrder
      .filter((k) => visSet.has(k))
      .map((k) => ALL_COLUMNS.find((c) => c.key === k))
      .filter((c): c is ColumnDefinition => Boolean(c));
  }, [columnOrder, visibleColumns]);

  const handleSaveFacilityLocation = useCallback(
    (
      facilityName: string,
      loc: {
        region: string;
        weatherStation: string;
        latitude: number;
        longitude: number;
        weatherArchive?: Record<string, string>;
      }
    ) => {
      recordUndoSnapshot(`Смена метеопункта объекта ${facilityName}`);
      setFacilityGeoOverrides((prev) => ({
        ...prev,
        [facilityName]: {
          region: loc.region,
          weatherStation: loc.weatherStation,
          latitude: loc.latitude,
          longitude: loc.longitude,
          weatherArchive:
            loc.weatherArchive ?? prev[facilityName]?.weatherArchive,
        },
      }));

      setJoints((prev) =>
        prev.map((j) => {
          if (j.objectName !== facilityName) return j;
          if (loc.weatherArchive && loc.weatherArchive[j.weldingDate]) {
            return { ...j, ambientTemp: loc.weatherArchive[j.weldingDate] };
          }
          const est = estimateAmbientTempByCoordsAndDate(
            loc.latitude,
            loc.longitude,
            j.weldingDate
          );
          const formatted = est > 0 ? `+${est}` : `${est}`;
          return { ...j, ambientTemp: formatted };
        })
      );
    },
    [recordUndoSnapshot]
  );

  const handleCreateStandaloneObject = useCallback(
    (objectName: string) => {
      const clean = objectName.trim();
      if (!clean) return;
      recordUndoSnapshot(`Создание объекта строительства «${clean}»`);
      const isVolkhov = clean.toLowerCase().includes('волхов');
      const lat = isVolkhov ? 59.93 : 66.53;
      const lon = isVolkhov ? 32.34 : 66.6;
      const region = isVolkhov ? 'Ленинградская область, г. Волхов' : 'ЯНАО';
      const station = isVolkhov
        ? 'Метеостанция г. Волхов (№26078)'
        : `Метеопост ${clean}`;
      const weatherArchive = isVolkhov
        ? generatePeriodWeatherArchive(lat, lon, '2026-04-01', '2026-09-30')
        : undefined;

      setFacilityGeoOverrides((prev) => ({
        ...prev,
        [clean]: {
          region,
          weatherStation: station,
          latitude: lat,
          longitude: lon,
          weatherArchive,
        },
      }));
      setSelectedObjectName(clean);
      setSelectedRdCode('ALL');
    },
    [recordUndoSnapshot]
  );

  const activeLocationFacility: FacilityObject | null = useMemo(() => {
    if (!locationModalFacilityName) return null;
    return (
      derivedFacilities.find((f) => f.name === locationModalFacilityName) ||
      currentFacility ||
      null
    );
  }, [locationModalFacilityName, derivedFacilities, currentFacility]);

  return {
    userAccounts,
    setUserAccounts,
    currentUser,
    setCurrentUser,
    sessionToken,
    setSessionToken,
    isLoginModalOpen,
    setIsLoginModalOpen,
    loginModalInitialMode,
    setLoginModalInitialMode,
    isDrawerOpen,
    setIsDrawerOpen,
    activeSection,
    setActiveSection,
    selectedObjectName,
    setSelectedObjectName,
    selectedRdCode,
    setSelectedRdCode,
    joints,
    setJoints,
    projectLineList,
    setProjectLineList,
    lrvCatalog,
    setLrvCatalog,
    auditLogs,
    setAuditLogs,
    welders,
    setWelders,
    techCards,
    setTechCards,
    weldingMaterials,
    setWeldingMaterials,
    facilityGeoOverrides,
    setFacilityGeoOverrides,
    locationModalFacilityName,
    setLocationModalFacilityName,
    undoStack,
    setUndoStack,
    redoStack,
    setRedoStack,
    recordUndoSnapshot,
    handleUndo,
    handleRedo,
    appendSystemAuditEntry,
    templates,
    setTemplates,
    activeTemplateId,
    setActiveTemplateId,
    columnOrder,
    setColumnOrder,
    visibleColumns,
    setVisibleColumns,
    isColumnsModalOpen,
    setIsColumnsModalOpen,
    columnWidths,
    setColumnWidths,
    handleResetColumnWidths,
    handleColumnAutoFit,
    handleColumnResizeStart,
    siteWeather,
    refreshSiteWeather,
    derivedFacilities,
    dynamicInspectors,
    currentFacility,
    activeLocationFacility,
    activeColumnDefs,
    handleSaveFacilityLocation,
    handleCreateStandaloneObject,
  };
}
