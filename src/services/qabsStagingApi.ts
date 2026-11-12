export interface StagingUser {
  id: string;
  email: string;
  role: string;
}

export interface StagingTenant {
  id: string;
  name: string;
  role: string;
}

export interface StagingRequest {
  id: string;
  tenantId: string;
  createdBy: string;
  kind: string;
  status: string;
  payload: Record<string, unknown>;
  attemptId: string;
  createdAt: string;
  updatedAt: string;
}

export class StagingApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = 'StagingApiError';
    this.status = status;
    this.code = code;
  }
}

const apiBase = (import.meta.env.VITE_QABS_API_BASE_URL || '').trim().replace(/\/$/, '');
export const stagingApiEnabled = Boolean(apiBase);

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${apiBase}${path}`, { ...init, headers, credentials: 'include' });
  let payload: T & { error?: string };
  try {
    payload = (await response.json()) as T & { error?: string };
  } catch {
    throw new StagingApiError(response.status, 'INVALID_API_RESPONSE');
  }
  if (!response.ok) throw new StagingApiError(response.status, payload.error || 'STAGING_API_ERROR');
  return payload;
}

export const stagingAuthApi = {
  login(email: string, password: string) {
    return request<{ ok: true; user: StagingUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  },
  register(email: string, password: string) {
    return request<{ ok: true; user: StagingUser }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  },
  logout() {
    return request<{ ok: true }>('/api/auth/logout', { method: 'POST' });
  },
  me() {
    return request<{ user: StagingUser | null }>('/api/auth/me');
  }
};

export const stagingPlatformApi = {
  me() {
    return request<{ user: StagingUser; tenant: StagingTenant }>('/api/platform/me');
  },
  listRequests() {
    return request<{ requests: StagingRequest[] }>('/api/platform/requests');
  },
  createRequest(kind: string, attemptId: string, payload: Record<string, unknown>) {
    return request<{ request: StagingRequest; replayed: boolean }>('/api/platform/requests', {
      method: 'POST',
      body: JSON.stringify({ kind, attempt_id: attemptId, payload })
    });
  },
  getRequest(id: string) {
    return request<{ request: StagingRequest }>(`/api/platform/requests/${encodeURIComponent(id)}`);
  },
  addMessage(id: string, message: string) {
    return request<{ message: { id: string; requestId: string; body: string; authorId: string; createdAt: string } }>(
      `/api/platform/requests/${encodeURIComponent(id)}/messages`,
      { method: 'POST', body: JSON.stringify({ body: message }) }
    );
  }
};
