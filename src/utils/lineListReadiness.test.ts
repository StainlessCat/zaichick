import { describe, expect, it } from 'vitest';
import type { ProjectLineItem, WeldJoint } from '../types/welding';
import {
  applyBulkUpdateToLineList,
  computeLineListItemStatus,
  computeLineListItemStatusFromLineJoints,
  formatExecutiveDocStatusLabel,
  getJointEquivDiaInch,
  getJointsForLine,
  indexJointsByLine,
  normalizeExecutiveDocStatus,
  parseProjectLineListRecords,
} from './weldingLogic';
import { mapLineDto, mapLineToCreatePayload, mapLineToUpdatePayload } from '../api/mappers';

function makeLine(overrides: Partial<ProjectLineItem> = {}): ProjectLineItem {
  return {
    id: 'line-1',
    objectName: 'УКПГ-2В',
    rdCode: '0092.049.Р.13/1 0004 УКПГ.045.0077.001-ТХ3',
    lineNumber: 'ФП1.2/1',
    uniqueLineId: '001-ТХ3-ФП1.2/1',
    lineName: 'Факельная линия',
    product: 'Природный газ',
    testContour: 'Контур КИ-1',
    weldingNtd: 'СТО Газпром 15-1.1-002-2023',
    controlNtd: 'СТО Газпром 15-1.3-004-2023',
    qualityLevel: 'Уровень А',
    pipelineCategory: 'I (В)',
    workingPressure: '11.8 МПа',
    workingTemperature: '-40...+60 °C',
    rkPercent: 100,
    uzkPercent: 100,
    pvkPercent: 0,
    testDate: '2026-10-30',
    idStatus: 'IN_WORK',
    responsiblePto: '',
    ...overrides,
  };
}

function makeJoint(overrides: Partial<WeldJoint> = {}): WeldJoint {
  return {
    id: 'j-1',
    objectName: 'УКПГ-2В',
    rdCode: '0092.049.Р.13/1 0004 УКПГ.045.0077.001-ТХ3',
    contour: 'Контур КИ-1',
    lineNumber: 'ФП1.2/1',
    uniqueLineId: '001-ТХ3-ФП1.2/1',
    jointNumber: '010',
    jointType: 'Монтажный',
    diameterMm: 159,
    diameterInch: '6"',
    wallThickness: 8,
    lrv1Code: '',
    elem1Name: 'Труба',
    elem1Material: '09Г2С',
    elem1Ntd: 'ГОСТ 8732-78',
    elem1FactoryNumber: '',
    elem1Length: '',
    lrv2Code: '',
    elem2Name: 'Труба',
    elem2Material: '09Г2С',
    elem2Ntd: 'ГОСТ 8732-78',
    elem2FactoryNumber: '',
    elem2Length: '',
    weldingType: 'РАД+РД',
    gostJointType: 'С17',
    weldingPosition: 'В1',
    weldingDate: '',
    welderStamp: '',
    weldingMaterials: '',
    ambientTemp: '',
    preheatTemp: '',
    responsiblePerson: '',
    welderFullName: '',
    welderCertNumber: '',
    techCardNumber: '',
    vikResult: 'Не проводился',
    vikDate: '',
    vikInspector: '',
    ndtType: 'РК',
    ndtDate: '',
    ndtResult: 'Не проводился',
    ndtInspector: '',
    dupNdtType: 'Не требуется',
    dupNdtDate: '',
    dupNdtResult: 'Не проводился',
    dupNdtInspector: '',
    repairAction: '',
    repairDate: '',
    repairWelderStamp: '',
    repairVikResult: 'Не проводился',
    repairVikDate: '',
    repairVikInspector: '',
    repairNdtType: 'Не требуется',
    repairNdtResult: 'Не проводился',
    repairNdtDate: '',
    repairNdtInspector: '',
    repairDupNdtType: 'Не требуется',
    repairDupNdtResult: 'Не проводился',
    repairDupNdtDate: '',
    repairDupNdtInspector: '',
    updatedAt: '2026-06-12T10:00:00Z',
    updatedBy: 'Тест',
    ...overrides,
  };
}

describe('Line list readiness (joints & EDI), ID status, and Responsible PTO', () => {
  it('returns zero readiness metrics when line has no joints', () => {
    const line = makeLine();
    const status = computeLineListItemStatus(line, []);
    expect(status.totalJoints).toBe(0);
    expect(status.weldedJoints).toBe(0);
    expect(status.jointsReadinessPct).toBe(0);
    expect(status.totalEdi).toBe(0);
    expect(status.weldedEdi).toBe(0);
    expect(status.ediReadinessPct).toBe(0);
  });

  it('computes distinct joints % and EDI % for mixed diameters', () => {
    const line = makeLine();
    const smallWelded = makeJoint({
      id: 'j-small',
      jointNumber: '010',
      diameterMm: 108,
      diameterInch: '4"',
      wallThickness: 6,
      weldingDate: '2026-06-10',
      welderStamp: 'K101',
    });
    const largeUnwelded = makeJoint({
      id: 'j-large',
      jointNumber: '020',
      diameterMm: 530,
      diameterInch: '20"',
      wallThickness: 16,
      weldingDate: '',
      welderStamp: '',
    });

    const ediSmall = getJointEquivDiaInch(smallWelded);
    const ediLarge = getJointEquivDiaInch(largeUnwelded);
    const status = computeLineListItemStatus(line, [smallWelded, largeUnwelded]);

    expect(status.totalJoints).toBe(2);
    expect(status.weldedJoints).toBe(1);
    expect(status.jointsReadinessPct).toBe(50);
    expect(status.totalEdi).toBe(Math.round((ediSmall + ediLarge) * 100) / 100);
    expect(status.weldedEdi).toBe(Math.round(ediSmall * 100) / 100);
    expect(status.ediReadinessPct).toBe(
      Math.round((ediSmall / (ediSmall + ediLarge)) * 1000) / 10
    );
    expect(status.ediReadinessPct).toBeLessThan(status.jointsReadinessPct);
  });

  it('computes 100% readiness when all joints are welded', () => {
    const line = makeLine();
    const j1 = makeJoint({ id: 'j-1', weldingDate: '2026-06-10', welderStamp: 'A1' });
    const j2 = makeJoint({ id: 'j-2', jointNumber: '020', weldingDate: '2026-06-11', welderStamp: 'A1' });

    const status = computeLineListItemStatus(line, [j1, j2]);
    expect(status.jointsReadinessPct).toBe(100);
    expect(status.ediReadinessPct).toBe(100);
    expect(status.weldedEdi).toBe(status.totalEdi);
  });

  it('normalizes and formats ExecutiveDocStatus values', () => {
    expect(normalizeExecutiveDocStatus('SIGNED')).toBe('SIGNED');
    expect(normalizeExecutiveDocStatus('Подписана')).toBe('SIGNED');
    expect(normalizeExecutiveDocStatus('в работе')).toBe('IN_WORK');
    expect(normalizeExecutiveDocStatus(undefined)).toBe('IN_WORK');
    expect(formatExecutiveDocStatusLabel('SIGNED')).toBe('Подписана');
    expect(formatExecutiveDocStatusLabel('IN_WORK')).toBe('В работе');
    expect(formatExecutiveDocStatusLabel(undefined)).toBe('В работе');
  });

  it('parses Статус ИД and Ответственный ПТО from Excel rows without corrupting manualStatus', () => {
    const parsed = parseProjectLineListRecords(
      [
        {
          'Название объекта': 'УКПГ-2В',
          'Шифр РД': '0092.049.Р.13/1 0004 УКПГ.045.0077.001-ТХ3',
          'Номер линии': 'Л-101',
          'Наименование линии': 'Линия газа',
          'Статус ИД': 'Подписана',
          'Ответственный ПТО': 'Петров П.П.',
        },
        {
          'Название объекта': 'УКПГ-2В',
          'Шифр РД': '0092.049.Р.13/1 0004 УКПГ.045.0077.001-ТХ3',
          'Номер линии': 'Л-102',
          'Наименование линии': 'Старая таблица без новых столбцов',
        },
      ],
      'УКПГ-2В',
      '0092.049.Р.13/1 0004 УКПГ.045.0077.001-ТХ3'
    );

    expect(parsed).toHaveLength(2);
    expect(parsed[0].idStatus).toBe('SIGNED');
    expect(parsed[0].responsiblePto).toBe('Петров П.П.');
    expect(parsed[0].manualStatus).toBeUndefined();

    expect(parsed[1].idStatus).toBe('IN_WORK');
    expect(parsed[1].responsiblePto).toBeUndefined();
  });

  it('updates idStatus and responsiblePto via bulk update and API mappers', () => {
    const lines = [makeLine({ id: 'l1' }), makeLine({ id: 'l2', lineNumber: 'ФП1.2/2' })];
    const updated = applyBulkUpdateToLineList(lines, ['l1'], {
      idStatus: 'SIGNED',
      responsiblePto: 'Сидоров С.С.',
    });

    expect(updated[0].idStatus).toBe('SIGNED');
    expect(updated[0].responsiblePto).toBe('Сидоров С.С.');
    expect(updated[1].idStatus).toBe('IN_WORK');

    const createPayload = mapLineToCreatePayload(updated[0], 'fac-uuid');
    expect(createPayload.id_status).toBe('SIGNED');
    expect(createPayload.responsible_pto).toBe('Сидоров С.С.');

    const updatePayload = mapLineToUpdatePayload(updated[0]);
    expect(updatePayload.id_status).toBe('SIGNED');
    expect(updatePayload.responsible_pto).toBe('Сидоров С.С.');

    const roundTrip = mapLineDto({
      ...createPayload,
      id: 'l1',
      version: 2,
    });
    expect(roundTrip.idStatus).toBe('SIGNED');
    expect(roundTrip.responsiblePto).toBe('Сидоров С.С.');
  });

  it('keeps omitted optional fields empty and defaults omitted NDT percentages to 0 during import', () => {
    const parsed = parseProjectLineListRecords(
      [
        {
          'Название объекта': 'Новый объект',
          'Шифр РД': 'РД-2026-01',
          'Номер линии': 'Л-500',
          'Наименование линии': 'Технологическая линия',
        },
      ],
      '',
      ''
    );

    expect(parsed).toHaveLength(1);
    expect(parsed[0].product).toBe('');
    expect(parsed[0].testContour).toBe('');
    expect(parsed[0].weldingNtd).toBe('');
    expect(parsed[0].controlNtd).toBe('');
    expect(parsed[0].workingPressure).toBe('');
    expect(parsed[0].workingTemperature).toBe('');
    expect(parsed[0].rkPercent).toBe(0);
    expect(parsed[0].uzkPercent).toBe(0);
    expect(parsed[0].pvkPercent).toBe(0);
  });

  it('indexes joints by line in O(N+M) with deduplication and parity with computeLineListItemStatus', () => {
    const line1 = makeLine({ id: 'l-1', lineNumber: 'Л-1', uniqueLineId: '001-ТХ3-Л-1' });
    const line2 = makeLine({ id: 'l-2', lineNumber: 'Л-2', uniqueLineId: '001-ТХ3-Л-2' });
    const line3 = makeLine({ id: 'l-3', lineNumber: 'Л-3', uniqueLineId: '001-ТХ3-Л-3' });

    const joints: WeldJoint[] = [
      // Совпадение и по uniqueLineId, и по rdCode + lineNumber
      makeJoint({
        id: 'j-1',
        lineNumber: 'Л-1',
        uniqueLineId: '001-ТХ3-Л-1',
        weldingDate: '2026-06-10',
        welderStamp: 'K101',
        vikResult: 'Годен',
        ndtType: 'РК+УЗК',
        ndtResult: 'Годен',
      }),
      // Совпадение только по паре rdCode + lineNumber (устаревший uniqueLineId)
      makeJoint({
        id: 'j-2',
        jointNumber: '020',
        lineNumber: 'Л-1',
        uniqueLineId: 'LEGACY-Л-1',
        weldingDate: '',
        welderStamp: '',
      }),
      // Стык второй линии
      makeJoint({
        id: 'j-3',
        jointNumber: '010',
        lineNumber: 'Л-2',
        uniqueLineId: '001-ТХ3-Л-2',
        weldingDate: '2026-06-11',
        welderStamp: 'K202',
      }),
    ];

    const index = indexJointsByLine(joints);

    expect(getJointsForLine(line1, index).map((j) => j.id)).toEqual(['j-1', 'j-2']);
    expect(getJointsForLine(line2, index).map((j) => j.id)).toEqual(['j-3']);
    expect(getJointsForLine(line3, index)).toEqual([]);

    for (const ln of [line1, line2, line3]) {
      const expected = computeLineListItemStatus(ln, joints);
      const actual = computeLineListItemStatusFromLineJoints(ln, getJointsForLine(ln, index));
      expect(actual).toEqual(expected);
    }
  });
});
