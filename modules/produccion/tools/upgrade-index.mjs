import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = path.join(root, "index.html");
let html = await fs.readFile(indexPath, "utf8");

const replaceOnce = (needle, replacement, label = needle.slice(0, 60)) => {
  if (!html.includes(needle)) throw new Error(`No se encontró el ancla: ${label}`);
  html = html.replace(needle, replacement);
};

if (!html.includes("css/casur-upgrade.css")) {
  replaceOnce("</head>", '<link rel="stylesheet" href="css/casur-upgrade.css">\n</head>', "cierre head");
}

if (!html.includes("data/version.js")) {
  replaceOnce("<script>window.APP_DATA=", '<script src="data/version.js"></script>\n<script src="data/historico.js"></script>\n<script src="data/cronologico.js"></script>\n<script>window.APP_DATA=', "asignación APP_DATA");
}
replaceOnce("window.APP_DATA={", "window.APP_DATA=window.CASUR_REMOTE_HISTORICO||{", "fallback histórico");
replaceOnce("window.CRONO_DATA = {", "window.CRONO_DATA = window.CASUR_REMOTE_CRONO||{", "fallback cronológico");

const masterStart = html.indexOf("<!-- MASTER_UPDATE_SECTION_START -->");
const masterEndMarker = "<!-- MASTER_UPDATE_SECTION_END -->";
const masterEnd = html.indexOf(masterEndMarker, masterStart);
if (masterStart < 0 || masterEnd < 0) throw new Error("No se encontró el bloque visual del Centro Maestro.");

const masterMarkup = `<!-- MASTER_UPDATE_SECTION_START -->
<details class="accordion master-update-accordion no-print is-locked" id="masterUpdateSection">
  <summary>
    <div class="master-summary-copy"><strong>🔐 Centro Maestro · Programador</strong><small>Fuente oficial REPORTE, edición controlada y publicación para todos los dispositivos.</small></div>
    <div class="master-summary-pills"><span>📊 Excel oficial</span><span>✍️ Edición interna</span><span>🔄 Datos compartidos</span><span>🚀 Exportadores</span></div>
    <span class="toggle-icon"></span>
  </summary>
  <div class="accordion-body">
    <div class="casur-admin-hero"><strong>Flujo maestro seguro y verificable</strong><small>Los cambios se preparan dentro de la app. Solo se vuelven compartidos cuando se publican los archivos de datos en GitHub.</small></div>
    <div class="casur-admin-grid">
      <section class="casur-admin-card admin-primary">
        <div class="casur-card-head"><span class="casur-step">1</span><div><h3>Actualizar desde el Excel oficial</h3><p>Única fuente admitida: hoja REPORTE de la plantilla Cronológico Maestro CASUR.</p></div></div>
        <label class="casur-file-drop"><b>Seleccionar Cronológico Maestro (.xlsx)</b><small>Valida llaves, áreas, zonas y TCH estimado 26/27 antes de aplicar.</small><input id="masterCronoFile" type="file" accept=".xlsx,.xls,.xlsm" onchange="masterReadCronoExcel(this.files&&this.files[0])"></label>
        <div class="casur-official-rule" id="masterColumnNote"><b>Reglas:</b> hoja REPORTE · Sucuya/Zona 0 excluida · fecha efectiva del estimado 17/07/2026 · una celda vacía no se convierte en cero.</div>
        <div class="casur-editor-actions"><button class="casur-btn" type="button" onclick="casurApplyImportedExcel()">Aplicar Excel validado a la app</button></div>
      </section>

      <section class="casur-admin-card">
        <div class="casur-card-head"><span class="casur-step">2</span><div><h3>Edición manual interna</h3><p>Corrija una suerte cronológica o un registro histórico puntual, con recálculo de agregados.</p></div></div>
        <div class="casur-admin-tabs"><button class="casur-admin-tab is-active" data-editor="crono" type="button">Cronológico / Maestro</button><button class="casur-admin-tab" data-editor="hist" type="button">Histórico</button></div>
        <div id="casurCronoEditor">
          <div class="casur-editor-search"><input id="casurCronoSearch" list="casurCronoOptions" placeholder="Código · suerte · hacienda"><datalist id="casurCronoOptions"></datalist><button class="casur-btn secondary" type="button" onclick="casurLoadCronoEditor()">Cargar</button></div>
          <div class="casur-editor-fields">
            <label>Código<input id="editCode"></label><label>Hacienda / productor<input id="editName"></label><label>Suerte<input id="editLot"></label><label>Área (ha)<input id="editArea" type="number" step="0.01"></label>
            <label>TCH real 25/26<input id="editTch" type="number" step="0.01"></label><label>TCH estimado 26/27<input id="editTchEst" type="number" step="0.01"></label><label>Fecha efectiva<input id="editTchDate" type="date" value="2026-07-17"></label><label>Zona<input id="editZone"></label>
            <label>Variedad<input id="editVariety"></label><label># corte<input id="editCut"></label><label>Tipo de riego<input id="editIrrigation"></label><label>Estado maestro<input id="editState"></label>
            <label class="wide">Observación<textarea id="editObservation"></textarea></label>
          </div>
          <div class="casur-editor-actions"><button class="casur-btn neutral" type="button" onclick="casurNewCronoEditor()">Nueva suerte</button><button class="casur-btn" type="button" onclick="casurSaveCronoEditor()">Guardar y recalcular</button><button class="casur-btn danger" type="button" onclick="casurDeleteCronoEditor()">Eliminar</button></div>
        </div>
        <div id="casurHistoryEditor" hidden>
          <div class="casur-editor-search"><input id="casurHistorySearch" list="casurHistoryOptions" placeholder="Código de suerte · hacienda"><datalist id="casurHistoryOptions"></datalist><button class="casur-btn secondary" type="button" onclick="casurLoadHistoryLot()">Cargar</button></div>
          <div class="casur-editor-fields">
            <label>Zafra<select id="histSeason" onchange="casurLoadHistorySeason()"></select></label><label>Área (ha)<input id="histArea" type="number" step="0.01"></label><label>Toneladas<input id="histTon" type="number" step="0.01"></label><label>TCH calculado<input id="histTch" type="number" step="0.01" readonly></label>
            <label>KATM<input id="histRto" type="number" step="0.01"></label><label>Edad (meses)<input id="histAge" type="number" step="0.01"></label><label># corte<input id="histCut" type="number" step="0.01"></label>
          </div>
          <div class="casur-official-rule">En histórico, el TCH se recalcula siempre como toneladas ÷ área para mantener consistencia matemática.</div>
          <div class="casur-editor-actions"><button class="casur-btn" type="button" onclick="casurSaveHistorySeason()">Guardar histórico y recalcular</button></div>
        </div>
        <div class="casur-change-log" id="casurChangeLog"><div>Sin cambios manuales en esta sesión.</div></div>
      </section>

      <section class="casur-admin-card admin-publish">
        <div class="casur-card-head"><span class="casur-step">3</span><div><h3>Publicar o exportar</h3><p>Conserve los exportadores por zona y módulos. Para una actualización normal compartida, publique solo la carpeta data.</p></div></div>
        <div class="casur-export-guide"><div><b>A.</b><span>Para todos los dispositivos: genere “Paquete solo datos” y reemplace los archivos dentro de <b>data/</b> en GitHub.</span></div><div><b>B.</b><span>Para otra app o zona: use los exportadores HTML/PWA con el alcance y los módulos elegidos.</span></div></div>
        <div class="master-toolbar"><input class="master-select" id="casurPublishVersion" value="2026.09.01-2627.1" aria-label="Versión de datos"><button class="casur-btn" type="button" onclick="casurDownloadDataUpdate()">⬇ Paquete solo datos para GitHub</button><button class="casur-btn secondary" type="button" onclick="casurCheckForDataUpdate()">↻ Comprobar versión publicada</button></div>
        <hr style="border:0;border-top:1px solid #e2e8f0;margin:14px 0">
        <select class="master-select" id="masterScopeSelect"><option value="__all__">CASUR completo</option></select>
        <div class="master-profile-grid">
          <div class="master-profile-card"><strong>Perfil rápido</strong><select class="master-profile-select" id="masterProfileSelect" onchange="masterApplyProfile(this.value)"><option value="complete" selected>Completo CASUR / Dirección</option><option value="basic">Operativo básico · solo Cronológico</option><option value="fieldzone">Operativo zona · Cronológico + análisis cronológico</option><option value="technical">Operativo técnico · Cronológico + Histórico</option><option value="executive">Ejecutivo zona · Cronológico + Histórico + Análisis por zona</option><option value="custom">Personalizado</option></select><small>El perfil define los módulos de la versión exportada.</small></div>
          <div class="master-profile-card"><strong>Módulos incluidos</strong><div class="master-module-checks" id="masterModuleChecks"><label class="master-module-check is-on"><input type="checkbox" id="modCrono" checked onchange="masterModuleChanged()"><span><b>📗 Cronológico</b><em>Incluye TCH estimado 26/27.</em></span></label><label class="master-module-check is-on"><input type="checkbox" id="modHist" checked onchange="masterModuleChanged()"><span><b>📘 Histórico</b><em>Zafras, TCH y KATM.</em></span></label><label class="master-module-check is-on"><input type="checkbox" id="modZones" checked onchange="masterModuleChanged()"><span><b>📊 Análisis por zona</b><em>Cronológico e histórico según perfil.</em></span></label><label class="master-module-check is-on"><input type="checkbox" id="modExec" checked onchange="masterModuleChanged()"><span><b>📈 Resumen ejecutivo</b><em>Lectura gerencial.</em></span></label></div><div class="master-module-warning" id="masterModuleWarning"></div></div>
        </div>
        <div class="master-toolbar master-export-actions"><button id="masterExportHtmlBtn" class="master-export-card export-master master-disabled" type="button" onclick="masterDownloadUpdatedHtml(false)"><span class="master-export-icon">🧰</span><span class="master-export-copy"><b>Maestro Programador</b><small>HTML con edición protegida.</small></span><span class="master-export-arrow">↓</span></button><button id="masterExportOperBtn" class="master-export-card export-oper master-disabled" type="button" onclick="masterDownloadUpdatedHtml(true)"><span class="master-export-icon">👥</span><span class="master-export-copy"><b>Operativo para Personal</b><small>HTML limpio, sin Centro Maestro.</small></span><span class="master-export-arrow">↓</span></button><button id="masterExportZipBtn" class="master-export-card export-pwa master-disabled" type="button" onclick="masterDownloadUpdatedZip(true)"><span class="master-export-icon">📲</span><span class="master-export-copy"><b>App GitHub/PWA</b><small>ZIP por zona y módulos.</small></span><span class="master-export-arrow">↗</span></button></div>
      </section>
    </div>
    <div id="masterCronoStatus" class="master-status good">Base oficial cargada. Puede importar un nuevo REPORTE, editar manualmente o exportar.</div>
    <div id="masterCronoKpis" class="master-kpis"></div>
    <div class="master-grid"><div id="masterCronoValidation" class="master-box"><h3>Validación</h3><small>Al cargar el Excel se mostrarán errores críticos y advertencias.</small></div><div id="masterCronoCompare" class="master-box"><h3>Comparativo contra base actual</h3><small>Comparación por código de hacienda + suerte.</small></div><div id="masterColumnMap" class="master-box wide"><h3>Columnas reconocidas</h3><small>Mapa de encabezados oficiales detectados.</small></div><div id="masterCronoZones" class="master-box wide"><h3>Resumen por zona</h3><small>Control antes de publicar.</small></div></div>
  </div>
</details>
<!-- MASTER_UPDATE_SECTION_END -->`;

html = html.slice(0, masterStart) + masterMarkup + html.slice(masterEnd + masterEndMarker.length);

if (!html.includes('id="masterAdminLauncher"')) {
  replaceOnce('<div class="hero-shell">', `<div class="hero-shell">
    <!-- MASTER_ADMIN_LAUNCHER_START -->
    <button class="casur-admin-launcher no-print is-locked" id="masterAdminLauncher" type="button" onclick="goMasterModule(this)" aria-label="Abrir módulo técnico protegido" aria-controls="masterUpdateSection" aria-expanded="false">
      <span class="casur-admin-launcher-icon" aria-hidden="true">⚙</span>
      <span class="casur-admin-launcher-copy"><strong>Módulo técnico</strong><small id="masterAdminLauncherState">Acceso protegido</small></span>
      <span class="casur-admin-launcher-arrow" aria-hidden="true">›</span>
    </button>
    <!-- MASTER_ADMIN_LAUNCHER_END -->`, "acceso compacto del Centro Maestro");
}

replaceOnce("function buildCronoData(records,sourceName){", "function buildCronoData(records,sourceName){if(typeof window.CASUR_BUILD_CRONO_DATA==='function')return window.CASUR_BUILD_CRONO_DATA(records,sourceName);", "constructor cronológico maestro");
replaceOnce("    tch:['TCH_25_26'", "    tchEst2627:['TCH_Estimado_Z2627','TCH Estimado Z2627','TCH_ESTIMADO_Z26/27','TCH ESTIMADO Z26/27'],\n    tonEst2627:['Ton_Estimadas_Z2627','Ton Estimadas Z2627','TON ESTIMADAS Z26/27'],\n    estado:['Estado','ESTADO'],observacion:['Observación','Observacion','OBSERVACION'],numeroRiegos:['#_de_Riegos','# de Riegos','Numero Riegos'],erp:['ERP'],\n    tch:['TCH_25_26'", "alias de TCH");

const extractStart = html.indexOf("function extractRecords(rows){", html.indexOf('<script id="masterUpdateScript">'));
const extractEnd = html.indexOf("function applyPatch(rows){", extractStart);
if (extractStart < 0 || extractEnd < 0) throw new Error("No se pudo delimitar extractRecords.");
const extractFunction = `function extractRecords(rows){const errors=[],warnings=[],seen=new Set(),records=[],map={}; let raw=0,excluded=0; rows.forEach((row,i)=>{raw++; const line=i+2; const code=String(getField(row,'code',map)??'').trim(); const name=String(getField(row,'name',map)??'').trim(); const suerte=String(getField(row,'suerte',map)??'').trim(); const codLote=String(getField(row,'codLote',map)??'').trim(); const area=num(getField(row,'area',map)); const variedad=String(getField(row,'variedad',map)??'').trim(); const surco=getField(row,'surco',map); const corte=String(getField(row,'corte',map)??'').trim(); const tch=num(getField(row,'tch',map)); const tchEst2627=num(getField(row,'tchEst2627',map)); const tonExcel=num(getField(row,'tonEst2627',map)); const textura=String(getField(row,'textura',map)??'').trim(); const fUltCte=isoDate(getField(row,'fUltCte',map)); const fSiembra=isoDate(getField(row,'fSiembra',map)); const zona=labelZone(getField(row,'zona',map)); const distancia=num(getField(row,'distancia',map)); const destino=String(getField(row,'destino',map)??'').trim(); const tipoCultivo=String(getField(row,'tipoCultivo',map)??'').trim(); const tenencia=decodeTenencia(getField(row,'tenencia',map)); const tipoRiego=String(getField(row,'tipoRiego',map)??'').trim(); const numeroRiegos=num(getField(row,'numeroRiegos',map)); const erp=String(getField(row,'erp',map)??'').trim(); const estado=String(getField(row,'estado',map)??'').trim(); const observacion=String(getField(row,'observacion',map)??'').trim(); const ton=num(getField(row,'ton',map)); const edad=num(getField(row,'edad',map)); if(!code&&!name&&!suerte&&!area)return; if(isExcluded(code,name,zona)){excluded++;return;} let crit=false; if(!code){errors.push('Fila '+line+': falta código de hacienda.');crit=true;} if(!name){errors.push('Fila '+line+': falta nombre de hacienda/productor.');crit=true;} if(!suerte){errors.push('Fila '+line+': falta suerte.');crit=true;} if(!(area>0)){errors.push('Fila '+line+': área inválida o vacía.');crit=true;} if(crit)return; if(!zona||zona==='Sin zona')warnings.push('Fila '+line+': zona vacía o no reconocida.'); if(!variedad)warnings.push('Fila '+line+': variedad vacía.'); const k=keyOf(code,suerte); if(seen.has(k))errors.push('Fila '+line+': llave duplicada código+suerte '+code+'-'+suerte+'.'); seen.add(k); const ren=isRenew(corte); const fBase=ren&&!fSiembra?null:newerDate(fSiembra,fUltCte); const tonEst2627=tchEst2627==null?null:round(area*tchEst2627,2); if(tchEst2627!=null&&tonExcel!=null&&Math.abs(tonExcel-tonEst2627)>.02)warnings.push('Fila '+line+': toneladas 26/27 corregidas con Área × TCH.'); records.push({code,name,suerte,codLote:codLote||String(code)+String(suerte),area:round(area,2),variedad:variedad||'—',surco:surco==null?'':String(surco),corte:corte||'—',tch:tch==null?null:round(tch,2),tchEst2627:tchEst2627==null?null:round(tchEst2627,2),tonEst2627,tchEst2627Fecha:tchEst2627==null?null:'2026-07-17',tchEst2627Fuente:tchEst2627==null?null:'Excel oficial REPORTE',textura:textura||'—',fBase,fUltCte,fSiembra,zona,distancia:round(distancia||0,2),destino:destino||'—',tenencia:tenencia||'—',tipoCultivo:tipoCultivo||'—',tipoRiego:tipoRiego||'—',numeroRiegos,erp,estado:estado||'—',observacion,renovacion:ren,ton:ton==null?null:round(ton,2),edadExcel:edad==null?null:round(edad,2)});}); return {records,errors,warnings,raw,excluded,map};}\n`;
html = html.slice(0, extractStart) + extractFunction + html.slice(extractEnd);

replaceOnce("if(operative)return operativeTemplateSource();", "", "plantilla operativa antigua");
replaceOnce("    const root=document.documentElement.cloneNode(true);", "    const root=document.documentElement.cloneNode(true);\n    if(operative){const legacyTemplate=root.querySelector('#casurOperativeTemplateB64');if(legacyTemplate)legacyTemplate.remove();}", "retiro de plantilla heredada en operativo");
replaceOnce("ok('Sin plantilla maestra expuesta',!operative||!text.includes('casurOperativeTemplateB64'));", "ok('Sin plantilla maestra expuesta',!operative||!doc.getElementById('casurOperativeTemplateB64'));", "auditoría DOM de plantilla heredada");
replaceOnce("html=removeBlock(html,'<!-- MASTER_UPDATE_SECTION_START -->','<!-- MASTER_UPDATE_SECTION_END -->');", "html=removeBlock(html,'<!-- MASTER_UPDATE_SECTION_START -->','<!-- MASTER_UPDATE_SECTION_END -->');\n      html=removeBlock(html,'<!-- MASTER_ADMIN_LAUNCHER_START -->','<!-- MASTER_ADMIN_LAUNCHER_END -->');", "retiro del acceso técnico en exportación operativa");
replaceOnce("ok('Sin Centro Maestro en operativo',!operative||!text.includes('id=\"masterUpdateSection\"'));", "ok('Sin Centro Maestro en operativo',!operative||(!text.includes('id=\"masterUpdateSection\"')&&!text.includes('id=\"masterAdminLauncher\"')));", "auditoría del acceso técnico operativo");
replaceOnce("    return '<!DOCTYPE html>\\n'+root.outerHTML;", `    const cssLink=root.querySelector('link[href="css/casur-upgrade.css"]'); if(cssLink){try{const r=await fetch('css/casur-upgrade.css',{cache:'no-store'});if(r.ok){const st=root.ownerDocument.createElement('style');st.textContent=await r.text();cssLink.replaceWith(st);}}catch(e){}}
    const enhancement=root.querySelector('script[src="js/casur-enhancements.js"]'); if(enhancement){try{const r=await fetch('js/casur-enhancements.js',{cache:'no-store'});if(r.ok){const sc=root.ownerDocument.createElement('script');sc.textContent=await r.text();enhancement.replaceWith(sc);}}catch(e){}}
    return '<!DOCTYPE html>\\n'+root.outerHTML;`, "serialización exportada");
replaceOnce("const data=pending?pending.data:window.CRONO_DATA;", "const data=pending?pending.data:(window.CASUR_ADMIN_DATA||window.CRONO_DATA);", "datos de exportación");
replaceOnce("      zip.file('index.html',html);", `      zip.file('index.html',html);
      const exportData=dataForScope();
      const exportApp=appForScope(mods);
      const exportRelease=Object.assign({},window.CASUR_RELEASE||{},{version:(exportData.meta&&exportData.meta.dataVersion)||((window.CASUR_RELEASE||{}).version)||'exportado',scope:selectedScope(),publishedAt:new Date().toISOString(),cronologicoRows:(exportData.global&&exportData.global.suertes)||0,historicoRows:(exportApp.meta&&exportApp.meta.rows)||0});
      zip.file('data/cronologico.js','window.CASUR_REMOTE_CRONO='+JSON.stringify(exportData)+';\\n');
      zip.file('data/cronologico.json',JSON.stringify(exportData,null,2)+'\\n');
      zip.file('data/historico.js','window.CASUR_REMOTE_HISTORICO='+JSON.stringify(exportApp)+';\\n');
      zip.file('data/historico.json',JSON.stringify(exportApp)+'\\n');
      zip.file('data/version.js','window.CASUR_RELEASE='+JSON.stringify(exportRelease)+';\\n');
      zip.file('data/version.json',JSON.stringify(exportRelease,null,2)+'\\n');
      zip.file('css/casur-upgrade.css','/* Estilos VF54 integrados dentro de index.html para esta exportación. */\\n');
      zip.file('js/casur-enhancements.js','/* Funciones VF54 integradas dentro de index.html para esta exportación. */\\n');`, "datos dentro del ZIP PWA");
replaceOnce("if(Object.prototype.hasOwnProperty.call(embedded,f)){zip.file(f,embedded[f],{base64:true});added=true;}\n        if(!added){try{const r=await fetch(f,{cache:'no-store'});if(r.ok){zip.file(f,await r.blob());added=true;}}catch(e){}}", "try{const r=await fetch(f,{cache:'no-store'});if(r.ok){zip.file(f,await r.blob());added=true;}}catch(e){}\n        if(!added&&Object.prototype.hasOwnProperty.call(embedded,f)){zip.file(f,embedded[f],{base64:true});added=true;}", "prioridad de recursos PWA");

replaceOnce("window.masterDownloadTemplate=downloadTemplate; window.masterSetMode=setMode;", "window.masterDownloadTemplate=downloadTemplate; window.masterSetMode=setMode; window.masterGetPendingData=function(){return pending&&pending.data||null;}; window.masterApplyPendingData=function(){if(!pending||pending.errors.length)return null; const data=pending.data; window.CASUR_ADMIN_DATA=data; if(window.CRONO_DATA){Object.keys(window.CRONO_DATA).forEach(function(k){delete window.CRONO_DATA[k];});Object.assign(window.CRONO_DATA,data);} pending=null; initCurrent(); return data;};", "API de aplicación Excel");

if (!html.match(/<script src="js\/casur-enhancements\.js"><\/script>/)) {
  const bodyClose = html.lastIndexOf("</body>");
  if (bodyClose < 0) throw new Error("No se encontró el cierre final de body.");
  html = `${html.slice(0, bodyClose)}<script src="js/casur-enhancements.js"></script>\n${html.slice(bodyClose)}`;
}

await fs.writeFile(indexPath, html);
console.log(JSON.stringify({ indexBytes: Buffer.byteLength(html), externalData: true, adminRebuilt: true }, null, 2));
