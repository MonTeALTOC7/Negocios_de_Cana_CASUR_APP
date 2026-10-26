import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),E=require('../../../core/imports/operational-import.js');
const approvedSource={sha256:'82cd45c03b8c80ddda6ebc6078289df4f63b6a380403da6f103f2a52fa30e069'};
const record=(id,changes={})=>({code:'810',suerte:id,codLote:'810'+id,name:'Finca sintética',sourcePresence:'present',
 source:approvedSource,dataVersion:'test-generation',
 classification:'Molienda',operationalState:'Molienda',destino:'Molienda',inventoryArea:10,area:10,millingArea:10,
 participatesCurrentArea:true,participatesMilling:true,forecast:{season:'26/27',tch:50},tch:70,...changes});
const forecast=tch=>({season:'26/27',tch});
function view(){
 const window={CASUR_OPERATIONAL_IMPORT:E,CRONO_DATA:{meta:{operationalContract:1,estimateSeason:'26/27'}},addEventListener(){}};
 window.window=window;
 vm.runInNewContext(fs.readFileSync(new URL('../js/casur-enhancements.js',import.meta.url),'utf8'),{
  window,document:{getElementById(){return null;},addEventListener(){}},console,setTimeout,clearTimeout,requestAnimationFrame(fn){fn();},MutationObserver:class{}
 });return window;
}

test('aforo visible exige la extracción autorizada y su zafra; no utiliza el TCH previo ni el plan',()=>{
 const api=view().CASUR_CRONO_PARTICIPATION,r=record('01',{plan:{tons:601000,date:{iso:'2027-01-01'}}});
 assert.equal(api.forecastForRow(r).tch,50);
 for(const change of [{sourcePresence:undefined,tchEst2627:99},{source:{sha256:'otro'}},{forecast:{season:'27/28',tch:90}},
   {forecast:{season:'26/27',tch:90,source:{sha256:'otro'}}},{dataVersion:null}]){
  const f=api.forecastForRow({...r,...change});assert.equal(f.tch,null);assert.equal(f.state,'not-applied');
 }
 assert.equal(api.forecastForRow(r,'27/28').tch,null);
 assert.equal(api.forecastForRow(record('02',{forecast:forecast(0)})).state,'zero');
 assert.equal(api.forecastForRow(record('02',{forecast:forecast(0)})).tch,0);
 assert.equal(api.forecastForRow(record('03',{forecast:forecast(null)})).state,'missing');
});

test('ficha, finca y selección parcial usan solo el área autorizada y mantienen pendientes explícitos',()=>{
 const api=view().CASUR_CRONO_PARTICIPATION,rows=[record('01'),record('02',{forecast:forecast(0)}),record('03',{source:{sha256:'otro'}})];
 const s=api.summary(rows);assert.equal(s.estimateTch,50);assert.equal(s.estimateTons,500);assert.equal(s.estimateArea,10);
 assert.equal(s.millingArea,30);assert.equal(s.pendingMillingArea,20);assert.equal(s.estimateLots,1);
 assert.equal(api.summary([rows[2]]).estimateTch,null);assert.equal(api.summary([rows[2]]).estimateState,'not-applied');
 assert.equal(api.summary([{area:10,tchEst2627:70}]).estimateTch,null);
 assert.equal(api.summary([rows[0],record('04',{dataVersion:'other-generation'})]).estimateTch,null);
});

const proposed=(changes={})=>record('36',{code:'993',codLote:'99336',source:{...approvedSource,sheet:'Estimados_2627',row:1020},inventoryArea:8.91,
 forecast:forecast(65),fUltCte:'2026-01-02',fSiembra:'2019-02-26',
 plan:{date:{iso:'2026-12-24',raw:46380,type:'number'},cut:'CORTE MECANICO',tons:601000},
 provenance:{proposedDate:{header:'Fecha propuesta de Cosecha',column:68,row:1020},proposedCut:{header:'Tipo de Corte',column:69,row:1020}},...changes});

test('sexta tarjeta muestra propuesta y tipo; conserva el último corte y no usa toneladas del plan',()=>{
 const api=view().CASUR_CRONO_PARTICIPATION,r=proposed(),before=JSON.stringify(r),d=api.referenceDate(r);
 assert.equal(d.label,'Fecha para cosecha');assert.equal(d.type,'proposed');assert.equal(d.date,'2026-12-24');
 assert.equal(d.detail,'Corte mecánico');assert.equal(d.cutType,'CORTE MECANICO');assert.equal(d.provenance.row,1020);assert.equal(d.provenance.column,68);
 assert.equal(d.cutProvenance.column,69);assert.equal(d.dataVersion,'test-generation');assert.equal(d.season,'26/27');assert.equal(d.source.sha256,approvedSource.sha256);
 assert.equal(api.dateSummary([r]).display,'24-dic-2026');assert.match(api.dateKpi([r]),/Corte mecánico/);
 assert.equal(api.summary([r]).estimateTons,579.15);assert.equal(JSON.stringify(r),before);
});

test('fecha propuesta pasada no se descarta ni se convierte en corte ejecutado',()=>{
 const api=view().CASUR_CRONO_PARTICIPATION,r=proposed({plan:{date:{iso:'2020-04-11'},cut:'MANUAL'}});
 assert.equal(api.referenceDate(r).type,'proposed');assert.equal(api.dateSummary([r]).display,'11-abr-2020');assert.equal(api.referenceDate(r).detail,'Manual');
});

test('falta fecha: N/D sin usar corte real, siembra, base ni edad; falta tipo: fecha permanece',()=>{
 const api=view().CASUR_CRONO_PARTICIPATION;
 for(const date of [null,{iso:null},{iso:'2026-02-30'}]){
  const r=proposed({plan:{date,cut:'MANUAL'},fBase:'2026-01-02',edadExcel:9.72});
  assert.equal(api.referenceDate(r).date,null);assert.equal(api.dateSummary([r]).display,'N/D');
 }
 const r=proposed({plan:{date:{iso:'2026-12-24'},cut:null}});assert.equal(api.referenceDate(r).date,'2026-12-24');assert.equal(api.referenceDate(r).detail,'Tipo de corte N/D');
});

test('BQ desconocido conserva su valor y solicita interpretación sin inferir número de corte',()=>{
 const api=view().CASUR_CRONO_PARTICIPATION,r=proposed({plan:{date:{iso:'2026-12-24'},cut:'XYZ'},corte:'8'});
 assert.equal(api.referenceDate(r).cutType,'XYZ');assert.equal(api.referenceDate(r).detail,'XYZ · requiere interpretación');
 assert.equal(api.cutTypeText('MANUAL'),'Manual');assert.equal(api.cutTypeText('CORTE MECANICO'),'Corte mecánico');
 assert.equal(api.cutTypeText('8'),'8 · requiere interpretación');
});

test('propuesta exige fuente, zafra, generación y mapeo semántico; no una columna fija',()=>{
 const api=view().CASUR_CRONO_PARTICIPATION;
 for(const header of E.aliases.proposedDate){const r=proposed({provenance:{proposedDate:{header,column:2},proposedCut:{header:'Tipo de Corte',column:1}}});assert.equal(api.referenceDate(r).date,'2026-12-24');}
 for(const change of [{source:{sha256:'otro'}},{dataVersion:null},{forecast:forecast(65),provenance:{proposedDate:{header:'Fecha inventada'}}},{forecast:{season:'27/28',tch:65}}])
  assert.equal(api.referenceDate(proposed(change)).date,null);
 assert.equal(api.referenceDate({fUltCte:'2026-01-02'}).date,null);
});

test('agregados no promedian fechas: completas/mixtas/parciales y vacío se distinguen',()=>{
 const api=view().CASUR_CRONO_PARTICIPATION,r=proposed(),other=proposed({plan:{date:{iso:'2027-04-11'},cut:'MANUAL'}});
 assert.equal(api.dateSummary([r,r]).display,'24-dic-2026');assert.equal(api.dateSummary([r,other]).display,'Varias fechas');
 assert.equal(api.dateSummary([r,{}]).display,'Varias fechas');assert.equal(api.dateSummary([{},{}]).display,'N/D');
 assert.match(api.dateSummary([r,{}]).detail,/1\/2/);
});

test('formato Cronológico dd-mmm-aaaa deja ISO intacto y no modifica otras fechas GEO',()=>{
 const api=view().CASUR_CRONO_PARTICIPATION;
 for(const [input,expected] of [['2026-12-24','24-dic-2026'],['2026-01-02','02-ene-2026'],['2027-04-11','11-abr-2027'],[null,'—'],['2026-02-30','—']])assert.equal(api.formatDate(input),expected);
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.match(html,/function dateTxt\(iso\)\{return window.CASUR_CRONO_PARTICIPATION.formatDate\(iso\);\}/);
});

test('subtexto del estimado usa fecha de aforo explícita, sin inferir cosecha ni completar faltantes',()=>{
 const api=view().CASUR_CRONO_PARTICIPATION;
 assert.equal(api.estimateCaption('Aforo autorizado','2026-10-12'),'Último Aforo\n12-oct-2026');
 assert.equal(api.estimateCaption('Sin estimado en la fuente',null),'Sin estimado en la fuente');
 assert.equal(api.estimateCaption('Aforo autorizado','2026-02-30'),'Último Aforo');
 assert.doesNotMatch(api.estimateCaption('Aforo autorizado','2026-10-12'),/24-dic/);
});

test('ficha compacta conserva variedad, edad y distancia; usa título coherente de zafra pasada',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),css=fs.readFileSync(new URL('../css/casur-upgrade.css',import.meta.url),'utf8');
 assert.ok(html.includes("kpi('TCH Z Ant. 25/26'"));assert.ok(html.includes("suerte?'Edad actual'"));assert.ok(html.includes("suerte?kpi('Variedad'"));assert.ok(html.includes("kpi('Distancia ponderada (km)'"));
 assert.ok(html.includes('cronoDistanceCell(r,distanceIndex)'));
 assert.ok(css.includes('#cronoContent[data-geo-scope="lot"] .ficha-band'));
 assert.ok(html.includes(".crono-kpi em{white-space:pre-line!important"));
});

test('la ficha existente contiene fecha, conserva variedad en tabla y no monta una segunda consulta',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const ui=fs.readFileSync(new URL('../js/operational-import-ui.js',import.meta.url),'utf8');
 assert.ok(html.includes('CASUR_CRONO_PARTICIPATION.dateKpi(rows)'));assert.ok(html.includes("r.variedad||'—'"));
 assert.equal(ui.includes('mountOperationalAnalysis'),false);assert.equal(ui.includes('operational-analysis-ui'),false);
 assert.equal(fs.existsSync(new URL('../js/operational-analysis-ui.js',import.meta.url)),false);
 assert.ok(html.includes('const aforo=window.CASUR_CRONO_PARTICIPATION,forecast=aforo.summary'));
});

test('molienda positiva usa solo su propia área y TCH; el plan no se suma',()=>{
 const r=record('01',{plan:{tons:9999}}),p=E.participation(r);assert.equal(p.estimateTch,50);assert.equal(p.estimatedTons,500);
 const t=E.totals([r]);assert.equal(t.millingTch,50);assert.equal(t.validMillingArea,10);assert.equal(t.usable,1);
});

test('molienda cero/ausente conserva área activa pero no diluye TCH ni hereda el ejecutado',()=>{
 const rows=[record('01'),record('02',{forecast:forecast(0)}),record('03',{forecast:forecast(null)})];
 const before=JSON.stringify(rows),t=E.totals(rows);
 assert.equal(t.catalog,3);assert.equal(t.active,3);assert.equal(t.milling,3);assert.equal(t.usable,1);
 assert.equal(t.zero,1);assert.equal(t.missing,1);assert.equal(t.activeArea,30);assert.equal(t.millingArea,30);
 assert.equal(t.validMillingArea,10);assert.equal(t.pendingMillingArea,20);assert.equal(t.millingTch,50);assert.equal(t.millingTons,500);
 assert.equal(JSON.stringify(rows),before);assert.match(E.participation(rows[1]).reason,/cero/);assert.match(E.participation(rows[2]).reason,/Pendiente/);
});

test('semilla con área positiva y cero permanece activa sin participar en molienda',()=>{
 const p=E.participation(record('01',{classification:'Semilla',destino:'Semilla AS',forecast:forecast(0)}));
 assert.equal(p.active,true);assert.equal(p.milling,false);assert.equal(p.usable,false);assert.equal(p.conflict,false);assert.equal(p.activeArea,10);assert.match(p.reason,/Semilla/);
});

for(const [label,change,reason] of [
 ['Sin Caña cero',{classification:'Sin Caña',inventoryArea:0,forecast:forecast(0)},/Sin Caña/],
 ['Sin Caña con área',{classification:'Sin Caña',inventoryArea:10},/Sin Caña/],
 ['Baja definitiva',{operationalState:'Baja definitiva'},/Baja definitiva/],
 ['ausente',{sourcePresence:'absent'},/Solo referencia/]
])test(`${label} permanece consultable sin contribuir a producción aunque conserve valores previos`,()=>{
 const r=record('01',change),p=E.participation(r),t=E.totals([r]);
 assert.equal(p.active,false);assert.equal(p.milling,false);assert.equal(p.usable,false);assert.equal(p.activeArea,0);assert.equal(t.millingTch,null);assert.equal(t.catalog,1);assert.match(p.reason,reason);
});

test('conflictos no reclasifican: cero queda pendiente; positivo conserva la clasificación y advierte',()=>{
 const zero=record('01',{destino:'Semilla',forecast:forecast(0)}),positive=record('02',{destino:'Semilla'});
 const a=E.participation(zero),b=E.participation(positive);
 assert.equal(a.conflict,true);assert.equal(a.active,true);assert.equal(a.usable,false);
 assert.equal(b.conflict,true);assert.equal(b.usable,true);assert.equal(b.estimatedTons,500);assert.match(b.reason,/por validar/);
 assert.equal(zero.classification,'Molienda');assert.equal(zero.destino,'Semilla');
 const totals=E.totals([zero,positive]);assert.equal(totals.conflicts,2);assert.equal(totals.pendingMillingLots,1);
});

test('finca sin molienda conserva catálogo, área semilla y N/D de estimado; combinación no filtra identidades',()=>{
 const w=view(),seed=record('01',{classification:'Semilla',forecast:forecast(0)}),inactive=record('02',{classification:'Sin Caña'});
 const d=w.CASUR_BUILD_CRONO_DATA([seed,inactive]);
 assert.equal(d.producers.length,1);assert.equal(d.options.length,1);assert.equal(d.producers[0].details.length,2);
 assert.equal(d.global.activeLots,1);assert.equal(d.global.suertes,2);assert.equal(d.global.estimateTch,null);assert.equal(d.global.estimateTons,null);assert.equal(d.global.coberturaEstimadoAreaPct,null);
 const mixed=w.CASUR_BUILD_CRONO_DATA([seed,inactive,record('03')]);assert.equal(mixed.global.estimateTch,50);assert.equal(mixed.global.estimateArea,10);assert.equal(mixed.global.area,20);assert.equal(mixed.global.tch,70);
});

test('finca, productor y zonas concilian por suma; el denominador no usa semilla ni pendientes',()=>{
 const w=view(),rows=[record('01',{zona:'Norte'}),record('02',{forecast:forecast(0),zona:'Norte'}),record('03',{code:'811',name:'Otra',zona:'Sur',inventoryArea:20,forecast:forecast(80)})];
 const d=w.CASUR_BUILD_CRONO_DATA(rows);
 assert.equal(d.global.estimateTons,2100);assert.equal(d.global.estimateArea,30);assert.equal(d.global.estimateTch,70);assert.equal(d.global.millingArea,40);assert.equal(d.global.pendingMillingArea,10);
 assert.equal(d.producers.reduce((n,p)=>n+p.estimateTons,0),d.global.estimateTons);
 assert.equal(d.groups.zona.reduce((n,p)=>n+p.estimateArea,0),d.global.estimateArea);
 assert.equal(d.groups.zona.find(p=>p.key==='Norte').estimateTch,50);
});

test('generación B1 anterior se deriva al abrir offline sin reescribir su snapshot ni metadatos',()=>{
 const w=view(),saved={meta:{operationalContract:1,dataVersion:'previa',publishedAt:'2026-01-01'},
  producers:[{code:'810',name:'Finca',details:[record('01'),record('02',{forecast:forecast(0),millingEstimatedTons:0})]}],global:{estimateTch:25},operational:{totals:{validMillingArea:20}}};
 const before=JSON.stringify(saved),d=w.CASUR_REFRESH_OPERATIONAL_VIEW(saved);
 assert.equal(JSON.stringify(saved),before);assert.equal(d.global.estimateTch,50);assert.equal(d.operational.totals.validMillingArea,10);assert.equal(d.meta.publishedAt,'2026-01-01');assert.equal(d.meta.dataVersion,'previa');
});

test('los formateadores cronológicos conservan N/D y distinguen un cero observado',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 for(const marker of ['let currentCronoProducer = null;','let currentCronoZone = null;']){
  const section=html.slice(html.indexOf(marker)),source=section.match(/function num\(v\)\{[^\r\n]+/)[0];
  const num=vm.runInNewContext('('+source+')');assert.equal(num(null),null);assert.equal(num(''),null);assert.equal(num(undefined),null);assert.equal(num(0),0);assert.equal(num(50),50);
 }
});

test('decisiones CASUR de 2003/1927 preservan el origen y se limitan a fuente, zafra y generación',()=>{
 const decisions=JSON.parse(JSON.stringify(view().CASUR_OPERATIONAL_DECISIONS));
 const source={sha256:decisions[0].sourceHashes[0]};
 const raw2003=record('03',{code:'20',codLote:'2003',inventoryArea:10.95,destino:'Semilla',source,dataVersion:'g1',forecast:forecast(0)});
 const raw1927=record('27',{code:'19',codLote:'1927',inventoryArea:6.15,destino:'Semilla',source,dataVersion:'g1',forecast:forecast(70)});
 const a=E.applyDecisions(raw2003,decisions),b=E.applyDecisions(raw1927,decisions),p=E.participation(a);
 assert.equal(p.active,true);assert.equal(p.milling,false);assert.equal(p.operationalDestination,'Semilla');assert.equal(p.status,'seed');
 assert.equal(a.classification,'Molienda');assert.equal(a.destino,'Semilla');assert.equal(a.forecast.tch,0);assert.equal(raw2003.operationalDecision,undefined);
 assert.equal(E.participation(b).estimatedTons,430.5);assert.equal(E.participation(b).milling,true);
 const totals=E.totals([a,b]);assert.equal(totals.seed,1);assert.equal(totals.milling,1);assert.equal(totals.pendingMillingArea,0);assert.equal(totals.pendingConflicts,0);
 for(const altered of [{...raw2003,source:{sha256:'otra'}},{...raw2003,forecast:{season:'27/28',tch:0}},{...raw2003,inventoryArea:11}])assert.equal(E.applyDecisions(altered,decisions).operationalDecision,undefined);
 assert.equal(E.participation({...a,dataVersion:'otra-generacion'}).decision,null);
 // Every saved snapshot remains an exact SHA allowlist, never a name/prefix bypass.
 for(const sha256 of decisions[0].sourceHashes){
  assert.equal(E.participation(E.applyDecisions({...raw2003,source:{sha256}},decisions)).operationalDestination,'Semilla');
  assert.equal(E.participation(E.applyDecisions({...raw1927,source:{sha256}},decisions)).estimatedTons,430.5);
  assert.equal(E.applyDecisions({...raw2003,source:{sha256},inventoryArea:11},decisions).operationalDecision,undefined);
  assert.equal(E.applyDecisions({...raw1927,source:{sha256:sha256.slice(0,-1)+'x'}},decisions).operationalDecision,undefined);
 }
 assert.deepEqual(decisions.map(d=>d.key).sort(),['1927','2003']);
});

test('semilla positiva no se vuelve Molienda por el valor de TCH',()=>{
 const p=E.participation(record('01',{classification:'Semilla',destino:'Semilla',forecast:forecast(70)}));assert.equal(p.active,true);assert.equal(p.milling,false);assert.equal(p.estimatedTons,null);
});

test('edad general pondera el cálculo individual por área activa y audita cobertura sin imputar faltantes',()=>{
 const api=view().CASUR_CRONO_PARTICIPATION;
 const rows=[record('01',{inventoryArea:10,months:6}),record('02',{inventoryArea:30,months:12}),
   record('03',{inventoryArea:5,classification:'Semilla',months:9}),
   record('04',{classification:'Sin Caña',months:90}),record('05',{sourcePresence:'absent',months:90})];
 const before=JSON.stringify(rows),s=api.currentAgeSummary(rows,r=>r.months);
 assert.equal(s.months,465/45);assert.equal(s.numerator,465);assert.equal(s.validArea,45);
 assert.equal(s.activeArea,45);assert.equal(s.coveragePct,100);assert.equal(s.validLots,3);
 assert.equal(JSON.stringify(rows),before);
 const missing=api.currentAgeSummary([...rows,record('06',{inventoryArea:5,months:null})],r=>r.months);
 assert.equal(missing.months,null);assert.equal(missing.validArea,45);assert.equal(missing.activeArea,50);
 assert.equal(missing.numerator,465);assert.equal(missing.coveragePct,90);assert.equal(missing.reason,'Cobertura de edad incompleta');
 for(const months of [undefined,'',NaN,-1])assert.equal(api.currentAgeSummary([record('07',{months})],r=>r.months).months,null);
 assert.equal(api.currentAgeSummary([record('08',{renovacion:true,fSiembra:null})],()=>0).validArea,0);
 assert.equal(api.currentAgeSummary([record('09')],()=>0).months,0);
 assert.equal(api.currentAgeSummary([],()=>99).coveragePct,null);
 const html=api.currentAgeKpi([record('10',{months:null})],r=>r.months);
 assert.match(html,/>N\/D</);assert.match(html,/Cobertura: 0.00%/);assert.doesNotMatch(html,/<em>/);
});

test('panel general reemplaza contadores por toneladas autorizadas y edad, sin alterar ficha ni redondear TCH global',()=>{
 const api=view().CASUR_CRONO_PARTICIPATION;
 const rows=[record('01',{inventoryArea:3,forecast:forecast(70.12345)}),
   record('02',{inventoryArea:7,forecast:forecast(80.98765)}),
   record('03',{classification:'Semilla',forecast:forecast(999)}),
   record('04',{classification:'Sin Caña',forecast:forecast(999)})];
 assert.equal(api.summary(rows).estimateTons,777.28);
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const normalized=html.replaceAll('\r\n','\n');
 const home=normalized.slice(normalized.indexOf('function renderCronoHome(){\n  setupCrono();'),normalized.indexOf('function renderCronoProducer(code){renderCronoScope'));
 assert.match(home,/TCH Z Ant\. 25\/26/);assert.match(home,/estimate\.estimateTons/);
 assert.match(home,/currentAgeKpi\(rows,ageMonths\)/);assert.doesNotMatch(home,/kpi\('Haciendas'|Suertes activas/);
 assert.match(normalized,/suerte\?'Edad actual'/);assert.match(normalized,/suerte\?kpi\('Variedad'/);
});

test('análisis agronómico reutiliza toneladas/área de molienda: no promedio simple, semilla ni plan',()=>{
 const api=view().CASUR_CRONO_PARTICIPATION,rows=[
  record('01',{inventoryArea:2,zona:'Norte',tipoRiego:'Gravedad',forecast:forecast(100),plan:{tons:600000}}),
  record('02',{inventoryArea:8,zona:'Norte',tipoRiego:'Gravedad',forecast:forecast(50)}),
  record('03',{inventoryArea:5,zona:'Norte',classification:'Semilla',forecast:forecast(99)}),
  record('04',{inventoryArea:20,zona:'Sur',classification:'Sin Caña'}),
  record('05',{inventoryArea:5,zona:'Sur',forecast:forecast(null)}),
  record('06',{inventoryArea:3,zona:'Norte',sourcePresence:'absent'})];
 const before=JSON.stringify(rows),groups=api.agronomicGroups(rows,'zona'),north=groups.find(g=>g.key==='Norte'),south=groups.find(g=>g.key==='Sur');
 assert.equal(north.area,15);assert.equal(north.estimateTons,600);assert.equal(north.estimateArea,10);
 assert.equal(north.estimateTch,60);assert.equal(north.coveragePct,100);
 assert.equal(south.area,5);assert.equal(south.estimateTch,null);assert.equal(south.estimateArea,0);assert.equal(south.coveragePct,0);
 assert.equal(api.agronomicGroups(rows,'tipoRiego').find(g=>g.key==='Gravedad').estimateTch,60);
 assert.equal(JSON.stringify(rows),before);
});

test('etapa exige número de corte acreditado; edad y tipo propuesto no acreditan Plantilla/Soca',()=>{
 const api=view().CASUR_CRONO_PARTICIPATION;
 const cut=(c,header='NC',raw=c)=>record('01',{corte:c,provenance:{cut:{header,raw}},edadExcel:1,plan:{cut:'MANUAL'}});
 assert.equal(api.cropStage(cut('1')),'Plantilla');assert.equal(api.cropStage(cut(2)),'Soca');
 assert.equal(api.cropStage(cut('12','#_de_Corte')),'Soca');
 for(const r of [cut(null),cut('R'),cut('MANUAL'),cut(0),cut(-1),cut(1.5),cut(1,'Edad'),cut(1,'NC',2),record('02',{corte:1})])assert.equal(api.cropStage(r),'Sin clasificar');
 const groups=api.agronomicGroups([cut(1),cut(2),cut(null)],'stage');
 assert.equal(groups.length,3);assert.equal(groups.reduce((n,g)=>n+g.area,0),30);
 assert.equal(groups.find(g=>g.key==='Sin clasificar').estimateTch,50);
});

test('paneles de área incluyen todas las categorías y sin clasificar, con total de la misma área activa',()=>{
 const api=view().CASUR_CRONO_PARTICIPATION,rows=Array.from({length:10},(_,i)=>record(String(i),{zona:i===9?'':'Zona '+i,inventoryArea:i+1}));
 rows.push(record('11',{classification:'Sin Caña',inventoryArea:999}),record('12',{sourcePresence:'absent',inventoryArea:999}));
 let chartGroups;
 const panel=api.areaPanel(rows,'zona','Área por zona',groups=>{chartGroups=groups;return 'chart'});
 assert.equal(chartGroups.length,10);assert.equal(chartGroups.reduce((s,g)=>s+g.area,0),55);
 assert.equal(chartGroups.find(g=>g.key==='Sin clasificar').area,10);assert.match(panel,/data-area-total="55"/);assert.match(panel,/55.00 ha/);
 assert.doesNotMatch(panel,/>TOTAL\s*</);assert.match(panel,/aria-label="Total de área por zona"/);
 assert.deepEqual(Array.from(api.agronomicGroups([],'zona')),[]);
});

test('resumen compacto conserva cinco KPI y agrupa paneles por ámbito sin métricas nuevas',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8').replaceAll('\r\n','\n');
 const home=html.slice(html.indexOf('function renderCronoHome(){\n  setupCrono();'),html.indexOf('function renderCronoProducer(code){renderCronoScope'));
 assert.match(home,/kpis crono-general-kpis/);assert.match(home,/Ton\. Estim\. Z/);
 assert.equal((home.match(/class="crono-analysis-column"/g)||[]).length,3);
 for(const text of [' por zona',' por riego',' · Plantilla / Soca'])assert.ok(home.includes("'TCH Estim. Z'+(season||'—')+'"+text+"'"));
 assert.equal((home.match(/\.estimatedTchPanel\(/g)||[]).length,3);
 assert.equal((home.match(/\.areaPanel\(/g)||[]).length,4);
 const js=fs.readFileSync(new URL('../js/casur-enhancements.js',import.meta.url),'utf8');
 assert.match(js,/estimateKpi\(`TCH Estim\. Z\$\{season\}`/);
});

test('gráficos mantienen N/D y denominadores auditables ante fuentes no aplicadas o generaciones mixtas',()=>{
 const api=view().CASUR_CRONO_PARTICIPATION,rows=[record('01',{zona:'A'}),record('02',{zona:'B',dataVersion:'otra'})];
 assert.ok(api.agronomicGroups(rows,'zona').every(g=>g.estimateTch===null));
 const panel=api.estimatedTchPanel(rows,'zona','TCH estimado por zona');
 assert.match(panel,/data-group-audit/);assert.match(panel,/N\/D/);assert.match(panel,/ha válidas/);assert.match(panel,/Cobertura/);
 assert.doesNotMatch(panel,/>0.00<\/div>/);
});
