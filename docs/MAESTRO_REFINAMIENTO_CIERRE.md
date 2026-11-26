# UX15-R: refinamiento y cierre del Maestro de Suertes

**Fecha:** 26-Nov-2026.
**Rama:** `claude/ux15-analisis` (PR #77, Draft), apilada sobre #76 y la candidata #73.

Es una iteración consolidada de refinamiento: mejora la estructura, la presentación y la utilidad de lo que ya existe, sin ampliar el alcance.

**Sin cambios en:** datos (generación 1102), motores, `index.html`, versiones, SIAGRI, exportadores ni fechas oficiales (aforo 12-Oct-2026 y consolidación 22-Nov-2026, leídas siempre de los metadatos).

Archivos modificados: `modules/produccion/js/maestro-ux.js` y `modules/produccion/css/maestro-ux.css`.

## Correcciones obligatorias

| Corrección | Resultado |
|---|---|
| Eliminar el simulador de recuperación productiva | Se retiró el panel «Recuperación» de Análisis · Decisiones, con su Δ t por finca. Queda registrado en #75 que no se implementan simuladores, escenarios hipotéticos ni la descomposición de variaciones. |
| «Ventana · por confirmar» → «Ventana» | Cambiado en la interfaz, los gráficos, los filtros, las tablas, los exportadores (que clonan la interfaz) y la documentación funcional. El dato de origen no se reclasifica: `ventana` en `tipoRiego` sigue siendo Ventana. |
| Selectores Total, Riego, Secano y Ventana unificados | `systemSeg()` es un único control para Zonas (Cronológico e Histórico), Análisis y Estimados: mismo estilo y mismo orden. Ventana y Sin dato aparecen solo si tienen registros. La elección se comparte entre las vistas mediante `CASUR_ZONE_SCOPE`, en ambos sentidos. |

## Zonas

- **Selector de zona y «Analizar zona»:** compactos, en una sola línea de 40 px. Lo mismo en el Histórico.
- **Encabezado:**
  - Una línea con la zona, «← Todas las zonas» y Exportar.
  - Se quitaron las migas y la línea de fechas repetida; las fechas siguen en el KPI, el informe y el encabezado de la app.
  - La metodología Riego/Secano pasa a un «i» junto al selector.
- **KPI:** se mantienen los cuatro. Los indicadores complementarios usan la misma retícula de 4 columnas (2 en teléfono), con la etiqueta arriba y el valor abajo.
- **Composiciones de área y toneladas:** una fila por sistema con muestra, nombre, valor y %, todos alineados en columnas.
- **Gráfico consolidado de TCH:** los dos gráficos («Estimado Riego vs Secano» y «Ejecutado Riego vs Secano») se reemplazan por uno solo, TCH Z25/26 ejecutado frente a Z26/27 estimado, con su Δ.
  - **Todas las zonas:** una barra por zona, para el sistema elegido.
  - **Una zona:** Total y cada sistema.
  - **Colores:** ejecutado pizarra y estimado azul, iguales a los acentos de los KPI.
- **Tabla de zonas:** reemplaza la lista. Columnas: área activa, TCH Z25/26, TCH estimado, Δ TCH y toneladas estimadas. Las zonas solo históricas quedan rotuladas.
- **Tabla de haciendas:** se agregan la columna Δ TCH (estimado − ejecutado) y un selector de orden: área, toneladas, TCH estimado, TCH ejecutado o Δ.
- **Recuadros anteriores:** en la vista general se ocultan «Área por zona» y «TCH estimado por zona», porque sus datos ya están en la tabla y el gráfico. Los demás se conservan bajo «Indicadores del aforo por zona». En una zona el título es «Composición agronómica · zona».
- **Metodología y paridad:** sin cambios. El QA de UX14 compara cada barra y cada fila con `CASUR_ZONE_UX14.figures`.

## Estimados Z26/27, sobre el explorador existente

No hay vista, motor ni familias nuevas. Todo vive en el objetivo «Estimados» del Cronológico General.

| Mejora | Detalle |
|---|---|
| KPI principales | Área con estimado, toneladas, TCH y suertes (AD/AE oficial), presentados como tarjetas. |
| Comparación con Z25/26 | TCH y toneladas Z25/26 de las **mismas suertes activas del ámbito** (Histórico por código de lote, sin Maquila), con Δ TCH y Δ toneladas. Se rotula como diferencia entre aforo y ejecutado, no como pérdida observada. |
| Composición por zona | Tabla con área, toneladas, **% de toneladas**, TCH estimado, **TCH Z25/26** y **Δ TCH**. El TOTAL sale del motor. En teléfono, una línea de métricas por fila. |
| Distribución | Nueva dimensión «Sistema productivo»; «Riego» pasa a llamarse «Tipo de riego». Variedad, tipo de suelo y N.º de cortes ya existían. |
| Selector de sistema | El mismo control que Zonas y Análisis. Es el ámbito «sistema» del explorador y no se repite como miga. |
| Ranking configurable | Orden por toneladas, TCH estimado, área, TCH Z25/26 o Δ TCH. Se muestran 10, 20 o todas. |
| Plan mensual de cosecha | Nuevo modo «Plan de cosecha». Por mes (BE): suertes, área, toneladas oficiales, % t, mecánico/manual (BF) y edad al BE. Tocar un mes abre sus suertes. Rotulado como plan, no aforo. |
| Navegación Zona → Finca → Suerte | Ruta visible «Zonas › zona › Fincas». Desde la finca se abren sus suertes y, de ahí, la ficha de la suerte. |
| Acceso directo | «Estimados Z26/27» en la navegación, debajo de Cronológico. Abre el mismo objetivo con el sistema vigente y queda resaltado. |
| Escenarios | El optimista AF/AG sigue cerrado y separado. La comparación usa solo el oficial AD/AE. |

**Diferencia de población con Zonas:**
- **Zonas** muestra el TCH Z25/26 de los lotes que el Histórico ubica en la zona (sin cambios).
- **Estimados** compara las mismas suertes del aforo.
- En 2-Centro, por ejemplo, son 61.13 frente a 60.66. La nota de Estimados lo explica.

## Análisis

- **Selector de sistema:** está en la barra de familias y solo se muestra en Resumen y Desempeño, las familias que filtra. Los paneles ejecutivos anteriores son Total CASUR.
- **Decisiones:** sin el panel de recuperación; quedan los cuatro paneles existentes.
- **Coherencia:** el sistema es el mismo en Análisis, Zonas y Estimados.

## QA

| Prueba | Resultado |
|---|---|
| `tools/qa-maestro-estimados.cjs` (nueva) | Ver PR #77 |
| `tools/qa-maestro-ux14.cjs` | 23/23 |
| `tools/qa-maestro-ux15.cjs` | 15/15 |

**Adaptaciones de pruebas** (no se eliminó ninguna verificación de cifras):
- La ruptura de «Ventana · por confirmar» y los chips pasan a «Ventana» en el selector único.
- Los dos gráficos pasan a uno, con paridad barra por barra.
- La lista de zonas pasa a tabla, con paridad por fila.
- Las migas pasan a «← Todas las zonas».
- Las pruebas de «Recuperación» se reemplazan por la verificación de que no existe y por la coherencia de filtros.

## Fuera de alcance

GIS de Zona, integración con el módulo de Riego, exportación PDF/PNG de Análisis y de Estimados (requiere cambiar `index.html`), merge y producción.

## UX15-R2: correcciones finales (26-Nov-2026)

Instrucción del propietario: retirar las clasificaciones artificiales y el acceso lateral. No se crea otro submódulo, motor, clasificación ni simulador.

| Corrección | Resultado |
|---|---|
| Menú lateral | Se retira «Estimados Z26/27». El menú vuelve a Resumen, Cronológico, Histórico, Zonas y Análisis. |
| Resumen › Consultas | Tercera tarjeta «Estimados Z26/27», junto a Cronológico e Histórico. Abre la función Estimados existente dentro del Cronológico (`openEstimatesShortcut`), sin ámbito adicional. |
| Selector Total / Riego / Secano / Ventana | Retirado de Estimados, Zonas (Cronológico e Histórico) y Análisis. |
| Dimensión «Sistema productivo» | Eliminada. Estimados conserva solo «Tipo de riego» con los valores de la fuente: Gravedad, Goteo, Aspersion, Mini-Aspersion, Pivote, Ventana y Secano. |
| Zonas y Análisis | Las composiciones, el gráfico TCH ejecutado vs estimado (por zona o por tipo de riego) y las tendencias usan el **tipo de riego original** del lote, ordenado por área. No hay agrupaciones Riego / Secano. Los KPI, tablas y rankings son Total CASUR. |
| Rótulo de cortes | «# de cortes (rangos)» en lugar de «N.º de cortes (rangos)». |

**Detalles de presentación:**
- **Colores:** cada tipo de riego tiene un color fijo de la paleta Petróleo; Secano y Ventana conservan el que tenían.
- **Muestras de color:** se generan como `.ux14-stack span` con estilo en línea, el único estilo que el exportador de Zona conserva.
- **Tendencias:** muestran el Total más los tipos de riego con al menos el 5 % del área de la última zafra, por legibilidad.
- **Exportador de Zona:** el nombre del archivo y el encabezado ya no incluyen «Sistema»; ahora son «Zona 3-Norte».
- **Recuadro anterior «Área por riego»:** se oculta en Zonas, porque la composición por tipo de riego lo reemplaza con los mismos datos.

**QA:**
- **Pruebas adaptadas:** UX14, UX15, Estimados y UX13-C ahora verifican que no existan selectores ni «Sistema productivo».
- **Paridad:** se compara cada tipo de riego original con un cálculo independiente.

**Exportadores:** ver `docs/AUDITORIA_EXPORTADORES.md` (diagnóstico) y `docs/PROPUESTA_REDISENO_INFORMES.md` (propuesta pendiente de autorización).
