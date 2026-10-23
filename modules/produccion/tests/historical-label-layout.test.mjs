import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),ctx=vm.createContext({});
vm.runInContext(html.slice(html.indexOf('function historicalLabelPositions('),html.indexOf('function managerialHistoricalChart(')),ctx);
for(const [name,ys] of Object.entries({extremos:[30,100,218],minimo:[80,218,70],maximo:[180,30,170],cercanos:[120,122,119]}))test('etiquetas determinísticas: '+name,()=>{
 const points=ys.map((y,i)=>({x:46+i*65,y,value:y,text:'108.56',zafra:2122+i*101})),before=JSON.stringify(points),measure=()=>({width:40,height:10}),bounds={left:25,right:715,top:5,bottom:239};
 const labels=ctx.historicalLabelPositions(points,measure,bounds);
 assert.equal(JSON.stringify(labels),JSON.stringify(ctx.historicalLabelPositions(points,measure,bounds)));assert.equal(JSON.stringify(points),before);
 for(const [i,p] of labels.entries()){assert.ok(p.box.x>=25&&p.box.x+p.box.w<=715&&p.box.y>=5&&p.box.y+p.box.h<=239);assert.ok(Math.abs(p.y-points[i].y)>8);for(const q of labels.slice(i+1))assert.ok(p.box.x+p.box.w<=q.box.x||q.box.x+q.box.w<=p.box.x||p.box.y+p.box.h<=q.box.y||q.box.y+q.box.h<=p.box.y);}
});
test('sin dato no se inventa etiqueta',()=>{assert.equal(ctx.historicalLabelPositions([{value:null}],()=>({width:10,height:10}),{})[0],null);});
