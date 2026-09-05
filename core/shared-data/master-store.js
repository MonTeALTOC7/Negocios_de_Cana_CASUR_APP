/* ============================================================
   master-store.js — Almacenamiento compartido de la App Maestra.
   IndexedDB `casur_master_data` (namespaced). Guarda el dataset
   adaptado desde Administrador SIAGRI para que "Maestro de Suertes"
   (Producción) lo consuma sin volver a cargar el Excel.

   NO toca ni migra bases antiguas (produccion no usa IndexedDB;
   casur-estimador-tch, insumos_casur_db, etc. quedan intactas).
   Se usa IndexedDB (no localStorage) por el volumen del cronológico.
   ============================================================ */
const DB_NAME = 'casur_master_data';
const DB_VERSION = 1;
const STORE = 'datasets';          /* key -> { payload, savedAt } */
const KEY_PRODUCCION = 'produccion_current';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function put(key, payload) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ key, payload, savedAt: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function get(key) {
  const db = await openDB();
  const rec = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
  db.close();
  return rec;
}

/* API pública */
export async function saveProduccionDataset(payload) { return put(KEY_PRODUCCION, payload); }
export async function loadProduccionDataset() { return get(KEY_PRODUCCION); }
export async function getProduccionStatus() {
  try {
    const rec = await get(KEY_PRODUCCION);
    if (!rec) return { present: false };
    const p = rec.payload || {};
    return {
      present: true,
      savedAt: rec.savedAt,
      dataVersion: p.dataVersion || null,
      cronologicoRows: (p.reportRows && p.reportRows.length) || p.cronologicoRows || null,
      source: (p.summary && p.summary.source) || null,
    };
  } catch { return { present: false }; }
}

export const MASTER_STORE_INFO = { DB_NAME, DB_VERSION, STORE, KEY_PRODUCCION };
