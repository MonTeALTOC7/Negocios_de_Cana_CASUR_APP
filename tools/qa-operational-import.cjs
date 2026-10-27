// QA only. Workbook paths are supplied locally; originals are never copied to the repo.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const X=require('../master/convertidor/js/vendor/xlsx.full.min.js');
const root=path.resolve(__dirname,'..'),out=process.env.CASUR_QA_OUT,base=process.env.CASUR_PREVIEW_URL||'http://127.0.0.1:4313/';
const [extractFile,completeFile]=process.argv.slice(2);if(!out||!extractFile||!completeFile)throw Error('CASUR_QA_OUT and two workbook paths required');fs.mkdirSync(out,{recursive:true});
if(fs.readdirSync(out).some(name=>!['run-metadata.json','run.log'].includes(name)))throw Error('QA output already contains evidence; review/archive before reuse. No files overwritten.');
const hashes=[extractFile,completeFile].map(file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
const results=[];async function check(name,fn){await fn();results.push({name,passed:true});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log('PASS',name);}
const book=X.read(fs.readFileSync(extractFile),{type:'buffer'}),sheet=book.Sheets[book.SheetNames[0]],range=X.utils.decode_range(sheet['!ref']);
const source=X.utils.sheet_to_json(sheet,{header:1,raw:true,defval:null,range:{s:{r:0,c:0},e:range.e}});
const reordered=source.map(row=>[...row].reverse());
reordered[2]=reordered[2].map(h=>h==='Cod. Hacienda'?'Código finca':h==='Ste'?'Suerte':h==='Area Ha'?'ÁREA':h);
const fixture=X.utils.book_new();X.utils.book_append_sheet(fixture,X.utils.aoa_to_sheet(reordered),'Nombre completamente diferente');
const renamedFile=path.join(out,'qa-renombrado-reordenado.xlsx');fs.writeFileSync(renamedFile,X.write(fixture,{type:'buffer',bookType:'xlsx'}));
const invalid=X.utils.book_new();X.utils.book_append_sheet(invalid,X.utils.aoa_to_sheet([['Cod','Suerte','Area','Clasificacion','actTCH','Nombre Hacienda','Tch.Ant'],['810','01',10,'Molienda',50,'Sintético',40],['810','01',10,'Molienda',50,'Sintético',40]]),'ambiguo');
const invalidFile=path.join(out,'qa-duplicado-sintetico.xlsx');fs.writeFileSync(invalidFile,X.write(invalid,{type:'buffer',bookType:'xlsx'}));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CASUR_CHROME_EXECUTABLE});const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
 const exceptions=[];context.on('page',p=>p.on('pageerror',e=>exceptions.push(e.message)));const page=await context.newPage();
 try{
  await page.goto(base);await page.waitForFunction(()=>!!navigator.serviceWorker.controller,{},{timeout:90000});
  await page.goto(new URL('modules/produccion/',base).href);await page.waitForFunction(()=>!!window.CASUR_READ_OPERATIONAL_WORKBOOK);
  const historicalHash=await page.evaluate(()=>JSON.stringify(window.APP_DATA));
  await check('permissions: locked import rejected before reading or changing data',async()=>{
   const result=await page.evaluate(async()=>{try{await CASUR_READ_OPERATIONAL_WORKBOOK(new File([''],'dummy.xlsx'));return 'unexpected';}catch(e){return e.message;}});assert.match(result,/Desbloquee/);
   assert.equal(await page.evaluate(()=>CRONO_DATA.global.suertes),1053);
  });
  // Only the isolated test profile is marked unlocked. Production permission code is unchanged.
  await page.evaluate(()=>sessionStorage.setItem('casurAdminUnlockedAt',String(Date.now())));await page.reload();await page.waitForFunction(()=>!!window.CASUR_READ_OPERATIONAL_WORKBOOK);
  await page.evaluate(()=>{document.querySelector('#masterUpdateSection').open=true;});
  await check('complete workbook detected by content, inventory explicitly selected, optional split plan kept separate',async()=>{
   await page.locator('#operationalFile').setInputFiles(completeFile);
   await page.waitForFunction(()=>[...document.querySelector('#operationalSheet').options].some(o=>/Cronologico/.test(o.textContent)),{},{timeout:90000});
   const inventory=await page.locator('#operationalSheet option').evaluateAll(options=>options.find(o=>/Cronologico/.test(o.textContent)).value);await page.locator('#operationalSheet').selectOption(inventory);
   const plan=await page.locator('#operationalPlan option').evaluateAll(options=>options.find(o=>/1050 líneas/.test(o.textContent))?.value);assert.ok(plan);await page.locator('#operationalPlan').selectOption(plan);
   await page.locator('#operationalVersion').fill('2026.10.24-aforo.1001');await page.locator('#operationalReconcile').click();
   await page.getByText('1046 inventariadas · 1053 en catálogo · 995 activas · 7 ausentes',{exact:true}).waitFor({timeout:90000});
   assert.equal(await page.evaluate(()=>CRONO_DATA.global.area),10030.65);assert.equal(await page.locator('#operationalApply').isDisabled(),true);
   assert.equal(await page.evaluate(async()=>(await CASUR_MODULE_BRIDGE.checkpoint('pwa-update')).ok),false);
   await page.locator('.operational-import').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'preview-desktop.png'),fullPage:false});
   await page.locator('#operationalResults > details').evaluate(el=>{el.open=true;});
   await page.locator('#operationalIssues').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'quality-desktop.png')});
   await page.locator('#operationalResults > details').evaluate(el=>{el.open=false;});
   await page.getByRole('cell',{name:'49404A',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'inactive-49404A.png')});
  });
  await check('explicit approval applies atomically with reconciled figures and permanent inactive identities',async()=>{
   await page.locator('#operationalApproval').check();await page.locator('#operationalApply').click();
   await page.getByText(/Generación aprobada aplicada/).waitFor({timeout:90000});
   const state=await page.evaluate(()=>({meta:CRONO_DATA.meta,total:CRONO_DATA.operational.totals,lines:CRONO_DATA.operational.harvestLines.length,
    special:CRONO_DATA.producers.flatMap(p=>p.details).filter(r=>['49404A','2003','1927','14710A'].includes(r.codLote))}));
   assert.equal(state.total.catalog,1053);assert.equal(state.total.inventoried,1046);assert.equal(state.total.absent,7);assert.equal(state.lines,1050);
   for(const [key,value] of Object.entries({inventoryArea:9672.13,activeArea:9574.66,millingArea:9115.65,seedArea:459.01,validMillingArea:9115.65,pendingMillingArea:0,millingTons:563187.9696909501,millingTch:563187.9696909501/9115.65}))assert.ok(Math.abs(state.total[key]-value)<0.000001,key);
   assert.equal(state.total.usable,948);assert.equal(state.total.milling,948);assert.equal(state.total.seed,47);assert.equal(state.total.zero,0);assert.equal(state.total.conflicts,12);assert.equal(state.total.pendingConflicts,10);assert.equal(state.total.decisions,2);
   assert.equal(state.special.find(r=>r.codLote==='2003').operationalDecision.destination,'Semilla');assert.equal(state.special.find(r=>r.codLote==='2003').participatesMilling,false);assert.equal(state.special.find(r=>r.codLote==='1927').millingEstimatedTons,430.5);
   assert.equal(state.special.find(r=>r.codLote==='49404A').area,0);assert.equal(state.special.find(r=>r.codLote==='2003').destino,'Semilla');assert.equal(state.special.find(r=>r.codLote==='2003').classification,'Molienda');assert.equal(state.special.find(r=>r.codLote==='14710A').sourcePresence,'absent');
   assert.equal(state.meta.generated,'2026-10-12');assert.equal(await page.evaluate(()=>JSON.stringify(APP_DATA)),historicalHash);
   assert.equal(await page.evaluate(async()=>(await CASUR_MODULE_BRIDGE.checkpoint('pwa-update')).ok),true);
   fs.writeFileSync(path.join(out,'reconciliation-applied.json'),JSON.stringify(state,null,2));await page.screenshot({path:path.join(out,'applied-desktop.png')});
  });
  await check('B1: chronological home, producer, lot and zone use the approved universes',async()=>{
   const model=await page.evaluate(()=>({global:CRONO_DATA.global,producers:CRONO_DATA.producers.length,options:document.querySelector('#cronoProducerSelect').options.length,
    farm:CRONO_DATA.producers.find(p=>p.code==='993'),lot:CRONO_DATA.producers.flatMap(p=>p.details).find(r=>r.codLote==='49404A')}));
   assert.equal(model.global.area,9574.66);assert.equal(model.global.inventoryArea,9672.13);assert.equal(model.global.millingArea,9115.65);
   assert.equal(model.global.activeLots,995);assert.equal(model.global.absentLots,7);assert.equal(model.options,model.producers+1);
   assert.ok(Math.abs(model.global.estimateTons-563187.97)<0.001);assert.equal(model.lot.classification,'Sin Caña');
   assert.equal(model.lot.operationalState,'Baja definitiva');
   await page.evaluate(()=>{document.querySelector('#cronoSection').open=true;renderCronoHome();});
   assert.match(await page.locator('.casur-release-strip').innerText(),/Generación local aprobada · versión 2026\.10\.24-aforo\.1001/);
   assert.match(await page.locator('#cronoContent').innerText(),/Área activa[\s\S]*9,574\.66 ha[\s\S]*Inventario 9,672\.13 ha/i);
   assert.match(await page.locator('#cronoContent').innerText(),/Suertes activas[\s\S]*995[\s\S]*1,053 catálogo/i);
   assert.match(await page.locator('#cronoContent').innerText(),/948\/948 molienda[\s\S]*100\.00% área/);
   await page.locator('#cronoContent').scrollIntoViewIfNeeded();await page.waitForTimeout(450);await page.screenshot({path:path.join(out,'b1-home-1440.png')});
   await page.evaluate(()=>renderCronoProducer('993'));
   assert.match(await page.locator('#cronoContent').innerText(),/Área activa/i);
   assert.equal(await page.locator('#cronoProducerSelect').inputValue(),'993');
   await page.locator('#cronoContent').scrollIntoViewIfNeeded();await page.waitForTimeout(450);await page.screenshot({path:path.join(out,'b1-farm-1440.png')});
   await page.evaluate(()=>selectCronoSuerteSuggestion('494','04A'));
   assert.match(await page.locator('#cronoContent').innerText(),/Sin Caña/);
   assert.match(await page.locator('#cronoContent').innerText(),/0\.00 ha/);
   await page.evaluate(()=>selectCronoSuerteSuggestion('20','03'));
   assert.match(await page.locator('#cronoContent').innerText(),/Semilla/);
   assert.match(await page.locator('#cronoContent').innerText(),/Molienda/);
   await page.evaluate(()=>selectCronoSuerteSuggestion('147','10A'));
   assert.match(await page.locator('#cronoContent').innerText(),/Ausente del inventario actual · Solo referencia/);
   assert.match(await page.locator('#cronoContent').innerText(),/TCH ANTERIOR\s*—/);
   await page.evaluate(()=>{document.querySelector('#zoneMainSection').open=true;goCronoZoneModule();});
   assert.match(await page.locator('#cronoZoneContent').textContent(),/9,574\.66 ha/);
   assert.match(await page.locator('#cronoZoneContent').textContent(),/563,187\.97 t/);
   await page.evaluate(()=>selectCronoZone('5-Productores'));
   assert.match(await page.locator('#cronoZoneContent').textContent(),/TCH estimado 26\/27/);
   assert.equal(await page.locator('#cronoZoneContent').isVisible(),true);
   await page.locator('#cronoZoneContent').screenshot({path:path.join(out,'b1-zone-1440.png')});
  });
  await check('participation: 2003 confirmed Semilla, 1927 confirmed Molienda, inactive farm stays consultable',async()=>{
   await page.evaluate(()=>selectCronoSuerteSuggestion('20','03'));
   assert.equal(await page.locator('[data-casur-estimate] strong').innerText(),'N/D');
   assert.match(await page.locator('#cronoContent').innerText(),/Semilla · Fuera del universo de molienda · Decisión operativa CASUR/);
   assert.match(await page.locator('#cronoContent').innerText(),/Sin participación en molienda/);
   assert.doesNotMatch(await page.locator('#cronoContent').innerText(),/Pendiente 10\.95 ha/);
   await page.locator('#cronoContent').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'participation-2003-desktop.png')});
   await page.setViewportSize({width:390,height:844});await page.locator('#cronoContent').scrollIntoViewIfNeeded();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:path.join(out,'participation-2003-mobile.png')});await page.setViewportSize({width:1440,height:900});
   await page.evaluate(()=>selectCronoSuerteSuggestion('19','27'));
   assert.match(await page.locator('[data-casur-estimate] strong').innerText(),/70\.00/);
   assert.match(await page.locator('#cronoContent').innerText(),/Decisión operativa CASUR/);
   await page.evaluate(()=>renderCronoProducer('63'));
   const empty=await page.evaluate(()=>CRONO_DATA.producers.find(p=>p.code==='63'));
   assert.equal(empty.activeLots,0);assert.equal(empty.estimateTch,null);assert.ok(empty.details.length>0);
   assert.equal(await page.locator('[data-casur-estimate] strong').innerText(),'N/D');
   assert.match(await page.locator('#cronoContent').innerText(),/No participa en molienda/);
   await page.locator('#cronoContent').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'participation-farm-63.png')});
   // Export the affected farm, not only a farm whose denominator did not change.
   await page.evaluate(()=>renderCronoProducer('20'));
   const download=page.waitForEvent('download');await page.locator('[data-casur-export-kind="cronologico"] .pdf').click();await(await download).saveAs(path.join(out,'participation-farm-20.pdf'));
  });
  await check('B1: tablet/mobile and chronological PDF/PNG keep existing layout',async()=>{
   await page.evaluate(()=>renderCronoProducer('993'));
   if(process.env.CASUR_QA_STAGE==='B2')assert.equal(await page.evaluate(()=>{const c=document.querySelector('#cronoContent>.ficha-card');c.scrollLeft=15;return c.scrollLeft;}),0,'chronological card cannot accidentally pan');
   await page.waitForSelector('[data-casur-export-kind="cronologico"] .pdf',{timeout:10000});
   const rowBreaks=await page.evaluate(async()=>{const render=await CASUR_VISUAL_EXPORT.renderCanvas('cronologico');return render.safeBreaks.length;});assert.equal(rowBreaks,49,'chronological export keeps all 49 row boundaries');
   const pdfPromise=page.waitForEvent('download');await page.locator('[data-casur-export-kind="cronologico"] .pdf').click();const pdf=await pdfPromise;await pdf.saveAs(path.join(out,'b1-cronologico-993.pdf'));
   const pngPromise=page.waitForEvent('download');await page.locator('[data-casur-export-kind="cronologico"] .image').click();const png=await pngPromise;await png.saveAs(path.join(out,'b1-cronologico-993.png'));
   for(const [width,height,name] of [[768,1024,'b1-farm-768.png'],[390,844,'b1-farm-390.png']]){
    await page.setViewportSize({width,height});await page.evaluate(()=>document.querySelector('#cronoContent').scrollIntoView({block:'start',inline:'nearest',behavior:'instant'}));await page.waitForTimeout(450);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width} overflow`);
    const layout=await page.evaluate(()=>['#cronoContent','.ficha-band','#cronoPrintPanel .kpis'].map(selector=>{const el=document.querySelector(selector),r=el.getBoundingClientRect();return {selector,left:r.left,right:r.right,width:r.width,viewport:innerWidth};}));
    fs.writeFileSync(path.join(out,`layout-parents-${width}.json`),JSON.stringify(await page.evaluate(()=>{let el=document.querySelector('#cronoContent .ficha-band'),a=[];while(el){const r=el.getBoundingClientRect(),s=getComputedStyle(el);a.push({id:el.id,class:el.className,left:r.left,width:r.width,scrollLeft:el.scrollLeft,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,overflowX:s.overflowX});el=el.parentElement;}return a;}),null,2));
    if(layout.some(r=>r.left<0||r.right>r.viewport))await page.screenshot({path:path.join(out,`layout-problem-${width}.png`)});
    fs.writeFileSync(path.join(out,`layout-${width}.json`),JSON.stringify(layout,null,2));assert.ok(layout.every(r=>r.left>=0&&r.right<=r.viewport),`${width} content bounds`);
    await page.screenshot({path:path.join(out,name)});
   }
   await page.setViewportSize({width:1440,height:900});
  });
  await check('failed transaction after staging previous version rolls back all writes',async()=>{
   const outcome=await page.evaluate(async()=>{
    const store=await import('../../core/shared-data/master-store.js'),before=await store.loadProduccionDataset(),payload=structuredClone(before.payload);
    payload.dataVersion='2026.10.24-aforo.9999';payload.operationalDataset.dataVersion=payload.dataVersion;payload.operationalDataset.cronologico.meta.dataVersion=payload.dataVersion;
    const central=structuredClone((await store.loadMaestroSuertes()).payload);central.version=payload.dataVersion;
    const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,...args){if(value.key==='produccion_current')throw Error('simulated storage failure');return original.call(this,value,...args);};
    let error;try{await store.commitOperationalDataset(payload,{approved:true,expectedVersion:before.payload.dataVersion,maestro:central});}catch(e){error=e.message;}finally{IDBObjectStore.prototype.put=original;}
    return {error,version:(await store.loadProduccionDataset()).payload.dataVersion};
   });assert.match(outcome.error,/storage failure/);assert.equal(outcome.version,'2026.10.24-aforo.1001');
  });
  await check('offline reopen restores full generation, plan and unchanged historical data',async()=>{
   await context.setOffline(true);await page.close();const reopen=await context.newPage();
   await reopen.addInitScript(()=>sessionStorage.setItem('casurAdminUnlockedAt',String(Date.now())));
   await reopen.goto(new URL('modules/produccion/',base).href);
   await reopen.waitForFunction(()=>window.CRONO_DATA?.meta?.dataVersion==='2026.10.24-aforo.1001',{},{timeout:60000});
   assert.equal(await reopen.evaluate(()=>CRONO_DATA.operational.totals.inventoried),1046);assert.equal(await reopen.evaluate(()=>JSON.stringify(APP_DATA)),historicalHash);
   await reopen.setViewportSize({width:390,height:844});await reopen.evaluate(()=>{document.querySelector('#masterUpdateSection').open=true;});
   await reopen.locator('.operational-import').scrollIntoViewIfNeeded();assert.equal(await reopen.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await reopen.screenshot({path:path.join(out,'offline-mobile.png')});
   await context.setOffline(false);
   reopen.on('dialog',d=>d.accept());await reopen.locator('#operationalRestore').click();await reopen.getByText(/Versión anterior recuperada/).waitFor();
   assert.equal(await reopen.evaluate(()=>CRONO_DATA.global.area),10030.65);assert.equal(await reopen.evaluate(()=>JSON.stringify(APP_DATA)),historicalHash);
   assert.match(await reopen.locator('.casur-release-strip').textContent(),/Datos compartidos/);
   await reopen.screenshot({path:path.join(out,'rollback-mobile.png')});
   // Move the remaining tests to the reopened page without losing the isolated origin state.
   globalThis.reopen=reopen;
  });
  const p=globalThis.reopen;
  await check('duplicate import rejected with previous dataset and saved generation unchanged',async()=>{
   await p.locator('#operationalFile').setInputFiles(invalidFile);await p.waitForFunction(()=>document.querySelector('#operationalMessage').textContent.includes('Revise los campos'));
   await p.locator('#operationalSeason').fill('26/27');await p.locator('#operationalVersion').fill('2026.10.24-aforo.1002');await p.locator('#operationalReconcile').click();await p.getByText(/errores críticos\. Corrija/).waitFor();
   assert.equal(await p.locator('#operationalApply').isDisabled(),true);assert.equal(await p.evaluate(()=>CRONO_DATA.global.area),10030.65);
   assert.equal(await p.evaluate(async()=>(await(await import('../../core/shared-data/master-store.js')).loadProduccionDataset()).payload.dataVersion),'2026.09.06-siagri.1415');
   await p.locator('#operationalCancel').click();assert.equal(await p.evaluate(async()=>(await CASUR_MODULE_BRIDGE.checkpoint('pwa-update')).ok),true);
  });
  await check('renamed sheet, shuffled columns and alternate headers preserve official reconciliation',async()=>{
   await p.locator('#masterCronoFile').setInputFiles(renamedFile);await p.waitForFunction(()=>document.querySelector('#operationalMessage').textContent.includes('Revise los campos'));
   await p.locator('#operationalVersion').fill('2026.10.24-aforo.1003');await p.locator('#operationalReconcile').click();
   await p.getByText('1046 inventariadas · 1053 en catálogo · 995 activas · 7 ausentes',{exact:true}).waitFor();
   await p.locator('#operationalResults').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(out,'preview-mobile-renamed.png')});
   await p.locator('#operationalApproval').check();await p.locator('#operationalApply').click();await p.getByText(/Generación aprobada aplicada/).waitFor();
   assert.ok(Math.abs(await p.evaluate(()=>CRONO_DATA.operational.totals.millingTons)-563187.9696909501)<0.000001);
   assert.equal(await p.evaluate(()=>JSON.stringify(APP_DATA)),historicalHash);
  });
  await check('protected files unchanged on disk and no original workbook included in code',async()=>{
   for(let i=0;i<2;i++)assert.equal(crypto.createHash('sha256').update(fs.readFileSync([extractFile,completeFile][i])).digest('hex'),hashes[i]);
   fs.writeFileSync(path.join(out,'source-sha256.json'),JSON.stringify(hashes,null,2));
   fs.writeFileSync(path.join(out,'page-exceptions.json'),JSON.stringify(exceptions,null,2));assert.deepEqual(exceptions,[]);
  });
 }finally{await browser.close();}
})().catch(e=>{console.error(e);fs.writeFileSync(path.join(out,'error.txt'),String(e.stack));process.exitCode=1;});
