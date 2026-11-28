// La política del núcleo (contrato del Maestro Central) y la de Producción deben decidir igual en todos los casos.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {officialSourcePriority as core} from '../core/shared-data/source-policy.js';
import {officialSourcePriority as produccion} from '../modules/produccion/js/official-source-policy.js';

const versions = ['2026.09.06-siagri.1415', '2026.10.25-aforo.1101', '2026.11.22-aforo.1102', '2026.12.01-aforo.1103', 'legacy', undefined];
function snapshots(current) {
  const meta = {dataVersion: current, manualChanges: false};
  const production = {dataVersion: current, meta, operationalDataset: {contractVersion: 1, dataVersion: current, catalog: [{codLote: '1'}], cronologico: {meta}}};
  const maestro = {version: current};
  const ok = {production, maestro, archive: structuredClone({production, maestro})};
  const custom = structuredClone(ok); custom.production.reportRows = [{Area: 1}];
  const manual = structuredClone(ok); manual.production.meta.manualChanges = true;
  return [{}, ok, custom, manual, {production, maestro}];
}
test('core y Producción producen la misma decisión en la matriz completa', () => {
  let n = 0;
  for (const official of versions) for (const current of versions) for (const personal of [false, true]) for (const preference of [undefined, 'personal', 'official'])
    for (const online of [true, false]) for (const snapshot of snapshots(current)) {
      const input = {official, current, personal, preference, snapshot, online};
      assert.equal(core(structuredClone(input)), produccion(structuredClone(input)), JSON.stringify(input)); n++;
    }
  assert.ok(n > 2000);
});
