/* Respaldo y restauración de Visitas.
   Cada parte del respaldo es un ZIP autosuficiente: contiene todos los datos estructurados (visitas, seguimientos,
   índice de fotos con SHA-256) y una porción de las fotografías originales, organizadas por año/mes/finca/visita.
   La restauración verifica cada archivo, no duplica y nunca sustituye un registro local más reciente. */
import {createStoredZip, readStoredZip} from './zip.js';
import * as store from './store.js';
import {sha256, photoExtension} from './photos.js';

export const BACKUP_SCHEMA = 'casur-visitas-respaldo';
export const BACKUP_SCHEMA_VERSION = 1;
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const fileDate = (d = new Date()) => `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
const clean = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'sin_dato';

/** Tamaño de cada parte según la memoria declarada del dispositivo (Chrome Android expone deviceMemory). */
export function partLimitBytes() {
  const gb = Number(navigator.deviceMemory) || 4;
  return Math.round(Math.min(200, Math.max(40, gb * 25)) * 1024 * 1024);
}
export function photoPath(photo, visit) {
  const d = new Date(visit?.startedAt || photo.addedAt);
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0');
  const farm = `${clean(visit?.producer?.code)}_${clean(visit?.producer?.name)}`;
  return `fotos/${y}/${m}/${farm}/${clean(visit?.id || photo.visitId)}/${clean(photo.id)}.${photoExtension(photo)}`;
}
const meta = photo => { const {blob, ...rest} = photo; return rest; };

/**
 * Prepara las partes del respaldo. scope: 'pending' (fotos sin respaldo confirmado) | 'all'.
 * Devuelve [{name, blob, photoIds, bytes}] y registra el respaldo; las fotos pasan a «exportada» al descargar.
 */
export async function buildBackup({scope = 'pending', limit = partLimitBytes(), onProgress = () => {}} = {}) {
  const [visits, followups, photos] = await Promise.all([store.all('visits'), store.all('followups'), store.all('photos')]);
  const byVisit = new Map(visits.map(v => [v.id, v]));
  const chosen = photos.filter(p => p.blob && (scope === 'all' || !['confirmada'].includes(p.backupState)));
  const groups = [[]]; let size = 0;
  for (const p of chosen.sort((a, b) => String(a.addedAt).localeCompare(String(b.addedAt)))) {
    if (size && size + p.size > limit) { groups.push([]); size = 0; }
    groups[groups.length - 1].push(p); size += p.size;
  }
  const id = store.newId('respaldo'), createdAt = new Date().toISOString(), stamp = fileDate(new Date(createdAt));
  const parts = [];
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const manifest = {schema: BACKUP_SCHEMA, schemaVersion: BACKUP_SCHEMA_VERSION, backupId: id, createdAt, part: i + 1, parts: groups.length,
      app: 'Visitas de Campo Productores de Caña', counts: {visits: visits.length, followups: followups.length, photos: photos.length, photosInPart: group.length},
      photos: group.map(p => ({id: p.id, path: photoPath(p, byVisit.get(p.visitId)), sha256: p.sha256, size: p.size}))};
    const entries = [
      {name: 'manifest.json', blob: new Blob([JSON.stringify(manifest, null, 1)], {type: 'application/json'})},
      {name: 'datos/visitas.json', blob: new Blob([JSON.stringify(visits)], {type: 'application/json'})},
      {name: 'datos/seguimientos.json', blob: new Blob([JSON.stringify(followups)], {type: 'application/json'})},
      {name: 'datos/fotos.json', blob: new Blob([JSON.stringify(photos.map(meta))], {type: 'application/json'})},
      ...group.map(p => ({name: photoPath(p, byVisit.get(p.visitId)), blob: p.blob, date: new Date(p.takenAt || p.addedAt)})),
    ];
    onProgress({part: i + 1, parts: groups.length});
    const blob = await createStoredZip(entries);
    parts.push({name: `Respaldo_Visitas_${stamp}${groups.length > 1 ? `_parte_${i + 1}_de_${groups.length}` : ''}.zip`, blob, photoIds: group.map(p => p.id), bytes: blob.size});
  }
  return {id, createdAt, scope, parts};
}

/** Registra la descarga: el respaldo queda «exportado» (aún sin confirmar que se guardó fuera del teléfono). */
export async function markExported(backup) {
  const ids = new Set(backup.parts.flatMap(p => p.photoIds)), at = new Date().toISOString();
  const photos = (await store.all('photos')).filter(p => ids.has(p.id));
  await store.putMany([
    ['backups', {id: backup.id, createdAt: backup.createdAt, scope: backup.scope, confirmedAt: null,
      parts: backup.parts.map(p => ({name: p.name, bytes: p.bytes, photoIds: p.photoIds}))}],
    ...photos.map(p => ['photos', {...p, backupState: p.backupState === 'confirmada' ? 'confirmada' : 'exportada', exports: [...(p.exports || []), {backupId: backup.id, at}]}]),
  ]);
}
/** El usuario confirma que guardó el respaldo en la computadora u OneDrive. No borra nada del teléfono. */
export async function confirmBackup(backupId) {
  const backup = await store.get('backups', backupId); if (!backup) throw Error('Respaldo no encontrado');
  const ids = new Set(backup.parts.flatMap(p => p.photoIds)), at = new Date().toISOString();
  const photos = (await store.all('photos')).filter(p => ids.has(p.id));
  await store.putMany([['backups', {...backup, confirmedAt: at}], ...photos.map(p => ['photos', {...p, backupState: 'confirmada', confirmedAt: at}])]);
}

const newer = (a, b) => String(a?.updatedAt || '') > String(b?.updatedAt || '') || (String(a?.updatedAt || '') === String(b?.updatedAt || '') && (a?.rev || 0) > (b?.rev || 0));

/** Restaura una o varias partes. Devuelve el informe de integridad. */
export async function restoreBackup(files, {onProgress = () => {}} = {}) {
  const report = {parts: 0, visits: {added: 0, updated: 0, keptLocal: 0}, followups: {added: 0, updated: 0, keptLocal: 0},
    photos: {restored: 0, alreadyPresent: 0, corrupt: [], missing: [], unavailable: 0}, errors: []};
  const seen = {visits: new Set(), followups: new Set()};   // cada parte repite los datos: se cuentan una sola vez
  for (const file of files) {
    let entries;
    try { entries = await readStoredZip(file); } catch (e) { report.errors.push(`${file.name}: ${e.message}`); continue; }
    const byName = new Map(entries.map(e => [e.name, e]));
    const readJson = async name => { const e = byName.get(name); if (!e) throw Error('falta ' + name); return JSON.parse(await (await e.read()).text()); };
    let manifest, visits, followups, photoMeta;
    try {
      manifest = await readJson('manifest.json');
      if (manifest.schema !== BACKUP_SCHEMA || manifest.schemaVersion > BACKUP_SCHEMA_VERSION) throw Error('no es un respaldo de Visitas compatible');
      [visits, followups, photoMeta] = await Promise.all([readJson('datos/visitas.json'), readJson('datos/seguimientos.json'), readJson('datos/fotos.json')]);
    } catch (e) { report.errors.push(`${file.name}: ${e.message}`); continue; }
    report.parts++;
    onProgress({file: file.name});
    // Datos estructurados: se agrega lo que falta y se actualiza solo si el respaldo es más reciente.
    for (const [name, list, bucket] of [['visits', visits, report.visits], ['followups', followups, report.followups]]) {
      const local = new Map((await store.all(name)).map(r => [r.id, r]));
      const ops = [];
      for (const item of list) {
        if (seen[name].has(item.id)) continue; seen[name].add(item.id);
        const current = local.get(item.id);
        if (!current) { ops.push([name, item]); bucket.added++; }
        else if (newer(item, current)) { ops.push([name, item]); bucket.updated++; }
        else bucket.keptLocal++;
      }
      if (ops.length) await store.putMany(ops);
    }
    // Fotos: cada archivo se verifica con su SHA-256 antes de guardarlo.
    const localPhotos = new Map((await store.all('photos')).map(p => [p.id, p]));
    const inPart = new Map((manifest.photos || []).map(p => [p.id, p]));
    for (const meta of photoMeta) {
      const current = localPhotos.get(meta.id), entry = inPart.get(meta.id);
      if (current?.blob) { if (entry) report.photos.alreadyPresent++; continue; }
      if (!entry) { if (!current) { await store.put('photos', {...meta, blob: null, backupState: 'no-disponible'}); report.photos.unavailable++; } continue; }
      const zipEntry = byName.get(entry.path);
      if (!zipEntry) { report.photos.missing.push(meta.id); continue; }
      const blob = (await zipEntry.read()).slice(0, entry.size, meta.type || 'image/jpeg');
      if (await sha256(blob) !== meta.sha256) { report.photos.corrupt.push(meta.id); continue; }
      await store.put('photos', {...meta, blob, backupState: 'restaurada', restoredAt: new Date().toISOString()});
      report.photos.restored++;
    }
  }
  return report;
}
