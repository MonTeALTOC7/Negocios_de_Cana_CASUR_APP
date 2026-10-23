import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {APP_VERSION,MODULE_VERSIONS,PRODUCTION_RELEASES} from '../core/versions/versions.js';
test('metadatos locales distinguen PWA, módulo e Histórico y quedan precacheados',()=>{
 const release=PRODUCTION_RELEASES[0];
 assert.equal(release.moduleVersion,MODULE_VERSIONS.produccion);
 assert.equal(release.appVersion,APP_VERSION);
 assert.equal(release.historicalVersion,'V2.9');
 assert.ok(release.changes.length>=6);
 const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 assert.ok(sw.includes("'./modules/produccion/js/release-info.js'"));
 assert.ok(sw.includes("'./core/versions/versions.js'"));
});
