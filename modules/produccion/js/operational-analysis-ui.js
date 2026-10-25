import {buildOperationalAnalysis} from '../../../core/imports/operational-analysis.js';
import {listOperationalGenerations} from '../../../core/shared-data/master-store.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>v==null?'N/D':Number(v).toLocaleString('es-NI',{minimumFractionDigits:2,maximumFractionDigits:2});
const date=v=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v||''))return 'N/D';const [y,m,d]=v.split('-');return `${d}-${['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][Number(m)-1]}-${y}`;};
const card=(label,value,sub='')=>`<div class="kpi"><span class="label">${esc(label)}</span><strong>${esc(value)}</strong>${sub?`<em>${esc(sub)}</em>`:''}</div>`;
const table=(headers,body)=>`<small>Deslice horizontalmente para ver todas las columnas.</small><div class="table-wrap" tabindex="0" role="region" aria-label="Tabla de consulta, desplazamiento horizontal"><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body||`<tr><td colspan="${headers.length}">Sin registros para esta consulta.</td></tr>`}</tbody></table></div>`;

export function mountOperationalAnalysis(){
 const anchor=document.getElementById('cronoContent');if(!anchor||document.getElementById('operationalAnalysis'))return;
 const panel=document.createElement('details');panel.id='operationalAnalysis';panel.className='crono-box no-print export-excluded';panel.dataset.exportExclude='true';
 panel.innerHTML=`<summary><b>Estimados y plan de cosecha · Consulta</b></summary><p>Consulta por generación y zafra. El plan es propuesto; no acredita cosecha ejecutada. Sin edición de datos.</p>
  <div class="op-analysis-filters">${[['Generation','Generación'],['Season','Zafra'],['Farm','Finca / productor'],['Lot','Suerte'],['Zone','Zona']].map(([id,label])=>`<label>${label}<select id="opAnalysis${id}" aria-label="${label} de consulta"></select></label>`).join('')}</div>
  <div class="op-analysis-tabs" role="group" aria-label="Tipo de consulta">${[['estimates','Estimados'],['plan','Plan propuesto'],['comparison','Comparación']].map(([id,label])=>`<button class="btn btn-light btn-compact" type="button" data-op-view="${id}" aria-pressed="${id==='estimates'}">${label}</button>`).join('')}</div>
  <p id="opAnalysisSource"></p><div id="opAnalysisResult" aria-live="polite"></div>`;
 anchor.after(panel);
 const cardClip=document.createElement('style');cardClip.textContent='#cronoContent>.ficha-card{overflow:clip}';document.head.append(cardClip);
 const style=document.createElement('style');style.textContent=`#operationalAnalysis{margin-top:14px;max-width:100%;min-width:0}#operationalAnalysis summary{cursor:pointer;color:#0b6031;padding:4px 0}#operationalAnalysis p,#operationalAnalysis small{overflow-wrap:anywhere}#operationalAnalysis .op-analysis-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}#operationalAnalysis label{font-size:12px;font-weight:700;min-width:0}#operationalAnalysis select{display:block;width:100%;min-width:0;border:1px solid #cbd5e1;border-radius:10px;padding:9px;background:#fff;color:#183b2a}#operationalAnalysis .op-analysis-tabs{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}#operationalAnalysis [aria-pressed=true]{background:#0b6031;color:#fff}#operationalAnalysis .kpis{grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin:10px 0}#operationalAnalysis .table-wrap{max-width:100%;margin:6px 0 12px}#operationalAnalysis .op-pager{display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:12px}#opAnalysisSource{font-size:12px;color:#526276}@media print{#operationalAnalysis{display:none!important}}`;document.head.append(style);
 const $=id=>panel.querySelector('#opAnalysis'+id),versions=new Map();let active=null,model=null,view='estimates',page=0,revision=0;
 function options(select,items,empty){const previous=select.value;select.innerHTML=`<option value="">${esc(empty)}</option>`+items.map(([value,label])=>`<option value="${esc(value)}">${esc(label)}</option>`).join('');if(items.some(([v])=>v===previous))select.value=previous;}
 function scopes(resetLot=false){
  const rows=(active?.producers||[]).flatMap(p=>p.details||[]);
  options($('Farm'),(active?.producers||[]).map(p=>[p.code,`${p.code} · ${p.name}`]),'Todas las fincas');
  if(resetLot)$('Lot').value='';
  options($('Lot'),rows.filter(r=>!$('Farm').value||r.code===$('Farm').value).map(r=>[r.codLote,`${r.code} · Suerte ${r.suerte}`]),'Todas las suertes');
  options($('Zone'),[...new Set(rows.map(r=>r.zona).filter(Boolean))].sort().map(z=>[z,z]),'Todas las zonas');
 }
 function selectVersion(){
  const raw=versions.get($('Generation').value);active=raw?window.CASUR_REFRESH_OPERATIONAL_VIEW(raw):null;
  $('Season').innerHTML=active?`<option value="${esc(active.meta.estimateSeason)}">${esc(active.meta.estimateSeason)}</option>`:'<option value="">Sin zafra</option>';
  scopes(true);page=0;render();
 }
 async function refresh(){
  const token=++revision,previous=$('Generation').value,current=window.CRONO_DATA;
  $('Result').textContent='Consultando generaciones guardadas…';
  try{
   const archived=await listOperationalGenerations();if(token!==revision)return;
   versions.clear();
   for(const payload of archived){const data=payload.operationalDataset?.cronologico;if(data?.meta?.operationalContract===1&&data.meta.dataVersion===payload.dataVersion)versions.set(payload.dataVersion,data);}
   if(current?.meta?.operationalContract===1)versions.set(current.meta.dataVersion,current);
   options($('Generation'),[...versions].map(([id,d])=>[id,`${id} · ${d.meta.estimateSeason}${id===current.meta?.dataVersion?' · actual':''}`]),'Seleccionar generación');
   $('Generation').value=versions.has(current.meta?.dataVersion)?current.meta.dataVersion:versions.has(previous)?previous:'';
   selectVersion();
  }catch(error){if(token===revision){$('Result').textContent='No se pudieron consultar las generaciones: '+error.message;$('Result').setAttribute('role','alert');}}
 }
 function groupTable(groups){return table(['Finca / zona','Molienda ha','Semilla ha','TCH estimado','Ton. estimadas','Plan comparable t','Diferencia comparable t','Plan conciliado %'],groups.map(g=>`<tr><td>${esc(g.key)} · ${esc(g.name)}</td><td>${n(g.totals.millingArea)}</td><td>${n(g.totals.seedArea)}</td><td>${n(g.totals.millingTch)}</td><td>${n(g.totals.usable?g.totals.millingTons:null)}</td><td>${n(g.plan.comparablePlanTons)}</td><td>${n(g.plan.deltaTons)}</td><td>${n(g.plan.coverage==null?null:g.plan.coverage*100)}</td></tr>`).join(''));}
 function render(){
  model=buildOperationalAnalysis(active,{farm:$('Farm').value,lot:$('Lot').value,zone:$('Zone').value,season:$('Season').value});
  if(!model.available){$('Source').textContent='';$('Result').textContent=model.reason+' Elija una generación operativa cargada y validada.';return;}
  const {totals:t,plan:p,meta}=model;
  $('Source').textContent=`Fuente: ${meta.source||'N/D'} · fecha ${date(meta.generated)} · zafra ${model.season} · generación ${meta.dataVersion}`;
  const has=model.rows.length>0;
  let html='',entries=[],headers=[];
  if(view==='estimates'){
   html=`<div class="kpis">${card('Área de molienda',has?n(t.millingArea)+' ha':'N/D')}${card('Área de Semilla',has?n(t.seedArea)+' ha':'N/D')}${card('TCH estimado',n(t.millingTch))}${card('Toneladas estimadas',n(t.usable?t.millingTons:null)+' t')}</div><p>${t.catalog} catálogo · ${t.active} activas · ${t.milling} Molienda · ${t.seed} Semilla · ${t.usable} estimados utilizables. Cobertura de molienda: ${n(t.millingCoverage==null?null:t.millingCoverage*100)}%. Inventario: ${has?n(t.inventoryArea):'N/D'} ha; activa: ${has?n(t.activeArea):'N/D'} ha. Pendientes: ${n(t.pendingMillingArea)} ha.</p>`;
   entries=model.lots;headers=['Finca','Suerte','Destino operativo','Clase de origen','Destino registrado','Área activa ha','Área molienda ha','TCH fuente','Ton. molienda','Participación'];
  }else if(view==='plan'){
   html=`<div class="kpis">${card('Área propuesta',n(p.area)+' ha','Todas las líneas de esta consulta')}${card('Toneladas propuestas',n(p.tons)+' t','Escenario propuesto, no estimado')}${card('Líneas / suertes',`${p.lines} / ${p.identities}`)}${card('Plan conciliado',n(p.coverage==null?null:p.coverage*100)+'%','Área de molienda con área/fracciones conciliadas')}</div><p>${p.unplannedMilling} suertes de molienda sin plan · ${p.plannedWithoutEstimate} planificadas sin estimado utilizable · ${p.warningLots} suertes con diferencias de cobertura.</p>`;
   html+='<small>La fecha base puede proceder del inventario de la misma generación. Una edad aportada del inventario solo se vincula cuando coincide la fecha propuesta; no se imputa a otras fracciones.</small>';
   entries=model.lines;headers=['Finca','Suerte','Línea','Fecha propuesta','Tipo de corte','Edad aportada meses','Edad calculada meses','Fecha base','Origen edad / base','Área propuesta ha','Ton. propuestas','Fracción'];
  }else{
   html=`<div class="kpis">${card('Estimado comparable',n(p.comparableEstimatedTons)+' t',`${p.comparableLots} suertes con ambos datos`)}${card('Plan comparable',n(p.comparablePlanTons)+' t','Mismas suertes de molienda')}${card('Plan − estimado',n(p.deltaTons)+' t')}${card('Plan conciliado',n(p.coverage==null?null:p.coverage*100)+'%')}</div><p>Las diferencias de toneladas usan exclusivamente las mismas suertes con ambos datos válidos. La diferencia de área compara propuesta e inventario de la identidad; no se normalizan fracciones ni se duplican superficies.</p><details><summary>Por finca / productor</summary>${groupTable(model.groups.farms)}</details><details><summary>Por zona</summary>${groupTable(model.groups.zones)}</details>`;
   entries=model.lots;headers=['Finca','Suerte','Destino operativo','Estimado t','Plan t','Plan − estimado t','Inventario ha','Plan ha','Plan − inventario ha','Revisión'];
  }
  const pages=Math.max(1,Math.ceil(entries.length/50));page=Math.min(page,pages-1);
  const body=entries.slice(page*50,(page+1)*50).map(item=>{
   let values,id;
   if(view==='plan'){
    const lot=model.lots.find(l=>l.row.codLote===item.key),f=item.fields||{};id=item.key;
    values=[`${lot?.row.code} · ${lot?.row.name}`,lot?.row.suerte,f.lineId,date(item.plan?.date?.iso),item.plan?.cut||'N/D',n(item.plan?.age),n(item.plan?.calculatedAge),date(item.plan?.base?.iso),`${item.ageSource} / ${item.baseSource}`,n(f.area),n(f.lineTons),n(f.fraction==null?null:f.fraction*100)+'%'];
   }else{const {row:r,participation:s}=item;id=r.codLote;
    values=view==='estimates'?[`${r.code} · ${r.name}`,r.suerte,s.operationalDestination,r.classification,r.destino,n(s.activeArea),n(s.millingArea),n(r.forecast?.tch),n(s.estimatedTons),s.reason]:[`${r.code} · ${r.name}`,r.suerte,s.operationalDestination,n(s.estimatedTons),n(item.planTons),n(item.deltaTons),n(r.sourcePresence==='present'?r.inventoryArea:null),n(item.planArea),n(item.deltaArea),item.warnings.join(' · ')||(!item.parts.length?'Sin planificación':'Conciliado')];
   }
   return `<tr data-op-lot="${esc(id)}">${values.map(v=>`<td>${esc(v??'N/D')}</td>`).join('')}</tr>`;
  }).join('');
  html+=table(headers,body)+`<div class="op-pager"><button type="button" class="btn btn-light btn-compact" data-op-page="-1" ${page===0?'disabled':''}>Anterior</button><span>${entries.length} registros · Página ${page+1} de ${pages}</span><button type="button" class="btn btn-light btn-compact" data-op-page="1" ${page===pages-1?'disabled':''}>Siguiente</button></div>`;
  html+=`<details><summary>Calidad y procedencia</summary><p>${t.conflicts} discrepancias de origen; ${t.decisions} decisiones operativas registradas; ${t.pendingConflicts} pendientes. ${model.rejected.length} líneas no verificables, excluidas de los totales completos. No se modifica la generación al consultar.</p>${model.rejected.length?`<ul>${model.rejected.map(r=>`<li>${esc(r.line.key)} · ${esc(r.reason)}</li>`).join('')}</ul>`:''}</details>`;
  $('Result').innerHTML=html;
 }
 panel.addEventListener('toggle',()=>{if(panel.open)refresh();});
 panel.addEventListener('change',event=>{if(event.target===$('Generation'))selectVersion();else{if(event.target===$('Farm'))scopes(true);page=0;render();}});
 panel.addEventListener('click',event=>{const tab=event.target.closest('[data-op-view]'),pager=event.target.closest('[data-op-page]');if(tab){view=tab.dataset.opView;page=0;panel.querySelectorAll('[data-op-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===tab)));render();}if(pager){page+=Number(pager.dataset.opPage);render();}});
 document.addEventListener('casur-crono-effective-change',()=>{revision++;if(panel.open)refresh();});
 window.CASUR_OPERATIONAL_ANALYSIS=Object.freeze({model:()=>model,refresh,open(){panel.open=true;}});
}
