// Reproducible headless regression test. Uses new, isolated browser contexts,
// loopback origins only, existing engines/export buttons and read-only IDB.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=path.resolve(process.argv[2]||'');
if(!process.argv[2])throw Error('Usage: node tools/qa-maestro-ux.cjs EVIDENCE_DIRECTORY');
fs.mkdirSync(out,{recursive:true});
const results=[],errors=[],save=(name,value)=>fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(value,null,2));
async function check(name,fn){try{const detail=await fn();results.push({name,status:'PASS',detail});console.log('PASS',name);return detail;}catch(e){results.push({name,status:'FAIL',error:e.stack});throw e;}finally{save('results',results);}}
const browserPath=process.env.CASUR_CHROME_EXECUTABLE;
let browser;
async function boot(port,label){
 const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'America/Mexico_City',acceptDownloads:true});
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'||r.request().url().startsWith('blob:')?r.continue():r.abort());
 const page=await context.newPage();page.setDefaultTimeout(20000);
 page.on('pageerror',e=>errors.push({label,message:e.message}));
 page.on('dialog',async d=>{if(d.type()==='confirm'&&/mapa híbrido/.test(d.message()))await d.accept();else await d.dismiss();});
 await page.goto(`http://127.0.0.1:${port}/Negocios_de_Cana_CASUR_APP/#/modulo/produccion`);
 const frame=await ready(page);return{context,page,frame,label};
}
async function ready(page){await page.waitForFunction(()=>document.querySelector('#mFrame')?.contentWindow?.CASUR_PRODUCTION_READY===true,null,{timeout:90000});return page.frames().find(f=>f.url().includes('/modules/produccion/'));}
async function state(frame){return frame.evaluate(()=>{const content=document.querySelector('#cronoContent'),detail=!!document.querySelector('#cronoPrintPanel'),scope=detail?content.dataset.geoScope:content.querySelector('.crono-multi-result-table')?'multiple':'general';return{generation:CRONO_DATA.meta.dataVersion,crono:CASUR_CRONO_SELECTION.capture(),history:CASUR_HISTORY_SELECTION.capture(),view:window.CASUR_MAESTRO_UX?.capture(),scope,lot:scope==='lot'?content.dataset.geoLotId:null};});}
async function idb(page){return page.evaluate(async()=>{const all={};for(const{name}of await indexedDB.databases()){const db=await new Promise((ok,no)=>{const r=indexedDB.open(name);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});all[name]={version:db.version,stores:{}};for(const s of db.objectStoreNames)all[name].stores[s]=await new Promise((ok,no)=>{const r=db.transaction(s,'readonly').objectStore(s).getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});db.close();}return JSON.stringify(all);});}
async function shot(run,name,width=1440,height=900){await run.page.setViewportSize({width,height});await run.frame.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await run.page.screenshot({path:path.join(out,`${run.label}-${name}-${width}.png`),animations:'disabled'});return run.frame.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth}));}
async function download(run,selector,name){if(run.label==='after'&&selector.includes('cronologico')){const trigger=run.frame.locator(selector).locator('xpath=ancestor::*[@data-casur-export-kind]').getByRole('button',{name:'Informe',exact:true});await trigger.waitFor({state:'visible'});if(!await run.frame.locator(selector).isVisible())await trigger.click();}await run.frame.locator(selector).waitFor({state:'visible'});const wait=run.page.waitForEvent('download',{timeout:120000});await run.frame.locator(selector).click();const d=await wait;const target=path.join(out,run.label+'-'+name);await d.saveAs(target);assert.ok(fs.statSync(target).size>10000);return{file:path.basename(target),bytes:fs.statSync(target).size};}
async function selectView(run,name){const menu=run.frame.locator('#maestroMenu');if(await menu.isVisible())await menu.click();await run.frame.getByRole('tab',{name,exact:true}).click();}
async function openCrono(run){if(run.label==='after')await run.frame.getByRole('tab',{name:'Cronológico',exact:true}).click();else await run.frame.locator('.module-crono').click();}
async function revealQuery(run,id){const input=run.frame.locator(id);if(!await input.isVisible())await run.frame.locator(id==='#q'?'#fichaSection .maestro-query > summary':'#cronoSection .maestro-query > summary').click();}
async function choose(run,q){await revealQuery(run,'#cronoQ');await run.frame.locator('#cronoQ').fill(q);await run.frame.locator('#cronoQ').press('Enter');await run.frame.locator('#cronoPrintPanel').waitFor();}
async function lotModel(run){return run.frame.evaluate(()=>({kpis:[...document.querySelectorAll('#cronoPrintPanel .kpi')].map(x=>x.textContent.trim()),columns:document.querySelectorAll('#cronoContent .table-wrap table th').length,chart:[...document.querySelectorAll('#cronoContent .crono-trend-card svg text')].map(x=>x.textContent),rows:document.querySelector('#cronoContent table')?.textContent}));}
async function historyFull(run){if(run.label==='after')await run.frame.getByRole('tab',{name:'Histórico',exact:true}).click();else await run.frame.evaluate(()=>goHistoricoModule());await run.frame.locator('#historicoMultiToggle').click();for(const code of ['25','993']){await revealQuery(run,'#q');await run.frame.locator('#q').fill(code);await run.frame.locator('#searchSuggestions button').first().click();await run.frame.getByRole('button',{name:'Agregar finca completa',exact:true}).click();}await run.frame.locator('[data-casur-export-kind="historico-multiple"]').waitFor();}
async function historyModel(run){return run.frame.evaluate(()=>({selection:CASUR_HISTORY_SELECTION.capture(),dual:getHistoricoDualSummary(),mapPaths:document.querySelectorAll('#historicalMultiMap path.leaflet-interactive').length}));}
(async()=>{
 browser=await chromium.launch({headless:true,...(browserPath?{executablePath:browserPath}:{channel:'chrome'})});
 const before=await boot(Number(process.env.CASUR_BASELINE_PORT||4380),'before'),after=await boot(Number(process.env.CASUR_QA_PORT||4381),'after');
 const beforeIDB=await idb(before.page),afterIDB=await idb(after.page);
 await check('Resumen efectivo, fuente, área y denominadores correctos',async()=>{
  const s=await after.frame.evaluate(()=>({view:CASUR_MAESTRO_UX.capture(),source:document.querySelector('#maestroSource').textContent,values:['maestroActiveArea','maestroPreviousTch','maestroEstimateTons','maestroEstimateTch'].map(id=>document.getElementById(id).textContent),totals:CASUR_CRONO_PARTICIPATION.summary(CRONO_DATA.producers.flatMap(p=>p.details))}));
  assert.equal(s.view,'resumen');assert.equal(s.totals.estimateArea,9115.65);assert.equal(s.totals.estimateTons,563187.97);assert.equal(s.totals.estimateTch,61.78);assert.equal(s.totals.activeLots,995);assert.equal(s.totals.catalogLots,1053);assert.equal(s.totals.seedLots,47);assert.match(s.source,/oficiales/);
  await shot(before,'resumen');await shot(before,'resumen',390,844);for(const[w,h]of[[1440,900],[1280,800],[768,1024],[390,844]]){const size=await shot(after,'resumen',w,h);assert.ok(size.scrollWidth<=size.width,JSON.stringify(size));}await after.page.setViewportSize({width:1440,height:900});return s;
 });
 await check('Cronológico: General completo, cinco KPI y siete paneles originales',async()=>{
  for(const run of [before,after]){await openCrono(run);const s=await run.frame.evaluate(()=>({values:[...document.querySelectorAll('.crono-general-kpis strong')].map(x=>x.textContent),kpis:document.querySelectorAll('.crono-general-kpis .kpi').length,area:document.querySelectorAll('.crono-area-analysis .crono-box').length,yields:document.querySelectorAll('.crono-yield-analysis .crono-box').length,detail:!!document.querySelector('#cronoPrintPanel')}));assert.equal(s.kpis,5);assert.equal(s.area,4);assert.equal(s.yields,3);assert.equal(s.detail,false);run.general=s;await shot(run,'general');}assert.deepEqual(after.general,before.general);return after.general;
 });
 await check('Búsqueda de finca por teclado y ficha 99336: seis KPI, ocho zafras, 18 columnas',async()=>{
  await after.frame.locator('#cronoQ').fill('Pansaco');await after.frame.locator('#cronoQ').press('ArrowDown');assert.ok(await after.frame.locator('#cronoQ').getAttribute('aria-activedescendant'));await after.frame.locator('#cronoQ').press('Enter');assert.equal(await after.frame.locator('#cronoProducerSelect').inputValue(),'993');await shot(after,'finca993');
  for(const run of [before,after]){await choose(run,'99336');run.lot=await lotModel(run);assert.equal(run.lot.kpis.length,6);assert.equal(run.lot.columns,18);assert.ok(run.lot.kpis.some(x=>x.includes('65.00')&&x.includes('12-oct-2026')));assert.ok(run.lot.kpis.some(x=>x.includes('24-dic-2026')&&x.includes('Corte mecánico')));assert.equal(run.lot.chart.filter(x=>/^\d{2}\/\d{2}$/.test(x)).length,8);await run.frame.locator('#cronoContent [data-casur-geo-action]').waitFor({state:'attached'});await shot(run,'99336');const mobile=await shot(run,'99336',390,844);if(run.label==='after')assert.ok(mobile.scrollWidth<=390);await run.page.setViewportSize({width:1440,height:900});}
  assert.deepEqual(after.lot,before.lot);return after.lot;
 });
 await check('Mapas reales y descargas PDF/PNG de suerte con generadores originales',async()=>{
  const files=[];for(const run of [before,after]){await run.frame.locator('#cronoContent [data-casur-geo-action]').waitFor({state:'attached'});await run.frame.locator('#cronoContent [data-casur-geo-action]').evaluate(n=>n.click());await run.frame.locator('#casurGeoMap .leaflet-interactive').first().waitFor();await shot(run,'mapa99336');await run.frame.locator('.casur-geo-close').click();files.push(await download(run,'[data-casur-export-kind="cronologico"] .pdf','99336.pdf'));files.push(await download(run,'[data-casur-export-kind="cronologico"] .image','99336.png'));}return files;
 });
 await check('Retornos finca y General preservan ficha y selección; finca 494 sin promediar fechas',async()=>{
  await after.frame.locator('#maestroBackFarm').click();assert.equal((await state(after.frame)).scope,'farm');await after.frame.locator('#maestroGeneral').click();assert.equal(await after.frame.locator('.crono-general-kpis .kpi').count(),5);
  for(const run of[before,after]){await choose(run,'494');run.farm494=await lotModel(run);assert.match(run.farm494.rows,/Varias fechas|24-|2026/);await shot(run,'finca494');}assert.deepEqual(after.farm494,before.farm494);return after.farm494;
 });
 await check('PDF y PNG de finca completos; Semilla 2003 y Molienda 1927 conservadas',async()=>{
  const files=[];for(const run of[before,after]){await choose(run,'993');files.push(await download(run,'[data-casur-export-kind="cronologico"] .pdf','finca993.pdf'));files.push(await download(run,'[data-casur-export-kind="cronologico"] .image','finca993.png'));}
  const participation=await after.frame.evaluate(()=>['2003','1927'].map(code=>{const row=CRONO_DATA.producers.flatMap(p=>p.details).find(r=>r.codLote===code);return{code,current:row.participatesCurrentArea,milling:row.participatesMilling,summary:CASUR_CRONO_PARTICIPATION.summary([row])};}));assert.equal(participation[0].milling,false);assert.equal(participation[1].milling,true);assert.equal(participation[1].summary.estimateTons,430.5);return{files,participation};
 });
 await check('Cronológico múltiple conserva selección al navegar y exporta lo elegido',async()=>{
  await after.frame.locator('.context-search-options').evaluate(n=>n.open=true);await after.frame.locator('#cronoMultiToggle').click();await after.frame.evaluate(()=>{selectCronoSuerteSuggestion('993','36');selectCronoSuerteSuggestion('494','01');renderCronoMultiSummary();});const prior=(await state(after.frame)).crono;for(const name of['Resumen','Histórico','Zonas','Análisis','Cronológico'])await selectView(after,name);assert.deepEqual((await state(after.frame)).crono,prior);assert.equal(prior.keys.length,2);const files=[await download(after,'[data-casur-export-kind="cronologico-multiple"] .pdf','crono-multiple.pdf'),await download(after,'[data-casur-export-kind="cronologico-multiple"] .image','crono-multiple.png')];return{prior,files};
 });
 await check('Histórico multifinca 25 + 993: mismas 64 suertes, cobertura, KPI y polígonos',async()=>{
  for(const run of[before,after]){await historyFull(run);await run.frame.locator('#historicalMultiMap .leaflet-interactive').first().waitFor();run.hist=await historyModel(run);assert.equal(run.hist.selection.selected.length,64);await shot(run,'historico25-993');}assert.deepEqual(after.hist.dual,before.hist.dual);assert.deepEqual(after.hist.selection,before.hist.selection);assert.equal(after.hist.mapPaths,before.hist.mapPaths);return{selection:after.hist.selection,mapPaths:after.hist.mapPaths};
 });
 await check('Histórico: períodos 1/3/5/todas/personalizado y persistencia entre pestañas',async()=>{
  const periods=[];for(const label of['Últimas 3','Últimas 5','Todas','Personalizado']){await after.frame.getByRole('button',{name:label,exact:true}).click();periods.push((await state(after.frame)).history.period);}await after.frame.getByRole('checkbox',{name:'18/19',exact:true}).check();const saved=(await state(after.frame)).history;for(const name of['Resumen','Zonas','Análisis','Cronológico','Histórico'])await selectView(after,name);assert.deepEqual((await state(after.frame)).history,saved);await after.frame.getByRole('button',{name:'Última',exact:true}).click();return{periods,saved};
 });
 await check('PDF ejecutivo/completo y PNG histórico reales, antes/después',async()=>{
  const files=[];for(const run of[before,after]){files.push(await download(run,'[data-casur-export-kind="historico-multiple"] [data-pdf-variant="executive"]','historico-ejecutivo.pdf'));files.push(await download(run,'[data-casur-export-kind="historico-multiple"] [data-pdf-variant="complete"]','historico-completo.pdf'));files.push(await download(run,'[data-casur-export-kind="historico-multiple"] .image','historico.png'));}return files;
 });
 await check('Histórico mezcla finca completa y suertes parciales sin perder selección',async()=>{
  await after.frame.getByRole('button',{name:'Modificar suertes de 993',exact:true}).click();await after.frame.locator('#fichaContent .hist-row-check').first().uncheck();const partial=(await state(after.frame)).history;assert.equal(partial.farms['25'].mode,'full');assert.equal(partial.farms['993'].mode,'partial');assert.equal(partial.selected.length,63);
  await selectView(after,'Cronológico');await selectView(after,'Histórico');assert.deepEqual((await state(after.frame)).history,partial);await after.frame.getByRole('button',{name:'Agregar finca completa',exact:true}).click();assert.equal((await state(after.frame)).history.selected.length,64);return partial;
 });
 await check('Responsive dentro del iframe, todas las vistas y tabla completa',async()=>{
  const sizes=[];for(const[w,h]of[[1440,900],[1280,800],[768,1024],[390,844]]){for(const[name,key]of[['Resumen','resumen'],['Cronológico','cronologico'],['Histórico','historico'],['Zonas','zonas'],['Análisis','analisis']]){await selectView(after,name);const size=await shot(after,key,w,h);assert.ok(size.scrollWidth<=size.width,`${name}: ${JSON.stringify(size)}`);sizes.push({name,...size});}}return sizes;
 });
 await check('Recarga PWA, otra ventana y offline conservan contextos separados',async()=>{
  await selectView(after,'Histórico');const saved=await state(after.frame);await after.page.reload();after.frame=await ready(after.page);assert.deepEqual(await state(after.frame),saved);
  const second=await after.context.newPage();await second.goto('http://127.0.0.1:'+(process.env.CASUR_QA_PORT||4381)+'/Negocios_de_Cana_CASUR_APP/#/modulo/produccion');const f2=await ready(second);assert.equal((await state(f2)).view,'resumen');assert.deepEqual(await state(after.frame),saved);await second.close();
  await after.page.waitForFunction(()=>!!navigator.serviceWorker.controller);await after.context.setOffline(true);await after.page.reload();after.frame=await ready(after.page);assert.deepEqual(await state(after.frame),saved);await shot(after,'offline',390,844);await after.context.setOffline(false);return saved;
 });
 await check('Consulta y exportación no mutan IndexedDB; cero errores JS',async()=>{assert.equal(await idb(before.page),beforeIDB);assert.equal(await idb(after.page),afterIDB);assert.deepEqual(errors,[]);return{unchanged:true,errors};});
 save('summary',{status:'PASS',groups:results.length,onlyLoopback:true,externalTilesBlocked:true,mapFallback:'Both baseline and candidate accepted original no-basemap confirmation; official polygons retained',errors});
 await before.context.close();await after.context.close();await browser.close();
})().catch(async e=>{console.error(e.stack);save('summary',{status:'FAIL',error:e.stack,errors});if(browser)await browser.close();process.exitCode=1;});
