import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bundleFor} from '../tools/runtime-assets.mjs';
const manifest=JSON.parse(readFileSync(new URL('../core/versions/runtime-assets.json',import.meta.url)));
test('los conjuntos cubren todos los recursos una sola vez sin perder hashes',()=>{
 const members=Object.values(manifest.bundles).flat();
 assert.equal(members.length,new Set(members).size);
 assert.deepEqual([...members].sort(),Object.keys(manifest.assets).sort());
 for(const [name,files] of Object.entries(manifest.bundles))for(const file of files){assert.equal(bundleFor(file),name);assert.match(manifest.assets[file],/^[a-f0-9]{64}$/);}
 assert.match(manifest.releaseId,/^1\.5\.5-[a-f0-9]{16}$/);
});
test('rutas compartidas permanecen en núcleo y módulos reciben conjuntos propios',()=>{
 for(const id of ['produccion','tch','riego','insumos','labores','inventario'])assert.equal(bundleFor(`modules/${id}/index.html`),id);
 assert.equal(bundleFor('master/convertidor/index.html'),'convertidor');assert.equal(bundleFor('private/conciliacion/index.html'),'conciliacion');assert.equal(bundleFor('shared/geo/geo-map.js'),'core');
});
