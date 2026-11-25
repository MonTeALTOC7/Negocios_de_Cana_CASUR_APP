# Propuesta: PDF/PNG de Análisis por Zona y GIS de Zona (UX14-B)

Estado: **evaluado, no ejecutado.** Requiere modificar `modules/produccion/index.html`, que está protegido. Se presenta para autorización previa, como pide el propietario.

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
