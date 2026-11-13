// Credit operations are scoped to the authenticated tenant, not client-provided tenant IDs.
// D1 batch() commits all statements together or rolls back the entire batch.
export const CREDIT_SCHEMA = `CREATE TABLE IF NOT EXISTS staging_credit_operations (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL,
  request_key TEXT NOT NULL, kind TEXT NOT NULL, units INTEGER NOT NULL,
  detail TEXT NOT NULL, balance_after INTEGER NOT NULL, created_at TEXT NOT NULL,
  UNIQUE (tenant_id, request_key)
)`;

export async function consumeCredits(db, {tenantId, userId, requestKey, kind, units, detail, operationId, auditId, timestamp}) {
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(requestKey || '')) return {status: 400, body: {error: 'IDEMPOTENCY_KEY_REQUIRED'}};
  if (!Number.isSafeInteger(units) || units < 1 || units > 100000) return {status: 400, body: {error: 'INVALID_UNITS'}};
  if (!['credit', 'ai'].includes(kind)) throw new Error('INVALID_KIND');
  const prep = (sql, ...args) => db.prepare(sql).bind(...args);
  const result = await db.batch([
    prep(`INSERT INTO staging_credit_operations (id, tenant_id, user_id, request_key, kind, units, detail, balance_after, created_at)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, balance_units - ?6, ?8 FROM staging_credits
      WHERE tenant_id = ?2 AND balance_units >= ?6
      ON CONFLICT(tenant_id, request_key) DO NOTHING`, operationId, tenantId, userId, requestKey, kind, units, detail, timestamp),
    prep(`UPDATE staging_credits SET balance_units = balance_units - ?1, updated_at = ?2
      WHERE tenant_id = ?3 AND EXISTS (SELECT 1 FROM staging_credit_operations WHERE id = ?4 AND tenant_id = ?3)`, units, timestamp, tenantId, operationId),
    prep(`INSERT INTO staging_ai_usage (id, tenant_id, user_id, model, units, created_at)
      SELECT id, tenant_id, user_id, detail, units, created_at FROM staging_credit_operations WHERE id = ?1 AND tenant_id = ?2 AND kind = 'ai'`, operationId, tenantId),
    prep(`INSERT INTO staging_audit_events (id, tenant_id, actor_id, action, resource_type, resource_id, metadata_json, created_at)
      SELECT ?1, tenant_id, user_id, ?2, ?3, id, ?4, created_at FROM staging_credit_operations WHERE id = ?5 AND tenant_id = ?6`, auditId, kind === 'ai' ? 'ai.usage.recorded' : 'credits.consumed', kind === 'ai' ? 'ai_usage' : 'credits', JSON.stringify({units, [kind === 'ai' ? 'model' : 'reason']: detail}), operationId, tenantId),
    prep('SELECT * FROM staging_credit_operations WHERE tenant_id = ?1 AND request_key = ?2', tenantId, requestKey),
    prep('SELECT balance_units FROM staging_credits WHERE tenant_id = ?1', tenantId)
  ]);
  const row = result[4].results?.[0];
  if (!row) {
    const balance = result[5].results?.[0];
    return balance ? {status: 402, body: {error: 'INSUFFICIENT_CREDITS', balanceUnits: balance.balance_units}} : {status: 409, body: {error: 'CREDITS_NOT_INITIALIZED'}};
  }
  if (row.user_id !== userId || row.kind !== kind || row.units !== units || row.detail !== detail) return {status: 409, body: {error: 'IDEMPOTENCY_CONFLICT'}};
  const replayed = row.id !== operationId;
  return kind === 'ai'
    ? {status: replayed ? 200 : 201, body: {usage: {id: row.id, model: row.detail, units: row.units, createdAt: row.created_at}, balanceUnits: row.balance_after, replayed}}
    : {status: 200, body: {consumedUnits: row.units, balanceUnits: row.balance_after, replayed}};
}
