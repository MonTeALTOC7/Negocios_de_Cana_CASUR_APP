import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAX_BIOMETRY_GPS_ACCURACY_M, classifyBiometryPoint, gpsRequiredBiometrySamples, hasPersistedBiometryGpsEvidence, needsFreshBiometryGpsCapture, pendingBiometryGpsPoints, validateBiometryGpsPosition } from "../js/biometry-geo-validation.js";

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

test("clasificación presenta interior, exterior, borde, incertidumbre, huecos, fragmentos y ausencia GEO sin validar históricos", () => {
  const outer = [[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]];
  const hole = [[0.004, 0.004], [0.006, 0.004], [0.006, 0.006], [0.004, 0.006], [0.004, 0.004]];
  const fragment = [[0.02, 0.02], [0.03, 0.02], [0.03, 0.03], [0.02, 0.03], [0.02, 0.02]];
  const feature = { geometry: { type: "MultiPolygon", coordinates: [[outer, hole], [fragment]] } };
  const point = (longitude, latitude, gpsAccuracyM = 5) => ({ pointCode: "P01", longitude, latitude, gpsAccuracyM, capturedAt: "2026-10-13T10:00:00.000Z" });
  assert.equal(classifyBiometryPoint({}, feature, "lot").status, "no-gps");
  assert.equal(classifyBiometryPoint({ ...point(0.002, 0.002), gpsValidatedLotId: "lot" }, feature, "lot", { trustedGps: true }).status, "inside");
  assert.equal(classifyBiometryPoint({ ...point(0.025, 0.025), gpsValidatedLotId: "lot" }, feature, "lot", { trustedGps: true }).status, "inside");
  assert.equal(classifyBiometryPoint(point(0.005, 0.005), feature, "lot").status, "outside", "el hueco no pertenece a la suerte");
  assert.equal(classifyBiometryPoint(point(0.015, 0.015), feature, "lot").status, "outside");
  assert.match(classifyBiometryPoint(point(0, 0.005), feature, "lot").label, /borde/);
  assert.match(classifyBiometryPoint(point(0.002, 0.002, 25), feature, "lot").label, /precisión/);
  assert.equal(classifyBiometryPoint(point(0.002, 0.002), feature, "lot").status, "review", "interior sin evidencia no es validado retroactivamente");
  assert.match(classifyBiometryPoint(point(0.02, 0.02), null, "lot").label, /geometría no disponible/);
  assert.equal(classifyBiometryPoint({ ...point(0.002, 0.002), gpsValidatedLotId: "lot" }, null, "lot", { trustedGps: true }).status, "inside", "la evidencia anterior sobrevive offline");
  assert.equal(classifyBiometryPoint({ gpsRejectedReading: point(0.015, 0.015) }, feature, "lot").status, "outside");
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

test("edición posterior reutiliza GPS validado persistido sin cambiar lectura ni exigir GEO", () => {
  const [longitude, latitude] = lot.properties.anchor;
  const gps = { ...reading(longitude, latitude), capturedAt: "2026-10-10T09:30:00.000Z", gpsValidatedLotId: "99325" };
  const original = { id: "p01", pointCode: "P01", stalkCount: 20, heightM: 2.5, diameterMm: 25, ...gps };
  const saved = { lotId: "99325", date: "2026-10-10", rowSpacingM: 1.65, sampleLengthM: 3,
    targetAgeMonths: 10, adjustmentPct: 5, samples: [original] };
  const corrected = { ...saved, samples: [{ ...original, stalkCount: 21, heightM: 2.6, diameterMm: 26 }] };
  const required = gpsRequiredBiometrySamples(corrected, "99325", saved, corrected.samples);
  assert.deepEqual(required, corrected.samples);
  assert.equal(hasPersistedBiometryGpsEvidence(corrected, "99325", saved, corrected.samples[0]), true);
  assert.equal(needsFreshBiometryGpsCapture(corrected, "99325", saved, corrected.samples[0]), false);
  assert.deepEqual(required.filter((sample) => !hasPersistedBiometryGpsEvidence(corrected, "99325", saved, sample)), [],
    "la edición offline no necesita descargar geometría ni recapturar GPS");
  assert.deepEqual(Object.fromEntries(["latitude", "longitude", "gpsAccuracyM", "capturedAt"].map((field) => [field, corrected.samples[0][field]])), {
    latitude: gps.latitude, longitude: gps.longitude, gpsAccuracyM: gps.gpsAccuracyM, capturedAt: gps.capturedAt,
  });
});

test("evidencia GPS anterior no cubre lectura alterada, otra suerte, punto nuevo ni coordenada histórica sin validar", () => {
  const [longitude, latitude] = lot.properties.anchor;
  const savedPoint = { id: "p01", pointCode: "P01", stalkCount: 20, heightM: 2.5, diameterMm: 25,
    ...reading(longitude, latitude), capturedAt: "2026-10-10T09:30:00.000Z", gpsValidatedLotId: "99325" };
  const saved = { lotId: "99325", date: "2026-10-10", rowSpacingM: 1.65, sampleLengthM: 3,
    targetAgeMonths: 10, adjustmentPct: 5, samples: [savedPoint] };
  const newPoint = { id: "p02", pointCode: "P02", stalkCount: 18, heightM: 2.4, diameterMm: 23 };
  const session = { ...saved, samples: [{ ...savedPoint, stalkCount: 21 }, newPoint] };
  assert.equal(hasPersistedBiometryGpsEvidence(session, "99325", saved, session.samples[1]), false);
  for (const changed of [{ latitude: latitude + 0.001 }, { longitude: longitude + 0.001 },
    { gpsAccuracyM: 6 }, { capturedAt: "2026-10-10T10:00:00.000Z" }, { gpsValidatedLotId: "75907" }]) {
    const altered = { ...session, samples: [{ ...session.samples[0], ...changed }, newPoint] };
    assert.equal(hasPersistedBiometryGpsEvidence(altered, "99325", saved, altered.samples[0]), false);
  }
  assert.equal(hasPersistedBiometryGpsEvidence(session, "75907", saved, session.samples[0]), false);
  const unverified = { ...saved, samples: [{ ...savedPoint, gpsValidatedLotId: undefined }] };
  assert.equal(hasPersistedBiometryGpsEvidence(session, "99325", unverified, session.samples[0]), false);
  assert.equal(hasPersistedBiometryGpsEvidence(session, "99325", { ...saved, samples: [{ ...savedPoint, capturedAt: "" }] }, session.samples[0]), false);
});

test("una coordenada histórica interior sin evidencia no se valida retroactivamente", () => {
  const [longitude, latitude] = lot.properties.anchor;
  const oldPoint = { id: "p01", pointCode: "P01", stalkCount: 20, heightM: 2.5, diameterMm: 25,
    ...reading(longitude, latitude), capturedAt: "2025-05-01T09:30:00.000Z" };
  const saved = { lotId: "99325", samples: [oldPoint] };
  const edited = { samples: [{ ...oldPoint, stalkCount: 21 }] };
  assert.equal(validateBiometryGpsPosition(edited.samples[0], lot).status, "inside");
  assert.equal(hasPersistedBiometryGpsEvidence(edited, "99325", saved, edited.samples[0]), false);
  assert.equal(needsFreshBiometryGpsCapture(edited, "99325", saved, edited.samples[0]), true);
  const recaptured = { ...edited, samples: [{ ...edited.samples[0], capturedAt: "2026-10-12T09:30:00.000Z", gpsValidatedLotId: "99325" }] };
  assert.equal(needsFreshBiometryGpsCapture(recaptured, "99325", saved, recaptured.samples[0]), false);
  const newPoint = { id: "p02", pointCode: "P02", ...reading(longitude, latitude) };
  assert.equal(needsFreshBiometryGpsCapture({ samples: [newPoint] }, "99325", null, newPoint), true);
});
