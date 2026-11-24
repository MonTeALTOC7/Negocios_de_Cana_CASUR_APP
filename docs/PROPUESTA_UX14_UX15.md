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

## 4. UX14: Análisis por Zona (refinamiento 2, 24-Nov-2026)

**Maquetas:** `r2-ux14-general` (todas las zonas) y `r2-ux14-zona` (ficha de 1-Sur), a 360, 390 y 1280 px. Se entregan fuera del repositorio, sin desbordamiento horizontal.

1. **Navegación:**
   - Conmutador **Cronológico | Histórico** fijo en la parte superior.
   - Miga de pan Zonas › zona › finca › suerte.
   - **Vista general** (todas las zonas) y **ficha de zona**, diferenciadas.
2. **Filtros:**
   - Selector global **Total / Riego / Secano** y selector de zona.
   - Chips consultables «Ventana · por confirmar» y «Sin dato». Se activan solo cuando hay registros; «Sin dato» con 0 ha queda deshabilitado.
3. **Cuatro KPI principales:**
   - Área activa.
   - **TCH Z25/26** (ejecutado, del Histórico).
   - TCH estimado Z26/27.
   - Ton. estimadas Z26/27.
   - **Área de molienda** se muestra como indicador complementario compacto.
4. **Metodología en ayudas contextuales** (icono «i»): definición de cada área, cálculo del TCH, segmentación histórica por riego actual y estado de Ventana. No se muestran textos metodológicos fijos.
5. **Composición compacta:** barra apilada de área activa y toneladas por sistema, con valor y porcentaje. Sustituye los bloques de conciliación; la suma del total sigue comprobándose en las pruebas.
6. **Ámbito de los gráficos:**
   - En la ficha de zona, todos los gráficos usan solo esa zona: «TCH por sistema · 1-Sur», ejecutado Z25/26 frente a estimado Z26/27.
   - Las comparaciones entre zonas solo aparecen en la vista general, rotuladas «comparación entre zonas».
7. **TCH anterior (columna P) frente a TCH ejecutado Z25/26:**
   - Son indicadores distintos y no se mezclan.
   - La columna P «Tch.Ant» del aforo coincide con el ejecutado Z25/26 del Histórico en 811 de 884 suertes de Molienda con Z25/26. Difiere en 73 suertes; por ejemplo, la finca 516 tiene diferencias de hasta 14 t/ha. Otras 62 suertes de Molienda no tienen Z25/26.
   - UX14 usa **TCH Z25/26 del Histórico** como KPI y en las tablas. La columna P queda disponible solo en la ficha de suerte, rotulada «TCH anterior (aforo)».
8. **Se conservan:** abrir finca o suerte desde las tablas, el mapa GIS de la zona, PDF/PNG (con el filtro en la cabecera) y el acceso al Histórico de zona (KATM, potencial, variedades).

## 5. UX15: Análisis (refinamiento 2)

**Maqueta:** `r2-ux15-resumen`, a 360, 390 y 1280 px.

- **Seis secciones:** Resumen, Desempeño, Decisiones, Composición, Técnica y **Maquila**, esta última independiente y fuera de los totales de producción propia.
- **Navegación:**
  - En Android (360/390), **selector compacto «Sección»**. No hay pestañas cortadas ni desplazamiento horizontal.
  - En escritorio, pestañas.
- **Resumen · Histórico Z25/26 (ejecutado)**, con cuatro KPI con paridad exacta con el motor actual: TCH 63.94, área cosechada 9,735.96 ha, toneladas 622,474 y KATM 98.65.
- **Tendencia en gráfico de líneas** Z16/17–Z25/26, con Total, Riego y Secano por el sistema actual del lote. Los TCH de otras zafras salen de las tarjetas y pasan al gráfico. Las barras quedan para comparaciones por categoría.
- **Estimado Z26/27** en un bloque independiente: 61.71 t/ha, 561,658 t y 9,101.68 ha de molienda, con aforo del 12-Oct-2026.
- **Sin textos de desarrollo:** no se muestran tablas de equivalencias ni notas de implementación al usuario.

## 5 bis. Auditoría agronómica: TCH estimado 11.30 en Secano de 1-Sur

El detalle por finca y suerte está en el libro `Auditoria_TCH_Secano_1Sur.xlsx`, entregado fuera del repositorio. No se modificó ningún dato oficial.

- **Denominador correcto.**
  - Son 24 suertes, todas Molienda.
  - Área activa = área de molienda = área con estimado = **151.03 ha**, con cobertura completa.
  - AE = AD × área. Las 1,706.90 t ÷ 151.03 ha dan **11.30 t/ha**.
- **Causa: el AD del aforo.**
  - Las 24 suertes tienen **AD plano de 10 o 15 TCH**, con AF de 10, 15 o 25:

  | Finca | Suertes | AD (TCH) |
  |---|---|---|
  | Ojo de Agua | 6 | 10 |
  | San Francisco | 7 | 10 |
  | San Luis | 3 | 10 |
  | El Socorro | 1 | 10 |
  | San Felipe | 7 | 15 |

  - Su TCH anterior ponderado es 63.41 (columna P) y su ejecutado Z25/26 es 63.40 (Histórico, 151.11 ha cosechadas).
  - Entre Z22/23 y Z25/26, esos lotes registraron entre 37 y 117 TCH.
- **Contexto.**
  - En toda la empresa hay 31 suertes de Molienda con AD ≤ 15 (210.52 ha): 24 en 1-Sur Secano, 2 en 2-Centro Secano, 4 en 3-Norte y 1 en 1-Sur Gravedad.
  - Las 24 suertes se cortaron entre Feb-2026 y Abr-2026 y tenían 6 a 7.6 meses al aforo.
- **Comparabilidad.** El área histórica difiere poco de la vigente (por ejemplo, 22003: 8.79 ha frente a 8.73 ha). La comparación histórica es válida por suerte y por área cosechada.
- **Conclusión.**
  - El 11.30 no es un error de cálculo ni de denominador. Refleja un **valor de aforo uniforme y muy inferior al historial**.
  - Puede ser un criterio conservador deliberado (Secano, sequía o rebrote joven) o un valor provisional.
  - **Requiere confirmación de Campo y Programación** antes de usarlo en comparaciones Riego frente a Secano. Mientras tanto, las maquetas lo muestran tal cual, sin corregirlo.

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
| TCH Secano 1-Sur Z26/27 (11.30) | **Auditado:** el denominador es correcto y el AD es plano (10/15) en 24 suertes. Confirmar con Campo |
| KPI histórico de UX14 | **Decidido:** TCH Z25/26 ejecutado del Histórico; la columna P solo en la ficha de suerte |
