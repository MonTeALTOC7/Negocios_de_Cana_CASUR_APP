// Contrato de lectura del Maestro Central (MC01): identidad, estados, paridad con el Maestro de Suertes publicado,
// inmutabilidad sin tocar la fuente, zafras dinámicas y resolución de fuentes con la política vigente.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildMaestroView, maestroReader, resolveMaestroSource, canonicalLot, canonicalFarm, identityKey, previousSeason, cronologicoFromReportRows} from '../core/shared-data/maestro-central.js';

const json = f => JSON.parse(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'));
const crono = json('modules/produccion/data/cronologico.json'), gis = json('shared/geo/data/manifest.json');
const before = JSON.stringify(crono);
const view = buildMaestroView(crono, {gisManifest: gis}), api = maestroReader(view);
const sum = (rows, f) => rows.reduce((a, r) => a + (f(r) || 0), 0);
const close = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6, `${m}: ${a} ≠ ${b}`);

test('identidad: ceros a la izquierda, alfanuméricas, sin codLote', () => {
  assert.equal(canonicalLot('1'), '01'); assert.equal(canonicalLot('5a'), '05A'); assert.equal(canonicalLot('13B'), '13B');
  assert.equal(canonicalLot('2.0'), '02'); assert.equal(canonicalFarm('024'), '24'); assert.equal(identityKey(242, 1), '242|01');
  assert.notEqual(identityKey('19', '21B'), identityKey('192', '1B'));
  assert.equal(api.get('242', '1'), api.get('242', '01'));
});

test('generación publicada: 1053 identidades válidas, sin duplicados ni lotes no canónicos', () => {
  assert.equal(view.dataVersion, crono.meta.dataVersion); assert.equal(view.count, 1053); assert.deepEqual(view.issues, []);
  assert.equal(api.list(r => /[A-Z]$/.test(r.identity.lot)).length, 133);
  assert.equal(api.farms().length, crono.producers.length);
});

test('paridad con los totales operativos publicados del Maestro de Suertes', () => {
  const t = crono.operational.totals, all = api.list();
  assert.equal(all.filter(r => r.state.participatesCurrentArea).length, t.active);
  assert.equal(all.filter(r => r.state.participatesMilling).length, t.milling);
  assert.equal(all.filter(r => r.state.presence === 'absent').length, t.absent);
  assert.equal(all.filter(r => r.estimate.status === 'usable').length, t.usable);
  close(sum(all, r => r.areas.active), t.activeArea, 'área activa');
  close(sum(all, r => r.areas.milling), t.millingArea, 'área de molienda');
  close(sum(all, r => r.areas.seed), t.seedArea, 'área de semilla');
  close(sum(all, r => r.areas.pendingEstimate), t.pendingMillingArea, 'área pendiente de estimado');
  close(sum(all, r => r.estimate.status === 'usable' ? r.areas.milling * r.estimate.tch : 0), t.millingTons, 'toneladas oficiales');
});

test('estados: ausente ≠ baja; estimado faltante/cero ≠ inactivo; desconocido ≠ 0', () => {
  const all = api.list();
  assert.ok(all.filter(r => r.state.presence === 'absent').every(r => r.provenance.inherited && !r.state.participatesCurrentArea));
  assert.equal(all.filter(r => r.state.operationalState === 'Baja definitiva').length, 2);
  assert.ok(all.every(r => r.state.loss === null && r.areas.lostDocumented === null));
  // Suerte sintética: Molienda presente con estimado faltante o cero sigue activa y su área queda pendiente.
  const base = crono.producers[0].details[0];
  for (const tch of [null, 0]) {
    const synthetic = {meta: {dataVersion: '2099.01.01-test.1', estimateSeason: '30/31'}, producers: [{code: '999', name: 'Sintética', details: [
      {...structuredClone(base), code: '999', suerte: '07', codLote: '99907', permanentIdentity: {code: '999', lot: '07'}, forecast: {season: '30/31', tch, tons: null}}]}]};
    const r = maestroReader(buildMaestroView(synthetic)).get('999', '7');
    assert.equal(r.state.participatesCurrentArea, true); assert.equal(r.estimate.status, tch === null ? 'missing' : 'zero');
    assert.equal(r.estimate.available, tch !== null); assert.equal(r.areas.pendingEstimate, r.areas.milling);
    assert.equal(r.layers.executed.season, '29/30'); assert.equal(r.estimate.season, '30/31');
  }
});

test('superficie física conocida separada del área productiva y con procedencia', () => {
  const sinCana = api.list(r => r.state.operationalState === 'Sin Caña');
  assert.ok(sinCana.every(r => r.attributes.area === 0 && !r.state.participatesCurrentArea));
  const r = api.get('904', '01');
  assert.deepEqual({...r.areas.physicalKnown}, {value: 4.94, fromVersion: '2026.09.06-siagri.1415', basis: 'history'});
  assert.equal(api.get('147', '10A').areas.physicalKnown.basis, 'inherited');
  assert.ok(api.list().every(r => r.areas.physicalKnown.value === null ? r.areas.physicalKnown.basis === 'unknown' : r.areas.physicalKnown.value > 0));
});

test('capas oficiales sin recalcular y zafras dinámicas', () => {
  assert.equal(view.estimateSeason, crono.meta.estimateSeason); assert.equal(view.executedSeason, previousSeason(crono.meta.estimateSeason));
  assert.equal(previousSeason('99/00'), '98/99'); assert.equal(previousSeason('00/01'), '99/00'); assert.equal(previousSeason('26/28'), null);
  const d = crono.producers.find(p => p.code === '242').details[0], r = api.get('242', '01');
  assert.deepEqual(JSON.parse(JSON.stringify(r.layers.forecast)), d.forecast); assert.deepEqual(JSON.parse(JSON.stringify(r.layers.plan)), d.plan);
  assert.equal(r.layers.executed.tch, d.tch); assert.equal(r.provenance.cells.code.sheet, d.provenance.code.sheet);
});

test('referencias GIS por catálogo: 4 activas sin polígono', () => {
  const missing = api.list(r => r.state.participatesCurrentArea && r.gis.hasGeometry === false).map(r => r.identity.lotCode).sort();
  assert.deepEqual(missing, ['18413A', '1921B', '337A', '606'].sort());
  assert.equal(view.gisVersion, gis.dataVersion);
});

test('inmutabilidad real sin congelar ni modificar la fuente', () => {
  const r = api.get('242', '01');
  assert.throws(() => { r.attributes.area = 1; }, TypeError); assert.throws(() => { r.layers.forecast.tch = 1; }, TypeError);
  assert.throws(() => { view.records['x|01'] = {}; }, TypeError); assert.throws(() => { view.list.push({}); }, TypeError);
  assert.equal(Object.isFrozen(crono.producers[0].details[0]), false); assert.equal(JSON.stringify(crono), before);
});

const local = version => ({production: {dataVersion: version, meta: {manualChanges: false},
  operationalDataset: {contractVersion: 1, dataVersion: version, catalog: [{codLote: '1'}], cronologico: {meta: {dataVersion: version, manualChanges: false}, producers: []}}},
  maestro: {version}});
test('resolución de fuentes con la política vigente (no solo «la más reciente»)', () => {
  const official = {meta: {dataVersion: '2026.11.22-aforo.1102'}};
  assert.equal(resolveMaestroSource({official}).effective, 'official');
  const older = local('2026.10.25-aforo.1101'); older.archive = structuredClone({production: older.production, maestro: older.maestro});
  assert.equal(resolveMaestroSource({official, snapshot: older}).policy, 'official');                       // ordinaria sin cambios → oficial
  assert.equal(resolveMaestroSource({official, snapshot: older, preference: 'personal'}).effective, 'local');  // fijada por el propietario
  const noArchive = local('2026.10.25-aforo.1101');
  assert.equal(resolveMaestroSource({official, snapshot: noArchive}).effective, 'local');                       // preservada
  assert.equal(resolveMaestroSource({official, snapshot: older, online: false}).effective, 'local');            // offline: se conserva
  assert.equal(resolveMaestroSource({official, snapshot: local('2026.12.01-aforo.1103')}).effective, 'local');  // local más nueva
  assert.equal(resolveMaestroSource({official, snapshot: older, preference: 'official'}).effective, 'official');
  const siagri = {production: {dataVersion: '2026.12.01-siagri.1', reportRows: [{}]}};
  const s = resolveMaestroSource({official, snapshot: siagri});
  // La generación SIAGRI local se lee con el contrato: Producción y los demás módulos ven la MISMA generación.
  assert.equal(s.production, 'local'); assert.equal(s.effective, 'local'); assert.equal(s.localKind, 'siagri'); assert.equal(s.warning, 'local-reduced');
  const unknown = resolveMaestroSource({official, snapshot: {production: {dataVersion: '2026.12.01-x.1'}}});
  assert.equal(unknown.effective, 'official'); assert.equal(unknown.warning, 'local-incompatible');
});

test('generación local SIAGRI: misma identidad y atributos que la fuente, sin inventar capas ausentes', () => {
  const rows = [
    {'Hac-Sue': '24201', Cod: '242', Hacienda: 'Sintética', Suerte: '1', Area: 0.73, Variedad: 'CP 72-2086', '#_de_Corte': 10, Textura: 'Liviano',
     'F. Ult. Cte': '2025-12-31', 'F. Siembra': '2017-06-02', Destino: 'Molienda', Tenencia: 'CV', Tipo_de_Riego: 'Secano', ZONA: '5-Productores',
     Estado: 'Molienda', TCH_Z2526: 31.5, TCH_Estimado_Z2627: 20, Ton_Estimadas_Z2627: 14.6},
    {Cod: '242', Hacienda: 'Sintética', Suerte: '05A', Area: 0, Variedad: 'X', Destino: 'Molienda', Estado: 'Sin Caña', TCH_Estimado_Z2627: null},
  ];
  const crono = cronologicoFromReportRows(rows, {dataVersion: '2026.12.01-siagri.900'});
  const r = maestroReader(buildMaestroView(crono, {origin: 'local'}));
  assert.equal(r.view.reduced, true); assert.equal(r.view.estimateSeason, '26/27'); assert.equal(r.view.executedSeason, '25/26');
  const a = r.get('242', '01'); assert.equal(a.attributes.area, 0.73); assert.equal(a.attributes.plantingDate, '2017-06-02');
  assert.equal(a.state.participatesMilling, true); assert.equal(a.estimate.status, 'usable'); assert.equal(a.layers.plan, null);
  const b = r.get('242', '5A'); assert.equal(b.state.operationalState, 'Sin Caña'); assert.equal(b.state.participatesCurrentArea, false);
  assert.equal(b.areas.physicalKnown.basis, 'unknown');
});
