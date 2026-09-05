# CHANGELOG — Negocios de Caña CASUR

Formato: [versión] — fecha · resumen.

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
