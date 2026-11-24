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

### Bloqueo exacto en esta sesión

- **Credenciales:** el entorno cloud no tiene `CLOUDFLARE_API_TOKEN` ni `CLOUDFLARE_ACCOUNT_ID`. No hay workflow de despliegue de previews en GitHub Actions. Las previews anteriores las publicó el supervisor con sus propias credenciales.
- **Red:** `api.cloudflare.com` y `*.pages.dev` son alcanzables.
- **Requisito para desplegar:** un token de API de Cloudflare con permiso `Cloudflare Pages: Edit`, limitado a la cuenta del proyecto. Se guarda como secreto de red del entorno, nunca en el repositorio ni en el chat.

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

## 3. Estrategia de integración recomendada

**Un único PR de consolidación hacia `main`**, no merges en cascada.

- **Por qué no en cascada:**
  - Integrar #62, #64, #68, #69 y #71 uno a uno publicaría cinco estados intermedios en producción, porque Pages sirve `main`.
  - Las PWA rechazan bajar de generación, así que un estado intermedio con datos 1101 seguido de 1102 obligaría a actualizar dos veces.
  - Cada paso exigiría su propia subida de versión según `check-release-policy`.
- **Procedimiento**, solo con autorización explícita del propietario:
  1. Confirmar que `main` sigue en `71d5e0b`. Si cambió, crear la rama de candidata desde `ecda05f` e integrar `main` con merge, sin rebase. Luego regenerar `tools/runtime-assets.mjs --write` y `sync-versions`, y repetir las suites y el QA del navegador.
  2. Crear `claude/candidata-ux13-z2627` desde `ecda05f` y el commit de documentación posterior. Abrir un PR Draft hacia `main` para que el **Release Gate de PR** corra completo, con `check-release-policy` contra el SHA base real.
  3. Integrar PR #70 antes o junto con la candidata, para eliminar la prueba intermitente del Gate.
  4. Con la preview aprobada y el Gate de PR en verde, el propietario decide el merge, que es la publicación. Usar merge commit, no squash, para conservar la trazabilidad de los commits de datos.
  5. Al publicar, cerrar #62, #64, #68, #69 y #71 como «consolidados en el PR de candidata». Los PR apilados no se fusionan individualmente.
- **Reversión:** ver «Plan de reversión» en `docs/PLAN_COSECHA_Z2627.md`. Se restaura el código anterior y se publica una generación de datos posterior; nunca se publica una generación anterior.

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
