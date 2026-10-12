import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAX_BIOMETRY_GPS_ACCURACY_M, validateBiometryGpsPosition } from "../js/biometry-geo-validation.js";

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
