/* ============================================================
   maestro-central.js — Contrato de lectura del Maestro Central (MC01).
   Especificación: docs/MAESTRO_CENTRAL_CONTRATO.md.

   - Solo lectura. No escribe en IndexedDB, localStorage ni cachés; no crea bases.
   - Referencia común: la generación oficial publicada (servida y verificada por el SW).
   - Una generación local guardada solo se usa cuando la política vigente
     (core/shared-data/source-policy.js, la misma de Producción) la mantiene: elección
     explícita, generación fijada, personalizada o preservada.
   - Los registros se copian (structuredClone) y la copia se congela: la fuente original
     nunca se congela ni se modifica.
   - Las capas oficiales (aforo, plan, ejecutado) se exponen tal cual; nada se recalcula.
   ============================================================ */
import '../imports/operational-import.js';
import {officialSourcePriority, SOURCE_PREFERENCE_KEY} from './source-policy.js';

export const MAESTRO_CENTRAL_CONTRACT = 1;
const OI = () => globalThis.CASUR_OPERATIONAL_IMPORT;

/* ---------- Identidad ---------- */
/** Suerte canónica en texto: «1» → «01», «5a» → «05A». Nunca se convierte en número. */
export function canonicalLot(value) {
  const t = String(value ?? '').trim().toUpperCase().replace(/\.0+$/, '').replace(/\s+/g, '');
  const m = t.match(/^(\d+)([A-Z]*)$/);
  return m ? m[1].padStart(2, '0') + m[2] : t;
}
/** Código de hacienda sin ceros a la izquierda, como en la fuente oficial. */
export function canonicalFarm(value) {
  const t = String(value ?? '').trim().replace(/\.0+$/, '');
  return /^\d+$/.test(t) ? String(Number(t)) : t.toUpperCase();
}
/** Clave compuesta del contrato. Nunca se usa `codLote` (concatenación ambigua) como identidad. */
export const identityKey = (farm, lot) => `${canonicalFarm(farm)}|${canonicalLot(lot)}`;
const validIdentity = (farm, lot) => /^\d+$/.test(farm) && Number(farm) > 0 && /^\d+[A-Z]*$/.test(lot);

/* ---------- Zafras ---------- */
/** «26/27» → «25/26». Devuelve null si la zafra no tiene el formato AA/AA consecutivo. */
export function previousSeason(season) {
  const m = String(season ?? '').match(/^(\d{2})\/(\d{2})$/);
  if (!m || (Number(m[1]) + 1) % 100 !== Number(m[2])) return null;
  const p = (Number(m[1]) + 99) % 100;
  return `${String(p).padStart(2, '0')}/${m[1]}`;
}

const num = v => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
}

/* ---------- Estimado ---------- */
/** Estado del estimado oficial con la regla vigente (`participation()` del motor operativo).
 *  available = la fuente trae un TCH; usable/zero/missing/invalid solo aplican a Molienda activa. */
function estimateOf(d) {
  const part = OI().participation(d);
  const tch = num(d.forecast?.tch);
  const status = ['usable', 'zero', 'missing', 'invalid'].includes(part.status) ? part.status : 'not-applicable';
  return {part, estimate: {season: d.forecast?.season ?? null, available: tch !== null, status, tch, tons: num(d.forecast?.tons),
    reason: part.reason}};
}

/* ---------- Vista ---------- */
/**
 * Construye la vista inmutable del contrato a partir de un cronológico con la estructura publicada
 * (meta + producers[].details[]). `origin` describe la fuente efectiva. `gisManifest` es opcional.
 */
export function buildMaestroView(cronologico, {origin = 'official', gisManifest = null} = {}) {
  if (!cronologico?.meta?.dataVersion || !Array.isArray(cronologico.producers)) throw Error('Generación sin dataVersion o sin productores');
  const crono = structuredClone(cronologico);           // la fuente original queda intacta y sin congelar
  const meta = crono.meta;
  const season = meta.estimateSeason || crono.producers.flatMap(p => p.details || []).find(d => d.forecast?.season)?.forecast.season || null;
  const executedSeason = previousSeason(season);
  const gisIndex = gisManifest?.lotIndex || null;
  const records = Object.create(null), list = [], issues = [], farms = Object.create(null);
  for (const p of crono.producers) for (const d of p.details || []) {
    const rawFarm = d.permanentIdentity?.code ?? d.code, rawLot = d.permanentIdentity?.lot ?? d.suerte;
    const engine = OI().identity(rawFarm, rawLot);       // misma normalización que el motor operativo
    const farmCode = canonicalFarm(engine.code), lot = canonicalLot(engine.lot), key = `${farmCode}|${lot}`;
    if (!validIdentity(farmCode, lot)) issues.push({type: 'invalid-identity', key, raw: {farm: rawFarm, lot: rawLot}});
    if (lot !== engine.lot) issues.push({type: 'non-canonical-lot', key, raw: rawLot});
    if (records[key]) { issues.push({type: 'duplicate-identity', key}); continue; }
    const {part, estimate} = estimateOf(d);
    const lotCode = d.codLote ?? null;
    const record = {
      key, identity: {farmCode, lot, lotCode, erp: d.erp || null},
      farm: {code: farmCode, name: d.name ?? p.name ?? null, zone: d.zona ?? p.zone ?? null, tenure: d.tenencia ?? p.tenencia ?? null},
      attributes: {
        // Área de la generación tal como la trae la fuente. No es «área física»: ver physicalArea.
        area: num(d.area), variety: d.variedad ?? null, irrigationType: d.tipoRiego ?? null, irrigationCount: num(d.numeroRiegos),
        texture: d.textura ?? null, furrow: d.surco ?? null, cut: d.corte ?? null, destination: d.destino ?? null, cropType: d.tipoCultivo ?? null,
        plantingDate: d.fSiembra ?? null, lastCutDate: d.fUltCte ?? null, distanceKm: num(d.distancia), observation: d.observacion ?? '',
      },
      areas: {
        inventory: num(d.inventoryArea), active: part.activeArea, milling: part.millingArea,
        seed: part.active && !part.milling ? part.inventoryArea : 0,
        pendingEstimate: part.milling && estimate.status !== 'usable' ? part.millingArea : 0,
        // Superficie física conocida: la generación vigente no la publica para los estados no productivos (área 0 de la
        // fuente). Se informa la última no nula del historial como referencia, con su versión; nunca se convierte en 0.
        physicalKnown: physicalKnown(d), lostDocumented: null,
      },
      state: {
        presence: d.sourcePresence || 'unknown', operationalState: d.operationalState ?? d.estado ?? null, classification: d.classification ?? null,
        operationalDestination: part.operationalDestination ?? null, participatesCurrentArea: part.active, participatesMilling: part.milling,
        participationStatus: part.status, decision: part.decision ? {id: part.decision.id ?? null, destination: part.decision.destination ?? null} : null,
        renovation: d.renovacion === true ? true : null, loss: null,
      },
      estimate,
      layers: {
        executed: {season: executedSeason, tch: num(d.tch)},
        forecast: d.forecast ?? null, forecastOptimistic: d.forecastOptimistic ?? null, plan: d.plan ?? null,
      },
      gis: {lotId: lotCode, zone: gisIndex ? gisIndex[lotCode] ?? null : null, hasGeometry: gisIndex ? Object.hasOwn(gisIndex, lotCode ?? '') : null,
        dataVersion: gisManifest?.dataVersion ?? null},
      provenance: {dataVersion: d.dataVersion ?? meta.dataVersion, source: d.source?.file ?? meta.source ?? null, sourceDate: d.source?.sourceDate ?? null,
        cells: d.provenance ?? null, inherited: d.inherited && Object.keys(d.inherited).length ? d.inherited : null, history: d.changeHistory ?? []},
    };
    records[key] = record; list.push(record);
    (farms[farmCode] ??= {code: farmCode, name: record.farm.name, zone: record.farm.zone, keys: []}).keys.push(key);
  }
  const view = {
    contractVersion: MAESTRO_CENTRAL_CONTRACT, origin, dataVersion: meta.dataVersion, previousDataVersion: meta.previousDataVersion ?? null,
    generatedAt: meta.generated ?? null, aforoDate: meta.tchEst2627EffectiveDate ?? null, estimateSeason: season, executedSeason,
    sourceProfiles: meta.sourceProfiles ?? [], source: meta.source ?? null, sourceSha256: meta.sourceSha256 ?? null,
    gisVersion: gisManifest?.dataVersion ?? null, count: list.length, issues, records, list, farms,
  };
  return deepFreeze(view);
}
function physicalKnown(d) {
  const a = num(d.area);
  if (a !== null && a > 0) return {value: a, fromVersion: d.dataVersion ?? null, basis: 'generation'};
  const inv = num(d.inventoryArea);
  if (d.sourcePresence === 'absent' && inv !== null && inv > 0) return {value: inv, fromVersion: d.inherited?.allFields?.fromVersion ?? null, basis: 'inherited'};
  for (const h of [...(d.changeHistory || [])].reverse()) {
    const prev = num(h.previousArea);
    if (prev !== null && prev > 0) return {value: prev, fromVersion: h.fromVersion ?? null, basis: 'history'};
  }
  return {value: null, fromVersion: null, basis: 'unknown'};
}

/** Interfaz de lectura compartida. No expone mutadores. */
export function maestroReader(view) {
  return Object.freeze({
    view,
    version: () => ({contractVersion: view.contractVersion, dataVersion: view.dataVersion, origin: view.origin, aforoDate: view.aforoDate,
      estimateSeason: view.estimateSeason, executedSeason: view.executedSeason, gisVersion: view.gisVersion}),
    get: (farm, lot) => view.records[identityKey(farm, lot)] ?? null,
    byKey: key => view.records[key] ?? null,
    list: (filter = () => true) => view.list.filter(filter),
    farms: () => Object.values(view.farms).sort((a, b) => Number(a.code) - Number(b.code)),
    farm: code => view.farms[canonicalFarm(code)] ?? null,
    lotsOf: code => (view.farms[canonicalFarm(code)]?.keys || []).map(k => view.records[k]),
  });
}

/* ---------- Resolución de la fuente efectiva ---------- */
/**
 * Decide qué generación usa el contrato, con la misma política que Producción.
 * official: cronológico publicado; snapshot: {production, maestro, archive} de casur_master_data (o null);
 * preference: 'official' | 'personal' | null; online: boolean.
 */
export function resolveMaestroSource({official, snapshot = null, preference = null, online = true}) {
  const officialVersion = official?.meta?.dataVersion ?? null;
  const local = snapshot?.production || null;
  const localVersion = local?.dataVersion ?? null;
  const localCrono = local?.operationalDataset?.cronologico || null;
  const localKind = !local ? null : localCrono ? 'operational' : Array.isArray(local.reportRows) ? 'siagri' : 'unknown';
  const base = {officialVersion, localVersion, localKind, preference: preference ?? null};
  if (!local) return {...base, effective: 'official', production: 'official', policy: null, reason: 'Sin generación local guardada'};
  if (preference === 'official') return {...base, effective: 'official', production: 'official', policy: 'explicit-official', reason: 'Elección explícita: datos oficiales'};
  const policy = officialSourcePriority({official: officialVersion, current: localVersion, personal: true, preference: preference ?? undefined, snapshot, online});
  if (policy === 'official') return {...base, effective: 'official', production: 'official', policy,
    reason: 'La generación oficial es más nueva y la local es una importación ordinaria sin cambios: se usa la oficial'};
  // Producción mantiene la local. El contrato solo puede leerla si tiene estructura de cronológico (camino transaccional B).
  if (localKind === 'operational') return {...base, effective: 'local', production: 'local', policy,
    reason: ({pinned: 'Generación local fijada por el propietario', 'not-newer': 'La generación local no es anterior a la oficial',
      offline: 'Sin conexión: se conserva la generación local', preserved: 'Generación local preservada (requiere elección explícita)',
      customized: 'Generación local con cambios propios'})[policy] || 'Generación local'};
  return {...base, effective: 'official', production: 'local', policy,
    reason: 'Producción usa una generación local sin estructura de contrato (importación SIAGRI del Centro Maestro); los demás módulos leen la oficial',
    warning: 'local-incompatible'};
}

/* ---------- Carga en el navegador (solo lectura) ---------- */
const idbRequest = r => new Promise((ok, ko) => { r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
/** Abre una base existente sin crearla ni actualizarla. Devuelve null si no existe. */
export async function openExistingDatabase(name) {
  if (typeof indexedDB === 'undefined') return null;
  if (indexedDB.databases) { const list = await indexedDB.databases().catch(() => null); if (list && !list.some(d => d.name === name)) return null; }
  return new Promise(resolve => {
    let created = false;
    const req = indexedDB.open(name);
    req.onupgradeneeded = () => { created = true; req.transaction.abort(); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(created ? null : null);
  });
}
/** Instantánea de solo lectura de casur_master_data con la forma que espera la política. */
export async function readSourceSnapshot() {
  const db = await openExistingDatabase('casur_master_data');
  if (!db) return null;
  try {
    if (!db.objectStoreNames.contains('datasets')) return null;
    const store = db.transaction('datasets', 'readonly').objectStore('datasets');
    const [current, central] = await Promise.all([idbRequest(store.get('produccion_current')), idbRequest(store.get('maestro_suertes_current'))]);
    const snapshot = {production: current?.payload, maestro: central?.payload, savedAt: current?.savedAt ?? null};
    if (snapshot.production?.dataVersion) {
      const archive = await idbRequest(db.transaction('datasets', 'readonly').objectStore('datasets').get('operational_generation:' + snapshot.production.dataVersion));
      snapshot.archive = archive?.payload;
    }
    return snapshot;
  } finally { db.close(); }
}
function readPreference() { try { return localStorage.getItem(SOURCE_PREFERENCE_KEY); } catch { return null; } }

/**
 * Carga el contrato en el navegador. `base` es la URL raíz de la App Maestra (por defecto, deducida de este módulo).
 * Devuelve {reader, resolution}. Nunca escribe.
 */
export async function loadMaestroCentral({base = new URL('../../', import.meta.url), fetchImpl = fetch, withGis = true} = {}) {
  const get = async path => { const r = await fetchImpl(new URL(path, base)); if (!r.ok) throw Error(path + ': ' + r.status); return r.json(); };
  const [official, gisManifest, snapshot] = await Promise.all([
    get('modules/produccion/data/cronologico.json'),
    withGis ? get('shared/geo/data/manifest.json').catch(() => null) : null,
    readSourceSnapshot().catch(() => null),
  ]);
  const resolution = resolveMaestroSource({official, snapshot, preference: readPreference(), online: typeof navigator === 'undefined' ? true : navigator.onLine});
  const source = resolution.effective === 'local' ? snapshot.production.operationalDataset.cronologico : official;
  const view = buildMaestroView(source, {origin: resolution.effective, gisManifest});
  return {reader: maestroReader(view), resolution: Object.freeze({...resolution, savedAt: snapshot?.savedAt ?? null})};
}
