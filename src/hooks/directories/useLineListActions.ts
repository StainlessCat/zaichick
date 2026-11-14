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
import type { FacilityGeoOverride } from '../useServerSync';
import { UUID_RE } from './common';

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

  const handleAddLineItems = useCallback(
    async (newItems: ProjectLineItem[]) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        notifyError('Действие запрещено: требуется авторизация на сервере FastAPI.');
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
      currentUser.login,
      isAuthenticated,
      notifyError,
      projectLineList,
      recordUndoSnapshot,
      reportError,
      setIsDbSyncing,
      setIsLoginModalOpen,
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
        notifyError('[Ошибка доступа] Удаление шифра РД запрещено: требуется авторизация на сервере FastAPI.');
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
      currentUser.login,
      handleSaveFacilityLocationLocal,
      isAuthenticated,
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
