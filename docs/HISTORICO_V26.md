# Histórico V2.6 - cartografía híbrida gerencial

Rama hija de PR #34 (`b9b2b3c7be78ab1f7f0573b595847e7909c98953`). Alcance cartográfico; motor histórico, cifras, datos, versiones y Service Worker sin cambios.

## Implementación

El mapa multifinca conserva el modelo y caché de selección de V2.5. Usa Leaflet compartido, Híbrido inicial (Esri World Imagery + World Transportation), colores por finca, rellenos al 16%, halo claro y grosor adaptado al zoom. La leyenda queda debajo para no ocultar parcelas. Los enfoques por finca no modifican la selección analítica. Cambiar solamente zafras conserva el controlador existente.

Las etiquetas cortas verifican el prefijo de finca y el sufijo de suerte. CodSuerte continúa como identidad técnica y detalle interactivo. Se priorizan anchors oficiales interiores; intervalos de barrido proporcionan alternativas interiores respetando huecos y fragmentos. La colocación compara cajas, márgenes y alternativas con línea guía. Si no cabe una etiqueta, se lista explícitamente su código para acercarse/enfocar. En móvil puede ser necesario enfocar una finca. Los polígonos fuente no se modifican.

Opciones nuevas de `createCasurMap`: `outlineHalo`, `cartographicLabels`, `cartographicLabel`, `cartographicLabelScale`, `onLabelLayout`. Son optativas; los consumidores individuales conservan sus opciones anteriores. Las etiquetas se ocultan durante el movimiento y se recalculan al terminar.

El PDF usa un visor temporal independiente de 1400x1000, captura secuencial y liberación de mapas/canvas. Reutiliza espera de mosaicos, inlining CORS y captura GEO. Espera 20 s por capa completa; cada descarga para inlining tiene límite de 15 s. Dibuja cada viewport SVG según sus bounds reales, evitando la doble transformación de html2canvas. La captura multifinca no necesita importar html2canvas. Conserva atribución Esri y referencia vial en el pie. Los mapas alejados admiten paneles por finca. No cambia la paginación productiva.

Un fallo de mosaicos no produce una imagen híbrida parcial. Cancelar la confirmación permite reintentar; aceptar explícitamente genera un informe identificado SIN mapa base. Si tampoco existe GEO se informa su ausencia y se conservan resultados productivos. Los fallos liberan el host temporal. No se crea caché masiva de imágenes ni se cambia el SW.

## Diagnóstico independiente de cobertura

Histórico publica `2026-07-24-maestro-26-27-r2`, schema 2, EPSG:4326. Fuente `Maestro_26_27_2472026_QGIS_SHP.zip`; SHA-256 `02636373feb1d3ab79ee0d83e028018c60e7798a5b09eec761297fd522d12170`.

El archivo local homónimo de GeoStudio tiene exactamente ese SHA. Lectura del DBF original: Dolores tiene 9 CodSuerte y Peirano 11; todos están en los GeoJSON publicados. GeoStudio se inspeccionó en modo de solo lectura (HEAD `828a98a9588c871f71d8386d9ffd82a696d5ca18`). Esto acredita la fuente local, no qué proyecto pudo haber cargado la captura del usuario.

Dolores: 25601, 25602, 25603, 25604, 25605, 25605A, 25606, 25606A, 25607. Los códigos históricos 25608-25613 no están en el SHP; no son una pérdida de publicación y no se reconstruyen.

Caso A: Dolores completa histórica (15) y Peirano 98301/98304/98304A (3), cobertura 9/15 + 3/3 = 12/18. Caso B: Peirano 98301/98302, 9/15 + 2/2 = 11/17. La referencia visual muestra más suertes de Peirano porque representa otro alcance. No se copió cartografía de GeoStudio.

GeoStudio combina la misma fotografía Esri con referencias vectoriales OpenFreeMap/OpenMapTiles (carreteras, lugares e hidrografía). Histórico conserva World Transportation: no promete los mismos nombres de lugares o cursos de agua. No incorpora infraestructura MVT, OpenLayers ni clasificación temática de riego.

## QA y reproducción

Evidencias locales: `C:/Users/ctije/Videos/CASUR_V26_QA`. `definitivo` contiene los PDF reales finales y PNG de todas sus páginas; `app-final`, `resilience-entrega`, `individual`, `regresion-final` contienen capturas y resultados. `coverage.json` documenta el DBF; `comparacion-A-B-C.png` compara las referencias aportadas con la nueva selección (alcances distintos, señalados).

Comandos:

```text
npm test --prefix modules/produccion
npm run validate --prefix modules/tch
node --test tests/*.test.mjs
node --check shared/geo/geo-map.js
node --check modules/produccion/js/casur-enhancements.js
node --check modules/produccion/tools/qa-v26.cjs
node --check modules/produccion/tools/qa-v26-resilience.cjs
git diff --check
```

QA Playwright externo: definir `NODE_PATH`, `CASUR_CHROME_EXECUTABLE`, `CASUR_PREVIEW_URL` (origen HTTP) y `CASUR_QA_OUT` (carpeta nueva), ejecutar `qa-v26.cjs`, `qa-v26-resilience.cjs`, `qa-gerencial-v2.cjs` y `qa-multifinca-recovery.cjs` en `modules/produccion/tools`. `CASUR_QA_CASES=A,B,una,tres` limita la matriz de informes. Las inyecciones de red y captura nativa existen exclusivamente en el navegador aislado de QA.

- Producción: 22 controles + 132 tests. TCH: 91. Shell/GEO: 51.
- Escritorio 1440x900 y móvil 390x844; etiquetas sin intersección, selección exacta, enfoques, zoom, cambio rápido y conservación de mapa al cambiar período.
- Comparación de captura nativa vs raster exportado a 1400x1000 y 1100x800: menos de 0.004% de píxeles con diferencia máxima de canal >40; sin desplazamiento visible.
- Referencias fallidas y mosaico de fotografía incompleto: rechazo explícito en unos 20 s. Red lenta: éxito. Reintento: éxito, sin hosts residuales ni cambios productivos.
- SW real: precarga, recarga offline, 12/18 polígonos recuperados y PDF sin base tras aceptación expresa. Satélite offline no garantizado; depende de mosaicos disponibles y estado de conectividad.
- A y B: PDF ejecutivo 3 páginas, completo 6; primera y segunda página productivas conservadas, cartografía en tercera, anexos sin duplicación. Una finca: ejecutivo 2 páginas. Se revisaron todas las páginas finales A y la cartografía B.
- A: histórico 204.26/61.20/108.63/6.65; período 187.41/53.57/105.66/5.66; km 36.10. B: 188.84/48.92/108.56; km 36.10. TAH conciliado independientemente por el QA existente.
- Exportaciones individuales PDF/PNG, suerte, Cronológico, zonas y shell verificadas funcionalmente. Matriz y logs completos en evidencias.

## Riesgos y límites explícitos

La suite Python GEO no pudo importar `geopandas` en los dos intérpretes disponibles; no se cambió el proyecto para instalarlo. Las pruebas GEO JavaScript y de integridad de datos sí pasan.

La inspección visual del PNG cartográfico individual de Cronológico detectó desplazamiento de su renderer legado. Se reprodujo en el preview inmutable del PR #34; el recorte del mapa comparado fue idéntico byte a byte (2,860,000 bytes). Es preexistente, no se corrige ampliando este PR. La nueva captura híbrida multifinca usa la ruta SVG alineada y comprobada. `individual-base` e `individual` conservan la evidencia; no confundir descarga exitosa con aprobación visual del PNG legado.

No se ha probado impresión física ni teléfono físico. La atribución es visible; disponibilidad y detalle de mosaicos dependen del proveedor. La vista móvil general puede usar guías y listar etiquetas sin espacio; enfocar finca o acercar evita ocultación arbitraria. No se certifican todas las selecciones posibles del catálogo.
