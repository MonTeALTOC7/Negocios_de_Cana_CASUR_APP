const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const sharp=require('sharp');
const out=process.env.CASUR_QA_OUT,base=process.env.CASUR_PREVIEW_URL;
if(!out||!base)throw Error('Defina CASUR_QA_OUT y CASUR_PREVIEW_URL para el preview aislado.');
const baseline=process.env.CASUR_BASELINE==='1';
const cases=baseline?[{id:'A',lots:['98301','98304','98304A'],mode:'Últimas 5'}]:[
  {id:'A',lots:['98301','98304','98304A'],mode:'Últimas 5'},
  {id:'B',lots:['98301','98302'],mode:'Últimas 3'},
  {id:'C1',lots:[],mode:'Última'},
  {id:'C2',full:true,mode:'Últimas 5'},
  {id:'C3',full:true,extra:['759','242','211'],mode:'Todas'},
  {id:'C4',lots:['98301','98302'],mode:'Personalizado'},
];
async function auditPdf(file){
  const prefix=file.replace(/\.pdf$/,'');
  execFileSync('pdftoppm',['-scale-to','1300','-png',file,prefix]);
  const pages=fs.readdirSync(out).filter(n=>n.startsWith(path.basename(prefix)+'-')&&n.endsWith('.png')).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  const audit=[];
  for(const name of pages){
    const {data,info}=await sharp(path.join(out,name)).resize({width:400}).removeAlpha().raw().toBuffer({resolveWithObject:true});
    let ink=0,active=0;
    for(let y=30;y<info.height-30;y++){let row=0;for(let x=15;x<info.width-15;x++){const p=(y*info.width+x)*info.channels;if(Math.min(data[p],data[p+1],data[p+2])<210)row++;}ink+=row;if(row>5)active++;}
    const occupied=active/(info.height-60),fraction=ink/((info.height-60)*(info.width-30));
    audit.push({png:name,activeRowRatio:occupied,inkFraction:fraction,warning:occupied<.18?'Contenido mínimo: revisar':null});
  }
  return audit;
}
async function run(){
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.CASUR_CHROME_EXECUTABLE});
  const results=[];
  try{for(const item of cases){for(const width of (baseline||!['A','B'].includes(item.id)?[1440]:[1440,390])){
    const context=await browser.newContext({viewport:{width,height:width===390?844:900},acceptDownloads:true,serviceWorkers:'block'});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(new URL('modules/produccion/',base).href);
    await page.evaluate(()=>window.goHistoricoModule());await page.locator('#historicoMultiToggle').click();
    async function farm(code){await page.locator('#q').fill(code);await page.locator('#q').press('Enter');await page.getByRole('button',{name:'Agregar finca completa'}).click();}
    await farm('256');
    if(item.full)await farm('983');else if(item.lots.length){await page.locator('#q').fill('983');await page.locator('#q').press('Enter');for(const id of item.lots)await page.locator(`.hist-row-check[data-code="LOTE::${id}"]`).check();}
    for(const code of item.extra||[])await farm(code);
    await page.getByRole('button',{name:'Analizar selección'}).first().click();await page.getByRole('button',{name:item.mode,exact:true}).click();
    if(item.mode==='Personalizado')await page.locator('.hist-multi-custom input[onchange*="1920"]').check();
    const state=await page.evaluate(()=>window.getHistoricoMultiAnalysis());
    if(item.id==='A')assert.deepEqual(state.selectedZafras,[2122,2223,2324,2425,2526]);
    if(item.id==='B'){assert.equal(state.consolidated.areaAverage,188.84);assert.equal(state.consolidated.tch,48.92);assert.equal(state.consolidated.katm,108.56);assert.equal(state.currentDistance.kmWeighted,36.10);}
    await page.locator('[data-pdf-variant="executive"]').waitFor();
    await page.locator('.hist-multi-header').screenshot({path:path.join(out,`${item.id}_${width}_pantalla.png`)});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const numeric=baseline?null:await page.evaluate(()=>{
      const report=window.historicoMultiReportCharts(),api=window.CASUR_VISUAL_EXPORT;
      const rows=report.rows.filter(r=>report.result.selectedZafras.includes(r.zafra));
      const valid=rows.filter(r=>r.area!=null&&r.area>0&&r.ton!=null&&r.ton>=0&&r.katm!=null&&r.katm>=0);
      const sugar=valid.reduce((sum,r)=>sum+r.ton*r.katm/1000,0),area=valid.reduce((sum,r)=>sum+r.area,0);
      const clone=api.prepareClone(api.target('historico-multiple'),'historico-multiple','executive');
      const kpis=clone.querySelector('[data-tah-audit]'),audit=JSON.parse(kpis.dataset.tahAudit);
      const fmt=v=>v==null?'N/D':v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
      const labels=[...clone.querySelectorAll('.hist-multi-comparison-chart svg')].map(svg=>{
        const groups=new Map();for(const label of svg.querySelectorAll('.pdf-comparison-value')){const x=label.getAttribute('x');if(!groups.has(x))groups.set(x,[]);groups.get(x).push(Number(label.getAttribute('y')));}
        return [...groups.values()].every(ys=>ys.sort((a,b)=>a-b).every((v,i)=>!i||v-ys[i-1]>=14.8));
      });
      const tables=[...clone.querySelectorAll('.executive-season-table')].map(table=>{
        const farm=table.parentElement.querySelector('.pdf-farm-group')?.textContent.split(' · ')[0];
        const audits=JSON.parse(table.dataset.tahAudit);
        return [...table.querySelectorAll('tbody tr')].every((row,i)=>{
          const scoped=rows.filter(r=>(!farm||String(r.farmCode)===farm)&&(audits[i].zafra==null||r.zafra===audits[i].zafra));
          const valid=scoped.filter(r=>r.area>0&&r.ton!=null&&r.ton>=0&&r.katm!=null&&r.katm>=0);
          const area=valid.reduce((s,r)=>s+r.area,0),sugar=valid.reduce((s,r)=>s+r.ton*r.katm/1000,0);
          return audits[i].validArea===area&&audits[i].sugarEquivalentTon===sugar&&row.cells[5].textContent===fmt(area?sugar/area:null);
        });
      });
      return {sugar,area,tah:area?sugar/area:null,audit,visible:kpis.lastElementChild.querySelector('strong').textContent,expected:fmt(area?sugar/area:null)+' t azúcar/ha',labelsSeparated:labels.every(Boolean),tablesReconciled:tables.every(Boolean)};
    });
    if(numeric){assert.equal(numeric.audit.validArea,numeric.area);assert.equal(numeric.audit.sugarEquivalentTon,numeric.sugar);assert.equal(numeric.visible,numeric.expected);assert.ok(numeric.labelsSeparated);assert.ok(numeric.tablesReconciled);}
    for(const variant of ['executive','complete']){
      const pending=page.waitForEvent('download',{timeout:180000});await page.locator(`[data-pdf-variant="${variant}"]`).click();
      const download=await pending,file=path.join(out,`${item.id}_${width}_${variant}.pdf`);await download.saveAs(file);
      const pages=await auditPdf(file);
      const layout=await page.evaluate(()=>window.CASUR_VISUAL_EXPORT.lastLayoutAudit||null);
      results.push({case:item.id,width,variant,file:path.basename(file),pages,layout,numeric,consolidated:state.consolidated,currentDistance:state.currentDistance,errors});
      fs.writeFileSync(path.join(out,'qa-results.json'),JSON.stringify(results,null,2));
      if(!baseline){assert.ok(layout,'Debe existir auditoría de planificación');assert.equal(layout.missingRows,0);assert.equal(layout.duplicatedRows,0);assert.ok(layout.pages.every(p=>p.height<=layout.capacity+1));}
    }
    if(!baseline&&item.id==='C1'){
      // Synthetic long-table stress only in this isolated DOM; official datasets are never written.
      await page.evaluate(()=>{const body=document.querySelector('.hist-multi-farm-report .hist-multi-lot-table tbody');const sample=body.firstElementChild;for(let i=0;i<100;i++)body.appendChild(sample.cloneNode(true));});
      const download=page.waitForEvent('download',{timeout:180000});await page.locator('[data-pdf-variant="complete"]').click();
      const file=path.join(out,'SINTETICO_tabla_larga.pdf');await (await download).saveAs(file);
      const layout=await page.evaluate(()=>window.CASUR_VISUAL_EXPORT.lastLayoutAudit);
      assert.equal(layout.missingRows,0);assert.equal(layout.duplicatedRows,0);assert.ok(layout.sourceRows>100);
      const pages=await auditPdf(file);results.push({case:'SINTETICO_TABLA_LARGA',file:path.basename(file),pages,layout});
      fs.writeFileSync(path.join(out,'qa-results.json'),JSON.stringify(results,null,2));
    }
    assert.deepEqual(errors,[]);await context.close();
  }}}finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
