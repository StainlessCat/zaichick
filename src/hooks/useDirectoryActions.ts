import { useCallback } from 'react';
import { ApiError, zaychickApi } from '../api';
import {
  AuditLogEntry,
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
  applyBulkUpdateToLineList,
  buildUniqueLineId,
} from '../utils/weldingLogic';
import { getUserRolePermissions } from '../utils/rbac';
import type { FacilityGeoOverride } from './useServerSync';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface UseDirectoryActionsParams {
  currentUser: UserAccount;
  setCurrentUser: React.Dispatch<React.SetStateAction<UserAccount>>;
  userAccounts: UserAccount[];
  setUserAccounts: React.Dispatch<React.SetStateAction<UserAccount[]>>;
  joints: WeldJoint[];
  setJoints: React.Dispatch<React.SetStateAction<WeldJoint[]>>;
  projectLineList: ProjectLineItem[];
  setProjectLineList: React.Dispatch<React.SetStateAction<ProjectLineItem[]>>;
  lrvCatalog: LRVItem[];
  setLrvCatalog: React.Dispatch<React.SetStateAction<LRVItem[]>>;
  welders: WelderProfile[];
  setWelders: React.Dispatch<React.SetStateAction<WelderProfile[]>>;
  techCards: TechCardItem[];
  setTechCards: React.Dispatch<React.SetStateAction<TechCardItem[]>>;
  weldingMaterials: WeldingMaterialCertificate[];
  setWeldingMaterials: React.Dispatch<
    React.SetStateAction<WeldingMaterialCertificate[]>
  >;
  serverFacilities: FacilityObject[];
  setServerFacilities: React.Dispatch<React.SetStateAction<FacilityObject[]>>;
  derivedFacilities: FacilityObject[];
  auditLogs: AuditLogEntry[];
  setAuditLogs: React.Dispatch<React.SetStateAction<AuditLogEntry[]>>;
  templates: ColumnTemplate[];
  setTemplates: React.Dispatch<React.SetStateAction<ColumnTemplate[]>>;
  activeTemplateId: string;
  setActiveTemplateId: React.Dispatch<React.SetStateAction<string>>;
  columnOrder: WeldJointFieldKey[];
  visibleColumns: WeldJointFieldKey[];
  columnWidths: Record<string, number>;
  selectedObjectName: string;
  setSelectedObjectName: React.Dispatch<React.SetStateAction<string>>;
  selectedRdCode: string;
  setSelectedRdCode: React.Dispatch<React.SetStateAction<string>>;
  setSelectedJointIds: React.Dispatch<React.SetStateAction<string[]>>;
  recordUndoSnapshot: (actionLabel: string) => void;
  appendSystemAuditEntry: (
    operationLabel: string,
    lineId: string,
    jointNum: string,
    fieldLabel: string,
    oldVal: string,
    newVal: string,
    jointId?: string,
    opType?: AuditLogEntry['operationType']
  ) => void;
  handleApplyTemplate: (tpl: ColumnTemplate) => void;
  initialColumnTemplates: ColumnTemplate[];
  handleSaveFacilityLocationLocal: (
    facilityName: string,
    loc: FacilityGeoOverride
  ) => void;
  handleCreateStandaloneObjectLocal: (objectName: string) => void;
  isAuthenticated: boolean;
  setIsDbSyncing: React.Dispatch<React.SetStateAction<boolean>>;
  setIsAuthenticated: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLoginModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  bumpRevisionMeta: (actionLabel: string, byUser?: string) => void;
}

export function useDirectoryActions(params: UseDirectoryActionsParams) {
  const {
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
    initialColumnTemplates,
    handleSaveFacilityLocationLocal,
    handleCreateStandaloneObjectLocal,
    isAuthenticated,
    setIsDbSyncing,
    setIsAuthenticated,
    setIsLoginModalOpen,
    bumpRevisionMeta,
  } = params;

  const userPermissions = getUserRolePermissions(currentUser);

  const reportError = useCallback(
    (err: unknown, contextLabel: string) => {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setIsAuthenticated(false);
          setIsLoginModalOpen(true);
          alert(`[Срок действия сессии истёк]\n${err.message || 'Требуется повторный вход в систему.'}`);
          return;
        }
        if (err.status === 403) {
          alert(`[Недостаточно прав (RBAC)]\n${err.message || 'Действие запрещено вашей ролью.'}`);
          return;
        }
        alert(`[${contextLabel}]\n${err.message}`);
        return;
      }
      const msg = err instanceof Error ? err.message : 'Сетевая ошибка';
      alert(`[Сервер FastAPI недоступен]\n${contextLabel}: ${msg}\nПроверьте запуск backend на порту 8000.`);
    },
    [setIsAuthenticated, setIsLoginModalOpen]
  );

  const ensureFacilityId = useCallback(
    async (objectName: string, existingFacilityId?: string): Promise<string> => {
      if (existingFacilityId && UUID_RE.test(existingFacilityId)) {
        return existingFacilityId;
      }
      const cleanName = objectName.trim() || 'Объект строительства';
      const existing =
        serverFacilities.find((f) => f.name === cleanName && UUID_RE.test(f.id)) ||
        derivedFacilities.find((f) => f.name === cleanName && UUID_RE.test(f.id));
      if (existing) return existing.id;

      const created = await zaychickApi.createFacility({ name: cleanName });
      setServerFacilities((prev) =>
        prev.some((f) => f.id === created.id) ? prev : [...prev, created]
      );
      return created.id;
    },
    [derivedFacilities, serverFacilities, setServerFacilities]
  );

  // ---------------------------------------------------------------------------
  // Project Line List
  // ---------------------------------------------------------------------------
  const handleAddLineItems = useCallback(
    async (newItems: ProjectLineItem[]) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        alert('[Ошибка доступа]\nДействие запрещено: требуется авторизация на сервере FastAPI.');
        return;
      }
      recordUndoSnapshot(`Добавление линий в лайнлист (${newItems.length} шт.)`);
      try {
        setIsDbSyncing(true);
        const createdList: ProjectLineItem[] = [];
        for (const item of newItems) {
          const facId = await ensureFacilityId(item.objectName, item.facilityId);
          const created = await zaychickApi.createLine(item, facId);
          createdList.push(created);
        }
        setProjectLineList((prev) => [...createdList, ...prev]);
        bumpRevisionMeta(`Добавлено линий: ${createdList.length}`, currentUser.fullName);
      } catch (err) {
        reportError(err, 'Ошибка добавления линий');
      } finally {
        setIsDbSyncing(false);
      }
    },
    [
      bumpRevisionMeta,
      currentUser.fullName,
      ensureFacilityId,
      recordUndoSnapshot,
      reportError,
      setIsDbSyncing,
      setProjectLineList,
    ]
  );

  const handleUpdateLineItem = useCallback(
    async (
      updated: ProjectLineItem,
      previousItem?: ProjectLineItem,
      cascadeRename = true
    ) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        alert('[Ошибка доступа]\nРедактирование запрещено: требуется авторизация на сервере FastAPI.');
        return;
      }
      recordUndoSnapshot(`Редактирование линии ${updated.lineNumber}`);
      try {
        setIsDbSyncing(true);
        const saved = UUID_RE.test(updated.id)
          ? await zaychickApi.updateLine(updated)
          : updated;

        const objChanged =
          previousItem && previousItem.objectName !== saved.objectName;
        const rdChanged = previousItem && previousItem.rdCode !== saved.rdCode;
        const contourChanged =
          previousItem && previousItem.testContour !== saved.testContour;

        const nextLineList = projectLineList.map((it) => {
          if (it.id === saved.id) return saved;
          if (!cascadeRename || !previousItem) return it;
          const nextObj =
            objChanged && it.objectName === previousItem.objectName
              ? saved.objectName
              : it.objectName;
          const nextRd =
            rdChanged && it.rdCode === previousItem.rdCode
              ? saved.rdCode
              : it.rdCode;
          const nextContour =
            contourChanged &&
            it.testContour === previousItem.testContour &&
            (it.rdCode === previousItem.rdCode || nextRd === saved.rdCode)
              ? saved.testContour
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
          const nextLinesById = new Map(nextLineList.map((l) => [l.id, l]));
          setJoints((prevJoints) =>
            prevJoints.map((j) => {
              const matchedOldLine =
                prevLinesByUniqueId.get(j.uniqueLineId) ||
                projectLineList.find(
                  (l) => l.rdCode === j.rdCode && l.lineNumber === j.lineNumber
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
                  ? { ...item, rdCode: saved.rdCode }
                  : item
              )
            );
            if (selectedRdCode === previousItem.rdCode) {
              setSelectedRdCode(saved.rdCode);
            }
          }
          if (cascadeRename && objChanged && selectedObjectName === previousItem.objectName) {
            setSelectedObjectName(saved.objectName);
          }
        }
        bumpRevisionMeta(`Обновлена линия ${saved.uniqueLineId}`, currentUser.fullName);
      } catch (err) {
        reportError(err, 'Ошибка обновления линии');
      } finally {
        setIsDbSyncing(false);
      }
    },
    [
      bumpRevisionMeta,
      currentUser.fullName,
      projectLineList,
      recordUndoSnapshot,
      reportError,
      selectedObjectName,
      selectedRdCode,
      setIsDbSyncing,
      setJoints,
      setLrvCatalog,
      setProjectLineList,
      setSelectedObjectName,
      setSelectedRdCode,
    ]
  );

  const handleBulkUpdateLineItems = useCallback(
    async (selectedIds: string[], patch: Partial<ProjectLineItem>) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        alert('[Ошибка доступа]\nГрупповое редактирование запрещено: требуется авторизация на сервере FastAPI.');
        return;
      }
      recordUndoSnapshot(`Групповое ред. лайнлиста (${selectedIds.length} стр.)`);
      const nextLineList = applyBulkUpdateToLineList(
        projectLineList,
        selectedIds,
        patch
      );
      try {
        setIsDbSyncing(true);
        const updatedMap = new Map<string, ProjectLineItem>();
        for (const item of nextLineList) {
          if (selectedIds.includes(item.id) && UUID_RE.test(item.id)) {
            const saved = await zaychickApi.updateLine(item);
            updatedMap.set(saved.id, saved);
          }
        }
        setProjectLineList(
          nextLineList.map((item) => updatedMap.get(item.id) || item)
        );
        bumpRevisionMeta(`Обновлено линий: ${selectedIds.length}`, currentUser.fullName);
      } catch (err) {
        reportError(err, 'Ошибка группового обновления линий');
      } finally {
        setIsDbSyncing(false);
      }
    },
    [
      bumpRevisionMeta,
      currentUser.fullName,
      projectLineList,
      recordUndoSnapshot,
      reportError,
      setIsDbSyncing,
      setProjectLineList,
    ]
  );

  const handleDeleteLineItems = useCallback(
    async (lineIds: string[]) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        alert('[Ошибка доступа]\nУдаление запрещено: требуется авторизация на сервере FastAPI.');
        return;
      }
      if (lineIds.length === 0) return;
      const idSet = new Set(lineIds);
      const linesToDelete = projectLineList.filter((l) => idSet.has(l.id));
      if (linesToDelete.length === 0) return;

      recordUndoSnapshot(`Удаление линий из лайнлиста (${linesToDelete.length} шт.)`);
      try {
        setIsDbSyncing(true);
        for (const l of linesToDelete) {
          if (UUID_RE.test(l.id)) {
            await zaychickApi.deleteLine(l.id);
          }
        }
        const uniqueLineIdsToDelete = new Set(
          linesToDelete.map((l) => l.uniqueLineId)
        );
        setProjectLineList((prev) => prev.filter((l) => !idSet.has(l.id)));
        setJoints((prev) =>
          prev.filter((j) => !uniqueLineIdsToDelete.has(j.uniqueLineId))
        );
        setSelectedJointIds([]);
        bumpRevisionMeta(`Удалено линий: ${linesToDelete.length}`, currentUser.fullName);
      } catch (err) {
        reportError(err, 'Ошибка удаления линий');
      } finally {
        setIsDbSyncing(false);
      }
    },
    [
      bumpRevisionMeta,
      currentUser.fullName,
      projectLineList,
      recordUndoSnapshot,
      reportError,
      setIsDbSyncing,
      setJoints,
      setProjectLineList,
      setSelectedJointIds,
    ]
  );

  // ---------------------------------------------------------------------------
  // Facilities / Objects & RD Codes
  // ---------------------------------------------------------------------------
  const handleDeleteObject = useCallback(
    async (objectName: string) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        alert('[Ошибка доступа]\nУдаление объекта запрещено: требуется авторизация на сервере FastAPI.');
        return;
      }
      recordUndoSnapshot(`Удаление объекта «${objectName}»`);
      const objectRds = new Set(
        projectLineList
          .filter((l) => l.objectName === objectName)
          .map((l) => l.rdCode)
      );
      try {
        setIsDbSyncing(true);
        const targetFac = serverFacilities.find((f) => f.name === objectName);
        if (targetFac && UUID_RE.test(targetFac.id)) {
          await zaychickApi.deleteFacility(targetFac.id);
          setServerFacilities((prev) => prev.filter((f) => f.id !== targetFac.id));
        } else {
          for (const l of projectLineList.filter((x) => x.objectName === objectName)) {
            if (UUID_RE.test(l.id)) await zaychickApi.deleteLine(l.id);
          }
        }
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
          setSelectedObjectName(nextLines[0]?.objectName || 'ALL');
          setSelectedRdCode('ALL');
        }
        bumpRevisionMeta(`Удалён объект «${objectName}»`, currentUser.fullName);
      } catch (err) {
        reportError(err, 'Ошибка удаления объекта');
      } finally {
        setIsDbSyncing(false);
      }
    },
    [
      bumpRevisionMeta,
      currentUser.fullName,
      projectLineList,
      recordUndoSnapshot,
      reportError,
      selectedObjectName,
      serverFacilities,
      setIsDbSyncing,
      setJoints,
      setLrvCatalog,
      setProjectLineList,
      setSelectedJointIds,
      setSelectedObjectName,
      setSelectedRdCode,
      setServerFacilities,
    ]
  );

  const handleDeleteRdCode = useCallback(
    async (rdCode: string, objectName?: string) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        alert('[Ошибка доступа]\nУдаление шифра РД запрещено: требуется авторизация на сервере FastAPI.');
        return;
      }
      recordUndoSnapshot(`Удаление шифра РД «${rdCode}»`);
      const matchesTarget = (l: { rdCode: string; objectName?: string }) =>
        l.rdCode === rdCode && (!objectName || l.objectName === objectName);

      try {
        setIsDbSyncing(true);
        for (const l of projectLineList.filter(matchesTarget)) {
          if (UUID_RE.test(l.id)) await zaychickApi.deleteLine(l.id);
        }
        for (const item of lrvCatalog.filter(matchesTarget)) {
          if (UUID_RE.test(item.id)) await zaychickApi.deleteLrv(item.id);
        }
        setProjectLineList((prev) => prev.filter((l) => !matchesTarget(l)));
        setJoints((prev) => prev.filter((j) => !matchesTarget(j)));
        setLrvCatalog((prev) => prev.filter((item) => !matchesTarget(item)));
        setSelectedJointIds([]);
        if (selectedRdCode === rdCode) setSelectedRdCode('ALL');
        bumpRevisionMeta(`Удалён шифр РД «${rdCode}»`, currentUser.fullName);
      } catch (err) {
        reportError(err, 'Ошибка удаления шифра РД');
      } finally {
        setIsDbSyncing(false);
      }
    },
    [
      bumpRevisionMeta,
      currentUser.fullName,
      lrvCatalog,
      projectLineList,
      recordUndoSnapshot,
      reportError,
      selectedRdCode,
      setIsDbSyncing,
      setJoints,
      setLrvCatalog,
      setProjectLineList,
      setSelectedJointIds,
      setSelectedRdCode,
    ]
  );

  const handleSaveFacilityLocation = useCallback(
    async (facilityName: string, loc: FacilityGeoOverride) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        alert('[Ошибка доступа]\nСохранение геолокации запрещено: требуется авторизация на сервере FastAPI.');
        return;
      }
      handleSaveFacilityLocationLocal(facilityName, loc);
      const serverFac = serverFacilities.find((f) => f.name === facilityName);
      if (serverFac && UUID_RE.test(serverFac.id)) {
        try {
          const updated = await zaychickApi.updateFacility(serverFac.id, {
            version: serverFac.version ?? 1,
            region: loc.region,
            latitude: loc.latitude,
            longitude: loc.longitude,
            weatherStation: loc.weatherStation,
            weatherStationId: loc.weatherStationId,
            weatherStationDistanceKm: loc.weatherStationDistanceKm,
            weatherStationSource: loc.weatherStationSource,
          });
          setServerFacilities((prev) =>
            prev.map((f) => (f.id === updated.id ? updated : f))
          );
        } catch (err) {
          reportError(err, 'Ошибка сохранения геолокации объекта');
        }
      }
    },
    [
      handleSaveFacilityLocationLocal,
      reportError,
      serverFacilities,
      setServerFacilities,
    ]
  );

  const handleCreateStandaloneObject = useCallback(
    async (objectName: string) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        alert('[Ошибка доступа]\nСоздание объекта запрещено: требуется авторизация на сервере FastAPI.');
        return;
      }
      handleCreateStandaloneObjectLocal(objectName);
      const clean = objectName.trim();
      if (!clean) return;
      try {
        await ensureFacilityId(clean);
      } catch (err) {
        reportError(err, 'Ошибка создания объекта');
      }
    },
    [ensureFacilityId, handleCreateStandaloneObjectLocal, reportError]
  );

  // ---------------------------------------------------------------------------
  // Welding Tech: NAKS Welders, WPS TechCards, Materials
  // ---------------------------------------------------------------------------
  const handleSaveWelder = useCallback(
    async (w: WelderProfile) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        alert('[Ошибка доступа]\nСохранение сварщика запрещено: требуется авторизация на сервере FastAPI.');
        return;
      }
      recordUndoSnapshot(`Сохранение сварщика / клейма ${w.stamp}`);
      try {
        setIsDbSyncing(true);
        const saved =
          w.id && UUID_RE.test(w.id)
            ? await zaychickApi.updateWelder(w)
            : await zaychickApi.createWelder(w);
        setWelders((prev) =>
          prev.some((x) => x.id === saved.id || x.stamp === saved.stamp)
            ? prev.map((x) =>
                x.id === saved.id || x.stamp === saved.stamp ? saved : x
              )
            : [saved, ...prev]
        );
        bumpRevisionMeta(`Сварщик ${saved.stamp}`, currentUser.fullName);
      } catch (err) {
        reportError(err, 'Ошибка сохранения сварщика НАКС');
      } finally {
        setIsDbSyncing(false);
      }
    },
    [
      bumpRevisionMeta,
      currentUser.fullName,
      recordUndoSnapshot,
      reportError,
      setIsDbSyncing,
      setWelders,
    ]
  );

  const handleDeleteWelder = useCallback(
    async (stamp: string) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        alert('[Ошибка доступа]\nУдаление сварщика запрещено: требуется авторизация на сервере FastAPI.');
        return;
      }
      const target = welders.find((w) => w.stamp === stamp);
      if (!target) return;
      recordUndoSnapshot(`Удаление сварщика / клейма «${stamp}»`);
      try {
        setIsDbSyncing(true);
        if (target.id && UUID_RE.test(target.id)) {
          await zaychickApi.deleteWelder(target.id);
        }
        setWelders((prev) => prev.filter((w) => w.stamp !== stamp));
        bumpRevisionMeta(`Удалён сварщик ${stamp}`, currentUser.fullName);
      } catch (err) {
        reportError(err, 'Ошибка удаления сварщика НАКС');
      } finally {
        setIsDbSyncing(false);
      }
    },
    [
      bumpRevisionMeta,
      currentUser.fullName,
      recordUndoSnapshot,
      reportError,
      setIsDbSyncing,
      setWelders,
      welders,
    ]
  );

  const handleSaveTechCard = useCallback(
    async (tc: TechCardItem) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        alert('[Ошибка доступа]\nСохранение техкарты запрещено: требуется авторизация на сервере FastAPI.');
        return;
      }
      recordUndoSnapshot(`Сохранение техкарты ${tc.number}`);
      try {
        setIsDbSyncing(true);
        const saved = UUID_RE.test(tc.id)
          ? await zaychickApi.updateTechCard(tc)
          : await zaychickApi.createTechCard(tc);
        setTechCards((prev) =>
          prev.some((x) => x.id === saved.id)
            ? prev.map((x) => (x.id === saved.id ? saved : x))
            : [saved, ...prev]
        );
        bumpRevisionMeta(`Техкарта ${saved.number}`, currentUser.fullName);
      } catch (err) {
        reportError(err, 'Ошибка сохранения техкарты');
      } finally {
        setIsDbSyncing(false);
      }
    },
    [
      bumpRevisionMeta,
      currentUser.fullName,
      recordUndoSnapshot,
      reportError,
      setIsDbSyncing,
      setTechCards,
    ]
  );

  const handleDeleteTechCard = useCallback(
    async (id: string) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        alert('[Ошибка доступа]\nУдаление техкарты запрещено: требуется авторизация на сервере FastAPI.');
        return;
      }
      const target = techCards.find((tc) => tc.id === id);
      if (!target) return;
      recordUndoSnapshot(`Удаление техкарты «${target.number}»`);
      try {
        setIsDbSyncing(true);
        if (UUID_RE.test(target.id)) {
          await zaychickApi.deleteTechCard(target.id);
        }
        setTechCards((prev) => prev.filter((tc) => tc.id !== id));
        bumpRevisionMeta(`Удалена техкарта ${target.number}`, currentUser.fullName);
      } catch (err) {
        reportError(err, 'Ошибка удаления техкарты');
      } finally {
        setIsDbSyncing(false);
      }
    },
    [
      bumpRevisionMeta,
      currentUser.fullName,
      recordUndoSnapshot,
      reportError,
      setIsDbSyncing,
      setTechCards,
      techCards,
    ]
  );

  const handleSaveMaterial = useCallback(
    async (mat: WeldingMaterialCertificate) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        alert('[Ошибка доступа]\nСохранение СМ запрещено: требуется авторизация на сервере FastAPI.');
        return;
      }
      recordUndoSnapshot(`Сохранение СМ ${mat.brandAndDiameter}`);
      try {
        setIsDbSyncing(true);
        const saved = UUID_RE.test(mat.id)
          ? await zaychickApi.updateMaterial(mat)
          : await zaychickApi.createMaterial(mat);
        setWeldingMaterials((prev) =>
          prev.some((x) => x.id === saved.id)
            ? prev.map((x) => (x.id === saved.id ? saved : x))
            : [saved, ...prev]
        );
        bumpRevisionMeta(`СМ ${saved.brandAndDiameter}`, currentUser.fullName);
      } catch (err) {
        reportError(err, 'Ошибка сохранения сварочного материала');
      } finally {
        setIsDbSyncing(false);
      }
    },
    [
      bumpRevisionMeta,
      currentUser.fullName,
      recordUndoSnapshot,
      reportError,
      setIsDbSyncing,
      setWeldingMaterials,
    ]
  );

  const handleDeleteWeldingMaterial = useCallback(
    async (id: string) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        alert('[Ошибка доступа]\nУдаление СМ запрещено: требуется авторизация на сервере FastAPI.');
        return;
      }
      const target = weldingMaterials.find((m) => m.id === id);
      if (!target) return;
      recordUndoSnapshot(`Удаление СМ «${target.brandAndDiameter}»`);
      try {
        setIsDbSyncing(true);
        if (UUID_RE.test(target.id)) {
          await zaychickApi.deleteMaterial(target.id);
        }
        setWeldingMaterials((prev) => prev.filter((m) => m.id !== id));
        bumpRevisionMeta(`Удалён СМ ${target.brandAndDiameter}`, currentUser.fullName);
      } catch (err) {
        reportError(err, 'Ошибка удаления сварочного материала');
      } finally {
        setIsDbSyncing(false);
      }
    },
    [
      bumpRevisionMeta,
      currentUser.fullName,
      recordUndoSnapshot,
      reportError,
      setIsDbSyncing,
      setWeldingMaterials,
      weldingMaterials,
    ]
  );

  // ---------------------------------------------------------------------------
  // LRV Catalog
  // ---------------------------------------------------------------------------
  const handleAddLrvItems = useCallback(
    async (newItems: LRVItem[]) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        alert('[Ошибка доступа]\nДобавление в ЛРВ запрещено: требуется авторизация на сервере FastAPI.');
        return;
      }
      recordUndoSnapshot(`Добавление в каталог ЛРВ (${newItems.length} поз.)`);
      try {
        setIsDbSyncing(true);
        const created: LRVItem[] = [];
        for (const item of newItems) {
          const objName =
            item.objectName ||
            (selectedObjectName !== 'ALL' ? selectedObjectName : '') ||
            derivedFacilities[0]?.name ||
            'Объект строительства';
          const facId = await ensureFacilityId(objName, item.facilityId);
          created.push(await zaychickApi.createLrv(item, facId));
        }
        setLrvCatalog((prev) => [...created, ...prev]);
        bumpRevisionMeta(`Добавлено позиций ЛРВ: ${created.length}`, currentUser.fullName);
      } catch (err) {
        reportError(err, 'Ошибка добавления в ЛРВ');
      } finally {
        setIsDbSyncing(false);
      }
    },
    [
      bumpRevisionMeta,
      currentUser.fullName,
      derivedFacilities,
      ensureFacilityId,
      recordUndoSnapshot,
      reportError,
      selectedObjectName,
      setIsDbSyncing,
      setLrvCatalog,
    ]
  );

  const handleUpdateLrvItem = useCallback(
    async (updatedItem: LRVItem) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        alert('[Ошибка доступа]\nРедактирование ЛРВ запрещено: требуется авторизация на сервере FastAPI.');
        return;
      }
      recordUndoSnapshot(`Редактирование позиции ЛРВ ${updatedItem.lrvCode}`);
      const prevItem = lrvCatalog.find((x) => x.id === updatedItem.id);
      try {
        setIsDbSyncing(true);
        let saved: LRVItem;
        if (
          UUID_RE.test(updatedItem.id) &&
          updatedItem.status === 'superseded' &&
          prevItem?.status !== 'superseded'
        ) {
          saved = await zaychickApi.supersedeLrv(
            updatedItem.id,
            prevItem?.version ?? updatedItem.version ?? 1,
            updatedItem.replacementLetter || 'Письмо согласования',
            updatedItem.replacementDate
          );
        } else if (UUID_RE.test(updatedItem.id)) {
          saved = await zaychickApi.updateLrv(updatedItem);
        } else {
          saved = updatedItem;
        }
        setLrvCatalog((prev) =>
          prev.map((item) => (item.id === saved.id ? saved : item))
        );
        bumpRevisionMeta(`ЛРВ ${saved.lrvCode}`, currentUser.fullName);
      } catch (err) {
        reportError(err, 'Ошибка обновления ЛРВ');
      } finally {
        setIsDbSyncing(false);
      }
    },
    [
      bumpRevisionMeta,
      currentUser.fullName,
      lrvCatalog,
      recordUndoSnapshot,
      reportError,
      setIsDbSyncing,
      setLrvCatalog,
    ]
  );

  const handleDeleteLrvItems = useCallback(
    async (ids: string[]) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        alert('[Ошибка доступа]\nУдаление из ЛРВ запрещено: требуется авторизация на сервере FastAPI.');
        return;
      }
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      const itemsToDelete = lrvCatalog.filter((item) => idSet.has(item.id));
      if (itemsToDelete.length === 0) return;

      recordUndoSnapshot(`Удаление материалов из ЛРВ (${itemsToDelete.length} поз.)`);
      try {
        setIsDbSyncing(true);
        for (const item of itemsToDelete) {
          if (UUID_RE.test(item.id)) {
            await zaychickApi.deleteLrv(item.id);
          }
        }
        setLrvCatalog((prev) => prev.filter((item) => !idSet.has(item.id)));
        bumpRevisionMeta(`Удалено позиций ЛРВ: ${itemsToDelete.length}`, currentUser.fullName);
      } catch (err) {
        reportError(err, 'Ошибка удаления из ЛРВ');
      } finally {
        setIsDbSyncing(false);
      }
    },
    [
      bumpRevisionMeta,
      currentUser.fullName,
      lrvCatalog,
      recordUndoSnapshot,
      reportError,
      setIsDbSyncing,
      setLrvCatalog,
    ]
  );

  // ---------------------------------------------------------------------------
  // Column Templates
  // ---------------------------------------------------------------------------
  const handleSaveNewTemplate = useCallback(
    async (name: string, description: string) => {
      const draft: ColumnTemplate = {
        id: `tpl-user-${Date.now()}`,
        name: name.trim(),
        description: description.trim() || 'Пользовательский шаблон',
        columnOrder: [...columnOrder],
        visibleColumns: [...visibleColumns],
        customWidths: { ...columnWidths },
      };
      try {
        const saved = await zaychickApi.createTemplate(draft);
        setTemplates((prev) => [...prev, saved]);
        setActiveTemplateId(saved.id);
      } catch {
        setTemplates((prev) => [...prev, draft]);
        setActiveTemplateId(draft.id);
      }
    },
    [columnOrder, columnWidths, setActiveTemplateId, setTemplates, visibleColumns]
  );

  const handleDeleteTemplate = useCallback(
    async (id: string) => {
      try {
        await zaychickApi.deleteTemplate(id);
      } catch {
        // fallback removal if local-only template
      }
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      if (activeTemplateId === id) {
        handleApplyTemplate(initialColumnTemplates[0]);
      }
    },
    [activeTemplateId, handleApplyTemplate, initialColumnTemplates, setTemplates]
  );

  // ---------------------------------------------------------------------------
  // User Accounts (ADMIN -> PostgreSQL)
  // ---------------------------------------------------------------------------
  const handleDeleteUserAccount = useCallback(
    async (loginToDelete: string) => {
      if (!isAuthenticated || !currentUser.login || userPermissions.category !== 'admin') {
        setIsLoginModalOpen(true);
        alert('[Ошибка доступа]\nДействие запрещено: требуется авторизация с правами администратора.');
        return;
      }
      if (userAccounts.length <= 1) return;
      const targetAcc = userAccounts.find((a) => a.login === loginToDelete);
      if (!targetAcc) return;

      try {
        if (targetAcc.id && UUID_RE.test(targetAcc.id)) {
          await zaychickApi.updateUser(targetAcc.id, {
            version: targetAcc.version ?? 1,
            isActive: false,
          });
        }
        const nextAccounts = userAccounts.filter((a) => a.login !== loginToDelete);
        setUserAccounts(nextAccounts);
        if (currentUser.login === loginToDelete && nextAccounts[0]) {
          setCurrentUser(nextAccounts[0]);
        }
      } catch (err) {
        reportError(err, 'Ошибка отключения пользователя');
      }
    },
    [currentUser.login, reportError, setCurrentUser, setUserAccounts, userAccounts]
  );

  const handleToggleAdminRights = useCallback(
    (targetLogin: string, grantAdmin: boolean): { ok: boolean; message: string } => {
      if (!isAuthenticated || !currentUser.login || userPermissions.category !== 'admin') {
        setIsLoginModalOpen(true);
        return {
          ok: false,
          message: 'Только действующий авторизованный администратор имеет право изменять полномочия',
        };
      }
      const targetAcc = userAccounts.find(
        (a) => a.login.toLowerCase() === targetLogin.trim().toLowerCase()
      );
      if (!targetAcc) {
        return { ok: false, message: `Учётная запись «${targetLogin}» не найдена` };
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

      const nextBackendRole = grantAdmin ? 'ADMIN' : 'PTO';
      if (targetAcc.id && UUID_RE.test(targetAcc.id)) {
        void zaychickApi
          .updateUser(targetAcc.id, {
            version: targetAcc.version ?? 1,
            role: nextBackendRole,
          })
          .then((saved) => {
            setUserAccounts((prev) =>
              prev.map((a) => (a.id === saved.id ? saved : a))
            );
            if (currentUser.login === saved.login) setCurrentUser(saved);
          })
          .catch((err) => reportError(err, 'Ошибка смены прав доступа'));
      }

      return {
        ok: true,
        message: grantAdmin
          ? `Пользователю «${targetAcc.fullName}» назначена роль ADMIN`
          : `Роль пользователя «${targetAcc.fullName}» изменена на PTO`,
      };
    },
    [
      currentUser.login,
      reportError,
      setCurrentUser,
      setUserAccounts,
      userAccounts,
      userPermissions.category,
    ]
  );

  const handleChangeAdminPassword = useCallback(
    (
      adminLogin: string,
      currentPassword: string,
      newPassword: string
    ): { ok: boolean; message: string } => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        return { ok: false, message: 'Требуется авторизация в системе' };
      }
      const targetAcc = userAccounts.find(
        (a) => a.login.toLowerCase() === adminLogin.trim().toLowerCase()
      );
      if (!targetAcc) {
        return {
          ok: false,
          message: `Учётная запись администратора «${adminLogin}» не найдена`,
        };
      }
      if (newPassword.trim().length < 8) {
        return { ok: false, message: 'Новый пароль должен содержать не менее 8 символов' };
      }

      if (adminLogin.toLowerCase() === currentUser.login.toLowerCase()) {
        void zaychickApi
          .changeOwnPassword(currentPassword, newPassword.trim())
          .catch((err) => reportError(err, 'Ошибка смены пароля'));
      } else if (targetAcc.id && UUID_RE.test(targetAcc.id)) {
        void zaychickApi
          .updateUser(targetAcc.id, {
            version: targetAcc.version ?? 1,
            newPassword: newPassword.trim(),
          })
          .then((saved) => {
            setUserAccounts((prev) =>
              prev.map((a) => (a.id === saved.id ? saved : a))
            );
          })
          .catch((err) => reportError(err, 'Ошибка смены пароля администратора'));
      }

      return {
        ok: true,
        message: `Запрос на смену пароля «${targetAcc.login}» отправлен в FastAPI`,
      };
    },
    [currentUser.login, reportError, setUserAccounts, userAccounts]
  );

  const handleClearAuditLogs = useCallback(() => {
    if (userPermissions.category !== 'admin') return;
    recordUndoSnapshot(`Очистка представления аудита (${auditLogs.length} зап.)`);
    setAuditLogs([]);
    appendSystemAuditEntry(
      'Аудит',
      'СИСТЕМА',
      '—',
      'Очищена лента просмотра аудита в интерфейсе (PostgreSQL audit_logs неизменяем)',
      '—',
      'Применено'
    );
  }, [
    appendSystemAuditEntry,
    auditLogs.length,
    recordUndoSnapshot,
    setAuditLogs,
    userPermissions.category,
  ]);

  return {
    handleAddLineItems,
    handleUpdateLineItem,
    handleBulkUpdateLineItems,
    handleDeleteLineItems,
    handleDeleteObject,
    handleDeleteRdCode,
    handleSaveFacilityLocation,
    handleCreateStandaloneObject,
    handleSaveWelder,
    handleDeleteWelder,
    handleSaveTechCard,
    handleDeleteTechCard,
    handleSaveMaterial,
    handleDeleteWeldingMaterial,
    handleAddLrvItems,
    handleUpdateLrvItem,
    handleDeleteLrvItems,
    handleSaveNewTemplate,
    handleDeleteTemplate,
    handleDeleteUserAccount,
    handleToggleAdminRights,
    handleChangeAdminPassword,
    handleClearAuditLogs,
  };
}
