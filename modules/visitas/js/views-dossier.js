/* Atención técnica centrada en el productor: catálogo de Productores (Maestro completo), Expediente técnico (resumen,
   suertes, cronología, seguimiento por etapa y evidencias), Ficha de suerte, Gestión y Evidencias.
   Los registros pueden venir de visitas formales o ser independientes (hallazgos de campo, evidencias rápidas): todo
   se agrupa por el productor que lleva cada registro. Ningún número se presenta como impacto agronómico. */
import {icon} from './icons.js';
import {$, $$, esc, fdate, fdt, fha, relTime, blobUrl} from './ui.js';
import * as M from './model.js';
import {maestro, searchFarms} from './maestro.js';
import {featuresFor} from './geo.js';
import {category, OPEN, KIND, FAMILIES, familyOf, PROGRESS, progressOf, requestType} from './catalog.js';
import {agroHtml, phenologyHtml, findingRow, followupRow, visitRow, familyBadge, famVars, photoKind, compareHtml} from './components.js';
import {agroCard, ageLabel} from './agro.js';
import {farmMapSvg} from './reports.js';
import {mount, initials, lotNum, errorCard, bindEvidence} from './views-main.js';
import {tenureOf} from './views-map.js';

const byDate = (a, b) => String(b).localeCompare(String(a));
const plural = (n, s, p = s + 's') => `${n} ${n === 1 ? s : p}`;
const when = p => p.takenAt || p.addedAt;
const codeOf = x => M.producerOf(x)?.code ?? x?.producerCode ?? null;
/** Todo lo de un productor: visitas formales y registros independientes (por su propio productor). */
async function dossierData(code) {
  const d = await M.everything();
  return {visits: d.visits.filter(v => v.producer.code === code), findings: d.findings.filter(f => codeOf(f) === code), followups: d.followups.filter(f => codeOf(f) === code), photos: d.photos.filter(p => codeOf(p) === code)};
}
const tabsHtml = (tabs, cur) => `<nav class="vc-tabs" role="tablist">${tabs.map(([k, l, n]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === cur}">${l}${n ? `<span class="vc-tabs__n">${n}</span>` : ''}</button>`).join('')}</nav>`;
/** Miniaturas que abren la evidencia (identificar, comentar, etiquetar y compartir). */
const thumbs = list => `<div class="vc-gallery">${list.map(p => `<a class="vc-ph" href="#/evidencia/${esc(p.id)}" aria-label="Evidencia del ${fdate(when(p))}">${p.thumb || p.blob ? `<img alt="" data-src-photo="${esc(p.id)}">` : '<span class="vc-ph__missing">Original no disponible</span>'}
  <span class="vc-ph__tag">${p.location?.source && p.location.source !== 'none' ? '<i>GPS</i>' : ''}${p.backupState === 'confirmada' ? '<i>Respaldada</i>' : ''}</span></a>`).join('')}</div>`;
const hydrate = (root, photos) => { const m = new Map(photos.map(p => [p.id, p])); for (const img of $$('[data-src-photo]', root)) { const p = m.get(img.dataset.srcPhoto), b = p?.thumb || p?.blob; if (b) img.src = blobUrl(b); } };
const group = (list, title = '') => list.length ? `<div class="vc-galgroup">${title ? `<p class="vc-galgroup__t">${title}</p>` : ''}${thumbs(list)}</div>` : '';
/** Pares antes/después: evidencia inicial del hallazgo frente a la evidencia del seguimiento de sus recomendaciones. */
function beforeAfter(findings, followups, photos) {
  return findings.map(f => {
    const fus = new Set(followups.filter(x => x.findingId === f.id).map(x => x.id));
    const before = photos.filter(p => p.findingId === f.id && (p.thumb || p.blob)).sort((a, b) => byDate(when(b), when(a)))[0];
    const after = photos.filter(p => fus.has(p.followupId) && (p.thumb || p.blob)).sort((a, b) => byDate(when(a), when(b)))[0];
    return before && after ? {finding: f, before, after} : null;
  }).filter(Boolean);
}
const compareBlock = pairs => pairs.map(({finding: f, before, after}) => compareHtml(before, after,
  {title: `${familyBadge(f.category)} <span>${esc(f.producer?.name || '')} · ${f.lotKey ? 'Suerte ' + esc(lotNum(f.lotKey)) : 'Finca completa'}</span>`}).replace(/<button class="vc-ph" type="button" data-photo="([^"]+)"[^>]*>/g, '<a class="vc-ph" href="#/evidencia/$1">').replace(/<\/button><figcaption>/g, '</a><figcaption>')).join('');

/* ---------- Productores: catálogo completo del Maestro vigente ---------- */
const PAGE = 25;
export async function viewProducers(params) {
  let reader; try { ({reader} = await maestro()); } catch (e) { mount(errorCard('El Maestro no está disponible todavía', e)); return; }
  const data = await M.everything().catch(e => ({error: e, visits: [], findings: [], photos: [], followups: []}));
  const lastBy = new Map(), openBy = new Map(), overdueBy = new Map(), regBy = new Map();
  const touch = (code, at) => { if (code && (!lastBy.has(code) || at > lastBy.get(code))) lastBy.set(code, at); };
  for (const v of data.visits) { touch(v.producer.code, v.startedAt); regBy.set(v.producer.code, (regBy.get(v.producer.code) || 0) + 1); }
  for (const f of data.findings) { const c = codeOf(f); touch(c, f.observedAt); if (c) regBy.set(c, (regBy.get(c) || 0) + 1); if (c && OPEN.has(f.status)) openBy.set(c, (openBy.get(c) || 0) + 1); }
  for (const p of data.photos) touch(codeOf(p), when(p));
  for (const f of data.followups) { if (OPEN.has(f.state)) openBy.set(f.producerCode, (openBy.get(f.producerCode) || 0) + 1); if (M.isOverdue(f)) overdueBy.set(f.producerCode, (overdueBy.get(f.producerCode) || 0) + 1); }
  // Resumen agronómico por hacienda (Maestro, solo lectura).
  const summary = new Map(reader.farms().map(f => {
    const lots = reader.lotsOf(f.code), present = lots.filter(r => r.state.presence !== 'absent');
    const active = lots.filter(r => r.state.participatesCurrentArea && Number.isFinite(r.attributes.area)).reduce((s, r) => s + r.attributes.area, 0);
    const dom = key => { const m = new Map(); for (const r of present) { const k = r.attributes[key]; if (k) m.set(k, (m.get(k) || 0) + (r.attributes.area || 0)); } return [...m].sort((a, b) => b[1] - a[1])[0]?.[0] || null; };
    return [f.code, {lots: present.length, active, tenures: [...new Set(lots.map(tenureOf))], zones: [...new Set(lots.map(r => r.farm.zone).filter(Boolean))], variety: dom('variety'), irrigation: dom('irrigationType')}];
  }));
  let filter = params.get('f') || 'todos', q = params.get('q') || '', zone = '', shown = PAGE;
  const FILTERS = [['todos', 'Todos'], ['Compra Venta', 'Compra Venta'], ['Arriendo', 'Arriendo'], ['Propio', 'Propio'], ['atendidos', 'Con registros'], ['pendientes', 'Con pendientes']];
  const el = mount(`<section class="vc-card"><div class="vc-card__head"><div><h1>Productores y haciendas</h1><p class="vc-muted">Catálogo del Maestro ${esc(reader.version().dataVersion)} · aforo ${fdate(reader.version().aforoDate)}</p></div><a class="vc-btn vc-btn--sm" href="#/mapa">${icon('map')}Mapa</a></div>
    <label class="vc-search">${icon('search')}<input class="vc-input" type="search" placeholder="Nombre, código de hacienda o de suerte" data-q value="${esc(q)}" data-casur-query></label>
    <div class="vc-filters" style="margin-top:10px">${FILTERS.map(([k, l]) => `<button type="button" data-f="${esc(k)}" aria-pressed="${k === filter}">${l}</button>`).join('')}
      <select class="vc-input vc-input--pill" data-zone aria-label="Zona"><option value="">Todas las zonas</option>${['1-Sur', '2-Centro', '3-Norte', '5-Productores'].map(z => `<option>${z}</option>`).join('')}</select></div>
    ${data.error ? `<p class="vc-note vc-note--err" style="margin-top:8px">${icon('alert')}<span>No se pudieron leer los registros de este teléfono (${esc(data.error.message)}): el catálogo se muestra sin ellos.</span></p>` : ''}
    <p class="vc-muted vc-small" data-count style="margin-top:8px"></p><div class="vc-list" data-list></div><div data-more></div></section>`);
  const list = () => {
    let farms = q ? searchFarms(reader, q, 500) : reader.farms();
    if (['Compra Venta', 'Arriendo', 'Propio'].includes(filter)) farms = farms.filter(f => summary.get(f.code).tenures.includes(filter));
    if (filter === 'atendidos') farms = farms.filter(f => lastBy.has(f.code)).sort((a, b) => byDate(lastBy.get(a.code), lastBy.get(b.code)));
    if (filter === 'pendientes') farms = farms.filter(f => openBy.get(f.code)).sort((a, b) => (overdueBy.get(b.code) || 0) - (overdueBy.get(a.code) || 0) || (openBy.get(b.code) || 0) - (openBy.get(a.code) || 0));
    if (zone) farms = farms.filter(f => summary.get(f.code).zones.includes(zone));
    return farms;
  };
  const row = f => {
    const s = summary.get(f.code), reg = regBy.get(f.code) || 0, o = openBy.get(f.code) || 0, od = overdueBy.get(f.code) || 0;
    return `<a class="vc-item vc-prod" href="#/productor/${esc(f.code)}"><span class="vc-avatar">${esc(initials(f.name))}</span>
      <span class="vc-item__body"><span class="vc-item__title">${esc(f.name)}</span>
        <span class="vc-item__sub">${esc([`Hacienda ${f.code}`, s.zones.join(', '), plural(s.lots, 'suerte'), s.active ? fha(s.active) + ' activas' : ''].filter(Boolean).join(' · '))}</span>
        <span class="vc-prod__tags">${s.tenures.map(t => `<span class="vc-tag vc-tag--${t === 'Compra Venta' ? 'cv' : t === 'Arriendo' ? 'ca' : t === 'Propio' ? 'pr' : 'na'}">${esc(t)}</span>`).join('')}${s.variety ? `<span class="vc-tag">${esc(s.variety)}</span>` : ''}${s.irrigation ? `<span class="vc-tag">${esc(s.irrigation)}</span>` : ''}${reg ? `<span class="vc-tag vc-tag--reg">${plural(reg, 'registro')} · ${relTime(lastBy.get(f.code))}</span>` : ''}</span></span>
      <span class="vc-item__side">${od ? `<span class="vc-chip vc-chip--err">${od} vencido${od > 1 ? 's' : ''}</span>` : o ? `<span class="vc-chip vc-chip--warn">${o} abierto${o > 1 ? 's' : ''}</span>` : ''}${icon('chevron')}</span></a>`;
  };
  const render = () => {
    const farms = list(), page = farms.slice(0, shown);
    $('[data-count]', el).textContent = farms.length ? `Mostrando ${page.length} de ${farms.length} haciendas` : '';
    $('[data-list]', el).innerHTML = page.map(row).join('') || `<p class="vc-empty">${filter === 'atendidos' ? 'Todavía no hay registros de ningún productor en este teléfono.' : filter === 'pendientes' ? 'Ningún productor tiene pendientes abiertos.' : 'Sin coincidencias en el Maestro.'}</p>`;
    $('[data-more]', el).innerHTML = farms.length > shown ? `<button class="vc-btn vc-btn--block" type="button" data-page>Mostrar ${Math.min(PAGE, farms.length - shown)} más (quedan ${farms.length - shown})</button>` : '';
  };
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-f]'); if (b) { filter = b.dataset.f; shown = PAGE; $$('[data-f]', el).forEach(x => x.setAttribute('aria-pressed', String(x === b))); render(); }
    if (e.target.closest('[data-page]')) { shown += PAGE; render(); }
  });
  $('[data-q]', el).addEventListener('input', e => { q = e.target.value; shown = PAGE; render(); });
  $('[data-zone]', el).addEventListener('change', e => { zone = e.target.value; shown = PAGE; render(); });
  render();
}

/* ---------- Expediente técnico ---------- */
export async function viewProducer(code, params = new URLSearchParams()) {
  const {reader} = await maestro(), farm = reader.farm(code); if (!farm) throw Error('Productor no encontrado en el Maestro.');
  const d = await dossierData(farm.code), {visits, findings, followups, photos} = d;
  visits.sort((a, b) => byDate(a.startedAt, b.startedAt));
  const records = reader.lotsOf(farm.code).filter(r => r.state.presence !== 'absent');
  const activeArea = records.filter(r => r.state.participatesCurrentArea && Number.isFinite(r.attributes.area)).reduce((s, r) => s + r.attributes.area, 0);
  const openF = findings.filter(f => OPEN.has(f.status)), openFu = followups.filter(f => OPEN.has(f.state)), overdue = followups.filter(M.isOverdue);
  const lastAt = [...visits.map(v => v.startedAt), ...findings.map(f => f.observedAt), ...photos.map(when)].sort(byDate)[0];
  let tab = params.get('tab') || 'resumen';
  const el = mount(`<section class="vc-card vc-dossier">
      <div class="vc-dossier__id"><span class="vc-avatar vc-avatar--lg">${esc(initials(farm.name))}</span><div style="min-width:0"><p class="vc-eyebrow">Expediente técnico</p><h1>${esc(farm.name)}</h1>
        <p class="vc-muted">${esc([`Hacienda ${farm.code}`, [...new Set(records.map(r => r.farm.zone))].join(', '), [...new Set(records.map(tenureOf))].join(' / '), plural(records.length, 'suerte'), activeArea ? `${fha(activeArea)} en área vigente` : ''].filter(Boolean).join(' · '))}</p></div></div>
      <p class="vc-dossier__state">${lastAt ? `Último registro ${fdate(lastAt)} (${relTime(lastAt)})` : 'Sin registros en este teléfono'} · ${plural(visits.length, 'visita formal', 'visitas formales')} · ${plural(findings.filter(f => !f.visitId).length, 'hallazgo de campo', 'hallazgos de campo')}${openF.length ? ` · ${plural(openF.length, 'problema abierto', 'problemas abiertos')}` : ''}${overdue.length ? ` · <strong class="vc-err">${plural(overdue.length, 'compromiso vencido', 'compromisos vencidos')}</strong>` : ''}</p>
      <div class="vc-dossier__acts"><button class="vc-btn vc-btn--sm vc-btn--primary" type="button" data-reg>${icon('malezas')}Hallazgo</button><a class="vc-btn vc-btn--sm" href="#/nueva?finca=${esc(farm.code)}">${icon('calendar')}Visita formal</a>
        <a class="vc-btn vc-btn--sm" href="#/mapa?finca=${esc(farm.code)}">${icon('map')}Mapa</a><a class="vc-btn vc-btn--sm" href="#/informe/productor/${esc(farm.code)}">${icon('report')}Informe</a></div></section>
    ${tabsHtml([['resumen', 'Resumen'], ['suertes', 'Suertes', records.length], ['cronologia', 'Cronología'], ['seguimiento', 'Seguimiento', openFu.length + openF.length], ['evidencias', 'Evidencias', photos.length]], tab)}
    <div class="vc-stack" data-pane></div>`);
  const pane = $('[data-pane]', el);
  const panes = {
    resumen: () => {
      const fams = Object.entries(FAMILIES).map(([k, f]) => [k, f, openF.filter(x => familyOf(x.category) === k)]).filter(([, , l]) => l.length);
      const recurrent = Object.entries(findings.reduce((a, f) => ((a[f.category] ??= new Set()).add((f.observedAt || '').slice(0, 10)), a), {})).filter(([, s]) => s.size > 1).sort((a, b) => b[1].size - a[1].size);
      const due = openFu.filter(f => f.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5);
      return `<section class="vc-card"><div class="vc-card__head"><h2>${icon('alert')}Situación actual</h2></div>
          ${fams.length ? `<div class="vc-famgrid">${fams.map(([k, f, l]) => `<div class="vc-famcard" style="--fam:${f.color};--fam-soft:${f.soft}"><p class="vc-famcard__t">${esc(f.label)}</p>
            ${[...new Set(l.map(x => x.category))].map(c => { const ls = l.filter(x => x.category === c); return `<p class="vc-famcard__row">${icon(category(c).icon)}<span><strong>${esc(category(c).label)}</strong> · ${esc([...new Set(ls.map(x => x.lotKey ? 'S ' + lotNum(x.lotKey) : 'Finca'))].join(', '))}</span></p>`; }).join('')}</div>`).join('')}</div>`
            : `<p class="vc-muted">${findings.length ? 'Sin problemas abiertos: los hallazgos registrados están resueltos o verificados.' : 'Sin hallazgos registrados.'}</p>`}</section>
        ${recurrent.length ? `<section class="vc-card"><div class="vc-card__head"><h2>${icon('sync')}Problemas recurrentes</h2><span class="vc-muted vc-small">observados en más de una fecha</span></div>
          <div class="vc-chips">${recurrent.map(([c, s]) => `<span class="vc-fam" style="${famVars(c)}">${icon(category(c).icon)}<span>${esc(category(c).label)} · ${plural(s.size, 'fecha')}</span></span>`).join('')}</div></section>` : ''}
        <section class="vc-card"><div class="vc-card__head"><h2>${icon('flag')}Próximos compromisos</h2></div>${due.length ? `<div class="vc-list">${due.map(followupRow).join('')}</div>` : '<p class="vc-muted">Sin compromisos con fecha pendiente.</p>'}</section>
        ${visits[0] ? `<section class="vc-card"><div class="vc-card__head"><h2>${icon('calendar')}Última visita formal</h2></div><div class="vc-list">${visitRow(visits[0], {findings: findings.filter(f => f.visitId === visits[0].id).length, photos: photos.filter(p => p.visitId === visits[0].id).length})}</div>
          ${visits[0].general?.notes ? `<p class="vc-quote">${esc(visits[0].general.notes)}</p>` : ''}</section>` : ''}`;
    },
    suertes: () => `<section class="vc-card"><p class="vc-muted vc-small" style="margin-bottom:8px">Datos del Maestro ${esc(reader.version().dataVersion)} (aforo ${fdate(reader.version().aforoDate)}). Tocá una suerte para ver su ficha completa.</p><div class="vc-stack">${records.map(r => {
      const c = agroCard(r, new Date().toISOString()), fs = findings.filter(f => f.lotKey === r.key), open = fs.filter(f => OPEN.has(f.status)).length;
      const facts = [c.variety, c.area !== null ? fha(c.area) : '', c.age !== null ? ageLabel(c.age) : '', c.type === 'planta' ? 'Planta' : c.cuts ? `Soca · ${c.cuts}.º corte` : '', c.irrigation, c.texture].filter(Boolean);
      return `<details class="vc-lotrow"><summary><span class="vc-lotnum">${esc(r.identity.lot)}</span><span class="vc-item__body"><span class="vc-item__title">Suerte ${esc(r.identity.lot)} <span class="vc-muted vc-small">· ${esc(r.identity.lotCode)} · ${esc(tenureOf(r))}</span></span>
          <span class="vc-item__sub">${esc(facts.join(' · ') || 'Sin datos agronómicos')}</span><span class="vc-item__ph">${phenologyHtml(r, new Date().toISOString())}${open ? ` <span class="vc-chip vc-chip--warn">${plural(open, 'abierto')}</span>` : ''}</span></span>${icon('chevron')}</summary>
        <div class="vc-lotrow__body">${agroHtml(r, new Date().toISOString())}<div class="vc-row-actions vc-row-actions--start"><a class="vc-btn vc-btn--sm vc-btn--primary" href="#/suerte/${encodeURIComponent(r.key)}">${icon('clipboard')}Ficha de la suerte</a><a class="vc-btn vc-btn--sm" href="#/mapa?finca=${esc(farm.code)}&suerte=${encodeURIComponent(r.key)}">${icon('map')}Mapa</a></div></div></details>`; }).join('')}</div></section>`,
    cronologia: () => timelineHtml({visits, findings, followups, photos}),
    seguimiento: () => followupBoard({findings, followups, photos}),
    evidencias: () => {
      const pairs = beforeAfter(findings, followups, photos), live = photos.filter(p => p.thumb || p.blob);
      const lots = [...new Set(live.map(p => p.lotKey || ''))].sort();
      return `${pairs.length ? `<section class="vc-card"><div class="vc-card__head"><h2>${icon('compare')}Antes y después</h2></div><div class="vc-stack">${compareBlock(pairs)}</div></section>` : ''}
        <section class="vc-card"><div class="vc-card__head"><h2>${icon('evidence')}Evidencias por suerte</h2><span class="vc-muted vc-small">${plural(live.length, 'fotografía')}</span></div>
        ${lots.map(k => group(live.filter(p => (p.lotKey || '') === k).sort((a, b) => byDate(when(a), when(b))), k ? `Suerte ${esc(lotNum(k))}` : 'Finca completa')).join('') || '<p class="vc-muted">Sin fotografías.</p>'}</section>`;
    },
  };
  const render = () => { pane.innerHTML = panes[tab](); hydrate(pane, photos); };
  el.addEventListener('click', async e => {
    const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; $$('[data-tab]', el).forEach(x => x.setAttribute('aria-selected', String(x === t))); history.replaceState(null, '', `#/productor/${farm.code}?tab=${tab}`); render(); }
    if (e.target.closest('[data-reg]')) { await M.setManualTarget(farm.code, null); location.hash = '#/registrar?accion=hallazgo'; }
  });
  render();
}

/** Cronología: visitas, hallazgos (de visita o de campo), seguimiento, cambios de estado y fotografías. */
function timelineHtml({visits, findings, followups, photos}) {
  const ev = [];
  for (const v of visits) ev.push({at: v.startedAt, kind: 'visita', ic: 'calendar', title: v.followupOf ? 'Visita formal de seguimiento' : 'Visita formal', sub: v.scope === 'finca' ? 'Finca completa' : 'Suertes ' + v.lotKeys.map(lotNum).join(', '), text: v.general?.notes || '', href: '#/visita/' + v.id, by: v.author?.name});
  for (const f of findings) {
    ev.push({at: f.observedAt, kind: 'hallazgo', cat: f.category, title: `${f.visitId ? 'Hallazgo' : 'Hallazgo de campo'} · ${category(f.category).label}`, sub: f.lotKey ? 'Suerte ' + lotNum(f.lotKey) : 'Finca completa', text: [f.observation, f.diagnosis ? 'Diagnóstico: ' + f.diagnosis : ''].filter(Boolean).join('\n'), href: '#/hallazgo/' + f.id, by: f.author});
    for (const h of (f.history || []).slice(1)) ev.push({at: h.at, kind: 'estado', ic: 'flag', title: `${category(f.category).label} → ${h.state}`, sub: f.lotKey ? 'Suerte ' + lotNum(f.lotKey) : '', text: h.note, href: '#/hallazgo/' + f.id, by: h.by});
  }
  for (const f of followups) {
    const label = {recomendacion: 'Recomendación emitida', solicitud: 'Solicitud registrada', compromiso: 'Compromiso acordado'}[f.kind];
    ev.push({at: f.createdAt, kind: f.kind, ic: KIND[f.kind].icon, title: label + (f.category ? ' · ' + requestType(f.category).label : ''), sub: [f.lotKey ? 'Suerte ' + lotNum(f.lotKey) : '', f.dueDate ? 'para el ' + fdate(f.dueDate) : '', f.responsible].filter(Boolean).join(' · '), text: f.text, href: '#/seguimiento/' + f.id});
    for (const h of (f.history || []).slice(1)) ev.push({at: h.at, kind: 'estado', ic: h.state === 'Verificado' ? 'check' : 'flag', title: `${KIND[f.kind].label} → ${h.state}`, sub: f.text, text: h.note, href: '#/seguimiento/' + f.id, by: h.by});
  }
  const shots = photos.reduce((a, p) => { const k = `${p.visitId || 'campo'}|${String(when(p)).slice(0, 10)}`; (a[k] ??= []).push(p); return a; }, {});
  for (const list of Object.values(shots)) ev.push({at: list.map(when).sort()[0], kind: 'fotos', ic: 'camera', title: plural(list.length, 'fotografía'), sub: [...new Set(list.map(photoKind))].join(' · '), photos: list.filter(p => p.thumb || p.blob), href: list[0].visitId ? '#/visita/' + list[0].visitId : '#/evidencia/' + list[0].id});
  ev.sort((a, b) => byDate(a.at, b.at));
  if (!ev.length) return '<section class="vc-card"><p class="vc-empty">Todavía no hay actividad registrada con este productor.</p></section>';
  let month = '';
  return `<section class="vc-card"><ol class="vc-timeline">${ev.map(e => {
    const m = fdate(e.at).slice(3), head = m !== month ? `<li class="vc-timeline__month">${esc(m)}</li>` : ''; month = m;
    return `${head}<li class="vc-timeline__ev vc-timeline__ev--${e.kind}" style="${e.cat ? famVars(e.cat) : ''}"><span class="vc-timeline__dot">${icon(e.cat ? category(e.cat).icon : e.ic)}</span>
      <a class="vc-timeline__body" href="${e.href}"><span class="vc-timeline__when">${fdt(e.at)}${e.by ? ' · ' + esc(e.by) : ''}</span><strong>${esc(e.title)}</strong>${e.sub ? `<span class="vc-muted">${esc(e.sub)}</span>` : ''}
      ${e.text ? `<span class="vc-timeline__text">${esc(e.text)}</span>` : ''}${e.photos?.length ? `<span class="vc-thumbs">${e.photos.slice(0, 6).map(p => `<img alt="" data-src-photo="${esc(p.id)}">`).join('')}</span>` : ''}</a></li>`;
  }).join('')}</ol></section>`;
}

/** Seguimiento por etapa del problema y, aparte, recomendaciones, solicitudes y compromisos. */
function followupBoard({findings, followups, photos}) {
  const stages = PROGRESS.map((l, i) => [l, findings.filter(f => progressOf(f, followups) === i && (i > 0 || OPEN.has(f.status)))]);
  const kinds = ['recomendacion', 'solicitud', 'compromiso'].map(k => [k, followups.filter(f => f.kind === k).sort((a, b) => (OPEN.has(b.state) - OPEN.has(a.state)) || byDate(a.createdAt, b.createdAt))]);
  return `<section class="vc-card"><div class="vc-card__head"><h2>${icon('gestion')}Problemas por etapa</h2></div>
      <div class="vc-stages">${stages.map(([l, list], i) => `<div class="vc-stage"><p class="vc-stage__t"><span class="vc-stage__n">${i + 1}</span>${esc(l)} <span class="vc-muted">${list.length}</span></p>
        ${list.length ? `<div class="vc-stack">${list.map(f => findingRow(f, {photos})).join('')}</div>` : '<p class="vc-muted vc-small">—</p>'}</div>`).join('')}</div></section>
    ${kinds.map(([k, list]) => list.length ? `<section class="vc-card"><div class="vc-card__head"><h2>${icon(KIND[k].icon)}${KIND[k].plural}</h2><span class="vc-muted vc-small">${(n => `${n} abierta${n === 1 ? '' : 's'}`)(list.filter(f => OPEN.has(f.state)).length)}</span></div><div class="vc-list">${list.map(followupRow).join('')}</div></section>` : '').join('')}
    <p class="vc-muted vc-small">Una recomendación no es una labor ejecutada y una solicitud atendida no es una ejecución agronómica: la ejecución y la verificación las declara el técnico con su nota y evidencia.</p>`;
}

/* ---------- Ficha de suerte ---------- */
export async function viewLot(key) {
  const {reader} = await maestro(), r = reader.byKey(key); if (!r) throw Error('La suerte no está en el Maestro vigente.');
  const code = r.identity.farmCode, d = await dossierData(code), now = new Date().toISOString();
  const findings = d.findings.filter(f => f.lotKey === key).sort((a, b) => byDate(a.observedAt, b.observedAt)), followups = d.followups.filter(f => f.lotKey === key);
  const photos = d.photos.filter(p => p.lotKey === key && (p.thumb || p.blob)).sort((a, b) => byDate(when(a), when(b)));
  const visits = d.visits.filter(v => v.scope === 'finca' || v.lotKeys.includes(key)).sort((a, b) => byDate(a.startedAt, b.startedAt));
  const el = mount(`<section class="vc-card"><div class="vc-card__head"><div style="min-width:0"><p class="vc-eyebrow"><a class="vc-link" href="#/productor/${esc(code)}">${esc(r.farm.name)} · hacienda ${esc(code)}</a></p><h1>Suerte ${esc(r.identity.lot)} <span class="vc-muted vc-small">código ${esc(r.identity.lotCode)}</span></h1></div>
      <div class="vc-chips"><span class="vc-chip">${esc(tenureOf(r))}</span>${phenologyHtml(r, now)}</div></div>
      <div class="vc-lotgrid"><div>${agroHtml(r, now)}<p class="vc-muted vc-small" style="margin-top:6px">Maestro ${esc(reader.version().dataVersion)} · aforo ${fdate(reader.version().aforoDate)}</p></div><div class="vc-lotmap" data-map><p class="vc-muted vc-small">Cargando mapa…</p></div></div>
      <div class="vc-row-actions vc-row-actions--start"><button class="vc-btn vc-btn--primary" type="button" data-reg>${icon('malezas')}Hallazgo aquí</button><label class="vc-btn" data-capture data-here-ev>${icon('camera')}Evidencia<input type="file" accept="image/*" capture="environment" data-evidence hidden></label>
        <a class="vc-btn" href="#/nueva?finca=${esc(code)}&suerte=${encodeURIComponent(key)}">${icon('calendar')}Visita formal</a><a class="vc-btn" href="#/mapa?finca=${esc(code)}&suerte=${encodeURIComponent(key)}">${icon('map')}Mapa</a></div></section>
    <section class="vc-card"><div class="vc-card__head"><h2>${icon('alert')}Hallazgos</h2><span class="vc-muted vc-small">${plural(findings.filter(f => OPEN.has(f.status)).length, 'abierto')}</span></div>
      ${findings.length ? `<div class="vc-stack">${findings.map(f => findingRow(f, {photos: d.photos, followups})).join('')}</div>` : '<p class="vc-muted">Sin hallazgos en esta suerte.</p>'}</section>
    <section class="vc-card"><div class="vc-card__head"><h2>${icon('check')}Recomendaciones, solicitudes y compromisos</h2></div>${followups.length ? `<div class="vc-list">${followups.map(followupRow).join('')}</div>` : '<p class="vc-muted">Sin seguimiento registrado.</p>'}</section>
    <section class="vc-card"><div class="vc-card__head"><h2>${icon('evidence')}Evidencias</h2><span class="vc-muted vc-small">${photos.length}</span></div>${photos.length ? group(photos) : '<p class="vc-muted">Sin fotografías de esta suerte.</p>'}</section>
    <section class="vc-card"><div class="vc-card__head"><h2>${icon('calendar')}Visitas formales</h2></div>${visits.length ? `<div class="vc-list">${visits.map(v => visitRow(v, {findings: d.findings.filter(f => f.visitId === v.id && f.lotKey === key).length, photos: d.photos.filter(p => p.visitId === v.id && p.lotKey === key).length})).join('')}</div>` : '<p class="vc-muted">Sin visitas formales a esta suerte.</p>'}</section>`);
  hydrate(el, d.photos);
  el.addEventListener('pointerdown', e => { if (e.target.closest('[data-here-ev]')) void M.setManualTarget(code, key); });
  bindEvidence(el);
  el.addEventListener('click', async e => { if (e.target.closest('[data-reg]')) { await M.setManualTarget(code, key); location.hash = '#/registrar?accion=hallazgo'; } });
  const feats = await featuresFor(reader.lotsOf(code).map(x => x.identity.lotCode)).catch(() => []), box = $('[data-map]', el);
  if (box) box.innerHTML = feats.length ? farmMapSvg(feats, {highlight: new Set([r.identity.lotCode]), labels: new Map(reader.lotsOf(code).map(x => [x.identity.lotCode, x.identity.lot])),
    points: findings.filter(f => f.gps?.source === 'device').map(f => f.gps)}) : '<p class="vc-muted vc-small">Geometría no disponible sin la capa GIS.</p>';
}

/* ---------- Gestión ---------- */
const GKINDS = [['hallazgos', 'Hallazgos'], ['recomendacion', 'Recomendaciones'], ['solicitud', 'Solicitudes'], ['compromiso', 'Compromisos'], ['todos', 'Todo el seguimiento']];
export async function viewGestion(params) {
  let data; try { data = await M.everything(); } catch (e) { mount(errorCard('No se pudieron leer los registros de este teléfono', e)); return; }
  let k = params.get('k') || 'hallazgos', f = params.get('f') || 'abiertos', q = '', origin = '';
  if (k === 'vencidos') { k = 'todos'; f = 'vencidos'; }
  const el = mount(`<section class="vc-card"><div class="vc-card__head"><div><h1>Gestión técnica</h1><p class="vc-muted">Problemas observados y lo que se recomendó, solicitó y acordó</p></div><a class="vc-btn vc-btn--sm vc-btn--primary" href="#/registrar">${icon('plus')}Registrar</a></div>
    ${tabsHtml(GKINDS, k)}
    <div class="vc-toolbar vc-toolbar--wrap" style="margin-top:10px"><label class="vc-search">${icon('search')}<input class="vc-input" type="search" placeholder="Productor, suerte o texto" data-q data-casur-query></label>
      <div class="vc-seg" role="group" aria-label="Estado">${[['abiertos', 'Abiertos'], ['vencidos', 'Vencidos'], ['cerrados', 'Cerrados'], ['todos', 'Todos']].map(([x, l]) => `<button type="button" data-f="${x}" aria-pressed="${x === f}">${l}</button>`).join('')}</div>
      <select class="vc-input vc-input--pill" data-origin aria-label="Origen"><option value="">Visitas y campo</option><option value="campo">Solo hallazgos de campo</option><option value="visita">Solo de visitas formales</option></select></div></section>
    <div class="vc-stack" data-list></div>`);
  const match = (x, ...texts) => !q || texts.join(' ').toLowerCase().includes(q.toLowerCase());
  const render = () => {
    const list = $('[data-list]', el);
    if (k === 'hallazgos') {
      const late = new Set(data.followups.filter(M.isOverdue).map(x => x.findingId).filter(Boolean));
      const items = data.findings.filter(x => (f === 'abiertos' ? OPEN.has(x.status) : f === 'vencidos' ? late.has(x.id) : f === 'cerrados' ? !OPEN.has(x.status) : true)
        && (!origin || (origin === 'campo' ? !x.visitId : !!x.visitId)) && match(x, x.producer?.name || '', x.producer?.code || '', lotNum(x.lotKey), x.observation, x.diagnosis || '', category(x.category).label)).sort((a, b) => byDate(a.observedAt, b.observedAt));
      list.innerHTML = items.map(x => findingRow(x, {photos: data.photos, followups: data.followups})).join('') || `<p class="vc-empty">Sin hallazgos con estos filtros.</p>`;
      hydrate(list, data.photos);
    } else {
      const items = data.followups.filter(x => (k === 'todos' || x.kind === k) && (f === 'abiertos' ? OPEN.has(x.state) : f === 'vencidos' ? M.isOverdue(x) : f === 'cerrados' ? !OPEN.has(x.state) : true)
        && (!origin || (origin === 'campo' ? !x.visitId : !!x.visitId)) && match(x, x.producerName || '', x.producerCode || '', lotNum(x.lotKey), x.text, x.responsible || '')).sort((a, b) => (a.dueDate || '9').localeCompare(b.dueDate || '9') || byDate(a.createdAt, b.createdAt));
      list.innerHTML = items.length ? `<section class="vc-card"><div class="vc-list">${items.map(followupRow).join('')}</div></section>` : `<p class="vc-empty">Nada ${f === 'vencidos' ? 'vencido' : f === 'cerrados' ? 'cerrado' : f === 'todos' ? 'registrado' : 'abierto'} aquí.</p>`;
    }
    history.replaceState(null, '', `#/gestion?k=${k}&f=${f}`);
  };
  el.addEventListener('click', e => {
    const tb = e.target.closest('[data-tab]'); if (tb) { k = tb.dataset.tab; $$('[data-tab]', el).forEach(x => x.setAttribute('aria-selected', String(x === tb))); render(); }
    const b = e.target.closest('[data-f]'); if (b) { f = b.dataset.f; $$('[data-f]', el).forEach(x => x.setAttribute('aria-pressed', String(x === b))); render(); }
  });
  $('[data-q]', el).addEventListener('input', e => { q = e.target.value; render(); });
  $('[data-origin]', el).addEventListener('change', e => { origin = e.target.value; render(); });
  render();
}

/* ---------- Evidencias ---------- */
const KINDS = ['Evidencia rápida', 'Visita', 'Hallazgo', 'Seguimiento', 'Verificación'];
export async function viewEvidence(params) {
  let data; try { data = await M.everything(); } catch (e) { mount(errorCard('No se pudieron leer los registros de este teléfono', e)); return; }
  let prod = params.get('productor') || '', kind = '', backup = '', only = params.get('f') || '';
  const producers = [...M.attendedProducers(data).values()].sort((a, b) => a.name.localeCompare(b.name));
  const el = mount(`<section class="vc-card"><div class="vc-card__head"><div><h1>Evidencias</h1><p class="vc-muted">Fotografías originales: rápidas, de hallazgos, de visitas y de seguimiento</p></div>
      <label class="vc-btn vc-btn--sm vc-btn--primary" data-capture>${icon('camera')}Nueva<input type="file" accept="image/*" capture="environment" data-evidence hidden></label></div>
    <div class="vc-filters" style="margin-bottom:10px"><button type="button" data-only="" aria-pressed="${!only}">Todas</button><button type="button" data-only="sin-identificar" aria-pressed="${only === 'sin-identificar'}">Sin identificar</button></div>
    <div class="vc-grid3"><label class="vc-field"><span>Productor</span><select data-prod><option value="">Todos</option>${producers.map(p => `<option value="${esc(p.code)}" ${p.code === prod ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label class="vc-field"><span>Origen</span><select data-kind><option value="">Todo</option>${KINDS.map(x => `<option>${x}</option>`).join('')}</select></label>
      <label class="vc-field"><span>Respaldo</span><select data-backup><option value="">Todos</option><option value="pendiente">Sin respaldo confirmado</option><option value="confirmada">Respaldo confirmado</option></select></label></div></section>
    <div class="vc-stack" data-list></div>`);
  const render = () => {
    const sel = data.photos.filter(p => (!prod || codeOf(p) === prod) && (!kind || photoKind(p) === kind) && (!backup || (backup === 'confirmada' ? p.backupState === 'confirmada' : p.backupState !== 'confirmada')) && (only !== 'sin-identificar' || !M.producerOf(p)));
    const pairs = only || kind || backup ? [] : beforeAfter(data.findings.filter(f => !prod || codeOf(f) === prod), data.followups, data.photos);
    const groups = Object.entries(sel.reduce((a, p) => { const k = `${String(when(p)).slice(0, 10)}|${codeOf(p) || '—'}`; (a[k] ??= []).push(p); return a; }, {})).sort((a, b) => byDate(a[0], b[0]));
    $('[data-list]', el).innerHTML = (pairs.length ? `<section class="vc-card"><div class="vc-card__head"><h2>${icon('compare')}Antes y después</h2></div><div class="vc-stack">${compareBlock(pairs)}</div></section>` : '')
      + (groups.length ? groups.map(([key, list]) => { const [day] = key.split('|'), p = M.producerOf(list[0]);
        return `<section class="vc-card"><div class="vc-card__head"><div style="min-width:0"><h2 class="vc-truncate">${p ? esc(p.name) : 'Sin identificar'}</h2><p class="vc-muted">${fdate(day)} · ${plural(list.length, 'fotografía')}</p></div>${p ? `<a href="#/productor/${esc(p.code)}?tab=evidencias">Expediente</a>` : ''}</div>
          ${KINDS.map(x => group(list.filter(ph => photoKind(ph) === x).sort((a, b) => byDate(when(b), when(a))), x === 'Visita' ? 'De visitas formales' : x === 'Hallazgo' ? 'De hallazgos' : x === 'Seguimiento' ? 'Del seguimiento' : x === 'Verificación' ? 'De verificación' : 'Evidencias rápidas')).join('')}</section>`; }).join('')
        : '<p class="vc-empty">Sin fotografías con estos filtros.</p>');
    hydrate($('[data-list]', el), data.photos);
  };
  el.addEventListener('change', e => { if (e.target.matches('[data-prod]')) prod = e.target.value; if (e.target.matches('[data-kind]')) kind = e.target.value; if (e.target.matches('[data-backup]')) backup = e.target.value; if (e.target.matches('select')) render(); });
  el.addEventListener('click', e => { const b = e.target.closest('[data-only]'); if (b) { only = b.dataset.only; $$('[data-only]', el).forEach(x => x.setAttribute('aria-pressed', String(x === b))); render(); } });
  bindEvidence(el);
  render();
}
