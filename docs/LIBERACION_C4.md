# C4 · ensamblaje final local

Base obligatoria: `2912f643bec9eb2a8123a86e6f76b1ea4f054139` (C3 / PR #46).
Rama local: `codex/c4-liberacion-final-local`. No autoriza push, merge ni deploy.

## Estado de preparación

**BLOCKED: el ZIP C3 no está disponible en su ubicación anterior.**
No hay candidato FINAL, manifiesto definitivo, SHA de publicación ni ensayo
C4 con los datos oficiales. Los resultados C3 no sustituyen esas verificaciones.
No reconstruir el paquete desde Excel, una preview o una base personal.

Se necesita `CASUR_C3_Z2627_CANDIDATO_LOCAL_ONLY.zip`, cuyo SHA-256 debe ser
`d3324112d6327d6401fb933c3ec6fe4e9ce15e8353eee4bdd622d1800e11fb77`.
Antes de extraer, verificar el SHA real; comprobar CRC, exactamente siete
entradas de archivo, rutas canónicas sin traversal y los siete SHA extraídos.
Copiarlos sin transformaciones a `modules/produccion/data/`.
Mantener generación `2026.10.25-aforo.1101` y `publishedAt: null`.

El guard `tools/check-c4-release.mjs` requiere el manifiesto definitivo
`tools/release-c4-manifest.json`; su ausencia bloquea la liberación.
El manifiesto debe identificar schemaVersion 1, baseC3, sourceArchiveSha256,
dataVersion, publishedAt y un mapa files de los siete nombres a SHA-256.
Solo se crea después de cotejar el ZIP, nunca desde datos sin procedencia.
Verifica bytes, JSON/JS, totales, casos especiales, Histórico idéntico al C3,
versiones, 166 recursos runtime, PWA/SW intactos y allowlist del diff C4.
Los seis Excel heredados de C3 se verifican byte por byte; no se permiten
Excel nuevos, snapshots, perfiles, credenciales o ZIP de QA en el checkout.
No se eliminaron los controles ni suites existentes.

El Histórico C3 tiene **diez** zafras con registros, de 16/17 a 25/26,
y 11.598 registros. La solicitud menciona ocho. Conservar todas las temporadas;
dejar visible la discrepancia sin recortar ni regenerar el Histórico.

## Cierre técnico pendiente

1. Verificar ZIP y siete archivos, crear el manifiesto y ejecutar el guard C4.
2. Adaptar únicamente los controles de fixtures de septiembre en
   `modules/produccion/tests/validate-static.mjs` a los contratos oficiales
   Z26/27, manteniendo ambas validaciones por generación. No alterar runtime.
3. Ejecutar `tools/check-c2-local.ps1` con evidencia externa y las políticas
   contra main y C3. Datos y controles no requieren subir la versión del runtime
   aprobado; cualquier cambio de runtime exige revisar versiones y hashes.
4. Ensayar `node tools/qa-c2-updates.cjs <QA externa> --assembled-release` y
   repetir con `--source-priority`. Este modo usa los siete archivos del árbol
   final; solo las fases históricas leen septiembre de Git. No hay bootstrap
   Cloudflare. Perfiles nuevos en QA externa, nunca perfiles reales.
5. Cubrir instalación nueva, 1.3.6, aviso, instalar, Más tarde, prioridad de
   fuentes, edición/biometría/GPS pendientes, offline, LKG, recuperación y
   PDF/PNG. Revisar capturas PC/móvil de Chromium; no equiparar viewport móvil
   a una prueba física de Android. Conciliar las cifras de la solicitud y las
   diez temporadas íntegras del Histórico.
6. Crear commit local final, diff binario exacto contra C3, listado y ZIP
   de publicación desde ese único estado Git. Registrar SHA del ZIP y de los
   siete recursos. Excluir QA/perfiles/credenciales del artefacto; documentar
   con exactitud su inventario y cotejar sus recursos con Git.
7. Emitir READY FOR FINAL RELEASE AUTHORIZATION solo con las pruebas C4
   completas y manifiesto final revisado. Cualquier faltante implica BLOCKED.

## Integración posterior por PR #46

No ejecutar estos pasos durante la preparación. La autorización posterior
debe identificar HEAD, SHA del artefacto completo y SHA de los siete datos.
Si se exige una fecha de publicación, solicitar la fecha real aprobada,
modificar solo esos metadatos, regenerar hashes y volver a revisar el SHA.

Releer main, HEAD remoto del PR #46, CI, Pages y hooks. Deben coincidir con
la revisión. Mantener ancestralidad #43 → #44 → #45 → C2 → C3 → C4.
Tras autorización expresa de publicación de los siete datos, avanzar la rama
remota existente del PR #46 al HEAD final mediante fast-forward, sin force push.
Esperar el gate C4 y todas las regresiones sobre ese HEAD. No crear otro PR
ni cerrar #43/#44/#45. Antes del merge revisar de nuevo el estado.

Cada commit que se envíe y el mensaje del futuro merge commit deben comenzar
por `[CF-Pages-Skip]`; no usar los prefijos genéricos que suprimen GitHub CI.
Cloudflare documenta esa omisión por commit sin cambiar configuración:
https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/
El panel de controles de rama de Cloudflare no está verificado por C4.
La omisión no sustituye la comprobación de otros hooks/workflows de despliegue.
Cancelar ante un mecanismo adicional no revisado. No cambiar Access.

Con autorización del artefacto y merge, integrar una sola vez mediante merge
commit, sin squash/rebase. Código y datos deben llegar juntos a main.

## Verificación de GitHub Pages

URL y origen: `https://montealtoc7.github.io/Negocios_de_Cana_CASUR_APP/`.
Pages: `main:/`, legacy. Manifest conserva id/start_url/scope `./` y SW raíz.
No cambiar origen, instalación ni IndexedDB.

Esperar éxito de `pages-build-deployment` para el SHA integrado. Descargar por
red sin caché sw.js, manifest, versiones, runtime y siete datos. Cotejar hashes
con el artefacto autorizado y todos los recursos runtime; no aceptar despliegue
parcial. Repetir instalación nueva, transición desde 1.3.6, cifras/casos,
Histórico, PDF/PNG, aplazamiento, captura pendiente y reapertura offline.
Solo después evaluar el cierre autorizado de PR acumulados.

## Recuperación hacia adelante

Conservar commit/artefacto anterior, generación oficial íntegra, hashes y logs.
No borrar IndexedDB, Cache Storage, generaciones ni registros personales.
Descarga parcial o SHA inválido debe conservar LKG y no mover el puntero.
Código fallido: preparar un commit nuevo con App/SW superior, runtime íntegro
y regresiones; aprobar su SHA antes de publicar. Datos fallidos ya promovidos:
crear una generación oficial completa posterior desde el artefacto íntegro,
sin reutilizar identidad o rebajar punteros. Verificar Histórico y decisiones.
Las generaciones locales permanecen recuperables y las fijadas protegidas.
Una recuperación productiva necesita autorización expresa del artefacto nuevo.
