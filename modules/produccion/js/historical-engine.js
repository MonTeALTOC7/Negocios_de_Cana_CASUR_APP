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

  return Object.freeze({
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
  });
});
