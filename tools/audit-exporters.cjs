// Auditoría de exportadores PDF/PNG (solo lectura): genera muestras REALES pulsando los botones existentes del motor
// casurVisualExportEngine en PC y Android, y registra por informe: dimensiones del lienzo, páginas, texto
// seleccionable, y la medición del contenido en el documento vivo frente al render aislado (RENDER_CSS solo).
// Uso: node tools/audit-exporters.cjs BASE OUT_DIR
const {chromium, devices} = require('playwright'), fs = require('fs'), path = require('path');
const [base, out] = process.argv.slice(2);
if (!base || !out) throw Error('Usage: node tools/audit-exporters.cjs BASE OUT_DIR');
fs.mkdirSync(out, {recursive: true});
const SCENARIOS = [
  ['cronologico-general', 'cronologico', `CASUR_MAESTRO_UX.activate('cronologico');renderCronoHome();`],
  ['cronologico-finca-pansaco', 'cronologico', `CASUR_MAESTRO_UX.activate('cronologico');renderCronoProducer('993');`],
  ['cronologico-suerte-pansaco-01', 'cronologico', `CASUR_MAESTRO_UX.activate('cronologico');selectCronoSuerteSuggestion('993','01');`],
  ['historico-general', 'historico', `CASUR_MAESTRO_UX.activate('historico');renderHistoricoLatestHome&&renderHistoricoLatestHome();`],
  ['historico-finca-pansaco', 'historico', `CASUR_MAESTRO_UX.activate('historico');renderEntity('993');`],
  ['historico-suerte-pansaco-01', 'historico', `CASUR_MAESTRO_UX.activate('historico');renderEntity('LOTE::99301');`],
  ['cronologico-multiple', 'cronologico-multiple', `CASUR_MAESTRO_UX.activate('cronologico');document.querySelector('#cronoSection').open=true;clearCronoMultiSelection&&clearCronoMultiSelection();toggleCronoSuerteSelection('993::36',true);toggleCronoSuerteSelection('19::27',true);toggleCronoSuerteSelection('20::03',true);renderCronoMultiSummary();`],
  ['historico-multiple-ejecutivo', 'historico-multiple:executive', `CASUR_MAESTRO_UX.activate('historico');document.getElementById('fichaSection').open=true;clearHistoricoSelection();toggleHistoricoMultiSelection();addHistoricoMultiFarm('993');addHistoricoMultiFarm('2');renderHistoricoMultiSummary();`],
  ['historico-multiple-completo', 'historico-multiple:complete', null],
  ['zona-cronologico-2-centro', 'zona', `CASUR_MAESTRO_UX.activate('zonas');||WAIT||document.querySelector('#zoneMainSection .ux09-section-tabs button[data-target="cronoZoneSection"]').click();const s=document.querySelector('#cronoZoneSelect');s.value='2-Centro';selectCronoZone('2-Centro');`],
  ['zona-historico-2-centro', 'zona-historico', `CASUR_MAESTRO_UX.activate('zonas');||WAIT||document.querySelector('#zoneMainSection .ux09-section-tabs button[data-target="zoneAnalysisSection"]').click();const s=document.querySelector('#zoneSelect');s.value='2-ZONA CENTRO';selectZone('2-ZONA CENTRO');`],
];
// Measures the same prepared clone twice: (a) in the live document, where the app stylesheets also apply (this is what
// renderCanvas uses to size the SVG); (b) in an isolated iframe with RENDER_CSS only (what the foreignObject paints).
const MEASURE = async kind => {
  const E = window.CASUR_VISUAL_EXPORT, k = kind.split(':')[0], variant = kind.split(':')[1];
  const node = E.target(k); if (!node) return {missing: true};
  const live = E.prepareClone(node, k, variant), css = [...document.querySelectorAll('.casur-capture-host style')].map(s => s.textContent)[0];
  const width = k === 'cronologico-multiple' ? 1600 : live.classList.contains('casur-report-crono-general') ? 1400 : 960;
  const host = document.createElement('div'); host.className = 'casur-capture-host'; host.style.width = width + 'px'; host.append(live); document.body.append(host);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const bottom = n => { const top = n.getBoundingClientRect().top; let max = n.getBoundingClientRect().bottom; n.querySelectorAll('*').forEach(x => { const r = x.getBoundingClientRect(); if (r.height > 0 && r.bottom > max) max = r.bottom; }); return Math.ceil(max - top + 14); };
  const hidden = [...live.querySelectorAll('table,.table-wrap,svg,img')].filter(x => getComputedStyle(x).display === 'none' || x.getBoundingClientRect().height === 0).map(x => (x.className?.baseVal ?? x.className) || x.tagName);
  const liveSvgs = [...live.querySelectorAll('svg')].map(s => Math.round(s.getBoundingClientRect().width) + '×' + Math.round(s.getBoundingClientRect().height));
  const liveH = bottom(live); host.remove();
  // Isolated render context.
  const iso = E.prepareClone(node, k, variant), frame = document.createElement('iframe'); frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:4000px;border:0`; document.body.append(frame);
  const d = frame.contentDocument; d.open(); d.write('<!doctype html><html><head></head><body></body></html>'); d.close();
  const st = d.createElement('style'); st.textContent = window.__CASUR_RENDER_CSS || ''; d.head.append(st); d.body.append(d.importNode(iso, true));
  await new Promise(r => setTimeout(r, 200));
  const root = d.body.firstElementChild, isoH = bottom(root), isoSvgs = [...root.querySelectorAll('svg')].map(s => Math.round(s.getBoundingClientRect().width) + '×' + Math.round(s.getBoundingClientRect().height));
  const bigIcons = [...root.querySelectorAll('svg')].filter(s => s.getBoundingClientRect().width > 200 && !s.closest('.historical-chart-card,.crono-trend-card,.crono-trend-card-line,.ux14-svg,.svgbox,.hist-multi-chart,figure')).length;
  const rows = root.querySelectorAll('tbody tr').length, tables = root.querySelectorAll('table').length, wideTables = [...root.querySelectorAll('table')].filter(t => t.getBoundingClientRect().width > width + 2).map(t => Math.round(t.getBoundingClientRect().width));
  frame.remove();
  return {width, liveHeight: liveH, isolatedHeight: isoH, croppedPx: Math.max(0, isoH - Math.max(300, liveH)), hiddenInLive: hidden.slice(0, 12), liveSvgs: liveSvgs.slice(0, 12), isolatedSvgs: isoSvgs.slice(0, 12), bigIconsIsolated: bigIcons, tables, rows, wideTables};
};
// Definitive check: the height renderCanvas really uses vs. the height the same clone needs with RENDER_CSS only,
// and whether the report footer falls inside the painted area.
const ENGINE = async kind => {
  const E = window.CASUR_VISUAL_EXPORT, [k, variant] = kind.split(':');
  if (variant) return {paged: true};
  const r = await E.renderCanvas(k), w = r.width, clone = r.clone;
  const frame = document.createElement('iframe'); frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${w}px;height:6000px;border:0`; document.body.append(frame);
  const d = frame.contentDocument; d.open(); d.write('<!doctype html><html><head></head><body style="margin:0"></body></html>'); d.close();
  const st = d.createElement('style'); st.textContent = window.__CASUR_RENDER_CSS || ''; d.head.append(st); const root = d.importNode(clone, true); d.body.append(root);
  await new Promise(res => setTimeout(res, 200));
  const top = root.getBoundingClientRect().top; let need = root.getBoundingClientRect().bottom; root.querySelectorAll('*').forEach(x => { const b = x.getBoundingClientRect(); if (b.height > 0 && b.bottom > need) need = b.bottom; });
  const foot = root.querySelector('.export-footer'), footBottom = foot ? Math.ceil(foot.getBoundingClientRect().bottom - top) : null;
  const icons = [...root.querySelectorAll('svg.maestro-icon, .ico svg')].map(x => Math.round(x.getBoundingClientRect().width));
  frame.remove();
  return {canvas: r.canvas.width + '×' + r.canvas.height, usedHeight: r.height, neededHeight: Math.ceil(need - top + 14), footerBottom: footBottom, footerVisible: footBottom != null && footBottom <= r.height, iconWidths: icons.slice(0, 8)};
};
(async () => {
  const browser = await chromium.launch(), report = [];
  for (const [device, opts] of [['pc', {viewport: {width: 1366, height: 900}}], ['android', {...devices['Pixel 7']}]]) {
    const ctx = await browser.newContext({...opts, acceptDownloads: true}), page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    await page.goto(base + 'modules/produccion/'); await page.waitForFunction(() => window.CASUR_PRODUCTION_READY && window.CASUR_VISUAL_EXPORT && window.CASUR_ZONE_UX14, null, {timeout: 60000});
    // RENDER_CSS is private to the engine; recover it from the style the engine injects in its capture host.
    await page.evaluate(() => { const E = window.CASUR_VISUAL_EXPORT, orig = document.body.appendChild.bind(document.body); document.body.appendChild = n => { if (n.classList?.contains('casur-capture-host')) { const s = n.querySelector('style'); if (s) window.__CASUR_RENDER_CSS = s.textContent; } return orig(n); }; });
    for (const [name, kind, setup] of SCENARIOS.filter(x => !process.env.ONLY || x[0].includes(process.env.ONLY))) {
      const rec = {device, name, kind};
      try {
        if (setup) for (const step of setup.split('||WAIT||')) { await page.evaluate(new Function(step)); await page.waitForTimeout(1500); }
        const [k, variant] = kind.split(':');
        const sel = `[data-casur-export-kind="${k}"] .casur-visual-action.pdf${variant ? `[data-pdf-variant="${variant}"]` : ''}`;
        rec.hasButton = await page.locator(sel).count() > 0;
        if (!rec.hasButton) { rec.note = 'sin botón de exportación en esta vista'; report.push(rec); console.log(device, name, 'sin botón'); continue; }
        for (const [type, ext] of [['pdf', 'pdf'], ['image', 'png']]) {
          if (type === 'image' && variant === 'complete') continue;
          const s2 = type === 'pdf' ? sel : `[data-casur-export-kind="${k}"] .casur-visual-action.image`;
          await page.waitForSelector(s2, {state: 'attached', timeout: 15000});
          const [dl] = await Promise.all([page.waitForEvent('download', {timeout: 180000}), page.evaluate(s => document.querySelector(s).click(), s2)]);
          const file = path.join(out, `${device}-${name}.${ext}`); await dl.saveAs(file); rec[ext] = path.basename(file);
        }
        rec.measure = await page.evaluate(MEASURE, kind);
        rec.engine = await page.evaluate(ENGINE, kind);
      } catch (e) { rec.error = e.message.split('\n')[0]; }
      report.push(rec); console.log(device, name, JSON.stringify(rec.measure || rec.error || ''));
    }
    report.push({device, errors}); await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(out, process.env.ONLY ? `audit-${process.env.ONLY}.json` : 'audit.json'), JSON.stringify(report, null, 1));
})();
