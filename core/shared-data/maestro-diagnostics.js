/* ============================================================
   maestro-diagnostics.js — Diagnóstico de solo lectura del Maestro Central (MC01).
   Compara la fuente efectiva del contrato con los maestros propios que usan los módulos
   (copia local del dispositivo si existe; si no, la copia publicada del módulo).
   Nunca escribe, nunca crea bases y nunca corrige: solo informa.
   ============================================================ */
import {loadMaestroCentral, identityKey, openExistingDatabase} from './maestro-central.js';

const num = v => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const txt = v => String(v ?? '').trim();
const idbRequest = r => new Promise((ok, ko) => { r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });

/* Campos comparables por módulo. `temporal`: valor acumulado a una fecha de corte (no es un atributo estable);
   solo se compara con una fuente de la misma fecha. */
export const MODULE_MASTERS = [
  {id: 'riego', name: 'Riegos Ejecutados', published: 'modules/riego/data/bootstrap.json',
    rows: b => b?.master, version: b => b?.meta ? {cutoff: b.meta.masterCutoff || null, file: b.meta.masterFile || null, generatedAt: b.meta.generatedAt || null} : null,
    key: r => identityKey(r.farmCode, r.lot),
    fields: {area: r => num(r.area), variety: r => r.variety, irrigationType: r => r.irrigationType, texture: r => r.texture, zone: r => r.zone},
    temporal: {nrMaster: 'NR del cronológico SIAGRI (riegos acumulados) a la fecha de corte del maestro de Riego'},
    notEquivalent: {cropStartDate: 'Máximo entre F. Siembra y F. Ult. Cte; no es la fecha de siembra'},
    idb: {name: 'casur_riego_db', store: 'kv', pick: v => Array.isArray(v?.master) && v.master[0]?.farmCode ? v : null}},
  {id: 'insumos', name: 'Insumos Entregados', published: 'modules/insumos/data/bootstrap.json',
    rows: b => b?.maestro, version: b => b?.meta ? {cutoff: b.meta.fecha_corte || null, file: b.meta.archivo_fuente || null, generatedAt: b.meta.generated_at || null} : null,
    key: r => identityKey(r.hacienda, r.suerte),
    fields: {area: r => num(r.area), variety: r => r.variedad, texture: r => r.textura, cut: r => r.corte, destination: r => r.destino},
    idb: {name: 'insumos_casur_db', store: 'kv', pick: v => Array.isArray(v?.maestro) ? v : Array.isArray(v) && v[0]?.hac_sue_key ? {maestro: v} : null}},
  {id: 'tch', name: 'Estimador TCH', published: 'modules/tch/data/suertes.json',
    rows: b => Array.isArray(b) ? b : b?.rows, version: b => { const rows = Array.isArray(b) ? b : b?.rows; const d = rows?.map(r => r.tchEstimado2627Fecha).filter(Boolean).sort().pop(); return d ? {estimateDate: d} : null; },
    key: r => identityKey(r.codigoHacienda ?? r.farmCode, r.suerte ?? r.lot),
    fields: {area: r => num(r.area), variety: r => r.variedad ?? r.variety, cut: r => r.corte ?? r.cutNumber},
    notEquivalent: {tchEstimado2627: 'Estimado propio del Estimador TCH; no es el aforo oficial'},
    idb: {name: 'casur-estimador-tch', store: 'master', all: true}},
  {id: 'labores', name: 'Seguimiento de Labores', published: 'modules/labores/datos/manifest.json',
    rows: () => null, version: b => { const m = b?.files?.find(f => f.kind === 'master'); return m ? {file: m.name, generatedAt: b.generatedAt || null} : null; },
    note: 'Usa un Excel del cronológico dentro de su bundle compilado; se informa su fuente, no se compara campo a campo.'},
];
const centralField = {area: r => r.attributes.area, variety: r => r.attributes.variety, irrigationType: r => r.attributes.irrigationType,
  texture: r => r.attributes.texture, zone: r => r.farm.zone, cut: r => r.attributes.cut, destination: r => r.attributes.destination};
const same = (a, b) => (typeof a === 'number' || typeof b === 'number') ? (a === null || b === null ? a === b : Math.abs(a - b) < 0.005)
  : txt(a).toLowerCase() === txt(b).toLowerCase();

/** Compara filas de un módulo con el contrato. Función pura; no modifica nada. */
export function compareWithContract(reader, def, rows) {
  const seen = new Set(), diffs = {}, onlyModule = [], duplicates = [];
  const area = {presentNonProductive: [], absent: [], minor: [], toReconcile: []};
  for (const row of rows || []) {
    const key = def.key(row);
    if (seen.has(key)) { duplicates.push(key); continue; } seen.add(key);
    const c = reader.byKey(key); if (!c) { onlyModule.push(key); continue; }
    for (const [f, get] of Object.entries(def.fields)) {
      const mv = get(row), cv = centralField[f](c);
      if (same(mv, cv)) continue;
      diffs[f] = (diffs[f] || 0) + 1;
      if (f !== 'area') continue;
      const item = {key, lotCode: c.identity.lotCode, central: cv, module: mv, state: c.state.operationalState, presence: c.state.presence,
        physicalKnown: c.areas.physicalKnown.value};
      if (cv === 0 && c.state.presence === 'absent') area.absent.push(item);
      else if (cv === 0 && !c.state.participatesCurrentArea) area.presentNonProductive.push(item);
      // Comparación en centésimas de hectárea enteras: evita que 0,02 ha exactas caigan fuera por error de coma flotante.
      else if (mv !== null && cv !== null && Math.abs(Math.round(mv * 100) - Math.round(cv * 100)) <= 2) area.minor.push(item);
      else area.toReconcile.push(item);
    }
  }
  const onlyCentral = reader.list().map(r => r.key).filter(k => !seen.has(k));
  return {rows: (rows || []).length, matched: seen.size - onlyModule.length, onlyModule, onlyCentral, duplicates, diffs, area};
}

async function readModuleIdb(def) {
  if (!def.idb) return null;
  const db = await openExistingDatabase(def.idb.name);
  if (!db) return null;
  try {
    if (!db.objectStoreNames.contains(def.idb.store)) return null;
    const store = () => db.transaction(def.idb.store, 'readonly').objectStore(def.idb.store);
    if (def.idb.all) { const rows = await idbRequest(store().getAll()); return rows.length ? rows : null; }
    for (const k of await idbRequest(store().getAllKeys())) {
      const picked = def.idb.pick(await idbRequest(store().get(k)));
      if (picked) return picked;
    }
    return null;
  } finally { db.close(); }
}

/** Diagnóstico completo en el navegador. `base`: raíz de la App Maestra. */
export async function runMaestroDiagnostics({base = new URL('../../', import.meta.url), fetchImpl = fetch} = {}) {
  const started = new Date().toISOString();
  const {reader, resolution} = await loadMaestroCentral({base, fetchImpl});
  const v = reader.version(), modules = [];
  for (const def of MODULE_MASTERS) {
    const entry = {id: def.id, name: def.name, note: def.note || null, temporal: def.temporal || {}, notEquivalent: def.notEquivalent || {}};
    try {
      const local = await readModuleIdb(def).catch(() => null);
      let bundle = local, origin = 'local';
      if (!bundle) { const r = await fetchImpl(new URL(def.published, base)); bundle = r.ok ? await r.json() : null; origin = 'published'; }
      entry.origin = bundle ? origin : 'unavailable';
      entry.version = bundle ? def.version(bundle) : null;
      const rows = bundle ? def.rows(bundle) : null;
      entry.comparison = rows ? compareWithContract(reader, def, rows) : null;
    } catch (e) { entry.error = e.message; }
    modules.push(entry);
  }
  return {started, contract: v, resolution, count: reader.view.count, issues: reader.view.issues, modules};
}
