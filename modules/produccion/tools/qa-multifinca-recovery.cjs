// QA del Histórico recuperado. Usa Playwright externo; no escribe datos del proyecto.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const base = process.env.CASUR_PREVIEW_URL || 'http://127.0.0.1:4195/';
const out = process.env.CASUR_QA_OUT || path.join(process.cwd(), 'qa-multifinca-recovery');

async function selectOfficial(page) {
  await page.evaluate(() => window.goHistoricoModule());
  await page.locator('#historicoMultiToggle').click();
  await page.locator('#q').fill('256');
  await page.locator('#q').press('Enter');
  await page.getByRole('button', { name: 'Agregar finca completa' }).click();
  await page.locator('#q').fill('983');
  await page.locator('#q').press('Enter');
  await page.locator('.hist-row-check[data-code="LOTE::98301"]').check();
  await page.locator('.hist-row-check[data-code="LOTE::98302"]').check();
  await page.getByRole('button', { name: 'Analizar selección' }).first().click();
}

async function snapshot(page, name) {
  await page.locator('.hist-multi-summary-root').screenshot({ path: path.join(out, `${name}.png`) });
}

async function download(page, kind, name, host=page) {
  const promise = host.waitForEvent('download', { timeout: 90000 });
  await page.locator(`[data-casur-export-kind="${kind}"] .${name.endsWith('.png')?'image':'pdf'}`).click();
  const file = await promise;
  const location = path.join(out, name);
  await file.saveAs(location);
  assert.ok(fs.statSync(location).size > 20000, `${name}: PDF demasiado pequeño`);
  return { name, bytes: fs.statSync(location).size };
}

async function run() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CASUR_CHROME_EXECUTABLE ? { executablePath: process.env.CASUR_CHROME_EXECUTABLE } : {}) });
  const report = [];
  try {
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      const context = await browser.newContext({ viewport: { width, height }, acceptDownloads: true, serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const response = await page.goto(new URL('modules/produccion/', base).href, { waitUntil: 'load' });
      assert.equal(response.status(), 200);
      await selectOfficial(page);
      const latest = await page.evaluate(() => window.getHistoricoMultiAnalysis());
      assert.equal(latest.consolidated.area, 188.78);
      assert.equal(latest.consolidated.tch, 40.57);
      assert.equal(latest.consolidated.katm, 103.90);
      assert.equal(await page.locator('.hist-multi-farm-report').count(), 2);
      assert.equal(await page.locator('.hist-multi-global .historical-chart-card').count(), 1);
      assert.equal(await page.locator('.hist-multi-farm-report .historical-chart-card').count(), 2);
      assert.equal(await page.locator('.hist-multi-comparison-chart').count(), 1);
      await snapshot(page, `ultima_${width}x${height}`);

      await page.getByRole('button', { name: 'Últimas 3' }).click();
      const three = await page.evaluate(() => window.getHistoricoMultiAnalysis());
      assert.equal(three.consolidated.areaAccumulated, 566.52);
      assert.equal(three.consolidated.areaAverage, 188.84);
      assert.equal(three.consolidated.tch, 48.92);
      assert.equal(three.consolidated.katm, 108.56);
      assert.match(await page.locator('.hist-multi-global .hist-multi-original-kpis').innerText(), /48[.,]92/);
      assert.match(await page.locator('.hist-multi-global .hist-multi-original-kpis').innerText(), /188[.,]84/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await snapshot(page, `ultimas3_${width}x${height}`);
      await page.locator('.hist-multi-global .kpis').screenshot({path:path.join(out,`kpi_${width}x${height}.png`)});
      await page.locator('.hist-multi-comparison-chart').screenshot({ path: path.join(out, `comparacion_${width}x${height}.png`) });
      await page.locator('.hist-multi-farm-report').first().screenshot({ path: path.join(out, `finca_${width}x${height}.png`) });
      await page.locator('.hist-multi-global .historical-chart-metric button').filter({ hasText: 'KATM' }).click();
      assert.match(await page.locator('.hist-multi-comparison-chart h3').innerText(), /KATM/);
      assert.equal(await page.locator('.hist-multi-global .historical-chart-point[aria-describedby="historicalMultiChartGlobal"]').count() > 0, true);
      if (width === 1440) {
        report.push(await download(page, 'historico-multiple', 'Historico_Multifinca_CASUR.pdf'));
        report.push(await download(page, 'historico-multiple', 'Historico_Multifinca_CASUR.png'));
      }
      await page.getByRole('button', { name: 'Personalizado' }).click();
      await page.locator('.hist-multi-custom input[onchange*="1920"]').check();
      assert.deepEqual(await page.evaluate(() => window.getHistoricoMultiAnalysis().selectedZafras), [1920, 2526]);
      await snapshot(page, `personalizado_${width}x${height}`);
      for (const label of ['Últimas 5','Todas']) {
        await page.getByRole('button', { name: label, exact: true }).click();
        const state=await page.evaluate(()=>window.getHistoricoMultiAnalysis());
        assert.equal(state.selection.find(f=>f.farmCode==='983').lotIds.length,2);
        assert.ok(state.selectedZafras.length>=5);
      }
      await page.evaluate(()=>window.addHistoricoMultiFarm('983'));
      await page.getByRole('button',{name:'Últimas 3',exact:true}).click();
      assert.equal(await page.evaluate(()=>window.getHistoricoMultiAnalysis().selection.find(f=>f.farmCode==='983').mode),'full');
      if(width===1440)report.push(await download(page,'historico-multiple','Historico_Dos_Fincas_Completas.pdf'));
      await page.evaluate(()=>window.removeHistoricoMultiFarm('983'));
      assert.equal(await page.locator('.hist-multi-farm-report').count(),1);
      if (width === 1440) {
        await page.evaluate(() => window.renderEntity('256'));
        assert.equal(await page.locator('#printPanel .historical-chart-card').count(), 1);
        report.push(await download(page, 'historico', 'Historico_Dolores_Individual.pdf'));
        report.push(await download(page, 'historico', 'Historico_Dolores_Individual.png'));
        await page.locator('#printPanel').screenshot({path:path.join(out,'individual_finca_1440x900.png')});
        await page.evaluate(() => window.renderEntity('LOTE::98301'));
        assert.equal(await page.locator('#printPanel .historical-chart-card').count(), 1);
        assert.equal(await page.locator('#printPanel .table-wrap').count() > 0, true);
        await page.locator('#printPanel').screenshot({path:path.join(out,'individual_suerte_1440x900.png')});
        report.push(await download(page,'historico','Historico_Suerte_98301.pdf'));
        await page.evaluate(()=>{window.goCronoSelector();window.renderCronoProducer('993');});
        assert.match(await page.locator('#cronoContent').innerText(),/Pansaco/);
        report.push(await download(page,'cronologico','Cronologico_Pansaco_Regresion.pdf'));
        await page.evaluate(()=>window.goZoneModule());
        assert.ok(await page.locator('#zoneAnalysisSection').innerText());
        await page.evaluate(()=>window.goCronoZoneModule());
        assert.ok(await page.locator('#cronoZoneSection').innerText());
      }
      assert.deepEqual(errors, []);
      report.push({ viewport: `${width}x${height}`, latest: { area: latest.consolidated.area, tch: latest.consolidated.tch, katm: latest.consolidated.katm },
        last3: { area: three.consolidated.areaAccumulated, average: three.consolidated.areaAverage, tch: three.consolidated.tch, katm: three.consolidated.katm }, errors });
      await context.close();
    }
    const shellContext=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
    const shell=await shellContext.newPage();const shellErrors=[];
    shell.on('pageerror',e=>shellErrors.push(e.message));
    await shell.goto(new URL('#/modulo/produccion',base).href,{waitUntil:'load'});
    await shell.evaluate(()=>navigator.serviceWorker.ready);
    await shell.waitForTimeout(1500);
    await shell.waitForFunction(()=>!!navigator.serviceWorker.controller);
    const moduleFrame=()=>shell.frames().find(f=>f.url().includes('/modules/produccion/'));
    await shell.waitForFunction(()=>document.querySelector('iframe')?.contentWindow?.goHistoricoModule);
    await selectOfficial(moduleFrame());
    await moduleFrame().getByRole('button',{name:'Últimas 3',exact:true}).click();
    assert.equal(await moduleFrame().evaluate(()=>window.getHistoricoMultiAnalysis().consolidated.tch),48.92);
    await shell.screenshot({path:path.join(out,'shell_390x844.png')});
    assert.equal(await shell.locator('iframe').count(),1);
    await shellContext.setOffline(true);
    await shell.reload({waitUntil:'load'});
    await shell.waitForFunction(()=>document.querySelector('iframe')?.contentWindow?.goHistoricoModule);
    await selectOfficial(moduleFrame());
    await moduleFrame().getByRole('button',{name:'Últimas 3',exact:true}).click();
    assert.equal(await moduleFrame().evaluate(()=>window.getHistoricoMultiAnalysis().consolidated.tch),48.92);
    report.push(await download(moduleFrame(),'historico-multiple','Historico_Multifinca_Offline.pdf',shell));
    assert.deepEqual(shellErrors,[]);
    report.push({shell:true,offline:'recarga con caché precargada y descarga PDF',tch:48.92,errors:shellErrors});
    await shellContext.close();
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, 'qa-results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

run().catch(error => { console.error(error); process.exitCode = 1; });
