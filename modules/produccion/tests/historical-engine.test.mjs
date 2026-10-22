import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const index = fs.readFileSync(path.join(testRoot, "../index.html"), "utf8");
const enhancements = fs.readFileSync(path.join(testRoot, "../js/casur-enhancements.js"), "utf8");
await import("../js/historical-engine.js");

const {
  normalizeHistoricalRows,
  resolvePeriod,
  reconcilePeriodSelection,
  filterHistoricalRows,
  aggregateHistoricalRows,
  compareHistoricalRows,
  buildHistoricalChartModel,
  groupHistoricalBySeason,
  buildCurrentDistanceIndex,
  currentDistanceForLot,
  calculateCurrentFarmWeightedKm,
  buildHistoricalAgronomicKpis,
  groupHistoricalByLot,
  buildHistoricalDrilldownModel,
  updateHistoricalDrilldownState,
  historicalMultiCatalog,
  updateHistoricalMultiSelection,
  resolveHistoricalMultiSelection,
  buildHistoricalMultiAnalysis,
} = globalThis.CASUR_HISTORICAL_ENGINE;

const historico = JSON.parse(fs.readFileSync(path.join(testRoot, "../data/historico.json"), "utf8"));
const cronologico = JSON.parse(fs.readFileSync(path.join(testRoot, "../data/cronologico.json"), "utf8"));
const officialRows = normalizeHistoricalRows(historico.lotCompact);
const officialDistanceIndex = buildCurrentDistanceIndex(cronologico.producers);
const isMainRow = (row) => String(row.farmCode) !== "16" && !String(row.zona).toLowerCase().includes("0-maquila");
const sampleLotCompact = [
  ["10001", "Lote 10001", "Norte", "V1", "Gravedad", "Propio", null, 0, "100", "Finca A", "01", [
    [2021, 10, 500, 50, 90, 10, 2],
    [2122, 20, 1500, 75, 120, null, 1],
  ], []],
  ["10002", "Lote 10002", "Norte", "V2", "Secano", "Propio", null, 0, "100", "Finca A", "02", [
    [2122, 5, 250, 50, null, 14, 3],
  ], []],
];

const multiLots = [
  { farmCode: "100", farmName: "Finca A", lotId: "10001", suerte: "01" },
  { farmCode: "100", farmName: "Finca A", lotId: "10002", suerte: "02" },
  { farmCode: "200", farmName: "Finca B", lotId: "20001", suerte: "01" },
];
const multiRows = [
  { ...multiLots[0], zafra: 2021, area: 10, ton: 100, katm: 80, edad: 10 },
  { ...multiLots[1], zafra: 2021, area: 30, ton: 600, katm: 120, edad: null },
  { ...multiLots[2], zafra: 2021, area: 10, ton: 500, katm: null, edad: 12 },
  { ...multiLots[0], zafra: 2022, area: 10, ton: 200, katm: 100, edad: 11 },
];
const multiCatalog = historicalMultiCatalog(multiLots);

test("modelo multifinca combina fincas completas y parciales sin duplicar suertes", () => {
  let selection = updateHistoricalMultiSelection({}, { type: "addFarm", farmCode: "100" }, multiCatalog);
  selection = updateHistoricalMultiSelection(selection, { type: "addLot", farmCode: "100", lotId: "10001" }, multiCatalog);
  selection = updateHistoricalMultiSelection(selection, { type: "addLot", farmCode: "200", lotId: "20001" }, multiCatalog);
  selection = updateHistoricalMultiSelection(selection, { type: "addLot", farmCode: "200", lotId: "20001" }, multiCatalog);
  assert.deepEqual(resolveHistoricalMultiSelection(selection, multiCatalog).map((x) => x.lotId), ["10001", "10002", "20001"]);
  selection = updateHistoricalMultiSelection(selection, { type: "removeLot", farmCode: "100", lotId: "10001" }, multiCatalog);
  assert.deepEqual(selection["100"], { mode: "partial", lotIds: ["10002"] });
  selection = updateHistoricalMultiSelection(selection, { type: "addFarm", farmCode: "100" }, multiCatalog);
  assert.equal(selection["100"].mode, "full");
  selection = updateHistoricalMultiSelection(selection, { type: "removeFarm", farmCode: "200" }, multiCatalog);
  assert.equal(selection["200"], undefined);
  assert.equal(resolveHistoricalMultiSelection(updateHistoricalMultiSelection(selection, { type: "clear" }, multiCatalog), multiCatalog).length, 0);
});

test("dos fincas completas y dos suertes parciales se resuelven sin usar el Cronológico vigente", () => {
  let both = updateHistoricalMultiSelection({}, { type: "addFarm", farmCode: "100" }, multiCatalog);
  both = updateHistoricalMultiSelection(both, { type: "addFarm", farmCode: "200" }, multiCatalog);
  assert.deepEqual(resolveHistoricalMultiSelection(both, multiCatalog).map((lot) => lot.lotId), ["10001", "10002", "20001"]);
  let partial = updateHistoricalMultiSelection({}, { type: "addLot", farmCode: "100", lotId: "10001" }, multiCatalog);
  partial = updateHistoricalMultiSelection(partial, { type: "addLot", farmCode: "100", lotId: "10002" }, multiCatalog);
  assert.deepEqual(partial["100"], { mode: "partial", lotIds: ["10001", "10002"] });
  const historicalOnly = historicalMultiCatalog([{ farmCode: "100", farmName: "Finca A", lotId: "10099", suerte: "99" }]);
  const selected = updateHistoricalMultiSelection({}, { type: "addFarm", farmCode: "100" }, historicalOnly);
  assert.deepEqual(resolveHistoricalMultiSelection(selected, historicalOnly).map((lot) => lot.lotId), ["10099"]);
});

test("Maquila y universo principal no se mezclan en una selección", () => {
  const catalog = historicalMultiCatalog([...multiLots, { farmCode: "300", farmName: "Maquila", lotId: "30001", suerte: "01", isMaquila: true }]);
  const principal = { "100": { mode: "full" } };
  assert.throws(() => updateHistoricalMultiSelection(principal, { type: "addFarm", farmCode: "300" }, catalog), /Maquila/);
  assert.throws(() => resolveHistoricalMultiSelection({ ...principal, "300": { mode: "full" } }, catalog), /Maquila/);
  assert.throws(() => historicalMultiCatalog([
    multiLots[0], { ...multiLots[1], isMaquila: true },
  ]), /mezcla suertes de Maquila y producción principal/);
});

test("multifinca pondera TCH por toneladas/área y KATM solo por toneladas con dato", () => {
  const selection = { "100": { mode: "full" }, "200": { mode: "partial", lotIds: ["20001"] } };
  const result = buildHistoricalMultiAnalysis(multiRows, selection, multiCatalog, "latest");
  assert.deepEqual(result.selectedZafras, [2022]);
  const first = buildHistoricalMultiAnalysis(multiRows, selection, multiCatalog, "custom", [2021]);
  assert.equal(first.consolidated.area, 50);
  assert.equal(first.consolidated.tch, 24);
  assert.equal(first.consolidated.katm, 114.29);
  assert.equal(first.consolidated.edad, 11);
  assert.equal(first.consolidated.missingKatmRows, 1);
  const all = buildHistoricalMultiAnalysis(multiRows, selection, multiCatalog, "all");
  assert.equal(all.consolidated.areaAccumulated, 60);
  assert.equal(all.consolidated.areaAverage, 30);
  assert.equal(all.farms.find((farm) => farm.farmCode === "200").areaAverage, 5);
  assert.equal(all.farms.find((farm) => farm.farmCode === "200").areaAverageObserved, 10);
  assert.equal(all.farms.find((farm) => farm.farmCode === "200").zafrasWithData.length, 1);
  assert.equal(all.consolidated.missingLotSeasons, 2);
});

test("personalizado conserva solicitudes y nunca sustituye silencio por Última al cambiar alcance", () => {
  const only200 = { "200": { mode: "full" } };
  const partial = buildHistoricalMultiAnalysis(multiRows, only200, multiCatalog, "custom", [2021, 2022]);
  assert.deepEqual(partial.requestedCustomZafras, [2021, 2022]);
  assert.deepEqual(partial.selectedZafras, [2021]);
  assert.deepEqual(partial.unavailableCustomZafras, [2022]);
  assert.equal(partial.periodStatus, "partial");
  const none = buildHistoricalMultiAnalysis(multiRows, only200, multiCatalog, "custom", [2022]);
  assert.deepEqual(none.selectedZafras, []);
  assert.equal(none.periodStatus, "no-data");
  assert.equal(none.consolidated.area, null);
  const restored = buildHistoricalMultiAnalysis(multiRows, { "100": { mode: "partial", lotIds: ["10001"] } }, multiCatalog, "custom", [2022]);
  assert.deepEqual(restored.selectedZafras, [2022]);
  assert.equal(restored.periodStatus, "ready");
  assert.deepEqual(buildHistoricalMultiAnalysis(multiRows, only200, multiCatalog, "custom", []).selectedZafras, []);
});

test("periodos de 3, 5 y personalizado no contiguo comparten la misma selección", () => {
  const rows = [2021, 2022, 2023, 2024, 2025].map((zafra, i) => ({ ...multiLots[0], zafra, area: 10 + i, ton: 100 + i * 10, katm: 90, edad: 11 }));
  const selection = { "100": { mode: "partial", lotIds: ["10001"] } };
  assert.deepEqual(buildHistoricalMultiAnalysis(rows, selection, multiCatalog, "last3").selectedZafras, [2023, 2024, 2025]);
  assert.equal(buildHistoricalMultiAnalysis(rows, selection, multiCatalog, "last3").consolidated.areaAverage, 13);
  assert.equal(buildHistoricalMultiAnalysis(rows, selection, multiCatalog, "last5").consolidated.areaAverage, 12);
  const custom = buildHistoricalMultiAnalysis(rows, selection, multiCatalog, "custom", [2021, 2025]);
  assert.deepEqual(custom.selectedZafras, [2021, 2025]);
  assert.equal(custom.consolidated.areaAverage, 12);
});

test("ausencia de zafra, área o toneladas nunca se convierte en cero acreditado", () => {
  const selection = { "100": { mode: "full" }, "200": { mode: "full" } };
  const result = buildHistoricalMultiAnalysis(multiRows, selection, multiCatalog, "all");
  const missingFarm = result.farms.find((farm) => farm.farmCode === "200");
  assert.equal(missingFarm.zafrasWithData.length, 1);
  assert.equal(missingFarm.areaAverage, 5);
  assert.equal(result.series.find((season) => season.zafra === 2022).contributingFarmCount, 1);
  const incomplete = buildHistoricalMultiAnalysis([{ ...multiLots[0], zafra: 2021, area: null, ton: null, katm: null }], { "100": { mode: "full" } }, multiCatalog);
  assert.equal(incomplete.consolidated.area, null);
  assert.equal(incomplete.consolidated.areaAverage, null);
  assert.equal(incomplete.consolidated.tch, null);
  assert.equal(incomplete.consolidated.katm, null);
  assert.equal(incomplete.consolidated.missingTonRows, 1);
  assert.equal(incomplete.consolidated.metricCoverage.tch.pct, null);
  assert.equal(incomplete.consolidated.metricCoverage.katm.pct, null);
  assert.equal(incomplete.consolidated.metricCoverage.edad.pct, null);
});

test("Km actual pondera áreas vigentes de la selección y no cambia con zafras", () => {
  const producers = [{ code: "100", details: [{ codLote: "10001", area: 10, distancia: 5 }, { codLote: "10002", area: 30, distancia: 0 }] }];
  const selection = { "100": { mode: "full" } };
  const first = buildHistoricalMultiAnalysis(multiRows, selection, multiCatalog, "custom", [2021], producers);
  const last = buildHistoricalMultiAnalysis(multiRows, selection, multiCatalog, "latest", [], producers);
  assert.equal(first.currentDistance.kmWeighted, 5);
  assert.equal(last.currentDistance.kmWeighted, 5);
  assert.equal(first.currentDistance.status, "partial");
  assert.equal(first.currentDistance.coveragePct, 25);
  const precise = buildHistoricalMultiAnalysis(multiRows, { "100": { mode: "partial", lotIds: ["10001"] }, "200": { mode: "full" } }, multiCatalog, "all", [], [
    { code: "100", details: [{ codLote: "10001", area: 99, distancia: 1.0049 }] },
    { code: "200", details: [{ codLote: "20001", area: 1, distancia: 1.0149 }] },
  ]);
  assert.equal(precise.currentDistance.kmWeighted, 1.01); // Sin redondear antes cada finca.
});

test("caso oficial Dolores completa + Rancho Peirano 01/02 concilia con la ficha individual", () => {
  const catalog = historicalMultiCatalog(historico.lotCompact.map((lot) => ({ farmCode: lot[8], farmName: lot[9], lotId: lot[0], suerte: lot[10] })));
  const selection = { "256": { mode: "full" }, "983": { mode: "partial", lotIds: ["98301", "98302"] } };
  const latest = buildHistoricalMultiAnalysis(officialRows, selection, catalog, "latest", [], cronologico.producers);
  const last3 = buildHistoricalMultiAnalysis(officialRows, selection, catalog, "last3", [], cronologico.producers);
  assert.deepEqual(latest.selectedZafras, [2526]);
  assert.equal(latest.consolidated.area, 188.78);
  assert.equal(latest.consolidated.tch, 40.57);
  assert.equal(latest.consolidated.katm, 103.9);
  assert.equal(latest.consolidated.metricCoverage.edad.area, 123);
  assert.equal(latest.consolidated.metricCoverage.edad.eligibleArea, 188.78);
  assert.equal(latest.consolidated.metricCoverage.edad.pct, 65.16);
  assert.equal(latest.consolidated.metricCoverage.tch.pct, 100);
  assert.equal(latest.consolidated.metricCoverage.katm.pct, 100);
  assert.deepEqual(last3.selectedZafras, [2324, 2425, 2526]);
  assert.equal(last3.consolidated.areaAccumulated, 566.52);
  assert.equal(last3.consolidated.areaAverage, 188.84);
  assert.equal(last3.consolidated.tch, 48.92);
  assert.equal(last3.consolidated.katm, 108.56);
  assert.equal(last3.consolidated.metricCoverage.edad.area, 500.74);
  assert.equal(last3.consolidated.metricCoverage.edad.eligibleArea, 566.52);
  assert.equal(last3.consolidated.metricCoverage.edad.pct, 88.39);
  const dolores = last3.farms.find((farm) => farm.farmCode === "256");
  const individual = buildHistoricalAgronomicKpis(officialRows.filter((row) => row.farmCode === "256"), last3.selectedZafras);
  assert.equal(dolores.areaAccumulated, 475.89);
  assert.equal(dolores.areaAverage, 158.63);
  assert.equal(dolores.areaAverage, individual.areaAverage);
  assert.equal(dolores.tch, individual.tch);
  const season1920 = buildHistoricalMultiAnalysis(officialRows, selection, catalog, "custom", [1920]);
  assert.equal(season1920.consolidated.area, 377.74);
  assert.equal(officialRows.find((row) => row.lotId === "98303" && row.zafra === 1920).area, 21.88);
  assert.equal(season1920.consolidated.area + 21.88, 399.62);
  assert.ok(!season1920.selection.find((farm) => farm.farmCode === "983").lotIds.includes("98303"));
});

test("Etapa A usa un solo motor y no atribuye el detalle de otra zafra", () => {
  const ui = index.slice(index.indexOf("/* VF51 · Prueba quirúrgica"), index.indexOf("/* VF51 · Mejora quirúrgica: experiencia de selección múltiple en Cronológico"));
  assert.match(ui, /buildHistoricalMultiAnalysis\(currentHistoricalRows\(\),farmSelection/);
  assert.match(ui, /changeHistoricoMultiPeriod=changeMultiPeriod/);
  assert.match(ui, /toggleHistoricoMultiZafra=toggleMultiZafra/);
  assert.match(ui, /addHistoricoMultiFarm=addFarm/);
  assert.match(ui, /removeHistoricoMultiFarm=removeFarm/);
  assert.ok(!ui.includes("function detailAt(e,z)"));
  assert.ok(!ui.includes("function aggregatePeriod(zset)"));
  assert.ok(!ui.includes("function renderMultiSummary(){"));
  assert.ok(!ui.includes("TAH estimado"));
  assert.match(ui, /historicalChart\(\{scopeRows:rows,selectedZafras:period\}/);
  assert.match(ui, /historicalChart\(\{scopeRows:farmRows,selectedZafras:period\}/);
  assert.match(ui, /function multiComparisonChart\(result,rows,reportMetric\)/);
  assert.match(ui, /function multiSeasonTable\(rows,zafras,distance\)/);
  assert.match(ui, /function multiLotTable\(rows\)/);
  assert.match(ui, /if\(catalog\(\)\.has\(first\)\)\{renderProducer\(first\);return;\}/);
  assert.match(ui, /hist-multi-quality/);
  assert.match(ui, /hist-multi-scroll-hint/);
  assert.match(ui, /result\.periodStatus==='no-data'/);
  assert.match(ui, /Detalle de calidad de datos/);
  assert.match(ui, /result\.requestedCustomZafras\.length:period\.length/);
  assert.match(ui, /if\(sel\)sel\.value=lot\.producerCode;toggleOne\(lot\.code,true\)/);
  assert.match(index, /hist-multi-summary-root:not\(\.hist-multi-stage-a\)/);
});

test("normaliza el esquema mínimo de lotCompact", () => {
  const [row] = normalizeHistoricalRows(sampleLotCompact);
  assert.deepEqual(Object.keys(row), [
    "lotId", "farmCode", "farmName", "suerte", "zafra", "area", "ton", "tchStored",
    "katm", "edad", "sourceCount", "variedad", "riego", "zona", "tenencia",
  ]);
  assert.deepEqual(row, {
    lotId: "10001", farmCode: "100", farmName: "Finca A", suerte: "01", zafra: 2021,
    area: 10, ton: 500, tchStored: 50, katm: 90, edad: 10, sourceCount: 2,
    variedad: "V1", riego: "Gravedad", zona: "Norte", tenencia: "Propio",
  });
});

test("row[6] se interpreta como sourceCount y nunca como corte", () => {
  const [row] = normalizeHistoricalRows(sampleLotCompact);
  assert.equal(row.sourceCount, 2);
  assert.equal(Object.hasOwn(row, "corte"), false);
});

test("suma sourceCount sin confundirlo con suertes únicas", () => {
  const result = aggregateHistoricalRows(normalizeHistoricalRows(sampleLotCompact));
  assert.equal(result.sourceCount, 6);
  assert.equal(result.suertes, 2);
  assert.equal(aggregateHistoricalRows(normalizeHistoricalRows(historico.lotCompact)).sourceCount, historico.meta.rows);
});

test("TCH se pondera mediante toneladas totales entre área total", () => {
  const result = aggregateHistoricalRows([
    { lotId: "A", area: 10, ton: 500 },
    { lotId: "B", area: 30, ton: 3000 },
  ]);
  assert.equal(result.tch, 87.5);
});

test("KATM se pondera por toneladas", () => {
  const result = aggregateHistoricalRows([
    { lotId: "A", area: 90, ton: 100, katm: 80 },
    { lotId: "B", area: 10, ton: 900, katm: 120 },
  ]);
  assert.equal(result.katm, 116);
});

test("KATM no se pondera por área", () => {
  const result = aggregateHistoricalRows([
    { lotId: "A", area: 90, ton: 100, katm: 80 },
    { lotId: "B", area: 10, ton: 900, katm: 120 },
  ]);
  const incorrectlyWeightedByArea = 84;
  assert.notEqual(result.katm, incorrectlyWeightedByArea);
});

test("KATM nulo excluye sus toneladas del numerador y denominador", () => {
  const result = aggregateHistoricalRows([
    { lotId: "A", area: 10, ton: 100, katm: 80 },
    { lotId: "B", area: 10, ton: 900, katm: null },
  ]);
  assert.equal(result.ton, 1000);
  assert.equal(result.katm, 80);
});

test("edad nula excluye su área del numerador y denominador", () => {
  const result = aggregateHistoricalRows([
    { lotId: "A", area: 10, ton: 500, edad: 10 },
    { lotId: "B", area: 90, ton: 4500, edad: null },
  ]);
  assert.equal(result.area, 100);
  assert.equal(result.edad, 10);
});

test("resuelve Última, 3, 5, Todas y Personalizado", async (t) => {
  const zafras = [2526, 2021, 2122, 2223, 2324, 2425, 2425];
  await t.test("default = Última", () => assert.deepEqual(resolvePeriod(zafras), [2526]));
  await t.test("Última", () => assert.deepEqual(resolvePeriod(zafras, "Última"), [2526]));
  await t.test("3", () => assert.deepEqual(resolvePeriod(zafras, "3"), [2324, 2425, 2526]));
  await t.test("5", () => assert.deepEqual(resolvePeriod(zafras, "5"), [2122, 2223, 2324, 2425, 2526]));
  await t.test("menos de N disponibles", () => assert.deepEqual(resolvePeriod([2324, 2425], "5"), [2324, 2425]));
  await t.test("Todas", () => assert.deepEqual(resolvePeriod(zafras, "Todas"), [2021, 2122, 2223, 2324, 2425, 2526]));
  await t.test("Personalizado contiguo", () => assert.deepEqual(resolvePeriod(zafras, "Personalizado", [2223, 2324, 2425]), [2223, 2324, 2425]));
  await t.test("Personalizado no contiguo", () => assert.deepEqual(resolvePeriod(zafras, "Personalizado", [2021, 2425]), [2021, 2425]));
  await t.test("Personalizado por rango", () => assert.deepEqual(resolvePeriod(zafras, "Personalizado", { from: 2223, to: 2425 }), [2223, 2324, 2425]));
  await t.test("Personalizado rechaza selección vacía", () => assert.throws(() => resolvePeriod(zafras, "Personalizado", []), /al menos una zafra/i));
});

test("cambiar de alcance elimina zafras no disponibles", () => {
  assert.deepEqual(reconcilePeriodSelection([2122, 2223], "custom", [2021, 2122]), [2122]);
  assert.deepEqual(reconcilePeriodSelection([2324, 2425], "custom", [2021, 2122]), [2425]);
});

test("una finca de una sola suerte agrega igual que esa suerte", () => {
  const rows = normalizeHistoricalRows([sampleLotCompact[0]]);
  const period = resolvePeriod(rows.map((row) => row.zafra), "Todas");
  const farm = aggregateHistoricalRows(filterHistoricalRows(rows, { farmCode: "100" }, period));
  const lot = aggregateHistoricalRows(filterHistoricalRows(rows, { lotId: "10001" }, period));
  assert.deepEqual(farm, lot);
});

test("groupHistoricalBySeason agrupa y ordena las zafras", () => {
  const groups = groupHistoricalBySeason(normalizeHistoricalRows(sampleLotCompact));
  assert.deepEqual(groups.map((group) => group.zafra), [2021, 2122]);
  assert.equal(groups[1].suertes, 2);
  assert.equal(groups[1].sourceCount, 4);
});

test("KPI agronómicos usan las ponderaciones normativas del motor", () => {
  const rows = normalizeHistoricalRows(sampleLotCompact);
  const result = buildHistoricalAgronomicKpis(rows, [2021, 2122]);
  assert.deepEqual(result, {
    area: 35, areaAverage: 17.5,
    tch: 64.29, katm: 112.5, edad: 11.33,
    tchChange: 20, tchChangeFrom: 2021, tchChangeTo: 2122,
    tchCv: 16.67, vsHistorical: 0, seasonCount: 2, lotCount: 2,
  });
});

test("Cambio TCH usa primera y última zafra efectivamente seleccionadas aunque no sean contiguas", () => {
  const rows = filterHistoricalRows(officialRows, { farmCode: "759" });
  const result = buildHistoricalAgronomicKpis(rows, [2122, 2425, 2526]);
  assert.equal(result.tchChange, -28.18);
  assert.equal(result.tchChangeFrom, 2122);
  assert.equal(result.tchChangeTo, 2526);
  assert.equal(result.seasonCount, 3);
});

test("una sola zafra devuelve N/D para Cambio y Variabilidad", () => {
  const rows = filterHistoricalRows(officialRows, { farmCode: "759" });
  const result = buildHistoricalAgronomicKpis(rows, [2526]);
  assert.equal(result.tchChange, null);
  assert.equal(result.tchChangeFrom, null);
  assert.equal(result.tchChangeTo, null);
  assert.equal(result.tchCv, null);
  assert.equal(result.seasonCount, 1);
});

test("Variabilidad TCH devuelve N/D cuando la media entre zafras es cero", () => {
  const rows = [
    { lotId: "A", zafra: 2021, area: 10, ton: 0 },
    { lotId: "A", zafra: 2122, area: 10, ton: 0 },
  ];
  const result = buildHistoricalAgronomicKpis(rows, [2021, 2122]);
  assert.equal(result.tch, 0);
  assert.equal(result.tchChange, 0);
  assert.equal(result.tchCv, null);
});

test("Variabilidad TCH calcula CV poblacional entre zafras, no entre lotes", () => {
  const rows = [
    { lotId: "A", zafra: 2021, area: 10, ton: 500 },
    { lotId: "B", zafra: 2021, area: 30, ton: 3000 },
    { lotId: "A", zafra: 2122, area: 10, ton: 600 },
  ];
  const result = buildHistoricalAgronomicKpis(rows, [2021, 2122]);
  const individualTch = [50, 100, 60];
  const individualMean = individualTch.reduce((sum, value) => sum + value, 0) / individualTch.length;
  const individualCv = Math.round((Math.sqrt(individualTch.reduce((sum, value) => sum + ((value - individualMean) ** 2), 0) / individualTch.length) / individualMean) * 10000) / 100;
  assert.equal(groupHistoricalBySeason(rows)[0].tch, 87.5);
  assert.equal(result.tchCv, 18.64);
  assert.notEqual(result.tchCv, individualCv, "no usa los TCH individuales 50, 100 y 60");
});

test("caso 759 · Últimas 5 conserva los KPI y agrega área cosechada del período", () => {
  const rows = filterHistoricalRows(officialRows, { farmCode: "759" });
  const selected = resolvePeriod(rows.map((row) => row.zafra), "last5");
  assert.deepEqual(buildHistoricalAgronomicKpis(rows, selected), {
    area: 730.64, areaAverage: 146.13,
    tch: 74.36, katm: 104.25, edad: 11.53,
    tchChange: -28.18, tchChangeFrom: 2122, tchChangeTo: 2526,
    tchCv: 12.86, vsHistorical: -7.85, seasonCount: 5, lotCount: 10,
  });
});

test("KPI agronómicos funcionan para una suerte y reutilizan su histórico completo", () => {
  const rows = filterHistoricalRows(officialRows, { lotId: "75907" });
  const selected = resolvePeriod(rows.map((row) => row.zafra), "last5");
  const result = buildHistoricalAgronomicKpis(rows, selected);
  const period = aggregateHistoricalRows(filterHistoricalRows(rows, null, selected));
  const full = aggregateHistoricalRows(rows);
  assert.equal(result.tch, period.tch);
  assert.equal(result.area, period.area);
  assert.equal(result.areaAverage, 19.78);
  assert.equal(result.katm, period.katm);
  assert.equal(result.edad, period.edad);
  assert.equal(result.vsHistorical, Math.round((period.tch - full.tch) * 100) / 100);
  assert.equal(result.lotCount, 1);
});

test("área de 99325 respeta todos los periodos y reconcilia la suma por zafra", () => {
  const rows = filterHistoricalRows(officialRows, { lotId: "99325" });
  const periods = [
    ["Última", "latest"], ["Últimas 3", "last3"], ["Últimas 5", "last5"], ["Todas", "all"],
    ["Personalizado", "custom", [2021, 2324, 2526]],
  ];
  periods.forEach(([label, mode, custom]) => {
    const selected = resolvePeriod(rows.map((row) => row.zafra), mode, custom);
    const periodRows = filterHistoricalRows(rows, null, selected);
    const seasons = groupHistoricalBySeason(periodRows);
    const sumBySeason = Math.round(seasons.reduce((sum, season) => sum + season.area, 0) * 100) / 100;
    const result = buildHistoricalAgronomicKpis(rows, selected);
    assert.equal(result.area, sumBySeason, `${label}: área del KPI debe conciliar con el detalle por zafra`);
    assert.equal(result.areaAverage, Math.round((sumBySeason / seasons.length) * 100) / 100, `${label}: promedio por zafra`);
    assert.equal(result.seasonCount, seasons.length);
  });
  assert.equal(buildHistoricalAgronomicKpis(rows, [2526]).area, 6.95);
  assert.equal(buildHistoricalAgronomicKpis(rows, [2122, 2223, 2324, 2425, 2526]).area, 34.75);
  assert.equal(buildHistoricalAgronomicKpis(rows, [1617, 1718, 1819, 1920, 2021, 2122, 2223, 2324, 2425, 2526]).area, 77.38);
});

test("área de finca 993 suma suertes por zafra y calcula el promedio principal", () => {
  const rows = filterHistoricalRows(officialRows, { farmCode: "993" });
  const selected = resolvePeriod(rows.map((row) => row.zafra), "last5");
  const result = buildHistoricalAgronomicKpis(rows, selected);
  const bySeason = groupHistoricalBySeason(filterHistoricalRows(rows, null, selected));
  assert.equal(result.area, 2257.75);
  assert.equal(result.areaAverage, 451.55);
  assert.equal(result.area, Math.round(bySeason.reduce((sum, season) => sum + season.area, 0) * 100) / 100);

  const keys = officialRows.map((row) => `${row.lotId}|${row.zafra}`);
  assert.equal(new Set(keys).size, keys.length, "los datos publicados tienen una fila consolidada por suerte y zafra");
});

test("área muestra N/D ante ausencia o incompletitud en lugar de un cero o un parcial", () => {
  const noArea = [
    { lotId: "A", zafra: 2021, area: null, ton: 500 },
    { lotId: "A", zafra: 2122, area: "", ton: 600 },
  ];
  const partial = [
    { lotId: "A", zafra: 2021, area: 10, ton: 500 },
    { lotId: "B", zafra: 2021, area: null, ton: 300 },
  ];
  for (const rows of [noArea, partial]) {
    const result = buildHistoricalAgronomicKpis(rows, null);
    assert.equal(result.area, null);
    assert.equal(result.areaAverage, null);
  }
});

test("Km SIAGRI vigente distingue Suerte y CodSuerte en los tres casos oficiales", () => {
  for (const [code, suerte, lotId, km] of [
    ["993", "25", "99325", 7.44],
    ["242", "01", "24201", 2.96],
    ["211", "01", "21101", 2],
  ]) {
    const lot = cronologico.producers.find((producer) => String(producer.code) === code)
      ?.details.find((row) => row.suerte === suerte);
    assert.equal(lot?.codLote, lotId);
    assert.equal(lot?.distancia, km);
    assert.equal(currentDistanceForLot(officialDistanceIndex, lotId).km, km);
    assert.ok(filterHistoricalRows(officialRows, { lotId }).length > 0);
  }
});

test("Pansaco 993 pondera 49 suertes vigentes y 409.08 ha, independientemente del Histórico", () => {
  const producer = cronologico.producers.find((item) => String(item.code) === "993");
  const result = calculateCurrentFarmWeightedKm(cronologico.producers, "993");
  const expected = Math.round(producer.details.reduce((sum, lot) => sum + lot.distancia * lot.area, 0)
    / producer.details.reduce((sum, lot) => sum + lot.area, 0) * 100) / 100;
  assert.ok(new Set(producer.details.map((lot) => lot.distancia)).size > 1);
  assert.equal(result.kmWeighted, expected);
  assert.equal(result.kmWeighted, 7.6);
  assert.equal(result.areaTotal, 409.08);
  assert.equal(result.areaCovered, 409.08);
  assert.equal(result.coveragePct, 100);
  assert.equal(result.lotCount, 49);
  assert.equal(result.lotCountWithKm, 49);
  assert.equal(result.status, "complete");
  assert.equal(result.reason, null);
  assert.equal(currentDistanceForLot(officialDistanceIndex, "99301").km, 8.09);
  assert.equal(currentDistanceForLot(officialDistanceIndex, "99323").km, 6.57);
  assert.equal(currentDistanceForLot(officialDistanceIndex, "99325").km, 7.44);
  assert.equal(currentDistanceForLot(officialDistanceIndex, "99331").km, 8.69);
});

test("el ponderado vigente no cambia entre filtros históricos ni por suertes históricas desaparecidas", () => {
  const rows = filterHistoricalRows(officialRows, { farmCode: "993" });
  assert.ok(rows.some((row) => row.lotId === "99323A"));
  assert.equal(currentDistanceForLot(officialDistanceIndex, "99323A").km, null);
  for (const mode of ["latest", "last3", "last5", "all", "custom"]) {
    const periods = resolvePeriod(rows.map((row) => row.zafra), mode, mode === "custom" ? [2122, 2526] : undefined);
    assert.ok(filterHistoricalRows(rows, null, periods).length > 0);
    assert.equal(calculateCurrentFarmWeightedKm(cronologico.producers, "993").kmWeighted, 7.6, mode);
  }
});

test("otra finca con Km distintos concilia contra todas las filas actuales", () => {
  const producer = cronologico.producers.find((item) => String(item.code) === "125");
  const expected = Math.round(producer.details.reduce((sum, lot) => sum + lot.distancia * lot.area, 0)
    / producer.details.reduce((sum, lot) => sum + lot.area, 0) * 100) / 100;
  assert.ok(new Set(producer.details.map((lot) => lot.distancia)).size > 1);
  assert.equal(calculateCurrentFarmWeightedKm(cronologico.producers, "125").kmWeighted, expected);
});

test("las fichas, tablas y exportadores integrados identifican el Km como referencia vigente", () => {
  assert.ok(index.includes("crono-operational-strip"));
  assert.ok(index.includes("'Distancia ponderada'"));
  assert.ok(index.includes("kpi(isLotFicha?'Distancia de referencia':'Distancia ponderada actual'"));
  assert.ok(index.includes("<th>Dist. ref. (km)</th>"));
  assert.ok(index.includes("<th>Distancia (km)</th>"));
  assert.ok(index.includes("Distancia de referencia actual, no histórica"));
  assert.ok(index.includes("Km pond. vigente"));
  assert.ok(index.includes("calculateCurrentFarmWeightedKm(C.producers,p?.code)"));
  assert.ok(index.includes("calculateCurrentFarmWeightedKm(window.CRONO_DATA&&window.CRONO_DATA.producers,scope.farmCode)"));
  assert.ok(!index.includes("Distancia (km): campo Km oficial del Cronológico SIAGRI"));
  assert.ok(index.includes("if(kind==='historico')return q('#printPanel')"));
  assert.ok(index.includes("if(kind==='cronologico')return q('#cronoPrintPanel')"));
});

test("CAP1 conserva seis KPI junto al gráfico TCH legible y sin tarjeta principal de toneladas estimadas", () => {
  const crono = index.slice(index.indexOf("function renderCronoScope"), index.indexOf("function runCronoSearch", index.indexOf("function renderCronoScope")));
  assert.match(crono, /single-suerte-layout/);
  assert.match(crono, /single-suerte-kpis/);
  assert.ok(!crono.includes("crono-highlight-metrics"));
  assert.ok(!crono.includes("crono-operational-strip"));
  const labels = ["Área total", "TCH/Z 25-26", "Edad", "Distancia (km)", "Variedad"];
  let position = 0;
  for (const label of labels) {
    const next = crono.indexOf(label, position);
    assert.ok(next >= position, `${label} conserva orden en la ficha`);
    position = next + label.length;
  }
  assert.match(crono, /fmt\(ageMonths\(rows\[0\]\),' meses'\)/);
  assert.ok(!crono.includes("Ton. estimadas 26/27"));
  assert.match(enhancements, /estimateKpi\("TCH estimado 26\/27"/);
  assert.match(enhancements, /estimate === null \? "N\/D"/);
  assert.ok(!enhancements.includes('estimateKpi("Ton. estimadas 26/27"'));
  assert.match(index, /function showCronoTrendTooltip\(point\)/);
  assert.match(index, /function pinCronoTrendTooltip\(point,event\)/);
  assert.match(index, /class="crono-trend-hit"/);
  assert.match(index, /\.crono-trend-tooltip,\.crono-trend-hit/);
  assert.match(index, /cards\.slice\(0,6\)/);
  assert.ok(index.includes(".casur-report-crono .table-wrap table{width:100%!important;table-layout:fixed!important"));
  assert.ok(index.includes(".casur-report-crono .table-wrap th,.casur-report-crono .table-wrap td{padding:4px 3px!important;white-space:normal!important"));
  assert.ok(index.includes(".casur-report-crono-general .table-wrap th,.casur-report-crono-general .table-wrap td{padding:4px 5px!important"));
  assert.ok(index.includes("pdfBlobFromCanvas(canvas,result.width>=1200||kind==='cronologico',result.safeBreaks,result.forcedBreaks,result.pageCanvases)"));
});

test("CAP3 recupera la jerarquía estable de ocho KPI históricos", () => {
  const entity = index.slice(index.indexOf("function renderEntity(code,options={})"), index.indexOf("function zafraSortValueCASUR", index.indexOf("function renderEntity(code,options={})")));
  const labels = ["Área cosechada", "TCH ponderado", "KATM ponderado", "Distancia ponderada actual", "Edad ponderada", "Cambio TCH", "Variabilidad TCH", "Vs histórico"];
  let position = 0;
  for (const label of labels) {
    const next = entity.indexOf(label, position);
    assert.ok(next >= position, `${label} respeta la jerarquía`);
    position = next + label.length;
  }
  assert.ok(!entity.includes("historical-kpi-complementary"));
  assert.match(index, /casur-report-historico>\.historical-agronomic-kpis\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});

test("Km faltante, cero normalizado y correspondencia ambigua no acreditan suerte individual", () => {
  const index = buildCurrentDistanceIndex([{ details: [
    { codLote: "A", distancia: 4, area: 2 },
    { codLote: "B", distancia: 0, area: 3 },
    { codLote: "C", distancia: 8 },
    { codLote: "C", distancia: 9 },
  ] }]);
  assert.equal(currentDistanceForLot(index, "A").km, 4);
  assert.equal(currentDistanceForLot(index, "B").km, null);
  assert.match(currentDistanceForLot(index, "C").reason, /ambigua/);
  assert.match(currentDistanceForLot(index, "D").reason, /Sin correspondencia/);
});

test("cobertura parcial informa porcentaje y excluye identidades ambiguas sin doble conteo", () => {
  const producers = [{ code: "100", details: [
    { codLote: "10001", area: 10, distancia: 5 },
    { codLote: "10002", area: 30, distancia: 8 },
    { codLote: "10003", area: 20, distancia: 6 },
  ] }];
  assert.equal(calculateCurrentFarmWeightedKm(producers, "100").kmWeighted, 6.83);
  producers[0].details.push({ codLote: "10004", area: 40, distancia: 0 });
  const partial = calculateCurrentFarmWeightedKm(producers, "100");
  assert.equal(partial.status, "partial");
  assert.equal(partial.kmWeighted, 6.83);
  assert.equal(partial.areaTotal, 100);
  assert.equal(partial.areaCovered, 60);
  assert.equal(partial.coveragePct, 60);
  producers[0].details.push({ codLote: "10002", area: 30, distancia: 8 }, { codLote: "10005", area: null, distancia: 9 });
  const ambiguous = calculateCurrentFarmWeightedKm(producers, "100");
  assert.equal(ambiguous.areaTotal, 100);
  assert.equal(ambiguous.areaCovered, 30);
  assert.equal(ambiguous.lotCount, 4);
  assert.match(ambiguous.reason, /ambigua/);
  assert.match(ambiguous.reason, /inválida/);
  producers[0].details.push({ codLote: "10001", area: null, distancia: 5 });
  assert.equal(calculateCurrentFarmWeightedKm(producers, "100").areaCovered, 20);
  assert.equal(calculateCurrentFarmWeightedKm(producers, "999").status, "unavailable");
  assert.match(calculateCurrentFarmWeightedKm([...producers, producers[0]], "100").reason, /ambigua/);
});

test("PDF no crea una página vacía por el margen blanco final del canvas", async () => {
  const start = index.indexOf("function bytesFromBase64");
  const end = index.indexOf("async function runAction", start);
  assert.ok(start > 0 && end > start);
  const pixels = new Uint8ClampedArray(10 * 50 * 4).fill(255);
  pixels[(12 * 10 + 5) * 4] = 0; // Última fila con contenido antes del salto de página.
  const canvas = { width: 10, height: 50, getContext: () => ({ getImageData: () => ({ data: pixels }) }) };
  const context = vm.createContext({ canvas, atob, Blob, TextEncoder, Uint8Array, document: {
    createElement: () => ({ width: 0, height: 0,
      getContext: () => ({ fillRect() {}, drawImage() {} }),
      toDataURL: () => "data:image/jpeg;base64,AA==" }),
  } });
  vm.runInContext(index.slice(start, end), context);
  const pdf = vm.runInContext("pdfBlobFromCanvas(canvas,false)", context);
  assert.match(await pdf.text(), /\/Count 1\b/);
});

test("PDF multifinca corta en límites aprobados y no omite filas entre páginas", async () => {
  const start = index.indexOf("function bytesFromBase64");
  const end = index.indexOf("async function runAction", start);
  const draws = [];
  const pixels = new Uint8ClampedArray(100 * 400 * 4).fill(255);
  pixels[(399 * 100) * 4] = 0;
  const canvas = { width: 100, height: 400, getContext: () => ({ getImageData: () => ({ data: pixels }) }) };
  const context = vm.createContext({ canvas, atob, Blob, TextEncoder, Uint8Array, document: {
    createElement: () => ({ getContext: () => ({ fillRect() {}, drawImage(...args) { draws.push({start:args[2],height:args[4]}); } }), toDataURL: () => 'data:image/jpeg;base64,AA==' }),
  } });
  vm.runInContext(index.slice(start,end),context);
  const pdf = vm.runInContext('pdfBlobFromCanvas(canvas,false,[110,220,330])',context);
  assert.match(await pdf.text(), /\/Count 4\b/);
  assert.deepEqual(draws,[{start:0,height:110},{start:110,height:110},{start:220,height:110},{start:330,height:70}]);
});

test("PDF ejecutivo respeta saltos de sección obligatorios sin omitir contenido ni añadir páginas vacías", async () => {
  const start=index.indexOf('function bytesFromBase64'),end=index.indexOf('async function runAction',start),draws=[];
  const pixels=new Uint8ClampedArray(100*400*4).fill(255);pixels[399*100*4]=0;
  const canvas={width:100,height:400,getContext:()=>({getImageData:()=>({data:pixels})})};
  const context=vm.createContext({canvas,atob,Blob,TextEncoder,Uint8Array,document:{createElement:()=>({getContext:()=>({fillRect(){},drawImage(...a){draws.push([a[2],a[4]]);}}),toDataURL:()=> 'data:image/jpeg;base64,AA=='})}});
  vm.runInContext(index.slice(start,end),context);
  const pdf=vm.runInContext('pdfBlobFromCanvas(canvas,false,[110,220,330],[90,240,400])',context);
  assert.match(await pdf.text(),/\/Count 5\b/);
  assert.deepEqual(draws,[[0,90],[90,20],[110,130],[240,90],[330,70]]);
});

test("variantes PDF multifinca son optativas y no cambian la métrica activa ni el PNG", () => {
  assert.match(index,/variant\?buildHistoricalExecutive\(node,variant==='complete'\):buildHistoricalMulti\(node\)/);
  const composition=index.slice(index.indexOf('window.historicoMultiReportCharts='),index.indexOf('window.historicoMultiReportCharts=')+850);
  assert.match(composition,/\['tch','katm'\]/);
  assert.equal(composition.includes('historicalChartMetric='),false);
  assert.match(index,/PDF ejecutivo/);assert.match(index,/PDF completo/);
  assert.match(index,/if\(includeAnnexes\)/);
});

test("la ficha multifinca restringe la serie y los detalles a identidades seleccionadas", () => {
  const start=index.indexOf('  function multiRows('), end=index.indexOf('  function multiKpis(',start);
  const context=vm.createContext({currentHistoricalRows:()=>officialRows});
  vm.runInContext(index.slice(start,end),context);
  context.result={selection:[{farmCode:'256',lotIds:['25601','25602']},{farmCode:'983',lotIds:['98301','98302']}]};
  const all=vm.runInContext('multiRows(result)',context);
  const farm=vm.runInContext('multiRows(result,"983")',context);
  assert.deepEqual([...new Set(all.map(row=>row.lotId))].sort(),['25601','25602','98301','98302']);
  assert.ok(farm.every(row=>row.farmCode==='983'&&['98301','98302'].includes(row.lotId)));
  assert.equal(aggregateHistoricalRows(filterHistoricalRows(farm,null,[2526])).tch,52.41);
});

test("la tabla multifinca no acredita área ni toneladas cero cuando faltan registros válidos", () => {
  const start=index.indexOf('  function multiSeasonTable('),end=index.indexOf('  function multiLotTable(',start);
  const context=vm.createContext({engine:globalThis.CASUR_HISTORICAL_ENGINE,
    escH:String,zlabel:String,f0:String,f2:(value,suffix='')=>value==null?'N/D':value.toFixed(2)+suffix});
  vm.runInContext(index.slice(start,end),context);
  context.rows=[{farmCode:'100',lotId:'10001',zafra:2526,area:null,ton:null}];
  const missing=vm.runInContext('multiSeasonTable(rows,[2526],{kmWeighted:null})',context);
  assert.doesNotMatch(missing,/0\.00 ha|0\.00 t/);
  assert.match(missing,/<td>N\/D<\/td>/);
  context.rows=[{farmCode:'100',lotId:'10001',zafra:2526,area:10,ton:0}];
  assert.match(vm.runInContext('multiSeasonTable(rows,[2526],{kmWeighted:null})',context),/0\.00 t/);
});

test("groupHistoricalByLot agrupa por lotId con metadatos", () => {
  const groups = groupHistoricalByLot(normalizeHistoricalRows(sampleLotCompact));
  assert.equal(groups.length, 2);
  assert.equal(groups[0].lotId, "10001");
  assert.equal(groups[0].farmCode, "100");
  assert.equal(groups[0].sourceCount, 3);
  assert.deepEqual(groups[0].zafras, [2021, 2122]);
});

test("drilldown 759 · 24/25 agrega la zafra y ordena sus suertes naturalmente", () => {
  const model = buildHistoricalDrilldownModel(officialRows, "759", 2425);
  assert.equal(model.farmName, "Jesús María");
  assert.equal(model.selectedZafra, 2425);
  assert.deepEqual(model.summary, {
    area: 149.94, ton: 11154.23, tch: 74.39, katm: 97.14, edad: 11.81,
    suertes: 10, sourceCount: 10, zafras: [2425],
  });
  assert.deepEqual(model.lots.map((lot) => lot.lotId), [
    "75905", "75906", "75907", "75908", "75909", "75910", "75911", "75912", "75913", "75917",
  ]);
  assert.ok(model.lots.every((lot) => lot.zafras.length === 1 && lot.zafras[0] === 2425));
  assert.deepEqual(
    model.summary,
    aggregateHistoricalRows(filterHistoricalRows(officialRows, { farmCode: "759" }, [2425])),
  );
  const lot = model.lots.find((item) => item.lotId === "75907");
  assert.deepEqual(lot, {
    lotId: "75907", farmCode: "759", farmName: "Jesús María", suerte: "07",
    variedad: "RB 84-5210", riego: "Gravedad", zona: "5-PRODUCTORES", tenencia: "Productores",
    area: 19.78, ton: 1622.23, tch: 82.01, katm: 99.97, edad: 12.32,
    suertes: 1, sourceCount: 1, zafras: [2425],
  });
});

test("drilldown conserva separadas finca, zafra y suerte seleccionada", () => {
  const period = { periodMode: "last5", selectedZafras: [2122, 2223, 2324, 2425, 2526] };
  const chart = { historicalChartMetric: "katm" };
  const snapshots = [structuredClone(period), structuredClone(chart)];
  const initial = { farmCode: null, selectedZafra: null, selectedLotId: null };
  const season = updateHistoricalDrilldownState(initial, { type: "openSeason", farmCode: "759", zafra: 2425 });
  const lot = updateHistoricalDrilldownState(season, { type: "openLot", lotId: "75907" });
  const back = updateHistoricalDrilldownState(lot, { type: "backToFarm" });
  assert.deepEqual(season, { farmCode: "759", selectedZafra: 2425, selectedLotId: null });
  assert.deepEqual(lot, { farmCode: "759", selectedZafra: 2425, selectedLotId: "75907" });
  assert.deepEqual(back, season);
  assert.deepEqual(period, snapshots[0]);
  assert.deepEqual(chart, snapshots[1]);
  assert.deepEqual(initial, { farmCode: null, selectedZafra: null, selectedLotId: null });
});

test("cerrar el drilldown y cambiar de finca limpian solamente su contexto", () => {
  const open = { farmCode: "759", selectedZafra: 2425, selectedLotId: "75907" };
  assert.deepEqual(updateHistoricalDrilldownState(open, { type: "close" }), {
    farmCode: "759", selectedZafra: null, selectedLotId: null,
  });
  assert.deepEqual(updateHistoricalDrilldownState(open, { type: "changeFarm", farmCode: "760" }), {
    farmCode: "760", selectedZafra: null, selectedLotId: null,
  });
  assert.deepEqual(updateHistoricalDrilldownState(open, { type: "changeFarm", farmCode: "759" }), open);
});

test("una zafra fuera de un periodo personalizado no contiguo puede abrirse sin alterarlo", () => {
  const period = { periodMode: "custom", selectedZafras: [2223, 2425, 2526] };
  const snapshot = structuredClone(period);
  const drilldown = updateHistoricalDrilldownState(
    { farmCode: "759", selectedZafra: null, selectedLotId: null },
    { type: "openSeason", farmCode: "759", zafra: 1819 },
  );
  assert.deepEqual(drilldown, { farmCode: "759", selectedZafra: 1819, selectedLotId: null });
  assert.deepEqual(period, snapshot);
});

test("la UI ofrece entradas accesibles y abre la ficha canónica LOTE::lotId", () => {
  assert.ok(index.includes('<th>Suertes</th><th>Estado</th>'));
  assert.equal(index.includes("Lotes/Suertes"), false);
  assert.ok(index.includes('aria-label="Ver suertes de la zafra ${zafra}"'));
  assert.ok(index.includes(">Ver ›</button>"));
  assert.equal(index.includes(".historical-season-table th:nth-child(-n+6)"), false);
  assert.equal(index.includes(".historical-season-table th:nth-child(n+10)"), false);
  assert.ok(index.includes(".historical-season-table th:nth-child(11)"));
  assert.ok(index.includes(".historical-season-table th:last-child"));
  assert.ok(index.includes(">Ver ficha</button>"));
  assert.equal(index.includes("activateHistoricalChartPoint"), false);
  assert.equal(index.includes("handleHistoricalChartPointKey"), false);
  assert.ok(index.includes('tabindex="0" role="img"'));
  assert.ok(index.includes('onclick="pinHistoricalChartTooltip(this,event)"'));
  assert.ok(index.includes("renderEntity('LOTE::'+lotId,{preserveDrilldown:true,fromDrilldown:true})"));
  assert.ok(index.includes("historical-drilldown-cards"));
  assert.ok(index.includes('class="historical-drilldown-panel" role="dialog" aria-modal="true"'));
  assert.ok(index.includes("El periodo activo no cambia."));
});

test("el panel interactivo queda fuera de impresión y exportación", () => {
  assert.match(index, /historical-drilldown-overlay no-print export-excluded/);
  assert.ok(index.includes(".no-print,.export-excluded"));
  assert.ok(index.includes("return!item.closest('.export-excluded')"));
  assert.ok(index.includes(".historical-chart-tooltip,.historical-chart-hit',chart).forEach(remove)"));
});

test("la ficha muestra área como KPI principal antes de los seis KPI agronómicos existentes", () => {
  assert.ok(index.includes("buildHistoricalAgronomicKpis(scopeRows,selectedZafras)"));
  assert.ok(index.includes('class="kpis historical-agronomic-kpis"'));
  assert.ok(index.includes("multipleSeasons?'Área cosechada promedio':'Área cosechada'"));
  assert.ok(index.includes("agronomic.areaAverage==null?'N/D':val(agronomic.areaAverage,' ha/zafra')"));
  assert.ok(index.includes("'Acumulado del periodo: '+(agronomic.area==null?'N/D':val(agronomic.area,' ha-zafra')"));
  assert.ok(index.indexOf("kpi(multipleSeasons?'Área cosechada promedio'") < index.indexOf("kpi('TCH ponderado'"));
  for (const label of [
    "TCH ponderado", "KATM ponderado", "Edad ponderada",
    "Cambio TCH", "Variabilidad TCH", "Vs histórico",
  ]) {
    assert.ok(index.includes(`kpi('${label}'`), `falta la tarjeta ${label}`);
  }
  assert.ok(index.includes("seasonText+' · '+lotText"));
  assert.ok(index.includes("CV entre zafras · menor = más estable"));
  assert.ok(index.includes("CV = desviación estándar del TCH entre zafras ÷ promedio de TCH × 100."));
  assert.ok(index.includes('class="historical-kpi-help" tabindex="0" role="note"'));
  assert.equal(index.includes("kpi('Toneladas acumuladas'"), false);
  assert.equal(index.includes("kpi('Área cosechada acumulada'"), false);
  assert.equal(index.includes("kpi('Zafras incluidas'"), false);
  assert.equal(index.includes("kpi('Suertes únicas'"), false);
  assert.equal(index.includes("deltaCard('Vs histórico completo'"), false);
  assert.ok(index.includes(".casur-report-historico>.historical-agronomic-kpis"));
});

test("periodo y métrica se actualizan in-place sin volver a navegar la ficha", () => {
  assert.ok(index.includes("{preserveDrilldown:true,inPlace:true}"));
  assert.ok(index.includes("requestAnimationFrame(()=>window.scrollTo({left:scrollPosition.x,top:scrollPosition.y,behavior:'instant'}))"));
  assert.match(index, /if\(options\.inPlace&&scrollPosition\)[^;]+;else nav\('fichaSection'\)/);
});

test("área multizafra permanece disponible en el motor y las tablas", () => {
  const rows = filterHistoricalRows(officialRows, { lotId: "75907" }, [2324, 2425, 2526]);
  const result = aggregateHistoricalRows(rows);
  assert.equal(result.area, 59.34);
  assert.equal(result.zafras.length, 3);
  assert.equal(index.includes("Acumulado del periodo:"), true);
  assert.equal(index.includes("Toneladas acumuladas"), false);
  assert.ok(index.includes("<th>Área</th><th>Ton</th>"));
});

test("comparadores usan exactamente las mismas zafras", async (t) => {
  const entityScope = { lotId: "75907" };
  const entityRows = filterHistoricalRows(officialRows, entityScope);
  const selected = resolvePeriod(entityRows.map((row) => row.zafra), "Personalizado", [2223, 2425, 2526]);
  const reference = entityRows[0];
  const cases = [
    ["CASUR", isMainRow],
    ["zona", (row) => isMainRow(row) && row.zona === reference.zona],
    ["variedad", (row) => isMainRow(row) && row.variedad === reference.variedad],
    ["riego", (row) => isMainRow(row) && row.riego === reference.riego],
  ];
  for (const [name, scope] of cases) {
    await t.test(name, () => {
      const comparison = compareHistoricalRows(officialRows, entityScope, scope, selected);
      assert.deepEqual(comparison.entity.zafras, selected);
      assert.deepEqual(comparison.benchmark.zafras, selected);
      assert.equal(comparison.deltaTch, Math.round((comparison.entity.tch - comparison.benchmark.tch) * 100) / 100);
    });
  }
});

test("comparador vs histórico completo usa todas las zafras de la entidad", () => {
  const scope = { lotId: "75907" };
  const rows = filterHistoricalRows(officialRows, scope);
  const latest = aggregateHistoricalRows(filterHistoricalRows(rows, null, resolvePeriod(rows.map((row) => row.zafra), "latest")));
  const full = aggregateHistoricalRows(rows);
  assert.deepEqual(full.zafras, [1617, 1718, 1819, 1920, 2021, 2122, 2223, 2324, 2425, 2526]);
  assert.equal(Math.round((latest.tch - full.tch) * 100) / 100, -15.81);
});

test("modelo del gráfico alterna TCH/KATM sin cambiar el periodo", () => {
  const rows = normalizeHistoricalRows(sampleLotCompact);
  const selected = [2122];
  const selectedSnapshot = structuredClone(selected);
  const tch = buildHistoricalChartModel(rows, selected);
  const katm = buildHistoricalChartModel(rows, selected, "katm");
  assert.equal(tch.metric, "tch");
  assert.equal(katm.metric, "katm");
  assert.deepEqual(selected, selectedSnapshot);
  assert.deepEqual(tch.points.map((point) => point.selected), [false, true]);
  assert.deepEqual(katm.points.map((point) => point.selected), [false, true]);
  assert.equal(tch.points[1].value, 70);
  assert.equal(katm.points[1].value, 120);
  assert.equal(tch.reference, 70);
  assert.equal(katm.reference, 120);
});

test("serie TCH por zafra usa toneladas entre área y conserva todo el histórico", () => {
  const rows = [
    { lotId: "A", zafra: 2021, area: 10, ton: 500, katm: 80 },
    { lotId: "B", zafra: 2021, area: 30, ton: 3000, katm: 120 },
    { lotId: "A", zafra: 2122, area: 10, ton: 600, katm: 90 },
  ];
  const model = buildHistoricalChartModel(rows, [2122], "tch");
  assert.equal(model.points.length, 2);
  assert.equal(model.points[0].value, 87.5);
  assert.deepEqual(model.points.filter((point) => point.selected).map((point) => point.zafra), [2122]);
  assert.deepEqual(model.points.filter((point) => !point.selected).map((point) => point.zafra), [2021]);
});

test("serie KATM pondera por toneladas y conserva N/D como nulo", () => {
  const rows = [
    { lotId: "A", zafra: 2021, area: 90, ton: 100, katm: 80 },
    { lotId: "B", zafra: 2021, area: 10, ton: 900, katm: 120 },
    { lotId: "A", zafra: 2122, area: 10, ton: 600, katm: null },
  ];
  const model = buildHistoricalChartModel(rows, [2021], "katm");
  assert.equal(model.points[0].value, 116);
  assert.equal(model.points[1].value, null);
  assert.equal(model.reference, 116);
});

test("escala del gráfico resuelve una serie de un punto y valores idénticos", () => {
  const one = buildHistoricalChartModel([{ lotId: "A", zafra: 2526, area: 10, ton: 500, katm: 90 }], [2526]);
  const equal = buildHistoricalChartModel([
    { lotId: "A", zafra: 2425, area: 10, ton: 500, katm: 90 },
    { lotId: "A", zafra: 2526, area: 20, ton: 1000, katm: 90 },
  ], [2425, 2526]);
  assert.equal(one.points.length, 1);
  assert.ok(one.min < 50 && one.max > 50);
  assert.ok(equal.min < 50 && equal.max > 50);
});

test("casos 759 y 75907 alimentan el gráfico desde el motor común", () => {
  const farmRows = filterHistoricalRows(officialRows, { farmCode: "759" });
  const farmPeriod = resolvePeriod(farmRows.map((row) => row.zafra), "last5");
  const farmTch = buildHistoricalChartModel(farmRows, farmPeriod, "tch");
  const farmKatm = buildHistoricalChartModel(farmRows, farmPeriod, "katm");
  assert.equal(farmTch.points.length, 10);
  assert.equal(farmTch.reference, 74.36);
  assert.equal(farmKatm.reference, 104.25);
  assert.deepEqual(farmTch.points.filter((point) => point.selected).map((point) => point.zafra), farmPeriod);

  const lotRows = filterHistoricalRows(officialRows, { lotId: "75907" });
  const custom = [2223, 2425, 2526];
  const lot = buildHistoricalChartModel(lotRows, custom, "katm");
  assert.equal(lot.points.length, 10);
  assert.deepEqual(lot.points.filter((point) => point.selected).map((point) => point.zafra), custom);
});

test("estado de métrica es independiente del estado de periodo", () => {
  assert.match(index, /HISTORICAL_CHART_STATE\s*=\s*\{historicalChartMetric:'tch'\}/);
  const metricSetter = index.match(/function setHistoricalChartMetric\(metric\)\{[\s\S]*?\n\}/)?.[0] || "";
  const periodSetter = index.match(/function setHistoricalPeriodMode\(mode\)\{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(metricSetter.includes("HISTORICAL_CHART_STATE.historicalChartMetric=next"));
  assert.equal(metricSetter.includes("selectedZafras="), false);
  assert.equal(periodSetter.includes("historicalChartMetric="), false);
});

test("caso finca 759 conserva la regresión calculada", () => {
  const rows = filterHistoricalRows(officialRows, { farmCode: "759" });
  const available = groupHistoricalBySeason(rows).map((group) => group.zafra);
  const latest = aggregateHistoricalRows(filterHistoricalRows(rows, null, resolvePeriod(available, "latest")));
  const all = aggregateHistoricalRows(filterHistoricalRows(rows, null, resolvePeriod(available, "all")));
  assert.deepEqual(latest, {
    area: 130.88, ton: 8013.43, tch: 61.23, katm: 80.49, edad: 10.49,
    suertes: 9, sourceCount: 9, zafras: [2526],
  });
  assert.equal(all.tch, 82.21);
  assert.equal(all.suertes, 18);
});

test("caso suerte 75907 resuelve todos los periodos sin tocar Corte", () => {
  const rows = filterHistoricalRows(officialRows, { lotId: "75907" });
  const available = rows.map((row) => row.zafra);
  assert.deepEqual(resolvePeriod(available, "latest"), [2526]);
  assert.deepEqual(resolvePeriod(available, "last3"), [2324, 2425, 2526]);
  assert.deepEqual(resolvePeriod(available, "last5"), [2122, 2223, 2324, 2425, 2526]);
  assert.equal(resolvePeriod(available, "all").length, 10);
  assert.deepEqual(resolvePeriod(available, "custom", [2223, 2425, 2526]), [2223, 2425, 2526]);
  assert.equal(rows.every((row) => !Object.hasOwn(row, "corte")), true);
  assert.ok(index.includes("const corte=Number(d.zafra)===latestZafra?latestCorte:null;"));
});

test("caso 75907 conserva sourceCount y no fabrica corte histórico", () => {
  const lot = historico.lotCompact.find((item) => String(item[0]) === "75907");
  assert.ok(lot);
  assert.equal(lot[12][0][8], 8, "el corte real de la última zafra permanece en lot[12]");
  const rows = normalizeHistoricalRows([lot]);
  assert.equal(rows.length, 10);
  assert.deepEqual(rows.map((row) => row.sourceCount), [1, 1, 1, 2, 1, 1, 1, 1, 1, 1]);
  assert.equal(rows.every((row) => !Object.hasOwn(row, "corte")), true);
  assert.equal(rows.some((row) => row.sourceCount === 8), false);
  assert.equal(index.includes("corte:latestCorte"), false);
  assert.ok(index.includes("const corte=Number(d.zafra)===latestZafra?latestCorte:null;"));
});

test("ninguna función del motor muta lotCompact ni las filas normalizadas", () => {
  const input = structuredClone(sampleLotCompact);
  const inputSnapshot = structuredClone(input);
  const rows = normalizeHistoricalRows(input);
  const rowsSnapshot = structuredClone(rows);
  const period = resolvePeriod(rows.map((row) => row.zafra), "3");
  reconcilePeriodSelection(rows.map((row) => row.zafra), "custom", period);
  filterHistoricalRows(rows, { farmCode: "100" }, period);
  aggregateHistoricalRows(rows);
  compareHistoricalRows(rows, { lotId: "10001" }, { farmCode: "100" }, period);
  buildHistoricalChartModel(rows, period, "katm");
  groupHistoricalBySeason(rows);
  buildHistoricalAgronomicKpis(rows, period);
  groupHistoricalByLot(rows);
  buildHistoricalDrilldownModel(rows, "100", 2122);
  updateHistoricalDrilldownState({ farmCode: "100", selectedZafra: 2122, selectedLotId: null }, { type: "openLot", lotId: "10001" });
  assert.deepEqual(input, inputSnapshot);
  assert.deepEqual(rows, rowsSnapshot);
});

test("Producción expone bridge v1 y abre lotes con la ficha canónica existente", () => {
  assert.match(enhancements, /window\.CASUR_MODULE_BRIDGE = Object\.freeze\(\{/);
  assert.match(enhancements, /protocolVersion: 1/);
  assert.match(enhancements, /moduleId: "produccion"/);
  assert.match(enhancements, /async checkpoint\(\) \{ return \{ ok: true, status: "noop" \}; \}/);
  assert.match(enhancements, /context\.kind !== "lot"/);
  assert.match(enhancements, /window\.lotByCode\(code\)/);
  assert.match(enhancements, /window\.renderEntity\(code\)/);
  assert.match(enhancements, /status: "lot-not-found"/);
  assert.match(enhancements, /status: "opened"/);
  assert.match(enhancements, /const code = `LOTE::\$\{lotId\}`/);
});
