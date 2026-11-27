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
  computeExecutiveDocsSummary,
  computeLineNdtDeficit,
  computeLineVkDeficit,
  extractPersonSurname,
  formatExecutiveNoteDate,
  isWeldedJointMissingClosedNdt,
  matchesExecutiveDocQuickAndSearch,
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

  it('рассчитывает Дефицит по НК с учётом ВИК, ремонта и норм контроля линии', () => {
    // Сварен и принят по ВИК + РК -> не дефицит
    expect(isWeldedJointMissingClosedNdt(makeJoint({ ndtResult: 'Годен' }))).toBe(false);
    // Не сварен -> не дефицит
    expect(
      isWeldedJointMissingClosedNdt(makeJoint({ weldingDate: '', ndtResult: 'Не проводился' }))
    ).toBe(false);
    // Сварен, ВИК не проводился -> дефицит
    expect(
      isWeldedJointMissingClosedNdt(makeJoint({ vikResult: 'Не проводился', ndtResult: 'Годен' }))
    ).toBe(true);
    // Сварен, но НК «В работе» -> дефицит
    expect(isWeldedJointMissingClosedNdt(makeJoint({ ndtResult: 'В работе' }))).toBe(true);
    // Сварен, НК не требуется (ВИК Годен) -> не дефицит
    expect(
      isWeldedJointMissingClosedNdt(
        makeJoint({ ndtType: 'Не требуется', ndtResult: 'Не проводился' })
      )
    ).toBe(false);
    // Брак без закрытого ремонта (или без повторного ВИК) -> дефицит
    expect(
      isWeldedJointMissingClosedNdt(makeJoint({ ndtResult: 'Ремонт', repairNdtResult: 'В работе' }))
    ).toBe(true);
    expect(
      isWeldedJointMissingClosedNdt(
        makeJoint({
          ndtResult: 'Ремонт',
          repairVikResult: 'Не проводился',
          repairNdtType: 'РК',
          repairNdtResult: 'Годен',
        })
      )
    ).toBe(true);
    // Брак, полностью закрыт по ВИК и РК после ремонта -> не дефицит
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

  it('синхронно с Лабораторией НК выявляет дефицит по 100% РК+УЗК+ПВК и не даёт ложного дефицита на 10% РК', () => {
    const strictLine = makeLine({ rkPercent: 100, uzkPercent: 100, pvkPercent: 100 });
    const strictJoints = [
      makeJoint({ id: 'j-1', jointNumber: '10', ndtType: 'УЗК', ndtResult: 'Годен' }),
      makeJoint({
        id: 'j-2',
        jointNumber: '20',
        ndtType: 'УЗК',
        ndtResult: 'Годен',
        labConclusions: {
          РК: {
            stage: 'primary',
            result: 'Годен',
            date: '2026-10-15',
            reportNumber: 'РК-1',
            inspector: 'Иванов',
          },
          ПВК: {
            stage: 'primary',
            result: 'Годен',
            date: '2026-10-15',
            reportNumber: 'ПВК-1',
            inspector: 'Иванов',
          },
        },
      }),
    ];

    const strictRes = computeLineNdtDeficit(strictLine, strictJoints);
    // Стык 010 без РК и ПВК (1 дефицитный стык, 2 незакрытые проверки); стык 020 полностью закрыт через labConclusions
    expect(strictRes.deficitCount).toBe(1);
    expect(strictRes.deficitChecks).toBe(2);
    expect(strictRes.deficitJointNumbers).toEqual(['010']);
    expect(strictRes.summary).toBe('РК −1, ПВК −1');

    // Линия с выборочным 10% РК на 5 стыках: достаточно 1 закрытого РК
    const selectiveLine = makeLine({ rkPercent: 10, uzkPercent: 0, pvkPercent: 0 });
    const selectiveJoints = [
      makeJoint({ id: 's-1', jointNumber: '010', ndtType: 'РК', ndtResult: 'Годен' }),
      makeJoint({ id: 's-2', jointNumber: '020', ndtType: 'РК', ndtResult: 'Не проводился' }),
      makeJoint({ id: 's-3', jointNumber: '030', ndtType: 'РК', ndtResult: 'Не проводился' }),
      makeJoint({ id: 's-4', jointNumber: '040', ndtType: 'РК', ndtResult: 'Не проводился' }),
      makeJoint({ id: 's-5', jointNumber: '050', ndtType: 'РК', ndtResult: 'Не проводился' }),
    ];

    const selectiveClosed = computeLineNdtDeficit(selectiveLine, selectiveJoints);
    expect(selectiveClosed.deficitCount).toBe(0);
    expect(selectiveClosed.summary).toBe('Выполнено');

    // Если ни один из 5 стыков не прошёл РК при норме 10% -> дефицит 1, а не 5
    const selectiveOpen = computeLineNdtDeficit(
      selectiveLine,
      selectiveJoints.map((j) => ({ ...j, ndtResult: 'Не проводился' }))
    );
    expect(selectiveOpen.deficitCount).toBe(1);
    expect(selectiveOpen.summary).toBe('РК −1');
  });

  it('рассчитывает Дефицит ВК включая позиции без АВК и непривязанные материалы', () => {
    const line = makeLine();
    const joints = [
      makeJoint({ id: 'j-1', jointNumber: '010', lrv1Code: 'LRV-01', lrv2Code: 'LRV-02' }),
      makeJoint({ id: 'j-2', jointNumber: '020', lrv1Code: 'LRV-01', lrv2Code: 'LRV-03' }),
      makeJoint({
        id: 'j-3',
        jointNumber: '030',
        lrv1Code: 'LRV-MISSING',
        elem1Name: 'Фланец 159',
        lrv2Code: 'LRV-01',
      }),
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
      makeLrv({ id: 'lrv-4', lrvCode: 'LRV-99', shortName: 'Заглушка', batches: [] }),
    ];

    const res = computeLineVkDeficit(line, joints, catalog);
    expect(res.count).toBe(3);
    expect(res.unlinkedCount).toBe(1);
    expect(res.missingItems.map((m) => m.lrvCode)).toEqual(['LRV-01', 'LRV-03', 'LRV-MISSING']);
    expect(res.missingItems[2].reason).toBe('unlinked');
  });

  it('строит строки ведомости, вычисляет блокеры готовности, аномалии подписания и взвешенную сводку', () => {
    const line1 = makeLine({ id: 'line-1', lineNumber: 'L-100', responsiblePto: 'Смирнов В.А.' });
    const line2 = makeLine({
      id: 'line-2',
      lineNumber: 'L-200',
      uniqueLineId: '1234-ТХ:L-200',
    });

    const joints = [
      // Линия 1: 2 из 4 сварены, стык 020 без закрытого РК
      makeJoint({ id: 'j-1', lineId: 'line-1', jointNumber: '010', weldingDate: '2026-10-10', ndtResult: 'Годен' }),
      makeJoint({ id: 'j-2', lineId: 'line-1', jointNumber: '020', weldingDate: '2026-10-11', ndtResult: 'В работе' }),
      makeJoint({ id: 'j-3', lineId: 'line-1', jointNumber: '030', weldingDate: '', ndtResult: 'Не проводился' }),
      makeJoint({ id: 'j-4', lineId: 'line-1', jointNumber: '040', weldingDate: '', ndtResult: 'Не проводился' }),
      // Линия 2: 1 из 1 сварен, всё закрыто
      makeJoint({
        id: 'j-5',
        lineId: 'line-2',
        lineNumber: 'L-200',
        uniqueLineId: '1234-ТХ:L-200',
        jointNumber: '010',
        weldingDate: '2026-10-12',
        ndtResult: 'Годен',
        lrv1Code: 'LRV-02',
        lrv2Code: 'LRV-02',
      }),
    ];

    const catalog: LRVItem[] = [
      makeLrv({ id: 'lrv-1', lrvCode: 'LRV-01', batches: [] }),
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
    ];

    const docByLineId: Record<string, ExecutiveDocRecord> = {
      'line-1': {
        lineId: 'line-1',
        priority: 2,
        idStatus: 'SIGNED', // Подписана с незакрытыми требованиями -> аномалия
        workProducer: 'Кузнецов',
        ptoEngineer: 'Смирнов',
        preStageStatus: 'SIGNED',
        physicsStatus: 'NOT_ACCEPTED',
        geodesyStatus: 'NOT_REQUIRED',
        noteText: 'Ждём заключение РК',
        noteUpdatedAt: '2026-11-20T09:00:00Z',
        version: 3,
      },
      'line-2': {
        lineId: 'line-2',
        priority: 5,
        idStatus: 'IN_WORK',
        workProducer: 'Орлов',
        ptoEngineer: 'Смирнов',
        preStageStatus: 'SIGNED',
        physicsStatus: 'ACCEPTED',
        geodesyStatus: 'SIGNED',
        noteText: '',
        noteUpdatedAt: null,
        version: 1,
      },
    };

    const rows = buildExecutiveDocRows({
      lines: [line1, line2],
      joints,
      testCircuits: [],
      lrvCatalog: catalog,
      docByLineId,
      selectedObjectName: 'УКПГ-1С',
    });

    expect(rows).toHaveLength(2);
    const [r1, r2] = rows;

    expect(r1.weldingReadinessPct).toBe(50);
    expect(r1.ndtDeficitCount).toBe(1);
    expect(r1.ndtDeficitJointNumbers).toEqual(['020']);
    expect(r1.vkDeficitCount).toBe(1);
    expect(r1.isReadyToSign).toBe(false);
    expect(r1.hasSignedAnomaly).toBe(true);

    expect(r2.weldingReadinessPct).toBe(100);
    expect(r2.ndtDeficitCount).toBe(0);
    expect(r2.vkDeficitCount).toBe(0);
    expect(r2.isReadyToSign).toBe(true);
    expect(r2.hasSignedAnomaly).toBe(false);

    // Взвешенная готовность: 3 из 5 стыков = 60%, а НЕ невзвешенное (50+100)/2 = 75%
    const summary = computeExecutiveDocsSummary(rows);
    expect(summary.totalJoints).toBe(5);
    expect(summary.weldedJoints).toBe(3);
    expect(summary.weightedWeldingPct).toBe(60);
    expect(summary.readyToSignCount).toBe(1);
    expect(summary.signedCount).toBe(1);
    expect(summary.ndtDeficitLinesCount).toBe(1);
    expect(summary.vkDeficitLinesCount).toBe(1);

    // Быстрые фильтры и текстовый поиск
    expect(matchesExecutiveDocQuickAndSearch(r2, 'ready', '')).toBe(true);
    expect(matchesExecutiveDocQuickAndSearch(r1, 'ready', '')).toBe(false);
    expect(matchesExecutiveDocQuickAndSearch(r1, 'all', 'Кузнецов')).toBe(true);
    expect(matchesExecutiveDocQuickAndSearch(r2, 'all', 'заключение РК')).toBe(false);
  });
});
