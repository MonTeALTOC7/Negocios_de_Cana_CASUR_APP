# Propuesta: PDF/PNG de Análisis por Zona y GIS de Zona (UX14-B)

Estado: **autorizado por el propietario y ejecutado en UX14-C (26-Nov-2026).** Ver la sección 5 para lo implementado.

## 1. Por qué no se puede hacer sin tocar `index.html`

El motor de exportación vigente (`casurVisualExportEngine`, en `index.html`) genera PDF y PNG con `renderCanvas(kind)`.

- **Destinos fijos:** `renderCanvas` obtiene el nodo a exportar con `target(kind)`, que solo reconoce `historico`, `cronologico`, `historico-multiple` y `cronologico-multiple`.
- **API pública limitada:** `window.CASUR_VISUAL_EXPORT` expone `prepareClone`, `renderCanvas` y `pdfBlobFromCanvas`, pero `renderCanvas` no acepta un nodo arbitrario.
- **Estilos ausentes:** el render por `foreignObject` solo aplica `RENDER_CSS`, que no incluye los estilos de UX14.

Llamar al motor desde `maestro-ux.js` es imposible sin un tipo nuevo. Copiar el renderizador duplicaría la lógica, cosa que está prohibida.

## 2. Cambios mínimos propuestos en `index.html`

Los tres primeros cambios van dentro del bloque `casurVisualExportEngine`.

1. **`target(kind)`:** dos tipos nuevos.
   - `zona` → `.ux14-zone:not(.ux14-hist-zone)`, el Cronológico de Zona visible.
   - `zona-historico` → `.ux14-hist-zone`.
2. **`prepareClone(node, kind)`:** una rama para los dos tipos.
   - **Cabecera:** «Análisis por Zona · {zona o Todas} · Sistema {Total|Riego|Secano|Ventana}», «Aforo 12-Oct-2026 · Consolidado 22-Nov-2026» (o el rango de zafras en Histórico) y «Consulta: DD-MMM-AAAA · hh:mm».
   - **Cuerpo:** el clon limpio (`cleanElement`) del tablero, con KPI, franja, composición, gráficos SVG y tabla **completa**. El tablero tiene preparado `data-ux14-export="all"` para dibujar todas las filas antes de clonar.
   - **Leyenda:** la nota «Riego/Secano según el sistema de riego actual del lote» cuando corresponda.
3. **`RENDER_CSS`:** el subconjunto estático de estilos `.ux14-*` (KPI, barras, composición, líneas, tabla), con los nombres de la finca visibles (`.ux14-print-name`).
4. **`subject(kind, node)`:** nombre de archivo `Zona_{zona}_{sistema}_{AAAA-MM-DD}.pdf/png`, a partir de `data-zone` y `data-system` del tablero.

Fuera de `index.html`:

- **`maestro-ux.js`:** el botón «Exportar» del tablero invoca `CASUR_VISUAL_EXPORT.pdf('zona')` o `.image('zona')`, dentro del menú contextual existente (`installReportMenus`).
- **Guarda de bytes:** `modules/produccion/tests/maestro-ux.test.mjs` normaliza solo estas líneas nuevas, igual que con el hash del aforo y el formato de fecha. No se relaja ninguna otra protección.
- **Pruebas:** QA de PDF y PNG que verifique en el texto del informe la zona, el sistema, las fechas `DD-MMM-AAAA` y la tabla completa, a 390 y 1280 px. Se suma una prueba estática de la rama nueva.

**Impacto:** cambia código de runtime (manifiesto y SW se regeneran) sin tocar datos. La versión de Producción se mantiene en V1.8.3, candidata sin publicar.

## 3. GIS de Zona (mejora posterior, sin reconstruir el GIS)

- **Ya existe:** las geometrías por zona (`shared/geo/data/zona-1-sur.geojson`, `zona-2-centro`, `zona-3-norte` y `zona-5-productores`, con `manifest.json`) y el motor `createCasurMap` (`shared/geo/geo-map.js`) que usa la ficha de finca.
- **Propuesta:** un panel «Mapa de la zona» en la ficha de zona que llame a `createCasurMap` con la capa de la zona seleccionada y resalte las suertes por sistema (Riego, Secano, Ventana) con los mismos colores de UX14.
- **Lo que no cambia:** las geometrías, el motor ni los mosaicos.
- **Limitaciones:** las zonas 6-TRAPICHES y 7-ZONA TISMA no tienen geometría, así que se informarían como «sin cartografía». Los mosaicos dependen de conexión, igual que en la ficha de finca.

## 4. Decisión solicitada

Autorizar los cambios del punto 2 en `index.html` para implementar el exportador de zona en una iteración UX14-C. GIS de Zona (punto 3) queda como mejora posterior.

## 5. Implementación UX14-C (ejecutada)

### Cambios en `index.html` (los autorizados)
1. **Un bloque insertado** justo antes de `window.CASUR_VISUAL_EXPORT`, marcado `/* UX14-C (autorizado 26-Nov-2026 … */`:
   - Extiende `target` (tipos `zona` y `zona-historico`), `prepareClone` (`buildZona`) y `decorate` (inserta el grupo PDF/PNG del motor en el tablero).
   - Agrega a `RENDER_CSS` los estilos del informe de zona, todos `!important`, para que la medición y el render den el mismo diseño en PC y Android.
   - Las demás funciones del motor no cambian.
2. **Una línea modificada:** el `safeSelector` de paginación incluye los nuevos tipos (`[data-pdf-break], .ux14-farms tbody tr`). Así no se cortan gráficos ni filas.

### Guarda de bytes (`modules/produccion/tests/maestro-ux.test.mjs`)
- Retira exactamente ese bloque **verificando su SHA-256 fijo** y restaura la línea original del `safeSelector`.
- Cualquier otro cambio en `index.html`, o en el propio bloque, sigue fallando. Se comprobó alterando un carácter del bloque y, por separado, otra línea del documento: ambos casos fallan.

### `maestro-ux.js`
- **Encabezado del informe** (solo en impresión):
  - Logo de Negocios de Caña incrustado como `data:image/webp`, porque `foreignObject` solo representa imágenes en línea.
  - Título, zona · sistema, y fechas del aforo y la consolidación leídas de `CRONO_DATA.meta` (`tchEst2627EffectiveDate`, `generated`, `dataVersion`), sin fechas fijas en el código.
  - Hora de consulta.
- **Tablas completas en el informe:** `CASUR_ZONE_UX14.exportNode/exportDone` las dibujan completas durante la exportación. Si una tabla supera 8 filas, empieza en página nueva con su encabezado.
- **Exportar:** el menú de la cabecera del tablero (PDF o PNG), en el mismo patrón de las fichas.

### Resultado (QA `tools/qa-maestro-ux14.cjs`, 1280 y 390 px)
- Logo, zona y sistema, fechas oficiales `DD-MMM-AAAA` y generación.
- **0 controles** interactivos en el informe.
- **KPI del informe iguales a la interfaz** y tabla con todas las filas.
- PDF paginado por tarjetas y filas, y PNG de 1920 px de ancho (2×).
- Nombre de archivo `Zona_{zona}_Sistema_{sistema}_{fecha}`.
- **Exportadores anteriores** (ficha Cronológico de suerte e Histórico de finca): idénticos píxel a píxel frente a la candidata `7ee4dd3`.
