import type {
  AuditLogEntry,
  CircuitAssignmentResult,
  CircuitTestStatus,
  ColumnTemplate,
  DepartmentCode,
  FacilityObject,
  InspectorProfile,
  JournalStandard,
  LRVItem,
  NdtLabRequest,
  ProjectLineItem,
  ReadinessGroupCondition,
  RecordStatus,
  SriStatus,
  SystemRole,
  TechCardItem,
  TestCircuit,
  TestCircuitDetail,
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
  mapCircuitAssignmentResultDto,
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
  mapTestCircuitDetailDto,
  mapTestCircuitDto,
  mapTestCircuitToCreatePayload,
  mapTestCircuitToUpdatePayload,
  mapUserDtoToAccount,
  mapWelderDto,
  mapWelderToPayload,
  toBackendRole,
  toDepartmentCode,
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

  async getMe(): Promise<SessionInfoResponse> {
    const res = await apiRequest<{
      user: Record<string, unknown>;
      permissions: Record<string, unknown>;
      expires_at?: string | null;
    }>('/api/auth/me');
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
  // Admin Users & Project Purge (SUPERADMIN & DEPT_ADMIN)
  // ---------------------------------------------------------------------------
  async listAdminUsers(filters?: {
    department?: DepartmentCode;
    role?: SystemRole;
    isActive?: boolean;
  }): Promise<UserAccount[]> {
    const q = new URLSearchParams();
    if (filters?.department) q.set('department', filters.department);
    if (filters?.role) q.set('role', filters.role);
    if (filters?.isActive !== undefined) q.set('is_active', String(filters.isActive));
    const suffix = q.toString() ? `?${q.toString()}` : '';
    const rows = await apiRequest<Record<string, unknown>[]>(`/api/admin/users${suffix}`);
    return rows.map(mapUserDtoToAccount);
  },

  async createAdminUser(payload: {
    login: string;
    password: string;
    fullName: string;
    role: SystemRole | string;
    department?: DepartmentCode | string;
    positionTitle?: string;
    mustChangePassword?: boolean;
  }): Promise<UserAccount> {
    const role = toBackendRole(payload.role);
    const department = toDepartmentCode(payload.department, role);
    const dto = await apiRequest<Record<string, unknown>>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        login: payload.login,
        password: payload.password,
        full_name: payload.fullName,
        role,
        department,
        position_title: payload.positionTitle || '',
        must_change_password: payload.mustChangePassword ?? true,
      }),
    });
    return mapUserDtoToAccount(dto);
  },

  async updateAdminUser(
    userId: string,
    payload: {
      version: number;
      fullName?: string;
      role?: BackendRole | string;
      department?: DepartmentCode | string;
      positionTitle?: string;
      isActive?: boolean;
      mustChangePassword?: boolean;
      newPassword?: string;
    }
  ): Promise<UserAccount> {
    const mappedRole = payload.role ? toBackendRole(payload.role) : undefined;
    const mappedDept = payload.department
      ? toDepartmentCode(payload.department, mappedRole)
      : undefined;
    const dto = await apiRequest<Record<string, unknown>>(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        version: payload.version,
        full_name: payload.fullName,
        role: mappedRole,
        department: mappedDept,
        position_title: payload.positionTitle,
        is_active: payload.isActive,
        must_change_password: payload.mustChangePassword,
        new_password: payload.newPassword,
      }),
    });
    return mapUserDtoToAccount(dto);
  },

  async purgeProject(
    projectId: string,
    confirmProjectName: string,
    password: string
  ): Promise<{
    status: string;
    project_id: string;
    project_name: string;
    deleted_counts: Record<string, number>;
    purged_by: string;
    purged_at: string;
  }> {
    return apiRequest(`/api/admin/projects/${projectId}/purge`, {
      method: 'POST',
      body: JSON.stringify({
        confirm_project_name: confirmProjectName,
        password,
      }),
    });
  },

  async listUsers(): Promise<UserAccount[]> {
    return this.listAdminUsers();
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
    return this.createAdminUser(payload);
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
    return this.updateAdminUser(userId, payload);
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

  async changeLineStatus(
    lineId: string,
    recordStatus: RecordStatus,
    version: number,
    reason?: string
  ): Promise<ProjectLineItem> {
    const dto = await apiRequest<Record<string, unknown>>(`/api/lines/${lineId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({
        record_status: recordStatus,
        version,
        reason: reason || null,
      }),
    });
    return mapLineDto(dto);
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

  async changeJointStatus(
    jointId: string,
    recordStatus: RecordStatus,
    version: number,
    reason?: string
  ): Promise<WeldJoint> {
    const dto = await apiRequest<Record<string, unknown>>(`/api/joints/${jointId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({
        record_status: recordStatus,
        version,
        reason: reason || null,
      }),
    });
    return mapJointDto(dto);
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

  async changeLrvStatus(
    itemId: string,
    recordStatus: RecordStatus,
    version: number,
    reason?: string
  ): Promise<LRVItem> {
    const dto = await apiRequest<Record<string, unknown>>(`/api/lrv/${itemId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({
        record_status: recordStatus,
        version,
        reason: reason || null,
      }),
    });
    return mapLrvDto(dto);
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

  async changeTechCardStatus(
    techCardId: string,
    recordStatus: RecordStatus,
    version: number,
    reason?: string
  ): Promise<TechCardItem> {
    const dto = await apiRequest<Record<string, unknown>>(`/api/wps/${techCardId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({
        record_status: recordStatus,
        version,
        reason: reason || null,
      }),
    });
    return mapTechCardDto(dto);
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

  async changeLabRequestStatus(
    requestId: string,
    recordStatus: RecordStatus,
    version: number,
    reason?: string
  ): Promise<NdtLabRequest> {
    const dto = await apiRequest<Record<string, unknown>>(`/api/lab-requests/${requestId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({
        record_status: recordStatus,
        version,
        reason: reason || null,
      }),
    });
    return mapLabRequestDto(dto);
  },

  // ---------------------------------------------------------------------------
  // Test Circuits (Испытательные контуры: CRUD + привязка линий/стыков + СРИ)
  // ---------------------------------------------------------------------------
  async listTestCircuits(filters?: {
    facilityId?: string;
    objectName?: string;
    testStatus?: CircuitTestStatus;
    sriStatus?: SriStatus;
    search?: string;
  }): Promise<TestCircuit[]> {
    const params = new URLSearchParams();
    if (filters?.facilityId) params.set('facility_id', filters.facilityId);
    if (filters?.objectName && filters.objectName !== 'ALL') {
      params.set('object_name', filters.objectName);
    }
    if (filters?.testStatus) params.set('test_status', filters.testStatus);
    if (filters?.sriStatus) params.set('sri_status', filters.sriStatus);
    if (filters?.search) params.set('search', filters.search);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const rows = await apiRequest<Record<string, unknown>[]>(`/api/test-circuits${qs}`);
    return (Array.isArray(rows) ? rows : []).map(mapTestCircuitDto);
  },

  async getTestCircuit(circuitId: string): Promise<TestCircuitDetail> {
    const dto = await apiRequest<Record<string, unknown>>(`/api/test-circuits/${circuitId}`);
    return mapTestCircuitDetailDto(dto);
  },

  async createTestCircuit(payload: {
    facilityId?: string | null;
    objectName?: string | null;
    name: string;
    sriName?: string | null;
    sriStatus?: SriStatus;
    plannedDate?: string | null;
    actNumber?: string | null;
    actualTestDate?: string | null;
  }): Promise<TestCircuit> {
    const dto = await apiRequest<Record<string, unknown>>('/api/test-circuits', {
      method: 'POST',
      body: JSON.stringify(mapTestCircuitToCreatePayload(payload)),
    });
    return mapTestCircuitDto(dto);
  },

  async updateTestCircuit(
    circuitId: string,
    payload: {
      version: number;
      name?: string;
      sriName?: string | null;
      sriStatus?: SriStatus;
      testStatus?: CircuitTestStatus;
      plannedDate?: string | null;
      actNumber?: string | null;
      actualTestDate?: string | null;
      force?: boolean;
    }
  ): Promise<TestCircuitDetail> {
    const dto = await apiRequest<Record<string, unknown>>(`/api/test-circuits/${circuitId}`, {
      method: 'PATCH',
      body: JSON.stringify(mapTestCircuitToUpdatePayload(payload)),
    });
    return mapTestCircuitDetailDto(dto);
  },

  async changeTestCircuitStatus(
    circuitId: string,
    recordStatus: RecordStatus,
    version: number,
    reason?: string
  ): Promise<TestCircuitDetail> {
    const dto = await apiRequest<Record<string, unknown>>(
      `/api/test-circuits/${circuitId}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          record_status: recordStatus,
          version,
          reason: reason || null,
        }),
      }
    );
    return mapTestCircuitDetailDto(dto);
  },

  async deleteTestCircuit(circuitId: string, version?: number): Promise<void> {
    const qs = version !== undefined ? `?version=${version}` : '';
    await apiRequest(`/api/test-circuits/${circuitId}${qs}`, { method: 'DELETE' });
  },

  async assignLinesToCircuit(
    circuitId: string,
    lineIds: string[],
    overwriteExisting = false
  ): Promise<CircuitAssignmentResult> {
    const dto = await apiRequest<Record<string, unknown>>(
      `/api/test-circuits/${circuitId}/assign-lines`,
      {
        method: 'POST',
        body: JSON.stringify({
          line_ids: lineIds,
          overwrite_existing: overwriteExisting,
        }),
      }
    );
    return mapCircuitAssignmentResultDto(dto);
  },

  async assignJointsToCircuit(
    circuitId: string,
    jointIds: string[],
    overwriteExisting = false
  ): Promise<CircuitAssignmentResult> {
    const dto = await apiRequest<Record<string, unknown>>(
      `/api/test-circuits/${circuitId}/assign-joints`,
      {
        method: 'POST',
        body: JSON.stringify({
          joint_ids: jointIds,
          overwrite_existing: overwriteExisting,
        }),
      }
    );
    return mapCircuitAssignmentResultDto(dto);
  },

  async unassignJointsFromCircuit(
    circuitId: string,
    jointIds: string[]
  ): Promise<CircuitAssignmentResult> {
    const dto = await apiRequest<Record<string, unknown>>(
      `/api/test-circuits/${circuitId}/unassign-joints`,
      {
        method: 'POST',
        body: JSON.stringify({
          joint_ids: jointIds,
        }),
      }
    );
    return mapCircuitAssignmentResultDto(dto);
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
};

