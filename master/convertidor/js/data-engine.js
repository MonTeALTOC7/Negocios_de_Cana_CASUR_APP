(function () {
  "use strict";

  const CFG = window.CASUR_CONFIG;

  const fold = (value) => String(value ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[_#./\\-]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

  const cleanText = (value) => String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  const round = (value, digits = 2) => Number.isFinite(value)
    ? Number(value.toFixed(digits)) : null;

  function idText(value) {
    const text = cleanText(value);
    if (!text) return "";
    return text.replace(/\.0+$/, "").replace(/\s+/g, "");
  }

  function canonicalKey(cod, suerte) {
    return `${idText(cod)}${idText(suerte)}`;
  }

  function numberOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const text = cleanText(value).replace(/\s/g, "");
    if (!text) return null;
    let normalized = text;
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) normalized = text.replace(/,/g, "");
    else if (/^-?\d+,\d+$/.test(text)) normalized = text.replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parseDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getTime());
    if (typeof value === "number" && Number.isFinite(value) && window.XLSX?.SSF) {
      const d = XLSX.SSF.parse_date_code(value);
      if (d) return new Date(d.y, d.m - 1, d.d);
    }
    const text = cleanText(value);
    if (!text) return null;
    let match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/);
    if (match) {
      let year = Number(match[3]);
      if (year < 100) year += year >= 70 ? 1900 : 2000;
      const date = new Date(year, Number(match[2]) - 1, Number(match[1]));
      return date.getFullYear() === year && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[1]) ? date : null;
    }
    match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) {
      const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function isRenewal(value) {
    const n = fold(value).replace(/\s/g, "");
    return ["r", "re", "ren", "renovacion"].includes(n);
  }

  function isSeed(value) {
    return fold(value).includes("semilla");
  }

  function ageFromDates(corte, fSiembra, fUltCte, today = new Date()) {
    const sow = parseDate(fSiembra);
    const cut = parseDate(fUltCte);
    if (isRenewal(corte)) {
      if (!sow) return { age: null, start: null, status: "Renovación pendiente" };
      return computeAge(sow, today);
    }
    const start = sow && cut ? new Date(Math.max(sow.getTime(), cut.getTime())) : (cut || sow);
    if (!start) return { age: null, start: null, status: "Sin fecha válida" };
    return computeAge(start, today);
  }

  function computeAge(start, today) {
    const delta = today.getTime() - start.getTime();
    if (!Number.isFinite(delta) || delta < 0) return { age: null, start, status: "Fecha futura o inválida" };
    return { age: round(delta / 86400000 / 30.4375, 2), start, status: "Calculada" };
  }

  function headerMatches(header, aliases) {
    const normalized = fold(header);
    return aliases.some((alias) => {
      const target = fold(alias);
      return normalized === target || (target.length > 3 && normalized.includes(target));
    });
  }

  function findHeaderIndex(headers, aliases, dynamicType) {
    const normalizedHeaders = headers.map(fold);
    for (const alias of aliases) {
      const exact = normalizedHeaders.indexOf(fold(alias));
      if (exact >= 0) return exact;
    }
    for (const alias of aliases) {
      const index = headers.findIndex((header) => headerMatches(header, [alias]));
      if (index >= 0) return index;
    }
    if (dynamicType) {
      return headers.findIndex((header) => {
        const n = fold(header);
        if (dynamicType === "tch") return /(^| )tch( |$)/.test(n) || n.startsWith("tch");
        if (dynamicType === "ton") return n.startsWith("ton") || n.includes("tonelada");
        if (dynamicType === "area") return n.startsWith("area");
        return false;
      });
    }
    return -1;
  }

  function mapHeaders(headers, kind) {
    const aliases = CFG.ALIASES[kind];
    const mapping = {};
    Object.entries(aliases).forEach(([key, list]) => {
      mapping[key] = findHeaderIndex(headers, list, ["tch", "ton", "area"].includes(key) ? key : null);
    });
    return mapping;
  }

  function sheetMatrices(sheet) {
    return {
      display: XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "", blankrows: true }),
      raw: XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "", blankrows: true }),
    };
  }

  function scoreCandidate(headers, mapping, kind, rawRows, headerRow) {
    const required = kind === "siagri" ? ["cod", "hacienda", "suerte", "zona", "area"] : ["cod", "suerte", "zona", "area", "tch"];
    const optional = Object.keys(CFG.ALIASES[kind]).filter((key) => !required.includes(key));
    const requiredFound = required.filter((key) => mapping[key] >= 0).length;
    const optionalFound = optional.filter((key) => mapping[key] >= 0).length;
    let score = (requiredFound / required.length) * 70 + (optionalFound / optional.length) * 20;
    if (kind === "estimate" && mapping.tch >= 0) {
      const sample = rawRows.slice(headerRow + 1, headerRow + 101);
      const nonEmpty = sample.filter((row) => numberOrNull(row[mapping.tch]) !== null).length;
      score += Math.min(5, nonEmpty / 10);
    } else if (kind === "siagri") {
      score += 5;
      const rawSiagriSignals = ["cod hacienda", "nombre hacienda", "ste", "nombre textura", "tch ant", "nombre destino del cultivo"];
      const normalizedHeaders = headers.map(fold);
      const originalMatches = rawSiagriSignals.filter((signal) => normalizedHeaders.includes(signal)).length;
      score += (originalMatches / rawSiagriSignals.length) * 5;
    }
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function inspectWorkbook(buffer, kind) {
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true, cellNF: true, cellStyles: true });
    const profiles = workbook.SheetNames.map((sheetName, sheetIndex) => {
      const matrices = sheetMatrices(workbook.Sheets[sheetName]);
      let best = { score: 0, headerRow: 0, mapping: {}, headers: [] };
      matrices.display.slice(0, 20).forEach((row, rowIndex) => {
        const headers = row.map(cleanText);
        const mapping = mapHeaders(headers, kind);
        const score = scoreCandidate(headers, mapping, kind, matrices.raw, rowIndex);
        if (score > best.score) best = { score, headerRow: rowIndex, mapping, headers };
      });
      return { sheetName, sheetIndex, ...best, rows: Math.max(0, matrices.raw.length - best.headerRow - 1) };
    }).sort((a, b) => b.score - a.score || a.sheetIndex - b.sheetIndex);
    return { workbook, profiles, selectedSheet: profiles[0]?.sheetName || "" };
  }

  function valueAt(rawRow, displayRow, index, preferDisplay = false) {
    if (index < 0) return "";
    const raw = rawRow?.[index];
    const display = displayRow?.[index];
    return preferDisplay ? (display !== undefined && display !== "" ? display : raw) : (raw !== undefined ? raw : display);
  }

  function extractRows(workbook, profile, kind) {
    const sheet = workbook.Sheets[profile.sheetName];
    const matrices = sheetMatrices(sheet);
    const headers = matrices.display[profile.headerRow].map(cleanText);
    const mapping = mapHeaders(headers, kind);
    const rows = [];
    for (let i = profile.headerRow + 1; i < matrices.raw.length; i += 1) {
      const raw = matrices.raw[i] || [];
      const display = matrices.display[i] || [];
      if (![...raw, ...display].some((value) => cleanText(value) !== "")) continue;
      const record = {};
      Object.entries(mapping).forEach(([key, index]) => {
        const preferDisplay = ["cod", "suerte", "corte", "numRiegos"].includes(key);
        record[key] = valueAt(raw, display, index, preferDisplay);
      });
      record.__row = i + 1;
      rows.push(record);
    }
    return { rows, headers, mapping };
  }

  function normalizeTenure(value) {
    const text = cleanText(value);
    return CFG.TENURE_MAP[text.toUpperCase()] || text;
  }

  function normalizeSiagri(source, today = new Date()) {
    const excluded = [];
    const records = [];
    const invalidDates = [];
    source.forEach((row) => {
      const cod = idText(row.cod);
      const suerte = idText(row.suerte);
      const hacSue = canonicalKey(cod, suerte);
      if (!cod && !suerte && !cleanText(row.hacienda)) return;
      if (Number(cod) === 16) {
        excluded.push({ row: row.__row, cod, suerte, hacSue });
        return;
      }
      const fSiembra = parseDate(row.fSiembra);
      const fUltCte = parseDate(row.fUltCte);
      if (row.fSiembra && !fSiembra) invalidDates.push({ row: row.__row, field: "F. Siembra", value: cleanText(row.fSiembra), hacSue });
      if (row.fUltCte && !fUltCte) invalidDates.push({ row: row.__row, field: "F. Ult. Cte", value: cleanText(row.fUltCte), hacSue });
      const ageInfo = ageFromDates(row.corte, fSiembra, fUltCte, today);
      records.push({
        hacSue, cod, hacienda: cleanText(row.hacienda), suerte,
        area: numberOrNull(row.area), variedad: cleanText(row.variedad), edad: ageInfo.age,
        tchPrev: numberOrNull(row.tchPrev), tchEstimate: null, tonsEstimate: null,
        corte: idText(row.corte), surco: cleanText(row.surco), textura: cleanText(row.textura),
        fUltCte, fSiembra, km: numberOrNull(row.km), tchInic: numberOrNull(row.tchInic),
        tchAct: numberOrNull(row.tchAct), destino: cleanText(row.destino),
        tenencia: normalizeTenure(row.tenencia), tipoRiego: cleanText(row.tipoRiego),
        numRiegos: numberOrNull(row.numRiegos), erp: cleanText(row.erp), zona: cleanText(row.zona),
        ageStatus: ageInfo.status, stateDetected: ageInfo.status === "Renovación pendiente" ? "Renovación pendiente" : "Mantener activo",
        stateValidated: "", observation: "", active: true, sourceRow: row.__row,
        estimateArea: null, areaDifference: null, estimateMatched: false, estimateInCoverage: false,
        warnings: [], agronomicFlags: [],
      });
    });
    return { records, excluded, invalidDates, sourceRows: source.length };
  }

  function normalizeEstimate(source) {
    const records = [];
    const zones = new Set();
    source.forEach((row) => {
      const cod = idText(row.cod);
      const suerte = idText(row.suerte);
      if (!cod && !suerte) return;
      const zona = cleanText(row.zona);
      if (zona) zones.add(zona);
      records.push({
        hacSue: canonicalKey(cod, suerte), cod, suerte, zona,
        hacienda: cleanText(row.hacienda), area: numberOrNull(row.area),
        tch: numberOrNull(row.tch), tonSource: numberOrNull(row.ton),
        destino: cleanText(row.destino), sourceRow: row.__row,
      });
    });
    return { records, zones: [...zones].sort() };
  }

  function chooseState(record, estimateIncluded, matched, inCoverage) {
    if (record.hacSue.toUpperCase() === "99347A") return "Baja definitiva";
    if (record.ageStatus === "Renovación pendiente") return "Renovación pendiente";
    if (isSeed(record.destino)) return "Semilla";
    if (!estimateIncluded) return "Mantener activo";
    if (!inCoverage) return "Fuera de cobertura del estimado";
    if (!matched) return "Requiere validación";
    if (record.estimateArea === null && record.tchEstimate === null) return "Requiere validación";
    if (record.tchEstimate === null) return "Pendiente de estimar TCH";
    return "Mantener activo";
  }

  function mergeEstimate(siagri, estimate, manualValidations = {}) {
    const map = new Map();
    const estimateDuplicates = new Set();
    if (estimate) {
      estimate.records.forEach((record) => {
        if (map.has(record.hacSue)) estimateDuplicates.add(record.hacSue);
        else map.set(record.hacSue, record);
      });
    }
    const zones = new Set(estimate?.zones || []);
    siagri.records.forEach((record) => {
      const match = map.get(record.hacSue);
      record.estimateMatched = Boolean(match);
      record.estimateInCoverage = Boolean(estimate) && zones.has(record.zona);
      record.estimateArea = match?.area ?? null;
      record.areaDifference = match && match.area !== null && record.area !== null ? round(match.area - record.area, 2) : null;
      record.tchEstimate = match?.tch ?? null;
      if (isSeed(record.destino) || record.hacSue.toUpperCase() === "99347A") record.tchEstimate = null;
      const effectiveArea = record.estimateArea !== null ? record.estimateArea : record.area;
      record.tonsEstimate = (!isSeed(record.destino) && record.hacSue.toUpperCase() !== "99347A" && effectiveArea !== null && record.tchEstimate !== null)
        ? round(effectiveArea * record.tchEstimate, 2) : null;
      record.stateDetected = chooseState(record, Boolean(estimate), Boolean(match), record.estimateInCoverage);
      if (record.areaDifference !== null && Math.abs(record.areaDifference) > 0.01) record.warnings.push("Discrepancia de área");
      if (!record.cod) record.warnings.push("Hacienda inválida");
      if (!record.suerte) record.warnings.push("Suerte inválida");
      if (record.area === null) record.warnings.push("Área SIAGRI faltante");
      if (record.ageStatus === "Sin fecha válida" || record.ageStatus === "Fecha futura o inválida") record.warnings.push(record.ageStatus);
      const saved = manualValidations[record.hacSue];
      if (saved) {
        record.stateValidated = cleanText(saved.state);
        record.observation = cleanText(saved.observation);
      }
      applyOperationalState(record);
      record.agronomicFlags = agronomicFlags(record);
    });
    return { estimateDuplicates: [...estimateDuplicates], coverageZones: [...zones].sort() };
  }

  function applyOperationalState(record) {
    const state = record.stateValidated || record.stateDetected;
    record.active = !["Baja definitiva", "Sin caña / No cosecha Z26/27", "Excluir del estimado"].includes(state);
    if (["Baja definitiva", "Sin caña / No cosecha Z26/27", "Excluir del estimado", "Semilla"].includes(state)) {
      record.tchEstimate = null;
      record.tonsEstimate = null;
    }
    return record;
  }

  function agronomicFlags(record) {
    const flags = [];
    const state = record.stateValidated || record.stateDetected;
    if (!record.variedad) flags.push("Variedad faltante");
    if (!record.tipoRiego) flags.push("Tipo de riego faltante");
    else if (/^[a-z0-9]{1,4}$/i.test(record.tipoRiego)) flags.push("Riego registrado solo como código");
    if (record.edad !== null && record.edad > 18 && !isSeed(record.destino) && state !== "Baja definitiva") flags.push("Edad mayor de 18 meses");
    const cuts = numberOrNull(record.corte);
    if (cuts !== null && cuts >= 5 && !isSeed(record.destino) && state !== "Baja definitiva") flags.push("Cepa con 5 o más cortes");
    if (record.tchPrev !== null && record.tchEstimate !== null && record.tchPrev > 0 && record.tchEstimate <= record.tchPrev * 0.85) flags.push("Caída de TCH estimada ≥ 15%");
    if (record.areaDifference !== null && Math.abs(record.areaDifference) > 0.01) flags.push("Cambio de área entre fuentes");
    if (record.ageStatus === "Renovación pendiente") flags.push("Renovación sin fecha de siembra");
    return flags;
  }

  function buildZoneSummary(records) {
    const totalArea = records.reduce((sum, record) => sum + (record.area || 0), 0);
    const groups = new Map();
    records.forEach((record) => {
      const key = record.zona || "Sin zona";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    });
    return [...groups.entries()].map(([zona, zoneRecords]) => {
      const area = round(zoneRecords.reduce((sum, record) => sum + (record.area || 0), 0), 2) || 0;
      const ageWeightedArea = zoneRecords.reduce((sum, record) => sum + (record.edad !== null ? record.edad * (record.area || 0) : 0), 0);
      const ageArea = zoneRecords.reduce((sum, record) => sum + (record.edad !== null ? (record.area || 0) : 0), 0);
      const tchArea = zoneRecords.reduce((sum, record) => sum + (record.tchEstimate !== null ? (record.estimateArea ?? record.area ?? 0) : 0), 0);
      const tchWeighted = zoneRecords.reduce((sum, record) => sum + (record.tchEstimate !== null ? record.tchEstimate * (record.estimateArea ?? record.area ?? 0) : 0), 0);
      return {
        zona,
        area,
        percent: totalArea ? round((area / totalArea) * 100, 1) : 0,
        suertes: zoneRecords.length,
        haciendas: new Set(zoneRecords.map((record) => record.cod).filter(Boolean)).size,
        edadPromedio: ageArea ? round(ageWeightedArea / ageArea, 2) : null,
        tchPonderado: tchArea ? round(tchWeighted / tchArea, 2) : null,
        alertas: zoneRecords.filter((record) => record.warnings.length).length,
        atencionAgronomica: zoneRecords.filter((record) => record.agronomicFlags.length).length,
      };
    }).sort((a, b) => b.area - a.area || a.zona.localeCompare(b.zona));
  }

  function countDuplicates(records) {
    const counts = new Map();
    records.forEach((record) => counts.set(record.hacSue, (counts.get(record.hacSue) || 0) + 1));
    return [...counts.entries()].filter(([key, count]) => key && count > 1).map(([key, count]) => ({ key, count }));
  }

  function buildAudit(siagri, merge, estimateIncluded) {
    const records = siagri.records;
    const duplicates = countDuplicates(records);
    const state = (record) => record.stateValidated || record.stateDetected;
    const uniqueHaciendas = new Set(records.map((record) => record.cod).filter(Boolean));
    const sourceZones = [...new Set(records.map((record) => record.zona).filter(Boolean))];
    const coversAllCasur = sourceZones.length > 0 && sourceZones.every((zone) => merge.coverageZones.includes(zone));
    const coverageLabel = !estimateIncluded ? "Sin estimado" : coversAllCasur ? "Todo CASUR" : merge.coverageZones.join(", ") || "Sin cobertura";
    return {
      sourceRows: siagri.sourceRows,
      sucuyaExcluded: siagri.excluded.length,
      finalRows: records.length,
      haciendas: uniqueHaciendas.size,
      uniqueKeys: new Set(records.map((record) => record.hacSue)).size,
      duplicates: duplicates.length,
      duplicateDetail: duplicates,
      invalidDates: siagri.invalidDates.length,
      renewalPending: records.filter((r) => r.ageStatus === "Renovación pendiente").length,
      invalidLuck: records.filter((r) => !r.suerte).length,
      invalidFarm: records.filter((r) => !r.cod).length,
      missingArea: records.filter((r) => r.area === null).length,
      estimatesAvailable: records.filter((r) => r.tchEstimate !== null).length,
      estimatesMissing: records.filter((r) => r.estimateInCoverage && !isSeed(r.destino) && r.tchEstimate === null).length,
      seeds: records.filter((r) => isSeed(r.destino) || state(r) === "Semilla").length,
      definitiveDrops: records.filter((r) => state(r) === "Baja definitiva").length,
      alerts: records.filter((r) => r.warnings.length || ["Requiere validación", "Renovación pendiente", "Pendiente de estimar TCH"].includes(state(r))).length,
      qualityWarningRecords: records.filter((r) => r.warnings.length).length,
      agronomicAttention: records.filter((r) => r.agronomicFlags.length).length,
      overAge: records.filter((r) => r.agronomicFlags.includes("Edad mayor de 18 meses")).length,
      highCuts: records.filter((r) => r.agronomicFlags.includes("Cepa con 5 o más cortes")).length,
      fallingTch: records.filter((r) => r.agronomicFlags.includes("Caída de TCH estimada ≥ 15%")).length,
      irrigationReview: records.filter((r) => r.agronomicFlags.some((flag) => flag.includes("riego") || flag.includes("Riego"))).length,
      missingVariety: records.filter((r) => r.agronomicFlags.includes("Variedad faltante")).length,
      areaMismatch: records.filter((r) => r.agronomicFlags.includes("Cambio de área entre fuentes")).length,
      producers: records.filter((r) => r.zona === "5-Productores").length,
      areaTotal: round(records.reduce((sum, r) => sum + (r.area || 0), 0), 2),
      zoneSummary: buildZoneSummary(records),
      coverageZones: merge.coverageZones,
      coverageLabel,
      estimateDuplicates: merge.estimateDuplicates,
      criticalPass: siagri.excluded.length >= 0 && duplicates.length === 0 && records.every((r) => Number(r.cod) !== 16),
    };
  }

  const COMPARISON_FIELDS = [
    { key: "area", label: "Área", type: "number", tolerance: 0.01 },
    { key: "variedad", label: "Variedad", type: "text" },
    { key: "corte", label: "# de corte", type: "text" },
    { key: "fSiembra", label: "F. Siembra", type: "date" },
    { key: "fUltCte", label: "F. Ult. Cte", type: "date" },
    { key: "destino", label: "Destino", type: "text" },
    { key: "tenencia", label: "Tenencia", type: "text" },
    { key: "tipoRiego", label: "Tipo de riego", type: "text" },
    { key: "numRiegos", label: "# de riegos", type: "number", tolerance: 0.01 },
    { key: "zona", label: "Zona", type: "text" },
    { key: "tchPrev", label: "TCH Z25/26", type: "number", tolerance: 0.01 },
  ];

  function comparisonValue(value, type) {
    if (type === "date") {
      const date = parseDate(value);
      return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : "";
    }
    if (type === "number") return numberOrNull(value);
    return fold(value);
  }

  function displayComparisonValue(value, type) {
    if (type === "date") return comparisonValue(value, type) || "—";
    if (value === null || value === undefined || value === "") return "—";
    if (type === "number") return round(Number(value), 2);
    return cleanText(value);
  }

  function recordChanges(current, previous) {
    return COMPARISON_FIELDS.flatMap((field) => {
      const before = comparisonValue(previous[field.key], field.type);
      const after = comparisonValue(current[field.key], field.type);
      const equal = field.type === "number"
        ? (before === null && after === null) || (before !== null && after !== null && Math.abs(before - after) <= field.tolerance)
        : before === after;
      return equal ? [] : [{
        field: field.key,
        label: field.label,
        before: displayComparisonValue(previous[field.key], field.type),
        after: displayComparisonValue(current[field.key], field.type),
      }];
    });
  }

  function comparisonSeverity(type, changes) {
    if (type === "Nueva" || type === "Retirada") return "Alta";
    const highImpact = new Set(["area", "fSiembra", "fUltCte", "destino", "tipoRiego", "zona"]);
    if (changes.some((change) => highImpact.has(change.field))) return "Alta";
    return changes.length >= 3 ? "Media" : "Baja";
  }

  function compareDatasets(currentRecords, previousRecords) {
    const currentMap = new Map(currentRecords.map((record) => [record.hacSue, record]));
    const previousMap = new Map(previousRecords.map((record) => [record.hacSue, record]));
    const details = [];
    const unchangedDetails = [];
    let unchanged = 0;
    currentMap.forEach((current, hacSue) => {
      const previous = previousMap.get(hacSue);
      if (!previous) {
        details.push({ hacSue, type: "Nueva", severity: "Alta", current, previous: null, changes: [] });
        return;
      }
      const changes = recordChanges(current, previous);
      if (!changes.length) {
        unchanged += 1;
        unchangedDetails.push({ hacSue, type: "Sin cambios", severity: "Baja", current, previous, changes: [] });
      }
      else details.push({ hacSue, type: "Modificada", severity: comparisonSeverity("Modificada", changes), current, previous, changes });
    });
    previousMap.forEach((previous, hacSue) => {
      if (!currentMap.has(hacSue)) details.push({ hacSue, type: "Retirada", severity: "Alta", current: null, previous, changes: [] });
    });
    const fieldCounts = {};
    details.forEach((detail) => detail.changes.forEach((change) => { fieldCounts[change.label] = (fieldCounts[change.label] || 0) + 1; }));
    const currentArea = currentRecords.reduce((sum, record) => sum + (record.area || 0), 0);
    const previousArea = previousRecords.reduce((sum, record) => sum + (record.area || 0), 0);
    return {
      currentRows: currentRecords.length,
      previousRows: previousRecords.length,
      newRecords: details.filter((detail) => detail.type === "Nueva").length,
      removedRecords: details.filter((detail) => detail.type === "Retirada").length,
      modifiedRecords: details.filter((detail) => detail.type === "Modificada").length,
      unchangedRecords: unchanged,
      areaCurrent: round(currentArea, 2),
      areaPrevious: round(previousArea, 2),
      areaDelta: round(currentArea - previousArea, 2),
      fieldCounts,
      unchangedDetails,
      details: details.sort((a, b) => ({ Alta: 0, Media: 1, Baja: 2 }[a.severity] - ({ Alta: 0, Media: 1, Baja: 2 }[b.severity]) || a.hacSue.localeCompare(b.hacSue))),
    };
  }

  function buildDataset(siagriInspection, siagriSheet, estimateInspection, estimateSheet, manualValidations = {}, today = new Date()) {
    const sProfile = siagriInspection.profiles.find((p) => p.sheetName === siagriSheet) || siagriInspection.profiles[0];
    const sExtract = extractRows(siagriInspection.workbook, sProfile, "siagri");
    const siagri = normalizeSiagri(sExtract.rows, today);
    let estimate = null;
    let estimateField = "";
    if (estimateInspection) {
      const eProfile = estimateInspection.profiles.find((p) => p.sheetName === estimateSheet) || estimateInspection.profiles[0];
      const eExtract = extractRows(estimateInspection.workbook, eProfile, "estimate");
      estimate = normalizeEstimate(eExtract.rows);
      estimateField = eExtract.headers[eExtract.mapping.tch] || "";
    }
    const merge = mergeEstimate(siagri, estimate, manualValidations);
    const audit = buildAudit(siagri, merge, Boolean(estimate));
    return { records: siagri.records, audit, source: siagri, estimate, estimateField, siagriProfile: sProfile };
  }

  function toMasterRow(record) {
    return {
      "Hac-Sue": record.hacSue, Cod: record.cod, Hacienda: record.hacienda, Suerte: record.suerte,
      Area: record.area, Variedad: record.variedad, Edad: record.edad,
      TCH_Z2526: record.tchPrev, TCH_Estimado_Z2627: record.tchEstimate,
      Ton_Estimadas_Z2627: record.tonsEstimate, "#_de_Corte": record.corte,
      Surco: record.surco, Textura: record.textura, "F. Ult. Cte": record.fUltCte,
      "F. Siembra": record.fSiembra, Km: record.km, "Tch.Inic": record.tchInic,
      "Tch.Act": record.tchAct, Destino: record.destino, Tenencia: record.tenencia,
      Tipo_de_Riego: record.tipoRiego, "#_de_Riegos": record.numRiegos,
      ERP: record.erp, ZONA: record.zona,
      Estado: record.stateValidated || record.stateDetected, Observación: record.observation || null,
    };
  }

  function isoLocalDate(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function excelCellColor(state) {
    if (state === "Baja definitiva") return "FCE8E6";
    if (state === "Semilla") return "E6F4EA";
    if (state.includes("pendiente") || state === "Requiere validación") return "FFF4CE";
    return null;
  }

  function excelAgeFormula(rowNumber) {
    const corte = `${columnLetter(CFG.MASTER_COLUMNS.indexOf("#_de_Corte") + 1)}${rowNumber}`;
    const fUltCte = `${columnLetter(CFG.MASTER_COLUMNS.indexOf("F. Ult. Cte") + 1)}${rowNumber}`;
    const fSiembra = `${columnLetter(CFG.MASTER_COLUMNS.indexOf("F. Siembra") + 1)}${rowNumber}`;
    const cutText = `UPPER(TRIM(${corte}&""))`;
    const renewal = `OR(${cutText}="R",${cutText}="RE",${cutText}="REN",${cutText}="RENOVACION",${cutText}="RENOVACIÓN")`;
    const renewalAge = `IF(${fSiembra}="","",IF(${fSiembra}>TODAY(),"",ROUND((TODAY()-${fSiembra})/30.4375,2)))`;
    const normalAge = `IF(AND(${fUltCte}="",${fSiembra}=""),"",IF(MAX(${fUltCte},${fSiembra})>TODAY(),"",ROUND((TODAY()-MAX(${fUltCte},${fSiembra}))/30.4375,2)))`;
    return `IF(${renewal},${renewalAge},${normalAge})`;
  }

  async function buildExcel(dataset) {
    if (!window.ExcelJS) throw new Error("No se cargó el generador profesional de Excel.");
    if (!dataset.audit.criticalPass) throw new Error("La exportación está bloqueada por una validación crítica.");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Administrador del Cronológico Maestro CASUR";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.calcProperties.fullCalcOnLoad = true;
    workbook.calcProperties.forceFullCalc = true;
    workbook.calcProperties.calcMode = "auto";
    const sheets = [
      ["REPORTE", dataset.records],
      ["Productores", dataset.records.filter((record) => record.zona === "5-Productores")],
    ];
    for (const [name, records] of sheets) {
      const ws = workbook.addWorksheet(name, { properties: { tabColor: { argb: name === "REPORTE" ? "FF149447" : "FF198EB8" } } });
      ws.views = [{ state: "frozen", ySplit: 1, activeCell: "A2" }];
      ws.columns = CFG.MASTER_COLUMNS.map((header) => ({ header, key: header, width: ({
        "Hac-Sue": 14, Cod: 10, Hacienda: 30, Suerte: 11, Area: 12, Variedad: 17, Edad: 11,
        TCH_Z2526: 14, TCH_Estimado_Z2627: 21, Ton_Estimadas_Z2627: 23, "#_de_Corte": 14,
        Surco: 10, Textura: 14, "F. Ult. Cte": 16, "F. Siembra": 16, Km: 9,
        "Tch.Inic": 12, "Tch.Act": 12, Destino: 18, Tenencia: 18, Tipo_de_Riego: 18,
        "#_de_Riegos": 14, ERP: 13, ZONA: 18, Estado: 28, Observación: 36,
      })[header] || 14 }));
      records.forEach((record) => {
        const row = ws.addRow(toMasterRow(record));
        row.getCell("Edad").value = { formula: excelAgeFormula(row.number), result: record.edad ?? "" };
      });
      ws.autoFilter = { from: "A1", to: `${columnLetter(CFG.MASTER_COLUMNS.length)}1` };
      ws.getRow(1).height = 32;
      ws.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B4D67" } };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = { bottom: { style: "medium", color: { argb: "FF79C143" } } };
      });
      ["Hac-Sue", "Cod", "Suerte", "#_de_Corte"].forEach((header) => {
        ws.getColumn(header).numFmt = "@";
      });
      ["Area", "Edad", "TCH_Z2526", "TCH_Estimado_Z2627", "Ton_Estimadas_Z2627", "Km", "Tch.Inic", "Tch.Act", "#_de_Riegos"].forEach((header) => {
        ws.getColumn(header).numFmt = "0.00";
      });
      ["F. Ult. Cte", "F. Siembra"].forEach((header) => { ws.getColumn(header).numFmt = "dd-mmm-yyyy"; });
      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        row.height = 22;
        row.alignment = { vertical: "middle" };
        const state = cleanText(row.getCell("Estado").value);
        const color = excelCellColor(state);
        if (color) row.getCell("Estado").fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${color}` } };
        row.getCell("Estado").font = { bold: true, color: { argb: "FF324B5A" } };
      });
      ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    }
    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `Cronologico_Maestro_CASUR_${isoLocalDate()}.xlsx`;
    return { buffer, filename };
  }

  async function exportExcel(dataset) {
    const built = await buildExcel(dataset);
    downloadBlob(new Blob([built.buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), built.filename);
    return built.filename;
  }

  function columnLetter(number) {
    let output = "";
    for (let n = number; n > 0; n = Math.floor((n - 1) / 26)) output = String.fromCharCode(((n - 1) % 26) + 65) + output;
    return output;
  }

  function jsonRecord(record) {
    const row = toMasterRow(record);
    ["F. Ult. Cte", "F. Siembra"].forEach((key) => { row[key] = row[key] instanceof Date ? row[key].toISOString().slice(0, 10) : null; });
    row.Activa = record.active;
    row.Area_Estimado = record.estimateArea;
    row.Diferencia_Area = record.areaDifference;
    row.Estado_Detectado = record.stateDetected;
    row.Estado_Validado = record.stateValidated || null;
    row.Alertas = record.warnings;
    row.Alertas_Agronomicas = record.agronomicFlags;
    return row;
  }

  function buildJsonPayload(dataset, sourceMeta) {
    if (!dataset.audit.criticalPass) throw new Error("La exportación está bloqueada por una validación crítica.");
    return {
      schemaVersion: CFG.SCHEMA_VERSION,
      version: `${isoLocalDate()}-${String(Date.now()).slice(-6)}`,
      generatedAt: new Date().toISOString(),
      source: sourceMeta,
      estimateMetadata: { detectedTchField: dataset.estimateField || null },
      coverage: { estimateZones: dataset.audit.coverageZones, label: dataset.audit.coverageLabel },
      validation: dataset.audit,
      records: dataset.records.map(jsonRecord),
    };
  }

  function exportJson(dataset, sourceMeta) {
    const payload = buildJsonPayload(dataset, sourceMeta);
    const filename = "cronologico_master.json";
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" }), filename);
    return filename;
  }

  function selfTests() {
    const tests = [];
    const check = (name, value) => tests.push({ name, pass: Boolean(value) });
    check("Hac-Sue 908 + 01", canonicalKey("908", "01") === "90801");
    check("Hac-Sue conserva suerte alfanumérica", canonicalKey("908", "05A") === "90805A");
    check("Código corto no se rellena", canonicalKey("25", "01") === "2501" && canonicalKey("7", "01") === "701");
    check("Código con cero se conserva", canonicalKey("007", "01") === "00701");
    check("Semilla usa contains", isSeed("Semilla AS") && isSeed("SEMILLA"));
    check("TCH vacío no es cero", numberOrNull("") === null);
    check("Área vacía no es cero", numberOrNull(null) === null);
    const renewal = ageFromDates("R", "", "2026-01-25", new Date(2026, 7, 22));
    check("Renovación sin siembra queda sin edad", renewal.age === null && renewal.status === "Renovación pendiente");
    const normal = ageFromDates("2", "2020-01-01", "2026-01-01", new Date(2026, 7, 22));
    check("Edad normal usa la fecha más reciente", normal.age > 7 && normal.age < 8);
    check("Fecha inválida se rechaza", parseDate("31/02/2026") === null);
    const dupes = countDuplicates([{ hacSue: "90801" }, { hacSue: "90801" }]);
    check("Duplicado Hac-Sue detectado", dupes.length === 1);
    check("Baja definida reconocida", chooseState({ hacSue: "99347A", ageStatus: "Calculada", destino: "Molienda" }, true, true, true) === "Baja definitiva");
    check("Tipo de riego descriptivo gana al código", mapHeaders(["CodTipoRiego", "TipoRiego"], "siagri").tipoRiego === 1);
    check("Fórmula Excel Edad usa HOY", excelAgeFormula(2).includes("TODAY()") && excelAgeFormula(2).includes("30.4375"));
    const comparison = compareDatasets(
      [{ hacSue: "101", area: 11, variedad: "CP", zona: "1-Sur" }, { hacSue: "102", area: 2, variedad: "CG", zona: "1-Sur" }],
      [{ hacSue: "101", area: 10, variedad: "CP", zona: "1-Sur" }, { hacSue: "103", area: 3, variedad: "CG", zona: "1-Sur" }],
    );
    check("Comparativo detecta alta, baja y modificación", comparison.newRecords === 1 && comparison.removedRecords === 1 && comparison.modifiedRecords === 1);
    return { passed: tests.filter((t) => t.pass).length, total: tests.length, tests };
  }

  window.CASUR_ENGINE = {
    fold, cleanText, idText, numberOrNull, parseDate, isRenewal, isSeed,
    canonicalKey, ageFromDates, inspectWorkbook, buildDataset, buildAudit, buildZoneSummary,
    compareDatasets, applyOperationalState, toMasterRow, excelAgeFormula, buildExcel, exportExcel, buildJsonPayload, exportJson, selfTests, isoLocalDate,
  };
})();
