import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const index = fs.readFileSync(path.join(testRoot, "../index.html"), "utf8");
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
  groupHistoricalByLot,
  buildHistoricalDrilldownModel,
  updateHistoricalDrilldownState,
} = globalThis.CASUR_HISTORICAL_ENGINE;

const historico = JSON.parse(fs.readFileSync(path.join(testRoot, "../data/historico.json"), "utf8"));
const officialRows = normalizeHistoricalRows(historico.lotCompact);
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
  assert.ok(index.includes("Ver suertes"));
  assert.ok(index.includes(">Ver ficha</button>"));
  assert.ok(index.includes('onkeydown="handleHistoricalChartPointKey(this,event)"'));
  assert.ok(index.includes("['Enter',' '].includes(event.key)"));
  assert.ok(index.includes("renderEntity('LOTE::'+lotId,{preserveDrilldown:true,fromDrilldown:true})"));
  assert.ok(index.includes("historical-drilldown-cards"));
  assert.ok(index.includes("Zafra abierta para drilldown · El periodo activo no cambia."));
});

test("el panel interactivo queda fuera de impresión y exportación", () => {
  assert.match(index, /historical-drilldown-panel no-print export-excluded/);
  assert.ok(index.includes(".no-print,.export-excluded"));
  assert.ok(index.includes("return!item.closest('.export-excluded')"));
  assert.ok(index.includes(".historical-chart-open-ring',chart).forEach(remove)"));
});

test("área multizafra representa la suma ha-zafra", () => {
  const rows = filterHistoricalRows(officialRows, { lotId: "75907" }, [2324, 2425, 2526]);
  const result = aggregateHistoricalRows(rows);
  assert.equal(result.area, 59.34);
  assert.equal(result.zafras.length, 3);
  assert.ok(index.includes("Área cosechada acumulada"));
  assert.ok(index.includes(" ha-zafra"));
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
  groupHistoricalByLot(rows);
  buildHistoricalDrilldownModel(rows, "100", 2122);
  updateHistoricalDrilldownState({ farmCode: "100", selectedZafra: 2122, selectedLotId: null }, { type: "openLot", lotId: "10001" });
  assert.deepEqual(input, inputSnapshot);
  assert.deepEqual(rows, rowsSnapshot);
});
