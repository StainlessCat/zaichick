import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from 'react';

export const SECTION_FILTER_STORAGE_PREFIX = 'zaychick_section_filters_v1:';

const memoryFallbackStore = new Map<string, string>();

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readRawItem(fullKey: string): string | null {
  const storage = getSessionStorage();
  if (storage) {
    try {
      const val = storage.getItem(fullKey);
      if (val !== null) return val;
    } catch {
      // Fallback to memory store
    }
  }
  return memoryFallbackStore.get(fullKey) ?? null;
}

function writeRawItem(fullKey: string, serialized: string): void {
  memoryFallbackStore.set(fullKey, serialized);
  const storage = getSessionStorage();
  if (storage) {
    try {
      storage.setItem(fullKey, serialized);
    } catch {
      // Ignore quota / security errors; memory fallback already updated
    }
  }
}

export function readPersistentValue<T>(
  key: string,
  initialValue: T | (() => T),
  validate?: (val: unknown) => val is T
): T {
  const resolveDefault = () =>
    typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;

  const fullKey = `${SECTION_FILTER_STORAGE_PREFIX}${key}`;
  const raw = readRawItem(fullKey);
  if (raw === null) {
    return resolveDefault();
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (validate && !validate(parsed)) {
      return resolveDefault();
    }
    return parsed as T;
  } catch {
    return resolveDefault();
  }
}

/**
 * Хук состояния с автоматическим сохранением в sessionStorage в рамках текущей вкладки.
 * Сбрасывается при закрытии вкладки или вызове clearAllSectionFilters().
 */
export function usePersistentState<T>(
  key: string,
  initialValue: T | (() => T),
  validate?: (val: unknown) => val is T
): [T, Dispatch<SetStateAction<T>>] {
  const fullKey = `${SECTION_FILTER_STORAGE_PREFIX}${key}`;
  const validateRef = useRef(validate);
  validateRef.current = validate;

  const [state, setState] = useState<T>(() =>
    readPersistentValue(key, initialValue, validate)
  );

  const prevKeyRef = useRef(key);
  useEffect(() => {
    if (prevKeyRef.current !== key) {
      prevKeyRef.current = key;
      setState(readPersistentValue(key, initialValue, validateRef.current));
    }
  }, [key, initialValue]);

  const setPersistentState: Dispatch<SetStateAction<T>> = useCallback(
    (action) => {
      setState((prev) => {
        const next =
          typeof action === 'function' ? (action as (p: T) => T)(prev) : action;
        try {
          writeRawItem(fullKey, JSON.stringify(next));
        } catch {
          // Ignore serialization errors
        }
        return next;
      });
    },
    [fullKey]
  );

  return [state, setPersistentState];
}

/**
 * Удаляет все сохранённые фильтры разделов из sessionStorage и резервного кэша.
 */
export function clearAllSectionFilters(): void {
  for (const k of Array.from(memoryFallbackStore.keys())) {
    if (k.startsWith(SECTION_FILTER_STORAGE_PREFIX)) {
      memoryFallbackStore.delete(k);
    }
  }

  const storage = getSessionStorage();
  if (!storage) return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(SECTION_FILTER_STORAGE_PREFIX)) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      storage.removeItem(k);
    }
  } catch {
    // Ignore storage errors
  }
}
