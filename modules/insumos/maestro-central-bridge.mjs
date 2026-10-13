/* Fase 5.1A: conciliación de SOLO LECTURA del Maestro Central. */
export function canonicalLotKey(farm,lot){
  let h=String(farm??"").trim().replace(/\.0$/,"").replace(/\s+/g,"");
  let s=String(lot??"").trim().toUpperCase().replace(/\.0$/,"").replace(/\s+/g,"");
  if(/^\d+$/.test(h)) h=String(BigInt(h));
  if(/^\d$/.test(s)) s="0"+s;
  return h&&s&&h!=="16"?h+"|"+s:"";
}
function keyFromRow(r){
  const key=r?.hac_sue_key;
  if(typeof key==="string"&&key.includes("|")){
    const p=key.split("|");return p.length===2?canonicalLotKey(p[0],p[1]):"";
  }
  return canonicalLotKey(r?.hacienda??r?.farmCode,r?.suerte??r?.lot);
}
function cleanName(s){return String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/\s+/g," ");}
function usableArea(value){const n=Number(value);return value!=null&&value!==""&&Number.isFinite(n)&&n>0?n:null;}
export function compareCentralMaestro(insumosRows,centralPayload){
  if(!Array.isArray(insumosRows))return {status:"invalid"};
  if(!centralPayload||typeof centralPayload.byKey!=="object"||!centralPayload.byKey||Array.isArray(centralPayload.byKey)||typeof centralPayload.version!=="string"
     ||!/^\d{4}\.\d{2}\.\d{2}-[A-Za-z0-9]+\.\d+$/.test(centralPayload.version))return {status:"invalid"};
  const c=new Map(),a=new Map(),ambiguous=new Set();
  let excluded=0;
  for(const [raw,row] of Object.entries(centralPayload.byKey)){
    const p=raw.split("|"),key=p.length===2?canonicalLotKey(p[0],p[1]):"";
    if(!key||!row||typeof row!=="object"){excluded++;continue;}
    if(c.has(key))ambiguous.add(key);else c.set(key,row);
  }
  for(const row of insumosRows){
    const key=keyFromRow(row);
    if(!key||!row||typeof row!=="object"){excluded++;continue;}
    if(a.has(key))ambiguous.add(key);else a.set(key,row);
  }
  const result={status:"ready",version:centralPayload.version,matched:0,missing:0,onlyCentral:0,areaDiff:0,nameDiff:0,uncomparable:0,ambiguous:ambiguous.size,excluded,examples:[]};
  function example(x){if(result.examples.length<12)result.examples.push(x);}
  for(const [key,row] of a){
    if(ambiguous.has(key))continue;
    if(!c.has(key)){result.missing++;example({key,kind:"sin central"});continue;}
    result.matched++;
    const other=c.get(key),originalArea=usableArea(row.area),centralArea=usableArea(other.area);
    if(originalArea===null||centralArea===null)result.uncomparable++;
    else if(Math.abs(originalArea-centralArea)>0.01){
      result.areaDiff++;example({key,kind:"área",old:originalArea,new:centralArea});
    }
    const oldName=cleanName(row.nombre_hacienda??row.productor),newName=cleanName(other.farmName);
    if(oldName&&newName&&oldName!==newName){
      result.nameDiff++;example({key,kind:"nombre",old:row.nombre_hacienda??row.productor,new:other.farmName});
    }
  }
  for(const key of c.keys())if(!a.has(key)&&!ambiguous.has(key))result.onlyCentral++;
  return result;
}
export async function loadCentralMaestroComparison(rows,read=null){
  try{
    const reader=read||(async()=>{const {loadMaestroSuertes}=await import("../../core/shared-data/master-store.js");return loadMaestroSuertes();});
    const record=await reader();
    return record?.payload?compareCentralMaestro(rows,record.payload):{status:"missing"};
  }catch{return {status:"unavailable"};}
}
