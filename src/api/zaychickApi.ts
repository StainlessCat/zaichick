import type {
  AuditLogEntry,
  ColumnTemplate,
  FacilityObject,
  InspectorProfile,
  JournalStandard,
  LRVItem,
  NdtLabRequest,
  ProjectLineItem,
  ReadinessGroupCondition,
  TechCardItem,
  UserAccount,
  WelderProfile,
  WeldingMaterialCertificate,
  WeldJoint,
} from '../types/welding';
import {
  apiDownloadBlob,
  apiRequest,
  apiUploadSpreadsheet,
} from './client';
import {
  BackendRole,
  mapAuditLogDto,
  mapFacilityDto,
  mapInspectorDto,
  mapJointDto,
  mapJointPatchToUpdatePayload,
  mapJointToCreatePayload,
  mapLabRequestDto,
  mapLabRequestToCreatePayload,
  mapLabRequestToUpdatePayload,
  mapLineDto,
  mapLineToCreatePayload,
  mapLineToUpdatePayload,
  mapLrvDto,
  mapLrvToCreatePayload,
  mapLrvToUpdatePayload,
  mapMaterialDto,
  mapMaterialToPayload,
  mapTechCardDto,
  mapTechCardToPayload,
  mapTemplateDto,
  mapUserDtoToAccount,
  mapWelderDto,
  mapWelderToPayload,
  toBackendRole,
} from './mappers';

interface PaginatedEnvelope<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

async function fetchAllPaginated<T>(
  path: string,
  mapper: (raw: Record<string, unknown>) => T,
  pageSize = 500
): Promise<T[]> {
  const results: T[] = [];
  let offset = 0;
  while (true) {
    const sep = path.includes('?') ? '&' : '?';
    const page = await apiRequest<PaginatedEnvelope<Record<string, unknown>>>(
      `${path}${sep}limit=${pageSize}&offset=${offset}`
    );
    const items = Array.isArray(page.items) ? page.items : [];
    for (const raw of items) {
      results.push(mapper(raw));
    }
    offset += items.length;
    if (items.length === 0 || offset >= page.total) {
      break;
    }
  }
  return results;
}

export interface SessionInfoResponse {
  user: UserAccount;
  permissions: Record<string, unknown>;
  expiresAt?: string | null;
}

export const zaychickApi = {
  // ---------------------------------------------------------------------------
  // Health & Auth (HttpOnly SameSite=Lax JWT cookie)
  // ---------------------------------------------------------------------------
  async health(): Promise<{ status: string; database: string }> {
    return apiRequest('/api/health');
  },

  async login(login: string, password: string): Promise<SessionInfoResponse> {
    const res = await apiRequest<{
      user: Record<string, unknown>;
      permissions: Record<string, unknown>;
      expires_at?: string | null;
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ login, password }),
    });
    return {
      user: mapUserDtoToAccount(res.user),
      permissions: res.permissions,
      expiresAt: res.expires_at,
    };
  },

  async logout(): Promise<void> {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  },

  async getSession(): Promise<SessionInfoResponse> {
    const res = await apiRequest<{
      user: Record<string, unknown>;
      permissions: Record<string, unknown>;
      expires_at?: string | null;
    }>('/api/auth/session');
    return {
      user: mapUserDtoToAccount(res.user),
      permissions: res.permissions,
      expiresAt: res.expires_at,
    };
  },

  async changeOwnPassword(
    currentPassword: string,
    newPassword: string
  ): Promise<SessionInfoResponse> {
    const res = await apiRequest<{
      user: Record<string, unknown>;
      permissions: Record<string, unknown>;
      expires_at?: string | null;
    }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    });
    return {
      user: mapUserDtoToAccount(res.user),
      permissions: res.permissions,
      expiresAt: res.expires_at,
    };
  },

  // ---------------------------------------------------------------------------
  // Users (ADMIN only)
  // ---------------------------------------------------------------------------
  async listUsers(): Promise<UserAccount[]> {
    const rows = await apiRequest<Record<string, unknown>[]>('/api/users');
    return rows.map(mapUserDtoToAccount);
  },

  async createUser(payload: {
    login: string;
    password: string;
    fullName: string;
    role: string;
    department?: string;
    positionTitle?: string;
    mustChangePassword?: boolean;
  }): Promise<UserAccount> {
    const dto = await apiRequest<Record<string, unknown>>('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        login: payload.login,
        password: payload.password,
        full_name: payload.fullName,
        role: toBackendRole(payload.role),
        department: payload.department || '',
        position_title: payload.positionTitle || '',
        must_change_password: payload.mustChangePassword ?? true,
      }),
    });
    return mapUserDtoToAccount(dto);
  },

  async updateUser(
    userId: string,
    payload: {
      version: number;
      fullName?: string;
      role?: BackendRole | string;
      department?: string;
      positionTitle?: string;
      isActive?: boolean;
      mustChangePassword?: boolean;
      newPassword?: string;
    }
  ): Promise<UserAccount> {
    const dto = await apiRequest<Record<string, unknown>>(`/api/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        version: payload.version,
        full_name: payload.fullName,
        role: payload.role ? toBackendRole(payload.role) : undefined,
        department: payload.department,
        position_title: payload.positionTitle,
        is_active: payload.isActive,
        must_change_password: payload.mustChangePassword,
        new_password: payload.newPassword,
      }),
    });
    return mapUserDtoToAccount(dto);
  },

  // ---------------------------------------------------------------------------
  // Facilities
  // ---------------------------------------------------------------------------
  async listFacilities(): Promise<FacilityObject[]> {
    return fetchAllPaginated('/api/facilities', mapFacilityDto, 200);
  },

  async createFacility(payload: {
    name: string;
    shortName?: string;
    region?: string;
    latitude?: number;
    longitude?: number;
    weatherStation?: string;
    weatherStationId?: string;
    weatherStationDistanceKm?: number;
    weatherStationSource?: string;
  }): Promise<FacilityObject> {
    const dto = await apiRequest<Record<string, unknown>>('/api/facilities', {
      method: 'POST',
      body: JSON.stringify({
        name: payload.name,
        short_name: payload.shortName || payload.name,
        region: payload.region || '',
        latitude: payload.latitude ?? null,
        longitude: payload.longitude ?? null,
        weather_station: payload.weatherStation ?? null,
        weather_station_id: payload.weatherStationId ?? null,
        weather_station_distance_km: payload.weatherStationDistanceKm ?? null,
        weather_station_source: payload.weatherStationSource ?? null,
      }),
    });
    return mapFacilityDto(dto);
  },

  async updateFacility(
    facilityId: string,
    payload: {
      version: number;
      region?: string;
      latitude?: number;
      longitude?: number;
      weatherStation?: string;
      weatherStationId?: string;
      weatherStationDistanceKm?: number;
      weatherStationSource?: string;
    }
  ): Promise<FacilityObject> {
    const dto = await apiRequest<Record<string, unknown>>(`/api/facilities/${facilityId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        version: payload.version,
        region: payload.region,
        latitude: payload.latitude,
        longitude: payload.longitude,
        weather_station: payload.weatherStation,
        weather_station_id: payload.weatherStationId,
        weather_station_distance_km: payload.weatherStationDistanceKm,
        weather_station_source: payload.weatherStationSource,
      }),
    });
    return mapFacilityDto(dto);
  },

  async deleteFacility(facilityId: string): Promise<void> {
    await apiRequest(`/api/facilities/${facilityId}`, { method: 'DELETE' });
  },

  // ---------------------------------------------------------------------------
  // Project Lines
  // ---------------------------------------------------------------------------
  async listLines(): Promise<ProjectLineItem[]> {
    return fetchAllPaginated('/api/lines', mapLineDto, 500);
  },

  async createLine(line: ProjectLineItem, facilityId: string): Promise<ProjectLineItem> {
    const dto = await apiRequest<Record<string, unknown>>('/api/lines', {
      method: 'POST',
      body: JSON.stringify(mapLineToCreatePayload(line, facilityId)),
    });
    return mapLineDto(dto);
  },

  async updateLine(line: ProjectLineItem): Promise<ProjectLineItem> {
    const dto = await apiRequest<Record<string, unknown>>(`/api/lines/${line.id}`, {
      method: 'PATCH',
      body: JSON.stringify(mapLineToUpdatePayload(line)),
    });
    return mapLineDto(dto);
  },

  async deleteLine(lineId: string): Promise<void> {
    await apiRequest(`/api/lines/${lineId}`, { method: 'DELETE' });
  },

  // ---------------------------------------------------------------------------
  // Weld Joints (Granular REST + OCC + Server Validation)
  // ---------------------------------------------------------------------------
  async listJoints(): Promise<WeldJoint[]> {
    return fetchAllPaginated('/api/joints', mapJointDto, 500);
  },

  async getJoint(jointId: string): Promise<WeldJoint> {
    const dto = await apiRequest<Record<string, unknown>>(`/api/joints/${jointId}`);
    return mapJointDto(dto);
  },

  async createJoint(joint: WeldJoint, lineId: string): Promise<WeldJoint> {
    const dto = await apiRequest<Record<string, unknown>>('/api/joints', {
      method: 'POST',
      body: JSON.stringify(mapJointToCreatePayload(joint, lineId)),
    });
    return mapJointDto(dto);
  },

  async updateJoint(
    jointId: string,
    patch: Partial<WeldJoint>,
    version: number
  ): Promise<WeldJoint> {
    const dto = await apiRequest<Record<string, unknown>>(`/api/joints/${jointId}`, {
      method: 'PATCH',
      body: JSON.stringify(mapJointPatchToUpdatePayload(patch, version)),
    });
    return mapJointDto(dto);
  },

  async bulkUpdateJoints(
    items: { id: string; patch: Partial<WeldJoint>; version: number }[]
  ): Promise<WeldJoint[]> {
    const dtos = await apiRequest<Record<string, unknown>[]>('/api/joints/bulk-update', {
      method: 'POST',
      body: JSON.stringify({
        items: items.map((it) => ({
          id: it.id,
          ...mapJointPatchToUpdatePayload(it.patch, it.version),
        })),
      }),
    });
    return dtos.map(mapJointDto);
  },

  async deleteJoint(jointId: string): Promise<void> {
    await apiRequest(`/api/joints/${jointId}`, { method: 'DELETE' });
  },

  // ---------------------------------------------------------------------------
  // LRV Catalog
  // ---------------------------------------------------------------------------
  async listLrv(): Promise<LRVItem[]> {
    return fetchAllPaginated('/api/lrv', mapLrvDto, 500);
  },

  async createLrv(item: LRVItem, facilityId: string): Promise<LRVItem> {
    const dto = await apiRequest<Record<string, unknown>>('/api/lrv', {
      method: 'POST',
      body: JSON.stringify(mapLrvToCreatePayload(item, facilityId)),
    });
    return mapLrvDto(dto);
  },

  async updateLrv(item: LRVItem): Promise<LRVItem> {
    const dto = await apiRequest<Record<string, unknown>>(`/api/lrv/${item.id}`, {
      method: 'PATCH',
      body: JSON.stringify(mapLrvToUpdatePayload(item)),
    });
    return mapLrvDto(dto);
  },

  async supersedeLrv(
    itemId: string,
    version: number,
    replacementLetter: string,
    replacementDate?: string
  ): Promise<LRVItem> {
    const dto = await apiRequest<Record<string, unknown>>(`/api/lrv/${itemId}/supersede`, {
      method: 'POST',
      body: JSON.stringify({
        version,
        replacement_letter: replacementLetter,
        replacement_date: replacementDate || null,
      }),
    });
    return mapLrvDto(dto);
  },

  async deleteLrv(itemId: string): Promise<void> {
    await apiRequest(`/api/lrv/${itemId}`, { method: 'DELETE' });
  },

  // ---------------------------------------------------------------------------
  // Welding Tech (NAKS Welders, WPS TechCards, Materials, Inspectors)
  // ---------------------------------------------------------------------------
  async listWelders(): Promise<WelderProfile[]> {
    return fetchAllPaginated('/api/naks/welders', mapWelderDto, 500);
  },

  async createWelder(w: WelderProfile): Promise<WelderProfile> {
    const dto = await apiRequest<Record<string, unknown>>('/api/naks/welders', {
      method: 'POST',
      body: JSON.stringify(mapWelderToPayload(w, false)),
    });
    return mapWelderDto(dto);
  },

  async updateWelder(w: WelderProfile): Promise<WelderProfile> {
    const dto = await apiRequest<Record<string, unknown>>(`/api/naks/welders/${w.id}`, {
      method: 'PATCH',
      body: JSON.stringify(mapWelderToPayload(w, true)),
    });
    return mapWelderDto(dto);
  },

  async deleteWelder(welderId: string): Promise<void> {
    await apiRequest(`/api/naks/welders/${welderId}`, { method: 'DELETE' });
  },

  async listTechCards(): Promise<TechCardItem[]> {
    return fetchAllPaginated('/api/wps', mapTechCardDto, 500);
  },

  async createTechCard(tc: TechCardItem): Promise<TechCardItem> {
    const dto = await apiRequest<Record<string, unknown>>('/api/wps', {
      method: 'POST',
      body: JSON.stringify(mapTechCardToPayload(tc, false)),
    });
    return mapTechCardDto(dto);
  },

  async updateTechCard(tc: TechCardItem): Promise<TechCardItem> {
    const dto = await apiRequest<Record<string, unknown>>(`/api/wps/${tc.id}`, {
      method: 'PATCH',
      body: JSON.stringify(mapTechCardToPayload(tc, true)),
    });
    return mapTechCardDto(dto);
  },

  async deleteTechCard(techCardId: string): Promise<void> {
    await apiRequest(`/api/wps/${techCardId}`, { method: 'DELETE' });
  },

  async listMaterials(): Promise<WeldingMaterialCertificate[]> {
    return fetchAllPaginated('/api/naks/materials', mapMaterialDto, 500);
  },

  async createMaterial(m: WeldingMaterialCertificate): Promise<WeldingMaterialCertificate> {
    const dto = await apiRequest<Record<string, unknown>>('/api/naks/materials', {
      method: 'POST',
      body: JSON.stringify(mapMaterialToPayload(m, false)),
    });
    return mapMaterialDto(dto);
  },

  async updateMaterial(m: WeldingMaterialCertificate): Promise<WeldingMaterialCertificate> {
    const dto = await apiRequest<Record<string, unknown>>(`/api/naks/materials/${m.id}`, {
      method: 'PATCH',
      body: JSON.stringify(mapMaterialToPayload(m, true)),
    });
    return mapMaterialDto(dto);
  },

  async deleteMaterial(materialId: string): Promise<void> {
    await apiRequest(`/api/naks/materials/${materialId}`, { method: 'DELETE' });
  },

  async listInspectors(): Promise<InspectorProfile[]> {
    const rows = await apiRequest<Record<string, unknown>[]>('/api/naks/inspectors');
    return rows.map(mapInspectorDto);
  },

  // ---------------------------------------------------------------------------
  // Column Templates & Audit Logs
  // ---------------------------------------------------------------------------
  async listTemplates(): Promise<ColumnTemplate[]> {
    const rows = await apiRequest<Record<string, unknown>[]>('/api/templates');
    return rows.map(mapTemplateDto);
  },

  async createTemplate(tpl: ColumnTemplate): Promise<ColumnTemplate> {
    const dto = await apiRequest<Record<string, unknown>>('/api/templates', {
      method: 'POST',
      body: JSON.stringify({
        id: tpl.id,
        name: tpl.name,
        description: tpl.description,
        is_system: Boolean(tpl.isSystem),
        column_order: tpl.columnOrder,
        visible_columns: tpl.visibleColumns,
        custom_widths: tpl.customWidths || null,
      }),
    });
    return mapTemplateDto(dto);
  },

  async deleteTemplate(templateId: string): Promise<void> {
    await apiRequest(`/api/templates/${templateId}`, { method: 'DELETE' });
  },

  async listAuditLogs(page = 1, pageSize = 150): Promise<AuditLogEntry[]> {
    const res = await apiRequest<{
      items: Record<string, unknown>[];
      total: number;
    }>(`/api/audit-logs?page=${page}&page_size=${pageSize}`);
    return (res.items || []).map(mapAuditLogDto);
  },

  // ---------------------------------------------------------------------------
  // NDT Laboratory Requests (REST + OCC + SSE)
  // ---------------------------------------------------------------------------
  async listLabRequests(filters?: {
    status?: string;
    objectName?: string;
    rdCode?: string;
    uniqueLineId?: string;
  }): Promise<NdtLabRequest[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.objectName) params.set('object_name', filters.objectName);
    if (filters?.rdCode) params.set('rd_code', filters.rdCode);
    if (filters?.uniqueLineId) params.set('unique_line_id', filters.uniqueLineId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return fetchAllPaginated(`/api/lab-requests${qs}`, mapLabRequestDto, 500);
  },

  async getLabRequest(requestId: string): Promise<NdtLabRequest> {
    const dto = await apiRequest<Record<string, unknown>>(`/api/lab-requests/${requestId}`);
    return mapLabRequestDto(dto);
  },

  async createLabRequest(req: NdtLabRequest): Promise<NdtLabRequest> {
    const dto = await apiRequest<Record<string, unknown>>('/api/lab-requests', {
      method: 'POST',
      body: JSON.stringify(mapLabRequestToCreatePayload(req)),
    });
    return mapLabRequestDto(dto);
  },

  async updateLabRequest(
    requestId: string,
    patch: Partial<NdtLabRequest>,
    expectedVersion?: number
  ): Promise<NdtLabRequest> {
    const qs = expectedVersion !== undefined ? `?version=${expectedVersion}` : '';
    const dto = await apiRequest<Record<string, unknown>>(`/api/lab-requests/${requestId}${qs}`, {
      method: 'PATCH',
      body: JSON.stringify(mapLabRequestToUpdatePayload(patch)),
    });
    return mapLabRequestDto(dto);
  },

  async deleteLabRequest(requestId: string): Promise<void> {
    await apiRequest(`/api/lab-requests/${requestId}`, { method: 'DELETE' });
  },

  // ---------------------------------------------------------------------------
  // Server-Side Excel Exports & Imports (openpyxl)
  // ---------------------------------------------------------------------------
  async downloadJournalXlsx(params: {
    standard: JournalStandard;
    rdCode?: string;
    uniqueLineId?: string;
    facilityId?: string;
    strict?: boolean;
  }) {
    const q = new URLSearchParams({ standard: params.standard });
    if (params.rdCode && params.rdCode !== 'ALL') q.set('rd_code', params.rdCode);
    if (params.uniqueLineId && params.uniqueLineId !== 'ALL') {
      q.set('unique_line_id', params.uniqueLineId);
    }
    if (params.facilityId) q.set('facility_id', params.facilityId);
    if (params.strict) q.set('strict', 'true');
    return apiDownloadBlob(
      `/api/exports/journal.xlsx?${q.toString()}`,
      `welding_journal_${params.standard === 'ГОСТ 32569-2013' ? 'GOST_32569' : 'STO_GAZPROM'}.xlsx`
    );
  },

  async downloadReadinessXlsx(params: {
    condition: ReadinessGroupCondition;
    rdCode?: string;
    facilityId?: string;
  }) {
    const backendCond = params.condition === 'contour' ? 'uniqueLineId' : params.condition;
    const q = new URLSearchParams({ condition: backendCond });
    if (params.rdCode && params.rdCode !== 'ALL') q.set('rd_code', params.rdCode);
    if (params.facilityId) q.set('facility_id', params.facilityId);
    return apiDownloadBlob(
      `/api/exports/readiness.xlsx?${q.toString()}`,
      'readiness_and_ndt_quotas.xlsx'
    );
  },

  async downloadJointsXlsx(params?: {
    uniqueLineId?: string;
    rdCode?: string;
    facilityId?: string;
  }) {
    const q = new URLSearchParams();
    if (params?.uniqueLineId && params.uniqueLineId !== 'ALL') {
      q.set('unique_line_id', params.uniqueLineId);
    }
    if (params?.rdCode && params.rdCode !== 'ALL') q.set('rd_code', params.rdCode);
    if (params?.facilityId) q.set('facility_id', params.facilityId);
    const suffix = q.toString() ? `?${q.toString()}` : '';
    return apiDownloadBlob(`/api/exports/joints.xlsx${suffix}`, 'weld_joints_registry.xlsx');
  },

  async downloadJointsTemplateXlsx(rdCode?: string, lineNumber?: string) {
    const q = new URLSearchParams();
    if (rdCode) q.set('rd_code', rdCode);
    if (lineNumber) q.set('line_number', lineNumber);
    const suffix = q.toString() ? `?${q.toString()}` : '';
    return apiDownloadBlob(
      `/api/exports/joints-template.xlsx${suffix}`,
      'ZAYCHICK_Shablon_Import_Stykov.xlsx'
    );
  },

  async downloadLineListXlsx(isTemplate = false, rdCode?: string) {
    const q = new URLSearchParams();
    if (isTemplate) q.set('template', 'true');
    if (rdCode && rdCode !== 'ALL') q.set('rd_code', rdCode);
    const suffix = q.toString() ? `?${q.toString()}` : '';
    return apiDownloadBlob(
      `/api/exports/linelist.xlsx${suffix}`,
      isTemplate ? 'ZAYCHICK_Shablon_LineList.xlsx' : 'ZAYCHICK_Project_LineList.xlsx'
    );
  },

  async downloadLrvXlsx(isTemplate = false, rdCode?: string) {
    const q = new URLSearchParams();
    if (isTemplate) q.set('template', 'true');
    if (rdCode && rdCode !== 'ALL') q.set('rd_code', rdCode);
    const suffix = q.toString() ? `?${q.toString()}` : '';
    return apiDownloadBlob(
      `/api/exports/lrv.xlsx${suffix}`,
      isTemplate ? 'ZAYCHICK_Shablon_LRV.xlsx' : 'ZAYCHICK_Katalog_LRV.xlsx'
    );
  },

  async parseSpreadsheet(file: File): Promise<Record<string, unknown>[]> {
    return apiUploadSpreadsheet(file);
  },

  async restoreFullBackup(
    payload: Record<string, unknown>
  ): Promise<{ status: string; report?: Record<string, unknown> }> {
    return apiRequest('/api/imports/restore-backup', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async zeroResetDatabase(
    keepOnlyAdmin = true
  ): Promise<{ status: string; deactivated_users?: number }> {
    return apiRequest('/api/imports/zero-reset', {
      method: 'POST',
      body: JSON.stringify({ keep_only_admin: keepOnlyAdmin }),
    });
  },
};

