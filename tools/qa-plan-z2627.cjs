// Plan de Cosecha Z26/27 (Issue #67) — QA de datos, conciliación y presentación sobre la generación 1102.
// Uso: node tools/qa-plan-z2627.cjs BASE [EVIDENCIA_DIR] [CONSOLIDADO.xlsx]
// Con CONSOLIDADO verifica las 100 haciendas contra la hoja «POR HACIENDA». Solo lectura.
const {chromium} = require('playwright'), assert = require('assert/strict'), fs = require('fs'), path = require('path');
const [base, out, consolidado] = process.argv.slice(2);
if (!base) throw Error('Usage: node tools/qa-plan-z2627.cjs BASE [OUT] [CONSOLIDADO.xlsx]');
if (out) fs.mkdirSync(out, {recursive: true});
const results = [];
// Each check is bounded (a hung step fails instead of blocking the run) and reported as soon as it ends.
const check = (name, fn, ms = 180000) => { let timer; return Promise.race([fn(), new Promise((_, ko) => { timer = setTimeout(() => ko(Error('timeout ' + ms + ' ms')), ms); })])
  .then(() => ['PASS', name], e => ['FAIL', name, e.message.split('\n').slice(0, 6).join(' ')]).then(r => { clearTimeout(timer); results.push(r); console.log(r.join(' · ')); }); };
const near = (a, b, e = 0.005) => assert.ok(Math.abs(Number(a) - Number(b)) < e, `${a} ≠ ${b}`);
async function open(browser, width, extra = {}) {
  const mobile = width < 700;
  const ctx = await browser.newContext({viewport: {width, height: mobile ? 800 : 900}, isMobile: mobile, hasTouch: mobile, acceptDownloads: true, ...extra});
  const page = await ctx.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  await page.goto(base + 'modules/produccion/');
  await page.waitForFunction(() => window.CASUR_PRODUCTION_READY && window.CASUR_MAESTRO_UX, null, {timeout: 60000});
  return {ctx, page};
}
const lot = (page, code, suerte) => page.evaluate(([c, s]) => { CASUR_MAESTRO_UX.activate('cronologico'); selectCronoSuerteSuggestion(c, s); }, [code, suerte]).then(() => page.waitForSelector('.ux13-lot-history svg'));
(async () => {
  const browser = await chromium.launch();
  try {
    // ---------------- Datos y conciliación (motor de la app) ----------------
    const {ctx, page} = await open(browser, 1280);
    const D = await page.evaluate(() => {
      const all = CRONO_DATA.producers.flatMap(p => p.details), E = CASUR_CRONO_PARTICIPATION, O = CASUR_OPERATIONAL_IMPORT, s = E.summary(all), get = k => all.find(r => r.codLote === k);
      const by = f => all.reduce((m, r) => { const k = f(r); m[k] = (m[k] || 0) + 1; return m; }, {});
      const milling = all.filter(r => O.participation(r).milling);
      return {meta: CRONO_DATA.meta, operational: CRONO_DATA.operational, s, producers: CRONO_DATA.producers.length, catalog: all.length,
        states: by(r => r.sourcePresence === 'absent' ? 'Catálogo' : r.classification), inactiveArea: all.filter(r => !O.participation(r).active).reduce((n, r) => n + O.participation(r).activeArea, 0),
        cuts: milling.reduce((m, r) => { m[r.plan?.cut] = (m[r.plan?.cut] || 0) + 1; return m; }, {}), millingWithDate: milling.filter(r => E.referenceDate(r).date).length,
        optimistic: all.filter(r => r.forecastOptimistic).reduce((n, r) => n + r.forecastOptimistic.tons, 0),
        lots: Object.fromEntries(['603', '603A', '604', '607', '2003', '12503', '75906', '90806', '90809', '90810', '90815', '90816', '99324A', '99325', '91001', '91001A', '902A'].map(k => { const r = get(k), p = O.participation(r), ref = E.referenceDate(r); return [k, {cls: r.classification, presence: r.sourcePresence, corte: r.corte, fSiembra: r.fSiembra || null, fUltCte: r.fUltCte || null, fBase: r.fBase || null, active: p.activeArea, milling: p.millingArea, tons: p.estimatedTons, tch: r.tchEst2627, plan: ref.date, cut: ref.cutType || null, destino: r.destino, riego: r.tipoRiego, area: r.inventoryArea, opt: r.forecastOptimistic?.tons ?? null}]; })),
        farms: Object.fromEntries(CRONO_DATA.producers.map(p => { const x = E.summary(p.details); return [String(p.code), {active: p.details.reduce((n, r) => n + O.participation(r).activeArea, 0), milling: x.millingArea, seed: x.seedArea, tons: x.estimateTons || 0, ml: x.millingLots, sl: x.seedLots}]; }))};
    });
    await check('Generación 2026.11.22-aforo.1102 aplicada como aforo autorizado', async () => {
      assert.equal(D.meta.dataVersion, '2026.11.22-aforo.1102'); assert.equal(D.meta.sheet, 'AFORO_26-27'); assert.equal(D.meta.harvestPlanLabel, 'Fecha para cosecha 26/27');
      assert.equal(D.s.estimateState, 'applied'); assert.equal(D.meta.sourceSha256, '2e3cfedb0682024753f7dca7f484326641e281bf018de44f823052369dfada60');
    });
    await check('Totales oficiales: 9,574.66 activa = 9,101.68 Molienda + 472.98 Semilla; 561,658.27 t; TCH 61.71', async () => {
      near(D.s.millingArea, 9101.68); near(D.s.seedArea, 472.98); near(D.s.millingArea + D.s.seedArea, 9574.66); near(D.s.estimateTons, 561658.27); near(D.s.estimateTch, 61.71);
      assert.equal(D.s.millingLots, 946); assert.equal(D.s.seedLots, 49); assert.equal(D.s.estimateLots, 946); near(D.s.pendingMillingArea, 0);
    });
    await check('1,053 identidades y 100 haciendas; 58 fuera de producción visibles sin aportar área', async () => {
      assert.equal(D.catalog, 1053); assert.equal(D.producers, 100);
      assert.deepEqual(D.states, {Molienda: 946, Semilla: 49, 'Sin Caña': 34, 'Baja rentabilidad': 15, 'Investigación': 2, Catálogo: 7});
      near(D.inactiveArea, 0);
    });
    await check('Investigación 910/01 y 01A y catálogo 902A: en catálogo, 0 ha activa, sin toneladas ni fecha', async () => {
      for (const k of ['91001', '91001A']) { const r = D.lots[k]; assert.equal(r.cls, 'Investigación'); assert.ok(r.area > 0); near(r.active, 0); assert.equal(r.tons, null); assert.equal(r.plan, null); }
      const c = D.lots['902A']; assert.equal(c.presence, 'absent'); near(c.active, 0); assert.equal(c.tons, null);
    });
    await check('Plan BE/BF: 946 Molienda con fecha y corte; 787 mecánicas y 159 manuales', async () => {
      assert.equal(D.millingWithDate, 946); assert.deepEqual(D.cuts, {'CORTE MECANICO': 787, MANUAL: 159});
    });
    await check('Escenario optimista AF/AG: 597,888.40 t solo Molienda, separado del oficial; 3 AF<AD', async () => {
      near(D.optimistic, 597888.40); near(D.meta.optimisticScenario.tch, 65.6899, 0.0001);
      assert.deepEqual(D.operational.optimisticBelowOfficial.map(x => x.key).sort(), ['12504', '1427', '99319']);
      for (const k of ['90809', '75906', '91001']) assert.equal(D.lots[k].opt, null, k);
    });
    await check('Freddy Sovalvarro: NC 10 en 6/03, 03A, 04; últimos cortes; alerta 6/04 a 3.55 meses', async () => {
      const L = D.lots; assert.equal(L['603'].corte, '10'); assert.equal(L['603A'].corte, '10'); assert.equal(L['604'].corte, '10'); assert.equal(L['607'].corte, '12');
      assert.equal(L['603'].fUltCte, '2026-09-07'); assert.equal(L['603A'].fUltCte, '2026-06-10'); assert.equal(L['604'].fUltCte, '2026-09-07'); assert.equal(L['607'].fUltCte, '2026-04-11');
      assert.equal(L['604'].plan, '2026-12-24'); assert.deepEqual(D.operational.planAlerts.map(a => [a.key, a.months]), [['604', 3.55]]);
    });
    await check('San Lucas 20/03: Molienda 90 TCH / 985.50 t', async () => { const r = D.lots['2003']; assert.equal(r.cls, 'Molienda'); assert.equal(r.tch, 90); near(r.tons, 985.5); });
    await check('AIDOSA 908/09, 10, 15: Semilla, sin estimado de molienda; 908/06 y 16 con siembra nueva', async () => {
      for (const k of ['90809', '90810', '90815']) { const r = D.lots[k]; assert.equal(r.cls, 'Semilla'); near(r.milling, 0); assert.equal(r.tons, null); assert.equal(r.destino, 'Semilla'); }
      assert.equal(D.lots['90806'].fSiembra, '2026-05-28'); assert.equal(D.lots['90816'].fSiembra, '2026-07-30');
    });
    await check('125/03 Molienda con siembra 01-jul-2026 (base del ciclo), riego Secano sin cambio', async () => {
      const r = D.lots['12503']; assert.equal(r.cls, 'Molienda'); near(r.area, 10.48); assert.equal(r.fSiembra, '2026-07-01'); assert.equal(r.fBase, '2026-07-01'); assert.equal(r.riego, 'Secano');
    });
    await check('759/06 Semilla NC 1 con siembra 20-ago-2026; Pansaco 993/24A y 25 siembra nueva', async () => {
      const r = D.lots['75906']; assert.equal(r.cls, 'Semilla'); assert.equal(r.corte, '1'); assert.equal(r.fSiembra, '2026-08-20'); assert.equal(r.fBase, '2026-08-20');
      assert.equal(D.lots['99324A'].fSiembra, '2026-07-23'); assert.equal(D.lots['99325'].fSiembra, '2026-07-31');
    });
    if (consolidado) await check('100 haciendas = hoja «POR HACIENDA» del consolidado (área activa, molienda, semilla, t, suertes)', async () => {
      const xlsx = await page.evaluate(async b64 => { if (!window.XLSX) await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'vendor/xlsx.bundle.js'; s.onload = ok; s.onerror = ko; document.head.append(s); });
        const wb = XLSX.read(Uint8Array.from(atob(b64), c => c.charCodeAt(0)), {type: 'array'}); return XLSX.utils.sheet_to_json(wb.Sheets['POR HACIENDA'], {header: 1, raw: true, defval: null}); }, fs.readFileSync(consolidado).toString('base64'));
      const hi = xlsx.findIndex(r => r.includes('Área activa ha')), H = xlsx[hi], rows = xlsx.slice(hi + 1).filter(r => r[0] != null && /^\d+$/.test(String(r[0]).trim()));
      assert.equal(rows.length, 100);
      for (const r of rows) { const f = D.farms[String(r[0]).trim()], g = n => r[H.indexOf(n)]; assert.ok(f, 'finca ' + r[0]);
        near(f.active, g('Área activa ha'), 0.01); near(f.milling, g('Área molienda ha'), 0.01); near(f.seed, g('Área semilla ha'), 0.01); near(f.tons, g('t oficial'), 0.01);
        assert.equal(f.ml, g('Suertes molienda'), 'ML ' + r[0]); assert.equal(f.sl, g('Suertes semilla'), 'SL ' + r[0]); }
    });
    await check('Riego y Secano por zona suman el área activa (5-Productores)', async () => {
      await page.evaluate(() => { CASUR_MAESTRO_UX.activate('zonas'); document.querySelector('#cronoZoneSelect').value = '5-Productores'; selectCronoZone('5-Productores'); });
      const k = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#cronoZoneContent .kpis .kpi')].map(n => [n.querySelector('.label').textContent.trim(), Number(n.querySelector('strong').textContent.replace(/[^\d.]/g, ''))])));
      near(k['Área con riego'] + k['Secano'], k['Área activa'], 0.05);
    });
    await check('PWA: la generación 1102 se abre sin conexión desde la app tras la primera visita', async () => {
      // Real flow: the shell prepares the verified Producción bundle when the module is opened from the app.
      const frameVersion = async pg => { for (let i = 0; i < 120; i++) { const f = pg.frames().find(f => /modules\/produccion\//.test(f.url()));
        if (f) { try { const v = await f.evaluate(() => window.CASUR_PRODUCTION_READY && window.CRONO_DATA?.meta?.dataVersion); if (v) return v; } catch {} } await pg.waitForTimeout(500); } return null; };
      const shell = await ctx.newPage(); await shell.goto(base + '#/modulo/produccion');
      await shell.waitForFunction(() => !!navigator.serviceWorker?.controller, null, {timeout: 90000});
      assert.equal(await frameVersion(shell), '2026.11.22-aforo.1102'); await shell.waitForTimeout(3000);
      await ctx.setOffline(true);
      try { const off = await ctx.newPage(); await off.goto(base + '#/modulo/produccion', {timeout: 60000}); assert.equal(await frameVersion(off), '2026.11.22-aforo.1102'); await off.close(); }
      finally { await ctx.setOffline(false); await shell.close(); }
    }, 300000);
    await ctx.close();
    // ---------------- Presentación en 5 anchos ----------------
    for (const width of [360, 390, 768, 1280, 1536]) {
      const W = `[${width}]`, {ctx, page} = await open(browser, width), mobile = width < 768;
      const noHScroll = async l => { const [sw, iw] = await page.evaluate(() => [document.scrollingElement.scrollWidth, innerWidth]); assert.ok(sw <= iw + 1, `${l}: ${sw}>${iw}`); };
      await check(W + ' KPI «Fecha para cosecha 26/27» con BE y alerta de programación (6/04)', async () => {
        await lot(page, '6', '04'); await page.waitForSelector('.casur-proposal-kpi');
        const t = await page.locator('.casur-proposal-kpi').innerText();
        assert.match(t, /^Fecha para cosecha 26\/27/); assert.match(t, /24-dic-2026/); assert.match(t, /Manual/); assert.match(t, /Revisar con Programación: 3\.55 meses desde 07-sep-2026/);
        await noHScroll('6/04');
      });
      await check(W + ' Ficha de suerte separa F. siembra y F. último corte de la fecha programada', async () => {
        await lot(page, '759', '06');
        const facts = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.ux13-cycle-date')].map(n => [n.querySelector('dt').textContent, n.querySelector('dd').textContent])));
        assert.equal(facts['F. siembra'], '20-ago-2026'); assert.ok('F. último corte' in facts);
        assert.doesNotMatch(await page.locator('.casur-proposal-kpi').innerText(), /\d{2}-[a-z]{3}-\d{4}/, 'Semilla sin fecha de cosecha de molienda');
      });
      await check(W + ' Estimados: escenario optimista cerrado por defecto y separado del aforo oficial', async () => {
        await page.evaluate(() => { CASUR_MAESTRO_UX.activate('cronologico'); renderCronoHome(); });
        await page.locator('#cronoContent .ux05-primary button', {hasText: 'Estimados'}).click();
        const box = page.locator('#cronoContent .ux13-optimistic');
        assert.equal(await box.evaluate(d => d.open), false);
        const official = await page.locator('#cronoContent .ux09-forecast-stats').first().innerText();
        assert.match(official, /561,658\.27 t/); assert.doesNotMatch(official, /597,888/);
        await box.locator('summary').click();
        const t = await box.innerText(); assert.match(t, /597,888\.40 t/); assert.match(t, /65\.69 t\/ha/); assert.match(t, /\+36,230\.13 t/); assert.match(t, /No sustituye el aforo oficial/);
        await noHScroll('optimista');
      });
      await check(W + ' AIDOSA Estimados → Destino: Semilla «No aplica» incluye 09/10/15; molienda = motor', async () => {
        await page.evaluate(() => renderCronoProducer('908')); const ex = '#cronoContent .context-explorer[data-context="farm-908"]'; await page.waitForSelector(ex);
        await page.evaluate(ex => { const b = document.querySelector(ex); b.setObjective('estimate'); const s = b.querySelector('.ux05-dimension-select'); s.value = 'destino'; s.dispatchEvent(new Event('change')); }, ex);
        const seed = await page.locator(ex + ' tbody tr[data-status=na]').innerText(); assert.match(seed, /No aplica/);
        const truth = await page.evaluate(() => CASUR_CRONO_PARTICIPATION.summary(CRONO_DATA.producers.find(p => String(p.code) === '908').details));
        assert.match(seed, new RegExp(truth.seedArea.toFixed(2).replace('.', '\\.') + ' ha activas · ' + truth.seedLots + ' suertes'));
        assert.equal(Number((await page.locator(ex + ' tfoot .ux05-value').innerText()).replace(/[^\d.]/g, '')), truth.estimateTch);
      });
      await check(W + ' Suertes inactivas visibles en el directorio de la finca (El Salitre y Miramar)', async () => {
        for (const [code, lotId] of [['910', '91001'], ['63', '6302']]) {
          await page.evaluate(c => renderCronoProducer(c), code); const ex = `#cronoContent .context-explorer[data-context="farm-${code}"]`;
          if (!(await page.locator(ex).count())) { assert.ok(await page.locator('#cronoContent').innerText(), 'ficha ' + code); continue; }
          await page.locator(ex + ' .ux05-primary button', {hasText: 'Suertes'}).click();
          await page.locator(ex + ' .context-directory input').fill(lotId.slice(-2));
          assert.match(await page.locator(ex + ' .context-directory .context-results').innerText(), new RegExp('Suerte ' + lotId));
        }
      });
      if (width === 1280) await check(W + ' Exportar PDF y PNG de la finca con datos 1102', async () => {
        await page.evaluate(() => renderCronoProducer('993')); await page.waitForSelector('#cronoContent .ficha-band .context-report-trigger', {timeout: 30000});
        const trigger = page.locator('#cronoContent .context-report-trigger'), menu = page.locator('#cronoContent .context-report-menu');
        for (const kind of ['image', 'pdf']) { await trigger.click(); await menu.waitFor({state: 'visible'}); const [d] = await Promise.all([page.waitForEvent('download', {timeout: 120000}), menu.locator('.' + kind).click()]);
          const bytes = fs.readFileSync(await d.path()); assert.ok(kind === 'pdf' ? bytes.subarray(0, 4).toString() === '%PDF' : bytes.subarray(1, 4).toString() === 'PNG');
          if (out) fs.copyFileSync(await d.path(), path.join(out, 'export-993.' + (kind === 'pdf' ? 'pdf' : 'png')));
          await page.waitForFunction(() => !document.body.classList.contains('print-export'), null, {timeout: 60000}); }
      });
      await check(W + ' GIS: mapa de la finca desde el Cronológico', async () => {
        await page.evaluate(() => renderCronoProducer('993')); await page.waitForSelector('#cronoContent .ux13-band-action');
        await page.locator('#cronoContent .ux13-band-action', {hasText: 'Mapa'}).click();
        await page.waitForSelector('#maestroFarmMap.leaflet-container, #maestroFarmMap .leaflet-pane', {timeout: 20000});
      });
      await check(W + ' Sin errores de página', async () => assert.deepEqual(page.errors, []));
      if (out && [390, 1280].includes(width)) { await lot(page, '6', '04'); await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({path: path.join(out, `qa-${width}-suerte-604.png`), fullPage: true}); }
      await ctx.close();
    }
  } finally { await browser.close(); }
  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} PASS`);
  if (out) fs.writeFileSync(path.join(out, 'qa-plan-z2627.json'), JSON.stringify(results, null, 1));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
