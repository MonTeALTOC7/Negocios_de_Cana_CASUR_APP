import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
const out=path.resolve(process.argv[2]),root=process.cwd(),read=n=>JSON.parse(fs.readFileSync(path.join(out,n+'.json'))),sha=b=>createHash('sha256').update(b).digest('hex');
const run=read('run-summary'),results=read('results'),checks=read('gate/checks'),data=read('data-package'),reconciliation=read('reconciliation-c2');
if(run.status!=='PASS'||results.length!==15||results.some(r=>r.status!=='PASS')||checks.some(r=>r.status!=='PASS')||run.errors.length)throw Error('Complete passing evidence required');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim(),head=git('rev-parse','HEAD'),branch=git('branch','--show-current');
const changed=git('diff','--name-only','6d6c790fec35d53f75da6cca9ff483cd535575cb','HEAD').split('\n').filter(Boolean);
if(changed.some(f=>/^modules\/(produccion|tch)\/data\//.test(f)&&f!=='modules/produccion/data/integrity.json'))throw Error('Real dataset must not be committed');
fs.writeFileSync(path.join(out,'C2_CAMBIOS_CODIGO.patch'),execFileSync('git',['diff','--binary','6d6c790fec35d53f75da6cca9ff483cd535575cb','HEAD'],{maxBuffer:16e6}));
// TCH's repository instructions require a full local component ZIP after changes.
const JSZip=createRequire(import.meta.url)('C:/Users/ctije/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/jszip');
const tchArchive=path.join(out,'TCH_2.8.1_C2_LOCAL_ONLY.zip');
if(!fs.existsSync(tchArchive)){
 const zip=new JSZip();function add(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['.git','node_modules'].includes(e.name))continue;const f=path.join(dir,e.name);if(e.isDirectory())add(f);else zip.file(path.relative(path.join(root,'modules/tch'),f).replaceAll('\\','/'),fs.createReadStream(f),{date:new Date('2026-10-27T00:00:00Z')});}}add(path.join(root,'modules/tch'));
 await new Promise((ok,no)=>zip.generateNodeStream({streamFiles:true,compression:'DEFLATE'}).pipe(fs.createWriteStream(tchArchive,{flags:'wx'})).on('finish',ok).on('error',no));
}
const exports={};for(const name of ['A-99336.pdf','A-99336.png','D-export-preserved.png']){const b=fs.readFileSync(path.join(out,name));if(name.endsWith('.pdf')&&b.subarray(0,4).toString()!=='%PDF')throw Error('Invalid PDF');if(name.endsWith('.png')&&b.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Invalid PNG');exports[name]={bytes:b.length,sha256:sha(b),...(name.endsWith('.png')?{width:b.readUInt32BE(16),height:b.readUInt32BE(20)}:{pages:(b.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length})};}
fs.writeFileSync(path.join(out,'exports-check.json'),JSON.stringify({status:'PASS',files:exports},null,2)+'\n');
const rows=results.map(r=>`| ${r.name.replaceAll('|','/')} | ${r.status} |`).join('\n');
const hashRows=Object.entries(data.sixFiles).map(([f,m])=>`| \`${f}\` | \`${m.sha256}\` |`).join('\n');
const fileList=changed.map(f=>'- '+f).join('\n');
const report=`# INFORME C2 · Actualización PWA y datos oficiales CASUR

**27-oct-2026 · America/Mexico_City. Candidata técnica local: PASS. Publicación: BLOCKED por autorización final.**

## 1. Rama, HEAD y alcance

- Rama local: **${branch}**.
- HEAD local de entrega: **\`${head}\`**.
- Base aprobada acumulada de #45: \`6d6c790fec35d53f75da6cca9ff483cd535575cb\`.
- Worktree: \`${root}\`.
- App candidata **1.5.0**, Producción **V1.7.0**, Histórico **V2.9**, TCH **2.8.1**. Fechas de publicación pendientes; no se publicaron estas versiones.

Se conserva el enlace/origen, manifest, scope, IndexedDB y la instalación de GitHub Pages. No se crea otra PWA ni otro sistema de actualización. Main y #43/#44/#45 permanecen intactos. C1 y sus archivos privados originales se conservan. No hubo push, merge, PR nuevo, despliegue, cambio de permisos/Access ni intervención en Cloudflare o GeoStudio.

El código se puede revisar mediante **C2_CAMBIOS_CODIGO.patch** o el commit local. El aforo candidato en claro no se incorporó al patch ni al historial Git de C2: solo se agregó un manifiesto de SHA del baseline ya existente. Los datasets previamente versionados y el snapshot cifrado aprobado permanecen intactos; el nuevo paquete completo permanece en QA externa.

## 2. Mecanismo de actualización de código

Se reutiliza core/updates/pwa-update.js, SW raíz, Cache Storage, manifiesto runtime, checkpoint multiventana y LKG. El cliente comprueba al abrir, al volver a estar online, al recuperar visibilidad y cada cinco minutos. Una comprobación sin novedades no muestra mensajes.

El SW descarga y verifica los **165 recursos** de la candidata en una caché distinta. Solo un worker en espera, distinto del controlador y completamente preparado, puede ofrecer:

**Nueva actualización CASUR disponible**

**Instalar actualización** · **Más tarde**

El clic en Instalar vuelve a verificar los hashes de código, consulta los checkpoints de todas las ventanas, protege operaciones y solo entonces solicita la activación coordinada. El cliente recarga **una vez** cuando cambia el controlador, recupera módulo/contexto disponible y continúa. No hay confirmación automática adicional al abrir ni al terminar.

Más tarde mantiene la versión actual funcionando, registra el aplazamiento por versión y conserva un acceso compacto **Actualización CASUR pendiente / Instalar actualización**. Una comprobación repetida no vuelve a presentar el aviso expandido. Los errores de checkpoint o petición de activación aparecen en el mismo aviso y permiten reintento; no se fuerza la instalación.

**Excepción aceptada expresamente por el usuario:** el primer aviso emitido por una 1.3.6 ya instalada conserva su texto **Actualizar ahora**. Desde la candidata se usan los textos nuevos. No se alteró retroactivamente código cacheado de la 1.3.6 para cambiar su botón. Su primera transición usa el checkpoint de esa versión; las protecciones nuevas quedan disponibles al instalar C2.

El ciclo nativo de Service Workers puede activar un worker preparado cuando se cierran **todos** los clientes. Esto no provoca un reinicio de una app en uso. No se añadió un mecanismo alternativo para impedir ese comportamiento del navegador.

## 3. Protección del trabajo y contexto

core/updates/activity-guard.js observa transacciones IDB de escritura, solicitudes de escritura, GPS y formularios. Una operación activa o un formulario que no esté cubierto por un borrador seguro impide el checkpoint. No guarda, limpia ni migra datos de otros módulos.

- **TCH:** rechaza el checkpoint durante carga inicial, todo el procesamiento GPS, guardado de biometría/visita/pesaje, procesamiento de fotografías, exportación e importaciones pendientes. Después guarda su borrador real y puede restaurar la sesión biométrica tras la actualización. No se cambiaron fórmulas, Maestro ni IDB v3.
- **Producción:** conserva su bloqueo de importación/conciliación; protege PDF/PNG en vuelo y ediciones de formularios. Una edición legacy aplicada solo en memoria, marcada manualChanges, también bloquea abandonar/actualizar esa vista; no se considera persistida por existir en memoria.
- **Multiventana:** el rechazo de una sola ventana conserva el código anterior en todas. Los bloqueos de preparación existentes evitan interacción durante la activación.
- **Contexto:** se conservan selecciones múltiples cronológicas/históricas, finca/suerte, secciones abiertas y posición de Producción cuando siguen siendo válidos. El hash de ruta conserva el módulo; TCH restaura su biometría pendiente desde el borrador.

Las comparaciones IDB incluyen hashes completos y hashes de contenido. Se excluyen de la comparación de contenido únicamente dos marcas esperadas de TCH: draft:biometry:v1.value.updatedAt y app.value.remoteMasterCheckedAt. El checkpoint y una nueva consulta las actualizan legítimamente. No se afirma igualdad byte a byte cuando cambian esas marcas. Los marcadores QA de Riego, Insumos y Labores permanecen; no se ejecutaron escrituras en sus servicios reales.

## 4. Actualización automática de datos oficiales

Los seis archivos canónicos JSON/JS mantienen su contrato. Ahora se acompañan de **modules/produccion/data/integrity.json**, con schemaVersion, dataVersion y seis SHA-256. tools/production-integrity.mjs lo genera/verifica con LF de distribución. El generador del Centro Maestro también lo incluye.

Antes de promover una generación nueva, el SW verifica los seis SHA, equivalencia JSON/JS, estructuras, identidad de versión y que el manifiesto no haya cambiado durante la descarga. Escribe el conjunto y sus pruebas de integridad antes de mover el puntero activo. Un fallo de red, archivo ausente, hash, coherencia o persistencia conserva el conjunto anterior. Las lecturas offline verifican hashes de contenido almacenados.

La LKG heredada de 1.3.6 continúa siendo recuperable: no se borra para instalar C2. Una generación nueva de red exige el manifiesto. Cuando una generación heredada coincide exactamente con la publicación verificada, se refuerza su prueba de integridad sin cambiar versión ni valores. Si ya está verificada y no cambió de versión, las comprobaciones descargan solo el manifiesto pequeño; no vuelven a descargar todo el aforo cada minuto.

Cada página mantiene una generación coherente durante su vida. Otras páginas pueden preparar una nueva sin mezclar sus archivos con los ya cargados. La comprobación de datos consulta la última generación disponible; la vista se actualiza únicamente tras un checkpoint seguro y guardado de contexto. Se puede recargar **solo el iframe de Producción** para tomar los nuevos datos; no se reinicia el shell por una simple comprobación.

Una generación efectiva nueva sin cambio de código muestra **Datos oficiales CASUR actualizados · versión** una sola vez por versión/dispositivo. Una descarga sin aplicación, una comprobación de red o un bloqueo por edición no se anuncian como actualización completada. No hace falta importar Excel.

### Prioridad y recuperación local

| Situación | Regla implementada y probada |
|---|---|
| Usuario nuevo | Recibe automáticamente la generación oficial íntegra |
| Compartidos antiguos | Recibe el aforo oficial sin Excel; contexto y offline conservados |
| Generación personal anterior | Sigue prevaleciendo; aparece **Usar datos oficiales** |
| Edición o importación pendiente | No se sobrescribe; se conserva y permite reintentar cuando queda segura |
| Elección explícita de oficiales | Cambia la fuente de vista sin borrar ni modificar Producción/Maestro/archivo personal |
| Retorno a personales | **Usar generación local guardada** recupera la fuente anterior intacta |

Se probó una identidad personal anterior sintética sobre el snapshot aprobado, con valores agronómicos conservados, y una edición pendiente real en el editor. Ambos cambios de fuente conservaron el hash IDB. Las generaciones locales siguen siendo del dispositivo/origen; no se consideran sincronizadas entre dispositivos. Una edición legacy que solo exista en memoria permanece bloqueada hasta resolverse explícitamente: no se descarta para instalar.

## 5. Aforo oficial preparado y SHA

Directorio privado: **${data.path}**.

ZIP de datos local: **${data.archive}**.

**SHA-256 ZIP: \`${data.archiveSha256}\`**.

Los seis archivos son exactamente los de C1, sin cambios en datos ni fórmulas. El séptimo archivo es el manifiesto de integridad de distribución, SHA **\`${data.integritySha256}\`**. No se usa el bootstrap de Cloudflare.

| Archivo | SHA-256 |
|---|---|
${hashRows}

| Conciliación | Resultado |
|---|---:|
| Catálogo / inventariadas / activas | 1.053 / 1.046 / 995 |
| Molienda / Semilla | 948 / 47 |
| Área activa | 9.574,66 ha |
| Área válida molienda | 9.115,65 ha |
| Toneladas / TCH estimados | 563.187,97 t / 61,78 |
| Cobertura | 100 % |
| Histórico | 11.598 registros |

2003 sigue Semilla activa; 1927 Molienda con 430,50 t; finca 494 conserva 681,80 t. Suerte 99336: 8,91 ha, 65,00 TCH, 579,15 t, aforo 12-oct-2026 y cosecha 24-dic-2026. Se conservan diez discrepancias administrativas pendientes y las dos decisiones existentes.

El Histórico es exactamente igual fuera de su envolvente de versión, con origen 2026.09.06-siagri.1415. SHA del cuerpo: **\`${reconciliation.historyBodySha256}\`**. Se verificaron CRC del ZIP, los seis SHA y equivalencia con C1; ninguna fila fue corregida o reinterpretada. El dataset real de aforo y los perfiles están fuera del repositorio y de cualquier salida de hosting.

## 6. QA real en Chromium

**15 grupos finales PASS**, perfiles persistentes aislados, servidor GET efímero 127.0.0.1 bajo el subdirectorio original de Pages, peticiones externas bloqueadas y cero excepciones JS no esperadas. La candidata usa su SW oficial, no una preview. Las identidades 1.5.1/1.5.2 que aparecen en avisos son fixtures futuros locales para probar el mecanismo; no son publicaciones ni versiones reservadas.

| Ensayo final | Estado |
|---|---|
${rows}

Se comprobaron avisos reales a **1440×900, 1280×800 y 390×844**, botones, detección automática al volver online, aplazamiento, actualización multiventana, una recarga, contexto, selección múltiple, PDF/PNG reales y SHA, Histórico, reapertura fría y offline. Navegación online/offline por Producción, TCH, Riego, Insumos y Labores; los cinco recursos GEO conservan sus SHA.

El caso GPS mantiene la solicitud pendiente en el navegador QA: instalar se rechaza, no se pierde la medición y al finalizar la solicitud se instala y reaparece la sesión biométrica con técnico y tallos capturados. Los tests de GPS también conservan coordenadas aceptadas frente a lecturas rechazadas y respuestas tardías. No se acredita GPS/cámara físicos o Android/iOS instalado.

En F se simulan desconexión, recurso ausente, recurso corrupto y fallo de la **petición de activación antes de cambiar de controlador**. Se conserva el código íntegro anterior, el aviso permite reintentar y la versión reparada funciona offline. No se afirma revertir automáticamente un fallo interno del navegador después de haber sustituido su controlador; ese caso exige la estrategia de liberación correctiva con identidad nueva y código compatible ya prevista en C1.

Artefactos exportados: A-99336.pdf, A-99336.png y D-export-preserved.png; exports-check.json contiene formato, tamaño y SHA. No se cambiaron los exportadores aprobados ni la disposición del Cronológico. La biometría y los marcadores de persistencia son QA; no se abrieron perfiles personales reales ni se hicieron transacciones productivas en backends.

Los intentos anteriores del arnés se conservan con sufijo attempt. Se corrigieron carreras del ensayo: esperar un PNG aún activo de manera determinista, comparar IDB antes/después de la misma operación, aislar workers de fallos y esperar el Maestro antes de seleccionar una suerte. No se usan los FAIL antiguos como pruebas aprobadas. La última ejecución completa es **browser-delivery.log**, results.json y run-summary.json.

## 7. Pruebas y CI

| Check local del candidato | Resultado |
|---|---|
| Shell/GEO e integridad de generaciones | **78/78 PASS** |
| Producción | **22 controles + 208/208 PASS** |
| TCH | **Validación + 92/92 PASS** |
| Metadatos y manifiesto runtime | **PASS, 165 recursos** |
| Manifiesto de seis SHA | **PASS** |
| Política de release contra main y #45 aprobado | **PASS** |
| Datos C1, Histórico, SHA y CRC | **PASS** |
| git diff --check | **PASS** |

CI existente se amplió con tools/production-integrity.mjs; las demás suites siguen en CASUR Release Gate. **No se ejecutó CI remoto del nuevo HEAD**, porque no hubo push. El equivalente local está en gate/checks.json con códigos de salida. Las pruebas privadas de navegador/datos no suben aforo, perfiles ni logs con contenido restringido a Actions públicos.

La preparación de datos se mantiene en procesos con heap acotado, escritura ZIP progresiva y transporte HTTP de archivos; no se llevan ZIP ni snapshots completos por CDP/base64. El arnés final reporta maxRSS Node **${run.maxRSSKiB} KiB**; no es una medición de todos los procesos Chrome. Se mantiene la corrección de memoria C1.

## 8. Archivos modificados

Responsabilidades principales: pwa-update (experiencia), activity-guard (protección), sw.js (integridad/LKG), app.js (arranque/contexto), official-data-updates (fuente/actualización segura), bridge/contextos de Producción y TCH, metadatos, manifiestos, CI y pruebas. Los demás módulos y geometrías no cambian. Lista exacta respecto al HEAD aprobado:

${fileList}

Las instrucciones locales de TCH requieren ZIP completo del componente tras cambios; se entrega **${tchArchive}** solo para revisión local, no para reinstalar otra PWA. Sus fórmulas/dataset se conservan. El paquete oficial de datos se entrega por separado y no forma parte del patch de código.

## 9. Preparación para publicar

**Implementación y QA local C2: PASS. Merge, push de datos y publicación: BLOCKED por autorización final.**

Antes de publicar:

1. Revisar este informe y el commit/patch, y autorizar el SHA definitivo. C2 incluye el trabajo aprobado de #45 más estos cambios, sin modificar su HEAD aprobado ni las bases de PR.
2. Resolver/aprobar el contenido y canal de datos de la matriz C1. Aprobar la mecánica automática no autoriza por sí sola distribuir todos los campos del aforo a un navegador público.
3. Aprobar la integración acumulada y el control de salida. Main sigue activando GitHub Pages; no hacer merge como paso previo inocuo a pedir permiso de publicación.
4. Para el artefacto definitivo, verificar de nuevo los seis SHA y integrity.json, código/manifiesto, origen/scope, respaldo y recuperación monótona. Conservar versiones anteriores y generaciones personales; no proponer borrar cachés o reimportar Excel.
5. Publicar únicamente en fase posterior autorizada y comprobar commit de Pages, recursos por red, datos/casos especiales, actualización y offline. Si cambia el código o los datos después de esta entrega, actualizar hashes y repetir las pruebas afectadas.

No queda un fallo técnico local abierto en la ejecución final. La primera transición con texto 1.3.6 está aceptada por el usuario. La verificación física y los servicios productivos no se presentan como PASS. La autorización de distribución/versión final sigue pendiente; no se avanzó a producción.

## 10. Evidencias

- Informe, C2_CAMBIOS_CODIGO.patch, gate/checks.json, results.json, run-summary.json y browser-delivery.log.
- data-package.json, reconciliation-c2.json, paquete privado de siete archivos y sus SHA.
- C-new-offer-1440/1280/390.png; B-legacy-offer.png; capturas A y exportaciones verificadas.
- SHA256_EVIDENCIAS.json enumera evidencias finales seleccionadas; excluye perfiles y ensayos fallidos.

![Aviso PC](${out.replaceAll('\\','/')}/C-new-offer-1280.png)

![Aviso móvil](${out.replaceAll('\\','/')}/C-new-offer-390.png)
`;
fs.writeFileSync(path.join(out,'INFORME_C2_ACTUALIZACIONES.md'),report);
fs.writeFileSync(path.join(out,'delivery.json'),JSON.stringify({branch,head,base:'6d6c790fec35d53f75da6cca9ff483cd535575cb',appVersion:'1.5.0',productionVersion:'V1.7.0',tchVersion:'2.8.1',technicalStatus:'PASS',publication:'BLOCKED_PENDING_FINAL_AUTHORIZATION',files:changed,tchArchive,tchSha256:sha(fs.readFileSync(tchArchive)),patchSha256:sha(fs.readFileSync(path.join(out,'C2_CAMBIOS_CODIGO.patch')))},null,2)+'\n');
const selected=fs.readdirSync(out).filter(n=>/\.(md|json|png|pdf|patch|log)$/.test(n)&&!/(?:failure|attempt|first|second|third|fourth|fifth|browser-final|offer-timeout|progress|SHA256_EVIDENCIAS)/i.test(n));const hashes={};for(const n of selected)hashes[n]=sha(fs.readFileSync(path.join(out,n)));for(const n of fs.readdirSync(path.join(out,'gate')))hashes['gate/'+n]=sha(fs.readFileSync(path.join(out,'gate',n)));
fs.writeFileSync(path.join(out,'SHA256_EVIDENCIAS.json'),JSON.stringify({files:hashes,dataArchiveSha256:data.archiveSha256,tchArchiveSha256:sha(fs.readFileSync(tchArchive)),profilesIncluded:false},null,2)+'\n');
console.log('C2_DELIVERY_PASS',branch,head,'15 real browser groups; publication blocked');
