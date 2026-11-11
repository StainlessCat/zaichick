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
  fetchAmbientTemperatureAuto,
  generatePeriodWeatherArchive,
  MAX_HISTORY_STEPS,
  performRedoStep,
  performUndoStep,
  pushHistorySnapshot,
  resolveFacilityDefaultLocation,
} from '../utils/weldingLogic';
import {
  normalizeTechCard,
  normalizeWelderProfile,
} from '../utils/entityNormalizers';
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
import { FacilityGeoOverride } from './useServerSync';
import type { LoginModalMode } from '../components/LoginModal';

export const STORAGE_KEYS = {
  TEMPLATES: 'zaychick_column_templates_v2',
  ACTIVE_TPL: 'zaychick_active_template_id_v2',
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
  facilityGeoOverrides: Record<string, FacilityGeoOverride>;
}

export function useAppState() {
  // Очищаем устаревший полный дамп БД и небезопасный токен в localStorage при переходе на PostgreSQL + HttpOnly Cookie
  useEffect(() => {
    try {
      localStorage.removeItem('zaychick_app_full_state_v1');
      localStorage.removeItem('zaychick_session_token');
    } catch {
      // ignore
    }
  }, []);

  // Авторизованный пользователь и пул учётных записей (загружается с сервера /api/auth/session)
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>(USER_ACCOUNTS);
  const [currentUser, setCurrentUser] = useState<UserAccount>(USER_ACCOUNTS[0]);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginModalInitialMode, setLoginModalInitialMode] =
    useState<LoginModalMode>('login');

  // Выбор объекта и раздела программы
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<AppSection>('registry');
  const [selectedObjectName, setSelectedObjectName] = useState<string>(FACILITY_OBJECTS[0].name);
  const [selectedRdCode, setSelectedRdCode] = useState<string>('ALL');

  // Основные коллекции системы (источник истины — PostgreSQL через FastAPI REST API)
  const [serverFacilities, setServerFacilities] = useState<FacilityObject[]>(FACILITY_OBJECTS);
  const [joints, setJoints] = useState<WeldJoint[]>(INITIAL_JOINTS);
  const [projectLineList, setProjectLineList] = useState<ProjectLineItem[]>(INITIAL_PROJECT_LINELIST);
  const [lrvCatalog, setLrvCatalog] = useState<LRVItem[]>(INITIAL_LRV_CATALOG);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(INITIAL_AUDIT_LOGS);

  // Справочники сварки
  const [welders, setWelders] = useState<WelderProfile[]>(() =>
    WELDERS_DIRECTORY.map((w) => normalizeWelderProfile(w))
  );
  const [techCards, setTechCards] = useState<TechCardItem[]>(() =>
    INITIAL_TECH_CARDS.map((tc) => normalizeTechCard(tc))
  );
  const [weldingMaterials, setWeldingMaterials] =
    useState<WeldingMaterialCertificate[]>(INITIAL_WELDING_MATERIALS);

  // Геокоординаты и метеопосты
  const [facilityGeoOverrides, setFacilityGeoOverrides] = useState<
    Record<string, FacilityGeoOverride>
  >({});
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

  // Производные списки объектов (из серверного списка facilities + лайнлиста)
  const derivedFacilities = useMemo(() => {
    const base = deriveFacilitiesFromLineList(
      projectLineList,
      serverFacilities.length > 0 ? serverFacilities : FACILITY_OBJECTS,
      true
    );
    const merged = base.map((fac) => {
      const over = facilityGeoOverrides[fac.name];
      if (!over) return fac;
      return {
        ...fac,
        region: over.region,
        weatherStation: over.weatherStation || fac.weatherStation,
        weatherStationId: over.weatherStationId || fac.weatherStationId,
        weatherStationDistanceKm: over.weatherStationDistanceKm ?? fac.weatherStationDistanceKm,
        weatherStationSource: over.weatherStationSource || fac.weatherStationSource,
        latitude: over.latitude,
        longitude: over.longitude,
        weatherArchive: over.weatherArchive || fac.weatherArchive,
        weatherObservations: over.weatherObservations || fac.weatherObservations,
        customWeatherStations: over.customWeatherStations || fac.customWeatherStations,
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
          weatherStation: over.weatherStation || 'Метеостанция не привязана',
          weatherStationId: over.weatherStationId,
          weatherStationDistanceKm: over.weatherStationDistanceKm,
          weatherStationSource: over.weatherStationSource,
          latitude: over.latitude,
          longitude: over.longitude,
          weatherArchive: over.weatherArchive,
          weatherObservations: over.weatherObservations,
          customWeatherStations: over.customWeatherStations,
          rdCodes: [],
        });
      }
    });

    return merged;
  }, [projectLineList, serverFacilities, facilityGeoOverrides]);

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

  // Сохранение шаблонов колонок (UI настройки)
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
      jointId = 'sys-dict',
      explicitOperationType?: AuditLogEntry['operationType']
    ) => {
      let resolvedOpType: AuditLogEntry['operationType'] =
        explicitOperationType || (actionType === 'Создание стыка' ? 'create_joint' : 'single_edit');

      if (!explicitOperationType) {
        if (actionType.toLowerCase().includes('аннулирование лрв')) {
          resolvedOpType = 'lrv_superseded';
        } else if (actionType.toLowerCase().includes('лайнлист') || fieldChanged.toLowerCase().includes('лайнлист')) {
          resolvedOpType = 'linelist_change';
        } else if (actionType.toLowerCase().includes('создание пользователя')) {
          resolvedOpType = 'user_created';
        } else if (actionType.toLowerCase().includes('удаление пользователя')) {
          resolvedOpType = 'user_deleted';
        } else if (actionType.toLowerCase().includes('пользовател') || fieldChanged.toLowerCase().includes('парол')) {
          resolvedOpType = 'user_modified';
        }
      }

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
        operationType: resolvedOpType,
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
        weatherStationId?: string;
        weatherStationDistanceKm?: number;
        weatherStationSource?: string;
        weatherLastCheckStatus?: string;
        weatherLastCheckedAt?: string;
        weatherLastErrorMessage?: string;
        latitude: number;
        longitude: number;
        weatherArchive?: Record<string, string>;
        weatherObservations?: Record<string, any>;
        customWeatherStations?: any[];
      }
    ) => {
      recordUndoSnapshot(`Смена метеопункта объекта ${facilityName}`);
      setFacilityGeoOverrides((prev) => ({
        ...prev,
        [facilityName]: {
          ...prev[facilityName],
          region: loc.region,
          weatherStation: loc.weatherStation,
          weatherStationId: loc.weatherStationId,
          weatherStationDistanceKm: loc.weatherStationDistanceKm,
          weatherStationSource: loc.weatherStationSource,
          weatherLastCheckStatus: loc.weatherLastCheckStatus,
          weatherLastCheckedAt: loc.weatherLastCheckedAt,
          weatherLastErrorMessage: loc.weatherLastErrorMessage,
          latitude: loc.latitude,
          longitude: loc.longitude,
          weatherArchive:
            loc.weatherArchive ?? prev[facilityName]?.weatherArchive,
          weatherObservations:
            loc.weatherObservations ?? prev[facilityName]?.weatherObservations,
          customWeatherStations:
            loc.customWeatherStations ?? prev[facilityName]?.customWeatherStations,
        },
      }));
      // ВАЖНОЕ ПРАВИЛО: Смена станции не должна молча менять уже записанные температуры стыков!
      // Массовое обновление выполняется строго по отдельной явной команде с подтверждением.
    },
    [recordUndoSnapshot]
  );

  const handleBulkUpdateJointsTemperaturesFromStation = useCallback(
    (facilityName: string, confirm = false): { updatedCount: number; message: string } => {
      if (!confirm) {
        return { updatedCount: 0, message: 'Требуется явное подтверждение пользователя' };
      }
      const fac = derivedFacilities.find((f) => f.name === facilityName);
      if (!fac || !fac.weatherArchive || Object.keys(fac.weatherArchive).length === 0) {
        return { updatedCount: 0, message: 'У объекта нет загруженного архива наблюдений метеостанции' };
      }
      const archive = fac.weatherArchive;
      let count = 0;
      recordUndoSnapshot(`Массовое обновление температур стыков объекта ${facilityName} по метеостанции`);
      setJoints((prev) =>
        prev.map((j) => {
          if (j.objectName !== facilityName) return j;
          if (j.weldingDate && archive[j.weldingDate] !== undefined && archive[j.weldingDate].trim() !== '') {
            count++;
            return {
              ...j,
              ambientTemp: archive[j.weldingDate],
              weatherSource: fac.weatherStation || 'Метеостанция объекта',
            };
          }
          return j;
        })
      );
      return {
        updatedCount: count,
        message: `Успешно обновлено ${count} стыков по фактическим наблюдениям станции`,
      };
    },
    [derivedFacilities, recordUndoSnapshot]
  );

  const handleCreateStandaloneObject = useCallback(
    (objectName: string) => {
      const clean = objectName.trim();
      if (!clean) return;
      recordUndoSnapshot(`Создание объекта строительства «${clean}»`);

      // Автоматическое сопоставление с реальным реестром метеостанций WMO/Росгидромета
      // КАТЕГОРИЧЕСКИЙ ЗАПРЕТ НА ФИКТИВНЫЕ «МЕТЕОПОСТЫ»
      const resolved = resolveFacilityDefaultLocation(clean);

      setFacilityGeoOverrides((prev) => ({
        ...prev,
        [clean]: {
          region: resolved.region,
          weatherStation: resolved.weatherStation,
          weatherStationId: resolved.weatherStationId,
          latitude: resolved.latitude,
          longitude: resolved.longitude,
          weatherArchive: {},
          weatherObservations: {},
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
    serverFacilities,
    setServerFacilities,
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
    handleBulkUpdateJointsTemperaturesFromStation,
    handleCreateStandaloneObject,
  };
}
