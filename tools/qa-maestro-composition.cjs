// Compare the review palettes without touching business state or chart models.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=path.resolve(process.argv[2]);fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 const page=await context.newPage();
 await page.goto('http://127.0.0.1:4381/Negocios_de_Cana_CASUR_APP/#/modulo/produccion');
 await page.waitForFunction(()=>document.querySelector('#mFrame')?.contentWindow?.CASUR_PRODUCTION_READY,{timeout:90000});
 const frame=page.frames().find(f=>f.url().includes('/modules/produccion/'));
 const results=[];
 for(const theme of ['claro','vibrante']){
  await frame.locator('#maestroAppearance').selectOption(theme);
  for(const width of [1440,1280,768,390]){
   await page.setViewportSize({width,height:width===390?844:900});
   await frame.getByRole('tab',{name:'Resumen',exact:true}).click();
   await page.screenshot({path:path.join(out,`${theme}-resumen-${width}.png`)});
   await frame.getByRole('tab',{name:'Cronológico',exact:true}).click();
   if(!await frame.locator('#cronoQ').isVisible())await frame.locator('#cronoSection .maestro-query > summary').click();
   await frame.locator('#cronoQ').fill('99336');await frame.locator('#cronoQ').press('Enter');
   await frame.locator('#cronoPrintPanel').waitFor();
   await frame.locator('#cronoContent [data-casur-export-kind]').waitFor();
   assert.equal(await frame.locator('#cronoQ').isVisible(),false,'resolved query is compact');
   const model=await frame.evaluate(()=>({kpis:[...document.querySelectorAll('#cronoPrintPanel .kpi')].map(x=>x.textContent),svg:document.querySelector('#cronoPrintPanel .crono-trend-card svg')?.outerHTML,selected:CASUR_CRONO_SELECTION.capture()}));
   if(results.length)assert.deepEqual(model,results[0].model);
   await page.screenshot({path:path.join(out,`${theme}-ficha-${width}.png`)});
   await frame.getByRole('button',{name:'Indicadores',exact:true}).click();
   assert.ok(await frame.locator('#cronoPrintPanel .kpi').first().isVisible());
   await page.screenshot({path:path.join(out,`${theme}-indicadores-${width}.png`)});
   const size=await frame.evaluate(()=>({viewport:innerWidth,content:document.documentElement.scrollWidth}));
   assert.ok(size.content<=size.viewport,JSON.stringify(size));results.push({theme,width,model,size});
  }
 }
 fs.writeFileSync(path.join(out,'composition.json'),JSON.stringify({status:'PASS',comparisons:results.length,results},null,2));
 await browser.close();console.log('PASS: eight theme/viewport comparisons; identical KPI, SVG and selections.');
})().catch(e=>{console.error(e);process.exit(1);});
