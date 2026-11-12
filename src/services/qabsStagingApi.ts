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

export interface StagingDocument {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface StagingStore {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
}

export interface StagingProduct {
  id: string;
  tenantId: string;
  storeId: string;
  name: string;
  sku: string;
  priceCents: number;
  stock: number;
  createdAt: string;
  updatedAt: string;
}

export interface StagingOrder {
  id: string;
  tenantId: string;
  storeId: string;
  customerEmail: string | null;
  status: string;
  totalCents: number;
  currency: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface StagingBillingSummary {
  subscription: { id: string; plan: string; interval: string; status: string; paymentEnabled: boolean; createdAt: string; updatedAt: string } | null;
  credits: { balanceUnits: number; updatedAt: string | null };
  invoices: Array<Record<string, unknown>>;
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
  if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) headers.set('content-type', 'application/json');
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


export const stagingCommerceApi = {
  listDocuments() {
    return request<{ documents: StagingDocument[] }>('/api/platform/documents');
  },
  uploadDocument(file: File) {
    const form = new FormData();
    form.append('file', file, file.name);
    return request<{ document: StagingDocument }>('/api/platform/documents', { method: 'POST', body: form });
  },
  documentUrl(id: string) {
    return `${apiBase}/api/platform/documents/${encodeURIComponent(id)}`;
  },
  listStores() {
    return request<{ stores: StagingStore[] }>('/api/platform/stores');
  },
  createStore(name: string, slug: string) {
    return request<{ store: StagingStore }>('/api/platform/stores', { method: 'POST', body: JSON.stringify({ name, slug }) });
  },
  listProducts(storeId: string) {
    return request<{ products: StagingProduct[] }>(`/api/platform/stores/${encodeURIComponent(storeId)}/products`);
  },
  createProduct(storeId: string, input: { name: string; sku: string; priceCents: number; stock: number }) {
    return request<{ product: StagingProduct }>(`/api/platform/stores/${encodeURIComponent(storeId)}/products`, {
      method: 'POST',
      body: JSON.stringify({ name: input.name, sku: input.sku, price_cents: input.priceCents, stock: input.stock })
    });
  },
  listOrders(storeId: string) {
    return request<{ orders: StagingOrder[] }>(`/api/platform/stores/${encodeURIComponent(storeId)}/orders`);
  },
  createOrder(storeId: string, input: { totalCents: number; currency: string; customerEmail?: string; payload?: Record<string, unknown> }) {
    return request<{ order: StagingOrder; paymentEnabled: false }>(`/api/platform/stores/${encodeURIComponent(storeId)}/orders`, {
      method: 'POST',
      body: JSON.stringify({ total_cents: input.totalCents, currency: input.currency, customer_email: input.customerEmail, payload: input.payload || {} })
    });
  },
  billingSummary() {
    return request<StagingBillingSummary>('/api/platform/billing/summary');
  },
  consumeCredits(units: number, reason: string) {
    return request<{ consumedUnits: number; balanceUnits: number }>('/api/platform/billing/credits/consume', {
      method: 'POST',
      body: JSON.stringify({ units, reason })
    });
  },
  recordAiUsage(units: number, model = 'qabs-ai-staging') {
    return request<{ usage: { id: string; model: string; units: number; createdAt: string }; balanceUnits: number }>('/api/platform/ai/usage', {
      method: 'POST',
      body: JSON.stringify({ units, model })
    });
  },
  adminSummary() {
    return request<{ role: string; counts: Record<string, number>; billing: StagingBillingSummary }>('/api/platform/admin/summary');
  },
  listStaff() {
    return request<{ staff: Array<{ userId: string; email: string; role: string; createdAt: string }> }>('/api/platform/staff');
  },
  assignStaff(email: string, role: string) {
    return request<{ staff: { userId: string; email: string; role: string; createdAt: string } }>('/api/platform/staff', {
      method: 'POST',
      body: JSON.stringify({ email, role })
    });
  }
};
