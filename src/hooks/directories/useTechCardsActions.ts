import { useCallback } from 'react';
import { zaychickApi } from '../../api';
import { TechCardItem, UserAccount } from '../../types/welding';
import { UUID_RE } from './common';

export interface UseTechCardsActionsParams {
  currentUser: UserAccount;
  techCards: TechCardItem[];
  setTechCards: React.Dispatch<React.SetStateAction<TechCardItem[]>>;
  recordUndoSnapshot: (actionLabel: string) => void;
  bumpRevisionMeta: (actionLabel: string, byUser?: string) => void;
  isAuthenticated: boolean;
  setIsDbSyncing: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLoginModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  notifyError: (msg: string) => void;
  reportError: (err: unknown, contextLabel: string) => void;
}

export function useTechCardsActions(params: UseTechCardsActionsParams) {
  const {
    currentUser,
    techCards,
    setTechCards,
    recordUndoSnapshot,
    bumpRevisionMeta,
    isAuthenticated,
    setIsDbSyncing,
    setIsLoginModalOpen,
    notifyError,
    reportError,
  } = params;

  const handleSaveTechCard = useCallback(
    async (tc: TechCardItem) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        notifyError('[Ошибка доступа] Сохранение техкарты запрещено: требуется авторизация на сервере FastAPI.');
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
      currentUser.login,
      isAuthenticated,
      notifyError,
      recordUndoSnapshot,
      reportError,
      setIsDbSyncing,
      setIsLoginModalOpen,
      setTechCards,
    ]
  );

  const handleDeleteTechCard = useCallback(
    async (id: string) => {
      if (!isAuthenticated || !currentUser.login) {
        setIsLoginModalOpen(true);
        notifyError('[Ошибка доступа] Удаление техкарты запрещено: требуется авторизация на сервере FastAPI.');
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
      currentUser.login,
      isAuthenticated,
      notifyError,
      recordUndoSnapshot,
      reportError,
      setIsDbSyncing,
      setIsLoginModalOpen,
      setTechCards,
      techCards,
    ]
  );

  return {
    handleSaveTechCard,
    handleDeleteTechCard,
  };
}
