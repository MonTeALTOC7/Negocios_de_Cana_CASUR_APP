import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const git=(...args)=>{
 try{return execFileSync('git',args,{encoding:'utf8',maxBuffer:64*1024*1024}).trim();}
 catch{throw Error('C3 Git check failed: '+args.slice(0,2).join(' '));}
};
const c2='522fa602a21748349806f70302d02e5108d9dbcb',base=process.argv[2]||'origin/main';
for(const sha of [c2,'3e510035cc4017b175758c9b967f447935351228','bb04f8f104bdbb421182975d0623c6c6379850ea','6d6c790fec35d53f75da6cca9ff483cd535575cb'])git('merge-base','--is-ancestor',sha,'HEAD');
const files=git('ls-files','--cached').split('\n');
assert.equal(files.includes('tools/preview-data/aforo-1101.enc'),false,'Private snapshot must stay outside candidate tree');
const changed=git('diff','--name-only','--diff-filter=ACMR',base).split('\n').filter(Boolean);
assert.deepEqual(changed.filter(p=>/\.(xlsx?|xlsm|zip|enc|pem|key|bak)$/i.test(p)||/(^|\/)(profiles?|snapshots?|recovery-private|package-private)(\/|$)/i.test(p)),[],'No new private artifacts');
for(const kind of ['version','cronologico','historico'])for(const ext of ['json','js']){
 const file=`modules/produccion/data/${kind}.${ext}`;
 assert.ok(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n').trim()===git('show',`${base}:${file}`).replace(/\r\n/g,'\n'),'Public code PR must preserve published baseline: '+file);
}
const manifest='core/versions/runtime-assets.json';
assert.deepEqual(JSON.parse(fs.readFileSync(manifest)),JSON.parse(git('show',`${c2}:${manifest}`)),'C3 packaging must preserve approved C2 runtime');
const version=JSON.parse(fs.readFileSync('modules/produccion/data/version.json'));
assert.notEqual(version.version,'2026.10.25-aforo.1101','Official aforo is not yet authorized for public Git');
if(process.argv.includes('--for-push')){
 assert.ok(git('log','-1','--format=%s').startsWith('[CF-Pages-Skip]'),'Cloudflare deployment must be omitted explicitly');
 assert.equal(git('status','--porcelain'),'','Push only a clean reviewed candidate');
}
console.log('C3_CANDIDATE_PASS: ancestry, unchanged C2 runtime, baseline public data, no private artifacts');
