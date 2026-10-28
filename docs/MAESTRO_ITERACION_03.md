# Iteración 03 — matriz de revisión

Base `fd8704e3dc92a47992d86248fab652fd05a710a8`; rama existente y PR #48 Draft. Paquete recibido `CASUR_Iteracion_03.zip`. Se revisaron la especificación completa, los diseños propuestos, referencias aprobadas y HTML autónomo. Los datos ilustrativos no se incorporan al motor.

| Requisito | Estado | Implementación / evidencia / pendiente |
|---|---|---|
| R01 | Implementado | moduleAccess oculto en pantalla, handlers conservados, cinco vistas desde sidebar. |
| R02 | Implementado | Toggle 204/74 px, sesión, tooltip de nombre, reflow; drawer móvil original con Escape/foco. QA recarga y screenshot rail. |
| R03 | Pendiente parcial | SVG en navegación, controles de exportación y KPI General. Restan normalización de iconos heredados en vistas secundarias y diseño específico de PDF/PNG. |
| R04 | Implementado | Tabs de aforo General/Resumen nombradas TCH estimado con zafra efectiva; encabezados General distinguen estimado de anterior. |
| R05 | Implementado | Área / TCH estimado / Toneladas / Consultar fincas, en General y Resumen. Toneladas por zona canónicas. |
| R06 | Implementado | Enter y clic acumulan 99330 + 99336 + 1927, listado abierto y foco conservado; sin ficha automática. |
| R07 | Implementado | Combobox original, metadatos originales, flechas/Enter/Escape, pointerdown evita pérdida de foco, hasta 90 resultados originales; selección cronológica independiente del histórico. |
| R08 | Implementado | Tray con recuento, tokens, quitar, limpiar y aplicar sobre CASUR_CRONO_SELECTION; sin SelectionSet paralelo. |
| R09 | Pendiente parcial | General con banner, cinco KPI originales, participación, cuatro paneles originales, variedad y toneladas. Falta mayor fidelidad de diagramación/donut respecto del diseño propuesto; no se declara identidad visual final. |
| R10 | Pendiente parcial | Finca contextual con seis KPI originales (incluida distancia), breadcrumb, participación, tabs, tabla original y mapa inline. Estimados funcional pero aún necesita tablero gráfico más elaborado y CTA contextual de selección dentro del banner. |
| R11 | Implementado | Fuente efectiva y agregadores originales; getLotGeometries + createCasurMap para finca; se conserva 99336 y sus ocho zafras. |
| R12 | Implementado | CASUR principal sin modificar; marca secundaria existente intacta. |
| R13 | Pendiente parcial | Tooltips ricos individuales conservados; barras General disponen de título/foco y metadatos originales. Falta tooltip rico común con tarjeta táctil para todas las barras. |
| R14 | Implementado | Resumen mantiene cuatro KPI y síntesis; General conserva cinco KPI y detalle operativo; tarjetas redundantes ocultas. |
| R15 | Implementado | QA 1536/1440/1280/768/390/360 en General/Finca/Suerte sin overflow; rail persiste; cabecera no sticky de iteración 02 conservada. |
| R16 | Implementado | Adaptadores existentes, ningún cambio a motores/index base/datasets/SW productivo; nodos originales conservados. |
| R17 | Pendiente parcial | Fotografía WebP de campo extraída del HTML autorizado (85,226 bytes), sin insertar mockup. Fidelidad de gráficos/espacios todavía requiere revisión visual. |
| R18 | Implementado | Suite nueva de multi/rail/18 layouts/GIS real; 14 grupos de regresión con multifinca 25+993, 99336, 494, semilla/molienda, PDF/PNG, PWA offline y recuperación; 399 tests estáticos. |
| R19 | Implementado al verificar entrega | Preview del SHA final en proyecto existente, adaptación SW solo en artefacto y metadata comprobada. PR sigue Draft. |

## Pruebas y límites

`tools/qa-maestro-iteration03.cjs EVIDENCIA [URL]` comprueba Enter/clic/Escape, chips, retiro, tres fincas/suertes, persistencia de rail por recarga, 18 layouts, tabla de 18 columnas y geometría real de finca. Pansaco: 368.44 ha, 66.23 TCH anterior, 48.57 estimado, 17,452.08 t y 7.55 km conservados. Edad calculada (9.80 meses en la consulta); catálogo finca 49 incluye registros no activos, activos 42 = molienda 40 + semilla 2.

Regresión `qa-maestro-ux.cjs`, puerto configurable 4384: 14 grupos PASS. Tests Shell/GEO 95, Producción 212, TCH 92 PASS. Guardas de integridad, contexto y manifiesto PASS. No se modifican datos de usuario para QA. Tiles pueden fallar: geometrías permanecen con fallback original. Móvil emulado, no aprobación en teléfono físico.

Evidencias externas: `C:/Users/ctije/AppData/Local/CASUR/QA/iteracion03/`. Capturas General/Finca/Suerte a seis anchos, rail y multiselección, JSON de QA. El paquete de comparación incluye diseños propuestos y capturas reales, identificadas por separado.

La candidata es funcional y auditable; los requisitos marcados pendientes parciales no se presentan como terminados. Histórico no se rediseña en esta iteración. Sin merge, sin main ni producción.
