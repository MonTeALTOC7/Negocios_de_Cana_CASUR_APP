# Histórico multifinca · contrato de Etapa A

La selección vive por `farmCode`: `{ mode: "full" }` incluye todas las suertes
históricas elegibles de esa finca; `{ mode: "partial", lotIds: [...] }` incluye
solo las identidades explícitas. El catálogo procede de `APP_DATA.lotCompact`,
no del inventario vigente del Cronológico. Añadir la misma suerte dos veces no
duplica filas. Al quitar una suerte de una finca completa, la entrada pasa a
parcial. La selección y el período son estados independientes.

`CASUR_HISTORICAL_ENGINE.buildHistoricalMultiAnalysis(rows, selection, catalog,
mode, customZafras, producers)` es el contrato para el futuro tablero. Devuelve:

- `selection`: fincas, modo y `lotIds` efectivamente incluidos;
- `availableZafras` y `selectedZafras`: zafras reales del conjunto y período
  reconciliado (`latest`, `last3`, `last5`, `all`, `custom`);
- en personalizado, `requestedCustomZafras`, `unavailableCustomZafras` y
  `periodStatus` (`ready`, `partial`, `no-data`) conservan la solicitud original;
  si no hay coincidencia, `selectedZafras` queda vacío y los KPI muestran N/D,
  nunca la última zafra en sustitución silenciosa;
- `consolidated` y `farms[]`: área acumulada, área media por **zafra seleccionada**,
  `areaAverageObserved` por **zafra con registro**,
  TCH (toneladas válidas / área correspondiente), KATM ponderado por toneladas
  con KATM válido, edad ponderada por área válida, y cobertura;
- `metricCoverage`: denominadores auditables para TCH (`ton`, `area`,
  `eligibleArea`), KATM (`numerator`, `ton`, `eligibleTon`) y edad
  (`numerator`, `area`, `eligibleArea`), cada uno con `pct` cuando corresponde;
- `series[]`: agregados y calidad por zafra, incluidas listas de fincas y suertes
  que aportaron o faltaron, para gráficos y tablas posteriores;
- `currentDistance`: Km de referencia vigente y cobertura, independiente del
  filtro histórico. Cada finca tiene su propia `currentDistance`.

`areaAverage` usa como denominador todas las zafras **efectivamente
seleccionadas** en el conjunto. `areaAverageObserved` divide la misma área
acumulada entre las zafras con registro de la finca. Ejemplo: finca con 10 ha
en 2021 y sin fila en 2022, con ambas zafras disponibles en la selección
multifinca: media del período = 5 ha/zafra seleccionada; media observada =
10 ha/zafra con registro, cobertura 1/2. La primera es un cociente de período,
**no** una cosecha de 0 ha atribuida a 2022. La interfaz muestra ambas cifras
cuando difieren. Si existe una fila con área nula/no positiva, ambas medias
se presentan como N/D. TCH, KATM y edad mantienen sus fórmulas vigentes y
exponen cobertura sobre el área o tonelaje elegible, sin imputar faltantes.

Conciliación oficial de referencia, con Dolores (256) completa y solamente
`98301` y `98302` de Rancho Peirano (983):

| Período | Área acumulada | Área principal | TCH | KATM | Suertes con dato |
| --- | ---: | ---: | ---: | ---: | ---: |
| Última, 25/26 | 188.78 ha | 188.78 ha | 40.57 | 103.90 | 11/17 |
| Últimas 3, 23/24–25/26 | 566.52 ha-zafra | 188.84 ha/zafra | 48.92 | 108.56 | 11/17 |

La edad ponderada del combinado es 11.80 meses en Última, con 123.00/188.78 ha
válidas (65.16%); en Últimas 3, 11.60 meses con 500.74/566.52 ha válidas
(88.39%). El detalle desplegable de calidad presenta además las coberturas
de área para TCH y de toneladas para KATM. Las tablas en móvil muestran una
pista explícita de desplazamiento horizontal.

Dolores sola en las últimas 3 concilia con su ficha individual: 475.89
ha-zafra, 158.63 ha/zafra y 45.35 TCH. En 19/20 la selección combinada suma
377.74 ha. El ejemplo de 399.62 ha incluye 21.88 ha de `98303`, una suerte
**no seleccionada**; no se modifica el dataset para reproducir esa cifra.

Etapa A no cambia los exportadores ni incorpora el dashboard/PDF ejecutivo.
Gráficos, tablas y reportes de etapas posteriores deben consumir este mismo
resultado, sin reconstruir sus propias ponderaciones.

## Verificación del cierre focal del PR #23

- `cd modules/produccion && npm test`: 22 controles estáticos y 96 pruebas.
- `cd modules/tch && npm run validate`: validación estática y 91 pruebas.
- `node --test tests/*.test.mjs`: 48 pruebas de shell/GEO; `node --check`
  en los JS modificados y `git diff --check` sin observaciones.
- QA reproducible: servir el repositorio por HTTP y ejecutar
  `node modules/produccion/tools/qa-multifinca-browser.cjs` con Playwright
  disponible externamente. `CASUR_PREVIEW_URL`, `CASUR_CHROME_EXECUTABLE` y
  `CASUR_QA_OUT` permiten fijar la instancia aislada y carpeta de capturas.
  El guion verifica valores DOM, denominadores, selección parcial, ausencia
  de sustitución de período, desplazamiento móvil y consola en 1440×900 y
  390×844. Bloquea Service Worker en ese contexto para no alterar cachés.

Riesgo residual: la suite Python del pipeline GEO requiere `geopandas`, ausente
en los Python locales examinados; el pipeline y los datos GEO no se modifican
en este cambio. La prueba de navegador usa los datos oficiales cargados en la
aplicación local, pero no sustituye la revisión manual de campo.
