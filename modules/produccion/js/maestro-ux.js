/* Fase 1: presentation adapter. Engines, report DOM and selections remain owned
   by the existing module. No dataset or storage writes belong here. */
(function () {
  'use strict';
  const views = [
    ['resumen', 'Resumen', 'homeSection'],
    ['cronologico', 'Cronológico', 'cronoSection'],
    ['historico', 'Histórico', 'fichaSection'],
    ['zonas', 'Zonas', 'zoneMainSection'],
    ['analisis', 'Análisis', 'executiveAnalysisSection'],
  ];
  const byId = id => document.getElementById(id);
  let active = 'resumen', cronoVisited = false, lastSummaryZone = null;
  const positions = new Map();
  const fmt = (value, digits = 2) => value == null || !Number.isFinite(Number(value))
    ? 'N/D' : Number(value).toLocaleString('es-NI', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const text = (id, value) => { const el = byId(id); if (el) el.textContent = value; };
  const icon = name => '<svg class="maestro-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+({rail:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m7-12-4 4 4 4"/>',menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',water:'<path d="M12 3C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-12Z"/><path d="M8 15c0 2 1 3 3 3"/>',pdf:'<path d="M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 13h8M8 17h6"/>',image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="2"/><path d="m3 18 6-6 4 4 3-3 5 5"/>',leaf:'<path d="M5 19C2 8 9 3 21 3c0 12-5 19-16 16Zm0 0L17 7M8 14v-5m4 5h5"/>',truck:'<path d="M3 5h12v12H3zM15 10h4l3 4v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',chart:'<path d="M4 20V12h4v8m3 0V8h4v12m3 0V3h3v17M3 8l6-5 5 2 7-4"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',home:'<path d="m3 11 9-8 9 8M5 9v12h5v-7h4v7h5V9"/>',map:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16"/>',table:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12M3 15h18"/>'}[name]||'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>')+'</svg>';
  const allowed = view => {
    const cfg = window.CASUR_EXPORT_MODULES;
    const key = {cronologico:'crono', historico:'historico', zonas:'zones', analisis:'executive'}[view];
    return !cfg || !key || !!cfg[key];
  };

  function refreshSummary() {
    const data = window.CRONO_DATA, engine = window.CASUR_CRONO_PARTICIPATION;
    if (!data?.producers || !engine) return;
    const rows = data.producers.flatMap(p => p.details || []);
    const summary = engine.summary(rows);
    text('maestroActiveArea', fmt(data.global?.area) + ' ha');
    text('maestroActiveLots', fmt(summary.activeLots, 0) + ' suertes activas');
    text('maestroEstimateArea', fmt(summary.estimateArea) + ' ha');
    text('maestroEstimateLots', fmt(summary.estimateLots, 0) + ' suertes con estimado autorizado');
    text('maestroEstimateTons', fmt(summary.estimateTons) + ' t');
    text('maestroEstimateTch', fmt(summary.estimateTch));
    text('maestroPreviousTch',fmt(data.global?.tch));
    text('maestroMillingArea',fmt(summary.millingArea)+' ha');
    text('maestroSeedArea',fmt(summary.seedArea)+' ha');
    text('maestroPending',summary.pendingMillingArea>0 ? fmt(summary.pendingMillingArea)+' ha de molienda pendientes de estimado utilizable' : '');
    text('maestroTonsLabel','Ton. estimadas Z'+(summary.estimateSeason||'N/D'));
    text('maestroTchLabel','TCH est. Z'+(summary.estimateSeason||'N/D'));
    const composition=byId('maestroComposition');if(composition)composition.style.setProperty('--milling-share',((summary.millingArea/(summary.millingArea+summary.seedArea)||0)*100)+'%');
    text('maestroCoverage', fmt(summary.coberturaEstimadoAreaPct) + ' % del área de molienda');
    text('maestroCatalog', fmt(summary.catalogLots ?? rows.length, 0));
    text('maestroMilling', fmt(summary.millingLots, 0));
    text('maestroSeed', fmt(summary.seedLots, 0));
    text('maestroSummarySeason', 'Panorama de la zafra ' + (data.meta?.estimateSeason || summary.estimateSeason || 'vigente'));
    const host = byId('maestroSummary');
    if (host) { host.dataset.generation = data.meta?.dataVersion || ''; host.setAttribute('aria-busy', 'false'); }
    refreshDashboard(rows,engine);
  }

  function refreshDashboard(rows){
    const host=byId('maestroDashboardContent');if(!host)return;
    const generation=window.CRONO_DATA.meta.dataVersion;
    if(host.dataset.contextGeneration===generation&&host.firstElementChild)return;
    host.dataset.contextGeneration=generation;
    const zones=engine().agronomicGroups(rows,'zona').slice().sort((a,b)=>b.area-a.area),total=zones.reduce((n,g)=>n+g.area,0),rawOfficial=window.CRONO_DATA.global?.area,official=rawOfficial==null?null:Number(rawOfficial),panel=presentation(el('section','ux09-zone-chart'));
    panel.append(el('h3','','Área activa por zona'),el('p','','Participación del área activa total'));
    if(Number.isFinite(official)&&Math.abs(total-official)>0.05)panel.append(el('p','context-hint','El área agrupada difiere del total global; los porcentajes usan el área activa oficial.'));
    zones.forEach(z=>{const pct=Number.isFinite(official)&&official>0?z.area/official*100:null,b=button('',()=>{lastSummaryZone=z.key;explorerStates.set('general',{objective:'area',dimension:'zona',secondary:'zona',scope:[{field:'zona',key:z.key}],mode:'general'});activate('cronologico');window.renderCronoHome();});b.className='ux09-zone-row';b.dataset.zone=z.key;b.setAttribute('aria-label','Explorar zona '+z.key+', '+fmt(z.area)+' hectáreas, '+fmt(pct)+' por ciento del área activa');const heading=el('span','ux09-zone-heading');const values=el('span','ux09-zone-values');values.append(el('span','',fmt(z.area)+' ha'),el('b','',fmt(pct)+' %'));heading.append(el('strong','',z.key),values);const track=el('span','ux09-zone-track'),fill=el('span');fill.style.width=Math.max(0,Math.min(100,pct??0))+'%';track.append(fill);b.append(heading,track);panel.append(b);});
    if(!zones.length)panel.append(el('p','','No hay zonas con área activa disponible.'));host.replaceChildren(panel);
  }

  // View models come exclusively from the operational participation aggregator.
  // No cached dataset, arithmetic TCH mean or alternate selection store.
  const el=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!=null)n.textContent=value;return n;};
  const presentation=n=>{n.classList.add('no-print','export-excluded');n.dataset.exportExclude='true';return n;};
  const engine=()=>window.CASUR_CRONO_PARTICIPATION;
  const groupRows=(rows,field,key)=>rows.filter(r=>engine().agronomicGroups([r],field).length&&(field==='stage'?engine().cropStage(r):String(r[field]??'').trim()||'Sin clasificar')===key);
  // UX13: fixed agronomic sequence for crop stage; categories still come from cropStage().
  const stageSequence=['Plantilla','2.º corte','Cortes 3–4','Cortes 5–6','Cortes 7+'];
  const stageRank=key=>{const i=stageSequence.indexOf(key);if(i>=0)return i;if(/^(sin clasificar|sin dato|n\/d)$/i.test(key))return 1e6;const n=Number(String(key).match(/\d+/)?.[0]);return Number.isFinite(n)?stageSequence.length+n:1e5;};
  const stageOrder=(a,b)=>stageRank(a.key)-stageRank(b.key)||String(a.key).localeCompare(String(b.key),'es');
  // Rows per category in one pass, with the same key and active-area rule as agronomicGroups.
  const activeAreaOf=r=>r.sourcePresence?window.CASUR_OPERATIONAL_IMPORT.participation(r).activeArea:Number(r.area);
  function rowsByCategory(rows,field){const map=new Map();rows.forEach(r=>{if(!(activeAreaOf(r)>0))return;const key=field==='stage'?engine().cropStage(r):String(r[field]??'').trim()||'Sin clasificar';if(!map.has(key))map.set(key,[]);map.get(key).push(r);});return map;}
  const dash='—';
  const explorerStates=new Map();
  const dimensions=[['zona','Zona'],['tipoRiego','Riego'],['textura','Tipo de suelo'],['tenencia','Tenencia'],['stage','N.º de cortes (rangos)'],['variedad','Variedad'],['destino','Destino']];
  const button=(label,fn)=>{const b=el('button','',label);b.type='button';b.onclick=fn;return b;};
  function openDrawer(title,content,onClose){
    const focus=document.activeElement,dialog=presentation(el('dialog','context-drawer'));dialog.setAttribute('aria-label',title);
    const head=el('header','context-drawer-head');head.append(el('h2','',title),button('Cerrar',()=>dialog.close()));dialog.append(head,content);
    dialog.addEventListener('close',()=>{onClose?.();dialog.remove();if(focus?.isConnected)focus.focus();},{once:true});document.body.append(dialog);dialog.showModal();return dialog;
  }
  function chooseControl(label,options,value,onChange){const wrap=el('label','context-control',label),select=el('select');select.setAttribute('aria-label',label);options.forEach(([key,name])=>{const option=el('option','',name);option.value=key;select.append(option);});select.value=value;select.onchange=()=>onChange(select.value);wrap.append(select);return wrap;}
  let ux09ReturnContext=null;
  function directory(rows,farm=false,state=null,onLot=null){
    const wrap=el('div','context-directory'),input=el('input');input.type='search';input.placeholder=farm?'Buscar suerte…':'Buscar finca o zona…';input.setAttribute('aria-label',input.placeholder);input.value=state?.directoryQuery||'';const list=el('div','context-results');let limit=8;
    const render=()=>{list.replaceChildren();const q=input.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();const items=farm?rows:window.CRONO_DATA.producers.filter(p=>p.details.some(r=>rows.includes(r)));const matches=items.filter(r=>[r.codLote,r.name,r.code,r.zone,r.variedad].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q));
      matches.slice(0,limit).forEach(r=>{const b=button(farm?'Suerte '+r.codLote:r.name+' · '+r.code,()=>{wrap.closest('dialog')?.close();if(farm){onLot?.();window.selectCronoSuerteSuggestion(String(r.code),String(r.suerte));}else window.renderCronoProducer(String(r.code));});b.append(el('small','',farm?(r.variedad||'Sin variedad'):r.zone));list.append(b);});list.append(el('small','',Math.min(limit,matches.length)+' de '+matches.length+' resultados'));if(matches.length>limit)list.append(button('Mostrar más',()=>{limit+=8;render();}));};input.oninput=()=>{if(state)state.directoryQuery=input.value;limit=8;render();};if(farm){const summary=engine().summary(rows);wrap.append(el('p','context-hint',fmt(rows.length,0)+' en catálogo · '+fmt(summary.activeLots,0)+' activas'));}wrap.append(input,list);render();return wrap;
  }
  // Group only the rows that actually belong to the active scope; a producer can
  // appear in several categories without making counts additive across them.
  function scopedFarms(rows) {
    const byCode=new Map();
    rows.forEach(r=>{const code=String(r.code??'');if(!code||!engine().agronomicGroups([r],'zona').length)return;if(!byCode.has(code))byCode.set(code,[]);byCode.get(code).push(r);});
    return window.CRONO_DATA.producers.filter(p=>byCode.has(String(p.code))).map(p=>{const subset=byCode.get(String(p.code)),sum=engine().summary(subset);return {producer:p,rows:subset,summary:sum,area:engine().agronomicGroups(subset,'zona').reduce((n,g)=>n+g.area,0)};}).sort((a,b)=>a.producer.name.localeCompare(b.producer.name,'es'));
  }
  function scopedFarmDirectory(rows,estimate,state){
    const all=scopedFarms(rows),wrap=el('section','ux04-farm-directory'),search=el('input');search.type='search';search.placeholder='Buscar finca o código…';search.setAttribute('aria-label','Buscar finca en el ámbito');search.value=state.farmQuery||'';
    const list=el('div','ux04-farm-list');let limit=4;
    const update=()=>{const query=search.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),matches=all.filter(x=>(x.producer.name+' '+x.producer.code).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query));list.replaceChildren();matches.slice(0,limit).forEach(x=>{const item=el('article','ux04-farm-row'),name=el('strong','',x.producer.name+' · '+x.producer.code),meta=el('span','',estimate?fmt(x.summary.estimateArea)+' ha válidas · '+fmt(x.summary.estimateTons)+' t · '+fmt(x.summary.estimateTch)+' TCH · '+fmt(x.summary.coberturaEstimadoAreaPct)+' % cobertura':fmt(x.area)+' ha en este ámbito');item.append(name,meta,button('Ver ficha',()=>window.renderCronoProducer(String(x.producer.code))));list.append(item);});list.append(el('small','',Math.min(limit,matches.length)+' de '+matches.length+' fincas'));if(matches.length>limit)list.append(button('Mostrar más',()=>{limit+=4;update();}));};search.oninput=()=>{state.farmQuery=search.value;limit=4;update();};wrap.append(el('h3','',all.length+' fincas en este ámbito'),search,list);update();return wrap;
  }
  // UX13: a single renderer for Cronológico General and finca. Only the scope,
  // the available variables and the drill target differ; groups, sums and TCH
  // come exclusively from the participation engine.
  let helpSequence=0;
  function estimateHelp(summary){
    const id='ux13-help-'+(++helpSequence),trigger=el('button','ux13-help-trigger','¿Qué incluye el estimado?'),pop=presentation(el('div','maestro-help ux13-help'));
    trigger.type='button';trigger.setAttribute('popovertarget',id);pop.id=id;pop.setAttribute('popover','');
    pop.append(el('b','','Estimado Z'+(summary.estimateSeason||'N/D')),el('p','','Toneladas y TCH proyectados por el aforo autorizado para las suertes de molienda. El TCH estimado divide las toneladas estimadas entre el área con estimado.'),el('p','','La semilla no recibe estimado de molienda: su área y sus suertes se informan aparte.'));
    if(summary.pendingMillingLots>0)pop.append(el('p','',fmt(summary.pendingMillingArea)+' ha de molienda ('+fmt(summary.pendingMillingLots,0)+' suertes) siguen sin estimado utilizable y no entran en el cálculo.'));
    pop.append(el('p','','Es una proyección; no corresponde a producción realizada.'));const close=button('Cerrar',()=>{});close.onclick=null;close.setAttribute('popovertarget',id);close.setAttribute('popovertargetaction','hide');pop.append(close);
    const wrap=el('span','ux13-help-wrap');wrap.append(trigger,pop);return wrap;
  }
  function contextualExplorer(rows,id,{farm=false,mapPanel=null,table=null}={}){
    const general=!farm,season=()=>window.CRONO_DATA?.meta?.estimateSeason||'';
    const state=explorerStates.get(id)||{objective:'area',dimension:'zona',secondary:'zona',scope:[]};explorerStates.set(id,state);
    const board=presentation(el('section','context-explorer ux13-explorer'));board.dataset.context=id;const toolbar=el('div','context-toolbar'),tabUI=el('div','ux04-navigation'),crumbs=el('nav','context-crumbs'),content=el('div','context-content');crumbs.setAttribute('aria-label','Ámbito analítico');
    const objectives=[['area','Distribución'],['estimate','Estimados Z'+season()],['directory',farm?'Suertes':'Consultar fincas'],...(mapPanel?[['map','Mapa GIS']]:[])];
    const objective=chooseControl('Consultar',objectives,state.objective,v=>{state.objective=v;render();});toolbar.append(objective);toolbar.hidden=true;
    // UX13-C (C7): data availability, not diversity. A farm variable with one real category (100 %)
    // stays available; one without any classified value is listed disabled («sin dato»), never as 0.
    const farmDimensions=dimensions.filter(([key])=>['tipoRiego','textura','stage','variedad','destino'].includes(key)).map(([key,name])=>{const n=engine().agronomicGroups(rows,key).filter(g=>g.area>0&&!/^(sin clasificar|sin dato|n\/d)$/i.test(g.key)).length;return n?[key,name]:[key,name+' · sin dato',true];});
    const dims=farm?farmDimensions:dimensions;
    const usable=dims.filter(d=>!d[2]);
    if(usable.length&&!usable.some(([key])=>key===state.dimension))state.dimension=usable[0][0];
    board.append(toolbar,tabUI,crumbs,content);
    const scopedRows=()=>state.scope.reduce((subset,filter)=>groupRows(subset,filter.field,filter.key),rows);
    const resetView=()=>{state.scope=[];state.category=null;state.detailField=null;state.detailValue=null;state.mode='general';state.expanded=false;};
    const drillToLots=key=>{state.returnObjective=state.objective;state.scope.push({field:state.dimension,key});state.objective='directory';state.directoryQuery='';render();board.scrollIntoView({block:'start',behavior:'instant'});};
    const render=()=>{
      const scoped=scopedRows();board.dataset.objective=state.objective;board.dataset.state=JSON.stringify(state);content.replaceChildren();crumbs.replaceChildren();tabUI.replaceChildren();
      const primary=el('div','ux04-tabs ux05-primary');primary.setAttribute('role','group');primary.setAttribute('aria-label',farm?'Vista de la finca':'Vista Cronológico');
      objectives.filter(([key])=>key!=='map').forEach(([key,label])=>{
        const b=button(label,()=>{if(general&&state.objective!==key)state.dimension='zona';state.objective=key;resetView();render();});
        b.dataset.objective=key;b.setAttribute('aria-pressed',String(state.objective===key));primary.append(b);
      });
      tabUI.append(primary);
      if(['area','estimate'].includes(state.objective)&&usable.length){
        const wrap=el('div','ux05-dimensions'),label=el('label','ux05-select-label',farm?'Agrupar por':state.objective==='estimate'?'Analizar TCH por':'Distribuir área por'),select=el('select','ux05-dimension-select');
        select.setAttribute('aria-label',farm?'Agrupar por':'Variable agronómica');dims.forEach(([key,name,off])=>{const o=el('option','',name);o.value=key;o.disabled=!!off;select.append(o);});select.value=state.dimension;
        const choose=key=>{state.dimension=key;resetView();render();};select.onchange=()=>choose(select.value);label.append(select);wrap.append(label);
        const chips=el('div','ux04-tabs ux04-dimensions ux05-chips');chips.setAttribute('role','group');chips.setAttribute('aria-label','Agrupar por');dims.forEach(([key,name,off])=>{const b=button(name,()=>choose(key));b.disabled=!!off;b.setAttribute('aria-pressed',String(key===state.dimension));chips.append(b);});wrap.append(chips);tabUI.append(wrap);
        if(general){
          const modes=el('div','ux05-modes');modes.setAttribute('role','group');modes.setAttribute('aria-label','Detalle de análisis');
          [['general',state.objective==='estimate'?'TCH por grupo':'Área CASUR'],['zones',state.dimension==='zona'?'Área por variedad':(state.objective==='estimate'?'TCH por zona':'Área por zona')],['farms',state.objective==='estimate'?'Ranking fincas':'Top fincas']].filter(([key])=>!(key==='zones'&&state.dimension==='zona'&&state.objective==='estimate')).forEach(([key,name])=>{
            const b=button(name,()=>{state.mode=key;state.expanded=false;state.detailField=null;state.detailValue=null;render();});b.setAttribute('aria-pressed',String((state.mode||'general')===key));modes.append(b);
          });
          tabUI.append(modes);
        }
      }
      crumbs.hidden=!state.scope.length;
      crumbs.append(button(farm?'Toda la finca':'General CASUR',()=>{if(farm&&state.objective==='directory')state.objective=state.returnObjective||'area';state.scope=[];render();}));
      state.scope.forEach((filter,index)=>crumbs.append(button((dimensions.find(d=>d[0]===filter.field)?.[1]||filter.field)+': '+filter.key,()=>{state.scope=state.scope.slice(0,index+1);if(general)state.dimension=filter.field==='zona'?'variedad':'zona';render();})));
      if(state.scope.length){crumbs.append(button('Volver',()=>{const previous=state.scope.pop();state.dimension=previous.field;if(farm)state.objective=state.returnObjective||'area';render();}));if(general)crumbs.append(button('Limpiar ámbito',()=>{state.scope=[];render();}));}
      const done=()=>board.onObjective?.(state.objective);
      if(mapPanel){mapPanel.classList.toggle('maestro-panel-inactive',state.objective!=='map');if(state.objective==='map'){requestAnimationFrame(()=>{window.dispatchEvent(new Event('resize'));mapPanel.dispatchEvent(new Event('casur:map-visible'));});done();return;}}
      if(state.objective==='directory'){if(general)content.append(scopedFarmDirectory(scoped,false,state));else{content.append(directory(scoped,true,state));if(table)content.append(button('Tabla técnica · 18 columnas',()=>showOriginalTable(table)));}done();return;}
      if(farm&&!usable.length){content.append(el('p','context-hint','Esta finca no tiene variables agronómicas clasificadas.'));done();return;}
      const summary=engine().summary(scoped),applied=summary.estimateState==='applied';
      board.dataset.groups=JSON.stringify(engine().agronomicGroups(scoped,state.dimension));board.dataset.summary=JSON.stringify(summary);
      // UX 06 + UX13: same official grouping engine; mobile-first presentation only.
      const field=state.dimension,estimate=state.objective==='estimate',mode=general?state.mode||'general':'general';
      const label=dimensions.find(d=>d[0]===field)?.[1]||field;
      const byTch=(a,b)=>{const av=Number.isFinite(a.estimateTch)?a.estimateTch:-Infinity,bv=Number.isFinite(b.estimateTch)?b.estimateTch:-Infinity;return bv-av||b.area-a.area;};
      const groupsFor=(items,key)=>engine().agronomicGroups(items,key).slice().sort(key==='stage'?stageOrder:estimate?byTch:(a,b)=>b.area-a.area||String(a.key).localeCompare(String(b.key),'es'));
      const groupsAll=groupsFor(scoped,field),compact=el('section','pilot-explorer ux05-explorer');
      if(estimate&&mode==='general'){
        const overview=presentation(el('section','ux09-forecast-overview')),top=el('div','ux13-overview-head');top.append(el('h3','','Aforo y producción proyectada · Z'+(summary.estimateSeason||'N/D')),estimateHelp(summary));overview.append(top);
        const stats=el('dl','ux09-forecast-stats');[['Área con estimado',fmt(summary.estimateArea)+' ha'],['Toneladas estimadas',fmt(summary.estimateTons)+' t'],['TCH estimado',fmt(summary.estimateTch)+' t/ha'],['Suertes con estimado',fmt(summary.estimateLots,0)]].forEach(([k,v])=>{const item=el('div');item.append(el('dt','',k),el('dd','',v));stats.append(item);});overview.append(stats);
        const notes=[];// UX13 P2: with Destino the table already reports Semilla as «No aplica».
        if(summary.seedLots>0&&field!=='destino')notes.push('Semilla: '+fmt(summary.seedArea)+' ha · '+fmt(summary.seedLots,0)+' suertes · no aplica estimado de molienda');if(applied&&summary.pendingMillingLots>0)notes.push('Molienda sin estimado: '+fmt(summary.pendingMillingArea)+' ha · '+fmt(summary.pendingMillingLots,0)+' suertes');
        if(notes.length){const list=el('ul','ux13-overview-notes');notes.forEach(n=>list.append(el('li','',n)));overview.append(list);}
        // Plan Z26/27 (#67): AF/AG optimistic scenario, secondary and closed. Only usable Molienda rows in scope;
        // official KPIs (AD/AE) above are never mixed with it.
        const optimistic=scoped.filter(r=>r.forecastOptimistic&&window.CASUR_OPERATIONAL_IMPORT.participation(r).usable);
        if(optimistic.length){
          const tons=optimistic.reduce((n,r)=>n+r.forecastOptimistic.tons,0),area=optimistic.reduce((n,r)=>n+r.inventoryArea,0),official=optimistic.reduce((n,r)=>n+window.CASUR_OPERATIONAL_IMPORT.participation(r).estimatedTons,0);
          const box=presentation(el('details','ux13-optimistic'));box.append(el('summary','','Escenario optimista'));
          const dl=el('dl','ux09-forecast-stats');[['Toneladas optimistas',fmt(tons)+' t'],['TCH optimista',fmt(area?tons/area:null)+' t/ha'],['Diferencia con el aforo oficial',(tons-official>=0?'+':'')+fmt(tons-official)+' t'],['Suertes',fmt(optimistic.length,0)]].forEach(([k,v])=>{const item=el('div');item.append(el('dt','',k),el('dd','',v));dl.append(item);});
          box.append(dl,el('p','ux13-optimistic-note','AF/AG del aforo. No sustituye el aforo oficial.'));overview.append(box);
        }
        content.append(overview);
      }
      const head=el('div','ux05-heading');
      const heading=estimate
        ? mode==='general'?'TCH estimado por '+label:mode==='zones'?(field==='zona'?'TCH por variedad en zona':'TCH por zona · '+label):'Fincas · producción estimada'
        : mode==='general'?'Área activa por '+label:mode==='zones'?(field==='zona'?'Composición de la zona':'Área por zona · '+label):'10 fincas con mayor área';
      const hint=estimate
        ? mode==='farms'?'Orden: '+({tons:'toneladas estimadas',tch:'TCH estimado',area:'área con estimado'}[state.rankBy||'tons']||'toneladas estimadas')+' ↓ · solo molienda':field==='stage'&&mode==='general'?'Orden agronómico por número de cortes':'Orden: TCH estimado ↓'
        : field==='stage'&&mode==='general'?'Orden agronómico · hectáreas y % del área activa':'Hectáreas y porcentaje del área activa del ámbito';
      head.append(el('h3','',heading),el('p','pilot-hint',hint));compact.append(head);
      if(mode==='zones'&&field==='zona'&&!state.category&&groupsAll.length)state.category=groupsAll[0].key;
      if(mode!=='general'){
        const bar=el('div','ux05-filters'),lab=el('label','ux05-filter',field==='zona'&&mode==='zones'?'Seleccionar zona':'Filtrar '+label),sel=el('select','ux05-category');
        sel.setAttribute('aria-label','Filtrar '+label);const all=el('option','','Todas las categorías');all.value='';sel.append(all);
        groupsAll.forEach(g=>{const o=el('option','',g.key);o.value=g.key;sel.append(o);});
        sel.value=state.category==='__all__'?'':state.category||'';sel.onchange=()=>{state.category=sel.value||'__all__';state.detailField=null;state.detailValue=null;state.expanded=false;render();};
        lab.append(sel);bar.append(lab);
        if(state.detailValue){const clear=button('✕ '+state.detailValue,()=>{state.detailField=null;state.detailValue=null;render();});clear.className='ux05-clear';bar.append(clear);}
        compact.append(bar);
      }
      let items=scoped;
      if(mode!=='general'&&state.category&&state.category!=='__all__')items=groupRows(items,field,state.category);
      if(mode==='farms'&&state.detailField&&state.detailValue)items=groupRows(items,state.detailField,state.detailValue);
      const activeAreaInScope=engine().agronomicGroups(items,'zona').reduce((sum,group)=>sum+group.area,0);
      const pct=n=>activeAreaInScope>0?fmt(n/activeAreaInScope*100)+' %':'N/D';
      const tableNode=el('table','ux05-table ux13-table '+(estimate?'ux05-estimate':'ux05-area')),thead=el('thead'),hdr=el('tr');
      (estimate?['Grupo','Área con estimado (ha)','Toneladas estimadas (t)','TCH estimado']:['Categoría','Área (ha)','Participación (%)']).forEach((x,i)=>{const th=el('th','',x);th.scope='col';if(i>0)th.className='ux05-num'+(estimate&&i<3?' ux05-desktop':'');hdr.append(th);});
      thead.append(hdr);tableNode.append(thead);const tbody=el('tbody');tableNode.append(tbody);
      let displayedArea=0;
      // status: 'na' = no participa en molienda (semilla); 'pending' = molienda sin estimado utilizable.
      const suertes=n=>fmt(n,0)+(n===1?' suerte':' suertes');
      const row=({title,area,tons,tch,share,onOpen,tooltip,note,status,lots,activeArea,reasons})=>{
        if(!estimate&&Number.isFinite(area))displayedArea+=area;
        const tr=el('tr','ux05-row');tr.tabIndex=0;tr.setAttribute('role','button');tr.setAttribute('aria-label',[title,tooltip,note,farm?'Ver suertes':'Abrir detalle'].filter(Boolean).join('. '));if(status)tr.dataset.status=status;
        tr.onclick=onOpen;tr.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onOpen();}};
        const key=el('td','ux05-key');key.append(el('span','',title));
        if(note)key.append(el('small','ux13-note',note));
        else if(!estimate&&lots!=null)key.append(el('small','ux13-note',suertes(lots)));
        if(estimate){
          const na=status==='na'?'No aplica':status==='pending'?'Pendiente':null;
          // UX13-C (C8): each figure appears once. Area/t are columns on PC; on the phone a single line.
          // When the estimated area differs from the active area both are shown, never hidden.
          if(!na){
            const partial=activeArea!=null&&Math.abs(activeArea-(area||0))>=0.005;
            if(lots!=null)key.append(el('small','ux13-note ux13-desktop-note',suertes(lots)+(partial?' · '+fmt(activeArea)+' ha activas':'')));
            key.append(el('small','ux05-mobile-metrics',[(partial?fmt(area)+' de '+fmt(activeArea):fmt(area))+' ha',lots!=null?suertes(lots):null,fmt(tons)+' t'].filter(Boolean).join(' · ')));
          }
          if(reasons?.length)key.append(el('small','ux13-note',reasons.join(' · ')));
          const cell=(cls,value)=>{const td=el('td',cls,value);if(na)td.classList.add('ux13-muted');return td;};
          tr.append(key,cell('ux05-num ux05-desktop',na?dash:fmt(area)),cell('ux05-num ux05-desktop',na?dash:fmt(tons)),cell('ux05-num ux05-value',na||(Number.isFinite(tch)?fmt(tch):dash)));
          if(na)tr.lastChild.title=status==='na'?'La semilla no recibe estimado de molienda':'Molienda sin estimado utilizable';
        }else tr.append(key,el('td','ux05-num ux05-value',fmt(area)),el('td','ux05-num ux07-share-col',share));
        tbody.append(tr);
      };
      let resultCount=0;
      if(mode==='farms'){
        if(estimate){const criterion=chooseControl('Ordenar fincas por',[['tons','Toneladas estimadas'],['tch','TCH estimado'],['area','Área con estimado']],state.rankBy||'tons',v=>{state.rankBy=v;render();});compact.append(criterion);}
        const rankValue=x=>state.rankBy==='tch'?x.summary.estimateTch:state.rankBy==='area'?x.summary.estimateArea:x.summary.estimateTons;
        const farms=scopedFarms(items).filter(x=>!estimate||Number.isFinite(x.summary.estimateTch))
          .sort((a,b)=>estimate?(rankValue(b)??-Infinity)-(rankValue(a)??-Infinity)||b.summary.estimateArea-a.summary.estimateArea:b.area-a.area||a.producer.name.localeCompare(b.producer.name,'es')).slice(0,10);
        resultCount=farms.length;
        farms.forEach(x=>row({title:x.producer.name+' · '+x.producer.code,area:estimate?x.summary.estimateArea:x.area,tons:x.summary.estimateTons,tch:x.summary.estimateTch,share:pct(x.area),
          onOpen:()=>{if(!estimate){window.renderCronoProducer(String(x.producer.code));return;}const detail=el('section','ux09-scoped-lots');detail.append(el('p','','Ámbito: '+label+(state.category&&state.category!=='__all__'?' · '+state.category:'')+(state.detailValue?' · '+state.detailValue:'')+' · '+x.producer.name+' · '+fmt(x.summary.estimateArea)+' ha con estimado · '+fmt(x.summary.estimateTons)+' t · '+fmt(x.summary.estimateTch)+' TCH estimado'),button('Abrir ficha de finca',()=>{ux09ReturnContext={state:structuredClone(state),scroll:window.scrollY,producer:String(x.producer.code)};detail.closest('dialog')?.close();window.renderCronoProducer(String(x.producer.code));}),directory(x.rows,true,(()=>{state.lotQueries??={};const key=JSON.stringify([state.dimension,state.category,state.detailField,state.detailValue,x.producer.code]);return state.lotQueries[key]??=( {} );})(),()=>{ux09ReturnContext={state:structuredClone(state),scroll:window.scrollY};}));openDrawer('Suertes del ámbito · '+x.producer.name,detail);},tooltip:'Finca, '+fmt(x.area)+' ha'}));
      }else{
        const key=mode==='zones'?(field==='zona'&&!estimate?'variedad':'zona'):field;
        const gr=groupsFor(items,key),display=!estimate||state.expanded?gr:gr.slice(0,6);resultCount=gr.length;
        const members=estimate?rowsByCategory(items,key):null;
        display.forEach(g=>{
          let note=null,status=null,reasons=[];
          if(estimate){
            // Destination and composition per category from the same engine: active area,
            // seed (not applicable) and milling still pending of a usable estimate.
            const s=engine().summary(members.get(g.key)||[]),seedOnly=s.millingLots===0&&s.seedLots>0;
            if(seedOnly)status='na';else if(applied&&s.millingLots>0&&s.estimateLots===0)status='pending';
            if(seedOnly)note=fmt(g.area)+' ha activas · '+suertes(g.lots)+(/semilla/i.test(g.key)?'':' · semilla');
            else{if(s.seedLots>0)reasons.push('incluye semilla '+fmt(s.seedArea)+' ha');if(applied&&s.pendingMillingLots>0&&status!=='pending')reasons.push(fmt(s.pendingMillingArea)+' ha sin estimado');if(status==='pending')note=fmt(g.area)+' ha activas · '+suertes(g.lots);}
          }
          row({title:g.key,area:estimate?g.estimateArea:g.area,tons:g.estimateTons,tch:g.estimateTch,share:pct(g.area),lots:g.lots,note,status,reasons,activeArea:estimate?g.area:null,tooltip:'Área activa '+fmt(g.area)+' ha',onOpen:()=>{
            if(farm){drillToLots(g.key);return;}
            if(mode==='general'){state.category=g.key;state.mode=estimate&&field==='zona'?'farms':'zones';state.detailField=null;state.detailValue=null;}
            else{state.detailField=key;state.detailValue=g.key;state.mode='farms';}
            state.expanded=false;render();
          }});
        });
      }
      if(!estimate){const foot=el('tfoot'),tr=el('tr','ux06-area-total'),name=el('th','','TOTAL');name.scope='row';tr.append(name,el('td','ux05-num',fmt(displayedArea)),el('td','ux05-num',pct(displayedArea)));foot.append(tr);tableNode.append(foot);if(!resultCount)compact.append(el('p','ux05-empty','Sin área activa para este ámbito; participación N/D.'));compact.append(tableNode);}
      else if(!resultCount)compact.append(el('p','ux05-empty','Sin resultados válidos para este ámbito.'));
      else{
        // TOTAL from the engine summary of the whole scope, never from summed TCH.
        if(mode==='general'){const foot=el('tfoot'),tr=el('tr','ux06-area-total'),name=el('th','','TOTAL');name.scope='row';const total=el('td','ux05-num ux05-value',fmt(summary.estimateTch));name.append(el('small','ux05-mobile-metrics',fmt(summary.estimateArea)+' ha · '+fmt(summary.estimateTons)+' t'));tr.append(name,el('td','ux05-num ux05-desktop',fmt(summary.estimateArea)),el('td','ux05-num ux05-desktop',fmt(summary.estimateTons)),total);foot.append(tr);tableNode.append(foot);}
        compact.append(tableNode);
      }
      if(!estimate&&mode==='farms'&&resultCount)compact.append(el('p','pilot-hint','TOTAL de fincas mostradas; participación sobre el área activa del ámbito.'));
      if(estimate&&mode!=='farms'&&resultCount>6){const more=button(state.expanded?'Ver menos':'Ver todas ('+resultCount+')',()=>{state.expanded=!state.expanded;render();});more.className='ux05-more';compact.append(more);}
      if(estimate&&mode!=='farms'){
        const k=mode==='zones'?(field==='zona'&&!estimate?'variedad':'zona'):field,valid=groupsFor(items,k).filter(g=>Number.isFinite(g.estimateTch)).sort(byTch);
        if(valid.length>1){const high=valid[0],low=valid[valid.length-1];const info=button('Interpretar TCH',()=>openDrawer('Lectura TCH · '+label,
          el('p','pilot-hint','Mayor: '+high.key+' · '+fmt(high.estimateTch)+' TCH ('+fmt(high.estimateArea)+' ha con estimado). Menor: '+low.key+' · '+fmt(low.estimateTch)+' TCH ('+fmt(low.estimateArea)+' ha con estimado). Brecha: '+fmt(high.estimateTch-low.estimateTch)+' t/ha. Estas diferencias no demuestran causas.')));
          info.className='ux05-insight';compact.append(info);
        }
      }
      content.append(compact);done();
    };
    board.setObjective=key=>{state.objective=key;if(farm){state.scope=[];if(key==='directory')state.directoryQuery='';}state.category=null;state.detailField=null;state.detailValue=null;state.expanded=false;objective.querySelector('select').value=key;render();};render();return board;
  }
  function showOriginalTable(table){
    const marker=document.createComment('original report table');table.before(marker);const wasHidden=table.classList.contains('premium-original-analysis');table.classList.remove('premium-original-analysis');const content=el('div','context-technical');content.append(el('p','','Tabla original: desplazá horizontalmente para consultar todas las columnas.'),table);openDrawer('Detalle técnico · tabla completa',content,()=>{marker.replaceWith(table);if(wasHidden)table.classList.add('premium-original-analysis');});
  }
  function showGroupLots(rows,title){openDrawer('Suertes · '+title,directory(rows,true));}

  function updateTrail() {
    const content = byId('cronoContent'), code = byId('cronoProducerSelect')?.value;
    const producer = window.CRONO_DATA?.producers?.find(p => String(p.code) === String(code));
    const lot = content?.dataset.geoLotId;const zone=byId('maestroZone');if(zone){zone.hidden=!producer||!['farm','lot'].includes(content?.dataset.geoScope);zone.textContent=producer?.zone||'Zona';zone.onclick=()=>{explorerStates.set('general',{objective:'area',dimension:'variedad',secondary:'tipoRiego',scope:[{field:'zona',key:producer.zone}]});window.renderCronoHome();};}
    text('maestroCronoLocation', content?.dataset.geoScope === 'lot' && lot
      ? 'Suerte ' + lot
      : content?.dataset.geoScope === 'farm' && producer ? producer.name
      : content?.querySelector('.crono-multi-result-table') ? 'Selección múltiple' : 'Cronológico');
    const back = byId('maestroBackFarm');
    if (back) { back.hidden = content?.dataset.geoScope !== 'lot' || !producer; back.textContent = producer?.name || 'Finca'; }
  }

  function activate(view, options = {}) {
    if (!views.some(v => v[0] === view) || !allowed(view)) return false;
    if (options.remember !== false && active !== view) positions.set(active, window.scrollY);
    const firstCrono = view === 'cronologico' && !cronoVisited;
    if(view!=='cronologico')ux09ReturnContext=null;
    active = view;
    document.body.dataset.maestroView = view;
    document.querySelectorAll('[data-maestro-tab]').forEach(button => {
      const on = button.dataset.maestroTab === view;
      button.setAttribute('aria-selected', String(on)); button.tabIndex = on ? 0 : -1;
    });
    // Keep every report and its details state in place. CSS only hides siblings.
    const id = views.find(v => v[0] === view)[2], panel = byId(id);
    if (panel?.tagName === 'DETAILS' && !panel.open) panel.open = true;
    if (view === 'cronologico') {
      cronoVisited = true;
      if (firstCrono && !options.restoring) window.renderCronoHome?.();
      else window.initCronoPanel?.();
      updateTrail();
    }
    if (view === 'resumen') {refreshSummary();if(lastSummaryZone){const zone=lastSummaryZone;lastSummaryZone=null;requestAnimationFrame(()=>[...document.querySelectorAll('.ux09-zone-row')].find(n=>n.dataset.zone===zone)?.focus({preventScroll:true}));}}
    if (options.scroll !== false) window.scrollTo({ top: positions.get(view) || 0, behavior: 'instant' });
    // Leaflet must measure the now-visible container; the geo engine owns maps.
    window.dispatchEvent(new Event('resize'));
    return true;
  }

  function restore(saved, sections = []) {
    const inferred = [...views].reverse().find(v => sections.includes(v[2]))?.[0] || 'resumen';
    const view = views.some(v => v[0] === saved) ? saved : inferred;
    if (view === 'cronologico') cronoVisited = true;
    activate(view, { restoring: true, scroll: false, remember: false });
  }

  function installSearch(inputId, boxId) {
    const input = byId(inputId), box = byId(boxId); if (!input || !box) return;
    input.setAttribute('aria-label', inputId === 'cronoQ' ? 'Buscar finca, productor o suerte en Cronológico' : 'Buscar finca, productor o suerte en Histórico');
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-haspopup', 'listbox');
    input.setAttribute('aria-controls', boxId); input.setAttribute('aria-expanded', 'false');
    box.setAttribute('role', 'listbox');
    let cursor = -1;
    const buttons = () => [...box.querySelectorAll('button')].filter(b => !b.disabled && !b.hidden);
    const reset = () => {
      cursor = -1; input.removeAttribute('aria-activedescendant');
      input.setAttribute('aria-expanded', String(box.style.display === 'block' && buttons().length > 0));
      buttons().forEach((b, i) => { b.id = boxId + '-item-' + i; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', 'false'); b.classList.remove('maestro-suggestion-active'); });
    };
    new MutationObserver(reset).observe(box, { childList: true, attributes: true, attributeFilter: ['style'] });
    input.addEventListener('keydown', event => {
      const items = buttons(), open = box.style.display === 'block' && items.length;
      if (!open || !['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) return;
      if (event.key === 'Enter' && cursor < 0) return; // Existing exact-search contract.
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.key === 'Escape') { box.style.display = 'none'; reset(); return; }
      if (event.key === 'Enter') { items[cursor]?.click(); return; }
      cursor = (cursor + (event.key === 'ArrowDown' ? 1 : cursor < 0 ? 0 : -1) + items.length) % items.length;
      items.forEach((b, i) => { b.classList.toggle('maestro-suggestion-active', i === cursor); b.setAttribute('aria-selected', String(i === cursor)); });
      input.setAttribute('aria-activedescendant', items[cursor].id);
      items[cursor].scrollIntoView({ block: 'nearest' });
    }, true);
  }

  // Presentation reads the original rendered cells; agronomic models and report
  // generators remain authoritative. Original nodes and their handlers survive.
  function installReportMenus(host){
    host.querySelectorAll('[data-premium-ficha] .kpis .kpi').forEach(n=>n.classList.toggle('context-secondary-kpi',/Variedad|Edad|TCH.*Ant|Fecha.*cosecha/i.test(n.querySelector('.label')?.textContent||'')));
    host.querySelectorAll('#cronoPrintPanel [data-casur-geo-action]').forEach(n=>n.classList.add('premium-original-analysis'));

    host.querySelectorAll('[data-casur-export-kind]').forEach(actions=>{
      if(actions.dataset.contextReport||!actions.querySelector('.pdf,.image'))return;actions.dataset.contextReport='true';
      const menu=el('div','context-report-menu');menu.id='report-menu-'+Math.random().toString(36).slice(2);menu.setAttribute('popover','auto');
      [...actions.children].filter(n=>n.matches('button,a')&&!n.matches('[data-casur-geo-action]')).forEach(n=>menu.append(n));
      const open=button('Exportar',()=>{});open.className='context-report-trigger';open.onclick=null;open.setAttribute('popovertarget',menu.id);open.setAttribute('aria-label','Exportar · PDF o imagen PNG');open.title='Exportar · PDF o imagen PNG';open.insertAdjacentHTML('afterbegin',icon('pdf'));actions.append(open,menu);
      actions.querySelectorAll('[data-casur-geo-action]').forEach(n=>n.classList.add('premium-original-analysis'));
      menu.addEventListener('click',e=>{if(e.target.closest('button'))queueMicrotask(()=>{if(menu.matches(':popover-open'))menu.hidePopover();});},true);
    });
  }
  // UX13-B: lot history chart. Same engine model (buildHistoricalChartModel / groupHistoricalBySeason);
  // one detail panel under the chart instead of a floating tooltip plus a duplicated status block.
  function historicalProjection(lotId){
    const h=window.CASUR_HISTORICAL_ENGINE,rows=h.normalizeHistoricalRows([window.lotByCode(lotId)]),seasons=h.resolvePeriod(rows.map(r=>r.zafra),'all');
    const root=presentation(el('section','context-history ux13-lot-history'));let metric='tch',period='last5',selectedSeason=null;
    const controls=el('div','context-history-controls'),chart=el('div','context-history-chart');
    const label=z=>String(z).padStart(4,'0').replace(/(..)(..)/,'$1/$2');
    // Missing stays missing: «—» on screen and «sin dato» for assistive tech; zero is shown as 0.00.
    const value=(v,digits=2)=>v==null||!Number.isFinite(Number(v))?dash:fmt(v,digits);
    const spoken=(v,unit='')=>v==null||!Number.isFinite(Number(v))?'sin dato':fmt(v)+unit;
    const metrics=el('div','ux13-metric');metrics.setAttribute('role','group');metrics.setAttribute('aria-label','Métrica del gráfico');
    ['tch','katm'].forEach(key=>{const b=button(key.toUpperCase(),()=>{metric=key;render();});b.dataset.metric=key;metrics.append(b);});
    const table=button('Tabla histórica',()=>{
      const wrap=el('div','context-technical'),tableNode=el('table'),head=el('tr');['Zafra','TCH','KATM','Área ha','Toneladas','Edad'].forEach(t=>head.append(el('th','',t)));const thead=el('thead');thead.append(head);tableNode.append(thead);const body=el('tbody');h.groupHistoricalBySeason(rows).forEach(r=>{const tr=el('tr');[String(r.zafra).replace(/(..)(..)/,'$1/$2'),fmt(r.tch),fmt(r.katm),fmt(r.area),fmt(r.ton),fmt(r.edad)].forEach(v=>tr.append(el('td','',v)));body.append(tr);});tableNode.append(body);wrap.append(tableNode);openDrawer('Histórico completo · TCH/KATM',wrap);
    });table.className='ux13-table-action';table.insertAdjacentHTML('afterbegin',icon('table'));
    controls.append(metrics,chooseControl('Período',[['last3','Últimas 3'],['last5','Últimas 5'],['all','Todas']],period,v=>{period=v;render();}),table);
    const render=()=>{
      const model=h.buildHistoricalChartModel(rows,h.resolvePeriod(seasons,period),metric);root.dataset.model=JSON.stringify(model);const points=model.points.filter(p=>p.selected);chart.replaceChildren();
      metrics.querySelectorAll('[data-metric]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.metric===metric)));
      chart.append(el('h3','',metric==='tch'?'Rendimiento histórico · TCH':'Azúcar por tonelada de caña · KATM'));
      if(!model.points.length){chart.append(el('p','','Sin registros históricos para esta suerte.'));return;}
      if(!points.some(p=>p.zafra===selectedSeason))selectedSeason=([...points].reverse().find(p=>p.value!==null)||points[points.length-1])?.zafra??null;
      const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');const chartWidth=points.length>5?points.length*64+48:360;svg.setAttribute('viewBox','0 0 '+chartWidth+' 240');if(points.length>5)svg.style.minWidth=chartWidth+'px';svg.setAttribute('role','group');svg.setAttribute('aria-label','Histórico '+metric.toUpperCase()+' de la suerte '+lotId+'. Elegí una zafra para ver su detalle.');
      const node=(tag,attrs,text,parent=svg)=>{const n=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));if(text!=null)n.textContent=text;parent.append(n);return n;};
      const x=i=>34+i*(chartWidth-68)/Math.max(1,points.length-1),y=v=>190-(v-model.min)/(model.max-model.min||1)*140,color=metric==='katm'?'#2388b9':'#087d56';
      if(model.min!==null){[model.min,(model.min+model.max)/2,model.max].forEach(v=>{node('line',{x1:35,x2:chartWidth-20,y1:y(v),y2:y(v),stroke:'#dce8e6'});node('text',{x:0,y:y(v)+4,'font-size':12,fill:'#456975'},fmt(v,0));});}
      let previous=null;
      points.forEach((point,i)=>{if(point.value===null){previous=null;return;}if(previous&&point.zafra-previous.point.zafra===101)node('line',{x1:x(previous.i),y1:y(previous.point.value),x2:x(i),y2:y(point.value),stroke:color,'stroke-width':3});previous={point,i};});
      const groups=[];
      points.forEach((point,i)=>{
        const g=node('g',{class:'ux13-point',tabindex:0,role:'button','data-season':point.zafra,'aria-label':'Zafra '+label(point.zafra)+': '+metric.toUpperCase()+' '+spoken(point.value)});
        node('text',{x:x(i),y:220,'text-anchor':'middle','font-size':13,fill:'#244b56'},label(point.zafra),g);
        if(point.value===null)node('text',{x:x(i),y:200,'text-anchor':'middle','font-size':14,fill:'#5c7470'},dash,g);
        else{node('circle',{class:'ux13-ring',cx:x(i),cy:y(point.value),r:11,fill:'none',stroke:color,'stroke-width':2},null,g);node('circle',{cx:x(i),cy:y(point.value),r:6,fill:color,stroke:'white','stroke-width':2},null,g);node('text',{x:x(i),y:y(point.value)-16,'text-anchor':'middle','font-size':13,fill:'#173b46'},fmt(point.value),g);}
        node('rect',{x:x(i)-30,y:10,width:60,height:220,fill:'transparent'},null,g);
        const choose=focus=>{selectedSeason=point.zafra;paint();if(focus)g.focus();};
        g.addEventListener('click',()=>choose(false));
        g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(false);}else if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const j=e.key==='Home'?0:e.key==='End'?groups.length-1:Math.max(0,Math.min(groups.length-1,i+(e.key==='ArrowRight'?1:-1)));groups[j].dispatchEvent(new Event('click'));groups[j].focus();}});
        groups.push(g);
      });
      const plot=el('div','context-history-plot');plot.append(svg);chart.append(plot);
      const detail=el('section','ux13-season-detail');detail.setAttribute('aria-live','polite');chart.append(detail);
      const missing=points.filter(p=>p.value===null);
      if(missing.length)chart.append(el('p','ux13-history-note','Sin '+metric.toUpperCase()+' en '+missing.map(p=>label(p.zafra)).join(', ')+'; la línea no se interpola.'));
      const paint=()=>{
        groups.forEach(g=>{const on=Number(g.dataset.season)===selectedSeason;g.classList.toggle('is-selected',on);g.setAttribute('aria-pressed',String(on));});
        const p=points.find(p=>p.zafra===selectedSeason);detail.replaceChildren();if(!p)return;
        detail.append(el('h4','','Zafra '+label(p.zafra)));const dl=el('dl','ux13-season-facts');
        [['area','Área (ha)',p.area],['tch','TCH',p.tch],['katm','KATM',p.katm],['ton','Toneladas (t)',p.ton],['edad','Edad (meses)',p.edad]].forEach(([key,name,v])=>{const item=el('div');item.dataset.fact=key;if(key===metric)item.classList.add('is-metric');const dd=el('dd','',value(v));if(dd.textContent===dash)dd.setAttribute('aria-label','sin dato');item.append(el('dt','',name),dd);dl.append(item);});
        detail.append(dl);
        const g=groups.find(g=>g.classList.contains('is-selected'));if(g&&plot.scrollWidth>plot.clientWidth){const r=g.getBoundingClientRect(),box=plot.getBoundingClientRect();if(r.left<box.left||r.right>box.right)plot.scrollLeft+=r.left-box.left-(box.width-r.width)/2;}
      };
      paint();
    };
    root.append(controls,chart);render();return root;
  }
  function installPremiumFicha(){
    const host=byId('cronoContent');let map=null,report=null;
    const refresh=()=>{
      const root=host.querySelector('#cronoPrintPanel'),layout=root?.querySelector('.single-suerte-layout');
      if(report!==root){map?.destroy();map=null;report=root;}
      if(!layout||root.dataset.premiumFicha)return;root.dataset.premiumFicha='true';
      const table=root.querySelector('.table-wrap'),originalChart=layout.querySelector('.crono-trend-card');if(!table)return;
      originalChart?.classList.add('premium-original-analysis');table.classList.add('premium-original-analysis');
      const labels=[...table.querySelectorAll('thead th')].map(n=>n.textContent.trim()),cells=[...table.querySelectorAll('tbody tr:first-child td')].map(n=>n.textContent.trim());
      const fields=labels.map((label,i)=>({label,value:cells[i]||'N/D'}));const chips=presentation(el('div','maestro-lot-attributes'));
      fields.filter(f=>/^(Zona|Tipo de riego|Variedad|Tenencia)$/.test(f.label)).forEach(f=>chips.append(el('span','',f.label+': '+f.value)));root.querySelector('.ficha-band > div')?.append(chips);const farm=window.CRONO_DATA.producers.find(p=>String(p.code)===String(byId('cronoProducerSelect').value));
      const lot=farm?.details.find(r=>String(r.codLote)===host.dataset.geoLotId);
      const heading=root.querySelector('.ficha-band h2');
      heading.textContent='Suerte '+(lot?.suerte??host.dataset.geoLotId);
      heading.after(el('span','ux-lot-id',[farm?.name,'Finca '+farm?.code,'CodLote '+host.dataset.geoLotId].join(' · ')));
      root.querySelector('.ficha-band small')?.classList.add('premium-original-analysis');
      root.classList.add('premium-ficha-restored');
      const tabs=presentation(el('div','context-lot-tabs'));tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Consulta de suerte');
      const history=historicalProjection(host.dataset.geoLotId),main=presentation(el('section','maestro-ficha-board premium-ficha-board'));history.classList.add('premium-ficha-history');
      const mapPanel=presentation(el('section','maestro-lot-map')),canvas=el('div','maestro-inline-map');canvas.id='maestroInlineMap';mapPanel.append(el('h3','','Ubicación de la suerte'),canvas,el('small','','Geometría oficial CASUR; mosaicos según disponibilidad.'),button('Ampliar mapa',()=>root.querySelector('[data-casur-geo-action]')?.click()));
      const technical=presentation(el('section','context-lot-technical')),dl=el('dl','context-technical-facts');
      fields.filter(f=>!/^(Suerte|Área|TCH|Zona|Tipo de riego|Variedad|Tenencia|Ton\.|Estado|Observaci)/i.test(f.label)).forEach(f=>{const pair=el('div');pair.append(el('dt','',f.label),el('dd','',f.value));dl.append(pair);});technical.append(el('h3','','Información de la suerte'),dl,button('Tabla cronológica · 18 columnas',()=>showOriginalTable(table)));
      const production=presentation(el('section','context-production'));production.append(el('p','','Estimados y planificación de la suerte · fuente cronológica efectiva'),button('Consultar histórico TCH/KATM',()=>show('history')));
      const panels={production,history,map:mapPanel,technical};technical.classList.add('premium-ficha-info');technical.append(production);
      const show=key=>{root.dataset.fichaPanel=key;Object.entries(panels).forEach(([k,p])=>{p.classList.remove('maestro-panel-inactive');});tabs.querySelectorAll('button').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.panel===key));b.tabIndex=b.dataset.panel===key?0:-1;});if(key==='map')requestAnimationFrame(()=>{window.dispatchEvent(new Event('resize'));map?.fitToData();});};
      [['history','Gráfico TCH/KATM'],['map','Ubicación'],['technical','Información']].forEach(([key,label])=>{const b=button(label,()=>show(key));b.dataset.panel=key;b.id='context-lot-tab-'+key;b.setAttribute('role','tab');b.setAttribute('aria-controls','context-lot-'+key);panels[key].id='context-lot-'+key;panels[key].setAttribute('role','tabpanel');panels[key].setAttribute('aria-labelledby',b.id);tabs.append(b);});
      tabs.addEventListener('keydown',e=>{const buttons=[...tabs.children],i=buttons.indexOf(document.activeElement);if(i<0||!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const next=buttons[(i+(e.key==='ArrowRight'?1:2))%3];next.focus();next.click();});
      main.append(technical,history,mapPanel);layout.append(tabs,main);show('history');
      // Planning content uses exclusive facts, without repeating banner or KPI values.
      production.replaceChildren(el('dl','context-technical-facts'));fields.filter(f=>/Ton\.|Estado|Observaci/i.test(f.label)).forEach(f=>{const pair=el('div');pair.append(el('dt','',f.label),el('dd','',f.value));production.firstChild.append(pair);});
      let factSignature='';const updateFacts=()=>{
        const headers=[...table.querySelectorAll('thead th')].map(n=>n.textContent.trim()),values=[...table.querySelectorAll('tbody tr:first-child td')].map(n=>n.textContent.trim()),signature=JSON.stringify([headers,values]);if(signature===factSignature)return;factSignature=signature;
        const facts=headers.map((label,i)=>({label,value:values[i]||'N/D'}));chips.replaceChildren();facts.filter(f=>/^(Zona|Tipo de riego|Variedad|Tenencia)$/.test(f.label)).forEach(f=>chips.append(el('span','',f.label+': '+f.value)));
        dl.replaceChildren();facts.filter(f=>!/^(Suerte|Área|TCH|Zona|Tipo de riego|Variedad|Tenencia|Ton\.|Estado|Observaci)/i.test(f.label)).forEach(f=>{const pair=el('div');pair.append(el('dt','',f.label),el('dd','',f.value));dl.append(pair);});
        const planning=el('dl','context-technical-facts');facts.filter(f=>/Ton\.|Estado|Observaci/i.test(f.label)).forEach(f=>{const pair=el('div');pair.append(el('dt','',f.label),el('dd','',f.value));planning.append(pair);});production.replaceChildren(planning);
      };new MutationObserver(updateFacts).observe(table,{childList:true,subtree:true,characterData:true});updateFacts();
      (async()=>{try{const feature=await window.CASUR_GEO_DATA.getLotGeometry(host.dataset.geoLotId);if(!canvas.isConnected)return;if(!feature){canvas.textContent='Sin geometría oficial disponible.';return;}map=window.createCasurMap(canvas,{ariaLabel:'Suerte '+host.dataset.geoLotId});map.setLot(feature);}catch(e){if(canvas.isConnected)canvas.textContent='Mapa no disponible: '+e.message;}})();
    };new MutationObserver(refresh).observe(host,{childList:true,subtree:true});refresh();
  }

  function installGeneralPanels() {
    const host=byId('cronoContent');const refresh=()=>{
      const area=host.querySelector('.crono-area-analysis'),yields=host.querySelector('.crono-yield-analysis');if(!area||!yields||host.querySelector('[data-context="general"]'))return;
      area.classList.add('premium-original-analysis');yields.classList.add('premium-original-analysis');
      const explorer=contextualExplorer(window.CRONO_DATA.producers.flatMap(p=>p.details),'general');area.before(explorer);
    };new MutationObserver(refresh).observe(host,{childList:true,subtree:true});refresh();
  }

  // UX13 P1: the original inline onblur of #cronoQ/#q schedules an anonymous hide 180 ms later. After
  // picking a suggestion (which blurs the input) a stale timer closed the list the user had just reopened
  // by typing. Same delay (so clicks on suggestions still land), but each blur gets an identity that
  // focus/typing cancels, and it never hides while focus is back on the input or inside the list.
  function guardSuggestionBlur(input,box,hideName){
    if(!input||!box||input.dataset.ux13BlurGuard)return;input.dataset.ux13BlurGuard='true';
    let blurToken=0;const cancelBlur=()=>{blurToken++;};
    const scheduleHide=()=>{const token=++blurToken;setTimeout(()=>{if(token!==blurToken)return;const active=document.activeElement;if(active===input||box.contains(active))return;window[hideName]?.();},180);};
    input.onblur=scheduleHide;box.addEventListener('focusout',scheduleHide);box.addEventListener('focusin',cancelBlur);
    input.addEventListener('focus',cancelBlur,true);input.addEventListener('input',cancelBlur,true);
  }
  // UX13-B: presentation adapter for the Histórico ficha (farm and lot share the original renderer).
  // Original nodes, handlers, HISTORICAL_PERIOD_STATE and exporters stay authoritative: controls added
  // here are export-excluded and only call the original actions; report nodes are never moved.
  let historicoCompareOpen=null,historicoMoreOpen=false;
  function installHistoricoUx13(){
    const host=byId('fichaContent'),selector=byId('producerSelect');if(!host)return;
    guardSuggestionBlur(byId('q'),byId('searchSuggestions'),'hideSearchSuggestions');
    if(selector){selector.classList.add('ux13-internal-select');selector.tabIndex=-1;selector.setAttribute('aria-hidden','true');}
    const kpiKind=text=>/^Área/i.test(text)?'area':/^TCH ponderado/i.test(text)?'tch':/^KATM/i.test(text)?'katm':/^Edad/i.test(text)?'edad':'secondary';
    // Formula captions move to «¿Cómo se calculan?»; captions that qualify validity or scope stay visible.
    const ornamental=/^(Toneladas ÷ área|Ponderado por toneladas|Ponderada por área válida|Suma de las suertes|lotId únicos|Cosechada en la zafra)$/i;
    // UX13-C: one discrete «i» only where the figure needs precision (no visible documentation links).
    const info=(label,lines)=>{const id='ux13-info-'+Math.random().toString(36).slice(2),wrap=presentation(el('span','ux13-info-wrap')),trigger=el('button','ux13-info'),pop=presentation(el('div','maestro-help ux13-help'));trigger.type='button';trigger.append(el('span','','i'));trigger.setAttribute('popovertarget',id);trigger.setAttribute('aria-label',label);pop.id=id;pop.setAttribute('popover','');pop.append(...lines.map(t=>el('p','',t)));const close=el('button','','Cerrar');close.type='button';close.setAttribute('popovertarget',id);close.setAttribute('popovertargetaction','hide');pop.append(close);wrap.append(trigger,pop);return wrap;};
    // Screen labels are a presentation layer: the original label/value/caption stay in the DOM for exports.
    const relabel=(k,label,value)=>{k.dataset.ux13Relabel='true';const name=presentation(el('span','ux13-kpi-label',label));k.prepend(name);if(value!=null)(k.querySelector('strong')||name).after(presentation(el('strong','ux13-kpi-value',value)));return name;};
    const refresh=()=>{
      // Institutional date format (DD-MMM-AAAA) for the report timestamp built by the original renderer
      // («Consulta: 23/11/2026, 10:42 a. m.»); it is also what PDF/PNG print.
      host.querySelectorAll('.print-meta span').forEach(n=>{const m=n.textContent.match(/^Consulta: (\d{2})\/(\d{2})\/(\d{4}),?\s*(.*)$/);if(m)n.textContent='Consulta: '+window.CASUR_CRONO_PARTICIPATION.formatDate(`${m[3]}-${m[2]}-${m[1]}`)+(m[4]?' · '+m[4]:'');});
      const panel=host.querySelector('#printPanel');if(!panel)return;
      // Hero: one «Exportar» (original PDF/PNG buttons inside) and a compact GIS map action.
      installReportMenus(host);
      // H1: the band keeps only «Exportar». GIS is reached from a compact card after the TCH chart,
      // which activates the original map button (same handler, lazy loading and layer).
      const map=panel.querySelector('.ficha-band [data-casur-geo-action]'),chartBlock=panel.querySelector('.historical-chart-card')?.parentElement;
      if(map&&chartBlock&&!panel.querySelector('.ux13-map-card')){
        const card=presentation(button('',()=>map.click()));card.className='ux13-map-card no-print export-excluded';card.setAttribute('aria-label',map.getAttribute('aria-label')||'Abrir mapa');
        const glyph=el('span','ux13-map-icon');glyph.innerHTML=icon('map');const copy=el('span','ux13-map-copy');copy.append(el('b','','Mapa'),el('small','',map.querySelector('.copy small')?.textContent.trim()||''));card.append(glyph,copy,el('span','ux13-map-arrow','→'));
        (panel.querySelector('#historicalDrilldownMount')||chartBlock).after(card);
      }
      panel.querySelectorAll('.historical-drilldown-kpi small').forEach(n=>n.classList.toggle('ux13-ornamental',ornamental.test(n.textContent.trim())));
      const card=panel.querySelector('.historical-period-card');
      if(card&&!card.querySelector('.ux13-period')){
        const presets=[...card.querySelectorAll('.historical-period-preset')],summary=card.querySelector('.historical-period-summary');
        const row=presentation(el('div','ux13-period')),field=el('label','ux13-period-field','Período'),select=el('select');select.setAttribute('aria-label','Período histórico');
        presets.forEach((b,i)=>{const o=el('option','',b.textContent.trim());o.value=String(i);if(b.getAttribute('aria-pressed')==='true')o.selected=true;select.append(o);});
        select.onchange=()=>presets[Number(select.value)]?.click();field.append(select);
        const rawRange=summary?.querySelector('strong')?.textContent.trim()||'',seasonsIn=rawRange.match(/\d{2}\/\d{2}/g)||[],consecutive=seasonsIn.length>2&&seasonsIn.every((z,i)=>!i||Number(z.slice(0,2))===Number(seasonsIn[i-1].slice(0,2))+1),range=consecutive?seasonsIn[0]+'–'+seasonsIn[seasonsIn.length-1]:rawRange,scope=(summary?.querySelector('small')?.innerHTML.split(/<br\s*\/?>/i)[0]||'').replace(/<[^>]+>/g,'').trim();
        const meta=el('div','ux13-period-meta');meta.append(el('strong','ux13-period-range',range),el('small','',scope));row.append(field,meta);card.prepend(row);
      }
      const kpis=panel.querySelector('.historical-agronomic-kpis');
      if(kpis&&!kpis.querySelector('.ux13-more')){
        kpis.classList.add('ux13-kpis');
        kpis.querySelectorAll(':scope > .kpi').forEach(k=>{const label=k.querySelector('.label')?.textContent.trim()||'',kind=kpiKind(label);k.dataset.ux13Kpi=kind;const caption=k.querySelector('em');if(caption)caption.classList.toggle('ux13-ornamental',ornamental.test(caption.textContent.trim()));
          // H2: the area KPI is an area per season (ha/zafra), never the period total.
          if(kind==='area'){const raw=k.querySelector('strong')?.textContent.trim()||'',value=raw.replace(/\s*ha\/zafra$/i,' ha'),note=caption?.textContent.trim()||'',several=/acumulado/i.test(note);relabel(k,'Área por zafra',value).append(info('Detalle de área por zafra',[several?'Promedio del área cosechada en cada zafra del período.':'Área cosechada en la zafra seleccionada.',...(several?[note]:[])]));}
          if(kind==='edad')relabel(k,'Edad');});
        // H5: secondary indicators collapse like «Comparar TCH» (closed by default; choice kept across periods).
        const more=presentation(el('details','ux13-more')),n=kpis.querySelectorAll(':scope > [data-ux13-kpi=secondary]').length;
        more.append(el('summary','','Otros indicadores'));more.querySelector('summary').append(el('small','',String(n)));
        more.open=historicoMoreOpen;more.addEventListener('toggle',()=>{historicoMoreOpen=more.open;});more.querySelector('summary').addEventListener('click',()=>{historicoMoreOpen=!more.open;});
        kpis.append(more);
      }
      const title=panel.querySelector('.historical-comparison-title'),grid=panel.querySelector('.delta-grid');
      if(title&&grid&&!panel.querySelector('.ux13-compare')){
        const details=presentation(el('details','ux13-compare')),n=grid.querySelectorAll('.delta').length;
        details.append(el('summary','','Comparar TCH'));details.querySelector('summary').append(el('small','',n+' comparadores · mismas zafras del período'));
        details.open=historicoCompareOpen??innerWidth>=768;details.addEventListener('toggle',()=>{historicoCompareOpen=details.open;});
        // «toggle» is async: record the choice on activation too, so an immediate period change keeps it.
        details.querySelector('summary').addEventListener('click',()=>{historicoCompareOpen=!details.open;});
        title.before(details);
      }
    };
    new MutationObserver(refresh).observe(host,{childList:true,subtree:true});refresh();
  }

  // UX13-C (Z9): Zona KPI presentation. Figures come from the original zone renderer, which reads the same
  // effective window.CRONO_DATA as Cronológico General. Only first-level noise is hidden on screen.
  function installZonaUx13(){
    const host=byId('cronoZoneContent'),select=byId('cronoZoneSelect');if(!host)return;
    const ornamental=/^(Referencia · área activa|Área estimada × TCH|Ponderado por área|Cronológico)$/i;
    // Coverage is hidden only when complete (N/N molienda · 100 % área); partial coverage stays visible.
    const complete=t=>{const m=t.match(/^([\d,]+)\/([\d,]+) molienda · ([\d.,]+)% área$/);return !!m&&m[1]===m[2]&&Number(m[3].replace(/,/g,''))===100;};
    const refresh=()=>{
      const kpis=host.querySelector('.kpis');
      if(kpis&&!kpis.dataset.ux13){kpis.dataset.ux13='true';kpis.classList.add('ux13-zone-kpis');
        kpis.querySelectorAll(':scope > .kpi').forEach(k=>{const label=k.querySelector('.label')?.textContent.trim()||'',em=k.querySelector('em'),note=em?.textContent.trim()||'';
          if(/^(Suertes activas|Suertes|Haciendas)$/i.test(label))k.dataset.ux13Secondary='true';
          if(em&&(ornamental.test(note)||complete(note)||note===select?.value))em.classList.add('ux13-ornamental');
          if(/^TCH estimado/i.test(label)&&em&&!complete(note))k.dataset.ux13Coverage='partial';});}
      host.querySelectorAll('.crono-box > small').forEach(n=>{if(/^(Participación sobre .+\.|El porcentaje indica la participación en el área total CASUR\.)$/.test(n.textContent.trim()))n.classList.add('ux13-ornamental');});
    };
    new MutationObserver(refresh).observe(host,{childList:true,subtree:true});refresh();
    // Pre-existing gap: an open zone view was not repainted when the effective generation changed.
    document.addEventListener('casur-crono-effective-change',()=>{if(host.childElementCount)queueMicrotask(()=>window.selectCronoZone?.(select?.value||''));});
  }

  // UX14 (#66): Análisis por Zona. Presentation over the official engines only:
  // Z26/27 figures come from CASUR_CRONO_PARTICIPATION.summary() applied to each system subset,
  // Z25/26 from APP_DATA.lotCompact (tons / harvested area, Maquila excluded). No data writes.
  const IRRIGATED=new Set(['gravedad','goteo','aspersion','aspersión','pivote','mini-aspersion','mini-aspersión']);
  const SYSTEMS=['Riego','Secano','Ventana','Sin dato'];
  // Explicit classification: unknown values are «Sin dato», never Riego; «Ventana» awaits CASUR's operational definition.
  function productionSystem(value){const t=String(value??'').trim(),k=t.toLowerCase();if(!t)return 'Sin dato';if(k==='secano')return 'Secano';if(k==='ventana')return 'Ventana';return IRRIGATED.has(k)?'Riego':'Sin dato';}
  const zoneNumber=z=>String(z||'').match(/^\s*(\d+)/)?.[1]||null;
  const zoneScope=window.CASUR_ZONE_SCOPE={zone:'',system:'Total'};
  function zoneData(){
    const rows=(window.CRONO_DATA?.producers||[]).flatMap(p=>p.details||[]),lots=window.APP_DATA?.lotCompact||[];
    const latest=Math.max(0,...lots.flatMap(l=>(l[11]||[]).map(s=>s[0])));
    const histZones=[...new Set(lots.map(l=>l[2]).filter(z=>z&&!/MAQUILA/i.test(z)))];
    return {rows,lots,latest,histZones};
  }
  function cronoSubset(data,zone,system,farm){return data.rows.filter(r=>(!zone||r.zona===zone)&&(!farm||String(r.code)===String(farm))&&(system==='Total'||productionSystem(r.tipoRiego)===system));}
  function histFigures(data,zone,system,farm){
    const num=zoneNumber(zone);let area=0,tons=0,lots=0;
    data.lots.forEach(l=>{if(/MAQUILA/i.test(l[2]||''))return;if(zone&&zoneNumber(l[2])!==num)return;if(farm&&String(l[8])!==String(farm))return;if(system!=='Total'&&productionSystem(l[4])!==system)return;
      const s=(l[11]||[]).find(x=>x[0]===data.latest);if(s&&s[1]>0){area+=s[1];tons+=s[2];lots++;}});
    return {area,tons,lots,tch:area?tons/area:null};
  }
  function cronoFigures(rows){
    if(!rows.length)return {inventoryArea:0,activeLots:0,millingArea:0,estimateArea:0,estimateTons:null,estimateTch:null,lots:0};
    // Área activa uses the official participation rule (same as «Área activa por zona»), not inventoryArea,
    // which still counts the source area of non-participating rows such as Investigación.
    const s=engine().summary(rows),active=rows.filter(r=>activeAreaOf(r)>0);
    return {...s,inventoryArea:active.reduce((n,r)=>n+activeAreaOf(r),0),activeLots:active.length,lots:rows.length};
  }
  const seasonLabel=z=>z?'Z'+String(z).padStart(4,'0').replace(/(..)(..)/,'$1/$2'):'Z—';
  let ux14Tip=0;
  function infoTip(text){const id='ux14-tip-'+(++ux14Tip),b=el('button','ux14-info','i'),pop=presentation(el('div','maestro-help ux14-tip'));b.type='button';b.setAttribute('aria-label','Información');b.setAttribute('popovertarget',id);pop.id=id;pop.setAttribute('popover','');pop.append(el('p','',text));const w=el('span','ux14-info-wrap');w.append(b,pop);return w;}
  // Shared UX14 presentation pieces (Cronológico and Histórico de Zona).
  const ux14Kpi=(label,value,unit,note,tip,cls='')=>{const k=el('div','ux14-kpi '+cls),l=el('span','ux14-kpi-label',label);l.append(infoTip(tip));const v=el('strong','',value);v.append(el('small','',unit));k.append(l,v,el('em','',note));return k;};
  const ux14Bars=(title,scope,cats,series,max=100)=>{const f=el('figure','ux14-card ux14-bars'),cap=el('figcaption','',title);cap.append(el('small','ux14-scope',scope));f.append(cap);const leg=el('div','ux14-legend');series.forEach(s=>{const i=el('span','ux14-swatch');i.dataset.system=s;leg.append(i,el('span','',s));});f.append(leg);
    cats.forEach(([name,vals])=>{const g=el('div','ux14-group');g.append(el('b','',name));series.forEach(s=>{const v=vals[s],row=el('div','ux14-bar'),fill=el('span');fill.dataset.system=s;fill.style.width=(v>0?Math.min(100,v/max*100):0)+'%';row.append(fill,el('em','',v==null?dash:fmt(v)));row.setAttribute('aria-label',name+' · '+s+': '+(v==null?'sin dato':fmt(v)));g.append(row);});f.append(g);});return f;};
  const ux14Composition=(title,values,unit,digits)=>{const total=SYSTEMS.reduce((n,s)=>n+(values[s]||0),0),f=el('figure','ux14-card ux14-composition'),cap=el('figcaption','',title);cap.append(el('small','',fmt(total,digits)+' '+unit));f.append(cap);
    const stack=el('div','ux14-stack');SYSTEMS.filter(s=>values[s]>0).forEach(s=>{const p=el('span');p.dataset.system=s;p.style.flex=String(values[s]);stack.append(p);});f.append(stack);
    const list=el('ul','');SYSTEMS.filter(s=>values[s]>0).forEach(s=>{const li=el('li',''),sw=el('span','ux14-swatch');sw.dataset.system=s;li.append(sw,el('span','',s==='Ventana'?'Ventana · por confirmar':s),el('b','',fmt(values[s],digits)),el('small','',fmt(total?values[s]/total*100:0,1)+' %'));list.append(li);});f.append(list);return f;};
  // System selector shared by both tabs: Total/Riego/Secano plus explicit chips only when records exist.
  function ux14Controls(present,areaOf,rerender){
    const sys=zoneScope.system,ctl=presentation(el('div','ux14-controls')),seg=el('div','ux14-seg');seg.setAttribute('role','group');seg.setAttribute('aria-label','Sistema productivo');
    const choose=s=>{zoneScope.system=s;rerender();document.dispatchEvent(new Event('casur-zone-system'));};
    ['Total','Riego','Secano'].forEach(s=>{const b=button(s,()=>choose(s));b.setAttribute('aria-pressed',String(sys===s));seg.append(b);});ctl.append(seg);
    ['Ventana','Sin dato'].filter(present).forEach(s=>{const b=button((s==='Ventana'?'Ventana · por confirmar ':'Sin dato ')+fmt(areaOf(s))+' ha',()=>choose(sys===s?'Total':s));b.className='ux14-chip';b.setAttribute('aria-pressed',String(sys===s));ctl.append(b);});
    return ctl;
  }
  // Contextual return: after opening a farm from Zonas, a chip at the top of the target view returns to the
  // same zone, tab and productive system (state lives in the zone selects and CASUR_ZONE_SCOPE).
  function ux14Return(sectionId,label,tab){
    document.querySelectorAll('.ux14-return').forEach(n=>n.remove());const target=byId(sectionId);if(!target)return;
    const chip=presentation(button('← Volver a '+label,()=>{chip.remove();activate('zonas');document.querySelector('#zoneMainSection .ux09-section-tabs button[data-target="'+tab+'"]')?.click();}));chip.className='ux14-return';target.prepend(chip);
  }
  // Same formula as the Cronológico zone «Edad pond.» indicator (index.html, cronological IIFE):
  // base = later of last cut and sowing (fallback fBase), renewal without sowing = 0, weighted by r.area.
  function ux14Age(rows){
    const iso=v=>{if(!v)return null;const d=new Date(String(v)+'T00:00:00');return Number.isNaN(d.getTime())?null:d;};
    const now0=new Date(),now=new Date(now0.getFullYear(),now0.getMonth(),now0.getDate());let n=0,d=0;
    (rows||[]).forEach(r=>{const a=Number(r.area)||0,c=iso(r.fUltCte),s=iso(r.fSiembra),f=iso(r.fBase),base=c&&s?(s>c?s:c):(s||c||f);
      const m=r.renovacion&&!r.fSiembra?0:base?Math.max(0,(now-base)/86400000/30.4375):null;if(a>0&&m!==null){n+=a*m;d+=a;}});
    return d?n/d:null;
  }
  function ux14Strip(items){const s=el('div','ux14-strip');items.filter(Boolean).forEach(([label,value,tip])=>{const i=el('span','ux14-strip-item');i.append(el('span','',label),el('b','',value));if(tip)i.append(infoTip(tip));s.append(i);});return s;}
  function ux14Lines(title,seasons,series,unit,note){
    const f=el('figure','ux14-card ux14-lines'),cap=el('figcaption','',title);if(note)cap.append(infoTip(note));f.append(cap);
    const vals=series.flatMap(s=>s.values).filter(v=>Number.isFinite(v));if(!vals.length){f.append(el('p','ux14-meta','Sin datos para el ámbito seleccionado.'));return f;}
    const lo0=Math.min(...vals),hi0=Math.max(...vals),pad=(hi0-lo0)*0.12||Math.abs(hi0)*0.1||1,lo=Math.max(0,lo0-pad),hi=hi0+pad;
    const W=640,H=220,l=48,r=18,t=12,b=28,X=i=>l+(seasons.length>1?i*(W-l-r)/(seasons.length-1):(W-l-r)/2),Y=v=>t+(hi-v)*(H-t-b)/(hi-lo||1);
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.setAttribute('role','img');svg.setAttribute('aria-label',title);
    const add=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));if(text!=null)n.textContent=text;svg.append(n);return n;};
    for(let k=0;k<=4;k++){const v=lo+(hi-lo)*k/4;add('line',{x1:l,x2:W-r,y1:Y(v),y2:Y(v),class:'ux14-grid-line'});add('text',{x:l-6,y:Y(v)+4,'text-anchor':'end',class:'ux14-axis'},fmt(v,unit==='ha'||unit==='t'?0:0));}
    seasons.forEach((z,i)=>add('text',{x:X(i),y:H-8,'text-anchor':'middle',class:'ux14-axis'},String(z).padStart(4,'0').replace(/(..)(..)/,'$1/$2')));
    series.forEach(sr=>{const pts=sr.values.map((v,i)=>Number.isFinite(v)?`${X(i).toFixed(1)},${Y(v).toFixed(1)}`:null);let d='';pts.forEach((p,i)=>{if(p)d+=(d&&pts[i-1]?' L':' M')+p;});
      add('path',{d:d.trim(),class:'ux14-line',  'data-series':sr.name});sr.values.forEach((v,i)=>{if(Number.isFinite(v)){const c=add('circle',{cx:X(i),cy:Y(v),r:3,class:'ux14-dot','data-series':sr.name});const tt=document.createElementNS(ns,'title');tt.textContent=sr.name+' · '+seasonLabel(seasons[i])+': '+fmt(v)+' '+unit;c.append(tt);}});});
    const leg=el('div','ux14-legend');series.forEach(sr=>{const sw=el('span','ux14-line-key');sw.dataset.series=sr.name;const last=[...sr.values].reverse().find(v=>Number.isFinite(v));leg.append(sw,el('span','',sr.name+(last!=null?' '+fmt(last):'')));});
    const wrap=el('div','ux14-svg');wrap.append(svg);f.append(leg,wrap);return f;
  }
  function installZonaUx14(){
    const section=byId('cronoZoneSection'),host=byId('cronoZoneContent'),select=byId('cronoZoneSelect');if(!section||!host||!select)return;
    const root=el('section','ux14-zone');root.dataset.ux14='true';host.before(root);
    // UX14-B: the UX13 zone KPI row and the «Haciendas con mayor área» table are superseded (their unique facts
    // moved to the strip and the farm table); the agronomic composition grids below stay visible.
    const detailTitle=el('h4','ux14-detail-title','Composición agronómica de la zona');host.before(detailTitle);section.classList.add('ux14-on');
    const meta=()=>window.CRONO_DATA?.meta||{},date=iso=>window.CASUR_CRONO_PARTICIPATION?.formatDate?.(iso)||iso||'N/D';
    const openZone=z=>{select.value=z;window.selectCronoZone?.(z);};
    const openFarm=code=>{const z=select.value;activate('cronologico');window.renderCronoProducer?.(String(code));ux14Return('cronoSection',z?'Zona '+z:'Zonas','cronoZoneSection');};
    // Estimados keeps the zone and, where the explorer can express it exactly, the productive system:
    // Secano/Ventana as a riego scope; Riego (several irrigation types) as the riego breakdown inside the zone.
    const openEstimates=(z,sys)=>{const scope=z?[{field:'zona',key:z}]:[];if(sys==='Secano'||sys==='Ventana')scope.push({field:'tipoRiego',key:sys});
      explorerStates.set('general',{objective:'estimate',dimension:sys==='Riego'?'tipoRiego':(z?'variedad':'zona'),secondary:'zona',scope,mode:'general'});activate('cronologico');window.renderCronoHome?.();};
    const openHistory=z=>{const tab=[...document.querySelectorAll('#zoneMainSection .ux09-section-tabs button')].find(b=>b.dataset.target==='zoneAnalysisSection');tab?.click();const hs=byId('zoneSelect');const opt=z?[...(hs?.options||[])].find(o=>o.value&&zoneNumber(o.value)===zoneNumber(z)):null;if(hs){hs.value=opt?opt.value:'';window.selectZone?.(hs.value);}byId('zoneAnalysisSection')?.scrollIntoView({block:'start',behavior:'instant'});};
    const openAnalysis=()=>{activate('analisis');};
    const render=()=>{
      const data=zoneData();if(!data.rows.length){root.replaceChildren();return;}
      const zone=select.value||'',m=meta(),est=seasonLabel(String(m.estimateSeason||'').replace('/','')),exe=seasonLabel(data.latest);
      const scoped=cronoSubset(data,zone,'Total'),present=s=>scoped.some(r=>productionSystem(r.tipoRiego)===s);
      if(!['Total','Riego','Secano'].includes(zoneScope.system)&&!present(zoneScope.system))zoneScope.system='Total';
      const sys=zoneScope.system,rows=cronoSubset(data,zone,sys),c=cronoFigures(rows),h=histFigures(data,zone,sys);
      zoneScope.zone=zone;root.dataset.zone=zone;root.dataset.system=sys;root.replaceChildren();
      const head=el('div','ux14-head'),title=el('div','');title.append(el('h3','',zone?'Zona '+zone:'Todas las zonas'),el('p','ux14-meta','Aforo '+date(m.tchEst2627EffectiveDate)+' · Consolidado '+date(m.generated)));head.append(title);
      const crumbs=presentation(el('nav','ux14-crumbs'));crumbs.setAttribute('aria-label','Ámbito de zona');crumbs.append(button('Zonas',()=>openZone('')));if(zone)crumbs.append(el('span','','›'),el('b','',zone));head.append(crumbs);root.append(head);
      root.append(ux14Controls(present,s=>cronoFigures(cronoSubset(data,zone,s)).inventoryArea,render));
      const kpis=el('div','ux14-kpis');
      kpis.append(ux14Kpi('Área activa',fmt(c.inventoryArea),'ha',fmt(c.activeLots,0)+' suertes activas','Inventario vigente con caña del aforo. No es área cosechada ni área de molienda.'),
        ux14Kpi('TCH '+exe,fmt(h.tch),'t/ha','ejecutado · Histórico','TCH ejecutado = toneladas cosechadas ÷ área cosechada de la zafra '+exe+' (Histórico, sin Maquila) de los lotes que el aforo ubica en esta zona, para comparar la misma población con el estimado. La pestaña Histórico usa la asignación oficial finca → zona, por eso puede diferir levemente. Por sistema se usa el riego actual del lote. No es la columna «Tch.Ant» del aforo.','ux14-hist'),
        ux14Kpi('TCH estimado '+est,fmt(c.estimateTch),'t/ha','Aforo '+date(m.tchEst2627EffectiveDate),'Toneladas estimadas ÷ área de molienda con estimado (AD/AE, escenario oficial). El escenario optimista AF/AG no se incluye.','ux14-est'),
        ux14Kpi('Ton. estimadas '+est,fmt(c.estimateTons,0),'t','Molienda · '+fmt(c.estimateArea)+' ha con estimado','Toneladas oficiales (AE) de las suertes de Molienda con estimado.','ux14-est'));
      root.append(kpis);
      const active=rows.filter(r=>activeAreaOf(r)>0),low=rows.filter(r=>r.millingEstimatedTons!=null&&Number(r.tchEst2627)<45).reduce((n,r)=>n+(window.CASUR_OPERATIONAL_IMPORT.participation(r).millingArea||0),0);
      root.append(ux14Strip([['Área de molienda',fmt(c.millingArea)+' ha','Base del estimado: excluye Semilla y suertes fuera de producción.'],['Haciendas con área activa',fmt(new Set(active.map(r=>String(r.code))).size,0)],['Edad ponderada',fmt(ux14Age(rows))+' meses','Edad actual ponderada por área (mismo cálculo del indicador «Edad pond.» anterior de la zona).'],['TCH est. '+est+' < 45',fmt(low)+' ha','Área de molienda con TCH estimado (AD) menor a 45. Alerta observada del aforo, no causa ni pérdida.']]));
      const compRow=el('div','ux14-grid');const byS=f=>Object.fromEntries(SYSTEMS.map(s=>[s,f(cronoFigures(cronoSubset(data,zone,s)))]));
      compRow.append(ux14Composition('Área activa por sistema',byS(f=>f.inventoryArea),'ha',2),ux14Composition('Ton. estimadas '+est+' por sistema',byS(f=>f.estimateTons||0),'t',0));root.append(compRow);
      const chartRow=el('div','ux14-grid'),pair=['Riego','Secano'];
      if(!zone){
        const zones=[...new Set(data.rows.map(r=>r.zona).filter(Boolean))].sort((a,b)=>Number(zoneNumber(a))-Number(zoneNumber(b)));
        chartRow.append(ux14Bars('TCH estimado '+est+' · Riego vs Secano','comparación entre zonas',zones.map(z=>[z,Object.fromEntries(pair.map(s=>[s,cronoFigures(cronoSubset(data,z,s)).estimateTch]))]),pair),
          ux14Bars('TCH '+exe+' ejecutado · Riego vs Secano','comparación entre zonas',zones.map(z=>[z,Object.fromEntries(pair.map(s=>[s,histFigures(data,z,s).tch]))]),pair));root.append(chartRow);
        const list=el('section','ux14-card ux14-zone-list');list.append(el('h4','','Zonas · tocá para abrir la ficha'));
        zones.forEach(z=>{const zc=cronoFigures(cronoSubset(data,z,sys)),zh=histFigures(data,z,sys),b=button('',()=>openZone(z));b.className='ux14-zone-row';b.dataset.zone=z;b.append(el('b','',z),el('span','',fmt(zc.inventoryArea)+' ha'),el('small','','TCH '+exe+' '+fmt(zh.tch)+' · est. '+est+' '+fmt(zc.estimateTch)+' · '+fmt(zc.estimateTons,0)+' t'));list.append(b);});
        const only=data.histZones.filter(hz=>!zones.some(z=>zoneNumber(z)===zoneNumber(hz)));
        only.forEach(hz=>{const b=button('',()=>openHistory(hz));b.className='ux14-zone-row ux14-hist-only';b.append(el('b','',hz),el('span','ux14-scope','solo Histórico'));list.append(b);});
        root.append(list);
      }else{
        const series=SYSTEMS.filter(s=>s!=='Sin dato'&&present(s));
        chartRow.append(ux14Bars('TCH por sistema · '+zone,'solo '+zone,[[exe+' ejecutado',Object.fromEntries(series.map(s=>[s,histFigures(data,zone,s).tch]))],[est+' estimado',Object.fromEntries(series.map(s=>[s,cronoFigures(cronoSubset(data,zone,s)).estimateTch]))]],series));root.append(chartRow);
        const farms=[...new Map(rows.map(r=>[String(r.code),r])).keys()].map(code=>{const fr=rows.filter(r=>String(r.code)===code),f=cronoFigures(fr),p=window.CRONO_DATA.producers.find(x=>String(x.code)===code),act=fr.filter(r=>activeAreaOf(r)>0),aa=act.reduce((n,r)=>n+activeAreaOf(r),0),dist=aa?act.reduce((n,r)=>n+(Number(r.distancia)||0)*activeAreaOf(r),0)/aa:null;return {code,name:p?.name||code,f,dist,h:histFigures(data,zone,sys,code)};}).sort((a,b)=>b.f.inventoryArea-a.f.inventoryArea);
        const card=el('section','ux14-card ux14-farms'),cap=el('h4','','Haciendas de '+zone+(sys==='Total'?'':' · '+sys));card.append(cap);
        const headers=['Hacienda','Área activa ha','Suertes','Dist. pond. km','TCH '+exe.slice(1),'TCH est. '+est.slice(1),'Ton. est. t'],short=['','Área ha','Suertes','Dist. km','TCH '+exe.slice(1),'Est. '+est.slice(1),'Ton. est.'];
        const table=el('table',''),thead=el('thead'),tr=el('tr');headers.forEach(t=>tr.append(el('th','',t)));thead.append(tr);table.append(thead);const tbody=el('tbody');table.append(tbody);
        // Export hook: data-ux14-export="all" draws every row (full report table).
        let limit=root.dataset.ux14Export==='all'?farms.length:10;const fill=()=>{tbody.replaceChildren();farms.slice(0,limit).forEach(x=>{const row=el('tr'),name=el('td'),link=presentation(button(x.code+' · '+x.name,()=>openFarm(x.code)));link.className='ux14-farm-link';name.append(link,el('span','ux14-print-name',x.code+' · '+x.name));const cell=(i,v)=>{const td=el('td','',v);td.dataset.label=short[i];return td;};row.append(name,cell(1,fmt(x.f.inventoryArea)),cell(2,fmt(x.f.activeLots,0)),cell(3,fmt(x.dist)),cell(4,fmt(x.h.tch)),cell(5,fmt(x.f.estimateTch)),cell(6,fmt(x.f.estimateTons)));tbody.append(row);});more.hidden=farms.length<=limit;};
        const more=presentation(button('Mostrar todas ('+farms.length+')',()=>{limit=farms.length;fill();}));more.className='ux14-more';
        const wrap=el('div','ux14-table');wrap.append(table);card.append(wrap,more);fill();root.append(card);
      }
      const links=presentation(el('div','ux14-links'));links.append(button(zone?'Estimados '+est+' de la zona':'Estimados '+est,()=>openEstimates(zone,sys)),button(zone?'Histórico de la zona':'Histórico por zona',()=>openHistory(zone)),button('Análisis',openAnalysis));root.append(links);
      document.dispatchEvent(new CustomEvent('casur-scope-change',{detail:{...zoneScope}}));
    };
    let pending=0;const schedule=()=>{cancelAnimationFrame(pending);pending=requestAnimationFrame(render);};
    new MutationObserver(schedule).observe(host,{childList:true});select.addEventListener('change',schedule);
    document.addEventListener('casur-crono-effective-change',schedule);section.addEventListener('toggle',()=>{if(section.open)schedule();});
    document.addEventListener('casur-zone-system',schedule);
    window.CASUR_ZONE_UX14=Object.freeze({productionSystem,render:schedule,figures:(zone='',system='Total')=>{const d=zoneData(),rows=cronoSubset(d,zone,system);return {crono:cronoFigures(rows),hist:histFigures(d,zone,system),age:ux14Age(rows)};},histFigures:(zone='',system='Total')=>histZoneFigures(zone,system)});
    schedule();
  }
  // UX14-B: Histórico de Zona. Total figures come from the official zone engine (zoneAnalysis: farm → zone
  // assignment, latest zafra per farm). Riego/Secano split the same official lots (entity.details of the
  // latest zafra) by the lot's CURRENT irrigation system; trends follow those lots in lotCompact.
  function histZones(){return [...new Set((window.mainEntities?.()||[]).filter(e=>!e.isMaquila).map(e=>e.zona).filter(Boolean))].sort((a,b)=>Number(zoneNumber(a))-Number(zoneNumber(b)));}
  function histZoneFigures(zone,system){
    const analyses=(zone?[zone]:histZones()).map(z=>window.zoneAnalysis?.(z)).filter(Boolean);
    const ents=analyses.flatMap(a=>a.latestEnts||[]),allEnts=analyses.flatMap(a=>a.ents||[]);
    const details=ents.flatMap(e=>(e.details||[]).map(d=>({...d,farm:String(e.code),farmName:e.name})));
    const inSys=r=>system==='Total'||productionSystem(r.riego)===system,sel=details.filter(inSys);
    const sum=(list,k)=>list.reduce((n,d)=>n+(Number(d[k])||0),0);
    const fig=list=>{const area=sum(list,'area'),ton=sum(list,'ton');return {area,ton,tch:area?ton/area:null,katm:ton?list.reduce((n,d)=>n+(Number(d.rto)||0)*(Number(d.ton)||0),0)/ton:null,edad:area?list.reduce((n,d)=>n+(Number(d.edad)||0)*(Number(d.area)||0),0)/area:null,lots:list.length};};
    const trendMap=new Map();analyses.forEach(a=>(a.trend||[]).forEach(t=>{const x=trendMap.get(t.zafra)||{area:0,ton:0,rto:0,edad:0,suertes:0};x.area+=t.area;x.ton+=t.ton;x.rto+=(t.rto||0)*t.ton;x.edad+=(t.edad||0)*t.area;x.suertes+=t.suertes||0;trendMap.set(t.zafra,x);}));
    const seasons=[...trendMap.keys()].sort((a,b)=>a-b);
    const codes=new Set(allEnts.flatMap(e=>(e.details||[]).map(d=>String(d.codLote||d.hhhsss))));
    const lots=(window.APP_DATA?.lotCompact||[]).filter(l=>codes.has(String(l[0])));
    const lotSeason=(z,s)=>{let area=0,ton=0,rto=0;lots.forEach(l=>{if(s!=='Total'&&productionSystem(l[4])!==s)return;const x=(l[11]||[]).find(q=>q[0]===z);if(x&&x[1]>0){area+=x[1];ton+=x[2];rto+=(x[4]||0)*x[2];}});return {area,ton,rto};};
    const official=seasons.map(z=>{const x=trendMap.get(z);return {zafra:z,area:x.area,ton:x.ton,tch:x.area?x.ton/x.area:null,katm:x.ton?x.rto/x.ton:null,edad:x.area?x.edad/x.area:null,lots:x.suertes};});
    const bySystem=s=>seasons.map(z=>{const x=lotSeason(z,s);return {zafra:z,area:x.area,ton:x.ton,tch:x.area?x.ton/x.area:null,katm:x.ton?x.rto/x.ton:null};});
    const histOf=list=>{const a=list.reduce((n,x)=>n+x.area,0),t=list.reduce((n,x)=>n+x.ton,0);return a?t/a:null;};
    const series=system==='Total'?official:bySystem(system),last3=series.slice(-3);
    const coverage=seasons.map((z,i)=>{const seg=SYSTEMS.reduce((n,s)=>n+lotSeason(z,s).area,0);return official[i].area?seg/official[i].area:null;});
    const one=zone?analyses[0]:null;
    // Official latest-zafra edad (area-weighted over the official zone figures); per-system edad uses the lots.
    const offLatest=analyses.reduce((o,a)=>{const l=a.latest||{};if(l.area>0){o.area+=l.area;o.edad+=(l.edad||0)*l.area;}return o;},{area:0,edad:0});
    const latest=fig(sel);if(system==='Total'&&offLatest.area)latest.edad=offLatest.edad/offLatest.area;
    return {analyses,ents,allEnts,details,latest,latestBySystem:Object.fromEntries(SYSTEMS.map(s=>[s,fig(details.filter(d=>productionSystem(d.riego)===s))])),seasons,official,bySystem,
      hist:system==='Total'&&one?one.hist.tch:histOf(series),last3:system==='Total'&&one?one.last3.tch:histOf(last3),last3Seasons:last3.map(x=>x.zafra),potential:system==='Total'&&one?one.potential:null,coverage,lots};
  }
  function installZonaHistUx14(){
    const section=byId('zoneAnalysisSection'),host=byId('zoneContent'),select=byId('zoneSelect');if(!section||!host||!select||!window.zoneAnalysis)return;
    const root=el('section','ux14-zone ux14-hist-zone');root.dataset.ux14Hist='true';host.before(root);section.classList.add('ux14h-on');
    const title2=el('h4','ux14-detail-title','Diagnóstico histórico de la zona · motor oficial');host.before(title2);
    let metric='tch',rankBy='tch',limit=10;
    const openZone=z=>{select.value=z;window.selectZone?.(z);if(!z)window.resetZoneHistoricoSummary?.();schedule();};
    const openFarm=code=>{const z=select.value;activate('historico');window.renderEntity?.(String(code));ux14Return('fichaSection',z?'Zona '+z:'Zonas','zoneAnalysisSection');};
    const cronoZone=z=>[...(byId('cronoZoneSelect')?.options||[])].find(o=>o.value&&zoneNumber(o.value)===zoneNumber(z))?.value||'';
    const openCrono=z=>{document.querySelector('#zoneMainSection .ux09-section-tabs button[data-target="cronoZoneSection"]')?.click();const cz=cronoZone(z),cs=byId('cronoZoneSelect');if(cs){cs.value=cz;window.selectCronoZone?.(cz);}};
    const render=()=>{
      const zone=select.value||'',zones=histZones();
      const presentTotal=histZoneFigures(zone,'Total'),noLatest=!(presentTotal.latest.area>0),present=s=>presentTotal.details.some(d=>productionSystem(d.riego)===s);
      // Historical-only zones have no lot breakdown in the official engine: only Total is exact there.
      const wanted=zoneScope.system,sys=noLatest||(!['Total','Riego','Secano'].includes(wanted)&&!present(wanted))?'Total':wanted;
      const F=sys==='Total'?presentTotal:histZoneFigures(zone,sys),last=F.seasons[F.seasons.length-1],exe=seasonLabel(last),L=noLatest?{...F.official[F.official.length-1]}:F.latest;
      root.dataset.zone=zone;root.dataset.system=sys;root.replaceChildren();
      const head=el('div','ux14-head'),title=el('div','');title.append(el('h3','',zone?'Histórico · '+zone:'Histórico · Todas las zonas'),el('p','ux14-meta','Zafras '+seasonLabel(F.seasons[0]).slice(1)+'–'+exe.slice(1)+' · Maquila excluida'));head.append(title);
      const crumbs=presentation(el('nav','ux14-crumbs'));crumbs.setAttribute('aria-label','Ámbito histórico');crumbs.append(button('Zonas',()=>openZone('')));if(zone)crumbs.append(el('span','','›'),el('b','',zone));head.append(crumbs);root.append(head);
      if(!noLatest){root.append(ux14Controls(present,s=>presentTotal.latestBySystem[s].area,render));root.append(el('p','ux14-note','Riego / Secano según el sistema de riego actual del lote: el Histórico no registra el sistema de cada zafra.'));}
      else root.append(el('p','ux14-note','Zona solo histórica: última zafra registrada '+exe+'. Sin desglose por sistema en el motor oficial; se muestra el Total.'));
      const kpis=el('div','ux14-kpis');
      kpis.append(ux14Kpi('TCH '+exe,fmt(L.tch),'t/ha','ejecutado','Toneladas ÷ área cosechada de la última zafra de cada finca (motor oficial de zonas). Por sistema: mismas suertes, riego actual.','ux14-hist'),
        ux14Kpi('Área cosechada '+exe,fmt(L.area),'ha',fmt(L.lots,0)+' suertes','Área cosechada histórica. No es área activa ni área de molienda del aforo.','ux14-hist'),
        ux14Kpi('Toneladas '+exe,fmt(L.ton,0),'t','producción propia','Toneladas cosechadas, sin Maquila.','ux14-hist'),
        ux14Kpi('KATM '+exe,fmt(L.katm),'kg/t','ponderado por toneladas','Kilogramos de azúcar por tonelada, ponderados por toneladas.','ux14-hist'));
      root.append(kpis);
      root.append(ux14Strip([['TCH histórico',fmt(F.hist),'Toneladas ÷ área de todas las zafras disponibles'+(sys==='Total'?' (motor oficial).':' de las suertes del sistema.')],['TCH últimas 3',fmt(F.last3),F.last3Seasons.map(z=>seasonLabel(z).slice(1)).join(' · ')],['Edad prom. '+exe,fmt(L.edad)+' meses','Edad a cosecha ponderada por área.'],F.potential!=null?['Potencial',fmt(F.potential,0)+' t','Motor oficial: toneladas adicionales si las fincas por debajo alcanzaran el promedio de la zona. Es una estimación técnica, no una pérdida observada.']:null]));
      const compRow=el('div','ux14-grid');if(!noLatest)compRow.append(ux14Composition('Área cosechada '+exe+' por sistema',Object.fromEntries(SYSTEMS.map(s=>[s,presentTotal.latestBySystem[s].area])),'ha',2),ux14Composition('Toneladas '+exe+' por sistema',Object.fromEntries(SYSTEMS.map(s=>[s,presentTotal.latestBySystem[s].ton])),'t',0));root.append(compRow);
      const metrics=[['tch','TCH','t/ha'],['area','Área cosechada','ha'],['ton','Toneladas','t'],['katm','KATM','kg/t']],mt=metrics.find(x=>x[0]===metric);
      const trendCard=el('div','ux14-trend'),mseg=presentation(el('div','ux14-seg ux14-metric'));mseg.setAttribute('role','group');mseg.setAttribute('aria-label','Métrica de la tendencia');
      metrics.forEach(([k,l])=>{const b=button(l,()=>{metric=k;render();});b.setAttribute('aria-pressed',String(metric===k));mseg.append(b);});
      const seriesNames=noLatest?['Total']:['Total','Riego','Secano',...(present('Ventana')?['Ventana']:[])];
      const pick=list=>list.map(x=>x[metric==='ton'?'ton':metric]);
      const series=seriesNames.map(n=>({name:n,values:pick(n==='Total'?presentTotal.official:presentTotal.bySystem(n))}));
      const covs=presentTotal.coverage.filter(Number.isFinite),minCov=covs.length?Math.min(...covs):0;
      trendCard.append(mseg,ux14Lines('Tendencia por zafra · '+mt[1]+(zone?' · '+zone:' · CASUR'),F.seasons,series,mt[2],'Total: motor oficial de zonas. Riego y Secano: suertes de la última zafra seguidas en el Histórico según su riego actual; en zafras anteriores cubren al menos '+fmt(minCov*100,0)+' % del área oficial.'));root.append(trendCard);
      const chartRow=el('div','ux14-grid'),pair=['Riego','Secano'];
      if(!zone){
        chartRow.append(ux14Bars('TCH '+exe+' · Riego vs Secano','comparación entre zonas',zones.map(z=>{const f=histZoneFigures(z,'Total');return [z,Object.fromEntries(pair.map(s=>[s,f.latestBySystem[s].tch]))];}),pair),
          ux14Bars('KATM '+exe+' · Riego vs Secano','comparación entre zonas',zones.map(z=>{const f=histZoneFigures(z,'Total');return [z,Object.fromEntries(pair.map(s=>[s,f.latestBySystem[s].katm]))];}),pair,140));root.append(chartRow);
        const list=el('section','ux14-card ux14-zone-list');list.append(el('h4','','Zonas · tocá para abrir el histórico'));
        zones.forEach(z=>{const f=histZoneFigures(z,sys),b=button('',()=>openZone(z));b.className='ux14-zone-row';b.dataset.zone=z;const has=f.latest.area>0;
          b.append(el('b','',z),el('span','',has?fmt(f.latest.area)+' ha':'sin '+exe),el('small','',has?'TCH '+exe+' '+fmt(f.latest.tch)+' · KATM '+fmt(f.latest.katm)+' · histórico '+fmt(f.hist):'TCH histórico '+fmt(f.hist)+(cronoZone(z)?'':' · solo Histórico')));list.append(b);});
        root.append(list);
      }else{
        const series2=SYSTEMS.filter(s=>s!=='Sin dato'&&present(s));
        if(!noLatest){chartRow.append(ux14Bars('TCH y KATM '+exe+' por sistema · '+zone,'solo '+zone,[['TCH',Object.fromEntries(series2.map(s=>[s,presentTotal.latestBySystem[s].tch]))],['KATM',Object.fromEntries(series2.map(s=>[s,presentTotal.latestBySystem[s].katm]))]],series2,140));root.append(chartRow);}
        const farmCodes=[...new Set(F.allEnts.map(e=>String(e.code)))];
        const farms=farmCodes.map(code=>{const e=F.allEnts.find(x=>String(x.code)===code),det=(e.details||[]).filter(d=>sys==='Total'||productionSystem(d.riego)===sys),latestE=F.ents.includes(e);
          const area=latestE?det.reduce((n,d)=>n+d.area,0):0,ton=latestE?det.reduce((n,d)=>n+d.ton,0):0,codes=new Set(det.map(d=>String(d.codLote||d.hhhsss)));
          let ha=0,ht=0;if(sys==='Total'){ha=e.hist?.area||0;ht=e.hist?.ton||0;}else F.lots.forEach(l=>{if(!codes.has(String(l[0])))return;(l[11]||[]).forEach(x=>{if(x[1]>0){ha+=x[1];ht+=x[2];}});});
          return {code,name:e.name,area:latestE?area:null,ton:latestE?ton:null,tch:area?ton/area:null,katm:ton?det.reduce((n,d)=>n+(d.rto||0)*d.ton,0)/ton:null,hist:ha?ht/ha:null,lots:det.length};}).filter(x=>x.lots||x.hist!=null);
        farms.forEach(x=>{x.delta=x.tch!=null&&x.hist!=null?x.tch-x.hist:null;});
        const order=noLatest?'hist':rankBy,keyOf={tch:x=>x.tch??-1e9,ton:x=>x.ton??-1e9,delta:x=>x.delta??-1e9,hist:x=>x.hist??-1e9}[order];farms.sort((a,b)=>keyOf(b)-keyOf(a));
        const card=el('section','ux14-card ux14-farms ux14-ranking'),cap=el('h4','','Ranking de fincas · '+zone+(sys==='Total'?'':' · '+sys));card.append(cap);
        const sort=presentation(el('label','ux14-sort','Ordenar por '));const ss=el('select');[['tch','TCH '+exe.slice(1)],['ton','Toneladas'],['delta','Δ vs histórico'],['hist','TCH histórico']].forEach(([k,l])=>{const o=el('option','',l);o.value=k;ss.append(o);});ss.value=order;ss.disabled=noLatest;ss.onchange=()=>{rankBy=ss.value;render();};sort.append(ss);card.append(sort);
        const headers=['#','Finca','Área '+exe.slice(1)+' ha','TCH '+exe.slice(1),'KATM','TCH histórico','Δ vs hist.'],short=['','','Área ha','TCH','KATM','Histórico','Δ hist.'];
        const table=el('table',''),thead=el('thead'),tr=el('tr');headers.forEach(t=>tr.append(el('th','',t)));thead.append(tr);table.append(thead);const tbody=el('tbody');table.append(tbody);
        const fill=()=>{tbody.replaceChildren();farms.slice(0,root.dataset.ux14Export==='all'?farms.length:limit).forEach((x,i)=>{const row=el('tr'),name=el('td'),link=presentation(button(x.code+' · '+x.name,()=>openFarm(x.code)));link.className='ux14-farm-link';name.append(link,el('span','ux14-print-name',x.code+' · '+x.name));const cell=(k,v)=>{const td=el('td','',v);td.dataset.label=short[k];return td;};
          const d=el('td','',x.delta==null?dash:(x.delta>=0?'+':'')+fmt(x.delta));d.dataset.label=short[6];if(x.delta!=null)d.dataset.sign=x.delta>=0?'up':'down';
          row.append(cell(0,String(i+1)),name,cell(2,fmt(x.area)),cell(3,fmt(x.tch)),cell(4,fmt(x.katm)),cell(5,fmt(x.hist)),d);tbody.append(row);});more.hidden=farms.length<=limit;};
        const more=presentation(button('Mostrar todas ('+farms.length+')',()=>{limit=farms.length;fill();}));more.className='ux14-more';
        const wrap=el('div','ux14-table');wrap.append(table);card.append(wrap,more);fill();root.append(card);
      }
      const links=presentation(el('div','ux14-links'));const cz=zone?cronoZone(zone):'';
      if(!zone||cz)links.append(button(zone?'Cronológico de la zona':'Cronológico por zona',()=>openCrono(zone)));links.append(button('Análisis',()=>activate('analisis')));root.append(links);
      zoneScope.histZone=zone;
    };
    let pending=0;const schedule=()=>{cancelAnimationFrame(pending);pending=requestAnimationFrame(render);};
    new MutationObserver(schedule).observe(host,{childList:true});select.addEventListener('change',()=>{limit=10;schedule();});
    section.addEventListener('toggle',()=>{if(section.open)schedule();});document.addEventListener('casur-zone-system',schedule);
    schedule();
  }

  function installIteration03() {
    if(!byId('cronoMultiCount')){setTimeout(installIteration03,100);return;}
    const host=byId('cronoContent'),input=byId('cronoQ'),box=byId('cronoSuggestions');
    const season=()=>window.CRONO_DATA?.meta?.estimateSeason||'N/D';
    const search=byId('cronoQ').closest('.searchbox'),options=presentation(el('details','context-search-options'));options.append(el('summary','','Selección múltiple'));
    // UX13: #cronoQ is the single visible finder. The farm SELECT stays in the DOM as the
    // internal state control (renderers and multi-selection read it) but is not shown twice.
    const selector=byId('cronoProducerSelect'),actions=byId('cronoMultiToggle')?.closest('.crono-actions');if(selector){selector.classList.add('ux13-internal-select');selector.tabIndex=-1;selector.setAttribute('aria-hidden','true');options.append(selector);}if(actions)options.append(actions);search.after(options);input.placeholder='Buscar finca o suerte…';

    const tray=document.createElement('div');tray.id='maestroSelectionTray';tray.className='no-print export-excluded';tray.dataset.exportExclude='true';byId('cronoMultiBar')?.after(tray);
    const selection=()=>window.CASUR_CRONO_SELECTION.capture();
    const updateTray=()=>{tray.replaceChildren();const state=selection();tray.hidden=!state.mode&&!state.keys.length;const title=document.createElement('b');title.textContent=state.keys.length+' suertes seleccionadas';tray.append(title);state.keys.forEach(key=>{const [code,lot]=key.split('::');const p=window.CRONO_DATA.producers.find(p=>String(p.code)===code),r=p?.details.find(r=>String(r.suerte)===lot);const b=document.createElement('button');b.type='button';b.textContent=(r?.codLote||key)+' ×';b.setAttribute('aria-label','Quitar '+(r?.codLote||key));b.onclick=()=>{window.toggleCronoSuerteSelection(key,false);updateTray();};tray.append(b);});for(const[label,fn]of[['Limpiar selección',()=>window.clearCronoMultiSelection()],['Aplicar selección',()=>window.renderCronoMultiSummary()]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>{fn();updateTray();};tray.append(b);}};
    new MutationObserver(updateTray).observe(byId('cronoMultiCount'),{childList:true});updateTray();
    const clearSearch=presentation(button('🧹',()=>{input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));input.focus({preventScroll:true});}));clearSearch.setAttribute('aria-label','Limpiar búsqueda');clearSearch.title='Limpiar búsqueda';clearSearch.classList.add('ux04-clear-search');search.append(clearSearch);
    guardSuggestionBlur(input,box,'hideCronoSuggestions');
    input.addEventListener('focus',()=>{if(!selection().mode&&input.value){input.select();window.showCronoSuggestions();}});
    const reopen=()=>{input.value='';input.focus({preventScroll:true});box.replaceChildren(el('div','ux04-search-prompt','Escribí un código o nombre para agregar otra suerte.'));box.style.display='block';updateTray();};
    let priorKeys='';box.addEventListener('pointerdown',e=>{if(selection().mode){priorKeys=JSON.stringify(selection().keys);e.preventDefault();}});
    box.addEventListener('click',()=>{if(selection().mode)queueMicrotask(()=>{if(JSON.stringify(selection().keys)!==priorKeys)reopen();});});
    input.addEventListener('keydown',e=>{if(e.key!=='Enter'||!selection().mode)return;e.preventDefault();e.stopImmediatePropagation();const raw=input.value.trim();const rows=window.CRONO_DATA.producers.flatMap(p=>p.details);const row=rows.find(r=>String(r.codLote)===raw);if(row){window.toggleCronoSuerteSelection(String(row.code)+'::'+String(row.suerte),true);reopen();}else{window.showCronoSuggestions();}},true);
    const sumStrip=rows=>{const s=window.CASUR_CRONO_PARTICIPATION.summary(rows);const n=document.createElement('div');n.className='maestro-scope-strip no-print export-excluded';n.dataset.exportExclude='true';n.textContent='Molienda '+fmt(s.millingArea)+' ha · '+fmt(s.millingLots,0)+' suertes   |   Semilla '+fmt(s.seedArea)+' ha · '+fmt(s.seedLots,0)+' suertes   |   Cobertura '+fmt(s.coberturaEstimadoAreaPct)+' %   |   Catálogo '+fmt(s.catalogLots,0);return n;};
    let farmMap=null,mapRoot=null;
    const refresh=()=>{
      if(mapRoot&&!mapRoot.isConnected){farmMap?.destroy();farmMap=null;mapRoot=null;}
      const general=host.querySelector('.crono-general-kpis');
      if(general&&!host.querySelector('.maestro-general-hero')){
        const hero=document.createElement('div');hero.className='maestro-general-hero no-print export-excluded';hero.dataset.exportExclude='true';const h=document.createElement('h2');h.textContent='Cronológico General';const p=document.createElement('p');p.textContent='Análisis agronómico, área y estimados · Z'+season();hero.append(h,p);general.before(hero);

      }
      const root=host.querySelector('#cronoPrintPanel');
      if(root&&host.dataset.geoScope==='farm'&&!root.dataset.premiumFarm){
        root.dataset.premiumFarm='true';const producer=window.CRONO_DATA.producers.find(p=>String(p.code)===byId('cronoProducerSelect').value);if(!producer)return;
        const band=root.querySelector('.ficha-band');band.querySelector('h2').textContent=producer.name;
        const charts=root.querySelector('.crono-summary-grid'),table=root.querySelector('.table-wrap');charts?.classList.add('premium-original-analysis');table?.classList.add('premium-original-analysis');
        const mapPanel=presentation(el('section','maestro-farm-map maestro-panel-inactive'));mapPanel.innerHTML='<div id="maestroFarmMap"></div><small>Geometrías oficiales de la finca completa · mosaicos según disponibilidad</small>';mapRoot=mapPanel;
        const scopeSummary=window.CASUR_CRONO_PARTICIPATION.summary(producer.details),overview=presentation(el('section','ux09-farm-overview'));
        const original=root.querySelector('.kpis'),sourceKpi=pattern=>[...original.querySelectorAll('.kpi')].find(k=>pattern.test(k.querySelector('.label')?.textContent||'')),readKpi=pattern=>sourceKpi(pattern)?.querySelector('strong')?.textContent.trim()||'N/D';
        const knownArea=producer.details.some(r=>r.sourcePresence==='present'&&[r.inventoryArea,r.area].every(v=>v===null||v===undefined||String(v).trim()===''||!Number.isFinite(Number(v))))?null:producer.details.reduce((sum,r)=>sum+window.CASUR_OPERATIONAL_IMPORT.participation(r).activeArea,0);
        const metrics=el('dl','ux09-farm-metrics');[['Área activa',fmt(knownArea)+' ha'],['TCH est. Z'+(scopeSummary.estimateSeason||'N/D'),fmt(scopeSummary.estimateTch)+' t/ha'],['TCH zafra pasada Z25/26',readKpi(/TCH.*Ant/i)+' t/ha'],['Edad ponderada',readKpi(/Edad ponderada/i)]].forEach(([label,value])=>{const item=el('div');item.append(el('dt','',label),el('dd','',value));metrics.append(item);});overview.append(el('h3','','Resumen productivo · '+producer.name),metrics);
        // UX13: concise farm composition instead of «Detalle complementario» paragraphs.
        const composition=el('section','ux13-composition');composition.setAttribute('aria-label','Composición de la finca');composition.append(el('h4','','Composición de la finca'));
        const compositionTotal=(scopeSummary.millingArea||0)+(scopeSummary.seedArea||0),shareOf=a=>compositionTotal>0?fmt(a/compositionTotal*100,1)+' %':'N/D',track=el('div','ux13-composition-bar'),legend=el('ul','ux13-composition-legend');track.setAttribute('aria-hidden','true');
        [['milling','Molienda',scopeSummary.millingArea,scopeSummary.millingLots],['seed','Semilla',scopeSummary.seedArea,scopeSummary.seedLots]].forEach(([kind,name,area,lots])=>{if(!(lots>0))return;const seg=el('i','ux13-seg-'+kind);seg.style.width=(compositionTotal>0?area/compositionTotal*100:0)+'%';track.append(seg);const item=el('li','ux13-'+kind);item.append(el('b','',name),el('span','',fmt(area)+' ha · '+fmt(lots,0)+(lots===1?' suerte':' suertes')),el('small','',shareOf(area)));legend.append(item);});
        if(compositionTotal>0)composition.append(track);composition.append(legend);
        const extra=[];if(scopeSummary.estimateState==='applied'&&scopeSummary.pendingMillingLots>0)extra.push('Molienda sin estimado: '+fmt(scopeSummary.pendingMillingArea)+' ha · '+fmt(scopeSummary.pendingMillingLots,0)+' suertes');if(scopeSummary.inactiveLots>0)extra.push(fmt(scopeSummary.inactiveLots,0)+' suertes del catálogo sin área activa');const distance=sourceKpi(/Distancia/i);if(distance)extra.push('Distancia ponderada: '+readKpi(/Distancia/i));
        overview.append(composition);
        // UX13 P2: farm facts that are not Molienda/Semilla composition live in a secondary disclosure.
        if(extra.length){const more=el('details','ux13-farm-more'),list=el('ul','ux13-farm-more-list');more.append(el('summary','','Otros datos de finca'));extra.forEach(t=>list.append(el('li','',t)));more.append(list);overview.append(more);}original.classList.add('ux09-farm-original');original.after(overview);
        const explorer=contextualExplorer(producer.details,'farm-'+producer.code,{farm:true,mapPanel,table});explorer.append(mapPanel);overview.after(explorer);
        // Secondary actions live in the farm band: compact Mapa / Histórico next to the single «Exportar».
        const bandActions=presentation(el('div','ux13-band-actions')),mapAction=button('Mapa',()=>{const showing=explorer.dataset.objective==='map';explorer.setObjective(showing?(mapAction.dataset.previous||'area'):'map');if(!showing)mapPanel.scrollIntoView({block:'start',behavior:'instant'});});
        mapAction.dataset.previous='area';mapAction.className='ux13-band-action';mapAction.insertAdjacentHTML('afterbegin',icon('map'));mapAction.setAttribute('aria-label','Mapa de la finca '+producer.name);mapAction.title='Mapa de la finca';
        const historyAction=button('Histórico',()=>{activate('historico');window.renderEntity?.(String(producer.code));});historyAction.className='ux13-band-action';historyAction.insertAdjacentHTML('afterbegin',icon('clock'));historyAction.setAttribute('aria-label','Histórico de '+producer.name);historyAction.title='Histórico de la finca';
        explorer.onObjective=key=>{mapAction.setAttribute('aria-pressed',String(key==='map'));if(key!=='map')mapAction.dataset.previous=key;};explorer.onObjective(explorer.dataset.objective);
        bandActions.append(mapAction,historyAction);(band.querySelector('.ficha-actions')||band).prepend(bandActions);
        let farmMapFitted=false;const fitVisibleFarmMap=()=>{if(farmMapFitted||!farmMap||mapPanel.classList.contains('maestro-panel-inactive'))return;farmMapFitted=farmMap.fitToData();};mapPanel.addEventListener('casur:map-visible',fitVisibleFarmMap);(async()=>{try{const features=await window.CASUR_GEO_DATA.getLotGeometries(producer.details.map(r=>r.codLote));if(!mapPanel.isConnected)return;if(!features.length){mapPanel.querySelector('small').textContent='Sin geometrías oficiales disponibles para esta finca.';return;}farmMap=window.createCasurMap(mapPanel.querySelector('div'),{ariaLabel:'Mapa oficial de '+producer.name,autoFit:false});farmMap.setLots(features);requestAnimationFrame(fitVisibleFarmMap);}catch(e){if(mapPanel.isConnected)mapPanel.querySelector('small').textContent='Mapa no disponible: '+e.message;}})();
      }
      installReportMenus(host);
      // Plan Z26/27 (#67): the harvest-plan KPI names its season, on screen and in exports.
      const planLabel='Fecha para cosecha '+season();
      host.querySelectorAll('.casur-proposal-kpi > .label').forEach(n=>{if(/^Fecha para cosecha$/.test(n.textContent.trim()))n.textContent=planLabel;});
      if(root&&host.dataset.geoScope==='lot'){
        const record=window.CRONO_DATA?.producers?.flatMap(p=>p.details).find(r=>String(r.codLote)===String(host.dataset.geoLotId));
        const facts=root.querySelector('.premium-ficha-info .context-technical-facts');
        // Sowing (N) and last cut (O) are crop-cycle dates, distinct from the scheduled harvest date (BE).
        if(record&&facts&&!facts.querySelector('.ux13-cycle-date'))[['F. siembra',record.fSiembra],['F. último corte',record.fUltCte]].forEach(([name,iso])=>{const pair=presentation(el('div','ux13-cycle-date'));pair.append(el('dt','',name),el('dd','',iso?window.CASUR_CRONO_PARTICIPATION.formatDate(iso):dash));facts.prepend(pair);});
        const alert=(window.CRONO_DATA?.operational?.planAlerts||[]).find(a=>String(a.key)===String(host.dataset.geoLotId)),kpi=root.querySelector('.casur-proposal-kpi');
        if(alert&&kpi&&!kpi.querySelector('.ux13-plan-alert')){const note=presentation(el('small','ux13-plan-alert','Revisar con Programación: '+fmt(alert.months)+' meses desde '+window.CASUR_CRONO_PARTICIPATION.formatDate(alert.base)));note.setAttribute('role','note');kpi.append(note);}
        root.querySelectorAll('.single-suerte-kpis .kpi').forEach(k=>{const label=k.querySelector('.label')?.textContent||'';let key=/TCH\s*Estim/i.test(label)?'estimate':/Fecha.*cosecha/i.test(label)?'proposal':/Área activa/i.test(label)?'area':/Edad actual/i.test(label)?'age':/TCH.*Ant/i.test(label)?'previous':/Variedad/i.test(label)?'variety':'';if(key)k.dataset.ux09Kpi=key;});
        const previous=root.querySelector('[data-ux09-kpi="previous"]'),technical=root.querySelector('.premium-ficha-info');if(previous&&technical&&!technical.querySelector('.ux09-previous')){const entry=presentation(el('p','ux09-previous'));entry.append(el('span','',previous.querySelector('.label')?.textContent.trim()||'TCH anterior'),el('strong','',previous.querySelector('strong')?.textContent.trim()||'N/D'));technical.append(entry);}
      }
      host.querySelectorAll('.crono-general-kpis .kpi,.kpis .kpi,.ficha-actions .ico').forEach((n,i)=>{if(n.dataset.premiumIcon)return;n.dataset.premiumIcon='1';if(n.classList.contains('ico'))n.innerHTML=icon(n.closest('.pdf')?'pdf':n.closest('.image')?'image':n.closest('[data-casur-geo-action]')?'map':'table');else {const label=n.querySelector('.label');if(label)label.insertAdjacentHTML('afterbegin',icon(/TON\./i.test(label.textContent)?'truck':/TCH/.test(label.textContent)?'chart':/\bEDAD\b|FECHA/i.test(label.textContent)?'clock':/DISTANCIA/i.test(label.textContent)?'map':'leaf'));}});
      host.querySelectorAll('.maestro-ficha-tabs button').forEach(b=>{if(!b.querySelector('svg'))b.insertAdjacentHTML('afterbegin',icon(/Mapa/.test(b.textContent)?'map':/Estimados/.test(b.textContent)?'chart':/finca|Suertes|tabla/i.test(b.textContent)?'table':/gráfico/i.test(b.textContent)?'chart':'leaf'));});
      const label=byId('maestro-general-tab-tch');if(label&&label.textContent!=='Estimados Z'+season())label.textContent='Estimados Z'+season();

      host.querySelectorAll('.hrow').forEach(row=>{if(row.dataset.premiumTooltip)return;row.dataset.premiumTooltip='1';row.tabIndex=0;row.title=row.getAttribute('aria-label')||row.textContent.trim();});
    };
    new MutationObserver(refresh).observe(host,{childList:true,subtree:true});refresh();
    const summaryTab=byId('maestro-summary-tab-tch');if(summaryTab)summaryTab.textContent='Estimados Z'+season();

  }

  // Present operational state without exposing internal generation identifiers.
  function presentOperationalStatus() {
    const strip = document.querySelector('.casur-release-strip');
    if (!strip) return;
    // Source decisions must remain reachable from every Maestro view.
    if (strip.previousElementSibling?.tagName !== 'HEADER') document.querySelector('header')?.after(strip);
    const kind = document.getElementById('casurReleaseKind');
    const local = kind?.textContent === 'Generación local aprobada';
    if (strip.dataset.local !== String(local)) strip.dataset.local = String(local);
    const status = document.getElementById('casurDataStatus');
    if (!status) return;
    const current = status.textContent;
    let readable = current;
    if (/^Generación local conservada\. Oficial disponible:/.test(current)) readable = 'Generación local conservada. Hay datos oficiales disponibles.';
    if (/^Datos oficiales CASUR actualizados ·/.test(current)) readable = 'Datos oficiales CASUR actualizados.';
    if (readable !== current) status.textContent = readable;
  }

  function init() {
    new MutationObserver(presentOperationalStatus).observe(document.body, {childList:true, subtree:true, characterData:true});
    presentOperationalStatus();
    const home = byId('homeSection'), header = document.querySelector('header');
    if (!home || !header || byId('maestroTabs')) return;
    const nav = document.createElement('div'); nav.id = 'maestroTabs'; nav.className = 'maestro-tabs no-print export-excluded';
    nav.dataset.exportExclude = 'true'; nav.setAttribute('role', 'tablist'); nav.setAttribute('aria-label', 'Vistas del Maestro de Suertes');
    views.forEach(([view, label, id]) => {
      const button = document.createElement('button'); button.type = 'button'; button.id = 'maestro-tab-' + view;
      button.dataset.maestroTab = view; button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', id);
      button.textContent = label; button.setAttribute('aria-label',label); button.hidden = !allowed(view); button.addEventListener('click', () => activate(view));
      nav.append(button);
      const panel = byId(id); if (panel) { panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', button.id); }
    });
    nav.addEventListener('keydown', event => {
      const tabs = [...nav.querySelectorAll('button')].filter(b => !b.hidden);
      const i = tabs.indexOf(document.activeElement); if (i < 0) return;
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : ['ArrowRight','ArrowDown'].includes(event.key) ? (i + 1) % tabs.length : ['ArrowLeft','ArrowUp'].includes(event.key) ? (i + tabs.length - 1) % tabs.length : -1;
      if (index < 0) return; event.preventDefault(); tabs[index].focus(); tabs[index].click();
    });
    // Paleta institucional predeterminada. El selector de apariencia se retira
    // para liberar espacio; no cambia datos, motor, informes ni navegación.
    document.body.dataset.maestroTheme = 'claro';
    const sidebar = document.createElement('aside'); sidebar.id = 'maestroSidebar'; sidebar.className = 'no-print export-excluded';
    sidebar.innerHTML = '<div class="maestro-sidebar-brand"><img src="../../shared/assets/brand/casur-logo.png" alt="CASUR"></div><div class="maestro-sidebar-foot"><b>CASUR</b><span>Negocios de Caña</span><small>Producción eficiente y sostenible</small></div>';
    sidebar.querySelector('.maestro-sidebar-brand').after(nav); document.body.append(sidebar);
    const tools=document.createElement('div');tools.className='maestro-sidebar-tools';const launcher=byId('masterAdminLauncher');if(launcher){sidebar.querySelector('.maestro-sidebar-foot').before(tools);tools.append(launcher);}
    nav.setAttribute('aria-orientation','vertical');
    const menu = document.createElement('button'); menu.type='button'; menu.id='maestroMenu'; menu.innerHTML=icon('menu'); menu.setAttribute('aria-label','Abrir navegación'); menu.setAttribute('aria-controls','maestroSidebar'); menu.setAttribute('aria-expanded','false');
    header.querySelector('.head')?.prepend(menu);
    const shade=document.createElement('button'); shade.id='maestroShade'; shade.type='button'; shade.setAttribute('aria-label','Cerrar navegación'); shade.hidden=true; document.body.append(shade);
    const compact=matchMedia('(max-width:800px)');
    const rail=document.createElement('button');rail.type='button';rail.id='maestroRailToggle';rail.innerHTML=icon('rail');rail.setAttribute('aria-controls','maestroSidebar');sidebar.querySelector('.maestro-sidebar-brand').after(rail);
    const setRail=collapsed=>{document.body.classList.toggle('maestro-rail',collapsed);rail.setAttribute('aria-expanded',String(!collapsed));rail.title=collapsed?'Expandir panel':'Contraer panel';rail.setAttribute('aria-label',rail.title);};
    try{setRail(sessionStorage.getItem('casur.maestro.rail')==='1');}catch{}
    rail.onclick=()=>{const collapsed=!document.body.classList.contains('maestro-rail');setRail(collapsed);try{sessionStorage.setItem('casur.maestro.rail',collapsed?'1':'0');}catch{}window.dispatchEvent(new Event('resize'));};
    nav.querySelectorAll('button').forEach(b=>{b.title=b.textContent;const label=document.createElement('span');label.textContent=b.textContent;b.replaceChildren(label);});
    const closeMenu=()=>{document.body.classList.remove('maestro-menu-open');menu.setAttribute('aria-expanded','false');shade.hidden=true;sidebar.inert=compact.matches;};
    compact.addEventListener('change',closeMenu);closeMenu();
    menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';document.body.classList.toggle('maestro-menu-open',open);menu.setAttribute('aria-expanded',String(open));shade.hidden=!open;sidebar.inert=!open&&compact.matches;if(open)nav.querySelector('[aria-selected=true]')?.focus();});
    shade.addEventListener('click',()=>{closeMenu();menu.focus();});
    nav.addEventListener('click',closeMenu);
    document.addEventListener('keydown',e=>{if(menu.getAttribute('aria-expanded')!=='true')return;if(e.key==='Escape'){closeMenu();menu.focus();}else if(e.key==='Tab'){e.preventDefault();nav.querySelector('[aria-selected=true]')?.focus();}});
    const moduleTitle = header.querySelector('.brand-title h1'); if (moduleTitle) moduleTitle.textContent = 'Maestro de Suertes';
    const secondary=document.createElement('img');secondary.src='assets/negocios-de-cana.webp';secondary.alt='Negocios de Caña CASUR';secondary.width=512;secondary.height=512;secondary.className='maestro-secondary-logo';header.querySelector('.brand')?.prepend(secondary);
    nav.querySelectorAll('button').forEach((button,i)=>button.insertAdjacentHTML('afterbegin',icon(['home','table','clock','map','chart'][i])));
    const title = home.querySelector('h2'); if (title) title.textContent = 'Resumen de producción';
    const subtitle = home.querySelector('.hero-copy p'); if (subtitle) { subtitle.id = 'maestroSummarySeason'; subtitle.textContent = 'Panorama de la zafra vigente'; }
    const summary = document.createElement('section'); summary.id = 'maestroSummary'; summary.setAttribute('aria-label', 'Indicadores del Cronológico vigente'); summary.setAttribute('aria-busy', 'true');
    summary.innerHTML = `<div class="maestro-kpis">
        <article class="maestro-kpi maestro-kpi-primary"><span>Área activa</span><strong id="maestroActiveArea">—</strong><small id="maestroActiveLots">Cargando datos</small></article>
        <article class="maestro-kpi"><span>Área válida estimada</span><strong id="maestroEstimateArea">—</strong><small id="maestroEstimateLots"></small></article>
        <article class="maestro-kpi"><span>Toneladas estimadas</span><strong id="maestroEstimateTons">—</strong><small>Molienda con estimado autorizado</small></article>
        <article class="maestro-kpi"><span>TCH estimado</span><strong id="maestroEstimateTch">—</strong><small>Toneladas ÷ área válida estimada</small></article>
      </div><details class="maestro-population"><summary>Composición del área y cobertura</summary><div class="maestro-population-detail"><span>Catálogo <b id="maestroCatalog">—</b></span><span>Molienda <b id="maestroMilling">—</b></span><span>Semilla <b id="maestroSeed">—</b></span><span id="maestroCoverage"></span></div></details>`;
    home.querySelector('#moduleAccess')?.before(summary);
    const hero=document.createElement('div');hero.className='maestro-summary-hero';
    const copy=home.querySelector('.hero-copy');if(copy){copy.before(hero);hero.append(copy);}
    summary.querySelector('.maestro-kpis').innerHTML=[
      ['leaf','Área activa total','maestroActiveArea','maestroActiveLots','Incluye molienda y semilla activas; excluye registros inactivos o ausentes.',''],
      ['truck','Toneladas estimadas','maestroEstimateTons','','Aforo autorizado destinado a molienda, de la generación efectiva.',''],
      ['chart','TCH estimado','maestroEstimateTch','','Toneladas autorizadas divididas por área válida de molienda. Semilla no participa en este denominador.',''],
      ['clock','TCH anterior Z25/26','maestroPreviousTch','','Referencia canónica del Cronológico General: CRONO_DATA.global.tch, zafra anterior 25/26.','']
    ].map(([symbol,label,id,smallId,help,caption],i)=>`<article class="maestro-kpi ${i===0?'maestro-kpi-primary':''}"><div class="maestro-kpi-icon">${icon(symbol)}</div><div class="maestro-kpi-copy"><span ${i===1?'id="maestroTonsLabel"':i===2?'id="maestroTchLabel"':''}>${label}</span> <button type="button" class="maestro-info" popovertarget="maestro-help-${i}" aria-label="Definición de ${label}">${icon('info')}</button><strong id="${id}">—</strong>${smallId||caption?'<small '+(smallId?'id="'+smallId+'"':'')+'>'+caption+'</small>':''}</div><div id="maestro-help-${i}" popover class="maestro-help"><b>${label}</b><p>${help}</p><button type="button" popovertarget="maestro-help-${i}" popovertargetaction="hide">Cerrar</button></div></article>`).join('');
    summary.querySelector('.maestro-population').innerHTML='<summary>Composición de área, molienda y semilla</summary><div class="maestro-population-detail"><span>Molienda <b id="maestroMillingArea"></b> · <b id="maestroMilling"></b> suertes</span><span>Semilla <b id="maestroSeedArea"></b> · <b id="maestroSeed"></b> suertes</span><span>Catálogo <b id="maestroCatalog"></b></span><span id="maestroCoverage"></span><span id="maestroPending"></span><div id="maestroComposition" aria-label="Composición del área activa: molienda y semilla"></div></div>';
    const dashboard=document.createElement('section');dashboard.id='maestroDashboard';dashboard.dataset.panel='area';dashboard.innerHTML='<div class="maestro-dashboard-heading"><div><h2>Consultas</h2><p>Accesos a los análisis y fincas</p></div></div><nav class="ux09-hub-actions" aria-label="Accesos de consulta"></nav><div id="maestroDashboardContent" role="tabpanel"></div>';
    summary.after(dashboard);
    const hub=dashboard.querySelector('.ux09-hub-actions');
    const hubCard=(title,description,iconName,action)=>{const card=button('',action),glyph=el('span','ux09-hub-icon'),copy=el('span','ux09-hub-copy');glyph.innerHTML=icon(iconName);copy.append(el('strong','',title),el('small','',description));card.append(glyph,copy,el('span','ux09-hub-arrow','→'));return card;};
    hub.append(hubCard('Cronológico','Fincas, suertes y aforo vigente','table',()=>{explorerStates.set('general',{objective:'area',dimension:'zona',secondary:'zona',scope:[]});activate('cronologico');window.renderCronoHome();}),hubCard('Histórico','Zafras, TCH y KATM','clock',()=>activate('historico')));
    const analysis = document.createElement('button'); analysis.type = 'button'; analysis.className = 'hero-module-card module-analysis';
    analysis.innerHTML = '<span class="hero-module-icon">4</span><span class="hero-module-copy"><span class="hero-module-kicker">Lectura gerencial</span><strong>Análisis</strong><small>Tendencias, variedades, TCH × KATM, prioridades y maquila.</small></span>';
    analysis.hidden = !allowed('analisis'); analysis.addEventListener('click', () => activate('analisis')); byId('moduleAccess')?.append(analysis);
    const trail = document.createElement('div'); trail.className = 'maestro-crono-trail no-print export-excluded'; trail.dataset.exportExclude = 'true';
    trail.innerHTML = '<div><button type="button" id="maestroGeneral">General CASUR</button><button type="button" id="maestroZone" hidden>Zona</button><span aria-hidden="true"> / </span><b id="maestroCronoLocation">General CASUR</b></div><button type="button" id="maestroBackFarm" hidden>Volver a la finca</button>';
    byId('cronoSection')?.querySelector('.accordion-body')?.prepend(trail);
    byId('maestroGeneral').addEventListener('click', () => { ux09ReturnContext=null;window.renderCronoHome?.(); updateTrail(); });
    byId('maestroCronoLocation').before(byId('maestroBackFarm'));
    const contextualBack=presentation(button('Volver al análisis',()=>{if(!ux09ReturnContext)return;const saved=ux09ReturnContext;ux09ReturnContext=null;explorerStates.set('general',saved.state);window.renderCronoHome();requestAnimationFrame(()=>window.scrollTo({top:saved.scroll,behavior:'instant'}));}));contextualBack.id='ux09ReturnAnalysis';contextualBack.hidden=true;byId('maestroCronoLocation').before(contextualBack);
    new MutationObserver(()=>{contextualBack.hidden=!(ux09ReturnContext&&['lot','farm'].includes(byId('cronoContent').dataset.geoScope));}).observe(byId('cronoContent'),{childList:true,subtree:true,attributes:true,attributeFilter:['data-geo-scope']});

    byId('maestroBackFarm').addEventListener('click', () => { const code = byId('cronoProducerSelect')?.value; if (code) window.renderCronoProducer?.(code); });

    // Original entry points remain available to shell/deep links and old buttons.
    const originalNav = window.nav;
    window.nav = function (id, ...args) {
      const view = views.find(v => v[2] === id)?.[0];
      if (view) return activate(view);
      return originalNav?.call(this, id, ...args);
    };
    window.openCronoPanel = () => activate('cronologico');
    window.goHistoricoModule = () => activate('historico');
    window.goZoneModule = () => activate('zonas');
    // Programmatic drill-through (including TCH) reveals its original panel.
    for (const [fn, view] of [['renderEntity', 'historico'], ['selectCronoProducer', 'cronologico'], ['selectCronoSuerteSuggestion', 'cronologico'], ['viewCronoSuerte', 'cronologico']]) {
      const original = window[fn]; if (typeof original !== 'function') continue;
      window[fn] = function (...args) { activate(view, {restoring:true, scroll:false}); return original.apply(this, args); };
    }
    // Preserve technical authorization: the original launcher/guard still runs.
    byId('masterUpdateSection')?.addEventListener('toggle', event => {
      document.body.classList.toggle('maestro-admin-open', event.target.open && !event.target.classList.contains('is-locked'));
    });
    // Shortcuts reference existing nodes; no report reparenting or chart rebuilding.
    for (const id of ['cronoContent', 'fichaContent']) {
      const host = byId(id); if (!host) continue;
      const links = document.createElement('nav');
      links.className = 'maestro-report-links no-print export-excluded';
      links.dataset.exportExclude = 'true'; links.setAttribute('aria-label', 'Accesos a la ficha');
      host.before(links);
      const search = host.parentElement.querySelector('.searchbox');
      const query = document.createElement('div'); query.className='maestro-query no-print export-excluded'; query.dataset.exportExclude='true';
      search.before(query); query.append(search);
      let rendered = null;
      const compactQuery = () => {
        const report=host.firstElementChild;
        if(report===rendered) return; rendered=report;
        if(host.querySelector('#cronoPrintPanel, #printPanel, .hist-multi-summary-root')) {
          query.setAttribute('aria-label','Cambiar consulta de finca o suerte');
        }
      };
      new MutationObserver(compactQuery).observe(host,{childList:true});
      const refreshLinks = () => {
        links.replaceChildren();
        if (id === 'cronoContent') { links.hidden=true; updateTrail(); return; }
        for (const [label, selector] of [['Indicadores', '.kpis, .crono-multi-kpis'], ['Gráficos', '.crono-trend-card, .chart-wrap, .crono-summary-grid'], ['Detalle', '.table-wrap'], ['Mapa y exportación', '[data-casur-export-kind]']]) {
          const target = host.querySelector(selector); if (!target) continue;
          const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
          button.addEventListener('click', () => { target.scrollIntoView({block:'start',behavior:'instant'}); target.setAttribute('tabindex','-1'); target.focus({preventScroll:true}); });
          links.append(button);
        }
        links.hidden = !links.childElementCount;
        updateTrail();
      };
      new MutationObserver(refreshLinks).observe(host, {childList:true,subtree:true});
      refreshLinks();
    }
    // Present existing sections as a single active view, preserving their DOM and engines.
    const tabSections=(sectionId,ids,labels)=>{const section=byId(sectionId);if(!section)return;const panels=ids.map(id=>byId(id)).filter(p=>p&&section.contains(p));if(!panels.length||section.querySelector('.ux09-section-tabs'))return;const nav=presentation(el('nav','ux09-section-tabs'));nav.setAttribute('aria-label',sectionId==='zoneMainSection'?'Vistas de zonas':'Vistas de análisis');
      const show=id=>{panels.forEach(p=>{const on=p.id===id;p.classList.toggle('ux09-view-inactive',!on);p.open=on;});nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.target===id)));window.dispatchEvent(new Event('resize'));};
      panels.forEach(p=>{p.classList.add('ux09-tabbed-panel');const b=button(labels[p.id]||p.querySelector('summary')?.textContent.trim().split('\n')[0]||p.id,()=>show(p.id));b.dataset.target=p.id;nav.append(b);});const hint=presentation(el('p','ux09-tabs-hint','Deslizá para ver más secciones →'));panels[0].before(nav,hint);show(panels[0].id);};
    tabSections('zoneMainSection',['cronoZoneSection','zoneAnalysisSection'],{cronoZoneSection:'Cronológico',zoneAnalysisSection:'Histórico'});
    tabSections('executiveAnalysisSection',['summaryAcc','trendAcc','committeeAcc','priorityAcc','potentialAcc','renewalAcc','chartsAcc','matrixAcc','zoneAcc','bestAcc','fallingAcc','techAcc','maquilaAcc'],{summaryAcc:'Resumen',trendAcc:'Tendencia TCH',committeeAcc:'Decisiones',priorityAcc:'Prioridades',potentialAcc:'Oportunidades',renewalAcc:'Renovación',chartsAcc:'Variedades',matrixAcc:'TCH × KATM',zoneAcc:'Zonas',bestAcc:'Mejores desempeños',fallingAcc:'Caídas',techAcc:'Vista técnica',maquilaAcc:'Maquila'});
    new MutationObserver(()=>{tabSections('executiveAnalysisSection',['summaryAcc','trendAcc','committeeAcc','priorityAcc','potentialAcc','renewalAcc','chartsAcc','matrixAcc','zoneAcc','bestAcc','fallingAcc','techAcc','maquilaAcc'],{summaryAcc:'Resumen',trendAcc:'Tendencia TCH',committeeAcc:'Decisiones',priorityAcc:'Prioridades',potentialAcc:'Oportunidades',renewalAcc:'Renovación',chartsAcc:'Variedades',matrixAcc:'TCH × KATM',zoneAcc:'Zonas',bestAcc:'Mejores desempeños',fallingAcc:'Caídas',techAcc:'Vista técnica',maquilaAcc:'Maquila'});}).observe(byId('executiveAnalysisSection'),{childList:true,subtree:true});
    installSearch('cronoQ', 'cronoSuggestions'); installSearch('q', 'searchSuggestions');
    installPremiumFicha();
    installGeneralPanels();
    installIteration03();
    installHistoricoUx13();
    installZonaUx13();
    installZonaUx14();
    installZonaHistUx14();
    document.body.classList.add('casur-maestro-premium');
    document.dispatchEvent(new Event('casur-premium-ready'));
    // The shell already owns mobile bottom navigation; keep only module tabs.
    document.body.classList.toggle('maestro-embedded', window.self !== window.top);
    activate('resumen', {scroll:false});
    const refresh = () => { refreshSummary(); updateTrail(); };
    document.addEventListener('casur-production-ready', refresh);
    document.addEventListener('casur-crono-effective-change', refresh);
    document.addEventListener('casur-master-overlay', () => queueMicrotask(refresh));
    window.addEventListener('load', refresh, {once:true});
    window.CASUR_MAESTRO_UX = Object.freeze({ activate, capture: () => active, restore, refresh: refreshSummary });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
})();
