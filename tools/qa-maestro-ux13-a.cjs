// UX13 · Etapa A — QA funcional y de maquetación del Cronológico General/Finca.
// Uso: node tools/serve-maestro-preview.mjs --port 4580  &&  node tools/qa-maestro-ux13-a.cjs http://127.0.0.1:4580/Negocios_de_Cana_CASUR_APP/ [EVIDENCIA_DIR]
// Solo lectura: no escribe datos, almacenamiento oficial ni configuración.
const {chromium} = require('playwright'), assert = require('assert/strict'), fs = require('fs'), path = require('path');
const base = process.argv[2] || 'http://127.0.0.1:4580/Negocios_de_Cana_CASUR_APP/', out = process.argv[3];
if (out) fs.mkdirSync(out, {recursive: true});
const FARM = '993', STAGES = ['Plantilla', '2.º corte', 'Cortes 3–4', 'Cortes 5–6', 'Cortes 7+'];
const num = s => Number(String(s).replace(/[^\d.-]/g, ''));
const results = [];
const check = (name, fn) => fn().then(() => results.push(['PASS', name]), e => { results.push(['FAIL', name, e.message]); });
(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [360, 390, 768, 1280, 1536]) {
      const mobile = width < 700;
      const ctx = await browser.newContext({viewport: {width, height: mobile ? 800 : 900}, isMobile: mobile, hasTouch: mobile, acceptDownloads: true});
      const page = await ctx.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(base + 'modules/produccion/');
      await page.waitForFunction(() => window.CASUR_PRODUCTION_READY && window.CASUR_MAESTRO_UX, null, {timeout: 60000});
      const noHScroll = async label => { const [sw, iw] = await page.evaluate(() => [document.scrollingElement.scrollWidth, innerWidth]); assert.ok(sw <= iw + 1, `${label}: scroll horizontal ${sw}>${iw}`); };
      const searchFirst = async label => {
        const [q, c] = await page.evaluate(() => [document.querySelector('#cronoSection .maestro-query').getBoundingClientRect().top, document.querySelector('#cronoContent').getBoundingClientRect().top]);
        assert.ok(q < c, `${label}: buscador (${q}) debajo del análisis (${c})`);
        assert.ok(await page.locator('#cronoQ').isVisible(), `${label}: #cronoQ visible`);
        assert.equal(await page.locator('#cronoProducerSelect').isVisible(), false, `${label}: SELECT duplicado visible`);
      };
      const W = `[${width}]`;
      // ---------- General ----------
      await page.evaluate(() => { CASUR_MAESTRO_UX.activate('cronologico'); renderCronoHome(); });
      await page.waitForSelector('#cronoContent .context-explorer[data-context="general"]');
      await check(W + ' General: pestañas Distribución/Estimados/Consultar fincas', async () => {
        const tabs = await page.locator('#cronoContent .context-explorer[data-context="general"] .ux05-primary button').allInnerTexts();
        assert.deepEqual(tabs.map(t => t.trim()), ['Distribución', 'Estimados Z26/27', 'Consultar fincas']);
      });
      await check(W + ' General: buscador arriba y sin scroll horizontal', async () => { await searchFirst('general'); await noHScroll('general'); });
      await check(W + ' General: N.º de cortes en orden agronómico (área y estimados)', async () => {
        for (const tab of ['Distribución', 'Estimados Z26/27']) {
          await page.locator('#cronoContent .ux05-primary button', {hasText: tab}).click();
          await page.evaluate(() => { const s = document.querySelector('#cronoContent .ux05-dimension-select'); s.value = 'stage'; s.dispatchEvent(new Event('change')); });
          const keys = await page.locator('#cronoContent .ux05-table tbody .ux05-key > span').allInnerTexts();
          assert.deepEqual(keys.filter(k => STAGES.includes(k)), STAGES.filter(k => keys.includes(k)), tab + ': ' + keys.join(','));
          assert.equal(keys[0], 'Plantilla');
        }
      });
      await check(W + ' General: TOTAL de estimados = motor oficial', async () => {
        const s = await page.evaluate(() => CASUR_CRONO_PARTICIPATION.summary(CRONO_DATA.producers.flatMap(p => p.details)));
        const foot = await page.locator('#cronoContent .ux05-table tfoot .ux05-value').innerText();
        assert.equal(num(foot), s.estimateTch);
        const text = await page.locator('#cronoContent .ux09-forecast-overview').innerText();
        assert.ok(text.includes(s.estimateTons.toLocaleString('es-NI', {minimumFractionDigits: 2})), 'toneladas');
        for (const banned of ['toneladas autorizadas', 'TCH ponderado', 'cobertura del aforo', 'ha válidas']) assert.ok(!(await page.locator('#cronoContent .context-explorer').innerText()).includes(banned), banned);
      });
      // ---------- Finca ----------
      await page.evaluate(code => renderCronoProducer(code), FARM);
      await page.waitForSelector('#cronoContent .context-explorer[data-context="farm-993"]');
      const ex = '#cronoContent .context-explorer[data-context="farm-993"]';
      const truth = await page.evaluate(() => { const p = CRONO_DATA.producers.find(p => String(p.code) === '993'); const E = CASUR_CRONO_PARTICIPATION; return {s: E.summary(p.details), dest: E.agronomicGroups(p.details, 'destino'), stage: E.agronomicGroups(p.details, 'stage'), area: p.details.reduce((n, r) => n + CASUR_OPERATIONAL_IMPORT.participation(r).activeArea, 0)}; });
      await check(W + ' Finca: mismas pestañas que General y sin barra de 6 botones', async () => {
        const tabs = await page.locator(ex + ' .ux05-primary button').allInnerTexts();
        assert.deepEqual(tabs.map(t => t.trim()), ['Distribución', 'Estimados Z26/27', 'Suertes']);
        assert.equal(await page.locator('.ux09-farm-actions').count(), 0);
        const text = await page.locator('#cronoContent').innerText();
        for (const banned of ['Deslizá para ver más', 'Detalle complementario', 'Composición y metodología', 'Seleccioná una categoría', 'Área válida de molienda', 'toneladas autorizadas', 'cobertura del aforo']) assert.ok(!text.includes(banned), banned);
      });
      await check(W + ' Finca: buscador arriba, migas visibles, sin scroll horizontal', async () => { await searchFirst('finca'); await noHScroll('finca'); });
      await check(W + ' Finca: composición Molienda/Semilla = motor', async () => {
        const t = await page.locator('.ux13-composition').innerText();
        assert.ok(t.includes(truth.s.millingArea.toFixed(2)) && t.includes(truth.s.millingLots + ' suertes'), t);
        assert.ok(t.includes(truth.s.seedArea.toFixed(2)) && t.includes(truth.s.seedLots + ' suertes'), t);
      });
      const farmView = async (objective, dim) => page.evaluate(([ex, objective, dim]) => { const b = document.querySelector(ex); b.setObjective(objective); if (dim) { const s = b.querySelector('.ux05-dimension-select'); s.value = dim; s.dispatchEvent(new Event('change')); } }, [ex, objective, dim]);
      await check(W + ' Finca: Distribución por cada variable suma el área activa (TOTAL)', async () => {
        const dims = await page.evaluate(ex => [...document.querySelector(ex + ' .ux05-dimension-select').options].map(o => o.value), ex);
        assert.ok(dims.includes('destino') && dims.includes('stage'));
        for (const dim of dims) {
          await farmView('area', dim);
          const vals = (await page.locator(ex + ' .ux05-table tbody .ux05-value').allInnerTexts()).map(num);
          const total = num(await page.locator(ex + ' .ux05-table tfoot td').first().innerText());
          assert.ok(Math.abs(vals.reduce((a, b) => a + b, 0) - total) < 0.02, dim + ' suma');
          assert.ok(Math.abs(total - truth.area) < 0.02, dim + ' total ' + total + ' vs ' + truth.area);
        }
      });
      await check(W + ' Finca: Distribución → Destino incluye Molienda y Semilla con suertes', async () => {
        await farmView('area', 'destino');
        const rows = await page.locator(ex + ' .ux05-table tbody tr').allInnerTexts();
        for (const g of truth.dest) assert.ok(rows.some(r => r.includes(g.key) && r.includes(g.area.toLocaleString('es-NI', {minimumFractionDigits: 2})) && r.includes(g.lots + (g.lots === 1 ? ' suerte' : ' suertes'))), g.key);
      });
      await check(W + ' Finca: Estimados → Destino, Semilla «No aplica» y Molienda = motor', async () => {
        await farmView('estimate', 'destino');
        for (const g of truth.dest) {
          const row = page.locator(ex + ' .ux05-table tbody tr', {has: page.locator('.ux05-key > span', {hasText: new RegExp('^' + g.key + '$')})});
          const value = (await row.locator('.ux05-value').innerText()).trim();
          if (g.millingArea === 0) { assert.equal(value, 'No aplica', g.key); assert.equal(await row.getAttribute('data-status'), 'na'); assert.ok((await row.innerText()).includes(g.lots + ' suerte'), 'suertes de semilla'); }
          else { assert.equal(num(value), g.estimateTch, g.key); if (width >= 768) assert.equal(num(await row.locator('td').nth(2).innerText()), g.estimateTons); }
        }
        assert.ok(!(await page.locator(ex).innerText()).match(/\bN\/D\b/), 'sin N/D');
      });
      await check(W + ' Finca: N.º de cortes en orden agronómico en Distribución y Estimados', async () => {
        for (const objective of ['area', 'estimate']) {
          await farmView(objective, 'stage');
          const keys = await page.locator(ex + ' .ux05-table tbody .ux05-key > span').allInnerTexts();
          assert.deepEqual(keys, STAGES.filter(k => truth.stage.some(g => g.key === k)).concat(keys.filter(k => !STAGES.includes(k))), objective + ': ' + keys);
        }
      });
      await check(W + ' Finca: fila abre sus suertes y Volver regresa a la misma vista', async () => {
        await farmView('estimate', 'stage');
        await page.locator(ex + ' .ux05-table tbody tr').first().click();
        const st = JSON.parse(await page.locator(ex).getAttribute('data-state'));
        assert.equal(st.objective, 'directory'); assert.deepEqual(st.scope, [{field: 'stage', key: 'Plantilla'}]);
        assert.ok(await page.locator(ex + ' .context-crumbs').isVisible());
        const lots = await page.locator(ex + ' .context-directory .context-results > button').count();
        assert.equal(lots, Math.min(8, truth.stage.find(g => g.key === 'Plantilla').lots));
        await page.locator(ex + ' .context-crumbs button', {hasText: 'Volver'}).click();
        const back = JSON.parse(await page.locator(ex).getAttribute('data-state'));
        assert.equal(back.objective, 'estimate'); assert.equal(back.dimension, 'stage'); assert.deepEqual(back.scope, []);
      });
      await check(W + ' Finca: Exportar único con PDF e imagen PNG existentes', async () => {
        // The original exporter injects its actions asynchronously after the report renders.
        await page.waitForSelector('#cronoContent .ficha-band .context-report-trigger', {timeout: 30000});
        const triggers = page.locator('#cronoContent .ficha-band .context-report-trigger');
        assert.equal(await triggers.count(), 1);
        assert.equal(await triggers.getAttribute('aria-label'), 'Exportar · PDF o imagen PNG');
        await triggers.click();
        const menu = page.locator('#cronoContent .context-report-menu');
        await menu.waitFor({state: 'visible'});
        assert.ok(await menu.locator('.pdf').isVisible() && await menu.locator('.image').isVisible());
        const [download] = await Promise.all([page.waitForEvent('download', {timeout: 60000}), menu.locator('.image').click()]);
        assert.match(download.suggestedFilename(), /\.png$/i);
        await page.waitForTimeout(500);
        if (width === 1280) {
          await triggers.click(); await menu.waitFor({state: 'visible'});
          const [pdf] = await Promise.all([page.waitForEvent('download', {timeout: 120000}), menu.locator('.pdf').click()]);
          assert.match(pdf.suggestedFilename(), /\.pdf$/i);
          const file = await pdf.path(); assert.equal(fs.readFileSync(file).subarray(0, 4).toString(), '%PDF');
          await page.waitForFunction(() => !document.body.classList.contains('print-export'), null, {timeout: 60000});
        }
      });
      await check(W + ' Finca: Mapa compacto muestra geometrías oficiales y vuelve', async () => {
        await farmView('area', 'stage');
        const map = page.locator('#cronoContent .ux13-band-action', {hasText: 'Mapa'});
        await map.click();
        assert.equal(await map.getAttribute('aria-pressed'), 'true');
        await page.waitForSelector('#maestroFarmMap.leaflet-container, #maestroFarmMap .leaflet-pane', {timeout: 20000});
        assert.equal(await page.locator('.maestro-farm-map').evaluate(n => n.classList.contains('maestro-panel-inactive')), false);
        await map.click();
        assert.equal(JSON.parse(await page.locator(ex).getAttribute('data-state')).objective, 'area');
      });
      await check(W + ' Finca: pestaña Suertes con buscador y tabla técnica', async () => {
        await page.locator(ex + ' .ux05-primary button', {hasText: 'Suertes'}).click();
        await page.locator(ex + ' .context-directory input').fill('99301');
        assert.ok((await page.locator(ex + ' .context-directory .context-results').innerText()).includes('Suerte 99301'));
        assert.ok(await page.locator(ex + ' button', {hasText: 'Tabla técnica'}).isVisible());
      });
      await check(W + ' Selección múltiple conserva el control interno', async () => {
        assert.equal(await page.locator('#cronoProducerSelect').inputValue(), FARM);
        await page.locator('.context-search-options > summary').click();
        assert.ok(await page.locator('#cronoMultiToggle').isVisible());
        assert.equal(await page.locator('#cronoProducerSelect').isVisible(), false);
        await page.locator('.context-search-options > summary').click();
      });
      if (out && width === 390) await page.screenshot({path: path.join(out, 'qa-390-finca-final.png'), fullPage: true});
      // ---------- Búsqueda ----------
      await check(W + ' Buscador: código, nombre, sugerencias, limpiar y suerte', async () => {
        await page.evaluate(() => renderCronoHome());
        await page.locator('#cronoQ').fill('Pansaco');
        await page.waitForSelector('#cronoSuggestions button', {state: 'visible'});
        await page.locator('#cronoSuggestions button').first().click();
        await page.waitForSelector(ex);
        await searchFirst('tras búsqueda por nombre');
        // UX13 P1: type IMMEDIATELY after the farm opens (no wait for the report, no sleeps).
        await page.locator('.ux04-clear-search').click();
        assert.equal(await page.locator('#cronoQ').inputValue(), '');
        await page.locator('#cronoQ').fill('99301');
        const lot = page.locator('#cronoSuggestions button', {hasText: '99301'}).first();
        await lot.waitFor({state: 'visible', timeout: 2000});
        await lot.click();
        await page.waitForFunction(() => document.querySelector('#cronoContent').dataset.geoScope === 'lot');
        await searchFirst('suerte'); await noHScroll('suerte');
        await page.locator('#maestroBackFarm').click();
        await page.waitForSelector(ex);
        await searchFirst('volver a finca');
        // P1: also immediately after returning from the lot, then pick a farm suggestion.
        await page.locator('#cronoQ').fill('Pansaco');
        const farmHit = page.locator('#cronoSuggestions button').first();
        await farmHit.waitFor({state: 'visible', timeout: 2000});
        await farmHit.click(); await page.waitForSelector(ex);
        await page.reload(); await page.waitForFunction(() => window.CASUR_PRODUCTION_READY && window.CASUR_MAESTRO_UX, null, {timeout: 60000});
        await page.evaluate(() => { CASUR_MAESTRO_UX.activate('cronologico'); renderCronoProducer('993'); });
        await page.waitForSelector(ex); await searchFirst('recarga');
      });
      await check(W + ' P1: sugerencias abiertas al escribir inmediatamente tras abrir finca (5 repeticiones)', async () => {
        for (let i = 0; i < 5; i++) {
          await page.evaluate(() => renderCronoHome());
          await page.locator('#cronoQ').fill('Pansaco');
          await page.locator('#cronoSuggestions button').first().click();
          await page.locator('#cronoQ').fill('9930');
          await page.waitForTimeout(450); // longer than the 180 ms blur delay: the list must stay open
          assert.ok(await page.locator('#cronoSuggestions button').first().isVisible(), 'iteración ' + i);
        }
        await page.locator('#cronoQ').press('Escape');
        await page.locator('#cronoQ').fill('99302');
        await page.locator('#cronoSuggestions button', {hasText: '99302'}).first().click();
        await page.waitForFunction(() => document.querySelector('#cronoContent').dataset.geoScope === 'lot');
      });
      await check(W + ' P2: banda sin metadatos huérfanos ni solapes; composición y nota de semilla', async () => {
        await page.evaluate(() => { CASUR_MAESTRO_UX.activate('cronologico'); renderCronoProducer('993'); });
        await page.waitForSelector('#cronoContent .ficha-band .context-report-trigger', {timeout: 30000});
        const band = await page.evaluate(() => { const b = document.querySelector('#cronoContent .ficha-band'), r = n => n.getBoundingClientRect(), sm = b.querySelector('small'), act = b.querySelector('.ficha-actions'), h = b.querySelector('h2'); const lines = Math.round(r(sm).height / parseFloat(getComputedStyle(sm).lineHeight || 14)); const overlap = (x, y) => !(x.right <= y.left || y.right <= x.left || x.bottom <= y.top || y.bottom <= x.top); return {lines, text: sm.textContent, overlapSmall: overlap(r(sm), r(act)), overlapTitle: overlap(r(h), r(act)), inside: r(act).right <= r(b).right + 1}; });
        assert.ok(band.lines <= 1, 'metadatos en ' + band.lines + ' líneas: ' + band.text);
        assert.ok(!band.overlapSmall && !band.overlapTitle && band.inside, JSON.stringify(band));
        assert.match(band.text, /Código 993/); assert.match(band.text, /CV/);
        const comp = await page.locator('.ux13-composition').innerText();
        assert.doesNotMatch(comp, /Distancia|sin área activa/);
        const more = page.locator('.ux13-farm-more'); assert.equal(await more.locator('summary').innerText(), 'Otros datos de finca');
        assert.match(await more.evaluate(n => n.textContent), /Distancia ponderada: .* km/);
        const fx = '#cronoContent .context-explorer[data-context="farm-993"]';
        const view = dim => page.evaluate(([fx, dim]) => { const b = document.querySelector(fx); b.setObjective('estimate'); const s = b.querySelector('.ux05-dimension-select'); s.value = dim; s.dispatchEvent(new Event('change')); }, [fx, dim]);
        await view('destino'); assert.equal(await page.locator(fx + ' .ux13-overview-notes').count(), 0, 'nota repetida en Destino');
        await view('stage'); assert.match(await page.locator(fx + ' .ux13-overview-notes').innerText(), /Semilla: .* no aplica/);
      });
      await check(W + ' Histórico desde la finca', async () => {
        await page.locator('#cronoContent .ux13-band-action', {hasText: 'Histórico'}).click();
        await page.waitForFunction(() => document.body.dataset.maestroView === 'historico');
      });
      await check(W + ' Captura 4 del Issue (finca 10 · El Salitre): Semilla AS con área/suertes y «No aplica»', async () => {
        await page.evaluate(() => { CASUR_MAESTRO_UX.activate('cronologico'); renderCronoProducer('10'); });
        const fx = '#cronoContent .context-explorer[data-context="farm-10"]';
        await page.waitForSelector(fx);
        await page.evaluate(fx => { const b = document.querySelector(fx); b.setObjective('estimate'); const s = b.querySelector('.ux05-dimension-select'); s.value = 'destino'; s.dispatchEvent(new Event('change')); }, fx);
        const text = await page.locator(fx + ' .ux05-table').innerText();
        const truth = await page.evaluate(() => CASUR_CRONO_PARTICIPATION.summary(CRONO_DATA.producers.find(p => String(p.code) === '10').details));
        assert.ok(text.includes(truth.seedArea.toFixed(2) + ' ha activas · ' + truth.seedLots + ' suertes'), text);
        assert.match(text, /No aplica/); assert.doesNotMatch(text, /N\/D/);
        assert.ok(text.includes(String(truth.estimateTch)), 'TCH molienda');
      });
      await check(W + ' Sin errores de página', async () => assert.deepEqual(errors, []));
      await ctx.close();
    }
  } finally { await browser.close(); }
  for (const r of results) console.log(r.join(' · '));
  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} PASS`);
  if (out) fs.writeFileSync(path.join(out, 'qa-ux13-a.json'), JSON.stringify(results, null, 1));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
