import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
export function productionIntegrity(directory) {
 const files={};for(const kind of ['version','cronologico','historico'])for(const ext of ['json','js']){
  const name=kind+'.'+ext,bytes=fs.readFileSync(path.join(directory,name),'utf8').replace(/\r\n/g,'\n');
  files[name]=createHash('sha256').update(bytes).digest('hex');
 }
 return {schemaVersion:1,dataVersion:JSON.parse(fs.readFileSync(path.join(directory,'version.json'))).version,files};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const directory=path.resolve(process.argv.slice(2).find(x=>!x.startsWith('--'))||'modules/produccion/data'),file=path.join(directory,'integrity.json'),text=JSON.stringify(productionIntegrity(directory),null,2)+'\n';
 if(process.argv.includes('--write'))fs.writeFileSync(file,text);
 else if(!fs.existsSync(file)||fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')!==text)throw Error('Production data integrity manifest mismatch');
 console.log('Production integrity manifest verified (six SHA-256; LF distribution)');
}
