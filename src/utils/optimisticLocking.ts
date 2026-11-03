import {
  AuditLogEntry,
  OptimisticFieldDiff,
  OptimisticLockConflictPayload,
  WeldJoint,
} from '../types/welding';
import { ALL_COLUMNS, formatDateDDMMYY, isDateColumnKey } from './weldingLogic';

/**
 * Список проверяемых бизнес-полей сварного стыка для трёхстороннего сравнения (3-way merge)
 * при обнаружении конфликта оптимистической блокировки (HTTP 409 Conflict).
 */
export const COMPARABLE_JOINT_FIELDS: { key: keyof WeldJoint; label: string }[] = [
  ...ALL_COLUMNS.map((c) => ({ key: c.key as keyof WeldJoint, label: c.label })),
  { key: 'gostJointType', label: 'Тип сварного соединения (ГОСТ 16037-80)' },
  { key: 'weldingPosition', label: 'Положение при сварке (НАКС)' },
  { key: 'brigadeStamp', label: 'Бригадное клеймо' },
  { key: 'rootWeldControl', label: 'Отметка о контроле корня шва' },
  { key: 'steeloscopyInfo', label: 'Стилоскопирование металла шва' },
  { key: 'heatTreatOperator', label: 'Оператор-термист' },
  { key: 'heatTreatDiagramNumber', label: '№ диаграммы термообработки' },
  { key: 'hardnessTestInfo', label: 'Твердость металла шва' },
  { key: 'ndtReportNumber', label: '№ заключения НК' },
  { key: 'ferritePhaseInfo', label: 'Измерение ферритной фазы' },
];

function formatFieldVal(key: string, val: unknown): string {
  if (val === undefined || val === null) return '';
  if (Array.isArray(val)) return val.join(', ');
  const raw = String(val).trim();
  if (isDateColumnKey(key) && raw) {
    return formatDateDDMMYY(raw) || raw;
  }
  return raw;
}

/**
 * Проверяет совпадение ожидаемой клиентом версии записи (expectedVersion)
 * с актуальной версией в серверной СУБД (serverVersion).
 */
export function verifyOptimisticVersion(
  expectedVersion: number | undefined,
  serverVersion: number | undefined
): boolean {
  const exp = expectedVersion ?? 1;
  const srv = serverVersion ?? 1;
  return exp === srv;
}

/**
 * Вычисляет детальный протокол расхождений при конфликте оптимистической блокировки (OCC 409 Conflict)
 * и строит проект автоматического умного слияния (3-Way Auto-Merge).
 */
export function computeJointOptimisticConflict(
  baseRecord: WeldJoint | null | undefined,
  clientRecord: WeldJoint,
  serverRecord: WeldJoint,
  customLabels?: Record<string, string>
): OptimisticLockConflictPayload {
  const fieldDiffs: OptimisticFieldDiff[] = [];
  const autoMerged: WeldJoint = {
    ...serverRecord,
  };

  const seenKeys = new Set<string>();

  for (const item of COMPARABLE_JOINT_FIELDS) {
    const key = String(item.key);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const k = item.key;
    const rawBase = baseRecord ? baseRecord[k] : serverRecord[k];
    const rawClient = clientRecord[k];
    const rawServer = serverRecord[k];

    const strBase = String(rawBase ?? '').trim();
    const strClient = String(rawClient ?? '').trim();
    const strServer = String(rawServer ?? '').trim();

    if (strClient === strServer) {
      // Значения идентичны — конфликта по этому полю нет
      continue;
    }

    const clientChangedFromBase = baseRecord ? strClient !== strBase : true;
    const serverChangedFromBase = baseRecord ? strServer !== strBase : true;

    // Прямая коллизия: оба пользователя изменили одно и то же поле на разные значения
    const isDirectCollision = clientChangedFromBase && serverChangedFromBase;

    // Правило 3-Way Auto-Merge:
    // Если клиент менял это поле, а сервер НЕ менял (осталось как в baseRecord) -> берём значение клиента
    // Если сервер менял это поле, а клиент НЕ менял -> оставляем значение сервера
    // Если оба меняли (прямая коллизия) -> в проекте слияния приоритетно подставляем новое значение клиента, помечая флагом коллизии
    if (clientChangedFromBase && !serverChangedFromBase) {
      (autoMerged as unknown as Record<string, unknown>)[key] = rawClient;
    } else if (!clientChangedFromBase && serverChangedFromBase) {
      (autoMerged as unknown as Record<string, unknown>)[key] = rawServer;
    } else {
      (autoMerged as unknown as Record<string, unknown>)[key] = rawClient;
    }

    fieldDiffs.push({
      fieldKey: key,
      fieldLabel: customLabels?.[key] || item.label,
      baseValue: formatFieldVal(key, rawBase) || '—',
      clientValue: formatFieldVal(key, rawClient) || '—',
      serverValue: formatFieldVal(key, rawServer) || '—',
      isDirectCollision,
    });
  }

  // Также синхронизируем массив личных клейм сварщиков, если изменилось клеймо
  if (clientRecord.welderStamp !== serverRecord.welderStamp) {
    const baseStamp = baseRecord?.welderStamp ?? '';
    if (clientRecord.welderStamp !== baseStamp) {
      autoMerged.welderStampsList = clientRecord.welderStampsList;
      autoMerged.brigadeStamp = clientRecord.brigadeStamp;
    }
  }

  const expectedVersion = clientRecord.version ?? baseRecord?.version ?? 1;
  const actualServerVersion = serverRecord.version ?? 1;

  autoMerged.version = actualServerVersion;

  return {
    entityType: 'joint',
    entityId: serverRecord.id,
    entityTitle: `Стык № ${serverRecord.jointNumber} (линия ${serverRecord.uniqueLineId})`,
    expectedVersion,
    actualServerVersion,
    serverUpdatedBy: serverRecord.updatedBy || 'Другой пользователь',
    serverUpdatedAt: serverRecord.updatedAt || new Date().toISOString(),
    baseRecord: baseRecord || null,
    clientRecord,
    serverRecord,
    autoMergedRecord: autoMerged,
    fieldDiffs,
  };
}

/**
 * Выполняет сохранение сварного стыка с проверкой версии оптимистической блокировки (OCC).
 * Если версия устарела (expectedVersion !== existing.version) и не передан флаг forceOverwrite,
 * возвращает статус 'conflict' (аналог HTTP 409 Conflict) без перезаписи чужих изменений.
 */
export function applyOptimisticJointSave(params: {
  currentJoints: WeldJoint[];
  incomingJoint: WeldJoint;
  baseJoint?: WeldJoint | null;
  expectedVersion?: number;
  forceOverwrite?: boolean;
  user: { login: string; fullName: string; role: string };
  fieldLabels?: Record<string, string>;
  timestampIso?: string;
}):
  | {
      status: 'ok';
      savedJoint: WeldJoint;
      updatedJoints: WeldJoint[];
      auditEntries: AuditLogEntry[];
    }
  | {
      status: 'conflict';
      conflict: OptimisticLockConflictPayload;
    } {
  const {
    currentJoints,
    incomingJoint,
    baseJoint,
    expectedVersion,
    forceOverwrite = false,
    user,
    fieldLabels = {},
    timestampIso = new Date().toISOString(),
  } = params;

  const existing = currentJoints.find((j) => j.id === incomingJoint.id);

  // Редактирование существующей записи: проверяем оптимистическую блокировку по version
  if (existing) {
    const srvVersion = existing.version ?? 1;
    const expVersion = expectedVersion ?? incomingJoint.version ?? 1;

    if (!forceOverwrite && expVersion !== srvVersion) {
      const conflict = computeJointOptimisticConflict(
        baseJoint,
        { ...incomingJoint, version: expVersion },
        { ...existing, version: srvVersion },
        fieldLabels
      );
      return {
        status: 'conflict',
        conflict,
      };
    }

    const nextVersion = srvVersion + 1;
    const savedJoint: WeldJoint = {
      ...incomingJoint,
      jointNumber: existing.jointNumber, // Защита от переименования номера стыка
      version: nextVersion,
      updatedAt: timestampIso,
      updatedBy: user.fullName,
    };

    const auditEntries: AuditLogEntry[] = [];
    const seenAuditKeys = new Set<string>();
    for (const col of COMPARABLE_JOINT_FIELDS) {
      const colKeyStr = String(col.key);
      if (seenAuditKeys.has(colKeyStr)) continue;
      seenAuditKeys.add(colKeyStr);

      const key = col.key as keyof WeldJoint;
      const oldVal = String(existing[key] ?? '');
      const newVal = String(savedJoint[key] ?? '');
      if (oldVal !== newVal) {
        const isDate = isDateColumnKey(colKeyStr);
        auditEntries.push({
          id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: timestampIso,
          userLogin: user.login,
          userFullName: user.fullName,
          userRole: user.role,
          jointId: savedJoint.id,
          jointNumber: savedJoint.jointNumber,
          uniqueLineId: savedJoint.uniqueLineId,
          rdCode: savedJoint.rdCode,
          fieldKey: colKeyStr,
          fieldLabel:
            (forceOverwrite ? '[Разрешение конфликта OCC] ' : '') +
            (fieldLabels[colKeyStr] || col.label),
          oldValue: (isDate ? formatDateDDMMYY(oldVal) : oldVal) || '—',
          newValue: (isDate ? formatDateDDMMYY(newVal) : newVal) || '—',
          operationType: 'single_edit',
        });
      }
    }

    const updatedJoints = currentJoints.map((j) =>
      j.id === savedJoint.id ? savedJoint : j
    );

    return {
      status: 'ok',
      savedJoint,
      updatedJoints,
      auditEntries,
    };
  }

  // Создание нового стыка (version = 1)
  const savedJoint: WeldJoint = {
    ...incomingJoint,
    version: 1,
    updatedAt: timestampIso,
    updatedBy: user.fullName,
  };

  const createAudit: AuditLogEntry = {
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: timestampIso,
    userLogin: user.login,
    userFullName: user.fullName,
    userRole: user.role,
    jointId: savedJoint.id,
    jointNumber: savedJoint.jointNumber,
    uniqueLineId: savedJoint.uniqueLineId,
    rdCode: savedJoint.rdCode,
    fieldKey: 'jointNumber',
    fieldLabel: savedJoint.isSupplementary
      ? 'Создание дополнительного стыка (v1)'
      : 'Создание основного стыка (v1)',
    oldValue: '—',
    newValue: `Стык № ${savedJoint.jointNumber} (${savedJoint.elem1Name} + ${savedJoint.elem2Name})`,
    operationType: 'create_joint',
  };

  return {
    status: 'ok',
    savedJoint,
    updatedJoints: [savedJoint, ...currentJoints],
    auditEntries: [createAudit],
  };
}
