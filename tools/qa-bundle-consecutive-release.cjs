// Isolated same-origin, same-APP_VERSION reviews. Never touches a user profile.
const {chromium}=require('playwright'),fs=require('fs'),http=require('http'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),out=process.argv[2];fs.mkdirSync(out,{recursive:true});
let generation=0;
const id=()=>generation?`1.5.6-review-${generation}`:JSON.parse(fs.readFileSync(path.join(root,'core/versions/runtime-assets.json'))).releaseId;
function read(file){
 let b=fs.readFileSync(path.join(root,file));
 if(!generation)return b;
 if(file==='index.html')b=Buffer.from(b.toString()+`\n<!-- independent review ${generation} -->\n`);
 if(file==='sw.js')b=Buffer.from(b.toString().replace(/const RELEASE_ID = '[^']+';/,`const RELEASE_ID = '${id()}';`));
 if(file==='core/versions/runtime-assets.json'){
  const m=JSON.parse(b);m.releaseId=id();m.assets['index.html']=crypto.createHash('sha256').update(read('index.html').toString().replace(/\r\n/g,'\n')).digest('hex');b=Buffer.from(JSON.stringify(m));
 }
 return b;
}
const server=http.createServer((q,r)=>{try{
 let file=decodeURIComponent(new URL(q.url,'http://local').pathname).replace(/^\/Negocios_de_Cana_CASUR_APP\//,'');if(!file||file.endsWith('/'))file+='index.html';if(file.includes('..'))throw Error('path');
 r.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.geojson':'application/json','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});r.end(read(file));
}catch{r.writeHead(404);r.end()}});
const active=p=>p.evaluate(()=>new Promise(ok=>{const c=new MessageChannel();c.port1.onmessage=e=>ok(e.data);navigator.serviceWorker.controller.postMessage({type:'CASUR_UPDATE_INFO'},[c.port2])}));
const update=p=>p.evaluate(()=>navigator.serviceWorker.getRegistration().then(r=>r.update()));
const postpone=async(p,second)=>{await Promise.race([p,second].map(t=>t.getByRole('button',{name:'Más tarde',exact:true}).waitFor({timeout:180000})));for(const t of[p,second])if(await t.getByRole('button',{name:'Más tarde',exact:true}).isVisible()){await t.getByRole('button',{name:'Más tarde',exact:true}).click();return;}throw Error('no fresh offer');};
const ready=p=>p.waitForFunction(()=>document.querySelector('#mFrame')?.contentWindow?.CASUR_PRODUCTION_READY,null,{timeout:120000});
(async()=>{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const browser=await chromium.launch({channel:'chrome'}),results=[];
 try{
  const c=await browser.newContext({recordVideo:{dir:out}}),p=await c.newPage(),base=`http://127.0.0.1:${server.address().port}/Negocios_de_Cana_CASUR_APP/`;
  console.log('initial load',base);await p.goto(base+'#/modulo/produccion');await ready(p);console.log('production ready');
  const second=await c.newPage();await second.goto(base+'#/modulo/tch');
  await second.waitForFunction(()=>document.querySelector('#mFrame')?.contentWindow?.CASUR_MODULE_BRIDGE?.moduleId==='tch',null,{timeout:120000});
  const tch=second.frameLocator('#mFrame');await tch.locator('[data-route=biometry]').click();await tch.locator('#lotSearch').fill('99325');await tch.locator('[data-select-lot="99325"]').click();await tch.locator('#bioTechnician').fill('Consecutive release pending draft');console.log('TCH draft entered');
  console.log('draft ready');generation=1;console.log('install review-1');await update(p);console.log('updated1');await postpone(p,second);
  assert.equal(await p.evaluate(()=>localStorage.getItem('casur-update-later')),'release:1.5.6-review-1');
  // Replace the waiting review, without reloading either client. Dedup must use releaseId.
  generation=2;console.log('install review-2');await update(p);console.log('updated2');await p.getByRole('button',{name:'Más tarde',exact:true}).waitFor({timeout:180000});
  assert.equal(await p.evaluate(()=>localStorage.getItem('casur-update-offered')),'release:1.5.6-review-2');
  assert.notEqual((await active(p)).releaseId,id());
  await second.locator('#mFrame').evaluate(f=>{const w=f.contentWindow;w.__qaBridge=w.CASUR_MODULE_BRIDGE;w.CASUR_MODULE_BRIDGE={...w.CASUR_MODULE_BRIDGE,checkpoint:async()=>({ok:false})};});
  await p.getByRole('button',{name:'Instalar actualización',exact:true}).click();await p.getByText(/No se pudo guardar el estado/).waitFor({timeout:60000});assert.notEqual((await active(p)).releaseId,id());
  await second.locator('#mFrame').evaluate(f=>{f.contentWindow.CASUR_MODULE_BRIDGE=f.contentWindow.__qaBridge;});
  const previousOrigin=await p.evaluate(()=>performance.timeOrigin),secondOrigin=await second.evaluate(()=>performance.timeOrigin);
  await p.getByRole('button',{name:'Instalar actualización',exact:true}).click();
  await p.waitForFunction(t=>performance.timeOrigin!==t,previousOrigin,{timeout:120000});await second.waitForFunction(t=>performance.timeOrigin!==t,secondOrigin,{timeout:120000});
  await p.waitForFunction(()=>new Promise(ok=>{const c=new MessageChannel();c.port1.onmessage=e=>ok(e.data.releaseId==='1.5.6-review-2');navigator.serviceWorker.controller.postMessage({type:'CASUR_UPDATE_INFO'},[c.port2])}),null,{timeout:120000});await ready(p);console.log('updated page ready');
  await second.waitForFunction(()=>document.querySelector('#mFrame')?.contentWindow?.CASUR_MODULE_BRIDGE?.moduleId==='tch',null,{timeout:120000});
  const draft=()=>second.evaluate(()=>new Promise((ok,no)=>{const q=indexedDB.open('casur-estimador-tch');q.onerror=no;q.onsuccess=()=>{const d=q.result,r=d.transaction('settings').objectStore('settings').get('draft:biometry:v1');r.onsuccess=()=>{ok(r.result);d.close()};r.onerror=no;};}));
  assert.match(JSON.stringify(await draft()),/Consecutive release pending draft/);
  results.push({step:'postpone review-1, offer review-2 without reload, reject unsafe activation, retry checkpoint',status:'PASS',release:(await active(p)).releaseId,draftPreserved:true,multitab:true});
  generation=3;console.log('install review-3');await update(p);console.log('updated3');await postpone(p,second);console.log('review3 postponed');await p.reload();await ready(p);console.log('reload pending ready');
  await p.getByText('Actualización CASUR pendiente',{exact:true}).waitFor();assert.equal(await p.getByRole('button',{name:'Más tarde',exact:true}).isVisible(),false);
  const lastOrigin=await p.evaluate(()=>performance.timeOrigin),lastSecond=await second.evaluate(()=>performance.timeOrigin);
  await p.getByRole('button',{name:'Instalar actualización',exact:true}).click();
  await p.waitForFunction(t=>performance.timeOrigin!==t,lastOrigin,{timeout:120000});await second.waitForFunction(t=>performance.timeOrigin!==t,lastSecond,{timeout:120000});
  await p.waitForFunction(()=>new Promise(ok=>{const c=new MessageChannel();c.port1.onmessage=e=>ok(e.data.releaseId==='1.5.6-review-3');navigator.serviceWorker.controller.postMessage({type:'CASUR_UPDATE_INFO'},[c.port2])}),null,{timeout:120000});await ready(p);console.log('updated page ready');
  await second.waitForFunction(()=>document.querySelector('#mFrame')?.contentWindow?.CASUR_MODULE_BRIDGE?.moduleId==='tch',null,{timeout:120000});assert.match(JSON.stringify(await draft()),/Consecutive release pending draft/);
  console.log('second update draft preserved');await c.setOffline(true);await p.reload();await ready(p);await second.reload();await second.waitForFunction(()=>document.querySelector('#mFrame')?.contentWindow?.CASUR_MODULE_BRIDGE?.moduleId==='tch',null,{timeout:120000});assert.match(JSON.stringify(await draft()),/Consecutive release pending draft/);
  results.push({step:'consecutive review-2 to review-3, persisted postponement, two clients offline',status:'PASS',release:(await active(p)).releaseId,draftPreserved:true});
  await p.screenshot({path:path.join(out,'consecutive-offline.png')});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(results);await c.close();
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1)});
