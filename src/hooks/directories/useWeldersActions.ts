import { useCallback } from 'react';
import { ApiError, zaychickApi } from '../../api';
import { UserAccount, WelderProfile } from '../../types/welding';
import { UUID_RE } from './common';

export interface WelderActionResult {
  ok: boolean;
  error?: string;
}

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

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.message) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
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
    async (w: WelderProfile): Promise<WelderActionResult> => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        const msg =
          'Сохранение сварщика запрещено: требуется авторизация на сервере.';
        notifyError(`[Ошибка доступа] ${msg}`);
        return { ok: false, error: msg };
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
        return { ok: true };
      } catch (err) {
        reportError(err, 'Ошибка сохранения сварщика НАКС');
        return {
          ok: false,
          error: extractErrorMessage(err, 'Не удалось сохранить данные сварщика.'),
        };
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
    async (stamp: string): Promise<WelderActionResult> => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        const msg =
          'Удаление сварщика запрещено: требуется авторизация на сервере.';
        notifyError(`[Ошибка доступа] ${msg}`);
        return { ok: false, error: msg };
      }
      const target = welders.find((w) => w.stamp === stamp);
      if (!target) return { ok: false, error: 'Сварщик не найден.' };
      recordUndoSnapshot(`Удаление сварщика / клейма «${stamp}»`);
      try {
        setIsDbSyncing(true);
        if (target.id && UUID_RE.test(target.id)) {
          await zaychickApi.deleteWelder(target.id);
        }
        setWelders((prev) => prev.filter((w) => w.stamp !== stamp));
        bumpRevisionMeta(`Удалён сварщик ${stamp}`, currentUser.fullName);
        return { ok: true };
      } catch (err) {
        reportError(err, 'Ошибка удаления сварщика НАКС');
        return {
          ok: false,
          error: extractErrorMessage(err, 'Не удалось удалить сварщика.'),
        };
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
