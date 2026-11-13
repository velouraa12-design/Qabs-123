import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateWranglerStagingManifest, validateOutboundUrl, validateEnvironmentInventory } from '../staging-worker/isolation-policy.mjs';

const approved={workerName:'qabs-synthetic-candidate',d1Id:'11111111-1111-4111-8111-111111111111',d1Name:'synthetic-db',r2Bucket:'synthetic-bucket'};
const environment={environment:'staging',serviceBindings:[],routes:[],customDomains:[],crons:[],productionSecretsPresent:false,dataClassification:'synthetic-only'};
const manifest={name:approved.workerName,main:'./entrypoint.mjs',compatibility_date:'2026-11-13',workers_dev:true,env:{staging:{name:approved.workerName,vars:{QABS_STAGING_ENV:'staging',QABS_STAGING_D1_UUID:approved.d1Id,QABS_STAGING_D1_NAME:approved.d1Name,QABS_STAGING_R2_BUCKET:approved.r2Bucket},d1_databases:[{binding:'DB',database_id:approved.d1Id,database_name:approved.d1Name}],r2_buckets:[{binding:'ARTIFACTS',bucket_name:approved.r2Bucket}]}}};
const edit=fn=>{let x=structuredClone(manifest);fn(x);return x};
test('validates actual Wrangler JSON shape and rejects production-capable bindings',()=>{
 assert.equal(validateWranglerStagingManifest(manifest,approved,environment),true);
 for (const key of ['services','queues','kv_namespaces','durable_objects','routes','route','triggers','assets']) {
   assert.throws(()=>validateWranglerStagingManifest(edit(x=>x.env.staging[key]=[]),approved,environment),/unapproved/);
   assert.throws(()=>validateWranglerStagingManifest(edit(x=>x[key]=[]),approved,environment),/unapproved/);
 }
 assert.throws(()=>validateWranglerStagingManifest(edit(x=>x.env.staging.d1_databases[0].database_id='bad'),approved,environment),/UUID/);
 assert.throws(()=>validateWranglerStagingManifest(edit(x=>x.env.staging.r2_buckets[0].bucket_name='other'),approved,environment),/runtime inventory|R2 target/);
 assert.throws(()=>validateWranglerStagingManifest(edit(x=>x.env.staging.vars.PAYMENT_SECRET='fake'),approved,environment),/unapproved/);
 assert.throws(()=>validateWranglerStagingManifest(edit(x=>x.env.production={}),approved,environment),/only staging/);
 assert.throws(()=>validateWranglerStagingManifest(manifest,{},environment),/mismatch|incomplete/);
});
test('unknown inventories and alternate QABS host forms fail closed',()=>{
 assert.throws(()=>validateEnvironmentInventory({environment:'staging',productionSecretsPresent:false,dataClassification:'synthetic-only'}),/explicit array/);
 assert.throws(()=>validateOutboundUrl('https://portal.qabs1.store./api',['https://portal.qabs1.store.']),/forbidden/);
});
test('preflight CLI validates files and never deploys',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'qabs-manifest-'));
 try {
  const m=path.join(dir,'wrangler.json'),i=path.join(dir,'inventory.json');
  await writeFile(m,JSON.stringify(manifest));await writeFile(i,JSON.stringify({approved,environment}));
  let ok=spawnSync(process.execPath,['scripts/validate-isolation-manifest.mjs',m,i],{encoding:'utf8'});assert.equal(ok.status,0,ok.stderr);
  await writeFile(m,JSON.stringify(edit(x=>x.env.staging.services=[{binding:'COMMERCE',service:'qabs-stores'}])));
  let bad=spawnSync(process.execPath,['scripts/validate-isolation-manifest.mjs',m,i],{encoding:'utf8'});assert.equal(bad.status,1);assert.match(bad.stderr,/unapproved/);
 } finally {await rm(dir,{recursive:true,force:true})}
});

test('legacy manifest guard applies the policy without approving existing data',async()=>{
 const {assertIsolatedManifest,EXPECTED_D1_NAME,EXPECTED_D1_UUID,EXPECTED_R2_BUCKET,EXPECTED_WORKER_NAME}=await import('../staging-worker/manifest-guard.mjs');
 const legacy={name:EXPECTED_WORKER_NAME,main:'./entrypoint.mjs',compatibility_date:'2026-11-13',workers_dev:true,env:{staging:{name:EXPECTED_WORKER_NAME+'-staging',vars:{QABS_STAGING_ENV:'staging',QABS_STAGING_D1_UUID:EXPECTED_D1_UUID,QABS_STAGING_D1_NAME:EXPECTED_D1_NAME,QABS_STAGING_R2_BUCKET:EXPECTED_R2_BUCKET},d1_databases:[{binding:'DB',database_id:EXPECTED_D1_UUID,database_name:EXPECTED_D1_NAME}],r2_buckets:[{binding:'ARTIFACTS',bucket_name:EXPECTED_R2_BUCKET}]}}};
 assert.equal(assertIsolatedManifest(legacy),true);
 legacy.env.staging.services=[{binding:'COMMERCE',service:'qabs-stores'}];
 assert.throws(()=>assertIsolatedManifest(legacy));
});
