/* ============================================================
   sw.js — ÚNICO Service Worker raíz de "Negocios de Caña CASUR".
   ------------------------------------------------------------
   REGLA CRÍTICA (auditoría C1/C2): jamás borrado ciego de cachés.
   Este SW SOLO administra cachés con su propio prefijo y una
   allowlist. Nunca toca las cachés de los módulos originales
   (estimador-tch-*, casur-riego-*, pansaco-inventario-*, etc.).
   Los Service Workers individuales de cada módulo quedan
   neutralizados dentro de la Maestra: aquí no se registran.
   ============================================================ */

const APP_VERSION = '1.5.0';
const MASTER_PREFIX = 'casur_master_';
const SHELL_CACHE = MASTER_PREFIX + 'shell_v' + APP_VERSION;
const DATA_CACHE  = MASTER_PREFIX + 'data_v' + APP_VERSION;
const GEO_DATA_VERSION = '2026-07-24-maestro-26-27-r2';
const GEO_CACHE_PREFIX = MASTER_PREFIX + 'geo_';
const GEO_CACHE   = GEO_CACHE_PREFIX + GEO_DATA_VERSION;
const GEO_META_CACHE = MASTER_PREFIX + 'geo_meta';
const GEO_ACTIVE_KEY = 'https://casur-geo.internal/active';
/* [Hotfix 4.4.2] Caché "Last Known Good" de datos de Producción. A propósito
   SIN sufijo de APP_VERSION: debe sobrevivir a publicaciones de código y a
   cierres/reaperturas de la PWA (Cache Storage es persistente en disco). */
const PROD_LKG_CACHE = MASTER_PREFIX + 'prod_lkg';
const PROD_DATA_RE = /\/modules\/produccion\/data\/(version|cronologico|historico)\.(json|js)$/;
const PROD_KINDS = ['version','cronologico','historico'];
const clientGenerations = new Map();

/* Cachés que este SW puede administrar/borrar. Nunca fuera de aquí. */
const OWNED = new Set([SHELL_CACHE, DATA_CACHE, GEO_CACHE, GEO_META_CACHE, PROD_LKG_CACHE]);

/* Geometría operativa publicada: dataset independiente de datos SIAGRI/LKG. */
const GEO_ASSETS = [
  './shared/geo/data/manifest.json',
  './shared/geo/data/zona-1-sur.geojson',
  './shared/geo/data/zona-2-centro.geojson',
  './shared/geo/data/zona-3-norte.geojson',
  './shared/geo/data/zona-5-productores.geojson',
];

/* Shell mínimo + manifiesto verificado de código y recursos visuales locales.
   Datasets y servicios externos conservan sus estrategias independientes. */
const SHELL_ASSETS = [
  './',
  './index.html',
  './404.html',
  './manifest.webmanifest',
  './app.js',
  './core/navigation/router.js',
  './core/navigation/module-checkpoint.js',
  './core/updates/pwa-update.js',
  './core/module-registry/registry.js',
  './core/permissions/gate.js',
  './core/sync/status.js',
  './core/storage/storage.js',
  './core/versions/versions.js',
  './modules/produccion/js/release-info.js',
  './modules/produccion/js/effective-data-date.js',
  './shared/components/icons.js',
  './shared/styles/tokens.css',
  './shared/styles/app.css',
  './shared/geo/geo-data.js',
  './shared/geo/geo-map.js',
  './shared/geo/geo.css',
  './shared/vendor/leaflet/leaflet.js',
  './shared/vendor/leaflet/leaflet.css',
  './shared/vendor/leaflet/images/layers.png',
  './shared/vendor/leaflet/images/layers-2x.png',
  './shared/vendor/leaflet/images/marker-icon.png',
  './shared/vendor/leaflet/images/marker-icon-2x.png',
  './shared/vendor/leaflet/images/marker-shadow.png',
  './shared/assets/icons/icon-192.png',
  './shared/assets/icons/icon-512.png',
  './shared/assets/icons/emblem-192.png',
  './shared/assets/icons/favicon-48.png',
  './shared/assets/brand/casur-logo.png',
];

/* ---------------- Install ---------------- */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const manifestResponse = await fetch(new URL('./core/versions/runtime-assets.json', self.registration.scope), {cache:'no-store'});
    if (!manifestResponse.ok) throw new Error('Release manifest unavailable');
    const manifest = await manifestResponse.json();
    if (manifest.appVersion !== APP_VERSION || !manifest.assets || !Object.keys(manifest.assets).length) throw new Error('Release manifest mismatch');
    // All local executable resources, including modules never opened, form one snapshot.
    // Hash validation prevents a partial deployment from producing a mixed generation.
    for (const [path, expected] of Object.entries(manifest.assets)) {
      const url = new URL(path, self.registration.scope);
      if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) throw new Error('Invalid release asset');
      const response = await fetch(url, {cache:'no-store'});
      if (!response.ok) throw new Error(`Release asset unavailable: ${path}`);
      const bytes = /\.(?:html|css|js|mjs|svg)$/.test(path)
        ? new TextEncoder().encode((await response.clone().text()).replace(/\r\n/g,'\n'))
        : await response.clone().arrayBuffer();
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)), byte => byte.toString(16).padStart(2,'0')).join('');
      if (digest !== expected) throw new Error(`Release hash mismatch: ${path}`);
      await cache.put(url,response);
    }
    await cache.put(new URL('./core/versions/runtime-assets.json', self.registration.scope),new Response(JSON.stringify(manifest)));
    // A missing code asset rejects installation; the previous worker stays active.
    await Promise.all([
      ...SHELL_ASSETS.map(async (url) => { if (!(await cache.match(url))) await cache.add(url); }),
      warmGeoCache(),
    ]);
    // Refresh previously used module resources before allowing an offline update.
    for (const name of await caches.keys()) {
      if (!name.startsWith(MASTER_PREFIX + 'shell_v') || name === SHELL_CACHE) continue;
      const old = await caches.open(name);
      for (const request of await old.keys()) {
        const url = new URL(request.url);
        if (url.pathname.endsWith('/__release_ready__')) continue;
        // Removed runtime files must not be fetched from a different release.
        if (/\.(?:js|mjs|html|css)$/.test(url.pathname)) continue;
        if (!(await cache.match(request))) await cache.add(request);
      }
    }
    const dataCache = await caches.open(DATA_CACHE);
    for (const name of (await caches.keys()).reverse()) {
      if (!name.startsWith(MASTER_PREFIX + 'data_v') || name === DATA_CACHE) continue;
      const old = await caches.open(name);
      for (const request of await old.keys()) if (!(await dataCache.match(request))) await dataCache.put(request, await old.match(request));
    }
    await cache.put(new URL('./__release_ready__', self.registration.scope), new Response(APP_VERSION));
  })());
});

/* ---------------- Activate ---------------- */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Preserve prior code/data caches: other tabs may still use the old release.
    // LKG/GEO lifecycle remains independent. No user data is pruned here.
    await self.clients.claim();
  })());
});

/* ---------------- Mensajes (actualización controlada) ---------------- */
let updateInProgress = false;
async function releaseReady(verifyHashes = false) {
  const cache = await caches.open(SHELL_CACHE);
  const manifestResponse = await cache.match(new URL('./core/versions/runtime-assets.json', self.registration.scope));
  if (!manifestResponse || !(await cache.match(new URL('./__release_ready__', self.registration.scope)))) return false;
  const manifest = await manifestResponse.json();
  if (verifyHashes) for (const [file,expected] of Object.entries(manifest.assets)) {
    const response=await cache.match(new URL(file,self.registration.scope));
    const bytes=/\.(?:html|css|js|mjs|svg)$/.test(file)?new TextEncoder().encode((await response.text()).replace(/\r\n/g,'\n')):await response.arrayBuffer();
    const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    if(actual!==expected)return false;
  }
  return manifest.appVersion === APP_VERSION && (await Promise.all([...SHELL_ASSETS,...Object.keys(manifest.assets)].map(url => cache.match(new URL(url,self.registration.scope))))).every(Boolean);
}
async function coordinateUpdate() {
  if (updateInProgress) return {ok:false};
  updateInProgress = true;
  let clients = [];
  try {
    if (!(await releaseReady(true))) throw new Error('incomplete');
    clients = (await self.clients.matchAll({type:'window', includeUncontrolled:true})).filter(client => client.frameType !== 'nested');
    const results = await Promise.all(clients.map(client => new Promise(resolve => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); resolve(false); }, 10000);
      channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data?.ok === true); };
      client.postMessage({type:'CASUR_UPDATE_PREPARE'}, [channel.port2]);
    })));
    const current = (await self.clients.matchAll({type:'window', includeUncontrolled:true})).filter(client => client.frameType !== 'nested');
    if (!results.every(Boolean) || current.some(client => !clients.some(previous => previous.id === client.id))) throw new Error('checkpoint');
    await self.skipWaiting();
    return {ok:true, version:APP_VERSION};
  } catch {
    clients.forEach(client => client.postMessage({type:'CASUR_UPDATE_CANCEL'}));
    return {ok:false};
  } finally { updateInProgress = false; }
}
self.addEventListener('message', (event) => {
  // Ignore legacy SKIP_WAITING: v1.3.4 cannot provide a safe checkpoint handshake.
  if (event.data?.type === 'CASUR_UPDATE_INFO') event.waitUntil((async () => {
    const previous = (await caches.keys()).filter(key => key.startsWith(MASTER_PREFIX+'shell_v') && key !== SHELL_CACHE).map(key => key.slice((MASTER_PREFIX+'shell_v').length));
    event.ports?.[0]?.postMessage({version:APP_VERSION, ready:await releaseReady(), previous});
  })());
  if (event.data?.type === 'CASUR_UPDATE_APPLY') event.waitUntil(coordinateUpdate().then(result => event.ports?.[0]?.postMessage(result)));
  if (event.data && event.data.type === 'WARM_GEO') {
    event.waitUntil(warmGeoCache().then((result) => {
      // Respuesta opcional para diagnóstico; el shell no requiere intervención.
      const target = event.ports?.[0] || event.source;
      target?.postMessage({ type: 'GEO_WARM_RESULT', ...result });
    }));
  }
});

/* ---------------- Fetch (estrategias por patrón) ---------------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) Supabase y APIs externas: passthrough, nunca cachear.
  if (url.hostname.endsWith('.supabase.co') || url.origin !== self.location.origin) {
    return; // deja pasar a la red tal cual
  }

  // 2) Navegaciones: network-first con fallback al index CORRECTO.
  //    Una navegación offline dentro de /modules/<id>/, /master/<id>/ o
  //    /private/<id>/ debe caer en el index.html de ESE módulo, no en el
  //    shell maestro. Así, cuando un módulo se cargue en iframe, offline
  //    no termina metiendo la App Maestra dentro de sí misma.
  if (req.mode === 'navigate') {
    event.respondWith(installedNavigation(req, navigationFallback(url)));
    return;
  }

  // 3) Datasets oficiales versionados: network-first + cache.
  //    [Hotfix 4.4.2] Los 3 archivos de datos de Producción (version/
  //    cronologico/historico, .js y .json) pasan primero por el gate LKG:
  //    si la red trae una versión ANTERIOR a la última buena conocida
  //    (publicación de código con datos viejos por error), el navegador
  //    JAMÁS llega a recibirla — se sirve la LKG. Protege desde el arranque,
  //    no depende de que el JS de Producción llegue a ejecutarse.
  if (PROD_DATA_RE.test(url.pathname)) {
    event.respondWith(produccionDataGate(event, req, url));
    return;
  }
  // 3b) Geometría web mínima: caché propia, nunca mezclada con LKG ni datos agronómicos.
  if (url.pathname.includes('/shared/geo/data/')) {
    event.respondWith(geoCacheFirst(req));
    return;
  }
  //    Resto de datasets oficiales (incluye /master/data/,
  //    /modules/insumos/data/** [Fase 5], /modules/riego/data/** [Fase 6],
  //    /modules/labores/datos/** [Fase 8A, Excel] y /modules/labores/data/**
  //    [Fase 8B.2, Seguimiento publicado sanitizado]):
  //    network-first + cache. NUNCA stale-while-revalidate para estos: con
  //    internet debe priorizar siempre la versión publicada; sin internet,
  //    la última copia cacheada.
  //    Insumos, Riego y Labores usan esta política GENÉRICA, deliberadamente
  //    DISTINTA del sistema de generaciones atómicas (LKG) de Producción —
  //    las políticas quedan separadas; esta fase no aplica LKG a Riego.
  //    Las llamadas a Supabase (origen distinto) NUNCA pasan por aquí: la
  //    regla 1) de passthrough por origen ya las deja seguir sin caché.
  if (url.pathname.includes('/master/data/') || url.pathname.includes('/modules/produccion/data/') || url.pathname.includes('/modules/insumos/data/') || url.pathname.includes('/modules/riego/data/') || url.pathname.includes('/modules/labores/datos/') || url.pathname.includes('/modules/labores/data/')) {
    event.respondWith(networkFirst(req, DATA_CACHE));
    return;
  }

  // 4) Assets hasheados de módulos (inmutables): cache-first.
  if (/\/modules\/.+\.[a-f0-9]{6,}\.(js|css|png|jpg|svg|woff2?)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(req, SHELL_CACHE));
    return;
  }

  // 5) Installed runtime is pinned, including cache-busting query strings.
  if (/\.(?:js|mjs|html|css)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      return await cache.match(req,{ignoreSearch:true}) || new Response('Recurso no incluido en esta versión instalada.',{status:503});
    })());
    return;
  }
  // Pin installed code until an explicit activation, avoiding mixed-version imports.
  event.respondWith(cacheFirst(req, SHELL_CACHE));
});

async function installedNavigation(req, fallback) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(req) || await cache.match(fallback);
  return cached || networkFirst(req, SHELL_CACHE, fallback);
}

/* ---------------- Fallback de navegación por scope ---------------- */
/* Devuelve el index.html que corresponde a la ruta navegada:
   - dentro de modules/<id>/ | master/<id>/ | private/<id>/  → index de ese módulo
   - en cualquier otro caso                                   → index del shell maestro
   Todo relativo al scope del SW, para funcionar bajo el subdirectorio
   de GitHub Pages sin asumir raíz '/'. */
function navigationFallback(url) {
  const scope = new URL(self.registration.scope).pathname; // p.ej. /Negocios_de_Cana_CASUR/
  let rel = url.pathname;
  if (rel.startsWith(scope)) rel = rel.slice(scope.length);
  const m = rel.match(/^(modules|master|private)\/([^/]+)\//);
  // 'master/data' son datasets versionados, no una sub-app: shell maestro.
  if (m && !(m[1] === 'master' && m[2] === 'data')) {
    return scope + m[1] + '/' + m[2] + '/index.html';
  }
  return scope + 'index.html';
}

/* ---------------- Estrategias ---------------- */
async function networkFirst(req, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    if (fallbackUrl) {
      const fb = await cache.match(fallbackUrl);
      if (fb) return fb;
    }
    return new Response('Sin conexión y sin copia en caché.', { status: 503, statusText: 'Offline' });
  }
}

let geoWarmInFlight = null;
async function geoGenerationComplete(cacheName) {
  const cache = await caches.open(cacheName);
  const available = await Promise.all(GEO_ASSETS.map((url) => cache.match(url)));
  return available.every(Boolean);
}

async function readGeoActive() {
  try {
    const meta = await caches.open(GEO_META_CACHE);
    const response = await meta.match(GEO_ACTIVE_KEY);
    if (!response) return null;
    const value = await response.clone().json();
    if (!value?.cacheName?.startsWith(GEO_CACHE_PREFIX) || !value.dataVersion) return null;
    return value;
  } catch { return null; }
}

async function writeGeoActive(dataVersion, cacheName) {
  const meta = await caches.open(GEO_META_CACHE);
  await meta.put(GEO_ACTIVE_KEY, new Response(JSON.stringify({ dataVersion, cacheName }), {
    headers: { 'Content-Type': 'application/json' },
  }));
}

async function resolveGeoActive() {
  const active = await readGeoActive();
  if (active) return active;
  // Migración defensiva: una caché completa creada antes del puntero se
  // convierte en activa sin descargarla otra vez. Nunca elige una parcial.
  const completeCandidates = (await caches.keys())
    .filter((name) => name.startsWith(GEO_CACHE_PREFIX) && name !== GEO_META_CACHE)
    .sort().reverse();
  const candidates = [GEO_CACHE, ...completeCandidates.filter((name) => name !== GEO_CACHE)];
  for (const cacheName of candidates) {
    if (!(await geoGenerationComplete(cacheName))) continue;
    const dataVersion = cacheName.slice(GEO_CACHE_PREFIX.length);
    await writeGeoActive(dataVersion, cacheName);
    return { dataVersion, cacheName };
  }
  return null;
}

async function pruneInactiveGeoCaches(activeCacheName) {
  const keys = await caches.keys();
  await Promise.all(keys
    .filter((name) => name.startsWith(GEO_CACHE_PREFIX) && name !== GEO_META_CACHE && name !== activeCacheName)
    .map((name) => caches.delete(name)));
}

async function promoteGeoGeneration() {
  await writeGeoActive(GEO_DATA_VERSION, GEO_CACHE);
  await pruneInactiveGeoCaches(GEO_CACHE);
}

function warmGeoCache() {
  if (geoWarmInFlight) return geoWarmInFlight;
  geoWarmInFlight = (async () => {
    try {
      const cache = await caches.open(GEO_CACHE);
      // Esperar TODOS los intentos antes de verificar o permitir un reintento.
      await Promise.allSettled(GEO_ASSETS.map(async (url) => {
        if (!(await cache.match(url))) await cache.add(url);
      }));
      const available = await Promise.all(GEO_ASSETS.map((url) => cache.match(url)));
      const missing = GEO_ASSETS.filter((url, index) => !available[index]);
      if (missing.length) {
        console.warn('[SW] generación GEO incompleta:', missing);
        const active = await resolveGeoActive();
        return { status: 'incomplete', dataVersion: GEO_DATA_VERSION, activeVersion: active?.dataVersion || null, missing };
      }
      await promoteGeoGeneration();
      return { status: 'complete', dataVersion: GEO_DATA_VERSION, activeVersion: GEO_DATA_VERSION, missing: [] };
    } catch (error) {
      console.warn('[SW] error preparando GEO:', error);
      return { status: 'error', dataVersion: GEO_DATA_VERSION, missing: [...GEO_ASSETS] };
    }
  })().finally(() => { geoWarmInFlight = null; });
  return geoWarmInFlight;
}

async function geoCacheFirst(req) {
  // Evita que un fetch capture el puntero anterior justo cuando la promoción
  // lo cambia y poda esa caché. Después del warm verá A completa o B completa.
  if (geoWarmInFlight) await geoWarmInFlight;
  const active = await resolveGeoActive();
  if (!active) return new Response('Generación GEO completa no disponible.', { status: 503 });
  const cache = await caches.open(active.cacheName);
  const cached = await cache.match(req);
  // Una generación activa se sirve como unidad: jamás buscar el recurso en
  // otra generación ni en red, porque produciría un híbrido manifest/zonas.
  return cached || new Response('Recurso ausente en generación GEO activa.', { status: 503 });
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return new Response('Recurso no disponible offline.', { status: 503 });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await network) ||
    new Response('Sin conexión.', { status: 503 });
}

/* ---------------- [Hotfix 4.4.3] Gate LKG de datos de Producción ---------------- */
/* Comparador robusto de versiones (NO lexicográfico), duplicado a propósito
   aquí como utilitario genérico de parseo — el SW corre en un contexto
   aislado y no puede importar el módulo de Producción ni el shell. Mismo
   esquema vigente que en app.js / casur-enhancements.js: "AAAA.MM.DD-tag.NNNN".
   Valida FECHA REAL (mes 1-12, día válido para ese mes, año en rango
   razonable) y secuencia como entero seguro no negativo — rechaza fechas
   imposibles en vez de aceptarlas ciegamente. */
function parseCasurDataVersion(v) {
  if (typeof v !== 'string') return null;
  const m = v.match(/^(\d{4})\.(\d{2})\.(\d{2})-([a-zA-Z0-9]+)\.(\d+)$/);
  if (!m) return null;
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]), seq = Number(m[5]);
  if (year < 2020 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (!Number.isSafeInteger(seq) || seq < 0) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null; // fecha imposible (p.ej. 02-30)
  return { date: year * 10000 + month * 100 + day, seq };
}
function compareCasurDataVersions(a, b) {
  if (a === b) return 0;
  const pa = parseCasurDataVersion(a);
  const pb = parseCasurDataVersion(b);
  if (!pa || !pb) return null;
  if (pa.date !== pb.date) return pa.date > pb.date ? 1 : -1;
  if (pa.seq !== pb.seq) return pa.seq > pb.seq ? 1 : -1;
  return 0;
}

const JS_VAR_BY_KIND = { version: 'CASUR_RELEASE', cronologico: 'CASUR_REMOTE_CRONO', historico: 'CASUR_REMOTE_HISTORICO' };
function buildJsWrapper(kind, jsonText) { return 'window.' + JS_VAR_BY_KIND[kind] + '=' + jsonText + ';\n'; }
function declaredVersion(json) {
  if (!json) return null;
  if (typeof json.version === 'string') return json.version;
  if (json.meta && typeof json.meta.dataVersion === 'string') return json.meta.dataVersion;
  return null;
}
/* Validación mínima de integridad (NO reglas de negocio de SIAGRI/builder,
   solo un chequeo defensivo: JSON con forma esperada y Sucuya excluida). */
function looksValidProdData(kind, json) {
  if (!json) return false;
  if (kind === 'version') return typeof json.version === 'string' && json.version.length > 0;
  if (kind === 'cronologico') {
    if (!(json.global && Number(json.global.suertes) > 0)) return false;
    const sucuya = (json.producers || []).some((p) => String(p && p.code).replace(/[^0-9]/g, '') === '16');
    return !sucuya;
  }
  if (kind === 'historico') return !!(json.meta && Number(json.meta.rows) > 0);
  return true;
}

/* Namespace sintético de claves de Cache Storage para la LKG por GENERACIÓN
   completa (no por archivo suelto): evita que se pueda servir version.js
   nuevo con historico.js antiguo. La clave "active" apunta a la única
   generación vigente; solo se mueve cuando los 6 archivos de esa generación
   ya están escritos por completo (transaccional: preparar todo, activar al final). */
const LKG_NS = 'https://casur-lkg.internal/';
const LKG_ACTIVE_KEY = LKG_NS + 'active';
function genKey(version, kind, ext) { return LKG_NS + 'gen/' + encodeURIComponent(version) + '/' + kind + '.' + ext; }

async function loadGenerationFiles(cache, version, {allowLegacy=false} = {}) {
  try {
    const [v, c, h] = await Promise.all([
      cache.match(genKey(version, 'version', 'json')),
      cache.match(genKey(version, 'cronologico', 'json')),
      cache.match(genKey(version, 'historico', 'json')),
    ]);
    // Un marcador de versión NO equivale a un dataset recuperable: si falta
    // cualquiera de los 3 archivos de esta generación, no es recuperable.
    if (!v || !c || !h) return null;
    const files = {
      version: JSON.parse(await v.clone().text()),
      cronologico: JSON.parse(await c.clone().text()),
      historico: JSON.parse(await h.clone().text()),
    };
    const proofResponse=await cache.match(genKey(version,'integrity','json'));
    if(!proofResponse&&!allowLegacy)return null;
    if(proofResponse){
      const proof=await proofResponse.json();
      for(const kind of PROD_KINDS){
        const bytes=new TextEncoder().encode(JSON.stringify(files[kind]));
        const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
        if(actual!==proof[kind]||declaredVersion(files[kind])!==version)return null;
      }
      Object.defineProperty(files,'__networkVerified',{value:proof._networkVerified===true});
    }
    return files;
  } catch (e) { return null; }
}

async function writeGenerationFiles(cache, version, files) {
  const writes = [];
  const proof={_networkVerified:files.__networkVerified===true};
  for (const kind of ['version', 'cronologico', 'historico']) {
    const jsonText = JSON.stringify(files[kind]);
    proof[kind]=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(jsonText))),b=>b.toString(16).padStart(2,'0')).join('');
    writes.push(cache.put(genKey(version, kind, 'json'), new Response(jsonText, { headers: { 'Content-Type': 'application/json' } })));
    writes.push(cache.put(genKey(version, kind, 'js'), new Response(buildJsWrapper(kind, jsonText), { headers: { 'Content-Type': 'application/javascript' } })));
  }
  // Escribir TODO primero; solo si lo anterior no lanzó excepción se activa
  // el puntero. Si algo falla arriba, la promesa rechaza y NO se llega aquí:
  // la generación anterior queda íntegra (nunca activación parcial).
  await Promise.all(writes);
  await cache.put(genKey(version,'integrity','json'),new Response(JSON.stringify(proof)));
}

/* [Hotfix 4.4.4] Promueve `version` a generación activa SOLO si, releyendo
   el puntero "active" en este mismo instante, sigue siendo estrictamente
   más nueva (o no existe ninguna activa aún). Esta re-lectura + la
   escritura del puntero ocurren dentro de la MISMA ejecución de
   doResolveGeneration(), que a su vez está protegida por el mutex real de
   resolveGeneration() (una sola resolución en vuelo a la vez): la
   comprobación y la escritura del puntero quedan así dentro de la misma
   exclusión mutua. Nunca promociona una versión inferior o igual. */
async function promoteGenerationIfNewer(cache, version, files) {
  const freshResp = await cache.match(LKG_ACTIVE_KEY);
  let freshVersion = null;
  if (freshResp) {
    try { freshVersion = JSON.parse(await freshResp.clone().text()).version; } catch (e) { freshVersion = null; }
  }
  if (freshVersion) {
    const cmp = compareCasurDataVersions(version, freshVersion);
    if (cmp !== 1) return false; // igual, inferior o irreconocible: NO promover
  }
  await writeGenerationFiles(cache, version, files);
  await cache.put(LKG_ACTIVE_KEY, new Response(JSON.stringify({ version, ts: Date.now(), integrityRequired:true })));
  // Existing pages remain pinned to their complete generation until they safely
  // reload. Keep prior shared generations; never prune a live page's data.
  return true;
}

async function pruneOldGenerations(cache, keepVersion) {
  const keys = await cache.keys();
  const genPrefix = LKG_NS + 'gen/';
  const keepPrefix = genPrefix + encodeURIComponent(keepVersion) + '/';
  await Promise.all(keys
    .filter((r) => r.url.indexOf(genPrefix) === 0 && r.url.indexOf(keepPrefix) !== 0)
    .map((r) => cache.delete(r)));
}

/* [Hotfix 4.4.4] Migración segura desde 4.4.1/4.4.2 (claves planas en
   PROD_LKG_CACHE) y desde DATA_CACHE (network-first genérico de Fase 4.4).
   Antes se elegía el "mejor" candidato de cada kind POR SEPARADO, lo que
   podía perder una generación completa recuperable si existía una
   publicación parcial más reciente de un solo archivo (p.ej. solo
   version.json de 09.06 sin su cronológico/histórico) — esa versión ganaba
   la comparación de "version" pero nunca calificaba como trío completo,
   descartando el hallazgo entero. Ahora se AGRUPAN los candidatos por
   versión y se exige el trío completo, válido y coherente; se recorre de
   la más nueva a la más vieja y se usa la PRIMERA generación completa que
   califique (ignora publicaciones parciales sin impedir recuperar una
   generación completa anterior). Nunca se borran las cachés fuente. */
async function scanCacheForKind(cacheName, kind) {
  const out = [];
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    const re = new RegExp('/modules/produccion/data/' + kind + '\\.json$');
    for (const req of keys) {
      let u; try { u = new URL(req.url); } catch (e) { continue; }
      if (!re.test(u.pathname)) continue;
      const resp = await cache.match(req);
      if (!resp) continue;
      try {
        const json = JSON.parse(await resp.clone().text());
        const v = declaredVersion(json);
        if (v && parseCasurDataVersion(v)) out.push({ version: v, json });
      } catch (e) { /* entrada corrupta: ignorar */ }
    }
  } catch (e) { /* caché inexistente: ignorar */ }
  return out;
}
async function tryMigrateLegacyBaseline() {
  const sources = [PROD_LKG_CACHE, DATA_CACHE];
  const byVersion = new Map(); // version -> { version?, cronologico?, historico? } (JSON parcial mientras se agrupa)
  for (const cacheName of sources) {
    for (const kind of ['version', 'cronologico', 'historico']) {
      const candidates = await scanCacheForKind(cacheName, kind);
      for (const c of candidates) {
        if (!byVersion.has(c.version)) byVersion.set(c.version, {});
        const entry = byVersion.get(c.version);
        if (!entry[kind]) entry[kind] = c.json; // conserva el primero encontrado para ese kind+versión
      }
    }
  }
  // Todas las claves ya pasaron parseCasurDataVersion() en scanCacheForKind,
  // así que compareCasurDataVersions nunca devuelve null aquí: orden descendente seguro.
  const versions = [...byVersion.keys()].sort((a, b) => -compareCasurDataVersions(a, b));
  for (const v of versions) {
    const entry = byVersion.get(v);
    if (!entry.version || !entry.cronologico || !entry.historico) continue; // trío incompleto: ignorar esta versión
    if (declaredVersion(entry.cronologico) !== v) continue;
    if (declaredVersion(entry.historico) !== v) continue;
    if (!looksValidProdData('version', entry.version)) continue;
    if (!looksValidProdData('cronologico', entry.cronologico)) continue;
    if (!looksValidProdData('historico', entry.historico)) continue;
    return { version: v, files: { version: entry.version, cronologico: entry.cronologico, historico: entry.historico } };
  }
  return null;
}

function prodDataNetworkUrl(kind) {
  const scope = self.registration.scope; // termina en '/'
  return scope + 'modules/produccion/data/' + kind + '.json?ts=' + Date.now();
}

async function verifiedNetworkGeneration(activeVersion=null,activeFiles=null) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try {
  const base = self.registration.scope + 'modules/produccion/data/';
  const response = await fetch(base + 'integrity.json?ts=' + Date.now(), {cache:'no-store',signal:controller.signal});
  if (!response.ok) throw new Error('Data integrity manifest unavailable');
  const manifest = await response.json();
  if (manifest.schemaVersion !== 1 || !parseCasurDataVersion(manifest.dataVersion)) throw new Error('Invalid data integrity manifest');
  const comparison=activeVersion?compareCasurDataVersions(manifest.dataVersion,activeVersion):1;
  if(activeFiles&&(comparison===-1||(comparison===0&&activeFiles.__networkVerified)))return{files:activeFiles,manifest};
  const files = {};
  for (const kind of PROD_KINDS) {
    for (const ext of ['json','js']) {
      const name = kind + '.' + ext, expected = manifest.files?.[name];
      if (!/^[a-f0-9]{64}$/.test(expected || '')) throw new Error('Missing data hash');
      const r = await fetch(base + name + '?ts=' + Date.now(), {cache:'no-store',signal:controller.signal});
      if (!r.ok) throw new Error('Incomplete data generation');
      const bytes = await r.arrayBuffer();
      const actual = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)), b=>b.toString(16).padStart(2,'0')).join('');
      if (actual !== expected) throw new Error('Data SHA mismatch: ' + name);
      const text = new TextDecoder().decode(bytes);
      if (ext === 'json') files[kind] = JSON.parse(text);
      else {
        const match = text.match(new RegExp('^\\s*window\\.' + JS_VAR_BY_KIND[kind] + '\\s*=([\\s\\S]*);\\s*$'));
        if (!match || JSON.stringify(JSON.parse(match[1])) !== JSON.stringify(files[kind])) throw new Error('JSON/JS data mismatch');
      }
    }
  }
  if (PROD_KINDS.some(k=>declaredVersion(files[k]) !== manifest.dataVersion || !looksValidProdData(k,files[k]))) throw new Error('Incoherent data generation');
  // Catch a publication changing while its six resources were being read.
  const final = await fetch(base + 'integrity.json?ts=' + Date.now(), {cache:'no-store',signal:controller.signal});
  if (!final.ok || JSON.stringify(await final.json()) !== JSON.stringify(manifest)) throw new Error('Data publication changed during preparation');
  Object.defineProperty(files,'__networkVerified',{value:true});
  return {files,manifest};
  }finally{clearTimeout(timer);}
}

/* [Hotfix 4.4.4] Resuelve la generación vigente: intenta red (los 3 JSON,
   coherentes y válidos) y solo promueve si es ESTRICTAMENTE más nueva que
   la activa (o si aún no hay ninguna activa, tras intentar migrar una LKG
   previa). Igual/anterior/incoherente/inválida → conserva la activa.

   Mutex REAL sin caducidad: mientras exista una resolución pendiente,
   CUALQUIER solicitud nueva espera esa MISMA promesa — nunca se dispara una
   segunda resolución en paralelo, sin importar cuánto tarde la primera.
   `_pending` se limpia ÚNICAMENTE en el `finally` de la propia resolución,
   nunca por vencimiento de tiempo. `resolveGeneration` es una función
   síncrona (sin `await` antes de fijar `_pending`), así que la comprobación
   y el registro de la resolución en curso son atómicos frente al bucle de
   eventos de JS: no hay ninguna ventana en la que dos resoluciones puedan
   arrancar a la vez. */
let _pending = null;
function resolveGeneration() {
  if (_pending) return _pending;
  _pending = doResolveGeneration().finally(() => { _pending = null; });
  return _pending;
}
async function doResolveGeneration() {
  const cache = await caches.open(PROD_LKG_CACHE);
  let activeVersion = null, activeFiles = null;
  const activeResp = await cache.match(LKG_ACTIVE_KEY);
  if (activeResp) {
    try {
      const pointer = JSON.parse(await activeResp.clone().text());
      activeVersion = pointer.version;
      activeFiles = await loadGenerationFiles(cache, activeVersion, {allowLegacy:!pointer.integrityRequired});
      if (!activeFiles) activeVersion = null; // marcador sin dataset recuperable: no cuenta como "protegido"
    } catch (e) { activeVersion = null; activeFiles = null; }
  }

  if (!activeVersion) {
    const migrated = await tryMigrateLegacyBaseline();
    if (migrated) {
      try {
        const promoted = await promoteGenerationIfNewer(cache, migrated.version, migrated.files);
        if (promoted) { activeVersion = migrated.version; activeFiles = migrated.files; }
        else { const r = await rereadActive(cache); if (r) { activeVersion = r.version; activeFiles = r.files; } }
      } catch (e) { /* si falla la escritura, seguimos sin baseline */ }
    }
  }

  let netOk = true, netFiles = null, netVersion = null;
  try {
    const verified = await verifiedNetworkGeneration(activeVersion,activeFiles);
    netFiles = verified.files;
    netVersion = verified.manifest.dataVersion;
  } catch (e) { netOk = false; }

  if (netOk && netVersion && parseCasurDataVersion(netVersion)) {
    const coherent =
      looksValidProdData('version', netFiles.version) &&
      looksValidProdData('cronologico', netFiles.cronologico) &&
      looksValidProdData('historico', netFiles.historico) &&
      declaredVersion(netFiles.cronologico) === netVersion &&
      declaredVersion(netFiles.historico) === netVersion;
    const cmp = activeVersion ? compareCasurDataVersions(netVersion, activeVersion) : 1;
    if(coherent&&cmp===0&&!activeFiles?.__networkVerified&&netFiles.__networkVerified&&PROD_KINDS.every(k=>JSON.stringify(netFiles[k])===JSON.stringify(activeFiles[k]))){
      try{await writeGenerationFiles(cache,activeVersion,netFiles);await cache.put(LKG_ACTIVE_KEY,new Response(JSON.stringify({version:activeVersion,ts:Date.now(),integrityRequired:true})));return{version:activeVersion,files:netFiles};}catch{/* Preserve the complete legacy generation if persistence fails. */}
    }
    if (coherent && (cmp === 1 || !activeVersion)) {
      try {
        const promoted = await promoteGenerationIfNewer(cache, netVersion, netFiles);
        if (promoted) return { version: netVersion, files: netFiles };
        const r = await rereadActive(cache); // no se promovió: usar lo que quedó activo
        if (r) return r;
      } catch (e) { /* fallo al persistir: no se activó nada a medias; usar lo que ya había */ }
    }
    // igual/anterior/incoherente/inválida: se ignora la red, sigue la activa
  }

  if (activeVersion && activeFiles) return { version: activeVersion, files: activeFiles };
  return null; // sin red y sin ninguna LKG recuperable: no hay nada bueno que servir
}
async function rereadActive(cache) {
  const resp = await cache.match(LKG_ACTIVE_KEY);
  if (!resp) return null;
  try {
    const pointer = JSON.parse(await resp.clone().text()),v=pointer.version;
    const files = await loadGenerationFiles(cache, v, {allowLegacy:!pointer.integrityRequired});
    return files ? { version: v, files } : null;
  } catch (e) { return null; }
}

/* Handler por request: usa SIEMPRE la generación ya resuelta (nunca mezcla
   archivos de generaciones distintas). Los .js se derivan del MISMO JSON
   servido para el .json equivalente, así los 6 archivos son coherentes
   entre sí por construcción. Si no hay ninguna publicación válida
   disponible (ni red ni LKG recuperable): fallo controlado explícito, nunca
   se ejecutan datos inválidos. */
async function produccionDataGate(event, req, url) {
  const match = url.pathname.match(PROD_DATA_RE);
  const kind = match[1]; // version | cronologico | historico
  const ext = match[2];  // json | js
  let resolved;
  try {
    const requested = url.searchParams.get('generation');
    const check = kind === 'version' && (url.searchParams.has('ts') || url.searchParams.has('check'));
    const pinned = requested || (!check && clientGenerations.get(event.clientId));
    if (pinned) {
      const files = await loadGenerationFiles(await caches.open(PROD_LKG_CACHE), pinned);
      if (files) resolved = {version:pinned,files};
      else if (requested) throw new Error('Requested generation unavailable');
    }
    if (!resolved) resolved = await resolveGeneration();
    if (resolved && !check && !requested && event.clientId) clientGenerations.set(event.clientId,resolved.version);
  } catch (e) { resolved = null; }
  if (!resolved) {
    return new Response('/* Sin publicación de datos válida disponible. */', { status: 503, statusText: 'Sin datos válidos' });
  }
  const jsonText = JSON.stringify(resolved.files[kind]);
  if (ext === 'json') return new Response(jsonText, { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  return new Response(buildJsWrapper(kind, jsonText), { headers: { 'Content-Type': 'application/javascript; charset=utf-8' } });
}
