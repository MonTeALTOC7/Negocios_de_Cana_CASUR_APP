// Clean Chromium, real shell/iframe, existing data and GIS. Optional public URL.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=path.resolve(process.argv[2]);fs.mkdirSync(out,{recursive:true});
const url=process.argv[3]||'http://127.0.0.1:4381/Negocios_de_Cana_CASUR_APP/#/modulo/produccion';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
 const context=await browser.newContext({viewport:{width:1536,height:1024},timezoneId:'America/Mexico_City'});
 const page=await context.newPage(),errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);
 await page.waitForFunction(()=>document.querySelector('#mFrame')?.contentWindow?.CASUR_PRODUCTION_READY,{timeout:90000});
 const frame=page.frames().find(f=>f.url().includes('/modules/produccion/'));
 const view=async name=>{if(await frame.locator('#maestroMenu').isVisible())await frame.locator('#maestroMenu').click();await frame.getByRole('tab',{name,exact:true}).click();};
 await view('Cronológico');
 await frame.getByRole('tab',{name:'Estimados Z26/27',exact:true}).click();assert.equal(await frame.locator('.crono-yield-analysis').isVisible(),true);assert.equal(await frame.locator('.crono-area-analysis').isVisible(),false);
 await frame.getByRole('tab',{name:'Consultar fincas',exact:true}).click();await frame.getByRole('searchbox',{name:'Filtrar directorio de fincas'}).fill('Pansaco');await frame.locator('.maestro-farm-grid button').click();assert.equal(await frame.locator('#cronoProducerSelect').inputValue(),'993');
 await frame.locator('#cronoQ').fill('99336');await frame.locator('#cronoQ').press('Enter');
 await frame.locator('#maestroInlineMap .leaflet-interactive').first().waitFor();await frame.locator('#cronoContent [data-casur-export-kind]').waitFor();
 const original=await frame.locator('.crono-trend-svg').evaluate(n=>n.outerHTML);
 const selected=await frame.evaluate(()=>CASUR_CRONO_SELECTION.capture());
 const kpis=await frame.locator('.single-suerte-kpis .kpi').allTextContents();assert.equal(kpis.length,6);assert.match(kpis.join(' '),/65.00/);
 await frame.getByRole('tab',{name:'Histórico en tabla',exact:true}).click();assert.equal(await frame.locator('.maestro-original-table').isVisible(),true);assert.equal(await frame.locator('.maestro-ficha-board').isVisible(),false);assert.equal(await frame.locator('.maestro-history-table dt').count(),8);
 await frame.getByRole('tab',{name:'Histórico en tabla',exact:true}).press('ArrowRight');assert.equal(await frame.locator('#maestro-ficha-mapa').isVisible(),true);assert.equal(await frame.locator('.maestro-original-table').isVisible(),false);
 await view('Resumen');await view('Cronológico');assert.equal(await frame.locator('#cronoPrintPanel').getAttribute('data-ficha-panel'),'mapa');
 await frame.getByRole('tab',{name:'Ficha y gráfico',exact:true}).click();assert.equal(await frame.locator('.crono-trend-svg').evaluate(n=>n.outerHTML),original);
 for(const width of [1536,1440,1280,768,390,360]){
  await page.setViewportSize({width,height:width<600?844:1024});
  if(width<=800){await frame.locator('#maestroMenu').click();await frame.getByRole('tab',{name:'Cronológico',exact:true}).press('Escape');assert.equal(await frame.locator('#maestroMenu').getAttribute('aria-expanded'),'false');assert.equal(await frame.locator('#maestroMenu').evaluate(n=>n===document.activeElement),true);}
  for(const theme of ['claro','vibrante']){
   await frame.locator('#maestroAppearance').selectOption(theme);
   await frame.evaluate(()=>scrollTo(0,0));await frame.locator('#cronoQ').evaluate(n=>n.blur());
   // Wait for map viewport to settle; imagery may legitimately be unavailable.
   await frame.locator('#maestroInlineMap').evaluate(n=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await page.screenshot({path:path.join(out,`ficha-${theme}-${width}.png`)});
   const dimensions=await frame.evaluate(()=>({viewport:innerWidth,content:document.documentElement.scrollWidth}));assert.ok(dimensions.content<=dimensions.viewport,JSON.stringify(dimensions));
   assert.deepEqual(await frame.locator('.single-suerte-kpis .kpi').allTextContents(),kpis);assert.equal(await frame.locator('.crono-trend-svg').evaluate(n=>n.outerHTML),original);
   assert.deepEqual(await frame.evaluate(()=>CASUR_CRONO_SELECTION.capture()),selected);
   results.push({width,theme,dimensions});
  }
 }
 await page.setViewportSize({width:1536,height:1024});
 await frame.locator('#maestroBackFarm').click();assert.equal(await frame.locator('#cronoContent').getAttribute('data-geo-scope'),'farm');
 await frame.locator('#maestroGeneral').click();await frame.getByRole('tab',{name:'Área y distribución',exact:true}).waitFor();
 for(const name of ['Área y distribución','Estimados Z26/27','Consultar fincas']){await frame.getByRole('tab',{name,exact:true}).click();await page.screenshot({path:path.join(out,`general-${name.split(' ')[0]}.png`)});}
 for(const name of ['Resumen','Histórico','Zonas','Análisis']){await view(name);await page.screenshot({path:path.join(out,`${name}-1536.png`)});}
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'fidelity.json'),JSON.stringify({status:'PASS',url,results,errors,kpis,checks:['General subtabs and farm directory','99336 original KPI and SVG unchanged across 12 layouts','Real GIS geometry','Ficha panels and keyboard navigation','Drawer Escape and focus','Five views and return to farm']},null,2));
 console.log('PASS fidelity: 12 layouts, real panels, geometry, unchanged KPI/SVG, navigation and keyboard.');
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
