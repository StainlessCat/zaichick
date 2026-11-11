import type {
  AuditLogEntry,
  ColumnTemplate,
  ControlResult,
  CustomWeatherStation,
  ElementCombination,
  FacilityObject,
  InspectorProfile,
  JointKind,
  JointType,
  LRVItem,
  LrvElementCategory,
  NdtMethod,
  OptimisticLockConflictPayload,
  ProjectLineItem,
  TechCardItem,
  UserAccount,
  WelderNaksCert,
  WelderProfile,
  WeldingMaterialCertificate,
  WeldingType,
  WeldJoint,
  WeldJointFieldKey,
} from '../types/welding';
import { FIELD_LABELS_MAP } from '../utils/weldingLogic';
import type { OptimisticConflictDto } from './client';

export type BackendRole = 'ADMIN' | 'PTO' | 'OGS' | 'PIL' | 'VIEWER';

const ROLE_LABELS_RU: Record<BackendRole, string> = {
  ADMIN: 'Системный администратор (Полный доступ)',
  PTO: 'Инженер ПТО / СМР',
  OGS: 'Технолог ОГС / Главный сварщик',
  PIL: 'Дефектоскопист / Начальник ЛНК (ПИЛ)',
  VIEWER: 'Представитель Заказчика / СК (Только чтение)',
};

export function toBackendRole(input: string | BackendRole | undefined): BackendRole {
  const raw = String(input || '').trim().toUpperCase();
  if (raw === 'ADMIN' || raw === 'PTO' || raw === 'OGS' || raw === 'PIL' || raw === 'VIEWER') {
    return raw;
  }
  const low = String(input || '').toLowerCase();
  if (low.includes('админ') || low.includes('полный')) return 'ADMIN';
  if (low.includes('технолог') || low.includes('сварщ') || low.includes('огс')) return 'OGS';
  if (low.includes('лнк') || low.includes('дефект') || low.includes('пил') || low.includes('вик')) return 'PIL';
  if (low.includes('заказчик') || low.includes('стройконтрол') || low.includes('чтение')) return 'VIEWER';
  return 'PTO';
}

function asIsoDateOrNull(val: string | undefined | null): string | null {
  if (!val) return null;
  const trimmed = String(val).trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return trimmed.slice(0, 10);
  const ddmmyy = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{2,4})$/);
  if (ddmmyy) {
    const year = ddmmyy[3].length === 2 ? `20${ddmmyy[3]}` : ddmmyy[3];
    return `${year}-${ddmmyy[2]}-${ddmmyy[1]}`;
  }
  return null;
}

function asNullableFloat(val: string | number | undefined | null): number | null {
  if (val === undefined || val === null || val === '') return null;
  const n = typeof val === 'number' ? val : Number(String(val).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function asNullableStr(val: string | undefined | null): string | null {
  if (val === undefined || val === null) return null;
  const trimmed = String(val).trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function mapUserDtoToAccount(dto: Record<string, unknown>): UserAccount {
  const backendRole = toBackendRole(String(dto.role || 'VIEWER'));
  return {
    id: String(dto.id || ''),
    login: String(dto.login || ''),
    fullName: String(dto.full_name || dto.login || ''),
    role: ROLE_LABELS_RU[backendRole],
    backendRole,
    department: String(dto.department || ''),
    positionTitle: String(dto.position_title || ''),
    isActive: dto.is_active !== false,
    sessionNumber: Number(dto.session_number ?? 1),
    version: Number(dto.version ?? 1),
    isAdmin: backendRole === 'ADMIN',
    mustChangePassword: Boolean(dto.must_change_password),
  };
}

export function mapFacilityDto(dto: Record<string, unknown>): FacilityObject {
  const rdCodesRaw = Array.isArray(dto.rd_codes) ? dto.rd_codes : [];
  const customStationsRaw = Array.isArray(dto.custom_weather_stations)
    ? dto.custom_weather_stations
    : [];
  const customWeatherStations: CustomWeatherStation[] = customStationsRaw.map((s) => {
    const rec = s as Record<string, unknown>;
    return {
      id: String(rec.id || rec.station_code || ''),
      name: String(rec.name || ''),
      region: String(rec.region || ''),
      latitude: Number(rec.latitude ?? 0),
      longitude: Number(rec.longitude ?? 0),
      elevationM: rec.elevation_m != null ? Number(rec.elevation_m) : undefined,
      deviceModel: rec.device_model ? String(rec.device_model) : undefined,
      verificationCertNumber: rec.verification_cert_number
        ? String(rec.verification_cert_number)
        : undefined,
      verificationValidUntil: rec.verification_valid_until
        ? String(rec.verification_valid_until)
        : undefined,
      isVerified: Boolean(rec.is_verified),
      createdAt: String(rec.created_at || ''),
      source: 'custom',
    };
  });
  return {
    id: String(dto.id || ''),
    version: Number(dto.version ?? 1),
    name: String(dto.name || ''),
    shortName: String(dto.short_name || dto.name || ''),
    region: String(dto.region || ''),
    latitude: Number(dto.latitude ?? 66.53),
    longitude: Number(dto.longitude ?? 66.6),
    weatherStation: dto.weather_station ? String(dto.weather_station) : undefined,
    weatherStationId: dto.weather_station_id ? String(dto.weather_station_id) : undefined,
    weatherStationDistanceKm:
      dto.weather_station_distance_km != null ? Number(dto.weather_station_distance_km) : undefined,
    weatherStationSource: dto.weather_station_source
      ? String(dto.weather_station_source)
      : undefined,
    weatherLastCheckStatus:
      dto.weather_last_check_status === 'online' || dto.weather_last_check_status === 'offline'
        ? dto.weather_last_check_status
        : undefined,
    weatherLastCheckedAt: dto.weather_last_checked_at
      ? String(dto.weather_last_checked_at)
      : undefined,
    weatherLastErrorMessage: dto.weather_last_error_message
      ? String(dto.weather_last_error_message)
      : undefined,
    customWeatherStations,
    rdCodes: rdCodesRaw.map((rc) => {
      const r = rc as Record<string, unknown>;
      return {
        code: String(r.code || ''),
        title: String(r.title || ''),
        contours: Array.isArray(r.contours) ? r.contours.map(String) : [],
      };
    }),
  };
}

export function mapLineDto(dto: Record<string, unknown>): ProjectLineItem {
  return {
    id: String(dto.id || ''),
    facilityId: dto.facility_id ? String(dto.facility_id) : undefined,
    objectName: String(dto.object_name || ''),
    rdCode: String(dto.rd_code || ''),
    lineNumber: String(dto.line_number || ''),
    uniqueLineId: String(dto.unique_line_id || ''),
    lineName: String(dto.line_name || ''),
    product: String(dto.product || ''),
    testContour: String(dto.test_contour || ''),
    weldingNtd: String(dto.welding_ntd || ''),
    controlNtd: String(dto.control_ntd || ''),
    qualityLevel: String(dto.quality_level || ''),
    pipelineCategory: String(dto.pipeline_category || ''),
    workingPressure: String(dto.working_pressure || ''),
    workingTemperature: String(dto.working_temperature || ''),
    rkPercent: Number(dto.rk_percent ?? 0),
    uzkPercent: Number(dto.uzk_percent ?? 0),
    pvkPercent: Number(dto.pvk_percent ?? 0),
    manualStatus: dto.manual_status ? String(dto.manual_status) : undefined,
    testDate: dto.test_date ? String(dto.test_date) : '',
    version: Number(dto.version ?? 1),
  };
}

export function mapLineToCreatePayload(
  line: ProjectLineItem,
  facilityId: string
): Record<string, unknown> {
  return {
    legacy_id: line.id || null,
    facility_id: facilityId,
    object_name: line.objectName,
    rd_code: line.rdCode,
    line_number: line.lineNumber,
    unique_line_id: line.uniqueLineId || null,
    line_name: line.lineName || '',
    product: line.product || '',
    test_contour: line.testContour || '',
    welding_ntd: line.weldingNtd || 'СТО Газпром 15-1.1-002-2023',
    control_ntd: line.controlNtd || 'СТО Газпром 15-1.1-002-2023',
    quality_level: line.qualityLevel || '',
    pipeline_category: line.pipelineCategory || '',
    working_pressure: line.workingPressure || '',
    working_temperature: line.workingTemperature || '',
    rk_percent: Number(line.rkPercent || 0),
    uzk_percent: Number(line.uzkPercent || 0),
    pvk_percent: Number(line.pvkPercent || 0),
    manual_status: asNullableStr(line.manualStatus),
    test_date: asIsoDateOrNull(line.testDate),
  };
}

export function mapLineToUpdatePayload(line: ProjectLineItem): Record<string, unknown> {
  return {
    version: line.version ?? 1,
    object_name: line.objectName,
    rd_code: line.rdCode,
    line_number: line.lineNumber,
    unique_line_id: line.uniqueLineId,
    line_name: line.lineName,
    product: line.product,
    test_contour: line.testContour,
    welding_ntd: line.weldingNtd,
    control_ntd: line.controlNtd,
    quality_level: line.qualityLevel,
    pipeline_category: line.pipelineCategory,
    working_pressure: line.workingPressure,
    working_temperature: line.workingTemperature,
    rk_percent: Number(line.rkPercent || 0),
    uzk_percent: Number(line.uzkPercent || 0),
    pvk_percent: Number(line.pvkPercent || 0),
    manual_status: asNullableStr(line.manualStatus),
    test_date: asIsoDateOrNull(line.testDate),
  };
}

export function mapLrvDto(dto: Record<string, unknown>): LRVItem {
  return {
    id: String(dto.id || ''),
    facilityId: dto.facility_id ? String(dto.facility_id) : undefined,
    lrvCode: String(dto.lrv_code || ''),
    rdCode: String(dto.rd_code || ''),
    objectName: String(dto.object_name || ''),
    shortName: String(dto.short_name || ''),
    category: dto.category ? (String(dto.category) as LrvElementCategory) : undefined,
    connectionType: dto.connection_type ? String(dto.connection_type) : undefined,
    material: String(dto.material || ''),
    ntd: String(dto.ntd || ''),
    manufacturer: dto.manufacturer ? String(dto.manufacturer) : undefined,
    dn1: dto.dn1 != null ? Number(dto.dn1) : undefined,
    diameterMm: Number(dto.diameter_mm ?? 0),
    wallThickness: Number(dto.wall_thickness ?? 0),
    dn2: dto.dn2 != null ? Number(dto.dn2) : undefined,
    diameterMm2: dto.diameter_mm2 != null ? Number(dto.diameter_mm2) : undefined,
    wallThickness2: dto.wall_thickness2 != null ? Number(dto.wall_thickness2) : undefined,
    specQty: Number(dto.spec_qty ?? 0),
    unit: (dto.unit === 'м' ? 'м' : 'шт') as 'шт' | 'м',
    status: (dto.status === 'superseded' || dto.status === 'archived' ? dto.status : 'active'),
    replacementLetter: dto.replacement_letter ? String(dto.replacement_letter) : undefined,
    replacementDate: dto.replacement_date ? String(dto.replacement_date) : undefined,
    version: Number(dto.version ?? 1),
  };
}

export function mapLrvToCreatePayload(item: LRVItem, facilityId: string): Record<string, unknown> {
  return {
    legacy_id: item.id || null,
    facility_id: facilityId,
    lrv_code: item.lrvCode,
    rd_code: item.rdCode,
    object_name: item.objectName,
    short_name: item.shortName,
    category: item.category || null,
    connection_type: asNullableStr(item.connectionType),
    material: item.material || '',
    ntd: item.ntd || '',
    manufacturer: asNullableStr(item.manufacturer),
    dn1: item.dn1 ?? null,
    diameter_mm: Number(item.diameterMm || 0),
    wall_thickness: Number(item.wallThickness || 0),
    dn2: item.dn2 ?? null,
    diameter_mm2: item.diameterMm2 ?? null,
    wall_thickness2: item.wallThickness2 ?? null,
    spec_qty: Number(item.specQty || 0),
    unit: item.unit || 'шт',
    status: item.status || 'active',
    replacement_letter: asNullableStr(item.replacementLetter),
    replacement_date: asIsoDateOrNull(item.replacementDate),
  };
}

export function mapLrvToUpdatePayload(item: LRVItem): Record<string, unknown> {
  return {
    version: item.version ?? 1,
    lrv_code: item.lrvCode,
    rd_code: item.rdCode,
    object_name: item.objectName,
    short_name: item.shortName,
    category: item.category || null,
    connection_type: asNullableStr(item.connectionType),
    material: item.material,
    ntd: item.ntd,
    manufacturer: asNullableStr(item.manufacturer),
    dn1: item.dn1 ?? null,
    diameter_mm: Number(item.diameterMm || 0),
    wall_thickness: Number(item.wallThickness || 0),
    dn2: item.dn2 ?? null,
    diameter_mm2: item.diameterMm2 ?? null,
    wall_thickness2: item.wallThickness2 ?? null,
    spec_qty: Number(item.specQty || 0),
    unit: item.unit,
    status: item.status || 'active',
    replacement_letter: asNullableStr(item.replacementLetter),
    replacement_date: asIsoDateOrNull(item.replacementDate),
  };
}

export function mapWelderDto(dto: Record<string, unknown>): WelderProfile {
  const certsRaw = Array.isArray(dto.naks_certs) ? dto.naks_certs : [];
  const naksCerts: WelderNaksCert[] = certsRaw.map((c) => {
    const rec = c as Record<string, unknown>;
    return {
      weldingType: String(rec.welding_type || 'РД') as WeldingType,
      certNumber: String(rec.cert_number || ''),
      issueDate: rec.issue_date ? String(rec.issue_date) : undefined,
      expiryDate: rec.expiry_date ? String(rec.expiry_date) : undefined,
      admissionSheetNumber: rec.admission_sheet_number
        ? String(rec.admission_sheet_number)
        : undefined,
      admissionSheetDate: rec.admission_sheet_date
        ? String(rec.admission_sheet_date)
        : undefined,
      minDiameterMm: rec.min_diameter_mm != null ? Number(rec.min_diameter_mm) : undefined,
      maxDiameterMm: rec.max_diameter_mm != null ? Number(rec.max_diameter_mm) : undefined,
      minWallThicknessMm:
        rec.min_wall_thickness_mm != null ? Number(rec.min_wall_thickness_mm) : undefined,
      maxWallThicknessMm:
        rec.max_wall_thickness_mm != null ? Number(rec.max_wall_thickness_mm) : undefined,
      steelGroups: Array.isArray(rec.steel_groups) ? rec.steel_groups.map(String) : undefined,
    };
  });
  return {
    id: String(dto.id || ''),
    version: Number(dto.version ?? 1),
    stamp: String(dto.stamp || ''),
    isBrigade: Boolean(dto.is_brigade),
    brigadeMembers: Array.isArray(dto.brigade_members)
      ? dto.brigade_members.map(String)
      : undefined,
    fullName: String(dto.full_name || ''),
    certNumber: String(dto.cert_number || ''),
    certIssueDate: dto.cert_issue_date ? String(dto.cert_issue_date) : undefined,
    certExpiryDate: dto.cert_expiry_date ? String(dto.cert_expiry_date) : undefined,
    attestationArea: dto.attestation_area ? String(dto.attestation_area) : undefined,
    admissionSheetNumber: dto.admission_sheet_number
      ? String(dto.admission_sheet_number)
      : undefined,
    admissionSheetDate: dto.admission_sheet_date
      ? String(dto.admission_sheet_date)
      : undefined,
    allowedMethods: Array.isArray(dto.allowed_methods)
      ? (dto.allowed_methods.map(String) as WeldingType[])
      : [],
    naksCerts,
    crewForeman: String(dto.crew_foreman || ''),
    steelGroups: Array.isArray(dto.steel_groups) ? dto.steel_groups.map(String) : undefined,
    minDiameterMm: dto.min_diameter_mm != null ? Number(dto.min_diameter_mm) : undefined,
    maxDiameterMm: dto.max_diameter_mm != null ? Number(dto.max_diameter_mm) : undefined,
    minWallThicknessMm:
      dto.min_wall_thickness_mm != null ? Number(dto.min_wall_thickness_mm) : undefined,
    maxWallThicknessMm:
      dto.max_wall_thickness_mm != null ? Number(dto.max_wall_thickness_mm) : undefined,
  };
}

export function mapWelderToPayload(
  w: WelderProfile,
  includeVersion = false
): Record<string, unknown> {
  return {
    ...(includeVersion ? { version: w.version ?? 1 } : { legacy_id: w.id || null }),
    stamp: w.stamp,
    is_brigade: Boolean(w.isBrigade),
    brigade_members: w.brigadeMembers || null,
    full_name: w.fullName,
    cert_number: w.certNumber || '',
    cert_issue_date: asIsoDateOrNull(w.certIssueDate),
    cert_expiry_date: asIsoDateOrNull(w.certExpiryDate),
    attestation_area: asNullableStr(w.attestationArea),
    admission_sheet_number: asNullableStr(w.admissionSheetNumber),
    admission_sheet_date: asIsoDateOrNull(w.admissionSheetDate),
    allowed_methods: w.allowedMethods || [],
    crew_foreman: w.crewForeman || '',
    steel_groups: w.steelGroups || null,
    min_diameter_mm: w.minDiameterMm ?? null,
    max_diameter_mm: w.maxDiameterMm ?? null,
    min_wall_thickness_mm: w.minWallThicknessMm ?? null,
    max_wall_thickness_mm: w.maxWallThicknessMm ?? null,
    naks_certs: (w.naksCerts || []).map((c) => ({
      welding_type: c.weldingType,
      cert_number: c.certNumber,
      issue_date: asIsoDateOrNull(c.issueDate),
      expiry_date: asIsoDateOrNull(c.expiryDate),
      admission_sheet_number: asNullableStr(c.admissionSheetNumber),
      admission_sheet_date: asIsoDateOrNull(c.admissionSheetDate),
      min_diameter_mm: c.minDiameterMm ?? null,
      max_diameter_mm: c.maxDiameterMm ?? null,
      min_wall_thickness_mm: c.minWallThicknessMm ?? null,
      max_wall_thickness_mm: c.maxWallThicknessMm ?? null,
      steel_groups: c.steelGroups || null,
    })),
  };
}

export function mapTechCardDto(dto: Record<string, unknown>): TechCardItem {
  const rulesRaw = Array.isArray(dto.preheat_rules) ? dto.preheat_rules : [];
  return {
    id: String(dto.id || ''),
    version: Number(dto.version ?? 1),
    number: String(dto.number || ''),
    title: String(dto.title || ''),
    weldingType: String(dto.welding_type || 'РАД+РД') as WeldingType,
    jointKind: (dto.joint_kind === 'Угловое' ? 'Угловое' : 'Стыковое') as JointKind,
    elementCombination: String(dto.element_combination || 'Труба+Труба') as ElementCombination,
    ntd: String(dto.ntd || ''),
    steelGroup: String(dto.steel_group || ''),
    minDiameterMm: Number(dto.min_diameter_mm ?? 0),
    maxDiameterMm: Number(dto.max_diameter_mm ?? 9999),
    minWallThicknessMm: Number(dto.min_wall_thickness_mm ?? 0),
    maxWallThicknessMm: Number(dto.max_wall_thickness_mm ?? 999),
    recommendedMaterials: String(dto.recommended_materials || ''),
    preheatRules: rulesRaw.map((r) => {
      const rec = r as Record<string, unknown>;
      return {
        ambientMinC: Number(rec.ambient_min_c ?? -60),
        ambientMaxC: Number(rec.ambient_max_c ?? 50),
        minPreheatTempC: Number(rec.min_preheat_temp_c ?? 0),
        conditionLabel: String(rec.condition_label || ''),
      };
    }),
  };
}

export function mapTechCardToPayload(
  tc: TechCardItem,
  includeVersion = false
): Record<string, unknown> {
  return {
    ...(includeVersion ? { version: tc.version ?? 1 } : { legacy_id: tc.id || null }),
    number: tc.number,
    title: tc.title,
    welding_type: tc.weldingType,
    joint_kind: tc.jointKind,
    element_combination: tc.elementCombination,
    ntd: tc.ntd,
    steel_group: tc.steelGroup || '',
    min_diameter_mm: Number(tc.minDiameterMm ?? 0),
    max_diameter_mm: Number(tc.maxDiameterMm ?? 9999),
    min_wall_thickness_mm: Number(tc.minWallThicknessMm ?? 0),
    max_wall_thickness_mm: Number(tc.maxWallThicknessMm ?? 999),
    recommended_materials: tc.recommendedMaterials || '',
    preheat_rules: (tc.preheatRules || []).map((r) => ({
      ambient_min_c: Number(r.ambientMinC),
      ambient_max_c: Number(r.ambientMaxC),
      min_preheat_temp_c: Number(r.minPreheatTempC),
      condition_label: r.conditionLabel || 'По умолчанию',
    })),
  };
}

export function mapMaterialDto(dto: Record<string, unknown>): WeldingMaterialCertificate {
  return {
    id: String(dto.id || ''),
    version: Number(dto.version ?? 1),
    brandAndDiameter: String(dto.brand_and_diameter || ''),
    materialType: String(
      dto.material_type || 'Электроды покрытые'
    ) as WeldingMaterialCertificate['materialType'],
    weldingMethod: String(dto.welding_method || 'РД') as WeldingType,
    batchNumber: String(dto.batch_number || ''),
    certificateNumber: String(dto.certificate_number || ''),
    incomingControlAct: String(dto.incoming_control_act || ''),
    incomingControlDate: dto.incoming_control_date ? String(dto.incoming_control_date) : '',
    status:
      dto.status === 'На испытании'
        ? 'На испытании'
        : 'Допущен в производство',
  };
}

export function mapMaterialToPayload(
  mat: WeldingMaterialCertificate,
  includeVersion = false
): Record<string, unknown> {
  return {
    ...(includeVersion ? { version: mat.version ?? 1 } : { legacy_id: mat.id || null }),
    brand_and_diameter: mat.brandAndDiameter,
    material_type: mat.materialType,
    welding_method: mat.weldingMethod,
    batch_number: mat.batchNumber || '',
    certificate_number: mat.certificateNumber || '',
    incoming_control_act: mat.incomingControlAct || '',
    incoming_control_date: asIsoDateOrNull(mat.incomingControlDate),
    status: mat.status,
  };
}

export function mapInspectorDto(dto: Record<string, unknown>): InspectorProfile {
  return {
    fullName: String(dto.full_name || ''),
    certLevel: String(dto.cert_level || ''),
    labName: String(dto.lab_name || ''),
  };
}

export function mapTemplateDto(dto: Record<string, unknown>): ColumnTemplate {
  return {
    id: String(dto.id || ''),
    name: String(dto.name || ''),
    description: String(dto.description || ''),
    isSystem: Boolean(dto.is_system),
    columnOrder: Array.isArray(dto.column_order)
      ? (dto.column_order.map(String) as WeldJointFieldKey[])
      : [],
    visibleColumns: Array.isArray(dto.visible_columns)
      ? (dto.visible_columns.map(String) as WeldJointFieldKey[])
      : [],
    customWidths:
      dto.custom_widths && typeof dto.custom_widths === 'object'
        ? (dto.custom_widths as ColumnTemplate['customWidths'])
        : undefined,
  };
}

export function mapJointDto(dto: Record<string, unknown>): WeldJoint {
  return {
    id: String(dto.id || ''),
    lineId: dto.line_id ? String(dto.line_id) : undefined,
    facilityId: dto.facility_id ? String(dto.facility_id) : undefined,
    objectName: String(dto.object_name || ''),
    rdCode: String(dto.rd_code || ''),
    contour: String(dto.contour || ''),
    lineNumber: String(dto.line_number || ''),
    uniqueLineId: String(dto.unique_line_id || ''),
    jointNumber: String(dto.joint_number || ''),
    isSupplementary: Boolean(dto.is_supplementary),
    jointKind: (dto.joint_kind === 'Угловое' ? 'Угловое' : 'Стыковое') as JointKind,
    jointType: (dto.joint_type === 'Цеховой' ? 'Цеховой' : 'Монтажный') as JointType,
    diameterMm: Number(dto.diameter_mm ?? 0),
    diameterInch: String(dto.diameter_inch || ''),
    equivDiameterInch:
      dto.equiv_diameter_inch != null ? Number(dto.equiv_diameter_inch) : undefined,
    wallThickness: Number(dto.wall_thickness ?? 0),
    lrv1Code: String(dto.lrv1_code || ''),
    elem1Name: String(dto.elem1_name || ''),
    elem1Material: String(dto.elem1_material || ''),
    elem1Ntd: String(dto.elem1_ntd || ''),
    elem1DiameterMm: dto.elem1_diameter_mm != null ? Number(dto.elem1_diameter_mm) : undefined,
    elem1WallThickness:
      dto.elem1_wall_thickness != null ? Number(dto.elem1_wall_thickness) : undefined,
    elem1FactoryNumber: dto.elem1_factory_number ? String(dto.elem1_factory_number) : undefined,
    elem1Manufacturer: dto.elem1_manufacturer ? String(dto.elem1_manufacturer) : undefined,
    elem1Length: dto.elem1_length ? String(dto.elem1_length) : undefined,
    elem1CertNumber: dto.elem1_cert_number ? String(dto.elem1_cert_number) : undefined,
    elem1HeatNumber: dto.elem1_heat_number ? String(dto.elem1_heat_number) : undefined,
    elem1BatchNumber: dto.elem1_batch_number ? String(dto.elem1_batch_number) : undefined,
    lrv2Code: String(dto.lrv2_code || ''),
    elem2Name: String(dto.elem2_name || ''),
    elem2Material: String(dto.elem2_material || ''),
    elem2Ntd: String(dto.elem2_ntd || ''),
    elem2DiameterMm: dto.elem2_diameter_mm != null ? Number(dto.elem2_diameter_mm) : undefined,
    elem2WallThickness:
      dto.elem2_wall_thickness != null ? Number(dto.elem2_wall_thickness) : undefined,
    elem2FactoryNumber: dto.elem2_factory_number ? String(dto.elem2_factory_number) : undefined,
    elem2Manufacturer: dto.elem2_manufacturer ? String(dto.elem2_manufacturer) : undefined,
    elem2Length: dto.elem2_length ? String(dto.elem2_length) : undefined,
    elem2CertNumber: dto.elem2_cert_number ? String(dto.elem2_cert_number) : undefined,
    elem2HeatNumber: dto.elem2_heat_number ? String(dto.elem2_heat_number) : undefined,
    elem2BatchNumber: dto.elem2_batch_number ? String(dto.elem2_batch_number) : undefined,
    weldingType: String(dto.welding_type || ''),
    gostJointType: dto.gost_joint_type ? String(dto.gost_joint_type) : undefined,
    weldingPosition: dto.welding_position ? String(dto.welding_position) : undefined,
    weldingDate: dto.welding_date ? String(dto.welding_date) : '',
    welderStamp: String(dto.welder_stamp || ''),
    welderStampsList: Array.isArray(dto.welder_stamps_list)
      ? dto.welder_stamps_list.map(String)
      : undefined,
    brigadeStamp: dto.brigade_stamp ? String(dto.brigade_stamp) : undefined,
    weldingMaterials: String(dto.welding_materials || ''),
    ambientTemp: dto.ambient_temp_c != null ? String(dto.ambient_temp_c) : '',
    weatherSource: dto.weather_source ? String(dto.weather_source) : undefined,
    preheatTemp: dto.preheat_temp ? String(dto.preheat_temp) : undefined,
    responsiblePerson: String(dto.responsible_person || ''),
    welderFullName: String(dto.welder_full_name || ''),
    welderCertNumber: String(dto.welder_cert_number || ''),
    techCardNumber: String(dto.tech_card_number || ''),
    vikResult: (String(dto.vik_result || 'Не проводился') as ControlResult),
    vikDate: dto.vik_date ? String(dto.vik_date) : '',
    vikInspector: String(dto.vik_inspector || ''),
    vikReportNumber: dto.vik_report_number ? String(dto.vik_report_number) : undefined,
    ndtType: (String(dto.ndt_type || 'Не требуется') as NdtMethod),
    ndtDate: dto.ndt_date ? String(dto.ndt_date) : '',
    ndtResult: (String(dto.ndt_result || 'Не проводился') as ControlResult),
    ndtInspector: String(dto.ndt_inspector || ''),
    ndtReportNumber: dto.ndt_report_number ? String(dto.ndt_report_number) : undefined,
    dupNdtType: (String(dto.dup_ndt_type || 'Не требуется') as NdtMethod),
    dupNdtDate: dto.dup_ndt_date ? String(dto.dup_ndt_date) : '',
    dupNdtResult: (String(dto.dup_ndt_result || 'Не проводился') as ControlResult),
    dupNdtInspector: String(dto.dup_ndt_inspector || ''),
    dupNdtReportNumber: dto.dup_ndt_report_number ? String(dto.dup_ndt_report_number) : undefined,
    rootWeldControl: dto.root_weld_control ? String(dto.root_weld_control) : undefined,
    steeloscopyInfo: dto.steeloscopy_info ? String(dto.steeloscopy_info) : undefined,
    heatTreatOperator: dto.heat_treat_operator ? String(dto.heat_treat_operator) : undefined,
    heatTreatDiagramNumber: dto.heat_treat_diagram_number
      ? String(dto.heat_treat_diagram_number)
      : undefined,
    hardnessTestInfo: dto.hardness_test_info ? String(dto.hardness_test_info) : undefined,
    ferritePhaseInfo: dto.ferrite_phase_info ? String(dto.ferrite_phase_info) : undefined,
    repairAction: dto.repair_action ? String(dto.repair_action) : undefined,
    repairDate: dto.repair_date ? String(dto.repair_date) : undefined,
    repairTechCard: dto.repair_tech_card ? String(dto.repair_tech_card) : undefined,
    repairWelderStamp: dto.repair_welder_stamp ? String(dto.repair_welder_stamp) : undefined,
    repairForeman: dto.repair_foreman ? String(dto.repair_foreman) : undefined,
    repairLengthMm: dto.repair_length_mm != null ? Number(dto.repair_length_mm) : undefined,
    repairDefectType: dto.repair_defect_type ? String(dto.repair_defect_type) : undefined,
    repairCount: dto.repair_count != null ? Number(dto.repair_count) : undefined,
    repairVikNumber: dto.repair_vik_number ? String(dto.repair_vik_number) : undefined,
    repairVikDate: dto.repair_vik_date ? String(dto.repair_vik_date) : undefined,
    repairVikResult: dto.repair_vik_result ? (String(dto.repair_vik_result) as ControlResult) : undefined,
    repairVikInspector: dto.repair_vik_inspector ? String(dto.repair_vik_inspector) : undefined,
    repairNdtType: dto.repair_ndt_type ? (String(dto.repair_ndt_type) as NdtMethod) : undefined,
    repairNdtNumber: dto.repair_ndt_number ? String(dto.repair_ndt_number) : undefined,
    repairNdtDate: dto.repair_ndt_date ? String(dto.repair_ndt_date) : undefined,
    repairNdtResult: dto.repair_ndt_result ? (String(dto.repair_ndt_result) as ControlResult) : undefined,
    repairNdtInspector: dto.repair_ndt_inspector ? String(dto.repair_ndt_inspector) : undefined,
    repairDupNdtType: dto.repair_dup_ndt_type ? (String(dto.repair_dup_ndt_type) as NdtMethod) : undefined,
    repairDupNdtNumber: dto.repair_dup_ndt_number ? String(dto.repair_dup_ndt_number) : undefined,
    repairDupNdtDate: dto.repair_dup_ndt_date ? String(dto.repair_dup_ndt_date) : undefined,
    repairDupNdtResult: dto.repair_dup_ndt_result
      ? (String(dto.repair_dup_ndt_result) as ControlResult)
      : undefined,
    repairDupNdtInspector: dto.repair_dup_ndt_inspector
      ? String(dto.repair_dup_ndt_inspector)
      : undefined,
    version: Number(dto.version ?? 1),
    updatedAt: dto.updated_at ? String(dto.updated_at) : new Date().toISOString(),
    updatedBy: String(dto.updated_by || ''),
  };
}

function buildJointBodyCommon(joint: Partial<WeldJoint>): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  const setIf = (snake: string, val: unknown) => {
    if (val !== undefined) map[snake] = val;
  };
  setIf('facility_id', joint.facilityId);
  setIf('object_name', joint.objectName);
  setIf('rd_code', joint.rdCode);
  setIf('contour', joint.contour);
  setIf('line_number', joint.lineNumber);
  setIf('unique_line_id', joint.uniqueLineId);
  setIf('joint_number', joint.jointNumber);
  setIf('is_supplementary', joint.isSupplementary);
  setIf('joint_kind', joint.jointKind);
  setIf('joint_type', joint.jointType);
  setIf('diameter_mm', joint.diameterMm);
  setIf('diameter_inch', joint.diameterInch);
  setIf('equiv_diameter_inch', joint.equivDiameterInch);
  setIf('wall_thickness', joint.wallThickness);
  setIf('lrv1_code', joint.lrv1Code);
  setIf('elem1_name', joint.elem1Name);
  setIf('elem1_material', joint.elem1Material);
  setIf('elem1_ntd', joint.elem1Ntd);
  setIf('elem1_diameter_mm', joint.elem1DiameterMm);
  setIf('elem1_wall_thickness', joint.elem1WallThickness);
  setIf('elem1_factory_number', joint.elem1FactoryNumber !== undefined ? asNullableStr(joint.elem1FactoryNumber) : undefined);
  setIf('elem1_manufacturer', joint.elem1Manufacturer !== undefined ? asNullableStr(joint.elem1Manufacturer) : undefined);
  setIf('elem1_length', joint.elem1Length !== undefined ? asNullableStr(joint.elem1Length) : undefined);
  setIf('elem1_cert_number', joint.elem1CertNumber !== undefined ? asNullableStr(joint.elem1CertNumber) : undefined);
  setIf('elem1_heat_number', joint.elem1HeatNumber !== undefined ? asNullableStr(joint.elem1HeatNumber) : undefined);
  setIf('elem1_batch_number', joint.elem1BatchNumber !== undefined ? asNullableStr(joint.elem1BatchNumber) : undefined);
  setIf('lrv2_code', joint.lrv2Code);
  setIf('elem2_name', joint.elem2Name);
  setIf('elem2_material', joint.elem2Material);
  setIf('elem2_ntd', joint.elem2Ntd);
  setIf('elem2_diameter_mm', joint.elem2DiameterMm);
  setIf('elem2_wall_thickness', joint.elem2WallThickness);
  setIf('elem2_factory_number', joint.elem2FactoryNumber !== undefined ? asNullableStr(joint.elem2FactoryNumber) : undefined);
  setIf('elem2_manufacturer', joint.elem2Manufacturer !== undefined ? asNullableStr(joint.elem2Manufacturer) : undefined);
  setIf('elem2_length', joint.elem2Length !== undefined ? asNullableStr(joint.elem2Length) : undefined);
  setIf('elem2_cert_number', joint.elem2CertNumber !== undefined ? asNullableStr(joint.elem2CertNumber) : undefined);
  setIf('elem2_heat_number', joint.elem2HeatNumber !== undefined ? asNullableStr(joint.elem2HeatNumber) : undefined);
  setIf('elem2_batch_number', joint.elem2BatchNumber !== undefined ? asNullableStr(joint.elem2BatchNumber) : undefined);
  setIf('welding_type', joint.weldingType);
  setIf('gost_joint_type', joint.gostJointType !== undefined ? asNullableStr(joint.gostJointType) : undefined);
  setIf('welding_position', joint.weldingPosition !== undefined ? asNullableStr(joint.weldingPosition) : undefined);
  if (joint.weldingDate !== undefined) setIf('welding_date', asIsoDateOrNull(joint.weldingDate));
  setIf('welder_stamp', joint.welderStamp);
  setIf('welder_stamps_list', joint.welderStampsList);
  setIf('brigade_stamp', joint.brigadeStamp !== undefined ? asNullableStr(joint.brigadeStamp) : undefined);
  setIf('welding_materials', joint.weldingMaterials);
  if (joint.ambientTemp !== undefined) setIf('ambient_temp_c', asNullableFloat(joint.ambientTemp));
  setIf('weather_source', joint.weatherSource !== undefined ? asNullableStr(joint.weatherSource) : undefined);
  setIf('preheat_temp', joint.preheatTemp !== undefined ? asNullableStr(joint.preheatTemp) : undefined);
  setIf('responsible_person', joint.responsiblePerson);
  setIf('welder_full_name', joint.welderFullName);
  setIf('welder_cert_number', joint.welderCertNumber);
  setIf('tech_card_number', joint.techCardNumber);
  setIf('vik_result', joint.vikResult);
  if (joint.vikDate !== undefined) setIf('vik_date', asIsoDateOrNull(joint.vikDate));
  setIf('vik_inspector', joint.vikInspector);
  setIf('vik_report_number', joint.vikReportNumber !== undefined ? asNullableStr(joint.vikReportNumber) : undefined);
  setIf('ndt_type', joint.ndtType);
  if (joint.ndtDate !== undefined) setIf('ndt_date', asIsoDateOrNull(joint.ndtDate));
  setIf('ndt_result', joint.ndtResult);
  setIf('ndt_inspector', joint.ndtInspector);
  setIf('ndt_report_number', joint.ndtReportNumber !== undefined ? asNullableStr(joint.ndtReportNumber) : undefined);
  setIf('dup_ndt_type', joint.dupNdtType);
  if (joint.dupNdtDate !== undefined) setIf('dup_ndt_date', asIsoDateOrNull(joint.dupNdtDate));
  setIf('dup_ndt_result', joint.dupNdtResult);
  setIf('dup_ndt_inspector', joint.dupNdtInspector);
  setIf('dup_ndt_report_number', joint.dupNdtReportNumber !== undefined ? asNullableStr(joint.dupNdtReportNumber) : undefined);
  setIf('root_weld_control', joint.rootWeldControl !== undefined ? asNullableStr(joint.rootWeldControl) : undefined);
  setIf('steeloscopy_info', joint.steeloscopyInfo !== undefined ? asNullableStr(joint.steeloscopyInfo) : undefined);
  setIf('heat_treat_operator', joint.heatTreatOperator !== undefined ? asNullableStr(joint.heatTreatOperator) : undefined);
  setIf('heat_treat_diagram_number', joint.heatTreatDiagramNumber !== undefined ? asNullableStr(joint.heatTreatDiagramNumber) : undefined);
  setIf('hardness_test_info', joint.hardnessTestInfo !== undefined ? asNullableStr(joint.hardnessTestInfo) : undefined);
  setIf('ferrite_phase_info', joint.ferritePhaseInfo !== undefined ? asNullableStr(joint.ferritePhaseInfo) : undefined);
  setIf('repair_action', joint.repairAction !== undefined ? asNullableStr(joint.repairAction) : undefined);
  if (joint.repairDate !== undefined) setIf('repair_date', asIsoDateOrNull(joint.repairDate));
  setIf('repair_tech_card', joint.repairTechCard !== undefined ? asNullableStr(joint.repairTechCard) : undefined);
  setIf('repair_welder_stamp', joint.repairWelderStamp !== undefined ? asNullableStr(joint.repairWelderStamp) : undefined);
  setIf('repair_foreman', joint.repairForeman !== undefined ? asNullableStr(joint.repairForeman) : undefined);
  setIf('repair_length_mm', joint.repairLengthMm);
  setIf('repair_defect_type', joint.repairDefectType !== undefined ? asNullableStr(joint.repairDefectType) : undefined);
  setIf('repair_count', joint.repairCount);
  setIf('repair_vik_number', joint.repairVikNumber !== undefined ? asNullableStr(joint.repairVikNumber) : undefined);
  if (joint.repairVikDate !== undefined) setIf('repair_vik_date', asIsoDateOrNull(joint.repairVikDate));
  setIf('repair_vik_result', joint.repairVikResult || null);
  setIf('repair_vik_inspector', joint.repairVikInspector !== undefined ? asNullableStr(joint.repairVikInspector) : undefined);
  setIf('repair_ndt_type', joint.repairNdtType || null);
  setIf('repair_ndt_number', joint.repairNdtNumber !== undefined ? asNullableStr(joint.repairNdtNumber) : undefined);
  if (joint.repairNdtDate !== undefined) setIf('repair_ndt_date', asIsoDateOrNull(joint.repairNdtDate));
  setIf('repair_ndt_result', joint.repairNdtResult || null);
  setIf('repair_ndt_inspector', joint.repairNdtInspector !== undefined ? asNullableStr(joint.repairNdtInspector) : undefined);
  setIf('repair_dup_ndt_type', joint.repairDupNdtType || null);
  setIf('repair_dup_ndt_number', joint.repairDupNdtNumber !== undefined ? asNullableStr(joint.repairDupNdtNumber) : undefined);
  if (joint.repairDupNdtDate !== undefined) setIf('repair_dup_ndt_date', asIsoDateOrNull(joint.repairDupNdtDate));
  setIf('repair_dup_ndt_result', joint.repairDupNdtResult || null);
  setIf('repair_dup_ndt_inspector', joint.repairDupNdtInspector !== undefined ? asNullableStr(joint.repairDupNdtInspector) : undefined);
  return map;
}

export function mapJointToCreatePayload(joint: WeldJoint, lineId: string): Record<string, unknown> {
  return {
    legacy_id: joint.id || null,
    line_id: lineId,
    ...buildJointBodyCommon(joint),
    joint_kind: joint.jointKind || 'Стыковое',
    joint_type: joint.jointType || 'Монтажный',
    vik_result: joint.vikResult || 'Не проводился',
    ndt_type: joint.ndtType || 'Не требуется',
    ndt_result: joint.ndtResult || 'Не проводился',
    dup_ndt_type: joint.dupNdtType || 'Не требуется',
    dup_ndt_result: joint.dupNdtResult || 'Не проводился',
    repair_count: joint.repairCount ?? 0,
  };
}

export function mapJointPatchToUpdatePayload(
  patch: Partial<WeldJoint>,
  version: number
): Record<string, unknown> {
  return {
    version,
    ...buildJointBodyCommon(patch),
  };
}

export function computeJointDiffPatch(
  prev: WeldJoint,
  next: WeldJoint
): Partial<WeldJoint> {
  const diff: Record<string, unknown> = {};
  const keys = Object.keys(next) as (keyof WeldJoint)[];
  for (const k of keys) {
    if (k === 'id' || k === 'version' || k === 'updatedAt' || k === 'updatedBy' || k === 'lineId') {
      continue;
    }
    const oldV = prev[k];
    const newV = next[k];
    if (JSON.stringify(oldV ?? null) !== JSON.stringify(newV ?? null)) {
      diff[k] = newV;
    }
  }
  return diff as Partial<WeldJoint>;
}

const SNAKE_TO_CAMEL_FIELD: Record<string, string> = {
  joint_number: 'jointNumber',
  joint_type: 'jointType',
  joint_kind: 'jointKind',
  diameter_mm: 'diameterMm',
  wall_thickness: 'wallThickness',
  welding_type: 'weldingType',
  gost_joint_type: 'gostJointType',
  welding_position: 'weldingPosition',
  welding_date: 'weldingDate',
  welder_stamp: 'welderStamp',
  welding_materials: 'weldingMaterials',
  ambient_temp_c: 'ambientTemp',
  preheat_temp: 'preheatTemp',
  responsible_person: 'responsiblePerson',
  tech_card_number: 'techCardNumber',
  vik_result: 'vikResult',
  vik_date: 'vikDate',
  vik_inspector: 'vikInspector',
  vik_report_number: 'vikReportNumber',
  ndt_type: 'ndtType',
  ndt_date: 'ndtDate',
  ndt_result: 'ndtResult',
  ndt_inspector: 'ndtInspector',
  ndt_report_number: 'ndtReportNumber',
  dup_ndt_type: 'dupNdtType',
  dup_ndt_date: 'dupNdtDate',
  dup_ndt_result: 'dupNdtResult',
  dup_ndt_inspector: 'dupNdtInspector',
  dup_ndt_report_number: 'dupNdtReportNumber',
  repair_action: 'repairAction',
  repair_date: 'repairDate',
  repair_tech_card: 'repairTechCard',
  repair_welder_stamp: 'repairWelderStamp',
  repair_foreman: 'repairForeman',
  repair_length_mm: 'repairLengthMm',
  repair_defect_type: 'repairDefectType',
};

export function mapConflictDtoToUi(
  dto: OptimisticConflictDto,
  clientJoint: WeldJoint,
  baseJoint?: WeldJoint | null
): OptimisticLockConflictPayload {
  const serverRecord = dto.server_record
    ? mapJointDto(dto.server_record)
    : clientJoint;

  const autoMergedRecord: WeldJoint = {
    ...serverRecord,
    version: dto.actual_server_version ?? serverRecord.version,
  };

  const fieldDiffs = (dto.field_diffs || []).map((fd) => {
    const camelKey = SNAKE_TO_CAMEL_FIELD[fd.field] || fd.field;
    const label =
      (FIELD_LABELS_MAP as Record<string, string>)[camelKey] || fd.field;
    const baseVal = baseJoint
      ? String((baseJoint as unknown as Record<string, unknown>)[camelKey] ?? '—')
      : '—';
    const clientVal = String(fd.client_value ?? '—');
    const serverVal = String(fd.server_value ?? '—');
    const isDirectCollision = baseVal !== clientVal && baseVal !== serverVal && clientVal !== serverVal;

    if (!isDirectCollision && camelKey in autoMergedRecord) {
      (autoMergedRecord as unknown as Record<string, unknown>)[camelKey] = (
        clientJoint as unknown as Record<string, unknown>
      )[camelKey];
    }

    return {
      fieldKey: camelKey,
      fieldLabel: label,
      baseValue: baseVal || '—',
      clientValue: clientVal || '—',
      serverValue: serverVal || '—',
      isDirectCollision,
    };
  });

  return {
    entityType: 'joint',
    entityId: String(dto.entity_id || clientJoint.id),
    entityTitle: `Стык № ${clientJoint.jointNumber} (${clientJoint.uniqueLineId})`,
    expectedVersion: Number(dto.expected_version ?? clientJoint.version ?? 1),
    actualServerVersion: Number(dto.actual_server_version ?? serverRecord.version ?? 1),
    serverUpdatedBy: serverRecord.updatedBy || 'Другой пользователь',
    serverUpdatedAt: serverRecord.updatedAt || new Date().toISOString(),
    baseRecord: baseJoint || null,
    clientRecord: clientJoint,
    serverRecord,
    autoMergedRecord,
    fieldDiffs,
  };
}

export function mapAuditLogDto(dto: Record<string, unknown>): AuditLogEntry {
  const action = String(dto.action || 'UPDATE').toUpperCase();
  const entityType = String(dto.entity_type || 'joint');
  let operationType: AuditLogEntry['operationType'] = 'single_edit';
  if (action === 'CREATE' && entityType === 'joint') operationType = 'create_joint';
  else if (action === 'DELETE' && entityType === 'joint') operationType = 'delete_joint';
  else if (action === 'BULK_UPDATE') operationType = 'bulk_edit';
  else if (entityType === 'lrv' && action === 'SUPERSEDE') operationType = 'lrv_superseded';
  else if (entityType === 'line') operationType = 'linelist_change';
  else if (entityType === 'user' && action === 'CREATE') operationType = 'user_created';
  else if (entityType === 'user' && action === 'UPDATE') operationType = 'user_modified';
  else if (entityType === 'user' && action === 'DELETE') operationType = 'user_deleted';
  else if (action === 'EXPORT' || action === 'MIGRATION_QUARANTINE') operationType = 'batch_upload';

  const oldObj = dto.old_data && typeof dto.old_data === 'object' ? (dto.old_data as Record<string, unknown>) : null;
  const newObj = dto.new_data && typeof dto.new_data === 'object' ? (dto.new_data as Record<string, unknown>) : null;
  const changedKeys = newObj ? Object.keys(newObj) : oldObj ? Object.keys(oldObj) : [];

  return {
    id: String(dto.id || ''),
    timestamp: String(dto.timestamp || new Date().toISOString()),
    userLogin: String(dto.user_login || ''),
    userFullName: String(dto.user_full_name || dto.user_login || ''),
    userRole: String(dto.user_role || ''),
    jointId: String(dto.entity_id || ''),
    jointNumber: String(dto.joint_number || '—'),
    uniqueLineId: String(dto.unique_line_id || entityType),
    rdCode: String(dto.rd_code || 'СИСТЕМА'),
    fieldKey: changedKeys[0] || action.toLowerCase(),
    fieldLabel: String(dto.summary || `${action} (${entityType})`),
    oldValue: oldObj ? JSON.stringify(oldObj) : '—',
    newValue: newObj ? JSON.stringify(newObj) : '—',
    operationType,
  };
}
