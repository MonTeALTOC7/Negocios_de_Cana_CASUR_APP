import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const index = read("index.html");
const cronologico = JSON.parse(read("data/cronologico.json"));
const historico = JSON.parse(read("data/historico.json"));
const version = JSON.parse(read("data/version.json"));
const enhancement = read("js/casur-enhancements.js");
const serviceWorker = read("sw.js");

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
  assert.equal(valued.length, 245);
  assert.equal(empty.length, 808);
  assert.equal(valued.some((row) => row.tchEst2627 === 0), false);
  assert.equal(cronologico.global.tchEst2627, 60.4);
  assert.equal(cronologico.global.areaEstimado2627, 1889.03);
  assert.equal(cronologico.global.coberturaEstimadoAreaPct, 18.83);
  assert.equal(cronologico.meta.tchEst2627EffectiveDate, "2026-07-17");
});

check("toneladas estimadas recalculadas", () => {
  records.filter((row) => row.tchEst2627 !== null).forEach((row) => {
    assert.ok(Math.abs(row.tonEst2627 - Math.round(row.area * row.tchEst2627 * 100) / 100) < 0.001, `${row.code}-${row.suerte}`);
  });
  assert.equal(cronologico.meta.correctedOfficialEstimatedTons, 9);
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
  assert.equal(version.version, "2026.09.01-2627.1");
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

check("estimado 26/27 cuadra en selección y zona Productores", () => {
  const zone = cronologico.groups.zona.find((row) => row.key === "5-Productores");
  assert.equal(zone.tchEst2627, 60.4);
  assert.equal(zone.tonEst2627, 114105.82);
  assert.equal(zone.coberturaEstimadoAreaPct, 91.92);
  const alfredo = cronologico.producers.find((producer) => String(producer.code) === "561");
  const selected = alfredo.details.filter((row) => ["07", "08", "09"].includes(String(row.suerte)));
  const area = selected.reduce((sum, row) => sum + row.area, 0);
  const tons = selected.reduce((sum, row) => sum + row.tonEst2627, 0);
  const tch = selected.reduce((sum, row) => sum + row.area * row.tchEst2627, 0) / area;
  assert.equal(Math.round(area * 100) / 100, 5.23);
  assert.equal(Math.round(tons * 100) / 100, 394.74);
  assert.equal(Math.round(tch * 100) / 100, 75.48);
});

check("PWA sincroniza datos con red primero", () => {
  assert.ok(serviceWorker.includes("casur-suertes-vf54-data-sync"));
  assert.ok(serviceWorker.includes("url.pathname.includes('/data/')"));
  assert.ok(serviceWorker.includes("fetch(request, { cache: 'no-store' })"));
  assert.ok(enhancement.includes("data/version.json?ts="));
  assert.ok(enhancement.includes("location.reload()"));
});

check("referencias locales existentes", () => {
  ["css/casur-upgrade.css", "js/casur-enhancements.js", "data/version.js", "data/version.json",
    "data/cronologico.js", "data/cronologico.json", "data/historico.js", "data/historico.json",
    "manifest.webmanifest", "sw.js", "README_GITHUB.md", "VERSION.txt"]
    .forEach((name) => assert.ok(fs.existsSync(path.join(root, name)), name));
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
  new vm.Script(enhancement, { filename: "casur-enhancements.js" });
  new vm.Script(serviceWorker, { filename: "sw.js" });
});

console.log(`OK · ${checks.length} controles`);
checks.forEach((name) => console.log(`  ✓ ${name}`));
