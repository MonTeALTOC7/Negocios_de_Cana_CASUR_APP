import test from "node:test";
import assert from "node:assert/strict";
import { createTchQaLot, isTchGpsQaMode, QA_TCH_LOT_ID, validTchQaGpsReading, validateTchQaGpsReading } from "../js/biometry-qa.js";

test("QA se habilita únicamente mediante parámetro explícito", () => {
  assert.equal(isTchGpsQaMode("?qa=tch-gps-000"), true);
  assert.equal(isTchGpsQaMode("?qa=tch-gps-000&extra=1"), true);
  assert.equal(isTchGpsQaMode(""), false);
  assert.equal(isTchGpsQaMode("?qa=false"), false);
});

test("hacienda y suerte sintéticas tienen identidad diferenciada y edad ficticia para probar TCH", () => {
  const lot = createTchQaLot(new Date("2026-10-13T12:00:00.000Z"));
  assert.equal(lot.id, QA_TCH_LOT_ID);
  assert.equal(lot.farmCode, "000");
  assert.equal(lot.lot, "00");
  assert.equal(lot.qaOnly, true);
  assert.equal(lot.plantingDate, "2026-04-13");
  assert.equal(lot.area, 1);
  assert.ok(Object.isFrozen(lot));
});

test("QA acepta GPS real válido en cualquier lugar, sin comparar con polígono", () => {
  for (const [latitude, longitude, gpsAccuracyM] of [[12.12, -86.29, 100], [11.54, -85.85, 5], [0, 0, 1000], [-45.1, 170.2, 30]]) {
    const reading = { latitude, longitude, gpsAccuracyM, capturedAt: "2026-10-13T12:00:00.000Z" };
    assert.equal(validTchQaGpsReading(reading), true);
    assert.equal(validateTchQaGpsReading(reading).status, "inside");
  }
});

test("QA rechaza ubicaciones faltantes, imposibles y sin fecha: no fabrica GPS", () => {
  for (const reading of [
    {}, { latitude: null, longitude: -86, gpsAccuracyM: 10, capturedAt: "2026-10-13T12:00:00Z" },
    { latitude: 91, longitude: 0, gpsAccuracyM: 10, capturedAt: "2026-10-13T12:00:00Z" },
    { latitude: 12, longitude: -181, gpsAccuracyM: 10, capturedAt: "2026-10-13T12:00:00Z" },
    { latitude: 12, longitude: -86, gpsAccuracyM: 0, capturedAt: "2026-10-13T12:00:00Z" },
    { latitude: 12, longitude: -86, gpsAccuracyM: 10, capturedAt: "" },
  ]) {
    assert.equal(validTchQaGpsReading(reading), false);
    assert.equal(validateTchQaGpsReading(reading).status, "confirm");
  }
});
