import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCasurMap } from "../shared/geo/geo-map.js";

function polygon(lotId, offset = 0) {
  return {
    type: "Feature",
    bbox: [-85.8 + offset, 11.4, -85.79 + offset, 11.41],
    properties: { lotId, fragmentCount: 1, anchor: [-85.795 + offset, 11.405] },
    geometry: {
      type: "MultiPolygon",
      coordinates: [[[[-85.8 + offset, 11.4], [-85.79 + offset, 11.4], [-85.79 + offset, 11.41], [-85.8 + offset, 11.4]]]],
    },
  };
}

function fakeElement() {
  const attributes = new Map();
  const classes = new Set();
  return {
    attributes,
    classList: {
      add: (...items) => items.forEach((item) => classes.add(item)),
      remove: (...items) => items.forEach((item) => classes.delete(item)),
      toggle: (item, force) => force ? classes.add(item) : classes.delete(item),
      contains: (item) => classes.has(item),
    },
    getAttribute: (name) => attributes.has(name) ? attributes.get(name) : null,
    setAttribute: (name, value) => attributes.set(name, String(value)),
    removeAttribute: (name) => attributes.delete(name),
    hasAttribute: (name) => attributes.has(name),
    append: () => {},
  };
}

function fakeLeaflet() {
  const records = { tiles: [], geo: [], controls: [], indicators: [], markers: [] };
  class Bounds {
    constructor(valid = true) { this.valid = valid; this.extended = 0; }
    isValid() { return this.valid; }
    extend() { this.extended += 1; return this; }
  }
  class Layer {
    constructor(kind, payload = null, options = {}) {
      this.kind = kind;
      this.payload = payload;
      this.options = options;
      this.events = new Map();
      this.children = [];
      this.bounds = new Bounds(kind === "geo" || kind === "feature");
    }
    addTo(map) { map.addLayer(this); return this; }
    on(name, fn) { this.events.set(name, fn); return this; }
    off(name) { this.events.delete(name); return this; }
    getBounds() { return this.bounds; }
    setStyle(style) { this.style = style; return this; }
    bringToFront() { this.front = true; return this; }
    unbindTooltip() { this.tooltip = null; return this; }
  }
  class FakeMap {
    constructor(element, options) {
      this.element = element;
      this.options = options;
      this.layers = new Set();
      this.panes = {};
      this.fitCalls = [];
      this.invalidations = 0;
      this.removed = false;
      this.events = new Map();
    }
    createPane(name) { this.panes[name] = { style: {} }; return this.panes[name]; }
    getPane(name) { return this.panes[name] || null; }
    addLayer(layer) { this.layers.add(layer); return this; }
    hasLayer(layer) { return this.layers.has(layer); }
    removeLayer(layer) { this.layers.delete(layer); return this; }
    fitBounds(bounds, options) { this.fitCalls.push({ bounds, options }); return this; }
    invalidateSize() { this.invalidations += 1; return this; }
    on(name, fn) { this.events.set(name, fn); return this; }
    off(name) { this.events.delete(name); return this; }
    remove() { this.removed = true; this.layers.clear(); }
  }
  const control = function control(options) {
    const record = { options, node: null, removed: false };
    records.indicators.push(record);
    return {
      onAdd: null,
      addTo(map) { record.node = this.onAdd?.(map) || null; return this; },
      remove() { record.removed = true; },
    };
  };
  control.layers = function layers(baseLayers, overlays, options) {
    records.controls.push({ baseLayers, overlays, options });
    return { addTo: () => {} };
  };
  const L = {
    map(element, options) { records.map = new FakeMap(element, options); return records.map; },
    tileLayer(url, options) {
      const layer = new Layer("tile", url, options);
      records.tiles.push(layer);
      return layer;
    },
    layerGroup(children = []) { const layer = new Layer("group"); layer.children = children; return layer; },
    geoJSON(payload, options) {
      const layer = new Layer("geo", payload, options);
      const features = payload.type === "FeatureCollection" ? payload.features : [payload];
      features.forEach((feature) => {
        const child = new Layer("feature", feature);
        child.bindTooltip = (label, tooltipOptions) => {
          child.tooltip = { label, options: tooltipOptions };
          return child;
        };
        options.onEachFeature?.(feature, child);
        layer.children.push(child);
      });
      records.geo.push(layer);
      return layer;
    },
    circleMarker(latlng, options) {
      const marker = new Layer("marker", latlng, options);
      records.markers.push(marker);
      return marker;
    },
    control,
    DomUtil: {
      create() {
        const node = fakeElement();
        node.textContent = "";
        return node;
      },
    },
  };
  return { L, records };
}

test("createCasurMap monta híbrido, vecinos azules y selección amarilla sin reconstruir GeoJSON", () => {
  const element = fakeElement();
  const { L, records } = fakeLeaflet();
  const selections = [];
  const viewer = createCasurMap(element, { leaflet: L, onSelectLot: (feature) => selections.push(feature.properties.lotId) });

  assert.deepEqual(Object.keys(viewer), ["selectLot", "getSelectedLotId", "getActiveBase", "fitToLot", "fitToData", "setLot", "setLots", "destroy"]);
  assert.equal(element.attributes.get("role"), "region");
  assert.equal(element.attributes.get("aria-label"), "Mapa agrícola CASUR");
  assert.equal(records.tiles.length, 4);
  assert.match(records.tiles[0].payload, /openstreetmap/);
  assert.match(records.tiles[1].payload, /arcgisonline/);
  assert.match(records.tiles[3].payload, /World_Transportation/);
  records.tiles.forEach((tile) => assert.equal(tile.options.crossOrigin, "anonymous"));
  assert.deepEqual(Object.keys(records.controls[0].baseLayers), ["Híbrido", "Satélite", "Mapa claro", "Sin mapa base"]);
  assert.equal(records.controls[0].options.position, "topleft");
  assert.equal(records.indicators.length, 0, "el selector Leaflet evita un indicador de base redundante");
  assert.equal(viewer.getActiveBase(), "hybrid");
  const hybrid = records.controls[0].baseLayers["Híbrido"];
  assert.equal(records.map.hasLayer(hybrid), true, "Híbrido continúa como mapa base default");
  assert.deepEqual(hybrid.children, [records.tiles[2], records.tiles[3]], "Híbrido usa solo World Imagery + World Transportation");
  assert.equal(records.tiles.some((tile) => /World_Boundaries_and_Places/.test(tile.payload)), false);
  for (let count = 0; count < 6; count += 1) records.tiles[3].events.get("tileerror")();
  for (let count = 0; count < 6; count += 1) records.tiles[1].events.get("tileerror")();
  assert.equal(element.classList.contains("casur-geo-map--offline"), false, "Transportation e imagery inactiva no apagan Híbrido");
  for (let count = 0; count < 3; count += 1) records.tiles[2].events.get("tileerror")();
  assert.equal(element.classList.contains("casur-geo-map--offline"), false, "el base principal conserva el umbral existente");
  records.tiles[2].events.get("tileerror")();
  assert.equal(element.classList.contains("casur-geo-map--offline"), true, "el fallo real de World Imagery conserva el fallback neutro");

  viewer.setLots([polygon("75907"), polygon("75908", 0.03), polygon("75909", 0.06)], "75907");
  const lots = records.geo[0];
  assert.equal(records.geo.length, 1);
  assert.equal(lots.options.pane, "casurGeoLotsPane");
  assert.equal(lots.children[0].style.color, "#ffca28");
  assert.equal(lots.children[1].style.color, "#087ea4");
  assert.equal(lots.children[0].tooltip.label, "Suerte 75907");
  assert.equal(lots.children[0].tooltip.options.permanent, true);
  assert.equal(records.markers[0].payload[0], 11.405);
  assert.equal(records.map.fitCalls.length, 1);

  lots.children[1].events.get("click")();
  assert.deepEqual(selections, ["75908"]);
  assert.equal(viewer.getSelectedLotId(), "75908");
  viewer.selectLot("75909");
  viewer.selectLot("75907");
  assert.equal(viewer.getSelectedLotId(), "75907");
  assert.equal(records.geo.length, 1, "A→B→C→A no reconstruye la capa GeoJSON");
  assert.equal(records.map.fitCalls.length, 1, "seleccionar no cambia el encuadre");
  assert.equal(viewer.fitToData(), true, "Finca completa sigue disponible después de A→B→C");
  assert.equal(viewer.getSelectedLotId(), "75907", "Finca completa no cambia selectedLotId");
  assert.equal(records.map.fitCalls.length, 2);
  assert.equal(viewer.fitToLot(), true);
  assert.equal(records.map.fitCalls.length, 3, "Centrar suerte conserva una acción independiente");

  viewer.destroy();
  assert.equal(records.map.removed, true);
  assert.equal(element.attributes.has("role"), false);
  assert.equal(element.classList.contains("casur-geo-map"), false);
  assert.doesNotThrow(() => viewer.destroy(), "destroy es idempotente");
});

test("el cambio de base sigue notificándose sin duplicar el selector en el mapa", () => {
  const element = fakeElement();
  const { L, records } = fakeLeaflet();
  const changes = [];
  const viewer = createCasurMap(element, { leaflet: L, onBaseChange: (base) => changes.push(base) });
  const bases = records.controls[0].baseLayers;

  records.map.events.get("baselayerchange")({ layer: bases["Satélite"] });
  assert.equal(viewer.getActiveBase(), "satellite");
  records.map.events.get("baselayerchange")({ layer: bases["Mapa claro"] });
  assert.equal(viewer.getActiveBase(), "osm");
  records.map.events.get("baselayerchange")({ layer: bases["Sin mapa base"] });
  assert.equal(viewer.getActiveBase(), "blank");
  assert.deepEqual(changes.map((change) => change.label), ["Híbrido", "Satélite", "Mapa claro", "Sin fondo"]);
  viewer.destroy();
});

test("setLot tolera ausencia de geometría sin inventar un polígono", () => {
  const { L, records } = fakeLeaflet();
  const viewer = createCasurMap(fakeElement(), { leaflet: L });
  viewer.setLot(null);
  assert.equal(records.geo.length, 0);
  assert.equal(records.map.fitCalls.length, 0);
  viewer.setLot(polygon("25605A"));
  assert.equal(records.geo.length, 1, "una única capa interactiva");
  assert.equal(viewer.getSelectedLotId(), "25605A");
  viewer.destroy();
});

test("visor biométrico conserva suerte amarilla y centrado sin anchor ni selección por clic", () => {
  const { L, records } = fakeLeaflet();
  const viewer = createCasurMap(fakeElement(), {
    leaflet: L, showAnchor: false, interactiveSelection: false,
  });
  viewer.setLots([polygon("99325")], "99325");
  assert.equal(records.geo.length, 1);
  assert.equal(records.geo[0].children.length, 1, "solo existe el polígono de la suerte muestreada");
  assert.equal(records.geo[0].children[0].style.color, "#ffca28");
  assert.equal(viewer.getSelectedLotId(), "99325");
  assert.equal(records.markers.length, 0, "el anchor no aparece como punto biométrico");
  assert.equal(records.geo[0].children[0].events.has("click"), false);
  assert.equal(viewer.fitToLot(), true, "Suerte centra la selección activa");
  assert.equal(records.map.fitCalls.length, 2);
  assert.equal(records.markers.length, 0, "el clic no puede crear un anchor tardío");
  viewer.destroy();
});

test("cada mapa base principal aísla sus propios errores de tiles", () => {
  [
    { initialBase: "satellite", activeTile: 1 },
    { initialBase: "osm", activeTile: 0 },
  ].forEach(({ initialBase, activeTile }) => {
    const element = fakeElement();
    const { L, records } = fakeLeaflet();
    const viewer = createCasurMap(element, { leaflet: L, initialBase, tileErrorThreshold: 2 });

    records.tiles[3].events.get("tileerror")();
    records.tiles[2].events.get("tileerror")();
    assert.equal(element.classList.contains("casur-geo-map--offline"), false, `${initialBase}: overlays y bases inactivas se ignoran`);
    records.tiles[activeTile].events.get("tileerror")();
    assert.equal(element.classList.contains("casur-geo-map--offline"), false, `${initialBase}: respeta el umbral`);
    records.tiles[activeTile].events.get("tileerror")();
    assert.equal(element.classList.contains("casur-geo-map--offline"), true, `${initialBase}: su propio fallo activa blank`);

    viewer.destroy();
  });
});

test("CSS mantiene fondo offline neutro y controles táctiles", () => {
  const css = readFileSync(new URL("../shared/geo/geo.css", import.meta.url), "utf8");
  assert.match(css, /\.casur-geo-map--offline \.leaflet-tile-pane/);
  assert.match(css, /min-width:\s*44px/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /\.casur-geo-offline-notice/);
  assert.doesNotMatch(css, /\.casur-geo-base-indicator/);
});
