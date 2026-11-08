import {
  ElementCombination,
  JointKind,
  LRVItem,
  PreheatRegimeRule,
  ProjectLineItem,
  TechCardItem,
  WelderNaksCert,
  WelderProfile,
  WeldingMaterialCertificate,
  WeldingType,
  WeldJoint,
} from '../types/welding';

/**
 * Единый централизованный модуль нормализации сущностей системы ZAYCHICK.
 * Устраняет дублирование логики установки значений по умолчанию между клиентом и сервером.
 */

export function normalizeTechCard(tc: Partial<TechCardItem>): TechCardItem {
  return {
    id: tc.id || `tc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    number: tc.number || '',
    title: tc.title || tc.number || 'Технологическая карта сварки',
    weldingType: (tc.weldingType as WeldingType) || 'РД',
    jointKind: (tc.jointKind as JointKind) || 'Стыковое',
    elementCombination: (tc.elementCombination as ElementCombination) || 'Труба+Труба',
    ntd: tc.ntd || 'СТО Газпром 15-1.1-002-2023',
    steelGroup: tc.steelGroup || '',
    minDiameterMm: Number(tc.minDiameterMm) || 0,
    maxDiameterMm: Number(tc.maxDiameterMm) || 9999,
    minWallThicknessMm: Number(tc.minWallThicknessMm) || 0,
    maxWallThicknessMm: Number(tc.maxWallThicknessMm) || 999,
    recommendedMaterials: tc.recommendedMaterials || '',
    preheatRules: Array.isArray(tc.preheatRules)
      ? tc.preheatRules.map((r: PreheatRegimeRule) => ({ ...r }))
      : [],
  };
}

export function normalizeWelderProfile(w: Partial<WelderProfile>): WelderProfile {
  let certs: WelderNaksCert[] = Array.isArray(w.naksCerts) ? [...w.naksCerts] : [];
  if (certs.length === 0 && w.allowedMethods && w.allowedMethods.length > 0) {
    certs = w.allowedMethods.map((m) => ({
      weldingType: m as WeldingType,
      certNumber: w.certNumber || 'НАКС',
      issueDate: w.certIssueDate,
      expiryDate: w.certExpiryDate,
    }));
  }
  if (certs.length === 0 && w.certNumber) {
    certs = [
      {
        weldingType: 'РД',
        certNumber: w.certNumber,
        issueDate: w.certIssueDate,
        expiryDate: w.certExpiryDate,
      },
    ];
  }

  return {
    id: w.id || `welder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    stamp: w.stamp || '',
    fullName: w.fullName || '',
    certNumber: w.certNumber || '',
    certIssueDate: w.certIssueDate,
    certExpiryDate: w.certExpiryDate || '',
    attestationArea: w.attestationArea || '',
    admissionSheetNumber: w.admissionSheetNumber,
    admissionSheetDate: w.admissionSheetDate,
    allowedMethods: w.allowedMethods && w.allowedMethods.length > 0 ? w.allowedMethods : ['РД'],
    naksCerts: certs,
    crewForeman: w.crewForeman || '',
    steelGroups: w.steelGroups,
    minDiameterMm: w.minDiameterMm,
    maxDiameterMm: w.maxDiameterMm,
    minWallThicknessMm: w.minWallThicknessMm,
    maxWallThicknessMm: w.maxWallThicknessMm,
    isBrigade: Boolean(w.isBrigade),
    brigadeMembers: w.brigadeMembers,
  };
}

export function normalizeMaterialCertificate(
  m: Partial<WeldingMaterialCertificate>
): WeldingMaterialCertificate {
  return {
    id: m.id || `mat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    brandAndDiameter: m.brandAndDiameter || '',
    materialType: m.materialType || 'Электроды покрытые',
    weldingMethod: (m.weldingMethod as WeldingType) || 'РД',
    batchNumber: m.batchNumber || '',
    certificateNumber: m.certificateNumber || '',
    incomingControlAct: m.incomingControlAct || '',
    incomingControlDate: m.incomingControlDate || '',
    status: m.status || 'Допущен в производство',
  };
}

export function normalizeWeldJoint(j: Partial<WeldJoint>): WeldJoint {
  return {
    ...j,
    id: j.id || `joint-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    jointNumber: j.jointNumber || '',
    uniqueLineId: j.uniqueLineId || '',
    rdCode: j.rdCode || '',
    objectName: j.objectName || '',
    contour: j.contour || '',
    lineNumber: j.lineNumber || '',
    jointType: j.jointType || 'Монтажный',
    weldingType: (j.weldingType as WeldingType) || 'РД',
    jointKind: (j.jointKind as JointKind) || 'Стыковое',
    diameterMm: Number(j.diameterMm) || 0,
    diameterInch: j.diameterInch || '',
    wallThickness: Number(j.wallThickness) || 0,
    lrv1Code: j.lrv1Code || '',
    elem1Name: j.elem1Name || '',
    elem1Material: j.elem1Material || '',
    elem1Ntd: j.elem1Ntd || '',
    lrv2Code: j.lrv2Code || '',
    elem2Name: j.elem2Name || '',
    elem2Material: j.elem2Material || '',
    elem2Ntd: j.elem2Ntd || '',
    welderStamp: j.welderStamp || '',
    weldingDate: j.weldingDate || '',
    vikDate: j.vikDate || '',
    vikResult: j.vikResult || 'Не проводился',
    vikInspector: j.vikInspector || '',
    ndtType: j.ndtType || 'РК',
    ndtResult: j.ndtResult || 'Не проводился',
    version: j.version ?? 1,
    updatedAt: j.updatedAt || new Date().toISOString(),
    updatedBy: j.updatedBy || 'Система',
  } as WeldJoint;
}

export function normalizeProjectLineItem(l: Partial<ProjectLineItem>): ProjectLineItem {
  return {
    id: l.id || `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    uniqueLineId: l.uniqueLineId || '',
    lineNumber: l.lineNumber || '',
    lineName: l.lineName || '',
    rdCode: l.rdCode || '',
    objectName: l.objectName || '',
    product: l.product || '',
    testContour: l.testContour || '',
    weldingNtd: l.weldingNtd || 'СТО Газпром 15-1.1-002-2023',
    controlNtd: l.controlNtd || 'СТО Газпром 15-1.1-002-2023',
    qualityLevel: l.qualityLevel || '',
    pipelineCategory: l.pipelineCategory || '',
    workingPressure: l.workingPressure || '',
    workingTemperature: l.workingTemperature || '',
    rkPercent: Number(l.rkPercent) || 0,
    uzkPercent: Number(l.uzkPercent) || 0,
    pvkPercent: Number(l.pvkPercent) || 0,
    testDate: l.testDate || '',
    manualStatus: l.manualStatus,
    version: l.version ?? 1,
  };
}

export function normalizeLrvItem(item: Partial<LRVItem>): LRVItem {
  return {
    id: item.id || `lrv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    lrvCode: item.lrvCode || '',
    rdCode: item.rdCode || '',
    objectName: item.objectName || '',
    shortName: item.shortName || '',
    category: item.category,
    connectionType: item.connectionType,
    material: item.material || '',
    ntd: item.ntd || '',
    manufacturer: item.manufacturer,
    dn1: item.dn1,
    diameterMm: Number(item.diameterMm) || 0,
    wallThickness: Number(item.wallThickness) || 0,
    dn2: item.dn2,
    diameterMm2: item.diameterMm2,
    wallThickness2: item.wallThickness2,
    specQty: Number(item.specQty) || 0,
    unit: item.unit || 'шт',
    status: item.status || 'active',
    replacementLetter: item.replacementLetter,
    replacementDate: item.replacementDate,
    version: item.version ?? 1,
  };
}
