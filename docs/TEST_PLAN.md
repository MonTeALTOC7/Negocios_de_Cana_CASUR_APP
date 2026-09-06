# TEST_PLAN.md — Plan de pruebas y checklist

## Fase 1 — Shell (estado: verificado automáticamente)
- [x] Carga del shell (online y offline)
- [x] Navegación inicio ↔ módulo ↔ regreso
- [x] Apertura de módulo en iframe aislado
- [x] Centro Maestro: 8 módulos, interruptores, estado, versiones, PIN
- [x] Área privada: gate visible, desbloqueo con PIN correcto, bloquear
- [x] Instalabilidad PWA (manifest + iconos + SW)
- [x] **SW maestro NO borra cachés de otros módulos** (regresión crítica C1/C2)
- [x] Consola sin errores ni warnings
- [x] Responsive móvil (390px) y PC (1200px)
- [ ] Instalación en dispositivo real Android (propietario)
- [ ] Instalación en Windows/PC real (propietario)

## Regresión por módulo (Fases 2–8)
### Producción
- [ ] Submódulos, cronológico, histórico, análisis, gráficos, exportación, selección múltiple.
### TCH
- [ ] Abrir → crear biometría → guardar → **foto grande** → visita → reiniciar → **persiste**.
### Riego
- [ ] Datos, filtros, importación, persistencia, Supabase online.
### Insumos
- [ ] Importar SIAGRI, Resumen/Explorar/Insumos/Productores/Madurante/Admin, exportación.
### Inventario
- [ ] Lectura, entrada, salida, **realtime**, offline (outbox), reconexión, sincronización.
### Labores
- [ ] Manual, mecanizada, filtros, productor, suerte, aplicación, resumen ejecutivo.
### Convertidor
- [ ] Excel SIAGRI procesa, **Sucuya = 0 en resultado**, exportación, offline.
### Privado
- [ ] No visible normalmente, desbloqueo, conciliación, carga Excel, actualización, bloquear.

## Regla de no-regresión (cierre de cada fase)
1. Probar el nuevo módulo. 2. Probar navegación general. 3. Smoke de módulos ya integrados.
4. Verificar IndexedDB/localStorage intactos. 5. Verificar PWA. 6. Revisar consola.
7. No continuar con errores importantes abiertos.

## Cómo probar localmente
Al usar módulos ES y Service Worker, hay que servir por HTTP (no abrir con `file://`):
```bash
cd Negocios_de_Cana_CASUR
python3 -m http.server 8080
# abrir http://localhost:8080/
```

## Fase 2 — Convertidor SIAGRI (estado: verificado)
Flujo: Home → Centro Maestro → contraseña `15102171011` → Administrador SIAGRI.
- [x] Home muestra textos/nombres nuevos
- [x] Centro Maestro pide y acepta contraseña
- [x] Administrador SIAGRI carga el **Convertidor real** (`#siagriInput` presente en iframe)
- [x] Cargar `docs/regression/siagri_fixture.xlsx` y procesar
- [x] **Sucuya código 16 = 0** (excluidos=2; "Sucuya = 0 en resultado" ✓; Cod=16 en export=0)
- [x] Generar/descargar Excel; hojas **REPORTE** (5) y **Productores** (2)
- [x] Reglas de edad/renovación (fórmula Edad por fila) y `Hac-Sue`, Tipo de Riego presentes
- [x] Cerrar, volver a Centro Maestro, reabrir → **persistencia** `casur-master-validations-v1`
- [x] **Offline** del Convertidor tras cachear recursos
- [x] Consola limpia (shell + iframe)
- [x] **Un solo Service Worker** (raíz) · **una sola PWA** (0 manifest en iframe)
- [x] Responsive móvil y PC
Prueba de regresión permanente: `docs/regression/SUCUYA_REGRESION.md`.

## Fase 3 — Estimador TCH (estado: integración técnica verificada por inspección)
Micro-pruebas (cortas y separadas):
- [x] A — Módulo carga en iframe; assets JS/CSS relativos; shell estable (arquitectura de iframe ya probada en Fase 2).
- [x] B — IndexedDB `casur-estimador-tch` v3 · stores: master, biometries, weighings, harvests, visits, audit, settings · sin recreación destructiva (inspección de `js/storage.js`).
- [x] C — Maestro desde `./data/suertes.json` (1053) y `./data/productores.json`; rutas relativas OK tras mover a `modules/tch/`.
- [x] D — Persistencia por IndexedDB (misma DB de origen en el iframe; sin migración) — verificación por diseño; confirmación final de escritura/relectura en dispositivo.
- [x] E — Fotos: `#visitGalleryFile`/`#visitCameraFile` → File/Blob → `canvas.toBlob` → `{blob,sizeBytes}` en `visits`; recuperación `createObjectURL` (inspección `js/visit-evidence.js`).
- [x] F — GPS: `navigator.geolocation.getCurrentPosition` con manejo éxito/error; iframe con `allow="geolocation"`.
- [x] G — Exportadores: PNG etiquetado (canvas `fillText`/`toBlob`), Excel vía `./vendor/xlsx.bundle.js` (ruta relativa), backup/restore JSON.
- [x] H — PWA/SW: TCH no registra SW propio ni manifest; solo SW raíz; una sola PWA (archivos `sw.js`/`manifest.webmanifest` eliminados de la copia).
- [x] Fase 2 sin regresión: `master/convertidor/` intacto, SW raíz (allowlist `casur_master_`) sin cambios.

**Requiere validación en dispositivo real (Android/PC) tras publicar:**
cámara, galería, permiso/coordenadas GPS reales, orientación vertical/horizontal, compartir, y comportamiento de la PWA instalada. Además, confirmación E2E en navegador (no ejecutable aquí por inestabilidad del entorno de pruebas).

## Fase 4 — Maestro de Suertes / Producción (estado)
Verificado:
- [x] Producción real integrada en `modules/produccion/` (monolito VF54.6), iframe aislado.
- [x] SW propio y manifest neutralizados; `sw.js`/`manifest.webmanifest` eliminados. Un solo SW raíz.
- [x] Datos intactos: `CASUR_REMOTE_CRONO` (1053), `CASUR_REMOTE_HISTORICO` (11598), `CASUR_RELEASE`.
- [x] Sucuya (Cod 16) excluida en el dataset publicado (regla permanente).
- [x] Adaptador SIAGRI→REPORTE + validaciones + resumen: **Node 15/15** (`master/adapters/`).
- [x] Store `casur_master_data` (IndexedDB) y puente `siagri_last` del Convertidor (no invasivo).
- [x] Centro Maestro: tarjeta de datos + "Actualizar Maestro de Suertes" (con resumen y validaciones antes de aplicar) + "Generar paquete datos GitHub".

Requiere validación en dispositivo real (Android/PC), por inestabilidad del entorno de pruebas
y por orquestación entre iframes:
1) Abrir Maestro de Suertes → Cronológico/Histórico/selección múltiple/análisis por zona/fichas/gráficos/exportaciones.
2) Centro Maestro → Administrador SIAGRI → procesar fixture → "Actualizar Maestro de Suertes" → confirmar Sucuya=0 y resumen → aplicar.
3) Abrir Producción y confirmar que consume el overlay (`window.CASUR_MASTER_OVERLAY`).
4) "Paquete solo datos para GitHub" (Centro Maestro interno de Producción) → 6 archivos + `version.json/js`.
5) Histórico previo disponible (comparar antes/después). Offline tras cachear. Un solo SW / una sola PWA.
6) Smoke Administrador SIAGRI y Estimador TCH (sin regresión).

## Fase 4.1 — Bridge real (verificado en Node/jsdom)
- [x] `window.CASUR_APPLY_REPORT_ROWS` pasa filas REPORTE por `extractRecords→buildCronoData→compareData` y aplica a `window.CRONO_DATA`.
- [x] Antes/Después de `CRONO_DATA`: 1053 → refleja el payload de prueba (hac 999, área 33.33, s01=11.11).
- [x] Versión de datos actualizada (`CASUR_RELEASE.version`).
- [x] Histórico intacto (`APP_DATA` sin cambios, 1.34 MB).
- [x] Baseline primera actualización = 1053 (no 0) vía datos publicados / `CASUR_GET_CURRENT_REPORT_ROWS`.
- [x] Paquete solo datos: `cronologico.json` con el cambio, `version.json` nueva versión, `historico.json` preservado.
- [x] Instalación standalone de Producción neutralizada (beforeinstallprompt/appinstalled/installApp; FAB/tarjeta ocultos).
- [x] Consumo automático del overlay al abrir Producción (sin re-seleccionar Excel).
Pendiente dispositivo: gesto real del botón "Paquete solo datos" (descarga ZIP con JSZip) y flujo táctil completo.

## Fase 4.4 — Sincronización automática real (verificado en Node/jsdom)
- [x] SW: `modules/produccion/data/**` network-first (antes stale-while-revalidate).
- [x] Detecta version.json distinta; descarga y valida cronológico+histórico ANTES de aplicar.
- [x] Validaciones: JSON válido, registros>0, versión coherente entre los 3 archivos, Sucuya=0.
- [x] Caso positivo: `window.CRONO_DATA` refleja el cambio real tras sincronizar (no solo IndexedDB); histórico preservado; recarga controlada solo del iframe (no del shell); guard de sesión sin loop.
- [x] Offline tras sincronizar: conserva la versión ya descargada.
- [x] Fail-safe: offline desde el inicio, dataset corrupto, versión incoherente → sin recarga, sin tocar datos, "Sincronización pendiente".
- [x] Toast "✓ Maestro de Suertes actualizado · versión" una sola vez tras aplicar.
Pendiente dispositivo: prueba con GitHub Pages real (latencia/CDN) y verificación visual del pill/toast.

## Hotfix 4.4.1 — Anti-downgrade (verificado en Node/jsdom)
- [x] Comparador `compareCasurDataVersions`: 9/9 (fecha manda, no lexicográfico, formatos desconocidos → null, nunca "más nuevo").
- [x] Downgrade real (activa 09-05 vs publicado 09-01): 0 reloads, cronológico/histórico NO descargados, versión y datos intactos, sin parpadeo en pill.
- [x] Upgrade real (activa 09-01 vs publicado 09-05): validado, recarga controlada solicitada, datos nuevos reflejados en CRONO_DATA tras el ciclo, histórico preservado, offline conserva la versión ya sincronizada.
- [x] Shell: `prepareProduccionDataIfNewer()` con guard anti-polling (3 min) y marcador `localStorage['casur_produccion_active_version']`; no descarga si igual/anterior/desconocida o sin baseline.
- [x] README documenta `modules/produccion/data/` como contenido versionado independiente del código, con la advertencia anti-downgrade al publicar el ZIP.

## Hotfix 4.4.2 — Last Known Good real en el SW (verificado con `sw.js` real vía Node vm)
- [x] Caché `casur_master_prod_lkg` persistente (sin sufijo de versión), en `OWNED`.
- [x] `produccionDataGate()` intercepta los 6 archivos de datos de Producción antes que cualquier JS del módulo.
- [x] Escenario obligatorio: LKG 09.05 establecida → publicación accidental 09.01 → tras "reapertura": versión/cronológico/histórico servidos siguen en 09.05; 0 downgrade; LKG intacta; 0 llamadas de red de más.
- [x] Upgrade real a 09.06: se sirve, se promueve como nueva LKG, disponible offline después.
- [x] Protección funciona desde el arranque (a nivel de red, antes de que `window.CASUR_RELEASE` se asigne), no depende de que el JS de Producción se ejecute.
Pendiente dispositivo: confirmar en Android/PC real con GitHub Pages (latencia real, Cache Storage del navegador real).

## Hotfix 4.4.3 — Generaciones atómicas + migración segura (TODO simulado: Node/jsdom con código real)
- [x] Migración desde DATA_CACHE (09.05) con LKG vacía, servidor en 09.01 → conserva 09.05, offline OK.
- [x] LKG activa 09.05, reinicio simulado, servidor inferior → los 6 archivos permanecen en 09.05.
- [x] Publicación parcial / archivo corrupto / versiones incoherentes → ninguna activación parcial (3 casos).
- [x] Update Home→09.06 + pérdida de red antes de abrir Producción → los 6 archivos usan 09.06 offline.
- [x] 6 solicitudes concurrentes → misma generación, sin mezclar, sin retroceder.
- [x] Fecha imposible / formato desconocido → rechazados.
- [x] Versión cargada ≠ esperada → sin toast falso, sin recarga repetida.
- [x] activate del SW → LKG y caché ajena sobreviven; solo caché maestra vieja se borra.
Pendiente: TODAS las pruebas anteriores son simuladas (Node vm/jsdom). Falta validar en navegador/dispositivo real: Cache Storage real, Service Worker real, GitHub Pages real, y confirmar visualmente pill/toast en Producción.

## Hotfix 4.4.4 — Mutex real, migración agrupada, activación sin botón (TODO simulado: Node vm con sw.js real)
- [x] Resolución 09.06 lenta (>4s) + segunda solicitud a los 2s → una sola resolución de red, resultado final nunca retrocede tras una resolución posterior a 09.07.
- [x] Ráfagas separadas por 5-6s mientras la primera sigue pendiente → una sola resolución efectiva.
- [x] Completa 09.05 + parcial 09.06 en caché → migra 09.05 (no pierde la completa).
- [x] Completas 09.05 y 09.06 → migra 09.06 (la más nueva).
- [x] `self.skipWaiting()` invocado en `install` (activación sin botón desde 4.4.2).
- [x] Regresión completa de 4.4.3 (27 aserciones): downgrade, corrupción, incoherencia, offline, concurrencia, fecha imposible, activate — todo repetido sobre el sw.js nuevo, sigue verde.
Pendiente: TODO lo anterior es simulado (Node vm). Falta validar en navegador/dispositivo real: mutex bajo concurrencia real del navegador, Cache Storage real, y la transición real 4.4.2→4.4.4 sin botón en un dispositivo de verdad.

## Fase 5 — Insumos Entregados Productores (Node/jsdom con app real; diagnóstico transparente de limitaciones de arnés)
- [x] Baseline bootstrap.json idéntico (MD5) al repo fuente actual; 3462/9201/1053/212 confirmado real.
- [x] SW/manifest/instalación standalone neutralizados/eliminados (diff verbatim: solo esos 4 cambios).
- [x] SheetJS 0.18.5 exacto vendorizado localmente; XLSX.version confirmado en runtime.
- [x] Reglas: mezcla (4.78/19.12 según ejemplo documentado), Sucuya=0, AAM separado — 18/18.
- [x] IndexedDB `insumos_casur_db`/`kv`: roundtrip de bootstrap/bootstrap_local/reviews/overrides, selección por generated_at, fallback offline — 13/13 (tras corregir el arnés, no la app).
- [x] UI: Resumen/Explorar/Insumos/Productores/Madurante(drill)/Admin — 16/16, sin errores reales.
- [x] Smoke Convertidor/TCH/Producción abren; Producción conserva 2026.09.01-2627.1; un solo SW/manifest; sin CTA instalación en Insumos.
Pendiente real: validación E2E completa en navegador/dispositivo (Cache Storage e IndexedDB reales, instalación/cierre/reapertura real de la PWA, UI táctil).

## Fase 6 — Riegos Ejecutados (verificación estática; jsdom no ejecuta ESM, ver CHANGELOG)
- [x] Bundle activo identificado sin adivinar: index-Cw6wzs3D.js / index-B0LwgFY-.css.
- [x] Diff verbatim: solo sw.js/manifest.webmanifest ausentes + 2 líneas neutralizadas en el bundle + 1 línea comentada en index.html.
- [x] node --check sobre el bundle editado: sintaxis válida.
- [x] data/bootstrap.json confirmado como el único consumido (string literal en el bundle); coincide con baseline (1053/28897/2026-08-24/2026-08-24).
- [x] Assets resueltos (JS/CSS activos, iconos, logo, import dinámico html2canvas).
- [x] Reglas de negocio confirmadas presentes verbatim: Pansaco(993)/Claudio Reyes(25)/Alfredo Siezar(561), exclusión Sucuya, suertes inactivadas.
- [x] SW raíz: modules/riego/data/** en network-first genérico; LKG de Producción intacto (regresión repetida verde); passthrough Supabase ya preexistente.
- [x] Smoke: Convertidor/TCH/Producción/Insumos sin regresión; un solo SW/manifest.
- [ ] PENDIENTE REAL (no ejecutable aquí): toda prueba funcional/UI/responsive/offline/exportaciones/sincronización Supabase de Riego — requiere navegador o dispositivo real, ya que jsdom no soporta ejecución de scripts type="module".
