const assert=require('assert/strict'),fs=require('fs'),path=require('path');
module.exports=async({phase,page,out,check})=>{
 const panel=page.locator('#operationalAnalysis');
 const open=async()=>{
  await page.evaluate(()=>{document.querySelector('#cronoSection').open=true;CASUR_OPERATIONAL_ANALYSIS.open();});
  await page.waitForFunction(()=>CASUR_OPERATIONAL_ANALYSIS.model()?.available===true&&CASUR_OPERATIONAL_ANALYSIS.model()?.meta?.dataVersion===CRONO_DATA.meta.dataVersion);
 };
 if(phase==='live')await check('B2: official estimates, split plan and comparisons are read-only and responsive',async()=>{
  const before=await page.evaluate(()=>JSON.stringify(CRONO_DATA));
  await page.evaluate(()=>{window.__qaPutOriginal=IDBObjectStore.prototype.put;window.__qaPutCount=0;IDBObjectStore.prototype.put=function(...args){window.__qaPutCount++;return window.__qaPutOriginal.apply(this,args);};});
  try{
   await open();
   assert.equal(await panel.locator('input,[contenteditable=true]').count(),0);
   const totals=await page.evaluate(()=>CASUR_OPERATIONAL_ANALYSIS.model().totals);
   assert.equal(totals.milling,948);assert.equal(totals.seed,47);assert.ok(Math.abs(totals.millingArea-9115.65)<1e-8);
   assert.ok(Math.abs(totals.millingTons-563187.9696909501)<1e-6);assert.match(await panel.innerText(),/61\.78/);
   await panel.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'b2-estimates-desktop.png')});
   await page.locator('#opAnalysisFarm').selectOption('20');await page.locator('#opAnalysisLot').selectOption('2003');
   const seed=await page.evaluate(()=>CASUR_OPERATIONAL_ANALYSIS.model());assert.equal(seed.totals.seed,1);assert.equal(seed.totals.milling,0);assert.equal(seed.rows[0].classification,'Molienda');
   assert.match(await panel.innerText(),/Semilla/);
   await page.locator('#opAnalysisFarm').selectOption('19');await page.locator('#opAnalysisLot').selectOption('1927');
   assert.equal(await page.evaluate(()=>CASUR_OPERATIONAL_ANALYSIS.model().totals.millingTons),430.5);
   await page.locator('#opAnalysisFarm').selectOption('992');await page.locator('#opAnalysisLot').selectOption('99207');
   await panel.locator('[data-op-view=plan]').click();
   const split=await page.evaluate(()=>{const m=CASUR_OPERATIONAL_ANALYSIS.model();return {plan:m.plan,area:m.rows[0].inventoryArea,parts:m.lines.map(l=>({id:l.fields.lineId,area:l.fields.area,tons:l.fields.lineTons,age:l.plan.age,calculatedAge:l.plan.calculatedAge,base:l.plan.base,ageSource:l.ageSource,baseSource:l.baseSource}))};});
   assert.equal(split.parts.length,2);assert.equal(split.plan.identities,1);assert.ok(Math.abs(split.plan.area-split.area)<0.02);assert.equal(split.plan.tons,split.parts.reduce((n,p)=>n+p.tons,0));
   assert.ok(Math.abs(split.parts[0].age-366/30.4375)<1e-9);assert.equal(split.parts[1].age,null);assert.ok(split.parts.every(p=>p.calculatedAge>12));
   fs.writeFileSync(path.join(out,'b2-split-reconciliation.json'),JSON.stringify(split,null,2));
   await panel.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'b2-plan-split-desktop.png')});
   await page.locator('#opAnalysisLot').selectOption('');await page.locator('#opAnalysisFarm').selectOption('');
   await panel.locator('[data-op-view=comparison]').click();
   const comp=await page.evaluate(()=>{const m=CASUR_OPERATIONAL_ANALYSIS.model();return {plan:m.plan,total:m.totals,farms:m.groups.farms.map(g=>({key:g.key,plan:g.plan,totals:g.totals})),zones:m.groups.zones.map(g=>({key:g.key,plan:g.plan,totals:g.totals}))};});
   assert.equal(comp.plan.lines,1050);assert.equal(comp.plan.identities,1046);assert.equal(comp.farms.length,100);assert.equal(comp.zones.length,4);
   assert.ok(Math.abs(comp.farms.reduce((n,f)=>n+f.totals.millingTons,0)-comp.total.millingTons)<1e-6);
   assert.ok(Math.abs(comp.zones.reduce((n,z)=>n+z.totals.millingArea,0)-comp.total.millingArea)<1e-6);
   fs.writeFileSync(path.join(out,'b2-comparison-reconciliation.json'),JSON.stringify(comp,null,2));
   await panel.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'b2-comparison-desktop.png')});
   for(const [width,height]of [[768,1024],[390,844]]){
    await page.setViewportSize({width,height});await panel.evaluate(el=>window.scrollTo({top:Math.max(0,el.getBoundingClientRect().top+scrollY-(document.querySelector('header')?.getBoundingClientRect().height||0)-12),behavior:'instant'}));
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(out,`b2-comparison-${width}.png`)});
   }
   await page.setViewportSize({width:1440,height:900});
   assert.equal(await page.evaluate(()=>window.__qaPutCount),0,'query performed no IDB writes');
   assert.equal(await page.evaluate(()=>JSON.stringify(CRONO_DATA)),before);
  }finally{await page.evaluate(()=>{IDBObjectStore.prototype.put=window.__qaPutOriginal;});}
 });
 if(phase==='offline')await check('B2: cold page reopen offline preserves query and read-only generation',async()=>{
  await open();const m=await page.evaluate(()=>({meta:CASUR_OPERATIONAL_ANALYSIS.model().meta,total:CASUR_OPERATIONAL_ANALYSIS.model().totals}));
  assert.equal(m.meta.dataVersion,'2026.10.24-aforo.1001');assert.equal(m.total.seed,47);assert.equal(m.total.milling,948);
  await panel.locator('[data-op-view=plan]').click();assert.equal(await page.evaluate(()=>CASUR_OPERATIONAL_ANALYSIS.model().plan.lines),1050);
  await panel.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'b2-offline.png')});
 });
 if(phase==='archive')await check('B2: archived generation and matching campaign can be consulted without applying it',async()=>{
  await open();const before=await page.evaluate(()=>JSON.stringify(CRONO_DATA));
  await page.locator('#opAnalysisGeneration').selectOption('2026.10.24-aforo.1001');
  await page.waitForFunction(()=>CASUR_OPERATIONAL_ANALYSIS.model()?.meta?.dataVersion==='2026.10.24-aforo.1001');
  assert.equal(await page.evaluate(()=>CASUR_OPERATIONAL_ANALYSIS.model().plan.lines),1050);
  assert.equal(await page.evaluate(()=>CASUR_OPERATIONAL_ANALYSIS.model().totals.seed),47);
  assert.equal(await page.evaluate(()=>JSON.stringify(CRONO_DATA)),before);
  const persisted=await page.evaluate(async()=>(await(await import('../../core/shared-data/master-store.js')).loadProduccionDataset()).payload.dataVersion);
  assert.equal(persisted,'2026.10.24-aforo.1003');
  await panel.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'b2-archived-generation.png')});
 });
};
