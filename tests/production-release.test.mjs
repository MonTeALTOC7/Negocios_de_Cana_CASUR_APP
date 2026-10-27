import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {APP_VERSION,APP_RELEASES,MODULE_VERSIONS,PRODUCTION_RELEASES} from '../core/versions/versions.js';
test('metadatos locales distinguen PWA, módulo e Histórico y quedan precacheados',()=>{
 const release=PRODUCTION_RELEASES[0];
 assert.equal(release.moduleVersion,MODULE_VERSIONS.produccion);
 assert.equal(APP_RELEASES[0].version,APP_VERSION);
 assert.equal(release.appVersion,APP_VERSION);
 assert.ok(APP_RELEASES.some(app=>app.version===release.appVersion));
 assert.equal(release.historicalVersion,'V2.9');
 assert.ok(release.changes.length>=2);
 assert.equal(PRODUCTION_RELEASES.find(r=>r.moduleVersion==='V1.5.1').appVersion,'1.3.5');
 assert.equal(PRODUCTION_RELEASES.find(r=>r.moduleVersion==='V1.5.0').appVersion,'1.3.4');
 assert.ok(Object.isFrozen(PRODUCTION_RELEASES[1]));
 const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 assert.ok(sw.includes("'./modules/produccion/js/release-info.js'"));
 assert.ok(sw.includes("'./core/versions/versions.js'"));
});
