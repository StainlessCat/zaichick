export interface ValidationIssueDto {
  id: string;
  category: string;
  severity: string;
  field?: string | null;
  title: string;
  message: string;
}

export interface OptimisticConflictDto {
  code?: string;
  message?: string;
  entity_type?: string;
  entity_id?: string;
  expected_version?: number;
  actual_server_version?: number;
  server_record?: Record<string, unknown>;
  field_diffs?: {
    field: string;
    client_value: unknown;
    server_value: unknown;
  }[];
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly detail: unknown;
  public readonly validationErrors: ValidationIssueDto[];
  public readonly conflict?: OptimisticConflictDto;

  constructor(
    message: string,
    status: number,
    options?: {
      code?: string;
      detail?: unknown;
      validationErrors?: ValidationIssueDto[];
      conflict?: OptimisticConflictDto;
    }
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = options?.code;
    this.detail = options?.detail;
    this.validationErrors = options?.validationErrors || [];
    this.conflict = options?.conflict;
  }
}

function parseErrorPayload(raw: unknown, status: number): {
  message: string;
  code?: string;
  detail: unknown;
  validationErrors?: ValidationIssueDto[];
  conflict?: OptimisticConflictDto;
} {
  if (!raw || typeof raw !== 'object') {
    return {
      message: `Ошибка сервера HTTP ${status}`,
      detail: raw,
    };
  }
  const obj = raw as Record<string, unknown>;
  const detail = obj.detail !== undefined ? obj.detail : obj;

  if (typeof detail === 'string') {
    return {
      message: detail,
      code: typeof obj.code === 'string' ? obj.code : undefined,
      detail,
    };
  }

  if (Array.isArray(detail)) {
    const msgs = detail
      .map((item) => {
        if (item && typeof item === 'object') {
          const rec = item as Record<string, unknown>;
          const loc = Array.isArray(rec.loc) ? rec.loc.join('.') : '';
          return loc ? `${loc}: ${String(rec.msg || '')}` : String(rec.msg || JSON.stringify(rec));
        }
        return String(item);
      })
      .join('; ');
    return {
      message: msgs || `Ошибка валидации запроса (HTTP ${status})`,
      code: 'VALIDATION_ERROR',
      detail,
    };
  }

  if (detail && typeof detail === 'object') {
    const detObj = detail as Record<string, unknown>;
    const code = typeof detObj.code === 'string' ? detObj.code : undefined;
    const msg =
      (typeof detObj.message === 'string' && detObj.message) ||
      (typeof obj.message === 'string' && obj.message) ||
      `Ошибка сервера HTTP ${status}`;
    const errors = Array.isArray(detObj.errors)
      ? (detObj.errors as ValidationIssueDto[])
      : undefined;
    const conflict =
      code === 'OPTIMISTIC_LOCK_CONFLICT'
        ? (detObj as unknown as OptimisticConflictDto)
        : undefined;
    return {
      message: msg,
      code,
      detail,
      validationErrors: errors,
      conflict,
    };
  }

  return {
    message: `Ошибка сервера HTTP ${status}`,
    detail: raw,
  };
}

export async function apiRequest<T>(
  url: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (
    init.body !== undefined &&
    !(init.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const parsedBody = isJson
    ? await res.json().catch(() => null)
    : await res.text().catch(() => '');

  if (!res.ok) {
    const errInfo = parseErrorPayload(parsedBody, res.status);
    throw new ApiError(errInfo.message, res.status, {
      code: errInfo.code,
      detail: errInfo.detail,
      validationErrors: errInfo.validationErrors,
      conflict: errInfo.conflict,
    });
  }

  return parsedBody as T;
}

export function extractFilenameFromDisposition(
  headerValue: string | null,
  fallback: string
): string {
  if (!headerValue) return fallback;
  const utfMatch = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch && utfMatch[1]) {
    try {
      return decodeURIComponent(utfMatch[1].trim());
    } catch {
      // fall through
    }
  }
  const plainMatch = headerValue.match(/filename="?([^";]+)"?/i);
  if (plainMatch && plainMatch[1]) {
    return plainMatch[1].trim();
  }
  return fallback;
}

export async function apiDownloadBlob(
  url: string,
  fallbackFilename: string
): Promise<{ blob: Blob; filename: string; headers: Headers }> {
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include',
  });

  if (!res.ok) {
    const contentType = res.headers.get('content-type') || '';
    const parsedBody = contentType.includes('application/json')
      ? await res.json().catch(() => null)
      : await res.text().catch(() => '');
    const errInfo = parseErrorPayload(parsedBody, res.status);
    throw new ApiError(errInfo.message, res.status, {
      code: errInfo.code,
      detail: errInfo.detail,
      validationErrors: errInfo.validationErrors,
    });
  }

  const blob = await res.blob();
  const filename = extractFilenameFromDisposition(
    res.headers.get('content-disposition'),
    fallbackFilename
  );
  return { blob, filename, headers: res.headers };
}

export async function apiUploadSpreadsheet(file: File): Promise<Record<string, unknown>[]> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiRequest<{
    filename: string;
    rows: Record<string, unknown>[];
    count: number;
  }>('/api/imports/parse-spreadsheet', {
    method: 'POST',
    body: form,
  });
  return Array.isArray(res?.rows) ? res.rows : [];
}
