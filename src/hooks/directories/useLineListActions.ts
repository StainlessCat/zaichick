import { useCallback } from 'react';
import { zaychickApi } from '../../api';
import {
  FacilityObject,
  LRVItem,
  ProjectLineItem,
  UserAccount,
  WeldJoint,
} from '../../types/welding';
import {
  applyBulkUpdateToLineList,
  buildUniqueLineId,
} from '../../utils/weldingLogic';
import { getUserRolePermissions } from '../../utils/rbac';
import type { FacilityGeoOverride } from '../useServerSync';
import type {
  LineBatchImportSummary,
  LineImportDuplicateMode,
} from '../../utils/linelistImportValidation';
import { UUID_RE } from './common';

const EXECUTIVE_DOCS_CACHE_KEY = 'zaychick_executive_docs_v1';

function syncExecutiveDocsCache(updatedLines: ProjectLineItem[]): void {
  if (typeof window === 'undefined' || updatedLines.length === 0) return;
  try {
    const raw = window.localStorage.getItem(EXECUTIVE_DOCS_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    let mutated = false;
    for (const line of updatedLines) {
      const rec = parsed[line.id];
      if (!rec || typeof rec !== 'object') continue;
      const nextStatus = line.idStatus === 'SIGNED' ? 'SIGNED' : 'IN_WORK';
      const nextPto = line.responsiblePto?.trim() || null;
      if (rec.idStatus !== nextStatus || (rec.ptoEngineer ?? null) !== nextPto) {
        parsed[line.id] = {
          ...rec,
          idStatus: nextStatus,
          ptoEngineer: nextPto,
        };
        mutated = true;
      }
    }
    if (mutated) {
      window.localStorage.setItem(EXECUTIVE_DOCS_CACHE_KEY, JSON.stringify(parsed));
    }
  } catch {
    // ignore storage errors
  }
}

export interface UseLineListActionsParams {
  currentUser: UserAccount;
  projectLineList: ProjectLineItem[];
  setProjectLineList: React.Dispatch<React.SetStateAction<ProjectLineItem[]>>;
  joints: WeldJoint[];
  setJoints: React.Dispatch<React.SetStateAction<WeldJoint[]>>;
  lrvCatalog: LRVItem[];
  setLrvCatalog: React.Dispatch<React.SetStateAction<LRVItem[]>>;
  serverFacilities: FacilityObject[];
  setServerFacilities: React.Dispatch<React.SetStateAction<FacilityObject[]>>;
  selectedObjectName: string;
  setSelectedObjectName: React.Dispatch<React.SetStateAction<string>>;
  selectedRdCode: string;
  setSelectedRdCode: React.Dispatch<React.SetStateAction<string>>;
  setSelectedJointIds: React.Dispatch<React.SetStateAction<string[]>>;
  recordUndoSnapshot: (actionLabel: string) => void;
  bumpRevisionMeta: (actionLabel: string, byUser?: string) => void;
  isAuthenticated: boolean;
  setIsDbSyncing: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLoginModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  notifyError: (msg: string) => void;
  reportError: (err: unknown, contextLabel: string) => void;
  ensureFacilityId: (objectName: string, existingFacilityId?: string) => Promise<string>;
  handleSaveFacilityLocationLocal: (facilityName: string, loc: FacilityGeoOverride) => void;
  handleCreateStandaloneObjectLocal: (objectName: string) => void;
}

export function useLineListActions(params: UseLineListActionsParams) {
  const {
    currentUser,
    projectLineList,
    setProjectLineList,
    joints,
    setJoints,
    lrvCatalog,
    setLrvCatalog,
    serverFacilities,
    setServerFacilities,
    selectedObjectName,
    setSelectedObjectName,
    selectedRdCode,
    setSelectedRdCode,
    setSelectedJointIds,
    recordUndoSnapshot,
    bumpRevisionMeta,
    isAuthenticated,
    setIsDbSyncing,
    setIsLoginModalOpen,
    notifyError,
    reportError,
    ensureFacilityId,
    handleSaveFacilityLocationLocal,
    handleCreateStandaloneObjectLocal,
  } = params;

  const canEditLineList = getUserRolePermissions(currentUser).canEditLineList;
  const lineListPermissionError =
    'Доступ запрещён: изменение объектов, шифров РД и лайнлиста доступно только администратору отдела ПТО.';

  const handleAddLineItems = useCallback(
    async (
      newItems: ProjectLineItem[],
      duplicateMode: LineImportDuplicateMode = 'skip'
    ): Promise<LineBatchImportSummary> => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        notifyError('Действие запрещено: требуется авторизация на сервере FastAPI.');
        return { ok: false, createdCount: 0, updatedCount: 0, skippedCount: 0, errors: [] };
      }
      if (!canEditLineList) {
        notifyError(lineListPermissionError);
        return { ok: false, createdCount: 0, updatedCount: 0, skippedCount: 0, errors: [] };
      }
      if (newItems.length === 0) {
        return { ok: true, createdCount: 0, updatedCount: 0, skippedCount: 0, errors: [] };
      }
      recordUndoSnapshot(`Добавление линий в лайнлист · ${newItems.length} шт.`);
      try {
        setIsDbSyncing(true);
        // Разрешаем facilityId один раз на каждое уникальное имя объекта
        const facilityIdByName = new Map<string, string>();
        const payloadEntries: Array<{ line: ProjectLineItem; facilityId: string }> = [];
        for (const item of newItems) {
          const objKey = item.objectName.trim();
          let facId = facilityIdByName.get(objKey);
          if (!facId) {
            facId = await ensureFacilityId(item.objectName, item.facilityId);
            facilityIdByName.set(objKey, facId);
          }
          payloadEntries.push({ line: item, facilityId: facId });
        }

        if (payloadEntries.length === 1 && duplicateMode === 'skip') {
          const created = await zaychickApi.createLine(
            payloadEntries[0].line,
            payloadEntries[0].facilityId
          );
          setProjectLineList((prev) => [created, ...prev]);
          syncExecutiveDocsCache([created]);
          bumpRevisionMeta(`Добавлена линия ${created.uniqueLineId}`, currentUser.fullName);
          return {
            ok: true,
            createdCount: 1,
            updatedCount: 0,
            skippedCount: 0,
            errors: [],
          };
        }

        const batchRes = await zaychickApi.batchImportLines(
          payloadEntries,
          duplicateMode
        );
        const updatedMap = new Map(batchRes.updated.map((ln) => [ln.id, ln]));
        setProjectLineList((prev) => {
          const merged = prev.map((ln) => updatedMap.get(ln.id) || ln);
          return [...batchRes.created, ...merged];
        });
        syncExecutiveDocsCache([...batchRes.created, ...batchRes.updated]);
        bumpRevisionMeta(
          `Импорт линий: создано ${batchRes.created.length}, обновлено ${batchRes.updated.length}`,
          currentUser.fullName
        );
        return {
          ok: true,
          createdCount: batchRes.created.length,
          updatedCount: batchRes.updated.length,
          skippedCount: batchRes.skipped.length,
          errors: batchRes.errors,
        };
      } catch (err) {
        reportError(err, 'Ошибка добавления линий');
        return {
          ok: false,
          createdCount: 0,
          updatedCount: 0,
          skippedCount: 0,
          errors: [err instanceof Error ? err.message : 'Ошибка добавления линий'],
        };
      } finally {
        setIsDbSyncing(false);
      }
    },
    [
      bumpRevisionMeta,
      canEditLineList,
      currentUser.fullName,
      currentUser.login,
      ensureFacilityId,
      isAuthenticated,
      notifyError,
      recordUndoSnapshot,
      reportError,
      setIsDbSyncing,
      setIsLoginModalOpen,
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
        notifyError('Редактирование запрещено: требуется авторизация на сервере FastAPI.');
        return;
      }
      if (!canEditLineList) {
        notifyError(lineListPermissionError);
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

        const cascadedLinesToSave: ProjectLineItem[] = [];
        const draftLineList = projectLineList.map((it) => {
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
          const cascadedItem: ProjectLineItem = {
            ...it,
            objectName: nextObj,
            rdCode: nextRd,
            testContour: nextContour,
            uniqueLineId: buildUniqueLineId(nextRd, it.lineNumber),
          };
          if (UUID_RE.test(cascadedItem.id)) {
            cascadedLinesToSave.push(cascadedItem);
          }
          return cascadedItem;
        });

        const savedCascadedMap = new Map<string, ProjectLineItem>();
        for (const cLine of cascadedLinesToSave) {
          const persistedLine = await zaychickApi.updateLine(cLine);
          savedCascadedMap.set(persistedLine.id, persistedLine);
        }

        const nextLineList = draftLineList.map(
          (it) => savedCascadedMap.get(it.id) || it
        );
        setProjectLineList(nextLineList);
        syncExecutiveDocsCache([saved, ...savedCascadedMap.values()]);

        if (previousItem) {
          const prevLinesByUniqueId = new Map(
            projectLineList.map((l) => [l.uniqueLineId, l])
          );
          const nextLinesById = new Map(nextLineList.map((l) => [l.id, l]));

          const jointBulkPatches: Array<{
            id: string;
            patch: Partial<WeldJoint>;
            version: number;
          }> = [];

          const nextJoints = joints.map((j) => {
            const matchedOldLine =
              prevLinesByUniqueId.get(j.uniqueLineId) ||
              projectLineList.find(
                (l) => l.rdCode === j.rdCode && l.lineNumber === j.lineNumber
              );
            if (matchedOldLine) {
              const nextLine = nextLinesById.get(matchedOldLine.id);
              if (
                nextLine &&
                (j.objectName !== nextLine.objectName ||
                  j.rdCode !== nextLine.rdCode ||
                  j.lineNumber !== nextLine.lineNumber ||
                  j.uniqueLineId !== nextLine.uniqueLineId ||
                  j.contour !== nextLine.testContour)
              ) {
                const patch: Partial<WeldJoint> = {
                  objectName: nextLine.objectName,
                  rdCode: nextLine.rdCode,
                  lineNumber: nextLine.lineNumber,
                  uniqueLineId: nextLine.uniqueLineId,
                  contour: nextLine.testContour,
                };
                if (UUID_RE.test(j.id)) {
                  jointBulkPatches.push({
                    id: j.id,
                    patch,
                    version: j.version ?? 1,
                  });
                }
                return { ...j, ...patch };
              }
            }
            return j;
          });

          if (jointBulkPatches.length > 0) {
            const updatedServerJoints = await zaychickApi.bulkUpdateJoints(
              jointBulkPatches
            );
            const serverJointMap = new Map(
              updatedServerJoints.map((uj) => [uj.id, uj])
            );
            setJoints(nextJoints.map((j) => serverJointMap.get(j.id) || j));
          } else {
            setJoints(nextJoints);
          }

          if (cascadeRename && rdChanged) {
            const lrvItemsToUpdate = lrvCatalog.filter(
              (item) => item.rdCode === previousItem.rdCode
            );
            const savedLrvMap = new Map<string, LRVItem>();
            for (const item of lrvItemsToUpdate) {
              if (UUID_RE.test(item.id)) {
                const persistedLrv = await zaychickApi.updateLrv({
                  ...item,
                  rdCode: saved.rdCode,
                  objectName:
                    objChanged && item.objectName === previousItem.objectName
                      ? saved.objectName
                      : item.objectName,
                });
                savedLrvMap.set(persistedLrv.id, persistedLrv);
              }
            }
            setLrvCatalog((prevCatalog) =>
              prevCatalog.map((item) => {
                const fromServer = savedLrvMap.get(item.id);
                if (fromServer) return fromServer;
                return item.rdCode === previousItem.rdCode
                  ? { ...item, rdCode: saved.rdCode }
                  : item;
              })
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
      canEditLineList,
      currentUser.fullName,
      currentUser.login,
      isAuthenticated,
      joints,
      lrvCatalog,
      notifyError,
      projectLineList,
      recordUndoSnapshot,
      reportError,
      selectedObjectName,
      selectedRdCode,
      setIsDbSyncing,
      setIsLoginModalOpen,
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
        notifyError('Групповое редактирование запрещено: требуется авторизация на сервере FastAPI.');
        return;
      }
      if (!canEditLineList) {
        notifyError(lineListPermissionError);
        return;
      }
      if (selectedIds.length === 0) return;

      recordUndoSnapshot(`Групповое ред. лайнлиста · ${selectedIds.length} стр.`);
      const selectedSet = new Set(selectedIds);
      const prevLinesById = new Map(projectLineList.map((l) => [l.id, l]));
      const nextLineList = applyBulkUpdateToLineList(
        projectLineList,
        selectedIds,
        patch
      );
      const serverTargets = nextLineList.filter(
        (item) => selectedSet.has(item.id) && UUID_RE.test(item.id)
      );

      try {
        setIsDbSyncing(true);
        const updatedMap = new Map<string, ProjectLineItem>();
        if (serverTargets.length > 0) {
          const batchRes = await zaychickApi.batchUpdateLines(serverTargets, true);
          for (const saved of batchRes.items) {
            updatedMap.set(saved.id, saved);
          }
        }
        const finalLineList = nextLineList.map(
          (item) => updatedMap.get(item.id) || item
        );
        setProjectLineList(finalLineList);

        // Синхронизируем локальные стыки, если у выбранных линий сменился объект, шифр РД или контур
        const changedByOldUid = new Map<string, ProjectLineItem>();
        for (const nextLine of finalLineList) {
          if (!selectedSet.has(nextLine.id)) continue;
          const prevLine = prevLinesById.get(nextLine.id);
          if (
            prevLine &&
            (prevLine.objectName !== nextLine.objectName ||
              prevLine.rdCode !== nextLine.rdCode ||
              prevLine.uniqueLineId !== nextLine.uniqueLineId ||
              prevLine.testContour !== nextLine.testContour)
          ) {
            changedByOldUid.set(prevLine.uniqueLineId, nextLine);
          }
        }
        if (changedByOldUid.size > 0) {
          setJoints((prevJoints) =>
            prevJoints.map((j) => {
              const updatedLine = changedByOldUid.get(j.uniqueLineId);
              if (!updatedLine) return j;
              return {
                ...j,
                objectName: updatedLine.objectName,
                rdCode: updatedLine.rdCode,
                lineNumber: updatedLine.lineNumber,
                uniqueLineId: updatedLine.uniqueLineId,
                contour: j.testCircuitId ? j.contour : updatedLine.testContour,
                version: (j.version ?? 1) + 1,
              };
            })
          );
        }

        syncExecutiveDocsCache(
          finalLineList.filter((item) => selectedSet.has(item.id))
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
      canEditLineList,
      currentUser.fullName,
      currentUser.login,
      isAuthenticated,
      notifyError,
      projectLineList,
      recordUndoSnapshot,
      reportError,
      setIsDbSyncing,
      setIsLoginModalOpen,
      setJoints,
      setProjectLineList,
    ]
  );

  const handleDeleteLineItems = useCallback(
    async (lineIds: string[]) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        notifyError('Удаление запрещено: требуется авторизация на сервере FastAPI.');
        return;
      }
      if (!canEditLineList) {
        notifyError(lineListPermissionError);
        return;
      }
      if (lineIds.length === 0) return;
      const idSet = new Set(lineIds);
      const linesToDelete = projectLineList.filter((l) => idSet.has(l.id));
      if (linesToDelete.length === 0) return;

      recordUndoSnapshot(`Удаление линий из лайнлиста · ${linesToDelete.length} шт.`);
      try {
        setIsDbSyncing(true);
        const serverIds = linesToDelete
          .map((l) => l.id)
          .filter((id) => UUID_RE.test(id));
        if (serverIds.length === 1) {
          await zaychickApi.deleteLine(serverIds[0]);
        } else if (serverIds.length > 1) {
          await zaychickApi.batchDeleteLines(serverIds);
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
      canEditLineList,
      currentUser.fullName,
      currentUser.login,
      isAuthenticated,
      notifyError,
      projectLineList,
      recordUndoSnapshot,
      reportError,
      setIsDbSyncing,
      setIsLoginModalOpen,
      setJoints,
      setProjectLineList,
      setSelectedJointIds,
    ]
  );

  const handleDeleteObject = useCallback(
    async (objectName: string) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        notifyError('Удаление объекта запрещено: требуется авторизация на сервере FastAPI.');
        return;
      }
      if (!canEditLineList) {
        notifyError(lineListPermissionError);
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
      canEditLineList,
      currentUser.fullName,
      currentUser.login,
      isAuthenticated,
      notifyError,
      projectLineList,
      recordUndoSnapshot,
      reportError,
      selectedObjectName,
      serverFacilities,
      setIsDbSyncing,
      setIsLoginModalOpen,
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
        notifyError('[Ошибка доступа] Удаление шифра РД запрещено: требуется авторизация на сервере FastAPI.');
        return;
      }
      if (!canEditLineList) {
        notifyError(lineListPermissionError);
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
      canEditLineList,
      currentUser.fullName,
      currentUser.login,
      isAuthenticated,
      lrvCatalog,
      notifyError,
      projectLineList,
      recordUndoSnapshot,
      reportError,
      selectedRdCode,
      setIsDbSyncing,
      setIsLoginModalOpen,
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
        notifyError('[Ошибка доступа] Сохранение геолокации запрещено: требуется авторизация на сервере FastAPI.');
        return;
      }
      if (!canEditLineList) {
        notifyError(lineListPermissionError);
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
      canEditLineList,
      currentUser.login,
      handleSaveFacilityLocationLocal,
      isAuthenticated,
      lineListPermissionError,
      notifyError,
      reportError,
      serverFacilities,
      setIsLoginModalOpen,
      setServerFacilities,
    ]
  );

  const handleCreateStandaloneObject = useCallback(
    async (objectName: string) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        notifyError('[Ошибка доступа] Создание объекта запрещено: требуется авторизация на сервере FastAPI.');
        return;
      }
      if (!canEditLineList) {
        notifyError(lineListPermissionError);
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
    [
      canEditLineList,
      currentUser.login,
      ensureFacilityId,
      handleCreateStandaloneObjectLocal,
      isAuthenticated,
      notifyError,
      reportError,
      setIsLoginModalOpen,
    ]
  );

  return {
    handleAddLineItems,
    handleUpdateLineItem,
    handleBulkUpdateLineItems,
    handleDeleteLineItems,
    handleDeleteObject,
    handleDeleteRdCode,
    handleSaveFacilityLocation,
    handleCreateStandaloneObject,
  };
}
