export const BIOMETRY_DRAFT_KEY = "draft:biometry:v1";
export const BIOMETRY_DRAFT_VERSION = 1;

const BIOMETRY_FIELDS = [
  "date", "technician", "rowSpacingM", "sampleLengthM", "targetAgeMonths",
  "adjustmentPct", "adjustmentReason", "notes", "search", "phase", "samples",
  "activeSampleId", "validation", "autoGpsEnabled", "lotLocked",
];

const BIOMETRY_SAMPLE_DATA_FIELDS = [
  "stalkCount", "directStalksPerMeter", "heightM", "diameterMm",
  "lengthCm", "diameterCm", "weighedStalkCount", "weighedTotalKg",
  "latitude", "notes",
];

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function draftBiometry(biometry) {
  return Object.fromEntries(BIOMETRY_FIELDS
    .filter((field) => Object.hasOwn(biometry || {}, field))
    .map((field) => [field, clone(biometry[field])]));
}

export function biometrySampleHasData(sample = {}) {
  return BIOMETRY_SAMPLE_DATA_FIELDS
    .some((field) => sample[field] !== "" && sample[field] !== null && sample[field] !== undefined);
}

export function countCapturedBiometryPoints(samples = []) {
  return Array.isArray(samples) ? samples.filter(biometrySampleHasData).length : 0;
}

export function createBiometryDraft({
  lotId,
  activeBiometryId = "",
  editingBiometryId = "",
  biometry,
  dirty = false,
  updatedAt = new Date().toISOString(),
} = {}) {
  if (!dirty || !lotId || !biometry || !Array.isArray(biometry.samples)) return null;
  return {
    version: BIOMETRY_DRAFT_VERSION,
    updatedAt,
    lotId,
    activeBiometryId: activeBiometryId || "",
    editingBiometryId: editingBiometryId || "",
    biometry: draftBiometry(biometry),
  };
}

export function inspectBiometryDraft(raw, master = []) {
  if (!raw) return { status: "empty", draft: null, lot: null };
  const draft = clone(raw);
  if (draft.version !== BIOMETRY_DRAFT_VERSION) return { status: "unsupported", draft, lot: null };
  const validShape = typeof draft.lotId === "string" && draft.lotId &&
    draft.biometry && Array.isArray(draft.biometry.samples) && draft.biometry.samples.length > 0 &&
    ["measure", "calculate"].includes(draft.biometry.phase) &&
    draft.biometry.samples.some((sample) => sample.id === draft.biometry.activeSampleId);
  if (!validShape) return { status: "invalid", draft, lot: null };
  const lot = master.find((item) => item.id === draft.lotId) || null;
  return { status: lot ? "valid" : "lot-missing", draft, lot };
}

export async function loadBiometryDraft(repository) {
  const row = await repository.get("settings", BIOMETRY_DRAFT_KEY);
  return row?.value ? clone(row.value) : null;
}

export async function persistBiometryDraft(repository, draft) {
  if (!draft) return null;
  await repository.put("settings", { key: BIOMETRY_DRAFT_KEY, value: clone(draft) });
  return draft;
}

export async function discardBiometryDraft(repository) {
  await repository.delete("settings", BIOMETRY_DRAFT_KEY);
}
