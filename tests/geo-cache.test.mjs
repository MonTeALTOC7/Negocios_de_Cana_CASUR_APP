import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../shared/geo/data/manifest.json', import.meta.url)));

function harness({ storage = new Map(), fail = new Set(), appVersion = '1.2.0' } = {}) {
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
          entries.set(key(url), new Response('{}'));
        },
      };
    },
    async keys() { return [...storage.keys()]; },
    async delete(name) { return storage.delete(name); },
  };
  const context = vm.createContext({
    caches, Response, URL, console: { warn() {} },
    fetch() { throw new Error('unexpected download of cached geometry'); },
    self: {
      location: { origin: 'https://casur.test' },
      registration: { scope: 'https://casur.test/' },
      addEventListener(type, handler) { handlers[type] = handler; },
      skipWaiting() {}, clients: { async claim() {} },
    },
  });
  vm.runInContext(source.replace("const APP_VERSION = '1.2.0';", `const APP_VERSION = '${appVersion}';`), context);
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
  return { storage, downloads, fail, value, dispatch, message, handlers };
}

test('GEO_DATA_VERSION coincide con el manifest y no depende de APP_VERSION', () => {
  const current = harness();
  const next = harness({ appVersion: '1.2.1' });
  assert.equal(current.value('GEO_DATA_VERSION'), manifest.dataVersion);
  assert.equal(current.value('GEO_CACHE'), 'casur_master_geo_2026-07-24-maestro-26-27');
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

test('actualizar solo el shell conserva GEO durante activate y no lo redescarga', async () => {
  const previous = harness();
  await previous.dispatch('install');
  const next = harness({ storage: previous.storage, appVersion: '1.2.1' });
  await next.dispatch('install');
  await next.dispatch('activate');
  assert.ok(next.storage.has(previous.value('GEO_CACHE')));
  assert.equal((await next.message()).status, 'complete');
  assert.equal(next.downloads.filter((url) => url.includes('/geo/data/')).length, 0);
  let response;
  next.handlers.fetch({
    request: { method: 'GET', url: 'https://casur.test/shared/geo/data/manifest.json' },
    respondWith(promise) { response = promise; },
  });
  assert.equal((await response).status, 200);
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
    'manifest.json': 'b5d5ec87c0f5d3f8da815e1e0e5caf93201e03c960dac69e5f3f993ab7dcf571',
    'zona-1-sur.geojson': '74e4cf619cdec26437cbc4e75d240eb16cd765e26efcf4e39e215457d3e2bdd9',
    'zona-2-centro.geojson': 'aa07521bc289a8179ff58a5cf498c4788904b626d41e2364215937f3b01dc2bb',
    'zona-3-norte.geojson': 'dc226a536a693ac640506d5ccf9a44237a585eedda5265c25a9b47c9101fad7e',
    'zona-5-productores.geojson': 'df0aaea2ee46f29d4a3bb60b55e003de355fe3ca678aecd70bc849e68d3cf737',
  };
  for (const [file, expected] of Object.entries(hashes)) {
    assert.equal(createHash('sha256').update(readFileSync(new URL('../shared/geo/data/' + file, import.meta.url))).digest('hex'), expected, file);
  }
});
