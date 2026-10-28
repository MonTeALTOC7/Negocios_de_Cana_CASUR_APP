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
  const icon = name => '<svg class="maestro-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+({leaf:'<path d="M5 19C2 8 9 3 21 3c0 12-5 19-16 16Zm0 0L17 7M8 14v-5m4 5h5"/>',truck:'<path d="M3 5h12v12H3zM15 10h4l3 4v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',chart:'<path d="M4 20V12h4v8m3 0V8h4v12m3 0V3h3v17M3 8l6-5 5 2 7-4"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',home:'<path d="m3 11 9-8 9 8M5 9v12h5v-7h4v7h5V9"/>',map:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16"/>',table:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12M3 15h18"/>'}[name]||'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>')+'</svg>';
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

  function refreshDashboard(rows,engine) {
    const host=byId('maestroDashboardContent');if(!host)return;
    const key=byId('maestroDashboard')?.dataset.panel||'area';
    host.replaceChildren();
    if(key==='fincas'){
      const input=document.createElement('input');input.type='search';input.placeholder='Buscar finca, productor, código o suerte';input.setAttribute('aria-label','Consultar fincas desde Resumen');
      const button=document.createElement('button');button.type='button';button.textContent='Consultar';
      const run=()=>{activate('cronologico');byId('cronoQ').value=input.value;window.runCronoSearch();};button.onclick=run;input.onkeydown=e=>{if(e.key==='Enter')run();};host.append(input,button);return;
    }
    const panels=['tch','ton'].includes(key)?[['zona',key==='ton'?'Toneladas por zona':'TCH estimado por zona'],['tipoRiego',key==='ton'?'Toneladas por riego':'TCH estimado por riego'],['stage',key==='ton'?'Toneladas por número de corte':'TCH estimado por número de corte']]:[['zona','Área por zona'],['tipoRiego','Área por tipo de riego'],['destino','Área por destino del cultivo'],['variedad','Variedades · área activa'],['tenencia','Área por tenencia'],['stage','Estado del cultivo · área activa']];
    panels.forEach(([field,title])=>{
      const card=document.createElement('article');card.className='maestro-analysis-card';const heading=document.createElement('h3');heading.innerHTML=icon(key==='tch'?'chart':'leaf');heading.append(document.createTextNode(title));card.append(heading);
      if(['tch','ton'].includes(key))heading.append(document.createTextNode(' · Z'+(window.CRONO_DATA.meta.estimateSeason||'N/D')));
      const groups=engine.agronomicGroups(rows,field);const metric=key==='tch'?'estimateTch':key==='ton'?'estimateTons':'area';const maximum=Math.max(1,...groups.map(g=>Number(g[metric])||0));
      card.dataset.groups=JSON.stringify(groups);let shown=groups;
      if(key==='area'&&groups.length>6){shown=groups.slice(0,5);const rest=groups.slice(5);shown=[...shown,{key:'Otras ('+rest.length+')',area:rest.reduce((s,g)=>s+g.area,0),rows:rest}];}
      shown.forEach(g=>{const row=document.createElement('div');row.className='maestro-analysis-row';const label=document.createElement('span');label.textContent=g.key;const value=document.createElement('b');value.textContent=fmt(g[metric])+(key==='tch'?'':' ha');const track=document.createElement('div');track.className='maestro-analysis-track';const fill=document.createElement('i');fill.style.width=Math.min(100,Math.max(0,(g[metric]||0)/maximum*100))+'%';track.append(fill);row.append(label,value,track);card.append(row);});
      if(key==='area'&&field==='destino'){card.classList.add('maestro-destination-card');card.querySelectorAll('.maestro-analysis-row').forEach((row,i)=>row.style.setProperty('--bar-height',Math.max(2,shown[i].area/maximum*150)+'px'));const note=document.createElement('small');note.textContent='Destino registrado del cultivo; la participación en molienda se determina por el motor operativo.';card.append(note);}
      if(key==='area'&&field==='zona'){
        const total=groups.reduce((s,g)=>s+g.area,0),colors=['#277fce','#459f69','#d5a039','#1a8d92','#8796a8'];let start=0;
        const stops=groups.map((g,i)=>{const end=start+(total?g.area/total*100:0);const stop=colors[i%colors.length]+' '+start+'% '+end+'%';start=end;return stop;});
        const ring=document.createElement('div');ring.className='maestro-area-ring';ring.style.background='conic-gradient('+stops.join(',')+')';const center=document.createElement('span');center.textContent=fmt(total)+' ha';ring.append(center);ring.setAttribute('role','img');ring.setAttribute('aria-label','Área activa por zona: '+groups.map(g=>g.key+' '+fmt(g.area)+' ha').join('; '));heading.after(ring);
      }
      const detail=document.createElement('button');detail.type='button';detail.textContent='Ver detalle →';detail.onclick=()=>{activate('cronologico');window.renderCronoHome();queueMicrotask(()=>byId('maestro-general-tab-'+(key==='tch'?'tch':'area'))?.click());};card.append(detail);host.append(card);
    });
  }

  function updateTrail() {
    const content = byId('cronoContent'), code = byId('cronoProducerSelect')?.value;
    const producer = window.CRONO_DATA?.producers?.find(p => String(p.code) === String(code));
    const lot = content?.dataset.geoLotId;
    text('maestroCronoLocation', content?.dataset.geoScope === 'lot' && lot
      ? (producer?.name || code || '') + ' · Suerte ' + lot
      : content?.dataset.geoScope === 'farm' && producer ? producer.name
      : content?.querySelector('.crono-multi-result-table') ? 'Selección múltiple' : 'General CASUR');
    const back = byId('maestroBackFarm');
    if (back) { back.hidden = content?.dataset.geoScope !== 'lot' || !producer; back.textContent = 'Volver a ' + (producer?.name || 'la finca'); }
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
  function installPremiumFicha() {
    const host=byId('cronoContent'); if(!host)return;
    let report=null, map=null, generation=0;
    const tooltip=document.createElement('div');tooltip.id='maestroTrendTooltip';tooltip.className='maestro-trend-detail no-print export-excluded';tooltip.setAttribute('role','tooltip');tooltip.hidden=true;document.body.append(tooltip);
    let pinned=null;
    const closeTooltip=()=>{tooltip.hidden=true;pinned=null;};
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeTooltip();});
    window.addEventListener('scroll',closeTooltip,{passive:true});
    document.addEventListener('click',e=>{if(!e.target.closest('.crono-trend-point')&&!tooltip.contains(e.target))closeTooltip();});
    const element=(tag,cls,value)=>{const el=document.createElement(tag);el.className=cls;if(value!=null)el.textContent=value;return el;};
    const excluded=el=>{el.classList.add('no-print','export-excluded');el.dataset.exportExclude='true';return el;};
    const refresh=()=>{
      const root=host.querySelector('#cronoPrintPanel'),layout=root?.querySelector('.single-suerte-layout');
      if(root!==report){map?.destroy();map=null;closeTooltip();generation++;report=root;}
      if(!layout || root.dataset.premiumFicha)return;
      const table=root.querySelector('.table-wrap'); if(!table)return;
      root.dataset.premiumFicha='true';root.dataset.fichaPanel='ficha';
      const token=generation;
      const info=excluded(element('section','maestro-lot-info'));
      info.append(element('h3','','Información de la suerte'));
      const list=element('dl','');info.append(list);
      const attributes=excluded(element('div','maestro-lot-attributes'));root.querySelector('.ficha-band > div')?.append(attributes);
      const complement=excluded(element('section','maestro-complement'));
      complement.append(element('h3','','Indicadores complementarios'));
      const facts=element('div','maestro-facts');complement.append(facts);
      const updateFacts=()=>{
        const labels=[...table.querySelectorAll('thead th')].map(n=>n.textContent.trim());
        const cells=[...table.querySelectorAll('tbody tr:first-child td')].map(n=>n.textContent.trim());
        const fields=labels.map((label,i)=>({label,value:cells[i]||'—'}));
        const signature=JSON.stringify(fields);if(list.dataset.signature===signature)return;list.dataset.signature=signature;
        list.replaceChildren();facts.replaceChildren();attributes.replaceChildren();
        fields.filter(f=>/^(Zona|Tipo de riego|Variedad|Tenencia)$/.test(f.label)).forEach(f=>{const chip=element('span','');chip.append(element('small','',f.label),element('b','',f.value));attributes.append(chip);});
        fields.filter(f=>!/^(Suerte|TCH|Ton\.|Toneladas|Estado|Observaci|Fecha para cosecha)/i.test(f.label)).forEach(f=>{list.append(element('dt','',f.label),element('dd','',f.value));});
        fields.filter(f=>/Ton\.|Toneladas|Estado|Observaci/i.test(f.label)).forEach(f=>{const card=element('div','');card.append(element('span','',f.label),element('strong','',f.value));facts.append(card);});
        complement.hidden=!facts.childElementCount;
      };
      updateFacts();
      const cellObserver=new MutationObserver(updateFacts);cellObserver.observe(table,{childList:true,subtree:true,characterData:true});
      const mapPanel=excluded(element('section','maestro-lot-map'));mapPanel.append(element('h3','','Ubicación'));
      const canvas=element('div','maestro-inline-map');canvas.id='maestroInlineMap';mapPanel.append(canvas);
      const mapStatus=element('small','maestro-map-status','Cargando geometría oficial…');mapPanel.append(mapStatus);
      const openMap=element('button','maestro-map-expand','Ampliar mapa');openMap.type='button';openMap.addEventListener('click',()=>root.querySelector('[data-casur-geo-action]')?.click());mapPanel.append(openMap);
      const tabs=excluded(element('div','maestro-ficha-tabs'));tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Detalle de la suerte');
      const show=key=>{
        root.dataset.fichaPanel=key;
        tabs.querySelectorAll('button').forEach(b=>{const on=b.dataset.panel===key;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});
        requestAnimationFrame(()=>{window.dispatchEvent(new Event('resize'));if(key==='mapa')map?.fitToData();});
      };
      for(const[key,label]of[['ficha','Ficha y gráfico'],['tabla','Histórico en tabla'],['mapa','Mapa']]){
        const button=element('button','',label);button.type='button';button.dataset.panel=key;button.setAttribute('role','tab');button.id='maestro-ficha-tab-'+key;button.setAttribute('aria-controls','maestro-ficha-'+key);button.addEventListener('click',()=>show(key));tabs.append(button);
      }
      tabs.addEventListener('keydown',event=>{const buttons=[...tabs.children],i=buttons.indexOf(document.activeElement);if(i<0)return;const n=event.key==='ArrowRight'?(i+1)%3:event.key==='ArrowLeft'?(i+2)%3:event.key==='Home'?0:event.key==='End'?2:-1;if(n<0)return;event.preventDefault();buttons[n].focus();buttons[n].click();});
      const board=element('div','maestro-ficha-board');board.id='maestro-ficha-ficha';board.setAttribute('role','tabpanel');board.setAttribute('aria-labelledby','maestro-ficha-tab-ficha');
      const chart=layout.querySelector('.crono-trend-card');
      const series=window.trendFromLot?.(window.lotByCode?.(host.dataset.geoLotId))||[];
      const points=[...(chart?.querySelectorAll('.crono-trend-point')||[])];
      const showTip=point=>{
        const record=series.find(r=>r.label===point.dataset.zafra);
        tooltip.replaceChildren();tooltip.append(element('b','','Zafra '+point.dataset.zafra));
        const values=[['TCH',record?.tch ?? Number(point.dataset.tch)],['Área (ha)',record?.area],['Toneladas',record?.ton],['KATM',record?.katm],['Edad (meses)',record?.edad]];
        const dl=element('dl','');values.forEach(([label,value])=>dl.append(element('dt','',label),element('dd','',fmt(value))));tooltip.append(dl,element('small','','Histórico original CASUR · Esc para cerrar'));
        tooltip.hidden=false;const box=point.getBoundingClientRect(),rect=tooltip.getBoundingClientRect();tooltip.style.left=Math.max(8,Math.min(innerWidth-rect.width-8,box.x-rect.width/2))+'px';tooltip.style.top=Math.max(8,Math.min(innerHeight-rect.height-8,box.bottom+12))+'px';
      };
      points.forEach(point=>{
        point.setAttribute('aria-describedby','maestroTrendTooltip');
        point.addEventListener('mouseenter',()=>showTip(point));point.addEventListener('focus',()=>showTip(point));
        point.addEventListener('mouseleave',()=>{if(!pinned)tooltip.hidden=true;});point.addEventListener('blur',()=>{if(!pinned)tooltip.hidden=true;});
        point.addEventListener('click',()=>{if(pinned===point){closeTooltip();}else{pinned=point;showTip(point);}});
        point.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){pinned=point;showTip(point);}});
      });
      if(points.length){const values=points.map(p=>Number(p.dataset.tch)).filter(Number.isFinite);const metrics=excluded(element('div','maestro-trend-metrics'));[['Promedio',values.reduce((s,v)=>s+v,0)/values.length],['Máximo',Math.max(...values)],['Mínimo',Math.min(...values)],['Último',values.at(-1)]].forEach(([label,value])=>{const item=element('div','');item.append(element('small','',label),element('b','',fmt(value)));metrics.append(item);});chart.append(metrics);}
      layout.append(tabs,board);board.append(info);if(chart)board.append(chart);board.append(mapPanel);layout.append(complement);
      // Keep the report table in its original report root for all export parsers.
      table.classList.add('maestro-original-table');table.id='maestro-ficha-tabla';table.setAttribute('role','tabpanel');table.setAttribute('aria-labelledby','maestro-ficha-tab-tabla');
      mapPanel.id='maestro-ficha-mapa';mapPanel.setAttribute('role','tabpanel');mapPanel.setAttribute('aria-labelledby','maestro-ficha-tab-mapa');
      // This table is a view of the original eight chart points, without recomputation.
      const history=excluded(element('section','maestro-history-table'));history.append(element('h3','','Histórico TCH por zafra'));
      const historyRows=element('dl','');chart?.querySelectorAll('.crono-trend-point').forEach(point=>{historyRows.append(element('dt','',point.dataset.zafra),element('dd','',point.dataset.tch));});history.append(historyRows);table.before(history);
      show('ficha');
      (async()=>{
        try{
          const geo=window.CASUR_GEO_DATA || (await import('../../shared/geo/geo-data.js'));
          const create=window.createCasurMap || (await import('../../shared/geo/geo-map.js')).createCasurMap;
          const feature=await geo.getLotGeometry(host.dataset.geoLotId);
          if(token!==generation || !canvas.isConnected)return;
          if(!feature){mapStatus.textContent='Esta suerte no tiene geometría oficial disponible.';return;}
          map=create(canvas,{ariaLabel:'Ubicación oficial de la suerte '+host.dataset.geoLotId,fitPadding:[12,12]});map.setLot(feature);mapStatus.textContent='Geometría oficial CASUR · mapa interactivo';
        }catch(error){if(canvas.isConnected)mapStatus.textContent='No se pudo cargar el mapa: '+error.message;}
      })();
    };
    new MutationObserver(refresh).observe(host,{childList:true,subtree:true});refresh();
  }

  function installGeneralPanels() {
    const host=byId('cronoContent');
    const refresh=()=>{
      const area=host.querySelector('.crono-area-analysis'), yields=host.querySelector('.crono-yield-analysis');
      if(!area || !yields || host.querySelector('.maestro-general-tabs'))return;
      const nav=document.createElement('div');nav.className='maestro-ficha-tabs maestro-general-tabs no-print export-excluded';nav.dataset.exportExclude='true';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Cronológico General');
      const lookup=document.createElement('section');lookup.className='maestro-farm-directory no-print export-excluded';lookup.dataset.exportExclude='true';lookup.id='maestro-general-fincas';
      const heading=document.createElement('h3');heading.textContent='Consultar fincas';lookup.append(heading);
      const filter=document.createElement('input');filter.type='search';filter.placeholder='Filtrar fincas o zona…';filter.setAttribute('aria-label','Filtrar directorio de fincas');lookup.append(filter);
      const list=document.createElement('div');list.className='maestro-farm-grid';lookup.append(list);
      const producers=window.CRONO_DATA?.producers||[];
      const render=()=>{list.replaceChildren();const q=filter.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();producers.filter(p=>[p.code,p.name,p.zone].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q)).forEach(p=>{const b=document.createElement('button');b.type='button';b.textContent=p.name+' · '+p.code;const small=document.createElement('small');small.textContent=p.zone||'Sin zona';b.append(small);b.addEventListener('click',()=>window.renderCronoProducer(p.code));list.append(b);});if(!list.childElementCount)list.textContent='Sin coincidencias.';};
      filter.addEventListener('input',render);render();
      host.append(lookup);area.before(nav);area.id='maestro-general-area';yields.id='maestro-general-tch';
      const title=host.querySelector('.crono-analysis-title');
      const panels=[['area','Área y distribución',area],['tch','Rendimientos TCH',yields],['fincas','Consultar fincas',lookup]];
      panels.forEach(([key,label,panel])=>{panel.classList.add('maestro-general-panel');panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','maestro-general-tab-'+key);const b=document.createElement('button');b.type='button';b.id='maestro-general-tab-'+key;b.textContent=label;b.dataset.panel=key;b.setAttribute('role','tab');b.setAttribute('aria-controls',panel.id);b.addEventListener('click',()=>{panels.forEach(([other,,p])=>p.classList.toggle('maestro-panel-inactive',key!==other));nav.querySelectorAll('button').forEach(button=>{const on=button===b;button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1;});if(title)title.classList.toggle('maestro-panel-inactive',key!=='tch');});nav.append(b);});
      nav.addEventListener('keydown',e=>{const buttons=[...nav.children],i=buttons.indexOf(document.activeElement);const n=e.key==='ArrowRight'?(i+1)%buttons.length:e.key==='ArrowLeft'?(i+buttons.length-1)%buttons.length:e.key==='Home'?0:e.key==='End'?buttons.length-1:-1;if(i<0||n<0)return;e.preventDefault();buttons[n].focus();buttons[n].click();});
      nav.firstElementChild.click();
    };
    new MutationObserver(refresh).observe(host,{childList:true,subtree:true});refresh();
  }

  function installIteration03() {
    if(!byId('cronoMultiCount')){setTimeout(installIteration03,100);return;}
    const host=byId('cronoContent'),input=byId('cronoQ'),box=byId('cronoSuggestions');
    const season=()=>window.CRONO_DATA?.meta?.estimateSeason||'N/D';
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
        const hero=document.createElement('div');hero.className='maestro-general-hero no-print export-excluded';hero.dataset.exportExclude='true';const h=document.createElement('h2');h.textContent='Cronológico General';const p=document.createElement('p');p.textContent='Análisis agronómico, área y estimados · Z'+season();hero.append(h,p);general.before(hero);general.after(sumStrip(window.CRONO_DATA.producers.flatMap(p=>p.details)));
        const area=host.querySelector('.crono-area-analysis'),rows=window.CRONO_DATA.producers.flatMap(p=>p.details),groups=window.CASUR_CRONO_PARTICIPATION.agronomicGroups(rows,'variedad');const varieties=document.createElement('article');varieties.className='maestro-general-extra no-print export-excluded';varieties.dataset.exportExclude='true';const title=document.createElement('h3');title.textContent='Área activa por variedad';varieties.append(title);groups.forEach(g=>{const row=document.createElement('p');row.textContent=g.key+' · '+fmt(g.area)+' ha';varieties.append(row);});area.append(varieties);
        const ton=document.createElement('section');ton.className='maestro-general-panel maestro-panel-inactive no-print export-excluded';ton.dataset.exportExclude='true';ton.id='maestro-general-ton';const heading=document.createElement('h3');heading.textContent='Toneladas estimadas · Z'+season();ton.append(heading);
        window.CASUR_CRONO_PARTICIPATION.agronomicGroups(window.CRONO_DATA.producers.flatMap(p=>p.details),'zona').forEach(g=>{const p=document.createElement('p');p.textContent=g.key+' · '+fmt(g.estimateTons)+' t · '+fmt(g.estimateArea)+' ha válidas';ton.append(p);});host.append(ton);
        const nav=host.querySelector('.maestro-general-tabs'),b=document.createElement('button');b.type='button';b.setAttribute('role','tab');b.textContent='Toneladas Z'+season();b.id='maestro-general-tab-ton';b.setAttribute('aria-controls',ton.id);nav.insertBefore(b,nav.lastElementChild);b.onclick=()=>{host.querySelectorAll('.maestro-general-panel').forEach(p=>p.classList.toggle('maestro-panel-inactive',p!==ton));nav.querySelectorAll('button').forEach(n=>n.setAttribute('aria-selected',String(n===b)));};nav.querySelectorAll('button:not(#maestro-general-tab-ton)').forEach(n=>n.addEventListener('click',()=>ton.classList.add('maestro-panel-inactive')));
      }
      const root=host.querySelector('#cronoPrintPanel');
      if(root&&host.dataset.geoScope==='farm'&&!root.dataset.premiumFarm){
        root.dataset.premiumFarm='true';const producer=window.CRONO_DATA.producers.find(p=>String(p.code)===byId('cronoProducerSelect').value);if(!producer)return;
        const band=root.querySelector('.ficha-band');band.querySelector('h2').textContent=producer.name+' · Finca '+producer.code;band.after(sumStrip(producer.details));
        const nav=document.createElement('div');nav.className='maestro-ficha-tabs no-print export-excluded';nav.dataset.exportExclude='true';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Exploración de finca');
        const charts=root.querySelector('.crono-summary-grid'),table=root.querySelector('.table-wrap');if(!charts||!table)return;
        root.querySelector('.kpis').after(nav);const forecast=document.createElement('section');forecast.className='maestro-farm-forecast no-print export-excluded';forecast.dataset.exportExclude='true';const s=window.CASUR_CRONO_PARTICIPATION.summary(producer.details);forecast.textContent='Estimado Z'+season()+': '+fmt(s.estimateTch)+' TCH · '+fmt(s.estimateTons)+' t / '+fmt(s.estimateArea)+' ha válidas';root.append(forecast);
        const mapPanel=document.createElement('section');mapPanel.className='maestro-farm-map no-print export-excluded';mapPanel.dataset.exportExclude='true';mapPanel.innerHTML='<h3>Mapa GIS de la finca</h3><div id="maestroFarmMap"></div><small>Geometrías oficiales CASUR · base según disponibilidad del proveedor</small>';root.append(mapPanel);mapRoot=mapPanel;
        const board=document.createElement('div');board.className='maestro-farm-board';charts.before(board);board.append(charts,mapPanel);
        const targets=[['Desglose agronómico',charts],['Estimados Z'+season(),forecast],['Suertes de la finca',table],['Mapa GIS',mapPanel]];
        targets.forEach(([label,panel],i)=>{panel.classList.add('maestro-farm-panel');panel.id=panel.id||'maestro-farm-panel-'+i;const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('role','tab');b.setAttribute('aria-controls',panel.id);b.onclick=()=>{targets.forEach(([,p])=>p.classList.toggle('maestro-panel-inactive',p!==panel&&!(i===0&&p===mapPanel)));board.dataset.panel=String(i);nav.querySelectorAll('button').forEach(n=>n.setAttribute('aria-selected',String(n===b)));window.dispatchEvent(new Event('resize'));};nav.append(b);});nav.addEventListener('keydown',e=>{const buttons=[...nav.children],i=buttons.indexOf(document.activeElement);if(!['ArrowLeft','ArrowRight'].includes(e.key)||i<0)return;e.preventDefault();const next=(i+(e.key==='ArrowRight'?1:3))%4;buttons[next].focus();buttons[next].click();});nav.firstElementChild.click();
        const breadcrumb=document.createElement('div');breadcrumb.className='maestro-farm-breadcrumb no-print export-excluded';breadcrumb.textContent='General CASUR → '+producer.zone+' → '+producer.name;band.before(breadcrumb);
        (async()=>{try{const features=await window.CASUR_GEO_DATA.getLotGeometries(producer.details.map(r=>r.codLote));if(!mapPanel.isConnected)return;farmMap=window.createCasurMap(mapPanel.querySelector('div'),{ariaLabel:'Mapa oficial de '+producer.name});farmMap.setLots(features);}catch(e){mapPanel.querySelector('small').textContent=e.message;}})();
      }
      host.querySelectorAll('.crono-general-kpis .kpi,.ficha-actions .ico').forEach((n,i)=>{if(n.dataset.premiumIcon)return;n.dataset.premiumIcon='1';if(n.classList.contains('ico'))n.innerHTML=icon(['table','leaf','map'][i%3]);else n.querySelector('.label')?.insertAdjacentHTML('afterbegin',icon(['leaf','clock','clock','chart','truck'][i%5]));});
      const label=byId('maestro-general-tab-tch');if(label&&label.textContent!=='TCH estimado Z'+season())label.textContent='TCH estimado Z'+season();
      host.querySelectorAll('.crono-yield-analysis h3').forEach(h=>{const value=h.textContent.replace(/TCH Estim\. Z[^ ]+ por /,'TCH estimado por ')+' · Z'+season();if(!h.dataset.premiumLabel){h.dataset.premiumLabel='1';h.textContent=value;}});
      host.querySelectorAll('.hrow').forEach(row=>{if(row.dataset.premiumTooltip)return;row.dataset.premiumTooltip='1';row.tabIndex=0;row.title=row.getAttribute('aria-label')||row.textContent.trim();});
    };
    new MutationObserver(refresh).observe(host,{childList:true,subtree:true});refresh();
    const summaryTab=byId('maestro-summary-tab-tch');if(summaryTab)summaryTab.textContent='TCH estimado Z'+season();
    const summaryNav=summaryTab?.parentElement;if(summaryNav){const b=document.createElement('button');b.type='button';b.textContent='Toneladas Z'+season();b.setAttribute('role','tab');b.id='maestro-summary-tab-ton';b.onclick=()=>{byId('maestroDashboard').dataset.panel='ton';summaryNav.querySelectorAll('button').forEach(n=>n.setAttribute('aria-selected',String(n===b)));refreshSummary();};summaryNav.insertBefore(b,summaryNav.lastElementChild);}
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
    const menu = document.createElement('button'); menu.type='button'; menu.id='maestroMenu'; menu.textContent='☰'; menu.setAttribute('aria-label','Abrir navegación'); menu.setAttribute('aria-controls','maestroSidebar'); menu.setAttribute('aria-expanded','false');
    header.querySelector('.head')?.prepend(menu);
    const shade=document.createElement('button'); shade.id='maestroShade'; shade.type='button'; shade.setAttribute('aria-label','Cerrar navegación'); shade.hidden=true; document.body.append(shade);
    const compact=matchMedia('(max-width:800px)');
    const rail=document.createElement('button');rail.type='button';rail.id='maestroRailToggle';rail.innerHTML=icon('table')+'<span>Contraer panel</span>';sidebar.querySelector('.maestro-sidebar-brand').after(rail);
    const setRail=collapsed=>{document.body.classList.toggle('maestro-rail',collapsed);rail.setAttribute('aria-expanded',String(!collapsed));rail.title=collapsed?'Expandir panel':'Contraer panel';};
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
    ].map(([symbol,label,id,smallId,help,caption],i)=>`<article class="maestro-kpi ${i===0?'maestro-kpi-primary':''}"><div class="maestro-kpi-icon">${icon(symbol)}</div><div class="maestro-kpi-copy"><span ${i===1?'id="maestroTonsLabel"':i===2?'id="maestroTchLabel"':''}>${label}</span> <button type="button" class="maestro-info" popovertarget="maestro-help-${i}" aria-label="Definición de ${label}">ⓘ</button><strong id="${id}">—</strong><small ${smallId?'id="'+smallId+'"':''}>${caption}</small></div><div id="maestro-help-${i}" popover class="maestro-help"><b>${label}</b><p>${help}</p><button type="button" popovertarget="maestro-help-${i}" popovertargetaction="hide">Cerrar</button></div></article>`).join('');
    summary.querySelector('.maestro-population').innerHTML='<span>Molienda <b id="maestroMillingArea"></b> · <b id="maestroMilling"></b> suertes</span><span>Semilla <b id="maestroSeedArea"></b> · <b id="maestroSeed"></b> suertes</span><span>Catálogo <b id="maestroCatalog"></b></span><span id="maestroCoverage"></span><span id="maestroPending"></span><div id="maestroComposition" aria-label="Composición del área activa: molienda y semilla"></div>';
    const dashboard=document.createElement('section');dashboard.id='maestroDashboard';dashboard.dataset.panel='area';dashboard.innerHTML='<div class="maestro-dashboard-heading"><div><h2>Tablero de análisis general</h2><p>Distribución, rendimientos y consulta de fincas</p></div><button type="button" id="maestroSummaryMulti">Selección múltiple →</button></div><div class="maestro-ficha-tabs" role="tablist" aria-label="Análisis del Resumen"></div><div id="maestroDashboardContent" role="tabpanel"></div>';
    summary.after(dashboard);
    [['area','Área y distribución'],['tch','Rendimientos TCH'],['fincas','Consultar fincas']].forEach(([key,label])=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.id='maestro-summary-tab-'+key;b.setAttribute('role','tab');b.setAttribute('aria-controls','maestroDashboardContent');b.setAttribute('aria-selected',String(key==='area'));b.onclick=()=>{dashboard.dataset.panel=key;dashboard.querySelectorAll('[role=tab]').forEach(n=>n.setAttribute('aria-selected',String(n===b)));byId('maestroDashboardContent').setAttribute('aria-labelledby',b.id);refreshSummary();};dashboard.querySelector('[role=tablist]').append(b);});
    byId('maestroSummaryMulti').onclick=()=>{activate('cronologico');byId('cronoMultiToggle')?.click();};
    dashboard.querySelector('[role=tablist]').addEventListener('keydown',e=>{const tabs=[...dashboard.querySelectorAll('[role=tab]')],i=tabs.indexOf(document.activeElement);const next=e.key==='ArrowRight'?(i+1)%tabs.length:e.key==='ArrowLeft'?(i+tabs.length-1)%tabs.length:-1;if(i<0||next<0)return;e.preventDefault();tabs[next].focus();tabs[next].click();});
    const analysis = document.createElement('button'); analysis.type = 'button'; analysis.className = 'hero-module-card module-analysis';
    analysis.innerHTML = '<span class="hero-module-icon">4</span><span class="hero-module-copy"><span class="hero-module-kicker">Lectura gerencial</span><strong>Análisis</strong><small>Tendencias, variedades, TCH × KATM, prioridades y maquila.</small></span>';
    analysis.hidden = !allowed('analisis'); analysis.addEventListener('click', () => activate('analisis')); byId('moduleAccess')?.append(analysis);
    const trail = document.createElement('div'); trail.className = 'maestro-crono-trail no-print export-excluded'; trail.dataset.exportExclude = 'true';
    trail.innerHTML = '<div><button type="button" id="maestroGeneral">General CASUR</button><span aria-hidden="true"> / </span><b id="maestroCronoLocation">General CASUR</b></div><button type="button" id="maestroBackFarm" hidden>Volver a la finca</button>';
    byId('cronoSection')?.querySelector('.accordion-body')?.prepend(trail);
    byId('maestroGeneral').addEventListener('click', () => { window.renderCronoHome?.(); updateTrail(); });
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
        if (id === 'cronoContent' && host.querySelector('.single-suerte-layout,.crono-general-kpis')) { links.hidden=true; updateTrail(); return; }
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
