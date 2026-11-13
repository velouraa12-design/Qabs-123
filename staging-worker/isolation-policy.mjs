// Fail-closed policy primitives for the next isolated QABS staging worker.
// This module is intentionally not wired to any deployed Worker or Cloudflare config.
const FORBIDDEN_BINDING_KEYS = new Set([
  'services', 'queues', 'kv_namespaces', 'durable_objects', 'analytics_engine_datasets',
  'dispatch_namespaces', 'hyperdrive', 'browser', 'send_email'
]);
const FORBIDDEN_HOSTS = new Set(['qabs1.store', 'www.qabs1.store', 'portal.qabs1.store', 'preview.qabs1.store']);
const SECRET_KEY = /secret|token|password|credential|api[_-]?key/i;

function block(message) { throw new Error(`QABS isolation policy: ${message}`); }
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }

export function validateIsolatedWorkerConfig(config, approved) {
  if (!isObject(config) || !isObject(approved)) block('config and approved resource inventory are required');
  for (const key of ['workerName', 'd1Id', 'd1Name', 'r2Bucket']) if (typeof approved[key] !== 'string' || !approved[key].trim()) block('approved resource inventory is incomplete');
  if (config.name !== approved.workerName) block('worker name mismatch');
  for (const key of ['routes', 'custom_domains', 'customDomains']) {
    if (key in config && (!Array.isArray(config[key]) || config[key].length !== 0)) block('routes and custom domains are prohibited for preparation worker');
  }
  if ('route' in config) block('routes and custom domains are prohibited for preparation worker');
  for (const key of FORBIDDEN_BINDING_KEYS) if (key in config) block(`forbidden binding category: ${key}`);
  const bindings = config.bindings ?? {};
  if (!isObject(bindings)) block('bindings must be an object');
  for (const key of Object.keys(bindings)) {
    if (FORBIDDEN_BINDING_KEYS.has(key)) block(`forbidden binding category: ${key}`);
    if (SECRET_KEY.test(key)) block(`secret-like binding name: ${key}`);
    if (!['D1', 'R2'].includes(key)) block(`unapproved binding: ${key}`);
  }
  if (bindings.D1?.id !== approved.d1Id || bindings.D1?.name !== approved.d1Name) block('D1 target is not explicitly approved');
  if (bindings.R2?.bucket !== approved.r2Bucket) block('R2 target is not explicitly approved');
  if (bindings.services?.length) block('service bindings are prohibited');
  if (config.crons?.length || config.triggers?.crons?.length) block('scheduled triggers are prohibited');
  return true;
}

export function validateOutboundUrl(input, allowedOrigins = []) {
  let url;
  try { url = new URL(input); } catch { block('outbound URL is invalid'); }
  if (url.protocol !== 'https:') block('only HTTPS outbound destinations are allowed');
  if (url.username || url.password) block('URL credentials are prohibited');
  if (url.port && !['443'].includes(url.port)) block('non-standard outbound ports are prohibited');
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (FORBIDDEN_HOSTS.has(host) || host.endsWith('.qabs1.store')) block('QABS production/preview host is forbidden');
  // Deny all literal IPs, including public ones, plus common local/metadata
  // hostnames even when accidentally allowlisted. URL canonicalizes IPv4 forms.
  // This does NOT inspect DNS answers or control network egress.
  if (host.startsWith('[') || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan') || host === 'home.arpa' || host.endsWith('.home.arpa') || host === 'metadata') block('literal IP and local or metadata hosts are forbidden');
  if (!allowedOrigins.includes(url.origin)) block('outbound origin is not on the explicit allowlist');
  return true;
}

export function validateEnvironmentInventory(inventory) {
  if (!isObject(inventory)) block('environment inventory is required');
  if (inventory.environment !== 'staging') block('environment must be staging');
  for (const key of ['serviceBindings', 'routes', 'customDomains', 'crons']) if (!Array.isArray(inventory[key])) block(`${key} inventory must be an explicit array`);
  if (inventory.serviceBindings.length) block('service bindings must be empty');
  if (inventory.routes?.length || inventory.customDomains?.length) block('routes and custom domains must be empty');
  if (inventory.crons?.length) block('cron triggers must be empty');
  if (inventory.productionSecretsPresent !== false) block('production secret separation is not proven');
  if (inventory.dataClassification !== 'synthetic-only') block('data must be classified synthetic-only');
  return true;
}

// Validates the JSON shape passed to Wrangler; this is a preflight, not an
// independent proof of remote bindings or of the truth of the inventory.
export function validateWranglerStagingManifest(config, approved, inventory) {
  validateEnvironmentInventory(inventory);
  if (!isObject(approved)) block('approved resource inventory is required');
  if (!isObject(config) || !isObject(config.env) || !isObject(config.env.staging)) block('Wrangler env.staging is required');
  const onlyKeys = (obj, allowed, where) => {
    if (!isObject(obj)) block(`${where} must be an object`);
    for (const key of Object.keys(obj)) if (!allowed.includes(key)) block(`unapproved ${where} key: ${key}`);
  };
  onlyKeys(config, ['name', 'main', 'compatibility_date', 'workers_dev', 'env'], 'Wrangler root');
  if (config.main !== './entrypoint.mjs' || config.workers_dev !== true || !/^\d{4}-\d{2}-\d{2}$/.test(config.compatibility_date || '')) block('invalid Wrangler entrypoint or preview configuration');
  if (Object.keys(config.env).length !== 1) block('only staging environment is allowed');
  const s = config.env.staging;
  onlyKeys(s, ['name', 'vars', 'd1_databases', 'r2_buckets'], 'Wrangler staging');
  if (config.name !== approved.workerName || s.name !== approved.workerName) block('worker name mismatch');
  if (!Array.isArray(s.d1_databases) || s.d1_databases.length !== 1 || !Array.isArray(s.r2_buckets) || s.r2_buckets.length !== 1) block('exactly one D1 and R2 are required');
  let d = s.d1_databases[0], r = s.r2_buckets[0];
  onlyKeys(d, ['binding', 'database_id', 'database_name'], 'D1');
  onlyKeys(r, ['binding', 'bucket_name'], 'R2');
  onlyKeys(s.vars, ['QABS_STAGING_ENV', 'QABS_STAGING_D1_UUID', 'QABS_STAGING_D1_NAME', 'QABS_STAGING_R2_BUCKET'], 'vars');
  if (d.binding !== 'DB' || r.binding !== 'ARTIFACTS') block('binding names mismatch');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(d.database_id || '')) block('D1 UUID is invalid');
  if (s.vars.QABS_STAGING_ENV !== 'staging' || s.vars.QABS_STAGING_D1_UUID !== d.database_id || s.vars.QABS_STAGING_D1_NAME !== d.database_name || s.vars.QABS_STAGING_R2_BUCKET !== r.bucket_name) block('runtime inventory does not match bindings');
  return validateIsolatedWorkerConfig({name:s.name,bindings:{D1:{id:d.database_id,name:d.database_name},R2:{bucket:r.bucket_name}}},approved);
}
