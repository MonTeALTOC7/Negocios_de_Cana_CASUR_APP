import test from "node:test";
import assert from "node:assert/strict";
import { captureSampleGps, createBiometryGpsCoordinator } from "../js/biometry-gps.js";
import { createBiometryPointLayer } from "../js/biometry-map.js";

test("captura GPS sintético persiste coordenadas, precisión y hora en el mismo punto", async () => {
  const target = { id: "p01", pointCode: "P01", latitude: null, longitude: null, notes: "conservada" };
  let requestOptions;
  const geolocation = { getCurrentPosition(success, _error, options) {
    requestOptions = options;
    success({ coords: { latitude: 11.234567, longitude: -85.765432, accuracy: 7.4 } });
  } };
  const result = await captureSampleGps(target, { geolocation, now: () => new Date("2026-10-11T18:00:00.000Z") });
  assert.equal(result, target);
  assert.deepEqual(target, {
    id: "p01", pointCode: "P01", latitude: 11.234567, longitude: -85.765432,
    gpsAccuracyM: 7.4, capturedAt: "2026-10-11T18:00:00.000Z", notes: "conservada",
  });
  assert.deepEqual(requestOptions, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
});

test("un error GPS deja intactas las coordenadas capturadas anteriormente", async () => {
  const target = { id: "p02", latitude: 10.5, longitude: -84.5, gpsAccuracyM: 6, capturedAt: "original" };
  const before = structuredClone(target);
  await assert.rejects(captureSampleGps(target, {
    geolocation: { getCurrentPosition(_success, error) { error({ code: 2, message: "sin señal" }); } },
  }));
  assert.deepEqual(target, before);
});

test("captura automática P01 y P02 de forma independiente y solo una vez por punto", async () => {
  const capture = createBiometryGpsCoordinator();
  const samples = [{ id: "p01", latitude: null }, { id: "p02", latitude: null }];
  let calls = 0;
  const geolocation = { getCurrentPosition(success) {
    calls += 1;
    success({ coords: { latitude: 11 + calls / 100, longitude: -85 - calls / 100, accuracy: calls * 5 } });
  } };
  for (const sample of samples) assert.equal((await capture(sample, { automatic: true, geolocation })).status, "captured");
  assert.equal((await capture(samples[0], { automatic: true, geolocation })).status, "skipped");
  assert.equal(calls, 2);
  assert.notEqual(samples[0].latitude, samples[1].latitude);
  assert.equal(samples[0].gpsAccuracyM, 5);
  assert.equal(samples[1].gpsAccuracyM, 10);
});

test("GPS tardío no modifica otro punto ni una sesión abandonada; el botón manual puede recapturar", async () => {
  const capture = createBiometryGpsCoordinator();
  const sample = { id: "p01", latitude: null, longitude: null };
  let complete;
  let calls = 0;
  const geolocation = { getCurrentPosition(success) { calls += 1; complete = success; } };
  let current = true;
  const first = capture(sample, { automatic: true, geolocation, isCurrent: () => current });
  assert.equal((await capture(sample, { automatic: true, geolocation })).status, "pending");
  current = false;
  complete({ coords: { latitude: 11, longitude: -85, accuracy: 6 } });
  assert.equal((await first).status, "stale");
  assert.equal(sample.latitude, null);
  assert.equal(calls, 1);
  const manual = capture(sample, { geolocation });
  complete({ coords: { latitude: 12, longitude: -86, accuracy: 4 } });
  assert.equal((await manual).status, "captured");
  assert.equal(sample.latitude, 12);
  assert.equal(calls, 2);
});

test("fallo automático deja el punto pendiente y permite recaptura manual", async () => {
  const capture = createBiometryGpsCoordinator();
  const sample = { id: "p03", latitude: null, longitude: null };
  let calls = 0;
  const geolocation = { getCurrentPosition(success, error) {
    calls += 1;
    if (calls === 1) error({ code: 2 });
    else success({ coords: { latitude: 10, longitude: -84, accuracy: 9 } });
  } };
  await assert.rejects(capture(sample, { automatic: true, geolocation }));
  assert.equal(sample.latitude, null);
  assert.equal((await capture(sample, { automatic: true, geolocation })).status, "skipped");
  assert.equal((await capture(sample, { geolocation })).status, "captured");
  assert.equal(sample.latitude, 10);
  assert.equal(calls, 2);
});

test("marcadores biométricos aíslan coordenadas por puntos, exponen ficha y permiten volver al punto", () => {
  const created = [];
  const fitted = [];
  const focus = [];
  const fakeMap = {
    fitBounds(bounds, options) { fitted.push({ bounds, options }); },
    invalidateSize() {},
  };
  const leaflet = {
    circleMarker(latlng, options) {
      const marker = {
        latlng, options, events: {}, removed: false,
        addTo(map) { assert.equal(map, fakeMap); return this; },
        bindTooltip(text, config) { this.tooltip = { text, config }; return this; },
        bindPopup(html) { this.popup = html; return this; },
        on(name, callback) { this.events[name] = callback; return this; },
        remove() { this.removed = true; },
      };
      created.push(marker);
      return marker;
    },
    latLngBounds(coordinates) { return { coordinates, isValid: () => true }; },
  };
  const layer = createBiometryPointLayer({
    leaflet, map: fakeMap,
    points: [
      { id: "p01", pointCode: "P01", latitude: 11, longitude: -85, gpsAccuracyM: 8 },
      { id: "p02", pointCode: "P02", latitude: 11.1, longitude: -85.1, gpsAccuracyM: 12 },
      { id: "p03", pointCode: "P03", latitude: null, longitude: null },
    ],
    activeSampleId: "p02", onFocus: (point) => focus.push(point.id),
  });
  assert.equal(layer.count, 2);
  assert.equal(created[0].tooltip.text, "P01");
  assert.equal(created[0].tooltip.config.className, "casur-geo-point-label");
  assert.match(created[1].tooltip.config.className, /casur-geo-point-label--active/);
  assert.equal(created[1].options.fillColor, "#e53935");
  assert.match(created[1].popup, /11\.100000, -85\.100000/);
  assert.match(created[1].popup, /±12 m/);
  let clickHandler;
  created[1].events.popupopen({ popup: { getElement: () => ({ querySelector: () => ({ addEventListener: (_name, listener) => { clickHandler = listener; } }) }) } });
  clickHandler({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(focus, ["p02"]);
  assert.equal(layer.fit(), true);
  assert.deepEqual(fitted[0].bounds.coordinates, [[11, -85], [11.1, -85.1]]);
  layer.destroy();
  assert.ok(created.every((marker) => marker.removed));
  assert.equal(layer.fit(), false);
});
