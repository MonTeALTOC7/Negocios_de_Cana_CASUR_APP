// Prepare a static preview from a Git commit; never deploys or changes hosting.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [ref,destination]=process.argv.slice(2);
if(!ref || !destination)throw Error('Usage: node tools/package-maestro-preview.mjs SHA NEW_EXTERNAL_DIRECTORY');
const output=path.resolve(destination);
if(output===root || output.startsWith(root+path.sep) || fs.existsSync(output))throw Error('Use a new directory outside the checkout');
const git=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:64e6});
const head=git('rev-parse',ref).toString().trim();
if(!/^[a-f0-9]{40}$/.test(head))throw Error('Expected commit SHA');
const read=file=>git('show',head+':'+file);
const manifest=JSON.parse(read('core/versions/runtime-assets.json'));
const tracked=git('ls-tree','-r','--name-only',head).toString().trim().split('\n');
const allowed=new Set([...Object.keys(manifest.assets),'sw.js','manifest.webmanifest','core/versions/runtime-assets.json',
 ...tracked.filter(p=>/^(modules\/(produccion|tch)\/data|master\/data|shared\/geo\/data)\/.*\.(json|js|geojson)$/.test(p))]);
const prefix='Negocios_de_Cana_CASUR_APP';
for(const file of allowed){
 if(file.includes('..') || file.includes('\\') || /(^|\/)(docs|tools|tests|\.git|node_modules)(\/|$)|\.(zip|xlsx?|pem|key|bak)$/i.test(file))throw Error('Disallowed preview artifact: '+file);
 const target=path.join(output,prefix,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,read(file));
}
const provenance={head,repository:'MonTeALTOC7/Negocios_de_Cana_CASUR_APP',branch:'codex/maestro-ux-premium-fase1',pullRequest:48,appVersion:manifest.appVersion,files:allowed.size,publicPreview:true};
fs.writeFileSync(path.join(output,prefix,'__preview.json'),JSON.stringify(provenance,null,2)+'\n');
fs.writeFileSync(path.join(output,'vercel.json'),JSON.stringify({framework:null,buildCommand:null,outputDirectory:'.',redirects:[{source:'/',destination:'/'+prefix+'/',permanent:false}],headers:[{source:'/(.*)',headers:[{key:'X-Robots-Tag',value:'noindex, nofollow'},{key:'Cache-Control',value:'no-store'}]}]},null,2)+'\n');
console.log(JSON.stringify({...provenance,directory:output}));
