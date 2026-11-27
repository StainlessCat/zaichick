import { describe, expect, it } from 'vitest';
import {
  buildAcceptIntoWorkJointPatch,
  buildLabConclusionPatch,
  buildMultiMethodLabConclusionPatch,
  calculateLaboratoryDeficitStatement,
  derivePrimaryNdtMethod,
  getActiveLabRequestForJoint,
  getJointLabRequestStatus,
  getRequestMethodsList,
  isJointConclusionCompletedForRequest,
  isJointInWorkByMethod,
  isJointPassedByMethod,
  resolveLineLabMethodAvailability,
} from './laboratoryLogic';
import { createDraftFromJoint } from '../components/laboratory/types';
import type { NdtLabRequest, ProjectLineItem, WeldJoint } from '../types/welding';
import { INITIAL_JOINTS } from '../data/seedData';

const makeTestJoint = (id: string, jointNumber: string, extra?: Partial<WeldJoint>): WeldJoint => ({
  ...INITIAL_JOINTS[0],
  id,
  jointNumber,
  objectName: 'УКПГ-1С',
  rdCode: 'РД-01',
  lineId: 'LINE-01',
  uniqueLineId: 'РД-01:101',
  lineNumber: '101',
  contour: 'Контур А',
  diameterMm: 219,
  wallThickness: 8,
  diameterInch: '8"',
  weldingDate: '2026-11-14',
  welderStamp: 'W01',
  welderStampsList: ['W01'],
  weldingType: 'РД',
  gostJointType: 'С17',
  jointKind: 'Стыковое',
  jointType: 'Монтажный',
  vikResult: 'Годен',
  vikDate: '2026-11-14',
  vikInspector: 'Иванов И.И.',
  ndtType: 'РК',
  ndtResult: 'Не проводился',
  ndtDate: '',
  ndtInspector: '',
  ndtReportNumber: '',
  ...extra,
});

const makeTestLine = (): ProjectLineItem => ({
  id: 'line-uuid-1',
  uniqueLineId: 'РД-01:101',
  objectName: 'УКПГ-1С',
  rdCode: 'РД-01',
  lineNumber: '101',
  lineName: 'Линия 101',
  product: 'Газ',
  testContour: 'Контур А',
  weldingNtd: 'СТО Газпром 15-1.1-002-2023',
  controlNtd: 'СТО Газпром 15-1.1-002-2023',
  pipelineCategory: 'I',
  qualityLevel: 'B',
  workingPressure: '9.8 МПа',
  workingTemperature: '+20 °C',
  rkPercent: 100,
  uzkPercent: 0,
  pvkPercent: 0,
  testDate: '2026-11-20',
});

describe('Laboratory Logic — Stage 3 Enhancements', () => {
  it('getActiveLabRequestForJoint correctly identifies joints in active requests', () => {
    const activeReq: NdtLabRequest = {
      id: 'req-1',
      requestNumber: 'ЗНК-2026-001',
      createdAt: '2026-11-14 10:00',
      createdDate: '2026-11-14',
      createdBy: 'Инженер ПТО',
      objectName: 'УКПГ-1С',
      rdCode: 'РД-01',
      lineNumber: '101',
      uniqueLineId: 'РД-01:101',
      contour: 'Контур А',
      controlStage: 'Первичный ВИК и НК',
      requestedMethod: 'РК',
      jointIds: ['joint-1', 'joint-2'],
      status: 'В работе ЛНК',
      version: 1,
    };

    const completedReq: NdtLabRequest = {
      ...activeReq,
      id: 'req-2',
      requestNumber: 'ЗНК-2026-002',
      status: 'Выполнена',
      jointIds: ['joint-3'],
    };

    const requests = [activeReq, completedReq];

    // joint-1 is in active request
    const found1 = getActiveLabRequestForJoint('joint-1', requests);
    expect(found1).toBeDefined();
    expect(found1?.requestNumber).toBe('ЗНК-2026-001');

    // joint-1 with matching method РК
    const foundMethod = getActiveLabRequestForJoint('joint-1', requests, 'РК');
    expect(foundMethod).toBeDefined();

    // joint-1 with non-conflicting method УЗК
    const foundOtherMethod = getActiveLabRequestForJoint('joint-1', requests, 'УЗК');
    expect(foundOtherMethod).toBeUndefined();

    // joint-3 is in completed request (not active)
    const foundCompleted = getActiveLabRequestForJoint('joint-3', requests);
    expect(foundCompleted).toBeUndefined();

    // joint-99 is not in any request
    const foundNone = getActiveLabRequestForJoint('joint-99', requests);
    expect(foundNone).toBeUndefined();
  });

  it('calculateLaboratoryDeficitStatement excludes joints with active requests from candidates', () => {
    const j1 = makeTestJoint('j-1', '010');
    const j2 = makeTestJoint('j-2', '020');
    const j3 = makeTestJoint('j-3', '030');

    const activeReq: NdtLabRequest = {
      id: 'req-active',
      requestNumber: 'ЗНК-2026-010',
      createdAt: '2026-11-14 10:00',
      createdDate: '2026-11-14',
      createdBy: 'Инженер ПТО',
      objectName: 'УКПГ-1С',
      rdCode: 'РД-01',
      lineNumber: '101',
      uniqueLineId: 'РД-01:101',
      contour: 'Контур А',
      controlStage: 'Первичный ВИК и НК',
      requestedMethod: 'РК',
      jointIds: ['j-1', 'j-2'],
      status: 'Подана ПТО',
      version: 1,
    };

    const line = makeTestLine();

    // With active request: j-1 and j-2 are already in request, only j-3 should be candidate
    const statementWithReqs = calculateLaboratoryDeficitStatement(
      [j1, j2, j3],
      [line],
      'ALL',
      'ALL',
      [activeReq]
    );

    const lineRowWithReqs = statementWithReqs.allLineRows[0];
    expect(lineRowWithReqs.allWeldedJoints).toHaveLength(3);
    expect(lineRowWithReqs.candidateJoints).toHaveLength(1);
    expect(lineRowWithReqs.candidateJoints[0].id).toBe('j-3');

    // Without active requests: all 3 should be candidates
    const statementWithoutReqs = calculateLaboratoryDeficitStatement(
      [j1, j2, j3],
      [line],
      'ALL',
      'ALL',
      []
    );
    expect(statementWithoutReqs.allLineRows[0].candidateJoints).toHaveLength(3);
  });

  it('buildLabConclusionPatch strictly requires official report number on completed NDT results', () => {
    const joint = makeTestJoint('j-1', '010');

    // 1. Missing report number with result 'Годен' -> rejects with error
    const resEmptyNum = buildLabConclusionPatch(joint, {
      stage: 'Первичный ВИК и НК',
      includeVik: false,
      vikReportNumber: '',
      vikDate: '',
      vikResult: 'Годен',
      vikInspector: '',
      ndtMethod: 'РК',
      ndtReportNumber: '', // empty!
      ndtDate: '2026-11-15',
      ndtResult: 'Годен',
      ndtInspector: 'Петров П.П.',
    });
    expect(resEmptyNum.ok).toBe(false);
    expect(resEmptyNum.error).toContain('необходимо указать номер заключения НК');

    // 2. Whitespace-only report number -> rejects with error
    const resWhitespaceNum = buildLabConclusionPatch(joint, {
      stage: 'Первичный ВИК и НК',
      includeVik: false,
      vikReportNumber: '',
      vikDate: '',
      vikResult: 'Годен',
      vikInspector: '',
      ndtMethod: 'РК',
      ndtReportNumber: '   ',
      ndtDate: '2026-11-15',
      ndtResult: 'Годен',
      ndtInspector: 'Петров П.П.',
    });
    expect(resWhitespaceNum.ok).toBe(false);
    expect(resWhitespaceNum.error).toContain('необходимо указать номер заключения НК');

    // 3. Valid official report number -> accepts and generates patch
    const resValid = buildLabConclusionPatch(joint, {
      stage: 'Первичный ВИК и НК',
      includeVik: false,
      vikReportNumber: '',
      vikDate: '',
      vikResult: 'Годен',
      vikInspector: '',
      ndtMethod: 'РК',
      ndtReportNumber: 'ЗАК-РК-2026-042',
      ndtDate: '2026-11-15',
      ndtResult: 'Годен',
      ndtInspector: 'Петров П.П.',
    });
    expect(resValid.ok).toBe(true);
    expect(resValid.patch.ndtReportNumber).toBe('ЗАК-РК-2026-042');
    expect(resValid.patch.ndtResult).toBe('Годен');
  });

  it('resolveLineLabMethodAvailability блокирует методы 0% и оставляет доступными с предупреждением при отсутствии норм', () => {
    const lineWithNorms = makeTestLine(); // rkPercent: 100, uzkPercent: 0, pvkPercent: 0
    const resNorms = resolveLineLabMethodAvailability(lineWithNorms);
    expect(resNorms.hasLineNorms).toBe(true);
    expect(resNorms.warningMessage).toBeUndefined();
    expect(resNorms.methods['ВИК'].disabled).toBe(false);
    expect(resNorms.methods['РК'].disabled).toBe(false);
    expect(resNorms.methods['УЗК'].disabled).toBe(true);
    expect(resNorms.methods['ПВК'].disabled).toBe(true);
    expect(resNorms.requiredMethods).toEqual(['ВИК', 'РК']);

    // Если линия не привязана к Лайнлисту -> все методы доступны + предупреждение
    const resUnlinked = resolveLineLabMethodAvailability(null);
    expect(resUnlinked.hasLineNorms).toBe(false);
    expect(resUnlinked.warningMessage).toContain('Лайнлисту');
    expect(resUnlinked.methods['УЗК'].disabled).toBe(false);
    expect(resUnlinked.methods['ПВК'].disabled).toBe(false);
  });

  it('getRequestMethodsList, buildMultiMethodLabConclusionPatch и isJointConclusionCompletedForRequest работают с пакетами методов', () => {
    expect(
      getRequestMethodsList({ requestedMethod: 'РК', requestedMethods: ['УЗК', 'ВИК', 'РК'] })
    ).toEqual(['ВИК', 'РК', 'УЗК']);

    const j = makeTestJoint('j-multi', '010');
    const built = buildMultiMethodLabConclusionPatch(j, 'Первичный ВИК и НК', {
      ВИК: {
        reportNumber: 'ВИК-01-101-Л-1-010',
        date: '2026-11-15',
        result: 'Годен',
        inspector: 'Иванов И.И.',
      },
      РК: {
        reportNumber: 'РК-01-101-Л-1-010',
        date: '2026-11-15',
        result: 'Годен',
        inspector: 'Петров П.П.',
      },
      УЗК: {
        reportNumber: 'УЗК-01-101-Л-1-010',
        date: '2026-11-15',
        result: 'Ремонт',
        inspector: 'Сидоров С.С.',
      },
    });
    expect(built.ok).toBe(true);
    expect(built.patch.vikResult).toBe('Годен');
    // Приоритет статусов: Ремонт выше Годен -> агрегат берёт УЗК
    expect(built.patch.ndtType).toBe('УЗК');
    expect(built.patch.ndtResult).toBe('Ремонт');

    const updatedJoint: WeldJoint = { ...j, ...built.patch };
    expect(
      isJointConclusionCompletedForRequest(updatedJoint, 'Первичный ВИК и НК', ['ВИК', 'РК', 'УЗК'])
    ).toBe(true);
    expect(
      isJointConclusionCompletedForRequest(updatedJoint, 'Первичный ВИК и НК', ['ВИК', 'РК', 'УЗК', 'ПВК'])
    ).toBe(false);
  });

  it('multi-method labConclusions close РК, УЗК and ПВК line deficits simultaneously', () => {
    const line: ProjectLineItem = {
      ...makeTestLine(),
      rkPercent: 100,
      uzkPercent: 100,
      pvkPercent: 100,
    };

    const j1 = makeTestJoint('j-m1', '010');
    const built = buildMultiMethodLabConclusionPatch(j1, 'Первичный ВИК и НК', {
      ВИК: { reportNumber: 'ВИК-010', date: '2026-11-15', result: 'Годен', inspector: 'Иванов И.И.' },
      РК: { reportNumber: 'РК-010', date: '2026-11-15', result: 'Годен', inspector: 'Иванов И.И.' },
      УЗК: { reportNumber: 'УЗК-010', date: '2026-11-15', result: 'Годен', inspector: 'Иванов И.И.' },
      ПВК: { reportNumber: 'ПВК-010', date: '2026-11-15', result: 'Годен', inspector: 'Иванов И.И.' },
    });
    expect(built.ok).toBe(true);
    expect(built.patch.ndtType).toBe('РК+УЗК');

    const passedJoint: WeldJoint = { ...j1, ...built.patch };
    expect(isJointPassedByMethod(passedJoint, 'РК')).toBe(true);
    expect(isJointPassedByMethod(passedJoint, 'УЗК')).toBe(true);
    expect(isJointPassedByMethod(passedJoint, 'ПВК')).toBe(true);

    const statement = calculateLaboratoryDeficitStatement([passedJoint], [line]);
    const row = statement.allLineRows[0];
    expect(row.rkDeficit).toBe(0);
    expect(row.uzkDeficit).toBe(0);
    expect(row.pvkDeficit).toBe(0);
    expect(row.welderDeficits).toHaveLength(0);
    expect(row.hasDeficit).toBe(false);
  });

  it('welder quota detects per-method deficits when only one of multiple required methods is passed', () => {
    const line: ProjectLineItem = {
      ...makeTestLine(),
      rkPercent: 100,
      uzkPercent: 100,
      pvkPercent: 100,
    };
    const jUzkOnly = makeTestJoint('j-uzk-only', '020', {
      ndtType: 'УЗК',
      ndtResult: 'Годен',
      ndtReportNumber: 'УЗК-020',
      ndtDate: '2026-11-15',
    });

    const statement = calculateLaboratoryDeficitStatement([jUzkOnly], [line]);
    const row = statement.allLineRows[0];
    expect(row.uzkDeficit).toBe(0);
    expect(row.rkDeficit).toBe(1);
    expect(row.pvkDeficit).toBe(1);
    expect(row.welderDeficits).toHaveLength(1);
    expect(row.welderDeficits[0].stamp).toBe('W01');
    expect(row.welderDeficits[0].missingMethods).toEqual(['РК', 'ПВК']);
    expect(row.candidateJoints.map((j) => j.id)).toContain('j-uzk-only');
  });

  it('createDraftFromJoint populates both РК and УЗК when ndtType is РК+УЗК', () => {
    const combinedJoint = makeTestJoint('j-comb', '010', {
      ndtType: 'РК+УЗК',
      ndtResult: 'Годен',
      ndtReportNumber: 'РК-УЗК-010',
      ndtDate: '2026-11-15',
      ndtInspector: 'Петров П.П.',
    });

    const draft = createDraftFromJoint(combinedJoint, 'Первичный ВИК и НК', 'Иванов И.И.');
    expect(draft.methods['РК'].result).toBe('Годен');
    expect(draft.methods['РК'].reportNumber).toBe('РК-УЗК-010');
    expect(draft.methods['УЗК'].result).toBe('Годен');
    expect(draft.methods['УЗК'].reportNumber).toBe('РК-УЗК-010');
    expect(draft.methods['ПВК'].result).toBe('Не проводился');
  });

  it('buildAcceptIntoWorkJointPatch uses canonical NdtMethod and isolates ВИК-only requests', () => {
    expect(derivePrimaryNdtMethod(['ВИК'])).toBe('Не требуется');
    expect(derivePrimaryNdtMethod(['ВИК', 'РК', 'УЗК'])).toBe('РК+УЗК');
    expect(derivePrimaryNdtMethod(['ВИК', 'ПВК'])).toBe('ПВК');

    const j = makeTestJoint('j-acc', '030', { vikResult: 'Не проводился' });

    const vikOnlyPatch = buildAcceptIntoWorkJointPatch(
      j,
      {
        controlStage: 'Первичный ВИК и НК',
        requestedMethod: 'Не требуется',
        requestedMethods: ['ВИК'],
      },
      'Орлова Е.В.'
    );
    expect(vikOnlyPatch.vikResult).toBe('В работе');
    expect(vikOnlyPatch.ndtResult).toBeUndefined();
    expect(vikOnlyPatch.ndtType).toBeUndefined();
    expect(vikOnlyPatch.labConclusions?.['ВИК']?.result).toBe('В работе');

    const multiPatch = buildAcceptIntoWorkJointPatch(
      j,
      {
        controlStage: 'Первичный ВИК и НК',
        requestedMethod: 'РК+УЗК',
        requestedMethods: ['ВИК', 'РК', 'УЗК', 'ПВК'],
      },
      'Орлова Е.В.'
    );
    expect(multiPatch.ndtType).toBe('РК+УЗК');
    expect(multiPatch.ndtResult).toBe('В работе');
    expect(multiPatch.labConclusions?.['ПВК']?.result).toBe('В работе');

    const inWorkJoint: WeldJoint = { ...j, ...multiPatch };
    expect(isJointInWorkByMethod(inWorkJoint, 'РК')).toBe(true);
    expect(isJointInWorkByMethod(inWorkJoint, 'УЗК')).toBe(true);
    expect(isJointInWorkByMethod(inWorkJoint, 'ПВК')).toBe(true);
    const statement = calculateLaboratoryDeficitStatement([inWorkJoint], [makeTestLine()]);
    expect(statement.totals.jointsInWorkCount).toBe(1);
  });

  it('getJointLabRequestStatus requires all requested methods before returning Заявка исполнена', () => {
    const jPartial = makeTestJoint('j-part', '040', {
      ndtType: 'РК',
      ndtResult: 'Годен',
      ndtReportNumber: 'РК-040',
      ndtDate: '2026-11-15',
      labConclusions: {
        ВИК: { reportNumber: 'ВИК-040', date: '2026-11-15', result: 'Годен', inspector: 'Иванов И.И.', stage: 'primary' },
        РК: { reportNumber: 'РК-040', date: '2026-11-15', result: 'Годен', inspector: 'Иванов И.И.', stage: 'primary' },
      },
    });
    const req: NdtLabRequest = {
      id: 'req-multi',
      requestNumber: 'ЗНК-2026-099',
      createdAt: '2026-11-15 09:00',
      createdDate: '2026-11-15',
      createdBy: 'Инженер ПТО',
      objectName: 'УКПГ-1С',
      rdCode: 'РД-01',
      lineNumber: '101',
      uniqueLineId: 'РД-01:101',
      contour: 'Контур А',
      controlStage: 'Первичный ВИК и НК',
      requestedMethod: 'РК+УЗК',
      requestedMethods: ['ВИК', 'РК', 'УЗК'],
      jointIds: ['j-part'],
      status: 'В работе ЛНК',
    };

    // УЗК ещё не оформлен -> заявка остаётся в работе
    expect(getJointLabRequestStatus(jPartial, [req])).toBe('Заявка в работе');

    // После оформления УЗК -> заявка исполнена
    const jDone: WeldJoint = {
      ...jPartial,
      labConclusions: {
        ...jPartial.labConclusions,
        УЗК: { reportNumber: 'УЗК-040', date: '2026-11-15', result: 'Годен', inspector: 'Иванов И.И.', stage: 'primary' },
      },
    };
    expect(getJointLabRequestStatus(jDone, [req])).toBe('Заявка исполнена');
  });

  it('buildMultiMethodLabConclusionPatch preserves primary labConclusions on repair stage', () => {
    const jWithPrimary = makeTestJoint('j-rep-keep', '050', {
      ndtType: 'РК',
      ndtResult: 'Ремонт',
      ndtReportNumber: 'РК-050',
      ndtDate: '2026-11-15',
      labConclusions: {
        ВИК: { reportNumber: 'ВИК-050', date: '2026-11-15', result: 'Годен', inspector: 'Иванов И.И.', stage: 'primary' },
        РК: { reportNumber: 'РК-050', date: '2026-11-15', result: 'Ремонт', inspector: 'Иванов И.И.', stage: 'primary' },
      },
    });

    const repairBuilt = buildMultiMethodLabConclusionPatch(
      jWithPrimary,
      'Повторный НК после ремонта',
      {
        РК: { reportNumber: 'РК-050-Р1', date: '2026-11-16', result: 'Годен', inspector: 'Петров П.П.' },
      }
    );

    expect(repairBuilt.ok).toBe(true);
    expect(repairBuilt.patch.repairNdtResult).toBe('Годен');
    // Первичная запись ВИК не стёрта при сохранении только РК после ремонта
    expect(repairBuilt.patch.labConclusions?.['ВИК']?.reportNumber).toBe('ВИК-050');
    expect(repairBuilt.patch.labConclusions?.['РК']?.stage).toBe('repair');
  });
});
