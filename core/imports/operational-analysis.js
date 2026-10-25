import './operational-import.js';
const E=globalThis.CASUR_OPERATIONAL_IMPORT;
const finite=E.number;
const sumComplete=(rows,value)=>rows.length&&rows.every(r=>finite(value(r))!==null&&finite(value(r))>=0)?rows.reduce((n,r)=>n+finite(value(r)),0):null;

function summarize(rows,lines,rejected=[]){
 const totals=E.totals(rows),byLot=new Map();
 for(const line of lines){if(!byLot.has(line.key))byLot.set(line.key,[]);byLot.get(line.key).push(line);}
 const lots=rows.map(row=>{
  const p=E.participation(row),parts=byLot.get(row.codLote)||[];
  const invalid=rejected.some(item=>item.line.key===row.codLote);
  const planArea=invalid?null:sumComplete(parts,r=>r.fields?.area),planTons=invalid?null:sumComplete(parts,r=>r.fields?.lineTons);
  const fraction=sumComplete(parts,r=>r.fields?.fraction),warnings=[];
  if(parts.length&&planArea===null)warnings.push('Área propuesta incompleta');
  if(parts.length&&planTons===null)warnings.push('Toneladas propuestas incompletas');
  if(invalid)warnings.push('Líneas no verificables; comparación N/D');
  if(planArea!==null&&Math.abs(planArea-(row.inventoryArea??0))>0.02)warnings.push('Área del plan difiere del inventario');
  if(parts.length>1&&fraction===null)warnings.push('Fracciones incompletas');
  if(fraction!==null&&Math.abs(fraction-1)>0.0001)warnings.push('Fracciones no suman 100%');
  if(parts.some(l=>l.plan?.age!=null&&l.plan?.calculatedAge!=null&&Math.abs(l.plan.age-l.plan.calculatedAge)>0.1))warnings.push('Edad aportada y calculada difieren');
  if(parts.some(l=>l.plan?.date?.raw!=null&&!l.plan.date.iso))warnings.push('Fecha propuesta no verificable');
  if(parts.some(l=>l.plan?.calculatedAge!=null&&l.plan.calculatedAge<0))warnings.push('Fecha propuesta anterior a la base');
  const reconciled=parts.length>0&&planArea!==null&&Math.abs(planArea-(row.inventoryArea??0))<=0.02&&
    (parts.length===1&&fraction===null||fraction!==null&&Math.abs(fraction-1)<=0.0001);
  return {row,participation:p,parts,planArea,planTons,fraction,warnings,reconciled,
    deltaArea:planArea!==null&&row.sourcePresence==='present'?planArea-row.inventoryArea:null,
    deltaTons:planTons!==null&&p.estimatedTons!==null?planTons-p.estimatedTons:null};
 });
 const milling=lots.filter(l=>l.participation.milling),comparable=lots.filter(l=>l.deltaTons!==null);
 const coveredArea=milling.filter(l=>l.reconciled).reduce((n,l)=>n+l.participation.millingArea,0);
 return {totals,lots,plan:{lines:lines.length,identities:byLot.size,
  area:sumComplete(lines,l=>l.fields?.area),tons:sumComplete(lines,l=>l.fields?.lineTons),
  unplannedMilling:milling.filter(l=>!l.parts.length).length,
  plannedWithoutEstimate:milling.filter(l=>l.parts.length&&!l.participation.usable).length,
  plannedMilling:milling.filter(l=>l.parts.length).length,reconciledMilling:milling.filter(l=>l.reconciled).length,
  reconciledArea:coveredArea,coverage:totals.millingArea?coveredArea/totals.millingArea:null,
  comparableLots:comparable.length,comparableEstimatedTons:comparable.length?comparable.reduce((n,l)=>n+l.participation.estimatedTons,0):null,
  comparablePlanTons:comparable.length?comparable.reduce((n,l)=>n+l.planTons,0):null,
  deltaTons:comparable.length?comparable.reduce((n,l)=>n+l.deltaTons,0):null,
  warningLots:lots.filter(l=>l.warnings.length).length}};
}

export function buildOperationalAnalysis(data,filters={}){
 const meta=data?.meta||{},season=filters.season||meta.estimateSeason;
 const unavailable=reason=>({available:false,reason,meta,season,rows:[],lines:[],groups:{farms:[],zones:[]}});
 if(meta.operationalContract!==1)return unavailable('No hay una generación operativa cargada.');
 if(!meta.dataVersion||!meta.sourceSha256||!meta.estimateSeason)return unavailable('La generación no acredita zafra, versión o fuente.');
 if(season!==meta.estimateSeason)return unavailable('La zafra solicitada no corresponde a esta generación.');
 const all=(data.producers||[]).flatMap(p=>(p.details||[]).map(r=>({...r,code:r.code||p.code,name:r.name||p.name})));
 if(all.some(r=>r.sourcePresence==='present'&&(r.dataVersion!==meta.dataVersion||r.forecast?.season!==season||r.source?.sha256!==meta.sourceSha256)))return unavailable('Hay registros de otra zafra, generación o fuente; no se combinan.');
 const rows=all.filter(r=>(!filters.farm||r.code===filters.farm)&&(!filters.lot||r.codLote===filters.lot)&&(!filters.zone||r.zona===filters.zone));
 const ids=new Set(rows.map(r=>r.codLote)),sourceLines=data.operational?.harvestLines||[],lineIds=new Set(),rejected=[];
 const matching=sourceLines.filter(line=>{
  if(!ids.has(line.key))return false;
  if(line.source?.season!==season||line.source?.sha256!==meta.sourceSha256){rejected.push({line,reason:'Zafra/fuente de línea no coincide'});return false;}
  return true;
 });
 const duplicates=new Set();for(const line of matching){const id=String(line.fields?.lineId??'');if(!id||lineIds.has(id))duplicates.add(id);lineIds.add(id);}
 const lines=matching.filter(line=>{const id=String(line.fields?.lineId??'');if(duplicates.has(id)){rejected.push({line,reason:'ID de línea ausente o duplicado'});return false;}return true;}).map(line=>{
  const row=rows.find(r=>r.codLote===line.key),plan=line.plan||{};
  const base=plan.base?.iso?plan.base:row.plan?.base;
  const sameDate=!!plan.date?.iso&&plan.date.iso===row.plan?.date?.iso;
  const age=plan.age??(sameDate?row.plan?.age:null)??null;
  return {...line,ageSource:plan.age!=null?'Línea':age!=null?'Inventario, misma fecha':'N/D',
    baseSource:plan.base?.iso?'Línea':base?.iso?'Inventario de esta generación':'N/D',
    plan:{...plan,base:base||null,age,calculatedAge:plan.calculatedAge??E.projectedAgeMonths(plan.date?.iso,base?.iso)}};
 });
 if(new Set(all.map(r=>r.codLote)).size!==all.length)return unavailable('Identidades duplicadas en la generación.');
 const result=summarize(rows,lines,rejected);
 // Unverifiable lines are visible as rejected, never a healthy zero or a partial total.
 if(rejected.length){result.plan.area=null;result.plan.tons=null;result.plan.deltaTons=null;result.plan.coverage=null;}
 const groups=field=>[...new Set(rows.map(r=>r[field]||'Sin dato'))].map(key=>{
  const selected=rows.filter(r=>(r[field]||'Sin dato')===key),keys=new Set(selected.map(r=>r.codLote));
  const rejectedGroup=rejected.filter(item=>keys.has(item.line.key)),summary=summarize(selected,lines.filter(l=>keys.has(l.key)),rejectedGroup);
  if(rejectedGroup.length){summary.plan.area=null;summary.plan.tons=null;summary.plan.deltaTons=null;summary.plan.coverage=null;}
  return {key,name:field==='code'?selected[0].name:key,...summary};
 });
 return {available:true,meta,season,rows,lines,rejected,...result,groups:{farms:groups('code'),zones:groups('zona')}};
}
