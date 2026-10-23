import { normalizeGeoLotId } from "./geo-data.js";

const OSM_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ESRI_IMAGERY_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_TRANSPORT_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}";

function resolveContainer(container) {
  if (typeof container === "string") {
    const found = document.querySelector(container);
    if (!found) throw new Error(`No se encontró el contenedor del mapa: ${container}`);
    return found;
  }
  if (!container || typeof container !== "object") throw new TypeError("Se requiere un contenedor para el mapa");
  return container;
}

function resolveLeaflet(options) {
  const leaflet = options.leaflet || options.L || globalThis.L;
  if (!leaflet || typeof leaflet.map !== "function" || typeof leaflet.geoJSON !== "function") {
    throw new Error("Leaflet local no está disponible");
  }
  return leaflet;
}

function featureLotId(feature) {
  return normalizeGeoLotId(feature?.properties?.lotId);
}

function validFeature(feature) {
  return feature?.type === "Feature"
    && ["Polygon", "MultiPolygon"].includes(feature.geometry?.type)
    && Boolean(featureLotId(feature));
}

function featureCollection(features) {
  return { type: "FeatureCollection", features };
}

function featureAnchor(feature) {
  const anchor = feature?.properties?.anchor;
  return Array.isArray(anchor) && anchor.length === 2 && anchor.every(Number.isFinite) ? anchor : null;
}

// Display-only geometry queries. Coordinates/rings are never modified.
export function cartographicInteriorPoints(feature) {
  const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  const containsRing = (p, ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  };
  const contains = (p, rings) => containsRing(p, rings[0]) && !rings.slice(1).some(r => containsRing(p, r));
  const points = [], anchor = featureAnchor(feature);
  if (anchor && polygons.some(r => contains(anchor, r))) points.push(anchor);
  // Scan-line intervals find interior points even in thin fragments and around holes.
  const ranked = [];
  for (const rings of polygons) {
    const ys = rings[0].map(p => p[1]), lo = Math.min(...ys), hi = Math.max(...ys);
    for (let step = 1; step < 16; step++) {
      const y = lo + (hi - lo) * step / 16, xs = [];
      for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i], b = ring[j];
        if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const p = [(xs[i] + xs[i + 1]) / 2, y];
        if (contains(p, rings)) ranked.push({ p, span: xs[i + 1] - xs[i] });
      }
    }
  }
  ranked.sort((a, b) => b.span - a.span);
  return points.concat(ranked.slice(0, 24).map(item => item.p));
}

export function cartographicLabelLayout(items, width, height, measure, scale = 1) {
  const boxes = [], labels = [], unresolved = [];
  const intersects = (a, b) => a.x < b.x + b.w + 4 && a.x + a.w + 4 > b.x && a.y < b.y + b.h + 4 && a.y + a.h + 4 > b.y;
  for (const item of items) {
    const w = measure(item.text) + 16 * scale, h = 24 * scale;
    const points = item.points.filter(p => p.x > 0 && p.x < width && p.y > 0 && p.y < height);
    if (!points.length) { unresolved.push(item.id); continue; }
    const origin = points[0];
    const candidates = points.map(p => ({ ...p, origin: p }));
    if (!item.contextual) for (const radius of [32, 60, 90, 125]) for (let n = 0; n < 8; n++) candidates.push({ x: origin.x + Math.cos(n * Math.PI / 4) * radius, y: origin.y + Math.sin(n * Math.PI / 4) * radius, origin });
    const candidate = candidates.find(p => {
      const b = { x: p.x - w / 2, y: p.y - h / 2, w, h };
      return b.x >= 64 && b.y >= 12 && b.x + w <= width - 12 && b.y + h <= height - 35 && !boxes.some(other => intersects(b, other));
    });
    if (!candidate) { unresolved.push(item.id); continue; }
    const box = { x: candidate.x - w / 2, y: candidate.y - h / 2, w, h };
    boxes.push(box); labels.push({ ...item, ...box, origin: candidate.origin, external: Math.hypot(candidate.x - candidate.origin.x, candidate.y - candidate.origin.y) > 1 });
  }
  return { labels, unresolved };
}

/** Reusable CASUR polygon viewer. It does not fetch geometry or own application state. */
export function createCasurMap(container, options = {}) {
  const element = resolveContainer(container);
  const L = resolveLeaflet(options);
  const priorAttributes = {
    role: element.getAttribute?.("role"),
    label: element.getAttribute?.("aria-label"),
    tabindex: element.getAttribute?.("tabindex"),
  };

  element.classList?.add("casur-geo-map");
  element.setAttribute?.("role", "region");
  element.setAttribute?.("aria-label", options.ariaLabel || "Mapa agrícola CASUR");
  if (!element.hasAttribute?.("tabindex")) element.setAttribute?.("tabindex", "0");

  const mapOptions = {
    zoomControl: true,
    preferCanvas: options.preferCanvas === true,
    attributionControl: true,
    ...(options.mapOptions || {}),
  };
  if (!mapOptions.preferCanvas && !mapOptions.renderer && typeof L.svg === "function") mapOptions.renderer = L.svg();
  const map = L.map(element, mapOptions);

  const panes = { lots: "casurGeoLotsPane", anchor: "casurGeoAnchorPane" };
  Object.entries({ [panes.lots]: 405, [panes.anchor]: 425 }).forEach(([name, zIndex]) => {
    if (typeof map.createPane === "function" && !map.getPane?.(name)) map.createPane(name);
    const pane = map.getPane?.(name);
    if (pane?.style) pane.style.zIndex = String(zIndex);
  });

  const tileOptions = { maxZoom: 22, maxNativeZoom: 19, crossOrigin: "anonymous" };
  const osm = L.tileLayer(OSM_URL, { ...tileOptions, attribution: "&copy; OpenStreetMap contributors" });
  const satellite = L.tileLayer(ESRI_IMAGERY_URL, { ...tileOptions, attribution: "Tiles &copy; Esri" });
  const hybridImagery = L.tileLayer(ESRI_IMAGERY_URL, { ...tileOptions, attribution: "Tiles &copy; Esri" });
  const hybridTransport = L.tileLayer(ESRI_TRANSPORT_URL, { ...tileOptions, attribution: "Referencia &copy; Esri" });
  const hybrid = L.layerGroup([hybridImagery, hybridTransport]);
  const blank = L.layerGroup();
  const bases = { hybrid, satellite, osm, blank };
  const baseLabels = { hybrid: "Híbrido", satellite: "Satélite", osm: "Mapa claro", blank: "Sin fondo" };
  const namedBases = { "Híbrido": hybrid, "Satélite": satellite, "Mapa claro": osm, "Sin mapa base": blank };
  L.control?.layers?.(namedBases, {}, {
    collapsed: options.layersCollapsed !== false,
    position: options.layersPosition || "topleft",
  })?.addTo?.(map);

  let destroyed = false;
  let currentBase = null;
  let preferredOnlineBase = ["hybrid", "satellite", "osm", "blank"].includes(options.initialBase)
    ? options.initialBase
    : "hybrid";
  let visibleFeatures = [];
  let selectedLotId = "";
  let lotsLayer = null;
  let haloLayer = null;
  let labelSvg = null;
  let anchorLayer = null;
  const tileErrorCounts = { hybrid: 0, satellite: 0, osm: 0 };
  let resizeObserver = null;
  const layersByLot = new Map();
  const offlineNotice = typeof document !== "undefined" ? document.createElement("div") : null;
  if (offlineNotice) {
    offlineNotice.className = "casur-geo-offline-notice";
    offlineNotice.setAttribute("role", "status");
    offlineNotice.setAttribute("aria-live", "polite");
    offlineNotice.textContent = "Sin mapa base: polígonos, ficha y coordenadas CASUR disponibles.";
    offlineNotice.hidden = true;
    element.append?.(offlineNotice);
  }

  function assertActive() {
    if (destroyed) throw new Error("El visor geográfico ya fue destruido");
  }

  function updateOfflineUi(isOffline) {
    element.classList?.toggle("casur-geo-map--offline", isOffline);
    if (offlineNotice) offlineNotice.hidden = !isOffline;
  }

  function updateBaseIndicator() {
    const label = baseLabels[currentBase] || baseLabels.blank;
    options.onBaseChange?.({ key: currentBase || "blank", label });
  }

  function activateBase(key, remember = true) {
    assertActive();
    const nextKey = Object.prototype.hasOwnProperty.call(bases, key) ? key : "blank";
    if (currentBase && map.hasLayer?.(bases[currentBase])) map.removeLayer?.(bases[currentBase]);
    bases[nextKey].addTo?.(map);
    currentBase = nextKey;
    if (remember && nextKey !== "blank") preferredOnlineBase = nextKey;
    updateOfflineUi(nextKey === "blank");
    updateBaseIndicator();
  }

  function onOffline() { activateBase("blank", false); }
  function onOnline() {
    Object.keys(tileErrorCounts).forEach((key) => { tileErrorCounts[key] = 0; });
    if (options.restoreOnlineBase !== false && currentBase === "blank") activateBase(preferredOnlineBase, false);
  }
  function onPrimaryTileError(baseKey) {
    if (currentBase !== baseKey) return;
    tileErrorCounts[baseKey] += 1;
    if (tileErrorCounts[baseKey] >= (options.tileErrorThreshold || 4)) activateBase("blank", false);
  }
  function onOsmTileError() { onPrimaryTileError("osm"); }
  function onSatelliteTileError() { onPrimaryTileError("satellite"); }
  function onHybridImageryTileError() { onPrimaryTileError("hybrid"); }
  function onHybridTransportTileError() { /* Las capas de referencia no controlan el fallback del mapa base. */ }
  function onBaseLayerChange(event) {
    const next = Object.entries(bases).find(([, layer]) => event?.layer === layer)?.[0] || "blank";
    currentBase = next;
    if (next !== "blank") {
      preferredOnlineBase = next;
      tileErrorCounts[next] = 0;
    }
    updateOfflineUi(next === "blank");
    updateBaseIndicator();
  }

  const tileErrorHandlers = [
    [osm, onOsmTileError],
    [satellite, onSatelliteTileError],
    [hybridImagery, onHybridImageryTileError],
    [hybridTransport, onHybridTransportTileError],
  ];
  tileErrorHandlers.forEach(([layer, handler]) => layer.on?.("tileerror", handler));
  map.on?.("baselayerchange", onBaseLayerChange);
  if (typeof window !== "undefined") {
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
  }
  const startsOffline = typeof navigator !== "undefined" && navigator.onLine === false;
  activateBase(startsOffline ? "blank" : preferredOnlineBase, false);

  const neighborStyle = {
    color: options.neighborColor || "#087ea4",
    weight: 1.8,
    opacity: 0.9,
    fillColor: options.neighborFill || "#22b8cf",
    fillOpacity: 0.16,
  };
  const selectedStyle = {
    color: options.selectedColor || "#ffca28",
    weight: 5,
    opacity: 1,
    fillColor: options.selectedFill || "#ffd54f",
    fillOpacity: 0.42,
  };

  function styleFor(feature) {
    if (typeof options.featureStyle === "function") return { ...neighborStyle, ...options.featureStyle(feature) };
    return featureLotId(feature) === selectedLotId ? { ...selectedStyle } : { ...neighborStyle };
  }

  function bindLabel(feature, layer) {
    const lotId = featureLotId(feature);
    const selected = lotId === selectedLotId;
    layer.unbindTooltip?.();
    const tooltipLabel = typeof options.lotTooltipLabel === "function"
      ? options.lotTooltipLabel(feature, lotId)
      : `Suerte ${lotId}`;
    layer.bindTooltip?.(String(tooltipLabel), {
      permanent: !(options.hideContextualLabels && options.contextualFeature?.(feature)) && (selected || options.permanentLabels === true),
      direction: "center",
      className: selected ? "casur-geo-label casur-geo-label--selected" : "casur-geo-label",
      opacity: 1,
    });
  }

  function drawCartographicLabels() {
    if (!options.cartographicLabels || destroyed) return;
    labelSvg?.remove();
    const size = map.getSize(), width = size.x, height = size.y;
    const context = document.createElement("canvas").getContext("2d");
    const scale = options.cartographicLabelScale || 1;
    context.font = `600 ${13 * scale}px Arial`;
    const items = visibleFeatures.filter(feature => (!options.hideContextualLabels || !options.contextualFeature?.(feature)) && options.cartographicLabelVisible?.(feature) !== false).map(feature => ({
      id: featureLotId(feature), text: String(options.cartographicLabel?.(feature) || featureLotId(feature)),
      contextual: options.contextualFeature?.(feature) === true,
      color: styleFor(feature).color,
      points: cartographicInteriorPoints(feature).map(p => map.latLngToContainerPoint([p[1], p[0]])),
    })).sort((a, b) => Number(a.contextual) - Number(b.contextual));
    const result = cartographicLabelLayout(items, width, height, text => context.measureText(text).width, scale);
    const ns = "http://www.w3.org/2000/svg";
    labelSvg = document.createElementNS(ns, "svg");
    labelSvg.setAttribute("width", width); labelSvg.setAttribute("height", height);
    labelSvg.setAttribute("class", "casur-cartographic-labels");
    labelSvg.style.cssText = "position:absolute;inset:0;z-index:450;pointer-events:none";
    for (const label of result.labels) {
      const group = document.createElementNS(ns, "g"); group.dataset.lotId = label.id;
      const add = (tag, attrs) => { const node = document.createElementNS(ns, tag); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); group.append(node); return node; };
      if (label.external) add("line", { x1: label.origin.x, y1: label.origin.y, x2: label.x + label.w / 2, y2: label.y + label.h / 2, stroke: "#fff", "stroke-width": 1.5 });
      add("rect", { x: label.x, y: label.y, width: label.w, height: label.h, rx: 3, fill: label.contextual ? "#eef0ee" : "#14282d", "fill-opacity": .9, stroke: label.color, "stroke-width": label.contextual ? 1 : 2 });
      add("text", { x: label.x + label.w / 2, y: label.y + 16 * scale, "text-anchor": "middle", "font-family": "Arial", "font-size": 13 * scale, "font-weight": label.contextual ? 400 : 600, fill: label.contextual ? "#46534e" : "#fff" }).textContent = label.text;
      labelSvg.append(group);
    }
    element.append(labelSvg);
    options.onLabelLayout?.(result);
  }
  function redrawCartography() {
    if ((options.cartographicLabels || options.outlineHalo) && !Number.isFinite(map.getZoom())) return;
    if (options.outlineHalo) {
      const weight = map.getZoom() >= 15 ? 2.6 : 2;
      lotsLayer?.setStyle?.(feature => ({ ...styleFor(feature), weight: options.contextualFeature?.(feature) ? 1 : weight }));
      haloLayer?.setStyle?.(feature => ({ weight: weight + 2, color: "#f8faf1", opacity: options.contextualFeature?.(feature) ? .12 : .85, fill: false }));
    }
    drawCartographicLabels();
  }
  function hideMovingLabels() { if (labelSvg) labelSvg.style.visibility = "hidden"; }
  if (options.cartographicLabels || options.outlineHalo) {
    map.on("moveend zoomend resize", redrawCartography);
    map.on("movestart zoomstart", hideMovingLabels);
  }

  function removeLayer(layer) {
    if (layer && map.hasLayer?.(layer)) map.removeLayer(layer);
  }

  function updateAnchor() {
    removeLayer(anchorLayer);
    anchorLayer = null;
    if (options.showAnchor === false || !selectedLotId || typeof L.circleMarker !== "function") return;
    const feature = visibleFeatures.find((item) => featureLotId(item) === selectedLotId);
    const anchor = featureAnchor(feature);
    if (!anchor) return;
    anchorLayer = L.circleMarker([anchor[1], anchor[0]], {
      pane: panes.anchor,
      radius: 5,
      weight: 2,
      color: "#5b4200",
      fillColor: "#fff7cf",
      fillOpacity: 1,
      interactive: false,
    }).addTo(map);
  }

  function refreshSelectionStyles() {
    layersByLot.forEach((layer, lotId) => {
      layer.setStyle?.(styleFor(layer.feature));
      bindLabel(layer.feature, layer);
      if (lotId === selectedLotId) layer.bringToFront?.();
    });
    updateAnchor();
  }

  function selectLot(lotId, selectOptions = {}) {
    assertActive();
    const requested = normalizeGeoLotId(lotId);
    if (requested && !layersByLot.has(requested)) return false;
    if (requested === selectedLotId) {
      if (selectOptions.fit === true && requested) fitToLot(requested);
      return true;
    }
    selectedLotId = requested;
    refreshSelectionStyles();
    const feature = visibleFeatures.find((item) => featureLotId(item) === selectedLotId) || null;
    if (feature && selectOptions.notify !== false) options.onSelectLot?.(feature);
    if (feature && selectOptions.fit === true) fitToLot(selectedLotId);
    return true;
  }

  function addFeatureLayer(feature, layer) {
    const lotId = featureLotId(feature);
    layer.feature = feature;
    layersByLot.set(lotId, layer);
    bindLabel(feature, layer);
    if (options.interactiveSelection !== false) layer.on?.("click", () => selectLot(lotId));
  }

  function clearLotsLayer() {
    removeLayer(lotsLayer);
    removeLayer(haloLayer); haloLayer = null;
    labelSvg?.remove(); labelSvg = null;
    removeLayer(anchorLayer);
    lotsLayer = null;
    anchorLayer = null;
    layersByLot.clear();
  }

  function fitBounds(bounds) {
    if (!bounds?.isValid?.()) return false;
    map.invalidateSize?.({ animate: false });
    map.fitBounds(bounds, {
      padding: options.fitPadding || [28, 28],
      maxZoom: options.maxFitZoom || 19,
      animate: options.animateFit === true,
    });
    return true;
  }

  function fitToData() {
    assertActive();
    return fitBounds(lotsLayer?.getBounds?.());
  }

  function fitToLot(lotId = selectedLotId) {
    assertActive();
    const layer = layersByLot.get(normalizeGeoLotId(lotId));
    return fitBounds(layer?.getBounds?.());
  }

  function getSelectedLotId() {
    return selectedLotId;
  }

  function getActiveBase() {
    return currentBase || "blank";
  }

  function setLots(features, requestedSelectedLotId = "") {
    assertActive();
    const seen = new Set();
    visibleFeatures = (Array.isArray(features) ? features : [])
      .filter(validFeature)
      .filter((feature) => {
        const lotId = featureLotId(feature);
        if (seen.has(lotId)) return false;
        seen.add(lotId);
        return true;
      });
    const requested = normalizeGeoLotId(requestedSelectedLotId);
    selectedLotId = requested && seen.has(requested) ? requested : "";
    clearLotsLayer();
    if (visibleFeatures.length) {
      if (options.outlineHalo) haloLayer = L.geoJSON(featureCollection(visibleFeatures), { pane: panes.lots, interactive: false, style: { color: "#f8faf1", weight: 4, opacity: .85, fill: false } }).addTo(map);
      lotsLayer = L.geoJSON(featureCollection(visibleFeatures), {
        pane: panes.lots,
        style: styleFor,
        onEachFeature: addFeatureLayer,
      }).addTo(map);
      refreshSelectionStyles();
    }
    if (options.autoFit !== false) fitToData();
    redrawCartography();
    return api;
  }

  function setLot(feature) {
    return setLots(validFeature(feature) ? [feature] : [], featureLotId(feature));
  }

  function destroy() {
    if (destroyed) return;
    if (typeof window !== "undefined") {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    }
    resizeObserver?.disconnect?.();
    resizeObserver = null;
    tileErrorHandlers.forEach(([layer, handler]) => layer.off?.("tileerror", handler));
    map.off?.("baselayerchange", onBaseLayerChange);
    map.off?.("moveend zoomend resize", redrawCartography);
    map.off?.("movestart zoomstart", hideMovingLabels);
    labelSvg?.remove();
    map.remove?.();
    offlineNotice?.remove?.();
    element.classList?.remove("casur-geo-map", "casur-geo-map--offline");
    [["role", priorAttributes.role], ["aria-label", priorAttributes.label], ["tabindex", priorAttributes.tabindex]]
      .forEach(([name, value]) => {
        if (value === null || value === undefined) element.removeAttribute?.(name);
        else element.setAttribute?.(name, value);
      });
    destroyed = true;
  }

  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => {
      if (!destroyed) map.invalidateSize?.({ animate: false });
    });
    resizeObserver.observe(element);
  }

  const api = Object.freeze({ selectLot, getSelectedLotId, getActiveBase, fitToLot, fitToData, setLot, setLots, destroy });
  return api;
}

if (typeof window !== "undefined") window.createCasurMap = createCasurMap;

export default createCasurMap;
