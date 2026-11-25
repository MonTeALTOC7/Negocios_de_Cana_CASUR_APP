// UX14 (#66) — QA de Análisis por Zona: paridad con cálculos independientes, conciliación por sistema,
// navegación contextual, formatos y responsive. Uso: node tools/qa-maestro-ux14.cjs BASE [EVIDENCIA_DIR]. Solo lectura.
const {chromium} = require('playwright'), assert = require('assert/strict'), fs = require('fs'), path = require('path');
const [base, out] = process.argv.slice(2);
if (!base) throw Error('Usage: node tools/qa-maestro-ux14.cjs BASE [OUT]');
if (out) fs.mkdirSync(out, {recursive: true});
const results = [];
const check = (name, fn, ms = 180000) => { let timer; return Promise.race([fn(), new Promise((_, ko) => { timer = setTimeout(() => ko(Error('timeout ' + ms + ' ms')), ms); })])
  .then(() => ['PASS', name], e => ['FAIL', name, e.message.split('\n').slice(0, 6).join(' ')]).then(r => { clearTimeout(timer); results.push(r); console.log(r.join(' · ')); }); };
const C = '.ux14-zone:not(.ux14-hist-zone)', H = '.ux14-hist-zone';
const near = (a, b, e = 0.006) => assert.ok(Math.abs(Number(a) - Number(b)) < e, `${a} ≠ ${b}`);
const num = s => Number(String(s).replace(/[^\d.-]/g, ''));
async function open(browser, width) {
  const mobile = width < 700;
  const ctx = await browser.newContext({viewport: {width, height: mobile ? 800 : 900}, isMobile: mobile, hasTouch: mobile});
  const page = await ctx.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  await page.goto(base + 'modules/produccion/');
  await page.waitForFunction(() => window.CASUR_PRODUCTION_READY && window.CASUR_MAESTRO_UX && window.CASUR_ZONE_UX14, null, {timeout: 60000});
  await page.evaluate(() => { CASUR_MAESTRO_UX.activate('zonas'); const s = document.querySelector('#cronoZoneSelect'); s.value = ''; selectCronoZone(''); });
  await page.waitForSelector(C + ' .ux14-kpi');
  return {ctx, page};
}
const zone = (page, z) => page.evaluate(z => { const s = document.querySelector('#cronoZoneSelect'); s.value = z; selectCronoZone(z); }, z).then(() => page.waitForFunction(z => document.querySelector('.ux14-zone:not(.ux14-hist-zone)')?.dataset.zone === z, z));
const kpis = page => page.$$eval(C + ' .ux14-kpi', ks => ks.map(k => ({label: k.querySelector('.ux14-kpi-label').firstChild.textContent.trim(), value: k.querySelector('strong').firstChild.textContent.trim(), note: k.querySelector('em').textContent.trim()})));
(async () => {
  const browser = await chromium.launch();
  try {
    const {ctx, page} = await open(browser, 1280);
    // Independent reference: raw rows and lotCompact, without the UX14 code or engine.summary().
    const R = await page.evaluate(() => {
      const IRR = ['gravedad', 'goteo', 'aspersion', 'aspersión', 'pivote', 'mini-aspersion', 'mini-aspersión'];
      const sys = v => { const t = String(v ?? '').trim(), k = t.toLowerCase(); return !t ? 'Sin dato' : k === 'secano' ? 'Secano' : k === 'ventana' ? 'Ventana' : IRR.includes(k) ? 'Riego' : 'Sin dato'; };
      const rows = CRONO_DATA.producers.flatMap(p => p.details), O = CASUR_OPERATIONAL_IMPORT;
      const agg = list => { const a = list.filter(r => O.participation(r).activeArea > 0), m = list.filter(r => O.participation(r).milling), e = m.filter(r => r.millingEstimatedTons != null);
        const ton = e.reduce((n, r) => n + r.millingEstimatedTons, 0), ea = e.reduce((n, r) => n + O.participation(r).millingArea, 0);
        return {active: a.reduce((n, r) => n + O.participation(r).activeArea, 0), lots: a.length, milling: m.reduce((n, r) => n + O.participation(r).millingArea, 0), tons: ton, tch: ea ? ton / ea : null}; };
      const hist = (z, s) => { let a = 0, t = 0; APP_DATA.lotCompact.forEach(l => { if (/MAQUILA/i.test(l[2])) return; if (z && l[2][0] !== z[0]) return; if (s && sys(l[4]) !== s) return; const x = l[11].find(q => q[0] === 2526); if (x && x[1] > 0) { a += x[1]; t += x[2]; } }); return a ? t / a : null; };
      const zones = [...new Set(rows.map(r => r.zona))].sort(), systems = ['Riego', 'Secano', 'Ventana', 'Sin dato'], out = {};
      for (const z of ['', ...zones]) { const zr = rows.filter(r => !z || r.zona === z); out[z || 'Total'] = {all: agg(zr), hist: hist(z), sys: Object.fromEntries(systems.map(s => [s, {...agg(zr.filter(r => sys(r.tipoRiego) === s)), hist: hist(z, s)}]))}; }
      const exec = [...document.querySelectorAll('#executiveAnalysisSection .kpi')].find(k => /TCH última zafra/i.test(k.textContent));
      return {out, zones, meta: CRONO_DATA.meta};
    });
    await check('Paridad total CASUR: 9,574.66 ha activas, 995 suertes, 9,101.68 ha molienda, 561,658.27 t, TCH 61.71', async () => {
      const T = R.out.Total.all; near(T.active, 9574.66, 0.01); assert.equal(T.lots, 995); near(T.milling, 9101.68, 0.01); near(T.tons, 561658.27, 0.01); near(T.tch, 61.71, 0.005);
      const k = await kpis(page); assert.equal(k.length, 4, 'cuatro KPI principales');
      assert.deepEqual(k.map(x => x.label), ['Área activa', 'TCH Z25/26', 'TCH estimado Z26/27', 'Ton. estimadas Z26/27']);
      near(num(k[0].value), 9574.66); assert.match(k[0].note, /^995 suertes activas$/); near(num(k[1].value), 63.94); near(num(k[2].value), 61.71); near(num(k[3].value), 561658, 1);
      assert.match(await page.textContent(C + ' .ux14-strip'), /Área de molienda\s*9,101\.68 ha/);
    });
    await check('Paridad por zona y sistema contra el cálculo independiente (área, suertes, toneladas, TCH Z26/27 y Z25/26)', async () => {
      for (const z of ['', ...R.zones]) for (const s of ['Total', 'Riego', 'Secano', 'Ventana', 'Sin dato']) {
        const f = await page.evaluate(([z, s]) => CASUR_ZONE_UX14.figures(z, s), [z, s]), ref = s === 'Total' ? {...R.out[z || 'Total'].all, hist: R.out[z || 'Total'].hist} : R.out[z || 'Total'].sys[s];
        near(f.crono.inventoryArea, ref.active, 0.01); assert.equal(f.crono.activeLots, ref.lots, `${z}/${s} suertes`); near(f.crono.millingArea || 0, ref.milling, 0.01);
        if (ref.tch != null) { near(f.crono.estimateTons, ref.tons, 0.02); near(f.crono.estimateTch, ref.tch, 0.006); }
        if (ref.hist != null) near(f.hist.tch, ref.hist, 0.006);
      }
    });
    await check('Conciliación: Riego + Secano + Ventana + Sin dato = Total, y suma de zonas = CASUR', async () => {
      for (const z of ['Total', ...R.zones]) { const o = R.out[z]; for (const k of ['active', 'tons', 'milling']) near(Object.values(o.sys).reduce((n, x) => n + x[k], 0), o.all[k], 0.02); assert.equal(Object.values(o.sys).reduce((n, x) => n + x.lots, 0), o.all.lots); }
      for (const k of ['active', 'tons', 'milling']) near(R.zones.reduce((n, z) => n + R.out[z].all[k], 0), R.out.Total.all[k], 0.02);
      assert.equal(R.out.Total.sys['Sin dato'].lots, 0, 'sin suertes sin dato en 1102');
    });
    await check('TCH Z25/26 igual al KPI «TCH última zafra» de Análisis (63.94, sin Maquila)', async () => {
      await page.evaluate(() => CASUR_MAESTRO_UX.activate('analisis')); await page.waitForTimeout(2500);
      const v = await page.evaluate(() => [...document.querySelectorAll('#executiveAnalysisSection .kpi')].find(k => /TCH última zafra/i.test(k.textContent))?.querySelector('strong')?.textContent);
      near(num(v), 63.94); near(R.out.Total.hist, 63.94, 0.006);
      await page.evaluate(() => CASUR_MAESTRO_UX.activate('zonas'));
    });
    await check('Composición por sistema con valores y porcentajes; Ventana pendiente y sin categorías vacías', async () => {
      const c = await page.$$eval(C + ' .ux14-composition', fs => fs.map(f => f.innerText));
      assert.equal(c.length, 2); assert.match(c[0], /Riego\s+8,396\.03\s+87\.7 %/); assert.match(c[0], /Secano\s+852\.98\s+8\.9 %/); assert.match(c[0], /Ventana · por confirmar\s+325\.65\s+3\.4 %/);
      assert.doesNotMatch(c.join(' '), /Sin dato/); assert.equal(await page.locator(C + ' .ux14-chip', {hasText: 'Sin dato'}).count(), 0);
      assert.equal(await page.locator(C + ' .ux14-chip', {hasText: 'Ventana · por confirmar'}).count(), 1);
    });
    await check('Selector Total / Riego / Secano y chip Ventana filtran KPI; Secano 1-Sur = 11.30 estimado y 59.61 ejecutado', async () => {
      await zone(page, '1-Sur'); await page.locator(C + ' .ux14-seg button', {hasText: 'Secano'}).click();
      let k = await kpis(page); near(num(k[0].value), 151.03); assert.match(k[0].note, /^24 suertes/); near(num(k[1].value), 59.61); near(num(k[2].value), 11.30);
      await page.locator(C + ' .ux14-chip', {hasText: 'Ventana'}).click(); k = await kpis(page); near(num(k[0].value), 280.14);
      assert.equal(await page.getAttribute(C, 'data-system'), 'Ventana');
      await page.locator(C + ' .ux14-seg button', {hasText: 'Total'}).click(); k = await kpis(page); near(num(k[0].value), 2071.00);
    });
    await check('Vista general vs ficha: gráficos por ámbito; zonas solo históricas rotuladas', async () => {
      await zone(page, '');
      const g = await page.$$eval(C + ' .ux14-bars figcaption', fs => fs.map(f => f.textContent)); assert.equal(g.length, 2); g.forEach(t => assert.match(t, /comparación entre zonas/));
      const rows = await page.$$eval(C + ' .ux14-zone-row', rs => rs.map(r => r.innerText.replace(/\s+/g, ' ')));
      assert.equal(rows.filter(r => /solo Histórico/.test(r)).length, 2); assert.ok(rows.some(r => /6-TRAPICHES/.test(r)) && rows.some(r => /7-ZONA TISMA/.test(r)));
      await page.locator(C + ' .ux14-zone-row[data-zone="2-Centro"]').click(); await page.waitForFunction(() => document.querySelector('.ux14-zone:not(.ux14-hist-zone)').dataset.zone === '2-Centro');
      const f = await page.$$eval(C + ' .ux14-bars figcaption', fs => fs.map(f => f.textContent)); assert.equal(f.length, 1); assert.match(f[0], /TCH por sistema · 2-Centro.*solo 2-Centro/);
      assert.ok(await page.locator(C + ' .ux14-farms tbody tr').count() >= 1);
    });
    await check('Navegación Zona → Finca → Suerte, migas y retorno', async () => {
      await zone(page, '3-Norte'); const first = page.locator(C + ' .ux14-farm-link').first(), code = (await first.textContent()).split(' · ')[0];
      await first.click(); await page.waitForFunction(c => document.querySelector(`#cronoContent .context-explorer[data-context="farm-${c}"]`), code);
      assert.equal(await page.evaluate(() => document.body.dataset.maestroView), 'cronologico');
      await page.evaluate(() => CASUR_MAESTRO_UX.activate('zonas')); await page.locator(C + ' .ux14-crumbs button', {hasText: 'Zonas'}).click();
      await page.waitForFunction(() => document.querySelector('.ux14-zone:not(.ux14-hist-zone)').dataset.zone === '');
    });
    await check('Enlaces contextuales: Estimados conserva la zona; Histórico de la zona; Análisis', async () => {
      await zone(page, '5-Productores'); await page.locator(C + ' .ux14-links button', {hasText: 'Estimados'}).click();
      await page.waitForFunction(() => { const b = document.querySelector('#cronoContent .context-explorer[data-context="general"]'); return b && b.dataset.objective === 'estimate'; });
      const st = JSON.parse(await page.getAttribute('#cronoContent .context-explorer[data-context="general"]', 'data-state')); assert.deepEqual(st.scope, [{field: 'zona', key: '5-Productores'}]);
      await page.evaluate(() => CASUR_MAESTRO_UX.activate('zonas')); await zone(page, '1-Sur'); await page.locator(C + ' .ux14-links button', {hasText: 'Histórico de la zona'}).click();
      await page.waitForFunction(() => document.querySelector('#zoneSelect')?.value === '1-ZONA SUR');
      assert.equal(await page.locator('#cronoZoneSection').isVisible(), false, 'la pestaña Histórico queda activa');
      await page.locator('#zoneMainSection .ux09-section-tabs button[data-target="cronoZoneSection"]').click(); await page.waitForSelector(C + ' .ux14-kpi', {state: 'visible'});
      await page.locator(C + ' .ux14-links button', {hasText: 'Análisis'}).click(); assert.equal(await page.evaluate(() => document.body.dataset.maestroView), 'analisis');
      assert.deepEqual(await page.evaluate(() => ({zone: CASUR_ZONE_SCOPE.zone, system: CASUR_ZONE_SCOPE.system})), {zone: '1-Sur', system: 'Total'});
      await page.evaluate(() => { CASUR_MAESTRO_UX.activate('zonas'); document.querySelector('[data-target="cronoZoneSection"]')?.click(); });
    });
    await check('Cronológico: paneles anteriores reorganizados (sin toggle, sin duplicados) y edad ponderada = indicador anterior', async () => {
      await zone(page, '1-Sur');
      assert.equal(await page.locator('.ux14-legacy-toggle').count(), 0, 'sin botón «Ver indicadores anteriores»');
      assert.equal(await page.locator('#cronoZoneContent .ux13-zone-kpis').isVisible(), false); assert.equal(await page.locator('#cronoZoneContent .crono-zone-wide').isVisible(), false);
      assert.ok(await page.locator('#cronoZoneContent .crono-box:not(.crono-zone-wide)').count() >= 5, 'composición agronómica visible');
      const strip = await page.textContent(C + ' .ux14-strip'), legacy = await page.evaluate(() => [...document.querySelectorAll('#cronoZoneContent .ux13-zone-kpis .kpi')].map(k => k.textContent.replace(/\s+/g, ' ')).find(x => /Edad pond/.test(x)));
      near(num(strip.match(/Edad ponderada\s*(\d[\d.,]*)/)[1]), num(legacy.match(/pond\.\s*(\d[\d.,]*)\s*m/)[1]), 0.006);
      const heads = await page.$$eval(C + ' .ux14-farms thead th', t => t.map(x => x.textContent)); assert.ok(heads.includes('Suertes') && heads.includes('Dist. pond. km'));
      const text = await page.textContent(C); assert.match(text, /Aforo 12-Oct-2026 · Consolidado 22-Nov-2026/);
      assert.doesNotMatch(text, /\d{4}-\d{2}-\d{2}|\b\d{2}\/\d{2}\/\d{4}\b|\d{2}-(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)-\d{4}/);
    });
    await check('Enlaces con sistema: Estimados Secano (ámbito zona + riego), Riego (desglose por riego) e Histórico con el mismo sistema', async () => {
      await zone(page, '1-Sur'); await page.locator(C + ' .ux14-seg button', {hasText: 'Secano'}).click();
      await page.locator(C + ' .ux14-links button', {hasText: 'Estimados'}).click();
      await page.waitForFunction(() => document.querySelector('#cronoContent .context-explorer[data-context="general"]')?.dataset.objective === 'estimate');
      let st = JSON.parse(await page.getAttribute('#cronoContent .context-explorer[data-context="general"]', 'data-state')); assert.deepEqual(st.scope, [{field: 'zona', key: '1-Sur'}, {field: 'tipoRiego', key: 'Secano'}]);
      const sum = JSON.parse(await page.getAttribute('#cronoContent .context-explorer[data-context="general"]', 'data-summary')); near(sum.estimateTch, 11.30); near(sum.estimateArea, 151.03, 0.01);
      await page.evaluate(() => CASUR_MAESTRO_UX.activate('zonas')); await page.locator(C + ' .ux14-seg button', {hasText: 'Riego'}).click(); await page.locator(C + ' .ux14-links button', {hasText: 'Estimados'}).click();
      await page.waitForFunction(() => JSON.parse(document.querySelector('#cronoContent .context-explorer[data-context="general"]')?.dataset.state || '{}').dimension === 'tipoRiego');
      st = JSON.parse(await page.getAttribute('#cronoContent .context-explorer[data-context="general"]', 'data-state')); assert.deepEqual(st.scope, [{field: 'zona', key: '1-Sur'}]);
      await page.evaluate(() => CASUR_MAESTRO_UX.activate('zonas')); await page.locator(C + ' .ux14-seg button', {hasText: 'Secano'}).click(); await page.locator(C + ' .ux14-links button', {hasText: 'Histórico de la zona'}).click();
      await page.waitForFunction(() => document.querySelector('.ux14-hist-zone')?.dataset.zone === '1-ZONA SUR' && document.querySelector('.ux14-hist-zone').dataset.system === 'Secano');
      await page.locator(H + ' .ux14-seg:not(.ux14-metric) button', {hasText: 'Total'}).click();
      await page.locator('#zoneMainSection .ux09-section-tabs button[data-target="cronoZoneSection"]').click(); await page.waitForFunction(() => document.querySelector('.ux14-zone:not(.ux14-hist-zone)').dataset.system === 'Total');
    });
    // ---------------- Histórico de Zona (UX14-B) ----------------
    const histTab = () => page.evaluate(() => { CASUR_MAESTRO_UX.activate('zonas'); document.querySelector('#zoneMainSection .ux09-section-tabs button[data-target="zoneAnalysisSection"]').click(); });
    const hzone = z => page.evaluate(z => { const s = document.querySelector('#zoneSelect'); s.value = z; selectZone(z); }, z).then(() => page.waitForFunction(z => document.querySelector('.ux14-hist-zone')?.dataset.zone === z, z));
    const hk = () => page.$$eval(H + ' .ux14-kpi', ks => ks.map(k => ({label: k.querySelector('.ux14-kpi-label').firstChild.textContent.trim(), value: k.querySelector('strong').firstChild.textContent.trim(), note: k.querySelector('em').textContent.trim()})));
    await check('Histórico: KPI Total = motor oficial de zonas (zoneAnalysis) en cada zona; general = Análisis (63.94 · 9,735.96 ha · 622,474 t · KATM 98.65)', async () => {
      await histTab(); await hzone('');
      let k = await hk(); assert.deepEqual(k.map(x => x.label), ['TCH Z25/26', 'Área cosechada Z25/26', 'Toneladas Z25/26', 'KATM Z25/26']);
      near(num(k[0].value), 63.94); near(num(k[1].value), 9735.96); near(num(k[2].value), 622474, 1); near(num(k[3].value), 98.65);
      for (const z of ['1-ZONA SUR', '2-ZONA CENTRO', '3-ZONA NORTE', '5-PRODUCTORES']) {
        await hzone(z); k = await hk(); const o = await page.evaluate(z => { const a = zoneAnalysis(z); return {tch: a.latest.tch, area: a.latest.area, ton: a.latest.ton, rto: a.latest.rto, hist: a.hist.tch, last3: a.last3.tch, edad: a.latest.edad, pot: a.potential}; }, z);
        near(num(k[0].value), o.tch); near(num(k[1].value), o.area, 0.01); near(num(k[2].value), o.ton, 1); near(num(k[3].value), o.rto);
        const strip = await page.textContent(H + ' .ux14-strip'); near(num(strip.match(/TCH histórico\s*([\d.,]+)/)[1]), o.hist); near(num(strip.match(/TCH últimas 3\s*([\d.,]+)/)[1]), o.last3);
        near(num(strip.match(/Edad prom\. Z\d\d\/\d\d\s*(\d[\d.,]*)/)[1]), o.edad, 0.006); near(num(strip.match(/Potencial\s*([\d.,]+)/)[1]), o.pot, 1);
        assert.equal(await page.locator('#zoneContent .zone-report > .kpis').isVisible(), false, 'fila anterior de 8 KPI reemplazada');
        assert.ok(await page.locator('#zoneContent .zone-report .delta-grid').isVisible(), 'diagnóstico oficial conservado');
      }
    });
    await check('Histórico: Riego + Secano + Ventana + Sin dato = Total (área y toneladas Z25/26) y tendencia Total = motor oficial', async () => {
      for (const z of ['', '1-ZONA SUR', '2-ZONA CENTRO', '3-ZONA NORTE', '5-PRODUCTORES']) {
        const r = await page.evaluate(z => { const T = CASUR_ZONE_UX14.histFigures(z, 'Total'), parts = ['Riego', 'Secano', 'Ventana', 'Sin dato'].map(s => T.latestBySystem[s]);
          const off = z ? zoneAnalysis(z).trend : null; return {area: T.latest.area, ton: T.latest.ton, sa: parts.reduce((n, x) => n + x.area, 0), st: parts.reduce((n, x) => n + x.ton, 0), trend: T.official.map(x => [x.zafra, +x.area.toFixed(2), x.tch]), off: off && off.map(x => [x.zafra, x.area, x.tch])}; }, z);
        near(r.sa, r.area, 0.01); near(r.st, r.ton, 0.5);
        if (r.off) r.off.forEach(([zf, a, t], i) => { assert.equal(r.trend[i][0], zf); near(r.trend[i][1], a, 0.02); if (t != null) near(r.trend[i][2], t, 0.006); });
      }
    });
    await check('Histórico: selector Total/Riego/Secano con nota de riego actual; tendencia con series diferenciadas; ranking y comparación por sistema', async () => {
      await hzone('1-ZONA SUR'); assert.match(await page.textContent(H), /según el sistema de riego actual del lote/);
      await page.locator(H + ' .ux14-seg:not(.ux14-metric) button', {hasText: 'Secano'}).click(); let k = await hk();
      const sec = await page.evaluate(() => CASUR_ZONE_UX14.histFigures('1-ZONA SUR', 'Secano').latest); near(num(k[0].value), sec.tch); near(num(k[1].value), sec.area, 0.01);
      assert.equal(await page.getAttribute(C, 'data-system'), 'Secano', 'el sistema se comparte con el Cronológico');
      await page.locator(H + ' .ux14-seg:not(.ux14-metric) button', {hasText: 'Total'}).click();
      const series = await page.$$eval(H + ' .ux14-lines path', ps => ps.map(p => p.dataset.series)); assert.deepEqual(series.slice(0, 3), ['Total', 'Riego', 'Secano']);
      for (const m of ['Área cosechada', 'Toneladas', 'KATM', 'TCH']) { await page.locator(H + ' .ux14-metric button', {hasText: m}).click(); assert.match(await page.textContent(H + ' .ux14-lines figcaption'), new RegExp(m)); }
      assert.ok(await page.locator(H + ' .ux14-ranking tbody tr').count() >= 5); await page.selectOption(H + ' .ux14-sort select', 'delta');
      const deltas = await page.$$eval(H + ' .ux14-ranking tbody td:last-child', ts => ts.map(t => t.textContent).filter(t => t !== '—').map(t => Number(t.replace(/[^\d.-]/g, ''))));
      assert.deepEqual(deltas, [...deltas].sort((a, b) => b - a), 'orden por Δ vs histórico');
      assert.match((await page.$$eval(H + ' .ux14-bars figcaption', f => f.map(x => x.textContent))).join(), /solo 1-ZONA SUR/);
    });
    await check('Histórico: zonas solo históricas (6-TRAPICHES, 7-ZONA TISMA) con su última zafra y Total oficial', async () => {
      await hzone(''); const rows = await page.$$eval(H + ' .ux14-zone-row', rs => rs.map(r => r.innerText.replace(/\s+/g, ' ')));
      assert.ok(rows.some(r => /6-TRAPICHES.*solo Histórico/.test(r)) && rows.some(r => /7-ZONA TISMA.*solo Histórico/.test(r)));
      await page.locator(H + ' .ux14-seg:not(.ux14-metric) button', {hasText: 'Secano'}).click(); await hzone('6-TRAPICHES');
      const k = await hk(), o = await page.evaluate(() => { const t = zoneAnalysis('6-TRAPICHES').trend; return t[t.length - 1]; });
      assert.equal(await page.getAttribute(H, 'data-system'), 'Total'); assert.match(k[0].label, /Z19\/20/); near(num(k[0].value), o.tch); near(num(k[1].value), o.area, 0.01);
      assert.match(await page.textContent(H), /Zona solo histórica/); assert.equal(await page.locator(H + ' .ux14-seg:not(.ux14-metric)').count(), 0);
      assert.ok(await page.locator(H + ' .ux14-ranking tbody tr').count() >= 1); assert.equal(await page.evaluate(() => CASUR_ZONE_SCOPE.system), 'Secano', 'el filtro del usuario se conserva para otras zonas');
      await hzone('1-ZONA SUR'); assert.equal(await page.getAttribute(H, 'data-system'), 'Secano');
      await page.locator(H + ' .ux14-seg:not(.ux14-metric) button', {hasText: 'Total'}).click();
    });
    await check('Histórico: Zona → Finca (ficha histórica) y retorno contextual a la misma zona, pestaña y sistema', async () => {
      await hzone('2-ZONA CENTRO'); await page.locator(H + ' .ux14-seg:not(.ux14-metric) button', {hasText: 'Riego'}).click();
      await page.locator(H + ' .ux14-farm-link').first().click(); await page.waitForFunction(() => document.body.dataset.maestroView === 'historico');
      await page.locator('#fichaSection .ux14-return').click(); await page.waitForFunction(() => document.body.dataset.maestroView === 'zonas');
      assert.equal(await page.locator('#zoneAnalysisSection').isVisible(), true); assert.equal(await page.getAttribute(H, 'data-zone'), '2-ZONA CENTRO'); assert.equal(await page.getAttribute(H, 'data-system'), 'Riego');
      await page.locator(H + ' .ux14-links button', {hasText: 'Cronológico de la zona'}).click(); await page.waitForFunction(() => document.querySelector('.ux14-zone:not(.ux14-hist-zone)')?.dataset.zone === '2-Centro');
      assert.equal(await page.getAttribute(C, 'data-system'), 'Riego');
      await page.locator(C + ' .ux14-farm-link').first().click(); await page.waitForFunction(() => document.body.dataset.maestroView === 'cronologico');
      await page.locator('#cronoSection .ux14-return').click(); await page.waitForFunction(() => document.body.dataset.maestroView === 'zonas'); assert.equal(await page.getAttribute(C, 'data-zone'), '2-Centro');
      await page.locator(C + ' .ux14-seg button', {hasText: 'Total'}).click();
      assert.deepEqual(page.errors, []);
    });
    await ctx.close();
    for (const width of [360, 390, 768, 1280, 1536]) await check(`[${width}] Cronológico e Histórico sin desbordamiento, cuatro KPI y sin errores`, async () => {
      const {ctx, page} = await open(browser, width);
      for (const z of ['', '1-Sur', '3-Norte']) { await zone(page, z); await page.waitForTimeout(200);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `desborde en ${z || 'general'}`);
        assert.equal(await page.locator(C + ' .ux14-kpi').count(), 4);
        if (out) await page.locator(C).screenshot({path: path.join(out, `ux14-${width}-${z || 'general'}.png`)}); }
      await page.evaluate(() => document.querySelector('#zoneMainSection .ux09-section-tabs button[data-target="zoneAnalysisSection"]').click());
      for (const z of ['', '1-ZONA SUR', '7-ZONA TISMA']) { await page.evaluate(z => { const s = document.querySelector('#zoneSelect'); s.value = z; selectZone(z); }, z); await page.waitForFunction(z => document.querySelector('.ux14-hist-zone')?.dataset.zone === z, z); await page.waitForTimeout(200);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `desborde histórico ${z || 'general'}`); assert.equal(await page.locator(H + ' .ux14-kpi').count(), 4);
        if (out) await page.locator(H).screenshot({path: path.join(out, `ux14-hist-${width}-${z || 'general'}.png`)}); }
      assert.deepEqual(page.errors, []); await ctx.close();
    });
  } finally {
    await browser.close();
    const pass = results.filter(r => r[0] === 'PASS').length;
    if (out) fs.writeFileSync(path.join(out, 'qa-maestro-ux14.json'), JSON.stringify(results, null, 1));
    console.log(`${pass}/${results.length} ${pass === results.length ? 'PASS' : 'FAIL'}`); if (pass !== results.length) process.exitCode = 1;
  }
})();
