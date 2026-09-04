# CHANGELOG — Negocios de Caña CASUR

Formato: [versión] — fecha · resumen.

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
