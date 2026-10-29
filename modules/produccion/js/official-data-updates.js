import {protectModuleActivity} from '../../../core/updates/activity-guard.js';
import {contextStore,restoreCoordinator} from '../../../core/updates/context-store.js';
import {APP_VERSION} from '../../../core/versions/versions.js';
import {loadOperationalSourceSnapshot} from '../../../core/shared-data/master-store.js';
import {officialSourcePriority} from './official-source-policy.js';
import {compareMaestroVersions} from '../../../master/adapters/master-to-riego-adapter.js';

const SOURCE_KEY='casur-production-source',CONTEXT_KEY='casur-production-update-context';
const guard=protectModuleActivity(window);
let checking=false,reloading=false,lastCheck=0;
const read=(store,key)=>{try{return store.getItem(key);}catch{return null;}};
const put=(store,key,value)=>{try{store.setItem(key,value);return true;}catch{return false;}};
const effective=()=>window.CRONO_DATA?.meta?.dataVersion;
const local=()=>!!window.CASUR_OPERATIONAL_LOCAL || !!window.CRONO_DATA?.meta?.manualChanges ||
 !!(window.CASUR_MASTER_OVERLAY&&window.CASUR_MASTER_OVERLAY.dataVersion===effective());
const status=text=>{const el=document.getElementById('casurDataStatus');if(el)el.textContent=text;};
function contextNotice(text){
 status(text);let el=document.getElementById('casurContextNotice');
 if(!el){el=document.createElement('p');el.id='casurContextNotice';el.className='no-print export-excluded';el.dataset.exportExclude='true';el.setAttribute('role','status');el.style.cssText='max-width:1180px;margin:0 auto;padding:0 14px 6px;font-size:12px;line-height:1.4;color:#334155';document.querySelector('header')?.append(el);}
 el.textContent=text;
}

const navigation=contextStore(sessionStorage,localStorage,APP_VERSION);
let applyingContext=false,userChoice=0,userChoiceSnapshot=null;
const bootReady=async()=>{
 if(document.readyState!=='complete')await new Promise(resolve=>window.addEventListener('load',resolve,{once:true}));
 await window.CASUR_OVERLAY_READY;
 if(!window.CASUR_PRODUCTION_READY)await new Promise(resolve=>document.addEventListener('casur-production-ready',resolve,{once:true}));
};
function captureContext(){
 const crono=document.getElementById('cronoContent'),selection=window.CASUR_CRONO_SELECTION?.capture();
 const cronoView=document.getElementById('cronoPrintPanel')?(crono?.dataset.geoScope==='lot'?'lot':'farm'):selection?.keys?.length?'multiple':'home';
 return JSON.parse(JSON.stringify({maestroView:window.CASUR_MAESTRO_UX?.capture(),crono:selection,cronoView,history:window.CASUR_HISTORY_SELECTION?.capture(),
  cronoScope:crono?.dataset.geoScope||'',producer:document.getElementById('cronoProducerSelect')?.value,
  lot:crono?.dataset.geoLotId,entity:typeof currentEntity!=='undefined'?currentEntity?.code:null,
  historyIndividual:!!document.getElementById('printPanel'),historyPeriod:window.CASUR_HISTORICAL_PERIOD_STATE,
  viewClasses:[...document.body.classList].filter(c=>/^casur-(hide-|zone-)/.test(c)),
  sections:[...document.querySelectorAll('details[id]')].filter(x=>x.open).map(x=>x.id),scroll:scrollY}));
}
export function saveUpdateContext(options={}){
 if(!window.CASUR_PRODUCTION_READY)return false;
 return navigation.save(captureContext(),options);
}
window.CASUR_SAVE_UPDATE_CONTEXT=saveUpdateContext;
function applyContext(c){
 if(!c||!window.CASUR_CRONO_SELECTION?.restore||!window.CASUR_HISTORY_SELECTION?.restore||!window.CRONO_DATA?.producers)return false;
 applyingContext=true;let missing=false;
 try{
  const rows=window.CRONO_DATA.producers.flatMap(p=>p.details),keys=new Set(rows.map(r=>String(r.code)+'::'+String(r.suerte)));
  const crono={...c.crono,keys:(c.crono?.keys||[]).filter(k=>keys.has(k))};
  missing=crono.keys.length!==(c.crono?.keys||[]).length;
  if(c.crono)window.CASUR_CRONO_SELECTION.restore(crono);
  const cronoView=c.cronoView||(c.crono?.keys?.length?'multiple':c.lot?'lot':c.producer?'farm':'home');
  if(cronoView==='lot'&&c.lot){const row=rows.find(r=>r.codLote===c.lot);if(row)window.selectCronoSuerteSuggestion(row.code,row.suerte);else missing=true;}
  else if(cronoView==='farm'&&c.producer){if(window.CRONO_DATA.producers.some(p=>String(p.code)===String(c.producer)))window.selectCronoProducer(c.producer);else missing=true;}
  const exists=code=>typeof getEntity==='function'&&!!getEntity(code);
  const selected=(c.history?.selected||[]).filter(exists),farms={};
  if(selected.length!==(c.history?.selected||[]).length)missing=true;
  for(const [code,state]of Object.entries(c.history?.farms||{})){
   if(!exists(code)){missing=true;continue;}
   if(state.mode==='partial'){const lotIds=(state.lotIds||[]).filter(id=>exists('LOTE::'+id));if(lotIds.length!==(state.lotIds||[]).length)missing=true;if(lotIds.length)farms[code]={...state,lotIds};}
   else farms[code]=state;
  }
  if(c.history&&(selected.length||Object.keys(farms).length))window.CASUR_HISTORY_SELECTION.restore({...c.history,selected,farms});
  const historyIndividual=c.historyIndividual??!(c.history?.selected?.length||Object.keys(c.history?.farms||{}).length);
  if(historyIndividual&&c.entity){
   if(exists(c.entity)){
    if(!c.historyPeriod&&c.sections?.includes('fichaSection'))missing=true;
    if(c.historyPeriod)Object.assign(window.CASUR_HISTORICAL_PERIOD_STATE,{periodMode:c.historyPeriod.periodMode||'latest',selectedZafras:[...(c.historyPeriod.selectedZafras||[])]});
    window.renderEntity(c.entity);
   }else missing=true;
  }
  // Rendering may open sections; restore their saved state only after the final view exists.
  if(Array.isArray(c.viewClasses))for(const name of ['casur-hide-crono','casur-hide-historico','casur-hide-zone','casur-hide-executive','casur-zone-crono-only','casur-zone-hist-only'])document.body.classList.toggle(name,c.viewClasses.includes(name));
  if(Array.isArray(c.sections))for(const el of document.querySelectorAll('details[id]'))el.open=c.sections.includes(el.id);
  window.CASUR_MAESTRO_UX?.restore(c.maestroView,c.sections);
  const epoch=userChoice;requestAnimationFrame(()=>{if(epoch===userChoice)scrollTo(0,Number.isFinite(c.scroll)?c.scroll:0);});
  return {message:missing?'Parte de la selección guardada ya no está disponible o la versión anterior no guardó el periodo histórico. Volvé a seleccionar la suerte o las zafras.':null};
 }finally{applyingContext=false;}
}
const recovery=restoreCoordinator({store:navigation,ready:bootReady,apply:applyContext,notice:contextNotice});
window.CASUR_CANCEL_UPDATE_CONTEXT=()=>{if(!applyingContext){userChoice++;recovery.cancel();const notice=document.getElementById('casurContextNotice');if(notice){if(document.getElementById('casurDataStatus')?.textContent===notice.textContent)status('');notice.remove();}}};
for(const type of ['pointerdown','click','keydown','input','wheel'])document.addEventListener(type,event=>{
 if(event.isTrusted){window.CASUR_CANCEL_UPDATE_CONTEXT();queueMicrotask(()=>{if(!applyingContext)userChoiceSnapshot=captureContext();});}
},{capture:true});
window.CASUR_RESTORE_INITIAL_USER_CHOICE=()=>{if(userChoice&&userChoiceSnapshot)applyContext(userChoiceSnapshot);};
window.addEventListener('pagehide',()=>{
 if(!window.CASUR_PRODUCTION_READY||reloading)return;
 const pending=navigation.read();if(pending)return;
 let sameModule=true;try{sameModule=window.parent.location.hash==='#/modulo/produccion';}catch{}
 saveUpdateContext({reason:sameModule?'resume':'navigation',targetVersion:sameModule?APP_VERSION:null});
});
async function restoreContext(){
 const saved=navigation.read();if(saved)return recovery.restore(saved);
 // Adoption after all tabs closed is unique and serialized; ambiguous tabs never guess.
 if(navigation.pending().length>1){contextNotice('Hay varias ventanas con selecciones guardadas. Volvé a elegir la ficha que necesitás.');return false;}
 if(navigator.locks&&navigation.pending().length===1)return navigator.locks.request('casur-production-context-recovery',()=>{
  const candidates=navigation.pending();return candidates.length===1?recovery.restore(candidates[0]):false;
 });
 return false;
}
async function legacyContextNotice(restored){
 if(restored||navigation.read()||userChoice||read(sessionStorage,'casur-context-notice:'+APP_VERSION))return;
 try{
  const reg=await navigator.serviceWorker?.getRegistration();if(!reg?.active)return;
  const info=await new Promise(resolve=>{const channel=new MessageChannel(),timer=setTimeout(()=>resolve(null),2000);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data);};reg.active.postMessage({type:'CASUR_UPDATE_INFO'},[channel.port2]);});
  if(!userChoice&&info?.previous?.includes('1.3.6')){
   contextNotice('Actualización instalada. Si la versión anterior no guardó la ficha, volvé a seleccionar la suerte. Tu trabajo guardado se conserva.');
   put(sessionStorage,'casur-context-notice:'+APP_VERSION,'1');
  }
 }catch{}
}
function controls(){
 const strip=document.querySelector('.casur-release-strip');if(!strip||document.getElementById('casurDataStatus'))return;
 const host=document.createElement('span');host.className='no-print export-excluded';host.dataset.exportExclude='true';
 const text=document.createElement('span');text.id='casurDataStatus';text.setAttribute('role','status');
 const official=document.createElement('button');official.type='button';official.id='casurUseOfficial';official.textContent='Usar datos oficiales';official.hidden=true;
 const personal=document.createElement('button');personal.type='button';personal.id='casurUsePersonal';personal.textContent='Usar generación local guardada';personal.hidden=!(window.CASUR_SAVED_MASTER_OVERLAY||window.CASUR_MASTER_OVERLAY);
 official.onclick=()=>void useSource('official');personal.onclick=()=>void useSource('personal');
 host.append(text,official,personal);strip.append(host);
}
async function safe(){
 if(reloading||!window.CASUR_PRODUCTION_READY)return false;
 // A manual legacy edit exists only in memory; never discard it to take shared data.
 if(window.CRONO_DATA?.meta?.manualChanges||window.APP_DATA?.meta?.manualChanges)return false;
 return (await guard.checkpoint(window.CASUR_MODULE_BRIDGE,'official-data-update')).ok===true;
}
async function useSource(source){
 if(!await safe()){status('Trabajo pendiente protegido. Terminá o guardá la operación y reintentá.');return;}
 if(!put(localStorage,SOURCE_KEY,source)){status('No se pudo guardar la elección. La vista actual se conserva.');return;}
 if(source==='official'&&local())sessionStorage.setItem('casur-data-explicit-switch',String(effective()||''));
 saveUpdateContext();reloading=true;location.reload();
}
export async function checkOfficialData(force=false){
 if(checking||reloading||location.protocol==='file:'||(!force&&Date.now()-lastCheck<60000))return;
 lastCheck=Date.now();checking=true;
 try{
  const response=await fetch('data/version.json?check=1&ts='+Date.now(),{cache:'no-store'});if(!response.ok)return;
  const release=await response.json();if(!release.version)return;
  const hasLocal=!!(window.CASUR_MASTER_OVERLAY||window.CASUR_SAVED_MASTER_OVERLAY);
  document.getElementById('casurUsePersonal').hidden=!hasLocal||local();
  const action=document.getElementById('casurUseOfficial');
  if(release.version===effective()&&!local()){action.hidden=true;return;}
  const version=effective(),preference=read(localStorage,SOURCE_KEY),personal=local();
  const priority=async()=>officialSourcePriority({official:release.version,current:effective(),personal:local(),
   preference:read(localStorage,SOURCE_KEY),online:navigator.onLine,snapshot:local()?await loadOperationalSourceSnapshot():undefined});
  const decision=await priority();
  if(decision!=='official'){
   action.hidden=!personal;
   if(personal)status('Generación local conservada. Oficial disponible: '+release.version+'.');
   return;
  }
  // The official SW already enforces monotonic versions and complete SHA-verified generations.
  if(!await safe()){action.hidden=false;status('Nueva generación oficial preparada. Tu trabajo pendiente se conserva.');return;}
  // A concurrent import or explicit source choice during the checkpoint wins.
  if(version!==effective()||preference!==read(localStorage,SOURCE_KEY)||(await priority())!=='official'||!await safe())return;
  if(version!==effective()||preference!==read(localStorage,SOURCE_KEY)||!navigator.onLine)return;
  if(personal&&!put(localStorage,SOURCE_KEY,'official'))return;
  action.hidden=true;saveUpdateContext();sessionStorage.setItem('casur-data-effective-before',String(effective()||''));
  sessionStorage.setItem('casurDataSyncExpected',release.version);reloading=true;location.reload();
 }catch{/* Network/partial/hash failures keep the pinned known-good generation. */}
 finally{checking=false;}
}
window.casurCheckForDataUpdate=()=>checkOfficialData(true);
window.CASUR_OFFICIAL_DATA_UPDATES=Object.freeze({check:checkOfficialData});
async function ready(){
 controls();await bootReady();
 let restored=false;try{restored=await restoreContext();}catch{contextNotice('El contexto guardado sigue pendiente. Podés volver a seleccionar la suerte.');}
 await legacyContextNotice(restored);
 const before=read(sessionStorage,'casur-data-effective-before'),explicit=read(sessionStorage,'casur-data-explicit-switch');
 const expected=read(sessionStorage,'casurDataSyncExpected');
 const last=read(localStorage,'casur-data-last-shared'),sameCode=read(localStorage,'casur-data-last-code')===APP_VERSION;
 if(!local()&&((before&&compareMaestroVersions(effective(),before)===1&&expected===effective())||
    (explicit&&compareMaestroVersions(effective(),explicit)===1)||(sameCode&&last&&compareMaestroVersions(effective(),last)===1))){
  const key='casur-data-notified:'+effective();if(!read(localStorage,key)){status('Datos oficiales CASUR actualizados · '+effective());put(localStorage,key,'1');}
 }
 if(!local())put(localStorage,'casur-data-last-shared',String(effective()||''));
 put(localStorage,'casur-data-last-code',APP_VERSION);
 sessionStorage.removeItem('casur-data-effective-before');sessionStorage.removeItem('casurDataSyncExpected');sessionStorage.removeItem('casur-data-explicit-switch');
 void checkOfficialData(true);
}
if(document.readyState==='complete')void ready();else window.addEventListener('load',()=>void ready(),{once:true});
window.addEventListener('online',()=>void checkOfficialData(true));
window.addEventListener('focus',()=>void checkOfficialData());
setInterval(()=>void checkOfficialData(),60000);
