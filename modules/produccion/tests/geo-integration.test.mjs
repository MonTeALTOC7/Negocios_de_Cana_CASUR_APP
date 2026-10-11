import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.join(testRoot, relative), "utf8");
const index = read("../index.html");
const enhancements = read("../js/casur-enhancements.js");
const styles = read("../css/casur-upgrade.css");
const historico = JSON.parse(read("../data/historico.json"));

function productionGeoApi() {
  const window = {
    CASUR_HISTORICAL_ENGINE: {},
    addEventListener() {},
  };
  window.window = window;
  const context = vm.createContext({
    window,
    document: { getElementById() { return null; } },
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame(callback) { callback(); },
    MutationObserver: class {},
  });
  new vm.Script(enhancements, { filename: "casur-enhancements.js" }).runInContext(context);
  return window.CASUR_PRODUCTION_GEO;
}

test("Producción carga Leaflet y el motor GEO compartido desde rutas locales", () => {
  assert.match(index, /\.\.\/\.\.\/shared\/vendor\/leaflet\/leaflet\.css/);
  assert.match(index, /\.\.\/\.\.\/shared\/vendor\/leaflet\/leaflet\.js/);
  assert.match(index, /\.\.\/\.\.\/shared\/geo\/geo-data\.js/);
  assert.match(index, /\.\.\/\.\.\/shared\/geo\/geo-map\.js/);
  assert.match(index, /\.\.\/\.\.\/shared\/geo\/geo\.css/);
  assert.match(index, /<script type="module" src="\.\.\/\.\.\/shared\/geo\/geo-map\.js"><\/script>\s*<script src="js\/casur-enhancements\.js"><\/script>/);
  [
    "../../../shared/vendor/leaflet/leaflet.css",
    "../../../shared/vendor/leaflet/leaflet.js",
    "../../../shared/vendor/leaflet/LICENSE",
    "../../../shared/geo/geo.css",
    "../../../shared/geo/geo-data.js",
    "../../../shared/geo/geo-map.js",
  ].forEach((relative) => assert.ok(fs.existsSync(path.resolve(testRoot, relative)), `falta ${relative}`));
});

test("las acciones GEO se agregan sin envolver ni reemplazar renderEntity", () => {
  assert.match(enhancements, /installHistoricalGeoObserver\(\)/);
  assert.match(enhancements, /dataset\.casurGeoAction/);
  assert.match(enhancements, /"Ver polígono"\s*:\s*"Mapa de finca"/);
  assert.doesNotMatch(enhancements, /window\.renderEntity\s*=/);
  assert.doesNotMatch(enhancements, /HISTORICAL_PERIOD_STATE|HISTORICAL_DRILLDOWN_STATE/);
  assert.match(index, /function renderEntity\(code,options=\{\}\)/);
});

test("la finca se resuelve exclusivamente desde lotCompact l[8] → l[0]", () => {
  const api = productionGeoApi();
  const lots = api.lotIdsForEntity({ code: "759", entityType: "finca" }, historico.lotCompact);
  assert.equal(lots.length, 18);
  assert.ok(lots.includes("75907"));
  assert.ok(lots.includes("75907A"));
  assert.match(enhancements, /text\(lot\[8\]\) === farmCode/);
  assert.match(enhancements, /geoLotId\(lot\[0\]\)/);
  assert.doesNotMatch(enhancements, /Codfinca\s*\+|CodSuerte\s*\+/i);
});

test("la suerte 75907 conserva identidad canónica y área de la App", () => {
  const api = productionGeoApi();
  const source = historico.lotCompact.find((lot) => String(lot[0]) === "75907");
  const manifest = JSON.parse(read("../../../shared/geo/data/manifest.json"));
  const zone = manifest.lotIndex["75907"];
  const collection = JSON.parse(read(`../../../shared/geo/data/${manifest.zones[zone].file}`));
  const feature = collection.features.find((item) => item.properties?.lotId === "75907");
  assert.ok(source);
  assert.deepEqual([...api.lotIdsForEntity({ entityType: "lote", code: "LOTE::75907" }, historico.lotCompact)], ["75907"]);
  assert.equal(source[12][0][3], 19.78);
  assert.equal(feature?.geometry?.type, "MultiPolygon");
  assert.equal(feature?.properties?.fragmentCount, 2);
  assert.match(enhancements, /Área oficial App:/);
  assert.match(enhancements, /fragmentCount/);
});

test("el modal es accesible, responsive y restaura el foco", () => {
  assert.match(enhancements, /class="casur-geo-dialog" role="dialog" aria-modal="true"/);
  assert.match(enhancements, /aria-labelledby="casurGeoTitle" aria-describedby="casurGeoStatus"/);
  assert.match(enhancements, /event\.key === "Escape"/);
  assert.match(enhancements, /!focusable\.includes\(document\.activeElement\)/);
  assert.match(enhancements, /event\.shiftKey \? last : first/);
  assert.match(enhancements, /target\.focus\(\{ preventScroll: true \}\)/);
  assert.match(enhancements, /fitToData/);
  assert.match(enhancements, /Volver a la ficha/);
  assert.match(styles, /@media\(max-width:719px\)/);
  assert.match(styles, /height:100dvh/);
  assert.match(styles, /min-height:44px/);
  assert.match(styles, /\.casur-geo-dialog>\.casur-geo-head[^}]*background:[^;]+!important/);
  assert.match(styles, /\.casur-geo-layer,.casur-geo-action\{display:none!important\}/);
});

test("finca y suerte toleran geometrías faltantes sin aproximar otra suerte", () => {
  const manifest = JSON.parse(read("../../../shared/geo/data/manifest.json"));
  assert.equal(manifest.lotIndex["99347A"], undefined);
  assert.match(enhancements, /await geo\.getLotGeometry\(lotIds\[0\]\)/);
  assert.match(enhancements, /await geo\.getLotGeometries\(lotIds\)/);
  assert.match(enhancements, /Polígono no disponible en la referencia geográfica actual\./);
  assert.match(enhancements, /Ninguna suerte de esta finca tiene polígono/);
  assert.match(enhancements, /\$\{available\} de \$\{lotIds\.length\} suertes con polígono/);
  assert.doesNotMatch(enhancements, /nearest|vecin[oa]|aproximad/i);
});

test("Producción declara VF54.7 en sus fuentes de versión activas", () => {
  const pkg = JSON.parse(read("../package.json"));
  const embedded = JSON.parse(index.match(/<script id="casurEmbeddedPwaAssets"[^>]*>(\{.*?\})<\/script>/s)?.[1] || "{}");
  assert.equal(pkg.version, "54.7.0");
  assert.match(read("../README_GITHUB.md"), /^# Producción Suertes CASUR · VF54\.7/m);
  assert.match(read("../VERSION.txt"), /^VF54\.7 CASUR/m);
  assert.match(index, /var VERSION='VF54\.7-geo-1-/);
  assert.match(Buffer.from(embedded["README_GITHUB.md"], "base64").toString("utf8"), /VF54\.7/);
  assert.match(Buffer.from(embedded["VERSION.txt"], "base64").toString("utf8"), /^VF54\.7/);
});
