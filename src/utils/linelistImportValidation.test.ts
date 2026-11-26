import { describe, expect, it } from 'vitest';
import type { ProjectLineItem } from '../types/welding';
import {
  selectActionableImportItems,
  validateLineListImportPreview,
} from './linelistImportValidation';

function makeLine(overrides: Partial<ProjectLineItem> = {}): ProjectLineItem {
  return {
    id: 'l-1',
    objectName: 'УКПГ-2В',
    rdCode: 'РД-001',
    lineNumber: 'Л-01',
    uniqueLineId: 'РД-001-Л-01',
    lineName: 'Линия 1',
    product: '',
    testContour: '',
    weldingNtd: '',
    controlNtd: '',
    qualityLevel: '',
    pipelineCategory: '',
    workingPressure: '',
    workingTemperature: '',
    rkPercent: 0,
    uzkPercent: 0,
    pvkPercent: 0,
    testDate: '',
    idStatus: 'IN_WORK',
    responsiblePto: '',
    ...overrides,
  };
}

describe('linelistImportValidation', () => {
  it('classifies new rows, DB duplicates (including locked), in-file duplicates, and invalid rows', () => {
    const existing: ProjectLineItem[] = [
      makeLine({ id: 'db-1', lineNumber: 'Л-01', uniqueLineId: 'РД-001-Л-01', recordStatus: 'DRAFT' }),
      makeLine({ id: 'db-2', lineNumber: 'Л-02', uniqueLineId: 'РД-001-Л-02', recordStatus: 'LOCKED' }),
    ];

    const preview: ProjectLineItem[] = [
      makeLine({ id: 'p-1', lineNumber: 'Л-03', uniqueLineId: 'РД-001-Л-03', testDate: '2026-10-15' }),
      makeLine({ id: 'p-2', lineNumber: 'Л-03', uniqueLineId: 'РД-001-Л-03' }), // in-file duplicate
      makeLine({ id: 'p-3', lineNumber: 'Л-01', uniqueLineId: 'РД-001-Л-01' }), // db duplicate unlocked
      makeLine({ id: 'p-4', lineNumber: 'Л-02', uniqueLineId: 'РД-001-Л-02' }), // db duplicate locked
      makeLine({ id: 'p-5', objectName: '', lineNumber: 'Л-05', uniqueLineId: 'РД-001-Л-05' }), // missing object
      makeLine({ id: 'p-6', lineNumber: 'Л-06', uniqueLineId: 'РД-001-Л-06', testDate: '31.13.99' }), // invalid date
    ];

    const summary = validateLineListImportPreview(preview, existing);

    expect(summary.totalCount).toBe(6);
    expect(summary.newCount).toBe(1);
    expect(summary.duplicateFileCount).toBe(1);
    expect(summary.duplicateDbCount).toBe(2);
    expect(summary.duplicateLockedCount).toBe(1);
    expect(summary.invalidCount).toBe(2);

    expect(summary.rows[0].status).toBe('new');
    expect(summary.rows[1].status).toBe('duplicate_file');
    expect(summary.rows[2].status).toBe('duplicate_db');
    expect(summary.rows[2].isExistingLocked).toBe(false);
    expect(summary.rows[3].status).toBe('duplicate_db');
    expect(summary.rows[3].isExistingLocked).toBe(true);
    expect(summary.rows[4].status).toBe('invalid');
    expect(summary.rows[5].status).toBe('invalid');

    // In 'skip' mode only new rows are actionable
    const skipItems = selectActionableImportItems(summary, 'skip');
    expect(skipItems.map((i) => i.id)).toEqual(['p-1']);

    // In 'update' mode new rows + unlocked DB duplicates are actionable (locked DB duplicates excluded)
    const updateItems = selectActionableImportItems(summary, 'update');
    expect(updateItems.map((i) => i.id)).toEqual(['p-1', 'p-3']);
  });
});
