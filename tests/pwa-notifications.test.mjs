import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {MessageChannel} from 'node:worker_threads';

const source=readFileSync(new URL('../core/updates/pwa-update.js',import.meta.url),'utf8').replaceAll('export ','');
async function scenario({pending=null,installed='1.3.6',ready=true,sameWorker=false}={}){
 const elements=[],session=new Map([['casur-update-confirm','pending'],['unrelated','keep']]);
 const worker=version=>({postMessage(message,ports){ports?.[0]?.postMessage({version,ready,previous:['1.3.4','1.3.5']});ports?.[0]?.close();}});
 const controller=worker(installed),candidate=pending?worker(pending):null;
 const registration={waiting:sameWorker?controller:candidate,addEventListener(){}};
 const node=()=>({hidden:false,dataset:{},append(){},setAttribute(){},addEventListener(){}});
 const sandbox=vm.createContext({MessageChannel,setTimeout,clearTimeout,sessionStorage:{getItem:key=>session.get(key)??null,setItem:(k,v)=>session.set(k,v),removeItem:key=>session.delete(key)},
  navigator:{onLine:false,serviceWorker:{controller,register:async()=>registration,addEventListener(){},ready:Promise.resolve({})}},
  document:{createElement:()=>{const element=node();elements.push(element);return element;},head:node(),body:node(),addEventListener(){}},
  window:{addEventListener(){}},location:{reload(){throw Error('unexpected reload');}},
 });
 vm.runInContext(source,sandbox);await sandbox.installUpdateControl({version:'1.3.6',checkpoint:async()=>({ok:true})});
 return {notice:elements.find(element=>element.className?.startsWith('casur-update ')),elements,session};
}
test('sin worker pendiente: ni cachés previas ni marcador obsoleto generan aviso',async()=>{
 const result=await scenario();assert.equal(result.notice.hidden,true);
 assert.equal(result.session.has('casur-update-confirm'),false);assert.equal(result.session.get('unrelated'),'keep');
});
test('solo un worker distinto, preparado y con versión diferente puede ofrecer actualización',async()=>{
 for(const options of [{pending:'1.3.6'},{pending:'1.3.7',ready:false},{pending:'1.3.7',sameWorker:true},{pending:'1.3.7',installed:'1.3.7'}])assert.equal((await scenario(options)).notice.hidden,true);
 const result=await scenario({pending:'1.3.7'});assert.equal(result.notice.hidden,false);
 assert.ok(result.elements.some(element=>element.textContent==='Nueva versión de CASUR disponible'));
 assert.ok(result.elements.some(element=>element.textContent==='Versión 1.3.7'));
});
test('Más tarde conserva el acceso a la actualización sin recarga',async()=>{
 const result=await scenario({pending:'1.3.7'});
 result.elements.find(element=>element.textContent==='Más tarde').onclick();
 // MessageChannel completes asynchronously; wait until the compact action is available.
 for(let i=0;i<100&&!result.elements.some(element=>element.textContent==='Ver actualización');i++)await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(result.session.get('casur-update-later'),'1.3.7');
 const action=result.elements.find(element=>element.textContent==='Ver actualización');assert.ok(action);await action.onclick();
 assert.equal(action.textContent,'Actualizar ahora');
});
