import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from '../staging-worker/entrypoint.mjs';
import { EXPECTED_D1_NAME, EXPECTED_D1_UUID, EXPECTED_R2_BUCKET } from '../staging-worker/manifest-guard.mjs';

function harness() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  function statement(query, args = []) {
    return {
      bind(...next) { return statement(query, next); },
      async run() { const result = sql.prepare(query).run(...args); return { success: true, meta: { changes: Number(result.changes) } }; },
      async first() { return sql.prepare(query).get(...args) ?? null; },
      async all() { return { success: true, results: sql.prepare(query).all(...args) }; },
      query, args
    };
  }
  const db = {
    prepare(query) { return statement(query); },
    async batch(items) {
      sql.exec('BEGIN');
      try {
        const output = [];
        for (const item of items) {
          const query = sql.prepare(item.query);
          if (/^\\s*SELECT/i.test(item.query)) output.push({ success: true, results: query.all(...item.args) });
          else {
            const result = query.run(...item.args);
            output.push({ success: true, meta: { changes: Number(result.changes) } });
          }
        }
        sql.exec('COMMIT');
        return output;
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    }
  };
  const env = {
    DB: db,
    ARTIFACTS: { async get() { return null; }, async put() {} },
    QABS_STAGING_ENV: 'staging',
    QABS_STAGING_D1_UUID: EXPECTED_D1_UUID,
    QABS_STAGING_D1_NAME: EXPECTED_D1_NAME,
    QABS_STAGING_R2_BUCKET: EXPECTED_R2_BUCKET
  };
  async function call(path, { method = 'GET', cookie, body, headers = {} } = {}) {
    if (cookie) headers.cookie = cookie;
    headers.origin ||= 'https://staging.test';
    if (body && !(body instanceof FormData)) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(body);
    }
    const response = await worker.fetch(new Request('https://staging.test' + path, { method, headers, body }), env);
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = raw; }
    return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0], headers: response.headers };
  }
  return { sql, call };
}

const applicant = {
  full_name: 'Synthetic Partner',
  email: 'partner@example.test',
  phone: '+1 555 0100',
  country: 'Yemen',
  city: 'Sanaa',
  company_name: 'Synthetic Company',
  website: 'https://example.test',
  activity: 'Business services',
  experience: 'Five years of synthetic test experience.',
  audience: 'Small business owners',
  proposal: 'Refer suitable customers to QABS services.',
  about: 'Synthetic applicant used only for automated tests.'
};

async function signup(h, email) {
  const result = await h.call('/api/auth/signup', { method: 'POST', body: { email, password: 'Synthetic-Test-Password-2026' } });
  assert.equal(result.status, 200);
  return result;
}

test('partnership application submission, privacy, admin review and audit trail', async () => {
  const h = harness();
  const user = await signup(h, 'partner-user@example.test');

  const page = await h.call('/partnerships', { cookie: user.cookie });
  assert.equal(page.status, 200);
  assert.match(String(page.data), /كن شريكاً مع قبس/);
  assert.match(String(page.data), /إرسال طلب الشراكة/);

  const submitted = await h.call('/api/platform/partnership-applications', {
    method: 'POST',
    cookie: user.cookie,
    body: { attempt_id: 'partner-attempt-0001', partnership_type: 'referral', applicant }
  });
  assert.equal(submitted.status, 201);
  assert.equal(submitted.data.application.status, 'new');
  assert.equal(submitted.data.application.applicant.email, applicant.email);

  const own = await h.call('/api/platform/partnership-applications', { cookie: user.cookie });
  assert.equal(own.status, 200);
  assert.equal(own.data.applications.length, 1);

  const activeDuplicate = await h.call('/api/platform/partnership-applications', {
    method: 'POST',
    cookie: user.cookie,
    body: { attempt_id: 'partner-attempt-0002', partnership_type: 'referral', applicant }
  });
  assert.equal(activeDuplicate.status, 409);
  assert.equal(activeDuplicate.data.error, 'ACTIVE_APPLICATION_EXISTS');

  const other = await signup(h, 'other-user@example.test');
  const otherList = await h.call('/api/platform/partnership-applications', { cookie: other.cookie });
  assert.equal(otherList.status, 200);
  assert.equal(otherList.data.applications.length, 0);
  assert.equal((await h.call('/api/platform/admin/partnership-applications', { cookie: user.cookie })).status, 403);

  const admin = await signup(h, 'superadmin@example.test');
  h.sql.prepare("UPDATE staging_users SET role='super_admin' WHERE email=?1").run('superadmin@example.test');
  const queue = await h.call('/api/platform/admin/partnership-applications', { cookie: admin.cookie });
  assert.equal(queue.status, 200);
  assert.equal(queue.data.applications.length, 1);

  const id = submitted.data.application.id;
  const decision = await h.call('/api/platform/admin/partnership-applications/' + id + '/status', {
    method: 'POST',
    cookie: admin.cookie,
    body: { status: 'needs_information', admin_note: 'يرجى استكمال تفاصيل نطاق التعاون.' }
  });
  assert.equal(decision.status, 200);
  const updated = await h.call('/api/platform/partnership-applications', { cookie: user.cookie });
  assert.equal(updated.data.applications[0].status, 'needs_information');
  assert.equal(updated.data.applications[0].adminNote, 'يرجى استكمال تفاصيل نطاق التعاون.');

  const approved = await h.call('/api/platform/admin/partnership-applications/' + id + '/status', {
    method: 'POST', cookie: admin.cookie, body: { status: 'approved', admin_note: 'Approved in synthetic test.' }
  });
  assert.equal(approved.status, 200);
  const locked = await h.call('/api/platform/admin/partnership-applications/' + id + '/status', {
    method: 'POST', cookie: admin.cookie, body: { status: 'rejected' }
  });
  assert.equal(locked.status, 409);

  const audit = h.sql.prepare("SELECT COUNT(*) AS n FROM staging_audit_events WHERE resource_type='partnership_application'").get();
  assert.equal(audit.n, 3);
});

test('partnership validation rejects invalid input and unauthenticated access', async () => {
  const h = harness();
  assert.equal((await h.call('/api/platform/partnership-applications')).status, 401);
  const user = await signup(h, 'validation-user@example.test');
  const invalidType = await h.call('/api/platform/partnership-applications', {
    method: 'POST', cookie: user.cookie,
    body: { attempt_id: 'partner-attempt-0003', partnership_type: 'unknown', applicant }
  });
  assert.equal(invalidType.status, 400);
  const invalidEmail = await h.call('/api/platform/partnership-applications', {
    method: 'POST', cookie: user.cookie,
    body: { attempt_id: 'partner-attempt-0004', partnership_type: 'business', applicant: { ...applicant, email: 'not-an-email' } }
  });
  assert.equal(invalidEmail.status, 400);
  const badWebsite = await h.call('/api/platform/partnership-applications', {
    method: 'POST', cookie: user.cookie,
    body: { attempt_id: 'partner-attempt-0005', partnership_type: 'business', applicant: { ...applicant, website: 'javascript:alert(1)' } }
  });
  assert.equal(badWebsite.status, 400);
});
