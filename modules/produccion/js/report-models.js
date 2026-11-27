/* CASUR · Plantillas de informe R2: Cronológico de Finca / de Suerte, Histórico de Finca / de Suerte.
   Fuente de cada cifra:
   - Panel oficial del informe (#cronoPrintPanel / #printPanel), generado por los motores del módulo: KPI, tabla oficial
     de suertes (18 columnas), resumen por zafra, comparaciones y alertas. Se leen tal cual; no se recalculan.
   - Motores expuestos: CASUR_CRONO_PARTICIPATION (summary, agronomicGroups, formatDate, cutTypeText, cropStage),
     CASUR_OPERATIONAL_IMPORT.participation, CASUR_HISTORICAL_ENGINE.normalizeHistoricalRows, APP_DATA.lotCompact.
   - Plan de cosecha BE/BF (r.plan) y escenario optimista AF/AG (r.forecastOptimistic), rotulados como tales.
   «TCH anterior (aforo)» es la columna del aforo; «TCH ejecutado Z25/26» es el Histórico. Nunca se confunden. */
(function () {
  'use strict';
  const E = window.CASUR_REPORT_ENGINE, {C, fmt, date, now, zlabel, cellText, panelKpis, officialTable, metaLines, histLines, ageOf, kpis, groups, bars, chart, note, row, table, heading} = E;
  const P = () => window.CASUR_CRONO_PARTICIPATION, O = () => window.CASUR_OPERATIONAL_IMPORT;
  const split = s => { const m = String(s || '—').match(/^(.*?)\s+(ha|t\/ha|t|meses|km|kg\/t|TCH)$/); return m ? [m[1], m[2]] : [String(s || '—'), '']; };
  const num = s => { const n = Number(String(s ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) && /\d/.test(String(s)) ? n : null; };
  const tone = t => /alto|sobre/i.test(t) ? C.green : /medio/i.test(t) ? '#8A6A12' : /crític|bajo/i.test(t) ? C.red : null;
  const byCode = (a, b) => String(a.codLote).localeCompare(String(b.codLote), 'es', {numeric: true});

  // ======================= Cronológico de Finca =======================
  function cronoFarm(A, node, code) {
    const p = window.CRONO_DATA.producers.find(x => String(x.code) === String(code)); if (!p) throw new Error('Finca no encontrada.');
    const rows = p.details || [], S = P().summary(rows), K = panelKpis(node), T = officialTable(node), m = window.CRONO_DATA.meta || {};
    if (!T || T.rows.length !== rows.length) throw new Error('La tabla oficial de suertes no coincide con el catálogo de la finca.');
    // Each official row is keyed by its exact código de lote (first cell <b>), letters included (e.g. 99302A).
    const col = Object.fromEntries(T.heads.map((h, i) => [h, i])), off = new Map(T.rows.map((r, i) => [cellText(T.nodes[i].children[0].querySelector('b')) || r[0], r]));
    if (rows.some(r => !off.has(String(r.codLote)))) throw new Error('Una suerte del catálogo no aparece en la tabla oficial.');
    const ent = (window.mainEntities?.() || []).find(e => String(e.code) === String(code)), exe = ent?.latest, part = r => O().participation(r);
    const zona = rows[0]?.zona || '—', ten = cellText({textContent: off.get(String(rows[0]?.codLote))?.[col['Tenencia']]}) || '—';
    const d = new E.Doc(A, {title: 'Cronológico de Finca', subject: p.name + ' · Código ' + p.code, consulta: now(), footer: 'Cronológico de Suertes · aforo oficial AD/AE',
      lines: [...metaLines(), 'Zona ' + zona + ' · Tenencia ' + ten + ' · ' + fmt(S.catalogLots, 0) + ' suertes en catálogo']});
    d.newPage('portrait');
    const [aV, aU] = split(K['Área activa']?.value), [ageV] = split(K['Edad ponderada']?.value);
    d.add(kpis([
      {label: 'Área activa de la finca', value: aV, unit: aU, note: fmt(S.activeLots, 0) + ' suertes activas de ' + fmt(S.catalogLots, 0)},
      {label: 'TCH estimado Z' + (m.estimateSeason || '26/27'), value: fmt(S.estimateTch), unit: 't/ha', note: 'Aforo oficial ' + date(m.tchEst2627EffectiveDate) + ' · ' + fmt(S.estimateArea) + ' ha', accent: C.blue},
      {label: 'TCH ejecutado Z' + (window.APP_DATA?.meta?.latestLabel || '25/26'), value: fmt(exe?.tch), unit: 't/ha', note: 'Histórico · ' + fmt(exe?.area) + ' ha cosechadas', accent: C.gold},
      {label: 'Edad actual', value: ageV, unit: 'meses', note: 'Ponderada por área activa'}], 4));
    const [tV, tU] = split(K['Ton. Estim. Z' + (m.estimateSeason || '26/27')]?.value), [dV, dU] = split(K['Distancia ponderada (km)']?.value);
    d.add(kpis([
      {label: 'Ton. estimadas Z' + (m.estimateSeason || '26/27'), value: tV, unit: tU, note: 'AE · molienda con estimado', accent: C.blue},
      {label: 'TCH anterior Z25/26 (aforo)', value: K['TCH Z Ant. 25/26']?.value || '—', unit: 't/ha', note: 'Columna del aforo; no es el ejecutado del Histórico'},
      {label: 'Molienda / Semilla', value: fmt(S.millingLots, 0) + ' / ' + fmt(S.seedLots, 0), unit: 'suertes', note: fmt(S.millingArea) + ' ha / ' + fmt(S.seedArea) + ' ha'},
      {label: 'Distancia ponderada', value: dV, unit: dU, note: 'Inactivas: ' + fmt(S.inactiveLots, 0) + ' suertes'}], 4));
    const comp = (title, field, color) => { const g = P().agronomicGroups(rows, field), tot = g.reduce((n, x) => n + x.area, 0);
      const list = field === 'stage' ? g.slice().sort((a, b) => ['Plantilla', '2.º corte', 'Cortes 3–4', 'Cortes 5–6', 'Cortes 7+'].indexOf(a.key) - ['Plantilla', '2.º corte', 'Cortes 3–4', 'Cortes 5–6', 'Cortes 7+'].indexOf(b.key)) : g.slice().sort((a, b) => b.area - a.area);
      return {title, color, total: fmt(tot) + ' ha', items: list.map(x => ({label: x.key, value: x.area, display: fmt(x.area) + ' ha', pct: fmt(tot ? x.area / tot * 100 : 0, 1) + ' %'}))}; };
    d.add(heading('Composición agronómica', 'Área activa por categoría original de la fuente; los porcentajes suman 100 % del área activa.'));
    d.add(bars([comp('Variedad', 'variedad', C.petrol), comp('Tipo de riego', 'tipoRiego', C.blue), comp('# de cortes (rangos)', 'stage', '#5B8E7D'), comp('Destino', 'destino', C.gold)], 2));
    d.add(note('Molienda: ' + fmt(S.millingLots, 0) + ' suertes · ' + fmt(S.millingArea) + ' ha · Semilla: ' + fmt(S.seedLots, 0) + ' suertes · ' + fmt(S.seedArea) + ' ha (no aplica estimado de molienda) · Inactivas: ' + fmt(S.inactiveLots, 0) + ' suertes del catálogo sin área activa. El escenario optimista AF/AG y el plan BE/BF se informan en el detalle y no alteran las cifras oficiales.'));
    // Participación (motor oficial: summary / participation): activas de molienda y semilla, inactivas.
    const pt = (f) => rows.filter(f), pa = list => list.reduce((n, r) => n + (part(r).activeArea || 0), 0);
    const mol = pt(r => part(r).activeArea > 0 && part(r).milling), sem = pt(r => part(r).activeArea > 0 && !part(r).milling), ina = pt(r => !(part(r).activeArea > 0));
    d.add(table({title: 'Participación de las suertes', columns: [{label: 'Grupo', w: 1.6, bold: true}, {label: 'Suertes', w: 0.7, align: 'right'}, {label: 'Área activa (ha)', w: 1, align: 'right'}, {label: 'Área con estimado (ha)', w: 1.1, align: 'right'}, {label: 'Ton. estimadas (t)', w: 1.1, align: 'right'}, {label: 'Nota', w: 1.9}],
      rows: [['Activas · Molienda', fmt(mol.length, 0), fmt(pa(mol)), fmt(S.estimateArea), fmt(S.estimateTons), 'Base del estimado oficial AD/AE'], ['Activas · Semilla', fmt(sem.length, 0), fmt(pa(sem)), '—', '—', 'No aplica estimado de molienda'], ['Inactivas', fmt(ina.length, 0), fmt(pa(ina)), '—', '—', 'En catálogo, sin área activa']],
      total: ['Total catálogo', fmt(rows.length, 0), fmt(S.inventoryArea), fmt(S.estimateArea), fmt(S.estimateTons), null]}));
    // Detalle: todas las variables, repartidas en dos tablas horizontales, agrupadas por participación.
    const groupsOf = [['Activas · Molienda', r => part(r).activeArea > 0 && part(r).milling], ['Activas · Semilla', r => part(r).activeArea > 0 && !part(r).milling], ['Inactivas', r => !(part(r).activeArea > 0)]];
    const g = v => off.get(String(v.codLote)) || [];
    const sections = groupsOf.map(([label, f]) => [label, rows.filter(f).sort(byCode)]).filter(([, list]) => list.length);
    const secTitle = (label, list) => label + ' · ' + fmt(list.length, 0) + ' suertes · ' + fmt(list.reduce((n, r) => n + (part(r).activeArea || 0), 0)) + ' ha activas';
    const prod = [], carac = [];
    sections.forEach(([label, list]) => {
      prod.push({section: secTitle(label, list)}); carac.push({section: secTitle(label, list)});
      list.forEach(r => { const o = g(r), st = o[col['Estado TCH 25/26']];
        const rowP = [r.codLote + ' · ' + r.suerte, o[col['Área']], o[col['Variedad']], o[col['# de Corte']], o[col['Tipo de riego']], r.renovacion && !r.fSiembra ? 'Renovación' : fmt(ageOf(r)), o[col['Fecha corte/siembra']], o[col['TCH']], st, o[col['TCH est. ' + (m.estimateSeason || '26/27')]], o[col['Ton. est. ' + (m.estimateSeason || '26/27')]], date(r.plan?.date?.iso), r.plan?.cut ? P().cutTypeText(r.plan.cut) : '—'];
        rowP.tone = []; rowP.tone[8] = tone(st); prod.push(rowP);
        const pr = part(r);
        carac.push([r.codLote + ' · ' + r.suerte, o[col['Destino Cultivo']], o[col['Textura']], o[col['Surco']], o[col['Distancia (km)']], o[col['Zona']], o[col['Tenencia']], o[col['Estado maestro']], pr.activeArea > 0 ? 'Activa' : 'Inactiva', o[col['Observación']]]); });
    });
    d.section('landscape');
    d.add(table({title: 'Detalle de suertes · producción y plan de cosecha', sub: 'TCH anterior = columna del aforo (Z25/26). Estimado = aforo oficial AD/AE. Fecha para cosecha (BE) y corte (BF) = plan de cosecha, no aforo.',
      columns: [{label: 'Suerte', w: 1.05, bold: true}, {label: 'Área', w: 0.8, align: 'right'}, {label: 'Variedad', w: 0.95}, {label: '# de corte', w: 0.6, align: 'right'}, {label: 'Tipo de riego', w: 0.9}, {label: 'Edad (meses)', w: 0.7, align: 'right'},
        {label: 'Fecha corte/siembra', w: 0.95}, {label: 'TCH anterior (aforo)', w: 0.8, align: 'right'}, {label: 'Estado TCH 25/26', w: 0.75, tone: true}, {label: 'TCH est. ' + (m.estimateSeason || '26/27'), w: 0.75, align: 'right'}, {label: 'Ton. est. ' + (m.estimateSeason || '26/27'), w: 0.95, align: 'right'}, {label: 'Fecha para cosecha (BE)', w: 0.95}, {label: 'Corte (BF)', w: 1.2}],
      rows: prod, total: ['TOTAL', fmt(S.inventoryArea) + ' ha', null, null, null, K['Edad ponderada']?.value ? split(K['Edad ponderada'].value)[0] : null, null, K['TCH Z Ant. 25/26']?.value || null, null, fmt(S.estimateTch), fmt(S.estimateTons) + ' t', null, null]}));
    d.add(table({title: 'Detalle de suertes · caracterización y estado', columns: [{label: 'Suerte', w: 1.1, bold: true}, {label: 'Destino cultivo', w: 0.9}, {label: 'Textura', w: 0.75}, {label: 'Surco', w: 0.55, align: 'right'}, {label: 'Distancia (km)', w: 0.7, align: 'right'}, {label: 'Zona', w: 0.95}, {label: 'Tenencia', w: 0.95}, {label: 'Estado maestro', w: 1.9}, {label: 'Participación', w: 0.75}, {label: 'Observación', w: 1.8}], rows: carac}));
    const opt = rows.filter(r => r.forecastOptimistic && part(r).usable);
    if (opt.length) d.add(note('Escenario optimista AF/AG (no sustituye al aforo oficial): ' + fmt(opt.reduce((n, r) => n + r.forecastOptimistic.tons, 0)) + ' t en ' + fmt(opt.length, 0) + ' suertes de molienda con estimado utilizable.'));
    return {doc: d, check: {suertes: rows.length, placed: prod.filter(r => !r.section).length, caracterizadas: carac.filter(r => !r.section).length}};
  }

  // ======================= Cronológico de Suerte =======================
  function cronoLot(A, node, code, lot) {
    const p = window.CRONO_DATA.producers.find(x => String(x.code) === String(code)), r = p?.details.find(x => String(x.codLote) === String(lot)); if (!r) throw new Error('Suerte no encontrada.');
    const K = panelKpis(node), T = officialTable(node), m = window.CRONO_DATA.meta || {}, est = m.estimateSeason || '26/27';
    const o = T.rows.find(x => x[0].startsWith(String(lot))) || [], col = Object.fromEntries(T.heads.map((h, i) => [h, i])), pr = O().participation(r);
    const d = new E.Doc(A, {title: 'Cronológico de Suerte', subject: p.name + ' · Suerte ' + r.suerte, consulta: now(), footer: 'Cronológico de Suertes · ficha agronómica',
      lines: [...metaLines(), 'Código suerte ' + r.codLote + ' · Finca ' + p.code + ' · Zona ' + (o[col['Zona']] || r.zona || '—') + ' · Variedad ' + (o[col['Variedad']] || r.variedad || '—') + ' · Tenencia ' + (o[col['Tenencia']] || '—')]});
    d.newPage('portrait');
    const fk = K['Fecha para cosecha ' + est] || {}, [aV, aU] = split(K['Área activa']?.value), [ageV] = split(K['Edad actual']?.value);
    d.add(kpis([
      {label: 'TCH estimado Z' + est, value: K['TCH Estim. Z' + est]?.value || '—', unit: 't/ha', note: 'Aforo oficial ' + date(m.tchEst2627EffectiveDate), accent: C.blue},
      {label: 'Fecha para cosecha ' + est, value: fk.value || '—', note: (fk.note || '') + ' · plan de cosecha (BE/BF)', accent: C.petrol},
      {label: 'Área activa', value: aV, unit: aU, note: pr.reason || ''},
      {label: 'Edad actual', value: ageV, unit: 'meses', note: 'Base: el más reciente entre último corte y siembra'}], 4));
    // Gráfico: mismo cálculo que el Cronológico (trendFromLot → normalizeHistoricalRows; últimas 8 zafras; promedio simple).
    const lc = (window.APP_DATA?.lotCompact || []).find(l => String(l[0]) === String(lot));
    const trend = lc ? window.CASUR_HISTORICAL_ENGINE.normalizeHistoricalRows([lc]).map(x => ({zafra: x.zafra, tch: x.tchStored, area: x.area, ton: x.ton, katm: x.katm})).filter(x => x.tch != null).sort((a, b) => a.zafra - b.zafra).slice(-8) : [];
    const avg = trend.length ? trend.reduce((n, x) => n + Number(x.tch), 0) / trend.length : null;
    d.add(chart({title: 'Histórico TCH por zafra', sub: 'Código ' + lot + ' · últimas ' + trend.length + ' zafras (Histórico, ejecutado)', labels: trend.map(x => zlabel(x.zafra)), series: [{name: 'TCH ejecutado', color: C.petrol, values: trend.map(x => Number(x.tch))}], ref: avg, refLabel: 'Promedio ' + fmt(avg) + ' TCH', height: 168}));
    const latest = trend.find(x => String(x.zafra) === String(window.APP_DATA?.meta?.latestZafra));
    const opt = r.forecastOptimistic;
    d.add(groups([
      {title: 'Caracterización agronómica', items: [['# de corte', o[col['# de Corte']]], ['Rango de cortes', P().cropStage(r)], ['Textura', o[col['Textura']]], ['Tipo de riego', o[col['Tipo de riego']]], ['Surco', o[col['Surco']]], ['Fecha de siembra', date(r.fSiembra)], ['Fecha corte/siembra (base)', o[col['Fecha corte/siembra']]], ['Destino cultivo', o[col['Destino Cultivo']]]]},
      {title: 'Datos productivos', items: [['TCH anterior Z25/26 (aforo)', o[col['TCH']]], ['Estado TCH 25/26', o[col['Estado TCH 25/26']]], ['TCH estimado ' + est + ' (AD)', o[col['TCH est. ' + est]]], ['Ton. estimadas ' + est + ' (AE)', o[col['Ton. est. ' + est]]], latest ? ['TCH ejecutado ' + zlabel(latest.zafra) + ' (Histórico)', fmt(latest.tch)] : null, latest ? ['Área cosechada ' + zlabel(latest.zafra) + ' (Histórico)', fmt(latest.area) + ' ha'] : null, ['Promedio TCH últimas ' + trend.length + ' zafras', fmt(avg)]]},
      {title: 'Plan de cosecha ' + est, items: [['Fecha para cosecha (BE)', date(r.plan?.date?.iso)], ['Tipo de corte (BF)', r.plan?.cut ? P().cutTypeText(r.plan.cut) : '—'], ['Edad proyectada a la fecha BE', r.plan?.calculatedAge != null ? fmt(r.plan.calculatedAge) + ' meses' : '—'], ['Naturaleza', 'Plan de cosecha; no es aforo']]},
      {title: 'Ubicación y estado', items: [['Distancia (km)', o[col['Distancia (km)']]], ['Estado maestro', o[col['Estado maestro']]], ['Participación', pr.activeArea > 0 ? 'Activa · ' + (pr.milling ? 'Molienda' : 'Semilla') : 'Inactiva'], ['Observación', o[col['Observación']]]]},
      opt ? {title: 'Escenario optimista ' + (opt.season || est) + ' (AF/AG)', items: [['TCH optimista', fmt(opt.tch)], ['Ton. optimistas', fmt(opt.tons) + ' t'], ['Uso', 'Escenario; no sustituye al aforo oficial']]} : null].filter(Boolean), 2));
    return {doc: d, check: {lot: String(lot), trend: trend.length}};
  }

  // ======================= Histórico de Finca =======================
  const histHead = node => { const meta = cellText(node.querySelector('.print-meta')); return {name: cellText(node.querySelector('.print-meta strong')), meta}; };
  const deltaItems = node => [...node.querySelectorAll('.delta-grid > *')].map(x => { const lab = cellText(x.querySelector('span,.label')), val = cellText(x.querySelector('strong,b')), sub = cellText(x.querySelector('small,em')); return {label: lab, value: val, note: sub}; }).filter(x => x.label);
  const alertsOf = node => [...node.querySelectorAll('.alerts > *')].map(cellText).filter(Boolean);
  function histKpiBlocks(node) {
    const K = panelKpis(node), items = Object.entries(K).map(([label, v]) => { const [val, unit] = split(v.value); return {label, value: val, unit, note: v.note, accent: C.gold}; });
    return items;
  }
  function histFarm(A, node, code) {
    const H = histHead(node), T = officialTable(node); if (!T) throw new Error('Resumen por zafra no disponible.');
    const keep = T.heads.map((h, i) => [h, i]).filter(([h]) => h !== 'Acción'), rowsZ = T.rows.map(r => keep.map(([, i]) => r[i]));
    const zc = Object.fromEntries(keep.map(([h], i) => [h, i])), zf = rowsZ.map(r => r[zc['Zafra']]);
    const d = new E.Doc(A, {title: 'Histórico de Finca', subject: H.name, consulta: now(), footer: 'Histórico de Suertes · motor oficial', lines: [...histLines(), H.meta.replace(H.name, '').replace(/Consulta:.*$/, '').trim()]});
    d.newPage('portrait');
    const K = histKpiBlocks(node); for (let i = 0; i < K.length; i += 4) d.add(kpis(K.slice(i, i + 4), 4));
    const dl = deltaItems(node); if (dl.length) d.add(kpis(dl.map(x => ({...x, accent: C.petrol})), dl.length));
    const al = alertsOf(node); if (al.length) d.add(note('Alertas del período: ' + al.join(' · ') + '.'));
    const series = k => rowsZ.map(r => num(r[zc[k]]));
    d.add(chart({title: 'TCH ponderado por zafra', sub: 'Toneladas ÷ área cosechada · resumen oficial de la finca', labels: zf, series: [{name: 'TCH', color: C.petrol, values: series('TCH pond.')}], height: 158}));
    const small = (title, k, color, digits) => chart({title, labels: zf.map(z => z.slice(0, 2)), series: [{name: '', color, values: series(k)}], height: 128, labelsOn: false, axisDigits: digits});
    d.add(row([small('Área cosechada (ha)', 'Área', C.gold, 0), small('Toneladas', 'Ton', C.blue, 0), small('KATM ponderado (kg/t)', 'KATM pond.', '#5B8E7D', 0)], 8));
    d.add(note('Gráficos pequeños: eje horizontal con el año inicial de cada zafra (16 = 16/17). Valores exactos en «Resumen de finca · por zafra».'));
    d.section('landscape');
    const right = new Set(['Área', 'Ton', 'TCH pond.', 'KATM pond.', 'Edad prom.', 'Suertes']);
    const zr = rowsZ.map(r => { const x = r.slice(); x.tone = []; x.tone[zc['Estado']] = tone(r[zc['Estado']]); return x; });
    d.add(table({title: 'Resumen de finca · por zafra', sub: 'Una fila por zafra. Distancia de referencia actual, no histórica.', columns: keep.map(([h]) => ({label: h, w: h === 'Km pond. vigente' ? 2.3 : /Variedad|Zona/.test(h) ? 1.15 : h === 'Estado' ? 1.15 : 0.75, align: right.has(h) ? 'right' : 'left', bold: h === 'Zafra', tone: h === 'Estado'})), rows: zr}));
    // Detalle histórico por suerte: lotes de la finca en el Histórico (lotCompact), TCH por zafra.
    const lots = (window.APP_DATA?.lotCompact || []).filter(l => String(l[8]) === String(code) && !/MAQUILA/i.test(l[2] || '')).sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'es', {numeric: true}));
    const zs = (window.APP_DATA?.meta?.zafras || []).map(z => z.value), latest = window.APP_DATA?.meta?.latestZafra;
    const lotRows = lots.map(l => { const by = new Map((l[11] || []).map(x => [x[0], x])), a = (l[11] || []).reduce((n, x) => n + (x[1] || 0), 0), t = (l[11] || []).reduce((n, x) => n + (x[2] || 0), 0), last = by.get(latest);
      return [l[10] || '—', String(l[0]), l[3] || '—', l[4] || '—', ...zs.map(z => by.get(z) ? fmt(by.get(z)[3]) : '—'), a ? fmt(t / a) : '—', last ? fmt(last[1]) : '—']; });
    d.add(table({title: 'Detalle histórico por suerte · TCH por zafra', sub: 'Histórico por código de lote (sin Maquila). TCH pond. = toneladas ÷ área de todas las zafras del lote. Variedad y riego actuales del lote.', size: 7,
      columns: [{label: 'Suerte', w: 0.6, bold: true}, {label: 'CodLote', w: 0.75}, {label: 'Variedad', w: 1.05}, {label: 'Riego', w: 0.85}, ...zs.map(z => ({label: zlabel(z), w: 0.62, align: 'right'})), {label: 'TCH pond.', w: 0.7, align: 'right', bold: true}, {label: 'Área ' + zlabel(latest) + ' ha', w: 0.75, align: 'right'}], rows: lotRows}));
    const latestArea = lots.reduce((n, l) => n + ((l[11] || []).find(x => x[0] === latest)?.[1] || 0), 0);
    return {doc: d, check: {zafras: rowsZ.length, lots: lots.length, latestArea}};
  }

  // ======================= Histórico de Suerte =======================
  function histLot(A, node, lot) {
    const H = histHead(node), T = officialTable(node); if (!T) throw new Error('Detalle del lote no disponible.');
    const c = Object.fromEntries(T.heads.map((h, i) => [h, i])), rs = T.rows, zf = rs.map(r => r[c['Zafra']]);
    const d = new E.Doc(A, {title: 'Histórico de Suerte', subject: H.name, consulta: now(), footer: 'Histórico de Suertes · ficha productiva', lines: [...histLines(), H.meta.replace(H.name, '').replace(/Consulta:.*$/, '').trim()]});
    d.newPage('portrait');
    const K = histKpiBlocks(node); for (let i = 0; i < K.length; i += 4) d.add(kpis(K.slice(i, i + 4), 4));
    const dl = deltaItems(node); if (dl.length) d.add(kpis(dl.map(x => ({...x, accent: C.petrol})), dl.length));
    const al = alertsOf(node); if (al.length) d.add(note('Alertas: ' + al.join(' · ') + '.'));
    const s = k => rs.map(r => num(r[c[k]]));
    d.add(chart({title: 'TCH por zafra', sub: 'Toneladas ÷ área cosechada del lote', labels: zf, series: [{name: 'TCH', color: C.petrol, values: s('TCH')}], height: 160}));
    d.add(chart({title: 'KATM por zafra (kg/t)', sub: 'Kilogramos de azúcar por tonelada', labels: zf, series: [{name: 'KATM', color: '#5B8E7D', values: s('KATM')}], height: 150}));
    d.section('landscape');
    const right = new Set(['Área', 'Ton', 'TCH', 'KATM', 'Edad', 'Dist. ref. (km)', 'Corte']);
    const rows = rs.map(r => { const x = r.slice(); x.tone = []; x.tone[c['Estado']] = tone(r[c['Estado']]); return x; });
    d.add(table({title: 'Detalle del lote · histórico completo', sub: 'Todas las zafras disponibles de la suerte. Distancia de referencia actual.', columns: T.heads.map(h => ({label: h, w: /Variedad|Alerta/.test(h) ? 1.2 : /Estado/.test(h) ? 1 : 0.75, align: right.has(h) ? 'right' : 'left', bold: h === 'Zafra', tone: h === 'Estado'})), rows}));
    return {doc: d, check: {lot: String(lot), zafras: rs.length}};
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
    const A = await E.assets(), {doc, check} = job.build(A); doc.footers();
    const out = type === 'image' ? await E.toPng(doc) : {blob: E.toPdf(doc)};
    window.CASUR_REPORTS.last = {template: job.template, type, pages: doc.pages.map(p => p.orientation), check, audit: doc.audit(), png: out.size || null};
    return {blob: out.blob, template: job.template};
  }
  window.CASUR_REPORTS = {export: exportReport, resolve, last: null, version: 'R2-1'};
})();
