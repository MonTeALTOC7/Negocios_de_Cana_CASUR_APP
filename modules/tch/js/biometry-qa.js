/** Fixture deliberadamente sintético. Nunca forma parte del Maestro CASUR oficial. */
export const QA_TCH_GPS_PARAM = "tch-gps-000";
export const QA_TCH_LOT_ID = "QA-000-00";

export function isTchGpsQaMode(search = "") {
  return new URLSearchParams(search).get("qa") === QA_TCH_GPS_PARAM;
}

/** Edad operativa ficticia de seis meses, usada únicamente para ejercitar la proyección. */
export function createTchQaLot(today = new Date()) {
  const base = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 6, Math.min(today.getUTCDate(), 28)));
  return Object.freeze({
    id: QA_TCH_LOT_ID,
    farmCode: "000",
    producer: "HACIENDA 000 · SOLO PRUEBAS",
    lot: "00",
    area: 1,
    variety: "PRUEBA (no agronómica)",
    rowSpacingM: 1.65,
    plantingDate: base.toISOString().slice(0, 10),
    lastCutDate: "",
    zone: "QA · NO OFICIAL",
    tenureCode: "",
    tenureLabel: "PRUEBA",
    irrigation: "Sin clasificación",
    historicalTch: null,
    latestSeasonTch: null,
    estimatedTch2627: null,
    qaOnly: true,
  });
}

/** QA exige GPS real y trazable, pero acepta cualquier ubicación geográfica y precisión positiva. */
export function validTchQaGpsReading(reading) {
  if (reading?.latitude == null || reading.latitude === ""
      || reading?.longitude == null || reading.longitude === ""
      || reading?.gpsAccuracyM == null || reading.gpsAccuracyM === "") return false;
  const latitude = Number(reading.latitude);
  const longitude = Number(reading.longitude);
  const accuracy = Number(reading.gpsAccuracyM);
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
    && Number.isFinite(accuracy) && accuracy > 0
    && typeof reading.capturedAt === "string" && Number.isFinite(Date.parse(reading.capturedAt));
}

export function validateTchQaGpsReading(reading) {
  return validTchQaGpsReading(reading)
    ? { status: "inside", reason: "qa-no-geofence" }
    : { status: "confirm", reason: "invalid" };
}
