import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(root, "../..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const index = read("index.html");
const cronologico = JSON.parse(read("data/cronologico.json"));
const historico = JSON.parse(read("data/historico.json"));
const version = JSON.parse(read("data/version.json"));
const enhancement = read("js/casur-enhancements.js");
const historicalEngine = read("js/historical-engine.js");
const serviceWorker = fs.readFileSync(path.join(repositoryRoot, "sw.js"), "utf8");

const checks = [];
const check = (name, callback) => {
  callback(); checks.push(name);
};

check("base oficial completa", () => {
  assert.equal(cronologico.global.suertes, 1053);
  assert.equal(cronologico.global.productores, 100);
  assert.equal(cronologico.global.area, 10030.65);
  assert.equal(cronologico.meta.sheet, "REPORTE");
});

const records = cronologico.producers.flatMap((producer) => producer.details.map((row) => ({ ...row, parentCode: producer.code })));
check("llaves únicas y Sucuya excluida", () => {
  const keys = records.map((row) => `${row.parentCode}||${String(row.suerte).toUpperCase()}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(records.some((row) => String(row.parentCode) === "16" || /sucuya/i.test(row.name)), false);
  assert.equal(cronologico.groups.zona.some((zone) => /^0(?:-|$)/.test(zone.key)), false);
});

check("estimados 26/27 conservan nulos", () => {
  const valued = records.filter((row) => row.tchEst2627 !== null);
  const empty = records.filter((row) => row.tchEst2627 === null);
  assert.equal(valued.length + empty.length, records.length);
  assert.ok(empty.length > 0);
  assert.equal(valued.some((row) => row.tchEst2627 === 0), false);
  assert.equal(version.tchEst2627EffectiveDate, "2026-07-17");
});

check("toneladas estimadas recalculadas", () => {
  records.filter((row) => row.tchEst2627 !== null).forEach((row) => {
    assert.ok(Math.abs(row.tonEst2627 - Math.round(row.area * row.tchEst2627 * 100) / 100) < 0.001, `${row.code}-${row.suerte}`);
  });
  records.filter((row) => row.tchEst2627 === null).forEach((row) => assert.equal(row.tonEst2627, null));
});

check("histórico preservado", () => {
  assert.equal(historico.meta.rows, 11598);
  assert.equal(historico.meta.latestZafra, 2526);
  assert.equal(historico.lotCompact.length, 1547);
});

check("datos externos con fallback", () => {
  ["data/version.js", "data/historico.js", "data/cronologico.js"].forEach((name) => assert.ok(index.includes(name)));
  assert.ok(index.includes("window.APP_DATA=window.CASUR_REMOTE_HISTORICO||{"));
  assert.ok(index.includes("window.CRONO_DATA = window.CASUR_REMOTE_CRONO||{"));
  assert.equal(version.version, cronologico.meta.dataVersion);
  assert.equal(version.version, historico.meta.dataVersion);
});

check("Centro Maestro simplificado y bloqueado", () => {
  assert.ok(index.includes("Centro Maestro · Programador"));
  assert.ok(index.includes("casurCronoEditor"));
  assert.ok(index.includes("casurHistoryEditor"));
  assert.ok(index.includes("Paquete solo datos para GitHub"));
  assert.equal(index.includes("Plantilla Cronológico completo"), false);
  assert.equal(index.includes("Plantilla Corrección parcial"), false);
  const digest = crypto.createHash("sha256").update("151021").digest("hex");
  assert.ok(enhancement.includes(digest));
  assert.equal(enhancement.includes('=== "151021"'), false);
});

check("acceso técnico compacto, seguro y adaptable", () => {
  assert.ok(index.includes('id="masterAdminLauncher"'));
  assert.ok(index.includes('MASTER_ADMIN_LAUNCHER_START'));
  assert.equal(index.includes('id="masterDevSeparator"'), false);
  assert.ok(read("css/casur-upgrade.css").includes(".master-update-accordion.is-locked{display:none!important}"));
  assert.ok(read("css/casur-upgrade.css").includes(".casur-admin-launcher-copy,.casur-admin-launcher-arrow{display:none}"));
  assert.ok(enhancement.includes("function updateAdminLauncher"));
  assert.ok(index.includes("html=removeBlock(html,'<!-- MASTER_ADMIN_LAUNCHER_START -->','<!-- MASTER_ADMIN_LAUNCHER_END -->')"));
  assert.ok(index.includes("!text.includes('id=\"masterAdminLauncher\"')"));
});

check("TCH 26/27 en fichas y tabla", () => {
  assert.ok(enhancement.includes("TCH estimado 26/27"));
  assert.ok(enhancement.includes("TCH est. 26/27"));
  assert.ok(enhancement.includes("Ton. est. 26/27"));
  assert.ok(enhancement.includes("Estado maestro"));
  assert.ok(enhancement.includes("#cronoPrintPanel table"));
});

check("fecha del estimado visible una sola vez en la ficha", () => {
  assert.equal((enhancement.match(/formatDate\(ESTIMATE_DATE\)/g) || []).length, 1);
  assert.equal(enhancement.includes("Fecha efectiva ${formatDate(ESTIMATE_DATE)}"), false);
  assert.equal(enhancement.includes("formatDate(record.tchEst2627Fecha || ESTIMATE_DATE)"), false);
  assert.ok(enhancement.includes("casur-estimate-badge"));
});

check("exportadores preservados", () => {
  ["masterExportHtmlBtn", "masterExportOperBtn", "masterExportZipBtn", "masterScopeSelect", "masterProfileSelect",
    "modCrono", "modHist", "modZones", "modExec", "masterDownloadUpdatedHtml", "masterDownloadUpdatedZip"]
    .forEach((token) => assert.ok(index.includes(token), token));
  assert.ok(index.includes("zip.file('data/cronologico.js'"));
  assert.ok(index.includes("zip.file('data/historico.js'"));
  assert.ok(index.includes("zip.file('data/version.json'"));
  assert.equal(index.includes("if(operative)return operativeTemplateSource();"), false);
  assert.ok(index.includes("legacyTemplate=root.querySelector('#casurOperativeTemplateB64')"));
  assert.ok(index.includes("!doc.getElementById('casurOperativeTemplateB64')"));
});

check("PNG de selección múltiple tiene composición propia", () => {
  assert.ok(index.includes("function buildCronoMultiple(node)"));
  assert.ok(index.includes("casur-report-multiple"));
  assert.ok(index.includes("kind==='cronologico-multiple'?1600:(cloneNode.classList.contains('casur-report-crono-general')?1400:960)"));
  assert.ok(index.includes("row.deleteCell(0)"));
  assert.ok(index.includes("function cloneWithBarStyles(sel,node)"));
  assert.ok(index.includes("grid-template-columns:repeat(4,minmax(0,1fr))"));
});

check("selección múltiple móvil está depurada", () => {
  assert.equal(index.includes("kpi('Edad productiva'"), false);
  assert.equal(index.includes("kpi('Ton. referenciales 25/26'"), false);
  assert.ok(index.includes("c==='R'||c==='RE'||c==='1'"));
  assert.ok(index.includes("if(renArea>0.005)"));
  assert.ok(index.includes("Área renovación / plantilla"));
  assert.ok(index.includes(".crono-multi-kpis .kpi:after"));
  const pansaco = cronologico.producers.find((producer) => String(producer.code) === "993");
  const renewalArea = pansaco.details
    .filter((row) => row.renovacion || ["R", "RE", "1"].includes(String(row.corte).trim().toUpperCase()))
    .reduce((sum, row) => sum + row.area, 0);
  assert.equal(Math.round(renewalArea * 100) / 100, 17.92);
});

check("exportación de hacienda es gráfica y paginada", () => {
  assert.ok(index.includes("casur-report-crono-general"));
  assert.ok(index.includes("cloneWithBarStyles('.crono-summary-grid'"));
  assert.ok(index.includes("?1400:960"));
  assert.ok(index.includes("pageCount=Math.max(1,Math.ceil(canvas.height/sliceHeight))"));
  assert.ok(index.includes("PDF paginado descargado correctamente"));
});

check("TCH estimado y porcentajes depurados por alcance", () => {
  assert.ok(index.includes("TCH estimado 26/27 por zona"));
  assert.ok(index.includes("TCH est. 26/27</th><th>Ton. est. 26/27"));
  assert.equal(index.includes("Porcentaje sobre el área seleccionada."), false);
  assert.equal(index.includes("kpi('Cobertura estimado',f2(coverage"), false);
  assert.ok(index.includes("czhshare"));
  assert.ok(index.includes("Participación sobre "+"'+esc(zone)+'"));
  assert.ok(index.includes("function estimateNumber(v)"));
  assert.ok(index.includes("function estimateNum(v)"));
});

check("agregados cronológicos cuadran en zona Productores", () => {
  const zone = cronologico.groups.zona.find((row) => row.key === "5-Productores");
  const selected = records.filter((row) => row.zona === "5-Productores");
  const area = selected.reduce((sum, row) => sum + row.area, 0);
  const tchArea = selected.filter((row) => row.tch !== null).reduce((sum, row) => sum + row.area, 0);
  const tchTon = selected.filter((row) => row.tch !== null).reduce((sum, row) => sum + row.area * row.tch, 0);
  assert.equal(Math.round(area * 100) / 100, zone.area);
  assert.equal(selected.length, zone.suertes);
  assert.equal(Math.round(tchTon / tchArea * 100) / 100, zone.tch);
});

check("PWA sincroniza datos con red primero", () => {
  assert.ok(serviceWorker.includes("sw.js — ÚNICO Service Worker raíz"));
  assert.ok(serviceWorker.includes("PROD_DATA_RE"));
  assert.ok(serviceWorker.includes("produccionDataGate(event, req, url)"));
  assert.ok(serviceWorker.includes("staleWhileRevalidate(req, SHELL_CACHE)"));
  assert.ok(enhancement.includes("data/version.json?ts="));
  assert.ok(enhancement.includes("location.reload()"));
});

check("referencias locales existentes", () => {
  ["css/casur-upgrade.css", "js/historical-engine.js", "js/casur-enhancements.js", "data/version.js", "data/version.json",
    "data/cronologico.js", "data/cronologico.json", "data/historico.js", "data/historico.json",
    "README_GITHUB.md", "VERSION.txt"]
    .forEach((name) => assert.ok(fs.existsSync(path.join(root, name)), name));
  ["manifest.webmanifest", "sw.js"]
    .forEach((name) => assert.ok(fs.existsSync(path.join(repositoryRoot, name)), name));
});

check("motor histórico integrado sin corte ficticio", () => {
  assert.ok(index.includes('<script src="js/historical-engine.js"></script>'));
  assert.ok(index.indexOf('js/historical-engine.js') < index.indexOf('js/casur-enhancements.js'));
  assert.ok(enhancement.includes("historicalEngine.aggregateHistoricalRows(rows)"));
  assert.equal(enhancement.includes('setValue("histCut", row[6])'), false);
  assert.equal(enhancement.includes('row[6] = round(finite($("histCut")?.value))'), false);
  assert.ok(index.includes('id="histCut" type="text" value="N/D" disabled'));
});

check("gráfico histórico comparte motor, periodo y métrica accesible", () => {
  assert.ok(historicalEngine.includes("function buildHistoricalChartModel"));
  assert.ok(index.includes("HISTORICAL_ENGINE.buildHistoricalChartModel(context.scopeRows,context.selectedZafras,metric)"));
  assert.ok(index.includes("const HISTORICAL_CHART_STATE = {historicalChartMetric:'tch'}"));
  assert.ok(index.includes('aria-label="Métrica del gráfico histórico"'));
  assert.ok(index.includes('data-selected="${point.selected}"'));
  assert.ok(index.includes('tabindex="0" role="img"'));
  assert.ok(index.includes("const trend=historicalChart(context)"));
});

check("gráfico histórico corrige referencia, tooltip y exportación", () => {
  assert.ok(index.includes('class="historical-chart-reference-badge"'));
  assert.equal(index.includes('class="historical-chart-reference-label"'), false);
  assert.ok(index.includes('class="historical-chart-tooltip"'));
  assert.ok(index.includes('onmouseenter="showHistoricalChartTooltip(this)"'));
  assert.ok(index.includes('onfocus="showHistoricalChartTooltip(this)"'));
  assert.ok(index.includes('onclick="pinHistoricalChartTooltip(this,event)"'));
  assert.ok(index.includes("referenceText=metricLabel+' ponderado del periodo'"));
  assert.ok(index.includes('class="historical-chart-hit"'));
  assert.ok(index.includes('class="historical-chart-dot"'));
  assert.ok(index.includes('r="22" fill="transparent" stroke="none" pointer-events="all"'));
  assert.ok(index.includes('class="historical-chart-tooltip-grid"'));
  assert.ok(index.includes("anchor=point.querySelector('.historical-chart-dot')||point"));
  assert.ok(index.includes("data-area=\"${esc(area)}\""));
  assert.ok(index.includes("data-ton=\"${esc(ton)}\""));
  assert.ok(index.includes("data-tch=\"${esc(tch)}\""));
  assert.ok(index.includes("data-katm=\"${esc(katm)}\""));
  assert.ok(index.includes("data-edad=\"${esc(edad)}\""));
  assert.ok(index.includes('class="historical-chart-line" fill="none" stroke="#94a3b8"'));
  assert.ok(index.includes('class="historical-chart-selected-line" fill="none" stroke="#0b7f3a"'));
  assert.ok(index.includes('class="historical-chart-reference" fill="none" stroke="#0b4f9c"'));
  assert.ok(index.includes("clone('.historical-chart-card',node)"));
  assert.ok(index.includes(".historical-chart-tooltip,.historical-chart-hit',chart"));
  assert.ok(index.includes(".historical-chart-reference-badge{display:inline-flex!important"));
  assert.ok(index.includes(".chart-tip-bg,.chart-tip,.mobile-trend-card,.historical-chart-tooltip{display:none!important"));
});

check("scripts inline válidos", () => {
  const matcher = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  let count = 0;
  while ((match = matcher.exec(index))) {
    const attributes = match[1];
    const source = match[2];
    if (/\bsrc=/.test(attributes) || /type=["'](?:application\/json|application\/octet-stream|text\/plain)/.test(attributes)) continue;
    new vm.Script(source, { filename: `inline-${count}.js` });
    count += 1;
  }
  assert.ok(count >= 10);
  new vm.Script(historicalEngine, { filename: "historical-engine.js" });
  new vm.Script(enhancement, { filename: "casur-enhancements.js" });
  new vm.Script(serviceWorker, { filename: "sw.js" });
});

console.log(`OK · ${checks.length} controles`);
checks.forEach((name) => console.log(`  ✓ ${name}`));
