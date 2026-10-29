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
  let active = 'resumen', cronoVisited = false;
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
    text('maestroTonsLabel','Toneladas estimadas Z'+(summary.estimateSeason||'N/D'));
    text('maestroTchLabel','TCH estimado Z'+(summary.estimateSeason||'N/D'));
    const composition=byId('maestroComposition');if(composition)composition.style.setProperty('--milling-share',((summary.millingArea/(summary.millingArea+summary.seedArea)||0)*100)+'%');
    text('maestroCoverage', fmt(summary.coberturaEstimadoAreaPct) + ' % del área de molienda');
    text('maestroCatalog', fmt(summary.catalogLots ?? rows.length, 0));
    text('maestroMilling', fmt(summary.millingLots, 0));
    text('maestroSeed', fmt(summary.seedLots, 0));
    text('maestroSeason', 'Zafra ' + (data.meta?.estimateSeason || summary.estimateSeason || 'N/D'));
    const personal = !!window.CASUR_OPERATIONAL_LOCAL || !!data.meta?.manualChanges ||
      !!(window.CASUR_MASTER_OVERLAY && window.CASUR_MASTER_OVERLAY.dataVersion === data.meta?.dataVersion);
    text('maestroSource', personal ? 'Generación personal' : 'Datos oficiales CASUR');
    text('maestroGeneration', data.meta?.dataVersion || 'Generación no disponible');
    text('maestroSourceName', data.meta?.source || 'Cronológico vigente');
    text('maestroSummarySeason', 'Panorama de la zafra ' + (data.meta?.estimateSeason || summary.estimateSeason || 'vigente'));
    const host = byId('maestroSummary');
    if (host) { host.dataset.generation = data.meta?.dataVersion || ''; host.setAttribute('aria-busy', 'false'); }
    refreshDashboard(rows,engine);
  }

  function refreshDashboard(rows){
    const host=byId('maestroDashboardContent');if(!host)return;
    const generation=window.CRONO_DATA.meta.dataVersion;
    if(host.dataset.contextGeneration===generation&&host.firstElementChild)return;
    host.dataset.contextGeneration=generation;host.replaceChildren(contextualExplorer(rows,'summary'));
  }

  // View models come exclusively from the operational participation aggregator.
  // No cached dataset, arithmetic TCH mean or alternate selection store.
  const el=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!=null)n.textContent=value;return n;};
  const presentation=n=>{n.classList.add('no-print','export-excluded');n.dataset.exportExclude='true';return n;};
  const engine=()=>window.CASUR_CRONO_PARTICIPATION;
  const groupRows=(rows,field,key)=>rows.filter(r=>engine().agronomicGroups([r],field).length&&(field==='stage'?engine().cropStage(r):String(r[field]??'').trim()||'Sin clasificar')===key);
  function detailTip(target,lines){
    target.tabIndex=0;target.setAttribute('aria-label',lines.join('. '));
    const show=()=>{
      let tip=byId('maestroAnalyticTip');if(!tip){tip=presentation(el('div','maestro-analytic-tip'));tip.id='maestroAnalyticTip';tip.setAttribute('role','tooltip');document.body.append(tip);}
      tip.replaceChildren(...lines.map((line,i)=>el(i?'span':'b','',line)));tip.hidden=false;
      target.setAttribute('aria-describedby',tip.id);const r=target.getBoundingClientRect();
      tip.style.left=Math.max(8,Math.min(innerWidth-tip.offsetWidth-8,r.left))+'px';
      tip.style.top=Math.max(8,Math.min(innerHeight-tip.offsetHeight-8,r.bottom+6))+'px';
    };
    const hide=()=>{const tip=byId('maestroAnalyticTip');if(tip)tip.hidden=true;target.removeAttribute('aria-describedby');};
    target.addEventListener('mouseenter',show);target.addEventListener('focus',show);target.addEventListener('click',show);
    target.addEventListener('mouseleave',hide);target.addEventListener('blur',hide);target.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
  }
  const explorerStates=new Map();
  const dimensions=[['variedad','Variedad'],['tipoRiego','Riego'],['zona','Zona'],['textura','Textura'],['tenencia','Tenencia'],['destino','Destino'],['stage','N.º corte']];
  const button=(label,fn)=>{const b=el('button','',label);b.type='button';b.onclick=fn;return b;};
  function openDrawer(title,content,onClose){
    const focus=document.activeElement,dialog=presentation(el('dialog','context-drawer'));dialog.setAttribute('aria-label',title);
    const head=el('header','context-drawer-head');head.append(el('h2','',title),button('Cerrar',()=>dialog.close()));dialog.append(head,content);
    dialog.addEventListener('close',()=>{onClose?.();dialog.remove();if(focus?.isConnected)focus.focus();},{once:true});document.body.append(dialog);dialog.showModal();return dialog;
  }
  function chooseControl(label,options,value,onChange){const wrap=el('label','context-control',label),select=el('select');select.setAttribute('aria-label',label);options.forEach(([key,name])=>{const option=el('option','',name);option.value=key;select.append(option);});select.value=value;select.onchange=()=>onChange(select.value);wrap.append(select);return wrap;}
  function directory(rows,farm=false){
    const wrap=el('div','context-directory'),input=el('input');input.type='search';input.placeholder=farm?'Buscar suerte…':'Buscar finca o zona…';input.setAttribute('aria-label',input.placeholder);const list=el('div','context-results');let limit=8;
    const render=()=>{list.replaceChildren();const q=input.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();const items=farm?rows:window.CRONO_DATA.producers.filter(p=>p.details.some(r=>rows.includes(r)));const matches=items.filter(r=>[r.codLote,r.name,r.code,r.zone,r.variedad].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q));
      matches.slice(0,limit).forEach(r=>{const b=button(farm?'Suerte '+r.codLote:r.name+' · '+r.code,()=>{wrap.closest('dialog')?.close();if(farm)window.selectCronoSuerteSuggestion(String(r.code),String(r.suerte));else window.renderCronoProducer(String(r.code));});b.append(el('small','',farm?(r.variedad||'Sin variedad'):r.zone));list.append(b);});list.append(el('small','',Math.min(limit,matches.length)+' de '+matches.length+' resultados'));if(matches.length>limit)list.append(button('Mostrar más',()=>{limit+=8;render();}));};input.oninput=()=>{limit=8;render();};wrap.append(input,list);render();return wrap;
  }
  function contextualExplorer(rows,id,{farm=false,mapPanel=null,table=null}={}){
    const state=explorerStates.get(id)||{objective:'area',dimension:'variedad',secondary:'zona',scope:[]};explorerStates.set(id,state);
    const board=presentation(el('section','context-explorer'));board.dataset.context=id;const toolbar=el('div','context-toolbar'),crumbs=el('nav','context-crumbs'),content=el('div','context-content');crumbs.setAttribute('aria-label','Ámbito analítico');
    const objectives=[['area','Distribución de área'],['estimate','Estimados de zafra'],['directory',farm?'Suertes':'Consultar fincas'],...(mapPanel?[['map','Mapa GIS']]:[])];
    const objective=chooseControl('Consultar',objectives,state.objective,v=>{state.objective=v;render();});
    const dimension=chooseControl('Dimensión',dimensions,state.dimension,v=>{state.dimension=v;render();}),secondary=chooseControl('Desglosar por',dimensions,state.secondary,v=>{state.secondary=v;});toolbar.append(objective,dimension,secondary);board.append(toolbar,crumbs,content);
    const scopedRows=()=>state.scope.reduce((subset,filter)=>groupRows(subset,filter.field,filter.key),rows);
    const render=()=>{
      const scoped=scopedRows();board.dataset.state=JSON.stringify(state);content.replaceChildren();crumbs.replaceChildren();
      const base=button(farm?'Toda la finca':'General CASUR',()=>{state.scope=[];render();});crumbs.append(base);
      state.scope.forEach((filter,index)=>crumbs.append(button(filter.key,()=>{state.scope=state.scope.slice(0,index+1);render();})));
      if(state.scope.length)crumbs.append(button('Volver',()=>{state.scope.pop();render();}),button('Limpiar ámbito',()=>{state.scope=[];render();}));
      dimension.hidden=secondary.hidden=['directory','map'].includes(state.objective);
      if(mapPanel){mapPanel.classList.toggle('maestro-panel-inactive',state.objective!=='map');if(state.objective==='map'){requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));return;}}
      if(state.objective==='directory'){content.append(directory(scoped,farm));if(table)content.append(button('Tabla técnica · 18 columnas',()=>showOriginalTable(table)));return;}
      const groups=engine().agronomicGroups(scoped,state.dimension),summary=engine().summary(scoped),total=groups.reduce((sum,g)=>sum+g.area,0);board.dataset.groups=JSON.stringify(groups);board.dataset.summary=JSON.stringify(summary);
      content.append(el('p','context-hint',state.objective==='area'?'Seleccioná una categoría para desglosarla por '+(dimensions.find(d=>d[0]===state.secondary)?.[1]||'zona')+'.':'Área válida de molienda · toneladas autorizadas · TCH ponderado · cobertura del aforo'));
      const results=el('div','context-results');const limit=4;
      const appendGroup=(g,target)=>{const line=el('div','context-row'),open=button(g.key,()=>{state.scope.push({field:state.dimension,key:g.key});state.dimension=state.secondary;dimension.querySelector('select').value=state.dimension;render();});
        line.append(open);
        if(state.objective==='area'){
          line.append(el('span','context-value',fmt(g.area)+' ha · '+fmt(total?g.area/total*100:null)+' %'),el('small','',g.lots+' suertes activas'));
          if(groups.length>1){const track=el('div','context-track'),fill=el('i');fill.style.width=(total?g.area/total*100:0)+'%';track.append(fill);line.append(track);}
        }else {const metrics=el('dl','context-metrics');[['ha válidas',g.estimateArea],['t',g.estimateTons],['TCH',g.estimateTch],['% cobertura',g.coveragePct]].forEach(([label,value])=>{const pair=el('div');pair.append(el('dt','',label),el('dd','',fmt(value)));metrics.append(pair);});line.append(metrics,el('small','',g.estimateLots+' suertes estimadas / '+g.lots+' activas'));}
        const details=button('Suertes',()=>showGroupLots(groupRows(scoped,state.dimension,g.key),g.key));details.setAttribute('aria-label','Suertes de '+g.key);line.append(details);
        detailTip(line,[g.key,fmt(g.area)+' ha activas',fmt(g.estimateArea)+' ha válidas · '+fmt(g.estimateTons)+' t',fmt(g.estimateTch)+' TCH ponderado',fmt(g.coveragePct)+' % de '+fmt(g.millingArea)+' ha de molienda']);target.append(line);
      };
      groups.slice(0,limit).forEach(g=>appendGroup(g,results));content.append(results);
      if(groups.length>limit)content.append(button('Ver las '+groups.length+' categorías',()=>{const all=el('div','context-results');groups.forEach(g=>appendGroup(g,all));const dialog=openDrawer('Análisis ampliado',all);all.addEventListener('click',e=>{if(e.target.closest('button'))dialog.close();});}));
      content.append(button('Composición y metodología',()=>{const info=el('div','context-method');info.append(el('p','','Molienda: '+fmt(summary.millingArea)+' ha · '+summary.millingLots+' suertes'),el('p','','Semilla: '+fmt(summary.seedArea)+' ha · '+summary.seedLots+' suertes'),el('p','','Área válida: '+fmt(summary.estimateArea)+' ha · '+summary.estimateLots+' suertes con estimado'),el('p','','TCH = toneladas autorizadas ÷ área válida. Cobertura = área válida ÷ área de molienda. El destino registrado no reemplaza la participación operativa.'),el('p','','Fuente efectiva: '+window.CRONO_DATA.meta.source));openDrawer('Composición del ámbito',info);}));
    };
    board.setObjective=key=>{state.objective=key;objective.querySelector('select').value=key;render();};render();return board;
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
    if (view === 'resumen') refreshSummary();
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
      const open=button('Informe',()=>{});open.className='context-report-trigger';open.onclick=null;open.setAttribute('popovertarget',menu.id);open.setAttribute('aria-label','Informe');open.insertAdjacentHTML('afterbegin',icon('pdf'));actions.append(open,menu);
      actions.querySelectorAll('[data-casur-geo-action]').forEach(n=>n.classList.add('premium-original-analysis'));
      menu.addEventListener('click',e=>{if(e.target.closest('button'))queueMicrotask(()=>{if(menu.matches(':popover-open'))menu.hidePopover();});},true);
    });
  }
  function historicalProjection(lotId){
    const h=window.CASUR_HISTORICAL_ENGINE,rows=h.normalizeHistoricalRows([window.lotByCode(lotId)]),seasons=h.resolvePeriod(rows.map(r=>r.zafra),'all');
    const root=presentation(el('section','context-history'));let metric='tch',period='last5';
    const controls=el('div','context-history-controls'),chart=el('div','context-history-chart');
    const render=()=>{
      const model=h.buildHistoricalChartModel(rows,h.resolvePeriod(seasons,period),metric);root.dataset.model=JSON.stringify(model);const points=model.points.filter(p=>p.selected);chart.replaceChildren();
      controls.querySelectorAll('[data-metric]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.metric===metric)));
      chart.append(el('h3','',metric==='tch'?'Rendimiento histórico · TCH':'Azúcar por tonelada de caña · KATM'));
      if(!model.points.length){chart.append(el('p','','Sin registros históricos para esta suerte.'));return;}
      const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');const chartWidth=points.length>5?points.length*64+48:360;svg.setAttribute('viewBox','0 0 '+chartWidth+' 240');if(points.length>5)svg.style.minWidth=chartWidth+'px';svg.setAttribute('role','img');svg.setAttribute('aria-label','Histórico '+metric.toUpperCase()+' de la suerte '+lotId);
      const node=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));if(text!=null)n.textContent=text;svg.append(n);return n;};
      const x=i=>34+i*(chartWidth-68)/Math.max(1,points.length-1),y=v=>190-(v-model.min)/(model.max-model.min||1)*140;
      if(model.min!==null){[model.min,(model.min+model.max)/2,model.max].forEach(v=>{node('line',{x1:35,x2:chartWidth-20,y1:y(v),y2:y(v),stroke:'#dce8e6'});node('text',{x:0,y:y(v)+4,'font-size':12,fill:'#456975'},fmt(v,0));});}
      let previous=null;
      points.forEach((point,i)=>{
        const label=String(point.zafra).padStart(4,'0').replace(/(..)(..)/,'$1/$2');node('text',{x:x(i),y:220,'text-anchor':'middle','font-size':13,fill:'#244b56'},label);
        if(point.value===null){node('text',{x:x(i),y:215,'text-anchor':'middle','font-size':12},'N/D');previous=null;return;}
        if(previous&&point.zafra-previous.point.zafra===101)node('line',{x1:x(previous.i),y1:y(previous.point.value),x2:x(i),y2:y(point.value),stroke:metric==='katm'?'#2388b9':'#087d56','stroke-width':3});
        node('circle',{cx:x(i),cy:y(point.value),r:6,fill:metric==='katm'?'#2388b9':'#087d56',stroke:'white','stroke-width':2});const dot=node('circle',{cx:x(i),cy:y(point.value),r:28,fill:'transparent',tabindex:0,'data-season':point.zafra});
        const detail=['Zafra '+label,'TCH '+fmt(point.tch)+' · KATM '+fmt(point.katm),fmt(point.ton)+' t · '+fmt(point.area)+' ha','Edad '+fmt(point.edad)+' meses',point.katm===null?'KATM no disponible; sin interpolación':'KATM ponderado por toneladas'];const seasonRows=rows.filter(r=>r.zafra===point.zafra),valid=seasonRows.filter(r=>r.katm!==null&&r.ton!==null&&r.ton>=0);detail.push('Cobertura KATM: '+valid.length+'/'+seasonRows.length+' registros; '+fmt(valid.reduce((n,r)=>n+r.ton,0))+' t con KATM');
        detailTip(dot,detail);dot.addEventListener('click',()=>{status.replaceChildren(...detail.map(t=>el('span','',t)));});dot.addEventListener('focus',()=>{status.replaceChildren(...detail.map(t=>el('span','',t)));});
        node('text',{x:x(i),y:y(point.value)-14,'text-anchor':'middle','font-size':13,fill:'#173b46'},fmt(point.value));previous={point,i};
      });
      const plot=el('div','context-history-plot');plot.append(svg);chart.append(plot);const status=el('div','context-history-status','Tocá una zafra para consultar TCH, KATM, toneladas, área y edad.');status.setAttribute('aria-live','polite');chart.append(status);
      chart.append(el('small','context-hint',points.filter(p=>p.value!==null).length+' de '+points.length+' zafras del período con '+metric.toUpperCase()+'. Los valores ausentes permanecen N/D.'));
    };
    ['tch','katm'].forEach(key=>{const b=button(key.toUpperCase(),()=>{metric=key;render();});b.dataset.metric=key;controls.append(b);});
    controls.append(button('Ampliar',()=>{const marker=document.createComment('chart');chart.before(marker);openDrawer('Histórico de la suerte '+lotId,chart,()=>marker.replaceWith(chart));}),button('Tabla histórica',()=>{
      const wrap=el('div','context-technical'),table=el('table'),head=el('tr');['Zafra','TCH','KATM','Área ha','Toneladas','Edad'].forEach(t=>head.append(el('th','',t)));const thead=el('thead');thead.append(head);table.append(thead);const body=el('tbody');h.groupHistoricalBySeason(rows).forEach(r=>{const tr=el('tr');[String(r.zafra).replace(/(..)(..)/,'$1/$2'),fmt(r.tch),fmt(r.katm),fmt(r.area),fmt(r.ton),fmt(r.edad)].forEach(v=>tr.append(el('td','',v)));body.append(tr);});table.append(body);wrap.append(table);openDrawer('Histórico completo · TCH/KATM',wrap);
    }));controls.append(chooseControl('Período',[['last3','3 zafras'],['last5','5 zafras'],['all','Todas']],period,v=>{period=v;render();}));root.append(controls,chart);render();return root;
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
      fields.filter(f=>/^(Zona|Tipo de riego|Variedad|Tenencia)$/.test(f.label)).forEach(f=>chips.append(el('span','',f.label+': '+f.value)));root.querySelector('.ficha-band > div')?.append(chips);root.querySelector('.ficha-band h2').textContent='Suerte '+host.dataset.geoLotId+' · '+(window.CRONO_DATA.producers.find(p=>String(p.code)===String(byId('cronoProducerSelect').value))?.name||'');root.querySelector('.ficha-band small')?.classList.add('premium-original-analysis');
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

  function installIteration03() {
    if(!byId('cronoMultiCount')){setTimeout(installIteration03,100);return;}
    const host=byId('cronoContent'),input=byId('cronoQ'),box=byId('cronoSuggestions');
    const season=()=>window.CRONO_DATA?.meta?.estimateSeason||'N/D';
    const search=byId('cronoQ').closest('.searchbox'),options=presentation(el('details','context-search-options'));options.append(el('summary','','Finca y selección múltiple'));
    const selector=byId('cronoProducerSelect'),actions=byId('cronoMultiToggle')?.closest('.crono-actions');if(selector)options.append(selector);if(actions)options.append(actions);search.after(options);input.placeholder='Buscar finca o suerte…';

    const tray=document.createElement('div');tray.id='maestroSelectionTray';tray.className='no-print export-excluded';tray.dataset.exportExclude='true';byId('cronoMultiBar')?.after(tray);
    const selection=()=>window.CASUR_CRONO_SELECTION.capture();
    const updateTray=()=>{tray.replaceChildren();const state=selection();tray.hidden=!state.mode&&!state.keys.length;const title=document.createElement('b');title.textContent=state.keys.length+' suertes seleccionadas';tray.append(title);state.keys.forEach(key=>{const [code,lot]=key.split('::');const p=window.CRONO_DATA.producers.find(p=>String(p.code)===code),r=p?.details.find(r=>String(r.suerte)===lot);const b=document.createElement('button');b.type='button';b.textContent=(r?.codLote||key)+' ×';b.setAttribute('aria-label','Quitar '+(r?.codLote||key));b.onclick=()=>{window.toggleCronoSuerteSelection(key,false);updateTray();};tray.append(b);});for(const[label,fn]of[['Limpiar selección',()=>window.clearCronoMultiSelection()],['Aplicar selección',()=>window.renderCronoMultiSummary()]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>{fn();updateTray();};tray.append(b);}};
    new MutationObserver(updateTray).observe(byId('cronoMultiCount'),{childList:true});updateTray();
    const reopen=()=>{input.focus({preventScroll:true});window.showCronoSuggestions();updateTray();};
    box.addEventListener('pointerdown',e=>{if(selection().mode)e.preventDefault();});
    box.addEventListener('click',()=>{if(selection().mode)queueMicrotask(reopen);});
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
        const band=root.querySelector('.ficha-band');band.querySelector('h2').textContent=producer.name+' · Finca '+producer.code;
        const charts=root.querySelector('.crono-summary-grid'),table=root.querySelector('.table-wrap');charts?.classList.add('premium-original-analysis');table?.classList.add('premium-original-analysis');
        const mapPanel=presentation(el('section','maestro-farm-map maestro-panel-inactive'));mapPanel.innerHTML='<div id="maestroFarmMap"></div><small>Geometrías oficiales de la finca completa · mosaicos según disponibilidad</small>';mapRoot=mapPanel;
        const explorer=contextualExplorer(producer.details,'farm-'+producer.code,{farm:true,mapPanel,table});explorer.append(mapPanel);root.querySelector('.kpis').after(explorer);
        (async()=>{try{const features=await window.CASUR_GEO_DATA.getLotGeometries(producer.details.map(r=>r.codLote));if(!mapPanel.isConnected)return;farmMap=window.createCasurMap(mapPanel.querySelector('div'),{ariaLabel:'Mapa oficial de '+producer.name});farmMap.setLots(features);}catch(e){mapPanel.querySelector('small').textContent=e.message;}})();
      }
      installReportMenus(host);
      host.querySelectorAll('.crono-general-kpis .kpi,.kpis .kpi,.ficha-actions .ico').forEach((n,i)=>{if(n.dataset.premiumIcon)return;n.dataset.premiumIcon='1';if(n.classList.contains('ico'))n.innerHTML=icon(n.closest('.pdf')?'pdf':n.closest('.image')?'image':n.closest('[data-casur-geo-action]')?'map':'table');else {const label=n.querySelector('.label');if(label)label.insertAdjacentHTML('afterbegin',icon(/TON\./i.test(label.textContent)?'truck':/TCH/.test(label.textContent)?'chart':/\bEDAD\b|FECHA/i.test(label.textContent)?'clock':/DISTANCIA/i.test(label.textContent)?'map':'leaf'));}});
      host.querySelectorAll('.maestro-ficha-tabs button').forEach(b=>{if(!b.querySelector('svg'))b.insertAdjacentHTML('afterbegin',icon(/Mapa/.test(b.textContent)?'map':/Estimados/.test(b.textContent)?'chart':/finca|Suertes|tabla/i.test(b.textContent)?'table':/gráfico/i.test(b.textContent)?'chart':'leaf'));});
      const label=byId('maestro-general-tab-tch');if(label&&label.textContent!=='Estimados Z'+season())label.textContent='Estimados Z'+season();

      host.querySelectorAll('.hrow').forEach(row=>{if(row.dataset.premiumTooltip)return;row.dataset.premiumTooltip='1';row.tabIndex=0;row.title=row.getAttribute('aria-label')||row.textContent.trim();});
    };
    new MutationObserver(refresh).observe(host,{childList:true,subtree:true});refresh();
    const summaryTab=byId('maestro-summary-tab-tch');if(summaryTab)summaryTab.textContent='Estimados Z'+season();

  }

  function init() {
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
    const appearance = document.createElement('label');
    appearance.className = 'maestro-appearance no-print export-excluded';
    appearance.dataset.exportExclude = 'true';
    appearance.innerHTML = '<span>Presentación</span> <select id="maestroAppearance" aria-label="Variante visual"><option value="claro">Ejecutivo Claro</option><option value="vibrante">CASUR Institucional Vibrante</option></select>';
    appearance.querySelector('select').addEventListener('change', event => { document.body.dataset.maestroTheme = event.target.value; });
    document.body.dataset.maestroTheme = 'claro';
    header.querySelector('.head')?.append(appearance);
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
    summary.innerHTML = `<div class="maestro-source"><div><b id="maestroSource">Cargando fuente…</b><span id="maestroSourceName"></span></div><div><b id="maestroSeason"></b><span id="maestroGeneration"></span></div></div>
      <div class="maestro-kpis">
        <article class="maestro-kpi maestro-kpi-primary"><span>Área activa</span><strong id="maestroActiveArea">—</strong><small id="maestroActiveLots">Cargando datos</small></article>
        <article class="maestro-kpi"><span>Área válida estimada</span><strong id="maestroEstimateArea">—</strong><small id="maestroEstimateLots"></small></article>
        <article class="maestro-kpi"><span>Toneladas estimadas</span><strong id="maestroEstimateTons">—</strong><small>Molienda con estimado autorizado</small></article>
        <article class="maestro-kpi"><span>TCH estimado</span><strong id="maestroEstimateTch">—</strong><small>Toneladas ÷ área válida estimada</small></article>
      </div><div class="maestro-population"><span>Catálogo <b id="maestroCatalog">—</b></span><span>Molienda <b id="maestroMilling">—</b></span><span>Semilla <b id="maestroSeed">—</b></span><span id="maestroCoverage"></span></div>`;
    home.querySelector('#moduleAccess')?.before(summary);
    const hero=document.createElement('div');hero.className='maestro-summary-hero';
    const copy=home.querySelector('.hero-copy');if(copy){copy.before(hero);hero.append(copy);}
    hero.append(summary.querySelector('.maestro-source'));
    summary.querySelector('.maestro-kpis').innerHTML=[
      ['leaf','Área activa total','maestroActiveArea','maestroActiveLots','Incluye molienda y semilla activas; excluye registros inactivos o ausentes.',''],
      ['truck','Toneladas estimadas','maestroEstimateTons','','Aforo autorizado destinado a molienda, de la generación efectiva.','Molienda con estimado autorizado'],
      ['chart','TCH estimado','maestroEstimateTch','','Toneladas autorizadas divididas por área válida de molienda. Semilla no participa en este denominador.','Toneladas ÷ área válida de molienda'],
      ['clock','TCH anterior Z25/26','maestroPreviousTch','','Referencia canónica del Cronológico General: CRONO_DATA.global.tch, zafra anterior 25/26.','Rendimiento de referencia Z25/26']
    ].map(([symbol,label,id,smallId,help,caption],i)=>`<article class="maestro-kpi ${i===0?'maestro-kpi-primary':''}"><div class="maestro-kpi-icon">${icon(symbol)}</div><div class="maestro-kpi-copy"><span ${i===1?'id="maestroTonsLabel"':i===2?'id="maestroTchLabel"':''}>${label}</span> <button type="button" class="maestro-info" popovertarget="maestro-help-${i}" aria-label="Definición de ${label}">${icon('info')}</button><strong id="${id}">—</strong><small ${smallId?'id="'+smallId+'"':''}>${caption}</small></div><div id="maestro-help-${i}" popover class="maestro-help"><b>${label}</b><p>${help}</p><button type="button" popovertarget="maestro-help-${i}" popovertargetaction="hide">Cerrar</button></div></article>`).join('');
    summary.querySelector('.maestro-population').innerHTML='<span>Molienda <b id="maestroMillingArea"></b> · <b id="maestroMilling"></b> suertes</span><span>Semilla <b id="maestroSeedArea"></b> · <b id="maestroSeed"></b> suertes</span><span>Catálogo <b id="maestroCatalog"></b></span><span id="maestroCoverage"></span><span id="maestroPending"></span><div id="maestroComposition" aria-label="Composición del área activa: molienda y semilla"></div>';
    const dashboard=document.createElement('section');dashboard.id='maestroDashboard';dashboard.dataset.panel='area';dashboard.innerHTML='<div class="maestro-dashboard-heading"><div><h2>Tablero de análisis general</h2><p>Distribución, rendimientos y consulta de fincas</p></div><button type="button" id="maestroSummaryMulti">Selección múltiple →</button></div><div id="maestroDashboardContent" role="tabpanel"></div>';
    summary.after(dashboard);
    byId('maestroSummaryMulti').onclick=()=>{activate('cronologico');byId('cronoMultiToggle')?.click();};
    const analysis = document.createElement('button'); analysis.type = 'button'; analysis.className = 'hero-module-card module-analysis';
    analysis.innerHTML = '<span class="hero-module-icon">4</span><span class="hero-module-copy"><span class="hero-module-kicker">Lectura gerencial</span><strong>Análisis</strong><small>Tendencias, variedades, TCH × KATM, prioridades y maquila.</small></span>';
    analysis.hidden = !allowed('analisis'); analysis.addEventListener('click', () => activate('analisis')); byId('moduleAccess')?.append(analysis);
    const trail = document.createElement('div'); trail.className = 'maestro-crono-trail no-print export-excluded'; trail.dataset.exportExclude = 'true';
    trail.innerHTML = '<div><button type="button" id="maestroGeneral">General CASUR</button><button type="button" id="maestroZone" hidden>Zona</button><span aria-hidden="true"> / </span><b id="maestroCronoLocation">General CASUR</b></div><button type="button" id="maestroBackFarm" hidden>Volver a la finca</button>';
    byId('cronoSection')?.querySelector('.accordion-body')?.prepend(trail);
    byId('maestroGeneral').addEventListener('click', () => { window.renderCronoHome?.(); updateTrail(); });
    byId('maestroCronoLocation').before(byId('maestroBackFarm'));

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
    const dismissAnalyticTip=()=>{const tip=byId('maestroAnalyticTip');if(tip)tip.hidden=true;};window.addEventListener('scroll',dismissAnalyticTip,{passive:true});document.addEventListener('click',e=>{if(!e.target.closest('.context-row,[data-season]'))dismissAnalyticTip();});
    installSearch('cronoQ', 'cronoSuggestions'); installSearch('q', 'searchSuggestions');
    installPremiumFicha();
    installGeneralPanels();
    installIteration03();
    document.body.classList.add('casur-maestro-premium');
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
