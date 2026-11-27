import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api';
import { listExecutiveDocsApi, upsertExecutiveDocApi } from '../../api/executiveDocsApi';
import type {
  ExecutiveDocColumnKey,
  ExecutiveDocPatch,
  ExecutiveDocRecord,
  ExecutiveDocRow,
} from '../../types/executiveDocs';
import type { ExecutiveDocStatus } from '../../types/welding';
import {
  DEFAULT_EXECUTIVE_DOC_VISIBLE_COLUMNS,
  EXECUTIVE_DOC_COLUMNS,
} from '../../types/executiveDocs';

const DOCS_LOCAL_STORAGE_KEY = 'zaychick_executive_docs_v1';
const VISIBLE_COLS_STORAGE_KEY = 'zaychick_executive_docs_visible_cols_v2';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readStoredDocs(): Record<string, ExecutiveDocRecord> {
  try {
    const raw = window.localStorage.getItem(DOCS_LOCAL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, ExecutiveDocRecord>;
    }
  } catch {
    // ignore storage errors
  }
  return {};
}

function readStoredVisibleColumns(): ExecutiveDocColumnKey[] {
  try {
    const raw = window.localStorage.getItem(VISIBLE_COLS_STORAGE_KEY);
    if (!raw) return DEFAULT_EXECUTIVE_DOC_VISIBLE_COLUMNS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const validKeys = new Set<string>(EXECUTIVE_DOC_COLUMNS.map((c) => c.key));
      const order = EXECUTIVE_DOC_COLUMNS.map((c) => c.key);
      const selectedSet = new Set(
        parsed.filter(
          (k): k is ExecutiveDocColumnKey => typeof k === 'string' && validKeys.has(k)
        )
      );
      const ordered = order.filter((k) => selectedSet.has(k));
      if (ordered.length > 0) return ordered;
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_EXECUTIVE_DOC_VISIBLE_COLUMNS;
}

export interface UseExecutiveDocsStateParams {
  selectedObjectName: string;
  scopedLineIds: string[];
  isDbConnected: boolean;
  isAuthenticated: boolean;
  onSyncLineFields?: (
    lineId: string,
    patch: { idStatus?: ExecutiveDocStatus; responsiblePto?: string }
  ) => void;
}

export function useExecutiveDocsState({
  selectedObjectName,
  scopedLineIds,
  isDbConnected,
  isAuthenticated,
  onSyncLineFields,
}: UseExecutiveDocsStateParams) {
  const [docByLineId, setDocByLineId] = useState<Record<string, ExecutiveDocRecord>>(readStoredDocs);
  const [visibleColumns, setVisibleColumns] = useState<ExecutiveDocColumnKey[]>(
    readStoredVisibleColumns
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [savingLineIds, setSavingLineIds] = useState<Record<string, boolean>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflictLineId, setConflictLineId] = useState<string | null>(null);

  const scopedLineIdsRef = useRef<string[]>(scopedLineIds);
  scopedLineIdsRef.current = scopedLineIds;

  useEffect(() => {
    try {
      window.localStorage.setItem(DOCS_LOCAL_STORAGE_KEY, JSON.stringify(docByLineId));
    } catch {
      // ignore storage errors
    }
  }, [docByLineId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(VISIBLE_COLS_STORAGE_KEY, JSON.stringify(visibleColumns));
    } catch {
      // ignore storage errors
    }
  }, [visibleColumns]);

  const reloadFromServer = useCallback(async () => {
    if (!isDbConnected || !isAuthenticated) return;
    setIsLoading(true);
    setErrorMessage(null);
    setConflictLineId(null);
    try {
      const objectScope =
        selectedObjectName && selectedObjectName !== 'ALL' ? selectedObjectName : undefined;
      const list = await listExecutiveDocsApi({ objectName: objectScope });

      setDocByLineId((prev) => {
        if (!objectScope) {
          // Полная перезагрузка по всем объектам: очищаем устаревший кэш
          const fresh: Record<string, ExecutiveDocRecord> = {};
          for (const rec of list) {
            fresh[rec.lineId] = rec;
          }
          return fresh;
        }
        // Перезагрузка по конкретному объекту: удаляем устаревшие ключи текущего объекта
        const next: Record<string, ExecutiveDocRecord> = { ...prev };
        for (const id of scopedLineIdsRef.current) {
          delete next[id];
        }
        for (const rec of list) {
          next[rec.lineId] = rec;
        }
        return next;
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Не удалось загрузить данные исполнительной документации.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, isDbConnected, selectedObjectName]);

  useEffect(() => {
    void reloadFromServer();
  }, [reloadFromServer]);

  const saveRowPatch = useCallback(
    async (row: ExecutiveDocRow, patch: ExecutiveDocPatch) => {
      const lineId = row.lineId;
      const existing = docByLineId[lineId];
      const nowIso = new Date().toISOString();

      const nextNoteText =
        'noteText' in patch ? (patch.noteText ?? '').trim() || null : row.noteText || null;
      const noteChanged =
        'noteText' in patch && (row.noteText || '').trim() !== (nextNoteText || '');
      const nextNoteUpdatedAt = noteChanged
        ? nextNoteText
          ? nowIso
          : null
        : row.noteUpdatedAt;

      const optimisticRecord: ExecutiveDocRecord = {
        id: existing?.id,
        lineId,
        priority: 'priority' in patch ? patch.priority ?? null : row.priority,
        idStatus: patch.idStatus ?? row.idStatus,
        workProducer:
          'workProducer' in patch
            ? (patch.workProducer ?? '').trim() || null
            : row.workProducer || null,
        ptoEngineer:
          'ptoEngineer' in patch
            ? (patch.ptoEngineer ?? '').trim() || null
            : row.ptoEngineer || null,
        preStageStatus: patch.preStageStatus ?? row.preStageStatus,
        physicsStatus: patch.physicsStatus ?? row.physicsStatus,
        geodesyStatus: patch.geodesyStatus ?? row.geodesyStatus,
        noteText: nextNoteText,
        noteUpdatedAt: nextNoteUpdatedAt,
        version: existing ? existing.version : row.version,
        updatedAt: nowIso,
      };

      const syncLineIfNeeded = (
        nextIdStatus: ExecutiveDocStatus,
        nextPto: string | null | undefined
      ) => {
        if (!onSyncLineFields) return;
        const linePatch: { idStatus?: ExecutiveDocStatus; responsiblePto?: string } = {};
        if ('idStatus' in patch && patch.idStatus !== undefined) {
          linePatch.idStatus = nextIdStatus;
        }
        if ('ptoEngineer' in patch) {
          linePatch.responsiblePto = (nextPto ?? '').trim();
        }
        if (Object.keys(linePatch).length > 0) {
          onSyncLineFields(lineId, linePatch);
        }
      };

      const prevRecord = existing;
      setDocByLineId((prev) => ({
        ...prev,
        [lineId]: optimisticRecord,
      }));
      syncLineIfNeeded(optimisticRecord.idStatus, optimisticRecord.ptoEngineer);
      setErrorMessage(null);

      if (!isDbConnected || !isAuthenticated || !UUID_RE.test(lineId)) {
        setDocByLineId((prev) => ({
          ...prev,
          [lineId]: {
            ...optimisticRecord,
            version: (prevRecord?.version ?? 0) + 1,
          },
        }));
        return true;
      }

      setSavingLineIds((prev) => ({ ...prev, [lineId]: true }));
      try {
        const saved = await upsertExecutiveDocApi(
          lineId,
          patch,
          prevRecord ? prevRecord.version : undefined
        );
        setDocByLineId((prev) => ({
          ...prev,
          [lineId]: saved,
        }));
        syncLineIfNeeded(saved.idStatus, saved.ptoEngineer);
        setConflictLineId((cur) => (cur === lineId ? null : cur));
        return true;
      } catch (err: unknown) {
        setDocByLineId((prev) => {
          const copy = { ...prev };
          if (prevRecord) {
            copy[lineId] = prevRecord;
          } else {
            delete copy[lineId];
          }
          return copy;
        });
        syncLineIfNeeded(row.idStatus, row.ptoEngineer);

        if (err instanceof ApiError && err.status === 409) {
          setConflictLineId(lineId);
          setErrorMessage(
            'Строка была изменена другим пользователем. Обновите таблицу, чтобы загрузить актуальные данные.'
          );
        } else {
          setErrorMessage(
            err instanceof Error
              ? err.message
              : 'Ошибка сохранения данных исполнительной документации.'
          );
        }
        return false;
      } finally {
        setSavingLineIds((prev) => {
          const next = { ...prev };
          delete next[lineId];
          return next;
        });
      }
    },
    [docByLineId, isAuthenticated, isDbConnected, onSyncLineFields]
  );

  const saveBulkPatch = useCallback(
    async (
      rows: ExecutiveDocRow[],
      patch: ExecutiveDocPatch
    ): Promise<{ updatedCount: number; failedCount: number }> => {
      if (rows.length === 0 || Object.keys(patch).length === 0) {
        return { updatedCount: 0, failedCount: 0 };
      }
      setIsBulkSaving(true);
      let updatedCount = 0;
      let failedCount = 0;
      try {
        for (const row of rows) {
          const ok = await saveRowPatch(row, patch);
          if (ok) updatedCount += 1;
          else failedCount += 1;
        }
      } finally {
        setIsBulkSaving(false);
      }
      return { updatedCount, failedCount };
    },
    [saveRowPatch]
  );

  const toggleColumnVisibility = useCallback((colKey: ExecutiveDocColumnKey) => {
    setVisibleColumns((prev) => {
      if (prev.includes(colKey)) {
        if (prev.length <= 1) return prev;
        return prev.filter((k) => k !== colKey);
      }
      const order = EXECUTIVE_DOC_COLUMNS.map((c) => c.key);
      const nextSet = new Set([...prev, colKey]);
      return order.filter((k) => nextSet.has(k));
    });
  }, []);

  const showAllColumns = useCallback(() => {
    setVisibleColumns(DEFAULT_EXECUTIVE_DOC_VISIBLE_COLUMNS);
  }, []);

  return {
    docByLineId,
    visibleColumns,
    setVisibleColumns,
    toggleColumnVisibility,
    showAllColumns,
    isLoading,
    isBulkSaving,
    savingLineIds,
    errorMessage,
    setErrorMessage,
    conflictLineId,
    reloadFromServer,
    saveRowPatch,
    saveBulkPatch,
  };
}
