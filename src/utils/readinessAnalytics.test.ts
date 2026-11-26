import { describe, expect, it } from 'vitest';
import type { ProjectLineItem, TestCircuit, WeldJoint } from '../types/welding';
import {
  calculateReadinessReport,
  isJointWeldedWithStamp,
  isLineExecutiveDocSigned,
  resolveTestAllowanceStatus,
} from './readiness';
import { filterAndSortJoints } from './filters';

function makeLine(overrides: Partial<ProjectLineItem>): ProjectLineItem {
  return {
    id: overrides.id ?? 'line-1',
    objectName: overrides.objectName ?? 'КС-1',
    rdCode: overrides.rdCode ?? 'РД-01',
    lineNumber: overrides.lineNumber ?? '101',
    uniqueLineId: overrides.uniqueLineId ?? 'РД-01::101',
    pipelineCategory: 'II',
    qualityLevel: 'В',
    rkPercent: 100,
    uzkPercent: 0,
    testContour: overrides.testContour ?? '',
    idStatus: overrides.idStatus,
    ...overrides,
  } as ProjectLineItem;
}

function makeJoint(overrides: Partial<WeldJoint>): WeldJoint {
  return {
    id: overrides.id ?? 'j-1',
    objectName: overrides.objectName ?? 'КС-1',
    rdCode: overrides.rdCode ?? 'РД-01',
    lineNumber: overrides.lineNumber ?? '101',
    uniqueLineId: overrides.uniqueLineId ?? 'РД-01::101',
    lineId: overrides.lineId ?? 'line-1',
    contour: overrides.contour ?? '',
    testCircuitId: overrides.testCircuitId ?? null,
    jointNumber: overrides.jointNumber ?? '010',
    diameterMm: overrides.diameterMm ?? 159,
    wallThickness: overrides.wallThickness ?? 6,
    weldingDate: overrides.weldingDate ?? '2026-06-10',
    welderStamp: overrides.welderStamp ?? 'КЛ-01',
    vikResult: overrides.vikResult ?? 'Годен',
    ndtType: overrides.ndtType ?? 'РК',
    ndtResult: overrides.ndtResult ?? 'Годен',
    dupNdtType: overrides.dupNdtType ?? 'Не требуется',
    dupNdtResult: overrides.dupNdtResult ?? 'Не проводился',
    ...overrides,
  } as WeldJoint;
}

function makeCircuit(overrides: Partial<TestCircuit>): TestCircuit {
  return {
    id: overrides.id ?? 'tc-1',
    facilityId: overrides.facilityId ?? 'fac-1',
    objectName: overrides.objectName ?? 'КС-1',
    name: overrides.name ?? 'К-01',
    sriStatus: 'APPROVED',
    testStatus: overrides.testStatus ?? 'NOT_TESTED',
    recordStatus: 'DRAFT',
    version: 1,
    totalJoints: 0,
    weldedJoints: 0,
    weldingJointsPercent: 0,
    totalDInch: 0,
    weldedDInch: 0,
    weldingDInchPercent: 0,
    totalEdi: 0,
    weldedEdi: 0,
    weldingEdiPercent: 0,
    defectiveJointsCount: 0,
    linesSummary: overrides.linesSummary ?? [],
    ...overrides,
  };
}

describe('readiness analytics with executive docs and test circuits', () => {
  it('prefers executive_docs record over legacy line.idStatus', () => {
    const line = makeLine({ id: 'l-1', idStatus: 'SIGNED' });
    expect(isLineExecutiveDocSigned(line)).toBe(true);
    expect(isLineExecutiveDocSigned(line, { 'l-1': { idStatus: 'IN_WORK' } })).toBe(false);
    expect(isLineExecutiveDocSigned(line, { 'l-1': { idStatus: 'SIGNED' } })).toBe(true);
  });

  it('computes test allowance statuses accurately', () => {
    expect(
      resolveTestAllowanceStatus({
        totalJoints: 4,
        fullyCompletedCount: 4,
        repairCount: 0,
        totalLinesCount: 2,
        signedIdLinesCount: 2,
      })
    ).toBe('allowed');

    expect(
      resolveTestAllowanceStatus({
        totalJoints: 4,
        fullyCompletedCount: 4,
        repairCount: 0,
        totalLinesCount: 2,
        signedIdLinesCount: 1,
      })
    ).toBe('welding_done_id_pending');

    expect(
      resolveTestAllowanceStatus({
        totalJoints: 4,
        fullyCompletedCount: 2,
        repairCount: 0,
        totalLinesCount: 2,
        signedIdLinesCount: 2,
      })
    ).toBe('id_signed_welding_pending');

    expect(
      resolveTestAllowanceStatus({
        totalJoints: 4,
        fullyCompletedCount: 2,
        repairCount: 1,
        totalLinesCount: 2,
        signedIdLinesCount: 1,
      })
    ).toBe('in_work');
  });

  it('aggregates lines and executive doc status across Object, Contour, RD, and Line views', () => {
    const lines = [
      makeLine({ id: 'l-1', objectName: 'КС-1', rdCode: 'РД-01', lineNumber: '101', uniqueLineId: 'РД-01::101' }),
      makeLine({ id: 'l-2', objectName: 'КС-1', rdCode: 'РД-01', lineNumber: '102', uniqueLineId: 'РД-01::102' }),
      makeLine({ id: 'l-3', objectName: 'КС-1', rdCode: 'РД-02', lineNumber: '201', uniqueLineId: 'РД-02::201' }),
    ];

    const testCircuits = [
      makeCircuit({
        id: 'tc-1',
        name: 'Контур-А',
        testStatus: 'NOT_TESTED',
        linesSummary: [
          {
            lineId: 'l-1',
            lineNumber: '101',
            uniqueLineId: 'РД-01::101',
            rdCode: 'РД-01',
            assignedJointsCount: 1,
            lineTotalJointsCount: 1,
            isFullLine: true,
          },
        ],
      }),
      makeCircuit({
        id: 'tc-2',
        name: 'Контур-Б',
        testStatus: 'NOT_TESTED',
        linesSummary: [
          {
            lineId: 'l-2',
            lineNumber: '102',
            uniqueLineId: 'РД-01::102',
            rdCode: 'РД-01',
            assignedJointsCount: 1,
            lineTotalJointsCount: 1,
            isFullLine: true,
          },
          {
            lineId: 'l-3',
            lineNumber: '201',
            uniqueLineId: 'РД-02::201',
            rdCode: 'РД-02',
            assignedJointsCount: 0,
            lineTotalJointsCount: 0,
            isFullLine: false,
          },
        ],
      }),
    ];

    const joints = [
      makeJoint({
        id: 'j-1',
        lineId: 'l-1',
        uniqueLineId: 'РД-01::101',
        rdCode: 'РД-01',
        lineNumber: '101',
        testCircuitId: 'tc-1',
        jointNumber: '010',
      }),
      makeJoint({
        id: 'j-2',
        lineId: 'l-2',
        uniqueLineId: 'РД-01::102',
        rdCode: 'РД-01',
        lineNumber: '102',
        testCircuitId: 'tc-2',
        jointNumber: '020',
      }),
    ];

    const docByLineId = {
      'l-1': { idStatus: 'SIGNED' },
      'l-2': { idStatus: 'SIGNED' },
      'l-3': { idStatus: 'IN_WORK' },
    };

    // 1. Объект: 3 линии, 2 подписаны (67%)
    const byObj = calculateReadinessReport(joints, 'objectName', {
      lines,
      testCircuits,
      docByLineId,
    });
    expect(byObj).toHaveLength(1);
    expect(byObj[0].totalLinesCount).toBe(3);
    expect(byObj[0].signedIdLinesCount).toBe(2);
    expect(byObj[0].idReadinessPct).toBe(67);
    expect(byObj[0].subLabel).toContain('Контуров: 2');

    // 2. Контур испытаний: Контур-А (1/1 подписана, сварка 100% -> allowed), Контур-Б (1/2 подписана, сварка 100% -> welding_done_id_pending)
    const byContour = calculateReadinessReport(joints, 'contour', {
      lines,
      testCircuits,
      docByLineId,
    });
    const contourA = byContour.find((r) => r.groupKey === 'Контур-А');
    const contourB = byContour.find((r) => r.groupKey === 'Контур-Б');
    expect(contourA?.totalLinesCount).toBe(1);
    expect(contourA?.signedIdLinesCount).toBe(1);
    expect(contourA?.testAllowanceStatus).toBe('allowed');
    expect(contourB?.totalLinesCount).toBe(2);
    expect(contourB?.signedIdLinesCount).toBe(1);
    expect(contourB?.idReadinessPct).toBe(50);
    expect(contourB?.testAllowanceStatus).toBe('welding_done_id_pending');

    // 3. Шифр РД: РД-01 (2/2 = 100%), РД-02 (0/1 = 0%, даже без стыков!)
    const byRd = calculateReadinessReport(joints, 'rdCode', {
      lines,
      testCircuits,
      docByLineId,
    });
    const rd1 = byRd.find((r) => r.groupKey === 'РД-01');
    const rd2 = byRd.find((r) => r.groupKey === 'РД-02');
    expect(rd1?.signedIdLinesCount).toBe(2);
    expect(rd1?.totalLinesCount).toBe(2);
    expect(rd1?.idReadinessPct).toBe(100);
    expect(rd2?.signedIdLinesCount).toBe(0);
    expect(rd2?.totalLinesCount).toBe(1);

    // 4. Линия: статус ИД для каждой линии
    const byLine = calculateReadinessReport(joints, 'uniqueLineId', {
      lines,
      testCircuits,
      docByLineId,
    });
    expect(byLine.find((r) => r.groupKey === 'РД-01::101')?.lineIdStatus).toBe('SIGNED');
    expect(byLine.find((r) => r.groupKey === 'РД-02::201')?.lineIdStatus).toBe('IN_WORK');
  });

  it('unifies welded joint check (date + stamp or welderStampsList) and counts ndtNotRequiredCount transparently', () => {
    const line = makeLine({ id: 'l-1', uniqueLineId: 'РД-01::101' });

    const jointDateOnly = makeJoint({
      id: 'j-date-only',
      jointNumber: '010',
      weldingDate: '2026-06-10',
      welderStamp: '',
      welderStampsList: [],
    });
    const jointMultiStamp = makeJoint({
      id: 'j-multi-stamp',
      jointNumber: '020',
      weldingDate: '2026-06-10',
      welderStamp: '',
      welderStampsList: ['КЛ-02'],
      vikResult: 'Годен',
      ndtType: 'Не требуется',
      ndtResult: 'Не проводился',
    });
    const jointPhysicalNdt = makeJoint({
      id: 'j-rk',
      jointNumber: '030',
      weldingDate: '2026-06-11',
      welderStamp: 'КЛ-01',
      vikResult: 'Годен',
      ndtType: 'РК',
      ndtResult: 'Годен',
    });

    expect(isJointWeldedWithStamp(jointDateOnly)).toBe(false);
    expect(isJointWeldedWithStamp(jointMultiStamp)).toBe(true);
    expect(isJointWeldedWithStamp(jointPhysicalNdt)).toBe(true);

    const rows = calculateReadinessReport(
      [jointDateOnly, jointMultiStamp, jointPhysicalNdt],
      'uniqueLineId',
      { lines: [line] }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].totalJoints).toBe(3);
    expect(rows[0].weldedCount).toBe(2);
    expect(rows[0].ndtPassedCount).toBe(1);
    expect(rows[0].ndtNotRequiredCount).toBe(1);
    expect(rows[0].fullyCompletedCount).toBe(2);
  });

  it('omits empty groups when excludeEmptyGroups is enabled for period filtering', () => {
    const lines = [
      makeLine({ id: 'l-1', rdCode: 'РД-01', lineNumber: '101', uniqueLineId: 'РД-01::101' }),
      makeLine({ id: 'l-2', rdCode: 'РД-02', lineNumber: '201', uniqueLineId: 'РД-02::201' }),
    ];
    const joints = [
      makeJoint({ id: 'j-1', lineId: 'l-1', rdCode: 'РД-01', lineNumber: '101', uniqueLineId: 'РД-01::101' }),
    ];

    const withEmpty = calculateReadinessReport(joints, 'uniqueLineId', {
      lines,
      excludeEmptyGroups: false,
    });
    const withoutEmpty = calculateReadinessReport(joints, 'uniqueLineId', {
      lines,
      excludeEmptyGroups: true,
    });

    expect(withEmpty).toHaveLength(2);
    expect(withoutEmpty).toHaveLength(1);
    expect(withoutEmpty[0].groupKey).toBe('РД-01::101');
  });

  it('resolves contour filter via testCircuitId and filters active repairs for drill-down', () => {
    const circuits = [makeCircuit({ id: 'tc-9', name: 'Контур-9' })];
    const jInCircuitRepair = makeJoint({
      id: 'j-rep',
      jointNumber: '010',
      contour: '',
      testCircuitId: 'tc-9',
      ndtResult: 'Ремонт',
    });
    const jInCircuitOk = makeJoint({
      id: 'j-ok',
      jointNumber: '020',
      contour: '',
      testCircuitId: 'tc-9',
      ndtResult: 'Годен',
    });
    const jNoContour = makeJoint({
      id: 'j-none',
      jointNumber: '030',
      contour: '',
      testCircuitId: null,
      ndtResult: 'Ремонт',
    });

    const byContour = filterAndSortJoints([jInCircuitRepair, jInCircuitOk, jNoContour], {
      globalSearch: '',
      columnFilters: { contour: ['Контур-9'] },
      sortConfig: null,
      testCircuits: circuits,
    });
    expect(byContour.map((j) => j.id)).toEqual(['j-rep', 'j-ok']);

    const byContourRepairs = filterAndSortJoints([jInCircuitRepair, jInCircuitOk, jNoContour], {
      globalSearch: '',
      columnFilters: { contour: ['Контур-9'] },
      sortConfig: null,
      testCircuits: circuits,
      onlyActiveRepairs: true,
    });
    expect(byContourRepairs.map((j) => j.id)).toEqual(['j-rep']);

    const withoutContour = filterAndSortJoints([jInCircuitRepair, jInCircuitOk, jNoContour], {
      globalSearch: '',
      columnFilters: { contour: [''] },
      sortConfig: null,
      testCircuits: circuits,
    });
    expect(withoutContour.map((j) => j.id)).toEqual(['j-none']);
  });
});
