/* ============================================================
   app.js — Orquestador del shell "Negocios de Caña CASUR".
   Renderiza las vistas y coordina router, registro, gate,
   estado y Service Worker. Carga cada módulo en un <iframe>
   aislado (no ejecuta su Service Worker; solo el SW raíz).
   ============================================================ */

import * as router from './core/navigation/router.js';
import * as registry from './core/module-registry/registry.js';
import * as gate from './core/permissions/gate.js';
import * as status from './core/sync/status.js';
import { APP_VERSION, APP_CHANNEL, moduleVersion, moduleStatus } from './core/versions/versions.js';
import { icon } from './shared/components/icons.js';
import * as masterStore from './core/shared-data/master-store.js';
import { adaptSiagriToProduction } from './master/adapters/production-data-adapter.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

const app = $('#app');
const viewEl = $('#view');
const navEl = $('#nav');

/* Mini-logos (isotipos) por módulo para las tarjetas del home.
   Familia gráfica coherente del ecosistema "Negocios de Caña".
   Los 5 primeros son SVG propios; Inventario reutiliza el emblema
   oficial de Pansaco reenmarcado a la familia. */
const MODULE_LOGOS = {
  produccion: 'shared/assets/logos/produccion.svg',
  tch:        'shared/assets/logos/tch.svg',
  riego:      'shared/assets/logos/riego.svg',
  insumos:    'shared/assets/logos/insumos.svg',
  inventario: 'shared/assets/logos/inventario.png',
  labores:    'shared/assets/logos/labores.svg',
};
function logoFor(id) { return MODULE_LOGOS[id] || 'shared/assets/icons/emblem-192.png'; }

/* ---------------- Header ---------------- */
function renderHeader() {
  $('#appVersion').textContent = 'v' + APP_VERSION;
  updateConn(status.isOnline());
}
function updateConn(online) {
  const c = $('#conn');
  c.classList.toggle('is-offline', !online);
  c.querySelector('.conn__label').textContent = online ? 'En línea' : 'Sin conexión';
  c.querySelector('.conn__ic').innerHTML = icon(online ? 'wifi' : 'wifiOff');
}
status.onConnectivityChange(updateConn);

/* ---------------- Bottom nav ---------------- */
function renderNav(active) {
  // El acceso al área privada NO aparece en la navegación normal:
  // se entra desde Centro Maestro, para que otros usuarios ni lo vean.
  const items = [
    { key: 'home', label: 'Inicio', icon: 'home', path: '/' },
    { key: 'centro-maestro', label: 'Centro Maestro', icon: 'master', path: '/centro-maestro' },
  ];
  navEl.innerHTML = '';
  items.forEach((it) => {
    const b = el(`<button class="nav__item ${active === it.key ? 'is-active' : ''}" type="button">
        ${icon(it.icon)}<span>${it.label}</span></button>`);
    b.addEventListener('click', () => router.go(it.path));
    navEl.appendChild(b);
  });
}

/* ============================================================
   Instalación centralizada de la PWA maestra "Negocios de Caña".
   Toda la lógica de instalación vive en el shell (nunca en los
   módulos/iframes). Captura beforeinstallprompt/appinstalled y
   muestra un banner elegante en el Home con reglas de visibilidad
   y persistencia local con namespace del shell.
   ============================================================ */
const INSTALL_KEYS = {
  installed: 'casur_master_installed',
  dismissed: 'casur_master_install_dismissed',
};
const INSTALL_DISMISS_MS = 7 * 24 * 60 * 60 * 1000; /* respetar cierre 7 días */
let deferredInstallPrompt = null;

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

function isAppInstalled() {
  if (lsGet(INSTALL_KEYS.installed) === '1') return true;
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
  if (window.navigator.standalone === true) return true; /* iOS Safari */
  return false;
}
function installDismissedRecently() {
  const t = Number(lsGet(INSTALL_KEYS.dismissed) || 0);
  return t > 0 && (Date.now() - t) < INSTALL_DISMISS_MS;
}
function canShowInstall() {
  return !!deferredInstallPrompt && !isAppInstalled() && !installDismissedRecently();
}

function installBannerHTML() {
  return `<div class="install-card" id="installCard" role="region" aria-label="Instalar Negocios de Caña CASUR">
      <span class="install-card__glow" aria-hidden="true"></span>
      <span class="install-card__flash" aria-hidden="true"></span>
      <span class="install-card__icon"><img src="shared/assets/icons/icon-192.png" alt="" width="52" height="52"></span>
      <span class="install-card__copy">
        <b class="install-card__title">Instalar Negocios de Caña</b>
        <small class="install-card__sub">Lleva la app en tu teléfono o PC</small>
      </span>
      <button class="install-card__cta" id="installCta" type="button">Instalar ahora</button>
      <button class="install-card__close" id="installClose" type="button" aria-label="Descartar invitación">×</button>
    </div>`;
}
function mountInstallBanner() {
  const slot = $('#installSlot');
  if (!slot) return; /* solo existe en el Home */
  if (!canShowInstall()) { slot.innerHTML = ''; return; }
  slot.innerHTML = installBannerHTML();
  $('#installCta', slot).addEventListener('click', doInstall);
  $('#installClose', slot).addEventListener('click', dismissInstall);
  requestAnimationFrame(() => $('#installCard', slot)?.classList.add('is-in'));
}
function hideInstallBanner() {
  const card = $('#installCard');
  const slot = $('#installSlot');
  if (card) {
    card.classList.remove('is-in'); card.classList.add('is-out');
    setTimeout(() => { if (slot) slot.innerHTML = ''; }, 280);
  } else if (slot) { slot.innerHTML = ''; }
}
async function doInstall() {
  const promptEvent = deferredInstallPrompt;
  if (!promptEvent) return;
  deferredInstallPrompt = null;
  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice && choice.outcome === 'accepted') lsSet(INSTALL_KEYS.installed, '1');
  } catch {}
  hideInstallBanner();
}
function dismissInstall() {
  lsSet(INSTALL_KEYS.dismissed, String(Date.now()));
  hideInstallBanner();
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  mountInstallBanner(); /* re-evalúa si el Home ya está visible */
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  lsSet(INSTALL_KEYS.installed, '1');
  hideInstallBanner();
});

/* ---------- Generar paquete datos GitHub desde Centro Maestro ---------- */
/* Carga Producción en un iframe oculto same-origin, espera a que:
   1) consuma produccion_current (overlay → bridge → CRONO_DATA)
   2) sincronice CASUR_RELEASE
   3) CASUR_GENERATE_GITHUB_DATA_PACKAGE esté disponible
   y entonces ejecuta la descarga. Si Producción ya está visible en #mFrame,
   la usa directamente. Reutiliza el generador de Producción sin duplicar lógica. */
async function generateGitHubPackageFromCentro() {
  /* ¿Ya hay un iframe de Producción visible? */
  const visible = $('#mFrame');
  if (visible) {
    try {
      const fw = visible.contentWindow;
      if (fw && typeof fw.CASUR_GENERATE_GITHUB_DATA_PACKAGE === 'function') {
        await fw.CASUR_GENERATE_GITHUB_DATA_PACKAGE();
        return;
      }
    } catch (_) { /* cross-origin o no cargado: caer al flujo con iframe oculto */ }
  }

  toast('Preparando paquete de datos…');
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
  iframe.src = 'modules/produccion/index.html';
  document.body.appendChild(iframe);

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Tiempo de espera agotado cargando Producción.')), 30000);
      iframe.addEventListener('load', () => {
        /* Esperar a que el bridge aplique y la API esté lista */
        let checks = 0;
        const poll = setInterval(() => {
          checks++;
          try {
            const w = iframe.contentWindow;
            if (w && typeof w.CASUR_GENERATE_GITHUB_DATA_PACKAGE === 'function' && w.CRONO_DATA && w.CRONO_DATA.global) {
              clearInterval(poll); clearTimeout(timeout); resolve();
            }
          } catch (_) { /* todavía cargando */ }
          if (checks > 120) { clearInterval(poll); clearTimeout(timeout); reject(new Error('Producción no inicializó la API de paquete.')); }
        }, 250);
      });
      iframe.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('No se pudo cargar Producción.')); });
    });

    await iframe.contentWindow.CASUR_GENERATE_GITHUB_DATA_PACKAGE();
  } catch (err) {
    toast('Error: ' + (err.message || err));
  } finally {
    setTimeout(() => { try { iframe.remove(); } catch (_) {} }, 2000);
  }
}

/* ---------------- Vista: HOME ---------------- */
function viewHome() {
  const mods = registry.homeModules();
  const view = el(`<div class="view">
    <header class="masthead">
      <div class="masthead__brandrow">
        <img class="masthead__logo" src="shared/assets/brand/casur-logo.png"
             alt="CASUR · Compañía Azucarera del Sur, S.A." width="220" height="84">
        <span class="emct" title="Edgardo Madrigal · Carlos Tijerino · Desarrollo">
          <span class="emct__dot"></span>EM-CT</span>
      </div>
      <p class="masthead__eyebrow">Compañía Azucarera del Sur, S.A.</p>
      <h1 class="masthead__title">Negocios de Caña CASUR</h1>
      <p class="masthead__desc">Todos los sistemas de campo en una sola app. Elige un módulo para comenzar.</p>
    </header>
    <div class="install-slot" id="installSlot"></div>
    <div class="modules" id="mods"></div>
  </div>`);
  const grid = $('#mods', view);

  mods.forEach((m) => {
    const online = status.isOnline();
    let chip;
    if (m.usesSupabase) {
      chip = online
        ? `<span class="chip is-online"><span class="chip__dot"></span>Requiere conexión</span>`
        : `<span class="chip is-offline"><span class="chip__dot"></span>Sin conexión</span>`;
    } else {
      chip = `<span class="chip is-local"><span class="chip__dot"></span>Local · offline</span>`;
    }
    const card = el(`<button class="mod-card" type="button" style="--accent:${m.accent}">
        <span class="mod-card__tile"><img class="mod-card__logo" src="${logoFor(m.moduleId)}" alt="" loading="lazy" width="60" height="60"></span>
        <span class="mod-card__body">
          <span class="mod-card__name">${m.name}</span>
          <span class="mod-card__meta">
            <span>${m.desc}</span>
            ${chip}
            <span class="chip"><span class="chip__dot"></span>${m.version}</span>
          </span>
        </span>
        <span class="mod-card__go">${icon('chevron')}</span>
      </button>`);
    card.addEventListener('click', () => router.go('/modulo/' + m.moduleId));
    grid.appendChild(card);
  });

  swap(view);
  renderNav('home');
  mountInstallBanner();
}

/* ---------------- Vista: MÓDULO (iframe) ---------------- */
function viewModule(id) {
  const m = registry.byId(id);
  if (!m) { router.home(); return; }

  // Guardas: privado requiere desbloqueo; desactivado no entra.
  if (m.privacy === 'private' && !gate.isUnlocked()) { router.go('/privado/' + id); return; }
  if (!m.enabled) { router.home(); return; }

  const host = el(`<div class="module-host view">
      <div class="module-host__bar">
        <button class="icon-btn" id="mBack" type="button" aria-label="Volver">${icon('back')}</button>
        <span class="module-host__title">${m.name}</span>
        <span class="module-host__spacer"></span>
        <button class="icon-btn" id="mReload" type="button" aria-label="Recargar módulo">${icon('refresh')}</button>
      </div>
      <iframe class="module-host__frame" id="mFrame"
              src="${m.route}"
              title="${m.name}"
              allow="camera; geolocation; clipboard-read; clipboard-write; fullscreen"
              referrerpolicy="no-referrer"></iframe>
    </div>`);

  // Ocultamos header/nav del shell mientras un módulo ocupa toda la pantalla.
  document.body.classList.add('in-module');
  viewEl.innerHTML = '';
  viewEl.appendChild(host);

  $('#mBack', host).addEventListener('click', () => router.home());
  $('#mReload', host).addEventListener('click', () => {
    const f = $('#mFrame', host); f.src = f.src;
  });
}

/* ---------------- Vista: CENTRO MAESTRO ---------------- */
async function viewCentroMaestro() {
  const mods = registry.all();
  const view = el(`<div class="view panel">
      <div class="panel__top">
        <div>
          <h1 class="panel__title">Centro Maestro</h1>
          <p class="panel__note">Administración de módulos, estado del sistema y datos.</p>
        </div>
        <button class="btn" id="centroLock" type="button">${icon('lock')} Bloquear</button>
      </div>

      <section class="card">
        <div class="card__head"><span class="card__title">Módulos</span>
          <span class="chip"><span class="chip__dot"></span>${mods.length} registrados</span></div>
        <div id="mrows"></div>
      </section>

      <section class="card">
        <div class="card__head"><span class="card__title">Estado</span></div>
        <div class="stat-grid" id="stats"></div>
      </section>

      <section class="card">
        <div class="card__head"><span class="card__title">Gestión de datos</span></div>
        <p class="panel__note">Cada módulo conserva su propia forma de importar y actualizar datos
        (principio: <strong>primero preservar, después centralizar</strong>). El Convertidor SIAGRI
        se administra desde aquí.</p>
        <div style="margin-top:12px; display:flex; gap:12px; flex-wrap:wrap">
          <button class="btn" id="openConv" type="button">${icon('siagri')} Administrador SIAGRI</button>
          <button class="btn" id="openPriv" type="button">${icon('lock')} Área privada</button>
        </div>
      </section>

      <section class="card">
        <div class="card__head"><span class="card__title">Maestro de datos · SIAGRI → Suertes</span></div>
        <p class="panel__note">Reutiliza el dataset ya validado en Administrador SIAGRI (sin volver a cargar el
        Excel) para actualizar <strong>Maestro de Suertes</strong>. El adaptador mapea al formato REPORTE y valida
        <strong>Sucuya = 0</strong>, llave Hac-Sue, duplicados e integridad antes de aplicar. El histórico no se destruye.</p>
        <div class="stat-grid" id="dataStatus" style="margin-top:10px"></div>
        <div style="margin-top:12px; display:flex; gap:12px; flex-wrap:wrap">
          <button class="btn btn-green" id="updateProduccion" type="button">Actualizar Maestro de Suertes</button>
          <button class="btn" id="genPackage" type="button">Generar paquete datos GitHub</button>
        </div>
        <p class="panel__note" style="margin-top:8px; opacity:.8">El paquete de datos (cronologico/historico/version)
        lo genera el propio Centro Maestro de Producción (botón «Paquete solo datos para GitHub»), ya con los datos
        aplicados. Versión de <em>datos</em> ≠ versión de <em>código</em> (VF54.6).</p>
      </section>

      <section class="card" id="pinCard"></section>

      <section class="card">
        <div class="card__head"><span class="card__title">Versiones</span></div>
        <div class="stat-grid" id="vers"></div>
      </section>
    </div>`);

  // --- Filas de módulos con interruptor y visibilidad ---
  const rows = $('#mrows', view);
  mods.forEach((m) => {
    const row = el(`<div class="mrow" style="--accent:${m.accent}">
        <span class="mrow__tile">${icon(m.icon)}</span>
        <span class="mrow__body">
          <span class="mrow__name">${m.name}</span>
          <span class="mrow__meta">${m.privacy} · ${m.version} · ${m.requiresOnline ? 'requiere red' : 'offline'}${m.usesSupabase ? ' · Supabase' : ''} · ${moduleStatus(m.moduleId)}</span>
        </span>
        <label class="switch" title="Activar módulo">
          <input type="checkbox" ${m.enabled ? 'checked' : ''}>
          <span class="switch__track"></span><span class="switch__thumb"></span>
        </label>
      </div>`);
    $('input', row).addEventListener('change', (e) => {
      registry.setOverride(m.moduleId, { enabled: e.target.checked });
    });
    rows.appendChild(row);
  });

  // --- Estado ---
  const est = await status.storageEstimate();
  const caches = await status.listCaches();
  $('#stats', view).innerHTML = `
    <div class="stat"><div class="stat__label">App Maestra</div><div class="stat__value">v${APP_VERSION}</div></div>
    <div class="stat"><div class="stat__label">Canal</div><div class="stat__value">${APP_CHANNEL}</div></div>
    <div class="stat"><div class="stat__label">Conectividad</div><div class="stat__value">${status.isOnline() ? 'En línea' : 'Offline'}</div></div>
    <div class="stat"><div class="stat__label">Almacenamiento</div><div class="stat__value">${est ? est.usageMB + ' MB' : '—'}</div></div>
    <div class="stat"><div class="stat__label">Cuota</div><div class="stat__value">${est ? est.quotaMB + ' MB' : '—'}</div></div>
    <div class="stat"><div class="stat__label">Uso</div><div class="stat__value">${est ? est.pct + ' %' : '—'}</div></div>
    <div class="stat"><div class="stat__label">Cachés</div><div class="stat__value">${caches.length}</div></div>
    <div class="stat"><div class="stat__label">Service Worker</div><div class="stat__value">${'serviceWorker' in navigator ? 'Activo' : 'N/D'}</div></div>`;

  // --- Versiones ---
  $('#vers', view).innerHTML = registry.all().map((m) =>
    `<div class="stat"><div class="stat__label">${m.name}</div><div class="stat__value">${m.version}</div></div>`
  ).join('');

  // --- Acciones ---
  $('#centroLock', view).addEventListener('click', () => { gate.centroLock(); router.home(); });
  $('#openConv', view).addEventListener('click', () => router.go('/modulo/convertidor'));
  $('#openPriv', view).addEventListener('click', () => router.go('/privado'));

  // --- Estado de datos maestros (SIAGRI → Suertes) ---
  renderDataStatus(view);
  $('#updateProduccion', view).addEventListener('click', () => updateProduccionFromSiagri());
  $('#genPackage', view).addEventListener('click', () => generateGitHubPackageFromCentro());

  // Tarjeta de PIN: SOLO permite cambiarlo si el área privada ya está
  // desbloqueada en esta sesión. Si está bloqueada, ofrece desbloquear.
  (function renderPinCard() {
    const card = $('#pinCard', view);
    if (gate.isUnlocked()) {
      card.innerHTML = `
        <div class="card__head"><span class="card__title">Seguridad del área privada</span>
          <span class="chip is-ok"><span class="chip__dot"></span>Desbloqueada</span></div>
        <p class="panel__note">Cambia el PIN de desbloqueo. Es solo una barrera de interfaz para
        evitar accesos accidentales de otros usuarios; el repositorio es público y el PIN no cifra datos.</p>
        <div class="dialog__row" style="margin-top:12px">
          <div class="field" style="flex:1">
            <label for="newPin">Nuevo PIN</label>
            <input id="newPin" inputmode="numeric" autocomplete="off" placeholder="••••">
          </div>
          <button class="btn btn--primary" id="savePin" type="button" style="align-self:end">Guardar</button>
        </div>`;
      $('#savePin', card).addEventListener('click', () => {
        const v = $('#newPin', card).value.trim();
        if (v.length >= 3) { gate.setPin(v); $('#newPin', card).value = ''; toast('PIN actualizado'); }
        else toast('El PIN debe tener al menos 3 dígitos');
      });
    } else {
      card.innerHTML = `
        <div class="card__head"><span class="card__title">Seguridad del área privada</span>
          <span class="chip is-offline"><span class="chip__dot"></span>Bloqueada</span></div>
        <p class="panel__note">Para cambiar el PIN primero debes desbloquear el área privada.</p>
        <button class="btn" id="unlockForPin" type="button" style="margin-top:12px">${icon('lock')} Desbloquear área privada</button>`;
      $('#unlockForPin', card).addEventListener('click', () => router.go('/privado'));
    }
  })();

  swap(view);
  renderNav('centro-maestro');
}

/* ---------------- Vista: PRIVADO (gate) ---------------- */
function viewPrivado(pendingModuleId) {
  if (!gate.isUnlocked()) { renderGate(pendingModuleId); return; }

  const privateMods = registry.all().filter((m) => m.privacy === 'private');
  const view = el(`<div class="view panel">
      <div>
        <h1 class="panel__title">Área privada</h1>
        <p class="panel__note">Datos económicos de conciliación. Visible solo para el propietario.</p>
      </div>
      <section class="card"><div id="privRows"></div></section>
      <button class="btn btn--block" id="lockBtn" type="button">${icon('lock')} Bloquear área privada</button>
    </div>`);

  const rows = $('#privRows', view);
  privateMods.forEach((m) => {
    const row = el(`<div class="mrow" style="--accent:${m.accent}">
        <span class="mrow__tile">${icon(m.icon)}</span>
        <span class="mrow__body"><span class="mrow__name">${m.name}</span>
          <span class="mrow__meta">${m.desc} · ${m.version}</span></span>
        <span class="mod-card__go">${icon('chevron')}</span>
      </div>`);
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => router.go('/modulo/' + m.moduleId));
    rows.appendChild(row);
  });

  $('#lockBtn', view).addEventListener('click', () => { gate.lock(); router.home(); });

  swap(view);
  renderNav('centro-maestro');
}

function renderGate(pendingModuleId) {
  const view = el(`<div class="view panel"><div>
      <h1 class="panel__title">Área privada</h1>
      <p class="panel__note">Introduce el PIN para desbloquear.</p></div></div>`);
  swap(view);
  renderNav('centro-maestro');

  const overlay = el(`<div class="overlay">
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="gTitle">
        <h2 class="dialog__title" id="gTitle">Desbloquear</h2>
        <p class="dialog__note">Este acceso es solo para el propietario (Carlos).</p>
        <div class="field">
          <label for="pin">PIN</label>
          <input id="pin" type="password" inputmode="numeric" autocomplete="off" placeholder="••••">
        </div>
        <p class="dialog__err" id="gErr"></p>
        <div class="dialog__row">
          <button class="btn btn--block" id="gCancel" type="button">Cancelar</button>
          <button class="btn btn--primary btn--block" id="gOk" type="button">Entrar</button>
        </div>
      </div></div>`);
  document.body.appendChild(overlay);
  const input = $('#pin', overlay);
  input.focus();

  const close = () => overlay.remove();
  const attempt = () => {
    if (gate.unlock(input.value)) {
      close();
      renderNav('centro-maestro');
      if (pendingModuleId) router.go('/modulo/' + pendingModuleId);
      else viewPrivado();
    } else {
      $('#gErr', overlay).textContent = 'PIN incorrecto.';
      input.select();
    }
  };
  $('#gOk', overlay).addEventListener('click', attempt);
  $('#gCancel', overlay).addEventListener('click', () => { close(); router.home(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') attempt(); });
}

/* ---------------- Utilidades de vista ---------------- */
function swap(view) {
  document.body.classList.remove('in-module');
  viewEl.innerHTML = '';
  viewEl.appendChild(view);
  window.scrollTo(0, 0);
}

let toastTimer = null;
function toast(msg, action) {
  const old = $('#toast'); if (old) old.remove();
  const t = el(`<div class="toast" id="toast"><span>${msg}</span></div>`);
  if (action) {
    const b = el(`<button class="btn btn--primary" type="button">${action.label}</button>`);
    b.addEventListener('click', action.onClick);
    t.appendChild(b);
  }
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  if (!action) toastTimer = setTimeout(() => t.remove(), 2600);
}

/* ---------------- Datos maestros: SIAGRI → Suertes ---------------- */
/* Lee el último dataset procesado por el Convertidor (puente no invasivo:
   el Convertidor lo persiste en casur_master_data/datasets/siagri_last). */
async function readSiagriBridge() {
  try {
    const db = await new Promise((res, rej) => {
      const q = indexedDB.open(masterStore.MASTER_STORE_INFO.DB_NAME, masterStore.MASTER_STORE_INFO.DB_VERSION);
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
    const rec = await new Promise((res) => {
      const tx = db.transaction(masterStore.MASTER_STORE_INFO.STORE, 'readonly');
      const r = tx.objectStore(masterStore.MASTER_STORE_INFO.STORE).get('siagri_last');
      r.onsuccess = () => res(r.result || null); r.onerror = () => res(null);
    });
    db.close();
    return rec ? rec.payload : null;
  } catch { return null; }
}

async function renderDataStatus(view) {
  const box = $('#dataStatus', view); if (!box) return;
  const prod = await masterStore.getProduccionStatus();
  const siagri = await readSiagriBridge();
  const fmt = (d) => d ? new Date(d).toLocaleDateString('es-NI') : '—';
  box.innerHTML = `
    <div class="stat"><div class="stat__label">Maestro SIAGRI (procesado)</div>
      <div class="stat__value">${siagri ? (siagri.records ? siagri.records.length : '—') + ' suertes' : 'Sin procesar'}</div></div>
    <div class="stat"><div class="stat__label">SIAGRI · fuente</div>
      <div class="stat__value">${siagri && siagri.meta ? (siagri.meta.source || 'SIAGRI') : '—'}</div></div>
    <div class="stat"><div class="stat__label">Maestro de Suertes · datos</div>
      <div class="stat__value">${prod.present ? (prod.dataVersion || 'aplicado') : 'Sin aplicar (usa data/*)'}</div></div>
    <div class="stat"><div class="stat__label">Aplicado</div>
      <div class="stat__value">${prod.present ? fmt(prod.savedAt) : '—'}</div></div>`;
}

async function baselineReportRows() {
  /* Segunda actualización en adelante: baseline = último produccion_current. */
  const prev = await masterStore.loadProduccionDataset();
  if (prev && prev.payload && Array.isArray(prev.payload.reportRows) && prev.payload.reportRows.length) {
    return prev.payload.reportRows;
  }
  /* Primera actualización: baseline = datos actualmente publicados en Producción
     (reutiliza su cronológico agregado; no reconstruye reglas). Evita "0 anteriores". */
  try {
    const res = await fetch('modules/produccion/data/cronologico.json', { cache: 'no-store' });
    const j = await res.json();
    const rows = [];
    (j.producers || []).forEach((p) => (p.details || []).forEach((d) => rows.push({
      'Hac-Sue': String(d.codLote || d.hhhsss || ((p.code || '') + '' + (d.suerte || ''))),
      Area: d.area,
      Variedad: d.variedad,
      '#_de_Corte': d.corte,
      'F. Siembra': d.fSiembra,
      'F. Ult. Cte': d.fUltCte,
      Destino: d.destino,
      Tenencia: d.tenencia,
      Tipo_de_Riego: d.tipoRiego,
      '#_de_Riegos': (d.numeroRiegos != null ? d.numeroRiegos : null),
      ZONA: d.zona,
      TCH_Z2526: (d.tch != null ? d.tch : null),
      Estado: (d.estado != null ? d.estado : ''),
      TCH_Estimado_Z2627: (d.tchEst2627 != null ? d.tchEst2627 : null),
    })));
    return rows;
  } catch { return []; }
}

async function updateProduccionFromSiagri() {
  const siagri = await readSiagriBridge();
  if (!siagri || !siagri.records || !siagri.records.length) {
    toast('Primero procesa un SIAGRI en Administrador SIAGRI.');
    return;
  }
  const prevRows = await baselineReportRows();
  const result = adaptSiagriToProduction(siagri, prevRows);

  const s = result.summary;
  const vlines = result.validations.checks.map((c) => `${c.ok ? '✓' : '✗'} ${c.detail}`).join('\n');
  const desglose = Object.keys(s.fieldCounts || {}).sort((a, b) => s.fieldCounts[b] - s.fieldCounts[a])
    .map((k) => `   · ${k}: ${s.fieldCounts[k]}`).join('\n');
  const resumen =
    `Actualizar Maestro de Suertes\n` +
    `--------------------------------\n` +
    `Registros anteriores: ${s.registrosAnteriores}\n` +
    `Registros nuevos: ${s.registrosNuevos}\n` +
    `Nuevas suertes: ${s.nuevasSuertes}\n` +
    `Modificadas: ${s.modificadas}\n` +
    `Sin cambios: ${s.sinCambios}\n` +
    `Inactivadas/retiradas: ${s.inactivadas}\n` +
    (desglose ? `Cambios por variable:\n${desglose}\n` : '') +
    `Área anterior: ${s.areaAnterior} ha → nueva: ${s.areaNueva} ha (Δ ${s.areaDelta})\n` +
    `Sucuya excluida (Cod 16): ${s.sucuyaExcluidas}\n` +
    `Fecha de actualización: ${s.fechaActualizacion}\n` +
    `Versión de datos: ${result.dataVersion}\n` +
    `--------------------------------\n` +
    `Validaciones:\n${vlines}\n` +
    `--------------------------------\n` +
    (result.ok ? '¿Aplicar esta actualización?' : 'NO se puede aplicar: hay validaciones críticas sin cumplir.');

  if (!result.ok) { window.alert(resumen); return; }
  if (!window.confirm(resumen)) { toast('Actualización cancelada. No se aplicó ningún cambio.'); return; }

  await masterStore.saveProduccionDataset({
    reportRows: result.reportRows,
    dataVersion: result.dataVersion,
    summary: s,
    meta: result.meta,
    /* El histórico NO se toca aquí: Producción lo conserva/ampl­ía con sus reglas. */
  });
  toast('Maestro de Suertes actualizado en este dispositivo. Genera el paquete para publicar.');
  const v = $('#view'); if (v) renderDataStatus(v);
}

/* ---------------- Gate de Centro Maestro ---------------- */
function renderCentroGate() {
  const view = el(`<div class="view panel"><div>
      <h1 class="panel__title">Centro Maestro</h1>
      <p class="panel__note">Introduce la contraseña para acceder a la administración.</p></div></div>`);
  swap(view);
  renderNav('centro-maestro');

  const overlay = el(`<div class="overlay">
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="cTitle">
        <h2 class="dialog__title" id="cTitle">Acceso restringido</h2>
        <p class="dialog__note">El Centro Maestro es de uso administrativo.</p>
        <div class="field">
          <label for="cpass">Contraseña</label>
          <input id="cpass" type="password" inputmode="numeric" autocomplete="off" placeholder="••••••">
        </div>
        <p class="dialog__err" id="cErr"></p>
        <div class="dialog__row">
          <button class="btn btn--block" id="cCancel" type="button">Cancelar</button>
          <button class="btn btn--primary btn--block" id="cOk" type="button">Entrar</button>
        </div>
      </div></div>`);
  document.body.appendChild(overlay);
  const input = $('#cpass', overlay);
  input.focus();

  const close = () => overlay.remove();
  const attempt = () => {
    if (gate.centroUnlock(input.value)) { close(); viewCentroMaestro(); }
    else { $('#cErr', overlay).textContent = 'Contraseña incorrecta.'; input.select(); }
  };
  $('#cOk', overlay).addEventListener('click', attempt);
  $('#cCancel', overlay).addEventListener('click', () => { close(); router.home(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') attempt(); });
}

/* ---------------- Router → vistas ---------------- */
function route(r) {
  switch (r.name) {
    case 'home': viewHome(); break;
    case 'modulo': viewModule(r.param); break;
    case 'centro-maestro':
      if (!gate.isCentroUnlocked()) renderCentroGate();
      else viewCentroMaestro();
      break;
    case 'privado': viewPrivado(r.param); break;
    default: viewHome();
  }
}

/* ---------------- Service Worker ---------------- */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).then((reg) => {
      // Aviso de nueva versión disponible (sin recargar de golpe).
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Nueva versión disponible', {
              label: 'Actualizar',
              onClick: () => { nw.postMessage({ type: 'SKIP_WAITING' }); },
            });
          }
        });
      });
    }).catch((e) => console.warn('SW no registrado:', e));

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return; refreshing = true; location.reload();
    });
  });
}

/* ---------------- Arranque ---------------- */
function boot() {
  renderHeader();
  router.onChange(route);
  registerSW();
  router.start();
}
boot();
