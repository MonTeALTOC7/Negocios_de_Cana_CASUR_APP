# Exportadores PDF/PNG: etapas R1 y R2

**Autorización:** del propietario, 26-Nov-2026, para las etapas R1 y R2 de `docs/PROPUESTA_REDISENO_INFORMES.md`, incluidos los cambios estrictamente necesarios en el bloque protegido de `modules/produccion/index.html`.
**Pendiente:** R3 (informes múltiples y de Zona), sujeto a la revisión visual de las cuatro plantillas principales.

## R1: corrección del motor actual

**Cambio:** un único bloque `/* R1-EXPORT … */ … /* R1-EXPORT-END */`, insertado después de `window.CASUR_VISUAL_EXPORT=…` en `index.html`. No se modifica ninguna otra línea del motor.

1. **Mismo contexto CSS.**
   - `renderCanvas` se reemplaza por una versión que monta el clon en un `iframe` aislado. Ese `iframe` contiene solo `RENDER_CSS` y la misma raíz `div.casur-render-root` que luego pinta el `foreignObject`.
   - La medición, los puntos de corte y la paginación del Histórico múltiple se calculan ahí.
   - Las hojas de la aplicación (premium) ya no intervienen.
2. **Iconos:** `.casur-render-root svg.maestro-icon` mide 16 × 16 px; antes medía 417 o 1400 px.
3. **Tipografía:** la fuente, el color y el interlineado se declaran en `.casur-render-root`, que existe en ambos contextos. Antes solo estaban en `html,body`, que no existen dentro del `foreignObject`.
4. **Recortes:** la altura del SVG sale del mismo contexto que pinta, así que el contenido completo y el pie quedan dentro.
5. **Paginación:**
   - Se suman puntos de corte entre bloques (KPI, gráficos y resúmenes).
   - Se descarta cualquier corte situado a menos de 90 px debajo de un título (`h2`–`h4`, `.section-title`, `figcaption`). Así ningún título queda solo al pie de una página.

**Guarda:**
- `modules/produccion/tests/maestro-ux.test.mjs` retira el bloque solo si su SHA-256 coincide con `4501dd20…fbd311` y si aparece una única vez.
- Cualquier otro cambio en `index.html` sigue haciendo fallar la prueba.

### Validación R1 (`tools/audit-exporters.cjs`, botones reales, PC y Android)

| Informe | Antes (usada → necesaria) | R1 (usada = necesaria) | Pie | Iconos |
|---|---|---|---|---|
| Cronológico de Finca (Pansaco) | 300 → 2,875 px | 2,050 = 2,050 px (2 páginas, 49 suertes) | Visible | 16 px |
| Cronológico de Suerte (01) | 479 → 563 | 563 = 563 | Visible | — |
| Histórico de Finca | 1,351 → 1,304 | 1,304 = 1,304 | Visible | — |
| Histórico de Suerte | 1,351 → 1,293 | 1,293 = 1,293 | Visible | — |
| Cronológico múltiple | 760 → 760 | 760 = 760 | Visible | — |
| Zona Cronológico / Histórico | 1,263 → 1,231 / 1,749 → 1,720 | 1,231 = 1,231 / 1,720 = 1,720 | Visible | — |
| Histórico múltiple ejecutivo / completo | paginado | paginado, medido en el mismo contexto | Visible | — |

**Revisión visual:** las páginas están en `docs/auditoria-exportadores/r1/`.
- **Zona:** la tabla de haciendas empieza en la página 2 junto con su título (antes el título quedaba huérfano).
- **Cronológico de Finca:** completo, con la tabla y el pie.
- **Tipografía:** sans en todos los informes.

**Fuera de R1 (sin recorte, pero de calidad mejorable; se resuelven en R2 o R3):**
- Texto pequeño en el Cronológico múltiple (render de 1,600 px).
- Una página con 3 filas en el Histórico múltiple completo.
- PDF de imagen.

## R2: motor de informes independiente de la pantalla

### Decisión técnica: biblioteca PDF frente a escritor propio

| Criterio | jsPDF 4.2.1 (MIT) | pdf-lib 1.17.1 (MIT) + fontkit | Escritor propio |
|---|---|---|---|
| Texto seleccionable con fuente TTF incrustada (Identity-H + ToUnicode) | Incluido | Requiere `@pdf-lib/fontkit` (~1 MB extra) | Hay que escribir un lector TTF, subconjunto, tabla de anchos y CMap |
| Mantenimiento | Activo (versión de mar-2026) | Sin versiones desde 2021 | A cargo del proyecto |
| Tamaño servido | 420 KB (UMD minificado; `canvg` y `dompurify` solo se usan en `html()`/SVG, que no se emplean) | ~500 KB + fontkit | ~15–25 KB, más el riesgo de errores de codificación |
| Android / PWA sin conexión | JavaScript puro, sin red; precargado | Igual | Igual |
| Riesgo técnico | **Bajo**: API estable de texto, líneas, rectángulos e imágenes | Medio (dependencia sin mantenimiento) | Alto (fuentes y Unicode) |

**Decisión:** jsPDF 4.2.1. El archivo `jspdf.umd.min.js` va sin modificar en `modules/produccion/vendor/jspdf/`, con licencia y SHA-256 en su `README.txt`.

- Se usa solo la API básica: `text`, `line`, `rect`, `roundedRect`, `circle`, `addImage` y la fuente TTF.
- Se carga **solo al exportar**: el arranque del módulo no aumenta.
- Queda incluido en el precaché del Service Worker para uso sin conexión.

**Fuente:** Inter 4.1 (OFL-1.1) en Regular, SemiBold y Bold, convertida a TTF y reducida a Latin, Latin-1, Latin Extended-A y los símbolos que usan los informes («Δ», «≥», «→», «·», «–», «•», «…»).
- Pesa ~50 KB por peso, en `modules/produccion/assets/fonts/report/`.
- La misma fuente se registra en jsPDF (PDF) y como `FontFace` (PNG), de modo que la medición y el dibujo coinciden.

### Arquitectura

| Pieza | Archivo | Función |
|---|---|---|
| Motor | `js/report-engine.js` | Carga los recursos y define `Doc` (páginas en puntos con encabezado, pie y flujo de bloques). Bloques: título, KPI, grupos de variables, composición, gráfico de líneas vectorial, nota, fila y tabla paginada con encabezado repetido. Salidas `toPdf` y `toPng` |
| Plantillas | `js/report-models.js` | Cronológico de Finca y de Suerte, Histórico de Finca y de Suerte. Leen el panel oficial y los motores expuestos; no recalculan cifras oficiales |
| Despacho | Bloque `R2-EXPORT` en `index.html` | Los botones existentes de Cronológico e Histórico (finca o suerte) llaman a `CASUR_REPORTS`. Los múltiples y los de Zona siguen en el motor R1 hasta R3 |

**Paginación:**
- Bloques indivisibles.
- Las tablas se dividen por filas, repiten el encabezado y llevan «(continuación)».
- Un separador de sección nunca queda al pie, separado de su primera fila.
- Un título se mantiene con el inicio de su contenido.

**Orientación:** cada sección elige la suya. Por ejemplo, el resumen va en vertical y las tablas anchas en horizontal, dentro del mismo PDF.

**PNG:** apila las páginas con la misma lista de dibujo, con escala adaptativa: hasta 2.5×, ≤ 16,000 px por lado y ≤ 32 MP en total, que es el techo de memoria para Android. El tamaño real queda en `CASUR_REPORTS.last.png`.

### Plantillas

| Plantilla | Orientación | Contenido |
|---|---|---|
| **Cronológico de Finca** | Vertical (resumen) + horizontal (detalle) | **KPI:** área activa, TCH estimado Z26/27, TCH **ejecutado** Z25/26 (Histórico) y edad actual. KPI secundarios: toneladas estimadas, TCH **anterior (aforo)**, molienda/semilla y distancia. **Composición** por variedad, tipo de riego, # de cortes (rangos) y destino, con categorías originales. **Participación** (activas de molienda y de semilla, inactivas). **Detalle** de todas las suertes en dos tablas que reúnen las 18 variables de la tabla oficial más edad, fecha para cosecha (BE), corte (BF) y participación, agrupadas por activas de molienda, activas de semilla e inactivas |
| **Cronológico de Suerte** | Vertical, 1 página | KPI en el orden pedido: TCH estimado, fecha para cosecha, área, edad. Gráfico histórico TCH (mismo cálculo que la pantalla). Grupos: caracterización agronómica, datos productivos, plan de cosecha, ubicación y estado, y escenario optimista (aparte). Sin tabla de 18 columnas; variedad, zona y tenencia solo en el encabezado |
| **Histórico de Finca** | Vertical (resumen) + horizontal (tablas) | KPI y comparaciones oficiales, alertas, TCH por zafra y gráficos de área, toneladas y KATM. Resumen por zafra (tabla oficial). Detalle histórico por suerte: TCH por zafra de todos los lotes de la finca |
| **Histórico de Suerte** | Vertical (ficha) + horizontal (tabla) | KPI y comparaciones frente a CASUR, zona, variedad y riego. Gráficos TCH y KATM por zafra. Tabla histórica completa de 14 columnas en página horizontal |

### QA (`tools/qa-informes.cjs`): 27/27, en PC y Android con los botones reales

**PDF:**
- Texto extraíble con `pdftotext`, fuentes Inter incrustadas y una sola imagen (el logo).
- Orientación de cada página según la plantilla.
- «Página X de Y» y fechas `DD-MMM-AAAA`, sin fechas ISO.
- Ningún elemento fuera de los márgenes (`audit()` = 0).

**Paridad:**
- **Cronológico de Finca:** las 49 suertes de Pansaco aparecen en las dos tablas de detalle, y cada cifra (área, variedad, # de corte, riego, TCH, TCH est. y Ton. est.) es igual a la tabla oficial. KPI iguales al panel: 368.44 · 48.57 · 63.35 · 10.61 · 17,452.08 · 66.23.
- **Cronológico de Suerte:** orden de los KPI, variedad mostrada una sola vez y ausencia de la tabla de 18 columnas.
- **Histórico de Finca:** el resumen por zafra es igual al oficial, figuran los 61 lotes y su área Z25/26 suma 428.96 ha, igual que el KPI.
- **Histórico de Suerte:** 10 zafras con área, toneladas, TCH, KATM, edad y estado.

**Otros casos:**
- **Finca pequeña 904:** «Argüello» se extrae correcto y figuran sus suertes, incluidas las de letra.
- **Selección múltiple:** sigue en el motor R1, medida en el contexto aislado y con el pie dentro del área.
- **PNG:** dimensiones ≤ 16,000 px y ≤ 32 MP, con escala ≥ 1.5×. Por ejemplo, el Cronológico de Finca sale de 1,980 × 9,830 px.
- **Sin conexión:** shell PWA con Service Worker y red desconectada. El motor, jsPDF y las fuentes se cargan desde la caché y se descargan PDF y PNG.

**Muestras:** `docs/muestras-informes-r2/` contiene PDF y PNG de las cuatro plantillas (Pansaco y suerte 01), con los nombres de archivo vigentes (R2-2).

**Pendiente (R3):** migrar los informes múltiples (Histórico ejecutivo/completo y Cronológico múltiple) y los de Zona al mismo motor, después de la revisión visual de estas cuatro plantillas.

## R2-2: refinamiento ejecutivo (27-Nov-2026)

Sustituye el contenido de las cuatro plantillas descritas arriba. La arquitectura no cambia: jsPDF, Inter, el motor y la exportación sin conexión siguen igual. Desde esta versión rige la norma permanente [`docs/ESTANDAR_EDITORIAL_INFORMES.md`](ESTANDAR_EDITORIAL_INFORMES.md).

### Motor (`report-engine.js`)
- **Pie:** solo «Negocios de Caña · CASUR» y «Página X de Y».
- **Encabezado:** la fecha de consulta va a la derecha. No lleva metadatos internos.
- **KPI:** etiqueta, valor y unidad sobre fondo suave, sin notas. Hay una fila complementaria compacta (`kpis(..., true)`).
- **`composition`:** sustituye a `bars`. Usa el diseño de Análisis por Zona: barra apilada con los porcentajes reales y filas alineadas (color · categoría · área · %). Toma los colores de Zonas (`RIEGO` para tipo de riego y `SEQ` en secuencia Petróleo).
- **`groups`:** son columnas de tarjetas apiladas. La última tarjeta de cada columna se estira para no dejar huecos.
- **Gráfico:**
  - Zafras completas y cuadrícula discreta.
  - Puntos con anillo blanco.
  - Etiquetas en el cuadrante libre de la línea.
  - Promedio rotulado al final de la línea, sin subtítulos.
- **Nombre de archivo:** `fileName()` genera `Tipo_Finca[_Suerte_NN]_DD-MMM-AAAA.ext`. El bloque R2-EXPORT de `index.html` usa `out.name`, y su huella está actualizada en `maestro-ux.test.mjs`.

### Plantillas y trazabilidad (solo en código)
| Plantilla | Páginas antes → ahora | Contenido visible | Fuente (no se imprime) |
|---|---|---|---|
| Cronológico de Finca | 5 → 2 | **KPI:** área activa, TCH estimado Z26/27, TCH anterior Z25/26 = **63.35** y edad actual. **Complemento:** toneladas estimadas y distancia. Composición apilada por variedad, tipo de riego, # de cortes y destino. Una tabla de 11 columnas agrupada en Molienda, Semilla e Inactivas | **KPI:** panel oficial. **TCH anterior:** `mainEntities().latest.tch` (Histórico). En la tabla, el TCH anterior por suerte sale de `lotCompact` por código exacto y zafra más reciente; si no hay registro se muestra «—», sin usar el TCH del aforo (p. ej. 99302A, 99324A). **Estimado:** AD. **Fecha y corte:** BE/BF |
| Cronológico de Suerte | 1 → 1 | **KPI:** TCH estimado, fecha para cosecha, área y edad. Gráfico TCH por zafra con promedio. **Fichas:** caracterización, ubicación, datos productivos, plan de cosecha y escenario optimista | **Tabla oficial de la suerte:** AD/AE. **Plan:** BE/BF. **Escenario:** AF/AG. **TCH y área Z25/26:** Histórico del lote |
| Histórico de Finca | 4 → 3 | **KPI Z25/26:** área cosechada, TCH, KATM y edad, más la distancia. Dos gráficos a todo el ancho: TCH y KATM. Resumen por zafra sin km, estado ni acción. TCH por suerte y zafra de los 61 lotes | Panel oficial y `lotCompact` (sin Maquila) |
| Histórico de Suerte | 2 → 1 | Los mismos KPI y gráficos. Tabla de 7 columnas: zafra, área, toneladas, TCH, KATM, edad y # de cortes. Variedad y tipo de riego vigentes solo en el encabezado | Tabla oficial del lote |

### QA editorial
`tools/qa-informes.cjs` rechaza los patrones prohibidos en todos los PDF y comprueba el pie exacto de cada página. Los patrones son:
- Referencias entre paréntesis: (AD), (AE), (AF), (AG), (BE), (BF), (P).
- Cualquier mención a «columna» y los archivos .xlsx.
- «Generación» o versiones aforo.NNNN, «Consolidado» y «motor oficial».
- «Estimado utilizable», «universo de molienda», «no es aforo», «Ponderado por» y «Fuente».
- «Participación», «Estado maestro», «Cambio TCH», «Variabilidad», «Vs …» y «Alerta».
- «TCH ejecutado», «(aforo)», «Km pond.», «Dist. ref.» y «Documento de consulta».

Además verifica:
- Los nombres de archivo de PDF y PNG.
- El orden de los KPI y la ausencia de 66.23 y de KPI duplicados.
- Que área y % de cada composición son iguales a `agronomicGroups`.
- El tipo de riego original.
- Cada fila de la tabla frente a la tabla oficial y el TCH anterior frente al Histórico por código.
- El resumen por zafra, los 61 lotes y las 10 zafras de la suerte.
- Las páginas verticales y los márgenes.

Se conservan las pruebas de PNG Android, la selección múltiple (R1) y la exportación sin conexión.

## R2-3: iteración fina (27-Nov-2026)
- **Encabezado uniforme en todos los exportadores:** «Negocios de Caña · CASUR» y «Consulta: DD-MMM-AAAA · hora» en la esquina derecha.
  - **Motor de informes:** se aplica en la página 1.
  - **Motor R1** (múltiples y Zona): lo aplica `uniformHeader()` dentro del bloque `R1-EXPORT`, cuya huella está actualizada. Afecta solo a la copia exportada: la pantalla no cambia.
  - En esos encabezados se quitan los metadatos internos que quedaban: generación, consolidado, AD/AE, motor oficial, fuente, notas metodológicas y consultas con otro formato de fecha.
- **Cronológico de Finca y de Suerte:** sin «Fecha de aforo».
- **Cronológico de Suerte · Datos productivos:** se añade «TCH estim. Z26/27» (AD).
- **Histórico de Finca y de Suerte:** el gráfico TCH lleva la línea «TCH histórico».
  - Se calcula como toneladas ÷ área de todas las zafras, con el mismo criterio que «Vs histórico» del panel: Pansaco 73.53 y suerte 01 89.58.
  - Las etiquetas de valor llevan fondo blanco para leerse limpias sobre la línea.
- **QA:**
  - `qa-informes.cjs` verifica el encabezado de la página 1, la ausencia de «aforo», «TCH estim. Z26/27» en Datos productivos, el TCH histórico frente al panel (KPI TCH − «Vs histórico») y el encabezado R1 de la selección múltiple.
  - `qa-maestro-ux14.cjs` verifica el encabezado uniforme del exportador de Zona, sin metadatos internos.

## R3: homologación y cierre de exportadores (27-Nov-2026)

Los cinco informes restantes pasan al **mismo motor** (`report-engine.js` + `report-models.js`, jsPDF, Inter) y a la norma `docs/ESTANDAR_EDITORIAL_INFORMES.md`. No hay otro motor ni otra biblioteca.

- **Bloque `R2-EXPORT` de `index.html`:** despacha `cronologico-multiple`, `historico-multiple` (con su variante ejecutiva o completa) y `zona`/`zona-historico` al motor. Su huella está actualizada.
- **Motor anterior:** solo quedan en él las vistas generales de inicio del Cronológico y del Histórico, que no estaban en el alcance de R3.
- **Motor de informes:**
  - Una tabla corta, de menos de media página, se mantiene entera.
  - La fila de total nunca queda sola en otra página.

| Informe | Fuente (no se imprime) | Contenido | Páginas de la muestra |
|---|---|---|---|
| **Cronológico múltiple** | `CASUR_CRONO_SELECTION`: claves `código::suerte` exactas, incluidas selecciones parciales. Usa los motores `summary`, `participation`, `agronomicGroups` y `forecastForRow`. El TCH anterior Z25/26 sale del Histórico por código de lote | **KPI:** área activa, TCH estimado Z26/27, TCH anterior Z25/26 y edad actual. **Complemento:** toneladas, distancia, fincas y suertes. Composición apilada. Detalle de 11 columnas agrupado **por finca**, sin repetir códigos | 1 (3 suertes en 3 fincas) |
| **Histórico multifinca ejecutivo** | `getHistoricoDualSummary()`: período, serie por zafra, TCH del período completo y fincas. Usa también `historicoMultiReportCharts().rows`, filtrado por la selección exacta | **KPI del período:** área cosechada, TCH, KATM y edad. **Complemento:** toneladas, distancia, fincas y suertes. Gráficos TCH (con «TCH histórico») y KATM. Resumen por finca. TCH por finca y zafra | 1 |
| **Histórico multifinca completo** | Las mismas fuentes que el ejecutivo | Todo el ejecutivo, más el resumen por zafra de la selección. Por cada finca: resumen por zafra y TCH por suerte y zafra **de las suertes seleccionadas** | 6 (Pansaco y San Jerónimo completas) |
| **Cronológico de Zona** | Nodo de exportación de `CASUR_ZONE_UX14` (`exportNode`, todas las filas) y `agronomicGroups` sobre las suertes de la zona | KPI y complemento de la pantalla. Composición apilada por variedad, tipo de riego, # de cortes y destino. Comparación productiva por tipo de riego. Detalle por finca (o por zona, en «Todas las zonas») | 2 |
| **Histórico de Zona** | `exportNode` y `histFigures(zona).official` para la serie oficial por zafra | KPI y complemento. Gráficos TCH (con «TCH histórico») y KATM. Composición de área y toneladas por tipo de riego. Comparación con el histórico. Resumen por zafra. Detalle por finca | 2 |

**Decisiones de presentación:**
- **TCH por finca y zafra** y **TCH por suerte y zafra:** cada valor es toneladas ÷ área de las filas de la selección. El QA comprueba que esta agregación reproduce la serie oficial por zafra en cada zafra.
- **Tabla de Zona:** se omite la posición «#» del ranking, porque el orden ya la expresa. También se omiten las zonas que solo existen en el Histórico cuando el informe es del aforo, ya que no tienen ningún dato en él.
- **«Todas las zonas»:** la comparación por zona no se repite, porque coincide con el detalle por zona.
- **Mapa híbrido del Histórico multifinca completo:** no se incluye. Era una imagen de mosaicos que exigía conexión, y el encargo de R3 pide conservar el detalle histórico, no el mapa. El mapa sigue disponible en la pantalla.
- **«Consolidado»** se reserva para la fecha de consolidación de datos y no se imprime. En multifinca, el total de la selección se rotula «Total selección».

**QA (`tools/qa-informes-r3.cjs`, nueva), en PC y Android con los botones reales:**
- **Escenarios:**
  - Cronológico múltiple con 3 fincas y con una selección parcial de 3 suertes de Pansaco, que incluye una inactiva.
  - Histórico multifinca ejecutivo, completo y parcial (3 suertes de Pansaco más San Jerónimo completa).
  - Zona 2-Centro y «Todas las zonas».
  - Histórico de 2-ZONA CENTRO.
- **Comprobaciones:**
  - Norma editorial compartida: `tools/qa-informes-norma.cjs`.
  - Nombres de archivo, texto seleccionable, fuentes incrustadas, márgenes, páginas verticales, «Página X de Y» y páginas sin vacíos.
  - Límites de PNG en Android.
  - Paridad con la pantalla y con los motores, e integridad de registros: suertes, fincas, filas y zafras.
- **Sin conexión:** se exportan desde la caché de la PWA el Cronológico múltiple y la Zona.

## R3-2: ajustes del propietario (27-Nov-2026)
- **Mapa del Histórico multifinca:** vuelve a incluirse en el ejecutivo, en el completo y en la PNG, como sección «Mapa de fincas y suertes seleccionadas».
  - **Dibujo:** bloque vectorial `map` del motor, alimentado por las geometrías oficiales de `historicalMapModel`. Funciona sin conexión y no depende de mosaicos.
  - **Polígonos:** relleno tenue del color de cada finca, con contornos finos y tintados, porque las suertes vienen fragmentadas por surcos y un trazo oscuro saturaba el mapa.
  - **Selección parcial:** las suertes no seleccionadas quedan como contexto en gris.
  - **Rótulos:** solo el número de suerte (`01`, `02`, `29A`), sin caja para no tapar los polígonos. Un rótulo se omite si chocaría con otro; en la muestra salen 133 de 146 y el QA exige al menos el 85 %.
  - **Encuadre:** las fincas cercanas comparten un mapa y las lejanas van en mapas separados.
- **Fincas seleccionadas:** fichas con el color de la finca en el mapa, «Nombre · código» y el alcance («Finca completa · N suertes» o «N suertes seleccionadas»). Aparecen en la página 1 y como leyenda del mapa.
- **Zafras del multifinca:**
  - **1 zafra:** «Período 25/26».
  - **2 zafras:** «Período 24/25 a 25/26 · 2 zafras».
  - **Más de 2:** «Período: 5 zafras · 21/22 · 22/23 · 23/24 · 24/25 · 25/26».
  - **Siempre:** «Histórico: 10 zafras · 16/17 a 25/26».
- **«KATM histórico» en todos los gráficos KATM** (finca, suerte, multifinca ejecutivo y completo, y Zona):
  - **Cálculo:** Σ(KATM × toneladas) ÷ Σ toneladas de todas las zafras, el mismo criterio que el KATM ponderado.
  - **Presentación:** se rotula al final de la línea, y las etiquetas de valor llevan fondo blanco.
  - **Multifinca:** usa el KATM del período completo del motor del Histórico.
- **QA:**
  - `qa-informes-r3.cjs` tiene ahora 29 pruebas. Añade los escenarios de 5 y 2 zafras y verifica el mapa, los rótulos solo con número, las fichas, las zafras del período y la línea KATM histórico frente al motor.
  - `qa-informes.cjs` verifica la línea KATM histórico del Histórico de Finca y de Suerte frente a `lotCompact`.
