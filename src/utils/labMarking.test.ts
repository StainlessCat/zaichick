import { describe, expect, it } from 'vitest';
import {
  buildJointLabMarking,
  buildLabConclusionNumber,
  extractShortRdCode,
  LAB_DIAMETER_CODE_TABLE,
  LAB_WELDING_TYPE_CODE_TABLE,
  normalizeDiameterKey,
  resolveDiameterLetterCode,
  resolveWeldingTypeCode,
} from './labMarking';

describe('labMarking — Справочники и расчёт «Маркировки стыка»', () => {
  it('содержит ровно 60 позиций диаметров (59 размеров + врезка) и 10 видов сварки', () => {
    expect(LAB_DIAMETER_CODE_TABLE).toHaveLength(60);
    expect(LAB_WELDING_TYPE_CODE_TABLE).toHaveLength(10);

    // Проверка уникальности ключей и кодов
    const keys = new Set(LAB_DIAMETER_CODE_TABLE.map((e) => e.diameterMm));
    const codes = new Set(LAB_DIAMETER_CODE_TABLE.map((e) => e.code));
    expect(keys.size).toBe(60);
    expect(codes.size).toBe(60);
  });

  it('extractShortRdCode корректно извлекает подстроку после последней точки', () => {
    expect(extractShortRdCode('1234.56-ТХ.12')).toBe('12');
    expect(
      extractShortRdCode('0092.049.Р.13/1 0004 УКПГ.045.0077.001-TX3')
    ).toBe('001-TX3');
    expect(extractShortRdCode('  ТХ-05  ')).toBe('ТХ-05');
    expect(extractShortRdCode('АБВ.123.')).toBe('АБВ.123');
    expect(extractShortRdCode('')).toBe('');
    expect(extractShortRdCode(null)).toBe('');
  });

  it('normalizeDiameterKey и resolveDiameterLetterCode точно различают смежные диаметры без округления', () => {
    expect(normalizeDiameterKey(159.0)).toBe('159');
    expect(normalizeDiameterKey('219,10')).toBe('219.1');
    expect(normalizeDiameterKey(60.3)).toBe('60.3');
    expect(normalizeDiameterKey(0)).toBeNull();

    expect(resolveDiameterLetterCode({ diameterMm: 1820 }).code).toBe('АБ');
    expect(resolveDiameterLetterCode({ diameterMm: 1220 }).code).toBe('Б');
    expect(resolveDiameterLetterCode({ diameterMm: 1219 }).code).toBe('БА');
    expect(resolveDiameterLetterCode({ diameterMm: 219.1 }).code).toBe('ЛВ');
    expect(resolveDiameterLetterCode({ diameterMm: 219 }).code).toBe('Л');
    expect(resolveDiameterLetterCode({ diameterMm: 114.3 }).code).toBe('П');
    expect(resolveDiameterLetterCode({ diameterMm: 114 }).code).toBe('ПА');
    expect(resolveDiameterLetterCode({ diameterMm: 60.3 }).code).toBe('У');
    expect(resolveDiameterLetterCode({ diameterMm: 60 }).code).toBe('УА');
    expect(resolveDiameterLetterCode({ diameterMm: 12 }).code).toBe('ЮА');

    // Нестандартный диаметр вне таблицы возвращает null без подмены
    expect(resolveDiameterLetterCode({ diameterMm: 999 }).code).toBeNull();
  });

  it('определяет индекс «Я» для угловых соединений и врезок', () => {
    expect(
      resolveDiameterLetterCode({
        diameterMm: 159,
        jointKind: 'Угловое',
        gostJointType: 'У1',
      })
    ).toMatchObject({ code: 'Я', isBranch: true });

    expect(
      resolveDiameterLetterCode({
        diameterMm: 325,
        jointKind: 'Стыковое',
        gostJointType: 'У4',
      })
    ).toMatchObject({ code: 'Я', isBranch: true });

    expect(
      resolveDiameterLetterCode({ diameterMm: 'врезка' })
    ).toMatchObject({ code: 'Я', isBranch: true });
  });

  it('resolveWeldingTypeCode кодирует все 10 видов сварки и нормализует пробелы/регистр', () => {
    expect(resolveWeldingTypeCode('РД')).toBe('1');
    expect(resolveWeldingTypeCode('РАД')).toBe('2');
    expect(resolveWeldingTypeCode('РАД+РД')).toBe('21');
    expect(resolveWeldingTypeCode(' рад + рд ')).toBe('21');
    expect(resolveWeldingTypeCode('МП')).toBe('3');
    expect(resolveWeldingTypeCode('ААД')).toBe('4');
    expect(resolveWeldingTypeCode('МПС')).toBe('5');
    expect(resolveWeldingTypeCode('АПГ')).toBe('6');
    expect(resolveWeldingTypeCode('АПИ')).toBe('7');
    expect(resolveWeldingTypeCode('АФ')).toBe('8');
    expect(resolveWeldingTypeCode('Л')).toBe('9');
    expect(resolveWeldingTypeCode('Неизвестный')).toBeNull();
  });

  it('buildJointLabMarking формирует эталонные маркировки из ТЗ для стыковых, угловых и 4-значных стыков', () => {
    const butt = buildJointLabMarking({
      rdCode: '0092.049.Р.13/1 0004 УКПГ.045.0077.001-TX3',
      lineNumber: 'Л1',
      diameterMm: 720,
      jointKind: 'Стыковое',
      gostJointType: 'С17',
      weldingType: 'РАД+РД',
      jointNumber: '010',
    });
    expect(butt.isComplete).toBe(true);
    expect(butt.marking).toBe('001-TX3-Л1-Д-21-010');

    const branch = buildJointLabMarking({
      rdCode: 'УКПГ.001-TX3',
      lineNumber: 'Л1',
      diameterMm: 159,
      jointKind: 'Угловое',
      gostJointType: 'У2',
      weldingType: 'РД',
      jointNumber: '030',
    });
    expect(branch.isComplete).toBe(true);
    expect(branch.marking).toBe('001-TX3-Л1-Я-1-030');

    const fourDigit = buildJointLabMarking({
      rdCode: '1234.56-ТХ.12',
      lineNumber: 'ФП1.2/1',
      diameterMm: 530,
      weldingType: 'ААД',
      jointNumber: '1020',
    });
    expect(fourDigit.isComplete).toBe(true);
    expect(fourDigit.marking).toBe('12-ФП1.2/1-Ж-4-1020');

    const incomplete = buildJointLabMarking({
      rdCode: '1234.12',
      lineNumber: 'Л1',
      diameterMm: 999,
      weldingType: 'РД',
      jointNumber: '011',
    });
    expect(incomplete.isComplete).toBe(false);
    expect(incomplete.missingParts).toEqual(['код диаметра']);
    expect(incomplete.marking).toBe('12-Л1-?-1-011');
  });

  it('buildLabConclusionNumber генерирует номера заключений с учётом этапа контроля', () => {
    const marking = '001-TX3-Л1-Д-21-010';
    expect(buildLabConclusionNumber('РК', marking)).toBe('РК-001-TX3-Л1-Д-21-010');
    expect(buildLabConclusionNumber('ВИК', marking, 'primary')).toBe('ВИК-001-TX3-Л1-Д-21-010');
    expect(buildLabConclusionNumber('УЗК', marking, 'repair', 1)).toBe('УЗК-001-TX3-Л1-Д-21-010-Р1');
    expect(buildLabConclusionNumber('ПВК', marking, 'duplicate')).toBe('ПВК-001-TX3-Л1-Д-21-010-Д');
  });
});
