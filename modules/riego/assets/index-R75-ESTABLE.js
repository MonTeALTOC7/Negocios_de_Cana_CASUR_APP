/* R7.5.1 · Corrección agronómica de frecuencia de riego.
   Mantiene intacto el bundle R7.5 estable y aplica en memoria un parche
   verificable: frecuencia histórica = INI anterior -> INI siguiente.
   TER anterior -> INI siguiente se conserva como brecha operativa.

   Compatibilidad: si el bootstrap actual trae cycleHistory R7.4.x, ese
   historial se migra en memoria a la semántica R7.5.1 antes de mostrarse.
   Si no existe detalle suficiente, NO se acepta el promedio R7.4 antiguo
   como válido y la app pedirá reprocesar el Excel. */

const ORIGINAL_URL = new URL('./index-R75-ESTABLE-ORIGINAL.js', import.meta.url);
const HTML2CANVAS_URL = new URL('./html2canvas.esm-BfxBtG_O.js', import.meta.url).href;

function mustReplace(source, from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`[R7.5.1] No se encontró ancla crítica: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) {
    throw new Error(`[R7.5.1] Ancla crítica ambigua (más de una coincidencia): ${label}`);
  }
  return source.slice(0, first) + to + source.slice(first + from.length);
}

function optionalReplaceAll(source, from, to, label) {
  if (!source.includes(from)) {
    console.warn(`[R7.5.1] Etiqueta no encontrada; se conserva texto original: ${label}`);
    return source;
  }
  return source.split(from).join(to);
}

async function boot() {
  const response = await fetch(ORIGINAL_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`[R7.5.1] No se pudo cargar R7.5 estable (${response.status})`);
  let source = await response.text();

  // 1) Cálculo crítico para todo Excel reprocesado: frecuencia real = INI -> INI.
  source = mustReplace(
    source,
    'for(let i=1;i<closed.length;i++){const prev=__r72DayStamp(closed[i-1].endDate),cur=__r72DayStamp(closed[i].startDate);if(prev!=null&&cur!=null&&cur>=prev)closed[i].intervalFromPrevious=(cur-prev)/864e5}',
    'for(let i=1;i<closed.length;i++){const prevStart=__r72DayStamp(closed[i-1].startDate),prevEnd=__r72DayStamp(closed[i-1].endDate),cur=__r72DayStamp(closed[i].startDate);if(prevStart!=null&&cur!=null&&cur>=prevStart)closed[i].intervalFromPrevious=(cur-prevStart)/864e5;if(prevEnd!=null&&cur!=null&&cur>=prevEnd)closed[i].gapFromPrevious=(cur-prevEnd)/864e5}',
    'frecuencia INI→INI'
  );

  // 2) Marca de versión de nuevos cálculos.
  source = mustReplace(source, 'calculationVersion:"R7.4.5"', 'calculationVersion:"R7.5.1"', 'calculationVersion');

  // 3) Migración segura del histórico ya guardado en bootstrap.
  //    Recalcula únicamente a partir de startDate/endDate de cycleHistory;
  //    no toca eventos, áreas, NR, Maestro ni Supabase.
  const migration = `
function __r751Mean(values){return values.length?values.reduce((sum,v)=>sum+v,0)/values.length:null}
function __r751NormalizeLegacyState(st){
  if(!st||String(st.calculationVersion||"").startsWith("R7.5."))return st;
  if(!Array.isArray(st.cycleHistory)||!st.cycleHistory.length)return st;
  const cycles=st.cycleHistory.map(c=>({...c}));
  const closed=cycles.filter(c=>c&&c.closed&&c.startDate);
  for(let i=0;i<closed.length;i++){closed[i].intervalFromPrevious=null;closed[i].gapFromPrevious=null}
  for(let i=1;i<closed.length;i++){
    const prevStart=__r72DayStamp(closed[i-1].startDate),prevEnd=__r72DayStamp(closed[i-1].endDate),cur=__r72DayStamp(closed[i].startDate);
    if(prevStart!=null&&cur!=null&&cur>=prevStart)closed[i].intervalFromPrevious=(cur-prevStart)/864e5;
    if(prevEnd!=null&&cur!=null&&cur>=prevEnd)closed[i].gapFromPrevious=(cur-prevEnd)/864e5;
  }
  const intervals=closed.map(c=>c.intervalFromPrevious).filter(v=>Number.isFinite(v)&&v>=0);
  const durations=closed.map(c=>c.durationDays).filter(v=>Number.isFinite(v)&&v>=0);
  return {...st,cycleHistory:cycles,closedCycleCount:closed.length,intervalCount:intervals.length,realIntervalAvg:__r751Mean(intervals),avgIrrigationDurationDays:__r751Mean(durations),durationCycleCount:durations.length,calculationVersion:"R7.5.1",frequencyMigratedFrom:st.calculationVersion||"legacy"};
}
`;
  source = mustReplace(
    source,
    'CA=function(master,state,overrides,now=new Date){return master.map(lot=>{',
    migration + 'CA=function(master,state,overrides,now=new Date){return master.map(lot=>{',
    'migración histórica R7.5.1'
  );
  source = mustReplace(
    source,
    'const st=state[lot.key]||{',
    'const st=__r751NormalizeLegacyState(state[lot.key])||{',
    'normalización stateBase por suerte'
  );

  // Solo el histórico ya recalculado/migrado con semántica R7.5 se considera listo.
  source = mustReplace(
    source,
    'historyReady:/^R7\\.4\\./.test(String(st.calculationVersion||""))',
    'historyReady:/^R7\\.5\\./.test(String(st.calculationVersion||""))',
    'historyReady R7.5'
  );

  // 4) El import dinámico debe resolverse contra el módulo real, no contra blob:.
  source = mustReplace(
    source,
    'import("./html2canvas.esm-BfxBtG_O.js")',
    `import(${JSON.stringify(HTML2CANVAS_URL)})`,
    'html2canvas dinámico'
  );

  // 5) Trazabilidad visible. No cambia los datos ni la lógica de duración.
  source = optionalReplaceAll(source, 'Intervalos entre riegos', 'Frecuencia entre riegos', 'título evidencia');
  source = optionalReplaceAll(source, 'Cierre del riego anterior → inicio del siguiente', 'Inicio de un riego → inicio del siguiente (INI→INI)', 'subtítulo evidencia');
  source = optionalReplaceAll(source, 'Intervalo real promedio', 'Frecuencia real promedio', 'detalle frecuencia');
  source = optionalReplaceAll(source, 'Intervalo histórico promedio', 'Frecuencia histórica promedio', 'resumen ejecutivo');
  source = optionalReplaceAll(source, 'Historial que forma el intervalo real', 'Historial que forma la frecuencia real', 'historial legado');
  source = optionalReplaceAll(source, 'El intervalo se mide desde el cierre del riego anterior hasta el inicio del siguiente riego cerrado.', 'La frecuencia se mide desde el INI de un riego hasta el INI del siguiente riego cerrado.', 'explicación legado');
  source = optionalReplaceAll(source, 'Intervalo ant.', 'Frecuencia ant.', 'columna legado');
  source = optionalReplaceAll(source, '{key:"intervalo",label:"Intervalo real"}', '{key:"intervalo",label:"Frecuencia real"}', 'orden frecuencia');
  source = optionalReplaceAll(source, 'Int. prom. ', 'Frec. prom. ', 'lista frecuencia');
  source = optionalReplaceAll(source, ' intervalos · objetivo ', ' frecuencias · objetivo ', 'contador detalle');
  source = optionalReplaceAll(source, 'No hay dos ciclos cerrados consecutivos para calcular intervalos.', 'No hay dos ciclos cerrados consecutivos para calcular frecuencia.', 'vacío frecuencia');
  source = optionalReplaceAll(source, 'el intervalo histórico requiere ciclos cerrados.', 'la frecuencia histórica requiere ciclos cerrados consecutivos.', 'nota sin histórico');
  source = optionalReplaceAll(source, 'Intervalo histórico promedio = cierre de un riego → inicio del siguiente, ponderado por el área de cada suerte.', 'Frecuencia histórica promedio = inicio de un riego → inicio del siguiente (INI→INI), ponderada por el área exacta de cada suerte.', 'fórmula ejecutiva');

  // 6) Evidencia: frecuencia INI→INI + brecha operativa TER→INI.
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
  console.error('[R7.5.1 frecuencia INI→INI]', error);
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = '<main style="font-family:system-ui;padding:24px;max-width:760px;margin:auto"><h1>No se pudo iniciar Riego R7.5.1</h1><p>La corrección de frecuencia no pasó su verificación de integridad. Se detuvo para evitar mostrar cálculos incorrectos.</p><pre style="white-space:pre-wrap;background:#f5f5f5;padding:12px;border-radius:8px"></pre></main>';
    const pre = root.querySelector('pre');
    if (pre) pre.textContent = error instanceof Error ? error.message : String(error);
  }
});