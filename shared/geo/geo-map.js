import { normalizeGeoLotId } from "./geo-data.js";

const OSM_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ESRI_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

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

  const map = L.map(element, {
    zoomControl: true,
    preferCanvas: true,
    attributionControl: true,
    ...(options.mapOptions || {}),
  });

  const panes = {
    halo: "casurGeoHaloPane",
    neighbors: "casurGeoNeighborsPane",
    selected: "casurGeoSelectedPane",
  };
  Object.entries({ [panes.halo]: 395, [panes.neighbors]: 405, [panes.selected]: 415 }).forEach(([name, zIndex]) => {
    if (typeof map.createPane === "function" && !map.getPane?.(name)) map.createPane(name);
    const pane = map.getPane?.(name);
    if (pane?.style) {
      pane.style.zIndex = String(zIndex);
      if (name === panes.halo) pane.style.pointerEvents = "none";
    }
  });

  const osm = L.tileLayer(OSM_URL, {
    maxZoom: 22,
    maxNativeZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  });
  const satellite = L.tileLayer(ESRI_URL, {
    maxZoom: 22,
    maxNativeZoom: 19,
    attribution: "Tiles &copy; Esri",
  });
  const blank = L.layerGroup();
  const bases = { satellite, osm, blank };
  const namedBases = { "Satélite": satellite, "Mapa claro": osm, "Sin mapa base": blank };
  L.control?.layers?.(namedBases, {}, { collapsed: options.layersCollapsed !== false })?.addTo?.(map);

  let destroyed = false;
  let currentBase = null;
  let preferredOnlineBase = ["satellite", "osm", "blank"].includes(options.initialBase)
    ? options.initialBase
    : "satellite";
  let visibleFeatures = [];
  let selectedLotId = "";
  let neighborsLayer = null;
  let haloLayer = null;
  let selectedLayer = null;
  let tileErrorCount = 0;
  let resizeObserver = null;

  const offlineNotice = typeof document !== "undefined" ? document.createElement("div") : null;
  if (offlineNotice) {
    offlineNotice.className = "casur-geo-offline-notice";
    offlineNotice.setAttribute("role", "status");
    offlineNotice.setAttribute("aria-live", "polite");
    offlineNotice.textContent = "Sin mapa base: polígonos CASUR disponibles.";
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

  function activateBase(key, remember = true) {
    assertActive();
    const nextKey = Object.prototype.hasOwnProperty.call(bases, key) ? key : "blank";
    if (currentBase && map.hasLayer?.(bases[currentBase])) map.removeLayer?.(bases[currentBase]);
    bases[nextKey].addTo?.(map);
    currentBase = nextKey;
    if (remember && nextKey !== "blank") preferredOnlineBase = nextKey;
    updateOfflineUi(nextKey === "blank");
  }

  function onOffline() { activateBase("blank", false); }
  function onOnline() {
    tileErrorCount = 0;
    if (options.restoreOnlineBase !== false && currentBase === "blank") activateBase(preferredOnlineBase, false);
  }
  function onTileError() {
    tileErrorCount += 1;
    if (tileErrorCount >= (options.tileErrorThreshold || 4) && currentBase !== "blank") activateBase("blank", false);
  }
  function onBaseLayerChange(event) {
    const next = event?.layer === satellite ? "satellite" : event?.layer === osm ? "osm" : "blank";
    currentBase = next;
    if (next !== "blank") preferredOnlineBase = next;
    updateOfflineUi(next === "blank");
  }

  satellite.on?.("tileerror", onTileError);
  osm.on?.("tileerror", onTileError);
  map.on?.("baselayerchange", onBaseLayerChange);
  if (typeof window !== "undefined") {
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
  }
  const startsOffline = typeof navigator !== "undefined" && navigator.onLine === false;
  activateBase(startsOffline ? "blank" : preferredOnlineBase, false);

  const neighborStyle = {
    color: options.neighborColor || "#2f6847",
    weight: 1.4,
    opacity: 0.8,
    fillColor: options.neighborFill || "#5f9571",
    fillOpacity: 0.16,
  };
  const haloStyle = {
    color: options.haloColor || "#fff4b0",
    weight: 8,
    opacity: 0.78,
    fillOpacity: 0,
    interactive: false,
  };
  const selectedStyle = {
    color: options.selectedColor || "#f4c542",
    weight: 4,
    opacity: 1,
    fillColor: options.selectedFill || "#f4c542",
    fillOpacity: 0.32,
  };

  function labelFeature(feature, layer, selected = false) {
    const lotId = featureLotId(feature);
    layer.bindTooltip?.(`Suerte ${lotId}`, {
      permanent: selected || options.permanentLabels === true,
      direction: "center",
      className: selected ? "casur-geo-label casur-geo-label--selected" : "casur-geo-label",
      opacity: 1,
    });
    layer.on?.("click", () => {
      if (destroyed || lotId === selectedLotId) return;
      selectedLotId = lotId;
      renderLayers();
      options.onSelectLot?.(feature);
    });
  }

  function removeLayer(layer) {
    if (layer && map.hasLayer?.(layer)) map.removeLayer(layer);
  }

  function renderLayers() {
    removeLayer(neighborsLayer);
    removeLayer(haloLayer);
    removeLayer(selectedLayer);
    neighborsLayer = null;
    haloLayer = null;
    selectedLayer = null;

    const selected = visibleFeatures.find((feature) => featureLotId(feature) === selectedLotId) || null;
    const neighbors = selected
      ? visibleFeatures.filter((feature) => feature !== selected)
      : visibleFeatures;

    if (neighbors.length) {
      neighborsLayer = L.geoJSON(featureCollection(neighbors), {
        pane: panes.neighbors,
        style: () => ({ ...neighborStyle }),
        onEachFeature: (feature, layer) => labelFeature(feature, layer, false),
      }).addTo(map);
    }
    if (selected) {
      haloLayer = L.geoJSON(selected, {
        pane: panes.halo,
        interactive: false,
        style: () => ({ ...haloStyle }),
      }).addTo(map);
      selectedLayer = L.geoJSON(selected, {
        pane: panes.selected,
        style: () => ({ ...selectedStyle }),
        onEachFeature: (feature, layer) => labelFeature(feature, layer, true),
      }).addTo(map);
    }
  }

  function combinedBounds() {
    let bounds = null;
    [neighborsLayer, selectedLayer].forEach((layer) => {
      const candidate = layer?.getBounds?.();
      if (!candidate?.isValid?.()) return;
      bounds = bounds ? bounds.extend(candidate) : candidate;
    });
    return bounds;
  }

  function fitToData() {
    assertActive();
    const bounds = combinedBounds();
    if (!bounds?.isValid?.()) return false;
    map.invalidateSize?.({ animate: false });
    map.fitBounds(bounds, {
      padding: options.fitPadding || [28, 28],
      maxZoom: options.maxFitZoom || 19,
      animate: options.animateFit === true,
    });
    return true;
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
    renderLayers();
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
    satellite.off?.("tileerror", onTileError);
    osm.off?.("tileerror", onTileError);
    map.off?.("baselayerchange", onBaseLayerChange);
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

  const api = Object.freeze({ setLot, setLots, fitToData, destroy });
  return api;
}

if (typeof window !== "undefined") window.createCasurMap = createCasurMap;

export default createCasurMap;
