import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),E=require('../../../core/imports/operational-import.js');
const record=(id,changes={})=>({code:'810',suerte:id,codLote:'810'+id,name:'Finca sintética',sourcePresence:'present',
 classification:'Molienda',operationalState:'Molienda',destino:'Molienda',inventoryArea:10,area:10,millingArea:10,
 participatesCurrentArea:true,participatesMilling:true,forecast:{season:'26/27',tch:50},tch:70,...changes});
const forecast=tch=>({season:'26/27',tch});
function view(){
 const window={CASUR_OPERATIONAL_IMPORT:E,CRONO_DATA:{meta:{operationalContract:1,estimateSeason:'26/27'}},addEventListener(){}};
 window.window=window;
 vm.runInNewContext(fs.readFileSync(new URL('../js/casur-enhancements.js',import.meta.url),'utf8'),{
  window,document:{getElementById(){return null;},addEventListener(){}},console,setTimeout,clearTimeout,requestAnimationFrame(fn){fn();},MutationObserver:class{}
 });return window;
}

test('molienda positiva usa solo su propia área y TCH; el plan no se suma',()=>{
 const r=record('01',{plan:{tons:9999}}),p=E.participation(r);assert.equal(p.estimateTch,50);assert.equal(p.estimatedTons,500);
 const t=E.totals([r]);assert.equal(t.millingTch,50);assert.equal(t.validMillingArea,10);assert.equal(t.usable,1);
});

test('molienda cero/ausente conserva área activa pero no diluye TCH ni hereda el ejecutado',()=>{
 const rows=[record('01'),record('02',{forecast:forecast(0)}),record('03',{forecast:forecast(null)})];
 const before=JSON.stringify(rows),t=E.totals(rows);
 assert.equal(t.catalog,3);assert.equal(t.active,3);assert.equal(t.milling,3);assert.equal(t.usable,1);
 assert.equal(t.zero,1);assert.equal(t.missing,1);assert.equal(t.activeArea,30);assert.equal(t.millingArea,30);
 assert.equal(t.validMillingArea,10);assert.equal(t.pendingMillingArea,20);assert.equal(t.millingTch,50);assert.equal(t.millingTons,500);
 assert.equal(JSON.stringify(rows),before);assert.match(E.participation(rows[1]).reason,/cero/);assert.match(E.participation(rows[2]).reason,/Pendiente/);
});

test('semilla con área positiva y cero permanece activa sin participar en molienda',()=>{
 const p=E.participation(record('01',{classification:'Semilla',destino:'Semilla AS',forecast:forecast(0)}));
 assert.equal(p.active,true);assert.equal(p.milling,false);assert.equal(p.usable,false);assert.equal(p.conflict,false);assert.equal(p.activeArea,10);assert.match(p.reason,/Semilla/);
});

for(const [label,change,reason] of [
 ['Sin Caña cero',{classification:'Sin Caña',inventoryArea:0,forecast:forecast(0)},/Sin Caña/],
 ['Sin Caña con área',{classification:'Sin Caña',inventoryArea:10},/Sin Caña/],
 ['Baja definitiva',{operationalState:'Baja definitiva'},/Baja definitiva/],
 ['ausente',{sourcePresence:'absent'},/Solo referencia/]
])test(`${label} permanece consultable sin contribuir a producción aunque conserve valores previos`,()=>{
 const r=record('01',change),p=E.participation(r),t=E.totals([r]);
 assert.equal(p.active,false);assert.equal(p.milling,false);assert.equal(p.usable,false);assert.equal(p.activeArea,0);assert.equal(t.millingTch,null);assert.equal(t.catalog,1);assert.match(p.reason,reason);
});

test('conflictos no reclasifican: cero queda pendiente; positivo conserva la clasificación y advierte',()=>{
 const zero=record('01',{destino:'Semilla',forecast:forecast(0)}),positive=record('02',{destino:'Semilla'});
 const a=E.participation(zero),b=E.participation(positive);
 assert.equal(a.conflict,true);assert.equal(a.active,true);assert.equal(a.usable,false);
 assert.equal(b.conflict,true);assert.equal(b.usable,true);assert.equal(b.estimatedTons,500);assert.match(b.reason,/por validar/);
 assert.equal(zero.classification,'Molienda');assert.equal(zero.destino,'Semilla');
 const totals=E.totals([zero,positive]);assert.equal(totals.conflicts,2);assert.equal(totals.pendingMillingLots,1);
});

test('finca sin molienda conserva catálogo, área semilla y N/D de estimado; combinación no filtra identidades',()=>{
 const w=view(),seed=record('01',{classification:'Semilla',forecast:forecast(0)}),inactive=record('02',{classification:'Sin Caña'});
 const d=w.CASUR_BUILD_CRONO_DATA([seed,inactive]);
 assert.equal(d.producers.length,1);assert.equal(d.options.length,1);assert.equal(d.producers[0].details.length,2);
 assert.equal(d.global.activeLots,1);assert.equal(d.global.suertes,2);assert.equal(d.global.estimateTch,null);assert.equal(d.global.estimateTons,null);assert.equal(d.global.coberturaEstimadoAreaPct,null);
 const mixed=w.CASUR_BUILD_CRONO_DATA([seed,inactive,record('03')]);assert.equal(mixed.global.estimateTch,50);assert.equal(mixed.global.estimateArea,10);assert.equal(mixed.global.area,20);assert.equal(mixed.global.tch,70);
});

test('finca, productor y zonas concilian por suma; el denominador no usa semilla ni pendientes',()=>{
 const w=view(),rows=[record('01',{zona:'Norte'}),record('02',{forecast:forecast(0),zona:'Norte'}),record('03',{code:'811',name:'Otra',zona:'Sur',inventoryArea:20,forecast:forecast(80)})];
 const d=w.CASUR_BUILD_CRONO_DATA(rows);
 assert.equal(d.global.estimateTons,2100);assert.equal(d.global.estimateArea,30);assert.equal(d.global.estimateTch,70);assert.equal(d.global.millingArea,40);assert.equal(d.global.pendingMillingArea,10);
 assert.equal(d.producers.reduce((n,p)=>n+p.estimateTons,0),d.global.estimateTons);
 assert.equal(d.groups.zona.reduce((n,p)=>n+p.estimateArea,0),d.global.estimateArea);
 assert.equal(d.groups.zona.find(p=>p.key==='Norte').estimateTch,50);
});

test('generación B1 anterior se deriva al abrir offline sin reescribir su snapshot ni metadatos',()=>{
 const w=view(),saved={meta:{operationalContract:1,dataVersion:'previa',publishedAt:'2026-01-01'},
  producers:[{code:'810',name:'Finca',details:[record('01'),record('02',{forecast:forecast(0),millingEstimatedTons:0})]}],global:{estimateTch:25},operational:{totals:{validMillingArea:20}}};
 const before=JSON.stringify(saved),d=w.CASUR_REFRESH_OPERATIONAL_VIEW(saved);
 assert.equal(JSON.stringify(saved),before);assert.equal(d.global.estimateTch,50);assert.equal(d.operational.totals.validMillingArea,10);assert.equal(d.meta.publishedAt,'2026-01-01');assert.equal(d.meta.dataVersion,'previa');
});

test('los formateadores cronológicos conservan N/D y distinguen un cero observado',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 for(const marker of ['let currentCronoProducer = null;','let currentCronoZone = null;']){
  const section=html.slice(html.indexOf(marker)),source=section.match(/function num\(v\)\{[^\r\n]+/)[0];
  const num=vm.runInNewContext('('+source+')');assert.equal(num(null),null);assert.equal(num(''),null);assert.equal(num(undefined),null);assert.equal(num(0),0);assert.equal(num(50),50);
 }
});

test('decisiones CASUR de 2003/1927 preservan el origen y se limitan a fuente, zafra y generación',()=>{
 const decisions=JSON.parse(JSON.stringify(view().CASUR_OPERATIONAL_DECISIONS));
 const source={sha256:decisions[0].sourceHashes[0]};
 const raw2003=record('03',{code:'20',codLote:'2003',inventoryArea:10.95,destino:'Semilla',source,dataVersion:'g1',forecast:forecast(0)});
 const raw1927=record('27',{code:'19',codLote:'1927',inventoryArea:6.15,destino:'Semilla',source,dataVersion:'g1',forecast:forecast(70)});
 const a=E.applyDecisions(raw2003,decisions),b=E.applyDecisions(raw1927,decisions),p=E.participation(a);
 assert.equal(p.active,true);assert.equal(p.milling,false);assert.equal(p.operationalDestination,'Semilla');assert.equal(p.status,'seed');
 assert.equal(a.classification,'Molienda');assert.equal(a.destino,'Semilla');assert.equal(a.forecast.tch,0);assert.equal(raw2003.operationalDecision,undefined);
 assert.equal(E.participation(b).estimatedTons,430.5);assert.equal(E.participation(b).milling,true);
 const totals=E.totals([a,b]);assert.equal(totals.seed,1);assert.equal(totals.milling,1);assert.equal(totals.pendingMillingArea,0);assert.equal(totals.pendingConflicts,0);
 for(const altered of [{...raw2003,source:{sha256:'otra'}},{...raw2003,forecast:{season:'27/28',tch:0}},{...raw2003,inventoryArea:11}])assert.equal(E.applyDecisions(altered,decisions).operationalDecision,undefined);
 assert.equal(E.participation({...a,dataVersion:'otra-generacion'}).decision,null);
});

test('semilla positiva no se vuelve Molienda por el valor de TCH',()=>{
 const p=E.participation(record('01',{classification:'Semilla',destino:'Semilla',forecast:forecast(70)}));assert.equal(p.active,true);assert.equal(p.milling,false);assert.equal(p.estimatedTons,null);
});
