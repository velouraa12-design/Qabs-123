import { currentUser } from './auth.mjs';

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS staging_tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS staging_tenant_members (tenant_id TEXT NOT NULL REFERENCES staging_tenants(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES staging_users(id) ON DELETE CASCADE, role TEXT NOT NULL DEFAULT 'owner', created_at TEXT NOT NULL, PRIMARY KEY (tenant_id, user_id), UNIQUE (user_id))",
  "CREATE TABLE IF NOT EXISTS staging_requests (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES staging_tenants(id) ON DELETE CASCADE, created_by TEXT NOT NULL REFERENCES staging_users(id) ON DELETE RESTRICT, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', payload_json TEXT NOT NULL, attempt_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (tenant_id, attempt_id))",
  "CREATE TABLE IF NOT EXISTS staging_request_messages (id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES staging_requests(id) ON DELETE CASCADE, tenant_id TEXT NOT NULL REFERENCES staging_tenants(id) ON DELETE CASCADE, author_id TEXT NOT NULL REFERENCES staging_users(id) ON DELETE RESTRICT, body TEXT NOT NULL, created_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS staging_audit_events (id TEXT PRIMARY KEY, tenant_id TEXT, actor_id TEXT, action TEXT NOT NULL, resource_type TEXT NOT NULL, resource_id TEXT, metadata_json TEXT NOT NULL, created_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_staging_members_user ON staging_tenant_members(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_staging_requests_tenant_updated ON staging_requests(tenant_id, updated_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_staging_messages_request ON staging_request_messages(request_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_staging_audit_tenant_created ON staging_audit_events(tenant_id, created_at DESC)"
];

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const MEMBER_ROLES = new Set(['owner', 'admin', 'operations', 'finance', 'support', 'customer']);
const STATUS_ROLES = new Set(['admin', 'operations', 'super_admin']);

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}
function id(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return prefix + '_' + btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
function now() { return new Date().toISOString(); }
function text(value, max) { return typeof value === 'string' && value.trim().length > 0 && value.length <= max ? value.trim() : null; }
function validAttempt(value) { return typeof value === 'string' && /^[A-Za-z0-9._:-]{8,120}$/.test(value); }
function sameOrigin(request) { const origin = request.headers.get('origin'); return !origin || origin === new URL(request.url).origin; }
async function body(request) { try { const value = await request.json(); return value && typeof value === 'object' && !Array.isArray(value) ? value : null; } catch { return null; } }
export async function ensureSchema(db) { for (const statement of SCHEMA) await db.prepare(statement).run(); }
export async function audit(db, tenantId, actorId, action, resourceType, resourceId, metadata = {}) {
  await db.prepare("INSERT INTO staging_audit_events (id, tenant_id, actor_id, action, resource_type, resource_id, metadata_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
    .bind(id('aud'), tenantId, actorId, action, resourceType, resourceId || null, JSON.stringify(metadata), now()).run();
}
export async function tenantFor(db, user) {
  let membership = await db.prepare("SELECT m.tenant_id, m.role, t.name FROM staging_tenant_members m JOIN staging_tenants t ON t.id = m.tenant_id WHERE m.user_id = ?1").bind(user.id).first();
  if (!membership) {
    const tenantId = id('ten');
    const createdAt = now();
    try {
      // Both inserts must commit together. A membership conflict rolls back the
      // new tenant rather than requiring a potentially unsafe cleanup DELETE.
      await db.batch([
        db.prepare("INSERT INTO staging_tenants (id, name, created_at) VALUES (?1, ?2, ?3)").bind(tenantId, 'QABS Staging Workspace', createdAt),
        db.prepare("INSERT INTO staging_tenant_members (tenant_id, user_id, role, created_at) VALUES (?1, ?2, ?3, ?4)").bind(tenantId, user.id, 'owner', createdAt)
      ]);
    } catch (error) {
      const message = String(error && error.message || error).toLowerCase();
      if (!message.includes('unique')) throw error;
    }
    membership = await db.prepare("SELECT m.tenant_id, m.role, t.name FROM staging_tenant_members m JOIN staging_tenants t ON t.id = m.tenant_id WHERE m.user_id = ?1").bind(user.id).first();
  }
  return membership;
}
async function scopedRequest(db, tenantId, requestId) {
  return db.prepare("SELECT id, tenant_id, created_by, kind, status, payload_json, attempt_id, created_at, updated_at FROM staging_requests WHERE id = ?1 AND tenant_id = ?2").bind(requestId, tenantId).first();
}
function publicRequest(row) {
  if (!row) return null;
  let payload = {};
  try { payload = JSON.parse(row.payload_json); } catch { payload = {}; }
  return { id: row.id, tenantId: row.tenant_id, createdBy: row.created_by, kind: row.kind, status: row.status, payload, attemptId: row.attempt_id, createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function platformRoute(request, env, url) {
  if (!url.pathname.startsWith('/api/platform')) return null;
  if (!sameOrigin(request)) return json({ error: 'ORIGIN_NOT_ALLOWED' }, 403);
  if (!env.DB) return json({ error: 'DATABASE_UNAVAILABLE' }, 503);
  try {
    const user = await currentUser(env.DB, request);
    if (!user) return json({ error: 'AUTH_REQUIRED' }, 401);
    await ensureSchema(env.DB);
    const membership = await tenantFor(env.DB, user);
    if (!membership) return json({ error: 'TENANT_UNAVAILABLE' }, 503);
    const base = '/api/platform';

    if (request.method === 'GET' && url.pathname === base + '/me') {
      return json({ user, tenant: { id: membership.tenant_id, name: membership.name, role: membership.role } });
    }
    if (request.method === 'GET' && url.pathname === base + '/requests') {
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 100);
      const result = await env.DB.prepare("SELECT id, tenant_id, created_by, kind, status, payload_json, attempt_id, created_at, updated_at FROM staging_requests WHERE tenant_id = ?1 ORDER BY updated_at DESC LIMIT ?2").bind(membership.tenant_id, limit).all();
      return json({ requests: (result.results || []).map(publicRequest) });
    }
    if (request.method === 'POST' && url.pathname === base + '/requests') {
      const input = await body(request);
      const kind = text(input && input.kind, 80);
      const attemptId = input && input.attempt_id;
      const payload = input && input.payload;
      if (!kind || !validAttempt(attemptId) || !payload || typeof payload !== 'object' || Array.isArray(payload)) return json({ error: 'INVALID_REQUEST' }, 400);
      const payloadJson = JSON.stringify(payload);
      if (payloadJson.length > 20000) return json({ error: 'PAYLOAD_TOO_LARGE' }, 413);
      const requestId = id('req');
      const timestamp = now();
      const results = await env.DB.batch([
        env.DB.prepare("INSERT INTO staging_requests (id, tenant_id, created_by, kind, status, payload_json, attempt_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'draft', ?5, ?6, ?7, ?7) ON CONFLICT(tenant_id, attempt_id) DO NOTHING").bind(requestId, membership.tenant_id, user.id, kind, payloadJson, attemptId, timestamp),
        env.DB.prepare("INSERT INTO staging_audit_events (id, tenant_id, actor_id, action, resource_type, resource_id, metadata_json, created_at) SELECT ?1, tenant_id, created_by, 'request.created', 'request', id, ?2, created_at FROM staging_requests WHERE id = ?3 AND tenant_id = ?4").bind(id('aud'), JSON.stringify({kind}), requestId, membership.tenant_id),
        env.DB.prepare("SELECT id, tenant_id, created_by, kind, status, payload_json, attempt_id, created_at, updated_at FROM staging_requests WHERE tenant_id = ?1 AND attempt_id = ?2").bind(membership.tenant_id, attemptId)
      ]);
      const created = results[2].results?.[0];
      if (!created) return json({ error: 'REQUEST_UNAVAILABLE' }, 500);
      if (created.created_by !== user.id || created.kind !== kind || created.payload_json !== payloadJson) return json({ error: 'IDEMPOTENCY_CONFLICT' }, 409);
      const replayed = created.id !== requestId;
      return json({ request: publicRequest(created), replayed }, replayed ? 200 : 201);
    }
    const requestMatch = url.pathname.match(/^\/api\/platform\/requests\/([^/]+)$/);
    if (request.method === 'GET' && requestMatch) {
      const row = await scopedRequest(env.DB, membership.tenant_id, requestMatch[1]);
      return row ? json({ request: publicRequest(row) }) : json({ error: 'NOT_FOUND' }, 404);
    }
    const messageMatch = url.pathname.match(/^\/api\/platform\/requests\/([^/]+)\/messages$/);
    if (request.method === 'POST' && messageMatch) {
      const row = await scopedRequest(env.DB, membership.tenant_id, messageMatch[1]);
      if (!row) return json({ error: 'NOT_FOUND' }, 404);
      const input = await body(request);
      const message = text(input && input.body, 4000);
      if (!message) return json({ error: 'INVALID_MESSAGE' }, 400);
      const messageId = id('msg');
      const createdAt = now();
      await env.DB.prepare("INSERT INTO staging_request_messages (id, request_id, tenant_id, author_id, body, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(messageId, row.id, membership.tenant_id, user.id, message, createdAt).run();
      await audit(env.DB, membership.tenant_id, user.id, 'request.message.created', 'request', row.id, {});
      return json({ message: { id: messageId, requestId: row.id, body: message, authorId: user.id, createdAt } }, 201);
    }
    const statusMatch = url.pathname.match(/^\/api\/platform\/requests\/([^/]+)\/status$/);
    if (request.method === 'POST' && statusMatch) {
      if (!STATUS_ROLES.has(membership.role) && !STATUS_ROLES.has(user.role)) return json({ error: 'FORBIDDEN' }, 403);
      const row = await scopedRequest(env.DB, membership.tenant_id, statusMatch[1]);
      if (!row) return json({ error: 'NOT_FOUND' }, 404);
      const input = await body(request);
      const status = text(input && input.status, 40);
      if (!status || !['draft', 'submitted', 'in_review', 'approved', 'rejected', 'closed'].includes(status)) return json({ error: 'INVALID_STATUS' }, 400);
      const updatedAt = now();
      await env.DB.prepare("UPDATE staging_requests SET status = ?1, updated_at = ?2 WHERE id = ?3 AND tenant_id = ?4").bind(status, updatedAt, row.id, membership.tenant_id).run();
      await audit(env.DB, membership.tenant_id, user.id, 'request.status.updated', 'request', row.id, { status });
      const updated = await scopedRequest(env.DB, membership.tenant_id, row.id);
      return json({ request: publicRequest(updated) });
    }
    return json({ error: 'NOT_FOUND' }, 404);
  } catch (error) {
    return json({ error: 'PLATFORM_TEMPORARILY_UNAVAILABLE' }, 500);
  }
}
