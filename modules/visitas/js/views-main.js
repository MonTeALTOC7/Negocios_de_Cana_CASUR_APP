/* Vistas principales: Inicio, Registrar (evidencia rápida, hallazgo de campo, visita formal, seguimiento), Hallazgo y
   Evidencia. Un hallazgo o una foto NO requieren una visita formal: llevan su propio contexto (productor, suerte e
   instantánea agronómica) y se vinculan a una visita solo cuando el técnico registra dentro de ella. */
import {icon} from './icons.js';
import {$, $$, esc, fdate, fdt, toast, sheet, download, share, safeName, localInput, blobUrl} from './ui.js';
import * as store from './store.js';
import * as M from './model.js';
import {maestro, searchFarms, searchLots} from './maestro.js';
import {gps, onGps, startGps, GPS_LABEL, featuresFor, latestFix} from './geo.js';
import {CATEGORIES, DEFAULT_FAVORITES, category, SEVERITY, STATES, OPEN, KIND, FAMILIES, progressOf, filledDetails} from './catalog.js';
import {agroHtml, phenologyHtml, stageOptions, mountGallery, addPhotos, followupRow, visitRow, detailsFields, readDetails, familyBadge, famVars, progressHtml, photoKind, openViewer} from './components.js';
import {agroCard, ageLabel, dataDateOf} from './agro.js';
import {followupSheet, labeledPhoto, placeText} from './labels.js';
import {BACKUP_STATES, beginCapture, photoExtension} from './photos.js';

export const view = {el: null, cleanup: []};
/** Monta una vista nueva (contenedor fresco: los manejadores de la vista anterior se descartan con ella). */
export function mount(html, cls = '') {
  view.cleanup.splice(0).forEach(fn => { try { fn(); } catch { /* ya liberado */ } });
  const main = $('#view'); main.className = 'vc-main ' + cls;
  const el = document.createElement('div'); el.className = 'vc-view'; el.style.display = 'contents'; el.innerHTML = html;
  main.replaceChildren(el); view.el = el; return el;
}
export const lotNum = key => key ? key.split('|')[1] : '';
const plural = (n, s, p = s + 's') => `${n} ${n === 1 ? s : p}`;
export const errorCard = (title, e) => `<section class="vc-card vc-card--error" role="alert"><h2>${icon('alert')}${esc(title)}</h2><p class="vc-muted">${esc(e?.message || e)}</p>
  <div class="vc-row-actions vc-row-actions--start"><button class="vc-btn vc-btn--sm" type="button" onclick="location.reload()">${icon('sync')}Reintentar</button><a class="vc-btn vc-btn--sm" href="#/datos">${icon('archive')}Datos y respaldos</a></div></section>`;

/* ---------- Selector de finca y suerte (manual) ---------- */
/** Elegir productor y suerte. Busca por nombre, código de hacienda o código completo de suerte («99321», «pansaco 21»).
    Con `allowDraft` ofrece continuar sin identificar (el registro queda como borrador por completar). */
export function chooseTarget({title = '¿Dónde registrás?', allowFarm = true, allowDraft = false} = {}) {
  return new Promise(async resolve => {
    let reader;
    try { ({reader} = await maestro()); } catch (e) { toast('El Maestro no está disponible todavía: ' + e.message, {kind: 'error'}); resolve(allowDraft ? {draft: true} : null); return; }
    let currentFarm = null, settled = false;
    const s = sheet(`<label class="vc-search">${icon('search')}<input class="vc-input" type="search" placeholder="Hacienda, código o código de suerte" data-q data-casur-query></label>
      <div class="vc-list" data-results></div><div data-lots></div>
      ${allowDraft ? `<button class="vc-btn vc-btn--block" type="button" data-draft>${icon('clock')}Continuar sin identificar (borrador)</button>` : ''}`, {title, onClose: () => { if (!settled) resolve(null); }});
    const results = $('[data-results]', s.body), lots = $('[data-lots]', s.body);
    const done = v => { settled = true; s.host.remove(); if (!$('.vc-sheet')) document.body.classList.remove('vc-locked'); resolve(v); };
    const showFarm = code => {
      const farm = reader.farm(code), recs = reader.lotsOf(code).filter(r => r.state.presence !== 'absent');
      results.innerHTML = `<div class="vc-target"><span class="vc-avatar">${esc(initials(farm.name))}</span><div class="vc-target__body"><strong>${esc(farm.name)}</strong><span class="vc-muted">Código ${esc(farm.code)} · ${esc(farm.zone || '')} · ${recs.length} suertes</span></div></div>`;
      lots.innerHTML = `<p class="vc-label" style="margin:10px 0 6px">Suerte</p><div class="vc-opts">${allowFarm ? `<button class="vc-btn vc-btn--sm vc-btn--soft" type="button" data-lot="">Finca completa</button>` : ''}
        ${recs.map(r => `<button class="vc-btn vc-btn--sm" type="button" data-lot="${esc(r.key)}">${esc(r.identity.lot)}</button>`).join('')}</div>`;
    };
    lots.addEventListener('click', e => { const b = e.target.closest('[data-lot]'); if (b && currentFarm) done({farmCode: currentFarm, lotKey: b.dataset.lot || null}); });
    $('[data-q]', s.body).addEventListener('input', e => {
      lots.innerHTML = ''; const q = e.target.value;
      results.innerHTML = [...searchLots(reader, q, 6).map(r => `<button class="vc-item" type="button" data-farm="${esc(r.identity.farmCode)}" data-pre="${esc(r.key)}"><span class="vc-lotnum">${esc(r.identity.lot)}</span><span class="vc-item__body"><span class="vc-item__title">${esc(r.farm.name)} · Suerte ${esc(r.identity.lot)}</span><span class="vc-item__sub">Código de suerte ${esc(r.identity.lotCode)} · ${esc(r.farm.zone || '')}</span></span>${icon('chevron')}</button>`),
        ...searchFarms(reader, q).map(f => `<button class="vc-item" type="button" data-farm="${esc(f.code)}"><span class="vc-avatar">${esc(initials(f.name))}</span><span class="vc-item__body"><span class="vc-item__title">${esc(f.name)}</span><span class="vc-item__sub">Código ${esc(f.code)} · ${esc(f.zone || '')} · ${f.keys.length} suertes</span></span>${icon('chevron')}</button>`)].join('')
        || (q ? '<p class="vc-empty">Sin coincidencias en el Maestro</p>' : '');
    });
    results.addEventListener('click', e => { const b = e.target.closest('[data-farm]'); if (!b) return; currentFarm = b.dataset.farm; if (b.dataset.pre) done({farmCode: currentFarm, lotKey: b.dataset.pre}); else showFarm(currentFarm); });
    $('[data-draft]', s.body)?.addEventListener('click', () => done({draft: true}));
  });
}

export const initials = name => String(name || '?').replace(/\(.*?\)/g, '').split(/\s+/).filter(w => w.length > 2 || /^\d/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '·';
export const producerRow = (p, {last = null, open = 0, overdue = 0, sub = null} = {}) => `<a class="vc-item" href="#/productor/${esc(p.code)}"><span class="vc-avatar">${esc(initials(p.name))}</span>
  <span class="vc-item__body"><span class="vc-item__title">${esc(p.name)}</span><span class="vc-item__sub">${esc(sub ?? ['Cód. ' + p.code, p.zone, last ? 'Último registro ' + fdate(last) : 'Sin registros'].filter(Boolean).join(' · '))}</span></span>
  <span class="vc-item__side">${overdue ? `<span class="vc-chip vc-chip--err">${overdue} vencido${overdue > 1 ? 's' : ''}</span>` : open ? `<span class="vc-chip vc-chip--warn">${open} abierto${open > 1 ? 's' : ''}</span>` : ''}${icon('chevron')}</span></a>`;

/* ---------- Contexto de trabajo ---------- */
function hereHtml(t, error = null) {
  if (error) return `<span class="vc-loc__ic">${icon('alert')}</span><div class="vc-loc__body"><strong>Maestro no disponible todavía</strong><span>${esc(error)} · podés registrar evidencias y completarlas después.</span></div>`;
  const g = gps.state;
  if (!t.farmCode) {
    const why = g === 'denegado' ? 'Ubicación sin permiso: elegí la finca o usá el mapa.' : g === 'fuera' ? 'Fuera de las suertes conocidas.' : g === 'apagado' ? 'Activá la ubicación o elegí la finca.' : g === 'buscando' ? 'Buscando señal GPS…' : `${GPS_LABEL[g]}${gps.fix ? ` · ±${gps.fix.accuracy} m` : ''}`;
    return `<span class="vc-loc__ic">${icon('locate')}</span><div class="vc-loc__body"><strong>Sin finca seleccionada</strong><span>${esc(why)}</span></div>
      <div class="vc-loc__acts">${g === 'apagado' || g === 'sin-senal' ? `<button class="vc-btn vc-btn--sm" type="button" data-gps-on>Activar GPS</button>` : ''}<button class="vc-btn vc-btn--sm vc-btn--primary" type="button" data-choose>Elegir finca</button></div>`;
  }
  const r = t.record, c = r ? agroCard(r, new Date().toISOString()) : null;
  const src = t.source === 'gps' ? `GPS ±${gps.fix?.accuracy ?? '?'} m` : 'Elegida manualmente';
  const facts = c ? [c.variety, c.age !== null ? ageLabel(c.age) : '', c.type === 'planta' ? 'Planta' : c.cuts ? `Soca · ${c.cuts}.º corte` : '', c.irrigation, c.phenology?.stage ? `${c.phenology.stage} (probable)` : ''].filter(Boolean) : [];
  const disc = t.discrepancy ? `<p class="vc-loc__warn">${icon('info')}El GPS indica ${t.discrepancy === 'farm' ? `otra finca (${esc(t.detected.record.farm.name)}, suerte ${esc(t.detected.record.identity.lot)})` : `la suerte ${esc(t.detected.record.identity.lot)}`}. Se mantiene tu selección.</p>` : '';
  return `<span class="vc-loc__ic ${t.source === 'gps' ? 'is-gps' : ''}">${icon(t.source === 'gps' ? 'locate' : 'pin')}</span>
    <div class="vc-loc__body"><strong>${esc(t.farm?.name || '')} · ${r ? `Suerte ${esc(r.identity.lot)}` : 'Finca completa'}</strong>
      <span>${esc([src, r ? `código ${r.identity.lotCode}` : `hacienda ${t.farmCode}`].join(' · '))}</span>${facts.length ? `<span class="vc-loc__facts">${facts.map(esc).join(' · ')}</span>` : ''}${disc}</div>
    <div class="vc-loc__acts">${r ? `<a class="vc-btn vc-btn--sm" href="#/suerte/${encodeURIComponent(r.key)}">Ficha</a>` : ''}<a class="vc-btn vc-btn--sm" href="#/productor/${esc(t.farmCode)}">Expediente</a>
      ${t.source === 'manual' ? `<button class="vc-icon-btn" type="button" data-clear aria-label="Quitar selección manual">${icon('x')}</button>` : `<button class="vc-btn vc-btn--sm" type="button" data-choose>Cambiar</button>`}</div>`;
}
async function renderHere(box) {
  try { box.innerHTML = hereHtml(await M.resolveTarget()); } catch (e) { box.innerHTML = hereHtml(null, e.message); }
}
function bindHere(el) {
  el.addEventListener('click', async e => {
    const box = $('[data-here]', el); if (!box) return;
    if (e.target.closest('[data-gps-on]')) { startGps(); await store.setSetting('gpsAuto', true); }
    if (e.target.closest('[data-choose]')) { const c = await chooseTarget(); if (c?.farmCode) { await M.setManualTarget(c.farmCode, c.lotKey); await renderHere(box); } }
    if (e.target.closest('[data-clear]')) { await M.clearTarget(); await renderHere(box); }
  });
}

/* ---------- Evidencia rápida: foto → identificar → comentar → etiquetar/compartir. Nunca crea una visita. ---------- */
export function bindEvidence(el, {visit = null} = {}) {
  let capture = null;
  el.addEventListener('pointerdown', e => { if (e.target.closest('[data-capture]')) capture = beginCapture(); });
  el.addEventListener('change', async e => {
    const input = e.target; if (!input.matches('[data-evidence],[data-evidence-gallery]') || !input.files?.length) return;
    const files = [...input.files], source = input.matches('[data-evidence-gallery]') ? 'gallery' : 'camera'; input.value = '';
    let context = null;
    if (visit?.producer) context = {producer: visit.producer, lotKey: visit.lotKeys.length === 1 ? visit.lotKeys[0] : null, record: M.recordOf(visit, visit.lotKeys[0]), dataVersion: visit.masterSnapshot?.dataVersion ?? null};
    else {
      const t = await M.resolveTarget().catch(() => ({}));
      if (t.farmCode) context = await M.contextFor(t.farmCode, t.lotKey).catch(() => null);
    }
    const added = await addPhotos(files, source, source === 'camera' ? capture || beginCapture() : null, {visitId: visit?.id || null, context: context || {producer: null, lotKey: null, record: null, dataVersion: null}, onChange: () => {}});
    capture = null;
    if (added.length) location.hash = `#/evidencia/${added[0].id}${added.length > 1 ? '?grupo=' + added.map(p => p.id).join(',') : ''}`;
  });
}
const evidenceInput = (label = 'Evidencia rápida', cls = 'vc-quick__a') => `<label class="${cls}" data-capture>${icon('camera')}<span>${label}</span><input type="file" accept="image/*" capture="environment" data-evidence hidden></label>`;

/* ---------- Inicio ---------- */
const PERIODS = {hoy: ['Hoy', 0], semana: ['7 días', 6], mes: ['30 días', 29]};
const since = key => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - PERIODS[key][1]); return d.toISOString(); };
export async function viewHome() {
  const [authorName, period] = await Promise.all([M.author().catch(() => ''), store.getSetting('homePeriod', 'semana').catch(() => 'semana')]);
  const hour = new Date().getHours(), greet = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';
  const el = mount(`
    <section class="vc-greet"><div><p class="vc-greet__hi">${greet}${authorName ? ', ' + esc(authorName.split(' ')[0]) : ''} · ${fdate(new Date().toISOString())}</p><h1>Mi gestión de campo</h1></div></section>
    <section class="vc-loc vc-loc--rich" data-here><span class="vc-muted vc-small">Buscando el contexto de trabajo…</span></section>
    <section class="vc-quick4" aria-label="Registrar">
      ${evidenceInput('Evidencia rápida', 'vc-quick__a vc-quick__a--primary')}
      <a class="vc-quick__a" href="#/registrar?accion=hallazgo">${icon('malezas')}<span>Hallazgo de campo</span></a>
      <a class="vc-quick__a" href="#/nueva">${icon('calendar')}<span>Visita formal</span></a>
      <a class="vc-quick__a" href="#/gestion?k=todos&f=abiertos">${icon('seguimiento')}<span>Dar seguimiento</span></a></section>
    <form class="vc-homesearch" data-search role="search"><label class="vc-search">${icon('search')}<input class="vc-input" type="search" name="q" placeholder="Buscar hacienda, productor o suerte (p. ej. 99321)" data-casur-query></label><a class="vc-btn" href="#/mapa">${icon('map')}Mapa</a></form>
    <div data-pending></div>
    <section class="vc-card vc-kpis2" data-kpis aria-busy="true"><p class="vc-muted">Leyendo los registros de este teléfono…</p></section>
    <div class="vc-stack" data-rest></div>
    <nav class="vc-filters vc-homelinks" aria-label="Otras secciones"><a href="#/evidencias">${icon('evidence')}Evidencias</a><a href="#/visitas">${icon('calendar')}Visitas formales</a><a href="#/informes">${icon('report')}Informes</a><a href="#/datos">${icon('settings')}Datos y respaldos</a></nav>`);
  bindHere(el); bindEvidence(el);
  void renderHere($('[data-here]', el));
  view.cleanup.push(onGps(() => { const box = $('[data-here]', el); if (box && !$('.vc-sheet')) void renderHere(box); }));
  $('[data-search]', el).addEventListener('submit', e => { e.preventDefault(); const q = String(new FormData(e.target).get('q') || '').trim(); location.hash = '#/productores' + (q ? '?q=' + encodeURIComponent(q) : ''); });
  let data;
  try { data = await M.everything(); }
  catch (e) { $('[data-kpis]', el).outerHTML = errorCard('No se pudieron leer los registros de este teléfono', e); return; }
  const render = per => {
    const from = since(per), inP = iso => String(iso || '') >= from;
    const visits = data.visits.filter(v => inP(v.startedAt)), field = data.findings.filter(f => !f.visitId && inP(f.observedAt)), photos = data.photos.filter(p => inP(p.takenAt || p.addedAt));
    const attended = M.attendedProducers({visits, findings: data.findings.filter(f => inP(f.observedAt)), photos});
    const recOpen = data.followups.filter(f => f.kind === 'recomendacion' && OPEN.has(f.state)).length, reqOpen = data.followups.filter(f => f.kind === 'solicitud' && OPEN.has(f.state)).length;
    const overdue = data.followups.filter(M.isOverdue).length, empty = !data.visits.length && !data.findings.length && !data.photos.length && !data.followups.length;
    const stat = (v, l, href, kind = '') => `<a class="vc-stat ${kind}" href="${href}"><b>${v}</b><span>${l}</span></a>`;
    const box = $('[data-kpis]', el); box.removeAttribute('aria-busy');
    box.innerHTML = `<div class="vc-card__head"><h2>${icon('gestion')}Gestión</h2><div class="vc-seg vc-seg--sm" role="group" aria-label="Período">${Object.entries(PERIODS).map(([k, [l]]) => `<button type="button" data-period="${k}" aria-pressed="${k === per}">${l}</button>`).join('')}</div></div>
      ${empty ? '<p class="vc-muted vc-small" style="margin-bottom:8px">Todavía no hay registros en este teléfono.</p>' : ''}
      <div class="vc-stats">${stat(visits.length, 'Visitas formales', '#/visitas')}${stat(field.length, 'Hallazgos de campo', '#/gestion?k=hallazgos&f=todos')}${stat(photos.length, 'Evidencias', '#/evidencias')}
        ${stat(attended.size, 'Productores atendidos', '#/productores?f=atendidos')}${stat(recOpen, 'Recomendaciones abiertas', '#/gestion?k=recomendacion')}${stat(reqOpen, 'Solicitudes pendientes', '#/gestion?k=solicitud')}${stat(overdue, 'Compromisos vencidos', '#/gestion?k=todos&f=vencidos', overdue ? 'is-err' : '')}</div>`;
  };
  render(period);
  $('[data-kpis]', el).addEventListener('click', async e => { const b = e.target.closest('[data-period]'); if (b) { await store.setSetting('homePeriod', b.dataset.period); render(b.dataset.period); } });
  // Por completar: nada incompleto se oculta ni se borra.
  const unidentified = data.photos.filter(p => !M.producerOf(p) && !p.visitId && !p.findingId && !p.followupId), drafts = data.findings.filter(f => !M.producerOf(f));
  const pend = [
    ...data.incompleteVisits.map(v => `<a class="vc-item" href="#/visita/${esc(v.id)}"><span class="vc-item__ic">${icon('calendar')}</span><span class="vc-item__body"><span class="vc-item__title">Visita sin productor (versión anterior)</span><span class="vc-item__sub">Creada ${fdate(v.createdAt)} · completala o dejala como está</span></span>${icon('chevron')}</a>`),
    unidentified.length ? `<a class="vc-item" href="#/evidencias?f=sin-identificar"><span class="vc-item__ic">${icon('camera')}</span><span class="vc-item__body"><span class="vc-item__title">${plural(unidentified.length, 'evidencia sin identificar', 'evidencias sin identificar')}</span><span class="vc-item__sub">Indicá la hacienda y la suerte para etiquetarlas</span></span>${icon('chevron')}</a>` : '',
    ...drafts.map(f => `<a class="vc-item" href="#/hallazgo/${esc(f.id)}"><span class="vc-item__ic">${icon(category(f.category).icon)}</span><span class="vc-item__body"><span class="vc-item__title">${esc(category(f.category).label)} por identificar</span><span class="vc-item__sub">${fdt(f.observedAt)}</span></span>${icon('chevron')}</a>`),
  ].filter(Boolean);
  if (pend.length) $('[data-pending]', el).innerHTML = `<section class="vc-card vc-card--pending"><div class="vc-card__head"><h2>${icon('clock')}Por completar</h2><span class="vc-muted vc-small">${pend.length}</span></div><div class="vc-list">${pend.join('')}</div></section>`;
  const soonLimit = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const agenda = data.followups.filter(f => f.dueDate && OPEN.has(f.state) && f.dueDate <= soonLimit).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5);
  const open = data.visits.filter(v => v.status === 'abierta').sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const recent = [...data.findings.filter(M.producerOf).map(f => [f.producer, f.observedAt]), ...data.visits.map(v => [v.producer, v.startedAt]), ...data.photos.filter(M.producerOf).map(p => [p.producer, p.takenAt || p.addedAt])]
    .sort((a, b) => String(b[1]).localeCompare(String(a[1])));
  const recentProducers = [...new Map(recent.map(([p, at]) => [p.code, {p, at}])).values()].slice(0, 4);
  $('[data-rest]', el).innerHTML = `
    ${agenda.length ? `<section class="vc-card"><div class="vc-card__head"><h2>${icon('flag')}Compromisos vencidos y próximos</h2><a href="#/gestion?k=todos&f=vencidos">Gestión</a></div><div class="vc-list">${agenda.map(followupRow).join('')}</div></section>` : ''}
    ${open.length ? `<section class="vc-card"><div class="vc-card__head"><h2>${icon('calendar')}Visitas formales en curso</h2></div><div class="vc-list">${open.map(v => visitRow(v, {findings: data.findings.filter(f => f.visitId === v.id).length, photos: data.photos.filter(p => p.visitId === v.id).length})).join('')}</div></section>` : ''}
    ${recentProducers.length ? `<section class="vc-card"><div class="vc-card__head"><h2>${icon('users')}Atendidos recientemente</h2><a href="#/productores">Catálogo</a></div><div class="vc-list">${recentProducers.map(({p, at}) => producerRow(p, {last: at, open: data.findings.filter(f => f.producer?.code === p.code && OPEN.has(f.status)).length})).join('')}</div></section>` : ''}`;
}

/* ---------- Registrar ---------- */
const OPS = [['evidencia', 'camera', 'Evidencia rápida', 'Foto, comentario y etiqueta'], ['hallazgo', 'malezas', 'Hallazgo de campo', 'Sin abrir una visita'], ['visita', 'calendar', 'Visita formal', 'Finca o varias suertes'], ['seguimiento', 'seguimiento', 'Seguimiento', 'Verificar lo pendiente']];
export async function viewCapture(params) {
  const editing = params.get('hallazgo');
  let finding = editing ? await store.get('findings', editing) : null;
  if (editing && !finding) throw Error('El hallazgo no existe en este teléfono.');
  let visit = finding?.visitId ? await store.get('visits', finding.visitId) : null;
  const intoVisit = !finding && params.get('visita') ? await store.get('visits', params.get('visita')) : null;   // registrar dentro de una visita formal
  const favs = await store.getSetting('favorites', DEFAULT_FAVORITES), recents = await store.getSetting('recentCats', []);
  const el = mount(`<section class="vc-ctx" data-target></section>
    <section class="vc-card" data-cats-card ${finding ? 'hidden' : ''}></section><section data-form></section>`);
  const renderTarget = async () => {
    const box = $('[data-target]', el);
    if (finding) {
      const p = M.producerOf(finding);
      box.innerHTML = `<span class="vc-loc__ic">${icon(p ? 'pin' : 'clock')}</span><div class="vc-loc__body"><strong>${p ? `${esc(p.name)} · ${finding.lotKey ? 'Suerte ' + esc(lotNum(finding.lotKey)) : 'Finca completa'}` : 'Hallazgo por identificar'}</strong>
        <span>${fdt(finding.observedAt)}${finding.gps?.source === 'device' ? ` · GPS ±${finding.gps.accuracy} m` : ''} · ${finding.visitId ? 'en una visita formal' : 'hallazgo de campo'}</span></div>
        ${!finding.visitId ? `<button class="vc-btn vc-btn--sm ${p ? '' : 'vc-btn--primary'}" type="button" data-identify>${p ? 'Cambiar' : 'Identificar'}</button>` : ''}`;
      return;
    }
    if (intoVisit) {
      box.innerHTML = `<span class="vc-loc__ic">${icon('calendar')}</span><div class="vc-loc__body"><strong>${esc(intoVisit.producer?.name || 'Visita sin productor')}</strong><span>Visita formal del ${fdt(intoVisit.startedAt)}${intoVisit.scope === 'finca' ? ' · Finca completa' : ' · Suertes ' + esc(intoVisit.lotKeys.map(lotNum).join(', '))}</span></div><a class="vc-btn vc-btn--sm" href="#/visita/${esc(intoVisit.id)}">Visita</a>`;
      return;
    }
    let cur; try { cur = await M.resolveTarget(); } catch (e) { box.innerHTML = hereHtml(null, e.message); return; }
    box.innerHTML = cur.farmCode ? `<span class="vc-loc__ic ${cur.source === 'gps' ? 'is-gps' : ''}">${icon(cur.source === 'gps' ? 'locate' : 'pin')}</span>
        <div class="vc-loc__body"><strong>${esc(cur.farm?.name)} · ${cur.record ? 'Suerte ' + esc(cur.record.identity.lot) : 'Finca completa'}</strong><span>${cur.source === 'gps' ? 'Detectada por GPS' : 'Elegida manualmente'} · ${fdt(new Date().toISOString())}</span>
        ${cur.discrepancy ? `<p class="vc-loc__warn">${icon('info')}El GPS indica ${cur.discrepancy === 'farm' ? 'otra finca' : 'la suerte ' + esc(cur.detected.record.identity.lot)}. Se registrará en tu selección.</p>` : ''}</div>
        <button class="vc-btn vc-btn--sm" type="button" data-change>Cambiar</button>`
      : `<span class="vc-loc__ic">${icon('locate')}</span><div class="vc-loc__body"><strong>¿Dónde estás trabajando?</strong><span>${esc(GPS_LABEL[gps.state])} · el GPS no es obligatorio</span></div><button class="vc-btn vc-btn--sm vc-btn--primary" type="button" data-change>Elegir finca</button>`;
  };
  /** «¿Qué vas a registrar?»: las cuatro operaciones y el hallazgo por familia (un toque). */
  const renderCats = (all = params.get('todas') === '1') => {
    const order = [...new Set([...recents, ...favs])].slice(0, 8);
    const fams = Object.entries(FAMILIES).map(([k, f]) => [k, f, (all ? f.ids : f.ids.filter(id => order.includes(id))).map(category)]).filter(([, , l]) => l.length);
    const onlyFinding = params.get('accion') === 'hallazgo' || intoVisit;
    $('[data-cats-card]', el).innerHTML = `${onlyFinding ? '' : `<div class="vc-card__head"><h1>¿Qué vas a registrar?</h1></div>
      <div class="vc-ops">${OPS.map(([k, ic, l, sub]) => k === 'evidencia' ? `<label class="vc-op" data-capture>${icon(ic)}<span><b>${l}</b><small>${sub}</small></span><input type="file" accept="image/*" capture="environment" data-evidence hidden></label>`
        : `<a class="vc-op" href="${k === 'hallazgo' ? '#/registrar?accion=hallazgo' : k === 'visita' ? '#/nueva' : '#/gestion?k=todos&f=abiertos'}">${icon(ic)}<span><b>${l}</b><small>${sub}</small></span></a>`).join('')}</div>
      <label class="vc-link vc-galleryimport">${icon('image')}Importar fotos desde la galería<input type="file" accept="image/*" multiple data-evidence-gallery hidden></label>`}
      <div class="vc-card__head" style="margin-top:${onlyFinding ? 0 : 14}px"><div><h2>${icon('malezas')}${intoVisit ? 'Hallazgo en esta visita' : 'Hallazgo de campo'}</h2><p class="vc-muted vc-small">Elegí lo observado: queda guardado al instante${intoVisit ? '' : ', sin abrir una visita'}. Los detalles son opcionales.</p></div></div>
      <div class="vc-families">${fams.map(([k, f, list]) => `<div class="vc-family" style="--fam:${f.color};--fam-soft:${f.soft}"><p class="vc-family__t">${esc(f.label)}</p><div class="vc-family__chips">
        ${list.map(c => `<button class="vc-catchip" type="button" data-cat="${c.id}" aria-pressed="${finding?.category === c.id}">${icon(c.icon)}<span>${esc(c.label)}</span></button>`).join('')}</div></div>`).join('')}</div>
      ${all ? '' : `<button class="vc-link" type="button" data-more style="margin-top:6px">${icon('more')} Ver todo el catálogo (${CATEGORIES.length})</button>`}`;
  };
  await renderTarget(); renderCats(); if (finding) await renderForm();
  bindEvidence(el, {visit: intoVisit});
  view.cleanup.push(onGps(() => { if (!finding && !$('.vc-sheet')) void renderTarget(); }));

  async function renderForm() {
    const rec = finding.record || M.recordOf(visit, finding.lotKey);
    const fus = (await store.byIndex('followups', 'findingId', finding.id)).filter(f => !f.removedFromVisit);
    const cat = category(finding.category), sev = finding.severity?.source === 'tecnico' ? finding.severity.value : '';
    $('[data-form]', el).innerHTML = `<div class="vc-card vc-form" data-autosave style="${famVars(finding.category)}">
      <div class="vc-card__head">${familyBadge(finding.category)}<span class="vc-chip vc-chip--ok" data-saved>${icon('check')}Guardado</span></div>
      ${retroNote(visit, rec, finding.observedAt)}
      ${rec ? `<div class="vc-chips">${phenologyHtml(rec, finding.observedAt, finding.phenology?.corrected)}</div>` : ''}
      <label class="vc-field"><span>Observación</span><textarea data-f="observation" rows="3" placeholder="Opcional · usá el micrófono del teclado para dictar">${esc(finding.observation)}</textarea></label>
      <div><p class="vc-label" style="margin-bottom:6px">Fotografías</p><div data-gal></div></div>
      <label class="vc-field"><span>Diagnóstico o hipótesis <span class="vc-muted">(opcional · lo escribe el técnico)</span></span><textarea data-f="diagnosis" rows="2" placeholder="Ej.: probable deficiencia de nitrógeno; confirmar con análisis">${esc(finding.diagnosis || '')}</textarea></label>
      <div><p class="vc-label" style="margin-bottom:6px">Recomendación</p>${fus.filter(f => f.kind === 'recomendacion').map(f => `<p class="vc-note vc-note--rec">${icon('check')}<span>${esc(f.text)}</span></p>`).join('')}
        <div class="vc-toolbar" style="margin-top:6px"><input class="vc-input" data-rec placeholder="Opcional · ej.: control de malezas en la cabecera"><button class="vc-btn vc-btn--soft" type="button" data-add-rec>Agregar</button></div></div>
      <details class="vc-details" ${Object.keys(finding.details || {}).length || sev ? 'open' : ''}><summary>${icon('clipboard')}Detalles técnicos <span class="vc-muted vc-small">(opcionales)</span>${icon('chevron')}</summary>
        <div class="vc-details__body">${detailsFields(finding.category, finding.details)}
          <fieldset class="vc-field" style="border:0;padding:0;margin:0"><legend class="vc-label">Severidad evaluada <span class="vc-muted">· sugerida para ${esc(cat.label.toLowerCase())}: ${esc(cat.suggested)}</span></legend>
            <div class="vc-opts">${SEVERITY.map(s => `<label class="vc-opt"><input type="radio" name="sev" value="${s}" ${sev === s ? 'checked' : ''} data-sev><span>${s}</span></label>`).join('')}<label class="vc-opt"><input type="radio" name="sev" value="" ${sev ? '' : 'checked'} data-sev><span>Sin evaluar</span></label></div></fieldset>
          ${rec && finding.phenology?.computed ? `<label class="vc-field"><span>Etapa observada (si difiere de la probable)</span><select data-stage><option value="">Igual a la probable: ${esc(finding.phenology.computed)}</option>${stageOptions(finding.phenology.corrected)}</select></label>` : ''}
          <div class="vc-grid2"><label class="vc-field"><span>Fecha y hora del hallazgo</span><input type="datetime-local" data-observed value="${esc(localInput(finding.observedAt))}"></label>
          <label class="vc-field"><span>Técnico responsable</span><input data-f="author" value="${esc(finding.author || '')}" autocomplete="name"></label></div>
        </div></details>
      <p class="vc-muted vc-small vc-gpsline">${finding.gps?.source === 'device' ? `${icon('locate')} Ubicación del teléfono al registrar · ±${finding.gps.accuracy} m` : 'Sin ubicación GPS: el registro es igual de válido.'}</p>
      <div class="vc-row-actions"><button class="vc-btn" type="button" data-another>Registrar otro</button><a class="vc-btn vc-btn--primary" href="#/hallazgo/${esc(finding.id)}">Listo</a></div></div>`;
    const form = $('[data-form]', el);
    await mountGallery($('[data-gal]', form), async () => store.byIndex('photos', 'findingId', finding.id),
      {visit, visitId: finding.visitId, findingId: finding.id, lotKey: finding.lotKey, finding, findingFor: () => finding, recordFor: () => rec});
    form.oninput = form.onchange = e => { if (e.target.matches('[data-rec]')) return; schedule(); };
  }
  let timer = null, saving = Promise.resolve();
  function collect() {
    const form = $('[data-form]', el), next = {...finding};
    for (const k of ['observation', 'diagnosis', 'author']) { const i = $(`[data-f="${k}"]`, form); if (i) next[k] = i.value; }
    next.details = readDetails(form);
    const sev = $('[data-sev]:checked', form)?.value; next.severity = sev ? {value: sev, source: 'tecnico', at: new Date().toISOString()} : null;
    const st = $('[data-stage]', form); if (st && next.phenology) next.phenology = {...next.phenology, corrected: st.value || null};
    const ob = $('[data-observed]', form); if (ob?.value) next.observedAt = new Date(ob.value).toISOString();
    return next;
  }
  function schedule() {
    const s = $('[data-saved]', el); if (s) { s.className = 'vc-chip vc-chip--warn'; s.textContent = 'Guardando…'; }
    store.keepPending(finding.id, collect());               // copia de emergencia inmediata
    clearTimeout(timer); timer = setTimeout(() => { saving = save().catch(() => {}); }, 450);
  }
  async function save() {
    const next = collect();
    try {
      finding = await M.saveFinding(next, finding.rev); store.clearPending(finding.id);
      const s = $('[data-saved]', el); if (s) { s.className = 'vc-chip vc-chip--ok'; s.innerHTML = `${icon('check')}Guardado`; }
    } catch (e) {
      if (e.code === 'CONFLICT') { finding = e.current; toast(e.message, {kind: 'error'}); await renderForm(); return; }
      const s = $('[data-saved]', el); if (s) { s.className = 'vc-chip vc-chip--err'; s.textContent = 'Sin guardar'; }
      toast('No se pudo guardar: ' + e.message + '. Queda una copia de emergencia.', {kind: 'error', actions: [{label: 'Reintentar', run: () => { saving = save().catch(() => {}); }}]});
      throw e;
    }
  }
  view.flush = async () => { if (!finding) return; clearTimeout(timer); if (store.readPending(finding.id)) await save(); else await saving; };
  view.cleanup.push(() => { view.flush = null; });

  async function create(catId) {
    let r;
    try { r = await M.quickFinding(catId, {visitId: intoVisit?.id}); }
    catch (err) {
      if (err.code !== 'NO_TARGET') { toast(err.message, {kind: 'error'}); return; }
      const ch = await chooseTarget({title: '¿Dónde lo observaste?', allowDraft: true}); if (!ch) return;
      if (ch.draft) r = {finding: await M.createFinding({categoryId: catId, gpsFix: latestFix(30000), draft: true}), visit: null};
      else { await M.setManualTarget(ch.farmCode, ch.lotKey); await renderTarget(); r = await M.quickFinding(catId); }
    }
    finding = r.finding; visit = r.visit;
    await store.setSetting('recentCats', [catId, ...recents.filter(x => x !== catId)].slice(0, 4));
    $('[data-cats-card]', el).hidden = true; await renderTarget(); await renderForm();
    history.replaceState(null, '', '#/registrar?hallazgo=' + finding.id);
    toast(`${category(finding.category).label} registrado${finding.lotKey ? ' en suerte ' + lotNum(finding.lotKey) : ''}${finding.visitId ? '' : ' · hallazgo de campo'}`, {actions: [{label: 'Deshacer', run: async () => { await M.softDeleteFinding(finding.id); toast('Registro deshecho'); location.hash = '#/registrar'; }}]});
  }
  el.addEventListener('click', async e => {
    if (e.target.closest('[data-change]')) { const c = await chooseTarget(); if (c?.farmCode) { await M.setManualTarget(c.farmCode, c.lotKey); await renderTarget(); } return; }
    if (e.target.closest('[data-identify]')) {
      const c = await chooseTarget({title: 'Identificar hacienda y suerte'}); if (!c?.farmCode) return;
      await view.flush?.(); finding = await M.setFindingContext(finding.id, c.farmCode, c.lotKey); toast('Hallazgo identificado'); await renderTarget(); await renderForm(); return;
    }
    if (e.target.closest('[data-more]')) { renderCats(true); return; }
    if (e.target.closest('[data-capture]')) return;
    const c = e.target.closest('[data-cat]'); if (c && !finding) { await create(c.dataset.cat); return; }
    if (e.target.closest('[data-add-rec]')) {
      const input = $('[data-rec]', el), text = input.value.trim(); if (!text) { input.focus(); return; }
      if (!M.producerOf(finding)) { toast('Identificá la hacienda antes de agregar una recomendación'); return; }
      await view.flush?.(); await M.createFollowup({kind: 'recomendacion', finding, text});
      toast('Recomendación agregada'); await renderForm(); return;
    }
    if (e.target.closest('[data-another]')) {
      await view.flush?.(); const keep = finding?.visitId ? '#/registrar?visita=' + finding.visitId : '#/registrar?accion=hallazgo';
      location.hash = keep; if (location.hash === keep) void viewCapture(new URLSearchParams(keep.split('?')[1] || ''));
    }
  });
}

/** Aviso de registro retrospectivo: la fecha es anterior a los datos del Maestro con que se registró. */
export function retroNote(visit, record, at) {
  const dd = dataDateOf(record) || visit?.masterSnapshot?.aforoDate || null;
  if (!dd || !at || String(at).slice(0, 10) >= dd) return '';
  return `<p class="vc-note vc-note--retro">${icon('clock')}<span><strong>Registro retrospectivo</strong> (${fdate(at)}). Los datos del Maestro son del ${fdate(dd)}: estado, corte y estimados actuales no se atribuyen a esa fecha y la etapa fenológica solo se calcula si hay historial suficiente.</span></p>`;
}

/* ---------- Hallazgo ---------- */
export async function viewFinding(id) {
  const f = await store.get('findings', id); if (!f || f.deletedAt) throw Error('El hallazgo no existe o fue eliminado.');
  const visit = f.visitId ? await store.get('visits', f.visitId) : null, rec = f.record || M.recordOf(visit, f.lotKey), cat = category(f.category), p = M.producerOf(f);
  const fus = (await store.byIndex('followups', 'findingId', f.id)).filter(x => !x.removedFromVisit);
  const details = filledDetails(f.category, f.details), step = progressOf(f, fus);
  const el = mount(`
    <section class="vc-card vc-fhead" style="${famVars(f.category)}"><div class="vc-card__head">${familyBadge(f.category)}<span class="vc-chip ${OPEN.has(f.status) ? 'vc-chip--warn' : 'vc-chip--ok'}">${esc(f.status)}</span></div>
      <h1>${p ? `${esc(p.name)} · ${f.lotKey ? 'Suerte ' + esc(lotNum(f.lotKey)) : 'Finca completa'}` : 'Hallazgo por identificar'}</h1>
      <p class="vc-muted">${fdt(f.observedAt)} · ${f.gps?.source === 'device' ? `ubicación del teléfono ±${f.gps.accuracy} m` : 'sin ubicación GPS'}${f.severity?.source === 'tecnico' ? ` · Severidad evaluada ${esc(f.severity.value)}` : ''}${f.author ? ' · ' + esc(f.author) : ''}</p>
      <p class="vc-origin-line">${f.visitId ? `${icon('calendar')}<span>Registrado en la <a class="vc-link" href="#/visita/${esc(f.visitId)}">visita formal del ${fdate(visit?.startedAt)}</a></span>` : `${icon('malezas')}<span>Hallazgo de campo independiente (sin visita formal)</span>`}
        ${!f.visitId ? `<button class="vc-btn vc-btn--sm ${p ? '' : 'vc-btn--primary'}" type="button" data-identify>${p ? 'Cambiar hacienda o suerte' : 'Identificar hacienda y suerte'}</button>` : ''}</p>
      ${progressHtml(step)}
      ${retroNote(visit, rec, f.observedAt)}
      ${rec ? `<div class="vc-chips" style="margin:10px 0">${phenologyHtml(rec, f.observedAt, f.phenology?.corrected)}</div>${agroHtml(rec, f.observedAt, {compact: true})}` : ''}
      <div class="vc-row-actions vc-row-actions--start"><a class="vc-btn" href="#/registrar?hallazgo=${esc(f.id)}">${icon('edit')}Ampliar o editar</a><button class="vc-btn vc-btn--primary" type="button" data-card-img>${icon('report')}Ficha de seguimiento</button><a class="vc-btn" href="#/informe/hallazgo/${esc(f.id)}">${icon('print')}Informe</a></div></section>
    <section class="vc-card"><div class="vc-card__head"><h2><span class="vc-secnum">1</span>Lo observado</h2></div>
      ${f.observation ? `<p class="vc-prose">${esc(f.observation)}</p>` : '<p class="vc-muted">Sin observación escrita.</p>'}
      ${f.diagnosis ? `<p class="vc-prose vc-diag"><strong>Diagnóstico o hipótesis:</strong> ${esc(f.diagnosis)}</p>` : ''}
      ${details.length ? `<dl class="vc-agro" style="margin-top:12px">${details.map(d => `<div><dt>${esc(d.label)}</dt><dd>${esc(d.value)}</dd></div>`).join('')}</dl>` : ''}
      <div style="margin-top:12px"><div class="vc-card__head" style="margin-bottom:6px"><p class="vc-label">Evidencias</p><span class="vc-muted vc-small" data-count></span></div><div data-gal></div></div></section>
    <section class="vc-card"><div class="vc-card__head"><h2><span class="vc-secnum">2</span>Recomendación, solicitudes y compromisos</h2></div>
      ${fus.length ? `<div class="vc-list">${fus.map(followupRow).join('')}</div>` : '<p class="vc-muted">Sin recomendaciones todavía.</p>'}
      ${p ? `<div class="vc-row-actions vc-row-actions--start"><a class="vc-btn vc-btn--soft" href="#/seguimiento/nuevo?tipo=recomendacion&hallazgo=${esc(f.id)}">${icon('plus')}Recomendación</a><a class="vc-btn" href="#/seguimiento/nuevo?tipo=solicitud&hallazgo=${esc(f.id)}">${icon('clipboard')}Solicitud</a><a class="vc-btn" href="#/seguimiento/nuevo?tipo=compromiso&hallazgo=${esc(f.id)}">${icon('flag')}Compromiso</a></div>` : '<p class="vc-muted vc-small">Identificá la hacienda para registrar recomendaciones.</p>'}</section>
    <section class="vc-card"><div class="vc-card__head"><h2><span class="vc-secnum">3</span>Seguimiento y verificación</h2></div>
      <div class="vc-grid2"><label class="vc-field"><span>Nuevo estado</span><select data-state>${STATES.hallazgo.map(s => `<option ${s === f.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label class="vc-field"><span>Nota de verificación</span><input data-note placeholder="Opcional"></label></div>
      <div class="vc-row-actions"><button class="vc-btn" type="button" data-delete>${icon('trash')}Eliminar</button><button class="vc-btn vc-btn--primary" type="button" data-apply>Registrar estado</button></div>
      ${f.history?.length > 1 ? `<ol class="vc-history">${f.history.map(h => `<li><span>${fdt(h.at)}</span><strong>${esc(h.state)}</strong>${h.note ? `<em>${esc(h.note)}</em>` : ''}</li>`).join('')}</ol>` : ''}</section>
    ${p ? `<p class="vc-muted vc-small"><a class="vc-link" href="#/productor/${esc(p.code)}">Expediente de ${esc(p.name)}</a>${f.lotKey ? ` · <a class="vc-link" href="#/suerte/${encodeURIComponent(f.lotKey)}">Ficha de la suerte</a>` : ''}</p>` : ''}`);
  let photos = [];
  await mountGallery($('[data-gal]', el), async () => store.byIndex('photos', 'findingId', f.id),
    {visit, visitId: f.visitId, findingId: f.id, lotKey: f.lotKey, finding: f, findingFor: () => f, recordFor: () => rec, afterGallery: list => { photos = list; $('[data-count]', el).textContent = list.length; }});
  el.addEventListener('click', async e => {
    if (e.target.closest('[data-identify]')) { const c = await chooseTarget({title: 'Identificar hacienda y suerte'}); if (c?.farmCode) { await M.setFindingContext(f.id, c.farmCode, c.lotKey); toast('Hallazgo identificado'); await viewFinding(id); } }
    if (e.target.closest('[data-apply]')) { await M.setFindingState(f.id, $('[data-state]', el).value, $('[data-note]', el).value.trim()); toast('Estado registrado'); await viewFinding(id); }
    if (e.target.closest('[data-delete]')) { await M.softDeleteFinding(f.id); location.hash = '#/gestion?k=hallazgos'; toast('Hallazgo eliminado (sus fotos se conservan)', {actions: [{label: 'Deshacer', run: async () => { await M.restoreFinding(f.id); location.hash = '#/hallazgo/' + f.id; }}]}); }
    if (e.target.closest('[data-card-img]')) {
      const btn = e.target.closest('[data-card-img]'); btn.disabled = true;
      try {
        const lots = visit?.masterSnapshot ? visit.masterSnapshot.records.map(r => r.identity.lotCode) : rec ? [rec.identity.lotCode] : [];
        const feats = lots.length ? await featuresFor(lots).catch(() => []) : [];
        const ids = new Set(fus.map(x => x.id)), all = await store.all('photos');
        const blob = await followupSheet({finding: f, visit, record: rec, photos: photos.filter(x => x.blob), followPhotos: all.filter(x => ids.has(x.followupId) && x.blob), followups: fus, features: feats});
        const url = URL.createObjectURL(blob), name = `Ficha_seguimiento_${safeName(cat.label)}_${safeName(p?.name || 'sin_identificar')}_${fdate(f.observedAt)}.png`;
        const s = sheet(`<img src="${url}" alt="Ficha de seguimiento técnico" style="width:100%;border-radius:12px;border:1px solid var(--line)"><div class="vc-row-actions"><button class="vc-btn" type="button" data-dl>${icon('download')}Descargar</button><button class="vc-btn vc-btn--primary" type="button" data-sh>${icon('share')}Compartir</button></div>`, {title: 'Ficha de seguimiento técnico', wide: true, onClose: () => URL.revokeObjectURL(url)});
        s.body.addEventListener('click', ev => { if (ev.target.closest('[data-dl]')) download(blob, name); if (ev.target.closest('[data-sh]')) void share([blob], [name], `${cat.label} · ${p?.name || ''}`); });
      } catch (err) { toast('No se pudo generar la ficha: ' + err.message, {kind: 'error'}); } finally { btn.disabled = false; }
    }
  });
}

/* ---------- Evidencia (una foto): identificar, comentar, etiquetar, compartir, convertir en hallazgo ---------- */
export async function viewEvidenceItem(id, params = new URLSearchParams()) {
  let photo = await store.get('photos', id); if (!photo) throw Error('La fotografía no existe en este teléfono.');
  const group = (params.get('grupo') || '').split(',').filter(Boolean);
  const finding = photo.findingId ? await store.get('findings', photo.findingId) : null, visit = photo.visitId ? await store.get('visits', photo.visitId) : null;
  const followup = photo.followupId ? await store.get('followups', photo.followupId) : null;
  const linked = !!(finding || visit || followup), p = M.producerOf(photo) || M.producerOf(finding) || visit?.producer || null;
  const src = photo.blob || photo.thumb ? blobUrl(photo.blob || photo.thumb) : null, cat = finding ? category(finding.category) : photo.category ? category(photo.category) : null;
  const kind = linked ? 'Evidencia · ' + photoKind(photo) : 'Evidencia rápida';
  const el = mount(`
    <section class="vc-card vc-evid"><div class="vc-card__head"><div style="min-width:0"><p class="vc-eyebrow">${esc(kind)}</p>
        <h1>${p ? `${esc(p.name)} · ${photo.lotKey ? 'Suerte ' + esc(lotNum(photo.lotKey)) : 'Finca completa'}` : 'Evidencia sin identificar'}</h1></div><span class="vc-chip">${esc(BACKUP_STATES[photo.backupState] || '')}</span></div>
      <button class="vc-evid__img" type="button" data-open aria-label="Ver la fotografía original">${src ? `<img src="${src}" alt="Fotografía original">` : '<span class="vc-ph__missing">Original no disponible en este teléfono</span>'}</button>
      <p class="vc-muted vc-small">${fdt(photo.takenAt || photo.addedAt)} · ${esc(placeText(photo.location).text)} · original ${esc(photo.originalName || '')} (${Math.round((photo.size || 0) / 1024)} KB · SHA-256 ${esc(String(photo.sha256 || '').slice(0, 12))}…)</p>
      ${linked ? `<p class="vc-origin-line">${icon('info')}<span>Vinculada a ${finding ? `<a class="vc-link" href="#/hallazgo/${esc(finding.id)}">${esc(category(finding.category).label)}</a>` : followup ? `<a class="vc-link" href="#/seguimiento/${esc(followup.id)}">${esc(KIND[followup.kind].label)}</a>` : `<a class="vc-link" href="#/visita/${esc(visit.id)}">la visita del ${fdate(visit.startedAt)}</a>`}</span></p>` : ''}
    </section>
    <section class="vc-card vc-form" data-autosave>
      ${!linked ? `<div class="vc-target"><span class="vc-item__ic">${icon(p ? 'pin' : 'clock')}</span><div class="vc-target__body"><strong>${p ? esc(p.name) : 'Hacienda y suerte sin indicar'}</strong><span class="vc-muted">${p ? (photo.record ? `Suerte ${esc(photo.record.identity.lot)} · código ${esc(photo.record.identity.lotCode)}` : 'Finca completa') : 'Indicalas para etiquetar la foto'}</span></div><button class="vc-btn vc-btn--sm ${p ? '' : 'vc-btn--primary'}" type="button" data-identify>${p ? 'Cambiar' : 'Identificar'}</button></div>` : ''}
      <label class="vc-field"><span>Comentario de la foto</span><textarea rows="3" data-caption placeholder="Opcional · aparece completo en la foto etiquetada">${esc(photo.caption || '')}</textarea></label>
      ${!finding ? `<label class="vc-field"><span>Categoría (opcional)</span><select data-category><option value="">Sin categoría</option>${CATEGORIES.map(c => `<option value="${c.id}" ${photo.category === c.id ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></label>` : ''}
      <p class="vc-muted vc-small" data-saved>Guardada en este teléfono.</p>
      <div class="vc-row-actions vc-row-actions--start"><button class="vc-btn vc-btn--primary" type="button" data-share-label>${icon('share')}Compartir etiquetada</button><button class="vc-btn" type="button" data-dl-label>${icon('download')}Descargar etiquetada</button><button class="vc-btn" type="button" data-dl-orig>${icon('image')}Descargar original</button></div>
      ${!finding && !followup ? `<div class="vc-row-actions vc-row-actions--start"><button class="vc-btn vc-btn--soft" type="button" data-to-finding>${icon('malezas')}Convertir en hallazgo de campo</button>${evidenceInput('Otra foto', 'vc-btn')}</div>` : ''}</section>
    ${group.length > 1 ? `<section class="vc-card"><div class="vc-card__head"><h2>${icon('evidence')}Esta captura</h2><span class="vc-muted vc-small">${group.length} fotos</span></div><div class="vc-gallery">${group.map((g, i) => `<a class="vc-ph ${g === id ? 'is-current' : ''}" href="#/evidencia/${esc(g)}?grupo=${esc(group.join(','))}" aria-label="Foto ${i + 1}"><img alt="" data-src-photo="${esc(g)}"></a>`).join('')}</div></section>` : ''}`);
  if (group.length > 1) for (const img of $$('[data-src-photo]', el)) { const g = await store.get('photos', img.dataset.srcPhoto); const b = g?.thumb || g?.blob; if (b) img.src = blobUrl(b); }
  bindEvidence(el);
  const label = () => labeledPhoto({photo, visit, finding: finding || (cat ? {category: cat.id} : null)});
  const name = suffix => `${safeName(p?.name || 'Evidencia')}_${fdate(photo.takenAt || photo.addedAt)}_${photo.id.slice(-6)}${suffix}`;
  let timer = null;
  const saveCaption = async () => {
    photo = await store.update('photos', id, cur => ({...cur, caption: $('[data-caption]', el)?.value ?? cur.caption, category: $('[data-category]', el)?.value || cur.category || null, updatedAt: new Date().toISOString(), rev: (cur.rev || 0) + 1})) || photo;
    const s = $('[data-saved]', el); if (s) s.textContent = 'Comentario guardado en este teléfono.';
  };
  el.addEventListener('input', e => { if (e.target.matches('[data-caption]')) { $('[data-saved]', el).textContent = 'Guardando…'; clearTimeout(timer); timer = setTimeout(() => void saveCaption(), 500); } });
  el.addEventListener('change', e => { if (e.target.matches('[data-category]')) void saveCaption(); });
  view.flush = async () => { if (timer) { clearTimeout(timer); timer = null; await saveCaption(); } };
  view.cleanup.push(() => { view.flush = null; });
  el.addEventListener('click', async e => {
    if (e.target.closest('[data-open]') && photo.blob) openViewer([photo], 0, {visit, findingFor: () => finding, author: finding?.author});
    if (e.target.closest('[data-identify]')) {
      const c = await chooseTarget({title: 'Hacienda y suerte de la foto'}); if (!c?.farmCode) return;
      await view.flush?.(); const ctx = await M.contextFor(c.farmCode, c.lotKey);
      await store.update('photos', id, cur => ({...cur, ...ctx, producerCode: ctx.producer.code, draft: false, updatedAt: new Date().toISOString(), rev: (cur.rev || 0) + 1}));
      toast('Evidencia identificada'); await viewEvidenceItem(id, params); return;
    }
    const act = e.target.closest('[data-share-label],[data-dl-label],[data-dl-orig]');
    if (act) {
      if (!photo.blob) { toast('El original no está en este teléfono'); return; }
      act.disabled = true;
      try {
        await view.flush?.();
        if (act.matches('[data-dl-orig]')) download(photo.blob, name('.' + photoExtension(photo)));
        else {
          if (!p) toast('La foto se etiqueta como «sin productor identificado»: podés identificarla antes.');
          const b = await label(); act.matches('[data-dl-label]') ? download(b, name('_etiquetada.jpg')) : await share([b], [name('_etiquetada.jpg')], [p?.name, photo.caption].filter(Boolean).join(' · '));
        }
      } catch (err) { toast('No se pudo preparar la foto: ' + err.message, {kind: 'error'}); } finally { act.disabled = false; }
    }
    if (e.target.closest('[data-to-finding]')) {
      const catId = $('[data-category]', el)?.value;
      if (!catId) { toast('Elegí la categoría para convertirla en hallazgo'); $('[data-category]', el)?.focus(); return; }
      await view.flush?.();
      const ctx = p ? {producer: p, lotKey: photo.lotKey, record: photo.record, dataVersion: photo.dataVersion} : null;
      const exact = String(photo.location?.source || '').startsWith('device') && !photo.location.approximate;   // la ubicación de cámara (EXIF) queda en la foto
      const f = await M.createFinding({context: ctx, categoryId: catId, observation: photo.caption || '', observedAt: photo.takenAt || photo.addedAt, draft: !p,
        gpsFix: exact ? {lat: photo.location.lat, lon: photo.location.lon, accuracy: photo.location.accuracy, at: photo.location.at || photo.takenAt} : null});
      await store.update('photos', id, cur => ({...cur, findingId: f.id, updatedAt: new Date().toISOString(), rev: (cur.rev || 0) + 1}));
      toast('Hallazgo de campo creado con esta foto'); location.hash = '#/registrar?hallazgo=' + f.id;
    }
  });
}
