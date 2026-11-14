import { useEffect, useMemo, useState } from 'react';
import type {
  AppSection,
  AuditLogEntry,
  FacilityObject,
  LRVItem,
  ProjectLineItem,
  TechCardItem,
  UserAccount,
  WelderProfile,
  WeldingMaterialCertificate,
  WeldJoint,
} from '../types/welding';
import { ANONYMOUS_USER } from '../types/welding';
import {
  normalizeTechCard,
  normalizeWelderProfile,
} from '../utils/entityNormalizers';
import {
  FACILITY_OBJECTS,
  INITIAL_AUDIT_LOGS,
  INITIAL_JOINTS,
  INITIAL_LRV_CATALOG,
  INITIAL_PROJECT_LINELIST,
  INITIAL_TECH_CARDS,
  INITIAL_WELDING_MATERIALS,
  INSPECTORS_DIRECTORY,
  WELDERS_DIRECTORY,
} from '../data/seedData';
import { mergeDynamicInspectors } from '../utils/rbac';
import type { LoginModalMode } from '../components/LoginModal';
import {
  AppDataSnapshot,
  EMPTY_FACILITY_FALLBACK,
  STORAGE_KEYS,
  useColumnsLayoutState,
  useFacilityWeatherState,
  useUndoRedoState,
} from './appState';

export { STORAGE_KEYS, EMPTY_FACILITY_FALLBACK };
export type { AppDataSnapshot };

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
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>([]);
  const [currentUser, setCurrentUser] = useState<UserAccount>(ANONYMOUS_USER);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginModalInitialMode, setLoginModalInitialMode] =
    useState<LoginModalMode>('login');

  // Выбор объекта и раздела программы
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<AppSection>('registry');
  const [selectedObjectName, setSelectedObjectName] = useState<string>(
    FACILITY_OBJECTS[0].name
  );
  const [selectedRdCode, setSelectedRdCode] = useState<string>('ALL');

  // Основные коллекции системы (источник истины — PostgreSQL через FastAPI REST API)
  const [serverFacilities, setServerFacilities] =
    useState<FacilityObject[]>(FACILITY_OBJECTS);
  const [joints, setJoints] = useState<WeldJoint[]>(INITIAL_JOINTS);
  const [projectLineList, setProjectLineList] =
    useState<ProjectLineItem[]>(INITIAL_PROJECT_LINELIST);
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

  // 1. Декомпозированный хук шаблонов колонок и их ширин
  const columnsLayout = useColumnsLayoutState();

  // Временная заглушка референса на геооверрайды для undoRedo
  const [facilityGeoOverrides, setFacilityGeoOverrides] = useState<
    Record<string, import('./useServerSync').FacilityGeoOverride>
  >({});

  // 2. Декомпозированный хук истории изменений (Undo / Redo / Audit)
  const undoRedo = useUndoRedoState({
    currentUser,
    selectedRdCode,
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
  });

  // 3. Декомпозированный хук геопозиций объектов и метеостанций
  const facilityWeather = useFacilityWeatherState({
    projectLineList,
    serverFacilities,
    selectedObjectName,
    setSelectedObjectName,
    setSelectedRdCode,
    setJoints,
    recordUndoSnapshot: undoRedo.recordUndoSnapshot,
  });

  // Синхронизируем состояние geoOverrides между хуками
  useEffect(() => {
    setFacilityGeoOverrides(facilityWeather.facilityGeoOverrides);
  }, [facilityWeather.facilityGeoOverrides]);

  const dynamicInspectors = useMemo(
    () => mergeDynamicInspectors(INSPECTORS_DIRECTORY, userAccounts),
    [userAccounts]
  );

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
    facilityGeoOverrides: facilityWeather.facilityGeoOverrides,
    setFacilityGeoOverrides: facilityWeather.setFacilityGeoOverrides,
    locationModalFacilityName: facilityWeather.locationModalFacilityName,
    setLocationModalFacilityName: facilityWeather.setLocationModalFacilityName,
    undoStack: undoRedo.undoStack,
    setUndoStack: undoRedo.setUndoStack,
    redoStack: undoRedo.redoStack,
    setRedoStack: undoRedo.setRedoStack,
    recordUndoSnapshot: undoRedo.recordUndoSnapshot,
    handleUndo: undoRedo.handleUndo,
    handleRedo: undoRedo.handleRedo,
    appendSystemAuditEntry: undoRedo.appendSystemAuditEntry,
    templates: columnsLayout.templates,
    setTemplates: columnsLayout.setTemplates,
    activeTemplateId: columnsLayout.activeTemplateId,
    setActiveTemplateId: columnsLayout.setActiveTemplateId,
    columnOrder: columnsLayout.columnOrder,
    setColumnOrder: columnsLayout.setColumnOrder,
    visibleColumns: columnsLayout.visibleColumns,
    setVisibleColumns: columnsLayout.setVisibleColumns,
    isColumnsModalOpen: columnsLayout.isColumnsModalOpen,
    setIsColumnsModalOpen: columnsLayout.setIsColumnsModalOpen,
    columnWidths: columnsLayout.columnWidths,
    setColumnWidths: columnsLayout.setColumnWidths,
    handleResetColumnWidths: columnsLayout.handleResetColumnWidths,
    handleColumnAutoFit: columnsLayout.handleColumnAutoFit,
    handleColumnResizeStart: columnsLayout.handleColumnResizeStart,
    siteWeather: facilityWeather.siteWeather,
    refreshSiteWeather: facilityWeather.refreshSiteWeather,
    derivedFacilities: facilityWeather.derivedFacilities,
    dynamicInspectors,
    currentFacility: facilityWeather.currentFacility,
    activeLocationFacility: facilityWeather.activeLocationFacility,
    activeColumnDefs: columnsLayout.activeColumnDefs,
    handleSaveFacilityLocation: facilityWeather.handleSaveFacilityLocation,
    handleBulkUpdateJointsTemperaturesFromStation:
      facilityWeather.handleBulkUpdateJointsTemperaturesFromStation,
    handleCreateStandaloneObject: facilityWeather.handleCreateStandaloneObject,
  };
}
