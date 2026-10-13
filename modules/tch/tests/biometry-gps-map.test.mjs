import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { captureSampleGps, createBiometryGpsCoordinator } from "../js/biometry-gps.js";
import { createBiometryPointLayer } from "../js/biometry-map.js";
import { hasCurrentBiometryGpsEvidence, stampBiometryGpsValidation, validateBiometryGpsPosition } from "../js/biometry-geo-validation.js";

const appSource = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const gpsFunctionSource = appSource.slice(
  appSource.indexOf("async function captureBiometryGps("),
  appSource.indexOf("\nfunction captureActivePointAutomatically()"),
);

test("GPS exterior no altera biometría ni coordenada anterior; recaptura interior sí se acepta", async () => {
  const sample = { id: "p01", stalkCount: 15, heightM: 2.4, diameterMm: 22,
    latitude: 0.005, longitude: 0.005, gpsAccuracyM: 5, capturedAt: "anterior" };
  const prior = structuredClone(sample);
  const polygon = { geometry: { type: "Polygon", coordinates: [
    [[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]],
  ] } };
  const geolocation = { getCurrentPosition(success) { geolocation.complete = success; } };
  const capture = createBiometryGpsCoordinator();
  const options = { geolocation, validateReading: (reading) => validateBiometryGpsPosition(reading, polygon) };
  const outside = capture(sample, options);
  geolocation.complete({ coords: { latitude: 0.02, longitude: 0.02, accuracy: 5 } });
  assert.equal((await outside).status, "outside");
  assert.equal((await Promise.resolve(outside)).reading.longitude, 0.02);
  assert.deepEqual(sample, prior);
  const inside = capture(sample, options);
  geolocation.complete({ coords: { latitude: 0.006, longitude: 0.006, accuracy: 5 } });
  assert.equal((await inside).status, "captured");
  assert.equal(sample.stalkCount, 15);
  assert.equal(sample.heightM, 2.4);
  assert.equal(sample.latitude, 0.006);
});

test("recapturas rechazadas se separan del GPS aceptado y conservan motivo, mediciones y reintento", async () => {
  const sample = { id: "p01", pointCode: "P01", stalkCount: 20, heightM: 2.5, diameterMm: 25 };
  const session = { activeSampleId: "p01", samples: [sample] };
  const state = { biometry: session, selectedLot: { id: "lot" }, route: "biometry", editingBiometryId: "" };
  const polygon = { properties: { lotId: "lot" }, geometry: { type: "Polygon", coordinates: [
    [[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]],
  ] } };
  let position = { latitude: 0.005, longitude: 0.005, accuracy: 5 };
  const geolocation = { getCurrentPosition(success) { success({ coords: position }); } };
  const coordinator = createBiometryGpsCoordinator();
  const captureBiometryGps = runInNewContext(`${gpsFunctionSource}\ncaptureBiometryGps`, {
    state, navigator: { geolocation }, getLotGeometry: async () => polygon, validateBiometryGpsPosition,
    captureBiometryPoint: (target, options) => coordinator(target, { ...options, geolocation }),
    coordinateText: point => point?.latitude != null && point?.longitude != null ? `${point.latitude}, ${point.longitude}` : "",
    stampBiometryGpsValidation, markBiometryDirty() {}, render() {}, notify() {},
  });
  await captureBiometryGps(sample);
  const accepted = Object.fromEntries(["latitude", "longitude", "gpsAccuracyM", "capturedAt"].map((key) => [key, sample[key]]));
  assert.equal(hasCurrentBiometryGpsEvidence(sample, "lot"), true);
  position = { latitude: 0.02, longitude: 0.02, accuracy: 5 };
  await captureBiometryGps(sample);
  assert.deepEqual(Object.fromEntries(Object.keys(accepted).map((key) => [key, sample[key]])), accepted);
  assert.equal(sample.gpsRejectedReading.longitude, 0.02);
  assert.equal(sample.gpsRejectedReason, "outside");
  assert.equal(hasCurrentBiometryGpsEvidence(sample, "lot"), true);
  position = { latitude: 0.005, longitude: 0.005, accuracy: 30 };
  await captureBiometryGps(sample);
  assert.equal(sample.gpsRejectedReason, "accuracy");
  assert.equal(sample.gpsRejectedReading.gpsAccuracyM, 30);
  assert.equal(sample.stalkCount, 20);
  assert.equal(sample.heightM, 2.5);
  assert.equal(sample.diameterMm, 25);
  assert.equal(hasCurrentBiometryGpsEvidence(sample, "lot"), true);
  const p02 = { id: "p02", pointCode: "P02", stalkCount: 18 };
  session.samples.push(p02);
  session.activeSampleId = "p02";
  position = { latitude: 0.02, longitude: 0.02, accuracy: 5 };
  await captureBiometryGps(p02);
  assert.equal(p02.latitude, undefined);
  assert.equal(p02.gpsRejectedReason, "outside");
  assert.equal(hasCurrentBiometryGpsEvidence(p02, "lot"), false);
  position = { latitude: 0.006, longitude: 0.006, accuracy: 5 };
  await captureBiometryGps(p02);
  assert.equal(p02.gpsRejectedReading, undefined);
  assert.equal(hasCurrentBiometryGpsEvidence(p02, "lot"), true);
});

for (const [contextChange, abandon] of [
  ["otro punto activo", ({ session }) => { session.activeSampleId = "p02"; }],
  ["salida de Biometría", ({ state }) => { state.route = "home"; }],
  ["otra sesión", ({ state }) => { state.biometry = { ...state.biometry }; }],
  ["otra suerte", ({ state }) => { state.selectedLot = { id: "99326" }; }],
  ["punto eliminado", ({ session }) => { session.samples.shift(); }],
]) {
  test(`GPS tardío de P01 se descarta tras ${contextChange}`, async () => {
    const p01 = { id: "p01", latitude: 10, longitude: -84, gpsAccuracyM: 8, capturedAt: "original" };
    const p02 = { id: "p02", latitude: null, longitude: null };
    const session = { activeSampleId: "p01", samples: [p01, p02] };
    const state = { biometry: session, selectedLot: { id: "99325" }, route: "biometry" };
    const before = structuredClone(p01);
    let finishGps;
    let dirtyCalls = 0;
    let renderCalls = 0;
    const geolocation = { getCurrentPosition(success) { finishGps = success; } };
    const coordinator = createBiometryGpsCoordinator();
    const captureBiometryGps = runInNewContext(`${gpsFunctionSource}\ncaptureBiometryGps`, {
      state, navigator: { geolocation },
      captureBiometryPoint: (sample, options) => coordinator(sample, { ...options, geolocation }),
      markBiometryDirty: () => { dirtyCalls += 1; },
      render: () => { renderCalls += 1; },
      notify: () => {},
    });
    const pending = captureBiometryGps(p01);
    assert.equal(typeof finishGps, "function");
    abandon({ state, session });
    finishGps({ coords: { latitude: 11, longitude: -85, accuracy: 3 } });
    await pending;
    assert.deepEqual(p01, before);
    assert.equal(p02.latitude, null);
    assert.equal(dirtyCalls, 0);
    assert.equal(renderCalls, 0);
  });
}

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
      { id: "p01", pointCode: "P01", latitude: 11, longitude: -85, gpsAccuracyM: 8, spatialStatus: "inside", spatialLabel: "Dentro · GPS validado" },
      { id: "p02", pointCode: "P02", latitude: 11.1, longitude: -85.1, gpsAccuracyM: 12, spatialStatus: "outside", spatialLabel: "Fuera de la suerte" },
      { id: "p03", pointCode: "P03", latitude: null, longitude: null },
    ],
    activeSampleId: "p02", onFocus: (point) => focus.push(point.id),
  });
  assert.equal(layer.count, 2);
  assert.match(created[0].tooltip.text, /P01 · Dentro/);
  assert.match(created[0].tooltip.config.className, /casur-geo-point-label--inside/);
  assert.match(created[1].tooltip.config.className, /casur-geo-point-label--active/);
  assert.equal(created[1].options.fillColor, "#bc3030");
  assert.match(created[1].tooltip.text, /P02 · Fuera/);
  assert.match(created[1].popup, /11\.100000, -85\.100000/);
  assert.match(created[1].popup, /±12 m/);
  let clickHandler;
  created[1].events.popupopen({ popup: { getElement: () => ({ querySelector: () => ({ addEventListener: (_name, listener) => { clickHandler = listener; } }) }) } });
  clickHandler({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(focus, ["p02"]);
  assert.equal(layer.fit(), true);
  assert.deepEqual(fitted[0].bounds.coordinates, [[11, -85], [11.1, -85.1]]);
  assert.equal(layer.fit({ padding: [45, 28] }, [[10.9, -85.2]]), true);
  assert.deepEqual(fitted[1].bounds.coordinates, [[11, -85], [11.1, -85.1], [10.9, -85.2]], "encuadra polígono y lecturas exteriores sin inventar puntos");
  layer.destroy();
  assert.ok(created.every((marker) => marker.removed));
  assert.equal(layer.fit(), false);
});
