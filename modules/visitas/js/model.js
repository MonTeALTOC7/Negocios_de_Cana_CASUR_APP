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
  let v = (await openVisits()).find(x => x.producer?.code === farmCode && sameDay(x.startedAt, today));
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
/** Visita sin productor: borrador heredado de VC01 («Nueva visita» la creaba vacía). Se conserva y se puede completar. */
export const isIncompleteVisit = v => !v?.producer?.code;
export async function completeVisitProducer(id, farmCode, lotKeys = []) {
  const {reader, resolution} = await maestro(), farm = reader.farm(farmCode); if (!farm) throw Error('Productor no encontrado en el Maestro');
  return store.update('visits', id, cur => ({...cur, producer: {code: farm.code, name: farm.name, zone: farm.zone}, masterSnapshot: cur.masterSnapshot || snapshotFor(reader, resolution, farm.code),
    lotKeys: lotKeys.length ? lotKeys : cur.lotKeys || [], scope: lotKeys.length ? 'suertes' : cur.scope || 'finca', updatedAt: nowIso(), rev: cur.rev + 1,
    revisions: [...(cur.revisions || []), {rev: cur.rev + 1, at: nowIso(), changed: ['producer'], previous: {producer: null}}]}));
}

/* ---------- Contexto propio de cada registro (v3) ----------
   Un hallazgo, una foto o un seguimiento lleva su productor, su suerte y la instantánea agronómica de esa suerte al
   registrarse. La visita es OPCIONAL: si existe, el contexto sale de ella; si no, del Maestro vigente. */
export const producerOf = x => x?.producer?.code ? x.producer : null;
export const isUnidentified = x => !producerOf(x);
export async function contextFor(farmCode, lotKey = null) {
  if (!farmCode) return {producer: null, lotKey: null, record: null, dataVersion: null};
  const {reader} = await maestro(), farm = reader.farm(farmCode);
  if (!farm) throw Error('Productor no encontrado en el Maestro');
  const r = lotKey ? reader.byKey(lotKey) : null;
  return {producer: {code: farm.code, name: farm.name, zone: farm.zone}, lotKey: r ? r.key : null, record: snapshotRecord(r), dataVersion: reader.version().dataVersion};
}
const contextOfVisit = (visit, lotKey) => ({producer: {...visit.producer}, lotKey, record: recordOf(visit, lotKey), dataVersion: visit.masterSnapshot?.dataVersion ?? null});

/* ---------- Hallazgos ---------- */
/** Crea un hallazgo. Con `visit` queda vinculado a esa visita; sin ella es un hallazgo de campo INDEPENDIENTE, con su
    propio contexto (`context` de contextFor). Nunca se crea una visita para sostenerlo. */
export async function createFinding({visit = null, context = null, lotKey = null, categoryId, observation = '', details = {}, severity = null, gpsFix = null, observedAt = nowIso(), draft = false}) {
  const ctx = visit ? contextOfVisit(visit, lotKey) : context || {producer: null, lotKey: null, record: null, dataVersion: null};
  const ph = phenology(ctx.record, observedAt);
  const loc = gpsFix ? {lat: gpsFix.lat, lon: gpsFix.lon, accuracy: gpsFix.accuracy, at: gpsFix.at, source: 'device'} : {source: 'none'};
  const f = {id: store.newId('hallazgo'), schema: 3, visitId: visit?.id || null, producer: ctx.producer, producerCode: ctx.producer?.code ?? null, lotKey: ctx.lotKey,
    record: ctx.record, dataVersion: ctx.dataVersion, author: await author(), category: categoryId, createdAt: nowIso(), updatedAt: nowIso(), rev: 1,
    observedAt, observation, details, severity, gps: loc, phenology: ph?.stage ? {computed: ph.stage, ageDays: ph.ageDays, type: ph.type, corrected: null} : null,
    status: 'Abierto', draft: draft || !ctx.producer, history: [{state: 'Abierto', at: nowIso(), note: ''}]};
  await store.put('findings', f);
  return f;
}
/** Identifica (o corrige) el productor y la suerte de un hallazgo independiente o borrador; queda en el historial. */
export async function setFindingContext(id, farmCode, lotKey = null) {
  const ctx = await contextFor(farmCode, lotKey);
  return store.update('findings', id, cur => {
    if (cur.visitId) throw Error('Un hallazgo de una visita toma el productor de la visita.');
    const ph = phenology(ctx.record, cur.observedAt);
    return {...cur, ...ctx, producerCode: ctx.producer.code, draft: false, phenology: ph?.stage ? {computed: ph.stage, ageDays: ph.ageDays, type: ph.type, corrected: cur.phenology?.corrected ?? null} : null,
      updatedAt: nowIso(), rev: cur.rev + 1, history: [...(cur.history || []), {state: cur.status, at: nowIso(), note: `Identificado: ${ctx.producer.name}${ctx.lotKey ? ' · suerte ' + ctx.lotKey.split('|')[1] : ''}`}]};
  });
}
export const saveFinding = (f, baseRev) => store.putChecked('findings', {...f, updatedAt: nowIso()}, baseRev);
/** Borrado lógico reversible (deshacer). Las fotos asociadas NO se borran. */
export const softDeleteFinding = id => store.update('findings', id, cur => ({...cur, deletedAt: nowIso(), updatedAt: nowIso(), rev: cur.rev + 1}));
export const restoreFinding = id => store.update('findings', id, cur => { const {deletedAt, ...rest} = cur; return {...rest, updatedAt: nowIso(), rev: cur.rev + 1}; });
export async function setFindingState(id, state, note = '') {
  const by = await author();
  return store.update('findings', id, cur => cur.status === state && !note ? null : {...cur, status: state, updatedAt: nowIso(), rev: cur.rev + 1, history: [...(cur.history || []), {state, at: nowIso(), note, by}]});
}
/** Registro rápido de un toque. Por omisión es un hallazgo INDEPENDIENTE (no crea ni reutiliza visitas) con el GPS
    reciente si existe. Con `visitId` se agrega a esa visita formal; si es de otro día (retrospectiva) toma su fecha y
    NO recibe la ubicación actual del teléfono. */
export async function quickFinding(categoryId, {visitId = null} = {}) {
  const t = await resolveTarget();
  if (visitId) {
    const visit = await store.get('visits', visitId); if (!visit) throw Error('La visita no existe en este teléfono.');
    if (isIncompleteVisit(visit)) throw Object.assign(Error('Esta visita no tiene productor: completala primero.'), {code: 'INCOMPLETE_VISIT'});
    const lotKey = t.farmCode === visit.producer.code && t.lotKey && (visit.scope === 'finca' || visit.lotKeys.includes(t.lotKey)) ? t.lotKey : visit.lotKeys.length === 1 ? visit.lotKeys[0] : null;
    const today = sameDay(visit.startedAt, nowIso());
    const finding = await createFinding({visit, lotKey, categoryId, gpsFix: today ? latestFix(30000) : null, observedAt: today ? nowIso() : visit.startedAt});
    return {visit, finding, target: t};
  }
  if (!t.farmCode) throw Object.assign(Error('Elegí una finca o activá la ubicación'), {code: 'NO_TARGET'});
  const finding = await createFinding({context: await contextFor(t.farmCode, t.lotKey), categoryId, gpsFix: latestFix(30000)});
  return {visit: null, finding, target: t};
}

/* ---------- Recomendaciones, solicitudes, compromisos ---------- */
/** El contexto sale, en este orden, del hallazgo, de la visita o del productor/suerte indicados (`context`). */
export async function createFollowup({kind, visit = null, finding = null, findingId = null, context = null, lotKey = null, text = '', extra = {}, relatedTo = null}) {
  const by = await author(), initial = STATES[kind][0];
  finding ??= findingId ? await store.get('findings', findingId) : null;
  visit ??= finding?.visitId ? await store.get('visits', finding.visitId) : null;
  const producer = finding?.producer || visit?.producer || context?.producer || null;
  if (!producer?.code) throw Error('Indicá el productor antes de registrar el seguimiento.');
  const f = {id: store.newId(kind), schema: 3, kind, visitId: visit?.id || finding?.visitId || null, findingId: finding?.id || null, producer: {...producer}, producerCode: producer.code, producerName: producer.name,
    lotKey: lotKey ?? finding?.lotKey ?? context?.lotKey ?? null, text, priority: null, responsible: '', dueDate: '', notes: '', ...extra, relatedTo, state: initial,
    createdAt: nowIso(), updatedAt: nowIso(), rev: 1, history: [{state: initial, at: nowIso(), note: 'Registrada', by}]};
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
/** Todos los registros vivos. Nada se descarta por estar incompleto: las visitas sin productor se informan aparte. */
export async function everything() {
  const [visits, findings, followups, photos] = await Promise.all([store.all('visits'), store.all('findings'), store.all('followups'), store.all('photos')]);
  const live = visits.filter(v => !v.deletedAt);
  return {visits: live.filter(v => !isIncompleteVisit(v)), incompleteVisits: live.filter(isIncompleteVisit),
    findings: findings.filter(f => !f.deletedAt), followups: followups.filter(f => !f.removedFromVisit), photos};
}
export const categoryLabel = id => category(id).label;
/** Productores atendidos en un conjunto de registros: visitas formales, hallazgos independientes y evidencias. */
export function attendedProducers({visits = [], findings = [], photos = []}) {
  const m = new Map();
  for (const x of [...visits, ...findings, ...photos]) { const p = producerOf(x); if (p) m.set(p.code, p); }
  return m;
}
export {snapshotRecord};
