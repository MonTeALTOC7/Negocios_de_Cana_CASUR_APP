/* R7.5.5 · Hotfix de sincronización sobre R7.5.4.
   Mantiene intactas las fórmulas ya validadas de R7.5.4:
   - frecuencia histórica = INI anterior -> INI siguiente, incluso si el
     segundo riego continúa abierto;
   - días transcurridos = diferencia entre fechas calendario;
   - brecha operativa = TER anterior -> INI siguiente;
   - duración = INI -> TER.

   R7.5.5 corrige exclusivamente la carga del import activo desde Supabase:
   aunque nombre/fecha del archivo coincidan, se descargan los eventos para
   reconstruir stateBase con el Maestro Central vigente y evitar que una suerte
   con cambio estructural (Pansaco 01) conserve una huella antigua. */

const ORIGINAL_URL = new URL('./index-R75-ESTABLE-ORIGINAL.js', import.meta.url);
const HTML2CANVAS_URL = new URL('./html2canvas.esm-BfxBtG_O.js', import.meta.url).href;

function mustReplace(source, from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`[R7.5.5] No se encontró ancla crítica: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) {
    throw new Error(`[R7.5.5] Ancla crítica ambigua (más de una coincidencia): ${label}`);
  }
  return source.slice(0, first) + to + source.slice(first + from.length);
}

function optionalReplaceAll(source, from, to, label) {
  if (!source.includes(from)) {
    console.warn(`[R7.5.5] Etiqueta no encontrada; se conserva texto original: ${label}`);
    return source;
  }
  return source.split(from).join(to);
}

async function boot() {
  const response = await fetch(ORIGINAL_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`[R7.5.5] No se pudo cargar R7.5 estable (${response.status})`);
  let source = await response.text();

  // 1) Antigüedad operativa por fecha calendario. El valor deja de cambiar
  //    al cruzar el mediodía y pasa a representar días calendario completos.
  source = mustReplace(
    source,
    'function Vp(e,t=new Date){if(!e)return null;const r=new Date(`${e}T12:00:00`);return Math.max(0,Math.floor((t.getTime()-r.getTime())/864e5))}',
    'function Vp(e,t=new Date){if(!e)return null;const r=__r72DayStamp(e);if(r==null)return null;const a=Date.UTC(t.getFullYear(),t.getMonth(),t.getDate());return Math.max(0,Math.floor((a-r)/864e5))}',
    'días calendario'
  );

  // 2) Frecuencia crítica: se calcula entre TODO par de INI consecutivos.
  //    El segundo ciclo puede estar abierto: su INI ya determina la frecuencia.
  //    TER anterior -> INI siguiente continúa como brecha operativa separada.
  source = mustReplace(
    source,
    'for(let i=1;i<closed.length;i++){const prev=__r72DayStamp(closed[i-1].endDate),cur=__r72DayStamp(closed[i].startDate);if(prev!=null&&cur!=null&&cur>=prev)closed[i].intervalFromPrevious=(cur-prev)/864e5}',
    'for(let i=0;i<cycles.length;i++){cycles[i].intervalFromPrevious=null;cycles[i].gapFromPrevious=null}for(let i=1;i<cycles.length;i++){const prevStart=__r72DayStamp(cycles[i-1].startDate),prevEnd=__r72DayStamp(cycles[i-1].endDate),cur=__r72DayStamp(cycles[i].startDate);if(prevStart!=null&&cur!=null&&cur>=prevStart)cycles[i].intervalFromPrevious=(cur-prevStart)/864e5;if(prevEnd!=null&&cur!=null&&cur>=prevEnd)cycles[i].gapFromPrevious=(cur-prevEnd)/864e5}',
    'frecuencia INI→INI incluyendo ciclo abierto'
  );
  source = mustReplace(
    source,
    'const intervals=closed.map(c=>c.intervalFromPrevious).filter(v=>Number.isFinite(v)&&v>=0),durations=closed.map(c=>c.durationDays).filter(v=>Number.isFinite(v)&&v>=0);',
    'const intervals=cycles.map(c=>c.intervalFromPrevious).filter(v=>Number.isFinite(v)&&v>=0),durations=closed.map(c=>c.durationDays).filter(v=>Number.isFinite(v)&&v>=0);',
    'promedio con todos los INI consecutivos'
  );

  // 3) Marca semántica de cálculo: se conserva R7.5.4 porque R7.5.5 no
  //    cambia ninguna fórmula, solo corrige la ruta de sincronización.
  source = mustReplace(source, 'calculationVersion:"R7.4.5"', 'calculationVersion:"R7.5.4"', 'calculationVersion');

  // 4) Todo reproceso conserva la fecha estructural de ciclo utilizada.
  source = mustReplace(
    source,
    'lastCyclePending:Math.max(0,(Number(lot.area)||0)-lastCycleArea),...calc};',
    'lastCyclePending:Math.max(0,(Number(lot.area)||0)-lastCycleArea),...calc,analyzedCropStartDate:lot.cropStartDate||null};',
    'ancla de inicio de ciclo del reproceso'
  );

  // 5) Migración segura de históricos R7.4 / R7.5.x.
  //    Recalcula la frecuencia desde cycleHistory para incluir el INI del ciclo
  //    abierto, pero mantiene duración exclusivamente sobre ciclos cerrados.
  const migration = `
function __r754Mean(values){return values.length?values.reduce((sum,v)=>sum+v,0)/values.length:null}
function __r754SameDate(a,b){return String(a||"")===String(b||"")}
function __r754NormalizeLegacyState(st,lot){
  if(!st)return st;
  const version=String(st.calculationVersion||"");
  const anchor=lot?.cropStartDate||null;
  const anchorMatches=__r754SameDate(st.analyzedCropStartDate,anchor);
  if(version==="R7.5.4")return st;
  if(lot&&lot.cycleStartChanged&&!anchorMatches)return st;
  if(!Array.isArray(st.cycleHistory)||!st.cycleHistory.length)return st;
  const cycles=st.cycleHistory.map(c=>({...c})).sort((a,b)=>(__r72DayStamp(a?.startDate)??Number.POSITIVE_INFINITY)-(__r72DayStamp(b?.startDate)??Number.POSITIVE_INFINITY));
  for(let i=0;i<cycles.length;i++){cycles[i].intervalFromPrevious=null;cycles[i].gapFromPrevious=null}
  for(let i=1;i<cycles.length;i++){
    const prevStart=__r72DayStamp(cycles[i-1].startDate),prevEnd=__r72DayStamp(cycles[i-1].endDate),cur=__r72DayStamp(cycles[i].startDate);
    if(prevStart!=null&&cur!=null&&cur>=prevStart)cycles[i].intervalFromPrevious=(cur-prevStart)/864e5;
    if(prevEnd!=null&&cur!=null&&cur>=prevEnd)cycles[i].gapFromPrevious=(cur-prevEnd)/864e5;
  }
  const closed=cycles.filter(c=>c&&c.closed&&c.startDate);
  const intervals=cycles.map(c=>c.intervalFromPrevious).filter(v=>Number.isFinite(v)&&v>=0);
  const durations=closed.map(c=>c.durationDays).filter(v=>Number.isFinite(v)&&v>=0);
  return {...st,cycleHistory:cycles,closedCycleCount:closed.length,intervalCount:intervals.length,realIntervalAvg:__r754Mean(intervals),avgIrrigationDurationDays:__r754Mean(durations),durationCycleCount:durations.length,calculationVersion:"R7.5.4",analyzedCropStartDate:st.analyzedCropStartDate||anchor,frequencyMigratedFrom:st.frequencyMigratedFrom||version||"legacy"};
}
`;
  source = mustReplace(
    source,
    'CA=function(master,state,overrides,now=new Date){return master.map(lot=>{',
    migration + 'CA=function(master,state,overrides,now=new Date){return master.map(lot=>{',
    'migración histórica R7.5.4'
  );
  source = mustReplace(
    source,
    'const st=state[lot.key]||{',
    'const st=__r754NormalizeLegacyState(state[lot.key],lot)||{',
    'normalización stateBase por suerte'
  );

  // 6) Un histórico solo está listo si pertenece al inicio de ciclo vigente.
  source = mustReplace(
    source,
    'historyReady:/^R7\\.4\\./.test(String(st.calculationVersion||""))',
    'cycleStartChanged:!!(lot.cycleStartChanged&&!__r754SameDate(st.analyzedCropStartDate,lot.cropStartDate)),historyReady:String(st.calculationVersion||"")==="R7.5.4"&&__r754SameDate(st.analyzedCropStartDate,lot.cropStartDate)',
    'historyReady + ancla R7.5.4'
  );

  // 7) Consumidores efectivos: histórico no auditable no se muestra ni ordena.
  source = mustReplace(
    source,
    'e.realIntervalAvg!=null&&m.jsxs("small",{className:"r744-interval-age"',
    'e.historyReady===true&&e.realIntervalAvg!=null&&m.jsxs("small",{className:"r744-interval-age"',
    'lista: ocultar frecuencia no auditable'
  );
  source = mustReplace(
    source,
    'case"intervalo":return(a.realIntervalAvg??-1)-(r.realIntervalAvg??-1);',
    'case"intervalo":return(a.historyReady===true?a.realIntervalAvg??-1:-1)-(r.historyReady===true?r.realIntervalAvg??-1:-1);',
    'ordenamiento: excluir frecuencia no auditable'
  );

  // 8) Evidencia de frecuencia: incluye el ciclo abierto cuando ya existe su INI.
  source = mustReplace(
    source,
    'const intervalRows=closed.map((c,i)=>({c,prev:i>0?closed[i-1]:null})).filter(x=>x.prev&&Number.isFinite(x.c.intervalFromPrevious));',
    'const intervalRows=rows.map((c,i)=>({c,prev:i>0?rows[i-1]:null})).filter(x=>x.prev&&Number.isFinite(x.c.intervalFromPrevious));',
    'evidencia de frecuencia con ciclo abierto'
  );

  // 9) R7.5.5: WC no puede considerar sincronizado el estado solo porque
  //    nombre/fecha del import y archivo Maestro coincidan. Esa salida rápida
  //    omitía centralEvents y dejaba vivo un stateBase antiguo para Suerte 01.
  //    Al continuar, WC descarga el import activo completo y permite reconstruir
  //    el estado con el Maestro Central vigente sin pedir otro Excel al usuario.
  source = mustReplace(
    source,
    'if(c&&o)return{master:i,overrides:s,masterCutoff:r.master_cutoff||e.masterCutoff,irrigationCutoff:l?.cutoff_date||void 0,masterFile:r.master_file_name,irrigationFile:l?.file_name};',
    'if(c&&o){/* R7.5.5: continuar para obtener eventos del import activo y reconstruir stateBase */}',
    'forzar descarga de eventos del import activo'
  );

  // 10) Coherencia estructural Supabase -> Maestro Central -> stateBase.
  //     El payload de Supabase trae todos los eventos y __commit reconstruye
  //     stateBase DESPUÉS de superponer el Maestro vigente.
  source = mustReplace(
    source,
    'const __commit=payload=>{__applied=payload;const normalized=__maestroNormalizeMaster(payload.master);const overlaidMaster=__maestroCentral?__maestroApplyOverlay(normalized,__maestroCentral):normalized;let __result=overlaidMaster!==payload.master?{...payload,master:overlaidMaster}:payload;__result=__maestroNormalizeDates(__result);t(__result),we(payload.meta.masterCutoff)};',
    'const __commit=payload=>{__applied=payload;const normalized=__maestroNormalizeMaster(payload.master);const overlaidMaster=__maestroCentral?__maestroApplyOverlay(normalized,__maestroCentral):normalized;let __result=overlaidMaster!==payload.master?{...payload,master:overlaidMaster}:payload;if(__maestroCentral&&payload.__r754FullEvents===true&&Array.isArray(payload.recentEvents)){const __r754Overrides=payload.overrides||{};__result={...__result,stateBase:Ud(overlaidMaster,payload.recentEvents,payload.meta.masterCutoff,__r754Overrides)}}__result=__maestroNormalizeDates(__result);t(__result),we(payload.meta.masterCutoff)};',
    'reconstrucción stateBase con Maestro Central'
  );
  source = mustReplace(
    source,
    'const __supa={...__refPayload,master:Ae.master||__refPayload.master,overrides:{...__refPayload.overrides,...Ae.overrides||{}},stateBase:Ae.stateBase||__refPayload.stateBase,recentEvents:Ae.centralEvents&&Ae.centralEvents.length?Ae.centralEvents:__refPayload.recentEvents,meta:{...__refPayload.meta,masterCutoff:Ae.masterCutoff||__refPayload.meta.masterCutoff,irrigationCutoff:Ae.irrigationCutoff,masterFile:Ae.masterFile||__refPayload.meta.masterFile,irrigationFile:Ae.irrigationFile||__refPayload.meta.irrigationFile}};',
    'const __r754Events=Ae.centralEvents&&Ae.centralEvents.length?Ae.centralEvents:null,__supa={...__refPayload,master:Ae.master||__refPayload.master,overrides:{...__refPayload.overrides,...Ae.overrides||{}},stateBase:Ae.stateBase||__refPayload.stateBase,recentEvents:__r754Events||__refPayload.recentEvents,__r754FullEvents:!!__r754Events,meta:{...__refPayload.meta,masterCutoff:Ae.masterCutoff||__refPayload.meta.masterCutoff,irrigationCutoff:Ae.irrigationCutoff,masterFile:Ae.masterFile||__refPayload.meta.masterFile,irrigationFile:Ae.irrigationFile||__refPayload.meta.irrigationFile}};',
    'marcar eventos completos de Supabase'
  );

  // 11) El import dinámico debe resolverse contra el módulo real, no contra blob:.
  source = mustReplace(
    source,
    'import("./html2canvas.esm-BfxBtG_O.js")',
    `import(${JSON.stringify(HTML2CANVAS_URL)})`,
    'html2canvas dinámico'
  );

  // 12) Terminología visible coherente con la regla INI→INI.
  source = optionalReplaceAll(source, 'Intervalos entre riegos', 'Frecuencia entre riegos', 'título evidencia');
  source = optionalReplaceAll(source, 'Cierre del riego anterior → inicio del siguiente', 'Inicio de un riego → inicio del siguiente (INI→INI)', 'subtítulo evidencia');
  source = optionalReplaceAll(source, 'Intervalo real promedio', 'Frecuencia real promedio', 'detalle frecuencia');
  source = optionalReplaceAll(source, 'Intervalo histórico promedio', 'Frecuencia histórica promedio', 'resumen ejecutivo');
  source = optionalReplaceAll(source, 'Intervalo promedio', 'Frecuencia promedio', 'resumen evidencia');
  source = optionalReplaceAll(source, 'Intervalos evaluados', 'Frecuencias evaluadas', 'contador evidencia');
  source = optionalReplaceAll(source, 'Brecha promedio', 'Brecha vs meta', 'brecha resumen evidencia');
  source = optionalReplaceAll(source, 'Historial que forma el intervalo real', 'Historial que forma la frecuencia real', 'historial legado');
  source = optionalReplaceAll(source, 'El intervalo se mide desde el cierre del riego anterior hasta el inicio del siguiente riego cerrado.', 'La frecuencia se mide desde el INI de un riego hasta el INI del siguiente; el segundo riego puede continuar abierto.', 'explicación frecuencia');
  source = optionalReplaceAll(source, 'Intervalo ant.', 'Frecuencia ant.', 'columna legado');
  source = optionalReplaceAll(source, '{key:"intervalo",label:"Intervalo real"}', '{key:"intervalo",label:"Frecuencia real"}', 'orden frecuencia');
  source = optionalReplaceAll(source, 'Int. prom. ', 'Frec. prom. ', 'lista frecuencia');
  source = optionalReplaceAll(source, ' intervalos · objetivo ', ' frecuencias · objetivo ', 'contador detalle');
  source = optionalReplaceAll(source, 'No hay dos ciclos cerrados consecutivos para calcular intervalos.', 'No hay dos INI consecutivos para calcular frecuencia.', 'vacío frecuencia');
  source = optionalReplaceAll(source, 'el intervalo histórico requiere ciclos cerrados.', 'la frecuencia histórica requiere al menos dos INI consecutivos.', 'nota sin histórico');
  source = optionalReplaceAll(source, 'Se requieren al menos 2 ciclos cerrados', 'Se requieren al menos 2 INI consecutivos', 'requisito frecuencia');
  source = optionalReplaceAll(source, 'Intervalo histórico promedio = cierre de un riego → inicio del siguiente, ponderado por el área de cada suerte.', 'Frecuencia histórica promedio = inicio de un riego → inicio del siguiente (INI→INI), incluyendo el ciclo abierto cuando ya tiene INI y ponderada por el área exacta de cada suerte.', 'fórmula ejecutiva');
  source = optionalReplaceAll(source, 'Meta de intervalo:', 'Meta de frecuencia:', 'meta técnica detalle');
  source = optionalReplaceAll(source, 'habilitar intervalo promedio, duración', 'habilitar frecuencia promedio, duración', 'nota histórico pendiente');

  // 13) Tabla de evidencia: INI→INI + brecha operativa TER→INI.
  source = optionalReplaceAll(
    source,
    'm.jsx("th",{children:"Riego"}),m.jsx("th",{children:"Cierre anterior"}),m.jsx("th",{children:"Inicio siguiente"}),m.jsx("th",{children:"Intervalo"}),m.jsx("th",{children:"Meta"}),m.jsx("th",{children:"Brecha"}),m.jsx("th",{children:"Área"})',
    'm.jsx("th",{children:"Riego"}),m.jsx("th",{children:"Inicio anterior"}),m.jsx("th",{children:"Inicio siguiente"}),m.jsx("th",{children:"Frecuencia"}),m.jsx("th",{children:"Brecha TER→INI"}),m.jsx("th",{children:"Meta"}),m.jsx("th",{children:"Brecha vs meta"}),m.jsx("th",{children:"Área"})',
    'cabecera evidencia frecuencia'
  );
  source = optionalReplaceAll(
    source,
    'm.jsx("td",{children:dateCell(prev.endDate,prev.endTime)}),m.jsx("td",{children:dateCell(c.startDate,c.startTime)}),m.jsx("td",{className:"focus",children:__r72FmtDays(c.intervalFromPrevious)}),m.jsx("td",{children:Number.isFinite(target)?`${ze(target,0)} d`:"—"}),m.jsx("td",{className:g!=null&&g>0?"risk-cell":"ok-cell",children:g==null?"—":`${g>0?"+":""}${ze(g,1)} d`}),m.jsxs("td",{children:[__r741Area(c.areaIrrigated)," ha"]})',
    'm.jsx("td",{children:dateCell(prev.startDate,prev.startTime)}),m.jsx("td",{children:dateCell(c.startDate,c.startTime)}),m.jsx("td",{className:"focus",children:__r72FmtDays(c.intervalFromPrevious)}),m.jsx("td",{children:c.gapFromPrevious==null?"—":__r72FmtDays(c.gapFromPrevious)}),m.jsx("td",{children:Number.isFinite(target)?`${ze(target,0)} d`:"—"}),m.jsx("td",{className:g!=null&&g>0?"risk-cell":"ok-cell",children:g==null?"—":`${g>0?"+":""}${ze(g,1)} d`}),m.jsxs("td",{children:[__r741Area(c.areaIrrigated)," ha"]})',
    'fila evidencia frecuencia'
  );
  source = optionalReplaceAll(
    source,
    'm.jsx("th",{children:"Duración"}),m.jsx("th",{children:"Intervalo"}),m.jsx("th",{children:"Estado"})',
    'm.jsx("th",{children:"Duración"}),m.jsx("th",{children:"Frecuencia"}),m.jsx("th",{children:"Estado"})',
    'historial completo frecuencia'
  );

  const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    await import(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

boot().catch((error) => {
  console.error('[R7.5.5 hotfix sincronización de eventos activos]', error);
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = '<main style="font-family:system-ui;padding:24px;max-width:760px;margin:auto"><h1>No se pudo iniciar Riego R7.5.5</h1><p>La corrección de sincronización no pasó su verificación de integridad. Se detuvo para evitar mostrar cálculos incorrectos.</p><pre style="white-space:pre-wrap;background:#f5f5f5;padding:12px;border-radius:8px"></pre></main>';
    const pre = root.querySelector('pre');
    if (pre) pre.textContent = error instanceof Error ? error.message : String(error);
  }
});
