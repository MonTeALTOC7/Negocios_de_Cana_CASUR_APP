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
  const records = { tiles: [], geo: [], controls: [], markers: [] };
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
    control: {
      layers(baseLayers, overlays, options) {
        records.controls.push({ baseLayers, overlays, options });
        return { addTo: () => {} };
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

  assert.deepEqual(Object.keys(viewer), ["selectLot", "getSelectedLotId", "fitToLot", "fitToData", "setLot", "setLots", "destroy"]);
  assert.equal(element.attributes.get("role"), "region");
  assert.equal(element.attributes.get("aria-label"), "Mapa agrícola CASUR");
  assert.equal(records.tiles.length, 5);
  assert.match(records.tiles[0].payload, /openstreetmap/);
  assert.match(records.tiles[1].payload, /arcgisonline/);
  assert.match(records.tiles[3].payload, /World_Transportation/);
  assert.deepEqual(Object.keys(records.controls[0].baseLayers), ["Híbrido", "Satélite", "Mapa claro", "Sin mapa base"]);
  records.tiles[1].events.get("tileerror")();
  records.tiles[1].events.get("tileerror")();
  records.tiles[1].events.get("tileerror")();
  records.tiles[1].events.get("tileerror")();
  assert.equal(element.classList.contains("casur-geo-map--offline"), true, "errores de tiles conservan polígonos y activan fondo neutro");

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
  assert.equal(viewer.fitToLot(), true);
  assert.equal(records.map.fitCalls.length, 2);

  viewer.destroy();
  assert.equal(records.map.removed, true);
  assert.equal(element.attributes.has("role"), false);
  assert.equal(element.classList.contains("casur-geo-map"), false);
  assert.doesNotThrow(() => viewer.destroy(), "destroy es idempotente");
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

test("CSS mantiene fondo offline neutro y controles táctiles", () => {
  const css = readFileSync(new URL("../shared/geo/geo.css", import.meta.url), "utf8");
  assert.match(css, /\.casur-geo-map--offline \.leaflet-tile-pane/);
  assert.match(css, /min-width:\s*44px/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /\.casur-geo-offline-notice/);
});
