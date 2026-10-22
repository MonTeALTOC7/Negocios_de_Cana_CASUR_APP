// Requires externally installed Playwright; does not change project dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');
const base = process.env.CASUR_PREVIEW_URL || 'http://127.0.0.1:4195/modules/produccion/';
const out = process.env.CASUR_QA_OUT || path.join(os.tmpdir(), 'casur-panorama-b1-qa');
const format = value => Number.isFinite(value) ? value.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/D';
async function run() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.CASUR_CHROME_EXECUTABLE ? { executablePath: process.env.CASUR_CHROME_EXECUTABLE } : {}) });
  const report = [];
  try {
    for (const shell of [false, true]) for (const [width, height] of [[1440, 900], [390, 844]]) {
      // Fresh disposable browser profile, including the real root SW in shell QA.
      const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: shell ? 'allow' : 'block' });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (['error', 'warning'].includes(m.type())) errors.push(m.text()); });
      const url = shell ? new URL('/#/modulo/produccion', base).href : base;
      const response = await page.goto(url, { waitUntil: 'load' }); assert.equal(response.status(), 200);
      if (shell) {
        // The first SW activation reloads the shell; start after that transition.
        await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
        await page.waitForTimeout(600);
        await page.waitForSelector('#mFrame');
      }
      const frame = shell ? await (await page.locator('#mFrame').elementHandle()).contentFrame() : page.mainFrame();
      await frame.waitForFunction(() => typeof window.goHistoricoModule === 'function');
      await frame.evaluate(() => window.goHistoricoModule());
      await frame.locator('#historicoMultiToggle').click();
      await frame.locator('#q').fill('256'); await frame.locator('#q').press('Enter');
      await frame.getByRole('button', { name: 'Agregar finca completa' }).click();
      await frame.locator('#q').fill('983'); await frame.locator('#q').press('Enter');
      await frame.locator('.hist-row-check[data-code="LOTE::98301"]').check();
      await frame.locator('.hist-row-check[data-code="LOTE::98302"]').check();
      await frame.getByRole('button', { name: 'Analizar selección' }).first().click();
      const pan = frame.locator('.historical-panorama');
      const scopeSignature = () => frame.evaluate(() => JSON.stringify(window.getHistoricoMultiAnalysis().selection));
      const overflow = async () => {
        const size = await frame.evaluate(() => ({ w: innerWidth, scroll: document.documentElement.scrollWidth }));
        assert.ok(size.scroll <= size.w, JSON.stringify({ shell, width, size }));
      };
      const shot = async name => {
        await overflow(); await page.waitForTimeout(150);
        const file = path.join(out, `${name}_${shell ? 'shell' : 'directo'}_${width}x${height}.png`);
        if (shell) {
          // A locator screenshot taller than its iframe viewport yields clipped
          // pixels. Capture actual shell viewports and separate scroll positions.
          await frame.evaluate(target => { const el = document.querySelector(target); window.scrollTo({ top: scrollY + el.getBoundingClientRect().top - 90, behavior: 'instant' }); }, name === 'calidad' ? '.historical-panorama-quality' : '.historical-panorama');
          await page.screenshot({ path: file });
        } else await pan.screenshot({ path: file });
      };
      async function verify(name, expected) {
        const a = await frame.evaluate(() => window.getHistoricoMultiAnalysis());
        assert.equal(a.consolidated.selectedLotCount, 17);
        for (const [key, value] of Object.entries(expected)) {
          const card = pan.locator(`[data-pan-kpi="${key}"] strong`);
          assert.ok((await card.innerText()).includes(format(value)), key + ': ' + await card.innerText());
        }
        const age = a.consolidated.metricCoverage.edad;
        assert.match(await pan.locator('[data-pan-kpi="edad"] p').innerText(), new RegExp(format(age.pct)));
        report.push({ name, shell, viewport: `${width}x${height}`, selectedZafras: a.selectedZafras, summary: a.consolidated });
        await shot(name);
      }
      await verify('ultima', { tch: 40.57, katm: 103.9, ton: 7659.24, area: 188.78, edad: 11.8 });
      assert.equal(await pan.locator('.historical-panorama-dot').count(), 1);
      assert.equal(await pan.locator('.historical-panorama-line').count(), 0);
      const original = await scopeSignature();
      await pan.getByRole('button', { name: 'Últimas 3', exact: true }).click();
      await verify('ultimas3', { tch: 48.92, katm: 108.56, ton: 27713.49, area: 188.84, edad: 11.6 });
      if (shell) {
        for (const [name, selector] of [['grafico', '.historical-panorama-chart-heading'], ['cobertura', '.historical-panorama-coverage']]) {
          await frame.evaluate(selector => { const el = document.querySelector(selector); window.scrollTo({ top: scrollY + el.getBoundingClientRect().top - 100, behavior: 'instant' }); }, selector);
          await page.screenshot({ path: path.join(out, `${name}_shell_${width}x${height}.png`) });
        }
      }
      assert.match(await pan.locator('[data-pan-kpi="area"] p').innerText(), /566.52/);
      assert.match(await pan.locator('.historical-panorama-warning').first().innerText(), /Cambian las suertes/);
      if (!shell && width === 1440) {
        const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
        const start = source.indexOf('async function getCurrentSource(operative)');
        const end = source.indexOf('  function replaceAssignedObject', start);
        const dependencies = await frame.evaluate(async functionSource => {
          const getSource = new Function('return (' + functionSource + ')')();
          const html = await getSource(false);
          const exported = new DOMParser().parseFromString(html, 'text/html');
          return ['css/historical-panorama.css', 'js/historical-panorama-model.js', 'js/historical-panorama.js'].map(asset =>
            ({ asset, externalReference: Boolean(exported.querySelector('[src="' + asset + '"],[href="' + asset + '"]')),
              inline: asset.endsWith('.css') ? [...exported.querySelectorAll('style')].some(el => el.textContent.includes('.historical-panorama-kpis')) :
                [...exported.querySelectorAll('script:not([src])')].some(el => el.textContent.includes(asset.includes('-model.') ? 'function buildPanoramaModel' : 'function paint(view')) }));
        }, source.slice(start, end));
        assert.ok(dependencies.every(d => d.inline && !d.externalReference), JSON.stringify(dependencies));
        report.push({ selfContainedExportDependencies: dependencies });
      }
      for (const metric of ['katm', 'ton', 'area', 'tch']) {
        const button = pan.locator(`[data-pan-action="metric"][data-value="${metric}"]`);
        await button.click();
        assert.equal(await scopeSignature(), original);
        assert.equal(await pan.locator('.historical-panorama-reference').count(), ['tch', 'katm'].includes(metric) ? 1 : 0);
        const hit = pan.locator('[data-pan-point="2324"]');
        await hit.focus(); await page.keyboard.press('Enter');
        const a = await frame.evaluate(() => window.getHistoricoMultiAnalysis());
        const row = a.series.find(s => s.zafra === 2324);
        assert.ok((await pan.locator('.historical-panorama-readout b').innerText()).includes(format(row[metric])));
        assert.match(await pan.locator('.historical-panorama-readout').innerText(), /10\/17 suertes/);
        await overflow();
      }
      // Viewport evidence avoids full-page sticky-header artifacts.
      await frame.evaluate(() => {
        const p = document.querySelector('.historical-panorama');
        window.scrollTo({ top: scrollY + p.getBoundingClientRect().top - 110, behavior: 'instant' });
      });
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(out, `viewport_${shell ? 'shell' : 'directo'}_${width}x${height}.png`) });
      const before = await pan.locator('[data-pan-action="metric"][data-value="katm"]').boundingBox();
      await pan.locator('[data-pan-action="metric"][data-value="katm"]').click();
      const after = await pan.locator('[data-pan-action="metric"][data-value="katm"]').boundingBox();
      // Playwright may first scroll the control into view: compare only once it is visible.
      const stable = await pan.locator('[data-pan-action="metric"][data-value="tch"]').boundingBox();
      await pan.locator('[data-pan-action="metric"][data-value="tch"]').click();
      const stableAfter = await pan.locator('[data-pan-action="metric"][data-value="tch"]').boundingBox();
      assert.ok(Math.abs(stable.y - stableAfter.y) < 3, JSON.stringify({ before, after, stable, stableAfter }));
      await pan.locator('.historical-panorama-quality summary').click();
      assert.match(await pan.locator('.historical-panorama-quality-body').innerText(), /500.74 ha/);
      await shot('calidad');
      await pan.locator('.historical-panorama-quality summary').click();
      for (const mode of ['last5', 'all']) {
        await pan.locator(`[data-pan-action="period"][data-value="${mode}"]`).click();
        const a = await frame.evaluate(() => window.getHistoricoMultiAnalysis());
        assert.ok((await pan.locator('[data-pan-kpi="tch"] strong').innerText()).includes(format(a.consolidated.tch)));
        if (width < 760) assert.ok(await pan.locator('.historical-panorama-chart text').filter({ hasText: /^\d{2}\/\d{2}$/ }).count() <= 4);
        await overflow();
      }
      await shot('todas');
      await pan.locator('[data-value="latest"][data-pan-action="period"]').click();
      await pan.locator('[data-value="custom"][data-pan-action="period"]').click();
      await pan.locator('[data-pan-zafra="1920"]').check();
      assert.deepEqual(await frame.evaluate(() => window.getHistoricoMultiAnalysis().selectedZafras), [1920, 2526]);
      await shot('personalizado');
      await pan.locator('[data-pan-zafra="1920"]').uncheck(); await pan.locator('[data-pan-zafra="2526"]').uncheck();
      assert.match(await pan.locator('[data-pan-state="empty-period"]').innerText(), /Marque al menos una zafra/);
      for (const key of ['tch','katm','area','ton','edad','coverage']) assert.equal(await pan.locator(`[data-pan-kpi="${key}"] strong`).innerText(), 'N/D');
      await shot('sin_zafras_marcadas');
      await pan.locator('[data-pan-zafra="1920"]').check(); await pan.locator('[data-pan-zafra="2526"]').check();
      await frame.locator('.hist-multi-farm-chip').filter({ hasText: '256 · Dolores' }).getByRole('button', { name: /Quitar/ }).click();
      await frame.locator('.hist-multi-farm-chip').filter({ hasText: '983 · Rancho Peirano' }).getByRole('button', { name: /Quitar/ }).click();
      await frame.locator('#q').fill('25608'); await frame.locator('#q').press('Enter');
      assert.equal(await frame.locator('#producerSelect').inputValue(), '256');
      await frame.getByRole('button', { name: 'Analizar selección' }).first().click();
      assert.match(await pan.locator('[data-pan-state="no-records"]').innerText(), /No hay registros/);
      assert.match(await pan.locator('.historical-panorama-scope').innerText(), /0 de 2 zafras solicitadas/);
      assert.equal(await pan.locator('[data-pan-kpi="edad"] p').innerText(), 'Cobertura N/D');
      await shot('solicitado_sin_registros');
      await pan.locator('[data-pan-zafra="1920"]').click();
      assert.deepEqual(await frame.evaluate(() => window.getHistoricoMultiAnalysis().requestedCustomZafras), [2526]);
      // Search the complete historical catalog, not the B0 example only.
      await frame.locator('#q').fill('993'); await frame.locator('#q').press('Enter');
      assert.ok(await frame.locator('.hist-row-check').count() > 2);
      await frame.getByRole('button', { name: 'Agregar finca completa' }).click();
      await pan.locator('[data-pan-action="period"][data-value="latest"]').click();
      assert.ok((await frame.evaluate(() => window.getHistoricoMultiAnalysis().selection)).some(f => f.farmCode === '993'));
      await overflow();
      assert.equal(await pan.getByRole('button', { name: /^Comparar$|^Explorar$/ }).count(), 0);
      if (shell) assert.equal(await page.locator('iframe').count(), 1);
      assert.deepEqual(errors, []);
      report.push({ shell, viewport: `${width}x${height}`, console: errors, cases: ['4 métricas', '5 períodos', 'personalizado no contiguo', 'sin zafras marcadas', 'sin registros solicitados', 'catálogo fuera del ejemplo', 'scroll estable', 'un solo iframe'] });
      if (shell) {
        await page.close();
        await context.setOffline(true);
        const offline = await context.newPage();
        const offlineErrors = [];
        offline.on('pageerror', error => offlineErrors.push(error.message));
        await offline.goto(url, { waitUntil: 'load' });
        await offline.waitForSelector('#mFrame');
        const module = await (await offline.locator('#mFrame').elementHandle()).contentFrame();
        await module.waitForFunction(() => typeof window.goHistoricoModule === 'function');
        await module.evaluate(() => window.goHistoricoModule());
        await module.locator('#historicoMultiToggle').click();
        await module.locator('#q').fill('256'); await module.locator('#q').press('Enter');
        await module.getByRole('button', { name: 'Agregar finca completa' }).click();
        await module.locator('#q').fill('983'); await module.locator('#q').press('Enter');
        await module.locator('.hist-row-check[data-code="LOTE::98301"]').check();
        await module.locator('.hist-row-check[data-code="LOTE::98302"]').check();
        await module.getByRole('button', { name: 'Analizar selección' }).first().click();
        await module.locator('[data-pan-action="period"][data-value="last3"]').click();
        assert.match(await module.locator('[data-pan-kpi="tch"] strong').innerText(), /48.92/);
        assert.match(await module.locator('[data-pan-kpi="ton"] strong').innerText(), /27,713.49/);
        assert.deepEqual(offlineErrors, []);
        report.push({ shell, viewport: `${width}x${height}`, offlineAfterWarmNewPage: true, tch: 48.92, ton: 27713.49, runtimeErrors: offlineErrors });
      }
      await context.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, 'qa-results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.filter(r => r.cases), null, 2));
}
run().catch(error => { console.error(error); process.exitCode = 1; });
