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
  if (config.name !== approved.workerName) block('worker name mismatch');
  for (const key of ['routes', 'custom_domains', 'customDomains']) {
    if (key in config && (!Array.isArray(config[key]) || config[key].length !== 0)) block('routes and custom domains are prohibited for preparation worker');
  }
  if ('route' in config) block('routes and custom domains are prohibited for preparation worker');
  for (const key of FORBIDDEN_BINDING_KEYS) if (key in config) block(`forbidden binding category: ${key}`);
  const bindings = config.bindings ?? {};
  if (!isObject(bindings)) block('bindings must be an object');
  for (const key of Object.keys(bindings)) {
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
  const host = url.hostname.toLowerCase();
  if (FORBIDDEN_HOSTS.has(host) || host.endsWith('.qabs1.store')) block('QABS production/preview host is forbidden');
  if (!allowedOrigins.includes(url.origin)) block('outbound origin is not on the explicit allowlist');
  return true;
}

export function validateEnvironmentInventory(inventory) {
  if (!isObject(inventory)) block('environment inventory is required');
  if (inventory.environment !== 'staging') block('environment must be staging');
  if (inventory.serviceBindings?.length) block('service bindings must be empty');
  if (inventory.routes?.length || inventory.customDomains?.length) block('routes and custom domains must be empty');
  if (inventory.crons?.length) block('cron triggers must be empty');
  if (inventory.productionSecretsPresent !== false) block('production secret separation is not proven');
  if (inventory.dataClassification !== 'synthetic-only') block('data must be classified synthetic-only');
  return true;
}
