import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('  function managerialSelectionLabel('),html.indexOf('  function dualQuality('));
const ctx=vm.createContext({escH:s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),f2:v=>Number(v).toFixed(2),zlabel:z=>String(z).padStart(4,'0').slice(0,2)+'/'+String(z).padStart(4,'0').slice(2)});
vm.runInContext(source,ctx);
test('V2.1: abreviación segura preserva ceros, sufijos y selección original',()=>{
  const farm={farmCode:'983',mode:'partial',lotIds:['98301','98304','98304A']},before=JSON.stringify(farm);
  assert.equal(ctx.managerialSelectionLabel(farm),'Suertes 01, 04 y 04A');
  assert.equal(JSON.stringify(farm),before);
  assert.equal(ctx.managerialSelectionLabel({...farm,mode:'full'}),'finca completa');
  assert.equal(ctx.managerialSelectionLabel({...farm,lotIds:['98301']}),'Suerte 01');
  assert.equal(ctx.managerialSelectionLabel({...farm,lotIds:['25601','983','983004','983-01']}),'Suertes 25601, 983, 983004 y 983-01');
  assert.equal(ctx.managerialSelectionLabel({...farm,farmCode:'',lotIds:['98301']}),'Suerte 98301');
});
test('V2.1: rango dinámico no acredita continuidad cuando faltan zafras',()=>{
  assert.equal(ctx.managerialSeasonRange([2526,2324,2425]),'Zafras 23/24 a 25/26');
  assert.equal(ctx.managerialSeasonRange([1920,2526]),'Zafras 19/20 a 25/26 · 2 zafras observadas');
  assert.equal(ctx.managerialSeasonRange([2526]),'Zafra 25/26');
  assert.equal(ctx.managerialSeasonRange([]),'Sin zafras con registros');
});
test('selección analizada distingue nombre, código y alcance sin mutar identidades',()=>{
  const farms=[{farmCode:'256',farmName:'Dolores',mode:'full',lotIds:['25601']},{farmCode:'983',farmName:'Rancho Peirano',mode:'partial',lotIds:['98301','98304','98304A']}];
  const before=JSON.stringify(farms),result=ctx.managerialIncludedSelection(farms);
  assert.match(result,/<strong>Selección analizada<\/strong><ul/);
  assert.match(result,/<b>Dolores \(256\)<\/b> — <em>finca completa<\/em>/);
  assert.match(result,/<b>Rancho Peirano \(983\)<\/b> — <em>suertes 01, 04 y 04A<\/em>/);
  assert.equal((result.match(/<li>/g)||[]).length,2);assert.equal(JSON.stringify(farms),before);
  assert.match(ctx.managerialIncludedSelection([{...farms[1],farmName:'<nombre>',lotIds:['25601']}]),/&lt;nombre>/);
  assert.match(ctx.managerialIncludedSelection([{...farms[1],lotIds:['25601']}]),/suerte 25601/);
});
test('estilo de papel queda acotado al ejecutivo y anexos sin alterar fichas individuales',()=>{
  assert.match(html,/\.casur-report-executive \.dual-period \.dual-kpi\{background:#fff;color:#17261c/);
  assert.match(html,/\.casur-report-executive \.dual-period\{background:#f6f7f6;border-left:3px/);
  assert.match(html,/\.dual-period \.dual-kpi\{background:#087638;color:#fff/);
  assert.match(html,/const included=managerialIncludedSelection\(result.selection\)/);
});
const scope={areaMean:187.41,areaAccumulated:937.03,tch:53.57,katm:105.66,tahAudit:{tah:5.66,excludedRows:0},metricCoverage:{tch:{pct:100},katm:{pct:100}},zafrasWithData:[2122,2526],requestedSeasonCount:2};
test('V2.1: nombres, unidades y notas comparten presentación sin mutar resultados',()=>{
  const model={full:scope,period:scope,availableZafras:[2122,2526],selectedZafras:[2122,2526]},before=JSON.stringify(model);
  const result=ctx.dualKpis(model);
  assert.match(result,/Histórico CASUR/);assert.match(result,/Histórico del período seleccionado/);
  assert.match(result,/Área histórica/);assert.match(result,/Área del período/);
  assert.match(result,/Zafras 21\/22 · 25\/26/);
  assert.match(result,/<b>105.66<\/b> <span>kg azúcar\/t caña<\/span>/);
  assert.doesNotMatch(result,/Área cosechada media|Equivalente estimado|Desempeño productivo/);
  assert.equal(JSON.stringify(model),before);
  const empty={...scope,areaMean:null,areaAccumulated:null,tch:null,katm:null,tahAudit:{tah:null},zafrasWithData:[]};
  const nd=ctx.managerialKpiGroup(empty,'period','Histórico del período seleccionado','Zafras 21/22 · 25/26');
  assert.equal((nd.match(/<b>N\/D<\/b>/g)||[]).length,4);assert.match(nd,/0 de 2 zafras solicitadas/);assert.doesNotMatch(nd,/Acumulado 0/);
});
test('V2.1: distancia compacta mantiene procedencia y cobertura parcial accesible',()=>{
  const result=ctx.multiLogistics({currentDistance:{kmWeighted:36.10,status:'complete',coveragePct:100}});
  assert.match(result,/<strong>Distancia ponderada: 36.10 km<\/strong>/);assert.doesNotMatch(result,/<small>/);assert.match(result,/aria-label=.*Cronológico SIAGRI vigente/);
  const partial=ctx.multiLogistics({currentDistance:{kmWeighted:12,status:'partial',coveragePct:80}});
  assert.match(partial,/<strong>.*Parcial · 80.00 % cobertura/);
  assert.match(ctx.multiLogistics({currentDistance:{kmWeighted:null,status:'missing',coveragePct:0}}),/Distancia ponderada: N\/D/);
});
test('V2.1: PDF y anexos usan composición compartida; paginación y tablas siguen presentes',()=>{
  const pdf=html.slice(html.indexOf('function buildHistoricalExecutive('),html.indexOf('function prepareClone('));
  assert.match(pdf,/report.annexes.get/);assert.match(pdf,/htmlNode\(annex.kpis\)/);assert.match(pdf,/htmlNode\(annex.logistics\)/);
  assert.doesNotMatch(pdf,/Desempeño productivo|<strong>Período|CodSuerte incluidos:/);
  assert.match(pdf,/seasonTable\(farm.dataset.farmCode,null,true\)/);assert.match(pdf,/chart\(charts\[0\]\)\],true/);
  assert.doesNotMatch(html,/ · origen cero<\/small>/);
});
