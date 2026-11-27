import { describe, expect, it } from 'vitest';
import {
  appendMaterialToRecommendedList,
  buildTechCardCopyDraft,
  computeTechUsageCounts,
  createEmptyTechCardDraft,
  formatPreheatConditionLabel,
  suggestUniqueTechCardNumber,
  validateTechCardDraft,
} from './weldingTechUtils';
import {
  TechCardItem,
  WelderProfile,
  WeldingMaterialCertificate,
  WeldJoint,
} from '../types/welding';

const sampleTechCard: TechCardItem = {
  id: 'tc-1',
  version: 3,
  number: 'ТК-045-РАД/РД-01',
  title: 'Сварка стыковых соединений труб из стали 09Г2С',
  weldingType: 'РАД+РД',
  jointKind: 'Стыковое',
  elementCombination: 'Труба+Труба',
  ntd: 'СТО Газпром 15-1.1-002-2023',
  steelGroup: 'М01 (09Г2С)',
  minDiameterMm: 57,
  maxDiameterMm: 325,
  minWallThicknessMm: 4,
  maxWallThicknessMm: 16,
  recommendedMaterials: 'Св-08Г2С Ø2.0 / УОНИ-13/55 Ø3.0',
  preheatRules: [
    {
      ambientMinC: -60,
      ambientMaxC: -5,
      minPreheatTempC: 150,
      conditionLabel: 'При T возд. от -60 °C до -5 °C: подогрев ≥ +150 °C',
    },
  ],
};

describe('weldingTechUtils', () => {
  it('suggestUniqueTechCardNumber increments numeric suffix with leading zeros and skips collisions', () => {
    const existing: TechCardItem[] = [
      sampleTechCard,
      { ...sampleTechCard, id: 'tc-2', number: 'ТК-045-РАД/РД-02' },
    ];
    expect(suggestUniqueTechCardNumber('ТК-045-РАД/РД-01', existing)).toBe(
      'ТК-045-РАД/РД-03'
    );
  });

  it('suggestUniqueTechCardNumber appends -копия for non-numeric suffixes', () => {
    const existing: TechCardItem[] = [
      { ...sampleTechCard, id: 'tc-a', number: 'ТК-СТЫК-А' },
      { ...sampleTechCard, id: 'tc-b', number: 'ТК-СТЫК-А-копия' },
    ];
    expect(suggestUniqueTechCardNumber('ТК-СТЫК-А', existing)).toBe(
      'ТК-СТЫК-А-копия-2'
    );
  });

  it('buildTechCardCopyDraft deep-copies technological fields and strips server metadata', () => {
    const draft = buildTechCardCopyDraft(sampleTechCard, [sampleTechCard]);
    expect(draft.id).not.toBe(sampleTechCard.id);
    expect(draft.version).toBeUndefined();
    expect(draft.number).toBe('ТК-045-РАД/РД-02');
    expect(draft.title).toBe(sampleTechCard.title);
    expect(draft.recommendedMaterials).toBe(sampleTechCard.recommendedMaterials);
    expect(draft.preheatRules).toEqual(sampleTechCard.preheatRules);
    expect(draft.preheatRules).not.toBe(sampleTechCard.preheatRules);
    expect(draft.preheatRules[0]).not.toBe(sampleTechCard.preheatRules[0]);
  });

  it('createEmptyTechCardDraft produces blank number/title without hardcoded conflict', () => {
    const draft = createEmptyTechCardDraft();
    expect(draft.number).toBe('');
    expect(draft.title).toBe('');
    expect(draft.preheatRules.length).toBe(3);
  });

  it('validateTechCardDraft validates duplicate numbers on create and edit, title, ntd, and preheat ranges', () => {
    const existing: TechCardItem[] = [
      sampleTechCard,
      { ...sampleTechCard, id: 'tc-2', number: 'ТК-045-РАД/РД-02' },
    ];

    expect(
      validateTechCardDraft({ ...sampleTechCard, number: '   ' }, existing, null)
    ).toContain('шифр');

    // Duplicate on create
    expect(validateTechCardDraft(sampleTechCard, existing, null)).toContain(
      'уже существует'
    );

    // Same number on self edit is allowed
    expect(validateTechCardDraft(sampleTechCard, existing, 'tc-1')).toBeNull();

    // Renaming to another card's number is rejected
    expect(
      validateTechCardDraft(
        { ...sampleTechCard, number: 'ТК-045-РАД/РД-02' },
        existing,
        'tc-1'
      )
    ).toContain('уже существует');

    // Empty title and ntd
    expect(
      validateTechCardDraft({ ...sampleTechCard, title: '' }, existing, 'tc-1')
    ).toContain('наименование');
    expect(
      validateTechCardDraft({ ...sampleTechCard, ntd: '' }, existing, 'tc-1')
    ).toContain('нормативный документ');

    // Invalid preheat ambient range
    expect(
      validateTechCardDraft(
        {
          ...sampleTechCard,
          preheatRules: [
            {
              ambientMinC: 10,
              ambientMaxC: -5,
              minPreheatTempC: 100,
              conditionLabel: '',
            },
          ],
        },
        existing,
        'tc-1'
      )
    ).toContain('нижний предел');
  });

  it('formatPreheatConditionLabel formats positive and negative temperatures accurately', () => {
    expect(
      formatPreheatConditionLabel({
        ambientMinC: -40,
        ambientMaxC: 5,
        minPreheatTempC: 120,
      })
    ).toBe('При T возд. от -40 °C до +5 °C: подогрев ≥ +120 °C');

    expect(
      formatPreheatConditionLabel({
        ambientMinC: 5.1,
        ambientMaxC: 40,
        minPreheatTempC: 0,
      })
    ).toBe('При T возд. от +5.1 °C до +40 °C: подогрев не требуется');
  });

  it('appendMaterialToRecommendedList appends cleanly and avoids duplicates', () => {
    expect(appendMaterialToRecommendedList('', 'Св-08Г2С Ø2.0')).toBe(
      'Св-08Г2С Ø2.0'
    );
    expect(
      appendMaterialToRecommendedList('Св-08Г2С Ø2.0', 'УОНИ-13/55 Ø3.0')
    ).toBe('Св-08Г2С Ø2.0 / УОНИ-13/55 Ø3.0');
    expect(
      appendMaterialToRecommendedList(
        'Св-08Г2С Ø2.0 / УОНИ-13/55 Ø3.0',
        'уони-13/55 ø3.0'
      )
    ).toBe('Св-08Г2С Ø2.0 / УОНИ-13/55 Ø3.0');
  });

  it('computeTechUsageCounts counts joints for tech cards, welders, and materials without double-counting', () => {
    const welders: WelderProfile[] = [
      {
        id: 'w-1',
        stamp: 'А142',
        fullName: 'Иванов И.И.',
        certNumber: 'НАКС-1',
        allowedMethods: ['РАД+РД'],
        crewForeman: 'Мастер',
      },
      {
        id: 'w-2',
        stamp: 'БР-01',
        isBrigade: true,
        brigadeMembers: ['А142'],
        fullName: 'Иванов И.И.',
        certNumber: 'НАКС-1',
        allowedMethods: ['РАД+РД'],
        crewForeman: 'Мастер',
      },
    ];

    const materials: WeldingMaterialCertificate[] = [
      {
        id: 'm-1',
        brandAndDiameter: 'Св-08Г2С Ø2.0',
        materialType: 'Проволока сварочная',
        weldingMethod: 'РАД',
        batchNumber: 'П1',
        certificateNumber: 'С1',
        incomingControlAct: 'А1',
        incomingControlDate: '2026-01-10',
        status: 'Допущен в производство',
      },
    ];

    const joints = [
      {
        id: 'j-1',
        techCardNumber: 'ТК-045-РАД/РД-01',
        repairTechCard: 'ТК-045-РАД/РД-01',
        welderStamp: 'А142',
        repairWelderStamp: 'А142',
        brigadeStamp: 'БР-01',
        weldingMaterials: 'Св-08Г2С Ø2.0 / УОНИ-13/55 Ø3.0',
      },
      {
        id: 'j-2',
        techCardNumber: 'ТК-045-РАД/РД-01',
        welderStamp: 'A142', // латинская A — должна совпасть через normalizeStampString
        weldingMaterials: 'УОНИ-13/55 Ø3.0',
      },
    ] as unknown as WeldJoint[];

    const counts = computeTechUsageCounts(joints, [sampleTechCard], welders, materials);
    expect(counts.techCardCounts.get('tc-1')).toBe(2);
    expect(counts.welderCounts.get('А142')).toBe(2);
    expect(counts.welderCounts.get('БР-01')).toBe(1);
    expect(counts.materialCounts.get('m-1')).toBe(1);
  });
});
