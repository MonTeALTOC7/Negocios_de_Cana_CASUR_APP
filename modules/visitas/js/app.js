/* Visitas de Campo Productores de Caña · Negocios de Caña · CASUR.
   Local-first: datos propios en IndexedDB «casur-visitas»; Maestro Central y GIS de solo lectura; sin nube. */
import {protectModuleActivity} from '../../../core/updates/activity-guard.js';
import {icon} from './icons.js';
import {$, $$, esc, toast, confirmBox, releaseUrls} from './ui.js';
import * as store from './store.js';
import {maestro, refreshMaestro} from './maestro.js';
import {gps, onGps, startGps, stopGps, permissionState, GPS_LABEL} from './geo.js';
import * as M from './model.js';
import {view, viewHome, viewMap, viewCapture, viewFinding} from './views-main.js';
import {viewVisits, viewNewVisit, viewVisit, viewFollowupNew, viewFollowup, viewReports, viewReport, viewData} from './views-more.js';
import {viewProducers, viewProducer, viewLot, viewGestion, viewEvidence} from './views-dossier.js';

export const VISITAS_VERSION = '1.2.0';
protectModuleActivity(window);
const state = {routing: false};

/* ---------- Puente con la App Maestra y el SW: checkpoint antes de actualizar o salir ---------- */
window.CASUR_MODULE_BRIDGE = Object.freeze({
  protocolVersion: 1, moduleId: 'visitas',
  getActiveContext: () => ({route: location.hash}),
  async checkpoint() {
    if (document.body.getAttribute('aria-busy') === 'true' || gps._pending) return {ok: false, status: 'operation-active'};   // foto o GPS en curso
    try { await view.flush?.(); return {ok: true, status: 'saved'}; } catch { return {ok: false, status: 'save-failed'}; }
  },
});

/* ---------- Navegación (centrada en el productor; el mapa es una herramienta transversal) ----------
   Móvil: Inicio · Productores · [Registrar] · Gestión · Más. Escritorio: barra lateral agrupada Trabajo / Consultas / Sistema. */
const NAV = [['inicio', 'home', 'Inicio'], ['productores', 'users', 'Productores'], ['registrar', 'plus', 'Registrar'], ['gestion', 'gestion', 'Gestión'], ['mas', 'more', 'Más']];
const MORE = [['mapa', 'map', 'Mapa', 'Fincas y suertes, ubicación y hallazgos georreferenciados'], ['evidencias', 'evidence', 'Evidencias', 'Fotografías por productor, suerte y etapa'],
  ['visitas', 'calendar', 'Mis visitas', 'Visitas registradas y en curso'], ['nueva', 'plus', 'Nueva visita', 'Desde la oficina o retrospectiva'],
  ['informes', 'report', 'Informes', 'Informes técnicos, Excel y GeoJSON'], ['datos', 'settings', 'Datos y respaldos', 'Configuración, respaldos y restauración']];
const DESK = [['Consultas', MORE.filter(m => ['mapa', 'evidencias', 'visitas', 'informes'].includes(m[0]))], ['Sistema', MORE.filter(m => m[0] === 'datos')]];
function renderNav() {
  $('#nav').innerHTML = `<p class="vc-nav__group">Trabajo</p>` + NAV.map(([id, ic, label]) => id === 'registrar'
    ? `<a class="vc-fab" href="#/registrar" data-r="registrar" aria-label="Registrar"><span class="vc-fab__circle">${icon(ic)}</span><span class="vc-fab__label">${label}</span></a>`
    : id === 'mas' ? `<button type="button" class="vc-nav__more-only" data-more>${icon(ic)}${label}</button>`
    : `<a href="#/${id}" data-r="${id}">${icon(ic)}${label}${id === 'gestion' ? '<span class="vc-badge" data-badge hidden></span>' : ''}</a>`).join('')
    + DESK.map(([g, items]) => `<p class="vc-nav__group">${g}</p>` + items.map(([id, ic, label]) => `<a class="vc-nav__desk" href="#/${id}" data-r="${id}">${icon(ic)}${label}</a>`).join('')).join('');
}
function more() {
  const s = document.createElement('div'); s.className = 'vc-sheet';
  s.innerHTML = `<div class="vc-sheet__scrim" data-close></div><section class="vc-sheet__panel" role="dialog" aria-modal="true" aria-label="Más"><header class="vc-sheet__head"><span class="vc-sheet__grip"></span><h2>Más</h2><button class="vc-icon-btn" type="button" data-close aria-label="Cerrar">${icon('x')}</button></header>
    <div class="vc-sheet__body"><div class="vc-list">${MORE.map(([r, ic, t, sub]) => `<a class="vc-item" href="#/${r}" data-close><span class="vc-item__ic">${icon(ic)}</span><span class="vc-item__body"><span class="vc-item__title">${t}</span><span class="vc-item__sub">${sub}</span></span>${icon('chevron')}</a>`).join('')}</div></div></section>`;
  document.body.append(s); document.body.classList.add('vc-locked');
  s.addEventListener('click', e => { if (e.target.closest('[data-close]')) { s.remove(); document.body.classList.remove('vc-locked'); } });
}
/** Insignia de Gestión: compromisos y recomendaciones vencidos (lo que exige acción), no el total de registros. */
async function updateBadge() {
  const n = (await store.all('followups')).filter(f => !f.removedFromVisit && M.isOverdue(f)).length, b = $('[data-badge]');
  if (b) { b.hidden = !n; b.textContent = n > 99 ? '99+' : n; b.title = `${n} vencido${n === 1 ? '' : 's'}`; }
}

/* ---------- Rutas ---------- */
const go = hash => { history.replaceState(null, '', hash); state.again = true; };
const ROUTES = {
  inicio: () => viewHome(), mapa: (_, p) => viewMap(p), registrar: (_, p) => viewCapture(p), hallazgo: id => viewFinding(id),
  productores: (_, p) => viewProducers(p), gestion: (_, p) => viewGestion(p), evidencias: (_, p) => viewEvidence(p), suerte: id => viewLot(decodeURIComponent(id)),
  bitacora: () => go('#/gestion?k=hallazgos'),   // rutas anteriores (enlaces guardados) se redirigen sin perder nada
  visitas: () => viewVisits(), nueva: (_, p) => viewNewVisit(p), visita: id => viewVisit(id),
  seguimiento: (id, p) => id === 'nuevo' ? viewFollowupNew(p) : id ? viewFollowup(id) : go('#/gestion?k=' + (p.get('k') || 'recomendacion')),
  productor: (id, p) => viewProducer(id, p), informes: () => viewReports(), informe: (id, p, rest) => viewReport(id, rest), datos: () => viewData(),
};
async function route() {
  if (state.stay) { state.stay = false; return; }   // regreso tras «Quedarme»: la vista y el formulario siguen intactos
  if (state.routing) { state.again = true; return; }   // navegación durante otra: se atiende al terminar (nunca se descarta)
  state.routing = true;
  try {
    // Nada se descarta en silencio: si el guardado pendiente falla, se avisa y la copia de emergencia se conserva.
    try { await view.flush?.(); } catch (e) {
      const leave = await confirmBox('No se pudieron guardar los últimos cambios. Quedó una copia de emergencia en este teléfono. ¿Salir de todos modos?', {ok: 'Salir', cancel: 'Quedarme'});
      if (!leave) { state.stay = true; history.back(); return; }
    }
    releaseUrls();
    const [path, query = ''] = (location.hash.replace(/^#\/?/, '') || 'inicio').split('?'), [name, id, rest] = path.split('/'), params = new URLSearchParams(query);
    const active = {visita: 'visitas', nueva: 'visitas', hallazgo: 'gestion', seguimiento: 'gestion', bitacora: 'gestion', informe: 'informes', productor: 'productores', suerte: 'productores'}[name] || name;
    $$('#nav [data-r]').forEach(a => { if (a.dataset.r === active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    try { await (ROUTES[name] || ROUTES.inicio)(id, params, rest); }
    catch (e) { const el = $('#view'); el.className = 'vc-main'; el.innerHTML = `<section class="vc-card" role="alert"><h2>No se pudo abrir esta pantalla</h2><p class="vc-muted" style="margin:6px 0 12px">${esc(e.message)}</p><a class="vc-btn" href="#/inicio">Volver al inicio</a></section>`; }
    window.scrollTo(0, 0); void updateBadge();
  } finally { state.routing = false; if (state.again) { state.again = false; void route(); } }
}
window.addEventListener('hashchange', route);

/* ---------- Estado GPS en la cabecera ---------- */
async function gpsChip() {
  const chip = $('#gpsChip'); if (!chip) return;
  chip.dataset.s = gps.state;
  let text = GPS_LABEL[gps.state];
  if (gps.state === 'confiable' && gps.detected) { const {byLotCode} = await maestro().catch(() => ({byLotCode: new Map()})); const r = byLotCode.get(gps.detected.lotId); if (r) text = `${r.farm.name} · ${r.identity.lot}`; }
  else if (gps.fix && ['aproximada', 'fuera'].includes(gps.state)) text += ` · ±${gps.fix.accuracy} m`;
  chip.innerHTML = `<span class="dot"></span><span>${esc(text)}</span>`;
  chip.title = gps.error || text;
}
/* El GPS solo corre con la app visible (batería). Si el permiso ya fue concedido, arranca solo. */
async function autoGps() {
  if (!(await store.getSetting('gpsAuto', true))) return;
  if (await permissionState() === 'granted') startGps();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { void view.flush?.().catch(() => {}); if (gps.watchId !== null) { stopGps(true); gps._resume = true; } }
  else { if (gps._resume) { gps._resume = false; startGps(); } void refreshMaestro().then(changed => changed && toast('Maestro actualizado: las visitas nuevas usarán la generación vigente')); }
});
window.addEventListener('pagehide', () => { void view.flush?.().catch(() => {}); });
window.addEventListener('beforeunload', e => { if (store.listPending().length) { e.preventDefault(); e.returnValue = ''; } });

/* Otra pestaña cambió un registro: se actualiza la vista si no hay edición en curso aquí. */
store.onExternalChange(() => { if (!document.activeElement?.closest?.('[data-autosave]') && !$('.vc-sheet') && !$('.vc-lightbox')) void route(); });

/* ---------- Arranque ---------- */
async function boot() {
  renderNav();
  $('#nav').addEventListener('click', e => { if (e.target.closest('[data-more]')) more(); });
  $('#gpsChip').addEventListener('click', () => { if (gps.state === 'apagado' || gps.state === 'sin-senal') startGps(); else location.hash = '#/mapa'; });
  document.addEventListener('visitas-offline', e => { const o = $('#vcOffline'); if (o) { o.hidden = false; o.textContent = e.detail.text; o.dataset.result = e.detail.result; } });
  onGps(() => void gpsChip());
  await store.openStore();
  await M.loadTarget();
  // Copias de emergencia de formularios no guardados (p. ej. fallo de almacenamiento): se ofrecen al volver.
  const pending = store.listPending();
  if (pending.length) toast(`Hay ${pending.length} cambio${pending.length > 1 ? 's' : ''} sin guardar de la sesión anterior`, {actions: [{label: 'Recuperar', run: () => recoverPending(pending)}]});
  try { const {reader, resolution} = await maestro(); $('#vcMaster').textContent = `Maestro ${reader.version().dataVersion}${resolution.effective === 'local' ? ' · local' : ''}`; }
  catch { $('#vcMaster').textContent = 'Maestro no disponible sin conexión todavía'; }
  void autoGps();
  await route();
  window.CASUR_VISITAS_READY = true; document.dispatchEvent(new Event('casur-visitas-ready'));
}
async function recoverPending(ids) {
  let ok = 0;
  for (const id of ids) {
    const p = store.readPending(id); if (!p?.data) { store.clearPending(id); continue; }
    try { const cur = await store.get('findings', id); if (cur) { await M.saveFinding({...cur, ...p.data}, cur.rev); store.clearPending(id); ok++; } else store.clearPending(id); }
    catch (e) { toast('No se pudo recuperar: ' + e.message, {kind: 'error'}); }
  }
  if (ok) { toast(`${ok} cambio${ok > 1 ? 's' : ''} recuperado${ok > 1 ? 's' : ''}`); await route(); }
}
$('#vcVersion').textContent = 'v' + VISITAS_VERSION;
void boot();
