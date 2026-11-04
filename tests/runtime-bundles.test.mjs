import path from 'node:path';
import {fileURLToPath} from 'node:url';
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
 assert.match(manifest.releaseId,/^1\.5\.6-[a-f0-9]{16}$/);
});
test('rutas compartidas permanecen en núcleo y módulos reciben conjuntos propios',()=>{
 for(const id of ['produccion','tch','riego','insumos','labores','inventario'])assert.equal(bundleFor(`modules/${id}/index.html`),id);
 assert.equal(bundleFor('master/convertidor/index.html'),'convertidor');assert.equal(bundleFor('private/conciliacion/index.html'),'conciliacion');assert.equal(bundleFor('shared/geo/geo-map.js'),'geo');assert.deepEqual(manifest.dependencies.produccion,['core','geo','agricultural']);assert.deepEqual(manifest.dependencies.tch,['core','geo','agricultural']);
});

test('URLs CSS de Producción resuelven a conjuntos en su cierre',()=>{
 const css=readFileSync(new URL('../modules/produccion/css/maestro-ux.css',import.meta.url),'utf8');
 const allowed=new Set(['core','geo','agricultural','produccion']);
 for(const match of css.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)){if(/^(data:|https?:)/.test(match[1]))continue;const url=new URL(match[1],new URL('../modules/produccion/css/maestro-ux.css',import.meta.url)),file=path.relative(fileURLToPath(new URL('../',import.meta.url)),fileURLToPath(url)).replaceAll('\\','/');if(!file)continue;assert.ok(manifest.assets[file],file);assert.ok(allowed.has(bundleFor(file)),file);}
});
