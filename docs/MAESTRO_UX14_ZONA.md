# UX14: Análisis por Zona (Issue #66, primera etapa)

**Rama:** `claude/ux14-analisis-zona`.
**Base provisional:** la candidata del PR #73 (`7ee4dd3`). La candidata todavía no está integrada en `main`, por eso el PR de UX14 se apila sobre `claude/candidata-ux13-z2627`. Cuando #73 llegue a `main`, se reapunta el PR sin cambiar el código.

No hay cambios en datos, motores, versiones (App 1.6.2 y Producción V1.8.3, candidatas sin publicar), SIAGRI ni `index.html` protegido.

## Alcance implementado

`installZonaUx14()` en `modules/produccion/js/maestro-ux.js`, con estilos en `maestro-ux.css`. Es una capa de presentación encima del Cronológico de zona.

| Requisito | Implementación |
|---|---|
| Cuatro KPI principales | Área activa (con suertes activas: 995 en Total), TCH Z25/26 ejecutado, TCH estimado Z26/27 y Ton. estimadas Z26/27 |
| Indicador complementario | Área de molienda |
| Selector global | Total / Riego / Secano; controla KPI, tabla y ámbito compartido (`window.CASUR_ZONE_SCOPE`) |
| Categorías explícitas | Riego (Gravedad, Goteo, Aspersión, Pivote, Mini-Aspersión), Secano, **Ventana por confirmar** y **Sin dato**. Un valor desconocido nunca se clasifica como Riego. Ventana y Sin dato aparecen como chips consultables solo si tienen registros |
| Composición | Barras apiladas compactas de área activa y toneladas estimadas por sistema, con valor y porcentaje |
| Vista general frente a ficha | General: comparación entre zonas, rotulada «comparación entre zonas». Ficha: gráficos solo de la zona («solo 1-Sur») |
| Ejecutado frente a estimado | Z25/26 (Histórico, toneladas ÷ área cosechada, sin Maquila y por riego **actual** del lote) frente a Z26/27 (AD/AE oficial) |
| Columna P | No se usa. El TCH anterior del aforo sigue disponible en «Ver indicadores anteriores» y en la ficha de suerte |
| Navegación | Zona → Finca (desde la tabla, con GIS y exportadores de la finca) → Suerte; migas «Zonas › zona» |
| Enlaces contextuales | «Estimados Z26/27 de la zona» (explorador con objetivo Estimados y ámbito de zona), «Histórico de la zona» (pestaña Histórico con la zona equivalente) y «Análisis» |
| Zonas solo históricas | 6-TRAPICHES y 7-ZONA TISMA se listan como «solo Histórico». No se inventan datos de Cronológico |
| Metodología | En ayudas «i» (popover), sin textos fijos |
| Indicadores anteriores | Los KPI originales de la zona siguen en el DOM y se muestran con «Ver indicadores anteriores» (incluye edad ponderada y bandas de TCH) |
| Fechas | «Aforo 12-Oct-2026 · Consolidado 22-Nov-2026», con el formateador institucional |
| Precisión | Dos decimales en tablas de detalle (área, TCH y toneladas) |
| Mobile-first | KPI en 2 columnas y tabla en tarjetas a ≤520 px; 4 columnas a ≥900 px |

## Paridad y QA

`tools/qa-maestro-ux14.cjs`: **15/15 PASS**.

- **Total:** 9,574.66 ha activas · 995 suertes · 9,101.68 ha de molienda · 561,658.27 t · 61.71 t/ha · Z25/26 63.94, igual al KPI «TCH última zafra» de Análisis.
- **Paridad por zona y sistema:** las 5 vistas × 5 sistemas coinciden con un cálculo independiente sobre las filas crudas y `lotCompact`.
- **Conciliación:** Riego + Secano + Ventana + Sin dato = Total, y la suma de las zonas = CASUR.
- **Casos verificados:**
  - Secano 1-Sur: 151.03 ha, 24 suertes, 11.30 estimado y 59.61 ejecutado.
  - Ventana 1-Sur: 280.14 ha.
- **Comportamiento:**
  - Vista general frente a ficha.
  - Navegación hacia la finca.
  - Enlaces que conservan el ámbito.
  - Indicadores anteriores accesibles.
  - Formato de fechas.
- **Responsive:** 360, 390, 768, 1280 y 1536 px sin desbordamiento horizontal y sin errores de página.

## UX14-B (26-Nov-2026)

### Histórico de Zona
Nuevo tablero `installZonaHistUx14()` sobre la pestaña Histórico, con la misma estructura del Cronológico de Zona.

| Elemento | Implementación |
|---|---|
| Totales | Motor oficial de zonas (`zoneAnalysis`): asignación finca → zona y última zafra. General = suma de zonas = Análisis (63.94 t/ha · 9,735.96 ha · 622,474 t · KATM 98.65) |
| Riego / Secano / Ventana | Las mismas suertes oficiales de la última zafra (`entity.details`), por **riego actual del lote**. Se rotula siempre: «el Histórico no registra el sistema de cada zafra». Suma = Total |
| KPI | TCH, área cosechada, toneladas y KATM de Z25/26. Franja: TCH histórico, TCH últimas 3, edad prom. y potencial (motor oficial) |
| Tendencia | Líneas por zafra para TCH, área, toneladas y KATM. Total (oficial, línea discontinua gruesa), Riego, Secano y Ventana si existe. La ayuda informa la cobertura mínima de las series por sistema en zafras anteriores |
| Comparación | General: TCH y KATM Riego frente a Secano entre zonas. Ficha: TCH y KATM por sistema, solo la zona |
| Ranking de fincas | Área, TCH, KATM, TCH histórico y Δ frente al histórico; orden por TCH, toneladas, Δ o histórico; navegación a la ficha histórica |
| Zonas solo históricas | 6-TRAPICHES y 7-ZONA TISMA muestran su última zafra (Z19/20 y la de Tisma) y el Total oficial. Sin desglose por sistema, porque el motor no tiene suertes de esas zonas; el filtro del usuario se conserva para las demás |
| Diagnóstico oficial | Se conserva debajo (deltas, variedades, mejores desempeños, prioridad técnica, potencial). Solo se reemplaza su fila de 8 KPI, cuyos datos están en el tablero |

**Diferencia documentada.** El TCH Z25/26 del Cronológico de Zona usa los lotes que el aforo ubica en la zona, para comparar la misma población con el estimado. El Histórico usa la asignación oficial finca → zona. Solo difieren 1-Sur y 2-Centro, porque la finca 2 (San Jerónimo, 189.62 ha) tiene lotes en 1-Sur pero el motor la asigna a 2-Centro. Las ayudas «i» lo explican.

### Cronológico de Zona: refinamiento
- **Sin «Ver indicadores anteriores».** La fila UX13 queda reemplazada:
  - Haciendas y edad ponderada pasan a la franja; la edad usa la misma fórmula y da el mismo resultado.
  - «TCH anterior» (columna P) y las bandas basadas en P no se migran, por la regla de no equiparar P con el ejecutado. En su lugar: «TCH est. Z26/27 < 45» (AD).
- **Tabla de haciendas:** la tabla duplicada «Haciendas con mayor área» se oculta. La tabla UX14 suma **Suertes** y **Dist. pond. km**.
- **Composición agronómica** (riego, tenencia, variedad, textura, destino): visible bajo su propio título.
- **Enlaces con sistema:**
  - Estimados Secano o Ventana: ámbito zona + riego exacto.
  - Estimados Riego: desglose por tipo de riego dentro de la zona.
  - Histórico y Cronológico comparten el sistema seleccionado.
- **Retorno contextual:** al abrir una finca desde Zonas (Cronológico o Histórico), el chip «← Volver a Zona X» devuelve a la misma zona, pestaña y sistema.

### QA
- **UX14:** `tools/qa-maestro-ux14.cjs` **21/21**.
- **UX13-C:** **85/85**, con los 4 controles Z9 migrados al tablero UX14 y la misma intención.

### Exportadores y GIS
Ver `docs/PROPUESTA_EXPORTADOR_ZONA.md`. Requiere modificar `index.html`, que está protegido. Se presenta para autorización previa; no está ejecutado.

## Pendiente dentro de UX14

- **Exportación PDF/PNG del tablero de zona.** No existía antes: el motor de exportación solo cubre las fichas Histórico/Cronológico y las selecciones múltiples. Requiere registrar un nuevo tipo en el motor de `index.html`, que está protegido, así que se propone como cambio autorizado separado.
- **GIS a nivel de zona.** Tampoco existía; hoy se accede al GIS desde la finca.
- **Pestaña Histórico de zona:** resuelta en UX14-B.
