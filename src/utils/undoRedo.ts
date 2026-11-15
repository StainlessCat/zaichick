/**
 * ZAYCHICK — Модуль управления историей снимков (Undo / Redo на 10 шагов)
 * и генерации записей журнала системного аудита.
 */

import type { AuditLogEntry, UserAccount } from '../types/welding';

/**
 * Максимальная глубина стека отмены / повтора действий пользователя (Undo / Redo на 10 действий)
 */
export const MAX_HISTORY_STEPS = 10;

/**
 * Добавляет снимок состояния в стек Undo (с ограничением в 10 шагов) и очищает стек Redo.
 */
export function pushHistorySnapshot<T>(
  undoStack: T[],
  snapshot: T,
  maxSteps: number = MAX_HISTORY_STEPS
): { undoStack: T[]; redoStack: T[] } {
  const nextUndo = [...undoStack, snapshot];
  if (nextUndo.length > maxSteps) {
    nextUndo.splice(0, nextUndo.length - maxSteps);
  }
  return {
    undoStack: nextUndo,
    redoStack: [],
  };
}

/**
 * Выполняет шаг Undo (Отменить): извлекает последний снимок из undoStack и помещает текущее состояние в redoStack (макс. 10 шагов).
 */
export function performUndoStep<T>(
  undoStack: T[],
  redoStack: T[],
  currentState: T,
  maxSteps: number = MAX_HISTORY_STEPS
): { targetState: T | null; undoStack: T[]; redoStack: T[] } {
  if (undoStack.length === 0) {
    return { targetState: null, undoStack, redoStack };
  }
  const nextUndo = [...undoStack];
  const targetState = nextUndo.pop()!;
  const nextRedo = [...redoStack, currentState];
  if (nextRedo.length > maxSteps) {
    nextRedo.splice(0, nextRedo.length - maxSteps);
  }
  return {
    targetState,
    undoStack: nextUndo,
    redoStack: nextRedo,
  };
}

/**
 * Выполняет шаг Redo (Повторить): извлекает последний снимок из redoStack и помещает текущее состояние в undoStack (макс. 10 шагов).
 */
export function performRedoStep<T>(
  undoStack: T[],
  redoStack: T[],
  currentState: T,
  maxSteps: number = MAX_HISTORY_STEPS
): { targetState: T | null; undoStack: T[]; redoStack: T[] } {
  if (redoStack.length === 0) {
    return { targetState: null, undoStack, redoStack };
  }
  const nextRedo = [...redoStack];
  const targetState = nextRedo.pop()!;
  const nextUndo = [...undoStack, currentState];
  if (nextUndo.length > maxSteps) {
    nextUndo.splice(0, nextUndo.length - maxSteps);
  }
  return {
    targetState,
    undoStack: nextUndo,
    redoStack: nextRedo,
  };
}

export function canUndo(undoStack: unknown[]): boolean {
  return undoStack.length > 0;
}

export function canRedo(redoStack: unknown[]): boolean {
  return redoStack.length > 0;
}

export function getUndoActionLabel<T extends { actionLabel?: string }>(
  undoStack: T[],
  fallback = 'действие'
): string {
  if (undoStack.length === 0) return fallback;
  return undoStack[undoStack.length - 1]?.actionLabel || fallback;
}

export function getRedoActionLabel<T extends { actionLabel?: string }>(
  redoStack: T[],
  fallback = 'действие'
): string {
  if (redoStack.length === 0) return fallback;
  return redoStack[redoStack.length - 1]?.actionLabel || fallback;
}

/**
 * Автоматическое определение типа операции аудита на основе контекста
 */
export function resolveAuditOperationType(
  actionType: string,
  fieldChanged: string,
  explicitOperationType?: AuditLogEntry['operationType']
): AuditLogEntry['operationType'] {
  if (explicitOperationType) {
    return explicitOperationType;
  }
  if (actionType === 'Создание стыка') {
    return 'create_joint';
  }
  const lowerAction = actionType.toLowerCase();
  const lowerField = fieldChanged.toLowerCase();
  if (lowerAction.includes('аннулирование лрв')) {
    return 'lrv_superseded';
  }
  if (lowerAction.includes('лайнлист') || lowerField.includes('лайнлист')) {
    return 'linelist_change';
  }
  if (lowerAction.includes('создание пользователя')) {
    return 'user_created';
  }
  if (lowerAction.includes('удаление пользователя')) {
    return 'user_deleted';
  }
  if (lowerAction.includes('пользовател') || lowerField.includes('парол')) {
    return 'user_modified';
  }
  return 'single_edit';
}

export interface CreateSystemAuditEntryParams {
  currentUser: Pick<UserAccount, 'login' | 'fullName' | 'role'>;
  actionType: string;
  uniqueLineId: string;
  jointNumber: string;
  fieldChanged: string;
  oldValue: string;
  newValue: string;
  selectedRdCode?: string;
  jointId?: string;
  explicitOperationType?: AuditLogEntry['operationType'];
  timestampIso?: string;
  id?: string;
}

/**
 * Создание валидной записи системного аудита
 */
export function createSystemAuditEntry(
  params: CreateSystemAuditEntryParams
): AuditLogEntry {
  const {
    currentUser,
    actionType,
    uniqueLineId,
    jointNumber,
    fieldChanged,
    oldValue,
    newValue,
    selectedRdCode = 'ALL',
    jointId = 'sys-dict',
    explicitOperationType,
    timestampIso = new Date().toISOString(),
    id = `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  } = params;

  return {
    id,
    timestamp: timestampIso,
    userLogin: currentUser.login,
    userFullName: currentUser.fullName,
    userRole: currentUser.role,
    jointId,
    jointNumber,
    uniqueLineId,
    rdCode: selectedRdCode === 'ALL' ? 'СИСТЕМА' : selectedRdCode,
    fieldKey: 'system',
    fieldLabel: fieldChanged,
    oldValue,
    newValue,
    operationType: resolveAuditOperationType(actionType, fieldChanged, explicitOperationType),
  };
}
