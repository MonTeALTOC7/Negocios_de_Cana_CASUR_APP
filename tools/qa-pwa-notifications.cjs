// Real Chromium, isolated persistent profile and ephemeral HTTP origin. No user storage.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),os=require('os'),http=require('http');
const assert=require('assert/strict'),{execFileSync}=require('child_process'),{createHash}=require('crypto');
const root=path.resolve(__dirname,'..'),out=process.env.CASUR_QA_OUT;
if(!out)throw Error('CASUR_QA_OUT required');fs.mkdirSync(out,{recursive:true});
const baseline='e31c1c166f2498fbfaebea266e4867f8be123b1f',originals=new Map(),results=[];
let version='1.3.5',badHash=false,context;
const mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.geojson':'application/json','.webmanifest':'application/manifest+json'};
function resource(name){
 if(name==='qa-cache-sentinel')return Buffer.from('keep');
 if(version==='1.3.5'){
  if(!originals.has(name))originals.set(name,execFileSync('git',['show',`${baseline}:${name}`],{cwd:root,maxBuffer:64*1024*1024,stdio:['ignore','pipe','ignore']}));
  return originals.get(name);
 }
 let buffer=fs.readFileSync(path.join(root,name));
 if(version==='1.3.7'){
  if(['sw.js','core/versions/versions.js'].includes(name))buffer=Buffer.from(buffer.toString().replace(/APP_VERSION = '1.3.6'/,"APP_VERSION = '1.3.7'"));
  if(name==='index.html')buffer=Buffer.from(buffer.toString().replace('id="appVersion">v1.3.6<','id="appVersion">v1.3.7<'));
  if(name==='core/versions/runtime-assets.json'){
   const manifest=JSON.parse(buffer);manifest.appVersion=version;
   for(const file of ['core/versions/versions.js','index.html'])manifest.assets[file]=createHash('sha256').update(resource(file).toString().replace(/\r\n/g,'\n')).digest('hex');
   buffer=Buffer.from(JSON.stringify(manifest));
  }
 }
 if(badHash&&name==='core/updates/pwa-update.js')return Buffer.from(buffer.toString()+'\n// simulated inconsistent resource');
 return buffer;
}
const server=http.createServer((req,res)=>{
 try{
  let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);if(!name||name.endsWith('/'))name+='index.html';
  if(name.includes('..'))throw Error('path');
  const buffer=resource(name);
  res.writeHead(200,{'Content-Type':mime[path.extname(name)]||'application/octet-stream','Cache-Control':'no-store'});res.end(buffer);
 }catch{res.writeHead(404);res.end('not found');}
});
async function record(name,fn){await fn();results.push({name,passed:true});console.log('PASS',name);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results},null,2));}
async function workerState(page,expected){
 const end=Date.now()+90000;
 while(Date.now()<end){const state=await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();return {waiting:r?.waiting?.state,installing:r?.installing?.state};});if(expected(state))return;await page.waitForTimeout(200);}
 throw Error('Worker state deadline');
}
async function update(page){await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration()).update();});}
async function installed(page,v){await page.waitForFunction(v=>document.querySelector('#appVersion')?.textContent===`v${v}`,v,{timeout:60000});}
async function noNotice(page){
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller&&sessionStorage.getItem('casur-update-confirm')===null);
 await page.waitForTimeout(350);
 assert.equal(await page.locator('.casur-update').isVisible(),false);
 assert.equal(await page.getByText(/CASUR actualizado|Versión instalada confirmada/).count(),0);
}
async function failingBridge(page,fail){await page.evaluate(fail=>{
 let f=document.querySelector('#mFrame');if(!f){f=document.createElement('iframe');f.id='mFrame';document.body.append(f);}
 f.contentWindow.CASUR_MODULE_BRIDGE={protocolVersion:1,checkpoint:async()=>({ok:!fail})};
},fail);}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'casur-pwa136-'));
 const options={executablePath:process.env.CASUR_CHROME_EXECUTABLE,viewport:{width:1440,height:900},headless:true};
 context=await chromium.launchPersistentContext(profile,options);
 let page=context.pages()[0];
 try{
 await record('reproduce false 1.3.5 confirmation with old cache and fresh session',async()=>{
  await page.goto(base);await installed(page,'1.3.5');await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.evaluate(async()=>{
   const old=await caches.open('casur_master_shell_v1.3.4');await old.put('/qa-cache-sentinel',new Response('keep'));
   const lkg=await caches.open('casur_master_prod_lkg');await lkg.put('/qa-lkg-sentinel',new Response('keep'));
   localStorage.setItem('qa-preference','keep');
   await new Promise((resolve,reject)=>{const r=indexedDB.open('qa-biometry',3);r.onupgradeneeded=()=>r.result.createObjectStore('records');r.onerror=reject;r.onsuccess=()=>{const db=r.result,t=db.transaction('records','readwrite');t.objectStore('records').put({id:'P01',lat:11.5,lon:-85.8},'P01');t.oncomplete=()=>{db.close();resolve();};};});
  });
  await page.close();page=await context.newPage();await page.goto(base);await page.getByText('CASUR actualizado · Versión 1.3.5',{exact:true}).waitFor();
  await page.screenshot({path:path.join(out,'before-false-confirmation.png')});await page.getByRole('button',{name:'Cerrar',exact:true}).click();
 });
 await record('1.3.5 → real 1.3.6 notice only after complete waiting generation',async()=>{
  version='1.3.6';await update(page);await workerState(page,s=>s.waiting==='installed'&&!s.installing);
  await page.getByText('Nueva versión de CASUR disponible',{exact:true}).waitFor();
  assert.match(await page.locator('.casur-update').textContent(),/Versión 1.3.6/);
  await page.screenshot({path:path.join(out,'legitimate-update-136.png')});await installed(page,'1.3.5');
 });
 const second=await context.newPage();await second.goto(base);await installed(second,'1.3.5');
 await record('second window checkpoint rejection blocks activation',async()=>{
  await failingBridge(second,true);await page.getByRole('button',{name:'Actualizar ahora',exact:true}).click();
  await page.getByText(/No se pudo guardar el estado/).waitFor();await installed(page,'1.3.5');await installed(second,'1.3.5');
  await page.screenshot({path:path.join(out,'checkpoint-rejected.png')});await failingBridge(second,false);
 });
 await record('offline multitab activation once, actual TCH draft, no confirmation after reload',async()=>{
  await page.evaluate(()=>{location.hash='#/modulo/tch';});
  await page.waitForFunction(()=>document.querySelector('#mFrame')?.contentWindow?.CASUR_MODULE_BRIDGE?.moduleId==='tch');
  const tch=page.frames().find(f=>f.url().includes('/modules/tch/'));
  await tch.locator('[data-route="biometry"]').click();await tch.locator('#lotSearch').fill('99325');await tch.locator('[data-select-lot="99325"]').click();
  await tch.locator('#bioTechnician').fill('QA borrador 1.3.6');
  let a=0,b=0;const countA=f=>{if(f===page.mainFrame())a++;},countB=f=>{if(f===second.mainFrame())b++;};page.on('framenavigated',countA);second.on('framenavigated',countB);
  await context.setOffline(true);await page.getByRole('button',{name:'Actualizar ahora',exact:true}).click();
  await installed(page,'1.3.6');await installed(second,'1.3.6');await noNotice(page);await noNotice(second);
  assert.equal(a,1);assert.equal(b,1);page.off('framenavigated',countA);second.off('framenavigated',countB);
  await page.waitForFunction(()=>document.querySelector('#mFrame')?.contentWindow?.CASUR_MODULE_BRIDGE?.moduleId==='tch');
  const recovered=page.frames().find(f=>f.url().includes('/modules/tch/'));await recovered.locator('#continueBiometryDraft').click();
  assert.equal(await recovered.locator('#bioTechnician').inputValue(),'QA borrador 1.3.6');await recovered.waitForFunction(()=>document.querySelector('.logo-plate img')?.naturalWidth>0);
  await page.screenshot({path:path.join(out,'draft-offline-no-confirmation.png')});
 });
 await record('IDB v3, preferences, GEO, LKG and old caches preserved',async()=>{
  const state=await page.evaluate(async()=>({keys:await caches.keys(),preference:localStorage.getItem('qa-preference'),lkg:await(await(await caches.open('casur_master_prod_lkg')).match('/qa-lkg-sentinel')).text(),idb:await new Promise(resolve=>{const r=indexedDB.open('qa-biometry',3);r.onsuccess=()=>{const db=r.result,q=db.transaction('records').objectStore('records').get('P01');q.onsuccess=()=>{resolve({version:db.version,record:q.result});db.close();};};})}));
  assert.equal(state.preference,'keep');assert.equal(state.lkg,'keep');assert.equal(state.idb.version,3);assert.deepEqual(state.idb.record,{id:'P01',lat:11.5,lon:-85.8});
  for(const key of ['casur_master_shell_v1.3.4','casur_master_shell_v1.3.5','casur_master_shell_v1.3.6','casur_master_geo_2026-07-24-maestro-26-27-r2'])assert.ok(state.keys.includes(key));
  fs.writeFileSync(path.join(out,'persistence.json'),JSON.stringify(state,null,2));
 });
 await context.setOffline(false);await second.close();await page.close();
 await record('ten separate openings with 1.3.4/1.3.5 caches: zero notices',async()=>{
  const openings=[];
  for(let i=1;i<=10;i++){
   page=await context.newPage();await page.goto(base);await installed(page,'1.3.6');await noNotice(page);
   assert.equal(await page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting),false);
   openings.push({opening:i,notice:false});
   if(i===1||i===10)await page.screenshot({path:path.join(out,`no-notice-opening-${i}.png`)});
   await page.close();
  }
  fs.writeFileSync(path.join(out,'ten-openings.json'),JSON.stringify(openings,null,2));
 });
 await record('full Chromium restart, obsolete marker cleanup, desktop/mobile no notice',async()=>{
  await context.close();context=await chromium.launchPersistentContext(profile,options);page=context.pages()[0];
  await page.addInitScript(()=>{sessionStorage.setItem('casur-update-confirm','pending');sessionStorage.setItem('qa-unrelated','keep');});
  await page.goto(base);await installed(page,'1.3.6');await noNotice(page);assert.equal(await page.evaluate(()=>sessionStorage.getItem('qa-unrelated')),'keep');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'no-notice-mobile.png')});
 });
 await record('inconsistent future generation never offers update or replaces installed version',async()=>{
  version='1.3.7';badHash=true;await update(page);await workerState(page,s=>!s.installing);
  assert.equal(await page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting),false);await noNotice(page);await installed(page,'1.3.6');badHash=false;
 });
 await record('simulated 1.3.7 ready: precise notice; Later retains 1.3.6 online and offline',async()=>{
  await update(page);await workerState(page,s=>s.waiting==='installed'&&!s.installing);
  await page.getByText('Nueva versión de CASUR disponible',{exact:true}).waitFor();
  assert.equal(await page.locator('.casur-update strong').textContent(),'Nueva versión de CASUR disponible');
  assert.deepEqual(await page.locator('.casur-update p:visible').allTextContents(),['Versión 1.3.7']);
  assert.deepEqual(await page.locator('.casur-update button:visible').allTextContents(),['Actualizar ahora','Más tarde']);
  await page.screenshot({path:path.join(out,'legitimate-update-137-mobile.png')});
  let reloads=0;const counter=f=>{if(f===page.mainFrame())reloads++;};page.on('framenavigated',counter);
  await page.getByRole('button',{name:'Más tarde',exact:true}).click();await page.getByRole('button',{name:'Ver actualización',exact:true}).waitFor();
  assert.equal(reloads,0);await installed(page,'1.3.6');await page.screenshot({path:path.join(out,'later-mobile.png')});page.off('framenavigated',counter);
  await context.setOffline(true);await page.reload();await installed(page,'1.3.6');await page.getByRole('button',{name:'Ver actualización',exact:true}).click();
  await page.getByRole('button',{name:'Actualizar ahora',exact:true}).waitFor();await installed(page,'1.3.6');
  assert.equal(await page.getByText(/CASUR actualizado|Versión instalada confirmada/).count(),0);
 });
 fs.writeFileSync(path.join(out,'run-metadata.json'),JSON.stringify({baseline,installed:'1.3.6',simulatedOnly:'1.3.7',profile,origin:base,chromium:await context.browser().version()},null,2));
 }finally{await context.close();server.close();}
})().catch(error=>{console.error(error);fs.writeFileSync(path.join(out,'error.txt'),String(error.stack));process.exitCode=1;server.close();});
