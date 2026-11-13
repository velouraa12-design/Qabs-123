import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from '../staging-worker/entrypoint.mjs';
import { EXPECTED_D1_NAME, EXPECTED_D1_UUID, EXPECTED_R2_BUCKET } from '../staging-worker/manifest-guard.mjs';

// In-memory SQLite and R2 stand-ins: no Cloudflare account, external calls or real data.
function harness() {
  const sql = new DatabaseSync(':memory:'); sql.exec('PRAGMA foreign_keys=ON');
  function statement(q, args = []) { return {
    bind(...next) { return statement(q, next); },
    async run() { const r = sql.prepare(q).run(...args); return {success:true,meta:{changes:Number(r.changes)}}; },
    async first() { return sql.prepare(q).get(...args) ?? null; },
    async all() { return {success:true,results:sql.prepare(q).all(...args)}; },
    q,args
  }; }
  const db={ prepare(q){return statement(q)}, async batch(items){ sql.exec('BEGIN'); try {const out=[];for(const i of items){const q=sql.prepare(i.q);if(/^\s*SELECT/i.test(i.q))out.push({results:q.all(...i.args)});else{const r=q.run(...i.args);out.push({success:true,meta:{changes:Number(r.changes)}})}}sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;} } };
  const objects=new Map(); const bucket={async put(k,v){objects.set(k,Buffer.from(v));},async get(k){let v=objects.get(k);return v?{body:new Blob([v]).stream()}:null;}};
  const env={DB:db,ARTIFACTS:bucket,QABS_STAGING_ENV:'staging',QABS_STAGING_D1_UUID:EXPECTED_D1_UUID,QABS_STAGING_D1_NAME:EXPECTED_D1_NAME,QABS_STAGING_R2_BUCKET:EXPECTED_R2_BUCKET};
  async function call(path,{method='GET',cookie,body,origin,headers={}}={}) {if(cookie)headers.cookie=cookie;if(origin)headers.origin=origin;if(body && !(body instanceof FormData)){headers['content-type']='application/json';body=JSON.stringify(body)}const r=await worker.fetch(new Request('https://staging.test'+path,{method,headers,body}),env);const raw=await r.text();let data;try{data=JSON.parse(raw)}catch{data=raw}return {status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0],headers:r.headers};}
  return {sql,db,env,call,objects};
}

const password=crypto.randomUUID()+crypto.randomUUID();
async function signup(h,email,extra={}) {let r=await h.call('/api/auth/signup',{method:'POST',body:{email,password,...extra}});assert.equal(r.status,200);return r;}
async function me(h,cookie){let r=await h.call('/api/platform/me',{cookie});assert.equal(r.status,200);return r.data;}

test('signup ignores role injection, sessions work and logout revokes',async()=>{const h=harness();const a=await signup(h,'customer-a@example.test',{role:'super_admin'});assert.equal(a.data.user.role,'customer');assert.equal((await h.call('/api/platform/admin/summary',{cookie:a.cookie})).status,403);assert.equal((await h.call('/api/auth/login',{method:'POST',body:{email:'customer-a@example.test',password:'bad-password-000'}})).status,401);const login=await h.call('/api/auth/login',{method:'POST',body:{email:'customer-a@example.test',password}});assert.equal(login.status,200);assert.equal((await h.call('/api/auth/me',{cookie:login.cookie})).data.user.role,'customer');assert.equal((await h.call('/api/auth/logout',{method:'POST',cookie:login.cookie})).status,200);assert.equal((await h.call('/api/platform/me',{cookie:login.cookie})).status,401);assert.equal((await h.call('/api/platform/me')).status,401)});

test('requests reject cross-tenant access and duplicate keys with changed content',async()=>{const h=harness();const a=await signup(h,'a@example.test'),b=await signup(h,'b@example.test');await me(h,a.cookie);await me(h,b.cookie);const create={kind:'formation',attempt_id:'synthetic-attempt-1',payload:{name:'Synthetic'}};const first=await h.call('/api/platform/requests',{method:'POST',cookie:a.cookie,body:create});assert.equal(first.status,201);const replay=await h.call('/api/platform/requests',{method:'POST',cookie:a.cookie,body:create});assert.equal(replay.status,200);assert.equal(replay.data.request.id,first.data.request.id);const conflict=await h.call('/api/platform/requests',{method:'POST',cookie:a.cookie,body:{...create,payload:{name:'Different'}}});assert.equal(conflict.status,409);const id=first.data.request.id;assert.equal((await h.call('/api/platform/requests/'+id,{cookie:b.cookie})).status,404);assert.equal((await h.call('/api/platform/requests/'+id+'/messages',{method:'POST',cookie:b.cookie,body:{body:'synthetic'}})).status,404);assert.ok([403,404].includes((await h.call('/api/platform/requests/'+id+'/status',{method:'POST',cookie:b.cookie,body:{status:'approved'}})).status));assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM staging_requests').get().n,1);assert.equal(h.sql.prepare("SELECT COUNT(*) AS n FROM staging_audit_events WHERE action='request.created'").get().n,1)});

test('request and audit persist atomically when audit fails',async()=>{const h=harness();const a=await signup(h,'a@example.test');await me(h,a.cookie);h.sql.exec("CREATE TRIGGER fail_req_audit BEFORE INSERT ON staging_audit_events WHEN NEW.action='request.created' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END");const r=await h.call('/api/platform/requests',{method:'POST',cookie:a.cookie,body:{kind:'formation',attempt_id:'synthetic-attempt-2',payload:{test:true}}});assert.equal(r.status,500);assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM staging_requests').get().n,0)});

test('customer cannot list tenant staff or escalate via staff API',async()=>{const h=harness();const a=await signup(h,'a@example.test');await me(h,a.cookie);assert.equal((await h.call('/api/platform/staff',{cookie:a.cookie})).status,403);assert.equal((await h.call('/api/platform/staff',{method:'POST',cookie:a.cookie,body:{email:'a@example.test',role:'admin'}})).status,403)});

test('private synthetic document access is tenant scoped and download is nosniff',async()=>{const h=harness();const a=await signup(h,'a@example.test'),b=await signup(h,'b@example.test');await me(h,a.cookie);await me(h,b.cookie);const form=new FormData();form.append('file',new Blob(['synthetic only'],{type:'text/plain'}),'test.txt');const up=await h.call('/api/platform/documents',{method:'POST',cookie:a.cookie,body:form});assert.equal(up.status,201);const path='/api/platform/documents/'+up.data.document.id;const own=await h.call(path,{cookie:a.cookie});assert.equal(own.status,200);assert.equal(own.data,'synthetic only');assert.equal(own.headers.get('x-content-type-options'),'nosniff');assert.equal((await h.call(path,{cookie:b.cookie})).status,404);assert.equal((await h.call(path)).status,401)});

test('cross-origin writes are rejected',async()=>{const h=harness();let r=await h.call('/api/auth/signup',{method:'POST',origin:'https://other.example',body:{email:'a@example.test',password}});assert.equal(r.status,403)});
