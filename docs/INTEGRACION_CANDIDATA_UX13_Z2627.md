# Candidata UX13 + Plan Z26/27: preview e integración hacia `main`

Estado al 24-Nov-2026. Este documento no autoriza merge ni publicación. GitHub Pages publica `main`, así que **cualquier merge a `main` equivale a publicar producción**.

## 1. Composición de la candidata

| Etapa | PR | Rama | HEAD |
|---|---|---|---|
| UX13-A | #62 | `claude/ux13-cronologico-finca-estimados` (base `main`) | `03968a1` |
| UX13-B | #64 | `claude/ux13-historico-finca-suerte-etapa-b` | `34ca962` |
| UX13-C | #68 | `claude/ux13c-historico-crono-zona-pulido` | `79f0cdb` |
| Plan Z26/27, datos 1102 | #69 | `claude/plan-cosecha-z2627-aforo-nov22` | `fc59ac6` |
| Aforo 12-Oct-2026 y fechas DD-MMM-AAAA | #71 | `claude/plan-z2627-fecha-aforo-12oct` | `ecda05f` (código y datos) |

- **Historia lineal:** cada HEAD contiene al anterior, y `main` (`71d5e0b`) es ancestro de todos sin commits nuevos. `ecda05f` es por sí solo la candidata completa: 19 commits y 43 archivos sobre `main`.
- **Versiones candidatas:** App 1.6.2 y Producción V1.8.3. Datos `2026.11.22-aforo.1102`, con aforo del 12-Oct-2026.
- **PR #70 (prueba intermitente del SW):** es independiente y apunta a `main`. Solo toca `tests/sw-release-recovery.test.mjs`, no se solapa con la candidata y su merge es limpio (`git merge-tree`).

## 2. Preview HTTPS consolidada

### Infraestructura existente reutilizable

- **Proyecto a usar:** el proyecto Cloudflare Pages `casur-maestro-ux-review`. Se usó en PR #48 a #58 para previews de revisión.
- **Modo de publicación:** carga directa de un artefacto externo generado desde un SHA completo, en entorno Preview y con la rama del PR como alias.
- **URLs:** cada despliegue publica una URL inmutable `https://<hash>.casur-maestro-ux-review.pages.dev/Negocios_de_Cana_CASUR_APP/` con `__preview.json`. Por ejemplo, `99b83c0e…` corresponde a PR #56, `bd68faa`, App 1.5.6. El dominio raíz del proyecto no tiene despliegue de producción («Deployment Not Found»).
- **Proyecto que no se usa:** `casur-negocios-preview` (docs/PREVIEW_CLOUDFLARE.md) es la preview cifrada y protegida con Access de PR #45. Su constructor solo admite la rama `codex/estimados-plan-consulta-b2`.
- **Producción:** no se toca. No hay despliegue a GitHub Pages ni cambio de `sw.js`. El SW fuente ya normaliza respuestas HTML redirigidas, por lo que no se requiere adaptación en el artefacto.

### Bloqueo exacto (actualizado 24-Nov-2026)

- **Credencial:** el entorno «APP Negocios de Caña» tiene un secreto de red para `api.cloudflare.com` («Cloudflare Pages preview token»). Se guardó dos veces mediante el formulario seguro; el valor nunca se ve ni se imprime.
- **Síntoma:** todas las llamadas responden `6003 / 6111 Invalid format for Authorization header`, también `GET /user/tokens/verify`.
- **Diagnóstico:**
  - El proxy de secretos sí inyecta el encabezado: sobrescribe `Authorization` aunque la petición no lo envíe o envíe un marcador. Por eso el problema no es un prefijo duplicado de nuestro lado ni la ausencia de inyección.
  - Cloudflare devuelve 6111 cuando el valor no tiene forma `Bearer <token>`. Un token bien formado pero incorrecto o sin permisos daría `1000 Invalid API Token` o 10000/403.
  - Por tanto, el valor guardado no tiene formato de token de API. Causas compatibles: se pegó «Bearer …» (queda «Bearer Bearer …»), hay espacios o saltos de línea, o se guardó la Global API Key o el ID del token en lugar del secreto.
- **Corrección:** en el entorno, Network secrets, reemplazar el valor por **solo** el secreto del token de API, sin la palabra «Bearer», con el encabezado `Authorization` y el prefijo `Bearer` que pone el formulario. El token debe tener el permiso «Account · Cloudflare Pages · Edit» limitado a la cuenta del proyecto. Con eso se despliega el paquete existente sin reconstruirlo.

### Solución viable: sesión local de Wrangler (procedimiento anterior)

- **Origen del procedimiento:** las previews anteriores de `casur-maestro-ux-review` se desplegaron con Wrangler autenticado en el PC del propietario (`.wrangler/` en `.gitignore`; evidencias en `C:/Users/ctije/AppData/Local/CASUR/QA`). No se volverá a probar el token del proxy.
- **Kit:** `deploy-candidata-ecda05f.mjs` más `SHA256SUMS.txt`, entregados fuera del repositorio. Hace lo siguiente:
  1. Obtiene `ecda05f` desde Git y construye el paquete con la herramienta del propio commit.
  2. Aplica los mismos ajustes del artefacto.
  3. **Exige que los 198 archivos sean idénticos byte a byte** al paquete aprobado. Si no, se detiene.
  4. Solo con `--deploy` ejecuta `wrangler pages deploy` en `casur-maestro-ux-review`, rama `claude-plan-z2627-fecha-aforo-12oct`, entorno Preview.
- **Garantías:** no toca producción, GitHub Pages ni Access.
- **Prueba en el entorno cloud:** «VERIFICADO: 198 archivos idénticos».
- **Ejecución sin comandos del propietario:** el propietario habilita una carpeta del checkout en Claude Desktop (Ajustes → Claude Code → Remote Control). Esta sesión la solicita con aprobación explícita y ejecuta el kit allí, con la sesión de Wrangler existente; las credenciales nunca salen del PC.
- **Verificación posterior:** `__preview.json.head` = `ecda05f…`, generación 1102, «Cron 22-Nov-2026», «Último Aforo 12-Oct-2026» y funcionamiento sin conexión.

### Condiciones de acceso de la preview

- **Los despliegues de `casur-maestro-ux-review` son públicos.** Por ejemplo, `99b83c0e…/modules/produccion/data/cronologico.json` responde 200 sin autenticación. Solo llevan `X-Robots-Tag: noindex, nofollow`, que **no protege el acceso**.
- No hay Cloudflare Access en ese proyecto. No se modifica Access sin autorización.
- **Exposición:** el repositorio `MonTeALTOC7/Negocios_de_Cana_CASUR_APP` es **público**, y los datos de la generación 1102 ya están en la rama del PR #71. GitHub Pages de producción (1101) también es público.
  - La preview no agrega datos que no estén ya publicados en GitHub, pero sí **una URL pública más** con el plan de cosecha.
  - Si el propietario requiere acceso restringido, debe autorizar expresamente Access para ese proyecto antes de desplegar.

### Paquete reproducible

1. Construir el paquete con el script existente, en un directorio nuevo fuera del checkout:
   `node tools/package-maestro-preview.mjs ecda05f93acb53573febbbce4d9bc21fa8a7ddf1 <DIRECTORIO_NUEVO>`
   - Genera 195 archivos copiados byte a byte del commit, con el prefijo `Negocios_de_Cana_CASUR_APP/`.
   - Solo incluye activos del manifiesto de runtime y datos operativos.
   - No incluye Excel, `docs/`, `tools/`, `tests/` ni `.git`.
2. Ajustar el artefacto. Estas modificaciones no afectan el código:
   - En `__preview.json`, `branch` = `claude/plan-z2627-fecha-aforo-12oct` y `pullRequest` = 71. Agregar `candidate`, `dataVersion`, `aforoDate` = `2026-10-12` y `consolidated` = `2026-11-22`. El script fija la rama de PR #48 en la procedencia.
   - Eliminar `vercel.json`.
   - Agregar `_redirects` con `/  /Negocios_de_Cana_CASUR_APP/  302`.
   - Agregar `_headers` con `noindex` y `no-cache` para `sw.js`, `runtime-assets.json` y `__preview.json`.
3. Verificar:
   - Cada archivo es idéntico a `git show ecda05f:<ruta>`.
   - Los SHA-256 de datos coinciden con `integrity.json`: `cronologico.json` `ed5e2cb2…`, `version.json` `411f020d…`.
4. Desplegar:
   `npx wrangler pages deploy <DIRECTORIO> --project-name casur-maestro-ux-review --branch claude-plan-z2627-fecha-aforo-12oct --commit-hash ecda05f93acb53573febbbce4d9bc21fa8a7ddf1 --commit-dirty=false`
5. Aceptación:
   - `__preview.json.head` = `ecda05f…`.
   - `version.json` muestra generación 1102 y `tchEst2627EffectiveDate` = `2026-10-12`.
   - Cabecera «Cron 22-Nov-2026» y KPI «Último Aforo 12-Oct-2026».
   - Funciona sin conexión tras la primera visita.
   - Revisión del propietario en Android y PC.

**Verificación local del paquete (servidor estático):**
- `__preview.json` coincide con `ecda05f`.
- Generación 1102, aforo 12-Oct-2026, cabecera «Cron 22-Nov-2026».
- 0 errores de página.
- Reapertura sin conexión correcta a 390 y 1536 px.
- Shell en frío, navegación de zona, regreso, recarga y offline a 390 px: PASS.
- `qa-maestro-shell-e2e.cjs` a 1536 px espera un botón «Volver» que el shell de escritorio ya no muestra. Falla igual contra el servidor del repositorio, así que es una expectativa obsoleta del script y no un defecto del paquete.

## 3. Estrategia final de consolidación

**Un único PR de consolidación hacia `main` que incluye también el PR #70.** No hay merges en cascada ni publicaciones intermedias.

- **Por qué no en cascada:**
  - Pages publica `main`. Integrar #62, #64, #68, #69, #71 y #70 por separado serían seis publicaciones.
  - Habría estados intermedios con datos 1101 seguidos de 1102. Las PWA rechazan bajar de generación y actualizarían dos veces.
  - Cada paso exigiría su propia subida de versión según `check-release-policy`.
- **PR #70 (`a927dc1`, solo `tests/sw-release-recovery.test.mjs`):**
  - Es un único commit de prueba, no toca el runtime ni el manifiesto.
  - `git merge-tree` confirma un merge limpio sobre `ecda05f` y sobre el HEAD de documentación.
  - Se incorpora a la rama de candidata con un **merge commit** que conserva `a927dc1`. Cuando la candidata llegue a `main`, GitHub marcará el PR #70 como integrado, sin fusionarlo por separado y sin publicación propia.

**Procedimiento**, solo con autorización explícita del propietario:

1. Verificar que `main` sigue en `71d5e0b`. Si cambió, integrar `main` en la candidata con merge, sin rebase. Luego regenerar `runtime-assets` y `sync-versions` y repetir las suites y el QA del navegador.
2. Crear `claude/candidata-ux13-z2627` desde el HEAD del PR #71 y hacer `git merge --no-ff a927dc1` (PR #70). Comprobar que no cambian ni el runtime ni los datos.
3. Abrir un PR Draft hacia `main`. Se ejecuta el **Release Gate de PR completo**, incluido `check-release-policy` contra el SHA base real.
4. Repetir sobre ese HEAD el QA del navegador (Plan 55, UX13 A/B/C y shell e2e con el control de retorno vigente) y la preview HTTPS verificada por SHA.
5. Con la preview aprobada y el Gate en verde, el propietario decide el merge, que es la publicación. Usar **merge commit**, no squash.
6. Tras publicar, cerrar #62, #64, #68, #69 y #71 como «consolidados en el PR de candidata». El #70 queda integrado por su commit.

- **Reversión:** ver «Plan de reversión» en `docs/PLAN_COSECHA_Z2627.md`. Se restaura el código anterior y se publica una generación de datos posterior; nunca una anterior.

### Mantenimiento del QA del shell en escritorio

- **Problema:** `tools/qa-maestro-shell-e2e.cjs` esperaba el botón `#mBack` a 1536 px.
- **Causa:** desde la versión Petróleo (#58), `shared/styles/app.css` lo oculta a ≥1024 px. En escritorio el retorno se hace con la miga «Inicio» (`#mCrumb`), que usa el mismo manejador `navigateFromActiveModule('/', 'back-home')`.
- **Corrección:** el script usa `#mBack` por debajo de 1024 px y `#mCrumb` desde 1024 px, y verifica que el otro control esté oculto. Registra `returnControl` y mantiene todas las comprobaciones:
  - navegación de zona a Cronológico;
  - regreso al inicio (iframe cerrado);
  - segunda visita;
  - recarga en línea;
  - recarga sin conexión;
  - 0 errores de consola;
  - 0 peticiones fallidas.
- **Resultado** contra el paquete `ecda05f`, dos ejecuciones consecutivas: PASS a 390 px (`mBack`) y a 1536 px (`mCrumb`). Una ejecución previa falló una vez a 390 px por tiempo en la recarga en línea y no se reprodujo; queda registrada como intermitente.
- **Pendientes:** `qa-shell-module-icons.cjs`, `qa-startup-timing.cjs` y `qa-bundle-public-comparison.cjs` repiten la expectativa antigua de `#mBack` a 1536 px. Se corregirán con el mismo criterio en un mantenimiento aparte.

## 4. Release Gate: controles aplicables a la arquitectura vigente

| Paso del Gate | Condición | ¿Aplica a la candidata? |
|---|---|---|
| Verify release metadata (`sync-versions`, `runtime-assets`, `production-integrity`) | siempre | **Sí** |
| Enforce scoped release versions (`check-release-policy` contra la base del PR) | solo `pull_request` | **Sí, en el PR hacia `main`.** Verificado localmente contra `71d5e0b`: shell 1.6.1 → 1.6.2, Producción V1.8.2 → V1.8.3 |
| Verify C3 code-only integration candidate | solo la rama `codex/c3-integracion-casur-candidata` y sin `release-c4-manifest.json` | **No.** Es histórico de C3 y exige datos sin 1101 |
| Verify C4 final release candidate | solo si **no** existe `core/updates/context-store.js` | **No.** La arquitectura vigente tiene el hotfix de contexto; C4 queda como registro histórico de la publicación 1.5.1 |
| Verify context hotfix and unchanged official data (`check-context-hotfix`) | existe `context-store.js` | **Sí.** Valida los siete SHA de la generación 1102 con un manifiesto encadenado a C4 |
| Shell y guarda de datos (`tests/*.test.mjs`, 160) | siempre | **Sí** |
| Producción (212) | siempre | **Sí** |
| TCH (92) | siempre | **Sí** |
| Versión PWA coordinada (SW, `versions.js`, `index.html`) | siempre | **Sí** |

- **Sin cambios a los controles:** ningún control se desactiva ni se relaja. C3 y C4 no se ejecutan por sus propias condiciones, que no aplican a la arquitectura vigente.
- **Fuera del Gate pero obligatorio antes del merge:**
  - QA de navegador: Plan Z26/27 55/55, UX13 A 110, B 90, C 85.
  - PWA offline.
  - PDF/PNG en 360, 390, 768, 1280 y 1536 px.
  - Preview HTTPS verificada por SHA y revisión del propietario en Android y PC.
- **Trigger del Gate:** solo `pull_request` hacia `main` o la rama de hotfix. Por eso los PR apilados solo tienen el Gate manual (`workflow_dispatch`), que omite `check-release-policy`.
- **Higiene pendiente:** el workflow temporal «PR71 - One-time aforo provenance correction» sigue registrado en Actions aunque su archivo ya no existe. Deshabilitarlo desde la interfaz de Actions.
