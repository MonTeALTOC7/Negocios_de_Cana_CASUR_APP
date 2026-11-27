// QA de informes R3 (motor de informes): Cronológico múltiple, Histórico multifinca ejecutivo y completo, Cronológico y
// Histórico de Zona. Botones reales, PC y Android; selecciones completas y parciales; «Todas las zonas»; sin conexión.
// Verifica norma editorial (tools/qa-informes-norma.cjs), paridad con los datos de la pantalla/motores, integridad de
// registros, nombres de archivo, texto seleccionable, fuentes, márgenes, paginación y límites PNG.
// Uso: node tools/qa-informes-r3.cjs BASE OUT_DIR   (requiere pdftotext, pdfinfo, pdffonts, pdfimages y pdftoppm)
const {editorial} = require('./qa-informes-norma.cjs'), {chromium, devices} = require('playwright'), assert = require('assert/strict'), fs = require('fs'), path = require('path'), {execFileSync} = require('child_process');
const [base, out] = process.argv.slice(2); if (!base || !out) throw Error('Usage: node tools/qa-informes-r3.cjs BASE OUT_DIR');
fs.mkdirSync(out, {recursive: true});
const results = [], check = (name, fn, ms = 400000) => { let t; return Promise.race([fn(), new Promise((_, ko) => { t = setTimeout(() => ko(Error('timeout')), ms); })]).then(() => ['PASS', name], e => ['FAIL', name, e.message.split('\n').slice(0, 4).join(' ')]).then(r => { clearTimeout(t); results.push(r); console.log(r.join(' · ')); }); };
const pdf = f => ({text: execFileSync('pdftotext', ['-layout', f, '-'], {encoding: 'utf8', maxBuffer: 64e6}), info: execFileSync('pdfinfo', ['-l', '99', f], {encoding: 'utf8'}),
  fonts: execFileSync('pdffonts', [f], {encoding: 'utf8'}).split('\n').slice(2).filter(Boolean), images: execFileSync('pdfimages', ['-list', f], {encoding: 'utf8'}).split('\n').slice(2).filter(Boolean)});
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), f2 = v => v == null ? '—' : Number(v).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}), f0 = v => Number(v).toLocaleString('en-US', {maximumFractionDigits: 0});
const CRONO = `CASUR_MAESTRO_UX.activate('cronologico');document.querySelector('#cronoSection').open=true;clearCronoMultiSelection&&clearCronoMultiSelection();`;
const HIST = `CASUR_MAESTRO_UX.activate('historico');document.getElementById('fichaSection').open=true;clearHistoricoSelection();toggleHistoricoMultiSelection();`;
const ZC = z => `CASUR_MAESTRO_UX.activate('zonas');||WAIT||document.querySelector('#zoneMainSection .ux09-section-tabs button[data-target="cronoZoneSection"]').click();const s=document.querySelector('#cronoZoneSelect');s.value='${z}';selectCronoZone('${z}');`;
const ZH = z => `CASUR_MAESTRO_UX.activate('zonas');||WAIT||document.querySelector('#zoneMainSection .ux09-section-tabs button[data-target="zoneAnalysisSection"]').click();const s=document.querySelector('#zoneSelect');s.value='${z}';selectZone('${z}');`;
// [nombre, tipo, variante, preparación, archivo esperado (sin fecha)]
const SCEN = [
  ['crono-multiple', 'cronologico-multiple', null, CRONO + `toggleCronoSuerteSelection('993::36',true);toggleCronoSuerteSelection('19::27',true);toggleCronoSuerteSelection('20::03',true);renderCronoMultiSummary();`, 'Cronologico_Multifinca'],
  ['crono-multiple-parcial', 'cronologico-multiple', null, CRONO + `toggleCronoSuerteSelection('993::01',true);toggleCronoSuerteSelection('993::02A',true);toggleCronoSuerteSelection('993::41',true);renderCronoMultiSummary();`, 'Cronologico_Multifinca'],
  ['hist-multi-ejecutivo', 'historico-multiple', 'executive', HIST + `addHistoricoMultiFarm('993');addHistoricoMultiFarm('2');renderHistoricoMultiSummary();`, 'Historico_Multifinca_Ejecutivo'],
  ['hist-multi-completo', 'historico-multiple', 'complete', '', 'Historico_Multifinca_Completo'],
  ['hist-multi-parcial', 'historico-multiple', 'complete', HIST + `toggleHistoricoSuerteSelection('99301',true);toggleHistoricoSuerteSelection('99302',true);toggleHistoricoSuerteSelection('99309',true);addHistoricoMultiFarm('2');renderHistoricoMultiSummary();`, 'Historico_Multifinca_Completo'],
  ['zona-crono-centro', 'zona', null, ZC('2-Centro'), 'Cronologico_Zona_Centro'],
  ['zona-crono-todas', 'zona', null, ZC(''), 'Cronologico_Zona_Todas'],
  ['zona-hist-centro', 'zona-historico', null, ZH('2-ZONA CENTRO'), 'Historico_Zona_Centro'],
];
async function exportOne(page, dir, name, kind, variant, type) {
  const sel = `[data-casur-export-kind="${kind}"] .casur-visual-action.${type}` + (type === 'pdf' && variant ? `[data-pdf-variant="${variant}"]` : '');
  await page.waitForTimeout(600); await page.waitForSelector(sel, {state: 'attached', timeout: 20000});
  const [dl] = await Promise.all([page.waitForEvent('download', {timeout: 180000}), page.evaluate(s => document.querySelector(s).click(), sel)]);
  const file = path.join(dir, name + (type === 'pdf' ? '.pdf' : '.png')); await dl.saveAs(file);
  return {file, name: dl.suggestedFilename(), last: await page.evaluate(() => window.CASUR_REPORTS?.last)};
}
(async () => {
  const browser = await chromium.launch(), report = {};
  for (const [device, opts] of [['pc', {viewport: {width: 1366, height: 900}}], ['android', {...devices['Pixel 7']}]]) {
    const dir = path.join(out, device); fs.mkdirSync(dir, {recursive: true});
    const ctx = await browser.newContext({...opts, acceptDownloads: true}), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => { errors.push('dialog: ' + d.message()); d.dismiss(); });
    await page.goto(base + 'modules/produccion/'); await page.waitForFunction(() => window.CASUR_PRODUCTION_READY && window.CASUR_VISUAL_EXPORT && window.CASUR_ZONE_UX14, null, {timeout: 60000});
    const today = await page.evaluate(() => CASUR_CRONO_PARTICIPATION.formatDate(new Date().toLocaleDateString('sv-SE'))), R = report[device] = {};
    for (const [name, kind, variant, setup, fname] of SCEN) {
      if (setup) for (const step of setup.split('||WAIT||')) { await page.evaluate(new Function(step)); await page.waitForTimeout(1500); }
      // Datos de referencia de la pantalla y de los motores en el mismo momento de la exportación.
      const ref = await page.evaluate(([kind]) => {
        const P = window.CASUR_CRONO_PARTICIPATION, O = window.CASUR_OPERATIONAL_IMPORT, L = APP_DATA.lotCompact, z = APP_DATA.meta.latestZafra;
        if (kind === 'cronologico-multiple') { const keys = CASUR_CRONO_SELECTION.capture().keys, rows = keys.map(k => { const [c, s] = k.split('::'); return CRONO_DATA.producers.find(p => String(p.code) === c).details.find(r => String(r.suerte) === s); }), S = P.summary(rows);
          let t = 0, a = 0; rows.forEach(r => { const l = L.find(x => String(x[0]) === String(r.codLote)), y = l && l[11].find(q => q[0] === z); if (y) { t += y[2]; a += y[1]; } });
          return {keys, area: S.inventoryArea, est: S.estimateTch, tons: S.estimateTons, tchAnt: a ? t / a : null, lots: rows.map(r => ({code: r.codLote, suerte: r.suerte, farm: r.code, tchEst: r.tchEst2627, active: O.participation(r).activeArea})),
            screen: [...document.querySelectorAll('.crono-multi-kpis .kpi')].map(k => [k.querySelector('.label').textContent.trim(), k.querySelector('strong').textContent.trim()])}; }
        if (kind === 'historico-multiple') { const S = getHistoricoDualSummary(), Rr = historicoMultiReportCharts();
          return {sel: S.selection.map(f => ({code: f.farmCode, name: f.farmName, mode: f.mode, lots: f.lotIds.length})), period: S.period, full: S.full.tch, series: S.series.map(x => ({zafra: x.zafra, tch: x.tch, katm: x.katm, area: x.area})), farms: S.analysis.farms.map(f => ({name: f.farmName, tch: f.tch, area: f.area, katm: f.katm})),
            rows: Rr.rows.filter(x => S.selection.some(f => String(f.farmCode) === String(x.farmCode) && f.lotIds.map(String).includes(String(x.lotId)))).map(x => [x.farmCode, x.lotId, x.zafra, x.area, x.ton])}; }
        const root = document.querySelector(kind === 'zona' ? '.ux14-zone:not(.ux14-hist-zone)' : '.ux14-hist-zone'), zone = root.dataset.zone || '';
        const out = {zone, kpis: [...root.querySelectorAll('.ux14-kpis .ux14-kpi strong')].map(s => s.firstChild.textContent.trim()), strip: [...root.querySelectorAll('.ux14-strip-item b')].map(b => b.textContent.trim()), compare: [...root.querySelectorAll('figure.ux14-compare .ux14-group')].map(g => [g.querySelector('b').textContent.trim(), ...[...g.querySelectorAll('.ux14-bar em')].map(e => e.textContent.split(' · ')[0])])};
        if (kind === 'zona') { const rows = CRONO_DATA.producers.flatMap(p => p.details).filter(r => !zone || r.zona === zone); out.groups = Object.fromEntries(['variedad', 'tipoRiego', 'corte', 'destino'].map(f => [f, P.agronomicGroups(rows, f).map(g => [g.key, g.area])])); out.farms = CASUR_ZONE_UX14.figures(zone).crono.inventoryArea; }
        else { const H = CASUR_ZONE_UX14.histFigures(zone, 'Total'); out.official = H.official.map(x => [x.zafra, x.area, x.ton, x.tch, x.katm]); out.hist = H.hist; }
        return out; }, [kind]);
      const pdfX = await exportOne(page, dir, name, kind, variant, 'pdf'), pngX = variant === 'complete' ? null : await exportOne(page, dir, name, kind, variant, 'image');
      R[name] = {kind, variant, fname, ref, pdf: pdfX, png: pngX, today};
    }
    for (const [name] of SCEN) await check(`[${device}] ${name}: PDF vectorial (texto, fuentes, márgenes, páginas verticales), PNG Android, nombre ${R[name].fname}_DD-MMM-AAAA, norma editorial`, async () => {
      const r = R[name], P = pdf(r.pdf.file), n = r.pdf.last.pages.length; assert.equal(r.pdf.name, r.fname + '_' + r.today + '.pdf');
      if (r.png) { assert.equal(r.png.name, r.fname + '_' + r.today + '.png'); const g = r.png.last.png; assert.ok(g.width <= 16000 && g.height <= 16000 && g.width * g.height <= 32e6 && g.scale >= 1.5, 'PNG ' + JSON.stringify(g)); const b = fs.readFileSync(r.png.file); assert.equal(b.readUInt32BE(16), g.width); }
      assert.ok(P.fonts.length >= 2 && P.fonts.every(l => / yes /.test(l)), 'fuentes incrustadas'); assert.ok(P.images.length <= 1, 'solo el logo como imagen'); assert.ok(P.text.replace(/\s/g, '').length > 400, 'texto seleccionable');
      assert.ok(r.pdf.last.pages.every(o => o === 'portrait')); assert.equal(r.pdf.last.audit.outOfBounds, 0, JSON.stringify(r.pdf.last.audit.samples)); for (let i = 1; i <= n; i++) assert.match(P.text, new RegExp('Página ' + i + ' de ' + n));
      assert.doesNotMatch(P.text, /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{4}\b/, 'fechas DD-MMM-AAAA'); editorial(P.text, name);
      // Sin páginas casi vacías: cada página (salvo la única) lleva al menos 6 líneas de contenido además de encabezado y pie.
      const pages = P.text.split('\f').filter(x => x.trim()); if (pages.length > 1) pages.forEach((pg, i) => assert.ok(pg.split('\n').filter(l => l.trim()).length >= 8, name + ' página ' + (i + 1) + ' casi vacía'));
      execFileSync('pdftoppm', ['-r', '60', '-png', r.pdf.file, path.join(dir, 'pages-' + name)]);
    });
    await check(`[${device}] Cronológico múltiple: selección exacta por finca y suerte, KPI = motores (TCH anterior del Histórico), sin duplicados; selección parcial`, async () => {
      for (const name of ['crono-multiple', 'crono-multiple-parcial']) {
        const r = R[name], T = pdf(r.pdf.file).text, ref = r.ref, lines = T.split('\n');
        assert.equal(r.pdf.last.check.placed, ref.keys.length); assert.equal(r.pdf.last.check.suertes, ref.keys.length);
        for (const v of [f2(ref.area), f2(ref.est), f2(ref.tons), f2(ref.tchAnt)]) assert.ok(T.includes(v), name + ' KPI ' + v);
        const farms = [...new Set(ref.lots.map(l => l.farm))]; for (const c of farms) assert.equal((T.match(new RegExp('· Código ' + esc(c) + ' ·', 'g')) || []).length, 1, 'sección de finca ' + c);
        for (const l of ref.lots) { const ls = lines.filter(x => new RegExp('^\\s*' + esc(l.suerte) + '\\s+' + esc(f2(l.active))).test(x)); assert.equal(ls.length, 1, name + ' suerte ' + l.code); assert.ok(!ls[0].includes(l.code), 'sin código repetido'); }
        if (name === 'crono-multiple') { const scr = Object.fromEntries(ref.screen.map(([k, v]) => [k.toUpperCase(), v])); assert.ok(T.includes(scr['TCH ESTIMADO 26/27']), 'TCH estimado = pantalla'); assert.ok(T.includes(scr['EDAD PONDERADA'].split(' ')[0]), 'edad = pantalla'); assert.ok(T.includes(scr['ÁREA TOTAL'].split(' ')[0]), 'área = pantalla'); }
        else { assert.match(T, /Pansaco · Código 993 · 3 suertes/); assert.match(T, /1 finca · 3 suertes/); }
      }
    });
    await check(`[${device}] Histórico multifinca: KPI del período, TCH y KATM por zafra, TCH histórico, resumen por finca = motor; completo con todas las suertes seleccionadas; selección parcial`, async () => {
      for (const name of ['hist-multi-ejecutivo', 'hist-multi-completo', 'hist-multi-parcial']) {
        const r = R[name], T = pdf(r.pdf.file).text, ref = r.ref, p0 = ref.period;
        for (const v of [f2(p0.area), f2(p0.tch), f2(p0.katm), f2(p0.edad), 'TCH histórico ' + f2(ref.full)]) assert.ok(T.includes(v), name + ' ' + v);
        for (const z of ref.series) { assert.ok(T.includes(f2(z.tch)), 'TCH ' + z.zafra); assert.ok(T.includes(f2(z.katm)), 'KATM ' + z.zafra); }
        for (const f of ref.farms) assert.match(T, new RegExp(esc(f.name) + '\\s+\\S+\\s+\\S+\\s+' + esc(f2(f.area)) + '[\\s\\S]{0,60}' + esc(f2(f.tch))), 'finca ' + f.name);
        // Integridad: la agregación toneladas ÷ área de las filas de la selección reproduce la serie oficial por zafra.
        for (const z of ref.series) { const rs = ref.rows.filter(x => x[2] === z.zafra), a = rs.reduce((n, x) => n + x[3], 0), t = rs.reduce((n, x) => n + x[4], 0); assert.ok(Math.abs(t / a - z.tch) < 0.006, 'serie ' + z.zafra + ' ' + (t / a) + ' vs ' + z.tch); }
        if (r.variant === 'complete') { const lots = new Set(ref.rows.map(x => x[1])); assert.equal(r.pdf.last.check.lotsShown, lots.size, 'todas las suertes seleccionadas');
          for (const f of ref.sel) assert.match(T, new RegExp(esc(f.name) + ' · Código ' + esc(f.code) + (f.mode === 'full' ? '' : ' · ' + f.lots + ' suertes seleccionadas'))); }
        else assert.equal(r.pdf.last.pages.length, 1, 'ejecutivo en una página');
        if (name === 'hist-multi-parcial') { assert.equal(ref.sel.find(f => f.code === '993').lots, 3); assert.match(T, /Pansaco \(993\) · 3 suertes/); }
      }
    });
    await check(`[${device}] Zona: KPI = pantalla, composición = área activa, comparación por tipo de riego, detalle de todas las fincas; «Todas las zonas»; Histórico con serie oficial y TCH histórico`, async () => {
      for (const name of ['zona-crono-centro', 'zona-crono-todas']) {
        const r = R[name], T = pdf(r.pdf.file).text, ref = r.ref; for (const v of ref.kpis) assert.ok(T.includes(v), name + ' KPI ' + v); for (const v of ref.strip) assert.ok(T.includes(v.split(' ')[0]), name + ' complemento ' + v);
        for (const [f, list] of Object.entries(ref.groups)) { const tot = list.reduce((n, x) => n + x[1], 0); assert.ok(Math.abs(tot - ref.farms) < 0.01, f + ' total = área activa'); for (const [k, a] of list) { const lab = f === 'corte' ? (k === '1' ? '1 corte' : k + ' cortes') : k; assert.match(T, new RegExp(esc(lab) + '\\s+' + esc(f2(a)) + ' ha'), f + ' ' + k); } }
        for (const g of ref.compare) assert.match(T, new RegExp('^\\s*' + esc(g[0]) + '\\s[\\s\\S]*?' + esc(g[1]) + '\\s+' + esc(g[2]), 'm'), 'comparación ' + g[0]);
        assert.equal(r.pdf.last.check.rows, await page.evaluate(z => z ? new Set(CRONO_DATA.producers.flatMap(p => p.details).filter(x => x.zona === z).map(x => String(x.code))).size : null, ref.zone) ?? r.pdf.last.check.rows, 'todas las fincas');
      }
      const r = R['zona-hist-centro'], T = pdf(r.pdf.file).text, ref = r.ref; for (const v of ref.kpis) assert.ok(T.includes(v), 'KPI ' + v);
      assert.ok(T.includes('TCH histórico ' + f2(ref.hist)), 'TCH histórico'); assert.equal(r.pdf.last.check.zafras, ref.official.length);
      const lines = T.split('\n'); for (const [z, a, t, tch, k] of ref.official) { const lab = String(z).padStart(4, '0').replace(/(..)(..)/, '$1/$2'), l = lines.find(x => x.trim().startsWith(lab + ' ') && x.includes(f2(a))); assert.ok(l && l.includes(f0(t)) && l.includes(f2(tch)) && l.includes(f2(k)), 'zafra ' + lab); }
      assert.equal(r.pdf.last.check.rows, 16, 'detalle por finca completo');
    });
    await check(`[${device}] Sin errores de página ni diálogos`, async () => assert.deepEqual(errors, []));
    await ctx.close();
  }
  // Sin conexión: PWA con Service Worker; Cronológico múltiple y Zona exportados desde la caché.
  await check('[pc] Exportación R3 sin conexión (PWA, recursos precargados)', async () => {
    const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, acceptDownloads: true}), page = await ctx.newPage();
    const frame = async () => { await page.waitForFunction(() => !!document.querySelector('#mFrame')?.contentWindow?.CASUR_PRODUCTION_READY, null, {timeout: 120000}); return page.frames().find(f => f.url().includes('/modules/produccion/')); };
    await page.goto(base + '#/modulo/produccion'); await frame(); await page.waitForFunction(() => navigator.serviceWorker.controller, null, {timeout: 60000});
    await page.reload(); await frame(); await page.waitForTimeout(3000); await ctx.setOffline(true); await page.reload(); const f = await frame();
    assert.equal(await f.evaluate(() => !!window.CASUR_REPORTS), false, 'motor cargado desde la caché');
    for (const [setup, kind] of [[SCEN[0][3], 'cronologico-multiple'], [ZC('2-Centro'), 'zona']]) {
      for (const step of setup.split('||WAIT||')) { await f.evaluate(new Function(step)); await page.waitForTimeout(1500); }
      const [dl] = await Promise.all([page.waitForEvent('download', {timeout: 120000}), f.evaluate(k => document.querySelector(`[data-casur-export-kind="${k}"] .casur-visual-action.pdf`).click(), kind)]);
      const file = path.join(out, 'offline-' + kind + '.pdf'); await dl.saveAs(file); const P = pdf(file); assert.ok(P.fonts.length >= 2 && P.text.includes('Negocios de Caña · CASUR'), kind + ' sin conexión');
    }
    await ctx.close();
  });
  await browser.close();
  const pass = results.filter(r => r[0] === 'PASS').length;
  fs.writeFileSync(path.join(out, 'qa-informes-r3.json'), JSON.stringify({results, last: Object.fromEntries(Object.entries(report).map(([d, R]) => [d, Object.fromEntries(Object.entries(R).map(([n, r]) => [n, {pdf: r.pdf.last, png: r.png?.last?.png, names: [r.pdf.name, r.png?.name]}]))]))}, null, 1));
  console.log(`${pass}/${results.length} ${pass === results.length ? 'PASS' : 'FAIL'}`); if (pass !== results.length) process.exitCode = 1;
})();
