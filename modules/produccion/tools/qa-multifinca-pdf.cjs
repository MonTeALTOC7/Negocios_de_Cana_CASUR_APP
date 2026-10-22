// QA aislado de PDF; Playwright externo, sin alterar datos ni persistencia del usuario.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.CASUR_QA_OUT || path.resolve('output/pdf');
const base = process.env.CASUR_PREVIEW_URL || 'http://127.0.0.1:4195/';
async function run() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({headless:true, ...(process.env.CASUR_CHROME_EXECUTABLE ? {executablePath:process.env.CASUR_CHROME_EXECUTABLE}:{})});
  const results=[];
  try {
    for (const [width,height] of [[1440,900],[390,844]]) {
      const context=await browser.newContext({viewport:{width,height},acceptDownloads:true,serviceWorkers:'block'});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      assert.equal((await page.goto(new URL('modules/produccion/',base).href)).status(),200);
      await page.evaluate(()=>window.goHistoricoModule());
      await page.locator('#historicoMultiToggle').click();
      await page.locator('#q').fill('256');await page.locator('#q').press('Enter');
      await page.getByRole('button',{name:'Agregar finca completa'}).click();
      await page.locator('#q').fill('983');await page.locator('#q').press('Enter');
      for(const id of ['98301','98302'])await page.locator(`.hist-row-check[data-code="LOTE::${id}"]`).check();
      await page.getByRole('button',{name:'Analizar selección'}).first().click();
      await page.getByRole('button',{name:'Últimas 3',exact:true}).click();
      // Live metric may be KATM; both exported metrics must remain correct and state untouched.
      await page.locator('.hist-multi-global .historical-chart-metric button').filter({hasText:'KATM'}).click();
      await page.getByRole('button',{name:'PDF ejecutivo',exact:false}).waitFor();
      await page.locator('.hist-multi-header').screenshot({path:path.join(out,`acciones_${width}.png`)});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      const audit=await page.evaluate(()=>{
        const api=window.CASUR_VISUAL_EXPORT,node=api.target('historico-multiple');
        const exec=api.prepareClone(node,'historico-multiple','executive'),full=api.prepareClone(node,'historico-multiple','complete');
        return {labels:[...exec.querySelectorAll('.kpi .label')].map(n=>n.textContent),values:[...exec.querySelectorAll('.kpi strong')].map(n=>n.textContent),titles:[...exec.querySelectorAll('h3')].map(n=>n.textContent),headers:[...exec.querySelectorAll('thead th')].map(n=>n.textContent),comparativeLabels:exec.querySelectorAll('.pdf-comparison-value').length,execAnnexes:exec.querySelectorAll('[data-pdf-new-page]').length,fullBreaks:full.querySelectorAll('[data-pdf-new-page]').length,fullCharts:full.querySelectorAll('.historical-chart-card').length,text:full.textContent,state:window.getHistoricoMultiAnalysis()};
      });
      assert.deepEqual(audit.labels,['Área cosechada por zafra','TCH ponderado','KATM ponderado','Distancia ponderada actual','TAH ponderado']);
      for(const title of ['Histórico TCH por zafra','Histórico KATM por zafra','Resultados globales por zafra','Resultados por finca','Comparación TCH por finca','Comparación KATM por finca'])assert.ok(audit.titles.includes(title),title);
      assert.equal(audit.comparativeLabels,12);assert.equal(audit.execAnnexes,0);assert.equal(audit.fullBreaks,2);assert.equal(audit.fullCharts,8);
      assert.ok(!audit.headers.some(t=>/Edad|Km|Suertes/.test(t)));
      assert.equal(audit.state.consolidated.areaAverage,188.84);assert.equal(audit.state.consolidated.tch,48.92);assert.equal(audit.state.consolidated.katm,108.56);
      assert.match(audit.text,/98301, 98302/);assert.ok(!audit.text.includes('98303'));
      for(const variant of ['executive','complete']) {
        const download=page.waitForEvent('download',{timeout:90000});
        await page.locator(`[data-pdf-variant="${variant}"]`).click();
        const file=await download;
        assert.match(file.suggestedFilename(),variant==='complete'?/_Completo.pdf$/:/_Ejecutivo.pdf$/);
        const pdfPath=path.join(out,`Multifinca_${variant}_${width}.pdf`);
        await file.saveAs(pdfPath);
        const pdfText=fs.readFileSync(pdfPath).toString('latin1');
        const layout=await page.evaluate(()=>window.CASUR_VISUAL_EXPORT.lastLayoutAudit);
        assert.match(pdfText,new RegExp('/Count '+layout.pages.length+'\\b'));
        assert.equal(layout.missingRows,0);assert.equal(layout.duplicatedRows,0);
        assert.match(await page.locator('.hist-multi-global .historical-chart-card h3').innerText(),/KATM/);
        if(width===1440){
          const rendered=await page.evaluate(async variant=>{
            const r=await window.CASUR_VISUAL_EXPORT.renderCanvas('historico-multiple',variant);
            return {image:r.canvas.toDataURL('image/png').split(',')[1],height:r.canvas.height,breaks:r.forcedBreaks,safe:r.safeBreaks};
          },variant);
          fs.writeFileSync(path.join(out,`reporte_${variant}.png`),Buffer.from(rendered.image,'base64'));
          results.push({variant,height:rendered.height,forcedBreaks:rendered.breaks});
        }
      }
      assert.deepEqual(errors,[]);results.push({width,labels:audit.labels,values:audit.values,headers:audit.headers,comparativeLabels:audit.comparativeLabels,errors});
      await context.close();
    }
    fs.writeFileSync(path.join(out,'qa-pdf-results.json'),JSON.stringify(results,null,2));
  } finally {await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
