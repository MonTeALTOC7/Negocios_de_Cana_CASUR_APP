import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const engineContext=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../js/historical-engine.js',import.meta.url),'utf8'),engineContext);
const {aggregateHistoricalTah,aggregateHistoricalRows,filterHistoricalRows}=engineContext.CASUR_HISTORICAL_ENGINE;
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const plannerContext=vm.createContext({});
vm.runInContext(html.slice(html.indexOf('function planHistoricalPdfPages('),html.indexOf('function prepareHistoricalPdfPages(')),plannerContext);
const plan=plannerContext.planHistoricalPdfPages;

test('TAH usa azúcar y área compatibles sin promediar fincas ni ponderados incompatibles',()=>{
  const rows=[{farmCode:'A',lotId:'1',zafra:2425,area:10,ton:1000,katm:100},{farmCode:'B',lotId:'2',zafra:2526,area:30,ton:1500,katm:200},{farmCode:'B',lotId:'3',zafra:2526,area:100,ton:10000,katm:null}];
  const result=aggregateHistoricalTah(rows);
  assert.equal(result.sugarEquivalentTon,400);assert.equal(result.validArea,40);assert.equal(result.tah,10);assert.equal(result.excludedRows,1);
  const old=aggregateHistoricalRows(rows);assert.notEqual(result.tah,old.tch*old.katm/1000);
  assert.equal(aggregateHistoricalTah(filterHistoricalRows(rows,{lotIds:['1']},[2425])).tah,10);
  assert.deepEqual(rows[2],{farmCode:'B',lotId:'3',zafra:2526,area:100,ton:10000,katm:null});
});
test('TAH excluye faltantes y negativos de ambos denominadores, pero conserva ceros observados',()=>{
  const r=aggregateHistoricalTah([{area:10,ton:0,katm:0},{area:0,ton:100,katm:100},{area:null,ton:100,katm:100},{area:20,ton:null,katm:100},{area:20,ton:100,katm:null},{area:20,ton:-1,katm:100},{area:20,ton:10,katm:-1}]);
  assert.equal(r.tah,0);assert.equal(r.validArea,10);assert.equal(r.excludedRows,6);
  assert.equal(aggregateHistoricalTah([]).tah,null);assert.equal(aggregateHistoricalTah([{area:10,ton:'',katm:100}]).tah,null);
});
test('TAH no redondea numerador, denominador ni cocientes intermedios',()=>{
  const rows=[{area:1.23456,ton:123.45678,katm:101.23456},{area:2.34567,ton:234.56789,katm:98.76543}];
  const r=aggregateHistoricalTah(rows);
  assert.equal(r.tah,(123.45678*101.23456/1000+234.56789*98.76543/1000)/(1.23456+2.34567));
});
test('planificador conserva tablas atómicas y equilibra páginas sin residuos de una fila',()=>{
  const units=[{height:620},{height:300},{height:210},{height:230},{height:310},{height:310}];
  const pages=plan(units,1204);
  assert.equal(pages.length,2);assert.ok(pages.every(p=>p.height>=600&&p.height<=1204));
  assert.deepEqual(Array.from(pages).flatMap(p=>Array.from({length:p.to-p.from},(_,i)=>p.from+i)),[0,1,2,3,4,5]);
});
test('anexos comienzan en página nueva; comparación no fuerza una hoja residual',()=>{
  const units=[{height:900},{height:80},{height:350},{height:350},{height:500,newPage:true},{height:400}];
  const pages=plan(units,1204);
  assert.equal(pages.at(-1).from,4);assert.ok(pages.every(p=>p.height>350));
  assert.equal(pages.at(-1).height,900);
});
test('bloques excesivos se rechazan en lugar de recortar contenido silenciosamente',()=>{
  assert.throws(()=>plan([{height:1300}],1204),/mayor/);
  assert.equal(plan([],1204).length,0);
});
test('PDF individual y PNG conservan builders previos; solo variante multifinca planifica páginas',()=>{
  assert.match(html,/if\(kind==='historico-multiple'&&variant\)return await renderHistoricalPdfPages/);
  assert.match(html,/variant\?buildHistoricalExecutive\(node,variant==='complete'\):buildHistoricalMulti\(node\)/);
  assert.match(html,/Informe Histórico de Producción de Fincas/);
  assert.match(html,/sourceRows\.filter/);
});
