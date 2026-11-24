# Issue #66: diagnóstico y propuesta UX14 (Análisis por Zona) y UX15 (Análisis)

**Solo diagnóstico y propuesta.** No se implementa hasta que el propietario valide la candidata UX13 + Plan Z26/27 (PR #71, `ecda05f`).
- **Base futura:** `main` vigente tras la publicación de la candidata, no ramas viejas.
- **Inventario:** obtenido del código de `ecda05f` y de la app en ejecución, a 1280 px y con generación 1102.

## 1. Inventario a preservar

### 1.1 Zonas (`zoneMainSection`), pestañas Cronológico e Histórico

**Cronológico de zona** (`cronoZoneSection`, adaptador UX13-C `installZonaUx13`)

- **Motores y funciones:**
  - `initCronoZonePanel`, `setupCronoZone`, `renderCronoZoneHome`.
  - `selectCronoZone`, `renderCronoZone`, `renderSelectedCronoZone`.
  - `restoreCronoZoneView`, `goCronoZoneSelector`, `goCronoZoneModule`.
  - Agregación: `CASUR_CRONO_PARTICIPATION.summary` (área activa, TCH, toneladas y cobertura de estimados).
- **Zonas:** `1-Sur`, `2-Centro`, `3-Norte`, `5-Productores`. El selector es `#cronoZoneSelect`.
- **KPI de inicio:**
  - Área activa, TCH anterior, TCH estimado 26/27 y Ton. estimadas 26/27.
  - Bandas: bajo 45, 45–70 y ≥70 TCH.
  - Área con riego.
- **Gráficos de inicio:** Área por zona, Zonas por mayor TCH, TCH estimado 26/27 por zona y Área crítica por zona.
- **KPI de zona:** los mismos cuatro principales, más Edad ponderada, Bajo 45 TCH, Área con riego y Secano.
- **Composición de la zona:** área por riego, tenencia, variedad, textura y destino.
- **Tabla «Haciendas con mayor área»:** código, hacienda, área, TCH anterior, TCH estimado 26/27, toneladas estimadas 26/27, riego, distancia ponderada y suertes activas.
- **Drill-down:** zona → finca (`renderCronoProducer`) → suerte (`selectCronoSuerteSuggestion`), con retorno de contexto (UX09). Incluye las filas `.ux09-zone-row`.

**Histórico de zona** (`zoneAnalysisSection`)

- **Funciones:**
  - `initZoneHistoricoPanel`, `renderZoneHistoricoHome`, `renderZoneHistoricoMatrix`.
  - `zoneHistoricoAggregate`, `zoneHistoricoLatestByZone`.
  - `selectZone`, `renderZone`, `zoneAnalysis`, `zoneTrend`, `zoneVarieties`.
  - `renderZoneCompare2526`, `renderZoneAreaBars`, `hbarZone`, `zoneDeltaPill`.
  - `resetZoneHistoricoSummary`, `showZoneEnd`, `goZoneSelector`, `goZoneModule`.
- **Zonas:** `1-ZONA SUR`, `2-ZONA CENTRO`, `3-ZONA NORTE`, `5-PRODUCTORES`, `6-TRAPICHES`, `7-ZONA TISMA`. El selector es `#zoneSelect`.
- **KPI:** TCH zona, Área zona, Toneladas, KATM zona, Edad promedio, TCH histórico, TCH últimas 3 y Potencial.

### 1.2 Análisis (`executiveAnalysisSection`, 13 pestañas UX09)

- **Pestañas:** Resumen, Tendencia TCH, Decisiones, Prioridades, Oportunidades, Renovación, Variedades, TCH × KATM, Zonas, Mejores desempeños, Caídas, Vista técnica y Maquila. Los identificadores van de `summaryAcc` a `maquilaAcc`.
- **Motores:**
  - `buildHistoricalExecutive`, `executiveNarrative` («Lectura ejecutiva automática»).
  - `prioritySummary`, `renderPriority`, `groupCriticalByZone`.
  - `aggregateTrend`, `aggTrendRows`, `mobileTrendBars`.
  - `multiAnalysis`, `buildHistoricalMultiAnalysis` (`historical-engine.js`), `renderMaquila`.
- **KPI:** TCH, Área, Toneladas y KATM de la última zafra; TCH histórico, TCH últimas 3, Δ vs histórico y Potencial vs zona.

### 1.3 Transversal

- **Exportadores:**
  - `buildExportHtml`, `auditExportHtml`, `applyModuleExportConfig` (`CASUR_EXPORT_MODULES`: `zones`, `executive`).
  - Menús de informe (`installReportMenus`).
  - PDF del Histórico (`planHistoricalPdfPages`, `prepareHistoricalPdfPages`, `renderHistoricalPdfPages`).
  - GIS (`runGeoExport`, `exportCasurGeoPng`).
  - Limpieza `.no-print`/`.export-excluded`.
- **Datos oficiales:** `cronologico` (1102, aforo 12-Oct-2026) e `historico` (`lotCompact`, 1,547 lotes, zafras 16/17–25/26, `maquila`, `benchmarks`). Solo lectura; los motores no cambian.
- **PWA:** caché verificada por paquetes, funcionamiento sin conexión y formato de fechas `DD-MMM-AAAA` (docs/ESTANDAR_FECHAS.md).

## 2. Diagnóstico

1. **Riego y secano no se separan en el desempeño.**
   - El Cronológico de zona muestra el área con riego y el área de secano, pero TCH, toneladas, bandas y rankings mezclan ambos sistemas.
   - El Histórico de zona y Análisis no mencionan riego ni secano.
   - Los datos sí lo permiten: el Cronológico tiene `tipoRiego` por suerte (Gravedad 586, Secano 177, Goteo 150, Aspersión 54, Ventana 54, Pivote 27, Mini-Aspersión 5) y `lotCompact` del Histórico trae el riego vigente por lote.
2. **Dos catálogos de zona incoherentes.** El Cronológico tiene 4 zonas y el Histórico 6, con nombres distintos (`1-Sur` frente a `1-ZONA SUR`; `6-TRAPICHES` y `7-ZONA TISMA` solo en el histórico). No hay una tabla de equivalencias explícita.
3. **Navegación anidada.**
   - Zonas tiene acordeones dentro de pestañas.
   - Hay botones duplicados «Cronológico / Histórico».
   - Cada sección tiene su propio cierre de flujo («Restaurar vista», «Seleccionar otra zona»).
   - El drill-down zona → finca → suerte existe solo en el Cronológico.
4. **Análisis con 13 pestañas planas.**
   - En móvil requiere desplazamiento horizontal («Deslizá para ver más secciones»).
   - Mezcla lectura ejecutiva, decisiones, técnica y maquila sin jerarquía.
   - Sus KPI son de la última zafra histórica (25/26), sin relación visible con el aforo 26/27. Hay riesgo de confundir el histórico con el estimado.
5. **Cobertura.** Las alertas de cobertura del estimado deben mostrarse solo si la cobertura es incompleta y ocultarse cuando es total (Issue #66).

## 3. UX14: reestructuración de Análisis por Zona

**Objetivo:** un único tablero de zona, mobile-first, con riego y secano separados en cada indicador.

1. **Selector único de zona** con una tabla de equivalencias Cronológico ↔ Histórico, declarada y probada.
   - Las zonas solo históricas (6 y 7) se muestran como «sin presencia en el cronológico vigente». No se fusionan en silencio.
2. **KPI prioritarios:** Área activa, TCH anterior, TCH estimado 26/27 y Ton. estimadas 26/27.
   - Cada uno en el formato **Riego | Secano | Total**, con TCH ponderado por área y nunca promedio de promedios.
   - El Total debe coincidir exactamente con `CASUR_CRONO_PARTICIPATION.summary`.
3. **Gráficos:** barras agrupadas Riego/Secano por zona (área, TCH anterior frente a estimado 26/27, toneladas) y bandas de TCH por sistema. La leyenda y los colores son fijos para riego y secano.
4. **Histórico de zona por sistema:** serie de TCH por zafra separada en Riego y Secano, más KATM y Potencial. Se indica que la clasificación usa el riego vigente del lote.
5. **Navegación contextual:**
   - Zona → finca → suerte en ambas pestañas, con miga de pan y retorno a la misma posición.
   - Un solo cierre de flujo.
   - Sin acordeones anidados.
6. **Se conservan:** GIS de zona, PDF/PNG (con los mismos datos y sin nodos de presentación), la tabla de haciendas y la etiqueta «Aforo 12-Oct-2026».
7. **Técnica:**
   - Adaptador de presentación en `maestro-ux.js`, con el mismo patrón de `installZonaUx13`.
   - Un agregador puro `riegoSecano(rows)` con pruebas de paridad contra los motores.
   - Sin cambios en datos, motores ni `index.html` protegido, salvo autorización.

## 4. UX15: reestructuración del submódulo Análisis

**Objetivo:** pasar de 13 pestañas a 5 familias con jerarquía clara y un filtro global de sistema.

| Familia | Contenido actual que agrupa |
|---|---|
| Resumen | Resumen, lectura ejecutiva automática y KPI de la última zafra, con etiqueta «Histórico 25/26» |
| Desempeño | Tendencia TCH, Mejores desempeños, Caídas y TCH × KATM |
| Decisiones | Decisiones, Prioridades, Oportunidades y Renovación |
| Composición | Variedades y Zonas (enlazada con UX14) |
| Técnica | Vista técnica y Maquila (caso aparte, sin mezclarse con caña propia) |

- **Filtro global Riego / Secano / Total:** aplica a todas las familias y se conserva al navegar. Los rankings y prioridades se calculan dentro de cada sistema.
- **Estimado 26/27 separado del histórico:** se muestra como referencia separada, con el aforo del 12-Oct-2026, y nunca se mezcla con el plan de cosecha (BE/BF).
- **Mobile-first:** familias en un selector compacto en 360/390 y pestañas en escritorio. Sin desplazamiento horizontal.
- **Exportaciones:** cada familia exporta PDF/PNG con el filtro de sistema indicado en la cabecera y la fecha de consulta en formato `DD-MMM-AAAA`.

## 5. QA y entrega por etapa

- **Paridad de cifras** de cada KPI frente a los motores actuales:
  - Total = Riego + Secano en área y toneladas.
  - TCH ponderado.
  - Zonas y haciendas idénticas a las de hoy.
- **Pruebas en navegador:** 360/390 (Android emulado), 768, 1280 y 1536. Navegación de ida y vuelta, PDF/PNG, PWA offline y tiempos de apertura.
- **Regresiones:** UX13 A/B/C, Plan Z26/27 (55) y las suites 212/160/92.
- **Entrega:** Draft PR por etapa (UX14 y luego UX15), con preview HTTPS en `casur-maestro-ux-review`. Sin merge ni publicación sin aprobación.

## 6. Decisiones que requieren al propietario

1. **Equivalencia de zonas:** confirmar que `6-TRAPICHES` y `7-ZONA TISMA` se muestran como zonas solo históricas.
2. **Clasificación del riego:** confirmar que Secano = `tipoRiego` «Secano» y Riego = todos los demás (Gravedad, Goteo, Aspersión, Ventana, Pivote, Mini-Aspersión). En particular, si «Ventana» es riego.
3. **Atributo de riego en el Histórico:** aceptar el riego vigente del lote para clasificar las zafras anteriores, o pedir un dato de riego por zafra.
4. **Maquila:** confirmar si permanece en Análisis/Técnica o pasa a otra sección.
