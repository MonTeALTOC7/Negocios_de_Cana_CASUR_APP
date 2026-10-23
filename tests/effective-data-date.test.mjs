import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarDate,effectiveChronoDate} from '../modules/produccion/js/effective-data-date.js';
import {owners,increased} from '../tools/check-release-policy.mjs';
test('fecha efectiva válida, inválida, ausente y procedencia',()=>{
 assert.equal(calendarDate('2026-09-06T20:16:06.485Z'),'06-sep-2026');
 for(const value of ['2026-02-29','2026-11-31','2026-13-01','2026-09-06garbage',null]) assert.equal(calendarDate(value),null);
 assert.equal(calendarDate('2024-02-29'),'29-feb-2024');
 assert.equal(effectiveChronoDate({meta:{publishedAt:'2026-11-15'}}).text,'Cronológico 15-nov-2026');
 assert.match(effectiveChronoDate({meta:{generated:'2026-11-15'}}).detail,/Generación.*no acreditada/);
 assert.equal(effectiveChronoDate({meta:{importedAt:'2026-11-15'}}).text,'Cronológico: fecha N/D');
});
test('política separa shell, módulo, datos y documentación',()=>{
 assert.deepEqual(owners('app.js'),['shell']);
 assert.deepEqual(owners('modules/tch/js/app.js'),['tch']);
 assert.deepEqual(owners('modules/produccion/index.html'),['produccion']);
 for(const path of ['modules/produccion/data/version.json','shared/geo/data/manifest.json','modules/tch/tests/gps.test.mjs','docs/CHANGELOG.md']) assert.deepEqual(owners(path),[]);
 assert.ok(increased('V1.5.0','V1.5.1')); assert.ok(!increased('1.3.5','1.3.4')); assert.ok(!increased('v6','v7'));
});
