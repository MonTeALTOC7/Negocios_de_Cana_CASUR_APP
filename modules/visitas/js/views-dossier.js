/* Atención técnica centrada en el productor: Productores, Expediente técnico (resumen, suertes, cronología,
   seguimiento y evidencias), Ficha de suerte, Gestión y Evidencias. Ningún indicador presenta conteos de registros
   como impacto agronómico: los números describen la gestión (qué está abierto, vencido o verificado). */
import {icon} from './icons.js';
import {$, $$, esc, fdate, fdt, fha, relTime} from './ui.js';
import * as store from './store.js';
import * as M from './model.js';
import {maestro, searchFarms} from './maestro.js';
import {featuresFor} from './geo.js';
import {category, OPEN, KIND, FAMILIES, familyOf, PROGRESS, progressOf, requestType} from './catalog.js';
import {agroHtml, phenologyHtml, galleryHtml, hydrateGallery, bindGallery, findingRow, followupRow, visitRow, familyBadge, famVars, progressHtml, photoKind, compareHtml} from './components.js';
import {farmMapSvg} from './reports.js';
import {mount, initials, producerRow, lotNum} from './views-main.js';

const byDate = (a, b) => String(b).localeCompare(String(a));
const plural = (n, s, p = s + 's') => `${n} ${n === 1 ? s : p}`;
/** Todo lo de un productor: visitas, hallazgos, seguimiento y fotos (vivos). */
async function dossierData(code) {
  const data = await M.everything(), visits = data.visits.filter(v => v.producer.code === code), ids = new Set(visits.map(v => v.id));
  return {visits, findings: data.findings.filter(f => ids.has(f.visitId)), followups: data.followups.filter(f => f.producerCode === code), photos: data.photos.filter(p => ids.has(p.visitId))};
}
const tabsHtml = (tabs, cur) => `<nav class="vc-tabs" role="tablist">${tabs.map(([k, l, n]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === cur}">${l}${n ? `<span class="vc-tabs__n">${n}</span>` : ''}</button>`).join('')}</nav>`;
/** Galería de solo consulta con visor, etiquetado y descarga (el contexto de cada foto sale de su visita). */
function viewerFor(root, photos, {visits, findings}) {
  const vById = new Map(visits.map(v => [v.id, v])), fById = new Map(findings.map(f => [f.id, f]));
  hydrateGallery(root, photos);
  for (const g of $$('[data-gal-group]', root)) {
    const list = photos.filter(p => g.dataset.galGroup.split(',').includes(p.id)), visit = vById.get(list[0]?.visitId);
    bindGallery(g, () => list, {visit, findingFor: p => fById.get(p.findingId) || null, recordFor: p => M.recordOf(vById.get(p.visitId), p.lotKey)});
  }
}
const group = (photos, title = '') => photos.length ? `<div class="vc-galgroup">${title ? `<p class="vc-galgroup__t">${title}</p>` : ''}<div data-gal-group="${photos.map(p => esc(p.id)).join(',')}">${galleryHtml(photos)}</div></div>` : '';
/** Pares antes/después: evidencia inicial del hallazgo frente a la evidencia del seguimiento de sus recomendaciones. */
function beforeAfter(findings, followups, photos) {
  return findings.map(f => {
    const fus = new Set(followups.filter(x => x.findingId === f.id).map(x => x.id));
    const before = photos.filter(p => p.findingId === f.id && (p.thumb || p.blob)).sort((a, b) => byDate(b.takenAt || b.addedAt, a.takenAt || a.addedAt))[0];
    const after = photos.filter(p => fus.has(p.followupId) && (p.thumb || p.blob)).sort((a, b) => byDate(a.takenAt || a.addedAt, b.takenAt || b.addedAt))[0];
    return before && after ? {finding: f, before, after} : null;
  }).filter(Boolean);
}
function compareBlock(pairs, visitsById) {
  return pairs.map(({finding: f, before, after}) => `<div data-gal-group="${esc(before.id)},${esc(after.id)}">${compareHtml(before, after,
    {title: `${familyBadge(f.category)} <span>${esc(visitsById.get(f.visitId)?.producer.name || '')} · ${f.lotKey ? 'Suerte ' + esc(lotNum(f.lotKey)) : 'Finca completa'}</span>`})}</div>`).join('');
}

/* ---------- Productores ---------- */
export async function viewProducers(params) {
  const {reader} = await maestro(), data = await M.everything();
  const lastBy = new Map(), openBy = new Map(), overdueBy = new Map();
  for (const v of data.visits) if (!lastBy.has(v.producer.code) || v.startedAt > lastBy.get(v.producer.code)) lastBy.set(v.producer.code, v.startedAt);
  for (const f of data.followups) { if (OPEN.has(f.state)) openBy.set(f.producerCode, (openBy.get(f.producerCode) || 0) + 1); if (M.isOverdue(f)) overdueBy.set(f.producerCode, (overdueBy.get(f.producerCode) || 0) + 1); }
  const vCode = new Map(data.visits.map(v => [v.id, v.producer.code]));
  for (const f of data.findings) if (OPEN.has(f.status)) { const c = vCode.get(f.visitId); openBy.set(c, (openBy.get(c) || 0) + 1); }
  let mode = params.get('f') || (lastBy.size ? 'atendidos' : 'maestro'), q = '';
  const el = mount(`<section class="vc-card"><div class="vc-card__head"><div><h1>Productores</h1><p class="vc-muted">Expediente técnico de cada productor y sus suertes</p></div></div>
    <label class="vc-search">${icon('search')}<input class="vc-input" type="search" placeholder="Nombre, código del productor o de la suerte" data-q data-casur-query></label>
    <div class="vc-filters" style="margin-top:10px">${[['atendidos', 'Atendidos'], ['pendientes', 'Con pendientes'], ['maestro', 'Todos los del Maestro']].map(([k, l]) => `<button type="button" data-f="${k}" aria-pressed="${k === mode}">${l}</button>`).join('')}</div>
    <div class="vc-list" data-list style="margin-top:6px"></div></section>`);
  const render = () => {
    let farms = q ? searchFarms(reader, q, 80) : reader.farms();
    if (mode === 'atendidos') farms = farms.filter(f => lastBy.has(f.code)).sort((a, b) => byDate(lastBy.get(a.code), lastBy.get(b.code)));
    if (mode === 'pendientes') farms = farms.filter(f => openBy.get(f.code)).sort((a, b) => (overdueBy.get(b.code) || 0) - (overdueBy.get(a.code) || 0) || (openBy.get(b.code) || 0) - (openBy.get(a.code) || 0));
    const shown = farms.slice(0, 60);
    $('[data-list]', el).innerHTML = shown.map(f => producerRow(f, {last: lastBy.get(f.code), open: openBy.get(f.code) || 0, overdue: overdueBy.get(f.code) || 0})).join('')
      + (farms.length > shown.length ? `<p class="vc-muted vc-small" style="padding:10px 2px">Se muestran ${shown.length} de ${farms.length}. Escribí un nombre o código para acotar.</p>` : '')
      || `<p class="vc-empty">${mode === 'atendidos' ? 'Todavía no hay productores atendidos en este teléfono. Buscá en «Todos los del Maestro».' : mode === 'pendientes' ? 'Ningún productor tiene pendientes abiertos.' : 'Sin coincidencias en el Maestro.'}</p>`;
  };
  el.addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b) return; mode = b.dataset.f; $$('[data-f]', el).forEach(x => x.setAttribute('aria-pressed', String(x === b))); render(); });
  $('[data-q]', el).addEventListener('input', e => { q = e.target.value; if (q && mode !== 'maestro' && !searchFarms(reader, q, 80).some(f => mode === 'atendidos' ? lastBy.has(f.code) : openBy.get(f.code))) { mode = 'maestro'; $$('[data-f]', el).forEach(x => x.setAttribute('aria-pressed', String(x.dataset.f === mode))); } render(); });
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
  let tab = params.get('tab') || 'resumen';
  const el = mount(`<section class="vc-card vc-dossier">
      <div class="vc-dossier__id"><span class="vc-avatar vc-avatar--lg">${esc(initials(farm.name))}</span><div style="min-width:0"><p class="vc-eyebrow">Expediente técnico</p><h1>${esc(farm.name)}</h1>
        <p class="vc-muted">${esc(['Código ' + farm.code, farm.zone, plural(records.length, 'suerte'), activeArea ? `${fha(activeArea)} en área vigente` : ''].filter(Boolean).join(' · '))}</p></div></div>
      <p class="vc-dossier__state">${visits.length ? `Última visita ${fdate(visits[0].startedAt)} (${relTime(visits[0].startedAt)})` : 'Sin visitas registradas'}${openF.length ? ` · ${plural(openF.length, 'problema abierto', 'problemas abiertos')}` : ''}${overdue.length ? ` · <strong class="vc-err">${plural(overdue.length, 'compromiso vencido', 'compromisos vencidos')}</strong>` : ''}</p>
      <div class="vc-dossier__acts"><a class="vc-btn vc-btn--sm vc-btn--primary" href="#/nueva?finca=${esc(farm.code)}">${icon('calendar')}Nueva visita</a><button class="vc-btn vc-btn--sm" type="button" data-reg>${icon('plus')}Hallazgo</button>
        <a class="vc-btn vc-btn--sm" href="#/mapa?finca=${esc(farm.code)}">${icon('map')}Mapa</a><a class="vc-btn vc-btn--sm" href="#/informe/productor/${esc(farm.code)}">${icon('report')}Informe</a></div></section>
    ${tabsHtml([['resumen', 'Resumen'], ['suertes', 'Suertes', records.length], ['cronologia', 'Cronología'], ['seguimiento', 'Seguimiento', openFu.length + openF.length], ['evidencias', 'Evidencias', photos.length]], tab)}
    <div class="vc-stack" data-pane></div>`);
  const pane = $('[data-pane]', el), vById = new Map(visits.map(v => [v.id, v]));
  const panes = {
    resumen: () => {
      const fams = Object.entries(FAMILIES).map(([k, f]) => [k, f, openF.filter(x => familyOf(x.category) === k)]).filter(([, , l]) => l.length);
      const recurrent = Object.entries(findings.reduce((a, f) => ((a[f.category] ??= new Set()).add(f.visitId), a), {})).filter(([, s]) => s.size > 1).sort((a, b) => b[1].size - a[1].size);
      const due = openFu.filter(f => f.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5);
      return `<section class="vc-card"><div class="vc-card__head"><h2>${icon('alert')}Situación actual</h2></div>
          ${fams.length ? `<div class="vc-famgrid">${fams.map(([k, f, l]) => `<div class="vc-famcard" style="--fam:${f.color};--fam-soft:${f.soft}"><p class="vc-famcard__t">${esc(f.label)}</p>
            ${[...new Set(l.map(x => x.category))].map(c => { const ls = l.filter(x => x.category === c); return `<p class="vc-famcard__row">${icon(category(c).icon)}<span><strong>${esc(category(c).label)}</strong> · ${esc([...new Set(ls.map(x => x.lotKey ? 'S ' + lotNum(x.lotKey) : 'Finca'))].join(', '))}</span></p>`; }).join('')}</div>`).join('')}</div>`
            : `<p class="vc-muted">${findings.length ? 'Sin problemas abiertos: los hallazgos registrados están resueltos o verificados.' : 'Sin hallazgos registrados.'}</p>`}</section>
        ${recurrent.length ? `<section class="vc-card"><div class="vc-card__head"><h2>${icon('sync')}Problemas recurrentes</h2><span class="vc-muted vc-small">observados en más de una visita</span></div>
          <div class="vc-chips">${recurrent.map(([c, s]) => `<span class="vc-fam" style="${famVars(c)}">${icon(category(c).icon)}<span>${esc(category(c).label)} · ${plural(s.size, 'visita')}</span></span>`).join('')}</div></section>` : ''}
        <section class="vc-card"><div class="vc-card__head"><h2>${icon('flag')}Próximos compromisos</h2></div>${due.length ? `<div class="vc-list">${due.map(followupRow).join('')}</div>` : '<p class="vc-muted">Sin compromisos con fecha pendiente.</p>'}</section>
        ${visits[0] ? `<section class="vc-card"><div class="vc-card__head"><h2>${icon('calendar')}Última visita</h2></div><div class="vc-list">${visitRow(visits[0], {findings: findings.filter(f => f.visitId === visits[0].id).length, photos: photos.filter(p => p.visitId === visits[0].id).length})}</div>
          ${visits[0].general?.notes ? `<p class="vc-quote">${esc(visits[0].general.notes)}</p>` : ''}</section>` : ''}`;
    },
    suertes: () => `<section class="vc-card"><div class="vc-list">${records.map(r => {
      const fs = findings.filter(f => f.lotKey === r.key), open = fs.filter(f => OPEN.has(f.status)).length;
      const last = visits.find(v => v.scope === 'finca' || v.lotKeys.includes(r.key)), ph = phenologyHtml(r, new Date().toISOString());
      return `<a class="vc-item" href="#/suerte/${encodeURIComponent(r.key)}"><span class="vc-lotnum">${esc(r.identity.lot)}</span><span class="vc-item__body"><span class="vc-item__title">${esc([r.attributes.variety, r.attributes.area !== null ? fha(r.attributes.area) : ''].filter(Boolean).join(' · ') || 'Sin datos')}</span>
        <span class="vc-item__sub">${esc([r.state.operationalState, last ? 'Última visita ' + fdate(last.startedAt) : 'Sin visitas'].filter(Boolean).join(' · '))}</span>${ph ? `<span class="vc-item__ph">${ph}</span>` : ''}</span>
        <span class="vc-item__side">${open ? `<span class="vc-chip vc-chip--warn">${plural(open, 'abierto')}</span>` : ''}${icon('chevron')}</span></a>`; }).join('')}</div></section>`,
    cronologia: () => timelineHtml({visits, findings, followups, photos}),
    seguimiento: () => followupBoard({findings, followups, visitsById: vById, photos}),
    evidencias: () => {
      const pairs = beforeAfter(findings, followups, photos), live = photos.filter(p => p.thumb || p.blob);
      const lots = [...new Set(live.map(p => p.lotKey || ''))].sort();
      return `${pairs.length ? `<section class="vc-card"><div class="vc-card__head"><h2>${icon('compare')}Antes y después</h2></div><div class="vc-stack">${compareBlock(pairs, vById)}</div></section>` : ''}
        <section class="vc-card"><div class="vc-card__head"><h2>${icon('evidence')}Evidencias por suerte</h2><span class="vc-muted vc-small">${plural(live.length, 'fotografía')}</span></div>
        ${lots.map(k => group(live.filter(p => (p.lotKey || '') === k).sort((a, b) => byDate(a.takenAt || a.addedAt, b.takenAt || b.addedAt)), k ? `Suerte ${esc(lotNum(k))}` : 'Finca completa')).join('') || '<p class="vc-muted">Sin fotografías.</p>'}</section>`;
    },
  };
  const render = () => { pane.innerHTML = panes[tab](); viewerFor(pane, photos, d); };
  el.addEventListener('click', async e => {
    const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; $$('[data-tab]', el).forEach(x => x.setAttribute('aria-selected', String(x === t))); history.replaceState(null, '', `#/productor/${farm.code}?tab=${tab}`); render(); }
    if (e.target.closest('[data-reg]')) { await M.setManualTarget(farm.code, null); location.hash = '#/registrar?accion=hallazgo'; }
  });
  render();
}

/** Cronología: visitas, hallazgos, recomendaciones, solicitudes, compromisos, cambios de estado y fotografías. */
function timelineHtml({visits, findings, followups, photos}) {
  const ev = [], vById = new Map(visits.map(v => [v.id, v]));
  for (const v of visits) ev.push({at: v.startedAt, kind: 'visita', ic: 'calendar', title: v.followupOf ? 'Visita de seguimiento' : 'Visita técnica', sub: v.scope === 'finca' ? 'Finca completa' : 'Suertes ' + v.lotKeys.map(lotNum).join(', '), text: v.general?.notes || '', href: '#/visita/' + v.id, by: v.author?.name});
  for (const f of findings) {
    ev.push({at: f.observedAt, kind: 'hallazgo', cat: f.category, title: `Hallazgo · ${category(f.category).label}`, sub: f.lotKey ? 'Suerte ' + lotNum(f.lotKey) : 'Finca completa', text: f.observation, href: '#/hallazgo/' + f.id});
    for (const h of (f.history || []).slice(1)) ev.push({at: h.at, kind: 'estado', ic: 'flag', title: `${category(f.category).label} → ${h.state}`, sub: f.lotKey ? 'Suerte ' + lotNum(f.lotKey) : '', text: h.note, href: '#/hallazgo/' + f.id, by: h.by});
  }
  for (const f of followups) {
    const label = {recomendacion: 'Recomendación emitida', solicitud: 'Solicitud registrada', compromiso: 'Compromiso acordado'}[f.kind];
    ev.push({at: f.createdAt, kind: f.kind, ic: KIND[f.kind].icon, title: label + (f.category ? ' · ' + requestType(f.category).label : ''), sub: [f.lotKey ? 'Suerte ' + lotNum(f.lotKey) : '', f.dueDate ? 'para el ' + fdate(f.dueDate) : '', f.responsible].filter(Boolean).join(' · '), text: f.text, href: '#/seguimiento/' + f.id});
    for (const h of (f.history || []).slice(1)) ev.push({at: h.at, kind: 'estado', ic: h.state === 'Verificado' ? 'check' : 'flag', title: `${KIND[f.kind].label} → ${h.state}`, sub: f.text, text: h.note, href: '#/seguimiento/' + f.id, by: h.by});
  }
  const shots = photos.reduce((a, p) => { const k = `${p.visitId}|${(p.takenAt || p.addedAt).slice(0, 10)}`; (a[k] ??= []).push(p); return a; }, {});
  for (const list of Object.values(shots)) ev.push({at: list.map(p => p.takenAt || p.addedAt).sort()[0], kind: 'fotos', ic: 'camera', title: plural(list.length, 'fotografía'), sub: [...new Set(list.map(photoKind))].join(' · '), photos: list.filter(p => p.thumb || p.blob), href: '#/visita/' + list[0].visitId});
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

/** Seguimiento por etapa: problema observado → recomendado → en ejecución → verificado; y solicitudes y compromisos aparte. */
function followupBoard({findings, followups, visitsById, photos}) {
  const stages = PROGRESS.map((l, i) => [l, findings.filter(f => progressOf(f, followups) === i && (i > 0 || OPEN.has(f.status)))]);
  const kinds = ['recomendacion', 'solicitud', 'compromiso'].map(k => [k, followups.filter(f => f.kind === k).sort((a, b) => (OPEN.has(b.state) - OPEN.has(a.state)) || byDate(a.createdAt, b.createdAt))]);
  return `<section class="vc-card"><div class="vc-card__head"><h2>${icon('gestion')}Problemas por etapa</h2></div>
      <div class="vc-stages">${stages.map(([l, list], i) => `<div class="vc-stage"><p class="vc-stage__t"><span class="vc-stage__n">${i + 1}</span>${esc(l)} <span class="vc-muted">${list.length}</span></p>
        ${list.length ? `<div class="vc-stack">${list.map(f => findingRow(f, {visit: visitsById.get(f.visitId), photos})).join('')}</div>` : '<p class="vc-muted vc-small">—</p>'}</div>`).join('')}</div></section>
    ${kinds.map(([k, list]) => list.length ? `<section class="vc-card"><div class="vc-card__head"><h2>${icon(KIND[k].icon)}${KIND[k].plural}</h2><span class="vc-muted vc-small">${(n => `${n} abierta${n === 1 ? '' : 's'}`)(list.filter(f => OPEN.has(f.state)).length)}</span></div><div class="vc-list">${list.map(followupRow).join('')}</div></section>` : '').join('')}
    <p class="vc-muted vc-small">Una recomendación no es una labor ejecutada y una solicitud no es una entrega: la ejecución y la verificación las declara el técnico con su nota y evidencia.</p>`;
}

/* ---------- Ficha de suerte ---------- */
export async function viewLot(key) {
  const {reader} = await maestro(), r = reader.byKey(key); if (!r) throw Error('La suerte no está en el Maestro vigente.');
  const code = r.identity.farmCode, d = await dossierData(code), now = new Date().toISOString();
  const findings = d.findings.filter(f => f.lotKey === key).sort((a, b) => byDate(a.observedAt, b.observedAt)), followups = d.followups.filter(f => f.lotKey === key);
  const photos = d.photos.filter(p => p.lotKey === key && (p.thumb || p.blob)).sort((a, b) => byDate(a.takenAt || a.addedAt, b.takenAt || b.addedAt));
  const visits = d.visits.filter(v => v.scope === 'finca' || v.lotKeys.includes(key)).sort((a, b) => byDate(a.startedAt, b.startedAt));
  const el = mount(`<section class="vc-card"><div class="vc-card__head"><div style="min-width:0"><p class="vc-eyebrow"><a class="vc-link" href="#/productor/${esc(code)}">${esc(r.farm.name)} · Cód. ${esc(code)}</a></p><h1>Suerte ${esc(r.identity.lot)}</h1></div>
      <div class="vc-chips">${phenologyHtml(r, now)}</div></div>
      <div class="vc-lotgrid"><div>${agroHtml(r, now)}</div><div class="vc-lotmap" data-map><p class="vc-muted vc-small">Cargando mapa…</p></div></div>
      <div class="vc-row-actions vc-row-actions--start"><button class="vc-btn vc-btn--primary" type="button" data-reg>${icon('plus')}Registrar aquí</button><a class="vc-btn" href="#/mapa?finca=${esc(code)}&suerte=${encodeURIComponent(key)}">${icon('map')}Ver en el mapa</a><a class="vc-btn" href="#/productor/${esc(code)}">${icon('folder')}Expediente</a></div></section>
    <section class="vc-card"><div class="vc-card__head"><h2>${icon('alert')}Hallazgos</h2><span class="vc-muted vc-small">${plural(findings.filter(f => OPEN.has(f.status)).length, 'abierto')}</span></div>
      ${findings.length ? `<div class="vc-stack">${findings.map(f => findingRow(f, {visit: d.visits.find(v => v.id === f.visitId), photos: d.photos, followups})).join('')}</div>` : '<p class="vc-muted">Sin hallazgos en esta suerte.</p>'}</section>
    <section class="vc-card"><div class="vc-card__head"><h2>${icon('check')}Recomendaciones, solicitudes y compromisos</h2></div>${followups.length ? `<div class="vc-list">${followups.map(followupRow).join('')}</div>` : '<p class="vc-muted">Sin seguimiento registrado.</p>'}</section>
    <section class="vc-card"><div class="vc-card__head"><h2>${icon('evidence')}Evidencias</h2><span class="vc-muted vc-small">${photos.length}</span></div>${photos.length ? group(photos) : '<p class="vc-muted">Sin fotografías de esta suerte.</p>'}</section>
    <section class="vc-card"><div class="vc-card__head"><h2>${icon('calendar')}Visitas</h2></div>${visits.length ? `<div class="vc-list">${visits.map(v => visitRow(v, {findings: d.findings.filter(f => f.visitId === v.id && f.lotKey === key).length, photos: d.photos.filter(p => p.visitId === v.id && p.lotKey === key).length})).join('')}</div>` : '<p class="vc-muted">Sin visitas a esta suerte.</p>'}</section>`);
  viewerFor(el, photos, d);
  el.addEventListener('click', async e => { if (e.target.closest('[data-reg]')) { await M.setManualTarget(code, key); location.hash = '#/registrar?accion=hallazgo'; } });
  const feats = await featuresFor(reader.lotsOf(code).map(x => x.identity.lotCode)).catch(() => []), box = $('[data-map]', el);
  if (box) box.innerHTML = feats.length ? farmMapSvg(feats, {highlight: new Set([r.identity.lotCode]), labels: new Map(reader.lotsOf(code).map(x => [x.identity.lotCode, x.identity.lot])),
    points: findings.filter(f => f.gps?.source === 'device').map(f => f.gps)}) : '<p class="vc-muted vc-small">Geometría no disponible sin la capa GIS.</p>';
}

/* ---------- Gestión ---------- */
const GKINDS = [['hallazgos', 'Hallazgos'], ['recomendacion', 'Recomendaciones'], ['solicitud', 'Solicitudes'], ['compromiso', 'Compromisos'], ['todos', 'Todo el seguimiento']];
export async function viewGestion(params) {
  const data = await M.everything(), vById = new Map(data.visits.map(v => [v.id, v]));
  let k = params.get('k') || 'hallazgos', f = params.get('f') || 'abiertos', q = '';
  if (k === 'vencidos') { k = 'todos'; f = 'vencidos'; }   // enlace del indicador «Compromisos vencidos»
  const el = mount(`<section class="vc-card"><div class="vc-card__head"><div><h1>Gestión técnica</h1><p class="vc-muted">Problemas observados y lo que se recomendó, solicitó y acordó</p></div><a class="vc-btn vc-btn--sm vc-btn--primary" href="#/registrar">${icon('plus')}Registrar</a></div>
    ${tabsHtml(GKINDS, k)}
    <div class="vc-toolbar" style="margin-top:10px"><label class="vc-search">${icon('search')}<input class="vc-input" type="search" placeholder="Productor, suerte o texto" data-q data-casur-query></label>
      <div class="vc-seg" role="group" aria-label="Estado">${[['abiertos', 'Abiertos'], ['vencidos', 'Vencidos'], ['cerrados', 'Cerrados']].map(([x, l]) => `<button type="button" data-f="${x}" aria-pressed="${x === f}">${l}</button>`).join('')}</div></div></section>
    <div class="vc-stack" data-list></div>`);
  const render = () => {
    const t = q.toLowerCase(), list = $('[data-list]', el);
    if (k === 'hallazgos') {
      const late = new Set(data.followups.filter(M.isOverdue).map(x => x.findingId).filter(Boolean));
      const items = data.findings.filter(x => (f === 'abiertos' ? OPEN.has(x.status) : f === 'vencidos' ? late.has(x.id) : !OPEN.has(x.status))
        && (!t || `${vById.get(x.visitId)?.producer.name} ${vById.get(x.visitId)?.producer.code} ${lotNum(x.lotKey)} ${x.observation} ${category(x.category).label}`.toLowerCase().includes(t))).sort((a, b) => byDate(a.observedAt, b.observedAt));
      list.innerHTML = items.map(x => findingRow(x, {visit: vById.get(x.visitId), photos: data.photos, followups: data.followups})).join('') || `<p class="vc-empty">Sin hallazgos ${f === 'abiertos' ? 'abiertos' : f === 'vencidos' ? 'con seguimiento vencido' : 'cerrados'}.</p>`;
      hydrateGallery(list, data.photos);
    } else {
      const items = data.followups.filter(x => (k === 'todos' || x.kind === k) && (f === 'abiertos' ? OPEN.has(x.state) : f === 'vencidos' ? M.isOverdue(x) : !OPEN.has(x.state))
        && (!t || `${x.producerName} ${x.producerCode} ${lotNum(x.lotKey)} ${x.text} ${x.responsible}`.toLowerCase().includes(t))).sort((a, b) => (a.dueDate || '9').localeCompare(b.dueDate || '9') || byDate(a.createdAt, b.createdAt));
      list.innerHTML = items.length ? `<section class="vc-card"><div class="vc-list">${items.map(followupRow).join('')}</div></section>` : `<p class="vc-empty">Nada ${f === 'vencidos' ? 'vencido' : f === 'cerrados' ? 'cerrado' : 'abierto'} aquí.</p>`;
    }
    history.replaceState(null, '', `#/gestion?k=${k}&f=${f}`);
  };
  el.addEventListener('click', e => {
    const tb = e.target.closest('[data-tab]'); if (tb) { k = tb.dataset.tab; $$('[data-tab]', el).forEach(x => x.setAttribute('aria-selected', String(x === tb))); render(); }
    const b = e.target.closest('[data-f]'); if (b) { f = b.dataset.f; $$('[data-f]', el).forEach(x => x.setAttribute('aria-pressed', String(x === b))); render(); }
  });
  $('[data-q]', el).addEventListener('input', e => { q = e.target.value; render(); });
  render();
}

/* ---------- Evidencias ---------- */
export async function viewEvidence(params) {
  const data = await M.everything(), vById = new Map(data.visits.map(v => [v.id, v]));
  const live = data.photos.filter(p => vById.has(p.visitId));
  let prod = params.get('productor') || '', kind = '', backup = '';
  const producers = [...new Map(data.visits.map(v => [v.producer.code, v.producer])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const el = mount(`<section class="vc-card"><div class="vc-card__head"><div><h1>Evidencias</h1><p class="vc-muted">Fotografías originales vinculadas a visitas, hallazgos y seguimientos</p></div></div>
    <div class="vc-grid3"><label class="vc-field"><span>Productor</span><select data-prod><option value="">Todos</option>${producers.map(p => `<option value="${esc(p.code)}" ${p.code === prod ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label class="vc-field"><span>Vinculada a</span><select data-kind><option value="">Todo</option>${['Visita', 'Hallazgo', 'Seguimiento', 'Verificación'].map(x => `<option>${x}</option>`).join('')}</select></label>
      <label class="vc-field"><span>Respaldo</span><select data-backup><option value="">Todos</option><option value="pendiente">Sin respaldo confirmado</option><option value="confirmada">Respaldo confirmado</option></select></label></div></section>
    <div class="vc-stack" data-list></div>`);
  const render = () => {
    const sel = live.filter(p => (!prod || vById.get(p.visitId).producer.code === prod) && (!kind || photoKind(p) === kind) && (!backup || (backup === 'confirmada' ? p.backupState === 'confirmada' : p.backupState !== 'confirmada')));
    const pairs = beforeAfter(data.findings.filter(f => !prod || vById.get(f.visitId)?.producer.code === prod), data.followups, data.photos);
    const byVisit = Object.entries(sel.reduce((a, p) => ((a[p.visitId] ??= []).push(p), a), {})).sort((a, b) => byDate(vById.get(a[0]).startedAt, vById.get(b[0]).startedAt));
    $('[data-list]', el).innerHTML = (pairs.length && !kind && !backup ? `<section class="vc-card"><div class="vc-card__head"><h2>${icon('compare')}Antes y después</h2></div><div class="vc-stack">${compareBlock(pairs, vById)}</div></section>` : '')
      + (byVisit.length ? byVisit.map(([vid, list]) => { const v = vById.get(vid);
        return `<section class="vc-card"><div class="vc-card__head"><div style="min-width:0"><h2 class="vc-truncate">${esc(v.producer.name)}</h2><p class="vc-muted">${fdate(v.startedAt)} · ${plural(list.length, 'fotografía')}</p></div><a href="#/visita/${esc(v.id)}">Visita</a></div>
          ${['Visita', 'Hallazgo', 'Seguimiento', 'Verificación'].map(x => group(list.filter(p => photoKind(p) === x).sort((a, b) => byDate(b.takenAt || b.addedAt, a.takenAt || a.addedAt)), x === 'Visita' ? 'Evidencias de la visita' : x === 'Hallazgo' ? 'De hallazgos' : x === 'Seguimiento' ? 'Del seguimiento' : 'De verificación')).join('')}</section>`; }).join('')
        : '<p class="vc-empty">Sin fotografías con estos filtros.</p>');
    viewerFor($('[data-list]', el), data.photos, data);
  };
  el.addEventListener('change', e => { if (e.target.matches('[data-prod]')) prod = e.target.value; if (e.target.matches('[data-kind]')) kind = e.target.value; if (e.target.matches('[data-backup]')) backup = e.target.value; render(); });
  render();
}
