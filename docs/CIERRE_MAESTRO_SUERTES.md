# Cierre del Maestro de Suertes e integración de los PR pendientes

**Fecha:** 27-Nov-2026. **Estado:** desarrollo cerrado. Queda pendiente la validación del propietario y la integración autorizada.
**Rama final:** `claude/ux15-analisis` (PR #77). **Preview acumulativa:** ver la descripción del PR #77.

Sin merge, sin publicación en producción, sin cambios en SIAGRI, en los datos oficiales ni en los motores agronómicos.

## 0. Control de versión (28-Nov-2026)

| Elemento | Publicado (`main`) | Candidata (cadena #73 → #76 → #77) |
|---|---|---|
| SHA | `71d5e0b` (App 1.6.1, recuperación segura #60) | Rama de desarrollo `claude/ux15-analisis`: ver el HEAD del PR #77 |
| App Maestra | 1.6.1 | **1.6.2** |
| Producción | V1.8.2 | **V1.8.3** |
| Generación de datos | `2026.10.25-aforo.1101` | **`2026.11.22-aforo.1102`** (aforo oficial 12-Oct-2026, consolidado 22-Nov-2026) |

- **Versión:** no se incrementa en las iteraciones de UX14 a R3-3. App 1.6.2 y Producción V1.8.3 se fijaron en la candidata #73 y cubren toda la cadena, que se publica una sola vez. `check-release-policy` contra `71d5e0b` da 1.6.1 → 1.6.2 y V1.8.2 → V1.8.3.
- **Datos:** la generación 1102 no cambia. `check-context-hotfix` verifica sus siete SHA oficiales.
- **Ramas:**
  - #73 (`claude/candidata-ux13-z2627`, `7ee4dd3`) contiene `main` y los PR #62, #64, #68, #69, #70 y #71.
  - #76 (`claude/ux14-analisis-zona`, `f69b989`) contiene #73.
  - #77 (`claude/ux15-analisis`) contiene #76.
  - #74 (`claude/ci-preview-automatizada`, `78da2c4`) es independiente: solo el workflow de previews, sobre `main`.

**Funcionalidades incorporadas desde la versión publicada (1.6.1 / V1.8.2):**
- Generación 1102, con el aforo AFORO_26-27 y el plan de cosecha Z26/27 (BE/BF).
- Rediseño UX13 A/B/C: Cronológico General y de Finca, Estimados Z26/27, Histórico de Finca y de Suerte.
- Análisis por Zona (UX14), con Cronológico e Histórico por tipo de riego original.
- Cierre UX15 del Maestro de Suertes: selector unificado, Zonas, Estimados en Consultas y Análisis.
- Exportadores PDF/PNG:
  - Motor vectorial único (R1 a R3), con norma editorial permanente.
  - Nombres de archivo DD-MMM-AAAA.
  - Mapas vectoriales en todos los informes de finca, suerte y selección.
  - Períodos de zafras con histórico completo y zafras seleccionadas.
  - Líneas TCH y KATM histórico.
  - Funcionamiento sin conexión.

## 1. Alcance entregado

| Etapa | PR | Contenido |
|---|---|---|
| UX13 A/B/C | #62, #64, #68 (consolidados en #73) | Cronológico General y de Finca, Estimados Z26/27, semilla y buscador. Histórico de Finca y de Suerte. Pulido del Cronológico de Finca y de Zona |
| Plan de cosecha Z26/27 | #69, #71 (consolidados en #73) | Aforo AFORO_26-27, generación `2026.11.22-aforo.1102`, aforo 12-Oct-2026 y consolidación 22-Nov-2026 |
| Prueba de SW | #70 (incluido en #73) | Recuperación del Service Worker con reloj virtual |
| Candidata | #73 | App 1.6.2 y Producción V1.8.3 |
| UX14 | #76 | Análisis por Zona: Cronológico e Histórico por tipo de riego original, y exportadores de Zona |
| UX15 | #77 | Cierre del Maestro: selector unificado, Zonas, Estimados sobre el explorador existente, Análisis, y Consultas con su tarjeta de Estimados |
| Exportadores R1, R2, R2-2, R2-3, R3, R3-2 y R3-3 | #77 | Ver la sección 2 |
| Previews | #74 | Workflow «CASUR Preview Deploy» (Cloudflare Pages `casur-maestro-ux-review`). No toca el runtime |

## 2. Exportadores PDF/PNG: estado final

- **Motor único:** `modules/produccion/js/report-engine.js` produce, desde la misma lista de dibujo, un PDF vectorial (jsPDF 4.2.1, texto seleccionable, Inter incrustada) y un PNG de alta resolución dentro de los límites de Android.
- **Plantillas:** `report-models.js`.
- **Funcionamiento sin conexión:** todo va en el precaché de la PWA.
- **Norma permanente:** `docs/ESTANDAR_EDITORIAL_INFORMES.md`, referenciada desde el `README`.

| Informe | Botón | Nombre de archivo |
|---|---|---|
| Cronológico de Finca | Descargar PDF / imagen | `Cronologico_{Finca}_{DD-MMM-AAAA}` |
| Cronológico de Suerte | Descargar PDF / imagen | `Cronologico_{Finca}_Suerte_{NN}_{DD-MMM-AAAA}` |
| Histórico de Finca | Descargar PDF / imagen | `Historico_{Finca}_{DD-MMM-AAAA}` |
| Histórico de Suerte | Descargar PDF / imagen | `Historico_{Finca}_Suerte_{NN}_{DD-MMM-AAAA}` |
| Cronológico múltiple | Descargar PDF / imagen | `Cronologico_Multifinca_{DD-MMM-AAAA}` |
| Histórico multifinca | PDF ejecutivo / PDF completo / imagen | `Historico_Multifinca_Ejecutivo_…` / `Historico_Multifinca_Completo_…` |
| Cronológico de Zona | Menú de informe de la zona | `Cronologico_Zona_{Zona}_{DD-MMM-AAAA}` |
| Histórico de Zona | Menú de informe de la zona | `Historico_Zona_{Zona}_{DD-MMM-AAAA}` |

- **Mapas y períodos:**
  - Todos los informes de finca, suerte y selección llevan el mapa vectorial del ámbito, con lo informado resaltado y el resto en gris.
  - Los Históricos con más de dos zafras seleccionadas muestran los bloques «Histórico completo» y «Zafras seleccionadas».
  - El detalle está en `docs/EXPORTADORES_R1_R2.md`, sección R3-3.
- **Vistas que siguen en el motor anterior:** las de inicio del Cronológico y del Histórico, ambas fuera de este alcance. Usan el motor R1, que ya tiene el encabezado uniforme y la medición corregida.
- **Guardas de `index.html`:**
  - Solo cambian los bloques autorizados `R1-EXPORT` y `R2-EXPORT`, y la huella SHA-256 de cada uno está en `modules/produccion/tests/maestro-ux.test.mjs`.
  - Cualquier otro cambio en `index.html` sigue haciendo fallar la prueba.

## 3. QA final (HEAD de R3)

| Suite | Resultado |
|---|---|
| Informes (cuatro plantillas aprobadas) · `tools/qa-informes.cjs` | 27/27 |
| Informes R3 · `tools/qa-informes-r3.cjs` | 25/25 |
| UX14 · UX15 · Estimados | 23/23 · 15/15 · 13/13 |
| UX13 A · B · C | 110/110 · 90/90 · 85/85 |
| Plan Z26/27 | 55/55 |
| Pruebas unitarias del shell y de Producción (incluye las guardas de `index.html`) · TCH | 372/372 · 92/92 |
| `check-release-policy` (base `main` 71d5e0b) · `check-context-hotfix` | OK: shell 1.6.1 → 1.6.2, Producción V1.8.2 → V1.8.3; siete SHA de la generación 1102 |

La preview pública repite las suites de informes, UX14, UX15 y Estimados. Las cifras se actualizan en el PR #77 con cada preview.

## 4. Procedimiento de integración, solo con autorización expresa del propietario

**Principios:**
- Una sola publicación de la app.
- Merge commit, sin squash ni rebase.
- Ninguna publicación intermedia.
- GitHub Pages publica únicamente `main`, así que integrar entre ramas de la cadena no publica nada.

1. **Comprobar la base.** `main` debe seguir en `71d5e0b`. Si cambió, integrar `main` en `claude/candidata-ux13-z2627` con merge. Después:
   1. Regenerar `runtime-assets` y `sync-versions`.
   2. Llevar el cambio por la cadena (#73 → #76 → #77).
   3. Repetir las suites de la sección 3.
2. **#74 (previews) → `main`.** Solo registra el workflow; la app publicada no cambia. Después, en *Settings → Environments → casur-preview*, permitir `preview-deploy/*` y `main`, además de `preview-deploy/pr-73`.
3. **Plegar la cadena hacia la candidata, sin publicar:**
   1. **#77 → `claude/ux14-analisis-zona`.** Merge commit; GitHub marca #77 como integrado.
   2. **#76 → `claude/candidata-ux13-z2627`.** Merge commit; GitHub marca #76 como integrado.
4. **Verificar la candidata final.** #73 contiene entonces todo el trabajo. Sobre su HEAD:
   1. Release Gate de PR completo, que se dispara con `pull_request` hacia `main` e incluye `check-release-policy` contra la base real.
   2. QA de navegador de la sección 3.
   3. Preview HTTPS verificada por SHA.
   4. Revisión del propietario en PC y Android.
5. **Publicar.** Con la preview aprobada y el Gate en verde, el propietario hace el merge de **#73 → `main`** (merge commit). Es la única publicación. Las PWA reciben App 1.6.2 y Producción V1.8.3 con la generación 1102.
6. **Limpiar después de publicar:**
   1. Cerrar #62, #64, #68, #69 y #71 como «consolidados en #73». El #70 queda integrado por su commit.
   2. Deshabilitar en Actions el workflow temporal «PR71 - One-time aforo provenance correction».
   3. Conservar las ramas `preview-deploy/*` mientras se usen las previews.
7. **Reversión.** Seguir el «Plan de reversión» de `docs/PLAN_COSECHA_Z2627.md`: restaurar el código anterior y publicar una generación de datos posterior, nunca una anterior.

**Alternativa equivalente:** cambiar la base de #77 a `main` y hacer un solo merge. Publica lo mismo, pero #73 y #76 quedarían abiertos y habría que cerrarlos a mano. Se recomienda el procedimiento anterior porque conserva el historial de cada PR.

## 5. Fuera de alcance, sin nuevas fases

- **UX16:** familias de Estimados (`docs/DIAGNOSTICO_ESTIMADOS_UX16.md`). Está registrado y no se desarrolló.
- **Integración GIS / Riego:** excluida.
- **QA heredado:** `qa-shell-module-icons.cjs`, `qa-startup-timing.cjs` y `qa-bundle-public-comparison.cjs` aún esperan `#mBack` a 1536 px (ver `docs/INTEGRACION_CANDIDATA_UX13_Z2627.md`). Es mantenimiento aparte; no afecta al runtime.
