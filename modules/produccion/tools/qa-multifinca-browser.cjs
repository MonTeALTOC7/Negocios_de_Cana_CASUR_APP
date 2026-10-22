// QA opcional de navegador real. Requiere Playwright instalado fuera del proyecto.
// CASUR_PREVIEW_URL, CASUR_CHROME_EXECUTABLE y CASUR_QA_OUT son opcionales.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const url = process.env.CASUR_PREVIEW_URL || 'http://127.0.0.1:4194/modules/produccion/';
const out = process.env.CASUR_QA_OUT || path.join(os.tmpdir(), 'casur-pr23-multifinca-qa');

async function run() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CASUR_CHROME_EXECUTABLE ? { executablePath: process.env.CASUR_CHROME_EXECUTABLE } : {}) });
  const report = [];
  try {
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (['warning', 'error'].includes(message.type())) errors.push(message.text()); });
      const response = await page.goto(url, { waitUntil: 'load' });
      assert.equal(response.status(), 200);
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

      async function verify(state, area, tch, katm, edad, ageCoverage, ageArea) {
        const cards = page.locator('.hist-multi-stage-kpis .kpi');
        assert.match(await cards.nth(0).innerText(), new RegExp(area));
        assert.match(await cards.nth(1).innerText(), new RegExp(tch));
        assert.match(await cards.nth(2).innerText(), new RegExp(katm));
        assert.match(await cards.nth(3).innerText(), new RegExp(edad));
        assert.match(await cards.nth(3).innerText(), new RegExp(ageCoverage));
        assert.match(await cards.nth(3).innerText(), new RegExp(ageArea));
        const engine = await page.evaluate(() => window.getHistoricoMultiAnalysis());
        assert.equal(engine.consolidated.selectedLotCount, 17);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        const tables = page.locator('.hist-multi-stage-a .table-wrap');
        if (width < 760) {
          assert.equal(await page.locator('.hist-multi-scroll-hint').first().isVisible(), true);
          assert.equal(await tables.first().evaluate(el => { el.scrollLeft = el.scrollWidth; return el.scrollLeft > 0; }), true);
        }
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(out, `${state}_${width}x${height}.png`), fullPage: true });
        report.push({ state, viewport: `${width}x${height}`, selectedZafras: engine.selectedZafras,
          area: engine.consolidated.area, areaAverage: engine.consolidated.areaAverage,
          tch: engine.consolidated.tch, katm: engine.consolidated.katm, edad: engine.consolidated.edad,
          ageCoverage: engine.consolidated.metricCoverage.edad, errors: [...errors] });
      }

      await verify('ultima', '188.78 ha', '40.57', '103.90', '11.80 meses', '65.16', '123.00/188.78 ha');
      await page.getByRole('button', { name: 'Últimas 3' }).click();
      await verify('ultimas3', '188.84 ha/zafra', '48.92', '108.56', '11.60 meses', '88.39', '500.74/566.52 ha');
      const sticky = await page.evaluate(() => {
        const header = document.querySelector('header');
        const kpis = document.querySelector('.hist-multi-stage-kpis');
        window.scrollTo(0, scrollY + kpis.getBoundingClientRect().top - header.getBoundingClientRect().height - 12);
        return { headerHeight: header.getBoundingClientRect().height };
      });
      await page.waitForTimeout(350);
      const visible = await page.evaluate(() => {
        const header = document.querySelector('header').getBoundingClientRect();
        const kpis = document.querySelector('.hist-multi-stage-kpis').getBoundingClientRect();
        return { headerBottom: header.bottom, kpisTop: kpis.top };
      });
      assert.ok(visible.kpisTop >= visible.headerBottom, JSON.stringify({ sticky, visible }));
      await page.screenshot({ path: path.join(out, `uso_normal_${width}x${height}.png`) });

      await page.getByRole('button', { name: 'Personalizado' }).click();
      await page.locator('.hist-multi-custom input[onchange*="1920"]').check();
      assert.deepEqual(await page.evaluate(() => window.getHistoricoMultiAnalysis().selectedZafras), [1920, 2526]);
      await page.locator('.hist-multi-farm-chip').filter({ hasText: '256 · Dolores' }).getByRole('button', { name: /Quitar/ }).click();
      await page.locator('.hist-multi-farm-chip').filter({ hasText: '983 · Rancho Peirano' }).getByRole('button', { name: /Quitar/ }).click();
      await page.locator('#q').fill('25608');
      await page.locator('#q').press('Enter');
      assert.equal(await page.locator('#producerSelect').inputValue(), '256');
      await page.getByRole('button', { name: 'Analizar selección' }).first().click();
      // 25608 solo tiene 16/17 y 17/18: las zafras solicitadas no se sustituyen.
      const noData = await page.evaluate(() => window.getHistoricoMultiAnalysis());
      assert.equal(noData.periodStatus, 'no-data');
      assert.deepEqual(noData.selectedZafras, []);
      assert.deepEqual(noData.requestedCustomZafras, [1920, 2526]);
      assert.match(await page.locator('.hist-multi-period-alert').innerText(), /No hay registros/);
      assert.match(await page.locator('.hist-multi-badge').last().innerText(), /0 de 2 zafras solicitadas con registros/);
      assert.equal(await page.locator('.hist-multi-stage-kpis .kpi').nth(3).locator('em').innerText(), 'Cobertura N/D');
      assert.match(await page.locator('.hist-multi-custom').innerText(), /sin registro aquí/);
      assert.equal(await page.locator('.hist-multi-custom input[onchange*="1920"]').isChecked(), true);
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(out, `sin_registros_${width}x${height}.png`), fullPage: true });
      report.push({ state: 'sin registros', viewport: `${width}x${height}`, status: noData.periodStatus,
        requested: noData.requestedCustomZafras, selected: noData.selectedZafras, errors: [...errors] });
      await page.locator('.hist-multi-custom input[onchange*="1920"]').click();
      assert.deepEqual(await page.evaluate(() => window.getHistoricoMultiAnalysis().requestedCustomZafras), [2526]);
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); }
  console.log(JSON.stringify(report, null, 2));
}

run().catch(error => { console.error(error); process.exitCode = 1; });
