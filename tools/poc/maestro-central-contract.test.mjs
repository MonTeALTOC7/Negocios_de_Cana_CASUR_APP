// Pruebas del PoC del contrato de lectura del Maestro Central. Solo lectura sobre los archivos versionados del repo.
// Uso: node --test tools/poc/maestro-central-contract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildCentralView, reader, compareModule, areaDiffBuckets, canonicalLot, identityKey} from './maestro-central-contract.mjs';

const json = f => JSON.parse(fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8'));
const crono = json('modules/produccion/data/cronologico.json');
const before = JSON.stringify(crono);
const view = buildCentralView(crono), api = reader(view);

test('identidad compuesta: ceros a la izquierda y suertes alfanuméricas', () => {
  assert.equal(canonicalLot('1'), '01'); assert.equal(canonicalLot('01'), '01'); assert.equal(canonicalLot('5a'), '05A');
  assert.equal(canonicalLot('13B'), '13B'); assert.equal(canonicalLot('100'), '100'); assert.equal(canonicalLot('S/N'), 'S/N');
  assert.equal(identityKey('024', '1'), '24|01'); assert.notEqual(identityKey('19', '21B'), identityKey('192', '1B'));
});

test('generación 1102: 1053 identidades únicas, sin colisiones ni suertes no canónicas', () => {
  assert.equal(view.dataVersion, '2026.11.22-aforo.1102'); assert.equal(view.aforoDate, '2026-10-12');
  assert.equal(view.count, 1053); assert.deepEqual(view.issues, []);
  assert.equal(api.list(r => /[A-Z]$/.test(r.identity.lot)).length, 133);
});

test('estados separados: ausente ≠ baja; estimado ausente ≠ fuera de área; TCH 0 ≠ inactivo', () => {
  const all = api.list();
  assert.equal(all.filter(r => r.state.presence === 'absent').length, 7);
  assert.ok(all.filter(r => r.state.presence === 'absent').every(r => r.provenance.inherited), 'ausentes conservan atributos heredados');
  assert.equal(all.filter(r => r.state.operationalState === 'Baja definitiva').length, 2);
  assert.equal(all.filter(r => r.state.participatesCurrentArea).length, 995);   // Molienda 946 + Semilla 49
  const activeNoEstimate = all.filter(r => r.state.participatesCurrentArea && r.state.estimate === 'missing');
  assert.ok(activeNoEstimate.every(r => r.attributes.area !== null), 'área conocida no se convierte en 0 ni se excluye');
  assert.ok(all.every(r => r.state.loss === null), 'pérdida parcial/total: no representada en la fuente (se informa, no se inventa)');
});

test('capas con autoridad propia expuestas sin recalcular', () => {
  const r = api.get('242', '1');
  assert.equal(r.layers.forecast.tch, 20); assert.equal(r.layers.forecast.tons, 14.6);
  assert.equal(r.layers.executed.tch, crono.producers.find(p => p.code === '242').details[0].tch);
  assert.ok(r.provenance.cells.code.sheet, 'procedencia por celda');
});

test('vista inmutable y fuente intacta', () => {
  const r = api.get('242', '01');
  assert.throws(() => { r.attributes.area = 99; }, TypeError);
  assert.equal(JSON.stringify(crono), before);
});

for (const [id, file] of [['riego', 'modules/riego/data/bootstrap.json'], ['insumos', 'modules/insumos/data/bootstrap.json'], ['tch', 'modules/tch/data/suertes.json']]) {
  test(`diagnóstico de solo lectura ${id}: mismas identidades, diferencias medidas y no corregidas`, () => {
    const bundle = json(file), copy = JSON.stringify(bundle), d = compareModule(view, id, bundle);
    assert.equal(d.matched, 1053); assert.deepEqual(d.onlyModule, []); assert.deepEqual(d.onlyCentral, []); assert.deepEqual(d.duplicates, []);
    assert.equal(d.diffs.area, 148, 'área divergente respecto de 1102 (copia propia desactualizada)');
    assert.equal(JSON.stringify(bundle), copy);
    console.log(id, JSON.stringify(d.diffs), JSON.stringify(areaDiffBuckets(view, id, bundle)));
  });
}
