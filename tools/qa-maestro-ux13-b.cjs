// UX13 · Etapa B — QA funcional, de maquetación y de paridad del Histórico de finca/suerte.
// Uso: node tools/qa-maestro-ux13-b.cjs AFTER_BASE [EVIDENCIA_DIR] [BEFORE_BASE]
//   AFTER_BASE/BEFORE_BASE: servidores tools/serve-maestro-preview.mjs (BEFORE = rama Etapa A).
// Solo lectura: no escribe datos ni almacenamiento oficial. La suerte con KATM ausente se simula
// en memoria (clon de 99301) porque ninguna suerte oficial tiene KATM faltante.
const {chromium} = require('playwright'), assert = require('assert/strict'), fs = require('fs'), path = require('path');
const [base, out, before] = process.argv.slice(2);
if (!base) throw Error('Usage: node tools/qa-maestro-ux13-b.cjs AFTER_BASE [OUT] [BEFORE_BASE]');
if (out) fs.mkdirSync(out, {recursive: true});
const results = [];
const check = (name, fn) => fn().then(() => results.push(['PASS', name]), e => results.push(['FAIL', name, e.message.split('\n')[0]]));
const MODES = ['latest', 'last3', 'last5', 'all'], ENTITIES = ['993', '10', '908', 'LOTE::99301'];
async function open(browser, url, width) {
  const mobile = width < 700;
  const ctx = await browser.newContext({viewport: {width, height: mobile ? 800 : 900}, isMobile: mobile, hasTouch: mobile, acceptDownloads: true});
  const page = await ctx.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  await page.goto(url + 'modules/produccion/');
  await page.waitForFunction(() => window.CASUR_PRODUCTION_READY && window.CASUR_MAESTRO_UX, null, {timeout: 60000});
  return {ctx, page};
}
const hist = (page, code) => page.evaluate(c => { CASUR_MAESTRO_UX.activate('historico'); renderEntity(c); }, code).then(() => page.waitForSelector('#printPanel .historical-agronomic-kpis'));
// Official figures read from the original report nodes (renderer unchanged), per entity and period.
const figures = page => page.evaluate(() => {
  const P = document.querySelector('#printPanel'), t = n => (n?.textContent || '').replace(/\s+/g, ' ').trim();
  return {kpis: Object.fromEntries([...P.querySelectorAll('.historical-agronomic-kpis > .kpi')].map(k => [t(k.querySelector('.label')), t(k.querySelector('strong'))])),
    deltas: [...P.querySelectorAll('.delta-grid .delta')].map(d => t(d.querySelector('span')) + '=' + t(d.querySelector('strong'))),
    rows: [...P.querySelectorAll('.table-wrap tbody tr')].map(r => [...r.cells].slice(0, 6).map(t).join('|')),
    period: t(P.querySelector('.historical-period-summary'))};
});
(async () => {
  const browser = await chromium.launch();
  try {
    // ---------- Paridad de cifras antes/después (motor y renderer originales) ----------
    if (before) {
      const A = await open(browser, before, 390), B = await open(browser, base, 390);
      for (const code of ENTITIES) for (const mode of MODES) await check(`Paridad ${code} · ${mode}: TCH, KATM, área, toneladas, comparadores y tabla idénticos`, async () => {
        const get = async p => { await hist(p, code); await p.evaluate(m => setHistoricalPeriodMode(m), mode); await p.waitForTimeout(250); return figures(p); };
        const [a, b] = [await get(A.page), await get(B.page)];
        assert.deepEqual(b, a);
        assert.ok(Object.keys(b.kpis).some(k => /TCH/.test(k)) && b.rows.length > 0);
      });
      await A.ctx.close(); await B.ctx.close();
    }
    for (const width of [360, 390, 768, 1280, 1536]) {
      const W = `[${width}]`, {ctx, page} = await open(browser, base, width), mobile = width < 768;
      const noHScroll = async label => { const [sw, iw] = await page.evaluate(() => [document.scrollingElement.scrollWidth, innerWidth]); assert.ok(sw <= iw + 1, `${label}: scroll horizontal ${sw}>${iw}`); };
      await hist(page, '993');
      await check(W + ' Finca: buscador único arriba, sin SELECT ni saltos redundantes', async () => {
        assert.ok(await page.locator('#q').isVisible());
        assert.equal(await page.locator('#producerSelect').isVisible(), false);
        assert.equal(await page.locator('#fichaSection .maestro-report-links').isVisible(), false);
        assert.equal(await page.locator('#fichaContent .ficha-screen-title').isVisible(), false);
        const [q, c] = await page.evaluate(() => [document.querySelector('#fichaSection .searchbox').getBoundingClientRect().top, document.querySelector('#fichaContent').getBoundingClientRect().top]);
        assert.ok(q < c); await noHScroll('finca');
      });
      await check(W + ' Finca: hero compacto con un único Exportar y Mapa táctil', async () => {
        await page.waitForSelector('#fichaContent .ficha-band .context-report-trigger', {timeout: 30000});
        assert.equal(await page.locator('#fichaContent .context-report-trigger').count(), 1);
        assert.equal(await page.locator('#fichaContent .ficha-band .casur-visual-action.pdf').isVisible(), false, 'PDF suelto');
        const sizes = await page.evaluate(() => [...document.querySelectorAll('#fichaContent .ficha-band :is(.context-report-trigger,.ux13-band-map)')].map(n => { const r = n.getBoundingClientRect(); return [r.width, r.height]; }));
        assert.equal(sizes.length, 2); for (const [w, h] of sizes) assert.ok(w >= 44 && h >= 44, JSON.stringify(sizes));
        const band = await page.locator('#fichaContent .ficha-band').evaluate(n => n.getBoundingClientRect().height);
        assert.ok(band <= (mobile ? 190 : 110), 'banda ' + band);
      });
      await check(W + ' Período: selector compacto con 5 opciones, rango y persistencia', async () => {
        const sel = page.locator('.ux13-period select');
        assert.deepEqual((await sel.locator('option').allInnerTexts()).map(s => s.trim()), ['Última', 'Últimas 3', 'Últimas 5', 'Todas', 'Personalizado']);
        assert.equal(await page.locator('.historical-period-presets').isVisible(), false);
        const card = await page.locator('.historical-period-card').evaluate(n => n.getBoundingClientRect().height);
        assert.ok(card <= 112, 'tarjeta ' + card); // antes: 235 px con 5 botones
        await sel.selectOption({label: 'Últimas 3'});
        await page.waitForFunction(() => document.querySelector('.ux13-period select')?.selectedOptions[0]?.textContent === 'Últimas 3');
        assert.match(await page.locator('.ux13-period-range').innerText(), /^\d{2}\/\d{2}–\d{2}\/\d{2}$/);
        assert.match(await page.locator('.ux13-period-meta small').innerText(), /3 zafras · \d+ suertes/);
        assert.equal(await page.evaluate(() => HISTORICAL_PERIOD_STATE.periodMode), 'last3');
        await page.evaluate(() => setHistoricalChartMetric('katm')); // re-render: the period must persist
        assert.equal(await page.locator('.ux13-period select').evaluate(s => s.selectedOptions[0].textContent), 'Últimas 3');
        await page.evaluate(() => setHistoricalChartMetric('tch'));
        await page.locator('.ux13-period select').selectOption({label: 'Personalizado'});
        await page.waitForSelector('.historical-season-picker:not([hidden])');
        await page.locator('.historical-season-chip').first().click();
        await page.waitForFunction(() => HISTORICAL_PERIOD_STATE.periodMode === 'custom');
        assert.equal(await page.locator('.ux13-period select').evaluate(s => s.selectedOptions[0].textContent), 'Personalizado');
        await page.locator('.ux13-period select').selectOption({label: 'Última'});
        await noHScroll('período');
      });
      await check(W + ' KPI: TCH, KATM, Área y Edad primero (2×2 móvil / 4 PC) y fórmulas a demanda', async () => {
        const order = await page.evaluate(() => [...document.querySelectorAll('.ux13-kpis > .kpi')].map(k => ({kind: k.dataset.ux13Kpi, r: k.getBoundingClientRect()})).sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left).map(x => [x.kind, Math.round(x.r.top)]));
        assert.deepEqual(order.slice(0, 4).map(x => x[0]), ['tch', 'katm', 'area', 'edad']);
        const tops = new Set(order.slice(0, 4).map(x => x[1]));
        assert.equal(tops.size, mobile ? 2 : 1, 'filas ' + JSON.stringify(order.slice(0, 4)));
        const text = await page.locator('.ux13-kpis').innerText();
        for (const gone of ['Toneladas ÷ área', 'Ponderado por toneladas', 'Ponderada por área válida']) assert.ok(!text.includes(gone), gone);
        assert.match(text, /DISTANCIA|Distancia/); // secondary KPIs remain
        const dist = await page.locator('.ux13-kpis [data-ux13-kpi=secondary]', {hasText: /Distancia/i}).locator('em').innerText();
        assert.ok(dist.length > 0, 'advertencia de distancia visible');
        await page.locator('.ux13-kpi-divider .ux13-help-trigger').click();
        assert.match(await page.locator('.ux13-help:popover-open').innerText(), /toneladas ÷ área/);
        await page.keyboard.press('Escape');
      });
      await check(W + ' Comparar TCH: ' + (mobile ? 'cerrado' : 'abierto') + ' al inicio, conserva período y valores', async () => {
        const det = page.locator('.ux13-compare');
        assert.equal(await det.evaluate(d => d.open), !mobile);
        const deltasBefore = await page.evaluate(() => [...document.querySelectorAll('.delta-grid .delta strong')].map(n => n.textContent));
        assert.equal(deltasBefore.length, 4);
        if (mobile) assert.equal(await page.locator('.delta-grid').isVisible(), false);
        await det.locator('summary').click();
        assert.equal(await page.locator('.delta-grid').isVisible(), mobile);
        if (!mobile) await det.locator('summary').click();
        assert.ok(await page.locator('.delta-grid').isVisible());
        await page.locator('.ux13-period select').selectOption({label: 'Últimas 5'});
        await page.waitForFunction(() => HISTORICAL_PERIOD_STATE.periodMode === 'last5');
        assert.equal(await page.locator('.ux13-compare').evaluate(d => d.open), true, 'estado abierto tras cambiar período');
        assert.equal(await page.locator('.historical-comparison-title').isVisible(), false);
        await page.locator('.ux13-period select').selectOption({label: 'Última'});
        assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.delta-grid .delta strong')].map(n => n.textContent)), deltasBefore);
      });
      await check(W + ' Gráfico del Histórico: tooltip contenido en su caja y dentro de la pantalla', async () => {
        const dot = page.locator('.historical-chart-point').last().locator('.historical-chart-dot, circle').first();
        await dot.scrollIntoViewIfNeeded(); const r = await dot.boundingBox();
        if (mobile) await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); else await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
        const [tip, box] = await page.evaluate(() => [document.querySelector('.historical-chart-tooltip.is-visible')?.getBoundingClientRect().toJSON(), document.querySelector('.historical-chart-card .svgbox').getBoundingClientRect().toJSON()]);
        assert.ok(tip, 'tooltip visible');
        assert.ok(tip.left >= box.left - 1 && tip.right <= box.right + 1 && tip.right <= width, JSON.stringify({tip, box}));
        assert.match(await page.locator('.historical-chart-tooltip').evaluate(n => n.textContent), /Área[\s\S]*Toneladas[\s\S]*TCH[\s\S]*KATM[\s\S]*Edad/);
      });
      await check(W + ' Exportar: menú con PDF e imagen PNG originales' + (width === 1280 ? ' (descarga PDF y PNG)' : ' (descarga PNG)'), async () => {
        const trigger = page.locator('#fichaContent .context-report-trigger');
        await trigger.click(); const menu = page.locator('#fichaContent .context-report-menu'); await menu.waitFor({state: 'visible'});
        const [png] = await Promise.all([page.waitForEvent('download', {timeout: 90000}), menu.locator('.image').click()]);
        assert.match(png.suggestedFilename(), /\.png$/i);
        await page.waitForFunction(() => !document.body.classList.contains('print-export'), null, {timeout: 60000});
        if (width === 1280) {
          await trigger.click(); await menu.waitFor({state: 'visible'});
          const [pdf] = await Promise.all([page.waitForEvent('download', {timeout: 120000}), menu.locator('.pdf').click()]);
          assert.equal(fs.readFileSync(await pdf.path()).subarray(0, 4).toString(), '%PDF');
          await page.waitForFunction(() => !document.body.classList.contains('print-export'), null, {timeout: 60000});
        }
      });
      await check(W + ' Mapa GIS de la finca desde el hero', async () => {
        await page.locator('#fichaContent .ux13-band-map').click();
        await page.waitForSelector('#casurGeoLayer:not([hidden])', {timeout: 20000});
        await page.waitForSelector('#casurGeoLayer .leaflet-container, #casurGeoLayer .leaflet-pane', {timeout: 20000});
        await page.keyboard.press('Escape');
        const close = page.locator('#casurGeoLayer button[aria-label*="Cerrar" i], #casurGeoLayer button:has-text("Cerrar")').first();
        if (await page.locator('#casurGeoLayer:not([hidden])').count() && await close.count()) await close.click();
        await page.waitForSelector('#casurGeoLayer', {state: 'hidden', timeout: 10000});
      });
      await check(W + ' Retorno: zafra → suerte → volver a la finca con presentación aplicada', async () => {
        await hist(page, '993');
        await page.evaluate(() => openHistoricalSeason(2526));
        await page.waitForSelector('.historical-lot-open', {state: 'attached'});
        await page.locator('.historical-lot-open').first().evaluate(b => b.click());
        await page.waitForFunction(() => currentEntity?.entityType === 'lote');
        assert.ok(await page.locator('.ux13-period select').count());
        await page.evaluate(() => backToHistoricalFarm());
        await page.waitForFunction(() => String(currentEntity?.code) === '993');
        assert.ok(await page.locator('.ux13-kpis').count() && await page.locator('.ux13-compare').count());
        await page.evaluate(() => closeHistoricalDrilldown?.());
      });
      await check(W + ' Buscador del Histórico: sugerencias abiertas al escribir justo tras abrir una finca', async () => {
        await page.locator('#q').fill('Pansaco');
        await page.locator('#searchSuggestions button').first().click();
        await page.locator('#q').fill('El Salitre');
        await page.waitForTimeout(450); // > 180 ms blur delay
        const hit = page.locator('#searchSuggestions button').first();
        assert.ok(await hit.isVisible(), 'sugerencias cerradas');
        await hit.click(); await page.waitForFunction(() => String(currentEntity?.code) === '10');
      });
      await check(W + ' Suerte (Histórico): misma presentación y sin scroll horizontal', async () => {
        await hist(page, 'LOTE::99301');
        assert.ok(await page.locator('.ux13-period select').isVisible());
        assert.ok(await page.locator('.ux13-kpis [data-ux13-kpi=tch]').isVisible());
        await noHScroll('suerte histórico');
      });
      // ---------- Ficha de suerte (Cronológico) ----------
      const lot = async () => { await page.evaluate(() => { CASUR_MAESTRO_UX.activate('cronologico'); selectCronoSuerteSuggestion('993', '01'); }); await page.waitForSelector('.ux13-lot-history svg'); };
      await lot();
      const truth = await page.evaluate(() => JSON.parse(document.querySelector('.ux13-lot-history').dataset.model));
      await check(W + ' Suerte: sin «Ampliar», sin tooltip flotante ni textos de auditoría', async () => {
        const t = await page.locator('.ux13-lot-history').innerText();
        assert.equal(await page.locator('.ux13-lot-history button', {hasText: /^Ampliar$/}).count(), 0);
        for (const gone of ['Cobertura KATM', 'Los valores ausentes', 'zafras del período con', 'Tocá una zafra']) assert.ok(!t.includes(gone), gone);
        assert.equal(await page.locator('#maestroAnalyticTip').count(), 0);
        assert.ok(await page.locator('.maestro-lot-map').count(), 'panel GIS de la suerte conservado');
        assert.ok(await page.locator('button', {hasText: 'Ampliar mapa'}).count(), 'Ampliar mapa (GIS) conservado');
      });
      await check(W + ' Suerte: detalle de zafra con Área, TCH, KATM, Toneladas y Edad = motor (TCH y KATM)', async () => {
        for (const metric of ['TCH', 'KATM']) {
          await page.locator('.ux13-metric button', {hasText: new RegExp('^' + metric + '$')}).click();
          const point = page.locator('.ux13-point[data-season="2324"] circle').last();
          await point.scrollIntoViewIfNeeded(); const box = await point.boundingBox();
          if (mobile) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2); else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          const facts = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.ux13-season-facts > div')].map(d => [d.dataset.fact, d.querySelector('dd').textContent])));
          const p = truth.points.find(p => p.zafra === 2324);
          const f = v => Number(v).toLocaleString('es-NI', {minimumFractionDigits: 2, maximumFractionDigits: 2});
          assert.deepEqual(facts, {area: f(p.area), tch: f(p.tch), katm: f(p.katm), ton: f(p.ton), edad: f(p.edad)});
          assert.equal(await page.locator('.ux13-season-facts .is-metric').getAttribute('data-fact'), metric.toLowerCase());
          assert.match(await page.locator('.ux13-season-detail h4').innerText(), /Zafra 23\/24/);
          const [d, vw] = await page.evaluate(() => [document.querySelector('.ux13-season-detail').getBoundingClientRect().right, innerWidth]);
          assert.ok(d <= vw, 'detalle dentro del ancho');
        }
      });
      await check(W + ' Suerte: teclado (flechas) y período Todas con >5 zafras', async () => {
        await page.locator('.ux13-point[data-season="2324"]').focus();
        await page.keyboard.press('ArrowRight');
        assert.match(await page.locator('.ux13-season-detail h4').innerText(), /24\/25/);
        assert.equal(await page.evaluate(() => document.activeElement.dataset.season), '2425');
        await page.locator('.ux13-lot-history select').selectOption('all');
        assert.equal(await page.locator('.ux13-point').count(), truth.points.length);
        await page.keyboard.press('End');
        await noHScroll('suerte todas');
      });
      await check(W + ' Suerte: Tabla histórica con todas las zafras y columnas', async () => {
        await page.locator('.ux13-table-action').click();
        const dialog = page.locator('dialog.context-drawer');
        assert.deepEqual(await dialog.locator('thead th').allInnerTexts(), ['Zafra', 'TCH', 'KATM', 'Área ha', 'Toneladas', 'Edad']);
        assert.equal(await dialog.locator('tbody tr').count(), truth.points.length);
        await dialog.locator('button', {hasText: 'Cerrar'}).click();
      });
      await check(W + ' Suerte: KATM ausente se muestra «—», sin interpolar y distinto de cero (clon en memoria)', async () => {
        await page.evaluate(() => { const orig = window.lotByCode; window.__ux13OrigLot = orig; window.lotByCode = code => { const lot = orig(code); if (String(code) !== '99301' || !Array.isArray(lot)) return lot; const copy = structuredClone(lot); copy[11] = copy[11].map(s => s[0] === 2324 ? [s[0], s[1], s[2], s[3], null, s[5], s[6]] : s); return copy; }; });
        await page.evaluate(() => renderCronoHome()); await lot();
        await page.locator('.ux13-metric button', {hasText: /^KATM$/}).click();
        const pt = page.locator('.ux13-point[data-season="2324"]');
        assert.match(await pt.evaluate(n => n.textContent), /—/);
        await pt.evaluate(n => n.dispatchEvent(new MouseEvent('click', {bubbles: true})));
        const dd = page.locator('.ux13-season-facts [data-fact=katm] dd');
        assert.equal(await dd.innerText(), '—'); assert.equal(await dd.getAttribute('aria-label'), 'sin dato');
        assert.notEqual(await page.locator('.ux13-season-facts [data-fact=tch] dd').innerText(), '—');
        assert.match(await page.locator('.ux13-history-note').innerText(), /Sin KATM en 23\/24; la línea no se interpola/);
        await page.evaluate(() => { window.lotByCode = window.__ux13OrigLot; });
      });
      await check(W + ' Etapa A intacta: finca Cronológico con pestañas y buscador arriba', async () => {
        await page.evaluate(() => { CASUR_MAESTRO_UX.activate('cronologico'); renderCronoProducer('993'); });
        await page.waitForSelector('#cronoContent .context-explorer[data-context="farm-993"] .ux05-primary');
        assert.deepEqual((await page.locator('#cronoContent .ux05-primary button').allInnerTexts()).map(s => s.trim()), ['Distribución', 'Estimados Z26/27', 'Suertes']);
      });
      await check(W + ' Sin errores de página', async () => assert.deepEqual(page.errors, []));
      if (out && [390, 1280].includes(width)) { await hist(page, '993'); await page.screenshot({path: path.join(out, `qa-${width}-hist-finca.png`), fullPage: true}); }
      await ctx.close();
    }
  } finally { await browser.close(); }
  for (const r of results) console.log(r.join(' · '));
  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} PASS`);
  if (out) fs.writeFileSync(path.join(out, 'qa-ux13-b.json'), JSON.stringify(results, null, 1));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
