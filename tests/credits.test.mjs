import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { CREDIT_SCHEMA, consumeCredits } from '../staging-worker/credits.mjs';

function makeDb() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE staging_credits (tenant_id TEXT PRIMARY KEY, balance_units INTEGER NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE staging_ai_usage (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, model TEXT NOT NULL, units INTEGER NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE staging_audit_events (id TEXT PRIMARY KEY, tenant_id TEXT, actor_id TEXT, action TEXT NOT NULL, resource_type TEXT NOT NULL, resource_id TEXT, metadata_json TEXT NOT NULL, created_at TEXT NOT NULL);`);
  sql.exec(CREDIT_SCHEMA);
  sql.exec("INSERT INTO staging_credits VALUES ('A',10,'old'),('B',20,'old')");
  const db = {
    prepare(q) { return { bind(...args) { return {q,args}; } }; },
    async batch(statements) {
      sql.exec('BEGIN');
      try { const results = statements.map(({q,args}) => { const stmt=sql.prepare(q); return /^\s*SELECT/i.test(q) ? {results:stmt.all(...args)} : {meta:stmt.run(...args)}; }); sql.exec('COMMIT'); return results; }
      catch(e) { sql.exec('ROLLBACK'); throw e; }
    }
  };
  return {sql,db};
}
let seq=0;
function op(db, overrides={}) { const n=++seq; return consumeCredits(db, {tenantId:'A',userId:'uA',requestKey:'request-001',kind:'ai',units:3,detail:'mock-model',operationId:`op-${n}`,auditId:`audit-${n}`,timestamp:'2026-11-13T00:00:00Z', ...overrides}); }

test('replay charges once and creates one usage and audit', async () => {
 const {db,sql}=makeDb(); const first=await op(db); const replay=await op(db);
 assert.equal(first.status,201); assert.equal(replay.status,200); assert.equal(replay.body.replayed,true); assert.equal(replay.body.usage.id,first.body.usage.id);
 assert.equal(sql.prepare("SELECT balance_units FROM staging_credits WHERE tenant_id='A'").get().balance_units,7);
 assert.equal(sql.prepare('SELECT count(*) AS n FROM staging_ai_usage').get().n,1); assert.equal(sql.prepare('SELECT count(*) AS n FROM staging_audit_events').get().n,1);
});
test('same key with different request or user conflicts without charging', async () => {
 const {db,sql}=makeDb(); await op(db); assert.equal((await op(db,{units:4})).status,409); assert.equal((await op(db,{userId:'other'})).status,409);
 assert.equal(sql.prepare("SELECT balance_units FROM staging_credits WHERE tenant_id='A'").get().balance_units,7);
});
test('separate tenant may use same key without touching other balance', async () => {
 const {db,sql}=makeDb(); await op(db); await op(db,{tenantId:'B',userId:'uB'});
 assert.equal(sql.prepare("SELECT balance_units FROM staging_credits WHERE tenant_id='A'").get().balance_units,7);
 assert.equal(sql.prepare("SELECT balance_units FROM staging_credits WHERE tenant_id='B'").get().balance_units,17);
});
test('simultaneous attempts never overspend in serial transactional D1 model', async () => {
 const {db,sql}=makeDb(); const all=await Promise.all([op(db,{requestKey:'request-101',units:7}),op(db,{requestKey:'request-102',units:7})]);
 assert.deepEqual(all.map(x=>x.status).sort(),[201,402]); assert.equal(sql.prepare("SELECT balance_units FROM staging_credits WHERE tenant_id='A'").get().balance_units,3);
});
test('audit failure rolls back operation, usage, and balance', async () => {
 const {db,sql}=makeDb(); sql.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON staging_audit_events BEGIN SELECT RAISE(ABORT,'test failure'); END");
 await assert.rejects(op(db)); assert.equal(sql.prepare("SELECT balance_units FROM staging_credits WHERE tenant_id='A'").get().balance_units,10);
 assert.equal(sql.prepare('SELECT count(*) AS n FROM staging_credit_operations').get().n,0); assert.equal(sql.prepare('SELECT count(*) AS n FROM staging_ai_usage').get().n,0);
});
test('requires valid idempotency key and positive integral units', async () => {
 const {db}=makeDb(); assert.equal((await op(db,{requestKey:''})).status,400); assert.equal((await op(db,{units:-1})).status,400); assert.equal((await op(db,{units:1.5})).status,400);
});
test('direct credit consumption is audited without AI usage', async () => {
 const {db,sql}=makeDb(); const x=await op(db,{kind:'credit',detail:'usage'}); assert.equal(x.status,200); assert.equal(x.body.balanceUnits,7);
 assert.equal(sql.prepare('SELECT count(*) AS n FROM staging_ai_usage').get().n,0); assert.equal(sql.prepare('SELECT count(*) AS n FROM staging_audit_events').get().n,1);
});
