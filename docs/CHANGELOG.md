# CHANGELOG — Negocios de Caña CASUR

Formato: [versión] — fecha · resumen.

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
