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

## Pendiente dentro de UX14

- **Exportación PDF/PNG del tablero de zona.** No existía antes: el motor de exportación solo cubre las fichas Histórico/Cronológico y las selecciones múltiples. Requiere registrar un nuevo tipo en el motor de `index.html`, que está protegido, así que se propone como cambio autorizado separado.
- **GIS a nivel de zona.** Tampoco existía; hoy se accede al GIS desde la finca.
- **Pestaña Histórico de zona.** Mantiene su presentación actual; la segmentación por sistema queda para el siguiente incremento.
