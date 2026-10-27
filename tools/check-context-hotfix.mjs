import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {APP_VERSION,MODULE_VERSIONS} from '../core/versions/versions.js';
const base='4125f61498e428d4c3be10ddacabc290cbe3d44a',git=(...a)=>execFileSync('git',a,{encoding:'utf8',maxBuffer:64e6}).trim(),sha=b=>createHash('sha256').update(b).digest('hex');
git('merge-base','--is-ancestor',base,'HEAD');
assert.equal(APP_VERSION,'1.5.2');assert.equal(MODULE_VERSIONS.produccion,'V1.7.2');assert.equal(MODULE_VERSIONS.tch,'2.8.1');
const manifest=JSON.parse(fs.readFileSync('tools/release-c4-manifest.json'));
for(const [file,h]of Object.entries(manifest.files)){
 const p='modules/produccion/data/'+file;assert.equal(sha(fs.readFileSync(p)),h,p);
 assert.equal(git('rev-parse',base+':'+p),git('hash-object',p),p+' byte-identical to published main');
}
assert.equal(JSON.parse(fs.readFileSync('modules/produccion/data/version.json')).publishedAt,null);
assert.equal(manifest.dataVersion,'2026.10.25-aforo.1101');
assert.equal(git('diff',base,'--','manifest.webmanifest','shared/geo','modules/tch'),'','Scope/GEO/TCH remain unchanged');
const allowed=new Set(['.github/workflows/casur-release-gate.yml','app.js','core/updates/pwa-update.js','core/updates/context-store.js','core/module-registry/registry.js','core/versions/versions.js','core/versions/runtime-assets.json','index.html','sw.js','modules/produccion/index.html','modules/produccion/js/official-data-updates.js','modules/produccion/package.json','modules/produccion/VERSION.txt','modules/produccion/README_GITHUB.md','modules/produccion/tests/geo-integration.test.mjs','tests/app-version.test.mjs','tests/preview-release.test.mjs','tests/context-store.test.mjs','tools/check-context-hotfix.mjs','tools/qa-context-hotfix.cjs','tools/qa-c2-updates.cjs','docs/HOTFIX_CONTEXTO_PWA.md']);
const changed=[...git('diff','--name-only',base).split('\n'),...git('ls-files','--others','--exclude-standard').split('\n')].filter(Boolean);
assert.deepEqual(changed.filter(p=>!allowed.has(p)),[],'Only focused hotfix files');
assert.ok(!changed.some(p=>/\.(zip|xlsx?|enc|pem|key|bak)$|(^|\/)(profiles?|snapshots?|node_modules|recovery-private)(\/|$)/i.test(p)),'No QA/private artifacts');
assert.equal(Object.keys(JSON.parse(fs.readFileSync('core/versions/runtime-assets.json')).assets).length,167);
for(const script of ['tools/sync-versions.mjs','tools/runtime-assets.mjs','tools/production-integrity.mjs'])execFileSync(process.execPath,[script],{stdio:'inherit'});
if(process.argv.includes('--for-push')){assert.ok(git('log','-1','--format=%s').startsWith('[CF-Pages-Skip]'));assert.equal(git('status','--porcelain'),'');}
console.log('CONTEXT_HOTFIX_PASS: App 1.5.2, Producción V1.7.2, 167 runtime assets, seven official SHA unchanged');
