import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {APP_VERSION, MODULE_VERSIONS, PRODUCTION_RELEASES} from '../core/versions/versions.js';
import {productionIntegrity} from './production-integrity.mjs';

// Local preparation is permitted. This command never pushes or deploys.
const c3='2912f643bec9eb2a8123a86e6f76b1ea4f054139';
const sourceSha='d3324112d6327d6401fb933c3ec6fe4e9ce15e8353eee4bdd622d1800e11fb77';
const generation='2026.10.25-aforo.1101', directory='modules/produccion/data/';
const sha=b=>createHash('sha256').update(b).digest('hex');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:64*1024*1024}).trim();
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const body=o=>Object.fromEntries(Object.entries(o).filter(([k])=>k!=='meta'));
const names=['version.json','version.js','cronologico.json','cronologico.js','historico.json','historico.js','integrity.json'];
const allowed=new Set([...names.map(n=>directory+n),
 'tools/check-c4-release.mjs','tools/release-c4-manifest.json','tools/qa-c2-updates.cjs',
 'modules/produccion/tests/validate-static.mjs','modules/produccion/tests/geo-integration.test.mjs',
 'modules/produccion/tests/historical-engine.test.mjs','.github/workflows/casur-release-gate.yml',
 'docs/LIBERACION_C4.md','tests/production-release.test.mjs','tests/app-version.test.mjs','tests/preview-release.test.mjs',
 'modules/produccion/index.html','modules/produccion/package.json','modules/produccion/VERSION.txt','modules/produccion/README_GITHUB.md',
 'core/versions/versions.js','core/versions/runtime-assets.json','core/module-registry/registry.js','index.html','sw.js']);

git('merge-base','--is-ancestor',c3,'HEAD');
for(const ref of ['3e510035cc4017b175758c9b967f447935351228','bb04f8f104bdbb421182975d0623c6c6379850ea','6d6c790fec35d53f75da6cca9ff483cd535575cb'])git('merge-base','--is-ancestor',ref,'HEAD');
const tracked=git('ls-files').split('\n');
const untracked=git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean);
const changed=[...new Set([...git('diff','--name-only',c3).split('\n').filter(Boolean),...untracked])];
assert.deepEqual(changed.filter(p=>!allowed.has(p)),[],'Only reviewed release files may differ from C3');
const forbidden=p=>/\.(?:xlsx?|xlsm|zip|enc|pem|key|bak)$/i.test(p)||/(^|\/)(?:profiles?|snapshots?|recovery-private|package-private|node_modules)(\/|$)/i.test(p)||/(^|\/)(?:\.env(?:\..*)?|credentials(?:\..*)?|id_rsa)$/.test(p);
// These six already-public fixtures are inherited from C3; no new Excel is allowed.
const inheritedFixtures=new Set(['docs/regression/siagri_fixture.xlsx',
 'modules/labores/datos/CobrosAgosto_Y2026.xlsx','modules/labores/datos/Cronologico_Maestro_2026.xlsx',
 'modules/labores/datos/Ejemplo_Control.xlsx','modules/labores/datos/Nomina_2026.xlsx','modules/labores/datos/Prefactura_2026.xlsx']);
assert.deepEqual([...tracked,...untracked].filter(p=>forbidden(p)&&!inheritedFixtures.has(p)),[],'No new private packages, profiles or credentials in release');
for(const p of inheritedFixtures){
 const original=execFileSync('git',['show',c3+':'+p],{maxBuffer:64*1024*1024});
 assert.equal(sha(fs.readFileSync(p)),sha(original),p+' inherited fixture must be unchanged');
}
assert.ok(fs.existsSync('tools/release-c4-manifest.json'),'C4 BLOCKED: verify the original C3 ZIP before creating the final seven-file manifest');
const manifest=read('tools/release-c4-manifest.json'); // Missing manifest fails closed.
assert.equal(manifest.schemaVersion,1);
assert.equal(manifest.baseC3,c3);
assert.equal(manifest.sourceArchiveSha256,sourceSha);
assert.equal(manifest.dataVersion,generation);
assert.equal(manifest.publishedAt,null,'No approved publication timestamp exists in C4');
assert.deepEqual(Object.keys(manifest.files).sort(),[...names].sort());
for(const n of names)assert.equal(sha(fs.readFileSync(directory+n)),manifest.files[n],n+' exact bytes');
const version=read(directory+'version.json'),crono=read(directory+'cronologico.json'),history=read(directory+'historico.json');
assert.equal(version.version,generation);
assert.equal(crono.meta.estimateSeason,'26/27');
assert.equal(crono.global.estimateSeason,'26/27');
for(const value of [version,crono.meta,history.meta])assert.equal(value.publishedAt,null);
for(const value of [crono,history])assert.equal(value.meta.dataVersion,generation);
const globals={version:'CASUR_RELEASE',cronologico:'CASUR_REMOTE_CRONO',historico:'CASUR_REMOTE_HISTORICO'};
for(const [kind,key] of Object.entries(globals)){
 const context={window:{}};vm.runInNewContext(fs.readFileSync(directory+kind+'.js','utf8'),context,{timeout:10000});
 assert.deepEqual(JSON.parse(JSON.stringify(context.window[key])),read(directory+kind+'.json'),kind+' JSON/JS equivalence');
}
assert.deepEqual(read(directory+'integrity.json'),productionIntegrity(directory));
const original=JSON.parse(git('show',c3+':'+directory+'historico.json'));
assert.deepEqual(body(history),body(original),'Historical body must remain exactly C3');
assert.equal(history.meta.rows,11598);
const bySeason={};for(const lot of history.lotCompact)for(const row of lot[11])bySeason[row[0]]=(bySeason[row[0]]||0)+row[6];
assert.equal(Object.values(bySeason).reduce((a,b)=>a+b,0),11598);
assert.deepEqual(Object.keys(bySeason),['1617','1718','1819','1920','2021','2122','2223','2324','2425','2526']);
assert.equal(history.meta.sourceDataVersion,'2026.09.06-siagri.1415');
const E=createRequire(import.meta.url)('../core/imports/operational-import.js');
const rows=crono.producers.flatMap(p=>p.details),totals=E.totals(rows);
for(const [key,value] of Object.entries({catalog:1053,inventoried:1046,active:995,milling:948,seed:47,activeArea:9574.66,validMillingArea:9115.65,millingTons:563187.9696909501,millingTch:61.782535495653086,pendingConflicts:10}))assert.ok(Math.abs(totals[key]-value)<1e-6,key);
assert.equal(totals.millingCoverage,1);
assert.equal(totals.decisions,2);
assert.ok(rows.every(r=>!r.dataVersion||r.dataVersion===generation));
const lot=id=>rows.find(r=>r.codLote===id);
assert.equal(E.participation(lot('2003')).active,true);
assert.equal(E.participation(lot('2003')).operationalDestination,'Semilla');
assert.equal(E.participation(lot('1927')).estimatedTons,430.5);
assert.ok(Math.abs(rows.filter(r=>r.code==='494').reduce((s,r)=>s+(E.participation(r).estimatedTons||0),0)-681.8)<1e-6);
assert.equal(lot('99336').area,8.91);assert.equal(lot('99336').tchEst2627,65);assert.equal(lot('99336').tonEst2627,579.15);
assert.equal(lot('99336').source.sourceDate,'2026-10-12');assert.equal(lot('99336').plan.date.iso,'2026-12-24');
assert.equal(APP_VERSION,'1.5.1');assert.equal(MODULE_VERSIONS.produccion,'V1.7.1');assert.equal(MODULE_VERSIONS.tch,'2.8.1');
assert.equal(PRODUCTION_RELEASES[0].historicalVersion,'V2.9');
for(const p of ['manifest.webmanifest']){
 assert.equal(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n').trim(),git('show',c3+':'+p).replace(/\r\n/g,'\n'),p+' must preserve approved runtime and PWA origin/scope');
}
const runtime=read('core/versions/runtime-assets.json');assert.equal(runtime.appVersion,APP_VERSION);
assert.equal(Object.keys(runtime.assets).length,166);
const oldRuntime=JSON.parse(git('show',c3+':core/versions/runtime-assets.json'));
const approvedRuntimeChanges=new Set(['modules/produccion/index.html','core/versions/versions.js','core/module-registry/registry.js','index.html']);
assert.deepEqual(Object.keys(runtime.assets),Object.keys(oldRuntime.assets));
for(const [p,h]of Object.entries(oldRuntime.assets))if(!approvedRuntimeChanges.has(p))assert.equal(runtime.assets[p],h,p+' runtime unchanged');
const sw=fs.readFileSync('sw.js','utf8');
assert.equal(sw.replace("const APP_VERSION = '1.5.1'","const APP_VERSION = '1.5.0'").replace(/\r\n/g,'\n').trim(),git('show',c3+':sw.js').replace(/\r\n/g,'\n'),'SW changes only its approved App version');
assert.ok(sw.includes("const APP_VERSION = '1.5.1'"));
for(const contract of ['manifest.dataVersion','declaredVersion(files[k]) !== manifest.dataVersion','integrityRequired:true','compareCasurDataVersions'])assert.ok(sw.includes(contract),'SW generation contract: '+contract);
// Reuse the existing gates instead of replacing their regressions.
for(const script of ['tools/sync-versions.mjs','tools/runtime-assets.mjs','tools/production-integrity.mjs'])execFileSync(process.execPath,[script],{stdio:'inherit'});
if(process.argv.includes('--for-push')){
 assert.ok(git('log','-1','--format=%s').startsWith('[CF-Pages-Skip]'),'Explicit Cloudflare skip required');
 assert.equal(git('status','--porcelain'),'','Only a clean reviewed commit may be pushed after authorization');
}
console.log(JSON.stringify({status:'C4_RELEASE_PASS',generation,publishedAt:null,files:manifest.files,totals,historicalRows:11598,historicalSeasons:bySeason,historyBodySha256:sha(JSON.stringify(body(history))),runtimeAssets:166}));
