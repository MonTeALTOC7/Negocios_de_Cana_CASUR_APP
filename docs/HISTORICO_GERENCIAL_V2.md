# Histórico multifinca - informe gerencial V2

Base: PR #27 (`5b95b27a5087d98bcdc396690bb94a8011d38a0d`). Rama hija: `codex/historico-informe-gerencial-v2`. Sin merge ni despliegue.

## Contrato y matemática

`buildHistoricalDualSummary()` compone las funciones existentes, sin cambiar sus contratos. Resuelve las mismas identidades finca/CodSuerte para ambos ámbitos. `full` usa todas sus zafras disponibles; `period` usa el filtro vigente. El modelo incluye selección, series, comparación, cobertura, denominadores y distancia actual. Pantalla y PDF consumen el mismo modelo y los mismos renderizadores de KPI y barras.

- TCH y KATM conservan los agregados validados del motor. No se promedian cocientes de fincas.
- TAH: `sum(ton * katm / 1000) / sum(area)` exclusivamente en filas con área positiva, toneladas no negativas y KATM no negativo, todos válidos. Numerador y denominador usan las mismas filas, sin redondeos intermedios. KATM = kg azúcar/t métrica de caña, unidad confirmada por el usuario. No equivale necesariamente al producto de TCH y KATM consolidados si sus denominadores difieren.
- `areaMean` presenta `areaAverageObserved` del motor; los campos originales `areaAverage` y `areaAverageObserved` permanecen auditables. La media divide el acumulado por zafras efectivamente observadas. Una zafra solicitada sin registros no acredita cosecha cero. Se conservan los conteos solicitados/observados y faltantes suerte-zafra. Área incompleta: N/D.
- TCH: cobertura por área compatible; KATM: por toneladas compatibles. Si el total necesario falta, cobertura no determinable. TAH incluye área válida, azúcar equivalente, filas excluidas y cobertura sobre el área conocida. No acredita cobertura de hectáreas cuyo valor falta.
- Km continúa calculado exclusivamente con áreas y Km vigentes del Cronológico, según el alcance completo/parcial de suertes. Una referencia logística, fuera de los KPI, informa cobertura parcial o ausencia.

Cambiar zafras no altera `full`; cambiar suertes recalcula ambos. Todas produce ámbitos equivalentes. El período es un subconjunto del histórico: diferencias no prueban causalidad.

## Presentación

Dos filas de cuatro KPI: área media, TCH, KATM, TAH. Histórico neutro; período verde. Unidad pequeña, acumulado secundario. Los gráficos históricos de líneas y las fichas individuales permanecen intactos. Tablas globales accesibles en «Detalle numérico por finca y zafra».

Comparación: dos/tres fincas, barras verticales agrupadas por zafra; mayor densidad, paneles horizontales por zafra, segmentados hasta ocho fincas. Los slots consideran `canvas.measureText()` de la misma fuente de etiquetas. El QA verifica rectángulos reales `getBBox()`, no solo ausencia de errores. Origen cero, escala común por métrica, valores y N/D visibles, leyendas por finca. Móvil usa desplazamiento horizontal local indicado, sin overflow de página. Una finca no genera comparaciones ficticias.

## PDF

Ejecutivo: encabezado, selección, ámbitos, referencia logística, dos tendencias y comparaciones. No contiene tablas globales. Completo: misma composición ejecutiva más anexos técnicos por finca, con comienzo obligatorio en hoja nueva. Se conserva el planificador de alturas DOM de #27, trazabilidad de filas y tablas grandes con encabezados repetidos. No se elimina contenido para reducir páginas.

Las páginas se comprimen a JPEG secuencialmente: se conserva el primer canvas para compatibilidad y se liberan los siguientes después de codificarlos. No se mantienen simultáneamente todos los canvas grandes. PDF raster: texto no seleccionable, limitación heredada.

## Reproducción

```powershell
npm test --prefix modules/produccion
npm run validate --prefix modules/tch
node --test tests/*.test.mjs
node --check modules/produccion/js/historical-engine.js
node --check modules/produccion/tools/qa-gerencial-v2.cjs
git diff --check
```

El test estático de Producción compila también los scripts inline del HTML. Playwright y Sharp externos (no se añaden dependencias al proyecto):

```powershell
$env:NODE_PATH='<runtime externo>/node_modules'
$env:CASUR_CHROME_EXECUTABLE='<ruta chromium>'
$env:CASUR_PREVIEW_URL='http://127.0.0.1:4280/'
$env:CASUR_QA_OUT='<carpeta de evidencias fuera del repo>'
node modules/produccion/tools/qa-gerencial-v2.cjs
node modules/produccion/tools/qa-pdf-evidence.cjs
# Usar otra carpeta para la regresión de exportaciones individuales y offline:
node modules/produccion/tools/qa-multifinca-recovery.cjs
```

`qa-professional-pdf.cjs` documenta la composición anterior de #27; el QA de composición vigente es `qa-gerencial-v2.cjs`. No se requiere cambiar SW, versiones, datos o cachés para el preview aislado.

## Conciliaciones y cobertura del QA

| Caso | Área media | TCH | KATM | TAH | Km vigente |
|---|---:|---:|---:|---:|---:|
| A: Dolores completa + 98301/98304/98304A, últimas 5 | 187.41 | 53.57 | 105.66 | 5.66 | 36.10 |
| B: Dolores completa + 98301/98302, últimas 3 | 188.84 | 48.92 | 108.56 | 5.310840138… | 36.10 |

Las cifras provienen de los datasets oficiales, no son constantes de presentación. QA automatiza invariancia temporal, selección parcial, Todas, personalizado no contiguo, ausencia de registros, 1/2/3/5 fincas, valores DOM/PDF, barras sin colisiones, filas y anexos. Produce PDFs descargados y PNG renderizados de cada página. Casos sintéticos verifican denominadores incompatibles y faltantes.

No se modifican datos oficiales, fórmulas vigentes, GEO, TCH, SW, versiones ni main. La revisión visual final humana sigue requerida. La emulación de teléfono no sustituye una prueba física de impresión o rendimiento en todos los dispositivos; selecciones mayores que las ensayadas pueden generar informes extensos.
