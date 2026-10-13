import test from "node:test";
import assert from "node:assert/strict";
import {canonicalLotKey,compareCentralMaestro,loadCentralMaestroComparison} from "../maestro-central-bridge.mjs";
const payload=(byKey)=>({version:"2026.10.13-2627.1",byKey});
const row=(key,area,name="Productor A")=>({hac_sue_key:key,area,nombre_hacienda:name});
test("identidad oficial y exclusión de Sucuya",()=>{
  assert.equal(canonicalLotKey("015.0","1"),"15|01");
  assert.equal(canonicalLotKey(993,"24a"),"993|24A");
  assert.equal(canonicalLotKey("16","01"),"");
});
test("coincidencia total: sin cambios al origen",()=>{
  const rows=[row("15|01",4.78)],c=payload({"15|01":{area:4.78,farmName:"Productor A"}});
  const before=JSON.stringify([rows,c]),r=compareCentralMaestro(rows,c);
  assert.equal(r.matched,1);assert.equal(r.areaDiff,0);assert.equal(JSON.stringify([rows,c]),before);
});
test("área diferente solo se reporta; no se aplica",()=>{
  const rows=[row("15|01",4.78)];
  const r=compareCentralMaestro(rows,payload({"15|01":{area:5.5,farmName:"Productor A"}}));
  assert.equal(r.areaDiff,1);assert.equal(rows[0].area,4.78);
});
test("faltantes en ambos catálogos",()=>{
  const r=compareCentralMaestro([row("15|01",4),row("18|02",4)],payload({"15|01":{area:4},"99|03":{area:2}}));
  assert.equal(r.matched,1);assert.equal(r.missing,1);assert.equal(r.onlyCentral,1);
});
test("sin áreas válidas ni identidades únicas no inventa cruces",()=>{
  const r=compareCentralMaestro([row("15|1",0),row("15|01",5)],payload({"15|01":{area:4}}));
  assert.equal(r.ambiguous,1);assert.equal(r.matched,0);
  assert.equal(compareCentralMaestro([row("15|01",0)],payload({"15|01":{area:4}})).uncomparable,1);
});
test("nombres difieren pero se respetan acentos",()=>{
  assert.equal(compareCentralMaestro([row("15|01",4,"Pérez")],payload({"15|01":{area:4,farmName:"Perez"}})).nameDiff,0);
  assert.equal(compareCentralMaestro([row("15|01",4,"Productor A")],payload({"15|01":{area:4,farmName:"Productor B"}})).nameDiff,1);
});
test("descarta versiones inválidas, no compara Sucuya",()=>{
  assert.equal(compareCentralMaestro([],payload({})).status,"ready");
  assert.equal(compareCentralMaestro([],{version:"x",byKey:{}}).status,"invalid");
  assert.equal(compareCentralMaestro([row("16|01",3)],payload({"16|01":{area:3}})).matched,0);
});
test("sin maestro o sin IndexedDB: degradación segura",async()=>{
  assert.equal((await loadCentralMaestroComparison([],async()=>null)).status,"missing");
  assert.equal((await loadCentralMaestroComparison([],async()=>{throw Error("offline")})).status,"unavailable");
});
