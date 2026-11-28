/* Maestro Central para Visitas (contrato MC01, solo lectura).
   - Se recarga cuando cambia la fuente efectiva (nueva generación publicada o local) aunque la app siga abierta:
     las visitas NUEVAS usan la generación vigente; las anteriores conservan su instantánea.
   - Índice GIS → registro por lotCode del catálogo (nunca por texto concatenado). */
import {loadMaestroCentral, currentSourceSignature} from '../../../core/shared-data/maestro-central.js';

const base = new URL('../../../', import.meta.url);
let loading = null, loadedSig = null, lastCheck = 0;
export function maestro() {
  loading ??= loadMaestroCentral({base}).then(result => {
    loadedSig = result.signature;
    const byLotCode = new Map(result.reader.list().map(r => [String(r.identity.lotCode || '').toUpperCase(), r]));
    // Sin caché GIS preparada todavía: la próxima lectura vuelve a intentar incluir las referencias GIS.
    if (!result.reader.version().gisVersion) setTimeout(() => { loading = null; }, 5000);
    return {...result, byLotCode};
  }).catch(e => { loading = null; throw e; });
  return loading;
}
/** Comprueba (barato) si cambió la fuente efectiva y, si cambió, descarta la vista en memoria. */
export async function refreshMaestro({force = false} = {}) {
  if (!force && Date.now() - lastCheck < 20000) return false;
  lastCheck = Date.now();
  const sig = await currentSourceSignature({base}).catch(() => null);
  if (!loadedSig || !sig || sig.split('|').slice(0, 3).join('|') === loadedSig.split('|').slice(0, 3).join('|')) return false;
  loading = null; await maestro(); return true;
}

/** Copia reducida y congelada en la visita: lo que el técnico vio al registrar (sin celdas de procedencia). */
export function snapshotRecord(r) {
  if (!r) return null;
  return JSON.parse(JSON.stringify({
    key: r.key, identity: r.identity, farm: r.farm, attributes: r.attributes, areas: r.areas, state: r.state,
    estimate: {season: r.estimate.season, available: r.estimate.available, status: r.estimate.status, tch: r.estimate.tch, tons: r.estimate.tons},
    executed: r.layers.executed, plan: r.layers.plan ? {date: r.layers.plan.date?.iso ?? null, cut: r.layers.plan.cut ?? null} : null,
    gis: r.gis, provenance: {dataVersion: r.provenance.dataVersion, source: r.provenance.source, sourceDate: r.provenance.sourceDate},
  }));
}
export function snapshotFor(reader, resolution, farmCode) {
  const v = reader.version(), farm = reader.farm(farmCode);
  return {
    takenAt: new Date().toISOString(), contractVersion: v.contractVersion, dataVersion: v.dataVersion, origin: v.origin,
    resolutionReason: resolution?.reason ?? null, aforoDate: v.aforoDate, estimateSeason: v.estimateSeason, executedSeason: v.executedSeason,
    gisVersion: v.gisVersion, farm: farm ? {code: farm.code, name: farm.name, zone: farm.zone} : null,
    records: reader.lotsOf(farmCode).map(snapshotRecord),
  };
}
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Búsqueda de productores/fincas por código o nombre, y también por código completo de suerte («99321») o por
    nombre y suerte («pansaco 21»): en esos casos se devuelve la finca de la suerte encontrada. */
export function searchFarms(reader, q, limit = 12) {
  const t = norm(q).trim(); if (!t) return [];
  const farms = reader.farms();
  const exact = farms.filter(f => f.code === t), starts = farms.filter(f => f.code !== t && f.code.startsWith(t)), named = farms.filter(f => norm(f.name).includes(t));
  const viaLot = searchLots(reader, q, limit).map(r => reader.farm(r.identity.farmCode)).filter(Boolean);
  return [...new Set([...exact, ...starts, ...named, ...viaLot])].slice(0, limit);
}
/** Suertes por código completo (HHHSSS, con o sin separador) o «nombre de hacienda + número de suerte». */
export function searchLots(reader, q, limit = 12) {
  const t = norm(q).trim(); if (!t) return [];
  const compact = t.replace(/[\s\-·.|/]+/g, '').toUpperCase(), list = reader.list(), out = [];
  for (const r of list) if (String(r.identity.lotCode || '').toUpperCase() === compact) out.push(r);
  const m = t.match(/^(.*?)[\s\-·.|/]+(?:s(?:uerte)?\.?\s*)?([0-9]+[a-z]?)$/i);
  if (m && m[1].trim()) {
    const name = m[1].trim(), lot = m[2].toUpperCase().replace(/^0*(\d)/, '$1');
    for (const r of list) {
      const rl = String(r.identity.lot).toUpperCase().replace(/^0*(\d)/, '$1');
      if (rl === lot && (norm(r.farm.name).includes(name) || r.identity.farmCode === name)) out.push(r);
    }
  }
  return [...new Set(out)].slice(0, limit);
}
