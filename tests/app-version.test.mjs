import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const versions = readFileSync(new URL("../core/versions/versions.js", import.meta.url), "utf8");
const registry = readFileSync(new URL("../core/module-registry/registry.js", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const productionVersion = readFileSync(new URL("../modules/produccion/VERSION.txt", import.meta.url), "utf8");
const productionPackage = JSON.parse(readFileSync(new URL("../modules/produccion/package.json", import.meta.url), "utf8"));

function captured(source, pattern, label) {
  const value = source.match(pattern)?.[1];
  assert.ok(value, `no se encontró ${label}`);
  return value;
}

test("la versión 1.5.1 coincide en la fuente canónica, el SW y el fallback HTML", () => {
  const canonical = captured(versions, /export const APP_VERSION = ['"]([^'"]+)['"];/, "APP_VERSION canónica");
  const sw = captured(serviceWorker, /const APP_VERSION = ['"]([^'"]+)['"];/, "APP_VERSION del Service Worker");
  const fallback = captured(index, /id="appVersion">v([^<]+)</, "versión fallback de index.html");
  assert.equal(canonical, "1.5.1");
  assert.deepEqual([canonical, sw, fallback], ["1.5.1", "1.5.1", "1.5.1"]);
});

test("Maestro de Suertes muestra V1.7.1 de forma consistente sin alterar otros módulos", () => {
  assert.match(versions, /produccion: 'V1\.7\.1'/);
  assert.match(versions, /integrado · V1\.7\.1 \(código\)/);
  assert.match(registry, /name: 'Maestro de Suertes'[\s\S]*?version: 'V1\.7\.1'/);
  assert.match(productionVersion, /^V1\.7\.1 CASUR/m);
  assert.equal(productionPackage.version, "1.7.1");
  assert.match(index, /id="appVersion">v1\.5\.1</);
  assert.match(versions, /tch: '2\.8\.1'/);
});

test("la geometría y Leaflet local forman parte del offline automático", () => {
  const assets = captured(serviceWorker, /const SHELL_ASSETS = \[([\s\S]*?)\n\];/, "SHELL_ASSETS");
  const geoAssets = captured(serviceWorker, /const GEO_ASSETS = \[([\s\S]*?)\n\];/, "GEO_ASSETS");
  for (const asset of ["geo-data.js", "geo-map.js", "geo.css", "leaflet.js", "leaflet.css"]) {
    assert.match(assets, new RegExp(asset.replace(".", "\\.")));
  }
  for (const asset of ["manifest.json", "zona-1-sur.geojson", "zona-2-centro.geojson", "zona-3-norte.geojson", "zona-5-productores.geojson"]) {
    assert.match(geoAssets, new RegExp(asset.replace(".", "\\.")));
  }
  assert.match(serviceWorker, /const GEO_CACHE\s+= GEO_CACHE_PREFIX \+ GEO_DATA_VERSION/);
  assert.match(serviceWorker, /event\.data\.type === 'WARM_GEO'/);
  assert.match(serviceWorker, /url\.pathname\.includes\('\/shared\/geo\/data\/'\)/);
});

test("el checkpoint de navegación forma parte del precache del shell", () => {
  const assets = captured(serviceWorker, /const SHELL_ASSETS = \[([\s\S]*?)\n\];/, "SHELL_ASSETS");
  assert.match(assets, /['"]\.\/core\/navigation\/module-checkpoint\.js['"]/);
});
