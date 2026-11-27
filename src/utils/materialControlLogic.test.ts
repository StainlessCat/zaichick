import { describe, it, expect } from 'vitest';
import {
  calculateMaterialControlBalance,
  verifyMaterialForWelding,
  splitMaterialForPartialReplacement,
  normalizeDate,
  formatDateDisplay,
} from './materialControlLogic';
import { MOCK_MATERIALS_WITH_CONTROL } from '../data/mockMaterialControl';
import { detectLrvElementType } from './pipeCalc';
import { mapLrvDto, mapLrvToCreatePayload, mapLrvToUpdatePayload } from '../api/mappers';
import { getUserRolePermissions } from './rbac';

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

    // Original has replaced status for the 1 bad item and resolves to fully accepted (19 accepted + 1 replaced = 20)
    expect(result.updatedOriginal.acceptedQty).toBe(19);
    expect(result.updatedOriginal.replacedQty).toBe(1);
    expect(result.updatedOriginal.rejectedQty).toBe(0);
    expect(result.updatedOriginal.controlStatus).toBe('accepted');

    // Replacement item is created for 1 item and has its own act
    expect(result.replacementItem.specQty).toBe(1);
    expect(result.replacementItem.acceptedQty).toBe(1);
    expect(result.replacementItem.controlStatus).toBe('accepted');
    expect(result.replacementItem.replacementNotice?.letterNumber).toBe('Письмо № 284/ГИП');
  });

  it('keeps rejected status when both replaced and active rejected batches exist', () => {
    const balance = calculateMaterialControlBalance(20, [
      {
        id: 'b1',
        materialId: 'm1',
        actNumber: 'АВК-01',
        actDate: '2026-08-01',
        certificateNumber: 'С-1',
        quantity: 10,
        unit: 'шт',
        verdict: 'accepted',
      },
      {
        id: 'b2',
        materialId: 'm1',
        actNumber: 'АВК-02',
        actDate: '2026-08-02',
        certificateNumber: 'С-2',
        quantity: 2,
        unit: 'шт',
        verdict: 'replaced',
      },
      {
        id: 'b3',
        materialId: 'm1',
        actNumber: 'АВК-03',
        actDate: '2026-08-03',
        certificateNumber: 'С-3',
        quantity: 1,
        unit: 'шт',
        verdict: 'rejected',
        rejectionReason: 'Трещина корпуса',
      },
    ]);

    expect(balance.controlStatus).toBe('rejected');
    expect(balance.acceptedQty).toBe(10);
    expect(balance.replacedQty).toBe(2);
    expect(balance.rejectedQty).toBe(1);
    expect(balance.pendingQty).toBe(7);
  });

  it('normalizes and formats dates reliably', () => {
    expect(normalizeDate('15.08.2026')).toBe('2026-08-15');
    expect(formatDateDisplay('2026-08-15')).toBe('15.08.2026');
  });
});

describe('LRV Category, Persistence Mappers & Incoming Control RBAC', () => {
  it('classifies Тройник переходной as Тройник rather than Переход', () => {
    expect(detectLrvElementType('Тройник переходной 325х12-159х8')).toBe('Тройник');
    expect(detectLrvElementType('Переход К 325х12-159х8')).toBe('Переход');
  });

  it('preserves incoming control batches and replacement notice across API DTO roundtrip', () => {
    const batch = {
      id: 'batch-1',
      materialId: 'lrv-1',
      actNumber: 'АВК-501',
      actDate: '2026-09-10',
      certificateNumber: 'CERT-1',
      heatNumber: 'Пл. 100',
      quantity: 10,
      unit: 'шт' as const,
      verdict: 'accepted' as const,
      inspectorName: 'Иванов И.И.',
    };
    const notice = {
      letterNumber: 'Письмо 55/ПТО',
      letterDate: '2026-09-09',
      approvedBy: 'Проектный институт',
      originalMaterialId: 'lrv-0',
      originalMaterialCode: 'ЛРВ-001',
      replacedQuantity: 2,
      reason: 'Замена аналогом',
    };
    const mapped = mapLrvDto({
      id: 'lrv-1',
      lrv_code: 'ЛРВ-001.З1',
      rd_code: 'РД-1',
      object_name: 'УКПГ',
      short_name: 'Отвод 159х8',
      material: '09Г2С',
      ntd: 'ГОСТ 17375-2001',
      diameter_mm: 159,
      wall_thickness: 8,
      spec_qty: 10,
      unit: 'шт',
      status: 'active',
      batches: [batch],
      parent_material_id: 'lrv-0',
      replacement_notice: notice,
      version: 3,
    });

    expect(mapped.batches).toHaveLength(1);
    expect(mapped.batches?.[0].actNumber).toBe('АВК-501');
    expect(mapped.parentMaterialId).toBe('lrv-0');
    expect(mapped.replacementNotice?.letterNumber).toBe('Письмо 55/ПТО');
    expect(mapped.controlStatus).toBe('accepted');
    expect(mapped.acceptedQty).toBe(10);

    const createPayload = mapLrvToCreatePayload(mapped, 'fac-1');
    expect(createPayload.batches).toEqual([batch]);
    expect(createPayload.parent_material_id).toBe('lrv-0');
    expect(createPayload.replacement_notice).toEqual(notice);

    const updatePayload = mapLrvToUpdatePayload(mapped);
    expect(updatePayload.batches).toEqual([batch]);
    expect(updatePayload.parent_material_id).toBe('lrv-0');
    expect(updatePayload.replacement_notice).toEqual(notice);
  });

  it('grants incoming control rights to PTO, SK, PIL operators and SUPERADMIN, denies VIEWER and OGS', () => {
    expect(getUserRolePermissions({ login: 'admin', systemRole: 'SUPERADMIN', departmentCode: 'ALL' }).canManageIncomingControl).toBe(true);
    expect(getUserRolePermissions({ login: 'sk_op', systemRole: 'OPERATOR', departmentCode: 'SK' }).canManageIncomingControl).toBe(true);
    expect(getUserRolePermissions({ login: 'pil_op', systemRole: 'OPERATOR', departmentCode: 'PIL' }).canManageIncomingControl).toBe(true);
    expect(getUserRolePermissions({ login: 'pto_op', systemRole: 'OPERATOR', departmentCode: 'PTO' }).canManageIncomingControl).toBe(true);
    expect(getUserRolePermissions({ login: 'ogs_op', systemRole: 'DEPT_ADMIN', departmentCode: 'OGS' }).canManageIncomingControl).toBe(false);
    expect(getUserRolePermissions({ login: 'viewer', systemRole: 'VIEWER', departmentCode: 'SK' }).canManageIncomingControl).toBe(false);
    expect(getUserRolePermissions(null).canManageIncomingControl).toBe(false);
  });
});

