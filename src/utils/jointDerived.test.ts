import { test, assert } from 'vitest';
import {
  deriveFacilitiesFromJoints,
  deriveFacilitiesFromLineList,
  formatJointSummary,
  getJointEquivDiaInch,
  getJointNominalInch,
  isJointWelded,
} from './jointDerived';
import type { FacilityObject, ProjectLineItem, WeldJoint } from '../types/welding';

test('jointDerived: getJointEquivDiaInch uses existing EDI or computes from diameter and wall thickness', () => {
  // Если equivDiameterInch уже задан, возвращает его без пересчета
  const precalculated = getJointEquivDiaInch({
    diameterMm: 219,
    diameterInch: '8"',
    wallThickness: 8,
    equivDiameterInch: 8.75,
  });
  assert.equal(precalculated, 8.75);

  // Если equivDiameterInch не задан, рассчитывает по диаметру и толщине стенки
  const calculated = getJointEquivDiaInch({
    diameterMm: 219,
    diameterInch: '8"',
    wallThickness: 8,
  });
  assert.equal(typeof calculated, 'number');
  assert.equal(calculated > 0, true);
  // Для 8" и толщины 8мм: dInch = 8, Ктолщ(8) = 1.0 -> EDI = 8.00
  assert.equal(calculated, 8);
});

test('jointDerived: getJointNominalInch resolves inch value from diameterInch or diameterMm', () => {
  const fromInchStr = getJointNominalInch({
    diameterMm: 219,
    diameterInch: '8"',
  });
  assert.equal(fromInchStr, 8);

  const fromMm = getJointNominalInch({
    diameterMm: 57,
    diameterInch: '',
  });
  assert.equal(fromMm, 2); // 57мм -> 2"
});

test('jointDerived: deriveFacilitiesFromLineList builds facility and RD hierarchy with contours', () => {
  const lineItems: ProjectLineItem[] = [
    {
      id: 'l1',
      objectName: 'ГСП-1',
      rdCode: '01-100',
      lineNumber: '1',
      lineName: 'Линия подачи сырья',
      testContour: 'К-1',
    } as ProjectLineItem,
    {
      id: 'l2',
      objectName: 'ГСП-1',
      rdCode: '01-100',
      lineNumber: '1',
      lineName: 'Линия подачи сырья',
      testContour: 'К-2',
    } as ProjectLineItem,
    {
      id: 'l3',
      objectName: 'Волхов КС',
      rdCode: '02-200',
      lineNumber: '2',
      lineName: 'Нагнетание газа',
      testContour: 'К-1',
    } as ProjectLineItem,
  ];

  const facilities = deriveFacilitiesFromLineList(lineItems);
  assert.equal(facilities.length, 2);

  const gsp1 = facilities.find((f) => f.name === 'ГСП-1');
  assert.equal(Boolean(gsp1), true);
  assert.equal(gsp1?.rdCodes.length, 1);
  assert.equal(gsp1?.rdCodes[0].code, '01-100');
  assert.deepEqual(gsp1?.rdCodes[0].contours.sort(), ['К-1', 'К-2']);

  const volkhov = facilities.find((f) => f.name === 'Волхов КС');
  assert.equal(Boolean(volkhov), true);
  assert.equal(volkhov?.region, 'Ленинградская область, г. Волхов');
  assert.equal(volkhov?.weatherStation, 'Метеостанция г. Волхов (№26078)');
});

test('jointDerived: deriveFacilitiesFromLineList handles empty list and fallbackMeta', () => {
  const fallback: FacilityObject[] = [
    {
      id: 'meta-1',
      name: 'Базовый объект',
      shortName: 'БО',
      region: 'ЯНАО',
      weatherStation: 'Метеостанция',
      latitude: 68.0,
      longitude: 72.0,
      rdCodes: [{ code: 'RD-01', title: 'РД-01', contours: [] }],
    },
  ];

  assert.deepEqual(deriveFacilitiesFromLineList([], fallback, false), fallback);
  assert.deepEqual(deriveFacilitiesFromLineList([], fallback, true), []);
});

test('jointDerived: deriveFacilitiesFromJoints constructs facility map from joints', () => {
  const mockJoints: WeldJoint[] = [
    {
      id: 'j1',
      objectName: 'ГСП-1',
      rdCode: '01-100',
    } as unknown as WeldJoint,
    {
      id: 'j2',
      objectName: 'ГСП-1',
      rdCode: '01-200',
    } as unknown as WeldJoint,
  ];

  const derived = deriveFacilitiesFromJoints(mockJoints);
  assert.equal(derived.length, 1);
  assert.equal(derived[0].name, 'ГСП-1');
  assert.equal(derived[0].rdCodes.length, 2);
});

test('jointDerived: isJointWelded and formatJointSummary helpers work', () => {
  assert.equal(isJointWelded({ weldingDate: '2026-10-15' }), true);
  assert.equal(isJointWelded({ weldingDate: '' }), false);
  assert.equal(isJointWelded({ weldingDate: '   ' }), false);

  const summary = formatJointSummary({
    objectName: 'ГСП-1',
    rdCode: '01-100',
    jointNumber: '010',
    uniqueLineId: '01-100.01',
  });
  assert.equal(summary, 'ГСП-1 / 01-100 / Стык 010');
});
