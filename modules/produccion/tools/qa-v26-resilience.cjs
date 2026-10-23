// Isolated QA. Fault injection and screenshot hook exist only in the test browser.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),sharp=require('sharp');
const out=process.env.CASUR_QA_OUT,base=process.env.CASUR_PREVIEW_URL;
async function select(p){await p.evaluate(()=>{goHistoricoModule();toggleHistoricoMultiSelection();addHistoricoMultiFarm('256');for(const id of ['98301','98304','98304A'])toggleHistoricoSuerteSelection('LOTE::'+id,true);renderHistoricoMultiSummary();changeHistoricoMultiPeriod('last5');});await p.waitForSelector('#historicalMultiMap[data-ready="true"]');}
async function capture(p){return p.evaluate(async()=>{try{await historicalHybridReport(await historicalMapModel(getHistoricoDualSummary().selection));return {ok:true,audit:window.CASUR_HISTORICAL_MAP_EXPORT_AUDIT};}catch(e){return {ok:false,error:e.message};}});}
(async()=>{fs.mkdirSync(out,{recursive:true});const b=await chromium.launch({executablePath:process.env.CASUR_CHROME_EXECUTABLE});const report=[];
try{
 const c=await b.newContext({viewport:{width:1440,height:1100},serviceWorkers:'block'}),p=await c.newPage();let size='1400';
 await p.exposeBinding('casurQaCapture',async()=>{
  const handle=p.locator('.casur-geo-export-map-host > .casur-geo-map');
  await handle.evaluate(n=>{n.parentElement.style.left='0';n.parentElement.style.zIndex='2147483647';if(n.querySelector('.leaflet-control-container'))n.querySelector('.leaflet-control-container').style.display='none';});
  await handle.screenshot({path:path.join(out,'native-'+size+'.png')});
  await handle.evaluate(n=>{n.parentElement.style.left='-20000px';if(n.querySelector('.leaflet-control-container'))n.querySelector('.leaflet-control-container').style.display='';});
 });
 await p.route('**/js/casur-enhancements.js',async route=>{let s=await (await route.fetch()).text();s=s.replace('canvas.toDataURL("image/png");','await window.casurQaCapture(mapNode); window.qaRaster=canvas.toDataURL("image/png");');if(size==='1100')s=s.replaceAll('width:1400px;height:1000px','width:1100px;height:800px');await route.fulfill({body:s,contentType:'application/javascript'});});
 for(size of ['1400','1100']){
  await p.goto(base+'/modules/produccion/');await select(p);const captured=await capture(p);assert.equal(captured.ok,true,JSON.stringify(captured));
  fs.writeFileSync(path.join(out,'raster-'+size+'.png'),Buffer.from((await p.evaluate(()=>window.qaRaster)).split(',')[1],'base64'));
  const native=await sharp(path.join(out,'native-'+size+'.png')).removeAlpha().raw().toBuffer({resolveWithObject:true}),raster=await sharp(path.join(out,'raster-'+size+'.png')).removeAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(native.info.width,raster.info.width);assert.equal(native.info.height,raster.info.height);
  let bad=0,sum=0;for(let i=0;i<native.data.length;i+=3){const d=Math.max(...[0,1,2].map(k=>Math.abs(native.data[i+k]-raster.data[i+k])));sum+=d;if(d>40)bad++;}const mismatch=bad/(native.data.length/3);assert.ok(mismatch<.025,'SVG/tile screenshot alignment '+mismatch);report.push({alignment:size,mismatch,meanMaxChannelDifference:sum/(native.data.length/3)});
 }
 // Uninstrumented production code for subsequent scenarios.
 await p.unroute('**/js/casur-enhancements.js');await p.goto(base+'/modules/produccion/');await select(p);
 await p.evaluate(()=>window.qaMap=historicalMapController);await p.evaluate(()=>changeHistoricoMultiPeriod('last3'));assert.equal(await p.evaluate(()=>window.qaMap===historicalMapController),true);
 for(const name of ['Dolores','Rancho Peirano']){await p.locator('#historicalMultiMap .hist-map-focus button').filter({hasText:name}).click();await p.waitForTimeout(700);await p.locator('#historicalMultiMap').screenshot({path:path.join(out,name.replaceAll(' ','-')+'.png')});}
 await p.locator('#historicalMultiMap .hist-map-focus button').first().click();await p.locator('#historicalMultiMap .leaflet-control-zoom-in').click();await p.waitForTimeout(600);await p.locator('#historicalMultiMap').screenshot({path:path.join(out,'zoom.png')});
 await p.evaluate(()=>{toggleHistoricoSuerteSelection('LOTE::98304A',false);toggleHistoricoSuerteSelection('LOTE::98304A',true);toggleHistoricoSuerteSelection('LOTE::98304A',false);});await p.waitForSelector('#historicalMultiMap[data-ready="true"]');assert.equal(await p.evaluate(async()=>(await historicalMapModel(getHistoricoDualSummary().selection)).available),11);
 const before=await p.evaluate(()=>JSON.stringify(getHistoricoDualSummary()));
 for(const mode of ['reference-failed','imagery-incomplete','slow']){
  let rejected=false;await p.route('**/MapServer/tile/**',async route=>{try{const url=route.request().url();if(mode==='reference-failed'&&url.includes('World_Transportation'))return await route.abort();if(mode==='imagery-incomplete'&&!rejected&&url.includes('World_Imagery')){rejected=true;return await route.abort();}if(mode==='slow')await new Promise(r=>setTimeout(r,350));return await route.continue();}catch(error){if(!error.message.includes('Route is already handled'))throw error;/* Leaflet cancelled an obsolete tile while the injected delay was pending. */}});
  const start=Date.now(),result=await capture(p);await p.unrouteAll({behavior:'wait'});assert.equal(result.ok,mode==='slow',JSON.stringify({mode,result}));assert.ok(Date.now()-start<40000);assert.equal(await p.locator('.casur-geo-export-map-host').count(),0);report.push({mode,...result,elapsed:Date.now()-start});
 }
 assert.equal((await capture(p)).ok,true);assert.equal(await p.evaluate(()=>JSON.stringify(getHistoricoDualSummary())),before);report.push({retry:true,periodPreservesMap:true,rapidSelection:true,productivityUnchanged:true});
 await c.close();
 // Real SW: precache, reload offline, inspect exact selection, and explicit fallback PDF.
 const offline=await b.newContext({viewport:{width:390,height:844},acceptDownloads:true}),q=await offline.newPage();await q.goto(base+'/');await q.evaluate(()=>navigator.serviceWorker.ready);await q.goto(base+'/modules/produccion/');await select(q);await q.waitForTimeout(1500);await offline.setOffline(true);await q.reload();await select(q);assert.equal(await q.evaluate(async()=>(await historicalMapModel(getHistoricoDualSummary().selection)).available),12);await q.locator('#historicalMultiMap').screenshot({path:path.join(out,'offline.png')});
 const result=await capture(q);assert.equal(result.ok,false);
 let accepted=false;q.on('dialog',async d=>{if(d.type()==='confirm'){assert.match(d.message(),/SIN mapa base/);accepted=true;await d.accept();}else await d.dismiss();});
 const pending=q.waitForEvent('download',{timeout:90000});await q.locator('[data-pdf-variant="executive"]').click();await (await pending).saveAs(path.join(out,'offline-aceptado.pdf'));assert.equal(accepted,true);report.push({offlineReload:true,polygons:12,hybrid:result,explicitAcceptance:accepted});await offline.close();
 fs.writeFileSync(path.join(out,'resilience.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
