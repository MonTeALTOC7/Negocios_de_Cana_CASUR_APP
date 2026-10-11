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
const historicalEngineSource = read("../js/historical-engine.js");
const styles = read("../css/casur-upgrade.css");
const historico = JSON.parse(read("../data/historico.json"));
const cronoMatch = index.match(/window\.CRONO_DATA = window\.CASUR_REMOTE_CRONO\|\|(\{[^\r\n]+\});/);
const crono = JSON.parse(cronoMatch?.[1] || "{}");

const historicalEngineContext = vm.createContext({});
new vm.Script(historicalEngineSource, { filename: "historical-engine.js" }).runInContext(historicalEngineContext);
const historicalEngine = historicalEngineContext.CASUR_HISTORICAL_ENGINE;

function productionGeoApi() {
  const window = {
    CASUR_HISTORICAL_ENGINE: historicalEngine,
    APP_DATA: historico,
    CRONO_DATA: crono,
    addEventListener() {},
  };
  window.window = window;
  const context = vm.createContext({
    window,
    document: { baseURI: "http://127.0.0.1:8765/modules/produccion/", getElementById() { return null; } },
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
    "../../riego/assets/html2canvas.esm-BfxBtG_O.js",
  ].forEach((relative) => assert.ok(fs.existsSync(path.resolve(testRoot, relative)), `falta ${relative}`));
  assert.match(enhancements, /html2canvas\.esm-BfxBtG_O\.js/);
  assert.doesNotMatch(enhancements, /https?:\/\/[^"']*html2canvas/i);
});

test("las acciones GEO se agregan sin envolver ni reemplazar renderEntity", () => {
  assert.match(enhancements, /installGeoObservers\(\)/);
  assert.match(enhancements, /enhanceCronoGeoView/);
  assert.match(enhancements, /dataset\.casurGeoAction/);
  assert.match(enhancements, /querySelector\("\.casur-visual-actions"\)/);
  assert.match(enhancements, /className = "casur-visual-action map no-print"/);
  assert.doesNotMatch(enhancements, /window\.renderEntity\s*=(?!=)/);
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
  assert.equal(feature?.properties?.anchor?.length, 2);
  assert.match(enhancements, /geoRecordForLot/);
  assert.match(enhancements, /\["TCH 25\/26"/);
  assert.match(enhancements, /\["Est\. 26\/27"/);
  assert.match(enhancements, /<b>Coordenada de referencia<\/b>/);
  assert.doesNotMatch(enhancements, /<b>Anchor<\/b>/);
});

test("Cronológico es la fuente primaria del contexto de finca 759 y 993", () => {
  const api = productionGeoApi();
  const lots759 = api.currentLotIds("759", crono);
  const lots993 = api.currentLotIds("993", crono);
  assert.equal(lots759.length, 10);
  assert.ok(lots759.includes("75907"));
  assert.equal(lots993.length, 49);
  assert.ok(lots993.includes("99325"));
  assert.ok(lots993.includes("99347A"));
  assert.match(enhancements, /producer\?\.details \|\| \[\]/);
  assert.match(index, /dataset\.geoScope=suerte\?'lot':'farm'/);
});

test("el modal es accesible, responsive y restaura el foco", () => {
  assert.match(enhancements, /class="casur-geo-dialog" role="dialog" aria-modal="true"/);
  assert.match(enhancements, /aria-labelledby="casurGeoTitle" aria-describedby="casurGeoStatus"/);
  assert.match(enhancements, /event\.key === "Escape"/);
  assert.match(enhancements, /!focusable\.includes\(document\.activeElement\)/);
  assert.match(enhancements, /event\.shiftKey \? last : first/);
  assert.match(enhancements, /target\.focus\(\{ preventScroll: true \}\)/);
  assert.match(enhancements, /fitToData/);
  assert.match(enhancements, /fitToLot/);
  assert.match(enhancements, /id="casurGeoFitFarm" disabled>Finca completa<\/button>/);
  assert.match(enhancements, /id="casurGeoFitLot" disabled>Centrar seleccionada<\/button>/);
  assert.match(enhancements, /id="casurGeoPngFarm" disabled>PNG finca<\/button>/);
  assert.match(enhancements, /id="casurGeoPngLot" disabled>PNG suerte<\/button>/);
  assert.match(enhancements, /\$\("casurGeoFitFarm"\)\.addEventListener\("click"[\s\S]+?fitToData/);
  assert.match(enhancements, /\$\("casurGeoFitLot"\)\.addEventListener\("click"[\s\S]+?selectLot\?\.\(origin, \{ fit: true \}\)[\s\S]+?fitToLot/);
  assert.match(enhancements, /fitLot\.textContent = origin \? `Volver a \$\{origin\}` : "Centrar seleccionada"/);
  assert.doesNotMatch(enhancements, /id="casurGeoFit" disabled/);
  assert.match(enhancements, /target="_blank" rel="noopener noreferrer"/);
  assert.match(enhancements, /data-geo-copy/);
  assert.match(enhancements, /data-geo-card-toggle aria-controls="casurGeoCardExpanded"/);
  assert.match(enhancements, /aria-expanded", String\(!geoCardCollapsed\)/);
  assert.match(enhancements, /Expandir información del mapa/);
  assert.match(enhancements, /window\.matchMedia\?\.\("\(max-width: 719px\)"\)/);
  assert.match(enhancements, /class="casur-geo-icon-action"[^>]+title="Copiar coordenada"/);
  assert.match(enhancements, /title="Abrir en Google Maps"/);
  assert.doesNotMatch(enhancements, />Google Maps ↗</);
  assert.match(enhancements, /Volver a la ficha/);
  assert.match(styles, /@media\(max-width:719px\)/);
  assert.match(styles, /height:100dvh/);
  assert.match(styles, /min-height:44px/);
  assert.match(styles, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(styles, /\.casur-geo-export-sheet[^}]*width:1600px/);
  assert.match(styles, /\.casur-geo-card\[data-collapsed="true"\]/);
  assert.match(styles, /\.casur-geo-card-summary/);
  assert.match(styles, /\.casur-geo-dialog>\.casur-geo-head[^}]*background:[^;]+!important/);
  assert.match(styles, /\.casur-geo-layer,.casur-geo-action\{display:none!important\}/);
});

test("Cronológico conserva fuente operativa y sustituye Estado por Destino", () => {
  const api = productionGeoApi();
  const producer = crono.producers.find((item) => String(item.code) === "993");
  const context = {
    source: "cronologico",
    entityType: "lote",
    farmCode: "993",
    name: producer.name,
    currentRows: producer.details,
  };
  const markup = api.chronologicalCardMarkup(context, "99325", false);
  const interactiveMarkup = api.chronologicalCardMarkup(context, "99325", true);
  ["Área", "Edad", "Corte", "TCH 25/26", "Est. 26/27", "Variedad", "Riego", "N.º riegos", "Destino"]
    .forEach((label) => assert.match(markup, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
  assert.match(markup, /Semilla/);
  assert.doesNotMatch(markup, />Estado</);
  assert.doesNotMatch(markup, /data-geo-view-detail/, "la lámina exportada no contiene acciones");
  assert.doesNotMatch(interactiveMarkup, /data-geo-view-detail/, "la tarjeta cronológica usa solo la navegación inferior");
});

test("Histórico usa todas las zafras del motor y nunca currentRows cronológico", () => {
  const api = productionGeoApi();
  const poisonedContext = {
    source: "historico",
    farmCode: "759",
    name: "Jesús María",
    currentRows: [{ codLote: "75907", tch: 9999, katm: 9999, edadExcel: 9999, corte: "inventado", destino: "inventado" }],
  };
  const normalized = historicalEngine.normalizeHistoricalRows(historico.lotCompact);
  const rows = historicalEngine.filterHistoricalRows(normalized, { lotId: "75907" });
  const seasons = historicalEngine.groupHistoricalBySeason(rows);
  const expectedLatest = historicalEngine.aggregateHistoricalRows(
    historicalEngine.filterHistoricalRows(rows, null, [seasons.at(-1).zafra]),
  );
  const expectedAll = historicalEngine.aggregateHistoricalRows(rows);
  const expectedKpis = historicalEngine.buildHistoricalAgronomicKpis(rows, seasons.map((season) => season.zafra));
  const model = api.historicalCardModel(poisonedContext, "75907", historico.lotCompact);

  assert.equal(model.latestSeason, seasons.at(-1).zafra);
  assert.equal(model.latest.area, expectedLatest.area);
  assert.equal(model.latest.tch, expectedLatest.tch);
  assert.equal(model.latest.katm, expectedLatest.katm);
  assert.equal(model.allHistory.tch, expectedAll.tch);
  assert.equal(model.allHistory.katm, expectedAll.katm);
  assert.equal(model.allHistory.edad, expectedAll.edad);
  assert.equal(model.historicalKpis.seasonCount, expectedKpis.seasonCount);
  assert.equal(model.historicalKpis.tchChange, expectedKpis.tchChange);
  assert.equal(model.historicalKpis.tchCv, expectedKpis.tchCv);
  assert.deepEqual(
    [model.latestSeason, model.latest.area, model.latest.tch, model.allHistory.tch, model.allHistory.katm, model.allHistory.edad, model.historicalKpis.seasonCount, model.historicalKpis.tchChange, model.historicalKpis.tchCv],
    [2526, 19.78, 56.24, 72.05, 110.66, 11.74, 10, -7.17, 27.96],
  );
  assert.deepEqual([model.latest.katm, model.allHistory.katm], [81.24, 110.66]);

  const markup = api.historicalCardMarkup(poisonedContext, "75907", false);
  ["Última zafra", "Área últ. zafra", "TCH últ. zafra", "KATM últ. zafra", "TCH hist. pond.", "KATM hist. pond.", "Edad hist. pond.", "Zafras", "Cambio TCH", "CV TCH"]
    .forEach((label) => assert.match(markup, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
  assert.match(markup, /Cod\. Suerte 75907/);
  assert.match(markup, /Resumen por zafras/);
  assert.doesNotMatch(markup, /data-geo-view-detail/, "la tarjeta histórica no duplica la navegación inferior");
  ["Corte", "Destino", "Est. 26/27", "N.º riegos", "9999", "inventado"]
    .forEach((label) => assert.doesNotMatch(markup, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")));
});

test("resumen histórico de finca 759 proviene del mismo motor común", () => {
  const api = productionGeoApi();
  const context = { source: "historico", farmCode: "759", name: "Jesús María", currentRows: [] };
  const model = api.historicalCardModel(context, "", historico.lotCompact);
  assert.deepEqual(
    [model.latestSeason, model.latest.area, model.latest.ton, model.latest.tch, model.allHistory.tch, model.allHistory.katm, model.allHistory.edad, model.historicalKpis.seasonCount, model.historicalKpis.lotCount, model.historicalKpis.tchChange, model.historicalKpis.tchCv],
    [2526, 130.88, 8013.43, 61.23, 82.21, 107.44, 11.73, 10, 18, -11.49, 14.92],
  );
  const markup = api.historicalCardMarkup(context, "", false);
  assert.match(markup, /Finca 759 · Histórico/);
  assert.match(markup, /Área última zafra/);
  assert.match(markup, /Ton última zafra/);
  assert.match(markup, /Suertes históricas/);
  assert.doesNotMatch(markup, /Seleccione una suerte/);
});

test("origen, navegación canónica y exportación mantienen la suerte explorada", () => {
  const api = productionGeoApi();
  const lot = historico.lotCompact.find((row) => String(row[0]) === "99325");
  const context = api.historicalContext({ entityType: "lote", code: "LOTE::99325", codLote: "99325", name: lot[9] });
  const model = api.historicalCardModel(context, "99325", historico.lotCompact);
  const cardMarkup = api.historicalCardMarkup(context, "99325", false);
  assert.equal(context.originLotId, "99325");
  assert.equal(context.selectedLotId, "99325");
  assert.deepEqual([model.latest.katm, model.allHistory.katm], [112.83, 107.87]);
  assert.match(cardMarkup, /KATM últ\. zafra[\s\S]*112\.83/);
  assert.match(cardMarkup, /KATM hist\. pond\.[\s\S]*107\.87/);
  assert.match(cardMarkup, /Cod\. Suerte 99325/);
  assert.doesNotMatch(cardMarkup, /data-geo-view-detail/);
  assert.match(enhancements, /geoActiveContext\.selectedLotId = selected/);
  assert.match(enhancements, /window\.renderEntity\(`LOTE::\$\{selected\}`,[\s\S]*preserveDrilldown: true/);
  assert.match(enhancements, /window\.selectCronoSuerteSuggestion\(farmCode, record\.suerte\)/);
  assert.match(enhancements, /closeCasurGeoDialog\(\);[\s\S]*requestAnimationFrame/);
  assert.equal(api.exportFilename({ source: "cronologico", farmCode: "993", name: "Pansaco" }, "lot", "99325"), "CASUR_Mapa_Cronologico_99325.png");
  assert.equal(api.exportFilename({ source: "historico", farmCode: "759", name: "Jesús María" }, "lot", "75907"), "CASUR_Mapa_Historico_75907.png");
  assert.equal(api.exportFilename({ source: "cronologico", farmCode: "993", name: "Pansaco" }, "farm", ""), "CASUR_Mapa_Finca_993_Pansaco.png");
  assert.match(enhancements, /Mapa histórico · \$\{context\.name/);
  assert.match(enhancements, /Suerte \$\{geoSuerteLabel\(context, normalized\)\} · Cod\. \$\{normalized/);
  assert.match(enhancements, /context\.name \|\| `Finca \$\{context\.farmCode\}`\} · \$\{geoHistoricalLotSubject/);
  assert.match(enhancements, /geoActiveContext\.source === "historico"\s*\? `\$\{features\.length\} de \$\{lotIds\.length\} geometrías del contexto`/);
});

test("la exportación GEO crea un mapa temporal sin volver a cargar GeoJSON", () => {
  assert.match(enhancements, /createMap\(mapNode,[\s\S]*controller\.setLots\(geoFeatures/);
  assert.match(enhancements, /fitPadding: \[56, 56\]/);
  assert.match(enhancements, /maxFitZoom: 17/);
  assert.match(enhancements, /useCORS: true/);
  assert.match(enhancements, /scrollX: 0,\s*scrollY: 0/);
  assert.match(enhancements, /const priorScroll = \{ x: window\.scrollX \|\| 0, y: window\.scrollY \|\| 0 \}/);
  assert.match(enhancements, /window\.scrollTo\(0, 0\)[\s\S]*window\.scrollTo\(priorScroll\.x, priorScroll\.y\)/);
  assert.match(enhancements, /allowTaint: false/);
  assert.match(enhancements, /canvas\.toDataURL\("image\/png"\)/);
  assert.match(enhancements, /geoInlineExportTiles/);
  assert.match(enhancements, /geoRasterizeExportMap/);
  assert.match(enhancements, /getBoundingClientRect\(\)/);
  assert.match(enhancements, /fetch\(source, \{ mode: "cors", cache: "force-cache" \}\)/);
  assert.match(enhancements, /El mapa base falló durante la captura/);
  assert.match(enhancements, /geoExportAttribution/);
  assert.match(enhancements, /casur-geo-export-sheet--\$\{context\.source === "historico"/);
  assert.match(enhancements, /Referencia agrícola CASUR/);
  assert.doesNotMatch(enhancements, /Lámina ejecutiva ·/);
  assert.match(styles, /\.casur-geo-export-map-host\{width:1536px;height:748px\}/);
  assert.match(styles, /\.casur-geo-export-body\{display:grid;grid-template:minmax\(0,1fr\)\/minmax\(0,1fr\);min-height:0\}/);
  assert.match(styles, /\.casur-geo-export-sheet \.casur-geo-card\{position:static;[^}]*grid-area:1\/1;[^}]*width:330px/);
  assert.doesNotMatch(enhancements, /getLotGeometr(?:y|ies)\([^)]*export/i);
});

test("finca y suerte toleran geometrías faltantes sin aproximar otra suerte", () => {
  const manifest = JSON.parse(read("../../../shared/geo/data/manifest.json"));
  assert.equal(manifest.lotIndex["99347A"], undefined);
  assert.match(enhancements, /await geo\.getLotGeometries\(lotIds\)/);
  assert.match(enhancements, /Ninguna suerte de esta finca tiene polígono/);
  assert.match(enhancements, /no tiene polígono disponible/);
  assert.match(enhancements, /Sin registro cronológico actual/);
  assert.doesNotMatch(enhancements, /nearest|aproximad/i);
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
