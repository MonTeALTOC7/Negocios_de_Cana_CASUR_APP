// Read-only source audit. Output stays outside the repository; never writes workbooks.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {workbookSheets} from '../core/imports/workbook-reader.js';
const require=createRequire(import.meta.url),X=require('../master/convertidor/js/vendor/xlsx.full.min.js');
const E=require('../core/imports/operational-import.js');
const [extract,complete,out]=process.argv.slice(2);
const prefix=process.argv[5]||'participacion-previa';
if(!/^[a-z0-9-]+$/.test(prefix))throw Error('Invalid audit prefix');
if(!extract||!complete||!out)throw Error('Provide extract.xlsx complete.xlsx and an external output directory.');
const root=path.resolve(import.meta.dirname,'..');
if(!path.relative(root,path.resolve(out)).startsWith('..'))throw Error('Audit output must be outside the repository.');
fs.mkdirSync(out,{recursive:true});
const baseline=JSON.parse(fs.readFileSync(path.join(root,'modules/produccion/data/cronologico.json')));
const previous=baseline.producers.flatMap(p=>p.details.map(r=>({...r,code:r.code||p.code,name:r.name||p.name})));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const destinationClass=v=>{const n=E.norm(v);return n.startsWith('semilla')?'Semilla':n==='molienda'?'Molienda':n==='sincana'?'Sin Caña':n==='bajarentabilidad'?'Baja rentabilidad':n==='investigacion'?'Investigación':null;};
function proposed(r){
 const present=r.sourcePresence==='present',retired=r.operationalState==='Baja definitiva';
 const active=present&&!retired&&r.inventoryArea>0&&['Molienda','Semilla'].includes(r.classification);
 const milling=active&&r.classification==='Molienda',tch=r.forecast?.tch??null,dc=destinationClass(r.destino);
 const conflict=!!(dc&&r.classification&&dc!==r.classification);
 const status=!present?'absent':retired?'retired':!active?'excluded':r.classification==='Semilla'?'seed':tch===null?'missing':tch===0?'zero':tch>0?'usable':'invalid';
 return {active,milling,conflict,status,usable:status==='usable',area:active?r.inventoryArea:0,validArea:status==='usable'?r.inventoryArea:0};
}
const sources=[];let matrix;
for(const file of [extract,complete]){
 const bytes=fs.readFileSync(file),sheets=workbookSheets(X.read(bytes,{type:'buffer',cellNF:true,cellFormula:true}),X);
 const candidates=E.inspectSheets(sheets).candidates.filter(c=>c.inventory);
 // Compare the equivalent official inventory in both sources, not a plan or projection.
 const candidate=candidates.find(c=>c.rows===1046&&c.mapping.estimateTch>=0&&c.mapping.classification>=0);
 if(!candidate)throw Error('Official inventory not uniquely identifiable: '+file);
 const parsed=E.parseCandidate(sheets,candidate,{file:path.basename(file),sha256:sha(bytes),season:'26/27'});
 const generation=E.prepareUpdate(previous,parsed,{dataVersion:'2026.10.24-aforo.9001',importedAt:'2026-10-25T00:00:00Z'});
 const rows=generation.catalog.map(r=>({id:r.codLote,code:r.code,lot:r.suerte,name:r.name,zone:r.zona,classification:r.classification,
  destination:r.destino,area:r.inventoryArea,estimateTch:r.forecast?.tch??null,previousTch:r.tch,administrativeState:r.operationalState,
  sourcePresence:r.sourcePresence,sourceRow:r.source?.row,previous:{active:r.participatesCurrentArea,milling:r.participatesMilling,tons:r.millingEstimatedTons},proposed:proposed(r)}));
 const canonical=rows.map(({sourceRow,...r})=>r);
 if(matrix&&JSON.stringify(matrix.map(({sourceRow,...r})=>r))!==JSON.stringify(canonical))throw Error('Official workbooks differ in the participation matrix.');
 matrix=rows;
 sources.push({file,sha256:sha(bytes),sheet:candidate.sheetName,headerRow:candidate.headerRow+1,totals:generation.totals,
  issues:generation.issues.filter(i=>['destination-conflict','no-cane-area'].includes(i.code))});
}
function summarize(rows){
 const t={catalog:rows.length,inventory:0,active:0,seed:0,milling:0,usable:0,missing:0,zero:0,conflict:0,excludedMilling:0,
  inventoryArea:0,activeArea:0,seedArea:0,millingArea:0,validArea:0,pendingArea:0,excludedMillingArea:0,tons:0,zeroArea:0,zeroTch:0,missingTch:0};
 for(const r of rows){const p=r.proposed;if(r.sourcePresence==='present'){t.inventory++;t.inventoryArea+=r.area;t.zeroArea+=Number(r.area===0);t.zeroTch+=Number(r.estimateTch===0);t.missingTch+=Number(r.estimateTch===null);}
  if(p.active){t.active++;t.activeArea+=p.area;}if(p.active&&r.classification==='Semilla'){t.seed++;t.seedArea+=p.area;}
  if(p.conflict)t.conflict++;
  if(p.milling){t.milling++;t.millingArea+=p.area;if(p.status==='missing')t.missing++;if(p.status==='zero')t.zero++;
   if(p.usable){t.usable++;t.validArea+=p.area;t.tons+=p.area*r.estimateTch;}else t.pendingArea+=p.area;
  }else{t.excludedMilling++;if(r.sourcePresence==='present')t.excludedMillingArea+=r.area;}
 }
 return {...t,tch:t.validArea?t.tons/t.validArea:null,coverage:t.millingArea?t.validArea/t.millingArea:null};
}
const farms=[...new Set(matrix.map(r=>r.code))].map(code=>{const rows=matrix.filter(r=>r.code===code);return {code,name:rows[0].name,engine:{catalog:rows.length,active:rows.filter(r=>r.previous.active).length,milling:rows.filter(r=>r.previous.milling).length,validArea:rows.filter(r=>r.previous.tons!=null).reduce((n,r)=>n+r.area,0),tons:rows.reduce((n,r)=>n+(r.previous.tons||0),0)},independent:summarize(rows)};});
const zones=[...new Set(matrix.map(r=>r.zone))].map(zone=>({zone,after:summarize(matrix.filter(r=>r.zone===zone))}));
const report={sources,summary:summarize(matrix),farms,zones,review:matrix.filter(r=>r.proposed.conflict||(r.area>0&&['missing','zero','invalid'].includes(r.proposed.status))),matrix};
fs.writeFileSync(path.join(out,prefix+'.json'),JSON.stringify(report,null,2),{flag:'wx'});
const q=v=>'"'+String(v??'').replaceAll('"','""')+'"';
fs.writeFileSync(path.join(out,prefix+'-matriz.csv'),['CodSuerte,Hacienda,Suerte,Clasificacion,Destino,Area_ha,TCH_estimado,Estado_administrativo,Presencia,Activa,Molienda_clasificada,Estimacion_utilizable,Motivo',...matrix.map(r=>[r.id,r.code,r.lot,r.classification,r.destination,r.area,r.estimateTch,r.administrativeState,r.sourcePresence,r.proposed.active,r.proposed.milling,r.proposed.usable,r.proposed.status+(r.proposed.conflict?' · Clasificación/destino por validar':'')].map(q).join(','))].join('\r\n'),{flag:'wx'});
console.log(JSON.stringify({sources:sources.map(({totals,issues,...s})=>s),summary:report.summary,review:report.review,discrepancies:farms.filter(f=>Math.abs(f.engine.validArea-f.independent.validArea)>1e-8||Math.abs(f.engine.tons-f.independent.tons)>1e-8)},null,2));
