/* Visitas de Campo Productores de Caña · Negocios de Caña · CASUR (VC01, local-first).
   Datos propios en IndexedDB «casur-visitas»; Maestro Central y GIS de solo lectura. Sin nube en esta etapa. */
import {protectModuleActivity} from '../../../core/updates/activity-guard.js';
import {createCasurMap} from '../../../shared/geo/geo-map.js';
import * as store from './store.js';
import {maestro, snapshotFor} from './maestro.js';
import {REASONS, reasonLabel, fieldsFor, waterContext, WATER_LABEL, FINDING_CATEGORIES, SEVERITY, PRIORITY, REQUEST_TYPES, STATES, OPEN_STATES, KIND_LABEL} from './forms.js';
import {farmFeatures, proposeLot, currentPosition} from './geo.js';
import {createPhotoRecord, BACKUP_STATES, labeledCopy, photoExtension} from './photos.js';
import {buildBackup, markExported, confirmBackup, restoreBackup, partLimitBytes, fileDate} from './backup.js';

export const VISITAS_VERSION = '1.0.0';
const guard = protectModuleActivity(window);
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fmtDate = iso => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}` : '—'; };
const fmtDateTime = iso => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? `${fmtDate(iso)} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '—'; };
const localInput = iso => { const d = iso ? new Date(iso) : new Date(); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const ha = v => v === null || v === undefined ? '—' : `${Number(v).toLocaleString('es-NI', {maximumFractionDigits: 2})} ha`;
const mb = b => b === null || b === undefined ? '—' : `${(b / 1048576).toLocaleString('es-NI', {maximumFractionDigits: 1})} MB`;
const view = () => $('#view');

const state = {visit: null, photos: [], followups: [], saving: false, dirty: false, timer: null, lastSaved: null, map: null, mapInstance: null, gpsLayer: null, proposal: null, busy: false};

/* ---------- Puente con la App Maestra (checkpoint antes de actualizar o salir) ---------- */
window.CASUR_MODULE_BRIDGE = Object.freeze({
  protocolVersion: 1, moduleId: 'visitas',
  getActiveContext: () => state.visit ? {visitId: state.visit.id, producer: state.visit.producer?.code || null} : null,
  async checkpoint() {
    if (state.busy) return {ok: false, status: 'operation-active'};
    try { await flush(); return {ok: true, status: 'saved'}; } catch { return {ok: false, status: 'save-failed'}; }
  },
});

/* ---------- Avisos ---------- */
function toast(text, kind = 'info') {
  const t = $('#toast'); t.textContent = text; t.dataset.kind = kind; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 4200);
}
async function busy(fn) {
  state.busy = true; document.body.setAttribute('aria-busy', 'true');
  try { return await fn(); } finally { state.busy = false; document.body.removeAttribute('aria-busy'); }
}

/* ---------- Rutas ---------- */
const routes = {inicio: viewHome, nueva: newVisit, visita: viewEditor, ver: viewDetail, visitas: viewList, seguimiento: viewFollowups, datos: viewData};
async function route() {
  await flush().catch(() => {});
  destroyMap();
  const [name, id] = (location.hash.replace(/^#\/?/, '') || 'inicio').split('/');
  $$('.vc-nav a').forEach(a => a.toggleAttribute('aria-current', a.dataset.route === (name === 'visita' || name === 'ver' ? 'visitas' : name)));
  state.visit = null;
  try { await (routes[name] || viewHome)(id); } catch (e) { view().innerHTML = `<section class="vc-card" role="alert"><h2>No se pudo abrir esta pantalla</h2><p>${esc(e.message)}</p><a class="vc-btn" href="#/inicio">Volver al inicio</a></section>`; }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

/* ---------- Inicio ---------- */
async function viewHome() {
  const [visits, followups, photos, storage, persisted] = await Promise.all([store.all('visits'), store.all('followups'), store.all('photos'), store.storageState(), store.getSetting('persistAsked')]);
  const drafts = visits.filter(v => v.status === 'borrador').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const recent = visits.filter(v => v.status === 'cerrada').sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 5);
  const openRec = followups.filter(f => f.kind === 'recomendacion' && OPEN_STATES.has(f.state));
  const openReq = followups.filter(f => f.kind === 'solicitud' && OPEN_STATES.has(f.state));
  const pendingPhotos = photos.filter(p => p.blob && ['local', 'restaurada'].includes(p.backupState)).length;
  const exported = photos.filter(p => p.backupState === 'exportada').length;
  const ratio = storage.ratio;
  view().innerHTML = `
    <a class="vc-btn vc-btn--primary vc-btn--block" href="#/nueva">＋ Registrar nueva visita</a>
    ${drafts.length ? `<section class="vc-card vc-card--warn"><h2>Borradores sin cerrar</h2>${drafts.map(visitRow).join('')}</section>` : ''}
    <section class="vc-kpis" aria-label="Resumen">
      ${kpi('Visitas registradas', visits.filter(v => v.status === 'cerrada').length, '#/visitas')}
      ${kpi('Recomendaciones pendientes', openRec.length, '#/seguimiento')}
      ${kpi('Solicitudes abiertas', openReq.length, '#/seguimiento')}
      ${kpi('Fotos sin respaldo', pendingPhotos + exported, '#/datos', pendingPhotos + exported ? 'warn' : '')}
    </section>
    <section class="vc-card"><h2>Visitas recientes</h2>${recent.length ? recent.map(visitRow).join('') : '<p class="vc-muted">Todavía no hay visitas cerradas en este teléfono.</p>'}</section>
    <section class="vc-card"><h2>Almacenamiento</h2>
      <p>${mb(storage.usage)} usados${storage.quota ? ` de ${mb(storage.quota)} disponibles` : ''}${ratio !== null && ratio > 0.8 ? ' · <strong class="vc-warn">Espacio casi lleno: exportá un respaldo.</strong>' : ''}</p>
      <p class="vc-muted">${storage.persisted ? 'Almacenamiento persistente concedido: el navegador no borrará estos datos por falta de espacio.' : persisted ? 'El navegador no concedió almacenamiento persistente. Exportá respaldos con frecuencia.' : 'Almacenamiento persistente sin solicitar.'}</p>
      <a class="vc-btn" href="#/datos">Datos y respaldos</a></section>`;
}
const kpi = (label, value, href, kind = '') => `<a class="vc-kpi ${kind ? 'vc-kpi--' + kind : ''}" href="${href}"><span class="vc-kpi__value">${value}</span><span class="vc-kpi__label">${label}</span></a>`;
function visitRow(v) {
  const lots = v.scope === 'finca' ? 'Visita general de finca' : v.lots.map(l => l.lot).join(', ') || 'Sin suertes';
  return `<a class="vc-row" href="#/${v.status === 'borrador' ? 'visita' : 'ver'}/${esc(v.id)}">
    <span class="vc-row__main"><strong>${esc(v.producer?.name || 'Sin productor')}</strong><span>${esc(reasonLabel(v.reason) || 'Sin motivo')} · ${esc(lots)}</span></span>
    <span class="vc-row__side">${fmtDate(v.startedAt)}${v.status === 'borrador' ? '<span class="vc-tag vc-tag--warn">Borrador</span>' : ''}</span></a>`;
}

/* ---------- Nueva visita ---------- */
async function newVisit() {
  const author = await store.getSetting('author', '');
  const now = new Date().toISOString();
  const visit = {id: store.newId('visita'), schema: 1, status: 'borrador', rev: 1, createdAt: now, updatedAt: now, startedAt: now, closedAt: null,
    author: {name: author}, producer: null, scope: 'suertes', lots: [], reason: '', fields: {}, observations: '', findings: [], gps: null,
    masterSnapshot: null, revisions: []};
  await store.put('visits', visit);
  if (!(await store.getSetting('persistAsked'))) { await store.requestPersistence(); await store.setSetting('persistAsked', true); }
  location.replace('#/visita/' + visit.id);
}

/* ---------- Editor ---------- */
async function loadVisit(id) {
  const visit = await store.get('visits', id); if (!visit) throw Error('La visita no existe en este teléfono.');
  state.visit = visit;
  [state.photos, state.followups] = await Promise.all([store.byIndex('photos', 'visitId', id), store.byIndex('followups', 'visitId', id)]);
  return visit;
}
async function viewEditor(id) {
  const v = await loadVisit(id);
  const {reader} = await maestro();
  const records = selectedRecords(v);
  const ctx = {reason: v.reason, water: waterContext(records)};
  const closed = v.status === 'cerrada';
  view().innerHTML = `
    <form class="vc-form" data-autosave novalidate onsubmit="return false">
      <div class="vc-formhead"><h1>${closed ? 'Editar visita cerrada' : 'Visita de campo'}</h1><span class="vc-save" id="saveState" role="status">${state.lastSaved ? 'Guardado' : 'Borrador guardado en el teléfono'}</span></div>
      ${closed ? '<p class="vc-note">Los cambios quedan registrados como una revisión de la visita.</p>' : ''}
      ${section('productor', '1', 'Productor y suertes', producerSection(v, reader), true)}
      ${v.producer ? section('ubicacion', '2', 'Ubicación y mapa', locationSection(v), true) : ''}
      ${v.producer ? section('motivo', '3', 'Fecha y motivo', reasonSection(v, ctx), true) : ''}
      ${v.producer && v.reason ? section('maestro', '4', 'Datos del Maestro', masterSection(v, records), false) : ''}
      ${v.producer && v.reason ? section('obs', '5', 'Observaciones y hallazgos', observationsSection(v, ctx), true) : ''}
      ${v.producer && v.reason ? section('fotos', '6', 'Fotografías', photosSection(v), true) : ''}
      ${v.producer && v.reason ? section('seguimiento', '7', 'Recomendaciones, solicitudes y compromisos', followupSection(v), true) : ''}
      <div class="vc-actions vc-actions--sticky">
        ${closed ? `<a class="vc-btn" href="#/ver/${esc(v.id)}">Terminar edición</a>` : `<button class="vc-btn vc-btn--primary" type="button" data-action="close-visit" ${v.producer && v.reason ? '' : 'disabled'}>Cerrar visita</button>`}
        <a class="vc-btn" href="#/inicio">Guardar y salir</a>
      </div>
    </form>`;
  bindEditor();
  if (v.producer) void renderMap();
}
const section = (id, n, title, body, open) => `<details class="vc-section" id="sec-${id}" ${open ? 'open' : ''}><summary><span class="vc-step">${n}</span>${title}</summary><div class="vc-section__body">${body}</div></details>`;
function selectedRecords(v) {
  const recs = v.masterSnapshot?.records || [];
  return v.scope === 'finca' ? recs : recs.filter(r => v.lots.some(l => l.key === r.key));
}
function producerSection(v, reader) {
  if (!v.producer) {
    return `<label class="vc-field"><span>Buscar productor o finca (código o nombre)</span><input type="search" id="producerQuery" autocomplete="off" placeholder="Ej.: 242 o Agustín" data-casur-query></label>
      <div id="producerResults" class="vc-results" role="listbox" aria-label="Productores"></div>`;
  }
  const recs = v.masterSnapshot?.records || [];
  return `<div class="vc-chosen"><div><strong>${esc(v.producer.name)}</strong><span>Código ${esc(v.producer.code)} · ${esc(v.producer.zone || 'Sin zona')} · ${recs.length} suertes</span></div>
      ${v.status === 'borrador' ? '<button class="vc-btn vc-btn--small" type="button" data-action="change-producer">Cambiar</button>' : ''}</div>
    <fieldset class="vc-choice"><legend>Alcance</legend>
      <label><input type="radio" name="scope" value="suertes" ${v.scope === 'suertes' ? 'checked' : ''} data-action="scope"> Suertes específicas</label>
      <label><input type="radio" name="scope" value="finca" ${v.scope === 'finca' ? 'checked' : ''} data-action="scope"> Visita general de finca</label></fieldset>
    ${v.scope === 'suertes' ? `<div class="vc-lots" role="group" aria-label="Suertes visitadas">${recs.map(r => {
      const sel = v.lots.find(l => l.key === r.key);
      return `<label class="vc-lot ${sel ? 'is-on' : ''}"><input type="checkbox" data-action="toggle-lot" value="${esc(r.key)}" ${sel ? 'checked' : ''}>
        <span class="vc-lot__n">${esc(r.identity.lot)}</span><span class="vc-lot__d">${ha(r.attributes.area)} · ${esc(r.attributes.variety || '—')}<br>${esc(r.attributes.irrigationType || 'Sin dato de riego')} · ${esc(r.state.operationalState || '—')}${sel?.selection === 'gps' ? ' · GPS' : ''}</span></label>`;
    }).join('')}</div>` : ''}`;
}
function locationSection(v) {
  const g = v.gps, p = state.proposal;
  return `<div class="vc-gps">${g ? `<p><strong>${g.lat.toFixed(6)}, ${g.lon.toFixed(6)}</strong> · precisión ±${g.accuracy} m · ${fmtDateTime(g.at)}<br><span class="vc-muted">Coordenadas generales de la visita (GPS del teléfono).</span></p>` : '<p class="vc-muted">Sin ubicación registrada. La ubicación es opcional; podés elegir las suertes manualmente.</p>'}
    <button class="vc-btn" type="button" data-action="gps">${g ? 'Actualizar ubicación' : 'Tomar ubicación GPS'}</button></div>
    <div id="proposal">${p ? proposalHtml(p) : ''}</div>
    <div id="visitMap" class="vc-map" aria-label="Mapa de la finca"></div>
    <p class="vc-muted" id="mapNote"></p>`;
}
function proposalHtml(p) {
  const recs = state.visit.masterSnapshot?.records || [], byCode = c => recs.find(r => r.identity.lotCode === c);
  const items = p.candidates.map(c => ({c, r: byCode(c.lotId)})).filter(x => x.r);
  const text = {inside: 'La ubicación está dentro de esta suerte. Confirmá si corresponde.', ambiguous: 'La ubicación está en un borde o coincide con varias suertes. Elegí la correcta.',
    near: 'La ubicación está fuera de las suertes de esta finca. Las más cercanas son:', outside: 'La ubicación está lejos de las suertes de esta finca. Revisá la finca elegida o seleccioná manualmente.',
    'no-geometry': 'Esta finca no tiene polígonos disponibles. Elegí las suertes manualmente.'}[p.status];
  return `<div class="vc-proposal vc-proposal--${p.status}" role="status"><p>${text}</p>${items.map(({c, r}) =>
    `<button class="vc-btn vc-btn--small" type="button" data-action="confirm-lot" value="${esc(r.key)}">Suerte ${esc(r.identity.lot)}${c.inside ? '' : ` · a ${Math.round(c.edge)} m`}</button>`).join('')}</div>`;
}
function reasonSection(v, ctx) {
  return `<label class="vc-field"><span>Fecha y hora de la visita</span><input type="datetime-local" data-bind="startedAt" value="${localInput(v.startedAt)}"></label>
    <label class="vc-field"><span>Motivo de la visita</span><select data-bind="reason" data-rerender><option value="">Elegí un motivo…</option>${REASONS.map(r => `<option value="${r.id}" ${v.reason === r.id ? 'selected' : ''}>${r.label}</option>`).join('')}</select></label>
    <label class="vc-field"><span>Técnico</span><input type="text" data-bind="author.name" value="${esc(v.author?.name)}" autocomplete="name" placeholder="Nombre de quien registra"></label>
    ${v.reason ? `<p class="vc-chip">${WATER_LABEL[ctx.water]}</p><div class="vc-grid">${fieldsFor(ctx).map(f => fieldHtml(f, v.fields[f.id])).join('')}</div>` : ''}`;
}
function fieldHtml(f, value) {
  const bind = `data-bind="fields.${f.id}"`;
  if (f.type === 'choice') return `<fieldset class="vc-field vc-seg"><legend>${f.label}</legend>${f.options.map(o => `<label><input type="radio" name="f-${f.id}" value="${esc(o)}" ${value === o ? 'checked' : ''} ${bind}><span>${esc(o)}</span></label>`).join('')}</fieldset>`;
  if (f.type === 'textarea') return `<label class="vc-field vc-field--wide"><span>${f.label}</span><textarea rows="3" ${bind}>${esc(value)}</textarea></label>`;
  return `<label class="vc-field"><span>${f.label}</span><input type="${f.type}" ${f.min !== undefined ? `min="${f.min}" max="${f.max}"` : ''} inputmode="${f.type === 'number' ? 'decimal' : 'text'}" value="${esc(value)}" ${bind}></label>`;
}
function masterSection(v, records) {
  const s = v.masterSnapshot;
  if (!records.length) return '<p class="vc-muted">Elegí las suertes para ver sus datos.</p>';
  return `<p class="vc-muted">Datos del Maestro al ${fmtDate(s.takenAt)} · generación ${esc(s.dataVersion)}. Se conservan en la visita aunque el Maestro cambie después.</p>
    <div class="vc-scroll"><table class="vc-table"><thead><tr><th>Suerte</th><th>Área</th><th>Variedad</th><th>Corte</th><th>Riego</th><th>Estado</th><th>TCH ${esc(s.executedSeason || 'anterior')}</th><th>TCH estimado ${esc(s.estimateSeason || '')}</th></tr></thead>
    <tbody>${records.map(r => `<tr><td>${esc(r.identity.lot)}</td><td>${ha(r.attributes.area)}</td><td>${esc(r.attributes.variety || '—')}</td><td>${esc(r.attributes.cut || '—')}</td><td>${esc(r.attributes.irrigationType || '—')}</td><td>${esc(r.state.operationalState || '—')}</td><td>${r.executed?.tch ? Number(r.executed.tch).toFixed(1) : '—'}</td><td>${r.estimate.available ? Number(r.estimate.tch).toFixed(1) : 'Sin estimado'}</td></tr>`).join('')}</tbody></table></div>`;
}
function lotOptions(v, selected) {
  const recs = selectedRecords(v);
  return `<option value="">Toda la finca</option>${recs.map(r => `<option value="${esc(r.key)}" ${selected === r.key ? 'selected' : ''}>Suerte ${esc(r.identity.lot)}</option>`).join('')}`;
}
function observationsSection(v) {
  return `<label class="vc-field vc-field--wide"><span>Observaciones generales</span><textarea rows="4" data-bind="observations" placeholder="Podés dictar con el micrófono del teclado">${esc(v.observations)}</textarea></label>
    <h3>Hallazgos</h3>
    ${v.findings.map(f => `<div class="vc-item" data-finding="${esc(f.id)}">
      <div class="vc-grid">
        <label class="vc-field"><span>Categoría</span><select data-bind="findings.${f.id}.category">${FINDING_CATEGORIES.map(c => `<option ${f.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <label class="vc-field"><span>Severidad</span><select data-bind="findings.${f.id}.severity">${SEVERITY.map(c => `<option ${f.severity === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <label class="vc-field"><span>Suerte</span><select data-bind="findings.${f.id}.lotKey">${lotOptions(v, f.lotKey)}</select></label>
      </div>
      <label class="vc-field vc-field--wide"><span>Descripción</span><textarea rows="2" data-bind="findings.${f.id}.text">${esc(f.text)}</textarea></label>
      <button class="vc-link" type="button" data-action="remove-finding" value="${esc(f.id)}">Quitar hallazgo</button></div>`).join('')}
    <button class="vc-btn" type="button" data-action="add-finding">＋ Agregar hallazgo</button>`;
}
function photosSection(v) {
  const findings = v.findings;
  return `<div class="vc-actions">
      <label class="vc-btn vc-btn--primary"><input type="file" accept="image/*" capture="environment" data-action="photo-camera" hidden>📷 Tomar foto</label>
      <label class="vc-btn"><input type="file" accept="image/*" multiple data-action="photo-gallery" hidden>Agregar desde la galería</label></div>
    <div class="vc-photos">${state.photos.map(p => `<figure class="vc-photo" data-photo="${esc(p.id)}">
      ${p.blob ? `<img alt="Foto ${esc(p.caption || '')}" data-photo-img="${esc(p.id)}">` : '<div class="vc-photo__missing">No disponible</div>'}
      <figcaption>
        <span class="vc-tag">${esc(BACKUP_STATES[p.backupState] || p.backupState)}</span>
        <span class="vc-muted">${p.gps ? `GPS propio ±${p.gps.accuracy ?? '?'} m` : p.visitGps ? 'Sin GPS propio · ubicación general de la visita' : 'Sin coordenadas'}</span>
        <label class="vc-field"><span>Descripción</span><input type="text" data-photo-bind="${esc(p.id)}.caption" value="${esc(p.caption)}"></label>
        <label class="vc-field"><span>Suerte</span><select data-photo-bind="${esc(p.id)}.lotKey">${lotOptions(v, p.lotKey)}</select></label>
        ${findings.length ? `<label class="vc-field"><span>Hallazgo</span><select data-photo-bind="${esc(p.id)}.findingId"><option value="">Ninguno</option>${findings.map((f, i) => `<option value="${esc(f.id)}" ${p.findingId === f.id ? 'selected' : ''}>${i + 1}. ${esc(f.category)}</option>`).join('')}</select></label>` : ''}
      </figcaption></figure>`).join('')}</div>
    ${state.photos.length ? '' : '<p class="vc-muted">Las fotos se guardan originales en este teléfono. Exportá respaldos desde «Datos».</p>'}`;
}
function followupSection(v) {
  const block = kind => {
    const items = state.followups.filter(f => f.kind === kind);
    return `<h3>${KIND_LABEL[kind]}es</h3>${items.map(f => `<div class="vc-item" data-fu="${esc(f.id)}">
      ${kind === 'solicitud' ? `<label class="vc-field"><span>Tipo</span><select data-fu-bind="${esc(f.id)}.category">${REQUEST_TYPES.map(t => `<option ${f.category === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>` : ''}
      <label class="vc-field vc-field--wide"><span>Descripción</span><textarea rows="2" data-fu-bind="${esc(f.id)}.text">${esc(f.text)}</textarea></label>
      <div class="vc-grid">
        ${kind !== 'compromiso' ? `<label class="vc-field"><span>Prioridad</span><select data-fu-bind="${esc(f.id)}.priority">${PRIORITY.map(t => `<option ${f.priority === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>` : ''}
        <label class="vc-field"><span>Responsable</span><input type="text" data-fu-bind="${esc(f.id)}.responsible" value="${esc(f.responsible)}"></label>
        <label class="vc-field"><span>Fecha compromiso</span><input type="date" data-fu-bind="${esc(f.id)}.dueDate" value="${esc(f.dueDate)}"></label>
        <label class="vc-field"><span>Suerte</span><select data-fu-bind="${esc(f.id)}.lotKey">${lotOptions(v, f.lotKey)}</select></label>
      </div>
      <label class="vc-field vc-field--wide"><span>Observaciones</span><input type="text" data-fu-bind="${esc(f.id)}.notes" value="${esc(f.notes)}"></label>
      <p class="vc-muted">Estado: ${esc(f.state)}${kind === 'solicitud' ? ' · No genera pedidos, entregas ni registros SIAGRI.' : ''}</p>
      <button class="vc-link" type="button" data-action="remove-fu" value="${esc(f.id)}" ${f.history.length > 1 ? 'disabled title="Ya tiene seguimiento: cancelala desde Seguimiento"' : ''}>Quitar</button></div>`).join('')}
      <button class="vc-btn" type="button" data-action="add-fu" value="${kind}">＋ ${KIND_LABEL[kind]}</button>`;
  };
  return block('recomendacion') + block('solicitud') + block('compromiso');
}

/* ---------- Eventos del editor ---------- */
function setPath(obj, path, value) {
  const keys = path.split('.');
  if (keys[0] === 'findings') { const f = obj.findings.find(x => x.id === keys[1]); if (f) f[keys[2]] = value; return; }
  let o = obj; for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys.at(-1)] = value;
}
function bindEditor() {
  const form = $('.vc-form');
  form.addEventListener('input', onInput); form.addEventListener('change', onInput); form.addEventListener('click', onAction);
  for (const img of $$('[data-photo-img]')) { const p = state.photos.find(x => x.id === img.dataset.photoImg); if (p?.blob) { img.src = URL.createObjectURL(p.blob); img.onload = () => URL.revokeObjectURL(img.src); } }
  const q = $('#producerQuery'); if (q) { q.addEventListener('input', searchProducers); q.focus(); }
}
function onInput(e) {
  const t = e.target;
  if (t.dataset.action === 'photo-camera' || t.dataset.action === 'photo-gallery') { if (e.type === 'change') void addPhotos(t.files, t.dataset.action === 'photo-camera' ? 'camera' : 'gallery'); return; }
  if (t.dataset.action === 'scope') { if (e.type === 'change') void structural(v => { v.scope = t.value; }); return; }
  if (t.dataset.action === 'toggle-lot') { if (e.type === 'change') void structural(v => { toggleLot(v, t.value, t.checked, 'manual'); }); return; }
  if (t.dataset.bind) {
    let value = t.type === 'checkbox' ? t.checked : t.value;
    if (t.dataset.bind === 'startedAt') value = value ? new Date(value).toISOString() : state.visit.startedAt;
    setPath(state.visit, t.dataset.bind, value);
    if (t.dataset.bind === 'author.name' && e.type === 'change') void store.setSetting('author', value);
    if ('rerender' in t.dataset && e.type === 'change') { void structural(() => {}); return; }
    schedule(); return;
  }
  if (t.dataset.photoBind) { const [id, key] = t.dataset.photoBind.split('.'); const p = state.photos.find(x => x.id === id); if (p) { p[key] = t.value || null; p._dirty = true; schedule(); } return; }
  if (t.dataset.fuBind) { const [id, key] = t.dataset.fuBind.split('.'); const f = state.followups.find(x => x.id === id); if (f) { f[key] = t.value; f._dirty = true; schedule(); } }
}
function toggleLot(v, key, on, selection, extra = {}) {
  v.lots = v.lots.filter(l => l.key !== key);
  if (on) { const r = v.masterSnapshot.records.find(x => x.key === key); v.lots.push({key, lot: r.identity.lot, lotCode: r.identity.lotCode, selection, ...extra}); }
  v.lots.sort((a, b) => a.lot.localeCompare(b.lot, 'es', {numeric: true}));
}
async function onAction(e) {
  const b = e.target.closest('[data-action]'); if (!b || b.tagName === 'INPUT') return;
  const a = b.dataset.action, v = state.visit;
  if (a === 'pick-producer') {
    const {reader, resolution} = await maestro(); const farm = reader.farm(b.value);
    await structural(x => { x.producer = {code: farm.code, name: farm.name, zone: farm.zone}; x.masterSnapshot = snapshotFor(reader, resolution, farm.code); x.lots = []; });
  } else if (a === 'change-producer') {
    if (state.photos.length || state.followups.length) { toast('La visita ya tiene fotos o seguimientos: no se puede cambiar el productor. Creá otra visita.'); return; }
    await structural(x => { x.producer = null; x.masterSnapshot = null; x.lots = []; });
  } else if (a === 'gps') await takeGps();
  else if (a === 'confirm-lot') { state.proposal = null; await structural(x => { const c = x.gpsCandidates?.find(k => k.key === b.value); toggleLot(x, b.value, true, 'gps', c ? {inside: c.inside, distanceM: Math.round(c.edge)} : {}); x.scope = 'suertes'; }); }
  else if (a === 'add-finding') await structural(x => { x.findings.push({id: store.newId('hallazgo'), category: FINDING_CATEGORIES[0], severity: 'Media', lotKey: x.lots.length === 1 ? x.lots[0].key : '', text: ''}); });
  else if (a === 'remove-finding') await structural(x => { x.findings = x.findings.filter(f => f.id !== b.value); state.photos.forEach(p => { if (p.findingId === b.value) { p.findingId = null; p._dirty = true; } }); });
  else if (a === 'add-fu') await addFollowup(b.value);
  else if (a === 'remove-fu') { await flush(); const f = state.followups.find(x => x.id === b.value); if (f && f.history.length <= 1) { await store.putMany([['followups', {...f, state: 'Cancelado', removedFromVisit: true, updatedAt: new Date().toISOString(), history: [...f.history, {state: 'Cancelado', at: new Date().toISOString(), note: 'Quitado al editar la visita', by: v.author?.name || ''}]}]]); state.followups = state.followups.filter(x => x.id !== f.id); await rerender(); } }
  else if (a === 'close-visit') await closeVisit();
}
async function searchProducers(e) {
  const q = e.target.value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), box = $('#producerResults');
  if (q.length < 1) { box.innerHTML = ''; return; }
  const {reader} = await maestro();
  const matches = reader.farms().filter(f => f.code === q || f.code.startsWith(q) || String(f.name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q)).slice(0, 12);
  box.innerHTML = matches.length ? matches.map(f => `<button type="button" class="vc-result" role="option" data-action="pick-producer" value="${esc(f.code)}"><strong>${esc(f.name)}</strong><span>Código ${esc(f.code)} · ${esc(f.zone || '')} · ${f.keys.length} suertes</span></button>`).join('') : '<p class="vc-muted">Sin coincidencias en el Maestro.</p>';
}
async function structural(mutate) { mutate(state.visit); await save(); await rerender(); }
async function rerender() {
  const open = new Set($$('.vc-section[open]').map(d => d.id)), y = window.scrollY;
  destroyMap(); await viewEditor(state.visit.id);
  $$('.vc-section').forEach(d => { d.open = open.has(d.id) || d.open; });
  window.scrollTo(0, y);
}
async function addFollowup(kind) {
  await flush();
  const v = state.visit, now = new Date().toISOString(), initial = STATES[kind][0];
  const f = {id: store.newId(kind), kind, visitId: v.id, producerCode: v.producer.code, producerName: v.producer.name, lotKey: v.lots.length === 1 ? v.lots[0].key : '',
    category: kind === 'solicitud' ? REQUEST_TYPES[0] : null, text: '', priority: kind === 'compromiso' ? null : 'Media', responsible: '', dueDate: '', notes: '',
    state: initial, createdAt: now, updatedAt: now, rev: 1, history: [{state: initial, at: now, note: 'Registrada en la visita', by: v.author?.name || ''}]};
  await store.put('followups', f); state.followups.push(f); await rerender();
}
async function addPhotos(files, source) {
  if (!files?.length) return;
  await busy(async () => {
    const v = state.visit, lotKey = v.lots.length === 1 ? v.lots[0].key : null, added = [];
    for (const file of files) {
      try { added.push(await createPhotoRecord(file, {visitId: v.id, source, visitGps: v.gps, lotKey})); }
      catch (e) { toast('No se pudo guardar una foto: ' + e.message, 'error'); }
    }
    if (added.length) { await store.putMany(added.map(p => ['photos', p])); state.photos.push(...added); toast(`${added.length} foto${added.length > 1 ? 's' : ''} guardada${added.length > 1 ? 's' : ''} en el teléfono.`); }
  });
  await rerender();
}
async function takeGps() {
  const box = $('#proposal'); box.innerHTML = '<p class="vc-muted" role="status">Obteniendo ubicación…</p>';
  try {
    const gps = await busy(() => currentPosition());
    state.visit.gps = gps;
    const recs = state.visit.masterSnapshot.records, features = await farmFeatures(recs.map(r => r.identity.lotCode));
    const proposal = proposeLot(features, gps);
    state.visit.gpsCandidates = proposal.candidates.map(c => ({key: recs.find(r => r.identity.lotCode === c.lotId)?.key, inside: c.inside, edge: c.edge})).filter(c => c.key);
    state.proposal = proposal;
    await save(); await rerender();
    $('#sec-ubicacion')?.scrollIntoView({block: 'start'});
  } catch (e) { box.innerHTML = `<p class="vc-warn" role="alert">${esc(e.message)}</p>`; }
}
async function closeVisit() {
  const v = state.visit;
  if (!v.producer || !v.reason) { toast('Falta el productor o el motivo.'); return; }
  if (v.scope === 'suertes' && !v.lots.length) { toast('Elegí al menos una suerte o marcá «Visita general de finca».'); return; }
  await flush();
  const now = new Date().toISOString();
  await store.update('visits', v.id, cur => ({...cur, status: 'cerrada', closedAt: now, updatedAt: now, rev: (cur.rev || 0) + 1}));
  toast('Visita cerrada y guardada en el teléfono.'); location.hash = '#/ver/' + v.id;
}

/* ---------- Guardado automático ---------- */
function schedule() { state.dirty = true; const s = $('#saveState'); if (s) s.textContent = 'Guardando…'; clearTimeout(state.timer); state.timer = setTimeout(() => void save().catch(err => toast('No se pudo guardar: ' + err.message, 'error')), 500); }
async function flush() { clearTimeout(state.timer); if (state.dirty || state.photos.some(p => p._dirty) || state.followups.some(f => f._dirty)) await save(); }
const TRACKED = ['producer', 'scope', 'lots', 'reason', 'fields', 'observations', 'findings', 'gps', 'startedAt', 'author'];
async function save() {
  const v = state.visit; if (!v) return;
  state.dirty = false;
  const now = new Date().toISOString(), ops = [];
  const saved = await store.update('visits', v.id, cur => {
    if (!cur) throw Error('La visita ya no existe');
    if (cur.rev > v.rev) throw Error('La visita cambió en otra ventana. Volvé a abrirla.');
    const next = {...cur, ...Object.fromEntries(TRACKED.map(k => [k, v[k]])), gpsCandidates: v.gpsCandidates, masterSnapshot: v.masterSnapshot, updatedAt: now, rev: cur.rev + 1};
    if (cur.status === 'cerrada') {
      const changed = TRACKED.filter(k => JSON.stringify(cur[k]) !== JSON.stringify(next[k]));
      if (changed.length) next.revisions = [...(cur.revisions || []), {rev: next.rev, at: now, by: v.author?.name || '', changed, previous: Object.fromEntries(changed.map(k => [k, cur[k]]))}];
    }
    return next;
  });
  state.visit = {...saved};
  for (const p of state.photos.filter(x => x._dirty)) { delete p._dirty; ops.push(['photos', {...p, updatedAt: now}]); }
  for (const f of state.followups.filter(x => x._dirty)) { delete f._dirty; f.updatedAt = now; f.rev = (f.rev || 1) + 1; ops.push(['followups', {...f}]); }
  if (ops.length) await store.putMany(ops);
  state.lastSaved = now;
  const s = $('#saveState'); if (s) s.textContent = `Guardado ${fmtDateTime(now).split(' · ')[1]}`;
}

/* ---------- Mapa ---------- */
function destroyMap() { try { state.map?.destroy(); } catch { /* ya destruido */ } state.map = null; state.mapInstance = null; state.gpsLayer = null; }
async function renderMap() {
  const node = $('#visitMap'), v = state.visit; if (!node || !globalThis.L) return;
  const recs = v.masterSnapshot.records, features = await farmFeatures(recs.map(r => r.identity.lotCode));
  // La vista pudo cambiar mientras se cargaban los polígonos: no se dibuja sobre un nodo que ya no existe.
  if (!node.isConnected || state.visit !== v) return;
  const note = $('#mapNote');
  if (!features.length) { node.hidden = true; note.textContent = 'Sin polígonos para esta finca: se eligen las suertes manualmente.'; return; }
  const visited = new Set((v.scope === 'finca' ? recs : selectedRecords(v)).map(r => r.identity.lotCode));
  const leaflet = new Proxy(globalThis.L, {get(t, p) { if (p === 'map') return (...a) => (state.mapInstance = t.map(...a)); const x = Reflect.get(t, p, t); return typeof x === 'function' ? x.bind(t) : x; }});
  state.map = createCasurMap(node, {leaflet, ariaLabel: `Mapa de ${v.producer.name}`, layersCollapsed: true, showAnchor: false, interactiveSelection: false, initialBase: 'hybrid',
    lotTooltipLabel: f => `Suerte ${recs.find(r => r.identity.lotCode === f.properties?.lotId)?.identity.lot || ''}`,
    featureStyle: f => visited.has(f.properties?.lotId) ? {color: '#0F2A33', weight: 3, fillColor: '#2F7E97', fillOpacity: 0.45} : {color: '#475569', weight: 1, fillColor: '#CBD5E1', fillOpacity: 0.2}});
  state.map.setLots(features, '');
  const missing = recs.filter(r => r.gis?.hasGeometry === false).map(r => r.identity.lot);
  note.textContent = missing.length ? `Sin polígono: suerte ${missing.join(', ')}.` : '';
  if (v.gps && state.mapInstance) {
    const L = globalThis.L, ll = [v.gps.lat, v.gps.lon];
    state.gpsLayer = L.layerGroup([L.circle(ll, {radius: v.gps.accuracy, color: '#B42318', weight: 1, fillOpacity: 0.08}), L.circleMarker(ll, {radius: 7, color: '#fff', weight: 2, fillColor: '#B42318', fillOpacity: 1})]).addTo(state.mapInstance);
  }
}

/* ---------- Detalle ---------- */
async function viewDetail(id) {
  const v = await loadVisit(id), recs = selectedRecords(v), ctx = {reason: v.reason, water: waterContext(recs)};
  const fields = fieldsFor(ctx).filter(f => v.fields[f.id]);
  view().innerHTML = `<article class="vc-card">
    <div class="vc-formhead"><h1>${esc(v.producer?.name || 'Visita')}</h1><span class="vc-tag ${v.status === 'borrador' ? 'vc-tag--warn' : ''}">${v.status === 'borrador' ? 'Borrador' : 'Cerrada'}</span></div>
    <p>${fmtDateTime(v.startedAt)} · ${esc(reasonLabel(v.reason))} · ${esc(v.author?.name || 'Sin técnico')}</p>
    <p>${v.scope === 'finca' ? 'Visita general de finca' : 'Suertes: ' + esc(v.lots.map(l => l.lot + (l.selection === 'gps' ? ' (GPS)' : '')).join(', '))} · ${WATER_LABEL[ctx.water]}</p>
    ${v.gps ? `<p class="vc-muted">Ubicación general: ${v.gps.lat.toFixed(6)}, ${v.gps.lon.toFixed(6)} · ±${v.gps.accuracy} m</p>` : ''}
    ${fields.length ? `<dl class="vc-dl">${fields.map(f => `<dt>${f.label}</dt><dd>${esc(v.fields[f.id])}</dd>`).join('')}</dl>` : ''}
    ${v.observations ? `<h2>Observaciones</h2><p class="vc-pre">${esc(v.observations)}</p>` : ''}
    ${v.findings.length ? `<h2>Hallazgos</h2><ul>${v.findings.map(f => `<li><strong>${esc(f.category)} · ${esc(f.severity)}</strong>${f.lotKey ? ` · Suerte ${esc(f.lotKey.split('|')[1])}` : ''}<br>${esc(f.text)}</li>`).join('')}</ul>` : ''}
    ${state.followups.filter(f => !f.removedFromVisit).length ? `<h2>Seguimiento</h2><ul>${state.followups.filter(f => !f.removedFromVisit).map(f => `<li>${KIND_LABEL[f.kind]}${f.category ? ' · ' + esc(f.category) : ''} · <strong>${esc(f.state)}</strong>${f.dueDate ? ' · ' + fmtDate(f.dueDate) : ''}<br>${esc(f.text)}</li>`).join('')}</ul>` : ''}
    <h2>Fotografías (${state.photos.length})</h2>
    <div class="vc-photos vc-photos--compact">${state.photos.map((p, i) => `<figure class="vc-photo">${p.blob ? `<img alt="" data-photo-img="${esc(p.id)}">` : '<div class="vc-photo__missing">No disponible</div>'}
      <figcaption><span class="vc-tag">${esc(BACKUP_STATES[p.backupState])}</span>${p.blob ? `<button class="vc-link" type="button" data-export-photo="${esc(p.id)}" data-n="${i + 1}">Original</button><button class="vc-link" type="button" data-export-label="${esc(p.id)}" data-n="${i + 1}">Rotulada</button>` : ''}</figcaption></figure>`).join('')}</div>
    ${v.masterSnapshot ? `<p class="vc-muted">Datos del Maestro registrados: generación ${esc(v.masterSnapshot.dataVersion)} (${fmtDate(v.masterSnapshot.takenAt)})${v.masterSnapshot.gisVersion ? ` · GIS ${esc(v.masterSnapshot.gisVersion)}` : ''}.</p>` : ''}
    ${v.revisions?.length ? `<p class="vc-muted">${v.revisions.length} revisión${v.revisions.length > 1 ? 'es' : ''} después del cierre; la última el ${fmtDateTime(v.revisions.at(-1).at)}.</p>` : ''}
    <div class="vc-actions"><a class="vc-btn" href="#/visita/${esc(v.id)}">Editar</a>${state.photos.some(p => p.blob) ? '<button class="vc-btn" type="button" data-export-all>Exportar fotos rotuladas</button>' : ''}<a class="vc-btn" href="#/visitas">Volver</a></div></article>`;
  for (const img of $$('[data-photo-img]')) { const p = state.photos.find(x => x.id === img.dataset.photoImg); if (p?.blob) { img.src = URL.createObjectURL(p.blob); img.onload = () => URL.revokeObjectURL(img.src); } }
  view().addEventListener('click', e => onDetailAction(e, v));
}
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const safeName = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
async function onDetailAction(e, v) {
  const t = e.target, recFor = p => v.masterSnapshot?.records.find(r => r.key === p.lotKey) || null;
  const base = n => `Visita_${safeName(v.producer?.name)}_${fileDate(new Date(v.startedAt))}_Foto_${String(n).padStart(2, '0')}`;
  if (t.dataset.exportPhoto) { const p = state.photos.find(x => x.id === t.dataset.exportPhoto); download(p.blob, `${base(t.dataset.n)}.${photoExtension(p)}`); }
  if (t.dataset.exportLabel) await busy(async () => { const p = state.photos.find(x => x.id === t.dataset.exportLabel); download(await labeledCopy(p, {...v, reasonLabel: reasonLabel(v.reason)}, recFor(p), Number(t.dataset.n), state.photos.length), `${base(t.dataset.n)}_rotulada.png`); });
  if ('exportAll' in t.dataset) await busy(async () => {
    const {createStoredZip} = await import('./zip.js'); const entries = [];
    const list = state.photos.filter(p => p.blob);
    for (const [i, p] of list.entries()) entries.push({name: `${base(i + 1)}_rotulada.png`, blob: await labeledCopy(p, {...v, reasonLabel: reasonLabel(v.reason)}, recFor(p), i + 1, list.length)});
    download(await createStoredZip(entries), `Visita_${safeName(v.producer?.name)}_${fileDate(new Date(v.startedAt))}_fotos.zip`);
  });
}

/* ---------- Mis visitas ---------- */
async function viewList() {
  const visits = (await store.all('visits')).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  view().innerHTML = `<section class="vc-card"><h1>Mis visitas</h1>
    <label class="vc-field"><span>Buscar por productor, código o motivo</span><input type="search" id="listQuery" data-casur-query></label>
    <div id="visitList">${visits.map(visitRow).join('') || '<p class="vc-muted">Sin visitas registradas en este teléfono.</p>'}</div></section>`;
  $('#listQuery').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    $('#visitList').innerHTML = visits.filter(v => !q || `${v.producer?.name} ${v.producer?.code} ${reasonLabel(v.reason)}`.toLowerCase().includes(q)).map(visitRow).join('') || '<p class="vc-muted">Sin coincidencias.</p>';
  });
}

/* ---------- Seguimiento inicial ---------- */
async function viewFollowups() {
  const all = (await store.all('followups')).filter(f => !f.removedFromVisit).sort((a, b) => (a.dueDate || '9').localeCompare(b.dueDate || '9'));
  const render = filter => all.filter(f => filter === 'abiertos' ? OPEN_STATES.has(f.state) : filter === 'todos' || f.kind === filter).map(f => `<div class="vc-item" data-fu="${esc(f.id)}">
      <p><strong>${KIND_LABEL[f.kind]}${f.category ? ' · ' + esc(f.category) : ''}</strong> · ${esc(f.producerName)}${f.lotKey ? ' · Suerte ' + esc(f.lotKey.split('|')[1]) : ''}</p>
      <p>${esc(f.text) || '<span class="vc-muted">Sin descripción</span>'}</p>
      <p class="vc-muted">${f.priority ? 'Prioridad ' + esc(f.priority) + ' · ' : ''}${f.responsible ? 'Responsable ' + esc(f.responsible) + ' · ' : ''}${f.dueDate ? 'Compromiso ' + fmtDate(f.dueDate) : 'Sin fecha'}</p>
      <div class="vc-grid"><label class="vc-field"><span>Estado</span><select data-fu-state="${esc(f.id)}">${STATES[f.kind].map(s => `<option ${s === f.state ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <label class="vc-field"><span>Nota del cambio</span><input type="text" data-fu-note="${esc(f.id)}" placeholder="Qué se hizo o se verificó"></label></div>
      <button class="vc-btn vc-btn--small" type="button" data-fu-apply="${esc(f.id)}">Registrar cambio</button>
      <details><summary>Historial (${f.history.length})</summary><ul>${f.history.map(h => `<li>${fmtDateTime(h.at)} · ${esc(h.state)}${h.note ? ' · ' + esc(h.note) : ''}${h.by ? ' · ' + esc(h.by) : ''}</li>`).join('')}</ul></details>
      <a class="vc-link" href="#/ver/${esc(f.visitId)}">Ver visita</a></div>`).join('') || '<p class="vc-muted">Sin registros.</p>';
  view().innerHTML = `<section class="vc-card"><h1>Seguimiento</h1>
    <p class="vc-muted">Una recomendación no es una labor ejecutada y una solicitud no es una entrega. No se generan registros SIAGRI, órdenes ni entregas.</p>
    <div class="vc-tabs" role="tablist">${['abiertos', 'recomendacion', 'solicitud', 'compromiso', 'todos'].map((k, i) => `<button type="button" role="tab" data-filter="${k}" aria-selected="${i === 0}">${({abiertos: 'Abiertos', todos: 'Todos'})[k] || KIND_LABEL[k] + 'es'}</button>`).join('')}</div>
    <div id="fuList">${render('abiertos')}</div></section>`;
  view().addEventListener('click', async e => {
    const tab = e.target.closest('[data-filter]');
    if (tab) { $$('[data-filter]').forEach(x => x.setAttribute('aria-selected', String(x === tab))); $('#fuList').innerHTML = render(tab.dataset.filter); return; }
    const id = e.target.dataset.fuApply; if (!id) return;
    const next = $(`[data-fu-state="${id}"]`).value, note = $(`[data-fu-note="${id}"]`).value.trim(), author = await store.getSetting('author', '');
    const saved = await store.update('followups', id, cur => cur.state === next && !note ? null : {...cur, state: next, updatedAt: new Date().toISOString(), rev: (cur.rev || 1) + 1,
      history: [...cur.history, {state: next, at: new Date().toISOString(), note, by: author}]});
    if (saved) { Object.assign(all.find(f => f.id === id), saved); toast('Seguimiento actualizado.'); $('#fuList').innerHTML = render($('[data-filter][aria-selected="true"]').dataset.filter); }
  });
}

/* ---------- Datos y respaldos ---------- */
async function viewData() {
  const [photos, backups, storage, visits] = await Promise.all([store.all('photos'), store.all('backups'), store.storageState(), store.all('visits')]);
  const counts = Object.fromEntries(Object.keys(BACKUP_STATES).map(k => [k, photos.filter(p => p.backupState === k).length]));
  const pendingBytes = photos.filter(p => p.blob && p.backupState !== 'confirmada').reduce((s, p) => s + p.size, 0);
  view().innerHTML = `<section class="vc-card"><h1>Datos y respaldos</h1>
      <p>${visits.length} visitas · ${photos.length} fotos · ${mb(storage.usage)} usados${storage.quota ? ` de ${mb(storage.quota)}` : ''}</p>
      <p class="vc-muted">${storage.persisted ? 'Almacenamiento persistente concedido.' : 'Almacenamiento persistente no concedido: el navegador podría liberar espacio si el teléfono se queda sin memoria.'}</p>
      ${storage.persisted ? '' : '<button class="vc-btn" type="button" data-action="persist">Solicitar almacenamiento persistente</button>'}
      <ul class="vc-states">${Object.entries(BACKUP_STATES).map(([k, l]) => `<li><span>${l}</span><strong>${counts[k]}</strong></li>`).join('')}</ul>
      <p class="vc-note">Las fotos nunca se borran automáticamente del teléfono, aunque tengan respaldo confirmado.</p></section>
    <section class="vc-card"><h2>Exportar respaldo</h2>
      <p>Pendientes: ${mb(pendingBytes)}. Los respaldos grandes se dividen en partes de hasta ${mb(partLimitBytes())} según la memoria de este teléfono.</p>
      <div class="vc-actions"><button class="vc-btn vc-btn--primary" type="button" data-action="backup" value="pending">Exportar pendientes</button><button class="vc-btn" type="button" data-action="backup" value="all">Exportar todo</button></div>
      <p class="vc-muted">Guardá los archivos en la computadora o en OneDrive empresarial y después confirmá el respaldo.</p></section>
    <section class="vc-card"><h2>Respaldos exportados</h2>${backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(b => `<div class="vc-row"><span class="vc-row__main"><strong>${fmtDateTime(b.createdAt)}</strong><span>${b.parts.length} parte${b.parts.length > 1 ? 's' : ''} · ${b.parts.reduce((s, p) => s + p.photoIds.length, 0)} fotos · ${mb(b.parts.reduce((s, p) => s + p.bytes, 0))}</span></span>
      <span class="vc-row__side">${b.confirmedAt ? `<span class="vc-tag vc-tag--ok">Confirmado ${fmtDate(b.confirmedAt)}</span>` : `<button class="vc-btn vc-btn--small" type="button" data-action="confirm" value="${esc(b.id)}">Confirmar que lo guardé</button>`}</span></div>`).join('') || '<p class="vc-muted">Todavía no se exportó ningún respaldo.</p>'}</section>
    <section class="vc-card"><h2>Restaurar</h2><p>Elegí una o varias partes de un respaldo. Se verifica cada foto con su SHA-256; no se duplican registros ni se reemplazan los más recientes.</p>
      <label class="vc-btn"><input type="file" accept=".zip,application/zip" multiple data-action="restore" hidden>Elegir respaldo</label><div id="restoreReport" role="status"></div></section>`;
  view().addEventListener('click', onDataAction); view().addEventListener('change', onDataAction);
}
async function onDataAction(e) {
  const t = e.target.closest('[data-action]'); if (!t) return;
  const a = t.dataset.action;
  if (a === 'restore' && e.type === 'change') {
    const files = [...t.files]; if (!files.length) return;
    const report = await busy(() => restoreBackup(files));
    $('#restoreReport').innerHTML = `<div class="vc-note"><p><strong>Restauración terminada</strong> (${report.parts} parte${report.parts === 1 ? '' : 's'}).</p>
      <p>Visitas: ${report.visits.added} nuevas · ${report.visits.updated} actualizadas · ${report.visits.keptLocal} se conservaron las del teléfono.</p>
      <p>Seguimientos: ${report.followups.added} nuevos · ${report.followups.updated} actualizados · ${report.followups.keptLocal} conservados.</p>
      <p>Fotos: ${report.photos.restored} restauradas · ${report.photos.alreadyPresent} ya estaban · ${report.photos.unavailable} no incluidas en estas partes${report.photos.corrupt.length ? ` · <strong class="vc-warn">${report.photos.corrupt.length} dañadas (no se guardaron)</strong>` : ''}${report.photos.missing.length ? ` · ${report.photos.missing.length} faltantes` : ''}.</p>
      ${report.errors.length ? `<p class="vc-warn">${report.errors.map(esc).join('<br>')}</p>` : ''}</div>`;
    t.value = ''; return;
  }
  if (e.type !== 'click' || t.tagName === 'INPUT') return;
  if (a === 'persist') { const ok = await store.requestPersistence(); await store.setSetting('persistAsked', true); toast(ok ? 'Almacenamiento persistente concedido.' : 'El navegador no lo concedió. Seguí exportando respaldos.'); await viewData(); }
  if (a === 'backup') await busy(async () => {
    const backup = await buildBackup({scope: t.value, onProgress: p => toast(`Preparando parte ${p.part} de ${p.parts}…`)});
    for (const part of backup.parts) download(part.blob, part.name);
    await markExported(backup); toast(`Respaldo exportado en ${backup.parts.length} archivo${backup.parts.length > 1 ? 's' : ''}.`); await viewData();
  });
  if (a === 'confirm') { await confirmBackup(t.value); toast('Respaldo confirmado. Las fotos se conservan en el teléfono.'); await viewData(); }
}

/* ---------- Arranque ---------- */
async function boot() {
  $('#vcVersion').textContent = 'v' + VISITAS_VERSION;
  const status = $('#vcMaster');
  try { const {reader, resolution} = await maestro(); const v = reader.version(); status.textContent = `Maestro ${v.dataVersion}${resolution.effective === 'local' ? ' · local' : ''}`; }
  catch { status.textContent = 'Maestro no disponible sin conexión todavía'; }
  await route();
  window.CASUR_VISITAS_READY = true; document.dispatchEvent(new Event('casur-visitas-ready'));
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flush().catch(() => {}); });
window.addEventListener('pagehide', () => { void flush().catch(() => {}); });
void boot();
