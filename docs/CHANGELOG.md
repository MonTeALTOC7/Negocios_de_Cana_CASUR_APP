# CHANGELOG — Negocios de Caña CASUR

Formato: [versión] — fecha · resumen.

## [1.0.0] — 2026-09-05 · Hotfix 4.4.4: mutex real, migración agrupada, activación sin botón
### Problemas cerrados de 4.4.3 (revisión independiente)
1. `resolveGeneration()` usaba una ventana de coalescencia de **4 segundos**:
   si la primera resolución seguía en vuelo pasado ese tiempo, una segunda
   podía arrancar en paralelo. Se reprodujo: 09.07 se activaba primero y una
   resolución lenta de 09.06 (que había capturado el `activeVersion` previo
   al inicio) terminaba después y **retrocedía** `active` a 09.06.
2. La migración elegía el "mejor" candidato de `version`, `cronologico` e
   `historico` **por separado**. Una publicación parcial (p.ej. solo
   `version.json` de 09.06, sin su cronológico/histórico) ganaba esa
   comparación aislada y hacía perder una generación 09.05 completa y
   recuperable.
3. El SW nuevo no llamaba a `self.skipWaiting()` en `install`. La
   autoactivación (Hotfix 4.4.3) dependía de que el `app.js` YA actualizado
   enviara el mensaje `SKIP_WAITING`; un dispositivo todavía controlado por
   el `app.js` de 4.4.2 no lo hacía, y el SW nuevo se quedaba "esperando".
### Correcciones
- **Mutex real, sin caducidad** (`resolveGeneration`): `_pending` ahora se
  limpia ÚNICAMENTE en el `finally` de la propia resolución — nunca por
  tiempo. La función es síncrona hasta fijar `_pending` (sin `await` de por
  medio), así que el chequeo-y-registro es atómico frente al bucle de
  eventos: nunca hay dos `doResolveGeneration()` en vuelo a la vez, sin
  importar cuánto tarde la primera.
- **Segunda capa defensiva** (`promoteGenerationIfNewer`): justo antes de
  escribir el puntero `active`, se **relee** en ese instante y se **aborta**
  la promoción si la candidata no es estrictamente más nueva. La lectura y
  la escritura del puntero ocurren dentro de la misma resolución protegida
  por el mutex (misma exclusión mutua). Si la promoción es rechazada, se
  relee lo que haya quedado activo (`rereadActive`) en vez de servir la
  candidata descartada.
- **Migración agrupada por versión** (`tryMigrateLegacyBaseline`): los
  candidatos de `DATA_CACHE` y de las claves planas de 4.4.1/4.4.2 se
  agrupan por versión declarada; para cada versión (de más nueva a más
  vieja) se exige el **trío completo, válido y coherente**, y se usa la
  primera que califique. Una publicación parcial de una versión más nueva
  ya **no** hace perder una generación completa anterior recuperable.
- **`self.skipWaiting()` en `install`**, justo después de preparar el
  shell: el SW nuevo se activa automáticamente aunque el dispositivo siga
  controlado por un `app.js` de una fase anterior que no envíe el mensaje.
  `clients.claim()` (en `activate`) y el guard de una sola recarga en
  `controllerchange` (`app.js`) quedan intactos.
### Verificación — TODAS SIMULADAS (Node `vm` con el `sw.js` real; ninguna
prueba de navegador ni de dispositivo real en este hotfix)
- Resolución 09.06 lenta (>4 s) con una segunda solicitud a los 2 s: **una
  sola resolución de red** (3 fetches, no 6), ambas peticiones reciben el
  mismo resultado; una resolución posterior e independiente a 09.07 no
  retrocede jamás a 09.06.
- Ráfagas separadas por 5–6 s mientras la primera resolución (6 s) sigue
  pendiente: **una sola resolución efectiva**, todas las respuestas
  coinciden.
- Generación completa 09.05 + publicación parcial 09.06 en caché → migra
  **09.05** (ignora la parcial sin perder la completa).
- Generaciones completas 09.05 y 09.06 → migra **09.06** (la más nueva).
- `self.skipWaiting()` se invoca durante `install`, confirmado con un SW
  simulado "recién instalado" sin depender del `app.js`.
- Regresión completa de 4.4.3 repetida sobre el `sw.js` nuevo: downgrade,
  corrupción, incoherencia entre archivos, offline tras upgrade,
  concurrencia sin mezclar generaciones, fecha imposible/formato
  desconocido, y conservación de LKG + cachés ajenas en `activate` — **27
  aserciones, todas verdes**.
### No tocado
Administrador SIAGRI, builder de publicación, comparador de 15
modificaciones (Fase 4.3), Histórico como regla de negocio, TCH, branding,
otros módulos, los 6 archivos de datos reales (`modules/produccion/data/`
sigue en `2026.09.01-2627.1`, la publicación genuina de este entorno).

## [1.0.0] — 2026-09-05 · Hotfix 4.4.3: generaciones atómicas + migración segura + verificación real
### Problemas cerrados de 4.4.2
- `produccionDataGate()` promovía cada archivo por separado (podía servir
  `version.js` nuevo con `historico.js` antiguo).
- Con LKG vacía, ignoraba datos más recientes de `DATA_CACHE` (Fase 4.4) y
  aceptaba una publicación anterior del servidor como si fuera la primera.
- Actualizar los `.json` no actualizaba los `.js` usados al arrancar
  (podían quedar en versiones distintas offline).
- Sin LKG, una respuesta de red inválida pasaba tal cual al navegador.
- El comparador de versiones aceptaba fechas imposibles (p.ej. 30 de febrero).
- El toast de "actualizado" se mostraba sin comprobar la versión realmente
  cargada tras la recarga; `casurDataSynced:<version>` se escribía pero
  nunca se volvía a leer (sin guard real contra recargas repetidas).
### Rediseño: LKG por GENERACIÓN completa (sw.js)
- Nueva caché `casur_master_prod_lkg` organizada por generación:
  `gen/<version>/{version,cronologico,historico}.{json,js}` + un puntero
  `active` que solo se mueve cuando los 6 archivos de esa generación ya
  están escritos (transaccional: preparar todo → activar al final). Ante
  cualquier fallo de red/validación/persistencia, la generación anterior
  queda íntegra e intacta.
- Los `.js` se **generan desde el mismo JSON validado** (`window.CASUR_RELEASE`,
  `window.CASUR_REMOTE_CRONO`, `window.CASUR_REMOTE_HISTORICO`), garantizando
  coherencia total entre los 6 archivos por construcción — ya no se confía
  en/reenvía el `.js` publicado de forma independiente.
- `parseCasurDataVersion()` ahora valida **fecha real** (mes 1-12, día válido
  para ese mes vía `Date.UTC` + verificación de "rebote", año 2020–2100) y
  secuencia como entero seguro; formatos/fechas inválidas devuelven `null`
  y nunca se tratan como "más nuevo".
- `resolveGeneration()` coalesce ráfagas de peticiones casi simultáneas
  (~4 s) para no disparar 3 fetches de red por cada uno de los 6 archivos
  que Producción pide al arrancar, y para que todas usen la MISMA
  resolución (nunca mezclan generaciones).
- Migración seguraDesde 4.4.1/4.4.2: si no hay generación activa en el
  nuevo esquema, se buscan y validan publicaciones completas y coherentes
  en `DATA_CACHE` (network-first genérico de Fase 4.4) y en las claves
  planas antiguas de `casur_master_prod_lkg`; se usa la más reciente
  válida como línea base ANTES de aceptar la red. Nunca se borran esas
  cachés origen (no hace falta completarlo para conservarlas).
- Sin ninguna publicación válida recuperable (ni red ni LKG): la respuesta
  es un **fallo controlado (503)** — nunca se ejecutan datos inválidos.
### Módulo (casur-enhancements.js) y shell (app.js)
- `checkForDataUpdate()` simplificada: ya no revalida cronológico/histórico
  por su cuenta (esa validación vive ahora en el gate del SW); detecta si
  el SW resolvió una versión distinta, aplica un **guard real** contra
  recargas repetidas (`casurDataSynced:<version>` se escribe Y se consulta),
  y tras recargar **verifica que la versión cargada coincide con la
  esperada** antes de mostrar el toast de éxito o actualizar el marcador
  `casur_produccion_active_version` — nunca un toast falso.
- `prepareProduccionDataIfNewer()` (Home) simplificada a un único `fetch`
  que dispara la resolución completa en el SW; sincroniza el marcador local
  sin permitir jamás que retroceda.
- `parseCasurDataVersion()` con la misma validación de fecha real, duplicada
  en los 3 contextos (SW, módulo, shell) por ser un utilitario genérico de
  parseo, no lógica de negocio.
- `registerSW()` del shell activa automáticamente el Service Worker nuevo
  (`SKIP_WAITING`) sin exigir clic, y conserva la recarga única y sin
  bucles del shell al cambiar de controlador.
### Verificación — TODAS SIMULADAS (Node/jsdom con el código real vía `vm`;
no hay pruebas de navegador ni de dispositivo real en este hotfix)
- Migración desde `DATA_CACHE` (09.05) con LKG vacía y servidor en 09.01:
  conserva 09.05, también offline tras la migración.
- LKG activa en 09.05, "reinicio" (nuevo contexto SW, misma Cache Storage)
  con servidor inferior: los 6 archivos permanecen en 09.05, `.js`/`.json`
  coherentes.
- Publicación parcial (histórico 404), archivo corrupto (JSON inválido) y
  versiones incoherentes entre los 3 archivos: en los tres casos, **ninguna
  activación parcial** — se conserva la generación anterior íntegra.
- Actualización desde Home a 09.06 y pérdida de red antes de abrir
  Producción: los 6 archivos y el runtime usan 09.06, disponible offline.
- Ráfaga de 6 solicitudes concurrentes (como al arrancar Producción): todas
  resuelven la MISMA generación, sin mezclar ni retroceder.
- Fecha imposible (`2026.02.30`) y formato de versión desconocido: ambos
  rechazados, se conserva la versión activa.
- Versión cargada distinta de la esperada tras una recarga: sin toast
  falso, sin recarga repetida para el mismo intento.
- Activación del SW (`activate`): la LKG y una caché ajena (de otro módulo)
  sobreviven; solo se borra una caché maestra vieja fuera de la allowlist.
### Datos reales
- El ZIP sigue trayendo la publicación real vigente en este entorno,
  `2026.09.01-2627.1` (1053 suertes / 11598 filas de histórico). **No existe
  en este entorno ningún dataset auténtico `2026.09.05-siagri.1055`** — todas
  las referencias a esa versión en este hotfix son fixtures sintéticos de
  prueba (construidos a partir de copias del dataset real con un campo de
  versión distinto), usados exclusivamente para validar la lógica del gate.
  No se fabricó ni se incluyó ningún archivo falso como si fuera real.
### No tocado
Administrador SIAGRI, builder de publicación, comparador de 15
modificaciones (Fase 4.3), Histórico como regla de negocio, TCH, branding,
otros módulos.

## [1.0.0] — 2026-09-05 · Hotfix 4.4.2: Last Known Good real (blindaje en el SW)
### Hueco cerrado de 4.4.1
- Producción carga `data/version.js`/`cronologico.js`/`historico.js` por
  `<script src>` ANTES de que corra cualquier JS de comparación de versiones,
  y el marcador `casur_produccion_active_version` se sobrescribía con lo que
  esos archivos trajeran. Si un ZIP de código publicaba por error datos viejos,
  el runtime los cargaba igual y el anti-downgrade de 4.4.1 nunca alcanzaba a
  actuar (comparaba "remoto" contra un "local" que ya era el dato viejo).
### Solución: Last Known Good (LKG) en el Service Worker
- Nueva caché **`casur_master_prod_lkg`** (Cache Storage), a propósito **sin
  sufijo de versión de app** y agregada a `OWNED`: sobrevive publicaciones de
  código y cierres/reaperturas de la PWA (persistente en disco, no en memoria).
- Nuevo gate `produccionDataGate()` en `sw.js`, exclusivo para los 6 archivos
  `modules/produccion/data/{version,cronologico,historico}.{json,js}`:
  1) obtiene la versión remota (parseando el JSON o el `window.X={...};`);
  2) la compara contra la LKG con el mismo comparador robusto (fecha manda,
     no lexicográfico) usado en Fase 4.4.1;
  3) **remota superior y válida** (JSON con forma esperada, Sucuya=0,
     registros>0) → se sirve y se **promueve** como nueva LKG;
  4) **igual** → se sirve la red normalmente, sin tocar la LKG;
  5) **remota anterior, inválida o de formato irreconocible** → se **rechaza
     por completo**: el navegador recibe la respuesta de la **LKG**, nunca la
     de la red. `window.CASUR_RELEASE`/`CRONO_DATA`/`APP_DATA` jamás llegan a
     verse expuestos al dato viejo — la protección actúa **desde el primer
     byte de la red**, no después de que el JS del módulo se ejecute.
- Sin LKG previa (primer arranque de un dispositivo): se acepta la red como
  línea base si es mínimamente válida.
### Verificación (Node, cargando el `sw.js` real vía `vm`, con Cache Storage
persistente entre "reaperturas" simuladas — sin navegador)
- **Escenario obligatorio**: LKG=`2026.09.05-siagri.1055` establecida →
  GitHub publica por error `2026.09.01-2627.1` → tras "cerrar/reabrir" (nuevo
  contexto de SW, misma Cache Storage) → **versión servida = 09.05**,
  **cronológico servido = 09.05**, **histórico servido = 09.05**, **0
  downgrade**, LKG intacta (3 entradas, sin sobrescribir), **0 llamadas de
  red de más (sin loop)**. Sin parpadeo por construcción: el contenido viejo
  nunca llega al navegador.
- **Upgrade posterior**: publicado `2026.09.06-siagri.2000` (superior) → se
  sirve la red, se **promueve como nueva LKG**, y estando luego **offline**
  se sigue sirviendo `09.06` (disponible offline).
### No tocado
Administrador SIAGRI, comparador de 15 modificaciones (Fase 4.3), builder de
publicación, Histórico como regla de negocio, TCH, branding, otros módulos.
El anti-downgrade a nivel de módulo/shell (Fase 4.4.1) queda intacto como
segunda capa de defensa (ya no debería activarse en la práctica, porque el
SW impide que el dato viejo llegue siquiera a cargarse).

## [1.0.0] — 2026-09-05 · Hotfix 4.4.1: blindaje anti-downgrade de datos de Producción
### Protección anti-downgrade (comparador robusto, no lexicográfico)
- Nuevo comparador `compareCasurDataVersions(a,b)` (duplicado como utilitario
  genérico en `modules/produccion/js/casur-enhancements.js` y en `app.js` del
  shell — no es lógica de negocio SIAGRI, solo parseo de versión): interpreta
  los esquemas vigentes `AAAA.MM.DD-tag.NNNN` (`2026.09.05-siagri.1055`,
  `2026.09.01-2627.1`), compara primero por **fecha** y luego por el número
  final como desempate. Formatos no reconocidos devuelven "desconocido" y
  **nunca** se tratan como más nuevos (evita downgrade por formatos raros).
- `checkForDataUpdate()` distingue explícitamente **remota más nueva** (actualiza),
  **igual** (no hace nada) y **remota anterior** (**NO descarga, NO aplica, NO
  recarga**; solo `console.warn` de diagnóstico discreto, sin alarmar al usuario
  ni tocar la UI). Antes se comparaba con `!==`, lo que hubiera aceptado
  cualquier versión "distinta", incluida una más vieja publicada por error.
### Sincronización desde Home (preparación temprana, sin exigir abrir el módulo)
- El shell (`boot()`) llama a `prepareProduccionDataIfNewer()` al abrir la App
  Maestra: consulta `modules/produccion/data/version.json` (no-store) contra
  un marcador same-origin `localStorage['casur_produccion_active_version']`
  (que el propio módulo escribe en cada arranque). Si la publicada es
  **realmente más nueva**, precalienta `cronologico.json`/`historico.json` en
  la caché de datos del SW (network-first) — sin abrir el iframe ni tocar
  `CRONO_DATA` (eso sigue aplicándolo únicamente el propio módulo al abrirse,
  sin reconstruir nada). Si es igual/anterior/desconocida, no descarga nada.
- Anti-polling: guard de sesión de 3 minutos entre consultas desde el shell;
  si no hay marcador de versión activa conocida, no compara a ciegas.
### Evitar regresión de datos al publicar el ZIP de código
- README documenta que `modules/produccion/data/` es contenido **versionado
  de forma independiente** del código (VF54.6) y qué hacer/no hacer al
  publicar. La protección runtime (arriba) ya impide que un `version.json`
  antiguo empaquetado por error llegue a aplicarse en dispositivos con datos
  más nuevos.
### Verificación
- Comparador: **Node 9/9** (incluye el caso real: fecha manda sobre el tag,
  mismo día por secuencia, formatos desconocidos, cruce de año).
- Escenario real ocurrido (jsdom): activa `2026.09.05-siagri.1055` vs
  publicado por error `2026.09.01-2627.1` → **0 reloads, 0 downgrade,
  `CRONO_DATA` permanece en la versión 09-05, sin tocar el pill** (sin
  parpadeo). Caso inverso: activa `2026.09.01-2627.1` vs publicado
  `2026.09.05-siagri.1055` → validado, recarga controlada solicitada,
  tras el ciclo normal `CRONO_DATA` refleja los datos nuevos, histórico
  preservado, y offline posterior conserva la versión ya sincronizada.
### No tocado
Administrador SIAGRI, builder de publicación, comparador de 15 modificaciones
(Fase 4.3), Histórico como regla de negocio, TCH, branding, otros módulos.

## [1.0.0] — 2026-09-05 · Fase 4.4: Sincronización automática real de datos publicados
### SW raíz (único archivo tocado a nivel de caché)
- `modules/produccion/data/**` pasa de stale-while-revalidate a **network-first**
  (misma caché de datos `DATA_CACHE`, allowlist ya cubierta), igual que
  `/master/data/`. Con internet prioriza siempre la versión publicada; sin
  internet usa la última copia válida cacheada. Ya no puede servir
  cronologico/historico/version antiguos durante o después de una recarga.
### Sincronización automática (sin botón del usuario)
- `checkForDataUpdate()` reescrita: consulta `data/version.json` (no-store);
  si la versión difiere, **descarga y valida** `cronologico.json` e
  `historico.json` (no-store) ANTES de aplicar nada: JSON válido, Cronológico
  con registros, Histórico con registros, versión coherente entre los 3
  archivos, y **Sucuya (Cod 16) = 0**. Solo si todo pasa, recarga
  **exclusivamente el iframe de Producción** (no la App Maestra) — con guard
  de sesión para no repetir ni entrar en bucle. Si falla cualquier validación
  o no hay red: conserva el dataset anterior intacto y muestra
  discretamente "Sincronización pendiente"; nunca deja `CRONO_DATA` a medias.
- Se comprueba al abrir el módulo, al volver a foreground (`focus`), al
  recuperar conexión (`online`) y cada 5 min; sin loops (early-return si la
  versión ya coincide).
- Toast discreto una sola vez tras aplicar: "✓ Maestro de Suertes actualizado
  · {versión}". Mientras hay internet y la actualización puede aplicarse
  automáticamente, ya NO queda un rótulo permanente de "Nueva versión …".
### Verificación (jsdom, con mocks de fetch — sin navegador)
- Caso real: local `2026.09.01-2627.1` → publicado `2026.09.05-siagri.1055`
  con una Hac-Sue modificada → validado → recarga controlada solicitada →
  **`window.CRONO_DATA` refleja el cambio real** (no solo IndexedDB) →
  Histórico preservado (11598) → offline posterior conserva la versión ya
  sincronizada.
- Fail-safe: sin red desde el inicio, cronológico corrupto (0 suertes), y
  versión incoherente entre archivos → en los 3 casos: **sin recarga**,
  dataset anterior **intacto**, pill "Sincronización pendiente".
### No tocado
Administrador SIAGRI, comparador (Fase 4.3), builder de publicación,
Histórico como regla de negocio, TCH, branding, instalación PWA, otros
módulos, adaptador y puente `siagri_last` de Fase 4.

## [1.0.0] — 2026-09-04 · Fase 4.3: Resumen previo con comparación completa
- El resumen de "Actualizar Maestro de Suertes" ahora compara el **mismo conjunto de
  variables que el Administrador SIAGRI** (COMPARISON_FIELDS: Área, Variedad, # de corte,
  F. Siembra, F. Ult. Cte, Destino, Tenencia, Tipo de riego, # de riegos, Zona, TCH Z25/26)
  más **Estado** y **TCH estimado**, con la misma semántica (fecha Y-M-D, número con
  tolerancia, texto normalizado). Muestra **Sin cambios** y un **desglose por variable**.
- `baselineReportRows()` recupera del cronológico publicado todas esas variables.
- Verificado (Node 11/11): baseline 1053; dataset con 14 cambios de # de riegos + 1 de
  F. Siembra → **0 nuevas, 0 inactivadas, 15 modificadas, 1038 sin cambios, área sin
  variación**, desglose {# de riegos: 14, F. Siembra: 1}; idéntico → 0 modificadas.
- Solo cambia el resumen/contador previo: bridge, aplicación, Histórico, Producción, SW,
  manifest, TCH, Convertidor y branding intactos.

## [1.0.0] — 2026-09-04 · Fase 4.1: Bridge real SIAGRI → builder Producción → CRONO_DATA
### Corrección (completa el último tramo de Fase 4)
- **Bridge real en la copia de Producción** (`window.CASUR_APPLY_REPORT_ROWS(payload)`):
  recibe filas REPORTE y las pasa por el pipeline REAL `extractRecords → buildCronoData →
  compareData`, reemplazando el Cronológico runtime (`window.CRONO_DATA`) y actualizando la
  versión de DATOS (`window.CASUR_RELEASE`). NO duplica reglas. NO toca el Histórico (`APP_DATA`).
- **Consumo automático del overlay**: al abrir/recargar `modules/produccion/`, si existe
  `casur_master_data/produccion_current` (expuesto como `window.CASUR_MASTER_OVERLAY`), se aplica
  por el bridge sin volver a seleccionar Excel. (El overlay ya no queda sin consumidor.)
- **Baseline de la primera actualización**: `window.CASUR_GET_CURRENT_REPORT_ROWS()` en Producción
  y, en el shell, `baselineReportRows()` toma como base los datos publicados de Producción
  (1053 suertes) cuando aún no hay `produccion_current` → ya no muestra "0 anteriores".
- **Alias `Cod`** añadido al mapa de Producción para reconocer la columna del Convertidor.
- **Instalación standalone de Producción eliminada**: `beforeinstallprompt`/`appinstalled`/
  `installApp` neutralizados; FAB y tarjeta ocultos. Solo instala "Negocios de Caña".
- **Paquete solo datos**: usa `dataForScope()` (=CRONO_DATA aplicado) + `appForScope()` (histórico
  intacto) + `CASUR_RELEASE` (nueva versión); los 6 archivos reflejan el nuevo Cronológico.
### Verificación (jsdom, builder REAL de Producción — sin navegador)
- Antes: `CRONO_DATA.global.suertes = 1053`. Baseline API = 1053.
- Aplicar payload REPORTE (headers del Convertidor) → **Después: CRONO_DATA refleja el cambio**
  (hac 999, área 33.33, suerte 01 = 11.11), versión de datos = `2026.09.09-siagri.test`.
- **Histórico intacto** (`APP_DATA` sin cambios; 1.34 MB). Paquete: `cronologico.json` contiene
  el cambio; `version.json` la nueva versión; `historico.json` preservado.
- Adaptador (Fase 4) sigue **15/15** en Node; Sucuya=0 (validado en adaptador y en `extractRecords`).

## [1.0.0] — 2026-09-04 · Fase 4: Maestro de Suertes / Producción (integración + adaptador)
### Integración de Producción
- Integrada la versión real **VF54.6** de `Cronologico_Historico_260726_CASUR_PROGRAMADOR`
  en `modules/produccion/` (copia; el repositorio fuente no se tocó). Monolito de ~11 MB
  (`index.html` 5.5 MB inline). Reemplaza el placeholder. Se ejecuta en su iframe aislado.
- Neutralizado en la copia: registro de Service Worker (`index.html`) y `<link rel="manifest">`;
  eliminados `sw.js` y `manifest.webmanifest`. Un solo SW raíz, una sola PWA.
- Datos preservados: `data/cronologico.js/json`, `data/historico.js/json`, `data/version.js/json`
  (contrato intacto: `CASUR_REMOTE_CRONO`, `CASUR_REMOTE_HISTORICO`, `CASUR_RELEASE`).
  Cronológico 1053, **histórico 11598 filas** (no se destruye). Versión **datos**
  `2026.09.01-2627.1` ≠ versión **código** VF54.6.
### Adaptador SIAGRI → Maestro de Suertes
- Nuevo `master/adapters/production-data-adapter.js`: toma el dataset YA validado del
  Convertidor y lo mapea al formato hoja **REPORTE** (el mismo puente que Producción usa
  para importar el Excel oficial), reutilizando el mapeo `toMasterRow` del Convertidor.
  NO reimplementa reglas de edad/estado/TCH/renovación/zonas/áreas/estadísticas.
- Validaciones antes de aplicar: **Sucuya (Cod 16) = 0**, llave `Hac-Sue` presente,
  duplicados de llave, integridad de campos críticos (Hacienda/Suerte/Área/Zona).
- Resumen antes de aplicar (no silencioso): registros anteriores/nuevos, nuevas suertes,
  modificadas, inactivadas, área anterior/nueva, Sucuya excluida, fecha, versión de datos.
- Nuevo `core/shared-data/master-store.js`: IndexedDB **`casur_master_data`** (no toca bases
  antiguas). El Convertidor publica su dataset validado (puente `siagri_last`, no invasivo).
  "Actualizar Maestro de Suertes" (Centro Maestro) corre el adaptador, muestra el resumen,
  y al confirmar guarda `produccion_current`. Producción expone un overlay no destructivo
  (`window.CASUR_MASTER_OVERLAY`) para ingerir esas filas por su propio builder.
- "Generar paquete datos GitHub": se genera con el propio Centro Maestro de Producción
  ("Paquete solo datos para GitHub"), que produce los 6 archivos (`cronologico.*`,
  `historico.*`, `version.*`) ya con los datos aplicados. Mecanismo de actualización remota
  por `data/version.json` preservado.
### UI Centro Maestro
- Nueva tarjeta "Maestro de datos · SIAGRI → Suertes" con estado (Maestro SIAGRI / Maestro de
  Suertes · datos) y acciones "Actualizar Maestro de Suertes" y "Generar paquete datos GitHub".
### Verificación
- Adaptador verificado en Node: **15/15** (mapeo REPORTE, Sucuya=0, duplicados, integridad,
  resumen prev/nuevas/modificadas/inactivadas/área, versión de datos distinta).
- Producción verificada estáticamente: manifest/SW inactivos, `data/*.js` cargan, estructura
  intacta, Sucuya excluida en el dataset publicado, histórico 11598 conservado.
- **Pendiente de validación en dispositivo** (por inestabilidad del entorno de pruebas y por
  requerir orquestación entre iframes): flujo completo en navegador Actualizar→aplicar→
  Producción consume overlay→generar paquete, y smoke E2E de Convertidor/TCH.

## [1.0.0] — 2026-09-04 · Fase 3: Estimador TCH (integración técnica)
### Integración
- Integrada la versión real **2.7.2** de `TCH_BioEstimador_Rfotos` en `modules/tch/`
  (copia; el repositorio fuente no se tocó). Reemplaza el placeholder.
- Neutralizado en la copia: bloque completo de Service Worker (`register` + auto-reload
  por `controllerchange`) en `js/app.js`, y `<link rel="manifest">` en `index.html`.
  Eliminados de la copia `sw.js` y `manifest.webmanifest`. Un solo SW raíz, una sola PWA.
- Se ejecuta en su propio **iframe** (patrón de aislamiento). Acceso: tarjeta del home.
- Iframe `allow="camera; geolocation; clipboard-read; clipboard-write; fullscreen"`.
  Se retiró `downloads` por no ser feature válida de `allow`; las descargas del iframe
  (mismo origen, sin `sandbox`) siguen funcionando. No se introdujo `sandbox`.
### Preservado (sin cambios de negocio)
- IndexedDB `casur-estimador-tch` **v3** y 7 stores (master, biometries, weighings,
  harvests, visits, audit, settings). Sin `deleteDatabase` ni migración destructiva.
- Maestro autocargado desde `./data/suertes.json` (1053) y `./data/productores.json`
  (rutas relativas, sin rutas absolutas rotas).
- Fotos: `#visitCameraFile`/`#visitGalleryFile` → File/Blob → `canvas.toBlob` →
  `{blob,sizeBytes}` en `visits`; recuperación por `createObjectURL`.
- GPS `getCurrentPosition` (éxito/error intactos). Fecha del estimado y fórmulas TCH/
  biometría (TCHe-mm-m) sin alterar. PNG etiquetado (canvas) y Excel (`./vendor/xlsx.bundle.js`).
### Verificación
- Micro-pruebas por inspección de código: IndexedDB, maestro/rutas, Blob/fotos, GPS,
  PNG, Excel, SW/manifest → OK. Fase 2 (Convertidor) intacta (archivos y SW raíz sin cambios).
- Cámara física, galería Android, permiso/coordenadas GPS reales, compartir y PWA
  instalada → **requieren validación en dispositivo real** tras publicar.
- Nota de entorno: la verificación E2E en navegador no se ejecutó por inestabilidad del
  entorno de pruebas (servidores en background y sesiones Playwright largas se cortaban).

## [1.0.0] — 2026-09-03 · Fase 2: Convertidor SIAGRI + textos del shell
### Textos y nombres (solo presentación)
- Encabezado superior → "Departamento de Negocios de Caña" (identifica el área responsable).
- Texto corporativo (eyebrow) → "Compañía Azucarera del Sur, S.A." (se quitó el prefijo "CASUR").
- Título principal del home → "Negocios de Caña CASUR".
- EM-CT: tooltip "Edgardo Madrigal · Carlos Tijerino · Desarrollo" (sin cambios visuales).
- Nombres de módulos (isotipos sin cambios): Producción→"Maestro de Suertes";
  "TCH y Visitas"→"Estimador TCH"; "Riego Ejecutado"→"Riegos Ejecutados";
  "Seguimiento de Insumos"→"Insumos Entregados Productores"; "Inventario"→"Inventario Pansaco";
  "Seguimiento de Labores"→"Seguimiento de Labores · Prefacturas" (regla Nómina/Prefactura intacta).
- Manifest/PWA sin cambios: sigue instalándose como "Negocios de Caña". Repositorio sin renombrar.

### Fase 2 — Convertidor SIAGRI (integración real)
- Integrada la versión **1.1.0** de `Convertidor_Cronologico_Oficial` en `master/convertidor/`
  (copia; el repositorio fuente no se tocó).
- Se **neutralizó** su registro de Service Worker (`js/app.js`) y su `<link rel="manifest">`;
  se eliminaron de la copia `service-worker.js` y `manifest.json`. Un solo SW raíz, una sola PWA.
- Se ejecuta en su propio **iframe** (patrón de aislamiento). Acceso: Home → Centro Maestro →
  contraseña `15102171011` → Administrador SIAGRI. No aparece como tarjeta del home.
- Conservado: carga Excel SIAGRI, procesamiento local, validaciones, comparación/conciliación,
  generación Excel, hojas **REPORTE** y **Productores**, reglas de edad/renovación, `Hac-Sue`,
  Tipo de Riego, registros inactivos, auditoría, exportaciones, sin backend, librerías.
- Almacenamiento `casur-master-validations-v1` **sin renombrar** (persistencia verificada).
- **Regla Sucuya (Cod. 16)**: intacta. Prueba de regresión explícita en
  `docs/regression/` → resultado **Cod 16 = 0** en el Excel exportado.

### Verificado (Fase 2)
- Textos/nombres nuevos en home; Convertidor real cargado en iframe; Sucuya código 16 = 0;
  export con REPORTE + Productores; persistencia tras reabrir; offline del Convertidor;
  **un solo Service Worker** (raíz); **una sola PWA** (0 manifest en el iframe);
  responsive móvil/PC; consola limpia (shell + iframe). Sin regresiones.

## [1.0.0] — 2026-09-03 · Fase 1.2: Identidad visual definitiva
### Cambiado (solo visual, sin tocar funcionalidad)
- **Nombre visible** de la app → "Negocios de Caña" (header, masthead, `<title>`).
- **Instalación PWA** como "Negocios de Caña" (`name` y `short_name` del manifest).
- **EM-CT**: significado oficial *Edgardo Madrigal – Carlos Tijerino*; tooltip
  "Edgardo Madrigal · Carlos Tijerino · Desarrollo"; visualmente sigue mostrando "EM-CT".
- **Isotipos/mini-logos por módulo** (familia gráfica del ecosistema, no pictogramas lineales):
  - Producción: caña + barras + curva de rendimiento (analítica).
  - TCH y Visitas: cámara/lente con hoja de caña + regla de aforo + indicador de dato.
  - Riego Ejecutado: gota con brote de caña + surcos de riego.
  - Seguimiento de Insumos: bidón agrícola + hoja + gota + sello de trazabilidad.
  - Inventario: emblema oficial de **Pansaco** reenmarcado a la familia (identidad conservada).
  - Seguimiento de Labores: tractor + trabajador + caña/surcos (mecanizado + manual).
- Tarjetas del home muestran los mini-logos a sangre; resto del dashboard sin cambios.
### Recursos gráficos creados
- `shared/assets/logos/{produccion,tch,riego,insumos,labores}.svg` (fuente) + `*-512.png`.
- `shared/assets/logos/inventario.png` (Pansaco reenmarcado) + `inventario-512.png`.
### Verificado
- Nombre visible e instalación "Negocios de Caña"; tooltip EM-CT correcto; 6 mini-logos
  cargan (naturalWidth>0); responsive móvil/PC; consola limpia; **Service Worker sin cambios**;
  sin regresiones en iframe, Centro Maestro (contraseña) ni navegación.

## [1.0.0] — 2026-09-03 · Fase 1.1: Branding CASUR y acceso
### Añadido / cambiado
- **Icono oficial de la app**: se adopta el logo oficial "CASUR · Negocios de Caña"
  (círculo con caña, sol, apretón de manos y panel de datos) para todos los iconos PWA
  (192/512, maskable, favicon, apple-touch). El emblema se usa como marca del encabezado.
- **Branding corporativo**: paleta basada en los colores del logo CASUR (verde `#25A63F`,
  azul `#159AD6`, lima `#8CC63F`, sol `#F2C94C`) manteniendo el fondo marino premium.
- **Logo CASUR** (transparente) integrado en el masthead.
- **Encabezado corregido**: eyebrow → "CASUR · Compañía Azucarera del Sur, S.A.";
  título → "Negocios de Caña CASUR".
- **Distintivo EM-CT**: insignia animada (pulso + brillo) junto al encabezado, inspirada en
  la app de Cronológico.
- **Centro Maestro protegido por contraseña** (`15102171011`): al entrar pide contraseña;
  correcta = acceso, incorrecta = bloqueo; botón "Bloquear" para salir; al bloquear vuelve a
  pedirla. Barrera de interfaz (repositorio público aceptado, sin backend de auth).
- **Iconos por módulo específicos**: Producción (caña + análisis de datos), TCH (cámara con
  hoja), Riego (gota con brote), Insumos (saco con hoja), Inventario (bodega con caja, en
  continuidad con Pansaco), Labores (tractor).
### Verificado
- Sin regresiones: navegación, iframe de módulo, SW (preserva cachés ajenas), offline con
  logo cacheado, área privada. Consola limpia. Responsive móvil y PC.

## [1.0.0] — 2026-09-03 · Fase 1: Shell
### Ajustes tras revisión de Fase 1
- **SW · fallback de navegación por módulo:** una navegación offline dentro de
  `modules/<id>/`, `master/<id>/` o `private/<id>/` cae en el `index.html` de ese módulo, no
  en el shell maestro (evita que la App Maestra se cargue dentro de un iframe). Se mantiene la
  regla de que el SW solo elimina cachés `casur_master_*`.
- **Área privada fuera de la navegación normal:** se quitó "Privado" de la barra inferior. El
  acceso al control privado es desde **Centro Maestro**.
- **PIN protegido:** el PIN no puede cambiarse sin desbloquear antes el área privada. Sigue
  siendo solo una barrera de interfaz (repositorio público, sin cifrado, sin Supabase).

### Añadido
- Shell de la App Maestra: home con tarjetas de módulo, navegación inferior, header con estado.
- PWA instalable: `manifest.webmanifest` único, iconos 192/512 + maskable + favicon (identidad
  CASUR basada en el icono de Riego).
- **Service Worker único raíz** con limpieza por *allowlist* (nunca borra cachés de módulos) y
  estrategias por patrón (network-first shell/datos, cache-first assets hasheados, passthrough
  Supabase).
- Registro de módulos declarativo (`core/module-registry`) — la UI se genera desde la config.
- Centro Maestro: mostrar/activar módulos, estado del sistema, versiones, gestión de PIN.
- Área privada con gate por PIN (separación lógica; ver aviso de seguridad).
- Router por hash (compatible con subdirectorio de GitHub Pages) + `404.html` de respaldo.
- Módulos como marcadores de posición (Fases 2–8).
- Documentación: README, ARCHITECTURE, INTEGRATION_AUDIT, MODULES, DEPLOY_GITHUB_PAGES, TEST_PLAN.

### Verificado (Fase 1)
- Carga del shell, navegación, apertura de módulo en iframe, regreso a inicio.
- Instalabilidad PWA (manifest + iconos + SW).
- Modo offline del shell.
- **El SW maestro preserva cachés de otros módulos** (regresión crítica C1/C2 superada).
- Consola sin errores ni warnings. Responsive móvil y PC.

### Pendiente
- Verificación de instalación en dispositivos reales Android/PC (requiere el propietario).
- Integración de módulos reales (Fases 2–8).

## [0.0.0] — 2026-09-03 · Fase 0: Auditoría
### Añadido
- `INTEGRATION_AUDIT.md`: auditoría directa de los 7 repositorios fuente.
- `ARCHITECTURE.md`: propuesta de arquitectura (iframe + SW único), migración, riesgos,
  plan de SW, privacidad y pruebas.
