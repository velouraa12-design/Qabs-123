import { currentUser } from './auth.mjs';
import { ensureSchema, tenantFor } from './platform.mjs';

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS staging_partnership_applications (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES staging_tenants(id) ON DELETE CASCADE, applicant_user_id TEXT NOT NULL REFERENCES staging_users(id) ON DELETE RESTRICT, partnership_type TEXT NOT NULL, applicant_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','under_review','needs_information','approved','rejected')), admin_note TEXT, attempt_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (tenant_id, attempt_id))",
  "CREATE INDEX IF NOT EXISTS idx_staging_partnership_status_created ON staging_partnership_applications(status, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_staging_partnership_applicant ON staging_partnership_applications(applicant_user_id, created_at DESC)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_staging_partnership_one_active_per_user ON staging_partnership_applications(applicant_user_id) WHERE status IN ('new','under_review','needs_information')"
];

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const TYPES = new Set(['business', 'marketing', 'agent', 'technology', 'services', 'referral', 'corporate']);
const STATUSES = new Set(['under_review', 'needs_information', 'approved', 'rejected']);

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
function clean(value, max, required = false) {
  if (typeof value !== 'string') return required ? null : '';
  const result = value.trim();
  if (result.length > max || (required && !result)) return null;
  return result;
}
function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}
async function readBody(request) {
  try {
    const value = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}
async function ensurePartnershipSchema(db) {
  await ensureSchema(db);
  for (const statement of SCHEMA) await db.prepare(statement).run();
}
function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function applicantFrom(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const applicant = {
    full_name: clean(input.full_name, 160, true),
    email: (clean(input.email, 254, true) || '').toLowerCase(),
    phone: clean(input.phone, 40, true),
    country: clean(input.country, 100, true),
    city: clean(input.city, 100, true),
    company_name: clean(input.company_name, 180),
    website: clean(input.website, 300),
    activity: clean(input.activity, 160, true),
    experience: clean(input.experience, 2000, true),
    audience: clean(input.audience, 500),
    proposal: clean(input.proposal, 2000, true),
    about: clean(input.about, 3000, true)
  };
  if (Object.values(applicant).some(value => value === null)) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicant.email)) return null;
  if (applicant.website && !/^https?:\/\//i.test(applicant.website)) return null;
  return applicant;
}
function publicApplication(row, includeAdmin = false) {
  let applicant = {};
  try { applicant = JSON.parse(row.applicant_json); } catch { applicant = {}; }
  return {
    id: row.id,
    applicationNumber: row.id,
    partnershipType: row.partnership_type,
    applicant,
    status: row.status,
    ...(includeAdmin ? { adminNote: row.admin_note || '' } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
function page(title, body, script = '') {
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
:root{--navy:#081b36;--gold:#c99b3b;--ink:#172338;--muted:#657286;--line:#e5eaf0;--paper:#f5f7fa}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Arial,"Noto Sans Arabic",sans-serif}.top{background:var(--navy);color:white;padding:18px clamp(18px,5vw,64px);display:flex;align-items:center;justify-content:space-between}.brand{font-weight:800}.top a{color:#f1d99e;text-decoration:none}.wrap{max-width:1040px;margin:38px auto;padding:0 18px}.hero,.panel{background:white;border:1px solid var(--line);border-radius:20px;padding:clamp(20px,4vw,36px);box-shadow:0 16px 45px #081b360b}.eyebrow{color:#9b7425;font-size:12px;font-weight:800;letter-spacing:.06em}.hero h1{font-size:clamp(28px,5vw,42px);color:var(--navy);margin:10px 0}.hero p,.muted{color:var(--muted);line-height:1.8}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}.panel{margin-top:18px}.panel h2{margin-top:0;color:var(--navy)}label{display:block;font-size:14px;font-weight:700;margin:14px 0 7px}input,select,textarea{width:100%;padding:12px 13px;border:1px solid #ccd5e1;border-radius:10px;font:inherit;background:white;color:var(--ink)}textarea{min-height:105px;resize:vertical}button,.button{display:inline-block;border:0;border-radius:11px;padding:13px 20px;background:var(--navy);color:white;font:inherit;font-weight:700;text-decoration:none;cursor:pointer;margin-top:18px}button:disabled{opacity:.6;cursor:wait}.notice{display:none;padding:12px 14px;border-radius:10px;margin:14px 0;background:#fff4d8;color:#775512;line-height:1.6}.notice.show{display:block}.notice.error{background:#fff0f0;color:#9b2525}.notice.ok{background:#eaf8ef;color:#17623a}.card{border:1px solid var(--line);border-radius:14px;padding:16px;margin:12px 0;background:#fff}.badge{display:inline-block;border-radius:999px;padding:5px 10px;background:#fff4d8;color:#76570f;font-size:12px;font-weight:700}.row{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}.admin-note{width:100%;min-height:70px}.footer{padding:30px;text-align:center;color:var(--muted);font-size:12px}@media(max-width:600px){.top{gap:10px}.wrap{margin:20px auto}.row button{width:100%}}
</style></head><body>${body}${script}</body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'", 'x-content-type-options': 'nosniff' } });
}
function statusLabel(status) {
  return ({ new: 'جديد', under_review: 'قيد المراجعة', needs_information: 'بانتظار استكمال البيانات', approved: 'مقبول', rejected: 'مرفوض' })[status] || status;
}
function applicantPage(user, applications) {
  const list = applications.map(row => {
    const app = publicApplication(row);
    return `<article class="card"><div class="row"><strong>طلب ${escapeHtml(app.applicationNumber)}</strong><span class="badge">${statusLabel(app.status)}</span></div><p class="muted">نوع الشراكة: ${escapeHtml(app.partnershipType)} · تاريخ التقديم: ${escapeHtml(app.createdAt)}</p>${app.adminNote ? `<p>ملاحظة الإدارة: ${escapeHtml(app.adminNote)}</p>` : ''}</article>`;
  }).join('') || '<p class="muted">لا توجد طلبات شراكة حتى الآن.</p>';
  const body = `<header class="top"><div class="brand">QABS | قبس — برنامج الشراكة</div><a href="/workspace">مساحة العمل</a></header><main class="wrap"><section class="hero"><div class="eyebrow">QABS PARTNERSHIP PROGRAM</div><h1>كن شريكاً مع قبس</h1><p>قدّم طلبك للانضمام إلى شبكة شركاء قبس. ستراجع الإدارة الطلب وتتواصل معك عند الحاجة. إرسال الطلب لا يعني الاعتماد أو ضمان قبول الشراكة.</p><span class="badge">الحساب: ${escapeHtml(user.email)}</span></section><section class="panel"><h2>طلب شراكة جديد</h2><p class="muted">أكمل البيانات الأساسية. لا ترفق مستندات حساسة في هذه المرحلة.</p><div id="notice" class="notice" role="status" aria-live="polite"></div><form id="apply"><div class="grid"><div><label for="full_name">الاسم الكامل *</label><input id="full_name" name="full_name" maxlength="160" required></div><div><label for="email">البريد الإلكتروني *</label><input id="email" name="email" type="email" maxlength="254" value="${escapeHtml(user.email)}" required></div><div><label for="phone">رقم الهاتف وواتساب *</label><input id="phone" name="phone" maxlength="40" required></div><div><label for="country">الدولة *</label><input id="country" name="country" maxlength="100" required></div><div><label for="city">المدينة *</label><input id="city" name="city" maxlength="100" required></div><div><label for="company_name">اسم الشركة (اختياري)</label><input id="company_name" name="company_name" maxlength="180"></div><div><label for="website">الموقع الإلكتروني (اختياري)</label><input id="website" name="website" type="url" maxlength="300"></div><div><label for="partnership_type">نوع الشراكة *</label><select id="partnership_type" name="partnership_type" required><option value="">اختر نوع الشراكة</option><option value="business">شريك أعمال</option><option value="marketing">شريك تسويقي</option><option value="agent">وكيل معتمد</option><option value="technology">شريك تقني</option><option value="services">شريك خدمات</option><option value="referral">شريك إحالة وعمولات</option><option value="corporate">شراكة شركات ومؤسسات</option></select></div></div><label for="activity">مجال النشاط *</label><input id="activity" name="activity" maxlength="160" required><label for="experience">الخبرة السابقة *</label><textarea id="experience" name="experience" maxlength="2000" required></textarea><label for="audience">حجم الجمهور أو قاعدة العملاء</label><textarea id="audience" name="audience" maxlength="500"></textarea><label for="proposal">طريقة التعاون المقترحة *</label><textarea id="proposal" name="proposal" maxlength="2000" required></textarea><label for="about">نبذة عنك أو عن الشركة *</label><textarea id="about" name="about" maxlength="3000" required></textarea><button id="submit" type="submit">إرسال طلب الشراكة</button></form></section><section class="panel"><h2>طلباتي السابقة</h2><div id="applications">${list}</div></section><div class="footer">© QABS | قبس — طلبات الشراكة تخضع لمراجعة واعتماد الإدارة.</div></main>`;
  const script = `<script>(()=>{const form=document.querySelector('#apply'),notice=document.querySelector('#notice'),submit=document.querySelector('#submit'),list=document.querySelector('#applications');const msg=(text,kind='')=>{notice.textContent=text;notice.className='notice show '+kind};const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));async function load(){const r=await fetch('/api/platform/partnership-applications');const b=await r.json();if(!r.ok)throw new Error(b.error||'LOAD_FAILED');list.innerHTML=(b.applications||[]).map(a=>'<article class="card"><div class="row"><strong>طلب '+esc(a.applicationNumber)+'</strong><span class="badge">'+esc(({new:'جديد',under_review:'قيد المراجعة',needs_information:'بانتظار استكمال البيانات',approved:'مقبول',rejected:'مرفوض'})[a.status]||a.status)+'</span></div><p class="muted">نوع الشراكة: '+esc(a.partnershipType)+' · '+esc(a.createdAt)+'</p>'+(a.adminNote?'<p>ملاحظة الإدارة: '+esc(a.adminNote)+'</p>':'')+'</article>').join('')||'<p class="muted">لا توجد طلبات شراكة حتى الآن.</p>'}form.addEventListener('submit',async e=>{e.preventDefault();if(!form.reportValidity())return;submit.disabled=true;msg('جارٍ إرسال الطلب...');const f=new FormData(form),applicant={};for(const k of ['full_name','email','phone','country','city','company_name','website','activity','experience','audience','proposal','about'])applicant[k]=String(f.get(k)||'');try{const r=await fetch('/api/platform/partnership-applications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({attempt_id:crypto.randomUUID(),partnership_type:f.get('partnership_type'),applicant})});const b=await r.json();if(!r.ok)throw new Error(b.error||'SUBMISSION_FAILED');msg('تم استلام طلبك. رقم الطلب: '+b.application.applicationNumber+' — الحالة: جديد.','ok');form.reset();form.email.value='${escapeHtml(user.email)}';await load()}catch(err){const errors={ACTIVE_APPLICATION_EXISTS:'لديك طلب شراكة نشط بالفعل. يمكنك متابعة حالته أدناه.',INVALID_APPLICATION:'تحقق من جميع الحقول المطلوبة.',AUTH_REQUIRED:'انتهت الجلسة. سجّل الدخول ثم أعد المحاولة.'};msg(errors[err.message]||'تعذر إرسال الطلب الآن. حاول لاحقاً.','error')}finally{submit.disabled=false}});load().catch(()=>msg('تعذر تحميل الطلبات. حدّث الصفحة أو سجّل الدخول مجدداً.','error'))})();</script>`;
  return page('طلب شراكة — قبس', body, script);
}
function adminPage(applications) {
  const rows = applications.map(row => {
    const app = publicApplication(row, true);
    return `<article class="card" data-id="${escapeHtml(app.id)}"><div class="row"><strong>${escapeHtml(app.applicant.full_name)} — ${escapeHtml(app.partnershipType)}</strong><span class="badge">${statusLabel(app.status)}</span></div><p class="muted">${escapeHtml(app.applicant.email)} · ${escapeHtml(app.applicant.phone)} · ${escapeHtml(app.applicant.country)}</p><p>${escapeHtml(app.applicant.proposal)}</p><label>حالة الطلب<select class="status"><option value="under_review" ${app.status==='under_review'?'selected':''}>قيد المراجعة</option><option value="needs_information" ${app.status==='needs_information'?'selected':''}>بانتظار استكمال البيانات</option><option value="approved" ${app.status==='approved'?'selected':''}>مقبول</option><option value="rejected" ${app.status==='rejected'?'selected':''}>مرفوض</option></select></label><label>ملاحظة الإدارة<textarea class="admin-note">${escapeHtml(app.adminNote)}</textarea></label><button class="save" type="button">حفظ القرار</button><p class="notice" role="status" aria-live="polite"></p></article>`;
  }).join('') || '<p class="muted">لا توجد طلبات حتى الآن.</p>';
  const body = `<header class="top"><div class="brand">QABS | إدارة طلبات الشراكة</div><a href="/workspace">مساحة العمل</a></header><main class="wrap"><section class="hero"><div class="eyebrow">SUPER ADMIN</div><h1>إدارة طلبات الشراكة</h1><p>هذه الصفحة متاحة لدور Super Admin فقط. كل قرار يسجل في سجل التدقيق.</p></section><section class="panel"><div id="applications">${rows}</div></section></main>`;
  const script = `<script>(()=>{document.querySelectorAll('.save').forEach(button=>button.addEventListener('click',async()=>{const card=button.closest('[data-id]'),notice=card.querySelector('.notice');button.disabled=true;notice.textContent='جارٍ الحفظ...';notice.className='notice show';try{const r=await fetch('/api/platform/admin/partnership-applications/'+encodeURIComponent(card.dataset.id)+'/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({status:card.querySelector('.status').value,admin_note:card.querySelector('.admin-note').value})});const b=await r.json();if(!r.ok)throw new Error(b.error||'SAVE_FAILED');notice.textContent='تم تحديث حالة الطلب.';notice.className='notice show ok';}catch{notice.textContent='تعذر حفظ القرار.';notice.className='notice show error';}finally{button.disabled=false}}))})();</script>`;
  return page('إدارة الشراكات — قبس', body, script);
}

export async function partnershipsRoute(request, env, url) {
  const isPage = url.pathname === '/partnerships' || url.pathname === '/partnerships/admin';
  const isApi = url.pathname.startsWith('/api/platform/partnership-applications') || url.pathname.startsWith('/api/platform/admin/partnership-applications');
  if (!isPage && !isApi) return null;
  if (!sameOrigin(request)) return json({ error: 'ORIGIN_NOT_ALLOWED' }, 403);
  if (!env.DB) return json({ error: 'DATABASE_UNAVAILABLE' }, 503);
  try {
    const user = await currentUser(env.DB, request);
    if (!user) return isPage ? new Response(null, { status: 302, headers: { location: '/login?portal=partnerships', 'cache-control': 'no-store' } }) : json({ error: 'AUTH_REQUIRED' }, 401);
    await ensurePartnershipSchema(env.DB);
    const membership = await tenantFor(env.DB, user);
    if (!membership) return json({ error: 'TENANT_UNAVAILABLE' }, 503);
    const admin = user.role === 'super_admin';

    if (isPage && request.method === 'GET' && url.pathname === '/partnerships') {
      const result = await env.DB.prepare('SELECT * FROM staging_partnership_applications WHERE applicant_user_id = ?1 ORDER BY created_at DESC LIMIT 50').bind(user.id).all();
      return applicantPage(user, result.results || []);
    }
    if (isPage && request.method === 'GET' && url.pathname === '/partnerships/admin') {
      if (!admin) return json({ error: 'FORBIDDEN' }, 403);
      const result = await env.DB.prepare('SELECT * FROM staging_partnership_applications ORDER BY created_at DESC LIMIT 200').all();
      return adminPage(result.results || []);
    }
    if (request.method === 'GET' && url.pathname === '/api/platform/partnership-applications') {
      const result = await env.DB.prepare('SELECT * FROM staging_partnership_applications WHERE applicant_user_id = ?1 ORDER BY created_at DESC LIMIT 50').bind(user.id).all();
      return json({ applications: (result.results || []).map(publicApplication) });
    }
    if (request.method === 'POST' && url.pathname === '/api/platform/partnership-applications') {
      const input = await readBody(request);
      const attemptId = input && input.attempt_id;
      if (typeof attemptId !== 'string' || !/^[A-Za-z0-9._:-]{8,120}$/.test(attemptId) || !TYPES.has(input?.partnership_type)) return json({ error: 'INVALID_APPLICATION' }, 400);
      const applicant = applicantFrom(input.applicant);
      if (!applicant) return json({ error: 'INVALID_APPLICATION' }, 400);
      const applicationId = id('par');
      const timestamp = now();
      const applicantJson = JSON.stringify(applicant);
      const results = await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO staging_partnership_applications (id, tenant_id, applicant_user_id, partnership_type, applicant_json, status, attempt_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 'new', ?6, ?7, ?7)").bind(applicationId, membership.tenant_id, user.id, input.partnership_type, applicantJson, attemptId, timestamp),
        env.DB.prepare("INSERT INTO staging_audit_events (id, tenant_id, actor_id, action, resource_type, resource_id, metadata_json, created_at) SELECT ?1, ?2, ?3, 'partnership.application.created', 'partnership_application', ?4, ?5, ?6 WHERE EXISTS (SELECT 1 FROM staging_partnership_applications WHERE id = ?4)").bind(id('aud'), membership.tenant_id, user.id, applicationId, JSON.stringify({ partnership_type: input.partnership_type }), timestamp),
        env.DB.prepare('SELECT * FROM staging_partnership_applications WHERE tenant_id = ?1 AND attempt_id = ?2').bind(membership.tenant_id, attemptId)
      ]);
      const row = results[2].results?.[0];
      if (!row) return json({ error: 'ACTIVE_APPLICATION_EXISTS' }, 409);
      if (row.applicant_user_id !== user.id || row.applicant_json !== applicantJson || row.partnership_type !== input.partnership_type) return json({ error: 'IDEMPOTENCY_CONFLICT' }, 409);
      return json({ application: publicApplication(row), replayed: row.id !== applicationId }, row.id === applicationId ? 201 : 200);
    }
    if (request.method === 'GET' && url.pathname === '/api/platform/admin/partnership-applications') {
      if (!admin) return json({ error: 'FORBIDDEN' }, 403);
      const result = await env.DB.prepare('SELECT * FROM staging_partnership_applications ORDER BY created_at DESC LIMIT 200').all();
      return json({ applications: (result.results || []).map(publicApplication) });
    }
    const statusMatch = url.pathname.match(/^\/api\/platform\/admin\/partnership-applications\/([^/]+)\/status$/);
    if (request.method === 'POST' && statusMatch) {
      if (!admin) return json({ error: 'FORBIDDEN' }, 403);
      const input = await readBody(request);
      if (!STATUSES.has(input?.status)) return json({ error: 'INVALID_STATUS' }, 400);
      const note = clean(input.admin_note || '', 2000);
      if (note === null) return json({ error: 'INVALID_NOTE' }, 400);
      const existing = await env.DB.prepare('SELECT id, tenant_id, applicant_user_id, status FROM staging_partnership_applications WHERE id = ?1').bind(statusMatch[1]).first();
      if (!existing) return json({ error: 'NOT_FOUND' }, 404);
      if (existing.status === 'approved' && input.status !== 'approved') return json({ error: 'APPROVED_APPLICATION_LOCKED' }, 409);
      const updatedAt = now();
      const results = await env.DB.batch([
        env.DB.prepare('UPDATE staging_partnership_applications SET status = ?1, admin_note = ?2, updated_at = ?3 WHERE id = ?4').bind(input.status, note, updatedAt, existing.id),
        env.DB.prepare("INSERT INTO staging_audit_events (id, tenant_id, actor_id, action, resource_type, resource_id, metadata_json, created_at) SELECT ?1, tenant_id, ?2, 'partnership.application.status_updated', 'partnership_application', id, ?3, ?4 FROM staging_partnership_applications WHERE id = ?5").bind(id('aud'), user.id, JSON.stringify({ status: input.status }), updatedAt, existing.id)
      ]);
      return json({ ok: true, applicationId: existing.id, status: input.status, updatedAt });
    }
    return json({ error: 'NOT_FOUND' }, 404);
  } catch {
    return json({ error: 'PARTNERSHIP_TEMPORARILY_UNAVAILABLE' }, 500);
  }
}
