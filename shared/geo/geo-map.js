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
  let anchorLayer = null;
  const tileErrorCounts = { hybrid: 0, satellite: 0, osm: 0 };
  let resizeObserver = null;
  const layersByLot = new Map();
  let baseIndicatorNode = null;
  let baseIndicatorControl = null;

  if (typeof L.control === "function") {
    baseIndicatorControl = L.control({ position: options.baseIndicatorPosition || "topleft" });
    baseIndicatorControl.onAdd = () => {
      const node = L.DomUtil?.create?.("div", "casur-geo-base-indicator")
        || (typeof document !== "undefined" ? document.createElement("div") : null);
      if (!node) return null;
      node.classList?.add?.("casur-geo-base-indicator");
      node.setAttribute?.("role", "status");
      node.setAttribute?.("aria-live", "polite");
      node.setAttribute?.("aria-label", "Mapa base activo");
      baseIndicatorNode = node;
      return node;
    };
    baseIndicatorControl.addTo?.(map);
  }

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
    if (baseIndicatorNode) baseIndicatorNode.textContent = `Base · ${label}`;
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
    return featureLotId(feature) === selectedLotId ? { ...selectedStyle } : { ...neighborStyle };
  }

  function bindLabel(feature, layer) {
    const lotId = featureLotId(feature);
    const selected = lotId === selectedLotId;
    layer.unbindTooltip?.();
    layer.bindTooltip?.(`Suerte ${lotId}`, {
      permanent: selected || options.permanentLabels === true,
      direction: "center",
      className: selected ? "casur-geo-label casur-geo-label--selected" : "casur-geo-label",
      opacity: 1,
    });
  }

  function removeLayer(layer) {
    if (layer && map.hasLayer?.(layer)) map.removeLayer(layer);
  }

  function updateAnchor() {
    removeLayer(anchorLayer);
    anchorLayer = null;
    if (!selectedLotId || typeof L.circleMarker !== "function") return;
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
      layer.setStyle?.(lotId === selectedLotId ? { ...selectedStyle } : { ...neighborStyle });
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
    layer.on?.("click", () => selectLot(lotId));
  }

  function clearLotsLayer() {
    removeLayer(lotsLayer);
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
      lotsLayer = L.geoJSON(featureCollection(visibleFeatures), {
        pane: panes.lots,
        style: styleFor,
        onEachFeature: addFeatureLayer,
      }).addTo(map);
      refreshSelectionStyles();
    }
    if (options.autoFit !== false) fitToData();
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
    baseIndicatorControl?.remove?.();
    baseIndicatorControl = null;
    baseIndicatorNode = null;
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
