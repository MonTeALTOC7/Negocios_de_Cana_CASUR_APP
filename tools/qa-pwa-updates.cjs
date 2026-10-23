// Real Chromium Service Workers, isolated origin/context; never touches user storage.
const {chromium}=require('playwright');
const fs=require('fs'), path=require('path'), http=require('http'), assert=require('assert/strict');
const {execFileSync}=require('child_process');
const {createHash}=require('crypto');
const root=path.resolve(__dirname,'..'),out=process.env.CASUR_QA_OUT;
if(!out)throw Error('CASUR_QA_OUT required'); fs.mkdirSync(out,{recursive:true});
let version='1.3.4',broken=false,dataGeneration=null;
const originals=new Map(),baseCommit='34821beb844a0fe89a23ea9dd82b1ef2a4a8b951';
const mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.geojson':'application/json','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
 try{
  let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);if(!name||name.endsWith('/'))name+='index.html';
  if(name.includes('..'))throw Error('path');
  if(broken&&name==='core/updates/pwa-update.js'){res.writeHead(503);res.end('incomplete');return;}
  let buffer;
  if(version==='1.3.4'){
   if(!originals.has(name))originals.set(name,execFileSync('git',['show',`${baseCommit}:${name}`],{cwd:root,maxBuffer:64*1024*1024,stdio:['ignore','pipe','ignore']}));buffer=originals.get(name);
  }else{buffer=fs.readFileSync(path.join(root,name));if(version==='1.3.6'&&['sw.js','core/versions/versions.js','index.html'].includes(name))buffer=Buffer.from(buffer.toString().replaceAll('1.3.5','1.3.6'));
   if(version==='1.3.6'&&name==='core/versions/runtime-assets.json'){
    const manifest=JSON.parse(buffer);manifest.appVersion=version;
    for(const file of ['core/versions/versions.js','index.html'])manifest.assets[file]=createHash('sha256').update(fs.readFileSync(path.join(root,file),'utf8').replaceAll('1.3.5','1.3.6').replace(/\r\n/g,'\n')).digest('hex');
    buffer=Buffer.from(JSON.stringify(manifest));
   }
  }
  if(dataGeneration&&/^modules\/produccion\/data\/(version|cronologico|historico)\.json$/.test(name)){
   const data=JSON.parse(buffer);
   if(name.endsWith('/version.json'))Object.assign(data,{version:dataGeneration.version,publishedAt:dataGeneration.date});
   else data.meta={...data.meta,dataVersion:dataGeneration.version,publishedAt:dataGeneration.date};
   buffer=Buffer.from(JSON.stringify(data));
  }
  res.writeHead(200,{'Content-Type':mime[path.extname(name)]||'application/octet-stream','Cache-Control':'no-store'});res.end(buffer);
 }catch{res.writeHead(404);res.end('not found');}
});
const results=[];
async function record(name,fn){await fn();results.push({name,passed:true});console.log('PASS',name);fs.writeFileSync(path.join(out,'pwa-results.json'),JSON.stringify(results,null,2));}
async function update(page){await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update();});}
async function workerState(page, expected){
 const deadline=Date.now()+90000;
 while(Date.now()<deadline){const value=await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();return {waiting:r?.waiting?.state,installing:r?.installing?.state};});if(expected(value))return;await page.waitForTimeout(200);}
 throw Error('Worker state deadline');
}
async function waiting(page){await workerState(page,state=>state.waiting==='installed'&&!state.installing);}
async function installed(page,value){await page.waitForFunction(v=>document.querySelector('#appVersion')?.textContent===`v${v}`,value,{timeout:60000});}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({executablePath:process.env.CASUR_CHROME_EXECUTABLE});
 const context=await browser.newContext({viewport:{width:1440,height:900}});let page=await context.newPage();
 try{
 if(!process.env.CASUR_QA_FIRST_OPEN_ONLY){
 await record('first 1.3.4 install and isolated persistent sentinels',async()=>{
  await page.goto(base);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await installed(page,'1.3.4');await page.waitForTimeout(1000);
  await page.evaluate(async()=>{
   localStorage.setItem('qa-user-preference','preserved');
   await new Promise((resolve,reject)=>{const r=indexedDB.open('qa-user-biometry',3);r.onupgradeneeded=()=>r.result.createObjectStore('records');r.onsuccess=()=>{const db=r.result,t=db.transaction('records','readwrite');t.objectStore('records').put({id:'P01',latitude:11.5},'P01');t.oncomplete=()=>{db.close();resolve();};};r.onerror=reject;});
   const cache=await caches.open('casur_master_prod_lkg');await cache.put('/qa-lkg-sentinel',new Response('retained'));
  });
 });
 await record('1.3.4 legacy SKIP_WAITING cannot force unsafe activation',async()=>{
  version='1.3.5';await update(page);await waiting(page);await page.waitForTimeout(1000);await installed(page,'1.3.4');
  assert.ok(await page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting));
 });
 await record('1.3.4 → 1.3.5 after closing old windows; installed confirmation',async()=>{
  await page.close();page=await context.newPage();await page.goto(base);await installed(page,'1.3.5');
  await page.getByText('CASUR actualizado · Versión 1.3.5',{exact:true}).waitFor();await page.screenshot({path:path.join(out,'legacy-installed.png')});
  await page.getByRole('button',{name:'Cerrar',exact:true}).click();
 });
 await record('incomplete 1.3.6 install preserves active 1.3.5',async()=>{
  version='1.3.6';broken=true;await update(page);await workerState(page,state=>!state.installing);await installed(page,'1.3.5');
  assert.equal(await page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting),false);broken=false;
 });
 await record('1.3.5 → simulated 1.3.6 ready notification, postpone and recover',async()=>{
  await update(page);await waiting(page);await page.getByText('Nueva versión de CASUR disponible',{exact:true}).waitFor();
  await page.screenshot({path:path.join(out,'update-1440.png')});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,'update-390.png')});
  await page.getByRole('button',{name:'Más tarde',exact:true}).click();await page.getByRole('button',{name:'Ver actualización',exact:true}).waitFor();await installed(page,'1.3.5');await page.screenshot({path:path.join(out,'postponed-390.png')});
  const installedVersion=await page.evaluate(async()=> (await fetch('./core/versions/versions.js?cache-bust=qa')).text());assert.ok(installedVersion.includes("APP_VERSION = '1.3.5'"));
  await page.reload();await installed(page,'1.3.5');await page.getByRole('button',{name:'Ver actualización',exact:true}).waitFor();
 });
 // A real iframe, with an intentionally failing protocol bridge to exercise safety.
 await page.evaluate(()=>{const f=document.createElement('iframe');f.id='mFrame';f.src='about:blank';document.body.append(f);});
 await page.evaluate(()=>{document.querySelector('#mFrame').contentWindow.CASUR_MODULE_BRIDGE={protocolVersion:1,checkpoint:async()=>({ok:false,status:'qa-failure'})};});
 await record('active iframe failed checkpoint blocks activation without reload',async()=>{
  await page.getByRole('button',{name:'Ver actualización',exact:true}).click();await page.getByRole('button',{name:'Actualizar ahora',exact:true}).click();
  await page.getByText(/No se pudo guardar el estado/).waitFor();await installed(page,'1.3.5');assert.ok(await page.locator('#mFrame').count());
  await page.screenshot({path:path.join(out,'checkpoint-rejected.png')});
 });
 await page.evaluate(()=>{document.querySelector('#mFrame').contentWindow.CASUR_MODULE_BRIDGE.checkpoint=async()=>({ok:true});});
 const second=await context.newPage();await second.goto(base);await installed(second,'1.3.5');
 await second.evaluate(()=>{const f=document.createElement('iframe');f.id='mFrame';document.body.append(f);f.contentWindow.CASUR_MODULE_BRIDGE={protocolVersion:1,checkpoint:async()=>({ok:false})};});
 await record('second tab refusal blocks all tabs',async()=>{
  await page.getByRole('button',{name:'Actualizar ahora',exact:true}).click();await page.getByText(/No se pudo guardar el estado/).waitFor();await page.waitForFunction(()=>!document.querySelector('.casur-update button').disabled);await installed(page,'1.3.5');await installed(second,'1.3.5');
 });
 await second.evaluate(()=>{document.querySelector('#mFrame').contentWindow.CASUR_MODULE_BRIDGE.checkpoint=async()=>({ok:true});});
 await record('non-responsive tab times out safely; closed tab negotiation cancels safely',async()=>{
  const silent=await context.newPage();await silent.goto(base+'/modules/produccion/');
  await page.getByRole('button',{name:'Actualizar ahora',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.casur-update button').disabled,{}, {timeout:18000});await installed(page,'1.3.5');
  await page.getByRole('button',{name:'Actualizar ahora',exact:true}).click();await page.locator('.casur-update-lock[open]').waitFor();await silent.close();
  await page.waitForFunction(()=>!document.querySelector('.casur-update button').disabled,{}, {timeout:18000});await installed(page,'1.3.5');
 });
 await record('offline apply, two checkpoints, one reload per tab and confirmation',async()=>{
  // Exercise the real TCH bridge and IndexedDB draft, not only protocol doubles.
  await page.evaluate(()=>{location.hash='#/modulo/tch';});
  await page.waitForFunction(()=>document.querySelector('#mFrame')?.contentWindow?.CASUR_MODULE_BRIDGE?.moduleId==='tch');
  const tch=page.frames().find(frame=>frame.url().includes('/modules/tch/'));
  await tch.locator('[data-route="biometry"]').click();await tch.locator('#lotSearch').fill('99325');await tch.locator('[data-select-lot="99325"]').click();
  let reloads=0,secondReloads=0;page.on('framenavigated',f=>{if(f===page.mainFrame())reloads++;});second.on('framenavigated',f=>{if(f===second.mainFrame())secondReloads++;});
  await context.setOffline(true);
  await tch.locator('#bioTechnician').fill('QA checkpoint actualización');
  await page.getByRole('button',{name:'Actualizar ahora',exact:true}).click();
  await installed(page,'1.3.6');await installed(second,'1.3.6');await page.getByText('CASUR actualizado · Versión 1.3.6',{exact:true}).waitFor();
  await page.screenshot({path:path.join(out,'update-confirmed-390.png')});await page.waitForTimeout(1000);await installed(page,'1.3.6');
  assert.equal(reloads,1);assert.equal(secondReloads,1);
  await page.waitForFunction(()=>document.querySelector('#mFrame')?.contentWindow?.CASUR_MODULE_BRIDGE?.moduleId==='tch');
  const recovered=page.frames().find(frame=>frame.url().includes('/modules/tch/'));
  await recovered.locator('#continueBiometryDraft').click();assert.equal(await recovered.locator('#bioTechnician').inputValue(),'QA checkpoint actualización');
  await recovered.waitForFunction(()=>document.querySelector('.logo-plate img')?.naturalWidth>0);
  await page.screenshot({path:path.join(out,'tch-draft-recovered-offline.png')});
 });
 await record('IDB v3, local preference, GEO and LKG survive',async()=>{
  const state=await page.evaluate(async()=>({preference:localStorage.getItem('qa-user-preference'),lkg:await(await(await caches.open('casur_master_prod_lkg')).match('/qa-lkg-sentinel')).text(),geo:(await caches.keys()).some(k=>k==='casur_master_geo_2026-07-24-maestro-26-27-r2'),record:await new Promise(resolve=>{const r=indexedDB.open('qa-user-biometry',3);r.onsuccess=()=>{const db=r.result,q=db.transaction('records').objectStore('records').get('P01');q.onsuccess=()=>{resolve(q.result);db.close();};};})}));
  assert.deepEqual(state,{preference:'preserved',lkg:'retained',geo:true,record:{id:'P01',latitude:11.5}});fs.writeFileSync(path.join(out,'persistence.json'),JSON.stringify(state,null,2));
 });
 await context.setOffline(false);await second.close();
 // Fresh isolated 1.3.5 origin state for version/date UI; no production writes.
 version='1.3.5';const visual=await browser.newContext();const p=await visual.newPage();
 await record('first 1.3.5 installation has no false update alert',async()=>{await p.goto(base);await p.waitForFunction(()=>!!navigator.serviceWorker.controller);assert.equal(await p.locator('.casur-update').isVisible(),false);});
 await p.goto(base+'/modules/produccion/');await p.waitForSelector('.production-release');
 await record('desktop/mobile installed metadata, news, effective dates, offline',async()=>{
  for(const width of [1440,390]){await p.setViewportSize({width,height:width===390?844:900});assert.match(await p.locator('.production-release').textContent(),/V1.5.1.*06-sep-2026/);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.locator('header').first().screenshot({path:path.join(out,`header-${width}.png`)});await p.getByRole('button',{name:'Novedades',exact:true}).click();assert.match(await p.locator('.production-news').textContent(),/V1.5.0.*1.3.4/s);await p.screenshot({path:path.join(out,`news-${width}.png`)});await p.getByRole('button',{name:'Cerrar',exact:true}).click();}
  for(const [meta,expected] of [[{publishedAt:'2026-11-15'},'15-nov-2026'],[{publishedAt:'2026-02-30'},'fecha N/D'],[{},'fecha N/D'],[{generated:'2026-11-16'},'16-nov-2026']]){
   await p.evaluate(meta=>{window.CRONO_DATA.meta=meta;document.dispatchEvent(new CustomEvent('casur-crono-effective-change'));},meta);assert.ok((await p.locator('.production-release').textContent()).includes(expected));
  }
  await p.screenshot({path:path.join(out,'effective-date-generation.png')});
  await visual.setOffline(true);await p.reload();await p.waitForSelector('.production-release');assert.match(await p.locator('.production-release').textContent(),/06-sep-2026/);await p.getByRole('button',{name:'Novedades',exact:true}).click();assert.ok(await p.locator('.production-news').isVisible());
 });
 await p.getByRole('button',{name:'Cerrar',exact:true}).click();await visual.setOffline(false);
 await record('official import bridge without date never inherits publication; overlay adopts its own date',async()=>{
  const outcomes=await p.evaluate(()=>{
   const rows=CASUR_GET_CURRENT_REPORT_ROWS();
   const official=CASUR_APPLY_REPORT_ROWS({reportRows:rows,meta:{source:'SIAGRI QA isolated',publishedAt:'2026-11-15'},dataVersion:'2026.11.15-siagri.1000'});
   const officialLabel=document.querySelector('.production-release').textContent;
   const noDate=CASUR_APPLY_REPORT_ROWS({reportRows:rows,meta:{source:'SIAGRI QA isolated'}});
   const missingLabel=document.querySelector('.production-release').textContent;
   document.dispatchEvent(new CustomEvent('casur-master-overlay',{detail:{reportRows:rows,meta:{publishedAt:'2026-11-16'},dataVersion:'2026.11.16-siagri.1000'}}));
   return {official:official.applied,noDate:noDate.applied,officialLabel,missingLabel,overlayLabel:document.querySelector('.production-release').textContent};
  });
  assert.ok(outcomes.official&&outcomes.noDate);assert.match(outcomes.officialLabel,/15-nov-2026/);assert.match(outcomes.missingLabel,/fecha N\/D/);assert.match(outcomes.overlayLabel,/16-nov-2026/);
  fs.writeFileSync(path.join(out,'effective-imports.json'),JSON.stringify(outcomes,null,2));await p.screenshot({path:path.join(out,'effective-overlay.png')});
 });
 await record('new data generation adopted and recovered offline through real LKG gate',async()=>{
  dataGeneration={version:'2026.11.17-siagri.1000',date:'2026-11-17T12:00:00Z'};
  await p.reload();await p.waitForSelector('.production-release');assert.match(await p.locator('.production-release').textContent(),/17-nov-2026/);
  await visual.setOffline(true);await p.reload();await p.waitForSelector('.production-release');assert.match(await p.locator('.production-release').textContent(),/17-nov-2026/);
  const effective=await p.evaluate(()=>({module:document.querySelector('.production-release').textContent,data:CRONO_DATA.meta}));
  assert.equal(effective.data.dataVersion,dataGeneration.version);fs.writeFileSync(path.join(out,'lkg-effective.json'),JSON.stringify(effective,null,2));await p.screenshot({path:path.join(out,'effective-lkg-offline.png')});
 });
 await visual.close();
 }
 await context.close();
 await record('TCH first opened only after accepted update, offline, with all local assets',async()=>{
  version='1.3.5';dataGeneration=null;broken=false;
  const fresh=await browser.newContext({viewport:{width:390,height:844}});
  const shell=await fresh.newPage();
  await shell.goto(base);await shell.waitForFunction(()=>!!navigator.serviceWorker.controller);await installed(shell,'1.3.5');
  assert.equal(shell.frames().some(f=>f.url().includes('/modules/tch/')),false);
  version='1.3.6';await update(shell);await waiting(shell);
  await shell.getByRole('button',{name:'Actualizar ahora',exact:true}).click();await installed(shell,'1.3.6');
  await fresh.setOffline(true);
  const failures=[];shell.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)failures.push({url:r.url(),status:r.status()});});
  await shell.evaluate(()=>{location.hash='#/modulo/tch';});
  await shell.waitForFunction(()=>document.querySelector('#mFrame')?.contentWindow?.CASUR_MODULE_BRIDGE?.moduleId==='tch');
  const tch=shell.frames().find(f=>f.url().includes('/modules/tch/'));
  await tch.waitForFunction(()=>document.querySelector('.logo-plate img')?.naturalWidth>0);
  await shell.screenshot({path:path.join(out,'tch-first-open-offline.png')});
  await tch.locator('[data-route="biometry"]').click();
  await tch.locator('#lotSearch').fill('99325');
  await shell.screenshot({path:path.join(out,'tch-first-open-form-offline.png')});
  assert.deepEqual(failures.filter(r=>/\.(js|mjs|css|png|svg)(\?|$)/.test(r.url)),[]);
  const resources=Object.keys(JSON.parse(fs.readFileSync(path.join(root,'core/versions/runtime-assets.json'))).assets);
  const missing=await shell.evaluate(async files=>{const missing=[];for(const file of files){const r=await fetch('/'+file);if(!r.ok)missing.push(file);}return missing;},resources);
  assert.deepEqual(missing,[]);
  const assets=await shell.evaluate(async()=>await caches.keys());
  fs.writeFileSync(path.join(out,'first-open-offline.json'),JSON.stringify({passed:true,localResources:resources.length,missing,failures,caches:assets,limitation:'A fresh profile without previously downloaded TCH datasets cannot select official lots offline. Data precaching policy unchanged.',scenario:'TCH never opened before acceptance; first access offline after simulated 1.3.5 → 1.3.6'},null,2));
  await fresh.close();
 });
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);fs.writeFileSync(path.join(out,'pwa-error.txt'),String(error.stack));process.exitCode=1;server.close();});
