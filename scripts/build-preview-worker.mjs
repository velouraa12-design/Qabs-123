// Package only public build assets into a binding-free Worker for the public preview.
// It never reads R2/D1 and never forwards requests to an API.
import {readFileSync,writeFileSync,readdirSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
const sha=process.env.QABS_COMMIT_SHA;
if(!/^[a-f0-9]{40}$/.test(sha||'')) throw Error('QABS_COMMIT_SHA must be a full commit SHA');
const dist=path.resolve(process.argv[2]||'dist'), out=path.resolve(process.argv[3]||'preview-output');
mkdirSync(out,{recursive:true});
const html=readFileSync(path.join(dist,'index.html'),'utf8');
const js=[...html.matchAll(/src="(\/assets\/[^\"]+\.js)"/g)].map(x=>x[1]);
const css=[...html.matchAll(/href="(\/assets\/[^\"]+\.css)"/g)].map(x=>x[1]);
if(js.length!==1||css.length!==1)throw Error('Expected exactly one JS and CSS entry point');
const paths=['/index.html',...js,...css];
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
const assets={}, manifest={commit:sha,assets:{}};
for(const p of paths){const bytes=readFileSync(path.join(dist,p.slice(1)));const type=types[path.extname(p)];assets[p]={data:gzipSync(bytes,{level:9}).toString('base64'),type};manifest.assets[p]={sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};}
const worker=`const files = ${JSON.stringify(assets)};\nconst commit=${JSON.stringify(sha)};\nexport default {async fetch(request, env) {\n const url = new URL(request.url);\n if (url.pathname.startsWith('/api/') || url.pathname === '/health' || url.pathname === '/diagnostic') return env.API.fetch(request);\n const headers = { 'x-qabs-source-commit':commit, 'x-content-type-options':'nosniff', 'referrer-policy':'no-referrer', 'cache-control':'no-store', 'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'" };\n if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed',{status:405,headers:{...headers,allow:'GET, HEAD'}});\n const key=url.pathname==='/'?'/index.html':url.pathname; const asset=files[key];\n if(!asset)return new Response('Not found',{status:404,headers});\n headers['content-type']=asset.type; const compressed=Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0));\n const body = request.method === 'HEAD' ? null : new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));\n return new Response(body,{headers});\n}};\n`;
writeFileSync(path.join(out,'worker.mjs'),worker);writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({commit:sha,files:paths,workerBytes:Buffer.byteLength(worker)}));
