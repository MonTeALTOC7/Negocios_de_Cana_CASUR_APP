// Upgrade the previous PR57 review to the working candidate on one disposable origin.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),http=require('http'),cp=require('child_process'),assert=require('assert/strict'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),out=process.argv[2],previous=process.argv[3]||'6b56f0f6fa40c913a7998e13fb5b5932256021a1';fs.mkdirSync(out,{recursive:true});
const files=new Map();let next=false;
function read(f){if(next)return fs.readFileSync(path.join(root,f));if(!files.has(f))files.set(f,cp.execFileSync('git',['show',`${previous}:${f}`],{cwd:root,maxBuffer:64e6,stdio:['ignore','pipe','ignore']}));return files.get(f);}
const server=http.createServer((q,r)=>{try{let f=new URL(q.url,'http://local').pathname.replace(/^\/Negocios_de_Cana_CASUR_APP\//,'');if(!f||f.endsWith('/'))f+='index.html';if(f.includes('..'))throw Error('path');r.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.webmanifest':'application/manifest+json'})[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'});r.end(read(f));}catch{r.writeHead(404);r.end()}});
(async()=>{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const browser=await chromium.launch({channel:'chrome'});
 try{
  const ctx=await browser.newContext(),p=await ctx.newPage(),base=`http://127.0.0.1:${server.address().port}/Negocios_de_Cana_CASUR_APP/`;
  await p.goto(base);await p.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:60000});
  const ask=()=>p.evaluate(()=>new Promise(ok=>{const c=new MessageChannel();c.port1.onmessage=e=>ok(e.data);navigator.serviceWorker.controller.postMessage({type:'CASUR_UPDATE_INFO'},[c.port2])}));
  const before=await ask();const expected=JSON.parse(fs.readFileSync(path.join(root,'core/versions/runtime-assets.json')));assert.notEqual(before.releaseId,expected.releaseId);
  await p.evaluate(async()=>{localStorage.setItem('qa-icon-draft','keep');await new Promise((ok,no)=>{const q=indexedDB.open('qa-icon-drafts',1);q.onupgradeneeded=()=>q.result.createObjectStore('drafts');q.onerror=no;q.onsuccess=()=>{const d=q.result,t=d.transaction('drafts','readwrite');t.objectStore('drafts').put('keep','pending');t.oncomplete=()=>{d.close();ok()};t.onerror=no;};});});
  next=true;await p.evaluate(()=>navigator.serviceWorker.getRegistration().then(r=>r.update()));await p.getByRole('button',{name:'Instalar actualización',exact:true}).waitFor({timeout:90000});
  const origin=await p.evaluate(()=>performance.timeOrigin);await p.getByRole('button',{name:'Instalar actualización',exact:true}).click();await p.waitForFunction(t=>performance.timeOrigin!==t,origin,{timeout:60000});await p.locator('.mod-card').first().waitFor();
  assert.equal((await ask()).releaseId,expected.releaseId);assert.equal((await ask()).version,before.version);
  await ctx.setOffline(true);await p.reload();await p.locator('.mod-card').first().waitFor();
  for(const id of['produccion','tch','riego']){const f=`shared/assets/logos/${id}-512.png`,bytes=await p.evaluate(async f=>Array.from(new Uint8Array(await(await fetch(f)).arrayBuffer())),f);assert.equal(crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex'),expected.assets[f]);}
  const preserved=await p.evaluate(async()=>({local:localStorage.getItem('qa-icon-draft'),idb:await new Promise(ok=>{const q=indexedDB.open('qa-icon-drafts');q.onsuccess=()=>{const d=q.result,r=d.transaction('drafts').objectStore('drafts').get('pending');r.onsuccess=()=>{ok(r.result);d.close()};};})}));assert.deepEqual(preserved,{local:'keep',idb:'keep'});
  fs.writeFileSync(path.join(out,'update.json'),JSON.stringify({status:'PASS',before,after:await ask(),offlineNewIcons:true,preserved},null,2));await p.screenshot({path:path.join(out,'updated-offline.png')});console.log('SAME VERSION ICON UPDATE/OFFLINE/PERSISTENCE PASS');await ctx.close();
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1)});
