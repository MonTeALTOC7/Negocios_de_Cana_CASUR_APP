import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const c=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../js/historical-engine.js',import.meta.url),'utf8'),c);
const e=c.CASUR_HISTORICAL_ENGINE;
const lots=[{farmCode:'1',farmName:'A',lotId:'101',suerte:'01'},{farmCode:'2',farmName:'B',lotId:'201',suerte:'01'},{farmCode:'2',farmName:'B',lotId:'202',suerte:'02'}];
const catalog=e.historicalMultiCatalog(lots);
const rows=[{...lots[0],zafra:2021,area:10,ton:100,katm:100},{...lots[0],zafra:2223,area:20,ton:400,katm:120},{...lots[1],zafra:2021,area:5,ton:200,katm:80},{...lots[2],zafra:2223,area:1000,ton:100000,katm:150}];
const selection={'1':{mode:'full'},'2':{mode:'partial',lotIds:['201']}};
const model=(mode,custom=[],s=selection)=>e.buildHistoricalDualSummary(rows,s,catalog,mode,custom);
test('dual: histórico invariante al filtro, idénticas suertes y Todas equivalente',()=>{
  const a=model('latest'),b=model('all'),d=model('custom',[2021]);
  assert.deepEqual(a.full,b.full);assert.deepEqual(a.full,d.full);
  assert.notEqual(a.period.areaMean,d.period.areaMean);assert.deepEqual(b.full,b.period);assert.equal(b.equivalent,true);
  assert.equal(a.full.areaAccumulated,35);assert.equal(a.full.areaMean,17.5);
  assert.equal(a.selection[1].lotIds.join(','),'201');
  assert.ok(a.comparison.every(f=>f.series.every(s=>s.area<1000)));
});
test('dual: cambio de suertes recalcula ambos ámbitos sin perder parciales',()=>{
  const a=model('all'),b=model('all',[],{'1':{mode:'partial',lotIds:['101']}});
  assert.notEqual(a.full.areaAccumulated,b.full.areaAccumulated);assert.notEqual(a.period.tch,b.period.tch);
});
test('dual: zafras ausentes no son cero, custom sin registros mantiene N/D y denominador solicitado',()=>{
  const a=model('custom',[2021,2122]);assert.equal(a.period.areaMean,15);assert.equal(a.period.requestedSeasonCount,2);assert.equal(a.period.zafrasWithData.length,1);
  const b=model('custom',[2122,2324]);assert.equal(b.period.areaMean,null);assert.equal(b.period.tahAudit.tah,null);assert.equal(b.period.requestedSeasonCount,2);
});
test('dual: TAH con denominadores compatibles y datos faltantes, no producto de promedios',()=>{
  const incomplete=[...rows,{...lots[0],zafra:2021,area:30,ton:900,katm:null}];
  const m=e.buildHistoricalDualSummary(incomplete,selection,catalog,'all');
  assert.equal(m.full.tahAudit.validArea,35);assert.equal(m.full.tahAudit.sugarEquivalentTon,74);assert.equal(m.full.tahAudit.tah,74/35);
  assert.equal(m.full.tahAudit.excludedRows,1);assert.notEqual(m.full.tahAudit.tah,m.full.tch*m.full.katm/1000);
});
const hist=JSON.parse(fs.readFileSync(new URL('../data/historico.json',import.meta.url),'utf8'));
const crono=JSON.parse(fs.readFileSync(new URL('../data/cronologico.json',import.meta.url),'utf8'));
const official=e.normalizeHistoricalRows(hist.lotCompact),cat=e.historicalMultiCatalog(hist.lotCompact.map(l=>({farmCode:l[8],farmName:l[9],lotId:l[0],suerte:l[10]})));
for(const [name,ids,mode,expected] of [['A',['98301','98304','98304A'],'last5',[187.41,53.57,105.66,5.66]],['B',['98301','98302'],'last3',[188.84,48.92,108.56,5.31]]]){
  test('dual oficial '+name+': conciliación y selección independiente del tiempo',()=>{
    const sel={'256':{mode:'full'},'983':{mode:'partial',lotIds:ids}};
    const m=e.buildHistoricalDualSummary(official,sel,cat,mode,[],crono.producers);
    assert.deepEqual([m.period.areaMean,m.period.tch,m.period.katm,Number(m.period.tahAudit.tah.toFixed(2))],expected);
    assert.equal(m.currentDistance.kmWeighted,36.10);
    for(const other of ['latest','all','last3','last5'])assert.deepEqual(m.full,e.buildHistoricalDualSummary(official,sel,cat,other,[],crono.producers).full);
    if(name==='B')assert.ok(Math.abs(m.period.tahAudit.tah-5.310840138)<1e-8);
  });
}
test('presentación compartida, barras medibles con cero y ejecutivo sin tablas globales',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const pdf=html.slice(html.indexOf('function buildHistoricalExecutive('),html.indexOf('function prepareClone('));
  assert.match(pdf,/htmlNode\(report.dual\)/);assert.match(pdf,/htmlNode\(report.logistics\)/);
  assert.doesNotMatch(pdf,/Resultados globales por zafra|Resultados por finca/);
  assert.match(html,/context.measureText/);assert.match(html,/hist-bar-value/);assert.match(html,/if\(farms.length<2\)return ''/);
  assert.match(html,/canvas.width=1;canvas.height=1/);
});
