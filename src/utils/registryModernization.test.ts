import { describe, it, expect } from 'vitest';
import { buildXlsxBinary } from './xlsxBuilder';
import {
  buildDuplicateJointIdsSet,
  computeRegistryQuickFilterCounts,
  filterAndSortJoints,
  getJointFieldValue,
} from './filters';
import { mergeSystemTemplates } from '../hooks/appState/useColumnsLayoutState';
import { INITIAL_COLUMN_TEMPLATES, INITIAL_JOINTS } from '../data/seedData';
import type { ColumnTemplate, WeldJoint } from '../types/welding';

function makeJoint(overrides: Partial<WeldJoint> = {}): WeldJoint {
  const base = INITIAL_JOINTS[0];
  return {
    ...base,
    id: overrides.id ?? 'test-joint-1',
    jointNumber: overrides.jointNumber ?? '010',
    uniqueLineId: overrides.uniqueLineId ?? 'TEST-LINE-100',
    ...overrides,
  };
}

describe('buildXlsxBinary', () => {
  it('generates a valid ZIP STORE OOXML binary with headers, types, escaping, and autofilter', () => {
    const bytes = buildXlsxBinary([
      {
        name: 'Оперативный реестр / 2026',
        headers: ['№ стыка', 'Диаметр, мм', 'Примечание <тест & "кавычки">'],
        rows: [
          ['010', 159, 'Норма & ок <1>'],
          ['020', 219.1, ''],
        ],
      },
    ]);

    // Local file header ZIP signature PK\x03\x04
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);

    // EOCD signature PK\x05\x06 near the end (last 22 bytes)
    const eocdOffset = bytes.length - 22;
    expect(bytes[eocdOffset]).toBe(0x50);
    expect(bytes[eocdOffset + 1]).toBe(0x4b);
    expect(bytes[eocdOffset + 2]).toBe(0x05);
    expect(bytes[eocdOffset + 3]).toBe(0x06);

    const text = new TextDecoder('utf-8').decode(bytes);
    expect(text).toContain('xl/worksheets/sheet1.xml');
    expect(text).toContain('xl/styles.xml');
    expect(text).toContain('№ стыка');
    expect(text).toContain('Примечание &lt;тест &amp; &quot;кавычки&quot;&gt;');
    expect(text).toContain('Норма &amp; ок &lt;1&gt;');
    // Numeric cells use <v> without inlineStr
    expect(text).toContain('<c r="B2" s="2"><v>159</v></c>');
    expect(text).toContain('<c r="B3" s="2"><v>219.1</v></c>');
    // Frozen header + autofilter
    expect(text).toContain('state="frozen"');
    expect(text).toContain('<autoFilter ref="A1:C3"/>');
  });

  it('produces a fallback sheet when given an empty sheets array', () => {
    const bytes = buildXlsxBinary([]);
    const text = new TextDecoder('utf-8').decode(bytes);
    expect(text).toContain('Нет данных');
  });
});

describe('Registry quick filters and duplicate detection', () => {
  const unwelded = makeJoint({
    id: 'j-unwelded',
    jointNumber: '010',
    uniqueLineId: 'L-1',
    weldingDate: '',
    welderStamp: '',
    vikResult: undefined,
    ndtResult: undefined,
  });

  const readyForLab = makeJoint({
    id: 'j-ready',
    jointNumber: '020',
    uniqueLineId: 'L-1',
    weldingDate: '2026-10-15',
    welderStamp: 'КЛ-01',
    weldingType: 'РАД',
    techCardNumber: 'ТК-01',
    vikResult: undefined,
    ndtResult: undefined,
    dupNdtResult: undefined,
  });

  const inRepair = makeJoint({
    id: 'j-repair',
    jointNumber: '030',
    uniqueLineId: 'L-1',
    weldingDate: '2026-10-12',
    welderStamp: 'КЛ-01',
    vikResult: 'Годен',
    ndtType: 'РК',
    ndtResult: 'Ремонт',
    dupNdtResult: undefined,
    repairDate: '',
    repairVikResult: undefined,
    repairNdtResult: undefined,
    repairDupNdtResult: undefined,
  });

  const dupA = makeJoint({
    id: 'j-dup-a',
    jointNumber: '040',
    uniqueLineId: 'L-2',
    weldingDate: '2026-10-16',
    welderStamp: 'КЛ-01',
    techCardNumber: '',
  });

  const dupB = makeJoint({
    id: 'j-dup-b',
    jointNumber: '040',
    uniqueLineId: 'L-2',
    weldingDate: '2026-10-17',
    welderStamp: 'КЛ-01',
  });

  const sample = [unwelded, readyForLab, inRepair, dupA, dupB];

  it('detects duplicate (uniqueLineId + jointNumber) pairs accurately', () => {
    const dupes = buildDuplicateJointIdsSet(sample);
    expect(dupes.has('j-dup-a')).toBe(true);
    expect(dupes.has('j-dup-b')).toBe(true);
    expect(dupes.has('j-ready')).toBe(false);
    expect(dupes.size).toBe(2);
  });

  it('computes quick filter counts and filters rows consistently', () => {
    const counts = computeRegistryQuickFilterCounts(sample, {
      labRequests: [],
      welders: [],
    });

    expect(counts.all).toBe(5);
    expect(counts.unwelded).toBe(1);
    expect(counts.in_repair).toBe(1);
    expect(counts.duplicates).toBe(2);
    expect(counts.incomplete).toBeGreaterThanOrEqual(1);
    expect(counts.ready_for_lab).toBeGreaterThanOrEqual(1);

    const onlyReady = filterAndSortJoints(sample, { quickFilter: 'ready_for_lab' });
    expect(onlyReady.some((j) => j.id === 'j-ready')).toBe(true);
    expect(onlyReady.some((j) => j.id === 'j-dup-b')).toBe(false);

    const onlyUnwelded = filterAndSortJoints(sample, { quickFilter: 'unwelded' });
    expect(onlyUnwelded.map((j) => j.id)).toEqual(['j-unwelded']);

    const onlyRepair = filterAndSortJoints(sample, { quickFilter: 'in_repair' });
    expect(onlyRepair.map((j) => j.id)).toEqual(['j-repair']);

    const onlyDupes = filterAndSortJoints(sample, { quickFilter: 'duplicates' });
    expect(onlyDupes.map((j) => j.id)).toEqual(['j-dup-a', 'j-dup-b']);
  });

  it('computes equivDiameterInch via getJointFieldValue', () => {
    const val = getJointFieldValue(
      makeJoint({ diameterMm: 159, wallThickness: 8 }),
      'equivDiameterInch'
    );
    expect(typeof val).toBe('number');
    expect(Number(val)).toBeGreaterThan(0);
  });
});

describe('mergeSystemTemplates', () => {
  it('always places tpl-operational-15 first and preserves custom user templates', () => {
    const custom: ColumnTemplate = {
      id: 'tpl-custom-user',
      name: 'Мой шаблон',
      description: 'Пользовательский набор столбцов',
      isSystem: false,
      columnOrder: INITIAL_COLUMN_TEMPLATES[0].columnOrder,
      visibleColumns: ['jointNumber', 'uniqueLineId', 'diameterMm'],
    };

    const legacyWithoutOperational = INITIAL_COLUMN_TEMPLATES.filter(
      (t) => t.id !== 'tpl-operational-15'
    );

    const merged = mergeSystemTemplates([...legacyWithoutOperational, custom]);
    expect(merged[0].id).toBe('tpl-operational-15');
    expect(merged[0].visibleColumns.length).toBe(15);
    expect(merged.some((t) => t.id === 'tpl-full-30')).toBe(true);
    expect(merged.some((t) => t.id === 'tpl-custom-user')).toBe(true);
    // No duplicate IDs
    const uniqueIds = new Set(merged.map((t) => t.id));
    expect(uniqueIds.size).toBe(merged.length);
  });
});
