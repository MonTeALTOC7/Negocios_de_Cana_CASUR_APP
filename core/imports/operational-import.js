/* Shared, data-only contract. No DOM, file names, SheetJS dependency or official data. */
(function(root){
  'use strict';
  const norm=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const text=value=>String(value??'').trim();
  const number=value=>{
    if(value==null||text(value)==='')return null;
    if(!['number','string'].includes(typeof value))return null;
    if(typeof value==='number')return Number.isFinite(value)?value:null;
    const s=text(value).replace(/\s/g,'');
    const n=Number(/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)?s.replace(/,/g,''):/^[-+]?\d+,\d+$/.test(s)?s.replace(',','.'):s);
    return Number.isFinite(n)?n:null;
  };
  const identity=(code,lot)=>({code:text(code).replace(/\.0+$/,'').toUpperCase(),lot:text(lot).replace(/\.0+$/,'').toUpperCase()});
  const keyOf=(code,lot)=>{const id=identity(code,lot);return id.code+id.lot;};
  const validId=(code,lot)=>/^\d+$/.test(text(code))&&Number(code)>0&&/^\d+[A-Z]*$/.test(text(lot));
  const clone=value=>JSON.parse(JSON.stringify(value));
  const aliases={
    code:['Cod. Hacienda','CodHacienda','Código hacienda','Código finca','Cod'],
    lot:['Ste','Suerte','Lote'],name:['Nombre Hacienda','NomHacienda','Nombre finca','Hacienda'],
    area:['Area Ha','Área vigente','Área','Area'],combined:['CodSuerte','Hac-Sue','HHHSSS','HHHSS'],
    classification:['Clasificacion','Clasificación zafra'],destination:['Nombre Destino del Cultivo','Destino'],
    estimateTch:['actTCH_2627','actTCH','TCH_Estimado_Z2627','TCH estimado'],
    estimateTons:['Toneladas','Ton_Estimadas_Z2627','Ton estimadas'],
    previousTch:['Tch.Ant','TCH_Z2526','TCH anterior'],variety:['Variedad'],cut:['NC','#_de_Corte','NumeroCorte'],
    sowing:['F. Siembra','Fecha siembra'],lastCut:['F. Ult. Cte','Fecha ultimo corte'],
    km:['Km','Dt'],spacing:['Surco'],texture:['Nombre Textura','Textura'],zone:['Zona'],
    irrigation:['TipoRiego','Tipo_de_Riego','Tipo de riego'],irrigationCount:['NR','#_de_Riegos'],
    tenure:['Tn','Tenencia'],erp:['ERP'],cropType:['Nombre Tipo de Cultivo','TipoCultivo'],age:['Edad'],
    proposedDate:['Fecha propuesta de Cosecha','Fecha propuesta (Plan 601K)','Fecha propuesta','Fecha prevista de cosecha','Fecha prevista de corte'],proposedCut:['Tipo de Corte (Plan 601K)','Tipo de Corte'],
    baseDate:['Fecha-maestro','Fecha base'],projectedAge:['Edad corte (meses)','Edad proyectada'],
    lineId:['ID Línea'],fraction:['% de la suerte'],split:['Fraccionada'],lineTons:['Ton propuesta'],
    season:['Zafra'],historicalTons:['Ton'],katm:['KATM','Rto'],
  };
  const classes={'molienda':'Molienda','semilla':'Semilla','investigacion':'Investigación','bajarentabilidad':'Baja rentabilidad','sincana':'Sin Caña'};
  function dateValue(value){
    let iso=null;
    if(value instanceof Date&&!isNaN(value))iso=value.toISOString().slice(0,10);
    else if(typeof value==='number'&&Number.isFinite(value)&&value>=1&&value<=2958465){
      const day=Math.floor(value);if(day!==60)iso=new Date(Date.UTC(1899,11,31)+(day-(day>60?1:0))*86400000).toISOString().slice(0,10);
    }else{
      let m=text(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
      if(m)iso=`${m[1]}-${m[2]}-${m[3]}`;
      else if((m=text(value).match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)))iso=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
      if(iso){const d=new Date(iso+'T00:00:00Z');if(isNaN(d)||d.toISOString().slice(0,10)!==iso)iso=null;}
    }
    return {raw:value instanceof Date?value.toISOString():value??null,type:value instanceof Date?'date':typeof value,iso};
  }
  function profiles(mapping){
    const has=(...fields)=>fields.every(field=>Number.isInteger(mapping[field])&&mapping[field]>=0);
    const result=[];
    if(has('code','lot','area','name')&&(has('previousTch')||has('lastCut')||has('sowing')))result.push('cronologico');
    if(has('code','lot','area','estimateTch','classification'))result.push('estimados');
    if(has('code','lot','proposedDate')&&(has('lineTons')||has('proposedCut')))result.push('plan');
    if(has('code','lot','season','area')&&(has('historicalTons')||has('katm')))result.push('historico');
    return result;
  }
  function mappingFor(headers,rows){
    const mapping={},ambiguities={};
    for(const [field,names] of Object.entries(aliases)){
      let columns=[];
      // More specific aliases take precedence over generic auxiliary headings.
      for(const name of names){columns=headers.map((h,i)=>norm(h)===norm(name)?i:-1).filter(i=>i>=0);if(columns.length)break;}
      if(!columns.length&&field==='estimateTch')columns=headers.map((h,i)=>/^acttch\d{4}$/.test(norm(h))?i:-1).filter(i=>i>=0);
      if(!columns.length&&['proposedDate','proposedCut'].includes(field))columns=headers.map((h,i)=>new RegExp('^'+(field==='proposedDate'?'fechapropuesta':'tipodecorte')+'plan\\d+k$').test(norm(h))?i:-1).filter(i=>i>=0);
      if(field==='combined'&&columns.length>1&&mapping.code>=0&&mapping.lot>=0){
        columns=columns.filter(c=>{
          const sample=rows.filter(r=>validId(r[mapping.code],r[mapping.lot]));
          return sample.length>0&&sample.every(r=>text(r[c]).toUpperCase()===keyOf(r[mapping.code],r[mapping.lot]));
        });
      }
      mapping[field]=columns.length===1?columns[0]:-1;
      if(columns.length>1)ambiguities[field]=columns;
    }
    return {mapping,ambiguities};
  }
  function inspectSheets(sheets){
    const candidates=[];
    sheets.forEach((sheet,sheetIndex)=>{
      (sheet.rows||[]).slice(0,50).forEach((headers,headerRow)=>{
        const {mapping,ambiguities}=mappingFor(headers,sheet.rows.slice(headerRow+1));
        // Keep an ambiguous schema available for explicit mapping, never silently use it.
        const possible={...mapping};for(const [field,columns] of Object.entries(ambiguities))possible[field]=columns[0];
        const kinds=profiles(possible);if(!kinds.length)return;
        const body=sheet.rows.slice(headerRow+1),identities=body.filter(r=>validId(r[possible.code],r[possible.lot]));
        const areaRows=possible.area>=0?identities.filter(r=>number(r[possible.area])!==null&&number(r[possible.area])>=0).length:identities.length;
        candidates.push({sheetIndex,sheetName:sheet.name,headerRow,headers,mapping,ambiguities,profiles:kinds,
          rows:identities.length,contentValid:identities.length>0&&areaRows/identities.length>=0.95,
          inventory:false});
      });
    });
    // A harvest-line table is not an inventory, even if it also has chronological fields.
    candidates.forEach(c=>{c.inventory=c.contentValid&&c.profiles.some(k=>['cronologico','estimados'].includes(k))&&!c.profiles.includes('historico')&&c.mapping.lineId<0;});
    return {contractVersion:1,candidates,requiresChoice:candidates.filter(c=>c.inventory).length!==1};
  }
  function parseCandidate(sheets,candidate,source={},overrides={}){
    const sheet=sheets[candidate.sheetIndex];if(!sheet)throw Error('Hoja no disponible');
    const mapping={...candidate.mapping,...overrides},issues=[],records=[],seen=new Map(),lineIds=new Set();
    const suffix=norm(candidate.headers[mapping.estimateTch]).match(/(\d{2})(\d{2})$/),headerSeason=suffix&&Number(suffix[2])===(Number(suffix[1])+1)%100?`${suffix[1]}/${suffix[2]}`:null;
    if(source.season&&headerSeason&&source.season!==headerSeason)issues.push({level:'error',code:'season',message:'Zafra declarada distinta del encabezado del estimado.'});
    source={...source,season:source.season||headerSeason};
    const kinds=profiles(mapping),isPlan=mapping.lineId>=0&&kinds.includes('plan');
    if(!kinds.length)issues.push({level:'error',code:'schema',message:'Combinación de campos insuficiente.'});
    for(const field of Object.keys(candidate.ambiguities))if(!Object.hasOwn(overrides,field))issues.push({level:'error',code:'mapping',field,message:`Mapeo explícito requerido: ${field}`});
    const read=(row,field)=>mapping[field]>=0?row[mapping[field]]??null:null;
    sheet.rows.slice(candidate.headerRow+1).forEach((row,index)=>{
      const rowNumber=candidate.headerRow+index+2;
      if(!text(read(row,'code'))&&!text(read(row,'lot')))return;
      const id=identity(read(row,'code'),read(row,'lot')),key=id.code+id.lot;
      const issue=(level,code,message,field)=>issues.push({level,code,message,field,key,row:rowNumber});
      if(!validId(id.code,id.lot)){issue('error','identity','Código/suerte inválidos.');return;}
      if(id.code==='16'||/^0(?:\D|$)/.test(text(read(row,'zone')))||norm(read(row,'name')).includes('maquila'))issue('error','scope','Identidad fuera del ámbito operativo CASUR; revisar la fuente.');
      const tuple=id.code+'|'+id.lot;
      if(seen.has(key)&&(!isPlan||seen.get(key)!==tuple))issue('error','duplicate','Identidad duplicada o llave combinada ambigua.');
      seen.set(key,tuple);
      if(mapping.combined>=0&&text(read(row,'combined')).toUpperCase()!==key)issue('error','combined','CodSuerte no coincide con código y suerte.','combined');
      const fields={};for(const field of Object.keys(aliases))fields[field]=read(row,field);
      if(isPlan){if(!text(fields.lineId)||lineIds.has(text(fields.lineId)))issue('error','line-id','ID de línea de plan ausente o duplicado.');lineIds.add(text(fields.lineId));}
      for(const field of ['area','estimateTch','estimateTons','previousTch','km','irrigationCount','age','projectedAge','lineTons','fraction']){
        const raw=fields[field];fields[field]=number(raw);
        if(raw!=null&&text(raw)!==''&&(fields[field]===null||fields[field]<0))issue('error','number',`Valor inválido: ${field}`,field);
      }
      if(fields.area===null||fields.area<0)issue('error','area','Área operativa obligatoria; vacío no equivale a cero.','area');
      const classification=classes[norm(fields.classification)]||null;
      if(kinds.includes('estimados')&&!classification)issue('error','classification','Clasificación de zafra desconocida.','classification');
      if(classification&&destinationClass(fields.destination)&&destinationClass(fields.destination)!==classification)issue('warning','destination-conflict','Destino operativo y clasificación de zafra difieren.');
      if(classification==='Sin Caña'&&fields.area>0)issue('warning','no-cane-area','Sin Caña con área inventariada positiva: no suma área activa.');
      if(fields.area!==null&&fields.estimateTch!==null&&fields.estimateTons!==null&&Math.abs(fields.area*fields.estimateTch-fields.estimateTons)>0.02)issue('warning','tonnage','Toneladas de origen difieren de área × TCH.');
      const dates={};
      for(const field of ['sowing','lastCut','proposedDate','baseDate']){
        dates[field]=dateValue(fields[field]);if(fields[field]!=null&&text(fields[field])!==''&&!dates[field].iso)issue('warning','date',`Fecha no interpretable: ${field}`,field);
      }
      const projected=projectedAgeMonths(dates.proposedDate.iso,dates.baseDate.iso);
      if(projected!==null&&(projected<0||(fields.projectedAge!==null&&Math.abs(projected-fields.projectedAge)>0.1)))issue('warning','age','Edad proyectada difiere de la edad aportada o su fecha base.');
      const provenance=Object.fromEntries(Object.entries(mapping).filter(([,col])=>col>=0).map(([field,column])=>[field,{sheet:sheet.name,row:rowNumber,column:column+1,header:candidate.headers[column],raw:read(row,field),type:typeof read(row,field),formula:sheet.formulas?.[`${rowNumber}:${column+1}`]||null}]));
      records.push({key,code:id.code,lot:id.lot,fields,classification,dates,projectedAgeCalculated:projected,
        plan:{date:dates.proposedDate,cut:text(fields.proposedCut)||null,base:dates.baseDate,age:fields.projectedAge,calculatedAge:projected,
          lineId:fields.lineId??null,fraction:fields.fraction,tons:fields.lineTons,scheduled:false},
        provenance,source:{...source,sheet:sheet.name,row:rowNumber}});
    });
    if(!records.length)issues.push({level:'error',code:'empty',message:'No hay identidades válidas.'});
    // Source totals are diagnostic only: never the official numerator.
    const sourceTotals=[];
    for(const [address,formula] of Object.entries(sheet.formulas||{})){
      if(!/^SUM\([A-Z]+\d+:[A-Z]+\d+\)$/i.test(formula))continue;
      const [r]=address.split(':').map(Number),last=Number(formula.match(/\d+\)$/)?.[0].replace(/\D/g,''));
      if(r<candidate.headerRow+1&&last<Math.max(...records.map(rec=>rec.source.row))){
        issues.push({level:'warning',code:'source-total-range',message:'Una fórmula de total no incluye la última fila: '+formula});sourceTotals.push({address,formula});
      }
    }
    return {contractVersion:1,profiles:kinds,isPlan,records,issues,source,sourceTotals,mapping};
  }
  const destinationClass=value=>norm(value).startsWith('semilla')?'Semilla':classes[norm(value)]||null;
  function projectedAgeMonths(proposed,base){
    const end=dateValue(proposed).iso,start=dateValue(base).iso;
    return end&&start?(Date.parse(end)-Date.parse(start))/86400000/30.4375:null;
  }
  function decisionMatches(r,d){
    const expected=d?.expectedSource;
    return !!(expected&&r.sourcePresence==='present'&&d.key===r.codLote&&d.season===r.forecast?.season&&
      d.sourceSha256===r.source?.sha256&&d.dataVersion===r.dataVersion&&['Molienda','Semilla'].includes(d.destination)&&
      expected.classification===r.classification&&expected.destination===r.destino&&
      Math.abs(expected.area-(number(r.inventoryArea)??-1))<0.000001&&expected.tch===number(r.forecast?.tch));
  }
  function applyDecisions(r,decisions=[]){
    const candidates=decisions.filter(d=>d.key===r.codLote&&d.season===r.forecast?.season&&d.sourceHashes?.includes(r.source?.sha256))
      .map(d=>({...clone(d),sourceSha256:r.source.sha256,dataVersion:r.dataVersion})).filter(d=>decisionMatches(r,d));
    if(candidates.length>1)throw Error('Decisiones operativas ambiguas: '+r.codLote);
    const next={...r};delete next.operationalDecision;
    if(candidates.length)next.operationalDecision=candidates[0];
    return next;
  }
  // Participation is derived; neither the source classification nor its zero/null is changed.
  function participation(r){
    const present=r.sourcePresence==='present',inventoryArea=number(r.inventoryArea)??number(r.area)??0;
    const retired=(r.operationalState||r.estado)==='Baja definitiva';
    const decision=decisionMatches(r,r.operationalDecision)?r.operationalDecision:null;
    const operationalDestination=decision?.destination||r.classification;
    const active=present&&!retired&&inventoryArea>0&&['Molienda','Semilla'].includes(operationalDestination);
    const milling=active&&operationalDestination==='Molienda',tch=number(r.forecast?.tch);
    const destination=destinationClass(r.destino),conflict=!!(destination&&r.classification&&destination!==r.classification);
    const usable=milling&&tch>0;
    const status=!present?'absent':retired?'retired':!active?'excluded':!milling?'seed':tch===null?'missing':tch===0?'zero':tch<0?'invalid':'usable';
    const reason=({absent:'Ausente del inventario actual · Solo referencia',retired:'Baja definitiva · No participa',
      excluded:(r.classification||'Fuera de producción')+' · No participa en molienda',seed:'Semilla · Fuera del universo de molienda',
      missing:'Pendiente de estimado · Requiere revisión',zero:'Estimado cero · Requiere revisión',invalid:'Estimado inválido · Requiere revisión',
      usable:'Molienda · Estimado utilizable'})[status]+(decision?' · Decisión operativa CASUR':conflict?' · Clasificación/destino por validar':'');
    return {active,milling,usable,status,reason,conflict,decision,operationalDestination,inventoryArea:present?inventoryArea:0,
      activeArea:active?inventoryArea:0,millingArea:milling?inventoryArea:0,validArea:usable?inventoryArea:0,
      estimateTch:usable?tch:null,estimatedTons:usable?inventoryArea*tch:null};
  }
  function totals(catalog){
    const byClass={};let inventoryArea=0,activeArea=0,millingArea=0,millingTons=0,validMillingArea=0;
    let active=0,milling=0,seed=0,usable=0,missing=0,zero=0,conflicts=0,seedArea=0,pendingConflicts=0,decisions=0;
    for(const r of catalog){
      const p=participation(r);active+=Number(p.active);milling+=Number(p.milling);seed+=Number(p.active&&!p.milling);
      usable+=Number(p.usable);missing+=Number(p.status==='missing');zero+=Number(p.status==='zero');conflicts+=Number(p.conflict);
      seedArea+=p.active&&!p.milling?p.activeArea:0;pendingConflicts+=Number(p.conflict&&!p.decision);decisions+=Number(!!p.decision);
      const group=byClass[r.classification||r.operationalState]??={count:0,area:0,tons:0};group.count++;
      inventoryArea+=p.inventoryArea;group.area+=p.inventoryArea;
      activeArea+=p.activeArea;millingArea+=p.millingArea;
      if(p.usable){millingTons+=p.estimatedTons;validMillingArea+=p.validArea;group.tons+=p.estimatedTons;}
    }
    return {catalog:catalog.length,inventoried:catalog.filter(r=>r.sourcePresence==='present').length,
      active,milling,seed,seedArea,usable,missing,zero,conflicts,pendingConflicts,decisions,pendingMillingArea:millingArea-validMillingArea,
      pendingMillingLots:milling-usable,inactive:catalog.length-active,absent:catalog.filter(r=>r.sourcePresence==='absent').length,
      inventoryArea,activeArea,millingArea,millingTons,validMillingArea,millingTch:validMillingArea?millingTons/validMillingArea:null,
      millingCoverage:millingArea?validMillingArea/millingArea:null,byClass};
  }
  function prepareUpdate(previous,parsed,{dataVersion,importedAt=new Date().toISOString(),decisions=[]}={}){
    if(!dataVersion||parsed.isPlan||parsed.profiles.includes('historico'))throw Error('Se requiere versión de datos e inventario; no aplicar plan/histórico como inventario.');
    if(parsed.issues.some(i=>i.level==='error'))throw Error('Importación con errores críticos.');
    const old=new Map(),combined=new Map();
    for(const r of previous){const code=text(r.code),lot=text(r.suerte||r.lot),key=keyOf(code,lot),tuple=code+'|'+lot;
      if(old.has(key)||combined.has(key)&&combined.get(key)!==tuple)throw Error('Catálogo anterior ambiguo');old.set(key,r);combined.set(key,tuple);}
    const catalog=[],differences=[],issues=[...parsed.issues],arrived=new Set();
    const copyFields={name:'name',variety:'variedad',previousTch:'tch',spacing:'surco',texture:'textura',zone:'zona',km:'distancia',irrigation:'tipoRiego',irrigationCount:'numeroRiegos',tenure:'tenencia',erp:'erp',cropType:'tipoCultivo',cut:'corte',age:'edadExcel',destination:'destino'};
    for(const incoming of parsed.records){
      const prev=old.get(incoming.key),record=prev?clone(prev):{},inherited={};arrived.add(incoming.key);
      if(prev&&text(prev.code)+'|'+text(prev.suerte||prev.lot)!==incoming.code+'|'+incoming.lot)throw Error('Colisión de identidad entre fuentes');
      for(const [from,to] of Object.entries(copyFields)){
        if(incoming.provenance[from])record[to]=incoming.fields[from];
        else if(prev&&Object.hasOwn(prev,to))inherited[to]={reason:'Campo no aportado por la nueva fuente',fromVersion:prev.dataVersion||'baseline'};
        else record[to]=null;
      }
      for(const [from,to] of [['sowing','fSiembra'],['lastCut','fUltCte']]){
        if(incoming.provenance[from])record[to]=incoming.dates[from].iso;
        else if(prev?.[to])inherited[to]={reason:'Fecha nueva ausente/no válida',fromVersion:prev.dataVersion||'baseline'};
      }
      const classification=incoming.classification||classes[norm(incoming.fields.destination)]||null;
      if(!classification)throw Error('Debe mapear una clasificación/destino explícito antes de aplicar.');
      const retired=(prev?.operationalState||prev?.estado)==='Baja definitiva';
      record.renovacion=['r','re','ren','renovacion'].includes(norm(record.corte));
      const productive=!retired&&['Molienda','Semilla'].includes(classification)&&incoming.fields.area>0;
      const milling=productive&&classification==='Molienda';
      const compatible=parsed.source.season==='26/27';
      const next=applyDecisions({...record,code:incoming.code,suerte:incoming.lot,codLote:incoming.key,permanentIdentity:{code:incoming.code,lot:incoming.lot},
        inventoryArea:incoming.fields.area,area:productive?incoming.fields.area:0,millingArea:milling?incoming.fields.area:0,
        participatesCurrentArea:productive,participatesMilling:milling,sourcePresence:'present',classification,
        operationalState:retired?'Baja definitiva':classification,estado:retired?'Baja definitiva':classification,
        sourceTonnage:incoming.fields.estimateTons,tchEst2627:milling&&compatible?incoming.fields.estimateTch:null,
        tonEst2627:milling&&compatible&&incoming.fields.estimateTch!==null?incoming.fields.area*incoming.fields.estimateTch:null,
        millingEstimatedTons:milling&&incoming.fields.estimateTch!==null?incoming.fields.area*incoming.fields.estimateTch:null,
        dataVersion,plan:incoming.plan,source:incoming.source,provenance:incoming.provenance,inherited,
        forecast:{season:parsed.source.season||null,area:incoming.fields.area,tch:incoming.fields.estimateTch,tons:incoming.fields.estimateTons,classification,source:incoming.source},
        fBase:record.renovacion?record.fSiembra||null:[record.fSiembra,record.fUltCte].filter(Boolean).sort().at(-1)||null,
        changeHistory:[...(prev?.changeHistory||[]),{dataVersion,importedAt,fromVersion:prev?.dataVersion||'baseline',previousArea:prev?.inventoryArea??prev?.area??null,area:incoming.fields.area,classification}],
      },decisions);
      const participationState=participation(next);
      next.area=participationState.activeArea;next.millingArea=participationState.millingArea;
      next.participatesCurrentArea=participationState.active;next.participatesMilling=participationState.milling;
      next.millingEstimatedTons=participationState.estimatedTons;
      next.tonEst2627=compatible?participationState.estimatedTons:null;
      if(participationState.milling&&!participationState.usable)issues.push({level:'warning',code:'milling-estimate-pending',key:incoming.key,message:participationState.reason});
      if(participationState.decision)next.changeHistory.push({kind:'operational-decision',dataVersion,decision:clone(participationState.decision)});
      if(prev?.sourcePresence==='absent')differences.push({key:incoming.key,kind:'reactivated'});
      if(!prev)differences.push({key:incoming.key,kind:'new'});
      if(prev)for(const field of ['inventoryArea','name','classification','tchEst2627','tch','destino','variedad','zona','corte','tipoRiego','distancia','tenencia','fSiembra','fUltCte']){
        const before=field==='inventoryArea'?prev.inventoryArea??prev.area:prev[field],after=next[field];
        if((typeof before==='number'&&typeof after==='number')?Math.abs(before-after)>0.00001:before!==after)differences.push({key:incoming.key,kind:'change',field,before:before??null,after:after??null});
      }
      catalog.push(next);
    }
    for(const [key,prev] of old)if(!arrived.has(key)){
      const state=(prev.operationalState||prev.estado)==='Baja definitiva'?'Baja definitiva':'Ausente de la fuente';
      catalog.push({...clone(prev),inventoryArea:prev.inventoryArea??prev.area,area:0,millingArea:0,tchEst2627:null,tonEst2627:null,millingEstimatedTons:null,
        participatesCurrentArea:false,participatesMilling:false,sourcePresence:'absent',operationalState:state,estado:state,dataVersion,
        permanentIdentity:prev.permanentIdentity||{code:text(prev.code),lot:text(prev.suerte)},
        source:prev.source||{file:'Cronológico anterior',dataVersion:prev.dataVersion||'baseline'},
        inherited:{...prev.inherited,allFields:{reason:'Identidad ausente de la nueva fuente; atributos anteriores solo como referencia',fromVersion:prev.dataVersion||'baseline'}},
        changeHistory:[...(prev.changeHistory||[]),{dataVersion,importedAt,kind:'absent',fromVersion:prev.dataVersion||'baseline'}]});
      differences.push({key,kind:'absent'});
    }
    return {contractVersion:1,dataVersion,importedAt,source:parsed.source,catalog,totals:totals(catalog),differences,issues};
  }
  function validateGeneration(generation){
    if(generation?.contractVersion!==1||!generation.catalog?.length||!generation.cronologico?.producers?.length||generation.issues?.some(i=>i.level==='error'))throw Error('Generación inválida');
    const ids=new Set();for(const r of generation.catalog){
      if(!validId(r.code,r.suerte)||keyOf(r.code,r.suerte)!==r.codLote||ids.has(r.codLote)||!(r.area>=0))throw Error('Catálogo inconsistente');ids.add(r.codLote);
    }
    const actual=totals(generation.catalog);
    for(const field of ['catalog','inventoried','active','absent','inventoryArea','activeArea','millingArea','millingTons','validMillingArea'])if(Math.abs(actual[field]-generation.totals?.[field])>0.000001||!Number.isFinite(generation.totals?.[field]))throw Error('Totales no conciliados: '+field);
    if(generation.dataVersion!==generation.cronologico.meta?.dataVersion)throw Error('Versión de datos incoherente');
    return true;
  }
  function attachHarvestPlan(generation,lines){
    const catalog=new Map(generation.catalog.map(r=>[r.codLote,r])),groups=new Map();
    for(const line of lines){
      if(!catalog.has(line.key))throw Error('Línea de plan sin identidad en el catálogo: '+line.key);
      if(!groups.has(line.key))groups.set(line.key,[]);groups.get(line.key).push(line);
    }
    const split=[];let area=0,tons=0,validTons=0;
    for(const [key,parts] of groups){
      const lineArea=parts.reduce((sum,r)=>sum+(r.fields.area??0),0);area+=lineArea;
      for(const part of parts)if(part.fields.lineTons!==null){tons+=part.fields.lineTons;validTons++;}
      const fraction=parts.every(r=>r.fields.fraction!==null)?parts.reduce((sum,r)=>sum+r.fields.fraction,0):null;
      if(parts.length>1)split.push({key,lines:parts.length,area:lineArea,fraction});
      if(Math.abs(lineArea-(catalog.get(key).inventoryArea??0))>0.02||(fraction!==null&&Math.abs(fraction-1)>0.0001))generation.issues.push({level:'warning',code:'plan-coverage',key,message:'Desglose de plan y área/facción del inventario requieren conciliación.'});
    }
    generation.harvestLines=lines;
    generation.planAudit={lines:lines.length,identities:groups.size,split,area,proposedTons:validTons===lines.length&&lines.length?tons:null};
    return generation;
  }
  const api={contractVersion:1,aliases,norm,number,identity,keyOf,dateValue,projectedAgeMonths,profiles,inspectSheets,parseCandidate,prepareUpdate,applyDecisions,participation,totals,validateGeneration,attachHarvestPlan};
  root.CASUR_OPERATIONAL_IMPORT=Object.freeze(api);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
