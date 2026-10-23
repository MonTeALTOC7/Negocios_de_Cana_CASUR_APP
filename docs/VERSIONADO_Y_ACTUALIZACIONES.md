# Versionado y actualizaciones CASUR

## Política global

`core/versions/versions.js` es la autoridad del shell y de cada módulo. App Maestra
y Producción se liberan como 1.3.5 / V1.5.1: PATCH autorizado para corregir la
activación insegura, coherencia de código instalado y procedencia de fechas.
TCH 2.8.0, Riego, Insumos, Inventario, Labores, Convertidor y Conciliación conservan
sus números. Histórico V2.9 identifica una funcionalidad, no otro módulo.

- PATCH: corrección compatible, textos, visual menor u optimización interna.
- MINOR: función o capacidad nueva significativa compatible.
- MAJOR: ruptura de contrato/migración incompatible, no tamaño visual.
- Datos SIAGRI/GEO: generación independiente; no incrementar software por datos.
- Un cambio compartido se identifica con versión del shell. Revisar en el PR
  los contratos de módulos consumidores y justificar si también cambian.
- Los identificadores legacy (`v6`, `0.7.x`) no se normalizan automáticamente.
  Su siguiente publicación requiere decisión explícita de migración a SemVer.

El registro de una liberación es una instantánea (sin getters al número actual).
`MODULE_RELEASES` contiene las instantáneas; `RELEASE_CATALOG` combina cada id y
versión vigente con su historial, sin inventar entradas de módulos no liberados aquí.
Cada entrada nueva contiene id, versión, PATCH/MINOR/MAJOR, novedades y fecha
oficial cuando exista; `publishedAt: null` significa pendiente/no acreditada.
No usar el reloj del dispositivo ni la fecha del commit como fecha publicada.
Agregar historial por módulo cuando éste tenga su siguiente liberación;
no inventar fechas o notas de módulos legacy.

## Preparar una liberación

1. Definir alcance y clasificación en PR. Cambiar únicamente los identificadores
   afectados en la fuente canónica y agregar sus instantáneas de novedades.
2. `node tools/sync-versions.mjs --write`: sincroniza SW, HTML del shell,
   registro, VERSION/package/README y versión de exportación/embebidos de Producción.
3. `node tools/runtime-assets.mjs --write`: manifiesto de SHA-256 de todo código
   local ejecutable e imágenes/fuentes locales. Excluye datos, herramientas, pruebas y SW (evita autorreferencia).
   Normaliza CRLF a LF únicamente para hash; no altera los archivos originales.
4. `node tools/sync-versions.mjs` y `node tools/runtime-assets.mjs` deben pasar.
   Para módulos con derivados propios, añadir su sincronizador al cambiar su versión.
5. `node tools/check-release-policy.mjs BASE_SHA`: distingue código shell/módulo,
   tests/docs y datos. Rechaza falta de incremento e informa rutas y responsable.
   Excepciones requieren SHA base exacto, owner, lista explícita de rutas y motivo
   auditable en `release-exceptions.json`; revisión humana obligatoria en PR.
6. Regresiones, ciclo SW real, offline y QA visual. No desplegar antes de aprobar.
   La CI verifica manifiesto, versiones y política contra la base del PR.

## Arquitectura de actualización

El cliente `core/updates/pwa-update.js` consulta al SW waiting por MessageChannel.
Sólo anuncia listo después de instalación completa. La instalación verifica hashes
de todos los HTML/JS/CSS locales (incluidos módulos no abiertos), prepara shell,
recursos usados y conserva datos cacheados. Un error de red/hash rechaza instalación;
no toca al worker activo. El código instalado queda cache-first/pinado hasta activar,
incluidas URLs con query. Datos SIAGRI siguen su gate de generaciones LKG y red primero.
GEO mantiene su política independiente; no se requiere red GEO para actualizar código.

Actualizar ahora inicia un acuerdo acotado con todas las ventanas de ese SW:
diálogo modal de protección → checkpoint existente del iframe → confirmación.
Timeout/rechazo o nueva ventana detectada cancela sin activar. Ventanas directas o
antiguas sin protocolo también bloquean: guardar y cerrarlas antes de reintentar.
Un módulo sin bridge conserva el contrato existente `unsupported`; no se puede
afirmar que un formulario arbitrario sin bridge queda persistido. Formularios nuevos
que requieran protección deben implementar CASUR_MODULE_BRIDGE.
Con éxito: skipWaiting, claim, controllerchange y una recarga por ventana preparada.
Se confirma la versión del controlador frente al código realmente cargado.

Más tarde conserva un control discreto recuperable, con preferencia por versión en
sessionStorage; no vuelve a expandirlo por cada comprobación. Comprobación al abrir,
reconectar o volver a la pestaña después de 5 minutos, sin sondeo a GitHub.
Al cerrar todas las ventanas el navegador puede activar waiting naturalmente.

### Transición 1.3.4 → 1.3.5

1.3.4 no sabe pedir checkpoint ni posponer. El SW nuevo ignora su SKIP_WAITING
legacy: la transición segura requiere guardar trabajo y cerrar todas las ventanas
CASUR, después reabrir. El cliente viejo puede mezclar recursos por su estrategia
previa; no se puede corregir retroactivamente. No prometer el aviso nuevo en 1.3.4.
1.3.5 confirma instalación al reconocer cachés anteriores. El ciclo con consentimiento
se verifica desde 1.3.5 hacia 1.3.6 **simulada sólo en servidor de pruebas**.

### Conservación y rollback

No se borra IndexedDB, localStorage, LKG ni caché de usuario. Se conservan cachés
de código anteriores para no invalidar ventanas abiertas; esto consume espacio.
No se introduce poda automática en este hotfix. GEO sólo usa su poda existente de
generaciones completas. Cuota insuficiente rechaza instalación y mantiene el activo.
Rollback: nueva liberación PATCH aprobada que restaure el código anterior con
versiones/manifiesto coherentes; nunca reutilizar un número ya publicado ni limpiar
datos para forzar actualización. No migrar esquemas al revertir sin autorización.

## Fecha de Cronológico efectivo

Única fuente: `window.CRONO_DATA.meta` del objeto aplicado, también si procede del
gate LKG u overlay. `CASUR_RELEASE` remoto puede anunciar datos no adoptados y NO
se usa para la fecha. Publicación válida tiene prioridad sobre generación válida;
la generación se identifica expresamente en Novedades. Calendario inválido o datos
sin ambas fechas: `Cronológico: fecha N/D`. `importedAt` es sólo trazabilidad.
Importar no hereda `publishedAt` ni inventa `generated` con la fecha actual.
Preparar ZIP no cambia los metadatos del dataset en uso.
Eventos efectivos/importación/overlay, load, focus, visibility y fallback visible
de 120 segundos actualizan el encabezado. Una promoción LKG remota no cambia una
vista ya cargada: se refleja cuando el módulo adopta esa generación (recarga).

## Reproducir QA

- `node --test tests/*.test.mjs`
- `npm test --prefix modules/produccion`
- `npm run validate --prefix modules/tch` y `npm test --prefix modules/tch`
- `CASUR_QA_OUT`, `CASUR_CHROME_EXECUTABLE` y Playwright externo en `NODE_PATH`:
  `node tools/qa-pwa-updates.cjs`. Levanta origen aislado efímero, sirve el commit
  real 1.3.4 y código actual, simula 1.3.6 sin cambiar fuentes ni datos oficiales.
- Exportaciones: herramientas QA existentes de Producción, con `CASUR_PREVIEW_URL`
  y `CASUR_QA_OUT` fuera del repositorio.

Limitaciones: Chromium de escritorio con viewport móvil no acredita instalación
física Android/iOS. Servicios externos/cartografía requieren su conectividad usual.
