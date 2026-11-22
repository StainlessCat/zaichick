import { useCallback } from 'react';
import { zaychickApi } from '../api';
import type {
  AuditLogEntry,
  NdtLabRequest,
  UserAccount,
  WeldJoint,
} from '../types/welding';
import { isJointConclusionCompletedForRequest } from '../utils/laboratoryLogic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface UseLabRequestActionsParams {
  isAuthenticated: boolean;
  currentUser: UserAccount;
  labRequests: NdtLabRequest[];
  setLabRequests: React.Dispatch<React.SetStateAction<NdtLabRequest[]>>;
  joints: WeldJoint[];
  jointActions: {
    handleBatchUpdateJointsFromLab: (
      jointUpdates: Array<{ jointId: string; patch: Partial<WeldJoint> }>,
      actionSummary: string
    ) => Promise<unknown>;
  };
  setLastSyncError?: (error: string | null) => void;
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
  bumpRevisionMeta: (reason: string, authorName: string) => void;
  recordUndoSnapshot: (actionLabel: string) => void;
}

export function useLabRequestActions({
  isAuthenticated,
  currentUser,
  labRequests,
  setLabRequests,
  joints,
  jointActions,
  setLastSyncError,
  appendSystemAuditEntry,
  bumpRevisionMeta,
  recordUndoSnapshot,
}: UseLabRequestActionsParams) {
  const handleCreateLabRequest = useCallback(
    async (newReq: NdtLabRequest): Promise<boolean> => {
      if (!isAuthenticated) {
        const msg =
          'Для регистрации заявки на НК требуется вход в систему под учётной записью инженера ПТО.';
        if (setLastSyncError) setLastSyncError(msg);
        return false;
      }
      try {
        const fresh = await zaychickApi.createLabRequest(newReq);
        setLabRequests((prev) => [
          fresh,
          ...prev.filter(
            (r) => r.id !== fresh.id && r.requestNumber !== fresh.requestNumber
          ),
        ]);
        bumpRevisionMeta(
          `Создана заявка на НК ${fresh.requestNumber}`,
          currentUser.fullName
        );
        appendSystemAuditEntry(
          'Подача заявки на НК от ПТО в Лабораторию',
          newReq.uniqueLineId,
          `${newReq.jointIds.length} ст.`,
          'Заявка на НК',
          '—',
          `${fresh.requestNumber} (${fresh.requestedMethod}, ${fresh.controlStage}) — ${fresh.createdBy}`,
          fresh.jointIds[0] || 'lab-req',
          'bulk_edit'
        );
        if (setLastSyncError) setLastSyncError(null);
        return true;
      } catch (err: unknown) {
        console.error('Серверная регистрация заявки на НК не удалась:', err);
        const errMsg =
          (err instanceof Error ? err.message : String(err)) || String(err);
        if (setLastSyncError) {
          setLastSyncError(`Ошибка регистрации заявки на НК на сервере: ${errMsg}`);
        }
        return false;
      }
    },
    [
      appendSystemAuditEntry,
      bumpRevisionMeta,
      currentUser.fullName,
      isAuthenticated,
      setLabRequests,
      setLastSyncError,
    ]
  );

  const handleAcceptLabRequest = useCallback(
    async (
      requestId: string,
      defectoscopistName: string,
      jointUpdates: Array<{ jointId: string; patch: Partial<WeldJoint> }>
    ): Promise<boolean> => {
      if (!isAuthenticated) {
        const msg =
          'Для приёмки заявки в работу требуется вход в систему под учётной записью дефектоскописта ЛНК.';
        if (setLastSyncError) setLastSyncError(msg);
        return false;
      }
      const targetReq = labRequests.find((r) => r.id === requestId);
      const acceptedAtIso = new Date().toISOString();

      try {
        const fresh = await zaychickApi.updateLabRequest(
          requestId,
          {
            status: 'В работе ЛНК',
            acceptedBy: defectoscopistName,
            acceptedAt: acceptedAtIso,
          },
          targetReq?.version
        );

        setLabRequests((prev) =>
          prev.map((r) => (r.id === requestId ? fresh : r))
        );

        if (jointUpdates.length > 0) {
          await jointActions.handleBatchUpdateJointsFromLab(
            jointUpdates,
            `ЛНК: Приём заявки ${targetReq?.requestNumber || ''} в работу (${defectoscopistName})`
          );
        }

        appendSystemAuditEntry(
          'Приём заявки на НК в работу дефектоскопистом ЛНК',
          targetReq?.uniqueLineId || 'ЛНК',
          `${targetReq?.jointIds.length ?? jointUpdates.length} ст.`,
          'Статус заявки НК',
          'Подана ПТО',
          `В работе ЛНК (${defectoscopistName})`,
          targetReq?.jointIds[0] || 'lab-accept',
          'bulk_edit'
        );
        bumpRevisionMeta(
          `Заявка НК ${targetReq?.requestNumber || ''} принята в работу`,
          currentUser.fullName
        );
        if (setLastSyncError) setLastSyncError(null);
        return true;
      } catch (err: unknown) {
        console.error('Серверное обновление статуса заявки не удалось:', err);
        const errMsg =
          (err instanceof Error ? err.message : String(err)) || String(err);
        if (setLastSyncError) {
          setLastSyncError(`Ошибка приёмки заявки на сервере: ${errMsg}`);
        }
        return false;
      }
    },
    [
      appendSystemAuditEntry,
      bumpRevisionMeta,
      currentUser.fullName,
      isAuthenticated,
      jointActions,
      labRequests,
      setLabRequests,
      setLastSyncError,
    ]
  );

  const handleSaveLabConclusions = useCallback(
    async (
      jointUpdates: Array<{ jointId: string; patch: Partial<WeldJoint> }>,
      actionSummary: string,
      relatedRequestId?: string
    ): Promise<boolean> => {
      if (jointUpdates.length === 0) return true;
      try {
        await jointActions.handleBatchUpdateJointsFromLab(
          jointUpdates,
          actionSummary
        );
        if (relatedRequestId) {
          const req = labRequests.find((r) => r.id === relatedRequestId);
          const acceptedBy = req?.acceptedBy || currentUser.fullName;
          const acceptedAt =
            req?.acceptedAt ||
            new Date().toISOString().slice(0, 16).replace('T', ' ');

          const updatedJointsMap = new Map<string, WeldJoint>(
            joints.map((j) => [j.id, j])
          );
          for (const u of jointUpdates) {
            const current = updatedJointsMap.get(u.jointId);
            if (current)
              updatedJointsMap.set(u.jointId, { ...current, ...u.patch });
          }
          const allJointsDone = req?.jointIds.every((jId) => {
            const j = updatedJointsMap.get(jId);
            return j && isJointConclusionCompletedForRequest(j, req.controlStage);
          });

          const nextStatus = allJointsDone
            ? 'Выполнена'
            : (req?.status || 'В работе ЛНК');
          const completedAt = allJointsDone
            ? new Date().toISOString()
            : req?.completedAt;

          setLabRequests((prev) =>
            prev.map((r) =>
              r.id !== relatedRequestId
                ? r
                : { ...r, acceptedBy, acceptedAt, status: nextStatus, completedAt }
            )
          );

          try {
            const fresh = await zaychickApi.updateLabRequest(
              relatedRequestId,
              { acceptedBy, acceptedAt, status: nextStatus, completedAt },
              req?.version
            );
            setLabRequests((prev) =>
              prev.map((r) => (r.id === relatedRequestId ? fresh : r))
            );
          } catch (err) {
            console.warn(
              'Серверное обновление заключения заявки не удалось:',
              err
            );
          }
        }
        return true;
      } catch (err) {
        console.error('Ошибка синхронизации заключений ЛНК с сервером:', err);
        return false;
      }
    },
    [currentUser.fullName, jointActions, joints, labRequests, setLabRequests]
  );

  const handleDeleteLabRequest = useCallback(
    async (requestId: string): Promise<boolean> => {
      const targetReq = labRequests.find((r) => r.id === requestId);
      recordUndoSnapshot(
        `Удаление заявки на НК ${targetReq?.requestNumber || requestId}`
      );
      setLabRequests((prev) => prev.filter((r) => r.id !== requestId));
      try {
        if (UUID_RE.test(requestId)) {
          await zaychickApi.deleteLabRequest(requestId);
        }
        appendSystemAuditEntry(
          'Удаление заявки на НК',
          targetReq?.uniqueLineId || 'ЛНК',
          `${targetReq?.jointIds.length || 0} ст.`,
          'Заявка на НК',
          targetReq?.requestNumber || requestId,
          'Удалена',
          requestId,
          'delete_joint'
        );
        bumpRevisionMeta(
          `Удалена заявка на НК ${targetReq?.requestNumber || ''}`,
          currentUser.fullName
        );
        return true;
      } catch (err) {
        console.error('Ошибка удаления заявки на НК на сервере:', err);
        if (targetReq) {
          setLabRequests((prev) => [targetReq, ...prev]);
        }
        return false;
      }
    },
    [
      appendSystemAuditEntry,
      bumpRevisionMeta,
      currentUser.fullName,
      labRequests,
      recordUndoSnapshot,
      setLabRequests,
    ]
  );

  return {
    handleCreateLabRequest,
    handleAcceptLabRequest,
    handleSaveLabConclusions,
    handleDeleteLabRequest,
  };
}
