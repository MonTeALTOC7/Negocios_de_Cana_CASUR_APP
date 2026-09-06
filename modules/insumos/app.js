/* ═══════════════════════════════════════════════════════════
   CONTROL Y SEGUIMIENTO DE INSUMOS · CASUR
   Negocios de Caña · Firma técnica CT
   ═══════════════════════════════════════════════════════════ */
'use strict';

const ADMIN_PASS = '151021';
const DB_NAME = 'insumos_casur_db';
const DB_STORE = 'kv';

const STATE = {
  meta:null, events:[], products:[], maestro:[], validaciones:{},
  eventsById:{}, prodsByEvent:{},
  scope:'productores',          // 'productores' | 'todas' | 'zona'
  scopeZone:'5',
  section:'resumen',
  admin:false,
  reviews:{},                    // { alertKey: {status, note, ts} }
  overrides:{ maestro:{} },      // manual maestro area overrides
  filters:{ explora:{search:'',productor:'',labor:'',estado:''},
            productores:{search:'',hacienda:''},
            insumos:{search:''},
            madurante:{search:'',productor:''} },
  expanded:new Set(),
  openProducers:new Set(),
  pending:null,                  // processed candidate for admin update
};

/* zona 5 = Productores (no se cobra madurante aéreo AAM) */
const ZONAS = {'1':'Sur','2':'Centro','3':'Norte','5':'Productores'};

/* ─── IndexedDB (persistencia offline + revisiones) ─── */
function openDB(){
  return new Promise((res,rej)=>{
    const r=indexedDB.open(DB_NAME,1);
    r.onupgradeneeded=e=>{const db=e.target.result;if(!db.objectStoreNames.contains(DB_STORE))db.createObjectStore(DB_STORE)};
    r.onsuccess=e=>res(e.target.result); r.onerror=e=>rej(e);
  });
}
async function idbSet(k,v){try{const db=await openDB();return new Promise((res,rej)=>{const t=db.transaction(DB_STORE,'readwrite');t.objectStore(DB_STORE).put(v,k);t.oncomplete=()=>res();t.onerror=rej})}catch(e){}}
async function idbGet(k){try{const db=await openDB();return new Promise((res)=>{const t=db.transaction(DB_STORE,'readonly');const rq=t.objectStore(DB_STORE).get(k);rq.onsuccess=()=>res(rq.result);rq.onerror=()=>res(null)})}catch(e){return null}}

/* ─── Carga de datos ─── */
async function loadData(){
  let data=null;
  try{
    const r=await fetch('data/bootstrap.json',{cache:'no-cache'});
    if(r.ok){data=await r.json(); await idbSet('bootstrap',data);}
  }catch(e){}
  if(!data){ data=await idbGet('bootstrap'); }
  if(!data){ throw new Error('No se pudieron cargar los datos'); }

  // si hay una versión más nueva cargada por admin, úsala
  const local=await idbGet('bootstrap_local');
  if(local && local.meta && data.meta && (local.meta.generated_at||'')>(data.meta.generated_at||'')){
    data=local;
  }

  STATE.meta=data.meta||{};
  STATE.events=data.events||[];
  STATE.products=data.products||[];
  STATE.maestro=data.maestro||[];
  STATE.validaciones=data.validaciones||{};
  STATE.eventsById={}; STATE.prodsByEvent={};
  STATE.events.forEach(e=>STATE.eventsById[e.event_id]=e);
  STATE.products.forEach(p=>{(STATE.prodsByEvent[p.event_id]=STATE.prodsByEvent[p.event_id]||[]).push(p)});

  STATE.reviews=(await idbGet('reviews'))||{};
  STATE.overrides=(await idbGet('overrides'))||{maestro:{}};
}

/* ─── Helpers ─── */
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
function fmt(n,d=0){if(n==null||isNaN(n))return '—';return Number(n).toLocaleString('es-NI',{minimumFractionDigits:d,maximumFractionDigits:d})}
function fmtK(n){if(n==null||isNaN(n))return '—';n=Number(n);if(Math.abs(n)>=1e6)return (n/1e6).toFixed(2)+'M';if(Math.abs(n)>=1e3)return (n/1e3).toFixed(1)+'k';return fmt(n)}
function pct(n){return n==null||isNaN(n)?'—':(n*100).toFixed(1)+'%'}
function esc(s){return s==null?'':String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function clip(s,n){s=String(s||'');return s.length>n?s.slice(0,n)+'…':s}
function daysAgo(d){if(!d)return null;const t=new Date(d+'T00:00:00');if(isNaN(t))return null;return Math.floor((Date.now()-t)/864e5)}
function estadoBadge(e){const m={'EJECUTADA':['b-eje','Ejecutada'],'RESERVADA':['b-res','Reservada'],'SUSPENDIDA':['b-sus','Suspendida'],'INCONSISTENTE':['b-inc','Inconsistente'],'SIN CLASIFICAR':['b-sc','Sin clasif.']};const x=m[e]||['b-sc',e];return `<span class="badge ${x[0]}">${x[1]}</span>`}
function toast(msg,type=''){const t=$('#toast');t.className='toast show '+(type||'');t.textContent=msg;clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),2600)}

const ICON={
  resumen:'<path d="M3 13h4v8H3zM10 3h4v18h-4zM17 8h4v13h-4z"/>',
  explora:'<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  insumos:'<path d="M20 7 12 3 4 7v10l8 4 8-4z"/><path d="M4 7l8 4 8-4M12 11v10"/>',
  productores:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  madurante:'<path d="M17.5 19a4.5 4.5 0 0 0 0-9c-.3 0-.6 0-.9.1A6 6 0 0 0 5.6 12 4 4 0 0 0 6 20h11.5z"/><path d="M12 20v-6M9 17l3-3 3 3"/>',
  admin:'<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  suerte:'<path d="M3 3h18v18H3zM3 9h18M9 3v18"/>',
  hacienda:'<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/>',
  area:'<path d="M21 3H3v18h18zM3 9h6M15 3v6M3 15h6M15 21v-6"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert:'<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  box:'<path d="M20 7 12 3 4 7v10l8 4 8-4z"/><path d="M4 7l8 4 8-4"/>',
  layers:'<path d="m12 2 9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5"/>',
  drop:'<path d="M12 2.7c4 4.3 6 7.5 6 10.3a6 6 0 0 1-12 0c0-2.8 2-6 6-10.3z"/>',
  ban:'<circle cx="12" cy="12" r="9"/><path d="M5 5l14 14"/>',
  upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  lock:'<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
};
function svg(name,w){return `<svg class="ico" viewBox="0 0 24 24">${ICON[name]||''}</svg>`}

/* ═══ Alcance (scope) ═══ */
function scopedEvents(all){
  const src=all||STATE.events;
  if(STATE.scope==='productores')return src.filter(e=>e.zona==='5');
  if(STATE.scope==='zona')return src.filter(e=>e.zona===STATE.scopeZone);
  return src;
}
/* eventos que cuentan como insumos entregados (excluye madurante aéreo) */
function insumoEvents(evts){return (evts||scopedEvents()).filter(e=>!e.es_madurante_aereo)}
function madEvents(evts){return (evts||scopedEvents()).filter(e=>e.es_madurante_aereo)}

function prodsFor(evts){
  const ids=new Set(evts.map(e=>e.event_id));
  return STATE.products.filter(p=>ids.has(p.event_id));
}
function maestroArea(key){
  if(STATE.overrides.maestro[key]!=null)return STATE.overrides.maestro[key];
  const m=STATE.maestro.find(x=>x.hac_sue_key===key);
  return m?m.area:null;
}

/* ═══ Unidad de medida — Catálogo oficial CASUR ═══ */
const UNIT_CATALOG={
  '62000001':'LT','62000009':'LT','62000014':'LT','62000016':'LT',
  '62000021':'LT','62000043':'LT','62000048':'LT','62000049':'LT',
  '62000055':'LT','62000077':'KG','62000085':'KG','62000087':'KG',
  '62000098':'QQ','62000145':'QQ','62000166':'KG','62000198':'KG',
  '62000228':'LT','62000233':'KG','62000244':'QQ','62000247':'LT',
  '62000249':'KG','62000253':'LT','62000254':'GR','62000255':'LT',
  '62000257':'LT','62000260':'LT','62000261':'LT','62000264':'LT',
  '62000266':'KG','62000267':'LT','62000268':'LT','62000269':'KG',
  '62000270':'KG','62000273':'LT','62000274':'LT','62000275':'LT',
  '62000276':'LT','62000277':'LT',
  '0004':'TM','62000230':'TON','SEMILLA':'TM',
};
function inferUnit(desc,codigo){
  if(codigo && UNIT_CATALOG[codigo])return UNIT_CATALOG[codigo];
  // fallback por nombre si no hay código
  if(!desc)return 'UND';
  const d=desc.toUpperCase();
  if(/UREA|NITROEXTEND/.test(d))return 'QQ';
  if(/SULFATO DE AMONIO/.test(d))return 'QQ';
  if(/MEZCLA\s*#?\s*\d/.test(d))return 'QQ';
  if(/POLLINAZA/.test(d))return 'TON';
  if(/MELAZA/.test(d))return 'TM';
  if(/\bSL\b|\bSC\b|\bEC\b|\bSE\b/.test(d))return 'LT';
  if(/AMINA|LTS\b/.test(d))return 'LT';
  if(/ENVOKE|HALOFOR|NEW GIBB|IMIDACLOPRID 70/.test(d))return 'GR';
  if(/POTASIO|FOSFATO|BORICO|HEXACTO|CLOTHIANIDIN|DIURON|MERLIN|KOMETA|ALLY|JADE|RODENTICIDA|SULFATO|MULTIFRUTO CA|ACIDO FOSFORICO/.test(d))return 'KG';
  return 'UND';
}
function unitTag(u){const m={KG:'u-kg',LT:'u-lt',GR:'u-gr',QQ:'u-qq',TON:'u-ton',TM:'u-ton',UND:'u-und'};return `<span class="u-tag ${m[u]||'u-und'}">${u}</span>`}
function unitLabel(u){return {KG:'Kilogramos',LT:'Litros',GR:'Gramos',QQ:'Quintales',TON:'Toneladas',TM:'Ton. métrica',UND:'Unid.'}[u]||u}
const ICON_EXPORT='<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>';

/* ═══ Agregaciones ═══ */
function computeKPIs(){
  const scoped=scopedEvents();
  const ins=insumoEvents(scoped);           // sin madurante aéreo
  const eje=ins.filter(e=>e.estado==='EJECUTADA');
  const res=ins.filter(e=>e.estado==='RESERVADA');
  const sus=ins.filter(e=>e.estado==='SUSPENDIDA');
  const inc=ins.filter(e=>e.estado==='INCONSISTENTE');
  const activos=ins.filter(e=>e.estado!=='SUSPENDIDA');

  const suertes=new Set(ins.map(e=>e.hac_sue_key));
  const haciendas=new Set(ins.map(e=>e.hacienda));
  const productores=new Set(ins.map(e=>e.productor));

  // hectáreas-evento (carga operativa, cuenta repeticiones)
  const haEvento=activos.reduce((s,e)=>s+e.area,0);
  const haEjecutada=eje.reduce((s,e)=>s+e.area,0);
  // superficie física atendida (suertes únicas ejecutadas, área de maestro)
  const suertesEje=new Set(eje.map(e=>e.hac_sue_key));
  let supFisica=0; suertesEje.forEach(k=>{const a=maestroArea(k);if(a)supFisica+=a});

  // insumos entregados: total de cantidad por producto (sin madurante)
  const insProds=prodsFor(ins);
  const totalInsumo=insProds.reduce((s,p)=>s+p.cantidad,0);
  const productosDistintos=new Set(insProds.map(p=>p.producto_desc)).size;
  // desglose por unidad inferida
  const byUnit={KG:0,LT:0,GR:0,UND:0};
  const prodUnit={};
  insProds.forEach(p=>{const u=prodUnit[p.producto_desc]||(prodUnit[p.producto_desc]=inferUnit(p.producto_desc,p.producto_codigo));byUnit[u]=(byUnit[u]||0)+p.cantidad});

  // alertas
  const alertEvents=ins.filter(e=>e.alertas&&e.alertas.length);
  const nAlertas=alertEvents.reduce((s,e)=>s+e.alertas.length,0);
  const pendientes=alertEvents.reduce((s,e)=>{
    return s+e.alertas.filter(a=>(STATE.reviews[e.event_id+'|'+a]||{}).status!=='resuelta').length;
  },0);

  const mad=madEvents(scoped);

  return {scoped,ins,eje,res,sus,inc,activos,
    suertes:suertes.size,haciendas:haciendas.size,productores:productores.size,
    totalEventos:ins.length,haEvento,haEjecutada,supFisica,
    totalInsumo,productosDistintos,byUnit,
    pctEje:ins.length?eje.length/ins.length:0,
    nAlertas,pendientes,madEventos:mad.length};
}

/* agrupa productos por descripción (insumos entregados) */
function insumosAgg(evts){
  const ins=insumoEvents(evts);
  const prods=prodsFor(ins);
  const map={};
  prods.forEach(p=>{
    const k=p.producto_desc;
    if(!map[k])map[k]={desc:k,codigo:p.producto_codigo,cantidad:0,area:0,eventos:new Set(),dosisList:[],unidad:p.unidad_medida};
    map[k].cantidad+=p.cantidad; map[k].area+=p.area_cubierta; map[k].eventos.add(p.event_id); map[k].dosisList.push(p.dosis);
  });
  return Object.values(map).map(x=>{
    const avgDosis=x.dosisList.length?x.dosisList.reduce((s,d)=>s+d,0)/x.dosisList.length:0;
    const unit=inferUnit(x.desc,x.codigo);
    return {...x,eventos:x.eventos.size,unit,avgDosis};
  }).sort((a,b)=>b.cantidad-a.cantidad);
}

/* agrupa por productor */
function productoresAgg(evts){
  const ins=insumoEvents(evts);
  const map={};
  ins.forEach(e=>{
    const k=e.productor;
    if(!map[k])map[k]={productor:k,haciendas:new Set(),suertes:new Set(),eventos:0,eje:0,res:0,sus:0,haEvento:0,labores:new Set(),eventIds:[]};
    const m=map[k];
    m.haciendas.add(e.hacienda); m.suertes.add(e.hac_sue_key); m.eventos++; m.eventIds.push(e.event_id);
    if(e.estado==='EJECUTADA')m.eje++; else if(e.estado==='RESERVADA')m.res++; else if(e.estado==='SUSPENDIDA')m.sus++;
    if(e.estado!=='SUSPENDIDA')m.haEvento+=e.area; m.labores.add(e.labor);
  });
  return Object.values(map).map(m=>{
    let supFisica=0; m.suertes.forEach(k=>{const a=maestroArea(k);if(a)supFisica+=a});
    const prods=prodsFor(ins.filter(e=>m.eventIds.includes(e.event_id)));
    return {...m,haciendas:[...m.haciendas],suertes:m.suertes.size,labores:[...m.labores],
      supFisica,totalInsumo:prods.reduce((s,p)=>s+p.cantidad,0),
      productosDistintos:new Set(prods.map(p=>p.producto_desc)).size};
  }).sort((a,b)=>b.eventos-a.eventos);
}

/* ═══════════════════════════════════════════════════════════
   RENDER: navegación + scope
   ═══════════════════════════════════════════════════════════ */
const NAV=[
  ['resumen','Resumen','resumen'],
  ['explora','Explorar','explora'],
  ['insumos','Insumos','insumos'],
  ['productores','Productores','productores'],
  ['admin','Admin','admin'],
];
function renderNav(){
  const k=computeKPIs();
  $('#nav').innerHTML=NAV.map(([id,lbl,ic])=>{
    const badge=(id==='admin'&&k.pendientes>0)?`<span class="nav-badge">${k.pendientes>99?'99+':k.pendientes}</span>`:'';
    return `<button class="nav-btn ${STATE.section===id?'active':''}" data-nav="${id}">
      <svg viewBox="0 0 24 24">${ICON[ic]}</svg>${lbl}${badge}</button>`;
  }).join('');
}
function scopeBar(){
  const s=STATE.scope,z=STATE.scopeZone;
  const btn=(sc,zone,lbl)=>{
    const active=(sc==='zona')?(s==='zona'&&z===zone):(s===sc);
    return `<button class="scope-btn ${active?'active':''}" data-scope="${sc}" ${zone?`data-zone="${zone}"`:''}>${lbl}</button>`;
  };
  return `<div class="scope-wrap"><div class="scope-bar">
    ${btn('productores','','Productores')}${btn('todas','','Todo CASUR')}
    ${btn('zona','1','Sur')}${btn('zona','2','Centro')}${btn('zona','3','Norte')}
  </div></div>`;
}
function scopeLabel(){
  if(STATE.scope==='productores')return 'Zona Productores';
  if(STATE.scope==='zona')return 'Zona '+(ZONAS[STATE.scopeZone]||STATE.scopeZone);
  return 'Todo CASUR';
}
function secHead(ic,grad,title,sub){
  return `<div class="sec-head"><div class="ic" style="background:${grad}">${svg(ic)}</div>
    <h2>${title}</h2>${sub?`<span class="sub">${sub}</span>`:''}</div>`;
}

/* ═══════════════════════════════════════════════════════════
   RESUMEN EJECUTIVO
   ═══════════════════════════════════════════════════════════ */
function renderResumen(){
  const k=computeKPIs();
  const kpi=(cls,ic,drill,val,sub,lbl)=>`
    <div class="kpi ${cls}" data-drill="${drill}" tabindex="0">
      <div class="k-top"><div class="k-ic">${svg(ic)}</div><div class="k-drill">VER ▸</div></div>
      <div class="k-val">${val}</div>
      <div class="k-lbl">${lbl}</div>${sub?`<div class="k-sub">${sub}</div>`:''}
    </div>`;

  const agg=insumosAgg(k.scoped);
  const topInsumo=agg.slice(0,8);
  const maxIns=Math.max(1,...topInsumo.map(a=>a.cantidad));

  // cobertura por hacienda (nombre, no código)
  const hacMap={};
  k.ins.filter(e=>e.estado!=='SUSPENDIDA').forEach(e=>{
    const nm=e.productor||'Sin nombre';
    if(!hacMap[nm])hacMap[nm]={nombre:nm,hacienda:e.hacienda,suertes:new Set(),eventos:0,haEvento:0,haFisica:0};
    hacMap[nm].suertes.add(e.hac_sue_key); hacMap[nm].eventos++; hacMap[nm].haEvento+=e.area;
  });
  Object.values(hacMap).forEach(h=>{h.suertes.forEach(sk=>{const a=maestroArea(sk);if(a)h.haFisica+=a});h.suertes=h.suertes.size});
  const topHac=Object.values(hacMap).sort((a,b)=>b.haEvento-a.haEvento).slice(0,8);
  const maxHac=Math.max(1,...topHac.map(h=>h.haEvento));

  // unit breakdown for hero
  const uBreak=[['KG',k.byUnit.KG],['LT',k.byUnit.LT],['GR',k.byUnit.GR]].filter(x=>x[1]>0);

  return scopeBar()+`
    ${secHead('resumen','var(--grad-navy)','Resumen Ejecutivo',scopeLabel())}

    <div class="hero" data-drill="insumos-total">
      <div class="h-lbl">${svg('box')} Insumos agrícolas entregados</div>
      <div class="h-val">${fmt(k.productosDistintos)} <small>insumos distintos</small></div>
      <div class="unit-legend" style="margin-bottom:6px">
        ${uBreak.map(([u,v])=>`<div class="ul-item"><div class="ul-val">${fmtK(v)}</div><div class="ul-lbl">${unitLabel(u)}</div></div>`).join('')}
      </div>
      <div class="h-row" style="margin-top:8px">
        <div class="h-chip"><b>${fmt(k.totalEventos)}</b><span>Eventos (sin aéreo)</span></div>
        <div class="h-chip"><b>${fmt(k.haEvento,1)} ha</b><span>Ha-evento</span></div>
        <div class="h-chip"><b>${fmt(k.suertes)}</b><span>Suertes</span></div>
      </div>
      <div class="h-drill">Ver desglose ▸</div>
    </div>

    <div class="kpi-grid">
      ${kpi('green-kpi','check','ejecutadas',fmt(k.eje.length),pct(k.pctEje)+' del total','Eventos ejecutados')}
      ${kpi('alert-kpi','clock','reservadas',fmt(k.res.length),'Pendientes de ejecutar','Reservas activas')}
      ${kpi('cyan-kpi','suerte','suertes',fmt(k.suertes),`${fmt(k.haciendas)} haciendas`,'Suertes atendidas')}
      ${kpi('','productores','productores',fmt(k.productores),'Con al menos un evento','Productores')}
      ${kpi('green-kpi','area','area-ejecutada',fmt(k.haEjecutada,1)+' <small>ha</small>','Suma de áreas ejecutadas','Hectáreas ejecutadas')}
      ${kpi('cyan-kpi','hacienda','superficie-fisica',fmt(k.supFisica,1)+' <small>ha</small>','Suertes únicas (Maestro)','Superficie física')}
      ${kpi('danger-kpi','alert','alertas',fmt(k.pendientes),`${fmt(k.nAlertas)} detectadas`,'Alertas por revisar')}
      ${kpi('','madurante','madurante',fmt(k.madEventos),'No se cobra · aparte','Madurante aéreo')}
    </div>

    <div class="panel">
      <div class="panel-h"><h3><span class="emo">🚜</span> Avance de ejecución</h3>
        <span class="pill">${pct(k.pctEje)}</span></div>
      <div class="prog-wrap"><div class="prog-track"><div class="prog-fill" style="width:${(k.pctEje*100).toFixed(1)}%"></div></div>
        <div class="prog-labels"><span>${fmt(k.eje.length)} ejecutados</span><span>${fmt(k.res.length)} reservados · ${fmt(k.sus.length)} suspendidos</span></div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-h"><h3><span class="emo">📦</span> Principales insumos entregados</h3>
        <span class="pill" data-drill="insumos-total">Ver todos ▸</span></div>
      <div class="bars">
        ${topInsumo.map(a=>`<div class="bar-row" data-drill="insumo:${esc(a.desc)}">
          <div class="bar-lbl" title="${esc(a.desc)}">${esc(clip(a.desc,14))} ${unitTag(a.unit)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${(a.cantidad/maxIns*100).toFixed(1)}%;background:var(--grad-green)">${fmtK(a.cantidad)}</div></div>
        </div>`).join('')}
      </div>
      <div class="note info" style="margin-top:10px">Excluye madurante aéreo (módulo aparte, no facturado). Dosis/ha promedio visible al tocar cada producto.</div>
    </div>

    <div class="panel">
      <div class="panel-h"><h3><span class="emo">🏗️</span> Cobertura por hacienda</h3>
        <button class="btn-export" data-export="haciendas"><svg viewBox="0 0 24 24">${ICON_EXPORT}</svg> Excel</button></div>
      <div class="bars">
        ${topHac.map(h=>`<div class="bar-row" data-drill="hacienda:${esc(h.nombre)}">
          <div class="bar-lbl" title="${esc(h.nombre)}">${esc(clip(h.nombre,14))}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${(h.haEvento/maxHac*100).toFixed(1)}%;background:var(--grad-blue)">${fmt(h.haEvento,0)} ha</div></div>
        </div>`).join('')}
      </div>
      <div class="note info" style="margin-top:10px">Ha-evento por hacienda (carga operativa). Toque cada hacienda para ver suertes, productos y superficie física.</div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════
   EXPLORAR
   ═══════════════════════════════════════════════════════════ */
function renderExplora(){
  const f=STATE.filters.explora;
  const scoped=insumoEvents(scopedEvents());
  const productores=[...new Set(scoped.map(e=>e.productor))].sort();
  const labores=[...new Set(scoped.map(e=>e.labor))].sort();
  const estados=[...new Set(scoped.map(e=>e.estado))].sort();

  let evts=scoped;
  if(f.productor)evts=evts.filter(e=>e.productor===f.productor);
  if(f.labor)evts=evts.filter(e=>e.labor===f.labor);
  if(f.estado)evts=evts.filter(e=>e.estado===f.estado);
  if(f.search){const q=f.search.toLowerCase();
    evts=evts.filter(e=>e.hac_sue.toLowerCase().includes(q)||e.productor.toLowerCase().includes(q)||String(e.documento).toLowerCase().includes(q)||(e.labor_nombre||'').toLowerCase().includes(q));}

  const hasFilter=f.productor||f.labor||f.estado||f.search;
  const rows=evts.slice(0,300).map(e=>{
    const open=STATE.expanded.has(e.event_id);
    const prods=STATE.prodsByEvent[e.event_id]||[];
    return `<tr class="ev-row ${open?'expanded':''}" data-exp="${e.event_id}">
      <td><button class="exp-btn">${open?'−':'+'}</button></td>
      <td><strong>${esc(e.hac_sue)}</strong></td>
      <td>${esc(clip(e.productor,18))}</td>
      <td>${esc(e.labor)}</td>
      <td class="num">${fmt(e.area,2)}</td>
      <td>${estadoBadge(e.estado)}</td>
      <td>${e.fecha_ejecucion||e.fecha_inicio||'—'}</td>
      <td class="num">${e.num_productos}</td>
    </tr>${open?prods.map(p=>`<tr class="prod-row"><td></td>
      <td colspan="2">📦 ${esc(clip(p.producto_desc,26))}</td>
      <td>${esc(p.producto_codigo)}</td>
      <td class="num">${fmt(p.cantidad,2)}</td>
      <td>Dosis ${fmt(p.dosis,2)}</td>
      <td colspan="2">Área ${fmt(p.area_cubierta,2)} ha</td></tr>`).join(''):''}`;
  }).join('');

  return scopeBar()+`
    ${secHead('explora','var(--grad-blue)','Explorador Operativo',scopeLabel())}
    <div class="filters">
      <div class="f-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" placeholder="Buscar hac-sue, productor, documento…" value="${esc(f.search)}" data-f="explora.search"></div>
      <div class="f-sel"><select data-f="explora.productor"><option value="">Todos los productores</option>
        ${productores.map(p=>`<option value="${esc(p)}" ${f.productor===p?'selected':''}>${esc(clip(p,28))}</option>`).join('')}</select></div>
      <div class="f-sel"><select data-f="explora.labor"><option value="">Todas las labores</option>
        ${labores.map(l=>`<option value="${esc(l)}" ${f.labor===l?'selected':''}>${esc(l)} · ${esc(clip(STATE.eventsById[scoped.find(e=>e.labor===l)?.event_id]?.labor_nombre||l,18))}</option>`).join('')}</select></div>
      <div class="f-sel"><select data-f="explora.estado"><option value="">Todos los estados</option>
        ${estados.map(s=>`<option value="${esc(s)}" ${f.estado===s?'selected':''}>${esc(s)}</option>`).join('')}</select></div>
      ${hasFilter?`<button class="f-clear" data-clear="explora">Limpiar ✕</button>`:''}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <span class="pill">${fmt(evts.length)} eventos</span>
      ${evts.length>300?`<span class="sub" style="font-size:11px;color:var(--muted)">Mostrando 300 primeros</span>`:''}
    </div>
    <div class="tbl-wrap"><div class="tbl-scroll"><table>
      <thead><tr><th></th><th>Hac-Sue</th><th>Productor</th><th>Labor</th><th class="num">Área ha</th><th>Estado</th><th>Fecha</th><th class="num">Prod.</th></tr></thead>
      <tbody>${rows||`<tr><td colspan="8"><div class="empty"><div class="big">🔍</div>Sin resultados con los filtros aplicados</div></td></tr>`}</tbody>
    </table></div></div>
  `;
}

/* ═══════════════════════════════════════════════════════════
   INSUMOS (productos entregados)
   ═══════════════════════════════════════════════════════════ */
function renderInsumos(){
  const f=STATE.filters.insumos;
  let agg=insumosAgg(scopedEvents());
  if(f.search){const q=f.search.toLowerCase();agg=agg.filter(a=>a.desc.toLowerCase().includes(q)||String(a.codigo).toLowerCase().includes(q));}

  // totales por unidad
  const byU={};agg.forEach(a=>{byU[a.unit]=(byU[a.unit]||0)+a.cantidad});
  const uBreak=Object.entries(byU).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]);

  const rows=agg.map(a=>`<tr class="ev-row" data-drill="insumo:${esc(a.desc)}">
    <td><strong>${esc(clip(a.desc,28))}</strong> ${unitTag(a.unit)}<div style="font-size:10px;color:var(--muted-l)">${esc(a.codigo)}</div></td>
    <td class="num"><strong>${fmt(a.cantidad,1)}</strong></td>
    <td class="num">${fmt(a.avgDosis,2)}</td>
    <td class="num">${fmt(a.area,1)}</td>
    <td class="num">${fmt(a.eventos)}</td>
  </tr>`).join('');

  return scopeBar()+`
    ${secHead('insumos','var(--grad-green)','Insumos Entregados',scopeLabel())}
    <div class="hero" style="background:var(--grad-green)" data-drill="insumos-total">
      <div class="h-lbl">${svg('box')} Insumos agrícolas entregados (sin madurante aéreo)</div>
      <div class="h-val">${fmt(agg.length)} <small>insumos distintos</small></div>
      <div class="unit-legend" style="margin-bottom:4px">
        ${uBreak.map(([u,v])=>`<div class="ul-item"><div class="ul-val">${fmtK(v)}</div><div class="ul-lbl">${unitLabel(u)}</div></div>`).join('')}
      </div>
      <div class="h-drill">Ver desglose ▸</div>
    </div>
    <div class="filters">
      <div class="f-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" placeholder="Buscar producto o código…" value="${esc(f.search)}" data-f="insumos.search"></div>
      ${f.search?`<button class="f-clear" data-clear="insumos">Limpiar ✕</button>`:''}
      <button class="btn-export" data-export="insumos"><svg viewBox="0 0 24 24">${ICON_EXPORT}</svg> Exportar Excel</button>
    </div>
    <div class="tbl-wrap"><div class="tbl-scroll"><table style="min-width:520px">
      <thead><tr><th>Producto</th><th class="num">Cantidad</th><th class="num">Dosis/ha</th><th class="num">Ha-prod.</th><th class="num">Eventos</th></tr></thead>
      <tbody>${rows||`<tr><td colspan="5"><div class="empty"><div class="big">📦</div>Sin insumos</div></td></tr>`}</tbody>
    </table></div></div>
    <div class="note info" style="margin-top:12px">Cantidad total entregada por producto con su unidad inferida. <b>Dosis/ha</b> es el promedio aplicado. <b>Ha-producto</b> es la superficie técnica acumulada.</div>
  `;
}

/* ═══════════════════════════════════════════════════════════
   PRODUCTORES
   ═══════════════════════════════════════════════════════════ */
function renderProductores(){
  const f=STATE.filters.productores;
  let list=productoresAgg(scopedEvents());
  const haciendasAll=[...new Set(list.flatMap(p=>p.haciendas))].sort();
  if(f.hacienda)list=list.filter(p=>p.haciendas.includes(f.hacienda));
  if(f.search){const q=f.search.toLowerCase();list=list.filter(p=>p.productor.toLowerCase().includes(q));}

  const cards=list.map(p=>{
    const open=STATE.openProducers.has(p.productor);
    // insumos por producto de este productor
    let body='';
    if(open){
      const evs=insumoEvents(scopedEvents()).filter(e=>e.productor===p.productor);
      const prods=prodsFor(evs);
      const pmap={};
      prods.forEach(pr=>{if(!pmap[pr.producto_desc])pmap[pr.producto_desc]={cant:0,area:0,ev:new Set(),dosis:[],cod:pr.producto_codigo};pmap[pr.producto_desc].cant+=pr.cantidad;pmap[pr.producto_desc].area+=pr.area_cubierta;pmap[pr.producto_desc].ev.add(pr.event_id);pmap[pr.producto_desc].dosis.push(pr.dosis)});
      const prodRows=Object.entries(pmap).sort((a,b)=>b[1].cant-a[1].cant).slice(0,15).map(([d,v])=>{
        const u=inferUnit(d,v.cod);
        return `<tr><td>${esc(clip(d,24))} ${unitTag(u)}</td><td class="num">${fmt(v.cant,1)}</td><td class="num">${fmt(v.area,1)}</td><td class="num">${v.ev.size}</td></tr>`;
      }).join('');
      body=`<div class="pc-body open">
        <div class="pc-stats">
          <div class="pc-stat" data-drill="prod-suertes:${esc(p.productor)}"><div class="v">${fmt(p.suertes)}</div><div class="l">Suertes</div></div>
          <div class="pc-stat" data-drill="prod-eventos:${esc(p.productor)}"><div class="v">${fmt(p.eventos)}</div><div class="l">Eventos</div></div>
          <div class="pc-stat"><div class="v">${fmt(p.supFisica,1)}</div><div class="l">Ha física</div></div>
          <div class="pc-stat" data-drill="prod-insumos:${esc(p.productor)}"><div class="v">${fmtK(p.totalInsumo)}</div><div class="l">Insumo total</div></div>
        </div>
        <div class="pc-sub-h">📦 Insumos por producto · ${p.productosDistintos} distintos</div>
        <div class="tbl-wrap"><table class="mini-tbl">
          <thead><tr><th style="text-align:left">Producto</th><th class="num">Cant.</th><th class="num">Ha</th><th class="num">Ev.</th></tr></thead>
          <tbody>${prodRows}</tbody></table></div>
        ${p.eje!=null?`<div class="chip-legend"><span><i style="background:var(--green)"></i>${p.eje} ejecutadas</span><span><i style="background:var(--amber)"></i>${p.res} reservadas</span>${p.sus?`<span><i style="background:var(--red)"></i>${p.sus} suspendidas</span>`:''}</div>`:''}
      </div>`;
    }
    return `<div class="prod-card">
      <div class="pc-head" data-prod="${esc(p.productor)}">
        <div class="pc-title"><h4>${esc(p.productor)}</h4>
          <div class="meta">${p.haciendas.length} hacienda(s) · ${p.suertes} suertes · ${p.labores.join(', ')}</div></div>
        <div class="pc-count"><b>${p.eventos}</b><span>eventos ${open?'▾':'▸'}</span></div>
      </div>${body}</div>`;
  }).join('');

  return scopeBar()+`
    ${secHead('productores','var(--grad-cyan)','Productores',scopeLabel())}
    <div class="filters">
      <div class="f-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" placeholder="Buscar productor…" value="${esc(f.search)}" data-f="productores.search"></div>
      <div class="f-sel"><select data-f="productores.hacienda"><option value="">Todas las haciendas</option>
        ${haciendasAll.map(h=>`<option value="${esc(h)}" ${f.hacienda===h?'selected':''}>${esc(h)}</option>`).join('')}</select></div>
      ${(f.search||f.hacienda)?`<button class="f-clear" data-clear="productores">Limpiar ✕</button>`:''}
      <button class="btn-export" data-export="productores"><svg viewBox="0 0 24 24">${ICON_EXPORT}</svg> Excel</button>
    </div>
    <div style="margin-bottom:10px"><span class="pill">${fmt(list.length)} productores</span></div>
    ${cards||`<div class="empty"><div class="big">👥</div>Sin productores en este alcance</div>`}
  `;
}

/* ═══════════════════════════════════════════════════════════
   MADURANTE AÉREO (módulo independiente — no se cobra)
   ═══════════════════════════════════════════════════════════ */
function renderMadurante(){
  const f=STATE.filters.madurante;
  const scoped=madEvents(STATE.events); // todas las zonas por defecto para madurante
  let evts=scoped;
  const productores=[...new Set(scoped.map(e=>e.productor))].sort();
  if(f.productor)evts=evts.filter(e=>e.productor===f.productor);
  if(f.search){const q=f.search.toLowerCase();evts=evts.filter(e=>e.hac_sue.toLowerCase().includes(q)||e.productor.toLowerCase().includes(q));}

  const prods=prodsFor(evts);
  const totalCant=prods.reduce((s,p)=>s+p.cantidad,0);
  const haTotal=evts.reduce((s,e)=>s+e.area,0);
  const suertes=new Set(evts.map(e=>e.hac_sue_key)).size;
  // productos madurante
  const pmap={};
  prods.forEach(p=>{if(!pmap[p.producto_desc])pmap[p.producto_desc]={cant:0,area:0,ev:new Set(),cod:p.producto_codigo};pmap[p.producto_desc].cant+=p.cantidad;pmap[p.producto_desc].area+=p.area_cubierta;pmap[p.producto_desc].ev.add(p.event_id)});
  const prodList=Object.entries(pmap).sort((a,b)=>b[1].cant-a[1].cant);
  const maxC=Math.max(1,...prodList.map(x=>x[1].cant));

  const rows=evts.slice(0,200).map(e=>{
    const open=STATE.expanded.has(e.event_id);
    const eprods=STATE.prodsByEvent[e.event_id]||[];
    return `<tr class="ev-row ${open?'expanded':''}" data-exp="${e.event_id}">
      <td><button class="exp-btn">${open?'−':'+'}</button> <strong>${esc(e.hac_sue)}</strong></td><td>${esc(clip(e.productor,18))}</td>
      <td>${esc(ZONAS[e.zona]||e.zona)}</td><td class="num">${fmt(e.area,2)}</td>
      <td>${estadoBadge(e.estado)}</td><td>${e.fecha_ejecucion||e.fecha_inicio||'—'}</td></tr>
      ${open?eprods.map(p=>`<tr class="prod-row"><td colspan="2">🧪 ${esc(clip(p.producto_desc,28))} ${unitTag(inferUnit(p.producto_desc,p.producto_codigo))}</td>
        <td>Dosis ${fmt(p.dosis,2)}</td><td class="num">${fmt(p.cantidad,2)}</td>
        <td colspan="2">${esc(p.producto_codigo)}</td></tr>`).join(''):''}`;
  }).join('');

  return `
    ${secHead('madurante','var(--grad-amber)','Madurante Aéreo','Módulo independiente')}
    <div class="note" style="margin-bottom:14px">${svg('ban')} <b style="color:#b57717">Insumo no facturado a productores.</b> La aplicación aérea de madurante (AAM) se gestiona por separado y <b>no suma</b> en las estadísticas de insumos entregados de los demás módulos.</div>
    <div class="hero" style="background:var(--grad-amber)">
      <div class="h-lbl">${svg('drop')} Madurante aplicado</div>
      <div class="h-val">${fmt(totalCant,0)}</div>
      <div class="h-row">
        <div class="h-chip"><b>${fmt(evts.length)}</b><span>Aplicaciones</span></div>
        <div class="h-chip"><b>${fmt(haTotal,1)} ha</b><span>Hectáreas tratadas</span></div>
        <div class="h-chip"><b>${fmt(suertes)}</b><span>Suertes</span></div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-h"><h3><span class="emo">🧪</span> Productos de madurante</h3></div>
      <div class="bars">${prodList.map(([d,v])=>{const u=inferUnit(d,v.cod);return `<div class="bar-row">
        <div class="bar-lbl" title="${esc(d)}">${esc(clip(d,13))} ${unitTag(u)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(v.cant/maxC*100).toFixed(1)}%;background:var(--grad-amber)">${fmt(v.cant,1)}</div></div>
      </div>`}).join('')}</div>
    </div>
    <div class="filters">
      <div class="f-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" placeholder="Buscar suerte o productor…" value="${esc(f.search)}" data-f="madurante.search"></div>
      <div class="f-sel"><select data-f="madurante.productor"><option value="">Todos los productores</option>
        ${productores.map(p=>`<option value="${esc(p)}" ${f.productor===p?'selected':''}>${esc(clip(p,28))}</option>`).join('')}</select></div>
      ${(f.search||f.productor)?`<button class="f-clear" data-clear="madurante">Limpiar ✕</button>`:''}
    </div>
    <div style="margin-bottom:10px"><span class="pill">${fmt(evts.length)} aplicaciones</span></div>
    <div class="tbl-wrap"><div class="tbl-scroll"><table style="min-width:480px">
      <thead><tr><th>Hac-Sue</th><th>Productor</th><th>Zona</th><th class="num">Ha</th><th>Estado</th><th>Fecha</th></tr></thead>
      <tbody>${rows||`<tr><td colspan="6"><div class="empty"><div class="big">✈️</div>Sin aplicaciones</div></td></tr>`}</tbody>
    </table></div></div>
  `;
}

/* ═══════════════════════════════════════════════════════════
   DRILL-DOWN DRAWER
   ═══════════════════════════════════════════════════════════ */
function openDrawer(title,sub,html){
  $('#drawerTitle').innerHTML=title; $('#drawerSub').innerHTML=sub||'';
  $('#drawerBody').innerHTML=html;
  $('#drawer').classList.add('open'); $('#drawerOv').classList.add('open');
  $('#drawerBody').scrollTop=0;
}
function closeDrawer(){$('#drawer').classList.remove('open');$('#drawerOv').classList.remove('open')}

function eventRowHTML(e){
  return `<div class="dl-item click" data-exp-drawer="${e.event_id}">
    <div class="dl-main"><b>${esc(e.hac_sue)} · ${esc(e.labor)}</b>
      <span>${esc(clip(e.productor,24))} · ${e.fecha_ejecucion||e.fecha_inicio||'s/f'}</span></div>
    <div class="dl-val">${estadoBadge(e.estado)}<span style="margin-top:3px">${fmt(e.area,2)} ha</span></div>
  </div>`;
}
function listEvents(evts,limit=250){
  if(!evts.length)return `<div class="empty"><div class="big">🗂️</div>Sin registros</div>`;
  return evts.slice(0,limit).map(eventRowHTML).join('')+
    (evts.length>limit?`<div class="note info" style="margin-top:8px">Mostrando ${limit} de ${fmt(evts.length)}.</div>`:'');
}

function buildDrill(type){
  const k=computeKPIs();
  const [base,arg]=type.split(':');

  if(type==='insumos-total'){
    const agg=insumosAgg(k.scoped);
    const body=agg.map(a=>`<div class="dl-item click" data-drill="insumo:${esc(a.desc)}">
      <div class="dl-main"><b>${esc(clip(a.desc,26))}</b> ${unitTag(a.unit)}<span>${a.eventos} eventos · Dosis ${fmt(a.avgDosis,2)}/ha · ${fmt(a.area,1)} ha</span></div>
      <div class="dl-val"><b>${fmt(a.cantidad,1)}</b><span>${a.unit}</span></div></div>`).join('');
    return ['📦 Insumos entregados',`${scopeLabel()} · ${agg.length} insumos distintos`,body];
  }
  if(base==='insumo'){
    const evs=insumoEvents(k.scoped).filter(e=>(STATE.prodsByEvent[e.event_id]||[]).some(p=>p.producto_desc===arg));
    const prods=prodsFor(evs).filter(p=>p.producto_desc===arg);
    const cant=prods.reduce((s,p)=>s+p.cantidad,0), area=prods.reduce((s,p)=>s+p.area_cubierta,0);
    const avgD=prods.length?prods.reduce((s,p)=>s+p.dosis,0)/prods.length:0;
    const unit=inferUnit(arg,prods.length?prods[0].producto_codigo:null);
    const byProd={}; evs.forEach(e=>{byProd[e.productor]=(byProd[e.productor]||0)+((STATE.prodsByEvent[e.event_id]||[]).filter(p=>p.producto_desc===arg).reduce((s,p)=>s+p.cantidad,0))});
    const top=Object.entries(byProd).sort((a,b)=>b[1]-a[1]);
    const body=`<div class="diff-grid"><div class="diff-box"><div class="v">${fmt(cant,1)}</div><div class="l">Total ${unit}</div></div>
      <div class="diff-box"><div class="v">${fmt(avgD,2)}</div><div class="l">Dosis/ha</div></div>
      <div class="diff-box"><div class="v">${fmt(evs.length)}</div><div class="l">Eventos</div></div>
      <div class="diff-box"><div class="v">${fmt(top.length)}</div><div class="l">Productores</div></div></div>
      <div class="pc-sub-h">👥 Por productor</div>
      ${top.map(([p,c])=>`<div class="dl-item"><div class="dl-main"><b>${esc(clip(p,26))}</b></div><div class="dl-val"><b>${fmt(c,1)}</b><span>${unit}</span></div></div>`).join('')}`;
    return ['📦 '+esc(clip(arg,24))+' '+unitTag(unit),scopeLabel(),body];
  }
  if(base==='hacienda'){
    // drill por hacienda: suertes, área física, insumos
    const evs=insumoEvents(k.scoped).filter(e=>e.productor===arg&&e.estado!=='SUSPENDIDA');
    const suerteMap={};
    evs.forEach(e=>{
      if(!suerteMap[e.hac_sue_key])suerteMap[e.hac_sue_key]={hs:e.hac_sue,ev:0,ha:0,haFis:maestroArea(e.hac_sue_key)||0};
      suerteMap[e.hac_sue_key].ev++; suerteMap[e.hac_sue_key].ha+=e.area;
    });
    const suerteArr=Object.values(suerteMap).sort((a,b)=>b.ha-a.ha);
    const totalHa=suerteArr.reduce((s,x)=>s+x.ha,0);
    const totalFis=suerteArr.reduce((s,x)=>s+x.haFis,0);
    // insumos de esta hacienda
    const prods=prodsFor(evs);const pmap={};
    prods.forEach(p=>{if(!pmap[p.producto_desc])pmap[p.producto_desc]={cant:0,ev:new Set(),cod:p.producto_codigo};pmap[p.producto_desc].cant+=p.cantidad;pmap[p.producto_desc].ev.add(p.event_id)});
    const body=`<div class="diff-grid">
      <div class="diff-box"><div class="v">${suerteArr.length}</div><div class="l">Suertes</div></div>
      <div class="diff-box"><div class="v">${fmt(evs.length)}</div><div class="l">Eventos</div></div>
      <div class="diff-box"><div class="v">${fmt(totalHa,1)}</div><div class="l">Ha-evento</div></div>
      <div class="diff-box"><div class="v">${fmt(totalFis,1)}</div><div class="l">Ha física</div></div></div>
      <div class="pc-sub-h">🔲 Suertes · Área física vs operativa</div>
      ${suerteArr.map(s=>`<div class="dl-item"><div class="dl-main"><b>${esc(s.hs)}</b><span>${s.ev} eventos · ${fmt(s.ha,1)} ha-evento</span></div>
        <div class="dl-val"><b>${fmt(s.haFis,2)}</b><span>ha maestro</span></div></div>`).join('')}
      <div class="pc-sub-h" style="margin-top:14px">📦 Insumos entregados</div>
      ${Object.entries(pmap).sort((a,b)=>b[1].cant-a[1].cant).map(([d,v])=>{const u=inferUnit(d,v.cod);
        return `<div class="dl-item"><div class="dl-main"><b>${esc(clip(d,24))}</b> ${unitTag(u)}<span>${v.ev.size} eventos</span></div><div class="dl-val"><b>${fmt(v.cant,1)}</b><span>${u}</span></div></div>`}).join('')}`;
    return ['🏗️ '+esc(clip(arg,22)),`${suerteArr.length} suertes · ${fmt(totalFis,1)} ha física`,body];
  }
  if(base==='labor'){
    const evs=insumoEvents(k.scoped).filter(e=>e.labor===arg&&e.estado!=='SUSPENDIDA');
    const nombre=evs[0]?.labor_nombre||arg;
    const ha=evs.reduce((s,e)=>s+e.area,0);
    return ['🌾 '+esc(arg),`${esc(nombre)} · ${fmt(ha,1)} ha-evento`,listEvents(evs)];
  }
  if(type==='ejecutadas')return ['✅ Eventos ejecutados',`${scopeLabel()} · ${fmt(k.eje.length)}`,listEvents(k.eje)];
  if(type==='reservadas')return ['⏳ Reservas activas',`${scopeLabel()} · ${fmt(k.res.length)}`,listEvents(k.res)];
  if(type==='madurante'){
    const mad=madEvents(k.scoped);
    return ['✈️ Madurante aéreo',`No facturado · ${fmt(mad.length)} aplicaciones`,
      `<div class="note" style="margin-bottom:10px">${svg('ban')} Insumo no facturado a productores. Se gestiona aparte y no suma en las estadísticas de insumos.</div>
       <button class="al-btn ok" style="width:100%;justify-content:center;margin-bottom:12px;padding:11px" data-nav="madurante">Abrir módulo completo de Madurante ▸</button>`+listEvents(mad)];
  }
  if(type==='suertes'){
    const map={}; k.ins.forEach(e=>{if(!map[e.hac_sue_key])map[e.hac_sue_key]={key:e.hac_sue_key,hs:e.hac_sue,prod:e.productor,ev:0,ha:0};map[e.hac_sue_key].ev++;});
    const arr=Object.values(map).sort((a,b)=>b.ev-a.ev);
    const body=arr.map(s=>{const a=maestroArea(s.key);return `<div class="dl-item"><div class="dl-main"><b>${esc(s.hs)}</b><span>${esc(clip(s.prod,24))}</span></div>
      <div class="dl-val"><b>${s.ev}</b><span>${a!=null?fmt(a,1)+' ha':'sin maestro'}</span></div></div>`}).join('');
    return ['🔲 Suertes atendidas',`${scopeLabel()} · ${fmt(arr.length)}`,body];
  }
  if(type==='productores'){
    const arr=productoresAgg(k.scoped);
    const body=arr.map(p=>`<div class="dl-item click" data-goto-prod="${esc(p.productor)}"><div class="dl-main"><b>${esc(clip(p.productor,26))}</b><span>${p.haciendas.length} hac · ${p.suertes} suertes</span></div>
      <div class="dl-val"><b>${p.eventos}</b><span>eventos</span></div></div>`).join('');
    return ['👥 Productores',`${scopeLabel()} · ${fmt(arr.length)}`,body];
  }
  if(type==='area-ejecutada'){
    const eje=k.eje.slice().sort((a,b)=>b.area-a.area);
    return ['📐 Hectáreas ejecutadas',`Suma ${fmt(k.haEjecutada,1)} ha · ${eje.length} eventos`,
      `<div class="note info" style="margin-bottom:10px">Suma del área de cada evento ejecutado (carga operativa; una suerte con varios eventos suma varias veces).</div>`+listEvents(eje)];
  }
  if(type==='superficie-fisica'){
    const suertesEje=new Set(k.eje.map(e=>e.hac_sue_key));
    const arr=[...suertesEje].map(key=>{const e=k.eje.find(x=>x.hac_sue_key===key);const a=maestroArea(key);return {hs:e.hac_sue,prod:e.productor,area:a}}).sort((a,b)=>(b.area||0)-(a.area||0));
    const body=arr.map(s=>`<div class="dl-item"><div class="dl-main"><b>${esc(s.hs)}</b><span>${esc(clip(s.prod,24))}</span></div>
      <div class="dl-val"><b>${s.area!=null?fmt(s.area,2):'—'}</b><span>ha maestro</span></div></div>`).join('');
    return ['🗺️ Superficie física',`${fmt(k.supFisica,1)} ha · ${arr.length} suertes únicas`,
      `<div class="note info" style="margin-bottom:10px">Superficie real atendida: cada suerte ejecutada cuenta una sola vez, con su área del Maestro.</div>`+body];
  }
  if(type==='alertas')return buildAlertsDrill(insumoEvents(k.scoped),scopeLabel(),k.pendientes);
  if(type==='alertas-global'){
    const allAlert=STATE.events.filter(e=>e.alertas&&e.alertas.length);
    const pend=allAlert.reduce((s,e)=>s+e.alertas.filter(a=>(STATE.reviews[e.event_id+'|'+a]||{}).status!=='resuelta').length,0);
    return buildAlertsDrill(STATE.events,'Todos los datos',pend);
  }

  if(base==='prod-suertes'||base==='prod-eventos'||base==='prod-insumos'){
    const evs=insumoEvents(scopedEvents()).filter(e=>e.productor===arg);
    if(base==='prod-insumos'){
      const prods=prodsFor(evs); const pmap={};
      prods.forEach(p=>{if(!pmap[p.producto_desc])pmap[p.producto_desc]={cant:0,area:0,ev:new Set()};pmap[p.producto_desc].cant+=p.cantidad;pmap[p.producto_desc].area+=p.area_cubierta;pmap[p.producto_desc].ev.add(p.event_id)});
      const body=Object.entries(pmap).sort((a,b)=>b[1].cant-a[1].cant).map(([d,v])=>`<div class="dl-item"><div class="dl-main"><b>${esc(clip(d,28))}</b><span>${v.ev.size} eventos · ${fmt(v.area,1)} ha</span></div><div class="dl-val"><b>${fmt(v.cant,1)}</b><span>cant.</span></div></div>`).join('');
      return ['📦 Insumos · '+esc(clip(arg,20)),`${Object.keys(pmap).length} productos`,body];
    }
    return [(base==='prod-suertes'?'🔲 Suertes · ':'📋 Eventos · ')+esc(clip(arg,20)),`${evs.length} eventos`,listEvents(evs)];
  }
  return ['Detalle','',`<div class="empty">Sin datos</div>`];
}

/* ─── Alertas con validación / reparación ─── */
const ALERT_META={
  'FECHA_EJECUCION_ANTERIOR_A_RESERVA':['sev-danger','⛔','Fecha de ejecución anterior a la reserva'],
  'SUERTE_SIN_MAESTRO':['sev-warn','🗂️','Suerte sin registro en el Maestro'],
  'AREA_MAYOR_MAESTRO':['sev-warn','📐','Área del evento mayor a la del Maestro'],
  'SUSPENDIDA_CON_EJECUCION':['sev-danger','⚠️','Suspendida pero marcada como ejecutada'],
  'AREA_INCONSISTENTE_EN_MEZCLA':['sev-info','🧪','Áreas distintas dentro de la mezcla'],
};
function buildAlertsDrill(sourceEvents,label,pendientes){
  const items=[];
  sourceEvents.forEach(e=>{(e.alertas||[]).forEach(a=>items.push({e,a,key:e.event_id+'|'+a}))});
  const byType={}; items.forEach(it=>{(byType[it.a]=byType[it.a]||[]).push(it)});
  let html=`<div class="note" style="margin-bottom:12px">${svg('alert')} Revisa cada alerta y márcala como <b>revisada</b> o <b>resuelta</b>. Las resoluciones quedan guardadas en el dispositivo.</div>`;
  Object.entries(byType).forEach(([type,arr])=>{
    const [sev,ic,lb]=ALERT_META[type]||['sev-info','•',type];
    const pend=arr.filter(it=>(STATE.reviews[it.key]||{}).status!=='resuelta').length;
    html+=`<div class="pc-sub-h">${ic} ${esc(lb)} · ${arr.length} <span style="color:var(--amber);margin-left:4px">${pend} por resolver</span></div>`;
    html+=arr.slice(0,60).map(it=>alertItemHTML(it,sev,ic)).join('');
    if(arr.length>60)html+=`<div class="note info">Mostrando 60 de ${arr.length}.</div>`;
  });
  html+=`<input type="hidden" id="alertScope" value="${sourceEvents.length===STATE.events.length?'global':'scoped'}">`;
  return ['⚠️ Alertas de validación',`${label} · ${fmt(pendientes)} por resolver`,items.length?html:`<div class="empty"><div class="big">✅</div>Sin alertas</div>`];
}
function reopenAlerts(){
  const global=$('#alertScope')?.value==='global';
  if(global){const [t,s,h]=buildDrill('alertas-global');openDrawer(t,s,h);}
  else{const [t,s,h]=buildDrill('alertas');openDrawer(t,s,h);}
}
function alertItemHTML(it,sev,ic){
  const rev=STATE.reviews[it.key]||{status:'pendiente'};
  const st=rev.status||'pendiente';
  const repairable=it.a==='AREA_MAYOR_MAESTRO';
  return `<div class="al-item ${sev} ${st==='resuelta'?'resolved':''}" id="al-${btoa(it.key).replace(/=/g,'')}">
    <div class="al-top"><div class="al-ic">${ic}</div>
      <div class="al-txt"><b>${esc(it.e.hac_sue)} · ${esc(it.e.labor)} · doc ${esc(it.e.documento)}</b>
        <span>${esc(clip(it.e.productor,26))} · ${it.e.fecha_ejecucion||it.e.fecha_inicio||'s/f'}${it.a==='AREA_MAYOR_MAESTRO'?` · ${fmt(it.e.area,2)} ha vs Maestro ${fmt(maestroArea(it.e.hac_sue_key),2)} ha`:''}</span></div>
      <span class="al-status ${st}">${st}</span></div>
    <div class="al-actions">
      ${st!=='revisada'?`<button class="al-btn rev" data-review="${esc(it.key)}|revisada">Marcar revisada</button>`:''}
      ${st!=='resuelta'?`<button class="al-btn ok" data-review="${esc(it.key)}|resuelta">Resolver</button>`:''}
      ${repairable&&st!=='resuelta'?`<button class="al-btn ok" data-repair="${esc(it.e.hac_sue_key)}|${it.e.area}|${esc(it.key)}">Reparar Maestro (${fmt(it.e.area,2)} ha)</button>`:''}
      ${st!=='pendiente'?`<button class="al-btn undo" data-review="${esc(it.key)}|pendiente">Deshacer</button>`:''}
    </div></div>`;
}
async function setReview(key,status){
  if(status==='pendiente')delete STATE.reviews[key];
  else STATE.reviews[key]={status,ts:Date.now()};
  await idbSet('reviews',STATE.reviews);
  renderNav(); reopenAlerts();
  toast(status==='resuelta'?'Alerta resuelta ✓':status==='revisada'?'Marcada como revisada':'Restablecida',status==='resuelta'?'ok':'');
}
async function repairMaestro(key,area,reviewKey){
  STATE.overrides.maestro[key]=Number(area);
  await idbSet('overrides',STATE.overrides);
  // recompute alerts for affected events (area override may clear AREA_MAYOR)
  STATE.events.forEach(e=>{
    if(e.hac_sue_key===key){
      const ma=maestroArea(key);
      e.alertas=(e.alertas||[]).filter(a=>a!=='AREA_MAYOR_MAESTRO');
      if(ma&&e.area>ma*1.05)e.alertas.push('AREA_MAYOR_MAESTRO');
    }
  });
  STATE.reviews[reviewKey]={status:'resuelta',ts:Date.now(),note:'override área='+area};
  await idbSet('reviews',STATE.reviews);
  renderNav(); reopenAlerts();
  toast('Maestro reparado y alerta resuelta ✓','ok');
}

/* ═══════════════════════════════════════════════════════════
   ADMIN
   ═══════════════════════════════════════════════════════════ */
function renderAdmin(){
  if(!STATE.admin){
    return `${secHead('admin','var(--grad-navy)','Administración','Acceso restringido')}
      <div class="lock-card">
        <div class="lk-ic">${svg('lock')}</div>
        <h3>Panel de administración</h3>
        <p>Ingrese la clave para actualizar datos y gestionar validaciones.</p>
        <div class="lk-err" id="lkErr"></div>
        <input type="password" id="adminPass" inputmode="numeric" maxlength="6" placeholder="••••••" autocomplete="off">
        <button class="btn-primary" data-admin-unlock>Desbloquear</button>
      </div>`;
  }
  const v=STATE.validaciones||{};
  const nSinM=(v.suertes_sin_maestro||[]).length;
  const nArea=(v.eventos_area_mayor||[]).length;
  const nFecha=(v.eventos_fecha_alerta||[]).length;
  const m=STATE.meta||{};
  return `${secHead('admin','var(--grad-navy)','Administración',scopeLabel())}

    <div class="panel-h"><h3><span class="emo">🔎</span> Validaciones de datos</h3></div>
    <div class="val-item warn" data-drill="alertas-global"><div class="vi-ic">🗂️</div>
      <div class="vi-txt"><b>${nSinM} suertes sin Maestro</b><span>${esc((v.suertes_sin_maestro||[]).slice(0,10).join(', '))}${nSinM>10?'…':''}</span></div><div class="vi-arrow">›</div></div>
    <div class="val-item warn" data-drill="alertas-global"><div class="vi-ic">📐</div>
      <div class="vi-txt"><b>${nArea} eventos con área mayor al Maestro</b><span>Toca para revisar y reparar</span></div><div class="vi-arrow">›</div></div>
    <div class="val-item danger" data-drill="alertas-global"><div class="vi-ic">⛔</div>
      <div class="vi-txt"><b>${nFecha} eventos: fecha de ejecución anterior a reserva</b><span>Toca para revisar</span></div><div class="vi-arrow">›</div></div>

    <div class="divider"></div>
    <div class="panel-h"><h3><span class="emo">📥</span> Actualizar datos</h3></div>
    <div class="note info" style="margin-bottom:12px">Sube el Excel SIAGRI (<b>registro de programación de labores</b>). Opcionalmente actualiza el Cronológico Maestro. El procesamiento ocurre en tu dispositivo — nada se envía a internet.</div>
    <div class="drop-zone" id="dzSiagri" data-dz="siagri">
      <div class="dz-ic">${svg('upload')}</div>
      <b id="dzSiagriTxt">Arrastra el Excel SIAGRI aquí</b>
      <span>o toca para seleccionar · hoja REPORTE</span>
    </div>
    <input type="file" id="fileSiagri" accept=".xlsx,.xls" style="display:none">

    <div style="height:10px"></div>
    <div class="drop-zone" id="dzMaestro" data-dz="maestro">
      <div class="dz-ic" style="background:var(--grad-green)">${svg('layers')}</div>
      <b id="dzMaestroTxt">Cronológico Maestro (opcional)</b>
      <span>Actualiza el Maestro de suertes</span>
    </div>
    <input type="file" id="fileMaestro" accept=".xlsx,.xls" style="display:none">

    <div id="procArea"></div>

    <div class="divider"></div>
    <div class="panel-h"><h3><span class="emo">ℹ️</span> Información del sistema</h3></div>
    <div class="info-list">
      <div class="ir"><span class="l">Versión de datos</span><span class="v">${esc(m.generated_at||'—')}</span></div>
      <div class="ir"><span class="l">Archivo fuente</span><span class="v">${esc(clip(m.archivo_fuente||'—',24))}</span></div>
      <div class="ir"><span class="l">Fecha de corte</span><span class="v">${esc(m.fecha_corte||'—')}</span></div>
      <div class="ir"><span class="l">Eventos</span><span class="v">${fmt(STATE.events.length)}</span></div>
      <div class="ir"><span class="l">Productos</span><span class="v">${fmt(STATE.products.length)}</span></div>
      <div class="ir"><span class="l">Suertes en Maestro</span><span class="v">${fmt(STATE.maestro.length)}</span></div>
      <div class="ir"><span class="l">Madurante aéreo (AAM)</span><span class="v">${fmt(STATE.events.filter(e=>e.es_madurante_aereo).length)}</span></div>
      <div class="ir"><span class="l">Reparaciones aplicadas</span><span class="v">${fmt(Object.keys(STATE.overrides.maestro).length)}</span></div>
    </div>
    <div style="height:10px"></div>
    <button class="btn-primary" style="background:var(--grad-green)" data-download-json>⬇︎ Descargar bootstrap.json actualizado</button>
    <div style="height:8px"></div>
    <button class="btn-primary" style="background:#fff;color:var(--red);box-shadow:none;border:1.5px solid var(--line)" data-admin-lock>Bloquear panel</button>
  `;
}

/* ─── Procesamiento SIAGRI (SheetJS) — replica procesar_siagri.py ─── */
function normHac(h){if(h==null)return '';return String(h).trim().replace(/\.0$/,'').replace(/\s+/g,'')}
function normSuerte(s){if(s==null)return '';return String(s).trim().toUpperCase().replace(/\.0$/,'').replace(/\s+/g,'')}
function normUnit(u){if(!u)return '';u=String(u).trim().toUpperCase();const map={'LT':'LT','L':'LT','LTS':'LT','LITROS':'LT','KG':'KG','KGS':'KG','GR':'GR','G':'GR','SACO':'SACO','SACOS':'SACO','SC':'SACO','UND':'UND','UNIDAD':'UND','GAL':'GAL','GALON':'GAL','HA':'HA'};return map[u]||u}
function excelSerialToYMD(serial){
  // Excel serial → fecha (base 1899-12-30, corrige bug bisiesto 1900)
  const ms=Math.round((serial-25569)*86400000);
  const d=new Date(ms); if(isNaN(d))return null;
  let y=d.getUTCFullYear(); if(y<1900)y+=1820; // captura errónea (serial negativo/anómalo) → igual que el pipeline oficial
  return `${String(y).padStart(4,'0')}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}
function excelDate(v){
  if(v==null||v==='')return null;
  if(typeof v==='number'){
    let ymd=null;
    try{ if(window.XLSX&&XLSX.SSF&&XLSX.SSF.parse_date_code){const d=XLSX.SSF.parse_date_code(v);if(d){let y=d.y;if(y<1900)y+=1820;ymd=`${y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`}} }catch(e){}
    if(!ymd)ymd=excelSerialToYMD(v);
    return ymd;
  }
  const s=String(v).trim();
  // normaliza años de captura errónea (<1900 → +1820), igual que el pipeline oficial: 0206→2026
  const fixY=y=>{y=parseInt(y,10);if(isNaN(y))return null;if(y<1900)y+=1820;return String(y).padStart(4,'0')};
  const m=s.match(/(\d{3,4})[-/](\d{1,2})[-/](\d{1,2})/);if(m)return `${fixY(m[1])}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  const m2=s.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{3,4})/);if(m2)return `${fixY(m2[3])}-${m2[2].padStart(2,'0')}-${m2[1].padStart(2,'0')}`;
  return s;
}
function sfloat(v){if(v==null||v==='')return 0;const n=parseFloat(String(v).replace(/,/g,''));return isNaN(n)?0:Math.round(n*1e6)/1e6}
function sint(v){if(v==null||v==='')return 0;const n=parseInt(parseFloat(v));return isNaN(n)?0:n}

async function processSiagri(fileSiagri,fileMaestro,logFn){
  logFn('Leyendo archivo SIAGRI…','dim');
  const wb=XLSX.read(await fileSiagri.arrayBuffer(),{type:'array',cellDates:false});
  let sheet=wb.SheetNames.find(n=>n.trim().toUpperCase()==='REPORTE')||wb.SheetNames.find(n=>/reporte/i.test(n))||wb.SheetNames[0];
  logFn('Hoja: '+sheet,'dim');
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheet],{header:1,raw:true,defval:null});
  // detectar header
  let hIdx=rows.findIndex(r=>r&&r.some(c=>['LABOR','Documento','Ejercicio'].includes(String(c).trim())));
  if(hIdx<0)hIdx=0;
  const H=rows[hIdx].map(c=>String(c||'').trim());
  const col=name=>H.indexOf(name);
  const C={ejercicio:col('Ejercicio'),semana:col('Semana'),fecha_inicio:col('Fecha Inicio'),fecha_final:col('Fecha Final'),
    labor:col('LABOR'),nombre_labor:col('Nombre Labor'),unidad:col('Unidad de Medida'),unidades:col('Unidades'),
    hacienda:col('Hacienda'),nombre_hacienda:col('Nombre Hacienda'),zona:col('Zona'),nombre_zona:col('Nombre Zona'),
    suerte:col('Suerte'),producto:col('Producto'),desc_producto:col('Desc. Producto'),dosis:col('Dosis'),cantidad:col('Cantidad'),
    usuario:col('Usuario'),fecha_ejec:col('Fecha ejecuccion'),suspendida:col('Suspendida? (0=No)'),documento:col('Documento'),
    bodega:col('Bodega'),nombre_bodega:col('Nombre Bodega'),con_reserva:col('Con Reserva?'),ejecutado:col('Ejecutado?')};
  logFn(`${H.length} columnas detectadas`,'ok');

  const data=rows.slice(hIdx+1).filter(r=>r&&(C.documento<0||r[C.documento]!=null));
  const g=(r,key)=>{const i=C[key];return (i>=0&&i<r.length)?r[i]:null};

  // excluir Sucuya
  let sucuya=0; const clean=data.filter(r=>{
    const z=String(g(r,'zona')||'').trim(),hac=normHac(g(r,'hacienda')),nh=String(g(r,'nombre_hacienda')||'').toLowerCase();
    if(z==='16'||hac==='16'||nh.includes('sucuya')){sucuya++;return false}return true});
  logFn(`Filas de datos: ${data.length} · Sucuya excluidas: ${sucuya}`,'dim');

  // maestro (para alertas)
  let maestro=STATE.maestro, maestroArr=STATE.maestro;
  if(fileMaestro){
    logFn('Leyendo Cronológico Maestro…','dim');
    const wb2=XLSX.read(await fileMaestro.arrayBuffer(),{type:'array',cellDates:false});
    const mmap={};
    wb2.SheetNames.forEach(sn=>{
      const mr=XLSX.utils.sheet_to_json(wb2.Sheets[sn],{header:1,raw:true,defval:null});
      mr.slice(1).forEach(r=>{
        if(!r)return; const hac=normHac(r[1]),sue=normSuerte(r[3]);
        if(hac==='16'||String(r[2]||'').toLowerCase().includes('sucuya'))return;
        const key=hac+'|'+sue;
        const entry={hac_sue:hac+sue,hac_sue_key:key,hacienda:hac,nombre_hacienda:String(r[2]||'').trim(),suerte:sue,
          area:sfloat(r[4]),variedad:String(r[5]||'').trim(),edad:sfloat(r[6]),tch_z2526:sfloat(r[7]),
          corte:String(r[10]||'').trim(),textura:String(r[12]||'').trim(),fecha_ult_corte:excelDate(r[13]),
          fecha_siembra:excelDate(r[14]),km:sfloat(r[15]),destino:String(r[18]||'').trim(),
          tenencia:String(r[19]||'').trim(),tipo_riego:String(r[20]||'').trim(),zona:String(r[23]||'').trim(),
          estado_maestro:String(r[24]||'').trim(),fuente:sn};
        if(!(key in mmap)||sn==='Productores')mmap[key]=entry;
      });
    });
    maestroArr=Object.values(mmap); maestro=maestroArr;
    logFn(`Maestro: ${maestroArr.length} suertes`,'ok');
  }
  const mArea={},mKeys=new Set(); maestroArr.forEach(m=>{mArea[m.hac_sue_key]=m.area;mKeys.add(m.hac_sue_key)});

  // agrupar eventos por Documento|Hac|Sue|Labor
  const emap={};
  clean.forEach(r=>{const key=`${String(g(r,'documento')||'').trim()}|${normHac(g(r,'hacienda'))}|${normSuerte(g(r,'suerte'))}|${String(g(r,'labor')||'').trim()}`;(emap[key]=emap[key]||[]).push(r)});

  const events=[],products=[]; let eid=0;
  const MAD=new Set(['AAM']);
  for(const ekey in emap){
    eid++; const er=emap[ekey],first=er[0];
    const hac=normHac(g(first,'hacienda')),sue=normSuerte(g(first,'suerte')),area=sfloat(g(first,'unidades'));
    const susp=String(g(first,'suspendida')||'0').trim()==='1';
    const conR=String(g(first,'con_reserva')||'').trim().toUpperCase()==='SI';
    const ejec=String(g(first,'ejecutado')||'').trim().toUpperCase()==='SI';
    let estado,alertas=[];
    if(susp){estado=ejec?'INCONSISTENTE':'SUSPENDIDA';if(ejec)alertas.push('SUSPENDIDA_CON_EJECUCION')}
    else if(ejec)estado='EJECUTADA'; else if(conR)estado='RESERVADA'; else estado='SIN CLASIFICAR';
    const fi=excelDate(g(first,'fecha_inicio')),fe=excelDate(g(first,'fecha_ejec'));
    if(fe&&fi&&fe<fi)alertas.push('FECHA_EJECUCION_ANTERIOR_A_RESERVA');
    const hsk=hac+'|'+sue;
    if(!mKeys.has(hsk))alertas.push('SUERTE_SIN_MAESTRO');
    if(mArea[hsk]&&area>mArea[hsk]*1.05)alertas.push('AREA_MAYOR_MAESTRO');
    const areas=new Set(er.map(r=>sfloat(g(r,'unidades'))));
    if(areas.size>1)alertas.push('AREA_INCONSISTENTE_EN_MEZCLA');
    const labor=String(g(first,'labor')||'').trim();
    const id='E'+String(eid).padStart(6,'0');
    const esMad=MAD.has(labor);
    events.push({event_id:id,documento:String(g(first,'documento')||'').trim(),zona:String(g(first,'zona')||'').trim(),
      zona_nombre:String(g(first,'nombre_zona')||'').trim(),productor:String(g(first,'nombre_hacienda')||'').trim(),
      hacienda:hac,suerte:sue,hac_sue:hac+sue,hac_sue_key:hsk,labor,labor_nombre:String(g(first,'nombre_labor')||'').trim(),
      area,fecha_inicio:fi,fecha_final:excelDate(g(first,'fecha_final')),fecha_ejecucion:fe,semana:sint(g(first,'semana')),
      ejercicio:String(g(first,'ejercicio')||'').trim(),estado,suspendida:susp,con_reserva:conR,ejecutado:ejec,
      num_productos:er.length,usuario:String(g(first,'usuario')||'').trim(),bodega:String(g(first,'bodega')||'').trim(),
      bodega_nombre:String(g(first,'nombre_bodega')||'').trim(),agrupacion:areas.size===1?'EXACTA':'INFERIDA',
      alertas,es_madurante_aereo:esMad,es_aereo:esMad||labor==='CAP'});
    er.forEach(pr=>products.push({event_id:id,producto_codigo:String(g(pr,'producto')||'').trim(),
      producto_desc:String(g(pr,'desc_producto')||'').trim(),unidad_medida:normUnit(g(pr,'unidad')),
      dosis:sfloat(g(pr,'dosis')),cantidad:sfloat(g(pr,'cantidad')),area_cubierta:sfloat(g(pr,'unidades')),
      estado,es_madurante_aereo:esMad}));
  }
  logFn(`Eventos: ${events.length} · Productos: ${products.length}`,'ok');

  // dates for meta
  const allDates=[]; events.forEach(e=>[e.fecha_ejecucion,e.fecha_inicio,e.fecha_final].forEach(d=>{if(d&&d.startsWith('20'))allDates.push(d)}));
  const now=new Date().toISOString().slice(0,19).replace('T',' ');
  const val={
    suertes_sin_maestro:[...new Set(events.filter(e=>e.alertas.includes('SUERTE_SIN_MAESTRO')).map(e=>e.hac_sue))].sort(),
    eventos_area_mayor:events.filter(e=>e.alertas.includes('AREA_MAYOR_MAESTRO')).map(e=>e.event_id),
    eventos_fecha_alerta:events.filter(e=>e.alertas.includes('FECHA_EJECUCION_ANTERIOR_A_RESERVA')).map(e=>e.event_id),
  };
  const meta={version:(STATE.meta.version||1)+1,generated_at:now,fecha_corte:allDates.length?allDates.sort().slice(-1)[0]:null,
    fecha_min:allDates.length?allDates.sort()[0]:null,archivo_fuente:fileSiagri.name,total_eventos:events.length,
    total_productos:products.length,total_maestro:maestroArr.length,filas_originales:data.length+sucuya,
    filas_validas:clean.length,filas_excluidas_sucuya:sucuya,
    labores_aereas_madurante:['AAM'],total_eventos_madurante_aereo:events.filter(e=>e.es_madurante_aereo).length,
    pwa_min_version:'1.0.0'};
  return {meta,events,products,maestro:maestroArr,validaciones:val};
}

/* ═══════════════════════════════════════════════════════════
   EXPORTAR EXCEL
   ═══════════════════════════════════════════════════════════ */
function exportXLSX(type){
  if(typeof XLSX==='undefined'){toast('SheetJS no cargado','err');return}
  const wb=XLSX.utils.book_new();const scoped=scopedEvents();
  const lbl=scopeLabel().replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑ0-9\s]/g,'').trim()||'CASUR';

  if(type==='insumos'){
    const agg=insumosAgg(scoped);
    const data=agg.map(a=>({'Producto':a.desc,'Código':a.codigo,'Unidad':a.unit,'Cantidad':Math.round(a.cantidad*100)/100,
      'Dosis/ha Prom.':Math.round(a.avgDosis*100)/100,'Ha-producto':Math.round(a.area*100)/100,'Eventos':a.eventos}));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(data),'Insumos');
    // detalle eventos+productos
    const ins=insumoEvents(scoped);const det=[];
    ins.forEach(e=>{(STATE.prodsByEvent[e.event_id]||[]).forEach(p=>{
      const u=inferUnit(p.producto_desc,p.producto_codigo);
      det.push({'Documento':e.documento,'Hacienda':e.productor,'Hac-Sue':e.hac_sue,'Suerte':e.suerte,
        'Labor':e.labor,'Estado':e.estado,'Fecha':e.fecha_ejecucion||e.fecha_inicio||'',
        'Producto':p.producto_desc,'Unidad':u,'Dosis/ha':p.dosis,'Cantidad':p.cantidad,'Área ha':p.area_cubierta});
    })});
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(det),'Detalle');
  }
  if(type==='productores'){
    const list=productoresAgg(scoped);
    const data=list.map(p=>({'Productor':p.productor,'Haciendas':p.haciendas.join(', '),'Suertes':p.suertes,
      'Eventos':p.eventos,'Ejecutadas':p.eje,'Reservadas':p.res,'Suspendidas':p.sus,
      'Ha-evento':Math.round(p.haEvento*100)/100,'Ha Física':Math.round(p.supFisica*100)/100,
      'Insumo Total (cant.)':Math.round(p.totalInsumo*100)/100,'Productos Distintos':p.productosDistintos,
      'Labores':p.labores.join(', ')}));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(data),'Productores');
    // detalle insumos por productor
    const ins=insumoEvents(scoped);const det=[];
    list.forEach(pr=>{const evs=ins.filter(e=>e.productor===pr.productor);
      const prods=prodsFor(evs);const pmap={};
      prods.forEach(p=>{if(!pmap[p.producto_desc])pmap[p.producto_desc]={cant:0,area:0,ev:0,cod:p.producto_codigo};pmap[p.producto_desc].cant+=p.cantidad;pmap[p.producto_desc].area+=p.area_cubierta;pmap[p.producto_desc].ev++});
      Object.entries(pmap).forEach(([d,v])=>{const u=inferUnit(d,v.cod);
        det.push({'Productor':pr.productor,'Producto':d,'Unidad':u,'Cantidad':Math.round(v.cant*100)/100,'Ha-producto':Math.round(v.area*100)/100,'Eventos':v.ev})});
    });
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(det),'Insumos por Productor');
  }
  if(type==='haciendas'){
    const ins=insumoEvents(scoped).filter(e=>e.estado!=='SUSPENDIDA');
    const hacMap={};
    ins.forEach(e=>{const nm=e.productor||'';
      if(!hacMap[nm])hacMap[nm]={nombre:nm,hacienda:e.hacienda,suertes:new Set(),eventos:0,haEvento:0};
      hacMap[nm].suertes.add(e.hac_sue_key);hacMap[nm].eventos++;hacMap[nm].haEvento+=e.area});
    const data=Object.values(hacMap).sort((a,b)=>b.haEvento-a.haEvento).map(h=>{let haFis=0;h.suertes.forEach(sk=>{const a=maestroArea(sk);if(a)haFis+=a});
      return {'Hacienda':h.nombre,'Código':h.hacienda,'Suertes':h.suertes.size,'Eventos':h.eventos,
        'Ha-evento':Math.round(h.haEvento*100)/100,'Ha Física':Math.round(haFis*100)/100}});
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(data),'Haciendas');
    // suertes
    const sMap={};ins.forEach(e=>{
      if(!sMap[e.hac_sue_key])sMap[e.hac_sue_key]={hacienda:e.productor,hacSue:e.hac_sue,suerte:e.suerte,eventos:0,haEvento:0,labores:new Set()};
      sMap[e.hac_sue_key].eventos++;sMap[e.hac_sue_key].haEvento+=e.area;sMap[e.hac_sue_key].labores.add(e.labor)});
    const sData=Object.values(sMap).sort((a,b)=>a.hacienda.localeCompare(b.hacienda)).map(s=>({
      'Hacienda':s.hacienda,'Hac-Sue':s.hacSue,'Suerte':s.suerte,'Eventos':s.eventos,
      'Ha-evento':Math.round(s.haEvento*100)/100,'Ha Maestro':maestroArea(s.hacSue+'|'+s.suerte)||'','Labores':Array.from(s.labores).join(', ')}));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(sData),'Suertes');
  }
  const fname=`Insumos_CASUR_${type}_${lbl}_${new Date().toISOString().slice(0,10)}.xlsx`;
  XLSX.writeFile(wb,fname);
  toast('Excel descargado ✓','ok');
}

/* ═══════════════════════════════════════════════════════════
   RENDER PRINCIPAL + DELEGACIÓN DE EVENTOS
   ═══════════════════════════════════════════════════════════ */
function render(){
  const app=$('#app');
  let html='';
  switch(STATE.section){
    case 'resumen':html=renderResumen();break;
    case 'explora':html=renderExplora();break;
    case 'insumos':html=renderInsumos();break;
    case 'productores':html=renderProductores();break;
    case 'madurante':html=renderMadurante();break;
    case 'admin':html=renderAdmin();break;
  }
  app.innerHTML=`<div class="section active">${html}</div>`;
  renderNav();
  if(STATE.section==='admin'&&STATE.admin)bindAdminFiles();
}

/* Un solo listener de click en document — nunca se pierde al re-renderizar */
document.addEventListener('click',e=>{
  const t=e.target;
  const nav=t.closest('[data-nav]');
  if(nav){STATE.section=nav.dataset.nav;STATE.expanded.clear();closeDrawer();render();window.scrollTo({top:0,behavior:'smooth'});return}
  const sc=t.closest('[data-scope]');
  if(sc){STATE.scope=sc.dataset.scope;if(sc.dataset.zone)STATE.scopeZone=sc.dataset.zone;
    STATE.expanded.clear();STATE.openProducers.clear();render();return}
  const clear=t.closest('[data-clear]');
  if(clear){const s=clear.dataset.clear;STATE.filters[s]=Object.fromEntries(Object.keys(STATE.filters[s]).map(k=>[k,'']));render();return}
  const exp=t.closest('[data-exp]');
  if(exp){const id=exp.dataset.exp;if(STATE.expanded.has(id))STATE.expanded.delete(id);else STATE.expanded.add(id);render();return}
  const prod=t.closest('[data-prod]');
  if(prod){const p=prod.dataset.prod;if(STATE.openProducers.has(p))STATE.openProducers.delete(p);else STATE.openProducers.add(p);render();return}
  const drill=t.closest('[data-drill]');
  if(drill){const [tt,ss,hh]=buildDrill(drill.dataset.drill);openDrawer(tt,ss,hh);return}
  // dentro del drawer
  const expD=t.closest('[data-exp-drawer]');
  if(expD){const ev=STATE.eventsById[expD.dataset.expDrawer];if(ev)showEventDetail(ev);return}
  const gotoP=t.closest('[data-goto-prod]');
  if(gotoP){closeDrawer();STATE.section='productores';STATE.openProducers.add(gotoP.dataset.gotoProd);render();
    setTimeout(()=>window.scrollTo({top:0,behavior:'smooth'}),50);return}
  const rev=t.closest('[data-review]');
  if(rev){const [key,status]=rev.dataset.review.split('|');setReview(key,status);return}
  const rep=t.closest('[data-repair]');
  if(rep){const [key,area,rk]=rep.dataset.repair.split('|');repairMaestro(key,area,rk);return}
  if(t.closest('[data-close-drawer]')||t.id==='drawerOv'){closeDrawer();return}
  // export
  const xpt=t.closest('[data-export]');
  if(xpt){exportXLSX(xpt.dataset.export);return}
  // admin
  if(t.closest('[data-admin-unlock]')){tryUnlock();return}
  if(t.closest('[data-admin-lock]')){STATE.admin=false;render();return}
  if(t.closest('[data-download-json]')){downloadBootstrap();return}
});
$('#drawerOv').addEventListener('click',closeDrawer);

/* filtros: delegación de input/change — corrige el bug de filtros */
document.addEventListener('input',e=>{
  const f=e.target.closest('[data-f]'); if(!f)return;
  const [sec,field]=f.dataset.f.split('.');
  STATE.filters[sec][field]=f.value;
  if(f.tagName==='INPUT'){ // re-render diferido para no perder foco de texto
    clearTimeout(window._ft); const val=f.value;
    window._ft=setTimeout(()=>{rerenderKeepFocus(f.dataset.f,val)},260);
  }
});
document.addEventListener('change',e=>{
  const f=e.target.closest('[data-f]'); if(!f)return;
  const [sec,field]=f.dataset.f.split('.');
  STATE.filters[sec][field]=f.value;
  if(f.tagName==='SELECT')render();
});
function rerenderKeepFocus(fkey,val){
  render();
  const el=document.querySelector(`[data-f="${fkey}"]`);
  if(el){el.focus();try{el.setSelectionRange(val.length,val.length)}catch(x){}}
}
$('#adminPass')&&null;
document.addEventListener('keydown',e=>{if(e.target.id==='adminPass'&&e.key==='Enter')tryUnlock()});

/* detalle de un evento (dentro del drawer) */
function showEventDetail(e){
  const prods=STATE.prodsByEvent[e.event_id]||[];
  const ma=maestroArea(e.hac_sue_key);
  const html=`
    <div class="diff-grid"><div class="diff-box"><div class="v">${fmt(e.area,2)}</div><div class="l">Área ha</div></div>
      <div class="diff-box"><div class="v">${ma!=null?fmt(ma,2):'—'}</div><div class="l">Maestro ha</div></div>
      <div class="diff-box"><div class="v">${e.num_productos}</div><div class="l">Productos</div></div>
      <div class="diff-box"><div class="v">S${e.semana}</div><div class="l">Semana</div></div></div>
    <div class="info-list" style="margin-bottom:12px">
      <div class="ir"><span class="l">Estado</span><span class="v">${estadoBadge(e.estado)}</span></div>
      <div class="ir"><span class="l">Labor</span><span class="v">${esc(e.labor)} · ${esc(e.labor_nombre)}</span></div>
      <div class="ir"><span class="l">Documento</span><span class="v">${esc(e.documento)}</span></div>
      <div class="ir"><span class="l">Zona</span><span class="v">${esc(e.zona_nombre||ZONAS[e.zona]||e.zona)}</span></div>
      <div class="ir"><span class="l">Reserva</span><span class="v">${e.fecha_inicio||'—'} → ${e.fecha_final||'—'}</span></div>
      <div class="ir"><span class="l">Ejecución</span><span class="v">${e.fecha_ejecucion||'—'}</span></div>
      <div class="ir"><span class="l">Bodega</span><span class="v">${esc(clip(e.bodega_nombre||'—',20))}</span></div>
    </div>
    ${e.alertas&&e.alertas.length?`<div class="note" style="margin-bottom:12px">⚠️ ${e.alertas.map(a=>(ALERT_META[a]||['','',a])[2]).join(' · ')}</div>`:''}
    <div class="pc-sub-h">📦 Productos del evento</div>
    <div class="tbl-wrap"><table class="mini-tbl">
      <thead><tr><th style="text-align:left">Producto</th><th class="num">Dosis</th><th class="num">Cant.</th></tr></thead>
      <tbody>${prods.map(p=>`<tr><td>${esc(clip(p.producto_desc,26))}</td><td class="num">${fmt(p.dosis,2)}</td><td class="num">${fmt(p.cantidad,2)}</td></tr>`).join('')}</tbody>
    </table></div>`;
  openDrawer(`${esc(e.hac_sue)} · ${esc(e.labor)}`,esc(clip(e.productor,30)),html);
}

/* ─── Admin: desbloqueo + archivos ─── */
function tryUnlock(){
  const inp=$('#adminPass'); if(!inp)return;
  if(inp.value===ADMIN_PASS){STATE.admin=true;render();toast('Panel desbloqueado','ok')}
  else{const er=$('#lkErr');if(er)er.textContent='Clave incorrecta';inp.value='';inp.focus()}
}
let _siagriFile=null,_maestroFile=null;
function bindAdminFiles(){
  const dzS=$('#dzSiagri'),dzM=$('#dzMaestro'),fS=$('#fileSiagri'),fM=$('#fileMaestro');
  if(!dzS)return;
  const wire=(dz,input,setter,txtId)=>{
    dz.onclick=()=>input.click();
    dz.ondragover=e=>{e.preventDefault();dz.classList.add('drag')};
    dz.ondragleave=()=>dz.classList.remove('drag');
    dz.ondrop=e=>{e.preventDefault();dz.classList.remove('drag');if(e.dataTransfer.files[0])handleFile(e.dataTransfer.files[0],setter,dz,txtId)};
    input.onchange=()=>{if(input.files[0])handleFile(input.files[0],setter,dz,txtId)};
  };
  wire(dzS,fS,v=>_siagriFile=v,'dzSiagriTxt');
  wire(dzM,fM,v=>_maestroFile=v,'dzMaestroTxt');
}
function handleFile(file,setter,dz,txtId){
  setter(file); dz.classList.add('has-file');
  $('#'+txtId).textContent='✓ '+clip(file.name,30);
  if(_siagriFile)runProcessing();
}
async function runProcessing(){
  const area=$('#procArea');
  area.innerHTML=`<div class="proc-log" id="procLog"></div>`;
  const log=$('#procLog');
  const logFn=(msg,cls='')=>{log.innerHTML+=`<div class="${cls}">› ${esc(msg)}</div>`;log.scrollTop=log.scrollHeight};
  try{
    logFn('Iniciando procesamiento…');
    const result=await processSiagri(_siagriFile,_maestroFile,logFn);
    STATE.pending=result;
    const old=STATE.meta;
    const diff=(a,b)=>{const d=b-a;return d===0?'':(d>0?'up':'down')};
    logFn('✔ Procesamiento completado','ok');
    area.innerHTML+=`
      <div class="diff-grid" style="margin-top:14px">
        <div class="diff-box"><div class="v ${diff(old.total_eventos,result.meta.total_eventos)}">${fmt(result.meta.total_eventos)}</div><div class="l">Eventos (${result.meta.total_eventos>=old.total_eventos?'+':''}${result.meta.total_eventos-old.total_eventos})</div></div>
        <div class="diff-box"><div class="v ${diff(old.total_productos,result.meta.total_productos)}">${fmt(result.meta.total_productos)}</div><div class="l">Productos</div></div>
        <div class="diff-box"><div class="v ${diff(old.total_maestro,result.meta.total_maestro)}">${fmt(result.meta.total_maestro)}</div><div class="l">Maestro</div></div>
        <div class="diff-box"><div class="v">${fmt(result.meta.total_eventos_madurante_aereo)}</div><div class="l">Madurante</div></div>
      </div>
      <div class="note info" style="margin:4px 0 10px">Revisa los totales. Al aplicar, la app usará estos datos y podrás descargar el <b>bootstrap.json</b> para reemplazarlo en el repositorio.</div>
      <button class="btn-primary" data-apply-pending>✓ Aplicar actualización</button>`;
  }catch(err){logFn('ERROR: '+err.message,'err');toast('Error al procesar','err');console.error(err)}
}
document.addEventListener('click',e=>{if(e.target.closest('[data-apply-pending]'))applyPending()});
async function applyPending(){
  if(!STATE.pending)return;
  const d=STATE.pending;
  await idbSet('bootstrap_local',d); await idbSet('bootstrap',d);
  STATE.meta=d.meta;STATE.events=d.events;STATE.products=d.products;STATE.maestro=d.maestro;STATE.validaciones=d.validaciones;
  STATE.eventsById={};STATE.prodsByEvent={};
  STATE.events.forEach(e=>STATE.eventsById[e.event_id]=e);
  STATE.products.forEach(p=>{(STATE.prodsByEvent[p.event_id]=STATE.prodsByEvent[p.event_id]||[]).push(p)});
  STATE.pending=null;_siagriFile=null;_maestroFile=null;
  $('#syncTxt').textContent='v'+(d.meta.version||1);
  render();toast('Datos actualizados ✓','ok');
}
function downloadBootstrap(){
  const d=STATE.pending||{meta:STATE.meta,events:STATE.events,products:STATE.products,maestro:STATE.maestro,validaciones:STATE.validaciones};
  const blob=new Blob([JSON.stringify(d)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='bootstrap.json';a.click();URL.revokeObjectURL(url);
  toast('bootstrap.json descargado','ok');
}

/* ═══════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════ */
async function init(){
  try{
    await loadData();
    $('#syncTxt').textContent='v'+(STATE.meta.version||1);
    render();
    setTimeout(()=>$('#loader').classList.add('hide'),300);
  }catch(err){
    $('#loaderTxt').innerHTML='Error al cargar datos.<br>Recarga la página.';
    console.error(err);
  }
  /* [INTEGRACIÓN App Maestra] Registro de Service Worker propio DESACTIVADO:
     dentro de "Negocios de Caña CASUR" solo debe existir el SW raíz. El SW
     standalone de Insumos borraba cachés que no coincidieran con su propio
     CACHE_VERSION, algo incompatible con el SW maestro. El repositorio
     fuente standalone conserva su SW intacto. */
  // if('serviceWorker' in navigator){try{await navigator.serviceWorker.register('sw.js')}catch(e){}}
}

/* [INTEGRACIÓN App Maestra] Lógica de instalación standalone (PWA install
   banner, beforeinstallprompt, appinstalled, hint iOS) ELIMINADA por
   completo — la instalación pertenece únicamente a la PWA maestra
   (Negocios de Caña). El repositorio fuente standalone conserva esta
   lógica intacta; aquí se retira en vez de solo ocultar, para que no
   pueda activarse accidentalmente ni fallar por elementos inexistentes. */

init();
