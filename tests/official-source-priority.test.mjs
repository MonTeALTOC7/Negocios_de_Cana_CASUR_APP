import {test} from 'node:test';
import assert from 'node:assert/strict';
import {officialSourcePriority as priority} from '../modules/produccion/js/official-source-policy.js';

const current='2026.10.25-aforo.1',official='2026.10.25-aforo.1101';
function state(){
 const meta={dataVersion:current,manualChanges:false};
 const production={dataVersion:current,meta,operationalDataset:{contractVersion:1,dataVersion:current,catalog:[{codLote:'00101'}],cronologico:{meta}}};
 const maestro={version:current};
 return {official,current,personal:true,snapshot:{production,maestro,archive:structuredClone({production,maestro})}};
}
test('old shared generation automatically yields to newer official',()=>assert.equal(priority({official,current:'2026.09.06-siagri.1415'}),'official'));
test('unchanged archived local is replaceable without mutating any records',()=>{
 const s=state(),before=JSON.stringify(s);assert.equal(priority(s),'official');assert.equal(JSON.stringify(s),before);
});
test('explicit personal recovery pins the generation',()=>assert.equal(priority({...state(),preference:'personal'}),'pinned'));
test('customized saved records and explicit customization are retained',()=>{
 const s=state();s.snapshot.production.reportRows=[{Area:7}];assert.equal(priority(s),'customized');
 const c=state();c.snapshot.production.meta.customized=true;assert.equal(priority(c),'preserved');
});
test('missing or changed recovery archive and master never auto-switch',()=>{
 for(const edit of [s=>delete s.snapshot.archive,s=>s.snapshot.maestro.version='other',s=>s.snapshot.archive.maestro.rows=2]){
  const s=state();edit(s);assert.notEqual(priority(s),'official');
 }
});
test('manual changes, unknown legacy contract and missing metadata are conservative',()=>{
 for(const edit of [s=>s.snapshot.production.meta.manualChanges=true,s=>delete s.snapshot.production.meta.manualChanges,s=>s.snapshot.production.operationalDataset.contractVersion=0]){
  const s=state();edit(s);assert.notEqual(priority(s),'official');
 }
});
test('offline preserves current; reconnection permits the archived transition',()=>{
 const s=state();assert.equal(priority({...s,online:false}),'offline');assert.equal(priority(s),'official');
});
test('same, older and unparseable versions never cause an automatic reload',()=>{
 for(const v of [current,'2026.09.06-siagri.1415','unknown','2026.02.31-aforo.1'])assert.equal(priority({...state(),official:v}),'not-newer');
});
