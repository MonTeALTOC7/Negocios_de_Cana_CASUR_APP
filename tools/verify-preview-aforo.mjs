import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash, webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {AFORO_VERSION, AFORO_SOURCE_SHA} from './preview-aforo.mjs';

const directory = process.argv[2];
if (!directory) throw Error('Supply an isolated preview artifact directory');
const read = file => fs.readFileSync(path.join(directory, file));
const json = file => JSON.parse(read(file));
const metadata = json('__preview.json');
const manifest = json('core/versions/runtime-assets.json');
// Check the actual derived document, including bootstrap placement, before upload.
const derivedHtml = read('modules/produccion/index.html').toString();
let inlineScripts = 0;
for (const match of derivedHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if (/\bsrc\s*=|type\s*=\s*["']module["']/i.test(match[1]) || !match[2].trim()) continue;
  new vm.Script(match[2], {filename:`preview-inline-${++inlineScripts}.js`});
}
for (const [file, expected] of Object.entries(metadata.files)) {
  assert.equal(createHash('sha256').update(read(file)).digest('hex'), expected, file);
}
for (const [file, expected] of Object.entries(manifest.assets)) {
  let bytes = read(file);
  if (/\.(?:html|css|js|mjs|svg)$/.test(file)) bytes = Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, file);
}
const crono = json('modules/produccion/data/cronologico.json');
const history = json('modules/produccion/data/historico.json');
const originalHistory = JSON.parse(fs.readFileSync(new URL('../modules/produccion/data/historico.json', import.meta.url)));
assert.deepEqual({...history, meta:originalHistory.meta}, originalHistory);
assert.equal(crono.meta.sourceSha256, AFORO_SOURCE_SHA);
assert.equal(crono.meta.dataVersion, AFORO_VERSION);
assert.equal(json('modules/produccion/data/version.json').version, AFORO_VERSION);
assert.equal(history.meta.dataVersion, AFORO_VERSION);
const engine = createRequire(import.meta.url)('../core/imports/operational-import.js');
const window = {CASUR_OPERATIONAL_IMPORT:engine, CRONO_DATA:crono, addEventListener(){}};
vm.runInNewContext(read('modules/produccion/js/casur-enhancements.js').toString(), {window,
  document:{getElementById(){return null;},addEventListener(){}}, console, setTimeout, clearTimeout,
  requestAnimationFrame(fn){fn();}, MutationObserver:class {}});
const refreshed = window.CASUR_REFRESH_OPERATIONAL_VIEW(crono);
const lot = refreshed.producers.flatMap(p => p.details).find(r => r.codLote === '99336');
const api = window.CASUR_CRONO_PARTICIPATION;
assert.equal(api.forecastForRow(lot).tch, 65);
assert.equal(api.dateSummary([lot]).display, '24-dic-2026');
assert.equal(api.referenceDate(lot).detail, 'Corte mecánico');
assert.equal(lot.tonEst2627, 579.15);
assert.equal(api.detailColumns('26/27').length, 18);
assert.equal(refreshed.global.estimateTch, 61.78);
assert.equal(refreshed.global.estimateArea, 9115.65);

// Exercise the real SW's generation gate, including an already cached September
// generation, offline restart, and a subsequent response containing older data.
const storage = new Map();
let offline = false, oldNetwork = false;
const origin = 'https://preview.casur.test/';
const key = request => new URL(typeof request === 'string' ? request : request.url || request.href, origin).href;
const caches = {async open(name) {
  if (!storage.has(name)) storage.set(name, new Map());
  const entries = storage.get(name);
  return {async match(request){return entries.get(key(request))?.clone();},
    async put(request,response){entries.set(key(request),response.clone());},
    async keys(){return [...entries.keys()].map(url=>({url}));}, async delete(request){return entries.delete(key(request));}};
}, async keys(){return [...storage.keys()];}};
function worker(seed = null) {
  const context = vm.createContext({seed, caches, Response, URL, TextEncoder, Uint8Array, crypto:webcrypto, console, setTimeout, clearTimeout,
    fetch:async request => {
      if (offline) throw Error('Simulated offline');
      const file = new URL(request, origin).pathname.slice(1);
      return new Response(oldNetwork ? fs.readFileSync(new URL('../'+file, import.meta.url)) : read(file));
    }, self:{location:{origin:origin.slice(0,-1)}, registration:{scope:origin}, addEventListener(){}}});
  vm.runInContext(read('sw.js').toString(), context);
  return expression => vm.runInContext(expression, context);
}
const old = Object.fromEntries(['version','cronologico','historico'].map(kind => [kind,
  JSON.parse(fs.readFileSync(new URL(`../modules/produccion/data/${kind}.json`,import.meta.url)))]));
let evaluate = worker(old);
// Use the gate's own promotion function rather than fabricating cache records.
// Values enter only this isolated test context, never a browser or user cache.
assert.equal(await evaluate('(async()=>promoteGenerationIfNewer(await caches.open(PROD_LKG_CACHE),seed.version.version,seed))()'), true);
assert.equal((await evaluate('resolveGeneration()')).version, AFORO_VERSION);
offline = true;
evaluate = worker(); // New worker, same isolated Cache Storage: cold offline restart.
assert.equal((await evaluate('resolveGeneration()')).version, AFORO_VERSION);
offline = false; oldNetwork = true;
assert.equal((await evaluate('resolveGeneration()')).version, AFORO_VERSION);
console.log(JSON.stringify({head:metadata.head, verifiedFiles:Object.keys(metadata.files).length,
  runtimeAssets:Object.keys(manifest.assets).length, inlineScripts, dataVersion:crono.meta.dataVersion,
  historicalRowsUnchanged:true, lot99336:{area:lot.area,tchPrevious:lot.tch,tchEstimated:65,tons:lot.tonEst2627,
    sourceDate:lot.source.sourceDate,harvest:api.dateSummary([lot]).display,cut:api.referenceDate(lot).detail},
  global:refreshed.operational.totals, columns:18,
  lkg:{septemberUpgraded:true,coldOfflineSimulation:true,olderNetworkRejected:true}}, null, 2));
