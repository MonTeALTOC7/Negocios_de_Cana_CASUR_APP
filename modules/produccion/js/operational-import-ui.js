import '../../../core/imports/operational-import.js';
import {workbookSheets} from '../../../core/imports/workbook-reader.js';
import {loadProduccionDataset,loadOperationalPrevious,commitOperationalDataset,restoreOperationalPrevious} from '../../../core/shared-data/master-store.js';
import {buildMaestroCentralFromReportRows,parseMaestroVersion} from '../../../master/adapters/master-to-riego-adapter.js';

const engine=globalThis.CASUR_OPERATIONAL_IMPORT,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const section=document.getElementById('masterUpdateSection');
const fmt=v=>v==null?'N/D':Number(v).toLocaleString('es-NI',{minimumFractionDigits:2,maximumFractionDigits:2});
let sheets=[],inspection=null,source=null,proposal=null,base=null,basePayload=null,expectedVersion=null,revision=0,busy=false,stagingDirty=false;
const allowed=()=>section&&!section.classList.contains('is-locked');
const currentRecords=()=>window.CRONO_DATA.producers.flatMap(p=>p.details.map(r=>({...r,code:r.code||p.code,name:r.name||p.name})));
const rowFor=r=>({'Hac-Sue':r.codLote,Cod:r.code,Hacienda:r.name,Suerte:r.suerte,Area:r.area,Variedad:r.variedad,Edad:r.edadExcel,
  TCH_Z2526:r.tch,TCH_Estimado_Z2627:r.tchEst2627,Ton_Estimadas_Z2627:r.tonEst2627,'#_de_Corte':r.corte,Surco:r.surco,Textura:r.textura,
  'F. Ult. Cte':r.fUltCte,'F. Siembra':r.fSiembra,Km:r.distancia,Destino:r.destino,Tenencia:r.tenencia,Tipo_de_Riego:r.tipoRiego,
  '#_de_Riegos':r.numeroRiegos,ERP:r.erp,ZONA:r.zona,Estado:r.estado});
const clone=v=>JSON.parse(JSON.stringify(v));
function baselinePayload(){return {dataVersion:window.CRONO_DATA.meta.dataVersion||'baseline',reportRows:currentRecords().map(rowFor),
  operationalDataset:{contractVersion:1,baseline:true,catalog:currentRecords(),cronologico:clone(window.CRONO_DATA)}};}
function applyView(payload){
  const result=window.CASUR_APPLY_REPORT_ROWS(payload);
  if(!result?.applied)throw Error(result?.error||'No se pudo mostrar la generación');
  window.__CRONO_ZONE_ROWS=null;
  window.CASUR_OPERATIONAL_LOCAL=!payload.operationalDataset?.baseline;
  window.renderCronoHome?.();
  document.dispatchEvent(new CustomEvent('casur-crono-effective-change'));
}
function message(text,error=false){const node=document.getElementById('operationalMessage');node.textContent=text;node.setAttribute('role',error?'alert':'status');}
function invalidate(){proposal=null;document.getElementById('operationalApply').disabled=true;document.getElementById('operationalApproval').checked=false;}
function candidate(){const value=document.getElementById('operationalSheet').value;return value===''?null:inspection?.candidates[Number(value)];}
function showMapping(){
  invalidate();const c=candidate(),node=document.getElementById('operationalMapping');if(!c){node.replaceChildren();return;}
  node.innerHTML=Object.keys(engine.aliases).map(field=>`<label>${esc(engine.aliases[field][0])}<select data-operational-field="${field}" aria-label="Mapeo ${esc(engine.aliases[field][0])}"><option value="-1">No aportado</option>${c.headers.map((h,i)=>h==null?'':`<option value="${i}" ${c.mapping[field]===i?'selected':''}>${i+1} · ${esc(h)}</option>`).join('')}</select></label>`).join('');
  node.querySelectorAll('select').forEach(s=>s.addEventListener('change',invalidate));
  message(`${c.profiles.join(' · ')} · ${c.rows} identidades. Revise los campos y concilie; aún no se aplicaron datos.`);
}
async function loadFile(file){
  if(!allowed())throw Error('Desbloquee el Centro Maestro antes de importar');
  if(busy)throw Error('Hay una operación en curso');
  const token=++revision;stagingDirty=true;invalidate();message('Leyendo estructura y contenido del libro…');
  document.dispatchEvent(new CustomEvent('casur-operational-preview'));
  if(!window.XLSX)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='vendor/xlsx.bundle.js';s.onload=resolve;s.onerror=()=>reject(Error('SheetJS local no disponible'));document.head.append(s);});
  const bytes=await file.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  const book=window.XLSX.read(bytes,{type:'array',cellDates:false,cellNF:true,cellFormula:true});
  if(token!==revision)return;
  sheets=workbookSheets(book,window.XLSX);inspection=engine.inspectSheets(sheets);
  source={file:file.name,sha256:hash};
  const stored=await loadProduccionDataset();if(token!==revision)return;
  expectedVersion=stored?.payload?.dataVersion||null;basePayload=stored?.payload||baselinePayload();base=clone(currentRecords().map(r=>({...r,dataVersion:r.dataVersion||window.CRONO_DATA.meta.dataVersion||'baseline'})));
  const date=sheets.flatMap(s=>s.rows.slice(0,4).flat()).find(v=>typeof v==='string'&&/version del \d{1,2}\.\d{1,2}\.\d{4}/i.test(v));
  const match=date?.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);source.sourceDate=match?engine.dateValue(`${match[1]}/${match[2]}/${match[3]}`).iso:null;
  const season=sheets.flatMap(s=>s.rows.slice(0,4).flat()).map(v=>typeof v==='string'?v:'').join(' ').match(/(?:z\.?|zafra)\s*20(\d{2})\s*[-–]\s*(?:20)?(\d{2})/i);
  source.season=season?`${season[1]}/${season[2]}`:null;
  if(!source.season){const header=sheets.flatMap(s=>s.rows.slice(0,50)).flat().find(v=>/^acttch\d{4}$/.test(engine.norm(v)));const m=engine.norm(header).match(/(\d{2})(\d{2})$/);if(m)source.season=m[1]+'/'+m[2];}
  document.getElementById('operationalSeason').value=source.season||'';
  const selector=document.getElementById('operationalSheet');
  selector.innerHTML='<option value="">Elegir esquema del inventario…</option>'+inspection.candidates.map((c,i)=>`<option value="${i}" ${c.inventory?'':'disabled'}>${esc(c.sheetName)} · fila ${c.headerRow+1} · ${c.profiles.join('/')} · ${c.rows} filas${c.inventory?'':' (referencia)'}</option>`).join('');
  const eligible=inspection.candidates.map((c,i)=>c.inventory?i:null).filter(i=>i!==null);
  if(eligible.length===1)selector.value=String(eligible[0]);
  const plan=document.getElementById('operationalPlan');
  plan.innerHTML='<option value="">Sin líneas adicionales de plan</option>'+inspection.candidates.map((c,i)=>c.mapping.lineId>=0&&c.profiles.includes('plan')?`<option value="${i}">${esc(c.sheetName)} · ${c.rows} líneas (referencia)</option>`:'').join('');
  showMapping();if(eligible.length!==1)message('Hay varios esquemas posibles o ninguno válido. Elija y mapee explícitamente; no se aplicó ningún dato.');
  // Retire the old preview so its apply button cannot apply a previously selected file.
  document.getElementById('operationalResults').replaceChildren();
  document.getElementById('operationalVersion').value=new Date().toISOString().slice(0,10).replaceAll('-','.')+'-aforo.'+Date.now();
}
function reconcile(){
  if(!allowed())throw Error('Centro Maestro bloqueado');invalidate();
  stagingDirty=true;
  const c=candidate();if(!c||!c.inventory)throw Error('Elija un inventario validable; un plan o histórico no sustituye al Maestro');
  const overrides=Object.fromEntries([...document.querySelectorAll('[data-operational-field]')].map(s=>[s.dataset.operationalField,Number(s.value)]));
  source={...source,sheet:c.sheetName,headerRow:c.headerRow+1};
  source.season=document.getElementById('operationalSeason').value.trim()||null;
  const season=source.season?.match(/^(\d{2})\/(\d{2})$/);
  if(c.mapping.estimateTch>=0&&(!season||Number(season[2])!==(Number(season[1])+1)%100))throw Error('Indique la zafra de los estimados, por ejemplo 26/27.');
  const parsed=engine.parseCandidate(sheets,c,source,overrides),version=document.getElementById('operationalVersion').value.trim();
  if(!parseMaestroVersion(version))throw Error('Versión de datos inválida; utilice AAAA.MM.DD-aforo.NNNN.');
  let extraPlan=null;const planValue=document.getElementById('operationalPlan').value;
  if(planValue!==''){
    const pc=inspection.candidates[Number(planValue)];extraPlan=engine.parseCandidate(sheets,pc,source);
    parsed.issues.push(...extraPlan.issues);
  }
  const errors=parsed.issues.filter(i=>i.level==='error');
  if(errors.length){renderIssues(parsed.issues);throw Error(`${errors.length} errores críticos. Corrija el mapeo o el archivo; no se puede aplicar.`);}
  proposal=engine.prepareUpdate(base,parsed,{dataVersion:version});
  engine.attachHarvestPlan(proposal,extraPlan?.records||[]);
  const crono=window.CASUR_BUILD_CRONO_DATA(proposal.catalog,source.file);
  crono.meta={...crono.meta,source:source.file,sheet:c.sheetName,rows:proposal.catalog.length,rawRows:parsed.records.length,sourceProfiles:parsed.profiles,
    rule:'Catálogo permanente; área activa de Molienda/Semilla; estimado de molienda separado del TCH ejecutado.',
    tchEst2627EffectiveDate:source.season==='26/27'?source.sourceDate:null,estimateSeason:source.season,
    dataVersion:version,sourceSha256:source.sha256,generated:source.sourceDate,publishedAt:null,
    importedAt:proposal.importedAt,operationalContract:1,previousDataVersion:basePayload.dataVersion,manualChanges:false};
  crono.operational={totals:proposal.totals,harvestLines:proposal.harvestLines,planAudit:proposal.planAudit};
  proposal.catalog.forEach(r=>{r.tchEst2627Fecha=r.tchEst2627!==null?source.sourceDate:null;r.tchEst2627Fuente=r.tchEst2627!==null?source.file:null;});
  proposal.cronologico=crono;
  const t=proposal.totals,counts=kind=>new Set(proposal.differences.filter(d=>d.kind===kind).map(d=>d.key)).size;
  document.getElementById('operationalResults').innerHTML=`<p><b>${t.inventoried} inventariadas · ${t.catalog} en catálogo · ${t.active} activas · ${t.absent} ausentes</b></p>
    <p>Área inventariada: <b>${fmt(t.inventoryArea)} ha</b> · Área activa: <b>${fmt(t.activeArea)} ha</b> · Molienda: <b>${fmt(t.millingArea)} ha</b></p>
    <p>Toneladas con estimado utilizable: <b>${t.usable?fmt(t.millingTons):'N/D'} t</b> · TCH: <b>${fmt(t.millingTch)}</b> · Cobertura área válida: <b>${fmt(t.millingCoverage==null?null:t.millingCoverage*100)}%</b></p>
    <p>${t.usable}/${t.milling} suertes de molienda con estimado · ${fmt(t.validMillingArea)} ha utilizables · ${fmt(t.pendingMillingArea)} ha pendientes (${t.missing} sin estimado, ${t.zero} con cero explícito). ${t.conflicts} contradicciones de clasificación/destino por validar.</p>
    <p>${counts('new')} altas · ${counts('reactivated')} reincorporaciones · ${counts('change')} suertes modificadas (${proposal.differences.filter(d=>d.field==='inventoryArea').length} cambios de área). ${proposal.harvestLines.length} líneas de plan de referencia; no suman otra vez el inventario.</p>
    <small>Deslice la tabla horizontalmente para ver todas las columnas.</small>
    <div class="operational-scroll" tabindex="0" aria-label="Deslice para revisar la conciliación"><table><thead><tr><th>CodSuerte</th><th>Clase</th><th>Área origen ha</th><th>Área activa ha</th><th>Estado</th></tr></thead><tbody>${proposal.catalog.map(r=>`<tr><td>${esc(r.codLote)}</td><td>${esc(r.classification||'N/D')}</td><td>${fmt(r.inventoryArea)}</td><td>${fmt(r.area)}</td><td>${esc(r.operationalState)}</td></tr>`).join('')}</tbody></table></div>
    <details><summary>Calidad, diferencias y procedencia (${proposal.issues.length} avisos)</summary><div id="operationalIssues"></div><pre>${esc(JSON.stringify({source,planAudit:proposal.planAudit,differences:proposal.differences},null,2))}</pre></details>`;
  renderIssues(proposal.issues);message('Conciliación lista. Revise clases, ausencias y advertencias antes de aprobar. Los totales calculados no son una publicación oficial.');
}
function renderIssues(issues){
  let node=document.getElementById('operationalIssues');
  if(!node){node=document.createElement('div');node.id='operationalIssues';document.getElementById('operationalResults').replaceChildren(node);}
  node.innerHTML=issues.length?'<ul>'+issues.map(i=>`<li>${esc(i.level)} · ${esc(i.key||'')} ${esc(i.message)}</li>`).join('')+'</ul>':'Sin incidencias de validación.';
}
async function apply(){
  if(!allowed()||!proposal||!document.getElementById('operationalApproval').checked||busy)throw Error('Primero concilie y apruebe explícitamente');
  busy=true;document.getElementById('operationalApply').disabled=true;
  try{
    const payload={dataVersion:proposal.dataVersion,meta:proposal.cronologico.meta,reportRows:proposal.catalog.map(rowFor),operationalDataset:clone(proposal)};
    const central=buildMaestroCentralFromReportRows(payload.reportRows,{dataVersion:payload.dataVersion,generatedAt:proposal.importedAt});
    const baselineMaster=buildMaestroCentralFromReportRows(basePayload.reportRows||[],{dataVersion:basePayload.dataVersion,generatedAt:proposal.importedAt});
    if(!central)throw Error('No se pudo construir el Maestro Central; no se aplicó ningún dato.');
    await commitOperationalDataset(payload,{approved:true,expectedVersion,baseline:basePayload,maestro:central,baselineMaestro:baselineMaster});
    applyView(payload);expectedVersion=payload.dataVersion;basePayload=payload;base=clone(currentRecords());stagingDirty=false;invalidate();message('Generación aprobada aplicada en este dispositivo. La versión anterior está disponible para recuperación. No se publicó en GitHub.');
  }finally{busy=false;}
}
async function restore(){
  if(!allowed()||busy)throw Error('Centro Maestro bloqueado u ocupado');
  const previous=await loadOperationalPrevious(),current=await loadProduccionDataset();if(!previous?.payload?.production)throw Error('No hay una versión anterior');
  if(!window.confirm('¿Recuperar la generación '+previous.payload.production.dataVersion+'? Se conservará la actual como respaldo.'))return;
  busy=true;
  try{const payload=await restoreOperationalPrevious({approved:true,expectedVersion:current?.payload?.dataVersion||null});applyView(payload);revision++;expectedVersion=payload.dataVersion;basePayload=payload;base=clone(currentRecords());stagingDirty=false;invalidate();message('Versión anterior recuperada; Histórico y datos de otros módulos intactos.');}
  finally{busy=false;}
}
if(section){
  const panel=document.createElement('section');panel.className='operational-import no-print export-excluded';panel.dataset.exportExclude='true';
  panel.innerHTML=`<h3>Actualización por contenido · Maestro y aforo</h3><p>El archivo permanece en este dispositivo. Elegirlo no cambia los datos. Las suertes ausentes continúan en el catálogo.</p>
    <label>Archivo Excel <input id="operationalFile" type="file" accept=".xlsx,.xls,.xlsm"></label>
    <label>Esquema detectado <select id="operationalSheet"><option value="">Seleccione un archivo</option></select></label>
    <label>Líneas de plan opcionales <select id="operationalPlan"><option value="">Sin líneas adicionales de plan</option></select></label>
    <details><summary>Campos reconocidos y mapeo explícito</summary><div id="operationalMapping"></div></details>
    <label>Versión de datos <input id="operationalVersion" autocomplete="off"></label>
    <label>Zafra de los estimados <input id="operationalSeason" placeholder="26/27" autocomplete="off"></label>
    <button id="operationalReconcile" type="button" class="btn btn-light">Conciliar y previsualizar</button>
    <button id="operationalCancel" type="button" class="btn btn-light">Descartar previsualización</button>
    <div id="operationalMessage" role="status"></div><div id="operationalResults"></div>
    <label><input id="operationalApproval" type="checkbox"> Revisé los campos, las incidencias y las reglas: Molienda/Semilla suman área activa; solo Molienda suma estimado. Apruebo esta generación local.</label>
    <button id="operationalApply" type="button" class="btn btn-primary" disabled>Aplicar generación aprobada</button>
    <button id="operationalRestore" type="button" class="btn btn-light">Recuperar versión anterior</button>`;
  const host=section.querySelector('.accordion-body')||section;host.prepend(panel);
  const style=document.createElement('style');style.textContent='.operational-import{padding:14px;border:1px solid #bed2c5;border-radius:12px;margin-bottom:16px}.operational-import label{display:block;margin:10px 0}.operational-import input:not([type=checkbox]),.operational-import select{max-width:100%;padding:7px;box-sizing:border-box}.operational-import button{margin:5px 5px 5px 0}.operational-import pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:250px;overflow:auto}#operationalMapping{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}#operationalMapping select{width:100%}.operational-scroll{overflow:auto;max-height:340px;border:1px solid #ccc}.operational-scroll table{border-collapse:collapse;white-space:nowrap;width:100%}.operational-scroll td,.operational-scroll th{padding:7px;border-bottom:1px solid #ddd}.operational-scroll th{position:sticky;top:0;background:#edf5ef;color:#173c29}@media print{.operational-import{display:none!important}}';document.head.append(style);
  const safe=fn=>async event=>{try{await fn(event);}catch(error){message(error.message,true);}};
  document.getElementById('operationalFile').addEventListener('change',safe(e=>e.target.files[0]&&loadFile(e.target.files[0])));
  document.getElementById('operationalSheet').addEventListener('change',showMapping);
  document.getElementById('operationalPlan').addEventListener('change',invalidate);
  document.getElementById('operationalVersion').addEventListener('input',invalidate);
  document.getElementById('operationalSeason').addEventListener('input',invalidate);
  document.getElementById('operationalReconcile').addEventListener('click',safe(reconcile));
  document.getElementById('operationalApproval').addEventListener('change',e=>{document.getElementById('operationalApply').disabled=!proposal||!e.target.checked;});
  document.getElementById('operationalApply').addEventListener('click',safe(apply));
  document.getElementById('operationalRestore').addEventListener('click',safe(restore));
  document.getElementById('operationalCancel').addEventListener('click',safe(()=>{
    if(busy)throw Error('Espere a que termine la transacción');
    revision++;invalidate();stagingDirty=false;sheets=[];inspection=null;source=null;
    document.getElementById('operationalResults').replaceChildren();document.getElementById('operationalMapping').replaceChildren();
    for(const id of ['operationalFile','masterCronoFile'])document.getElementById(id).value='';
    message('Previsualización descartada. El dataset actual no cambió.');
  }));
  const bridge=window.CASUR_MODULE_BRIDGE;
  if(bridge)window.CASUR_MODULE_BRIDGE=Object.freeze({...bridge,async checkpoint(reason){
    if(busy||stagingDirty)return {ok:false,status:'operational-import-pending'};
    return bridge.checkpoint(reason);
  }});
  // Migrate the legacy full import entry; patch/historical routes keep their explicit contracts.
  window.CASUR_READ_OPERATIONAL_WORKBOOK=loadFile;
  const previousRead=window.masterReadCronoExcel,previousMode=window.masterSetMode;let mode='full';
  const previousApply=window.casurApplyImportedExcel;
  window.masterSetMode=value=>{mode=value;return previousMode?.(value);};
  window.masterReadCronoExcel=file=>['patch','hist'].includes(mode)?previousRead?.(file):loadFile(file).catch(error=>message(error.message,true));
  window.casurApplyImportedExcel=()=>['patch','hist'].includes(mode)?previousApply?.():apply().catch(error=>message(error.message,true));
  if(sessionStorage.getItem('casur-operational-open')==='1'){
    sessionStorage.removeItem('casur-operational-open');
    if(document.readyState==='complete')window.goMasterModule?.();else window.addEventListener('load',()=>window.goMasterModule?.(),{once:true});
  }
}
