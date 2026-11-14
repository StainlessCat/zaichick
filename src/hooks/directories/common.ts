import { useCallback } from 'react';
import { ApiError, zaychickApi } from '../../api';
import { FacilityObject } from '../../types/welding';

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CommonDirectoryContext {
  isAuthenticated: boolean;
  setIsAuthenticated: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLoginModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsDbSyncing?: React.Dispatch<React.SetStateAction<boolean>>;
  setLastSyncError?: React.Dispatch<React.SetStateAction<string | null>>;
  recordUndoSnapshot: (actionLabel: string) => void;
  bumpRevisionMeta: (actionLabel: string, byUser?: string) => void;
}

export function useDirectoryErrorHandlers(
  setIsAuthenticated: React.Dispatch<React.SetStateAction<boolean>>,
  setIsLoginModalOpen: React.Dispatch<React.SetStateAction<boolean>>,
  setLastSyncError?: React.Dispatch<React.SetStateAction<string | null>>
) {
  const notifyError = useCallback(
    (msg: string) => {
      if (setLastSyncError) {
        setLastSyncError(msg);
      } else {
        console.warn(msg);
      }
    },
    [setLastSyncError]
  );

  const reportError = useCallback(
    (err: unknown, contextLabel: string) => {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setIsAuthenticated(false);
          setIsLoginModalOpen(true);
          notifyError(
            `Срок действия сессии истёк: ${err.message || 'Требуется повторный вход в систему.'}`
          );
          return;
        }
        if (err.status === 403) {
          notifyError(
            `Недостаточно прав (RBAC): ${err.message || 'Действие запрещено вашей ролью.'}`
          );
          return;
        }
        notifyError(`${contextLabel}: ${err.message}`);
        return;
      }
      const msg = err instanceof Error ? err.message : 'Сетевая ошибка';
      notifyError(
        `Сервер FastAPI недоступен (${contextLabel}: ${msg}). Проверьте запуск backend на порту 8000.`
      );
    },
    [notifyError, setIsAuthenticated, setIsLoginModalOpen]
  );

  return { notifyError, reportError };
}

export function useEnsureFacilityId(
  serverFacilities: FacilityObject[],
  derivedFacilities: FacilityObject[],
  setServerFacilities: React.Dispatch<React.SetStateAction<FacilityObject[]>>
) {
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

  return ensureFacilityId;
}
