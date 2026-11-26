# Propuesta técnica: rediseño de los informes PDF/PNG

**Fecha:** 26-Nov-2026.
**Estado:** propuesta, **no implementada**. Requiere autorización para modificar el bloque protegido de `modules/produccion/index.html`.
**Diagnóstico de base:** `docs/AUDITORIA_EXPORTADORES.md`, con las muestras en `docs/auditoria-exportadores/`.

## Objetivo

Un **único sistema de exportación reutilizable** para los informes del Maestro de Suertes, que produzca:

- Identidad institucional Petróleo y tipografía profesional.
- PDF con **texto seleccionable y buscable**.
- Paginación real con encabezado, pie y número de página.
- Fechas oficiales (aforo, consolidación y generación) **leídas de los metadatos**.

Debe funcionar **sin conexión y en Android**. Las variables oficiales no se sustituyen y no se inventan datos.

## Principio: un modelo de informe, no un clon de la pantalla

La causa raíz es que el motor **clona el DOM de pantalla**, lo **mide en el documento vivo** y lo **pinta en un `foreignObject` con otro CSS**. La propuesta separa tres capas:

| Capa | Qué hace | Dónde |
|---|---|---|
| **1. Modelo** | Objeto JSON con secciones tipadas: `header`, `kpis`, `chart`, `table`, `ficha` (grupos de variables), `note`, `footer`. Lo construyen funciones puras desde los **mismos motores oficiales** que usa la pantalla (`CASUR_CRONO_PARTICIPATION`, `zoneAnalysis`, `mainEntities`, `lotCompact`, ficha histórica) | `modules/produccion/js/report-model.js` (nuevo, fuera de `index.html`) |
| **2. Diseño** | Retícula Carta vertical (612 × 792 pt, márgenes de 36 pt), tokens Petróleo, tipografía Inter, reglas de corte (no partir KPI, gráficos ni filas; repetir el encabezado de tabla; no dejar títulos huérfanos) | `modules/produccion/js/report-layout.js` (nuevo) |
| **3. Salida** | **PDF vectorial**, con texto y gráficos como trazos, y **PNG** desde el mismo diseño | `report-pdf.js` y `report-png.js` (nuevos) |

`index.html` solo cambia el **despacho**: los botones existentes («Descargar PDF» y «Descargar imagen») llaman al modelo correspondiente en lugar de `prepareClone → renderCanvas`. Los nombres de archivo, los botones y su ubicación se mantienen.

## Formato de salida: evaluación

| Opción | Texto seleccionable | Android / sin conexión | Control de diseño | Riesgo |
|---|---|---|---|---|
| **A. Actual:** `foreignObject` → canvas → JPEG en PDF | No | Sí | Bajo (dos contextos CSS) | Ya produce recortes |
| **B.** `window.print()` con `@page` | Sí | Sí en Chrome Android, pero **abre el diálogo de impresión**; el resultado depende del navegador | Medio | Inconsistente entre equipos; no permite descarga directa ni PNG |
| **C. PDF vectorial propio desde el modelo** | **Sí** | **Sí**: JavaScript local, fuente incluida en el precaché | **Total**: posiciones en pt, cortes deterministas | Más trabajo inicial; requiere incrustar la fuente |

**Recomendación: opción C.**

- **Escritor de PDF:** ampliar el escritor actual de `pdfBlobFromCanvas` (PDF 1.4, ya libre de dependencias) con objetos de texto, rectángulos, líneas y rutas. El escritor existente demuestra que el enfoque es compatible con la PWA.
- **Fuente:**
  - Incrustar **Inter** (OFL, ya presente en `shared/assets/fonts/`) en una versión TTF con subconjunto Latin, de unos 150 KB, agregada al precaché del Service Worker. Así los acentos, «ñ», «Δ», «≥» y «·» se ven correctamente.
  - **Alternativa sin fuente incrustada:** Helvetica estándar (WinAnsi), sustituyendo «Δ» por «Dif.» en el PDF.
- **Gráficos:** se dibujan como trazos vectoriales a partir de los mismos datos de las series. No se rasterizan.
- **PNG:** se rasteriza el **mismo diseño** con canvas 2D a 2× (pt → px). Se mide y se pinta en el mismo contexto, así que no puede haber recorte.
- **Mapa satelital** (solo en Histórico múltiple completo): sigue siendo imagen dentro de su bloque, con las teselas actuales. Es la única excepción raster.

## Identidad y componentes comunes

**Encabezado de cada página:**
- Logo Negocios de Caña CASUR.
- Título del informe y sujeto (finca, suerte o zona).
- Línea oficial: «Aforo DD-MMM-AAAA · Consolidado DD-MMM-AAAA · Generación …», leída de `CRONO_DATA.meta` y `APP_DATA.meta`.

**Pie de cada página:** «CASUR · Negocios de Caña · Documento de consulta», fecha y hora de la consulta y «Página X / Y».

**KPI compactos:** tarjetas de 4 por fila con etiqueta (8 pt), valor (14 pt) y nota (7 pt). Borde superior por tipo: Histórico en oro y Estimado oficial en azul.

**Tablas:**
- Encabezado Petróleo repetido en cada página.
- Filas de 8.5 pt, cifras alineadas a la derecha con dígitos tabulares.
- Nunca más de 10 columnas en vertical; si hay más, se reparten en grupos.

**Paleta Petróleo:**

| Uso | Color |
|---|---|
| Títulos | `#173B46` |
| Primario | `#1F4E5C` |
| Ejecutado (Histórico) | `#D4B35F` |
| Estimado | `#3491b7` |
| Texto secundario | `#576579` |
| Bordes | `#E3E7EB` |
| Δ negativo | `#9A3412` |

**Formatos:**
- Fechas en `DD-MMM-AAAA`.
- Números con separador de miles.
- El escenario optimista AF/AG siempre rotulado aparte del oficial AD/AE.
- BE/BF rotulados como plan de cosecha.

## Plantillas principales

### 1. Cronológico de Suerte: ficha agronómica (1 página, vertical)

Sustituye la tabla horizontal de 18 columnas por **grupos de variables**. Son las mismas 18 variables del informe actual, sin agregar ni quitar ninguna:

| Grupo | Variables (fuente actual) |
|---|---|
| Identificación | Suerte, Código de lote, Finca, Zona, Tenencia |
| Agronomía | Variedad, # de corte, Textura, Tipo de riego, Surco, Fecha de corte/siembra, Edad actual |
| Producción | TCH (anterior según el aforo), Estado TCH 25/26, TCH est. 26/27 (AD), Ton. est. 26/27 (AE), Área |
| Plan de cosecha | Fecha para cosecha 26/27 (BE) y tipo de corte (BF), rotulados como plan |
| Operación | Destino cultivo, Distancia (km), Estado maestro, Observación |

La ficha va encabezada por 4 KPI (Área activa, TCH Z25/26, TCH est. Z26/27, Edad actual) y el **gráfico histórico TCH por zafra** del informe actual, ya en vector. El escenario optimista AF/AG, si existe, aparece en un recuadro separado.

### 2. Cronológico de Finca: resumen ejecutivo y detalle por suerte

**Página 1 (resumen ejecutivo):**
- KPI: área activa, suertes activas, área de molienda, TCH est. Z26/27, toneladas estimadas y edad actual.
- Composición por variedad, tipo de riego y # de cortes: las mismas agrupaciones del explorador (`agronomicGroups`).
- Notas de Semilla y de Molienda sin estimado.

**Páginas siguientes (detalle por suerte):** una tabla de 9 columnas.
- Columnas: Suerte, Área, Variedad, # corte, Tipo de riego, Edad, TCH ant., TCH est., Ton. est.
- Paginada con el encabezado repetido.
- Las 49 suertes de Pansaco ocupan unas 2 páginas.
- El resto de las 18 variables por suerte se ofrece en el **anexo opcional «Ficha por suerte»**, con la plantilla 1 compactada a media página por suerte.

### 3. Histórico de Finca: resumen ejecutivo y detalle

**Página 1 (resumen ejecutivo):**
- KPI del período: área cosechada, TCH ponderado, KATM ponderado, Δ frente al histórico, edad y distancia.
- Gráfico TCH por zafra con el período activo destacado.
- Alertas existentes.

**Página 2:** «Resumen de finca por zafra», con la misma tabla actual de 12 columnas, en vertical con columnas compactadas.

**Siguientes páginas:** detalle por suerte de la última zafra o del período elegido, con los datos de `lotCompact`. Es el mismo contenido que hoy aparece en el Histórico múltiple completo.

### 4. Histórico de Suerte: ficha y serie

- **Ficha:** KPI (área, TCH, KATM, edad, distancia de referencia y Δ) y comparaciones frente a CASUR, zona, variedad y riego.
- **Gráficos:** TCH y KATM por zafra.
- **Tabla «Detalle del lote · histórico completo»:** las 14 columnas actuales en vertical, a 8 pt, sin cambios de contenido.

### Otros informes

Los demás informes reutilizan los mismos componentes en una segunda etapa:

- Histórico múltiple ejecutivo y completo.
- Cronológico múltiple: dejaría de ser un horizontal de 1600 px y pasaría a un resumen más una tabla vertical.
- Zona Cronológico y Zona Histórico.

Cronológico General e Histórico General **no tienen exportador hoy**. Solo se agregarían con autorización expresa.

## Cambios necesarios en `index.html` (bloque protegido)

1. **Despacho en `runAction(kind, type, …)`:**
   - Para `cronologico` (finca o suerte) y `historico` (finca o suerte), construir el modelo y llamar a `CASUR_REPORTS.pdf(model)` o `CASUR_REPORTS.png(model)`.
   - Los demás tipos siguen en el motor actual hasta su etapa.
2. **Carga de scripts:** `<script src="js/report-model.js">`, `report-layout.js`, `report-pdf.js` y `report-png.js`. Se incluyen en `core/versions/runtime-assets.json` y en el precaché de `sw.js`, junto con la fuente TTF.
3. **Correcciones inmediatas al motor actual**, para los tipos que aún no migran. Son mínimas y evitan recortes mientras dura la transición:
   - Medir el clon en un `<iframe>` aislado que solo tenga `RENDER_CSS`, es decir, el mismo contexto que pinta.
   - Declarar `font-family` en `.casur-report` en lugar de `html,body`.
   - Agregar `.casur-report svg.maestro-icon{width:16px;height:16px}`.
4. **Guardas:**
   - Actualizar la huella SHA-256 del bloque `CASUR_VISUAL_EXPORT` en las protecciones vigentes, con el mismo procedimiento que en UX14-C.
   - Sin flexibilizar las guardas generales.
5. **Pruebas nuevas** (`tools/qa-informes.cjs`):
   - Para cada plantilla, en PC y Android:
     - PDF con texto extraíble (`pdftotext` contiene el sujeto, las fechas oficiales y todas las suertes).
     - 0 imágenes salvo el logo y el mapa.
     - Fuentes incrustadas.
     - Ningún elemento fuera del área útil.
     - «Página X / Y» correcto.
     - Encabezado de tabla en cada página.
     - Sin títulos huérfanos.
   - Revisión visual de las páginas rasterizadas.
   - Paridad de cada cifra con la pantalla.

## Plan por etapas

1. **R1 (pendiente de autorización):**
   - Correcciones inmediatas del punto 3: el iframe de medición, la fuente y el tamaño de los iconos.
   - Eliminan los recortes y los iconos gigantes en todos los informes actuales.
   - Cambio pequeño y auditable en `index.html`.
2. **R2:** modelo, diseño y salida PDF vectorial y PNG para las **cuatro plantillas principales**. Muestras reales para aprobación antes de continuar.
3. **R3:** migración de los informes múltiples y de Zona a los mismos componentes; retiro del motor raster salvo para el mapa.

**Fuera de alcance:** nuevos informes, cambios de datos, SIAGRI, merge y producción.
