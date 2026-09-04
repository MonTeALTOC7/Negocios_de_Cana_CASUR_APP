export const FORMULA_FACTOR = 0.007854;

export function finiteNumber(value) {
  const parsed = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function biometricInputs(input = {}) {
  const heightM = finiteNumber(input.heightM) > 0
    ? finiteNumber(input.heightM)
    : finiteNumber(input.lengthCm) > 0 ? finiteNumber(input.lengthCm) / 100 : 0;
  const diameterMm = finiteNumber(input.diameterMm) > 0
    ? finiteNumber(input.diameterMm)
    : finiteNumber(input.diameterCm) > 0 ? finiteNumber(input.diameterCm) * 10 : 0;
  return { heightM, diameterMm };
}

export function tchVolumetric(input = {}) {
  const { heightM, diameterMm } = biometricInputs(input);
  const population = finiteNumber(input.stalksPerMeter);
  const spacing = finiteNumber(input.rowSpacingM);
  if (heightM <= 0 || diameterMm <= 0 || population <= 0 || spacing <= 0) return null;
  return (diameterMm ** 2 * heightM * population * FORMULA_FACTOR) / spacing;
}

export function stalksPerMeter({ sampleLengthM, stalkCount, directStalksPerMeter }) {
  const direct = finiteNumber(directStalksPerMeter);
  if (direct > 0) return direct;
  const length = finiteNumber(sampleLengthM);
  const count = finiteNumber(stalkCount);
  return length > 0 && count > 0 ? count / length : null;
}

export function averageStalkWeightKg({ weighedStalkCount, weighedTotalKg, averageStalkWeightKg }) {
  const direct = finiteNumber(averageStalkWeightKg);
  if (direct > 0) return direct;
  const count = finiteNumber(weighedStalkCount);
  const total = finiteNumber(weighedTotalKg);
  return count > 0 && total > 0 ? total / count : null;
}

export function tchProjection({ biometricTch, currentAgeMonths, targetAgeMonths, adjustmentPct }) {
  const tch = finiteNumber(biometricTch);
  const currentAge = finiteNumber(currentAgeMonths);
  const targetAge = finiteNumber(targetAgeMonths);
  const adjustment = finiteNumber(adjustmentPct);
  if (tch <= 0 || currentAge <= 0 || targetAge <= 0 || adjustment < 0 || adjustment >= 100) return null;
  return (tch / currentAge) * targetAge * (1 - adjustment / 100);
}

export function tchFullRowWeight({ totalWeightKg, sampleLengthM, rowSpacingM }) {
  const weight = finiteNumber(totalWeightKg);
  const length = finiteNumber(sampleLengthM);
  const spacing = finiteNumber(rowSpacingM);
  if (weight <= 0 || length <= 0 || spacing <= 0) return null;
  return (weight * 10) / (length * spacing);
}

export function tchAverageStalkWeight({ stalksPerMeter: population, averageStalkWeightKg: weight, rowSpacingM }) {
  const stalks = finiteNumber(population);
  const avgWeight = finiteNumber(weight);
  const spacing = finiteNumber(rowSpacingM);
  if (stalks <= 0 || avgWeight <= 0 || spacing <= 0) return null;
  return (stalks * avgWeight * 10) / spacing;
}

export function sampleTch(sample, defaultSpacing) {
  const population = stalksPerMeter(sample);
  return tchVolumetric({
    heightM: sample.heightM,
    diameterMm: sample.diameterMm,
    // Compatibilidad v2.3.0:
    lengthCm: sample.lengthCm,
    diameterCm: sample.diameterCm,
    stalksPerMeter: population,
    rowSpacingM: sample.rowSpacingM || defaultSpacing,
  });
}

export function sampleWeightTch(sample, defaultSpacing) {
  const population = stalksPerMeter(sample);
  const weight = averageStalkWeightKg(sample);
  return tchAverageStalkWeight({
    stalksPerMeter: population,
    averageStalkWeightKg: weight,
    rowSpacingM: sample.rowSpacingM || defaultSpacing,
  });
}

export function stats(values) {
  const clean = values.map(finiteNumber).filter((value) => value > 0 && Number.isFinite(value));
  if (!clean.length) return { count: 0, mean: 0, min: 0, max: 0, sd: 0, cv: 0 };
  const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length;
  const variance = clean.length > 1
    ? clean.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (clean.length - 1)
    : 0;
  const sd = Math.sqrt(variance);
  return {
    count: clean.length,
    mean,
    min: Math.min(...clean),
    max: Math.max(...clean),
    sd,
    cv: mean > 0 ? (sd / mean) * 100 : 0,
  };
}

export function samplingQuality(samples, summary) {
  const complete = samples.filter((sample) => sampleTch(sample, sample.rowSpacingM) !== null);
  const gpsCount = complete.filter((sample) => finiteNumber(sample.gpsAccuracyM) > 0).length;
  const poorGps = complete.some((sample) => finiteNumber(sample.gpsAccuracyM) > 30);
  const missingCodes = complete.some((sample) => !sample.pointCode);
  let score = 0;
  if (summary.count >= 5) score += 2;
  else if (summary.count >= 3) score += 1;
  if (summary.count > 1 && summary.cv > 0 && summary.cv <= 15) score += 2;
  else if (summary.count > 1 && summary.cv <= 25) score += 1;
  if (gpsCount >= Math.min(3, complete.length) && !poorGps && complete.length) score += 1;
  if (!missingCodes && complete.length) score += 1;
  if (summary.count <= 1) return "Baja";
  return score >= 5 ? "Alta" : score >= 3 ? "Media" : "Baja";
}

export function parseDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
  if (typeof value === "number" && globalThis.XLSX?.SSF) {
    const parsed = globalThis.XLSX.SSF.parse_date_code(value);
    if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d, 12);
  }
  const normalized = String(value).slice(0, 10);
  const date = new Date(`${normalized}T12:00:00`);
  return Number.isNaN(date.valueOf()) ? null : date;
}

export function dateISO(value) {
  const date = parseDateOnly(value);
  if (!date) return "";
  const local = new Date(date.valueOf() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function todayISO() {
  return dateISO(new Date());
}

export function ageFromLot(lot, onDate = todayISO()) {
  if (!lot) return { months: null, baseDate: "", source: "Edad no disponible" };
  const candidates = [
    { date: parseDateOnly(lot.plantingDate), source: "Siembra" },
    { date: parseDateOnly(lot.lastCutDate), source: "Último corte" },
  ].filter((item) => item.date);
  if (!candidates.length) return { months: null, baseDate: "", source: "Edad no disponible" };
  candidates.sort((a, b) => a.date - b.date);
  const base = candidates.at(-1);
  const evaluation = parseDateOnly(onDate);
  if (!evaluation || evaluation < base.date) return { months: null, baseDate: dateISO(base.date), source: base.source };
  const months = (evaluation.valueOf() - base.date.valueOf()) / 86400000 / 30.4375;
  return { months, baseDate: dateISO(base.date), source: base.source };
}

export function weightedMean(items, valueKey, weightKey = "area") {
  const valid = items.filter((item) => finiteNumber(item[valueKey]) > 0 && finiteNumber(item[weightKey]) > 0);
  const denominator = valid.reduce((sum, item) => sum + finiteNumber(item[weightKey]), 0);
  return denominator > 0
    ? valid.reduce((sum, item) => sum + finiteNumber(item[valueKey]) * finiteNumber(item[weightKey]), 0) / denominator
    : 0;
}

export function comparisonPct(a, b) {
  const first = finiteNumber(a);
  const second = finiteNumber(b);
  return first > 0 && second > 0 ? ((second - first) / first) * 100 : null;
}

export function formatNumber(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("es-NI", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(number);
}

export function createId(prefix = "rec") {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
