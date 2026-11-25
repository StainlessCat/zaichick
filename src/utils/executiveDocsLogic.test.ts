import { describe, expect, it } from 'vitest';
import type {
  LRVItem,
  ProjectLineItem,
  TestCircuit,
  WeldJoint,
} from '../types/welding';
import type { ExecutiveDocRecord } from '../types/executiveDocs';
import {
  buildExecutiveDocRows,
  computeLineVkDeficit,
  extractPersonSurname,
  formatExecutiveNoteDate,
  isWeldedJointMissingClosedNdt,
  resolveLineTestContours,
} from './executiveDocsLogic';

function makeLine(overrides: Partial<ProjectLineItem> = {}): ProjectLineItem {
  return {
    id: 'line-1',
    objectName: 'УКПГ-1С',
    rdCode: '1234-ТХ',
    lineNumber: 'L-100',
    uniqueLineId: '1234-ТХ:L-100',
    lineName: 'Газ сырой',
    product: 'Газ',
    testContour: 'К-01',
    weldingNtd: 'СТО Газпром 15-1.1-002-2023',
    controlNtd: 'СТО Газпром 15-1.1-002-2023',
    qualityLevel: 'B',
    pipelineCategory: 'I',
    workingPressure: '10',
    workingTemperature: '40',
    rkPercent: 100,
    uzkPercent: 0,
    pvkPercent: 0,
    testDate: '',
    ...overrides,
  };
}

function makeJoint(overrides: Partial<WeldJoint> = {}): WeldJoint {
  return {
    id: 'j-1',
    lineId: 'line-1',
    objectName: 'УКПГ-1С',
    rdCode: '1234-ТХ',
    lineNumber: 'L-100',
    uniqueLineId: '1234-ТХ:L-100',
    contour: 'К-01',
    jointNumber: '010',
    jointType: 'Монтажный',
    weldingType: 'РАД+РД',
    diameterMm: 159,
    diameterInch: '6"',
    wallThickness: 8,
    weldingDate: '2026-10-10',
    welderStamp: 'С01',
    vikResult: 'Годен',
    ndtType: 'РК',
    ndtResult: 'Годен',
    dupNdtType: 'Не требуется',
    dupNdtResult: 'Не проводился',
    elem1Name: 'Труба 159х8',
    elem1Material: '09Г2С',
    elem2Name: 'Отвод 159х8',
    elem2Material: '09Г2С',
    lrv1Code: 'LRV-01',
    lrv2Code: 'LRV-02',
    ...overrides,
  } as WeldJoint;
}

function makeLrv(overrides: Partial<LRVItem> = {}): LRVItem {
  return {
    id: 'lrv-1',
    objectName: 'УКПГ-1С',
    rdCode: '1234-ТХ',
    lrvCode: 'LRV-01',
    category: 'Труба',
    shortName: 'Труба 159х8',
    diameterMm: 159,
    wallThickness: 8,
    material: '09Г2С',
    ntd: 'ГОСТ 8732-78',
    unit: 'м',
    specQty: 100,
    status: 'active',
    ...overrides,
  } as LRVItem;
}

describe('executiveDocsLogic', () => {
  it('извлекает чистую фамилию без должностей и инициалов', () => {
    expect(extractPersonSurname('Прораб Иванов А.С.')).toBe('Иванов');
    expect(extractPersonSurname('Петров И.И.')).toBe('Петров');
    expect(extractPersonSurname('Инженер ПТО Сидорова')).toBe('Сидорова');
    expect(extractPersonSurname('—')).toBe('');
  });

  it('форматирует дату примечания в ДД.ММ.ГГГГ', () => {
    expect(formatExecutiveNoteDate('2026-11-25T14:30:00Z')).toBe('25.11.2026');
    expect(formatExecutiveNoteDate('2026-05-03')).toBe('03.05.2026');
    expect(formatExecutiveNoteDate(null)).toBe('');
  });

  it('определяет контур испытаний с приоритетом раздела Испытания', () => {
    const line = makeLine({ testContour: 'Старый-К' });
    const joints = [makeJoint({ testCircuitId: 'tc-1', contour: 'К-01' })];
    const circuits: TestCircuit[] = [
      {
        id: 'tc-1',
        facilityId: 'fac-1',
        objectName: 'УКПГ-1С',
        name: 'Контур-А1',
        sriStatus: 'APPROVED',
        testStatus: 'NOT_TESTED',
        recordStatus: 'DRAFT',
        version: 1,
        totalJoints: 1,
        weldedJoints: 1,
        weldingJointsPercent: 100,
        totalDInch: 6,
        weldedDInch: 6,
        weldingDInchPercent: 100,
        totalEdi: 6,
        weldedEdi: 6,
        weldingEdiPercent: 100,
        defectiveJointsCount: 0,
        linesSummary: [
          {
            lineId: 'line-1',
            lineNumber: 'L-100',
            uniqueLineId: '1234-ТХ:L-100',
            rdCode: '1234-ТХ',
            assignedJointsCount: 1,
            lineTotalJointsCount: 1,
            isFullLine: true,
          },
        ],
      },
    ];

    expect(resolveLineTestContours(line, joints, circuits)).toEqual(['Контур-А1']);
  });

  it('рассчитывает Дефицит по НК как число сваренных стыков без закрытого НК', () => {
    // Сварен и принят по РК -> не дефицит
    expect(isWeldedJointMissingClosedNdt(makeJoint({ ndtResult: 'Годен' }))).toBe(false);
    // Не сварен -> не дефицит
    expect(
      isWeldedJointMissingClosedNdt(makeJoint({ weldingDate: '', ndtResult: 'Не проводился' }))
    ).toBe(false);
    // Сварен, но НК "В работе" -> дефицит
    expect(isWeldedJointMissingClosedNdt(makeJoint({ ndtResult: 'В работе' }))).toBe(true);
    // Сварен, НК не требуется -> не дефицит
    expect(
      isWeldedJointMissingClosedNdt(
        makeJoint({ ndtType: 'Не требуется', ndtResult: 'Не проводился' })
      )
    ).toBe(false);
    // Брак без закрытого ремонта -> дефицит
    expect(
      isWeldedJointMissingClosedNdt(makeJoint({ ndtResult: 'Ремонт', repairNdtResult: 'В работе' }))
    ).toBe(true);
    // Брак, но закрыт после ремонта -> не дефицит
    expect(
      isWeldedJointMissingClosedNdt(
        makeJoint({
          ndtResult: 'Ремонт',
          repairVikResult: 'Годен',
          repairNdtType: 'РК',
          repairNdtResult: 'Годен',
        })
      )
    ).toBe(false);
  });

  it('рассчитывает Дефицит ВК как число уникальных позиций ЛРВ в линии без акта ВК', () => {
    const line = makeLine();
    // 3 стыка используют LRV-01 (без АВК), LRV-02 (есть принятый АВК), LRV-03 (только забракованный АВК)
    const joints = [
      makeJoint({ id: 'j-1', jointNumber: '010', lrv1Code: 'LRV-01', lrv2Code: 'LRV-02' }),
      makeJoint({ id: 'j-2', jointNumber: '020', lrv1Code: 'LRV-01', lrv2Code: 'LRV-03' }),
      makeJoint({ id: 'j-3', jointNumber: '030', lrv1Code: 'LRV-01', lrv2Code: 'LRV-01' }),
    ];
    const catalog: LRVItem[] = [
      makeLrv({ id: 'lrv-1', lrvCode: 'LRV-01', shortName: 'Труба 159х8', batches: [] }),
      makeLrv({
        id: 'lrv-2',
        lrvCode: 'LRV-02',
        shortName: 'Отвод 159х8',
        batches: [
          {
            id: 'b-1',
            materialId: 'lrv-2',
            actNumber: 'АВК-001',
            actDate: '2026-10-01',
            certificateNumber: 'СЕРТ-001',
            quantity: 10,
            unit: 'шт',
            verdict: 'accepted',
          },
        ],
      }),
      makeLrv({
        id: 'lrv-3',
        lrvCode: 'LRV-03',
        shortName: 'Тройник 159х8',
        batches: [
          {
            id: 'b-2',
            materialId: 'lrv-3',
            actNumber: 'АВК-002',
            actDate: '2026-10-02',
            certificateNumber: 'СЕРТ-002',
            quantity: 2,
            unit: 'шт',
            verdict: 'rejected',
          },
        ],
      }),
      // Неиспользуемая в линии позиция без АВК не должна попадать в дефицит линии
      makeLrv({ id: 'lrv-4', lrvCode: 'LRV-99', shortName: 'Заглушка', batches: [] }),
    ];

    const res = computeLineVkDeficit(line, joints, catalog);
    expect(res.count).toBe(2);
    expect(res.missingItems.map((m) => m.lrvCode)).toEqual(['LRV-01', 'LRV-03']);
  });

  it('строит полные строки ведомости с приоритетами, процентом сварки и сохранёнными полями', () => {
    const line = makeLine({ id: 'line-1', responsiblePto: 'Смирнов В.А.' });
    const joints = [
      makeJoint({ id: 'j-1', jointNumber: '010', weldingDate: '2026-10-10', ndtResult: 'Годен' }),
      makeJoint({ id: 'j-2', jointNumber: '020', weldingDate: '2026-10-11', ndtResult: 'В работе' }),
      makeJoint({ id: 'j-3', jointNumber: '030', weldingDate: '', ndtResult: 'Не проводился' }),
      makeJoint({ id: 'j-4', jointNumber: '040', weldingDate: '', ndtResult: 'Не проводился' }),
    ];
    const docByLineId: Record<string, ExecutiveDocRecord> = {
      'line-1': {
        lineId: 'line-1',
        priority: 2,
        idStatus: 'IN_WORK',
        workProducer: 'Кузнецов',
        ptoEngineer: 'Смирнов',
        preStageStatus: 'SIGNED',
        physicsStatus: 'NOT_ACCEPTED',
        geodesyStatus: 'NOT_REQUIRED',
        noteText: 'Ждём заключение РК',
        noteUpdatedAt: '2026-11-20T09:00:00Z',
        version: 3,
      },
    };

    const rows = buildExecutiveDocRows({
      lines: [line],
      joints,
      testCircuits: [],
      lrvCatalog: [makeLrv({ id: 'lrv-1', lrvCode: 'LRV-01', batches: [] })],
      docByLineId,
      selectedObjectName: 'УКПГ-1С',
    });

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.priority).toBe(2);
    expect(row.weldingReadinessPct).toBe(50);
    expect(row.ndtDeficitCount).toBe(1);
    expect(row.ndtDeficitJointNumbers).toEqual(['020']);
    expect(row.vkDeficitCount).toBe(1);
    expect(row.workProducer).toBe('Кузнецов');
    expect(row.ptoEngineer).toBe('Смирнов');
    expect(row.preStageStatus).toBe('SIGNED');
    expect(row.geodesyStatus).toBe('NOT_REQUIRED');
    expect(row.noteText).toBe('Ждём заключение РК');
  });
});
