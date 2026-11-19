# Hotfix PWA V1.6.1 — «Versión instalada no disponible» (Issue #59)

PATCH del shell sobre `main` `2b8bac5` (V1.6.0). Módulos, datos oficiales, motores, GIS e iconografía **no cambian**.

## Diagnóstico

El texto «Versión instalada no disponible.» lo genera `sw.js → bundleRuntime` cuando `pinnedManifest()` devuelve `manifest=null` (HTTP 503 de texto plano, sin interfaz).

**Mecanismo reproducido en Chromium real** (`tools/qa-pwa-recovery.cjs`, escenario A):

1. Perfil con la 1.5.6 instalada cuya instantánea local (`casur_master_shell_v1.5.6` + `casur_master_release_manifests`) ya no existe.
2. Con ese estado el worker 1.5.6 responde 503 a toda navegación y **tampoco contesta** `CASUR_UPDATE_INFO` (su `currentManifest()` devuelve `null` y el manejador lanza una excepción).
3. El `install` de 1.6.0 exigía esa respuesta y la instantánea anterior: esperaba 15 s y fallaba con `Active release unavailable` (capturado con una copia instrumentada). El worker 1.6.0 nunca llegaba a `waiting`, el navegador reintentaba y fallaba otra vez: **bucle sin salida**, el worker roto no se reemplaza.

**Causa raíz:** acoplamiento del `install` a la existencia del snapshot anterior (más 503 plano sin recuperación). **Hipótesis no comprobada:** por qué ese snapshot falta en el perfil Brave afectado (limpieza parcial del almacenamiento, instalación interrumpida u otra). Ningún SW anterior poda cachés de shell (`caches.delete` solo toca staging y GEO inactivo). No hay Brave en el entorno de QA; se probó Chromium, que comparte el motor de Service Workers.

## Cambios (`sw.js`, versión 1.6.1)

| Área | Cambio |
|---|---|
| `install` | El predecesor se consulta solo para **conservar** lo que pueda demostrar (anclajes de clientes, módulos preparados). Si no responde, responde mal o no tiene manifiesto, se instala igualmente el core nuevo **ya verificado por SHA-256**; no se inventa estado. Un downgrade (`active` con versión mayor) se rechaza **antes de escribir** nada. No se llama a `skipWaiting`. |
| Recuperación | Con el manifiesto ausente, `autoRecoverManifest()` lo descarga de la red y solo lo acepta si coincide `appVersion`, `releaseId` **y** el `releaseId` es el hash de su propio contenido. Luego prepara el core por hashes. Otra release o hashes alterados → rechazado y sin persistir. Pausa de 10 s tras fallos no relacionados con la red. Una release anterior sin snapshot **nunca** se sustituye por código de la actual. |
| Navegación | Sin manifiesto recuperable, en lugar del 503 plano se sirve una pantalla (HTTP 503, `no-store`, sin recursos externos) con **Reparar esta versión**, **Reintentar** y **Re-registrar el servicio de la app**. Todo manual: no hay recargas automáticas ni bucles. |
| Reparación voluntaria | Mensaje `CASUR_REPAIR_RELEASE`: re-obtiene y verifica el manifiesto de esta release y re-prepara el core (reutiliza si es íntegro, re-descarga si no). |
| Re-registrar | Verifica conexión con `registration.update()` y da de baja **solo** el registro de este scope. Por el estándar el registro se retira al cerrar todas las ventanas; la app se registra de nuevo al reabrirla. No toca CacheStorage, localStorage ni IndexedDB. |
| Mensajes | `CASUR_UPDATE_INFO` y `BUNDLE_STATUS` ya no fallan con manifiesto ausente (informan la identidad intrínseca del worker). No se crean cachés «fantasma» de versiones ausentes. |

Se conservan: checkpoint multiventana, pines por release, LKG de Producción, hashes de datasets, offline y `skipWaiting` solo tras el checkpoint.

## Qué NO hace

* No borra cachés, localStorage, IndexedDB ni aplica *Clear site data*.
* No sirve código sin verificar ni acepta manifiestos de otra release.
* **Perfiles ya afectados:** el worker roto sigue sirviendo su 503 hasta que se cierren **todas** las ventanas/pestañas de la app. Con 1.6.1 publicada, el worker nuevo queda instalado en espera y se activa en la siguiente apertura; no se fuerza `skipWaiting` porque no se puede saber si hay trabajo sin guardar en otras ventanas.
* Rollback por reescritura de versión (publicar un `sw.js` con versión menor) queda bloqueado en clientes con la mayor instalada; corregir hacia adelante.

## Pruebas

* `tests/sw-release-recovery.test.mjs` (SW real en `vm`): `manifest=null` en navegación y sub-recursos, recuperación online de la misma release (con core íntegro y sin core), offline y vuelta de la red, manifiesto de otra release / otra versión / hashes alterados / sin conjuntos, core corrupto, cliente antiguo con y sin snapshot, reparación voluntaria (online/offline/otra release), upgrade con snapshot ausente (worker mudo, malformado, sin manifiesto), upgrade con snapshot presente, downgrade, integridad del core nuevo, instalación nueva e invariantes (sin `caches.delete` extra, sin `skipWaiting` extra).
* `tools/qa-pwa-recovery.cjs` (Chromium real, escenarios A–E): reproducción del incidente con 1.6.0 y corrección con 1.6.1, datos centinela (localStorage, IndexedDB, caché de otro módulo) intactos.
