import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {validateForProduction,recordToReportRow} from '../../../master/adapters/production-data-adapter.js';
const require=createRequire(import.meta.url),E=require('../../../core/imports/operational-import.js');
const headers=['Cod. Hacienda','Ste','Nombre Hacienda','Area Ha','Clasificacion','actTCH_2627','Toneladas','Tch.Ant','Nombre Destino del Cultivo','Fecha propuesta (Plan 601K)','Fecha-maestro','Edad corte (meses)','Tipo de Corte (Plan 601K)'];
const row=(changes={})=>Object.assign({ 'Cod. Hacienda':'810',Ste:'01A','Nombre Hacienda':'Finca sintética', 'Area Ha':10,Clasificacion:'Molienda',actTCH_2627:50,Toneladas:500,'Tch.Ant':70,'Nombre Destino del Cultivo':'Molienda'},changes);
function read(objects=[row()],{name='Cualquier nombre',fields=headers,extraSheets=[]}={}){
 const sheets=[{name,rows:[['Archivo de prueba'],[...fields],...objects.map(r=>fields.map(f=>r[f]??null))]},...extraSheets];
 const inspected=E.inspectSheets(sheets),candidate=inspected.candidates.find(c=>c.inventory);
 return {sheets,inspected,candidate,parsed:candidate?E.parseCandidate(sheets,candidate,{file:'synthetic.xlsx',season:'26/27',sha256:'synthetic'}):null};
}
const prepare=(parsed,previous=[])=>E.prepareUpdate(previous,parsed,{dataVersion:'2026.10.24-aforo.1'});

test('fecha prevista explícita conserva tipo, zafra y procedencia sin reutilizar calendario Plan 601K',()=>{
 const a=read([row({'Fecha prevista de cosecha':'2027-01-10','Fecha propuesta (Plan 601K)':'2027-02-01'})],{fields:[...headers,'Fecha prevista de cosecha']});
 const r=prepare(a.parsed).catalog[0];assert.equal(r.harvestDate.date,'2027-01-10');assert.equal(r.harvestDate.type,'harvest');
 assert.equal(r.harvestDate.season,'26/27');assert.equal(r.harvestDate.provenance.header,'Fecha prevista de cosecha');
 assert.equal(r.plan.date.iso,'2027-02-01');assert.equal(prepare(read([row({'Fecha propuesta (Plan 601K)':'2027-02-01'})]).parsed).catalog[0].harvestDate,null);
});
test('nombres de hoja y orden de columnas no determinan el esquema; una hoja puede contener tres perfiles',()=>{
 const a=read(),b=read(undefined,{name:'Zafra futura distinta',fields:[...headers].reverse()});
 assert.deepEqual(a.candidate.profiles,['cronologico','estimados','plan']);assert.equal(b.parsed.records[0].key,'81001A');assert.equal(prepare(a.parsed).totals.millingTons,prepare(b.parsed).totals.millingTons);
});
test('encabezados equivalentes y actTCH de próxima zafra se reconocen por estructura',()=>{
 const h=['Código finca','Suerte','Nombre finca','ÁREA','Clasificación zafra','actTCH_2728'];
 const sheets=[{name:'sin dependencia de nombre',rows:[h,['810','02B','Prueba',5,'Molienda',40]]}];
 const c=E.inspectSheets(sheets).candidates.find(c=>c.inventory);assert.ok(c);assert.equal(E.parseCandidate(sheets,c).records[0].fields.estimateTch,40);
});
test('dos inventarios candidatos requieren elección y una tabla histórica no se aplica como inventario',()=>{
 const a=read(),b={...a.sheets[0],name:'Segundo'};assert.equal(E.inspectSheets([...a.sheets,b]).requiresChoice,true);
 const s=[{name:'Histórico',rows:[['Cod','Suerte','Zafra','Area','Ton'],['810','01',2526,10,800]]}],c=E.inspectSheets(s).candidates[0];
 assert.equal(c.inventory,false);assert.throws(()=>prepare(E.parseCandidate(s,c)),/plan\/histórico/);
});
test('ambigüedad de columnas se bloquea hasta mapeo explícito',()=>{
 const r=read(),s=r.sheets[0];s.rows[1].push('Area Ha');s.rows[2].push(20);
 const c=E.inspectSheets(r.sheets).candidates.find(c=>c.profiles.includes('cronologico'));
 const p=E.parseCandidate(r.sheets,c);assert.ok(p.issues.some(i=>i.code==='mapping'));
 const mapped=E.parseCandidate(r.sheets,c,{}, {area:3});assert.equal(mapped.records[0].fields.area,10);
});
test('HHHSSS auxiliar no sustituye la combinación oficial de hacienda y suerte',()=>{
 const r=read(),s=r.sheets[0];s.rows[1].push('HHHSSS','HHHSSS');s.rows[2].push('81001A','99999');
 const c=E.inspectSheets(r.sheets).candidates.find(c=>c.inventory);assert.equal(c.mapping.combined,headers.length);
});
test('identidades alfanuméricas, duplicados y colisiones entre componentes',()=>{
 assert.equal(read().parsed.records[0].key,'81001A');
 assert.throws(()=>prepare(read([row(),row()]).parsed),/errores críticos/);
 const p=read().parsed;assert.throws(()=>prepare(p,[{code:'81',suerte:'001A',codLote:'81001A',area:10}]),/Colisión/);
});
test('una columna numérica o fuente no es aceptada solo por parecido del nombre',()=>{
 const s=[{name:'falso',rows:[['Cod','Suerte','Area probable','actTCH_2627','Clasificacion'],['810','01',10,50,'Molienda']]}];assert.equal(E.inspectSheets(s).candidates.length,0);
 const p=read([row({'Area Ha':'no numérico'})]).parsed;assert.equal(p,null);
});
test('cero y estimado ausente se conservan separados; no son denominador utilizable ni inactividad',()=>{
 const zero=prepare(read([row({actTCH_2627:0,Toneladas:0})]).parsed);assert.equal(zero.catalog[0].forecast.tch,0);assert.equal(zero.totals.millingTch,null);assert.equal(zero.totals.validMillingArea,0);assert.equal(zero.totals.zero,1);assert.equal(zero.totals.activeArea,10);
 const p=prepare(read([row({actTCH_2627:null,Toneladas:null})]).parsed);assert.equal(p.catalog[0].forecast.tch,null);assert.equal(p.totals.missing,1);assert.equal(p.totals.pendingMillingArea,10);assert.equal(p.catalog[0].millingEstimatedTons,null);
 assert.equal(E.number(''),null);assert.equal(E.number(0),0);
});
test('fuentes excluidas y clasificación desconocida bloquean',()=>{
 assert.throws(()=>prepare(read([row({'Cod. Hacienda':'16'})]).parsed),/errores críticos/);
 assert.throws(()=>prepare(read([row({Clasificacion:'inventada'})]).parsed),/errores críticos/);
});
test('Sin Caña 49404A conserva identidad, área cero y ejecutado; no inventa GPS ni historia',()=>{
 const p=read([row({'Cod. Hacienda':'494',Ste:'04A','Area Ha':0,Clasificacion:'Sin Caña',actTCH_2627:0,Toneladas:0})]).parsed;
 const g=prepare(p,[{code:'494',suerte:'04A',area:5.67,tch:51.52}]);
 assert.equal(g.catalog[0].codLote,'49404A');assert.equal(g.catalog[0].area,0);assert.equal(g.catalog[0].inventoryArea,0);assert.equal(g.totals.millingArea,0);assert.equal(g.catalog[0].tch,70);
});
test('2003 conserva Semilla operativa y Molienda de zafra sin eliminar TCH estimado cero',()=>{
 const g=prepare(read([row({'Cod. Hacienda':'20',Ste:'03','Nombre Destino del Cultivo':'Semilla',actTCH_2627:0,Toneladas:0})]).parsed);
 assert.equal(g.catalog[0].codLote,'2003');assert.equal(g.catalog[0].destino,'Semilla');assert.equal(g.catalog[0].classification,'Molienda');assert.equal(g.catalog[0].tchEst2627,0);assert.ok(g.issues.some(i=>i.code==='destination-conflict'));
 assert.equal(g.catalog[0].millingEstimatedTons,null);assert.equal(g.totals.validMillingArea,0);assert.equal(g.totals.pendingMillingArea,10);assert.equal(E.participation(g.catalog[0]).conflict,true);
});
test('inventario, área activa y molienda son universos independientes',()=>{
 const g=prepare(read([row(),row({Ste:'02',Clasificacion:'Semilla',actTCH_2627:0,Toneladas:0}),row({Ste:'03',Clasificacion:'Investigacion',actTCH_2627:60,Toneladas:600}),row({Ste:'04',Clasificacion:'Baja rentabilidad',actTCH_2627:0,Toneladas:0})]).parsed);
 assert.deepEqual([g.totals.inventoryArea,g.totals.activeArea,g.totals.millingArea,g.totals.millingTons],[40,20,10,500]);
 assert.equal(g.catalog[2].sourceTonnage,600);assert.equal(g.catalog[2].tonEst2627,null);
});
test('ausentes permanecen localizables, no se declaran baja definitiva y pueden reincorporarse',()=>{
 const prev=[{code:'810',suerte:'09',codLote:'81009',area:12,tch:80,historyReference:'retained'}];
 const first=prepare(read().parsed,prev),missing=first.catalog.find(r=>r.codLote==='81009');
 assert.equal(missing.area,0);assert.equal(missing.operationalState,'Ausente de la fuente');assert.equal(missing.historyReference,'retained');
 const second=prepare(read([row({Ste:'09'})]).parsed,first.catalog);assert.equal(second.catalog.find(r=>r.codLote==='81009').area,10);assert.ok(second.differences.some(d=>d.kind==='reactivated'));
});
test('baja definitiva documentada no se convierte automáticamente en activa',()=>{
 const g=prepare(read().parsed,[{code:'810',suerte:'01A',area:10,operationalState:'Baja definitiva'}]);assert.equal(g.catalog[0].area,0);assert.equal(g.catalog[0].operationalState,'Baja definitiva');
});
test('campos ausentes heredados mantienen procedencia, áreas nuevas no heredan valores anteriores',()=>{
 const g=prepare(read([row({'Area Ha':6})]).parsed,[{code:'810',suerte:'01A',area:10,distancia:7.44}]);
 assert.equal(g.catalog[0].area,6);assert.equal(g.catalog[0].distancia,7.44);assert.match(g.catalog[0].inherited.distancia.reason,/no aportado/);assert.equal(g.catalog[0].provenance.area.raw,6);
});
test('fechas de plan preservan tipo/origen; fecha sola no programa cosecha y discrepancias se informan',()=>{
 const p=read([row({'Fecha propuesta (Plan 601K)':46488,'Fecha-maestro':46123,'Edad corte (meses)':20})]).parsed;
 assert.equal(p.records[0].plan.date.raw,46488);assert.equal(p.records[0].plan.date.type,'number');assert.equal(p.records[0].plan.scheduled,false);assert.ok(p.issues.some(i=>i.code==='age'));
 assert.equal(E.dateValue('2026-02-30').iso,null);assert.equal(E.dateValue('15/10/2026').iso,'2026-10-15');
});
test('plan fraccionado conserva líneas y no puede sustituir el inventario',()=>{
 const s=[{name:'otro plan',rows:[['Cod','Suerte','Area','Fecha propuesta','ID Línea','Ton propuesta'],['810','01',5,46488,'a',200],['810','01',5,46489,'b',300]]}];
 const c=E.inspectSheets(s).candidates[0],p=E.parseCandidate(s,c);assert.equal(p.records.length,2);assert.equal(p.issues.filter(i=>i.level==='error').length,0);assert.throws(()=>prepare(p),/plan\/histórico/);
 s[0].rows[2][4]='a';assert.ok(E.parseCandidate(s,c).issues.some(i=>i.code==='line-id'));
});
test('fórmula de encabezado que omite última fila produce advertencia; no es numerador',()=>{
 const r=read([row(),row({Ste:'02'})]);r.sheets[0].formulas={'1:7':'SUM(G3:G3)'};
 const p=E.parseCandidate(r.sheets,r.candidate);assert.ok(p.issues.some(i=>i.code==='source-total-range'));assert.equal(prepare(p).totals.millingTons,1000);
});
test('un vacío explícito de fecha no hereda la siembra de un ciclo anterior',()=>{
 const source=row({'F. Siembra':null,'F. Ult. Cte':null,NC:'R'});
 const p=read([source],{fields:[...headers,'F. Siembra','F. Ult. Cte','NC']}).parsed;
 const g=prepare(p,[{code:'810',suerte:'01A',area:10,fSiembra:'2020-01-01',fUltCte:'2025-01-01'}]);
 assert.equal(g.catalog[0].fSiembra,null);assert.equal(g.catalog[0].fUltCte,null);assert.equal(g.catalog[0].fBase,null);assert.equal(g.catalog[0].renovacion,true);
});
test('una generación manipulada o con totales inconsistentes no se puede persistir',()=>{
 const g=prepare(read().parsed);g.cronologico={meta:{dataVersion:g.dataVersion},producers:[{details:g.catalog}]};
 assert.equal(E.validateGeneration(g),true);g.totals.millingTons++;
 assert.throws(()=>E.validateGeneration(g),/Totales no conciliados/);
});
test('el desglose operativo se concilia por identidad sin sumarse de nuevo al inventario',()=>{
 const g=prepare(read().parsed),line=(area,fraction,tons)=>({key:'81001A',fields:{area,fraction,lineTons:tons}});
 E.attachHarvestPlan(g,[line(4,0.4,220),line(6,0.6,330)]);
 assert.equal(g.totals.inventoryArea,10);assert.equal(g.totals.millingTons,500);assert.equal(g.planAudit.proposedTons,550);assert.equal(g.planAudit.split.length,1);
 assert.equal(g.issues.filter(i=>i.code==='plan-coverage').length,0);
 assert.throws(()=>E.attachHarvestPlan(g,[{key:'desconocida',fields:{area:10}}]),/sin identidad/);
});
test('el estimado de otra zafra no se etiqueta como 26/27 ni cambia su denominador',()=>{
 const p=read().parsed;p.source.season='27/28';const g=prepare(p);
 assert.equal(g.catalog[0].forecast.season,'27/28');assert.equal(g.catalog[0].tchEst2627,null);assert.equal(g.catalog[0].tonEst2627,null);assert.equal(g.totals.millingTons,500);
 const r=read();const incompatible=E.parseCandidate(r.sheets,r.candidate,{season:'27/28'});assert.ok(incompatible.issues.some(i=>i.code==='season'));
});
test('el adaptador SIAGRI comparte identidad y rechaza duplicados que solo difieren en mayúsculas',()=>{
 const r={cod:'494',suerte:'04a',hacSue:'49404a',hacienda:'Sintética',area:1,zona:'5-Productores'};
 assert.equal(recordToReportRow(r)['Hac-Sue'],'49404A');assert.equal(validateForProduction([r,{...r,suerte:'04A',hacSue:'49404A'}]).pass,false);
});
