import { describe, expect, it } from 'vitest';
import {
  cleanUnitDisplay,
  formatRangeValue,
  generateLrvFullName,
  parseRangeValue,
} from './weldingLogic';
import {
  getMaterialMasterSubcategory,
  MaterialMasterSubcategory,
} from '../types/welding';
import { parseLrvCatalogRecords } from './linelistUtils';
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

  it('getMaterialMasterSubcategory correctly categorizes materials into the 6 subcategories', () => {
    expect(getMaterialMasterSubcategory('Труба')).toBe('tube');
    expect(getMaterialMasterSubcategory('Отвод')).toBe('sdt');
    expect(getMaterialMasterSubcategory('Переход')).toBe('sdt');
    expect(getMaterialMasterSubcategory('Тройник')).toBe('sdt');
    expect(getMaterialMasterSubcategory('Заглушка')).toBe('sdt');
    expect(getMaterialMasterSubcategory('ЗРА')).toBe('zra');
    expect(getMaterialMasterSubcategory('Кран')).toBe('zra');
    expect(getMaterialMasterSubcategory('Фланец')).toBe('flange');
    expect(getMaterialMasterSubcategory('Штуцер')).toBe('weldolet');
    expect(getMaterialMasterSubcategory('Бобышка')).toBe('weldolet');
    expect(getMaterialMasterSubcategory('Прочее')).toBe('equip');
  });

  it('generateLrvFullName formats tube and sdt according to corporate rules', () => {
    // Example 1: Single diameter pipe without marking
    const tubeSingle = generateLrvFullName({
      category: 'Труба',
      shortName: 'Труба',
      diameterMm: 530,
      wallThickness: '8,0',
      material: 'К60',
      ntd: 'ГОСТ 180419-80',
    });
    expect(tubeSingle).toBe('Труба 530х8,0, К60, ГОСТ 180419-80');

    // Example 2: Dual diameter reduction without marking
    const sdtDual = generateLrvFullName({
      category: 'Переход',
      shortName: 'Переход',
      diameterMm: 108,
      wallThickness: 6,
      diameterMm2: 89,
      wallThickness2: 4,
      material: 'К48',
      ntd: 'ГОСТ 19375-2015',
    });
    expect(sdtDual).toBe('Переход 108х6-89х4, К48, ГОСТ 19375-2015');

    // Rule: If marking is present for tube/sdt, use: shortName, marking, ntd
    const tubeWithMarking = generateLrvFullName({
      category: 'Труба',
      shortName: 'Труба',
      diameterMm: 530,
      wallThickness: 8,
      marking: '530х8-К60-ГОСТ 180419-80',
      ntd: 'ГОСТ 180419-80',
    });
    expect(tubeWithMarking).toBe('Труба, 530х8-К60-ГОСТ 180419-80, ГОСТ 180419-80');

    const sdtWithMarking = generateLrvFullName({
      category: 'Отвод',
      shortName: 'Отвод 90°',
      marking: 'ОК 90-530(8,0)-К60',
      material: 'К60',
      ntd: 'ТУ 1469-014-01395041-03',
    });
    expect(sdtWithMarking).toBe('Отвод 90°, ОК 90-530(8,0)-К60, ТУ 1469-014-01395041-03');
  });

  it('parseLrvCatalogRecords correctly parses marking, pnMpa, fullName, and assigns masterSubcategory', () => {
    const rawRows = [
      {
        'Код ЛРВ': 'ЛРВ-TEST-001',
        'Шифр РД': '0092.049.Р.13/1-ТХ3',
        'Объект': 'Бованенково',
        'Краткое наименование': 'Труба',
        'Маркировка': 'Тр-530х8-К60',
        'Полное наименование': 'Труба 530х8,0, К60, ГОСТ 180419-80',
        'Категория': 'Труба',
        'Давление PN, МПа': '16,0',
        'Материал': 'К60',
        'НТД': 'ГОСТ 180419-80',
        'Диаметр Ø1, мм': 530,
        'Толщина стенки S1, мм': 8,
        'Кол-во': 100,
        'Ед. изм.': 'м',
      },
    ];

    const parsed = parseLrvCatalogRecords(rawRows, 'Бованенково', '0092.049.Р.13/1-ТХ3');
    expect(parsed).toHaveLength(1);
    expect(parsed[0].lrvCode).toBe('ЛРВ-TEST-001');
    expect(parsed[0].marking).toBe('Тр-530х8-К60');
    expect(parsed[0].pnMpa).toBe('16,0');
    expect(parsed[0].fullName).toBe('Труба 530х8,0, К60, ГОСТ 180419-80');
    expect(parsed[0].masterSubcategory).toBe('tube');
  });
});
