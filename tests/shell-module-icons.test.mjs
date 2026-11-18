import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
const shell=readFileSync('app.js','utf8');
test('seis logos institucionales sin iconos genéricos',()=>{
for(const id of ['produccion','tch','riego','insumos','inventario','labores']){
 assert.ok(existsSync('shared/assets/logos/'+id+'-512.png'));
 assert.ok(shell.includes('shared/assets/logos/'+id+'-512.png'));
}
for(const name of ['mod-card__tile','module-switcher__logo','mrow__tile'])assert.ok(shell.includes(name+'"><img'));
});
