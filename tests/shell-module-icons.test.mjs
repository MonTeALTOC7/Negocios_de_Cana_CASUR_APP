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
 for(const id of ['produccion','tch','riego']){
  const file=`shared/assets/logos/${id}-512.png`,bytes=readFileSync(file);
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16),512);assert.equal(bytes.readUInt32BE(20),512);
  assert.equal(bytes[25],6,'RGBA necesario para esquinas transparentes');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.assets[file]);
  assert.ok(manifest.bundles.core.includes(file),'icono necesario offline desde Inicio');
 }
});

test('los tres isotipos aprobados restantes permanecen idénticos',()=>{
 const approved={insumos:'0526da84ad5a0a9df86d2399bee5046ab781ee0aa0b2344fcea19eba4b248c38',inventario:'b4f33dcd80db5c0f6d64beadbc167b09020fa1b65085139603d3133e42afb1aa',labores:'67bb5a1b0bd0cfa65e712ce68b4235b3cf056834368022ff45b5b318d7699a89'};
 for(const[id,hash]of Object.entries(approved))assert.equal(createHash('sha256').update(readFileSync(`shared/assets/logos/${id}-512.png`)).digest('hex'),hash,id);
});
