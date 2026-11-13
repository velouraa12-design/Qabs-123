import { currentUser } from './auth.mjs';
import { audit, ensureSchema, tenantFor } from './platform.mjs';
import { CREDIT_SCHEMA, consumeCredits } from './credits.mjs';

const SCHEMA = [
  CREDIT_SCHEMA,
  "CREATE TABLE IF NOT EXISTS staging_documents (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES staging_tenants(id) ON DELETE CASCADE, owner_id TEXT NOT NULL REFERENCES staging_users(id) ON DELETE RESTRICT, object_key TEXT NOT NULL UNIQUE, filename TEXT NOT NULL, content_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, created_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_staging_documents_tenant_created ON staging_documents(tenant_id, created_at DESC)",
  "CREATE TABLE IF NOT EXISTS staging_stores (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES staging_tenants(id) ON DELETE CASCADE, name TEXT NOT NULL, slug TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL, UNIQUE (tenant_id, slug))",
  "CREATE INDEX IF NOT EXISTS idx_staging_stores_tenant ON staging_stores(tenant_id)",
  "CREATE TABLE IF NOT EXISTS staging_products (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES staging_tenants(id) ON DELETE CASCADE, store_id TEXT NOT NULL REFERENCES staging_stores(id) ON DELETE CASCADE, name TEXT NOT NULL, sku TEXT NOT NULL, price_cents INTEGER NOT NULL, stock INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (store_id, sku))",
  "CREATE INDEX IF NOT EXISTS idx_staging_products_store ON staging_products(store_id, updated_at DESC)",
  "CREATE TABLE IF NOT EXISTS staging_orders (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES staging_tenants(id) ON DELETE CASCADE, store_id TEXT NOT NULL REFERENCES staging_stores(id) ON DELETE CASCADE, customer_email TEXT, status TEXT NOT NULL DEFAULT 'pending', total_cents INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'USD', payload_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_staging_orders_store ON staging_orders(store_id, created_at DESC)",
  "CREATE TABLE IF NOT EXISTS staging_subscriptions (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES staging_tenants(id) ON DELETE CASCADE, plan TEXT NOT NULL, interval TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'trialing', payment_enabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (tenant_id))",
  "CREATE TABLE IF NOT EXISTS staging_invoices (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES staging_tenants(id) ON DELETE CASCADE, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'USD', status TEXT NOT NULL DEFAULT 'draft', due_at TEXT, created_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_staging_invoices_tenant ON staging_invoices(tenant_id, created_at DESC)",
  "CREATE TABLE IF NOT EXISTS staging_credits (tenant_id TEXT PRIMARY KEY REFERENCES staging_tenants(id) ON DELETE CASCADE, balance_units INTEGER NOT NULL DEFAULT 1000, updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS staging_ai_usage (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES staging_tenants(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES staging_users(id) ON DELETE RESTRICT, model TEXT NOT NULL, units INTEGER NOT NULL, created_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_staging_ai_usage_tenant ON staging_ai_usage(tenant_id, created_at DESC)"
];

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const ADMIN_ROLES = new Set(['admin', 'operations', 'super_admin']);
const STAFF_ROLES = new Set(['admin', 'operations', 'finance', 'support', 'customer']);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function json(payload, status = 200) { return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS }); }
function id(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return prefix + '_' + btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
function now() { return new Date().toISOString(); }
function text(value, max) { return typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : null; }
function sameOrigin(request) { const origin = request.headers.get('origin'); return !origin || origin === new URL(request.url).origin; }
async function body(request) { try { const value = await request.json(); return value && typeof value === 'object' && !Array.isArray(value) ? value : null; } catch { return null; } }
async function ensureCommerceSchema(db) { for (const statement of SCHEMA) await db.prepare(statement).run(); }
function roleFor(user, membership) { return ADMIN_ROLES.has(user.role) ? user.role : (membership?.role || user.role); }
function isAdmin(user, membership) { return ADMIN_ROLES.has(roleFor(user, membership)); }
function safeFileName(name) { return String(name || 'upload.bin').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120) || 'upload.bin'; }
function decodePart(value) { try { return decodeURIComponent(value); } catch { return value; } }

async function storeFor(db, tenantId, storeId) {
  return db.prepare('SELECT id, tenant_id, name, slug, status, created_at FROM staging_stores WHERE id = ?1 AND tenant_id = ?2').bind(storeId, tenantId).first();
}
function publicStore(row) { return row && { id: row.id, tenantId: row.tenant_id, name: row.name, slug: row.slug, status: row.status, createdAt: row.created_at }; }
function publicProduct(row) { return row && { id: row.id, tenantId: row.tenant_id, storeId: row.store_id, name: row.name, sku: row.sku, priceCents: row.price_cents, stock: row.stock, createdAt: row.created_at, updatedAt: row.updated_at }; }
function publicOrder(row) { return row && { id: row.id, tenantId: row.tenant_id, storeId: row.store_id, customerEmail: row.customer_email, status: row.status, totalCents: row.total_cents, currency: row.currency, payload: JSON.parse(row.payload_json || '{}'), createdAt: row.created_at, updatedAt: row.updated_at }; }

async function billingSummary(db, tenantId) {
  const subscription = await db.prepare('SELECT id, plan, interval, status, payment_enabled, created_at, updated_at FROM staging_subscriptions WHERE tenant_id = ?1').bind(tenantId).first();
  const credits = await db.prepare('SELECT balance_units, updated_at FROM staging_credits WHERE tenant_id = ?1').bind(tenantId).first();
  const invoices = await db.prepare('SELECT id, amount_cents, currency, status, due_at, created_at FROM staging_invoices WHERE tenant_id = ?1 ORDER BY created_at DESC LIMIT 20').bind(tenantId).all();
  return { subscription: subscription && { id: subscription.id, plan: subscription.plan, interval: subscription.interval, status: subscription.status, paymentEnabled: Boolean(subscription.payment_enabled), createdAt: subscription.created_at, updatedAt: subscription.updated_at }, credits: { balanceUnits: credits?.balance_units ?? 0, updatedAt: credits?.updated_at ?? null }, invoices: invoices.results || [] };
}

export async function commerceRoute(request, env, url) {
  const base = '/api/platform';
  if (!url.pathname.startsWith(base + '/')) return null;
  if (!sameOrigin(request)) return json({ error: 'ORIGIN_NOT_ALLOWED' }, 403);
  if (!env.DB) return json({ error: 'DATABASE_UNAVAILABLE' }, 503);
  try {
    const user = await currentUser(env.DB, request);
    if (!user) return json({ error: 'AUTH_REQUIRED' }, 401);
    await ensureSchema(env.DB);
    await ensureCommerceSchema(env.DB);
    const membership = await tenantFor(env.DB, user);
    if (!membership) return json({ error: 'TENANT_UNAVAILABLE' }, 503);
    const tenantId = membership.tenant_id;

    if (request.method === 'GET' && url.pathname === base + '/documents') {
      const result = await env.DB.prepare('SELECT id, filename, content_type, size_bytes, created_at FROM staging_documents WHERE tenant_id = ?1 ORDER BY created_at DESC LIMIT 100').bind(tenantId).all();
      return json({ documents: (result.results || []).map(row => ({ id: row.id, filename: row.filename, contentType: row.content_type, sizeBytes: row.size_bytes, createdAt: row.created_at })) });
    }
    if (request.method === 'POST' && url.pathname === base + '/documents') {
      if (!env.ARTIFACTS) return json({ error: 'ARTIFACTS_UNAVAILABLE' }, 503);
      const form = await request.formData();
      const file = form.get('file');
      if (!file || typeof file.arrayBuffer !== 'function') return json({ error: 'FILE_REQUIRED' }, 400);
      const size = Number(file.size || 0);
      if (!Number.isSafeInteger(size) || size < 1 || size > MAX_UPLOAD_BYTES) return json({ error: 'FILE_TOO_LARGE' }, 413);
      const documentId = id('doc');
      const filename = safeFileName(file.name);
      const contentType = text(file.type, 160) || 'application/octet-stream';
      const key = `${tenantId}/${documentId}/${filename}`;
      await env.ARTIFACTS.put(key, await file.arrayBuffer(), { httpMetadata: { contentType } });
      const createdAt = now();
      await env.DB.prepare('INSERT INTO staging_documents (id, tenant_id, owner_id, object_key, filename, content_type, size_bytes, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)').bind(documentId, tenantId, user.id, key, filename, contentType, size, createdAt).run();
      await audit(env.DB, tenantId, user.id, 'document.created', 'document', documentId, { contentType, size });
      return json({ document: { id: documentId, filename, contentType, sizeBytes: size, createdAt } }, 201);
    }
    const documentMatch = url.pathname.match(new RegExp('^' + base + '/documents/([^/]+)$'));
    if (request.method === 'GET' && documentMatch) {
      if (!env.ARTIFACTS) return json({ error: 'ARTIFACTS_UNAVAILABLE' }, 503);
      const documentId = decodePart(documentMatch[1]);
      const row = await env.DB.prepare('SELECT object_key, filename, content_type, size_bytes FROM staging_documents WHERE id = ?1 AND tenant_id = ?2').bind(documentId, tenantId).first();
      if (!row) return json({ error: 'NOT_FOUND' }, 404);
      const object = await env.ARTIFACTS.get(row.object_key);
      if (!object) return json({ error: 'ARTIFACT_NOT_FOUND' }, 404);
      return new Response(object.body, { headers: { 'cache-control': 'no-store', 'content-type': row.content_type, 'content-length': String(row.size_bytes), 'content-disposition': `attachment; filename="${row.filename}"`, 'x-content-type-options': 'nosniff' } });
    }

    if (request.method === 'GET' && url.pathname === base + '/stores') {
      const result = await env.DB.prepare('SELECT id, tenant_id, name, slug, status, created_at FROM staging_stores WHERE tenant_id = ?1 ORDER BY created_at DESC').bind(tenantId).all();
      return json({ stores: (result.results || []).map(publicStore) });
    }
    if (request.method === 'POST' && url.pathname === base + '/stores') {
      const input = await body(request);
      const name = text(input?.name, 160);
      const slug = text(input?.slug, 80)?.toLowerCase();
      if (!name || !slug || !/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/.test(slug)) return json({ error: 'INVALID_STORE' }, 400);
      const storeId = id('store');
      const createdAt = now();
      try { await env.DB.prepare('INSERT INTO staging_stores (id, tenant_id, name, slug, status, created_at) VALUES (?1, ?2, ?3, ?4, \'draft\', ?5)').bind(storeId, tenantId, name, slug, createdAt).run(); }
      catch (error) { if (String(error?.message || error).toLowerCase().includes('unique')) return json({ error: 'STORE_SLUG_EXISTS' }, 409); throw error; }
      await audit(env.DB, tenantId, user.id, 'store.created', 'store', storeId, { slug });
      const store = await storeFor(env.DB, tenantId, storeId);
      return json({ store: publicStore(store) }, 201);
    }
    const storeMatch = url.pathname.match(new RegExp('^' + base + '/stores/([^/]+)$'));
    const nestedMatch = url.pathname.match(new RegExp('^' + base + '/stores/([^/]+)/(products|orders)$'));
    if (storeMatch && request.method === 'GET') {
      const store = await storeFor(env.DB, tenantId, decodePart(storeMatch[1]));
      return store ? json({ store: publicStore(store) }) : json({ error: 'NOT_FOUND' }, 404);
    }
    if (nestedMatch) {
      const storeId = decodePart(nestedMatch[1]);
      const collection = nestedMatch[2];
      const store = await storeFor(env.DB, tenantId, storeId);
      if (!store) return json({ error: 'NOT_FOUND' }, 404);
      if (request.method === 'GET' && collection === 'products') {
        const result = await env.DB.prepare('SELECT id, tenant_id, store_id, name, sku, price_cents, stock, created_at, updated_at FROM staging_products WHERE store_id = ?1 AND tenant_id = ?2 ORDER BY updated_at DESC').bind(storeId, tenantId).all();
        return json({ products: (result.results || []).map(publicProduct) });
      }
      if (request.method === 'POST' && collection === 'products') {
        const input = await body(request);
        const name = text(input?.name, 160); const sku = text(input?.sku, 80);
        const priceCents = Number(input?.price_cents); const stock = Number(input?.stock ?? 0);
        if (!name || !sku || !Number.isInteger(priceCents) || priceCents < 0 || !Number.isInteger(stock) || stock < 0 || stock > 100000000) return json({ error: 'INVALID_PRODUCT' }, 400);
        const productId = id('prod'); const timestamp = now();
        try { await env.DB.prepare('INSERT INTO staging_products (id, tenant_id, store_id, name, sku, price_cents, stock, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)').bind(productId, tenantId, storeId, name, sku, priceCents, stock, timestamp).run(); }
        catch (error) { if (String(error?.message || error).toLowerCase().includes('unique')) return json({ error: 'PRODUCT_SKU_EXISTS' }, 409); throw error; }
        await audit(env.DB, tenantId, user.id, 'product.created', 'product', productId, { storeId });
        const product = await env.DB.prepare('SELECT id, tenant_id, store_id, name, sku, price_cents, stock, created_at, updated_at FROM staging_products WHERE id = ?1').bind(productId).first();
        return json({ product: publicProduct(product) }, 201);
      }
      if (request.method === 'GET' && collection === 'orders') {
        const result = await env.DB.prepare('SELECT id, tenant_id, store_id, customer_email, status, total_cents, currency, payload_json, created_at, updated_at FROM staging_orders WHERE store_id = ?1 AND tenant_id = ?2 ORDER BY created_at DESC LIMIT 100').bind(storeId, tenantId).all();
        return json({ orders: (result.results || []).map(publicOrder) });
      }
      if (request.method === 'POST' && collection === 'orders') {
        const input = await body(request); const totalCents = Number(input?.total_cents);
        const currency = text(input?.currency, 8)?.toUpperCase(); const customerEmail = text(input?.customer_email, 254);
        if (!Number.isInteger(totalCents) || totalCents < 0 || !currency || !/^[A-Z]{3}$/.test(currency)) return json({ error: 'INVALID_ORDER' }, 400);
        const orderId = id('ord'); const timestamp = now(); const payload = input?.payload && typeof input.payload === 'object' ? input.payload : {};
        await env.DB.prepare('INSERT INTO staging_orders (id, tenant_id, store_id, customer_email, status, total_cents, currency, payload_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, \'pending\', ?5, ?6, ?7, ?8, ?8)').bind(orderId, tenantId, storeId, customerEmail, totalCents, currency, JSON.stringify(payload), timestamp).run();
        await audit(env.DB, tenantId, user.id, 'order.created', 'order', orderId, { storeId, paymentEnabled: false });
        const order = await env.DB.prepare('SELECT id, tenant_id, store_id, customer_email, status, total_cents, currency, payload_json, created_at, updated_at FROM staging_orders WHERE id = ?1').bind(orderId).first();
        return json({ order: publicOrder(order), paymentEnabled: false }, 201);
      }
    }

    if (request.method === 'GET' && url.pathname === base + '/billing/summary') {
      let sub = await env.DB.prepare('SELECT id FROM staging_subscriptions WHERE tenant_id = ?1').bind(tenantId).first();
      if (!sub) { const timestamp = now(); await env.DB.prepare('INSERT OR IGNORE INTO staging_subscriptions (id, tenant_id, plan, interval, status, payment_enabled, created_at, updated_at) VALUES (?1, ?2, \'staging\', \'monthly\', \'trialing\', 0, ?3, ?3)').bind(id('sub'), tenantId, timestamp).run(); }
      const credits = await env.DB.prepare('SELECT tenant_id FROM staging_credits WHERE tenant_id = ?1').bind(tenantId).first();
      if (!credits) await env.DB.prepare('INSERT OR IGNORE INTO staging_credits (tenant_id, balance_units, updated_at) VALUES (?1, 1000, ?2)').bind(tenantId, now()).run();
      return json(await billingSummary(env.DB, tenantId));
    }
    const creditOperation = url.pathname === base + '/billing/credits/consume';
    const aiOperation = url.pathname === base + '/ai/usage';
    if (request.method === 'POST' && (creditOperation || aiOperation)) {
      const input = await body(request);
      const kind = aiOperation ? 'ai' : 'credit';
      const detail = aiOperation ? (text(input?.model, 80) || 'qabs-ai-staging') : (text(input?.reason, 160) || 'usage');
      const outcome = await consumeCredits(env.DB, {
        tenantId, userId: user.id, requestKey: request.headers.get('Idempotency-Key'), kind,
        units: Number(input?.units), detail, operationId: id(aiOperation ? 'aiu' : 'credit'),
        auditId: id('aud'), timestamp: now()
      });
      return json(outcome.body, outcome.status);
    }

    if (request.method === 'GET' && url.pathname === base + '/admin/summary') {
      if (!isAdmin(user, membership)) return json({ error: 'FORBIDDEN' }, 403);
      const [stores, products, orders, documents, tickets, usage] = await Promise.all([
        env.DB.prepare('SELECT COUNT(*) AS count FROM staging_stores WHERE tenant_id = ?1').bind(tenantId).first(),
        env.DB.prepare('SELECT COUNT(*) AS count FROM staging_products WHERE tenant_id = ?1').bind(tenantId).first(),
        env.DB.prepare('SELECT COUNT(*) AS count FROM staging_orders WHERE tenant_id = ?1').bind(tenantId).first(),
        env.DB.prepare('SELECT COUNT(*) AS count FROM staging_documents WHERE tenant_id = ?1').bind(tenantId).first(),
        env.DB.prepare('SELECT COUNT(*) AS count FROM staging_requests WHERE tenant_id = ?1').bind(tenantId).first(),
        env.DB.prepare('SELECT COALESCE(SUM(units), 0) AS units FROM staging_ai_usage WHERE tenant_id = ?1').bind(tenantId).first()
      ]);
      return json({ role: roleFor(user, membership), counts: { stores: stores.count, products: products.count, orders: orders.count, documents: documents.count, requests: tickets.count, aiUnits: usage.units }, billing: await billingSummary(env.DB, tenantId) });
    }

    if (url.pathname === base + '/staff' && request.method === 'GET') {
      if (!isAdmin(user, membership)) return json({ error: 'FORBIDDEN' }, 403);
      const result = await env.DB.prepare('SELECT m.user_id, u.email, m.role, m.created_at FROM staging_tenant_members m JOIN staging_users u ON u.id = m.user_id WHERE m.tenant_id = ?1 ORDER BY m.created_at ASC').bind(tenantId).all();
      return json({ staff: result.results || [] });
    }
    if (url.pathname === base + '/staff' && request.method === 'POST') {
      if (!isAdmin(user, membership)) return json({ error: 'FORBIDDEN' }, 403);
      const input = await body(request); const email = text(input?.email, 254)?.toLowerCase(); const role = text(input?.role, 40);
      if (!email || !role || !STAFF_ROLES.has(role)) return json({ error: 'INVALID_STAFF' }, 400);
      const target = await env.DB.prepare('SELECT id, email FROM staging_users WHERE email = ?1').bind(email).first();
      if (!target) return json({ error: 'USER_NOT_FOUND' }, 404);
      const createdAt = now();
      try { await env.DB.prepare('INSERT INTO staging_tenant_members (tenant_id, user_id, role, created_at) VALUES (?1, ?2, ?3, ?4)').bind(tenantId, target.id, role, createdAt).run(); }
      catch (error) { if (String(error?.message || error).toLowerCase().includes('unique')) return json({ error: 'STAFF_ALREADY_ASSIGNED' }, 409); throw error; }
      await audit(env.DB, tenantId, user.id, 'staff.assigned', 'user', target.id, { role });
      return json({ staff: { userId: target.id, email: target.email, role, createdAt } }, 201);
    }
    return null;
  } catch (error) {
    return json({ error: 'COMMERCE_TEMPORARILY_UNAVAILABLE' }, 500);
  }
}
