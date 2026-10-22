import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
await import('../js/historical-engine.js');
await import('../js/historical-panorama-model.js');
const E = globalThis.CASUR_HISTORICAL_ENGINE;
const { buildPanoramaModel: model, buildPanoramaChartLayout: layout } = globalThis.CASUR_HISTORICAL_PANORAMA_MODEL;
const lots = [{ farmCode:'100',lotId:'10001' },{ farmCode:'100',lotId:'10002' },{ farmCode:'200',lotId:'20001' }];
const rows = [
  {...lots[0],zafra:2021,area:10,ton:100,katm:80,edad:10},
  {...lots[1],zafra:2021,area:30,ton:600,katm:120,edad:null},
  {...lots[2],zafra:2021,area:10,ton:500,katm:null,edad:12},
  {...lots[0],zafra:2022,area:10,ton:200,katm:100,edad:11},
];
const catalog = E.historicalMultiCatalog(lots);
const selection = {'100':{mode:'full'},'200':{mode:'partial',lotIds:['20001']}};
const analysis=(mode='all',custom=[],data=rows,scope=selection)=>E.buildHistoricalMultiAnalysis(data,scope,catalog,mode,custom);
test('Panorama proyecta ponderados de áreas desiguales y bases válidas sin promediar fincas',()=>{
  const a=analysis('custom',[2021]),v=model(a,{mode:'custom'});
  assert.equal(v.kpis.tch,24); // 1200 / 50, no promedio simple de las tres filas.
  assert.equal(v.kpis.katm,114.29); // 80000 / 700 toneladas con dato.
  assert.equal(v.kpis.edad,11);
  assert.equal(v.kpis.area,50);
  assert.equal(v.kpis.ton,1200);
  assert.deepEqual(v.coverage.map(c=>[c.key,c.valid,c.total,c.pct]),[['tch',50,50,100],['katm',700,1200,58.33],['edad',20,50,40]]);
  assert.equal(v.reference,a.consolidated.tch);
});
test('tres estados de período: válido, solicitado sin registros y ninguna zafra marcada',()=>{
  assert.equal(model(analysis('latest')).status,'ready');
  const a=analysis('custom',[2022],rows,{'200':{mode:'full'}}),v=model(a,{mode:'custom'});
  assert.equal(v.status,'no-records');assert.equal(v.seasonCount,1);assert.equal(v.observedSeasonCount,0);
  assert.deepEqual([v.kpis.area,v.kpis.tch,v.kpis.katm,v.kpis.edad,v.kpis.ton,v.kpis.historicalCoverage],[null,null,null,null,null,null]);
  assert.equal(v.series[0].value,null);
  const empty=model(analysis('custom',[]),{mode:'custom'});
  assert.equal(empty.status,'empty-period');assert.equal(empty.seasonCount,0);assert.deepEqual(empty.series,[]);
});
test('toneladas faltantes son parciales; ausencia no fabrica cero y cero observado sí se conserva',()=>{
  const data=[{...rows[0],ton:null},{...rows[1],ton:0}];
  const v=model(analysis('all',[],data));
  assert.equal(v.kpis.tonPartial,true);assert.equal(v.kpis.ton,null);
  const zero=model(analysis('all',[],[{...rows[0],ton:0}]));
  assert.equal(zero.kpis.ton,0);assert.equal(zero.kpis.tch,0);
  const partial=model(analysis('all',[],[{...rows[0],ton:100},{...rows[1],ton:null}]));
  assert.equal(partial.kpis.ton,100);assert.equal(partial.kpis.tonPartial,true);
  assert.equal(partial.coverage.find(c=>c.key==='katm').pct,null);
});
test('selección parcial y medias de área conservan el contrato de las zafras',()=>{
  const v=model(analysis('all',[],rows,{'100':{mode:'partial',lotIds:['10001']}}));
  assert.equal(v.kpis.areaAccumulated,20);assert.equal(v.kpis.area,10);assert.equal(v.kpis.ton,300);
  assert.equal(v.summary.selectedLotCount,1);assert.equal(v.kpis.historicalCoverage,100);
  const full=model(analysis());assert.equal(full.kpis.areaAccumulated,60);assert.equal(full.kpis.area,30);
});
test('la advertencia detecta cambio de identidades incluso cuando el número de suertes es igual',()=>{
  const data=[rows[0],{...rows[1],zafra:2022}];
  const v=model(analysis('all',[],data));assert.equal(v.compositionChanged,true);
  assert.deepEqual(v.series.map(p=>p.row.contributingLotCount),[1,1]);
  assert.equal(model(analysis('all',[],[rows[0],rows[3]])).compositionChanged,false);
});
test('referencias: ponderado para TCH/KATM y ninguna línea engañosa para magnitudes aditivas',()=>{
  const a=analysis();
  for(const metric of ['tch','katm'])assert.equal(model(a,{metric}).reference,a.consolidated[metric]);
  for(const metric of ['ton','area']){const v=model(a,{metric});assert.equal(v.reference,null);assert.equal(layout(v,320).referenceY,null);}
});
test('una zafra produce un único punto sin segmento; vacío no produce gráfico ficticio',()=>{
  const v=model(analysis('latest'));const p=layout(v,320);
  assert.equal(p.points.length,1);assert.equal(p.segments.length,0);assert.ok(p.points[0].x>0&&p.points[0].x<320);
  assert.equal(p.xTicks.length,1);assert.deepEqual(layout(model(analysis('custom',[]),{mode:'custom'}),320).points,[]);
});
test('muchas zafras caben en móvil; un hueco solicitado nunca se conecta como observación de cero',()=>{
  const data=Array.from({length:15},(_,i)=>({...rows[0],zafra:2000+i,ton:100+i*10}));
  const v=model(analysis('all',[],data)),p=layout(v,310);
  assert.equal(p.points.length,15);assert.ok(p.xTicks.length<=4);assert.equal(p.xTicks.at(-1).zafra,2014);
  for(const point of p.points){assert.ok(point.x>=0&&point.x<=310);assert.ok(point.y>=0&&point.y<=p.height);}
  const gap=model(analysis('custom',[2021,2022,2023],[rows[0],{...rows[0],zafra:2023}]),{mode:'custom'});
  assert.deepEqual(gap.missingSeasons,[2022]);assert.equal(gap.series[1].value,null);assert.deepEqual(layout(gap,310).segments,[]);
});
test('la proyección no muta ni depende de snapshots de B0',()=>{
  const a=analysis(),before=structuredClone(a);model(a,{metric:'ton'});layout(model(a),320);assert.deepEqual(a,before);
  const source=fs.readFileSync(new URL('../js/historical-panorama-model.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/B0_SNAPSHOTS|fetch\(|aggregateHistoricalRows|buildHistoricalMultiAnalysis\(/);
});
test('caso oficial: los seis KPI y sus coberturas coinciden con el motor validado',()=>{
  const hist=JSON.parse(fs.readFileSync(new URL('../data/historico.json',import.meta.url),'utf8'));
  const current=JSON.parse(fs.readFileSync(new URL('../data/cronologico.json',import.meta.url),'utf8'));
  const cat=E.historicalMultiCatalog(hist.lotCompact.map(l=>({farmCode:l[8],farmName:l[9],lotId:l[0],suerte:l[10]})));
  const scope={'256':{mode:'full'},'983':{mode:'partial',lotIds:['98301','98302']}};
  const official=E.normalizeHistoricalRows(hist.lotCompact);
  const get=mode=>model(E.buildHistoricalMultiAnalysis(official,scope,cat,mode,[],current.producers));
  const latest=get('latest'),three=get('last3');
  assert.deepEqual([latest.kpis.area,latest.kpis.tch,latest.kpis.katm,latest.kpis.edad,latest.kpis.ton],[188.78,40.57,103.9,11.8,7659.24]);
  assert.equal(latest.coverage.find(c=>c.key==='edad').pct,65.16);
  assert.deepEqual([three.kpis.areaAccumulated,three.kpis.area,three.kpis.tch,three.kpis.katm,three.kpis.ton,three.kpis.edad],[566.52,188.84,48.92,108.56,27713.49,11.6]);
  assert.equal(three.coverage.find(c=>c.key==='edad').pct,88.39);assert.equal(three.summary.contributingLotCount,11);assert.equal(three.summary.selectedLotCount,17);
});
test('recursos del Panorama conservan orden y están incluidos en exportación HTML autónoma',()=>{
  const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.ok(index.indexOf('script src="js/historical-panorama-model.js"')<index.indexOf('script src="js/historical-panorama.js"'));
  assert.match(index,/for\(const asset of \['css\/historical-panorama\.css','js\/historical-panorama-model\.js','js\/historical-panorama\.js'\]/);
});
