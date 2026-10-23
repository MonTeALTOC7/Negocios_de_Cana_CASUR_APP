// Isolated visual and numeric QA. No changes to datasets or persisted user state.
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const out=process.env.CASUR_QA_OUT,base=process.env.CASUR_PREVIEW_URL;
async function select(p){await p.evaluate(()=>{goHistoricoModule();toggleHistoricoMultiSelection();addHistoricoMultiFarm('256');for(const id of ['98301','98304','98304A'])toggleHistoricoSuerteSelection('LOTE::'+id,true);renderHistoricoMultiSummary();changeHistoricoMultiPeriod('last5');});await p.waitForSelector('#historicalMultiMap[data-ready="true"]');}
async function charts(p){return p.evaluate(()=>{const m=getHistoricoDualSummary(),r=historicoMultiReportCharts();return {full:m.full,period:m.period,chart:[...document.querySelectorAll('.hist-multi-global .historical-chart-card')].map(n=>({values:[...n.querySelectorAll('.historical-chart-value')].map(x=>x.textContent)})),report:r.global};});}
(async()=>{fs.mkdirSync(out,{recursive:true});const b=await chromium.launch({executablePath:process.env.CASUR_CHROME_EXECUTABLE});const results=[];
try{for(const width of [1440,390]){const c=await b.newContext({viewport:{width,height:width===390?844:900},serviceWorkers:'block'}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
assert.equal((await p.goto(base+'/modules/produccion/')).status(),200);await p.waitForFunction(()=>typeof toggleHistoricoMultiSelection==='function');await select(p);
await p.waitForFunction(()=>[...document.querySelectorAll('#historicalMultiMap .leaflet-tile')].every(i=>i.complete&&i.naturalWidth>0),{},{timeout:60000});
const model=await p.evaluate(async()=>await historicalMapModel(getHistoricoDualSummary().selection));assert.equal(model.available,20);assert.equal(model.selected,20);
assert.deepEqual(model.farms.map(f=>[f.farmCode,f.currentIds.length,f.features.length,f.highlightedIds.length,f.contextIds.length]),[['256',9,9,9,0],['983',11,11,3,8]]);
assert.deepEqual(model.farms[0].historicalOnlyIds,['25608','25609','25610','25611','25612','25613']);
assert.equal(await p.locator('.hist-multi-header .hist-multi-included').count(),1);
await p.locator('.hist-multi-header').screenshot({path:out+'/encabezado-'+width+'.png'});
await p.locator('.hist-dual-summary').screenshot({path:out+'/kpis-'+width+'.png'});await p.locator('.hist-multi-included').screenshot({path:out+'/fincas-'+width+'.png'});
for(const [metric,expected] of [['TCH','53.57'],['KATM','105.66']]){
await p.locator('.hist-multi-global .historical-chart-metric button').filter({hasText:metric}).click();const chart=p.locator('.hist-multi-global .historical-chart-card');assert.equal(await chart.locator('.historical-chart-reference-badge').count(),0);assert.equal(await chart.locator('.historical-chart-legend .reference').textContent(),metric+' · zafras seleccionadas: '+expected);
assert.equal(await chart.locator('.historical-chart-point').count(),10);await chart.screenshot({path:out+'/historico-'+metric+'-'+width+'.png'});
}
await p.mouse.move(0,0);
const labelIds=await p.locator('#historicalMultiMap .casur-cartographic-labels g').evaluateAll(nodes=>nodes.map(n=>n.dataset.lotId));
assert.ok(labelIds.length>0);assert.equal(labelIds.some(id=>model.farms[1].contextIds.includes(id)),false);
assert.ok((await p.locator('#historicalMultiMap .leaflet-control-attribution').textContent()).includes('Esri'));
await p.locator('#historicalMultiMap').screenshot({path:out+'/mapa-'+width+'.png'});
const before=await p.evaluate(()=>JSON.stringify(getHistoricoDualSummary()));
await p.locator('#historicalMultiMap path[fill-opacity="0.025"]').first().evaluate(n=>n.dispatchEvent(new MouseEvent('click',{bubbles:true})));
assert.match(await p.locator('.hist-map-identify').textContent(),/Contexto cartográfico; no incluido/);assert.equal(await p.evaluate(()=>JSON.stringify(getHistoricoDualSummary())),before);
const contextualPermanent=await p.evaluate(()=>{const layers=[];historicalMapController;document.querySelector('#historicalMultiMap').dispatchEvent(new MouseEvent('mouseout',{bubbles:true}));return document.querySelectorAll('#historicalMultiMap .casur-geo-label--selected').length;});
assert.equal(contextualPermanent,0);
await p.locator('#historicalMultiMap').screenshot({path:out+'/contexto-interaccion-'+width+'.png'});
const original=await charts(p),counts=[];
for(const [mode,count] of [['latest',1],['last3',3],['last5',5],['all',10]]){await p.evaluate(mode=>changeHistoricoMultiPeriod(mode),mode);const now=await charts(p);assert.deepEqual(now.full,original.full);assert.deepEqual(now.chart,original.chart);const reference=await p.locator('.hist-multi-global .historical-chart-legend .reference').textContent();assert.ok(reference.includes(now.period.katm.toFixed(2)),reference);const subtitle=await p.locator('.dual-period header small').textContent();assert.ok(subtitle.startsWith(count+' zafra'),subtitle);counts.push({mode,subtitle});}
await p.evaluate(()=>changeHistoricoMultiPeriod('last5'));assert.equal(await p.evaluate(()=>JSON.stringify(getHistoricoDualSummary())),before);
await p.evaluate(()=>{changeHistoricoMultiPeriod('custom');for(const z of getHistoricoDualSummary().analysis.requestedCustomZafras)toggleHistoricoMultiZafra(z,false);toggleHistoricoMultiZafra(1920,true);toggleHistoricoMultiZafra(2526,true);});
assert.match(await p.locator('.dual-period header small').textContent(),/2 zafras · 19\/20 · 25\/26/);
await p.evaluate(()=>{toggleHistoricoMultiZafra(1920,false);toggleHistoricoMultiZafra(2526,false);toggleHistoricoMultiZafra(1011,true);toggleHistoricoMultiZafra(1213,true);});
assert.match(await p.locator('.dual-period header small').textContent(),/2 zafras · 10\/11 · 12\/13/);assert.match(await p.locator('.dual-period').textContent(),/0 de 2 zafras solicitadas/);
await p.locator('.dual-period').screenshot({path:out+'/sin-registros-'+width+'.png'});
assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
results.push({width,coverage:model,counts,contextDoesNotChangeAnalysis:true,fullHistoryInvariant:true,errors});
await c.close();}
fs.writeFileSync(out+'/qa-v28.json',JSON.stringify(results,null,2));console.log('V2.8: escritorio/móvil, referencias, inventario, contexto y períodos OK');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
