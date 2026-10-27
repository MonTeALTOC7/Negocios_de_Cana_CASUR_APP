// Navigation only. Never reads/writes datasets, forms, generations or IndexedDB.
export const CONTEXT_KEY='casur-production-update-context';
const PREFIX='casur-pwa-context:',MAX_AGE=24*60*60*1000;
export function contextStore(session,local,version,now=Date.now){
 const get=(s,k)=>{try{return s.getItem(k);}catch{return null;}};
 const set=(s,k,v)=>{try{s.setItem(k,v);return true;}catch{return false;}};
 const remove=(s,k,raw)=>{try{if(s.getItem(k)===raw)s.removeItem(k);}catch{}};
 const parse=raw=>{try{const o=JSON.parse(raw);return o&&typeof o==='object'?o:null;}catch{return null;}};
 function pending(){
  const records=[];
  try{for(let i=0;i<local.length;i++){
   const key=local.key(i);if(!key?.startsWith(PREFIX))continue;
   const raw=get(local,key),record=parse(raw);
   if(record?.schemaVersion===2&&record.targetVersion===version&&record.route==='#/modulo/produccion'&&
      Number.isFinite(record.savedAt)&&now()-record.savedAt>=0&&now()-record.savedAt<MAX_AGE)records.push({raw,record,backupKey:key});
  }}catch{}
  return records;
 }
 return {
  pending,
  read(){const raw=get(session,CONTEXT_KEY),record=parse(raw);return record?{raw,record}:null;},
  save(payload,{targetVersion=null,reason='data-update'}={}){
   const prior=this.read();
   const record={schemaVersion:2,id:globalThis.crypto?.randomUUID?.()||String(now())+'-'+Math.random(),savedAt:now(),fromVersion:version,
    targetVersion,reason,route:'#/modulo/produccion',payload};
   const raw=JSON.stringify(record);if(!set(session,CONTEXT_KEY,raw))return false;
   if(prior)this.consume(prior); // Compare-and-remove cannot delete the newer session record.
   // Durable fallback is only for a known prepared update, never a generic last-view guess.
   if(['pwa-update','resume'].includes(reason)&&targetVersion)set(local,PREFIX+record.id,raw);
   return true;
  },
  consume(item){
   remove(session,CONTEXT_KEY,item.raw);
   if(item.record?.id)remove(local,PREFIX+item.record.id,item.raw);
   if(item.backupKey)remove(local,item.backupKey,item.raw);
  },
  current(item){return get(session,CONTEXT_KEY)===item.raw||
   (!!item.backupKey&&get(local,item.backupKey)===item.raw);},
 };
}

// Preserve the record while initialization is pending; user input cancels only navigation recovery.
export function restoreCoordinator({store,ready,apply,notice}){
 let changed=false,busy=false,done=false,active=null;
 return {
  cancel(){changed=true;const saved=store.read();if(saved)store.consume(saved);if(active)store.consume(active);},
  get done(){return done;},
  async restore(item=store.read()){
   if(done||busy||!item)return false;
   busy=true;active=item;
   try{
    await ready();
    if(changed||!store.current(item)){store.consume(item);done=true;return false;}
    const result=await apply(item.record.schemaVersion===2?item.record.payload:item.record);
    if(result===false)return false; // Controls unavailable: keep record for a readiness retry.
    store.consume(item);done=true;if(result?.message)notice(result.message);return true;
   }finally{busy=false;active=null;}
  },
 };
}
