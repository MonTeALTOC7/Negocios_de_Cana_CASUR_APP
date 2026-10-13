import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAX_BIOMETRY_GPS_ACCURACY_M, gpsRequiredBiometrySamples, pendingBiometryGpsPoints, validateBiometryGpsPosition } from "../js/biometry-geo-validation.js";

const collection = JSON.parse(readFileSync(new URL("../../../shared/geo/data/zona-5-productores.geojson", import.meta.url), "utf8"));
const lot = collection.features.find((feature) => feature.properties.lotId === "99325");
const reading = (longitude, latitude, gpsAccuracyM = 5) => ({ longitude, latitude, gpsAccuracyM });

test("suerte CASUR 99325: anchor interior aceptado, exterior rechazado y borde por confirmar", () => {
  assert.ok(lot);
  assert.equal(MAX_BIOMETRY_GPS_ACCURACY_M, 20);
  const [longitude, latitude] = lot.properties.anchor;
  assert.equal(validateBiometryGpsPosition(reading(longitude, latitude), lot).status, "inside");
  assert.equal(validateBiometryGpsPosition(reading(lot.bbox[2] + 0.01, latitude), lot).status, "outside");
  const boundary = lot.geometry.coordinates[0][0][0];
  assert.equal(validateBiometryGpsPosition(reading(boundary[0], boundary[1]), lot).status, "confirm");
  assert.equal(validateBiometryGpsPosition(reading(longitude, latitude, 21), lot).status, "confirm");
  assert.equal(validateBiometryGpsPosition(reading(longitude, latitude), null).status, "confirm");
  assert.equal(validateBiometryGpsPosition(reading(200, latitude), lot).status, "confirm");
  assert.equal(validateBiometryGpsPosition(reading("", latitude), lot).status, "confirm");
});

test("Polygon con hueco y MultiPolygon con fragmentos no validan solamente por bbox", () => {
  const outer = [[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]];
  const hole = [[0.004, 0.004], [0.006, 0.004], [0.006, 0.006], [0.004, 0.006], [0.004, 0.004]];
  const fragment = [[0.02, 0.02], [0.03, 0.02], [0.03, 0.03], [0.02, 0.03], [0.02, 0.02]];
  const polygon = { geometry: { type: "Polygon", coordinates: [outer, hole] } };
  const multi = { geometry: { type: "MultiPolygon", coordinates: [[outer, hole], [fragment]] } };
  assert.equal(validateBiometryGpsPosition(reading(0.005, 0.005), polygon).status, "outside");
  assert.equal(validateBiometryGpsPosition(reading(0.025, 0.025), multi).status, "inside");
  assert.equal(validateBiometryGpsPosition(reading(0.015, 0.015), multi).status, "outside");
});

test("solo los puntos calculados con GPS oficial dentro pueden superar el guardado", () => {
  const [longitude, latitude] = lot.properties.anchor;
  const p01 = { pointCode: "P01", ...reading(longitude, latitude) };
  const p02 = { pointCode: "P02", ...reading(lot.bbox[2] + 0.01, latitude) };
  const p03 = { pointCode: "P03", latitude: null, longitude: null, gpsAccuracyM: null };
  assert.deepEqual(pendingBiometryGpsPoints([p01, p02, p03], lot), [p02, p03]);
  assert.deepEqual(pendingBiometryGpsPoints([p01], lot), []);
  assert.deepEqual(pendingBiometryGpsPoints([p01], null), [p01]);
  assert.equal(p02.latitude, latitude, "rechazar GPS no altera mediciones ni lecturas previas");
});

test("biometría nueva exige GPS interior y rechaza GPS ausente o exterior", () => {
  const [longitude, latitude] = lot.properties.anchor;
  const session = { date: "2026-10-12", rowSpacingM: 1.65, sampleLengthM: 3, targetAgeMonths: 10, adjustmentPct: 5,
    samples: [{ id: "p01", pointCode: "P01", stalkCount: 20, heightM: 2.5, diameterMm: 25 }] };
  const required = gpsRequiredBiometrySamples(session, "99325", null, session.samples);
  assert.deepEqual(required, session.samples);
  assert.deepEqual(pendingBiometryGpsPoints(required, lot), session.samples);
  session.samples[0] = { ...session.samples[0], ...reading(lot.bbox[2] + 0.01, latitude) };
  assert.deepEqual(pendingBiometryGpsPoints(gpsRequiredBiometrySamples(session, "99325", null, session.samples), lot), session.samples);
  session.samples[0] = { ...session.samples[0], ...reading(longitude, latitude) };
  assert.deepEqual(pendingBiometryGpsPoints(gpsRequiredBiometrySamples(session, "99325", null, session.samples), lot), []);
});

test("edición histórica de observaciones conserva GPS ausente y no inventa validación", () => {
  const oldSample = { id: "p01", pointCode: "P01", stalkCount: 20, heightM: 2.5, diameterMm: 25, notes: "Original" };
  const oldRecord = { lotId: "99325", date: "2025-05-01", rowSpacingM: 1.65, sampleLengthM: 3,
    targetAgeMonths: 10, adjustmentPct: 5, samples: [oldSample] };
  const session = { ...oldRecord, technician: "Otro técnico", notes: "Observación nueva",
    samples: [{ ...oldSample, notes: "Observación del punto nueva" }] };
  assert.deepEqual(gpsRequiredBiometrySamples(session, "99325", oldRecord, session.samples), []);
  assert.equal(session.samples[0].latitude, undefined);
  assert.equal(session.samples[0].gpsValidatedLotId, undefined);
  assert.deepEqual(oldRecord.samples, [oldSample], "la comparación no altera el registro original");
  const unverifiedHistorical = { ...oldSample, ...reading(lot.bbox[2] + 0.01, lot.properties.anchor[1]) };
  const withOldCoordinate = { ...oldRecord, samples: [unverifiedHistorical] };
  assert.deepEqual(gpsRequiredBiometrySamples({ ...session, samples: [{ ...unverifiedHistorical, notes: "Nota" }] },
    "99325", withOldCoordinate, [{ ...unverifiedHistorical, notes: "Nota" }]), []);
  assert.equal(unverifiedHistorical.gpsValidatedLotId, undefined, "una coordenada antigua no se marca validada sin comprobarla");
});

test("medición histórica modificada o P02 nuevo vuelve a exigir GPS solo en los puntos afectados", () => {
  const p01 = { id: "p01", pointCode: "P01", stalkCount: 20, heightM: 2.5, diameterMm: 25 };
  const oldRecord = { lotId: "99325", date: "2025-05-01", rowSpacingM: 1.65, sampleLengthM: 3,
    targetAgeMonths: 10, adjustmentPct: 5, samples: [p01] };
  const modified = { ...oldRecord, samples: [{ ...p01, stalkCount: 21 }] };
  assert.deepEqual(gpsRequiredBiometrySamples(modified, "99325", oldRecord, modified.samples), modified.samples);
  const newPoint = { id: "p02", pointCode: "P02", stalkCount: 18, heightM: 2.4, diameterMm: 23 };
  const extended = { ...oldRecord, samples: [{ ...p01 }, newPoint] };
  assert.deepEqual(gpsRequiredBiometrySamples(extended, "99325", oldRecord, extended.samples), [newPoint]);
  assert.deepEqual(pendingBiometryGpsPoints([newPoint], lot), [newPoint]);
  const recalculated = { ...oldRecord, rowSpacingM: 1.8, samples: [{ ...p01 }] };
  assert.deepEqual(gpsRequiredBiometrySamples(recalculated, "99325", oldRecord, recalculated.samples), recalculated.samples);
});
