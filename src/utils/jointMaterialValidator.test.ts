import { describe, it, expect } from 'vitest';
import { validateJointMaterialIncomingControl } from './jointMaterialValidator';
import { MOCK_MATERIALS_WITH_CONTROL } from '../data/mockMaterialControl';

describe('Joint Material Incoming Control & Chronology Validator', () => {
  it('passes validation when weld date is after incoming control act date', () => {
    // Pipe act date is 2026-09-10
    const issues = validateJointMaterialIncomingControl(
      {
        weldingDate: '2026-09-15',
        lrv1Code: 'ЛРВ-001ТХ3-0101',
      },
      MOCK_MATERIALS_WITH_CONTROL
    );

    expect(issues.length).toBe(0);
  });

  it('fails with chronology error if weld date is before incoming control act date', () => {
    // Pipe act date is 2026-09-10, try welding on 2026-09-02
    const issues = validateJointMaterialIncomingControl(
      {
        weldingDate: '2026-09-02',
        lrv1Code: 'ЛРВ-001ТХ3-0101',
      },
      MOCK_MATERIALS_WITH_CONTROL
    );

    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].title).toBe('Сварка раньше входного контроля Элемента 1');
    expect(issues[0].message).toContain('предшествует дате подписания акта входного контроля');
  });

  it('warns when element has no approved incoming control acts', () => {
    // Bend (Отвод) has status 'pending' and 0 batches
    const issues = validateJointMaterialIncomingControl(
      {
        weldingDate: '2026-10-15',
        lrv1Code: 'ЛРВ-001ТХ3-0301',
      },
      MOCK_MATERIALS_WITH_CONTROL
    );

    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].title).toBe('Элемент 1 не имеет акта входного контроля');
  });

  it('blocks joint when using a rejected serial number', () => {
    // Valve КШ-020 is rejected in batch-valve-02-bad
    const issues = validateJointMaterialIncomingControl(
      {
        weldingDate: '2026-10-15',
        lrv1Code: 'ЛРВ-001ТХ3-0501',
        elem1SerialNumber: 'КШ-020',
      } as any,
      MOCK_MATERIALS_WITH_CONTROL
    );

    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].title).toBe('Элемент 1 забракован лабораторией');
  });

  it('allows joint using replacement material from letter agreement', () => {
    // Replacement valve КШ-РЕЗЕРВ-07 has act dated 2026-10-09
    const issues = validateJointMaterialIncomingControl(
      {
        weldingDate: '2026-10-12',
        lrv1Code: 'ЛРВ-001ТХ3-0501.З1',
        elem1SerialNumber: 'КШ-РЕЗЕРВ-07',
      } as any,
      MOCK_MATERIALS_WITH_CONTROL
    );

    expect(issues.length).toBe(0);
  });
});
