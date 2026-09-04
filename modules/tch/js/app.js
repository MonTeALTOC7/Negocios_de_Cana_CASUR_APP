import { repository } from "./storage.js";
import {
  parseMasterWorkbook, masterSuggestions, auditChange, normalizeEmbeddedMaster,
  masterFingerprint, masterToEmbeddedRows, parseSeasonEstimateWorkbook, normalizeText,
} from "./master.js";
import {
  ageFromLot, averageStalkWeightKg, comparisonPct, createId, finiteNumber, formatNumber,
  sampleTch, sampleWeightTch, samplingQuality, stats, stalksPerMeter, tchAverageStalkWeight,
  tchFullRowWeight, tchProjection, todayISO, weightedMean,
} from "./tch-engine.js";
import { downloadBlob, downloadWorkbook } from "./excel.js";
import { createResultImageBlob } from "./result-image.js";
import {
  createVisitsPackageBlob, createVisitsWorkbookBlob, prepareVisitPhoto,
  snapshotPhotoFiles, visitPackageFilename, visitsExcelFilename, visitPhotoBlob,
  visitPhotoFilename, visitPhotoPreviewUrl, createLabeledVisitPhotoBlob,
} from "./visit-evidence.js";

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
const modal = document.querySelector("#modal");
const modalContent = document.querySelector("#modalContent");
const masterFile = document.querySelector("#masterFile");
const estimateFile = document.querySelector("#estimateFile");
const backupFile = document.querySelector("#backupFile");
const visitCameraFile = document.querySelector("#visitCameraFile");
const visitGalleryFile = document.querySelector("#visitGalleryFile");
const pwaInstallNotice = document.querySelector("#pwaInstallNotice");
const MASTER_PASSWORD_HASH = "6315700c5446173c02844f5fcc514d3b52e8da0ad4b31f6126049d2d8709ad34";

const state = {
  route: "home",
  master: [],
  biometries: [],
  weighings: [],
  harvests: [],
  visits: [],
  audit: [],
  settings: {},
  selectedLot: null,
  installPrompt: null,
  pendingMaster: null,
  pendingEstimateImport: null,
  pendingEstimateSourceDate: "",
  editingLot: null,
  editingBiometryId: "",
  biometry: null,
  weighing: null,
  visit: null,
  visitView: "new",
  visitQuery: "",
  visitDateFrom: "",
  visitDateTo: "",
  visitProducer: "",
  selectedVisitIds: new Set(),
  editingVisitId: "",
  visitReturnFromBiometry: false,
  historyQuery: "",
  masterQuery: "",
  consultationQuery: "",
  consultationLotId: "",
  embeddedMasterError: "",
  masterSync: { status: "idle", message: "", checkedAt: "" },
  storageEstimate: null,
};

const photoPreviewCache = new WeakMap();

function photoPreview(photo) {
  if (photo?.dataUrl) return photo.dataUrl;
  if (!(photo?.blob instanceof Blob)) return "";
  if (!photoPreviewCache.has(photo)) photoPreviewCache.set(photo, visitPhotoPreviewUrl(photo));
  return photoPreviewCache.get(photo);
}

const TARGET_AGES = [9, 9.5, 10, 10.5, 11];
const ROW_SPACING_PRESETS = [1.5, 1.65, 1.75, 1.8, 2.2];
const SAMPLE_LENGTH_PRESETS = [3, 5, 10];
const VISIT_PURPOSES = ["Inspección general", "Validación de TCH", "Aforo / biometría", "Seguimiento hídrico", "Malezas o plagas", "Pre-cosecha"];
const VISIT_CATEGORIES = {
  purpose: VISIT_PURPOSES,
  overallCondition: ["Excelente", "Buena", "Regular", "Crítica"],
  waterStatus: ["Adecuado", "Estrés leve", "Estrés moderado", "Estrés severo", "Encharcamiento"],
  weedLevel: ["Bajo", "Medio", "Alto"],
  pestLevel: ["Sin evidencia", "Leve", "Moderado", "Severo"],
};
const TCH_SOURCES = {
  none: "Sin estimación de TCH",
  visual: "Estimación visual",
  biometry: "Biometría de la app",
  gauging: "Aforo de campo",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[char]);
}

function safeFilename(value) {
  return String(value ?? "resultado").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
}

function formatDateShort(value) {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return String(value);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${String(day).padStart(2, "0")}-${months[month - 1]}-${year}`;
}

function productionComparison(lot, projected) {
  const historical = finiteNumber(lot?.historicalTch) || null;
  const latestSeason = finiteNumber(lot?.latestSeasonTch) || null;
  const estimated2627 = finiteNumber(lot?.estimatedTch2627) || null;
  const delta = (reference) => reference > 0 && projected ? ((projected - reference) / reference) * 100 : null;
  return { historical, latestSeason, estimated2627, vsHistorical: delta(historical), vsLatestSeason: delta(latestSeason), vsEstimated2627: delta(estimated2627) };
}

function notify(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove("show"), 3200);
  navigator.vibrate?.(35);
}

function field(label, input, help = "") {
  return `<label class="field"><span>${label}</span>${input}${help ? `<small class="help">${help}</small>` : ""}</label>`;
}

function categoryField(label, id, fieldName) {
  const options = VISIT_CATEGORIES[fieldName];
  const value = state.visit[fieldName] || "";
  const customName = `${fieldName}Custom`;
  const isCustom = value === "__other__" || (!options.includes(value) && Boolean(value));
  const selectValue = isCustom ? "__other__" : value;
  const customValue = state.visit[customName] || (isCustom && value !== "__other__" ? value : "");
  return field(label, `<select id="${id}" data-visit-category="${fieldName}"><option value="" ${selectValue === "" ? "selected" : ""}>Sin registrar</option>${options.map((item) => `<option value="${escapeHtml(item)}" ${selectValue === item ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}<option value="__other__" ${selectValue === "__other__" ? "selected" : ""}>Otro / escribir personalizado</option></select>${selectValue === "__other__" ? `<input class="custom-category-input" id="visitCustom_${fieldName}" data-visit-custom="${fieldName}" value="${escapeHtml(customValue)}" placeholder="Escribí el valor personalizado">` : ""}`);
}

function resolvedCategory(visit, fieldName) {
  const value = visit[fieldName] || "";
  if (value === "__other__") return String(visit[`${fieldName}Custom`] || "").trim();
  return String(value).trim();
}

function pageHead(title, subtitle) {
  return `<div class="page-head"><button class="back" data-route="home" aria-label="Volver">‹</button><div><small class="section-kicker">NEGOCIOS DE CAÑA</small><h1>${title}</h1><p>${subtitle}</p></div></div>`;
}

function emptyState(icon, title, text, action = "") {
  return `<div class="empty"><b>${icon}</b><strong>${title}</strong><p>${text}</p>${action}</div>`;
}

function openModal(html) {
  modalContent.innerHTML = html;
  modal.hidden = false;
}

function closeModal() {
  modal.hidden = true;
  modalContent.innerHTML = "";
}

async function persistSettings() {
  await repository.put("settings", { key: "app", value: state.settings });
}

async function refreshStorageEstimate() {
  try {
    if (!navigator.storage?.estimate) return;
    const estimate = await navigator.storage.estimate();
    state.storageEstimate = { usage: estimate.usage || 0, quota: estimate.quota || 0 };
  } catch { state.storageEstimate = null; }
}

function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
}

function updateInstallNotice() {
  if (!pwaInstallNotice) return;
  if (isStandalone()) {
    pwaInstallNotice.classList.remove("show");
    pwaInstallNotice.hidden = true;
    return;
  }
  pwaInstallNotice.hidden = false;
  window.setTimeout(() => pwaInstallNotice.classList.add("show"), 700);
}

async function fetchPublishedMaster() {
  let lastError = null;
  for (const path of ["./data/suertes.json", "./data/productores.json"]) {
    try {
      const response = await fetch(`${path}?actualizacion=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const lots = normalizeEmbeddedMaster(await response.json());
      if (!lots.length) throw new Error("El archivo está vacío.");
      return { lots, fingerprint: await masterFingerprint(lots), path };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`No se pudo leer el maestro publicado. ${lastError?.message || ""}`.trim());
}

async function syncPublishedMaster({ force = false, userInitiated = false } = {}) {
  state.masterSync = { status: "checking", message: "Buscando una actualización publicada…", checkedAt: state.masterSync.checkedAt };
  if (userInitiated && state.route === "master") render();
  try {
    const published = await fetchPublishedMaster();
    const localFingerprint = state.master.length ? await masterFingerprint(state.master) : "";
    const localDiffers = localFingerprint !== published.fingerprint;
    const shouldReplace = !state.master.length ||
      (localDiffers && !state.settings.masterPendingPublish) ||
      (force && localDiffers);
    if (shouldReplace) {
      await repository.replaceAll("master", published.lots);
      state.master = published.lots;
      state.editingLot = null;
      state.selectedLot = null;
      state.settings.masterPendingPublish = false;
    }
    state.settings.remoteMasterFingerprint = published.fingerprint;
    state.settings.remoteMasterCheckedAt = new Date().toISOString();
    state.settings.remoteMasterPath = published.path;
    await persistSettings();
    state.masterSync = {
      status: shouldReplace ? "updated" : "current",
      message: shouldReplace
        ? `Maestro General actualizado: ${published.lots.length} suertes.`
        : `Maestro General al día: ${published.lots.length} suertes.`,
      checkedAt: state.settings.remoteMasterCheckedAt,
    };
    if (userInitiated) notify(state.masterSync.message);
    if (state.route === "master") render();
    return shouldReplace;
  } catch (error) {
    state.masterSync = {
      status: "error",
      message: error?.message || "No se pudo comprobar la actualización.",
      checkedAt: state.settings.remoteMasterCheckedAt || "",
    };
    if (userInitiated) notify(state.masterSync.message);
    if (state.route === "master") render();
    return false;
  }
}

function githubDataUrl() {
  if (!location.hostname.endsWith(".github.io")) return "";
  const owner = location.hostname.split(".")[0];
  const repositoryName = location.pathname.split("/").filter(Boolean)[0];
  return owner && repositoryName ? `https://github.com/${owner}/${repositoryName}/tree/main/data` : "";
}

function markMasterPendingPublish() {
  state.settings.masterPendingPublish = true;
  persistSettings().catch(() => {});
}

function invalidateValidation() {
  if (!state.biometry?.validation?.validated) return;
  state.biometry.validation = { validated: false, validatedAt: "", validatedBy: "" };
}

function sampleHasData(sample) {
  return [
    sample.stalkCount, sample.directStalksPerMeter, sample.heightM, sample.diameterMm,
    sample.lengthCm, sample.diameterCm, sample.weighedStalkCount, sample.weighedTotalKg,
    sample.latitude, sample.notes,
  ].some((value) => value !== "" && value !== null && value !== undefined);
}

function newSample(index, sampleLengthM = 5) {
  return {
    id: createId("point"),
    pointCode: `P${String(index + 1).padStart(2, "0")}`,
    sampleLengthM,
    stalkCount: "",
    directStalksPerMeter: "",
    countMode: "count",
    heightM: "",
    diameterMm: "",
    // Campos v2.3 se conservan por compatibilidad al leer registros viejos.
    lengthCm: "",
    diameterCm: "",
    weighingEnabled: false,
    weighedStalkCount: "",
    weighedTotalKg: "",
    latitude: null,
    longitude: null,
    gpsAccuracyM: null,
    capturedAt: "",
    notes: "",
  };
}

function resetBiometry() {
  state.selectedLot = null;
  state.editingBiometryId = "";
  const first = newSample(0, 5);
  state.biometry = {
    date: todayISO(),
    technician: state.settings.technician || "",
    rowSpacingM: 1.65,
    sampleLengthM: 5,
    targetAgeMonths: 10,
    adjustmentPct: 5,
    adjustmentReason: "Déficit hídrico / pérdidas esperadas",
    notes: "",
    search: "",
    phase: "measure",
    samples: [first],
    activeSampleId: first.id,
    validation: { validated: false, validatedAt: "", validatedBy: "" },
  };
}

function resetWeighing() {
  state.selectedLot = null;
  state.weighing = {
    date: todayISO(),
    technician: state.settings.technician || "",
    method: "full",
    rowSpacingM: 1.65,
    sampleLengthM: 5,
    totalWeightKg: "",
    stalkCount: "",
    stalksPerMeter: "",
    averageStalkWeightKg: "",
    latitude: null,
    longitude: null,
    gpsAccuracyM: null,
    notes: "",
    search: "",
  };
}

function resetVisit() {
  state.selectedLot = null;
  state.editingVisitId = "";
  state.visit = {
    date: todayISO(),
    technician: state.settings.technician || "",
    search: "",
    purpose: "",
    purposeCustom: "",
    overallCondition: "",
    overallConditionCustom: "",
    waterStatus: "",
    waterStatusCustom: "",
    weedLevel: "",
    weedLevelCustom: "",
    pestLevel: "",
    pestLevelCustom: "",
    lodgingPct: "",
    lodgingDescription: "",
    tchSource: "none",
    estimatedTch: "",
    tchDescription: "",
    linkedBiometryId: "",
    latitude: null,
    longitude: null,
    gpsAccuracyM: null,
    capturedAt: "",
    notes: "",
    photos: [],
    photoProcessing: false,
    photoProgress: "",
    saving: false,
  };
}

async function loadState() {
  const loaded = await Promise.all([
    repository.all("master"),
    repository.all("biometries"),
    repository.all("weighings"),
    repository.all("harvests"),
    repository.all("visits"),
    repository.all("audit"),
    repository.get("settings", "app"),
  ]);
  [state.master, state.biometries, state.weighings, state.harvests, state.visits, state.audit] = loaded;
  state.settings = {
    technician: "",
    compareGoodPct: 10,
    compareReviewPct: 20,
    remoteMasterFingerprint: "",
    remoteMasterCheckedAt: "",
    remoteMasterPath: "",
    masterPendingPublish: false,
    ...(loaded[6]?.value || {}),
  };
  await syncPublishedMaster({ force: !state.master.length });
  if (!state.master.length) state.embeddedMasterError = state.masterSync.message || "No se pudo abrir el maestro integrado.";
  resetBiometry();
  resetWeighing();
  resetVisit();
  await refreshStorageEstimate();
}

function go(route) {
  state.route = route;
  if (route === "biometry" && !state.biometry) resetBiometry();
  if (route === "weighing" && !state.weighing) resetWeighing();
  if (route === "visits" && !state.visit) resetVisit();
  document.querySelectorAll("[data-route]").forEach((button) => button.classList.toggle("active", button.dataset.route === route));
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function latestByLot(records) {
  const map = new Map();
  records.slice().sort((a, b) => `${b.date}${b.time || ""}`.localeCompare(`${a.date}${a.time || ""}`)).forEach((record) => {
    if (!map.has(record.lotId)) map.set(record.lotId, record);
  });
  return [...map.values()];
}

function renderHome() {
  const latest = latestByLot(state.biometries);
  const tons = latest.reduce((sum, record) => sum + finiteNumber(record.projectedTons), 0);
  const area = latest.reduce((sum, record) => sum + finiteNumber(record.area), 0);
  const weighted = weightedMean(latest, "projectedTch", "area");
  const producerLots = state.master.filter((lot) => lot.zone === "5-Productores");
  return `
    <section class="hero">
      <span class="eyebrow">🌱 CAMPO · CASUR</span>
      <h1>Biometría TCH y evidencia técnica de cada visita</h1>
      <p>Medí la caña, proyectá el TCH y documentá el estado real de la suerte con fotografías etiquetadas, GPS e historial Excel.</p>
      <div class="actions"><button class="btn btn-primary" data-route="biometry">＋ Nueva biometría</button><button class="btn btn-gold" data-route="visits">📷 Registrar visita</button></div>
    </section>
    ${state.master.length ? "" : `<div class="warning"><b>No se pudo abrir el Maestro General integrado.</b> ${escapeHtml(state.embeddedMasterError)} Podés actualizarlo desde Maestro.</div>`}
    <section class="kpi-grid">
      <article class="kpi"><span>Maestro General</span><strong>${state.master.length}</strong><small>suertes operativas CASUR</small></article>
      <article class="kpi blue"><span>Visitas con evidencia</span><strong>${state.visits.length}</strong><small>fotografías y GPS en el teléfono</small></article>
      <article class="kpi gold"><span>TCH proyectado</span><strong>${formatNumber(weighted, 1)}</strong><small>ponderado por área evaluada</small></article>
      <article class="kpi red"><span>Toneladas</span><strong>${formatNumber(tons, 0)}</strong><small>${formatNumber(area, 1)} ha evaluadas</small></article>
    </section>
    <section class="module-grid">
      <button class="module-card primary-module" data-route="biometry"><span class="module-icon">🌱</span><span><small>OPERACIÓN PRINCIPAL</small><strong>Nueva Biometría</strong><p>Iniciá con P01 y agregá solamente los puntos que necesités.</p></span><b>›</b></button>
      <button class="module-card visit-main-module" data-route="visits"><span class="module-icon blue">📷</span><span><small>EVIDENCIA PRINCIPAL</small><strong>Visita de campo</strong><p>Fotos libres, GPS, condición agronómica, PNG etiquetado y Excel.</p></span><b>›</b></button>
      <button class="module-card" data-route="history"><span class="module-icon gold">▤</span><span><small>CONSULTA</small><strong>Historial</strong><p>Biometrías, contrastes por peso, pesajes anteriores y TCH real.</p></span><b>›</b></button>
      <button class="module-card" data-route="analytics"><span class="module-icon blue">⌕</span><span><small>CONSULTA OPERATIVA</small><strong>Cronológico de suertes</strong><p>Ficha maestra, TCH estimado Z26/27, biometrías y visitas vinculadas.</p></span><b>›</b></button>
      <button class="module-card" data-route="export"><span class="module-icon">⇩</span><span><small>ADMINISTRACIÓN</small><strong>Exportar y respaldar</strong><p>XLSX general, JSON de respaldo e información técnica.</p></span><b>›</b></button>
      <button class="module-card" data-route="master"><span class="module-icon purple">▦</span><span><small>ADMINISTRACIÓN PROTEGIDA</small><strong>Maestro General CASUR</strong><p>Actualizar desde la hoja REPORTE o editar una suerte.</p></span><b>›</b></button>
    </section>
    <section class="field-guide-strip">
      <img src="./assets/cana-azucar-real.png" alt="Caña de azúcar en campo">
      <div><strong>Guía rápida de biometría</strong><p>Tramo → POB → altura → diámetro → repetición de puntos → revisión del TCH.</p></div>
      <button class="btn btn-light guide-open" data-field-guide>Ver pasos</button>
    </section>`;
}

function searchBox(value, context) {
  return `<div class="search-wrap"><input class="search-input" id="lotSearch" data-search-context="${context}" autocomplete="off" value="${escapeHtml(value)}" placeholder="Código, hacienda o suerte…" aria-label="Buscar hacienda o suerte" aria-controls="lotSuggestions" aria-expanded="false"><div class="suggestions" id="lotSuggestions" role="listbox" hidden></div></div>`;
}

function renderSuggestions(query) {
  const box = document.querySelector("#lotSuggestions");
  if (!box) return;
  const matches = masterSuggestions(state.master, query, 40);
  const input = document.querySelector("#lotSearch");
  if (!query.trim() || !matches.length) {
    box.hidden = true;
    input?.setAttribute("aria-expanded", "false");
    return;
  }
  box.innerHTML = `<div class="suggestions-head"><b>${matches.length} resultado${matches.length === 1 ? "" : "s"}</b><span>Productores se prioriza, pero el buscador cubre todo CASUR.</span></div>${matches.map((lot) => `
    <button class="suggestion ${lot.zone === "5-Productores" ? "producer-hit" : ""}" role="option" data-select-lot="${escapeHtml(lot.id)}">
      <span class="suggestion-copy">
        <strong>${lot.zone === "5-Productores" ? "⭐ " : ""}${escapeHtml(lot.producer)}</strong>
        <b>Suerte ${escapeHtml(lot.lot)} · ${formatNumber(lot.area, 2)} ha</b>
        <small>${escapeHtml(lot.variety || "Sin variedad")} · ${escapeHtml(lot.tenureLabel || lot.tenureCode || "Sin tenencia")} · ${escapeHtml(lot.zone || "Sin zona")}</small>
      </span>
      <span class="code-pill">${escapeHtml(lot.id)}</span>
    </button>`).join("")}`;
  box.hidden = false;
  input?.setAttribute("aria-expanded", "true");
}

function selectedLotPanel(lot, date) {
  if (!lot) return "";
  const age = ageFromLot(lot, date);
  return `<section class="active-lot ${lot.zone === "5-Productores" ? "producer-lot" : ""}">
    <div class="active-lot-title"><div><small>${lot.zone === "5-Productores" ? "⭐ PRODUCTORES · PRIORIDAD" : "MAESTRO GENERAL CASUR"}</small><h3>${escapeHtml(lot.producer)} · Suerte ${escapeHtml(lot.lot)}</h3></div><span class="code-pill inverse">${escapeHtml(lot.id)}</span></div>
    <p>${escapeHtml(lot.zone || "Sin zona")} · ${escapeHtml(lot.tenureLabel || lot.tenureCode || "Sin tenencia")} · ${escapeHtml(lot.irrigation || "Sin riego definido")}</p>
    <div class="lot-facts">
      <div class="lot-fact fact-area"><span>Área</span><strong>${formatNumber(lot.area, 2)} ha</strong></div>
      <div class="lot-fact fact-variety"><span>Variedad</span><strong>${escapeHtml(lot.variety || "—")}</strong></div>
      <div class="lot-fact fact-age"><span>Edad actual</span><strong>${formatNumber(age.months, 2)} meses</strong></div>
      <div class="lot-fact fact-date"><span>Fecha base</span><strong>${escapeHtml(formatDateShort(age.baseDate))}</strong></div>
      <div class="lot-fact fact-season"><span>TCH zafra 25/26</span><strong>${formatNumber(lot.latestSeasonTch, 1)}</strong><small>Resultado real más reciente</small></div>
      <div class="lot-fact fact-estimate"><span>TCH ESTIMADO Z26/27</span><strong>${formatNumber(lot.estimatedTch2627, 1)}</strong><small>${lot.estimatedTch2627UpdatedAt ? `Estimado al ${escapeHtml(formatDateShort(lot.estimatedTch2627UpdatedAt))}` : lot.estimatedTch2627 ? "Fecha del estimado no indicada" : "Sin estimación oficial"}</small></div>
      <div class="lot-fact fact-history"><span>TCH histórico promedio</span><strong>${formatNumber(lot.historicalTch, 1)}</strong><small>Referencia secundaria</small></div>
    </div>
  </section>`;
}

function normalizedSample(sample, b = state.biometry) {
  return { ...sample, sampleLengthM: b.sampleLengthM, rowSpacingM: b.rowSpacingM };
}

function biometrySummary() {
  const b = state.biometry;
  const prepared = b.samples.map((sample) => normalizedSample(sample, b));
  const values = prepared.map((sample) => sampleTch(sample, b.rowSpacingM)).filter((value) => value !== null);
  const summary = stats(values);
  const age = ageFromLot(state.selectedLot, b.date);
  const projected = tchProjection({
    biometricTch: summary.mean,
    currentAgeMonths: age.months,
    targetAgeMonths: b.targetAgeMonths,
    adjustmentPct: b.adjustmentPct,
  });
  const weightValues = prepared
    .map((sample) => sample.weighingEnabled ? sampleWeightTch(sample, b.rowSpacingM) : null)
    .filter((value) => value !== null);
  const weightStats = stats(weightValues);
  return {
    ...summary,
    age,
    projected,
    tons: projected ? projected * finiteNumber(state.selectedLot?.area) : 0,
    quality: summary.count ? samplingQuality(prepared, summary) : "Pendiente",
    weight: weightStats,
    weightDifferencePct: summary.mean > 0 && weightStats.mean > 0 ? ((weightStats.mean - summary.mean) / summary.mean) * 100 : null,
  };
}

function qualityLabel(quality) {
  return quality === "Pendiente" ? "Muestreo pendiente" : `Calidad ${quality}`;
}

function previousPointVisits() {
  if (!state.selectedLot) return [];
  const seen = new Set();
  return state.biometries
    .filter((record) => record.lotId === state.selectedLot.id)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .flatMap((record) => (record.samples || []).map((sample) => ({ ...sample, visitDate: record.date, visitTch: sample.tch })))
    .filter((sample) => {
      if (seen.has(sample.pointCode)) return false;
      seen.add(sample.pointCode);
      return true;
    });
}

function pointStatus(sample) {
  const normalized = normalizedSample(sample);
  const tch = sampleTch(normalized, state.biometry.rowSpacingM);
  if (tch) return "complete";
  if (sampleHasData(sample)) return "partial";
  return "pending";
}

function pointTabs() {
  const b = state.biometry;
  return `<div class="point-tabs" aria-label="Puntos de muestreo">${b.samples.map((sample) => {
    const status = pointStatus(sample);
    const active = sample.id === b.activeSampleId;
    return `<button class="point-tab ${active ? "active" : ""} ${status}" data-open-sample="${sample.id}"><span>${status === "complete" ? "✓" : status === "partial" ? "•" : ""}</span>${escapeHtml(sample.pointCode)}</button>`;
  }).join("")}<button class="point-tab add" id="addSample" aria-label="Añadir otro punto">＋</button></div>`;
}

function sampleCard(sample, index, spacing) {
  const normalized = normalizedSample(sample);
  const population = stalksPerMeter(normalized);
  const tch = sampleTch(normalized, spacing);
  const avgWeight = averageStalkWeightKg(sample);
  const weightTch = sample.weighingEnabled ? sampleWeightTch(normalized, spacing) : null;
  return `<article class="sample point-focus ${tch ? "complete" : ""}" data-sample-id="${sample.id}">
    <div class="sample-head">
      <span class="sample-number">${index + 1}</span>
      <div><strong>${escapeHtml(sample.pointCode)}</strong><small class="point-status">${tch ? `${formatNumber(tch, 1)} TCHe` : "Completá POB, H y D"}</small></div>
      ${state.biometry.samples.length > 1 ? `<button class="icon-btn" data-remove-sample="${sample.id}" aria-label="Eliminar punto">×</button>` : ""}
    </div>
    <div class="sample-body">
      <div class="quick-options">
        <button data-count-mode="count" data-sample="${sample.id}" class="${sample.countMode === "count" ? "active" : ""}">Conteo en tramo</button>
        <button data-count-mode="direct" data-sample="${sample.id}" class="${sample.countMode === "direct" ? "active" : ""}">POB directa</button>
      </div>
      <div class="form-grid three field-compact" style="margin-top:12px">
        ${sample.countMode === "direct"
          ? field("POB · Tallos por metro", `<input data-sample-field="directStalksPerMeter" data-sample="${sample.id}" type="number" inputmode="decimal" min="0" step="0.1" value="${escapeHtml(sample.directStalksPerMeter)}">`)
          : field("Tallos contados", `<input data-sample-field="stalkCount" data-sample="${sample.id}" type="number" inputmode="numeric" min="1" step="1" value="${escapeHtml(sample.stalkCount)}">`, `Tramo común: ${formatNumber(state.biometry.sampleLengthM, 1)} m · POB se calcula automáticamente.`)}
        ${field("H · Altura media", `<div class="input-unit"><input data-sample-field="heightM" data-sample="${sample.id}" type="number" inputmode="decimal" min="0.1" step="0.01" value="${escapeHtml(sample.heightM)}"><b>m</b></div>`)}
        ${field("D · Diámetro medio", `<div class="input-unit"><input data-sample-field="diameterMm" data-sample="${sample.id}" type="number" inputmode="decimal" min="1" step="0.1" value="${escapeHtml(sample.diameterMm)}"><b>mm</b></div>`)}
      </div>
      <div class="sample-result">
        <div class="mini-result"><span>POB</span><strong class="point-population">${formatNumber(population, 2)} tallos/m</strong></div>
        <div class="mini-result featured"><span>TCHe del punto</span><strong class="point-tch">${formatNumber(tch, 2)}</strong></div>
      </div>
      <section class="optional-weight ${sample.weighingEnabled ? "enabled" : ""}">
        <div class="optional-head">
          <div><strong>⚖ ¿Incluir pesaje en este punto?</strong><small>Opcional. Inicia en No y solo se usa como contraste; nunca sustituye el TCH proyectado por biometría.</small></div>
          <div class="weight-choice" role="group" aria-label="Incluir pesaje">
            <button data-set-sample-weight="no" data-sample="${sample.id}" class="${!sample.weighingEnabled ? "active" : ""}">No</button>
            <button data-set-sample-weight="yes" data-sample="${sample.id}" class="${sample.weighingEnabled ? "active" : ""}">Sí</button>
          </div>
        </div>
        ${sample.weighingEnabled ? `<div class="weight-fields">
          <div class="form-grid two">
            ${field("Tallos pesados", `<input data-sample-field="weighedStalkCount" data-sample="${sample.id}" type="number" inputmode="numeric" min="1" step="1" value="${escapeHtml(sample.weighedStalkCount)}">`)}
            ${field("Peso total", `<div class="input-unit"><input data-sample-field="weighedTotalKg" data-sample="${sample.id}" type="number" inputmode="decimal" min="0.01" step="0.01" value="${escapeHtml(sample.weighedTotalKg)}"><b>kg</b></div>`)}
          </div>
          <div class="sample-result weight-results">
            <div class="mini-result"><span>Peso promedio/tallo</span><strong class="point-weight-average">${formatNumber(avgWeight, 3)} kg</strong></div>
            <div class="mini-result"><span>TCH por peso · contraste</span><strong class="point-weight-tch">${formatNumber(weightTch, 2)}</strong></div>
          </div>
        </div>` : ""}
      </section>
      <div class="point-tools">
        <button class="gps-button ${sample.latitude ? "captured" : ""}" data-gps-sample="${sample.id}">${sample.latitude ? `✓ GPS capturado · ±${formatNumber(sample.gpsAccuracyM, 0)} m` : "⌖ CAPTURAR GPS"}</button>
        ${field("Observación del punto", `<input data-sample-field="notes" data-sample="${sample.id}" value="${escapeHtml(sample.notes)}" placeholder="Acame, sequía, daño, espacio…">`)}
      </div>
    </div>
  </article>`;
}

function renderMeasureStage() {
  const b = state.biometry;
  const summary = biometrySummary();
  const previous = previousPointVisits();
  let active = b.samples.find((sample) => sample.id === b.activeSampleId);
  if (!active) {
    active = b.samples[0];
    b.activeSampleId = active.id;
  }
  const index = b.samples.indexOf(active);
  return `
    <div class="flow-steps"><span class="active">1 · Medición</span><i>›</i><span>2 · Cálculo TCH</span></div>
    <section class="card search-card">
      <div class="card-head"><span class="step">1</span><div><strong>Seleccionar suerte</strong><small>Un único buscador para todas las suertes válidas de CASUR. Productores aparece priorizado.</small></div></div>
      <div class="card-body">
        ${searchBox(b.search, "biometry")}
        <div class="form-grid two" style="margin-top:12px">
          ${field("Fecha de biometría", `<input id="bioDate" type="date" max="${todayISO()}" value="${b.date}">`)}
          ${field("Técnico responsable", `<input id="bioTechnician" value="${escapeHtml(b.technician)}" placeholder="Nombre del técnico">`)}
        </div>
      </div>
    </section>
    ${selectedLotPanel(state.selectedLot, b.date)}
    ${previous.length ? `<details class="card revisits"><summary>⌖ Revisitar puntos anteriores <small>${previous.length} disponibles</small></summary><div class="card-body"><div class="quick-options">${previous.map((point) => `<button data-revisit-point="${escapeHtml(point.pointCode)}">${escapeHtml(point.pointCode)} · ${escapeHtml(formatDateShort(point.visitDate))} · ${formatNumber(point.visitTch, 1)} TCH</button>`).join("")}</div></div></details>` : ""}
    <section class="card measurement-workspace">
      <div class="card-head measurement-head"><span class="step blue">2</span><div><strong>Puntos de muestreo</strong><small>La biometría inicia con P01. Añadí únicamente los puntos que decidás medir.</small></div><button class="guide-mini" data-field-guide>ⓘ Guía</button></div>
      <div class="card-body">
        <div class="measure-config form-grid two">
          ${field("Distancia entre surcos", `<select id="bioSpacingPreset">${ROW_SPACING_PRESETS.map((spacing) => `<option value="${spacing}" ${Math.abs(finiteNumber(b.rowSpacingM) - spacing) < 0.001 ? "selected" : ""}>${spacing.toFixed(2)} m</option>`).join("")}<option value="other" ${!ROW_SPACING_PRESETS.some((spacing) => Math.abs(finiteNumber(b.rowSpacingM) - spacing) < 0.001) ? "selected" : ""}>${!ROW_SPACING_PRESETS.some((spacing) => Math.abs(finiteNumber(b.rowSpacingM) - spacing) < 0.001) ? `Otro · ${formatNumber(b.rowSpacingM, 2)} m` : "Otro / editar…"}</option></select>`, "Opciones habituales: 1.50, 1.65, 1.75, 1.80 y 2.20 m. 1.40 m queda únicamente bajo Otro.")}
          ${field("Longitud común del tramo", `<select id="bioLengthPreset">${SAMPLE_LENGTH_PRESETS.map((length) => `<option value="${length}" ${Math.abs(finiteNumber(b.sampleLengthM) - length) < 0.001 ? "selected" : ""}>${formatNumber(length, 0)} m</option>`).join("")}<option value="other" ${!SAMPLE_LENGTH_PRESETS.some((length) => Math.abs(finiteNumber(b.sampleLengthM) - length) < 0.001) ? "selected" : ""}>${!SAMPLE_LENGTH_PRESETS.some((length) => Math.abs(finiteNumber(b.sampleLengthM) - length) < 0.001) ? `Otro · ${formatNumber(b.sampleLengthM, 1)} m` : "Otro / editar…"}</option></select>`, "Usos rápidos: 3, 5 y 10 m. Al cambiarlo, POB y el texto del punto se actualizan inmediatamente.")}
        </div>
        <div class="point-nav-block">
          <div class="point-nav-head"><b>${summary.count} de ${b.samples.length} punto(s) completos</b><small>Deslizá horizontalmente para cambiar de punto.</small></div>
          ${pointTabs()}
        </div>
        <div id="activeSample">${sampleCard(active, index, b.rowSpacingM)}</div>
        ${summary.count > 0 && summary.count < 3 ? `<div class="warning compact-warning"><b>Muestreo corto:</b> podés finalizar y guardar, pero con ${summary.count} punto(s) la representatividad es menor. La app no te obliga a completar un número fijo.</div>` : ""}
        <div class="field-actions">
          <button class="btn btn-light" id="addSampleBottom">＋ Añadir otro punto</button>
          <button class="btn btn-green" id="finishSamples">✓ Finalizar puntos</button>
        </div>
      </div>
    </section>`;
}

function resultPanel(summary) {
  const comparison = productionComparison(state.selectedLot, summary.projected);
  const deltaText = (value) => value === null ? "Sin referencia" : `${Math.abs(value) < .05 ? "" : value > 0 ? "+" : ""}${formatNumber(Math.abs(value) < .05 ? 0 : value, 1)}%`;
  const validated = state.biometry.validation?.validated;
  return `<section class="calculation-dashboard">
    <div class="projected-hero">
      <div>
        <span>RESULTADO PRINCIPAL · BIOMETRÍA</span>
        <h2>TCH PROYECTADO</h2>
        <strong>${formatNumber(summary.projected, 1)} <small>TCH</small></strong>
        <p>Referencia técnica: ${formatNumber(state.biometry.targetAgeMonths, 1)} meses · ajuste ${formatNumber(state.biometry.adjustmentPct, 0)}%. No representa la fecha real de cosecha.</p>
      </div>
      <div class="validation-box ${validated ? "validated" : ""}">
        <b>${validated ? "✓ VALIDADO" : "VALIDACIÓN OPCIONAL"}</b>
        <small>${validated ? `${formatDateShort(state.biometry.validation.validatedAt)} · ${escapeHtml(state.biometry.validation.validatedBy)}` : "Podés validar luego de revisar el cálculo."}</small>
      </div>
    </div>
    <div class="calc-kpis">
      <article><span>TCHe biométrico</span><strong>${formatNumber(summary.mean, 1)}</strong><small>${summary.count} punto(s) · CV ${formatNumber(summary.cv, 1)}%</small></article>
      <article><span>Edad actual</span><strong>${formatNumber(summary.age.months, 2)}</strong><small>meses · ${escapeHtml(summary.age.source)}</small></article>
      <article><span>Toneladas lote</span><strong>${formatNumber(summary.tons, 0)}</strong><small>${formatNumber(state.selectedLot?.area, 2)} ha</small></article>
      <article class="quality-card"><span>Representatividad</span><strong>${escapeHtml(summary.quality)}</strong><small>${summary.count < 3 ? "Muestreo corto; revisar criterio de campo." : `Rango ${formatNumber(summary.min, 1)}–${formatNumber(summary.max, 1)} TCH`}</small></article>
    </div>
    ${summary.weight.count ? `<section class="weight-contrast">
      <div><span>⚖ CONTRASTE OPCIONAL POR PESAJE</span><strong>${formatNumber(summary.weight.mean, 1)} TCH</strong><small>${summary.weight.count} punto(s) con peso</small></div>
      <div><span>Diferencia vs TCHe</span><strong>${summary.weightDifferencePct >= 0 ? "+" : ""}${formatNumber(summary.weightDifferencePct, 1)}%</strong><small>No modifica el TCH proyectado.</small></div>
    </section>` : ""}
    ${state.selectedLot ? `<section class="result-comparison">
      <div><span>Último TCH · zafra 25/26</span><strong>${formatNumber(comparison.latestSeason, 1)} TCH</strong><em class="${comparison.vsLatestSeason >= 0 ? "positive" : "negative"}">${deltaText(comparison.vsLatestSeason)}</em></div>
      <div><span>Estimado oficial · zafra 26/27</span><strong>${formatNumber(comparison.estimated2627, 1)} TCH</strong><em class="${comparison.vsEstimated2627 >= 0 ? "positive" : "negative"}">${deltaText(comparison.vsEstimated2627)}</em></div>
      <div><span>Histórico promedio</span><strong>${formatNumber(comparison.historical, 1)} TCH</strong><em class="${comparison.vsHistorical >= 0 ? "positive" : "negative"}">${deltaText(comparison.vsHistorical)}</em></div>
      <small>Las tres referencias son comparativas y no alteran la fórmula biométrica.</small>
    </section>` : ""}
    <div class="calc-actions">
      <button class="btn ${validated ? "btn-light" : "btn-blue"}" id="validateCalculation">${validated ? "✓ Cálculo validado" : "✓ Validar cálculo"}</button>
      <button class="btn btn-green" id="saveBiometry">▣ Guardar biometría</button>
      <button class="btn btn-gold" id="saveBiometryExcel">⇩ Guardar + Excel</button>
      <button class="btn btn-blue" id="downloadResultImage">▧ PNG ejecutivo</button>
    </div>
  </section>`;
}

function renderCalculateStage() {
  const b = state.biometry;
  const summary = biometrySummary();
  return `
    <div class="flow-steps"><span>1 · Medición</span><i>›</i><span class="active">2 · Cálculo TCH</span></div>
    <section class="calculation-header">
      <div><small>SUERTE EVALUADA</small><h2>${escapeHtml(state.selectedLot?.producer || "Sin suerte")} · ${escapeHtml(state.selectedLot?.lot || "")}</h2><p>${summary.count} punto(s) válidos · ${escapeHtml(state.selectedLot?.zone || "")} · ${escapeHtml(state.selectedLot?.tenureLabel || "")}</p></div>
      <button class="btn btn-light" id="editMeasurements">← Editar mediciones</button>
    </section>
    <section class="card projection-settings">
      <div class="card-head"><span class="step gold">3</span><div><strong>Parámetros de proyección</strong><small>Definí el horizonte técnico de crecimiento que usará la proyección; no es la fecha programada de cosecha.</small></div></div>
      <div class="card-body projection-grid">
        ${field("Edad de referencia para proyección", `<select id="targetAge">${TARGET_AGES.map((age) => `<option value="${age}" ${finiteNumber(b.targetAgeMonths) === age ? "selected" : ""}>${age} meses</option>`).join("")}<option value="custom" ${!TARGET_AGES.includes(finiteNumber(b.targetAgeMonths)) ? "selected" : ""}>${!TARGET_AGES.includes(finiteNumber(b.targetAgeMonths)) ? `Personalizada · ${formatNumber(b.targetAgeMonths, 1)} meses` : "Personalizada…"}</option></select>`)}
        ${field("Ajuste técnico", `<div class="input-unit"><input id="adjustmentPct" type="number" inputmode="decimal" min="0" max="50" step="1" value="${escapeHtml(b.adjustmentPct)}"><b>%</b></div>`)}
        ${field("Motivo del ajuste", `<select id="adjustmentReason"><option>${escapeHtml(b.adjustmentReason)}</option><option>Sin ajuste</option><option>Déficit hídrico</option><option>Pérdidas esperadas</option><option>Acame</option><option>Plagas o enfermedades</option><option>Riego precorte</option><option>Criterio técnico</option></select>`)}
        ${field("Observaciones generales", `<textarea id="bioNotes">${escapeHtml(b.notes)}</textarea>`)}
      </div>
    </section>
    ${resultPanel(summary)}`;
}

function renderBiometry() {
  return `${pageHead(state.editingBiometryId ? "Editar biometría" : "Nueva biometría", "Flujo por etapas: medí los puntos necesarios y pasá luego al cálculo del TCH proyectado.")}${state.editingBiometryId ? `<div class="editing-banner"><div><b>Editando una biometría guardada</b><span>Los cálculos se actualizarán al guardar esta revisión.</span></div><button class="btn btn-light" id="cancelBiometryEdit">Cancelar edición</button></div>` : ""}${state.biometry.phase === "calculate" ? renderCalculateStage() : renderMeasureStage()}`;
}

function editBiometry(record) {
  const lot = state.master.find((item) => item.id === record.lotId);
  if (!lot) return notify("La suerte de esta biometría ya no está disponible en el maestro.");
  const samples = (record.samples || []).map((sample, index) => ({
    ...sample,
    id: sample.id || createId("point"),
    pointCode: sample.pointCode || `P${String(index + 1).padStart(2, "0")}`,
    countMode: sample.countMode || (sample.directStalksPerMeter ? "direct" : "count"),
    weighingEnabled: Boolean(sample.weighingEnabled || sample.weighedStalkCount || sample.weighedTotalKg),
  }));
  if (!samples.length) samples.push(newSample(0, record.sampleLengthM || 5));
  state.selectedLot = lot;
  state.editingBiometryId = record.id;
  state.biometry = {
    date: record.date || todayISO(), technician: record.technician || "", rowSpacingM: record.rowSpacingM || lot.rowSpacingM || 1.65,
    sampleLengthM: record.sampleLengthM || 5, targetAgeMonths: record.targetAgeMonths || 10,
    adjustmentPct: record.adjustmentPct ?? 5, adjustmentReason: record.adjustmentReason || "Criterio técnico",
    notes: record.notes || "", search: `${lot.id} · ${lot.producer} · Suerte ${lot.lot}`,
    phase: "measure", samples, activeSampleId: samples[0].id,
    validation: record.validation || { validated: Boolean(record.validated), validatedAt: record.validatedAt || "", validatedBy: record.validatedBy || "" },
  };
  state.route = "biometry";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function latestBiometryForLot(lotId) {
  return state.biometries.filter((record) => record.lotId === lotId)
    .sort((a, b) => `${b.date}${b.createdAt || ""}`.localeCompare(`${a.date}${a.createdAt || ""}`))[0] || null;
}

function renderVisitTabs() {
  return `<div class="visit-tabs" role="tablist">
    <button class="${state.visitView === "new" ? "active" : ""}" data-visit-tab="new">📷 Nueva visita</button>
    <button class="${state.visitView === "history" ? "active" : ""}" data-visit-tab="history">▤ Historial <b>${state.visits.length}</b></button>
  </div>`;
}

function renderVisitPhotos() {
  const photos = state.visit.photos || [];
  const totalMb = photos.reduce((sum, photo) => sum + finiteNumber(photo.sizeBytes), 0) / 1024 / 1024;
  const busy = Boolean(state.visit.photoProcessing);
  return `<div class="visit-photo-grid">${photos.map((photo, index) => `<figure class="visit-photo">
    <img src="${photoPreview(photo)}" alt="Fotografía ${index + 1} de la visita">
    <figcaption><b>Foto ${String(index + 1).padStart(2, "0")}</b><small>${formatNumber(photo.sizeBytes / 1024, 0)} KB</small></figcaption>
    <button type="button" data-remove-visit-photo="${escapeHtml(photo.id)}" aria-label="Quitar fotografía">×</button>
  </figure>`).join("")}<button class="visit-photo-add" id="takeVisitPhoto" type="button" ${busy ? "disabled" : ""}><b>${busy ? "…" : "＋"}</b><strong>${busy ? "Procesando fotos" : photos.length ? "Otra fotografía" : "Tomar fotografía"}</strong><small>${busy ? escapeHtml(state.visit.photoProgress || "Preparando…") : "Agregá las que necesités"}</small></button></div>
  <div class="photo-actions"><button class="btn btn-light" id="chooseVisitPhotos" ${busy ? "disabled" : ""}>▧ Elegir de galería</button><span>${photos.length} foto(s) · ${formatNumber(totalMb, 2)} MB optimizados</span></div>
  ${busy ? `<div class="photo-processing" role="status"><span></span><b>${escapeHtml(state.visit.photoProgress || "Procesando fotografías…")}</b></div>` : ""}`;
}

function renderVisitNew() {
  const visit = state.visit;
  const availableBiometries = state.selectedLot ? state.biometries.filter((record) => record.lotId === state.selectedLot.id)
    .sort((a, b) => `${b.date}${b.createdAt || ""}`.localeCompare(`${a.date}${a.createdAt || ""}`)) : [];
  const showTch = visit.tchSource !== "none";
  return `${pageHead("Visita de campo", "Documentá el estado de la caña aunque no realicés aforo o biometría.")}
    ${renderVisitTabs()}
    ${state.editingVisitId ? `<div class="editing-banner"><div><b>Editando una visita guardada</b><span>Corregí cualquier dato y actualizá para regenerar los PNG.</span></div><button class="btn btn-light" id="cancelVisitEdit">Cancelar edición</button></div>` : ""}
    <section class="card search-card">
      <div class="card-head"><span class="step">1</span><div><strong>Seleccionar suerte</strong><small>La hacienda, el código, el área y la variedad pasarán automáticamente a la evidencia.</small></div></div>
      <div class="card-body">${searchBox(visit.search, "visits")}<div class="form-grid two" style="margin-top:12px">
        ${field("Fecha de visita", `<input id="visitDate" type="date" max="${todayISO()}" value="${escapeHtml(visit.date)}">`)}
        ${field("Técnico responsable", `<input id="visitTechnician" value="${escapeHtml(visit.technician)}" placeholder="Nombre del técnico">`)}
      </div></div>
    </section>
    ${selectedLotPanel(state.selectedLot, visit.date)}
    <section class="card">
      <div class="card-head"><span class="step blue">2</span><div><strong>Condición observada</strong><small>Clasificá de forma breve lo visible; la fotografía y la observación conservan el detalle técnico.</small></div></div>
      <div class="card-body"><div class="form-grid three">
        ${categoryField("Motivo de la visita", "visitPurpose", "purpose")}
        ${categoryField("Condición general", "visitCondition", "overallCondition")}
        ${categoryField("Estado hídrico", "visitWater", "waterStatus")}
        ${categoryField("Nivel de malezas", "visitWeeds", "weedLevel")}
        ${categoryField("Plagas / daño", "visitPests", "pestLevel")}
        ${field("Acame observado", `<div class="input-unit"><input id="visitLodging" type="number" inputmode="decimal" min="0" max="100" step="1" value="${escapeHtml(visit.lodgingPct)}"><b>%</b></div><input class="custom-category-input" id="visitLodgingDescription" value="${escapeHtml(visit.lodgingDescription)}" placeholder="Descripción opcional">`)}
      </div></div>
    </section>
    <section class="card">
      <div class="card-head"><span class="step gold">3</span><div><strong>TCH de referencia en la visita</strong><small>Puede quedar sin estimación. Un TCH visual se identifica claramente y no se presenta como biometría.</small></div></div>
      <div class="card-body"><div class="form-grid two">
        ${field("Fuente del TCH", `<select id="visitTchSource">${Object.entries(TCH_SOURCES).map(([value, label]) => `<option value="${value}" ${visit.tchSource === value ? "selected" : ""}>${label}</option>`).join("")}</select>`)}
        ${showTch && visit.tchSource !== "biometry" ? field("TCH registrado", `<div class="input-unit"><input id="visitEstimatedTch" type="number" inputmode="decimal" min="1" max="300" step="0.1" value="${escapeHtml(visit.estimatedTch)}"><b>TCH</b></div><input class="custom-category-input" id="visitTchDescription" value="${escapeHtml(visit.tchDescription)}" placeholder="Descripción técnica opcional">`, "Registralo solamente si existe una estimación o aforo en esta visita.") : ""}
        ${visit.tchSource === "biometry" ? `<div class="linked-biometry-panel"><strong>Biometría vinculada</strong>${availableBiometries.length ? `<select id="visitBiometryId"><option value="">Seleccioná una biometría guardada</option>${availableBiometries.map((record) => `<option value="${escapeHtml(record.id)}" ${visit.linkedBiometryId === record.id ? "selected" : ""}>${formatDateShort(record.date)} · ${formatNumber(record.projectedTch, 1)} TCH · ${record.pointCount || record.samples?.length || 0} puntos · ${escapeHtml(record.technician || "Sin técnico")}</option>`).join("")}</select>` : `<div class="info-note">Esta suerte todavía no tiene biometrías guardadas.</div>`}<button type="button" class="btn btn-green" id="newBiometryForVisit">＋ Realizar nueva biometría en campo</button></div>` : ""}
        ${!showTch ? `<div class="info-note">Esta visita quedará como evidencia del estado del cultivo, sin asignar un TCH.</div>` : ""}
      </div></div>
    </section>
    <section class="card visit-camera-card">
      <div class="card-head"><span class="step">4</span><div><strong>Fotografías de evidencia</strong><small>Tomá o elegí todas las fotos necesarias. La app las optimiza, conserva una copia limpia para la futura IA y genera PNG etiquetados para compartir.</small></div></div>
      <div class="card-body">${renderVisitPhotos()}</div>
    </section>
    <section class="card">
      <div class="card-head"><span class="step blue">5</span><div><strong>Ubicación y observación</strong><small>El GPS se incluye en el PNG y en el historial Excel.</small></div></div>
      <div class="card-body">
        <button class="gps-button ${visit.latitude ? "captured" : ""}" id="visitGps">${visit.latitude ? `✓ GPS capturado · ${Number(visit.latitude).toFixed(6)}, ${Number(visit.longitude).toFixed(6)} · ±${formatNumber(visit.gpsAccuracyM, 0)} m` : "⌖ CAPTURAR GPS DE LA VISITA"}</button>
        ${field("Observación técnica", `<textarea id="visitNotes" placeholder="Describí la condición de la caña, uniformidad, espacios, sequía, acame, malezas, plagas o cualquier detalle relevante.">${escapeHtml(visit.notes)}</textarea>`)}
        <div class="visit-save-actions"><button class="btn btn-green btn-wide" id="saveVisit" ${visit.photoProcessing || visit.saving ? "disabled" : ""}>${visit.saving ? "… Guardando" : state.editingVisitId ? "▣ Actualizar visita y regenerar PNG" : "▣ Guardar visita"}</button></div>
        <div class="info-note">Primero guardá la visita. Después podrás descargar cada PNG directamente o compartirlo por WhatsApp; el ZIP queda reservado para exportaciones masivas.</div>
      </div>
    </section>`;
}

function filteredVisits() {
  const terms = normalizeText(state.visitQuery).split(" ").filter(Boolean);
  return state.visits.filter((visit) => {
    const haystack = normalizeText([visit.producer, visit.farmCode, visit.lot, visit.lotId, visit.date, visit.technician, visit.purpose, visit.overallCondition, visit.waterStatus, visit.weedLevel, visit.pestLevel, visit.notes].join(" "));
    return terms.every((term) => haystack.includes(term)) &&
    (!state.visitDateFrom || visit.date >= state.visitDateFrom) && (!state.visitDateTo || visit.date <= state.visitDateTo) &&
    (!state.visitProducer || String(visit.farmCode) === String(state.visitProducer));
  })
    .sort((a, b) => `${b.date}${b.createdAt || ""}`.localeCompare(`${a.date}${a.createdAt || ""}`));
}

function renderVisitHistory() {
  const visits = filteredVisits();
  const producers = [...new Map(state.visits.map((visit) => [visit.farmCode, `${visit.farmCode} · ${visit.producer}`])).entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  return `${pageHead("Visitas de campo", "Consultá y exportá las evidencias organizadas por hacienda y suerte.")}
    ${renderVisitTabs()}
    <section class="card visit-search-compact"><div class="card-body">${field("Buscar visitas", `<div class="search-inline"><input id="visitHistorySearch" value="${escapeHtml(state.visitQuery)}" placeholder="Hacienda, código, suerte, técnico o motivo…"><button class="btn btn-light" id="clearVisitFilters" type="button">Limpiar</button></div>`)}
      <div class="filter-summary"><b>${visits.length}</b> de ${state.visits.length} visita(s) visibles</div>
      <details class="visit-tools"><summary>⚙ Filtros y exportación</summary><div class="visit-tools-body">
        <div class="form-grid three visit-filters">${field("Desde", `<input id="visitDateFrom" type="date" value="${escapeHtml(state.visitDateFrom)}">`)}${field("Hasta", `<input id="visitDateTo" type="date" value="${escapeHtml(state.visitDateTo)}">`)}${field("Productor / hacienda", `<select id="visitProducer"><option value="">Todos</option>${producers.map(([code, label]) => `<option value="${escapeHtml(code)}" ${String(state.visitProducer) === String(code) ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select>`)}</div>
        <div class="visit-export-actions"><button class="btn btn-blue" id="exportVisitsExcel" ${visits.length ? "" : "disabled"}>⇩ Excel filtrado</button><button class="btn btn-gold" id="openBulkVisitExport" ${visits.length ? "" : "disabled"}>🗂 Exportación masiva ZIP</button></div>
        <div class="info-note">El Excel se descarga directamente. El ZIP se reserva para agrupar visitas filtradas o seleccionadas.</div>
      </div></details>
    </div></section>
    ${visits.length ? `<section class="history-list visit-history-list">${visits.map((visit) => `<article class="record visit-record">
      <div class="record-head"><label class="visit-select"><input type="checkbox" data-select-visit="${escapeHtml(visit.id)}" ${state.selectedVisitIds.has(visit.id) ? "checked" : ""}> Seleccionar</label><div><h3>${escapeHtml(visit.producer)} · Suerte ${escapeHtml(visit.lot)}</h3><p>${[formatDateShort(visit.date), visit.purpose, visit.technician].filter(Boolean).map(escapeHtml).join(" · ")}</p></div><span class="code-pill">${escapeHtml(visit.lotId)}</span></div>
      <div class="record-meta">${escapeHtml(visit.zone || "")}${visit.overallCondition ? ` · Condición ${escapeHtml(visit.overallCondition)}` : ""} · GPS ${visit.latitude ? `±${formatNumber(visit.gpsAccuracyM, 0)} m` : "sin captura"}</div>
      <div class="visit-thumbs">${(visit.photos || []).map((photo, index) => `<img src="${photoPreview(photo)}" alt="Foto ${index + 1}">`).join("")}</div>
      <div class="record-metrics"><div><span>Fotografías</span><strong>${visit.photos?.length || 0}</strong></div>${visit.estimatedTch ? `<div><span>TCH visita</span><strong>${formatNumber(visit.estimatedTch, 1)}</strong></div>` : ""}${visit.waterStatus ? `<div><span>Estado hídrico</span><strong>${escapeHtml(visit.waterStatus)}</strong></div>` : ""}</div>
      <div class="record-actions"><button class="btn btn-green" data-open-visit="${escapeHtml(visit.id)}">Ver y compartir fotos</button><button class="btn btn-blue" data-edit-visit="${escapeHtml(visit.id)}">Editar</button><button class="btn btn-danger" data-delete-visit="${escapeHtml(visit.id)}">Eliminar</button></div>
    </article>`).join("")}</section>` : emptyState("📷", "Sin visitas", "Todavía no hay visitas que coincidan con el filtro.", `<button class="btn btn-green" data-visit-tab="new">Registrar la primera visita</button>`)}`;
}

function renderVisits() {
  return state.visitView === "history" ? renderVisitHistory() : renderVisitNew();
}

function openVisitDetail(visit) {
  openModal(`<div class="visit-detail"><h2>${escapeHtml(visit.producer)} · Suerte ${escapeHtml(visit.lot)}</h2><p>${escapeHtml(visit.lotId)} · ${formatDateShort(visit.date)} · ${visit.photos?.length || 0} fotografía(s)</p><div class="visit-detail-grid">${(visit.photos || []).map((photo, index) => `<article><img src="${photoPreview(photo)}" alt="Foto ${index + 1}"><strong>Foto ${String(index + 1).padStart(2, "0")}</strong><div class="actions"><button class="btn btn-green" data-share-visit-photo="${escapeHtml(visit.id)}" data-photo-index="${index}">Compartir PNG</button><button class="btn btn-blue" data-download-visit-photo="${escapeHtml(visit.id)}" data-photo-index="${index}">Descargar PNG</button><button class="btn btn-light" data-download-original="${escapeHtml(visit.id)}" data-photo-index="${index}">Original</button></div></article>`).join("")}</div><div class="actions"><button class="btn btn-blue" data-edit-visit="${escapeHtml(visit.id)}">✎ Editar visita completa</button><button class="btn btn-light" data-close-modal>Cerrar</button></div></div>`);
}

function editVisit(visit) {
  const lot = state.master.find((item) => item.id === visit.lotId);
  if (!lot) return notify("La suerte de esta visita ya no está disponible en el maestro.");
  const customState = {};
  for (const [fieldName, options] of Object.entries(VISIT_CATEGORIES)) {
    const value = String(visit[fieldName] || "");
    customState[fieldName] = !value || options.includes(value) ? value : "__other__";
    customState[`${fieldName}Custom`] = !value || options.includes(value) ? "" : value;
  }
  state.selectedLot = lot;
  state.editingVisitId = visit.id;
  state.visit = {
    ...visit,
    ...customState,
    search: `${lot.id} · ${lot.producer} · Suerte ${lot.lot}`,
    lodgingPct: visit.lodgingPct ?? "",
    lodgingDescription: visit.lodgingDescription || "",
    tchDescription: visit.tchDescription || "",
    linkedBiometryId: visit.linkedBiometryId || "",
    photos: [...(visit.photos || [])],
    photoProcessing: false,
    photoProgress: "",
    saving: false,
  };
  state.route = "visits";
  state.visitView = "new";
  closeModal();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function labeledVisitFile(visit, photoIndex) {
  const photo = visit.photos?.[photoIndex];
  if (!photo) throw new Error("No se encontró la fotografía.");
  const blob = await createLabeledVisitPhotoBlob({ visit, photo, photoNumber: photoIndex + 1, photoTotal: visit.photos.length });
  return new File([blob], visitPhotoFilename(visit, photoIndex + 1), { type: "image/png" });
}

async function exportVisits(visits, options = {}) {
  notify("Generando PNG etiquetados y carpeta de evidencias…");
  const blob = await createVisitsPackageBlob(visits, options);
  downloadBlob(blob, visitPackageFilename(visits));
  notify("Carpeta ZIP generada correctamente.");
}

async function saveVisit() {
  const visit = state.visit;
  if (visit.photoProcessing) return notify("Esperá a que terminen de cargar las fotografías.");
  if (visit.saving) return;
  if (!state.selectedLot) return notify("Seleccioná una suerte antes de guardar.");
  if (!visit.technician.trim()) return notify("Ingresá el técnico responsable.");
  if (!visit.photos.length) return notify("Tomá por lo menos una fotografía de evidencia.");
  if (visit.latitude === null || visit.longitude === null) return notify("Capturá el GPS para que la evidencia quede georreferenciada.");
  if (visit.tchSource === "biometry" && !visit.linkedBiometryId) return notify("Seleccioná una biometría guardada o realizá una nueva.");
  if (visit.tchSource !== "none" && finiteNumber(visit.estimatedTch) <= 0) return notify("Ingresá un TCH válido o seleccioná Sin estimación.");
  const lot = state.selectedLot;
  const now = new Date();
  const previous = state.editingVisitId ? state.visits.find((item) => item.id === state.editingVisitId) : null;
  const record = {
    id: previous?.id || createId("visit"),
    createdAt: previous?.createdAt || now.toISOString(),
    updatedAt: now.toISOString(),
    revision: (previous?.revision || 0) + (previous ? 1 : 0),
    date: visit.date,
    time: previous?.time || now.toLocaleTimeString("es-NI", { hour: "2-digit", minute: "2-digit" }),
    technician: visit.technician.trim(),
    lotId: lot.id,
    farmCode: lot.farmCode,
    producer: lot.producer,
    lot: lot.lot,
    zone: lot.zone,
    tenureCode: lot.tenureCode,
    tenureLabel: lot.tenureLabel,
    area: lot.area,
    variety: lot.variety,
    irrigation: lot.irrigation,
    purpose: resolvedCategory(visit, "purpose"),
    overallCondition: resolvedCategory(visit, "overallCondition"),
    waterStatus: resolvedCategory(visit, "waterStatus"),
    weedLevel: resolvedCategory(visit, "weedLevel"),
    pestLevel: resolvedCategory(visit, "pestLevel"),
    lodgingPct: String(visit.lodgingPct).trim() === "" ? null : Math.min(100, Math.max(0, finiteNumber(visit.lodgingPct))),
    lodgingDescription: visit.lodgingDescription.trim(),
    tchSource: visit.tchSource,
    tchSourceLabel: TCH_SOURCES[visit.tchSource] || visit.tchSource,
    estimatedTch: visit.tchSource === "none" ? null : finiteNumber(visit.estimatedTch),
    tchDescription: visit.tchDescription.trim(),
    linkedBiometryId: visit.tchSource === "biometry" ? visit.linkedBiometryId : "",
    estimatedTch2627: lot.estimatedTch2627 || null,
    latitude: visit.latitude,
    longitude: visit.longitude,
    gpsAccuracyM: visit.gpsAccuracyM,
    capturedAt: visit.capturedAt,
    notes: visit.notes.trim(),
    photos: visit.photos,
    datasetVersion: "visit-photos-v2-blob",
    sync: { status: "local", updatedAt: now.toISOString(), remoteId: "", checksum: "" },
  };
  visit.saving = true;
  render();
  try {
    await repository.put("visits", record);
  } catch (error) {
    visit.saving = false;
    render();
    const quota = error?.name === "QuotaExceededError" || /quota|storage|espacio/i.test(error?.message || "");
    notify(quota
      ? "No hay espacio suficiente en el teléfono. Retirá algunas fotos o exportá visitas anteriores."
      : "No se pudo guardar la visita. Las fotos siguen cargadas para volver a intentar.");
    return;
  }
  if (previous) state.visits = state.visits.map((item) => item.id === record.id ? record : item);
  else state.visits.push(record);
  await refreshStorageEstimate();
  resetVisit();
  state.visitView = "history";
  render();
  openVisitDetail(record);
  notify(previous ? "Visita actualizada. Los PNG se regenerarán con la información corregida." : "Visita guardada con fotografías y GPS.");
}

function updateActivePointResult() {
  const b = state.biometry;
  const sample = b.samples.find((item) => item.id === b.activeSampleId);
  if (!sample) return;
  const card = document.querySelector(`[data-sample-id="${CSS.escape(sample.id)}"]`);
  if (!card) return;
  const normalized = normalizedSample(sample);
  const population = stalksPerMeter(normalized);
  const tch = sampleTch(normalized, b.rowSpacingM);
  const avgWeight = averageStalkWeightKg(sample);
  const age = ageFromLot(state.selectedLot, b.date);
  const weightTch = sample.weighingEnabled ? sampleWeightTch(normalized, b.rowSpacingM) : null;
  card.classList.toggle("complete", Boolean(tch));
  const status = card.querySelector(".point-status");
  const pop = card.querySelector(".point-population");
  const tchEl = card.querySelector(".point-tch");
  const avgEl = card.querySelector(".point-weight-average");
  const weightEl = card.querySelector(".point-weight-tch");
  if (status) status.textContent = tch ? `${formatNumber(tch, 1)} TCHe` : "Completá POB, H y D";
  if (pop) pop.textContent = `${formatNumber(population, 2)} tallos/m`;
  if (tchEl) tchEl.textContent = formatNumber(tch, 2);
  if (avgEl) avgEl.textContent = `${formatNumber(avgWeight, 3)} kg`;
  if (weightEl) weightEl.textContent = formatNumber(weightTch, 2);
  const tab = document.querySelector(`[data-open-sample="${CSS.escape(sample.id)}"]`);
  if (tab) {
    tab.classList.remove("pending", "partial", "complete");
    tab.classList.add(pointStatus(sample));
  }
}

async function saveBiometry(download = false) {
  const b = state.biometry;
  const summary = biometrySummary();
  if (!state.selectedLot) return notify("Seleccioná una suerte antes de guardar.");
  if (!summary.count) return notify("Completá por lo menos un punto biométrico válido.");
  if (!summary.age.months) return notify("La suerte no tiene una fecha base válida para calcular la edad.");
  if (finiteNumber(b.sampleLengthM) <= 0) return notify("Ingresá una longitud común de tramo válida.");
  if (finiteNumber(b.targetAgeMonths) < summary.age.months) return notify("La edad de referencia no puede ser menor que la edad actual.");
  if (!summary.projected) return notify("Revisá la edad y el ajuste de proyección.");
  const now = new Date();
  const previousRecord = state.editingBiometryId ? state.biometries.find((item) => item.id === state.editingBiometryId) : null;
  const samples = b.samples.map((sample) => {
    const normalized = normalizedSample(sample);
    const population = stalksPerMeter(normalized);
    const tch = sampleTch(normalized, b.rowSpacingM);
    const avgWeight = averageStalkWeightKg(sample);
    const weightTch = sample.weighingEnabled ? sampleWeightTch(normalized, b.rowSpacingM) : null;
    return {
      ...sample,
      sampleLengthM: finiteNumber(b.sampleLengthM),
      rowSpacingM: finiteNumber(b.rowSpacingM),
      stalksPerMeter: population,
      heightM: finiteNumber(sample.heightM) || (finiteNumber(sample.lengthCm) / 100) || null,
      diameterMm: finiteNumber(sample.diameterMm) || (finiteNumber(sample.diameterCm) * 10) || null,
      // Duplicados legacy intencionales para lectores v2.3:
      lengthCm: finiteNumber(sample.heightM) > 0 ? finiteNumber(sample.heightM) * 100 : finiteNumber(sample.lengthCm) || null,
      diameterCm: finiteNumber(sample.diameterMm) > 0 ? finiteNumber(sample.diameterMm) / 10 : finiteNumber(sample.diameterCm) || null,
      averageStalkWeightKg: avgWeight,
      weightTch,
      tch,
    };
  }).filter((sample) => sample.tch);
  const lot = state.selectedLot;
  const record = {
    id: previousRecord?.id || createId("bio"),
    method: "Biometría",
    formulaVersion: "TCHe-mm-m-v2.4",
    createdAt: previousRecord?.createdAt || now.toISOString(),
    updatedAt: now.toISOString(),
    revision: (previousRecord?.revision || 0) + (previousRecord ? 1 : 0),
    date: b.date,
    time: now.toLocaleTimeString("es-NI", { hour: "2-digit", minute: "2-digit" }),
    technician: b.technician || "Sin registrar",
    lotId: lot.id,
    farmCode: lot.farmCode,
    producer: lot.producer,
    lot: lot.lot,
    zone: lot.zone,
    tenureCode: lot.tenureCode,
    tenureLabel: lot.tenureLabel,
    area: lot.area,
    variety: lot.variety,
    irrigation: lot.irrigation,
    historicalTch: lot.historicalTch,
    latestSeasonTch: lot.latestSeasonTch,
    estimatedTch2627: lot.estimatedTch2627,
    ageBaseDate: summary.age.baseDate,
    ageSource: summary.age.source,
    currentAgeMonths: summary.age.months,
    targetAgeMonths: finiteNumber(b.targetAgeMonths),
    adjustmentPct: finiteNumber(b.adjustmentPct),
    adjustmentReason: b.adjustmentReason,
    biometricTch: summary.mean,
    weightTch: summary.weight.mean || null,
    weightPointCount: summary.weight.count || 0,
    weightDifferencePct: summary.weightDifferencePct,
    projectedTch: summary.projected,
    projectedTons: summary.tons,
    pointCount: summary.count,
    minTch: summary.min,
    maxTch: summary.max,
    sdTch: summary.sd,
    cvPct: summary.cv,
    quality: summary.quality,
    rowSpacingM: finiteNumber(b.rowSpacingM),
    sampleLengthM: finiteNumber(b.sampleLengthM),
    validation: { ...b.validation },
    validated: Boolean(b.validation?.validated),
    validatedAt: b.validation?.validatedAt || "",
    validatedBy: b.validation?.validatedBy || "",
    samples,
    notes: b.notes,
  };
  await repository.put("biometries", record);
  if (previousRecord) state.biometries = state.biometries.map((item) => item.id === record.id ? record : item);
  else state.biometries.push(record);
  notify(previousRecord ? "Biometría actualizada y recalculada." : summary.count < 3 ? "Biometría guardada. Muestreo corto marcado como calidad baja." : "Biometría guardada en el teléfono.");
  if (download) {
    downloadWorkbook({
      master: state.master,
      biometries: [record],
      weighings: state.weighings.filter((w) => w.lotId === record.lotId),
      harvests: state.harvests.filter((h) => h.lotId === record.lotId),
    }, `Biometria_TCH_${record.lotId}_${record.date}.xlsx`);
  }
  if (state.visitReturnFromBiometry && state.visit) {
    state.visitReturnFromBiometry = false;
    state.visit.tchSource = "biometry";
    state.visit.linkedBiometryId = record.id;
    state.visit.estimatedTch = record.projectedTch;
    state.selectedLot = lot;
    state.route = "visits";
    state.visitView = "new";
    render();
    notify(`Biometría vinculada a la visita: ${formatNumber(record.projectedTch, 1)} TCH.`);
  }
}

function weighingResult() {
  const w = state.weighing;
  return w.method === "full"
    ? tchFullRowWeight(w)
    : tchAverageStalkWeight({
      stalksPerMeter: w.stalksPerMeter,
      averageStalkWeightKg: w.averageStalkWeightKg,
      rowSpacingM: w.rowSpacingM,
    });
}

function renderWeighing() {
  const w = state.weighing;
  const result = weighingResult();
  return `${pageHead("Pesaje histórico / compatibilidad", "Este módulo se conserva para registros anteriores. En nuevas biometrías, el pesaje opcional está integrado por punto.")}
    <div class="warning"><b>Flujo v2.4:</b> para nuevas evaluaciones usá Biometría. El TCH proyectado por biometría sigue siendo el resultado principal.</div>
    <section class="card search-card"><div class="card-body">${searchBox(w.search, "weighing")}<div class="form-grid two" style="margin-top:12px">${field("Fecha", `<input id="weightDate" type="date" max="${todayISO()}" value="${w.date}">`)}${field("Técnico", `<input id="weightTechnician" value="${escapeHtml(w.technician)}">`)}</div></div></section>
    ${selectedLotPanel(state.selectedLot, w.date)}
    <section class="card"><div class="card-head"><span class="step blue">⚖</span><div><strong>Pesaje separado heredado</strong><small>Se mantiene para compatibilidad con datos anteriores.</small></div></div><div class="card-body">
      <div class="quick-options"><button data-weight-method="full" class="${w.method === "full" ? "active" : ""}">Pesaje completo</button><button data-weight-method="average" class="${w.method === "average" ? "active" : ""}">Peso promedio/tallo</button></div>
      <div class="form-grid three" style="margin-top:12px">
        ${field("Distancia entre surcos", `<div class="input-unit"><input id="weightSpacing" type="number" inputmode="decimal" step="0.01" value="${escapeHtml(w.rowSpacingM)}"><b>m</b></div>`)}
        ${w.method === "full"
          ? field("Longitud muestreada", `<div class="input-unit"><input id="weightLength" type="number" inputmode="decimal" step="0.5" value="${escapeHtml(w.sampleLengthM)}"><b>m</b></div>`) +
            field("Peso total del tramo", `<div class="input-unit"><input id="totalWeight" type="number" inputmode="decimal" step="0.1" value="${escapeHtml(w.totalWeightKg)}"><b>kg</b></div>`)
          : field("Tallos por metro", `<input id="weightStalksM" type="number" inputmode="decimal" step="0.1" value="${escapeHtml(w.stalksPerMeter)}">`) +
            field("Peso promedio por tallo", `<div class="input-unit"><input id="averageStalkWeight" type="number" inputmode="decimal" step="0.01" value="${escapeHtml(w.averageStalkWeightKg)}"><b>kg</b></div>`)}
      </div>
      ${field("Observaciones", `<textarea id="weightNotes">${escapeHtml(w.notes)}</textarea>`)}
      <button class="gps-button ${w.latitude ? "captured" : ""}" id="weightGps">${w.latitude ? `✓ GPS capturado · ±${formatNumber(w.gpsAccuracyM, 0)} m` : "⌖ CAPTURAR GPS"}</button>
    </div></section>
    <section class="result-panel"><div class="result-top"><div><span>RESULTADO HEREDADO POR PESAJE</span><strong><i id="weightResult">${formatNumber(result, 1)}</i> TCH</strong><small>No sustituye la proyección biométrica.</small></div></div><div class="actions"><button class="btn btn-primary" id="saveWeighing">▣ Guardar pesaje</button></div></section>`;
}

async function saveWeighing() {
  const w = state.weighing;
  const result = weighingResult();
  if (!state.selectedLot) return notify("Seleccioná una suerte.");
  if (!result) return notify("Completá los datos válidos del pesaje.");
  const age = ageFromLot(state.selectedLot, w.date);
  const record = {
    id: createId("weight"),
    method: w.method === "full" ? "Pesaje completo" : "Peso promedio por tallo",
    createdAt: new Date().toISOString(),
    date: w.date,
    technician: w.technician || "Sin registrar",
    lotId: state.selectedLot.id,
    farmCode: state.selectedLot.farmCode,
    producer: state.selectedLot.producer,
    lot: state.selectedLot.lot,
    zone: state.selectedLot.zone,
    tenureCode: state.selectedLot.tenureCode,
    tenureLabel: state.selectedLot.tenureLabel,
    area: state.selectedLot.area,
    ageMonths: age.months,
    rowSpacingM: finiteNumber(w.rowSpacingM),
    sampleLengthM: finiteNumber(w.sampleLengthM),
    totalWeightKg: finiteNumber(w.totalWeightKg) || null,
    stalkCount: finiteNumber(w.stalkCount) || null,
    stalksPerMeter: finiteNumber(w.stalksPerMeter) || null,
    averageStalkWeightKg: finiteNumber(w.averageStalkWeightKg) || null,
    tch: result,
    latitude: w.latitude,
    longitude: w.longitude,
    gpsAccuracyM: w.gpsAccuracyM,
    notes: w.notes,
  };
  await repository.put("weighings", record);
  state.weighings.push(record);
  notify("Pesaje guardado en el teléfono.");
}

function renderHistory() {
  const query = state.historyQuery.toLowerCase().trim();
  const records = [
    ...state.biometries.map((r) => ({ ...r, kind: "Biometría", result: r.projectedTch, secondary: r.biometricTch })),
    ...state.weighings.map((r) => ({ ...r, kind: r.method, result: r.tch, secondary: r.tch })),
  ].filter((r) => !query || [
    r.producer, r.farmCode, r.lotId, r.lot, r.date, r.technician, r.kind, r.zone, r.tenureLabel, r.tenureCode,
  ].some((v) => String(v || "").toLowerCase().includes(query)))
    .sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`));
  return `${pageHead("Historial", "Filtrá por hacienda, suerte, fecha, método, técnico, zona o tenencia.")}
    <section class="card"><div class="card-body">${field("Buscar registros", `<input id="historySearch" value="${escapeHtml(state.historyQuery)}" placeholder="Ej. hacienda, código, técnico…">`)}</div></section>
    ${records.length ? `<section class="history-list">${records.map((record) => {
      const isBio = record.kind === "Biometría";
      return `<article class="record"><div class="record-head"><div><h3>${escapeHtml(record.producer)} · Suerte ${escapeHtml(record.lot)}</h3><p>${escapeHtml(record.kind)} · ${escapeHtml(formatDateShort(record.date))} · ${escapeHtml(record.technician)}</p></div><span class="code-pill">${escapeHtml(record.lotId)}</span></div>
        <div class="record-meta">${escapeHtml(record.zone || "")}${record.tenureLabel ? ` · ${escapeHtml(record.tenureLabel)}` : ""}${record.validated ? " · ✓ Validado" : ""}</div>
        <div class="record-metrics"><div><span>${isBio ? "TCHe actual" : "TCH pesaje"}</span><strong>${formatNumber(record.secondary, 1)}</strong></div><div><span>${isBio ? "TCH proyectado" : "Edad"}</span><strong>${isBio ? formatNumber(record.result, 1) : `${formatNumber(record.ageMonths, 1)} m`}</strong></div><div><span>${isBio && record.weightTch ? "Contraste peso" : "Área"}</span><strong>${isBio && record.weightTch ? formatNumber(record.weightTch, 1) : `${formatNumber(record.area, 2)} ha`}</strong></div></div>
        <div class="record-actions">${isBio ? `<button class="btn btn-blue" data-edit-biometry="${escapeHtml(record.id)}">Editar biometría</button>` : ""}<button class="btn btn-light" data-real-harvest="${escapeHtml(record.lotId)}">Registrar TCH real</button><button class="btn btn-danger" data-delete-record="${escapeHtml(record.id)}" data-record-kind="${isBio ? "biometries" : "weighings"}">Eliminar</button></div>
      </article>`;
    }).join("")}</section>` : emptyState("▤", "Sin registros", "Todavía no hay evaluaciones que coincidan con el filtro.")}`;
}

function renderAnalytics() {
  const lot = state.master.find((item) => item.id === state.consultationLotId) || null;
  const biometries = (lot ? state.biometries.filter((item) => item.lotId === lot.id) : state.biometries)
    .slice().sort((a, b) => `${b.date}${b.createdAt || ""}`.localeCompare(`${a.date}${a.createdAt || ""}`)).slice(0, 20);
  const visits = lot ? state.visits.filter((item) => item.lotId === lot.id).slice().sort((a, b) => `${b.date}${b.createdAt || ""}`.localeCompare(`${a.date}${a.createdAt || ""}`)) : [];
  return `${pageHead("Consulta de suertes y registros", "Buscá el cronológico maestro, el TCH estimado Z26/27 y las evaluaciones realizadas.")}
    <section class="card search-card"><div class="card-head"><span class="step blue">⌕</span><div><strong>Buscar suerte en el cronológico</strong><small>Código, hacienda o número de suerte.</small></div></div><div class="card-body">${searchBox(state.consultationQuery, "consultation")}</div></section>
    ${lot ? `${selectedLotPanel(lot, todayISO())}
      <section class="card consultation-detail"><div class="card-head"><span class="step">▦</span><div><strong>Ficha del cronológico maestro</strong><small>Información vigente de la hoja REPORTE.</small></div></div><div class="card-body"><dl class="master-facts">
        ${[["Código integrado", lot.id], ["Código hacienda", lot.farmCode], ["Área", `${formatNumber(lot.area, 2)} ha`], ["Variedad", lot.variety], ["Corte", lot.cutNumber], ["Surco", lot.rowSpacingM ? `${formatNumber(lot.rowSpacingM, 2)} m` : ""], ["Textura", lot.texture], ["Último corte", formatDateShort(lot.lastCutDate)], ["Siembra", formatDateShort(lot.plantingDate)], ["Destino", lot.destination], ["Tenencia", lot.tenureLabel || lot.tenureCode], ["Riego", lot.irrigation], ["Número de riegos", lot.irrigationCount], ["ERP", lot.erp], ["Zona", lot.zone], ["Estado", lot.masterStatus], ["Observación maestro", lot.masterObservation]].filter(([, value]) => value !== "" && value !== null && value !== undefined && value !== "—").map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}
      </dl><div class="actions"><button class="btn btn-green" data-consult-action="biometry">＋ Nueva biometría</button><button class="btn btn-blue" data-consult-action="visit">📷 Nueva visita</button><button class="btn btn-light" data-consult-action="master">✎ Editar en Maestro</button></div></div></section>
      <section class="consultation-columns"><div><h2>Biometrías de la suerte <span>${biometries.length}</span></h2>${biometries.length ? biometries.map((record) => `<article class="mini-record"><div><b>${formatDateShort(record.date)} · ${escapeHtml(record.technician || "Sin técnico")}</b><span>${record.pointCount || record.samples?.length || 0} puntos · ${record.validated ? "Validada" : "Sin validar"} · ${formatNumber(record.projectedTch, 1)} TCH</span></div><button class="btn btn-light" data-edit-biometry="${escapeHtml(record.id)}">Editar</button></article>`).join("") : `<p class="info-note">No hay biometrías guardadas para esta suerte.</p>`}</div><div><h2>Visitas de campo <span>${visits.length}</span></h2>${visits.length ? visits.map((visit) => `<article class="mini-record"><div><b>${formatDateShort(visit.date)} · ${escapeHtml(visit.technician || "Sin técnico")}</b><span>${visit.photos?.length || 0} fotos${visit.purpose ? ` · ${escapeHtml(visit.purpose)}` : ""}</span></div><button class="btn btn-light" data-open-visit="${escapeHtml(visit.id)}">Abrir</button></article>`).join("") : `<p class="info-note">No hay visitas guardadas para esta suerte.</p>`}</div></section>`
      : `<section class="card"><div class="card-body">${emptyState("⌕", "Seleccioná una suerte", "La consulta mostrará su cronológico, estimado Z26/27, biometrías y visitas vinculadas.")}</div></section>
      <section><h2 class="section-title">Biometrías guardadas recientemente</h2>${biometries.length ? biometries.map((record) => `<article class="mini-record"><div><b>${escapeHtml(record.producer)} · Suerte ${escapeHtml(record.lot)}</b><span>${formatDateShort(record.date)} · ${escapeHtml(record.technician || "Sin técnico")}</span></div><strong>${formatNumber(record.projectedTch, 1)} TCH</strong></article>`).join("") : emptyState("🌱", "Sin biometrías", "Todavía no hay registros biométricos guardados.")}</section>`}`;
}

function renderExport() {
  const storage = state.storageEstimate;
  const storagePct = storage?.quota ? (storage.usage / storage.quota) * 100 : null;
  return `${pageHead("Exportar y respaldar", "Descargá XLSX real o protegé toda la información del teléfono.")}
    ${storage ? `<div class="${storagePct > 80 ? "warning" : "info-note"}"><b>Almacenamiento local:</b> ${formatNumber(storage.usage / 1024 / 1024, 1)} MB usados de ${formatNumber(storage.quota / 1024 / 1024, 0)} MB disponibles para el navegador (${formatNumber(storagePct, 1)}%). La app nunca elimina evidencias automáticamente.</div>` : ""}
    <section class="module-grid"><button class="module-card" id="exportExcel"><span class="module-icon">⇩</span><span><small>XLSX TCH</small><strong>Exportar Excel de biometrías</strong><p>Incluye Maestro General, biometrías, puntos, peso opcional, pesajes antiguos y comparativos.</p></span><b>›</b></button><button class="module-card" data-route="visits"><span class="module-icon blue">📷</span><span><small>VISITAS</small><strong>Fotos e historial Excel</strong><p>Abre el historial para exportar PNG, originales y carpetas por hacienda.</p></span><b>›</b></button><button class="module-card" id="exportBackup"><span class="module-icon blue">⬇</span><span><small>RESPALDO</small><strong>Descargar copia JSON</strong><p>Incluye maestro, biometrías, visitas con fotos, pesajes, cosechas reales y auditoría.</p></span><b>›</b></button><button class="module-card" id="restoreBackup"><span class="module-icon gold">⬆</span><span><small>RESTAURACIÓN</small><strong>Restaurar copia</strong><p>Reemplaza los datos locales con un respaldo válido.</p></span><b>›</b></button><button class="module-card" id="saveSettings"><span class="module-icon purple">⚙</span><span><small>CONFIGURACIÓN</small><strong>Técnico predeterminado</strong><p>${escapeHtml(state.settings.technician || "Aún no definido")}</p></span><b>›</b></button></section>`;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function masterUnlocked() {
  return sessionStorage.getItem("casur-master-unlocked") === "1";
}

function renderMaster() {
  if (!masterUnlocked()) {
    return `${pageHead("Maestro General CASUR", "Módulo protegido para actualizar desde Excel o editar manualmente una suerte.")}
      <section class="card"><div class="card-head"><span class="step">🔒</span><div><strong>Acceso protegido</strong><small>Ingresá la contraseña autorizada para administrar el maestro.</small></div></div><div class="card-body">${field("Contraseña", `<input id="masterPassword" type="password" inputmode="numeric" autocomplete="current-password" placeholder="••••••">`)}<button class="btn btn-green btn-wide" id="unlockMaster">Desbloquear módulo</button><div class="info-note">La protección evita cambios accidentales. En una aplicación pública sin servidor no sustituye controles de seguridad centralizados.</div></div></section>`;
  }
  const lot = state.editingLot;
  const syncIcon = state.masterSync.status === "error" ? "!" : state.masterSync.status === "checking" ? "↻" : "✓";
  const syncMessage = state.masterSync.message || `Maestro General disponible: ${state.master.length} suertes.`;
  const pendingMessage = state.settings.masterPendingPublish ? "Hay cambios locales pendientes de publicar en GitHub." : "La copia local coincide con la última versión publicada detectada.";
  const githubAvailable = Boolean(githubDataUrl());
  const producerCount = state.master.filter((r) => r.zone === "5-Productores").length;
  const tenureCounts = { PR: 0, CA: 0, CV: 0 };
  state.master.forEach((lotItem) => { if (Object.hasOwn(tenureCounts, lotItem.tenureCode)) tenureCounts[lotItem.tenureCode] += 1; });
  return `${pageHead("Maestro General CASUR", "Fuente oficial: hoja REPORTE. Zona 0 / Sucuya se excluye automáticamente.")}
    <section class="kpi-grid">
      <article class="kpi"><span>Suertes operativas</span><strong>${state.master.length}</strong><small>todo CASUR válido</small></article>
      <article class="kpi blue"><span>Productores</span><strong>${producerCount}</strong><small>Zona 5 · prioridad</small></article>
      <article class="kpi gold"><span>Área</span><strong>${formatNumber(state.master.reduce((s, r) => s + finiteNumber(r.area), 0), 0)}</strong><small>hectáreas</small></article>
      <article class="kpi red"><span>Tenencia</span><strong>${tenureCounts.PR}/${tenureCounts.CA}/${tenureCounts.CV}</strong><small>PR / CA / CV</small></article>
    </section>
    <section class="card"><div class="card-head"><span class="step">1</span><div><strong>Actualizar y sincronizar</strong><small>Al cargar el cronológico se busca REPORTE, se descarta Sucuya y se valida antes de reemplazar.</small></div></div><div class="card-body"><div class="form-grid two"><button class="btn btn-green btn-wide" id="chooseMasterFile">⬆ Seleccionar Excel de actualización</button><button class="btn btn-blue btn-wide" id="syncMasterGitHub">↻ Sincronizar desde GitHub</button></div><div class="sync-status"><b>${syncIcon}</b><div><strong>${escapeHtml(syncMessage)}</strong><small>${escapeHtml(pendingMessage)}${state.masterSync.checkedAt ? ` Última comprobación: ${escapeHtml(new Date(state.masterSync.checkedAt).toLocaleString("es-NI"))}.` : ""}</small></div></div></div></section>
    <section class="card estimate-update-card"><div class="card-head"><span class="step gold">2</span><div><strong>Actualizar TCH estimado 26/27</strong><small>Módulo independiente y protegido. Valida Código hacienda + Suerte y exige declarar la fecha efectiva del estimado.</small></div></div><div class="card-body"><button class="btn btn-gold btn-wide" id="chooseEstimateFile">⬆ Fecha del estimado + seleccionar Excel</button><div class="info-note">La fecha del estimado es obligatoria y no se sustituye por la fecha de carga ni por la fecha del cronológico. Si el archivo contiene otra fecha, la actualización se bloquea.</div></div></section>
    <section class="card search-card"><div class="card-head"><span class="step blue">3</span><div><strong>Editar suerte manualmente</strong><small>El buscador cubre todo el Maestro General.</small></div></div><div class="card-body">${searchBox(state.masterQuery, "master")}${lot ? `<div class="form-grid three" style="margin-top:12px">
      ${field("Código hacienda", `<input data-master-field="farmCode" value="${escapeHtml(lot.farmCode)}">`)}
      ${field("Hacienda", `<input data-master-field="producer" value="${escapeHtml(lot.producer)}">`)}
      ${field("Suerte", `<input data-master-field="lot" value="${escapeHtml(lot.lot)}">`)}
      ${field("Área neta", `<input data-master-field="area" type="number" step="0.01" value="${escapeHtml(lot.area)}">`)}
      ${field("Variedad", `<input data-master-field="variety" value="${escapeHtml(lot.variety)}">`)}
      ${field("Distancia surco", `<input data-master-field="rowSpacingM" type="number" step="0.01" value="${escapeHtml(lot.rowSpacingM)}">`)}
      ${field("Fecha siembra", `<input data-master-field="plantingDate" type="date" value="${escapeHtml(lot.plantingDate)}">`)}
      ${field("Último corte", `<input data-master-field="lastCutDate" type="date" value="${escapeHtml(lot.lastCutDate)}">`)}
      ${field("Número de corte", `<input data-master-field="cutNumber" value="${escapeHtml(lot.cutNumber)}">`)}
      ${field("Tipo de riego", `<input data-master-field="irrigation" value="${escapeHtml(lot.irrigation)}">`)}
      ${field("Número de riegos", `<input data-master-field="irrigationCount" type="number" step="0.1" value="${escapeHtml(lot.irrigationCount)}">`)}
      ${field("TCH histórico promedio", `<input data-master-field="historicalTch" type="number" step="0.01" value="${escapeHtml(lot.historicalTch)}">`)}
      ${field("TCH zafra 25/26", `<input data-master-field="latestSeasonTch" type="number" step="0.01" value="${escapeHtml(lot.latestSeasonTch)}">`)}
      ${field("TCH ESTIMADO Z26/27", `<input data-master-field="estimatedTch2627" type="number" step="0.01" value="${escapeHtml(lot.estimatedTch2627)}">`)}
      ${field("Fecha efectiva del nuevo estimado", `<input id="manualEstimateDate" type="date" max="${todayISO()}">`, `Obligatoria únicamente si cambiás el TCH ESTIMADO Z26/27. Fecha vigente: ${lot.estimatedTch2627UpdatedAt ? formatDateShort(lot.estimatedTch2627UpdatedAt) : "no indicada"}.`)}
      ${field("Estado cronológico", `<input data-master-field="masterStatus" value="${escapeHtml(lot.masterStatus)}">`)}
      ${field("Observación del maestro", `<input data-master-field="masterObservation" value="${escapeHtml(lot.masterObservation)}">`)}
      ${field("Zona", `<input data-master-field="zone" value="${escapeHtml(lot.zone)}">`)}
      ${field("Tenencia código", `<select data-master-field="tenureCode"><option value="PR" ${lot.tenureCode === "PR" ? "selected" : ""}>PR · Propio</option><option value="CA" ${lot.tenureCode === "CA" ? "selected" : ""}>CA · Arriendo</option><option value="CV" ${lot.tenureCode === "CV" ? "selected" : ""}>CV · Compra Venta</option></select>`)}
      </div><button class="btn btn-blue btn-wide" id="saveManualLot" style="margin-top:12px">▣ Guardar cambios de la suerte</button>` : `<p class="help">Seleccioná una sugerencia para editar la suerte.</p>`}</div></section>
    <section class="card"><div class="card-head"><span class="step gold">4</span><div><strong>Auditoría reciente</strong><small>Valor anterior, valor nuevo, fecha y usuario.</small></div></div><div class="card-body"><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Suerte</th><th>Campo</th><th>Anterior</th><th>Nuevo</th></tr></thead><tbody>${state.audit.slice().sort((a, b) => b.changedAt.localeCompare(a.changedAt)).slice(0, 50).map((a) => `<tr><td>${escapeHtml(formatDateShort(a.changedAt))}</td><td>${escapeHtml(a.lotId)}</td><td>${escapeHtml(a.field)}</td><td>${escapeHtml(a.oldValue)}</td><td>${escapeHtml(a.newValue)}</td></tr>`).join("")}</tbody></table></div></div></section>
    <section class="publish-panel"><h3>5. Publicar la actualización para todos</h3><p>Descargá <b>suertes.json</b> y reemplazalo dentro de <b>data/</b> en el repositorio. La v2.7 consulta este archivo primero y mantiene compatibilidad con productores.json.</p><div class="publish-steps"><div class="publish-step"><b>1</b><span>Aplicar y revisar los cambios.</span></div><div class="publish-step"><b>2</b><span>Descargar suertes.json actualizado.</span></div><div class="publish-step"><b>3</b><span>Publicar el archivo en GitHub cuando esté aprobado.</span></div></div><div class="publish-actions"><button class="btn btn-green" id="downloadMasterJson">⇩ Descargar suertes.json actualizado</button><button class="btn btn-light" id="openGitHubData" ${githubAvailable ? "" : "disabled"}>↗ Abrir carpeta data en GitHub</button></div></section>`;
}

function render() {
  const views = {
    home: renderHome,
    biometry: renderBiometry,
    visits: renderVisits,
    weighing: renderWeighing,
    history: renderHistory,
    analytics: renderAnalytics,
    export: renderExport,
    master: renderMaster,
  };
  app.innerHTML = (views[state.route] || renderHome)();
}

async function captureGps(target) {
  if (!navigator.geolocation) return notify("Este dispositivo no permite capturar GPS.");
  notify("Obteniendo ubicación GPS…");
  navigator.geolocation.getCurrentPosition((position) => {
    Object.assign(target, {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      gpsAccuracyM: position.coords.accuracy,
      capturedAt: new Date().toISOString(),
    });
    render();
    notify(position.coords.accuracy > 30 ? `GPS capturado con precisión baja: ±${Math.round(position.coords.accuracy)} m.` : "GPS capturado correctamente.");
  }, () => notify("No se pudo capturar GPS. Revisá el permiso del navegador."), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
}

function selectLot(id, context) {
  const lot = state.master.find((item) => item.id === id);
  if (!lot) return;
  state.selectedLot = lot;
  if (context === "master") {
    state.editingLot = structuredClone(lot);
    state.masterQuery = `${lot.id} · ${lot.producer} · Suerte ${lot.lot}`;
  }
  if (context === "biometry") {
    state.biometry.search = `${lot.id} · ${lot.producer} · Suerte ${lot.lot}`;
    state.biometry.rowSpacingM = lot.rowSpacingM || 1.65;
    const age = ageFromLot(lot, state.biometry.date);
    if (age.months && finiteNumber(state.biometry.targetAgeMonths) < age.months) {
      state.biometry.targetAgeMonths = TARGET_AGES.find((target) => target >= age.months) || Math.ceil(age.months * 2) / 2;
    }
    invalidateValidation();
  }
  if (context === "weighing") {
    state.weighing.search = `${lot.id} · ${lot.producer} · Suerte ${lot.lot}`;
    state.weighing.rowSpacingM = lot.rowSpacingM || 1.65;
  }
  if (context === "visits") {
    state.visit.search = `${lot.id} · ${lot.producer} · Suerte ${lot.lot}`;
    if (state.visit.tchSource === "biometry") {
      const latest = latestBiometryForLot(lot.id);
      state.visit.linkedBiometryId = latest?.id || "";
      state.visit.estimatedTch = latest?.projectedTch || "";
    }
  }
  if (context === "consultation") {
    state.consultationLotId = lot.id;
    state.consultationQuery = `${lot.id} · ${lot.producer} · Suerte ${lot.lot}`;
  }
  render();
}

function startBiometryForVisit() {
  if (!state.selectedLot) return notify("Seleccioná primero la suerte de la visita.");
  const lot = state.selectedLot;
  state.visitReturnFromBiometry = true;
  resetBiometry();
  state.selectedLot = lot;
  state.biometry.search = `${lot.id} · ${lot.producer} · Suerte ${lot.lot}`;
  state.biometry.rowSpacingM = lot.rowSpacingM || 1.65;
  const age = ageFromLot(lot, state.biometry.date);
  if (age.months && finiteNumber(state.biometry.targetAgeMonths) < age.months) {
    state.biometry.targetAgeMonths = TARGET_AGES.find((target) => target >= age.months) || Math.ceil(age.months * 2) / 2;
  }
  state.route = "biometry";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function addSampleAndOpen() {
  const sample = newSample(state.biometry.samples.length, state.biometry.sampleLengthM);
  state.biometry.samples.push(sample);
  state.biometry.activeSampleId = sample.id;
  invalidateValidation();
  render();
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.route) return go(button.dataset.route);

  if (button.dataset.consultAction && state.selectedLot) {
    const lot = state.selectedLot;
    if (button.dataset.consultAction === "biometry") {
      resetBiometry(); state.selectedLot = lot; selectLot(lot.id, "biometry"); state.route = "biometry"; render();
    }
    if (button.dataset.consultAction === "visit") {
      resetVisit(); state.selectedLot = lot; selectLot(lot.id, "visits"); state.route = "visits"; state.visitView = "new"; render();
    }
    if (button.dataset.consultAction === "master") {
      state.route = "master"; state.editingLot = structuredClone(lot); state.masterQuery = `${lot.id} · ${lot.producer} · Suerte ${lot.lot}`; render();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  if (button.dataset.editBiometry) {
    const record = state.biometries.find((item) => item.id === button.dataset.editBiometry);
    if (record) editBiometry(record);
    return;
  }
  if (button.id === "cancelBiometryEdit") {
    resetBiometry();
    state.route = "history";
    render();
    notify("Edición cancelada. La biometría original no cambió.");
    return;
  }

  if (button.dataset.visitTab) {
    state.visitView = button.dataset.visitTab;
    if (state.visitView === "new" && !state.visit) resetVisit();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  if (button.id === "pwaInstallNotice") {
    if (state.installPrompt) {
      await state.installPrompt.prompt();
      const choice = await state.installPrompt.userChoice;
      state.installPrompt = null;
      if (choice?.outcome === "accepted") {
        pwaInstallNotice.classList.remove("show");
        pwaInstallNotice.hidden = true;
      }
    } else {
      openModal(`<h2>Instalar Estimador TCH</h2><p>La aplicación quedará como un ícono en el teléfono y seguirá funcionando en campo sin conexión.</p><div class="active-lot"><h3>📲 Instalación rápida</h3><p>En Chrome Android tocá el menú <b>⋮</b> y elegí <b>Instalar aplicación</b> o <b>Agregar a pantalla principal</b>.</p></div><button class="btn btn-green btn-wide" data-close-modal>Entendido</button>`);
    }
  }

  if (button.dataset.fieldGuide !== undefined) {
    openModal(`<div class="field-guide-modal">
      <div class="field-guide-hero"><img src="./assets/cana-azucar-real.png" alt="Cultivo de caña de azúcar"><div><small>GUÍA DE CAMPO</small><h2>Biometría TCH en 6 pasos</h2><p>Una referencia visual rápida; cerrala y seguí midiendo sin perder tus datos.</p></div></div>
      <div class="guide-steps">
        <article><b>1</b><span class="guide-icon">⌖</span><div><strong>Seleccioná la suerte</strong><p>Confirmá hacienda, suerte, distancia entre surcos y longitud del tramo.</p></div></article>
        <article><b>2</b><span class="guide-icon">🌱</span><div><strong>Delimitá el tramo</strong><p>Usá 3, 5 o 10 m —o un valor Otro— y contá los tallos del tramo cuando trabajés por conteo.</p></div></article>
        <article><b>3</b><span class="guide-icon">↔</span><div><strong>Obtené POB</strong><p>La app calcula tallos/m con el conteo y la longitud, o podés ingresar POB directa.</p></div></article>
        <article><b>4</b><span class="guide-icon">📏</span><div><strong>Medí H y D</strong><p>Registrá altura media H en metros y diámetro medio D en milímetros.</p></div></article>
        <article><b>5</b><span class="guide-icon">⚖</span><div><strong>Peso, solo si lo necesitás</strong><p>Dejá No por defecto. Si elegís Sí, ingresá tallos pesados y peso total para obtener un contraste por peso.</p></div></article>
        <article><b>6</b><span class="guide-icon">✓</span><div><strong>Repetí y finalizá</strong><p>Añadí los puntos que considerés representativos y luego revisá el TCH proyectado.</p></div></article>
      </div>
      <button class="btn btn-green btn-wide" data-close-modal>Volver a la biometría</button>
    </div>`);
    return;
  }

  if (button.id === "takeVisitPhoto") {
    if (state.visit.photoProcessing) return notify("Esperá a que terminen de cargar las fotografías.");
    visitCameraFile.click();
  }

  if (button.id === "chooseVisitPhotos") {
    if (state.visit.photoProcessing) return notify("Esperá a que terminen de cargar las fotografías.");
    visitGalleryFile.click();
  }

  if (button.dataset.removeVisitPhoto) {
    state.visit.photos = state.visit.photos.filter((photo) => photo.id !== button.dataset.removeVisitPhoto);
    render();
    notify("Fotografía retirada de la visita.");
  }

  if (button.id === "visitGps") captureGps(state.visit);
  if (button.id === "saveVisit") await saveVisit();
  if (button.id === "newBiometryForVisit") startBiometryForVisit();
  if (button.id === "cancelVisitEdit") {
    resetVisit();
    render();
    notify("Edición cancelada. El registro original no cambió.");
  }
  if (button.id === "clearVisitFilters") {
    state.visitQuery = ""; state.visitDateFrom = ""; state.visitDateTo = ""; state.visitProducer = "";
    render();
  }

  if (button.id === "exportVisitsExcel") {
    const visits = filteredVisits();
    if (!visits.length) return notify("No hay visitas para exportar.");
    downloadBlob(createVisitsWorkbookBlob(visits), visitsExcelFilename(visits));
    notify("Historial Excel de visitas generado.");
  }

  if (button.id === "openBulkVisitExport") {
    const filtered = filteredVisits();
    const selected = filtered.filter((visit) => state.selectedVisitIds.has(visit.id));
    openModal(`<h2>Exportación masiva de visitas</h2><p>El ZIP se usa únicamente para agrupar evidencias. El filtro actual contiene <b>${filtered.length}</b> visita(s) y hay <b>${selected.length}</b> seleccionada(s).</p>${field("Alcance", `<select id="bulkVisitScope"><option value="filtered">Todas las filtradas (${filtered.length})</option><option value="selected" ${selected.length ? "" : "disabled"}>Solo seleccionadas (${selected.length})</option></select>`)}<div class="bulk-options"><label><input id="bulkLabeled" type="checkbox" checked> PNG etiquetados</label><label><input id="bulkOriginals" type="checkbox" checked> Originales limpios</label><label><input id="bulkExcel" type="checkbox" checked> Historial Excel</label></div><div class="actions"><button class="btn btn-gold" id="confirmBulkVisitExport">Generar ZIP</button><button class="btn btn-light" data-close-modal>Cancelar</button></div>`);
  }

  if (button.id === "confirmBulkVisitExport") {
    const filtered = filteredVisits();
    const visits = document.querySelector("#bulkVisitScope")?.value === "selected"
      ? filtered.filter((visit) => state.selectedVisitIds.has(visit.id)) : filtered;
    const options = {
      includeLabeled: document.querySelector("#bulkLabeled")?.checked,
      includeOriginals: document.querySelector("#bulkOriginals")?.checked,
      includeExcel: document.querySelector("#bulkExcel")?.checked,
    };
    if (!visits.length) return notify("No hay visitas en el alcance elegido.");
    closeModal();
    try { await exportVisits(visits, options); } catch (error) { notify(error?.message || "No se pudo generar la exportación masiva."); }
  }

  if (button.dataset.openVisit) {
    const visit = state.visits.find((item) => item.id === button.dataset.openVisit);
    if (visit) openVisitDetail(visit);
  }

  if (button.dataset.editVisit) {
    const visit = state.visits.find((item) => item.id === button.dataset.editVisit);
    if (visit) editVisit(visit);
  }

  if (button.dataset.downloadVisitPhoto || button.dataset.shareVisitPhoto) {
    const visitId = button.dataset.downloadVisitPhoto || button.dataset.shareVisitPhoto;
    const visit = state.visits.find((item) => item.id === visitId);
    try {
      const file = await labeledVisitFile(visit, Number(button.dataset.photoIndex));
      if (button.dataset.shareVisitPhoto && navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ files: [file], title: `${visit.producer} · Suerte ${visit.lot}`, text: `Evidencia de campo ${formatDateShort(visit.date)}` });
      } else {
        downloadBlob(file, file.name);
        if (button.dataset.shareVisitPhoto) notify("El teléfono no ofrece compartir archivos desde este navegador; se descargó el PNG.");
      }
    } catch (error) { if (error?.name !== "AbortError") notify(error?.message || "No se pudo preparar el PNG."); }
  }

  if (button.dataset.downloadOriginal) {
    const visit = state.visits.find((item) => item.id === button.dataset.downloadOriginal);
    const index = Number(button.dataset.photoIndex);
    try { downloadBlob(visitPhotoBlob(visit.photos[index]), visitPhotoFilename(visit, index + 1, "jpg").replace(/\.jpg$/, "_ORIGINAL.jpg")); }
    catch (error) { notify(error?.message || "No se pudo descargar el original."); }
  }

  if (button.dataset.deleteVisit) {
    const visit = state.visits.find((item) => item.id === button.dataset.deleteVisit);
    if (!visit || !confirm(`¿Eliminar la visita de ${visit.producer} · suerte ${visit.lot} y sus fotografías del teléfono?`)) return;
    await repository.delete("visits", visit.id);
    state.visits = state.visits.filter((item) => item.id !== visit.id);
    state.selectedVisitIds.delete(visit.id);
    await refreshStorageEstimate();
    render();
    notify("Visita y fotografías eliminadas del teléfono.");
  }

  if (button.dataset.selectLot) return selectLot(button.dataset.selectLot, document.querySelector("#lotSearch")?.dataset.searchContext);

  if (button.id === "addSample" || button.id === "addSampleBottom") return addSampleAndOpen();

  if (button.dataset.openSample) {
    state.biometry.activeSampleId = button.dataset.openSample;
    render();
  }

  if (button.dataset.removeSample) {
    const index = state.biometry.samples.findIndex((sample) => sample.id === button.dataset.removeSample);
    const sample = state.biometry.samples[index];
    if (!sample) return;
    if (sampleHasData(sample) && !confirm(`¿Eliminar ${sample.pointCode}? Tiene datos capturados.`)) return;
    state.biometry.samples.splice(index, 1);
    if (!state.biometry.samples.length) state.biometry.samples.push(newSample(0, state.biometry.sampleLengthM));
    state.biometry.samples.forEach((item, i) => { item.pointCode = `P${String(i + 1).padStart(2, "0")}`; });
    state.biometry.activeSampleId = state.biometry.samples[Math.min(index, state.biometry.samples.length - 1)].id;
    invalidateValidation();
    render();
  }

  if (button.dataset.countMode) {
    const sample = state.biometry.samples.find((s) => s.id === button.dataset.sample);
    if (sample) {
      sample.countMode = button.dataset.countMode;
      invalidateValidation();
      render();
    }
  }

  if (button.dataset.setSampleWeight) {
    const sample = state.biometry.samples.find((s) => s.id === button.dataset.sample);
    if (sample) {
      const enabled = button.dataset.setSampleWeight === "yes";
      sample.weighingEnabled = enabled;
      if (!enabled) {
        sample.weighedStalkCount = "";
        sample.weighedTotalKg = "";
      }
      invalidateValidation();
      render();
    }
  }

  if (button.dataset.gpsSample) {
    const sample = state.biometry.samples.find((s) => s.id === button.dataset.gpsSample);
    if (sample) captureGps(sample);
  }

  if (button.dataset.revisitPoint) {
    const prior = previousPointVisits().find((point) => point.pointCode === button.dataset.revisitPoint);
    if (prior) {
      let target = state.biometry.samples.find((sample) => sample.pointCode === prior.pointCode);
      if (!target) {
        target = newSample(state.biometry.samples.length, state.biometry.sampleLengthM);
        target.pointCode = prior.pointCode;
        state.biometry.samples.push(target);
      }
      Object.assign(target, {
        latitude: prior.latitude,
        longitude: prior.longitude,
        gpsAccuracyM: prior.gpsAccuracyM,
        notes: `Revisita de ${prior.pointCode}`,
      });
      state.biometry.activeSampleId = target.id;
      render();
      notify(`Punto ${prior.pointCode} preparado para revisita.`);
    }
  }

  if (button.id === "finishSamples") {
    if (!state.selectedLot) return notify("Seleccioná una suerte antes de finalizar.");
    const summary = biometrySummary();
    if (!summary.count) return notify("Completá por lo menos un punto con POB, H y D.");
    state.biometry.phase = "calculate";
    window.scrollTo({ top: 0, behavior: "smooth" });
    render();
  }

  if (button.id === "editMeasurements") {
    state.biometry.phase = "measure";
    window.scrollTo({ top: 0, behavior: "smooth" });
    render();
  }

  if (button.id === "validateCalculation") {
    const summary = biometrySummary();
    if (!summary.projected || !summary.count) return notify("Completá el cálculo antes de validarlo.");
    if (state.biometry.validation.validated) return notify("Este cálculo ya está validado.");
    state.biometry.validation = {
      validated: true,
      validatedAt: new Date().toISOString(),
      validatedBy: state.biometry.technician || state.settings.technician || "Sin registrar",
    };
    render();
    notify("Cálculo validado. Si modificás un dato, la validación se retirará.");
  }

  if (button.id === "saveBiometry") await saveBiometry(false);
  if (button.id === "saveBiometryExcel") await saveBiometry(true);

  if (button.id === "downloadResultImage") {
    const summary = biometrySummary();
    if (!state.selectedLot) return notify("Seleccioná una suerte para generar la imagen.");
    if (!summary.count || !summary.projected) return notify("Completá al menos un punto válido y la proyección.");
    try {
      notify("Preparando imagen ejecutiva…");
      const blob = await createResultImageBlob({ lot: state.selectedLot, biometry: state.biometry, summary });
      downloadBlob(blob, `Resultado_TCH_${safeFilename(state.selectedLot.id)}_${state.biometry.date}.png`);
      notify("Imagen PNG generada correctamente.");
    } catch (error) {
      notify(error?.message || "No se pudo generar la imagen.");
    }
  }

  if (button.dataset.weightMethod) {
    state.weighing.method = button.dataset.weightMethod;
    render();
  }
  if (button.id === "weightGps") captureGps(state.weighing);
  if (button.id === "saveWeighing") await saveWeighing();

  if (button.id === "exportExcel") {
    if (!state.biometries.length && !state.weighings.length) return notify("No hay evaluaciones para exportar.");
    downloadWorkbook({ master: state.master, biometries: state.biometries, weighings: state.weighings, harvests: state.harvests });
    notify("Excel generado correctamente.");
  }

  if (button.id === "exportBackup") {
    const payload = await repository.exportAll();
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `Respaldo_TCH_CASUR_${todayISO()}.json`);
    notify("Respaldo descargado.");
  }

  if (button.id === "restoreBackup") backupFile.click();

  if (button.id === "saveSettings") {
    openModal(`<h2>Técnico predeterminado</h2><p>Se completará automáticamente en nuevas evaluaciones.</p>${field("Nombre", `<input id="settingsTechnician" value="${escapeHtml(state.settings.technician || "")}">`)}<div class="actions"><button class="btn btn-green" id="confirmSettings">Guardar</button><button class="btn btn-light" data-close-modal>Cancelar</button></div>`);
  }

  if (button.id === "confirmSettings") {
    state.settings.technician = document.querySelector("#settingsTechnician").value.trim();
    await persistSettings();
    closeModal();
    render();
    notify("Configuración guardada.");
  }

  if (button.id === "confirmCustomSpacing") {
    const value = finiteNumber(document.querySelector("#customSpacingModal")?.value);
    if (value < 1 || value > 3) return notify("Ingresá una distancia entre 1.00 y 3.00 m.");
    state.biometry.rowSpacingM = value;
    invalidateValidation();
    closeModal();
    render();
    notify(`Distancia entre surcos: ${formatNumber(value, 2)} m.`);
  }

  if (button.id === "confirmCustomLength") {
    const value = finiteNumber(document.querySelector("#customLengthModal")?.value);
    if (value <= 0 || value > 50) return notify("Ingresá una longitud de tramo válida, hasta 50 m.");
    state.biometry.sampleLengthM = value;
    state.biometry.samples.forEach((sample) => { sample.sampleLengthM = value; });
    invalidateValidation();
    closeModal();
    render();
    notify(`Longitud común del tramo: ${formatNumber(value, 1)} m.`);
  }

  if (button.id === "cancelCustomMeasure") {
    closeModal();
    render();
  }

  if (button.id === "confirmCustomAge") {
    const customAge = finiteNumber(document.querySelector("#customAgeModal")?.value);
    const currentAge = biometrySummary().age.months;
    if (customAge <= 0 || customAge > 24) return notify("Ingresá una edad entre 1 y 24 meses.");
    if (currentAge && customAge < currentAge) return notify("La edad de referencia no puede ser menor que la edad actual.");
    state.biometry.targetAgeMonths = customAge;
    invalidateValidation();
    closeModal();
    render();
    notify(`Edad de referencia establecida en ${formatNumber(customAge, 1)} meses.`);
  }

  if (button.dataset.closeModal !== undefined) closeModal();

  if (button.id === "unlockMaster") {
    const input = document.querySelector("#masterPassword");
    if (await sha256(input.value) === MASTER_PASSWORD_HASH) {
      sessionStorage.setItem("casur-master-unlocked", "1");
      render();
      notify("Módulo Maestro desbloqueado.");
    } else notify("Contraseña incorrecta.");
  }

  if (button.id === "chooseMasterFile") masterFile.click();
  if (button.id === "chooseEstimateFile") {
    openModal(`<h2>Fecha efectiva del TCH estimado</h2><p>Indicá la fecha a la que corresponden los valores del Excel. Esta fecha quedará vinculada a todos los TCH importados.</p>${field("Fecha del estimado (obligatoria)", `<input id="estimateDeclaredDate" type="date" max="${todayISO()}" value="${escapeHtml(state.pendingEstimateSourceDate || "")}">`, "No ingresés la fecha de carga ni la fecha del cronológico, salvo que realmente sea la fecha de emisión del estimado.")}<div class="actions"><button class="btn btn-green" id="confirmEstimateDate">Continuar y seleccionar Excel</button><button class="btn btn-light" data-close-modal>Cancelar</button></div>`);
  }
  if (button.id === "confirmEstimateDate") {
    const value = document.querySelector("#estimateDeclaredDate")?.value;
    if (!value) return notify("La fecha del estimado es obligatoria.");
    if (value > todayISO()) return notify("La fecha del estimado no puede estar en el futuro.");
    state.pendingEstimateSourceDate = value;
    closeModal();
    estimateFile.click();
  }
  if (button.id === "syncMasterGitHub") await syncPublishedMaster({ force: true, userInitiated: true });

  if (button.id === "downloadMasterJson") {
    const rows = masterToEmbeddedRows(state.master);
    downloadBlob(new Blob([JSON.stringify(rows, null, 2)], { type: "application/json;charset=utf-8" }), "suertes.json");
    notify("suertes.json actualizado y listo para publicar cuando lo aprobés.");
  }

  if (button.id === "openGitHubData") {
    const url = githubDataUrl();
    if (!url) return notify("Este botón se activa cuando la app está publicada en GitHub Pages.");
    window.open(url, "_blank", "noopener,noreferrer");
  }

  if (button.id === "confirmMasterImport") {
    await repository.replaceAll("master", state.pendingMaster.lots);
    state.master = state.pendingMaster.lots;
    state.pendingMaster = null;
    markMasterPendingPublish();
    closeModal();
    render();
    notify("Maestro General actualizado en este dispositivo. Descargá suertes.json para publicarlo cuando esté aprobado.");
  }

  if (button.id === "confirmEstimateImport") {
    const pending = state.pendingEstimateImport;
    if (!pending?.report?.canApply) return notify("La validación no permite aplicar esta fuente.");
    const previous = new Map(state.master.map((lot) => [lot.id, lot]));
    const auditRows = pending.lots.flatMap((lot) => {
      const old = previous.get(lot.id)?.estimatedTch2627 ?? null;
      return Number(old || 0) === Number(lot.estimatedTch2627 || 0) ? [] : [auditChange(lot, "estimatedTch2627", old, lot.estimatedTch2627, state.settings.technician || "Importación oficial")];
    });
    await repository.replaceAll("master", pending.lots);
    if (auditRows.length) await repository.putMany("audit", auditRows);
    state.master = pending.lots;
    state.audit.push(...auditRows);
    state.settings.estimate2627LastImport = pending.report;
    state.pendingEstimateImport = null;
    state.pendingEstimateSourceDate = "";
    markMasterPendingPublish();
    await persistSettings();
    closeModal();
    render();
    notify(`TCH 26/27 actualizado: ${pending.report.withEstimate} valores y ${pending.report.withoutEstimate} vacíos oficiales.`);
  }

  if (button.id === "saveManualLot") {
    const original = state.master.find((lotItem) => lotItem.id === state.editingLot.id);
    if (!original) return;
    const changes = [];
    document.querySelectorAll("[data-master-field]").forEach((input) => {
      const fieldName = input.dataset.masterField;
      const next = input.type === "number" ? finiteNumber(input.value) : input.value.trim();
      if (String(original[fieldName] ?? "") !== String(next ?? "")) changes.push({ fieldName, oldValue: original[fieldName], newValue: next });
    });
    if (!changes.length) return notify("No hay cambios para guardar.");
    const estimateChanged = changes.some((change) => change.fieldName === "estimatedTch2627");
    if (estimateChanged) {
      const effectiveDate = document.querySelector("#manualEstimateDate")?.value || "";
      if (!effectiveDate) return notify("Indicá la fecha efectiva del nuevo TCH estimado.");
      if (effectiveDate > todayISO()) return notify("La fecha del estimado no puede estar en el futuro.");
      if (String(original.estimatedTch2627UpdatedAt || "") !== effectiveDate) {
        changes.push({ fieldName: "estimatedTch2627UpdatedAt", oldValue: original.estimatedTch2627UpdatedAt || "", newValue: effectiveDate });
      }
    }
    changes.forEach((change) => { original[change.fieldName] = change.newValue; });
    if (estimateChanged) {
      original.estimatedTch2627Source = `Edición manual protegida · fecha declarada ${original.estimatedTch2627UpdatedAt}`;
    }
    if (changes.some((change) => change.fieldName === "tenureCode")) {
      original.tenureLabel = original.tenureCode === "CA" ? "Arriendo" : original.tenureCode === "CV" ? "Compra Venta" : original.tenureCode === "PR" ? "Propio" : "";
    }
    const auditRows = changes.map((change) => auditChange(original, change.fieldName, change.oldValue, change.newValue, state.settings.technician || "Técnico"));
    await repository.put("master", original);
    await repository.putMany("audit", auditRows);
    state.audit.push(...auditRows);
    state.editingLot = structuredClone(original);
    markMasterPendingPublish();
    render();
    notify(`${changes.length} cambio(s) guardado(s) con auditoría.`);
  }

  if (button.dataset.deleteRecord) {
    if (!confirm("¿Eliminar este registro del teléfono?")) return;
    await repository.delete(button.dataset.recordKind, button.dataset.deleteRecord);
    state[button.dataset.recordKind] = state[button.dataset.recordKind].filter((record) => record.id !== button.dataset.deleteRecord);
    render();
    notify("Registro eliminado.");
  }

  if (button.dataset.realHarvest) {
    const lot = state.master.find((item) => item.id === button.dataset.realHarvest) || state.selectedLot;
    openModal(`<h2>Registrar TCH real</h2><p>${escapeHtml(lot?.producer || "")} · Suerte ${escapeHtml(lot?.lot || "")}</p><div class="form-grid two">${field("Fecha de cosecha", `<input id="realDate" type="date" value="${todayISO()}">`)}${field("TCH real de báscula", `<input id="realTch" type="number" inputmode="decimal" step="0.1">`)}</div>${field("Observación", `<textarea id="realNotes"></textarea>`)}<div class="actions"><button class="btn btn-green" id="saveRealHarvest" data-lot-id="${escapeHtml(button.dataset.realHarvest)}">Guardar</button><button class="btn btn-light" data-close-modal>Cancelar</button></div>`);
  }

  if (button.id === "saveRealHarvest") {
    const lot = state.master.find((item) => item.id === button.dataset.lotId);
    const tchReal = finiteNumber(document.querySelector("#realTch").value);
    if (!lot || tchReal <= 0) return notify("Ingresá un TCH real válido.");
    const record = {
      id: createId("harvest"),
      lotId: lot.id,
      farmCode: lot.farmCode,
      producer: lot.producer,
      lot: lot.lot,
      area: lot.area,
      date: document.querySelector("#realDate").value,
      tchReal,
      notes: document.querySelector("#realNotes").value,
      createdAt: new Date().toISOString(),
    };
    await repository.put("harvests", record);
    state.harvests.push(record);
    closeModal();
    notify("TCH real guardado.");
  }
});

document.addEventListener("input", (event) => {
  const input = event.target;
  if (input.id === "lotSearch") {
    const context = input.dataset.searchContext;
    if (context === "biometry") state.biometry.search = input.value;
    if (context === "weighing") state.weighing.search = input.value;
    if (context === "visits") state.visit.search = input.value;
    if (context === "master") state.masterQuery = input.value;
    if (context === "consultation") state.consultationQuery = input.value;
    renderSuggestions(input.value);
  }

  if (input.id === "historySearch") {
    state.historyQuery = input.value;
    const cursor = input.selectionStart;
    render();
    const next = document.querySelector("#historySearch");
    next?.focus();
    next?.setSelectionRange(cursor, cursor);
  }

  if (input.id === "visitHistorySearch") {
    state.visitQuery = input.value;
    const cursor = input.selectionStart;
    render();
    const next = document.querySelector("#visitHistorySearch");
    next?.focus();
    next?.setSelectionRange(cursor, cursor);
  }

  const visitMap = {
    visitTechnician: "technician",
    visitLodging: "lodgingPct",
    visitLodgingDescription: "lodgingDescription",
    visitEstimatedTch: "estimatedTch",
    visitTchDescription: "tchDescription",
    visitNotes: "notes",
  };
  if (visitMap[input.id]) state.visit[visitMap[input.id]] = input.value;
  if (input.dataset.visitCustom) state.visit[`${input.dataset.visitCustom}Custom`] = input.value;

  if (input.dataset.sampleField) {
    const sample = state.biometry.samples.find((s) => s.id === input.dataset.sample);
    if (sample) {
      sample[input.dataset.sampleField] = input.value;
      invalidateValidation();
      updateActivePointResult();
    }
  }

  const bioMap = { bioTechnician: "technician", adjustmentPct: "adjustmentPct", bioNotes: "notes" };
  if (bioMap[input.id]) {
    state.biometry[bioMap[input.id]] = input.type === "number" ? finiteNumber(input.value) : input.value;
    if (input.id !== "bioTechnician") invalidateValidation();
    if (state.biometry.phase === "measure") updateActivePointResult();
  }

  const weightMap = {
    weightTechnician: "technician",
    weightSpacing: "rowSpacingM",
    weightLength: "sampleLengthM",
    totalWeight: "totalWeightKg",
    weightStalkCount: "stalkCount",
    weightStalksM: "stalksPerMeter",
    averageStalkWeight: "averageStalkWeightKg",
    weightNotes: "notes",
  };
  if (weightMap[input.id]) {
    state.weighing[weightMap[input.id]] = input.value;
    const result = document.querySelector("#weightResult");
    if (result) result.textContent = formatNumber(weighingResult(), 1);
  }
});

document.addEventListener("change", (event) => {
  const input = event.target;

  if (input.dataset.selectVisit) {
    if (input.checked) state.selectedVisitIds.add(input.dataset.selectVisit);
    else state.selectedVisitIds.delete(input.dataset.selectVisit);
  }

  if (["visitDateFrom", "visitDateTo", "visitProducer"].includes(input.id)) {
    if (input.id === "visitDateFrom") state.visitDateFrom = input.value;
    if (input.id === "visitDateTo") state.visitDateTo = input.value;
    if (input.id === "visitProducer") state.visitProducer = input.value;
    render();
  }

  if (input.id === "bioDate") {
    state.biometry.date = input.value;
    const age = ageFromLot(state.selectedLot, state.biometry.date);
    if (age.months && finiteNumber(state.biometry.targetAgeMonths) < age.months) {
      state.biometry.targetAgeMonths = TARGET_AGES.find((target) => target >= age.months) || Math.ceil(age.months * 2) / 2;
    }
    invalidateValidation();
    render();
  }

  if (input.id === "visitDate") state.visit.date = input.value;

  if (input.dataset.visitCategory) {
    state.visit[input.dataset.visitCategory] = input.value;
    if (input.value !== "__other__") state.visit[`${input.dataset.visitCategory}Custom`] = "";
    render();
  }

  if (input.id === "visitTchSource") {
    state.visit.tchSource = input.value;
    if (input.value === "none") state.visit.estimatedTch = "";
    if (input.value === "biometry" && state.selectedLot) {
      const latest = latestBiometryForLot(state.selectedLot.id);
      state.visit.linkedBiometryId = latest?.id || "";
      state.visit.estimatedTch = latest?.projectedTch || "";
    }
    render();
  }

  if (input.id === "visitBiometryId") {
    const record = state.biometries.find((item) => item.id === input.value);
    state.visit.linkedBiometryId = record?.id || "";
    state.visit.estimatedTch = record?.projectedTch || "";
    render();
  }

  if (input.id === "bioSpacingPreset") {
    if (input.value === "other") {
      openModal(`<h2>Otra distancia entre surcos</h2><p>1.40 m ya no aparece como opción rápida, pero puede registrarse aquí si encontrás una suerte que todavía lo requiera.</p>${field("Distancia", `<div class="input-unit"><input id="customSpacingModal" type="number" inputmode="decimal" min="1" max="3" step="0.01" value="${escapeHtml(formatNumber(state.biometry.rowSpacingM, 2))}"><b>m</b></div>`)}<div class="actions"><button class="btn btn-green" id="confirmCustomSpacing">Aplicar</button><button class="btn btn-light" id="cancelCustomMeasure">Cancelar</button></div>`);
    } else {
      state.biometry.rowSpacingM = finiteNumber(input.value);
      invalidateValidation();
      render();
    }
  }

  if (input.id === "bioLengthPreset") {
    if (input.value === "other") {
      openModal(`<h2>Otra longitud de tramo</h2><p>Las opciones rápidas son 3, 5 y 10 m. Podés registrar otra longitud cuando el muestreo lo requiera.</p>${field("Longitud", `<div class="input-unit"><input id="customLengthModal" type="number" inputmode="decimal" min="0.5" max="50" step="0.5" value="${escapeHtml(formatNumber(state.biometry.sampleLengthM, 1))}"><b>m</b></div>`)}<div class="actions"><button class="btn btn-green" id="confirmCustomLength">Aplicar</button><button class="btn btn-light" id="cancelCustomMeasure">Cancelar</button></div>`);
    } else {
      const value = finiteNumber(input.value);
      state.biometry.sampleLengthM = value;
      state.biometry.samples.forEach((sample) => { sample.sampleLengthM = value; });
      invalidateValidation();
      render();
    }
  }

  if (input.id === "targetAge") {
    if (input.value === "custom") {
      const previousAge = finiteNumber(state.biometry.targetAgeMonths) || 10;
      openModal(`<h2>Edad de referencia personalizada</h2><p>Indicá el horizonte técnico que querés usar para la proyección; no representa necesariamente la fecha real de cosecha.</p>${field("Edad de referencia", `<div class="input-unit"><input id="customAgeModal" type="number" inputmode="decimal" min="1" max="24" step="0.1" value="${escapeHtml(previousAge)}"><b>meses</b></div>`)}<div class="actions"><button class="btn btn-green" id="confirmCustomAge">Aplicar edad</button><button class="btn btn-light" data-close-modal>Cancelar</button></div>`);
    } else {
      state.biometry.targetAgeMonths = finiteNumber(input.value);
      invalidateValidation();
      render();
    }
  }

  if (input.id === "adjustmentPct" || input.id === "bioNotes") {
    invalidateValidation();
    render();
  }

  if (input.id === "adjustmentReason") {
    state.biometry.adjustmentReason = input.value;
    invalidateValidation();
    render();
  }

  if (input.id === "weightDate") {
    state.weighing.date = input.value;
    render();
  }
});

async function handleVisitPhotoFiles(fileList) {
  const files = snapshotPhotoFiles(fileList);
  if (!files.length) return;
  state.visit.photoProcessing = true;
  state.visit.photoProgress = `Preparando 1 de ${files.length}…`;
  render();
  notify(`Optimizando ${files.length} fotografía(s)…`);
  let added = 0;
  let failed = 0;
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    state.visit.photoProgress = `Preparando ${index + 1} de ${files.length}…`;
    render();
    try {
      state.visit.photos.push(await prepareVisitPhoto(file));
      added += 1;
    } catch (error) {
      failed += 1;
    }
  }
  state.visit.photoProcessing = false;
  state.visit.photoProgress = "";
  render();
  if (!added) return notify("No se pudo cargar la fotografía. Probá tomarla nuevamente o elegir otra de la galería.");
  notify(`${added} fotografía(s) agregada(s). ${state.visit.photos.length} lista(s) en total${failed ? ` · ${failed} no compatible(s)` : ""}.`);
}

visitCameraFile.addEventListener("change", async () => {
  const files = snapshotPhotoFiles(visitCameraFile.files);
  visitCameraFile.value = "";
  await handleVisitPhotoFiles(files);
});

visitGalleryFile.addEventListener("change", async () => {
  const files = snapshotPhotoFiles(visitGalleryFile.files);
  visitGalleryFile.value = "";
  await handleVisitPhotoFiles(files);
});

masterFile.addEventListener("change", async () => {
  const file = masterFile.files[0];
  masterFile.value = "";
  if (!file) return;
  try {
    notify("Analizando la hoja REPORTE del Maestro General…");
    state.pendingMaster = await parseMasterWorkbook(file, state.master);
    const r = state.pendingMaster.report;
    openModal(`<h2>Validación del Maestro General</h2><p>Hoja leída: <b>${escapeHtml(state.pendingMaster.sheetName)}</b>. Revisá el resumen antes de reemplazar la copia local.</p><div class="kpi-grid"><article class="kpi"><span>Analizados</span><strong>${r.analyzed}</strong></article><article class="kpi blue"><span>Válidos</span><strong>${r.valid}</strong></article><article class="kpi gold"><span>Productores</span><strong>${r.producers ?? "—"}</strong></article><article class="kpi red"><span>Excluidos</span><strong>${r.excluded ?? 0}</strong></article></div><div class="${r.errors.length || r.duplicates.length ? "warning" : "success"}">${r.duplicates.length} código(s) duplicado(s) · ${r.errors.length} error(es) · ${r.added} nuevos · ${r.modified} modificados · ${r.unchanged} sin cambios.${r.excluded ? ` ${r.excluded} registros de ${escapeHtml(r.excludedReason)} fueron excluidos.` : ""}</div>${r.errors.length ? `<div class="table-wrap"><table><thead><tr><th>Fila</th><th>Error</th></tr></thead><tbody>${r.errors.slice(0, 30).map((e) => `<tr><td>${e.row}</td><td>${escapeHtml(e.issue)}</td></tr>`).join("")}</tbody></table></div>` : ""}<div class="actions"><button class="btn btn-green" id="confirmMasterImport" ${r.valid ? "" : "disabled"}>Confirmar actualización</button><button class="btn btn-light" data-close-modal>Cancelar</button></div>`);
  } catch (error) {
    notify(error.message || "No se pudo leer el Maestro General.");
  }
});

estimateFile.addEventListener("change", async () => {
  const file = estimateFile.files[0];
  estimateFile.value = "";
  if (!file) return;
  try {
    notify("Validando TCH estimado 26/27 por hacienda y suerte…");
    if (!state.pendingEstimateSourceDate) throw new Error("Primero debés declarar la fecha efectiva del estimado.");
    state.pendingEstimateImport = await parseSeasonEstimateWorkbook(file, state.master, {
      declaredSourceDate: state.pendingEstimateSourceDate,
      requireDeclaredDate: true,
    });
    const r = state.pendingEstimateImport.report;
    openModal(`<h2>Validación TCH estimado 26/27</h2><p><b>${escapeHtml(r.sheetName)}</b> · columna <b>${escapeHtml(r.sourceColumn)}</b> · fecha declarada <b>${escapeHtml(formatDateShort(r.declaredSourceDate))}</b>.</p>${r.dateMismatch ? `<div class="warning"><b>Fechas incompatibles.</b> El archivo indica ${escapeHtml(formatDateShort(r.detectedSourceDate))}, pero declaraste ${escapeHtml(formatDateShort(r.declaredSourceDate))}. Cancelá y confirmá la fecha correcta antes de aplicar.</div>` : `<div class="success">✓ Fecha del estimado validada: ${escapeHtml(formatDateShort(r.sourceDate))}.</div>`}<div class="kpi-grid"><article class="kpi"><span>Analizados</span><strong>${r.analyzed}</strong></article><article class="kpi blue"><span>Vinculados</span><strong>${r.matched}</strong></article><article class="kpi gold"><span>Con TCH</span><strong>${r.withEstimate}</strong></article><article class="kpi red"><span>Vacíos oficiales</span><strong>${r.withoutEstimate}</strong></article></div><div class="${r.canApply ? "success" : "warning"}">${r.updated} cambio(s) · ${r.unchanged} sin cambio · ${r.duplicates.length} duplicado(s) · ${r.unknown.length} no encontrado(s). De los vacíos, ${r.seedWithoutEstimate} corresponden a semilla y ${r.withoutEstimateOther} a otros registros.</div><p class="help">Esta operación actualiza solamente el TCH estimado 26/27 y conserva intactos los demás datos del Maestro.</p><div class="actions"><button class="btn btn-green" id="confirmEstimateImport" ${r.canApply ? "" : "disabled"}>Aplicar actualización 26/27</button><button class="btn btn-light" data-close-modal>Cancelar</button></div>`);
  } catch (error) {
    notify(error.message || "No se pudo validar el TCH estimado 26/27.");
  }
});

backupFile.addEventListener("change", async () => {
  const file = backupFile.files[0];
  backupFile.value = "";
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    await repository.restoreAll(payload);
    await loadState();
    render();
    notify("Respaldo restaurado correctamente.");
  } catch (error) {
    notify(error.message || "El respaldo no es válido.");
  }
});

modal.addEventListener("click", (event) => { if (event.target === modal) closeModal(); });
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.installPrompt = event;
  updateInstallNotice();
});
window.addEventListener("appinstalled", () => {
  state.installPrompt = null;
  updateInstallNotice();
  notify("Estimador TCH instalado correctamente.");
});
window.matchMedia?.("(display-mode: standalone)")?.addEventListener?.("change", updateInstallNotice);
window.addEventListener("online", updateConnection);
window.addEventListener("offline", updateConnection);

function updateConnection() {
  const badge = document.querySelector("#connectionBadge");
  badge.textContent = navigator.onLine ? "● En línea" : "● Modo campo";
  badge.classList.toggle("offline", !navigator.onLine);
}

// [INTEGRACIÓN App Maestra] Service Worker propio DESACTIVADO.
// Dentro de "Negocios de Caña CASUR" solo debe existir el SW raíz. Se
// neutraliza también el auto-reload por 'controllerchange' para que el
// iframe no se recargue cuando el SW maestro reclama el control (clients.claim).
// El repositorio fuente standalone conserva su SW intacto.
// if ("serviceWorker" in navigator) {
//   let reloadingForUpdate = false;
//   navigator.serviceWorker.addEventListener("controllerchange", () => {
//     if (reloadingForUpdate) return;
//     reloadingForUpdate = true;
//     window.location.reload();
//   });
//   navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" })
//     .then((registration) => registration.update())
//     .catch(() => {});
// }
await loadState();
updateConnection();
render();
updateInstallNotice();
