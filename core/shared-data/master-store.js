/* ============================================================
   master-store.js — Almacenamiento compartido de la App Maestra.
   IndexedDB `casur_master_data` (namespaced). Guarda el dataset
   adaptado desde Administrador SIAGRI para que "Maestro de Suertes"
   (Producción) lo consuma sin volver a cargar el Excel.

   NO toca ni migra bases antiguas (produccion no usa IndexedDB;
   casur-estimador-tch, insumos_casur_db, etc. quedan intactas).
   Se usa IndexedDB (no localStorage) por el volumen del cronológico.
   ============================================================ */
import '../imports/operational-import.js';
const DB_NAME = 'casur_master_data';
const DB_VERSION = 1;
const STORE = 'datasets';          /* key -> { payload, savedAt } */
const KEY_PRODUCCION = 'produccion_current';
/* [Fase 6.2] Maestro Central de Suertes: subconjunto CENTRAL derivado de
   produccion_current, publicado para que otros módulos (Riego) lo
   consuman sin reprocesar Excel. Misma DB/store; clave nueva, NO
   reemplaza ni migra produccion_current. */
const KEY_MAESTRO = 'maestro_suertes_current';

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

/* Operational imports use this existing store/version. A single transaction saves
   the previous generation, current production and central catalog together. */
const KEY_OPERATIONAL_PREVIOUS = 'operational_previous';
export async function loadOperationalPrevious() { return get(KEY_OPERATIONAL_PREVIOUS); }
export async function commitOperationalDataset(payload, { approved = false, expectedVersion = null, baseline = null, maestro = null, baselineMaestro = null } = {}) {
  if (!approved || payload?.operationalDataset?.contractVersion !== 1 || !payload?.dataVersion || !payload.operationalDataset.catalog?.length || !payload.operationalDataset.cronologico) throw new Error('Importación no aprobada o incompleta');
  globalThis.CASUR_OPERATIONAL_IMPORT.validateGeneration(payload.operationalDataset);
  if(!maestro||maestro.version!==payload.dataVersion||maestro.rows!==payload.operationalDataset.catalog.length)throw new Error('Maestro Central no conciliado con Producción');
  return operationalTransaction({payload, expectedVersion, baseline, maestro,baselineMaestro});
}
export async function restoreOperationalPrevious({approved = false, expectedVersion = null} = {}) {
  if (!approved) throw new Error('Recuperación no aprobada');
  return operationalTransaction({restore:true,expectedVersion});
}
async function operationalTransaction({payload,expectedVersion,baseline,maestro,baselineMaestro,restore=false}) {
  const db=await openDB();
  try {
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),stamp=new Date().toISOString();
      const requests=[KEY_PRODUCCION,KEY_MAESTRO,KEY_OPERATIONAL_PREVIOUS,'operational_baseline',...(restore?[]:['operational_generation:'+payload.dataVersion])].map(key=>store.get(key));
      let result,failure,remaining=requests.length;
      const put=(key,value)=>store.put({key,payload:value,savedAt:stamp});
      requests.forEach(request=>{request.onsuccess=()=>{
        if(--remaining)return;
        try {
          const [current,central,previous,initial,alreadyArchived]=requests.map(r=>r.result||null);
          if((current?.payload?.dataVersion||null)!==expectedVersion)throw new Error('La generación cambió: vuelva a conciliar antes de aplicar');
          const target=restore?previous?.payload?.production:payload;
          if(!target)throw new Error('No existe una versión anterior recuperable');
          if(!restore&&current?.payload?.dataVersion===payload.dataVersion)throw new Error('La versión de datos ya existe');
          if(!restore&&alreadyArchived)throw new Error('La versión ya fue utilizada; utilice una generación nueva');
          if(!initial)put('operational_baseline',{production:current?.payload||baseline,maestro:central?.payload||baselineMaestro||null});
          put(KEY_OPERATIONAL_PREVIOUS,{production:current?.payload||baseline,maestro:central?.payload||baselineMaestro||null});
          put(KEY_PRODUCCION,target);
          const nextMaster=restore?previous.payload.maestro:maestro;
          if(nextMaster)put(KEY_MAESTRO,nextMaster);
          else if(restore)put(KEY_MAESTRO,{version:target.dataVersion,rows:0,records:[],restoredWithoutPreviousMaster:true});
          if(!restore)put('operational_generation:'+target.dataVersion,{production:target,maestro:nextMaster,at:stamp});
          put('operational_event:'+stamp+':'+target.dataVersion,{action:restore?'restore':'import',from:current?.payload?.dataVersion||null,to:target.dataVersion});
          result=target;
        } catch(error){failure=error;tx.abort();}
      };});
      tx.oncomplete=()=>resolve(result);
      tx.onerror=tx.onabort=()=>reject(failure||tx.error||new Error('No se aplicó la transacción'));
    });
  } finally {db.close();}
}
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

export const MASTER_STORE_INFO = { DB_NAME, DB_VERSION, STORE, KEY_PRODUCCION, KEY_MAESTRO };

/* [Fase 6.2] --- Maestro Central de Suertes --- */
export async function saveMaestroSuertes(payload) { return put(KEY_MAESTRO, payload); }
export async function loadMaestroSuertes() { return get(KEY_MAESTRO); }
export async function getMaestroStatus() {
  try {
    const rec = await get(KEY_MAESTRO);
    if (!rec) return { present: false };
    const p = rec.payload || {};
    return { present: true, savedAt: rec.savedAt, version: p.version || null, rows: p.rows || null };
  } catch { return { present: false }; }
}
