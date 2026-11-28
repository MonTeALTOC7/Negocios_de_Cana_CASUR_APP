// Issue #59 · V1.6.1 — recuperación segura de la release instalada y upgrade sin instantánea previa.
// Todas las pruebas son deterministas: el SW real corre en un contexto vm con Cache Storage,
// red y worker activo simulados. Ninguna prueba acepta que se borren cachés ni datos.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {MessageChannel} from 'node:worker_threads';
import vm from 'node:vm';

const script = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../core/versions/runtime-assets.json', import.meta.url)));
const ROOT = 'https://casur.test/';
const REG = ROOT + '__manifest__/' + encodeURIComponent(manifest.releaseId);
const READY = ROOT + '__release_ready__/' + encodeURIComponent(manifest.releaseId);
const SHELL = 'casur_master_shell_v' + manifest.appVersion;
const coreFiles = manifest.bundles.core;

function harness({active = null, clients = []} = {}) {
  const stores = new Map(), handlers = {}, deletes = [], fetches = [], serve = {}, corrupt = new Set();
  let offline = false, skipWaitingCalls = 0;
  const cacheApi = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const map = stores.get(name);
      return {
        async keys() { return [...map.keys()].map(url => ({url})); },
        async match(key) { return map.get(String(key?.url ?? key))?.clone(); },
        async put(key, value) { map.set(String(key?.url ?? key), value.clone()); },
        async delete(key) { return map.delete(String(key?.url ?? key)); },
      };
    },
    async delete(name) { deletes.push(name); return stores.delete(name); },
    async keys() { return [...stores.keys()]; },
  };
  const fetchMock = async input => {
    const file = new URL(String(input)).pathname.slice(1);
    fetches.push(file);
    if (offline) throw new TypeError('offline');
    if (serve[file]) return serve[file]();
    if (file === 'core/versions/runtime-assets.json') return new Response(JSON.stringify(manifest));
    if (corrupt.has(file)) return new Response('corrupt');
    return new Response(readFileSync(new URL('../' + file, import.meta.url)));
  };
  const state = {active};
  const registration = {scope: ROOT, get active() { return state.active; }};
  // Plazos largos (≥15 s: espera al worker previo, abortos de descarga) en un reloj virtual.
  // Antes se comprimían a 5 ms reales y, bajo carga de CPU, ese temporizador ganaba a la
  // respuesta del MessageChannel del worker previo (entregada en otra vuelta del event loop):
  // el SW lo veía como «sin respuesta» y omitía el rechazo de downgrade y el traspaso de
  // anclajes. Ahora solo vencen cuando la prueba lo ordena con expireLongTimers().
  const longTimers = new Map();
  const ctx = vm.createContext({
    URL, Response, Headers, TextEncoder, TextDecoder, Uint8Array, crypto: webcrypto, AbortController, MessageChannel,
    caches: cacheApi, console, fetch: fetchMock,
    setTimeout(fn, ms, ...rest) {
      if (!(ms >= 15000)) return setTimeout(fn, ms, ...rest);
      const handle = Object.freeze({virtual: ms});
      longTimers.set(handle, () => fn(...rest));
      return handle;
    },
    clearTimeout(handle) { if (!longTimers.delete(handle)) clearTimeout(handle); },
    self: {
      location: {origin: 'https://casur.test'}, registration,
      addEventListener(kind, handler) { handlers[kind] = handler; },
      clients: {matchAll: async () => clients, claim: async () => {}},
      skipWaiting() { skipWaitingCalls++; },
    },
  });
  vm.runInContext(script, ctx);
  return {
    ctx, stores, handlers, cacheApi, deletes, fetches, serve, corrupt, state,
    setOffline(value) { offline = value; },
    expireLongTimers() {
      const due = [...longTimers.values()]; longTimers.clear();
      for (const fire of due) fire();
      return due.length;
    },
    get skipWaitingCalls() { return skipWaitingCalls; },
    get downloads() { return fetches.length; },
  };
}
const install = h => { let work; h.handlers.install({waitUntil(p) { work = p; }}); return work; };
async function respond(h, request, extra = {}) {
  let result;
  h.handlers.fetch({clientId: '', resultingClientId: '', request: {method: 'GET', ...request}, respondWith(p) { result = p; }, ...extra});
  return result;
}
const navigate = (h, file = '', {clientId = '', destination = 'document'} = {}) =>
  respond(h, {mode: 'navigate', destination, url: ROOT + file}, {clientId, resultingClientId: clientId ? '' : 'doc-' + Math.random()});
const resource = (h, file, clientId = 'win') => respond(h, {mode: 'no-cors', destination: 'script', url: ROOT + file}, {clientId});
async function post(h, data) {
  const channel = new MessageChannel(), pending = [];
  const reply = new Promise(resolve => { channel.port1.onmessage = event => { channel.port1.close(); resolve(event.data); }; });
  h.handlers.message({data, ports: [channel.port2], source: {id: 'tester'}, waitUntil(p) { pending.push(p); }});
  const [value] = await Promise.all([reply, ...pending]);
  return value;
}
async function installed(h = harness()) { await install(h); return h; }
// Simulates the incident: current release manifest gone from both stores; snapshots of other caches stay.
function dropManifest(h) {
  h.stores.get('casur_master_release_manifests').delete(REG);
  h.stores.get(SHELL).delete(ROOT + 'core/versions/runtime-assets.json');
  vm.runInContext('pinnedManifests.clear(); clientReleasePins.clear();', h.ctx);
}
// Cachés y datos que ninguna operación de recuperación puede tocar.
async function plantUserData(h) {
  for (const name of ['estimador-tch-v2.7.2', 'casur-riego-v6', 'pansaco-inventario-v1', 'casur_master_prod_lkg', 'casur_master_data_v1.5.6', 'casur_master_geo_meta']) {
    const cache = await h.cacheApi.open(name); await cache.put(ROOT + 'sentinel', new Response('dato-' + name));
  }
}
async function assertUserDataIntact(h) {
  for (const name of ['estimador-tch-v2.7.2', 'casur-riego-v6', 'pansaco-inventario-v1', 'casur_master_prod_lkg', 'casur_master_data_v1.5.6', 'casur_master_geo_meta']) {
    assert.equal(await h.stores.get(name)?.get(ROOT + 'sentinel')?.clone().text(), 'dato-' + name, name + ' fue alterada');
  }
  assert.deepEqual(h.deletes, [], 'ninguna caché puede eliminarse durante la recuperación');
}

// ---------------------------------------------------------------- manifest=null en navegación
test('reproducción: con manifest=null y sin red la navegación ya no es un 503 de texto plano', async () => {
  const h = await installed(); await plantUserData(h); dropManifest(h); h.setOffline(true);
  const page = await navigate(h);
  assert.equal(page.status, 503);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  const html = await page.text();
  assert.match(html, /La versión instalada no está disponible/);
  for (const id of ['repair', 'retry', 'reregister']) assert.match(html, new RegExp('id="' + id + '"'));
  assert.match(html, /no se tocaron ni se borran/);
  await assertUserDataIntact(h);
});

test('los sub-recursos sin manifiesto siguen siendo 503 simples (nunca código sin verificar)', async () => {
  const h = await installed(); dropManifest(h); h.setOffline(true);
  const response = await resource(h, 'app.js');
  assert.equal(response.status, 503);
  assert.equal(await response.text(), 'Versión instalada no disponible.');
});

test('la pantalla de recuperación no contiene operaciones destructivas', async () => {
  const h = await installed(); dropManifest(h); h.setOffline(true);
  const html = await (await navigate(h)).text();
  const code = html.slice(html.indexOf('<script>'));
  for (const forbidden of [/caches\./, /indexedDB/i, /localStorage/, /sessionStorage/, /deleteDatabase/, /Clear-Site-Data/i, /skipWaiting/, /\.clear\(/])
    assert.doesNotMatch(code, forbidden, String(forbidden));
  assert.match(html, /getRegistration\(scope\)/, 'solo se re-registra el scope de esta app');
});

// ---------------------------------------------------------------- recuperación online, misma release
test('con red recupera el manifiesto de la MISMA release, verifica el core y sirve la página', async () => {
  const h = await installed(); await plantUserData(h); dropManifest(h);
  h.fetches.length = 0;
  const page = await navigate(h);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<html/i);
  assert.ok(h.stores.get('casur_master_release_manifests').has(REG), 'manifiesto restaurado en el registro');
  assert.ok(h.stores.get(SHELL).has(ROOT + 'core/versions/runtime-assets.json'), 'manifiesto restaurado en la caché de shell');
  assert.ok(h.stores.get('casur_master_release_manifests').has(READY));
  assert.deepEqual(h.fetches, ['core/versions/runtime-assets.json'], 'el core íntegro se reutiliza sin descargar de nuevo');
  await assertUserDataIntact(h);
});

test('si además falta el core, se vuelve a preparar por hashes antes de servir', async () => {
  const h = await installed(); dropManifest(h);
  const meta = h.stores.get('casur_master_bundle_meta'), marker = ROOT + '__bundle_ready__/' + encodeURIComponent(manifest.releaseId) + '/core';
  const record = await meta.get(marker).clone().json(); h.stores.delete(record.cache);
  h.fetches.length = 0;
  assert.equal((await navigate(h)).status, 200);
  assert.equal(h.fetches.length, 1 + coreFiles.length);
  const fresh = await meta.get(marker).clone().json();
  assert.notEqual(fresh.cache, record.cache);
  assert.equal(h.stores.get(fresh.cache).size, coreFiles.length);
});

test('los sub-recursos de un cliente anclado a esta release también se recuperan', async () => {
  const h = await installed(); dropManifest(h);
  assert.equal((await resource(h, 'app.js')).status, 200);
});

// ---------------------------------------------------------------- offline
test('offline no inventa estado: muestra la recuperación y se recupera al volver la red sin bucles', async () => {
  const h = await installed(); dropManifest(h); h.setOffline(true);
  assert.equal((await navigate(h)).status, 503);
  const attempts = h.downloads;
  assert.equal((await navigate(h)).status, 503);
  assert.equal(h.downloads, attempts + 1, 'un único intento de red por navegación, sin reintentos internos');
  h.setOffline(false);
  assert.equal((await navigate(h)).status, 200, 'sin retardo artificial tras un fallo de red');
});

// ---------------------------------------------------------------- manifiestos rechazados
for (const [name, build] of [
  ['otra releaseId', () => ({...manifest, releaseId: '1.6.1-ffffffffffffffff'})],
  ['otra versión de la app', () => ({...manifest, appVersion: '1.5.6'})],
  ['mismo releaseId con hashes alterados', () => ({...manifest, assets: {...manifest.assets, 'app.js': '0'.repeat(64)}})],
  ['sin conjuntos', () => ({appVersion: manifest.appVersion, releaseId: manifest.releaseId, assets: manifest.assets})],
]) test('manifiesto de ' + name + ' se rechaza: no se persiste ni se sirve código', async () => {
  const h = await installed(); await plantUserData(h); dropManifest(h);
  h.serve['core/versions/runtime-assets.json'] = () => new Response(JSON.stringify(build()));
  const page = await navigate(h);
  assert.equal(page.status, 503);
  assert.match(await page.text(), /La versión instalada no está disponible/);
  assert.equal(h.stores.get('casur_master_release_manifests').has(REG), false);
  assert.equal(h.stores.get(SHELL).has(ROOT + 'core/versions/runtime-assets.json'), false);
  assert.equal(h.fetches.filter(file => file !== 'core/versions/runtime-assets.json').length, coreFiles.length, 'solo la instalación inicial descargó recursos');
  await assertUserDataIntact(h);
});

test('un servidor con otra release no se vuelve a consultar por cada recurso (pausa) y la reparación voluntaria la omite', async () => {
  const h = await installed(); dropManifest(h);
  h.serve['core/versions/runtime-assets.json'] = () => new Response(JSON.stringify({...manifest, releaseId: '1.6.1-ffffffffffffffff'}));
  await navigate(h);
  const after = h.downloads;
  await navigate(h); await resource(h, 'app.js');
  assert.equal(h.downloads, after, 'durante la pausa no hay más descargas');
  const repair = await post(h, {type: 'CASUR_REPAIR_RELEASE'});
  assert.deepEqual(repair, {ok: false, code: 'REPAIR_RELEASE_MISMATCH'});
  assert.equal(h.downloads, after + 1);
});

test('un core con hash inválido tras recuperar el manifiesto nunca se sirve', async () => {
  const h = await installed(); dropManifest(h);
  const marker = ROOT + '__bundle_ready__/' + encodeURIComponent(manifest.releaseId) + '/core';
  const record = await h.stores.get('casur_master_bundle_meta').get(marker).clone().json(); h.stores.delete(record.cache);
  h.corrupt.add('app.js');
  const page = await navigate(h);
  assert.equal(page.status, 503);
  assert.doesNotMatch(await page.text(), /corrupt/);
  assert.equal((await resource(h, 'app.js')).status, 503);
});

// ---------------------------------------------------------------- continuidad de clientes anteriores
test('un cliente anclado a una release anterior sin snapshot no recibe código de otra release', async () => {
  const h = await installed(); await plantUserData(h);
  const pins = await h.cacheApi.open('casur_master_client_releases');
  await pins.put(ROOT + '__client__/old-window', new Response(JSON.stringify({version: '1.5.6', releaseId: '1.5.6-5c2629a614158393'})));
  vm.runInContext('clientReleasePins.clear(); pinnedManifests.clear();', h.ctx);
  h.fetches.length = 0;
  const asset = await resource(h, 'app.js', 'old-window');
  assert.equal(asset.status, 503);
  const frame = await navigate(h, 'modules/produccion/index.html', {clientId: 'old-window', destination: 'iframe'});
  assert.equal(frame.status, 503);
  assert.match(await frame.text(), /ya no está disponible en este dispositivo/);
  assert.equal(h.fetches.length, 0, 'ninguna descarga: solo se recupera la release propia');
  assert.equal(h.stores.has('casur_master_shell_v1.5.6'), false, 'no se crean cachés fantasma');
  assert.equal((await navigate(h)).status, 200, 'un documento nuevo sí abre la release actual');
  await assertUserDataIntact(h);
});

test('un cliente anterior con su snapshot conservado mantiene su versión', async () => {
  const h = await installed();
  const old = await h.cacheApi.open('casur_master_shell_v1.5.4');
  await old.put(ROOT + 'core/versions/runtime-assets.json', new Response(JSON.stringify({appVersion: '1.5.4', assets: {'app.js': 'legacy'}})));
  await old.put(ROOT + 'app.js', new Response('legacy-runtime'));
  const pins = await h.cacheApi.open('casur_master_client_releases');
  await pins.put(ROOT + '__client__/old-window', new Response('1.5.4'));
  assert.equal(await (await resource(h, 'app.js', 'old-window')).text(), 'legacy-runtime');
});

// ---------------------------------------------------------------- reparación voluntaria
test('reparación voluntaria: restaura un core corrupto de esta release sin tocar datos', async () => {
  const h = await installed(); await plantUserData(h);
  const marker = ROOT + '__bundle_ready__/' + encodeURIComponent(manifest.releaseId) + '/core';
  const record = await h.stores.get('casur_master_bundle_meta').get(marker).clone().json();
  h.stores.get(record.cache).set(ROOT + 'app.js', new Response('corrupt'));
  assert.equal((await resource(h, 'app.js')).status, 503, 'la corrupción se detecta y no se sirve');
  const result = await post(h, {type: 'CASUR_REPAIR_RELEASE'});
  assert.deepEqual(result, {ok: true, version: manifest.appVersion, releaseId: manifest.releaseId});
  assert.equal((await resource(h, 'app.js')).status, 200);
  await assertUserDataIntact(h);
});

test('reparación voluntaria offline informa el motivo y no cambia nada', async () => {
  const h = await installed(); await plantUserData(h); h.setOffline(true);
  const names = [...h.stores.keys()];
  assert.deepEqual(await post(h, {type: 'CASUR_REPAIR_RELEASE'}), {ok: false, code: 'REPAIR_OFFLINE'});
  assert.deepEqual([...h.stores.keys()], names);
  await assertUserDataIntact(h);
});

test('estado y datos de actualización siguen respondiendo con el manifiesto ausente', async () => {
  const h = await installed(); dropManifest(h); h.setOffline(true);
  const info = await post(h, {type: 'CASUR_UPDATE_INFO'});
  assert.equal(info.version, manifest.appVersion);
  assert.equal(info.releaseId, manifest.releaseId);
  assert.equal(info.ready, false);
  const status = await post(h, {type: 'BUNDLE_STATUS'});
  assert.equal(status.missing, true);
  assert.deepEqual(status.bundles, {});
});

// ---------------------------------------------------------------- install / upgrade
const previous = {version: '1.5.6', releaseId: '1.5.6-5c2629a614158393'};
const activeReplying = info => ({postMessage(_message, [port]) { port.postMessage(info); port.close(); }});
const activeSilent = {postMessage() { /* handler del worker previo falla: nunca responde */ }};

test('upgrade con snapshot anterior AUSENTE: el core nuevo verificado se instala igualmente', async () => {
  const h = harness({active: activeReplying(previous), clients: [{id: 'old-window', frameType: 'top-level'}]});
  await plantUserData(h);
  await install(h);
  const ready = ROOT + '__bundle_ready__/' + encodeURIComponent(manifest.releaseId) + '/core';
  assert.ok(h.stores.get('casur_master_bundle_meta').has(ready));
  assert.ok(h.stores.get('casur_master_release_manifests').has(READY));
  assert.equal(h.stores.has('casur_master_client_releases'), false, 'no se inventan anclajes de clientes antiguos');
  assert.equal(h.stores.has('casur_master_shell_v1.5.6'), false, 'no se crea una caché fantasma de la versión anterior');
  assert.equal(h.skipWaitingCalls, 0, 'la instalación no fuerza skipWaiting');
  await assertUserDataIntact(h);
});

test('upgrade con worker previo que no responde: se instala tras el plazo, sin bloquearse', async () => {
  const h = harness({active: activeSilent});
  const work = install(h);
  assert.equal(h.expireLongTimers(), 1, 'la espera al worker previo es lo único pendiente y vence por su plazo');
  await work;
  assert.ok(h.stores.get('casur_master_release_manifests').has(READY));
  assert.equal(h.skipWaitingCalls, 0);
});

test('upgrade con respuesta malformada del worker previo no bloquea', async () => {
  const h = harness({active: activeReplying({basura: true})});
  await install(h);
  assert.ok(h.stores.get('casur_master_release_manifests').has(READY));
});

test('upgrade con snapshot presente conserva anclajes de clientes y módulos ya preparados', async () => {
  const legacyManifest = {appVersion: '1.5.6', releaseId: previous.releaseId, assets: {'modules/produccion/index.html': 'x'}, bundles: {core: ['app.js'], produccion: ['modules/produccion/index.html']}, dependencies: {}};
  const h = harness({active: activeReplying(previous), clients: [{id: 'old-window', frameType: 'top-level'}]});
  await (await h.cacheApi.open('casur_master_release_manifests')).put(ROOT + '__manifest__/' + encodeURIComponent(previous.releaseId), new Response(JSON.stringify(legacyManifest)));
  await (await h.cacheApi.open('casur_master_bundle_meta')).put(ROOT + '__bundle_ready__/' + encodeURIComponent(previous.releaseId) + '/produccion', new Response('{}'));
  await install(h);
  const pin = await h.stores.get('casur_master_client_releases').get(ROOT + '__client__/old-window').clone().json();
  assert.deepEqual(pin, {version: '1.5.6', releaseId: previous.releaseId});
  const produccion = ROOT + '__bundle_ready__/' + encodeURIComponent(manifest.releaseId) + '/produccion';
  assert.ok(h.stores.get('casur_master_bundle_meta').has(produccion), 'el módulo que estaba offline se vuelve a preparar verificado');
});

test('upgrade desde el snapshot legacy (sin releaseId) se conserva', async () => {
  const h = harness({active: activeReplying({version: '1.5.4', ready: true}), clients: [{id: 'w', frameType: 'top-level'}]});
  const legacy = await h.cacheApi.open('casur_master_shell_v1.5.4');
  await legacy.put(ROOT + 'core/versions/runtime-assets.json', new Response(JSON.stringify({appVersion: '1.5.4', assets: {'app.js': 'legacy'}})));
  await install(h);
  const pin = await h.stores.get('casur_master_client_releases').get(ROOT + '__client__/w').clone().json();
  assert.deepEqual(pin, {version: '1.5.4', releaseId: 'legacy-1.5.4'});
});

test('un downgrade se rechaza antes de escribir cualquier caché', async () => {
  const h = harness({active: activeReplying({version: '1.7.0', releaseId: '1.7.0-abc'})});
  await assert.rejects(install(h), /DOWNGRADE_REJECTED/);
  assert.equal(h.stores.size, 0);
});

test('misma versión o anterior no se consideran downgrade', async () => {
  for (const version of ['1.6.1', '1.6.0', '1.5.6']) {
    const h = harness({active: activeReplying({version, releaseId: version + '-x'})});
    await install(h);
    assert.ok(h.stores.get('casur_master_release_manifests').has(READY), version);
  }
});

test('la integridad del core NUEVO sigue siendo obligatoria aunque falte el worker previo', async () => {
  const h = harness({active: activeReplying(previous)}); h.corrupt.add('app.js');
  await assert.rejects(install(h), /HASH_MISMATCH/);
  assert.equal(h.stores.get('casur_master_release_manifests')?.has(READY) ?? false, false);
  assert.equal([...h.stores.keys()].some(name => name.includes('_core_')), false, 'ningún staging parcial queda promovido');
});

test('nueva instalación (sin worker previo) prepara solo el core y no necesita snapshot', async () => {
  const h = harness();
  await install(h);
  assert.equal(h.downloads, 1 + coreFiles.length);
  assert.equal(h.skipWaitingCalls, 0);
});

// ---------------------------------------------------------------- invariantes del SW
test('el SW no contiene borrado indiscriminado ni Clear-Site-Data', () => {
  assert.doesNotMatch(script, /Clear-Site-Data/i);
  assert.doesNotMatch(script, /indexedDB|deleteDatabase|localStorage\.clear/);
  const deletions = script.match(/caches\.delete\([^)]*\)/g) || [];
  assert.deepEqual(deletions, ['caches.delete(stagingName)', 'caches.delete(name)'], 'solo el staging fallido de esta transacción y las generaciones GEO inactivas');
  assert.equal((script.match(/skipWaiting\(\)/g) || []).length, 1, 'skipWaiting solo tras el checkpoint de todas las ventanas');
});
