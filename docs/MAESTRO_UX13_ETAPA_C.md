# UX13 · Etapa C — Pulido de Histórico, Cronológico de finca y Zona

Issue: #65 · PR apilado sobre la Etapa B (`claude/ux13-historico-finca-suerte-etapa-b` @ `34ca9629f6cabc7399538641d476f5fb0a127b81`).
Rama: `claude/ux13c-historico-crono-zona-pulido`.

## Alcance

Solo presentación en `modules/produccion/js/maestro-ux.js` y `modules/produccion/css/maestro-ux.css`, más la QA
`tools/qa-maestro-ux13-c.cjs` y ajustes documentados de `tools/qa-maestro-ux13-b.cjs`.

Sin cambios en `index.html` del módulo, `historical-engine.js`, `casur-enhancements.js`, `data/*`, `shared/geo/*`,
exportadores ni Service Worker (solo `RELEASE_ID` derivado). No se rediseña Análisis por Zona ni se tocan fechas de cosecha.

## Histórico de finca (H1–H6)

| | Etapa B | Etapa C |
|---|---|---|
| H1 Cabecera | Estado + Mapa + Exportar con espacio vacío | Rejilla compacta: nombre \| Exportar; código y estado debajo. Solo **Exportar** (PDF/PNG originales) |
| H1 Mapa | Botón en la cabecera | Tarjeta compacta «Mapa · Finca completa» **tras el gráfico y antes de la tabla**; acciona el botón GIS original (mismo manejador, carga diferida y capa) |
| H2 Área | «ÁREA COSECHADA PROMEDIO 360.91 ha/zafra» + «Acumulado del período…» | **«Área por zafra · 360.91 ha»**; la «i» muestra «Promedio del área cosechada en cada zafra del período» y el acumulado original |
| H3 Edad | «EDAD PONDERADA» + subtítulo | **«Edad»**; mismo valor ponderado |
| H3 Rejilla | Alturas distintas | 4 KPI (TCH, KATM, Área por zafra, Edad) solo con etiqueta y valor: alturas iguales, 2×2 en móvil y 4 columnas en PC |
| H4 Ayudas | Enlace «¿Cómo se calculan?» | Retirado. Una sola «i», en Área por zafra (Distancia ya dice «actual» en su etiqueta y leyenda) |
| H5 Otros indicadores | Bloque siempre visible | `details` **cerrado al inicio** en móvil y PC; conserva estado al cambiar período y advertencias legítimas |
| H6 Gráfico | Párrafo «Serie completa; …» | Retirado; leyenda, referencia ponderada y selección intactas. También se oculta en pantalla «Una fila por zafra…» de la tabla |

Las etiquetas nuevas son una capa de presentación (`.no-print/.export-excluded`). La etiqueta, el valor y la leyenda
originales siguen en el DOM para los exportadores, y el valor de presentación va después del original.

## Cronológico de finca (C7–C8)

- **C7:** cada variable se ofrece según la disponibilidad del dato, no su diversidad. Riego y Tipo de suelo aparecen con una sola categoría (Pansaco: Gravedad 100 %). Una variable sin ningún valor clasificado se lista deshabilitada como «Riego · sin dato» y nunca se muestra como 0. En los datos actuales ninguna finca con área activa carece de clasificación; ese caso se prueba con una simulación en memoria.
- **C8:** en Estimados cada cifra aparece una vez.
  - **PC:** área y toneladas van en columnas; la nota dice «40 suertes».
  - **Teléfono:** una línea «359.30 ha · 40 suertes · 17,452.08 t».
  - **Área estimada distinta de la activa:** se explicita: «7.10 de 16.24 ha …» en el teléfono y «4 suertes · 16.24 ha activas» en PC, con el motivo real («incluye semilla 9.14 ha» / «x ha sin estimado»).
  - **Semilla:** «9.14 ha activas · 2 suertes» con «No aplica».

## Zona (Z9)

### Auditoría de origen (verificado)

| Punto | Resultado |
|---|---|
| Fuente | El IIFE de Zona usa `C = window.CRONO_DATA`, el mismo objeto efectivo que el Cronológico General. Al aplicar una generación oficial o local, `CRONO_DATA` se reemplaza en sitio y `window.__CRONO_ZONE_ROWS` se anula, así que la siguiente consulta usa la generación vigente. **Verificado.** |
| Generación en QA | `2026.10.25-aforo.1101` (cabecera «Cron 12-oct-2026»). Esta etapa **no** actualiza datos ni el plan de cosecha. |
| Área activa 5-Productores | 1,650.93 ha = grupo «zona» del motor en el General. **Verificado** en la QA. |
| TCH estimado / Toneladas 5-Productores | 57.84 / 91,619.90 t = `CASUR_CRONO_PARTICIPATION.summary()` de sus filas. **Verificado.** |
| Riego / Secano | 1,145.09 + 505.84 = 1,650.93 ha; se mantienen como KPI separados. **Verificado.** |
| TCH anterior | 64.08 sale del renderer original (área × TCH 25/26 de `CRONO_DATA`). Coincide con «Zonas por mayor TCH»; no hay otra fuente accesible para contrastarlo: **no verificado externamente**. |
| Defecto preexistente | La vista Zona abierta **no** se repintaba al cambiar la generación efectiva (KPI obsoletos hasta pulsar «Analizar zona»). **Corregido**: el adaptador repinta la misma zona al recibir `casur-crono-effective-change`. |

### Presentación

- **Primer nivel:** quedan Área activa, TCH anterior, TCH estimado Z26/27 y Toneladas estimadas. Se retiran Suertes activas y Haciendas; sus conteos siguen en la tabla «Haciendas con mayor área» y en el Cronológico.
- **Subtítulos retirados:** «Referencia · área activa», «Área estimada × TCH», el nombre de la zona repetido y la cobertura cuando es completa (N/N · 100 %). Una cobertura parcial se mantiene y se resalta.
- **Textos retirados:** «Deslizá para ver más secciones →», «Participación sobre …» y «El porcentaje indica …».
- **Corrección de recortes:** las cajas de barras recortaban valores en PC («77.9…», «563,187.97 t» cortado en B) y a 360 px. Ahora se reparten según el ancho real; la tabla de haciendas conserva su desplazamiento horizontal interno.

## Paridad y QA

- **Paridad B → C** (en `qa-maestro-ux13-c.cjs`), sin ninguna diferencia real; solo cambia la representación en pantalla («ha/zafra» → «ha» bajo «Área por zafra»):
  - Histórico 10, 993 y LOTE::99301 × Última / Últimas 3 / Todas: nodos originales idénticos (KPI, leyendas, comparadores y tabla).
  - Cronológico 993, 10 y 908: `summary()` y grupos del motor para las 5 variables, idénticos.
  - Zona general, 5-Productores y 1-Sur: todas las cifras KPI (visibles y ocultas) y barras, idénticas.
- **Exportación:** PNG del Histórico (10 y 993, Últimas 3) idéntico píxel a píxel B → C.
- **Pruebas nuevas:** `qa-maestro-ux13-c.cjs` = 9 paridad + 20 casos × 5 anchos. Contra B fallan los casos nuevos (H1–H6, C7–C8, Z9).
- **QA A y B:** la QA B se ajustó de forma legítima porque Mapa se movió, «Otros indicadores» está plegado y «¿Cómo se calculan?» pasó a «i». Las comprobaciones aceptan ambos diseños y no se relaja ningún umbral.
- Resultados por SHA en el paquete de evidencias y en el PR.

## Versionado

A, B y C no están publicadas. Se mantienen las candidatas **App 1.6.2 / Producción V1.8.3** y solo se regenera el manifiesto offline.

Si se liberan juntas, conviene un PR consolidado contra `main` con el Release Gate real de PR, que sí ejecuta `check-release-policy`.
En las ramas apiladas el Gate se ejecuta por `workflow_dispatch`, que omite ese paso; contra `main` se ejecutó en local.

## Límites de la evidencia

Chromium headless (Playwright) sobre `tools/serve-maestro-preview.mjs` local; sin Brave ni dispositivo físico.
La preview HTTPS aislada la publicará el supervisor.
