// PoC aislado del contrato de lectura del Maestro Central (MC01). No se importa desde el runtime publicado y no
// escribe en ningún almacén. Construye una vista inmutable a partir de la generación oficial de Producción
// (cronologico.json) y compara contra las copias propias de los módulos (Riego, Insumos, TCH) sin modificarlas.
// Especificación: docs/MAESTRO_CENTRAL_CONTRATO.md.

export const CONTRACT_VERSION = 'casur-maestro-central/0.1-poc';

/** Identidad compuesta canónica: código de hacienda sin ceros a la izquierda (como en la fuente) y suerte en mayúsculas
 *  con al menos dos dígitos iniciales («1» → «01», «5A» → «05A»). Nunca se convierte la suerte en número. */
export function canonicalLot(value) {
  const t = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
  const m = t.match(/^(\d+)([A-Z]*)$/);
  if (!m) return t;               // identidades no estándar se conservan tal cual (se informan, no se reparan)
  return m[1].padStart(2, '0') + m[2];
}
export function canonicalFarm(value) {
  const t = String(value ?? '').trim();
  return /^\d+$/.test(t) ? String(Number(t)) : t;
}
export const identityKey = (farm, lot) => `${canonicalFarm(farm)}|${canonicalLot(lot)}`;

// Map: se congelan sus valores; el propio Map solo se expone mediante reader() (sin set/delete).
const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { if (o instanceof Map) o.forEach(deepFreeze); Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };

/** Estados separados (nunca un único booleano «activo»): presencia en la fuente, estado operativo original,
 *  participación en el área vigente y en molienda, y disponibilidad del estimado. */
function stateOf(d) {
  const hasEstimate = Number.isFinite(d.forecast?.tch) || Number.isFinite(d.tchEst2627);
  return {
    presence: d.sourcePresence || 'unknown',                        // present | absent | unknown
    operationalState: d.operationalState ?? d.estado ?? null,        // categoría original (Molienda, Sin Caña, Baja definitiva…)
    classification: d.classification ?? null,
    participatesCurrentArea: d.participatesCurrentArea === true,
    participatesMilling: d.participatesMilling === true,
    estimate: hasEstimate ? 'available' : 'missing',                // «missing» ≠ fuera del área activa
    renovation: d.renovacion === true ? true : (d.renovacion === false ? false : null),
    loss: null,                                                     // pérdida parcial/total: sin campo en la fuente actual
  };
}

export function buildCentralView(crono, {source = 'modules/produccion/data/cronologico.json'} = {}) {
  const meta = crono?.meta || {};
  if (!meta.dataVersion) throw Error('Generación sin dataVersion: no se construye la vista');
  const records = new Map(), issues = [];
  for (const p of crono.producers || []) for (const d of p.details || []) {
    const farm = d.permanentIdentity?.code ?? d.code, lot = d.permanentIdentity?.lot ?? d.suerte;
    const key = identityKey(farm, lot);
    if (records.has(key)) { issues.push({type: 'duplicate-identity', key}); continue; }
    if (canonicalLot(lot) !== String(lot)) issues.push({type: 'non-canonical-lot', key, raw: lot});
    records.set(key, {
      key, identity: {farmCode: String(farm), lot: String(lot), lotCode: d.codLote ?? null, erp: d.erp || null},
      farm: {name: d.name ?? p.name, zone: d.zona ?? p.zone, tenure: d.tenencia ?? null},
      attributes: {area: num(d.area), inventoryArea: num(d.inventoryArea), millingArea: num(d.millingArea), variety: d.variedad ?? null,
        irrigationType: d.tipoRiego ?? null, irrigationCount: num(d.numeroRiegos), texture: d.textura ?? null, furrow: d.surco ?? null,
        cut: d.corte ?? null, destination: d.destino ?? null, cropType: d.tipoCultivo ?? null, plantingDate: d.fSiembra ?? null,
        lastCutDate: d.fUltCte ?? null, distanceKm: num(d.distancia), observation: d.observacion ?? ''},
      state: stateOf(d),
      // Capas con autoridad propia: se exponen tal cual, nunca se recalculan aquí.
      layers: {
        executed: {season: '25/26', tch: num(d.tch)},
        forecast: d.forecast ? {...d.forecast} : (Number.isFinite(d.tchEst2627) ? {season: '26/27', tch: d.tchEst2627, tons: num(d.tonEst2627)} : null),
        plan: d.plan ? {...d.plan} : null,
      },
      provenance: {dataVersion: d.dataVersion ?? meta.dataVersion, source: d.source?.file ?? meta.source ?? null, cells: d.provenance ?? null,
        inherited: d.inherited ?? null, history: d.changeHistory ?? []},
    });
  }
  return deepFreeze({contractVersion: CONTRACT_VERSION, dataVersion: meta.dataVersion, previousDataVersion: meta.previousDataVersion ?? null,
    generatedAt: meta.generated ?? null, aforoDate: meta.tchEst2627EffectiveDate ?? null, sourceProfiles: meta.sourceProfiles ?? [],
    source, count: records.size, issues, records});
}
function num(v) { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; }

/** API de lectura compartida (solo lectura). */
export function reader(view) {
  return Object.freeze({
    version: () => ({contractVersion: view.contractVersion, dataVersion: view.dataVersion, aforoDate: view.aforoDate}),
    get: (farm, lot) => view.records.get(identityKey(farm, lot)) ?? null,
    list: (filter = () => true) => [...view.records.values()].filter(filter),
    farms: () => [...new Set([...view.records.values()].map(r => r.identity.farmCode))],
    has: key => view.records.has(key),
  });
}

/** Adaptadores de las copias propias de cada módulo → {key, fields}. Mapean SOLO campos con significado equivalente
 *  comprobado; los de significado distinto se declaran para no producir diferencias falsas. */
export const MODULE_ADAPTERS = {
  riego: {rows: b => b.master, key: r => identityKey(r.farmCode, r.lot),
    fields: {area: r => num(r.area), variety: r => r.variety ?? null, irrigationType: r => r.irrigationType ?? null, texture: r => r.texture ?? null, zone: r => r.zone ?? null},
    notEquivalent: {cropStartDate: 'max(F. Siembra, F. Ult. Cte); no es la fecha de siembra', nrMaster: 'número de riegos objetivo; no es #_de_Riegos ejecutados'}},
  insumos: {rows: b => b.maestro, key: r => identityKey(r.hacienda, r.suerte),
    fields: {area: r => num(r.area), variety: r => r.variedad ?? null, texture: r => r.textura ?? null, cut: r => r.corte ?? null, destination: r => r.destino ?? null}},
  tch: {rows: b => b, key: r => identityKey(r.codigoHacienda, r.suerte),
    fields: {area: r => num(r.area), variety: r => r.variedad ?? null, cut: r => r.corte ?? null},
    notEquivalent: {tchEstimado2627: 'estimado propio del Estimador TCH (2026-07-17); no es el aforo oficial'}},
};
const centralField = {area: r => r.attributes.area, variety: r => r.attributes.variety, irrigationType: r => r.attributes.irrigationType,
  texture: r => r.attributes.texture, zone: r => r.farm.zone, cut: r => r.attributes.cut, destination: r => r.attributes.destination};

const same = (a, b) => (typeof a === 'number' || typeof b === 'number') ? (a === null || b === null ? a === b : Math.abs(a - b) < 0.005)
  : String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/** Diagnóstico de solo lectura: identidades faltantes/sobrantes y diferencias por campo. Nunca corrige. */
export function compareModule(view, moduleId, bundle) {
  const a = MODULE_ADAPTERS[moduleId]; if (!a) throw Error('Módulo sin adaptador: ' + moduleId);
  const rows = a.rows(bundle) || [], seen = new Set(), diffs = {}, samples = {}, onlyModule = [], duplicates = [];
  for (const row of rows) {
    const key = a.key(row);
    if (seen.has(key)) { duplicates.push(key); continue; } seen.add(key);
    const c = view.records.get(key); if (!c) { onlyModule.push(key); continue; }
    for (const [f, get] of Object.entries(a.fields)) {
      const mv = get(row), cv = centralField[f](c);
      if (!same(mv, cv)) { diffs[f] = (diffs[f] || 0) + 1; (samples[f] ??= []).length < 3 && samples[f].push({key, central: cv, module: mv}); }
    }
  }
  const onlyCentral = [...view.records.keys()].filter(k => !seen.has(k));
  return {moduleId, rows: rows.length, matched: rows.length - onlyModule.length - duplicates.length, onlyModule, onlyCentral, duplicates, diffs, samples,
    notEquivalent: a.notEquivalent || {}};
}

/** Distribución de diferencias de área (ha) para distinguir redondeo/remensura de cambios sustantivos. */
export function areaDiffBuckets(view, moduleId, bundle) {
  const a = MODULE_ADAPTERS[moduleId], b = {'≤0.02': 0, '0.02–0.5': 0, '0.5–2': 0, '>2': 0, 'cero↔no cero': 0};
  for (const row of a.rows(bundle) || []) {
    const c = view.records.get(a.key(row)); if (!c) continue;
    const x = num(row.area), y = c.attributes.area; if (x === null || y === null) continue;
    const d = Math.abs(x - y); if (d < 0.005) continue;
    if ((x === 0) !== (y === 0)) b['cero↔no cero']++; else if (d <= 0.02) b['≤0.02']++; else if (d <= 0.5) b['0.02–0.5']++; else if (d <= 2) b['0.5–2']++; else b['>2']++;
  }
  return b;
}
