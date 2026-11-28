// UX15 (#66, segunda etapa) — QA de Análisis en seis familias: cobertura de paneles, paridad con el motor oficial y con
// el tablero de zona UX14, separación Riego/Secano, navegación contextual con retorno, Maquila excluida y responsive.
// Uso: node tools/qa-maestro-ux15.cjs BASE [EVIDENCIA_DIR]. Solo lectura.
const {chromium} = require('playwright'), assert = require('assert/strict'), fs = require('fs'), path = require('path');
const [base, out] = process.argv.slice(2);
if (!base) throw Error('Usage: node tools/qa-maestro-ux15.cjs BASE [OUT]');
if (out) fs.mkdirSync(out, {recursive: true});
const results = [];
const check = (name, fn, ms = 180000) => { let timer; return Promise.race([fn(), new Promise((_, ko) => { timer = setTimeout(() => ko(Error('timeout ' + ms + ' ms')), ms); })])
  .then(() => ['PASS', name], e => ['FAIL', name, e.message.split('\n').slice(0, 6).join(' ')]).then(r => { clearTimeout(timer); results.push(r); console.log(r.join(' · ')); }); };
const S = '#executiveAnalysisSection', RS = S + ' .ux15-resumen';
const near = (a, b, e = 0.006) => assert.ok(Math.abs(Number(a) - Number(b)) < e, `${a} ≠ ${b}`);
const num = s => Number(String(s).replace(/[^\d.-]/g, ''));
const PANELS = ['summaryAcc', 'trendAcc', 'committeeAcc', 'priorityAcc', 'potentialAcc', 'renewalAcc', 'chartsAcc', 'matrixAcc', 'zoneAcc', 'bestAcc', 'fallingAcc', 'techAcc', 'maquilaAcc'];
async function open(browser, width) {
  const mobile = width < 700;
  const ctx = await browser.newContext({viewport: {width, height: mobile ? 800 : 900}, isMobile: mobile, hasTouch: mobile});
  const page = await ctx.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  await page.goto(base + 'modules/produccion/');
  await page.waitForFunction(() => window.CASUR_PRODUCTION_READY && window.CASUR_MAESTRO_UX && window.CASUR_ANALISIS_UX15 && window.CASUR_ZONE_UX14, null, {timeout: 60000});
  await page.evaluate(() => { CASUR_MAESTRO_UX.activate('analisis'); CASUR_ANALISIS_UX15.choose('resumen'); });
  await page.waitForSelector(RS + ' .ux14-kpi');
  return {ctx, page};
}
const analisis = (page, fam) => page.evaluate(f => { CASUR_MAESTRO_UX.activate('analisis'); CASUR_ANALISIS_UX15.choose(f); }, fam).then(() => page.waitForTimeout(250));
const kpis = page => page.$$eval(RS + ' .ux14-kpi', ks => ks.map(k => ({label: k.querySelector('.ux14-kpi-label').firstChild.textContent.trim(), value: k.querySelector('strong').firstChild.textContent.trim()})));
(async () => {
  const browser = await chromium.launch();
  try {
    const {ctx, page} = await open(browser, 1280);
    await check('Seis familias: Resumen, Desempeño, Decisiones, Composición, Técnica y Maquila cubren los 13 paneles una sola vez', async () => {
      const f = await page.evaluate(() => CASUR_ANALISIS_UX15.families);
      assert.deepEqual(f.map(x => x.label), ['Resumen', 'Desempeño', 'Decisiones', 'Composición', 'Técnica', 'Maquila']);
      const all = f.flatMap(x => x.panels); assert.equal(new Set(all).size, all.length, 'sin paneles repetidos'); assert.deepEqual([...all].sort(), [...PANELS].sort());
      for (const p of PANELS) assert.equal(await page.locator('#' + p).count(), 1, `panel ${p} conservado`);
      assert.equal(await page.locator(S + ' .ux14-zone').count(), 0, 'los paneles UX15 no colisionan con el destino del exportador de Zona');
      for (const x of f) { await page.locator(S + ' .ux15-family-tabs button', {hasText: x.label}).click(); await page.waitForTimeout(200);
        const vis = await page.$$eval(S + ' .ux09-section-tabs button', bs => bs.filter(b => !b.hidden).map(b => b.dataset.target)); assert.deepEqual([...vis].sort(), [...x.panels].sort(), x.label);
        assert.ok(await page.locator('#' + x.panels[0]).isVisible() || (await page.$$eval(x.panels.map(p => '#' + p).join(','), ns => ns.some(n => n.offsetParent))), `${x.label} muestra un panel propio`);
        assert.equal(await page.getAttribute(S + ` .ux15-family-tabs button[data-family="${x.key}"]`, 'aria-selected'), 'true'); }
      assert.equal(await page.locator(S + ' .ux09-tabs-hint').isVisible().catch(() => false), false);
    });
    await check('Resumen Total = KPI ejecutivos oficiales (63.94 · 9,735.96 ha · 622,474 t · KATM 98.65 · histórico 76.87 · últimas 3 68.19 · Δ −12.93 · potencial)', async () => {
      await analisis(page, 'resumen');
      const legacy = await page.$$eval('#summaryAcc .kpi', ks => Object.fromEntries(ks.map(k => [k.querySelector('.label,span')?.textContent.trim(), k.querySelector('strong')?.textContent.trim()])));
      const k = await kpis(page); assert.deepEqual(k.map(x => x.label), ['TCH Z25/26', 'Área cosechada Z25/26', 'Toneladas Z25/26', 'KATM Z25/26']);
      near(num(k[0].value), num(legacy['TCH última zafra'])); near(num(k[1].value), num(legacy['Área última zafra'])); near(num(k[2].value), num(legacy['Toneladas última zafra']), 1); near(num(k[3].value), num(legacy['KATM última zafra']));
      near(num(k[0].value), 63.94); near(num(k[1].value), 9735.96); near(num(k[2].value), 622474, 1); near(num(k[3].value), 98.65);
      const strip = await page.textContent(RS + ' .ux14-strip');
      near(num(strip.match(/TCH histórico\s*([\d.,]+)/)[1]), num(legacy['TCH histórico'])); near(num(strip.match(/TCH últimas 3\s*([\d.,]+)/)[1]), num(legacy['TCH últimas 3']));
      near(num(strip.match(/Δ vs histórico\s*([-+\d.,]+)/)[1]), num(legacy['Δ vs histórico'])); assert.match(strip, new RegExp('Potencial vs zona\\s*' + legacy['Potencial vs zona'].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      const z = await page.evaluate(() => { const zs = [...new Set(mainEntities().map(e => e.zona))]; let a = 0, t = 0; zs.forEach(z => { const l = zoneAnalysis(z).trend.find(x => x.zafra == 2526); if (l && l.area > 0) { a += l.area; t += l.ton; } }); return {a, t}; });
      near(z.a, 9735.96, 0.02); near(z.t, 622474, 1);
      assert.equal(await page.locator('#summaryAcc .accordion-body > .kpis').isVisible(), false, 'fila anterior de 8 KPI reemplazada');
      assert.equal(await page.locator('#summaryAcc .accordion-body > .kpis').count(), 1, 'fila anterior conservada en el DOM');
    });
    await check('Resumen por tipo de riego original: composición = Histórico de Zona general; suma = Total; Maquila excluida', async () => {
      await analisis(page, 'resumen');
      const T = await page.evaluate(() => { const f = CASUR_ZONE_UX14.histFigures('', 'Total'); return {types: f.riegoTypes, by: f.latestByRiego, area: f.latest.area, ton: f.latest.ton}; });
      assert.deepEqual([...T.types].sort(), ['Aspersion', 'Goteo', 'Gravedad', 'Pivote', 'Secano', 'Ventana']);
      near(Object.values(T.by).reduce((n, x) => n + x.area, 0), T.area, 0.01); near(Object.values(T.by).reduce((n, x) => n + x.ton, 0), T.ton, 0.5);
      const order = await page.$$eval(RS + ' .ux14-composition:first-of-type li', ls => ls.map(l => l.dataset.riego)); assert.deepEqual(order, T.types);
      const comp = await page.$$eval(RS + ' .ux14-composition', cs => cs.map(c => c.innerText)); assert.ok(!/maquila/i.test(comp.join()), 'Maquila fuera de la composición'); assert.doesNotMatch(comp.join(), /\bRiego\b(?! )/);
      assert.match(await page.textContent(RS), /Maquila excluida/);
      assert.equal(await page.locator(S + ' .ux14-system, ' + S + ' .ux15-system').count(), 0, 'sin selector de sistema');
      assert.match(await page.textContent(S + ' .ux15-maquila'), /no entra en los totales/);
    });
    await check('Resumen: tendencia por zafra con Total oficial y series por tipo de riego (≥ 5 %); selector de métrica', async () => {
      await analisis(page, 'resumen');
      const series = await page.$$eval(RS + ' .ux14-lines path', ps => ps.map(p => p.dataset.series));
      const want = await page.evaluate(() => { const f = CASUR_ZONE_UX14.histFigures('', 'Total'); return ['Total', ...f.riegoTypes.filter(t => f.latestByRiego[t].area >= 0.05 * f.latest.area)]; }); assert.deepEqual(series, want);
      for (const m of ['Área cosechada', 'Toneladas', 'KATM', 'TCH']) { await page.locator(RS + ' .ux14-metric button', {hasText: m}).click(); await page.waitForTimeout(100); assert.match(await page.textContent(RS + ' .ux14-lines figcaption'), new RegExp(m)); }
      const t = await page.evaluate(() => { const T = CASUR_ZONE_UX14.histFigures('', 'Total'); return T.official.map(x => [x.zafra, x.tch]); });
      assert.equal(t[t.length - 1][0], 2526); near(t[t.length - 1][1], 63.94);
    });
    await check('Resumen: referencia Estimados Z26/27 corta = tablero de zona; «Ver Estimados» abre el explorador existente sin ámbitos artificiales', async () => {
      await analisis(page, 'resumen');
      const ref = await page.textContent(RS + ' .ux15-estimate-ref'), c = await page.evaluate(() => CASUR_ZONE_UX14.figures('', 'Total').crono);
      assert.match(ref, /Aforo 12-Oct-2026/); assert.match(ref, /Z26\/27/); const b = await page.textContent(RS + ' .ux15-estimate-ref b'); near(num(b.match(/TCH est\.\s*([\d.,]+)/)[1]), c.estimateTch); near(num(b.match(/·\s*([\d.,]+)\s*t$/)[1]), c.estimateTons, 1);
      assert.equal(await page.locator(S + ' .ux15-panel table', {hasText: 'TCH est'}).count(), 0, 'sin tablas de Estimados en Análisis');
      await page.locator(RS + ' .ux15-estimate-ref button').click();
      await page.waitForFunction(() => document.querySelector('#cronoContent .context-explorer[data-context="general"]')?.dataset.objective === 'estimate');
      const st = JSON.parse(await page.getAttribute('#cronoContent .context-explorer[data-context="general"]', 'data-state')); assert.deepEqual(st.scope, []); assert.equal(st.objective, 'estimate');
      const sum = JSON.parse(await page.getAttribute('#cronoContent .context-explorer[data-context="general"]', 'data-summary')); near(sum.estimateTch, c.estimateTch); near(sum.estimateTons, c.estimateTons, 0.02);
    });
    await check('Desempeño: comparabilidad por zona = motor oficial (zoneAnalysis); zonas solo históricas rotuladas', async () => {
      await analisis(page, 'desempeno');
      const rows = await page.$$eval(S + ' .ux15-zones tbody tr', rs => rs.map(r => ({zone: r.dataset.zone, cells: [...r.querySelectorAll('td')].slice(1).map(t => t.textContent.trim())})));
      const zones = await page.evaluate(() => [...new Set(mainEntities().map(e => e.zona))].sort()); assert.deepEqual(rows.map(r => r.zone).sort(), zones);
      for (const r of rows) { const o = await page.evaluate(z => { const a = zoneAnalysis(z), l = a.trend.find(x => x.zafra == 2526); return {has: !!(l && l.area > 0), area: l?.area, tch: l?.tch, hist: a.hist.tch, last3: a.last3.tch}; }, r.zone);
        near(num(r.cells[2 + 0]), o.hist, 0.006);
        if (o.has) { near(num(r.cells[0]), o.area, 0.01); near(num(r.cells[1]), o.tch); near(num(r.cells[3]), o.last3); near(num(r.cells[4]), o.tch - o.hist, 0.011); }
        else assert.match(r.cells[0], /^sin 25\/26$/); }
    });
    await check('Desempeño → Histórico de la zona y retorno a Análisis · Desempeño', async () => {
      await analisis(page, 'desempeno'); await page.locator(S + ' .ux15-zones tr[data-zone="3-ZONA NORTE"] .ux14-farm-link').click();
      await page.waitForFunction(() => document.body.dataset.maestroView === 'zonas' && document.querySelector('.ux14-hist-zone')?.dataset.zone === '3-ZONA NORTE');
      assert.ok(await page.locator('#zoneAnalysisSection').isVisible());
      await page.locator('#zoneMainSection .ux14-return', {hasText: 'Análisis · Desempeño'}).click(); await page.waitForFunction(() => document.body.dataset.maestroView === 'analisis');
      assert.equal(await page.evaluate(() => CASUR_ANALISIS_UX15.family()), 'desempeno'); assert.ok(await page.locator(S + ' .ux15-zones').isVisible());
    });
    await check('Decisiones sin simulador ni panel de recuperación; paneles existentes intactos; sin selector de sistema en ninguna familia', async () => {
      await analisis(page, 'decisiones');
      assert.equal(await page.locator(S + ' .ux15-recovery, ' + S + ' .ux15-recuperacion').count(), 0, 'sin panel «Recuperación»');
      assert.doesNotMatch(await page.evaluate(() => document.body.innerText), /simulador|recuperación productiva/i);
      for (const p of ['committeeAcc', 'priorityAcc', 'potentialAcc', 'renewalAcc']) { await page.locator(S + ` .ux09-section-tabs button[data-target="${p}"]`).click(); assert.ok(await page.locator('#' + p).isVisible(), p); }
      for (const f of ['resumen', 'desempeno', 'decisiones', 'composicion', 'tecnica', 'maquila']) { await analisis(page, f); assert.equal(await page.locator(S + ' .ux14-system').count(), 0, f); }
    });
    await check('Coherencia: Análisis, Zonas y Estimados usan el tipo de riego original y la misma referencia Total', async () => {
      await page.evaluate(() => { CASUR_MAESTRO_UX.activate('zonas'); document.querySelector('#zoneMainSection .ux09-section-tabs button[data-target="cronoZoneSection"]').click(); const s = document.querySelector('#cronoZoneSelect'); s.value = ''; selectCronoZone(''); });
      await page.waitForSelector('.ux14-zone:not(.ux14-hist-zone) .ux14-composition li');
      const z = await page.$$eval('.ux14-zone:not(.ux14-hist-zone) .ux14-composition:first-of-type li', ls => ls.map(l => l.dataset.riego)); assert.ok(z.includes('Gravedad') && z.includes('Secano') && !z.includes('Riego'));
      await page.evaluate(() => CASUR_MAESTRO_UX.activate('resumen')); await page.locator('#maestroDashboard [data-hub="estimados"]').click();
      const E = '#cronoContent .context-explorer[data-context="general"]'; await page.waitForFunction(E => document.querySelector(E)?.dataset.objective === 'estimate', E);
      assert.equal(await page.locator(E + ' .ux14-system').count(), 0); assert.deepEqual(JSON.parse(await page.getAttribute(E, 'data-state')).scope, []);
    });
    await check('Composición → Análisis por Zona (Cronológico); Técnica y paneles anteriores intactos', async () => {
      await analisis(page, 'composicion'); await page.locator(S + ' .ux15-composicion button').click();
      await page.waitForFunction(() => document.body.dataset.maestroView === 'zonas' && document.querySelector('#cronoZoneSection')?.offsetParent);
      assert.ok(await page.locator('.ux14-zone:not(.ux14-hist-zone) .ux14-kpi').first().isVisible());
      await page.locator('#zoneMainSection .ux14-return', {hasText: 'Composición'}).click(); await page.waitForFunction(() => document.body.dataset.maestroView === 'analisis');
      await analisis(page, 'tecnica'); assert.ok(await page.locator('#techAcc').isVisible());
      await analisis(page, 'desempeno'); for (const p of ['trendAcc', 'matrixAcc', 'bestAcc', 'fallingAcc']) { await page.locator(S + ` .ux09-section-tabs button[data-target="${p}"]`).click(); assert.ok(await page.locator('#' + p).isVisible(), p); }
      assert.deepEqual(page.errors, []);
    });
    await ctx.close();
    for (const width of [360, 390, 768, 1280, 1536]) await check(`[${width}] seis familias sin desbordamiento; selector compacto en Android y pestañas en escritorio; sin errores`, async () => {
      const {ctx, page} = await open(browser, width);
      assert.equal(await page.locator(S + ' .ux15-family-select').isVisible(), width < 700); assert.equal(await page.locator(S + ' .ux15-family-tabs').isVisible(), width >= 700);
      for (const f of ['resumen', 'desempeno', 'decisiones', 'composicion', 'tecnica', 'maquila']) {
        if (width < 700) await page.selectOption(S + ' .ux15-family-select', f); else await page.locator(S + ` .ux15-family-tabs button[data-family="${f}"]`).click();
        await page.waitForTimeout(250); if (f === 'decisiones') await page.locator(S + ' .ux09-section-tabs button[data-target="priorityAcc"]').click();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `desborde en ${f}`);
        if (out && ['resumen', 'desempeno', 'decisiones'].includes(f)) await page.locator(S).screenshot({path: path.join(out, `ux15-${width}-${f}.png`)}); }
      assert.equal(await page.locator(RS + ' .ux14-kpi').count(), 4); assert.deepEqual(page.errors, []); await ctx.close();
    });
  } finally {
    await browser.close();
    const pass = results.filter(r => r[0] === 'PASS').length;
    if (out) fs.writeFileSync(path.join(out, 'qa-maestro-ux15.json'), JSON.stringify(results, null, 1));
    console.log(`${pass}/${results.length} ${pass === results.length ? 'PASS' : 'FAIL'}`); if (pass !== results.length) process.exitCode = 1;
  }
})();
