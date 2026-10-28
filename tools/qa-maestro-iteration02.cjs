const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=path.resolve(process.argv[2]);fs.mkdirSync(out,{recursive:true});
const url=process.argv[3]||'http://127.0.0.1:4383/Negocios_de_Cana_CASUR_APP/#/modulo/produccion';
(async()=>{const browser=await chromium.launch({channel:'chrome'});try{
 const page=await browser.newPage({viewport:{width:1536,height:1024}}),errors=[],screens=[],scrolls=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.waitForFunction(()=>document.querySelector('#mFrame')?.contentWindow?.CASUR_PRODUCTION_READY,{timeout:90000});
 const frame=page.frames().find(f=>f.url().includes('/modules/produccion/'));
 const numeric=await frame.evaluate(()=>({summary:CASUR_CRONO_PARTICIPATION.summary(CRONO_DATA.producers.flatMap(p=>p.details)),global:CRONO_DATA.global,values:[...document.querySelectorAll('#maestroSummary .maestro-kpi strong')].map(n=>n.textContent),generation:CRONO_DATA.meta.dataVersion}));
 const s=numeric.summary;assert.equal(s.activeLots,995);assert.equal(s.millingLots,948);assert.equal(s.seedLots,47);assert.equal(s.millingArea,9115.65);assert.equal(s.seedArea,459.01);assert.equal(numeric.global.area,9574.66);assert.equal(numeric.global.tch,64.08);assert.equal(s.estimateTons,563187.97);assert.equal(s.estimateTch,61.78);assert.ok(Math.abs(s.estimateTons/s.estimateArea-61.78)<.005);assert.equal(s.pendingMillingArea,0);assert.equal(numeric.values.length,4);
 for(const groups of await frame.locator('.maestro-analysis-card').evaluateAll(ns=>ns.map(n=>JSON.parse(n.dataset.groups))))assert.ok(Math.abs(groups.reduce((s,g)=>s+g.area,0)-numeric.global.area)<.01);
 for(let i=0;i<4;i++){await frame.locator('.maestro-info').nth(i).click();assert.equal(await frame.locator('#maestro-help-'+i).evaluate(n=>n.matches(':popover-open')),true);await frame.locator('#maestro-help-'+i+' button').click();}
 // Isolated in-memory personal-generation fixture, restored in finally: no storage writes.
 const personal=await frame.evaluate(()=>{const original=CRONO_DATA,local=window.CASUR_OPERATIONAL_LOCAL;try{const rows=structuredClone(original.producers.find(p=>String(p.code)==='993').details);window.CRONO_DATA=CASUR_BUILD_CRONO_DATA(rows,'QA personal en memoria');window.CASUR_OPERATIONAL_LOCAL=true;CASUR_MAESTRO_UX.refresh();return {summary:CASUR_CRONO_PARTICIPATION.summary(CRONO_DATA.producers.flatMap(p=>p.details)),area:CRONO_DATA.global.area,shown:document.querySelector('#maestroActiveArea').textContent,tons:document.querySelector('#maestroEstimateTons').textContent,source:document.querySelector('#maestroSource').textContent};}finally{window.CRONO_DATA=original;window.CASUR_OPERATIONAL_LOCAL=local;CASUR_MAESTRO_UX.refresh();}});
 assert.match(personal.source,/personal/);assert.notEqual(personal.area,numeric.global.area);assert.equal(personal.shown,personal.area.toLocaleString('es-NI',{minimumFractionDigits:2,maximumFractionDigits:2})+' ha');assert.equal(personal.tons,personal.summary.estimateTons.toLocaleString('es-NI',{minimumFractionDigits:2,maximumFractionDigits:2})+' t');
 for(const width of[1536,1440,1280,768,390,360])for(const theme of['claro','vibrante']){
  await page.setViewportSize({width,height:width<600?844:1024});await frame.locator('#maestroAppearance').selectOption(theme);
  for(const view of['resumen','ficha']){
   await frame.evaluate(view=>{if(view==='resumen')CASUR_MAESTRO_UX.activate('resumen');else selectCronoSuerteSuggestion('993','36');scrollTo(0,0);},view);
   if(view==='ficha'){await frame.locator('#maestroInlineMap .leaflet-interactive').first().waitFor();await frame.locator('#cronoContent [data-casur-export-kind]').waitFor();}
   const size=await frame.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(size.scroll<=size.width,JSON.stringify({view,width,size}));
   await page.screenshot({path:path.join(out,`${view}-${theme}-${width}.png`)});screens.push({view,theme,width});
   if(theme==='claro'&&width!==768)for(const y of[0,300,800]){
    await frame.evaluate(y=>scrollTo(0,y),y);await frame.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
    const measure=await frame.evaluate(()=>{const header=document.querySelector('header'),rect=header.getBoundingClientRect();const targets=[...document.querySelectorAll('#maestroSummary .maestro-kpi,#cronoPrintPanel .kpi,.maestro-query')].filter(n=>n.getBoundingClientRect().height>0);return{position:getComputedStyle(header).position,scroll:scrollY,bottom:rect.bottom,overlap:targets.some(n=>{const r=n.getBoundingClientRect();return rect.bottom>Math.max(0,r.top)&&rect.top<r.bottom;})};});assert.equal(measure.position,'relative');assert.equal(measure.overlap,false);scrolls.push({width,view,y,...measure});await page.screenshot({path:path.join(out,`scroll-${view}-${width}-${y}.png`)});
   }
  }
 }
 await page.setViewportSize({width:1536,height:1024});await frame.evaluate(()=>{selectCronoSuerteSuggestion('993','36');scrollTo(0,0);});
 const tips=[];for(let i=0;i<8;i++){
  const point=frame.locator('.crono-trend-point').nth(i);await point.hover();await point.focus();const tooltip=frame.locator('#maestroTrendTooltip');assert.equal(await tooltip.isVisible(),true);
  const expected=await frame.evaluate(i=>trendFromLot(lotByCode('99336')).filter(r=>r.tch!=null).slice(-8)[i],i);
  const values=await tooltip.locator('dd').allTextContents();for(const [j,key]of['tch','area','ton','katm','edad'].entries())assert.equal(values[j],expected[key]==null?'N/D':Number(expected[key]).toLocaleString('es-NI',{minimumFractionDigits:2,maximumFractionDigits:2}));
  await point.click();assert.equal(await tooltip.isVisible(),true);await point.press('Escape');assert.equal(await tooltip.isVisible(),false);tips.push({season:expected.label,values});
 }
 const performance=await frame.evaluate(()=>({resources:performance.getEntriesByType('resource').length,domNodes:document.querySelectorAll('*').length,logoBytes:performance.getEntriesByType('resource').find(r=>r.name.includes('negocios-de-cana.webp'))?.decodedBodySize,headerPosition:getComputedStyle(document.querySelector('header')).position}));
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'iteration02.json'),JSON.stringify({status:'PASS',url,numeric,personal,screens,scrolls,tips,performance,errors},null,2));console.log('PASS iteration02: canonical metrics, personal fixture, 24 layouts, 60 scroll checks, eight enriched tooltips.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
