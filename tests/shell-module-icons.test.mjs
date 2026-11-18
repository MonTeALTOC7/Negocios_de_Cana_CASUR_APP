import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const shell=readFileSync('app.js','utf8');
test('seis logos institucionales sin iconos genéricos',()=>{
for(const id of ['produccion','tch','riego','insumos','inventario','labores']){
 assert.ok(existsSync('shared/assets/logos/'+id+'-512.png'));
 assert.ok(shell.includes('shared/assets/logos/'+id+'-512.png'));
}
for(const name of ['mod-card__tile','module-switcher__logo','mrow__tile'])assert.ok(shell.includes(name+'"><img'));
});

test('PNG revisados conservan 512×512, canal alfa y hashes del runtime core',()=>{
 const manifest=JSON.parse(readFileSync('core/versions/runtime-assets.json','utf8'));
 for(const id of ['produccion','tch','riego','insumos','labores']){
  const file=`shared/assets/logos/${id}-512.png`,bytes=readFileSync(file);
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16),512);assert.equal(bytes.readUInt32BE(20),512);
  assert.equal(bytes[25],6,'RGBA necesario para esquinas transparentes');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.assets[file]);
  assert.ok(manifest.bundles.core.includes(file),'icono necesario offline desde Inicio');
 }
});

test('el icono de inventario permanece idéntico',()=>{
 const approved={inventario:'b4f33dcd80db5c0f6d64beadbc167b09020fa1b65085139603d3133e42afb1aa'};
 for(const[id,hash]of Object.entries(approved))assert.equal(createHash('sha256').update(readFileSync(`shared/assets/logos/${id}-512.png`)).digest('hex'),hash,id);
});

test('el menú lateral usa iconos simplificados y conserva Inventario',()=>{
 const manifest=JSON.parse(readFileSync('core/versions/runtime-assets.json','utf8'));
 assert.ok(shell.includes('railLogoFor(moduleId)'));
 assert.ok(shell.includes('RAIL_LOGOS[id] || logoFor(id)'));
 for(const id of ['produccion','tch','riego','insumos','labores']){
  const path=`shared/assets/logos/${id}-rail.png`, bytes=readFileSync(path);
  assert.equal(bytes.readUInt32BE(16),256);assert.equal(bytes.readUInt32BE(20),256);
  assert.ok(manifest.bundles.core.includes(path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.assets[path]);
 }
});
