import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {APP_VERSION} from '../core/versions/versions.js';
const excluded=new Set(['.git','node_modules','tests','test','tools','docs','data','datos','fixtures','scripts','.github']);
function walk(directory='.') {
 return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  const file=path.join(directory,entry.name);
  if(entry.isDirectory())return excluded.has(entry.name)||entry.name.startsWith('.')?[]:walk(file);
  return /\.(?:html|css|js|mjs|png|jpe?g|svg|gif|webp|woff2?|ttf|ico|webmanifest)$/.test(entry.name)&&!['sw.js'].includes(entry.name)?[file.replaceAll('\\','/')]:[];
 });
}
// Group private module files explicitly. Shared files remain in core until their
// cross-module dependencies have been audited; no asset is silently dropped.
export function bundleFor(file) {
 if(file==='modules/tch/assets/cana-azucar-real.png')return 'agricultural';
 if (/^(?:shared\/geo\/|shared\/vendor\/leaflet\/)/.test(file)) return 'geo';
 const match=file.match(/^(?:modules\/(produccion|tch|riego|insumos|labores|inventario)|master\/(convertidor)|private\/(conciliacion))\//);
 return match ? match.slice(1).find(Boolean) : 'core';
}
export function generateManifest(files, appVersion=APP_VERSION) {
 const assets=Object.fromEntries(files.sort().map(file=>[file,createHash('sha256').update(/\.(?:html|css|js|mjs|svg)$/.test(file)?fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'):fs.readFileSync(file)).digest('hex')]));
 const bundles={};for(const file of Object.keys(assets)) (bundles[bundleFor(file)]??=[]).push(file);
 const dependencies={produccion:['core','geo','agricultural'],tch:['core','geo','agricultural'],agricultural:['core'],riego:['core'],insumos:['core'],labores:['core'],inventario:['core'],convertidor:['core'],conciliacion:['core'],geo:['core'],core:[]};
 const releaseId=appVersion+'-'+createHash('sha256').update(JSON.stringify({assets,bundles,dependencies})).digest('hex').slice(0,16);
 return {appVersion,releaseId,assets,bundles,dependencies};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve('tools/runtime-assets.mjs')) {
 const manifest=generateManifest(walk());
 const output=JSON.stringify(manifest,null,2)+'\n',file='core/versions/runtime-assets.json';
 if(process.argv.includes('--write'))fs.writeFileSync(file,output);
 else if(!fs.existsSync(file)||fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')!==output)throw Error('Runtime assets mismatch: node tools/runtime-assets.mjs --write');
 console.log(`Verified runtime manifest ${APP_VERSION}: ${Object.keys(manifest.assets).length} code assets`);
}
