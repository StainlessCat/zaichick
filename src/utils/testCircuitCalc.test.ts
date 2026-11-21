import { describe, expect, it } from 'vitest';
import type { ProjectLineItem, TestCircuit, UserAccount, WeldJoint } from '../types/welding';
import {
  buildSeedTestCircuitsFromJoints,
  computeCircuitMetricsLocal,
  hasJointUnresolvedDefect,
} from './testCircuitCalc';
import {
  canForceCloseTestCircuit,
  canManageTestCircuits,
  canUserEditJointField,
  getUserRolePermissions,
} from './rbac';

function makeJoint(overrides: Partial<WeldJoint> = {}): WeldJoint {
  return {
    id: overrides.id ?? 'j-1',
    objectName: 'УКПГ-2В',
    rdCode: 'РД-001',
    contour: 'КИ-1',
    lineNumber: 'Л-101',
    uniqueLineId: 'РД-001:Л-101',
    jointNumber: '010',
    jointType: 'Монтажный',
    diameterMm: 159,
    diameterInch: '6"',
    wallThickness: 8.0,
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
    weldingDate: '2026-06-10',
    welderStamp: 'А142',
    weldingMaterials: '',
    ambientTemp: '+12',
    preheatTemp: '',
    responsiblePerson: '',
    welderFullName: '',
    welderCertNumber: '',
    techCardNumber: '',
    vikResult: 'Годен',
    vikDate: '2026-06-11',
    vikInspector: '',
    ndtType: 'РК',
    ndtDate: '2026-06-12',
    ndtResult: 'Годен',
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
    testCircuitId: 'tc-1',
    recordStatus: 'DRAFT',
    version: 1,
    updatedAt: '2026-06-12T10:00:00Z',
    updatedBy: 'Тест',
    ...overrides,
  };
}

function makeCircuit(overrides: Partial<TestCircuit> = {}): TestCircuit {
  return {
    id: 'tc-1',
    facilityId: 'fac-1',
    objectName: 'УКПГ-2В',
    name: 'КИ-1',
    sriName: 'СРИ-01',
    sriStatus: 'APPROVED',
    testStatus: 'NOT_TESTED',
    plannedDate: '2026-07-01',
    actualTestDate: null,
    actNumber: null,
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
    linesSummary: [],
    ...overrides,
  };
}

function makeLine(overrides: Partial<ProjectLineItem> = {}): ProjectLineItem {
  return {
    id: 'line-1',
    objectName: 'УКПГ-2В',
    rdCode: 'РД-001',
    lineNumber: 'Л-101',
    uniqueLineId: 'РД-001:Л-101',
    lineName: 'Линия 101',
    product: 'Газ',
    testContour: 'КИ-1',
    weldingNtd: '',
    controlNtd: '',
    qualityLevel: 'А',
    pipelineCategory: 'I',
    workingPressure: '10 МПа',
    workingTemperature: '+20 °C',
    rkPercent: 100,
    uzkPercent: 0,
    pvkPercent: 0,
    manualStatus: 'В работе',
    testDate: '',
    ...overrides,
  };
}

function makeUser(
  systemRole: UserAccount['systemRole'],
  departmentCode: UserAccount['departmentCode']
): UserAccount {
  return {
    id: `u-${systemRole}-${departmentCode}`,
    login: `${systemRole}_${departmentCode}`.toLowerCase(),
    password: '',
    fullName: 'Тестовый пользователь',
    role: `${systemRole} ${departmentCode}`,
    department: String(departmentCode),
    systemRole,
    departmentCode,
    isActive: true,
    isAdmin: systemRole === 'SUPERADMIN',
    sessionNumber: 1,
  };
}

describe('testCircuitCalc — дефекты и готовность контура', () => {
  it('корректно выявляет неисправленный брак и подтверждённый ремонт', () => {
    const clean = makeJoint();
    expect(hasJointUnresolvedDefect(clean)).toBe(false);

    const unresolvedVik = makeJoint({ vikResult: 'Ремонт' });
    expect(hasJointUnresolvedDefect(unresolvedVik)).toBe(true);

    const unresolvedNdt = makeJoint({ ndtResult: 'Вырезать' });
    expect(hasJointUnresolvedDefect(unresolvedNdt)).toBe(true);

    const repairedOk = makeJoint({
      ndtResult: 'Ремонт',
      repairAction: 'Ремонт',
      repairVikResult: 'Годен',
      repairNdtType: 'РК',
      repairNdtResult: 'Годен',
    });
    expect(hasJointUnresolvedDefect(repairedOk)).toBe(false);

    const repairedFailNdt = makeJoint({
      ndtResult: 'Ремонт',
      repairAction: 'Ремонт',
      repairVikResult: 'Годен',
      repairNdtType: 'РК',
      repairNdtResult: 'Ремонт',
    });
    expect(hasJointUnresolvedDefect(repairedFailNdt)).toBe(true);
  });

  it('рассчитывает стыки, DN d-inch, Method A EDI и частичную/полную привязку линий (без захлёстного стыка)', () => {
    const circuit = makeCircuit();
    const lines = [
      makeLine({ id: 'line-1', lineNumber: 'Л-101', uniqueLineId: 'РД-001:Л-101' }),
      makeLine({ id: 'line-2', lineNumber: 'Л-102', uniqueLineId: 'РД-001:Л-102' }),
    ];

    // Линия 101: 2 стыка всего, оба в контуре (полная линия)
    // 159 мм = 6", стенка 8 мм -> K=1.0 -> EDI = 6.0; 219 мм = 8", стенка 16 мм -> K=1.5 -> EDI = 12.0
    const j1 = makeJoint({
      id: 'j-1',
      lineId: 'line-1',
      uniqueLineId: 'РД-001:Л-101',
      lineNumber: 'Л-101',
      jointNumber: '010',
      diameterMm: 159,
      diameterInch: '6"',
      wallThickness: 8,
      weldingDate: '2026-06-10',
      welderStamp: 'А142',
      testCircuitId: 'tc-1',
    });
    const j2 = makeJoint({
      id: 'j-2',
      lineId: 'line-1',
      uniqueLineId: 'РД-001:Л-101',
      lineNumber: 'Л-101',
      jointNumber: '020',
      diameterMm: 219,
      diameterInch: '8"',
      wallThickness: 16,
      weldingDate: '',
      welderStamp: '',
      vikResult: 'Не проводился',
      ndtResult: 'Не проводился',
      testCircuitId: 'tc-1',
    });

    // Линия 102: 2 стыка всего, но стык 020 (захлёстный) не привязан к контуру -> частичная линия 1/2
    const j3 = makeJoint({
      id: 'j-3',
      lineId: 'line-2',
      uniqueLineId: 'РД-001:Л-102',
      lineNumber: 'Л-102',
      jointNumber: '010',
      diameterMm: 159,
      diameterInch: '6"',
      wallThickness: 8,
      weldingDate: '2026-06-11',
      welderStamp: 'А142',
      ndtResult: 'Ремонт',
      testCircuitId: 'tc-1',
    });
    const j4TieIn = makeJoint({
      id: 'j-4',
      lineId: 'line-2',
      uniqueLineId: 'РД-001:Л-102',
      lineNumber: 'Л-102',
      jointNumber: '020',
      diameterMm: 159,
      diameterInch: '6"',
      wallThickness: 8,
      weldingDate: '',
      welderStamp: '',
      testCircuitId: null,
      contour: '',
    });

    const detail = computeCircuitMetricsLocal(circuit, [j1, j2, j3, j4TieIn], lines);

    expect(detail.totalJoints).toBe(3);
    expect(detail.weldedJoints).toBe(2);
    expect(detail.weldingJointsPercent).toBeCloseTo(66.7, 1);

    // DN d-inch: total = 6 + 8 + 6 = 20, welded = 6 + 6 = 12 -> 60%
    expect(detail.totalDInch).toBe(20);
    expect(detail.weldedDInch).toBe(12);
    expect(detail.weldingDInchPercent).toBe(60);

    // Method A EDI: j1=6.0 (wall 8mm, K=1.0), j2=8*1.75=14.0 (wall 16mm, K=1.75), j3=6.0 -> total=26.0, welded=12.0 -> 46.2%
    expect(detail.totalEdi).toBe(26);
    expect(detail.weldedEdi).toBe(12);
    expect(detail.weldingEdiPercent).toBeCloseTo(46.2, 1);

    // 1 неисправленный брак (j3)
    expect(detail.defectiveJointsCount).toBe(1);

    // Сводка линий: Л-101 полная (2/2), Л-102 частичная (1/2)
    expect(detail.linesSummary).toHaveLength(2);
    const l101 = detail.linesSummary.find((l) => l.lineNumber === 'Л-101');
    const l102 = detail.linesSummary.find((l) => l.lineNumber === 'Л-102');
    expect(l101?.isFullLine).toBe(true);
    expect(l101?.assignedJointsCount).toBe(2);
    expect(l101?.lineTotalJointsCount).toBe(2);
    expect(l102?.isFullLine).toBe(false);
    expect(l102?.assignedJointsCount).toBe(1);
    expect(l102?.lineTotalJointsCount).toBe(2);
  });

  it('строит демонстрационные контуры из текстового поля contour без дублей', () => {
    const j1 = makeJoint({ id: 'j-1', testCircuitId: undefined, contour: 'КИ-А' });
    const j2 = makeJoint({ id: 'j-2', testCircuitId: undefined, contour: 'КИ-А' });
    const j3 = makeJoint({ id: 'j-3', testCircuitId: undefined, contour: 'КИ-Б' });
    const seeded = buildSeedTestCircuitsFromJoints([j1, j2, j3], [makeLine()]);

    expect(seeded).toHaveLength(2);
    expect(seeded[0].totalJoints).toBe(2);
    expect(seeded[1].totalJoints).toBe(1);
  });
});

describe('RBAC — модуль Испытания и права СК / ПТО', () => {
  it('разрешает управление контурами для PTO/SK (OPERATOR и DEPT_ADMIN) и SUPERADMIN, запрещает для PIL/OGS/VIEWER', () => {
    expect(canManageTestCircuits(makeUser('SUPERADMIN', 'ALL'))).toBe(true);
    expect(canManageTestCircuits(makeUser('DEPT_ADMIN', 'PTO'))).toBe(true);
    expect(canManageTestCircuits(makeUser('OPERATOR', 'PTO'))).toBe(true);
    expect(canManageTestCircuits(makeUser('DEPT_ADMIN', 'SK'))).toBe(true);
    expect(canManageTestCircuits(makeUser('OPERATOR', 'SK'))).toBe(true);

    expect(canManageTestCircuits(makeUser('VIEWER', 'SK'))).toBe(false);
    expect(canManageTestCircuits(makeUser('VIEWER', 'PTO'))).toBe(false);
    expect(canManageTestCircuits(makeUser('OPERATOR', 'PIL'))).toBe(false);
    expect(canManageTestCircuits(makeUser('DEPT_ADMIN', 'PIL'))).toBe(false);
    expect(canManageTestCircuits(makeUser('OPERATOR', 'OGS'))).toBe(false);
  });

  it('разрешает принудительное закрытие контура только SUPERADMIN и DEPT_ADMIN (PTO / SK)', () => {
    expect(canForceCloseTestCircuit(makeUser('SUPERADMIN', 'ALL'))).toBe(true);
    expect(canForceCloseTestCircuit(makeUser('DEPT_ADMIN', 'PTO'))).toBe(true);
    expect(canForceCloseTestCircuit(makeUser('DEPT_ADMIN', 'SK'))).toBe(true);

    expect(canForceCloseTestCircuit(makeUser('OPERATOR', 'PTO'))).toBe(false);
    expect(canForceCloseTestCircuit(makeUser('OPERATOR', 'SK'))).toBe(false);
    expect(canForceCloseTestCircuit(makeUser('DEPT_ADMIN', 'PIL'))).toBe(false);
  });

  it('разрешает инженеру СК редактировать только поля привязки к контуру на стыке', () => {
    const skOp = makeUser('OPERATOR', 'SK');
    expect(canUserEditJointField(skOp, 'testCircuitId')).toBe(true);
    expect(canUserEditJointField(skOp, 'contour')).toBe(true);
    expect(canUserEditJointField(skOp, 'weldingDate')).toBe(false);
    expect(canUserEditJointField(skOp, 'ndtResult')).toBe(false);

    const skPerms = getUserRolePermissions(skOp);
    expect(skPerms.canManageTestCircuits).toBe(true);
    expect(skPerms.canEditPrepAndWeldingFields).toBe(false);
    expect(skPerms.canEditNdtFields).toBe(false);
  });
});
