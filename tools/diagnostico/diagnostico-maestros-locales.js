/* Diagnóstico de SOLO LECTURA de los maestros locales de un dispositivo (MC01).
 *
 * Uso: abrir la App Maestra publicada en el dispositivo (mismo origen), abrir la consola de DevTools (en Android, por
 * depuración remota chrome://inspect) y pegar este archivo completo. Descarga `diagnostico-maestros-<fecha>.json`.
 *
 * Garantías:
 * - No escribe, no borra y no migra nada. Solo transacciones 'readonly'.
 * - No crea bases inexistentes: solo abre las que indexedDB.databases() informa (abrir sin versión no ejecuta upgrades).
 * - No lee fotografías ni blobs: en los almacenes con fotos solo cuenta registros.
 * - El resultado contiene datos agronómicos del dispositivo: compartirlo solo por un canal privado, nunca en GitHub.
 */
(async () => {
  const out = {tool: 'diagnostico-maestros-locales', version: 1, origin: location.origin, at: new Date().toISOString(), userAgent: navigator.userAgent, databases: {}, masters: {}, diffs: {}, errors: []};
  const lot = v => { const t = String(v ?? '').trim().toUpperCase(); const m = t.match(/^(\d+)([A-Z]*)$/); return m ? m[1].padStart(2, '0') + m[2] : t; };
  const farm = v => { const t = String(v ?? '').trim(); return /^\d+$/.test(t) ? String(Number(t)) : t; };
  const key = (f, l) => farm(f) + '|' + lot(l);
  const req = r => new Promise((ok, ko) => { r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
  const known = (await indexedDB.databases?.() || []).map(d => ({name: d.name, version: d.version}));
  out.databases.list = known;
  const exists = n => known.some(d => d.name === n);
  const open = n => new Promise((ok, ko) => { const r = indexedDB.open(n); r.onupgradeneeded = () => { r.transaction.abort(); ko(Error('UPGRADE_BLOCKED')); }; r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
  const read = async (dbName, fn) => { if (!exists(dbName)) return out.databases[dbName] = {present: false};
    let db; try { db = await open(dbName); const stores = [...db.objectStoreNames]; const counts = {};
      for (const s of stores) counts[s] = await req(db.transaction(s, 'readonly').objectStore(s).count());
      out.databases[dbName] = {present: true, version: db.version, stores, counts}; if (fn) await fn(db, stores);
    } catch (e) { out.errors.push(dbName + ': ' + e.message); } finally { db?.close(); } };
  const get = (db, store, k) => req(db.transaction(store, 'readonly').objectStore(store).get(k));
  const all = (db, store) => req(db.transaction(store, 'readonly').objectStore(store).getAll());
  const summarize = (id, rows, f) => { const m = new Map(); for (const r of rows || []) { const x = f(r); if (x) m.set(x.key, x); } out.masters[id] = {rows: m.size}; return m; };
  const maps = {};

  await read('casur_master_data', async db => {
    for (const k of ['produccion_current', 'maestro_suertes_current', 'operational_previous', 'operational_baseline']) {
      const v = await get(db, 'datasets', k).catch(() => null);
      out.databases.casur_master_data[k] = v ? {dataVersion: v.dataVersion || v.version || v.payload?.meta?.dataVersion || v.data?.version || null, savedAt: v.savedAt || v.generated || null} : null;
      if (k === 'maestro_suertes_current' && v) { const by = v.byKey || v.data?.byKey || {}; maps.shell = summarize('shell', Object.values(by), r => ({key: key(r.farmCode, r.lot), area: Number(r.area)})); }
    }
    const keys = await req(db.transaction('datasets', 'readonly').objectStore('datasets').getAllKeys());
    out.databases.casur_master_data.generations = keys.filter(k => String(k).startsWith('operational_generation:'));
  });
  await read('casur-estimador-tch', async (db, stores) => { if (stores.includes('master')) maps.tch = summarize('tch', await all(db, 'master'), r => ({key: key(r.codigoHacienda ?? r.farmCode, r.suerte ?? r.lot), area: Number(r.area)})); });
  await read('insumos_casur_db', async (db, stores) => { if (!stores.includes('kv')) return; const keys = await req(db.transaction('kv', 'readonly').objectStore('kv').getAllKeys());
    out.databases.insumos_casur_db.keys = keys; for (const k of keys) { const v = await get(db, 'kv', k); const rows = v?.maestro || (Array.isArray(v) && v[0]?.hac_sue_key ? v : null);
      if (rows) { maps.insumos = summarize('insumos', rows, r => ({key: key(r.hacienda, r.suerte), area: Number(r.area)})); out.masters.insumos.kvKey = k; out.masters.insumos.version = v?.meta?.version || null; break; } } });
  await read('casur_riego_db', async (db, stores) => { if (!stores.includes('kv')) return; const keys = await req(db.transaction('kv', 'readonly').objectStore('kv').getAllKeys());
    out.databases.casur_riego_db.keys = keys; for (const k of keys) { const v = await get(db, 'kv', k); const rows = v?.master;
      if (Array.isArray(rows) && rows[0]?.farmCode) { maps.riego = summarize('riego', rows, r => ({key: key(r.farmCode, r.lot), area: Number(r.area)})); out.masters.riego.kvKey = k; out.masters.riego.meta = v.meta ? {masterFile: v.meta.masterFile, masterCutoff: v.meta.masterCutoff, irrigationCutoff: v.meta.irrigationCutoff, generatedAt: v.meta.generatedAt} : null; break; } } });

  // Referencia publicada: generación oficial servida por el SW (misma que verá Producción).
  try { const c = await (await fetch('modules/produccion/data/cronologico.json')).json(); out.published = {dataVersion: c.meta?.dataVersion};
    maps.published = summarize('published', c.producers.flatMap(p => p.details), d => ({key: key(d.permanentIdentity?.code ?? d.code, d.permanentIdentity?.lot ?? d.suerte), area: Number(d.area)}));
  } catch (e) { out.errors.push('published: ' + e.message); }
  for (const [id, m] of Object.entries(maps)) { if (id === 'published' || !maps.published) continue; let onlyHere = 0, onlyRef = 0, area = 0;
    for (const [k, r] of m) { const p = maps.published.get(k); if (!p) onlyHere++; else if (Math.abs((p.area || 0) - (r.area || 0)) >= 0.005) area++; }
    for (const k of maps.published.keys()) if (!m.has(k)) onlyRef++;
    out.diffs[id] = {identitiesOnlyHere: onlyHere, identitiesMissingHere: onlyRef, areaDiffs: area}; }
  out.storage = await navigator.storage?.estimate?.().then(e => ({usage: e.usage, quota: e.quota})).catch(() => null);
  out.persisted = await navigator.storage?.persisted?.().catch(() => null);
  const blob = new Blob([JSON.stringify(out, null, 1)], {type: 'application/json'}), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'diagnostico-maestros-' + out.at.slice(0, 10) + '.json'; a.click();
  console.table(out.diffs); console.log(out); return out;
})();
