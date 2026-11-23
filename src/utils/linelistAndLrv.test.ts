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

  it('generateLrvFullName produces exact corporate template output', () => {
    // Reference example from user prompt:
    // Кран шаровой DN 50, PN 16 МПа, КШР-50-16-Ф.ХЛ1, 09Г2С, ТУ 1483-18-16788656-2013
    const fullName = generateLrvFullName({
      shortName: 'Кран шаровой',
      dn1: 50,
      pnMpa: 16,
      marking: 'КШР-50-16-Ф.ХЛ1',
      material: '09Г2С',
      ntd: 'ТУ 1483-18-16788656-2013',
    });
    expect(fullName).toBe(
      'Кран шаровой DN 50, PN 16 МПа, КШР-50-16-Ф.ХЛ1, 09Г2С, ТУ 1483-18-16788656-2013'
    );
  });

  it('generateLrvFullName handles missing optional attributes without extra commas', () => {
    const pipeName = generateLrvFullName({
      shortName: 'Труба',
      dn1: 100,
      material: '09Г2С',
      ntd: 'ГОСТ 8732-78',
    });
    expect(pipeName).toBe('Труба DN 100, 09Г2С, ГОСТ 8732-78');

    const chokeName = generateLrvFullName({
      shortName: 'Штуцер',
      marking: 'Ш-50-16',
      ntd: 'ТУ 102-488-05',
    });
    expect(chokeName).toBe('Штуцер, Ш-50-16, ТУ 102-488-05');
  });
});
