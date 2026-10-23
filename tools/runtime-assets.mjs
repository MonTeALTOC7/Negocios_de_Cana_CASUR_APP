import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {APP_VERSION} from '../core/versions/versions.js';
const excluded=new Set(['.git','node_modules','tests','test','tools','docs','data','datos','fixtures','scripts','.github']);
function walk(directory='.') {
 return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  const file=path.join(directory,entry.name);
  if(entry.isDirectory())return excluded.has(entry.name)||entry.name.startsWith('.')?[]:walk(file);
  return /\.(?:html|css|js|mjs|png|jpe?g|svg|gif|webp|woff2?|ttf|ico)$/.test(entry.name)&&!['sw.js'].includes(entry.name)?[file.replaceAll('\\','/')]:[];
 });
}
// Normalize line endings only for hashing: Windows checkout and GitHub LF must agree.
const assets=Object.fromEntries(walk().sort().map(file=>[file,createHash('sha256').update(/\.(?:html|css|js|mjs|svg)$/.test(file)?fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'):fs.readFileSync(file)).digest('hex')]));
const output=JSON.stringify({appVersion:APP_VERSION,assets},null,2)+'\n';
const file='core/versions/runtime-assets.json';
if(process.argv.includes('--write'))fs.writeFileSync(file,output);
else if(!fs.existsSync(file)||fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')!==output)throw Error('Runtime assets mismatch: node tools/runtime-assets.mjs --write');
console.log(`Verified runtime manifest ${APP_VERSION}: ${Object.keys(assets).length} code assets`);
