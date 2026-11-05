/**
 * Управление историей снимков состояния и операциями Undo / Redo (10 шагов)
 */

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
