/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  ClipboardList,
  Database,
  FolderKanban,
  HardDriveDownload,
  History,
  Wrench,
} from 'lucide-react';
import {
  AppSection,
  AuditLogEntry,
  ColumnTemplate,
  ReadinessGroupCondition,
  UserAccount,
  WeldJoint,
  WeldJointFieldKey,
} from './types/welding';
import {
  ALL_COLUMNS,
  formatDateDDMMYY,
  getJointEquivDiaInch,
  isDateColumnKey,
  isWeldingDateInRange,
} from './utils/weldingLogic';
import { getUserRolePermissions } from './utils/rbac';
import {
  FACILITY_LOCATION_PRESETS,
  FACILITY_OBJECTS,
  INITIAL_AUDIT_LOGS,
  INITIAL_COLUMN_TEMPLATES,
  INITIAL_JOINTS,
  INITIAL_LRV_CATALOG,
  INITIAL_PROJECT_LINELIST,
  INITIAL_TECH_CARDS,
  INITIAL_WELDING_MATERIALS,
  USER_ACCOUNTS,
  WELDERS_DIRECTORY,
} from './data/seedData';
import { zaychickApi } from './api';
import { exportAllJointsToFile } from './utils/excelUtils';
import { AppHeader } from './components/layout/AppHeader';
import { HamburgerDrawer } from './components/HamburgerDrawer';
import { JointsRegistryView } from './components/JointsRegistryView';
import { ColumnTemplatesModal } from './components/ColumnTemplatesModal';
import { BulkEditModal } from './components/BulkEditModal';
import { JointPassportModal } from './components/JointPassportModal';
import { WeldingJournalsView } from './components/WeldingJournalsView';
import { ReadinessReportView } from './components/ReadinessReportView';
import { LrvCatalogView } from './components/LrvCatalogView';
import { AuditHistoryView } from './components/AuditHistoryView';
import { LoginModal } from './components/LoginModal';
import { ProjectLineListView } from './components/ProjectLineListView';
import { WeldingTechView } from './components/WeldingTechView';
import { FacilityLocationModal } from './components/FacilityLocationModal';
import { ImportJointsExcelModal } from './components/ImportJointsExcelModal';
import { UserGuideBookletView } from './components/UserGuideBookletView';
import {
  BackupAndResetModal,
  FullSystemBackupPayload,
} from './components/BackupAndResetModal';
import { OptimisticConflictModal } from './components/OptimisticConflictModal';
import { ServerDbStatusModal } from './components/ServerDbStatusModal';
import {
  EMPTY_FACILITY_FALLBACK,
  useAppState,
  useDirectoryActions,
  useJointActions,
  useServerSync,
} from './hooks';

export default function App() {
  const appState = useAppState();
  const {
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
    derivedFacilities,
    dynamicInspectors,
    currentFacility,
    activeLocationFacility,
    activeColumnDefs,
    handleSaveFacilityLocation: handleSaveFacilityLocationLocal,
    handleBulkUpdateJointsTemperaturesFromStation,
    handleCreateStandaloneObject: handleCreateStandaloneObjectLocal,
  } = appState;

  const {
    serverDbMeta,
    bumpRevisionMeta,
    isDbConnected,
    setIsDbConnected,
    isDbSyncing,
    setIsDbSyncing,
    isAuthenticated,
    setIsAuthenticated,
    pendingSyncCount,
    setPendingSyncCount,
    lastSyncError,
    setLastSyncError,
    triggerImmediateSync,
    isServerDbModalOpen,
    setIsServerDbModalOpen,
    activeConflict,
    setActiveConflict,
    isApplyingServerStateRef,
    fetchServerDbState,
  } = useServerSync({
    currentUser,
    setCurrentUser,
    setIsLoginModalOpen,
    setServerFacilities,
    setJoints,
    setProjectLineList,
    setLrvCatalog,
    setWelders,
    setTechCards,
    setWeldingMaterials,
    setUserAccounts,
    setAuditLogs,
    setTemplates,
    setFacilityGeoOverrides,
  });

  const passportBaseJointRef = useRef<WeldJoint | null>(null);
  const [backupModalState, setBackupModalState] = useState<{
    isOpen: boolean;
    initialTab: 'backup' | 'author_reset';
  }>({
    isOpen: false,
    initialTab: 'backup',
  });

  const logoClickCountRef = useRef(0);
  const logoClickTimerRef = useRef<number | null>(null);

  const handleHeaderLogoSecretClick = () => {
    logoClickCountRef.current += 1;
    if (logoClickTimerRef.current) {
      window.clearTimeout(logoClickTimerRef.current);
    }
    if (logoClickCountRef.current >= 5) {
      logoClickCountRef.current = 0;
      setBackupModalState({ isOpen: true, initialTab: 'author_reset' });
      return;
    }
    logoClickTimerRef.current = window.setTimeout(() => {
      logoClickCountRef.current = 0;
    }, 2500);
  };

  const [confirmBulkDeleteJoints, setConfirmBulkDeleteJoints] = useState(false);

  // Горячие клавиши Ctrl+Z (Undo), Ctrl+Y / Ctrl+Shift+Z (Redo) и секретная консоль автора
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.altKey &&
        e.key.toLowerCase() === 'z'
      ) {
        e.preventDefault();
        setBackupModalState({ isOpen: true, initialTab: 'author_reset' });
        return;
      }

      if (isInput) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  // Фильтрация, поиск и сортировка реестра стыков
  const [globalSearch, setGlobalSearch] = useState('');
  const [weldingDateFrom, setWeldingDateFrom] = useState('');
  const [weldingDateTo, setWeldingDateTo] = useState('');
  const [columnFilters, setColumnFilters] = useState<
    Partial<Record<WeldJointFieldKey, string[]>>
  >({});
  const [openFilterColumnKey, setOpenFilterColumnKey] =
    useState<WeldJointFieldKey | null>(null);
  const [sortConfig, setSortConfig] = useState<{
    key: WeldJointFieldKey;
    direction: 'asc' | 'desc';
  } | null>(null);

  const [selectedJointIds, setSelectedJointIds] = useState<string[]>([]);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);

  const [passportModal, setPassportModal] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit';
    joint: WeldJoint | null;
  }>({
    isOpen: false,
    mode: 'create',
    joint: null,
  });

  const [isImportExcelOpen, setIsImportExcelOpen] = useState(false);

  const scopedJoints = useMemo(() => {
    return joints.filter((j) => {
      if (selectedObjectName !== 'ALL' && j.objectName !== selectedObjectName) {
        return false;
      }
      if (selectedRdCode !== 'ALL' && j.rdCode !== selectedRdCode) {
        return false;
      }
      return true;
    });
  }, [joints, selectedObjectName, selectedRdCode]);

  const filteredAndSortedJoints = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();

    const filtered = scopedJoints.filter((joint) => {
      for (const [colKey, allowedValues] of Object.entries(columnFilters)) {
        if (!allowedValues) continue;
        const rawVal = String(joint[colKey as WeldJointFieldKey] ?? '');
        if (!allowedValues.includes(rawVal)) {
          return false;
        }
      }

      if (!isWeldingDateInRange(joint.weldingDate, weldingDateFrom, weldingDateTo)) {
        return false;
      }

      if (q) {
        return ALL_COLUMNS.some((col) => {
          const rawStr = String(joint[col.key] ?? '');
          const formattedStr = isDateColumnKey(col.key)
            ? formatDateDDMMYY(rawStr)
            : rawStr;
          return (
            rawStr.toLowerCase().includes(q) ||
            formattedStr.toLowerCase().includes(q)
          );
        });
      }
      return true;
    });

    if (!sortConfig) return filtered;

    const { key, direction } = sortConfig;
    return [...filtered].sort((a, b) => {
      const valA =
        key === 'equivDiameterInch' ? getJointEquivDiaInch(a) : a[key] ?? '';
      const valB =
        key === 'equivDiameterInch' ? getJointEquivDiaInch(b) : b[key] ?? '';
      const cmp = String(valA).localeCompare(String(valB), 'ru', {
        numeric: true,
      });
      return direction === 'asc' ? cmp : -cmp;
    });
  }, [
    scopedJoints,
    columnFilters,
    globalSearch,
    weldingDateFrom,
    weldingDateTo,
    sortConfig,
  ]);

  const getUniqueValuesForColumn = useCallback(
    (colKey: WeldJointFieldKey) => {
      const counts = new Map<string, number>();
      for (const j of scopedJoints) {
        const raw =
          colKey === 'equivDiameterInch' ? getJointEquivDiaInch(j) : j[colKey];
        const val = String(raw ?? '');
        counts.set(val, (counts.get(val) || 0) + 1);
      }
      return Array.from(counts.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => a.value.localeCompare(b.value, 'ru', { numeric: true }));
    },
    [scopedJoints]
  );

  const handleApplyTemplate = useCallback(
    (tpl: ColumnTemplate) => {
      setActiveTemplateId(tpl.id);
      setColumnOrder([...tpl.columnOrder]);
      setVisibleColumns([...tpl.visibleColumns]);
      if (tpl.customWidths && Object.keys(tpl.customWidths).length > 0) {
        setColumnWidths({ ...tpl.customWidths });
      }
    },
    [setActiveTemplateId, setColumnOrder, setColumnWidths, setVisibleColumns]
  );

  const handleMoveColumnInline = useCallback(
    (key: WeldJointFieldKey, dir: 'left' | 'right') => {
      const activeKeys = activeColumnDefs.map((c) => c.key);
      const currentVisIdx = activeKeys.indexOf(key);
      if (currentVisIdx === -1) return;
      const neighborVisIdx = dir === 'left' ? currentVisIdx - 1 : currentVisIdx + 1;
      if (neighborVisIdx < 0 || neighborVisIdx >= activeKeys.length) return;

      const neighborKey = activeKeys[neighborVisIdx];
      setColumnOrder((prevOrder) => {
        const nextOrder = [...prevOrder];
        const idxA = nextOrder.indexOf(key);
        const idxB = nextOrder.indexOf(neighborKey);
        if (idxA !== -1 && idxB !== -1) {
          nextOrder[idxA] = neighborKey;
          nextOrder[idxB] = key;
        }
        return nextOrder;
      });
    },
    [activeColumnDefs, setColumnOrder]
  );

  const handleHideColumnInline = useCallback(
    (key: WeldJointFieldKey) => {
      if (key === 'jointNumber') return;
      setVisibleColumns((prev) => prev.filter((k) => k !== key));
    },
    [setVisibleColumns]
  );

  useEffect(() => {
    if (passportModal.isOpen && passportModal.joint) {
      passportBaseJointRef.current = { ...passportModal.joint };
    } else if (!passportModal.isOpen) {
      passportBaseJointRef.current = null;
    }
  }, [passportModal.isOpen, passportModal.joint?.id]);

  const userPermissions = useMemo(
    () => getUserRolePermissions(currentUser),
    [currentUser]
  );

  const jointActions = useJointActions({
    currentUser,
    joints,
    setJoints,
    projectLineList,
    setProjectLineList,
    serverFacilities,
    setServerFacilities,
    derivedFacilities,
    filteredAndSortedJoints,
    selectedJointIds,
    setSelectedJointIds,
    setConfirmBulkDeleteJoints,
    setAuditLogs,
    appendSystemAuditEntry,
    recordUndoSnapshot,
    passportModalMode: passportModal.mode,
    passportBaseJointRef,
    setPassportModal,
    siteWeatherTempC: siteWeather.tempC,
    activeConflict,
    setActiveConflict,
    setIsDbConnected,
    setIsDbSyncing,
    setIsAuthenticated,
    setIsLoginModalOpen,
    setPendingSyncCount,
    setLastSyncError,
    setIsServerDbModalOpen,
    isApplyingServerStateRef,
    bumpRevisionMeta,
  });

  const dirActions = useDirectoryActions({
    currentUser,
    setCurrentUser,
    userAccounts,
    setUserAccounts,
    joints,
    setJoints,
    projectLineList,
    setProjectLineList,
    lrvCatalog,
    setLrvCatalog,
    welders,
    setWelders,
    techCards,
    setTechCards,
    weldingMaterials,
    setWeldingMaterials,
    serverFacilities,
    setServerFacilities,
    derivedFacilities,
    auditLogs,
    setAuditLogs,
    templates,
    setTemplates,
    activeTemplateId,
    setActiveTemplateId,
    columnOrder,
    visibleColumns,
    columnWidths,
    selectedObjectName,
    setSelectedObjectName,
    selectedRdCode,
    setSelectedRdCode,
    setSelectedJointIds,
    recordUndoSnapshot,
    appendSystemAuditEntry,
    handleApplyTemplate,
    initialColumnTemplates: INITIAL_COLUMN_TEMPLATES,
    handleSaveFacilityLocationLocal,
    handleCreateStandaloneObjectLocal,
    setIsDbSyncing,
    setIsAuthenticated,
    setIsLoginModalOpen,
    bumpRevisionMeta,
  });

  // Восстановление из JSON-бэкапа и скрытая консоль автора
  const handleRestoreFullBackup = (payload: FullSystemBackupPayload) => {
    const data = payload.data;
    recordUndoSnapshot('Восстановление представления из JSON-бэкапа');
    if (Array.isArray(data.joints)) setJoints(data.joints);
    if (Array.isArray(data.projectLineList))
      setProjectLineList(data.projectLineList);
    if (Array.isArray(data.lrvCatalog)) setLrvCatalog(data.lrvCatalog);
    if (Array.isArray(data.welders)) setWelders(data.welders);
    if (Array.isArray(data.techCards)) setTechCards(data.techCards);
    if (Array.isArray(data.weldingMaterials))
      setWeldingMaterials(data.weldingMaterials);
    if (Array.isArray(data.userAccounts) && data.userAccounts.length > 0) {
      setUserAccounts(data.userAccounts);
      setCurrentUser(data.userAccounts[0]);
    }
    if (
      data.facilityGeoOverrides &&
      typeof data.facilityGeoOverrides === 'object'
    ) {
      setFacilityGeoOverrides(data.facilityGeoOverrides);
    }
    if (Array.isArray(data.templates) && data.templates.length > 0) {
      setTemplates(data.templates);
      const matchedTpl =
        data.templates.find((t) => t.id === data.activeTemplateId) ||
        data.templates[0];
      if (matchedTpl) handleApplyTemplate(matchedTpl);
    }
    setSelectedObjectName('ALL');
    setSelectedRdCode('ALL');
    setSelectedJointIds([]);
    setColumnFilters({});

    const restoreAuditEntry: AuditLogEntry = {
      id: `aud-restore-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userLogin: currentUser.login,
      userFullName: currentUser.fullName,
      userRole: currentUser.role,
      jointId: 'sys-backup-restore',
      jointNumber: `${data.joints?.length ?? 0} ст.`,
      uniqueLineId: 'СИСТЕМА (БЭКАП)',
      rdCode: 'ВОССТАНОВЛЕНИЕ',
      fieldKey: 'system',
      fieldLabel: 'Восстановление состояния из JSON-архива',
      oldValue: 'Предыдущее состояние',
      newValue: `Стыков: ${data.joints?.length ?? 0}, Линий: ${
        data.projectLineList?.length ?? 0
      }`,
      operationType: 'batch_upload',
    };
    const baseLogs = Array.isArray(data.auditLogs) ? data.auditLogs : [];
    setAuditLogs([restoreAuditEntry, ...baseLogs]);
  };

  const handleAuthorZeroReset = (keepAdminUser: boolean) => {
    const cleanAdminAccount: UserAccount = {
      login: 'admin_pto',
      fullName: 'Администратор системы',
      role: 'Системный администратор (Полный доступ)',
      backendRole: 'ADMIN',
      department: 'Администрация ИТ / ПТО',
      sessionNumber: 1,
    };
    const nextUsers = keepAdminUser
      ? [cleanAdminAccount]
      : [USER_ACCOUNTS[0] || cleanAdminAccount];

    setJoints([]);
    setProjectLineList([]);
    setLrvCatalog([]);
    setWelders([]);
    setTechCards([]);
    setWeldingMaterials([]);
    setAuditLogs([]);
    setFacilityGeoOverrides({});
    setUserAccounts(nextUsers);
    setCurrentUser(nextUsers[0]);
    setUndoStack([]);
    setRedoStack([]);
    setSelectedJointIds([]);
    setColumnFilters({});
    setGlobalSearch('');
    setWeldingDateFrom('');
    setWeldingDateTo('');
    setSelectedObjectName('ALL');
    setSelectedRdCode('ALL');
  };

  const handleAuthorRestoreDemoSeed = () => {
    setJoints(INITIAL_JOINTS);
    setProjectLineList(INITIAL_PROJECT_LINELIST);
    setLrvCatalog(INITIAL_LRV_CATALOG);
    setWelders(WELDERS_DIRECTORY);
    setTechCards(INITIAL_TECH_CARDS);
    setWeldingMaterials(INITIAL_WELDING_MATERIALS);
    setAuditLogs(INITIAL_AUDIT_LOGS);
    setFacilityGeoOverrides({});
    setUserAccounts(USER_ACCOUNTS);
    setCurrentUser(USER_ACCOUNTS[0]);
    setUndoStack([]);
    setRedoStack([]);
    setSelectedJointIds([]);
    setColumnFilters({});
    setSelectedObjectName(FACILITY_OBJECTS[0].name);
    setSelectedRdCode('ALL');
  };

  const [isLoadingDemoDataset, setIsLoadingDemoDataset] = useState(false);
  const handleLoadKharasaveyDemo = async () => {
    try {
      setIsLoadingDemoDataset(true);
      const mod = await import('./data/kharasaveyDemoData');
      recordUndoSnapshot('Загрузка демонстрационного массива Харасавэй (1271 стык)');
      setJoints((prev) => {
        const existingIds = new Set(prev.map((j) => j.id));
        return [...prev, ...mod.KHARASAVEY_JOINTS.filter((j) => !existingIds.has(j.id))];
      });
      setLrvCatalog((prev) => {
        const existingCodes = new Set(prev.map((l) => l.lrvCode));
        return [...prev, ...mod.KHARASAVEY_LRV.filter((l) => !existingCodes.has(l.lrvCode))];
      });
      setProjectLineList((prev) => {
        const existingIds = new Set(prev.map((l) => l.uniqueLineId));
        return [...prev, ...mod.KHARASAVEY_LINES.filter((l) => !existingIds.has(l.uniqueLineId))];
      });
      setSelectedObjectName('УКПГ-1С Харасавэйское ГКМ');
      setSelectedRdCode('ALL');
    } catch (err) {
      console.error('Ошибка загрузки демо-данных Харасавэя:', err);
    } finally {
      setIsLoadingDemoDataset(false);
    }
  };

  const toggleSelectAllVisible = useCallback(() => {
    const visibleIds = filteredAndSortedJoints.map((j) => j.id);
    const allSelected =
      visibleIds.length > 0 &&
      visibleIds.every((id) => selectedJointIds.includes(id));
    if (allSelected) {
      setSelectedJointIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedJointIds(Array.from(new Set([...selectedJointIds, ...visibleIds])));
    }
  }, [filteredAndSortedJoints, selectedJointIds]);

  const toggleSelectRow = useCallback((id: string) => {
    setSelectedJointIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const handleClearSelection = useCallback(() => setSelectedJointIds([]), []);
  const handleWeldingDateFromChange = useCallback((val: string) => setWeldingDateFrom(val), []);
  const handleWeldingDateToChange = useCallback((val: string) => setWeldingDateTo(val), []);
  const handleResetDateRange = useCallback(() => {
    setWeldingDateFrom('');
    setWeldingDateTo('');
  }, []);
  const handleSetConfirmBulkDeleteJoints = useCallback(
    (val: boolean) => setConfirmBulkDeleteJoints(val),
    []
  );
  const handleOpenBulkEdit = useCallback(() => {
    if (selectedJointIds.length === 0) {
      setSelectedJointIds(filteredAndSortedJoints.map((j) => j.id));
    }
    setIsBulkEditOpen(true);
  }, [selectedJointIds.length, filteredAndSortedJoints]);
  const handleOpenImportExcel = useCallback(() => setIsImportExcelOpen(true), []);
  const handleOpenCreatePassport = useCallback(
    () => setPassportModal({ isOpen: true, mode: 'create', joint: null }),
    []
  );
  const handleOpenEditPassport = useCallback(
    (joint: WeldJoint) => setPassportModal({ isOpen: true, mode: 'edit', joint }),
    []
  );
  const handleOpenColumnsModal = useCallback(
    () => setIsColumnsModalOpen(true),
    [setIsColumnsModalOpen]
  );
  const handleSetColumnFilter = useCallback(
    (k: WeldJointFieldKey, vals: string[] | undefined) =>
      setColumnFilters((prev) => ({ ...prev, [k]: vals })),
    []
  );
  const handleResetAllFilters = useCallback(() => {
    setColumnFilters({});
    setGlobalSearch('');
    setWeldingDateFrom('');
    setWeldingDateTo('');
  }, []);
  const handleSetOpenFilterColumnKey = useCallback(
    (key: WeldJointFieldKey | null) => setOpenFilterColumnKey(key),
    []
  );

  const activeFilterKeys = useMemo(
    () =>
      Object.keys(columnFilters).filter(
        (k) => columnFilters[k as WeldJointFieldKey] !== undefined
      ) as WeldJointFieldKey[],
    [columnFilters]
  );

  const sectionLabels: Record<AppSection, string> = {
    registry: 'Реестр стыков и ввод данных',
    project_linelist: 'Проект (лайнлист)',
    welding_tech: 'Технология сварочного производства',
    journals: 'Журналы сварочных работ (СТО Газпром / ГОСТ)',
    readiness: 'Отчётность по готовности',
    lrv_catalog: 'Каталог ЛРВ и спецификации',
    audit_log: 'Журнал изменений (Аудит)',
    user_guide: 'Руководство пользователя (Иллюстрированный буклет PDF)',
  };

  const sectionIcons: Record<AppSection, React.ReactNode> = {
    registry: <ClipboardList className="w-4 h-4 sm:w-5 sm:h-5 text-sky-300 shrink-0" />,
    project_linelist: <FolderKanban className="w-4 h-4 sm:w-5 sm:h-5 text-sky-300 shrink-0" />,
    welding_tech: <Wrench className="w-4 h-4 sm:w-5 sm:h-5 text-sky-300 shrink-0" />,
    journals: <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-sky-300 shrink-0" />,
    readiness: <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-sky-300 shrink-0" />,
    lrv_catalog: <Database className="w-4 h-4 sm:w-5 sm:h-5 text-sky-300 shrink-0" />,
    audit_log: <History className="w-4 h-4 sm:w-5 sm:h-5 text-sky-300 shrink-0" />,
    user_guide: <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-sky-300 shrink-0" />,
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f4f7fb] text-slate-900">
      <AppHeader
        activeSection={activeSection}
        sectionIcons={sectionIcons}
        sectionLabels={sectionLabels}
        onLogoClick={handleHeaderLogoSecretClick}
        isDbConnected={isDbConnected}
        isDbSyncing={isDbSyncing}
        isAuthenticated={isAuthenticated}
        pendingSyncCount={pendingSyncCount}
        lastSyncError={lastSyncError}
        serverDbMeta={serverDbMeta}
        currentUser={currentUser}
        onOpenServerDbModal={() => setIsServerDbModalOpen(true)}
        onTriggerSync={triggerImmediateSync}
        onOpenLoginModal={() => {
          setLoginModalInitialMode('login');
          setIsLoginModalOpen(true);
        }}
        onLogout={async () => {
          await zaychickApi.logout().catch(() => {});
          setIsAuthenticated(false);
          setIsDbConnected(false);
          setIsLoginModalOpen(true);
        }}
        undoCount={undoStack.length}
        redoCount={redoStack.length}
        lastUndoLabel={undoStack[undoStack.length - 1]?.actionLabel}
        lastRedoLabel={redoStack[redoStack.length - 1]?.actionLabel}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenDrawer={() => setIsDrawerOpen(true)}
      />

      <HamburgerDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        facilities={derivedFacilities}
        selectedObjectName={selectedObjectName}
        onSelectObjectName={setSelectedObjectName}
        selectedRdCode={selectedRdCode}
        onSelectRdCode={setSelectedRdCode}
        totalJointsCount={joints.length}
        projectLineListCount={projectLineList.length}
        auditLogsCount={auditLogs.length}
        lrvCatalogCount={lrvCatalog.length}
        weldingTechCount={`${welders.length} НАКС / ${techCards.length} ТК`}
        currentUser={currentUser}
        onOpenLoginModal={() => {
          setLoginModalInitialMode('login');
          setIsLoginModalOpen(true);
        }}
        onOpenAdminPasswordModal={() => {
          setLoginModalInitialMode('admin_password');
          setIsLoginModalOpen(true);
        }}
        onExportAllJoints={(fmt) => {
          if (!isDbConnected || pendingSyncCount > 0) {
            const proceed = window.confirm(
              `ВНИМАНИЕ: Имеются несинхронизированные данные (${pendingSyncCount} изм.) или отсутствует подключение к серверу PostgreSQL.\n\nФайл будет выгружен с префиксом ЧЕРНОВИК_НЕ_СИНХРОНИЗИРОВАНО. Продолжить?`
            );
            if (!proceed) return;
          }
          void exportAllJointsToFile(joints, fmt, {
            isDraftUnsynced: !isDbConnected || pendingSyncCount > 0,
            unsyncedCount: pendingSyncCount,
            rdCode: selectedRdCode,
          });
        }}
        onOpenFacilityLocation={(objName) => setLocationModalFacilityName(objName)}
        onOpenBackupModal={() =>
          setBackupModalState({ isOpen: true, initialTab: 'backup' })
        }
        onOpenAuthorResetModal={() =>
          setBackupModalState({ isOpen: true, initialTab: 'author_reset' })
        }
        onDeleteObject={dirActions.handleDeleteObject}
        onDeleteRdCode={dirActions.handleDeleteRdCode}
        onCreateObject={dirActions.handleCreateStandaloneObject}
        dbRevision={serverDbMeta?.globalRevision ?? 1}
        isDbConnected={isDbConnected}
        onOpenServerDbModal={() => setIsServerDbModalOpen(true)}
      />

      <main className="flex-1 max-w-[1920px] w-full mx-auto p-3 sm:p-4 space-y-3">
        {selectedObjectName === 'УКПГ-1С Харасавэйское ГКМ' &&
          joints.filter((j) => j.objectName === 'УКПГ-1С Харасавэйское ГКМ').length ===
            0 && (
            <div className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-r from-sky-50 via-indigo-50 to-blue-50 border border-sky-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1e3799] text-white flex items-center justify-center font-bold text-sm shadow-2xs shrink-0">
                  1С
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    Демонстрационный массив «УКПГ-1С Харасавэйское ГКМ» (1271 стык)
                  </h4>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Датасет вынесен в отдельный асинхронный модуль и готов к загрузке: 4 шифра РД, 30 линий проекта, 1271 стык.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isLoadingDemoDataset}
                onClick={handleLoadKharasaveyDemo}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1e3799] hover:bg-[#15276e] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:bg-slate-400"
              >
                {isLoadingDemoDataset ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Загрузка данных...</span>
                  </>
                ) : (
                  <>
                    <HardDriveDownload className="w-4 h-4" />
                    <span>Загрузить 1271 стык (Харасавэй)</span>
                  </>
                )}
              </button>
            </div>
          )}

        {activeSection === 'registry' && (
          <JointsRegistryView
            joints={joints}
            filteredAndSortedJoints={filteredAndSortedJoints}
            lines={projectLineList}
            selectedJointIds={selectedJointIds}
            onToggleSelectRow={toggleSelectRow}
            onToggleSelectAll={toggleSelectAllVisible}
            onClearSelection={handleClearSelection}
            weldingDateFrom={weldingDateFrom}
            weldingDateTo={weldingDateTo}
            onWeldingDateFromChange={handleWeldingDateFromChange}
            onWeldingDateToChange={handleWeldingDateToChange}
            onResetDateRange={handleResetDateRange}
            userPermissions={userPermissions}
            confirmBulkDeleteJoints={confirmBulkDeleteJoints}
            onSetConfirmBulkDeleteJoints={handleSetConfirmBulkDeleteJoints}
            onBulkDeleteSelectedJoints={jointActions.handleBulkDeleteSelectedJoints}
            onOpenBulkEdit={handleOpenBulkEdit}
            onQuickAddSupplementaryJoint={
              jointActions.handleQuickAddSupplementaryJoint
            }
            onOpenImportExcel={handleOpenImportExcel}
            onOpenCreatePassport={handleOpenCreatePassport}
            onOpenEditPassport={handleOpenEditPassport}
            activeTemplateId={activeTemplateId}
            templates={templates}
            onApplyTemplate={handleApplyTemplate}
            visibleColumns={visibleColumns}
            activeColumnDefs={activeColumnDefs}
            columnWidths={columnWidths}
            onOpenColumnsModal={handleOpenColumnsModal}
            columnFilters={columnFilters}
            activeFilterKeys={activeFilterKeys}
            onSetColumnFilter={handleSetColumnFilter}
            onResetAllFilters={handleResetAllFilters}
            sortConfig={sortConfig}
            onSetSortConfig={setSortConfig}
            openFilterColumnKey={openFilterColumnKey}
            onSetOpenFilterColumnKey={handleSetOpenFilterColumnKey}
            getUniqueValuesForColumn={getUniqueValuesForColumn}
            onColumnResizeStart={handleColumnResizeStart}
            onColumnAutoFit={handleColumnAutoFit}
            onMoveColumnInline={handleMoveColumnInline}
            onHideColumnInline={handleHideColumnInline}
          />
        )}

        {activeSection === 'project_linelist' && (
          <ProjectLineListView
            lineList={projectLineList}
            joints={joints}
            facilities={derivedFacilities}
            selectedObjectName={selectedObjectName}
            selectedRdCode={selectedRdCode}
            canEdit={userPermissions.canEditLineList}
            currentUserRoleLabel={userPermissions.categoryLabel}
            onAddLineItems={dirActions.handleAddLineItems}
            onUpdateLineItem={dirActions.handleUpdateLineItem}
            onBulkUpdateLineItems={dirActions.handleBulkUpdateLineItems}
            onOpenLineInRegistry={(uniqueLineId) => {
              setSelectedObjectName('ALL');
              setSelectedRdCode('ALL');
              setColumnFilters({ uniqueLineId: [uniqueLineId] });
              setActiveSection('registry');
            }}
            onOpenFacilityLocation={(objName) =>
              setLocationModalFacilityName(objName)
            }
            onDeleteLineItems={dirActions.handleDeleteLineItems}
            onDeleteObject={dirActions.handleDeleteObject}
            onDeleteRdCode={dirActions.handleDeleteRdCode}
          />
        )}

        {activeSection === 'welding_tech' && (
          <WeldingTechView
            welders={welders}
            techCards={techCards}
            materials={weldingMaterials}
            canEdit={userPermissions.canEditWeldingTech}
            currentUserRoleLabel={userPermissions.categoryLabel}
            onSaveWelder={dirActions.handleSaveWelder}
            onDeleteWelder={dirActions.handleDeleteWelder}
            onSaveTechCard={dirActions.handleSaveTechCard}
            onDeleteTechCard={dirActions.handleDeleteTechCard}
            onSaveMaterial={dirActions.handleSaveMaterial}
            onDeleteMaterial={dirActions.handleDeleteWeldingMaterial}
          />
        )}

        {activeSection === 'journals' && (
          <WeldingJournalsView
            joints={joints}
            allJoints={joints}
            lines={projectLineList}
            facilities={derivedFacilities}
            materials={weldingMaterials}
            lrvCatalog={lrvCatalog}
            selectedObjectName={selectedObjectName}
            selectedRdCode={selectedRdCode}
            onSelectObjectName={setSelectedObjectName}
            onSelectRdCode={setSelectedRdCode}
            isDbConnected={isDbConnected}
            pendingSyncCount={pendingSyncCount}
            onEditJoint={(j) =>
              setPassportModal({
                isOpen: true,
                mode: 'edit',
                joint: j,
              })
            }
          />
        )}

        {activeSection === 'readiness' && (
          <ReadinessReportView
            joints={scopedJoints}
            onFilterRegistryByCondition={(cond: ReadinessGroupCondition, val: string) => {
              if (cond === 'objectName') {
                setSelectedObjectName(val);
                setSelectedRdCode('ALL');
              } else if (cond === 'rdCode') {
                setSelectedRdCode(val);
              } else {
                setColumnFilters({ [cond]: [val] });
              }
              setActiveSection('registry');
            }}
          />
        )}

        {activeSection === 'lrv_catalog' && (
          <LrvCatalogView
            joints={joints}
            catalog={
              selectedObjectName !== 'ALL'
                ? lrvCatalog.filter((item) => item.objectName === selectedObjectName)
                : lrvCatalog
            }
            facilities={
              selectedObjectName !== 'ALL'
                ? derivedFacilities.filter((f) => f.name === selectedObjectName)
                : derivedFacilities
            }
            selectedRdCode={selectedRdCode}
            canEdit={userPermissions.canEditLrvCatalog}
            currentUserRoleLabel={userPermissions.categoryLabel}
            onAddLrvItems={dirActions.handleAddLrvItems}
            onUpdateLrvItem={dirActions.handleUpdateLrvItem}
            onDeleteLrvItems={dirActions.handleDeleteLrvItems}
          />
        )}

        {activeSection === 'audit_log' && (
          <AuditHistoryView
            logs={auditLogs}
            isAdmin={userPermissions.category === 'admin'}
            onClearAuditLog={dirActions.handleClearAuditLogs}
            onOpenAdminPasswordModal={() => {
              setLoginModalInitialMode('admin_password');
              setIsLoginModalOpen(true);
            }}
          />
        )}

        {activeSection === 'user_guide' && <UserGuideBookletView />}
      </main>

      <ColumnTemplatesModal
        isOpen={isColumnsModalOpen}
        onClose={() => setIsColumnsModalOpen(false)}
        columnOrder={columnOrder}
        visibleColumns={visibleColumns}
        onChangeColumns={(order, vis) => {
          setColumnOrder(order);
          setVisibleColumns(vis);
        }}
        templates={templates}
        activeTemplateId={activeTemplateId}
        onApplyTemplate={handleApplyTemplate}
        onSaveNewTemplate={dirActions.handleSaveNewTemplate}
        onDeleteTemplate={dirActions.handleDeleteTemplate}
        onResetColumnWidths={handleResetColumnWidths}
      />

      <BulkEditModal
        isOpen={isBulkEditOpen}
        onClose={() => setIsBulkEditOpen(false)}
        selectedJoints={joints.filter((j) => selectedJointIds.includes(j.id))}
        welders={welders}
        inspectors={dynamicInspectors}
        facilityCoords={{
          latitude: currentFacility.latitude,
          longitude: currentFacility.longitude,
          weatherArchive: currentFacility.weatherArchive,
          weatherStation: currentFacility.weatherStation,
        }}
        currentUser={currentUser}
        onApplyBulkUpdate={jointActions.handleApplyBulkUpdate}
      />

      <JointPassportModal
        isOpen={passportModal.isOpen}
        mode={passportModal.mode}
        initialJoint={passportModal.joint}
        allJoints={joints}
        facilities={derivedFacilities}
        projectLineList={projectLineList}
        lrvCatalog={lrvCatalog}
        welders={welders}
        techCards={techCards}
        weldingMaterials={weldingMaterials}
        inspectors={dynamicInspectors}
        currentUser={currentUser}
        auditLogsForJoint={
          passportModal.joint
            ? auditLogs.filter((a) => a.jointId === passportModal.joint?.id)
            : []
        }
        defaultObjectName={
          selectedObjectName === 'ALL'
            ? derivedFacilities[0]?.name || EMPTY_FACILITY_FALLBACK.name
            : selectedObjectName
        }
        defaultRdCode={
          selectedRdCode === 'ALL'
            ? currentFacility.rdCodes[0]?.code ||
              EMPTY_FACILITY_FALLBACK.rdCodes[0].code
            : selectedRdCode
        }
        onSave={jointActions.handleSaveJointFromPassport}
        onNavigateJoint={(target) =>
          setPassportModal((prev) => ({
            ...prev,
            joint: target,
          }))
        }
        onDeleteJoint={jointActions.handleDeleteJointFromPassport}
        onOpenFacilityLocation={(objName) => setLocationModalFacilityName(objName)}
        onClose={() =>
          setPassportModal({
            isOpen: false,
            mode: 'create',
            joint: null,
          })
        }
      />

      <ImportJointsExcelModal
        isOpen={isImportExcelOpen}
        onClose={() => setIsImportExcelOpen(false)}
        projectLineList={projectLineList}
        lrvCatalog={lrvCatalog}
        techCards={techCards}
        existingJoints={joints}
        defaultObjectName={
          selectedObjectName === 'ALL'
            ? derivedFacilities[0]?.name || EMPTY_FACILITY_FALLBACK.name
            : selectedObjectName
        }
        defaultRdCode={
          selectedRdCode === 'ALL'
            ? currentFacility.rdCodes[0]?.code ||
              EMPTY_FACILITY_FALLBACK.rdCodes[0].code
            : selectedRdCode
        }
        onImportJoints={jointActions.handleImportJoints}
      />

      <FacilityLocationModal
        isOpen={Boolean(locationModalFacilityName)}
        facility={activeLocationFacility}
        facilities={derivedFacilities}
        presets={FACILITY_LOCATION_PRESETS}
        joints={joints}
        customStations={activeLocationFacility?.customWeatherStations}
        onSaveLocation={dirActions.handleSaveFacilityLocation}
        onBulkUpdateJoints={handleBulkUpdateJointsTemperaturesFromStation}
        onClose={() => setLocationModalFacilityName(null)}
      />

      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        currentUser={currentUser}
        accounts={userAccounts}
        initialMode={loginModalInitialMode}
        onChangeAdminPassword={dirActions.handleChangeAdminPassword}
        onToggleAdminRights={dirActions.handleToggleAdminRights}
        onRegisterAccount={(newAcc) => {
          setUserAccounts((prev) => [...prev, newAcc]);
          bumpRevisionMeta(
            `Создан пользователь ${newAcc.login}`,
            currentUser.fullName
          );
        }}
        onDeleteAccount={dirActions.handleDeleteUserAccount}
        onAuthenticate={(acc) => {
          setCurrentUser(acc);
          setIsAuthenticated(true);
          void fetchServerDbState(false);
        }}
      />

      <BackupAndResetModal
        isOpen={backupModalState.isOpen}
        initialMode={backupModalState.initialTab}
        onClose={() =>
          setBackupModalState((prev) => ({ ...prev, isOpen: false }))
        }
        currentUser={currentUser}
        currentPayload={{
          joints,
          projectLineList,
          lrvCatalog,
          auditLogs,
          welders,
          techCards,
          weldingMaterials,
          userAccounts,
          facilityGeoOverrides,
          templates,
          activeTemplateId,
        }}
        onRestoreBackup={handleRestoreFullBackup}
        onAuthorZeroReset={handleAuthorZeroReset}
        onAuthorRestoreDemoSeed={handleAuthorRestoreDemoSeed}
        onLoadKharasaveyDemo={handleLoadKharasaveyDemo}
      />

      <ServerDbStatusModal
        isOpen={isServerDbModalOpen}
        onClose={() => setIsServerDbModalOpen(false)}
        dbMeta={serverDbMeta}
        isConnected={isDbConnected}
        isSyncing={isDbSyncing}
        pendingSyncCount={pendingSyncCount}
        lastSyncError={lastSyncError}
        onRetrySync={triggerImmediateSync}
        joints={scopedJoints.length > 0 ? scopedJoints : joints}
        onRefreshFromServer={async () => {
          await fetchServerDbState(false);
        }}
        onTriggerSimulatedConflict={jointActions.handleTriggerSimulatedConflict}
      />

      <OptimisticConflictModal
        conflict={activeConflict}
        onClose={() => setActiveConflict(null)}
        onAcceptServerVersion={jointActions.handleAcceptServerConflictVersion}
        onApplyAutoMerge={jointActions.handleApplyAutoMergeConflict}
        onForceClientOverwrite={jointActions.handleForceClientConflictOverwrite}
      />
    </div>
  );
}
