// UX13 · Etapa C — QA de pulido (Histórico de finca, Cronológico de finca, Zona) + paridad con la Etapa B.
// Uso: node tools/qa-maestro-ux13-c.cjs AFTER_BASE [EVIDENCIA_DIR] [BEFORE_BASE]
// Solo lectura. Los casos sin ejemplo real («sin dato») se simulan en memoria y se restauran.
const {chromium} = require('playwright'), assert = require('assert/strict'), fs = require('fs'), path = require('path');
const [base, out, before] = process.argv.slice(2);
if (!base) throw Error('Usage: node tools/qa-maestro-ux13-c.cjs AFTER_BASE [OUT] [BEFORE_BASE]');
if (out) fs.mkdirSync(out, {recursive: true});
const results = [];
const check = (name, fn) => fn().then(() => results.push(['PASS', name]), e => results.push(['FAIL', name, e.message.split('\n').slice(0, 12).join(' ')]));
const num = s => Number(String(s).replace(/[^\d.-]/g, ''));
async function open(browser, url, width) {
  const mobile = width < 700;
  const ctx = await browser.newContext({viewport: {width, height: mobile ? 800 : 900}, isMobile: mobile, hasTouch: mobile});
  const page = await ctx.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  await page.goto(url + 'modules/produccion/');
  await page.waitForFunction(() => window.CASUR_PRODUCTION_READY && window.CASUR_MAESTRO_UX, null, {timeout: 60000});
  return {ctx, page};
}
const hist = (page, code, mode = 'latest') => page.evaluate(([c, m]) => { CASUR_MAESTRO_UX.activate('historico'); renderEntity(c); setHistoricalPeriodMode(m); }, [code, mode]).then(() => page.waitForSelector('#printPanel .historical-agronomic-kpis'));
// UX14-B: the UX13 zone KPI row was superseded by the UX14 zone panel (same facts, Riego/Secano composition and
// strip). The Z9 checks below keep their intent and now assert it on that panel (.ux14-zone, Cronológico tab).
const UX14C = '.ux14-zone:not(.ux14-hist-zone)';
const zone = (page, z) => page.evaluate(z => { CASUR_MAESTRO_UX.activate('zonas'); document.querySelector('#zoneMainSection .ux09-section-tabs button[data-target="cronoZoneSection"]')?.click(); document.querySelector('#cronoZoneSelect').value = z; selectCronoZone(z); }, z)
  .then(() => page.waitForFunction(z => document.querySelector('.ux14-zone:not(.ux14-hist-zone)')?.dataset.zone === z, z)).then(() => page.waitForSelector(UX14C + ' .ux14-kpi'));
const farm = async (page, code, objective, dim) => {
  await page.evaluate(c => { CASUR_MAESTRO_UX.activate('cronologico'); renderCronoProducer(c); }, code);
  const ex = `#cronoContent .context-explorer[data-context="farm-${code}"]`; await page.waitForSelector(ex);
  await page.evaluate(([ex, o, d]) => { const b = document.querySelector(ex); b.setObjective(o); if (d) { const s = b.querySelector('.ux05-dimension-select'); s.value = d; s.dispatchEvent(new Event('change')); } }, [ex, objective, dim]);
  return ex;
};
(async () => {
  const browser = await chromium.launch();
  try {
    // ---------- Paridad B → C: mismos números en Histórico (nodos originales), Cronológico (motor) y Zona ----------
    if (before) {
      const B = await open(browser, before, 390), C = await open(browser, base, 390);
      const histFig = p => p.evaluate(() => { const P = document.querySelector('#printPanel'), t = n => (n?.textContent || '').replace(/\s+/g, ' ').trim(); return {kpis: [...P.querySelectorAll('.historical-agronomic-kpis > .kpi')].map(k => t(k.querySelector('.label')) + '=' + t(k.querySelector('strong:not(.ux13-kpi-value)')) + '|' + t(k.querySelector('em'))), deltas: [...P.querySelectorAll('.delta-grid .delta strong')].map(t), rows: [...P.querySelectorAll('.table-wrap tbody tr')].map(r => [...r.cells].slice(0, 6).map(t).join('|'))}; });
      for (const code of ['10', '993', 'LOTE::99301']) for (const mode of ['latest', 'last3', 'all']) await check(`Paridad Histórico ${code} · ${mode}`, async () => {
        const get = async p => { await hist(p, code, mode); await p.waitForTimeout(200); return histFig(p); };
        assert.deepEqual(await get(C.page), await get(B.page));
      });
      for (const code of ['993', '10', '908']) await check(`Paridad Cronológico ${code}: grupos y resumen del motor por variable`, async () => {
        const get = p => p.evaluate(c => { const E = CASUR_CRONO_PARTICIPATION, d = CRONO_DATA.producers.find(p => String(p.code) === c).details; return JSON.stringify([E.summary(d), ...['tipoRiego', 'textura', 'stage', 'variedad', 'destino'].map(k => E.agronomicGroups(d, k))]); }, code);
        assert.equal(await get(C.page), await get(B.page));
      });
      for (const z of ['', '5-Productores', '1-Sur']) await check(`Paridad Zona ${z || 'general'}: todas las cifras KPI y barras idénticas`, async () => {
        const get = async p => { await zone(p, z); return p.evaluate(() => ({kpis: [...document.querySelectorAll('#cronoZoneContent .kpis .kpi')].map(k => k.querySelector('.label').textContent + '=' + k.querySelector('strong').textContent + '|' + (k.querySelector('em')?.textContent || '')), bars: document.querySelector('#cronoZoneContent .crono-zone-grid').textContent.replace(/\s+/g, ' ')})); };
        assert.deepEqual(await get(C.page), await get(B.page));
      });
      await B.ctx.close(); await C.ctx.close();
    }
    for (const width of [360, 390, 768, 1280, 1536]) {
      const W = `[${width}]`, {ctx, page} = await open(browser, base, width), mobile = width < 768;
      const noHScroll = async label => { const [sw, iw] = await page.evaluate(() => [document.scrollingElement.scrollWidth, innerWidth]); assert.ok(sw <= iw + 1, `${label}: scroll horizontal ${sw}>${iw}`); };
      // ---------- Histórico de finca (10 · El Salitre) ----------
      await hist(page, '10', 'last3');
      await page.waitForSelector('#fichaContent .ficha-band .context-report-trigger', {timeout: 30000});
      await check(W + ' H1 Hero: solo Exportar discreto, sin Mapa, compacto', async () => {
        const band = await page.evaluate(() => { const b = document.querySelector('#fichaContent .ficha-band'), vis = n => n && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden'; return {h: b.getBoundingClientRect().height, buttons: [...b.querySelectorAll('button')].filter(vis).map(n => n.textContent.trim()), map: !!vis(b.querySelector('[data-casur-geo-action]'))}; });
        assert.deepEqual(band.buttons, ['Exportar']); assert.equal(band.map, false);
        assert.ok(band.h <= (mobile ? 130 : 90), 'banda ' + band.h);
        const t = await page.locator('#fichaContent .context-report-trigger').boundingBox(); assert.ok(t.height >= 44 && t.width <= 140, JSON.stringify(t));
      });
      await check(W + ' H1 Mapa: tarjeta compacta entre el gráfico y la tabla, abre el GIS original', async () => {
        const order = await page.evaluate(() => { const all = [...document.querySelectorAll('#printPanel *')], i = s => all.indexOf(document.querySelector('#printPanel ' + s)); return [i('.historical-chart-card'), i('.ux13-map-card'), i('.table-wrap')]; });
        assert.ok(order[0] >= 0 && order[0] < order[1] && order[1] < order[2], JSON.stringify(order));
        assert.equal(await page.locator('.ux13-map-card').count(), 1);
        const box = await page.locator('.ux13-map-card').boundingBox(); assert.ok(box.height >= 44 && box.height <= 64, 'alto ' + box.height);
        await page.locator('.ux13-map-card').click();
        await page.waitForSelector('#casurGeoLayer:not([hidden])', {timeout: 20000});
        await page.waitForSelector('#casurGeoLayer .leaflet-container, #casurGeoLayer .leaflet-pane', {timeout: 20000});
        await page.keyboard.press('Escape');
        const close = page.locator('#casurGeoLayer button[aria-label*="Cerrar" i], #casurGeoLayer button:has-text("Cerrar")').first();
        if (await page.locator('#casurGeoLayer:not([hidden])').count() && await close.count()) await close.click();
        await page.waitForSelector('#casurGeoLayer', {state: 'hidden', timeout: 10000});
      });
      await check(W + ' H2/H3 KPI: TCH, KATM, Área por zafra y Edad con alturas iguales; área por zafra = valor oficial', async () => {
        const k = await page.evaluate(() => [...document.querySelectorAll('.ux13-kpis > .kpi')].filter(n => n.getClientRects().length).map(n => ({kind: n.dataset.ux13Kpi, label: (n.querySelector('.ux13-kpi-label')?.firstChild || n.querySelector('.label')).textContent.trim(), value: (n.querySelector('.ux13-kpi-value') || n.querySelector('strong')).textContent.trim(), raw: n.querySelector('strong').textContent.trim(), h: Math.round(n.getBoundingClientRect().height), top: n.getBoundingClientRect().top, left: n.getBoundingClientRect().left})).sort((a, b) => Math.round(a.top) - Math.round(b.top) || a.left - b.left));
        assert.deepEqual(k.map(x => x.kind), ['tch', 'katm', 'area', 'edad'], 'solo 4 KPI visibles');
        assert.deepEqual(k.map(x => x.label.toLowerCase()), ['tch ponderado', 'katm ponderado', 'área por zafra', 'edad']);
        const area = k[2]; assert.match(area.raw, /ha\/zafra$/); assert.equal(area.value, area.raw.replace(/\s*ha\/zafra$/, ' ha'));
        assert.ok(Math.max(...k.map(x => x.h)) - Math.min(...k.map(x => x.h)) <= 1, 'alturas ' + k.map(x => x.h));
        const text = await page.locator('.ux13-kpis').innerText();
        for (const gone of ['Acumulado', 'PROMEDIO', 'Edad ponderada', 'EDAD PONDERADA', '¿Cómo se calculan?']) assert.ok(!text.includes(gone), gone);
      });
      await check(W + ' H2/H4 Ayuda discreta en Área: acumulado y definición a demanda, táctil 44 px', async () => {
        const i = page.locator('.ux13-kpis [data-ux13-kpi=area] .ux13-info'); const b = await i.boundingBox(); assert.ok(b.width >= 44 && b.height >= 44);
        assert.equal(await i.getAttribute('aria-label'), 'Detalle de área por zafra');
        await i.click(); await page.waitForSelector('.ux13-help:popover-open'); const pop = await page.locator('.ux13-help:popover-open').evaluate(n => n.textContent);
        assert.match(pop, /Promedio del área cosechada en cada zafra del período/); assert.match(pop, /Acumulado del periodo: [\d,.]+ ha-zafra/i);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#fichaContent .ux13-info').count(), 1, 'una sola «i»');
      });
      await check(W + ' H5 Otros indicadores: cerrado al inicio, conserva cálculos y estado al cambiar período', async () => {
        const more = page.locator('.ux13-more');
        assert.equal(await more.evaluate(d => d.open), false);
        assert.equal(await page.locator('.ux13-kpis [data-ux13-kpi=secondary]').first().isVisible(), false);
        await more.locator('summary').click();
        const sec = page.locator('.ux13-kpis [data-ux13-kpi=secondary]');
        assert.equal(await sec.count(), 4); assert.ok(await sec.first().isVisible());
        assert.match(await sec.filter({hasText: /Distancia/i}).locator('em').innerText(), /\S/);
        assert.match(await sec.filter({hasText: /Distancia/i}).innerText(), /actual/i); // self-explanatory: no extra «i»
        await page.evaluate(() => setHistoricalPeriodMode('last5'));
        await page.waitForFunction(() => HISTORICAL_PERIOD_STATE.periodMode === 'last5' && document.querySelector('.ux13-more'));
        assert.equal(await page.locator('.ux13-more').evaluate(d => d.open), true);
        await page.locator('.ux13-more summary').focus(); await page.keyboard.press('Enter');
        assert.equal(await page.locator('.ux13-more').evaluate(d => d.open), false, 'teclado');
        await page.evaluate(() => setHistoricalPeriodMode('last3'));
      });
      await check(W + ' H6 Gráfico sin párrafo explicativo; leyenda y referencia intactas', async () => {
        const head = await page.locator('.historical-chart-card').innerText();
        assert.ok(!head.includes('Serie completa'));
        assert.match(head, /ponderado del periodo/i); assert.ok(await page.locator('.historical-chart-legend').isVisible());
        assert.ok(!(await page.locator('#printPanel > .section-title:not(.ficha-screen-title)').innerText()).includes('Una fila por zafra'));
        await noHScroll('histórico');
      });
      await check(W + ' Comparar TCH sigue independiente (B)', async () => {
        assert.equal(await page.locator('.ux13-compare').evaluate(d => d.open), !mobile);
      });
      // ---------- Cronológico de finca ----------
      await check(W + ' C7 Riego y Tipo de suelo disponibles con una sola categoría (993)', async () => {
        const ex = await farm(page, '993', 'area', 'tipoRiego');
        const opts = await page.locator(ex + ' .ux05-dimension-select option').evaluateAll(o => o.map(o => [o.value, o.disabled]));
        for (const k of ['tipoRiego', 'textura', 'stage', 'variedad', 'destino']) assert.ok(opts.some(([v, d]) => v === k && !d), k);
        for (const dim of ['tipoRiego', 'textura']) {
          await farm(page, '993', 'area', dim);
          const total = num(await page.locator(ex + ' tfoot td').first().innerText()), pct = await page.locator(ex + ' tfoot td').nth(1).innerText();
          const area = await page.evaluate(() => CRONO_DATA.producers.find(p => String(p.code) === '993').details.reduce((n, r) => n + CASUR_OPERATIONAL_IMPORT.participation(r).activeArea, 0));
          assert.ok(Math.abs(total - area) < 0.02); assert.match(pct, /100\.00 %/);
          await farm(page, '993', 'estimate', dim);
          const g = await page.evaluate(([d]) => CASUR_CRONO_PARTICIPATION.agronomicGroups(CRONO_DATA.producers.find(p => String(p.code) === '993').details, d), [dim]);
          assert.equal(num(await page.locator(ex + ' tbody .ux05-value').first().innerText()), g[0].estimateTch);
        }
      });
      await check(W + ' C7 Variable sin dato aparece deshabilitada «sin dato» (simulación en memoria)', async () => {
        await page.evaluate(() => { const p = CRONO_DATA.producers.find(p => String(p.code) === '993'); window.__ux13Soil = p.details.map(r => r.textura); p.details.forEach(r => { r.textura = ''; }); });
        await page.evaluate(() => { renderCronoHome(); }); const ex = await farm(page, '993', 'area', 'tipoRiego');
        const opt = await page.locator(ex + ' .ux05-dimension-select option[value=textura]').evaluate(o => [o.disabled, o.textContent]);
        await page.evaluate(() => { const p = CRONO_DATA.producers.find(p => String(p.code) === '993'); p.details.forEach((r, i) => { r.textura = window.__ux13Soil[i]; }); renderCronoHome(); });
        assert.deepEqual(opt, [true, 'Tipo de suelo · sin dato']);
      });
      await check(W + ' C8 Estimados → Destino: Molienda sin cifras repetidas; Semilla «No aplica» con área y suertes', async () => {
        const ex = await farm(page, '993', 'estimate', 'destino');
        const mol = page.locator(ex + ' tbody tr', {has: page.locator('.ux05-key > span', {hasText: /^Molienda$/})});
        const t = await mol.innerText();
        assert.equal(t.split('359.30').length - 1, 1, 'área una sola vez: ' + t);
        assert.equal(t.split('17,452.08').length - 1, 1, 'toneladas una sola vez');
        assert.ok(!/ha activas|ha con estimado/.test(t), t);
        assert.match(t, /40 suertes/);
        const seed = await page.locator(ex + ' tbody tr[data-status=na]').innerText();
        assert.match(seed, /9\.14 ha activas · 2 suertes/); assert.match(seed, /No aplica/); assert.doesNotMatch(seed, /N\/D|0\.00/);
      });
      await check(W + ' C8 Cobertura parcial explícita: Plantilla con área con estimado distinta del área activa', async () => {
        const ex = await farm(page, '993', 'estimate', 'stage');
        const t = await page.locator(ex + ' tbody tr').first().innerText();
        assert.match(t, mobile ? /7\.10 de 16\.24 ha/ : /16\.24 ha activas/); assert.match(t, /incluye semilla 9\.14 ha/); assert.match(t, /75\.00/);
      });
      await check(W + ' C8 Finca con varios riegos (908): categorías y TCH = motor', async () => {
        const ex = await farm(page, '908', 'estimate', 'tipoRiego');
        const keys = await page.locator(ex + ' tbody .ux05-key > span').allInnerTexts();
        const g = await page.evaluate(() => CASUR_CRONO_PARTICIPATION.agronomicGroups(CRONO_DATA.producers.find(p => String(p.code) === '908').details, 'tipoRiego'));
        assert.deepEqual([...keys].sort(), g.map(x => x.key).sort());
        for (const x of g) assert.equal(num(await page.locator(ex + ' tbody tr', {has: page.locator('.ux05-key > span', {hasText: new RegExp('^' + x.key + '$')})}).locator('.ux05-value').innerText()), x.estimateTch);
        await noHScroll('crono 908');
      });
      // ---------- Zona ----------
      await check(W + ' Z9 Zona general: 4 KPI rectores primero, sin Suertes/Haciendas ni subtítulos ornamentales', async () => {
        await zone(page, '');
        const vis = await page.$$eval(UX14C + ' .ux14-kpi', ks => ks.filter(n => n.getClientRects().length).map(n => ({l: n.querySelector('.ux14-kpi-label').firstChild.textContent.trim(), em: n.querySelector('em').textContent.trim()})));
        assert.deepEqual(vis.map(x => x.l), ['Área activa', 'TCH Z25/26', 'TCH estimado Z26/27', 'Ton. estimadas Z26/27']);
        assert.ok(!vis.some(x => /^(Suertes activas|Haciendas)$/.test(x.l)));
        const ems = vis.map(x => x.em).join(' | ');
        for (const gone of ['Referencia · área activa', 'Área estimada × TCH', 'molienda · 100.00% área']) assert.ok(!ems.includes(gone), gone);
        assert.equal(await page.locator('#cronoZoneContent .ux13-zone-kpis').isVisible(), false, 'fila anterior reemplazada por UX14');
        assert.equal(await page.locator('#zoneMainSection .ux09-tabs-hint').isVisible(), false);
      });
      await check(W + ' Z9 Zona 5-Productores: cifras = motor y General; Riego y Secano separados y completos', async () => {
        await zone(page, '5-Productores');
        const k = await page.$$eval(UX14C + ' .ux14-kpi', ks => Object.fromEntries(ks.map(n => [n.querySelector('.ux14-kpi-label').firstChild.textContent.trim(), n.querySelector('strong').firstChild.textContent.trim()])));
        const truth = await page.evaluate(() => { const E = CASUR_CRONO_PARTICIPATION, all = CRONO_DATA.producers.flatMap(p => p.details), rows = all.filter(r => String(r.zona || '') === '5-Productores'), s = E.summary(rows); return {area: E.agronomicGroups(all, 'zona').find(g => g.key === '5-Productores').area, tch: s.estimateTch, tons: s.estimateTons}; });
        assert.ok(Math.abs(num(k['Área activa']) - truth.area) < 0.02, 'área activa ' + k['Área activa'] + ' vs ' + truth.area);
        assert.equal(num(k['TCH estimado Z26/27']), truth.tch); assert.ok(Math.abs(num(k['Ton. estimadas Z26/27']) - truth.tons) < 1);
        const comp = await page.$$eval(UX14C + ' .ux14-composition', fs => fs[0].innerText);
        const part = n => num((comp.match(new RegExp(n + '[^\\d]*([\\d,]+\\.\\d{2})')) || [])[1]);
        assert.ok(part('Riego') > 0 && part('Secano') > 0, 'riego y secano visibles por separado');
        const venta = /Ventana/.test(comp) ? part('Ventana') : 0; assert.doesNotMatch(comp, /por confirmar/);
        assert.ok(Math.abs(part('Riego') + part('Secano') + venta - num(k['Área activa'])) < 0.05, 'riego + secano (+ ventana) = área activa');
        assert.ok(!('Suertes activas' in k) && !('Haciendas' in k));
      });
      await check(W + ' Z9 Zona: valores de las cajas sin recorte y sin scroll horizontal', async () => {
        for (const z of ['', '5-Productores']) {
          await zone(page, z);
          const bad = await page.evaluate(() => { const out = []; document.querySelectorAll('#cronoZoneContent .crono-box:not(.crono-zone-wide), .ux14-zone:not(.ux14-hist-zone) .ux14-kpi').forEach(b => { if (!b.getClientRects().length) return; const br = b.getBoundingClientRect(); b.querySelectorAll('*').forEach(n => { if (!n.children.length && n.textContent.trim() && n.getClientRects().length && !n.closest('[popover]')) { const r = n.getBoundingClientRect(); if (r.width && r.right > br.right + 1) out.push(n.textContent.trim()); } }); }); return out; });
          assert.deepEqual(bad, [], z || 'general'); await noHScroll('zona ' + (z || 'general'));
        }
      });
      await check(W + ' Z9 Zona abierta se repinta al cambiar la generación efectiva', async () => {
        await zone(page, '5-Productores');
        const sel = UX14C + ' .ux14-kpi strong', real = await page.locator(sel).first().innerText();
        await page.evaluate(sel => { document.querySelector(sel).textContent = 'OBSOLETO'; document.dispatchEvent(new CustomEvent('casur-crono-effective-change')); }, sel);
        await page.waitForFunction(([sel, r]) => document.querySelector(sel)?.innerText === r, [sel, real], {timeout: 5000});
        assert.equal(await page.locator('#cronoZoneSelect').inputValue(), '5-Productores');
      });
      await check(W + ' Sin errores de página', async () => assert.deepEqual(page.errors, []));
      if (out && [390, 1280].includes(width)) { await hist(page, '10', 'last3'); await page.screenshot({path: path.join(out, `qa-${width}-hist-10.png`), fullPage: true}); }
      await ctx.close();
    }
  } finally { await browser.close(); }
  for (const r of results) console.log(r.join(' · '));
  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} PASS`);
  if (out) fs.writeFileSync(path.join(out, 'qa-ux13-c.json'), JSON.stringify(results, null, 1));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
