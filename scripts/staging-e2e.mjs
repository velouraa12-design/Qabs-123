const base = (process.env.QABS_STAGING_URL || 'https://staging.qabs1.store').replace(/\/$/, '');
const admin = { email: process.env.QABS_STAGING_E2E_ADMIN_EMAIL, password: process.env.QABS_STAGING_E2E_ADMIN_PASSWORD };
const customer = { email: process.env.QABS_STAGING_E2E_CUSTOMER_EMAIL, password: process.env.QABS_STAGING_E2E_CUSTOMER_PASSWORD };
if (!admin.email || !admin.password || !customer.email || !customer.password) {
  throw new Error('Set QABS_STAGING_E2E_ADMIN_EMAIL/PASSWORD and QABS_STAGING_E2E_CUSTOMER_EMAIL/PASSWORD');
}

function assert(condition, message) { if (!condition) throw new Error(message); }
function cookieFrom(response) { return response.headers.get('set-cookie')?.split(';', 1)[0] || ''; }
async function call(path, { method = 'GET', body, cookie = '', form = false } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (!form) headers['content-type'] = 'application/json';
  const response = await fetch(`${base}${path}`, { method, headers, body: form ? body : body === undefined ? undefined : JSON.stringify(body) });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
  return { response, data, cookie: cookieFrom(response) || cookie };
}

const health = await call('/health');
assert(health.response.ok && health.data.environment === 'staging', 'health failed');
const unauth = await call('/api/platform/me');
assert(unauth.response.status === 401, 'unauthenticated platform access was not rejected');

const login = await call('/api/auth/login', { method: 'POST', body: admin });
assert(login.response.ok && login.data.user?.role === 'admin', 'admin login failed');
const adminCookie = login.cookie;
const me = await call('/api/platform/me', { cookie: adminCookie });
assert(me.response.ok && me.data.tenant?.id, 'tenant lookup failed');
const billing = await call('/api/platform/billing/summary', { cookie: adminCookie });
assert(billing.response.ok && Number.isInteger(billing.data.credits?.balanceUnits), 'billing summary failed');
const slug = `e2e-${Date.now()}`;
const storeResult = await call('/api/platform/stores', { method: 'POST', cookie: adminCookie, body: { name: 'E2E Staging Store', slug } });
assert(storeResult.response.status === 201, 'store creation failed');
const storeId = storeResult.data.store.id;
const product = await call(`/api/platform/stores/${encodeURIComponent(storeId)}/products`, { method: 'POST', cookie: adminCookie, body: { name: 'E2E Product', sku: `E2E-${Date.now()}`, price_cents: 199, stock: 4 } });
assert(product.response.status === 201, 'product creation failed');
const order = await call(`/api/platform/stores/${encodeURIComponent(storeId)}/orders`, { method: 'POST', cookie: adminCookie, body: { total_cents: 199, currency: 'USD', payload: { test: true } } });
assert(order.response.status === 201 && order.data.paymentEnabled === false, 'payment-disabled order failed');
const form = new FormData();
form.append('file', new Blob(['QABS staging E2E'], { type: 'text/plain' }), 'e2e.txt');
const upload = await call('/api/platform/documents', { method: 'POST', cookie: adminCookie, body: form, form: true });
assert(upload.response.status === 201, 'R2 upload failed');
const download = await call(`/api/platform/documents/${encodeURIComponent(upload.data.document.id)}`, { cookie: adminCookie });
assert(download.response.ok && download.data.raw === 'QABS staging E2E', 'R2 read failed');
const ai = await call('/api/platform/ai/usage', { method: 'POST', cookie: adminCookie, body: { units: 1, model: 'qabs-e2e' } });
assert(ai.response.status === 201, 'AI credit usage failed');
const summary = await call('/api/platform/admin/summary', { cookie: adminCookie });
assert(summary.response.ok && summary.data.role === 'admin', 'admin summary failed');

const customerLogin = await call('/api/auth/login', { method: 'POST', body: customer });
assert(customerLogin.response.ok, 'customer login failed');
const customerStores = await call('/api/platform/stores', { cookie: customerLogin.cookie });
assert(customerStores.response.ok && !customerStores.data.stores.some(store => store.id === storeId), 'tenant isolation failed');

console.log(JSON.stringify({ health: 'PASS', unauthenticated: 'PASS', auth: 'PASS', tenant: 'PASS', billing: 'PASS', store: 'PASS', product: 'PASS', order: 'PASS', paymentDisabled: 'PASS', r2UploadRead: 'PASS', aiCredits: 'PASS', adminSummary: 'PASS', crossTenantIsolation: 'PASS' }));
