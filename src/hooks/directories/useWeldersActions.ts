import { useCallback } from 'react';
import { zaychickApi } from '../../api';
import { UserAccount, WelderProfile } from '../../types/welding';
import { UUID_RE } from './common';

export interface UseWeldersActionsParams {
  currentUser: UserAccount;
  welders: WelderProfile[];
  setWelders: React.Dispatch<React.SetStateAction<WelderProfile[]>>;
  recordUndoSnapshot: (actionLabel: string) => void;
  bumpRevisionMeta: (actionLabel: string, byUser?: string) => void;
  isAuthenticated: boolean;
  setIsDbSyncing: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLoginModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  notifyError: (msg: string) => void;
  reportError: (err: unknown, contextLabel: string) => void;
}

export function useWeldersActions(params: UseWeldersActionsParams) {
  const {
    currentUser,
    welders,
    setWelders,
    recordUndoSnapshot,
    bumpRevisionMeta,
    isAuthenticated,
    setIsDbSyncing,
    setIsLoginModalOpen,
    notifyError,
    reportError,
  } = params;

  const handleSaveWelder = useCallback(
    async (w: WelderProfile) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        notifyError('[Ошибка доступа] Сохранение сварщика запрещено: требуется авторизация на сервере FastAPI.');
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
      currentUser.login,
      isAuthenticated,
      notifyError,
      recordUndoSnapshot,
      reportError,
      setIsDbSyncing,
      setIsLoginModalOpen,
      setWelders,
    ]
  );

  const handleDeleteWelder = useCallback(
    async (stamp: string) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        notifyError('[Ошибка доступа] Удаление сварщика запрещено: требуется авторизация на сервере FastAPI.');
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
      currentUser.login,
      isAuthenticated,
      notifyError,
      recordUndoSnapshot,
      reportError,
      setIsDbSyncing,
      setIsLoginModalOpen,
      setWelders,
      welders,
    ]
  );

  return {
    handleSaveWelder,
    handleDeleteWelder,
  };
}
