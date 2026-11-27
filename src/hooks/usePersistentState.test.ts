import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearAllSectionFilters,
  readPersistentValue,
  SECTION_FILTER_STORAGE_PREFIX,
} from './usePersistentState';

describe('usePersistentState helpers', () => {
  beforeEach(() => {
    clearAllSectionFilters();
  });

  it('returns default value when storage is empty and reads valid JSON when present', () => {
    expect(readPersistentValue('test:empty', { q: '' })).toEqual({ q: '' });

    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(
        `${SECTION_FILTER_STORAGE_PREFIX}test:saved`,
        JSON.stringify({ q: '010', status: 'ALL' })
      );
      expect(readPersistentValue('test:saved', { q: '', status: 'ALL' })).toEqual({
        q: '010',
        status: 'ALL',
      });
    }
  });

  it('falls back to default value on corrupt JSON or failed validator', () => {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(
        `${SECTION_FILTER_STORAGE_PREFIX}test:corrupt`,
        '{bad-json'
      );
      expect(readPersistentValue('test:corrupt', 'default')).toBe('default');

      window.sessionStorage.setItem(
        `${SECTION_FILTER_STORAGE_PREFIX}test:invalid`,
        JSON.stringify(123)
      );
      expect(
        readPersistentValue(
          'test:invalid',
          'default',
          (v): v is string => typeof v === 'string'
        )
      ).toBe('default');
    }
  });

  it('clears all section filter keys on clearAllSectionFilters()', () => {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(
        `${SECTION_FILTER_STORAGE_PREFIX}journals:search`,
        JSON.stringify('020')
      );
      window.sessionStorage.setItem('unrelated_key', 'keep');

      clearAllSectionFilters();

      expect(
        window.sessionStorage.getItem(`${SECTION_FILTER_STORAGE_PREFIX}journals:search`)
      ).toBeNull();
      expect(window.sessionStorage.getItem('unrelated_key')).toBe('keep');
    }
  });
});
