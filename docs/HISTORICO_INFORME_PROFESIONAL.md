# Informe Histórico de Producción de Fincas

## Base y alcance

Rama hija `codex/historico-informe-profesional`, base PR #26 en
`9b68a675c26830e35b39ef8eb5ac7f4fab460c8e`. PR dependiente, no destinado a main.
Solo PDF multifinca, un helper matemático puro y pruebas/documentación.
No cambia pantalla, selección, TCH/KATM previos, datos, GEO, TCH biométrico,
SW, versiones, PNG ni builders de PDF individual/Cronológico.

## Corrección de paginación

Se reprodujo el caso A en una copia aislada del HEAD base: ejecutivo de 3 páginas
con página 2 casi vacía, completo de 6 con página 5 de dos filas huérfanas.
El problema era la combinación de recorte raster con saltos seguros/forzados.

Ahora se mide el DOM del clon antes de rasterizar. El planificador ordenado mantiene
tablas completas si caben en una hoja, agrupa cabecera/KPI/primer gráfico y permite
saltos de comparación según espacio. Solo las tablas mayores que una página se
dividen por filas, repitiendo títulos/columnas y evitando colas de 1-2 filas.
Los anexos comienzan obligatoriamente en hoja nueva. Cada página se rasteriza por
separado a 1920x2520; no se eliminan páginas ni píxeles de contenido después.
Un bloque imposible de alojar falla explícitamente, no se recorta silenciosamente.

Se reconcilian identificadores de todas las filas antes/después: cero pérdidas y
duplicados en los casos probados. La auditoría queda en
`CASUR_VISUAL_EXPORT.lastLayoutAudit` y en los JSON de QA.

## TAH y trazabilidad

El usuario acreditó expresamente KATM = kg azúcar / t métrica caña (2026-10-22).
`aggregateHistoricalTah()` utiliza filas normalizadas seleccionadas por el motor:

- Área positiva y toneladas/KATM finitos no negativos; cero observado es válido.
- Azúcar equivalente (t): suma de toneladas por KATM / 1000.
- TAH: azúcar equivalente / área de exactamente esas mismas filas.
- Excluye incompletos de ambos sumandos. Sin filas válidas: N/D.
- No redondea antes de presentar, no promedia TAH ni multiplica ponderados incompatibles.
- Devuelve área válida, caña válida, azúcar equivalente, filas válidas/excluidas y cobertura
  sobre área positiva conocida. Cobertura no acredita áreas desconocidas.
- Es un equivalente según KATM, no azúcar real medida en fábrica.

El PDF reemplaza edad solo en KPI ejecutivos por TAH. Conserva edad en anexos.
Incluye TAH global, por finca, zafra y subtotal. Las filas PERÍODO mantienen área media
por zafra y toneladas acumuladas diferenciadas. Los denominadores sin redondear
figuran en `data-tah-audit` del clon y en `qa-results.json` por cada tabla/KPI.

| Caso | Área válida ha-zafra | Caña válida t | Azúcar equivalente t | TAH t azúcar/ha |
|---|---:|---:|---:|---:|
| A: Dolores + 98301/04/04A, 21/22–25/26 | 937.03 | 50192.72 | 5303.3672039 | 5.659762445065789 |
| B: Dolores + 98301/02, últimas 3 | 566.52 | 27713.49 | 3008.697155 | 5.310840138035726 |

Cobertura TAH A/B: 100% del área positiva conocida. Caso B conserva 188.84 ha/zafra,
48.92 TCH, 108.56 KATM y 36.10 km vigentes. La conciliación de tablas se ejecuta
también por finca/zafra con sumas independientes sobre las filas seleccionadas.

## QA ejecutado

- Producción: `npm --prefix modules/produccion test`: 22 controles + 108/108 tests.
- TCH: `npm --prefix modules/tch run validate`: estática + 91/91.
- Shell/GEO: `node --test tests/*.test.mjs`: 48/48.
- `node --check` en JS/test/QA modificados; el validador Producción compila los scripts inline.
- `git diff --check`: sin errores de whitespace.
- `qa-multifinca-pdf.cjs`: KPI, columnas, métricas, estado visible inalterado,
  descargas reales a 1440x900 y 390x844; ya no impone una cantidad fija de páginas.
- `qa-multifinca-recovery.cjs`: filtros, selección, finca/suerte individual, PNG/PDF,
  Cronológico, zonas, shell y recarga offline precargada con descarga real de PDF.
- `qa-professional-pdf.cjs`: casos A/B en ambos tamaños; una finca/una zafra,
  dos fincas completas, cinco fincas/todas las zafras, personalizado 19/20 + 25/26,
  zafras sin registros N/D y estrés de tabla con 100 filas añadidas solo al DOM aislado.
- Tests sintéticos TAH: áreas diferentes, denominadores incompatibles, faltantes,
  negativos, ceros, selección parcial, precisión y ausencia de mutación.

| Selección | Ejecutivo | Completo |
|---|---:|---:|
| A, escritorio y móvil | 2 | 5 |
| B, escritorio y móvil | 2 | 5 |
| Una finca, última | 2 | 3 |
| Dos fincas completas, últimas 5 | 2 | 6 |
| Cinco fincas, todas | 4 | 13 |
| Personalizado 19/20 + 25/26 | 2 | 5 |

Se descargaron 17 PDFs del QA principal (16 oficiales y 1 estrés sintético),
se renderizaron todas las páginas con Poppler y se inspeccionaron mediante hojas
de contacto y vistas de detalle. Sin gráficos cortados, subtotales aislados ni
filas omitidas. El detector de baja densidad advierte en la página de dos tablas
de Dolores (14 filas completas) y en la cola sintética (19 filas): se revisan, no
se ocultan ni se eliminan. El espacio restante deriva de tablas atómicas/anexos,
no de páginas de 1-2 filas. `QA_POR_PDF.md` enumera cada archivo y advertencia.

## Reproducción

Servir una copia del commit en puerto aislado, no 4195. Configurar:

```powershell
$env:CASUR_PREVIEW_URL='http://127.0.0.1:4270/'
$env:CASUR_QA_OUT='C:/Users/ctije/Videos/CASUR_Informe_Profesional_QA/reproduccion'
# NODE_PATH apunta al runtime externo con playwright y sharp; Chromium y Poppler disponibles.
node modules/produccion/tools/qa-professional-pdf.cjs
node modules/produccion/tools/qa-pdf-evidence.cjs
```

Para revisión manual: abrir `/modules/produccion/`, Histórico, selección multifinca;
agregar Dolores 256 completa y marcar las suertes indicadas de Rancho Peirano 983;
Analizar selección, elegir período y descargar PDF ejecutivo/completo.

Evidencias en `C:/Users/ctije/Videos/CASUR_Informe_Profesional_QA/`:
`antes` reproduce base, `final` contiene descargas y todas sus páginas PNG,
`regresion` conserva exportaciones originales y shell offline, `logs` las suites.
El paquete de entrega lleva HEAD, manifiesto por PDF, denominadores y capturas.

## Límites

PDF raster: no texto seleccionable ni PDF accesible etiquetado. Teléfono emulado,
sin impresora/dispositivo físico. Offline probado tras precarga, no primera instalación
sin red. Cinco series y diez zafras revisadas; selecciones mucho mayores pueden
exigir más páginas y revisión de densidad gráfica. No se promete cantidad fija.
Los archivos sintéticos son estrés de paginación, no resultados oficiales.
No merge, despliegue ni modificación de main, PR #25 o PR #26.
