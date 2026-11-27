/* CASUR · Plantillas de informe: Cronológico de Finca / de Suerte, Histórico de Finca / de Suerte.
   Norma editorial: docs/ESTANDAR_EDITORIAL_INFORMES.md (minimalismo informativo ejecutivo). Los informes muestran solo
   etiqueta, valor y unidad; la trazabilidad de cada cifra vive aquí, en las pruebas y en la documentación técnica:
   - Panel oficial del informe (#cronoPrintPanel / #printPanel): KPI y tablas oficiales, leídos tal cual (no se recalculan).
   - TCH estimado / toneladas Z26/27: aforo oficial (columnas AD/AE), vía la tabla oficial del Cronológico.
   - TCH anterior Z25/26: Histórico (ejecutado). Finca = mainEntities().latest.tch; suerte = APP_DATA.lotCompact por código
     de lote exacto, zafra más reciente. Sin registro histórico → «—» (nunca se sustituye por la columna TCH del aforo).
   - Fecha para cosecha / tipo de corte / edad proyectada: plan de cosecha (BE/BF, r.plan).
   - Escenario optimista: AF/AG (r.forecastOptimistic).
   - Composición: CASUR_CRONO_PARTICIPATION.agronomicGroups (área activa por categoría original). */
(function () {
  'use strict';
  const E = window.CASUR_REPORT_ENGINE, {C, fmt, date, now, zlabel, cellText, panelKpis, officialTable, ageOf, kpis, groups, composition, chart, table, heading} = E;
  const P = () => window.CASUR_CRONO_PARTICIPATION, O = () => window.CASUR_OPERATIONAL_IMPORT;
  const split = s => { const m = String(s || '—').match(/^(.*?)\s+(ha|t\/ha|t|meses|km|kg\/t|TCH)$/); return m ? [m[1], m[2]] : [String(s || '—'), '']; };
  const num = s => { const n = Number(String(s ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) && /\d/.test(String(s)) ? n : null; };
  const byCode = (a, b) => String(a.codLote).localeCompare(String(b.codLote), 'es', {numeric: true});
  const bare = v => String(v ?? '—').replace(/\s*(ha|t)$/, '');
  const lots = () => window.APP_DATA?.lotCompact || [];
  const latestZ = () => window.APP_DATA?.meta?.latestZafra, latestL = () => window.APP_DATA?.meta?.latestLabel || '25/26';
  // TCH ejecutado de la zafra más reciente por código de lote exacto (Histórico); null si no hay registro.
  const histTch = code => { const l = lots().find(x => String(x[0]) === String(code)), z = l && (l[11] || []).find(x => x[0] === latestZ()); return z ? {tch: z[3], area: z[1]} : null; };
  const kpi = (K, re) => Object.entries(K).find(([k]) => re.test(k))?.[1];

  // Composición por categoría original del área activa: barra apilada + filas compactas.
  function comps(rows) {
    const card = (title, field, color, order) => {
      const g = P().agronomicGroups(rows, field), tot = g.reduce((n, x) => n + x.area, 0), list = order ? g.slice().sort(order) : g.slice().sort((a, b) => b.area - a.area);
      return {title, total: fmt(tot) + ' ha', items: list.map((x, i) => ({label: field === 'corte' ? (x.key === '1' ? '1 corte' : x.key + ' cortes') : x.key, value: x.area, color: color(x.key, i), display: fmt(x.area) + ' ha', pct: fmt(tot ? x.area / tot * 100 : 0, 1) + ' %'}))};
    };
    const seq = (k, i) => E.SEQ[i] || E.OTHER, numeric = (a, b) => (Number(a.key) || 99) - (Number(b.key) || 99);
    return [card('Variedad', 'variedad', seq), card('Tipo de riego', 'tipoRiego', k => E.RIEGO[k] || E.OTHER), card('# de cortes', 'corte', seq, numeric), card('Destino', 'destino', k => /semilla/i.test(k) ? '#D4B35F' : /molienda/i.test(k) ? '#1F4E5C' : E.OTHER)];
  }

  // ======================= Cronológico de Finca =======================
  function cronoFarm(A, node, code) {
    const p = window.CRONO_DATA.producers.find(x => String(x.code) === String(code)); if (!p) throw new Error('Finca no encontrada.');
    const rows = p.details || [], S = P().summary(rows), K = panelKpis(node), T = officialTable(node), m = window.CRONO_DATA.meta || {}, est = m.estimateSeason || '26/27';
    if (!T || T.rows.length !== rows.length) throw new Error('La tabla oficial de suertes no coincide con el catálogo de la finca.');
    // Cada fila oficial se identifica por su código de lote exacto (<b> de la primera celda), letras incluidas (99302A).
    const col = Object.fromEntries(T.heads.map((h, i) => [h, i])), off = new Map(T.rows.map((r, i) => [cellText(T.nodes[i].children[0].querySelector('b')) || r[0], r]));
    if (rows.some(r => !off.has(String(r.codLote)))) throw new Error('Una suerte del catálogo no aparece en la tabla oficial.');
    const ent = (window.mainEntities?.() || []).find(e => String(e.code) === String(code)), part = r => O().participation(r);
    const first = off.get(String(rows[0]?.codLote)) || [];
    const d = new E.Doc(A, {title: 'Cronológico de Finca', subject: p.name + ' · Código ' + p.code, consulta: now(),
      lines: ['Zona ' + (first[col['Zona']] || rows[0]?.zona || '—') + ' · Tenencia ' + (first[col['Tenencia']] || '—')]});
    d.newPage('portrait');
    const [aV, aU] = split(K['Área activa']?.value), [ageV] = split(K['Edad ponderada']?.value), [tV, tU] = split(K['Ton. Estim. Z' + est]?.value), [dV, dU] = split(K['Distancia ponderada (km)']?.value);
    d.add(kpis([
      {label: 'Área activa de la finca', value: aV, unit: aU},
      {label: 'TCH estimado Z' + est, value: fmt(S.estimateTch), unit: 't/ha', accent: C.blue},
      {label: 'TCH anterior Z' + latestL(), value: fmt(ent?.latest?.tch), unit: 't/ha', accent: C.gold},
      {label: 'Edad actual', value: ageV, unit: 'meses'}], 4));
    d.add(kpis([{label: 'Toneladas estimadas Z' + est, value: tV, unit: tU}, {label: 'Distancia', value: dV, unit: dU}, null, null].filter(Boolean), 4, true));
    const cards = comps(rows);
    if (cards.some(c => c.items.length)) { d.add(heading('Composición del área activa', null, 90)); d.add(composition(cards, 2)); }
    // Detalle: una sola tabla, agrupada en Molienda / Semilla / Inactivas (las inactivas no suman a las cifras productivas).
    const sections = [['Molienda', r => part(r).activeArea > 0 && part(r).milling], ['Semilla', r => part(r).activeArea > 0 && !part(r).milling], ['Inactivas', r => !(part(r).activeArea > 0)]]
      .map(([label, f]) => [label, rows.filter(f).sort(byCode)]).filter(([, list]) => list.length);
    const out = [];
    sections.forEach(([label, list]) => {
      out.push({section: label + ' · ' + fmt(list.length, 0) + (list.length === 1 ? ' suerte' : ' suertes') + (label === 'Inactivas' ? '' : ' · ' + fmt(list.reduce((n, r) => n + (part(r).activeArea || 0), 0)) + ' ha')});
      list.forEach(r => { const o = off.get(String(r.codLote)), h = histTch(r.codLote);
        out.push([r.suerte || '—', bare(o[col['Área']]), o[col['Variedad']], o[col['# de Corte']], o[col['Tipo de riego']], r.renovacion && !r.fSiembra ? 'Renovación' : fmt(ageOf(r)), o[col['Fecha corte/siembra']],
          h ? fmt(h.tch) : '—', o[col['TCH est. ' + est]], date(r.plan?.date?.iso), r.plan?.cut ? P().cutTypeText(r.plan.cut) : '—']); });
    });
    d.add(table({title: 'Detalle de suertes', size: 7,
      columns: [{label: 'Suerte', w: 0.55, bold: true}, {label: 'Área (ha)', w: 0.66, align: 'right'}, {label: 'Variedad', w: 1.02}, {label: '# de cortes', w: 0.5, align: 'right'}, {label: 'Tipo de riego', w: 0.86}, {label: 'Edad (meses)', w: 0.6, align: 'right'},
        {label: 'Fecha corte/siembra', w: 0.86}, {label: 'TCH anterior Z' + latestL(), w: 0.7, align: 'right'}, {label: 'TCH estimado Z' + est, w: 0.7, align: 'right'}, {label: 'Fecha para cosecha', w: 0.86}, {label: 'Tipo de corte', w: 1.05}],
      rows: out, total: ['Total', fmt(S.inventoryArea), null, null, null, ageV !== '—' ? ageV : null, null, fmt(ent?.latest?.tch), fmt(S.estimateTch), null, null]}));
    return {doc: d, name: ext => E.fileName('Cronologico', p.name, null, ext), check: {suertes: rows.length, placed: out.filter(r => !r.section).length}};
  }

  // ======================= Cronológico de Suerte =======================
  function cronoLot(A, node, code, lot) {
    const p = window.CRONO_DATA.producers.find(x => String(x.code) === String(code)), r = p?.details.find(x => String(x.codLote) === String(lot)); if (!r) throw new Error('Suerte no encontrada.');
    const K = panelKpis(node), T = officialTable(node), m = window.CRONO_DATA.meta || {}, est = m.estimateSeason || '26/27';
    const col = Object.fromEntries(T.heads.map((h, i) => [h, i])), o = T.rows.find((x, i) => (cellText(T.nodes[i].children[0].querySelector('b')) || x[0]) === String(lot)) || T.rows[0] || [];
    const d = new E.Doc(A, {title: 'Cronológico de Suerte', subject: p.name + ' · Suerte ' + r.suerte, consulta: now(),
      lines: ['Código ' + r.codLote + ' · Finca ' + p.code + ' · Zona ' + (o[col['Zona']] || r.zona || '—') + ' · Variedad ' + (o[col['Variedad']] || r.variedad || '—') + ' · Tenencia ' + (o[col['Tenencia']] || '—')]});
    d.newPage('portrait');
    const fk = K['Fecha para cosecha ' + est] || {}, [aV, aU] = split(K['Área activa']?.value), [ageV] = split(K['Edad actual']?.value);
    d.add(kpis([
      {label: 'TCH estimado Z' + est, value: K['TCH Estim. Z' + est]?.value || '—', unit: 't/ha', accent: C.blue},
      {label: 'Fecha para cosecha', value: fk.value || '—', accent: C.petrol},
      {label: 'Área', value: aV, unit: aU},
      {label: 'Edad actual', value: ageV, unit: 'meses'}], 4));
    // Gráfico: mismo cálculo que el Cronológico (normalizeHistoricalRows; últimas 8 zafras; promedio simple).
    const lc = lots().find(l => String(l[0]) === String(lot));
    const trend = lc ? window.CASUR_HISTORICAL_ENGINE.normalizeHistoricalRows([lc]).map(x => ({zafra: x.zafra, tch: x.tchStored})).filter(x => x.tch != null).sort((a, b) => a.zafra - b.zafra).slice(-8) : [];
    const avg = trend.length ? trend.reduce((n, x) => n + Number(x.tch), 0) / trend.length : null;
    d.add(chart({title: 'TCH por zafra', labels: trend.map(x => zlabel(x.zafra)), series: [{name: 'TCH', color: C.petrol, values: trend.map(x => Number(x.tch))}], ref: avg, refLabel: 'Promedio ' + fmt(avg), height: 236}));
    const h = histTch(lot), opt = r.forecastOptimistic, surco = o[col['Surco']];
    d.add(groups([
      [{title: 'Caracterización', items: [['# de cortes', o[col['# de Corte']]], ['Textura', o[col['Textura']]], ['Tipo de riego', o[col['Tipo de riego']]], ['Distancia entre surcos', surco && surco !== '—' ? surco + ' m' : '—'], ['Fecha de siembra', date(r.fSiembra)], ['Fecha de último corte', date(r.fUltCte)], ['Destino', o[col['Destino Cultivo']]]]},
        {title: 'Ubicación', items: [['Distancia', (o[col['Distancia (km)']] || '—') + (num(o[col['Distancia (km)']]) != null ? ' km' : '')]]}],
      [{title: 'Datos productivos', items: [['TCH anterior Z' + latestL(), h ? fmt(h.tch) + ' t/ha' : '—'], ['TCH estim. Z' + est, num(o[col['TCH est. ' + est]]) != null ? o[col['TCH est. ' + est]] + ' t/ha' : '—'], ['Toneladas estimadas Z' + est, o[col['Ton. est. ' + est]]], ['Área cosechada Z' + latestL(), h ? fmt(h.area) + ' ha' : '—']]},
        {title: 'Plan de cosecha', items: [['Tipo de corte', r.plan?.cut ? P().cutTypeText(r.plan.cut) : '—'], ['Edad proyectada a cosecha', r.plan?.calculatedAge != null ? fmt(r.plan.calculatedAge) + ' meses' : '—']]},
        opt ? {title: 'Escenario optimista', items: [['TCH optimista', fmt(opt.tch) + ' t/ha'], ['Toneladas optimistas', fmt(opt.tons) + ' t']]} : null]]));
    return {doc: d, name: ext => E.fileName('Cronologico', p.name, r.suerte, ext), check: {lot: String(lot), trend: trend.length}};
  }

  // ======================= Histórico (finca y suerte) =======================
  const histName = node => cellText(node.querySelector('.print-meta strong'));
  const zafraSpan = () => { const z = window.APP_DATA?.meta?.zafras || []; return 'Zafras ' + (z[0]?.label || '—') + ' a ' + latestL(); };
  // KPI del panel oficial (área, TCH, KATM y edad de la zafra más reciente; distancia como complemento).
  function histKpis(d, node, T) {
    const K = panelKpis(node), ar = kpi(K, /^Área/i), tc = kpi(K, /^TCH/i), ka = kpi(K, /^KATM/i), ed = kpi(K, /^Edad/i), di = kpi(K, /^Distancia/i);
    // Zafra de los KPI: la fila del resumen oficial con la misma área y el mismo TCH (la más reciente si hay varias).
    const ca = T.heads.indexOf('Área'), cz = T.heads.indexOf('Zafra'), ct = T.heads.findIndex(h => /^TCH/.test(h));
    const zr = T.rows.filter(x => x[ca] === split(ar?.value)[0] && x[ct] === split(tc?.value)[0]).at(-1), zs = zr ? ' Z' + zr[cz] : '';
    const [aV, aU] = split(ar?.value), [eV] = split(ed?.value), [dV, dU] = split(di?.value);
    d.add(kpis([{label: 'Área cosechada' + zs, value: aV, unit: aU}, {label: 'TCH' + zs, value: split(tc?.value)[0], unit: 't/ha', accent: C.gold}, {label: 'KATM' + zs, value: split(ka?.value)[0], unit: 'kg/t', accent: '#5B8E7D'}, {label: 'Edad' + zs, value: eV, unit: 'meses'}], 4));
    d.add(kpis([{label: 'Distancia', value: dV, unit: dU}], 4, true));
  }
  // fill: los dos gráficos ocupan el resto de la página (Histórico de Finca: página 1 = KPI + gráficos).
  // TCH histórico = toneladas ÷ área de todas las zafras del Histórico (mismo criterio que «Vs histórico» del panel).
  const histAvg = L => { let t = 0, a = 0; L.forEach(l => (l[11] || []).forEach(x => { t += x[2] || 0; a += x[1] || 0; })); return a ? t / a : null; };
  const histCharts = (d, labels, tch, katm, fill, avg) => {
    const hh = fill ? Math.min(250, Math.floor((d.bottom - d.y - 10) / 2)) : 0;
    d.add(chart({title: 'TCH por zafra', labels, series: [{name: 'TCH', color: C.petrol, values: tch}], ref: avg, refLabel: 'TCH histórico ' + fmt(avg), height: hh || 170}));
    d.add(chart({title: 'KATM por zafra', labels, series: [{name: 'KATM', color: '#5B8E7D', values: katm}], height: hh || 160}));
  };

  function histFarm(A, node, code) {
    const T = officialTable(node); if (!T) throw new Error('Resumen por zafra no disponible.');
    const c = Object.fromEntries(T.heads.map((h, i) => [h, i])), name = histName(node), ent = (window.mainEntities?.() || []).find(e => String(e.code) === String(code));
    const d = new E.Doc(A, {title: 'Histórico de Finca', subject: name + ' · Código ' + code, consulta: now(), lines: ['Zona ' + (ent?.latest?.zona || T.rows.at(-1)?.[c['Zona']] || '—'), zafraSpan()]});
    d.newPage('portrait'); histKpis(d, node, T);
    const zf = T.rows.map(r => r[c['Zafra']]); histCharts(d, zf, T.rows.map(r => num(r[c['TCH pond.']])), T.rows.map(r => num(r[c['KATM pond.']])), true, histAvg(lots().filter(l => String(l[8]) === String(code) && !/MAQUILA/i.test(l[2] || ''))));
    d.newPage();
    const cols = [['Zafra', 'Zafra', 0.7], ['Área', 'Área (ha)', 0.85], ['Ton', 'Toneladas', 0.95], ['TCH pond.', 'TCH', 0.75], ['KATM pond.', 'KATM', 0.75], ['Edad prom.', 'Edad (meses)', 0.8], ['Variedad dom.', 'Variedad', 1.15], ['Riego', 'Tipo de riego', 1], ['Suertes', 'Suertes', 0.65]].filter(([k]) => k in c);
    const right = new Set(['Área', 'Ton', 'TCH pond.', 'KATM pond.', 'Edad prom.', 'Suertes']);
    d.add(table({title: 'Resumen por zafra', columns: cols.map(([k, l, w]) => ({label: l, w, align: right.has(k) ? 'right' : 'left', bold: k === 'Zafra'})), rows: T.rows.map(r => cols.map(([k]) => r[c[k]]))}));
    // Detalle por suerte y zafra: lotes de la finca en el Histórico (lotCompact, sin Maquila); TCH de cada zafra.
    const L = lots().filter(l => String(l[8]) === String(code) && !/MAQUILA/i.test(l[2] || '')).sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'es', {numeric: true}));
    const zs = (window.APP_DATA?.meta?.zafras || []).map(z => z.value), dup = new Set(L.map(l => l[10])).size !== L.length;
    const rows = L.map(l => { const by = new Map((l[11] || []).map(x => [x[0], x])), a = (l[11] || []).reduce((n, x) => n + (x[1] || 0), 0), t = (l[11] || []).reduce((n, x) => n + (x[2] || 0), 0), last = by.get(latestZ());
      return [dup ? String(l[0]) : (l[10] || String(l[0])), l[3] || '—', ...zs.map(z => by.get(z) ? fmt(by.get(z)[3]) : '—'), a ? fmt(t / a) : '—', last ? fmt(last[1]) : '—']; });
    d.add(table({title: 'TCH por suerte y zafra', size: 6.6,
      columns: [{label: 'Suerte', w: 0.62, bold: true}, {label: 'Variedad', w: 1.25}, ...zs.map(z => ({label: zlabel(z), w: 0.66, align: 'right'})), {label: 'TCH período', w: 0.72, align: 'right', bold: true}, {label: 'Área Z' + latestL() + ' (ha)', w: 0.8, align: 'right'}], rows}));
    const latestArea = L.reduce((n, l) => n + ((l[11] || []).find(x => x[0] === latestZ())?.[1] || 0), 0);
    return {doc: d, name: ext => E.fileName('Historico', name, null, ext), check: {zafras: T.rows.length, lots: L.length, latestArea}};
  }

  function histLot(A, node, lot) {
    const T = officialTable(node); if (!T) throw new Error('Detalle del lote no disponible.');
    const c = Object.fromEntries(T.heads.map((h, i) => [h, i])), lc = lots().find(l => String(l[0]) === String(lot)) || [], farm = lc[9] || histName(node).split(' · ')[0], suerte = lc[10] || T.rows[0]?.[c['Suerte']];
    // Variedad y tipo de riego vigentes del lote: en el encabezado, no como registros por zafra.
    const d = new E.Doc(A, {title: 'Histórico de Suerte', subject: farm + ' · Suerte ' + suerte, consulta: now(),
      lines: ['Código ' + lot + ' · Finca ' + (lc[8] || '—') + ' · Zona ' + (lc[2] || '—'), 'Variedad ' + (lc[3] || '—') + ' · Tipo de riego ' + (lc[4] || '—') + ' · ' + zafraSpan()]});
    d.newPage('portrait'); histKpis(d, node, T);
    histCharts(d, T.rows.map(r => r[c['Zafra']]), T.rows.map(r => num(r[c['TCH']])), T.rows.map(r => num(r[c['KATM']])), false, histAvg(lc.length ? [lc] : []));
    const cols = [['Zafra', 'Zafra'], ['Área', 'Área (ha)'], ['Ton', 'Toneladas'], ['TCH', 'TCH'], ['KATM', 'KATM'], ['Edad', 'Edad (meses)'], ['Corte', '# de cortes']].filter(([k]) => k in c);
    d.add(table({title: 'Registro por zafra', columns: cols.map(([k, l]) => ({label: l, w: 1, align: k === 'Zafra' ? 'left' : 'right', bold: k === 'Zafra'})), rows: T.rows.map(r => cols.map(([k]) => k === 'Corte' && num(r[c[k]]) != null ? fmt(num(r[c[k]]), 0) : r[c[k]]))}));
    return {doc: d, name: ext => E.fileName('Historico', farm, suerte, ext), check: {lot: String(lot), zafras: T.rows.length}};
  }

  // ======================= despacho =======================
  function resolve(kind, node) {
    if (kind === 'cronologico') { const c = document.getElementById('cronoContent'), code = document.getElementById('cronoProducerSelect')?.value, scope = c?.dataset.geoScope;
      if (scope === 'lot' && c.dataset.geoLotId) return {template: 'cronologico-suerte', build: A => cronoLot(A, node, code, c.dataset.geoLotId)};
      if (scope === 'farm' && code) return {template: 'cronologico-finca', build: A => cronoFarm(A, node, code)}; return null; }
    if (kind === 'historico') { const meta = cellText(node.querySelector('.print-meta')), lot = meta.match(/Código\s+(\S+)\s*·\s*Hacienda/), farm = meta.match(/Código\s+(\S+)/);
      if (lot) return {template: 'historico-suerte', build: A => histLot(A, node, lot[1])}; if (farm) return {template: 'historico-finca', build: A => histFarm(A, node, farm[1])}; }
    return null;
  }
  async function exportReport(kind, type, node) {
    const job = resolve(kind, node); if (!job) return null;
    const A = await E.assets(), {doc, check, name} = job.build(A); doc.footers();
    const out = type === 'image' ? await E.toPng(doc) : {blob: E.toPdf(doc)}, file = name(type === 'image' ? 'png' : 'pdf');
    window.CASUR_REPORTS.last = {template: job.template, type, name: file, pages: doc.pages.map(p => p.orientation), check, audit: doc.audit(), png: out.size || null};
    return {blob: out.blob, template: job.template, name: file};
  }
  window.CASUR_REPORTS = {export: exportReport, resolve, last: null, version: 'R2-2'};
})();
