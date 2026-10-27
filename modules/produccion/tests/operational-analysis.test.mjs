import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOperationalAnalysis as analyze} from '../../../core/imports/operational-analysis.js';

const row=(lot='01',changes={})=>({code:'810',suerte:lot,codLote:'810'+lot,name:'Finca de prueba',zona:'Norte',sourcePresence:'present',
 inventoryArea:10,area:10,classification:'Molienda',operationalState:'Molienda',destino:'Molienda',forecast:{season:'26/27',tch:50},dataVersion:'v1',source:{sha256:'s'},...changes});
const line=(id='a',changes={})=>({key:'81001',source:{sha256:'s',season:'26/27'},fields:{lineId:id,area:10,lineTons:500,fraction:1},
 plan:{date:{iso:'2027-01-01',raw:'2027-01-01'},cut:'1',age:12,calculatedAge:12},...changes});
const data=(rows=[row()],lines=[line()])=>({meta:{operationalContract:1,dataVersion:'v1',estimateSeason:'26/27',sourceSha256:'s'},producers:[{code:'810',name:'Prueba',details:rows}],operational:{harvestLines:lines}});

test('B2 estima, compara y concilia un plan completo sin modificar la generación',()=>{
 const g=data(),before=JSON.stringify(g),m=analyze(g);assert.equal(m.available,true);assert.equal(m.totals.millingTons,500);
 assert.equal(m.plan.tons,500);assert.equal(m.plan.area,10);assert.equal(m.plan.deltaTons,0);assert.equal(m.plan.coverage,1);assert.equal(JSON.stringify(g),before);
});
test('B2 fracciones son dos líneas, una identidad y un solo inventario',()=>{
 const m=analyze(data([row()],[line('a',{fields:{lineId:'a',area:4,lineTons:220,fraction:.4}}),line('b',{fields:{lineId:'b',area:6,lineTons:330,fraction:.6}})]));
 assert.equal(m.plan.lines,2);assert.equal(m.plan.identities,1);assert.equal(m.plan.area,10);assert.equal(m.plan.tons,550);assert.equal(m.totals.millingTons,500);assert.equal(m.plan.deltaTons,50);assert.equal(m.lots[0].parts.length,2);assert.equal(m.plan.coverage,1);
});
test('B2 no resta un plan parcial al estimado total: usa las mismas suertes',()=>{
 const m=analyze(data([row(),row('02',{inventoryArea:20,forecast:{season:'26/27',tch:80}})],[line('a',{fields:{lineId:'a',area:10,lineTons:600,fraction:1}})]));
 assert.equal(m.totals.millingTons,2100);assert.equal(m.plan.comparableEstimatedTons,500);assert.equal(m.plan.comparablePlanTons,600);assert.equal(m.plan.deltaTons,100);assert.equal(m.plan.comparableLots,1);assert.equal(m.plan.unplannedMilling,1);assert.equal(m.plan.coverage,1/3);
});
test('B2 distingue molienda pendiente, Semilla positiva y Sin Caña sin toneladas ficticias',()=>{
 const m=analyze(data([row('01',{forecast:{season:'26/27',tch:null}}),row('02',{classification:'Semilla',forecast:{season:'26/27',tch:70}}),row('03',{classification:'Sin Caña'})]));
 assert.equal(m.totals.active,2);assert.equal(m.totals.millingArea,10);assert.equal(m.totals.seedArea,10);assert.equal(m.totals.millingTch,null);assert.equal(m.plan.plannedWithoutEstimate,1);assert.equal(m.plan.deltaTons,null);
});
test('B2 fecha propuesta y edades no marcan cosecha ejecutada; discrepancias visibles',()=>{
 const l=line('a',{plan:{date:{raw:'no-fecha',iso:null},age:10,calculatedAge:12,scheduled:false}}),m=analyze(data([row()],[l]));
 assert.match(m.lots[0].warnings.join(' '),/Edad aportada/);assert.match(m.lots[0].warnings.join(' '),/Fecha propuesta/);assert.equal(l.plan.scheduled,false);
});
test('B2 área y fracción discordantes no se normalizan para declarar cobertura',()=>{
 const m=analyze(data([row()],[line('a',{fields:{lineId:'a',area:8,lineTons:500,fraction:.8}})]));
 assert.equal(m.plan.area,8);assert.equal(m.lots[0].deltaArea,-2);assert.equal(m.lots[0].fraction,.8);assert.equal(m.plan.coverage,0);assert.equal(m.plan.warningLots,1);
});
test('B2 zafra y generación son obligatorias; nunca sustituye una solicitud sin datos',()=>{
 assert.equal(analyze(data(),{season:'27/28'}).available,false);
 const g=data();g.producers[0].details[0].dataVersion='v2';assert.equal(analyze(g).available,false);
 assert.equal(analyze({}).available,false);
});
test('B2 rechaza líneas de otra campaña/fuente y mantiene N/D en totales incompletos',()=>{
 const g=data([row()],[line('a',{source:{sha256:'s',season:'27/28'}})]),m=analyze(g);
 assert.equal(m.rejected.length,1);assert.equal(m.plan.tons,null);assert.equal(m.plan.area,null);assert.equal(m.plan.deltaTons,null);assert.equal(m.groups.farms[0].plan.deltaTons,null);
});
test('B2 ID de línea repetido no suma dos veces ni oculta la inconsistencia',()=>{
 const m=analyze(data([row()],[line(),line()]));assert.equal(m.rejected.length,2);assert.equal(m.plan.lines,0);assert.equal(m.plan.tons,null);assert.equal(m.plan.coverage,null);
});
test('B2 faltantes en área o toneladas son N/D, no ceros; un cero explícito se conserva',()=>{
 const m=analyze(data([row()],[line('a',{fields:{lineId:'a',area:null,lineTons:null,fraction:1}})]));assert.equal(m.plan.area,null);assert.equal(m.plan.tons,null);
 const zero=analyze(data([row()],[line('a',{fields:{lineId:'a',area:10,lineTons:0,fraction:1}})]));assert.equal(zero.plan.tons,0);assert.equal(zero.plan.deltaTons,-500);
});
test('B2 finca, suerte y zona intersectan; ponderados se recalculan desde las filas',()=>{
 const rows=[row(),row('02',{code:'811',codLote:'81102',zona:'Sur',inventoryArea:20,forecast:{season:'26/27',tch:80}})],g=data(rows,[]);
 const m=analyze(g);assert.equal(m.totals.millingTch,70);assert.equal(m.groups.farms.length,2);assert.equal(m.groups.zones.length,2);
 assert.equal(analyze(g,{farm:'810'}).totals.millingTch,50);assert.equal(analyze(g,{lot:'81102'}).totals.millingArea,20);
 const empty=analyze(g,{farm:'810',zone:'Sur'});assert.equal(empty.rows.length,0);assert.equal(empty.plan.area,null);
});
test('B2 generaciones duplicadas por identidad se rechazan antes de agregar',()=>{
 assert.equal(analyze(data([row(),row()])).available,false);
});

test('B2 reutiliza la base de la misma generación y conserva la edad aportada solo para la misma fecha',()=>{
 const r=row('01',{plan:{base:{iso:'2025-12-30'},date:{iso:'2026-12-31'},age:12.02}});
 const a=line('a',{fields:{lineId:'a',area:5,lineTons:250,fraction:.5},plan:{date:{iso:'2026-12-31'},age:null,calculatedAge:null}});
 const b=line('b',{fields:{lineId:'b',area:5,lineTons:250,fraction:.5},plan:{date:{iso:'2027-01-01'},age:null,calculatedAge:null}});
 const original=JSON.stringify([r,a,b]),m=analyze(data([r],[a,b]));
 assert.equal(m.lines[0].plan.age,12.02);assert.equal(m.lines[0].plan.calculatedAge,366/30.4375);
 assert.equal(m.lines[1].plan.age,null);assert.equal(m.lines[1].plan.calculatedAge,367/30.4375);
 assert.equal(m.lines[1].baseSource,'Inventario de esta generación');assert.equal(JSON.stringify([r,a,b]),original);
});
