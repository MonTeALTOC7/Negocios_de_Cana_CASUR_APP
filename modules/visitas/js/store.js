/* Almacenamiento propio de Visitas de Campo: IndexedDB «casur-visitas».
   - No abre ni escribe ninguna otra base. Nada se borra automáticamente (los borrados son lógicos y reversibles).
   - Las escrituras son transacciones completas y se serializan: un error se propaga, nunca se ignora.
   - Cada registro lleva `rev`; una escritura con una revisión vieja se rechaza (otra pestaña cambió el registro).
   - Los cambios se anuncian a otras pestañas por BroadcastChannel. */
export const DB_NAME = 'casur-visitas';
export const DB_VERSION = 3;
/* v3: hallazgos, fotos y seguimientos tienen identidad y contexto propios (productor, suerte, instantánea agronómica);
   `visitId` es opcional. Los índices nuevos se agregan a los almacenes existentes sin recrearlos. */
const STORES = {
  visits: {keyPath: 'id', indexes: [['updatedAt', 'updatedAt'], ['producerCode', 'producer.code'], ['status', 'status']]},
  findings: {keyPath: 'id', indexes: [['visitId', 'visitId'], ['producerCode', 'producerCode'], ['observedAt', 'observedAt'], ['lotKey', 'lotKey']]},
  followups: {keyPath: 'id', indexes: [['visitId', 'visitId'], ['state', 'state'], ['kind', 'kind'], ['findingId', 'findingId'], ['producerCode', 'producerCode']]},
  photos: {keyPath: 'id', indexes: [['visitId', 'visitId'], ['backupState', 'backupState'], ['findingId', 'findingId'], ['producerCode', 'producerCode']]},
  backups: {keyPath: 'id', indexes: [['createdAt', 'createdAt']]},
  settings: {keyPath: 'key'},
};

/** Migración v1 → v2 de un registro de visita (VC01): los hallazgos embebidos pasan a su propio almacén y la
 *  evaluación general queda como sección opcional. Pura: también se usa al restaurar respaldos de VC01. */
export function migrateVisitV1(v) {
  if (!v || (v.schema ?? 1) >= 2) return {visit: v, findings: []};
  const findings = (v.findings || []).map(f => ({id: f.id, schema: 2, visitId: v.id, producerCode: v.producer?.code ?? null, lotKey: f.lotKey || null,
    category: categoryFromV1(f.category), observedAt: v.startedAt, createdAt: v.createdAt, updatedAt: v.updatedAt, rev: 1, observation: f.text || '',
    severity: f.severity ? {value: f.severity, source: 'tecnico'} : null, details: {}, gps: null, status: 'abierto', history: [], migratedFrom: 1}));
  const {findings: _drop, fields = {}, observations = '', lots: _lots, ...rest} = v;
  const lotKeys = (v.lots || []).map(l => l.key), lotSources = Object.fromEntries((v.lots || []).map(l => [l.key, l.selection === 'gps' ? 'gps' : 'manual']));
  return {findings, visit: {...rest, schema: 2, status: v.status === 'cerrada' ? 'cerrada' : 'abierta', lotKeys, lotSources,
    general: {...fields, notes: observations}, migratedFrom: 1}};
}
const V1_CATEGORY = {'Cultivo': 'desarrollo', 'Riego y drenaje': 'riego', 'Nutrición': 'fertilizacion', 'Malezas': 'malezas', 'Plagas y enfermedades': 'plagas',
  'Infraestructura': 'caminos', 'Cosecha': 'cosecha', 'Otro': 'otros'};
const categoryFromV1 = c => V1_CATEGORY[c] || 'otros';

/** Migración v2 → v3 de un hallazgo, foto o seguimiento: completa su contexto propio desde la visita a la que pertenece
 *  (productor, suerte e instantánea agronómica). Pura y no destructiva: conserva id, fechas, relaciones y todos los campos;
 *  solo AGREGA lo que falta. Un registro sin visita ni productor queda como borrador por identificar (nunca se inventa). */
export function migrateItemV3(kind, item, visit) {
  if (!item || (item.schema ?? 2) >= 3) return item;
  const pv = visit?.producer || null;
  const producer = item.producer ?? (pv ? {code: pv.code, name: pv.name ?? null, zone: pv.zone ?? null}
    : item.producerCode ? {code: String(item.producerCode), name: item.producerName ?? null, zone: null} : null);
  const lotKey = item.lotKey || null;
  const record = item.record !== undefined ? item.record : (lotKey && visit?.masterSnapshot?.records?.find(r => r.key === lotKey)) || null;
  const out = {...item, schema: 3, visitId: item.visitId || null, producer, producerCode: producer?.code ?? null, lotKey,
    dataVersion: item.dataVersion ?? visit?.masterSnapshot?.dataVersion ?? null, migratedV3: true};
  if (kind === 'findings') { out.record = record; if (out.status === 'abierto') out.status = 'Abierto'; }
  if (kind === 'photos') { out.record = record; out.findingId = item.findingId || null; out.followupId = item.followupId || null; }
  if (kind === 'followups') { out.producerName = item.producerName ?? producer?.name ?? null; out.findingId = item.findingId || null; }
  return out;
}

let dbPromise = null;
export function openStore() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = event => {
      const db = req.result, tx = req.transaction;
      for (const [name, def] of Object.entries(STORES)) {
        const store = db.objectStoreNames.contains(name) ? tx.objectStore(name) : db.createObjectStore(name, {keyPath: def.keyPath});
        for (const [index, path] of def.indexes || []) if (!store.indexNames.contains(index)) store.createIndex(index, path);
      }
      // Toda la migración ocurre dentro de la transacción de actualización: o se completa o no cambia nada.
      if (event.oldVersion >= 1 && event.oldVersion < 3) {
        const visitsStore = tx.objectStore('visits'), byId = new Map();
        const step3 = () => { for (const kind of ['findings', 'photos', 'followups']) tx.objectStore(kind).openCursor().onsuccess = e => {
          const cursor = e.target.result; if (!cursor) return;
          const next = migrateItemV3(kind, cursor.value, byId.get(cursor.value.visitId));
          if (next !== cursor.value) cursor.update(next);
          cursor.continue();
        }; };
        visitsStore.openCursor().onsuccess = e => {
          const cursor = e.target.result;
          if (!cursor) { step3(); return; }
          let visit = cursor.value;
          if (event.oldVersion === 1) {   // VC01 → v2: los hallazgos embebidos pasan a su almacén
            const m = migrateVisitV1(visit); visit = m.visit; cursor.update(visit);
            m.findings.forEach(f => tx.objectStore('findings').put(f));
          }
          byId.set(visit.id, visit); cursor.continue();
        };
      }
    };
    req.onsuccess = () => { const db = req.result; db.onversionchange = () => { db.close(); dbPromise = null; }; resolve(db); };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    req.onblocked = () => reject(Error('Visitas está abierta en una versión anterior en otra ventana. Cerrala para continuar.'));
  });
  return dbPromise;
}
const done = tx => new Promise((ok, ko) => { tx.oncomplete = () => ok(); tx.onerror = () => ko(tx.error); tx.onabort = () => ko(tx.error || Error('Transacción cancelada')); });
const req = r => new Promise((ok, ko) => { r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });

/* Cola de escrituras: una a la vez, en orden; un fallo rechaza esa escritura y la cola sigue. */
let queue = Promise.resolve();
function serial(fn) { const run = queue.then(fn); queue = run.catch(() => {}); return run; }

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('casur-visitas') : null;
channel?.unref?.();   // Node (pruebas): no mantener vivo el proceso; en el navegador no existe y no hace nada
const listeners = new Set();
export function onExternalChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
channel?.addEventListener('message', e => listeners.forEach(fn => { try { fn(e.data); } catch { /* aislado */ } }));
function announce(ops) { try { channel?.postMessage({type: 'changed', items: ops.map(([store, v]) => ({store, id: v.id ?? v.key, rev: v.rev ?? null}))}); } catch { /* sin canal */ } }

/** Fallo simulado para pruebas de robustez (solo si la página lo activa explícitamente). */
const failing = () => globalThis.__VISITAS_FAIL_WRITES__ === true;

export async function get(store, key) { const db = await openStore(); return req(db.transaction(store).objectStore(store).get(key)); }
export async function all(store) { const db = await openStore(); return req(db.transaction(store).objectStore(store).getAll()); }
export async function byIndex(store, index, value) { const db = await openStore(); return req(db.transaction(store).objectStore(store).index(index).getAll(value)); }

/** Escribe varios registros en una sola transacción (todo o nada). ops: [[store, value], …]. */
export function putMany(ops) {
  return serial(async () => {
    if (failing()) throw Error('Escritura rechazada (simulación de fallo de almacenamiento)');
    const db = await openStore(), names = [...new Set(ops.map(([s]) => s))], tx = db.transaction(names, 'readwrite');
    for (const [store, value] of ops) tx.objectStore(store).put(value);
    await done(tx); announce(ops);
  });
}
export const put = (store, value) => putMany([[store, value]]);

/** Lectura-modificación-escritura atómica. `fn(actual)` devuelve el nuevo valor, null para no escribir, o lanza. */
export function update(store, key, fn) {
  return serial(async () => {
    if (failing()) throw Error('Escritura rechazada (simulación de fallo de almacenamiento)');
    const db = await openStore(), tx = db.transaction(store, 'readwrite'), s = tx.objectStore(store);
    let result, failure;
    const r = s.get(key);
    r.onsuccess = () => { try { result = fn(r.result ?? null); if (result) s.put(result); } catch (e) { failure = e; tx.abort(); } };
    try { await done(tx); } catch (e) { throw failure || e; }
    if (result) announce([[store, result]]);
    return result;
  });
}
/** Escritura con control de concurrencia: falla si el registro guardado ya no tiene la revisión `baseRev`. */
export function putChecked(store, value, baseRev) {
  return update(store, value.id, cur => {
    if (cur && baseRev !== undefined && (cur.rev || 0) !== baseRev) {
      const e = Error('El registro cambió en otra ventana. Se recargó la versión más reciente; revisá y volvé a guardar.'); e.code = 'CONFLICT'; e.current = cur; throw e;
    }
    return {...value, rev: (cur?.rev || 0) + 1};
  });
}
export async function getSetting(key, fallback = null) { return (await get('settings', key))?.value ?? fallback; }
export async function setSetting(key, value) { return put('settings', {key, value, updatedAt: new Date().toISOString()}); }

/** Identificador estable generado en el dispositivo. */
export function newId(prefix) {
  const uuid = crypto.randomUUID ? crypto.randomUUID() : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
  return `${prefix}-${uuid}`;
}

/* Persistencia y cuota */
export async function storageState() {
  const persisted = await navigator.storage?.persisted?.().catch(() => null) ?? null;
  const estimate = await navigator.storage?.estimate?.().catch(() => null) ?? null;
  return {persisted, usage: estimate?.usage ?? null, quota: estimate?.quota ?? null, ratio: estimate?.quota ? estimate.usage / estimate.quota : null};
}
export async function requestPersistence() {
  if (!navigator.storage?.persist) return null;
  try { return await navigator.storage.persist(); } catch { return null; }
}

/* Copia de emergencia de un formulario no guardado (por ejemplo, si IndexedDB falla): síncrona, en localStorage,
   y se elimina solo después de una escritura confirmada. */
const PENDING = 'casur-visitas-pendiente:';
export function keepPending(id, data) { try { localStorage.setItem(PENDING + id, JSON.stringify({at: new Date().toISOString(), data})); return true; } catch { return false; } }
export function readPending(id) { try { return JSON.parse(localStorage.getItem(PENDING + id) || 'null'); } catch { return null; } }
export function clearPending(id) { try { localStorage.removeItem(PENDING + id); } catch { /* sin almacenamiento */ } }
export function listPending() { try { return Object.keys(localStorage).filter(k => k.startsWith(PENDING)).map(k => k.slice(PENDING.length)); } catch { return []; } }
