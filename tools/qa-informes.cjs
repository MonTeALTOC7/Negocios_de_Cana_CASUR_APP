// QA de informes R2 (Cronológico/Histórico de Finca y de Suerte) con los botones reales, en PC y Android.
// Verifica contenido (paridad con el panel oficial, todas las suertes), texto seleccionable, fuentes incrustadas,
// orientación, límites, tamaño PNG, selección múltiple (motor R1) y exportación sin conexión (Service Worker).
// Uso: node tools/qa-informes.cjs BASE OUT_DIR   (requiere pdftotext, pdfinfo, pdffonts, pdfimages y pdftoppm)
const {chromium, devices} = require('playwright'), assert = require('assert/strict'), fs = require('fs'), path = require('path'), {execFileSync} = require('child_process');
const [base, out] = process.argv.slice(2);
if (!base || !out) throw Error('Usage: node tools/qa-informes.cjs BASE OUT_DIR');
fs.mkdirSync(out, {recursive: true});
const results = [];
const check = (name, fn, ms = 300000) => { let t; return Promise.race([fn(), new Promise((_, ko) => { t = setTimeout(() => ko(Error('timeout')), ms); })]).then(() => ['PASS', name], e => ['FAIL', name, e.message.split('\n').slice(0, 4).join(' ')]).then(r => { clearTimeout(t); results.push(r); console.log(r.join(' · ')); }); };
const pdf = f => ({text: execFileSync('pdftotext', ['-layout', f, '-'], {encoding: 'utf8', maxBuffer: 64e6}), info: execFileSync('pdfinfo', ['-l', '99', f], {encoding: 'utf8'}),
  fonts: execFileSync('pdffonts', [f], {encoding: 'utf8'}).split('\n').slice(2).filter(Boolean), images: execFileSync('pdfimages', ['-list', f], {encoding: 'utf8'}).split('\n').slice(2).filter(Boolean)});
const pageSizes = info => [...info.matchAll(/Page\s+\d+ size:\s+([\d.]+) x ([\d.]+)/g)].map(m => Number(m[1]) > Number(m[2]) ? 'landscape' : 'portrait');
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SCEN = {
  'crono-finca-pansaco': ['cronologico', `CASUR_MAESTRO_UX.activate('cronologico');renderCronoProducer('993')`],
  'crono-suerte-pansaco-01': ['cronologico', `CASUR_MAESTRO_UX.activate('cronologico');selectCronoSuerteSuggestion('993','01')`],
  'hist-finca-pansaco': ['historico', `CASUR_MAESTRO_UX.activate('historico');renderEntity('993')`],
  'hist-suerte-pansaco-01': ['historico', `CASUR_MAESTRO_UX.activate('historico');renderEntity('LOTE::99301')`],
  'crono-finca-pequena-904': ['cronologico', `CASUR_MAESTRO_UX.activate('cronologico');renderCronoProducer('904')`],
  'hist-finca-pequena-904': ['historico', `CASUR_MAESTRO_UX.activate('historico');renderEntity('904')`],
};
async function exportBoth(page, dir, name, kind, setup) {
  await page.evaluate(new Function(setup)); await page.waitForTimeout(1500);
  const official = await page.evaluate(k => { const n = CASUR_VISUAL_EXPORT.target(k), t = n.querySelector('.table-wrap table'), txt = c => (c?.innerText || '').replace(/\s+/g, ' ').trim();
    return {kpis: [...n.querySelectorAll('.kpis .kpi')].map(x => [txt(x.querySelector('.label,span')), txt(x.querySelector('strong'))]), heads: t ? [...t.querySelectorAll('thead th')].map(txt) : [], rows: t ? [...t.querySelectorAll('tbody tr')].map(r => [...r.children].map((c, i) => i === 0 && c.querySelector('b') ? txt(c.querySelector('b')) : txt(c))) : [], meta: txt(n.querySelector('.print-meta'))}; }, kind);
  const res = {official};
  for (const [type, ext] of [['pdf', 'pdf'], ['image', 'png']]) {
    const sel = `[data-casur-export-kind="${kind}"] .casur-visual-action.${type}`; await page.waitForSelector(sel, {state: 'attached'});
    const [dl] = await Promise.all([page.waitForEvent('download', {timeout: 120000}), page.evaluate(s => document.querySelector(s).click(), sel)]);
    const file = path.join(dir, name + '.' + ext); await dl.saveAs(file); res[ext] = file; res[ext + 'Name'] = dl.suggestedFilename(); res[ext + 'Last'] = await page.evaluate(() => window.CASUR_REPORTS?.last);
  }
  return res;
}
(async () => {
  const browser = await chromium.launch(), report = {};
  for (const [device, opts] of [['pc', {viewport: {width: 1366, height: 900}}], ['android', {...devices['Pixel 7']}]]) {
    const dir = path.join(out, device); fs.mkdirSync(dir, {recursive: true});
    const ctx = await browser.newContext({...opts, acceptDownloads: true}), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => { errors.push('dialog: ' + d.message()); d.dismiss(); });
    await page.goto(base + 'modules/produccion/'); await page.waitForFunction(() => window.CASUR_PRODUCTION_READY && window.CASUR_VISUAL_EXPORT && window.CASUR_ZONE_UX14, null, {timeout: 60000});
    const R = report[device] = {};
    for (const [name, [kind, setup]] of Object.entries(SCEN)) R[name] = await exportBoth(page, dir, name, kind, setup);
    const common = (name, template, orient) => check(`[${device}] ${name}: PDF vectorial con texto, fuentes incrustadas, ${orient.join('/')} , sin desbordes; PNG dentro de límites Android`, async () => {
      const r = R[name], P = pdf(r.pdf); assert.equal(r.pdfLast.template, template);
      assert.ok(P.fonts.length >= 2 && P.fonts.every(l => / yes /.test(l)), 'fuentes incrustadas: ' + P.fonts.join(' | '));
      assert.ok(P.images.length <= 1, 'solo el logo como imagen'); assert.ok(P.text.replace(/\s/g, '').length > 600, 'texto seleccionable');
      assert.deepEqual(pageSizes(P.info), r.pdfLast.pages); assert.deepEqual(pageSizes(P.info).slice(0, orient.length), orient);
      const n = r.pdfLast.pages.length; for (let i = 1; i <= n; i++) assert.match(P.text, new RegExp('Página ' + i + ' de ' + n));
      assert.match(P.text, /Negocios de Caña · CASUR/); assert.match(P.text, /Consulta: \d{2}-[A-Z][a-z]{2}-\d{4}/); assert.doesNotMatch(P.text, /\b\d{4}-\d{2}-\d{2}\b/, 'sin fechas ISO');
      assert.equal(r.pdfLast.audit.outOfBounds, 0, 'elementos fuera de márgenes: ' + JSON.stringify(r.pdfLast.audit.samples));
      const g = r.pngLast.png; assert.ok(g.width <= 16000 && g.height <= 16000 && g.width * g.height <= 32e6, 'PNG ' + g.width + '×' + g.height); assert.ok(g.scale >= 1.5, 'resolución PNG ≥ 1.5×');
      const png = fs.readFileSync(r.png); assert.equal(png.readUInt32BE(16), g.width); assert.equal(png.readUInt32BE(20), g.height);
      execFileSync('pdftoppm', ['-r', '60', '-png', r.pdf, path.join(dir, 'pages-' + name)]);
      return P;
    });
    await common('crono-finca-pansaco', 'cronologico-finca', ['portrait', 'landscape']);
    await check(`[${device}] Cronológico de Finca Pansaco: KPI (área, TCH est., TCH ejecutado, edad), 49 suertes con todas las variables y cifras = tabla oficial`, async () => {
      const r = R['crono-finca-pansaco'], T = pdf(r.pdf).text, o = r.official, h = Object.fromEntries(o.heads.map((x, i) => [x, i]));
      for (const v of ['368.44', '48.57', '63.35', '10.61', '17,452.08', '66.23']) assert.match(T, new RegExp(esc(v)), v);
      assert.match(T, /TCH ejecutado Z25\/26/); assert.match(T, /TCH anterior Z25\/26 \(aforo\)/); assert.match(T, /Aforo 12-Oct-2026 · Consolidado 22-Nov-2026 · Generación 2026\.11\.22-aforo\.1102/);
      for (const k of ['Variedad', 'Tipo de riego', '# de cortes \\(rangos\\)', 'Destino', 'Activas · Molienda', 'Activas · Semilla', 'Inactivas']) assert.match(T, new RegExp(k));
      assert.equal(o.rows.length, 49); assert.equal(r.pdfLast.check.placed, 49); assert.equal(r.pdfLast.check.caracterizadas, 49);
      const lines = T.split('\n');
      for (const row of o.rows) { const code = row[0], ls = lines.filter(l => new RegExp('^\\s*' + esc(code) + ' · ').test(l)); assert.equal(ls.length, 2, code + ' en las dos tablas de detalle');
        const p = ls[0]; for (const k of ['Área', 'Variedad', '# de Corte', 'Tipo de riego', 'TCH', 'TCH est. 26/27', 'Ton. est. 26/27']) assert.ok(p.includes(row[h[k]]), code + ' ' + k + ' ' + row[h[k]]);
        for (const k of ['Textura', 'Surco', 'Distancia (km)', 'Tenencia']) assert.ok(ls[1].includes(row[h[k]]), code + ' ' + k); }
      for (const k of ['Fecha para', 'Corte \\(BF\\)', 'Edad']) assert.match(T, new RegExp(k));
    });
    await common('crono-suerte-pansaco-01', 'cronologico-suerte', ['portrait']);
    await check(`[${device}] Cronológico de Suerte 01: KPI en orden (TCH est., fecha cosecha, área, edad), ficha sin tabla de 18 columnas, sin repetir variedad`, async () => {
      const r = R['crono-suerte-pansaco-01'], T = pdf(r.pdf).text, o = r.official, h = Object.fromEntries(o.heads.map((x, i) => [x, i])), row = o.rows[0];
      const pos = ['TCH estimado Z26/27', 'Fecha para cosecha 26/27', 'Área activa', 'Edad actual'].map(k => T.indexOf(k)); assert.ok(pos.every(x => x > 0) && pos.every((x, i) => !i || x > pos[i - 1]), 'orden KPI ' + pos);
      for (const v of ['60.00', '17-Dic-2026', '19.00', '11.63', '84.24', '1,140.00 t', 'Corte mecánico', '138.08', '94.22']) assert.match(T, new RegExp(esc(v)), v);
      assert.doesNotMatch(T, /Detalle por suerte/); assert.equal((T.match(/CP 72-2086/g) || []).length, 1, 'variedad solo en el encabezado');
      for (const k of ['Caracterización agronómica', 'Datos productivos', 'Plan de cosecha', 'Ubicación y estado', 'Escenario optimista']) assert.match(T, new RegExp(k));
      for (const k of ['Textura', 'Surco', 'Distancia (km)', 'Estado maestro', 'Estado TCH 25/26']) assert.ok(T.includes(row[h[k]]), k + ' ' + row[h[k]]);
    });
    await common('hist-finca-pansaco', 'historico-finca', ['portrait', 'landscape']);
    await check(`[${device}] Histórico de Finca Pansaco: KPI y resumen por zafra = panel oficial; detalle de todos los lotes; área Z25/26 de los lotes = KPI`, async () => {
      const r = R['hist-finca-pansaco'], T = pdf(r.pdf).text, o = r.official, lines = T.split('\n');
      for (const [, v] of o.kpis) { const val = v.split(' ')[0].replace('▼', '').trim(); if (/\d/.test(val)) assert.ok(T.includes(val), 'KPI ' + v); }
      for (const z of o.rows) { const l = lines.find(x => x.trim().startsWith(z[0]) && x.includes(z[1])); assert.ok(l, 'zafra ' + z[0]); for (const i of [1, 2, 3, 4]) assert.ok(l.includes(z[i]), z[0] + ' col ' + o.heads[i]); }
      assert.equal(r.pdfLast.check.zafras, 10); assert.ok(Math.abs(r.pdfLast.check.latestArea - 428.96) < 0.01, 'área lotes Z25/26 ' + r.pdfLast.check.latestArea);
      const lots = await page.evaluate(() => APP_DATA.lotCompact.filter(l => String(l[8]) === '993' && !/MAQUILA/i.test(l[2] || '')).map(l => String(l[0])));
      assert.equal(r.pdfLast.check.lots, lots.length); for (const c of lots) assert.match(T, new RegExp('\\s' + esc(c) + '\\s'), 'lote ' + c);
      for (const k of ['TCH ponderado por zafra', 'Área cosechada', 'Toneladas', 'KATM ponderado', 'Resumen de finca · por zafra', 'Detalle histórico por suerte']) assert.match(T, new RegExp(k));
    });
    await common('hist-suerte-pansaco-01', 'historico-suerte', ['portrait', 'landscape']);
    await check(`[${device}] Histórico de Suerte 99301: 14 columnas en página horizontal, 10 zafras = tabla oficial; gráficos TCH y KATM`, async () => {
      const r = R['hist-suerte-pansaco-01'], T = pdf(r.pdf).text, o = r.official, lines = T.split('\n'), h = Object.fromEntries(o.heads.map((x, i) => [x, i]));
      assert.equal(o.heads.length, 14); assert.deepEqual(r.pdfLast.pages, ['portrait', 'landscape']);
      for (const z of o.rows) { const l = lines.find(x => x.trim().startsWith(z[0] + ' ') && x.includes(z[h['CodLote']])); assert.ok(l, z[0]); for (const k of ['Área', 'Ton', 'TCH', 'KATM', 'Edad', 'Estado']) assert.ok(l.includes(z[h[k]]), z[0] + ' ' + k); }
      for (const k of ['TCH por zafra', 'KATM por zafra', 'Vs CASUR', 'Vs zona', 'Vs variedad', 'Vs riego']) assert.match(T, new RegExp(k));
    });
    await common('crono-finca-pequena-904', 'cronologico-finca', ['portrait', 'landscape']);
    await check(`[${device}] Finca pequeña 904 (Cronológico e Histórico): caracteres especiales y todas sus suertes`, async () => {
      const a = pdf(R['crono-finca-pequena-904'].pdf).text, b = pdf(R['hist-finca-pequena-904'].pdf).text;
      for (const T of [a, b]) { assert.match(T, /Alba Nora Argüello Martinez/); assert.match(T, /Cronológico|Histórico/); assert.match(T, /Página 1 de/); assert.match(T, /Caña/); }
      for (const code of ['90401', '90401A']) assert.match(a, new RegExp(esc(code) + ' · '));
      assert.match(a, /Δ|≥|·/, 'símbolos');
    });
    await common('hist-finca-pequena-904', 'historico-finca', ['portrait', 'landscape']);
    await check(`[${device}] Selección múltiple (motor R1 hasta R3): PDF y PNG completos, pie visible`, async () => {
      await page.evaluate(() => { CASUR_MAESTRO_UX.activate('cronologico'); document.querySelector('#cronoSection').open = true; window.clearCronoMultiSelection?.(); toggleCronoSuerteSelection('993::36', true); toggleCronoSuerteSelection('19::27', true); toggleCronoSuerteSelection('20::03', true); renderCronoMultiSummary(); });
      await page.waitForTimeout(1500); const sel = '[data-casur-export-kind="cronologico-multiple"] .casur-visual-action.pdf'; await page.waitForSelector(sel, {state: 'attached'});
      const [dl] = await Promise.all([page.waitForEvent('download', {timeout: 120000}), page.evaluate(s => document.querySelector(s).click(), sel)]); const f = path.join(dir, 'crono-multiple.pdf'); await dl.saveAs(f);
      // Re-host the rendered clone exactly like the foreignObject (RENDER_CSS + .casur-render-root) and locate the footer.
      const r = await page.evaluate(async () => { const E = CASUR_VISUAL_EXPORT, x = await E.renderCanvas('cronologico-multiple'), fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;left:-20000px;top:0;width:' + x.width + 'px;height:10px;border:0'; document.body.append(fr);
        const d = fr.contentDocument; d.open(); d.write('<!doctype html><html><head><style>' + E.renderCss() + '</style></head><body style="margin:0"><div class="casur-render-root" style="width:' + x.width + 'px"></div></body></html>'); d.close();
        const c = d.importNode(x.clone, true); d.body.firstElementChild.append(c); await new Promise(ok => setTimeout(ok, 150)); const foot = c.querySelector('.export-footer');
        const res = {h: x.height, foot: foot ? Math.ceil(foot.getBoundingClientRect().bottom - c.getBoundingClientRect().top) : null, context: x.context}; fr.remove(); return res; });
      assert.equal(r.context, 'isolated'); assert.ok(r.foot && r.foot <= r.h, 'pie dentro del área ' + JSON.stringify(r)); assert.ok(pdf(f).images.length >= 1);
    });
    await check(`[${device}] Sin errores de página ni diálogos`, async () => assert.deepEqual(errors, []));
    await ctx.close();
  }
  // Exportación sin conexión: shell PWA con Service Worker, módulo precargado, red desconectada.
  await check('[pc] Exportación PDF y PNG sin conexión (PWA, recursos precargados)', async () => {
    const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, acceptDownloads: true}), page = await ctx.newPage();
    const frame = async () => { await page.waitForFunction(() => !!document.querySelector('#mFrame')?.contentWindow?.CASUR_PRODUCTION_READY, null, {timeout: 120000}); return page.frames().find(f => f.url().includes('/modules/produccion/')); };
    await page.goto(base + '#/modulo/produccion'); await frame(); await page.waitForFunction(() => navigator.serviceWorker.controller, null, {timeout: 60000});
    await page.reload(); await frame(); await page.waitForTimeout(3000); await ctx.setOffline(true); await page.reload(); const f = await frame();
    assert.equal(await f.evaluate(() => !!window.CASUR_REPORTS), false, 'el motor aún no estaba cargado: se carga desde la caché');
    await f.evaluate(() => { CASUR_MAESTRO_UX.activate('cronologico'); renderCronoProducer('993'); }); await page.waitForTimeout(1500);
    for (const [type, ext] of [['pdf', 'pdf'], ['image', 'png']]) {
      const [dl] = await Promise.all([page.waitForEvent('download', {timeout: 120000}), f.evaluate(t => document.querySelector(`[data-casur-export-kind="cronologico"] .casur-visual-action.${t}`).click(), type)]);
      const file = path.join(out, 'offline-crono-finca.' + ext); await dl.saveAs(file); assert.ok(fs.statSync(file).size > 20000, ext + ' sin conexión');
    }
    assert.ok(pdf(path.join(out, 'offline-crono-finca.pdf')).fonts.length >= 2, 'fuentes desde la caché'); await ctx.close();
  });
  await browser.close();
  const pass = results.filter(r => r[0] === 'PASS').length;
  fs.writeFileSync(path.join(out, 'qa-informes.json'), JSON.stringify({results, last: Object.fromEntries(Object.entries(report).map(([d, R]) => [d, Object.fromEntries(Object.entries(R).map(([n, r]) => [n, {pdf: r.pdfLast, png: r.pngLast?.png, names: [r.pdfName, r.pngName]}]))]))}, null, 1));
  console.log(`${pass}/${results.length} ${pass === results.length ? 'PASS' : 'FAIL'}`); if (pass !== results.length) process.exitCode = 1;
})();
