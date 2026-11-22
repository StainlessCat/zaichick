import { describe, expect, it } from 'vitest';
import {
  buildLabConclusionPatch,
  calculateLaboratoryDeficitStatement,
  getActiveLabRequestForJoint,
} from './laboratoryLogic';
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
});
