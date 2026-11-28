/* Respaldo y restauración de Visitas.
   - Cada parte es un ZIP autosuficiente: todos los datos estructurados + una porción de los originales, organizados
     por año/mes/finca/visita. La división depende de la memoria declarada del dispositivo.
   - Restauración: verifica el SHA-256 de cada foto; no duplica; conserva el registro más reciente (rev/fecha);
     NUNCA sobrescribe una foto local con contenido distinto (se informa como conflicto); informa partes faltantes.
   - Compatible con los respaldos de VC01 (esquema 1): se migran al restaurar con la misma regla de la base local.
   - Un ZIP descargado no es un respaldo confirmado: el técnico confirma que lo guardó fuera del teléfono. */
import {createStoredZip, readStoredZip} from './zip.js';
import * as store from './store.js';
import {sha256, photoExtension} from './photos.js';

export const BACKUP_SCHEMA = 'casur-visitas-respaldo';
export const BACKUP_SCHEMA_VERSION = 2;
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const fileDate = (d = new Date()) => `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
const clean = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'sin_dato';

export function partLimitBytes() {
  const gb = Number(navigator.deviceMemory) || 4;
  return Math.round(Math.min(200, Math.max(40, gb * 25)) * 1024 * 1024);
}
export function photoPath(photo, visit) {
  const d = new Date(visit?.startedAt || photo.addedAt);
  return `fotos/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${clean(visit?.producer?.code)}_${clean(visit?.producer?.name)}/${clean(visit?.id || photo.visitId)}/${clean(photo.id)}.${photoExtension(photo)}`;
}
const meta = photo => { const {blob, thumb, ...rest} = photo; return rest; };
const json = v => new Blob([JSON.stringify(v)], {type: 'application/json'});

export async function buildBackup({scope = 'pending', limit = partLimitBytes(), onProgress = () => {}} = {}) {
  const [visits, findings, followups, photos] = await Promise.all([store.all('visits'), store.all('findings'), store.all('followups'), store.all('photos')]);
  const byVisit = new Map(visits.map(v => [v.id, v]));
  const chosen = photos.filter(p => p.blob && (scope === 'all' || p.backupState !== 'confirmada'));
  const groups = [[]]; let size = 0;
  for (const p of chosen.sort((a, b) => String(a.addedAt).localeCompare(String(b.addedAt)))) {
    if (size && size + p.size > limit) { groups.push([]); size = 0; }
    groups.at(-1).push(p); size += p.size;
  }
  const id = store.newId('respaldo'), createdAt = new Date().toISOString(), stamp = fileDate(new Date(createdAt)), parts = [];
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const manifest = {schema: BACKUP_SCHEMA, schemaVersion: BACKUP_SCHEMA_VERSION, backupId: id, createdAt, part: i + 1, parts: groups.length,
      app: 'Visitas de Campo Productores de Caña', counts: {visits: visits.length, findings: findings.length, followups: followups.length, photos: photos.length, photosInPart: group.length},
      photos: group.map(p => ({id: p.id, path: photoPath(p, byVisit.get(p.visitId)), sha256: p.sha256, size: p.size}))};
    onProgress({part: i + 1, parts: groups.length});
    const blob = await createStoredZip([
      {name: 'manifest.json', blob: json(manifest)}, {name: 'datos/visitas.json', blob: json(visits)}, {name: 'datos/hallazgos.json', blob: json(findings)},
      {name: 'datos/seguimientos.json', blob: json(followups)}, {name: 'datos/fotos.json', blob: json(photos.map(meta))},
      ...group.map(p => ({name: photoPath(p, byVisit.get(p.visitId)), blob: p.blob, date: new Date(p.takenAt || p.addedAt)})),
    ]);
    parts.push({name: `Respaldo_Visitas_${stamp}${groups.length > 1 ? `_parte_${i + 1}_de_${groups.length}` : ''}.zip`, blob, photoIds: group.map(p => p.id), bytes: blob.size});
  }
  return {id, createdAt, scope, parts};
}
export async function markExported(backup) {
  const ids = new Set(backup.parts.flatMap(p => p.photoIds)), at = new Date().toISOString();
  const photos = (await store.all('photos')).filter(p => ids.has(p.id));
  await store.putMany([
    ['backups', {id: backup.id, createdAt: backup.createdAt, scope: backup.scope, confirmedAt: null, parts: backup.parts.map(p => ({name: p.name, bytes: p.bytes, photoIds: p.photoIds}))}],
    ...photos.map(p => ['photos', {...p, backupState: p.backupState === 'confirmada' ? 'confirmada' : 'exportada', exports: [...(p.exports || []), {backupId: backup.id, at}]}]),
  ]);
}
export async function confirmBackup(backupId) {
  const backup = await store.get('backups', backupId); if (!backup) throw Error('Respaldo no encontrado');
  const ids = new Set(backup.parts.flatMap(p => p.photoIds)), at = new Date().toISOString();
  const photos = (await store.all('photos')).filter(p => ids.has(p.id));
  await store.putMany([['backups', {...backup, confirmedAt: at}], ...photos.map(p => ['photos', {...p, backupState: 'confirmada', confirmedAt: at}])]);
}

const newer = (a, b) => (a?.rev || 0) > (b?.rev || 0) || ((a?.rev || 0) === (b?.rev || 0) && String(a?.updatedAt || '') > String(b?.updatedAt || ''));
/** Restaura una o varias partes, de uno o varios respaldos, en cualquier orden. Devuelve el informe de integridad. */
export async function restoreBackup(files, {onProgress = () => {}} = {}) {
  const report = {parts: 0, visits: {added: 0, updated: 0, keptLocal: 0}, findings: {added: 0, updated: 0, keptLocal: 0}, followups: {added: 0, updated: 0, keptLocal: 0},
    photos: {restored: 0, alreadyPresent: 0, corrupt: [], missing: [], unavailable: 0, conflicts: []}, incomplete: [], errors: []};
  const seen = {visits: new Set(), findings: new Set(), followups: new Set()}, partsSeen = new Map();
  for (const file of files) {
    let entries;
    try { entries = await readStoredZip(file); } catch (e) { report.errors.push(`${file.name}: ${e.message}`); continue; }
    const byName = new Map(entries.map(e => [e.name, e]));
    const readJson = async (name, optional = false) => { const e = byName.get(name); if (!e) { if (optional) return []; throw Error('falta ' + name); } return JSON.parse(await (await e.read()).text()); };
    let manifest, visits, findings, followups, photoMeta;
    try {
      manifest = await readJson('manifest.json');
      if (manifest.schema !== BACKUP_SCHEMA || manifest.schemaVersion > BACKUP_SCHEMA_VERSION) throw Error('no es un respaldo de Visitas compatible');
      [visits, findings, followups, photoMeta] = await Promise.all([readJson('datos/visitas.json'), readJson('datos/hallazgos.json', true), readJson('datos/seguimientos.json'), readJson('datos/fotos.json')]);
    } catch (e) { report.errors.push(`${file.name}: ${e.message}`); continue; }
    report.parts++; onProgress({file: file.name});
    if (!partsSeen.has(manifest.backupId)) partsSeen.set(manifest.backupId, {total: manifest.parts, got: new Set(), createdAt: manifest.createdAt});
    partsSeen.get(manifest.backupId).got.add(manifest.part);
    // Respaldo VC01 (esquema 1): migración con la misma regla de la base local.
    if ((manifest.schemaVersion || 1) < 2) {
      const migrated = visits.map(store.migrateVisitV1); visits = migrated.map(m => m.visit); findings = [...findings, ...migrated.flatMap(m => m.findings)];
    }
    for (const [name, list, bucket] of [['visits', visits, report.visits], ['findings', findings, report.findings], ['followups', followups, report.followups]]) {
      const local = new Map((await store.all(name)).map(r => [r.id, r])), ops = [];
      for (const item of list) {
        if (seen[name].has(item.id)) continue; seen[name].add(item.id);
        const current = local.get(item.id);
        if (!current) { ops.push([name, item]); bucket.added++; }
        else if (newer(item, current)) { ops.push([name, item]); bucket.updated++; }
        else bucket.keptLocal++;
      }
      if (ops.length) await store.putMany(ops);
    }
    const localPhotos = new Map((await store.all('photos')).map(p => [p.id, p])), inPart = new Map((manifest.photos || []).map(p => [p.id, p]));
    for (const m of photoMeta) {
      const current = localPhotos.get(m.id), entry = inPart.get(m.id);
      if (current?.blob) {
        if (entry && current.sha256 !== entry.sha256) report.photos.conflicts.push(m.id);   // mismo id, otro contenido: no se toca
        else if (entry) report.photos.alreadyPresent++;
        continue;
      }
      if (!entry) { if (!current) { await store.put('photos', {...m, blob: null, thumb: null, backupState: 'no-disponible'}); report.photos.unavailable++; } continue; }
      const zipEntry = byName.get(entry.path);
      if (!zipEntry) { report.photos.missing.push(m.id); continue; }
      const blob = (await zipEntry.read()).slice(0, entry.size, m.type || 'image/jpeg');
      if (await sha256(blob) !== m.sha256 || entry.sha256 !== m.sha256) { report.photos.corrupt.push(m.id); continue; }
      await store.put('photos', {...m, blob, thumb: null, backupState: 'restaurada', restoredAt: new Date().toISOString()});
      report.photos.restored++;
    }
  }
  for (const [id, s] of partsSeen) if (s.got.size < s.total) report.incomplete.push({backupId: id, createdAt: s.createdAt, total: s.total, missing: Array.from({length: s.total}, (_, i) => i + 1).filter(n => !s.got.has(n))});
  // Fotos que siguen sin original después de restaurar todo lo entregado.
  report.photos.stillUnavailable = (await store.all('photos')).filter(p => !p.blob).length;
  return report;
}
