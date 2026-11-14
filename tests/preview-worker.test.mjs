import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

test('preview serves only built assets and never exposes API or writes',async()=>{
  const out=mkdtempSync(path.join(tmpdir(),'qabs-preview-test-'));
  try {
    const sha='0123456789abcdef0123456789abcdef01234567';
    execFileSync(process.execPath,['scripts/build-preview-worker.mjs','dist',out],{env:{...process.env,QABS_COMMIT_SHA:sha}});
    const manifest=JSON.parse(readFileSync(path.join(out,'manifest.json'),'utf8'));
    const worker=(await import(pathToFileURL(path.join(out,'worker.mjs')).href)).default;
    for(const [url,expected] of Object.entries(manifest.assets)){
      const res=await worker.fetch(new Request('https://preview.example'+url));
      assert.equal(res.status,200);assert.equal(res.headers.get('x-qabs-source-commit'),sha);
      assert.equal(createHash('sha256').update(Buffer.from(await res.arrayBuffer())).digest('hex'),expected.sha256);
    }
    assert.equal((await worker.fetch(new Request('https://preview.example/api/auth/me'),env)).status,200);\n    assert.equal((await worker.fetch(new Request('https://preview.example/api/platform/me'),env)).status,401);\n    assert.equal((await worker.fetch(new Request('https://preview.example/health'),env)).status,200);
    assert.equal((await worker.fetch(new Request('https://preview.example/private-document.pdf'),env)).status,404);
    assert.equal((await worker.fetch(new Request('https://preview.example/',{method:'POST'}),env)).status,405);
  } finally {rmSync(out,{recursive:true,force:true})}
});
