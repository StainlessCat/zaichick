import { useCallback } from 'react';
import { zaychickApi } from '../../api';
import { UserAccount, WeldingMaterialCertificate } from '../../types/welding';
import { UUID_RE } from './common';

export interface UseMaterialsActionsParams {
  currentUser: UserAccount;
  weldingMaterials: WeldingMaterialCertificate[];
  setWeldingMaterials: React.Dispatch<
    React.SetStateAction<WeldingMaterialCertificate[]>
  >;
  recordUndoSnapshot: (actionLabel: string) => void;
  bumpRevisionMeta: (actionLabel: string, byUser?: string) => void;
  isAuthenticated: boolean;
  setIsDbSyncing: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLoginModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  notifyError: (msg: string) => void;
  reportError: (err: unknown, contextLabel: string) => void;
}

export function useMaterialsActions(params: UseMaterialsActionsParams) {
  const {
    currentUser,
    weldingMaterials,
    setWeldingMaterials,
    recordUndoSnapshot,
    bumpRevisionMeta,
    isAuthenticated,
    setIsDbSyncing,
    setIsLoginModalOpen,
    notifyError,
    reportError,
  } = params;

  const handleSaveMaterial = useCallback(
    async (mat: WeldingMaterialCertificate) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        notifyError('[Ошибка доступа] Сохранение СМ запрещено: требуется авторизация на сервере FastAPI.');
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
      currentUser.login,
      isAuthenticated,
      notifyError,
      recordUndoSnapshot,
      reportError,
      setIsDbSyncing,
      setIsLoginModalOpen,
      setWeldingMaterials,
    ]
  );

  const handleDeleteWeldingMaterial = useCallback(
    async (id: string) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        notifyError('[Ошибка доступа] Удаление СМ запрещено: требуется авторизация на сервере FastAPI.');
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
      currentUser.login,
      isAuthenticated,
      notifyError,
      recordUndoSnapshot,
      reportError,
      setIsDbSyncing,
      setIsLoginModalOpen,
      setWeldingMaterials,
      weldingMaterials,
    ]
  );

  return {
    handleSaveMaterial,
    handleDeleteWeldingMaterial,
  };
}
