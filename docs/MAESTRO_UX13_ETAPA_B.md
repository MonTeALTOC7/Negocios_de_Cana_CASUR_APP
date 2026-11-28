# UX13 · Etapa B — Histórico de Finca y Suerte

Issue: #63 (ítems 9–15 del Issue #61) · PR apilado sobre la Etapa A.
Base: `claude/ux13-cronologico-finca-estimados` @ `03968a1bf1d8dd36f0976bfe5707298c015bc507` · Rama: `claude/ux13-historico-finca-suerte-etapa-b`.

## Alcance

Solo presentación en `modules/produccion/js/maestro-ux.js` y `modules/produccion/css/maestro-ux.css`, más la QA
`tools/qa-maestro-ux13-b.cjs`. Sin cambios en `index.html` del módulo (renderer embebido del Histórico),
`historical-engine.js`, `casur-enhancements.js`, `data/*`, `shared/geo/`, generadores PDF/PNG ni Service Worker
(solo `RELEASE_ID` derivado por `tools/runtime-assets.mjs`). La Etapa A no se modifica, salvo un helper compartido
(ver «Buscadores»).

## Inventario previo (supuestos verificados)

| Vista | Renderer | Hallazgo |
|---|---|---|
| Histórico de finca y de suerte (pestaña Histórico, `renderEntity(code \| 'LOTE::id')`) | embebido en `index.html` | Comparten estructura: `.ficha-band`, `.historical-period-card` (5 presets + selector de zafras), `.historical-agronomic-kpis` (8 KPI), `.historical-comparison-title` + `.delta-grid`, `.historical-chart-card`, drilldown y tabla por zafra. El tooltip del gráfico (`showHistoricalChartTooltip`) ya se posiciona dentro de su caja y muestra Área/Toneladas/TCH/KATM/Edad, así que no se cambió. |
| Ficha de suerte del Cronológico (pestaña «Gráfico TCH/KATM») | `historicalProjection` en `maestro-ux.js` | Origen de las capturas 5–7: tooltip flotante `detailTip` + `.context-history-status` duplicados, textos de cobertura y «Ampliar», que solo movía el mismo SVG a un diálogo. |
| Exportadores PDF/PNG | `cleanElement()` clona el informe | Elimina `button`, `.no-print`, `.export-excluded`, `.ficha-band`… Los controles añadidos (presentación) no llegan a la exportación; se comprobó PNG idéntico píxel a píxel antes/después. |
| Datos | — | Ningún lote del Cronológico vigente (1,030) ni del histórico (1,547) tiene KATM ausente: el caso «KATM ausente» se prueba con un clon en memoria de 99301 dentro de la QA, sin tocar datos. |

## Cambios

### Histórico de finca / suerte (pestaña Histórico)
1. **Cabecera:** `#q` es el único buscador visible; `#producerSelect` se conserva oculto como control interno. Se ocultan la barra de saltos `Indicadores / Detalle / Mapa y exportación` (eran solo scroll) y el título ornamental «Ficha histórica»; todo el contenido sigue en la página.
2. **Hero:** nombre y código; estado, **Mapa** (GIS original) y un único **Exportar** (popover con los botones PDF/PNG originales). Altura de la banda en 390 px: 286 → 159 px.
3. **Período:** selector «Período: Última ▾» con las 5 opciones originales (cada opción acciona el botón original) y rango discreto `23/24–25/26` + `3 zafras · 57 suertes`. Personalizado mantiene el selector de zafras original. Tarjeta: 235 → ~104 px en móvil.
4. **KPI:** TCH, KATM, Área y Edad primero (2×2 móvil, 4 columnas PC). Debajo, «Otros indicadores» compactos (distancia, cambio TCH, variabilidad, vs histórico). Se ocultan solo los subtítulos-fórmula («Toneladas ÷ área», «Ponderado por toneladas», «Ponderada por área válida»), que pasan a «¿Cómo se calculan?». Se mantienen las leyendas que califican la medida (área por zafra vs acumulada, cobertura/áreas inválidas de distancia, CV).
5. **Comparar TCH:** `details` plegable, cerrado al inicio en móvil y abierto en PC. Muestra el bloque original sin recalcular; el estado abierto/cerrado se conserva al cambiar el período.
6. **Drilldown por zafra:** se ocultan los mismos subtítulos-fórmula de sus tarjetas.

### Ficha de suerte (Cronológico)
7. **Gráfico TCH/KATM:** métrica segmentada; cada zafra es un control táctil y de teclado (Enter/Espacio, ←/→, Inicio/Fin) con anillo de selección. Un único panel de detalle bajo el gráfico, sin tooltip flotante, siempre con **Área (ha), TCH, KATM, Toneladas (t) y Edad (meses)**. La métrica activa va resaltada. Por defecto se muestra la última zafra con dato.
8. Sin «Cobertura KATM…», «n de n zafras…» ni «Los valores ausentes permanecen N/D». Si hay zafras sin la métrica, aviso breve: «Sin KATM en 23/24; la línea no se interpola».
9. **Retirado «Ampliar»** del gráfico. Se mantienen «Tabla histórica» (todas las zafras y columnas) como acción compacta y «Ampliar mapa» (GIS).
10. Dato ausente = «—» (lector de pantalla: «sin dato»); el cero se muestra como `0.00`. Sin interpolaciones. Con «Todas» (>5 zafras) el gráfico se desplaza dentro de su caja.

### Buscadores
Los `onblur` originales de `#cronoQ` y `#q` programan un cierre anónimo a 180 ms. El arreglo P1 de la Etapa A se extrajo a
`guardSuggestionBlur()` y ahora protege también `#q`. El comportamiento de `#cronoQ` es idéntico al de A (QA A 110/110).

## Paridad de cifras

`qa-maestro-ux13-b.cjs` compara la Etapa A con la B leyendo los nodos originales del informe, para 993 Pansaco, 10 El Salitre,
908 AIDOSA (10 zafras) y LOTE::99301 × {Última, Últimas 3, Últimas 5, Todas}: KPI (TCH, KATM, área, edad, distancia…),
comparadores, resumen de período y filas de la tabla (zafra, área, t, TCH, KATM, edad). **16/16 idénticos.**
PNG exportado del Histórico (993 y suerte 99301, Últimas 3): **idéntico píxel a píxel** antes/después.

## QA

- `tools/qa-maestro-ux13-b.cjs`: **106/106** = 16 paridad + 18 casos × 5 anchos (360, 390, 768, 1280, 1536).
- Regresión Etapa A `tools/qa-maestro-ux13-a.cjs`: **110/110**.
- Suites: Producción 212/212 · shell 160/160 (una ejecución bajo carga dio 159/160 en `sw-release-recovery` «downgrade»; 28/28 aislado ×3 y 160/160 ×3 completas, intermitente y ajeno a estos archivos) · TCH 92/92.
- Gate local: `sync-versions`, `runtime-assets`, `production-integrity`, `check-context-hotfix` OK; `check-release-policy` contra `main` OK.

## Versionado (pendiente de decisión de release)

A y B no están publicadas. Se mantienen **Producción V1.8.3 / App 1.6.2** como release coordinado A+B y solo se regenera el
manifiesto offline. `check-release-policy` contra `main` pasa. Contra la base A exigiría incrementar (1.6.2 → 1.6.3 /
V1.8.3 → V1.8.4) porque cambian bytes de Producción y del manifiesto. Si A se publica sola, B necesitará ese bump
separado al reorientarse sobre el nuevo `main`.

## Límites de la evidencia

Chromium headless (Playwright) sobre `tools/serve-maestro-preview.mjs` local; sin Brave ni dispositivo físico.
El Release Gate solo se dispara en PR hacia `main`, así que para B se ejecuta por `workflow_dispatch` en la rama.
