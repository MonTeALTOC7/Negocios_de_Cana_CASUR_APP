# Plan de Cosecha y aforo Z26/27 — generación `2026.11.22-aforo.1102`

Issue #67 · Rama `claude/plan-cosecha-z2627-aforo-nov22`, apilada sobre UX13-C (`79f0cdb`, PR #68 → #64 → #62).
Generación anterior: `2026.10.25-aforo.1101` (C4). **No publicada** (`publishedAt: null`). SIAGRI no se modifica.

## Fuentes (no versionadas en el repositorio)

| Archivo | Hoja | SHA-256 | Uso |
|---|---|---|---|
| `Productores _Servicios_Z2627.xlsx` | `AFORO_26-27` (encabezados fila 3, 1,046 filas) | `2e3cfedb0682024753f7dca7f484326641e281bf018de44f823052369dfada60` | Fuente oficial importada |
| `CASUR_Actualizacion_Oficial_Propuesta_Plan_Z2627_Plantilla.xlsx` | `MAESTRO Z2627` y 8 más | `3277b48696d426b7906ccb6a0fedc0cfe2ceb55570cef0147455633c75d013fe` | Valores vigentes autorizados, ajustes y control |

El Issue documentaba el original como `7a44b75b…`. El archivo recibido es ese original **con AH de AIDOSA 908/09, 10 y 15 ya cambiado a «Semilla»**, que es la corrección autorizada. Se comparó celda a celda en 12 columnas (E, H, N, O, R, AD, AE, AF, AG, AH, BE, BF) × 1,046 filas contra los valores de fuente del consolidado:
- 1,043 filas idénticas.
- Las restantes difieren solo por esa edición, por las celdas que el consolidado deja vacías en filas no Molienda y por Investigación excluida.

El propietario autorizó continuar con este archivo.

## Construcción reproducible

`tools/plan-z2627/build-aforo-z2627.cjs` ejecuta en Chromium los **mismos motores de la app**: `XLSX.read` → `workbookSheets` → `inspectSheets` → `parseCandidate` → `prepareUpdate` → `CASUR_BUILD_CRONO_DATA`. Detalle:

- **Mapeo explícito por letra de columna**, igual al de la 1101 salvo AD (`actTCH`) y BE (`Fecha Cosecha`).
- **«-» en AD/AE/AF/AG** de filas no Molienda (AIDOSA, 12 celdas) se lee como vacío. En Molienda sería error.
- **Ajustes autorizados** (`tools/plan-z2627/ajustes-autorizados.json`, 13 entradas). Cada uno exige que el valor de origen sea su «antes»:
  - Freddy Sovalvarro: NC 10 en 6/03, 6/03A y 6/04; último corte de 6/03A, 6/04 y 6/07.
  - 759/06: NC 1.
  - Siembras: 125/03, 759/06, 908/06, 908/16, 993/24A y 993/25.
- **Valores ya presentes en la fuente**, verificados: AIDOSA → Semilla y San Lucas 20/03 → 90 TCH.
- **Destino:** «Semilla AS» y equivalentes se muestran como «Semilla» (64 filas); el valor bruto queda en `provenance.destination`.
- **Plan BE/BF:** solo para Molienda. En las 100 filas no Molienda la fecha y el corte del plan quedan vacíos; el valor bruto se conserva en `provenance.proposedDate`.
- **Escenario optimista AF/AG** en `forecastOptimistic`, solo para Molienda con estimado utilizable. Nunca alimenta los KPI oficiales.
- **Alerta de programación:** BE a menos de 6 meses de la fecha base. Solo **6/04** (24-dic-2026, 3.55 meses desde 07-sep-2026). BE no se modifica.
- **Validación fila a fila** contra `MAESTRO Z2627` (clase, área activa/molienda/semilla, t oficial y optimista, NC, siembra, último corte, destino, BE, BF, AD): **0 diferencias en 1,053 identidades**.
- **Archivos generados:** `cronologico`, `version`, `integrity` e `historico`. El Histórico conserva registros idénticos y solo cambia `meta.dataVersion`, verificado.

## Controles (todos superados)

| Control | Valor |
|---|---|
| Identidades / inventariadas / catálogo sin presencia / haciendas | 1,053 / 1,046 / 7 / 100 |
| Molienda | 946 suertes · 9,101.68 ha · 561,658.27 t · TCH 61.7093 |
| Semilla | 49 suertes · 472.98 ha |
| Área activa | 9,574.66 ha (sin cambio por suerte) |
| Fuera de producción (visibles, 0 ha activa) | 58 = 34 Sin Caña + 15 Baja rentabilidad + 2 Investigación (3.08 ha de origen) + 7 catálogo |
| Plan | 946 Molienda con fecha y corte; 787 mecánicas, 159 manuales; 897 BE cambian, 49 iguales, 0 cambios de tipo de corte |
| Optimista | 597,888.40 t · 65.6899 TCH · AF < AD en 14/27, 125/04 y 993/19 (informados, sin corregir) |
| 100 haciendas | idénticas a la hoja «POR HACIENDA» del consolidado |

## Cambios de código

- **`core/imports/operational-import.js`:** alias `Fecha Cosecha` en `proposedDate`. Es la lista que autoriza las cabeceras de fecha de plan.
- **`modules/produccion/js/casur-enhancements.js`:** registra el SHA del AFORO auditado en las fuentes de aforo autorizadas. Sin esto la app trata el aforo como «no aplicado». No hay otro cambio de motor.
- **`maestro-ux.js/css`:**
  - KPI **«Fecha para cosecha 26/27»** (renombra el KPI original; también en exportaciones).
  - Desplegable **«Escenario optimista»** cerrado por defecto en Estimados (General y finca).
  - La ficha de suerte separa **F. siembra** y **F. último corte** de la fecha programada BE.
  - Alerta «Revisar con Programación» en 6/04.
- **Guardas actualizadas** con una rama explícita para 1102, sin relajar 1101: `validate-static.mjs`, `geo-integration`, `historical-engine`, `maestro-ux.test.mjs` (solo admite la línea del nuevo hash; datos por `integrity.json`) y `check-context-hotfix.mjs` (manifiesto `tools/release-data-manifest.json` encadenado a C4).

## Pendientes y advertencias

- 125/03: riego Secano conservado; no hay valor nuevo.
- 759/06, 993/24A y 993/25: variedad sin cambio; no hay variedad destino.
- 6/04: BE posiblemente desfasado (3.55 meses); requiere Programación.
- 15 avisos de conflicto destino/clasificación, del mismo tipo que en 1101 (por ejemplo 1927 y 2003). Prevalece AH.
- El libro mantiene en su cabecera «Version del 12.10.2026»; la fecha efectiva usada es la del consolidado, 22-nov-2026.
- La versión de App/Producción sigue en las candidatas 1.6.2/V1.8.3 (A+B+C+datos sin publicar). Debe consolidarse en un PR hacia `main` con el Release Gate real de PR.

## Plan de reversión

1. **Sin desplegar (estado actual):** cerrar el PR o revertir los commits de esta rama. `main` y las ramas A/B/C no cambian.
2. **Tras una publicación futura:** restaurar los siete archivos de `modules/produccion/data/` desde `79f0cdb` (generación 1101, SHA en `tools/release-c4-manifest.json`) junto con `tools/release-data-manifest.json`. Además, publicar una versión de datos posterior, porque las PWA rechazan generaciones más antiguas.
3. **En un dispositivo:** el Centro Maestro conserva la generación anterior («Recuperar versión anterior»); el Histórico y los otros módulos no cambian.
4. **Reconstrucción idéntica:** `node tools/plan-z2627/build-aforo-z2627.cjs <base con 1101> AFORO.xlsx CONSOLIDADO.xlsx OUT` (sin `--write`) reproduce los mismos bytes.
