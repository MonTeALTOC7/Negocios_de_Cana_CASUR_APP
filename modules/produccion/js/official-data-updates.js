import {protectModuleActivity} from '../../../core/updates/activity-guard.js';
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

export function saveUpdateContext(){
 const crono=document.getElementById('cronoContent');
 return put(sessionStorage,CONTEXT_KEY,JSON.stringify({
  crono:window.CASUR_CRONO_SELECTION?.capture(),history:window.CASUR_HISTORY_SELECTION?.capture(),
  producer:document.getElementById('cronoProducerSelect')?.value,
  lot:crono?.dataset.geoLotId,entity:typeof currentEntity!=='undefined'?currentEntity?.code:null,
  sections:[...document.querySelectorAll('details[id]')].filter(x=>x.open).map(x=>x.id),scroll:scrollY,
 }));
}
window.CASUR_SAVE_UPDATE_CONTEXT=saveUpdateContext;
function restoreContext(){
 const raw=read(sessionStorage,CONTEXT_KEY);if(!raw)return;
 try{
  const c=JSON.parse(raw);sessionStorage.removeItem(CONTEXT_KEY);
  for(const id of c.sections||[]){const el=document.getElementById(id);if(el)el.open=true;}
  if(c.crono?.keys?.length)window.CASUR_CRONO_SELECTION?.restore(c.crono);
  else if(c.lot){const row=window.CRONO_DATA.producers.flatMap(p=>p.details).find(r=>r.codLote===c.lot);if(row)window.selectCronoSuerteSuggestion?.(row.code,row.suerte);}
  else if(c.producer)window.selectCronoProducer?.(c.producer);
  if(c.history?.selected?.length||Object.keys(c.history?.farms||{}).length)window.CASUR_HISTORY_SELECTION?.restore(c.history);
  else if(c.entity)window.renderEntity?.(c.entity);
  requestAnimationFrame(()=>scrollTo(0,c.scroll||0));
 }catch{/* A removed context never prevents the official app from opening. */}
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
 if(reloading)return false;
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
function ready(){
 controls();restoreContext();
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
if(document.readyState==='complete')ready();else window.addEventListener('load',ready,{once:true});
window.addEventListener('online',()=>void checkOfficialData(true));
window.addEventListener('focus',()=>void checkOfficialData());
setInterval(()=>void checkOfficialData(),60000);
