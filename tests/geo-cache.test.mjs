import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../shared/geo/data/manifest.json', import.meta.url)));
const productionEnhancements = readFileSync(new URL('../modules/produccion/js/casur-enhancements.js', import.meta.url), 'utf8');

function harness({ storage = new Map(), fail = new Set(), appVersion = '1.3.2', geoVersion = manifest.dataVersion, indexedDB = { records: new Map() }, fetchImpl = () => { throw new Error('network unavailable'); } } = {}) {
  const handlers = {};
  const downloads = [];
  const key = (url) => new URL(typeof url === 'string' ? url : url.url, 'https://casur.test/').href;
  const caches = {
    async open(name) {
      if (!storage.has(name)) storage.set(name, new Map());
      const entries = storage.get(name);
      return {
        async match(url) { return entries.get(key(url)); },
        async add(url) {
          downloads.push(url);
          if (fail.has(url)) throw new Error('network unavailable');
          entries.set(key(url), new Response(JSON.stringify({ generation: geoVersion, url })));
        },
        async put(url, response) { entries.set(key(url), response.clone()); },
      };
    },
    async keys() { return [...storage.keys()]; },
    async delete(name) { return storage.delete(name); },
  };
  const context = vm.createContext({
    caches, Response, URL, indexedDB, console: { warn() {} },
    fetch: fetchImpl,
    self: {
      location: { origin: 'https://casur.test' },
      registration: { scope: 'https://casur.test/' },
      addEventListener(type, handler) { handlers[type] = handler; },
      skipWaiting() {}, clients: { async claim() {} },
    },
  });
  const executable = source
    .replace("const APP_VERSION = '1.3.2';", `const APP_VERSION = '${appVersion}';`)
    .replace("const GEO_DATA_VERSION = '2026-07-24-maestro-26-27-r2';", `const GEO_DATA_VERSION = '${geoVersion}';`);
  vm.runInContext(executable, context);
  const value = (expression) => vm.runInContext(expression, context);
  async function dispatch(type, extra = {}) {
    let promise;
    handlers[type]({ ...extra, waitUntil(p) { promise = p; } });
    await promise;
  }
  async function message() {
    let result;
    await dispatch('message', { data: { type: 'WARM_GEO' }, ports: [{ postMessage(r) { result = r; } }] });
    return result;
  }
  return { storage, downloads, fail, indexedDB, value, dispatch, message, handlers };
}

test('GEO_DATA_VERSION coincide con el manifest y no depende de APP_VERSION', () => {
  const current = harness({ appVersion: '1.3.0' });
  const next = harness({ appVersion: '1.3.1' });
  assert.equal(current.value('GEO_DATA_VERSION'), manifest.dataVersion);
  assert.equal(current.value('GEO_CACHE'), 'casur_master_geo_2026-07-24-maestro-26-27-r2');
  assert.equal(current.value('GEO_CACHE'), next.value('GEO_CACHE'));
  assert.notEqual(current.value('SHELL_CACHE'), next.value('SHELL_CACHE'));
});

test('instalación prepara automáticamente la generación completa de cinco recursos', async () => {
  const h = harness();
  await h.dispatch('install');
  const result = await h.message();
  assert.equal(result.status, 'complete');
  assert.equal(result.missing.length, 0);
  const entries = h.storage.get(h.value('GEO_CACHE'));
  const expected = ['manifest.json', ...Object.values(manifest.zones).map((zone) => zone.file)];
  assert.deepEqual([...entries.keys()].sort(), expected.map((file) => 'https://casur.test/shared/geo/data/' + file).sort());
  assert.equal(h.downloads.filter((url) => url.includes('/geo/data/')).length, 5);
});

test('fallo de cada asset produce incomplete y WARM_GEO reintenta solo el faltante', async () => {
  for (const file of ['manifest.json', ...Object.values(manifest.zones).map((zone) => zone.file)]) {
    const url = './shared/geo/data/' + file;
    const h = harness({ fail: new Set([url]) });
    const first = await h.message();
    assert.equal(first.status, 'incomplete');
    assert.deepEqual(Array.from(first.missing), [url]);
    assert.equal(h.storage.get(h.value('GEO_CACHE')).size, 4);
    h.fail.clear();
    const second = await h.message();
    assert.equal(second.status, 'complete');
    assert.equal(second.missing.length, 0);
    assert.equal(h.downloads.length, 6);
    assert.equal(h.downloads.at(-1), url);
  }
});

test('fallo GEO y fallo individual del shell permiten instalar y reintentar después', async () => {
  const h = harness({ fail: new Set(['./index.html', './shared/geo/data/manifest.json']) });
  await h.dispatch('install');
  assert.equal((await h.message()).status, 'incomplete');
  h.fail.clear();
  assert.equal((await h.message()).status, 'complete');
});

test('actualizar v1.3.1 → v1.3.2 renueva shell y conserva GEO, LKG e IndexedDB', async () => {
  const indexedDB = { records: new Map([['biometry:original', { id: 'biometry:original', latitude: 11.5, longitude: -85.8 }]]) };
  const network = { online: true };
  const previous = harness({ appVersion: '1.3.1', indexedDB });
  await previous.dispatch('install');
  const oldShell = previous.value('SHELL_CACHE');
  const lkg = previous.value('PROD_LKG_CACHE');
  const lkgEntries = new Map([['https://casur.test/modules/produccion/data/version.json', new Response('lkg')]]);
  previous.storage.set(lkg, lkgEntries);
  const next = harness({
    storage: previous.storage,
    appVersion: '1.3.2',
    indexedDB,
    fetchImpl: async () => {
      if (!network.online) throw new Error('offline');
      return new Response(productionEnhancements, { status: 200, headers: { 'Content-Type': 'application/javascript' } });
    },
  });
  await next.dispatch('install');
  await next.dispatch('activate');
  assert.ok(!next.storage.has(oldShell));
  assert.ok(next.storage.has(next.value('SHELL_CACHE')));
  assert.ok(next.storage.has(previous.value('GEO_CACHE')));
  assert.equal(next.storage.get(lkg), lkgEntries);
  assert.strictEqual(next.indexedDB, indexedDB);
  assert.deepEqual([...next.indexedDB.records], [['biometry:original', { id: 'biometry:original', latitude: 11.5, longitude: -85.8 }]]);
  assert.ok(next.storage.get(next.value('SHELL_CACHE')).has('https://casur.test/shared/geo/geo-map.js'));
  assert.equal((await next.message()).status, 'complete');
  assert.equal(next.downloads.filter((url) => url.includes('/geo/data/')).length, 0);
  assert.doesNotMatch(source, /\bindexedDB\b/, 'el SW no administra los registros locales');
  const productionAsset = 'https://casur.test/modules/produccion/js/casur-enhancements.js';
  let response;
  next.handlers.fetch({
    request: { method: 'GET', url: productionAsset },
    respondWith(promise) { response = promise; },
  });
  assert.equal(await (await response).text(), productionEnhancements);
  network.online = false;
  next.handlers.fetch({
    request: { method: 'GET', url: productionAsset },
    respondWith(promise) { response = promise; },
  });
  assert.equal(await (await response).text(), productionEnhancements, 'el asset de Producción actualizado queda disponible offline después de su primera descarga');
  assert.deepEqual([...next.indexedDB.records], [['biometry:original', { id: 'biometry:original', latitude: 11.5, longitude: -85.8 }]]);
  let geoResponse;
  next.handlers.fetch({
    request: { method: 'GET', url: 'https://casur.test/shared/geo/data/manifest.json' },
    respondWith(promise) { geoResponse = promise; },
  });
  assert.equal((await geoResponse).status, 200);
});

test('upgrade GEO r1→r2 conserva r1 completa mientras r2 está incompleta y promueve solo al completar 5/5', async () => {
  const storage = new Map();
  const generationA = harness({ storage, geoVersion: '2026-07-24-maestro-26-27' });
  assert.equal((await generationA.message()).status, 'complete');
  const cacheA = generationA.value('GEO_CACHE');
  assert.equal((await generationA.value('readGeoActive()')).dataVersion, '2026-07-24-maestro-26-27');

  const missingUrl = './shared/geo/data/zona-3-norte.geojson';
  const generationB = harness({ storage, geoVersion: '2026-07-24-maestro-26-27-r2', fail: new Set([missingUrl]) });
  const incomplete = await generationB.message();
  assert.equal(incomplete.status, 'incomplete');
  assert.equal(incomplete.activeVersion, '2026-07-24-maestro-26-27');
  assert.deepEqual(Array.from(incomplete.missing), [missingUrl]);
  await generationB.dispatch('activate');
  assert.ok(storage.has(cacheA), 'activate conserva A mientras B está incompleta');

  async function geoFetch(path) {
    let response;
    generationB.handlers.fetch({
      request: { method: 'GET', url: 'https://casur.test/shared/geo/data/' + path },
      respondWith(promise) { response = promise; },
    });
    return JSON.parse(await (await response).text());
  }
  assert.equal((await geoFetch('manifest.json')).generation, '2026-07-24-maestro-26-27');
  assert.equal((await geoFetch('zona-3-norte.geojson')).generation, '2026-07-24-maestro-26-27');
  assert.equal(storage.get(generationB.value('GEO_CACHE')).size, 4, 'B permanece en staging parcial');

  generationB.fail.clear();
  const complete = await generationB.message();
  assert.equal(complete.status, 'complete');
  assert.equal(complete.activeVersion, '2026-07-24-maestro-26-27-r2');
  assert.equal(generationB.downloads.at(-1), missingUrl, 'reintenta únicamente el faltante');
  assert.equal(generationB.downloads.length, 6);
  assert.equal((await geoFetch('manifest.json')).generation, '2026-07-24-maestro-26-27-r2');
  assert.equal((await geoFetch('zona-3-norte.geojson')).generation, '2026-07-24-maestro-26-27-r2');
  assert.ok(!storage.has(cacheA), 'A se poda solo después de promover B completa');
});

test('preparaciones concurrentes comparten trabajo y un error de storage permite reintento', async () => {
  const h = harness();
  const first = h.value('warmGeoCache()');
  assert.equal(first, h.value('warmGeoCache()'));
  assert.equal((await first).status, 'complete');
  assert.equal(h.downloads.length, 5);
  h.value('globalThis.originalOpen = caches.open; caches.open = async () => { throw new Error("storage"); }');
  assert.equal((await h.message()).status, 'error');
  h.value('caches.open = originalOpen');
  assert.equal((await h.message()).status, 'complete');
});

test('los cinco hashes publicados GEO permanecen exactamente iguales', () => {
  const hashes = {
    'manifest.json': '83a2bf5396f8e94ced8fb28e92575a1679551c8d532b1514132ed2b5fa8d684b',
    'zona-1-sur.geojson': 'fc677abdfaa295f60c01fac61b57655f85fa82206b4256efac7b3990955787ef',
    'zona-2-centro.geojson': '12dfdcf652716462503aaf7ae3f54a7748b4c6a644a820228417aae1c0f68647',
    'zona-3-norte.geojson': '3cf84bdb399c5ac9acada189bc49bedaef6ad72ddab9285bdcf428f5cee4c69b',
    'zona-5-productores.geojson': '50e0697081f78ab15108d32e2575b9e3ad627a8edd262a468478503a32b7ad10',
  };
  for (const [file, expected] of Object.entries(hashes)) {
    assert.equal(createHash('sha256').update(readFileSync(new URL('../shared/geo/data/' + file, import.meta.url))).digest('hex'), expected, file);
  }
});
