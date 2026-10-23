import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function api(fetch){const c=vm.createContext({window:{CASUR_GEO_DATA:{getLotGeometries:fetch}},esc:s=>String(s)});vm.runInContext(html.slice(html.indexOf('const historicalMapCache='),html.indexOf('let historicalMapController=')),c);return c;}
const feature={type:'Feature',properties:{lotId:'98304A'},geometry:{type:'MultiPolygon',coordinates:[[[[0,0],[1,0],[1,1],[0,0]],[[.1,.1],[.2,.1],[.1,.2],[.1,.1]]],[[[2,2],[3,2],[2,3],[2,2]]]]}};
test('selección exacta, cobertura, caché y geometrías sin mutación',async()=>{let calls=0;const c=api(async ids=>{calls++;assert.deepEqual([...ids],['98304A','sin']);return [feature];}),selection=[{farmCode:'983',farmName:'Peirano',mode:'partial',lotIds:['98304A','sin']}],before=JSON.stringify(feature);
const m=await c.historicalMapModel(selection);assert.equal(m.available,1);assert.deepEqual([...m.farms[0].missing],['sin']);assert.equal(await c.historicalMapModel(selection),m);assert.equal(calls,1);const svg=c.historicalMapSvg(m.farms[0]);assert.equal((svg.match(/data-lot-id=/g)||[]).length,2);assert.ok(svg.includes('fill-rule="evenodd"'));assert.equal((svg.match(/Z/g)||[]).length,3);assert.equal(JSON.stringify(feature),before);});
test('ausencia y fallo GEO no inventan geometrías y permiten reintento',async()=>{let fail=true;const c=api(async()=>{if(fail)throw Error('offline');return [];});const s=[{farmCode:'1',farmName:'Sin mapa',lotIds:['1A']}];await assert.rejects(c.historicalMapModel(s));fail=false;const m=await c.historicalMapModel(s);assert.equal(m.available,0);assert.match(c.historicalMapReport(m),/Sin polígonos disponibles/);assert.match(c.historicalMapReport(m),/1A/);});
test('etiqueta corta verifica finca y estructura antes de separar CodSuerte',()=>{
 const c=api(async()=>[]),farm={farmCode:'983'};
 assert.equal(c.historicalMapLotLabel(farm,'98304A'),'Suerte 04A');
 assert.equal(c.historicalMapLotLabel(farm,'25601'),'CodSuerte 25601');
 assert.equal(c.historicalMapLotLabel(farm,'983X'),'CodSuerte 983X');
});
test('exportación híbrida exige mosaicos completos y aceptación explícita para fondo ausente',()=>{
 assert.match(html,/await historicalHybridReport\(mapModel\)/);
 assert.match(html,/if\(!window.confirm\([\s\S]*SIN mapa base[\s\S]*\)\)throw error/);
 const source=fs.readFileSync(new URL('../js/casur-enhancements.js',import.meta.url),'utf8');
 assert.match(source,/geoWaitForExportTiles\(mapNode, activeBase/);
 assert.match(source,/geoInlineExportTiles\(mapNode, activeBase, Boolean\(configuration\)\)/);
 assert.match(source,/geoRasterizeExportMap\(html2canvas, mapNode, Boolean\(configuration\)\)/);
});
