import test from 'node:test';
import assert from 'node:assert/strict';
import {cartographicInteriorPoints,cartographicLabelLayout} from '../shared/geo/geo-map.js';

test('anchors válidos se conservan; huecos y fragmentos no reciben puntos exteriores',()=>{
 const outer=[[0,0],[10,0],[10,10],[0,10],[0,0]],hole=[[3,3],[7,3],[7,7],[3,7],[3,3]];
 const feature={properties:{anchor:[5,5]},geometry:{type:'MultiPolygon',coordinates:[[outer,hole],[[[20,0],[20.001,0],[20.001,10],[20,10],[20,0]]]]}};
 const before=JSON.stringify(feature),points=cartographicInteriorPoints(feature);
 assert.ok(points.length);assert.ok(points.every(([x,y])=>!(x>3&&x<7&&y>3&&y<7)));
 assert.equal(JSON.stringify(feature),before);
 feature.properties.anchor=[1,1];assert.deepEqual(cartographicInteriorPoints(feature)[0],[1,1]);
 const thin={properties:{anchor:[50,50]},geometry:{type:'Polygon',coordinates:feature.geometry.coordinates[1]}};
 assert.ok(cartographicInteriorPoints(thin).every(([x])=>x>20&&x<20.001));
});
test('etiquetas con colisiones usan guías o lista explícita; nunca se enciman ni salen de imagen',()=>{
 const items=Array.from({length:20},(_,i)=>({id:String(i),text:'Suerte '+i,points:[{x:150,y:170}]}));
 const result=cartographicLabelLayout(items,320,440,s=>s.length*7);
 assert.equal(result.labels.length+result.unresolved.length,20);assert.ok(result.labels.some(l=>l.external));
 for(const [i,a] of result.labels.entries()){
  assert.ok(a.x>=0&&a.y>=0&&a.x+a.w<=320&&a.y+a.h<=440);
  for(const b of result.labels.slice(i+1))assert.ok(!(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y));
 }
});

test('contexto tenue no desplaza etiquetas principales ni agrega guías externas',()=>{
 const items=[{id:'principal',text:'Suerte 01',points:[{x:150,y:170}]},{id:'contexto',text:'Suerte 02',contextual:true,points:[{x:150,y:170}]}];
 const before=JSON.stringify(items),result=cartographicLabelLayout(items,320,440,s=>s.length*7);
 assert.deepEqual(result.labels.map(l=>l.id),['principal']);assert.deepEqual(result.unresolved,['contexto']);assert.equal(JSON.stringify(items),before);
 const separate=cartographicLabelLayout([{...items[1],points:[{x:150,y:250}]}],320,440,s=>s.length*7);
 assert.equal(separate.labels[0].external,false);assert.equal(separate.labels[0].contextual,true);
});
