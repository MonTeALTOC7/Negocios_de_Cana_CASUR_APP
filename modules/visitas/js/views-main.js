/* Vistas principales: Inicio, Mapa, Registrar (rápido + detalles) y Hallazgo. */
import {icon} from './icons.js';
import {$, $$, esc, fdate, fdt, fha, toast, sheet, confirmBox, download, share, safeName, relTime, localInput} from './ui.js';
import * as store from './store.js';
import * as M from './model.js';
import {maestro, searchFarms} from './maestro.js';
import {gps, onGps, startGps, GPS_LABEL, featuresFor, zoneFeatures, zoneOfLot, zoneBounds, latestFix} from './geo.js';
import {CATEGORIES, DEFAULT_FAVORITES, category, SEVERITY, STATES, OPEN, KIND, FAMILIES, progressOf, filledDetails} from './catalog.js';
import {agroHtml, phenologyHtml, stageOptions, galleryHtml, hydrateGallery, bindGallery, mountGallery, addPhotos, findingRow, followupRow, visitRow, detailsFields, readDetails, familyBadge, famVars, progressHtml} from './components.js';
import {dataDateOf} from './agro.js';
import {agroCard, ageLabel} from './agro.js';
import {followupSheet} from './labels.js';
import {BACKUP_STATES, locationLabel, beginCapture} from './photos.js';
import {createCasurMap} from '../../../shared/geo/geo-map.js';

export const view = {el: null, cleanup: []};
/** Monta una vista nueva (contenedor fresco: los manejadores de la vista anterior se descartan con ella). */
export function mount(html, cls = '') {
  view.cleanup.splice(0).forEach(fn => { try { fn(); } catch { /* ya liberado */ } });
  const main = $('#view'); main.className = 'vc-main ' + cls;
  const el = document.createElement('div'); el.className = 'vc-view'; el.style.display = 'contents'; el.innerHTML = html;
  main.replaceChildren(el); view.el = el; return el;
}
const lotNum = key => key ? key.split('|')[1] : '';

/* ---------- Selector de finca y suerte (manual) ---------- */
export function chooseTarget({title = '¿Dónde registrás?', allowFarm = true} = {}) {
  return new Promise(async resolve => {
    const {reader} = await maestro();
    const s = sheet(`<label class="vc-search">${icon('search')}<input class="vc-input" type="search" placeholder="Código o nombre del productor" data-q data-casur-query></label>
      <div class="vc-list" data-results></div><div data-lots></div>`, {title, onClose: () => resolve(null)});
    const results = $('[data-results]', s.body), lots = $('[data-lots]', s.body);
    const showFarm = code => {
      const farm = reader.farm(code), recs = reader.lotsOf(code).filter(r => r.state.presence !== 'absent');
      results.innerHTML = `<div class="vc-target"><span class="vc-item__ic">${icon('folder')}</span><div class="vc-target__body"><strong>${esc(farm.name)}</strong><span class="vc-muted">Código ${esc(farm.code)} · ${esc(farm.zone || '')} · ${recs.length} suertes</span></div></div>`;
      lots.innerHTML = `<p class="vc-label" style="margin:10px 0 6px">Suerte</p><div class="vc-opts">${allowFarm ? `<button class="vc-btn vc-btn--sm vc-btn--soft" type="button" data-lot="">Finca completa</button>` : ''}
        ${recs.map(r => `<button class="vc-btn vc-btn--sm" type="button" data-lot="${esc(r.key)}">${esc(r.identity.lot)}</button>`).join('')}</div>`;
      lots.onclick = e => { const b = e.target.closest('[data-lot]'); if (!b) return; s.host.remove(); document.body.classList.remove('vc-locked'); resolve({farmCode: code, lotKey: b.dataset.lot || null}); };
    };
    $('[data-q]', s.body).addEventListener('input', e => {
      lots.innerHTML = '';
      results.innerHTML = searchFarms(reader, e.target.value).map(f => `<button class="vc-item" type="button" data-farm="${esc(f.code)}"><span class="vc-item__ic">${icon('folder')}</span><span class="vc-item__body"><span class="vc-item__title">${esc(f.name)}</span><span class="vc-item__sub">Código ${esc(f.code)} · ${esc(f.zone || '')} · ${f.keys.length} suertes</span></span>${icon('chevron')}</button>`).join('')
        || (e.target.value ? '<p class="vc-empty">Sin coincidencias en el Maestro</p>' : '');
    });
    results.addEventListener('click', e => { const b = e.target.closest('[data-farm]'); if (b) showFarm(b.dataset.farm); });
  });
}

/* ---------- Inicio: «Mi gestión de campo» ---------- */
const PERIODS = {hoy: ['Hoy', 0], semana: ['7 días', 6], mes: ['30 días', 29]};
const inPeriod = (iso, key) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - PERIODS[key][1]); return new Date(iso) >= d; };
export const initials = name => String(name || '?').replace(/\(.*?\)/g, '').split(/\s+/).filter(w => w.length > 2 || /^\d/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '·';
export async function viewHome() {
  const [all, t, open, author, period] = await Promise.all([M.everything(), M.resolveTarget(), M.openVisits(), M.author(), store.getSetting('homePeriod', 'semana')]);
  const {visits, findings, followups, photos} = all;
  const pv = visits.filter(v => inPeriod(v.startedAt, period)), producers = new Set(pv.map(v => v.producer.code));
  const recOpen = followups.filter(f => f.kind === 'recomendacion' && OPEN.has(f.state)).length;
  const reqOpen = followups.filter(f => f.kind === 'solicitud' && OPEN.has(f.state)).length;
  const overdue = followups.filter(M.isOverdue);
  const soon = followups.filter(f => f.dueDate && OPEN.has(f.state) && !M.isOverdue(f) && f.dueDate <= new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10));
  const agenda = [...overdue, ...soon].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5);
  const recentProducers = [...new Map(visits.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map(v => [v.producer.code, v])).values()].slice(0, 4);
  const unsafe = photos.filter(p => p.blob && p.backupState !== 'confirmada').length;
  const hour = new Date().getHours(), greet = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';
  const el = mount(`
    <section class="vc-greet"><div><p class="vc-greet__hi">${greet}${author ? ', ' + esc(author.split(' ')[0]) : ''}</p><h1>Mi gestión de campo</h1><p class="vc-muted">${fdate(new Date().toISOString())}</p></div>
      <div class="vc-seg" role="group" aria-label="Período">${Object.entries(PERIODS).map(([k, [l]]) => `<button type="button" data-period="${k}" aria-pressed="${k === period}">${l}</button>`).join('')}</div></section>
    <section class="vc-metrics" aria-label="Indicadores de gestión">
      ${metric(pv.length, 'Visitas realizadas', '#/visitas')}${metric(producers.size, 'Productores atendidos', '#/productores')}
      ${metric(recOpen, 'Recomendaciones abiertas', '#/gestion?k=recomendacion')}${metric(reqOpen, 'Solicitudes pendientes', '#/gestion?k=solicitud')}
      ${metric(overdue.length, 'Compromisos vencidos', '#/gestion?k=vencidos', overdue.length ? 'err' : '')}</section>
    <section class="vc-loc" data-here>${hereHtml(t)}</section>
    <section class="vc-quick" aria-label="Acciones">
      <a class="vc-quick__a vc-quick__a--primary" href="#/nueva">${icon('calendar')}<span>Registrar visita</span></a>
      <button class="vc-quick__a" type="button" data-choose>${icon('pin')}<span>Elegir finca</span></button>
      <a class="vc-quick__a" href="#/registrar?accion=hallazgo">${icon('malezas')}<span>Registrar hallazgo</span></a>
      <label class="vc-quick__a" data-capture>${icon('camera')}<span>Tomar evidencia</span><input type="file" accept="image/*" capture="environment" data-evidence hidden></label>
      <a class="vc-quick__a" href="#/productores">${icon('folder')}<span>Consultar expediente</span></a>
      <a class="vc-quick__a" href="#/gestion?k=recomendacion">${icon('seguimiento')}<span>Dar seguimiento</span></a></section>
    ${open.length ? `<section class="vc-card"><div class="vc-card__head"><h2>${icon('clock')}Visitas en curso</h2></div><div class="vc-list">${open.map(v => visitRow(v, {findings: findings.filter(f => f.visitId === v.id).length, photos: photos.filter(p => p.visitId === v.id).length})).join('')}</div></section>` : ''}
    <section class="vc-card"><div class="vc-card__head"><h2>${icon('flag')}Agenda de compromisos</h2><a href="#/gestion?k=vencidos">Ver gestión</a></div>
      ${agenda.length ? `<div class="vc-list">${agenda.map(followupRow).join('')}</div>` : '<p class="vc-muted">Sin compromisos vencidos ni próximos a vencer en 7 días.</p>'}</section>
    ${recentProducers.length ? `<section class="vc-card"><div class="vc-card__head"><h2>${icon('user')}Productores atendidos recientemente</h2><a href="#/productores">Todos</a></div>
      <div class="vc-list">${recentProducers.map(v => producerRow(v.producer, {last: v.startedAt, open: followups.filter(f => f.producerCode === v.producer.code && OPEN.has(f.state)).length})).join('')}</div></section>` : ''}
    ${unsafe ? `<a class="vc-note vc-note--warn" href="#/datos" style="text-decoration:none">${icon('archive')}<span>${unsafe} foto${unsafe > 1 ? 's' : ''} sin respaldo confirmado. Exportá un respaldo desde Datos.</span></a>` : ''}`);
  bindHere(el);
  bindEvidence(el);
  el.addEventListener('click', async e => { const b = e.target.closest('[data-period]'); if (b) { await store.setSetting('homePeriod', b.dataset.period); await viewHome(); } });
  view.cleanup.push(onGps(async () => { const box = $('[data-here]', el); if (box && !$('.vc-sheet')) box.innerHTML = hereHtml(await M.resolveTarget()); }));
}
const metric = (v, label, href, kind = '') => `<a class="vc-metric ${kind ? 'vc-metric--' + kind : ''}" href="${href}"><span class="vc-metric__v">${v}</span><span class="vc-metric__l">${label}</span></a>`;
export const producerRow = (p, {last = null, open = 0, overdue = 0} = {}) => `<a class="vc-item" href="#/productor/${esc(p.code)}"><span class="vc-avatar">${esc(initials(p.name))}</span>
  <span class="vc-item__body"><span class="vc-item__title">${esc(p.name)}</span><span class="vc-item__sub">${esc(['Cód. ' + p.code, p.zone, last ? 'Última visita ' + fdate(last) : 'Sin visitas'].filter(Boolean).join(' · '))}</span></span>
  <span class="vc-item__side">${overdue ? `<span class="vc-chip vc-chip--err">${overdue} vencido${overdue > 1 ? 's' : ''}</span>` : open ? `<span class="vc-chip vc-chip--warn">${open} abierto${open > 1 ? 's' : ''}</span>` : ''}${icon('chevron')}</span></a>`;
/** Franja compacta de ubicación: informa, no domina la pantalla. */
function hereHtml(t) {
  const g = gps.state, label = GPS_LABEL[g];
  if (!t.farmCode) {
    const why = g === 'denegado' ? 'Ubicación sin permiso: elegí la finca manualmente.' : g === 'fuera' ? 'Fuera de las suertes conocidas.' : g === 'apagado' ? 'Activá la ubicación para reconocer la finca.' : g === 'buscando' ? 'Buscando señal GPS…' : `${label}${gps.fix ? ` · ±${gps.fix.accuracy} m` : ''}`;
    return `<span class="vc-loc__ic">${icon('locate')}</span><div class="vc-loc__body"><strong>Sin finca seleccionada</strong><span>${esc(why)}</span></div>
      ${g === 'apagado' || g === 'sin-senal' ? `<button class="vc-btn vc-btn--sm" type="button" data-gps-on>Activar</button>` : `<button class="vc-btn vc-btn--sm" type="button" data-choose>Elegir</button>`}`;
  }
  const r = t.record, src = t.source === 'gps' ? `Detectada por GPS${gps.fix ? ` ±${gps.fix.accuracy} m` : ''}` : 'Elegida manualmente', c = r ? agroCard(r, new Date().toISOString()) : null;
  const facts = c ? [c.variety ? `Variedad ${c.variety}` : '', c.age !== null ? ageLabel(c.age) : '', c.phenology?.stage ? `${c.phenology.stage} (probable por edad)` : ''].filter(Boolean).join(' · ') : '';
  const disc = t.discrepancy ? `<p class="vc-loc__warn">${icon('info')}El GPS indica ${t.discrepancy === 'farm' ? `otra finca (${esc(t.detected.record.farm.name)}, suerte ${esc(t.detected.record.identity.lot)})` : `la suerte ${esc(t.detected.record.identity.lot)}`}. Se mantiene tu selección.</p>` : '';
  return `<span class="vc-loc__ic ${t.source === 'gps' ? 'is-gps' : ''}">${icon(t.source === 'gps' ? 'locate' : 'pin')}</span>
    <div class="vc-loc__body"><strong>${esc(t.farm?.name || '')} · ${r ? `Suerte ${esc(r.identity.lot)}` : 'Finca completa'}</strong><span>${esc(src)}${facts ? ' · ' + esc(facts) : ''}</span>${disc}</div>
    <div class="vc-loc__acts">${r ? `<a class="vc-btn vc-btn--sm" href="#/suerte/${encodeURIComponent(r.key)}">Ficha</a>` : `<a class="vc-btn vc-btn--sm" href="#/productor/${esc(t.farmCode)}">Expediente</a>`}
      ${t.source === 'manual' ? `<button class="vc-icon-btn" type="button" data-clear aria-label="Quitar selección manual">${icon('x')}</button>` : `<button class="vc-btn vc-btn--sm" type="button" data-choose>Cambiar</button>`}</div>`;
}
function bindHere(el) {
  el.addEventListener('click', async e => {
    if (e.target.closest('[data-gps-on]')) { startGps(); await store.setSetting('gpsAuto', true); }
    if (e.target.closest('[data-choose]')) { const c = await chooseTarget(); if (c) { await M.setManualTarget(c.farmCode, c.lotKey); $('[data-here]', el).innerHTML = hereHtml(await M.resolveTarget()); } }
    if (e.target.closest('[data-clear]')) { await M.clearTarget(); $('[data-here]', el).innerHTML = hereHtml(await M.resolveTarget()); }
  });
}
/** «Tomar evidencia»: foto directa a la visita del día de la finca y suerte objetivo (sin hallazgo obligatorio). */
export function bindEvidence(el) {
  let capture = null;
  el.addEventListener('pointerdown', e => { if (e.target.closest('[data-capture]')) capture = beginCapture(); });
  el.addEventListener('change', async e => {
    const input = e.target; if (!input.matches('[data-evidence]') || !input.files?.length) return;
    const files = [...input.files]; input.value = '';
    let t = await M.resolveTarget();
    if (!t.farmCode) { const c = await chooseTarget({title: '¿De qué finca es la evidencia?'}); if (!c) return; await M.setManualTarget(c.farmCode, c.lotKey); t = await M.resolveTarget(); }
    const visit = await M.ensureVisit(t.farmCode, t.lotKey, t.source === 'gps' ? 'gps' : 'manual');
    const added = await addPhotos(files, 'camera', capture || beginCapture(), {visit, visitId: visit.id, lotKey: t.lotKey, onChange: () => {}});
    capture = null;
    if (added.length) toast(`Evidencia guardada en la visita de ${visit.producer.name}`, {actions: [{label: 'Ver visita', run: () => { location.hash = '#/visita/' + visit.id; }}]});
  });
}

/* ---------- Mapa ---------- */
export async function viewMap(params) {
  const el = mount(`<div class="vc-mapwrap"><div class="vc-map" id="vcMap"></div>
    <div class="vc-map-search"><label class="vc-search">${icon('search')}<input class="vc-input" type="search" placeholder="Buscar productor o código" data-q data-casur-query></label><div class="vc-map-results" data-results hidden></div></div>
    <div class="vc-map-fabs"><button class="vc-map-fab" type="button" data-locate aria-label="Mi ubicación">${icon('locate')}</button><button class="vc-map-fab" type="button" data-fit aria-label="Ver la finca">${icon('fit')}</button></div>
    <div class="vc-map-card" data-card hidden></div></div>`, 'vc-main--map');
  const {reader, byLotCode} = await maestro();
  const t = await M.resolveTarget();
  let farmCode = params.get('finca') || t.farmCode, selectedKey = params.get('suerte') || t.lotKey, mapApi = null, mapObj = null, gpsLayer = null, findLayer = null, zoneKey = null;
  const all = await M.everything();
  const L = globalThis.L;
  const leaflet = new Proxy(L, {get(tg, p) { if (p === 'map') return (...a) => (mapObj = tg.map(...a)); const x = Reflect.get(tg, p, tg); return typeof x === 'function' ? x.bind(tg) : x; }});
  const farmLots = () => new Set(farmCode ? reader.lotsOf(farmCode).map(r => String(r.identity.lotCode).toUpperCase()) : []);
  async function draw() {
    let codes = farmLots(), key = null;
    if (codes.size) key = await zoneOfLot([...codes][0]).catch(() => null);
    else if (gps.detected) key = await zoneOfLot(gps.detected.lotId).catch(() => null);
    else if (gps.candidates[0]) key = await zoneOfLot(gps.candidates[0].lotId).catch(() => null);
    key ??= '1-Sur';
    const features = key !== zoneKey ? await zoneFeatures(key).catch(() => []) : null;
    if (!mapApi) mapApi = createCasurMap($('#vcMap', el), {leaflet, ariaLabel: 'Mapa agrícola', autoFit: false, layersCollapsed: true, layersPosition: 'topright', showAnchor: false, preferCanvas: false,
      cartographicLabels: true, cartographicLabel: f => byLotCode.get(f.properties.lotId)?.identity.lot || '', cartographicLabelVisible: f => farmLots().has(f.properties.lotId),
      onSelectLot: f => void showLot(f.properties.lotId),
      featureStyle: f => { const id = f.properties.lotId, sel = byLotCode.get(id)?.key === selectedKey, mine = farmLots().has(id), det = gps.detected?.lotId === id;
        return sel ? {color: '#0F2A33', weight: 3.5, fillColor: '#F4C542', fillOpacity: .45} : det ? {color: '#1A73E8', weight: 3, fillColor: '#1A73E8', fillOpacity: .2} : mine ? {color: '#143A46', weight: 2, fillColor: '#2F7E97', fillOpacity: .35} : {color: '#64748B', weight: .8, fillColor: '#CBD5E1', fillOpacity: .12}; }});
    // Leaflet necesita una vista antes de agregar capas: se parte de la caja de la zona y luego se ajusta a la finca.
    if (features && !mapObj._loaded) { const b = await zoneBounds(key).catch(() => null); if (b) mapObj.fitBounds([[b[1], b[0]], [b[3], b[2]]]); else mapObj.setView([11.45, -85.83], 11); }
    if (features) { zoneKey = key; mapApi.setLots(features, ''); }
    else mapApi.setLots(await zoneFeatures(zoneKey), '');
    if (codes.size) fit(); else if (features) mapApi.fitToData?.();
    drawFindings(); drawGps();
  }
  function fit() {
    if (!mapObj) return; const codes = farmLots(); if (!codes.size) return;
    const b = L.latLngBounds([]); mapObj.eachLayer(l => { if (l.feature && codes.has(l.feature.properties?.lotId) && l.getBounds) b.extend(l.getBounds()); });
    if (b.isValid()) mapObj.fitBounds(b, {padding: [30, 30], maxZoom: 17});
  }
  function drawGps() {
    if (!mapObj) return; gpsLayer?.remove(); gpsLayer = null;
    if (!gps.fix) return; const ll = [gps.fix.lat, gps.fix.lon];
    gpsLayer = L.layerGroup([L.circle(ll, {radius: gps.fix.accuracy, color: '#1A73E8', weight: 1, fillOpacity: .08, interactive: false}),
      L.marker(ll, {icon: L.divIcon({className: '', html: '<div class="vc-gps-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9]}), interactive: false, keyboard: false})]).addTo(mapObj);
  }
  function drawFindings() {
    if (!mapObj) return; findLayer?.remove();
    findLayer = L.layerGroup(all.findings.filter(f => f.gps?.source === 'device' && Number.isFinite(f.gps.lat)).map(f => L.circleMarker([f.gps.lat, f.gps.lon], {radius: 7, color: '#fff', weight: 2, fillColor: OPEN.has(f.status) ? '#B7791F' : '#2E7D5B', fillOpacity: 1})
      .bindTooltip(`${category(f.category).label} · ${fdate(f.observedAt)}`).on('click', () => { location.hash = '#/hallazgo/' + f.id; }))).addTo(mapObj);
  }
  async function showLot(lotId) {
    const r = byLotCode.get(lotId), card = $('[data-card]', el);
    if (!r) { card.hidden = false; card.innerHTML = `<p><strong>Polígono ${esc(lotId)}</strong></p><p class="vc-muted">Esta geometría no tiene datos en el Maestro vigente.</p>`; return; }
    selectedKey = r.key; if (r.identity.farmCode !== farmCode) { farmCode = r.identity.farmCode; }
    mapApi.setLots(await zoneFeatures(zoneKey), '');
    const n = all.findings.filter(f => f.lotKey === r.key && OPEN.has(f.status)).length, open = (await M.openVisits()).find(v => v.producer.code === r.identity.farmCode);
    card.hidden = false;
    card.innerHTML = `<div class="vc-card__head"><div style="min-width:0"><p class="vc-muted vc-truncate">${esc(r.farm.name)} · Cód. ${esc(r.identity.farmCode)}</p><h2>Suerte ${esc(r.identity.lot)}</h2></div><button class="vc-icon-btn" type="button" data-close-card aria-label="Cerrar">${icon('x')}</button></div>
      ${agroHtml(r, new Date().toISOString(), {compact: true})}<div style="margin:10px 0">${phenologyHtml(r, new Date().toISOString())} ${n ? `<span class="vc-chip vc-chip--warn">${n} hallazgo${n > 1 ? 's' : ''} abierto${n > 1 ? 's' : ''}</span>` : ''}</div>
      <div class="vc-row-actions vc-row-actions--start"><button class="vc-btn vc-btn--primary" type="button" data-reg="${esc(r.key)}">${icon('plus')}Registrar aquí</button>
      ${open && !open.lotKeys.includes(r.key) ? `<button class="vc-btn" type="button" data-addlot="${esc(open.id)}">${icon('plus')}Agregar a la visita</button>` : ''}<a class="vc-btn" href="#/productor/${esc(r.identity.farmCode)}">${icon('folder')}Expediente</a></div>`;
  }
  el.addEventListener('click', async e => {
    if (e.target.closest('[data-close-card]')) { $('[data-card]', el).hidden = true; selectedKey = null; mapApi?.setLots(await zoneFeatures(zoneKey), ''); }
    const reg = e.target.closest('[data-reg]'); if (reg) { const r = (await maestro()).reader.byKey(reg.dataset.reg); await M.setManualTarget(r.identity.farmCode, r.key); location.hash = '#/registrar'; }
    const add = e.target.closest('[data-addlot]'); if (add) { await M.addLotToVisit(add.dataset.addlot, selectedKey, 'mapa'); toast('Suerte agregada a la visita en curso'); add.remove(); }
    if (e.target.closest('[data-locate]')) { startGps(); if (gps.fix && mapObj) mapObj.setView([gps.fix.lat, gps.fix.lon], Math.max(mapObj.getZoom(), 16)); else toast('Buscando tu ubicación…'); }
    if (e.target.closest('[data-fit]')) fit();
    const fb = e.target.closest('[data-farm]'); if (fb) { $('[data-results]', el).hidden = true; farmCode = fb.dataset.farm; selectedKey = null; $('[data-card]', el).hidden = true; await draw(); }
  });
  $('[data-q]', el).addEventListener('input', e => {
    const box = $('[data-results]', el), list = searchFarms(reader, e.target.value, 8);
    box.hidden = !list.length; box.innerHTML = list.map(f => `<button type="button" data-farm="${esc(f.code)}"><strong>${esc(f.name)}</strong><small>Código ${esc(f.code)} · ${esc(f.zone || '')} · ${f.keys.length} suertes</small></button>`).join('');
  });
  let firstFix = true;
  view.cleanup.push(onGps(() => { drawGps(); if (firstFix && gps.fix && mapObj && !farmCode) { firstFix = false; void draw().then(() => mapObj.setView([gps.fix.lat, gps.fix.lon], 16)); } }));
  view.cleanup.push(() => { try { mapApi?.destroy(); } catch { /* ya destruido */ } });
  await draw();
  if (!farmCode && gps.fix && mapObj) { firstFix = false; mapObj.setView([gps.fix.lat, gps.fix.lon], 16); }
  if (selectedKey) { const r = reader.byKey(selectedKey); if (r) await showLot(String(r.identity.lotCode).toUpperCase()); }
}

/* ---------- Registrar: rápido + ampliable ---------- */
export async function viewCapture(params) {
  const editing = params.get('hallazgo');
  let finding = editing ? await store.get('findings', editing) : null, visit = finding ? await store.get('visits', finding.visitId) : null;
  const intoVisit = !finding && params.get('visita') ? await store.get('visits', params.get('visita')) : null;   // registrar dentro de una visita concreta (p. ej. retrospectiva)
  const favs = await store.getSetting('favorites', DEFAULT_FAVORITES), recents = await store.getSetting('recentCats', []);
  const t = finding ? null : await M.resolveTarget();
  const el = mount(`<section class="vc-ctx" data-target></section>
    <section class="vc-card" data-cats-card ${finding ? 'hidden' : ''}></section><section data-form></section>`);
  const renderTarget = async () => {
    const box = $('[data-target]', el);
    if (finding) {
      box.innerHTML = `<span class="vc-loc__ic">${icon('pin')}</span><div class="vc-loc__body"><strong>${esc(visit.producer.name)} · ${finding.lotKey ? 'Suerte ' + esc(lotNum(finding.lotKey)) : 'Finca completa'}</strong><span>${fdt(finding.observedAt)}${finding.gps?.source === 'device' ? ` · GPS ±${finding.gps.accuracy} m` : ''}</span></div>`;
      return;
    }
    if (intoVisit) {
      box.innerHTML = `<span class="vc-loc__ic">${icon('calendar')}</span><div class="vc-loc__body"><strong>${esc(intoVisit.producer.name)}</strong><span>Visita del ${fdt(intoVisit.startedAt)}${intoVisit.scope === 'finca' ? ' · Finca completa' : ' · Suertes ' + esc(intoVisit.lotKeys.map(lotNum).join(', '))}</span></div><a class="vc-btn vc-btn--sm" href="#/visita/${esc(intoVisit.id)}">Visita</a>`;
      return;
    }
    const cur = await M.resolveTarget();
    box.innerHTML = cur.farmCode ? `<span class="vc-loc__ic ${cur.source === 'gps' ? 'is-gps' : ''}">${icon(cur.source === 'gps' ? 'locate' : 'pin')}</span>
        <div class="vc-loc__body"><strong>${esc(cur.farm?.name)} · ${cur.record ? 'Suerte ' + esc(cur.record.identity.lot) : 'Finca completa'}</strong><span>${cur.source === 'gps' ? 'Detectada por GPS' : 'Elegida manualmente'} · ${fdt(new Date().toISOString())}</span>
        ${cur.discrepancy ? `<p class="vc-loc__warn">${icon('info')}El GPS indica ${cur.discrepancy === 'farm' ? 'otra finca' : 'la suerte ' + esc(cur.detected.record.identity.lot)}. Se registrará en tu selección.</p>` : ''}</div>
        <button class="vc-btn vc-btn--sm" type="button" data-change>Cambiar</button>`
      : `<span class="vc-loc__ic">${icon('locate')}</span><div class="vc-loc__body"><strong>¿Dónde estás trabajando?</strong><span>${esc(GPS_LABEL[gps.state])} · el GPS no es obligatorio</span></div><button class="vc-btn vc-btn--sm vc-btn--primary" type="button" data-change>Elegir finca</button>`;
  };
  /** «¿Qué vas a registrar?»: hallazgo por familia (un toque) y el resto de registros técnicos. */
  const renderCats = (all = params.get('todas') === '1') => {
    const order = [...new Set([...recents, ...favs])].slice(0, 8);
    const fams = Object.entries(FAMILIES).map(([k, f]) => [k, f, (all ? f.ids : f.ids.filter(id => order.includes(id))).map(category)]).filter(([, , l]) => l.length);
    $('[data-cats-card]', el).innerHTML = `<div class="vc-card__head"><div><h1>¿Qué vas a registrar?</h1><p class="vc-muted vc-small">El hallazgo queda guardado al elegir el problema; los detalles se completan después, si hacen falta.</p></div></div>
      ${params.get('accion') === 'hallazgo' || intoVisit ? '' : `<div class="vc-regrow">${[['nueva', 'calendar', 'Visita'], ['evidencia', 'camera', 'Evidencia'], ['recomendacion', 'check', 'Recomendación'], ['solicitud', 'clipboard', 'Solicitud'], ['compromiso', 'flag', 'Compromiso']]
        .map(([k, ic, l]) => k === 'evidencia' ? `<label class="vc-regrow__a" data-capture>${icon(ic)}<span>${l}</span><input type="file" accept="image/*" capture="environment" data-evidence hidden></label>`
          : `<a class="vc-regrow__a" href="${k === 'nueva' ? '#/nueva' : '#/seguimiento/nuevo?tipo=' + k}">${icon(ic)}<span>${l}</span></a>`).join('')}</div>`}
      <p class="vc-label vc-regtitle">Hallazgo observado</p>
      <div class="vc-families">${fams.map(([k, f, list]) => `<div class="vc-family" style="--fam:${f.color};--fam-soft:${f.soft}"><p class="vc-family__t">${esc(f.label)}</p><div class="vc-family__chips">
        ${list.map(c => `<button class="vc-catchip" type="button" data-cat="${c.id}" aria-pressed="${finding?.category === c.id}">${icon(c.icon)}<span>${esc(c.label)}</span></button>`).join('')}</div></div>`).join('')}</div>
      ${all ? '' : `<button class="vc-link" type="button" data-more style="margin-top:6px">${icon('more')} Ver todo el catálogo (${CATEGORIES.length})</button>`}`;
  };
  await renderTarget(); renderCats(); if (finding) await renderForm();
  bindEvidence(el);
  view.cleanup.push(onGps(() => { if (!finding && !$('.vc-sheet')) void renderTarget(); }));

  async function renderForm() {
    const rec = M.recordOf(visit, finding.lotKey);
    const fus = (await store.byIndex('followups', 'visitId', visit.id)).filter(f => f.findingId === finding.id && !f.removedFromVisit);
    const cat = category(finding.category), sev = finding.severity?.source === 'tecnico' ? finding.severity.value : '';
    $('[data-form]', el).innerHTML = `<div class="vc-card vc-form" data-autosave>
      <div class="vc-card__head">${familyBadge(finding.category)}<span class="vc-chip vc-chip--ok" data-saved>${icon('check')}Guardado</span></div>
      ${retroNote(visit, rec, finding.observedAt)}
      ${rec ? `<div class="vc-chips">${phenologyHtml(rec, finding.observedAt, finding.phenology?.corrected)}</div>` : ''}
      <label class="vc-field"><span>Observación</span><textarea data-f="observation" rows="3" placeholder="Opcional · usá el micrófono del teclado para dictar">${esc(finding.observation)}</textarea></label>
      <div><p class="vc-label" style="margin-bottom:6px">Fotografías</p><div data-gal></div></div>
      <div><p class="vc-label" style="margin-bottom:6px">Recomendación</p>${fus.filter(f => f.kind === 'recomendacion').map(f => `<p class="vc-note vc-note--rec">${icon('check')}<span>${esc(f.text)}</span></p>`).join('')}
        <div class="vc-toolbar" style="margin-top:6px"><input class="vc-input" data-rec placeholder="Opcional · ej.: aplicar control de malezas"><button class="vc-btn vc-btn--soft" type="button" data-add-rec>Agregar</button></div></div>
      <details class="vc-details" ${Object.keys(finding.details || {}).length || sev ? 'open' : ''}><summary>${icon('clipboard')}Detalles técnicos <span class="vc-muted vc-small">(opcionales)</span>${icon('chevron')}</summary>
        <div class="vc-details__body">${detailsFields(finding.category, finding.details)}
          <fieldset class="vc-field" style="border:0;padding:0;margin:0"><legend class="vc-label">Severidad evaluada <span class="vc-muted">· sugerida para ${esc(cat.label.toLowerCase())}: ${esc(cat.suggested)}</span></legend>
            <div class="vc-opts">${SEVERITY.map(s => `<label class="vc-opt"><input type="radio" name="sev" value="${s}" ${sev === s ? 'checked' : ''} data-sev><span>${s}</span></label>`).join('')}<label class="vc-opt"><input type="radio" name="sev" value="" ${sev ? '' : 'checked'} data-sev><span>Sin evaluar</span></label></div></fieldset>
          ${rec && finding.phenology?.computed ? `<label class="vc-field"><span>Etapa observada (si difiere de la probable)</span><select data-stage><option value="">Igual a la probable: ${esc(finding.phenology.computed)}</option>${stageOptions(finding.phenology.corrected)}</select></label>` : ''}
          <label class="vc-field"><span>Fecha y hora del hallazgo</span><input type="datetime-local" data-observed value="${esc(localInput(finding.observedAt))}"></label>
        </div></details>
      <p class="vc-muted vc-small vc-gpsline">${finding.gps?.source === 'device' ? `${icon('locate')} Ubicación del teléfono al registrar · ±${finding.gps.accuracy} m` : 'Sin ubicación GPS: el registro es igual de válido.'}</p>
      <div class="vc-row-actions"><button class="vc-btn" type="button" data-another>Registrar otro</button><a class="vc-btn vc-btn--primary" href="#/hallazgo/${esc(finding.id)}">Listo</a></div></div>`;
    const form = $('[data-form]', el);
    await mountGallery($('[data-gal]', form), async () => (await store.byIndex('photos', 'visitId', visit.id)).filter(p => p.findingId === finding.id),
      {visit, visitId: visit.id, findingId: finding.id, lotKey: finding.lotKey, findingFor: () => finding, recordFor: () => rec});
    form.oninput = form.onchange = e => { if (e.target.matches('[data-rec]')) return; schedule(); };
  }
  let timer = null, saving = Promise.resolve();
  function collect() {
    const form = $('[data-form]', el), next = {...finding};
    const obs = $('[data-f="observation"]', form); if (obs) next.observation = obs.value;
    next.details = readDetails(form);
    const sev = $('[data-sev]:checked', form)?.value; next.severity = sev ? {value: sev, source: 'tecnico', at: new Date().toISOString()} : null;
    const st = $('[data-stage]', form); if (st && next.phenology) next.phenology = {...next.phenology, corrected: st.value || null};
    const ob = $('[data-observed]', form); if (ob?.value) next.observedAt = new Date(ob.value).toISOString();
    return next;
  }
  function schedule() {
    const s = $('[data-saved]', el); if (s) { s.className = 'vc-chip vc-chip--warn'; s.textContent = 'Guardando…'; }
    store.keepPending(finding.id, collect());               // copia de emergencia inmediata
    clearTimeout(timer); timer = setTimeout(() => { saving = save().catch(() => {}); }, 450);   // el fallo ya se informa; flush reintenta
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

  el.addEventListener('click', async e => {
    if (e.target.closest('[data-change]')) { const c = await chooseTarget(); if (c) { await M.setManualTarget(c.farmCode, c.lotKey); await renderTarget(); } return; }
    if (e.target.closest('[data-more]')) { renderCats(true); return; }
    if (e.target.closest('[data-capture]')) return;
    const c = e.target.closest('[data-cat]');
    if (c && !finding) {
      try {
        const r = await M.quickFinding(c.dataset.cat, {visitId: intoVisit?.id});
        finding = r.finding; visit = r.visit;
        await store.setSetting('recentCats', [c.dataset.cat, ...recents.filter(x => x !== c.dataset.cat)].slice(0, 4));
        $('[data-cats-card]', el).hidden = true; await renderTarget(); await renderForm();
        history.replaceState(null, '', '#/registrar?hallazgo=' + finding.id);
        toast(`${category(finding.category).label} registrado${finding.lotKey ? ' en suerte ' + lotNum(finding.lotKey) : ''}`, {actions: [{label: 'Deshacer', run: async () => { await M.softDeleteFinding(finding.id); toast('Registro deshecho'); location.hash = '#/registrar'; }}]});
      } catch (err) { if (err.code === 'NO_TARGET') { const ch = await chooseTarget(); if (ch) { await M.setManualTarget(ch.farmCode, ch.lotKey); await renderTarget(); c.click(); } } else toast(err.message, {kind: 'error'}); }
      return;
    }
    if (e.target.closest('[data-add-rec]')) {
      const input = $('[data-rec]', el), text = input.value.trim(); if (!text) { input.focus(); return; }
      await M.createFollowup({kind: 'recomendacion', visit, findingId: finding.id, lotKey: finding.lotKey, text});
      toast('Recomendación agregada'); await view.flush?.(); await renderForm(); return;
    }
    if (e.target.closest('[data-another]')) {
      await view.flush?.(); const keep = visit && visit.startedAt.slice(0, 10) !== new Date().toISOString().slice(0, 10) ? '#/registrar?visita=' + visit.id : '#/registrar';
      location.hash = keep; if (location.hash === keep) void viewCapture(new URLSearchParams(keep.split('?')[1] || ''));
    }
  });
}

/** Aviso de visita retrospectiva: la fecha es anterior a los datos del Maestro con que se armó la visita. */
export function retroNote(visit, record, at) {
  const dd = dataDateOf(record) || visit?.masterSnapshot?.aforoDate || null;
  if (!dd || !at || String(at).slice(0, 10) >= dd) return '';
  return `<p class="vc-note vc-note--retro">${icon('clock')}<span><strong>Registro retrospectivo</strong> (${fdate(at)}). Los datos del Maestro son del ${fdate(dd)}: estado, corte y estimados actuales no se atribuyen a esa fecha y la etapa fenológica solo se calcula si hay historial suficiente.</span></p>`;
}

/* ---------- Hallazgo ---------- */
export async function viewFinding(id) {
  const f = await store.get('findings', id); if (!f || f.deletedAt) throw Error('El hallazgo no existe o fue eliminado.');
  const visit = await store.get('visits', f.visitId), rec = M.recordOf(visit, f.lotKey), cat = category(f.category);
  const photos = (await store.byIndex('photos', 'visitId', visit.id)).filter(p => p.findingId === f.id);
  const fus = (await store.byIndex('followups', 'visitId', visit.id)).filter(x => x.findingId === f.id && !x.removedFromVisit);
  const details = filledDetails(f.category, f.details), step = progressOf(f, fus);
  const el = mount(`
    <section class="vc-card vc-fhead" style="${famVars(f.category)}"><div class="vc-card__head">${familyBadge(f.category)}<span class="vc-chip ${OPEN.has(f.status) ? 'vc-chip--warn' : 'vc-chip--ok'}">${esc(f.status)}</span></div>
      <h1>${esc(visit.producer.name)} · ${f.lotKey ? 'Suerte ' + esc(lotNum(f.lotKey)) : 'Finca completa'}</h1>
      <p class="vc-muted">${fdt(f.observedAt)} · ${f.gps?.source === 'device' ? `ubicación del teléfono ±${f.gps.accuracy} m` : 'sin ubicación GPS'}${f.severity?.source === 'tecnico' ? ` · Severidad evaluada ${esc(f.severity.value)}` : ''}</p>
      ${progressHtml(step)}
      ${retroNote(visit, rec, f.observedAt)}
      ${rec ? `<div class="vc-chips" style="margin:10px 0">${phenologyHtml(rec, f.observedAt, f.phenology?.corrected)}</div>${agroHtml(rec, f.observedAt, {compact: true})}` : ''}
      <div class="vc-row-actions vc-row-actions--start"><a class="vc-btn" href="#/registrar?hallazgo=${esc(f.id)}">${icon('edit')}Ampliar o editar</a><button class="vc-btn vc-btn--primary" type="button" data-card-img>${icon('report')}Ficha de seguimiento técnico</button></div></section>
    <section class="vc-card"><div class="vc-card__head"><h2><span class="vc-secnum">1</span>Lo observado</h2></div>
      ${f.observation ? `<p class="vc-prose">${esc(f.observation)}</p>` : '<p class="vc-muted">Sin observación escrita.</p>'}
      ${details.length ? `<dl class="vc-agro" style="margin-top:12px">${details.map(d => `<div><dt>${esc(d.label)}</dt><dd>${esc(d.value)}</dd></div>`).join('')}</dl>` : ''}
      <div style="margin-top:12px"><div class="vc-card__head" style="margin-bottom:6px"><p class="vc-label">Evidencias</p><span class="vc-muted vc-small" data-count>${photos.length}</span></div><div data-gal></div></div></section>
    <section class="vc-card"><div class="vc-card__head"><h2><span class="vc-secnum">2</span>Recomendación y solicitudes</h2></div>
      ${fus.length ? `<div class="vc-list">${fus.map(followupRow).join('')}</div>` : '<p class="vc-muted">Sin recomendaciones todavía.</p>'}
      <div class="vc-row-actions vc-row-actions--start"><a class="vc-btn vc-btn--soft" href="#/seguimiento/nuevo?tipo=recomendacion&hallazgo=${esc(f.id)}">${icon('plus')}Recomendación</a><a class="vc-btn" href="#/seguimiento/nuevo?tipo=solicitud&hallazgo=${esc(f.id)}">${icon('clipboard')}Solicitud</a><a class="vc-btn" href="#/seguimiento/nuevo?tipo=compromiso&hallazgo=${esc(f.id)}">${icon('flag')}Compromiso</a></div></section>
    <section class="vc-card"><div class="vc-card__head"><h2><span class="vc-secnum">3</span>Seguimiento del problema</h2></div>
      <div class="vc-grid2"><label class="vc-field"><span>Nuevo estado</span><select data-state>${STATES.hallazgo.map(s => `<option ${s === f.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label class="vc-field"><span>Nota de verificación</span><input data-note placeholder="Opcional"></label></div>
      <div class="vc-row-actions"><button class="vc-btn" type="button" data-delete>${icon('trash')}Eliminar</button><button class="vc-btn vc-btn--primary" type="button" data-apply>Registrar estado</button></div>
      ${f.history?.length > 1 ? `<ol class="vc-history">${f.history.map(h => `<li><span>${fdt(h.at)}</span><strong>${esc(h.state)}</strong>${h.note ? `<em>${esc(h.note)}</em>` : ''}</li>`).join('')}</ol>` : ''}</section>
    <p class="vc-muted vc-small">Visita del ${fdate(visit.startedAt)} · <a class="vc-link" href="#/visita/${esc(visit.id)}">Ver visita completa</a> · <a class="vc-link" href="#/productor/${esc(visit.producer.code)}">Expediente</a></p>`);
  await mountGallery($('[data-gal]', el), async () => (await store.byIndex('photos', 'visitId', visit.id)).filter(p => p.findingId === f.id),
    {visit, visitId: visit.id, findingId: f.id, lotKey: f.lotKey, findingFor: () => f, recordFor: () => rec, afterGallery: list => { photos.splice(0, photos.length, ...list); $('[data-count]', el).textContent = list.length; }});
  el.addEventListener('click', async e => {
    if (e.target.closest('[data-apply]')) { await M.setFindingState(f.id, $('[data-state]', el).value, $('[data-note]', el).value.trim()); toast('Estado registrado'); await viewFinding(id); }
    if (e.target.closest('[data-delete]')) { await M.softDeleteFinding(f.id); location.hash = '#/gestion?k=hallazgos'; toast('Hallazgo eliminado (sus fotos se conservan)', {actions: [{label: 'Deshacer', run: async () => { await M.restoreFinding(f.id); location.hash = '#/hallazgo/' + f.id; }}]}); }
    if (e.target.closest('[data-card-img]')) {
      const btn = e.target.closest('[data-card-img]'); btn.disabled = true;
      try {
        const feats = rec ? await featuresFor(visit.masterSnapshot.records.map(r => r.identity.lotCode)).catch(() => []) : [];
        const all = await store.all('photos'), ids = new Set(fus.map(x => x.id));
        const blob = await followupSheet({finding: f, visit, record: rec, photos: photos.filter(p => p.blob), followPhotos: all.filter(p => ids.has(p.followupId) && p.blob), followups: fus, features: feats, author: visit.author?.name || ''});
        const url = URL.createObjectURL(blob), name = `Ficha_seguimiento_${safeName(cat.label)}_${safeName(visit.producer.name)}_${fdate(f.observedAt)}.png`;
        const s = sheet(`<img src="${url}" alt="Ficha de seguimiento técnico" style="width:100%;border-radius:12px;border:1px solid var(--line)"><div class="vc-row-actions"><button class="vc-btn" type="button" data-dl>${icon('download')}Descargar</button><button class="vc-btn vc-btn--primary" type="button" data-sh>${icon('share')}Compartir</button></div>`, {title: 'Ficha de seguimiento técnico', wide: true, onClose: () => URL.revokeObjectURL(url)});
        s.body.addEventListener('click', ev => { if (ev.target.closest('[data-dl]')) download(blob, name); if (ev.target.closest('[data-sh]')) void share([blob], [name], `${cat.label} · ${visit.producer.name}`); });
      } catch (err) { toast('No se pudo generar la ficha: ' + err.message, {kind: 'error'}); } finally { btn.disabled = false; }
    }
  });
}
export {lotNum};
