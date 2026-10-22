(function (root, factory) {
  "use strict";

  const api = factory();
  if (root) root.CASUR_HISTORICAL_ENGINE = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const EMPTY_TEXT = "";

  function finite(value) {
    if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function text(value) {
    return value === null || value === undefined ? EMPTY_TEXT : String(value).trim();
  }

  function round(value, digits = 2) {
    if (!Number.isFinite(value)) return null;
    const factor = 10 ** digits;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  function normalizeHistoricalRows(lotCompact) {
    if (!Array.isArray(lotCompact)) return [];

    const normalized = [];
    lotCompact.forEach((lot) => {
      if (!Array.isArray(lot)) return;
      const rows = Array.isArray(lot[11]) ? lot[11] : [];
      rows.forEach((row) => {
        if (!Array.isArray(row)) return;
        normalized.push({
          lotId: text(lot[0]),
          farmCode: text(lot[8]),
          farmName: text(lot[9]),
          suerte: text(lot[10]),
          zafra: finite(row[0]),
          area: finite(row[1]),
          ton: finite(row[2]),
          tchStored: finite(row[3]),
          katm: finite(row[4]),
          edad: finite(row[5]),
          // lotCompact[11][n][6] is the number of source records, never a cut number.
          sourceCount: finite(row[6]),
          variedad: text(lot[3]),
          riego: text(lot[4]),
          zona: text(lot[2]),
          tenencia: text(lot[5]),
        });
      });
    });
    return normalized;
  }

  function periodMode(mode) {
    return text(mode).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[\s_-]+/g, "");
  }

  function resolvePeriod(zafras, mode = "latest", custom) {
    const available = [...new Set((zafras || []).map(finite).filter((value) => value !== null))]
      .sort((a, b) => a - b);
    const normalizedMode = periodMode(mode);

    if (["latest", "last", "ultima", "1"].includes(normalizedMode)) return available.slice(-1);
    if (["last3", "ultimas3", "3"].includes(normalizedMode)) return available.slice(-3);
    if (["last5", "ultimas5", "5"].includes(normalizedMode)) return available.slice(-5);
    if (["all", "todas", "todo"].includes(normalizedMode)) return available;
    if (!["custom", "personalizado", "personalizada"].includes(normalizedMode)) {
      throw new RangeError(`Modo de periodo no soportado: ${mode}`);
    }

    let requested = [];
    if (Array.isArray(custom) || custom instanceof Set) {
      requested = [...custom].map(finite).filter((value) => value !== null);
    } else if (custom && typeof custom === "object") {
      if (Array.isArray(custom.zafras) || custom.zafras instanceof Set) {
        requested = [...custom.zafras].map(finite).filter((value) => value !== null);
      } else {
        const from = finite(custom.from ?? custom.start ?? custom.desde);
        const to = finite(custom.to ?? custom.end ?? custom.hasta);
        requested = available.filter((zafra) => (from === null || zafra >= from) && (to === null || zafra <= to));
      }
    }
    const requestedSet = new Set(requested);
    const resolved = available.filter((zafra) => requestedSet.has(zafra));
    if (!resolved.length) throw new RangeError("El periodo personalizado requiere al menos una zafra disponible.");
    return resolved;
  }

  function reconcilePeriodSelection(zafras, mode = "latest", selected = []) {
    const available = resolvePeriod(zafras, "all");
    if (!available.length) return [];
    const normalizedMode = periodMode(mode);
    if (!["custom", "personalizado", "personalizada"].includes(normalizedMode)) {
      return resolvePeriod(available, mode);
    }
    const requested = new Set((selected instanceof Set ? [...selected] : Array.isArray(selected) ? selected : [selected])
      .map(finite).filter((value) => value !== null));
    const reconciled = available.filter((zafra) => requested.has(zafra));
    return reconciled.length ? reconciled : resolvePeriod(available, "latest");
  }

  function matchesScope(row, scope) {
    if (!scope) return true;
    if (typeof scope === "function") return Boolean(scope(row));
    if (typeof scope === "string" || typeof scope === "number") return text(row.lotId) === text(scope);
    if (typeof scope !== "object") return true;

    const filters = [
      ["lotId", "lotIds"], ["farmCode", "farmCodes"], ["suerte", "suertes"],
      ["variedad", "variedades"], ["riego", "riegos"], ["zona", "zonas"],
      ["tenencia", "tenencias"],
    ];
    return filters.every(([single, plural]) => {
      const expected = scope[plural] ?? scope[single];
      if (expected === null || expected === undefined || expected === "") return true;
      const values = Array.isArray(expected) || expected instanceof Set ? [...expected] : [expected];
      return values.some((value) => text(value) === text(row[single]));
    });
  }

  function filterHistoricalRows(rows, scope, period) {
    const allowed = period === null || period === undefined
      ? null
      : new Set((period instanceof Set ? [...period] : Array.isArray(period) ? period : [period])
        .map(finite).filter((value) => value !== null));
    return (Array.isArray(rows) ? rows : []).filter((row) => {
      const zafra = finite(row?.zafra);
      return matchesScope(row || {}, scope) && (allowed === null || allowed.has(zafra));
    });
  }

  function aggregateHistoricalRows(rows) {
    const list = Array.isArray(rows) ? rows : [];
    let area = 0;
    let ton = 0;
    let tchArea = 0;
    let tchTon = 0;
    let katmTon = 0;
    let katmNumerator = 0;
    let edadArea = 0;
    let edadNumerator = 0;
    let sourceCount = 0;
    const lotIds = new Set();
    const zafras = new Set();

    list.forEach((row) => {
      const rowArea = finite(row?.area);
      const rowTon = finite(row?.ton);
      const rowKatm = finite(row?.katm);
      const rowEdad = finite(row?.edad);
      const rowSourceCount = finite(row?.sourceCount);
      const zafra = finite(row?.zafra);

      if (rowArea !== null && rowArea > 0) area += rowArea;
      if (rowTon !== null && rowTon >= 0) ton += rowTon;
      if (rowArea !== null && rowArea > 0 && rowTon !== null && rowTon >= 0) {
        tchArea += rowArea;
        tchTon += rowTon;
      }
      if (rowKatm !== null && rowTon !== null && rowTon >= 0) {
        katmNumerator += rowKatm * rowTon;
        katmTon += rowTon;
      }
      if (rowEdad !== null && rowArea !== null && rowArea > 0) {
        edadNumerator += rowEdad * rowArea;
        edadArea += rowArea;
      }
      if (rowSourceCount !== null && rowSourceCount >= 0) sourceCount += rowSourceCount;
      if (text(row?.lotId)) lotIds.add(text(row.lotId));
      if (zafra !== null) zafras.add(zafra);
    });

    return {
      area: round(area) ?? 0,
      ton: round(ton) ?? 0,
      tch: tchArea > 0 ? round(tchTon / tchArea) : null,
      katm: katmTon > 0 ? round(katmNumerator / katmTon) : null,
      edad: edadArea > 0 ? round(edadNumerator / edadArea) : null,
      suertes: lotIds.size,
      sourceCount: round(sourceCount) ?? 0,
      zafras: [...zafras].sort((a, b) => a - b),
    };
  }

  function compareHistoricalRows(rows, entityScope, benchmarkScope, period) {
    const entity = aggregateHistoricalRows(filterHistoricalRows(rows, entityScope, period));
    const benchmark = aggregateHistoricalRows(filterHistoricalRows(rows, benchmarkScope, period));
    return {
      entity,
      benchmark,
      deltaTch: entity.tch !== null && benchmark.tch !== null ? round(entity.tch - benchmark.tch) : null,
    };
  }

  function buildHistoricalChartModel(rows, selectedZafras, metric = "tch") {
    const normalizedMetric = String(metric || "tch").trim().toLowerCase() === "katm" ? "katm" : "tch";
    const selected = new Set((selectedZafras instanceof Set ? [...selectedZafras] : Array.isArray(selectedZafras) ? selectedZafras : [selectedZafras])
      .map(finite).filter((value) => value !== null));
    const points = groupHistoricalBySeason(rows).map((group) => ({
      zafra: group.zafra,
      area: group.area,
      ton: group.ton,
      tch: group.tch,
      katm: group.katm,
      edad: group.edad,
      suertes: group.suertes,
      value: group[normalizedMetric],
      selected: selected.has(group.zafra),
    }));
    const periodRows = filterHistoricalRows(rows, null, [...selected]);
    const period = aggregateHistoricalRows(periodRows);
    const reference = period[normalizedMetric];
    const values = points.map((point) => point.value).filter((value) => value !== null);
    if (reference !== null) values.push(reference);
    let min = null;
    let max = null;
    if (values.length) {
      const rawMin = Math.min(...values);
      const rawMax = Math.max(...values);
      const span = rawMax - rawMin;
      const padding = span > 0 ? span * 0.12 : Math.max(Math.abs(rawMax) * 0.08, 1);
      min = rawMin - padding;
      max = rawMax + padding;
    }
    return { metric: normalizedMetric, points, reference, min, max };
  }

  function groupHistoricalBySeason(rows) {
    const groups = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const zafra = finite(row?.zafra);
      if (zafra === null) return;
      if (!groups.has(zafra)) groups.set(zafra, []);
      groups.get(zafra).push(row);
    });
    return [...groups.entries()].sort(([a], [b]) => a - b)
      .map(([zafra, values]) => ({ zafra, ...aggregateHistoricalRows(values) }));
  }

  // `distancia` is the official SIAGRI Cronológico `Km` field. Its data build
  // maps a blank Km to 0, so 0 cannot be certified as an observed distance.
  function buildCurrentDistanceIndex(producers) {
    const index = new Map();
    (Array.isArray(producers) ? producers : []).forEach((producer) => {
      (Array.isArray(producer?.details) ? producer.details : []).forEach((lot) => {
        const lotId = text(lot?.codLote);
        if (!lotId) return;
        if (index.has(lotId)) {
          index.set(lotId, { km: null, reason: `Correspondencia ambigua: ${lotId}` });
          return;
        }
        const km = finite(lot?.distancia);
        index.set(lotId, km !== null && km > 0
          ? { km, reason: null }
          : { km: null, reason: `Km no acreditado: ${lotId}` });
      });
    });
    return index;
  }

  function currentDistanceForLot(index, lotId) {
    const id = text(lotId);
    if (!id) return { km: null, reason: "CodSuerte histórico ausente" };
    return index?.get(id) || { km: null, reason: `Sin correspondencia vigente: ${id}` };
  }

  // La referencia de finca procede solo del Cronológico vigente. Las zafras
  // históricas nunca participan en el denominador ni en la cobertura.
  function calculateCurrentFarmWeightedKm(producers, farmCode) {
    const code = text(farmCode);
    const matches = (Array.isArray(producers) ? producers : []).filter((producer) => text(producer?.code) === code);
    const empty = { kmWeighted: null, weightedNumerator: 0, areaTotal: 0, areaCovered: 0, coveragePct: 0,
      lotCount: 0, lotCountWithKm: 0, status: "unavailable", reason: "Sin finca vigente en Cronológico SIAGRI" };
    if (!code || !matches.length) return empty;
    if (matches.length !== 1) return { ...empty, reason: `Finca vigente ambigua: ${code}` };
    const lots = Array.isArray(matches[0].details) ? matches[0].details : [];
    const grouped = new Map();
    const seenIds = new Set();
    let invalidArea = 0;
    for (const lot of lots) {
      const id = text(lot?.codLote);
      const repeated = !!id && seenIds.has(id);
      if (id) seenIds.add(id);
      const area = finite(lot?.area);
      if (area === null || area <= 0) {
        invalidArea++;
        if (grouped.has(id)) grouped.get(id).ambiguous = true;
        continue;
      }
      const key = id || `__sin_id_${grouped.size}`;
      if (!grouped.has(key)) grouped.set(key, { lot, area, ambiguous: !id || repeated });
      else grouped.get(key).ambiguous = true;
    }
    let areaTotal = 0, areaCovered = 0, numerator = 0, lotCountWithKm = 0, ambiguous = 0, missingKm = 0;
    for (const entry of grouped.values()) {
      areaTotal += entry.area; // Nunca contar dos veces una identidad duplicada.
      if (entry.ambiguous) { ambiguous++; continue; }
      const km = finite(entry.lot.distancia);
      if (km === null || km <= 0) { missingKm++; continue; }
      numerator += km * entry.area;
      areaCovered += entry.area;
      lotCountWithKm++;
    }
    const incidents = [
      ambiguous && `${ambiguous} identidad(es) ambigua(s)`,
      missingKm && `${missingKm} Km no acreditado(s)`,
      invalidArea && `${invalidArea} área(s) inválida(s) excluida(s)`,
    ].filter(Boolean);
    const coveragePct = areaTotal > 0 ? round(areaCovered / areaTotal * 100) : 0;
    const status = areaCovered <= 0 ? "unavailable" : incidents.length || areaCovered < areaTotal ? "partial" : "complete";
    return {
      kmWeighted: areaCovered > 0 ? round(numerator / areaCovered) : null,
      weightedNumerator: numerator,
      areaTotal: round(areaTotal), areaCovered: round(areaCovered), coveragePct,
      lotCount: grouped.size, lotCountWithKm, status,
      reason: incidents.length ? incidents.join(" · ") : areaTotal <= 0 ? "Sin suertes vigentes con área válida" : null,
    };
  }

  function buildHistoricalAgronomicKpis(rows, selectedZafras) {
    const list = Array.isArray(rows) ? rows : [];
    const availableZafras = groupHistoricalBySeason(list).map((season) => season.zafra);
    const requested = selectedZafras === null || selectedZafras === undefined
      ? availableZafras
      : (selectedZafras instanceof Set ? [...selectedZafras] : Array.isArray(selectedZafras) ? selectedZafras : [selectedZafras]);
    const selected = new Set(requested.map(finite).filter((value) => value !== null));
    const effectiveZafras = availableZafras.filter((zafra) => selected.has(zafra));
    const periodRows = filterHistoricalRows(list, null, effectiveZafras);
    const period = aggregateHistoricalRows(periodRows);
    const full = aggregateHistoricalRows(list);
    const seasons = groupHistoricalBySeason(periodRows);
    const hasCompleteArea = periodRows.length > 0 && periodRows.every((row) => {
      const area = finite(row?.area);
      return area !== null && area > 0;
    });
    const area = hasCompleteArea ? period.area : null;
    const areaAverage = hasCompleteArea && seasons.length > 0
      ? round(period.area / seasons.length)
      : null;
    const first = seasons[0] || null;
    const last = seasons[seasons.length - 1] || null;
    const canCompare = seasons.length > 1 && first?.tch !== null && last?.tch !== null;
    const tchValues = seasons.map((season) => season.tch).filter((value) => value !== null);
    const mean = tchValues.length ? tchValues.reduce((sum, value) => sum + value, 0) / tchValues.length : null;
    const variance = tchValues.length > 1 && mean !== null
      ? tchValues.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / tchValues.length
      : null;

    return {
      area,
      areaAverage,
      tch: period.tch,
      katm: period.katm,
      edad: period.edad,
      tchChange: canCompare ? round(last.tch - first.tch) : null,
      tchChangeFrom: canCompare ? first.zafra : null,
      tchChangeTo: canCompare ? last.zafra : null,
      tchCv: variance !== null && mean !== 0 ? round((Math.sqrt(variance) / mean) * 100) : null,
      vsHistorical: period.tch !== null && full.tch !== null ? round(period.tch - full.tch) : null,
      seasonCount: effectiveZafras.length,
      lotCount: period.suertes,
    };
  }

  function groupHistoricalByLot(rows) {
    const groups = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const lotId = text(row?.lotId);
      if (!lotId) return;
      if (!groups.has(lotId)) groups.set(lotId, []);
      groups.get(lotId).push(row);
    });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "es", { numeric: true }))
      .map(([lotId, values]) => {
        const first = values[0] || {};
        return {
          lotId,
          farmCode: text(first.farmCode),
          farmName: text(first.farmName),
          suerte: text(first.suerte),
          variedad: text(first.variedad),
          riego: text(first.riego),
          zona: text(first.zona),
          tenencia: text(first.tenencia),
          ...aggregateHistoricalRows(values),
        };
      });
  }

  function buildHistoricalDrilldownModel(rows, farmCode, selectedZafra) {
    const code = text(farmCode);
    const zafra = finite(selectedZafra);
    const farmRows = filterHistoricalRows(rows, { farmCode: code });
    const seasonRows = zafra === null ? [] : filterHistoricalRows(farmRows, null, [zafra]);
    const first = farmRows[0] || {};
    return {
      farmCode: code,
      farmName: text(first.farmName),
      selectedZafra: zafra,
      summary: aggregateHistoricalRows(seasonRows),
      lots: groupHistoricalByLot(seasonRows),
    };
  }

  function updateHistoricalDrilldownState(state, action) {
    const current = {
      farmCode: text(state?.farmCode) || null,
      selectedZafra: finite(state?.selectedZafra),
      selectedLotId: text(state?.selectedLotId) || null,
    };
    const type = text(action?.type);
    if (type === "openSeason") {
      return {
        farmCode: text(action?.farmCode) || current.farmCode,
        selectedZafra: finite(action?.zafra),
        selectedLotId: null,
      };
    }
    if (type === "openLot") {
      return { ...current, selectedLotId: text(action?.lotId) || null };
    }
    if (type === "backToFarm") return { ...current, selectedLotId: null };
    if (type === "changeFarm") {
      const farmCode = text(action?.farmCode) || null;
      return farmCode === current.farmCode ? current : { farmCode, selectedZafra: null, selectedLotId: null };
    }
    if (type === "close") return { farmCode: current.farmCode, selectedZafra: null, selectedLotId: null };
    return current;
  }

  // Selection is keyed by historical farm identity, never by the current
  // Cronológico inventory. A full farm resolves to all eligible historical lots.
  function historicalMultiCatalog(lots) {
    const farms = new Map();
    (Array.isArray(lots) ? lots : []).forEach((lot) => {
      const farmCode = text(lot?.farmCode), lotId = text(lot?.lotId);
      if (!farmCode || !lotId) return;
      if (!farms.has(farmCode)) farms.set(farmCode, { farmCode, farmName: text(lot.farmName), universe: lot.isMaquila ? "maquila" : "principal", lots: new Map() });
      const farm = farms.get(farmCode);
      if (!farm.farmName && text(lot.farmName)) farm.farmName = text(lot.farmName);
      if (!farm.lots.has(lotId)) farm.lots.set(lotId, { lotId, suerte: text(lot.suerte) });
    });
    return farms;
  }

  function updateHistoricalMultiSelection(selection, action, catalog) {
    const farms = catalog instanceof Map ? catalog : historicalMultiCatalog(catalog);
    const next = {};
    for (const [code, entry] of Object.entries(selection || {})) {
      if (!farms.has(code)) continue;
      next[code] = entry?.mode === "full" ? { mode: "full" }
        : { mode: "partial", lotIds: [...new Set((entry?.lotIds || []).map(text))].filter((id) => farms.get(code).lots.has(id)) };
      if (next[code].mode === "partial" && !next[code].lotIds.length) delete next[code];
    }
    const code = text(action?.farmCode), lotId = text(action?.lotId), farm = farms.get(code);
    if ((text(action?.type) === "addFarm" || text(action?.type) === "addLot") && farm) {
      const other = Object.keys(next).find((selectedCode) => selectedCode !== code && farms.get(selectedCode)?.universe !== farm.universe);
      if (other) throw new RangeError("No se pueden combinar fincas de Maquila con el universo principal.");
    }
    switch (text(action?.type)) {
      case "clear": return {};
      case "addFarm": if (farm) next[code] = { mode: "full" }; break;
      case "removeFarm": delete next[code]; break;
      case "addLot":
        if (farm?.lots.has(lotId) && next[code]?.mode !== "full")
          next[code] = { mode: "partial", lotIds: [...new Set([...(next[code]?.lotIds || []), lotId])] };
        break;
      case "removeLot":
        if (!farm?.lots.has(lotId) || !next[code]) break;
        next[code] = { mode: "partial", lotIds: (next[code].mode === "full" ? [...farm.lots.keys()] : next[code].lotIds).filter((id) => id !== lotId) };
        if (!next[code].lotIds.length) delete next[code];
        break;
    }
    return next;
  }

  function resolveHistoricalMultiSelection(selection, catalog) {
    const farms = catalog instanceof Map ? catalog : historicalMultiCatalog(catalog);
    const universes = new Set(Object.keys(selection || {}).filter((code) => farms.has(code)).map((code) => farms.get(code).universe));
    if (universes.size > 1) throw new RangeError("No se pueden combinar fincas de Maquila con el universo principal.");
    return Object.entries(selection || {}).flatMap(([farmCode, entry]) => {
      const farm = farms.get(farmCode);
      if (!farm) return [];
      const ids = entry?.mode === "full" ? [...farm.lots.keys()] : [...new Set(entry?.lotIds || [])].filter((id) => farm.lots.has(id));
      return ids.map((lotId) => ({ farmCode, farmName: farm.farmName, lotId, suerte: farm.lots.get(lotId).suerte }));
    });
  }

  function buildHistoricalMultiAnalysis(rows, selection, catalog, mode = "latest", custom = [], producers = []) {
    const resolved = resolveHistoricalMultiSelection(selection, catalog);
    const identities = new Set(resolved.map(({ farmCode, lotId }) => `${farmCode}\u0000${lotId}`));
    const allRows = (Array.isArray(rows) ? rows : []).filter((row) => identities.has(`${text(row.farmCode)}\u0000${text(row.lotId)}`));
    const availableZafras = groupHistoricalBySeason(allRows).map((season) => season.zafra);
    const selectedZafras = reconcilePeriodSelection(availableZafras, mode, custom);
    const selectedRows = filterHistoricalRows(allRows, null, selectedZafras);
    const selectedFarmCodes = [...new Set(resolved.map((item) => item.farmCode))];
    const numeric = (list) => {
      const aggregate = aggregateHistoricalRows(list);
      const areaComplete = list.length > 0 && list.every((row) => finite(row.area) !== null && finite(row.area) > 0);
      return { ...aggregate, area: areaComplete ? aggregate.area : null,
        invalidAreaRows: list.filter((row) => finite(row.area) === null || finite(row.area) <= 0).length,
        missingTonRows: list.filter((row) => finite(row.ton) === null || finite(row.ton) < 0).length,
        missingTchRows: list.filter((row) => finite(row.area) === null || finite(row.area) <= 0 || finite(row.ton) === null || finite(row.ton) < 0).length,
        missingKatmRows: list.filter((row) => finite(row.katm) === null).length };
    };
    const summarize = (list, eligibleLots) => {
      const metric = numeric(list), contributing = new Set(list.map((row) => `${text(row.farmCode)}\u0000${text(row.lotId)}`));
      const observedLotSeasons = new Set(list.map((row) => `${text(row.farmCode)}\u0000${text(row.lotId)}\u0000${finite(row.zafra)}`));
      const zafrasWithData = [...new Set(list.map((row) => finite(row.zafra)).filter((z) => z !== null))].sort((a, b) => a - b);
      return { ...metric, areaAccumulated: metric.area,
        areaAverage: metric.area !== null && selectedZafras.length ? round(metric.area / selectedZafras.length) : null,
        selectedSeasonCount: selectedZafras.length, zafrasWithData,
        selectedLotCount: eligibleLots.length, contributingLotCount: contributing.size,
        missingLotSeasons: Math.max(0, selectedZafras.length * eligibleLots.length - observedLotSeasons.size) };
    };
    const farms = selectedFarmCodes.map((farmCode) => {
      const lots = resolved.filter((item) => item.farmCode === farmCode);
      const farmRows = selectedRows.filter((row) => text(row.farmCode) === farmCode);
      const farmEntry = catalog instanceof Map ? catalog.get(farmCode) : historicalMultiCatalog(catalog).get(farmCode);
      const current = (Array.isArray(producers) ? producers : []).filter((p) => text(p?.code) === farmCode);
      const limitedCurrent = selection?.[farmCode]?.mode === "full" ? current : current.map((p) => ({ ...p, details: (p.details || []).filter((lot) => lots.some((item) => item.lotId === text(lot.codLote))) }));
      return { farmCode, farmName: farmEntry?.farmName || farmCode, mode: selection[farmCode].mode,
        lotIds: lots.map((item) => item.lotId), ...summarize(farmRows, lots),
        currentDistance: calculateCurrentFarmWeightedKm(limitedCurrent, farmCode) };
    });
    const series = availableZafras.map((zafra) => {
      const seasonRows = filterHistoricalRows(allRows, null, [zafra]);
      const metric = numeric(seasonRows);
      return { zafra, selected: selectedZafras.includes(zafra), ...metric,
        contributingFarmCodes: [...new Set(seasonRows.map((row) => text(row.farmCode)))],
        missingFarmCodes: selectedFarmCodes.filter((code) => !seasonRows.some((row) => text(row.farmCode) === code)),
        contributingLotIds: [...new Set(seasonRows.map((row) => text(row.lotId)))],
        missingLotIds: resolved.filter((lot) => !seasonRows.some((row) => text(row.farmCode) === lot.farmCode && text(row.lotId) === lot.lotId)).map((lot) => lot.lotId),
        contributingFarmCount: new Set(seasonRows.map((row) => text(row.farmCode))).size,
        selectedFarmCount: selectedFarmCodes.length,
        contributingLotCount: new Set(seasonRows.map((row) => `${text(row.farmCode)}\u0000${text(row.lotId)}`)).size,
        missingLotCount: resolved.length - new Set(seasonRows.map((row) => `${text(row.farmCode)}\u0000${text(row.lotId)}`)).size };
    });
    const kmArea = farms.reduce((sum, farm) => sum + (farm.currentDistance.areaCovered || 0), 0);
    const kmTotal = farms.reduce((sum, farm) => sum + (farm.currentDistance.areaTotal || 0), 0);
    return { selection: farms.map(({ farmCode, farmName, mode: farmMode, lotIds }) => ({ farmCode, farmName, mode: farmMode, lotIds })),
      selectedZafras, availableZafras, farms, consolidated: summarize(selectedRows, resolved), series,
      currentDistance: { kmWeighted: kmArea > 0 ? round(farms.reduce((sum, farm) => sum + (farm.currentDistance.weightedNumerator || 0), 0) / kmArea) : null,
        areaCovered: round(kmArea), areaTotal: round(kmTotal), coveragePct: kmTotal > 0 ? round(kmArea / kmTotal * 100) : 0,
        status: kmArea <= 0 ? "unavailable" : farms.some((farm) => farm.currentDistance.status !== "complete") ? "partial" : "complete" } };
  }

  return Object.freeze({
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
  });
});
