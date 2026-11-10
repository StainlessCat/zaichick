/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  BookOpen,
  Bookmark,
  Calendar,
  CheckSquare,
  ClipboardList,
  CloudSun,
  Columns,
  Database,
  Edit3,
  FilePlus2,
  FileSpreadsheet,
  Filter,
  FolderKanban,
  HardDriveDownload,
  History,
  Layers,
  Lock,
  Menu,
  Plus,
  Redo2,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Wrench,
} from 'lucide-react';
import {
  AppSection,
  AuditLogEntry,
  ColumnDefinition,
  ColumnTemplate,
  FacilityObject,
  LRVItem,
  OptimisticLockConflictPayload,
  ProjectLineItem,
  ReadinessGroupCondition,
  ServerDbMetadata,
  TechCardItem,
  UserAccount,
  WelderProfile,
  WeldingMaterialCertificate,
  WeldJoint,
  WeldJointFieldKey,
} from './types/welding';
import {
  ALL_COLUMNS,
  applyBulkUpdateToJoints,
  applyBulkUpdateToLineList,
  buildUniqueLineId,
  DEFAULT_COLUMN_KEYS,
  deriveFacilitiesFromLineList,
  estimateAmbientTempByCoordsAndDate,
  fetchAmbientTemperatureAuto,
  FIELD_LABELS_MAP,
  formatDateDDMMYY,
  generatePeriodWeatherArchive,
  getJointEquivDiaInch,
  isDateColumnKey,
  isWeldingDateInRange,
  MAX_HISTORY_STEPS,
  performRedoStep,
  performUndoStep,
  pushHistorySnapshot,
  suggestNextJointNumber,
} from './utils/weldingLogic';
import { applyOptimisticJointSave } from './utils/optimisticLocking';
import {
  enforceFieldLevelRbacOnJointSave,
  filterBulkPatchByRole,
  getUserRolePermissions,
  mergeDynamicInspectors,
} from './utils/rbac';
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
  INSPECTORS_DIRECTORY,
  USER_ACCOUNTS,
  WELDERS_DIRECTORY,
} from './data/seedData';
import { exportAllJointsToFile } from './utils/excelUtils';
import { ZaychickLogo } from './components/ZaychickLogo';
import { HamburgerDrawer } from './components/HamburgerDrawer';
import { JointsRegistryView } from './components/JointsRegistryView';
import { ColumnTemplatesModal } from './components/ColumnTemplatesModal';
import {
  generateSessionToken,
  hashPasswordWithSalt,
  verifyPassword,
} from './utils/authSecurity';
import { BulkEditModal } from './components/BulkEditModal';
import { JointPassportModal } from './components/JointPassportModal';
import { WeldingJournalsView } from './components/WeldingJournalsView';
import { ReadinessReportView } from './components/ReadinessReportView';
import { LrvCatalogView } from './components/LrvCatalogView';
import { AuditHistoryView } from './components/AuditHistoryView';
import { LoginModal, LoginModalMode } from './components/LoginModal';
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
  useAppState,
  useServerSync,
  EMPTY_FACILITY_FALLBACK,
} from './hooks';

export default function App() {
  const appState = useAppState();
  const {
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
    handleBulkUpdateJointsTemperaturesFromStation,
    handleCreateStandaloneObject,
  } = appState;

  const {
    serverDbMeta,
    setServerDbMeta,
    isDbConnected,
    setIsDbConnected,
    isDbSyncing,
    setIsDbSyncing,
    isServerDbModalOpen,
    setIsServerDbModalOpen,
    activeConflict,
    setActiveConflict,
    clientIdRef,
    isApplyingServerStateRef,
    fetchServerDbState,
  } = useServerSync({
    currentUser,
    sessionToken,
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
    userAccounts,
    setUserAccounts,
    auditLogs,
    setAuditLogs,
    facilityGeoOverrides,
    setFacilityGeoOverrides,
  });

  const passportBaseJointRef = useRef<WeldJoint | null>(null);

  // Модальное окно резервного копирования (.JSON) и скрытой консоли автора («Чистый лист»)
  const [backupModalState, setBackupModalState] = useState<{
    isOpen: boolean;
    initialTab: 'backup' | 'author_reset';
  }>({
    isOpen: false,
    initialTab: 'backup',
  });

  // Скрытый счётчик 5 кликов по логотипу ZAYCHICK в шапке для вызова Консоли Автора
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

  // Проверка и автоматическая инициализация авторизованной сессии с сервером
  useEffect(() => {
    let active = true;
    const establishSession = async () => {
      const storedToken =
        sessionToken ||
        (typeof localStorage !== 'undefined'
          ? localStorage.getItem('zaychick_session_token')
          : null);
      if (storedToken) {
        try {
          const res = await fetch('/api/auth/session', {
            headers: { 'x-session-token': storedToken },
          });
          if (res.ok) {
            const body = await res.json();
            if (body?.session && active) {
              setSessionToken(storedToken);
              return;
            }
          }
        } catch {}
      }

      // Если сохранённой сессии нет или она истекла — выполняем авторизацию текущего пользователя
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            login: currentUser.login,
            password: currentUser.password || '123',
          }),
        });
        if (res.ok) {
          const body = await res.json();
          if (body?.token && active) {
            setSessionToken(body.token);
            try {
              localStorage.setItem('zaychick_session_token', body.token);
            } catch {}
          }
        }
      } catch {}
    };

    establishSession();
    return () => {
      active = false;
    };
  }, [currentUser.login, currentUser.password]);

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

  // Поиск, диапазон дат сварки, Excel-фильтры по столбцам и сортировка
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

  // Выделенные строки для массового редактирования (за исключением номера стыка)
  const [selectedJointIds, setSelectedJointIds] = useState<string[]>([]);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);

  // Паспорт стыка (создание основного / дополнительного стыка или редактирование)
  const [passportModal, setPassportModal] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit';
    joint: WeldJoint | null;
  }>({
    isOpen: false,
    mode: 'create',
    joint: null,
  });

  // Модальное окно загрузки данных в реестр стыков из файла Excel
  const [isImportExcelOpen, setIsImportExcelOpen] = useState(false);

  // Стыки, отфильтрованные по выбранному в кнопке-бутерброде Объекту и Шифру РД
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

  // Применение глобального поиска, Excel-фильтров по столбцам и сортировки
  const filteredAndSortedJoints = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();

    const filtered = scopedJoints.filter((joint) => {
      // Проверка Excel-фильтров по каждому столбцу
      for (const [colKey, allowedValues] of Object.entries(columnFilters)) {
        if (!allowedValues) continue;
        const rawVal = String(joint[colKey as WeldJointFieldKey] ?? '');
        if (!allowedValues.includes(rawVal)) {
          return false;
        }
      }

      // Фильтр по диапазону дат сварки
      if (!isWeldingDateInRange(joint.weldingDate, weldingDateFrom, weldingDateTo)) {
        return false;
      }

      // Глобальный текстовый поиск
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
      const valA = key === 'equivDiameterInch' ? getJointEquivDiaInch(a) : a[key] ?? '';
      const valB = key === 'equivDiameterInch' ? getJointEquivDiaInch(b) : b[key] ?? '';
      const cmp = String(valA).localeCompare(String(valB), 'ru', { numeric: true });
      return direction === 'asc' ? cmp : -cmp;
    });
  }, [scopedJoints, columnFilters, globalSearch, weldingDateFrom, weldingDateTo, sortConfig]);

  // Уникальные значения для открытого Excel-фильтра столбца
  const getUniqueValuesForColumn = useCallback(
    (colKey: WeldJointFieldKey) => {
      const counts = new Map<string, number>();
      for (const j of scopedJoints) {
        const raw = colKey === 'equivDiameterInch' ? getJointEquivDiaInch(j) : j[colKey];
        const val = String(raw ?? '');
        counts.set(val, (counts.get(val) || 0) + 1);
      }
      return Array.from(counts.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => a.value.localeCompare(b.value, 'ru', { numeric: true }));
    },
    [scopedJoints]
  );

  // Применение шаблона столбцов
  const handleApplyTemplate = useCallback((tpl: ColumnTemplate) => {
    setActiveTemplateId(tpl.id);
    setColumnOrder([...tpl.columnOrder]);
    setVisibleColumns([...tpl.visibleColumns]);
    if (tpl.customWidths && Object.keys(tpl.customWidths).length > 0) {
      setColumnWidths({ ...tpl.customWidths });
    }
  }, []);

  const handleSaveNewTemplate = (name: string, description: string) => {
    const newTpl: ColumnTemplate = {
      id: `tpl-user-${Date.now()}`,
      name,
      description,
      isSystem: false,
      columnOrder: [...columnOrder],
      visibleColumns: [...visibleColumns],
      customWidths:
        Object.keys(columnWidths).length > 0 ? { ...columnWidths } : undefined,
    };
    setTemplates((prev) => [...prev, newTpl]);
    setActiveTemplateId(newTpl.id);
  };

  const handleDeleteTemplate = (id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    if (activeTemplateId === id) {
      handleApplyTemplate(INITIAL_COLUMN_TEMPLATES[0]);
    }
  };

  // Перемещение столбца влево/вправо прямо из шапки таблицы
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
    [activeColumnDefs]
  );

  const handleHideColumnInline = useCallback((key: WeldJointFieldKey) => {
    if (key === 'jointNumber') return;
    setVisibleColumns((prev) => prev.filter((k) => k !== key));
  }, []);

  // Сохранение базового снимка стыка при открытии паспорта для 3-стороннего слияния (OCC)
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

  // Сохранение нового или отредактированного стыка через серверную СУБД с оптимистической блокировкой (HTTP 409 при конфликте) и ролевым контролем (Field-Level RBAC)
  const handleSaveJointFromPassport = async (
    rawSavedJoint: WeldJoint,
    isSupplementary: boolean,
    usedCrossRdLrv: boolean
  ) => {
    const existing = joints.find((j) => j.id === rawSavedJoint.id);
    if (!existing && !userPermissions.canCreateOrDeleteJoints) {
      return;
    }
    const savedJoint = enforceFieldLevelRbacOnJointSave(
      existing,
      rawSavedJoint,
      currentUser
    );
    recordUndoSnapshot(
      `Сохранение паспорта стыка № ${savedJoint.jointNumber}`
    );
    const nowIso = new Date().toISOString();
    const baseSnapshot = passportBaseJointRef.current || existing || null;
    const expectedVersion =
      passportModal.mode === 'create' || !existing
        ? null
        : baseSnapshot?.version ?? existing.version ?? 1;

    const auditEntriesToPersist: AuditLogEntry[] = [];

    if (!existing) {
      auditEntriesToPersist.push({
        id: `aud-${Date.now()}`,
        timestamp: nowIso,
        userLogin: currentUser.login,
        userFullName: currentUser.fullName,
        userRole: currentUser.role,
        jointId: savedJoint.id,
        jointNumber: savedJoint.jointNumber,
        uniqueLineId: savedJoint.uniqueLineId,
        rdCode: savedJoint.rdCode,
        fieldKey: 'jointNumber',
        fieldLabel: isSupplementary
          ? 'Добавлен дополнительный стык'
          : 'Добавлен основной стык',
        oldValue: '—',
        newValue: `Стык № ${savedJoint.jointNumber} (${savedJoint.uniqueLineId}, Ø${savedJoint.diameterMm}×${savedJoint.wallThickness})`,
        operationType: 'create_joint',
      });

      if (usedCrossRdLrv) {
        auditEntriesToPersist.push({
          id: `aud-cross-${Date.now()}`,
          timestamp: nowIso,
          userLogin: currentUser.login,
          userFullName: currentUser.fullName,
          userRole: currentUser.role,
          jointId: savedJoint.id,
          jointNumber: savedJoint.jointNumber,
          uniqueLineId: savedJoint.uniqueLineId,
          rdCode: savedJoint.rdCode,
          fieldKey: 'lrv1Code',
          fieldLabel: 'Разблокировка ЛРВ другого шифра РД',
          oldValue: 'Строгий фильтр по РД',
          newValue: `${savedJoint.lrv1Code} / ${savedJoint.lrv2Code}`,
          operationType: 'cross_rd_lrv',
        });
      }
    } else {
      for (const col of ALL_COLUMNS) {
        const k = col.key;
        const oldVal = String(existing[k] ?? '');
        const newVal = String(savedJoint[k] ?? '');
        if (oldVal !== newVal) {
          const displayOld = isDateColumnKey(k)
            ? formatDateDDMMYY(oldVal)
            : oldVal;
          const displayNew = isDateColumnKey(k)
            ? formatDateDDMMYY(newVal)
            : newVal;
          auditEntriesToPersist.push({
            id: `aud-${Date.now()}-${k}`,
            timestamp: nowIso,
            userLogin: currentUser.login,
            userFullName: currentUser.fullName,
            userRole: currentUser.role,
            jointId: existing.id,
            jointNumber: savedJoint.jointNumber,
            uniqueLineId: savedJoint.uniqueLineId,
            rdCode: savedJoint.rdCode,
            fieldKey: k,
            fieldLabel: col.label,
            oldValue: displayOld || '—',
            newValue: displayNew || '—',
            operationType: 'single_edit',
          });
        }
      }
    }

    try {
      setIsDbSyncing(true);
      const response = await fetch('/api/db/joints/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { 'x-session-token': sessionToken } : {}),
        },
        body: JSON.stringify({
          clientId: clientIdRef.current,
          sessionToken,
          joint: {
            ...savedJoint,
            isSupplementary,
            updatedAt: nowIso,
            updatedBy: currentUser.fullName,
          },
          expectedVersion,
          baseJoint: baseSnapshot,
          forceOverwrite: false,
          auditEntries: auditEntriesToPersist,
          user: currentUser,
        }),
      });

      const result = await response.json();

      if (response.status === 409 && result?.status === 'conflict' && result.conflict) {
        // Оптимистическая блокировка сработала: запись в СУБД уже обновлена другим пользователем
        setActiveConflict(result.conflict);
        return;
      }

      if (response.ok && result?.savedJoint) {
        isApplyingServerStateRef.current = true;
        const committed: WeldJoint = result.savedJoint;
        setJoints((prev) =>
          prev.some((j) => j.id === committed.id)
            ? prev.map((j) => (j.id === committed.id ? committed : j))
            : [committed, ...prev]
        );
        if (auditEntriesToPersist.length > 0) {
          setAuditLogs((prev) => [...auditEntriesToPersist, ...prev]);
        }
        if (result.meta) setServerDbMeta(result.meta);
        window.setTimeout(() => {
          isApplyingServerStateRef.current = false;
        }, 60);
        return;
      }
    } catch {
      // Offline / локальный резервный контур с оптимистической проверкой версий
    } finally {
      setIsDbSyncing(false);
    }

    // Локальное применение через чистый движок оптимистической блокировки
    const localOcc = applyOptimisticJointSave({
      currentJoints: joints,
      incomingJoint: {
        ...savedJoint,
        isSupplementary,
      },
      expectedVersion: expectedVersion ?? undefined,
      baseJoint: baseSnapshot,
      user: currentUser,
      fieldLabels: FIELD_LABELS_MAP,
      timestampIso: nowIso,
      forceOverwrite: false,
    });

    if (localOcc.status === 'conflict') {
      setActiveConflict(localOcc.conflict);
      return;
    }

    setJoints(localOcc.updatedJoints);
    if (auditEntriesToPersist.length > 0) {
      setAuditLogs((prev) => [...auditEntriesToPersist, ...prev]);
    }
  };

  // Разрешение конфликта OCC №1: Принять актуальную серверную версию из СУБД
  const handleAcceptServerConflictVersion = (serverJoint: WeldJoint) => {
    isApplyingServerStateRef.current = true;
    setJoints((prev) =>
      prev.map((j) => (j.id === serverJoint.id ? serverJoint : j))
    );
    appendSystemAuditEntry(
      'Редактирование',
      serverJoint.uniqueLineId,
      serverJoint.jointNumber,
      'Разрешение конфликта блокировки (OCC): принята версия СУБД',
      `Локальная правка v${activeConflict?.expectedVersion ?? 1}`,
      `Серверная версия v${serverJoint.version ?? activeConflict?.actualServerVersion ?? 2} (${serverJoint.updatedBy})`,
      serverJoint.id
    );
    setActiveConflict(null);
    window.setTimeout(() => {
      isApplyingServerStateRef.current = false;
    }, 60);
  };

  // Разрешение конфликта OCC №2: Умное 3-стороннее слияние (Auto-Merge)
  const handleApplyAutoMergeConflict = async (mergedJoint: WeldJoint) => {
    const conflictSnap = activeConflict;
    if (!conflictSnap) return;
    const nowIso = new Date().toISOString();
    const auditEntry: AuditLogEntry = {
      id: `aud-occ-merge-${Date.now()}`,
      timestamp: nowIso,
      userLogin: currentUser.login,
      userFullName: currentUser.fullName,
      userRole: currentUser.role,
      jointId: mergedJoint.id,
      jointNumber: mergedJoint.jointNumber,
      uniqueLineId: mergedJoint.uniqueLineId,
      rdCode: mergedJoint.rdCode,
      fieldKey: 'system',
      fieldLabel: 'Умное 3-стороннее слияние версий (Auto-Merge OCC)',
      oldValue: `Конфликт v${conflictSnap.expectedVersion} ↔ v${conflictSnap.actualServerVersion}`,
      newValue: `Слияние в v${conflictSnap.actualServerVersion + 1} (${conflictSnap.fieldDiffs.length} изм. полей)`,
      operationType: 'single_edit',
    };

    try {
      const res = await fetch('/api/db/joints/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { 'x-session-token': sessionToken } : {}),
        },
        body: JSON.stringify({
          clientId: clientIdRef.current,
          sessionToken,
          joint: mergedJoint,
          expectedVersion: conflictSnap.actualServerVersion,
          baseJoint: conflictSnap.serverRecord,
          forceOverwrite: true,
          auditEntries: [auditEntry],
          user: currentUser,
        }),
      });
      if (res.ok) {
        const out = await res.json();
        if (out?.savedJoint) {
          isApplyingServerStateRef.current = true;
          setJoints((prev) =>
            prev.map((j) => (j.id === out.savedJoint.id ? out.savedJoint : j))
          );
          setAuditLogs((prev) => [auditEntry, ...prev]);
          if (out.meta) setServerDbMeta(out.meta);
          setActiveConflict(null);
          window.setTimeout(() => {
            isApplyingServerStateRef.current = false;
          }, 60);
          return;
        }
      }
    } catch {
      // fallback below
    }

    const nextJoint: WeldJoint = {
      ...mergedJoint,
      version: conflictSnap.actualServerVersion + 1,
      updatedAt: nowIso,
      updatedBy: currentUser.fullName,
    };
    setJoints((prev) =>
      prev.map((j) => (j.id === nextJoint.id ? nextJoint : j))
    );
    setAuditLogs((prev) => [auditEntry, ...prev]);
    setActiveConflict(null);
  };

  // Разрешение конфликта OCC №3: Принудительная перезапись версией текущего пользователя
  const handleForceClientConflictOverwrite = async (clientJoint: WeldJoint) => {
    const conflictSnap = activeConflict;
    if (!conflictSnap) return;
    const nowIso = new Date().toISOString();
    const auditEntry: AuditLogEntry = {
      id: `aud-occ-force-${Date.now()}`,
      timestamp: nowIso,
      userLogin: currentUser.login,
      userFullName: currentUser.fullName,
      userRole: currentUser.role,
      jointId: clientJoint.id,
      jointNumber: clientJoint.jointNumber,
      uniqueLineId: clientJoint.uniqueLineId,
      rdCode: clientJoint.rdCode,
      fieldKey: 'system',
      fieldLabel: 'Принудительная перезапись поверх конфликта OCC',
      oldValue: `Версия СУБД v${conflictSnap.actualServerVersion} (${conflictSnap.serverUpdatedBy})`,
      newValue: `Перезаписано версией v${conflictSnap.actualServerVersion + 1} (${currentUser.fullName})`,
      operationType: 'single_edit',
    };

    try {
      const res = await fetch('/api/db/joints/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { 'x-session-token': sessionToken } : {}),
        },
        body: JSON.stringify({
          clientId: clientIdRef.current,
          sessionToken,
          joint: clientJoint,
          expectedVersion: conflictSnap.actualServerVersion,
          baseJoint: conflictSnap.serverRecord,
          forceOverwrite: true,
          auditEntries: [auditEntry],
          user: currentUser,
        }),
      });
      if (res.ok) {
        const out = await res.json();
        if (out?.savedJoint) {
          isApplyingServerStateRef.current = true;
          setJoints((prev) =>
            prev.map((j) => (j.id === out.savedJoint.id ? out.savedJoint : j))
          );
          setAuditLogs((prev) => [auditEntry, ...prev]);
          if (out.meta) setServerDbMeta(out.meta);
          setActiveConflict(null);
          window.setTimeout(() => {
            isApplyingServerStateRef.current = false;
          }, 60);
          return;
        }
      }
    } catch {
      // fallback below
    }

    const nextJoint: WeldJoint = {
      ...clientJoint,
      version: conflictSnap.actualServerVersion + 1,
      updatedAt: nowIso,
      updatedBy: currentUser.fullName,
    };
    setJoints((prev) =>
      prev.map((j) => (j.id === nextJoint.id ? nextJoint : j))
    );
    setAuditLogs((prev) => [auditEntry, ...prev]);
    setActiveConflict(null);
  };

  // Интерактивный стенд проверки оптимистической блокировки (моделирует параллельную запись в SQLite и вызывает реальный HTTP 409)
  const handleTriggerSimulatedConflict = async (jointId: string) => {
    const targetJoint = joints.find((j) => j.id === jointId) || joints[0];
    if (!targetJoint) return;

    const baseSnapshot: WeldJoint = {
      ...targetJoint,
      version: targetJoint.version ?? 1,
    };
    const oldExpectedVersion = baseSnapshot.version ?? 1;

    try {
      // Шаг 1: фоновая транзакция в серверной СУБД от имени другого пользователя (увеличивает version на сервере до v+1)
      const simRes = await fetch('/api/db/simulate-conflict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jointId: baseSnapshot.id }),
      });

      let updatedServerJoint: WeldJoint | null = null;
      if (simRes.ok) {
        const simData = await simRes.json();
        updatedServerJoint = simData.serverJoint || null;
        if (simData.meta) setServerDbMeta(simData.meta);
      }

      // Шаг 2: текущий пользователь пытается сохранить свою правку со старым expectedVersion
      const competingClientJoint: WeldJoint = {
        ...baseSnapshot,
        preheatTemp: baseSnapshot.preheatTemp === '150' ? '180' : '150',
        updatedBy: currentUser.fullName,
        updatedAt: new Date().toISOString(),
      };

      const saveRes = await fetch('/api/db/joints/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: clientIdRef.current,
          joint: competingClientJoint,
          expectedVersion: oldExpectedVersion,
          baseJoint: baseSnapshot,
          forceOverwrite: false,
          user: currentUser,
        }),
      });

      const savePayload = await saveRes.json();
      if (saveRes.status === 409 && savePayload?.conflict) {
        if (updatedServerJoint) {
          isApplyingServerStateRef.current = true;
          setJoints((prev) =>
            prev.map((j) =>
              j.id === updatedServerJoint!.id ? updatedServerJoint! : j
            )
          );
          window.setTimeout(() => {
            isApplyingServerStateRef.current = false;
          }, 60);
        }
        setIsServerDbModalOpen(false);
        setActiveConflict(savePayload.conflict);
        return;
      }
    } catch {
      // fallback to local engine if server unreachable
    }

    // Локальный расчёт конфликта, если запрос не прошёл
    const simulatedServerRecord: WeldJoint = {
      ...baseSnapshot,
      version: oldExpectedVersion + 1,
      vikResult: baseSnapshot.vikResult === 'Годен' ? 'Ремонт' : 'Годен',
      ndtReportNumber: `УЗК-СИМ-${new Date().toISOString().slice(11, 19)}`,
      updatedBy: 'Громов И.А. (параллельная сессия)',
      updatedAt: new Date().toISOString(),
    };
    const competingClientJoint: WeldJoint = {
      ...baseSnapshot,
      preheatTemp: baseSnapshot.preheatTemp === '150' ? '180' : '150',
      updatedBy: currentUser.fullName,
    };
    const localSim = applyOptimisticJointSave({
      currentJoints: joints.map((j) =>
        j.id === simulatedServerRecord.id ? simulatedServerRecord : j
      ),
      incomingJoint: competingClientJoint,
      expectedVersion: oldExpectedVersion,
      baseJoint: baseSnapshot,
      user: currentUser,
      fieldLabels: FIELD_LABELS_MAP,
      timestampIso: new Date().toISOString(),
    });
    if (localSim.status === 'conflict') {
      setIsServerDbModalOpen(false);
      setActiveConflict(localSim.conflict);
    }
  };

  // Удаление стыка (переименование запрещено, разрешено только добавление или удаление)
  const handleDeleteJointFromPassport = (jointToDelete: WeldJoint) => {
    recordUndoSnapshot(`Удаление стыка № ${jointToDelete.jointNumber}`);
    const nowIso = new Date().toISOString();
    setJoints((prev) => prev.filter((j) => j.id !== jointToDelete.id));
    setSelectedJointIds((prev) => prev.filter((id) => id !== jointToDelete.id));

    const deleteLog: AuditLogEntry = {
      id: `aud-del-${Date.now()}`,
      timestamp: nowIso,
      userLogin: currentUser.login,
      userFullName: currentUser.fullName,
      userRole: currentUser.role,
      jointId: jointToDelete.id,
      jointNumber: jointToDelete.jointNumber,
      uniqueLineId: jointToDelete.uniqueLineId,
      rdCode: jointToDelete.rdCode,
      fieldKey: 'jointNumber',
      fieldLabel: 'Удалён сварной стык из реестра',
      oldValue: `Стык № ${jointToDelete.jointNumber} (${jointToDelete.uniqueLineId}, Ø${jointToDelete.diameterMm}×${jointToDelete.wallThickness})`,
      newValue: 'Удалён',
      operationType: 'delete_joint',
    };
    setAuditLogs((prev) => [deleteLog, ...prev]);
  };

  // Импорт массива стыков из Excel с автопривязкой к данным других разделов
  const handleImportJoints = (newJoints: WeldJoint[], sourceFileName: string) => {
    recordUndoSnapshot(`Импорт стыков из Excel (${newJoints.length} шт.)`);
    const nowIso = new Date().toISOString();

    setJoints((prev) => [...newJoints, ...prev]);

    const batchLogs: AuditLogEntry[] = newJoints.map((j, i) => ({
      id: `aud-imp-${Date.now()}-${i}`,
      timestamp: nowIso,
      userLogin: currentUser.login,
      userFullName: currentUser.fullName,
      userRole: currentUser.role,
      jointId: j.id,
      jointNumber: j.jointNumber,
      uniqueLineId: j.uniqueLineId,
      rdCode: j.rdCode,
      fieldKey: 'jointNumber',
      fieldLabel: 'Импорт из Excel',
      oldValue: '—',
      newValue: `Файл «${sourceFileName}»: стык № ${j.jointNumber} (${j.rdCode}, линия ${j.lineNumber}, Ø${j.diameterMm}×${j.wallThickness}, ${j.gostJointType})`,
      operationType: 'batch_upload',
    }));

    setAuditLogs((prev) => [...batchLogs, ...prev]);
  };

  // Быстрое создание дополнительного стыка (011, 012...) на основе выбранного стыка
  const handleQuickAddSupplementaryJoint = useCallback(
    (baseJoint?: WeldJoint) => {
      const refJoint = baseJoint || filteredAndSortedJoints[0] || joints[0];
      if (!refJoint) return;

      const lineJointNumbers = joints
        .filter((j) => j.uniqueLineId === refJoint.uniqueLineId)
        .map((j) => j.jointNumber);

      const nextSuppNumber = suggestNextJointNumber(
        lineJointNumbers,
        refJoint.jointNumber
      );

      const draftSupp: WeldJoint = {
        ...refJoint,
        id: `j-supp-${Date.now()}`,
        jointNumber: nextSuppNumber,
        isSupplementary: true,
        weldingDate: new Date().toISOString().slice(0, 10),
        ambientTemp: siteWeather.tempC,
        vikResult: 'В работе',
        ndtResult: 'Не проводился',
        dupNdtResult: 'Не проводился',
      };

      setPassportModal({
        isOpen: true,
        mode: 'create',
        joint: draftSupp,
      });
    },
    [filteredAndSortedJoints, joints, siteWeather.tempC]
  );

  // Применение массового редактирования (за исключением номера стыка) с учётом Field-Level RBAC
  const handleApplyBulkUpdate = (rawPatch: Partial<WeldJoint>) => {
    const patch = filterBulkPatchByRole(rawPatch, currentUser);
    if (Object.keys(patch).length === 0) return;
    recordUndoSnapshot(
      `Массовое редактирование (${selectedJointIds.length} ст.)`
    );
    const { updatedJoints, auditEntries } = applyBulkUpdateToJoints(
      joints,
      selectedJointIds,
      patch,
      currentUser,
      FIELD_LABELS_MAP
    );
    setJoints(updatedJoints);
    if (auditEntries.length > 0) {
      setAuditLogs((prev) => [...auditEntries, ...prev]);
    }
    setSelectedJointIds([]);
  };

  // ============================================================================
  // ФУНКЦИИ УДАЛЕНИЯ ЛЮБОГО ЭЛЕМЕНТА СИСТЕМЫ + БЭКАП + ОБНУЛЕНИЕ (ЧИСТЫЙ ЛИСТ)
  // ============================================================================

  // 1. Удаление пользователя (учётной записи)
  const handleDeleteUserAccount = (loginToDelete: string) => {
    if (userAccounts.length <= 1) return;
    const targetAcc = userAccounts.find((a) => a.login === loginToDelete);
    if (!targetAcc) return;

    const nextAccounts = userAccounts.filter((a) => a.login !== loginToDelete);
    setUserAccounts(nextAccounts);
    if (currentUser.login === loginToDelete && nextAccounts[0]) {
      setCurrentUser(nextAccounts[0]);
    }
    appendSystemAuditEntry(
      'Удаление',
      'Учётные записи пользователей',
      targetAcc.login,
      'Удаление пользователя из системы',
      `${targetAcc.fullName} (${targetAcc.role}, ${targetAcc.department})`,
      'Удалён',
      'sys-auth-del'
    );
  };

  // 1а. Полная очистка журнала аудита (доступна строго только Системному администратору)
  const handleClearAuditLogs = () => {
    if (userPermissions.category !== 'admin') return;
    recordUndoSnapshot(`Очистка журнала аудита (${auditLogs.length} зап.)`);
    setAuditLogs([]);
  };

  // 1б. Смена пароля учётной записи администратора
  const handleChangeAdminPassword = (
    adminLogin: string,
    currentPassword: string,
    newPassword: string
  ): { ok: boolean; message: string } => {
    const targetAcc = userAccounts.find(
      (a) => a.login.toLowerCase() === adminLogin.trim().toLowerCase()
    );
    if (!targetAcc) {
      return {
        ok: false,
        message: `Учётная запись администратора «${adminLogin}» не найдена`,
      };
    }
    if (getUserRolePermissions(targetAcc).category !== 'admin') {
      return {
        ok: false,
        message: 'Выбранная учётная запись не обладает правами администратора',
      };
    }
    const isPasswordValid = verifyPassword(
      currentPassword,
      targetAcc.passwordHash || targetAcc.password || '',
      targetAcc.passwordSalt
    );
    if (!isPasswordValid) {
      return {
        ok: false,
        message: 'Неверно указан действующий пароль администратора',
      };
    }
    if (newPassword.trim().length < 3) {
      return {
        ok: false,
        message: 'Новый пароль должен содержать не менее 3 символов',
      };
    }

    const hashed = hashPasswordWithSalt(newPassword.trim());
    const updatedAcc: UserAccount = {
      ...targetAcc,
      password: newPassword.trim(),
      passwordHash: hashed.hash,
      passwordSalt: hashed.salt,
    };

    setUserAccounts((prev) =>
      prev.map((a) => (a.login === targetAcc.login ? updatedAcc : a))
    );
    if (currentUser.login === targetAcc.login) {
      setCurrentUser(updatedAcc);
    }

    appendSystemAuditEntry(
      'Редактирование',
      'Безопасность / Администратор',
      targetAcc.login,
      'Смена пароля учётной записи администратора',
      'Пароль (***)',
      'Новый защищённый пароль установлен (***)',
      'sys-admin-pwd'
    );

    return {
      ok: true,
      message: `Пароль администратора «${targetAcc.login}» успешно изменён`,
    };
  };

  // 1в. Назначение и отзыв прав администратора отдельным пользователям
  const handleToggleAdminRights = (
    targetLogin: string,
    grantAdmin: boolean
  ): { ok: boolean; message: string } => {
    if (userPermissions.category !== 'admin') {
      return {
        ok: false,
        message: 'Только действующий администратор имеет право изменять полномочия пользователей',
      };
    }
    const targetAcc = userAccounts.find(
      (a) => a.login.toLowerCase() === targetLogin.trim().toLowerCase()
    );
    if (!targetAcc) {
      return {
        ok: false,
        message: `Учётная запись «${targetLogin}» не найдена`,
      };
    }

    if (!grantAdmin) {
      const remainingAdmins = userAccounts.filter(
        (a) =>
          a.login.toLowerCase() !== targetLogin.trim().toLowerCase() &&
          getUserRolePermissions(a).category === 'admin'
      );
      if (remainingAdmins.length === 0) {
        return {
          ok: false,
          message: 'Нельзя отозвать права у единственного администратора системы',
        };
      }
    }

    const updatedRole = grantAdmin
      ? targetAcc.role.toLowerCase().includes('администратор')
        ? targetAcc.role
        : `${targetAcc.role} / Администратор`
      : targetAcc.role.replace(/ \/ Администратор$/, '');

    const updatedAcc: UserAccount = {
      ...targetAcc,
      isAdmin: grantAdmin,
      role: updatedRole,
    };

    setUserAccounts((prev) =>
      prev.map((a) => (a.login === targetAcc.login ? updatedAcc : a))
    );
    if (currentUser.login === targetAcc.login) {
      setCurrentUser(updatedAcc);
    }

    appendSystemAuditEntry(
      'Редактирование',
      'Безопасность / Права доступа',
      targetAcc.login,
      grantAdmin
        ? 'Назначение прав администратора'
        : 'Отзыв прав администратора',
      `Права доступа: ${targetAcc.isAdmin ? 'Администратор' : 'Пользователь'} (${targetAcc.role})`,
      `Права доступа: ${grantAdmin ? 'Администратор' : 'Пользователь'} (${updatedRole})`,
      'sys-admin-grant'
    );

    return {
      ok: true,
      message: grantAdmin
        ? `Пользователю «${targetAcc.fullName}» успешно предоставлены права администратора`
        : `Права администратора у пользователя «${targetAcc.fullName}» успешно отозваны`,
    };
  };

  // 2. Удаление объекта строительства (вместе с его линиями, стыками и привязанными позициями ЛРВ)
  const handleDeleteObject = (objectName: string) => {
    recordUndoSnapshot(`Удаление объекта «${objectName}»`);
    const objectRds = new Set(
      projectLineList
        .filter((l) => l.objectName === objectName)
        .map((l) => l.rdCode)
    );
    const removedLinesCount = projectLineList.filter(
      (l) => l.objectName === objectName
    ).length;
    const removedJointsCount = joints.filter(
      (j) => j.objectName === objectName
    ).length;

    const nextLines = projectLineList.filter((l) => l.objectName !== objectName);
    const remainingRds = new Set(nextLines.map((l) => l.rdCode));

    setProjectLineList(nextLines);
    setJoints((prev) => prev.filter((j) => j.objectName !== objectName));
    setLrvCatalog((prev) =>
      prev.filter(
        (item) =>
          item.objectName !== objectName &&
          !(objectRds.has(item.rdCode) && !remainingRds.has(item.rdCode))
      )
    );
    setSelectedJointIds([]);

    if (selectedObjectName === objectName) {
      const nextRemainingObj =
        nextLines[0]?.objectName || 'ALL';
      setSelectedObjectName(nextRemainingObj);
      setSelectedRdCode('ALL');
    }

    appendSystemAuditEntry(
      'Удаление',
      objectName,
      `${removedLinesCount} лин. / ${removedJointsCount} ст.`,
      'Удаление объекта строительства',
      `Объект «${objectName}» (линий: ${removedLinesCount}, стыков: ${removedJointsCount})`,
      'Удалён'
    );
  };

  // 3. Удаление шифра РД (вместе с его линиями, стыками и позициями ЛРВ)
  const handleDeleteRdCode = (rdCode: string, objectName?: string) => {
    recordUndoSnapshot(`Удаление шифра РД «${rdCode}»`);
    const matchesTarget = (l: { rdCode: string; objectName?: string }) =>
      l.rdCode === rdCode && (!objectName || l.objectName === objectName);

    const removedLinesCount = projectLineList.filter(matchesTarget).length;
    const removedJointsCount = joints.filter(matchesTarget).length;

    setProjectLineList((prev) => prev.filter((l) => !matchesTarget(l)));
    setJoints((prev) => prev.filter((j) => !matchesTarget(j)));
    setLrvCatalog((prev) => prev.filter((item) => !matchesTarget(item)));
    setSelectedJointIds([]);

    if (selectedRdCode === rdCode) {
      setSelectedRdCode('ALL');
    }

    appendSystemAuditEntry(
      'Удаление',
      rdCode,
      `${removedLinesCount} лин. / ${removedJointsCount} ст.`,
      'Удаление шифра рабочей документации (РД)',
      `Шифр РД «${rdCode}»${objectName ? ` (${objectName})` : ''}`,
      'Удалён'
    );
  };

  // 4. Удаление линий трубопровода из лайнлиста
  const handleDeleteLineItems = (lineIds: string[]) => {
    if (lineIds.length === 0) return;
    const idSet = new Set(lineIds);
    const linesToDelete = projectLineList.filter((l) => idSet.has(l.id));
    if (linesToDelete.length === 0) return;

    recordUndoSnapshot(`Удаление линий из лайнлиста (${linesToDelete.length} шт.)`);
    const uniqueLineIdsToDelete = new Set(
      linesToDelete.map((l) => l.uniqueLineId)
    );

    setProjectLineList((prev) => prev.filter((l) => !idSet.has(l.id)));
    setJoints((prev) =>
      prev.filter((j) => !uniqueLineIdsToDelete.has(j.uniqueLineId))
    );
    setSelectedJointIds([]);

    appendSystemAuditEntry(
      'Удаление',
      linesToDelete[0]?.uniqueLineId || 'Проект (лайнлист)',
      `${linesToDelete.length} лин.`,
      'Удаление линий из Проекта (лайнлист)',
      linesToDelete
        .map((l) => l.uniqueLineId)
        .slice(0, 6)
        .join(', '),
      'Удалены'
    );
  };

  // 5. Удаление сварщика или бригады из реестра НАКС
  const handleDeleteWelder = (stamp: string) => {
    const target = welders.find((w) => w.stamp === stamp);
    if (!target) return;
    recordUndoSnapshot(`Удаление сварщика / клейма «${stamp}»`);
    setWelders((prev) => prev.filter((w) => w.stamp !== stamp));
    appendSystemAuditEntry(
      'Удаление',
      'Технология сварки (НАКС)',
      stamp,
      'Удаление сварщика / бригадного клейма',
      `${target.stamp} — ${target.fullName} (${target.certNumber})`,
      'Удалён'
    );
  };

  // 6. Удаление технологической карты (ТК)
  const handleDeleteTechCard = (id: string) => {
    const target = techCards.find((tc) => tc.id === id);
    if (!target) return;
    recordUndoSnapshot(`Удаление техкарты «${target.number}»`);
    setTechCards((prev) => prev.filter((tc) => tc.id !== id));
    appendSystemAuditEntry(
      'Удаление',
      'Технология сварки (ТК)',
      target.number,
      'Удаление технологической карты (ТК)',
      `${target.number} — ${target.title}`,
      'Удалена'
    );
  };

  // 7. Удаление сварочного материала (сертификата СМ)
  const handleDeleteWeldingMaterial = (id: string) => {
    const target = weldingMaterials.find((m) => m.id === id);
    if (!target) return;
    recordUndoSnapshot(`Удаление СМ «${target.brandAndDiameter}»`);
    setWeldingMaterials((prev) => prev.filter((m) => m.id !== id));
    appendSystemAuditEntry(
      'Удаление',
      'Технология сварки (СМ)',
      target.certificateNumber,
      'Удаление сертификата сварочных материалов',
      `${target.brandAndDiameter} (партия ${target.batchNumber})`,
      'Удалён'
    );
  };

  // 8. Удаление материала (позиций) в каталоге ЛРВ
  const handleDeleteLrvItems = (ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const itemsToDelete = lrvCatalog.filter((item) => idSet.has(item.id));
    if (itemsToDelete.length === 0) return;

    recordUndoSnapshot(`Удаление материалов из ЛРВ (${itemsToDelete.length} поз.)`);
    setLrvCatalog((prev) => prev.filter((item) => !idSet.has(item.id)));
    appendSystemAuditEntry(
      'Удаление',
      itemsToDelete[0]?.rdCode || 'Каталог ЛРВ',
      `${itemsToDelete.length} поз.`,
      'Удаление позиций из Каталога ЛРВ',
      itemsToDelete
        .map((i) => `${i.lrvCode} (${i.shortName})`)
        .slice(0, 6)
        .join(', '),
      'Удалены'
    );
  };

  // 9. Массовое удаление выбранных сварных стыков из Реестра
  const handleBulkDeleteSelectedJoints = useCallback(() => {
    if (selectedJointIds.length === 0) return;
    const idSet = new Set(selectedJointIds);
    const removedJoints = joints.filter((j) => idSet.has(j.id));
    if (removedJoints.length === 0) return;

    recordUndoSnapshot(`Массовое удаление стыков (${removedJoints.length} шт.)`);
    setJoints((prev) => prev.filter((j) => !idSet.has(j.id)));
    setSelectedJointIds([]);
    setConfirmBulkDeleteJoints(false);

    appendSystemAuditEntry(
      'Удаление',
      removedJoints[0]?.uniqueLineId || 'Реестр стыков',
      `${removedJoints.length} ст.`,
      'Массовое удаление сварных стыков',
      removedJoints
        .map((j) => `№${j.jointNumber} (${j.uniqueLineId})`)
        .slice(0, 6)
        .join(', '),
      'Удалены'
    );
  }, [selectedJointIds, joints]);

  // 10. Восстановление полного функционала и данных из резервной копии (.JSON Бэкап)
  const handleRestoreFullBackup = (payload: FullSystemBackupPayload) => {
    const data = payload.data;
    recordUndoSnapshot('Восстановление базы данных из резервной копии (Бэкап)');
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
      if (matchedTpl) {
        setActiveTemplateId(matchedTpl.id);
        setColumnOrder([...matchedTpl.columnOrder]);
        setVisibleColumns([...matchedTpl.visibleColumns]);
      }
    } else if (typeof data.activeTemplateId === 'string') {
      setActiveTemplateId(data.activeTemplateId);
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
      fieldLabel: 'Восстановление полного состояния из Бэкапа (.JSON)',
      oldValue: 'Предыдущее состояние',
      newValue: `Стыков: ${data.joints?.length ?? 0}, Линий: ${
        data.projectLineList?.length ?? 0
      }, ЛРВ: ${data.lrvCatalog?.length ?? 0}, НАКС: ${
        data.welders?.length ?? 0
      }, ТК: ${data.techCards?.length ?? 0}`,
      operationType: 'batch_upload',
    };
    const baseLogs = Array.isArray(data.auditLogs) ? data.auditLogs : [];
    setAuditLogs([restoreAuditEntry, ...baseLogs]);
  };

  // 11. Скрытое авторское обнуление программы («Чистый лист»)
  const handleAuthorZeroReset = (keepAdminUser: boolean) => {
    const cleanAdminAccount: UserAccount = {
      login: 'admin_pto',
      password: '123',
      fullName: 'Администратор системы',
      role: 'Системный администратор (Полный доступ)',
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

  // 12. Авторский возврат демонстрационной базы по умолчанию
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

  // 13. Ленивая подгрузка демонстрационного массива Харасавэй (1271 стык)
  const [isLoadingDemoDataset, setIsLoadingDemoDataset] = useState(false);
  const handleLoadKharasaveyDemo = async () => {
    try {
      setIsLoadingDemoDataset(true);
      const mod = await import('./data/kharasaveyDemoData');
      const data = {
        joints: mod.KHARASAVEY_JOINTS,
        projectLineList: mod.KHARASAVEY_LINES,
        lrvCatalog: mod.KHARASAVEY_LRV,
      };
      recordUndoSnapshot('Загрузка демонстрационного массива Харасавэй (1271 стык)');

      setJoints((prev) => {
        const existingIds = new Set(prev.map((j) => j.id));
        const newJoints = data.joints.filter((j) => !existingIds.has(j.id));
        return [...prev, ...newJoints];
      });
      setLrvCatalog((prev) => {
        const existingCodes = new Set(prev.map((l) => l.lrvCode));
        const newLrv = data.lrvCatalog.filter((l) => !existingCodes.has(l.lrvCode));
        return [...prev, ...newLrv];
      });
      setProjectLineList((prev) => {
        const existingIds = new Set(prev.map((l) => l.uniqueLineId));
        const newLines = data.projectLineList.filter((l) => !existingIds.has(l.uniqueLineId));
        return [...prev, ...newLines];
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
  const handleSetConfirmBulkDeleteJoints = useCallback((val: boolean) => setConfirmBulkDeleteJoints(val), []);
  const handleOpenBulkEdit = useCallback(() => {
    if (selectedJointIds.length === 0) {
      const ids = filteredAndSortedJoints.map((j) => j.id);
      setSelectedJointIds(ids);
    }
    setIsBulkEditOpen(true);
  }, [selectedJointIds, filteredAndSortedJoints]);
  const handleOpenImportExcel = useCallback(() => setIsImportExcelOpen(true), []);
  const handleOpenCreatePassport = useCallback(
    () => setPassportModal({ isOpen: true, mode: 'create', joint: null }),
    []
  );
  const handleOpenEditPassport = useCallback(
    (joint: WeldJoint) => setPassportModal({ isOpen: true, mode: 'edit', joint }),
    []
  );
  const handleOpenColumnsModal = useCallback(() => setIsColumnsModalOpen(true), []);
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

  const renderStatusText = (val: string) => {
    if (val === 'Годен') {
      return <span className="font-semibold text-emerald-700">Годен</span>;
    }
    if (val === 'Ремонт' || val === 'Вырезать') {
      return <span className="font-bold text-red-700">{val}</span>;
    }
    if (val === 'В работе') {
      return <span className="font-medium text-amber-700">В работе</span>;
    }
    return <span className="text-slate-400">{val || '—'}</span>;
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f4f7fb] text-slate-900">
      {/* ЧЕРДАК ИНТЕРФЕЙСА: КЛАССИЧЕСКИЙ СИНИЙ #1e3799 */}
      <header className="sticky top-0 z-30 bg-[#1e3799] text-white border-b border-sky-400/20 shadow-md no-print">
        <div className="max-w-[1920px] mx-auto px-4 py-2 flex items-center justify-between gap-4">
          {/* Левый верхний угол: Фирменный логотип zaychick (5 кликов открывают скрытую Консоль Автора) */}
          <div
            onClick={handleHeaderLogoSecretClick}
            className="flex items-center min-w-0 shrink-0 cursor-pointer select-none"
            title="zaychick"
          >
            <ZaychickLogo variant="header" size={38} />
          </div>

          {/* Середина чердака: Название текущего раздела шрифтом Century Gothic */}
          <div className="flex items-center justify-center flex-1 min-w-0 px-2 text-center">
            <div className="inline-flex items-center justify-center gap-2 max-w-full">
              {sectionIcons[activeSection]}
              <h1
                className="text-xs sm:text-sm md:text-base font-bold text-white uppercase tracking-wider truncate font-century-gothic"
                style={{ fontFamily: '"Jost", "Century Gothic", CenturyGothic, AppleGothic, sans-serif' }}
              >
                {sectionLabels[activeSection]?.toUpperCase()}
              </h1>
            </div>
          </div>

          {/* Правый верхний угол: Иконочные кнопки Undo / Redo и Кнопка-бутерброд */}
          <div className="flex items-center gap-2 shrink-0">
            <div
              className="flex items-center gap-1 bg-white/10 border border-sky-300/30 rounded-lg p-1"
              role="group"
              aria-label="Отмена и повтор действий (до 10 шагов)"
            >
              <button
                type="button"
                onClick={handleUndo}
                disabled={undoStack.length === 0}
                aria-label="Отменить действие (Undo)"
                title={
                  undoStack.length > 0
                    ? `Отменить: ${
                        undoStack[undoStack.length - 1]?.actionLabel || ''
                      } (Ctrl+Z)`
                    : 'Нет действий для отмены (Ctrl+Z)'
                }
                className="p-1.5 rounded text-white hover:bg-white/20 disabled:opacity-35 disabled:hover:bg-transparent transition-colors cursor-pointer"
              >
                <Undo2 className="w-4 h-4 text-sky-200" />
              </button>

              <button
                type="button"
                onClick={handleRedo}
                disabled={redoStack.length === 0}
                aria-label="Повторить действие (Redo)"
                title={
                  redoStack.length > 0
                    ? `Повторить: ${
                        redoStack[redoStack.length - 1]?.actionLabel || ''
                      } (Ctrl+Y)`
                    : 'Нет действий для повтора (Ctrl+Y)'
                }
                className="p-1.5 rounded text-white hover:bg-white/20 disabled:opacity-35 disabled:hover:bg-transparent transition-colors cursor-pointer"
              >
                <Redo2 className="w-4 h-4 text-sky-200" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              aria-label="Открыть меню выбора объекта и раздела программы"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-sky-300/30 text-white text-xs font-semibold transition-colors shrink-0 cursor-pointer"
            >
              <Menu className="w-5 h-5 text-sky-300" />
              <span className="hidden sm:inline">Меню</span>
            </button>
          </div>
        </div>
      </header>

      {/* Боковое меню в кнопке-бутерброде */}
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
        onExportAllJoints={(fmt) => exportAllJointsToFile(joints, fmt)}
        onOpenFacilityLocation={(objName) => setLocationModalFacilityName(objName)}
        onOpenBackupModal={() =>
          setBackupModalState({ isOpen: true, initialTab: 'backup' })
        }
        onOpenAuthorResetModal={() =>
          setBackupModalState({ isOpen: true, initialTab: 'author_reset' })
        }
        onDeleteObject={handleDeleteObject}
        onDeleteRdCode={handleDeleteRdCode}
        onCreateObject={handleCreateStandaloneObject}
        dbRevision={serverDbMeta?.globalRevision ?? 1}
        isDbConnected={isDbConnected}
        onOpenServerDbModal={() => setIsServerDbModalOpen(true)}
      />

      {/* ОСНОВНАЯ РАБОЧАЯ ОБЛАСТЬ */}
      <main className="flex-1 max-w-[1920px] w-full mx-auto p-3 sm:p-4 space-y-3">
        {/* Баннер ленивой загрузки демо-массива Харасавэя при отсутствии стыков по выбранному объекту */}
        {selectedObjectName === 'УКПГ-1С Харасавэйское ГКМ' &&
          joints.filter((j) => j.objectName === 'УКПГ-1С Харасавэйское ГКМ').length === 0 && (
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

        {/* РАЗДЕЛ 1: РЕЕСТР СТЫКОВ И ТАБЛИЦА ВНЕСЕНИЯ ДАННЫХ (ДЕКОМПОЗИЦИЯ + ВИРТУАЛИЗАЦИЯ СТРОК) */}
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
            onBulkDeleteSelectedJoints={handleBulkDeleteSelectedJoints}
            onOpenBulkEdit={handleOpenBulkEdit}
            onQuickAddSupplementaryJoint={handleQuickAddSupplementaryJoint}
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

        {/* РАЗДЕЛ 1А: ПРОЕКТ (ЛАЙНЛИСТ) */}
        {activeSection === 'project_linelist' && (
          <ProjectLineListView
            lineList={projectLineList}
            joints={joints}
            facilities={derivedFacilities}
            selectedObjectName={selectedObjectName}
            selectedRdCode={selectedRdCode}
            canEdit={userPermissions.canEditLineList}
            currentUserRoleLabel={userPermissions.categoryLabel}
            onAddLineItems={(newItems) => {
              recordUndoSnapshot(`Добавление линий в лайнлист (${newItems.length} шт.)`);
              setProjectLineList((prev) => [...newItems, ...prev]);
              appendSystemAuditEntry(
                'Создание стыка',
                newItems[0]?.uniqueLineId || 'Проект (лайнлист)',
                `${newItems.length} лин.`,
                'Добавление линий в Проект (лайнлист)',
                '—',
                newItems.map((i) => i.uniqueLineId).slice(0, 5).join(', ')
              );
            }}
            onUpdateLineItem={(updated, previousItem, cascadeRename = true) => {
              recordUndoSnapshot(`Редактирование линии ${updated.lineNumber}`);
              appendSystemAuditEntry(
                'Редактирование',
                updated.uniqueLineId,
                updated.lineNumber,
                'Редактирование линии в Проекте (лайнлист)',
                previousItem ? `${previousItem.rdCode} / ${previousItem.lineNumber}` : '—',
                `${updated.rdCode} / ${updated.lineNumber}`
              );
              const objChanged =
                previousItem && previousItem.objectName !== updated.objectName;
              const rdChanged =
                previousItem && previousItem.rdCode !== updated.rdCode;
              const contourChanged =
                previousItem && previousItem.testContour !== updated.testContour;

              const nextLineList = projectLineList.map((it) => {
                if (it.id === updated.id) return updated;
                if (!cascadeRename || !previousItem) return it;

                const nextObj =
                  objChanged && it.objectName === previousItem.objectName
                    ? updated.objectName
                    : it.objectName;
                const nextRd =
                  rdChanged && it.rdCode === previousItem.rdCode
                    ? updated.rdCode
                    : it.rdCode;
                const nextContour =
                  contourChanged &&
                  it.testContour === previousItem.testContour &&
                  (it.rdCode === previousItem.rdCode || nextRd === updated.rdCode)
                    ? updated.testContour
                    : it.testContour;

                if (
                  nextObj === it.objectName &&
                  nextRd === it.rdCode &&
                  nextContour === it.testContour
                ) {
                  return it;
                }

                return {
                  ...it,
                  objectName: nextObj,
                  rdCode: nextRd,
                  testContour: nextContour,
                  uniqueLineId: buildUniqueLineId(nextRd, it.lineNumber),
                };
              });

              setProjectLineList(nextLineList);

              if (previousItem) {
                const prevLinesByUniqueId = new Map(
                  projectLineList.map((l) => [l.uniqueLineId, l])
                );
                const nextLinesById = new Map(
                  nextLineList.map((l) => [l.id, l])
                );

                setJoints((prevJoints) =>
                  prevJoints.map((j) => {
                    const matchedOldLine =
                      prevLinesByUniqueId.get(j.uniqueLineId) ||
                      projectLineList.find(
                        (l) =>
                          l.rdCode === j.rdCode && l.lineNumber === j.lineNumber
                      );
                    if (matchedOldLine) {
                      const nextLine = nextLinesById.get(matchedOldLine.id);
                      if (nextLine) {
                        return {
                          ...j,
                          objectName: nextLine.objectName,
                          rdCode: nextLine.rdCode,
                          lineNumber: nextLine.lineNumber,
                          uniqueLineId: nextLine.uniqueLineId,
                          contour: nextLine.testContour,
                        };
                      }
                    }
                    return j;
                  })
                );

                if (cascadeRename && rdChanged) {
                  setLrvCatalog((prevCatalog) =>
                    prevCatalog.map((item) =>
                      item.rdCode === previousItem.rdCode
                        ? { ...item, rdCode: updated.rdCode }
                        : item
                    )
                  );
                  if (selectedRdCode === previousItem.rdCode) {
                    setSelectedRdCode(updated.rdCode);
                  }
                }
                if (cascadeRename && objChanged && selectedObjectName === previousItem.objectName) {
                  setSelectedObjectName(updated.objectName);
                }
              }
            }}
            onBulkUpdateLineItems={(selectedIds, patch) => {
              recordUndoSnapshot(
                `Групповое ред. лайнлиста (${selectedIds.length} стр.)`
              );
              const selectedOldLines = projectLineList.filter((l) =>
                selectedIds.includes(l.id)
              );
              const prevLinesMap = new Map(
                selectedOldLines.map((l) => [l.uniqueLineId, l])
              );
              const nextLineList = applyBulkUpdateToLineList(
                projectLineList,
                selectedIds,
                patch
              );
              setProjectLineList(nextLineList);

              if (
                patch.objectName !== undefined ||
                patch.rdCode !== undefined ||
                patch.testContour !== undefined
              ) {
                setJoints((prevJoints) =>
                  prevJoints.map((j) => {
                    const oldLine =
                      prevLinesMap.get(j.uniqueLineId) ||
                      selectedOldLines.find(
                        (l) =>
                          l.rdCode === j.rdCode && l.lineNumber === j.lineNumber
                      );
                    if (!oldLine) return j;
                    const updatedLine = nextLineList.find((l) => l.id === oldLine.id);
                    if (!updatedLine) return j;
                    return {
                      ...j,
                      objectName: updatedLine.objectName,
                      rdCode: updatedLine.rdCode,
                      uniqueLineId: updatedLine.uniqueLineId,
                      contour: updatedLine.testContour,
                    };
                  })
                );
              }

              if (patch.rdCode) {
                const newRd = patch.rdCode;
                const oldRdsReplaced = new Set(
                  selectedOldLines
                    .map((l) => l.rdCode)
                    .filter(
                      (oldRd) =>
                        oldRd !== newRd &&
                        !nextLineList.some((nl) => nl.rdCode === oldRd)
                    )
                );
                if (oldRdsReplaced.size > 0) {
                  setLrvCatalog((prevCatalog) =>
                    prevCatalog.map((item) =>
                      oldRdsReplaced.has(item.rdCode)
                        ? { ...item, rdCode: newRd }
                        : item
                    )
                  );
                  if (oldRdsReplaced.has(selectedRdCode)) {
                    setSelectedRdCode(newRd);
                  }
                }
              }
              if (patch.objectName) {
                const newObj = patch.objectName;
                const oldObjsReplaced = new Set(
                  selectedOldLines
                    .map((l) => l.objectName)
                    .filter(
                      (oldObj) =>
                        oldObj !== newObj &&
                        !nextLineList.some((nl) => nl.objectName === oldObj)
                    )
                );
                if (oldObjsReplaced.has(selectedObjectName)) {
                  setSelectedObjectName(newObj);
                }
              }
            }}
            onOpenLineInRegistry={(uniqueLineId) => {
              setSelectedObjectName('ALL');
              setSelectedRdCode('ALL');
              setColumnFilters({ uniqueLineId: [uniqueLineId] });
              setActiveSection('registry');
            }}
            onOpenFacilityLocation={(objName) =>
              setLocationModalFacilityName(objName)
            }
            onDeleteLineItems={handleDeleteLineItems}
            onDeleteObject={handleDeleteObject}
            onDeleteRdCode={handleDeleteRdCode}
          />
        )}

        {/* РАЗДЕЛ 1Б: ТЕХНОЛОГИЯ СВАРОЧНОГО ПРОИЗВОДСТВА (СВАРЩИКИ, ТК, СВАРОЧНЫЕ МАТЕРИАЛЫ) */}
        {activeSection === 'welding_tech' && (
          <WeldingTechView
            welders={welders}
            techCards={techCards}
            materials={weldingMaterials}
            canEdit={userPermissions.canEditWeldingTech}
            currentUserRoleLabel={userPermissions.categoryLabel}
            onSaveWelder={(w) => {
              recordUndoSnapshot(`Сохранение сварщика / клейма ${w.stamp}`);
              setWelders((prev) =>
                prev.some((x) => (w.id && x.id === w.id) || x.stamp === w.stamp)
                  ? prev.map((x) =>
                      (w.id && x.id === w.id) || x.stamp === w.stamp ? w : x
                    )
                  : [w, ...prev]
              );
              appendSystemAuditEntry(
                'Редактирование',
                'Технология сварки (НАКС)',
                w.stamp,
                'Сохранение карточки сварщика / бригады',
                '—',
                `${w.stamp} — ${w.fullName} (${w.certNumber})`
              );
            }}
            onDeleteWelder={handleDeleteWelder}
            onSaveTechCard={(tc) => {
              recordUndoSnapshot(`Сохранение техкарты ${tc.number}`);
              setTechCards((prev) =>
                prev.some((x) => x.id === tc.id)
                  ? prev.map((x) => (x.id === tc.id ? tc : x))
                  : [tc, ...prev]
              );
              appendSystemAuditEntry(
                'Редактирование',
                'Технология сварки (ТК)',
                tc.number,
                'Сохранение технологической карты (WPS)',
                '—',
                `${tc.number} (${tc.weldingType}, Ø${tc.minDiameterMm}..${tc.maxDiameterMm})`
              );
            }}
            onDeleteTechCard={handleDeleteTechCard}
            onSaveMaterial={(mat) => {
              recordUndoSnapshot(`Сохранение СМ ${mat.brandAndDiameter}`);
              setWeldingMaterials((prev) =>
                prev.some((x) => x.id === mat.id)
                  ? prev.map((x) => (x.id === mat.id ? mat : x))
                  : [mat, ...prev]
              );
              appendSystemAuditEntry(
                'Редактирование',
                'Технология сварки (СМ)',
                mat.certificateNumber,
                'Сохранение сертификата сварочных материалов',
                '—',
                `${mat.brandAndDiameter} (партия ${mat.batchNumber})`
              );
            }}
            onDeleteMaterial={handleDeleteWeldingMaterial}
          />
        )}

        {/* РАЗДЕЛ 2: ЖУРНАЛЫ СВАРОЧНЫХ РАБОТ (СТО ГАЗПРОМ 15-1.1-002-2023 И ГОСТ 32569-2013) */}
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
            onEditJoint={(j) =>
              setPassportModal({
                isOpen: true,
                mode: 'edit',
                joint: j,
              })
            }
          />
        )}

        {/* РАЗДЕЛ 3: ОТЧЁТНОСТЬ ПО ГОТОВНОСТИ (ОБЪЕКТ, ШИФР РД, ЛИНИЯ, КОНТУР) */}
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

        {/* РАЗДЕЛ 4: КАТАЛОГ ЛРВ И СПЕЦИФИКАЦИИ (С ПРИВЯЗКОЙ К ШИФРУ РД) */}
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
            onAddLrvItems={(newItems) => {
              recordUndoSnapshot(`Добавление в каталог ЛРВ (${newItems.length} поз.)`);
              setLrvCatalog((prev) => [...newItems, ...prev]);
              appendSystemAuditEntry(
                'Создание стыка',
                newItems[0]?.rdCode || 'Каталог ЛРВ',
                `${newItems.length} поз.`,
                'Добавление позиций в Каталог ЛРВ',
                '—',
                newItems.map((i) => `${i.lrvCode} (${i.shortName})`).slice(0, 5).join(', ')
              );
            }}
            onUpdateLrvItem={(updatedItem) => {
              recordUndoSnapshot(`Редактирование позиции ЛРВ ${updatedItem.lrvCode}`);
              setLrvCatalog((prev) =>
                prev.map((item) => (item.id === updatedItem.id ? updatedItem : item))
              );
              if (updatedItem.status === 'superseded') {
                appendSystemAuditEntry(
                  'Аннулирование ЛРВ',
                  updatedItem.rdCode || 'Каталог ЛРВ',
                  updatedItem.lrvCode,
                  'Аннулирование (замена) позиции ЛРВ',
                  'Активна',
                  `Аннулирована. Основание: ${updatedItem.replacementLetter || 'Письмо согласования'} от ${updatedItem.replacementDate || '—'}`,
                  updatedItem.id,
                  'lrv_superseded'
                );
              } else {
                appendSystemAuditEntry(
                  'Редактирование',
                  updatedItem.rdCode || 'Каталог ЛРВ',
                  updatedItem.lrvCode,
                  'Редактирование позиции Каталога ЛРВ',
                  '—',
                  `${updatedItem.lrvCode} — ${updatedItem.shortName} (Ø${updatedItem.diameterMm}×${updatedItem.wallThickness}, ${updatedItem.material})`
                );
              }
            }}
            onDeleteLrvItems={handleDeleteLrvItems}
          />
        )}

        {/* РАЗДЕЛ 5: ЖУРНАЛ ИЗМЕНЕНИЙ (АУДИТ) */}
        {activeSection === 'audit_log' && (
          <AuditHistoryView
            logs={auditLogs}
            isAdmin={userPermissions.category === 'admin'}
            onClearAuditLog={handleClearAuditLogs}
            onOpenAdminPasswordModal={() => {
              setLoginModalInitialMode('admin_password');
              setIsLoginModalOpen(true);
            }}
          />
        )}

        {/* РАЗДЕЛ 6: РУКОВОДСТВО ПОЛЬЗОВАТЕЛЯ (СТИЛЬНЫЙ БУКЛЕТ PDF ПО РОЛЯМ) */}
        {activeSection === 'user_guide' && <UserGuideBookletView />}
      </main>

      {/* МОДАЛЬНЫЕ ОКНА */}
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
        onSaveNewTemplate={handleSaveNewTemplate}
        onDeleteTemplate={handleDeleteTemplate}
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
        onApplyBulkUpdate={handleApplyBulkUpdate}
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
        onSave={handleSaveJointFromPassport}
        onNavigateJoint={(target) =>
          setPassportModal((prev) => ({
            ...prev,
            joint: target,
          }))
        }
        onDeleteJoint={handleDeleteJointFromPassport}
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
        onImportJoints={handleImportJoints}
      />

      <FacilityLocationModal
        isOpen={Boolean(locationModalFacilityName)}
        facility={activeLocationFacility}
        facilities={derivedFacilities}
        presets={FACILITY_LOCATION_PRESETS}
        joints={joints}
        customStations={activeLocationFacility?.customWeatherStations}
        onSaveLocation={handleSaveFacilityLocation}
        onBulkUpdateJoints={handleBulkUpdateJointsTemperaturesFromStation}
        onClose={() => setLocationModalFacilityName(null)}
      />

      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        currentUser={currentUser}
        accounts={userAccounts}
        initialMode={loginModalInitialMode}
        onChangeAdminPassword={handleChangeAdminPassword}
        onToggleAdminRights={handleToggleAdminRights}
        onRegisterAccount={(newAcc) => {
          setUserAccounts((prev) => [...prev, newAcc]);
          const entry: AuditLogEntry = {
            id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: new Date().toISOString(),
            userLogin: newAcc.login,
            userFullName: newAcc.fullName,
            userRole: newAcc.role,
            jointId: 'sys-auth',
            uniqueLineId: 'Регистрация пользователя',
            jointNumber: `Сессия #${newAcc.sessionNumber}`,
            rdCode: newAcc.department,
            fieldKey: 'auth_register',
            fieldLabel: 'Регистрация новой учётной записи',
            oldValue: '—',
            newValue: `${newAcc.fullName} (${newAcc.login}, ${newAcc.role})`,
            operationType: 'user_created',
          };
          setAuditLogs((prev) => [entry, ...prev]);
        }}
        onDeleteAccount={handleDeleteUserAccount}
        onAuthenticate={(acc, inputPassword) => {
          setCurrentUser(acc);
          const pwd = inputPassword || acc.password || '123';
          fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login: acc.login, password: pwd }),
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
              if (data?.token) {
                setSessionToken(data.token);
                try {
                  localStorage.setItem('zaychick_session_token', data.token);
                } catch {}
              }
            })
            .catch(() => {});
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

      {/* Модальное окно мониторинга единой серверной СУБД SQLite и стенда OCC */}
      <ServerDbStatusModal
        isOpen={isServerDbModalOpen}
        onClose={() => setIsServerDbModalOpen(false)}
        dbMeta={serverDbMeta}
        isConnected={isDbConnected}
        isSyncing={isDbSyncing}
        joints={scopedJoints.length > 0 ? scopedJoints : joints}
        onRefreshFromServer={() => fetchServerDbState(false)}
        onTriggerSimulatedConflict={handleTriggerSimulatedConflict}
      />

      {/* Модальное окно разрешения конфликта оптимистической блокировки (HTTP 409 Conflict) */}
      <OptimisticConflictModal
        conflict={activeConflict}
        onClose={() => setActiveConflict(null)}
        onAcceptServerVersion={handleAcceptServerConflictVersion}
        onApplyAutoMerge={handleApplyAutoMergeConflict}
        onForceClientOverwrite={handleForceClientConflictOverwrite}
      />
    </div>
  );
}
