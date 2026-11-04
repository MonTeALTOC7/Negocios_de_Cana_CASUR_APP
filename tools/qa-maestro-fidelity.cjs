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
 const view=async name=>{if(await frame.locator('#maestroMenu').isVisible()&&await frame.locator('#maestroMenu').getAttribute('aria-expanded')!=='true')await frame.locator('#maestroMenu').click();await frame.getByRole('tab',{name,exact:true}).click();};
 await view('Cronológico');
 await frame.locator('.ux05-primary').getByRole('button',{name:/^Estimados Z/}).click();assert.equal(await frame.locator('.context-explorer[data-objective=estimate]').isVisible(),true);assert.equal(await frame.locator('.crono-area-analysis').isVisible(),false);
 await frame.locator('.ux05-primary').getByRole('button',{name:'Consultar fincas',exact:true}).click();await frame.getByRole('searchbox',{name:'Buscar finca en el ámbito',exact:true}).fill('Pansaco');await frame.locator('.ux04-farm-row').filter({hasText:/Pansaco/i}).getByRole('button',{name:'Ver ficha',exact:true}).click();assert.equal(await frame.locator('#cronoProducerSelect').inputValue(),'993');
 await frame.locator('#cronoQ').fill('99336');await frame.locator('#cronoQ').press('Enter');
 await frame.locator('#maestroInlineMap .leaflet-interactive').first().waitFor();await frame.locator('#cronoContent [data-casur-export-kind]').first().waitFor({state:'attached'});
 const original=await frame.locator('.crono-trend-svg').evaluate(n=>n.outerHTML);
 const selected=await frame.evaluate(()=>CASUR_CRONO_SELECTION.capture());
 const kpis=await frame.locator('.single-suerte-kpis .kpi').allTextContents();assert.equal(kpis.length,6);assert.match(kpis.join(' '),/65.00/);
 // Current lot tabs are mobile-only; desktop preserves history and GIS together.
 await page.setViewportSize({width:390,height:844});
 await frame.getByRole('tab',{name:'Información',exact:true}).click();
 assert.equal(await frame.locator('.context-lot-technical').isVisible(),true);
 assert.equal(await frame.locator('.premium-ficha-history').isVisible(),false);
 assert.ok(await frame.locator('.context-lot-technical dt').count()>0);
 await frame.getByRole('button',{name:'Tabla cronológica · 18 columnas',exact:true}).click();
 assert.equal(await frame.locator('dialog[open] table th').count(),18);
 await frame.locator('dialog[open]').press('Escape');
 await frame.getByRole('tab',{name:'Información',exact:true}).focus();
 await frame.getByRole('tab',{name:'Información',exact:true}).press('ArrowLeft');
 assert.equal(await frame.locator('#maestroInlineMap').isVisible(),true);
 assert.equal(await frame.locator('.context-lot-technical').isVisible(),false);
 await view('Resumen');await view('Cronológico');assert.equal(await frame.locator('#cronoPrintPanel').getAttribute('data-ficha-panel'),'map');
 await frame.getByRole('tab',{name:'Gráfico TCH/KATM',exact:true}).click();assert.equal(await frame.locator('.crono-trend-svg').evaluate(n=>n.outerHTML),original);
 for(const width of [1536,1440,1280,768,390,360]){
  await page.setViewportSize({width,height:width<600?844:1024});
  if(width<=800){await frame.locator('#maestroMenu').click();await frame.getByRole('tab',{name:'Cronológico',exact:true}).press('Escape');assert.equal(await frame.locator('#maestroMenu').getAttribute('aria-expanded'),'false');assert.equal(await frame.locator('#maestroMenu').evaluate(n=>n===document.activeElement),true);}
  for(const theme of ['claro','vibrante']){
   // The baseline has no appearance selector; validate retained stylesheet variants explicitly.
   if(await frame.locator('#maestroAppearance').count())await frame.locator('#maestroAppearance').selectOption(theme);else await frame.locator('body').evaluate((node,value)=>node.dataset.maestroTheme=value,theme);
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
 await frame.locator('#maestroGeneral').click();await frame.locator('.ux05-primary').getByRole('button',{name:'Distribución',exact:true}).waitFor();
 for(const name of ['Distribución','Estimados Z26/27','Consultar fincas']){await frame.locator('.ux05-primary').getByRole('button',{name,exact:true}).click();await page.screenshot({path:path.join(out,`general-${name.split(' ')[0]}.png`)});}
 for(const name of ['Resumen','Histórico','Zonas','Análisis']){await view(name);await page.screenshot({path:path.join(out,`${name}-1536.png`)});}
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'fidelity.json'),JSON.stringify({status:'PASS',url,results,errors,kpis,appearanceControl:'not-present-in-baseline; stylesheet variants exercised',checks:['General subtabs and farm directory','99336 original KPI and SVG unchanged across 12 layouts','Real GIS geometry','Ficha panels and keyboard navigation','Drawer Escape and focus','Five views and return to farm']},null,2));
 console.log('PASS fidelity: 12 layouts, real panels, geometry, unchanged KPI/SVG, navigation and keyboard.');
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
