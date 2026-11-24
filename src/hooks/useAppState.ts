import { useEffect, useMemo, useState } from 'react';
import type {
  AppSection,
  AuditLogEntry,
  FacilityObject,
  LRVItem,
  ProjectLineItem,
  TechCardItem,
  TestCircuit,
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
import { normalizeCorporateJointNumber } from '../api/mappers';
import { buildSeedTestCircuitsFromJoints } from '../utils/testCircuitCalc';
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


const VALID_SECTIONS = new Set([
  'registry',
  'testing_circuits',
  'laboratory',
  'project_linelist',
  'welding_tech',
  'journals',
  'readiness',
  'lrv_catalog',
  'audit_log',
  'user_guide',
]);

const STORAGE_ACTIVE_SECTION = 'zaychick_active_section';
const STORAGE_SELECTED_OBJECT = 'zaychick_selected_object_name';
const STORAGE_SELECTED_RD = 'zaychick_selected_rd_code';

function getInitialActiveSection(): AppSection {
  try {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab') || params.get('section');
      if (tabParam && VALID_SECTIONS.has(tabParam)) {
        return tabParam as AppSection;
      }
      const saved = localStorage.getItem(STORAGE_ACTIVE_SECTION);
      if (saved && VALID_SECTIONS.has(saved)) {
        return saved as AppSection;
      }
    }
  } catch {
    // ignore
  }
  return 'registry';
}

function getInitialSelectedObjectName(): string {
  try {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const projParam = params.get('project') || params.get('object');
      if (projParam !== null && projParam !== undefined) {
        return projParam;
      }
      const saved = localStorage.getItem(STORAGE_SELECTED_OBJECT);
      if (saved !== null && saved !== undefined) {
        return saved;
      }
    }
  } catch {
    // ignore
  }
  return FACILITY_OBJECTS[0].name;
}

function getInitialSelectedRdCode(): string {
  try {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const rdParam = params.get('rd');
      if (rdParam !== null && rdParam !== undefined) {
        return rdParam;
      }
      const saved = localStorage.getItem(STORAGE_SELECTED_RD);
      if (saved !== null && saved !== undefined) {
        return saved;
      }
    }
  } catch {
    // ignore
  }
  return 'ALL';
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
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>([]);
  const [currentUser, setCurrentUser] = useState<UserAccount>(ANONYMOUS_USER);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginModalInitialMode, setLoginModalInitialMode] =
    useState<LoginModalMode>('login');

  // Выбор объекта и раздела программы
  const [activeSection, setActiveSection] = useState<AppSection>(getInitialActiveSection);
  const [selectedObjectName, setSelectedObjectName] = useState<string>(getInitialSelectedObjectName);
  const [selectedRdCode, setSelectedRdCode] = useState<string>(getInitialSelectedRdCode);

  // Основные коллекции системы (источник истины — PostgreSQL через FastAPI REST API)
  const [serverFacilities, setServerFacilities] =
    useState<FacilityObject[]>(FACILITY_OBJECTS);
  const [joints, setJoints] = useState<WeldJoint[]>(() =>
    INITIAL_JOINTS.map((j) => {
      const norm = normalizeCorporateJointNumber(
        j.jointNumber,
        j.uniqueLineId,
        j.isSupplementary
      );
      if (norm.jointNumber !== j.jointNumber || norm.isSupplementary !== j.isSupplementary) {
        return { ...j, jointNumber: norm.jointNumber, isSupplementary: norm.isSupplementary };
      }
      return j;
    })
  );
  const [projectLineList, setProjectLineList] =
    useState<ProjectLineItem[]>(INITIAL_PROJECT_LINELIST);
  const [lrvCatalog, setLrvCatalog] = useState<LRVItem[]>(INITIAL_LRV_CATALOG);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(INITIAL_AUDIT_LOGS);
  const [testCircuits, setTestCircuits] = useState<TestCircuit[]>(() => {
    const facMap: Record<string, string> = {};
    for (const f of FACILITY_OBJECTS) {
      facMap[f.name] = f.id;
    }
    return buildSeedTestCircuitsFromJoints(INITIAL_JOINTS, INITIAL_PROJECT_LINELIST, facMap);
  });

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

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ACTIVE_SECTION, activeSection);
      localStorage.setItem(STORAGE_SELECTED_OBJECT, selectedObjectName);
      localStorage.setItem(STORAGE_SELECTED_RD, selectedRdCode);

      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        let changed = false;
        if (params.get('tab') !== activeSection) {
          params.set('tab', activeSection);
          params.delete('section');
          changed = true;
        }
        if (params.get('project') !== selectedObjectName) {
          params.set('project', selectedObjectName);
          params.delete('object');
          changed = true;
        }
        if (selectedRdCode && selectedRdCode !== 'ALL') {
          if (params.get('rd') !== selectedRdCode) {
            params.set('rd', selectedRdCode);
            changed = true;
          }
        } else if (params.has('rd')) {
          params.delete('rd');
          changed = true;
        }
        if (changed) {
          const newSearch = params.toString();
          const newUrl = `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}${window.location.hash}`;
          window.history.replaceState(null, '', newUrl);
        }
      }
    } catch {
      // ignore
    }
  }, [activeSection, selectedObjectName, selectedRdCode]);

  useEffect(() => {
    const handlePopState = () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const tab = params.get('tab') || params.get('section');
        if (tab && VALID_SECTIONS.has(tab)) {
          setActiveSection(tab as AppSection);
        }
        const proj = params.get('project') || params.get('object');
        if (proj !== null) {
          setSelectedObjectName(proj);
        }
        const rd = params.get('rd');
        if (rd !== null) {
          setSelectedRdCode(rd);
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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
    testCircuits,
    setTestCircuits,
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
