import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {migrateModuleHtml} from '../../../tools/retheme-petroleo.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const base='ac99614a9dd0c4a6a7f0ae06aa569fe1882be100';
const current=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const original=p=>execFileSync('git',['show',base+':modules/produccion/'+p],{cwd:root,encoding:'utf8',maxBuffer:32e6}).replace(/\r\n/g,'\n');

// Rediseño Petróleo·Pizarra: el documento actual debe ser exactamente el original
// tras la migración de tema (solo color, tipografía y radios en CSS; ver tools/retheme-petroleo.mjs).
test('Fase 1 conserva byte a byte el documento y los motores originales tras retirar los dos enlaces nuevos',()=>{
 const restored=current('index.html').replace('<link rel="stylesheet" href="css/maestro-ux.css">\n','').replace('<script src="js/maestro-ux.js"></script>\n','');
 const normalizeRelease = html => html.replace(/<style>\n  html\.casur-booting[\s\S]*?<\/style>\n<script>document\.documentElement\.classList\.add\('casur-booting'\);<\/script>\n/, '').replace(/\n<div id="casurStartup"[\s\S]*?<\/script>/, '').replace(/var VERSION='V[\d.]+';/, 'var VERSION=RELEASE;').replace(/(<script id="casurEmbeddedPwaAssets"[^>]*>)([\s\S]*?)(<\/script>)/, (_, start, json, end) => {
   const assets=JSON.parse(json); for(const name of ['README_GITHUB.md','VERSION.txt']) assets[name]=Buffer.from(Buffer.from(assets[name],'base64').toString('utf8').replace(/V[\d.]+/g,'RELEASE')).toString('base64');
   return start+JSON.stringify(assets)+end;
 });
 assert.equal(normalizeRelease(restored),normalizeRelease(migrateModuleHtml(original('index.html'))));
 assert.equal(current('js/historical-engine.js'),original('js/historical-engine.js'),'js/historical-engine.js');
 // Plan Z26/27 (#67): the only engine change allowed is registering the audited AFORO_26-27 source hash.
 const authorizedSource=/,\n    \/\/ 2e3c\.\.\.: AFORO_26-27 Z26\/27 \(22-nov-2026, Issue #67\)\.[^\n]*\n    \/\/ [^\n]*\n    '2e3cfedb0682024753f7dca7f484326641e281bf018de44f823052369dfada60'\]/;
 assert.match(current('js/casur-enhancements.js'),authorizedSource);
 assert.equal(current('js/casur-enhancements.js').replace(authorizedSource,']'),original('js/casur-enhancements.js'),'js/casur-enhancements.js');
 // Data releases are verified by their integrity manifest; Histórico records stay byte-for-byte except its generation label.
 const integrity=JSON.parse(current('data/integrity.json'));
 for(const [name,hash] of Object.entries(integrity.files))assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../data/'+name,import.meta.url))).digest('hex'),hash,name);
 const relabel=text=>{const h=JSON.parse(text);return JSON.stringify({...h,meta:{...h.meta,dataVersion:null,sourceDataVersion:null}});};
 assert.equal(relabel(current('data/historico.json')),relabel(original('data/historico.json')),'data/historico.json');
});

test('El puente PWA mantiene su contrato original y solo añade la pestaña al snapshot',()=>{
 const restored=current('js/official-data-updates.js')
  .replace('maestroView:window.CASUR_MAESTRO_UX?.capture(),','')
  .replace('  window.CASUR_MAESTRO_UX?.restore(c.maestroView,c.sections);\n','');
 assert.equal(restored,original('js/official-data-updates.js'));
});

test('Texto y superficies nuevas cumplen contraste AA; el dorado se usa como acento',()=>{
 const luminance=hex=>{const v=hex.match(/\w\w/g).map(n=>parseInt(n,16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2];};
 const ratio=(a,b)=>{const l=[luminance(a),luminance(b)].sort((a,b)=>b-a);return(l[0]+.05)/(l[1]+.05);};
 for(const[a,b]of[['173B46','FFFFFF'],['28483A','FFFFFF'],['30393D','FFFFFF'],['5C7470','FFFFFF'],['1F4E5C','E4EAE9']])assert.ok(ratio(a,b)>=4.5,`${a}/${b}`);
 const css=current('css/maestro-ux.css');assert.ok(css.startsWith('/* Screen-only'));assert.match(css,/@media screen/);assert.doesNotMatch(css,/(?:^|[;{])\s*color:\s*var\(--maestro-gold\)/);
});
