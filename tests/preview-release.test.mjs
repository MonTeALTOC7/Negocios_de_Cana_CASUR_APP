import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto, createHash} from 'node:crypto';
import {MessageChannel} from 'node:worker_threads';
import {derivePreviewWorker, previewReleaseId} from '../tools/preview-release.mjs';

const source = fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../core/versions/runtime-assets.json',import.meta.url)));
const origin = 'https://preview.test/';
test('HEAD identities differ without changing production version, GEO, LKG or update protocol', () => {
  const a = derivePreviewWorker(source,{appVersion:manifest.appVersion,head:'a'.repeat(40)});
  const b = derivePreviewWorker(source,{appVersion:manifest.appVersion,head:'b'.repeat(40)});
  assert.notEqual(a,b);
  for(const token of ["const APP_VERSION = '1.5.0';", "const PROD_LKG_CACHE = MASTER_PREFIX + 'prod_lkg';",
    "const GEO_DATA_VERSION = '2026-07-24-maestro-26-27-r2';", 'checkpoint', 'await self.skipWaiting()', 'clients.claim()']) assert.ok(a.includes(token));
  assert.ok(a.includes("'shell_v' + PREVIEW_RELEASE_ID"));
  assert.ok(a.includes('manifest.previewReleaseId !== PREVIEW_RELEASE_ID'));
  assert.throws(()=>previewReleaseId('1.4.0','main'));
  assert.throws(()=>derivePreviewWorker(source.replace('const SHELL_CACHE','let SHELL_CACHE'),{appVersion:'1.4.0',head:'a'.repeat(40)}),/contract changed/);
});

test('new HEAD recovers Access-protected cached requests atomically; checkpoint failure preserves previous release', async () => {
  const storage = new Map(), userData = new Map([['draft','unchanged']]);
  let failPath = '', approved = false;
  const key = value => new URL(typeof value==='string'?value:value.url||value.href,origin).href;
  const recoveredRequests=[];
  function worker(head, authenticatedRecovery=true) {
    const id=previewReleaseId(manifest.appVersion,head), handlers={}, checkpoints=[], messages=[];
    let activated=0;
    const network=async request=>{
      const file=new URL(key(request)).pathname.slice(1);
      if(new URL(key(request)).origin!==new URL(origin).origin) {
        recoveredRequests.push({url:request.url,credentials:request.credentials});
        assert.equal(request.credentials,'omit','foreign requests must not gain session credentials');
        return new Response('external fixture');
      }
      if(file==='modules/tch/data/suertes.json' && typeof request!=='string') {
        recoveredRequests.push({url:request.url,credentials:request.credentials});
        if(request.credentials!=='same-origin')throw Error('Access requires the current same-origin session');
        return new Response(JSON.stringify({qa:'TCH cached resource'}));
      }
      if(failPath && file===failPath)throw Error('Incomplete deployment');
      if(file==='core/versions/runtime-assets.json')return new Response(JSON.stringify({...manifest,previewReleaseId:id}));
      if(file==='__preview.json')return new Response(JSON.stringify({head,previewReleaseId:id}));
      const bytes=fs.readFileSync(new URL('../'+(file||'index.html'),import.meta.url));
      return new Response(bytes);
    };
    const caches={async open(name){
      if(!storage.has(name))storage.set(name,new Map());const entries=storage.get(name);
      return {async match(r){return entries.get(key(r))?.clone();},async put(r,v){entries.set(key(r),v.clone());},
        async keys(){return [...entries.keys()].map(url=>new Request(url,{mode:'no-cors',credentials:'omit'}));},async delete(r){return entries.delete(key(r));},
        async add(r){entries.set(key(r),await network(r));}};
    },async keys(){return [...storage.keys()];}};
    const client={id:'qa-window',frameType:'top-level',postMessage(message,ports){messages.push(message.type);
      if(message.type==='CASUR_UPDATE_PREPARE'){checkpoints.push(message.type);ports[0].postMessage({ok:approved});}}};
    const context=vm.createContext({caches,Request,Response,URL,TextEncoder,Uint8Array,crypto:webcrypto,MessageChannel,
      console:{warn(){}},setTimeout,clearTimeout,fetch:network,indexedDB:userData,
      self:{location:{origin:origin.slice(0,-1)},registration:{scope:origin},addEventListener(type,fn){handlers[type]=fn;},
        async skipWaiting(){activated++;},clients:{async matchAll(){return [client];},async claim(){}}}});
    let derived=derivePreviewWorker(source,{appVersion:manifest.appVersion,head});
    if(!authenticatedRecovery)derived=derived.replace("url.origin === self.location.origin ? new Request(request, {credentials:'same-origin'}) : request",'request');
    vm.runInContext(derived,context);
    return {id,checkpoints,messages,value:expr=>vm.runInContext(expr,context),activated:()=>activated,
      async install(){let pending;handlers.install({waitUntil(p){pending=p;}});await pending;}};
  }
  const a=worker('a'.repeat(40));await a.install();
  assert.equal(await a.value('releaseReady()'),true);
  const oldName=a.value('SHELL_CACHE'), oldEntries=storage.get(oldName);
  const digest=async()=>createHash('sha256').update(await oldEntries.get(origin+'modules/produccion/index.html').clone().text()).digest('hex');
  const before=await digest();
  const cachedUrl=origin+'modules/tch/data/suertes.json?v=approved-snapshot';
  oldEntries.set(cachedUrl,new Response(JSON.stringify({qa:'original TCH resource'})));
  const foreignUrl='https://external.test/reference.svg';
  oldEntries.set(foreignUrl,new Response('original external fixture'));
  const broken=worker('c'.repeat(40),false);
  await assert.rejects(broken.install(),/Access requires/);
  assert.equal(await broken.value('releaseReady()'),false);
  assert.equal(await a.value('releaseReady()'),true);
  assert.equal(recoveredRequests.at(-1).credentials,'omit');
  const b=worker('b'.repeat(40));assert.notEqual(b.value('SHELL_CACHE'),oldName);
  failPath='modules/produccion/js/casur-enhancements.js';
  await assert.rejects(b.install(),/Incomplete/);assert.equal(await b.value('releaseReady()'),false);
  assert.equal(await digest(),before);assert.equal(await a.value('releaseReady()'),true);
  failPath='';await b.install();assert.equal(await b.value('releaseReady()'),true);
  assert.ok(recoveredRequests.some(r=>r.url===cachedUrl&&r.credentials==='same-origin'));
  assert.ok(recoveredRequests.some(r=>r.url===foreignUrl&&r.credentials==='omit'));
  assert.deepEqual(await storage.get(b.value('SHELL_CACHE')).get(cachedUrl).json(),{qa:'TCH cached resource'});
  assert.deepEqual(await oldEntries.get(cachedUrl).clone().json(),{qa:'original TCH resource'});
  assert.equal(await digest(),before);
  assert.equal((await b.value('coordinateUpdate()')).ok,false);assert.equal(b.activated(),0);
  assert.ok(b.messages.includes('CASUR_UPDATE_CANCEL'));
  approved=true;assert.equal((await b.value('coordinateUpdate()')).ok,true);assert.equal(b.activated(),1);
  assert.equal(userData.get('draft'),'unchanged');assert.ok(storage.has(oldName));
  assert.equal(b.checkpoints.length,2);
});
