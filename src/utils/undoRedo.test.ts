import { test, assert } from 'vitest';
import {
  canRedo,
  canUndo,
  createSystemAuditEntry,
  getRedoActionLabel,
  getUndoActionLabel,
  MAX_HISTORY_STEPS,
  performRedoStep,
  performUndoStep,
  pushHistorySnapshot,
  resolveAuditOperationType,
} from './undoRedo';
import type { UserAccount } from '../types/welding';

test('undoRedo: pushHistorySnapshot pushes state, resets redo, and strictly caps at maxSteps', () => {
  assert.equal(MAX_HISTORY_STEPS, 10);

  let undoStack: number[] = [];
  for (let i = 1; i <= 15; i++) {
    undoStack = pushHistorySnapshot(undoStack, i, 10).undoStack;
  }
  assert.equal(undoStack.length, 10);
  assert.deepEqual(undoStack, [6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);

  const resWithRedo = pushHistorySnapshot([1, 2], 3);
  assert.deepEqual(resWithRedo.redoStack, []);
});

test('undoRedo: performUndoStep and performRedoStep cycle state accurately with 10-step limit', () => {
  let undo: string[] = ['state1', 'state2'];
  let redo: string[] = [];
  let current = 'state3';

  // Undo step 1
  const step1 = performUndoStep(undo, redo, current);
  assert.equal(step1.targetState, 'state2');
  assert.deepEqual(step1.undoStack, ['state1']);
  assert.deepEqual(step1.redoStack, ['state3']);

  // Undo step 2
  const step2 = performUndoStep(step1.undoStack, step1.redoStack, step1.targetState!);
  assert.equal(step2.targetState, 'state1');
  assert.deepEqual(step2.undoStack, []);
  assert.deepEqual(step2.redoStack, ['state3', 'state2']);

  // Undo step 3 (empty undo stack)
  const step3 = performUndoStep(step2.undoStack, step2.redoStack, step2.targetState!);
  assert.equal(step3.targetState, null);

  // Redo step 1
  const redoStep1 = performRedoStep(step2.undoStack, step2.redoStack, step2.targetState!);
  assert.equal(redoStep1.targetState, 'state2');
  assert.deepEqual(redoStep1.undoStack, ['state1']);
  assert.deepEqual(redoStep1.redoStack, ['state3']);

  // Redo step 2
  const redoStep2 = performRedoStep(redoStep1.undoStack, redoStep1.redoStack, redoStep1.targetState!);
  assert.equal(redoStep2.targetState, 'state3');
  assert.deepEqual(redoStep2.undoStack, ['state1', 'state2']);
  assert.deepEqual(redoStep2.redoStack, []);

  // Redo step 3 (empty redo stack)
  const redoStep3 = performRedoStep(redoStep2.undoStack, redoStep2.redoStack, redoStep2.targetState!);
  assert.equal(redoStep3.targetState, null);
});

test('undoRedo: canUndo, canRedo, and action label helpers work', () => {
  assert.equal(canUndo([]), false);
  assert.equal(canUndo([1]), true);
  assert.equal(canRedo([]), false);
  assert.equal(canRedo(['a']), true);

  const snaps = [{ actionLabel: 'Редактирование стыка 010' }];
  assert.equal(getUndoActionLabel(snaps), 'Редактирование стыка 010');
  assert.equal(getUndoActionLabel([], 'нет действия'), 'нет действия');
  assert.equal(getRedoActionLabel(snaps), 'Редактирование стыка 010');
});

test('undoRedo: resolveAuditOperationType identifies system operation types', () => {
  assert.equal(resolveAuditOperationType('Создание стыка', ''), 'create_joint');
  assert.equal(
    resolveAuditOperationType('Аннулирование ЛРВ', 'статус ЛРВ'),
    'lrv_superseded'
  );
  assert.equal(
    resolveAuditOperationType('Пакетный импорт', 'Лайнлист проекта'),
    'linelist_change'
  );
  assert.equal(
    resolveAuditOperationType('Создание пользователя', 'Учетная запись'),
    'user_created'
  );
  assert.equal(
    resolveAuditOperationType('Удаление пользователя', 'Учетная запись'),
    'user_deleted'
  );
  assert.equal(
    resolveAuditOperationType('Редактирование профиля', 'Новый пароль'),
    'user_modified'
  );
  assert.equal(
    resolveAuditOperationType('Произвольное действие', 'Поле'),
    'single_edit'
  );
  assert.equal(
    resolveAuditOperationType('Любое', 'Любое', 'bulk_edit'),
    'bulk_edit'
  );
});

test('undoRedo: createSystemAuditEntry formats valid audit log entry with defaults and overrides', () => {
  const mockUser: Pick<UserAccount, 'login' | 'fullName' | 'role'> = {
    login: 'pto_ivanov',
    fullName: 'Иванов Иван Иванович',
    role: 'pto_engineer',
  };

  const entry = createSystemAuditEntry({
    currentUser: mockUser,
    actionType: 'Создание стыка',
    uniqueLineId: '01-100.01',
    jointNumber: '020',
    fieldChanged: 'Стык добавлен',
    oldValue: '',
    newValue: 'Создан',
    selectedRdCode: '01-100',
    timestampIso: '2026-11-15T09:00:00.000Z',
    id: 'aud-test-1',
  });

  assert.equal(entry.id, 'aud-test-1');
  assert.equal(entry.timestamp, '2026-11-15T09:00:00.000Z');
  assert.equal(entry.userLogin, 'pto_ivanov');
  assert.equal(entry.userFullName, 'Иванов Иван Иванович');
  assert.equal(entry.userRole, 'pto_engineer');
  assert.equal(entry.rdCode, '01-100');
  assert.equal(entry.operationType, 'create_joint');
  assert.equal(entry.fieldKey, 'system');

  // Проверка маппинга selectedRdCode = 'ALL' -> 'СИСТЕМА'
  const systemEntry = createSystemAuditEntry({
    currentUser: mockUser,
    actionType: 'Смена пароля',
    uniqueLineId: 'sys',
    jointNumber: '—',
    fieldChanged: 'пароль',
    oldValue: '***',
    newValue: '***',
    selectedRdCode: 'ALL',
  });
  assert.equal(systemEntry.rdCode, 'СИСТЕМА');
  assert.equal(systemEntry.operationType, 'user_modified');
});
