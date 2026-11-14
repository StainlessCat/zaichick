import { useCallback } from 'react';
import { zaychickApi } from '../../api';
import { FacilityObject, LRVItem, UserAccount } from '../../types/welding';
import { UUID_RE } from './common';

export interface UseLrvActionsParams {
  currentUser: UserAccount;
  lrvCatalog: LRVItem[];
  setLrvCatalog: React.Dispatch<React.SetStateAction<LRVItem[]>>;
  selectedObjectName: string;
  derivedFacilities: FacilityObject[];
  ensureFacilityId: (objectName: string, existingFacilityId?: string) => Promise<string>;
  recordUndoSnapshot: (actionLabel: string) => void;
  bumpRevisionMeta: (actionLabel: string, byUser?: string) => void;
  isAuthenticated: boolean;
  setIsDbSyncing: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLoginModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  notifyError: (msg: string) => void;
  reportError: (err: unknown, contextLabel: string) => void;
}

export function useLrvActions(params: UseLrvActionsParams) {
  const {
    currentUser,
    lrvCatalog,
    setLrvCatalog,
    selectedObjectName,
    derivedFacilities,
    ensureFacilityId,
    recordUndoSnapshot,
    bumpRevisionMeta,
    isAuthenticated,
    setIsDbSyncing,
    setIsLoginModalOpen,
    notifyError,
    reportError,
  } = params;

  const handleAddLrvItems = useCallback(
    async (newItems: LRVItem[]) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        notifyError('[Ошибка доступа] Добавление в ЛРВ запрещено: требуется авторизация на сервере FastAPI.');
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
      currentUser.login,
      derivedFacilities,
      ensureFacilityId,
      isAuthenticated,
      notifyError,
      recordUndoSnapshot,
      reportError,
      selectedObjectName,
      setIsDbSyncing,
      setIsLoginModalOpen,
      setLrvCatalog,
    ]
  );

  const handleUpdateLrvItem = useCallback(
    async (updatedItem: LRVItem) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        notifyError('[Ошибка доступа] Редактирование ЛРВ запрещено: требуется авторизация на сервере FastAPI.');
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
      currentUser.login,
      isAuthenticated,
      lrvCatalog,
      notifyError,
      recordUndoSnapshot,
      reportError,
      setIsDbSyncing,
      setIsLoginModalOpen,
      setLrvCatalog,
    ]
  );

  const handleDeleteLrvItems = useCallback(
    async (ids: string[]) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        notifyError('[Ошибка доступа] Удаление из ЛРВ запрещено: требуется авторизация на сервере FastAPI.');
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
      currentUser.login,
      isAuthenticated,
      lrvCatalog,
      notifyError,
      recordUndoSnapshot,
      reportError,
      setIsDbSyncing,
      setIsLoginModalOpen,
      setLrvCatalog,
    ]
  );

  return {
    handleAddLrvItems,
    handleUpdateLrvItem,
    handleDeleteLrvItems,
  };
}
