import { apiRequest } from './client';
import type {
  ExecutiveDocPatch,
  ExecutiveDocRecord,
  ExecutiveDocStatus,
  GeodesyStatus,
  PhysicsStatus,
  PreStageStatus,
} from '../types/executiveDocs';

interface ExecutiveDocDto {
  id: string;
  line_id: string;
  priority: number | null;
  id_status: ExecutiveDocStatus;
  work_producer: string | null;
  pto_engineer: string | null;
  pre_stage_status: PreStageStatus;
  physics_status: PhysicsStatus;
  geodesy_status: GeodesyStatus;
  note_text: string | null;
  note_updated_at: string | null;
  version: number;
  updated_at?: string | null;
}

function mapExecutiveDocFromDto(dto: ExecutiveDocDto): ExecutiveDocRecord {
  return {
    id: dto.id,
    lineId: dto.line_id,
    priority: dto.priority ?? null,
    idStatus: dto.id_status === 'SIGNED' ? 'SIGNED' : 'IN_WORK',
    workProducer: dto.work_producer ?? null,
    ptoEngineer: dto.pto_engineer ?? null,
    preStageStatus: dto.pre_stage_status === 'SIGNED' ? 'SIGNED' : 'NOT_SIGNED',
    physicsStatus: dto.physics_status === 'ACCEPTED' ? 'ACCEPTED' : 'NOT_ACCEPTED',
    geodesyStatus:
      dto.geodesy_status === 'SIGNED' || dto.geodesy_status === 'NOT_REQUIRED'
        ? dto.geodesy_status
        : 'NOT_SIGNED',
    noteText: dto.note_text ?? null,
    noteUpdatedAt: dto.note_updated_at ?? null,
    version: dto.version ?? 1,
    updatedAt: dto.updated_at ?? null,
  };
}

export async function listExecutiveDocsApi(params?: {
  objectName?: string;
}): Promise<ExecutiveDocRecord[]> {
  const qs = new URLSearchParams();
  if (params?.objectName && params.objectName !== 'ALL') {
    qs.set('object_name', params.objectName);
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const data = await apiRequest<ExecutiveDocDto[]>(`/api/executive-docs${suffix}`, {
    method: 'GET',
  });
  return Array.isArray(data) ? data.map(mapExecutiveDocFromDto) : [];
}

export async function upsertExecutiveDocApi(
  lineId: string,
  patch: ExecutiveDocPatch,
  expectedVersion?: number
): Promise<ExecutiveDocRecord> {
  const body: Record<string, unknown> = {};
  if ('priority' in patch) body.priority = patch.priority ?? null;
  if ('idStatus' in patch && patch.idStatus !== undefined) body.id_status = patch.idStatus;
  if ('workProducer' in patch) body.work_producer = patch.workProducer ?? null;
  if ('ptoEngineer' in patch) body.pto_engineer = patch.ptoEngineer ?? null;
  if ('preStageStatus' in patch && patch.preStageStatus !== undefined) {
    body.pre_stage_status = patch.preStageStatus;
  }
  if ('physicsStatus' in patch && patch.physicsStatus !== undefined) {
    body.physics_status = patch.physicsStatus;
  }
  if ('geodesyStatus' in patch && patch.geodesyStatus !== undefined) {
    body.geodesy_status = patch.geodesyStatus;
  }
  if ('noteText' in patch) body.note_text = patch.noteText ?? null;
  if (expectedVersion !== undefined) body.version = expectedVersion;

  const dto = await apiRequest<ExecutiveDocDto>(
    `/api/executive-docs/${encodeURIComponent(lineId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    }
  );
  return mapExecutiveDocFromDto(dto);
}
