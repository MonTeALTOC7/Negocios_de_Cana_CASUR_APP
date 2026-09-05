import fs from "node:fs/promises";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const workbookPath = process.argv[2];
if (!workbookPath) throw new Error("Uso: node tools/build-official-data.mjs archivo.xlsx");

const round = (value, digits = 2) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
};
const text = (value) => String(value ?? "").trim();
const normalized = (value) => text(value)
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "");
const numberOrNull = (value) => {
  if (value === null || value === undefined || text(value) === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(text(value).replace(/\s/g, "").replace(",", ".").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};
const isoDate = (value) => {
  if (!value && value !== 0) return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
  }
  const raw = text(value);
  let match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  match = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (!match) return null;
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
};
const zoneLabel = (value) => {
  const raw = text(value);
  const key = normalized(raw);
  if (key === "1" || (key.includes("1") && key.includes("sur"))) return "1-Sur";
  if (key === "2" || (key.includes("2") && key.includes("centro"))) return "2-Centro";
  if (key === "3" || (key.includes("3") && key.includes("norte"))) return "3-Norte";
  if (key === "5" || key.includes("productor")) return "5-Productores";
  return raw || "Sin zona";
};
const tenure = (value) => {
  const raw = text(value);
  const key = normalized(raw);
  if (raw.toUpperCase() === "CA" || key.includes("arriend")) return "Arriendo";
  if (raw.toUpperCase() === "CV" || (key.includes("compra") && key.includes("venta"))) return "Compra Venta";
  if (raw.toUpperCase() === "PR" || key.includes("propio")) return "Propio";
  return raw || "—";
};
const newerDate = (a, b) => !a ? b : !b ? a : (a > b ? a : b);
const isRenewal = (value) => ["R", "RE", "RENOVACION", "RENOVACIÓN"].includes(text(value).toUpperCase());
const dominant = (rows, field) => {
  const totals = new Map();
  rows.forEach((row) => {
    const key = text(row[field]) || "Sin dato";
    totals.set(key, (totals.get(key) || 0) + (numberOrNull(row.area) || 0));
  });
  return [...totals].sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
};
const weighted = (rows, field) => {
  let numerator = 0;
  let denominator = 0;
  rows.forEach((row) => {
    const area = numberOrNull(row.area);
    const value = numberOrNull(row[field]);
    if (area > 0 && value !== null) {
      numerator += area * value;
      denominator += area;
    }
  });
  return denominator ? round(numerator / denominator) : null;
};
const estimateSummary = (rows) => {
  const covered = rows.filter((row) => numberOrNull(row.tchEst2627) !== null);
  const area = round(covered.reduce((sum, row) => sum + (numberOrNull(row.area) || 0), 0)) || 0;
  const totalArea = rows.reduce((sum, row) => sum + (numberOrNull(row.area) || 0), 0);
  const tons = round(covered.reduce((sum, row) => sum + (numberOrNull(row.tonEst2627) || 0), 0)) || 0;
  return {
    tchEst2627: weighted(covered, "tchEst2627"),
    tonEst2627: tons,
    areaEstimado2627: area,
    suertesEstimado2627: covered.length,
    coberturaEstimadoAreaPct: totalArea ? round((area / totalArea) * 100) : 0,
    coberturaEstimadoSuertesPct: rows.length ? round((covered.length / rows.length) * 100) : 0,
  };
};
const groupRows = (rows, field) => {
  const groups = new Map();
  rows.forEach((row) => {
    const key = text(row[field]) || "Sin dato";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return [...groups].map(([key, values]) => {
    const area = round(values.reduce((sum, row) => sum + (numberOrNull(row.area) || 0), 0)) || 0;
    return { key, area, suertes: values.length, tch: weighted(values, "tch"), ...estimateSummary(values) };
  }).sort((a, b) => b.area - a.area);
};

function buildCronologico(records, sourceName) {
  const farms = new Map();
  records.forEach((record) => {
    const key = text(record.code) || text(record.name) || "SIN_CODIGO";
    if (!farms.has(key)) farms.set(key, { code: text(record.code), name: record.name || "Sin nombre", details: [] });
    farms.get(key).details.push(record);
  });
  const producers = [...farms.values()].map((farm) => {
    const rows = farm.details;
    const area = round(rows.reduce((sum, row) => sum + (numberOrNull(row.area) || 0), 0)) || 0;
    const summary = {
      code: farm.code,
      name: farm.name,
      zone: dominant(rows, "zona"),
      tenencia: dominant(rows, "tenencia"),
      destino: dominant(rows, "destino"),
      tipoCultivo: dominant(rows, "tipoCultivo"),
      area,
      tch: weighted(rows, "tch"),
      suertes: rows.length,
      areaBajoTch: 0,
      areaMedioTch: 0,
      areaAltoTch: 0,
      areaSecano: 0,
      areaRiego: 0,
      areaSinDatoRiego: 0,
      suertesCriticas: 0,
      riegoDom: dominant(rows, "tipoRiego"),
      variedadDom: dominant(rows, "variedad"),
      texturaDom: dominant(rows, "textura"),
      ...estimateSummary(rows),
      details: rows,
    };
    rows.forEach((row) => {
      const rowArea = numberOrNull(row.area) || 0;
      const tch = numberOrNull(row.tch);
      if (tch !== null && tch > 0 && tch < 60) { summary.areaBajoTch += rowArea; summary.suertesCriticas += 1; }
      else if (tch !== null && tch < 70) summary.areaMedioTch += rowArea;
      else if (tch !== null) summary.areaAltoTch += rowArea;
      const irrigation = normalized(row.tipoRiego);
      if (!irrigation) summary.areaSinDatoRiego += rowArea;
      else if (irrigation.includes("secano")) summary.areaSecano += rowArea;
      else summary.areaRiego += rowArea;
    });
    ["areaBajoTch", "areaMedioTch", "areaAltoTch", "areaSecano", "areaRiego", "areaSinDatoRiego"]
      .forEach((key) => { summary[key] = round(summary[key]) || 0; });
    return summary;
  }).sort((a, b) => a.name.localeCompare(b.name, "es"));
  const rows = producers.flatMap((producer) => producer.details);
  const area = round(rows.reduce((sum, row) => sum + (numberOrNull(row.area) || 0), 0)) || 0;
  const global = {
    area,
    tch: weighted(rows, "tch"),
    suertes: rows.length,
    productores: producers.length,
    areaBajoTch: round(rows.filter((row) => numberOrNull(row.tch) > 0 && numberOrNull(row.tch) < 60).reduce((sum, row) => sum + row.area, 0)) || 0,
    areaMedioTch: round(rows.filter((row) => numberOrNull(row.tch) >= 60 && numberOrNull(row.tch) < 70).reduce((sum, row) => sum + row.area, 0)) || 0,
    areaAltoTch: round(rows.filter((row) => numberOrNull(row.tch) >= 70).reduce((sum, row) => sum + row.area, 0)) || 0,
    areaSecano: round(rows.filter((row) => normalized(row.tipoRiego).includes("secano")).reduce((sum, row) => sum + row.area, 0)) || 0,
    areaRiego: round(rows.filter((row) => text(row.tipoRiego) && !normalized(row.tipoRiego).includes("secano")).reduce((sum, row) => sum + row.area, 0)) || 0,
    ...estimateSummary(rows),
  };
  const options = producers.map((producer) => ({
    code: producer.code, name: producer.name, zone: producer.zone, area: producer.area,
    tch: producer.tch, tchEst2627: producer.tchEst2627,
    label: `${producer.code} · ${producer.name}`,
  }));
  return {
    meta: {
      source: sourceName,
      sheet: "REPORTE",
      rows: rows.length,
      rawRows: records.length,
      excludedRows: 0,
      productores: producers.length,
      generated: "2026-09-01",
      dataVersion: "2026.09.01-2627.1",
      tchEst2627EffectiveDate: "2026-07-17",
      tchEst2627Source: `${sourceName} · REPORTE · TCH_Estimado_Z2627`,
      rule: "Plantilla oficial REPORTE; zonas 1, 2, 3 y 5. Sucuya/Zona 0 excluida. Vacío TCH 26/27 significa sin estimado, nunca cero.",
    },
    global,
    options,
    producers,
    groups: {
      zona: groupRows(rows, "zona"), riego: groupRows(rows, "tipoRiego"),
      tenencia: groupRows(rows, "tenencia"), tipoCultivo: groupRows(rows, "tipoCultivo"),
      destino: groupRows(rows, "destino"), variedad: groupRows(rows, "variedad"),
      textura: groupRows(rows, "textura"), estado: groupRows(rows, "estado"),
    },
  };
}

function assignedObject(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`No se encontró ${marker}`);
  const start = source.indexOf("{", markerIndex + marker.length);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return JSON.parse(source.slice(start, index + 1));
  }
  throw new Error(`No se pudo delimitar ${marker}`);
}

const bundle = await fs.readFile(path.join(root, "vendor/xlsx.bundle.js"), "utf8");
const sandbox = { console, Uint8Array, ArrayBuffer, Date, Math, JSON, setTimeout, clearTimeout };
vm.createContext(sandbox);
vm.runInContext(bundle, sandbox, { filename: "xlsx.bundle.js" });
const bytes = await fs.readFile(path.resolve(workbookPath));
const workbook = sandbox.XLSX.read(bytes, { type: "buffer", cellDates: true });
const sheet = workbook.Sheets.REPORTE;
if (!sheet) throw new Error("El libro oficial no contiene la hoja REPORTE.");
const rows = sandbox.XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });

let correctedOfficialTons = 0;
let normalizedOfficialTons = 0;
const records = rows.map((row, index) => {
  const code = text(row.Cod);
  const name = text(row.Hacienda);
  const suerte = text(row.Suerte);
  const zona = zoneLabel(row.ZONA);
  const estimate = numberOrNull(row.TCH_Estimado_Z2627);
  const storedEstimate = round(estimate);
  const area = round(numberOrNull(row.Area));
  const lastCut = isoDate(row["F. Ult. Cte"]);
  const planting = isoDate(row["F. Siembra"]);
  const cut = text(row["#_de_Corte"]);
  const excluded = normalized(`${code} ${name} ${zona}`).includes("sucuya") || normalized(zona) === "0";
  if (excluded) return null;
  if (!code || !name || !suerte || !(area > 0)) throw new Error(`Fila ${index + 2}: llave o área oficial inválida.`);
  const computedTons = storedEstimate === null ? null : round(area * storedEstimate);
  const rawComputedTons = estimate === null ? null : round(area * estimate);
  const officialTons = numberOrNull(row.Ton_Estimadas_Z2627);
  if (rawComputedTons !== null && officialTons !== null && Math.abs(rawComputedTons - officialTons) > 0.02) correctedOfficialTons += 1;
  if (computedTons !== null && officialTons !== null && Math.abs(computedTons - officialTons) > 0.02) normalizedOfficialTons += 1;
  return {
    code, name, suerte,
    codLote: text(row["Hac-Sue"]) || `${code}${suerte}`,
    area,
    variedad: text(row.Variedad) || "—",
    surco: text(row.Surco),
    corte: cut || "—",
    tch: round(numberOrNull(row.TCH_Z2526)),
    tchEst2627: storedEstimate,
    tonEst2627: computedTons,
    tchEst2627Fecha: estimate === null ? null : "2026-07-17",
    tchEst2627Fuente: estimate === null ? null : "Cronologico_Maestro_CASUR_2026-08-24.xlsx · REPORTE",
    textura: text(row.Textura) || "—",
    fUltCte: lastCut,
    fSiembra: planting,
    fBase: isRenewal(cut) && !planting ? null : newerDate(planting, lastCut),
    zona,
    distancia: round(numberOrNull(row.Km)) || 0,
    destino: text(row.Destino) || "—",
    tenencia: tenure(row.Tenencia),
    tipoCultivo: "—",
    tipoRiego: text(row.Tipo_de_Riego) || "—",
    numeroRiegos: numberOrNull(row["#_de_Riegos"]),
    erp: text(row.ERP),
    estado: text(row.Estado) || "—",
    observacion: text(row["Observación"]),
    renovacion: isRenewal(cut),
    ton: area && numberOrNull(row.TCH_Z2526) !== null ? round(area * numberOrNull(row.TCH_Z2526)) : null,
    edadExcel: round(numberOrNull(row.Edad)),
  };
}).filter(Boolean);

const seen = new Set();
for (const record of records) {
  const key = `${record.code}||${record.suerte.toUpperCase()}`;
  if (seen.has(key)) throw new Error(`Llave duplicada oficial: ${key}`);
  seen.add(key);
}

const sourceName = path.basename(workbookPath).replace(/\(\d+\)/, "");
const cronologico = buildCronologico(records, sourceName);
cronologico.meta.correctedOfficialEstimatedTons = correctedOfficialTons;
cronologico.meta.normalizedOfficialEstimatedTons = normalizedOfficialTons;
const currentIndex = await fs.readFile(path.join(root, "index.html"), "utf8");
const historico = assignedObject(currentIndex, "window.APP_DATA=");
historico.meta = { ...historico.meta, dataVersion: "2026.09.01-2627.1", externalized: true };
const release = {
  version: "2026.09.01-2627.1",
  publishedAt: "2026-09-01T00:00:00.000Z",
  source: sourceName,
  sheet: "REPORTE",
  tchEst2627EffectiveDate: "2026-07-17",
  cronologicoRows: cronologico.global.suertes,
  historicoRows: historico.meta.rows,
};

await fs.mkdir(path.join(root, "data"), { recursive: true });
await Promise.all([
  fs.writeFile(path.join(root, "data/cronologico.json"), `${JSON.stringify(cronologico, null, 2)}\n`),
  fs.writeFile(path.join(root, "data/cronologico.js"), `window.CASUR_REMOTE_CRONO=${JSON.stringify(cronologico)};\n`),
  fs.writeFile(path.join(root, "data/historico.json"), `${JSON.stringify(historico)}\n`),
  fs.writeFile(path.join(root, "data/historico.js"), `window.CASUR_REMOTE_HISTORICO=${JSON.stringify(historico)};\n`),
  fs.writeFile(path.join(root, "data/version.json"), `${JSON.stringify(release, null, 2)}\n`),
  fs.writeFile(path.join(root, "data/version.js"), `window.CASUR_RELEASE=${JSON.stringify(release)};\n`),
]);

console.log(JSON.stringify({
  ...release,
  area: cronologico.global.area,
  tch2526: cronologico.global.tch,
  tchEst2627: cronologico.global.tchEst2627,
  estimatedLots: cronologico.global.suertesEstimado2627,
  estimatedArea: cronologico.global.areaEstimado2627,
  estimatedTons: cronologico.global.tonEst2627,
  coverageAreaPct: cronologico.global.coberturaEstimadoAreaPct,
  correctedOfficialTons,
  normalizedOfficialTons,
  zones: cronologico.groups.zona.map(({ key, area, suertes }) => ({ key, area, suertes })),
}, null, 2));
