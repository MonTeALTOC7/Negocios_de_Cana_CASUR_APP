# Histórico multifinca: PDF ejecutivo y completo

## Alcance y base

- Rama hija: `codex/historico-multifinca-pdf-ejecutivo`.
- Base: PR #25, `e1f2220d72f84c687238303da8ae0f6ea410dfc3`.
- Solo composición/exportación PDF multifinca y helpers visuales optativos.
- No cambia motor histórico, selección, fórmulas, datos, versiones, SW ni fichas individuales.
- Sin merge ni despliegue. Destino del PR: `codex/historico-multifinca-recuperacion`, no main.

## Uso

En el resumen multifinca hay dos botones:

- **PDF ejecutivo**: consolidado, históricos TCH/KATM, tablas simplificadas y comparación TCH/KATM.
- **PDF completo**: el ejecutivo más anexos individuales, cada finca en hoja nueva.

El PNG conserva la composición anterior. Los PDF individuales y cronológicos conservan sus builders.
No se cambia la métrica visible al exportar. Ambos gráficos se componen mediante los mismos renderers
y el mismo motor; los parámetros adicionales son optativos.

KPI del reporte: área cosechada por zafra, TCH, KATM, distancia vigente y edad. Una zafra se etiqueta
"Área cosechada". El acumulado ha-zafra permanece secundario; no se recalcula ni imputa información.
La cabecera incluye período, hora local de consulta y selección exacta de fincas/suertes.

## Paginación

Se reutiliza el PDF raster paginado, carta vertical, con límites seguros de bloques y filas.
Los saltos obligatorios antes de comparación/anexos son un cuarto parámetro optativo del paginador.
Sin este parámetro se conserva el comportamiento anterior. No se eliminan píxeles ni filas.
El estilo específico de PDF fija tipografía y altura mínima de gráficos para que la medición DOM y
la imagen SVG coincidan. No se modifican estilos de la pantalla ni del PNG.

En QA se corrigieron una página casi vacía y cortes producidos por el min-height del gráfico heredado
de la pantalla; las evidencias finales corresponden a la corrección, no a esas iteraciones.

## Pruebas y evidencia (2026-10-22)

- `npm test` en `modules/produccion`: 22 controles + 101 tests.
- `npm run validate` en `modules/tch`: validación estática + 91 tests.
- `node --test tests/*.test.mjs`: 48 tests Shell/GEO.
- `node --check` en los dos scripts QA y el test histórico modificado.
- `git diff --check`.
- `node modules/produccion/tools/qa-multifinca-pdf.cjs`: navegador aislado a 1440x900 y 390x844,
  descarga real de ambas variantes, aserciones de KPI, orden de columnas, dos métricas,
  doce etiquetas comparativas, selección, estado activo y 2/4 páginas para el caso base.
- `node modules/produccion/tools/qa-multifinca-recovery.cjs`: regresión de filtros y selección,
  ficha individual de finca/suerte, PNG/PDF, Cronológico, zonas y shell offline precargado.
- Poppler: `pdfinfo` y `pdftoppm -scale-to 1300 -png` sobre ambos PDF; inspección visual de todas las páginas.

Caso base conservado de la evidencia del PR #25: Dolores 256 completa + Rancho Peirano 98301/98302,
23/24, 24/25 y 25/26. Área media 188.84 ha/zafra, acumulado 566.52 ha-zafra, TCH 48.92,
KATM 108.56, distancia vigente 36.10 km y edad 11.60 meses. No son constantes del render.
PDF ejecutivo: 2 páginas. Completo: 4; anexos de Dolores y Rancho empiezan en páginas 3 y 4.

Evidencias locales (fuera del repositorio):
`C:\Users\ctije\Videos\CASUR_PDF_Ejecutivo_QA\output\pdf`.
Resultados de regresión: carpeta hermana `regresion`.
Los archivos `Multifinca_executive_1440.pdf` y `Multifinca_complete_1440.pdf` son descargas de los botones.
`entrega_ejecutivo-*.png` y `entrega_completo-*.png` son páginas renderizadas de esos PDF.
`qa-pdf-results.json` contiene las verificaciones de ambos tamaños.

Para reproducir, servir la raíz del checkout por HTTP en 4195, disponer de Playwright externo y Chromium,
y ejecutar los scripts. Variables opcionales: `CASUR_PREVIEW_URL`, `CASUR_QA_OUT`,
`CASUR_CHROME_EXECUTABLE`; `NODE_PATH` puede apuntar a las dependencias del runtime.
No se añade Playwright ni dependencias al proyecto. Los scripts usan contextos nuevos y no modifican datos.

## Límites

- QA de teléfono emulado, no dispositivo físico ni impresión en papel.
- El PDF sigue siendo raster, no texto seleccionable/accesible; se conserva el exportador existente.
- No se certifica exportación masiva de todas las fincas ni legibilidad de muchas series coincidentes.
- En selecciones extensas el número de páginas puede crecer; la cantidad 2/4 se refiere al caso documentado.
- El test offline es una recarga con recursos precargados, no primera instalación sin conexión.
