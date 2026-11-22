import { describe, it, expect } from 'vitest';
import {
  calculateMaterialControlBalance,
  verifyMaterialForWelding,
  splitMaterialForPartialReplacement,
  normalizeDate,
  formatDateDisplay,
} from './materialControlLogic';
import { MOCK_MATERIALS_WITH_CONTROL } from '../data/mockMaterialControl';

describe('Material Control Invariants & Multi-Act Logic', () => {
  it('correctly calculates balance for 100% accepted material', () => {
    const pipe = MOCK_MATERIALS_WITH_CONTROL[0];
    const balance = calculateMaterialControlBalance(pipe.totalSpecQty, pipe.batches);

    expect(balance.controlStatus).toBe('accepted');
    expect(balance.acceptedQty).toBe(120);
    expect(balance.rejectedQty).toBe(0);
    expect(balance.pendingQty).toBe(0);
  });

  it('correctly calculates multi-act balance with 1 rejected item', () => {
    const valves = MOCK_MATERIALS_WITH_CONTROL[1];
    const balance = calculateMaterialControlBalance(valves.totalSpecQty, valves.batches);

    expect(balance.controlStatus).toBe('rejected');
    expect(balance.acceptedQty).toBe(19);
    expect(balance.rejectedQty).toBe(1);
    expect(balance.pendingQty).toBe(0);
  });

  it('blocks material without incoming control acts', () => {
    const bend = MOCK_MATERIALS_WITH_CONTROL[3];
    const check = verifyMaterialForWelding(bend, undefined, '2026-10-15');

    expect(check.isAllowed).toBe(false);
    expect(check.blockReason).toContain('не имеет утверждённых актов входного контроля');
  });

  it('blocks welding if weld date is earlier than incoming control act date', () => {
    const pipe = MOCK_MATERIALS_WITH_CONTROL[0]; // Act date: 2026-09-10
    // Try to weld on 2026-09-05 (5 days before incoming control act)
    const check = verifyMaterialForWelding(pipe, 'batch-pipe-01', '2026-09-05');

    expect(check.isAllowed).toBe(false);
    expect(check.blockReason).toContain('предшествует дате акта входного контроля');
    expect(check.earliestAllowedDate).toBe('2026-09-10');
  });

  it('allows welding if weld date is equal or later than incoming control act date', () => {
    const pipe = MOCK_MATERIALS_WITH_CONTROL[0]; // Act date: 2026-09-10
    const checkOnDate = verifyMaterialForWelding(pipe, 'batch-pipe-01', '2026-09-10');
    expect(checkOnDate.isAllowed).toBe(true);

    const checkLater = verifyMaterialForWelding(pipe, 'batch-pipe-01', '2026-09-25');
    expect(checkLater.isAllowed).toBe(true);
  });

  it('blocks welding for rejected batch', () => {
    const valves = MOCK_MATERIALS_WITH_CONTROL[1];
    const check = verifyMaterialForWelding(valves, 'batch-valve-02-bad', '2026-10-10');

    expect(check.isAllowed).toBe(false);
    expect(check.blockReason).toContain('забракована на входном контроле');
  });

  it('performs partial replacement split correctly', () => {
    const valves = MOCK_MATERIALS_WITH_CONTROL[1];
    const result = splitMaterialForPartialReplacement({
      originalMaterial: valves,
      rejectedBatchId: 'batch-valve-02-bad',
      replacedQuantity: 1,
      replacementNotice: {
        letterNumber: 'Письмо № 284/ГИП',
        letterDate: '2026-10-08',
        approvedBy: 'ООО «ПроектИнжиниринг»',
        reason: 'Отбраковка крана зав. № КШ-020. Замена на аналог из резерва.',
      },
      replacementCustomFields: {
        lrvCode: 'ЛРВ-001ТХ3-0501.З1',
        shortName: 'Кран шаровой DN200 PN6.3 (замена по письму)',
        material: '09Г2С',
        ntd: 'ГОСТ 28343-89',
        manufacturer: 'ПАО «Пензтяжпромарматура»',
        replacementBatch: {
          actNumber: 'АВК-122',
          actDate: '2026-10-09',
          certificateNumber: '3310-Р',
          serialNumbers: ['КШ-РЕЗЕРВ-07'],
          verdict: 'accepted',
          inspectorName: 'Лебедев К. М.',
        },
      },
    });

    // Original has replaced status for the 1 bad item
    expect(result.updatedOriginal.acceptedQty).toBe(19);
    expect(result.updatedOriginal.replacedQty).toBe(1);
    expect(result.updatedOriginal.rejectedQty).toBe(0);

    // Replacement item is created for 1 item and has its own act
    expect(result.replacementItem.specQty).toBe(1);
    expect(result.replacementItem.acceptedQty).toBe(1);
    expect(result.replacementItem.controlStatus).toBe('accepted');
    expect(result.replacementItem.replacementNotice?.letterNumber).toBe('Письмо № 284/ГИП');
  });
});
