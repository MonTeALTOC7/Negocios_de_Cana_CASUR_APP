import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BIOMETRY_DRAFT_KEY,
  BIOMETRY_DRAFT_VERSION,
  countCapturedBiometryPoints,
  createBiometryDraft,
  discardBiometryDraft,
  inspectBiometryDraft,
  loadBiometryDraft,
  persistBiometryDraft,
} from "../js/biometry-draft.js";
import { persistBiometryCheckpoint } from "../js/biometry-session.js";

function biometry(overrides = {}) {
  return {
    date: "2026-10-09", technician: "Ana", rowSpacingM: 1.65, sampleLengthM: 5,
    targetAgeMonths: 10, adjustmentPct: 5, adjustmentReason: "Criterio técnico",
    notes: "", search: "759 · Jesús María · Suerte 1", phase: "measure",
    samples: [{ id: "p01", pointCode: "P01", stalkCount: 50, heightM: 2.4, diameterMm: 26, latitude: 11.2 }],
    activeSampleId: "p01", validation: { validated: false, validatedAt: "", validatedBy: "" },
    ...overrides,
  };
}

function fakeRepository() {
  const rows = new Map();
  const writes = [];
  return {
    rows, writes,
    async get(store, key) { return rows.get(`${store}:${key}`); },
    async put(store, value) { writes.push({ operation: "put", store, value }); rows.set(`${store}:${value.key || value.id}`, value); },
    async delete(store, key) { writes.push({ operation: "delete", store, key }); rows.delete(`${store}:${key}`); },
  };
}

function sourceBetween(source, start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
}

test("no crea borrador vacío ni por seleccionar una suerte sin cambios", () => {
  assert.equal(createBiometryDraft({ lotId: "759", biometry: biometry(), dirty: false }), null);
  assert.equal(createBiometryDraft({ lotId: "", biometry: biometry(), dirty: true }), null);
});

test("P01 crea un borrador v1 completo con la clave independiente", async () => {
  const repo = fakeRepository();
  const draft = createBiometryDraft({ lotId: "759", biometry: biometry(), dirty: true, updatedAt: "T1" });
  assert.equal(BIOMETRY_DRAFT_KEY, "draft:biometry:v1");
  assert.equal(draft.version, BIOMETRY_DRAFT_VERSION);
  await persistBiometryDraft(repo, draft);
  assert.deepEqual(await loadBiometryDraft(repo), draft);
  assert.deepEqual(repo.writes.map((item) => item.store), ["settings"]);
});

test("autosaves sucesivos sobrescriben la misma clave", async () => {
  const repo = fakeRepository();
  await persistBiometryDraft(repo, createBiometryDraft({ lotId: "759", biometry: biometry(), dirty: true, updatedAt: "T1" }));
  await persistBiometryDraft(repo, createBiometryDraft({ lotId: "759", biometry: biometry({ notes: "segundo" }), dirty: true, updatedAt: "T2" }));
  assert.equal(repo.rows.size, 1);
  assert.equal((await loadBiometryDraft(repo)).biometry.notes, "segundo");
});

test("conserva suerte, IDs de sesión y todos los datos capturados", () => {
  const source = biometry({
    activeSampleId: "p02", phase: "calculate", notes: "nota", adjustmentPct: 7,
    samples: [
      { id: "p01", pointCode: "P01", stalkCount: 40, heightM: 2.2, diameterMm: 24 },
      { id: "p02", pointCode: "P02", directStalksPerMeter: 9, weighingEnabled: true, weighedStalkCount: 8, weighedTotalKg: 10.2, latitude: 11, longitude: -85, notes: "gps" },
    ],
    validation: { validated: true, validatedAt: "T0", validatedBy: "Ana" },
  });
  const draft = createBiometryDraft({ lotId: "759", activeBiometryId: "bio-1", editingBiometryId: "bio-1", biometry: source, dirty: true, updatedAt: "T1" });
  assert.equal(draft.lotId, "759");
  assert.equal(draft.activeBiometryId, "bio-1");
  assert.equal(draft.editingBiometryId, "bio-1");
  assert.deepEqual(draft.biometry, source);
});

test("el borrador es copia profunda y no contiene una copia del maestro", () => {
  const source = biometry();
  const draft = createBiometryDraft({ lotId: "759", biometry: source, dirty: true });
  source.samples[0].stalkCount = 999;
  assert.equal(draft.biometry.samples[0].stalkCount, 50);
  assert.equal(Object.hasOwn(draft, "master"), false);
  assert.equal(Object.hasOwn(draft, "lot"), false);
});

test("restaura un borrador válido y protege uno cuya suerte falta", () => {
  const raw = createBiometryDraft({ lotId: "759", activeBiometryId: "bio-1", biometry: biometry(), dirty: true });
  const valid = inspectBiometryDraft(raw, [{ id: "759", producer: "Jesús María" }]);
  assert.equal(valid.status, "valid");
  assert.equal(valid.lot.id, "759");
  valid.draft.biometry.samples[0].stalkCount = 0;
  assert.equal(raw.biometry.samples[0].stalkCount, 50);
  const missing = inspectBiometryDraft(raw, []);
  assert.equal(missing.status, "lot-missing");
  assert.equal(missing.draft.lotId, "759");
});

test("descartar elimina solo la clave de borrador", async () => {
  const repo = fakeRepository();
  repo.rows.set(`settings:${BIOMETRY_DRAFT_KEY}`, { key: BIOMETRY_DRAFT_KEY, value: {} });
  await discardBiometryDraft(repo);
  assert.equal(await loadBiometryDraft(repo), null);
  assert.deepEqual(repo.writes, [{ operation: "delete", store: "settings", key: BIOMETRY_DRAFT_KEY }]);
});

test("guardar oficialmente limpia el borrador y P04 puede recrearlo sin cambiar el ID activo", async () => {
  const repo = fakeRepository();
  const draft = createBiometryDraft({ lotId: "759", biometry: biometry(), dirty: true, updatedAt: "T1" });
  await persistBiometryDraft(repo, draft);
  const officialRepo = { async put(store, value) { repo.writes.push({ operation: "put", store, value }); } };
  const checkpoint = await persistBiometryCheckpoint({
    repository: officialRepo, records: [], activeBiometryId: "", selectedLotId: "759",
    makeId: () => "bio-1", nowIso: "T2", recordData: { lotId: "759", date: "2026-10-09", time: "08:00", samples: [] },
  });
  await discardBiometryDraft(repo);
  assert.equal(await loadBiometryDraft(repo), null);
  const p04 = createBiometryDraft({ lotId: "759", activeBiometryId: checkpoint.activeBiometryId, biometry: biometry({ activeSampleId: "p04", samples: [{ id: "p04", pointCode: "P04" }] }), dirty: true, updatedAt: "T3" });
  await persistBiometryDraft(repo, p04);
  assert.equal((await loadBiometryDraft(repo)).activeBiometryId, "bio-1");
  assert.equal(repo.writes.filter((item) => item.store === "biometries").length, 1);
});

test("recuperar activeBiometryId actualiza el mismo registro oficial", async () => {
  const repo = fakeRepository();
  const prior = { id: "bio-1", lotId: "759", createdAt: "T1", revision: 0, time: "08:00" };
  const checkpoint = await persistBiometryCheckpoint({
    repository: repo, records: [prior], activeBiometryId: "bio-1", selectedLotId: "759",
    makeId: () => "no-usar", nowIso: "T2", recordData: { lotId: "759", date: "2026-10-09", time: "09:00" },
  });
  assert.equal(checkpoint.record.id, "bio-1");
  assert.equal(checkpoint.records.length, 1);
  assert.equal(checkpoint.record.revision, 1);
});

test("guardar el borrador jamás escribe biometrías ni datos oficiales", async () => {
  const repo = fakeRepository();
  await persistBiometryDraft(repo, createBiometryDraft({ lotId: "759", biometry: biometry(), dirty: true }));
  assert.deepEqual(new Set(repo.writes.map((item) => item.store)), new Set(["settings"]));
});

test("el esquema superior del borrador contiene solo los campos normativos", () => {
  const draft = createBiometryDraft({ lotId: "759", activeBiometryId: "bio-1", editingBiometryId: "bio-1", biometry: biometry(), dirty: true, updatedAt: "T1" });
  assert.deepEqual(Object.keys(draft), ["version", "updatedAt", "lotId", "activeBiometryId", "editingBiometryId", "biometry"]);
});

test("no asigna ID, revisión ni timestamps oficiales al borrador", () => {
  const draft = createBiometryDraft({ lotId: "759", biometry: biometry(), dirty: true, updatedAt: "T1" });
  for (const field of ["id", "revision", "createdAt", "time"]) assert.equal(Object.hasOwn(draft, field), false);
});

test("conserva el punto activo exacto", () => {
  const draft = createBiometryDraft({ lotId: "759", biometry: biometry({ activeSampleId: "p02", samples: [{ id: "p01" }, { id: "p02" }] }), dirty: true });
  assert.equal(draft.biometry.activeSampleId, "p02");
});

test("conserva la fase de cálculo", () => {
  const draft = createBiometryDraft({ lotId: "759", biometry: biometry({ phase: "calculate" }), dirty: true });
  assert.equal(draft.biometry.phase, "calculate");
});

test("conserva el pesaje opcional del punto", () => {
  const source = biometry({ samples: [{ id: "p01", weighingEnabled: true, weighedStalkCount: 7, weighedTotalKg: 9.4 }], activeSampleId: "p01" });
  const draft = createBiometryDraft({ lotId: "759", biometry: source, dirty: true });
  assert.deepEqual(draft.biometry.samples[0], source.samples[0]);
});

test("conserva GPS y hora de captura del punto", () => {
  const source = biometry({ samples: [{ id: "p01", latitude: 11.2, longitude: -85.7, gpsAccuracyM: 8, capturedAt: "T0" }], activeSampleId: "p01" });
  const draft = createBiometryDraft({ lotId: "759", biometry: source, dirty: true });
  assert.equal(draft.biometry.samples[0].capturedAt, "T0");
  assert.equal(draft.biometry.samples[0].longitude, -85.7);
});

test("el borrador conserva la opción GPS automática de la sesión", () => {
  const draft = createBiometryDraft({ lotId: "759", biometry: biometry({ autoGpsEnabled: true }), dirty: true });
  assert.equal(draft.biometry.autoGpsEnabled, true);
});

test("el borrador conserva el bloqueo de suerte y el intento GPS automático del punto", () => {
  const draft = createBiometryDraft({ lotId: "759", biometry: biometry({
    lotLocked: true, samples: [{ id: "p01", stalkCount: "", gpsAutoAttempted: true }], activeSampleId: "p01",
  }), dirty: true });
  assert.equal(draft.biometry.lotLocked, true);
  assert.equal(draft.biometry.samples[0].gpsAutoAttempted, true);
});

test("conserva notas generales y por punto", () => {
  const source = biometry({ notes: "general", samples: [{ id: "p01", notes: "punto" }], activeSampleId: "p01" });
  const draft = createBiometryDraft({ lotId: "759", biometry: source, dirty: true });
  assert.equal(draft.biometry.notes, "general");
  assert.equal(draft.biometry.samples[0].notes, "punto");
});

test("conserva validación sin convertirla en registro oficial", () => {
  const validation = { validated: true, validatedAt: "T0", validatedBy: "Ana" };
  const draft = createBiometryDraft({ lotId: "759", biometry: biometry({ validation }), dirty: true });
  assert.deepEqual(draft.biometry.validation, validation);
  assert.equal(Object.hasOwn(draft, "validated"), false);
});

test("rechaza forma inválida sin borrarla", () => {
  const raw = { version: 1, lotId: "759", biometry: { phase: "measure", samples: [{ id: "p01" }], activeSampleId: "otro" } };
  const result = inspectBiometryDraft(raw, [{ id: "759" }]);
  assert.equal(result.status, "invalid");
  assert.deepEqual(result.draft, raw);
});

test("protege una versión futura sin interpretarla", () => {
  const raw = { version: 2, lotId: "759", biometry: {} };
  const result = inspectBiometryDraft(raw, [{ id: "759" }]);
  assert.equal(result.status, "unsupported");
  assert.deepEqual(result.draft, raw);
});

test("dos sesiones legítimas pueden conservar contextos independientes", () => {
  const first = createBiometryDraft({ lotId: "759", activeBiometryId: "bio-1", biometry: biometry({ date: "2026-10-09" }), dirty: true, updatedAt: "T1" });
  const second = createBiometryDraft({ lotId: "759", activeBiometryId: "bio-2", biometry: biometry({ date: "2026-10-09" }), dirty: true, updatedAt: "T2" });
  assert.notEqual(first.activeBiometryId, second.activeBiometryId);
  assert.notEqual(first.updatedAt, second.updatedAt);
});

test("la tarjeta ignora puntos vacíos al contar capturas", () => {
  assert.equal(countCapturedBiometryPoints([
    { id: "p01", pointCode: "P01", stalkCount: "", latitude: null, notes: "" },
    { id: "p02", pointCode: "P02" },
  ]), 0);
});

test("la tarjeta cuenta únicamente puntos con datos reales", () => {
  assert.equal(countCapturedBiometryPoints([
    { id: "p01", stalkCount: "" },
    { id: "p02", stalkCount: 0 },
    { id: "p03", latitude: 11.2 },
    { id: "p04", notes: "observación" },
  ]), 3);
});

test("cargar un borrador válido no restaura la suerte ni la sesión global", () => {
  const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  const loadState = sourceBetween(app, "async function loadState()", "function go(route)");
  assert.match(loadState, /resetBiometry\(\);[^]*resetWeighing\(\);[^]*resetVisit\(\);/);
  assert.match(loadState, /state\.biometryDraftStatus = draftInspection\.status === "empty" \? "idle" : "protected"/);
  assert.doesNotMatch(loadState, /restoreBiometryDraft\(/);
});

test("Visitas inicia sin una suerte heredada del borrador", () => {
  const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  const resetVisit = sourceBetween(app, "function resetVisit()", "async function loadState()");
  const go = sourceBetween(app, "function go(route)", "function latestByLot(records)");
  assert.match(resetVisit, /state\.selectedLot = null/);
  assert.doesNotMatch(go, /restoreBiometryDraft\(/);
});

test("navegar por otros módulos conserva protegido el borrador", () => {
  const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  const go = sourceBetween(app, "function go(route)", "function latestByLot(records)");
  assert.doesNotMatch(go, /clearBiometryDraft|discardBiometryDraft/);
});

test("Continuar recupera el borrador mediante la entrada explícita", () => {
  const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(app, /button\.id === "continueBiometryDraft" \|\| button\.id === "continuePendingBiometry"[^]*openBiometryRoute\(\)/);
});

test("entrar a Biometría restaura el borrador y sus IDs", () => {
  const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  const openRoute = sourceBetween(app, "function openBiometryRoute()", 'app.addEventListener("click"');
  assert.match(openRoute, /restoreBiometryDraft\(inspection\)/);
  assert.match(app, /state\.activeBiometryId = inspection\.draft\.activeBiometryId/);
  assert.match(app, /state\.editingBiometryId = inspection\.draft\.editingBiometryId/);
});

test("la integración usa debounce y flush de ciclo de vida", () => {
  const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(app, /setTimeout\(\(\) => \{ void flushBiometryDraft\(\); \}, 500\)/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /pagehide/);
  assert.doesNotMatch(app, /beforeunload[^\n]*flushBiometryDraft/);
});

test("expone bridge v1 y su checkpoint espera el flush del borrador", () => {
  const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  const bridge = sourceBetween(app, "window.CASUR_MODULE_BRIDGE", "function scheduleBiometryDraftSave");
  assert.match(bridge, /Object\.freeze/);
  assert.match(bridge, /protocolVersion: 1/);
  assert.match(bridge, /moduleId: "tch"/);
  assert.match(bridge, /async checkpoint\(\{ reason \} = \{\}\)/);
  assert.match(bridge, /return flushBiometryDraft\(\)/);
  const flush = sourceBetween(app, "async function flushBiometryDraft", "window.CASUR_MODULE_BRIDGE");
  assert.match(flush, /if \(!state\.biometryDirty\) return \{ ok: true, status: "noop" \}/);
  assert.match(flush, /await persistBiometryDraft\(repository, draft\)/);
  assert.match(flush, /status: "saved", updatedAt: draft\.updatedAt/);
  assert.match(flush, /status: "error"/);
});

test("todas las entradas para nueva biometría pasan por el guard central", () => {
  const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(app, /requestNewBiometry\(\{ type: "new" \}\)/);
  assert.match(app, /requestNewBiometry\(\{ type: "new", lotId: lot\.id \}\)/);
  assert.match(app, /requestNewBiometry\(\{ type: "visit", lotId: state\.selectedLot\.id \}\)/);
  assert.match(app, /requestNewBiometry\(\{ type: "edit", recordId: record\.id \}\)/);
  assert.match(app, /button\.dataset\.route === "biometry"[^]*openBiometryRoute\(\)/);
});

test("IndexedDB continúa en v3 y el borrador usa settings", () => {
  const storage = readFileSync(new URL("../js/storage.js", import.meta.url), "utf8");
  const draftSource = readFileSync(new URL("../js/biometry-draft.js", import.meta.url), "utf8");
  assert.match(storage, /const DB_VERSION = 3;/);
  assert.match(draftSource, /repository\.put\("settings"/);
  assert.doesNotMatch(draftSource, /repository\.put\("biometries"/);
});

test("el bridge TCH expone contexto solo para una suerte realmente visible", () => {
  const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  const resolver = sourceBetween(app, "function lotModuleContext", "window.CASUR_MODULE_BRIDGE");
  const bridge = sourceBetween(app, "window.CASUR_MODULE_BRIDGE", "function scheduleBiometryDraftSave");
  assert.match(bridge, /protocolVersion: 1/);
  assert.match(bridge, /moduleId: "tch"/);
  assert.match(bridge, /getActiveContext\(\)[^]*getActiveModuleContext\(\)/);
  assert.match(resolver, /\["biometry", "weighing"\]\.includes\(state\.route\)/);
  assert.match(resolver, /state\.route === "visits" && state\.visitView === "new"/);
  assert.match(resolver, /state\.route === "analytics" && state\.consultationLotId/);
  assert.match(resolver, /state\.master\.find\(\(lot\) => lot\.id === state\.consultationLotId\)/);
  assert.match(resolver, /return null;/);
  assert.doesNotMatch(resolver, /biometryDraft|masterQuery|consultationQuery|latestBiometry/);
});
