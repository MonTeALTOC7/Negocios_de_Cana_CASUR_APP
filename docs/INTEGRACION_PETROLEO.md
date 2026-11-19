# Integración del rediseño Petróleo · Pizarra — App Maestra CASUR 1.5.7

## Origen y trazabilidad

- Fuente del diseño del jefe: `MonTeALTOC7/preview_NC_App-Maestra`, commit `2a00eac0993aa8d89cd600d48014d977a7706e60`.
- Base oficial de desarrollo: `main` en `1f9fe9aaef755a34e8cec2f2bbbfc487966fd1ab` al preparar la candidata.
- PR #57: `codex/rediseno-petroleo-iconos-originales`, commit `750b869e12e2feb94abfed86721a7c9d73bb7fa7`.
- PR #58: `codex/iconos-cana-seguimiento`, candidata funcional auditada `ed1e4ee72b6df22a0903f7d0d2dddb10639d86f8`.
- El PR #58 acumula los commits del #57, la iconografía seleccionada y la corrección focalizada de búsqueda de Histórico móvil. Se ha dirigido **directamente contra `main`** para evitar publicar una versión intermedia del #57 y resolver la comparación de versiones `1.5.6 → 1.5.7`.
- El PR #57 queda abierto en Draft como referencia histórica de la integración original. **No integrar por separado el #57 si se aprueba la candidata consolidada #58**.

## Alcance y restricciones

Rediseño visual Petróleo/Pizarra del shell y módulos, iconos finales aceptados y mejora del tamaño táctil de búsqueda en Histórico móvil. Conservar datos y motores oficiales, GIS, biometría/TCH, PDF/PNG, permisos, persistencia y actualizaciones PWA.

No ejecutar merge, despliegue productivo, cierre de PR #57, ni modificaciones de datos o archivos Excel sin la autorización expresa del propietario. El propietario indicó que la revisión de los Excel públicos queda fuera del gate de esta liberación.

## Controles de liberación obligatorios

1. Ejecutar `CASUR Release Gate` con evento **`pull_request`** y base `main`; verificar explícitamente que **`Enforce scoped release versions` = success**. El Gate manual con ese paso omitido no basta para aprobar la integración.
2. Revalidar integridad oficial y suites shell, Producción y TCH, hashes de iconos, navegación de seis módulos, Histórico móvil (360/390/1536 px), PWA offline, actualización segura `1.5.6 → 1.5.7` y conservación de datos locales.
3. Publicar y verificar una preview HTTPS inmutable del **HEAD final** del PR #58 tras cualquier commit adicional; comprobar `__preview.json` y SHA de Cloudflare contra GitHub.
4. Registrar límites de cobertura: Android físico, permisos/autenticación reales, operaciones con XLSX reales; Inventario conserva el placeholder heredado de `main`.
5. Presentar evidencias, resultados y riesgos para la revisión final del propietario. **No merge / No deploy productivo** hasta autorización expresa.

## Estado

Este documento registra la consolidación del PR #58 sobre `main`; no constituye una liberación ni certifica resultados posteriores de CI o de una preview nueva.
