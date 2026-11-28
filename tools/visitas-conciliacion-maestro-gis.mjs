// Conciliación Maestro Central (generación vigente) ↔ GIS publicado (shared/geo/data). Solo lectura: no modifica
// datos oficiales ni geometrías. Identidad: código oficial de suerte (codLote = HHH + SSS) contra properties.lotId.
// Uso: node tools/visitas-conciliacion-maestro-gis.mjs [OUT_JSON]
import fs from 'node:fs';
import {buildMaestroView, maestroReader} from '../core/shared-data/maestro-central.js';

const read = f => JSON.parse(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'));
const crono = read('modules/produccion/data/cronologico.json'), manifest = read('shared/geo/data/manifest.json');
const view = buildMaestroView(crono, {gisManifest: manifest}), reader = maestroReader(view), records = reader.list();
const TENURE = {CA: 'Arriendo', CV: 'Compra Venta', PR: 'Propio', Arriendo: 'Arriendo', 'Compra Venta': 'Compra Venta', Propio: 'Propio'};
const tenureOf = r => TENURE[r.farm.tenure] || r.farm.tenure || 'Sin dato';

// Geometría: fragmentos por suerte y zona del archivo que la contiene.
const gis = new Map();
for (const [zone, z] of Object.entries(manifest.zones)) {
  for (const f of read('shared/geo/data/' + z.file).features) {
    const id = String(f.properties?.lotId || '').toUpperCase(); if (!id) continue;
    const g = gis.get(id) || {zone, fragments: 0, zones: new Set()}; g.fragments++; g.zones.add(zone); gis.set(id, g);
  }
}
const byCode = new Map(records.map(r => [String(r.identity.lotCode || '').toUpperCase(), r]));
const matched = records.filter(r => gis.has(String(r.identity.lotCode).toUpperCase()));
const noGeometry = records.filter(r => !gis.has(String(r.identity.lotCode).toUpperCase()));
const noRecord = [...gis.keys()].filter(id => !byCode.has(id));
const base = code => code.replace(/[A-Z]+$/, '');
const zoneMismatch = matched.filter(r => gis.get(String(r.identity.lotCode).toUpperCase()).zone !== r.farm.zone);
const count = (list, fn) => list.reduce((m, x) => { const k = fn(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const farmsMultiZone = Object.values(view.farms).map(f => ({code: f.code, name: f.name, zones: [...new Set(f.keys.map(k => view.records[k].farm.zone))]})).filter(f => f.zones.length > 1);
const farmsMixedTenure = Object.values(view.farms).map(f => ({code: f.code, name: f.name, tenures: count(f.keys.map(k => view.records[k]), tenureOf)})).filter(f => Object.keys(f.tenures).length > 1);
const lot = r => ({key: r.key, lotCode: r.identity.lotCode, farm: r.farm.name, farmCode: r.farm.code, lot: r.identity.lot, zone: r.farm.zone, tenure: tenureOf(r), state: r.state.operationalState, presence: r.state.presence});

const report = {
  generatedAt: new Date().toISOString(),
  maestro: {dataVersion: view.dataVersion, aforoDate: view.aforoDate, generated: view.generatedAt, previousDataVersion: view.previousDataVersion, source: view.source,
    note: 'La fecha oficial del aforo es la de la fuente (tchEst2627EffectiveDate). La generación de noviembre actualizó planificación y otros atributos; no es un aforo nuevo.',
    farms: Object.keys(view.farms).length, lots: records.length},
  gis: {dataVersion: manifest.dataVersion, crs: manifest.crs, source: manifest.source, lotCount: manifest.lotCount, fragmentCount: manifest.fragmentCount,
    byZone: Object.fromEntries(Object.entries(manifest.zones).map(([k, z]) => [k, {lots: z.lotCount, fragments: z.fragmentCount}]))},
  reconciliation: {
    matched: matched.length, maestroWithoutGeometry: noGeometry.map(r => ({...lot(r), partitionOf: gis.has(base(String(r.identity.lotCode))) ? base(String(r.identity.lotCode)) : null})),
    geometryWithoutRecord: noRecord.map(id => ({lotId: id, zone: gis.get(id).zone, fragments: gis.get(id).fragments, partitionOf: byCode.has(base(id)) ? base(id) : null})),
    zoneMismatch: zoneMismatch.map(r => ({...lot(r), gisZone: gis.get(String(r.identity.lotCode).toUpperCase()).zone})),
    inactiveWithGeometry: matched.filter(r => !r.state.participatesCurrentArea).map(lot),
  },
  classification: {
    note: 'La clasificación de negocio es la tenencia de cada suerte (CA Arriendo, CV Compra Venta, PR Propio) y es independiente de la zona geográfica.',
    lotsByTenureAndZone: count(records, r => `${tenureOf(r)} · ${r.farm.zone}`),
    compraVentaOutsideProductoresZone: records.filter(r => tenureOf(r) === 'Compra Venta' && r.farm.zone !== '5-Productores').map(lot),
    farmsMultiZone, farmsMixedTenure,
  },
  stateCounts: count(records, r => r.state.operationalState || 'Sin dato'),
};
const out = JSON.stringify(report, null, 1);
if (process.argv[2]) fs.writeFileSync(process.argv[2], out + '\n');
console.log(`Maestro ${report.maestro.dataVersion} (aforo ${report.maestro.aforoDate}): ${report.maestro.lots} suertes · GIS ${report.gis.dataVersion}: ${report.gis.lotCount} suertes, ${report.gis.fragmentCount} fragmentos`);
console.log(`Coinciden ${report.reconciliation.matched} · Maestro sin geometría ${noGeometry.length} · Geometría sin registro ${noRecord.length} · Zona distinta ${zoneMismatch.length} · Inactivas con geometría ${report.reconciliation.inactiveWithGeometry.length}`);
console.log(`Compra Venta fuera de 5-Productores: ${report.classification.compraVentaOutsideProductoresZone.map(l => `${l.farm} ${l.lot} (${l.zone})`).join(', ') || 'ninguna'}`);
console.log(`Fincas en varias zonas: ${farmsMultiZone.map(f => `${f.name} (${f.zones.join(', ')})`).join('; ') || 'ninguna'} · Fincas con tenencia mixta: ${farmsMixedTenure.length}`);
