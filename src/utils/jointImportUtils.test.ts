import { describe, expect, it } from 'vitest';
import {
  normalizeGostJointType,
  parseAndValidateJointsImport,
} from './jointImportUtils';
import type { ProjectLineItem } from '../types/welding';

const sampleLine: ProjectLineItem = {
  id: 'line-1',
  objectName: 'УКПГ-2В',
  rdCode: '0092.049-ТХ3',
  lineNumber: 'ФП1.2/1',
  uniqueLineId: '0092.049-ТХ3|ФП1.2/1',
  lineName: 'Линия 1',
  product: 'Газ',
  testContour: 'К-1',
  weldingNtd: 'СТО Газпром 2-2.2-136-2007',
  controlNtd: 'СТО Газпром 2-2.4-083-2006',
  qualityLevel: 'А',
  pipelineCategory: 'I',
  workingPressure: '10 МПа',
  workingTemperature: '+40 °C',
  rkPercent: 100,
  uzkPercent: 0,
  pvkPercent: 0,
  testDate: '',
  responsiblePto: 'Иванов И.И.',
};

describe('jointImportUtils — gostJointType import', () => {
  it('normalizes Cyrillic and Latin joint types', () => {
    expect(normalizeGostJointType('У4')).toBe('У4');
    expect(normalizeGostJointType('Y4')).toBe('У4');
    expect(normalizeGostJointType('c17')).toBe('С17');
    expect(normalizeGostJointType('')).toBe('С17');
  });

  it('preserves У4 from official template header "Тип соединения (ГОСТ 16037-80)"', () => {
    const result = parseAndValidateJointsImport(
      [
        {
          'Шифр РД': '0092.049-ТХ3',
          'Номер линии': 'ФП1.2/1',
          'Номер стыка': '010',
          'Диаметр, мм': 159,
          'Толщина стенки, мм': 8,
          'Тип соединения (ГОСТ 16037-80)': 'У4',
        },
        {
          'Шифр РД': '0092.049-ТХ3',
          'Номер линии': 'ФП1.2/1',
          'Номер стыка': '020',
          'Диаметр, мм': 159,
          'Толщина стенки, мм': 8,
          'Тип соединения (ГОСТ)': 'У4',
        },
        {
          'Шифр РД': '0092.049-ТХ3',
          'Номер линии': 'ФП1.2/1',
          'Номер стыка': '030',
          'Диаметр, мм': 159,
          'Толщина стенки, мм': 8,
          'Тип сварного соединения': 'Т1',
        },
        {
          'Шифр РД': '0092.049-ТХ3',
          'Номер линии': 'ФП1.2/1',
          'Номер стыка': '040',
          'Диаметр, мм': 159,
          'Толщина стенки, мм': 8,
          'Тип соединения (ГОСТ 16037-80)': 'С17',
        },
      ],
      [sampleLine],
      [],
      [],
      [],
      'УКПГ-2В',
      '0092.049-ТХ3'
    );

    expect(result.errorCount).toBe(0);
    expect(result.rows).toHaveLength(4);
    expect(result.rows[0].gostJointType).toBe('У4');
    expect(result.rows[0].jointKind).toBe('Угловое');
    expect(result.rows[0].jointToImport?.gostJointType).toBe('У4');
    expect(result.rows[0].jointToImport?.jointKind).toBe('Угловое');
    expect(result.rows[1].gostJointType).toBe('У4');
    expect(result.rows[1].jointKind).toBe('Угловое');
    expect(result.rows[1].jointToImport?.gostJointType).toBe('У4');
    expect(result.rows[1].jointToImport?.jointKind).toBe('Угловое');
    expect(result.rows[2].gostJointType).toBe('Т1');
    expect(result.rows[2].jointToImport?.gostJointType).toBe('Т1');
    expect(result.rows[3].gostJointType).toBe('С17');
    expect(result.rows[3].jointKind).toBe('Стыковое');
    expect(result.rows[3].jointToImport?.jointKind).toBe('Стыковое');
  });
});
