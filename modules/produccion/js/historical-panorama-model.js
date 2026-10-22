(function (root) {
  "use strict";
  const metrics = Object.freeze({
    tch: { label: "TCH", unit: "t/ha" }, katm: { label: "KATM", unit: "kg/t" },
    ton: { label: "Toneladas", unit: "t" }, area: { label: "Área cosechada", unit: "ha" },
  });
  const number = value => Number.isFinite(value) ? value : null;
  const percent = (part, total) => total > 0 ? number(part / total * 100) : null;
  // The engine remains the authority for all agronomic aggregates. This selector
  // only projects its result, flags missing data and compares observed identities.
  function buildPanoramaModel(analysis, options = {}) {
    const metric = Object.hasOwn(metrics, options.metric) ? options.metric : "tch";
    const custom = options.mode === "custom";
    const requested = custom ? analysis.requestedCustomZafras : analysis.selectedZafras;
    const s = analysis.consolidated;
    const hasRecords = s.zafrasWithData.length > 0;
    const status = custom && !requested.length ? "empty-period" : hasRecords ? "ready" : "no-records";
    const tonValue = item => item.ton > 0 || item.missingTonRows === 0 ? number(item.ton) : null;
    const series = requested.map(zafra => {
      const row = analysis.series.find(item => item.zafra === zafra && item.selected);
      return { zafra, value: row ? (metric === "ton" ? tonValue(row) : number(row[metric])) : null,
        row: row || null, partial: metric === "ton" && Boolean(row?.missingTonRows) };
    });
    const observed = series.filter(point => point.row);
    const identity = row => JSON.stringify([...row.contributingLotIds].sort());
    const compositionChanged = observed.length > 1 && observed.some(point => identity(point.row) !== identity(observed[0].row));
    const missingSeasons = series.filter(point => !point.row).map(point => point.zafra);
    const coverage = [
      { key: "tch", label: "TCH · área", valid: s.metricCoverage.tch.area, total: s.metricCoverage.tch.eligibleArea, unit: "ha", pct: s.metricCoverage.tch.pct },
      { key: "katm", label: "KATM · toneladas", valid: s.metricCoverage.katm.ton, total: s.metricCoverage.katm.eligibleTon, unit: "t", pct: s.metricCoverage.katm.pct },
      { key: "edad", label: "Edad · área", valid: s.metricCoverage.edad.area, total: s.metricCoverage.edad.eligibleArea, unit: "ha", pct: s.metricCoverage.edad.pct },
    ].map(item => ({ ...item, pct: hasRecords ? number(item.pct) : null }));
    return { analysis, summary: s, status, metric, metricInfo: metrics[metric], series, coverage,
      seasonCount: requested.length, observedSeasonCount: s.zafrasWithData.length,
      compositionChanged, missingSeasons, hasRecords,
      // No reference for additive quantities: accumulated tonnes/hectares are
      // never drawn as if they represented one season.
      reference: hasRecords && ["tch", "katm"].includes(metric) ? number(s[metric]) : null,
      kpis: {
        tch: hasRecords ? number(s.tch) : null, katm: hasRecords ? number(s.katm) : null,
        ton: hasRecords ? tonValue(s) : null, tonPartial: hasRecords && s.missingTonRows > 0,
        area: hasRecords ? number(s.areaAverage) : null, areaAccumulated: hasRecords ? number(s.areaAccumulated) : null,
        edad: hasRecords ? number(s.edad) : null,
        historicalCoverage: hasRecords ? percent(s.contributingLotCount, s.selectedLotCount) : null,
      },
    };
  }
  function buildPanoramaChartLayout(model, width) {
    const w = Math.max(240, width), h = w < 500 ? 236 : 258;
    const left = 48, right = 32, top = 28, bottom = 37;
    const values = model.series.map(p => p.value).filter(v => v !== null);
    if (model.reference !== null) values.push(model.reference);
    if (!values.length) return { width: w, height: h, points: [], segments: [], ticks: [], xTicks: [], referenceY: null };
    const min = Math.min(...values), max = Math.max(...values), span = Math.max(1, max - min);
    const low = Math.max(0, min - span * .18), high = max + span * .3;
    const y = v => h - bottom - (v - low) / (high - low) * (h - top - bottom);
    const points = model.series.map((p, i) => ({ ...p,
      x: model.series.length === 1 ? (left + w - right) / 2 : left + i * (w - left - right) / (model.series.length - 1),
      y: p.value === null ? null : y(p.value) }));
    const segments = []; let segment = [];
    points.forEach(p => { if (p.y === null) { if (segment.length > 1) segments.push(segment); segment = []; } else segment.push(p); });
    if (segment.length > 1) segments.push(segment);
    const maxLabels = w < 500 ? 4 : 7;
    const labelCount = Math.min(maxLabels, points.length);
    const indices = new Set(Array.from({ length: labelCount }, (_, i) =>
      labelCount === 1 ? 0 : Math.round(i * (points.length - 1) / (labelCount - 1))));
    return { width: w, height: h, points, segments,
      ticks: [low, (low + high) / 2, high].map(v => ({ value: v, y: y(v) })),
      xTicks: points.filter((_, i) => indices.has(i)), left, right,
      referenceY: model.reference === null ? null : y(model.reference) };
  }
  root.CASUR_HISTORICAL_PANORAMA_MODEL = Object.freeze({ metrics, buildPanoramaModel, buildPanoramaChartLayout });
})(typeof globalThis !== "undefined" ? globalThis : this);
