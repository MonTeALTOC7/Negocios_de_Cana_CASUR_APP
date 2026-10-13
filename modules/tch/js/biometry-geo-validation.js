/** Umbral operativo inicial: lecturas con incertidumbre mayor requieren reintento. */
export const MAX_BIOMETRY_GPS_ACCURACY_M = 20;

const RADIUS_M = 6371008.8;

function projected(point, latitude) {
  const radians = Math.PI / 180;
  return [point[0] * radians * RADIUS_M * Math.cos(latitude * radians), point[1] * radians * RADIUS_M];
}

function ringContains(ring, longitude, latitude) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > latitude) !== (yj > latitude)
        && longitude < (xj - xi) * (latitude - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function ringDistanceMeters(ring, longitude, latitude) {
  const origin = projected([longitude, latitude], latitude);
  let nearest = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = projected(ring[i], latitude);
    const b = projected(ring[(i + 1) % ring.length], latitude);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1, ((origin[0] - a[0]) * dx + (origin[1] - a[1]) * dy) / lengthSquared)) : 0;
    nearest = Math.min(nearest, Math.hypot(origin[0] - a[0] - t * dx, origin[1] - a[1] - t * dy));
  }
  return nearest;
}

/** Validates against the exact Polygon/MultiPolygon rings, including holes and fragments. */
export function validateBiometryGpsPosition(reading, feature) {
  const latitude = Number(reading?.latitude);
  const longitude = Number(reading?.longitude);
  const accuracyM = Number(reading?.gpsAccuracyM);
  if (reading?.latitude == null || reading.latitude === "" || reading?.longitude == null || reading.longitude === ""
      || !Number.isFinite(latitude) || !Number.isFinite(longitude)
      || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
      || reading?.gpsAccuracyM == null || reading.gpsAccuracyM === "" || !Number.isFinite(accuracyM) || accuracyM <= 0) {
    return { status: "confirm", reason: "invalid" };
  }
  const geometry = feature?.geometry;
  const polygons = geometry?.type === "Polygon" ? [geometry.coordinates]
    : geometry?.type === "MultiPolygon" ? geometry.coordinates : [];
  if (!polygons.length) return { status: "confirm", reason: "geometry-unavailable" };
  let inside = false;
  let distanceToBoundaryM = Infinity;
  for (const rings of polygons) {
    if (!Array.isArray(rings) || !rings.length || rings.some((ring) => !Array.isArray(ring) || ring.length < 3
      || ring.some((point) => !Array.isArray(point) || point.length < 2 || !point.slice(0, 2).every(Number.isFinite)))) {
      return { status: "confirm", reason: "geometry-unavailable" };
    }
    if (ringContains(rings[0], longitude, latitude)
        && !rings.slice(1).some((hole) => ringContains(hole, longitude, latitude))) inside = true;
    for (const ring of rings) distanceToBoundaryM = Math.min(distanceToBoundaryM, ringDistanceMeters(ring, longitude, latitude));
  }
  if (accuracyM > MAX_BIOMETRY_GPS_ACCURACY_M || distanceToBoundaryM <= accuracyM) {
    return { status: "confirm", reason: accuracyM > MAX_BIOMETRY_GPS_ACCURACY_M ? "accuracy" : "boundary", distanceToBoundaryM };
  }
  return { status: inside ? "inside" : "outside", distanceToBoundaryM };
}

/** Receives only points included in the biometric calculation; never mutates measurements. */
export function pendingBiometryGpsPoints(completedSamples, feature) {
  return completedSamples.filter((sample) => validateBiometryGpsPosition(sample, feature).status !== "inside");
}

const CALCULATION_FIELDS = ["stalkCount", "directStalksPerMeter", "heightM", "diameterMm", "lengthCm", "diameterCm", "weighedStalkCount", "weighedTotalKg"];
const SESSION_CALCULATION_FIELDS = ["date", "rowSpacingM", "sampleLengthM", "targetAgeMonths", "adjustmentPct"];

function sameMeasurement(current, previous) {
  const currentMode = current.countMode || (Number(current.directStalksPerMeter) > 0 ? "direct" : "count");
  const previousMode = previous.countMode || (Number(previous.directStalksPerMeter) > 0 ? "direct" : "count");
  const currentWeighing = Boolean(current.weighingEnabled || current.weighedStalkCount || current.weighedTotalKg);
  const previousWeighing = Boolean(previous.weighingEnabled || previous.weighedStalkCount || previous.weighedTotalKg);
  return currentMode === previousMode && currentWeighing === previousWeighing
    && CALCULATION_FIELDS.every((field) => Number(current[field] || 0) === Number(previous[field] || 0));
}

/** Legacy observations may be edited without retroactively requiring GPS; new or changed calculations may not. */
export function gpsRequiredBiometrySamples(session, lotId, previousRecord, completedSamples) {
  if (!previousRecord || previousRecord.lotId !== lotId) return completedSamples;
  const calculationChanged = SESSION_CALCULATION_FIELDS.some((field) => field === "date"
    ? String(session[field] || "") !== String(previousRecord[field] || "")
    : Number(session[field] || 0) !== Number(previousRecord[field] || 0));
  const previousSamples = previousRecord.samples || [];
  const structureChanged = session.samples.length !== previousSamples.length;
  if (calculationChanged || (structureChanged && session.samples.length < previousSamples.length)) return completedSamples;
  return completedSamples.filter((sample) => {
    const index = session.samples.indexOf(sample);
    const previous = previousSamples.find((item) => item.id && item.id === sample.id)
      || (!previousSamples[index]?.id && previousSamples[index]?.pointCode === sample.pointCode ? previousSamples[index] : null);
    return !previous || !sameMeasurement(sample, previous);
  });
}
