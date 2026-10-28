/* Fase 1: presentation adapter. Engines, report DOM and selections remain owned
   by the existing module. No dataset or storage writes belong here. */
(function () {
  'use strict';
  const views = [
    ['resumen', 'Resumen', 'homeSection'],
    ['cronologico', 'Cronológico', 'cronoSection'],
    ['historico', 'Histórico', 'fichaSection'],
    ['zonas', 'Zonas', 'zoneMainSection'],
    ['analisis', 'Análisis', 'executiveAnalysisSection'],
  ];
  const byId = id => document.getElementById(id);
  let active = 'resumen', cronoVisited = false;
  const positions = new Map();
  const fmt = (value, digits = 2) => value == null || !Number.isFinite(Number(value))
    ? 'N/D' : Number(value).toLocaleString('es-NI', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const text = (id, value) => { const el = byId(id); if (el) el.textContent = value; };
  const allowed = view => {
    const cfg = window.CASUR_EXPORT_MODULES;
    const key = {cronologico:'crono', historico:'historico', zonas:'zones', analisis:'executive'}[view];
    return !cfg || !key || !!cfg[key];
  };

  function refreshSummary() {
    const data = window.CRONO_DATA, engine = window.CASUR_CRONO_PARTICIPATION;
    if (!data?.producers || !engine) return;
    const rows = data.producers.flatMap(p => p.details || []);
    const summary = engine.summary(rows);
    text('maestroActiveArea', fmt(data.global?.area) + ' ha');
    text('maestroActiveLots', fmt(summary.activeLots, 0) + ' suertes activas');
    text('maestroEstimateArea', fmt(summary.estimateArea) + ' ha');
    text('maestroEstimateLots', fmt(summary.estimateLots, 0) + ' suertes con estimado autorizado');
    text('maestroEstimateTons', fmt(summary.estimateTons) + ' t');
    text('maestroEstimateTch', fmt(summary.estimateTch));
    text('maestroCoverage', fmt(summary.coberturaEstimadoAreaPct) + ' % del área de molienda');
    text('maestroCatalog', fmt(summary.catalogLots ?? rows.length, 0));
    text('maestroMilling', fmt(summary.millingLots, 0));
    text('maestroSeed', fmt(summary.seedLots, 0));
    text('maestroSeason', 'Zafra ' + (data.meta?.estimateSeason || summary.estimateSeason || 'N/D'));
    const personal = !!window.CASUR_OPERATIONAL_LOCAL || !!data.meta?.manualChanges ||
      !!(window.CASUR_MASTER_OVERLAY && window.CASUR_MASTER_OVERLAY.dataVersion === data.meta?.dataVersion);
    text('maestroSource', personal ? 'Generación personal' : 'Datos oficiales CASUR');
    text('maestroGeneration', data.meta?.dataVersion || 'Generación no disponible');
    text('maestroSourceName', data.meta?.source || 'Cronológico vigente');
    text('maestroSummarySeason', 'Panorama de la zafra ' + (data.meta?.estimateSeason || summary.estimateSeason || 'vigente'));
    const host = byId('maestroSummary');
    if (host) { host.dataset.generation = data.meta?.dataVersion || ''; host.setAttribute('aria-busy', 'false'); }
  }

  function updateTrail() {
    const content = byId('cronoContent'), code = byId('cronoProducerSelect')?.value;
    const producer = window.CRONO_DATA?.producers?.find(p => String(p.code) === String(code));
    const lot = content?.dataset.geoLotId;
    text('maestroCronoLocation', content?.dataset.geoScope === 'lot' && lot
      ? (producer?.name || code || '') + ' · Suerte ' + lot
      : content?.dataset.geoScope === 'farm' && producer ? producer.name
      : content?.querySelector('.crono-multi-result-table') ? 'Selección múltiple' : 'General CASUR');
    const back = byId('maestroBackFarm');
    if (back) { back.hidden = content?.dataset.geoScope !== 'lot' || !producer; back.textContent = 'Volver a ' + (producer?.name || 'la finca'); }
  }

  function activate(view, options = {}) {
    if (!views.some(v => v[0] === view) || !allowed(view)) return false;
    if (options.remember !== false && active !== view) positions.set(active, window.scrollY);
    const firstCrono = view === 'cronologico' && !cronoVisited;
    active = view;
    document.body.dataset.maestroView = view;
    document.querySelectorAll('[data-maestro-tab]').forEach(button => {
      const on = button.dataset.maestroTab === view;
      button.setAttribute('aria-selected', String(on)); button.tabIndex = on ? 0 : -1;
    });
    // Keep every report and its details state in place. CSS only hides siblings.
    const id = views.find(v => v[0] === view)[2], panel = byId(id);
    if (panel?.tagName === 'DETAILS' && !panel.open) panel.open = true;
    if (view === 'cronologico') {
      cronoVisited = true;
      if (firstCrono && !options.restoring) window.renderCronoHome?.();
      else window.initCronoPanel?.();
      updateTrail();
    }
    if (view === 'resumen') refreshSummary();
    if (options.scroll !== false) window.scrollTo({ top: positions.get(view) || 0, behavior: 'instant' });
    // Leaflet must measure the now-visible container; the geo engine owns maps.
    window.dispatchEvent(new Event('resize'));
    return true;
  }

  function restore(saved, sections = []) {
    const inferred = [...views].reverse().find(v => sections.includes(v[2]))?.[0] || 'resumen';
    const view = views.some(v => v[0] === saved) ? saved : inferred;
    if (view === 'cronologico') cronoVisited = true;
    activate(view, { restoring: true, scroll: false, remember: false });
  }

  function installSearch(inputId, boxId) {
    const input = byId(inputId), box = byId(boxId); if (!input || !box) return;
    input.setAttribute('aria-label', inputId === 'cronoQ' ? 'Buscar finca, productor o suerte en Cronológico' : 'Buscar finca, productor o suerte en Histórico');
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-haspopup', 'listbox');
    input.setAttribute('aria-controls', boxId); input.setAttribute('aria-expanded', 'false');
    box.setAttribute('role', 'listbox');
    let cursor = -1;
    const buttons = () => [...box.querySelectorAll('button')].filter(b => !b.disabled && !b.hidden);
    const reset = () => {
      cursor = -1; input.removeAttribute('aria-activedescendant');
      input.setAttribute('aria-expanded', String(box.style.display === 'block' && buttons().length > 0));
      buttons().forEach((b, i) => { b.id = boxId + '-item-' + i; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', 'false'); b.classList.remove('maestro-suggestion-active'); });
    };
    new MutationObserver(reset).observe(box, { childList: true, attributes: true, attributeFilter: ['style'] });
    input.addEventListener('keydown', event => {
      const items = buttons(), open = box.style.display === 'block' && items.length;
      if (!open || !['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) return;
      if (event.key === 'Enter' && cursor < 0) return; // Existing exact-search contract.
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.key === 'Escape') { box.style.display = 'none'; reset(); return; }
      if (event.key === 'Enter') { items[cursor]?.click(); return; }
      cursor = (cursor + (event.key === 'ArrowDown' ? 1 : cursor < 0 ? 0 : -1) + items.length) % items.length;
      items.forEach((b, i) => { b.classList.toggle('maestro-suggestion-active', i === cursor); b.setAttribute('aria-selected', String(i === cursor)); });
      input.setAttribute('aria-activedescendant', items[cursor].id);
      items[cursor].scrollIntoView({ block: 'nearest' });
    }, true);
  }

  function init() {
    const home = byId('homeSection'), header = document.querySelector('header');
    if (!home || !header || byId('maestroTabs')) return;
    const nav = document.createElement('div'); nav.id = 'maestroTabs'; nav.className = 'maestro-tabs no-print export-excluded';
    nav.dataset.exportExclude = 'true'; nav.setAttribute('role', 'tablist'); nav.setAttribute('aria-label', 'Vistas del Maestro de Suertes');
    views.forEach(([view, label, id]) => {
      const button = document.createElement('button'); button.type = 'button'; button.id = 'maestro-tab-' + view;
      button.dataset.maestroTab = view; button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', id);
      button.textContent = label; button.hidden = !allowed(view); button.addEventListener('click', () => activate(view));
      nav.append(button);
      const panel = byId(id); if (panel) { panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', button.id); }
    });
    nav.addEventListener('keydown', event => {
      const tabs = [...nav.querySelectorAll('button')].filter(b => !b.hidden);
      const i = tabs.indexOf(document.activeElement); if (i < 0) return;
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : event.key === 'ArrowRight' ? (i + 1) % tabs.length : event.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length : -1;
      if (index < 0) return; event.preventDefault(); tabs[index].focus(); tabs[index].click();
    });
    const appearance = document.createElement('label');
    appearance.className = 'maestro-appearance no-print export-excluded';
    appearance.dataset.exportExclude = 'true';
    appearance.innerHTML = '<span>Presentación</span> <select id="maestroAppearance" aria-label="Variante visual"><option value="claro">Ejecutivo Claro</option><option value="vibrante">CASUR Institucional Vibrante</option></select>';
    appearance.querySelector('select').addEventListener('change', event => { document.body.dataset.maestroTheme = event.target.value; });
    document.body.dataset.maestroTheme = 'claro';
    header.querySelector('.head')?.append(appearance);
    header.append(nav);
    const moduleTitle = header.querySelector('.brand-title h1'); if (moduleTitle) moduleTitle.textContent = 'Maestro de Suertes';
    const title = home.querySelector('h2'); if (title) title.textContent = 'Resumen de producción';
    const subtitle = home.querySelector('.hero-copy p'); if (subtitle) { subtitle.id = 'maestroSummarySeason'; subtitle.textContent = 'Panorama de la zafra vigente'; }
    const summary = document.createElement('section'); summary.id = 'maestroSummary'; summary.setAttribute('aria-label', 'Indicadores del Cronológico vigente'); summary.setAttribute('aria-busy', 'true');
    summary.innerHTML = `<div class="maestro-source"><div><b id="maestroSource">Cargando fuente…</b><span id="maestroSourceName"></span></div><div><b id="maestroSeason"></b><span id="maestroGeneration"></span></div></div>
      <div class="maestro-kpis">
        <article class="maestro-kpi maestro-kpi-primary"><span>Área activa</span><strong id="maestroActiveArea">—</strong><small id="maestroActiveLots">Cargando datos</small></article>
        <article class="maestro-kpi"><span>Área válida estimada</span><strong id="maestroEstimateArea">—</strong><small id="maestroEstimateLots"></small></article>
        <article class="maestro-kpi"><span>Toneladas estimadas</span><strong id="maestroEstimateTons">—</strong><small>Molienda con estimado autorizado</small></article>
        <article class="maestro-kpi"><span>TCH estimado</span><strong id="maestroEstimateTch">—</strong><small>Toneladas ÷ área válida estimada</small></article>
      </div><div class="maestro-population"><span>Catálogo <b id="maestroCatalog">—</b></span><span>Molienda <b id="maestroMilling">—</b></span><span>Semilla <b id="maestroSeed">—</b></span><span id="maestroCoverage"></span></div>`;
    home.querySelector('#moduleAccess')?.before(summary);
    const analysis = document.createElement('button'); analysis.type = 'button'; analysis.className = 'hero-module-card module-analysis';
    analysis.innerHTML = '<span class="hero-module-icon">4</span><span class="hero-module-copy"><span class="hero-module-kicker">Lectura gerencial</span><strong>Análisis</strong><small>Tendencias, variedades, TCH × KATM, prioridades y maquila.</small></span>';
    analysis.hidden = !allowed('analisis'); analysis.addEventListener('click', () => activate('analisis')); byId('moduleAccess')?.append(analysis);
    const trail = document.createElement('div'); trail.className = 'maestro-crono-trail no-print export-excluded'; trail.dataset.exportExclude = 'true';
    trail.innerHTML = '<div><button type="button" id="maestroGeneral">General CASUR</button><span aria-hidden="true"> / </span><b id="maestroCronoLocation">General CASUR</b></div><button type="button" id="maestroBackFarm" hidden>Volver a la finca</button>';
    byId('cronoSection')?.querySelector('.accordion-body')?.prepend(trail);
    byId('maestroGeneral').addEventListener('click', () => { window.renderCronoHome?.(); updateTrail(); });
    byId('maestroBackFarm').addEventListener('click', () => { const code = byId('cronoProducerSelect')?.value; if (code) window.renderCronoProducer?.(code); });

    // Original entry points remain available to shell/deep links and old buttons.
    const originalNav = window.nav;
    window.nav = function (id, ...args) {
      const view = views.find(v => v[2] === id)?.[0];
      if (view) return activate(view);
      return originalNav?.call(this, id, ...args);
    };
    window.openCronoPanel = () => activate('cronologico');
    window.goHistoricoModule = () => activate('historico');
    window.goZoneModule = () => activate('zonas');
    // Programmatic drill-through (including TCH) reveals its original panel.
    for (const [fn, view] of [['renderEntity', 'historico'], ['selectCronoProducer', 'cronologico'], ['selectCronoSuerteSuggestion', 'cronologico'], ['viewCronoSuerte', 'cronologico']]) {
      const original = window[fn]; if (typeof original !== 'function') continue;
      window[fn] = function (...args) { activate(view, {restoring:true, scroll:false}); return original.apply(this, args); };
    }
    // Preserve technical authorization: the original launcher/guard still runs.
    byId('masterUpdateSection')?.addEventListener('toggle', event => {
      document.body.classList.toggle('maestro-admin-open', event.target.open && !event.target.classList.contains('is-locked'));
    });
    // Shortcuts reference existing nodes; no report reparenting or chart rebuilding.
    for (const id of ['cronoContent', 'fichaContent']) {
      const host = byId(id); if (!host) continue;
      const links = document.createElement('nav');
      links.className = 'maestro-report-links no-print export-excluded';
      links.dataset.exportExclude = 'true'; links.setAttribute('aria-label', 'Accesos a la ficha');
      host.before(links);
      const search = host.parentElement.querySelector('.searchbox');
      const query = document.createElement('details'); query.className='maestro-query no-print export-excluded'; query.dataset.exportExclude='true'; query.open=true;
      const queryTitle=document.createElement('summary'); queryTitle.textContent='Consultar finca o suerte';
      search.before(query); query.append(queryTitle, search);
      let rendered = null;
      const compactQuery = () => {
        const report=host.firstElementChild;
        if(report===rendered) return; rendered=report;
        if(host.querySelector('#cronoPrintPanel, #printPanel, .hist-multi-summary-root')) {
          const hadFocus=query.contains(document.activeElement); query.open=false;
          queryTitle.textContent='Cambiar consulta · '+(byId(id==='cronoContent'?'cronoQ':'q')?.value || 'Finca o suerte');
          if(hadFocus) { queryTitle.focus({preventScroll:true}); requestAnimationFrame(() => host.scrollIntoView({block:'start',behavior:'instant'})); }
        } else { query.open=true; queryTitle.textContent='Consultar finca o suerte'; }
      };
      new MutationObserver(compactQuery).observe(host,{childList:true});
      const refreshLinks = () => {
        links.replaceChildren();
        for (const [label, selector] of [['Indicadores', '.kpis, .crono-multi-kpis'], ['Gráficos', '.crono-trend-card, .chart-wrap, .crono-summary-grid'], ['Detalle', '.table-wrap'], ['Mapa y exportación', '[data-casur-export-kind]']]) {
          const target = host.querySelector(selector); if (!target) continue;
          const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
          button.addEventListener('click', () => { target.scrollIntoView({block:'start',behavior:'instant'}); target.setAttribute('tabindex','-1'); target.focus({preventScroll:true}); });
          links.append(button);
        }
        links.hidden = !links.childElementCount;
        updateTrail();
      };
      new MutationObserver(refreshLinks).observe(host, {childList:true,subtree:true});
      refreshLinks();
    }
    installSearch('cronoQ', 'cronoSuggestions'); installSearch('q', 'searchSuggestions');
    document.body.classList.add('casur-maestro-premium');
    // The shell already owns mobile bottom navigation; keep only module tabs.
    document.body.classList.toggle('maestro-embedded', window.self !== window.top);
    activate('resumen', {scroll:false});
    const refresh = () => { refreshSummary(); updateTrail(); };
    document.addEventListener('casur-production-ready', refresh);
    document.addEventListener('casur-crono-effective-change', refresh);
    document.addEventListener('casur-master-overlay', () => queueMicrotask(refresh));
    window.addEventListener('load', refresh, {once:true});
    window.CASUR_MAESTRO_UX = Object.freeze({ activate, capture: () => active, restore, refresh: refreshSummary });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
})();
