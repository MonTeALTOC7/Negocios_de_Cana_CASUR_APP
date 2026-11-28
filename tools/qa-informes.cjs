// QA de informes R2 (refinamiento ejecutivo, docs/ESTANDAR_EDITORIAL_INFORMES.md) (Cronológico/Histórico de Finca y de Suerte) con los botones reales, en PC y Android.
// Verifica contenido (paridad con el panel oficial, todas las suertes), texto seleccionable, fuentes incrustadas,
// orientación, límites, tamaño PNG, selección múltiple (motor R1) y exportación sin conexión (Service Worker).
// Uso: node tools/qa-informes.cjs BASE OUT_DIR   (requiere pdftotext, pdfinfo, pdffonts, pdfimages y pdftoppm)
const norma = require('./qa-informes-norma.cjs'), {chromium, devices} = require('playwright'), assert = require('assert/strict'), fs = require('fs'), path = require('path'), {execFileSync} = require('child_process');
const [base, out] = process.argv.slice(2);
if (!base || !out) throw Error('Usage: node tools/qa-informes.cjs BASE OUT_DIR');
fs.mkdirSync(out, {recursive: true});
const results = [];
const check = (name, fn, ms = 300000) => { let t; return Promise.race([fn(), new Promise((_, ko) => { t = setTimeout(() => ko(Error('timeout')), ms); })]).then(() => ['PASS', name], e => ['FAIL', name, e.message.split('\n').slice(0, 4).join(' ')]).then(r => { clearTimeout(t); results.push(r); console.log(r.join(' · ')); }); };
const pdf = f => ({text: execFileSync('pdftotext', ['-layout', f, '-'], {encoding: 'utf8', maxBuffer: 64e6}), info: execFileSync('pdfinfo', ['-l', '99', f], {encoding: 'utf8'}),
  fonts: execFileSync('pdffonts', [f], {encoding: 'utf8'}).split('\n').slice(2).filter(Boolean), images: execFileSync('pdfimages', ['-list', f], {encoding: 'utf8'}).split('\n').slice(2).filter(Boolean)});
const pageSizes = info => [...info.matchAll(/Page\s+\d+ size:\s+([\d.]+) x ([\d.]+)/g)].map(m => Number(m[1]) > Number(m[2]) ? 'landscape' : 'portrait');
const num = s => Number(String(s).replace(/[^\d.-]/g, ''));
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
    return {kpis: [...n.querySelectorAll('.kpis .kpi')].map(x => [txt(x.querySelector('.label,span')), txt(x.querySelector('strong'))]), heads: t ? [...t.querySelectorAll('thead th')].map(txt) : [], rows: t ? [...t.querySelectorAll('tbody tr')].map(r => [...r.children].map((c, i) => i === 0 && c.querySelector('b') ? txt(c.querySelector('b')) : txt(c))) : [], meta: txt(n.querySelector('.print-meta')),
      // Referencias del histórico completo calculadas por el motor oficial del Histórico (mismo período del panel).
      eng: k === 'historico' ? (() => { try { const c = historicalPeriodContext(currentEntity), f = CASUR_HISTORICAL_ENGINE.buildHistoricalAgronomicKpis(c.scopeRows, c.availableZafras); return {tch: f.tch, katm: f.katm}; } catch (e) { return null; } })() : null}; }, kind);
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
      assert.ok(P.images.length <= 1, 'solo el logo como imagen'); assert.ok(P.text.replace(/\s/g, '').length > 400, 'texto seleccionable');
      assert.deepEqual(pageSizes(P.info), r.pdfLast.pages); assert.deepEqual(pageSizes(P.info).slice(0, orient.length), orient); assert.ok(pageSizes(P.info).every(x => x === 'portrait'), 'todas verticales');
      const n = r.pdfLast.pages.length; for (let i = 1; i <= n; i++) assert.match(P.text, new RegExp('Página ' + i + ' de ' + n));
      assert.match(P.text, /Negocios de Caña · CASUR/); assert.match(P.text, /Consulta: \d{2}-[A-Z][a-z]{2}-\d{4}/); assert.equal(r.pdfName.replace(/\.pdf$/, ''), r.pngName.replace(/\.png$/, '')); assert.doesNotMatch(P.text, /\b\d{4}-\d{2}-\d{2}\b/, 'sin fechas ISO');
      assert.equal(r.pdfLast.audit.outOfBounds, 0, 'elementos fuera de márgenes: ' + JSON.stringify(r.pdfLast.audit.samples));
      const g = r.pngLast.png; assert.ok(g.width <= 16000 && g.height <= 16000 && g.width * g.height <= 32e6, 'PNG ' + g.width + '×' + g.height); assert.ok(g.scale >= 1.5, 'resolución PNG ≥ 1.5×');
      const png = fs.readFileSync(r.png); assert.equal(png.readUInt32BE(16), g.width); assert.equal(png.readUInt32BE(20), g.height);
      // Mapa vectorial del ámbito: polígonos, rótulos solo con número de suerte, todos visibles y sin choques.
      const mp = r.pdfLast.check.map; assert.ok(Array.isArray(mp) && mp.length >= 1, 'mapa'); assert.ok(mp.every(m => m.shapes > 0 && m.overlaps === 0 && m.shown === m.labels && m.texts.every(t => /^\d{1,3}[A-Z]*$/.test(t))), 'rótulos ' + JSON.stringify(mp.map(m => [m.labels, m.shown, m.texts.slice(0, 5)])));
      assert.match(P.text, /Mapa de la finca|Ubicación de la suerte/);
      execFileSync('pdftoppm', ['-r', '60', '-png', r.pdf, path.join(dir, 'pages-' + name)]);
      return P;
    });
    const editorial = norma.editorial;
    const today = await page.evaluate(() => CASUR_CRONO_PARTICIPATION.formatDate(new Date().toLocaleDateString('sv-SE')));
    const names = (r, base) => { assert.equal(r.pdfName, base + '_' + today + '.pdf'); assert.equal(r.pngName, base + '_' + today + '.png'); };
    const kpiOrder = (T, labels) => { const pos = labels.map(k => T.indexOf(k)); assert.ok(pos.every(x => x >= 0) && pos.every((x, i) => !i || x > pos[i - 1]), 'orden KPI ' + labels + ' ' + pos); };
    await common('crono-finca-pansaco', 'cronologico-finca', ['portrait', 'portrait']);
    await check(`[${device}] Cronológico de Finca Pansaco: KPI ejecutivos (TCH anterior Z25/26 = 63.35 del Histórico), composición apilada, una sola tabla de 11 columnas con las 49 suertes, norma editorial`, async () => {
      const r = R['crono-finca-pansaco'], T = pdf(r.pdf).text, o = r.official, h = Object.fromEntries(o.heads.map((x, i) => [x, i])); names(r, 'Cronologico_Pansaco'); editorial(T, 'crono-finca');
      const age = o.kpis.find(k => /Edad/.test(k[0]))[1].split(' ')[0];
      kpiOrder(T, ['Área activa de la finca', 'TCH estimado Z26/27', 'TCH anterior Z25/26', 'Edad actual', 'Toneladas estimadas Z26/27', 'Distancia']);
      for (const v of ['368.44', '48.57', '63.35', age, '17,452.08', '7.55', 'Zona 5-Productores', 'Tenencia Compra Venta']) assert.ok(T.includes(v), v);
      assert.doesNotMatch(T, /66\.23/, 'TCH anterior del aforo no se muestra'); assert.equal((T.match(/TCH anterior Z25\/26/g) || []).length, 1, 'un solo KPI TCH anterior');
      assert.doesNotMatch(T, /Molienda \/ Semilla|Ton\. est\.|Escenario optimista|caracterización y estado/i);
      // Composición: áreas y % = agronomicGroups (área activa, categoría original); tipos de riego originales.
      const G = await page.evaluate(() => { const rows = CRONO_DATA.producers.find(x => x.code === '993').details; return Object.fromEntries(['variedad', 'tipoRiego', 'corte', 'destino'].map(f => [f, CASUR_CRONO_PARTICIPATION.agronomicGroups(rows, f).map(g => [g.key, g.area])])); });
      const fmt2 = v => v.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}), fmt1 = v => v.toLocaleString('en-US', {minimumFractionDigits: 1, maximumFractionDigits: 1});
      for (const [f, list] of Object.entries(G)) { const tot = list.reduce((n, x) => n + x[1], 0); assert.ok(Math.abs(tot - 368.44) < 0.01, f + ' total ' + tot);
        for (const [k, a] of list) { const lab = f === 'corte' ? (k === '1' ? '1 corte' : k + ' cortes') : k; assert.match(T, new RegExp(esc(lab) + '\\s+' + esc(fmt2(a)) + ' ha\\s+' + esc(fmt1(a / tot * 100)) + ' %'), f + ' ' + lab); } }
      assert.deepEqual(G.tipoRiego.map(x => x[0]), ['Gravedad'], 'tipo de riego original');
      assert.equal(o.rows.length, 49); assert.equal(r.pdfLast.check.placed, 49);
      for (const k of ['Molienda · 40 suertes · 359.30 ha', 'Semilla · 2 suertes · 9.14 ha', 'Inactivas · 7 suertes']) assert.ok(T.includes(k), k);
      const hist = await page.evaluate(() => Object.fromEntries(APP_DATA.lotCompact.filter(l => l[8] === '993').map(l => [l[0], (l[11].find(z => z[0] === APP_DATA.meta.latestZafra) || [])[3] ?? null])));
      const lines = T.split('\n');
      for (const row of o.rows) { const code = row[0], suerte = code.slice(3), ls = lines.filter(l => new RegExp('^\\s*' + esc(suerte) + '\\s+' + esc(row[h['Área']].replace(' ha', '')) + '\\s').test(l)); assert.equal(ls.length, 1, 'suerte ' + suerte + ' una vez'); const l = ls[0];
        assert.ok(!l.includes(code), 'sin código completo junto a la suerte ' + code);
        for (const k of ['Variedad', '# de Corte', 'Tipo de riego', 'Fecha corte/siembra', 'TCH est. 26/27']) assert.ok(l.includes(row[h[k]]), code + ' ' + k + ' ' + row[h[k]]);
        assert.ok(l.includes(row[h['Área']].replace(' ha', '')), code + ' área');
        const ht = hist[code]; assert.ok(ht == null ? / — /.test(l) : l.includes(ht.toFixed(2)), code + ' TCH anterior Histórico ' + ht); }
      const head = lines.find(l => /Suerte\s+Área \(ha\)\s+Variedad/.test(l)); assert.ok(head, 'encabezado de 11 columnas');
    });
    await common('crono-suerte-pansaco-01', 'cronologico-suerte', ['portrait']);
    await check(`[${device}] Cronológico de Suerte 01: una página, KPI en orden sin subtextos, fichas autorizadas, norma editorial`, async () => {
      const r = R['crono-suerte-pansaco-01'], T = pdf(r.pdf).text, o = r.official, h = Object.fromEntries(o.heads.map((x, i) => [x, i])), row = o.rows[0]; names(r, 'Cronologico_Pansaco_Suerte_01'); editorial(T, 'crono-suerte');
      assert.equal(r.pdfLast.pages.length, 1); kpiOrder(T, ['TCH estimado Z26/27', 'Fecha para cosecha', 'Área', 'Edad actual', 'TCH por zafra']);
      const age = o.kpis.find(k => /Edad actual/.test(k[0]))[1].split(' ')[0];
      for (const v of ['60.00', '17-Dic-2026', '19.00', age, 'Promedio', '138.08', '84.24 t/ha', '1,140.00 t', 'Corte mecánico', '12.32 meses', '8.09 km', '62.00 t/ha', '1,178.00 t', '16-Ene-2020', '07-Dic-2025', '1.65 m']) assert.ok(T.includes(v), v);
      for (const k of ['Caracterización', 'Datos productivos', 'Plan de cosecha', 'Ubicación', 'Escenario optimista', '# de cortes', 'Textura', 'Tipo de riego', 'Distancia entre surcos', 'Fecha de siembra', 'Fecha de último corte', 'Destino', 'TCH anterior Z25/26', 'TCH estim. Z26/27', 'Toneladas estimadas Z26/27', 'Área cosechada Z25/26', 'Tipo de corte', 'Edad proyectada a cosecha', 'TCH optimista', 'Toneladas optimistas']) assert.ok(T.includes(k), k);
      for (const k of ['Textura', 'Tipo de riego', 'Destino Cultivo']) assert.ok(T.includes(row[h[k]]), k);
      assert.equal((T.match(/CP 72-2086/g) || []).length, 1, 'variedad solo en el encabezado'); assert.equal((T.match(/17-Dic-2026/g) || []).length, 1, 'fecha para cosecha una vez'); assert.equal((T.match(/60\.00/g) || []).length, 2, 'TCH estimado: KPI y datos productivos'); assert.match(T, /TCH estim\. Z26\/27\s+60\.00 t\/ha/);
      kpiOrder(T, ['Datos productivos', 'TCH anterior Z25/26', 'TCH estim. Z26/27', 'Toneladas estimadas Z26/27', 'Área cosechada Z25/26']);
      assert.doesNotMatch(T, /Finca\s+Pansaco|Fecha corte\/siembra|Observación/);
    });
    await common('hist-finca-pansaco', 'historico-finca', ['portrait']);
    await check(`[${device}] Histórico de Finca Pansaco: KPI = panel oficial, solo gráficos TCH y KATM, resumen por zafra limpio, detalle de todos los lotes, norma editorial`, async () => {
      const r = R['hist-finca-pansaco'], T = pdf(r.pdf).text, o = r.official, lines = T.split('\n'), h = Object.fromEntries(o.heads.map((x, i) => [x, i])); names(r, 'Historico_Pansaco'); editorial(T, 'hist-finca');
      const vs = o.kpis.find(k => /histórico/i.test(k[0])), tchK = num(o.kpis.find(k => /^TCH/i.test(k[0]))[1]), ref = (tchK - num(vs[1])).toFixed(2); assert.match(T, new RegExp('TCH histórico ' + esc(ref)), 'línea TCH histórico = panel ' + ref);
      { const e = o.eng; assert.ok(e, 'motor del Histórico'); for (const [k, v] of [['TCH', e.tch], ['KATM', e.katm]]) assert.match(T, new RegExp(k + ' histórico ' + esc(Number(v).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}))), 'línea ' + k + ' histórico = motor ' + v); }
      kpiOrder(T, ['Área cosechada Z25/26', 'TCH Z25/26', 'KATM Z25/26', 'Edad Z25/26', 'Distancia', 'TCH por zafra', 'KATM por zafra', 'Resumen por zafra', 'TCH por suerte y zafra']);
      for (const v of ['428.96', '63.35', '98.15', '11.38', '7.55', 'Zona 5-PRODUCTORES', 'Zafras 16/17 a 25/26']) assert.ok(T.includes(v), v);
      assert.doesNotMatch(T, /Toneladas por zafra|Área cosechada \(ha\)\n|Variedad dom|TCH pond|KATM pond|Edad prom|Estado/);
      for (const z of o.rows) { const l = lines.find(x => x.trim().startsWith(z[0] + ' ') && x.includes(z[1])); assert.ok(l, 'zafra ' + z[0]); for (const k of ['Área', 'Ton', 'TCH pond.', 'KATM pond.', 'Edad prom.', 'Variedad dom.', 'Riego', 'Suertes']) assert.ok(l.includes(z[h[k]]), z[0] + ' ' + k); }
      assert.equal(r.pdfLast.check.zafras, 10); assert.ok(Math.abs(r.pdfLast.check.latestArea - 428.96) < 0.01, 'área lotes Z25/26 ' + r.pdfLast.check.latestArea);
      const lots = await page.evaluate(() => APP_DATA.lotCompact.filter(l => String(l[8]) === '993' && !/MAQUILA/i.test(l[2] || '')).map(l => l[10]));
      assert.equal(r.pdfLast.check.lots, lots.length); for (const sv of lots) assert.ok(lines.some(l => new RegExp('^\\s*' + esc(sv) + '\\s').test(l)), 'suerte ' + sv);
      assert.ok(r.pdfLast.pages.length <= 3, 'páginas ' + r.pdfLast.pages.length);
    });
    await common('hist-suerte-pansaco-01', 'historico-suerte', ['portrait', 'portrait']);
    await check(`[${device}] Histórico de Suerte 01: una página, 10 zafras = tabla oficial (7 columnas), variedad y riego vigentes en el encabezado, norma editorial`, async () => {
      const r = R['hist-suerte-pansaco-01'], T = pdf(r.pdf).text, o = r.official, lines = T.split('\n'), h = Object.fromEntries(o.heads.map((x, i) => [x, i])); names(r, 'Historico_Pansaco_Suerte_01'); editorial(T, 'hist-suerte');
      const vs = o.kpis.find(k => /histórico/i.test(k[0])), tchK = num(o.kpis.find(k => /^TCH/i.test(k[0]))[1]), ref = (tchK - num(vs[1])).toFixed(2); assert.match(T, new RegExp('TCH histórico ' + esc(ref)), 'línea TCH histórico = panel ' + ref);
      { const e = o.eng; assert.ok(e, 'motor del Histórico'); for (const [k, v] of [['TCH', e.tch], ['KATM', e.katm]]) assert.match(T, new RegExp(k + ' histórico ' + esc(Number(v).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}))), 'línea ' + k + ' histórico = motor ' + v); }
      assert.deepEqual(r.pdfLast.pages, ['portrait', 'portrait'], 'ficha y mapa'); kpiOrder(T, ['Área cosechada Z25/26', 'TCH Z25/26', 'KATM Z25/26', 'Edad Z25/26', 'Distancia', 'TCH por zafra', 'KATM por zafra', 'Registro por zafra']);
      for (const v of ['Código 99301', 'Variedad CP 72-2086', 'Tipo de riego Gravedad', '8.09']) assert.ok(T.includes(v), v);
      assert.equal((T.match(/CP 72-2086/g) || []).length, 1, 'variedad no se repite por zafra'); assert.equal((T.match(/Gravedad/g) || []).length, 1, 'riego no se repite por zafra');
      const head = lines.find(l => /Zafra\s+Área \(ha\)\s+Toneladas\s+TCH\s+KATM\s+Edad \(meses\)\s+# de cortes/.test(l)); assert.ok(head, 'encabezado de 7 columnas');
      for (const z of o.rows) { const l = lines.find(x => x.trim().startsWith(z[0] + ' ') && x.includes(z[h['Ton']])); assert.ok(l, z[0]); assert.ok(!l.includes('99301'), 'sin código por fila'); for (const k of ['Área', 'Ton', 'TCH', 'KATM', 'Edad']) assert.ok(l.includes(z[h[k]]), z[0] + ' ' + k); }
    });
    await common('crono-finca-pequena-904', 'cronologico-finca', ['portrait']);
    await check(`[${device}] Finca pequeña 904 (Cronológico e Histórico): caracteres especiales, todas sus suertes, inactivas fuera de las cifras productivas`, async () => {
      const a = pdf(R['crono-finca-pequena-904'].pdf).text, b = pdf(R['hist-finca-pequena-904'].pdf).text; names(R['crono-finca-pequena-904'], 'Cronologico_Alba_Nora_Arguello_Martinez'); names(R['hist-finca-pequena-904'], 'Historico_Alba_Nora_Arguello_Martinez');
      for (const T of [a, b]) { assert.match(T, /Alba Nora Argüello Martinez/); assert.match(T, /Página 1 de/); assert.match(T, /Caña/); }
      editorial(a, 'crono-904'); editorial(b, 'hist-904');
      assert.match(a, /Inactivas · 2 suertes/); for (const sv of ['01', '01A']) assert.match(a, new RegExp('^\\s*' + sv + '\\s', 'm')); assert.match(a, /Área activa de la finca\s[\s\S]*0\.00/);
    });
    await common('hist-finca-pequena-904', 'historico-finca', ['portrait']);
    await check(`[${device}] Selección múltiple (motor R1 hasta R3): PDF y PNG completos, pie visible`, async () => {
      await page.evaluate(() => { CASUR_MAESTRO_UX.activate('cronologico'); document.querySelector('#cronoSection').open = true; window.clearCronoMultiSelection?.(); toggleCronoSuerteSelection('993::36', true); toggleCronoSuerteSelection('19::27', true); toggleCronoSuerteSelection('20::03', true); renderCronoMultiSummary(); });
      await page.waitForTimeout(1500); const sel = '[data-casur-export-kind="cronologico-multiple"] .casur-visual-action.pdf'; await page.waitForSelector(sel, {state: 'attached'});
      const [dl] = await Promise.all([page.waitForEvent('download', {timeout: 120000}), page.evaluate(s => document.querySelector(s).click(), sel)]); const f = path.join(dir, 'crono-multiple.pdf'); await dl.saveAs(f);
      // Re-host the rendered clone exactly like the foreignObject (RENDER_CSS + .casur-render-root) and locate the footer.
      const r = await page.evaluate(async () => { const E = CASUR_VISUAL_EXPORT, x = await E.renderCanvas('cronologico-multiple'), fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;left:-20000px;top:0;width:' + x.width + 'px;height:10px;border:0'; document.body.append(fr);
        const d = fr.contentDocument; d.open(); d.write('<!doctype html><html><head><style>' + E.renderCss() + '</style></head><body style="margin:0"><div class="casur-render-root" style="width:' + x.width + 'px"></div></body></html>'); d.close();
        const c = d.importNode(x.clone, true); d.body.firstElementChild.append(c); await new Promise(ok => setTimeout(ok, 150)); const foot = c.querySelector('.export-footer');
        const res = {h: x.height, foot: foot ? Math.ceil(foot.getBoundingClientRect().bottom - c.getBoundingClientRect().top) : null, context: x.context, head: (c.querySelector('.print-header')?.textContent || '').replace(/\s+/g, ' '), brand: c.querySelector('.print-header > .casur-header-brand')?.textContent || ''}; fr.remove(); return res; });
      assert.match(r.brand, /^Negocios de Caña · CASURConsulta: \d{2}-[A-Z][a-z]{2}-\d{4} · \d{2}:\d{2}/, 'encabezado uniforme R1: ' + r.brand); assert.doesNotMatch(r.head, /Departamento de Negocios|Resumen consolidado|\d{1,2}\/\d{1,2}\/\d{4}/, r.head);
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
