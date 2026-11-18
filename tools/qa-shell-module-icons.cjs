// Isolated Chromium profiles: real shell surfaces, PNG bytes, bundle cache and offline.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),http=require('http'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),out=process.argv[2],remote=process.argv[3];fs.mkdirSync(out,{recursive:true});
const ids=['produccion','tch','riego'],manifest=JSON.parse(fs.readFileSync(path.join(root,'core/versions/runtime-assets.json')));
const server=http.createServer((q,r)=>{try{let f=decodeURIComponent(new URL(q.url,'http://local').pathname).replace(/^\/Negocios_de_Cana_CASUR_APP\//,'');if(!f||f.endsWith('/'))f+='index.html';if(f.includes('..'))throw Error('path');const type={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.geojson':'application/json','.webmanifest':'application/manifest+json'}[path.extname(f)]||'application/octet-stream';r.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});r.end(fs.readFileSync(path.join(root,f)));}catch{r.writeHead(404);r.end()}});
(async()=>{
 if(!remote)await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const base=remote||`http://127.0.0.1:${server.address().port}/Negocios_de_Cana_CASUR_APP/`,browser=await chromium.launch({channel:'chrome'}),results=[];
 try{for(const width of [1536,390]){
  const ctx=await browser.newContext({viewport:{width,height:width===390?844:1000}}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base,{waitUntil:'domcontentloaded'});
  if(process.env.CASUR_QA_EXPECTED_SHA){const meta=await(await ctx.request.get(base+'__preview.json')).json();assert.equal(meta.head,process.env.CASUR_QA_EXPECTED_SHA);}
  const check=async(selector)=>{for(const id of ids){const image=p.locator(`${selector} img[src$="/${id}-512.png"]`);await image.waitFor({state:'visible'});await image.evaluate(i=>i.decode());assert.equal(await image.evaluate(i=>i.naturalWidth),512);assert.equal(await image.evaluate(i=>i.naturalHeight),512);}};
  const shot=async(name)=>p.screenshot({path:path.join(out,`${name}-${width}.png`),fullPage:true});
  await check('.mod-card');await shot('inicio');
  if(width>1000){await check('.rail');await shot('sidebar-expandido');await p.locator('#railToggle').click();await check('.rail');await shot('sidebar-contraido');await p.locator('#railToggle').click();}
  await p.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:60000});
  // Prepare all three visible PNGs in core; inspect exactly what the SW will serve offline.
  const cache=await p.evaluate(async()=>{const ask=message=>new Promise(ok=>{const c=new MessageChannel();c.port1.onmessage=e=>ok(e.data);navigator.serviceWorker.controller.postMessage(message,[c.port2])});const status=await ask({type:'BUNDLE_STATUS'}),meta=await caches.open('casur_master_bundle_meta'),marker=await meta.match(new URL('__bundle_ready__/'+encodeURIComponent(status.releaseId)+'/core',location.href)),record=await marker.json(),core=await caches.open(record.cache),bytes={};for(const id of['produccion','tch','riego']){const file='shared/assets/logos/'+id+'-512.png',r=await core.match(new URL(file,location.href));bytes[file]=Array.from(new Uint8Array(await r.arrayBuffer()));}return{releaseId:status.releaseId,bytes};});
  assert.equal(cache.releaseId,manifest.releaseId);for(const[file,bytes]of Object.entries(cache.bytes))assert.equal(crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex'),manifest.assets[file]);
  await ctx.setOffline(true);await p.reload();await check('.mod-card');await shot('inicio-offline');await ctx.setOffline(false);
  await p.locator('.mod-card').filter({hasText:'Maestro de Suertes'}).click();
  await p.waitForFunction(()=>document.querySelector('#mFrame')?.contentWindow?.CASUR_PRODUCTION_READY&&!document.querySelector('#productionStartup'),null,{timeout:90000});
  await p.locator('#mSwitch').click();await check('.module-switcher');await shot('selector');await p.locator('.module-switcher__close').click();await (width>1000?p.locator('[data-rail-path="/"]'):p.locator('#mBack')).click();
  const center=width>1000?p.locator('[data-rail-path="/centro-maestro"]'):p.locator('.nav__item').filter({hasText:'Centro Maestro'});await center.click();
  // Only the default pass in this public checkout, in a disposable empty test profile.
  const pass=fs.readFileSync(path.join(root,'core/permissions/gate.js'),'utf8').match(/const CENTRO_PASS = '([^']+)'/)[1];
  await p.locator('#cpass').fill(pass);await p.locator('#cOk').click();
  await check('.mrow');await shot('centro-maestro');assert.deepEqual(errors,[]);
  results.push({width,status:'PASS',releaseId:cache.releaseId,home:true,sidebar:width>1000?'expanded/collapsed':'not displayed by mobile design',selector:true,centroMaestro:true,offline:true,pngHashes:true,errors});
  fs.writeFileSync(path.join(out,'qa.json'),JSON.stringify({base,sha:process.env.CASUR_QA_EXPECTED_SHA||null,results},null,2));console.log(width,'ICONS PASS');await ctx.close();
 }}finally{await browser.close();if(!remote)server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1)});
