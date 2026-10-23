// Isolated browser QA; synthetic tests never write official datasets.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const sharp=require('sharp');
const out=process.env.CASUR_QA_OUT,base=process.env.CASUR_PREVIEW_URL;
if(!out||!base)throw Error('CASUR_QA_OUT and CASUR_PREVIEW_URL required');
const cases=[{id:'A',lots:['98301','98304','98304A'],mode:'Últimas 5'},
  {id:'B',lots:['98301','98302'],mode:'Últimas 3'},
  {id:'una',lots:[],mode:'Última'},
  {id:'tres',lots:['98301','98302'],extra:['759'],mode:'Últimas 3'},
  {id:'cinco',lots:['98301','98302'],extra:['759','242','211'],mode:'Últimas 3'},
  {id:'custom',lots:['98301','98302'],mode:'Personalizado'}];
async function renderPdf(file){
  const prefix=file.replace(/\.pdf$/,'');execFileSync('pdftoppm',['-scale-to','1500','-png',file,prefix]);
  const grayDir=path.join(out,'grises');fs.mkdirSync(grayDir,{recursive:true});
  execFileSync('pdftoppm',['-scale-to','1500','-gray','-png',file,path.join(grayDir,path.basename(prefix))]);
  const names=fs.readdirSync(out).filter(n=>n.startsWith(path.basename(prefix)+'-')&&n.endsWith('.png')).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  const pages=[];
  for(const png of names){const {data,info}=await sharp(path.join(out,png)).resize({width:400}).removeAlpha().raw().toBuffer({resolveWithObject:true});let active=0;
    for(let y=30;y<info.height-30;y++){let ink=0;for(let x=15;x<info.width-15;x++){const p=(y*info.width+x)*info.channels;if(Math.min(data[p],data[p+1],data[p+2])<210)ink++;}if(ink>5)active++;}
    pages.push({png,activeRowRatio:active/(info.height-60)});
  }return pages;
}
async function select(page,item){
  await page.evaluate(()=>window.goHistoricoModule());await page.locator('#historicoMultiToggle').click();
  async function farm(code){await page.locator('#q').fill(code);await page.locator('#q').press('Enter');await page.getByRole('button',{name:'Agregar finca completa'}).click();}
  await farm('256');
  if(item.lots.length){await page.locator('#q').fill('983');await page.locator('#q').press('Enter');for(const id of item.lots)await page.locator(`.hist-row-check[data-code="LOTE::${id}"]`).check();}
  for(const code of item.extra||[])await farm(code);
  await page.getByRole('button',{name:'Analizar selección'}).first().click();await page.getByRole('button',{name:item.mode,exact:true}).click();
  if(item.mode==='Personalizado')await page.locator('.hist-multi-custom input[onchange*="1920"]').check();
}
async function inspect(page){return page.evaluate(()=>{
  const m=window.getHistoricoDualSummary(),report=window.historicoMultiReportCharts(),api=window.CASUR_VISUAL_EXPORT,fmt=v=>v==null?'N/D':v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const numeric=['full','period'].map(key=>{const scope=m[key],valid=report.rows.filter(r=>scope.zafras.includes(r.zafra)&&r.area>0&&r.ton!=null&&r.ton>=0&&r.katm!=null&&r.katm>=0);
    const sugar=valid.reduce((s,r)=>s+r.ton*r.katm/1000,0),area=valid.reduce((s,r)=>s+r.area,0);
    const expected=[scope.areaMean,scope.tch,scope.katm,area?sugar/area:null],shown=[...document.querySelectorAll('[data-scope="'+key+'"] .dual-kpi b')].map(n=>n.textContent);
    return {key,sugar,area,tah:area?sugar/area:null,expected:expected.map(fmt),shown,match:expected.map(fmt).every((v,i)=>v===shown[i])};
  });
  const collisions=[],clipped=[];
  document.querySelectorAll('.hist-bars svg').forEach((svg,index)=>{const labels=[...svg.querySelectorAll('.hist-bar-value')],boxes=labels.map(n=>n.getBBox()),view=svg.viewBox.baseVal;
    boxes.forEach((a,i)=>{if(a.x<0||a.y<0||a.x+a.width>view.width||a.y+a.height>view.height)clipped.push({index,i});for(let j=i+1;j<boxes.length;j++){const b=boxes[j];if(a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height)collisions.push({index,i,j});}});
  });
  const exec=api.prepareClone(api.target('historico-multiple'),'historico-multiple','executive');
  const complete=api.prepareClone(api.target('historico-multiple'),'historico-multiple','complete');
  for(const report of [exec,complete]){
    if(report.querySelector('.hist-bars pattern,.hist-bars linearGradient,.hist-bars radialGradient'))throw Error('Trama o degradado en barras PDF');
    for(const rect of report.querySelectorAll('.hist-bars rect'))if(!/^#[0-9a-f]{6}$/i.test(rect.getAttribute('fill')||''))throw Error('Relleno no sólido en barra/leyenda PDF');
    for(const rect of report.querySelectorAll('.hist-bars rect[data-farm]')){
      const expected={'256':'#0b7f3a','983':'#005baa'};
      if(m.selection.length===2&&expected[rect.dataset.farm]&&rect.getAttribute('fill')!==expected[rect.dataset.farm])throw Error('Color original incorrecto');
    }
  }
  // Inspect shared export styles on a detached report, never mutate the live selection.
  const styleHost=document.createElement('div');styleHost.style.cssText='position:absolute;left:-20000px;top:0;width:960px';
  styleHost.appendChild(complete);document.body.appendChild(styleHost);
  const luminance=rgb=>rgb.match(/\d+/g).slice(0,3).map(v=>Number(v)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const printCards=[...complete.querySelectorAll('.dual-kpi')].map(n=>{
    const bg=getComputedStyle(n).backgroundColor,fg=getComputedStyle(n.querySelector('b')).color;
    return {background:bg,color:fg,contrast:(luminance(bg)+.05)/(luminance(fg)+.05)};
  });
  styleHost.remove();
  const presentation={selection:document.querySelector('.hist-multi-included').innerText,
    headings:[...document.querySelectorAll('.hist-dual-summary h3')].map(n=>n.textContent),
    compactDistance:document.querySelector('.hist-multi-global .hist-logistics').innerText,
    pdfSelection:exec.querySelector('.hist-multi-included').textContent,
    obsolete:/Desempeño productivo|Área cosechada media|Equivalente estimado conforme a KATM|origen cero/.test(exec.textContent),
    headerPeriod:exec.querySelector('.print-meta').textContent.includes('Período'),
    unitsBelow:[...document.querySelectorAll('.hist-dual-summary .dual-kpi')].every(n=>n.querySelector('span').getBoundingClientRect().top>=n.querySelector('b').getBoundingClientRect().bottom),
    annexKpis:complete.querySelectorAll('[data-pdf-new-page] .dual-kpi').length,
    annexDistanceCards:[...complete.querySelectorAll('[data-pdf-new-page] .dual-kpi')].some(n=>/Distancia/.test(n.textContent))};
  const visible=[...document.querySelectorAll('.hist-multi-comparison rect[data-value]')].map(n=>Number(n.dataset.value));
  const expectedBars=m.comparison.flatMap(f=>f.series.flatMap(s=>[s.tch,s.katm].filter(v=>v!=null))).sort((a,b)=>a-b);
  const reconciliation=m.selection.flatMap(f=>m.selectedZafras.map(z=>{
    const rows=report.rows.filter(r=>r.farmCode===f.farmCode&&r.zafra===z),valid=rows.filter(r=>r.area>0&&r.ton!=null&&r.ton>=0&&r.katm!=null&&r.katm>=0);
    const sugar=valid.reduce((s,r)=>s+r.ton*r.katm/1000,0),area=valid.reduce((s,r)=>s+r.area,0);
    return {farmCode:f.farmCode,farmName:f.farmName,zafra:z,rows:rows.length,validRows:valid.length,sugarEquivalentTon:sugar,validArea:area,tah:area?sugar/area:null};
  }));
  return {model:m,presentation,printCards,numeric,reconciliation,collisions,clipped,visibleBars:visible.sort((a,b)=>a-b),expectedBars:m.comparison.length<2?[]:expectedBars,
    pdfKpis:[...exec.querySelectorAll('.dual-kpi b')].map(n=>n.textContent),tablesExecutive:exec.querySelectorAll('table').length,
    tablesComplete:complete.querySelectorAll('table').length,annexes:complete.querySelectorAll('[data-pdf-new-page]').length,
    screenKpis:[...document.querySelectorAll('.hist-dual-summary .dual-kpi b')].map(n=>n.textContent),overflow:document.documentElement.scrollWidth>innerWidth};
});}
async function run(){
 fs.mkdirSync(out,{recursive:true});const results=[],uiResults=[];
 const browser=await chromium.launch({headless:true,executablePath:process.env.CASUR_CHROME_EXECUTABLE});
 try{for(const item of cases){for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:width===390?844:900},serviceWorkers:'block',acceptDownloads:true}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));assert.equal((await page.goto(new URL('modules/produccion/',base).href)).status(),200);
  await select(page,item);const evidence=await inspect(page);
  assert.ok(evidence.numeric.every(r=>r.match));assert.deepEqual(evidence.pdfKpis,evidence.screenKpis);assert.equal(evidence.tablesExecutive,0);assert.equal(evidence.overflow,false);
  assert.deepEqual(evidence.collisions,[]);assert.deepEqual(evidence.clipped,[]);assert.deepEqual(evidence.visibleBars,evidence.expectedBars);
  assert.equal(evidence.annexes,evidence.model.selection.length);assert.ok(evidence.tablesComplete>0);
  assert.deepEqual(evidence.presentation.headings,['Histórico CASUR','Histórico del período seleccionado']);
  assert.equal(evidence.presentation.obsolete,false);assert.equal(evidence.presentation.headerPeriod,false);
  assert.equal(evidence.presentation.unitsBelow,true);assert.equal(evidence.presentation.annexDistanceCards,false);
  assert.equal(evidence.presentation.annexKpis,evidence.model.selection.length*4);
  assert.ok(evidence.printCards.length>=8);assert.ok(evidence.printCards.every(c=>c.background==='rgb(255, 255, 255)'&&c.contrast>=7));
  const m=evidence.model;
  if(item.id==='A'){
    assert.deepEqual([m.period.areaMean,m.period.tch,m.period.katm,Number(m.period.tahAudit.tah.toFixed(2)),m.currentDistance.kmWeighted],[187.41,53.57,105.66,5.66,36.10]);
    assert.deepEqual([m.full.areaMean,m.full.tch,m.full.katm,Number(m.full.tahAudit.tah.toFixed(2))],[204.26,61.20,108.63,6.65]);
    assert.ok(evidence.presentation.selection.includes('Rancho Peirano (983) — suertes 01, 04 y 04A'));
    assert.ok(evidence.presentation.pdfSelection.includes('Rancho Peirano (983) — suertes 01, 04 y 04A'));
    assert.ok(evidence.presentation.selection.includes('Dolores (256) — finca completa'));
    assert.equal(evidence.presentation.compactDistance,'Distancia ponderada: 36.10 km');
  }
  if(item.id==='B')assert.deepEqual([m.period.areaMean,m.period.tch,m.period.katm,m.currentDistance.kmWeighted],[188.84,48.92,108.56,36.10]);
  await page.locator('.hist-multi-global').screenshot({path:path.join(out,`${item.id}_${width}_productividad.png`)});
  await page.locator('.hist-multi-included').screenshot({path:path.join(out,`${item.id}_${width}_seleccion.png`)});
  if(m.selection.length>1)await page.locator('.hist-multi-comparison').screenshot({path:path.join(out,`${item.id}_${width}_barras.png`)});
  if(width===390&&m.selection.length>1){const scrolled=await page.locator('.hist-bars .svgbox').first().evaluate(n=>{n.scrollLeft=n.scrollWidth;return n.scrollLeft>0;});assert.ok(scrolled);await page.locator('.hist-bars .svgbox').first().evaluate(n=>n.scrollLeft=0);}
  await page.locator('.hist-multi-global').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`${item.id}_${width}_viewport.png`)});
  await page.locator('.hist-multi-global .historical-chart-metric button').filter({hasText:'KATM'}).click();
  await page.locator('.hist-multi-global .historical-chart-card').screenshot({path:path.join(out,`${item.id}_${width}_historico_KATM.png`)});
  uiResults.push({case:item.id,width,evidence,errors});fs.writeFileSync(path.join(out,'qa-ui.json'),JSON.stringify(uiResults,null,2));
  for(const variant of (['A','B'].includes(item.id)?['executive','complete']:width===1440?['executive']:[])){
    const pending=page.waitForEvent('download',{timeout:180000});await page.locator(`[data-pdf-variant="${variant}"]`).click();const download=await pending,file=path.join(out,`${item.id}_${width}_${variant}.pdf`);await download.saveAs(file);
    const pages=await renderPdf(file),layout=await page.evaluate(()=>window.CASUR_VISUAL_EXPORT.lastLayoutAudit);
    if(['A','B'].includes(item.id))assert.ok(pages.length<=(variant==='complete'?5:2),'No agregar páginas respecto a V2.1');
    assert.equal(layout.missingRows,0);assert.equal(layout.duplicatedRows,0);assert.ok(layout.pages.every(p=>p.height<=layout.capacity+1));
    if(variant==='complete')assert.equal(layout.pages.filter(p=>p.titles[0]?.startsWith('Anexo ·')).length,m.selection.length);
    results.push({case:item.id,width,variant,file:path.basename(file),pages,layout,evidence,errors});fs.writeFileSync(path.join(out,'qa-results.json'),JSON.stringify(results,null,2));
  }
  if(item.id==='A'){
    for(const mode of ['Última','Últimas 3','Todas']){await page.getByRole('button',{name:mode,exact:true}).click();const changed=await page.evaluate(()=>window.getHistoricoDualSummary());assert.deepEqual(changed.full,m.full);if(mode==='Todas')assert.deepEqual(changed.full,changed.period);const check=await inspect(page);assert.deepEqual(check.collisions,[]);assert.deepEqual(check.clipped,[]);}
    await page.getByRole('button',{name:'Personalizado',exact:true}).click();await page.locator('.hist-multi-custom input[onchange*="2526"]').uncheck();
    assert.equal(await page.locator('.dual-period .dual-kpi b').allTextContents().then(v=>v.every(s=>s==='N/D')),true);
    assert.equal(await page.evaluate(()=>window.getHistoricoDualSummary().period.tahAudit.tah),null);
    await page.getByRole('button',{name:'Todas',exact:true}).click();
    await page.evaluate(()=>window.toggleHistoricoSuerteSelection('LOTE::98304A',false));await page.evaluate(()=>window.renderHistoricoMultiSummary());
    const changed=await page.evaluate(()=>window.getHistoricoDualSummary());assert.notEqual(changed.full.areaAccumulated,m.full.areaAccumulated);assert.ok(!changed.selection.find(f=>f.farmCode==='983').lotIds.includes('98304A'));
  }
  assert.deepEqual(errors,[]);await context.close();
 }}}finally{await browser.close();}
 console.log(JSON.stringify(results.map(r=>({case:r.case,width:r.width,variant:r.variant,pages:r.pages.length,errors:r.errors})),null,2));
}
run().catch(e=>{console.error(e);process.exitCode=1;});
