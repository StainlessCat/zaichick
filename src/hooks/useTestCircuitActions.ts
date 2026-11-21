import { useCallback } from 'react';
import { ApiError, extractCircuitAssignmentConflicts, zaychickApi } from '../api';
import type {
  CircuitAssignmentConflictItem,
  CircuitAssignmentResult,
  CircuitTestStatus,
  FacilityObject,
  ProjectLineItem,
  RecordStatus,
  SriStatus,
  TestCircuit,
  TestCircuitDetail,
  UserAccount,
  WeldJoint,
} from '../types/welding';
import { computeCircuitMetricsLocal } from '../utils/testCircuitCalc';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CircuitActionOutcome<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  conflicts?: CircuitAssignmentConflictItem[];
}

export interface UseTestCircuitActionsParams {
  currentUser: UserAccount;
  isDbConnected: boolean;
  isAuthenticated: boolean;
  serverFacilities: FacilityObject[];
  testCircuits: TestCircuit[];
  setTestCircuits: React.Dispatch<React.SetStateAction<TestCircuit[]>>;
  joints: WeldJoint[];
  setJoints: React.Dispatch<React.SetStateAction<WeldJoint[]>>;
  projectLineList: ProjectLineItem[];
  bumpRevisionMeta: (actionLabel: string, byUser?: string) => void;
  appendSystemAuditEntry: (
    actionType: string,
    uniqueLineId: string,
    jointNumber: string,
    fieldChanged: string,
    oldValue: string,
    newValue: string,
    jointId?: string,
    explicitOperationType?: 'test_circuit_change' | 'record_status_changed'
  ) => void;
}

export function useTestCircuitActions({
  currentUser,
  isDbConnected,
  isAuthenticated,
  serverFacilities,
  testCircuits,
  setTestCircuits,
  joints,
  setJoints,
  projectLineList,
  bumpRevisionMeta,
  appendSystemAuditEntry,
}: UseTestCircuitActionsParams) {
  const isOnline = isDbConnected && isAuthenticated;

  const refreshCircuitsAndJointsFromServer = useCallback(async () => {
    if (!isOnline) return;
    const [freshCircuits, freshJoints] = await Promise.all([
      zaychickApi.listTestCircuits().catch(() => null),
      zaychickApi.listJoints().catch(() => null),
    ]);
    if (freshCircuits) setTestCircuits(freshCircuits);
    if (freshJoints) setJoints(freshJoints);
  }, [isOnline, setJoints, setTestCircuits]);

  const recomputeLocalCircuits = useCallback(
    (nextCircuits: TestCircuit[], nextJoints: WeldJoint[]) => {
      return nextCircuits.map((c) => {
        const computed = computeCircuitMetricsLocal(c, nextJoints, projectLineList);
        const { joints: _j, ...summary } = computed;
        void _j;
        return summary;
      });
    },
    [projectLineList]
  );

  const handleLoadCircuitDetail = useCallback(
    async (circuitId: string): Promise<CircuitActionOutcome<TestCircuitDetail>> => {
      if (isOnline && UUID_RE.test(circuitId)) {
        try {
          const detail = await zaychickApi.getTestCircuit(circuitId);
          setTestCircuits((prev) =>
            prev.map((c) => (c.id === detail.id ? { ...c, ...detail } : c))
          );
          return { ok: true, data: detail };
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Не удалось загрузить контур';
          return {
            ok: false,
            error: msg,
            errorCode: err instanceof ApiError ? err.code : undefined,
          };
        }
      }

      const found = testCircuits.find((c) => c.id === circuitId);
      if (!found) {
        return { ok: false, error: 'Испытательный контур не найден.' };
      }
      const detail = computeCircuitMetricsLocal(found, joints, projectLineList);
      return { ok: true, data: detail };
    },
    [isOnline, joints, projectLineList, setTestCircuits, testCircuits]
  );

  const handleCreateCircuit = useCallback(
    async (payload: {
      facilityId?: string | null;
      objectName?: string | null;
      name: string;
      sriName?: string | null;
      sriStatus?: SriStatus;
      plannedDate?: string | null;
      actNumber?: string | null;
      actualTestDate?: string | null;
    }): Promise<CircuitActionOutcome<TestCircuit>> => {
      const trimmedName = payload.name.trim();
      if (!trimmedName) {
        return { ok: false, error: 'Укажите наименование испытательного контура.' };
      }

      const matchedFacility = serverFacilities.find(
        (f) =>
          (payload.facilityId && f.id === payload.facilityId) ||
          (payload.objectName && f.name === payload.objectName)
      );
      const facilityId = matchedFacility?.id || payload.facilityId || '';
      const objectName = matchedFacility?.name || payload.objectName || '';

      if (isOnline) {
        try {
          const created = await zaychickApi.createTestCircuit({
            ...payload,
            facilityId: UUID_RE.test(facilityId) ? facilityId : null,
            objectName,
            name: trimmedName,
          });
          setTestCircuits((prev) => [created, ...prev.filter((c) => c.id !== created.id)]);
          bumpRevisionMeta(`Создан контур «${created.name}»`, currentUser.fullName);
          return { ok: true, data: created };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : 'Ошибка создания контура',
            errorCode: err instanceof ApiError ? err.code : undefined,
          };
        }
      }

      // Offline / local preview fallback
      const duplicate = testCircuits.some(
        (c) =>
          (c.objectName === objectName || c.facilityId === facilityId) &&
          c.name.trim().toLowerCase() === trimmedName.toLowerCase()
      );
      if (duplicate) {
        return {
          ok: false,
          error: `Контур «${trimmedName}» уже существует на этом объекте.`,
          errorCode: 'CIRCUIT_DUPLICATE_NAME',
        };
      }

      const localCircuit: TestCircuit = {
        id: `local-circuit-${Date.now()}`,
        facilityId: facilityId || 'fac-local',
        objectName,
        name: trimmedName,
        sriName: payload.sriName?.trim() || null,
        sriStatus: payload.sriStatus || 'IN_DEVELOPMENT',
        testStatus: 'NOT_TESTED',
        plannedDate: payload.plannedDate || null,
        actualTestDate: payload.actualTestDate || null,
        actNumber: payload.actNumber?.trim() || null,
        recordStatus: 'DRAFT',
        version: 1,
        createdById: currentUser.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        totalJoints: 0,
        weldedJoints: 0,
        weldingJointsPercent: 0,
        totalDInch: 0,
        weldedDInch: 0,
        weldingDInchPercent: 0,
        totalEdi: 0,
        weldedEdi: 0,
        weldingEdiPercent: 0,
        defectiveJointsCount: 0,
        linesSummary: [],
      };
      setTestCircuits((prev) => [localCircuit, ...prev]);
      appendSystemAuditEntry(
        'Создан испытательный контур',
        objectName || 'Контур',
        '—',
        'Испытательный контур',
        '—',
        trimmedName,
        localCircuit.id,
        'test_circuit_change'
      );
      return { ok: true, data: localCircuit };
    },
    [
      appendSystemAuditEntry,
      bumpRevisionMeta,
      currentUser.fullName,
      currentUser.id,
      isOnline,
      serverFacilities,
      setTestCircuits,
      testCircuits,
    ]
  );

  const handleUpdateCircuit = useCallback(
    async (
      circuitId: string,
      payload: {
        version: number;
        name?: string;
        sriName?: string | null;
        sriStatus?: SriStatus;
        testStatus?: CircuitTestStatus;
        plannedDate?: string | null;
        actNumber?: string | null;
        actualTestDate?: string | null;
        force?: boolean;
      }
    ): Promise<CircuitActionOutcome<TestCircuitDetail>> => {
      if (isOnline && UUID_RE.test(circuitId)) {
        try {
          const updated = await zaychickApi.updateTestCircuit(circuitId, payload);
          const { joints: _j, ...summary } = updated;
          void _j;
          setTestCircuits((prev) =>
            prev.map((c) => (c.id === updated.id ? summary : c))
          );
          if (payload.name !== undefined) {
            setJoints((prev) =>
              prev.map((j) =>
                j.testCircuitId === updated.id ? { ...j, contour: updated.name } : j
              )
            );
          }
          bumpRevisionMeta(`Обновлён контур «${updated.name}»`, currentUser.fullName);
          return { ok: true, data: updated };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : 'Ошибка обновления контура',
            errorCode: err instanceof ApiError ? err.code : undefined,
          };
        }
      }

      // Offline / local fallback with readiness guardrails
      const target = testCircuits.find((c) => c.id === circuitId);
      if (!target) {
        return { ok: false, error: 'Испытательный контур не найден.' };
      }

      const metrics = computeCircuitMetricsLocal(target, joints, projectLineList);
      const nextSriStatus = payload.sriStatus ?? target.sriStatus;
      const nextTestStatus = payload.testStatus ?? target.testStatus;
      const nextActNumber =
        payload.actNumber !== undefined ? payload.actNumber?.trim() || null : target.actNumber;
      const nextActualDate =
        payload.actualTestDate !== undefined ? payload.actualTestDate || null : target.actualTestDate;

      if (nextTestStatus === 'TESTED') {
        if (!nextActNumber || !nextActualDate) {
          return {
            ok: false,
            error: 'Для перевода контура в статус «Испытано» обязательно укажите номер акта и фактическую дату испытания.',
            errorCode: 'CIRCUIT_ACT_FIELDS_REQUIRED',
          };
        }
        const blockers: string[] = [];
        if (metrics.totalJoints === 0) blockers.push('В контуре нет привязанных стыков');
        if (metrics.weldingJointsPercent < 100) {
          blockers.push(`Сварка выполнена не полностью (${metrics.weldedJoints} из ${metrics.totalJoints} стыков)`);
        }
        if (nextSriStatus !== 'APPROVED') {
          blockers.push('СРИ не согласована');
        }
        if (metrics.defectiveJointsCount > 0) {
          blockers.push(`Есть неисправленный брак (${metrics.defectiveJointsCount} стык.)`);
        }
        if (blockers.length > 0 && !payload.force) {
          return {
            ok: false,
            error: `Контур не готов к переводу в «Испытано»: ${blockers.join('; ')}.`,
            errorCode: 'CIRCUIT_NOT_READY_FOR_TEST',
          };
        }
      }

      const nextName = payload.name !== undefined ? payload.name.trim() : target.name;
      const nextRecordStatus: RecordStatus =
        nextTestStatus === 'TESTED' && target.recordStatus === 'DRAFT'
          ? 'VERIFIED'
          : target.recordStatus;

      const updatedBase: TestCircuit = {
        ...target,
        name: nextName,
        sriName: payload.sriName !== undefined ? payload.sriName?.trim() || null : target.sriName,
        sriStatus: nextSriStatus,
        testStatus: nextTestStatus,
        plannedDate: payload.plannedDate !== undefined ? payload.plannedDate || null : target.plannedDate,
        actNumber: nextActNumber,
        actualTestDate: nextActualDate,
        recordStatus: nextRecordStatus,
        version: target.version + 1,
        updatedAt: new Date().toISOString(),
      };

      const nextJoints =
        nextName !== target.name
          ? joints.map((j) =>
              j.testCircuitId === circuitId || (!j.testCircuitId && j.contour === target.name)
                ? { ...j, testCircuitId: circuitId, contour: nextName }
                : j
            )
          : joints;
      if (nextJoints !== joints) setJoints(nextJoints);

      const detail = computeCircuitMetricsLocal(updatedBase, nextJoints, projectLineList);
      const { joints: _j, ...summary } = detail;
      void _j;
      setTestCircuits((prev) => prev.map((c) => (c.id === circuitId ? summary : c)));
      appendSystemAuditEntry(
        'Обновлён испытательный контур',
        updatedBase.objectName || 'Контур',
        '—',
        'Параметры контура',
        target.name,
        nextName,
        circuitId,
        'test_circuit_change'
      );
      return { ok: true, data: detail };
    },
    [
      appendSystemAuditEntry,
      bumpRevisionMeta,
      currentUser.fullName,
      isOnline,
      joints,
      projectLineList,
      setJoints,
      setTestCircuits,
      testCircuits,
    ]
  );

  const handleChangeCircuitStatus = useCallback(
    async (
      circuit: TestCircuit,
      targetStatus: RecordStatus,
      reason?: string
    ): Promise<CircuitActionOutcome<TestCircuitDetail>> => {
      if (isOnline && UUID_RE.test(circuit.id)) {
        try {
          const updated = await zaychickApi.changeTestCircuitStatus(
            circuit.id,
            targetStatus,
            circuit.version,
            reason
          );
          const { joints: _j, ...summary } = updated;
          void _j;
          setTestCircuits((prev) =>
            prev.map((c) => (c.id === updated.id ? summary : c))
          );
          bumpRevisionMeta(
            `Статус контура «${updated.name}» → ${targetStatus}`,
            currentUser.fullName
          );
          return { ok: true, data: updated };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : 'Ошибка смены статуса контура',
            errorCode: err instanceof ApiError ? err.code : undefined,
          };
        }
      }

      const updatedBase: TestCircuit = {
        ...circuit,
        recordStatus: targetStatus,
        version: circuit.version + 1,
        updatedAt: new Date().toISOString(),
      };
      const detail = computeCircuitMetricsLocal(updatedBase, joints, projectLineList);
      const { joints: _j, ...summary } = detail;
      void _j;
      setTestCircuits((prev) => prev.map((c) => (c.id === circuit.id ? summary : c)));
      appendSystemAuditEntry(
        'Изменён статус записи контура',
        circuit.objectName || 'Контур',
        '—',
        'Статус записи',
        circuit.recordStatus,
        targetStatus,
        circuit.id,
        'record_status_changed'
      );
      return { ok: true, data: detail };
    },
    [
      appendSystemAuditEntry,
      bumpRevisionMeta,
      currentUser.fullName,
      isOnline,
      joints,
      projectLineList,
      setTestCircuits,
    ]
  );

  const handleDeleteCircuit = useCallback(
    async (circuit: TestCircuit): Promise<CircuitActionOutcome<void>> => {
      if (isOnline && UUID_RE.test(circuit.id)) {
        try {
          await zaychickApi.deleteTestCircuit(circuit.id, circuit.version);
          setTestCircuits((prev) => prev.filter((c) => c.id !== circuit.id));
          setJoints((prev) =>
            prev.map((j) =>
              j.testCircuitId === circuit.id ? { ...j, testCircuitId: null, contour: '' } : j
            )
          );
          bumpRevisionMeta(`Удалён контур «${circuit.name}»`, currentUser.fullName);
          return { ok: true };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : 'Ошибка удаления контура',
            errorCode: err instanceof ApiError ? err.code : undefined,
          };
        }
      }

      const nextJoints = joints.map((j) =>
        j.testCircuitId === circuit.id || (!j.testCircuitId && j.contour === circuit.name)
          ? { ...j, testCircuitId: null, contour: '' }
          : j
      );
      setJoints(nextJoints);
      setTestCircuits((prev) => prev.filter((c) => c.id !== circuit.id));
      appendSystemAuditEntry(
        'Удалён испытательный контур',
        circuit.objectName || 'Контур',
        '—',
        'Испытательный контур',
        circuit.name,
        'Удалён',
        circuit.id,
        'test_circuit_change'
      );
      return { ok: true };
    },
    [
      appendSystemAuditEntry,
      bumpRevisionMeta,
      currentUser.fullName,
      isOnline,
      joints,
      setJoints,
      setTestCircuits,
    ]
  );

  const handleAssignLinesToCircuit = useCallback(
    async (
      circuitId: string,
      lineIds: string[],
      overwriteExisting = false
    ): Promise<CircuitActionOutcome<CircuitAssignmentResult>> => {
      if (lineIds.length === 0) {
        return { ok: false, error: 'Выберите хотя бы одну линию.' };
      }

      if (isOnline && UUID_RE.test(circuitId)) {
        try {
          const result = await zaychickApi.assignLinesToCircuit(
            circuitId,
            lineIds,
            overwriteExisting
          );
          await refreshCircuitsAndJointsFromServer();
          bumpRevisionMeta(
            `Привязаны линии к контуру «${result.circuit.name}»`,
            currentUser.fullName
          );
          return { ok: true, data: result };
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) {
            const conflicts = extractCircuitAssignmentConflicts(err.detail);
            return {
              ok: false,
              error: err.message,
              errorCode: err.code || 'CIRCUIT_ASSIGNMENT_CONFLICT',
              conflicts,
            };
          }
          return {
            ok: false,
            error: err instanceof Error ? err.message : 'Ошибка привязки линий',
            errorCode: err instanceof ApiError ? err.code : undefined,
          };
        }
      }

      // Offline / local fallback
      const target = testCircuits.find((c) => c.id === circuitId);
      if (!target) return { ok: false, error: 'Испытательный контур не найден.' };

      const selectedLines = projectLineList.filter((l) => lineIds.includes(l.id));
      const uniqueLineIds = new Set(selectedLines.map((l) => l.uniqueLineId));
      const lineIdSet = new Set(lineIds);

      const candidateJoints = joints.filter(
        (j) =>
          (j.lineId && lineIdSet.has(j.lineId)) ||
          uniqueLineIds.has(j.uniqueLineId)
      );

      const circuitNameMap = new Map(testCircuits.map((c) => [c.id, c.name]));
      const conflicts: CircuitAssignmentConflictItem[] = [];
      for (const j of candidateJoints) {
        const boundId =
          j.testCircuitId ||
          testCircuits.find(
            (c) =>
              c.objectName === j.objectName &&
              c.name.trim() === (j.contour || '').trim()
          )?.id;
        if (boundId && boundId !== circuitId) {
          conflicts.push({
            jointId: j.id,
            jointNumber: j.jointNumber,
            uniqueLineId: j.uniqueLineId,
            lineNumber: j.lineNumber,
            currentCircuitId: boundId,
            currentCircuitName: circuitNameMap.get(boundId) || j.contour || '',
          });
        }
      }

      if (conflicts.length > 0 && !overwriteExisting) {
        return {
          ok: false,
          error: `Обнаружено ${conflicts.length} стыков, уже привязанных к другим контурам.`,
          errorCode: 'CIRCUIT_ASSIGNMENT_CONFLICT',
          conflicts,
        };
      }

      const targetJointIds = new Set(candidateJoints.map((j) => j.id));
      let affected = 0;
      const nextJoints = joints.map((j) => {
        if (!targetJointIds.has(j.id)) return j;
        if (j.testCircuitId === circuitId && j.contour === target.name) return j;
        affected += 1;
        return {
          ...j,
          testCircuitId: circuitId,
          contour: target.name,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser.login,
        };
      });

      const nextCircuits = recomputeLocalCircuits(
        testCircuits.map((c) => (c.id === circuitId ? { ...c, version: c.version + 1 } : c)),
        nextJoints
      );
      setJoints(nextJoints);
      setTestCircuits(nextCircuits);

      const updatedTarget = nextCircuits.find((c) => c.id === circuitId) || target;
      const detail = computeCircuitMetricsLocal(updatedTarget, nextJoints, projectLineList);
      return { ok: true, data: { circuit: detail, affectedJointsCount: affected } };
    },
    [
      bumpRevisionMeta,
      currentUser.fullName,
      currentUser.login,
      isOnline,
      joints,
      projectLineList,
      recomputeLocalCircuits,
      refreshCircuitsAndJointsFromServer,
      setJoints,
      setTestCircuits,
      testCircuits,
    ]
  );

  const handleAssignJointsToCircuit = useCallback(
    async (
      circuitId: string,
      jointIds: string[],
      overwriteExisting = false
    ): Promise<CircuitActionOutcome<CircuitAssignmentResult>> => {
      if (jointIds.length === 0) {
        return { ok: false, error: 'Выберите хотя бы один стык.' };
      }

      if (isOnline && UUID_RE.test(circuitId)) {
        try {
          const result = await zaychickApi.assignJointsToCircuit(
            circuitId,
            jointIds,
            overwriteExisting
          );
          await refreshCircuitsAndJointsFromServer();
          bumpRevisionMeta(
            `Привязаны стыки к контуру «${result.circuit.name}»`,
            currentUser.fullName
          );
          return { ok: true, data: result };
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) {
            const conflicts = extractCircuitAssignmentConflicts(err.detail);
            return {
              ok: false,
              error: err.message,
              errorCode: err.code || 'CIRCUIT_ASSIGNMENT_CONFLICT',
              conflicts,
            };
          }
          return {
            ok: false,
            error: err instanceof Error ? err.message : 'Ошибка привязки стыков',
            errorCode: err instanceof ApiError ? err.code : undefined,
          };
        }
      }

      // Offline / local fallback
      const target = testCircuits.find((c) => c.id === circuitId);
      if (!target) return { ok: false, error: 'Испытательный контур не найден.' };

      const idSet = new Set(jointIds);
      const selectedJoints = joints.filter((j) => idSet.has(j.id));
      const circuitNameMap = new Map(testCircuits.map((c) => [c.id, c.name]));

      const conflicts: CircuitAssignmentConflictItem[] = [];
      for (const j of selectedJoints) {
        const boundId =
          j.testCircuitId ||
          testCircuits.find(
            (c) =>
              c.objectName === j.objectName &&
              c.name.trim() === (j.contour || '').trim()
          )?.id;
        if (boundId && boundId !== circuitId) {
          conflicts.push({
            jointId: j.id,
            jointNumber: j.jointNumber,
            uniqueLineId: j.uniqueLineId,
            lineNumber: j.lineNumber,
            currentCircuitId: boundId,
            currentCircuitName: circuitNameMap.get(boundId) || j.contour || '',
          });
        }
      }

      if (conflicts.length > 0 && !overwriteExisting) {
        return {
          ok: false,
          error: `Обнаружено ${conflicts.length} стыков, уже привязанных к другим контурам.`,
          errorCode: 'CIRCUIT_ASSIGNMENT_CONFLICT',
          conflicts,
        };
      }

      let affected = 0;
      const nextJoints = joints.map((j) => {
        if (!idSet.has(j.id)) return j;
        if (j.testCircuitId === circuitId && j.contour === target.name) return j;
        affected += 1;
        return {
          ...j,
          testCircuitId: circuitId,
          contour: target.name,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser.login,
        };
      });

      const nextCircuits = recomputeLocalCircuits(
        testCircuits.map((c) => (c.id === circuitId ? { ...c, version: c.version + 1 } : c)),
        nextJoints
      );
      setJoints(nextJoints);
      setTestCircuits(nextCircuits);

      const updatedTarget = nextCircuits.find((c) => c.id === circuitId) || target;
      const detail = computeCircuitMetricsLocal(updatedTarget, nextJoints, projectLineList);
      return { ok: true, data: { circuit: detail, affectedJointsCount: affected } };
    },
    [
      bumpRevisionMeta,
      currentUser.fullName,
      currentUser.login,
      isOnline,
      joints,
      projectLineList,
      recomputeLocalCircuits,
      refreshCircuitsAndJointsFromServer,
      setJoints,
      setTestCircuits,
      testCircuits,
    ]
  );

  const handleUnassignJointsFromCircuit = useCallback(
    async (
      circuitId: string,
      jointIds: string[]
    ): Promise<CircuitActionOutcome<CircuitAssignmentResult>> => {
      if (jointIds.length === 0) {
        return { ok: false, error: 'Не выбраны стыки для отвязки.' };
      }

      if (isOnline && UUID_RE.test(circuitId)) {
        try {
          const result = await zaychickApi.unassignJointsFromCircuit(circuitId, jointIds);
          await refreshCircuitsAndJointsFromServer();
          bumpRevisionMeta(
            `Отвязаны стыки от контура «${result.circuit.name}»`,
            currentUser.fullName
          );
          return { ok: true, data: result };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : 'Ошибка отвязки стыков',
            errorCode: err instanceof ApiError ? err.code : undefined,
          };
        }
      }

      const target = testCircuits.find((c) => c.id === circuitId);
      if (!target) return { ok: false, error: 'Испытательный контур не найден.' };

      const idSet = new Set(jointIds);
      let affected = 0;
      const nextJoints = joints.map((j) => {
        if (!idSet.has(j.id)) return j;
        if (j.testCircuitId === circuitId || (!j.testCircuitId && j.contour === target.name)) {
          affected += 1;
          return {
            ...j,
            testCircuitId: null,
            contour: '',
            updatedAt: new Date().toISOString(),
            updatedBy: currentUser.login,
          };
        }
        return j;
      });

      const nextCircuits = recomputeLocalCircuits(
        testCircuits.map((c) => (c.id === circuitId ? { ...c, version: c.version + 1 } : c)),
        nextJoints
      );
      setJoints(nextJoints);
      setTestCircuits(nextCircuits);

      const updatedTarget = nextCircuits.find((c) => c.id === circuitId) || target;
      const detail = computeCircuitMetricsLocal(updatedTarget, nextJoints, projectLineList);
      return { ok: true, data: { circuit: detail, affectedJointsCount: affected } };
    },
    [
      bumpRevisionMeta,
      currentUser.fullName,
      currentUser.login,
      isOnline,
      joints,
      projectLineList,
      recomputeLocalCircuits,
      refreshCircuitsAndJointsFromServer,
      setJoints,
      setTestCircuits,
      testCircuits,
    ]
  );

  return {
    handleLoadCircuitDetail,
    handleCreateCircuit,
    handleUpdateCircuit,
    handleChangeCircuitStatus,
    handleDeleteCircuit,
    handleAssignLinesToCircuit,
    handleAssignJointsToCircuit,
    handleUnassignJointsFromCircuit,
    refreshCircuitsAndJointsFromServer,
  };
}
