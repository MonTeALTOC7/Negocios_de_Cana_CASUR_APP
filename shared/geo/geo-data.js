const GEO_SCHEMA = "casur-master-geometry";
const GEO_SCHEMA_VERSION = 2;
const DEFAULT_MANIFEST_URL = new URL("./data/manifest.json", import.meta.url).href;

let runtime = {
  manifestUrl: DEFAULT_MANIFEST_URL,
  fetchImpl: null,
};

let manifest = null;
let manifestPromise = null;
let lastError = null;
const zonePromises = new Map();
const zoneCache = new Map();

/** Canonical identity shared by the SHP build and the App lot catalog. */
export function normalizeGeoLotId(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim().toUpperCase();
}

function absoluteUrl(value, base = import.meta.url) {
  return new URL(String(value), base).href;
}

function resetCaches() {
  manifest = null;
  manifestPromise = null;
  lastError = null;
  zonePromises.clear();
  zoneCache.clear();
}

/**
 * Optional dependency injection for tests or alternate deployments.
 * Changing either dependency invalidates every in-memory cache.
 */
export function configureGeoData(options = {}) {
  const nextManifestUrl = options.manifestUrl
    ? absoluteUrl(options.manifestUrl, typeof location !== "undefined" ? location.href : import.meta.url)
    : runtime.manifestUrl;
  const nextFetch = Object.prototype.hasOwnProperty.call(options, "fetch")
    ? options.fetch
    : runtime.fetchImpl;

  if (nextFetch !== null && typeof nextFetch !== "function") {
    throw new TypeError("fetch debe ser una función");
  }

  if (nextManifestUrl !== runtime.manifestUrl || nextFetch !== runtime.fetchImpl) {
    runtime = { manifestUrl: nextManifestUrl, fetchImpl: nextFetch };
    resetCaches();
  }
  return getGeoStatus();
}

function fetcher() {
  const candidate = runtime.fetchImpl || globalThis.fetch;
  if (typeof candidate !== "function") {
    throw new Error("Fetch no está disponible para cargar la referencia geográfica");
  }
  return candidate.bind(runtime.fetchImpl ? null : globalThis);
}

async function fetchJson(url, label) {
  const response = await fetcher()(url, {
    headers: { Accept: "application/json, application/geo+json" },
  });
  if (!response || !response.ok) {
    const status = response ? `HTTP ${response.status}` : "sin respuesta";
    throw new Error(`No se pudo cargar ${label}: ${status}`);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`No se pudo interpretar ${label}: ${error?.message || error}`);
  }
}

function validBbox(value) {
  return Array.isArray(value)
    && value.length === 4
    && value.every(Number.isFinite)
    && value[0] <= value[2]
    && value[1] <= value[3]
    && value[0] >= -180
    && value[2] <= 180
    && value[1] >= -90
    && value[3] <= 90;
}

function validateManifest(value) {
  if (!value || typeof value !== "object") throw new Error("Manifest geográfico ausente o inválido");
  if (value.schema !== GEO_SCHEMA) throw new Error(`Schema geográfico no compatible: ${value.schema || "ausente"}`);
  if (value.schemaVersion !== GEO_SCHEMA_VERSION) {
    throw new Error(`Versión de schema geográfico no compatible: ${value.schemaVersion ?? "ausente"}`);
  }
  if (value.crs !== "EPSG:4326") throw new Error(`CRS geográfico no compatible: ${value.crs || "ausente"}`);
  if (!validBbox(value.bounds)) throw new Error("Bounds globales inválidos en manifest geográfico");
  if (!value.zones || typeof value.zones !== "object" || Array.isArray(value.zones)) {
    throw new Error("El manifest geográfico no define zones");
  }
  if (!value.lotIndex || typeof value.lotIndex !== "object" || Array.isArray(value.lotIndex)) {
    throw new Error("El manifest geográfico no define lotIndex");
  }
  return value;
}

export async function loadGeoManifest() {
  if (manifest) return manifest;
  if (manifestPromise) return manifestPromise;

  lastError = null;
  manifestPromise = fetchJson(runtime.manifestUrl, "el manifest geográfico")
    .then(validateManifest)
    .then((loaded) => {
      manifest = loaded;
      return manifest;
    })
    .catch((error) => {
      lastError = error;
      manifestPromise = null;
      throw error;
    });
  return manifestPromise;
}

function zoneFile(zoneKey, zoneMeta) {
  if (typeof zoneMeta === "string" && zoneMeta.trim()) return zoneMeta;
  if (zoneMeta && typeof zoneMeta === "object") {
    const candidate = zoneMeta.file || zoneMeta.url || zoneMeta.path;
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  throw new Error(`La zona ${zoneKey} no tiene un archivo geográfico válido`);
}

function validateFeature(feature, zoneKey) {
  if (!feature || feature.type !== "Feature") throw new Error(`Feature inválida en zona ${zoneKey}`);
  const lotId = normalizeGeoLotId(feature.properties?.lotId);
  if (!lotId) throw new Error(`Feature sin lotId en zona ${zoneKey}`);
  if (!validBbox(feature.bbox)) throw new Error(`Feature ${lotId} tiene bbox inválida`);
  if (!feature.geometry || !["Polygon", "MultiPolygon"].includes(feature.geometry.type)) {
    throw new Error(`Feature ${lotId} no contiene geometría poligonal`);
  }
  const anchor = feature.properties?.anchor;
  if (!Array.isArray(anchor) || anchor.length !== 2 || !anchor.every(Number.isFinite)
      || anchor[0] < -180 || anchor[0] > 180 || anchor[1] < -90 || anchor[1] > 90) {
    throw new Error(`Feature ${lotId} no contiene anchor válido`);
  }
  return lotId;
}

function indexZone(collection, zoneKey) {
  if (!collection || collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    throw new Error(`La zona ${zoneKey} no es un FeatureCollection válido`);
  }
  const byLotId = new Map();
  collection.features.forEach((feature) => {
    const lotId = validateFeature(feature, zoneKey);
    if (byLotId.has(lotId)) throw new Error(`lotId duplicado ${lotId} en zona ${zoneKey}`);
    byLotId.set(lotId, feature);
  });
  return { collection, byLotId };
}

async function loadZone(zoneKey, loadedManifest) {
  if (zoneCache.has(zoneKey)) return zoneCache.get(zoneKey);
  if (zonePromises.has(zoneKey)) return zonePromises.get(zoneKey);

  const meta = loadedManifest.zones[zoneKey];
  if (meta === undefined) throw new Error(`Zona geográfica desconocida: ${zoneKey}`);
  const url = absoluteUrl(zoneFile(zoneKey, meta), runtime.manifestUrl);
  const promise = fetchJson(url, `la zona geográfica ${zoneKey}`)
    .then((collection) => indexZone(collection, zoneKey))
    .then((indexed) => {
      zoneCache.set(zoneKey, indexed);
      zonePromises.delete(zoneKey);
      lastError = null;
      return indexed;
    })
    .catch((error) => {
      zonePromises.delete(zoneKey);
      lastError = error;
      throw error;
    });
  zonePromises.set(zoneKey, promise);
  return promise;
}

function indexedZoneForLot(loadedManifest, lotId) {
  if (!Object.prototype.hasOwnProperty.call(loadedManifest.lotIndex, lotId)) return null;
  const value = loadedManifest.lotIndex[lotId];
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return value.zone || value.zoneId || value.key || null;
  return null;
}

export async function getLotGeometry(value) {
  const lotId = normalizeGeoLotId(value);
  if (!lotId) return null;
  const loadedManifest = await loadGeoManifest();
  const zoneKey = indexedZoneForLot(loadedManifest, lotId);
  if (!zoneKey) return null;
  const zone = await loadZone(zoneKey, loadedManifest);
  return zone.byLotId.get(lotId) || null;
}

export async function getLotGeometries(values) {
  if (!Array.isArray(values) || values.length === 0) return [];
  const seen = new Set();
  const lotIds = [];
  values.forEach((value) => {
    const lotId = normalizeGeoLotId(value);
    if (lotId && !seen.has(lotId)) {
      seen.add(lotId);
      lotIds.push(lotId);
    }
  });
  const features = await Promise.all(lotIds.map((lotId) => getLotGeometry(lotId)));
  return features.filter(Boolean);
}

export async function hasLotGeometry(value) {
  const lotId = normalizeGeoLotId(value);
  if (!lotId) return false;
  const loadedManifest = await loadGeoManifest();
  return indexedZoneForLot(loadedManifest, lotId) !== null;
}

export function getGeoStatus() {
  const loading = Boolean(manifestPromise && !manifest) || zonePromises.size > 0;
  return {
    status: lastError ? "error" : loading ? "loading" : manifest ? "ready" : "idle",
    manifestLoaded: Boolean(manifest),
    dataVersion: manifest?.dataVersion || null,
    lotCount: Number.isFinite(manifest?.lotCount) ? manifest.lotCount : null,
    loadedZones: [...zoneCache.keys()],
    pendingZones: [...zonePromises.keys()],
    error: lastError?.message || null,
  };
}

/** Test-only reset; deliberately absent from the browser global API. */
export function __resetGeoDataForTests(options = {}) {
  runtime = {
    manifestUrl: options.manifestUrl
      ? absoluteUrl(options.manifestUrl, import.meta.url)
      : DEFAULT_MANIFEST_URL,
    fetchImpl: options.fetch || null,
  };
  resetCaches();
}

const browserApi = Object.freeze({
  loadGeoManifest,
  getLotGeometry,
  getLotGeometries,
  hasLotGeometry,
  getGeoStatus,
  normalizeGeoLotId,
  configureGeoData,
});

if (typeof window !== "undefined") window.CASUR_GEO_DATA = browserApi;

export default browserApi;
