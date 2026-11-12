import {
  currentUser,
  logIn,
  logOut,
  signUp,
  sessionCookie
} from './auth.mjs';
import { platformRoute } from './platform.mjs';
import { commerceRoute } from './commerce.mjs';
import {
  EXPECTED_D1_NAME,
  EXPECTED_D1_UUID,
  EXPECTED_R2_BUCKET,
  EXPECTED_WORKER_NAME,
  assertIsolatedRuntime
} from './manifest-guard.mjs';

export function diagnosticPayload() {
  return {
    status: 'ok', environment: 'staging', worker: EXPECTED_WORKER_NAME,
    bindings: { DB: 'configured', ARTIFACTS: 'configured' },
    data: 'not-read', secrets: 'not-read', routes: 'none', serviceBindings: 'none'
  };
}

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders } });
}

function html(body, status = 200, extraHeaders = {}) {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'", 'x-content-type-options': 'nosniff', ...extraHeaders } });
}

function redirect(location, headers = {}) {
  return new Response(null, { status: 302, headers: { location, 'cache-control': 'no-store', ...headers } });
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\"', '&quot;').replaceAll("'", '&#39;');
}

function isSameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

async function readJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : {};
  } catch { return {}; }
}

function pageShell(title, body, script = '') {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>
:root{color-scheme:light;--navy:#081b36;--navy2:#102a4b;--gold:#c99b3b;--ink:#142033;--muted:#637083;--line:#e7ebf0;--paper:#f6f8fb}*{box-sizing:border-box}body{margin:0;font-family:Arial,"Noto Sans Arabic",sans-serif;color:var(--ink);background:var(--paper)}a{color:inherit}.top{height:66px;background:var(--navy);color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 clamp(18px,5vw,72px)}.brand{display:flex;gap:10px;align-items:center;font-weight:700}.mark{width:34px;height:34px;border:2px solid var(--gold);border-radius:11px;display:grid;place-items:center;color:var(--gold)}.top a{text-decoration:none;color:#dfe8f5;font-size:14px}.wrap{max-width:1080px;margin:0 auto;padding:clamp(38px,8vw,88px) 20px}.card{max-width:520px;margin:0 auto;background:#fff;border:1px solid var(--line);border-radius:24px;padding:clamp(24px,5vw,46px);box-shadow:0 20px 60px #0b1e3a12}.eyebrow{color:var(--gold);font-weight:700;font-size:13px;letter-spacing:.04em}.badge{display:inline-block;background:#fff3cf;color:#76540d;border:1px solid #e6c46a;border-radius:999px;padding:6px 11px;font-size:12px;font-weight:700;margin:8px 0}.hero h1{color:var(--navy);font-size:clamp(29px,5vw,46px);line-height:1.2;margin:12px 0}.hero p{color:var(--muted);line-height:1.8}.label{display:block;color:var(--navy);font-size:14px;font-weight:700;margin:22px 0 8px}input{width:100%;border:1px solid #cfd7e2;border-radius:12px;padding:14px;font-size:16px;direction:ltr;text-align:left}input:focus{outline:3px solid #c99b3b44;border-color:var(--gold)}button{width:100%;border:0;border-radius:12px;padding:14px;font-size:16px;font-weight:700;cursor:pointer;background:var(--navy);color:white;margin-top:22px}button.secondary{background:#eef2f7;color:var(--navy)}button:disabled{opacity:.65;cursor:wait}.notice{border-radius:12px;padding:12px 14px;margin:16px 0;line-height:1.6;font-size:14px}.info{background:#fff8e7;color:#725419}.error{background:#fff0f0;color:#9f2727}.ok{background:#edf9f1;color:#17653a}.meta{color:var(--muted);font-size:13px;line-height:1.7}.links{display:flex;justify-content:space-between;gap:12px;margin-top:20px;font-size:13px;color:var(--muted)}.links a{text-decoration:none}.workspace{max-width:900px;margin:auto}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:16px;margin-top:24px}.tile{background:#fff;border:1px solid var(--line);border-radius:18px;padding:20px}.tile h2{font-size:17px;color:var(--navy);margin-top:0}.tile p{color:var(--muted);line-height:1.7;font-size:14px}.row{display:flex;align-items:center;justify-content:space-between;gap:12px}.row button{width:auto;margin:0;padding:10px 16px;font-size:14px}
</style></head><body>${body}${script}</body></html>`;
}

function loginPage() {
  const body = `<header class="top"><div class="brand"><span class="mark">Q</span><span>قبس الرقمية</span></div><a href="/">الصفحة الرئيسية</a></header><main class="wrap"><section class="card"><div class="hero"><div class="eyebrow">QABS DIGITAL PORTAL</div><h1>مرحبًا بعودتك</h1><p>سجّل الدخول إلى مساحة أعمالك لمتابعة الخدمات والطلبات بطريقة أوضح.</p></div><div id="notice" class="notice info">بيئة Staging للاختبار فقط — لا تستخدم بيانات حساسة.</div><form id="login"><label class="label" for="email">البريد الإلكتروني</label><input id="email" name="email" type="email" autocomplete="username" required><label class="label" for="password">كلمة المرور</label><input id="password" name="password" type="password" autocomplete="current-password" minlength="12" required><button id="submit" type="submit">تسجيل الدخول</button></form><button id="signup" class="secondary" type="button">إنشاء حساب تجريبي</button><div class="links"><a href="/">العودة للرئيسية</a><span>جلسة آمنة مؤقتة</span></div><p class="meta">لا يتم تفعيل الدفع أو تنفيذ الطلبات من خلال هذه النسخة. الحسابات هنا مخصصة لاختبار المصادقة وعزل الصلاحيات.</p></section></main>`;
  const script = `<script>(()=>{const form=document.querySelector('#login'),notice=document.querySelector('#notice'),submit=document.querySelector('#submit'),signup=document.querySelector('#signup');const message=(text,kind='info')=>{notice.textContent=text;notice.className='notice '+kind};async function post(path,payload){const r=await window['fetch'](path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});let b={};try{b=await r.json()}catch{}if(!r.ok)throw new Error(b.error||'تعذر إتمام العملية');return b}form.addEventListener('submit',async e=>{e.preventDefault();submit.disabled=true;message('جارٍ التحقق من بيانات الدخول...');try{await post('/api/auth/login',{email:form.email.value,password:form.password.value});location.href='/workspace'}catch(err){message('البريد أو كلمة المرور غير صحيحة.', 'error')}finally{submit.disabled=false}});signup.addEventListener('click',async()=>{if(!form.reportValidity()){message('أدخل بريدًا صحيحًا وكلمة مرور من ١٢ حرفًا على الأقل.','error');return}const email=form.email.value,password=form.password.value;signup.disabled=true;try{await post('/api/auth/signup',{email,password});location.href='/workspace'}catch(err){const messages={ACCOUNT_EXISTS:'الحساب موجود؛ استخدم تسجيل الدخول.',INVALID_EMAIL:'أدخل بريدًا إلكترونيًا صحيحًا.',INVALID_PASSWORD:'كلمة المرور يجب أن تكون ١٢ حرفًا على الأقل.'};message(messages[err.message]||'تعذر إنشاء الحساب التجريبي.','error')}finally{signup.disabled=false}})})();</script>`;
  return pageShell('تسجيل الدخول إلى قبس', body, script);
}

function workspacePage(user) {
  const body = `<header class="top"><div class="brand"><span class="mark">Q</span><span>مساحة عمل قبس</span></div><button id="logout" type="button" style="width:auto;margin:0;padding:10px 16px;background:#fff;color:#081b36">تسجيل الخروج</button></header><main class="wrap workspace"><div class="eyebrow">حساب تجريبي مصادق</div><h1 style="color:#081b36">مرحبًا ${escapeHtml(user.email)}</h1><p class="meta">الدور الحالي: ${escapeHtml(user.role)} · هذه مساحة Staging معزولة.</p><div class="grid"><article class="tile"><span class="badge">غير مفعّل</span><h2>طلبات الخدمات</h2><p>ستظهر هنا الطلبات بعد ربط دورة الطلبات الآمنة.</p></article><article class="tile"><span class="badge">غير مفعّل</span><h2>المستندات</h2><p>الرفع غير مفعّل حتى يتم اعتماد تخزين خاص وروابط مؤقتة.</p></article><article class="tile"><span class="badge">غير مفعّل</span><h2>المتاجر</h2><p>إنشاء المتاجر والدفع غير مفعّلين في هذه النسخة.</p></article></div></main>`;
  const script = `<script>document.querySelector('#logout').addEventListener('click',async()=>{await window['fetch']('/api/auth/logout',{method:'POST'});location.href='/login?portal=workspace'});</script>`;
  return pageShell('مساحة عمل قبس', body, script);
}

const worker = {
  async fetch(request, env) {
    try { assertIsolatedRuntime(env); } catch (error) { return json({ status: 'blocked', error: error.message }, 500); }
    const url = new URL(request.url);
    if (request.method === 'GET' && (url.pathname === '/health' || url.pathname === '/diagnostic')) return json(diagnosticPayload());
    if (request.method === 'GET' && url.pathname === '/') return html(pageShell('قبس الرقمية — Staging', `<header class="top"><div class="brand"><span class="mark">Q</span><span>قبس الرقمية</span></div><a href="/login?portal=workspace">تسجيل الدخول</a></header><main class="wrap"><section class="card"><div class="eyebrow">QABS STAGING</div><span class="badge">تجريبي — غير مفعّل للإنتاج</span><h1 style="color:#081b36">بوابة قبس الرقمية</h1><p>نسخة اختبار معزولة للمصادقة والرحلة الأساسية. لا معاملات مالية أو بيانات إنتاج.</p><a href="/login?portal=workspace"><button type="button">فتح صفحة الدخول</button></a><div class="links"><a href="/health">Health</a><a href="/control-center/">مركز التحكم</a></div></section></main>`));
    if (request.method === 'GET' && url.pathname === '/login') return html(loginPage());
    if (request.method === 'GET' && url.pathname === '/workspace') { const user = await currentUser(env.DB, request); return user ? html(workspacePage(user)) : redirect('/login?portal=workspace'); }
    if (url.pathname.startsWith('/api/auth/')) {
      if (!isSameOrigin(request)) return json({ error: 'ORIGIN_NOT_ALLOWED' }, 403);
      try {
        if (request.method === 'POST' && url.pathname === '/api/auth/login') { const body = await readJson(request); const result = await logIn(env.DB, body.email, body.password); return json(result.body, result.status, result.cookie ? { 'set-cookie': result.cookie } : {}); }
        if (request.method === 'POST' && url.pathname === '/api/auth/signup') { const body = await readJson(request); const result = await signUp(env.DB, body.email, body.password); return json(result.body, result.status, result.cookie ? { 'set-cookie': result.cookie } : {}); }
        if (request.method === 'POST' && url.pathname === '/api/auth/logout') { const result = await logOut(env.DB, request); return json(result.body, result.status, { 'set-cookie': result.cookie }); }
        if (request.method === 'GET' && url.pathname === '/api/auth/me') return json({ user: await currentUser(env.DB, request) });
      } catch {
        return json({ error: 'AUTH_TEMPORARILY_UNAVAILABLE' }, 500);
      }
    }
    if (request.method === 'GET' && (url.pathname === '/control-center/' || url.pathname === '/control-center')) return html(pageShell('مركز تحكم قبس', `<header class="top"><div class="brand"><span class="mark">Q</span><span>مركز تحكم قبس</span></div><a href="/">بوابة Staging</a></header><main class="wrap"><section class="card"><div class="eyebrow">PUBLIC STAGING PREVIEW</div><span class="badge">معاينة عامة — بدون تسجيل دخول</span><h1 style="color:#081b36">مركز التحكم</h1><p>هذه واجهة معاينة عامة للـStaging فقط. لا توجد عمليات إدارية أو بيانات عملاء متصلة، ولا يُسمح باستخدامها للإنتاج.</p><div class="links"><a href="/health">Health</a><a href="/recovered-formation/studio/formation">تأسيس الشركات</a></div></section></main>`));
    const commerceResult = await commerceRoute(request, env, url);
    if (commerceResult) return commerceResult;
    const platformResult = await platformRoute(request, env, url);
    if (platformResult) return platformResult;
    return new Response('Not Found', { status: 404, headers: { 'cache-control': 'no-store' } });
  }
};
export default worker;
