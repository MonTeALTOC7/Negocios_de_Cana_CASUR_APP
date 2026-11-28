// UX15-R — QA de Estimados Z26/27 sobre el explorador existente: KPI oficiales (AD/AE), comparación con Z25/26 en las
// mismas suertes, participación, distribución por tipo de riego/variedad/suelo/cortes, ranking configurable, plan mensual
// BE/BF, navegación Zona → Finca → Suerte, escenario optimista separado, acceso directo y responsive.
// Uso: node tools/qa-maestro-estimados.cjs BASE [EVIDENCIA_DIR]. Solo lectura.
const {chromium} = require('playwright'), assert = require('assert/strict'), fs = require('fs'), path = require('path');
const [base, out] = process.argv.slice(2);
if (!base) throw Error('Usage: node tools/qa-maestro-estimados.cjs BASE [OUT]');
if (out) fs.mkdirSync(out, {recursive: true});
const results = [];
const check = (name, fn, ms = 180000) => { let timer; return Promise.race([fn(), new Promise((_, ko) => { timer = setTimeout(() => ko(Error('timeout ' + ms + ' ms')), ms); })])
  .then(() => ['PASS', name], e => ['FAIL', name, e.message.split('\n').slice(0, 6).join(' ')]).then(r => { clearTimeout(timer); results.push(r); console.log(r.join(' · ')); }); };
const E = '#cronoContent .context-explorer[data-context="general"]';
const near = (a, b, e = 0.006) => assert.ok(Math.abs(Number(a) - Number(b)) < e, `${a} ≠ ${b}`);
const num = s => Number(String(s).replace(/[^\d.-]/g, ''));
async function open(browser, width) {
  const mobile = width < 700;
  const ctx = await browser.newContext({viewport: {width, height: mobile ? 800 : 900}, isMobile: mobile, hasTouch: mobile});
  const page = await ctx.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  await page.goto(base + 'modules/produccion/');
  await page.waitForFunction(() => window.CASUR_PRODUCTION_READY && window.CASUR_MAESTRO_UX && window.CASUR_ZONE_UX14, null, {timeout: 60000});
  await estimates(page);
  return {ctx, page};
}
// Access from Resumen › Consultas (third card), which opens the existing Estimados objective of the Cronológico.
async function estimates(page) {
  await page.evaluate(() => CASUR_MAESTRO_UX.activate('resumen'));
  await page.locator('#maestroDashboard [data-hub="estimados"]').click();
  await page.waitForFunction(E => document.querySelector(E)?.dataset.objective === 'estimate', E);
}
const state = page => page.getAttribute(E, 'data-state').then(JSON.parse);
const mode = (page, label) => page.locator(E + ' .ux05-modes button', {hasText: label}).click().then(() => page.waitForTimeout(150));
const dim = (page, key) => page.$eval(E + ' .ux05-dimension-select', (s, k) => { s.value = k; s.onchange(); }, key).then(() => page.waitForFunction(([E, k]) => JSON.parse(document.querySelector(E).dataset.state).dimension === k, [E, key]));
const rows = page => page.$$eval(E + ' .ux05-table tbody tr', rs => rs.map(r => [...r.children].map(c => c.firstChild?.textContent?.trim() ?? c.textContent.trim())));
(async () => {
  const browser = await chromium.launch();
  try {
    const {ctx, page} = await open(browser, 1280);
    // Independent reference: raw rows, participation and lotCompact (no UX code).
    const R = await page.evaluate(() => {
      const O = CASUR_OPERATIONAL_IMPORT, rows = CRONO_DATA.producers.flatMap(p => p.details), lots = new Map(APP_DATA.lotCompact.map(l => [String(l[0]), l]));
      const exec = list => { let a = 0, t = 0, n = 0; list.filter(r => O.participation(r).activeArea > 0).forEach(r => { const l = lots.get(String(r.codLote)); if (!l || /MAQUILA/i.test(l[2] || '')) return; const x = l[11].find(q => q[0] === 2526); if (x && x[1] > 0) { a += x[1]; t += x[2]; n++; } }); return {a, t, n, tch: a ? t / a : null}; };
      const usable = rows.filter(r => O.participation(r).usable), months = {};
      usable.filter(r => r.plan?.date?.iso).forEach(r => { const k = r.plan.date.iso.slice(0, 7), m = months[k] ||= {lots: 0, tons: 0, mech: 0, man: 0}; m.lots++; m.tons += O.participation(r).estimatedTons; if (/MEC/i.test(r.plan.cut)) m.mech++; if (/MANUAL/i.test(r.plan.cut)) m.man++; });
      const zones = [...new Set(rows.map(r => r.zona))];
      return {total: exec(rows), byZone: Object.fromEntries(zones.map(z => [z, exec(rows.filter(r => r.zona === z))])), months, summary: CASUR_CRONO_PARTICIPATION.summary(rows)};
    });
    await check('KPI oficiales AD/AE (9,101.68 ha · 561,658.27 t · 61.71 · 946) y comparación con Z25/26 en las mismas suertes', async () => {
      const kp = await page.$$eval(E + ' .ux09-forecast-overview > .ux09-forecast-stats > div', ds => ds.map(d => [d.querySelector('dt').textContent, d.querySelector('dd').textContent]));
      assert.deepEqual(kp.map(x => x[0]), ['Área con estimado', 'Toneladas estimadas', 'TCH estimado', 'Suertes con estimado']);
      near(num(kp[0][1]), 9101.68, 0.01); near(num(kp[1][1]), 561658.27, 0.01); near(num(kp[2][1]), 61.71); assert.equal(num(kp[3][1]), 946);
      const cmp = await page.$$eval(E + ' .ux15-compare-stats > div', ds => ds.map(d => [d.querySelector('dt').textContent, d.querySelector('dd').textContent, d.querySelector('dd').dataset.sign]));
      assert.match(cmp[0][0], /TCH Z25\/26 · mismas suertes/); near(num(cmp[0][1]), R.total.tch); near(num(cmp[1][1]), R.total.t, 1);
      near(num(cmp[2][1]), R.summary.estimateTch - R.total.tch, 0.011); assert.equal(cmp[2][2], 'down'); near(num(cmp[3][1]), R.summary.estimateTons - R.total.t, 1);
      const note = await page.textContent(E + ' .ux15-compare-note'); assert.match(note, new RegExp(R.total.n + ' suertes')); assert.match(note, /no es una pérdida observada ni identifica causas/);
    });
    await check('Composición por zona: área, toneladas, % t (suma 100 %), TCH estimado, TCH Z25/26 y Δ; TOTAL del motor', async () => {
      const rs = await rows(page); assert.equal(rs.length, 4); let share = 0, tons = 0;
      for (const r of rs) { const z = r[0], x = R.byZone[z]; tons += num(r[2]); share += num(r[3]); near(num(r[5]), x.tch); near(num(r[6]), num(r[4]) - num(r[5]), 0.015);
        const f = await page.evaluate(z => CASUR_ZONE_UX14.figures(z, 'Total').crono, z); near(num(r[4]), f.estimateTch); near(num(r[2]), f.estimateTons, 0.01); near(num(r[1]), f.estimateArea, 0.01); }
      near(share, 100, 0.25); near(tons, 561658.27, 0.05);
      const foot = await page.$$eval(E + ' .ux05-table tfoot td', t => t.map(x => x.textContent)); near(num(foot[0]), 9101.68, 0.01); near(num(foot[1]), 561658.27, 0.01); assert.equal(foot[2], '100.0 %'); near(num(foot[3]), 61.71); near(num(foot[4]), R.total.tch);
    });
    await check('Distribución por tipo de riego original, variedad, suelo y # de cortes: los grupos suman el total; sin selector ni «Sistema productivo»', async () => {
      for (const key of ['tipoRiego', 'variedad', 'textura', 'stage', 'zona']) { await dim(page, key);
        const g = JSON.parse(await page.getAttribute(E, 'data-groups')); near(g.reduce((n, x) => n + (x.estimateTons || 0), 0), 561658.27, 0.05); near(g.reduce((n, x) => n + x.area, 0), 9574.66, 0.02);
        if (key === 'tipoRiego') { assert.deepEqual(g.map(x => x.key).sort(), ['Aspersion', 'Goteo', 'Gravedad', 'Mini-Aspersion', 'Pivote', 'Secano', 'Ventana'], 'categorías originales');
          for (const x of g) { const f = await page.evaluate(s => CASUR_ZONE_UX14.figures('', s).crono, x.key); if (x.estimateTch != null) near(x.estimateTch, f.estimateTch); near(x.area, f.inventoryArea, 0.01); } } }
      const chips = await page.$$eval(E + ' .ux05-chips button', b => b.map(x => x.textContent));
      assert.ok(chips.includes('Tipo de riego') && chips.includes('# de cortes (rangos)')); assert.ok(!chips.some(c => /Sistema productivo|N\.º/.test(c)));
      assert.equal(await page.locator(E + ' .ux14-system, ' + E + ' .ux15-explorer-system').count(), 0, 'sin selector Total / Riego / Secano / Ventana');
      assert.doesNotMatch(await page.textContent(E), /Sistema productivo|N\.º de cortes/);
      await dim(page, 'zona');
    });
    await check('Ranking configurable: criterio Δ TCH y TCH Z25/26, 10 / 20 / Todas', async () => {
      await mode(page, 'Ranking fincas'); assert.equal((await rows(page)).length, 10);
      await page.selectOption(E + ' .ux15-rank-controls select >> nth=0', 'delta'); let rs = await rows(page); const d = rs.map(r => r[6]).filter(x => x !== '—').map(num); assert.deepEqual(d, [...d].sort((a, b) => b - a));
      await page.selectOption(E + ' .ux15-rank-controls select >> nth=0', 'exe'); rs = await rows(page); const x = rs.map(r => r[5]).filter(v => v !== '—').map(num); assert.deepEqual(x, [...x].sort((a, b) => b - a));
      await page.selectOption(E + ' .ux15-rank-controls select >> nth=1', '20'); assert.equal((await rows(page)).length, 20);
      await page.selectOption(E + ' .ux15-rank-controls select >> nth=1', 'all'); const all = (await rows(page)).length; assert.ok(all > 20);
      await page.selectOption(E + ' .ux15-rank-controls select >> nth=0', 'tons'); await page.selectOption(E + ' .ux15-rank-controls select >> nth=1', '10');
      const t = (await rows(page)).map(r => num(r[2])); assert.deepEqual(t, [...t].sort((a, b) => b - a));
    });
    await check('Plan mensual de cosecha BE/BF = plan de la generación 1102 (Dic-2026 206 · 131,267 t … Abr-2027 140 · 69,863 t; 787 mecánicas / 159 manuales)', async () => {
      await mode(page, 'Plan de cosecha'); const rs = await page.$$eval(E + ' .ux15-plan-table tbody tr', r => r.map(x => [...x.children].map(c => c.firstChild?.textContent?.trim() ?? c.textContent.trim())));
      assert.deepEqual(rs.map(r => r[0]), ['Dic-2026', 'Ene-2027', 'Feb-2027', 'Mar-2027', 'Abr-2027']);
      const want = {'Dic-2026': [206, 131267], 'Ene-2027': [169, 108955], 'Feb-2027': [233, 142176], 'Mar-2027': [198, 109396], 'Abr-2027': [140, 69863]};
      const keys = Object.keys(R.months).sort();
      rs.forEach((r, i) => { assert.equal(num(r[1]), want[r[0]][0]); near(num(r[3]), want[r[0]][1], 1); const m = R.months[keys[i]]; assert.equal(num(r[1]), m.lots); near(num(r[3]), m.tons, 1); assert.equal(r[5], m.mech + ' / ' + m.man); });
      const foot = await page.$$eval(E + ' .ux15-plan-table tfoot td', t => t.map(x => x.textContent)); assert.match(foot[0], /^TOTAL/); assert.equal(num(foot[1]), 946); near(num(foot[3]), 561658, 1); assert.equal(foot[4], '100.0 %'); assert.equal(foot[5], '787 / 159');
      assert.match(await page.textContent(E + ' .ux15-plan'), /no es aforo/);
      await page.locator(E + ' .ux15-plan-table tbody tr').first().click(); await page.waitForSelector('dialog.context-drawer[open]');
      assert.match(await page.textContent('dialog.context-drawer[open] h2'), /Plan de cosecha · Dic-2026/); assert.match(await page.textContent('dialog.context-drawer[open]'), /206 en catálogo/);
      await page.locator('dialog.context-drawer[open] header button').click();
      await page.selectOption(E + ' .ux05-category', '1-Sur'); const z = await page.$$eval(E + ' .ux15-plan-table tfoot td', t => t.map(x => x.textContent));
      const ref = await page.evaluate(() => CASUR_ZONE_UX14.figures('1-Sur', 'Total').crono); near(num(z[3]), ref.estimateTons, 1);
    });
    await check('Navegación Zona → Finca → Suerte con ruta visible y regreso', async () => {
      await estimates(page); await mode(page, 'TCH por grupo'); await page.locator(E + ' .ux05-table tbody tr', {hasText: '2-Centro'}).click();
      await page.waitForFunction(E => JSON.parse(document.querySelector(E).dataset.state).mode === 'farms', E);
      assert.match(await page.textContent(E + ' .ux15-trail'), /Zonas\s*›\s*2-Centro\s*›\s*Fincas/);
      const farm = (await rows(page))[0][0]; await page.locator(E + ' .ux05-table tbody tr').first().click(); await page.waitForSelector('dialog.context-drawer[open]');
      assert.match(await page.textContent('dialog.context-drawer[open] h2'), new RegExp('Suertes del ámbito · ' + farm.split(' · ')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      await page.locator('dialog.context-drawer[open] .context-results button').first().click();
      await page.waitForFunction(() => document.querySelector('#cronoContent')?.dataset.geoScope === 'lot');
      await estimates(page); await mode(page, 'TCH por grupo'); await page.locator(E + ' .ux05-table tbody tr', {hasText: '2-Centro'}).click();
      await page.locator(E + ' .ux15-trail button', {hasText: 'Zonas'}).click(); await page.waitForFunction(E => JSON.parse(document.querySelector(E).dataset.state).mode === 'general', E);
    });
    await check('Escenario optimista AF/AG separado y cerrado; no altera los KPI oficiales', async () => {
      const box = E + ' details.ux13-optimistic'; assert.equal(await page.locator(box).getAttribute('open'), null);
      const before = await page.$$eval(E + ' .ux09-forecast-overview > .ux09-forecast-stats dd', d => d.map(x => x.textContent));
      await page.locator(box + ' summary').click(); assert.match(await page.textContent(box), /No sustituye el aforo oficial/);
      assert.deepEqual(await page.$$eval(E + ' .ux09-forecast-overview > .ux09-forecast-stats dd', d => d.map(x => x.textContent)), before);
      assert.equal(await page.locator(E + ' .ux13-optimistic .ux15-compare-stats').count(), 0, 'la comparación usa solo el oficial');
    });
    await check('Acceso desde Resumen › Consultas (tercera tarjeta): abre la función Estimados existente del Cronológico; sin acceso en el menú lateral', async () => {
      await page.evaluate(() => CASUR_MAESTRO_UX.activate('resumen'));
      const cards = await page.$$eval('#maestroDashboard .ux09-hub-actions > button strong', s => s.map(x => x.textContent)); assert.deepEqual(cards, ['Cronológico', 'Histórico', 'Estimados Z26/27']);
      assert.equal(await page.locator('#maestroTabs [data-maestro-shortcut], #maestro-shortcut-estimados').count(), 0, 'sin acceso en el menú lateral');
      assert.deepEqual(await page.$$eval('#maestroTabs button', b => b.map(x => x.textContent.trim())), ['Resumen', 'Cronológico', 'Histórico', 'Zonas', 'Análisis']);
      await page.locator('#maestroDashboard [data-hub="estimados"]').click();
      await page.waitForFunction(E => document.body.dataset.maestroView === 'cronologico' && document.querySelector(E)?.dataset.objective === 'estimate', E);
      assert.deepEqual(JSON.parse(await page.getAttribute(E, 'data-state')).scope, []);
      assert.deepEqual(page.errors, []);
    });
    await ctx.close();
    for (const width of [360, 390, 768, 1280, 1536]) await check(`[${width}] Estimados sin desbordamiento (TCH por grupo, ranking, plan) y sin errores`, async () => {
      const {ctx, page} = await open(browser, width);
      for (const m of ['TCH por grupo', 'Ranking fincas', 'Plan de cosecha']) { await mode(page, m);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `desborde en ${m}`);
        if (out) await page.locator(E).screenshot({path: path.join(out, `estimados-${width}-${m.replace(/ /g, '-')}.png`)}); }
      assert.deepEqual(page.errors, []); await ctx.close();
    });
  } finally {
    await browser.close();
    const pass = results.filter(r => r[0] === 'PASS').length;
    if (out) fs.writeFileSync(path.join(out, 'qa-maestro-estimados.json'), JSON.stringify(results, null, 1));
    console.log(`${pass}/${results.length} ${pass === results.length ? 'PASS' : 'FAIL'}`); if (pass !== results.length) process.exitCode = 1;
  }
})();
