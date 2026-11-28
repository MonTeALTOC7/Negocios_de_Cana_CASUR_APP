/* Lectura del Maestro Central para Visitas (contrato MC01, solo lectura) e instantánea por visita. */
import {loadMaestroCentral} from '../../../core/shared-data/maestro-central.js';

let loading = null;
export function maestro() {
  loading ??= loadMaestroCentral({base: new URL('../../../', import.meta.url)}).then(result => {
    // Si la caché GIS todavía no estaba preparada, la próxima lectura vuelve a intentar incluir las referencias GIS.
    if (!result.reader.version().gisVersion) setTimeout(() => { loading = null; }, 5000);
    return result;
  }).catch(e => { loading = null; throw e; });
  return loading;
}

/** Copia reducida y congelada en la visita: lo que el técnico vio al registrar. No incluye celdas de procedencia. */
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
