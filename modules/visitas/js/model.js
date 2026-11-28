/* Reglas de negocio de Visitas (sin interfaz).
   Conceptos separados, nunca mezclados:
     1. Ubicación física del dispositivo (gps.fix)          4. Ubicación de cada foto/hallazgo (con procedencia)
     2. Suerte detectada por GPS (gps.detected)              5. Selección manual (destino fijado por el técnico)
     3. Finca/suerte OBJETO del registro (target)
   La selección manual manda: el GPS nunca la cambia. Si discrepa, solo se informa. */
import * as store from './store.js';
import {maestro, snapshotFor, snapshotRecord, refreshMaestro} from './maestro.js';
import {gps, latestFix} from './geo.js';
import {phenology} from './agro.js';
import {STATES, category} from './catalog.js';

export const nowIso = () => new Date().toISOString();
const sameDay = (a, b) => String(a).slice(0, 10) === String(b).slice(0, 10);

/* ---------- Destino del registro ---------- */
let target = null;   // {farmCode, lotKey|null, source: 'manual'}
export async function loadTarget() { target = await store.getSetting('target', null); return target; }
export async function setManualTarget(farmCode, lotKey = null) { target = farmCode ? {farmCode, lotKey, source: 'manual', at: nowIso()} : null; await store.setSetting('target', target); return target; }
export const clearTarget = () => setManualTarget(null);
/** Objeto del registro: manual si existe; si no, la suerte detectada de forma confiable por el GPS. */
export async function resolveTarget() {
  const {reader, byLotCode} = await maestro();
  const det = gps.state === 'confiable' && gps.detected ? byLotCode.get(gps.detected.lotId) || null : null;
  const detected = det ? {farmCode: det.identity.farmCode, lotKey: det.key, record: det} : null;
  if (target) {
    const rec = target.lotKey ? reader.byKey(target.lotKey) : null, farm = reader.farm(target.farmCode);
    const discrepancy = detected && (detected.farmCode !== target.farmCode ? 'farm' : target.lotKey && detected.lotKey !== target.lotKey ? 'lot' : null);
    return {farmCode: target.farmCode, farm, lotKey: target.lotKey, record: rec, source: 'manual', detected, discrepancy};
  }
  if (detected) return {farmCode: detected.farmCode, farm: reader.farm(detected.farmCode), lotKey: detected.lotKey, record: det, source: 'gps', detected, discrepancy: null};
  return {farmCode: null, farm: null, lotKey: null, record: null, source: null, detected: null, discrepancy: null};
}

/* ---------- Visitas ---------- */
export async function author() { return store.getSetting('author', ''); }
export async function openVisits() { return (await store.all('visits')).filter(v => v.status === 'abierta' && !v.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
/** Crea una visita (manual, retrospectiva o desde la detección GPS). La instantánea del Maestro se toma ahora. */
export async function createVisit({farmCode, lotKeys = [], scope = lotKeys.length ? 'suertes' : 'finca', startedAt = nowIso(), lotSource = 'manual', followupOf = null}) {
  await refreshMaestro();
  const {reader, resolution} = await maestro(), farm = reader.farm(farmCode);
  if (!farm) throw Error('Productor o finca no encontrado en el Maestro');
  const visit = {id: store.newId('visita'), schema: 2, status: 'abierta', rev: 1, createdAt: nowIso(), updatedAt: nowIso(), startedAt, closedAt: null,
    author: {name: await author()}, producer: {code: farm.code, name: farm.name, zone: farm.zone}, scope, lotKeys: [...new Set(lotKeys)],
    lotSources: Object.fromEntries(lotKeys.map(k => [k, lotSource])), general: {}, masterSnapshot: snapshotFor(reader, resolution, farm.code),
    deviceStart: latestFix(60000) ? {...latestFix(60000)} : null, followupOf, revisions: []};
  delete visit.deviceStart?.t;
  await store.put('visits', visit);
  return visit;
}
/** Visita abierta del mismo productor y día; si no existe, se crea. La suerte se incorpora sin tocar lo anterior. */
export async function ensureVisit(farmCode, lotKey, lotSource) {
  const today = nowIso();
  let v = (await openVisits()).find(x => x.producer.code === farmCode && sameDay(x.startedAt, today));
  if (!v) return createVisit({farmCode, lotKeys: lotKey ? [lotKey] : [], lotSource});
  if (lotKey && !v.lotKeys.includes(lotKey)) v = await addLotToVisit(v.id, lotKey, lotSource);
  return v;
}
export async function addLotToVisit(visitId, lotKey, lotSource = 'manual') {
  return store.update('visits', visitId, cur => {
    if (cur.lotKeys.includes(lotKey)) return null;
    // Si la suerte no estaba en la instantánea (catálogo de la finca), se agrega desde el Maestro vigente.
    return {...cur, scope: 'suertes', lotKeys: [...cur.lotKeys, lotKey], lotSources: {...cur.lotSources, [lotKey]: lotSource}, updatedAt: nowIso(), rev: cur.rev + 1};
  }).then(async r => r || store.get('visits', visitId));
}
export async function saveVisit(visit, baseRev) {
  const cur = await store.get('visits', visit.id);
  const next = {...visit, updatedAt: nowIso()};
  if (cur?.status === 'cerrada') {
    const keys = ['startedAt', 'scope', 'lotKeys', 'general', 'author'], changed = keys.filter(k => JSON.stringify(cur[k]) !== JSON.stringify(next[k]));
    if (changed.length) next.revisions = [...(cur.revisions || []), {rev: (cur.rev || 0) + 1, at: nowIso(), by: next.author?.name || '', changed, previous: Object.fromEntries(changed.map(k => [k, cur[k]]))}];
  }
  return store.putChecked('visits', next, baseRev);
}
export async function closeVisit(id) { return store.update('visits', id, cur => ({...cur, status: 'cerrada', closedAt: nowIso(), updatedAt: nowIso(), rev: cur.rev + 1})); }
export async function reopenVisit(id) { return store.update('visits', id, cur => ({...cur, status: 'abierta', updatedAt: nowIso(), rev: cur.rev + 1, revisions: [...(cur.revisions || []), {rev: cur.rev + 1, at: nowIso(), changed: ['status'], previous: {status: 'cerrada'}}]})); }
export function recordOf(visit, lotKey) { return visit?.masterSnapshot?.records?.find(r => r.key === lotKey) || null; }

/* ---------- Hallazgos ---------- */
export async function createFinding({visit, lotKey = null, categoryId, observation = '', details = {}, severity = null, gpsFix = null, observedAt = nowIso()}) {
  const rec = recordOf(visit, lotKey), ph = phenology(rec, observedAt);
  const loc = gpsFix ? {lat: gpsFix.lat, lon: gpsFix.lon, accuracy: gpsFix.accuracy, at: gpsFix.at, source: 'device'} : {source: 'none'};
  const f = {id: store.newId('hallazgo'), schema: 2, visitId: visit.id, producerCode: visit.producer.code, lotKey, category: categoryId, createdAt: nowIso(), updatedAt: nowIso(), rev: 1,
    observedAt, observation, details, severity, gps: loc, phenology: ph?.stage ? {computed: ph.stage, ageDays: ph.ageDays, type: ph.type, corrected: null} : null,
    status: 'Abierto', history: [{state: 'Abierto', at: nowIso(), note: ''}]};
  await store.put('findings', f);
  return f;
}
export const saveFinding = (f, baseRev) => store.putChecked('findings', {...f, updatedAt: nowIso()}, baseRev);
/** Borrado lógico reversible (deshacer). Las fotos asociadas NO se borran. */
export const softDeleteFinding = id => store.update('findings', id, cur => ({...cur, deletedAt: nowIso(), updatedAt: nowIso(), rev: cur.rev + 1}));
export const restoreFinding = id => store.update('findings', id, cur => { const {deletedAt, ...rest} = cur; return {...rest, updatedAt: nowIso(), rev: cur.rev + 1}; });
export async function setFindingState(id, state, note = '') {
  const by = await author();
  return store.update('findings', id, cur => cur.status === state && !note ? null : {...cur, status: state, updatedAt: nowIso(), rev: cur.rev + 1, history: [...(cur.history || []), {state, at: nowIso(), note, by}]});
}
/** Registro rápido de un toque: crea (o reutiliza) la visita del día y el hallazgo con GPS si está disponible. */
export async function quickFinding(categoryId) {
  const t = await resolveTarget();
  if (!t.farmCode) throw Object.assign(Error('Elegí una finca o activá la ubicación'), {code: 'NO_TARGET'});
  const visit = await ensureVisit(t.farmCode, t.lotKey, t.source === 'gps' ? 'gps' : 'manual');
  const finding = await createFinding({visit, lotKey: t.lotKey, categoryId, gpsFix: latestFix(30000)});
  return {visit, finding, target: t};
}

/* ---------- Recomendaciones, solicitudes, compromisos ---------- */
export async function createFollowup({kind, visit, findingId = null, lotKey = null, text = '', extra = {}, relatedTo = null}) {
  const by = await author(), initial = STATES[kind][0];
  const f = {id: store.newId(kind), kind, visitId: visit.id, findingId, producerCode: visit.producer.code, producerName: visit.producer.name, lotKey, text,
    priority: null, responsible: '', dueDate: '', notes: '', ...extra, relatedTo, state: initial, createdAt: nowIso(), updatedAt: nowIso(), rev: 1,
    history: [{state: initial, at: nowIso(), note: 'Registrada', by}]};
  await store.put('followups', f);
  return f;
}
export const saveFollowup = (f, baseRev) => store.putChecked('followups', {...f, updatedAt: nowIso()}, baseRev);
export async function setFollowupState(id, state, note = '', evidence = null) {
  const by = await author();
  return store.update('followups', id, cur => cur.state === state && !note && !evidence ? null : {...cur, state, updatedAt: nowIso(), rev: cur.rev + 1,
    history: [...(cur.history || []), {state, at: nowIso(), note, by, visitId: evidence?.visitId || null}]});
}
export const isOverdue = f => f.dueDate && !['Cumplido', 'Cancelado', 'Ejecutado', 'Verificado', 'Atendida', 'Rechazada', 'Cancelada'].includes(f.state) && f.dueDate < nowIso().slice(0, 10);

/* ---------- Consultas ---------- */
export async function everything() {
  const [visits, findings, followups, photos] = await Promise.all([store.all('visits'), store.all('findings'), store.all('followups'), store.all('photos')]);
  return {visits: visits.filter(v => !v.deletedAt), findings: findings.filter(f => !f.deletedAt), followups: followups.filter(f => !f.removedFromVisit), photos};
}
export const categoryLabel = id => category(id).label;
export {snapshotRecord};
