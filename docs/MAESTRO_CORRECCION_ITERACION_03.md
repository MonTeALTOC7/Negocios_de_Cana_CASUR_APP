# Corrección de Iteración 03 — candidata para revisión visual

Base auditada: `44a4a9518b9a541da7f0f2a85729be0b8310418a`. PR #48, rama `codex/maestro-ux-premium-fase1`.
La revisión anterior fue rechazada visualmente. Este informe sustituye R05 y los pendientes parciales del informe anterior; no supone aprobación estética del usuario.

Se leyó la instrucción adjunta completa y el comentario `issuecomment-6481572053`. Se contrastaron las cuatro referencias PNG, el HTML autónomo y las capturas reales anteriores. No se incorporaron cifras ilustrativas del prototipo.

| Discrepancia / referencia | Antes | Después | Estado |
|---|---|---|---|
| Subpestañas General y Resumen | TCH y toneladas separados | Área y distribución / Estimados de la zafra / Consultar fincas | Corregido |
| Estimados integrados | Párrafos para toneladas, métricas separadas | Área válida, toneladas, TCH ponderado, suertes elegibles, cobertura y denominador juntos | Corregido |
| Exploración de aforo | Paneles incompletos | Selector zona/riego/variedad/corte; barras, valores, tabla y consulta de suertes | Corregido |
| Síntesis gerencial | Repetición de paneles | Resumen de tres distribuciones; estimados sintetizados, acceso al tablero operativo completo | Corregido |
| Estimados de finca | Una frase | Tablero completo; Pansaco inicia por variedad; agrupaciones canónicas | Corregido |
| Desglose agronómico | Barras diminutas y huecos | Escala sobre área activa total, unidades, porcentajes, suertes; categorías únicas al 100%; variedad desplegable | Corregido |
| Navegación redundante | Atajos de scroll y fin del análisis | Ocultos en presentación; General, retorno a finca y cambio de consulta en contexto | Corregido; handlers conservados |
| Sidebar | Tarjeta «Contraer panel» | Botón SVG compacto, nombre accesible, tooltip, persistencia y transición con reduced-motion | Corregido |
| Iconos principales | Iconos repetidos | SVG específicos de agua, superficies, toneladas, rendimientos, mapa, PDF, imagen y pestañas | Corregido en los componentes de esta entrega; vistas heredadas fuera del rediseño conservadas |
| Tooltips analíticos | title nativo | Tarjeta con métricas, fuente y denominador; hover, foco, clic/toque y Escape | Corregido |
| Selección múltiple | Funcional | Mismo estado y handlers; 99330 + 99336 + 1927, retirar y continuar | Conservado y verificado |
| Banner / marcas | Fotografía desigual | Resumen, General y Finca usan paisaje suministrado; logo CASUR y marca secundaria originales | Corregido; recorte responsive distinto de la imagen estática |
| GIS | Motor oficial | Geometrías y fallback originales; panel equilibrado y pestaña propia | Conservado |
| Ficha 99336 | Motor e histórico reales | Gráfico original, ocho zafras, tooltips, información, 18 columnas y mapa | Conservado |
| Fidelidad final | No aprobada | Capturas completas de cada panel y comparación antes/después | Pendiente de evaluación visual del usuario |

## Contrato numérico y límites

Los widgets consultan `CASUR_CRONO_PARTICIPATION.summary`, `agronomicGroups` y `cropStage`. No agregan un motor, dataset ni SelectionSet. El listado contextual utiliza las categorías del motor y excluye registros sin área activa; abrir una suerte llama al handler original, respetando el modo múltiple.

General: 995 activas, 948 molienda, 47 semilla; 9574.66 / 9115.65 / 459.01 ha; 563187.97 t y 61.78 TCH. Pansaco: 368.44 ha activas, 359.30 ha válidas, 17452.08 t, 48.57 TCH, 40 suertes estimadas, 42 activas, catálogo 49. Las agrupaciones de destino registrado pueden diferir de la participación operativa: se identifican como tales y no sustituyen el denominador de molienda.

Las barras de área usan el total activo del ámbito; las de toneladas usan el máximo del grupo como escala visual. No existe promedio aritmético de TCH. Los grupos se concilian con los totales respetando el redondeo a dos decimales del motor. Las cifras ausentes se muestran N/D. El área del anillo se presenta con dos decimales.

Los nodos analíticos originales permanecen disponibles para los exportadores y se ocultan exclusivamente en pantalla. Los widgets nuevos están excluidos de exportación. Los mapas y generadores no se modifican. Las tablas completas conservan scroll horizontal; el directorio completo permite filtrar fincas y zonas. No se alteran permisos, guardias ni almacenamiento personal.

## Evidencia reproducible

- `tools/qa-maestro-correction03.cjs DIRECTORIO [URL_MODULO]`: 12 paneles × 5 anchos (1536/1280/768/390/360), capturas completas 1536/390, cuatro agrupaciones con conciliación, tooltips, diálogo de suertes, selección múltiple y rail. Comprueba además una columna en desglose móvil.
- `tools/qa-maestro-ux.cjs`: 14 grupos de regresión antes/después contra main: mapas reales, PDF/PNG individual y finca, PDF ejecutivo/completo y PNG histórico, selección histórica, PWA offline/recarga, contextos separados e IndexedDB sin mutaciones. Puertos configurables `CASUR_BASELINE_PORT` y `CASUR_QA_PORT`; no modifica la rama main.
- Tests estáticos: Shell/GEO 95, Producción 212, TCH 92; todos PASS. Integridad productiva, runtime, contexto y versiones PASS.
- La prueba anterior de Iteración 03 y las de fidelidad/Iteración 02 se ajustan al contrato vigente de tres pestañas y a los selectores de widgets; se preservan las aserciones numéricas.
- Evidencia externa: `C:/Users/ctije/AppData/Local/CASUR/QA/correccion03/`. `before/`: capturas del SHA base; `local/`: candidata; `public/`: HEAD final servido por HTTPS. El archivo de entrega incluye las referencias aprobadas, comparador y JSON de resultados.

## Publicación y diferencias pendientes

Solo preview de la rama en `casur-maestro-ux-review`. Paquete desde SHA completo; adaptación de respuesta redirigida del SW exclusivamente en el artefacto, sin cambios al SW fuente, integridad, datos oficiales ni producción. SHA real en `__preview.json`; hashes externos de todos los archivos. URL y resultado de verificación final acompañan la entrega externa para evitar un commit circular por insertar su propio SHA.

Esta candidata no afirma identidad píxel a píxel: conserva seis KPI originales en finca y suerte, en lugar de eliminar indicadores para copiar los cinco ilustrativos. Mantiene el SVG histórico y las geometrías oficiales, aunque sus proporciones y trazados difieran del diseño conceptual. Los mosaicos satelitales dependen del proveedor; se verifican polígonos y fallback incluso sin mosaicos. Móvil se verifica mediante emulación Chromium, no en un dispositivo físico. La validación estética final corresponde al usuario.

Sin merge, sin cambios a main y sin publicación productiva.
