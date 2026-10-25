// Isolated Chromium QA. AD/AE aforo; BP/BQ authorize proposed harvest date/type only.
// No proposed plan tonnage, target or fractional line is used in estimates.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const X=require('../master/convertidor/js/vendor/xlsx.full.min.js');
const sharedOnly=process.argv.includes('--shared-only'),file=sharedOnly?null:process.argv[2],out=process.env.CASUR_QA_OUT,base=process.env.CASUR_PREVIEW_URL||'http://127.0.0.1:4313/';
if((!file&&!sharedOnly)||!out)throw Error('Supply the authorized Excel and CASUR_QA_OUT (or --shared-only)');
fs.mkdirSync(out,{recursive:true});
if(fs.readdirSync(out).some(n=>!['run-metadata.json','run.log'].includes(n)))throw Error('Evidence already exists; do not overwrite');
const bytes=sharedOnly?null:fs.readFileSync(file),sha=bytes?crypto.createHash('sha256').update(bytes).digest('hex'):null;
const completeSource=['716d374c63aa0e990f18cbabee9f391eee3d54d50fd8395488a8357e5bbcbbae','849e3bac1fa0ff6abd49c690f25ab0910b18282674ddea833283c79d6d46fc04'].includes(sha);
if(!sharedOnly){
assert.ok(completeSource||['82cd45c03b8c80ddda6ebc6078289df4f63b6a380403da6f103f2a52fa30e069','aa9ab25b863dc399d5a6d445c0efe7907ca8956ef868429f308a404a46267fc6'].includes(sha),'Source must match an authorized snapshot');
const book=X.read(bytes,{type:'buffer'}),sheetName=completeSource?'Cronologico':'Estimados_2627',sheet=book.Sheets[sheetName];
const areaColumn=Object.keys(sheet).find(k=>/^[A-Z]+3$/.test(k)&&/area.*ha/i.test(String(sheet[k].v)))?.replace(/3$/,'');
const source={sha256:sha,sheet:sheetName,row:1020,area:sheet[areaColumn+'1020']?.v,tch:sheet.AD1020?.v,
 lastCut:sheet.O1020?.v,sowing:sheet.N1020?.v,header:sheet.AD3?.v,plannedDate:sheet.BP1020?.v,plannedCut:sheet.BQ1020?.v};
// Cell values, not the formula in a workbook total, are the reconciliation input.
assert.equal(source.tch,65);fs.writeFileSync(path.join(out,'source-99336.json'),JSON.stringify(source,null,2));
assert.equal(source.area,8.91);
}
const results=[],exceptions=[],consoleErrors=[];
const write=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2));
async function check(name,fn){try{await fn();results.push({name,passed:true});console.log('PASS',name);}catch(e){results.push({name,passed:false,error:e.stack});throw e;}finally{write('results.json',results);}}
const near=(a,b,key)=>assert.ok(Math.abs(a-b)<0.000001,`${key}: ${a} vs ${b}`);
const cronoUrl=new URL('modules/produccion/',base).href,version='2026.10.25-aforo.1101';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CASUR_CHROME_EXECUTABLE});
 const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
 context.on('page',p=>{p.on('pageerror',e=>exceptions.push(e.stack));p.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});});
 let page=await context.newPage();
 const lot=async()=>{await page.evaluate(()=>{document.querySelector('#cronoSection').open=true;selectCronoSuerteSuggestion('993','36');});await page.waitForTimeout(150);};
 const cards=()=>page.locator('#cronoPrintPanel .kpi').allTextContents();
 async function capture(name){
  for(const [width,height] of [[1440,900],[768,1024],[390,844]]){
   await page.setViewportSize({width,height});
   await page.locator('#cronoContent').evaluate(el=>scrollTo({top:el.getBoundingClientRect().top+scrollY-90,behavior:'instant'}));
   await page.waitForTimeout(250);
   const layout=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,
    cards:[...document.querySelectorAll('#cronoPrintPanel .kpi')].map(el=>{const r=el.getBoundingClientRect();return {text:el.innerText,left:r.left,right:r.right};})}));
   assert.equal(layout.width<=width,true,`${name} ${width} horizontal overflow`);
   assert.ok(layout.cards.every(c=>c.left>=0&&c.right<=width),`${name} ${width} cards fit`);
   write(`${name}-layout-${width}.json`,layout);
   await page.screenshot({path:path.join(out,`${name}-${width}.png`)});
   await page.locator('#cronoContent').screenshot({path:path.join(out,`${name}-ficha-${width}.png`)});
  }
  await page.setViewportSize({width:1440,height:900});
 }
 async function exports(prefix,kind='cronologico'){
  for(const [button,ext] of [['pdf','pdf'],['image','png']]){
   const download=page.waitForEvent('download',{timeout:90000});
   await page.locator(`[data-casur-export-kind="${kind}"] .${button}`).click();
   const d=await download;assert.equal(await d.failure(),null);const target=path.join(out,`${prefix}.${ext}`);await d.saveAs(target);
   assert.ok(fs.statSync(target).size>5000);assert.equal(fs.readFileSync(target).subarray(0,4).toString('hex'),ext==='pdf'?'25504446':'89504e47');
  }
 }
 try{
  await page.goto(base);await page.waitForFunction(()=>!!navigator.serviceWorker.controller,{},{timeout:90000});
  await page.goto(cronoUrl);await page.waitForFunction(()=>!!window.CASUR_READ_OPERATIONAL_WORKBOOK);
  const history=await page.evaluate(()=>JSON.stringify(APP_DATA));
  await check('A: shared 99336 has no applied aforo, six existing cards and no duplicated panel',async()=>{
   await lot();assert.equal(await page.evaluate(()=>CRONO_DATA.meta.dataVersion),'2026.09.06-siagri.1415');
   const texts=await cards();assert.equal(texts.length,6);assert.match(texts[2],/N\/D.*Aforo autorizado no cargado\/aplicado/s);
   assert.match(texts[0],/8.91 ha/);assert.match(texts[1],/67.15/);assert.match(texts[3],/9.72 meses/);assert.match(texts[4],/7.37 km/);
   assert.match(texts[5],/Fecha propuesta de cosecha.*N\/D/s);assert.equal(await page.locator('#operationalAnalysis').count(),0);
   assert.ok(!(await page.locator('body').innerText()).includes('Estimados y plan de cosecha · Consulta'));
   write('A-cards.json',texts);await capture('A-compartidos');
  });
  if(sharedOnly){assert.deepEqual(exceptions,[]);assert.deepEqual(consoleErrors,[]);return;}
  await check('locked import remains protected; choosing the authorized inventory does not apply it',async()=>{
   const denied=await page.evaluate(async()=>{try{await CASUR_READ_OPERATIONAL_WORKBOOK(new File([''],'probe.xlsx'));return false;}catch(e){return e.message;}});assert.match(denied,/Desbloquee/);
   await page.evaluate(()=>sessionStorage.setItem('casurAdminUnlockedAt',String(Date.now())));await page.reload();await page.waitForFunction(()=>!!window.CASUR_READ_OPERATIONAL_WORKBOOK);
   await page.evaluate(()=>document.querySelector('#masterUpdateSection').open=true);
   await page.locator('#operationalFile').setInputFiles({name:path.basename(file),mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bytes});
   await page.waitForFunction(()=>[...document.querySelector('#operationalSheet').options].some(o=>/Cronologico|Estimados_2627/.test(o.textContent)),{},{timeout:90000});
   const selected=await page.locator('#operationalSheet option').evaluateAll(opts=>opts.find(o=>/Cronologico|Estimados_2627/.test(o.textContent)).value);
   await page.locator('#operationalSheet').selectOption(selected);await page.locator('#operationalPlan').selectOption('');
   await page.locator('#operationalVersion').fill(version);await page.locator('#operationalSeason').fill('26/27');await page.locator('#operationalReconcile').click();
   await page.getByText('1046 inventariadas · 1053 en catálogo · 995 activas',{exact:false}).waitFor({timeout:90000});
   assert.equal(await page.locator('#operationalApply').isDisabled(),true);assert.equal(await page.evaluate(()=>CRONO_DATA.meta.dataVersion),'2026.09.06-siagri.1415');
   assert.equal(await page.evaluate(async()=>(await CASUR_MODULE_BRIDGE.checkpoint('pwa-update')).ok),false);
  });
  await check('B: explicit approval applies authorized Cronologico without additional plan lines; official participation and denominators reconcile',async()=>{
   await page.locator('#operationalApproval').check();await page.locator('#operationalApply').click();await page.getByText(/Generación aprobada aplicada/).waitFor({timeout:90000});
   const state=await page.evaluate(()=>({meta:CRONO_DATA.meta,global:CRONO_DATA.global,total:CRONO_DATA.operational.totals,
    planLines:CRONO_DATA.operational.harvestLines.length,selected:CRONO_DATA.producers.find(p=>p.code==='993').details.find(r=>r.codLote==='99336'),
    decisions:CRONO_DATA.producers.flatMap(p=>p.details).filter(r=>['2003','1927','49404A'].includes(r.codLote))}));
   assert.equal(state.meta.dataVersion,version);assert.equal(state.meta.sourceSha256,sha);assert.equal(state.planLines,0);
   for(const [k,v] of Object.entries({catalog:1053,inventoried:1046,active:995,milling:948,seed:47,seedArea:459.01,millingArea:9115.65,
    inventoryArea:9672.13,activeArea:9574.66,millingTons:563187.9696909501,validMillingArea:9115.65,pendingMillingArea:0,pendingConflicts:10,decisions:2}))near(state.total[k],v,k);
   near(state.total.millingTch,563187.9696909501/9115.65,'TCH');assert.equal(state.global.estimateTch,61.78);assert.equal(state.global.estimateArea,9115.65);
   const a=state.decisions.find(r=>r.codLote==='2003'),b=state.decisions.find(r=>r.codLote==='1927');
   assert.equal(a.operationalDecision.destination,'Semilla');assert.equal(a.participatesMilling,false);near(a.area,10.95,'2003 area');assert.equal(a.forecast.tch,0);
   assert.equal(b.destino,'Semilla');assert.equal(b.operationalDecision.destination,'Molienda');assert.equal(b.millingEstimatedTons,430.5);
   const z=state.decisions.find(r=>r.codLote==='49404A');assert.equal(z.classification,'Sin Caña');assert.equal(z.operationalState,'Baja definitiva');
   assert.equal(await page.evaluate(()=>JSON.stringify(APP_DATA)),history);write('reconciliation-applied.json',state);
   await page.evaluate(()=>{window.__qaReadWrites=[];window.__qaPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(v,...args){window.__qaReadWrites.push({store:this.name,key:v?.key});return window.__qaPut.call(this,v,...args);};window.__qaDataBefore=JSON.stringify(CRONO_DATA);});
  });
  await check('B: 99336 shows 65 TCH, 579.15 tons, proposed 24-dic-2026 and Corte mecánico',async()=>{
   await lot();const texts=await cards();assert.equal(texts.length,6);assert.match(texts[2],/65.00.*Aforo autorizado/s);assert.match(texts[5],/Fecha propuesta de cosecha.*24-dic-2026.*Corte mecánico/s);
   const row=await page.locator('#cronoPrintPanel table tbody tr').innerText();assert.match(row,/65.00/);assert.match(row,/579.15 t/);
   const metadata=await page.locator('[data-crono-date]').getAttribute('data-date-metadata');const d=JSON.parse(metadata);
   assert.equal(d.type,'proposed');assert.equal(d.provenance.row,1020);assert.equal(d.provenance.column,68);assert.equal(d.cutProvenance.column,69);assert.equal(d.cutType,'CORTE MECANICO');assert.equal(d.dataVersion,version);assert.equal(d.source.sha256,sha);
   assert.match(row,/CP 72-2086/);assert.match(row,/02-ene-2026/);assert.match(row,/24-dic-2026.*Corte mecánico/s);assert.doesNotMatch(row,/601,000|36,641/);assert.equal(await page.locator('#operationalAnalysis').count(),0);
   write('B-cards.json',texts);write('date-evidence-99336.json',d);await capture('B-aforo-aplicado');await exports('B-suerte-99336');
  });
  await check('Manual, past/missing proposal, missing/unknown BQ; original record remains unchanged',async()=>{
   const samples=await page.evaluate(()=>{
    const api=CASUR_CRONO_PARTICIPATION,all=CRONO_DATA.producers.flatMap(p=>p.details),r=all.find(r=>r.codLote==='99336'),before=JSON.stringify(r);
    const manual=all.find(r=>r.plan?.date?.iso&&r.plan?.cut==='MANUAL');
    const variant=(date,cut)=>api.dateSummary([{...r,plan:{...r.plan,date:{iso:date},cut}}]);
    return {manual:manual?{code:manual.code,lot:manual.suerte,model:api.dateSummary([manual])}:null,
     past:variant('2020-04-11','MANUAL'),missing:variant(null,'MANUAL'),missingType:variant('2026-12-24',null),unknown:variant('2026-12-24','COD-X'),unchanged:before===JSON.stringify(r)};
   });
   assert.ok(samples.manual);assert.equal(samples.manual.model.detail,'Manual');assert.equal(samples.past.display,'11-abr-2020');assert.equal(samples.past.type,'proposed');
   assert.equal(samples.missing.display,'N/D');assert.equal(samples.missingType.detail,'Tipo de corte N/D');assert.equal(samples.unknown.detail,'COD-X · requiere interpretación');assert.equal(samples.unchanged,true);
   write('date-edge-cases.json',{...samples,note:'Manual uses official row; edge cases are detached in-memory models, never imported or persisted'});
   await page.evaluate(({code,lot})=>selectCronoSuerteSuggestion(code,lot),samples.manual);
   assert.match((await cards())[5],/Manual/);await page.locator('#cronoContent').screenshot({path:path.join(out,'B-corte-manual.png')});
  });
  await check('changing lot, farm and multiple selection uses the same valid milling denominator',async()=>{
   await page.evaluate(()=>selectCronoSuerteSuggestion('20','03'));assert.match((await cards())[2],/0.00.*Estimado cero/s);
   await page.evaluate(()=>selectCronoSuerteSuggestion('19','27'));assert.match((await cards())[2],/70.00/);
   await page.evaluate(()=>renderCronoProducer('993'));assert.equal(await page.locator('#cronoProducerSelect').inputValue(),'993');
   const farm=await page.evaluate(()=>{const p=CRONO_DATA.producers.find(p=>p.code==='993');return {stored:p.estimateTch,summary:CASUR_CRONO_PARTICIPATION.summary(p.details)};});
   near(farm.stored,farm.summary.estimateTch,'farm TCH');assert.match((await cards())[5],/Varias fechas/);write('reconciliation-finca-993.json',farm);await page.locator('#cronoContent').screenshot({path:path.join(out,'B-finca-993.png')});await exports('B-finca-993');
   await page.evaluate(()=>{clearCronoMultiSelection();toggleCronoSuerteSelection('993::36',true);toggleCronoSuerteSelection('19::27',true);toggleCronoSuerteSelection('20::03',true);renderCronoMultiSummary();});
   const multi=await page.locator('#cronoContent').innerText();const tch=(579.15+430.5)/(8.91+6.15);
   assert.match(multi,new RegExp(tch.toFixed(2)));assert.match(multi,/1,009.65 t/);assert.match(multi,/15.06 ha/);assert.match(multi,/Cosecha propuesta: Varias fechas/);assert.match(multi,/Propuesta: 24-dic-2026 · Corte mecánico/);
   await page.locator('#cronoContent').screenshot({path:path.join(out,'B-seleccion-multiple.png')});await exports('B-multiple','cronologico-multiple');
   write('reconciliation-selection.json',{keys:['99336','1927','2003'],tons:1009.65,validArea:15.06,tch,seedExcluded:10.95});
   await page.evaluate(()=>{clearCronoMultiSelection();document.querySelector('#zoneMainSection').open=true;goCronoZoneModule();});
   assert.match(await page.locator('#cronoZoneContent').textContent(),/563,187.97 t/);await page.locator('#cronoZoneContent').screenshot({path:path.join(out,'B-zonas.png')});
  });
  await check('all farms reconcile without cross-generation rows; consultation/export perform no IDB writes',async()=>{
   const reconciled=await page.evaluate(()=>CRONO_DATA.producers.map(p=>{
    const valid=p.details.filter(r=>r.sourcePresence==='present'&&r.operationalState!=='Baja definitiva'&&
     (r.operationalDecision?.destination||r.classification)==='Molienda'&&r.inventoryArea>0&&r.forecast?.tch>0);
    const area=valid.reduce((n,r)=>n+r.inventoryArea,0),tons=valid.reduce((n,r)=>n+r.inventoryArea*r.forecast.tch,0);
    return {code:p.code,area,tons,tch:area?tons/area:null,shown:CASUR_CRONO_PARTICIPATION.summary(p.details)};
   }));
   for(const r of reconciled){near(r.shown.estimateArea,Math.round(r.area*100)/100,r.code+' area');
    if(r.tch===null)assert.equal(r.shown.estimateTch,null);else near(r.shown.estimateTch,Math.round(r.tch*100)/100,r.code+' TCH');
    if(r.area)near(r.shown.estimateTons,Math.round(r.tons*100)/100,r.code+' tons');}
   write('reconciliation-all-farms.json',reconciled);
   const archive=await page.evaluate(async v=>{const store=await import('../../core/shared-data/master-store.js');const versions=await store.listOperationalGenerations(),entry=versions.find(r=>r.dataVersion===v),r=entry?.operationalDataset?.cronologico?.producers.flatMap(p=>p.details).find(r=>r.codLote==='99336');return {count:versions.length,version:entry?.dataVersion,model:CASUR_CRONO_PARTICIPATION.dateSummary(r?[r]:[]),activeVersion:CRONO_DATA.meta.dataVersion};},version);
   assert.equal(archive.version,version);assert.equal(archive.activeVersion,version);assert.equal(archive.model.display,'24-dic-2026');write('archived-generation.json',archive);
   assert.deepEqual(await page.evaluate(()=>window.__qaReadWrites),[]);
   assert.equal(await page.evaluate(()=>JSON.stringify(CRONO_DATA)===window.__qaDataBefore),true);
   await page.evaluate(()=>{IDBObjectStore.prototype.put=window.__qaPut;});
  });
  await check('offline cold page reopens approved extraction, six cards and unchanged historical data',async()=>{
   await context.setOffline(true);await page.close();page=await context.newPage();
   await page.addInitScript(()=>sessionStorage.setItem('casurAdminUnlockedAt',String(Date.now())));
   await page.goto(cronoUrl);await page.waitForFunction(v=>window.CRONO_DATA?.meta?.dataVersion===v,version,{timeout:60000});
   await lot();assert.match((await cards())[2],/65.00/);assert.match((await cards())[5],/24-dic-2026/);
   assert.equal(await page.evaluate(()=>JSON.stringify(APP_DATA)),history);write('offline.json',await page.evaluate(async()=>({version:CRONO_DATA.meta.dataVersion,controller:navigator.serviceWorker.controller?.scriptURL,caches:await caches.keys(),cards:[...document.querySelectorAll('#cronoPrintPanel .kpi')].map(e=>e.innerText)})));
   await page.locator('#cronoContent').screenshot({path:path.join(out,'B-offline-ficha.png')});
  });
  await check('offline rollback restores the old shared view and explicit aforo-not-applied condition',async()=>{
   await page.evaluate(()=>document.querySelector('#masterUpdateSection').open=true);page.once('dialog',d=>d.accept());await page.locator('#operationalRestore').click();
   await page.getByText(/Versión anterior recuperada/).waitFor({timeout:60000});await lot();
   assert.equal(await page.evaluate(()=>CRONO_DATA.meta.dataVersion),'2026.09.06-siagri.1415');assert.match((await cards())[2],/N\/D.*no cargado\/aplicado/s);
   assert.match((await cards())[5],/Fecha propuesta de cosecha.*N\/D/s);assert.equal(await page.locator('#operationalAnalysis').count(),0);
   assert.equal(await page.evaluate(()=>JSON.stringify(APP_DATA)),history);await page.locator('#cronoContent').screenshot({path:path.join(out,'rollback-ficha.png')});
  });
  await check('no browser exceptions and source workbook unchanged',async()=>{assert.deepEqual(exceptions,[]);assert.deepEqual(consoleErrors,[]);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),sha);});
 }catch(e){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});write('failure.json',{error:e.stack,exceptions,consoleErrors});throw e;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
