import { describe, expect, it } from 'vitest';
import type {
  ProjectLineItem,
  ReadinessSummaryRow,
  WeldJoint,
  WelderProfile,
} from '../types/welding';
import {
  buildControlFunnelData,
  buildWelderAnalyticsRows,
  buildWeldingDynamicsSeries,
  getContourBlockerSummary,
  matchesContourQuickFilter,
} from './analyticsCharts';

function makeJoint(overrides: Partial<WeldJoint>): WeldJoint {
  return {
    id: overrides.id ?? 'j-1',
    objectName: overrides.objectName ?? 'КС-1',
    rdCode: overrides.rdCode ?? 'РД-01',
    lineNumber: overrides.lineNumber ?? '101',
    uniqueLineId: overrides.uniqueLineId ?? 'РД-01::101',
    lineId: overrides.lineId ?? 'l-1',
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

function makeLine(overrides: Partial<ProjectLineItem>): ProjectLineItem {
  return {
    id: overrides.id ?? 'l-1',
    objectName: overrides.objectName ?? 'КС-1',
    rdCode: overrides.rdCode ?? 'РД-01',
    lineNumber: overrides.lineNumber ?? '101',
    uniqueLineId: overrides.uniqueLineId ?? 'РД-01::101',
    pipelineCategory: overrides.pipelineCategory ?? 'II',
    qualityLevel: overrides.qualityLevel ?? 'В',
    rkPercent: overrides.rkPercent ?? 100,
    uzkPercent: overrides.uzkPercent ?? 0,
    ...overrides,
  } as ProjectLineItem;
}

describe('analyticsCharts Stage 2 calculations', () => {
  it('builds daily and weekly welding dynamics with cumulative S-curve', () => {
    const joints = [
      makeJoint({ id: 'j-1', jointNumber: '010', weldingDate: '2026-06-08' }), // Mon
      makeJoint({ id: 'j-2', jointNumber: '020', weldingDate: '2026-06-08', ndtResult: 'В работе' }),
      makeJoint({ id: 'j-3', jointNumber: '030', weldingDate: '2026-06-10' }), // Wed same week
      makeJoint({ id: 'j-4', jointNumber: '040', weldingDate: '2026-06-16', ndtResult: 'Ремонт' }), // Next week
      makeJoint({ id: 'j-5', jointNumber: '050', weldingDate: '', welderStamp: '' }), // Unwelded
    ];

    const daily = buildWeldingDynamicsSeries(joints, 'day');
    expect(daily.activePeriodsCount).toBe(3);
    expect(daily.totalWeldedJoints).toBe(4);
    expect(daily.totalAcceptedJoints).toBe(2);
    expect(daily.peakJointsCount).toBe(2);
    expect(daily.buckets[0].weldedJoints).toBe(2);
    expect(daily.buckets[0].cumWeldedJoints).toBe(2);
    expect(daily.buckets[2].cumWeldedJoints).toBe(4);
    expect(daily.buckets[2].repairJoints).toBe(1);

    const weekly = buildWeldingDynamicsSeries(joints, 'week');
    expect(weekly.activePeriodsCount).toBe(2);
    expect(weekly.buckets[0].weldedJoints).toBe(3);
    expect(weekly.buckets[1].weldedJoints).toBe(1);
    expect(weekly.buckets[1].cumWeldedJoints).toBe(4);
  });

  it('builds 5-stage control funnel and identifies bottlenecks including ID lines', () => {
    const lines = [
      makeLine({ id: 'l-1', uniqueLineId: 'РД-01::101' }),
      makeLine({ id: 'l-2', uniqueLineId: 'РД-01::102' }),
    ];
    const joints = [
      makeJoint({ id: 'j-1', jointNumber: '010' }), // fully accepted
      makeJoint({ id: 'j-2', jointNumber: '020', ndtType: 'Не требуется', ndtResult: 'Не проводился' }), // accepted without NDT
      makeJoint({ id: 'j-3', jointNumber: '030', ndtResult: 'Не проводился' }), // awaiting NDT
      makeJoint({ id: 'j-4', jointNumber: '040', ndtResult: 'Ремонт' }), // active repair
      makeJoint({ id: 'j-5', jointNumber: '050', weldingDate: '', welderStamp: '' }), // unwelded
    ];

    const funnel = buildControlFunnelData(joints, lines, {
      'l-1': { idStatus: 'SIGNED' },
      'l-2': { idStatus: 'IN_WORK' },
    });

    expect(funnel.stages.find((s) => s.id === 'total')?.count).toBe(5);
    expect(funnel.stages.find((s) => s.id === 'welded')?.count).toBe(4);
    expect(funnel.stages.find((s) => s.id === 'ndt')?.count).toBe(2);
    expect(funnel.stages.find((s) => s.id === 'accepted')?.count).toBe(2);
    expect(funnel.unweldedCount).toBe(1);
    expect(funnel.awaitingNdtCount).toBe(1);
    expect(funnel.inRepairCount).toBe(1);
    expect(funnel.ndtNotRequiredCount).toBe(1);
    expect(funnel.signedIdLinesCount).toBe(1);
    expect(funnel.pendingIdLinesCount).toBe(1);
    expect(funnel.idReadinessPct).toBe(50);
  });

  it('computes welder analytics with EDI, defect rate, directory name fallback, and penalty quotas', () => {
    const lines = [makeLine({ id: 'l-1', uniqueLineId: 'РД-01::101', pipelineCategory: 'II' })];
    const welders: WelderProfile[] = [
      { stamp: 'КЛ-01', fullName: 'Иванов И.И.' } as WelderProfile,
    ];
    const joints = [
      makeJoint({ id: 'j-1', jointNumber: '010', welderStamp: 'КЛ-01', welderFullName: '', ndtResult: 'Годен' }),
      makeJoint({ id: 'j-2', jointNumber: '020', welderStamp: 'КЛ-01', welderFullName: '', ndtResult: 'Ремонт' }),
    ];

    const rows = buildWelderAnalyticsRows(joints, lines, welders);
    expect(rows).toHaveLength(1);
    expect(rows[0].fullName).toBe('Иванов И.И.');
    expect(rows[0].totalWelded).toBe(2);
    expect(rows[0].weldedEdi).toBeGreaterThan(0);
    expect(rows[0].defectCount).toBe(1);
    expect(rows[0].defectRatePct).toBe(50);
    expect(rows[0].penaltyRequiredJoints).toBe(2);
    expect(rows[0].status).toBe('penalty_required');
  });

  it('computes contour blockers and matches contour quick filters accurately', () => {
    const rowPendingId: ReadinessSummaryRow = {
      groupKey: 'Контур-А',
      subLabel: 'Линий: 2',
      totalJoints: 10,
      supplementaryJoints: 0,
      weldedCount: 10,
      vikPassedCount: 10,
      ndtPassedCount: 8,
      ndtNotRequiredCount: 2,
      dupNdtPassedCount: 10,
      repairCount: 0,
      fullyCompletedCount: 10,
      weldingPct: 100,
      readinessPct: 100,
      totalEquivDiameterMm: 1590,
      totalNominalInches: 60,
      totalEquivInches: 60,
      weldedEquivInches: 60,
      equivWeldingPct: 100,
      totalLinesCount: 2,
      signedIdLinesCount: 1,
      idReadinessPct: 50,
      testAllowanceStatus: 'welding_done_id_pending',
    };

    const blockers = getContourBlockerSummary(rowPendingId);
    expect(blockers.unweldedCount).toBe(0);
    expect(blockers.ndtDeficitCount).toBe(0);
    expect(blockers.repairCount).toBe(0);
    expect(blockers.unsignedIdLinesCount).toBe(1);
    expect(blockers.hasAnyBlocker).toBe(true);

    expect(matchesContourQuickFilter(rowPendingId, 'welding_done_id_pending')).toBe(true);
    expect(matchesContourQuickFilter(rowPendingId, 'allowed')).toBe(false);
    expect(matchesContourQuickFilter(rowPendingId, 'has_repairs')).toBe(false);
  });
});
