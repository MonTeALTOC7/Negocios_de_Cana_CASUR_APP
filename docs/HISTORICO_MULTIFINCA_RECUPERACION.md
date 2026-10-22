# Histórico multifinca: extensión de la ficha histórica

Base: PR #23, `feat/historico-multifinca-etapa-a`, commit
`87aab0bc443cd479b34440746f3db27b16678f08`.
Rama: `codex/historico-multifinca-recuperacion`.

## Comportamiento

La selección completa/parcial de Etapa A sigue siendo la única selección.
El consolidado y las fincas usan `kpi()` y `historicalChart()`, con sus
interacciones TCH/KATM y tooltip existentes. Cada finca recibe exclusivamente
las filas de sus CodSuerte seleccionados. El motor histórico no cambia.

Los cinco KPI principales son TCH, KATM, distancia ponderada vigente, área
cosechada (promedio por zafra en períodos múltiples) y edad. Toneladas y
denominadores se mantienen en tablas o detalle de calidad secundario.
Km utiliza los numeradores y áreas vigentes de `buildHistoricalMultiAnalysis()`;
no depende de la zafra ni promedia los Km redondeados de las fincas.

La comparación entre fincas comparte la estética SVG del Histórico y usa una
escala común. Las series y tablas usan las agrupaciones del motor. La tabla de
fincas se ordena por TCH o KATM. «Ver finca» abre su sección; «Ver ficha» de
una suerte abre la ficha canónica. «Analizar selección» recupera el conjunto
con su período propio después de consultar una ficha individual.

Las tablas móviles conservan desplazamiento horizontal y una indicación
visible. Los análisis por finca son desplegables. Una finca completa incluye
también identidades históricas sin registros en el período; el PDF enumera
los CodSuerte seleccionados, y sus tablas productivas contienen los observados.

## Exportación

El exportador existente `CASUR_VISUAL_EXPORT` conserva los destinos históricos
individuales y cronológicos. El destino `historico-multiple` construye un clon
con consolidado, comparación, todas las fincas (aunque estén contraídas),
gráficos, tablas e identificación exacta de la selección.

Se conserva el mecanismo canvas/PDF paginado existente. Un tercer argumento
optativo con límites de bloques/filas evita cortes indebidos en multifinca;
los demás destinos conservan el comportamiento anterior. Se fija la fuente
del clon multifinca para que la medición DOM y la imagen SVG coincidan.
La leyenda usa símbolos SVG con colores explícitos conservados al exportar.

## Conciliación oficial

Dolores 256 completa + Rancho Peirano 98301 y 98302:

| Período | Área acumulada | Área media | TCH | KATM |
|---|---:|---:|---:|---:|
| Última 25/26 | 188.78 ha | 188.78 ha | 40.57 | 103.90 |
| Últimas 3 | 566.52 ha-zafra | 188.84 ha/zafra | 48.92 | 108.56 |

Km vigente conjunto: 36.10 km; Dolores: 36.09 km; Rancho Peirano parcial:
36.17 km. Estos datos se consultan desde el Cronológico oficial vigente.
Edad: 11.80 y 11.60 meses respectivamente; cobertura en detalle de calidad.

## Verificación y reproducción

```powershell
npm test --prefix modules/produccion
npm run validate --prefix modules/tch
node --test tests/*.test.mjs
node --check modules/produccion/tools/qa-multifinca-recovery.cjs
node --check modules/produccion/tests/historical-engine.test.mjs
node --check modules/produccion/tests/validate-static.mjs
git diff --check
```

- Producción: 22 controles estáticos, incluidos scripts inline; 99 tests.
- TCH: validación estática y 91 tests.
- Shell/GEO: 48 tests; incluye hashes GEO, cachés/LKG e integridad de versiones.
- Regresiones nuevas: exclusión de suertes no seleccionadas y paginación sin
  omitir filas ni dividir los bloques con límites disponibles.
- Navegador Chromium aislado: 1440×900 y 390×844. Última, Últimas 3,
  Últimas 5, Todas y personalizado 19/20 + 25/26; completa + parcial;
  dos completas; reducción a una finca; TCH/KATM; ausencia de overflow.
- Fichas individuales de Dolores y 98301: gráficos, tablas, PDF; PNG de Dolores.
- Cronológico Pansaco: ficha y descarga PDF. Navegación a análisis de zonas
  histórico y cronológico sin excepciones JS.
- Shell: un iframe, selección oficial y recarga offline con caché precargada,
  conciliación 48.92 TCH y descarga del PDF sin conexión.

Para QA navegador se usa Playwright externo al proyecto:

```powershell
$env:NODE_PATH='C:\Users\ctije\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
$env:CASUR_CHROME_EXECUTABLE='C:\Users\ctije\AppData\Local\ms-playwright\chromium_headless_shell-1243\chrome-headless-shell-win64\chrome-headless-shell.exe'
$env:CASUR_QA_OUT='C:\Users\ctije\Videos\CASUR_Historico_Recuperacion_QA'
node modules/produccion/tools/qa-multifinca-recovery.cjs
```

Preview: ejecutar `py -m http.server 4195 --bind 127.0.0.1` en la raíz,
y abrir `http://127.0.0.1:4195/#/modulo/produccion`.
Histórico → Selección múltiple → buscar 256 → Agregar finca completa →
buscar 983 → marcar 98301 y 98302 → Analizar selección.

## Evidencias y límites

Las capturas, PDFs y `qa-results.json` se guardan fuera del repositorio en
`C:\Users\ctije\Videos\CASUR_Historico_Recuperacion_QA`.
El PDF parcial y el de dos fincas completas se descargaron y se revisaron
página por página con Poppler: tres páginas cada uno, sin páginas vacías.
El PDF individual también se renderizó y revisó.

La prueba móvil usa viewport Chromium; queda pendiente la aprobación visual
del usuario y prueba en teléfono físico. Offline significa recarga después
de precache, no primera instalación sin red. No se probó estrés con cientos
de fincas: el exportador raster conserva sus límites de memoria/tamaño.
El PDF es gráfico, como el exportador original; no ofrece texto seleccionable.
No se modifica SW ni se prueba actualización instalada en producción.

Main, PR #23, PR #24, motor histórico, datasets, GEO, TCH y versiones se
mantienen sin cambios. No hay merge ni despliegue.
