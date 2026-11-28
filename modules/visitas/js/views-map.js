/* Mapa agrícola de Visitas: universo de productores y de CASUR sin requerir visitas, GPS ni selección previa.
   - Geometría oficial (shared/geo, 4 zonas) unida por suerte: se dibujan todos los fragmentos.
   - Datos agronómicos del Maestro Central (solo lectura), conciliados por el código oficial de suerte.
   - Alcance inicial «Productores» = suertes con tenencia Compra Venta (clasificación de negocio de cada suerte, no la
     zona geográfica); «Todo CASUR» muestra las cuatro zonas, incluidas las geometrías sin registro en el Maestro.
   - Etiquetas propias en dos líneas (HACIENDA / S. 21) con control de colisiones y tamaño según el zoom. */
import {icon} from './icons.js';
import {$, $$, esc, fdate, toast} from './ui.js';
import * as store from './store.js';
import * as M from './model.js';
import {maestro, searchFarms, searchLots} from './maestro.js';
import {gps, onGps, startGps, allLotFeatures, gisVersion} from './geo.js';
import {OPEN} from './catalog.js';
import {agroHtml, phenologyHtml} from './components.js';
import {mount, view, bindEvidence} from './views-main.js';
import {createCasurMap} from '../../../shared/geo/geo-map.js';

export const TENURE = {CA: 'Arriendo', CV: 'Compra Venta', PR: 'Propio', Arriendo: 'Arriendo', 'Compra Venta': 'Compra Venta', Propio: 'Propio'};
export const tenureOf = r => r ? TENURE[r.farm?.tenure] || r.farm?.tenure || 'Sin dato' : 'Sin Maestro';
const CONDITION = s => s === 'Molienda' ? 'Molienda' : s === 'Semilla' ? 'Semilla' : s === 'Sin Caña' ? 'Sin caña' : s ? 'Otras' : 'Sin Maestro';
const COLORS = {
  clasificacion: {'Compra Venta': '#1F8A70', Arriendo: '#B7791F', Propio: '#3A5BA0', 'Sin dato': '#64748B', 'Sin Maestro': '#B42318'},
  condicion: {Molienda: '#2E7D32', Semilla: '#7B57B0', 'Sin caña': '#94A3B8', Otras: '#C2410C', 'Sin Maestro': '#B42318'},
};
const PALETTE = ['#1F8A70', '#3A5BA0', '#B7791F', '#7B57B0', '#C2410C', '#0E7490', '#9D174D', '#4D7C0F', '#A16207', '#334155'];
const farmColor = code => PALETTE[[...String(code)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % PALETTE.length];
const ZONES = ['1-Sur', '2-Centro', '3-Norte', '5-Productores'];

export async function viewMap(params) {
  const el = mount(`<div class="vc-mapwrap"><div class="vc-map" id="vcMap"></div>
    <div class="vc-map-top">
      <div class="vc-map-search"><label class="vc-search">${icon('search')}<input class="vc-input" type="search" placeholder="Hacienda, código o suerte (99321, pansaco 21)" data-q data-casur-query></label><div class="vc-map-results" data-results hidden></div></div>
      <div class="vc-map-bar"><div class="vc-seg vc-seg--map" role="group" aria-label="Alcance"><button type="button" data-scope="productores">Productores</button><button type="button" data-scope="todo">Todo CASUR</button></div>
        <button class="vc-map-chip" type="button" data-filters>${icon('layers')}Filtros<span data-fcount></span></button></div>
    </div>
    <div class="vc-map-fabs"><button class="vc-map-fab" type="button" data-locate aria-label="Mi ubicación">${icon('locate')}</button><button class="vc-map-fab" type="button" data-fit aria-label="Encuadrar">${icon('fit')}</button></div>
    <div class="vc-map-status" data-status role="status">Cargando la geometría de las cuatro zonas…</div>
    <div class="vc-map-legend" data-legend></div>
    <div class="vc-map-card" data-card hidden></div></div>`, 'vc-main--map');
  const st = {scope: params.get('alcance') || await store.getSetting('mapScope', 'productores'), colorBy: await store.getSetting('mapColor', 'clasificacion'),
    zones: new Set(), tenures: new Set(), conditions: new Set(), farmCode: params.get('finca') || null, selected: null};
  let reader, byLotCode, lots, mapApi = null, mapObj = null, gpsLayer = null, findLayer = null, labelBox = null, version = '';
  try { ({reader, byLotCode} = await maestro()); } catch (e) { $('[data-status]', el).textContent = 'El Maestro no está disponible todavía: ' + e.message; return; }
  try { lots = await allLotFeatures(); version = await gisVersion(); }
  catch (e) { $('[data-status]', el).innerHTML = `${icon('alert')} La geometría GIS no está disponible sin conexión todavía (${esc(e.message)}). Abrí la App Maestra con conexión una vez para prepararla.`; return; }
  const recOf = f => byLotCode.get(f.properties.lotId) || null;
  const t = await M.resolveTarget().catch(() => ({}));
  if (!st.farmCode && t.farmCode) st.farmCode = t.farmCode;
  const preKey = params.get('suerte') || (st.farmCode === t.farmCode ? t.lotKey : null);
  if (preKey) { const r = reader.byKey(preKey); if (r) st.selected = String(r.identity.lotCode).toUpperCase(); }
  const all = await M.everything().catch(() => ({findings: []}));

  const inScope = f => {
    const r = recOf(f);
    if (st.scope === 'productores' && tenureOf(r) !== 'Compra Venta' && !(r && r.identity.farmCode === st.farmCode)) return false;
    if (st.zones.size && !st.zones.has(f.properties.zone)) return false;
    if (st.tenures.size && !st.tenures.has(tenureOf(r))) return false;
    if (st.conditions.size && !st.conditions.has(CONDITION(r?.state?.operationalState))) return false;
    return true;
  };
  const colorOf = f => { const r = recOf(f); return !r ? COLORS.clasificacion['Sin Maestro'] : st.colorBy === 'hacienda' ? farmColor(r.identity.farmCode) : st.colorBy === 'condicion' ? COLORS.condicion[CONDITION(r.state.operationalState)] : COLORS.clasificacion[tenureOf(r)] || '#64748B'; };
  const styleOf = f => {
    const r = recOf(f), id = f.properties.lotId, c = colorOf(f), mine = r && r.identity.farmCode === st.farmCode;
    if (id === st.selected) return {color: '#F4C542', weight: 4, opacity: 1, fillColor: '#F4C542', fillOpacity: .45};
    if (!r) return {color: c, weight: 1.6, opacity: .95, dashArray: '4 3', fillColor: '#94A3B8', fillOpacity: .12};
    return {color: mine ? '#F8FAFC' : c, weight: mine ? 1.8 : 1.2, opacity: .95, fillColor: c, fillOpacity: mine ? .5 : .28, dashArray: null};
  };
  const L = globalThis.L;
  const leaflet = new Proxy(L, {get(tg, p) { if (p === 'map') return (...a) => (mapObj = tg.map(...a)); const x = Reflect.get(tg, p, tg); return typeof x === 'function' ? x.bind(tg) : x; }});
  mapApi = createCasurMap($('#vcMap', el), {leaflet, ariaLabel: 'Mapa agrícola de productores', autoFit: false, layersCollapsed: true, layersPosition: 'bottomleft', showAnchor: false,
    preferCanvas: true, cartographicLabels: false, initialBase: await store.getSetting('mapBase', 'hybrid'), featureStyle: styleOf, interactiveSelection: true,
    lotTooltipLabel: f => { const r = recOf(f); return r ? `${r.farm.name} · S. ${r.identity.lot} (${r.identity.lotCode})` : `Polígono ${f.properties.lotId} · sin registro en el Maestro`; },
    onSelectLot: f => void openLot(f.properties.lotId), onBaseChange: b => void store.setSetting('mapBase', b.key)});
  view.cleanup.push(() => { try { mapApi?.destroy(); } catch { /* ya destruido */ } });
  const b0 = lots.reduce((b, f) => [Math.min(b[0], f.bbox[0]), Math.min(b[1], f.bbox[1]), Math.max(b[2], f.bbox[2]), Math.max(b[3], f.bbox[3])], [180, 90, -180, -90]);
  mapObj.fitBounds([[b0[1], b0[0]], [b0[3], b0[2]]]);
  labelBox = document.createElement('div'); labelBox.className = 'vc-maplabels'; mapObj.getContainer().append(labelBox);
  let visible = [];
  const byId = new Map(lots.map(f => [f.properties.lotId, f]));

  function draw({fit = false} = {}) {
    visible = lots.filter(inScope);
    mapApi.setLots(visible, st.selected || '');
    const n = visible.length, noRec = visible.filter(f => !recOf(f)).length, farms = new Set(visible.map(f => recOf(f)?.identity.farmCode).filter(Boolean)).size;
    $('[data-status]', el).innerHTML = `${n.toLocaleString('es-NI')} suertes · ${farms} haciendas${noRec ? ` · ${noRec} sin registro en el Maestro` : ''} · GIS ${esc(version)}`;
    $$('[data-scope]', el).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.scope === st.scope)));
    const fc = st.zones.size + st.tenures.size + st.conditions.size; $('[data-fcount]', el).textContent = fc ? ` · ${fc}` : '';
    legend(); drawFindings(); drawGps();
    if (fit) fitVisible(); else labels();
  }
  function fitTo(features) {
    if (!features.length) return;
    const b = features.reduce((a, f) => [Math.min(a[0], f.bbox[0]), Math.min(a[1], f.bbox[1]), Math.max(a[2], f.bbox[2]), Math.max(a[3], f.bbox[3])], [180, 90, -180, -90]);
    mapObj.fitBounds([[b[1], b[0]], [b[3], b[2]]], {padding: [36, 36], maxZoom: 17});
  }
  const farmFeatures = code => lots.filter(f => recOf(f)?.identity.farmCode === code);   // todas las suertes de la finca, en cualquier zona
  function fitVisible() { if (st.farmCode && farmFeatures(st.farmCode).length) fitTo(farmFeatures(st.farmCode)); else fitTo(visible); }
  function legend() {
    const entries = st.colorBy === 'hacienda' ? [] : Object.entries(COLORS[st.colorBy]).filter(([k]) => visible.some(f => (st.colorBy === 'condicion' ? (recOf(f) ? CONDITION(recOf(f).state.operationalState) : 'Sin Maestro') : tenureOf(recOf(f))) === k));
    $('[data-legend]', el).innerHTML = st.colorBy === 'hacienda' ? '<span>Color por hacienda</span>' : entries.map(([k, c]) => `<span><i style="background:${c};${k === 'Sin Maestro' ? 'border:1.5px dashed #fff' : ''}"></i>${esc(k)}</span>`).join('');
  }
  /* Etiquetas: lejos, el nombre de cada hacienda; cerca, HACIENDA / S. NN. Colisiones resueltas por prioridad. */
  function labels() {
    if (!labelBox) return;
    const z = mapObj.getZoom(), size = mapObj.getSize(), bounds = mapObj.getBounds().pad(0.05);
    const lotMode = z >= 15, fs = z >= 17 ? 12 : z >= 16 ? 11 : 10.5, items = [];
    const shortName = n => { const s = String(n || '').toUpperCase(); return s.length > 24 ? s.slice(0, 23) + '…' : s; };
    if (lotMode) {
      for (const f of visible) {
        const [lon, lat] = f.properties.anchor; if (!bounds.contains([lat, lon])) continue;
        const r = recOf(f), p = mapObj.latLngToContainerPoint([lat, lon]);
        items.push({p, lines: r ? [shortName(r.farm.name), `S. ${r.identity.lot}`] : [`${f.properties.lotId}`, 'Sin Maestro'], prio: (f.properties.lotId === st.selected ? 3 : r?.identity.farmCode === st.farmCode ? 2 : 0) + (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]) * 1e4, sel: f.properties.lotId === st.selected, warn: !r});
      }
    } else if (z >= 10) {
      const farms = new Map();
      for (const f of visible) { const r = recOf(f); if (!r) continue; const a = (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]), cur = farms.get(r.identity.farmCode); if (!cur || a > cur.a) farms.set(r.identity.farmCode, {a, f, r}); }
      for (const {f, r} of farms.values()) {
        const [lon, lat] = f.properties.anchor; if (!bounds.contains([lat, lon])) continue;
        const total = farmFeatures(r.identity.farmCode).reduce((s, x) => s + (x.bbox[2] - x.bbox[0]) * (x.bbox[3] - x.bbox[1]), 0);
        items.push({p: mapObj.latLngToContainerPoint([lat, lon]), lines: [shortName(r.farm.name)], prio: (r.identity.farmCode === st.farmCode ? 1e3 : 0) + total * 1e4});
      }
    }
    items.sort((a, b) => b.prio - a.prio);
    const boxes = [], out = [], fits = (b) => b.x >= 4 && b.y >= 4 && b.x + b.w <= size.x - 4 && b.y + b.h <= size.y - 4 && !boxes.some(o => b.x < o.x + o.w + 3 && b.x + b.w + 3 > o.x && b.y < o.y + o.h + 2 && b.y + b.h + 2 > o.y);
    for (const it of items) {
      if (out.length >= 260) break;
      const w = Math.max(...it.lines.map(l => l.length)) * fs * 0.62 + 10, h = it.lines.length * (fs + 2) + 6, b = {x: it.p.x - w / 2, y: it.p.y - h / 2, w, h};
      if (!fits(b)) continue; boxes.push(b);
      out.push(`<div class="vc-maplabel ${it.sel ? 'is-sel' : ''} ${it.warn ? 'is-warn' : ''}" style="left:${b.x.toFixed(0)}px;top:${b.y.toFixed(0)}px;font-size:${fs}px">${it.lines.map((l, i) => `<span${i ? ' class="vc-maplabel__lot"' : ''}>${esc(l)}</span>`).join('')}</div>`);
    }
    labelBox.innerHTML = out.join(''); labelBox.style.visibility = 'visible';
  }
  mapObj.on('moveend zoomend resize', labels);
  mapObj.on('movestart zoomstart', () => { if (labelBox) labelBox.style.visibility = 'hidden'; });
  function drawGps() {
    gpsLayer?.remove(); gpsLayer = null; if (!gps.fix) return; const ll = [gps.fix.lat, gps.fix.lon];
    gpsLayer = L.layerGroup([L.circle(ll, {radius: gps.fix.accuracy, color: '#1A73E8', weight: 1, fillOpacity: .1, interactive: false}),
      L.marker(ll, {icon: L.divIcon({className: '', html: '<div class="vc-gps-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9]}), interactive: false, keyboard: false})]).addTo(mapObj);
  }
  function drawFindings() {
    findLayer?.remove();
    findLayer = L.layerGroup(all.findings.filter(f => f.gps?.source === 'device' && Number.isFinite(f.gps.lat)).map(f => L.circleMarker([f.gps.lat, f.gps.lon], {radius: 7, color: '#fff', weight: 2, fillColor: OPEN.has(f.status) ? '#B7791F' : '#2E7D5B', fillOpacity: 1})
      .bindTooltip(`${f.producer?.name || 'Por identificar'} · ${fdate(f.observedAt)}`).on('click', () => { location.hash = '#/hallazgo/' + f.id; }))).addTo(mapObj);
  }
  function restyle() { mapObj.eachLayer(l => { if (l.feature?.properties?.lotId && l.setStyle) l.setStyle(styleOf(l.feature)); }); labels(); }
  async function openLot(lotId) {
    st.selected = lotId; const f = byId.get(lotId), r = f ? recOf(f) : null, card = $('[data-card]', el);
    if (r && r.identity.farmCode !== st.farmCode) st.farmCode = r.identity.farmCode;
    restyle(); card.hidden = false;
    if (!r) { card.innerHTML = `<div class="vc-card__head"><div><p class="vc-eyebrow">Polígono ${esc(lotId)}</p><h2>Sin registro en el Maestro vigente</h2></div><button class="vc-icon-btn" type="button" data-close-card aria-label="Cerrar">${icon('x')}</button></div>
      <p class="vc-muted">Esta geometría (GIS ${esc(version)}) no tiene suerte en la generación ${esc(reader.version().dataVersion)}. Puede ser una partición nueva o una suerte dada de baja: se informa en la conciliación Maestro–GIS y no se le asignan datos.</p>`; return; }
    const n = all.findings.filter(x => x.lotKey === r.key && OPEN.has(x.status)).length, now = new Date().toISOString();
    card.innerHTML = `<div class="vc-card__head"><div style="min-width:0"><p class="vc-eyebrow">${esc(r.farm.name)} · hacienda ${esc(r.identity.farmCode)}</p><h2>Suerte ${esc(r.identity.lot)} <span class="vc-muted vc-small">código ${esc(r.identity.lotCode)}</span></h2></div><button class="vc-icon-btn" type="button" data-close-card aria-label="Cerrar">${icon('x')}</button></div>
      <div class="vc-chips" style="margin-bottom:8px"><span class="vc-chip">${esc(tenureOf(r))}</span><span class="vc-chip">${esc(r.farm.zone || '')}</span>${phenologyHtml(r, now)}${n ? `<span class="vc-chip vc-chip--warn">${n} hallazgo${n > 1 ? 's' : ''} abierto${n > 1 ? 's' : ''}</span>` : ''}</div>
      ${agroHtml(r, now, {compact: true})}
      <div class="vc-map-actions"><button class="vc-btn vc-btn--primary" type="button" data-reg="hallazgo">${icon('malezas')}Hallazgo</button><label class="vc-btn" data-capture data-reg-ev>${icon('camera')}Evidencia<input type="file" accept="image/*" capture="environment" data-evidence hidden></label>
        <a class="vc-btn" href="#/nueva?finca=${esc(r.identity.farmCode)}&suerte=${encodeURIComponent(r.key)}">${icon('calendar')}Visita</a><a class="vc-btn" href="#/suerte/${encodeURIComponent(r.key)}">${icon('clipboard')}Ficha</a><a class="vc-btn" href="#/productor/${esc(r.identity.farmCode)}">${icon('folder')}Expediente</a></div>`;
  }
  // Búsqueda: haciendas y suertes (nombre, código de hacienda, código completo de suerte, «nombre + suerte»).
  $('[data-q]', el).addEventListener('input', e => {
    const q = e.target.value, box = $('[data-results]', el), ls = searchLots(reader, q, 5), fs = searchFarms(reader, q, 8);
    box.hidden = !(ls.length || fs.length);
    box.innerHTML = [...ls.map(r => `<button type="button" data-goto-lot="${esc(String(r.identity.lotCode).toUpperCase())}"><strong>${esc(r.farm.name)} · S. ${esc(r.identity.lot)}</strong><small>Suerte ${esc(r.identity.lotCode)} · ${esc(tenureOf(r))} · ${esc(r.farm.zone || '')}</small></button>`),
      ...fs.map(f => `<button type="button" data-goto-farm="${esc(f.code)}"><strong>${esc(f.name)}</strong><small>Hacienda ${esc(f.code)} · ${f.keys.length} suertes · ${esc([...new Set(reader.lotsOf(f.code).map(tenureOf))].join(', '))}</small></button>`)].join('');
  });
  el.addEventListener('click', async e => {
    const sc = e.target.closest('[data-scope]'); if (sc) { st.scope = sc.dataset.scope; await store.setSetting('mapScope', st.scope); draw({fit: !st.farmCode}); }
    if (e.target.closest('[data-close-card]')) { $('[data-card]', el).hidden = true; st.selected = null; restyle(); }
    const gf = e.target.closest('[data-goto-farm]');
    if (gf) { $('[data-results]', el).hidden = true; st.farmCode = gf.dataset.gotoFarm; st.selected = null; $('[data-card]', el).hidden = true; if (!lots.some(f => inScope(f) && recOf(f)?.identity.farmCode === st.farmCode)) { st.scope = 'todo'; } draw(); fitTo(farmFeatures(st.farmCode)); }
    const gl = e.target.closest('[data-goto-lot]');
    if (gl) { $('[data-results]', el).hidden = true; const f = byId.get(gl.dataset.gotoLot); if (!f) { toast('Esa suerte no tiene geometría en el GIS publicado'); return; } st.farmCode = recOf(f)?.identity.farmCode || null; if (!inScope(f)) st.scope = 'todo'; st.selected = f.properties.lotId; draw(); fitTo([f]); await openLot(f.properties.lotId); }
    if (e.target.closest('[data-locate]')) { startGps(); if (gps.fix) mapObj.setView([gps.fix.lat, gps.fix.lon], Math.max(mapObj.getZoom(), 16)); else toast(gps.state === 'denegado' ? 'Ubicación sin permiso: el mapa funciona igual sin GPS' : 'Buscando tu ubicación…'); }
    if (e.target.closest('[data-fit]')) fitVisible();
    if (e.target.closest('[data-filters]')) filtersSheet();
    if (e.target.closest('[data-reg="hallazgo"]')) { const r = byLotCode.get(st.selected); if (r) { await M.setManualTarget(r.identity.farmCode, r.key); location.hash = '#/registrar?accion=hallazgo'; } }
  });
  function filtersSheet() {
    const opt = (set, val, label = val) => `<label class="vc-opt"><input type="checkbox" value="${esc(val)}" ${set.has(val) ? 'checked' : ''}><span>${esc(label)}</span></label>`;
    const host = document.createElement('div'); host.className = 'vc-sheet';
    host.innerHTML = `<div class="vc-sheet__scrim" data-x></div><section class="vc-sheet__panel" role="dialog" aria-modal="true" aria-label="Filtros del mapa"><header class="vc-sheet__head"><span class="vc-sheet__grip"></span><h2>Filtros y color</h2><button class="vc-icon-btn" type="button" data-x aria-label="Cerrar">${icon('x')}</button></header>
      <div class="vc-sheet__body"><p class="vc-label">Colorear por</p><div class="vc-seg" role="group">${[['clasificacion', 'Clasificación'], ['condicion', 'Condición'], ['hacienda', 'Hacienda']].map(([k, l]) => `<button type="button" data-color="${k}" aria-pressed="${st.colorBy === k}">${l}</button>`).join('')}</div>
        <p class="vc-label">Zona</p><div class="vc-opts" data-set="zones">${ZONES.map(z => opt(st.zones, z)).join('')}</div>
        <p class="vc-label">Clasificación de negocio (tenencia de la suerte)</p><div class="vc-opts" data-set="tenures">${['Compra Venta', 'Arriendo', 'Propio', 'Sin Maestro'].map(z => opt(st.tenures, z)).join('')}</div>
        <p class="vc-label">Condición productiva</p><div class="vc-opts" data-set="conditions">${['Molienda', 'Semilla', 'Sin caña', 'Otras', 'Sin Maestro'].map(z => opt(st.conditions, z)).join('')}</div>
        <p class="vc-muted vc-small">«Otras»: baja rentabilidad, baja definitiva, investigación o ausente de la fuente. Las geometrías «Sin Maestro» no tienen suerte en la generación vigente.</p>
        <div class="vc-row-actions"><button class="vc-btn" type="button" data-clear-f>Quitar filtros</button><button class="vc-btn vc-btn--primary" type="button" data-x>Listo</button></div></div></section>`;
    document.body.append(host); document.body.classList.add('vc-locked');
    host.addEventListener('change', e => { const set = e.target.closest('[data-set]'); if (!set) return; const s = st[set.dataset.set]; e.target.checked ? s.add(e.target.value) : s.delete(e.target.value); draw(); });
    host.addEventListener('click', async e => {
      const c = e.target.closest('[data-color]'); if (c) { st.colorBy = c.dataset.color; await store.setSetting('mapColor', st.colorBy); $$('[data-color]', host).forEach(b => b.setAttribute('aria-pressed', String(b === c))); draw(); }
      if (e.target.closest('[data-clear-f]')) { st.zones.clear(); st.tenures.clear(); st.conditions.clear(); $$('input[type=checkbox]', host).forEach(i => { i.checked = false; }); draw(); }
      if (e.target.closest('[data-x]')) { host.remove(); document.body.classList.remove('vc-locked'); }
    });
  }
  // Evidencia desde la ficha: la suerte elegida pasa a ser el destino antes de que vuelva la cámara.
  el.addEventListener('pointerdown', e => { if (e.target.closest('[data-reg-ev]')) { const r = byLotCode.get(st.selected); if (r) void M.setManualTarget(r.identity.farmCode, r.key); } });
  bindEvidence(el);
  view.cleanup.push(onGps(() => drawGps()));
  draw({fit: true});
  if (st.selected && byId.has(st.selected)) { fitTo([byId.get(st.selected)]); await openLot(st.selected); }
  window.CASUR_VISITAS_MAP = {visible: () => visible.length, labels: () => labelBox?.children.length || 0, scope: () => st.scope};   // diagnóstico de QA (solo lectura)
}
