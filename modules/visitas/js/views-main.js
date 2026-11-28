/* Vistas principales: Inicio, Mapa, Registrar (rápido + detalles) y Hallazgo. */
import {icon} from './icons.js';
import {$, $$, esc, fdate, fdt, fha, toast, sheet, confirmBox, download, share, safeName, relTime, localInput} from './ui.js';
import * as store from './store.js';
import * as M from './model.js';
import {maestro, searchFarms} from './maestro.js';
import {gps, onGps, startGps, GPS_LABEL, featuresFor, zoneFeatures, zoneOfLot, latestFix} from './geo.js';
import {CATEGORIES, DEFAULT_FAVORITES, category, SEVERITY, STATES, OPEN, KIND, filledDetails} from './catalog.js';
import {agroHtml, phenologyHtml, stageOptions, galleryHtml, hydrateGallery, bindGallery, mountGallery, findingRow, followupRow, visitRow, detailsFields, readDetails} from './components.js';
import {findingCard} from './labels.js';
import {BACKUP_STATES, locationLabel} from './photos.js';
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

/* ---------- Inicio ---------- */
export async function viewHome() {
  const [all, t, open] = await Promise.all([M.everything(), M.resolveTarget(), M.openVisits()]);
  const {visits, findings, followups, photos} = all;
  const recPend = followups.filter(f => f.kind === 'recomendacion' && OPEN.has(f.state)).length;
  const reqOpen = followups.filter(f => f.kind === 'solicitud' && OPEN.has(f.state)).length;
  const overdue = followups.filter(M.isOverdue).length;
  const unsafe = photos.filter(p => p.blob && p.backupState !== 'confirmada').length;
  const recent = findings.sort((a, b) => b.observedAt.localeCompare(a.observedAt)).slice(0, 4);
  const byVisit = new Map(visits.map(v => [v.id, v]));
  const el = mount(`
    <section class="vc-card vc-here" data-here>${hereHtml(t)}</section>
    <div class="vc-actions3">
      <a class="vc-action vc-action--primary" href="#/registrar">${icon('plus')}Registrar hallazgo</a>
      <a class="vc-action" href="#/nueva">${icon('calendar')}Nueva visita</a>
      <a class="vc-action" href="#/mapa">${icon('map')}Mapa</a>
    </div>
    ${open.length ? `<section class="vc-card"><div class="vc-card__head"><h2>${icon('clock')}Visitas en curso</h2></div><div class="vc-list">${open.map(v => visitRow(v, {findings: findings.filter(f => f.visitId === v.id).length, photos: photos.filter(p => p.visitId === v.id).length})).join('')}</div></section>` : ''}
    <section class="vc-kpis">
      ${kpi('check', recPend, 'Recomendaciones pendientes', '#/seguimiento', recPend ? 'warn' : '')}
      ${kpi('clipboard', reqOpen, 'Solicitudes abiertas', '#/seguimiento?k=solicitud', '')}
      ${kpi('flag', overdue, 'Compromisos vencidos', '#/seguimiento?k=vencidos', overdue ? 'err' : '')}
      ${kpi('archive', unsafe, 'Fotos sin respaldo', '#/datos', unsafe ? 'warn' : '')}
    </section>
    <section class="vc-card"><div class="vc-card__head"><h2>${icon('list')}Últimos hallazgos</h2><a href="#/bitacora">Bitácora</a></div>
      ${recent.length ? `<div class="vc-stack">${recent.map(f => findingRow(f, {visit: byVisit.get(f.visitId), photos})).join('')}</div>` : '<p class="vc-empty">Todavía no hay hallazgos. Tocá «Registrar» para el primero.</p>'}</section>`);
  hydrateGallery(el, photos);
  bindHere(el);
  view.cleanup.push(onGps(async () => { const box = $('[data-here]', el); if (box && !$('.vc-sheet')) box.innerHTML = hereHtml(await M.resolveTarget()); }));
}
const kpi = (ic, v, label, href, kind) => `<a class="vc-kpi ${kind ? 'vc-kpi--' + kind : ''}" href="${href}"><span class="vc-kpi__ic">${icon(ic)}</span><span><span class="vc-kpi__v">${v}</span><br><span class="vc-kpi__l">${label}</span></span></a>`;
function hereHtml(t) {
  const g = gps.state, label = GPS_LABEL[g];
  if (!t.farmCode) {
    const why = g === 'denegado' ? 'La ubicación está bloqueada en el navegador. Podés trabajar eligiendo la finca.' : g === 'fuera' ? 'Estás fuera de las suertes conocidas.' : g === 'apagado' ? 'Activá la ubicación para reconocer la finca y la suerte automáticamente.' : g === 'buscando' ? 'Buscando señal GPS…' : `${label}${gps.fix ? ` · ±${gps.fix.accuracy} m` : ''}. Esperá una lectura más precisa o elegí la finca.`;
    return `<div class="vc-here__top"><span class="vc-here__badge">${icon('locate')}</span><div style="min-width:0"><p class="vc-here__lot">¿Dónde estás?</p><p class="vc-muted">${esc(why)}</p></div></div>
      <div class="vc-row-actions vc-row-actions--start">${g === 'apagado' || g === 'sin-senal' ? `<button class="vc-btn vc-btn--primary" type="button" data-gps-on>${icon('locate')}Activar ubicación</button>` : ''}<button class="vc-btn" type="button" data-choose>${icon('search')}Elegir finca</button></div>`;
  }
  const r = t.record, src = t.source === 'gps' ? `Detectada por GPS${gps.fix ? ` · ±${gps.fix.accuracy} m` : ''}` : 'Elegida manualmente';
  const disc = t.discrepancy ? `<p class="vc-note vc-note--warn" style="margin-top:10px">${icon('info')}<span>El GPS indica ${t.discrepancy === 'farm' ? `otra finca (${esc(t.detected.record.farm.name)}, suerte ${esc(t.detected.record.identity.lot)})` : `la suerte ${esc(t.detected.record.identity.lot)}`}. Se mantiene tu selección.</span></p>` : '';
  return `<div class="vc-here__top"><span class="vc-here__badge">${icon(t.source === 'gps' ? 'locate' : 'pin')}</span>
      <div style="min-width:0;flex:1"><p class="vc-muted">${esc(t.farm?.name || '')} · Cód. ${esc(t.farmCode)}</p><p class="vc-here__lot">${r ? `Suerte ${esc(r.identity.lot)}` : 'Finca completa'}</p><p class="vc-muted">${esc(src)}</p></div>
      ${t.source === 'manual' ? `<button class="vc-icon-btn vc-icon-btn--dark" type="button" data-clear aria-label="Quitar selección manual">${icon('x')}</button>` : ''}</div>
    ${r ? agroHtml(r, new Date().toISOString(), {compact: true}) : ''}${r ? `<div style="margin-top:10px">${phenologyHtml(r, new Date().toISOString())}</div>` : ''}${disc}
    <div class="vc-row-actions vc-row-actions--start"><a class="vc-btn vc-btn--primary" href="#/registrar">${icon('plus')}Registrar aquí</a><button class="vc-btn" type="button" data-choose>${icon('search')}Cambiar</button><a class="vc-btn" href="#/productor/${esc(t.farmCode)}">${icon('folder')}Expediente</a></div>`;
}
function bindHere(el) {
  el.addEventListener('click', async e => {
    if (e.target.closest('[data-gps-on]')) { startGps(); await store.setSetting('gpsAuto', true); }
    if (e.target.closest('[data-choose]')) { const c = await chooseTarget(); if (c) { await M.setManualTarget(c.farmCode, c.lotKey); $('[data-here]', el).innerHTML = hereHtml(await M.resolveTarget()); } }
    if (e.target.closest('[data-clear]')) { await M.clearTarget(); $('[data-here]', el).innerHTML = hereHtml(await M.resolveTarget()); }
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
  const favs = await store.getSetting('favorites', DEFAULT_FAVORITES), recents = await store.getSetting('recentCats', []);
  const t = finding ? null : await M.resolveTarget();
  const el = mount(`<section class="vc-card" data-target></section><section class="vc-card" data-cats-card ${finding ? 'hidden' : ''}></section><section data-form></section>`);
  const renderTarget = async () => {
    const box = $('[data-target]', el);
    if (finding) {
      box.innerHTML = `<div class="vc-target"><span class="vc-item__ic">${icon('pin')}</span><div class="vc-target__body"><strong>${esc(visit.producer.name)} · ${finding.lotKey ? 'Suerte ' + esc(lotNum(finding.lotKey)) : 'Finca completa'}</strong><span class="vc-muted">${fdt(finding.observedAt)}${finding.gps?.source === 'device' ? ` · GPS ±${finding.gps.accuracy} m` : ''}</span></div></div>`;
      return;
    }
    const cur = await M.resolveTarget();
    box.innerHTML = cur.farmCode ? `<div class="vc-target"><span class="vc-item__ic">${icon(cur.source === 'gps' ? 'locate' : 'pin')}</span>
        <div class="vc-target__body"><strong>${esc(cur.farm?.name)} · ${cur.record ? 'Suerte ' + esc(cur.record.identity.lot) : 'Finca completa'}</strong><span class="vc-muted">${cur.source === 'gps' ? 'Detectada por GPS' : 'Elegida manualmente'} · ${fdt(new Date().toISOString())}</span></div>
        <button class="vc-btn vc-btn--sm" type="button" data-change>Cambiar</button></div>
        ${cur.discrepancy ? `<p class="vc-note vc-note--warn" style="margin-top:8px">${icon('info')}<span>El GPS indica ${cur.discrepancy === 'farm' ? 'otra finca' : 'la suerte ' + esc(cur.detected.record.identity.lot)}. Se registrará en tu selección.</span></p>` : ''}`
      : `<p class="vc-label">¿Dónde?</p><p class="vc-muted" style="margin:4px 0 10px">${esc(GPS_LABEL[gps.state])}. Elegí la finca y la suerte; el GPS no es obligatorio.</p><button class="vc-btn vc-btn--primary vc-btn--block" type="button" data-change>${icon('search')}Elegir finca y suerte</button>`;
  };
  const renderCats = (all = false) => {
    const order = [...new Set([...recents, ...favs])].slice(0, 8), list = all ? CATEGORIES : order.map(category);
    $('[data-cats-card]', el).innerHTML = `<div style="margin-bottom:10px"><h2>¿Qué observaste?</h2><p class="vc-muted vc-small">Un toque registra; después podés ampliar.</p></div>
      <div class="vc-cats">${list.map(c => `<button class="vc-cat" type="button" data-cat="${c.id}" aria-pressed="${finding?.category === c.id}">${icon(c.icon)}<span>${esc(c.label)}</span></button>`).join('')}
      ${all ? '' : `<button class="vc-cat vc-cat--more" type="button" data-more>${icon('more')}<span>Más</span></button>`}</div>`;
  };
  await renderTarget(); renderCats(); if (finding) await renderForm();
  view.cleanup.push(onGps(() => { if (!finding && !$('.vc-sheet')) void renderTarget(); }));

  async function renderForm() {
    const rec = M.recordOf(visit, finding.lotKey);
    const fus = (await store.byIndex('followups', 'visitId', visit.id)).filter(f => f.findingId === finding.id && !f.removedFromVisit);
    const cat = category(finding.category), sev = finding.severity?.source === 'tecnico' ? finding.severity.value : '';
    $('[data-form]', el).innerHTML = `<div class="vc-card vc-form" data-autosave>
      <div class="vc-card__head"><h2>${icon(cat.icon)}${esc(cat.label)}</h2><span class="vc-chip vc-chip--ok" data-saved>${icon('check')}Guardado</span></div>
      ${rec ? `<div class="vc-chips">${phenologyHtml(rec, finding.observedAt, finding.phenology?.corrected)}</div>` : ''}
      <label class="vc-field"><span>Observación</span><textarea data-f="observation" rows="3" placeholder="Opcional · usá el micrófono del teclado para dictar">${esc(finding.observation)}</textarea></label>
      <div><p class="vc-label" style="margin-bottom:6px">Fotografías</p><div data-gal></div></div>
      <div><p class="vc-label" style="margin-bottom:6px">Recomendación</p>${fus.filter(f => f.kind === 'recomendacion').map(f => `<p class="vc-note">${icon('check')}<span>${esc(f.text)}</span></p>`).join('')}
        <div class="vc-toolbar" style="margin-top:6px"><input class="vc-input" data-rec placeholder="Opcional · ej.: aplicar control de malezas"><button class="vc-btn vc-btn--soft" type="button" data-add-rec>Agregar</button></div></div>
      <details class="vc-details" ${Object.keys(finding.details || {}).length || sev ? 'open' : ''}><summary>${icon('clipboard')}Detalles técnicos <span class="vc-muted vc-small">(opcionales)</span>${icon('chevron')}</summary>
        <div class="vc-details__body">${detailsFields(finding.category, finding.details)}
          <fieldset class="vc-field" style="border:0;padding:0;margin:0"><legend class="vc-label">Severidad evaluada <span class="vc-muted">· sugerida para ${esc(cat.label.toLowerCase())}: ${esc(cat.suggested)}</span></legend>
            <div class="vc-opts">${SEVERITY.map(s => `<label class="vc-opt"><input type="radio" name="sev" value="${s}" ${sev === s ? 'checked' : ''} data-sev><span>${s}</span></label>`).join('')}<label class="vc-opt"><input type="radio" name="sev" value="" ${sev ? '' : 'checked'} data-sev><span>Sin evaluar</span></label></div></fieldset>
          ${rec && finding.phenology?.computed ? `<label class="vc-field"><span>Etapa observada (si difiere de la probable)</span><select data-stage><option value="">Igual a la probable: ${esc(finding.phenology.computed)}</option>${stageOptions(finding.phenology.corrected)}</select></label>` : ''}
          <label class="vc-field"><span>Fecha y hora del hallazgo</span><input type="datetime-local" data-observed value="${esc(localInput(finding.observedAt))}"></label>
        </div></details>
      <p class="vc-muted vc-small">${finding.gps?.source === 'device' ? `${icon('locate')} Ubicación del teléfono al registrar · ±${finding.gps.accuracy} m` : 'Sin ubicación GPS: el registro es igual de válido.'}</p>
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
    const c = e.target.closest('[data-cat]');
    if (c && !finding) {
      try {
        const r = await M.quickFinding(c.dataset.cat);
        finding = r.finding; visit = r.visit;
        await store.setSetting('recentCats', [c.dataset.cat, ...recents.filter(x => x !== c.dataset.cat)].slice(0, 4));
        $('[data-cats-card]', el).hidden = true; await renderTarget(); await renderForm();
        history.replaceState(null, '', '#/registrar?hallazgo=' + finding.id);
        toast(`${category(finding.category).label} registrado${finding.lotKey ? ' en suerte ' + lotNum(finding.lotKey) : ''}`, {actions: [{label: 'Deshacer', run: async () => { await M.softDeleteFinding(finding.id); toast('Registro deshecho'); location.hash = '#/inicio'; }}]});
      } catch (err) { if (err.code === 'NO_TARGET') { const ch = await chooseTarget(); if (ch) { await M.setManualTarget(ch.farmCode, ch.lotKey); await renderTarget(); c.click(); } } else toast(err.message, {kind: 'error'}); }
      return;
    }
    if (e.target.closest('[data-add-rec]')) {
      const input = $('[data-rec]', el), text = input.value.trim(); if (!text) { input.focus(); return; }
      await M.createFollowup({kind: 'recomendacion', visit, findingId: finding.id, lotKey: finding.lotKey, text});
      toast('Recomendación agregada'); await view.flush?.(); await renderForm(); return;
    }
    if (e.target.closest('[data-another]')) { await view.flush?.(); location.hash = '#/registrar'; if (location.hash === '#/registrar') void viewCapture(new URLSearchParams()); }
  });
}

/* ---------- Hallazgo ---------- */
export async function viewFinding(id) {
  const f = await store.get('findings', id); if (!f || f.deletedAt) throw Error('El hallazgo no existe o fue eliminado.');
  const visit = await store.get('visits', f.visitId), rec = M.recordOf(visit, f.lotKey), cat = category(f.category);
  const photos = (await store.byIndex('photos', 'visitId', visit.id)).filter(p => p.findingId === f.id);
  const fus = (await store.byIndex('followups', 'visitId', visit.id)).filter(x => x.findingId === f.id && !x.removedFromVisit);
  const details = filledDetails(f.category, f.details);
  const el = mount(`
    <section class="vc-card"><div class="vc-card__head"><h2>${icon(cat.icon)}${esc(cat.label)}</h2><span class="vc-chip ${OPEN.has(f.status) ? 'vc-chip--warn' : 'vc-chip--ok'}">${esc(f.status)}</span></div>
      <p><strong>${esc(visit.producer.name)}</strong> · ${f.lotKey ? 'Suerte ' + esc(lotNum(f.lotKey)) : 'Finca completa'}</p>
      <p class="vc-muted">${fdt(f.observedAt)} · ${f.gps?.source === 'device' ? `GPS ±${f.gps.accuracy} m` : 'sin ubicación GPS'}${f.severity?.source === 'tecnico' ? ` · Severidad ${esc(f.severity.value)}` : ''}</p>
      ${rec ? `<div class="vc-chips" style="margin:10px 0">${phenologyHtml(rec, f.observedAt, f.phenology?.corrected)}</div>${agroHtml(rec, f.observedAt, {compact: true})}` : ''}
      ${f.observation ? `<p style="margin-top:12px">${esc(f.observation)}</p>` : ''}
      ${details.length ? `<dl class="vc-agro" style="margin-top:12px">${details.map(d => `<div><dt>${esc(d.label)}</dt><dd>${esc(d.value)}</dd></div>`).join('')}</dl>` : ''}
      <div class="vc-row-actions vc-row-actions--start"><a class="vc-btn" href="#/registrar?hallazgo=${esc(f.id)}">${icon('edit')}Ampliar o editar</a><button class="vc-btn vc-btn--primary" type="button" data-card-img>${icon('share')}Tarjeta del hallazgo</button></div></section>
    <section class="vc-card"><div class="vc-card__head"><h2>${icon('camera')}Fotografías</h2><span class="vc-muted vc-small" data-count>${photos.length}</span></div><div data-gal></div></section>
    <section class="vc-card"><div class="vc-card__head"><h2>${icon('check')}Recomendaciones y solicitudes</h2></div>
      ${fus.length ? `<div class="vc-list">${fus.map(followupRow).join('')}</div>` : '<p class="vc-muted">Sin recomendaciones todavía.</p>'}
      <div class="vc-row-actions vc-row-actions--start"><a class="vc-btn vc-btn--soft" href="#/seguimiento/nuevo?tipo=recomendacion&hallazgo=${esc(f.id)}">${icon('plus')}Recomendación</a><a class="vc-btn" href="#/seguimiento/nuevo?tipo=solicitud&hallazgo=${esc(f.id)}">${icon('clipboard')}Solicitud</a></div></section>
    <section class="vc-card"><div class="vc-card__head"><h2>${icon('flag')}Estado del hallazgo</h2></div>
      <div class="vc-grid2"><label class="vc-field"><span>Nuevo estado</span><select data-state>${STATES.hallazgo.map(s => `<option ${s === f.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label class="vc-field"><span>Nota</span><input data-note placeholder="Opcional"></label></div>
      <div class="vc-row-actions"><button class="vc-btn" type="button" data-delete>${icon('trash')}Eliminar</button><button class="vc-btn vc-btn--primary" type="button" data-apply>Registrar estado</button></div>
      ${f.history?.length > 1 ? `<ul class="vc-small vc-muted" style="margin:10px 0 0;padding-left:18px">${f.history.map(h => `<li>${fdt(h.at)} · ${esc(h.state)}${h.note ? ' · ' + esc(h.note) : ''}</li>`).join('')}</ul>` : ''}</section>
    <p class="vc-muted vc-small">Visita del ${fdate(visit.startedAt)} · <a class="vc-link" href="#/visita/${esc(visit.id)}">Ver visita completa</a></p>`);
  await mountGallery($('[data-gal]', el), async () => (await store.byIndex('photos', 'visitId', visit.id)).filter(p => p.findingId === f.id),
    {visit, visitId: visit.id, findingId: f.id, lotKey: f.lotKey, findingFor: () => f, recordFor: () => rec, afterGallery: list => { photos.splice(0, photos.length, ...list); $('[data-count]', el).textContent = list.length; }});
  el.addEventListener('click', async e => {
    if (e.target.closest('[data-apply]')) { await M.setFindingState(f.id, $('[data-state]', el).value, $('[data-note]', el).value.trim()); toast('Estado registrado'); await viewFinding(id); }
    if (e.target.closest('[data-delete]')) { await M.softDeleteFinding(f.id); location.hash = '#/bitacora'; toast('Hallazgo eliminado (sus fotos se conservan)', {actions: [{label: 'Deshacer', run: async () => { await M.restoreFinding(f.id); location.hash = '#/hallazgo/' + f.id; }}]}); }
    if (e.target.closest('[data-card-img]')) {
      const btn = e.target.closest('[data-card-img]'); btn.disabled = true;
      try {
        const feats = rec ? await featuresFor(visit.masterSnapshot.records.map(r => r.identity.lotCode)).catch(() => []) : [];
        const blob = await findingCard({finding: f, visit, record: rec, photos: photos.filter(p => p.blob), followups: fus, features: feats, author: visit.author?.name || ''});
        const url = URL.createObjectURL(blob), name = `Hallazgo_${safeName(cat.label)}_${safeName(visit.producer.name)}_${fdate(f.observedAt)}.png`;
        const s = sheet(`<img src="${url}" alt="Tarjeta del hallazgo" style="width:100%;border-radius:12px;border:1px solid var(--line)"><div class="vc-row-actions"><button class="vc-btn" type="button" data-dl>${icon('download')}Descargar</button><button class="vc-btn vc-btn--primary" type="button" data-sh>${icon('share')}Compartir</button></div>`, {title: 'Vista previa', wide: true, onClose: () => URL.revokeObjectURL(url)});
        s.body.addEventListener('click', ev => { if (ev.target.closest('[data-dl]')) download(blob, name); if (ev.target.closest('[data-sh]')) void share([blob], [name], `${cat.label} · ${visit.producer.name}`); });
      } catch (err) { toast('No se pudo generar la tarjeta: ' + err.message, {kind: 'error'}); } finally { btn.disabled = false; }
    }
  });
}
export {lotNum};
