/* CASUR · Plantillas de informe: Cronológico de Finca / de Suerte, Histórico de Finca / de Suerte.
   Norma editorial: docs/ESTANDAR_EDITORIAL_INFORMES.md (minimalismo informativo ejecutivo). Los informes muestran solo
   etiqueta, valor y unidad; la trazabilidad de cada cifra vive aquí, en las pruebas y en la documentación técnica:
   - Panel oficial del informe (#cronoPrintPanel / #printPanel): KPI y tablas oficiales, leídos tal cual (no se recalculan).
   - TCH estimado / toneladas Z26/27: aforo oficial (columnas AD/AE), vía la tabla oficial del Cronológico.
   - TCH anterior Z25/26: Histórico (ejecutado). Finca = mainEntities().latest.tch; suerte = APP_DATA.lotCompact por código
     de lote exacto, zafra más reciente. Sin registro histórico → «—» (nunca se sustituye por la columna TCH del aforo).
   - Fecha para cosecha / tipo de corte / edad proyectada: plan de cosecha (BE/BF, r.plan).
   - Escenario optimista: AF/AG (r.forecastOptimistic).
   - Composición: CASUR_CRONO_PARTICIPATION.agronomicGroups (área activa por categoría original).
   R3 (27-Nov-2026): Cronológico múltiple (CASUR_CRONO_SELECTION), Histórico multifinca ejecutivo/completo
   (getHistoricoDualSummary + historicoMultiReportCharts) y Zona (CASUR_ZONE_UX14), con el mismo motor y la misma norma. */
(function () {
  'use strict';
  const E = window.CASUR_REPORT_ENGINE, {C, chips, map, fmt, date, now, zlabel, cellText, panelKpis, officialTable, ageOf, kpis, groups, composition, chart, table, heading} = E;
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
  // KATM histórico = Σ(KATM × toneladas) ÷ Σ toneladas de todas las zafras (mismo criterio que el KATM ponderado).
  const histAvgK = L => { let k = 0, t = 0; L.forEach(l => (l[11] || []).forEach(x => { if (x[4] != null && x[2] > 0) { k += x[4] * x[2]; t += x[2]; } })); return t ? k / t : null; };
  const kRef = v => ({ref: v, refLabel: 'KATM histórico ' + fmt(v)});
  const histCharts = (d, labels, tch, katm, fill, avg, katmAvg) => {
    const hh = fill ? Math.min(250, Math.floor((d.bottom - d.y - 10) / 2)) : 0;
    d.add(chart({title: 'TCH por zafra', labels, series: [{name: 'TCH', color: C.petrol, values: tch}], ref: avg, refLabel: 'TCH histórico ' + fmt(avg), height: hh || 170}));
    d.add(chart({title: 'KATM por zafra', labels, series: [{name: 'KATM', color: '#5B8E7D', values: katm}], ...kRef(katmAvg), height: hh || 160}));
  };

  function histFarm(A, node, code) {
    const T = officialTable(node); if (!T) throw new Error('Resumen por zafra no disponible.');
    const c = Object.fromEntries(T.heads.map((h, i) => [h, i])), name = histName(node), ent = (window.mainEntities?.() || []).find(e => String(e.code) === String(code));
    const d = new E.Doc(A, {title: 'Histórico de Finca', subject: name + ' · Código ' + code, consulta: now(), lines: ['Zona ' + (ent?.latest?.zona || T.rows.at(-1)?.[c['Zona']] || '—'), zafraSpan()]});
    d.newPage('portrait'); histKpis(d, node, T);
    const zf = T.rows.map(r => r[c['Zafra']]); histCharts(d, zf, T.rows.map(r => num(r[c['TCH pond.']])), T.rows.map(r => num(r[c['KATM pond.']])), true, histAvg(lots().filter(l => String(l[8]) === String(code) && !/MAQUILA/i.test(l[2] || ''))), histAvgK(lots().filter(l => String(l[8]) === String(code) && !/MAQUILA/i.test(l[2] || ''))));
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
    histCharts(d, T.rows.map(r => r[c['Zafra']]), T.rows.map(r => num(r[c['TCH']])), T.rows.map(r => num(r[c['KATM']])), false, histAvg(lc.length ? [lc] : []), histAvgK(lc.length ? [lc] : []));
    const cols = [['Zafra', 'Zafra'], ['Área', 'Área (ha)'], ['Ton', 'Toneladas'], ['TCH', 'TCH'], ['KATM', 'KATM'], ['Edad', 'Edad (meses)'], ['Corte', '# de cortes']].filter(([k]) => k in c);
    d.add(table({title: 'Registro por zafra', columns: cols.map(([k, l]) => ({label: l, w: 1, align: k === 'Zafra' ? 'left' : 'right', bold: k === 'Zafra'})), rows: T.rows.map(r => cols.map(([k]) => k === 'Corte' && num(r[c[k]]) != null ? fmt(num(r[c[k]]), 0) : r[c[k]]))}));
    return {doc: d, name: ext => E.fileName('Historico', farm, suerte, ext), check: {lot: String(lot), zafras: T.rows.length}};
  }


  // ======================= R3 · utilidades compartidas =======================
  const sumBy = (list, f) => list.reduce((n, x) => n + (Number(f(x)) || 0), 0);
  const wavg = (list, v, w) => { let a = 0, b = 0; list.forEach(x => { const vv = v(x), ww = w(x); if (vv != null && Number.isFinite(Number(vv)) && ww > 0) { a += vv * ww; b += ww; } }); return b ? a / b : null; };
  const zoneShort = z => String(z || '').replace(/^\s*\d+\s*-\s*/, '').replace(/^ZONA\s+/i, '').toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()) || 'Todas';
  // TCH ejecutado (Histórico) de la zafra más reciente para un conjunto de códigos de lote: toneladas ÷ área.
  const histTchOf = codes => { const set = new Set(codes.map(String)), z = latestZ(); let t = 0, a = 0; lots().forEach(l => { if (!set.has(String(l[0]))) return; const x = (l[11] || []).find(y => y[0] === z); if (x) { t += x[2] || 0; a += x[1] || 0; } }); return a ? t / a : null; };
  const SUERTE_COLS = (est, first = 'Suerte') => [{label: first, w: 0.55, bold: true}, {label: 'Área (ha)', w: 0.66, align: 'right'}, {label: 'Variedad', w: 1.02}, {label: '# de cortes', w: 0.5, align: 'right'}, {label: 'Tipo de riego', w: 0.86}, {label: 'Edad (meses)', w: 0.6, align: 'right'},
    {label: 'Fecha corte/siembra', w: 0.86}, {label: 'TCH anterior Z' + latestL(), w: 0.7, align: 'right'}, {label: 'TCH estimado Z' + est, w: 0.7, align: 'right'}, {label: 'Fecha para cosecha', w: 0.86}, {label: 'Tipo de corte', w: 1.05}];
  // Fila de suerte construida desde el registro del aforo (mismas reglas que la tabla oficial del Cronológico).
  const suerteRow = (r, est) => { const pr = O().participation(r), f = P().forecastForRow ? P().forecastForRow(r, est) : {tch: r.tchEst2627}, h = histTch(r.codLote);
    return [r.suerte || '—', fmt(pr.activeArea || 0), r.variedad || '—', r.corte || '—', r.tipoRiego || '—', r.renovacion && !r.fSiembra ? 'Renovación' : fmt(ageOf(r)), date(r.fBase || r.fUltCte || r.fSiembra),
      h ? fmt(h.tch) : '—', pr.activeArea > 0 ? fmt(f?.tch) : fmt(0), date(r.plan?.date?.iso), r.plan?.cut ? P().cutTypeText(r.plan.cut) : '—']; };

  // ======================= Cronológico múltiple =======================
  // Selección exacta del usuario (CASUR_CRONO_SELECTION: claves «código::suerte»), agrupada por finca y suerte.
  function cronoMulti(A) {
    const keys = window.CASUR_CRONO_SELECTION?.capture?.().keys || [], m = window.CRONO_DATA.meta || {}, est = m.estimateSeason || '26/27';
    const list = keys.map(k => { const [code, suerte] = String(k).split('::'), p = window.CRONO_DATA.producers.find(x => String(x.code) === code), r = p?.details.find(x => String(x.suerte) === suerte); return r ? {p, r} : null; }).filter(Boolean);
    if (!list.length) throw new Error('No hay suertes seleccionadas.');
    const rows = list.map(x => x.r), S = P().summary(rows), part = r => O().participation(r), act = rows.filter(r => part(r).activeArea > 0);
    const farms = [...new Map(list.map(x => [String(x.p.code), x.p])).values()].sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));
    const age = wavg(act, ageOf, r => part(r).activeArea), dist = wavg(act, r => r.distancia, r => part(r).activeArea), tchAnt = histTchOf(rows.map(r => r.codLote));
    const d = new E.Doc(A, {title: 'Cronológico · Selección múltiple', subject: fmt(farms.length, 0) + (farms.length === 1 ? ' finca' : ' fincas') + ' · ' + fmt(rows.length, 0) + (rows.length === 1 ? ' suerte' : ' suertes'), consulta: now(),
      lines: [farms.map(p => p.name + ' (' + p.code + ')').join(' · ')]});
    d.newPage('portrait');
    d.add(kpis([{label: 'Área activa', value: fmt(S.inventoryArea), unit: 'ha'}, {label: 'TCH estimado Z' + est, value: fmt(S.estimateTch), unit: 't/ha', accent: C.blue},
      {label: 'TCH anterior Z' + latestL(), value: fmt(tchAnt), unit: 't/ha', accent: C.gold}, {label: 'Edad actual', value: fmt(age), unit: 'meses'}], 4));
    d.add(kpis([{label: 'Toneladas estimadas Z' + est, value: fmt(S.estimateTons), unit: 't'}, {label: 'Distancia', value: fmt(dist), unit: 'km'}, {label: 'Fincas', value: fmt(farms.length, 0)}, {label: 'Suertes', value: fmt(rows.length, 0)}], 4, true));
    const cards = comps(rows); if (cards.some(c => c.items.length)) { d.add(heading('Composición del área activa', null, 90)); d.add(composition(cards, 2)); }
    const out = [];
    farms.forEach(p => { const fr = list.filter(x => String(x.p.code) === String(p.code)).map(x => x.r).sort(byCode);
      out.push({section: p.name + ' · Código ' + p.code + ' · ' + fmt(fr.length, 0) + (fr.length === 1 ? ' suerte' : ' suertes') + ' · ' + fmt(sumBy(fr, r => part(r).activeArea)) + ' ha'});
      fr.forEach(r => out.push(suerteRow(r, est))); });
    d.add(table({title: 'Detalle por finca y suerte', size: 7, columns: SUERTE_COLS(est), rows: out, total: ['Total', fmt(S.inventoryArea), null, null, null, fmt(age), null, fmt(tchAnt), fmt(S.estimateTch), null, null]}));
    return {doc: d, name: ext => E.fileName('Cronologico', 'Multifinca', null, ext), check: {suertes: rows.length, placed: out.filter(r => !r.section).length, farms: farms.length, keys: keys.length}};
  }

  // ======================= Histórico multifinca (ejecutivo y completo) =======================
  // Fuente: getHistoricoDualSummary() / historicoMultiReportCharts() del Histórico (selección exacta, incluidas las
  // selecciones parciales de suertes, y período elegido). Nada se recalcula salvo agregaciones toneladas ÷ área de R.rows.
  const agg = rs => { const area = sumBy(rs, x => x.area), ton = sumBy(rs, x => x.ton); return {area, ton, tch: area ? ton / area : null, katm: wavg(rs, x => x.katm, x => x.ton), edad: wavg(rs, x => x.edad, x => x.area), suertes: new Set(rs.map(x => x.lotId)).size}; };
  const zafraRows = (series) => series.map(z => [zlabel(z.zafra), fmt(z.area), fmt(z.ton, 0), fmt(z.tch), fmt(z.katm), fmt(z.edad), fmt(z.suertes, 0)]);
  const ZAFRA_COLS = [{label: 'Zafra', w: 0.8, bold: true}, {label: 'Área (ha)', w: 1, align: 'right'}, {label: 'Toneladas', w: 1, align: 'right'}, {label: 'TCH', w: 0.8, align: 'right'}, {label: 'KATM', w: 0.8, align: 'right'}, {label: 'Edad (meses)', w: 0.9, align: 'right'}, {label: 'Suertes', w: 0.7, align: 'right'}];
  const FARM_COLORS = ['#1F4E5C', '#3491b7', '#C9A54B', '#5B8E7D', '#7C6A9E', '#B4534B', '#86A0AA'];
  const zafraList = zs => zs.length === 1 ? 'Período ' + zlabel(zs[0]) : zs.length === 2 ? 'Período ' + zlabel(zs[0]) + ' a ' + zlabel(zs[1]) + ' · 2 zafras' : 'Período: ' + zs.length + ' zafras · ' + zs.map(zlabel).join(' · ');
  // Mapa de la selección: geometrías oficiales (historicalMapModel); fincas cercanas en un solo mapa, lejanas por separado.
  async function selectionMap(sel) {
    let model; try { model = await window.historicalMapModel?.(sel); } catch (e) { return null; } if (!model || !model.available) return null;
    const color = f => FARM_COLORS[sel.findIndex(x => String(x.farmCode) === String(f.farmCode)) % FARM_COLORS.length];
    const pts = fs => fs.flatMap(f => f.geometry.type === 'Polygon' ? f.geometry.coordinates.flat() : f.geometry.coordinates.flat(2));
    const ext = fs => { const p = pts(fs); return Math.max(Math.max(...p.map(q => q[0])) - Math.min(...p.map(q => q[0])), Math.max(...p.map(q => q[1])) - Math.min(...p.map(q => q[1]))); };
    const farms = model.farms.filter(f => f.features.length), nearby = ext(farms.flatMap(f => f.features)) <= 4 * Math.max(...farms.map(f => ext(f.features)));
    const label = (f, id) => { const pre = String(f.farmCode), suf = String(id).startsWith(pre) ? String(id).slice(pre.length) : ''; return /^\d{1,3}[A-Z]*$/.test(suf) ? suf : String(id); };
    const build = group => ({shapes: group.flatMap(f => f.features.flatMap(g => (g.geometry.type === 'Polygon' ? [g.geometry.coordinates] : g.geometry.coordinates).map(rings => ({rings, color: color(f), context: f.contextIds.includes(g.properties.lotId)})))),
      labels: group.flatMap(f => f.features.filter(g => f.highlightedIds.includes(g.properties.lotId) && g.properties.anchor).map(g => ({at: g.properties.anchor, text: label(f, g.properties.lotId)})))});
    return {groups: nearby ? [{farms, ...build(farms)}] : farms.map(f => ({farms: [f], ...build([f])})), color};
  }
  async function histMulti(A, variant) {
    const S = window.getHistoricoDualSummary?.(), R = window.historicoMultiReportCharts?.(); if (!S || !S.selection?.length) throw new Error('No hay fincas seleccionadas.');
    const complete = variant === 'complete', sel = S.selection, zs = S.selectedZafras || [], one = zs.length === 1, zsuf = one ? ' Z' + zlabel(zs[0]) : '', all = S.availableZafras || [];
    const d = new E.Doc(A, {title: 'Histórico Multifinca', subject: fmt(sel.length, 0) + (sel.length === 1 ? ' finca' : ' fincas') + ' · ' + fmt(S.period.suertes, 0) + ' suertes', consulta: now(),
      lines: [zafraList(zs), 'Histórico: ' + all.length + ' zafras · ' + zlabel(all[0]) + ' a ' + zlabel(all[all.length - 1])]});
    const M = await selectionMap(sel), fcol = f => FARM_COLORS[sel.indexOf(f) % FARM_COLORS.length];
    d.newPage('portrait');
    // Fincas seleccionadas: fichas con el color de cada finca en el mapa.
    d.add(chips('Fincas seleccionadas', sel.map(f => ({color: fcol(f), title: f.farmName + ' · ' + f.farmCode, sub: f.mode === 'full' ? 'Finca completa · ' + fmt(f.lotIds.length, 0) + ' suertes' : fmt(f.lotIds.length, 0) + (f.lotIds.length === 1 ? ' suerte seleccionada' : ' suertes seleccionadas')}))));
    const P0 = S.period;
    d.add(kpis([{label: 'Área cosechada' + zsuf, value: fmt(P0.area), unit: 'ha'}, {label: 'TCH' + zsuf, value: fmt(P0.tch), unit: 't/ha', accent: C.gold}, {label: 'KATM' + zsuf, value: fmt(P0.katm), unit: 'kg/t', accent: '#5B8E7D'}, {label: 'Edad' + zsuf, value: fmt(P0.edad), unit: 'meses'}], 4));
    d.add(kpis([{label: 'Toneladas', value: fmt(P0.ton, 0), unit: 't'}, {label: 'Distancia', value: fmt(S.currentDistance?.kmWeighted), unit: 'km'}, {label: 'Fincas', value: fmt(sel.length, 0)}, {label: 'Suertes', value: fmt(P0.suertes, 0)}], 4, true));
    const ser = S.series || [];
    d.add(chart({title: 'TCH por zafra', labels: ser.map(z => zlabel(z.zafra)), series: [{name: 'TCH', color: C.petrol, values: ser.map(z => z.tch)}], ref: S.full?.tch, refLabel: 'TCH histórico ' + fmt(S.full?.tch), height: 168}));
    d.add(chart({title: 'KATM por zafra', labels: ser.map(z => zlabel(z.zafra)), series: [{name: 'KATM', color: '#5B8E7D', values: ser.map(z => z.katm)}], ...kRef(S.full?.katm), height: 152}));
    // Resumen comparativo por finca (período elegido) y TCH por finca y zafra.
    const farms = S.analysis?.farms || R?.result?.farms || [];
    d.add(table({title: 'Resumen por finca' + (one ? ' · Z' + zlabel(zs[0]) : ''), columns: [{label: 'Finca', w: 1.7, bold: true}, {label: 'Código', w: 0.6}, {label: 'Suertes', w: 0.6, align: 'right'}, {label: 'Área (ha)', w: 0.9, align: 'right'}, {label: 'Toneladas', w: 0.9, align: 'right'}, {label: 'TCH', w: 0.7, align: 'right'}, {label: 'KATM', w: 0.7, align: 'right'}, {label: 'Edad (meses)', w: 0.8, align: 'right'}, {label: 'Distancia (km)', w: 0.8, align: 'right'}],
      rows: farms.map(f => [f.farmName, f.farmCode, fmt(f.suertes, 0), fmt(f.area), fmt(f.ton, 0), fmt(f.tch), fmt(f.katm), fmt(f.edad), fmt(f.currentDistance?.kmWeighted)]),
      total: ['Total', null, fmt(P0.suertes, 0), fmt(P0.area), fmt(P0.ton, 0), fmt(P0.tch), fmt(P0.katm), fmt(P0.edad), fmt(S.currentDistance?.kmWeighted)]}));
    const rowsAll = (R?.rows || []).filter(x => sel.some(f => String(f.farmCode) === String(x.farmCode) && f.lotIds.map(String).includes(String(x.lotId))));
    const byFarmZ = (fc, z) => agg(rowsAll.filter(x => String(x.farmCode) === String(fc) && x.zafra === z));
    d.add(table({title: 'TCH por finca y zafra', size: 6.8, columns: [{label: 'Finca', w: 1.5, bold: true}, ...all.map(z => ({label: zlabel(z), w: 0.6, align: 'right'})), {label: 'TCH período completo', w: 0.8, align: 'right', bold: true}],
      rows: sel.map(f => { const fr = rowsAll.filter(x => String(x.farmCode) === String(f.farmCode)), t = agg(fr); return [f.farmName, ...all.map(z => { const v = byFarmZ(f.farmCode, z); return v.area ? fmt(v.tch) : '—'; }), fmt(t.tch)]; }),
      total: ['Total selección', ...all.map(z => fmt(ser.find(x => x.zafra === z)?.tch)), fmt(S.full?.tch)]}));
    // Mapa de fincas y suertes seleccionadas (ejecutivo, completo y PNG).
    const mapStats = [];
    if (M) { d.section('portrait'); d.add(heading('Mapa de fincas y suertes seleccionadas', null, 160));
      M.groups.forEach(g => { d.add(chips(null, g.farms.map(f => ({color: M.color(f), title: f.farmName + ' · ' + f.farmCode, sub: f.mode === 'full' ? 'Finca completa' : fmt(f.highlightedIds.length, 0) + ' suertes seleccionadas'}))));
        d.add(map({shapes: g.shapes, labels: g.labels, maxHeight: M.groups.length > 1 ? 300 : 560, onDraw: st => mapStats.push(st)})); }); }
    let lotsShown = 0;
    if (complete) {
      d.section('portrait');
      d.add(table({title: 'Resumen por zafra · selección', columns: ZAFRA_COLS, rows: zafraRows(ser)}));
      sel.forEach(f => {
        const fr = rowsAll.filter(x => String(x.farmCode) === String(f.farmCode)), zser = all.map(z => ({zafra: z, ...agg(fr.filter(x => x.zafra === z))})).filter(z => z.area > 0);
        d.add(heading(f.farmName + ' · Código ' + f.farmCode + (f.mode === 'full' ? '' : ' · ' + fmt(f.lotIds.length, 0) + ' suertes seleccionadas'), null, 120));
        d.add(table({title: 'Resumen por zafra', columns: ZAFRA_COLS, rows: zafraRows(zser)}));
        const lotIds = [...new Set(fr.map(x => String(x.lotId)))].sort((a, b) => a.localeCompare(b, 'es', {numeric: true})); lotsShown += lotIds.length;
        const sv = new Map(fr.map(x => [String(x.lotId), x.suerte])), dup = new Set(lotIds.map(id => sv.get(id))).size !== lotIds.length;
        d.add(table({title: 'TCH por suerte y zafra', size: 6.6, columns: [{label: 'Suerte', w: 0.62, bold: true}, ...all.map(z => ({label: zlabel(z), w: 0.66, align: 'right'})), {label: 'TCH período', w: 0.72, align: 'right', bold: true}],
          rows: lotIds.map(id => { const lr = fr.filter(x => String(x.lotId) === id), t = agg(lr); return [dup ? id : (sv.get(id) || id), ...all.map(z => { const v = lr.filter(x => x.zafra === z); return v.length ? fmt(agg(v).tch) : '—'; }), fmt(t.tch)]; })}));
      });
    }
    return {doc: d, name: ext => E.fileName('Historico', 'Multifinca ' + (complete ? 'Completo' : 'Ejecutivo'), null, ext), check: {farms: sel.length, rows: rowsAll.length, lotsShown, zafras: ser.length, period: zs.length, variant: complete ? 'complete' : 'executive', map: mapStats}};
  }

  // ======================= Zona (Cronológico e Histórico) =======================
  // Fuente: nodo de exportación del Análisis por Zona (CASUR_ZONE_UX14.exportNode, todas las filas), leído tal cual;
  // series por zafra de CASUR_ZONE_UX14.histFigures(zona).official.
  const uxKpis = root => [...root.querySelectorAll('.ux14-kpis .ux14-kpi')].map(k => { const st = k.querySelector('strong'), unit = cellText(st?.querySelector('small')); return {label: [...k.querySelector('.ux14-kpi-label').childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim(), value: cellText(st).replace(unit, '').trim(), unit, cls: k.className}; });
  const uxStrip = root => Object.fromEntries([...root.querySelectorAll('.ux14-strip .ux14-strip-item')].map(i => [cellText(i.children[0]), cellText(i.querySelector('b'))]));
  const uxComps = root => [...root.querySelectorAll('figure.ux14-composition')].map(f => ({title: [...f.querySelector('figcaption').childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim(), total: cellText(f.querySelector('figcaption small')),
    items: [...f.querySelectorAll('ul li')].map(li => ({key: cellText(li.querySelector(':scope > span:not(.ux14-stack)')), value: num(cellText(li.querySelector('b'))), display: cellText(li.querySelector('b')), pct: cellText(li.querySelector('small'))}))}));
  const uxCompare = root => { const f = root.querySelector('figure.ux14-compare'); if (!f) return null; return {keys: [...f.querySelectorAll('.ux14-legend em')].map(cellText), groups: [...f.querySelectorAll('.ux14-group')].map(g => ({name: cellText(g.querySelector('b')), vals: [...g.querySelectorAll('.ux14-bar em')].map(e => cellText(e).split(' · ')[0])}))}; };
  // Tabla de fincas/zonas: columna del nombre primero (texto de impresión, sin enlaces) y sin la posición «#» del ranking.
  const uxTable = root => { const t = root.querySelector('.ux14-farms table'); if (!t) return null; const heads = [...t.querySelectorAll('thead th')].map(cellText);
    const trs = [...t.querySelectorAll('tbody tr')], ni = Math.max(0, [...(trs[0]?.children || [])].findIndex(td => td.querySelector('.ux14-print-name'))), keep = heads.map((h, i) => i).filter(i => heads[i] !== '#' && i !== ni);
    const rows = trs.map(tr => { const c = [...tr.children].map(td => cellText(td.querySelector('.ux14-print-name') || td)); while (c.length < heads.length) c.push('—'); return [c[ni], ...keep.map(i => /solo Histórico/i.test(c[i]) ? '—' : /^[+-]0\.00$/.test(c[i]) ? '0.00' : c[i])]; });
    // Filas sin ningún dato del ámbito (p. ej. zonas presentes solo en el Histórico, en un informe del aforo) se omiten.
    return {title: cellText(root.querySelector('.ux14-farms h4')), heads: [heads[ni] || 'Finca', ...keep.map(i => heads[i])], rows: rows.filter(r => r.slice(1).some(v => v && v !== '—'))}; };
  const HEAD = h => h.replace(/^Área (\d\d\/\d\d)/, 'Área Z$1').replace(/^Δ vs hist\.?$/, 'Δ vs TCH histórico').replace(/\s+ha$/, ' (ha)').replace(/\s+km$/, ' (km)').replace(/\s+t$/, ' (t)').replace(/^Dist\. pond\./, 'Distancia').replace(/^TCH est\. /, 'TCH estimado Z').replace(/^Ton\. est\./, 'Toneladas estimadas').replace(/^TCH (\d\d\/\d\d)$/, 'TCH Z$1');
  const tableFrom = (T, title) => T && table({title, size: 7, columns: T.heads.map((h, i) => ({label: HEAD(h), w: i ? 0.78 : 1.9, align: i ? 'right' : 'left', bold: !i})), rows: T.rows});
  // Filas de la comparación: solo las categorías del propio gráfico comparativo; área y toneladas por tipo de riego se
  // toman de las composiciones de la misma pantalla (cuando la comparación es por zona, esas columnas no aplican).
  const compRows = (C, cmp, byRiego) => { const map = new Map(); (cmp?.groups || []).forEach(g => map.set(g.name, {v: g.vals}));
    if (byRiego) C.forEach((c, ci) => c.items.forEach(it => { const r = map.get(it.key); if (r) r['c' + ci] = it.display; })); return map; };
  function zoneReport(A, kind) {
    const api = window.CASUR_ZONE_UX14, root = api?.exportNode?.(kind); if (!root) throw new Error('Abra primero el análisis de la zona.');
    try {
      const hist = kind === 'zona-historico', zone = root.dataset.zone || '', K = uxKpis(root), st = uxStrip(root), Cc = uxComps(root), cmp = uxCompare(root), T = uxTable(root), m = window.CRONO_DATA.meta || {}, est = m.estimateSeason || '26/27';
      const subject = zone ? (hist ? zone : 'Zona ' + zone) : 'Todas las zonas';
      const H = hist ? api.histFigures(zone, 'Total') : null, ser = H?.official || [];
      const d = new E.Doc(A, {title: hist ? 'Histórico de Zona' : 'Cronológico de Zona', subject, consulta: now(), lines: hist && ser.length ? ['Zafras ' + zlabel(ser[0].zafra) + ' a ' + zlabel(ser[ser.length - 1].zafra)] : []});
      d.newPage('portrait');
      const acc = k => /hist/.test(k.cls) ? C.gold : /est/.test(k.cls) ? C.blue : C.petrol;
      d.add(kpis(K.map(k => ({label: k.label, value: k.value, unit: k.unit, accent: acc(k)})), 4));
      const comp = hist ? [['Edad a cosecha Z' + latestL(), st['Edad a cosecha Z' + latestL()]], ['TCH últimas 3', st['TCH últimas 3']]] : [['Área de molienda', st['Área de molienda']], ['Haciendas activas', st['Haciendas activas']], ['Edad actual', st['Edad actual']], ['TCH est. < 45', st['TCH est. < 45']]];
      d.add(kpis(comp.filter(([, v]) => v).map(([l, v]) => { const [a, u] = split(v); return {label: l, value: a, unit: u === 'TCH' ? 't/ha' : u}; }), 4, true));
      if (hist) {
        d.add(chart({title: 'TCH por zafra', labels: ser.map(z => zlabel(z.zafra)), series: [{name: 'TCH', color: C.petrol, values: ser.map(z => z.tch)}], ref: H.hist, refLabel: 'TCH histórico ' + fmt(H.hist), height: 180}));
        const tk = ser.reduce((n, z) => n + (z.katm != null ? z.ton : 0), 0), kz = tk ? ser.reduce((n, z) => n + (z.katm != null ? z.katm * z.ton : 0), 0) / tk : null;
        d.add(chart({title: 'KATM por zafra', labels: ser.map(z => zlabel(z.zafra)), series: [{name: 'KATM', color: '#5B8E7D', values: ser.map(z => z.katm)}], ...kRef(kz), height: 165}));
      }
      // Composición: barras apiladas con las categorías originales (tipo de riego del lote).
      if (!hist) { const rows = (window.CRONO_DATA.producers || []).flatMap(p => p.details || []).filter(r => !zone || r.zona === zone), cards = comps(rows);
        if (cards.some(c => c.items.length)) { d.add(heading('Composición del área activa', null, 90)); d.add(composition(cards, 2)); } }
      else if (Cc.length) { d.add(heading('Composición por tipo de riego · Z' + latestL(), null, 90)); d.add(composition(Cc.map(c => ({title: c.title.replace(/ Z\d\d\/\d\d por tipo de riego$/, '').replace(/ por tipo de riego$/, ''), total: /\s(ha|t)$/.test(c.total) ? c.total : c.total + (/Toneladas/.test(c.title) ? ' t' : ' ha'), items: c.items.map(it => ({label: it.key, value: it.value, color: E.RIEGO[it.key] || E.OTHER, display: it.display + (/Toneladas/.test(c.title) ? ' t' : ' ha'), pct: it.pct}))})), 2)); }
      // Comparación productiva por tipo de riego (o por zona cuando no hay zona elegida).
      // Sin zona elegida, la comparación por zona repetiría las columnas del detalle por zona: se omite.
      if (cmp && cmp.groups.length && !/zona/i.test(cellText(root.querySelector('figure.ux14-compare .ux14-scope')))) { const by = /zona/i.test(cellText(root.querySelector('figure.ux14-compare .ux14-scope'))) ? 'Zona' : 'Tipo de riego', M = compRows(Cc, cmp, by !== 'Zona');
        const cols = hist ? [{label: by, w: 1.4, bold: true}, {label: 'Área cosechada Z' + latestL() + ' (ha)', w: 1, align: 'right'}, {label: 'Toneladas Z' + latestL(), w: 1, align: 'right'}, {label: 'TCH histórico', w: 0.9, align: 'right'}, {label: 'TCH Z' + latestL(), w: 0.9, align: 'right'}, {label: 'Δ TCH', w: 0.7, align: 'right'}]
          : [{label: by, w: 1.4, bold: true}, {label: 'Área activa (ha)', w: 1, align: 'right'}, {label: 'Toneladas estimadas Z' + est, w: 1, align: 'right'}, {label: 'TCH Z' + latestL(), w: 0.9, align: 'right'}, {label: 'TCH estimado Z' + est, w: 0.9, align: 'right'}, {label: 'Δ TCH', w: 0.7, align: 'right'}];
        const tot = [...M.entries()].find(([k]) => k === 'Total');
        const delta = v => { const a = num(v?.[0]), b = num(v?.[1]); return a != null && b != null ? (b - a >= 0 ? '+' : '') + fmt(b - a) : '—'; };
        const line = (k, r) => [k, r.c0 || (k === 'Total' ? bare(Cc[0]?.total) : '—') || '—', r.c1 || (k === 'Total' ? bare(Cc[1]?.total) : '—') || '—', r.v?.[0] || '—', r.v?.[1] || '—', delta(r.v)];
        const keepCols = by === 'Zona' ? [0, 3, 4, 5] : [0, 1, 2, 3, 4, 5], pick = r => keepCols.map(i => r[i]);
        d.add(table({title: hist ? 'Comparación con el histórico' : 'Comparación productiva', columns: pick(cols), rows: [...M.entries()].filter(([k]) => k !== 'Total').map(([k, r]) => pick(line(k, r))), total: tot ? pick(line('Total', tot[1])) : null}));
      }
      if (hist && ser.length) d.add(table({title: 'Resumen por zafra', columns: ZAFRA_COLS, rows: ser.map(z => [zlabel(z.zafra), fmt(z.area), fmt(z.ton, 0), fmt(z.tch), fmt(z.katm), fmt(z.edad), fmt(z.lots, 0)])}));
      if (T) d.add(tableFrom(T, hist ? 'Detalle por finca' : (zone ? 'Detalle por finca' : 'Detalle por zona')));
      return {doc: d, name: ext => E.fileName(hist ? 'Historico' : 'Cronologico', 'Zona ' + zoneShort(zone), null, ext), check: {zone, kpis: K.map(k => [k.label, k.value]), rows: T?.rows.length || 0, zafras: ser.length, comps: Cc.map(c => c.items.length)}};
    } finally { api.exportDone?.(kind); }
  }

  // ======================= despacho =======================
  function resolve(kind, node, variant) {
    if (kind === 'cronologico') { const c = document.getElementById('cronoContent'), code = document.getElementById('cronoProducerSelect')?.value, scope = c?.dataset.geoScope;
      if (scope === 'lot' && c.dataset.geoLotId) return {template: 'cronologico-suerte', build: A => cronoLot(A, node, code, c.dataset.geoLotId)};
      if (scope === 'farm' && code) return {template: 'cronologico-finca', build: A => cronoFarm(A, node, code)}; return null; }
    if (kind === 'historico') { const meta = cellText(node.querySelector('.print-meta')), lot = meta.match(/Código\s+(\S+)\s*·\s*Hacienda/), farm = meta.match(/Código\s+(\S+)/);
      if (lot) return {template: 'historico-suerte', build: A => histLot(A, node, lot[1])}; if (farm) return {template: 'historico-finca', build: A => histFarm(A, node, farm[1])}; }
    if (kind === 'cronologico-multiple') return {template: 'cronologico-multiple', build: A => cronoMulti(A)};
    if (kind === 'historico-multiple') return {template: 'historico-multiple-' + (variant === 'complete' ? 'completo' : 'ejecutivo'), build: A => histMulti(A, variant)};
    if (kind === 'zona' || kind === 'zona-historico') return {template: kind === 'zona' ? 'zona-cronologico' : 'zona-historico', build: A => zoneReport(A, kind)};
    return null;
  }
  async function exportReport(kind, type, node, variant) {
    const job = resolve(kind, node, variant); if (!job) return null;
    const A = await E.assets(), {doc, check, name} = await job.build(A); doc.footers();
    const out = type === 'image' ? await E.toPng(doc) : {blob: E.toPdf(doc)}, file = name(type === 'image' ? 'png' : 'pdf');
    window.CASUR_REPORTS.last = {template: job.template, type, name: file, pages: doc.pages.map(p => p.orientation), check, audit: doc.audit(), png: out.size || null};
    return {blob: out.blob, template: job.template, name: file};
  }
  window.CASUR_REPORTS = {export: exportReport, resolve, last: null, version: 'R3'};
})();
