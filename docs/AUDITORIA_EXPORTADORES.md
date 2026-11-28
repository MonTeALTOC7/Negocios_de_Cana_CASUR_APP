# Auditoría de exportadores PDF/PNG del Maestro de Suertes

**Fecha:** 26-Nov-2026.
**Base:** PR #77, generación `2026.11.22-aforo.1102`.
**Motor auditado:** `casurVisualExportEngine` en `modules/produccion/index.html` (bloque `CASUR_VISUAL_EXPORT_START/END`, versión V1.8.3).
**Estado:** solo diagnóstico, sin cambios en el motor.

## Método

`tools/audit-exporters.cjs` (solo lectura) abre cada informe en PC (1366 px) y en Android (Pixel 7) y pulsa los **botones reales** de exportación. Por cada informe registra:

- **Archivo:** el PDF y el PNG descargados.
- **Altura real:** la que usa `renderCanvas` para el lienzo.
- **Altura necesaria:** la del mismo clon pintado **solo con `RENDER_CSS`**, que es lo que ve el `foreignObject`, y si el pie del informe cae dentro del área pintada.
- **Iconos y tablas:** tamaño de los iconos, tablas ocultas en la medición y anchos.

Con `pdfinfo`, `pdfimages`, `pdffonts` y `pdftotext` se obtuvieron las páginas, el tamaño de la imagen incrustada, las fuentes y el texto seleccionable de cada PDF. Después se revisó visualmente cada página rasterizada.

Las páginas están en `docs/auditoria-exportadores/` y los datos crudos en `audit.json`.

**Android y PC producen archivos idénticos.** El motor rasteriza a anchos fijos de 960, 1400 o 1600 px, sin depender del dispositivo. Los mismos defectos aparecen en ambos.

## Resultado por informe

| Informe | Imagen en el PDF | Altura usada → necesaria | Pie visible | Hallazgos visuales |
|---|---|---|---|---|
| Cronológico General | — | — | — | **No tiene exportador** (no existe botón) |
| Cronológico de Finca (Pansaco) | **2800 × 600** | **300 → 2,875 px** | **No** | Seis iconos de **417 × 417 px**. Se pierde el 90 % del informe, **incluida la tabla de 49 suertes** |
| Cronológico de Suerte (Pansaco 01) | 1920 × 958 | **479 → 563 px** | **No** | Diseño verde anterior, tipografía serif, tabla de **18 columnas** comprimida y fila cortada |
| Histórico General | — | — | — | **No tiene exportador** |
| Histórico de Finca (Pansaco) | 1920 × 2702 | 1,351 → 1,304 | Sí | Completo. Diseño verde anterior y serif. Escalado a una página |
| Histórico de Suerte (99301) | 1920 × 2702 | 1,351 → 1,293 | Sí | Completo. Mismos problemas de diseño |
| Cronológico múltiple | **3200 × 1520** | 760 → 760 | Sí | Página horizontal con escala 0.47: texto de **~5 pt**, ilegible al imprimir. Una tarjeta KPI vacía |
| Histórico múltiple ejecutivo | 3 × 1920 × 2520 | paginado | Sí | Legible. Página 1 con ~40 % en blanco; colores verdes anteriores |
| Histórico múltiple completo | 10 × 1920 × 2520 | paginado | Sí | Página 7 con 3 filas aisladas, página 1 con mucho espacio vacío. Las alturas se miden con CSS distinto al del render (gráficos de 260 px en la medición y 185 px en el render), con riesgo de corte |
| Zona Cronológico (2-Centro) | 1920 × 1500 + 885 | 1,263 → 1,231 | Sí | Completo. El título «Haciendas de 2-Centro» queda huérfano al pie de la página 1 |
| Zona Histórico (2-Centro) | 1920 × 2421 + 942 | 1,749 → 1,720 | Sí | Completo. El título del ranking queda huérfano |

**Ningún PDF tiene texto seleccionable:** 0 fuentes y 0 caracteres en todos. Cada página es una imagen JPEG (`/DCTDecode`).

## Causas raíz (con evidencia)

### 1. Se mide en un contexto y se pinta en otro

Esta es la causa del desbordamiento y del recorte.

`renderCanvas()` monta el clon en `.casur-capture-host`, **dentro del documento vivo**. Ahí también aplican las hojas de estilo de la aplicación (`maestro-ux.css`, premium). Con ese contexto calcula la altura recorriendo `getBoundingClientRect()` de todos los nodos, y con esa altura fija el `<svg width height>`.

El `foreignObject`, en cambio, pinta el mismo marcado **solo con `RENDER_CSS`**. Cuando los dos contextos difieren, el SVG corta lo que sobra.

- **Cronológico de Finca:**
  - `maestro-ux.css` oculta en pantalla la tabla y los gráficos originales con `.premium-original-analysis{display:none!important}` (`maestro-ux.js:1027`). Los iconos `.maestro-icon` dentro de los KPI medían 0 × 0.
  - Medición: **178 px**, elevada al mínimo de 300 → lienzo **2800 × 600** (1400 × 2).
  - En el render la tabla y los gráficos sí aparecen: se necesitan **2,875 px**. Resultado: iconos gigantes, contenido recortado y la tabla fuera del área pintada.
- **Cronológico de Suerte:** el gráfico `.crono-trend-svg` y la tabla quedan ocultos en la medición. Se miden 479 px y se necesitan 563, así que se pierden la fila de la tabla y el pie.
- **Histórico múltiple completo:** el mismo desfase existe en la paginación. Cada página se mide en el documento vivo y se pinta con `RENDER_CSS`.

### 2. Iconos gigantes

`maestro-ux.js` inserta iconos `<svg class="maestro-icon" viewBox="0 0 24 24">` sin `width` ni `height`. Su tamaño de 24 px vive en `maestro-ux.css`; **`RENDER_CSS` no contiene ninguna regla `.maestro-icon`**. En el `foreignObject`, un SVG en línea sin dimensiones ocupa el 100 % del ancho de su contenedor: **417 × 417 px** medidos en la tarjeta KPI.

### 3. Tipografía serif

`RENDER_CSS` declara la fuente solo en `html,body{font-family:Arial,…}`. En el `foreignObject` el informe vive dentro de un `<div>`, sin `html` ni `body` que hereden esa regla, y `.casur-report` no declara fuente. El navegador usa su serif por defecto, visible en el Cronológico de Suerte y en el Histórico individual.

Los informes con fuente explícita no tienen el problema: `.casur-report-hist-multi` y los de Zona salen en sans.

### 4. Diseño verde anterior

El informe clona el DOM **original** (verde) que la interfaz premium Petróleo oculta, y `RENDER_CSS` mantiene la paleta antigua: `#0b7f3a` aparece 7 veces y `#10241a` 12 veces. La pantalla y el informe muestran diseños distintos.

### 5. Anchos fijos y escalado

| Informe | Ancho de render | Página | Escala resultante |
|---|---|---|---|
| Cronológico General / Finca | 1400 px | Carta horizontal (756 pt útiles) | ≈ 0.54 |
| Cronológico múltiple | 1600 px | Carta horizontal | 0.47 → texto de 5–6 pt |
| Tabla de suerte | 18 columnas en 960 px | — | Celdas de 3 a 4 palabras por línea |

En fichas cortas, el ajuste «4 %» de `pdfBlobFromCanvas` encoge toda la página.

### 6. PDF de solo imagen

`pdfBlobFromCanvas()` escribe un PDF 1.4 cuyas páginas solo contienen `/Im0 Do`, una imagen JPEG por página. El resultado no tiene texto, no se puede buscar ni copiar, y pierde nitidez al ampliar.

### 7. Paginación

Los cortes se hacen sobre la imagen, en filas o en `[data-pdf-break]`. Eso produce títulos huérfanos (Zona), páginas casi vacías (Histórico completo, página 7) y páginas con mucho espacio en blanco (página 1). Las tablas cortadas no repiten el encabezado, salvo en el Histórico completo.

### 8. Por qué las pruebas anteriores no lo detectaron

Las pruebas comprobaban la descarga, el ancho del PNG, el número de filas del clon y la presencia del logo, pero no si el contenido cabía en el área pintada. Esta auditoría compara la **altura usada** con la **altura necesaria** y la **posición del pie**, y revisa cada página a la vista.

## Muestras

En `docs/auditoria-exportadores/` hay una página por imagen a 60 ppp:

- **Cronológico:** `cronologico-finca-pansaco-p1.jpg`, `cronologico-suerte-pansaco-01-p1.jpg` y `cronologico-multiple-p1.jpg`.
- **Histórico:** `historico-finca-pansaco-p1.jpg`, `historico-suerte-pansaco-01-p1.jpg`, `historico-multiple-ejecutivo-p1..p3.jpg` y `historico-multiple-completo-p01..p10.jpg`.
- **Zona:** `zona-cronologico-2-centro-p1..p2.jpg` y `zona-historico-2-centro-p1..p2.jpg`.

Para regenerar los PDF y PNG originales:

```
node tools/audit-exporters.cjs BASE SALIDA
```

## Conclusión

Los defectos no se arreglan ajustando estilos: vienen de la arquitectura. El motor **clona la pantalla**, **mide en un contexto y pinta en otro**, y **rasteriza todo a JPEG**.

La propuesta (`docs/PROPUESTA_REDISENO_INFORMES.md`) reemplaza esa cadena por un modelo de informe propio y un render único, sin cambiar las variables oficiales.
