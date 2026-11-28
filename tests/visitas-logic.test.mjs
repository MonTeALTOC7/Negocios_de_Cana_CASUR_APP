// Lógica pura de Visitas: fenología por edad (planta/soca, retrospectiva, sin caña), detalles no evaluados omitidos,
// migración de registros VC01, geometría punto-en-polígono y distancia al borde.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {phenology, cropCycle, ageLabel} from '../modules/visitas/js/agro.js';
import {filledDetails, category, CATEGORIES} from '../modules/visitas/js/catalog.js';
import {migrateVisitV1} from '../modules/visitas/js/store.js';
import {containsPoint, distanceToEdge} from '../modules/visitas/js/geo.js';

const rec = (a, state = 'Molienda') => ({attributes: a, state: {operationalState: state}});
test('fenología probable: planta y soca con sus rangos', () => {
  const planta = rec({plantingDate: '2026-01-01', lastCutDate: null});
  assert.equal(phenology(planta, '2026-01-20T10:00:00Z').stage, 'Germinación / brotación');
  assert.equal(phenology(planta, '2026-03-01T10:00:00Z').stage, 'Macollamiento');
  assert.equal(phenology(planta, '2026-07-01T10:00:00Z').stage, 'Gran crecimiento');
  assert.equal(phenology(planta, '2026-11-01T10:00:00Z').stage, 'Maduración probable');
  const soca = rec({plantingDate: '2020-05-01', lastCutDate: '2026-01-01'});
  assert.equal(cropCycle(soca, '2026-04-15').type, 'soca'); assert.equal(phenology(soca, '2026-04-15').stage, 'Gran crecimiento');   // 104 d > 100 en soca
  assert.equal(phenology(planta, '2026-04-15').stage, 'Macollamiento');                                                              // 104 d ≤ 120 en planta
});
test('fenología: retrospectiva usa la fecha de la visita; sin fecha o sin caña no se determina', () => {
  const r = rec({plantingDate: '2025-06-01', lastCutDate: '2026-02-01'});
  assert.equal(cropCycle(r, '2025-12-01').basis, 'siembra');     // antes del último corte vale la siembra
  assert.equal(cropCycle(r, '2026-03-01').basis, 'corte');
  assert.equal(phenology(rec({plantingDate: '2027-01-01'}), '2026-06-01').stage, null);
  assert.equal(phenology(rec({}), '2026-06-01').stage, null);
  assert.equal(phenology(rec({plantingDate: '2025-01-01'}, 'Sin Caña'), '2026-06-01').stage, null);
  assert.equal(ageLabel(45), '45 días'); assert.equal(ageLabel(null), '—');
});
test('detalles: los no evaluados se omiten (no evaluado ≠ cero) y el catálogo es coherente', () => {
  assert.deepEqual(filledDetails('malezas', {}), []);
  assert.deepEqual(filledDetails('malezas', {cobertura: 0, especies: ''}).map(d => d.value), ['0 %']);
  assert.equal(filledDetails('plagas', {organo: ['Hoja', 'Tallo']})[0].value, 'Hoja, Tallo');
  assert.equal(category('nutricion').id, 'otros'); assert.ok(CATEGORIES.some(c => c.id === 'fertilizacion'));
  assert.equal(new Set(CATEGORIES.map(c => c.id)).size, CATEGORIES.length);
  assert.ok(CATEGORIES.every(c => ['Baja', 'Media', 'Alta'].includes(c.suggested)));
});
test('migración VC01 → 1.1: hallazgos a su almacén, sin inventar severidad ni datos', () => {
  const v1 = {id: 'visita-1', schema: 1, status: 'cerrada', producer: {code: '7'}, startedAt: '2026-11-01T10:00:00Z', createdAt: 'a', updatedAt: 'b',
    lots: [{key: '7|01', selection: 'gps'}], fields: {humedad: 'Seco'}, observations: 'Obs', findings: [{id: 'h1', category: 'Nutrición', severity: 'Alta', lotKey: '7|01', text: 'x'}, {id: 'h2', category: 'Malezas', lotKey: '', text: ''}]};
  const {visit, findings} = migrateVisitV1(v1);
  assert.equal(visit.schema, 2); assert.deepEqual(visit.lotKeys, ['7|01']); assert.equal(visit.lotSources['7|01'], 'gps'); assert.equal(visit.general.notes, 'Obs'); assert.equal(visit.findings, undefined);
  assert.equal(findings[0].category, 'fertilizacion'); assert.deepEqual(findings[0].severity, {value: 'Alta', source: 'tecnico'});
  assert.equal(findings[1].severity, null); assert.equal(findings[1].lotKey, null);
  assert.equal(migrateVisitV1(visit).findings.length, 0);
});
test('geometría: punto en polígono con hueco y distancia al borde', () => {
  const g = {type: 'Polygon', coordinates: [[[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]], [[0.004, 0.004], [0.006, 0.004], [0.006, 0.006], [0.004, 0.006], [0.004, 0.004]]]};
  assert.equal(containsPoint(g, [0.002, 0.002]), true); assert.equal(containsPoint(g, [0.005, 0.005]), false); assert.equal(containsPoint(g, [0.02, 0.02]), false);
  const d = distanceToEdge(g, [0.001, 0.005]); assert.ok(Math.abs(d - 111.3) < 1, String(d));
});
