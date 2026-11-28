/* Almacenamiento propio de Visitas de Campo: IndexedDB «casur-visitas».
   No abre ni escribe ninguna otra base. Nada se borra automáticamente. */
export const DB_NAME = 'casur-visitas';
export const DB_VERSION = 1;
const STORES = {
  visits: {keyPath: 'id', indexes: [['updatedAt', 'updatedAt'], ['producerCode', 'producer.code'], ['status', 'status']]},
  followups: {keyPath: 'id', indexes: [['visitId', 'visitId'], ['state', 'state'], ['kind', 'kind']]},
  photos: {keyPath: 'id', indexes: [['visitId', 'visitId'], ['backupState', 'backupState']]},
  backups: {keyPath: 'id', indexes: [['createdAt', 'createdAt']]},
  settings: {keyPath: 'key'},
};
let dbPromise = null;
export function openStore() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, def] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        const store = db.createObjectStore(name, {keyPath: def.keyPath});
        for (const [index, path] of def.indexes || []) store.createIndex(index, path);
      }
    };
    req.onsuccess = () => { const db = req.result; db.onversionchange = () => { db.close(); dbPromise = null; }; resolve(db); };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    req.onblocked = () => reject(Error('La base de Visitas está abierta en otra versión de la app. Cerrá las otras ventanas.'));
  });
  return dbPromise;
}
const done = tx => new Promise((ok, ko) => { tx.oncomplete = () => ok(); tx.onerror = () => ko(tx.error); tx.onabort = () => ko(tx.error || Error('Transacción cancelada')); });
const req = r => new Promise((ok, ko) => { r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });

export async function get(store, key) { const db = await openStore(); return req(db.transaction(store).objectStore(store).get(key)); }
export async function all(store) { const db = await openStore(); return req(db.transaction(store).objectStore(store).getAll()); }
export async function byIndex(store, index, value) { const db = await openStore(); return req(db.transaction(store).objectStore(store).index(index).getAll(value)); }
export async function count(store, index, value) {
  const db = await openStore(), s = db.transaction(store).objectStore(store);
  return req(index ? s.index(index).count(value) : s.count());
}
/** Escribe varios registros en una sola transacción (todo o nada). ops: [[store, value], …]. */
export async function putMany(ops) {
  const db = await openStore(), names = [...new Set(ops.map(([s]) => s))], tx = db.transaction(names, 'readwrite');
  for (const [store, value] of ops) tx.objectStore(store).put(value);
  return done(tx);
}
export const put = (store, value) => putMany([[store, value]]);
/** Lectura-modificación-escritura atómica de un registro. `fn(actual)` devuelve el nuevo valor (o lanza). */
export async function update(store, key, fn) {
  const db = await openStore(), tx = db.transaction(store, 'readwrite'), s = tx.objectStore(store);
  let result, failure;
  const r = s.get(key);
  r.onsuccess = () => { try { result = fn(r.result ?? null); if (result) s.put(result); } catch (e) { failure = e; tx.abort(); } };
  try { await done(tx); } catch (e) { throw failure || e; }
  return result;
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
  return {persisted, usage: estimate?.usage ?? null, quota: estimate?.quota ?? null,
    ratio: estimate?.quota ? estimate.usage / estimate.quota : null};
}
export async function requestPersistence() {
  if (!navigator.storage?.persist) return null;
  try { return await navigator.storage.persist(); } catch { return null; }
}
