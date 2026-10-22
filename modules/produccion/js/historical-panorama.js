(function (root) {
  "use strict";
  const API = root.CASUR_HISTORICAL_PANORAMA_MODEL;
  const views = new WeakMap();
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (value, digits = 2) => Number.isFinite(value) ? value.toLocaleString("es-NI", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "N/D";
  const zlabel = value => String(value).length === 4 ? String(value).slice(0, 2) + "/" + String(value).slice(2) : String(value);
  const pct = value => Number.isFinite(value) ? fmt(value) + " %" : "N/D";
  function render(container, analysis, options) {
    let view = views.get(container);
    if (!view) {
      view = { metric: "tch", point: null, container, analysis, options, model: null };
      views.set(container, view);
      container.addEventListener("click", event => {
        const button = event.target.closest("[data-pan-action]");
        if (!button || !container.contains(button)) return;
        const action = button.dataset.panAction;
        if (action === "period") view.options.onPeriod(button.dataset.value);
        else if (action === "metric") { view.metric = button.dataset.value; view.point = null; paint(view, true); }
        else if (action === "search") view.options.onSearch();
        else if (action === "quality") { const detail = container.querySelector(".historical-panorama-quality"); detail.open = true; detail.querySelector("summary").focus(); }
      });
      container.addEventListener("change", event => {
        if (event.target.matches("[data-pan-zafra]")) view.options.onZafra(Number(event.target.dataset.panZafra), event.target.checked);
      });
      const showPoint = event => {
        const hit = event.target.closest("[data-pan-point]");
        if (hit) { view.point = Number(hit.dataset.panPoint); showReadout(view); }
      };
      container.addEventListener("pointerover", showPoint);
      container.addEventListener("focusin", showPoint);
      container.addEventListener("click", showPoint);
      container.addEventListener("keydown", event => {
        if (event.target.matches("[data-pan-point]") && ["Enter", " "].includes(event.key)) { event.preventDefault(); showPoint(event); }
      });
      if (typeof ResizeObserver !== "undefined") {
        view.observer = new ResizeObserver(() => { if (container.querySelector(".historical-panorama-chart")) draw(view); });
        view.observer.observe(container);
      }
    }
    view.analysis = analysis; view.options = options;
    if (!analysis.selectedZafras.includes(view.point)) view.point = null;
    paint(view, true);
  }
  function paint(view, preservePosition) {
    const { container, analysis, options } = view;
    const active = container.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = active?.dataset.panFocus;
    const anchor = active?.getBoundingClientRect().top;
    const oldQuality = container.querySelector(".historical-panorama-quality")?.open || false;
    const oldDetail = container.querySelector(".historical-panorama-records")?.open || false;
    const model = API.buildPanoramaModel(analysis, { metric: view.metric, mode: options.mode }); view.model = model;
    const s = model.summary, k = model.kpis, age = s.metricCoverage.edad;
    const modes = [["latest", "Última"], ["last3", "Últimas 3"], ["last5", "Últimas 5"], ["all", "Todas"], ["custom", "Personalizado"]];
    const periods = modes.map(([value, label]) => '<button type="button" class="hist-multi-period-btn" data-pan-action="period" data-value="' + value + '" data-pan-focus="period-' + value + '" aria-pressed="' + (value === options.mode) + '">' + label + '</button>').join("");
    const customSeasons = [...new Set([...analysis.availableZafras, ...analysis.requestedCustomZafras])].sort((a, b) => a - b);
    const custom = options.mode === "custom" ? '<div class="historical-panorama-custom" role="group" aria-label="Zafras personalizadas">' + customSeasons.map(z => '<label><input type="checkbox" data-pan-zafra="' + z + '" data-pan-focus="zafra-' + z + '" ' + (analysis.requestedCustomZafras.includes(z) ? 'checked' : '') + '> ' + escape(zlabel(z)) + (analysis.unavailableCustomZafras.includes(z) ? '<small>sin registro aquí</small>' : '') + '</label>').join("") + '</div>' : '';
    const coverage = s.contributingLotCount + '/' + s.selectedLotCount + ' suertes con registro · ' + model.observedSeasonCount + ' de ' + model.seasonCount + ' zafras ' + (options.mode === 'custom' ? 'solicitadas con registros' : 'con datos');
    const periodLabel = analysis.selectedZafras.map(zlabel).join(' · ');
    const notice = model.status === 'empty-period' ? 'Marque al menos una zafra para consultar el período personalizado.' : model.status === 'no-records' ? 'No hay registros para las zafras solicitadas en esta selección. Puede cambiar el período o la selección.' : analysis.unavailableCustomZafras.length ? 'Sin registro aquí para ' + analysis.unavailableCustomZafras.map(zlabel).join(' · ') + '. Se conserva el período solicitado.' : '';
    const card = (key, label, value, unit, note, main = false) => '<article class="historical-panorama-kpi ' + (main ? 'is-main' : '') + '" data-pan-kpi="' + key + '"><span>' + label + '</span><strong>' + fmt(value) + (unit && value !== null ? '<small>' + unit + '</small>' : '') + '</strong><p>' + escape(note) + '</p></article>';
    const cards = [
      card('tch', 'TCH ponderado', k.tch, '', 'Cobertura área ' + pct(model.coverage[0].pct), true),
      card('katm', 'KATM ponderado', k.katm, '', 'Cobertura toneladas ' + pct(model.coverage[1].pct)),
      card('ton', 'Toneladas acumuladas', k.ton, 't', k.tonPartial ? 'Parcial · toneladas registradas' : 'Registros del período'),
      card('area', analysis.selectedZafras.length === 1 ? 'Área cosechada' : 'Área media cosechada', k.area, analysis.selectedZafras.length === 1 ? 'ha' : 'ha/zafra', k.areaAccumulated === null ? 'Sin área válida' : analysis.selectedZafras.length === 1 ? 'Una zafra con registro' : fmt(k.areaAccumulated) + ' ha-zafra acumuladas'),
      card('edad', 'Edad ponderada', k.edad, 'meses', model.hasRecords && age.pct !== null ? 'Cobertura ' + pct(age.pct) + ' · ' + fmt(age.area) + '/' + fmt(age.eligibleArea) + ' ha' : 'Cobertura N/D'),
      card('coverage', 'Cobertura histórica', k.historicalCoverage, '%', s.contributingLotCount + '/' + s.selectedLotCount + ' suertes con algún registro'),
    ].join('');
    const metrics = Object.entries(API.metrics).map(([value, metric]) => '<button type="button" data-pan-action="metric" data-value="' + value + '" data-pan-focus="metric-' + value + '" aria-pressed="' + (value === view.metric) + '">' + (value === 'area' ? 'Área' : metric.label) + '</button>').join('');
    container.innerHTML = '<section class="hist-multi-summary-root historical-panorama" aria-label="Panorama ejecutivo histórico">' +
      '<div class="historical-panorama-heading"><div><span class="historical-panorama-eyebrow">HISTÓRICO MULTIFINCA</span><h2>Panorama ejecutivo</h2><p>' + escape(periodLabel || (model.status === 'empty-period' ? 'Sin zafras marcadas' : 'Sin registros para el período solicitado')) + ' · ' + analysis.selection.length + ' fincas · ' + s.selectedLotCount + ' suertes elegibles</p></div><button type="button" class="historical-panorama-button" data-pan-action="search" data-pan-focus="search">Editar selección <span aria-hidden="true">＋</span></button></div>' +
      '<div class="historical-panorama-periods" role="group" aria-label="Período histórico">' + periods + '</div>' + custom + '<p class="historical-panorama-scope" role="status">' + escape(coverage) + '</p>' +
      (notice ? '<p class="historical-panorama-notice" role="status" data-pan-state="' + model.status + '">' + escape(notice) + '</p>' : '') +
      '<div class="historical-panorama-kpis">' + cards + '</div>' +
      '<div class="historical-panorama-grid"><article class="historical-panorama-panel"><div class="historical-panorama-chart-heading"><div><h3>Evolución por zafra</h3><p>' + model.metricInfo.label + ' · ' + model.metricInfo.unit + '</p></div><div class="historical-panorama-metrics" role="group" aria-label="Indicador de la evolución">' + metrics + '</div></div>' +
      '<div class="historical-panorama-key"><span><i></i>Dato por zafra</span>' + (model.reference !== null ? '<span><i class="is-reference"></i>' + model.metricInfo.label + ' ponderado del período: ' + fmt(model.reference) + '</span>' : '') + '</div><div class="historical-panorama-chart"></div><div class="historical-panorama-readout" aria-live="polite"></div></article>' +
      '<aside class="historical-panorama-panel historical-panorama-coverage"><h3>Cobertura válida por indicador</h3><p>Sobre los registros disponibles; no acredita las suertes ni zafras ausentes.</p>' + model.coverage.map(c => '<div class="historical-panorama-cover-item" data-pan-cover="' + c.key + '"><div><span>' + c.label + '</span><b>' + pct(c.pct) + '</b></div><div class="historical-panorama-track"><span style="width:' + (c.pct === null ? 0 : Math.max(0, Math.min(100, c.pct))) + '%"></span></div><small>' + (c.pct === null ? 'Sin denominador completo conocido' : fmt(c.valid) + '/' + fmt(c.total) + ' ' + c.unit) + '</small></div>').join('') +
      (model.compositionChanged ? '<p class="historical-panorama-warning">Cambian las suertes con registros entre zafras. Revise la composición antes de interpretar la variación.</p>' : '') + (model.missingSeasons.length ? '<p class="historical-panorama-warning">' + model.missingSeasons.length + ' zafras solicitadas sin registros; no equivalen a cosechas de cero.</p>' : '') + '<button type="button" class="historical-panorama-link" data-pan-action="quality" data-pan-focus="quality-link">Ver denominadores y faltantes →</button></aside></div>' +
      quality(model, oldQuality) + records(model, oldDetail) + '</section>';
    draw(view);
    if (preservePosition && focusKey) {
      const next = [...container.querySelectorAll('[data-pan-focus]')].find(el => el.dataset.panFocus === focusKey);
      if (next) { next.focus({ preventScroll: true }); const delta = next.getBoundingClientRect().top - anchor; if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: 'instant' }); }
    }
  }
  function quality(model, open) {
    const s = model.summary, a = model.analysis, c = s.metricCoverage;
    return '<details class="historical-panorama-quality" ' + (open ? 'open' : '') + '><summary>Calidad de datos y denominadores</summary><div class="historical-panorama-quality-body"><article><h3>Período y área</h3><p>' + model.observedSeasonCount + '/' + model.seasonCount + ' zafras solicitadas con registros. ' + s.missingLotSeasons + ' combinaciones suerte-zafra sin registro en las zafras efectivas.</p><p>Área acumulada: ' + fmt(model.kpis.areaAccumulated) + ' ha-zafra. Media por zafra efectiva seleccionada: ' + fmt(model.kpis.area) + ' ha. Media observada: ' + fmt(s.areaAverageObserved) + ' ha.</p><p>El acumulado de cosechas no es el área física actual. Una ausencia nunca acredita cero hectáreas.</p></article>' +
      '<article><h3>Numeradores y bases válidas</h3><p>TCH: ' + fmt(c.tch.ton) + ' t ÷ ' + fmt(c.tch.area) + ' ha.</p><p>KATM: ' + fmt(c.katm.numerator, 4) + ' ÷ ' + fmt(c.katm.ton) + ' t.</p><p>Edad: ' + fmt(c.edad.numerator, 4) + ' meses·ha ÷ ' + fmt(c.edad.area) + ' ha.</p><p>Área elegible conocida: ' + fmt(c.edad.eligibleArea) + ' ha; toneladas elegibles: ' + fmt(c.katm.eligibleTon) + ' t.</p></article>' +
      '<article><h3>Calidad y procedencia</h3><p>' + s.invalidAreaRows + ' filas sin área válida · ' + s.missingTonRows + ' sin toneladas · ' + s.missingTchRows + ' sin TCH · ' + s.missingKatmRows + ' sin KATM.</p><p>El 100 % de TCH corresponde al área de los registros disponibles. No mide completitud de todo el historial.</p><p>Km: referencia del Cronológico vigente, ' + fmt(a.currentDistance.kmWeighted) + ' km (' + pct(a.currentDistance.coveragePct) + ' cobertura vigente). No es distancia histórica.</p><p>Las diferencias son descriptivas; no identifican causas agronómicas.</p></article></div></details>';
  }
  function records(model, open) {
    const a = model.analysis;
    const missingNames = ids => ids.map(id => { const farm = a.selection.find(f => f.lotIds.includes(id)); return (farm ? farm.farmCode + ' · ' : '') + id; }).join(', ');
    return '<details class="historical-panorama-records" ' + (open ? 'open' : '') + '><summary>Registros y cobertura por zafra</summary><div class="historical-panorama-season-list">' + model.series.map(point => {
      const r = point.row;
      return '<article><h3>' + zlabel(point.zafra) + '</h3>' + (r ? '<p>' + r.contributingFarmCount + '/' + r.selectedFarmCount + ' fincas · ' + r.contributingLotCount + '/' + model.summary.selectedLotCount + ' suertes</p><dl><div><dt>Área</dt><dd>' + fmt(r.area) + ' ha</dd></div><div><dt>Toneladas' + (r.missingTonRows ? ' registradas' : '') + '</dt><dd>' + fmt(r.ton > 0 || r.missingTonRows === 0 ? r.ton : null) + ' t</dd></div><div><dt>TCH</dt><dd>' + fmt(r.tch) + '</dd></div><div><dt>KATM</dt><dd>' + fmt(r.katm) + '</dd></div><div><dt>Edad</dt><dd>' + fmt(r.edad) + ' meses</dd></div></dl><p>Sin registro: ' + escape(missingNames(r.missingLotIds) || 'Ninguna suerte') + '</p>' : '<p>Sin registros para esta zafra solicitada.</p>') + '</article>';
    }).join('') + (model.series.length ? '' : '<p>Marque alguna zafra para consultar los registros.</p>') + '</div></details>';
  }
  function draw(view) {
    const host = view.container.querySelector('.historical-panorama-chart'); if (!host) return;
    const model = view.model, layout = API.buildPanoramaChartLayout(model, host.clientWidth);
    if (!layout.points.length) { host.innerHTML = '<p class="historical-panorama-empty">' + (model.status === 'empty-period' ? 'Seleccione una o más zafras.' : 'Sin base válida para este indicador.') + '</p>'; showReadout(view); return; }
    const { width: w, height: h, left, right } = layout;
    const tick = value => Math.abs(value) >= 1000 ? fmt(value / 1000, 1) + 'k' : fmt(value, 0);
    host.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" aria-label="' + escape(model.metricInfo.label) + ' por zafra" role="group"><title>' + escape(model.metricInfo.label) + ' por zafra. Toque o enfoque un punto para consultar sus datos.</title>' +
      layout.ticks.map(t => '<line class="historical-panorama-gridline" x1="' + left + '" x2="' + (w - right) + '" y1="' + t.y + '" y2="' + t.y + '"/><text x="' + (left - 9) + '" y="' + (t.y + 4) + '" text-anchor="end">' + tick(t.value) + '</text>').join('') +
      (layout.referenceY === null ? '' : '<line class="historical-panorama-reference" x1="' + left + '" x2="' + (w - right) + '" y1="' + layout.referenceY + '" y2="' + layout.referenceY + '"/>') +
      layout.segments.map(segment => '<polyline class="historical-panorama-line" points="' + segment.map(p => p.x + ',' + p.y).join(' ') + '"/>').join('') +
      layout.xTicks.map(p => '<text x="' + p.x + '" y="' + (h - 10) + '" text-anchor="middle">' + zlabel(p.zafra) + '</text>').join('') +
      layout.points.filter(p => p.y !== null).map(p => '<circle class="historical-panorama-dot" cx="' + p.x + '" cy="' + p.y + '" r="5"/>' + (layout.points.length <= 5 ? '<text class="historical-panorama-value" x="' + p.x + '" y="' + (p.y - 13) + '" text-anchor="middle">' + fmt(p.value, model.metric === 'ton' ? 0 : 2) + '</text>' : '') + '<circle class="historical-panorama-hit" cx="' + p.x + '" cy="' + p.y + '" r="21" data-pan-point="' + p.zafra + '" data-pan-focus="point-' + p.zafra + '" role="button" tabindex="0" aria-label="' + zlabel(p.zafra) + ': ' + fmt(p.value) + ' ' + model.metricInfo.unit + '"/>').join('') + '</svg>';
    showReadout(view);
  }
  function showReadout(view) {
    const host = view.container.querySelector('.historical-panorama-readout'); if (!host) return;
    const m = view.model, p = m.series.find(point => point.zafra === view.point) || [...m.series].reverse().find(point => point.row);
    if (!p?.row) { host.innerHTML = '<p>' + (m.series.length === 1 ? 'Una zafra: se muestra un punto, sin tendencia entre períodos. ' : '') + 'Toque o enfoque un punto para ver su valor y cobertura.</p>'; return; }
    const r = p.row;
    host.innerHTML = '<b>' + zlabel(p.zafra) + ' · ' + fmt(p.value) + ' ' + m.metricInfo.unit + (p.partial ? ' · parcial' : '') + '</b><p>' + r.contributingLotCount + '/' + m.summary.selectedLotCount + ' suertes con registro · ' + fmt(r.area) + ' ha · ' + fmt(r.ton > 0 || r.missingTonRows === 0 ? r.ton : null) + ' t</p><p>Cobertura válida: TCH ' + pct(r.metricCoverage.tch.pct) + ' · KATM ' + pct(r.metricCoverage.katm.pct) + ' · edad ' + pct(r.metricCoverage.edad.pct) + '</p>' + (m.series.length === 1 ? '<p>Una zafra: un punto, sin tendencia entre períodos.</p>' : '');
  }
  root.CASUR_HISTORICAL_PANORAMA = Object.freeze({ render });
})(typeof globalThis !== "undefined" ? globalThis : this);
