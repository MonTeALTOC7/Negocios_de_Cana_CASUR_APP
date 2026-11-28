# Visitas de Campo Productores de Caña — arquitectura

«Negocios de Caña · CASUR». Es el expediente técnico por productor. Usa las marcas de `MAESTRO_CENTRAL_DIAGNOSTICO.md`.
Es un diseño: esta etapa solo incluye un PoC aislado (`tools/poc/pwa-visitas-coexistencia.cjs`).

## 1. Independiente, integrada o híbrida

| Criterio | Independiente (otro repo y otro origen) | Integrada (un módulo más, sin instalación propia) | **Híbrida** (`modules/visitas/`, mismo origen, instalable aparte) |
|---|---|---|---|
| Acceso al Maestro Central y al GIS | Duplicado o por API | Directo | Directo (same-origin: caché del SW e IDB) |
| Duplicación de datos o app | Alta | Ninguna | Ninguna |
| Icono propio en Android | Sí | No | Sí, si se confirma en el dispositivo (§2) |
| Versión propia | Sí | Sí (`versions.js`) | Sí (`versions.js`). **Cada release de Visitas es también un release de la App Maestra** (Release Gate) |
| Offline | Requiere su propio SW | SW raíz | SW raíz, más un cambio candidato (§2) |
| Riesgo para los módulos existentes | Nulo | Bajo | Bajo: los almacenes son separados y el bundle es propio |
| Coste de mantenimiento | Alto (dos pipelines y dos SW) | Bajo | Bajo-medio |

**[R] Híbrida**, como proponía el encargo [GPT]. Es la única que da acceso directo sin duplicar nada. El acoplamiento de
versiones (todo cambio de Visitas genera un release de la App Maestra) es aceptable y protege con la misma Release Gate.

## 2. Instalación y acceso directo: qué se comprobó

PoC sobre una copia temporal del árbol, en Chromium headless y servidor local. Resultado en
`docs/evidencias-maestro-central/poc-pwa-visitas.json`.

| Comprobación | Variante A: SW actual | Variante B: SW con preparación bajo demanda |
|---|---|---|
| Primera entrada directa a `modules/visitas/` (perfil nuevo, todavía sin SW) | 200 ✔ | 200 ✔ |
| Recarga directa ya controlada por el SW raíz, antes de abrir el shell | **503 «Módulo no preparado…»** ✘ | 200 ✔ |
| Manifiesto de Visitas detectado en esa recarga | ✘ (la página de error no tiene manifiesto) | ✔ `modules/visitas/manifest.webmanifest` |
| Errores de instalabilidad (CDP `Page.getInstallabilityErrors`) — Visitas | — | Ninguno |
| Errores de instalabilidad — App Maestra (manifiesto raíz sin cambios) | Ninguno | Ninguno |
| Entrada directa después de preparar el bundle desde el shell | 200 ✔ | 200 ✔ |
| Sin conexión: Visitas directa / App Maestra | 200 ✔ / 200 ✔ | 200 ✔ / 200 ✔ |
| Registros de SW | 1 (raíz) | 1 (raíz) |

**[C]** Comprobaciones:
1. Un manifiesto anidado (`id`, `scope` y `start_url` = `./` relativos a `modules/visitas/`) bajo el SW raíz no produce
   errores de instalabilidad en Chromium.
2. Coexiste con el manifiesto raíz.
3. No requiere un segundo Service Worker.
4. Comparte el origen, y por tanto IDB, CacheStorage y cuota.

**[P9]** Con el SW actual, el enlace directo y el icono instalado de Visitas fallan con 503 hasta que el usuario abra
Visitas desde Inicio con red. **[CL]** El cambio candidato (variante B) tiene tres partes:
- Cuando llega una navegación a un bundle no preparado y hay red, el SW lo prepara (`prepareVerifiedBundle`, con la misma
  verificación SHA-256) y lo sirve.
- Sin red, mantiene el 503 con su página de recuperación.
- Es una línea en `bundleRuntime`, limitada a Visitas, y requiere un release.

**[H] Pendiente de comprobar en un dispositivo real (preview HTTPS)**:
- Android Chrome: que el WebAPK de Visitas se instale como app separada con su icono y nombre, conviviendo con la de la
  App Maestra.
- La captura de enlaces: un enlace a `modules/visitas/` debe abrir la app de Visitas y no la App Maestra, ya que gana el
  scope más específico.
- La actualización de las dos apps con un solo SW.
- Escritorio (Edge y Chrome).
- iOS: añadir a pantalla de inicio solo da un acceso directo; no admite instalación separada fiable.

En headless no se puede afirmar más.

Accesos previstos:
- Tarjeta en Inicio de la App Maestra (iframe, como los demás módulos, con su puente).
- Enlace directo `…/modules/visitas/`.
- Icono instalado propio.

Hay una sola fuente de código y de datos.

## 3. Arquitectura del módulo

```
modules/visitas/
  index.html · manifest.webmanifest · icons/        (identidad Petróleo, icono propio)
  js/app.js              rutas: inicio, nueva, mis-visitas, productor/:code, seguimiento, mapa, informes, datos
  js/store.js            IDB «casur-visitas» (propia; nunca escribe en otras bases)
  js/maestro.js          lectura del contrato del Maestro Central (solo lectura) + instantánea por visita
  js/geo.js              wrapper de shared/geo (point-in-polygon, polígonos offline)
  js/photos.js           captura, original intacto, copia rotulada (reutiliza tch/js/visit-evidence.js)
  js/backup.js           ZIP de respaldo y restauración con verificación de integridad
  js/sync.js             cola de salida hacia Supabase (fase VC03)
  js/forms/              definición declarativa de secciones y campos condicionales
```

**Dependencias del bundle:** `visitas: ['core', 'geo']`. Es una línea en `tools/runtime-assets.mjs` (`bundleFor` y
`dependencies`), comprobada en el PoC.

**Reutilización sin romper TCH.** Se importan, sin modificarlas, las funciones exportadas de
`modules/tch/js/visit-evidence.js`:
- `createLabeledVisitPhotoBlob` y `buildVisitLabelModel`.
- `createZip` y `visitPhotoFilename`.
- `createVisitsWorkbookBlob`, si encaja.

Si hiciera falta cambiarlas, se copian primero a `shared/` con pruebas de paridad. El Estimador TCH no se modifica.

**UX** (mobile-first, legible al sol, offline):
- Contraste AA o superior y tipografía de 16 px o más.
- Objetivos táctiles de 48 px o más.
- Formularios por secciones progresivas con autoguardado de borrador cada cambio (IDB) y recuperación al abrir.
- Dictado con el teclado del sistema (la Web Speech API no funciona offline de forma fiable en Android).

Se toma de QField, Survey123 y Kobo solo esto:
- Campos condicionales.
- Selección de la suerte por GPS con confirmación.
- Repetición de bloques (varias observaciones).
- Validación suave.

Se evita su complejidad de configuración.

**Contenido agronómico.**
- Secano y riego se distinguen con el tipo de riego original del maestro; los campos de riego solo aparecen en las suertes
  con riego.
- No hay recomendaciones automáticas: el técnico escribe; la app estructura.

## 4. Modelo de datos (IDB `casur-visitas`, v1)

| Store | Clave | Contenido |
|---|---|---|
| `visits` | `id` (UUID generado en el cliente) | `producerCode`, `lots[]` (`{key, confirmedBy:'gps'|'manual', distanceM}`), `startedAt`, `closedAt`, `author`, `status` (`borrador`/`cerrada`), `sections{}`, `gps{lat,lon,accuracy,at}`, **`masterSnapshot`** (`{dataVersion, contractVersion, records:[{key, attributes, state, forecast}]}` congelado al iniciar la visita), `rev`, `updatedAt` |
| `visitRevisions` | `[visitId, rev]` | Diferencias de cada edición después de cerrar: quién, cuándo y qué cambió. Nunca se sobrescribe una visita cerrada sin revisión |
| `followups` | `id` | Recomendación: `visitId`, `lotKey`, `type`, `text`, `state` (Pendiente, En gestión, Programado, Ejecutado, Verificado, Cancelado), `history[]` (estado, fecha, autor, nota), `dueDate`. «Ejecutado» lo declara una persona y no es una labor de SIAGRI |
| `requests` | `id` | Solicitud (insumos, riego, labores…): `kind`, `qty`, `unit`, `state` (Solicitada, En gestión, Atendida, Rechazada), `history[]`. **No genera pedidos ni registros en SIAGRI**; solicitar no es entregar |
| `photos` | `id` | Blob **original sin recomprimir** (conserva EXIF), `sha256`, `mime`, `bytes`, `takenAt`, `gps`, `visitId`, `lotKey`, `backupState` |
| `photoDerivatives` | `photoId` | Copia rotulada (JPEG, `createLabeledVisitPhotoBlob`) y miniatura; regenerables |
| `outbox` | `opId` (UUID) | Operaciones pendientes de sincronizar: `{entity, id, baseRev, payload, attempts, lastError}` |
| `backups` | `id` | Registro de cada ZIP exportado: fecha, `sha256` del ZIP, fotos incluidas y confirmación del usuario |
| `settings` | clave | Técnico, preferencias y último respaldo |

La identidad de la suerte es siempre `hacienda|suerte` del contrato. El snapshot hace que la visita sea legible tal como se
capturó, aunque el maestro cambie después; la vista del expediente muestra «dato del maestro al momento de la visita» y,
aparte, el valor vigente.

## 5. Fotografías: almacenamiento y respaldo

**Reglas fijas:**
- Nunca se guardan en Supabase ni en GitHub.
- Nunca se borran automáticamente.
- El original se conserva intacto y la copia rotulada va aparte.

| Aspecto | Diseño |
|---|---|
| Captura | `<input type="file" accept="image/*" capture="environment">` para la cámara y sin `capture` para la galería. Se guarda el `File` tal cual (original). [C] `prepareVisitPhoto` de TCH recomprime a 1600 px y pierde el EXIF, así que solo se usa para derivados |
| Identidad | `id` estable (UUID). El nombre de exportación sigue `visitPhotoFilename`. Se calcula el `sha256` del original |
| GPS | Del EXIF si existe; si no, el de la visita en el momento de la captura, marcado `source: 'visit'` |
| Persistencia | `navigator.storage.persist()` al primer uso, con su estado visible en «Datos y respaldos». Se muestran el uso y la cuota (`storage.estimate()`) |
| Estados | `local` → `pendiente de respaldo` → `exportada` (está en un ZIP generado) → `respaldo confirmado` (el usuario confirma que guardó el ZIP; opcionalmente se verifica reimportando el índice) → `restaurada` (vino de un ZIP) / `no disponible` (el registro existe y el blob no) |
| Respaldo ZIP | Contiene `manifest.json` (visitas, seguimientos, solicitudes, fotos con `sha256`), originales, copias rotuladas opcionales, Excel y GeoJSON. **Se divide por tamaño** (p. ej. 150 MB) para no agotar la memoria en Android, porque `createZip` construye el ZIP en memoria. En escritorio, File System Access API; en Android, descarga o Compartir |
| Restaurar | Se lee el ZIP, se verifica el `sha256` de cada archivo y se insertan solo los ids que faltan; nunca se sobrescribe un registro local más nuevo. Se emite un informe de integridad (correctos, faltantes, corruptos) |
| OneDrive | Opcional, posterior y manual: el usuario sube el ZIP. No se integra ninguna API de pago ni que necesite secretos en el cliente |

## 6. Sincronización (Supabase, solo datos estructurados)

| Aspecto | Diseño |
|---|---|
| Proyecto | **Nuevo** y dedicado a Visitas. No toca las bases de Riego ni de Inventario |
| Tablas | `visits`, `visit_revisions`, `followups`, `requests` y `photo_index` (metadatos y `sha256`, **sin blobs**) |
| Idempotencia | Cada operación lleva `opId` (UUID). La función RPC `apply_op` lo registra y responde de nuevo el mismo resultado si se repite |
| Conflictos | Versión optimista. La escritura lleva `baseRev`; si el servidor tiene otra `rev`, devuelve conflicto y la app muestra las dos versiones para que el autor elija. Las visitas cerradas solo cambian mediante revisión |
| Disparadores | Al abrir la app, al evento `online`, cada N minutos con la app abierta, y con el botón «Sincronizar ahora». **No depende de Background Sync** |
| Autenticación | Supabase Auth con correo y OTP o enlace mágico. La sesión se guarda para trabajar offline y se refresca con red. Roles: `tecnico`, `supervisor`, `admin` |
| RLS | El técnico lee y escribe sus visitas. El supervisor lee las de su zona. El admin lo lee todo. Nadie borra filas: se marca `cancelado` o `anulado` |
| Datos privados | No se suben datos reales a previews públicas: la preview usa un proyecto o esquema de prueba con datos ficticios |

## 7. GPS y GIS

- **Reutilizar `shared/geo`.**
  - Polígonos por zona, ya en la caché offline del SW (`geoCacheFirst`).
  - Point-in-polygon sobre los polígonos de la zona del productor.
  - Si hay varias coincidencias o la precisión es mayor de 30 m, se pide confirmación.
  - Se registran la distancia al borde y la precisión.
- Las suertes sin polígono (P8: 18413A, 1921B, 337A y 606) se eligen manualmente de la lista del productor.
- **Importación controlada** de shapefile o GeoJSON (fase VC04). La geometría queda como **propuesta** de Visitas, con
  autor y fecha, y se exporta. Nunca reemplaza la geometría oficial (capa E del Centro Maestro).
- Mapas: el satélite solo en pantalla, con red; los mapas de informes son vectoriales y siguen el estándar editorial.

## 8. Informes

Reutilizan el motor (`modules/produccion/js/report-engine.js`) y `docs/ESTANDAR_EDITORIAL_INFORMES.md`. Tipos:
- Visita individual.
- Expediente del productor.
- Finca.
- Período.
- Seguimientos.

Salidas: PDF, PNG o JPG, Excel, ZIP (con fotos) y GeoJSON. Los nombres siguen la norma: `Visita_{Productor}_{DD-MMM-AAAA}`,
`Expediente_{Productor}_{DD-MMM-AAAA}`.

[H] El motor está hoy dentro de `modules/produccion`. Para usarlo desde Visitas hay que moverlo a `shared/` o declarar la
dependencia del bundle `produccion`, que es pesado. Recomendación: moverlo a `shared/reports/` en una fase propia, con las
pruebas `qa-informes*` en verde.

## 9. Seguridad, factibilidad y costos

| Tema | Evaluación |
|---|---|
| Coste | GitHub Pages: 0. Supabase: plan gratuito. [H] Hay que comprobar cuántos proyectos gratuitos activos admite la organización: Riego e Inventario ya ocupan dos, y el plan gratuito suele limitar a dos activos. Si no hay cupo, la decisión es del propietario. No contratar nada de pago; alternativa: sincronización diferida, con Visitas local y respaldo ZIP hasta resolverlo |
| Pausa por inactividad | [H] Los proyectos gratuitos se pausan tras un período sin uso. La app debe tolerarlo: la cola persiste y se muestra «servidor en pausa» |
| Almacenamiento local | Las fotos dominan: unos 3–5 MB por original, de modo que 1000 fotos son ≈ 4 GB. Hace falta `persist()`, aviso de cuota y respaldos frecuentes |
| Datos sensibles | Los nombres de productores y las ubicaciones son privados: nunca en GitHub ni en previews públicas. La clave anónima de Supabase es pública por diseño; la seguridad está en RLS |
| Riesgo para los módulos actuales | Bajo: IDB propia, bundle propio y un cambio en el SW limitado a Visitas |
| Factibilidad | Alta para VC01–VC02 sin backend. Media para VC03, que depende de Auth, RLS y del cupo de Supabase |
