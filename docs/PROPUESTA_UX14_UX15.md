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

## 3. Reglas comunes, refinadas con el propietario el 24-Nov-2026

1. **Clasificación explícita del sistema:** Riego, Secano y Sin dato, con una tabla declarada y probada.
   - Riego: Gravedad, Goteo, Aspersión, Pivote y Mini-Aspersión.
   - Secano: `Secano`.
   - Sin dato: vacío o cualquier valor desconocido. **Nunca se clasifica automáticamente como Riego.**
   - **«Ventana» queda en una categoría propia y visible, «Por confirmar»,** hasta verificar su significado en la clasificación operativa CASUR. Pesa **325.65 ha activas y 23,269.85 t estimadas** (1-Sur 280.14 ha, 3-Norte 13.87 ha y 5-Productores 31.64 ha), así que la decisión cambia las cifras.
2. **Conciliación obligatoria:** Riego + Secano + Ventana + Sin dato = Total, en área y toneladas, en cada vista y exportación.
   - Verificado con la generación 1102:
     - Área activa: 8,396.03 + 852.98 + 325.65 + 0.00 = **9,574.66 ha**.
     - Área de molienda: 7,990.11 + 810.44 + 301.13 = **9,101.68 ha**.
     - Toneladas estimadas: 507,072.02 + 31,316.40 + 23,269.85 = **561,658.27 t**.
   - Hoy hay 0 suertes «Sin dato».
3. **TCH = toneladas ÷ área válida,** nunca un promedio simple de TCH.

   | Indicador | Cálculo |
   |---|---|
   | TCH estimado Z26/27 | toneladas estimadas ÷ área de molienda con estimado |
   | TCH anterior (aforo, columna P «Tch.Ant») | ponderado por área de molienda |
   | TCH ejecutado Z25/26 | toneladas cosechadas ÷ área cosechada del Histórico |

4. **Áreas que no se mezclan:**
   - Área activa (inventario vigente).
   - Área de molienda (base del estimado).
   - Área con estimado.
   - Área cosechada histórica.

   Cada tarjeta nombra cuál usa.
5. **Ejecutado y estimado separados:** «TCH ejecutado Z25/26 (Histórico)» frente a «TCH estimado Z26/27 (Aforo 12-Oct-2026)». Se muestran en bloques y colores distintos, y «TCH anterior» del aforo no se presenta como ejecutado.
6. **Histórico por sistema actual:** el Histórico solo tiene el riego **vigente** del lote, no el sistema de cada zafra. Todo análisis histórico por sistema se rotula «segmentado según el sistema de riego actual del lote».
7. **Selector global Total / Riego / Secano** en lugar de triplicar valores dentro de cada KPI.
   - Controla KPI, gráficos, rankings, tablas y exportaciones.
   - Se conserva al navegar y se imprime en la cabecera del PDF/PNG.
   - Los gráficos comparativos Riego frente a Secano se mantienen siempre visibles, sea cual sea el filtro.
8. **Fechas** en formato `DD-MMM-AAAA` (docs/ESTANDAR_FECHAS.md).

## 4. UX14: reestructuración de Análisis por Zona

**Maquetas** (propuesta, no implementada): `ux14-390.png` y `ux14-1280.png`, entregadas fuera del repositorio con datos reales de la generación 1102.

1. **Zonas:**
   - Selector único con las zonas del Cronológico (`1-Sur`, `2-Centro`, `3-Norte`, `5-Productores`).
   - **`6-TRAPICHES` y `7-ZONA TISMA` se conservan solo en el Histórico,** marcadas «solo Histórico». No se inventan datos en el Cronológico.
   - Equivalencia explícita: `1-Sur` ↔ `1-ZONA SUR`, y así con las demás.
2. **KPI según el filtro:**
   - Área activa y Área de molienda.
   - TCH ejecutado Z25/26 (Histórico, sistema actual).
   - TCH estimado Z26/27 y Ton. estimadas Z26/27 (Aforo 12-Oct-2026).
3. **Conciliación visible** de área y toneladas por sistema, en una barra apilada con los valores.
4. **Gráficos Riego frente a Secano por zona:**
   - TCH estimado Z26/27.
   - TCH ejecutado Z25/26 (rotulado por sistema actual).
   - Bandas de TCH por sistema.
   - Colores fijos: Riego petróleo `#1F4E5C`, Secano oro `#D4B35F`, Ventana salvia `#86A0AA`, Sin dato gris.
5. **Tabla de haciendas** filtrada por sistema, con un toque para abrir la finca. Navegación con miga de pan Zonas › zona › finca › suerte y retorno a la misma posición. Sin acordeones anidados.
6. **Se conservan:** GIS de zona, PDF/PNG con el filtro en la cabecera y «Consulta: DD-MMM-AAAA», y el Histórico de zona (KATM, potencial, variedades, comparación 25/26).
7. **Implementación:**
   - Adaptador de presentación en `maestro-ux.js`, como `installZonaUx13`.
   - Agregador puro `systemBreakdown(rows)` con pruebas de paridad: el Total debe ser igual a `CASUR_CRONO_PARTICIPATION.summary` y a los totales oficiales.
   - Sin cambios en motores ni datos.

**Hallazgo agronómico para revisar:** Secano en 1-Sur tiene TCH estimado Z26/27 de **11.30** (1,706.90 t en 151.03 ha), frente a 59.61 ejecutado en Z25/26. Conviene confirmarlo con Campo antes de presentarlo como tendencia.

## 5. UX15: reestructuración del submódulo Análisis

**Maquetas** (propuesta, no implementada): `ux15-390.png` y `ux15-1280.png`.

| Sección | Contenido actual que conserva |
|---|---|
| Resumen | Resumen y lectura ejecutiva automática (`executiveNarrative`) |
| Desempeño | Tendencia TCH, Mejores desempeños, Caídas y TCH × KATM |
| Decisiones | Decisiones, Prioridades, Oportunidades y Renovación |
| Composición | Variedades y Zonas (enlace a UX14) |
| Técnica | Vista técnica |
| **Maquila** | **Sección independiente.** No entra en los totales de caña propia |

- **Bloque ejecutado:** «Ejecutado · Histórico Z25/26».
  - Paridad verificada con el motor actual: 63.94 t/ha, 9,735.96 ha cosechadas y 622,474 t, sin Maquila.
  - Se muestran también Z24/25 y Z23/24.
- **Bloque estimado:** «Estimado · Aforo Z26/27», separado, con 61.71 t/ha, 9,101.68 ha de molienda y 561,658.27 t.
- **Filtro global** Total / Riego / Secano en las 6 secciones. Los rankings y prioridades se calculan dentro del sistema seleccionado.
- **Mobile-first:** selector de secciones desplazable a 360/390 px y pestañas en escritorio. Sin desbordamiento horizontal, verificado en las maquetas.

## 6. QA y entrega por etapa

- **Paridad:**
  - Totales iguales a los motores actuales y a los oficiales (9,574.66 ha; 9,101.68 ha; 561,658.27 t; Z25/26 63.94 t/ha).
  - Conciliación por sistema en cada vista.
  - TCH ponderado.
- **Navegador:** 360/390 (Android emulado), 768, 1280 y 1536. Ida y vuelta, PDF/PNG, PWA offline y tiempos de apertura.
- **Regresiones:** UX13 A/B/C, Plan Z26/27 (55) y las suites 212/160/92.
- **Entrega:** un Draft PR por etapa (UX14 y luego UX15), con preview HTTPS en `casur-maestro-ux-review`. Sin merge ni publicación sin aprobación. **No se inicia hasta validar la candidata actual.**

## 7. Decisiones del propietario

| Tema | Estado |
|---|---|
| Zonas 6-TRAPICHES y 7-ZONA TISMA | **Decidido:** se conservan en el Histórico, sin datos inventados en el Cronológico |
| Ventana | **Pendiente:** verificar su significado operativo. Mientras tanto queda como «Por confirmar», visible y conciliada |
| Valores desconocidos de riego | **Decidido:** van a «Sin dato», nunca a Riego |
| Riego en el Histórico | **Decidido:** segmentación por sistema actual, rotulada explícitamente |
| Maquila | **Decidido:** sección independiente dentro de Análisis |
| Selector global | **Propuesto:** Total / Riego / Secano en lugar de triplicar los KPI |
| TCH Secano 1-Sur Z26/27 (11.30) | **A revisar** con Campo |
