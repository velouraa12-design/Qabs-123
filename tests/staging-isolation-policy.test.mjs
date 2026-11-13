import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEnvironmentInventory, validateIsolatedWorkerConfig, validateOutboundUrl } from '../staging-worker/isolation-policy.mjs';

const approved = { workerName: 'qabs-isolation-candidate', d1Id: 'approved-test-d1-id', d1Name: 'qabs-isolation-candidate-db', r2Bucket: 'qabs-isolation-candidate-objects' };
const config = { name: approved.workerName, bindings: { D1: { id: approved.d1Id, name: approved.d1Name }, R2: { bucket: approved.r2Bucket } }, routes: [], custom_domains: [], crons: [] };

test('accepts only explicitly approved isolated D1/R2 targets', () => {
  assert.equal(validateIsolatedWorkerConfig(config, approved), true);
  assert.throws(() => validateIsolatedWorkerConfig({ ...config, bindings: { ...config.bindings, services: [{ binding: 'COMMERCE', service: 'qabs-stores' }] } }, approved), /forbidden binding category|service bindings/);
  assert.throws(() => validateIsolatedWorkerConfig({ ...config, bindings: { ...config.bindings, D1: { id: 'production-id', name: 'prod-db' } } }, approved), /D1 target/);
  assert.throws(() => validateIsolatedWorkerConfig({ ...config, routes: ['staging.qabs1.store/*'] }, approved), /routes/);
  assert.throws(() => validateIsolatedWorkerConfig({ ...config, routes: {} }, approved), /routes/);
  assert.throws(() => validateIsolatedWorkerConfig({ ...config, bindings: { ...config.bindings, CACHE: {} } }, approved), /unapproved binding/);
  assert.throws(() => validateIsolatedWorkerConfig({ ...config, crons: ['*/5 * * * *'] }, approved), /scheduled triggers/);
});

test('outbound requests fail closed unless HTTPS origin is explicitly allowlisted', () => {
  assert.equal(validateOutboundUrl('https://synthetic-mail.invalid/send', ['https://synthetic-mail.invalid']), true);
  assert.throws(() => validateOutboundUrl('https://portal.qabs1.store/api', ['https://portal.qabs1.store']), /production\/preview host/);
  assert.throws(() => validateOutboundUrl('http://synthetic-mail.invalid/send', ['http://synthetic-mail.invalid']), /HTTPS/);
  assert.throws(() => validateOutboundUrl('https://user:pass@synthetic-mail.invalid/send', ['https://synthetic-mail.invalid']), /credentials/);
  assert.throws(() => validateOutboundUrl('https://synthetic-mail.invalid:8443/send', ['https://synthetic-mail.invalid:8443']), /ports/);
  assert.throws(() => validateOutboundUrl('https://unknown.invalid/', []), /allowlist/);
});

test('environment inventory requires synthetic-only data and no production bindings', () => {
  assert.equal(validateEnvironmentInventory({ environment: 'staging', serviceBindings: [], routes: [], customDomains: [], crons: [], productionSecretsPresent: false, dataClassification: 'synthetic-only' }), true);
  assert.throws(() => validateEnvironmentInventory({ environment: 'staging', serviceBindings: ['qabs-stores'], routes: [], customDomains: [], crons: [], productionSecretsPresent: false, dataClassification: 'synthetic-only' }), /service bindings/);
  assert.throws(() => validateEnvironmentInventory({ environment: 'staging', serviceBindings: [], routes: [], customDomains: [], crons: [], productionSecretsPresent: true, dataClassification: 'synthetic-only' }), /secret separation/);
  assert.throws(() => validateEnvironmentInventory({ environment: 'staging', serviceBindings: [], routes: [], customDomains: [], crons: [], productionSecretsPresent: false, dataClassification: 'unknown' }), /synthetic-only/);
});
