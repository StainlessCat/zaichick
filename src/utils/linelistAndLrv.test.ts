import { describe, expect, it } from 'vitest';
import {
  cleanUnitDisplay,
  formatRangeValue,
  generateLrvFullName,
  parseRangeValue,
} from './weldingLogic';
import { detectLrvElementType, LRV_ELEMENT_TYPE_OPTIONS } from './pipeCalc';

describe('linelistUtils: range & units formatting', () => {
  it('cleanUnitDisplay strips °C and МПа', () => {
    expect(cleanUnitDisplay('-40...+60 °C')).toBe('-40...+60');
    expect(cleanUnitDisplay('11.8 МПа')).toBe('11.8');
    expect(cleanUnitDisplay('16,0 МПа')).toBe('16,0');
    expect(cleanUnitDisplay('5.5')).toBe('5.5');
    expect(cleanUnitDisplay(undefined)).toBe('—');
  });

  it('parseRangeValue correctly splits range or single values', () => {
    expect(parseRangeValue('-1,0...+21,8')).toEqual({ from: '-1,0', to: '+21,8' });
    expect(parseRangeValue('1,6...4,0')).toEqual({ from: '1,6', to: '4,0' });
    expect(parseRangeValue('16.0')).toEqual({ from: '16.0', to: '' });
    expect(parseRangeValue('-40...+60 °C')).toEqual({ from: '-40', to: '+60' });
    expect(parseRangeValue('')).toEqual({ from: '', to: '' });
  });

  it('formatRangeValue handles single value, equal values, and range combinations', () => {
    // Single value
    expect(formatRangeValue('16,0', '', false)).toBe('16,0');
    expect(formatRangeValue('', '-1,0', false)).toBe('-1,0');
    // Equal values
    expect(formatRangeValue('16,0', '16,0', false)).toBe('16,0');
    // Pressure range
    expect(formatRangeValue('1,6', '4,0', false)).toBe('1,6...4,0');
    // Temperature range with positive preservation
    expect(formatRangeValue('-1,0', '+21,8', true)).toBe('-1,0...+21,8');
    expect(formatRangeValue('-1,0', '21,8', true)).toBe('-1,0...+21,8');
    expect(formatRangeValue('-40', '60', true)).toBe('-40...+60');
    expect(formatRangeValue('-40', '-10', true)).toBe('-40...-10');
  });
});

describe('pipeCalc & LRV materials catalog', () => {
  it('includes Штуцер and Бобышка in LRV_ELEMENT_TYPE_OPTIONS and detectLrvElementType', () => {
    expect(LRV_ELEMENT_TYPE_OPTIONS).toContain('Штуцер');
    expect(LRV_ELEMENT_TYPE_OPTIONS).toContain('Бобышка');
    expect(detectLrvElementType('Штуцер М20х1.5')).toBe('Штуцер');
    expect(detectLrvElementType('Бобышка БП1-М20х1,5-55')).toBe('Бобышка');
  });

  it('generateLrvFullName includes DN and PN for ЗРА and Фланцы', () => {
    // ЗРА (Кран шаровой)
    const zraName = generateLrvFullName({
      category: 'ЗРА',
      shortName: 'Кран шаровой',
      dn1: 50,
      pnMpa: 16,
      marking: 'КШР-50-16-Ф.ХЛ1',
      material: '09Г2С',
      ntd: 'ТУ 1483-18-16788656-2013',
    });
    expect(zraName).toBe(
      'Кран шаровой DN 50, PN 16 МПа, КШР-50-16-Ф.ХЛ1, 09Г2С, ТУ 1483-18-16788656-2013'
    );

    // Фланец
    const flangeName = generateLrvFullName({
      category: 'Фланец',
      shortName: 'Фланец воротниковый',
      dn1: 100,
      pnMpa: '25',
      material: '09Г2С',
      ntd: 'ГОСТ 33259-2015',
    });
    expect(flangeName).toBe(
      'Фланец воротниковый DN 100, PN 25 МПа, 09Г2С, ГОСТ 33259-2015'
    );
  });

  it('generateLrvFullName does NOT include DN and PN for other categories (Трубы, Отводы, Штуцеры и т.д.)', () => {
    // Труба (даже если dn1 и pnMpa переданы, они не должны включаться)
    const pipeName = generateLrvFullName({
      category: 'Труба',
      shortName: 'Труба 1020х14',
      dn1: 1000,
      pnMpa: 11.8,
      material: '09Г2С',
      ntd: 'ГОСТ 20295-85',
    });
    expect(pipeName).toBe('Труба 1020х14, 09Г2С, ГОСТ 20295-85');

    // Отвод
    const bendName = generateLrvFullName({
      category: 'Отвод',
      shortName: 'Отвод 90° 219х10',
      dn1: 200,
      pnMpa: 16,
      material: '09Г2С',
      ntd: 'ГОСТ 17375-2001',
    });
    expect(bendName).toBe('Отвод 90° 219х10, 09Г2С, ГОСТ 17375-2001');

    // Штуцер
    const chokeName = generateLrvFullName({
      category: 'Штуцер',
      shortName: 'Штуцер',
      dn1: 50,
      pnMpa: 16,
      marking: 'Ш-50-16',
      ntd: 'ТУ 102-488-05',
    });
    expect(chokeName).toBe('Штуцер, Ш-50-16, ТУ 102-488-05');
  });
});
