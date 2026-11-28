# MC01 + VC01 — Implementación del contrato del Maestro Central y de Visitas de Campo

Rama `claude/maestro-central-visitas` · Draft PR #79 · base `main` `21a9004` (App 1.6.2 · Maestro de Suertes V1.8.3 ·
generación `2026.11.22-aforo.1102`).

## Versiones

| Componente | Antes | Después | Tipo |
|---|---|---|---|
| App Maestra (shell) | 1.6.2 | **1.7.0** | MINOR |
| Visitas de Campo Productores de Caña | — | **1.0.0** | MINOR (módulo nuevo) |
| Maestro de Suertes (Producción) | V1.8.3 | V1.8.3 | Sin cambios |
| Estimador TCH | 2.8.1 | 2.8.1 | Sin cambios |
| Datos oficiales | 1102 | 1102 | Sin cambios |

`check-release-policy` reconoce ahora un módulo nuevo sin versión anterior: exige una primera versión SemVer y su
instantánea de liberación. `runtime-assets` incluye el bundle `visitas`, que depende de core, geo y tch.

## Decisiones del propietario aplicadas a los documentos de MC00

- Se elimina la etapa S0. No se tocan contraseñas, nóminas ni archivos existentes, ni el historial de git, la visibilidad
  del repositorio o los accesos.
- **Área física conocida** (`areas.physicalKnown`):
  - Se separa de las áreas productivas: activa, molienda, semilla, inventariada, pendiente de estimado y perdida
    documentada (esta última `null`, porque no hay fuente).
  - **No** se equipara con la superficie catastral.
  - Siempre lleva su base (`generation`, `inherited` o `history`) y la versión de origen; si no se conoce, `unknown`.
    Nunca se convierte en 0.
- **Las 148 diferencias de área:**
  - 51 son presentes no productivas y 7 ausentes; no se interpretan como pérdida física.
  - **49** son diferencias menores (≤ 0,02 ha), agrupadas sin declararlas remensura.
  - **41** quedan por conciliar.
  - *Corrección respecto de MC00:* allí se informaron 47 y 43. Dos diferencias de exactamente 0,02 ha quedaban fuera por
    error de coma flotante. El diagnóstico compara ahora en centésimas de hectárea enteras.
- **`nrMaster` (Riego):**
  - El importador original de Riego (bundle) lo toma de la columna NR del cronológico SIAGRI (`nrMaster:Ar(r.NR)`), igual
    que `master-to-riego-adapter.js` (`#_de_Riegos`). Ese adaptador estaba en lo correcto; el PoC de MC00 se equivocaba al
    llamarlo «riegos objetivo».
  - De las 1053 suertes, 481 coinciden con la 1102 y 572 difieren, a menudo en exactamente +1. Es un **valor acumulado a la
    fecha de corte** del maestro de Riego (24-Ago-2026).
  - El diagnóstico lo clasifica como temporal y no lo compara con una fuente de otra fecha.
- **Riego v6:** se buscó el código fuente en los repositorios accesibles del propietario.
  - `Riego_Ejecutado_Productor_casur`: 7 commits, solo bundles compilados.
  - `Riego-CASUR-Seguimiento`: otra aplicación (React + Android, «Programa de riego»), sin el maestro ni `nrMaster`.
  - Conclusión: no existe el código fuente de la v6 en un lugar accesible. Se conserva el adaptador externo y no se
    parchean más bundles.
- **Supabase:** el registro declara el mismo proyecto (`fbatjsbdybliradxjhdm`) para Riego e Inventario. La afirmación de
  MC00 de «dos proyectos gratuitos ocupados» queda corregida: hay al menos uno comprobado en el repositorio, y el número
  real de proyectos se verifica en VC03. El backend se pospone a VC03.

## MC01 — Contrato de lectura (runtime)

| Archivo | Contenido |
|---|---|
| `core/shared-data/maestro-central.js` | Contrato de lectura: `buildMaestroView`, `maestroReader`, `resolveMaestroSource`, `loadMaestroCentral`, más identidad canónica y zafras |
| `core/shared-data/source-policy.js` | Política vigente de resolución de fuentes, copia exacta de la de Producción (que no se modifica). La paridad se exige en `tests/source-policy-parity.test.mjs` (> 2000 combinaciones) |
| `core/shared-data/maestro-diagnostics.js` | Diagnóstico de solo lectura contra los maestros propios de Riego, Insumos, TCH y Labores |
| `core/shared-data/maestro-diagnostics-view.js` | Tarjeta «Maestro Central · diagnóstico» del Centro Maestro |
| `core/shared-data/master-store.js` | `commitSiagriDataset`: el camino C pasa por la transacción operativa |

**Garantías del contrato:**
- **Solo lectura.** Abre IndexedDB sin crear bases ni ejecutar upgrades, y no escribe en localStorage.
- **Fuente efectiva** con la misma política que Producción:
  - Respeta la elección explícita (`official` / `personal`), la generación fijada, la personalizada y la preservada.
  - Sin conexión, conserva la generación local.
  - No se basa solo en «la versión más reciente».
- **Generación local de la importación SIAGRI** (sin estructura de cronológico): Producción la usa, el contrato informa
  `local-incompatible` y los demás módulos leen la oficial.
- **Inmutabilidad real.** Se clona con `structuredClone` y se congela la copia; la fuente no se congela ni se modifica.
- **Estimado.** Se distinguen `available` (la fuente trae TCH) y el estado `usable`, `zero`, `missing`, `invalid` o
  `not-applicable`, según `participation()` del motor operativo.
- **Zafras dinámicas:** `estimateSeason` y `executedSeason` (anterior), sin «25/26» ni «26/27» fijos.
- **Identidad.** Usa `identity()` del motor operativo y una canonicalización `hacienda|suerte` con suerte en texto. Nunca se
  usa `codLote`.
- **Procedencia.** Se conservan celdas, herencia, historial, estados y la referencia GIS (`lotId`, zona y existencia del
  polígono).
- **Paridad con el Maestro de Suertes publicado:**
  - 995 activas, 946 en molienda, 7 ausentes y 946 utilizables.
  - Área activa 9.574,66 ha, de molienda 9.101,68 ha y de semilla 472,98 ha.
  - 561.658,27 t oficiales.
  - Las 4 activas sin polígono: 18413A, 1921B, 337A y 606.

**Diagnóstico en el Centro Maestro** (sin consola ni scripts):
- Muestra la generación oficial, el aforo, la generación local, la fuente efectiva, el estado de actualización, las
  referencias GIS y las suertes del contrato.
- Por módulo: el maestro usado (copia del dispositivo o publicada) con su fecha, las identidades y las diferencias por
  campo, con el detalle de áreas.
- Se puede descargar en JSON. Funciona sin conexión.

**Camino C corregido:** la actualización SIAGRI del Centro Maestro usa `commitSiagriDataset`, que hace en una sola
transacción:
- Exige aprobación, `expectedVersion` y un Maestro Central conciliado (misma versión y mismas filas).
- Rechaza versiones reutilizadas y un Maestro Central guardado igual o más nuevo.
- Archiva la generación anterior, recuperable con `restoreOperationalPrevious`.

Si algo falla, no se escribe nada: antes, un fallo en la segunda escritura se ignoraba en silencio.

## VC01 — Visitas de Campo Productores de Caña (local-first)

`modules/visitas/`: `index.html`, `manifest.webmanifest`, `icons/`, `css/visitas.css` y `js/`:

| Archivo | Responsabilidad |
|---|---|
| `app.js` | Interfaz completa |
| `store.js` | IDB propia `casur-visitas` |
| `maestro.js` | Contrato e instantánea |
| `geo.js` | GPS y polígonos |
| `photos.js` | Original, SHA-256, EXIF y copia rotulada |
| `backup.js` | Respaldo y restauración |
| `zip.js` | ZIP sin compresión que lee por porciones |
| `forms.js` | Motivos, campos condicionales y estados |
| `pwa.js` | Acceso directo |

**Funciones:**
- **Inicio:** registrar una visita, borradores, visitas recientes, recomendaciones pendientes, solicitudes abiertas, fotos
  sin respaldo y almacenamiento. Todo se calcula de los registros reales.
- **Registro de visita** con secciones progresivas:
  1. Productor o finca, buscado en el Maestro; alcance «suertes específicas» o «visita general de finca»; selección
     múltiple de suertes.
  2. GPS con su precisión. Propone la suerte por polígono con confirmación obligatoria y avisa de ambigüedad, borde,
     cercanía o lejanía; se puede elegir manualmente. Mapa con la finca, las suertes visitadas resaltadas y la ubicación.
  3. Fecha, hora, motivo y técnico. Los campos condicionales cambian según el motivo y según riego o secano (tipo de riego
     original del Maestro).
  4. Datos del Maestro de las suertes visitadas.
  5. Observaciones (con dictado del teclado) y hallazgos.
  6. Fotografías.
  7. Recomendaciones, solicitudes y compromisos con prioridad, responsable, fecha compromiso, suerte y observaciones.
- **Autoguardado** de borradores (500 ms y al ocultar la página) y recuperación desde Inicio.
- El checkpoint de la App Maestra guarda el borrador antes de actualizar.
- **Instantánea del Maestro** por visita: generación, contrato, origen, aforo, zafras, versión GIS y registros de la finca.
  Las actualizaciones posteriores no cambian las visitas anteriores.
- **Visitas cerradas:** las ediciones generan revisiones con los campos cambiados y sus valores anteriores.
- **Fotografías:**
  - Cámara y galería, varias a la vez.
  - Original sin recomprimir (conserva el EXIF), identificador estable y SHA-256.
  - Se distingue el GPS propio de la foto (EXIF) de la ubicación general de la visita.
  - Se asocia a una suerte o a un hallazgo.
  - Exportación individual (original o rotulada) y múltiple. La copia rotulada usa la función exportada del Estimador TCH
    sin modificarlo.
- **Seguimiento inicial:** cambios de estado con nota e historial.
  - Estados de recomendación: Pendiente, En gestión, Programado, Ejecutado, Verificado, Cancelado.
  - Estados de solicitud: Solicitada, En gestión, Atendida, Rechazada, Cancelada.
  - No se generan registros SIAGRI, órdenes ni entregas.
- **Datos y respaldos:**
  - Persistencia solicitada y uso o cuota visibles.
  - Estados de foto: local, exportada, respaldo confirmado, restaurada y no disponible.
  - ZIP organizado por año, mes, finca y visita, dividido según la memoria del dispositivo (40–200 MB por parte). Cada
    parte es autosuficiente.
  - Confirmación de respaldo.
  - Restauración verificable: SHA-256 por foto, sin duplicados y conservando lo más reciente, con informe de dañadas y
    faltantes.
  - Nunca se borra una foto automáticamente.

**PWA y acceso directo:**
- `modules/visitas/manifest.webmanifest` tiene su propio id, scope y start_url. Usa el **mismo SW raíz**; no hay un segundo
  Service Worker.
- **Corrección del 503:** en una navegación directa a un bundle con acceso directo (`DIRECT_ACCESS_BUNDLES = {visitas}`), el
  SW prepara el bundle con la misma verificación SHA-256 antes de servirlo. Sin red se mantiene el 503.
- `pwa.js`, en una entrada directa:
  - Espera el control del SW.
  - Prepara el bundle de Visitas y la caché GIS.
  - Pide la generación oficial, que queda como última buena conocida para usarla sin conexión.
  - Muestra «Lista sin conexión».
- Dentro de la App Maestra no hace nada: el shell ya prepara el bundle y ahora también la caché GIS para Visitas.

## QA

| Prueba | Resultado |
|---|---|
| `node --test tests/*.test.mjs` (incluye `maestro-central` y `source-policy-parity`) | **174/174** |
| `tools/qa-maestro-central.cjs`: diagnóstico pc/móvil, solo lectura, offline, camino C, generación fijada | **10/10** |
| `tools/qa-visitas.cjs`: acceso directo, manifiesto e instalabilidad (Chromium), registro, fotos, borrador, instantánea y revisión, seguimiento, respaldo, partes, restauración y corrupción, aislamiento, offline, App Maestra, 0 errores | **14/14** |
| `tools/qa-produccion-publicada.cjs` con la candidata local: todos los módulos, pc y Android, offline, 0 errores | **18/18** |
| `tools/qa-update-162-170.cjs`: actualización real 1.6.2 → 1.7.0 (aviso, «Más tarde», checkpoint, borrador TCH, datos locales) | **PASS** |
| `sync-versions`, `runtime-assets` y `check-release-policy` | OK |

Las pruebas de Visitas usan visitas, fotos y textos sintéticos. Las fotos se generan en el navegador e incluyen EXIF
sintético. El GPS se simula en el ancla oficial del polígono 242/01.

## Limitaciones verificadas y pendientes

- **Instalación diferenciada:** comprobada solo en Chromium headless (manifiesto propio, sin errores de instalabilidad y
  SW único). **No** está confirmada en un teléfono Android. Se valida con la preview HTTPS en un dispositivo real.
- **Dictado:** se usa el micrófono del teclado del sistema. No se usa la Web Speech API porque no funciona offline de forma
  fiable.
- **Cámara real y EXIF de un teléfono:** las pruebas usan imágenes sintéticas. Algunos navegadores Android eliminan el GPS
  del EXIF al compartir desde la galería; en ese caso la foto queda «sin GPS propio» y se usa la ubicación general de la
  visita, identificada como tal.
- **Expediente completo e informes PDF:** VC02. **Sincronización:** VC03.
