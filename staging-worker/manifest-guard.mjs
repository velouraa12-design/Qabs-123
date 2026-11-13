import { validateIsolatedWorkerConfig } from './isolation-policy.mjs';

export const EXPECTED_D1_UUID = 'bee3d2a1-def7-4e71-857e-3c21e42f809d';
export const EXPECTED_D1_NAME = 'qabs-isolated-staging-db-20261110';
export const EXPECTED_R2_BUCKET = 'qabs-isolated-staging-artifacts-20261110';
export const EXPECTED_WORKER_NAME = 'qabs-isolated-staging-worker';

const FORBIDDEN_TEXT = /production|\bprod\b|\blive\b|fallback|default/i;
const FORBIDDEN_KEY = /secret|token|password|credential/i;
const ALLOWED_RUNTIME_KEYS = new Set([
  'DB', 'ARTIFACTS', 'QABS_STAGING_ENV', 'QABS_STAGING_D1_UUID',
  'QABS_STAGING_D1_NAME', 'QABS_STAGING_R2_BUCKET', 'ENVIRONMENT',
  'environment', 'QABS_ENVIRONMENT'
]);

function fail(message) {
  throw new Error(`isolated-staging guard: ${message}`);
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
}

function assertAllowedKeys(value, allowed, label) {
  assertPlainObject(value, label);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`${label} contains unexpected key ${key}`);
  }
}

function scanForbidden(value, path = 'manifest') {
  if (typeof value === 'string' && FORBIDDEN_TEXT.test(value)) fail(`forbidden production/fallback reference at ${path}`);
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForbidden(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_KEY.test(key)) fail(`secret-like key ${path}.${key} is not allowed`);
      if (FORBIDDEN_TEXT.test(key)) fail(`forbidden production/fallback key ${path}.${key}`);
      scanForbidden(item, `${path}.${key}`);
    }
  }
}

export function assertIsolatedManifest(manifest) {
  assertAllowedKeys(manifest, ['name', 'main', 'compatibility_date', 'workers_dev', 'env'], 'manifest');
  if (manifest.name !== EXPECTED_WORKER_NAME) fail('worker name is not the isolated worker');
  if (manifest.workers_dev !== true) fail('workers_dev must be true');
  if (manifest.main !== './entrypoint.mjs') fail('main must point to the isolated entrypoint');
  if ('routes' in manifest && (!Array.isArray(manifest.routes) || manifest.routes.length !== 0)) fail('routes are not allowed');
  for (const key of ['services', 'queues', 'kv_namespaces', 'secrets', 'durable_objects']) {
    if (key in manifest) fail(`${key} bindings are not allowed`);
  }
  if (!manifest.env || typeof manifest.env !== 'object' || Array.isArray(manifest.env)) fail('env.staging is required');
  const envNames = Object.keys(manifest.env);
  if (envNames.length !== 1 || envNames[0] !== 'staging') fail('only env.staging is allowed');
  const staging = manifest.env.staging;
  assertAllowedKeys(staging, ['name', 'vars', 'd1_databases', 'r2_buckets'], 'env.staging');
  if (staging.name !== `${EXPECTED_WORKER_NAME}-staging`) fail('staging worker name is invalid');
  if ('routes' in staging && (!Array.isArray(staging.routes) || staging.routes.length !== 0)) fail('staging routes are not allowed');
  for (const key of ['services', 'queues', 'kv_namespaces', 'secrets', 'durable_objects']) {
    if (key in staging) fail(`staging ${key} bindings are not allowed`);
  }
  if (!staging.vars || typeof staging.vars !== 'object' || Array.isArray(staging.vars)) fail('staging vars are required');
  const requiredVars = {
    QABS_STAGING_ENV: 'staging',
    QABS_STAGING_D1_UUID: EXPECTED_D1_UUID,
    QABS_STAGING_D1_NAME: EXPECTED_D1_NAME,
    QABS_STAGING_R2_BUCKET: EXPECTED_R2_BUCKET
  };
  for (const [key, expected] of Object.entries(requiredVars)) {
    if (staging.vars[key] !== expected) fail(`staging var ${key} must be exact`);
  }
  if (Object.keys(staging.vars).some((key) => !Object.hasOwn(requiredVars, key))) fail('extra staging vars are not allowed');
  if (!Array.isArray(staging.d1_databases) || staging.d1_databases.length !== 1) fail('exactly one D1 binding is required');
  const d1 = staging.d1_databases[0];
  assertAllowedKeys(d1, ['binding', 'database_id', 'database_name'], 'D1 binding');
  if (d1.binding !== 'DB' || d1.database_id !== EXPECTED_D1_UUID || d1.database_name !== EXPECTED_D1_NAME) fail('D1 binding is not the approved isolated target');
  if ('env' in d1 || 'environment' in d1) fail('D1 binding may not select another environment');
  if (!Array.isArray(staging.r2_buckets) || staging.r2_buckets.length !== 1) fail('exactly one R2 binding is required');
  const r2 = staging.r2_buckets[0];
  assertAllowedKeys(r2, ['binding', 'bucket_name'], 'R2 binding');
  if (r2.binding !== 'ARTIFACTS' || r2.bucket_name !== EXPECTED_R2_BUCKET) fail('R2 binding is not the approved isolated target');
  if ('env' in r2 || 'environment' in r2) fail('R2 binding may not select another environment');
  scanForbidden(manifest);
  // The existing runtime stays pinned to the legacy targets. This check does
  // not establish data classification or authorization to deploy.
  validateIsolatedWorkerConfig({ name: staging.name, bindings: { D1: { id: d1.database_id, name: d1.database_name }, R2: { bucket: r2.bucket_name } } }, { workerName: `${EXPECTED_WORKER_NAME}-staging`, d1Id: EXPECTED_D1_UUID, d1Name: EXPECTED_D1_NAME, r2Bucket: EXPECTED_R2_BUCKET });
  return true;
}

export function assertIsolatedRuntime(env) {
  assertPlainObject(env, 'runtime env');
  for (const key of Object.keys(env)) {
    if (!ALLOWED_RUNTIME_KEYS.has(key)) fail(`unexpected runtime binding/key ${key}`);
    if (FORBIDDEN_KEY.test(key)) fail(`secret-like runtime key ${key} is not allowed`);
  }
  if (env.QABS_STAGING_ENV !== 'staging') fail('QABS_STAGING_ENV must be staging');
  if (env.QABS_STAGING_D1_UUID !== EXPECTED_D1_UUID) fail('runtime D1 UUID mismatch');
  if (env.QABS_STAGING_D1_NAME !== EXPECTED_D1_NAME) fail('runtime D1 name mismatch');
  if (env.QABS_STAGING_R2_BUCKET !== EXPECTED_R2_BUCKET) fail('runtime R2 bucket mismatch');
  if (!env.DB || !env.ARTIFACTS) fail('DB and ARTIFACTS bindings are both required');
  for (const key of ['ENVIRONMENT', 'environment', 'QABS_ENVIRONMENT']) {
    if (key in env && env[key] !== 'staging') fail(`${key} must be staging`);
  }
  return true;
}
