import { createId, dateISO, finiteNumber } from "./tch-engine.js";

const aliases = {
  farmCode: ["cod", "codigo", "cod hacienda", "codigo hacienda", "codigo finca", "cod finca", "cod hac", "hacienda codigo"],
  producer: ["nombre hacienda", "productor", "hacienda", "nombre productor", "finca"],
  lot: ["ste", "suerte", "lote"],
  id: ["hac sue", "hac-sue", "codigo suerte", "cod suerte", "codigo lote"],
  area: ["area", "area neta", "ha", "hectareas"],
  variety: ["variedad"],
  referenceAge: ["edad m", "edad", "edad meses"],
  rowSpacingM: ["surco", "distancia surco", "distancia entre surcos"],
  cutNumber: ["de corte", "numero de corte", "corte", "num corte"],
  historicalTch: ["tch historico promedio", "promedio historico", "tch promedio historico", "tch historico", "tch"],
  latestSeasonTch: ["tch z2526", "tch 25 26", "tch zafra 25 26", "tch ultima zafra", "ultimo tch 25 26"],
  estimatedTch2627: ["tch estimado z2627", "tch estimado 26 27", "tch est 26 27", "tch est 170726", "tch estimado zafra 26 27"],
  estimatedTons2627: ["ton estimadas z2627", "ton estimadas 26 27", "toneladas estimadas 26 27"],
  texture: ["nombre textura", "textura"],
  distanceKm: ["distancia km", "km", "distancia"],
  initialTch: ["tch inic", "tch inicial"],
  currentMasterTch: ["tch act", "tch actual"],
  plantingDate: ["f siembra", "fecha siembra", "siembra"],
  lastCutDate: ["f ult cte", "fecha ultimo corte", "ultimo corte", "f corte"],
  destination: ["nombre destino del cultivo", "destino"],
  cropType: ["nombre tipo de cultivo", "tipo de cana", "tipo cultivo"],
  tenureCode: ["tn", "tenencia"],
  irrigation: ["tipo de riego", "tipo riego", "tiporiego", "riego", "secano riego"],
  irrigationCount: ["de riegos", "numero de riegos", "cantidad de riegos", "riegos"],
  nr: ["nr"],
  erp: ["erp"],
  zone: ["zona"],
  masterStatus: ["estado", "estado suerte", "estatus"],
  masterObservation: ["observacion", "observaciones", "nota", "notas"],
};

const TENURE_LABELS = { CA: "Arriendo", CV: "Compra Venta", PR: "Propio" };

export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function headerMap(row) {
  const normalized = Object.keys(row).map((header) => [header, normalizeText(header)]);
  const result = {};
  for (const [field, choices] of Object.entries(aliases)) {
    const match = normalized.find(([, header]) => choices.includes(header));
    if (match) result[field] = match[0];
  }
  return result;
}

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function normalizedLotNumber(value) {
  const raw = text(value);
  return /^\d$/.test(raw) ? raw.padStart(2, "0") : raw;
}

function referenceAge(value) {
  if (value instanceof Date) return null;
  const age = finiteNumber(value);
  return age > 0 && age <= 36 ? age : null;
}

function tenureLabel(code) {
  return TENURE_LABELS[text(code).toUpperCase()] || "";
}

function normalizeTenure(value) {
  const raw = text(value);
  const normalized = normalizeText(raw);
  if (["CA", "CV", "PR"].includes(raw.toUpperCase())) return raw.toUpperCase();
  if (normalized.includes("arriendo") || normalized.includes("alquiler")) return "CA";
  if (normalized.includes("compra venta") || normalized.includes("compraventa")) return "CV";
  if (normalized.includes("propio") || normalized.includes("propiedad")) return "PR";
  return raw.toUpperCase();
}

export function isOperationalLot(lot) {
  const zone = normalizeText(lot?.zone);
  const producer = normalizeText(lot?.producer);
  if (!zone && !producer) return false;
  return zone !== "0 sin definir" && !producer.includes("sucuya");
}

function normalizeLot(row, map, index) {
  const farmCode = text(row[map.farmCode]);
  const producer = text(row[map.producer]);
  const lot = normalizedLotNumber(row[map.lot]);
  const suppliedId = text(row[map.id]);
  const id = farmCode && lot ? `${farmCode}${lot}` : suppliedId;
  const tenureCode = normalizeTenure(row[map.tenureCode]);
  return {
    id,
    legacyId: suppliedId && suppliedId !== id ? suppliedId : "",
    farmCode,
    producer,
    lot,
    area: finiteNumber(row[map.area]),
    variety: text(row[map.variety]),
    referenceAge: referenceAge(row[map.referenceAge]),
    rowSpacingM: finiteNumber(row[map.rowSpacingM]) || null,
    cutNumber: text(row[map.cutNumber]),
    historicalTch: finiteNumber(row[map.historicalTch]) || null,
    latestSeasonTch: finiteNumber(row[map.latestSeasonTch]) || null,
    estimatedTch2627: finiteNumber(row[map.estimatedTch2627]) || null,
    // La fecha de importación del cronológico no es la fecha de emisión del estimado.
    estimatedTch2627UpdatedAt: "",
    estimatedTch2627Source: "",
    estimatedTons2627: finiteNumber(row[map.estimatedTons2627]) || null,
    texture: text(row[map.texture]),
    distanceKm: finiteNumber(row[map.distanceKm]) || null,
    initialTch: finiteNumber(row[map.initialTch]) || null,
    currentMasterTch: finiteNumber(row[map.currentMasterTch]) || null,
    plantingDate: dateISO(row[map.plantingDate]),
    lastCutDate: dateISO(row[map.lastCutDate]),
    destination: text(row[map.destination]),
    cropType: text(row[map.cropType]),
    tenureCode,
    tenureLabel: tenureLabel(tenureCode),
    irrigation: text(row[map.irrigation]),
    irrigationCount: finiteNumber(row[map.irrigationCount]) || null,
    nr: text(row[map.nr]),
    erp: text(row[map.erp]),
    zone: text(row[map.zone]),
    masterStatus: text(row[map.masterStatus]),
    masterObservation: text(row[map.masterObservation]),
    sourceRow: index + 2,
    importedAt: new Date().toISOString(),
  };
}

export function normalizeEmbeddedMaster(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row, index) => {
    const farmCode = text(row.codigoHacienda ?? row.farmCode);
    const lot = normalizedLotNumber(row.suerte ?? row.lot);
    const suppliedId = text(row.hacSue ?? row.legacyId ?? row.id);
    const id = farmCode && lot ? `${farmCode}${lot}` : suppliedId;
    const tenureCode = normalizeTenure(row.tenenciaCode ?? row.tn ?? row.tenureCode ?? row.tenencia);
    return {
      id,
      legacyId: suppliedId && suppliedId !== id ? suppliedId : "",
      farmCode,
      producer: text(row.productor ?? row.producer),
      lot,
      area: finiteNumber(row.area),
      variety: text(row.variedad ?? row.variety),
      referenceAge: referenceAge(row.edadReferencia ?? row.referenceAge),
      rowSpacingM: finiteNumber(row.surco ?? row.rowSpacingM) || null,
      cutNumber: text(row.corte ?? row.cutNumber),
      historicalTch: finiteNumber(Object.hasOwn(row, "tchHistoricoPromedio") ? row.tchHistoricoPromedio : row.historicalTch) || null,
      latestSeasonTch: finiteNumber(
        Object.hasOwn(row, "tchZafra2526") ? row.tchZafra2526 :
        Object.hasOwn(row, "tchHistorico") ? row.tchHistorico : row.latestSeasonTch
      ) || null,
      estimatedTch2627: finiteNumber(row.tchEstimado2627 ?? row.estimatedTch2627) || null,
      estimatedTch2627UpdatedAt: text(row.tchEstimado2627Fecha ?? row.estimatedTch2627UpdatedAt),
      estimatedTch2627Source: text(row.tchEstimado2627Fuente ?? row.estimatedTch2627Source),
      estimatedTons2627: finiteNumber(row.tonEstimadas2627 ?? row.estimatedTons2627) || null,
      texture: text(row.textura ?? row.texture),
      distanceKm: finiteNumber(row.km ?? row.distanceKm) || null,
      initialTch: finiteNumber(row.tchInicial ?? row.initialTch) || null,
      currentMasterTch: finiteNumber(row.tchActualMaestro ?? row.currentMasterTch) || null,
      plantingDate: dateISO(row.fechaSiembra ?? row.plantingDate),
      lastCutDate: dateISO(row.fechaUltimoCorte ?? row.lastCutDate),
      destination: text(row.destino ?? row.destination),
      cropType: text(row.cultivo ?? row.cropType),
      tenureCode,
      tenureLabel: text(row.tenenciaLabel ?? row.tenureLabel) || tenureLabel(tenureCode),
      irrigation: text(row.tipoRiego ?? row.irrigation),
      irrigationCount: finiteNumber(row.numeroRiegos ?? row.irrigationCount) || null,
      nr: text(row.nr),
      erp: text(row.erp),
      zone: text(row.zona ?? row.zone),
      masterStatus: text(row.estado ?? row.masterStatus),
      masterObservation: text(row.observacion ?? row.masterObservation),
      sourceRow: index + 2,
      importedAt: text(row.importedAt) || "2026-07-27T00:00:00.000Z",
    };
  }).filter((lot) => lot.id && lot.farmCode && lot.producer && lot.lot && lot.area > 0 && isOperationalLot(lot));
}

export function masterToEmbeddedRows(lots) {
  return (Array.isArray(lots) ? lots : [])
    .filter(isOperationalLot)
    .slice()
    .sort((a, b) => {
      const priority = (lot) => normalizeText(lot.zone) === "5 productores" ? 0 : 1;
      return priority(a) - priority(b) ||
        String(a.producer).localeCompare(String(b.producer), "es") ||
        String(a.lot).localeCompare(String(b.lot), "es", { numeric: true });
    })
    .map((lot) => ({
      codigoHacienda: text(lot.farmCode),
      productor: text(lot.producer),
      suerte: normalizedLotNumber(lot.lot),
      hacSue: text(lot.legacyId || lot.id),
      area: finiteNumber(lot.area),
      variedad: text(lot.variety),
      edadReferencia: finiteNumber(lot.referenceAge) || null,
      surco: finiteNumber(lot.rowSpacingM) || null,
      corte: text(lot.cutNumber),
      tchHistorico: finiteNumber(lot.latestSeasonTch) || null,
      tchHistoricoPromedio: finiteNumber(lot.historicalTch) || null,
      tchZafra2526: finiteNumber(lot.latestSeasonTch) || null,
      tchEstimado2627: finiteNumber(lot.estimatedTch2627) || null,
      tchEstimado2627Fecha: text(lot.estimatedTch2627UpdatedAt),
      tchEstimado2627Fuente: text(lot.estimatedTch2627Source),
      tonEstimadas2627: finiteNumber(lot.estimatedTons2627) || null,
      textura: text(lot.texture),
      km: finiteNumber(lot.distanceKm) || null,
      tchInicial: finiteNumber(lot.initialTch) || null,
      tchActualMaestro: finiteNumber(lot.currentMasterTch) || null,
      fechaSiembra: dateISO(lot.plantingDate),
      fechaUltimoCorte: dateISO(lot.lastCutDate),
      destino: text(lot.destination),
      cultivo: text(lot.cropType),
      tenenciaCode: text(lot.tenureCode),
      tenenciaLabel: text(lot.tenureLabel) || tenureLabel(lot.tenureCode),
      tipoRiego: text(lot.irrigation),
      numeroRiegos: finiteNumber(lot.irrigationCount) || null,
      nr: text(lot.nr),
      erp: text(lot.erp),
      zona: text(lot.zone),
      estado: text(lot.masterStatus),
      observacion: text(lot.masterObservation),
    }));
}

export async function masterFingerprint(lots) {
  const canonical = JSON.stringify(masterToEmbeddedRows(lots));
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export async function parseMasterWorkbook(file, currentMaster = []) {
  if (!globalThis.XLSX) throw new Error("No se cargó el componente Excel.");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const orderedSheets = workbook.SheetNames.slice().sort((a, b) => {
    const rank = (name) => normalizeText(name) === "reporte" ? 0 : normalizeText(name) === "productores" ? 1 : 2;
    return rank(a) - rank(b);
  });
  let sheetName = "", headerRow = 0, matrix = [], map = {};
  for (const candidate of orderedSheets) {
    const candidateMatrix = XLSX.utils.sheet_to_json(workbook.Sheets[candidate], { header: 1, defval: "", raw: true });
    const max = Math.min(20, candidateMatrix.length);
    for (let index = 0; index < max; index += 1) {
      const headers = candidateMatrix[index];
      const object = Object.fromEntries(headers.map((header) => [text(header), ""]));
      const candidateMap = headerMap(object);
      if (["farmCode", "producer", "lot", "area"].every((field) => candidateMap[field])) {
        sheetName = candidate; headerRow = index; matrix = candidateMatrix; map = candidateMap; break;
      }
    }
    if (sheetName) break;
  }
  if (!sheetName) throw new Error("No se encontró una tabla válida. Se requieren Código, Hacienda, Suerte y Área.");
  const headers = matrix[headerRow].map(text);
  const rows = matrix.slice(headerRow + 1).filter((row) => row.some((value) => text(value))).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
  if (!rows.length) throw new Error(`La hoja ${sheetName} está vacía.`);
  const required = ["farmCode", "producer", "lot", "area"];
  const missingHeaders = required.filter((field) => !map[field]);
  if (missingHeaders.length) throw new Error(`Faltan columnas obligatorias: ${missingHeaders.join(", ")}.`);
  const normalized = rows.map((row, index) => normalizeLot(row, map, index + headerRow)).filter((lot) => lot.id || lot.producer || lot.lot);
  const excluded = normalized.filter((lot) => !isOperationalLot(lot));
  const lots = normalized.filter(isOperationalLot);
  const errors = [];
  const counts = new Map();
  lots.forEach((lot) => {
    if (!lot.farmCode || !lot.producer || !lot.lot || !lot.id) errors.push({ row: lot.sourceRow, issue: "Registro sin código, hacienda o suerte" });
    if (lot.area <= 0) errors.push({ row: lot.sourceRow, issue: "Área vacía o no válida" });
    counts.set(lot.id, (counts.get(lot.id) || 0) + 1);
  });
  const duplicates = [...counts].filter(([, count]) => count > 1).map(([id, count]) => ({ id, count }));
  const validLots = lots.filter((lot) => lot.id && lot.farmCode && lot.producer && lot.lot && lot.area > 0);
  const uniqueLots = validLots.filter((lot, index, all) => all.findIndex((item) => item.id === lot.id) === index);
  const current = new Map(currentMaster.map((lot) => [lot.id, lot]));
  const estimateSourceDate = map.estimatedTch2627 ? seasonEstimateSourceDate(map.estimatedTch2627) : "";
  const estimateSourceLabel = map.estimatedTch2627
    ? `${file.name || "Cronológico maestro"} · ${sheetName} · ${map.estimatedTch2627}`
    : "";
  uniqueLots.forEach((lot) => {
    const previous = current.get(lot.id);
    if (!lot.historicalTch && previous?.historicalTch) lot.historicalTch = previous.historicalTch;
    if (!lot.referenceAge && previous?.referenceAge) lot.referenceAge = previous.referenceAge;
    if (!lot.latestSeasonTch && previous?.latestSeasonTch) lot.latestSeasonTch = previous.latestSeasonTch;
    if (!map.estimatedTch2627 && !lot.estimatedTch2627 && previous?.estimatedTch2627) lot.estimatedTch2627 = previous.estimatedTch2627;
    if (!map.estimatedTch2627) {
      lot.estimatedTch2627UpdatedAt = previous?.estimatedTch2627UpdatedAt || "";
      lot.estimatedTch2627Source = previous?.estimatedTch2627Source || "";
    } else {
      const sameEstimate = Number(previous?.estimatedTch2627 || 0) === Number(lot.estimatedTch2627 || 0);
      if (estimateSourceDate) {
        lot.estimatedTch2627UpdatedAt = estimateSourceDate;
        lot.estimatedTch2627Source = estimateSourceLabel;
      } else if (sameEstimate && previous?.estimatedTch2627UpdatedAt) {
        lot.estimatedTch2627UpdatedAt = previous.estimatedTch2627UpdatedAt;
        lot.estimatedTch2627Source = previous.estimatedTch2627Source || estimateSourceLabel;
      } else if (!lot.estimatedTch2627 && !previous?.estimatedTch2627UpdatedAt) {
        lot.estimatedTch2627UpdatedAt = "";
        lot.estimatedTch2627Source = "";
      } else {
        lot.estimatedTch2627UpdatedAt = "";
        lot.estimatedTch2627Source = estimateSourceLabel ? `${estimateSourceLabel} · fecha del estimado no indicada` : "";
      }
    }
    if (!lot.initialTch && previous?.initialTch) lot.initialTch = previous.initialTch;
    if (!lot.currentMasterTch && previous?.currentMasterTch) lot.currentMasterTch = previous.currentMasterTch;
  });
  let added = 0, modified = 0, unchanged = 0;
  uniqueLots.forEach((lot) => {
    const previous = current.get(lot.id);
    if (!previous) added += 1;
    else {
      const keys = Object.keys(lot).filter((key) => !["sourceRow", "importedAt"].includes(key));
      if (keys.some((key) => String(previous[key] ?? "") !== String(lot[key] ?? ""))) modified += 1;
      else unchanged += 1;
    }
  });
  return {
    sheetName,
    lots: uniqueLots,
    report: {
      analyzed: rows.length,
      headerRow: headerRow + 1,
      valid: uniqueLots.length,
      added,
      modified,
      unchanged,
      duplicates,
      errors,
      excluded: excluded.length,
      excludedReason: normalizeText(sheetName) === "reporte" ? "Zona 0 / Sucuya" : "",
      producers: uniqueLots.filter((lot) => normalizeText(lot.zone) === "5 productores").length,
    },
  };
}

function seasonEstimateSourceDate(header) {
  const digits = normalizeText(header).replace(/\D/g, "");
  const match = digits.match(/(\d{2})(\d{2})(\d{2})$/);
  if (!match) return "";
  const [, day, month, year] = match;
  return `20${year}-${month}-${day}`;
}

function estimateDateFromFilename(filename) {
  const value = String(filename || "");
  const iso = value.match(/(?:^|\D)(20\d{2})[-_]?([01]\d)[-_]?([0-3]\d)(?:\D|$)/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const short = value.match(/(?:^|\D)([0-3]\d)([01]\d)(\d{2})(?:\D|$)/);
  return short ? `20${short[3]}-${short[2]}-${short[1]}` : "";
}

function seasonEstimateSheet(workbook) {
  const candidates = workbook.SheetNames.map((sheetName) => {
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: true });
    const headerRowIndex = matrix.slice(0, 20).findIndex((row) => {
      const headers = row.map(normalizeText);
      return headers.includes("codhacienda") && headers.includes("suerte") && headers.some((header) => header.startsWith("tch est"));
    });
    if (headerRowIndex < 0) return null;
    const headers = matrix[headerRowIndex].map((value) => text(value));
    const normalized = headers.map(normalizeText);
    const estimateIndexes = normalized.map((header, index) => ({ header, index }))
      .filter(({ header }) => header.startsWith("tch est"))
      .sort((a, b) => Number(b.header.includes("170726")) - Number(a.header.includes("170726")) ||
        Number(b.header.includes("26 27")) - Number(a.header.includes("26 27")));
    return { sheetName, matrix, headerRowIndex, headers, normalized, estimateIndex: estimateIndexes[0]?.index ?? -1 };
  }).filter(Boolean);
  return candidates.find((candidate) => normalizeText(candidate.sheetName) === "productores v3") || candidates[0] || null;
}

export async function parseSeasonEstimateWorkbook(file, currentMaster = [], { declaredSourceDate = "", requireDeclaredDate = false } = {}) {
  if (!globalThis.XLSX) throw new Error("No se cargó el componente Excel.");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const selected = seasonEstimateSheet(workbook);
  if (!selected) throw new Error("No se encontró una hoja con CodHacienda, Suerte y TCH estimado.");
  const { sheetName, matrix, headerRowIndex, headers, normalized, estimateIndex } = selected;
  const indexOf = (...choices) => normalized.findIndex((header) => choices.includes(header));
  const farmIndex = indexOf("codhacienda", "cod hacienda", "codigo hacienda");
  const lotIndex = indexOf("suerte", "lote");
  const suppliedIdIndex = indexOf("hac sue", "hac-sue", "hacsue");
  const producerIndex = indexOf("nomhacienda", "nombre hacienda", "hacienda", "productor");
  const destinationIndex = indexOf("destino");
  if (farmIndex < 0 || lotIndex < 0 || estimateIndex < 0) throw new Error("La fuente no contiene las columnas mínimas para vincular el TCH 26/27.");

  const lots = currentMaster.map((lot) => ({ ...lot }));
  const byId = new Map(lots.map((lot) => [lot.id, lot]));
  const seen = new Map();
  const duplicates = [];
  const unknown = [];
  const rows = matrix.slice(headerRowIndex + 1).filter((row) => row.some((value) => value !== "" && value !== null));
  const sourceColumn = headers[estimateIndex];
  const detectedSourceDate = seasonEstimateSourceDate(sourceColumn) || estimateDateFromFilename(file.name);
  const sourceDate = dateISO(declaredSourceDate) || detectedSourceDate;
  const dateMismatch = Boolean(declaredSourceDate && detectedSourceDate && dateISO(declaredSourceDate) !== detectedSourceDate);
  const importedAt = new Date().toISOString();
  let matched = 0;
  let updated = 0;
  let unchanged = 0;
  let withEstimate = 0;
  let withoutEstimate = 0;
  let seedWithoutEstimate = 0;

  rows.forEach((row, rowOffset) => {
    const farmCode = text(row[farmIndex]);
    const lotCode = normalizedLotNumber(row[lotIndex]);
    const canonicalId = farmCode && lotCode ? `${farmCode}${lotCode}` : text(row[suppliedIdIndex]);
    const suppliedId = suppliedIdIndex >= 0 ? text(row[suppliedIdIndex]) : "";
    if (!canonicalId) return;
    if (seen.has(canonicalId)) {
      duplicates.push({ id: canonicalId, rows: [seen.get(canonicalId), headerRowIndex + rowOffset + 2] });
      return;
    }
    seen.set(canonicalId, headerRowIndex + rowOffset + 2);
    const target = byId.get(canonicalId);
    if (!target) {
      unknown.push({ id: canonicalId, suppliedId, producer: text(row[producerIndex]), lot: lotCode, row: headerRowIndex + rowOffset + 2 });
      return;
    }
    matched += 1;
    const nextEstimate = finiteNumber(row[estimateIndex]) || null;
    const destination = destinationIndex >= 0 ? text(row[destinationIndex]) : "";
    if (nextEstimate) withEstimate += 1;
    else {
      withoutEstimate += 1;
      if (/semilla/i.test(destination)) seedWithoutEstimate += 1;
    }
    if (Number(target.estimatedTch2627 || 0) === Number(nextEstimate || 0)) unchanged += 1;
    else updated += 1;
    const sameEstimate = Number(target.estimatedTch2627 || 0) === Number(nextEstimate || 0);
    target.estimatedTch2627 = nextEstimate;
    target.estimatedTch2627UpdatedAt = sourceDate || (sameEstimate ? target.estimatedTch2627UpdatedAt : "");
    target.estimatedTch2627Source = `${file.name} · ${sheetName} · ${sourceColumn}${declaredSourceDate ? ` · fecha declarada ${dateISO(declaredSourceDate)}` : ""}`;
  });

  return {
    lots,
    report: {
      sheetName,
      sourceColumn,
      sourceDate,
      declaredSourceDate: dateISO(declaredSourceDate),
      detectedSourceDate,
      dateMismatch,
      importedAt,
      analyzed: rows.length,
      matched,
      updated,
      unchanged,
      withEstimate,
      withoutEstimate,
      seedWithoutEstimate,
      withoutEstimateOther: withoutEstimate - seedWithoutEstimate,
      duplicates,
      unknown,
      canApply: duplicates.length === 0 && unknown.length === 0 && matched > 0 && (!requireDeclaredDate || Boolean(dateISO(declaredSourceDate))) && !dateMismatch,
    },
  };
}

export function masterSuggestions(master, query, limit = 40) {
  const normalized = normalizeText(query);
  if (!normalized) return [];
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const ranked = master.filter(isOperationalLot).map((lot) => {
    const haystack = normalizeText([
      lot.farmCode, lot.producer, lot.id, lot.legacyId, lot.lot, lot.variety,
      lot.zone, lot.tenureCode, lot.tenureLabel,
    ].join(" "));
    if (!tokens.every((token) => haystack.includes(token))) return null;
    const code = normalizeText(lot.farmCode);
    const id = normalizeText(lot.id);
    const legacyId = normalizeText(lot.legacyId);
    const name = normalizeText(lot.producer);
    const baseRank = id === normalized || legacyId === normalized ? 0 :
      code === normalized ? 1 :
      id.startsWith(normalized) || legacyId.startsWith(normalized) ? 2 :
      code.startsWith(normalized) ? 3 :
      name.startsWith(normalized) ? 4 : 5;
    const producerPriority = normalizeText(lot.zone) === "5 productores" ? 0 : 1;
    return { lot, baseRank, producerPriority };
  }).filter(Boolean);
  ranked.sort((a, b) =>
    a.baseRank - b.baseRank ||
    a.producerPriority - b.producerPriority ||
    a.lot.producer.localeCompare(b.lot.producer, "es") ||
    a.lot.lot.localeCompare(b.lot.lot, "es", { numeric: true })
  );
  return ranked.slice(0, limit).map(({ lot }) => lot);
}

export function auditChange(lot, field, oldValue, newValue, user = "Técnico") {
  return {
    id: createId("audit"), lotId: lot.id, farmCode: lot.farmCode, producer: lot.producer,
    field, oldValue, newValue, user, changedAt: new Date().toISOString(),
  };
}
