import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { EXPECTED_D1_NAME, EXPECTED_D1_UUID, EXPECTED_R2_BUCKET } from '../staging-worker/manifest-guard.mjs';

// This wrapper exists ONLY in this test's in-memory bundle. Never deploy it.
const source = `import worker from './staging-worker/entrypoint.mjs';
export default { async fetch(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname === '/__local_test_sql') {
    const input = await request.json();
    try { return Response.json(await env.DB.prepare(input.sql).bind(...(input.params || [])).all()); }
    catch (e) { return Response.json({error: String(e.message)}, {status: 500}); }
  }
  return worker.fetch(request, env, ctx);
}}`;

test('isolated workerd D1/R2: auth, roles, tenant boundaries, requests, files and credits', {timeout:90000}, async t => {
  const result=await build({stdin:{contents:source,resolveDir:process.cwd(),sourcefile:'local-test-entry.mjs'},bundle:true,format:'esm',platform:'browser',write:false,logLevel:'silent'});
  const mf=new Miniflare({modules:true,script:result.outputFiles[0].text,compatibilityDate:'2025-01-01',d1Databases:['DB'],r2Buckets:['ARTIFACTS'],bindings:{QABS_STAGING_ENV:'staging',QABS_STAGING_D1_UUID:EXPECTED_D1_UUID,QABS_STAGING_D1_NAME:EXPECTED_D1_NAME,QABS_STAGING_R2_BUCKET:EXPECTED_R2_BUCKET}});
  t.after(async()=>{await mf.dispose()});
  await mf.ready;
  const password=crypto.randomUUID()+crypto.randomUUID();
  async function call(path,{method='GET',cookie,body,headers={},rawBody=false}={}) {if(cookie)headers.cookie=cookie;if(method==='POST')headers.origin ||= 'https://synthetic.invalid';headers['cf-connecting-ip'] ||= '198.51.100.11';if(body && !rawBody && !(body instanceof FormData)){headers['content-type']='application/json';body=JSON.stringify(body)}let res=await mf.dispatchFetch('https://synthetic.invalid'+path,{method,headers,body});let raw=await res.text();let data;try{data=JSON.parse(raw)}catch{data=raw}return {status:res.status,data,cookie:res.headers.get('set-cookie')?.split(';')[0],headers:res.headers};}
  async function sql(statement,params=[]){const r=await call('/__local_test_sql',{method:'POST',body:{sql:statement,params}});assert.equal(r.status,200,JSON.stringify(r.data));return r.data.results;}
  async function signup(email,extra={}){let r=await call('/api/auth/signup',{method:'POST',body:{email,password,...extra}});assert.equal(r.status,200);return r;}
  async function me(cookie){let r=await call('/api/platform/me',{cookie});assert.equal(r.status,200);return r.data;}
  await t.test('unauthenticated request, registration, login, logout and role injection',async()=>{
    assert.equal((await call('/api/platform/me')).status,401);
    const a=await signup('a@example.test',{role:'super_admin'}); assert.equal(a.data.user.role,'customer');
    assert.equal((await call('/api/platform/admin/summary',{cookie:a.cookie})).status,403);
    assert.equal((await call('/api/auth/login',{method:'POST',body:{email:'a@example.test',password:'wrong-password-123'}})).status,401);
    let login=await call('/api/auth/login',{method:'POST',body:{email:'a@example.test',password}});assert.equal(login.status,200);assert.equal((await call('/api/auth/logout',{method:'POST',cookie:login.cookie})).status,200);assert.equal((await call('/api/platform/me',{cookie:login.cookie})).status,401);
  });
  const aLogin=await call('/api/auth/login',{method:'POST',body:{email:'a@example.test',password}});const A=aLogin.cookie;
  const b=await signup('b@example.test'),B=b.cookie;const am=await me(A),bm=await me(B);assert.notEqual(am.tenant.id,bm.tenant.id);
  await t.test('request replay, payload conflict and tenant isolation',async()=>{
    const p={kind:'formation',attempt_id:'synthetic-request-1',payload:{test:'A'}};
    const one=await call('/api/platform/requests',{method:'POST',cookie:A,body:p});assert.equal(one.status,201);assert.equal(one.data.request.status,'submitted');
    const two=await call('/api/platform/requests',{method:'POST',cookie:A,body:p});assert.equal(two.status,200);assert.equal(two.data.request.id,one.data.request.id);
    assert.equal((await call('/api/platform/requests',{method:'POST',cookie:A,body:{...p,payload:{test:'changed'}}})).status,409);
    const path='/api/platform/requests/'+one.data.request.id;
    assert.equal((await call(path,{cookie:B})).status,404);
    assert.equal((await call(path+'/messages',{method:'POST',cookie:B,body:{body:'synthetic'}})).status,404);
    assert.equal((await call(path+'/status',{method:'POST',cookie:B,body:{status:'approved'}})).status,403);
  });
  await t.test('admin and staff roles require authorization and stay tenant-scoped',async()=>{
    const admin=await signup('admin@example.test');const staff=await signup('staff@example.test');const support=await signup('support@example.test');const superAdmin=await signup('superadmin@example.test');
    await sql("UPDATE staging_users SET role='admin' WHERE id=?1",[admin.data.user.id]);let adm=await me(admin.cookie);
    await sql("UPDATE staging_users SET role='super_admin' WHERE id=?1",[superAdmin.data.user.id]);
    assert.equal((await call('/api/platform/admin/summary',{cookie:superAdmin.cookie})).status,200);
    for(const [email,role] of [['staff@example.test','operations'],['support@example.test','support']]) assert.equal((await call('/api/platform/staff',{method:'POST',cookie:admin.cookie,body:{email,role}})).status,201);
    assert.equal((await me(staff.cookie)).tenant.id,adm.tenant.id);assert.equal((await me(support.cookie)).tenant.id,adm.tenant.id);
    assert.equal((await call('/api/platform/admin/summary',{cookie:admin.cookie})).status,200);
    assert.equal((await call('/api/platform/admin/summary',{cookie:staff.cookie})).status,200);
    assert.equal((await call('/api/platform/admin/summary',{cookie:support.cookie})).status,403);
    assert.equal((await call('/api/platform/staff',{cookie:A})).status,403);
    assert.equal((await call('/api/platform/staff',{method:'POST',cookie:A,body:{email:'a@example.test',role:'admin'}})).status,403);
  });
  await t.test('R2 private document upload and cross-tenant download',async()=>{
    let form=new FormData();form.append('file',new Blob(['synthetic document'],{type:'text/plain'}),'test.txt');let encoded=new Request('https://synthetic.invalid/',{method:'POST',body:form});let up=await call('/api/platform/documents',{method:'POST',cookie:A,body:new Uint8Array(await encoded.arrayBuffer()),headers:{'content-type':encoded.headers.get('content-type')},rawBody:true});assert.equal(up.status,201);
    let p='/api/platform/documents/'+up.data.document.id,own=await call(p,{cookie:A});assert.equal(own.status,200);assert.equal(own.data,'synthetic document');assert.equal(own.headers.get('x-content-type-options'),'nosniff');assert.equal((await call(p,{cookie:B})).status,404);assert.equal((await call(p)).status,401);
  });
  await t.test('credits replay, conflict and concurrent insufficient balance',async()=>{
    let initial=await call('/api/platform/billing/summary',{cookie:A});assert.equal(initial.status,200);assert.equal(initial.data.credits.balanceUnits,1000);
    const charge=(key,units)=>call('/api/platform/ai/usage',{method:'POST',cookie:A,headers:{'Idempotency-Key':key},body:{units,model:'synthetic-model'}});
    let first=await charge('synthetic-ai-001',1);assert.equal(first.status,201);let again=await charge('synthetic-ai-001',1);assert.equal(again.status,200);assert.equal(again.data.replayed,true);assert.equal(again.data.usage.id,first.data.usage.id);assert.equal((await charge('synthetic-ai-001',2)).status,409);
    const duplicate=await Promise.all([charge('synthetic-ai-parallel',1),charge('synthetic-ai-parallel',1)]);assert.deepEqual(duplicate.map(x=>x.status).sort(),[200,201]);
    const pair=await Promise.all([charge('synthetic-ai-002',600),charge('synthetic-ai-003',600)]);assert.deepEqual(pair.map(x=>x.status).sort(),[201,402]);
    let b=await call('/api/platform/billing/summary',{cookie:A});assert.equal(b.data.credits.balanceUnits,398);let other=await call('/api/platform/billing/summary',{cookie:B});assert.equal(other.data.credits.balanceUnits,1000);
    const count=await sql('SELECT COUNT(*) AS n FROM staging_ai_usage WHERE tenant_id=?1',[am.tenant.id]);assert.equal(count[0].n,3);
    assert.equal((await charge('synthetic-ai-001',1)).status,200);
  });
  await t.test('failed AI audit rolls back balance, operation and usage in D1',async()=>{
    await sql("CREATE TRIGGER fail_ai_audit BEFORE INSERT ON staging_audit_events WHEN NEW.action='ai.usage.recorded' BEGIN SELECT RAISE(ABORT,'synthetic ai audit failure'); END");
    const attempt=await call('/api/platform/ai/usage',{method:'POST',cookie:A,headers:{'Idempotency-Key':'synthetic-ai-failure'},body:{units:1,model:'synthetic-model'}});assert.equal(attempt.status,500);
    let b=await call('/api/platform/billing/summary',{cookie:A});assert.equal(b.data.credits.balanceUnits,398);
    let op=await sql('SELECT COUNT(*) AS n FROM staging_credit_operations WHERE tenant_id=?1 AND request_key=?2',[am.tenant.id,'synthetic-ai-failure']);assert.equal(op[0].n,0);
    let usages=await sql('SELECT COUNT(*) AS n FROM staging_ai_usage WHERE tenant_id=?1',[am.tenant.id]);assert.equal(usages[0].n,3);
  });
  await t.test('failed request audit rolls back the D1 batch',async()=>{
    await sql("CREATE TRIGGER fail_request_audit BEFORE INSERT ON staging_audit_events WHEN NEW.action='request.created' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END");
    let r=await call('/api/platform/requests',{method:'POST',cookie:A,body:{kind:'formation',attempt_id:'synthetic-failure-1',payload:{test:true}}});assert.equal(r.status,500);
    let found=await sql('SELECT COUNT(*) AS n FROM staging_requests WHERE attempt_id=?1',['synthetic-failure-1']);assert.equal(found[0].n,0);
  });
});
